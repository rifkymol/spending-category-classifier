"""Phase 9: 50/30/20 Rupiah targets from income (detected or entered), and English/Indonesian text.

Synthetic rows only: every merchant and person below is made up.
"""

import json
import logging

import pytest
from fastapi.testclient import TestClient

from app.main import app
from classifier.i18n import STRINGS, category_name, normalize_lang, t
from classifier.insights import compute_insights
from test_api import SAMPLE, post_csv
from test_insights import statement, tx

OUT = 30_000 + 25_000 + 1_500_000 + 500_000 + 20_000 + 2_000_000 + 15_000  # statement() money out
NEEDS = 500_000 + 20_000 + 15_000
WANTS = 30_000 + 25_000 + 1_500_000


def no_income():
    """statement() as a CSV upload: no direction, so no money in."""
    rows = [r for r in statement() if r["direction"] != "CR"]
    for r in rows:
        r["direction"] = None
    return rows


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# ---- targets, actuals, differences ----------------------------------------


def test_targets_from_money_in():
    b = compute_insights(statement())["budget_503020"]
    assert b["income_monthly"] == 10_000_000 and b["income_source"] == "money_in"
    assert b["target_amounts"] == {"needs": 5_000_000, "wants": 3_000_000, "savings": 2_000_000}
    assert b["actual_amounts"] == {"needs": NEEDS, "wants": WANTS, "savings": 10_000_000 - OUT}
    assert b["difference"] == {"needs": 5_000_000 - NEEDS, "wants": 3_000_000 - WANTS,
                               "savings": 2_000_000 - (10_000_000 - OUT)}
    assert b["other_out_monthly"] == 2_000_000 and b["savings_transfers_monthly"] == 0


def test_savings_counts_transfers_as_money_out():
    """A transfer to people is spending: it lowers savings (only savings_transfer counts as savings)."""
    rows = statement()
    without_transfer = [r for r in rows if not r["description"].startswith("TRSF")]
    with_t = compute_insights(rows)["budget_503020"]["actual_amounts"]["savings"]
    without_t = compute_insights(without_transfer)["budget_503020"]["actual_amounts"]["savings"]
    assert without_t - with_t == 2_000_000


def test_targets_are_per_month():
    rows = [tx("GAJI", 6_000_000, "other_transfer", "CR", "2026-08-01"),
            tx("TOKO A", 1_000_000, "shopping", date="2026-08-15"),
            tx("PLN", 400_000, "bills", date="2026-09-30")]
    b = compute_insights(rows)["budget_503020"]
    factor = 30.4375 / 61
    assert b["income_monthly"] == pytest.approx(6_000_000 * factor, abs=0.01)
    assert b["target_amounts"]["wants"] == pytest.approx(0.3 * 6_000_000 * factor, abs=0.01)
    assert b["actual_amounts"]["wants"] == pytest.approx(1_000_000 * factor, abs=0.01)
    assert b["actual_amounts"]["savings"] == pytest.approx((6_000_000 - 1_400_000) * factor, abs=0.01)
    # statement-period amounts stay as they were
    assert b["wants"] == 1_000_000 and b["basis"] == "money_in" and b["basis_amount"] == 6_000_000


def test_override_replaces_detected_income():
    b = compute_insights(statement(), income_override=2_000_000)["budget_503020"]
    assert b["income_monthly"] == 2_000_000 and b["income_source"] == "override"
    assert b["basis"] == "income_override" and b["basis_amount"] == 2_000_000
    assert b["target_amounts"] == {"needs": 1_000_000, "wants": 600_000, "savings": 400_000}
    assert b["actual_amounts"]["savings"] == 2_000_000 - OUT
    assert b["shares"]["wants"] == pytest.approx(WANTS / 2_000_000, abs=1e-4)


@pytest.mark.parametrize("override", [None, 0, 0.0])
def test_zero_or_missing_override_uses_money_in(override):
    b = compute_insights(statement(), income_override=override)["budget_503020"]
    assert b["income_source"] == "money_in" and b["income_monthly"] == 10_000_000


def test_no_income_keeps_share_of_total_out():
    b = compute_insights(no_income())["budget_503020"]
    assert b["income_monthly"] is None and b["income_source"] is None
    assert b["target_amounts"] is None and b["difference"] is None
    assert b["actual_amounts"] == {"needs": NEEDS, "wants": WANTS, "savings": None}
    assert b["basis"] == "total_out" and b["basis_amount"] == OUT


def test_no_income_csv_with_override():
    ins = compute_insights(no_income(), income_override=8_000_000)
    b = ins["budget_503020"]
    assert b["income_source"] == "override"
    assert b["target_amounts"] == {"needs": 4_000_000, "wants": 2_400_000, "savings": 1_600_000}
    assert b["actual_amounts"]["savings"] == 8_000_000 - OUT
    assert b["difference"]["wants"] == 2_400_000 - WANTS
    assert ins["cash_flow"]["money_in"] == 0  # the override never changes cash flow


def over_wants():
    """One month with Rp 900.000 of shopping and Rp 100.000 of bills, for a Rp 1.000.000 income."""
    return [tx("TOKO A", 900_000, "shopping", date="2026-09-01"), tx("PLN", 100_000, "bills", date="2026-09-30")]


def test_over_and_under():
    d = compute_insights(statement(), income_override=2_000_000)["budget_503020"]["difference"]
    assert d["needs"] == 1_000_000 - NEEDS > 0  # under: Rp 465.000 left
    assert d["wants"] == 600_000 - WANTS < 0  # over by Rp 955.000
    assert d["savings"] == 400_000 - (2_000_000 - OUT) > 0  # short of target


def test_target_highlights():
    ins = compute_insights(over_wants(), income_override=1_000_000)
    d = ins["budget_503020"]["difference"]
    assert d == {"needs": 400_000, "wants": -600_000, "savings": 200_000}
    texts = [h["text"] for h in ins["highlights"]]
    assert "Wants were Rp 600.000 a month over the 30% target (Rp 300.000)." in texts
    assert "Savings were Rp 200.000 a month short of the 20% target (Rp 200.000)." in texts
    assert not any(x.startswith("Needs were") for x in texts)
    impacts = [h["impact_rp"] for h in ins["highlights"]]
    assert impacts == sorted(impacts, reverse=True)


def test_on_track_has_no_target_highlights():
    texts = [h["text"] for h in compute_insights(statement())["highlights"]]
    assert not any("target" in x for x in texts)


def test_rounding():
    b = compute_insights(statement(), income_override=3_333_333.33)["budget_503020"]
    assert b["target_amounts"] == {"needs": 1_666_666.67, "wants": 1_000_000.0, "savings": 666_666.67}
    for group in ("target_amounts", "actual_amounts", "difference"):
        for value in b[group].values():
            assert value == round(value, 2)


# ---- API: income_override --------------------------------------------------


def test_insights_endpoint_override(client):
    resp = client.post("/api/insights", json={"rows": no_income(), "income_override": 8_000_000})
    assert resp.status_code == 200
    assert resp.json() == compute_insights(no_income(), 8_000_000)
    assert resp.json()["budget_503020"]["target_amounts"]["needs"] == 4_000_000


def test_insights_endpoint_null_override(client):
    resp = client.post("/api/insights", json={"rows": statement(), "income_override": None})
    assert resp.status_code == 200 and resp.json()["budget_503020"]["income_source"] == "money_in"


@pytest.mark.parametrize("raw", ["-987654321", "NaN", "Infinity", "-Infinity", "9876543210000", "\"9876x\""])
@pytest.mark.parametrize("path", ["/api/insights", "/api/report"])
def test_bad_override_is_422_without_echo(client, path, raw):
    body = '{"rows": ' + json.dumps(statement()) + ', "income_override": ' + raw + "}"
    resp = client.post(path, content=body, headers={"Content-Type": "application/json"})
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert detail[0]["loc"] == ["body", "income_override"]
    assert all(set(e) == {"loc", "msg", "type"} for e in detail)
    for secret in ["987654321", "9876543210000", "9876x", "WARUNG", "input"]:
        assert secret not in resp.text


def test_classify_has_no_override(client):
    resp = post_csv(client, SAMPLE.read_bytes(), income_override=5_000_000)
    assert resp.status_code == 200
    assert resp.json()["insights"]["budget_503020"]["income_source"] is None  # ignored by /api/classify


def test_override_is_not_logged(client, caplog):
    caplog.set_level(logging.DEBUG)
    client.post("/api/insights", json={"rows": statement(), "income_override": 7_654_321})
    client.post("/api/report", json={"rows": statement(), "income_override": 7_654_321}, params={"format": "pdf"})
    text = "\n".join(r.getMessage() for r in caplog.records)
    assert "POST /api/insights 200" in text
    assert "7654321" not in text and "7.654.321" not in text


# ---- languages -------------------------------------------------------------


def test_dictionaries_have_the_same_keys():
    assert set(STRINGS["en"]) == set(STRINGS["id"])
    assert all(v.strip() for lang in STRINGS.values() for v in lang.values())


def test_placeholders_match_between_languages():
    import string
    fields = lambda text: {f for _, f, _, _ in string.Formatter().parse(text) if f}  # noqa: E731
    for key, en in STRINGS["en"].items():
        assert fields(en) == fields(STRINGS["id"][key]), key


def test_normalize_lang_and_categories():
    assert normalize_lang("id") == "id" and normalize_lang("en") == "en"
    assert normalize_lang(None) == normalize_lang("fr") == normalize_lang("ID") == "en"
    assert [category_name("id", c) for c in ["groceries", "eating_out", "savings_transfer", "cash"]] == [
        "Kebutuhan harian", "Makan di luar", "Ke tabungan atau dompet digital sendiri", "Tarik tunai"]
    assert category_name("en", "entertainment") == "Entertainment and subscriptions"
    assert category_name("fr", "housing") == "Rent and housing"
    assert category_name("id", "other") == "Other"


def test_highlights_in_indonesian():
    ins = compute_insights(over_wants(), income_override=1_000_000, lang="id")
    texts = [h["text"] for h in ins["highlights"]]
    assert ins["disclaimer"] == "Wawasan anggaran, bukan nasihat keuangan."
    assert "Keinginan Rp 600.000 per bulan di atas target 30% (Rp 300.000)." in texts
    assert "Tabungan Rp 200.000 per bulan di bawah target 20% (Rp 200.000)." in texts
    assert all("Rp " in x for x in texts)
    en = compute_insights(over_wants(), income_override=1_000_000)
    # Same numbers and order in both languages; only the words differ.
    assert [h["impact_rp"] for h in ins["highlights"]] == [h["impact_rp"] for h in en["highlights"]]
    assert ins["budget_503020"] == en["budget_503020"]


def test_highlights_biggest_category_is_translated():
    texts = [h["text"] for h in compute_insights(statement(), lang="id")["highlights"]]
    assert any(x.startswith("Belanja adalah kategori pengeluaran terbesar") for x in texts)


def test_insights_endpoint_lang(client):
    id_ = client.post("/api/insights", json={"rows": statement()}, params={"lang": "id"}).json()
    assert id_["disclaimer"] == t("id", "disclaimer")
    fr = client.post("/api/insights", json={"rows": statement()}, params={"lang": "fr"}).json()
    assert fr == compute_insights(statement())


def test_classify_lang(client):
    resp = post_csv(client, SAMPLE.read_bytes(), lang="id")
    assert resp.status_code == 200
    assert resp.json()["insights"]["disclaimer"] == "Wawasan anggaran, bukan nasihat keuangan."


@pytest.mark.parametrize("lang, message", [
    ("id", "File kosong."), ("en", "The file is empty."), ("xx", "The file is empty."), (None, "The file is empty."),
])
def test_errors_follow_lang(client, lang, message):
    params = {"lang": lang} if lang else {}
    resp = client.post("/api/classify", content=b"   ", headers={"Content-Type": "text/csv"}, params=params)
    assert resp.status_code == 400 and resp.json()["detail"] == message


def test_missing_column_error_in_indonesian(client):
    resp = post_csv(client, b"tanggal,nominal\n2026-09-01,1000\n", lang="id")
    assert resp.status_code == 400
    assert resp.json()["detail"].startswith("CSV harus memiliki kolom 'description'. Kolom yang ditemukan:")


def test_wrong_content_type_in_indonesian(client):
    resp = client.post("/api/classify", content=b"x", headers={"Content-Type": "image/png"}, params={"lang": "id"})
    assert resp.status_code == 415 and resp.json()["detail"].startswith("Kirim file")
