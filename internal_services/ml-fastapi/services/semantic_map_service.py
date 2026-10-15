import json
import logging
from typing import Any
import numpy as np
import math

try:
    import umap
    UMAP_AVAILABLE = True
except ImportError:
    UMAP_AVAILABLE = False

from database.repositories.intelligence_repository import IntelligenceRepository
from config.settings import get_settings

logger = logging.getLogger(__name__)

PROJECTIONS = {
    "canonical":    {"semantic": 0.35, "topic": 0.25, "stance": 0.20, "behavior": 0.10, "graph": 0.10},
    "narrative":    {"semantic": 0.70, "topic": 0.20, "stance": 0.10, "behavior": 0.00, "graph": 0.00},
    "ideology":     {"semantic": 0.10, "topic": 0.40, "stance": 0.50, "behavior": 0.00, "graph": 0.00},
    "network":      {"semantic": 0.00, "topic": 0.00, "stance": 0.00, "behavior": 0.40, "graph": 0.60},
    "coordination": {"semantic": 0.30, "topic": 0.00, "stance": 0.00, "behavior": 0.40, "graph": 0.30},
    "topic_focus":  {"semantic": 0.10, "topic": 0.90, "stance": 0.00, "behavior": 0.00, "graph": 0.00},
}

class SemanticMapService:
    def __init__(self, repository: IntelligenceRepository, settings: Any = None) -> None:
        self._repository = repository
        self._settings = settings or get_settings()

    def _parse_embedding(self, emb: Any) -> list[float] | None:
        if isinstance(emb, str):
            try:
                return json.loads(emb)
            except Exception:
                return None
        return list(emb) if emb else None
        
    def _l2_normalize(self, vec: np.ndarray) -> np.ndarray:
        norm = np.linalg.norm(vec)
        if norm == 0:
            return vec
        return vec / norm

    def _aggregate_embeddings(self, rows: list[dict[str, Any]]) -> tuple[list[int], np.ndarray]:
        # Keeps simple average for Topic Map
        profile_embs: dict[int, list[list[float]]] = {}
        for row in rows:
            pid = row["profile_id"]
            emb = self._parse_embedding(row["embedding"])
            if emb:
                if pid not in profile_embs:
                    profile_embs[pid] = []
                profile_embs[pid].append(emb)

        profile_ids = []
        averaged_embs = []
        for pid, embs in profile_embs.items():
            arr = np.array(embs, dtype=np.float32)
            avg = np.mean(arr, axis=0)
            profile_ids.append(pid)
            averaged_embs.append(avg)

        return profile_ids, np.array(averaged_embs, dtype=np.float32)

    async def _build_composite_profile_vectors(self) -> dict[int, dict[str, np.ndarray]]:
        """
        Builds the 5 base sub-vectors for all profiles.
        Returns a dict mapping profile_id to their sub-vectors:
        { profile_id: {"semantic": arr, "topic": arr, "stance": arr, "behavior": arr, "graph": arr} }
        """
        # Fetch all raw data
        all_embeddings = await self._repository.get_all_profile_embeddings(model_name=self._settings.embedding_model_name)
        active_topics = await self._repository.get_all_active_topics()
        topic_intel = await self._repository.get_all_topic_intelligence()
        tweet_metadata = await self._repository.get_all_tweet_metadata()
        relationships = await self._repository.get_all_profile_relationships()
        
        profiles = set(r["profile_id"] for r in all_embeddings)
        T = len(active_topics)
        topic_idx = {tid: i for i, tid in enumerate(active_topics)}
        
        result: dict[int, dict[str, np.ndarray]] = {}
        
        # 1. Semantic Signature (TF-IDF weighted)
        profile_embs: dict[int, list[np.ndarray]] = {}
        all_vecs = []
        for row in all_embeddings:
            pid = row["profile_id"]
            emb = self._parse_embedding(row["embedding"])
            if emb:
                vec = np.array(emb, dtype=np.float32)
                profile_embs.setdefault(pid, []).append(vec)
                all_vecs.append(vec)
                
        global_centroid = np.mean(np.array(all_vecs), axis=0) if all_vecs else np.zeros(384, dtype=np.float32)
        
        for pid in profiles:
            embs = profile_embs.get(pid, [])
            if not embs:
                semantic_vec = np.zeros(384, dtype=np.float32)
            else:
                embs_arr = np.array(embs)
                if len(embs_arr) == 1:
                    semantic_vec = embs_arr[0]
                else:
                    # Cosine distance from global centroid
                    global_norm = np.linalg.norm(global_centroid)
                    emb_norms = np.linalg.norm(embs_arr, axis=1)
                    denom = global_norm * emb_norms
                    denom[denom == 0] = 1e-10
                    cos_sims = np.dot(embs_arr, global_centroid) / denom
                    distances = 1.0 - cos_sims
                    
                    # Softmax with temperature 2.0
                    temp = 2.0
                    exp_dist = np.exp(distances * temp)
                    weights = exp_dist / np.sum(exp_dist)
                    
                    semantic_vec = np.average(embs_arr, axis=0, weights=weights)
                    
            # 2 & 3. Topic Relevance and Stance Distributions
            topic_vec = np.zeros(T, dtype=np.float32)
            stance_vec = np.zeros(T, dtype=np.float32)
            
            pid_intel = [ti for ti in topic_intel if ti["profile_id"] == pid]
            for ti in pid_intel:
                tid = str(ti["topic_id"])
                if tid in topic_idx:
                    idx = topic_idx[tid]
                    topic_vec[idx] = ti.get("relevance_score", 0.0)
                    stance_vec[idx] = (ti.get("supportive_score", 0.0) - ti.get("opposition_score", 0.0)) * ti.get("sarcasm_confidence", 1.0)
                    
            # 4. Behavioral Signature
            pid_tweets = [t for t in tweet_metadata if t["profile_id"] == pid]
            total_tweets = len(pid_tweets)
            if total_tweets > 0:
                retweets = sum(1 for t in pid_tweets if t.get("is_retweet"))
                replies = sum(1 for t in pid_tweets if t.get("is_reply"))
                quotes = sum(1 for t in pid_tweets if t.get("quoted_tweet_id"))
                hashtags_total = sum(len(t.get("hashtags") or []) for t in pid_tweets)
                unique_mentions = len(set(m for t in pid_tweets for m in (t.get("mentions") or [])))
                
                behavior_vec = np.array([
                    retweets / total_tweets,
                    replies / total_tweets,
                    quotes / total_tweets,
                    (hashtags_total / total_tweets) / 10.0, # scale down
                    unique_mentions / total_tweets
                ], dtype=np.float32)
            else:
                behavior_vec = np.zeros(5, dtype=np.float32)
                
            # 5. Graph Signature
            pid_out = [r for r in relationships if r["source_profile_id"] == pid]
            pid_in = [r for r in relationships if r["target_profile_id"] == pid]
            
            rt_interactions = sum(r["interaction_count"] for r in pid_out) + sum(r["interaction_count"] for r in pid_in)
            unique_partners = len(set(r["target_profile_id"] for r in pid_out) | set(r["source_profile_id"] for r in pid_in))
            inbound = sum(r["interaction_count"] for r in pid_in)
            outbound = sum(r["interaction_count"] for r in pid_out)
            inbound_ratio = inbound / (inbound + outbound) if (inbound + outbound) > 0 else 0.0
            
            graph_vec = np.array([
                math.log1p(rt_interactions),
                math.log1p(len(pid_in) + len(pid_out)), # approximation of mention interactions
                math.log1p(unique_partners),
                inbound_ratio
            ], dtype=np.float32)
            
            result[pid] = {
                "semantic": self._l2_normalize(semantic_vec),
                "topic": self._l2_normalize(topic_vec),
                "stance": self._l2_normalize(stance_vec),
                "behavior": self._l2_normalize(behavior_vec),
                "graph": self._l2_normalize(graph_vec)
            }
            
        return result

    async def generate_global_map_coordinates(self) -> None:
        try:
            if not UMAP_AVAILABLE:
                logger.error("UMAP is not installed. Cannot generate map coordinates.")
                return

            logger.info("Generating global semantic map coordinates (multi-projection)...")
            vectors_by_profile = await self._build_composite_profile_vectors()
            
            profile_ids = list(vectors_by_profile.keys())
            if len(profile_ids) < 1:
                logger.warning("No profiles with embeddings to generate global map.")
                return

            for projection_name, weights in PROJECTIONS.items():
                logger.info(f"Computing projection: {projection_name}")
                
                if len(profile_ids) < 3:
                    # Symmetrical fallback coordinates
                    result_coords = []
                    for i, pid in enumerate(profile_ids):
                        x = float(i - (len(profile_ids) - 1) / 2.0) * 2.0
                        y = 0.0
                        result_coords.append({"profile_id": pid, "projection_type": projection_name, "x": x, "y": y})
                    await self._repository.save_global_coordinates(result_coords)
                    continue

                # Build final composite matrix X
                X_list = []
                for pid in profile_ids:
                    subs = vectors_by_profile[pid]
                    sem = subs["semantic"] * weights["semantic"]
                    top = subs["topic"] * weights["topic"]
                    sta = subs["stance"] * weights["stance"]
                    beh = subs["behavior"] * weights["behavior"]
                    gra = subs["graph"] * weights["graph"]
                    
                    composite = np.concatenate([sem, top, sta, beh, gra])
                    X_list.append(self._l2_normalize(composite))
                    
                X = np.array(X_list, dtype=np.float32)
                
                # Run UMAP
                n_neighbors = min(15, len(profile_ids) - 1)
                reducer = umap.UMAP(n_neighbors=n_neighbors, min_dist=0.1, n_components=2, random_state=42, init="random")
                coords = reducer.fit_transform(X)

                result_coords = [
                    {
                        "profile_id": pid, 
                        "projection_type": projection_name,
                        "x": float(coord[0]), 
                        "y": float(coord[1])
                    }
                    for pid, coord in zip(profile_ids, coords, strict=False)
                ]

                await self._repository.save_global_coordinates(result_coords)
                
            logger.info("All global map projections generated and saved successfully.")
        except Exception as e:
            logger.error(f"Error generating global map coordinates: {e}", exc_info=True)

    async def _aggregate_topic_embeddings_and_features(
        self, topic_id: str, rows: list[dict[str, Any]]
    ) -> tuple[list[int], np.ndarray]:
        """
        Sophisticated topic aggregation:
        1. Weights each profile's tweets by their cosine similarity to the topic embeddings so off-topic tweets are filtered/down-weighted.
        2. Fuses the weighted semantic vector with stance and relevance scores (relevance, supportive, opposition, sarcasm) into a multi-signal representation.
        """
        topic_embs = await self._repository.get_topic_embeddings_for_topic(topic_id)
        topic_intel_rows = await self._repository.get_topic_intelligence_for_topic(topic_id)
        intel_map = {int(r["profile_id"]): r for r in topic_intel_rows}

        profile_embs: dict[int, list[np.ndarray]] = {}
        for row in rows:
            pid = int(row["profile_id"])
            emb = self._parse_embedding(row["embedding"])
            if emb:
                profile_embs.setdefault(pid, []).append(np.array(emb, dtype=np.float32))

        topic_centroid = None
        if topic_embs:
            parsed_topics = [
                np.array(e, dtype=np.float32) if not isinstance(e, np.ndarray) else e
                for e in topic_embs
            ]
            if parsed_topics:
                topic_centroid = self._l2_normalize(np.mean(np.array(parsed_topics), axis=0))

        profile_ids = []
        composite_features = []

        for pid, embs in profile_embs.items():
            arr = np.array(embs, dtype=np.float32)
            if topic_centroid is not None and len(arr) > 1:
                arr_norms = np.linalg.norm(arr, axis=1)
                denom = arr_norms * np.linalg.norm(topic_centroid)
                denom[denom == 0] = 1e-10
                sims = np.dot(arr, topic_centroid) / denom
                
                temp = 3.0
                exp_sim = np.exp((sims - np.max(sims)) * temp)
                weights = exp_sim / np.sum(exp_sim)
                semantic_vec = np.average(arr, axis=0, weights=weights)
            else:
                semantic_vec = np.mean(arr, axis=0)

            semantic_norm = self._l2_normalize(semantic_vec)

            intel = intel_map.get(pid, {})
            rel = float(intel.get("relevance_score", 0.5))
            sup = float(intel.get("supportive_score", 0.0))
            opp = float(intel.get("opposition_score", 0.0))
            sarc = float(intel.get("sarcasm_confidence", 1.0))
            net_stance = (sup - opp) * sarc

            stance_vec = np.array([rel, sup, opp, net_stance, sarc], dtype=np.float32)
            stance_norm = self._l2_normalize(stance_vec)

            composite = np.concatenate([semantic_norm * 0.75, stance_norm * 0.25])
            profile_ids.append(pid)
            composite_features.append(self._l2_normalize(composite))

        return profile_ids, np.array(composite_features, dtype=np.float32)

    async def generate_topic_map_coordinates(self, topic_id: str) -> None:
        try:
            if not UMAP_AVAILABLE:
                logger.error("UMAP is not installed. Cannot generate map coordinates.")
                return

            logger.info(f"Generating topic map coordinates for topic_id={topic_id}...")
            rows = await self._repository.get_topic_profile_embeddings(
                topic_id, model_name=getattr(self._settings, "embedding_model_name", "sentence-transformers/all-MiniLM-L6-v2")
            )

            if not rows:
                logger.warning(f"No relevant embeddings found for topic map generation: {topic_id}.")
                return

            profile_ids, X = await self._aggregate_topic_embeddings_and_features(topic_id, rows)

            if len(profile_ids) < 1:
                logger.warning(f"No profiles with embeddings to generate topic map: {topic_id}.")
                return

            if len(profile_ids) < 3:
                # Symmetrical fallback coordinates for 1 or 2 profiles
                result_coords = []
                for i, pid in enumerate(profile_ids):
                    x = float(i - (len(profile_ids) - 1) / 2.0) * 2.0
                    y = 0.0
                    result_coords.append({"profile_id": pid, "x": x, "y": y, "cluster_id": i})
                await self._repository.save_topic_coordinates(topic_id, result_coords)
                logger.info(f"Saved fallback topic map coordinates for small dataset (size={len(profile_ids)}) for topic_id={topic_id}.")
                return

            # Run UMAP on multi-signal composite vectors
            n_neighbors = min(15, len(profile_ids) - 1)
            reducer = umap.UMAP(
                n_neighbors=n_neighbors,
                min_dist=0.15,
                n_components=2,
                random_state=42,
                init="random" if len(profile_ids) < 10 else "spectral"
            )
            coords = reducer.fit_transform(X)

            # Perform KMeans clustering on the composite feature space to assign genuine cluster_ids
            cluster_ids = [None] * len(profile_ids)
            try:
                from sklearn.cluster import KMeans
                n_clusters = min(5, max(2, len(profile_ids) // 3))
                if len(profile_ids) >= n_clusters:
                    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
                    cluster_labels = kmeans.fit_predict(X)
                    cluster_ids = [int(c) for c in cluster_labels]
            except Exception as cluster_err:
                logger.warning(f"Clustering skipped or failed for topic {topic_id}: {cluster_err}")

            result_coords = [
                {"profile_id": pid, "x": float(coord[0]), "y": float(coord[1]), "cluster_id": cid}
                for pid, coord, cid in zip(profile_ids, coords, cluster_ids, strict=False)
            ]

            await self._repository.save_topic_coordinates(topic_id, result_coords)
            logger.info(f"Topic map coordinates saved successfully for topic_id={topic_id}.")
        except Exception as e:
            logger.error(f"Error generating topic map coordinates: {e}", exc_info=True)
