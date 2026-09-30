import numpy as np

from cardiolens.config import load_catalog
from cardiolens.data import build_frames, stratification_key


def test_frames_shape_and_targets():
    catalog = load_catalog()
    X, Y = build_frames(catalog=catalog)
    assert X.shape == (303, len(catalog.features))
    assert list(Y.columns) == [t.id for t in catalog.targets]
    for col in Y.columns:
        assert set(np.unique(Y[col])) == {0, 1}
    numeric = [f.id for f in catalog.features if f.kind != "categorical"]
    assert np.isfinite(X[numeric].to_numpy(dtype=float)).all()


def test_known_prevalences():
    _, Y = build_frames()
    assert int(Y["cad"].sum()) == 216
    assert int(Y["lad"].sum()) == 177
    assert int(Y["lcx"].sum()) == 119
    assert int(Y["rca"].sum()) == 114


def test_stratification_key_has_no_singletons():
    _, Y = build_frames()
    key = stratification_key(Y)
    _, counts = np.unique(key, return_counts=True)
    assert counts.min() >= 2
