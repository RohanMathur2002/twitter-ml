from config.logging import get_logger
from config.settings import Settings
from database.repositories.tweet_embedding_repository import TweetEmbeddingRepository, TweetSearchMatch
from services.embedding_service import EmbeddingService
from services.preprocessing_service import PreprocessingService


logger = get_logger(__name__)


class TweetEmbeddingService:
    """Preprocesses tweets, generates embeddings in batch, and persists them with pgvector."""

    def __init__(
        self,
        settings: Settings,
        preprocessing_service: PreprocessingService,
        embedding_service: EmbeddingService,
        repository: TweetEmbeddingRepository,
    ) -> None:
        self._settings = settings
        self._preprocessing_service = preprocessing_service
        self._embedding_service = embedding_service
        self._repository = repository

    async def embed_and_store(self, tweets: list[tuple[str, str | None]]) -> None:
        if not tweets:
            return

        import asyncio
        batch_size = 100
        total_tweets = len(tweets)
        model_name = self._settings.embedding_model_name.split("/")[-1]
        
        # Filter null/empty
        valid_tweets = []
        skipped_null = 0
        skipped_empty = 0
        
        for tweet_id, text in tweets:
            if text is None:
                skipped_null += 1
                continue
            cleaned = self._preprocessing_service.clean(text)
            if not cleaned:
                skipped_empty += 1
                continue
            valid_tweets.append((tweet_id, cleaned))
            
        logger.info(
            "embed_and_store_diagnostics",
            total_tweets=total_tweets,
            embedded_tweets=len(valid_tweets),
            skipped_empty_tweets=skipped_empty,
            skipped_null_tweets=skipped_null,
        )
        
        total_valid = len(valid_tweets)
        for i in range(0, total_valid, batch_size):
            batch = valid_tweets[i:i + batch_size]
            tweet_ids = [tweet_id for tweet_id, _ in batch]
            cleaned_texts = [text for _, text in batch]
            
            embeddings = await asyncio.to_thread(self._embedding_service.embed_batch, cleaned_texts)

            await self._repository.save_embeddings(
                tweet_ids=tweet_ids,
                embeddings=[embedding.tolist() for embedding in embeddings],
                model_name=model_name,
            )
            
            logger.info(
                "embedding_batch_generated", 
                username="auto_ingest", 
                model_name=model_name, 
                progress_count=i + len(batch), 
                total=total_valid
            )

        logger.info("tweet_embeddings_saved", count=total_valid)

    async def embed_and_store_background(self, tweets: list[tuple[str, str | None]]) -> None:
        try:
            await self.embed_and_store(tweets)
        except Exception as exc:
            logger.exception("tweet_embedding_job_failed", count=len(tweets), error=str(exc))

    async def generate_embeddings_for_profile(self, username: str, model_name: str, force_regenerate: bool = False) -> None:
        """Fetch all unembedded tweets for a profile and generate embeddings for the specific model."""
        import time
        from datetime import datetime, timezone
        
        start_time = time.time()
        started_at = datetime.now(timezone.utc)
        
        # 1. Fetch total count of tweets for this profile (to calculate skipped)
        stmt = "SELECT COUNT(*) FROM tweets t JOIN profiles p ON p.id = t.profile_id WHERE LOWER(p.username) = LOWER(:username)"
        from sqlalchemy import text
        async with self._repository._session_factory() as session:
            total_tweets_res = await session.execute(text(stmt), {"username": username})
            total_tweets = total_tweets_res.scalar() or 0

        # 2. Fetch unembedded tweets
        unembedded = await self._repository.get_unembedded_tweets_for_profile(username, model_name, force_regenerate)
        
        # Filter and count
        valid_tweets = []
        skipped_null = 0
        skipped_empty = 0
        
        for tweet_id, text in unembedded:
            if text is None:
                skipped_null += 1
                continue
            cleaned = self._preprocessing_service.clean(text)
            if not cleaned:
                skipped_empty += 1
                continue
            valid_tweets.append((tweet_id, cleaned))
            
        tweets_processed = len(valid_tweets)
        tweets_skipped = total_tweets - tweets_processed
        
        logger.info(
            "profile_model_embeddings_diagnostics",
            username=username,
            model_name=model_name,
            total_tweets=total_tweets,
            embedded_tweets=tweets_processed,
            skipped_empty_tweets=skipped_empty,
            skipped_null_tweets=skipped_null,
        )

        if tweets_processed > 0:
            # 3 & 4. Generate and save embeddings in batches
            import asyncio
            batch_size = 1 if "qwen" in model_name.lower() else 100
            for i in range(0, len(valid_tweets), batch_size):
                batch = valid_tweets[i:i + batch_size]
                tweet_ids = [tweet_id for tweet_id, _ in batch]
                cleaned_texts = [text for _, text in batch]
                
                embeddings = await asyncio.to_thread(self._embedding_service.embed_batch, cleaned_texts, model_name)
                
                await self._repository.save_embeddings(
                    tweet_ids=tweet_ids,
                    embeddings=[embedding.tolist() for embedding in embeddings],
                    model_name=model_name,
                )
                logger.info(
                    "embedding_batch_generated", 
                    username=username, 
                    model_name=model_name, 
                    progress_count=i + len(batch), 
                    total=tweets_processed
                )
                
            logger.info("profile_model_embeddings_generated", username=username, model_name=model_name, count=tweets_processed)

        # 5. Save run metrics
        completed_at = datetime.now(timezone.utc)
        duration = time.time() - start_time
        
        await self._repository.save_embedding_run(
            model_name=model_name,
            profile_id=username,
            started_at=started_at,
            completed_at=completed_at,
            tweets_processed=tweets_processed,
            tweets_skipped=tweets_skipped,
            duration=duration,
        )

    async def embed_thread_and_store_background(self, root_tweet_id: str, tweets: list[tuple[str, str | None]]) -> None:
        try:
            if not tweets:
                return
            
            valid_tweets = []
            skipped_null = 0
            skipped_empty = 0
            for tweet_id, text in tweets:
                if text is None:
                    skipped_null += 1
                    continue
                cleaned = self._preprocessing_service.clean(text)
                if not cleaned:
                    skipped_empty += 1
                    continue
                valid_tweets.append((tweet_id, cleaned))
                
            logger.info(
                "embed_thread_diagnostics",
                root_tweet_id=root_tweet_id,
                total_tweets=len(tweets),
                embedded_tweets=len(valid_tweets),
                skipped_empty_tweets=skipped_empty,
                skipped_null_tweets=skipped_null,
            )
            
            if not valid_tweets:
                return
                
            tweet_ids = [tweet_id for tweet_id, _ in valid_tweets]
            cleaned_texts = [text for _, text in valid_tweets]
            import asyncio
            embeddings = await asyncio.to_thread(self._embedding_service.embed_thread_batch, cleaned_texts)

            await self._repository.save_thread_embeddings(
                tweet_ids=tweet_ids,
                embeddings=[embedding.tolist() for embedding in embeddings],
                model_name=self._settings.thread_embedding_model_name.split("/")[-1],
            )
            logger.info("thread_embeddings_saved", root_tweet_id=root_tweet_id, count=len(tweet_ids))

            # Insert placeholder analysis
            stmt = """
                INSERT INTO tweet_thread_analysis (root_tweet_id, status)
                VALUES (:root_tweet_id, 'pending')
                ON CONFLICT (root_tweet_id) DO NOTHING
            """
            from sqlalchemy import text
            async with self._repository._session_factory() as session:
                await session.execute(text(stmt), {"root_tweet_id": root_tweet_id})
                await session.commit()
                
        except Exception as exc:
            logger.exception("thread_embedding_job_failed", count=len(tweets), error=str(exc))

    async def search_similar(self, query: str, limit: int, username: str, model_name: str | None = None) -> list[TweetSearchMatch]:
        model_name = model_name or self._settings.embedding_model_name
        from sqlalchemy import text
        model_filter = "AND te.model_name = :model_name"
        count_stmt = text(f"""
            SELECT 1 
            FROM tweet_embeddings te
            JOIN tweets t ON t.id = te.tweet_id
            JOIN profiles p ON p.id = t.profile_id
            WHERE LOWER(p.username) = LOWER(:username) 
            {model_filter}
            LIMIT 1
        """)
        async with self._repository._session_factory() as session:
            params = {"username": username}
            if model_name:
                params["model_name"] = model_name
            result = await session.execute(count_stmt, params)
            if not result.scalar():
                return []

        cleaned_query = self._preprocessing_service.clean(query)
        import asyncio
        query_embedding = await asyncio.to_thread(self._embedding_service.embed_one, cleaned_query, model_name, True)
        return await self._repository.search_similar(
            query_embedding=query_embedding.tolist(),
            limit=limit,
            username=username,
            model_name=model_name,
        )

    async def delete_embeddings(self, username: str, model_name: str) -> None:
        await self._repository.delete_embeddings(username, model_name)
        logger.info("embeddings_deleted_for_profile_model", username=username, model_name=model_name)
