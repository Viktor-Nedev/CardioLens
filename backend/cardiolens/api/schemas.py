"""Request/response models for the HTTP API."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class PredictRequest(BaseModel):
    features: dict[str, float | int | str | bool | None] = Field(
        default_factory=dict,
        description="Feature id -> value. Missing features are imputed with cohort statistics.",
        examples=[{"age": 64, "sex_male": 1, "typical_chest_pain": 1, "dm": 1, "ejection_fraction": 45}],
    )
    with_interval: bool = Field(True, description="Include the bootstrap 10-90% prediction interval.")


class Contribution(BaseModel):
    feature: str
    label: str
    display: str
    contribution: float = Field(description="Additive SHAP contribution in calibrated log-odds")
    delta_pp: float = Field(description="Change in probability (percentage points) attributable to the feature")
    imputed: bool


class TargetPrediction(BaseModel):
    id: str
    label: str
    short: str
    structure: str
    probability: float
    interval: list[float] | None
    threshold: float
    positive: bool
    risk_band: dict[str, str]
    model: str
    base_logit: float
    base_probability: float
    logit: float
    additivity_error: float
    contributions: list[Contribution]
    summary: str


class PhysiologyRow(BaseModel):
    feature: str
    label: str
    group: str
    kind: str
    value: float | str | None
    display: str
    unit: str | None
    ref: list[float] | None
    flag: str | None
    percentile: float | None
    imputed: bool
    contributions: dict[str, float]


class PredictResponse(BaseModel):
    targets: dict[str, TargetPrediction]
    physiology: list[PhysiologyRow]
    imputed: list[str]
    warnings: list[str]
    latency_ms: float
    disclaimer: str


class Health(BaseModel):
    status: str
    version: str
    models: dict[str, Any]
