from fastapi import APIRouter

from api.dependencies.services import ServiceContainerDep
from api.schemas.embedding import EmbedRequest, EmbedResponse, EmbeddingItem


router = APIRouter(tags=["embeddings"])


@router.post("/embed", response_model=EmbedResponse)
async def embed(request: EmbedRequest, services: ServiceContainerDep) -> EmbedResponse:
    cleaned_texts = services.preprocessing.clean_batch(request.texts)
    embeddings = services.embedding.embed_batch(cleaned_texts)
    items = [
        EmbeddingItem(text=text, embedding=embedding.tolist())
        for text, embedding in zip(cleaned_texts, embeddings, strict=True)
    ]
    return EmbedResponse(
        dimension=int(embeddings.shape[1]),
        count=len(items),
        items=items,
    )

