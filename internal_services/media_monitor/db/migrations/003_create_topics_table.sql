-- Create topics table
CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  semantic_queries JSONB NOT NULL DEFAULT '[]'::jsonb,
  negative_semantics JSONB NOT NULL DEFAULT '[]'::jsonb,
  positive_sarcasm_cues JSONB NOT NULL DEFAULT '[]'::jsonb,
  negative_sarcasm_cues JSONB NOT NULL DEFAULT '[]'::jsonb,
  similarity_threshold REAL NOT NULL DEFAULT 0.45,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Useful indexes
CREATE INDEX IF NOT EXISTS ix_topics_is_active ON topics(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS ix_topics_name_lower_idx ON topics(lower(name));
