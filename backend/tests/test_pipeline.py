from pathlib import Path

import pandas as pd
import pytest

import classify as cli
from classifier import OUTPUT_COLUMNS, apply_rules, build_model, classify, clean_description, load_transactions

SAMPLE = Path(__file__).resolve().parents[2] / "data" / "sample_transactions.csv"


@pytest.fixture(scope="module")
def model():
    df = load_transactions(SAMPLE)
    return build_model().fit(df["description"].map(clean_description), df["category"])


def test_clean_description():
    assert clean_description("GRAB*FOOD 2309011234") == "grab food"


@pytest.mark.parametrize(
    "text, expected",
    [
        ("grab food", "food"),
        ("qris kopi kenangan jkt", "food"),
        ("shopee pay", "shopping"),
        ("pln prepaid", "bills"),
        ("shell kuningan", "transport"),
    ],
)
def test_apply_rules_known_merchants(text, expected):
    assert apply_rules(text) == expected


def test_apply_rules_word_boundary():
    assert apply_rules("shellfish market") is None


def test_apply_rules_unknown():
    assert apply_rules("some unknown merchant") is None


def test_classify_without_category(model):
    df = pd.DataFrame({"description": ["GRAB*FOOD 2309011234", "TRSF E-BANKING DB 0910 BUDI", "SHELLFISH MARKET"]})
    out = classify(df, model, 0.6)
    for col in OUTPUT_COLUMNS:
        assert col in out.columns
    assert "category" not in out.columns
    assert "cleaned" not in df.columns  # input is not mutated
    rule_rows = out["rule_category"].notna()
    assert rule_rows.any()
    assert not out.loc[rule_rows, "needs_review"].any()
    assert (out.loc[rule_rows, "predicted"] == out.loc[rule_rows, "rule_category"]).all()


def test_load_transactions_missing_description(tmp_path):
    path = tmp_path / "bad.csv"
    path.write_text("date,amount\n2026-09-01,1000\n")
    with pytest.raises(ValueError, match="date, amount"):
        load_transactions(path)


def test_end_to_end_train_predict(tmp_path):
    model_path = tmp_path / "model.joblib"
    unlabeled = tmp_path / "unlabeled.csv"
    out_path = tmp_path / "predictions.csv"
    pd.read_csv(SAMPLE).drop(columns=["category"]).to_csv(unlabeled, index=False)

    assert cli.main(["train", str(SAMPLE), "--model", str(model_path)]) == 0
    assert model_path.exists()
    assert cli.main(["predict", str(unlabeled), "--model", str(model_path), "--out", str(out_path)]) == 0

    result = pd.read_csv(out_path)
    assert len(result) == len(pd.read_csv(SAMPLE))
    for col in OUTPUT_COLUMNS:
        assert col in result.columns
    assert result["predicted"].notna().all()


# ---- BCA vocabulary and rule order ----------------------------------------


@pytest.mark.parametrize(
    "text, expected",
    [
        ("TRSF E-BANKING DB 0309/FTSCY/WS95051 BUDI", "transfer e banking budi"),
        ("TRANSAKSI DEBIT TGL: 01/09 QR 936000000000000001 KFC SUDIRMAN", "qr kfc sudirman"),
        ("KR OTOMATIS LLG-ANTAR BANK", "kredit otomatis kliring antar bank"),
        ("BI-FAST CR 1234", "bifast transfer"),
        ("BIAYA ADM", "biaya administrasi"),
        ("BYR PLN", "bayar pln"),
    ],
)
def test_clean_description_bca(text, expected):
    assert clean_description(text) == expected


def test_bca_words_inside_other_words_are_kept():
    assert clean_description("DBS CREDIT ADMIRAL") == "dbs credit admiral"


@pytest.mark.parametrize(
    "text, expected",
    [
        ("TRSF E-BANKING DB 0309 BUDI", "transfer"),
        ("BI-FAST DB TRANSFER ANI", "transfer"),
        ("TARIK TUNAI ATM 01", "transfer"),
        ("SETOR TUNAI", "transfer"),
        ("KR OTOMATIS GAJI", "transfer"),
        ("SWITCHING DB BANK LAIN", "transfer"),
        ("BIAYA ADM", "bills"),
        ("BIAYA ADMINISTRASI", "bills"),
        # Merchant rules come before the transfer group.
        ("TRANSAKSI DEBIT TGL: 01/09 QR 936000000000000001 KFC SUDIRMAN", "food"),
        ("TRSF E-BANKING DB 0309 KFC SUDIRMAN", "food"),
        ("BI-FAST TRANSFER TOKOPEDIA", "shopping"),
        ("TRSF E-BANKING DB PLN PRABAYAR", "bills"),
    ],
)
def test_rule_order_merchant_beats_transfer(text, expected):
    assert apply_rules(clean_description(text)) == expected


def test_transfer_rules_are_checked_last():
    from classifier import RULES

    assert list(RULES)[-1] == "transfer"


def test_cli_predict_pdf(tmp_path):
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from bca_fixture import EXPECTED, make_bca_pdf

    model_path, pdf_path, out_path = tmp_path / "m.joblib", tmp_path / "s.pdf", tmp_path / "p.csv"
    pdf_path.write_bytes(make_bca_pdf())
    assert cli.main(["train", str(SAMPLE), "--model", str(model_path)]) == 0
    assert cli.main(["predict", str(pdf_path), "--model", str(model_path), "--out", str(out_path)]) == 0
    result = pd.read_csv(out_path)
    assert len(result) == len(EXPECTED)
    assert list(result["direction"]) == [e[3] for e in EXPECTED]
