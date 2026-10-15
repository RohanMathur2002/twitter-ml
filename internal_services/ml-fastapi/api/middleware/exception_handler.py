from fastapi import FastAPI, HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from api.schemas.base import APIError, ErrorResponse
from config.logging import get_logger


logger = get_logger(__name__)


def _safe_for_log(value: object) -> str:
    return str(value).encode("ascii", errors="backslashreplace").decode("ascii")


def _error_response(status_code: int, code: str, message: str, details: dict | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=jsonable_encoder(
            ErrorResponse(error=APIError(code=code, message=message, details=details))
        ),
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        logger.warning(
            "http_exception",
            path=request.url.path,
            status_code=exc.status_code,
            detail=_safe_for_log(exc.detail),
        )
        return _error_response(
            status_code=exc.status_code,
            code="request_error",
            message=str(exc.detail),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        logger.warning(
            "request_validation_failed",
            path=request.url.path,
            error_count=len(exc.errors()),
        )
        return _error_response(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            code="validation_error",
            message="Request validation failed.",
            details={"errors": exc.errors()},
        )

    @app.exception_handler(SQLAlchemyError)
    async def database_exception_handler(request: Request, exc: SQLAlchemyError) -> JSONResponse:
        logger.exception("database_error", path=request.url.path, error=_safe_for_log(exc))
        return _error_response(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            code="database_error",
            message="The database is temporarily unavailable.",
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled_exception", path=request.url.path, error=_safe_for_log(exc))
        return _error_response(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            code="internal_server_error",
            message="An unexpected error occurred.",
        )
