CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE tweets DROP COLUMN IF EXISTS embedding;

DROP TABLE IF EXISTS tweet_embeddings;

CREATE TABLE tweet_embeddings (
    tweet_id TEXT PRIMARY KEY REFERENCES tweets(id) ON DELETE CASCADE,
    embedding vector(384) NOT NULL,
    model_name VARCHAR(100) NOT NULL DEFAULT 'all-MiniLM-L6-v2',
    embedded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_tweet_embeddings_hnsw
ON tweet_embeddings
USING hnsw (embedding vector_cosine_ops);
