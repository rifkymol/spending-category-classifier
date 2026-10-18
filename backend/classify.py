"""Command-line interface for the spending category classifier.

Usage (from the project root):
    python backend/classify.py evaluate data/sample_transactions.csv
    python backend/classify.py train data/sample_transactions.csv
    python backend/classify.py evaluate data/labels/*.csv
    python backend/classify.py train data/labels/*.csv --model models/personal.joblib
    python backend/classify.py predict data/sample_transactions.csv --out data/predictions.csv
    python backend/classify.py predict path/to/bca-estatement.pdf --out data/predictions.csv
"""

import argparse
import glob
import sys
from pathlib import Path

import joblib
import pandas as pd
from sklearn.metrics import classification_report
from sklearn.model_selection import StratifiedKFold

from classifier import CONFIDENCE_THRESHOLD, build_model, classify, clean_description, load_transactions
from classifier.importers import parse_bca_pdf, statement_frame

BACKEND_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL = BACKEND_DIR / "models" / "model.joblib"
DEFAULT_OUT = BACKEND_DIR.parent / "data" / "predictions.csv"
SAMPLE_CSV = BACKEND_DIR.parent / "data" / "sample_transactions.csv"

# Rows exported from the web app carry a label_source. Only rows a person confirmed or
# corrected ("user") or a keyword rule matched ("rule") are labels; "model" rows are
# unreviewed guesses and would teach the model its own mistakes.
TRUSTED_LABEL_SOURCES = {"user", "rule"}


def expand_paths(patterns) -> list[Path]:
    """Expand wildcards ourselves: Windows shells pass data/labels/*.csv through as-is."""
    paths = []
    for pattern in patterns:
        if glob.has_magic(pattern):
            matches = sorted(glob.glob(pattern))
            if not matches:
                raise ValueError(f"No files match {pattern}")
            paths.extend(Path(m) for m in matches)
        else:
            paths.append(Path(pattern))
    return paths


def load_labeled_file(path) -> tuple[pd.DataFrame, int]:
    """One labeled CSV, minus rows without a category or with an untrusted label_source.

    Returns the rows and how many were dropped for their label_source.
    """
    df = load_transactions(path)
    if "category" not in df.columns:
        raise ValueError(f"Labeled CSV must have a 'category' column: {path}")
    df = df[df["category"].notna()]
    dropped = 0
    if "label_source" in df.columns:
        trusted = df["label_source"].isin(TRUSTED_LABEL_SOURCES)
        dropped = int((~trusted).sum())
        df = df[trusted]
    return df, dropped


def load_labeled(paths, with_synthetic: bool = False) -> pd.DataFrame:
    """Concatenate labeled CSVs (optionally plus the synthetic sample) and print counts only."""
    paths = expand_paths([str(p) for p in paths])
    if with_synthetic and SAMPLE_CSV.resolve() not in {p.resolve() for p in paths}:
        paths.append(SAMPLE_CSV)
    frames, dropped = [], 0
    for path in paths:
        df, n = load_labeled_file(path)
        frames.append(df)
        dropped += n
    df = pd.concat(frames, ignore_index=True)
    if dropped:
        print(f"Dropped {dropped} unreviewed rows (label_source not user or rule)")
    if df.empty:
        raise ValueError("No labeled rows to use.")
    return df


def print_category_counts(df: pd.DataFrame) -> None:
    for category, count in df["category"].value_counts().sort_index().items():
        print(f"  {category:<12}{count:>6}")


def evaluate(args) -> None:
    df = load_labeled(args.csv)
    min_per_class = max(2, args.min_per_class)
    counts = df["category"].value_counts()
    too_small = counts[counts < min_per_class]
    if len(too_small):
        skipped = ", ".join(f"{c} ({n})" for c, n in too_small.sort_index().items())
        print(f"Warning: skipping categories with fewer than {min_per_class} rows from CV: {skipped}")
        df = df[~df["category"].isin(too_small.index)].reset_index(drop=True)
        counts = counts.drop(too_small.index)
    if len(counts) < 2:
        raise ValueError(f"Cross-validation needs at least 2 categories with {min_per_class} or more rows.")
    n_splits = min(5, int(counts.min()))

    cleaned = df["description"].map(clean_description)
    cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=0)
    folds = []
    for train_idx, test_idx in cv.split(cleaned, df["category"]):
        model = build_model().fit(cleaned.iloc[train_idx], df["category"].iloc[train_idx])
        folds.append(classify(df.iloc[test_idx], model, args.threshold))
    held_out = pd.concat(folds)

    truth = held_out["category"]
    rule_hit = held_out["rule_category"].notna()
    model_acc = (held_out["model_category"] == truth).mean()
    rule_cov = rule_hit.mean()
    rule_prec = (held_out.loc[rule_hit, "rule_category"] == truth[rule_hit]).mean() if rule_hit.any() else float("nan")
    combined_acc = (held_out["predicted"] == truth).mean()
    review_share = held_out["needs_review"].mean()

    print(f"Rows: {len(held_out)}, {n_splits}-fold stratified CV (held-out predictions only)")
    print(f"Model-only accuracy:   {model_acc:.2f}")
    print(f"Rule coverage:         {rule_cov:.2f} ({rule_hit.sum()} of {len(held_out)})")
    print(f"Rule precision:        {rule_prec:.2f}")
    print(f"Combined accuracy:     {combined_acc:.2f}")
    print(f"Review share @ {args.threshold:.2f}:  {review_share:.2f} ({held_out['needs_review'].sum()} rows)")
    print()
    print(classification_report(truth, held_out["predicted"], zero_division=0))


def train(args) -> None:
    df = load_labeled(args.csv, with_synthetic=args.synthetic)
    if df["category"].nunique() < 2:
        raise ValueError("Training needs at least 2 categories.")
    model = build_model().fit(df["description"].map(clean_description), df["category"])
    model_path = Path(args.model)
    model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, model_path)
    print(f"Trained on {len(df)} rows ({df['category'].nunique()} categories)")
    print_category_counts(df)
    print(f"Saved model to {model_path}")


def predict(args) -> None:
    model_path = Path(args.model)
    if not model_path.exists():
        raise ValueError(f"Model not found at {model_path}. Run 'train' first.")
    model = joblib.load(model_path)
    if str(args.csv).lower().endswith(".pdf"):  # a BCA e-statement, parsed in memory
        transactions = statement_frame(parse_bca_pdf(Path(args.csv).read_bytes()))
    else:
        transactions = load_transactions(args.csv)
    df = classify(transactions, model, args.threshold)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path, index=False)
    print(f"Rule matches: {df['rule_category'].notna().sum()} of {len(df)}")
    print(f"Flagged for review: {df['needs_review'].sum()}")
    print(f"Saved predictions to {out_path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Spending category classifier")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("evaluate", help="cross-validate on one or more labeled CSVs")
    p.add_argument("csv", nargs="+")
    p.add_argument("--threshold", type=float, default=CONFIDENCE_THRESHOLD)
    p.add_argument(
        "--min-per-class", type=int, default=2,
        help="leave categories with fewer labeled rows out of CV (at least 2)",
    )
    p.set_defaults(func=evaluate)

    p = sub.add_parser("train", help="fit on all labeled rows of one or more CSVs and save the model")
    p.add_argument("csv", nargs="+")
    p.add_argument("--model", default=str(DEFAULT_MODEL))
    synthetic = p.add_mutually_exclusive_group()
    synthetic.add_argument(
        "--with-synthetic", dest="synthetic", action="store_true", default=True,
        help="also train on data/sample_transactions.csv (default)",
    )
    synthetic.add_argument("--no-synthetic", dest="synthetic", action="store_false")
    p.set_defaults(func=train)

    p = sub.add_parser("predict", help="classify a CSV (no category column needed) or a BCA e-statement PDF")
    p.add_argument("csv")
    p.add_argument("--model", default=str(DEFAULT_MODEL))
    p.add_argument("--out", default=str(DEFAULT_OUT))
    p.add_argument("--threshold", type=float, default=CONFIDENCE_THRESHOLD)
    p.set_defaults(func=predict)
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    try:
        args.func(args)
    except (ValueError, FileNotFoundError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
