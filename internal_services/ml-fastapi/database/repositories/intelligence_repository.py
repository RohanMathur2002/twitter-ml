import json
from dataclasses import dataclass
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


@dataclass(frozen=True)
class TopicMetadata:
    id: str
    name: str
    similarity_threshold: float
    is_active: bool


@dataclass(frozen=True)
class TweetSemanticSignal:
    tweet_id: str
    raw_text: str
    clean_text: str | None
    positive_signal: float
    negative_signal: float
    sarcasm_signal: float


class IntelligenceRepository:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def get_topic(self, topic_id: str) -> TopicMetadata | None:
        stmt = text(
            """
            SELECT id, name, similarity_threshold, is_active
            FROM topics
            WHERE id = :topic_id
            LIMIT 1
            """
        )
        async with self._session_factory() as session:
            result = await session.execute(stmt, {"topic_id": topic_id})
            row = result.mappings().first()
            
        if not row:
            return None
            
        return TopicMetadata(
            id=str(row["id"]),
            name=row["name"],
            similarity_threshold=float(row["similarity_threshold"]),
            is_active=bool(row["is_active"])
        )

    async def get_semantic_signals(self, profile_id: int, topic_id: str, model_name: str | None = None) -> list[TweetSemanticSignal]:
        if not model_name:
            model_name = "sentence-transformers/all-MiniLM-L6-v2"

        model_names = [model_name]
        if "/" in model_name:
            model_names.append(model_name.split("/")[-1])
        else:
            model_names.append(f"sentence-transformers/{model_name}")

        stmt_tweets = text(
            """
            SELECT DISTINCT ON (te.tweet_id) te.tweet_id, tw.raw_text, tw.clean_text, te.embedding
            FROM tweet_embeddings te
            JOIN tweets tw ON tw.id = te.tweet_id
            WHERE tw.profile_id = :profile_id
              AND te.model_name = ANY(:model_names)
            ORDER BY te.tweet_id
            """
        )
        
        stmt_topic = text(
            """
            SELECT text, field_name, weight_priority, embedding
            FROM topic_embeddings
            WHERE topic_id = :topic_id
            """
        )
        
        async with self._session_factory() as session:
            result_tw = await session.execute(stmt_tweets, {"profile_id": profile_id, "model_names": model_names})
            tweets = result_tw.mappings().all()
            
            result_top = await session.execute(stmt_topic, {"topic_id": topic_id})
            topics = result_top.mappings().all()
            
        if not tweets or not topics:
            return []

        import numpy as np

        def parse_emb(emb):
            if isinstance(emb, str):
                return json.loads(emb)
            return list(emb)

        tw_embs = np.array([parse_emb(t["embedding"]) for t in tweets], dtype=np.float32)
        top_embs = np.array([parse_emb(t["embedding"]) for t in topics], dtype=np.float32)

        # Normalize to compute cosine similarity via dot product
        tw_norms = np.linalg.norm(tw_embs, axis=1, keepdims=True)
        top_norms = np.linalg.norm(top_embs, axis=1, keepdims=True)
        tw_embs_norm = tw_embs / np.where(tw_norms == 0, 1, tw_norms)
        top_embs_norm = top_embs / np.where(top_norms == 0, 1, top_norms)

        # (num_tweets, num_topics)
        sims = np.dot(tw_embs_norm, top_embs_norm.T)

        topic_fields = np.array([t["field_name"] for t in topics])
        topic_weights = np.array([(1.0 / (1.0 + t["weight_priority"])) for t in topics], dtype=np.float32)

        weighted_sims = sims * topic_weights

        pos_mask = (topic_fields == 'topic_name') | (topic_fields == 'semantic_queries')
        neg_mask = (topic_fields == 'negative_semantics')
        sarcasm_mask = (topic_fields == 'positive_sarcasm_cues') | (topic_fields == 'negative_sarcasm_cues')

        signals = []
        for i, tw in enumerate(tweets):
            tw_sims = weighted_sims[i]
            
            pos_vals = tw_sims[pos_mask]
            pos_signal = float(np.max(pos_vals)) if len(pos_vals) > 0 else 0.0
            
            neg_vals = tw_sims[neg_mask]
            neg_signal = float(np.max(neg_vals)) if len(neg_vals) > 0 else 0.0
            
            sarcasm_vals = tw_sims[sarcasm_mask]
            sarcasm_signal = float(np.max(sarcasm_vals)) if len(sarcasm_vals) > 0 else 0.0
            
            signals.append(TweetSemanticSignal(
                tweet_id=tw["tweet_id"],
                raw_text=tw["raw_text"],
                clean_text=tw["clean_text"],
                positive_signal=pos_signal,
                negative_signal=neg_signal,
                sarcasm_signal=sarcasm_signal
            ))
            
        signals.sort(key=lambda x: x.positive_signal, reverse=True)
        return signals

    async def get_strongest_matching_terms(self, profile_id: int, topic_id: str) -> list[dict[str, Any]]:
        stmt = text(
            """
            SELECT
              te.text,
              te.field_name,
              te.weight_priority,
              AVG(1.0 - (tw_emb.embedding <=> te.embedding)) AS avg_similarity
            FROM topic_embeddings te
            CROSS JOIN (
              SELECT te2.embedding
              FROM tweet_embeddings te2
              JOIN tweets tw ON tw.id = te2.tweet_id
              WHERE tw.profile_id = :profile_id
              LIMIT 200
            ) AS tw_emb
            WHERE te.topic_id = :topic_id
            GROUP BY te.text, te.field_name, te.weight_priority
            ORDER BY (1.0 / (1.0 + te.weight_priority)) * AVG(1.0 - (tw_emb.embedding <=> te.embedding)) DESC
            LIMIT 10
            """
        )
        
        async with self._session_factory() as session:
            result = await session.execute(stmt, {"profile_id": profile_id, "topic_id": topic_id})
            rows = result.mappings().all()
            
        return [
            {
                "text": row["text"],
                "field_name": row["field_name"],
                "weight_priority": row["weight_priority"],
                "avg_similarity": round(float(row["avg_similarity"]), 3),
            }
            for row in rows
        ]

    async def save_profile_intelligence(self, data: dict[str, Any]) -> None:
        stmt = text(
            """
            INSERT INTO profile_topic_intelligence (
              profile_id, topic_id,
              relevance_score, supportive_score, opposition_score,
              sarcasm_confidence, tweet_coverage_percent,
              strongest_matching_terms, sample_supportive_tweets, sample_opposition_tweets,
              debug_signals, total_tweets_analyzed, matching_tweets_count, analyzed_at
            ) VALUES (
              :profile_id, :topic_id,
              :relevance_score, :supportive_score, :opposition_score,
              :sarcasm_confidence, :tweet_coverage_percent,
              :strongest_matching_terms, :sample_supportive_tweets, :sample_opposition_tweets,
              :debug_signals, :total_tweets_analyzed, :matching_tweets_count, NOW()
            )
            ON CONFLICT (profile_id, topic_id) DO UPDATE SET
              relevance_score = EXCLUDED.relevance_score,
              supportive_score = EXCLUDED.supportive_score,
              opposition_score = EXCLUDED.opposition_score,
              sarcasm_confidence = EXCLUDED.sarcasm_confidence,
              tweet_coverage_percent = EXCLUDED.tweet_coverage_percent,
              strongest_matching_terms = EXCLUDED.strongest_matching_terms,
              sample_supportive_tweets = EXCLUDED.sample_supportive_tweets,
              sample_opposition_tweets = EXCLUDED.sample_opposition_tweets,
              debug_signals = EXCLUDED.debug_signals,
              total_tweets_analyzed = EXCLUDED.total_tweets_analyzed,
              matching_tweets_count = EXCLUDED.matching_tweets_count,
              analyzed_at = NOW()
            """
        )
        
        # Serialize JSONB fields
        data_to_insert = data.copy()
        data_to_insert["strongest_matching_terms"] = json.dumps(data_to_insert["strongest_matching_terms"])
        data_to_insert["sample_supportive_tweets"] = json.dumps(data_to_insert["sample_supportive_tweets"])
        data_to_insert["sample_opposition_tweets"] = json.dumps(data_to_insert["sample_opposition_tweets"])
        data_to_insert["debug_signals"] = json.dumps(data_to_insert["debug_signals"])
        
        async with self._session_factory() as session:
            await session.execute(stmt, data_to_insert)
            await session.commit()

    async def get_all_active_topics(self) -> list[str]:
        stmt = text("SELECT id FROM topics WHERE is_active = true ORDER BY name")
        async with self._session_factory() as session:
            result = await session.execute(stmt)
            return [str(r["id"]) for r in result.mappings().all()]

    async def get_all_topic_intelligence(self) -> list[dict[str, Any]]:
        stmt = text("""
            SELECT profile_id, topic_id, relevance_score, supportive_score, opposition_score, sarcasm_confidence
            FROM profile_topic_intelligence
        """)
        async with self._session_factory() as session:
            result = await session.execute(stmt)
            return [dict(r) for r in result.mappings().all()]

    async def get_all_tweet_metadata(self) -> list[dict[str, Any]]:
        stmt = text("""
            SELECT profile_id, is_retweet, is_reply, quoted_tweet_id, hashtags, mentions
            FROM tweets
        """)
        async with self._session_factory() as session:
            result = await session.execute(stmt)
            return [dict(r) for r in result.mappings().all()]

    async def get_all_profile_relationships(self) -> list[dict[str, Any]]:
        stmt = text("""
            SELECT source_profile_id, target_profile_id, interaction_count
            FROM profile_relationships
        """)
        async with self._session_factory() as session:
            result = await session.execute(stmt)
            return [dict(r) for r in result.mappings().all()]

    async def get_all_profile_embeddings(self, model_name: str = "sentence-transformers/all-MiniLM-L6-v2") -> list[dict[str, Any]]:
        # Fetch all tweet embeddings to average per profile in Python filtered by model
        model_names = [model_name]
        if "/" in model_name:
            model_names.append(model_name.split("/")[-1])
        else:
            model_names.append(f"sentence-transformers/{model_name}")

        stmt = text(
            """
            SELECT tw.profile_id, te.embedding
            FROM tweet_embeddings te
            JOIN tweets tw ON tw.id = te.tweet_id
            WHERE te.model_name = ANY(:model_names)
            """
        )
        async with self._session_factory() as session:
            result = await session.execute(stmt, {"model_names": model_names})
            rows = result.mappings().all()

        return [{"profile_id": r["profile_id"], "embedding": r["embedding"]} for r in rows]

    async def get_profile_tweet_embeddings(self, profile_id: int, model_name: str = "sentence-transformers/all-MiniLM-L6-v2") -> list[dict[str, Any]]:
        model_names = [model_name]
        if "/" in model_name:
            model_names.append(model_name.split("/")[-1])
        else:
            model_names.append(f"sentence-transformers/{model_name}")

        stmt = text(
            """
            SELECT te.tweet_id, te.embedding, tw.clean_text, tw.raw_text
            FROM tweet_embeddings te
            JOIN tweets tw ON tw.id = te.tweet_id
            WHERE tw.profile_id = :profile_id
              AND te.model_name = ANY(:model_names)
            """
        )
        async with self._session_factory() as session:
            result = await session.execute(stmt, {"profile_id": profile_id, "model_names": model_names})
            rows = result.mappings().all()

        return [dict(r) for r in rows]

    async def save_tweet_clusters(self, profile_id: int, clusters: list[dict[str, Any]]) -> None:
        if not clusters:
            return

        # clusters is a list of dicts with tweet_id, cluster_id, cluster_label
        stmt_delete = text("DELETE FROM tweet_clusters WHERE profile_id = :profile_id")
        
        stmt_insert = text(
            """
            INSERT INTO tweet_clusters (profile_id, tweet_id, cluster_id, cluster_label, created_at)
            VALUES (:profile_id, :tweet_id, :cluster_id, :cluster_label, NOW())
            """
        )
        
        async with self._session_factory() as session:
            await session.execute(stmt_delete, {"profile_id": profile_id})
            for i in range(0, len(clusters), 100):
                batch = clusters[i:i+100]
                for c in batch:
                    c["profile_id"] = profile_id
                await session.execute(stmt_insert, batch)
            await session.commit()

    async def get_topic_profile_embeddings(self, topic_id: str, model_name: str = "sentence-transformers/all-MiniLM-L6-v2") -> list[dict[str, Any]]:
        # Fetch tweets that are highly relevant to the topic
        # For simplicity, we fetch tweets for profiles that have a profile_topic_intelligence entry
        # and then weight or filter them. Here we just fetch all embeddings for profiles that have been analyzed for this topic.
        model_names = [model_name]
        if "/" in model_name:
            model_names.append(model_name.split("/")[-1])
        else:
            model_names.append(f"sentence-transformers/{model_name}")

        stmt = text(
            """
            SELECT DISTINCT ON (te.tweet_id) tw.profile_id, te.embedding
            FROM tweet_embeddings te
            JOIN tweets tw ON tw.id = te.tweet_id
            JOIN profile_topic_intelligence pti ON pti.profile_id = tw.profile_id
            WHERE pti.topic_id = :topic_id
              AND pti.relevance_score > 0
              AND te.model_name = ANY(:model_names)
            ORDER BY te.tweet_id
            """
        )
        async with self._session_factory() as session:
            result = await session.execute(stmt, {"topic_id": topic_id, "model_names": model_names})
            rows = result.mappings().all()

        return [{"profile_id": r["profile_id"], "embedding": r["embedding"]} for r in rows]

    async def save_global_coordinates(self, coords: list[dict[str, Any]]) -> None:
        if not coords:
            return

        stmt = text(
            """
            INSERT INTO profile_map_coordinates (profile_id, projection_type, x, y, generated_at)
            VALUES (:profile_id, :projection_type, :x, :y, NOW())
            ON CONFLICT (profile_id, projection_type) DO UPDATE SET
              x = EXCLUDED.x,
              y = EXCLUDED.y,
              generated_at = NOW()
            """
        )
        async with self._session_factory() as session:
            # We can execute many at once
            for i in range(0, len(coords), 100):
                batch = coords[i:i+100]
                await session.execute(stmt, batch)
            await session.commit()

    async def save_topic_coordinates(self, topic_id: str, coords: list[dict[str, Any]]) -> None:
        if not coords:
            return

        for c in coords:
            c["topic_id"] = topic_id
            if "cluster_id" not in c or c["cluster_id"] is None:
                c["cluster_id"] = None

        stmt = text(
            """
            INSERT INTO profile_topic_map_coordinates (profile_id, topic_id, x, y, cluster_id, generated_at)
            VALUES (:profile_id, :topic_id, :x, :y, :cluster_id, NOW())
            ON CONFLICT (profile_id, topic_id) DO UPDATE SET
              x = EXCLUDED.x,
              y = EXCLUDED.y,
              cluster_id = EXCLUDED.cluster_id,
              generated_at = NOW()
            """
        )
        async with self._session_factory() as session:
            for i in range(0, len(coords), 100):
                batch = coords[i:i+100]
                await session.execute(stmt, batch)
            await session.commit()

    async def get_topic_embeddings_for_topic(self, topic_id: str) -> list[Any]:
        stmt = text("""
            SELECT embedding
            FROM topic_embeddings
            WHERE topic_id = :topic_id AND embedding IS NOT NULL
        """)
        async with self._session_factory() as session:
            result = await session.execute(stmt, {"topic_id": topic_id})
            return [r["embedding"] for r in result.mappings().all()]

    async def get_topic_intelligence_for_topic(self, topic_id: str) -> list[dict[str, Any]]:
        stmt = text("""
            SELECT profile_id, topic_id, relevance_score, supportive_score, opposition_score, sarcasm_confidence
            FROM profile_topic_intelligence
            WHERE topic_id = :topic_id
        """)
        async with self._session_factory() as session:
            result = await session.execute(stmt, {"topic_id": topic_id})
            return [dict(r) for r in result.mappings().all()]


