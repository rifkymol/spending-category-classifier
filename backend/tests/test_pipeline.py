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
