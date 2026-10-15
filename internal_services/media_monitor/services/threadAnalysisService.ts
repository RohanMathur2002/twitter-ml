import { db } from "@/lib/db";
import { NitterTweetDetails } from "./nitterService";
import { processTweet } from "./tweetParser";

export async function upsertThreadAndAnalyzeBackground(rootTweetId: string, result: NitterTweetDetails) {
  const client = await db.connect();

  try {
    const allTweets = [];
    if (result.mainTweet) {
      allTweets.push({ ...result.mainTweet, is_main: true });
    }
    for (const reply of result.replies) {
      allTweets.push({ ...reply, is_main: false });
    }

    const payloadForMl = [];

    await client.query('BEGIN');

    for (const t of allTweets) {
      const processed = processTweet(t as any);
      const type = t.is_main ? 'tweet' : 'reply';

      await client.query(
        `
          INSERT INTO thread_tweets (
            id, root_tweet_id, type, username, display_name, profile_image_url,
            raw_text, clean_text, created_at, likes_count, retweets_count, replies_count, views_count,
            fetch_count, fetched_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 1, NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            fetch_count = thread_tweets.fetch_count + 1,
            fetched_at = NOW(),
            likes_count = EXCLUDED.likes_count,
            retweets_count = EXCLUDED.retweets_count,
            replies_count = EXCLUDED.replies_count,
            views_count = EXCLUDED.views_count
        `,
        [
          processed.id,
          rootTweetId,
          type,
          t.username.replace("@", ""),
          t.fullname,
          t.avatar,
          processed.rawText,
          processed.cleanText,
          processed.createdAt,
          processed.likesCount,
          processed.retweetsCount,
          processed.repliesCount,
          processed.viewsCount,
        ]
      );

      if (processed.cleanText || processed.rawText) {
        payloadForMl.push({ id: processed.id, text: (processed.cleanText || processed.rawText).trim() });
      }
    }

    await client.query('COMMIT');

    // Call ML FastAPI to generate embeddings and analyze
    if (payloadForMl.length > 0) {
      const mlApiUrl = process.env.ML_FASTAPI_URL || "http://localhost:8000";
      const maxRetries = 5;
      const delayMs = 2000;
      let attempt = 0;
      let success = false;

      while (attempt < maxRetries && !success) {
        try {
          const response = await fetch(`${mlApiUrl}/tweets/analyze-thread`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              root_tweet_id: rootTweetId,
              tweets: payloadForMl
            })
          });
          if (response.ok) {
            success = true;
          } else {
            throw new Error(`ML API returned status ${response.status}`);
          }
        } catch (error: any) {
          attempt++;
          if (attempt >= maxRetries) {
            throw error;
          }
          console.warn(`[ThreadAnalysisService] ML API connection attempt ${attempt} failed: ${error.message || error}. Retrying in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("[ThreadAnalysisService] Error processing thread:", error);
  } finally {
    client.release();
  }
}

export async function getThreadFromDB(rootTweetId: string): Promise<NitterTweetDetails | null> {
  const result = await db.query(
    `SELECT * FROM thread_tweets WHERE root_tweet_id = $1 ORDER BY created_at ASC`,
    [rootTweetId]
  );
  if (result.rows.length === 0) return null;

  let mainTweet: any = null;
  const replies: any[] = [];

  for (const row of result.rows) {
    const tweet = {
      id: row.id,
      url: `https://x.com/${row.username}/status/${row.id}`,
      avatar: row.profile_image_url,
      fullname: row.display_name,
      username: "@" + row.username,
      date: new Date(row.created_at).toLocaleDateString() + " " + new Date(row.created_at).toLocaleTimeString(),
      content: row.raw_text,
      stats: {
        comments: String(row.replies_count),
        retweets: String(row.retweets_count),
        hearts: String(row.likes_count),
        views: String(row.views_count || 0),
      },
      media: [],
      isRetweet: false,
      isReply: row.type === 'reply',
      replyToUsers: [],
      isBookmarked: row.is_bookmarked,
      stanceLabel: row.stance_label || null,
      stanceScore: row.stance_score !== null && row.stance_score !== undefined ? Number(row.stance_score) : null,
    };
    
    if (row.type === 'tweet') {
      mainTweet = tweet;
    } else {
      replies.push(tweet);
    }
  }

  // Fallback in case type wasn't explicitly 'tweet'
  if (!mainTweet && replies.length > 0) {
    const idx = replies.findIndex(r => r.id === rootTweetId);
    if (idx !== -1) {
      mainTweet = replies.splice(idx, 1)[0];
    }
  }

  return { mainTweet, replies };
}
