import json
from collections import defaultdict
import numpy as np

from config.logging import get_logger
from database.repositories.intelligence_repository import IntelligenceRepository
from config.settings import get_settings

logger = get_logger(__name__)

class ClusteringService:
    def __init__(self, repository: IntelligenceRepository):
        self._repository = repository

    async def cluster_profile_tweets(self, profile_id: int) -> dict:
        logger.info(f"Starting HDBSCAN clustering for profile {profile_id}")
        
        # 1. Fetch embeddings
        settings = get_settings()
        records = await self._repository.get_profile_tweet_embeddings(profile_id, model_name=settings.embedding_model_name)
        if not records or len(records) < 10:
            logger.info(f"Not enough tweets to cluster for profile {profile_id}")
            return {"status": "skipped", "message": "Not enough tweets to cluster."}

        # 2. Parse embeddings
        def parse_emb(emb):
            if isinstance(emb, str):
                return json.loads(emb)
            return list(emb)

        tweet_ids = [r["tweet_id"] for r in records]
        texts = [r["clean_text"] or r["raw_text"] or "" for r in records]
        embeddings = np.array([parse_emb(r["embedding"]) for r in records], dtype=np.float32)

        # 3. Run HDBSCAN
        from sklearn.cluster import HDBSCAN
        # HDBSCAN parameters tuned for embedding spaces
        min_cluster_size = max(5, min(15, len(records) // 10))
        clusterer = HDBSCAN(min_cluster_size=min_cluster_size, metric='euclidean', cluster_selection_method='eom')
        labels = clusterer.fit_predict(embeddings)

        # 4. Process clusters
        clusters_to_save = []
        cluster_text_samples = defaultdict(list)
        
        for idx, (tweet_id, label, text) in enumerate(zip(tweet_ids, labels, texts)):
            if label != -1:  # Not noise
                cluster_text_samples[label].append(text)
            
            # We'll just generate a basic label for now
            cluster_label = f"Cluster {label}" if label != -1 else "Noise"
            clusters_to_save.append({
                "tweet_id": tweet_id,
                "cluster_id": int(label),
                "cluster_label": cluster_label
            })

        # 5. Save to DB
        await self._repository.save_tweet_clusters(profile_id, clusters_to_save)
        
        num_clusters = len(set(labels)) - (1 if -1 in labels else 0)
        logger.info(f"Finished clustering profile {profile_id}. Found {num_clusters} clusters.")
        
        return {
            "status": "success",
            "profile_id": profile_id,
            "num_clusters": num_clusters,
            "total_tweets": len(records),
            "noise_tweets": list(labels).count(-1)
        }
