import { query } from "@/lib/db";

export interface MapCoordinate {
  id: string;
  profile_id: string;
  projection_type?: string;
  username: string;
  display_name: string;
  profile_image_url: string | null;
  x: number;
  y: number;
  cluster_id: number | null;
  generated_at: Date;
  // Stance & Intelligence stats from profile_topic_intelligence
  relevance_score?: number;
  supportive_score?: number;
  opposition_score?: number;
  sarcasm_confidence?: number;
  tweet_coverage_percent?: number;
  strongest_matching_terms?: any[];
  sample_supportive_tweets?: any[];
  sample_opposition_tweets?: any[];
  total_tweets_analyzed?: number;
  matching_tweets_count?: number;
}

export async function getGlobalMapCoordinates(): Promise<MapCoordinate[]> {
  const res = await query(`
    SELECT
      m.id,
      m.profile_id,
      m.projection_type,
      p.username,
      p.display_name,
      p.profile_image_url,
      m.x,
      m.y,
      m.cluster_id,
      m.generated_at
    FROM profile_map_coordinates m
    JOIN profiles p ON p.id = m.profile_id
  `);
  return res.rows as any as MapCoordinate[];
}

export async function getTopicMapCoordinates(topicId: string): Promise<MapCoordinate[]> {
  const res = await query(`
    SELECT
      COALESCE(m.id::text, pti.id::text) AS id,
      COALESCE(m.profile_id, pti.profile_id)::text AS profile_id,
      p.username,
      p.display_name,
      p.profile_image_url,
      COALESCE(m.x, 0)::float AS x,
      COALESCE(m.y, 0)::float AS y,
      m.cluster_id,
      COALESCE(m.generated_at, pti.analyzed_at, NOW()) AS generated_at,
      pti.relevance_score::float AS relevance_score,
      pti.supportive_score::float AS supportive_score,
      pti.opposition_score::float AS opposition_score,
      pti.sarcasm_confidence::float AS sarcasm_confidence,
      pti.tweet_coverage_percent::float AS tweet_coverage_percent,
      pti.strongest_matching_terms,
      pti.sample_supportive_tweets,
      pti.sample_opposition_tweets,
      pti.total_tweets_analyzed::int AS total_tweets_analyzed,
      pti.matching_tweets_count::int AS matching_tweets_count
    FROM (SELECT * FROM profile_topic_map_coordinates WHERE topic_id = $1) m
    FULL OUTER JOIN (SELECT * FROM profile_topic_intelligence WHERE topic_id = $1) pti 
      ON m.profile_id = pti.profile_id
    JOIN profiles p ON p.id = COALESCE(m.profile_id, pti.profile_id)
  `, [topicId]);

  return res.rows.map((row: any) => ({
    ...row,
    relevance_score: row.relevance_score !== null ? Number(row.relevance_score) : undefined,
    supportive_score: row.supportive_score !== null ? Number(row.supportive_score) : undefined,
    opposition_score: row.opposition_score !== null ? Number(row.opposition_score) : undefined,
    sarcasm_confidence: row.sarcasm_confidence !== null ? Number(row.sarcasm_confidence) : undefined,
    tweet_coverage_percent: row.tweet_coverage_percent !== null ? Number(row.tweet_coverage_percent) : undefined,
    strongest_matching_terms: typeof row.strongest_matching_terms === "string" ? JSON.parse(row.strongest_matching_terms) : (row.strongest_matching_terms || []),
    sample_supportive_tweets: typeof row.sample_supportive_tweets === "string" ? JSON.parse(row.sample_supportive_tweets) : (row.sample_supportive_tweets || []),
    sample_opposition_tweets: typeof row.sample_opposition_tweets === "string" ? JSON.parse(row.sample_opposition_tweets) : (row.sample_opposition_tweets || []),
  })) as MapCoordinate[];
}

