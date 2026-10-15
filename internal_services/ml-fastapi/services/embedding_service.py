import numpy as np

from config.settings import Settings
from services.model_service import ModelService


class EmbeddingService:
    """Generates embeddings for new text only; persistence is handled elsewhere."""

    def __init__(self, settings: Settings, model_service: ModelService) -> None:
        self._settings = settings
        self._model_service = model_service

    def embed_batch(self, texts: list[str], model_name: str | None = None, is_query: bool = False) -> np.ndarray:
        model_name = model_name or self._settings.embedding_model_name
        model = self._model_service.get_embedding_model(model_name)
        
        # Apply official retrieval prefix for E5
        if model_name == "intfloat/multilingual-e5-base__official_retrieval":
            prefix = "query: " if is_query else "passage: "
            texts = [f"{prefix}{text}" for text in texts]
            
        embeddings = model.encode(
            texts,
            batch_size=self._settings.embedding_batch_size,
            normalize_embeddings=self._settings.normalize_embeddings,
            convert_to_numpy=True,
            show_progress_bar=False,
        )
        return np.asarray(embeddings, dtype=np.float32)

    def embed_one(self, text: str, model_name: str | None = None, is_query: bool = False) -> np.ndarray:
        return self.embed_batch([text], model_name=model_name, is_query=is_query)[0]

    def embed_thread_batch(self, texts: list[str], model_name: str | None = None) -> np.ndarray:
        model_name = model_name or self._settings.thread_embedding_model_name
        model = self._model_service.get_embedding_model(model_name)
        embeddings = model.encode(
            texts,
            batch_size=self._settings.embedding_batch_size,
            normalize_embeddings=self._settings.normalize_embeddings,
            convert_to_numpy=True,
            show_progress_bar=False,
        )
        return np.asarray(embeddings, dtype=np.float32)

