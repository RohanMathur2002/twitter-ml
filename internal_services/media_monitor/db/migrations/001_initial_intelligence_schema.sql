-- Media Monitor intelligence-layer schema.
-- Run this against the media_monitor database.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE profiles (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  display_name TEXT,
  bio TEXT,
  followers_count BIGINT NOT NULL DEFAULT 0,
  following_count BIGINT NOT NULL DEFAULT 0,
  tweet_count BIGINT NOT NULL DEFAULT 0,
  verified BOOLEAN NOT NULL DEFAULT false,
  profile_image_url TEXT,
  location TEXT,
  account_created_at TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_profile_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE profiles IS 'Stable account/profile metadata for monitored social accounts.';
COMMENT ON COLUMN profiles.raw_profile_json IS 'Raw provider payload retained for replay, audits, and parser upgrades.';

CREATE UNIQUE INDEX profiles_username_uidx ON profiles (lower(username));
CREATE INDEX profiles_followers_count_idx ON profiles (followers_count DESC);

CREATE TABLE tweets (
  id TEXT PRIMARY KEY,
  profile_id BIGINT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  clean_text TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  likes_count BIGINT NOT NULL DEFAULT 0,
  retweets_count BIGINT NOT NULL DEFAULT 0,
  replies_count BIGINT NOT NULL DEFAULT 0,
  bookmarks_count BIGINT,
  views_count BIGINT,
  lang TEXT,
  source TEXT,
  is_retweet BOOLEAN NOT NULL DEFAULT false,
  is_reply BOOLEAN NOT NULL DEFAULT false,
  conversation_id TEXT,
  quoted_tweet_id TEXT,
  in_reply_to_tweet_id TEXT,
  hashtags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  mentions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  emojis JSONB NOT NULL DEFAULT '[]'::jsonb,
  media JSONB NOT NULL DEFAULT '[]'::jsonb,
  embedding vector(384),
  raw_tweet_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE tweets IS 'Canonical tweet/event storage layer. Keep this table append-friendly and queryable at high volume.';
COMMENT ON COLUMN tweets.embedding IS '384-dimensional semantic embedding for similarity search. Populate asynchronously.';
COMMENT ON COLUMN tweets.raw_tweet_json IS 'Raw tweet/provider payload retained for replay, audits, and parser upgrades.';

CREATE INDEX tweets_created_at_idx ON tweets (created_at DESC);
CREATE INDEX tweets_profile_id_idx ON tweets (profile_id);
CREATE INDEX tweets_lang_idx ON tweets (lang);
CREATE INDEX tweets_hashtags_gin_idx ON tweets USING GIN (hashtags);
-- Enable after embeddings are populated and pgvector index parameters are tuned for data volume.
-- CREATE INDEX tweets_embedding_hnsw_idx ON tweets USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE TABLE profile_analysis (
  profile_id BIGINT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  top_hashtags JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_mentions JSONB NOT NULL DEFAULT '[]'::jsonb,
  topic_distribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  sentiment_distribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  active_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  ideology_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  toxicity_score DOUBLE PRECISION,
  bot_probability DOUBLE PRECISION,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE profile_analysis IS 'Aggregated behavioral, topical, sentiment, and risk metadata per profile.';

CREATE TABLE clusters (
  id BIGSERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  summary TEXT,
  ideology TEXT,
  dominant_emotion TEXT,
  top_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_hashtags JSONB NOT NULL DEFAULT '[]'::jsonb,
  representative_tweets JSONB NOT NULL DEFAULT '[]'::jsonb,
  tweet_count BIGINT NOT NULL DEFAULT 0,
  cluster_embedding vector(384),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE clusters IS 'Narrative or topic clusters produced from tweet embeddings and downstream analysis.';
COMMENT ON COLUMN clusters.cluster_embedding IS 'Centroid embedding for topic/narrative retrieval.';

CREATE INDEX clusters_ideology_idx ON clusters (ideology);
CREATE INDEX clusters_dominant_emotion_idx ON clusters (dominant_emotion);
-- Enable after cluster embeddings are populated and tuned.
-- CREATE INDEX clusters_embedding_hnsw_idx ON clusters USING hnsw (cluster_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE TABLE cluster_tweets (
  cluster_id BIGINT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  tweet_id TEXT NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
  similarity_score DOUBLE PRECISION,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cluster_id, tweet_id)
);

COMMENT ON TABLE cluster_tweets IS 'Many-to-many assignment between tweets and narrative/topic clusters.';

CREATE INDEX cluster_tweets_cluster_id_idx ON cluster_tweets (cluster_id);
CREATE INDEX cluster_tweets_tweet_id_idx ON cluster_tweets (tweet_id);

CREATE TABLE hashtag_stats (
  hashtag TEXT PRIMARY KEY,
  usage_count BIGINT NOT NULL DEFAULT 0,
  unique_profiles_count BIGINT NOT NULL DEFAULT 0,
  avg_engagement DOUBLE PRECISION NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  growth_rate DOUBLE PRECISION,
  related_hashtags JSONB NOT NULL DEFAULT '[]'::jsonb
);

COMMENT ON TABLE hashtag_stats IS 'Aggregated hashtag trend, usage, growth, and related-hashtag metadata.';

CREATE INDEX hashtag_stats_usage_count_idx ON hashtag_stats (usage_count DESC);
CREATE INDEX hashtag_stats_growth_rate_idx ON hashtag_stats (growth_rate DESC NULLS LAST);

CREATE TABLE profile_relationships (
  source_profile_id BIGINT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_profile_id BIGINT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  interaction_count BIGINT NOT NULL DEFAULT 1,
  last_interaction_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_profile_id, target_profile_id, relationship_type),
  CONSTRAINT profile_relationships_type_chk CHECK (
    relationship_type IN ('retweet', 'mention', 'reply', 'quote')
  )
);

COMMENT ON TABLE profile_relationships IS 'Directed account interaction graph for mentions, replies, retweets, and quotes.';

CREATE INDEX profile_relationships_source_profile_id_idx ON profile_relationships (source_profile_id);
CREATE INDEX profile_relationships_target_profile_id_idx ON profile_relationships (target_profile_id);
CREATE INDEX profile_relationships_relationship_type_idx ON profile_relationships (relationship_type);

CREATE TABLE processing_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT processing_jobs_status_chk CHECK (
    status IN ('pending', 'running', 'completed', 'failed')
  )
);

COMMENT ON TABLE processing_jobs IS 'Background ingestion, enrichment, embedding, clustering, and analysis job state.';

CREATE INDEX processing_jobs_status_idx ON processing_jobs (status);
CREATE INDEX processing_jobs_job_type_idx ON processing_jobs (job_type);
