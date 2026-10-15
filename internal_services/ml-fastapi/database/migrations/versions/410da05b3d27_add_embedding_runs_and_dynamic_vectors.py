"""Add embedding runs and dynamic vectors

Revision ID: 410da05b3d27
Revises: 0002
Create Date: 2026-06-24 06:33:53.832490+00:00
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '410da05b3d27'
down_revision: str | None = '0002'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Create embedding_runs table
    op.create_table('embedding_runs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('model_name', sa.String(length=100), nullable=False),
        sa.Column('profile_id', sa.Text(), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('tweets_processed', sa.Integer(), nullable=False),
        sa.Column('tweets_skipped', sa.Integer(), nullable=False),
        sa.Column('duration', sa.Float(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_embedding_runs_model_name'), 'embedding_runs', ['model_name'], unique=False)
    op.create_index(op.f('ix_embedding_runs_profile_id'), 'embedding_runs', ['profile_id'], unique=False)

    # 2. Alter tweet_embeddings and thread_tweet_embeddings vector columns to be unconstrained
    # First drop old global indexes
    op.drop_index('ix_tweet_embeddings_hnsw', table_name='tweet_embeddings', postgresql_using='hnsw', if_exists=True)
    op.drop_index('idx_tweet_embeddings_embedding_hnsw', table_name='tweet_embeddings', postgresql_using='hnsw', if_exists=True)
    op.drop_index('ix_thread_tweet_embeddings_hnsw', table_name='thread_tweet_embeddings', postgresql_using='hnsw', if_exists=True)

    # Alter column types
    op.execute("ALTER TABLE tweet_embeddings ALTER COLUMN embedding TYPE vector")
    op.execute("ALTER TABLE thread_tweet_embeddings ALTER COLUMN embedding TYPE vector")

    # 3. Create partial HNSW indexes using cast for each model size
    op.execute("CREATE INDEX idx_te_minilm ON tweet_embeddings USING hnsw ((embedding::vector(384)) vector_cosine_ops) WHERE model_name = 'sentence-transformers/all-MiniLM-L6-v2'")
    op.execute("CREATE INDEX idx_te_e5 ON tweet_embeddings USING hnsw ((embedding::vector(768)) vector_cosine_ops) WHERE model_name = 'intfloat/multilingual-e5-base'")
    op.execute("CREATE INDEX idx_te_bgem3 ON tweet_embeddings USING hnsw ((embedding::vector(1024)) vector_cosine_ops) WHERE model_name = 'BAAI/bge-m3'")
    # Note: pgvector limits HNSW to 2000 dimensions, so Qwen3 (4096) cannot be indexed.

    op.execute("CREATE INDEX idx_tte_minilm ON thread_tweet_embeddings USING hnsw ((embedding::vector(384)) vector_cosine_ops) WHERE model_name = 'sentence-transformers/all-MiniLM-L6-v2'")
    op.execute("CREATE INDEX idx_tte_e5 ON thread_tweet_embeddings USING hnsw ((embedding::vector(768)) vector_cosine_ops) WHERE model_name = 'intfloat/multilingual-e5-base'")
    op.execute("CREATE INDEX idx_tte_bgem3 ON thread_tweet_embeddings USING hnsw ((embedding::vector(1024)) vector_cosine_ops) WHERE model_name = 'BAAI/bge-m3'")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_te_minilm")
    op.execute("DROP INDEX IF EXISTS idx_te_e5")
    op.execute("DROP INDEX IF EXISTS idx_te_bgem3")
    op.execute("DROP INDEX IF EXISTS idx_tte_minilm")
    op.execute("DROP INDEX IF EXISTS idx_tte_e5")
    op.execute("DROP INDEX IF EXISTS idx_tte_bgem3")

    op.execute("ALTER TABLE tweet_embeddings ALTER COLUMN embedding TYPE vector(384)")
    op.execute("ALTER TABLE thread_tweet_embeddings ALTER COLUMN embedding TYPE vector(384)")

    op.create_index('ix_tweet_embeddings_hnsw', 'tweet_embeddings', ['embedding'], unique=False, postgresql_using='hnsw')
    op.create_index('ix_thread_tweet_embeddings_hnsw', 'thread_tweet_embeddings', ['embedding'], unique=False, postgresql_using='hnsw')

    op.drop_index(op.f('ix_embedding_runs_profile_id'), table_name='embedding_runs')
    op.drop_index(op.f('ix_embedding_runs_model_name'), table_name='embedding_runs')
    op.drop_table('embedding_runs')
