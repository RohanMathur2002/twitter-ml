-- Migration: Create profile_topic_map_coordinates table
-- Stores 2D UMAP coordinates for topic-specific semantic profile mapping

CREATE TABLE IF NOT EXISTS profile_topic_map_coordinates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id BIGINT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  cluster_id INTEGER,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, topic_id)
);

CREATE INDEX IF NOT EXISTS ix_ptmc_profile_id ON profile_topic_map_coordinates(profile_id);
CREATE INDEX IF NOT EXISTS ix_ptmc_topic_id ON profile_topic_map_coordinates(topic_id);
