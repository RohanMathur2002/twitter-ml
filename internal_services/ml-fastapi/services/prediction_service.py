from dataclasses import dataclass
from typing import Any

import numpy as np

from services.embedding_service import EmbeddingService
from services.model_service import ModelService
from services.preprocessing_service import PreprocessingService


@dataclass(frozen=True)
class Prediction:
    text: str
    cleaned_text: str
    label: str
    score: float | None
    probabilities: list[tuple[str, float]]


class PredictionService:
    """Coordinates preprocessing, embedding, and classifier inference."""

    def __init__(
        self,
        preprocessing_service: PreprocessingService,
        embedding_service: EmbeddingService,
        model_service: ModelService,
    ) -> None:
        self._preprocessing_service = preprocessing_service
        self._embedding_service = embedding_service
        self._model_service = model_service

    def predict(self, text: str, include_probabilities: bool) -> Prediction:
        classifier = self._require_classifier()
        cleaned_text = self._preprocessing_service.clean(text)
        embedding = self._embedding_service.embed_one(cleaned_text).reshape(1, -1)

        predicted_class = classifier.predict(embedding)[0]
        label = self._decode_label(predicted_class)

        probabilities: list[tuple[str, float]] = []
        score: float | None = None
        if include_probabilities and hasattr(classifier, "predict_proba"):
            probability_values = classifier.predict_proba(embedding)[0]
            probabilities = self._format_probabilities(probability_values)
            score = max((probability for _, probability in probabilities), default=None)

        return Prediction(
            text=text,
            cleaned_text=cleaned_text,
            label=label,
            score=score,
            probabilities=probabilities,
        )

    def _require_classifier(self) -> Any:
        if self._model_service.classifier is None:
            raise RuntimeError("Classifier artifact is not loaded.")
        return self._model_service.classifier

    def _decode_label(self, predicted_class: Any) -> str:
        label_encoder = self._model_service.label_encoder
        if label_encoder is None:
            return str(predicted_class)
        return str(label_encoder.inverse_transform([predicted_class])[0])

    def _format_probabilities(self, probabilities: np.ndarray) -> list[tuple[str, float]]:
        classifier = self._require_classifier()
        classes = getattr(classifier, "classes_", range(len(probabilities)))

        formatted: list[tuple[str, float]] = []
        for class_value, probability in zip(classes, probabilities, strict=False):
            formatted.append((self._decode_label(class_value), float(probability)))
        return sorted(formatted, key=lambda item: item[1], reverse=True)

