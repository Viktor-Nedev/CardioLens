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
            assert total == pytest.approx(t["logit"], abs=1e-6)
            assert 1 / (1 + math.exp(-t["logit"])) == pytest.approx(t["probability"], abs=1e-9)


def test_serving_matches_training_time_predictions(predictor):
    for case in predictor.cases:
        out = predictor.predict(case["features"], with_interval=False)
        for tid, p in case["predicted"].items():
            # cases.json stores inputs and probabilities rounded to 5 decimals
            assert out["targets"][tid]["probability"] == pytest.approx(p, abs=2e-4)


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


def test_profile_matches_prediction_at_current_value(predictor):
    case = predictor.cases[0]
    prof = predictor.profile(case["features"], "age", points=41)
    assert len(prof["grid"]) == 41
    assert set(prof["targets"]) == {"cad", "lad", "lcx", "rca"}
    # Re-score with the age set to a grid value: the curve must agree with predict().
    i = 20
    out = predictor.predict({**case["features"], "age": prof["grid"][i]}, with_interval=False)
    for tid, curve in prof["targets"].items():
        assert curve[i] == pytest.approx(out["targets"][tid]["probability"], abs=1e-4)


def test_profile_for_binary_feature_has_two_points(predictor):
    prof = predictor.profile(predictor.default_patient(), "typical_chest_pain")
    assert prof["grid"] == [0.0, 1.0]
    assert prof["labels"] == ["No", "Yes"]


def test_similar_patients_finds_itself(predictor):
    me = predictor.cohort[0]
    res = predictor.similar(me["features"], k=5)
    assert res["k"] == 5
    assert res["neighbours"][0]["patient_id"] == me["patient_id"]
    assert res["neighbours"][0]["similarity"] == pytest.approx(1.0)
    sims = [n["similarity"] for n in res["neighbours"]]
    assert sims == sorted(sims, reverse=True)
    assert all(0 <= v <= 5 for v in res["summary"].values())


def test_similarity_pool_is_development_set_only(predictor):
    holdout_ids = {c["patient_id"] for c in predictor.cases}
    assert holdout_ids.isdisjoint({c["patient_id"] for c in predictor.cohort})


def test_lime_agrees_with_shap_and_is_seeded(predictor):
    case = predictor.cases[0]["features"]
    first = predictor.lime(case, samples=400)
    assert predictor.lime(case, samples=400)["targets"] == first["targets"]
    for t in first["targets"].values():
        assert len(t["weights"]) == len(predictor.feature_ids)
        assert 0.0 <= t["r2"] <= 1.0
        # A second, independent method tells the same story as SHAP.
        assert t["correlation"] > 0.8
        assert t["sign_agreement"] >= 0.8


def test_cohort_map_places_a_development_patient_on_its_own_point(predictor):
    m = predictor.cohort_map()
    assert m["pool"] == len(predictor.cohort) == len(m["points"])
    assert all(0 <= pt["x"] <= 1 and 0 <= pt["y"] <= 1 for pt in m["points"])
    me = predictor.cohort[3]
    own = next(pt for pt in m["points"] if pt["patient_id"] == me["patient_id"])
    assert predictor.similar(me["features"])["position"] == pytest.approx([own["x"], own["y"]], abs=1e-3)
