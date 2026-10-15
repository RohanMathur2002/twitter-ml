"""add_hnsw_index_and_clusters

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-10 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0002'
down_revision = '0001_create_documents'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create HNSW index on tweet_embeddings.embedding
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_tweet_embeddings_embedding_hnsw "
        "ON tweet_embeddings USING hnsw (embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64);"
    )

    # 2. Create tweet_clusters table
    op.create_table(
        'tweet_clusters',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('profile_id', sa.Integer(), nullable=False),
        sa.Column('tweet_id', sa.String(length=255), nullable=False),
        sa.Column('cluster_id', sa.Integer(), nullable=False),
        sa.Column('cluster_label', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tweet_id')
    )
    op.create_index('ix_tweet_clusters_profile_id', 'tweet_clusters', ['profile_id'])
    op.create_index('ix_tweet_clusters_cluster_id', 'tweet_clusters', ['cluster_id'])


def downgrade() -> None:
    op.drop_index('ix_tweet_clusters_cluster_id', table_name='tweet_clusters')
    op.drop_index('ix_tweet_clusters_profile_id', table_name='tweet_clusters')
    op.drop_table('tweet_clusters')
    op.execute("DROP INDEX IF EXISTS idx_tweet_embeddings_embedding_hnsw;")
