"""Angiography results (Cath, LAD, LCX, RCA) must never be model inputs."""

import joblib

from cardiolens.config import MODELS_DIR, load_catalog
from cardiolens.data import build_frames

from .conftest import needs_artifacts

LEAKAGE = {"Cath", "LAD", "LCX", "RCA"}


def test_catalog_excludes_target_columns():
    catalog = load_catalog()
    assert set(catalog.leakage_columns) == LEAKAGE
    assert not {f.column for f in catalog.features} & LEAKAGE


def test_feature_frame_excludes_targets():
    catalog = load_catalog()
    X, _ = build_frames(catalog=catalog)
    assert not set(X.columns) & {t.id for t in catalog.targets}
    assert not set(X.columns) & {c.lower() for c in LEAKAGE}


@needs_artifacts
def test_saved_models_never_saw_targets():
    catalog = load_catalog()
    target_ids = {t.id for t in catalog.targets}
    for t in catalog.targets:
        bundle = joblib.load(MODELS_DIR / f"{t.id}.joblib")
        seen = set(bundle["pipeline"].named_steps["prep"].feature_names_in_)
        assert not seen & target_ids
        assert not seen & LEAKAGE
        assert not seen & {c.lower() for c in LEAKAGE}
        assert seen == set(catalog.feature_ids)
