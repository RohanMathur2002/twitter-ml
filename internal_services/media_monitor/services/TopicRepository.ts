import { query } from "@/lib/db";

export interface Topic {
  id: string;
  name: string;
  semantic_queries: string[];
  negative_semantics: string[];
  positive_sarcasm_cues: string[];
  negative_sarcasm_cues: string[];
  similarity_threshold: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export async function get_active_topics(): Promise<Topic[]> {
  const res = await query<Topic>(
    `SELECT * FROM topics WHERE is_active = true ORDER BY name ASC`
  );
  return res.rows;
}

export async function get_all_topics(): Promise<Topic[]> {
  const res = await query<Topic>(
    `SELECT * FROM topics ORDER BY name ASC`
  );
  return res.rows;
}

export async function get_topic_by_name(name: string): Promise<Topic | null> {
  const res = await query<Topic>(
    `SELECT * FROM topics WHERE lower(name) = lower($1) LIMIT 1`,
    [name]
  );
  return res.rows[0] || null;
}

export async function get_topic_by_id(id: string): Promise<Topic | null> {
  const res = await query<Topic>(
    `SELECT * FROM topics WHERE id = $1 LIMIT 1`,
    [id]
  );
  return res.rows[0] || null;
}

export async function create_topic(topic: {
  name: string;
  semantic_queries?: string[];
  negative_semantics?: string[];
  positive_sarcasm_cues?: string[];
  negative_sarcasm_cues?: string[];
  similarity_threshold?: number;
  is_active?: boolean;
}): Promise<Topic> {
  const res = await query<Topic>(
    `
    INSERT INTO topics (
      name,
      semantic_queries,
      negative_semantics,
      positive_sarcasm_cues,
      negative_sarcasm_cues,
      similarity_threshold,
      is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
    `,
    [
      topic.name,
      JSON.stringify(topic.semantic_queries || []),
      JSON.stringify(topic.negative_semantics || []),
      JSON.stringify(topic.positive_sarcasm_cues || []),
      JSON.stringify(topic.negative_sarcasm_cues || []),
      topic.similarity_threshold ?? 0.45,
      topic.is_active ?? true
    ]
  );
  return res.rows[0];
}

export async function update_topic(
  id: string,
  topic: {
    name?: string;
    semantic_queries?: string[];
    negative_semantics?: string[];
    positive_sarcasm_cues?: string[];
    negative_sarcasm_cues?: string[];
    similarity_threshold?: number;
    is_active?: boolean;
  }
): Promise<Topic | null> {
  const current = await get_topic_by_id(id);
  if (!current) return null;

  const name = topic.name !== undefined ? topic.name : current.name;
  const semantic_queries = topic.semantic_queries !== undefined ? JSON.stringify(topic.semantic_queries) : JSON.stringify(current.semantic_queries);
  const negative_semantics = topic.negative_semantics !== undefined ? JSON.stringify(topic.negative_semantics) : JSON.stringify(current.negative_semantics);
  const positive_sarcasm_cues = topic.positive_sarcasm_cues !== undefined ? JSON.stringify(topic.positive_sarcasm_cues) : JSON.stringify(current.positive_sarcasm_cues);
  const negative_sarcasm_cues = topic.negative_sarcasm_cues !== undefined ? JSON.stringify(topic.negative_sarcasm_cues) : JSON.stringify(current.negative_sarcasm_cues);
  const similarity_threshold = topic.similarity_threshold !== undefined ? topic.similarity_threshold : current.similarity_threshold;
  const is_active = topic.is_active !== undefined ? topic.is_active : current.is_active;

  const res = await query<Topic>(
    `
    UPDATE topics
    SET
      name = $1,
      semantic_queries = $2,
      negative_semantics = $3,
      positive_sarcasm_cues = $4,
      negative_sarcasm_cues = $5,
      similarity_threshold = $6,
      is_active = $7,
      updated_at = NOW()
    WHERE id = $8
    RETURNING *
    `,
    [
      name,
      semantic_queries,
      negative_semantics,
      positive_sarcasm_cues,
      negative_sarcasm_cues,
      similarity_threshold,
      is_active,
      id
    ]
  );
  return res.rows[0] || null;
}

export async function delete_topic(id: string): Promise<boolean> {
  const res = await query(`DELETE FROM topics WHERE id = $1`, [id]);
  return (res.rowCount ?? 0) > 0;
}
