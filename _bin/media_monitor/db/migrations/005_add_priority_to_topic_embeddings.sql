-- Migration: Add weight_priority column to topic_embeddings table
-- Drops the existing simple topic_embeddings table and recreates it with weight_priority.

DROP TABLE IF EXISTS topic_embeddings CASCADE;

CREATE TABLE topic_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  field_name VARCHAR(50) NOT NULL, -- 'topic_name', 'semantic_queries', 'negative_semantics', 'positive_sarcasm_cues', 'negative_sarcasm_cues'
  text TEXT NOT NULL,
  embedding vector(384) NOT NULL,
  weight_priority INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS ix_topic_embeddings_topic_id ON topic_embeddings(topic_id);
CREATE INDEX IF NOT EXISTS ix_topic_embeddings_field_name ON topic_embeddings(field_name);
