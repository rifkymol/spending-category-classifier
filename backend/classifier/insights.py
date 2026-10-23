"""Spending insights from one statement: cash flow, top merchants, small spends, fees,
a 50/30/20 view, monthly figures for a what-if, and a few plain-English highlights.

Pure functions: no I/O and no logging, so the API can call them on in-memory rows.
Every metric returns the numbers behind it. These are budgeting insights, not
financial advice: no product or investment suggestions anywhere.

Conventions (the same as summarize() in the API):
- Rows with direction "CR" are money in. Every other row (DB, or no direction as in
  CSV uploads) is money out.
- Amounts use abs(). Rows without an amount are counted but add 0 to totals.
- Categories, groups and 50/30/20 buckets come from categories.py.
- "Living spend" is money out outside the Transfers group (savings_transfer, people_transfer,
  cash, other_transfer). Transfers are shown on their own and never in top merchants.
- Top transfers (top_transfers) group Transfers-group rows by counterparty (transfer_key):
  "out" for money-out transfers (share = share of transfers out) and "in" for money-in rows in
  the Transfers group (share = share of money in), plus the same per transfer category
  (by_category, shares of that category). Rent, debt, family and donations stay trackable.

Saved, one definition everywhere (cash_flow, budget_503020, highlights, reports, UI):
  saved = left over + moved to your savings, where left over = money in - total out and moved to
  your savings = savings_transfer out. Equivalently money in - (total out - savings_transfer).
  savings_rate = saved / money in. Without money in, left_over, saved and savings_rate are None.

50/30/20 v2 in Rupiah (budget_503020), all per month:
- needs = the Needs group, wants = the Wants group.
- savings_transfers = savings_transfer (money moved to the user's own savings or e-wallets).
  It counts as saving, not spending.
- other_out = people_transfer + cash + other_transfer: "Other money out", shown on its own
  with its amount. It is spending for the savings figure, but in neither needs nor wants.
- income_monthly: the user's income_override when it is given and > 0, else money in
  scaled to one month (money_in x months_factor), else None (e.g. a CSV upload).
- target_amounts: TARGETS x income_monthly (needs 50%, wants 30%, savings 20%).
- actual_amounts: needs and wants are their spend per month. Savings is saved per month:
  left_over_monthly (income_monthly - all money out per month) + savings_transfers_monthly. With
  income from money in it equals cash_flow.saved per month.
- difference = target - actual per bucket. For needs and wants a positive difference is
  money left under the target and a negative one is the amount over it. For savings a
  positive difference is how far short of the target savings fell; zero or negative
  means on track.
Without income, income_monthly, target_amounts and difference are None, actual savings is
None, and shares are of total out, as before.
"""

import re

import pandas as pd

from .bca import BCA_NOISE
from .categories import TRANSFERS, by_bucket, by_group, is_transfer, keys
from .i18n import category_name, t
from .pipeline import clean_description
from .transfers import TRANSFER_BOILERPLATE, TRANSFER_CASH, TRANSFER_OTHER, is_named, transfer_key  # noqa: F401

SMALL_SPEND_THRESHOLD = 50_000
NEEDS = by_bucket("needs")
WANTS = by_bucket("wants")
SAVINGS = by_bucket("savings")
OTHER_OUT = by_bucket("other")
TARGETS = {"needs": 0.5, "wants": 0.3, "savings": 0.2}
DAYS_PER_MONTH = 30.4375
TOP_N = 5
MAX_HIGHLIGHTS = 5
SMALL_SPEND_HIGHLIGHT_SHARE = 0.15
RECIPIENT_SHARE_OF_TRANSFERS = 0.20
RECIPIENT_SHARE_OF_OUT = 0.10
DISCLAIMER = t("en", "disclaimer")

# Fee rows, matched on the cleaned description. The bills rules already cover "biaya adm";
# the phrases go through clean_description too, so "biaya adm" matches its expanded form.
FEE_PHRASES = ["biaya adm", "biaya administrasi", "biaya transfer", "biaya bi fast", "admin fee"]

# Words that say how a payment was made, not who was paid. Matched on cleaned text
# (after BCA abbreviations are expanded, so "trsf e banking" arrives as "transfer e banking").
MERCHANT_BOILERPLATE = [
    "transfer e banking", "e banking", "transaksi debit", "kredit otomatis", "debit otomatis",
    "bifast transfer", "transfer", "qris", "qr", "debit", "kartu", "card", "pembayaran", "bayar",
    "payment", "edc",
] + BCA_NOISE
MERCHANT_WORDS = 3

def _phrase(phrase: str) -> re.Pattern:
    return re.compile(rf"\b{re.escape(phrase)}\b")


_FEE_PATTERNS = [_phrase(clean_description(p)) for p in FEE_PHRASES]
_BOILERPLATE = [_phrase(p) for p in MERCHANT_BOILERPLATE]


# ---- helpers ---------------------------------------------------------------


def _field(row, name: str):
    return row.get(name) if isinstance(row, dict) else getattr(row, name, None)


def format_rp(value: float) -> str:
    """Rp 1.234.567 style (id-ID grouping), no decimals."""
    sign = "-" if value < 0 else ""
    return f"{sign}Rp {round(abs(value)):,}".replace(",", ".")


def _pct(share: float) -> str:
    return f"{share * 100:.0f}%"


def _pct1(share: float, lang: str) -> str:
    """Up to one decimal: 0.245 -> "24.5%" ("24,5%" in Indonesian), 0.2 -> "20%"."""
    text = f"{share * 100:.1f}".rstrip("0").rstrip(".")
    return (text.replace(".", ",") if lang == "id" else text) + "%"


def _r(value: float) -> float:
    return round(float(value), 2)


def merchant_key(description: str) -> str:
    """A display name for the merchant: cleaned text minus BCA noise, reference numbers and
    payment boilerplate, first few words title-cased. Empty if nothing meaningful is left."""
    text = clean_description(description or "")
    for pattern in _BOILERPLATE:
        text = pattern.sub(" ", text)
    words = [w for w in text.split() if len(w) > 1]
    return " ".join(words[:MERCHANT_WORDS]).title()


def transfer_name(key: str, lang: str = "en") -> str:
    """Display text for a transfer_key() result."""
    if key == TRANSFER_CASH:
        return t(lang, "transfer_cash")
    if key == TRANSFER_OTHER:
        return t(lang, "transfer_other")
    return key


def is_fee(description: str) -> bool:
    cleaned = clean_description(description or "")
    return any(p.search(cleaned) for p in _FEE_PATTERNS)


def statement_period(dates: list) -> dict:
    """Start/end/days from the rows' dates. ISO dates first, anything else day-first."""
    raw = pd.Series([d for d in dates if d], dtype=object)
    empty = {"start": None, "end": None, "days": None, "months_factor": 1.0}
    if raw.empty:
        return empty
    parsed = pd.to_datetime(raw, errors="coerce", format="ISO8601")
    rest = parsed.isna()
    if rest.any():
        parsed[rest] = pd.to_datetime(raw[rest], errors="coerce", format="mixed", dayfirst=True)
    parsed = parsed.dropna()
    if parsed.empty:
        return empty
    start, end = parsed.min().date(), parsed.max().date()
    days = (end - start).days + 1
    # Figures per month. A statement shorter than a month counts as one month: scaling a
    # few days up to a month would overstate spending.
    months = max(days / DAYS_PER_MONTH, 1.0)
    return {"start": start.isoformat(), "end": end.isoformat(), "days": days, "months_factor": round(1 / months, 6)}


# ---- metrics ---------------------------------------------------------------


def _top_merchants(spend: list[dict]) -> dict:
    groups: dict[str, dict] = {}
    for r in spend:
        if is_transfer(r["category"]):
            continue
        key = merchant_key(r["description"])
        if not key:
            continue
        g = groups.setdefault(key, {"merchant": key, "count": 0, "total": 0.0})
        g["count"] += 1
        g["total"] += r["amount"]
    items = [{**g, "total": _r(g["total"]), "avg": _r(g["total"] / g["count"])} for g in groups.values()]
    by_total = sorted((m for m in items if m["total"] > 0), key=lambda m: (-m["total"], -m["count"], m["merchant"]))
    by_count = sorted(items, key=lambda m: (-m["count"], -m["total"], m["merchant"]))
    return {"by_total": by_total[:TOP_N], "by_count": by_count[:TOP_N]}


def _group_transfers(rows: list[dict], base: float) -> tuple[list[dict], list[dict]]:
    """Transfer rows grouped by transfer_key: (by total, by count), TOP_N each, with the raw
    key kept for now. share = total / base."""
    groups: dict[str, dict] = {}
    for r in rows:
        key = transfer_key(r["description"])
        g = groups.setdefault(key, {"key": key, "count": 0, "total": 0.0})
        g["count"] += 1
        g["total"] += r["amount"]
    items = [{
        "key": g["key"],
        "count": g["count"],
        "total": _r(g["total"]),
        "avg": _r(g["total"] / g["count"]),
        "share": round(g["total"] / base, 4) if base > 0 else None,
    } for g in groups.values()]
    by_total = sorted((m for m in items if m["total"] > 0), key=lambda m: (-m["total"], -m["count"], m["key"]))
    by_count = sorted(items, key=lambda m: (-m["count"], -m["total"], m["key"]))
    return by_total[:TOP_N], by_count[:TOP_N]


def _top_transfers(spend: list[dict], money_in_rows: list[dict], transfers_out: float, money_in: float,
                   lang: str) -> tuple[dict, dict | None]:
    """top_transfers, plus the largest named recipient out (for the highlight; None if none)."""
    out_rows = [r for r in spend if is_transfer(r["category"])]
    in_rows = [r for r in money_in_rows if is_transfer(r["category"])]
    out_by_total, out_by_count = _group_transfers(out_rows, transfers_out)
    in_by_total, _ = _group_transfers(in_rows, money_in)

    def named(items: list[dict]) -> list[dict]:
        return [{"name": transfer_name(m["key"], lang), **{k: v for k, v in m.items() if k != "key"}} for m in items]

    # Per transfer category, for its details panel: shares of that category's out (or in) total.
    by_category = {}
    for category in by_group(TRANSFERS):
        cat_out = [r for r in out_rows if r["category"] == category]
        cat_in = [r for r in in_rows if r["category"] == category]
        if not cat_out and not cat_in:
            continue
        cat_out_total, _ = _group_transfers(cat_out, sum(r["amount"] for r in cat_out))
        cat_in_total, _ = _group_transfers(cat_in, sum(r["amount"] for r in cat_in))
        by_category[category] = {"out_by_total": named(cat_out_total), "in_by_total": named(cat_in_total)}

    recipient = next((m for m in out_by_total if is_named(m["key"])), None)
    top = {"out_by_total": named(out_by_total), "out_by_count": named(out_by_count), "in_by_total": named(in_by_total),
           "by_category": by_category}
    return top, (named([recipient])[0] if recipient else None)


def _highlights(cash: dict, cat_totals: dict, small: dict, fees: dict, top: dict, budget: dict,
                lang: str = "en", recipient: dict | None = None) -> list[dict]:
    out = []
    living = cash["living_spend"]

    living_cats = {c: v for c, v in cat_totals.items() if not is_transfer(c) and v > 0}
    if living_cats:
        cat, total = max(living_cats.items(), key=lambda kv: kv[1])
        out.append({
            "text": t(lang, "hl_biggest", cat=category_name(lang, cat), amount=format_rp(total),
                      pct=_pct(total / living)),
            "impact_rp": _r(total),
        })

    if cash["saved"] is not None:
        saved = cash["saved"]
        if saved < 0:
            text = t(lang, "hl_overspent", amount=format_rp(-saved), money_in=format_rp(cash["money_in"]))
        elif cash["moved_to_savings"] > 0:
            text = t(lang, "hl_saved", saved=format_rp(saved), rate=_pct1(cash["savings_rate"], lang),
                     left_over=format_rp(cash["left_over"]), moved=format_rp(cash["moved_to_savings"]))
        else:
            text = t(lang, "hl_saved_left_over", saved=format_rp(saved), rate=_pct1(cash["savings_rate"], lang),
                     money_in=format_rp(cash["money_in"]))
        out.append({"text": text, "impact_rp": _r(abs(saved))})

    if small["total"] > 0 and small["share_of_living"] is not None and small["share_of_living"] > SMALL_SPEND_HIGHLIGHT_SHARE:
        out.append({
            "text": t(lang, "hl_small", count=small["count"], threshold=format_rp(small["threshold"]),
                      total=format_rp(small["total"]), pct=_pct(small["share_of_living"])),
            "impact_rp": small["total"],
        })

    if fees["total"] > 0:
        key = "hl_fees_one" if fees["count"] == 1 else "hl_fees_many"
        out.append({"text": t(lang, key, total=format_rp(fees["total"]), count=fees["count"]),
                    "impact_rp": fees["total"]})

    if top["by_total"]:
        m = top["by_total"][0]
        key = "hl_merchant_one" if m["count"] == 1 else "hl_merchant_many"
        out.append({
            "text": t(lang, key, merchant=m["merchant"], total=format_rp(m["total"]), count=m["count"],
                      avg=format_rp(m["avg"])),
            "impact_rp": m["total"],
        })

    # With money in, the "saved" highlight already shows the moves to savings in its breakdown.
    if budget["savings_transfers"] > 0 and cash["saved"] is None:
        out.append({"text": t(lang, "hl_saved_transfers", amount=format_rp(budget["savings_transfers"])),
                    "impact_rp": budget["savings_transfers"]})

    if budget["other_out"] > 0:
        out.append({"text": t(lang, "hl_other_out", amount=format_rp(budget["other_out"])),
                    "impact_rp": budget["other_out"]})

    # The largest named transfer recipient, when it is a big part of transfers or of all money out.
    if recipient is not None and (
        recipient["total"] >= RECIPIENT_SHARE_OF_TRANSFERS * cash["transfers_out"]
        or recipient["total"] >= RECIPIENT_SHARE_OF_OUT * cash["total_out"]
    ):
        key = "hl_recipient_one" if recipient["count"] == 1 else "hl_recipient_many"
        out.append({
            "text": t(lang, key, name=recipient["name"], total=format_rp(recipient["total"]), count=recipient["count"],
                      pct=_pct(recipient["total"] / cash["transfers_out"])),
            "impact_rp": recipient["total"],
        })

    # Rupiah targets, per month: needs/wants over their target, savings short of its target.
    diff = budget["difference"]
    if diff is not None:
        targets = budget["target_amounts"]
        for bucket in ("needs", "wants"):
            if diff[bucket] < 0:
                out.append({
                    "text": t(lang, "hl_over_target", bucket=t(lang, f"bucket_{bucket}"), over=format_rp(-diff[bucket]),
                              pct=_pct(TARGETS[bucket]), target=format_rp(targets[bucket])),
                    "impact_rp": _r(-diff[bucket]),
                })
        if diff["savings"] > 0:
            out.append({
                "text": t(lang, "hl_savings_short", short=format_rp(diff["savings"]), pct=_pct(TARGETS["savings"]),
                          target=format_rp(targets["savings"])),
                "impact_rp": _r(diff["savings"]),
            })

    out = [h for h in out if h["impact_rp"] > 0]
    out.sort(key=lambda h: -h["impact_rp"])
    return out[:MAX_HIGHLIGHTS]


def _budget(cat_totals: dict, money_in: float, total_out: float, factor: float, income_override) -> dict:
    """The 50/30/20 v2 view: statement-period amounts and shares, plus per-month Rupiah targets,
    actuals and differences when there is an income (see the module docstring)."""

    def total(bucket_keys: list[str]) -> float:
        return sum(cat_totals.get(c, 0.0) for c in bucket_keys)

    needs, wants = total(NEEDS), total(WANTS)
    savings_transfers, other_out = total(SAVINGS), total(OTHER_OUT)

    if income_override is not None and income_override > 0:
        income_monthly, income_source = float(income_override), "override"
        # Shares of the entered income over the statement period (income per month x months).
        basis, basis_amount = "income_override", income_monthly / factor
    elif money_in > 0:
        income_monthly, income_source = money_in * factor, "money_in"
        basis, basis_amount = "money_in", money_in
    else:
        income_monthly = income_source = None
        basis, basis_amount = "total_out", total_out
    # Saved = left over + moved to your savings (see the module docstring).
    left_over = basis_amount - total_out if income_monthly is not None else None
    savings = left_over + savings_transfers if left_over is not None else None

    def share(value):
        return round(value / basis_amount, 4) if value is not None and basis_amount > 0 else None

    actual = {
        "needs": _r(needs * factor),
        "wants": _r(wants * factor),
        "savings": None if income_monthly is None else _r((income_monthly - total_out * factor) + savings_transfers * factor),
    }
    if income_monthly is None:
        targets = difference = None
    else:
        targets = {k: _r(v * income_monthly) for k, v in TARGETS.items()}
        difference = {k: _r(targets[k] - actual[k]) for k in TARGETS}

    return {
        "needs": _r(needs),
        "wants": _r(wants),
        "savings": None if savings is None else _r(savings),
        "left_over": None if left_over is None else _r(left_over),
        "savings_transfers": _r(savings_transfers),
        "other_out": _r(other_out),
        "basis": basis,
        "basis_amount": _r(basis_amount),
        "shares": {
            "needs": share(needs),
            "wants": share(wants),
            "savings": share(savings),
            "savings_transfers": share(savings_transfers),
            "other_out": share(other_out),
        },
        "targets": dict(TARGETS),
        "mapping": {"needs": list(NEEDS), "wants": list(WANTS), "savings": list(SAVINGS), "other": list(OTHER_OUT)},
        "income_monthly": None if income_monthly is None else _r(income_monthly),
        "income_source": income_source,
        "target_amounts": targets,
        "actual_amounts": actual,
        "left_over_monthly": None if income_monthly is None else _r(income_monthly - total_out * factor),
        "savings_transfers_monthly": _r(savings_transfers * factor),
        "other_out_monthly": _r(other_out * factor),
        "difference": difference,
    }


def compute_insights(rows, income_override: float | None = None, lang: str = "en") -> dict:
    """Insights for one statement. `rows` are dicts or Row-like objects with date, description,
    amount, predicted and direction. `income_override` is a monthly income the user typed in;
    when > 0 it replaces money in for the 50/30/20 targets. `lang` ("en" or "id") picks the
    language of the highlights and the disclaimer. Returns a JSON-serializable dict."""
    money_in = 0.0
    money_in_count = 0
    money_in_rows = []
    spend = []
    dates = []
    for row in rows:
        amount = _field(row, "amount")
        amount = 0.0 if amount is None or pd.isna(amount) else abs(float(amount))
        dates.append(_field(row, "date"))
        if _field(row, "direction") == "CR":
            money_in += amount
            money_in_count += 1
            money_in_rows.append({
                "description": str(_field(row, "description") or ""),
                "amount": amount,
                "category": str(_field(row, "predicted")),
            })
            continue
        spend.append({
            "description": str(_field(row, "description") or ""),
            "amount": amount,
            "category": str(_field(row, "predicted")),
        })

    cat_totals = {c: 0.0 for c in keys()}
    for r in spend:
        cat_totals[r["category"]] = cat_totals.get(r["category"], 0.0) + r["amount"]
    total_out = sum(r["amount"] for r in spend)
    transfers_out = sum(v for c, v in cat_totals.items() if is_transfer(c))
    living = total_out - transfers_out
    # Saved = left over + moved to your savings; only defined when money came in.
    moved = sum(cat_totals.get(c, 0.0) for c in SAVINGS)
    left_over = money_in - total_out if money_in > 0 else None
    saved = left_over + moved if left_over is not None else None

    cash = {
        "money_in": _r(money_in),
        "money_in_count": money_in_count,
        "total_out": _r(total_out),
        "out_count": len(spend),
        "living_spend": _r(living),
        "transfers_out": _r(transfers_out),
        "left_over": None if left_over is None else _r(left_over),
        "moved_to_savings": _r(moved),
        "saved": None if saved is None else _r(saved),
        "savings_rate": round(saved / money_in, 4) if saved is not None else None,
    }

    top = _top_merchants(spend)
    transfers, recipient = _top_transfers(spend, money_in_rows, transfers_out, money_in, lang)

    small_rows = [r for r in spend if not is_transfer(r["category"]) and 0 < r["amount"] < SMALL_SPEND_THRESHOLD]
    small_total = sum(r["amount"] for r in small_rows)
    small = {
        "threshold": SMALL_SPEND_THRESHOLD,
        "count": len(small_rows),
        "total": _r(small_total),
        "share_of_living": round(small_total / living, 4) if living > 0 else None,
    }

    fee_rows = [r for r in spend if is_fee(r["description"])]
    fees = {"count": len(fee_rows), "total": _r(sum(r["amount"] for r in fee_rows))}

    period = statement_period(dates)
    factor = 1 / max(period["days"] / DAYS_PER_MONTH, 1.0) if period["days"] else 1.0
    per_month = {c: _r(v * factor) for c, v in cat_totals.items()}
    budget = _budget(cat_totals, money_in, total_out, factor, income_override)

    return {
        "cash_flow": cash,
        "top_merchants": top,
        "top_transfers": transfers,
        "small_spends": small,
        "fees": fees,
        "budget_503020": budget,
        "period": period,
        "per_month": per_month,
        "highlights": _highlights(cash, cat_totals, small, fees, top, budget, lang, recipient),
        "disclaimer": t(lang, "disclaimer"),
    }
