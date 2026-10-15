import json
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from api.dependencies.services import ServiceContainerDep

router = APIRouter(tags=["intelligence"])


@router.get("/intelligence/profile-topic/{profile_id}/{topic_id}/stream")
async def stream_profile_topic_intelligence(
    profile_id: int, 
    topic_id: str, 
    services: ServiceContainerDep,
    model_name: str | None = None
):
    async def event_generator():
        try:
            async for progress_dict in services.profile_intelligence.compute_and_save_stream(profile_id, topic_id, model_name=model_name):
                yield f"data: {json.dumps(progress_dict)}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'status': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/intelligence/profile-topic/{profile_id}/{topic_id}")
async def compute_profile_topic_intelligence_sync(
    profile_id: int, 
    topic_id: str, 
    services: ServiceContainerDep
) -> dict:
    # Fallback synchronous endpoint that just consumes the stream and returns the final result
    try:
        final_result = None
        async for progress_dict in services.profile_intelligence.compute_and_save_stream(profile_id, topic_id):
            if progress_dict.get("status") == "complete":
                final_result = progress_dict.get("result")
            elif progress_dict.get("status") == "error":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=progress_dict.get("message")
                )
        
        if not final_result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Topic not found or no tweets found for the profile."
            )
        return final_result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc


@router.post("/intelligence/cluster-profile/{profile_id}")
async def cluster_profile_tweets(
    profile_id: int, 
    services: ServiceContainerDep
) -> dict:
    try:
        result = await services.clustering.cluster_profile_tweets(profile_id)
        if result.get("status") == "error":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=result.get("message")
            )
        return result
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
