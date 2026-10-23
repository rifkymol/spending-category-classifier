"""Spending category classifier: rules first, then a TF-IDF + logistic regression model."""

from .pipeline import (
    CONFIDENCE_THRESHOLD,
    MEMORY_ATTR,
    OUTPUT_COLUMNS,
    RULES,
    apply_rules,
    build_model,
    build_recipient_memory,
    classify,
    clean_description,
    load_transactions,
    recipient_memory,
)

__all__ = [
    "CONFIDENCE_THRESHOLD",
    "MEMORY_ATTR",
    "OUTPUT_COLUMNS",
    "RULES",
    "apply_rules",
    "build_model",
    "build_recipient_memory",
    "classify",
    "clean_description",
    "load_transactions",
    "recipient_memory",
]
