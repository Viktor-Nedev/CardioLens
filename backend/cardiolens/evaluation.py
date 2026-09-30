"""Validation utilities: nested CV, calibration, thresholds, metrics with CIs, curves."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
from joblib import Parallel, delayed
from sklearn.base import clone
from sklearn.calibration import calibration_curve
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    precision_recall_curve,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import GridSearchCV, RepeatedStratifiedKFold, StratifiedKFold

from .config import Catalog
from .models import ModelFamily, make_pipeline, margin, param_grid


def sigmoid(z):
    return 1.0 / (1.0 + np.exp(-z))


# --------------------------------------------------------------------------- tuning


def tuned_search(
    family: ModelFamily, catalog: Catalog, seed: int, inner_splits: int = 5, n_jobs: int = 1
) -> GridSearchCV:
    return GridSearchCV(
        make_pipeline(family, catalog, seed),
        param_grid(family),
        scoring="roc_auc",
        cv=StratifiedKFold(inner_splits, shuffle=True, random_state=seed),
        n_jobs=n_jobs,
        refit=True,
        error_score="raise",
    )


def _outer_fold(family, catalog, seed, X, y, train_idx, test_idx):
    search = tuned_search(family, catalog, seed)
    search.fit(X.iloc[train_idx], y[train_idx])
    scores = margin(search.best_estimator_, X.iloc[test_idx], family)
    y_test = y[test_idx]
    return {
        "roc_auc": float(roc_auc_score(y_test, scores)),
        "pr_auc": float(average_precision_score(y_test, scores)),
        "best_params": {k.removeprefix("model__"): v for k, v in search.best_params_.items()},
    }


def nested_cv(
    family: ModelFamily,
    catalog: Catalog,
    X: pd.DataFrame,
    y: np.ndarray,
    seed: int,
    outer_splits: int = 5,
    outer_repeats: int = 5,
    n_jobs: int = -1,
) -> dict[str, Any]:
    """Unbiased estimate of the whole tune-then-fit procedure for one model family."""
    outer = RepeatedStratifiedKFold(n_splits=outer_splits, n_repeats=outer_repeats, random_state=seed)
    folds = Parallel(n_jobs=n_jobs)(
        delayed(_outer_fold)(family, catalog, seed, X, y, tr, te) for tr, te in outer.split(X, y)
    )
    aucs = np.array([f["roc_auc"] for f in folds])
    prs = np.array([f["pr_auc"] for f in folds])
    return {
        "scheme": f"{outer_repeats}x repeated stratified {outer_splits}-fold (outer) / 5-fold grid search (inner)",
        "n_folds": len(folds),
        "roc_auc_mean": float(aucs.mean()),
        "roc_auc_std": float(aucs.std(ddof=1)),
        "pr_auc_mean": float(prs.mean()),
        "pr_auc_std": float(prs.std(ddof=1)),
        "fold_roc_auc": [round(float(a), 4) for a in aucs],
    }


def oof_margins(
    estimator,
    family: ModelFamily,
    X: pd.DataFrame,
    y: np.ndarray,
    seed: int,
    splits: int = 5,
    repeats: int = 5,
    n_jobs: int = -1,
) -> np.ndarray:
    """Out-of-fold scores with fixed hyper-parameters, averaged over repeats."""
    cv = RepeatedStratifiedKFold(n_splits=splits, n_repeats=repeats, random_state=seed + 1)

    def run(tr, te):
        est = clone(estimator).fit(X.iloc[tr], y[tr])
        return te, margin(est, X.iloc[te], family)

    results = Parallel(n_jobs=n_jobs)(delayed(run)(tr, te) for tr, te in cv.split(X, y))
    total = np.zeros(len(y))
    count = np.zeros(len(y))
    for te, s in results:
        total[te] += s
        count[te] += 1
    return total / count


# ---------------------------------------------------------------------- calibration


@dataclass
class PlattCalibrator:
    """p = sigmoid(a * margin + b). Monotone, so SHAP contributions scale by `a`."""

    a: float
    b: float

    @classmethod
    def fit(cls, scores: np.ndarray, y: np.ndarray) -> "PlattCalibrator":
        lr = LogisticRegression(C=1e6, max_iter=1000).fit(scores.reshape(-1, 1), y)
        return cls(a=float(lr.coef_[0, 0]), b=float(lr.intercept_[0]))

    def logit(self, scores: np.ndarray) -> np.ndarray:
        return self.a * np.asarray(scores) + self.b

    def __call__(self, scores: np.ndarray) -> np.ndarray:
        return sigmoid(self.logit(scores))


def youden_threshold(y: np.ndarray, p: np.ndarray) -> float:
    fpr, tpr, thr = roc_curve(y, p)
    j = tpr - fpr
    best = int(np.argmax(j))
    return float(np.clip(thr[best], 0.01, 0.99))


def f1_threshold(y: np.ndarray, p: np.ndarray) -> float:
    prec, rec, thr = precision_recall_curve(y, p)
    f1 = 2 * prec[:-1] * rec[:-1] / np.clip(prec[:-1] + rec[:-1], 1e-12, None)
    return float(np.clip(thr[int(np.argmax(f1))], 0.01, 0.99))


# -------------------------------------------------------------------------- metrics


def point_metrics(y: np.ndarray, p: np.ndarray, threshold: float) -> dict[str, float]:
    pred = (p >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    specificity = tn / (tn + fp) if tn + fp else 0.0
    npv = tn / (tn + fn) if tn + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    both = len(np.unique(y)) == 2
    return {
        "accuracy": float((tp + tn) / len(y)),
        "precision": float(precision),
        "recall": float(recall),
        "specificity": float(specificity),
        "npv": float(npv),
        "f1": float(f1),
        "roc_auc": float(roc_auc_score(y, p)) if both else float("nan"),
        "pr_auc": float(average_precision_score(y, p)) if both else float("nan"),
        "brier": float(brier_score_loss(y, p)),
    }


def metrics_with_ci(
    y: np.ndarray, p: np.ndarray, threshold: float, n_boot: int = 2000, seed: int = 0
) -> dict[str, dict[str, float]]:
    """Point estimates plus percentile bootstrap 95% confidence intervals."""
    base = point_metrics(y, p, threshold)
    rng = np.random.default_rng(seed)
    samples: dict[str, list[float]] = {k: [] for k in base}
    n = len(y)
    for _ in range(n_boot):
        idx = rng.integers(0, n, n)
        if len(np.unique(y[idx])) < 2:
            continue
        for k, v in point_metrics(y[idx], p[idx], threshold).items():
            samples[k].append(v)
    out = {}
    for k, v in base.items():
        arr = np.asarray(samples[k])
        arr = arr[~np.isnan(arr)]
        lo, hi = (np.percentile(arr, [2.5, 97.5]) if len(arr) else (np.nan, np.nan))
        out[k] = {"value": v, "ci_low": float(lo), "ci_high": float(hi)}
    return out


def confusion(y: np.ndarray, p: np.ndarray, threshold: float) -> dict[str, int]:
    tn, fp, fn, tp = confusion_matrix(y, (p >= threshold).astype(int), labels=[0, 1]).ravel()
    return {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)}


def _downsample(points: list[tuple[float, float]], max_points: int = 80) -> list[list[float]]:
    if len(points) <= max_points:
        return [[round(a, 4), round(b, 4)] for a, b in points]
    idx = np.unique(np.linspace(0, len(points) - 1, max_points).round().astype(int))
    return [[round(points[i][0], 4), round(points[i][1], 4)] for i in idx]


def curves(y: np.ndarray, p: np.ndarray, n_bins: int) -> dict[str, Any]:
    fpr, tpr, _ = roc_curve(y, p)
    prec, rec, _ = precision_recall_curve(y, p)
    frac_pos, mean_pred = calibration_curve(y, p, n_bins=n_bins, strategy="quantile")
    return {
        "roc": _downsample(list(zip(fpr, tpr))),
        "pr": _downsample(list(zip(rec[::-1], prec[::-1]))),
        "calibration": [[round(float(m), 4), round(float(f), 4)] for m, f in zip(mean_pred, frac_pos)],
    }
