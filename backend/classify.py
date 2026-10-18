"""Command-line interface for the spending category classifier.

Usage (from the project root):
    python backend/classify.py evaluate data/sample_transactions.csv
    python backend/classify.py train data/sample_transactions.csv
    python backend/classify.py predict data/sample_transactions.csv --out data/predictions.csv
"""

import argparse
import sys
from pathlib import Path

import joblib
import pandas as pd
from sklearn.metrics import classification_report
from sklearn.model_selection import StratifiedKFold

from classifier import CONFIDENCE_THRESHOLD, build_model, classify, clean_description, load_transactions

BACKEND_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL = BACKEND_DIR / "models" / "model.joblib"
DEFAULT_OUT = BACKEND_DIR.parent / "data" / "predictions.csv"


def load_labeled(path) -> pd.DataFrame:
    df = load_transactions(path)
    if "category" not in df.columns:
        raise ValueError("Labeled CSV must have a 'category' column.")
    return df[df["category"].notna()].reset_index(drop=True)


def evaluate(args) -> None:
    df = load_labeled(args.csv)
    smallest = int(df["category"].value_counts().min())
    n_splits = min(5, smallest)
    if n_splits < 2:
        raise ValueError("Every category needs at least 2 labeled rows for cross-validation.")

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
    df = load_labeled(args.csv)
    model = build_model().fit(df["description"].map(clean_description), df["category"])
    model_path = Path(args.model)
    model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, model_path)
    print(f"Trained on {len(df)} rows ({df['category'].nunique()} categories)")
    print(f"Saved model to {model_path}")


def predict(args) -> None:
    model_path = Path(args.model)
    if not model_path.exists():
        raise ValueError(f"Model not found at {model_path}. Run 'train' first.")
    model = joblib.load(model_path)
    df = classify(load_transactions(args.csv), model, args.threshold)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path, index=False)
    print(f"Rule matches: {df['rule_category'].notna().sum()} of {len(df)}")
    print(f"Flagged for review: {df['needs_review'].sum()}")
    print(f"Saved predictions to {out_path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Spending category classifier")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("evaluate", help="cross-validate on a labeled CSV")
    p.add_argument("csv")
    p.add_argument("--threshold", type=float, default=CONFIDENCE_THRESHOLD)
    p.set_defaults(func=evaluate)

    p = sub.add_parser("train", help="fit on all labeled rows and save the model")
    p.add_argument("csv")
    p.add_argument("--model", default=str(DEFAULT_MODEL))
    p.set_defaults(func=train)

    p = sub.add_parser("predict", help="classify a CSV (no category column needed)")
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
