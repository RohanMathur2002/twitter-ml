from fastapi import APIRouter, BackgroundTasks, status
from pydantic import BaseModel

from api.dependencies.services import ServiceContainerDep
from api.schemas.tweet_embedding import (
    TweetEmbedAsyncRequest,
    TweetEmbedAsyncResponse,
    TweetEmbedSyncResponse,
    TweetSearchRequest,
    TweetSearchResponse,
    TweetSearchResult,
    GenerateEmbeddingsRequest,
    GenerateEmbeddingsResponse,
)
from config.logging import get_logger


router = APIRouter(tags=["tweets"])
logger = get_logger(__name__)

@router.post(
    "/tweets/generate-model-embeddings",
    response_model=GenerateEmbeddingsResponse,
    status_code=status.HTTP_200_OK,
)
async def generate_model_embeddings(
    request: GenerateEmbeddingsRequest,
    services: ServiceContainerDep,
) -> GenerateEmbeddingsResponse:
    # This is a synchronous endpoint because the UI wants to await it sequentially.
    # It might take a long time, so we could increase timeout on the frontend.
    # Alternatively, the frontend could poll. For simplicity, we'll keep it sync here.
    # Uvicorn might timeout if it takes > 60s, but we'll try this first.
    await services.tweet_embedding.generate_embeddings_for_profile(
        username=request.username,
        model_name=request.model_name,
        force_regenerate=request.force_regenerate
    )
    return GenerateEmbeddingsResponse(
        status="completed",
        message=f"Successfully generated embeddings for {request.model_name}"
    )


@router.post(
    "/tweets/embed-async",
    response_model=TweetEmbedAsyncResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def embed_tweets_async(
    request: TweetEmbedAsyncRequest,
    background_tasks: BackgroundTasks,
    services: ServiceContainerDep,
) -> TweetEmbedAsyncResponse:
    tweets = [(item.id, item.text) for item in request.tweets]
    background_tasks.add_task(services.tweet_embedding.embed_and_store_background, tweets)
    logger.info("tweet_embedding_job_accepted", count=len(tweets))
    return TweetEmbedAsyncResponse(status="accepted", accepted_count=len(tweets))


from api.schemas.tweet_embedding import TweetThreadAnalyzeRequest, TweetThreadAnalyzeResponse

@router.post(
    "/tweets/analyze-thread",
    response_model=TweetThreadAnalyzeResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def analyze_thread_async(
    request: TweetThreadAnalyzeRequest,
    background_tasks: BackgroundTasks,
    services: ServiceContainerDep,
) -> TweetThreadAnalyzeResponse:
    tweets = [(item.id, item.text) for item in request.tweets]
    background_tasks.add_task(services.tweet_embedding.embed_thread_and_store_background, request.root_tweet_id, tweets)
    logger.info("tweet_thread_analyze_job_accepted", root_tweet_id=request.root_tweet_id, count=len(tweets))
    return TweetThreadAnalyzeResponse(status="accepted", accepted_count=len(tweets))


@router.post(
    "/tweets/embed-sync",
    response_model=TweetEmbedSyncResponse,
    status_code=status.HTTP_200_OK,
)
async def embed_tweets_sync(
    request: TweetEmbedAsyncRequest,
    services: ServiceContainerDep,
) -> TweetEmbedSyncResponse:
    tweets = [(item.id, item.text) for item in request.tweets]
    await services.tweet_embedding.embed_and_store(tweets)
    return TweetEmbedSyncResponse(status="completed", processed_count=len(tweets))


@router.post(
    "/tweets/search",
    response_model=TweetSearchResponse,
    status_code=status.HTTP_200_OK,
)
async def search_tweets(
    request: TweetSearchRequest,
    services: ServiceContainerDep,
) -> TweetSearchResponse:
    results = await services.tweet_embedding.search_similar(
        query=request.query,
        limit=request.limit,
        username=request.username,
        model_name=request.model_name,
    )
    return TweetSearchResponse(
        query=request.query,
        count=len(results),
        results=[
            TweetSearchResult(
                tweet_id=result.tweet_id,
                text=result.text,
                model_name=result.model_name,
                embedded_at=result.embedded_at,
                score=result.score,
            )
            for result in results
        ],
    )

class EmbeddingRunResponse(BaseModel):
    model_name: str
    started_at: str
    completed_at: str | None
    tweets_processed: int
    tweets_skipped: int
    duration: float | None

@router.get("/tweets/embedding-runs/{username}", response_model=list[EmbeddingRunResponse])
async def get_embedding_runs(
    username: str,
    services: ServiceContainerDep,
) -> list[EmbeddingRunResponse]:
    from sqlalchemy import text
    stmt = text("""
        SELECT model_name, started_at, completed_at, tweets_processed, tweets_skipped, duration 
        FROM embedding_runs 
        WHERE LOWER(profile_id) = LOWER(:username)
        ORDER BY started_at DESC
    """)
    async with services.tweet_embedding._repository._session_factory() as session:
        result = await session.execute(stmt, {"username": username})
        return [
            EmbeddingRunResponse(
                model_name=row.model_name,
                started_at=row.started_at.isoformat() if row.started_at else "",
                completed_at=row.completed_at.isoformat() if row.completed_at else None,
                tweets_processed=row.tweets_processed,
                tweets_skipped=row.tweets_skipped,
                duration=row.duration,
            )
            for row in result
        ]

@router.get("/tweets/embeddings-count/{username}", response_model=dict[str, int])
async def get_embeddings_count(
    username: str,
    services: ServiceContainerDep,
) -> dict[str, int]:
    from sqlalchemy import text
    stmt = text("""
        SELECT e.model_name, COUNT(*) 
        FROM tweet_embeddings e 
        JOIN tweets t ON e.tweet_id = t.id 
        JOIN profiles p ON p.id = t.profile_id 
        WHERE LOWER(p.username) = LOWER(:username)
        GROUP BY e.model_name
    """)
    async with services.tweet_embedding._repository._session_factory() as session:
        result = await session.execute(stmt, {"username": username})
        return {row.model_name: row.count for row in result}

@router.post(
    "/tweets/delete-model-embeddings",
    response_model=GenerateEmbeddingsResponse,
    status_code=status.HTTP_200_OK,
)
async def delete_model_embeddings(
    request: GenerateEmbeddingsRequest,
    services: ServiceContainerDep,
) -> GenerateEmbeddingsResponse:
    await services.tweet_embedding.delete_embeddings(
        username=request.username,
        model_name=request.model_name,
    )
    return GenerateEmbeddingsResponse(
        status="completed",
        message=f"Successfully deleted embeddings for {request.model_name}"
    )
