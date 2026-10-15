CREATE TABLE IF NOT EXISTS tweet_keywords (
    tweet_id VARCHAR(50) NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
    keyword VARCHAR(255) NOT NULL,
    PRIMARY KEY (tweet_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_tweet_keywords_keyword ON tweet_keywords(keyword);
