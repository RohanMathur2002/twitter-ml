from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from database.models.base import Base


class TweetEmbedding(Base):
    __tablename__ = "tweet_embeddings"

    # The running media_monitor schema still stores tweets.id as TEXT.
    # Keep the FK-compatible type here so persistence works against the live database.
    tweet_id: Mapped[str] = mapped_column(Text, primary_key=True)
    embedding: Mapped[list[float]] = mapped_column(Vector(), nullable=False)
    model_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="sentence-transformers/all-MiniLM-L6-v2",
        server_default="sentence-transformers/all-MiniLM-L6-v2",
    )
    embedded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
