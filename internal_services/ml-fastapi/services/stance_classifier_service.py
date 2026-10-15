from dataclasses import dataclass
from typing import Any

from config.logging import get_logger
from services.model_service import ModelService

logger = get_logger(__name__)


@dataclass(frozen=True)
class StancePrediction:
    text: str
    label: str
    score: float
    probabilities: list[tuple[str, float]]


class StanceClassifierService:
    """Wraps zero-shot classification for stance detection."""

    def __init__(self, model_service: ModelService) -> None:
        self._model_service = model_service
        self.candidate_labels = ["supportive", "opposition", "neutral"]

    def classify_stance(self, text: str, topic_name: str) -> StancePrediction:
        """Classify the stance of the text towards the given topic."""
        classifier = self._model_service.require_stance_classifier()
        
        # We can format the candidate labels to be topic-specific for better zero-shot performance
        topic_labels = [
            f"supportive of {topic_name}",
            f"opposed to {topic_name}",
            f"neutral about {topic_name}",
        ]
        
        result = classifier(text, topic_labels, truncation=True, max_length=512)
        
        # result format: {'sequence': text, 'labels': [...], 'scores': [...]}
        # We map the specific labels back to the generic candidate_labels
        labels_map = {
            topic_labels[0]: "supportive",
            topic_labels[1]: "opposition",
            topic_labels[2]: "neutral",
        }
        
        raw_labels = result["labels"]
        raw_scores = result["scores"]
        
        best_label = labels_map[raw_labels[0]]
        best_score = raw_scores[0]
        
        probabilities = [
            (labels_map[label], float(score))
            for label, score in zip(raw_labels, raw_scores, strict=False)
        ]
        
        return StancePrediction(
            text=text,
            label=best_label,
            score=float(best_score),
            probabilities=probabilities
        )

    def classify_batch(self, texts: list[str], topic_name: str) -> list[StancePrediction]:
        """Classify the stance of a batch of texts towards the given topic."""
        classifier = self._model_service.require_stance_classifier()
        
        if not texts:
            return []
        
        # Filter out empty or whitespace-only strings — the pipeline throws ValueError on them
        valid_indices = [i for i, t in enumerate(texts) if t and t.strip()]
        valid_texts = [texts[i] for i in valid_indices]
        
        if not valid_texts:
            logger.warning("classify_batch: all texts were empty after filtering, returning []",
                           original_count=len(texts))
            return []
            
        topic_labels = [
            f"supportive of {topic_name}",
            f"opposed to {topic_name}",
            f"neutral about {topic_name}",
        ]
        
        logger.info("classify_batch_start", valid_count=len(valid_texts), skipped=len(texts) - len(valid_texts))
        results = classifier(valid_texts, topic_labels, truncation=True, max_length=512)
        
        # Handle single result case (pipeline behavior when batch size is 1)
        if isinstance(results, dict):
            results = [results]
            
        labels_map = {
            topic_labels[0]: "supportive",
            topic_labels[1]: "opposition",
            topic_labels[2]: "neutral",
        }
        
        predictions = []
        for result, text in zip(results, valid_texts, strict=False):
            raw_labels = result["labels"]
            raw_scores = result["scores"]
            
            best_label = labels_map[raw_labels[0]]
            best_score = raw_scores[0]
            
            probabilities = [
                (labels_map[label], float(score))
                for label, score in zip(raw_labels, raw_scores, strict=False)
            ]
            
            predictions.append(StancePrediction(
                text=text,
                label=best_label,
                score=float(best_score),
                probabilities=probabilities
            ))
            
        return predictions
