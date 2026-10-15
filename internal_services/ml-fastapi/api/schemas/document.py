from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from utils.text import normalize_whitespace


class IndexDocumentsRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=1_000)
    label: str | None = Field(default=None, min_length=1, max_length=255)
    metadata: dict[str, str | int | float | bool] | None = None

    @field_validator("texts")
    @classmethod
    def clean_texts(cls, value: list[str]) -> list[str]:
        normalized = [normalize_whitespace(item) for item in value]
        if any(not item for item in normalized):
            raise ValueError("texts cannot contain blank values")
        return normalized

    @field_validator("label")
    @classmethod
    def clean_label(cls, value: str | None) -> str | None:
        return normalize_whitespace(value) if value is not None else None


class IndexedDocument(BaseModel):
    id: int
    text: str
    label: str | None
    metadata: dict | None
    created_at: datetime


class IndexDocumentsResponse(BaseModel):
    count: int
    documents: list[IndexedDocument]
