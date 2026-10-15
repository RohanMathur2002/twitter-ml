import gc
from pathlib import Path
from typing import Any

import joblib
import torch
from sentence_transformers import SentenceTransformer
from transformers import pipeline

from config.logging import get_logger
from config.settings import Settings


logger = get_logger(__name__)


class MissingModelArtifactError(RuntimeError):
    """Raised when a configured model artifact is required but missing."""


import threading

class ModelService:
    """Loads and owns long-lived ML artifacts for the process lifetime.
    Dynamically manages embedding model VRAM usage.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._embedding_models: dict[str, SentenceTransformer] = {}
        self._model_lock = threading.Lock()
        
        self.stance_classifier: Any | None = None
        self.classifier: Any | None = None
        self.label_encoder: Any | None = None

    async def load(self) -> None:
        self.classifier = self._load_optional_artifact(self._settings.classifier_path, "classifier")
        self.label_encoder = self._load_optional_artifact(self._settings.label_encoder_path, "label_encoder")
        
        # Load embedding models in a background task to prevent blocking startup
        import asyncio
        asyncio.create_task(self._preload_embedding_models())

    async def _preload_embedding_models(self) -> None:
        import asyncio
        models_to_preload = [
            "sentence-transformers/all-MiniLM-L6-v2",
            "sentence-transformers/all-MiniLM-L12-v2",
            "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
            "sentence-transformers/all-mpnet-base-v2"
        ]
        for model_name in models_to_preload:
            logger.info("preloading_embedding_model", model_name=model_name)
            try:
                await asyncio.to_thread(self.get_embedding_model, model_name)
            except Exception as e:
                logger.error("failed_preloading_embedding_model", model_name=model_name, error=str(e))
        logger.info("embedding_models_preloaded")

    async def close(self) -> None:
        with self._model_lock:
            self._embedding_models.clear()
        self.stance_classifier = None
        self.classifier = None
        self.label_encoder = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    def get_embedding_model(self, model_name: str) -> SentenceTransformer:
        """Dynamically loads the requested embedding model, caching it in memory."""
        with self._model_lock:
            # If it's a variant (e.g. model__variant), load the base model
            base_model_name = model_name.split("__")[0]
            
            if base_model_name not in self._embedding_models:
                logger.info("embedding_model_loading", model_name=base_model_name)
                kwargs = {"trust_remote_code": True}
                self._embedding_models[base_model_name] = SentenceTransformer(base_model_name, **kwargs)
                logger.info("embedding_model_loaded", model_name=base_model_name)

            return self._embedding_models[base_model_name]

    def require_stance_classifier(self) -> Any:
        if self.stance_classifier is None:
            logger.info("stance_classifier_loading", model_name=self._settings.stance_classifier_model_name)
            self.stance_classifier = pipeline("zero-shot-classification", model=self._settings.stance_classifier_model_name)
            logger.info("stance_classifier_loaded", model_name=self._settings.stance_classifier_model_name)
        return self.stance_classifier

    def _load_optional_artifact(self, path: Path, artifact_name: str) -> Any | None:
        if not path.exists():
            message = f"{artifact_name} artifact not found at {path}"
            if self._settings.allow_missing_artifacts:
                logger.warning("model_artifact_missing", artifact=artifact_name, path=str(path))
                return None
            raise MissingModelArtifactError(message)

        logger.info("model_artifact_loading", artifact=artifact_name, path=str(path))
        artifact = joblib.load(path)
        logger.info("model_artifact_loaded", artifact=artifact_name, path=str(path))
        return artifact
