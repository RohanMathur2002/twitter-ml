"use server";

import { fetchProfiles } from "./topics";
import { query } from "@/lib/db";

export async function getAllProfilesForCompare() {
  return await fetchProfiles();
}

export async function getEmbeddingRuns(username: string) {
  try {
    const res = await query(
      `SELECT model_name, started_at, completed_at, tweets_processed, tweets_skipped, duration 
       FROM embedding_runs 
       WHERE LOWER(profile_id) = LOWER($1)
       ORDER BY started_at DESC`,
      [username]
    );
    return res.rows.map(row => ({
      model_name: String(row.model_name),
      started_at: row.started_at instanceof Date ? row.started_at.toISOString() : String(row.started_at),
      completed_at: row.completed_at instanceof Date ? row.completed_at.toISOString() : (row.completed_at ? String(row.completed_at) : null),
      tweets_processed: Number(row.tweets_processed),
      tweets_skipped: Number(row.tweets_skipped),
      duration: row.duration ? Number(row.duration) : null,
    }));
  } catch (err) {
    console.error("getEmbeddingRuns error:", err);
    return [];
  }
}

export async function getEmbeddingsCount(username: string) {
  try {
    const res = await query(
      `SELECT e.model_name, COUNT(*)::int as count
       FROM tweet_embeddings e 
       JOIN tweets t ON e.tweet_id = t.id 
       JOIN profiles p ON p.id = t.profile_id 
       WHERE LOWER(p.username) = LOWER($1)
       GROUP BY e.model_name`,
      [username]
    );
    const countMap: Record<string, number> = {};
    res.rows.forEach(row => {
      countMap[row.model_name] = Number(row.count);
    });
    return countMap;
  } catch (err) {
    console.error("getEmbeddingsCount error:", err);
    return {};
  }
}
