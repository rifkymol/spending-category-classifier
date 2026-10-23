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
        ("grab food", "eating_out"),
        ("qris kopi kenangan jkt", "eating_out"),
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
        ("TRSF E-BANKING DB 0309 BUDI", "other_transfer"),
        ("BI-FAST DB TRANSFER ANI", "other_transfer"),
        ("TARIK TUNAI ATM 01", "cash"),
        ("SETOR TUNAI", "other_transfer"),
        ("KR OTOMATIS GAJI", "other_transfer"),
        ("SWITCHING DB BANK LAIN", "other_transfer"),
        ("BIAYA ADM", "bills"),
        ("BIAYA ADMINISTRASI", "bills"),
        # Merchant rules come before the transfer group.
        ("TRANSAKSI DEBIT TGL: 01/09 QR 936000000000000001 KFC SUDIRMAN", "eating_out"),
        ("TRSF E-BANKING DB 0309 KFC SUDIRMAN", "eating_out"),
        ("TRSF E-BANKING DB 0309 TOPUP DANA", "savings_transfer"),
        ("TRSF E-BANKING DB 0209 PAK KOS CONTOH", "housing"),
        ("BI-FAST TRANSFER TOKOPEDIA", "shopping"),
        ("TRSF E-BANKING DB PLN PRABAYAR", "bills"),
    ],
)
def test_rule_order_merchant_beats_transfer(text, expected):
    assert apply_rules(clean_description(text)) == expected


def test_transfer_rules_are_checked_last():
    from classifier import RULES
    from classifier.categories import is_transfer

    order = list(RULES)
    assert order[-3:] == ["cash", "savings_transfer", "other_transfer"]
    assert not any(is_transfer(c) for c in order[:-3])
    assert "people_transfer" not in RULES  # learned from labels and the recipient memory only


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


# ---- Public merchant rules (Phase 7) --------------------------------------


@pytest.mark.parametrize(
    "text, expected",
    [
        # QR payments carry no transfer words, but e-banking ones do; the merchant must win.
        ("TRANSAKSI DEBIT TGL: 01/09 QR 936000000000000001 INDOMARET CIPUTAT", "groceries"),
        ("TRSF E-BANKING DB 0309 ALFAMART", "groceries"),
        ("TRANSAKSI DEBIT TGL: 02/09 QR 936000000000000002 MIE GACOAN", "eating_out"),
        ("BI-FAST TRANSFER JANJI JIWA", "eating_out"),
        ("TRANSAKSI DEBIT TGL: 03/09 QR 936000000000000003 WARTEG BAHARI", "eating_out"),
        ("E-TOLL TOPUP", "transport"),
        ("SPBU 3412", "transport"),
        ("KRL COMMUTER LINE", "transport"),
        ("APPLE.COM/BILL", "bills"),
        ("TRSF E-BANKING DB BPJS KESEHATAN", "health"),
        ("BPJS KETENAGAKERJAAN", "bills"),
        ("GOOGLE YOUTUBE PREMIUM", "entertainment"),
        ("GOOGLE STORAGE", "bills"),
    ],
)
def test_public_merchant_rules(text, expected):
    assert apply_rules(clean_description(text)) == expected


# ---- Phase 11 categories (fake descriptions) ------------------------------


@pytest.mark.parametrize(
    "text, expected",
    [
        ("QRIS SUPERINDO CONTOH", "groceries"),
        ("HYPERMART PURI 0101", "groceries"),
        ("LOTTE MART CONTOH", "groceries"),
        ("RANCH MARKET CONTOH", "groceries"),
        ("PASAR MINGGU CONTOH", "groceries"),
        ("GOFOOD SATE CONTOH", "eating_out"),
        ("CAFE CONTOH SENJA", "eating_out"),
        ("APOTEK K-24 CONTOH", "health"),
        ("KIMIA FARMA 0012", "health"),
        ("RUMAH SAKIT CONTOH", "health"),
        ("RS CONTOH MEDIKA", "health"),
        ("KLINIK GIGI CONTOH", "health"),
        ("HALODOC CONTOH", "health"),
        ("NETFLIX.COM 1122", "entertainment"),
        ("SPOTIFY P1 0001", "entertainment"),
        ("STEAM PURCHASE", "entertainment"),
        ("CINEMA XXI CONTOH", "entertainment"),
        ("BIOSKOP CONTOH", "entertainment"),
        ("PLN PRABAYAR", "bills"),
        ("INDOSAT OOREDOO", "bills"),
        ("BAYAR KOST CONTOH", "housing"),
        ("SEWA APARTEMEN CONTOH", "housing"),
        ("IPL CONTOH RESIDENCE", "housing"),
        ("GRAB CAR CONTOH", "transport"),
        ("TIKTOK SHOP CONTOH", "shopping"),
        ("WATSONS CONTOH", "shopping"),
        ("TARIK TUNAI ATM CONTOH", "cash"),
        ("ATM CONTOH 0012", "cash"),
        ("TOPUP OVO 0812", "savings_transfer"),
        ("TOP UP GOPAY CONTOH", "savings_transfer"),
        ("SHOPEEPAY TOPUP", "savings_transfer"),
        ("LINKAJA CONTOH", "savings_transfer"),
        ("BIBIT REKSA DANA", "savings_transfer"),
        ("BAREKSA CONTOH", "savings_transfer"),
        ("TRSF E-BANKING DB 0309/FTSCY/WS1 SITI CONTOH", "other_transfer"),
        ("BI-FAST DB CONTOH", "other_transfer"),
        # Merchants and top-ups win over the transfer words around them.
        ("TRSF E-BANKING DB 0309 INDOMARET", "groceries"),
        ("TRANSJAKARTA TOPUP 7742", "transport"),
        ("E-TOLL TOPUP", "transport"),
        ("TOKOPEDIA TOPUP 44", "shopping"),
    ],
)
def test_phase11_rules(text, expected):
    assert apply_rules(clean_description(text)) == expected


@pytest.mark.parametrize("text", ["HEROIK STUDIO", "OVOID TOKO", "KOSMETIK CONTOH", "DANAU CONTOH", "PARSAR"])
def test_phase11_rules_need_whole_words(text):
    assert apply_rules(clean_description(text)) is None


@pytest.mark.parametrize("text", ["TOLONG BAYAR", "HOTEL SATELIT", "KAIROS STUDIO"])
def test_short_rules_need_whole_words(text):
    assert apply_rules(clean_description(text)) is None


def test_synthetic_rule_matches_agree_with_labels():
    df = load_transactions(SAMPLE)
    rules = df["description"].map(lambda d: apply_rules(clean_description(d)))
    hit = rules.notna()
    # people_transfer has no rule: those rows match the generic transfer rule and are learned on top.
    people = (df["category"] == "people_transfer") & (rules == "other_transfer")
    assert (rules[hit & ~people] == df.loc[hit & ~people, "category"]).all()


def test_synthetic_sample_covers_every_category():
    from classifier.categories import keys

    counts = load_transactions(SAMPLE)["category"].value_counts()
    assert set(counts.index) == set(keys())
    assert counts.min() >= 6


# ---- Training and evaluating on personal labels (Phase 7) -----------------


def _labels_csv(path, rows):
    pd.DataFrame(rows, columns=["date", "description", "amount", "direction", "category", "label_source"]).to_csv(
        path, index=False
    )
    return path


@pytest.fixture
def label_files(tmp_path):
    a = _labels_csv(
        tmp_path / "labels-2026-09-30.csv",
        [
            ["2026-09-01", "QR WARUNG BU TINI", 15000, "DB", "eating_out", "user"],
            ["2026-09-02", "QR TOKO ABC", 20000, "DB", "shopping", "user"],
            ["2026-09-03", "QR UNKNOWN MERCHANT", 30000, "DB", "bills", "model"],
            ["2026-09-04", "GRAB CAR 1", 25000, "DB", "transport", "rule"],
        ],
    )
    b = _labels_csv(
        tmp_path / "labels-2026-10-31.csv",
        [
            ["2026-10-01", "QR KEDAI SENJA", 18000, "DB", "eating_out", "user"],
            ["2026-10-02", "QR MYSTERY", 40000, "DB", "bills", "model"],
        ],
    )
    return a, b


def test_train_multiple_files_drops_model_rows(tmp_path, label_files, capsys):
    model_path = tmp_path / "personal.joblib"
    assert cli.main(["train", *map(str, label_files), "--no-synthetic", "--model", str(model_path)]) == 0
    out = capsys.readouterr().out
    assert "Dropped 2 unreviewed rows" in out
    assert "Trained on 4 rows (3 categories)" in out
    assert model_path.exists()
    # Counts only, never descriptions.
    assert "WARUNG" not in out.upper() and "KEDAI" not in out.upper()


def test_train_with_synthetic_is_default(tmp_path, label_files, capsys):
    model_path = tmp_path / "personal.joblib"
    assert cli.main(["train", *map(str, label_files), "--model", str(model_path)]) == 0
    n_sample = len(pd.read_csv(SAMPLE))
    assert f"Trained on {4 + n_sample} rows (12 categories)" in capsys.readouterr().out


def test_train_does_not_add_sample_twice(tmp_path, capsys):
    assert cli.main(["train", str(SAMPLE), "--model", str(tmp_path / "m.joblib")]) == 0
    assert f"Trained on {len(pd.read_csv(SAMPLE))} rows" in capsys.readouterr().out


def test_train_expands_wildcards(tmp_path, label_files, capsys):
    pattern = str(tmp_path / "labels-*.csv")
    assert cli.main(["train", pattern, "--no-synthetic", "--model", str(tmp_path / "m.joblib")]) == 0
    assert "Trained on 4 rows" in capsys.readouterr().out
    assert cli.main(["train", str(tmp_path / "nothing-*.csv"), "--model", str(tmp_path / "m.joblib")]) == 1


def test_train_only_model_rows_fails_cleanly(tmp_path, capsys):
    path = _labels_csv(tmp_path / "l.csv", [["2026-09-01", "QR X", 1, "DB", "bills", "model"]])
    assert cli.main(["train", str(path), "--no-synthetic", "--model", str(tmp_path / "m.joblib")]) == 1
    assert not (tmp_path / "m.joblib").exists()


def test_evaluate_multiple_files_with_tiny_class(tmp_path, capsys):
    rows = [["2026-09-01", f"QR WARUNG {i}", 1000, "DB", "eating_out", "user"] for i in range(4)]
    rows += [["2026-09-02", f"TRSF E-BANKING DB {i} BUDI", 1000, "DB", "other_transfer", "rule"] for i in range(4)]
    rows += [["2026-09-03", "QR TOKO SATU", 1000, "DB", "shopping", "user"]]  # only one row
    rows += [["2026-09-04", "QR GUESS", 1000, "DB", "bills", "model"]]  # dropped
    a = _labels_csv(tmp_path / "a.csv", rows[:5])
    b = _labels_csv(tmp_path / "b.csv", rows[5:])
    assert cli.main(["evaluate", str(a), str(b)]) == 0
    out = capsys.readouterr().out
    assert "Dropped 1 unreviewed rows" in out
    assert "skipping categories with fewer than 2 rows from CV: shopping (1)" in out
    assert "Rows: 8, 4-fold" in out
    assert "WARUNG" not in out.upper()


def test_evaluate_min_per_class(tmp_path, capsys):
    assert cli.main(["evaluate", str(SAMPLE), "--min-per-class", "7"]) == 0
    out = capsys.readouterr().out
    assert "fewer than 7 rows" in out


def test_evaluate_needs_two_categories(tmp_path, capsys):
    rows = [["2026-09-01", f"QR WARUNG {i}", 1000, "DB", "eating_out", "user"] for i in range(3)]
    assert cli.main(["evaluate", str(_labels_csv(tmp_path / "a.csv", rows))]) == 1
