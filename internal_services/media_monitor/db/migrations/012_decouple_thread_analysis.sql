-- Migration: Decouple Thread Analysis from Profiles and Tweets tables
-- Drops the dependent cache and bookmark tables, and replaces them with an independent standalone architecture.

BEGIN;

-- 1. Drop existing tables that depend on `tweets` (cascading deletes)
DROP TABLE IF EXISTS tweet_thread_analysis CASCADE;
DROP TABLE IF EXISTS tweet_reply_cache CASCADE;
DROP TABLE IF EXISTS bookmarked_tweets CASCADE;

-- 2. Create standalone table for thread tweets
CREATE TABLE thread_tweets (
    id TEXT PRIMARY KEY,
    root_tweet_id TEXT NOT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('tweet', 'reply')),
    username TEXT NOT NULL,
    display_name TEXT,
    profile_image_url TEXT,
    raw_text TEXT NOT NULL,
    clean_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    likes_count BIGINT NOT NULL DEFAULT 0,
    retweets_count BIGINT NOT NULL DEFAULT 0,
    replies_count BIGINT NOT NULL DEFAULT 0,
    views_count BIGINT,
    is_bookmarked BOOLEAN NOT NULL DEFAULT false,
    fetch_count INT NOT NULL DEFAULT 1,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_thread_tweets_root ON thread_tweets(root_tweet_id);
CREATE INDEX ix_thread_tweets_fetched_at ON thread_tweets(fetched_at);

-- 3. Create standalone table for embeddings
CREATE TABLE thread_tweet_embeddings (
    tweet_id TEXT PRIMARY KEY REFERENCES thread_tweets(id) ON DELETE CASCADE,
    embedding vector(384) NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    embedded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_thread_tweet_embeddings_hnsw 
ON thread_tweet_embeddings USING hnsw (embedding vector_cosine_ops);

-- 4. Recreate thread analysis table referencing the new standalone table
CREATE TABLE tweet_thread_analysis (
    root_tweet_id TEXT PRIMARY KEY REFERENCES thread_tweets(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    topics JSONB NOT NULL DEFAULT '[]'::jsonb,
    stance TEXT,
    summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
