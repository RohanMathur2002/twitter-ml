from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func, Float
from sqlalchemy.orm import Mapped, mapped_column

from database.models.base import Base


class EmbeddingRun(Base):
    __tablename__ = "embedding_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    model_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    profile_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    tweets_processed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tweets_skipped: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duration: Mapped[float | None] = mapped_column(Float, nullable=True) # Duration in seconds

