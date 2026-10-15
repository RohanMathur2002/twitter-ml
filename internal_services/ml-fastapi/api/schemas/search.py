from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from utils.text import normalize_whitespace


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=20_000)
    limit: int | None = Field(default=None, ge=1, le=500)
    label: str | None = Field(default=None, min_length=1, max_length=255)
    metadata: dict[str, str | int | float | bool] | None = None

    @field_validator("query")
    @classmethod
    def clean_query(cls, value: str) -> str:
        normalized = normalize_whitespace(value)
        if not normalized:
            raise ValueError("query cannot be blank")
        return normalized

    @field_validator("label")
    @classmethod
    def clean_label(cls, value: str | None) -> str | None:
        return normalize_whitespace(value) if value is not None else None


class SearchResult(BaseModel):
    id: int
    text: str
    label: str | None
    metadata: dict | None
    score: float
    created_at: datetime


class SearchResponse(BaseModel):
    query: str
    count: int
    results: list[SearchResult]
