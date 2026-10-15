from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from database.models.document import Document


@dataclass(frozen=True)
class SearchDocumentResult:
    id: int
    text: str
    label: str | None
    metadata: dict | None
    score: float
    created_at: datetime


@dataclass(frozen=True)
class LabeledDocumentEmbedding:
    id: int
    label: str
    embedding: list[float]


class DocumentRepository:
    """Persistence boundary for vector documents."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def create_many(
        self,
        documents: list[tuple[str, str | None, dict | None, list[float]]],
    ) -> list[Document]:
        async with self._session_factory() as session:
            rows = [
                Document(text=text, label=label, document_metadata=metadata, embedding=embedding)
                for text, label, metadata, embedding in documents
            ]
            session.add_all(rows)
            await session.commit()
            for row in rows:
                await session.refresh(row)
            return rows

    async def similarity_search(
        self,
        embedding: list[float],
        limit: int,
        label: str | None = None,
        metadata_filter: dict | None = None,
    ) -> list[SearchDocumentResult]:
        distance = Document.embedding.cosine_distance(embedding).label("distance")
        stmt: Select = select(Document, distance).order_by(distance).limit(limit)
        if label is not None:
            stmt = stmt.where(Document.label == label)
        if metadata_filter:
            stmt = stmt.where(Document.document_metadata.contains(metadata_filter))

        async with self._session_factory() as session:
            result = await session.execute(stmt)
            rows = result.all()

        return [
            SearchDocumentResult(
                id=document.id,
                text=document.text,
                label=document.label,
                metadata=document.document_metadata,
                score=max(0.0, 1.0 - float(distance_value)),
                created_at=document.created_at,
            )
            for document, distance_value in rows
        ]

    async def list_labeled_embeddings(self, limit: int | None = None) -> list[LabeledDocumentEmbedding]:
        stmt = select(Document.id, Document.label, Document.embedding).where(Document.label.is_not(None))
        if limit is not None:
            stmt = stmt.limit(limit)

        async with self._session_factory() as session:
            result = await session.execute(stmt)
            rows = result.all()

        return [
            LabeledDocumentEmbedding(id=row.id, label=str(row.label), embedding=list(row.embedding))
            for row in rows
            if row.label is not None
        ]
