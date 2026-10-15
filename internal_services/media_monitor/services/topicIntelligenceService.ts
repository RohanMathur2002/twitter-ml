import { query, transaction } from "@/lib/db";

// ─── Output types ────────────────────────────────────────────────────────────

export interface TopicIntelligenceResult {
  profile: string;
  topic_id: string;
  topic_name: string;
  /** How much the profile discusses this topic. Independent of stance. */
  relevance_score: number;
  /** Proportion of relevant tweets showing positive semantic alignment. Scaled by sarcasm_confidence. */
  supportive_score: number;
  /** Proportion of relevant tweets showing negative/opposition semantic framing. Scaled by sarcasm_confidence. */
  opposition_score: number;
  /** 1.0 = we can interpret scores literally. Lower = strong sarcasm cue overlap → scores are less reliable. */
  sarcasm_confidence: number;
  /** % of all profile tweets that exceeded the topic similarity threshold. */
  tweet_coverage_percent: number;
  /** Most semantically relevant topic terms in descending match strength. */
  strongest_matching_terms: MatchingTerm[];
  /** Top tweets with positive topic alignment (id, text, score). */
  sample_supportive_tweets: SampleTweet[];
  /** Top tweets with opposition / negative framing (id, text, score). */
  sample_opposition_tweets: SampleTweet[];
  /** Raw signal breakdown for debugging / explainability. */
  debug_signals: DebugSignals;
  total_tweets_analyzed: number;
  matching_tweets_count: number;
  analyzed_at: string;
}

export interface MatchingTerm {
  text: string;
  field_name: string;
  weight_priority: number;
  avg_similarity: number;
}

export interface SampleTweet {
  tweet_id: string;
  text: string;
  positive_signal: number;
  negative_signal: number;
  sarcasm_signal: number;
}

export interface DebugSignals {
  topic_embedding_count: number;
  tweet_embedding_count: number;
  avg_positive_sim_above_threshold: number;
  avg_negative_sim_above_threshold: number;
  avg_sarcasm_sim: number;
  raw_relevance: number;
  raw_supportive: number;
  raw_opposition: number;
}

// ─── Main analysis function ───────────────────────────────────────────────────

/**
 * Analyzes a profile's tweet embeddings against a single topic's embeddings.
 * All cosine similarity computation runs inside PostgreSQL via pgvector — no
 * raw vectors are transferred to Node.js.
 *
 * Scoring semantics:
 *  - relevance_score:   How much does this profile discuss the topic? (0–1)
 *  - supportive_score:  Positive semantic alignment among relevant tweets (0–1)
 *  - opposition_score:  Negative / critical framing among relevant tweets (0–1)
 *  - sarcasm_confidence: 1 = literal, lower = strong sarcasm cue overlap (0–1)
 *
 * Scores are INDEPENDENT — they don't sum to 1. A journalistic / mixed-stance
 * profile can have high relevance with low support AND low opposition.
 */
export async function analyzeProfileForTopic(
  profileId: number,
  topicId: string
): Promise<TopicIntelligenceResult | null> {
  console.log(
    `[TopicIntelligence] Starting analysis: profile ${profileId} × topic ${topicId} via ml-fastapi`
  );

  try {
    const mlApiUrl = process.env.ML_FASTAPI_URL || "http://localhost:8000";
    const response = await fetch(`${mlApiUrl}/intelligence/profile-topic/${profileId}/${topicId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`[TopicIntelligence] Topic not found or no tweets for profile ${profileId}`);
        return null;
      }
      const errorText = await response.text();
      console.error(`[TopicIntelligence] ML service failed: ${response.status} ${errorText}`);
      return null;
    }

    const data = await response.json();
    return data as any;
  } catch (err) {
    console.error(`[TopicIntelligence] Error calling ML service:`, err);
    return null;
  }
}

// ─── Fetch cached result ──────────────────────────────────────────────────────

export async function getCachedProfileTopicIntelligence(
  profileId: number,
  topicId: string
): Promise<TopicIntelligenceResult | null> {
  const res = await query<{
    relevance_score: number;
    supportive_score: number;
    opposition_score: number;
    sarcasm_confidence: number;
    tweet_coverage_percent: number;
    strongest_matching_terms: MatchingTerm[];
    sample_supportive_tweets: SampleTweet[];
    sample_opposition_tweets: SampleTweet[];
    debug_signals: DebugSignals;
    total_tweets_analyzed: number;
    matching_tweets_count: number;
    analyzed_at: string;
    topic_name: string;
  }>(
    `
    SELECT
      pti.relevance_score,
      pti.supportive_score,
      pti.opposition_score,
      pti.sarcasm_confidence,
      pti.tweet_coverage_percent,
      pti.strongest_matching_terms,
      pti.sample_supportive_tweets,
      pti.sample_opposition_tweets,
      pti.debug_signals,
      pti.total_tweets_analyzed,
      pti.matching_tweets_count,
      pti.analyzed_at,
      t.name AS topic_name
    FROM profile_topic_intelligence pti
    JOIN topics t ON t.id = pti.topic_id
    WHERE pti.profile_id = $1 AND pti.topic_id = $2
    LIMIT 1
    `,
    [profileId, topicId]
  );

  if (res.rowCount === 0) return null;

  const row = res.rows[0];
  return {
    profile: "",  // caller fills this in
    topic_id: topicId,
    topic_name: row.topic_name,
    relevance_score: row.relevance_score,
    supportive_score: row.supportive_score,
    opposition_score: row.opposition_score,
    sarcasm_confidence: row.sarcasm_confidence,
    tweet_coverage_percent: row.tweet_coverage_percent,
    strongest_matching_terms: row.strongest_matching_terms,
    sample_supportive_tweets: row.sample_supportive_tweets,
    sample_opposition_tweets: row.sample_opposition_tweets,
    debug_signals: row.debug_signals,
    total_tweets_analyzed: row.total_tweets_analyzed,
    matching_tweets_count: row.matching_tweets_count,
    analyzed_at: row.analyzed_at,
  };
}
