from dataclasses import dataclass

from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

from config.settings import Settings
from database.repositories.document_repository import DocumentRepository
from database.repositories.intelligence_repository import IntelligenceRepository
from database.repositories.tweet_embedding_repository import TweetEmbeddingRepository
from services.embedding_service import EmbeddingService
from services.model_service import ModelService
from services.prediction_service import PredictionService
from services.preprocessing_service import PreprocessingService
from services.profile_intelligence_service import ProfileIntelligenceService
from services.stance_classifier_service import StanceClassifierService
from services.tweet_embedding_service import TweetEmbeddingService
from services.vector_service import VectorService
from services.semantic_map_service import SemanticMapService
from services.clustering_service import ClusteringService


@dataclass(frozen=True)
class ServiceContainer:
    preprocessing: PreprocessingService
    embedding: EmbeddingService
    prediction: PredictionService
    stance_classifier: StanceClassifierService
    profile_intelligence: ProfileIntelligenceService
    vector: VectorService
    tweet_embedding: TweetEmbeddingService
    semantic_map: SemanticMapService
    clustering: ClusteringService

    @classmethod
    def from_settings(
        cls,
        settings: Settings,
        model_service: ModelService,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> "ServiceContainer":
        preprocessing = PreprocessingService()
        embedding = EmbeddingService(settings=settings, model_service=model_service)
        prediction = PredictionService(
            preprocessing_service=preprocessing,
            embedding_service=embedding,
            model_service=model_service,
        )
        stance_classifier = StanceClassifierService(model_service=model_service)
        repository = DocumentRepository(session_factory=session_factory)
        tweet_embedding_repository = TweetEmbeddingRepository(session_factory=session_factory)
        intelligence_repository = IntelligenceRepository(session_factory=session_factory)
        profile_intelligence = ProfileIntelligenceService(
            repository=intelligence_repository,
            classifier=stance_classifier,
        )
        vector = VectorService(
            settings=settings,
            preprocessing_service=preprocessing,
            embedding_service=embedding,
            repository=repository,
        )
        tweet_embedding = TweetEmbeddingService(
            settings=settings,
            preprocessing_service=preprocessing,
            embedding_service=embedding,
            repository=tweet_embedding_repository,
        )
        semantic_map = SemanticMapService(repository=intelligence_repository, settings=settings)
        clustering = ClusteringService(repository=intelligence_repository)
        return cls(
            preprocessing=preprocessing,
            embedding=embedding,
            prediction=prediction,
            stance_classifier=stance_classifier,
            profile_intelligence=profile_intelligence,
            vector=vector,
            tweet_embedding=tweet_embedding,
            semantic_map=semantic_map,
            clustering=clustering,
        )
