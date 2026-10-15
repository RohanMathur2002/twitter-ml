import { transaction, query } from "@/lib/db";
import { searchNitterTweets, parseNitterDate, type NitterTweet } from "@/services/nitterService";
import { processTweet } from "@/services/tweetParser";
import { upsertTweets, triggerAsyncEmbeddingGeneration } from "@/services/tweetService";
import { refreshHashtagStats } from "@/services/hashtagService";

export interface KeywordJobStatus {
  jobId: string;
  keyword: string;
  status: "running" | "stopped" | "completed" | "error";
  fetchedCount: number;
  targetCount: number;
  message: string;
  error?: string;
  startedAt: string;
  finishedAt?: string;
  tweets?: NitterTweet[];
}

const activeKeywordJobs = new Map<string, {
  jobId: string;
  keyword: string;
  status: "running" | "stopped" | "completed" | "error";
  fetchedCount: number;
  targetCount: number;
  message: string;
  error?: string;
  stopped: boolean;
  startedAt: string;
  finishedAt?: string;
  tweets: NitterTweet[];
}>();

async function ensureMinimalProfile(
  client: any,
  username: string,
  fullname: string,
  avatar: string
): Promise<number> {
  const cleanUsername = username.replace("@", "").toLowerCase().trim() || "unknown";
  const res = await client.query(
    `
      INSERT INTO profiles (username, display_name, profile_image_url, scraped_at)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (lower(username)) DO UPDATE SET
        display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
        profile_image_url = COALESCE(EXCLUDED.profile_image_url, profiles.profile_image_url),
        scraped_at = now()
      RETURNING id
    `,
    [cleanUsername, fullname || cleanUsername, avatar || null]
  );
  return Number(res.rows[0].id);
}

export function getKeywordNitterJobStatus(jobId: string): KeywordJobStatus | null {
  const job = activeKeywordJobs.get(jobId);
  if (!job) return null;
  return {
    jobId: job.jobId,
    keyword: job.keyword,
    status: job.status,
    fetchedCount: job.fetchedCount,
    targetCount: job.targetCount,
    message: job.message,
    error: job.error,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    tweets: job.tweets,
  };
}

export function stopKeywordNitterIngestion(jobId: string): boolean {
  const job = activeKeywordJobs.get(jobId);
  if (!job) return false;
  job.stopped = true;
  job.status = "stopped";
  job.message = `Search stopped by user after collecting ${job.fetchedCount} results.`;
  job.finishedAt = new Date().toISOString();
  return true;
}

export async function startKeywordNitterIngestion(
  jobId: string,
  keyword: string,
  options?: {
    daysLimit?: number;
    sinceDate?: string;
    untilDate?: string;
    maxResults?: number;
    saveToDb?: boolean;
  }
): Promise<void> {
  const targetCount = options?.maxResults || 250;
  const saveToDb = options?.saveToDb !== false;
  const job: {
    jobId: string;
    keyword: string;
    status: "running" | "stopped" | "completed" | "error";
    fetchedCount: number;
    targetCount: number;
    message: string;
    error?: string;
    stopped: boolean;
    startedAt: string;
    finishedAt?: string;
    tweets: NitterTweet[];
  } = {
    jobId,
    keyword,
    status: "running",
    fetchedCount: 0,
    targetCount,
    message: `Initializing Nitter search for "${keyword}"...`,
    stopped: false,
    startedAt: new Date().toISOString(),
    tweets: [],
  };
  activeKeywordJobs.set(jobId, job);

  // Calculate sinceDate if daysLimit provided
  let computedSinceDate = options?.sinceDate;
  if (options?.daysLimit && options.daysLimit > 0 && !computedSinceDate) {
    const d = new Date(Date.now() - options.daysLimit * 24 * 60 * 60 * 1000);
    computedSinceDate = d.toISOString().split("T")[0];
  }

  const computedUntilDate = options?.untilDate;

  try {
    let cursor: string | null = null;
    let page = 0;
    const maxPages = Math.ceil(targetCount / 15) + 5;

    while (page < maxPages && job.fetchedCount < targetCount) {
      if (job.stopped) {
        console.log(`[KeywordIngest] Job ${jobId} stopped by user.`);
        break;
      }

      page++;
      job.message = `Searching Nitter page ${page} (${job.fetchedCount}/${targetCount} tweets fetched)...`;

      let searchResult: { tweets: NitterTweet[]; cursor: string | null };
      try {
        searchResult = await searchNitterTweets(
          keyword,
          cursor,
          computedSinceDate,
          computedUntilDate
        );
      } catch (searchErr) {
        if (page === 1) {
          throw searchErr;
        }
        console.warn(`[KeywordIngest] Error on page ${page}:`, searchErr);
        break;
      }

      if (job.stopped) break;

      const { tweets, cursor: nextCursor } = searchResult;
      if (!tweets || tweets.length === 0) {
        console.log(`[KeywordIngest] Page ${page} returned 0 tweets. Finishing search.`);
        break;
      }

      // Store in memory for live/completion display (deduplicated by ID)
      const existingIds = new Set(job.tweets.map((t) => t.id));
      const newUniqueTweets = tweets.filter((t) => !existingIds.has(t.id));
      const remainingSpace = targetCount - job.tweets.length;
      if (remainingSpace > 0 && newUniqueTweets.length > 0) {
        job.tweets.push(...newUniqueTweets.slice(0, remainingSpace));
      }

      if (saveToDb) {
        const tweetsByUser = new Map<string, { fullname: string; avatar: string; tweets: NitterTweet[] }>();
        for (const t of tweets) {
          const u = t.username || "unknown";
          if (!tweetsByUser.has(u)) {
            tweetsByUser.set(u, {
              fullname: t.fullname || u,
              avatar: t.avatar || "",
              tweets: [],
            });
          }
          tweetsByUser.get(u)!.tweets.push(t);
        }

        await transaction(async (client) => {
          for (const [uname, udata] of tweetsByUser.entries()) {
            const profileId = await ensureMinimalProfile(client, uname, udata.fullname, udata.avatar);
            const processed = udata.tweets.map(processTweet);
            await upsertTweets(client, profileId, processed);
            await refreshHashtagStats(client, profileId, processed);
            
            // Link tweets to the keyword search
            if (processed.length > 0) {
              const values: any[] = [];
              const placeholders: string[] = [];
              processed.forEach((t, i) => {
                placeholders.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
                values.push(t.id, keyword);
              });
              await client.query(`
                INSERT INTO tweet_keywords (tweet_id, keyword) 
                VALUES ${placeholders.join(", ")}
                ON CONFLICT DO NOTHING
              `, values);
            }
          }
        });

        // Trigger ML embeddings for all processed tweets after the transaction commits
        const allProcessed = Array.from(tweetsByUser.values()).flatMap(u => u.tweets.map(processTweet));
        if (allProcessed.length > 0) {
          triggerAsyncEmbeddingGeneration(allProcessed).catch((err: unknown) => {
            console.warn(`[TweetService] Failed to trigger async embedding generation: ${err instanceof Error ? err.message : String(err)}`);
          });
        }
      }

      job.fetchedCount = Math.min(targetCount, job.fetchedCount + tweets.length);
      job.message = saveToDb
        ? `Successfully ingested ${job.fetchedCount} tweets matching "${keyword}".`
        : `Fetched ${job.fetchedCount} tweets matching "${keyword}" (DB save skipped).`;

      if (!nextCursor || nextCursor === cursor || job.fetchedCount >= targetCount) {
        break;
      }

      cursor = nextCursor;
      await new Promise((r) => setTimeout(r, 1200));
    }

    if (!job.stopped) {
      job.status = "completed";
      job.message = saveToDb
        ? `Completed Nitter search! Collected ${job.fetchedCount} tweets matching "${keyword}".`
        : `Completed Nitter search! Fetched ${job.fetchedCount} tweets matching "${keyword}" (Not saved to DB).`;
      job.finishedAt = new Date().toISOString();
    }
  } catch (error) {
    if (!job.stopped) {
      job.status = "error";
      job.error = error instanceof Error ? error.message : String(error);
      job.message = `Error searching Nitter: ${job.error}`;
      job.finishedAt = new Date().toISOString();
    }
  }
}
