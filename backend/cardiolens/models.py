"""Registry of candidate model families.

Adding a family = adding one entry to `FAMILIES`. The training loop tunes every
family with nested cross-validation and selects the best per target; the
explainer type tells `explain.py` which SHAP algorithm to use.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

import numpy as np
from sklearn.base import ClassifierMixin
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.svm import SVC

from .config import Catalog
from .features import build_preprocessor


@dataclass(frozen=True)
class ModelFamily:
    id: str
    label: str
    factory: Callable[[int], ClassifierMixin]
    grid: dict[str, list[Any]]
    explainer: str  # linear | tree | kernel
    margin: str  # decision (log-odds / signed distance) | proba (class-1 probability)
    complexity: int  # lower = simpler / more interpretable, used to break ties
    selectable: bool = True
    notes: str = ""
    tags: list[str] = field(default_factory=list)


FAMILIES: dict[str, ModelFamily] = {
    "logreg": ModelFamily(
        id="logreg",
        label="Logistic regression (elastic-net)",
        factory=lambda seed: LogisticRegression(
            solver="saga", max_iter=5000, tol=1e-3, random_state=seed
        ),
        grid={
            "C": [0.03, 0.1, 0.3, 1.0],
            "l1_ratio": [0.0, 0.5, 1.0],
            "class_weight": [None, "balanced"],
        },
        explainer="linear",
        margin="decision",
        complexity=0,
        notes="Sparse, directly interpretable coefficients.",
    ),
    "gradient_boosting": ModelFamily(
        id="gradient_boosting",
        label="Gradient boosting (trees)",
        factory=lambda seed: GradientBoostingClassifier(random_state=seed, subsample=0.8),
        grid={
            "n_estimators": [100, 250],
            "learning_rate": [0.03, 0.1],
            "max_depth": [2, 3],
        },
        explainer="tree",
        margin="decision",
        complexity=2,
    ),
    "random_forest": ModelFamily(
        id="random_forest",
        label="Random forest",
        factory=lambda seed: RandomForestClassifier(
            n_estimators=150, random_state=seed, n_jobs=1
        ),
        grid={
            "max_depth": [4, None],
            "min_samples_leaf": [1, 4],
            "max_features": ["sqrt", 0.3],
            "class_weight": [None, "balanced_subsample"],
        },
        explainer="tree",
        margin="proba",
        complexity=2,
    ),
    "svm_rbf": ModelFamily(
        id="svm_rbf",
        label="SVM (RBF kernel)",
        factory=lambda seed: SVC(kernel="rbf", random_state=seed),
        grid={"C": [0.3, 1.0, 3.0], "gamma": ["scale", 0.005], "class_weight": [None, "balanced"]},
        explainer="kernel",
        margin="decision",
        complexity=3,
        selectable=False,
        notes="Benchmark only: needs model-agnostic KernelSHAP, too slow for live what-if.",
    ),
}

# Minimal clinical baseline: the classic pre-test risk factors only.
BASELINE_FEATURES = [
    "age",
    "sex_male",
    "dm",
    "htn",
    "current_smoker",
    "family_history",
    "dyslipidemia",
    "typical_chest_pain",
]


def make_pipeline(family: ModelFamily, catalog: Catalog, seed: int) -> Pipeline:
    return Pipeline([("prep", build_preprocessor(catalog)), ("model", family.factory(seed))])


def param_grid(family: ModelFamily) -> dict[str, list[Any]]:
    return {f"model__{k}": v for k, v in family.grid.items()}


def margin(pipeline: Pipeline, X, family: ModelFamily) -> np.ndarray:
    """The raw score explained by SHAP and fed to the Platt calibrator."""
    if family.margin == "proba":
        return pipeline.predict_proba(X)[:, 1]
    return pipeline.decision_function(X)


def model_margin(model, Xt: np.ndarray, family: ModelFamily) -> np.ndarray:
    """Same as `margin` but on already-preprocessed data."""
    if family.margin == "proba":
        return model.predict_proba(Xt)[:, 1]
    return model.decision_function(Xt)
