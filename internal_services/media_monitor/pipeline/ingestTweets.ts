import { transaction, query } from "@/lib/db";
import { refreshProfileAnalysis } from "@/services/analysisService";
import { queueClusteringForProfile } from "@/services/clusteringService";
import { fetchRecentUserTweets, runIntelligentArchivalSearch, parseNitterDate, type NitterTweet } from "@/services/nitterService";
import { upsertProfile } from "@/services/profileService";
import { refreshHashtagStats } from "@/services/hashtagService";
import { processTweet } from "@/services/tweetParser";
import { upsertTweets, getTweetStatsForProfile, triggerAsyncEmbeddingGeneration } from "@/services/tweetService";
import {
  calculatePhaseOneTargetMs,
  createScrapeExecutionPlan,
  estimateArchivalRequestCount,
  ScrapeRequestScheduler,
} from "@/services/scrapeScheduler";

const globalForControllers = globalThis as unknown as {
  activeIngestControllers: Map<string, AbortController> | undefined;
};

export const activeIngestControllers =
  globalForControllers.activeIngestControllers ?? new Map<string, AbortController>();

if (process.env.NODE_ENV !== "production") {
  globalForControllers.activeIngestControllers = activeIngestControllers;
}

export async function ingestTweetsForUser(
  username: string,
  maxPages?: number,
  options?: {
    fetchDurationMs?: number;
    fetchUntilDate?: string;
    topUpOnly?: boolean;
  }
) {
  const cleanUsername = username.replace("@", "").trim();
  if (!cleanUsername) {
    throw new Error("Username is required");
  }
  const fetchDurationMs = options?.fetchDurationMs;
  const targetUntilDate = options?.fetchUntilDate ? new Date(options.fetchUntilDate) : null;
  const validUntilDate = targetUntilDate && !isNaN(targetUntilDate.getTime()) ? targetUntilDate : null;
  const useScheduledFetch = Number.isFinite(fetchDurationMs) && !!fetchDurationMs;
  const phaseOneTargetMs = useScheduledFetch ? calculatePhaseOneTargetMs(fetchDurationMs) : undefined;

  // Create job
  const jobResult = await query<{ id: number }>(
    `
      INSERT INTO processing_jobs (job_type, status, started_at, metadata)
      VALUES ('nitter_user_ingest', 'running', now(), $1)
      RETURNING id
    `,
    [{
      username: cleanUsername,
      requestedMaxPages: maxPages ?? null,
      fetchDurationMs: fetchDurationMs ?? null,
      phaseOneTargetMs: phaseOneTargetMs ?? null,
    }]
  );
  const jobId = jobResult.rows[0].id;

  const abortController = new AbortController();
  activeIngestControllers.set(cleanUsername.toLowerCase(), abortController);

  try {
    let profileId: number | null = null;
    let totalTweetsFetched = 0;
    let phaseOneStartedAt = 0;

    // Helper to ingest batches continuously
    const ingestBatch = async (tweets: NitterTweet[]) => {
      if (abortController.signal.aborted) {
        throw new Error("Job stopped by user");
      }
      if (!profileId || tweets.length === 0) return;
      const processedTweets = tweets.map(processTweet);
      let batchInserted = 0;
      await transaction(async (client) => {
        const res = await upsertTweets(client, profileId!, processedTweets);
        if (res) batchInserted = res.insertedCount;
        await refreshHashtagStats(client, profileId!, processedTweets);
        await refreshProfileAnalysis(client, profileId!);
      });
      if (processedTweets.length > 0) {
        triggerAsyncEmbeddingGeneration(processedTweets).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[TweetService] Failed to trigger async embedding generation: ${message}`);
        });
      }
      totalTweetsFetched += batchInserted;
      console.log(`\x1b[32m[Database] 💾 Upserted ${batchInserted} new tweets for @${cleanUsername} (total new so far: ${totalTweetsFetched})\x1b[0m`);
    };

    const retryDelays = [5000, 15000, 30000, 60000];
    let recentResult = null;
    let initialAttempt = 0;

    // 1. Fetch first page to get profile
    while (initialAttempt <= retryDelays.length) {
      if (abortController.signal.aborted) {
        throw new Error("Job stopped by user");
      }
      try {
        recentResult = await fetchRecentUserTweets(
          cleanUsername,
          1,
          async () => { }, // empty callback, we just want profile
          null,
          { signal: abortController.signal }
        );
        
        if (!recentResult) {
          throw new Error("Unable to fetch profile from Nitter (returned null)");
        }
        break;
      } catch (err) {
        if (abortController.signal.aborted || (err instanceof Error && err.message === "Job stopped by user")) {
          throw err;
        }
        if (initialAttempt < retryDelays.length) {
          console.log(`\x1b[33m[Nitter] ⚠️ Initial profile fetch error: ${err instanceof Error ? err.message : String(err)}. Retrying in ${retryDelays[initialAttempt]}ms...\x1b[0m`);
          await new Promise(resolve => setTimeout(resolve, retryDelays[initialAttempt]));
          initialAttempt++;
        } else {
          throw err;
        }
      }
    }

    if (!recentResult) {
      throw new Error("Unable to fetch profile from Nitter (null result)");
    }

    await transaction(async (client) => {
      profileId = await upsertProfile(client, recentResult.profile);
    });

    const dbStats = await getTweetStatsForProfile(profileId!);

    // Check joined date
    let joinedDate = new Date("2006-03-21T00:00:00Z");
    if (recentResult.profile.joined) {
      const parsedJoined = new Date(recentResult.profile.joined);
      if (!isNaN(parsedJoined.getTime())) joinedDate = parsedJoined;
    }

    // Is there a mismatch? (e.g. oldest tweet is > joined_date + 31 days, or db is empty)
    let mismatch = true;
    if (dbStats.oldestDate) {
      const diffDays = (dbStats.oldestDate.getTime() - joinedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays <= 31) mismatch = false;
    }

    const isFreshUser = !dbStats.oldestDate;
    let attempt = 0;
    let topDownResult = null;

    // Phase 1: Fetch recent tweets top-down
    while (attempt <= retryDelays.length) {
      if (abortController.signal.aborted) {
        throw new Error("Job stopped by user");
      }
      try {
        phaseOneStartedAt = Date.now();
        topDownResult = await fetchRecentUserTweets(
          cleanUsername,
          maxPages || 30,
          ingestBatch,
          validUntilDate || dbStats.newestDate, // Stop if we reach validUntilDate or existing newest tweet
          { phaseOneTargetMs, signal: abortController.signal }
        );

        if (!topDownResult) {
          throw new Error("Unable to fetch tweets from Nitter during phase 1 (returned null)");
        }
        
        break; // Successfully fetched tweets
      } catch (err) {
        if (abortController.signal.aborted || (err instanceof Error && err.message === "Job stopped by user")) {
          throw err;
        }
        if (attempt < retryDelays.length) {
          console.log(`\x1b[33m[Nitter] ⚠️ Phase 1 error: ${err instanceof Error ? err.message : String(err)}. Retrying in ${retryDelays[attempt]}ms...\x1b[0m`);
          await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
          attempt++;
        } else {
          throw err;
        }
      }
    }

    if (!topDownResult) {
      throw new Error("Unable to fetch tweets from Nitter during phase 1 (null result)");
    }
    const phaseOneElapsedMs = phaseOneStartedAt > 0 ? Date.now() - phaseOneStartedAt : phaseOneTargetMs ?? 0;
    const createArchivalScheduler = () => {
      if (!useScheduledFetch) return null;
      const profileTweetTotal = Number(recentResult.profile.stats.tweets || 0);
      const estimatedTweetsRemaining = Math.max(0, profileTweetTotal - dbStatsAfterPhase1.tweetCount);
      const executionPlan = createScrapeExecutionPlan({
        totalAllowedMs: fetchDurationMs,
        phaseOneTargetMs,
        phaseOneElapsedMs,
        estimatedTweetsRemaining,
        estimatedRequestCount: estimateArchivalRequestCount(estimatedTweetsRemaining),
      });

      return {
        executionPlan,
        scheduler: new ScrapeRequestScheduler(executionPlan),
      };
    };

    // Re-fetch DB stats after Phase 1 so Phase 2 uses an accurate picture of what's in the DB.
    // This prevents archival from re-covering windows that Phase 1 already ingested, and stops
    // duplicate data appearing when a previous job crashed mid-way and is being restarted.
    const dbStatsAfterPhase1 = await getTweetStatsForProfile(profileId!);

    // Re-evaluate mismatch using the freshest oldest date now in the DB
    let mismatchAfterPhase1 = true;
    if (dbStatsAfterPhase1.oldestDate) {
      const diffDays = (dbStatsAfterPhase1.oldestDate.getTime() - joinedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays <= 31) mismatchAfterPhase1 = false;
    }

    // Phase 2: Fill gaps or missing history
    let archivalTotal = 0;

    if (!options?.topUpOnly) {
      if (mismatchAfterPhase1) {
        if (abortController.signal.aborted) throw new Error("Job stopped by user");
        console.log(`\x1b[33m[Nitter] 🔍 Mismatch detected for @${cleanUsername}. Running intelligent archival search to joined date...\x1b[0m`);
      const searchSinceDate = validUntilDate && validUntilDate > joinedDate ? validUntilDate : joinedDate;
      // Use the freshest oldest date — not the stale pre-Phase-1 snapshot
      const searchUntilDate = dbStatsAfterPhase1.oldestDate || (
        topDownResult.tweets.length > 0 ? parseNitterDate(topDownResult.tweets[topDownResult.tweets.length - 1].date) : new Date()
      );

      if (searchSinceDate < searchUntilDate) {
        const archivalSchedule = createArchivalScheduler();
        const archivalRes = await runIntelligentArchivalSearch(
          cleanUsername,
          searchSinceDate,
          searchUntilDate,
          topDownResult.tweets,
          ingestBatch,
          {
            scheduler: archivalSchedule?.scheduler,
            executionPlan: archivalSchedule?.executionPlan,
            signal: abortController.signal
          }
        );
        archivalTotal = archivalRes.tweets.length;
      } else {
        console.log(`\x1b[32m[IngestPipeline] ✅ Archive fully covered for @${cleanUsername} (oldest tweet within 31 days of join date after Phase 1).\x1b[0m`);
      }
    } else if (!topDownResult.reachedStopDate && dbStats.newestDate) {
      if (abortController.signal.aborted) throw new Error("Job stopped by user");
      console.log(`\x1b[33m[Nitter] 🔍 Gap detected for @${cleanUsername}. Bridging the gap...\x1b[0m`);
      const searchSinceDate = dbStats.newestDate;
      const lastTweetDate = topDownResult.tweets.length > 0
        ? parseNitterDate(topDownResult.tweets[topDownResult.tweets.length - 1].date)
        : null;

      if (lastTweetDate && searchSinceDate < lastTweetDate) {
        const archivalSchedule = createArchivalScheduler();
        const gapRes = await runIntelligentArchivalSearch(
          cleanUsername,
          searchSinceDate,
          lastTweetDate,
          topDownResult.tweets,
          ingestBatch,
          {
            scheduler: archivalSchedule?.scheduler,
            executionPlan: archivalSchedule?.executionPlan,
            signal: abortController.signal
          }
        );
        archivalTotal += gapRes.tweets.length;
      }
      }
    }

    if (profileId) {
      await queueClusteringForProfile(profileId);
    }

    await query(
      `
        UPDATE processing_jobs
        SET status = 'completed',
            completed_at = now(),
            metadata = metadata || $2::jsonb
        WHERE id = $1
      `,
      [
        jobId,
        {
          profileId,
          tweetsFetched: totalTweetsFetched,
          mismatchDetected: mismatch,
        },
      ]
    );

    return {
      jobId,
      profileId,
      username: cleanUsername,
      tweetsFetched: totalTweetsFetched,
    };
  } catch (error) {
    const isCancelled = abortController.signal.aborted || (error instanceof Error && error.message === "Job stopped by user");
    await query(
      `
        UPDATE processing_jobs
        SET status = $2,
            completed_at = now(),
            error = $3
        WHERE id = $1
      `,
      [jobId, isCancelled ? "cancelled" : "failed", isCancelled ? "Job stopped by user" : (error instanceof Error ? error.message : "Unknown ingestion error")]
    );
    throw error;
  } finally {
    activeIngestControllers.delete(cleanUsername.toLowerCase());
  }
}




export async function ingestRepliesForUser(username: string, options?: { fetchUntilDate?: string }) {
  const cleanUsername = username.replace("@", "").trim();
  if (!cleanUsername) throw new Error("Username is required");
  const targetUntilDate = options?.fetchUntilDate ? new Date(options.fetchUntilDate) : null;
  const validUntilDate = targetUntilDate && !isNaN(targetUntilDate.getTime()) ? targetUntilDate : null;

  // Create job
  const jobResult = await query<{ id: number }>(
    `
      INSERT INTO processing_jobs (job_type, status, started_at, metadata)
      VALUES ($2, $3, now(), $1)
      RETURNING id
    `,
    [{ username: cleanUsername }, "nitter_replies_ingest", "running"]
  );
  const jobId = jobResult.rows[0].id;

  const abortController = new AbortController();
  activeIngestControllers.set(cleanUsername.toLowerCase(), abortController);

  try {
    const profileRes = await query<{ id: number; account_created_at: string }>(
      "SELECT id, account_created_at FROM profiles WHERE lower(username) = lower($1) LIMIT 1",
      [cleanUsername]
    );

    if (profileRes.rows.length === 0) {
      throw new Error("Profile not found. Please ingest the user first.");
    }
    const profileId = profileRes.rows[0].id;
    let joinedDate = new Date("2006-03-21T00:00:00Z");
    if (profileRes.rows[0].account_created_at) {
       joinedDate = new Date(profileRes.rows[0].account_created_at);
    }

    let totalTweetsFetched = 0;
    const ingestBatch = async (tweets: NitterTweet[]) => {
      if (abortController.signal.aborted) {
        throw new Error("Job stopped by user");
      }
      if (tweets.length === 0) return;
      const processedTweets = tweets.map(processTweet);
      let batchInserted = 0;
      await transaction(async (client) => {
        const res = await upsertTweets(client, profileId, processedTweets);
        if (res) batchInserted = res.insertedCount;
        await refreshHashtagStats(client, profileId, processedTweets);
        await refreshProfileAnalysis(client, profileId);
      });
      if (processedTweets.length > 0) {
        triggerAsyncEmbeddingGeneration(processedTweets).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[TweetService] Failed to trigger async embedding generation: ${message}`);
        });
      }
      totalTweetsFetched += batchInserted;
      console.log(`\x1b[32m[Database] 💾 Upserted ${batchInserted} new replies for @${cleanUsername} (total new replies so far: ${totalTweetsFetched})\x1b[0m`);
    };

    console.log(`\x1b[33m[Nitter] 🔍 Starting replies fetch for @${cleanUsername}...\x1b[0m`);
    
    const searchSinceDate = validUntilDate && validUntilDate > joinedDate ? validUntilDate : joinedDate;
    const searchUntilDate = new Date();

    const archivalRes = await runIntelligentArchivalSearch(
      cleanUsername,
      searchSinceDate,
      searchUntilDate,
      [],
      ingestBatch,
      { fetchReplies: true, signal: abortController.signal }
    );
    
    await queueClusteringForProfile(profileId);

    await query(
      `
        UPDATE processing_jobs
        SET status = $2,
            completed_at = now(),
            metadata = metadata || $3::jsonb
        WHERE id = $1
      `,
      [jobId, "completed", { profileId, tweetsFetched: totalTweetsFetched }]
    );

    return { jobId, profileId, username: cleanUsername, tweetsFetched: totalTweetsFetched };
  } catch (error) {
    const isCancelled = abortController.signal.aborted || (error instanceof Error && error.message === "Job stopped by user");
    await query(
      `
        UPDATE processing_jobs
        SET status = $2,
            completed_at = now(),
            error = $3
        WHERE id = $1
      `,
      [jobId, isCancelled ? "cancelled" : "failed", isCancelled ? "Job stopped by user" : (error instanceof Error ? error.message : "Unknown error")]
    );
    throw error;
  } finally {
    activeIngestControllers.delete(cleanUsername.toLowerCase());
  }
}


export async function fillProfileGaps(username: string, gapSize: number = 14) {
  const cleanUsername = username.replace("@", "").trim();
  if (!cleanUsername) throw new Error("Username is required");

  // Create job
  const jobResult = await query<{ id: number }>(
    `
      INSERT INTO processing_jobs (job_type, status, started_at, metadata)
      VALUES ($2, $3, now(), $1)
      RETURNING id
    `,
    [{ username: cleanUsername }, "nitter_gap_fill", "running"]
  );
  const jobId = jobResult.rows[0].id;

  const abortController = new AbortController();
  activeIngestControllers.set(cleanUsername.toLowerCase(), abortController);

  try {
    const profileRes = await query<{ id: number; account_created_at: string }>(
      "SELECT id, account_created_at FROM profiles WHERE lower(username) = lower($1) LIMIT 1",
      [cleanUsername]
    );

    if (profileRes.rows.length === 0) {
      throw new Error("Profile not found. Please ingest the user first.");
    }
    const profileId = profileRes.rows[0].id;

    // Find gaps > gapSize days
    const gapSql = `
      WITH lags AS (
        SELECT created_at,
               LAG(created_at) OVER (ORDER BY created_at) as prev_tweet_date
        FROM tweets
        WHERE profile_id = $1
      )
      SELECT prev_tweet_date as start_date, created_at as end_date,
             EXTRACT(EPOCH FROM (created_at - prev_tweet_date)) / 86400 as gap_days
      FROM lags
      WHERE EXTRACT(EPOCH FROM (created_at - prev_tweet_date)) / 86400 > $2
      ORDER BY end_date DESC;
    `;
    const gapRes = await query<{ start_date: Date; end_date: Date; gap_days: number }>(gapSql, [profileId, gapSize]);
    
    const gapsToFill = gapRes.rows.map(row => ({
      start: new Date(row.start_date),
      end: new Date(row.end_date)
    }));

    // Check gap at the very edges (joined date to oldest tweet, newest tweet to now)
    const dbStats = await getTweetStatsForProfile(profileId);
    let joinedDate = new Date("2006-03-21T00:00:00Z");
    if (profileRes.rows[0].account_created_at) {
       joinedDate = new Date(profileRes.rows[0].account_created_at);
    }
    
    if (dbStats.oldestDate) {
      const diffStart = (dbStats.oldestDate.getTime() - joinedDate.getTime()) / 86400000;
      if (diffStart > gapSize) {
        gapsToFill.push({ start: joinedDate, end: dbStats.oldestDate });
      }
    }
    
    if (dbStats.newestDate) {
      const now = new Date();
      const diffEnd = (now.getTime() - dbStats.newestDate.getTime()) / 86400000;
      if (diffEnd > gapSize) {
        gapsToFill.unshift({ start: dbStats.newestDate, end: now });
      }
    }

    let totalTweetsFetched = 0;
    const ingestBatch = async (tweets: NitterTweet[]) => {
      if (abortController.signal.aborted) {
        throw new Error("Job stopped by user");
      }
      if (tweets.length === 0) return;
      const processedTweets = tweets.map(processTweet);
      let batchInserted = 0;
      await transaction(async (client) => {
        const res = await upsertTweets(client, profileId, processedTweets);
        if (res) batchInserted = res.insertedCount;
        await refreshHashtagStats(client, profileId, processedTweets);
        await refreshProfileAnalysis(client, profileId);
      });
      if (processedTweets.length > 0) {
        triggerAsyncEmbeddingGeneration(processedTweets).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[TweetService] Failed to trigger async embedding generation: ${message}`);
        });
      }
      totalTweetsFetched += batchInserted;
      console.log(`\x1b[32m[Database] 💾 Upserted ${batchInserted} new gap-fill tweets for @${cleanUsername} (total new so far: ${totalTweetsFetched})\x1b[0m`);
    };

    console.log(`\x1b[33m[Nitter] 🔍 Found ${gapsToFill.length} gaps >${gapSize} days for @${cleanUsername}. Starting gap fill...\x1b[0m`);

    for (let i = 0; i < gapsToFill.length; i++) {
      if (abortController.signal.aborted) throw new Error("Job stopped by user");
      const gap = gapsToFill[i];
      const gapStartStr = gap.start.toISOString().split('T')[0];
      const gapEndStr = gap.end.toISOString().split('T')[0];
      console.log(`\x1b[33m[Nitter] ⏳ Filling gap ${i + 1}/${gapsToFill.length}: ${gapStartStr} to ${gapEndStr}\x1b[0m`);

      await query(
        `UPDATE processing_jobs SET metadata = metadata || $2::jsonb WHERE id = $1`,
        [jobId, { currentGapIndex: i + 1, totalGaps: gapsToFill.length, currentGapStart: gapStartStr, currentGapEnd: gapEndStr }]
      );
      
      await runIntelligentArchivalSearch(
        cleanUsername,
        gap.start,
        gap.end,
        [],
        ingestBatch,
        { signal: abortController.signal }
      );
    }

    await queueClusteringForProfile(profileId);

    await query(
      `
        UPDATE processing_jobs
        SET status = $2,
            completed_at = now(),
            metadata = metadata || $3::jsonb
        WHERE id = $1
      `,
      [jobId, "completed", { profileId, gapsFilled: gapsToFill.length, tweetsFetched: totalTweetsFetched }]
    );

    return { jobId, profileId, username: cleanUsername, tweetsFetched: totalTweetsFetched };
  } catch (error) {
    const isCancelled = abortController.signal.aborted || (error instanceof Error && error.message === "Job stopped by user");
    await query(
      `
        UPDATE processing_jobs
        SET status = $2,
            completed_at = now(),
            error = $3
        WHERE id = $1
      `,
      [jobId, isCancelled ? "cancelled" : "failed", isCancelled ? "Job stopped by user" : (error instanceof Error ? error.message : "Unknown error")]
    );
    throw error;
  } finally {
    activeIngestControllers.delete(cleanUsername.toLowerCase());
  }
}
