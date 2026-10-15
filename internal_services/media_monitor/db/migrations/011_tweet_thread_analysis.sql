-- Migration: Placeholder for tweet thread analysis
-- Stores results of future clustering/stance/theme extraction on threads.

CREATE TABLE IF NOT EXISTS tweet_thread_analysis (
    root_tweet_id TEXT PRIMARY KEY REFERENCES tweets(id) ON DELETE CASCADE,
    analysis_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
