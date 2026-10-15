import type { PoolClient } from "pg";
import type { ProcessedTweet } from "./tweetParser";

export async function refreshHashtagStats(
  client: PoolClient,
  profileId: number,
  tweets: ProcessedTweet[]
) {
  const touchedHashtags = Array.from(new Set(tweets.flatMap((tweet) => tweet.hashtags)));

  for (const hashtag of touchedHashtags) {
    await client.query(
      `
        INSERT INTO hashtag_stats (
          hashtag,
          usage_count,
          unique_profiles_count,
          avg_engagement,
          first_seen_at,
          last_seen_at,
          related_hashtags
        )
        SELECT
          $1,
          count(*)::bigint,
          count(DISTINCT profile_id)::bigint,
          COALESCE(avg(likes_count + retweets_count + replies_count), 0),
          min(created_at),
          max(created_at),
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object('hashtag', related_hashtag, 'count', related_count))
            FROM (
              SELECT related_hashtag, count(*)::bigint AS related_count
              FROM tweets t2, unnest(t2.hashtags) AS related_hashtag
              WHERE t2.hashtags @> ARRAY[$1]::text[]
                AND related_hashtag <> $1
              GROUP BY related_hashtag
              ORDER BY related_count DESC
              LIMIT 20
            ) related
          ), '[]'::jsonb)
        FROM tweets
        WHERE hashtags @> ARRAY[$1]::text[]
        ON CONFLICT (hashtag) DO UPDATE SET
          usage_count = EXCLUDED.usage_count,
          unique_profiles_count = EXCLUDED.unique_profiles_count,
          avg_engagement = EXCLUDED.avg_engagement,
          first_seen_at = EXCLUDED.first_seen_at,
          last_seen_at = EXCLUDED.last_seen_at,
          related_hashtags = EXCLUDED.related_hashtags
      `,
      [hashtag]
    );
  }

  await client.query(
    `
      INSERT INTO profile_relationships (
        source_profile_id,
        target_profile_id,
        relationship_type,
        interaction_count,
        last_interaction_at
      )
      SELECT
        $1,
        target.id,
        'mention',
        count(*)::bigint,
        max(t.created_at)
      FROM tweets t
      CROSS JOIN LATERAL unnest(t.mentions) AS mention_username
      JOIN profiles target ON lower(target.username) = lower(mention_username)
      WHERE t.profile_id = $1
      GROUP BY target.id
      ON CONFLICT (source_profile_id, target_profile_id, relationship_type) DO UPDATE SET
        interaction_count = EXCLUDED.interaction_count,
        last_interaction_at = EXCLUDED.last_interaction_at
    `,
    [profileId]
  );
}
