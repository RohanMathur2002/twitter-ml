-- Migration: 009_multi_projection_map.sql
-- Adds projection_type to support multiple Map modes (Canonical, Narrative, Ideology, etc.)

ALTER TABLE profile_map_coordinates 
ADD COLUMN IF NOT EXISTS projection_type VARCHAR(50) NOT NULL DEFAULT 'canonical';

-- Drop the old unique constraint (which restricted it to 1 row per profile)
ALTER TABLE profile_map_coordinates 
DROP CONSTRAINT IF EXISTS profile_map_coordinates_profile_id_key;

-- Add a composite unique constraint allowing 1 row per profile PER projection type
ALTER TABLE profile_map_coordinates 
ADD CONSTRAINT pmc_profile_projection_unique UNIQUE (profile_id, projection_type);

-- Update indexes for faster querying by projection type
CREATE INDEX IF NOT EXISTS ix_pmc_projection_type ON profile_map_coordinates(projection_type);
