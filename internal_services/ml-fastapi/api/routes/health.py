from datetime import UTC, datetime

from fastapi import APIRouter

from api.schemas.base import StatusResponse


router = APIRouter(tags=["health"])


@router.get("/health", response_model=StatusResponse)
async def health_check() -> StatusResponse:
    return StatusResponse(status="ok", timestamp=datetime.now(UTC))

