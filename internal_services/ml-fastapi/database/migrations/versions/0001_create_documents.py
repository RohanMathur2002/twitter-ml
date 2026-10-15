"""create documents table

Revision ID: 0001_create_documents
Revises:
Create Date: 2026-05-21 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from pgvector.sqlalchemy import Vector


revision: str = "0001_create_documents"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "documents",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=True),
        sa.Column("metadata", JSONB(), nullable=True),
        sa.Column("embedding", Vector(384), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_documents_label", "documents", ["label"])
    op.create_index("ix_documents_metadata_gin", "documents", ["metadata"], postgresql_using="gin")
    op.execute(
        "CREATE INDEX ix_documents_embedding_hnsw_cosine "
        "ON documents USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.drop_index("ix_documents_embedding_hnsw_cosine", table_name="documents")
    op.drop_index("ix_documents_metadata_gin", table_name="documents")
    op.drop_index("ix_documents_label", table_name="documents")
    op.drop_table("documents")
