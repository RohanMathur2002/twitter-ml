-- Migration: Create profile_map_coordinates table
-- Stores 2D UMAP coordinates for global semantic profile mapping

CREATE TABLE IF NOT EXISTS profile_map_coordinates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id BIGINT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  cluster_id INTEGER,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id)
);

CREATE INDEX IF NOT EXISTS ix_pmc_profile_id ON profile_map_coordinates(profile_id);
