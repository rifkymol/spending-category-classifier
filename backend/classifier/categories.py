"""The categories: one source of truth for the classifier, the API, the reports and the frontend.

Every category has a key (used in the API, exports and labels files; never translated), a group
(Needs, Wants or Transfers), a 50/30/20 bucket, a color and English/Indonesian names.

Buckets:
- needs / wants: the 50% and 30% parts of 50/30/20.
- savings: money moved to the user's own savings or e-wallets. It counts as saving, not spending.
- other: money out that is neither (family and friends, cash, other transfers). It is shown on its
  own as "Other money out".

The frontend reads the same data from frontend/src/lib/categories.json, which
backend/scripts/export_categories.py writes from this file (a test checks they match). The API
also serves it at GET /api/categories.

Colors: Needs use cool hues (green, teal, cyan, blue, deep slate-teal), Wants warm ones (coral,
pink, amber), Transfers violet, orchid and grays; each group color is a deeper or softer tone of its
family. Each has at least 3:1 contrast against the light and dark canvas and surface colors, and
every pair of category and group colors is at least 11 CIEDE2000 units apart (both tested), so dots
and bars stay readable and tellable apart in both themes.
"""

from dataclasses import asdict, dataclass

LANGS = ("en", "id")


@dataclass(frozen=True)
class Group:
    key: str
    color: str
    name_en: str
    name_id: str


@dataclass(frozen=True)
class Category:
    key: str
    group: str
    bucket: str  # needs | wants | savings | other
    color: str
    name_en: str
    name_id: str


GROUPS = [
    Group("needs", "#1B7298", "Needs", "Kebutuhan"),
    Group("wants", "#975B26", "Wants", "Keinginan"),
    Group("transfers", "#9382C9", "Transfers", "Transfer"),
]

CATEGORIES = [
    Category("groceries", "needs", "needs", "#2B9656", "Groceries", "Kebutuhan harian"),
    Category("bills", "needs", "needs", "#3A7FD6", "Bills and utilities", "Tagihan"),
    Category("transport", "needs", "needs", "#1593B5", "Transport", "Transportasi"),
    Category("health", "needs", "needs", "#14998A", "Health", "Kesehatan"),
    Category("housing", "needs", "needs", "#3E7274", "Rent and housing", "Sewa dan hunian"),
    Category("eating_out", "wants", "wants", "#D85A30", "Eating out", "Makan di luar"),
    Category("shopping", "wants", "wants", "#D4537E", "Shopping", "Belanja"),
    Category("entertainment", "wants", "wants", "#B07A0E", "Entertainment and subscriptions",
             "Hiburan dan langganan"),
    Category("savings_transfer", "transfers", "savings", "#8B5CF6", "To my savings or e-wallet",
             "Ke tabungan atau dompet digital sendiri"),
    Category("people_transfer", "transfers", "other", "#B05CC4", "Family and friends", "Keluarga dan teman"),
    Category("cash", "transfers", "other", "#8F8578", "Cash withdrawal", "Tarik tunai"),
    Category("other_transfer", "transfers", "other", "#6F7D91", "Other transfer", "Transfer lainnya"),
]

BUCKETS = ("needs", "wants", "savings", "other")
TRANSFERS = "transfers"
# Color for anything that is not a known category (e.g. an old key in a hand-edited file).
OTHER_COLOR = "#888780"

# Old category keys (before Phase 11) and what they become. food and transfer were split into
# several categories, so a mapped food or transfer label is only a guess: the CLI marks those rows
# label_source "migrated" and leaves them out of training until they are reviewed.
MIGRATION = {
    "food": "eating_out",
    "transport": "transport",
    "shopping": "shopping",
    "bills": "bills",
    "transfer": "other_transfer",
}
CHANGED_MEANING = frozenset({"food", "transfer"})

_BY_KEY = {c.key: c for c in CATEGORIES}
_GROUP_BY_KEY = {g.key: g for g in GROUPS}


def keys() -> list[str]:
    """All category keys, in display order."""
    return [c.key for c in CATEGORIES]


def get(key: str) -> Category | None:
    return _BY_KEY.get(key)


def by_group(group: str) -> list[str]:
    """The keys in one group, in display order."""
    return [c.key for c in CATEGORIES if c.group == group]


def by_bucket(bucket: str) -> list[str]:
    return [c.key for c in CATEGORIES if c.bucket == bucket]


def group_of(key: str) -> str | None:
    c = _BY_KEY.get(key)
    return c.group if c else None


def bucket_of(key: str) -> str | None:
    c = _BY_KEY.get(key)
    return c.bucket if c else None


def is_transfer(key: str) -> bool:
    return group_of(key) == TRANSFERS


def color_of(key: str) -> str:
    c = _BY_KEY.get(key)
    return c.color if c else OTHER_COLOR


def migrate_key(key: str) -> str:
    """An old (pre-Phase 11) key as its new key; any other value unchanged."""
    return MIGRATION.get(key, key)


def name(key: str, lang: str = "en") -> str | None:
    c = _BY_KEY.get(key)
    if c is None:
        return None
    return c.name_id if lang == "id" else c.name_en


def group_name(key: str, lang: str = "en") -> str | None:
    g = _GROUP_BY_KEY.get(key)
    if g is None:
        return None
    return g.name_id if lang == "id" else g.name_en


def export() -> dict:
    """Everything the frontend needs, both languages, as plain JSON data."""
    return {
        "groups": [asdict(g) for g in GROUPS],
        "categories": [asdict(c) for c in CATEGORIES],
        "other_color": OTHER_COLOR,
    }


def for_lang(lang: str = "en") -> dict:
    """The GET /api/categories payload: names in one language."""
    return {
        "groups": [{"key": g.key, "color": g.color, "name": group_name(g.key, lang)} for g in GROUPS],
        "categories": [
            {"key": c.key, "group": c.group, "bucket": c.bucket, "color": c.color, "name": name(c.key, lang)}
            for c in CATEGORIES
        ],
        "other_color": OTHER_COLOR,
    }
