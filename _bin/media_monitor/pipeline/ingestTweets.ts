import { transaction, query } from "@/lib/db";
import { refreshProfileAnalysis } from "@/services/analysisService";
import { queueClusteringForProfile } from "@/services/clusteringService";
import { fetchRecentUserTweets, runIntelligentArchivalSearch, parseNitterDate, type NitterTweet } from "@/services/nitterService";
import { upsertProfile } from "@/services/profileService";
import { refreshHashtagStats } from "@/services/hashtagService";
import { processTweet } from "@/services/tweetParser";
import { upsertTweets, getTweetStatsForProfile } from "@/services/tweetService";

export async function ingestTweetsForUser(username: string, maxPages?: number) {
  const cleanUsername = username.replace("@", "").trim();
  if (!cleanUsername) {
    throw new Error("Username is required");
  }

  // Create job
  const jobResult = await query<{ id: number }>(
    `
      INSERT INTO processing_jobs (job_type, status, started_at, metadata)
      VALUES ('nitter_user_ingest', 'running', now(), $1)
      RETURNING id
    `,
    [{ username: cleanUsername, requestedMaxPages: maxPages ?? null }]
  );
  const jobId = jobResult.rows[0].id;

  try {
    let profileId: number | null = null;
    let totalTweetsFetched = 0;

    // Helper to ingest batches continuously
    const ingestBatch = async (tweets: NitterTweet[]) => {
      if (!profileId || tweets.length === 0) return;
      const processedTweets = tweets.map(processTweet);
      await transaction(async (client) => {
        await upsertTweets(client, profileId!, processedTweets);
        await refreshHashtagStats(client, profileId!, processedTweets);
        await refreshProfileAnalysis(client, profileId!);
      });
      totalTweetsFetched += tweets.length;
      console.log(`\x1b[32m[Database] 💾 Upserted ${tweets.length} tweets for @${cleanUsername} (total ingested so far: ${totalTweetsFetched})\x1b[0m`);
    };

    const retryDelays = [5000, 15000, 30000, 60000];
    let recentResult = null;
    let initialAttempt = 0;

    // 1. Fetch first page to get profile
    while (initialAttempt <= retryDelays.length) {
      try {
        recentResult = await fetchRecentUserTweets(
          cleanUsername,
          1,
          async () => { }, // empty callback, we just want profile
          null
        );
        
        if (!recentResult) {
          throw new Error("Unable to fetch profile from Nitter (returned null)");
        }
        break;
      } catch (err) {
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
      try {
        topDownResult = await fetchRecentUserTweets(
          cleanUsername,
          maxPages || 30,
          ingestBatch,
          dbStats.newestDate // Stop if we hit a tweet we already have
        );

        if (!topDownResult) {
          throw new Error("Unable to fetch tweets from Nitter during phase 1 (returned null)");
        }
        
        break; // Successfully fetched tweets
      } catch (err) {
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

    if (mismatchAfterPhase1) {
      console.log(`\x1b[33m[Nitter] 🔍 Mismatch detected for @${cleanUsername}. Running intelligent archival search to joined date...\x1b[0m`);
      const searchSinceDate = joinedDate;
      // Use the freshest oldest date — not the stale pre-Phase-1 snapshot
      const searchUntilDate = dbStatsAfterPhase1.oldestDate || (
        topDownResult.tweets.length > 0 ? parseNitterDate(topDownResult.tweets[topDownResult.tweets.length - 1].date) : new Date()
      );

      if (searchSinceDate < searchUntilDate) {
        const archivalRes = await runIntelligentArchivalSearch(
          cleanUsername,
          searchSinceDate,
          searchUntilDate,
          topDownResult.tweets,
          ingestBatch
        );
        archivalTotal = archivalRes.tweets.length;
      } else {
        console.log(`\x1b[32m[IngestPipeline] ✅ Archive fully covered for @${cleanUsername} (oldest tweet within 31 days of join date after Phase 1).\x1b[0m`);
      }
    } else if (topDownResult.exhaustedCursor && !topDownResult.reachedStopDate && dbStatsAfterPhase1.newestDate) {
      console.log(`\x1b[33m[Nitter] 🔍 Gap detected for @${cleanUsername}. Bridging the gap...\x1b[0m`);
      const searchSinceDate = dbStatsAfterPhase1.newestDate;
      const lastTweetDate = topDownResult.tweets.length > 0
        ? parseNitterDate(topDownResult.tweets[topDownResult.tweets.length - 1].date)
        : null;

      if (lastTweetDate && searchSinceDate < lastTweetDate) {
        const gapRes = await runIntelligentArchivalSearch(
          cleanUsername,
          searchSinceDate,
          lastTweetDate,
          topDownResult.tweets,
          ingestBatch
        );
        archivalTotal = gapRes.tweets.length;
      }
    } else {
      console.log(`\x1b[32m[IngestPipeline] ✅ No archival needed for @${cleanUsername}.\x1b[0m`);
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
    await query(
      `
        UPDATE processing_jobs
        SET status = 'failed',
            completed_at = now(),
            error = $2
        WHERE id = $1
      `,
      [jobId, error instanceof Error ? error.message : "Unknown ingestion error"]
    );
    throw error;
  }
}




export async function ingestRepliesForUser(username: string) {
  const cleanUsername = username.replace("@", "").trim();
  if (!cleanUsername) throw new Error("Username is required");

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
      if (tweets.length === 0) return;
      const processedTweets = tweets.map(processTweet);
      await transaction(async (client) => {
        await upsertTweets(client, profileId, processedTweets);
        await refreshHashtagStats(client, profileId, processedTweets);
        await refreshProfileAnalysis(client, profileId);
      });
      totalTweetsFetched += tweets.length;
      console.log(`\x1b[32m[Database] 💾 Upserted ${tweets.length} replies for @${cleanUsername} (total replies ingested so far: ${totalTweetsFetched})\x1b[0m`);
    };

    console.log(`\x1b[33m[Nitter] 🔍 Starting replies fetch for @${cleanUsername}...\x1b[0m`);
    
    // We just do a full archival search for replies from joinedDate to today
    const searchSinceDate = joinedDate;
    const searchUntilDate = new Date();

    const archivalRes = await runIntelligentArchivalSearch(
      cleanUsername,
      searchSinceDate,
      searchUntilDate,
      [],
      ingestBatch,
      true // fetchReplies = true
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
    await query(
      `
        UPDATE processing_jobs
        SET status = $2,
            completed_at = now(),
            error = $3
        WHERE id = $1
      `,
      [jobId, "failed", error instanceof Error ? error.message : "Unknown error"]
    );
    throw error;
  }
}


