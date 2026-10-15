-- Migration: Create topic_embeddings table
-- Enables storing 384-dimensional embeddings generated from ML FastAPI for topic fields.

CREATE TABLE IF NOT EXISTS topic_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  field_name VARCHAR(50) NOT NULL, -- 'semantic_queries', 'negative_semantics', 'positive_sarcasm_cues', 'negative_sarcasm_cues'
  text TEXT NOT NULL,
  embedding vector(384) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance Index
CREATE INDEX IF NOT EXISTS ix_topic_embeddings_topic_id ON topic_embeddings(topic_id);
CREATE INDEX IF NOT EXISTS ix_topic_embeddings_field_name ON topic_embeddings(field_name);
