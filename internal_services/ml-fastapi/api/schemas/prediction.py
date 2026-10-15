from pydantic import BaseModel, Field, field_validator

from utils.text import normalize_whitespace


class PredictRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=20_000)
    include_probabilities: bool = True

    @field_validator("text")
    @classmethod
    def clean_text(cls, value: str) -> str:
        normalized = normalize_whitespace(value)
        if not normalized:
            raise ValueError("text cannot be blank")
        return normalized


class ClassProbability(BaseModel):
    label: str
    probability: float = Field(..., ge=0.0, le=1.0)


class PredictResponse(BaseModel):
    text: str
    cleaned_text: str
    label: str
    score: float | None = Field(default=None, ge=0.0, le=1.0)
    probabilities: list[ClassProbability] = Field(default_factory=list)


class StanceBatchPredictRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=100)
    topic_name: str = Field(..., min_length=1)


class StancePredictionResponseItem(BaseModel):
    text: str
    label: str
    score: float
    probabilities: list[ClassProbability] = Field(default_factory=list)


class StanceBatchPredictResponse(BaseModel):
    predictions: list[StancePredictionResponseItem]

