import type { PoolClient } from "pg";

export async function refreshProfileAnalysis(client: PoolClient, profileId: number) {
  await client.query(
    `
      INSERT INTO profile_analysis (
        profile_id,
        top_hashtags,
        top_mentions,
        active_hours,
        sentiment_distribution,
        topic_distribution,
        ideology_scores,
        updated_at
      )
      SELECT
        $1,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object('hashtag', hashtag, 'count', usage_count))
          FROM (
            SELECT hashtag, count(*)::bigint AS usage_count
            FROM tweets, unnest(hashtags) AS hashtag
            WHERE profile_id = $1
            GROUP BY hashtag
            ORDER BY usage_count DESC
            LIMIT 20
          ) top_tags
        ), '[]'::jsonb),
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object('mention', mention, 'count', usage_count))
          FROM (
            SELECT mention, count(*)::bigint AS usage_count
            FROM tweets, unnest(mentions) AS mention
            WHERE profile_id = $1
            GROUP BY mention
            ORDER BY usage_count DESC
            LIMIT 20
          ) top_mentions
        ), '[]'::jsonb),
        COALESCE((
          SELECT jsonb_object_agg(post_hour, tweet_count)
          FROM (
            SELECT extract(hour from created_at)::int::text AS post_hour, count(*)::bigint AS tweet_count
            FROM tweets
            WHERE profile_id = $1
            GROUP BY post_hour
            ORDER BY post_hour
          ) hours
        ), '{}'::jsonb),
        '{}'::jsonb,
        '{}'::jsonb,
        '{}'::jsonb,
        now()
      ON CONFLICT (profile_id) DO UPDATE SET
        top_hashtags = EXCLUDED.top_hashtags,
        top_mentions = EXCLUDED.top_mentions,
        active_hours = EXCLUDED.active_hours,
        updated_at = now()
    `,
    [profileId]
  );
}
