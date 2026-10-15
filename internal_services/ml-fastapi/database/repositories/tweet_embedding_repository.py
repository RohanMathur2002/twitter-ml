from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from database.models.tweet_embedding import TweetEmbedding


@dataclass(frozen=True)
class TweetSearchMatch:
    tweet_id: str
    text: str
    model_name: str
    embedded_at: object
    score: float


class TweetEmbeddingRepository:
    """Persistence boundary for async tweet embedding upserts."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def save_embeddings(
        self,
        tweet_ids: list[str],
        embeddings: list[list[float]],
        model_name: str,
    ) -> None:
        if not tweet_ids:
            return

        values = [
            {
                "tweet_id": tweet_id,
                "embedding": embedding,
                "model_name": model_name,
            }
            for tweet_id, embedding in zip(tweet_ids, embeddings, strict=True)
        ]

        stmt = insert(TweetEmbedding).values(values)
        stmt = stmt.on_conflict_do_update(
            index_elements=[TweetEmbedding.tweet_id, TweetEmbedding.model_name],
            set_={
                "embedding": stmt.excluded.embedding,
                "model_name": stmt.excluded.model_name,
                "embedded_at": func.now(),
            },
        )

        async with self._session_factory() as session:
            await session.execute(stmt)
            await session.commit()

    async def save_thread_embeddings(
        self,
        tweet_ids: list[str],
        embeddings: list[list[float]],
        model_name: str,
    ) -> None:
        if not tweet_ids:
            return

        stmt = text("""
            INSERT INTO thread_tweet_embeddings (tweet_id, embedding, model_name, embedded_at)
            VALUES (:tweet_id, CAST(:embedding AS vector), :model_name, NOW())
            ON CONFLICT (tweet_id) DO UPDATE SET
                embedding = EXCLUDED.embedding,
                model_name = EXCLUDED.model_name,
                embedded_at = NOW()
        """)
        
        async with self._session_factory() as session:
            for tweet_id, embedding in zip(tweet_ids, embeddings, strict=True):
                await session.execute(
                    stmt, 
                    {
                        "tweet_id": tweet_id, 
                        "embedding": str(embedding), 
                        "model_name": model_name
                    }
                )
            await session.commit()

    async def search_similar(
        self,
        query_embedding: list[float],
        limit: int,
        username: str,
        model_name: str | None = None,
    ) -> list[TweetSearchMatch]:
        model_filter = "AND te.model_name = :model_name" if model_name else ""
        
        stmt = text(
            f"""
            WITH filtered_embeddings AS MATERIALIZED (
                SELECT te.tweet_id, te.model_name, te.embedded_at, te.embedding, t.clean_text, t.raw_text
                FROM tweet_embeddings te
                JOIN tweets t ON t.id = te.tweet_id
                JOIN profiles p ON p.id = t.profile_id
                WHERE lower(p.username) = lower(:username)
                {model_filter}
            )
            SELECT
                fe.tweet_id,
                COALESCE(fe.clean_text, fe.raw_text) as text,
                fe.model_name,
                fe.embedded_at,
                1 - (fe.embedding <=> CAST(:query_embedding AS vector)) AS score
            FROM filtered_embeddings fe
            ORDER BY fe.embedding <=> CAST(:query_embedding AS vector)
            LIMIT :limit
            """
        )

        async with self._session_factory() as session:
            params = {
                "query_embedding": str(query_embedding),
                "limit": limit,
                "username": username,
            }
            if model_name:
                params["model_name"] = model_name
                
            result = await session.execute(stmt, params)
            rows = result.mappings().all()

        return [
            TweetSearchMatch(
                tweet_id=row["tweet_id"],
                text=row["text"],
                model_name=row["model_name"],
                embedded_at=row["embedded_at"],
                score=float(row["score"]),
            )
            for row in rows
        ]

    async def get_unembedded_tweets_for_profile(self, username: str, model_name: str, force_regenerate: bool = False) -> list[tuple[str, str | None]]:
        # Fetch tweets belonging to username
        if force_regenerate:
            stmt = text("""
                SELECT t.id, COALESCE(t.clean_text, t.raw_text) as text
                FROM tweets t
                JOIN profiles p ON p.id = t.profile_id
                WHERE LOWER(p.username) = LOWER(:username)
            """)
        else:
            stmt = text("""
                SELECT t.id, COALESCE(t.clean_text, t.raw_text) as text
                FROM tweets t
                JOIN profiles p ON p.id = t.profile_id
                WHERE LOWER(p.username) = LOWER(:username)
                  AND NOT EXISTS (
                      SELECT 1 FROM tweet_embeddings te
                      WHERE te.tweet_id = t.id AND te.model_name = :model_name
                  )
            """)
        async with self._session_factory() as session:
            result = await session.execute(stmt, {"username": username, "model_name": model_name})
            return [(str(row.id), row.text if row.text is not None else None) for row in result.mappings().all()]

    async def save_embedding_run(
        self,
        model_name: str,
        profile_id: str,
        started_at: object,
        completed_at: object,
        tweets_processed: int,
        tweets_skipped: int,
        duration: float,
    ) -> None:
        from database.models.embedding_run import EmbeddingRun
        
        stmt = insert(EmbeddingRun).values(
            model_name=model_name,
            profile_id=profile_id,
            started_at=started_at,
            completed_at=completed_at,
            tweets_processed=tweets_processed,
            tweets_skipped=tweets_skipped,
            duration=duration,
        )
        async with self._session_factory() as session:
            await session.execute(stmt)
            await session.commit()

    async def delete_embeddings(self, username: str, model_name: str) -> None:
        stmt_embeddings = text("""
            DELETE FROM tweet_embeddings te
            USING tweets t, profiles p
            WHERE te.tweet_id = t.id
              AND t.profile_id = p.id
              AND LOWER(p.username) = LOWER(:username)
              AND te.model_name = :model_name
        """)
        
        stmt_runs = text("""
            DELETE FROM embedding_runs
            WHERE LOWER(profile_id) = LOWER(:username)
              AND model_name = :model_name
        """)
        
        async with self._session_factory() as session:
            await session.execute(stmt_embeddings, {"username": username, "model_name": model_name})
            await session.execute(stmt_runs, {"username": username, "model_name": model_name})
            await session.commit()
