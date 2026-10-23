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
from collections import Counter

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline, make_pipeline

from .bca import normalize_bca
from .categories import CHANGED_MEANING, is_transfer, migrate_key
from .transfers import is_named, transfer_key

# Phrases checked after cleaning, category by category in this order. Extend this as you
# find new merchants. The transfer group (cash, savings_transfer, other_transfer) comes last so a
# merchant wins over transfer words, e.g. a QR payment or e-banking transfer to KFC is still
# eating_out. people_transfer has no rule: it is learned from labels and the recipient memory.
RULES = {
    # Supermarkets, minimarkets and markets: mostly everyday household shopping.
    "groceries": [
        "indomaret", "alfamart", "alfamidi", "superindo", "hypermart", "transmart", "lotte mart", "giant", "hero",
        "ranch market", "farmers market", "pasar",
    ],
    "eating_out": [
        "grab food", "gofood", "go food", "mcd", "kfc", "kopi kenangan", "starbucks", "padang",
        "hokben", "solaria", "richeese", "chatime", "janji jiwa", "fore coffee", "point coffee",
        "mie gacoan", "bakmi gm", "pizza hut", "domino", "burger king", "wendy", "chagee", "mixue",
        "es teh indonesia", "haus",
        # Generic food words. They can false-match, but only on food-ish names.
        "sate", "warung", "warteg", "nasi", "ayam", "bakso", "mie ayam", "kopi", "cafe", "resto",
        "restoran", "bakery",
    ],
    # Before bills, so "bpjs kesehatan" is health while other BPJS payments stay bills. Apotek K-24
    # needs no phrase of its own: cleaning drops the digits, and "apotek" already matches it.
    "health": [
        "apotek", "kimia farma", "guardian", "century", "rumah sakit", "rs", "klinik", "halodoc",
        "bpjs kesehatan",
    ],
    # Before bills, so streaming that used to be a bill is entertainment now.
    "entertainment": [
        "netflix", "spotify", "youtube premium", "disney", "vidio", "steam", "playstation", "cinema xxi", "cgv",
        "bioskop",
    ],
    "bills": [
        "pln", "listrik", "indihome", "telkomsel", "pdam", "bpjs",
        "biaya adm", "biaya administrasi",
        "first media", "biznet", "myrepublic", "xl", "indosat", "smartfren", "by u", "axis",
        "youtube", "google", "apple com", "icloud",
    ],
    "housing": ["kos", "kost", "sewa", "apartemen", "ipl"],
    "transport": [
        "grab ride", "grab car", "gojek", "go ride", "mrt", "transjakarta", "shell", "pertamina",
        "bluebird", "krl", "kai", "commuter", "parkir", "tol", "e toll", "spbu", "maxim", "indriver",
    ],
    "shopping": [
        "shopee", "tokopedia", "lazada", "blibli", "tiktok shop",
        "watsons", "uniqlo", "ace hardware", "informa", "ikea", "gramedia", "miniso", "matahari",
    ],
    # The transfer group, last.
    "cash": ["tarik tunai", "atm"],
    # E-wallet top-ups and investment apps: the user's own money, moved.
    "savings_transfer": [
        "top up", "topup", "dana", "ovo", "gopay", "shopeepay", "linkaja", "flip", "bibit", "ajaib", "bareksa",
        "reksa dana",
    ],
    "other_transfer": [
        "trsf e banking", "transfer", "bi fast", "bifast", "switching", "setor tunai",
        "kr otomatis", "kredit otomatis",
    ],
}

# Whole-phrase matching, so "shell" does not match "shellfish".
_RULE_PATTERNS = [
    (category, re.compile(rf"\b{re.escape(phrase)}\b"))
    for category, phrases in RULES.items()
    for phrase in phrases
]

CONFIDENCE_THRESHOLD = 0.6

OUTPUT_COLUMNS = [
    "cleaned", "rule_category", "model_category", "model_confidence", "memory_category", "predicted", "source",
    "needs_review",
]

# A personal model (classify.py train) carries a "same recipient, same category" memory as this
# attribute: transfer_key(description) -> category, from labeled transfer rows. The synthetic
# model's memory is empty. Older model files have no attribute, which also means empty.
MEMORY_ATTR = "recipient_memory_"
MEMORY_LABEL_SOURCES = {"user", "rule"}


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


def recipient_memory(model) -> dict[str, str]:
    return getattr(model, MEMORY_ATTR, None) or {}


def build_recipient_memory(df: pd.DataFrame) -> dict[str, str]:
    """transfer_key -> category from labeled rows: transfer-group categories with label_source
    user or rule, named counterparties only. When one recipient has several categories, the most
    frequent wins (ties: alphabetical). Rows without a label_source (e.g. the synthetic sample)
    are not used."""
    if df.empty or "label_source" not in df.columns:
        return {}
    rows = df[df["label_source"].isin(MEMORY_LABEL_SOURCES) & df["category"].map(is_transfer)]
    counts: dict[str, Counter] = {}
    for description, category in zip(rows["description"], rows["category"]):
        key = transfer_key(description)
        if is_named(key):
            counts.setdefault(key, Counter())[category] += 1
    return {key: min(c.items(), key=lambda kv: (-kv[1], kv[0]))[0] for key, c in counts.items()}


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
    """Return a copy of `df` with rule, model, memory and final predictions, the source of each
    prediction ("rule", "memory" or "model") and a review flag.

    Order: a rule outside the transfer group wins; then the model's recipient memory for transfer
    rows (a transfer rule matched, or no rule and the model says transfer); then any rule; then
    the model. Rows decided by neither a rule nor the memory get needs_review = True when the
    model's confidence is below `threshold`, or when an old model (before Phase 11) predicted
    food or transfer, whose meaning changed.
    """
    out = df.copy()
    out["cleaned"] = out["description"].fillna("").astype(str).map(clean_description)
    out["rule_category"] = out["cleaned"].map(apply_rules)

    if len(out):
        probs = model.predict_proba(out["cleaned"])
        raw = pd.Series(model.classes_[probs.argmax(axis=1)], index=out.index, dtype=object)
        out["model_category"] = raw.map(migrate_key)
        out["model_confidence"] = probs.max(axis=1).round(4)
    else:
        raw = pd.Series(dtype=object)
        out["model_category"] = pd.Series(dtype=object)
        out["model_confidence"] = pd.Series(dtype=float)

    rule = out["rule_category"]
    rule_is_transfer = rule.map(lambda c: isinstance(c, str) and is_transfer(c)).astype(bool)
    memory = recipient_memory(model)
    remembered = pd.Series([None] * len(out), index=out.index, dtype=object)
    if memory and len(out):
        model_is_transfer = out["model_category"].map(is_transfer).astype(bool)
        transfer_row = rule_is_transfer | (rule.isna() & model_is_transfer)
        keys = out["description"].fillna("").astype(str).map(transfer_key)
        remembered = keys.map(memory.get).where(transfer_row, None)
    out["memory_category"] = remembered

    use_memory = remembered.notna()
    use_rule = rule.notna() & ~use_memory
    predicted = out["model_category"].astype(object).copy()
    predicted[use_rule] = rule[use_rule]
    predicted[use_memory] = remembered[use_memory]
    out["predicted"] = predicted
    out["source"] = "model"
    out.loc[use_rule, "source"] = "rule"
    out.loc[use_memory, "source"] = "memory"
    old_meaning = raw.isin(CHANGED_MEANING).to_numpy() if len(out) else False
    out["needs_review"] = (out["source"] == "model") & ((out["model_confidence"] < threshold) | old_meaning)
    return out
