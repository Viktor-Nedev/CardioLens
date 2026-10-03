from fastapi.testclient import TestClient

from cardiolens.config import load_catalog

from .conftest import needs_artifacts

N_FEATURES = len(load_catalog().features)

pytestmark = needs_artifacts


def make_client() -> TestClient:
    from cardiolens.api.main import app

    return TestClient(app)


def test_health_schema_cases_metrics():
    with make_client() as c:
        assert c.get("/api/health").json()["status"] == "ok"
        schema = c.get("/api/schema").json()
        assert len(schema["features"]) == N_FEATURES
        assert {t["id"] for t in schema["targets"]} == {"cad", "lad", "lcx", "rca"}
        assert schema["disclaimer"]
        cases = c.get("/api/cases").json()
        assert len(cases) == 61
        assert c.get(f"/api/cases/{cases[0]['id']}").status_code == 200
        assert c.get("/api/cases/nope").status_code == 404
        metrics = c.get("/api/metrics").json()
        assert set(metrics["targets"]) == {"cad", "lad", "lcx", "rca"}


def test_predict_endpoint():
    with make_client() as c:
        case = c.get("/api/cases").json()[-1]
        res = c.post("/api/predict", json={"features": case["features"]})
        assert res.status_code == 200
        body = res.json()
        assert body["disclaimer"]
        # cases.json stores values rounded to 5 decimals
        assert abs(body["targets"]["cad"]["probability"] - case["predicted"]["cad"]) < 2e-4
        assert len(body["physiology"]) == N_FEATURES
        assert body["latency_ms"] < 2000


def test_predict_empty_body_uses_imputation():
    with make_client() as c:
        res = c.post("/api/predict", json={})
        assert res.status_code == 200
        assert len(res.json()["imputed"]) == N_FEATURES


def test_profile_and_similar_endpoints():
    with make_client() as c:
        case = c.get("/api/cases").json()[0]
        res = c.post("/api/profile", json={"features": case["features"], "feature": "ldl", "points": 21})
        assert res.status_code == 200
        body = res.json()
        assert len(body["grid"]) == 21 and len(body["targets"]["cad"]) == 21
        assert c.post("/api/profile", json={"features": {}, "feature": "nope"}).status_code == 404
        sim = c.post("/api/similar", json={"features": case["features"], "k": 4}).json()
        assert sim["k"] == 4 and len(sim["neighbours"]) == 4


def test_lime_endpoint():
    with make_client() as c:
        case = c.get("/api/cases").json()[0]
        body = c.post("/api/lime", json={"features": case["features"], "samples": 300}).json()
        assert set(body["targets"]) == {"cad", "lad", "lcx", "rca"}
        assert body["samples"] == 300
        assert len(body["targets"]["lcx"]["weights"]) == N_FEATURES
        assert c.post("/api/lime", json={"features": {}, "samples": 10}).status_code == 422
