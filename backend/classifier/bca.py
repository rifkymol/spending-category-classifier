"""BCA statement vocabulary: abbreviations to expand and boilerplate to drop.

Both work on text that clean_description() has already lowercased and stripped of
digits and punctuation, so "TRSF E-BANKING DB 0309/FTSCY/WS95051" arrives here as
"trsf e banking db ftscy ws".
"""

import re

# Expanded first, in order, as whole phrases. The longer forms give the model and the
# rules one spelling to learn instead of several.
BCA_ABBREVIATIONS = [
    ("trsf", "transfer"),
    ("trf", "transfer"),
    ("kr otomatis", "kredit otomatis"),
    ("db otomatis", "debit otomatis"),
    ("bi fast", "bifast transfer"),
    ("llg", "kliring"),
    ("byr", "bayar"),
    ("adm", "administrasi"),
]

# Dropped after expansion: they appear on most rows, so they carry no category signal.
# "transaksi debit" is BCA's label for card and QR purchases; "tgl" introduces the date;
# "db" / "cr" are direction markers; "ftscy" and "ws" are parts of internal transfer references.
BCA_NOISE = ["transaksi debit", "tgl", "db", "cr", "ftscy", "ws"]


def _phrase(phrase: str) -> re.Pattern:
    return re.compile(rf"\b{re.escape(phrase)}\b")


_ABBREVIATIONS = [(_phrase(short), long) for short, long in BCA_ABBREVIATIONS]
_NOISE = [_phrase(phrase) for phrase in BCA_NOISE]


def normalize_bca(cleaned: str) -> str:
    """Expand BCA abbreviations and drop boilerplate from already-cleaned text."""
    for pattern, long in _ABBREVIATIONS:
        cleaned = pattern.sub(long, cleaned)
    for pattern in _NOISE:
        cleaned = pattern.sub(" ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()
