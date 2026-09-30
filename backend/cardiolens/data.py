"""Dataset download, loading and encoding."""

from __future__ import annotations

import io
import urllib.request
import zipfile

import numpy as np
import pandas as pd

from .config import DATASET_URL, RAW_DATA_FILE, Catalog, FeatureSpec, load_catalog

_YES_NO = {"Y": 1, "N": 0}


def download_dataset(force: bool = False) -> None:
    """Fetch the UCI archive and extract the xlsx next to the code."""
    if RAW_DATA_FILE.exists() and not force:
        return
    RAW_DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(DATASET_URL, timeout=60) as resp:
        payload = resp.read()
    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        member = next(n for n in zf.namelist() if n.lower().endswith(".xlsx"))
        RAW_DATA_FILE.write_bytes(zf.read(member))


def load_raw() -> pd.DataFrame:
    download_dataset()
    df = pd.read_excel(RAW_DATA_FILE)
    df.columns = [str(c).strip() for c in df.columns]
    for col in df.select_dtypes(include=["object", "string"]).columns:
        df[col] = df[col].astype(str).str.strip()
    return df


def encode_feature(spec: FeatureSpec, raw: pd.Series) -> pd.Series:
    """Convert a raw dataset column into the model's encoding for that feature."""
    if spec.kind == "categorical":
        return raw.astype(str)
    if spec.map:
        mapped = raw.map(spec.map)
    elif spec.kind == "binary" and not pd.api.types.is_numeric_dtype(raw):
        mapped = raw.map(_YES_NO)
    else:
        mapped = raw
    mapped = pd.to_numeric(mapped, errors="coerce").astype(float)
    if mapped.isna().any():
        bad = raw[mapped.isna()].unique()[:5]
        raise ValueError(f"Unmapped values in column {spec.column!r}: {list(bad)}")
    return mapped


def build_frames(
    raw: pd.DataFrame | None = None, catalog: Catalog | None = None
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (X, Y): encoded features and binary targets, indexed by patient id."""
    catalog = catalog or load_catalog()
    raw = load_raw() if raw is None else raw
    raw = raw.reset_index(drop=True)
    index = pd.RangeIndex(1, len(raw) + 1, name="patient_id")

    X = pd.DataFrame(
        {f.id: encode_feature(f, raw[f.column]).to_numpy() for f in catalog.features},
        index=index,
    )
    # Mixed dtypes: categoricals stay as strings, everything else is float.
    for f in catalog.features:
        if f.kind == "categorical":
            X[f.id] = X[f.id].astype(object)

    Y = pd.DataFrame(
        {t.id: (raw[t.column].astype(str) == t.positive).astype(int).to_numpy() for t in catalog.targets},
        index=index,
    )
    for t in catalog.targets:
        if Y[t.id].nunique() != 2:
            raise ValueError(f"Target {t.id} does not have two classes; check `positive`.")
    return X, Y


def stratification_key(Y: pd.DataFrame, min_count: int = 6) -> np.ndarray:
    """Joint label pattern (e.g. '1101') with rare patterns merged, for stratified splits."""
    key = Y.astype(str).agg("".join, axis=1)
    counts = key.value_counts()
    rare = counts[counts < min_count].index
    merged = key.where(~key.isin(rare), "rare")
    if (merged == "rare").sum() < 2:  # a singleton stratum cannot be split
        merged = merged.replace("rare", counts.index[0])
    return merged.to_numpy()
