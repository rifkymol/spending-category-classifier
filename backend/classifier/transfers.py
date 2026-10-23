"""The counterparty of a transfer (transfer_key), for grouping transfers in the insights and for
the "same recipient, same category" memory the CLI saves in a personal model.

Pure functions with no imports from the rest of the package, so both pipeline.py and insights.py
can use them.
"""

import re

# Words in BCA transfer descriptions that say how money moved, not to or from whom. Matched as
# whole words on lowercased text after reference codes, dates and punctuation are removed.
TRANSFER_BOILERPLATE = [
    "trsf", "trf", "transfer", "e banking", "ebanking", "m banking", "mbanking", "m transfer", "internet banking",
    "db", "cr", "bi fast", "bifast", "switching", "llg", "kliring", "skn", "rtgs", "kr otomatis", "kredit otomatis",
    "db otomatis", "debit otomatis", "antar bank", "antarbank", "dari", "ke", "qris", "ref", "ftscy", "ws",
    "tgl", "tanggal", "berita", "rek", "no", "bank", "bca", "bri", "bni", "btn", "mandiri", "cimb", "permata",
]
TRANSFER_WORDS = 4
# Kept upper-case in names ("PT Contoh Jaya", not "Pt Contoh Jaya").
_UPPER_WORDS = {"pt", "cv", "ud", "tbk"}
_CASH_PATTERN = re.compile(r"\b(tarik tunai|atm)\b")
# Keys for transfers without a named counterparty; insights.transfer_name() translates them.
TRANSFER_CASH = "<cash>"
TRANSFER_OTHER = "<other>"

_TRANSFER_BOILERPLATE = [re.compile(rf"\b{re.escape(p)}\b") for p in sorted(TRANSFER_BOILERPLATE, key=len, reverse=True)]


def transfer_key(description: str) -> str:
    """The counterparty of a transfer, for grouping: reference codes, dates, digits and
    transfer boilerplate removed, up to four words title-cased ("TRSF E-BANKING DB
    0309/FTSCY/WS95051 BUDI CONTOH" -> "Budi Contoh"). Cash withdrawals give TRANSFER_CASH and
    descriptions with no name left give TRANSFER_OTHER."""
    text = (description or "").lower()
    if _CASH_PATTERN.search(re.sub(r"[^a-z\s]", " ", text)):
        return TRANSFER_CASH
    text = re.sub(r"\S*[\d/]\S*", " ", text)  # reference codes, dates and numbers ("0309/ftscy/ws95051")
    text = re.sub(r"[^a-z\s]", " ", text)
    text = re.sub(r"\s+", " ", text)
    for pattern in _TRANSFER_BOILERPLATE:
        text = pattern.sub(" ", text)
    words = [w for w in text.split() if len(w) > 1][:TRANSFER_WORDS]
    if not words:
        return TRANSFER_OTHER
    return " ".join(w.upper() if w in _UPPER_WORDS else w.capitalize() for w in words)


def is_named(key: str) -> bool:
    """A real counterparty, not the cash or "no name" placeholder."""
    return key not in (TRANSFER_CASH, TRANSFER_OTHER)
