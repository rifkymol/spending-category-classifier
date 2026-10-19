"""Spending insights from one statement: cash flow, top merchants, small spends, fees,
a 50/30/20 view, monthly figures for a what-if, and a few plain-English highlights.

Pure functions: no I/O and no logging, so the API can call them on in-memory rows.
Every metric returns the numbers behind it. These are budgeting insights, not
financial advice: no product or investment suggestions anywhere.

Conventions (the same as summarize() in the API):
- Rows with direction "CR" are money in. Every other row (DB, or no direction as in
  CSV uploads) is money out.
- Amounts use abs(). Rows without an amount are counted but add 0 to totals.
- "Living spend" is money out that is not a transfer. Transfers mix savings, rent and
  payments to people, so they are shown on their own and never in top merchants.

50/30/20 in Rupiah (budget_503020), all per month:
- income_monthly: the user's income_override when it is given and > 0, else money in
  scaled to one month (money_in x months_factor), else None (e.g. a CSV upload).
- target_amounts: TARGETS x income_monthly (needs 50%, wants 30%, savings 20%).
- actual_amounts: needs and wants are their spend per month. Savings is
  income_monthly - all money out per month. Transfers count as money out there, not as
  savings: they stay "unclassified" and are shown on their own.
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
from .i18n import category_name, t
from .pipeline import clean_description

SMALL_SPEND_THRESHOLD = 50_000
NEEDS = {"bills", "transport"}
WANTS = {"food", "shopping"}
TRANSFER = "transfer"
CATEGORIES = ["food", "transport", "shopping", "bills", "transfer"]
TARGETS = {"needs": 0.5, "wants": 0.3, "savings": 0.2}
DAYS_PER_MONTH = 30.4375
TOP_N = 5
MAX_HIGHLIGHTS = 5
SMALL_SPEND_HIGHLIGHT_SHARE = 0.15
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
        if r["category"] == TRANSFER:
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


def _highlights(cash: dict, cat_totals: dict, small: dict, fees: dict, top: dict, budget: dict,
                lang: str = "en") -> list[dict]:
    out = []
    living = cash["living_spend"]

    living_cats = {c: v for c, v in cat_totals.items() if c != TRANSFER and v > 0}
    if living_cats:
        cat, total = max(living_cats.items(), key=lambda kv: kv[1])
        out.append({
            "text": t(lang, "hl_biggest", cat=category_name(lang, cat), amount=format_rp(total),
                      pct=_pct(total / living)),
            "impact_rp": _r(total),
        })

    if cash["money_in"] > 0:
        net = cash["net"]
        if net >= 0:
            text = t(lang, "hl_kept", net=format_rp(net), money_in=format_rp(cash["money_in"]),
                     rate=_pct(cash["savings_rate"]))
        else:
            text = t(lang, "hl_overspent", amount=format_rp(-net), money_in=format_rp(cash["money_in"]))
        out.append({"text": text, "impact_rp": _r(abs(net))})

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

    if cash["transfers_out"] > 0:
        out.append({"text": t(lang, "hl_transfers", amount=format_rp(cash["transfers_out"])),
                    "impact_rp": cash["transfers_out"]})

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
    """The 50/30/20 view: statement-period amounts and shares, plus per-month Rupiah targets,
    actuals and differences when there is an income (see the module docstring)."""
    transfers_out = cat_totals.get(TRANSFER, 0.0)
    needs = sum(cat_totals.get(c, 0.0) for c in NEEDS)
    wants = sum(cat_totals.get(c, 0.0) for c in WANTS)

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
    savings = basis_amount - total_out if income_monthly is not None else None

    def share(value):
        return round(value / basis_amount, 4) if value is not None and basis_amount > 0 else None

    actual = {
        "needs": _r(needs * factor),
        "wants": _r(wants * factor),
        "savings": None if income_monthly is None else _r(income_monthly - total_out * factor),
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
        "unclassified_transfers": _r(transfers_out),
        "basis": basis,
        "basis_amount": _r(basis_amount),
        "shares": {
            "needs": share(needs),
            "wants": share(wants),
            "savings": share(savings),
            "unclassified_transfers": share(transfers_out),
        },
        "targets": dict(TARGETS),
        "mapping": {"needs": sorted(NEEDS), "wants": sorted(WANTS), "unclassified": [TRANSFER]},
        "income_monthly": None if income_monthly is None else _r(income_monthly),
        "income_source": income_source,
        "target_amounts": targets,
        "actual_amounts": actual,
        "transfers_monthly": _r(transfers_out * factor),
        "difference": difference,
    }


def compute_insights(rows, income_override: float | None = None, lang: str = "en") -> dict:
    """Insights for one statement. `rows` are dicts or Row-like objects with date, description,
    amount, predicted and direction. `income_override` is a monthly income the user typed in;
    when > 0 it replaces money in for the 50/30/20 targets. `lang` ("en" or "id") picks the
    language of the highlights and the disclaimer. Returns a JSON-serializable dict."""
    money_in = 0.0
    money_in_count = 0
    spend = []
    dates = []
    for row in rows:
        amount = _field(row, "amount")
        amount = 0.0 if amount is None or pd.isna(amount) else abs(float(amount))
        dates.append(_field(row, "date"))
        if _field(row, "direction") == "CR":
            money_in += amount
            money_in_count += 1
            continue
        spend.append({
            "description": str(_field(row, "description") or ""),
            "amount": amount,
            "category": str(_field(row, "predicted")),
        })

    cat_totals = {c: 0.0 for c in CATEGORIES}
    for r in spend:
        cat_totals[r["category"]] = cat_totals.get(r["category"], 0.0) + r["amount"]
    total_out = sum(r["amount"] for r in spend)
    transfers_out = cat_totals.get(TRANSFER, 0.0)
    living = total_out - transfers_out
    net = money_in - total_out

    cash = {
        "money_in": _r(money_in),
        "money_in_count": money_in_count,
        "total_out": _r(total_out),
        "out_count": len(spend),
        "living_spend": _r(living),
        "transfers_out": _r(transfers_out),
        "net": _r(net),
        "savings_rate": round(net / money_in, 4) if money_in > 0 else None,
    }

    top = _top_merchants(spend)

    small_rows = [r for r in spend if r["category"] != TRANSFER and 0 < r["amount"] < SMALL_SPEND_THRESHOLD]
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
        "small_spends": small,
        "fees": fees,
        "budget_503020": budget,
        "period": period,
        "per_month": per_month,
        "highlights": _highlights(cash, cat_totals, small, fees, top, budget, lang),
        "disclaimer": t(lang, "disclaimer"),
    }
