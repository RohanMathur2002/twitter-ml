-- Migration: Create bookmarked_profile_tweets for bookmarking tweets from the profile page
-- Thread-page bookmarks are handled via thread_tweets.is_bookmarked

BEGIN;

CREATE TABLE IF NOT EXISTS bookmarked_profile_tweets (
    tweet_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    bookmarked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_bpt_username ON bookmarked_profile_tweets(username);
CREATE INDEX IF NOT EXISTS ix_bpt_bookmarked_at ON bookmarked_profile_tweets(bookmarked_at DESC);

COMMIT;
