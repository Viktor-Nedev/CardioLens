"""LIME-style local surrogate explanations (Ribeiro et al., 2016), used as a cross-check of SHAP.

Each perturbed sample keeps the patient's own value for a random subset of the clinical
features and takes the others from random development patients; its model output is averaged
over a few such donor patients, which removes most of the sampling noise. A weighted ridge
regression of the calibrated log-odds on the binary "kept" indicators then gives one weight
per feature: the change in log-odds when that feature takes this patient's value instead of
a typical cohort value. That is the same question SHAP answers, so the two can be compared.
"""

from __future__ import annotations

import numpy as np


def sample_masks(n_samples: int, n_features: int, rng: np.random.Generator) -> np.ndarray:
    """Keep-masks (True = the patient's own value). Row 0 is the patient; every other row
    replaces k ~ Uniform{1..d} features chosen at random, as in LIME's text and image samplers."""
    Z = np.ones((n_samples, n_features), dtype=bool)
    if n_samples > 1:
        k = rng.integers(1, n_features + 1, size=n_samples - 1)
        ranks = np.argsort(np.argsort(rng.random((n_samples - 1, n_features)), axis=1), axis=1)
        Z[1:] = ranks >= k[:, None]
    return Z


def kernel_weights(Z: np.ndarray, width: float) -> np.ndarray:
    """Exponential kernel on the distance to the patient (number of replaced features)."""
    d2 = (~Z).sum(axis=1).astype(float)
    return np.exp(-d2 / width**2)


def fit_surrogate(Z: np.ndarray, y: np.ndarray, w: np.ndarray, alpha: float = 1.0) -> tuple[float, np.ndarray, float]:
    """Weighted ridge regression y ~ b0 + Z @ beta. Returns (b0, beta, weighted R^2)."""
    X = Z.astype(float)
    sw = w / w.sum()
    x_mean = sw @ X
    y_mean = float(sw @ y)
    Xc = X - x_mean
    yc = y - y_mean
    A = Xc.T @ (Xc * w[:, None]) + alpha * np.eye(X.shape[1])
    beta = np.linalg.solve(A, Xc.T @ (w * yc))
    resid = yc - Xc @ beta
    r2 = 1.0 - float(w @ resid**2) / max(float(w @ yc**2), 1e-12)
    return y_mean - float(x_mean @ beta), beta, r2


def agreement(shap_values: np.ndarray, lime_weights: np.ndarray, top: int = 5) -> dict[str, float]:
    """How closely two attributions agree: correlation across all features, overlap of the
    top factors and direction agreement on the factors SHAP considers relevant. (A rank
    correlation is not used: many features carry ~0 weight and their ranks are noise.)"""
    with np.errstate(invalid="ignore", divide="ignore"):
        r = np.corrcoef(shap_values, lime_weights)[0, 1]
    top_shap = set(np.argsort(-np.abs(shap_values))[:top])
    top_lime = set(np.argsort(-np.abs(lime_weights))[:top])
    relevant = [i for i in np.argsort(-np.abs(shap_values))[:10] if abs(shap_values[i]) > 0.05]
    signs = [np.sign(shap_values[i]) == np.sign(lime_weights[i]) for i in relevant]
    return {
        "correlation": round(float(r), 4) if np.isfinite(r) else 0.0,
        "top_overlap": len(top_shap & top_lime),
        "top_n": top,
        "sign_agreement": round(float(np.mean(signs)), 4) if signs else 1.0,
    }
