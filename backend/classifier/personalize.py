"""A throwaway model per request, from the corrections the user's browser sends with an upload.

The frontend can keep the user's own corrections in the browser (opt-in, see CLAUDE.md rule 7)
and send them with each upload. This module turns them into:
- a model trained on the synthetic sample plus the labels, the labels weighted higher;
- an exact-match shortcut: a row whose normalized description was labeled gets that label;
- the "same recipient, same category" memory (pipeline.build_recipient_memory) from transfer labels.

Everything lives in memory for one request and is dropped with the response: nothing is written,
logged or cached. Pure functions, like pipeline.py.

Hints are labels imported from an old labels file whose key changed meaning (food, transfer): they
are not trusted, so they never train the model. A row matching only a hint gets the hint's category
but stays flagged for review.
"""

import re
from dataclasses import dataclass, field

import pandas as pd

from .categories import is_transfer
from .pipeline import MEMORY_ATTR, build_model, build_recipient_memory, clean_description

# How much more one user label counts than one synthetic row in training.
LABEL_WEIGHT = 3.0
LABEL_SOURCE = "label"


def label_key(description: str) -> str:
    """The description as the exact-match shortcut sees it: words with digits (reference codes,
    dates, amounts) dropped, then cleaned like any description ("QR 9 TOKO CONTOH 0310" and
    "QR 12 TOKO CONTOH 1102" match)."""
    return clean_description(re.sub(r"\S*\d\S*", " ", (description or "").lower()))


@dataclass
class RequestModel:
    """The per-request model, its exact matches (by key and direction) and the hints."""

    model: object
    exact: dict[tuple[str, str | None], str] = field(default_factory=dict)
    hints: dict[tuple[str, str | None], str] = field(default_factory=dict)
    trained_on: int = 0  # confirmed labels used for training (0 = the base model is reused)


def _lookup(table: dict, any_direction: dict, key: str, direction) -> str | None:
    """A label for this key and direction; a label without a direction applies to both, and a row
    without a direction (CSV) matches a label of either direction."""
    d = direction if direction in ("DB", "CR") else None
    found = table.get((key, d)) or (table.get((key, None)) if d else None)
    if found is None and d is None:
        found = any_direction.get(key)
    return found


def build_request_model(labels: list[dict], base: pd.DataFrame, fallback_model) -> RequestModel:
    """Train the per-request model from `labels` (dicts with description, category, direction and
    an optional hint flag; categories already validated) and the `base` training rows
    (description, category). With no confirmed labels, `fallback_model` is kept as is.
    Later labels win when two have the same key and direction."""
    confirmed = [lab for lab in labels if not lab.get("hint")]
    exact, hints = {}, {}
    for lab in labels:
        target = hints if lab.get("hint") else exact
        key = label_key(lab["description"])
        if key:
            target[(key, lab.get("direction"))] = lab["category"]

    if not confirmed:
        return RequestModel(fallback_model, exact, hints)

    texts = list(base["description"].map(clean_description)) + [clean_description(lab["description"]) for lab in confirmed]
    targets = list(base["category"]) + [lab["category"] for lab in confirmed]
    weights = [1.0] * len(base) + [LABEL_WEIGHT] * len(confirmed)
    model = build_model().fit(texts, targets, logisticregression__sample_weight=weights)

    memory_rows = pd.DataFrame(
        {
            "description": [lab["description"] for lab in confirmed],
            "category": [lab["category"] for lab in confirmed],
            "label_source": "user",
        }
    )
    setattr(model, MEMORY_ATTR, build_recipient_memory(memory_rows[memory_rows["category"].map(is_transfer)]))
    return RequestModel(model, exact, hints, len(confirmed))


def apply_labels(result: pd.DataFrame, request_model: RequestModel) -> pd.DataFrame:
    """Overlay the exact-match labels on classify()'s output: a confirmed label wins over every
    rule, the memory and the model (source "label", no review). A hint fills in rows no confirmed
    label matched (source "label", flagged for review)."""
    if not len(result) or not (request_model.exact or request_model.hints):
        return result
    out = result.copy()
    keys = out["description"].fillna("").astype(str).map(label_key)
    directions = out["direction"] if "direction" in out.columns else pd.Series([None] * len(out), index=out.index)

    any_exact = {k: c for (k, _), c in request_model.exact.items()}
    any_hint = {k: c for (k, _), c in request_model.hints.items()}
    for idx in out.index:
        key = keys[idx]
        if not key:
            continue
        found = _lookup(request_model.exact, any_exact, key, directions[idx])
        if found is not None:
            out.at[idx, "predicted"] = found
            out.at[idx, "source"] = LABEL_SOURCE
            out.at[idx, "needs_review"] = False
            continue
        hint = _lookup(request_model.hints, any_hint, key, directions[idx])
        if hint is not None:
            out.at[idx, "predicted"] = hint
            out.at[idx, "source"] = LABEL_SOURCE
            out.at[idx, "needs_review"] = True
    return out
