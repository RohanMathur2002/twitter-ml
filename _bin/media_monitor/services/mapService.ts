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
  // Optional stance stats if we join with profile_topic_intelligence
  relevance_score?: number;
  supportive_score?: number;
  opposition_score?: number;
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
      m.id,
      m.profile_id,
      p.username,
      p.display_name,
      p.profile_image_url,
      m.x,
      m.y,
      m.cluster_id,
      m.generated_at,
      pti.relevance_score,
      pti.supportive_score,
      pti.opposition_score
    FROM profile_topic_map_coordinates m
    JOIN profiles p ON p.id = m.profile_id
    LEFT JOIN profile_topic_intelligence pti ON pti.profile_id = m.profile_id AND pti.topic_id = m.topic_id
    WHERE m.topic_id = $1
  `, [topicId]);
  return res.rows as any as MapCoordinate[];
}
