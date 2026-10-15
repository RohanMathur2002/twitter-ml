from dataclasses import dataclass
from typing import Any
import asyncio

from config.logging import get_logger
from database.repositories.intelligence_repository import IntelligenceRepository
from services.stance_classifier_service import StanceClassifierService

logger = get_logger(__name__)


class ProfileIntelligenceService:
    def __init__(
        self,
        repository: IntelligenceRepository,
        classifier: StanceClassifierService,
    ) -> None:
        self._repository = repository
        self._classifier = classifier

    async def compute_and_save_stream(self, profile_id: int, topic_id: str, model_name: str | None = None):
        logger.info("computing_intelligence_stream", profile_id=profile_id, topic_id=topic_id)
        
        yield {"status": "fetching_metadata"}
        # 1. Get Topic metadata
        topic = await self._repository.get_topic(topic_id)
        if not topic:
            logger.warning("topic_not_found", topic_id=topic_id)
            yield {"status": "error", "message": "Topic not found"}
            return
            
        yield {"status": "fetching_tweets"}
        # 2. Get semantic signals for all tweets for this profile vs this topic
        signals = await self._repository.get_semantic_signals(profile_id, topic_id, model_name=model_name)
        total_tweets = len(signals)
        
        if total_tweets == 0:
            logger.info("no_tweets_for_profile", profile_id=profile_id)
            yield {"status": "error", "message": "No tweets found for this profile."}
            return

        yield {"status": "filtering_relevant", "total_tweets": total_tweets}
        # 3. Filter relevant tweets based on semantic similarity (positive wins over negative discount)
        relevant_signals = []
        for s in signals:
            effective_relevance = s.positive_signal - (s.negative_signal * 0.5)
            if effective_relevance >= 0.30:
                relevant_signals.append((effective_relevance, s))
                
        # Calculate coverage
        true_matching_count = len(relevant_signals)
        coverage_pct = (true_matching_count / total_tweets) * 100 if total_tweets > 0 else 0

        # Sort by relevance and classify based on confidence > 30% (with a safe limit of 300 to prevent uvicorn timeouts)
        relevant_signals.sort(key=lambda x: x[0], reverse=True)
        relevant_signals = [s[1] for s in relevant_signals[:300]]
        
        matching_count = len(relevant_signals)
        
        # 4. Relevance Score: weighted average positive signal across ALL tweets
        raw_relevance = sum(s.positive_signal for s in signals) / total_tweets if total_tweets > 0 else 0.0
        
        # 5. Sarcasm Confidence: 1 - mean sarcasm signal across relevant tweets
        mean_sarcasm = sum(s.sarcasm_signal for s in relevant_signals) / matching_count if matching_count > 0 else 0.0
        sarcasm_confidence = max(0.5, 1.0 - (mean_sarcasm * 0.5))
        
        # 6. ML Zero-Shot Classification on Relevant Tweets
        raw_supportive = 0.0
        raw_opposition = 0.0
        sample_supportive = []
        sample_opposition = []
        
        if matching_count > 0:
            yield {"status": "classifying", "current": 0, "total": matching_count}
            
            supportive_count = 0
            opposition_count = 0
            
            chunk_size = 10
            for i in range(0, matching_count, chunk_size):
                chunk_signals = relevant_signals[i:i + chunk_size]
                texts = [s.clean_text or s.raw_text or "" for s in chunk_signals]
                # Truncation is now handled by the stance classifier service pipeline
                
                # Predict batch
                predictions = self._classifier.classify_batch(texts, topic.name)
                
                for s, pred in zip(chunk_signals, predictions, strict=False):
                    # We calculate net_stance purely from the ML probabilities
                    probs_map = dict(pred.probabilities)
                    p_supp = probs_map.get("supportive", 0.0)
                    p_opp = probs_map.get("opposition", 0.0)
                    
                    # ML net stance (positive means supportive, negative means opposition)
                    ml_net_stance = p_supp - p_opp
                    
                    if pred.label == "supportive":
                        supportive_count += 1
                        sample_supportive.append({
                            "tweet_id": s.tweet_id,
                            "text": pred.text,
                            "positive_signal": round(s.positive_signal, 3),
                            "negative_signal": round(s.negative_signal, 3),
                            "sarcasm_signal": round(s.sarcasm_signal, 3),
                            "ml_stance": round(ml_net_stance, 3)
                        })
                    elif pred.label == "opposition":
                        opposition_count += 1
                        sample_opposition.append({
                            "tweet_id": s.tweet_id,
                            "text": pred.text,
                            "positive_signal": round(s.positive_signal, 3),
                            "negative_signal": round(s.negative_signal, 3),
                            "sarcasm_signal": round(s.sarcasm_signal, 3),
                            "ml_stance": round(ml_net_stance, 3)
                        })
                
                # Save incremental checkpoint after each batch so progress is never lost if interrupted
                current_processed = min(i + chunk_size, matching_count)
                if current_processed > 0:
                    curr_raw_supp = supportive_count / current_processed
                    curr_raw_opp = opposition_count / current_processed
                    curr_supp = curr_raw_supp * sarcasm_confidence
                    curr_opp = curr_raw_opp * sarcasm_confidence
                    
                    clamp_val = lambda v: max(0.0, min(1.0, v))
                    
                    checkpoint_result = {
                        "profile_id": profile_id,
                        "topic_id": topic_id,
                        "relevance_score": clamp_val(raw_relevance),
                        "supportive_score": clamp_val(curr_supp),
                        "opposition_score": clamp_val(curr_opp),
                        "sarcasm_confidence": clamp_val(sarcasm_confidence),
                        "tweet_coverage_percent": round(coverage_pct, 1),
                        "strongest_matching_terms": [],
                        "sample_supportive_tweets": sorted(sample_supportive, key=lambda x: x["ml_stance"], reverse=True)[:5],
                        "sample_opposition_tweets": sorted(sample_opposition, key=lambda x: x["ml_stance"])[:5],
                        "debug_signals": {
                            "avg_sarcasm_sim": round(mean_sarcasm, 3),
                            "raw_relevance": round(raw_relevance, 3),
                            "raw_supportive": round(curr_raw_supp, 3),
                            "raw_opposition": round(curr_raw_opp, 3)
                        },
                        "total_tweets_analyzed": total_tweets,
                        "matching_tweets_count": current_processed,
                    }
                    try:
                        await self._repository.save_profile_intelligence(checkpoint_result)
                    except Exception as chk_err:
                        logger.warning(f"Checkpoint save error: {chk_err}")

                yield {"status": "classifying", "current": current_processed, "total": matching_count}
                await asyncio.sleep(0)
                    
            raw_supportive = supportive_count / matching_count
            raw_opposition = opposition_count / matching_count
            
            # Sort samples by strongest ml_stance
            sample_supportive.sort(key=lambda x: x["ml_stance"], reverse=True)
            sample_opposition.sort(key=lambda x: x["ml_stance"])  # lowest (most negative) is strongest opposition
            
            sample_supportive = sample_supportive[:5]
            sample_opposition = sample_opposition[:5]
            
        # Scale by sarcasm confidence
        supportive_score = raw_supportive * sarcasm_confidence
        opposition_score = raw_opposition * sarcasm_confidence
        
        # Clamp function
        clamp = lambda v: max(0.0, min(1.0, v))
        
        yield {"status": "saving"}
        # 7. Strongest matching terms
        strongest_terms = await self._repository.get_strongest_matching_terms(profile_id, topic_id)
        
        # 8. Build Result
        debug_signals = {
            "avg_sarcasm_sim": round(mean_sarcasm, 3),
            "raw_relevance": round(raw_relevance, 3),
            "raw_supportive": round(raw_supportive, 3),
            "raw_opposition": round(raw_opposition, 3)
        }
        
        result = {
            "profile_id": profile_id,
            "topic_id": topic_id,
            "relevance_score": clamp(raw_relevance),
            "supportive_score": clamp(supportive_score),
            "opposition_score": clamp(opposition_score),
            "sarcasm_confidence": clamp(sarcasm_confidence),
            "tweet_coverage_percent": round(coverage_pct, 1),
            "strongest_matching_terms": strongest_terms,
            "sample_supportive_tweets": sample_supportive,
            "sample_opposition_tweets": sample_opposition,
            "debug_signals": debug_signals,
            "total_tweets_analyzed": total_tweets,
            "matching_tweets_count": true_matching_count,
        }
        
        # 9. Save final dossier
        await self._repository.save_profile_intelligence(result)
        
        # Return for the API response
        yield {"status": "complete", "result": result}
