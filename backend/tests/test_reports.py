import csv
import io
import json
import logging
import re

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook

from app.main import CATEGORIES, MAX_REPORT_BYTES, app
from app.reports import CATEGORY_COLORS, OTHER_COLOR, format_idr, period, safe_text
from app.schemas import MAX_REPORT_ROWS, Row
from test_api import ROOT, SAMPLE, post_csv, project_files

INJECTION = '=HYPERLINK("http://x")'
XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def rows(client):
    rows = post_csv(client, SAMPLE.read_bytes()).json()["rows"]
    rows[0]["description"] = INJECTION
    rows[1]["amount"] = -45000.0
    return rows


def get_report(client, rows, fmt=None):
    params = {"format": fmt} if fmt else {}
    return client.post("/api/report", json={"rows": rows}, params=params)


def expected_totals(rows) -> dict[str, float]:
    totals = {c: 0.0 for c in CATEGORIES}
    for r in rows:
        totals[r["predicted"]] += abs(r["amount"] or 0)
    return totals


# ---- helpers ---------------------------------------------------------------


@pytest.mark.parametrize("value", ["=1+1", "+62", "-5", "@SUM(A1)", "\tx", "\rx"])
def test_safe_text_prefixes_formula_starts(value):
    assert safe_text(value) == "'" + value


def test_safe_text_leaves_plain_text():
    assert safe_text("GRAB*FOOD") == "GRAB*FOOD"
    assert safe_text("") == ""


def test_format_idr():
    assert format_idr(6731990) == "Rp 6.731.990"
    assert format_idr(-45000) == "-Rp 45.000"
    assert format_idr(0) == "Rp 0"


def _row(date):
    return Row(id=0, date=date, description="x", amount=1.0, predicted="food", confidence=1.0,
               needs_review=False, source="rule")


def test_period():
    assert period([_row("2026-09-01"), _row("2026-09-21"), _row("2026-09-05")]) == "2026-09-01 to 2026-09-21"
    assert period([_row("02/09/2026"), _row("18/09/2026")]) == "2026-09-02 to 2026-09-18"
    assert period([_row(None), _row("not a date")]) is None


def test_pdf_colors_match_frontend():
    source = (ROOT / "frontend" / "src" / "lib" / "format.ts").read_text(encoding="utf-8")
    block = source.split("CATEGORY_COLORS", 1)[1].split("};", 1)[0]
    frontend = dict(re.findall(r'(\w+):\s*"(#[0-9a-fA-F]{6})"', block))
    assert frontend == CATEGORY_COLORS
    assert re.search(r'OTHER_COLOR\s*=\s*"(#[0-9a-fA-F]{6})"', source).group(1) == OTHER_COLOR


# ---- formats ---------------------------------------------------------------


def test_csv_is_default_and_neutralizes_injection(client, rows):
    resp = get_report(client, rows)
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert resp.headers["content-disposition"] == 'attachment; filename="spending-report.csv"'

    table = list(csv.DictReader(io.StringIO(resp.text.split("\n\n", 1)[1])))
    assert table[0]["description"] == "'" + INJECTION
    assert table[1]["amount"] == "-45000.0"  # numbers are never prefixed
    assert get_report(client, rows, "csv").text == resp.text


def test_xlsx_report(client, rows):
    resp = get_report(client, rows, "xlsx")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == XLSX_TYPE
    assert resp.headers["content-disposition"] == 'attachment; filename="spending-report.xlsx"'

    wb = load_workbook(io.BytesIO(resp.content))
    assert wb.sheetnames == ["Summary", "Transactions"]

    summary = wb["Summary"]
    assert summary._charts, "the Summary sheet has a pie chart"
    table = {}
    for r in summary.iter_rows(values_only=True):
        if r[0] in CATEGORIES:
            table[r[0]] = r
    want = expected_totals(rows)
    assert set(table) == set(CATEGORIES)
    for cat, (_, count, total, share) in table.items():
        assert count == sum(r["predicted"] == cat for r in rows)
        assert total == pytest.approx(want[cat])
    assert sum(r[3] for r in table.values()) == pytest.approx(1.0, abs=1e-3)

    tx = wb["Transactions"]
    assert tx.freeze_panes == "A2"
    assert tx.auto_filter.ref
    header = [c.value for c in tx[1]]
    desc_col = header.index("description") + 1
    amount_col = header.index("amount") + 1
    injected = tx.cell(row=2, column=desc_col)
    assert injected.data_type != "f"
    assert injected.value == "'" + INJECTION
    negative = tx.cell(row=3, column=amount_col)
    assert negative.value == -45000 and negative.data_type == "n"
    assert tx.max_row == len(rows) + 1
    assert not any(c.data_type == "f" for row in tx.iter_rows() for c in row)


def test_pdf_report(client, rows):
    resp = get_report(client, rows, "pdf")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.headers["content-disposition"] == 'attachment; filename="spending-report.pdf"'
    assert resp.content.startswith(b"%PDF")
    assert len(resp.content) > 1024
    # Built-in Helvetica only; reportlab drawings default to Times-Roman unless told otherwise.
    fonts = set(re.findall(rb"/BaseFont\s*/([\w-]+)", resp.content))
    assert fonts and all(f.startswith(b"Helvetica") for f in fonts), fonts
    assert b"/Times-Roman" not in resp.content


def test_reports_handle_odd_text_and_missing_values(client, rows):
    odd = [dict(r) for r in rows[:3]]
    odd[0]["description"] = "<b>CAFÉ & co</b> \x01 ☕"
    odd[1]["date"] = None
    odd[1]["amount"] = None
    for fmt in ("csv", "xlsx", "pdf"):
        assert get_report(client, odd, fmt).status_code == 200, fmt


def test_reports_handle_description_only_rows(client):
    rows = post_csv(client, b"description\nGRAB*FOOD 123\nSOMETHING UNKNOWN\n").json()["rows"]
    for fmt in ("csv", "xlsx", "pdf"):
        assert get_report(client, rows, fmt).status_code == 200, fmt


# ---- validation ------------------------------------------------------------


def test_unknown_format_is_422(client, rows):
    assert get_report(client, rows, "docx").status_code == 422


def test_bad_category_is_422_without_echoing_row_data(client, rows):
    bad = [dict(r) for r in rows[:2]]
    bad[0]["predicted"] = "groceries-SECRET-CAT"
    bad[0]["description"] = "PRIVATE MERCHANT XYZ"
    resp = get_report(client, bad, "xlsx")
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert detail[0]["loc"] == ["body", "rows", 0, "predicted"]
    assert all(set(e) == {"loc", "msg", "type"} for e in detail)
    for secret in ["PRIVATE MERCHANT", "groceries-SECRET-CAT", "input"]:
        assert secret not in resp.text


def test_malformed_json_is_422_without_echo(client):
    resp = client.post("/api/report", content=b'{"rows": [{"description": "PRIVATE MERCHANT"', headers={"Content-Type": "application/json"})
    assert resp.status_code == 422
    assert "PRIVATE MERCHANT" not in resp.text


def test_too_many_rows_is_rejected(client):
    row = {"id": 0, "date": None, "description": "x", "amount": None, "predicted": "food",
           "confidence": 1.0, "needs_review": False, "source": "rule"}
    body = json.dumps({"rows": [row] * (MAX_REPORT_ROWS + 1)}).encode()
    assert len(body) < MAX_REPORT_BYTES  # so the row cap, not the size cap, is what rejects it
    resp = client.post("/api/report", content=body, headers={"Content-Type": "application/json"})
    assert resp.status_code in (413, 422)
    assert "50000" in resp.text


def test_body_over_10mb_is_413(client):
    body = b'{"rows": [' + b" " * MAX_REPORT_BYTES + b"]}"
    resp = client.post("/api/report", content=body, headers={"Content-Type": "application/json"})
    assert resp.status_code == 413


# ---- privacy ---------------------------------------------------------------


def test_reports_write_no_files(client, rows, isolated_tmp):
    before_project = project_files()
    for fmt in ("csv", "xlsx", "pdf"):
        assert get_report(client, rows, fmt).status_code == 200
    assert project_files() - before_project == set()
    assert list(isolated_tmp.iterdir()) == []


def test_report_logs_hold_no_descriptions_or_amounts(client, rows, caplog):
    caplog.set_level(logging.DEBUG)
    for fmt in ("csv", "xlsx", "pdf"):
        get_report(client, rows, fmt)
    bad = [dict(rows[2], predicted="nope")]
    get_report(client, bad, "pdf")

    # Formatted messages only: raw args hold the duration float, whose digits can look like amounts.
    text = "\n".join(r.getMessage() for r in caplog.records)
    assert "POST /api/report 200" in text and "rows=40" in text  # the logger did run
    assert "POST /api/report 422" in text
    secrets = ["HYPERLINK", "45000", rows[2]["description"], rows[3]["description"]]
    secrets += [str(int(r["amount"])) for r in rows[2:6] if r["amount"]]
    for secret in secrets:
        assert secret not in text
