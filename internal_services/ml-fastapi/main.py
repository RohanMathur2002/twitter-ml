from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.middleware.exception_handler import register_exception_handlers
from api.middleware.request_logging import RequestLoggingMiddleware
from api.routes import embed, health, intelligence, maps, predict, search, tweets
from config.logging import configure_logging, get_logger
from config.settings import Settings, get_settings
from database.session import create_database_engine, dispose_database_engine
from services.model_service import ModelService
from services.service_container import ServiceContainer


logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)
    logger.info("application_starting", environment=settings.environment)

    engine, session_factory = create_database_engine(settings)
    model_service = ModelService(settings=settings)
    await model_service.load()

    app.state.settings = settings
    app.state.db_engine = engine
    app.state.db_session_factory = session_factory
    app.state.services = ServiceContainer.from_settings(
        settings=settings,
        model_service=model_service,
        session_factory=session_factory,
    )

    logger.info("application_started")
    try:
        yield
    finally:
        logger.info("application_stopping")
        await model_service.close()
        await dispose_database_engine(engine)
        logger.info("application_stopped")


def create_app(settings: Settings | None = None) -> FastAPI:
    runtime_settings = settings or get_settings()
    configure_logging(runtime_settings.log_level)

    app = FastAPI(
        title=runtime_settings.app_name,
        debug=runtime_settings.debug,
        lifespan=lifespan,
        version="0.1.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=runtime_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestLoggingMiddleware)

    register_exception_handlers(app)

    app.include_router(health.router, prefix=runtime_settings.api_prefix)
    app.include_router(predict.router, prefix=runtime_settings.api_prefix)
    app.include_router(embed.router, prefix=runtime_settings.api_prefix)
    app.include_router(search.router, prefix=runtime_settings.api_prefix)
    app.include_router(tweets.router, prefix=runtime_settings.api_prefix)
    app.include_router(intelligence.router, prefix=runtime_settings.api_prefix)
    app.include_router(maps.router, prefix=runtime_settings.api_prefix)

    return app


# Trigger reload after database migrations
app = create_app()
