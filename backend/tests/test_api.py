import csv
import io
import logging
import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import CATEGORIES, MAX_UPLOAD_BYTES, app

ROOT = Path(__file__).resolve().parents[2]
SAMPLE = ROOT / "data" / "sample_transactions.csv"
CSV_HEADERS = {"Content-Type": "text/csv"}
# Never walked: real statements live in data/raw/.
SKIP_DIRS = {".venv", "__pycache__", ".git", ".pytest_cache"}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def post_csv(client, body: bytes, **params):
    return client.post("/api/classify", content=body, headers=CSV_HEADERS, params=params)


def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "model": "synthetic"}


def test_classify_sample(client):
    resp = post_csv(client, SAMPLE.read_bytes())
    assert resp.status_code == 200
    data = resp.json()
    rows, summary = data["rows"], data["summary"]

    assert len(rows) == 40
    assert {r["predicted"] for r in rows} <= set(CATEGORIES)
    assert all(r["source"] in ("rule", "model") for r in rows)
    assert all(r["confidence"] == 1.0 for r in rows if r["source"] == "rule")
    assert isinstance(rows[0]["amount"], float)

    assert summary["total_rows"] == 40
    assert [c["category"] for c in summary["by_category"]] == CATEGORIES
    assert sum(c["count"] for c in summary["by_category"]) == 40
    assert summary["total_amount"] == pytest.approx(sum(abs(r["amount"]) for r in rows))
    assert sum(c["share"] for c in summary["by_category"]) == pytest.approx(1.0, abs=1e-3)


def test_classify_description_only(client):
    resp = post_csv(client, b"description\nGRAB*FOOD 123\nSOMETHING UNKNOWN\n")
    assert resp.status_code == 200
    data = resp.json()
    assert all(r["date"] is None and r["amount"] is None for r in data["rows"])
    assert data["rows"][0]["predicted"] == "food"
    assert data["summary"]["total_amount"] == 0
    # No amounts, so share falls back to count.
    assert sum(c["share"] for c in data["summary"]["by_category"]) == pytest.approx(1.0)


def test_classify_accepts_octet_stream_and_cp1252(client):
    body = "description,amount\nCAFÉ JAKARTA,10000\n".encode("cp1252")
    resp = client.post("/api/classify", content=body, headers={"Content-Type": "application/octet-stream"})
    assert resp.status_code == 200
    assert resp.json()["rows"][0]["description"] == "CAFÉ JAKARTA"


def test_classify_threshold_flags_more_rows(client):
    low = post_csv(client, SAMPLE.read_bytes(), threshold=0.0).json()["summary"]["needs_review"]
    high = post_csv(client, SAMPLE.read_bytes(), threshold=1.0).json()["summary"]["needs_review"]
    assert low == 0
    assert high >= low
    assert post_csv(client, SAMPLE.read_bytes(), threshold=1.5).status_code == 422


def test_missing_description_is_400(client):
    resp = post_csv(client, b"date,amount\n2026-09-01,1000\n")
    assert resp.status_code == 400
    assert "description" in resp.json()["detail"]


def test_empty_body_is_400(client):
    assert post_csv(client, b"").status_code == 400


def test_body_over_5mb_is_413(client):
    assert post_csv(client, b"a" * (MAX_UPLOAD_BYTES + 1)).status_code == 413


def test_wrong_content_type_is_415(client):
    resp = client.post("/api/classify", files={"file": ("s.csv", SAMPLE.read_bytes(), "text/csv")})
    assert resp.status_code == 415


def test_report_reflects_corrections(client):
    rows = post_csv(client, SAMPLE.read_bytes()).json()["rows"]
    changed = next(r for r in rows if r["predicted"] != "transfer")
    old_category = changed["predicted"]
    changed["predicted"] = "transfer"

    resp = client.post("/api/report", json={"rows": rows})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert resp.headers["content-disposition"] == 'attachment; filename="spending-report.csv"'

    summary_block, table_block = resp.text.split("\n\n", 1)
    summary = {r["category"]: r for r in csv.DictReader(io.StringIO(summary_block))}
    before = {c["category"]: c["count"] for c in post_csv(client, SAMPLE.read_bytes()).json()["summary"]["by_category"]}
    assert int(summary["transfer"]["count"]) == before["transfer"] + 1
    assert int(summary[old_category]["count"]) == before[old_category] - 1

    table = list(csv.DictReader(io.StringIO(table_block)))
    assert len(table) == 40
    assert table[changed["id"]]["predicted"] == "transfer"


# ---- privacy rules 1 and 2 -------------------------------------------------


def project_files() -> set[str]:
    found = set()
    for dirpath, dirnames, filenames in os.walk(ROOT):
        rel = Path(dirpath).relative_to(ROOT)
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and (rel / d).as_posix() != "data/raw"]
        found.update((rel / f).as_posix() for f in filenames)
    return found


def temp_entries() -> set[str]:
    # Spooled uploads land at the top of the temp dir, so that level is enough.
    return set(os.listdir(tempfile.gettempdir()))


def test_upload_writes_no_files(client):
    # Over 1 MB, the size at which Starlette would spool a multipart upload to disk.
    sample = SAMPLE.read_bytes()
    header, body = sample.split(b"\n", 1)
    big = header + b"\n" + body * 600
    assert 1024 * 1024 < len(big) < MAX_UPLOAD_BYTES

    before_project, before_temp = project_files(), temp_entries()
    resp = post_csv(client, big)
    assert resp.status_code == 200
    assert project_files() - before_project == set()
    assert temp_entries() - before_temp == set()


def test_logs_hold_no_descriptions_or_amounts(client, caplog):
    caplog.set_level(logging.DEBUG)
    resp = post_csv(client, SAMPLE.read_bytes())
    assert resp.status_code == 200
    client.post("/api/report", json={"rows": resp.json()["rows"]})
    post_csv(client, b"date,amount\n2026-09-01,45000\n")  # an error path too

    text = "\n".join(f"{r.getMessage()} {r.args}" for r in caplog.records)
    assert "POST /api/classify 200" in text and "rows=40" in text  # the logger did run
    for secret in ["GRAB*FOOD", "KOPI KENANGAN", "BUDI SANTOSO", "45000", "1000000"]:
        assert secret not in text
