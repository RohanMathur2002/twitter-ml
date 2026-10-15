import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const username = (searchParams.get("username") || "").replace("@", "");
    
    console.info(JSON.stringify({ event: "stats_fetch_start", username, timestamp: new Date().toISOString() }));

    const profileResult = await query<{ id: number }>(
      "SELECT id FROM profiles WHERE lower(username) = lower($1) LIMIT 1",
      [username]
    );

    const profileId = profileResult.rows[0]?.id;
    if (!profileId) {
      console.warn(JSON.stringify({ event: "stats_fetch_profile_not_found", username, timestamp: new Date().toISOString() }));
      return NextResponse.json({ stats: null }, { status: 404 });
    }

    const [
      totals,
      hashtagRows,
      languageRows,
      activeHourRows,
      activeDayRows,
    ] = await Promise.all([
      query<{
        total_tweets: string;
        total_hashtags: string;
        retweet_ratio: string | null;
        avg_tweets_per_day_30d: string | null;
        avg_tweets_per_day_1y: string | null;
        avg_tweets_per_day_full: string | null;
        avg_likes: string | null;
        avg_retweets: string | null;
        avg_replies: string | null;
        engagement_rate: string | null;
        reply_ratio: string | null;
      }>(
        `
          SELECT
            count(*)::bigint AS total_tweets,
            COALESCE((SELECT count(DISTINCT hashtag)::bigint FROM tweets, unnest(hashtags) AS hashtag WHERE profile_id = $1), 0) AS total_hashtags,
            avg(CASE WHEN is_retweet THEN 1 ELSE 0 END)::numeric(6,4) AS retweet_ratio,
            COALESCE(
              (SELECT count(*)::double precision / 30.0 
               FROM tweets 
               WHERE profile_id = $1 
                 AND created_at >= (SELECT COALESCE(max(created_at), now()) FROM tweets WHERE profile_id = $1) - INTERVAL '30 days'
              ), 0
            )::numeric(12,2) AS avg_tweets_per_day_30d,
            COALESCE(
              (SELECT count(*)::double precision / 365.0 
               FROM tweets 
               WHERE profile_id = $1 
                 AND created_at >= (SELECT COALESCE(max(created_at), now()) FROM tweets WHERE profile_id = $1) - INTERVAL '1 year'
              ), 0
            )::numeric(12,2) AS avg_tweets_per_day_1y,
            COALESCE(
              (SELECT count(*)::double precision / COALESCE(NULLIF(EXTRACT(epoch FROM (max(created_at) - min(created_at))) / 86400.0, 0), 1.0)
               FROM tweets 
               WHERE profile_id = $1
              ), 0
            )::numeric(12,2) AS avg_tweets_per_day_full,
            avg(likes_count)::numeric(12,2) AS avg_likes,
            avg(retweets_count)::numeric(12,2) AS avg_retweets,
            avg(replies_count)::numeric(12,2) AS avg_replies,
            avg(likes_count + retweets_count + replies_count)::numeric(12,2) AS engagement_rate,
            avg(CASE WHEN is_reply THEN 1 ELSE 0 END)::numeric(6,4) AS reply_ratio
          FROM tweets
          WHERE profile_id = $1
        `,
        [profileId]
      ),
      query<{ hashtag: string; usage_count: string }>(
        `
          SELECT hashtag, count(*)::bigint AS usage_count
          FROM tweets, unnest(hashtags) AS hashtag
          WHERE profile_id = $1
          GROUP BY hashtag
          ORDER BY usage_count DESC
          LIMIT 10
        `,
        [profileId]
      ),
      query<{ lang: string; count: string }>(
        `
          SELECT COALESCE(lang, 'und') AS lang, count(*)::bigint
          FROM tweets
          WHERE profile_id = $1
          GROUP BY COALESCE(lang, 'und')
          ORDER BY count DESC
        `,
        [profileId]
      ),
      query<{ hour: string; count: string }>(
        `
          SELECT extract(hour from created_at)::int::text AS hour, count(*)::bigint
          FROM tweets
          WHERE profile_id = $1
          GROUP BY hour
          ORDER BY count DESC
          LIMIT 8
        `,
        [profileId]
      ),
      query<{ dow: number; count: string }>(
        `
          SELECT extract(isodow from created_at)::int AS dow, count(*)::bigint
          FROM tweets
          WHERE profile_id = $1
          GROUP BY dow
          ORDER BY count DESC
        `,
        [profileId]
      ),
    ]);

    console.info(JSON.stringify({ event: "stats_fetch_success", username, profileId, timestamp: new Date().toISOString() }));

    return NextResponse.json({
      stats: {
        ...totals.rows[0],
        mostUsedHashtags: hashtagRows.rows,
        languageDistribution: languageRows.rows,
        mostActivePostingHours: activeHourRows.rows,
        mostActivePostingDays: activeDayRows.rows,
      },
    });
  } catch (error) {
    console.error(JSON.stringify({ 
      event: "stats_fetch_error", 
      error: error instanceof Error ? error.message : String(error), 
      timestamp: new Date().toISOString() 
    }));
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read stats" },
      { status: 500 }
    );
  }
}
