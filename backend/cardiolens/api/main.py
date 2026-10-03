"""FastAPI application: prediction API plus (in production) the built dashboard."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from functools import lru_cache

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .. import __version__
from ..config import FRONTEND_DIST
from ..predictor import Predictor
from .schemas import Health, LimeRequest, PredictRequest, PredictResponse, ProfileRequest, SimilarRequest

DISCLAIMER = (
    "CardioLens is a research and educational prototype for clinical decision support. "
    "Its outputs are statistical estimates from a 303-patient dataset and are not a diagnosis. "
    "They must not replace clinical judgement or formal diagnostic imaging such as coronary angiography or CT angiography."
)


@lru_cache(maxsize=1)
def get_predictor() -> Predictor:
    return Predictor()


@asynccontextmanager
async def lifespan(_: FastAPI):
    predictor = get_predictor()  # load models and warm up explainers before serving
    predictor.predict(predictor.default_patient())
    yield


app = FastAPI(
    title="CardioLens API",
    lifespan=lifespan,
    version=__version__,
    description="Coronary artery disease and vessel-level stenosis prediction with SHAP explanations.",
)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CARDIOLENS_CORS", "*").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=Health)
def health() -> Health:
    p = get_predictor()
    return Health(
        status="ok",
        version=__version__,
        models={tid: {"family": tm.family.label, "threshold": tm.threshold} for tid, tm in p.models.items()},
    )


@app.get("/api/schema")
def schema() -> dict:
    p = get_predictor()
    return {**p.schema, "default_patient": p.default_patient(), "disclaimer": DISCLAIMER}


@app.get("/api/metrics")
def metrics() -> dict:
    return get_predictor().metrics


@app.get("/api/importance")
def importance() -> dict:
    return get_predictor().importance


@app.get("/api/cases")
def cases() -> list[dict]:
    return get_predictor().cases


@app.get("/api/cases/{case_id}")
def case(case_id: str) -> dict:
    for c in get_predictor().cases:
        if c["id"] == case_id:
            return c
    raise HTTPException(status_code=404, detail=f"Unknown case {case_id}")


@app.post("/api/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    result = get_predictor().predict(req.features, with_interval=req.with_interval)
    return PredictResponse(**result, disclaimer=DISCLAIMER)


@app.post("/api/profile")
def profile(req: ProfileRequest) -> dict:
    """How each target's probability changes when one feature varies (others fixed)."""
    p = get_predictor()
    if req.feature not in p.feature_ids:
        raise HTTPException(status_code=404, detail=f"Unknown feature {req.feature}")
    return p.profile(req.features, req.feature, req.points)


@app.post("/api/similar")
def similar(req: SimilarRequest) -> dict:
    """The most similar development patients and their angiography results."""
    return get_predictor().similar(req.features, req.k)


@app.post("/api/lime")
def lime(req: LimeRequest) -> dict:
    """LIME-style local surrogate explanations for every target, compared with SHAP."""
    return get_predictor().lime(req.features, req.samples, req.seed)


# ---------------------------------------------------------------- static frontend

if FRONTEND_DIST.exists():
    assets = FRONTEND_DIST / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(status_code=404)
        candidate = (FRONTEND_DIST / path).resolve()
        if path and candidate.is_file() and FRONTEND_DIST.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
