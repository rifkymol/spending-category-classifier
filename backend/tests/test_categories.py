"""Phase 11: categories.py is the one source of truth. Integrity, colors, the exported frontend
JSON, GET /api/categories, and no old hard-coded category lists left anywhere else.
"""

import itertools
import math
import re
import sys
import typing
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import CATEGORIES, app
from app.schemas import Category, ReportRow
from classifier import categories as cat

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend" / "scripts"))
import export_categories  # noqa: E402

# The light and dark canvas and surface colors in frontend/src/app/globals.css.
BACKGROUNDS = ["#fafaf7", "#ffffff", "#111110", "#1a1a19"]


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _luminance(hex_color: str) -> float:
    channels = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def contrast(a: str, b: str) -> float:
    hi, lo = sorted([_luminance(a), _luminance(b)], reverse=True)
    return (hi + 0.05) / (lo + 0.05)


# ---- integrity -------------------------------------------------------------


def test_twelve_categories_in_three_groups():
    assert cat.keys() == [
        "groceries", "bills", "transport", "health", "housing",
        "eating_out", "shopping", "entertainment",
        "savings_transfer", "people_transfer", "cash", "other_transfer",
    ]
    assert [g.key for g in cat.GROUPS] == ["needs", "wants", "transfers"]
    assert cat.by_group("wants") == ["eating_out", "shopping", "entertainment"]
    assert cat.by_group("transfers") == ["savings_transfer", "people_transfer", "cash", "other_transfer"]


def test_every_category_is_complete():
    keys = cat.keys()
    assert len(keys) == len(set(keys))
    groups = {g.key for g in cat.GROUPS}
    for c in cat.CATEGORIES:
        assert re.fullmatch(r"[a-z_]+", c.key)
        assert c.group in groups, c.key
        assert c.bucket in cat.BUCKETS, c.key
        assert re.fullmatch(r"#[0-9A-F]{6}", c.color), c.key
        assert c.name_en.strip() and c.name_id.strip(), c.key
    for g in cat.GROUPS:
        assert g.name_en.strip() and g.name_id.strip() and re.fullmatch(r"#[0-9A-F]{6}", g.color)


def test_buckets_follow_groups():
    assert cat.by_bucket("needs") == cat.by_group("needs")
    assert cat.by_bucket("wants") == cat.by_group("wants")
    assert cat.by_bucket("savings") == ["savings_transfer"]
    assert cat.by_bucket("other") == ["people_transfer", "cash", "other_transfer"]
    assert cat.bucket_of("cash") == "other" and cat.bucket_of("nope") is None
    assert cat.is_transfer("savings_transfer") and not cat.is_transfer("groceries")


def test_names():
    assert cat.name("housing", "en") == "Rent and housing"
    assert cat.name("housing", "id") == "Sewa dan hunian"
    assert cat.name("unknown") is None
    assert cat.group_name("transfers", "id") == "Transfer"


def test_colors_are_distinct_and_readable_in_both_themes():
    colors = [c.color for c in cat.CATEGORIES] + [g.color for g in cat.GROUPS]
    assert len(set(colors)) == len(colors)
    for color in colors + [cat.OTHER_COLOR]:
        for bg in BACKGROUNDS:
            assert contrast(color, bg) >= 3.0, (color, bg, round(contrast(color, bg), 2))


def _lab(hex_color: str) -> tuple[float, float, float]:
    """sRGB -> CIELAB (D65)."""
    c = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    x = (0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2]) / 0.95047
    y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    z = (0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2]) / 1.08883

    def f(t):
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116

    return 116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))


def delta_e2000(c1: str, c2: str) -> float:
    """CIEDE2000 color difference (Sharma et al. 2005): about 2 is just noticeable side by side,
    10 or more reads as a different color at a glance."""
    L1, a1, b1 = _lab(c1)
    L2, a2, b2 = _lab(c2)
    cbar = (math.hypot(a1, b1) + math.hypot(a2, b2)) / 2
    g = 0.5 * (1 - math.sqrt(cbar ** 7 / (cbar ** 7 + 25 ** 7)))
    a1p, a2p = a1 * (1 + g), a2 * (1 + g)
    c1p, c2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p, h2p = math.degrees(math.atan2(b1, a1p)) % 360, math.degrees(math.atan2(b2, a2p)) % 360
    dlp, dcp = L2 - L1, c2p - c1p
    dhp = 0.0 if c1p * c2p == 0 else (h2p - h1p + 180) % 360 - 180
    dHp = 2 * math.sqrt(c1p * c2p) * math.sin(math.radians(dhp / 2))
    lbar, cbarp = (L1 + L2) / 2, (c1p + c2p) / 2
    if c1p * c2p == 0:
        hbar = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        hbar = (h1p + h2p) / 2
    else:
        hbar = (h1p + h2p + 360) / 2 if h1p + h2p < 360 else (h1p + h2p - 360) / 2
    t = (1 - 0.17 * math.cos(math.radians(hbar - 30)) + 0.24 * math.cos(math.radians(2 * hbar))
         + 0.32 * math.cos(math.radians(3 * hbar + 6)) - 0.20 * math.cos(math.radians(4 * hbar - 63)))
    rc = 2 * math.sqrt(cbarp ** 7 / (cbarp ** 7 + 25 ** 7))
    rt = -math.sin(math.radians(60 * math.exp(-(((hbar - 275) / 25) ** 2)))) * rc
    sl = 1 + 0.015 * (lbar - 50) ** 2 / math.sqrt(20 + (lbar - 50) ** 2)
    sc, sh = 1 + 0.045 * cbarp, 1 + 0.015 * cbarp * t
    return math.sqrt((dlp / sl) ** 2 + (dcp / sc) ** 2 + (dHp / sh) ** 2 + rt * (dcp / sc) * (dHp / sh))


# Dots are 8 px and slices sit side by side, so every pair needs a clear margin over "noticeable".
MIN_DELTA_E = 11


def test_delta_e2000_reference_values():
    # Identity, black vs white (L* 0 vs 100) and a one-step change in blue.
    assert delta_e2000("#123456", "#123456") == 0
    assert delta_e2000("#000000", "#FFFFFF") == pytest.approx(100, abs=0.5)
    assert delta_e2000("#3A7FD6", "#3A7FD7") < 1


def test_no_two_colors_are_too_close():
    """Every category vs every other category and every group color: groups share a hue family
    with their categories, so a group dot must still look different from each category dot."""
    named = {c.key: c.color for c in cat.CATEGORIES} | {f"group:{g.key}": g.color for g in cat.GROUPS}
    close = [(a, b, round(delta_e2000(named[a], named[b]), 1)) for a, b in itertools.combinations(named, 2)
             if delta_e2000(named[a], named[b]) < MIN_DELTA_E]
    assert close == []


def test_housing_is_not_a_transfers_violet():
    housing = cat.color_of("housing")
    transfers_group = next(g.color for g in cat.GROUPS if g.key == "transfers")
    for other in [cat.color_of(k) for k in cat.by_group("transfers")] + [transfers_group]:
        assert delta_e2000(housing, other) >= 15


def test_migration_map():
    assert cat.MIGRATION == {"food": "eating_out", "transport": "transport", "shopping": "shopping",
                             "bills": "bills", "transfer": "other_transfer"}
    assert set(cat.MIGRATION.values()) <= set(cat.keys())
    assert cat.CHANGED_MEANING == {"food", "transfer"}
    assert cat.migrate_key("food") == "eating_out" and cat.migrate_key("groceries") == "groceries"


# ---- one source ------------------------------------------------------------


def test_frontend_json_matches_categories_py():
    """frontend/src/lib/categories.json is generated: run backend/scripts/export_categories.py."""
    on_disk = (ROOT / "frontend" / "src" / "lib" / "categories.json").read_text(encoding="utf-8")
    assert on_disk.replace("\r\n", "\n") == export_categories.render()


def test_schema_literal_and_api_list_come_from_categories_py():
    assert list(typing.get_args(Category)) == cat.keys()
    assert CATEGORIES == cat.keys()


# The old five keys as a list, in any quoting: nothing outside categories.py and the tests may
# spell them out any more. "food" was only ever a category key, so it may not appear at all.
OLD_LIST = re.compile(r"""["']food["'],\s*["']transport["'],\s*["']shopping["'],\s*["']bills["'],\s*["']transfer["']""")
OLD_FOOD = re.compile(r"""["']food["']""")
ALLOWED = {"backend/classifier/categories.py"}


def _source_files():
    for base, patterns in [("backend", ["*.py"]), ("frontend/src", ["*.ts", "*.tsx", "*.json"])]:
        for pattern in patterns:
            for path in (ROOT / base).rglob(pattern):
                rel = path.relative_to(ROOT).as_posix()
                if "/tests/" in rel or "node_modules" in rel or rel in ALLOWED:
                    continue
                yield rel, path


def test_no_hard_coded_old_category_list():
    hits = []
    for rel, path in _source_files():
        text = path.read_text(encoding="utf-8")
        if OLD_LIST.search(text) or OLD_FOOD.search(text):
            hits.append(rel)
    assert hits == []


# ---- API -------------------------------------------------------------------


def test_categories_endpoint(client):
    en = client.get("/api/categories").json()
    assert [c["key"] for c in en["categories"]] == cat.keys()
    assert en["categories"][0] == {"key": "groceries", "group": "needs", "bucket": "needs",
                                   "color": cat.color_of("groceries"), "name": "Groceries"}
    assert [g["name"] for g in en["groups"]] == ["Needs", "Wants", "Transfers"]
    assert en["other_color"] == cat.OTHER_COLOR
    id_ = client.get("/api/categories", params={"lang": "id"}).json()
    assert id_["categories"][0]["name"] == "Kebutuhan harian"
    assert client.get("/api/categories", params={"lang": "xx"}).json() == en


def test_report_rows_with_old_keys_are_migrated(client):
    assert ReportRow(id=0, date=None, description="x", amount=1.0, predicted="food", confidence=1.0,
                     needs_review=False, source="rule").predicted == "eating_out"
    rows = [
        {"id": 0, "date": "2026-09-01", "description": "WARUNG CONTOH", "amount": 20_000, "predicted": "food",
         "confidence": 1.0, "needs_review": False, "source": "rule"},
        {"id": 1, "date": "2026-09-02", "description": "TRSF KE CONTOH", "amount": 50_000, "predicted": "transfer",
         "confidence": 1.0, "needs_review": False, "source": "model"},
    ]
    resp = client.post("/api/report", json={"rows": rows})
    assert resp.status_code == 200
    summary = resp.text.split("\n\n", 1)[0]
    assert "eating_out,1,20000.0" in summary and "other_transfer,1,50000.0" in summary
    ins = client.post("/api/insights", json={"rows": rows}).json()
    assert ins["budget_503020"]["wants"] == 20_000 and ins["budget_503020"]["other_out"] == 50_000
