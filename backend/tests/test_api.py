from fastapi.testclient import TestClient

from .conftest import needs_artifacts

pytestmark = needs_artifacts


def make_client() -> TestClient:
    from cardiolens.api.main import app

    return TestClient(app)


def test_health_schema_cases_metrics():
    with make_client() as c:
        assert c.get("/api/health").json()["status"] == "ok"
        schema = c.get("/api/schema").json()
        assert len(schema["features"]) == 55
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
        assert abs(body["targets"]["cad"]["probability"] - case["predicted"]["cad"]) < 1e-6
        assert len(body["physiology"]) == 55
        assert body["latency_ms"] < 2000


def test_predict_empty_body_uses_imputation():
    with make_client() as c:
        res = c.post("/api/predict", json={})
        assert res.status_code == 200
        assert len(res.json()["imputed"]) == 55
