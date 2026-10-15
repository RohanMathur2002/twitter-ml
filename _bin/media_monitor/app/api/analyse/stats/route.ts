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
    ] = await Promise.all([
      query<{
        total_tweets: string;
        total_hashtags: string;
        avg_likes: string | null;
        retweet_ratio: string | null;
      }>(
        `
          SELECT
            count(*)::bigint AS total_tweets,
            COALESCE((SELECT count(DISTINCT hashtag)::bigint FROM tweets, unnest(hashtags) AS hashtag WHERE profile_id = $1), 0) AS total_hashtags,
            avg(likes_count)::numeric(12,2) AS avg_likes,
            avg(CASE WHEN is_retweet THEN 1 ELSE 0 END)::numeric(6,4) AS retweet_ratio
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
    ]);

    console.info(JSON.stringify({ event: "stats_fetch_success", username, profileId, timestamp: new Date().toISOString() }));

    return NextResponse.json({
      stats: {
        ...totals.rows[0],
        mostUsedHashtags: hashtagRows.rows,
        languageDistribution: languageRows.rows,
        mostActivePostingHours: activeHourRows.rows,
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
