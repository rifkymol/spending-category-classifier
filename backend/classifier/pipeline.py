"""Spending category classifier core.

Pipeline:
1. Clean the transaction description.
2. Apply keyword rules for known merchants.
3. For everything else, use a TF-IDF (character n-grams) + logistic regression model.
4. Flag low-confidence predictions for manual review.

Everything here is pure: no file writes and no logging of descriptions or amounts,
so the API can call it on in-memory uploads.
"""

import re

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline, make_pipeline

from .bca import normalize_bca

# Phrases checked after cleaning, category by category in this order. Extend this as you
# find new merchants. "transfer" comes last so a merchant wins over transfer words, e.g. a
# QR payment or e-banking transfer to KFC is still food.
RULES = {
    "food": ["grab food", "gofood", "go food", "mcd", "kfc", "kopi kenangan", "starbucks", "padang"],
    "transport": ["grab ride", "grab car", "gojek", "go ride", "mrt", "transjakarta", "shell", "pertamina"],
    "shopping": ["shopee", "tokopedia", "lazada", "blibli", "tiktok shop"],
    "bills": ["pln", "indihome", "telkomsel", "pdam", "bpjs", "netflix", "spotify", "biaya adm", "biaya administrasi"],
    "transfer": [
        "trsf e banking", "transfer", "bi fast", "bifast", "tarik tunai", "setor tunai",
        "kr otomatis", "kredit otomatis", "switching",
    ],
}

# Whole-phrase matching, so "shell" does not match "shellfish".
_RULE_PATTERNS = [
    (category, re.compile(rf"\b{re.escape(phrase)}\b"))
    for category, phrases in RULES.items()
    for phrase in phrases
]

CONFIDENCE_THRESHOLD = 0.6

OUTPUT_COLUMNS = ["cleaned", "rule_category", "model_category", "model_confidence", "predicted", "needs_review"]


def clean_description(text: str) -> str:
    """Lowercase, strip dates and long numbers, keep only letters and spaces, then
    expand BCA abbreviations and drop BCA boilerplate (see bca.py)."""
    text = text.lower()
    text = re.sub(r"\d{2}[/-]\d{2}([/-]\d{2,4})?", " ", text)  # dates like 09/12/26
    text = re.sub(r"\d{4,}", " ", text)  # reference and card numbers
    text = re.sub(r"[^a-z\s]", " ", text)  # "*", "-", punctuation
    return normalize_bca(re.sub(r"\s+", " ", text).strip())


def apply_rules(cleaned: str) -> str | None:
    """Return the category of the first matching merchant phrase, or None."""
    for category, pattern in _RULE_PATTERNS:
        if pattern.search(cleaned):
            return category
    return None


def build_model() -> Pipeline:
    # Character n-grams handle messy merchant names and typos better than whole words.
    return make_pipeline(
        TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5)),
        LogisticRegression(max_iter=1000),
    )


def load_transactions(path_or_buffer) -> pd.DataFrame:
    """Read a transactions CSV from a path or a file-like object.

    Requires a `description` column. A `category` column is optional.
    """
    df = pd.read_csv(path_or_buffer)
    if "description" not in df.columns:
        found = ", ".join(map(str, df.columns)) or "(none)"
        raise ValueError(f"CSV must have a 'description' column. Columns found: {found}")
    df["description"] = df["description"].fillna("").astype(str)
    return df


def classify(df: pd.DataFrame, model: Pipeline, threshold: float = CONFIDENCE_THRESHOLD) -> pd.DataFrame:
    """Return a copy of `df` with rule, model and final predictions plus a review flag.

    Rules win over the model. Rows with no rule match and model confidence below
    `threshold` get needs_review = True.
    """
    out = df.copy()
    out["cleaned"] = out["description"].fillna("").astype(str).map(clean_description)
    out["rule_category"] = out["cleaned"].map(apply_rules)

    if len(out):
        probs = model.predict_proba(out["cleaned"])
        out["model_category"] = model.classes_[probs.argmax(axis=1)]
        out["model_confidence"] = probs.max(axis=1).round(4)
    else:
        out["model_category"] = pd.Series(dtype=object)
        out["model_confidence"] = pd.Series(dtype=float)

    out["predicted"] = out["rule_category"].fillna(out["model_category"])
    out["needs_review"] = out["rule_category"].isna() & (out["model_confidence"] < threshold)
    return out
