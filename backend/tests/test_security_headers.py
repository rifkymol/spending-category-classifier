"""Security headers on every API response, and no-store on the data endpoints (PRIVACY.md)."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import MAX_UPLOAD_BYTES, app

ROOT = Path(__file__).resolve().parents[2]
SAMPLE = ROOT / "data" / "sample_transactions.csv"
CSV_HEADERS = {"Content-Type": "text/csv"}
FRONTEND = "http://127.0.0.1:3000"
SECURITY = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "cross-origin-resource-policy": "same-site",
}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def rows(client):
    resp = client.post("/api/classify", content=SAMPLE.read_bytes(), headers=CSV_HEADERS)
    assert resp.status_code == 200
    return resp.json()["rows"]


def assert_security(resp):
    for name, value in SECURITY.items():
        assert resp.headers.get(name) == value, name
    # One copy each, never duplicated by the middleware.
    for name in SECURITY:
        assert len(resp.headers.get_list(name)) == 1, name


def assert_no_store(resp):
    assert resp.headers.get("cache-control") == "no-store"
    assert resp.headers.get("pragma") == "no-cache"


def test_health_and_categories_have_headers_and_may_be_cached(client):
    for path in ("/api/health", "/api/categories"):
        resp = client.get(path)
        assert resp.status_code == 200
        assert_security(resp)
        assert "cache-control" not in resp.headers


def test_classify_is_no_store(client):
    resp = client.post("/api/classify", content=SAMPLE.read_bytes(), headers=CSV_HEADERS)
    assert resp.status_code == 200
    assert_security(resp)
    assert_no_store(resp)


def test_insights_is_no_store(client, rows):
    resp = client.post("/api/insights", json={"rows": rows})
    assert resp.status_code == 200
    assert_security(resp)
    assert_no_store(resp)


@pytest.mark.parametrize("fmt", ["csv", "xlsx", "pdf"])
def test_report_is_no_store_and_still_a_download(client, rows, fmt):
    resp = client.post("/api/report", json={"rows": rows}, params={"format": fmt})
    assert resp.status_code == 200
    assert_security(resp)
    assert_no_store(resp)
    assert resp.headers["content-disposition"] == f'attachment; filename="spending-report.{fmt}"'
    assert resp.content


def test_422_has_headers_and_no_store(client):
    resp = client.post("/api/classify", content=SAMPLE.read_bytes(), headers=CSV_HEADERS, params={"threshold": 1.5})
    assert resp.status_code == 422
    assert_security(resp)
    assert_no_store(resp)
    resp = client.post("/api/insights", content=b"{not json", headers={"Content-Type": "application/json"})
    assert resp.status_code == 422
    assert_security(resp)
    assert_no_store(resp)


def test_413_has_headers_and_no_store(client):
    resp = client.post("/api/classify", content=b"a" * (MAX_UPLOAD_BYTES + 1), headers=CSV_HEADERS)
    assert resp.status_code == 413
    assert_security(resp)
    assert_no_store(resp)


def test_404_and_405_have_headers(client):
    assert_security(client.get("/nope"))
    assert_security(client.get("/api/classify"))


def test_cors_still_allows_the_frontend(client):
    resp = client.post("/api/classify", content=SAMPLE.read_bytes(), headers={**CSV_HEADERS, "Origin": FRONTEND})
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == FRONTEND
    assert_security(resp)
    resp = client.post("/api/report", json={"rows": []}, headers={"Origin": "http://localhost:3000"})
    assert resp.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "content-disposition" in resp.headers["access-control-expose-headers"].lower()


def test_cors_preflight_has_headers(client):
    resp = client.options(
        "/api/classify",
        headers={
            "Origin": FRONTEND,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == FRONTEND
    assert_security(resp)
    assert_no_store(resp)


def test_cors_rejects_other_origins(client):
    resp = client.options(
        "/api/classify",
        headers={"Origin": "http://evil.test", "Access-Control-Request-Method": "POST"},
    )
    assert resp.status_code == 400
    assert "access-control-allow-origin" not in resp.headers
    assert_security(resp)
