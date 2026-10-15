from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from utils.text import normalize_whitespace


class TweetEmbedItem(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    text: str = Field(..., min_length=1, max_length=20_000)

    @field_validator("id")
    @classmethod
    def clean_id(cls, value: str) -> str:
        normalized = normalize_whitespace(value)
        if not normalized:
            raise ValueError("id cannot be blank")
        return normalized

    @field_validator("text")
    @classmethod
    def clean_text(cls, value: str) -> str:
        normalized = normalize_whitespace(value)
        if not normalized:
            raise ValueError("text cannot be blank")
        return normalized


class TweetEmbedAsyncRequest(BaseModel):
    tweets: list[TweetEmbedItem] = Field(..., min_length=1, max_length=1000)


class TweetEmbedAsyncResponse(BaseModel):
    status: str
    accepted_count: int


class TweetEmbedSyncResponse(BaseModel):
    status: str
    processed_count: int


class TweetSearchRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=255)
    query: str = Field(..., min_length=1, max_length=20_000)
    limit: int = Field(default=10, ge=1, le=1000)
    model_name: str | None = Field(default=None)

    @field_validator("username")
    @classmethod
    def clean_username(cls, value: str) -> str:
        normalized = normalize_whitespace(value).replace("@", "")
        if not normalized:
            raise ValueError("username cannot be blank")
        return normalized

    @field_validator("query")
    @classmethod
    def clean_query(cls, value: str) -> str:
        normalized = normalize_whitespace(value)
        if not normalized:
            raise ValueError("query cannot be blank")
        return normalized


class TweetSearchResult(BaseModel):
    tweet_id: str
    text: str
    model_name: str
    embedded_at: datetime
    score: float


class TweetSearchResponse(BaseModel):
    query: str
    count: int
    results: list[TweetSearchResult]

class TweetThreadAnalyzeRequest(BaseModel):
    root_tweet_id: str = Field(..., min_length=1, max_length=64)
    tweets: list[TweetEmbedItem] = Field(..., min_length=1, max_length=1000)

class TweetThreadAnalyzeResponse(BaseModel):
    status: str
    accepted_count: int

class GenerateEmbeddingsRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=255)
    model_name: str = Field(..., min_length=1, max_length=255)
    force_regenerate: bool = Field(False)

class GenerateEmbeddingsResponse(BaseModel):
    status: str
    message: str
