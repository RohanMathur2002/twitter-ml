from config.settings import Settings
from database.models.document import Document
from database.repositories.document_repository import DocumentRepository, SearchDocumentResult
from services.embedding_service import EmbeddingService
from services.preprocessing_service import PreprocessingService


class VectorService:
    """Coordinates embedding generation and vector persistence/search."""

    def __init__(
        self,
        settings: Settings,
        preprocessing_service: PreprocessingService,
        embedding_service: EmbeddingService,
        repository: DocumentRepository,
    ) -> None:
        self._settings = settings
        self._preprocessing_service = preprocessing_service
        self._embedding_service = embedding_service
        self._repository = repository

    async def index_texts(
        self,
        texts: list[str],
        label: str | None = None,
        metadata: dict | None = None,
    ) -> list[Document]:
        cleaned_texts = self._preprocessing_service.clean_batch(texts)
        embeddings = self._embedding_service.embed_batch(cleaned_texts)
        payload = [
            (text, label, metadata, embedding.tolist())
            for text, embedding in zip(cleaned_texts, embeddings, strict=True)
        ]
        return await self._repository.create_many(payload)

    async def search(
        self,
        query: str,
        limit: int | None,
        label: str | None,
        metadata_filter: dict | None = None,
    ) -> list[SearchDocumentResult]:
        cleaned_query = self._preprocessing_service.clean(query)
        query_embedding = self._embedding_service.embed_one(cleaned_query)
        effective_limit = min(limit or self._settings.default_search_limit, self._settings.max_search_limit)
        return await self._repository.similarity_search(
            embedding=query_embedding.tolist(),
            limit=effective_limit,
            label=label,
            metadata_filter=metadata_filter,
        )
