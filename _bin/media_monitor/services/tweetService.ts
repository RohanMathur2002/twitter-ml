import type { PoolClient } from "pg";
import { query } from "@/lib/db";
import type { ProcessedTweet } from "./tweetParser";

const EMBEDDING_BATCH_SIZE = 500;

interface EmbeddingPayloadTweet {
  id: string;
  text: string;
}

export interface DbTweet {
  id: string;
  profile_id: number;
  raw_text: string;
  clean_text: string | null;
  created_at: string;
  scraped_at: string;
  likes_count: string;
  retweets_count: string;
  replies_count: string;
  bookmarks_count: string | null;
  views_count: string | null;
  lang: string | null;
  source: string | null;
  is_retweet: boolean;
  is_reply: boolean;
  conversation_id: string | null;
  quoted_tweet_id: string | null;
  in_reply_to_tweet_id: string | null;
  hashtags: string[];
  mentions: string[];
  urls: string[];
  emojis: unknown;
  media: unknown;
  raw_tweet_json: unknown;
}

export async function upsertTweets(
  client: PoolClient,
  profileId: number,
  tweets: ProcessedTweet[],
  options?: {
    waitForEmbeddings?: boolean;
  }
) {
  if (tweets.length === 0) return;

  const BATCH_SIZE = 500;
  for (let i = 0; i < tweets.length; i += BATCH_SIZE) {
    const batch = tweets.slice(i, i + BATCH_SIZE);
    
    const values: any[] = [];
    const placeholders: string[] = [];
    
    batch.forEach((tweet, index) => {
      const offset = index * 22;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, now(), $${offset + 6}, $${offset + 7}, $${offset + 8}, NULL, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16}, $${offset + 17}, $${offset + 18}, $${offset + 19}, $${offset + 20}, $${offset + 21}, $${offset + 22})`
      );
      values.push(
        tweet.id,
        profileId,
        tweet.rawText,
        tweet.cleanText,
        tweet.createdAt,
        tweet.likesCount,
        tweet.retweetsCount,
        tweet.repliesCount,
        tweet.viewsCount,
        tweet.lang,
        tweet.source,
        tweet.isRetweet,
        tweet.isReply,
        tweet.conversationId,
        tweet.quotedTweetId,
        tweet.inReplyToTweetId,
        tweet.hashtags,
        tweet.mentions,
        tweet.urls,
        JSON.stringify(tweet.emojis),
        JSON.stringify(tweet.media),
        JSON.stringify(tweet.rawTweetJson)
      );
    });

    await client.query(
      `
        INSERT INTO tweets (
          id, profile_id, raw_text, clean_text, created_at, scraped_at,
          likes_count, retweets_count, replies_count, bookmarks_count, views_count,
          lang, source, is_retweet, is_reply, conversation_id, quoted_tweet_id,
          in_reply_to_tweet_id, hashtags, mentions, urls, emojis, media, raw_tweet_json
        )
        VALUES ${placeholders.join(", ")}
        ON CONFLICT (id) DO UPDATE SET
          profile_id = EXCLUDED.profile_id,
          raw_text = EXCLUDED.raw_text,
          clean_text = EXCLUDED.clean_text,
          created_at = EXCLUDED.created_at,
          scraped_at = now(),
          likes_count = EXCLUDED.likes_count,
          retweets_count = EXCLUDED.retweets_count,
          replies_count = EXCLUDED.replies_count,
          views_count = EXCLUDED.views_count,
          lang = EXCLUDED.lang,
          source = EXCLUDED.source,
          is_retweet = EXCLUDED.is_retweet,
          is_reply = EXCLUDED.is_reply,
          conversation_id = EXCLUDED.conversation_id,
          quoted_tweet_id = EXCLUDED.quoted_tweet_id,
          in_reply_to_tweet_id = EXCLUDED.in_reply_to_tweet_id,
          hashtags = EXCLUDED.hashtags,
          mentions = EXCLUDED.mentions,
          urls = EXCLUDED.urls,
          emojis = EXCLUDED.emojis,
          media = EXCLUDED.media,
          raw_tweet_json = EXCLUDED.raw_tweet_json
      `,
      values
    );
  }

  if (tweets.length > 0) {
    console.log(`[TweetService] Successfully upserted ${tweets.length} tweets for profile ID ${profileId}.`);
    const shouldWait = options?.waitForEmbeddings === true;
    if (shouldWait) {
      await triggerSyncEmbeddingGeneration(tweets);
    } else {
      triggerAsyncEmbeddingGeneration(tweets).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[TweetService] Failed to trigger async embedding generation: ${message}`);
      });
    }
  }
}

async function triggerAsyncEmbeddingGeneration(tweets: ProcessedTweet[]) {
  const mlApiUrl = process.env.ML_FASTAPI_URL || "http://localhost:8000";
  const embeddingTweets = buildEmbeddingPayload(tweets);
  for (let i = 0; i < embeddingTweets.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = embeddingTweets.slice(i, i + EMBEDDING_BATCH_SIZE);
    const response = await fetch(`${mlApiUrl}/tweets/embed-async`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tweets: batch,
      }),
    });

    if (!response.ok) {
      throw new Error(`ML API returned ${response.status} ${response.statusText}`);
    }
  }
}

async function triggerSyncEmbeddingGeneration(tweets: ProcessedTweet[]) {
  const mlApiUrl = process.env.ML_FASTAPI_URL || "http://localhost:8000";
  const embeddingTweets = buildEmbeddingPayload(tweets);
  for (let i = 0; i < embeddingTweets.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = embeddingTweets.slice(i, i + EMBEDDING_BATCH_SIZE);
    const response = await fetch(`${mlApiUrl}/tweets/embed-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tweets: batch,
      }),
    });

    if (!response.ok) {
      throw new Error(`ML API returned ${response.status} ${response.statusText}`);
    }
  }
}

function buildEmbeddingPayload(tweets: ProcessedTweet[]): EmbeddingPayloadTweet[] {
  const validTweets: EmbeddingPayloadTweet[] = [];
  let skippedCount = 0;

  for (const tweet of tweets) {
    const text = (tweet.cleanText || tweet.rawText || "").trim();
    if (!text) {
      skippedCount += 1;
      continue;
    }

    validTweets.push({
      id: tweet.id,
      text,
    });
  }

  if (skippedCount > 0) {
    console.warn(`[TweetService] Skipping ${skippedCount} tweets with blank text for embedding generation.`);
  }

  return validTweets;
}

export async function getTweetsForProfile(username: string, page = 1, limit = 25) {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const offset = Math.max(page - 1, 0) * safeLimit;

  const result = await query<DbTweet & { total_count: string }>(
    `
      SELECT t.*, count(*) OVER() AS total_count
      FROM tweets t
      JOIN profiles p ON p.id = t.profile_id
      WHERE lower(p.username) = lower($1)
      ORDER BY t.created_at DESC
      LIMIT $2 OFFSET $3
    `,
    [username.replace("@", ""), safeLimit, offset]
  );

  return {
    tweets: result.rows,
    total: result.rows[0] ? Number(result.rows[0].total_count) : 0,
    page,
    limit: safeLimit,
  };
}

export async function getTweetStatsForProfile(profileId: number) {
  const result = await query<{ oldest_date: string; newest_date: string }>(
    `
      SELECT 
        MIN(created_at) as oldest_date,
        MAX(created_at) as newest_date
      FROM tweets
      WHERE profile_id = $1
    `,
    [profileId]
  );

  const row = result.rows[0];
  return {
    oldestDate: row?.oldest_date ? new Date(row.oldest_date) : null,
    newestDate: row?.newest_date ? new Date(row.newest_date) : null,
  };
}
