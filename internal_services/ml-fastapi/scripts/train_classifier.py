import argparse
import asyncio
from pathlib import Path

from config.logging import configure_logging
from config.settings import get_settings
from database.repositories.document_repository import DocumentRepository
from database.session import create_database_engine, dispose_database_engine
from services.training_service import TrainingService


async def main() -> None:
    parser = argparse.ArgumentParser(description="Train classifier from labeled embeddings stored in PostgreSQL.")
    parser.add_argument("--classifier-path", type=Path, default=None)
    parser.add_argument("--label-encoder-path", type=Path, default=None)
    parser.add_argument("--max-rows", type=int, default=None)
    args = parser.parse_args()

    settings = get_settings()
    configure_logging(settings.log_level)
    engine, session_factory = create_database_engine(settings)

    try:
        repository = DocumentRepository(session_factory=session_factory)
        training_service = TrainingService(repository=repository)
        rows = await training_service.train_from_database(
            classifier_path=args.classifier_path or settings.classifier_path,
            label_encoder_path=args.label_encoder_path or settings.label_encoder_path,
            max_rows=args.max_rows,
        )
        print(f"Trained classifier using {rows} labeled embeddings.")
    finally:
        await dispose_database_engine(engine)


if __name__ == "__main__":
    asyncio.run(main())

