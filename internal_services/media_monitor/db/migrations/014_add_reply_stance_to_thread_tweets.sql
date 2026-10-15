-- Migration: Add stance cache columns to thread_tweets table
-- Supports caching stance predictions for individual thread replies to avoid repeated ML runs.

BEGIN;

ALTER TABLE thread_tweets ADD COLUMN IF NOT EXISTS stance_label VARCHAR(20);
ALTER TABLE thread_tweets ADD COLUMN IF NOT EXISTS stance_score DOUBLE PRECISION;

COMMIT;
