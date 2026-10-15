import logging
from fastapi import APIRouter, BackgroundTasks, Depends

from api.dependencies.services import get_service_container
from services.service_container import ServiceContainer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/maps", tags=["maps"])


@router.post("/global/generate")
async def generate_global_map(
    background_tasks: BackgroundTasks,
    container: ServiceContainer = Depends(get_service_container),
):
    """
    Triggers the background generation of global semantic profile map coordinates.
    """
    logger.info("Triggered global map generation")
    background_tasks.add_task(container.semantic_map.generate_global_map_coordinates)
    return {"status": "accepted", "message": "Global map generation started in background"}


@router.post("/topic/{topic_id}/generate")
async def generate_topic_map(
    topic_id: str,
    background_tasks: BackgroundTasks,
    container: ServiceContainer = Depends(get_service_container),
):
    """
    Triggers the background generation of topic-specific semantic profile map coordinates.
    """
    logger.info(f"Triggered topic map generation for topic: {topic_id}")
    background_tasks.add_task(container.semantic_map.generate_topic_map_coordinates, topic_id)
    return {"status": "accepted", "message": "Topic map generation started in background"}
