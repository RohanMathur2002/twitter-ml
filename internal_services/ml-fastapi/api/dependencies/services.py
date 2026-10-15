from typing import Annotated

from fastapi import Depends, Request

from services.service_container import ServiceContainer


def get_service_container(request: Request) -> ServiceContainer:
    return request.app.state.services


ServiceContainerDep = Annotated[ServiceContainer, Depends(get_service_container)]

