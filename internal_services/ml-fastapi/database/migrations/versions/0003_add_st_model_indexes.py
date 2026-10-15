"""Add HNSW indexes for sentence-transformers comparison models

Revision ID: 0003
Revises: 410da05b3d27
Create Date: 2026-07-01 10:19:00.000000

"""
from collections.abc import Sequence

from alembic import op


revision: str = "0003"
down_revision: str | None = "410da05b3d27"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # all-MiniLM-L12-v2 (384 dimensions)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_te_minilm_l12 ON tweet_embeddings "
        "USING hnsw ((embedding::vector(384)) vector_cosine_ops) "
        "WHERE model_name = 'sentence-transformers/all-MiniLM-L12-v2'"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_tte_minilm_l12 ON thread_tweet_embeddings "
        "USING hnsw ((embedding::vector(384)) vector_cosine_ops) "
        "WHERE model_name = 'sentence-transformers/all-MiniLM-L12-v2'"
    )

    # paraphrase-multilingual-MiniLM-L12-v2 (384 dimensions)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_te_para_minilm_l12 ON tweet_embeddings "
        "USING hnsw ((embedding::vector(384)) vector_cosine_ops) "
        "WHERE model_name = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_tte_para_minilm_l12 ON thread_tweet_embeddings "
        "USING hnsw ((embedding::vector(384)) vector_cosine_ops) "
        "WHERE model_name = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'"
    )

    # all-mpnet-base-v2 (768 dimensions)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_te_mpnet ON tweet_embeddings "
        "USING hnsw ((embedding::vector(768)) vector_cosine_ops) "
        "WHERE model_name = 'sentence-transformers/all-mpnet-base-v2'"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_tte_mpnet ON thread_tweet_embeddings "
        "USING hnsw ((embedding::vector(768)) vector_cosine_ops) "
        "WHERE model_name = 'sentence-transformers/all-mpnet-base-v2'"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_te_minilm_l12")
    op.execute("DROP INDEX IF EXISTS idx_tte_minilm_l12")
    op.execute("DROP INDEX IF EXISTS idx_te_para_minilm_l12")
    op.execute("DROP INDEX IF EXISTS idx_tte_para_minilm_l12")
    op.execute("DROP INDEX IF EXISTS idx_te_mpnet")
    op.execute("DROP INDEX IF EXISTS idx_tte_mpnet")
