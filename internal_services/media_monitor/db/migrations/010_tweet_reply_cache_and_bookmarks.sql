-- Migration: Create tweet reply cache and bookmarks tables
-- Replaces primary key on tweet_embeddings to support multiple models.

BEGIN;

-- Drop primary key on tweet_embeddings and make it composite
ALTER TABLE tweet_embeddings DROP CONSTRAINT IF EXISTS tweet_embeddings_pkey;
ALTER TABLE tweet_embeddings ADD PRIMARY KEY (tweet_id, model_name);

-- Table for caching searched tweet threads
CREATE TABLE IF NOT EXISTS tweet_reply_cache (
    tweet_id TEXT PRIMARY KEY REFERENCES tweets(id) ON DELETE CASCADE,
    root_tweet_id TEXT NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
    type VARCHAR(10) NOT NULL CHECK (type IN ('tweet', 'reply')),
    fetch_count INT NOT NULL DEFAULT 1,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_tweet_reply_cache_root ON tweet_reply_cache(root_tweet_id);
CREATE INDEX IF NOT EXISTS ix_tweet_reply_cache_fetched_at ON tweet_reply_cache(fetched_at);

-- Table for bookmarked tweets
CREATE TABLE IF NOT EXISTS bookmarked_tweets (
    tweet_id TEXT PRIMARY KEY REFERENCES tweets(id) ON DELETE CASCADE,
    root_tweet_id TEXT NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
    type VARCHAR(10) NOT NULL,
    bookmarked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
