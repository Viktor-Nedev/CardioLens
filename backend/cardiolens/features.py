"""Preprocessing pipeline and feature schema generation."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from .config import Catalog, FeatureSpec


class BinaryModeImputer(TransformerMixin, BaseEstimator):
    """Fills missing 0/1 flags with the column majority (fast replacement for scipy mode)."""

    def fit(self, X, y=None):
        arr = np.asarray(X, dtype=float)
        self.fill_ = (np.nanmean(arr, axis=0) >= 0.5).astype(float)
        self.n_features_in_ = arr.shape[1]
        return self

    def transform(self, X):
        arr = np.array(X, dtype=float, copy=True)
        rows, cols = np.where(np.isnan(arr))
        arr[rows, cols] = self.fill_[cols]
        return arr

    def get_feature_names_out(self, input_features=None):
        return np.asarray(input_features, dtype=object)


def build_preprocessor(catalog: Catalog) -> ColumnTransformer:
    """Impute (so partial patient records are accepted), scale numerics, one-hot categoricals."""
    numeric = [f.id for f in catalog.features if f.kind in ("numeric", "ordinal")]
    binary = [f.id for f in catalog.features if f.kind == "binary"]
    categorical = [f.id for f in catalog.features if f.kind == "categorical"]

    return ColumnTransformer(
        [
            (
                "num",
                Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())]),
                numeric,
            ),
            (
                "bin",
                Pipeline([("impute", BinaryModeImputer()), ("scale", StandardScaler())]),
                binary,
            ),
            (
                "cat",
                Pipeline(
                    [
                        ("impute", SimpleImputer(strategy="most_frequent")),
                        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
                    ]
                ),
                categorical,
            ),
        ],
        remainder="drop",
        verbose_feature_names_out=False,
    )


def output_feature_map(preprocessor: ColumnTransformer) -> list[str]:
    """For each transformed column, the clinical feature id it originates from.

    Used to fold one-hot SHAP values back into a single contribution per feature.
    """
    owners: list[str] = []
    for name, transformer, columns in preprocessor.transformers_:
        if name == "remainder" or transformer == "drop" or len(columns) == 0:
            continue
        if name == "cat":
            encoder: OneHotEncoder = transformer.named_steps["onehot"]
            for col, cats in zip(columns, encoder.categories_):
                owners.extend([col] * len(cats))
        else:
            owners.extend(columns)
    return owners


def aggregation_matrix(owners: list[str], feature_ids: list[str]) -> np.ndarray:
    """Matrix M (n_outputs x n_features) so that shap_features = shap_outputs @ M."""
    index = {fid: i for i, fid in enumerate(feature_ids)}
    M = np.zeros((len(owners), len(feature_ids)))
    for row, owner in enumerate(owners):
        M[row, index[owner]] = 1.0
    return M


def _json_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if np.isnan(f) else round(f, 4)


def feature_stats(spec: FeatureSpec, series: pd.Series) -> dict[str, Any]:
    """Cohort statistics used for defaults, percentiles and the physiology breakdown."""
    if spec.kind == "categorical":
        counts = series.value_counts(normalize=True)
        return {
            "default": str(counts.index[0]),
            "distribution": {str(k): round(float(v), 4) for k, v in counts.items()},
        }
    values = series.astype(float).dropna()
    if spec.kind in ("binary", "ordinal"):
        counts = values.value_counts(normalize=True).sort_index()
        default = float(values.mode().iloc[0]) if spec.kind == "binary" else float(values.median())
        return {
            "default": default,
            "distribution": {str(int(k)): round(float(v), 4) for k, v in counts.items()},
            "mean": _json_float(values.mean()),
        }
    quantiles = np.quantile(values, np.linspace(0, 1, 21))
    return {
        "default": _json_float(values.median()),
        "mean": _json_float(values.mean()),
        "std": _json_float(values.std()),
        "min": _json_float(values.min()),
        "max": _json_float(values.max()),
        "quantiles": [_json_float(q) for q in quantiles],
    }


def build_schema(catalog: Catalog, X_reference: pd.DataFrame) -> dict[str, Any]:
    """JSON-serialisable description of every model input, grouped for the UI."""
    features = []
    for f in catalog.features:
        entry: dict[str, Any] = {
            "id": f.id,
            "label": f.label,
            "group": f.group,
            "kind": f.kind,
            "unit": f.unit,
            "range": list(f.range) if f.range else None,
            "step": f.step,
            "ref": list(f.ref) if f.ref else None,
            "options": f.options or None,
            "description": f.description,
            "source_column": f.column,
        }
        entry["stats"] = feature_stats(f, X_reference[f.id])
        features.append(entry)

    return {
        "groups": catalog.groups,
        "features": features,
        "targets": [
            {
                "id": t.id,
                "label": t.label,
                "short": t.short,
                "kind": t.kind,
                "structure": t.structure,
                "description": t.description,
                "territory": t.territory,
            }
            for t in catalog.targets
        ],
        "risk_bands": [{"id": b.id, "label": b.label, "max": b.max} for b in catalog.risk_bands],
        "excluded_columns": {
            "leakage": catalog.leakage_columns,
            "constant": ["Exertional CP"],
        },
    }


def percentile_table(stats: dict[str, Any]) -> tuple[np.ndarray, np.ndarray] | None:
    """(unique quantile values, their mid-rank percentiles) for fast interpolation."""
    q = stats.get("quantiles")
    if not q:
        return None
    grid = np.linspace(0, 100, len(q))
    q_arr = np.asarray(q, dtype=float)
    # np.interp needs increasing xp; collapse tied quantiles to their mid-rank.
    uniq, inverse = np.unique(q_arr, return_inverse=True)
    mids = np.array([grid[inverse == i].mean() for i in range(len(uniq))])
    return uniq, mids


def percentile(stats: dict[str, Any], value: float, table: tuple[np.ndarray, np.ndarray] | None = None) -> float | None:
    """Approximate cohort percentile (0-100) of a numeric value from stored quantiles."""
    table = table or percentile_table(stats)
    if table is None:
        return None
    uniq, mids = table
    if len(uniq) == 1:
        return 50.0
    return round(float(np.interp(value, uniq, mids)), 1)
