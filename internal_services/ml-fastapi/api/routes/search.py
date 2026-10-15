from fastapi import APIRouter

from api.dependencies.services import ServiceContainerDep
from api.schemas.document import IndexedDocument, IndexDocumentsRequest, IndexDocumentsResponse
from api.schemas.search import SearchRequest, SearchResponse, SearchResult


router = APIRouter(tags=["search"])


@router.post("/search", response_model=SearchResponse)
async def search(request: SearchRequest, services: ServiceContainerDep) -> SearchResponse:
    results = await services.vector.search(
        query=request.query,
        limit=request.limit,
        label=request.label,
        metadata_filter=request.metadata,
    )
    response_results = [
        SearchResult(
            id=result.id,
            text=result.text,
            label=result.label,
            metadata=result.metadata,
            score=result.score,
            created_at=result.created_at,
        )
        for result in results
    ]
    return SearchResponse(query=request.query, count=len(response_results), results=response_results)


@router.post("/documents", response_model=IndexDocumentsResponse, status_code=201)
async def index_documents(
    request: IndexDocumentsRequest,
    services: ServiceContainerDep,
) -> IndexDocumentsResponse:
    documents = await services.vector.index_texts(
        texts=request.texts,
        label=request.label,
        metadata=request.metadata,
    )
    response_documents = [
        IndexedDocument(
            id=document.id,
            text=document.text,
            label=document.label,
            metadata=document.document_metadata,
            created_at=document.created_at,
        )
        for document in documents
    ]
    return IndexDocumentsResponse(count=len(response_documents), documents=response_documents)
