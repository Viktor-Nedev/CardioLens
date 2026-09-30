"""Paths, constants and YAML configuration loading."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BACKEND_DIR.parent
CONFIG_DIR = BACKEND_DIR / "config"
DATA_DIR = BACKEND_DIR / "data"
RAW_DATA_FILE = DATA_DIR / "raw" / "extention of Z-Alizadeh sani dataset.xlsx"
DATASET_URL = (
    "https://archive.ics.uci.edu/static/public/411/extention+of+z+alizadeh+sani+dataset.zip"
)

ARTIFACTS_DIR = Path(os.environ.get("CARDIOLENS_ARTIFACTS", BACKEND_DIR / "artifacts"))
MODELS_DIR = ARTIFACTS_DIR / "models"
FIGURES_DIR = ROOT_DIR / "docs" / "figures"
FRONTEND_DIST = Path(os.environ.get("CARDIOLENS_FRONTEND_DIST", ROOT_DIR / "frontend" / "dist"))

SEED = 42


@dataclass(frozen=True)
class FeatureSpec:
    id: str
    column: str
    label: str
    group: str
    kind: str  # numeric | binary | ordinal | categorical
    unit: str | None = None
    range: tuple[float, float] | None = None
    step: float | None = None
    ref: tuple[float, float] | None = None
    map: dict[str, Any] | None = None
    options: list[dict[str, Any]] = field(default_factory=list)
    description: str | None = None

    @property
    def model_kind(self) -> str:
        """How the preprocessing pipeline treats the feature."""
        return "categorical" if self.kind == "categorical" else "numeric"


@dataclass(frozen=True)
class TargetSpec:
    id: str
    column: str
    positive: str
    label: str
    short: str
    kind: str  # overall | vessel
    structure: str
    description: str | None = None
    territory: str | None = None


@dataclass(frozen=True)
class RiskBand:
    id: str
    label: str
    max: float


@dataclass(frozen=True)
class Catalog:
    groups: list[dict[str, str]]
    features: list[FeatureSpec]
    targets: list[TargetSpec]
    leakage_columns: list[str]
    risk_bands: list[RiskBand]

    def feature(self, feature_id: str) -> FeatureSpec:
        for f in self.features:
            if f.id == feature_id:
                return f
        raise KeyError(feature_id)

    def target(self, target_id: str) -> TargetSpec:
        for t in self.targets:
            if t.id == target_id:
                return t
        raise KeyError(target_id)

    @property
    def feature_ids(self) -> list[str]:
        return [f.id for f in self.features]

    def risk_band(self, probability: float) -> RiskBand:
        for band in self.risk_bands:
            if probability < band.max:
                return band
        return self.risk_bands[-1]


def _load_yaml(name: str) -> dict[str, Any]:
    with open(CONFIG_DIR / name, encoding="utf-8") as fh:
        return yaml.safe_load(fh)


@lru_cache(maxsize=1)
def load_catalog() -> Catalog:
    feats_raw = _load_yaml("features.yaml")
    targets_raw = _load_yaml("targets.yaml")

    features = []
    for f in feats_raw["features"]:
        f = dict(f)
        for key in ("range", "ref"):
            if f.get(key) is not None:
                f[key] = tuple(float(v) for v in f[key])
        if f["kind"] == "binary" and not f.get("options"):
            f["options"] = [{"value": 0, "label": "No"}, {"value": 1, "label": "Yes"}]
        features.append(FeatureSpec(**f))

    ids = [f.id for f in features]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate feature ids in features.yaml")

    catalog = Catalog(
        groups=feats_raw["groups"],
        features=features,
        targets=[TargetSpec(**t) for t in targets_raw["targets"]],
        leakage_columns=list(targets_raw["leakage_columns"]),
        risk_bands=[RiskBand(**b) for b in targets_raw["risk_bands"]],
    )

    leaked = {f.column for f in features} & set(catalog.leakage_columns)
    if leaked:
        raise ValueError(f"Target columns declared as features: {sorted(leaked)}")
    return catalog
