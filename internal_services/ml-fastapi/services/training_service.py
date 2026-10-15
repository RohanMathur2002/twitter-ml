from pathlib import Path

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import LabelEncoder

from config.logging import get_logger
from database.repositories.document_repository import DocumentRepository


logger = get_logger(__name__)


class TrainingService:
    """Trains a classifier from persisted labeled embeddings."""

    def __init__(self, repository: DocumentRepository) -> None:
        self._repository = repository

    async def train_from_database(
        self,
        classifier_path: Path,
        label_encoder_path: Path,
        max_rows: int | None = None,
    ) -> int:
        rows = await self._repository.list_labeled_embeddings(limit=max_rows)
        if not rows:
            raise RuntimeError("No labeled embeddings are available for training.")

        labels = [row.label for row in rows]
        if len(set(labels)) < 2:
            raise RuntimeError("At least two labels are required to train a classifier.")

        x_train = np.asarray([row.embedding for row in rows], dtype=np.float32)
        label_encoder = LabelEncoder()
        y_train = label_encoder.fit_transform(labels)

        classifier = LogisticRegression(max_iter=1_000, class_weight="balanced")
        classifier.fit(x_train, y_train)

        classifier_path.parent.mkdir(parents=True, exist_ok=True)
        label_encoder_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(classifier, classifier_path)
        joblib.dump(label_encoder, label_encoder_path)

        logger.info(
            "classifier_trained",
            rows=len(rows),
            classifier_path=str(classifier_path),
            label_encoder_path=str(label_encoder_path),
        )
        return len(rows)

