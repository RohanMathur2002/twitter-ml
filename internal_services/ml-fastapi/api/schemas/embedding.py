from pydantic import BaseModel, Field, field_validator

from utils.text import normalize_whitespace


class EmbedRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=512)

    @field_validator("texts")
    @classmethod
    def clean_texts(cls, value: list[str]) -> list[str]:
        normalized = [normalize_whitespace(item) for item in value]
        if any(not item for item in normalized):
            raise ValueError("texts cannot contain blank values")
        return normalized


class EmbeddingItem(BaseModel):
    text: str
    embedding: list[float]


class EmbedResponse(BaseModel):
    dimension: int
    count: int
    items: list[EmbeddingItem]

