import logging

import pytest
from fastapi.testclient import TestClient

from app.main import CATEGORIES, app
from bca_fixture import EXPECTED, EXPECTED_CATEGORIES, NOT_ROWS, SUMMARY_TOTALS, TEST_PASSWORD, make_bca_pdf, make_plain_pdf
from classifier.importers import PdfPasswordRequired, UnsupportedPdf, parse_bca_pdf, statement_frame
from classifier.importers.bca_pdf import _iso_date
from test_api import project_files

PDF_HEADERS = {"Content-Type": "application/pdf"}


@pytest.fixture(scope="module")
def pdf() -> bytes:
    return make_bca_pdf()


@pytest.fixture(scope="module")
def statement(pdf):
    return parse_bca_pdf(pdf)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# ---- importer --------------------------------------------------------------


def test_rows_match_fixture(statement):
    got = [(r.date, r.description, r.amount, r.direction, r.balance) for r in statement.rows]
    assert got == EXPECTED


def test_period(statement):
    assert statement.period == "2026-09"


def test_directions(statement):
    assert [r.direction for r in statement.rows].count("CR") == 2
    assert [r.direction for r in statement.rows].count("DB") == 9


def test_saldo_awal_header_footer_and_summary_are_not_rows(statement):
    for r in statement.rows:
        assert not r.description.upper().startswith("SALDO")
        for text in NOT_ROWS:
            assert text.upper() not in r.description.upper()


def test_continuations_join_across_lines_and_pages(statement):
    assert statement.rows[0].description.endswith("QR 936000000000000001 KFC SUDIRMAN")
    assert statement.rows[3].description == "KR OTOMATIS LLG-ANTAR BANK DARI CONTOH"


def test_summary_totals_match_rows(statement):
    assert statement.summary_totals == SUMMARY_TOTALS
    db = [r.amount for r in statement.rows if r.direction == "DB"]
    cr = [r.amount for r in statement.rows if r.direction == "CR"]
    assert sum(db) == pytest.approx(SUMMARY_TOTALS["mutasi_db_total"])
    assert sum(cr) == pytest.approx(SUMMARY_TOTALS["mutasi_cr_total"])
    assert (len(db), len(cr)) == (SUMMARY_TOTALS["mutasi_db_count"], SUMMARY_TOTALS["mutasi_cr_count"])


def test_statement_frame(statement):
    df = statement_frame(statement)
    assert list(df.columns) == ["date", "description", "amount", "direction"]
    assert len(df) == len(EXPECTED)


@pytest.mark.parametrize(
    "day, month, period, expected",
    [
        ("02", "09", (2026, 9), "2026-09-02"),
        ("31", "12", (2027, 1), "2026-12-31"),  # a December row on a January statement
        ("31", "02", (2026, 2), None),  # not a real date
        ("02", "09", None, None),  # no PERIODE found
    ],
)
def test_iso_date(day, month, period, expected):
    assert _iso_date(day, month, period) == expected


def test_password_pdf_raises():
    with pytest.raises(PdfPasswordRequired):
        parse_bca_pdf(make_bca_pdf(password=TEST_PASSWORD))


@pytest.mark.parametrize("data", [make_plain_pdf("hello"), b"%PDF-1.4 not really a pdf", b"plain text"])
def test_non_bca_pdf_raises(data):
    with pytest.raises(UnsupportedPdf):
        parse_bca_pdf(data)


def test_errors_do_not_quote_rows():
    with pytest.raises(UnsupportedPdf) as exc:
        parse_bca_pdf(make_plain_pdf("KFC SUDIRMAN 45,000.00"))
    assert "KFC" not in str(exc.value) and "45" not in str(exc.value)


# ---- API -------------------------------------------------------------------


def test_pdf_upload(client, pdf):
    resp = client.post("/api/classify", content=pdf, headers=PDF_HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    rows, summary = data["rows"], data["summary"]
    assert len(rows) == len(EXPECTED)
    assert [r["date"] for r in rows] == [e[0] for e in EXPECTED]
    assert [r["direction"] for r in rows] == [e[3] for e in EXPECTED]
    assert all(r["amount"] > 0 for r in rows)

    # QR to KFC, e-banking out, salary in, KR OTOMATIS in, Shopee, BIAYA ADM, Indomaret, an apotek,
    # Netflix, a DANA top-up and TARIK TUNAI: every row is decided by a rule.
    assert [r["predicted"] for r in rows] == EXPECTED_CATEGORIES
    assert all(r["source"] == "rule" for r in rows)


def test_pdf_money_in_is_not_spend(client, pdf):
    summary = client.post("/api/classify", content=pdf, headers=PDF_HEADERS).json()["summary"]
    assert summary["total_rows"] == 11
    assert summary["money_in_count"] == 2
    assert summary["money_in_total"] == pytest.approx(SUMMARY_TOTALS["mutasi_cr_total"])
    assert summary["total_amount"] == pytest.approx(SUMMARY_TOTALS["mutasi_db_total"])
    assert sum(c["count"] for c in summary["by_category"]) == 9
    assert sum(c["total_amount"] for c in summary["by_category"]) == pytest.approx(SUMMARY_TOTALS["mutasi_db_total"])
    assert [c["category"] for c in summary["by_category"]] == CATEGORIES


def test_pdf_detected_by_magic_bytes(client, pdf):
    resp = client.post("/api/classify", content=pdf, headers={"Content-Type": "application/octet-stream"})
    assert resp.status_code == 200
    assert len(resp.json()["rows"]) == len(EXPECTED)


def test_password_pdf_is_400(client):
    resp = client.post("/api/classify", content=make_bca_pdf(password=TEST_PASSWORD), headers=PDF_HEADERS)
    assert resp.status_code == 400
    assert resp.json()["detail"] == (
        "This PDF is password-protected. Save a copy without the password and upload that."
    )


@pytest.mark.parametrize("body", [make_plain_pdf("hello"), b"not a pdf at all"])
def test_non_bca_pdf_is_400(client, body):
    resp = client.post("/api/classify", content=body, headers=PDF_HEADERS)
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Only BCA e-statement PDFs are supported right now."


def test_pdf_report_has_money_in(client, pdf):
    rows = client.post("/api/classify", content=pdf, headers=PDF_HEADERS).json()["rows"]
    resp = client.post("/api/report", json={"rows": rows})
    assert resp.status_code == 200
    summary_block, table_block = resp.text.split("\n\n", 1)
    assert "money in,2,8500000.0," in summary_block
    assert table_block.splitlines()[0].split(",")[4] == "direction"
    for fmt in ("xlsx", "pdf"):
        assert client.post("/api/report", json={"rows": rows}, params={"format": fmt}).status_code == 200


# ---- privacy ---------------------------------------------------------------


def test_pdf_upload_writes_no_files(client, pdf, isolated_tmp):
    before = project_files()
    assert client.post("/api/classify", content=pdf, headers=PDF_HEADERS).status_code == 200
    assert client.post("/api/classify", content=make_bca_pdf(password=TEST_PASSWORD), headers=PDF_HEADERS).status_code == 400
    assert project_files() - before == set()
    assert list(isolated_tmp.iterdir()) == []


def test_pdf_logs_hold_no_descriptions_or_amounts(client, pdf, caplog):
    caplog.set_level(logging.DEBUG)
    assert client.post("/api/classify", content=pdf, headers=PDF_HEADERS).status_code == 200
    client.post("/api/classify", content=make_plain_pdf("KFC 45,000.00"), headers=PDF_HEADERS)

    text = "\n".join(r.getMessage() for r in caplog.records)
    assert "POST /api/classify 200" in text and "rows=11" in text
    for secret in ["KFC", "SUDIRMAN", "NAMA CONTOH", "BUDI", "45,000", "45000", "7500000", "1457000", "SHOPEE", "INDOMARET", "APOTEK"]:
        assert secret not in text
