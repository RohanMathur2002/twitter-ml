from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import AnyUrl, Field, PostgresDsn, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "ML FastAPI Service"
    environment: Literal["local", "development", "staging", "production"] = "local"
    debug: bool = False
    log_level: str = "INFO"

    api_prefix: str = ""
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    database_url: PostgresDsn = Field(
        default="postgresql+asyncpg://ml_user:ml_password@postgres:5432/ml_fastapi"
    )
    database_pool_size: Annotated[int, Field(ge=1, le=50)] = 10
    database_max_overflow: Annotated[int, Field(ge=0, le=100)] = 20

    EMBEDDING_MODELS: dict = {
        "sentence-transformers/all-MiniLM-L6-v2": {"dimension": 384, "display_name": "MiniLM"},
        "intfloat/multilingual-e5-base": {"dimension": 768, "display_name": "E5-base"},
        "BAAI/bge-m3": {"dimension": 1024, "display_name": "BGE-M3"},
        "Qwen/Qwen3-Embedding-8B": {"dimension": 4096, "display_name": "Qwen3"},
        "intfloat/multilingual-e5-base__official_retrieval": {"dimension": 768, "display_name": "E5 (Official Retrieval)"},
        "sentence-transformers/all-MiniLM-L12-v2": {"dimension": 384, "display_name": "MiniLM-L12"},
        "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2": {"dimension": 384, "display_name": "Para-MiniLM-L12"},
        "sentence-transformers/all-mpnet-base-v2": {"dimension": 768, "display_name": "MPNet-base"},
    }

    # Legacy attributes for compatibility if needed, though they should be migrated
    embedding_model_name: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_dimension: Annotated[int, Field(gt=0)] = 384
    embedding_batch_size: Annotated[int, Field(gt=0, le=1024)] = 64
    normalize_embeddings: bool = True

    stance_classifier_model_name: str = "MoritzLaurer/DeBERTa-v3-base-mnli-fever-anli"

    thread_embedding_model_name: str = "intfloat/multilingual-e5-base"

    classifier_path: Path = Path("artifacts/classifier.joblib")
    label_encoder_path: Path = Path("artifacts/label_encoder.pkl")
    allow_missing_artifacts: bool = True

    default_search_limit: Annotated[int, Field(gt=0, le=100)] = 10
    max_search_limit: Annotated[int, Field(gt=0, le=500)] = 100

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            # Check if it looks like a JSON list, e.g. ["a", "b"]
            if value.startswith("[") and value.endswith("]"):
                import json
                try:
                    return json.loads(value)
                except Exception:
                    pass
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("database_url", mode="before")
    @classmethod
    def coerce_database_url(cls, value: AnyUrl | str) -> str:
        return str(value)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached application settings."""

    return Settings()

