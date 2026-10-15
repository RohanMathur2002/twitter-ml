-- Migration: Create profile_topic_intelligence table
-- Stores cached profile-level topic analysis results with explainability data.

CREATE TABLE IF NOT EXISTS profile_topic_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id BIGINT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  
  -- Aggregated scores (independent dimensions, do NOT sum to 1)
  relevance_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  supportive_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  opposition_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  sarcasm_confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0, -- 1.0 = fully literal, lower = more sarcasm detected
  tweet_coverage_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  
  -- Explainability
  strongest_matching_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
  sample_supportive_tweets JSONB NOT NULL DEFAULT '[]'::jsonb,
  sample_opposition_tweets JSONB NOT NULL DEFAULT '[]'::jsonb,
  debug_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  total_tweets_analyzed INTEGER NOT NULL DEFAULT 0,
  matching_tweets_count INTEGER NOT NULL DEFAULT 0,
  
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, topic_id)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS ix_pti_profile_id ON profile_topic_intelligence(profile_id);
CREATE INDEX IF NOT EXISTS ix_pti_topic_id ON profile_topic_intelligence(topic_id);
CREATE INDEX IF NOT EXISTS ix_pti_analyzed_at ON profile_topic_intelligence(analyzed_at DESC);
