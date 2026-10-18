"""Spending category classifier: rules first, then a TF-IDF + logistic regression model."""

from .pipeline import (
    CONFIDENCE_THRESHOLD,
    OUTPUT_COLUMNS,
    RULES,
    apply_rules,
    build_model,
    classify,
    clean_description,
    load_transactions,
)

__all__ = [
    "CONFIDENCE_THRESHOLD",
    "OUTPUT_COLUMNS",
    "RULES",
    "apply_rules",
    "build_model",
    "classify",
    "clean_description",
    "load_transactions",
]
