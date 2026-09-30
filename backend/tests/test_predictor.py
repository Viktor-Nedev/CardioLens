import math

import pytest

from .conftest import needs_artifacts

pytestmark = needs_artifacts


def test_default_patient_prediction(predictor):
    out = predictor.predict(predictor.default_patient())
    assert set(out["targets"]) == {"cad", "lad", "lcx", "rca"}
    for t in out["targets"].values():
        assert 0.0 <= t["probability"] <= 1.0
        lo, hi = t["interval"]
        assert 0.0 <= lo <= hi <= 1.0
        assert t["positive"] == (t["probability"] >= t["threshold"])
    assert out["imputed"] == []


def test_shap_contributions_are_additive(predictor):
    """Base value plus the sum of SHAP contributions reproduces the calibrated logit."""
    for case in predictor.cases[:10]:
        out = predictor.predict(case["features"], with_interval=False)
        for t in out["targets"].values():
            total = t["base_logit"] + sum(c["contribution"] for c in t["contributions"])
            assert total == pytest.approx(t["logit"], abs=1e-3)
            assert 1 / (1 + math.exp(-t["logit"])) == pytest.approx(t["probability"], abs=1e-9)


def test_serving_matches_training_time_predictions(predictor):
    for case in predictor.cases:
        out = predictor.predict(case["features"], with_interval=False)
        for tid, p in case["predicted"].items():
            assert out["targets"][tid]["probability"] == pytest.approx(p, abs=1e-6)


def test_partial_input_is_imputed(predictor):
    out = predictor.predict({"age": 70, "typical_chest_pain": 1})
    assert "age" not in out["imputed"]
    assert "ldl" in out["imputed"]
    assert len(out["imputed"]) == len(predictor.feature_ids) - 2
    for t in out["targets"].values():
        assert 0.0 <= t["probability"] <= 1.0


def test_invalid_values_warn_and_impute(predictor):
    out = predictor.predict({"age": "abc", "dm": 3, "bbb": "XYZ", "not_a_feature": 1})
    assert {"age", "dm", "bbb"} <= set(out["imputed"])
    assert any("not_a_feature" in w for w in out["warnings"])
    assert len(out["warnings"]) >= 4


def test_typical_angina_raises_cad_risk(predictor):
    base = predictor.default_patient()
    low = predictor.predict({**base, "typical_chest_pain": 0}, with_interval=False)["targets"]["cad"]["probability"]
    high = predictor.predict({**base, "typical_chest_pain": 1}, with_interval=False)["targets"]["cad"]["probability"]
    assert high >= low
