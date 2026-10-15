from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class APIError(BaseModel):
    code: str = Field(..., examples=["validation_error"])
    message: str
    details: dict[str, Any] | None = None


class ErrorResponse(BaseModel):
    error: APIError


class StatusResponse(BaseModel):
    status: str
    timestamp: datetime


class ORMBaseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

