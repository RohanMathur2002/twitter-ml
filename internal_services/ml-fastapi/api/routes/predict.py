from fastapi import APIRouter, HTTPException, status

from api.dependencies.services import ServiceContainerDep
from api.schemas.prediction import (
    ClassProbability, 
    PredictRequest, 
    PredictResponse,
    StanceBatchPredictRequest,
    StanceBatchPredictResponse,
    StancePredictionResponseItem
)


router = APIRouter(tags=["prediction"])


@router.post("/predict", response_model=PredictResponse)
async def predict(request: PredictRequest, services: ServiceContainerDep) -> PredictResponse:
    try:
        prediction = services.prediction.predict(
            text=request.text,
            include_probabilities=request.include_probabilities,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return PredictResponse(
        text=prediction.text,
        cleaned_text=prediction.cleaned_text,
        label=prediction.label,
        score=prediction.score,
        probabilities=[
            ClassProbability(label=label, probability=probability)
            for label, probability in prediction.probabilities
        ],
    )


@router.post("/predict/stance/batch", response_model=StanceBatchPredictResponse)
async def predict_stance_batch(request: StanceBatchPredictRequest, services: ServiceContainerDep) -> StanceBatchPredictResponse:
    try:
        predictions = services.stance_classifier.classify_batch(
            texts=request.texts,
            topic_name=request.topic_name,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return StanceBatchPredictResponse(
        predictions=[
            StancePredictionResponseItem(
                text=p.text,
                label=p.label,
                score=p.score,
                probabilities=[
                    ClassProbability(label=label, probability=probability)
                    for label, probability in p.probabilities
                ],
            )
            for p in predictions
        ]
    )

