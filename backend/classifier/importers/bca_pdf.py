"""BCA e-statement PDF importer.

Reads the PDF in memory (never writes files) and uses word x positions to split each
table line into date, description, amount (MUTASI), DB/CR marker and balance (SALDO).

Layout (A4, one table per page):
- A header block on every page (holder name, address, NO. REKENING, HALAMAN, PERIODE,
  MATA UANG and a notice). Everything above the table header line is skipped.
- Table header words: TANGGAL, KETERANGAN, CBG, MUTASI, SALDO.
- A transaction starts with a `dd/mm` date at the left edge. Lines without a date
  continue the previous transaction's description, also across page breaks.
- The first row is SALDO AWAL (opening balance), which is not a transaction.
- Pages may end with "Bersambung ke Halaman berikut", and the last page has a summary
  block (SALDO AWAL / MUTASI CR / MUTASI DB / SALDO AKHIR). Neither is a transaction;
  the MUTASI totals are kept so callers can check the parsed rows against them.

Privacy: no logging, and exception messages never quote row text. pdfminer logs page
content at DEBUG level, so its loggers are capped at WARNING here.
"""

import io
import logging
import re
from dataclasses import dataclass, field
from datetime import date

import pandas as pd
import pdfplumber
from pdfminer.pdfdocument import PDFPasswordIncorrect
from pdfplumber.utils.exceptions import PdfminerException

for _name in ("pdfminer", "pdfplumber"):
    logging.getLogger(_name).setLevel(logging.WARNING)


class PdfPasswordRequired(ValueError):
    """The PDF needs a password to open."""


class UnsupportedPdf(ValueError):
    """The file is not a readable BCA e-statement PDF."""


@dataclass
class BcaRow:
    date: str | None  # ISO YYYY-MM-DD
    description: str
    amount: float  # always positive; see direction
    direction: str  # "DB" (money out) or "CR" (money in)
    balance: float | None


@dataclass
class BcaStatement:
    rows: list[BcaRow]
    period: str | None  # YYYY-MM
    summary_totals: dict = field(default_factory=dict)  # mutasi_db_total, mutasi_cr_total, *_count


MONTHS = {
    "JANUARI": 1, "FEBRUARI": 2, "MARET": 3, "APRIL": 4, "MEI": 5, "JUNI": 6,
    "JULI": 7, "AGUSTUS": 8, "SEPTEMBER": 9, "OKTOBER": 10, "NOVEMBER": 11, "DESEMBER": 12,
}

# Header word x0/x1 seen on real statements; used when a page has no table header.
DEFAULT_COLUMNS = {"TANGGAL": (33, 73), "KETERANGAN": (164, 220), "CBG": (308, 326), "MUTASI": (380, 412), "SALDO": (501, 529)}

_DATE = re.compile(r"^(\d{2})/(\d{2})$")
_MONEY = re.compile(r"^\d{1,3}(,\d{3})*\.\d{2}$")
_INT = re.compile(r"^\d+$")
_PERIOD = re.compile(r"PERIODE\s*:?\s*([A-Z]+)\s+(\d{4})")
_LINE_TOLERANCE = 2.5  # points of vertical drift between words on one line


@dataclass
class _Columns:
    date_max_x0: float  # a date token starts left of this
    desc_min_x0: float  # continuation lines start at or right of this
    amount_min_x0: float  # MUTASI and the DB/CR marker sit right of this
    balance_split: float  # money tokens centred right of this are SALDO

    @classmethod
    def from_header(cls, cols: dict[str, tuple[float, float]]) -> "_Columns":
        return cls(
            date_max_x0=cols["TANGGAL"][1],
            desc_min_x0=cols["KETERANGAN"][0] - 30,
            amount_min_x0=cols["CBG"][1],
            balance_split=(cols["MUTASI"][1] + cols["SALDO"][0]) / 2,
        )


def _money(text: str) -> float:
    return float(text.replace(",", ""))


def _lines(words: list[dict]) -> list[list[dict]]:
    """Group words into lines by their top edge, each line sorted left to right."""
    lines: list[list[dict]] = []
    for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if lines and abs(w["top"] - lines[-1][0]["top"]) <= _LINE_TOLERANCE:
            lines[-1].append(w)
        else:
            lines.append([w])
    return [sorted(line, key=lambda w: w["x0"]) for line in lines]


def _text(line: list[dict]) -> str:
    return " ".join(w["text"] for w in line)


def _header_columns(line: list[dict]) -> dict[str, tuple[float, float]] | None:
    found = {w["text"].upper(): (w["x0"], w["x1"]) for w in line if w["text"].upper() in DEFAULT_COLUMNS}
    return found if {"TANGGAL", "MUTASI"} <= found.keys() else None


def _is_footer(text: str) -> bool:
    return text.upper().startswith("BERSAMBUNG")


_SUMMARY_LABELS = ("SALDO AWAL", "MUTASI CR", "MUTASI DB", "SALDO AKHIR")


def _summary_label(text: str) -> str | None:
    upper = text.upper()
    return next((label for label in _SUMMARY_LABELS if upper.startswith(label)), None)


def _parse_summary(label: str, line: list[dict], totals: dict) -> None:
    if label not in ("MUTASI DB", "MUTASI CR"):
        return
    key = "db" if label == "MUTASI DB" else "cr"
    tokens = [w["text"] for w in line]
    money_at = next((i for i, t in enumerate(tokens) if _MONEY.match(t)), None)
    if money_at is None:
        return
    totals[f"mutasi_{key}_total"] = _money(tokens[money_at])
    counts = [t for t in tokens[money_at + 1:] if _INT.match(t)]
    if counts:
        totals[f"mutasi_{key}_count"] = int(counts[-1])


def _iso_date(day: str, month: str, period: tuple[int, int] | None) -> str | None:
    if period is None:
        return None
    year, period_month = period
    m = int(month)
    if m > period_month:  # a row from before the period, e.g. December on a January statement
        year -= 1
    try:
        return date(year, m, int(day)).isoformat()
    except ValueError:
        return None


def _start_row(line: list[dict], cols: _Columns) -> dict:
    """Split a dated line into description words, amount, marker and balance."""
    desc, amount, direction, balance = [], None, None, None
    for w in line[1:]:
        text = w["text"]
        in_amount_area = w["x0"] > cols.amount_min_x0
        if in_amount_area and _MONEY.match(text):
            if (w["x0"] + w["x1"]) / 2 > cols.balance_split:
                balance = _money(text)
            else:
                amount = _money(text)
        elif in_amount_area and text.upper() in ("DB", "CR") and amount is not None:
            direction = text.upper()
        else:
            desc.append(text)
    return {"date": _DATE.match(line[0]["text"]), "desc": desc, "amount": amount,
            "direction": direction, "balance": balance}


def _open(data: bytes):
    try:
        pdf = pdfplumber.open(io.BytesIO(data), password="")
        pdf.pages  # forces the document to parse
        return pdf
    except PdfminerException as exc:
        if exc.args and isinstance(exc.args[0], PDFPasswordIncorrect):
            raise PdfPasswordRequired("This PDF is password-protected.") from None
        raise UnsupportedPdf("Could not read the PDF.") from None
    except Exception:
        raise UnsupportedPdf("Could not read the PDF.") from None


def parse_bca_pdf(data: bytes) -> BcaStatement:
    """Parse a BCA e-statement PDF held in memory."""
    period: tuple[int, int] | None = None
    totals: dict = {}
    raw_rows: list[dict] = []
    current: dict | None = None
    header_seen = False

    pdf = _open(data)
    try:
        for page in pdf.pages:
            try:
                words = page.extract_words()
            except Exception:
                raise UnsupportedPdf("Could not read the PDF.") from None
            lines = _lines(words)

            header_at, cols = None, None
            for i, line in enumerate(lines):
                if period is None:
                    m = _PERIOD.search(_text(line).upper())
                    if m and m.group(1) in MONTHS:
                        period = (int(m.group(2)), MONTHS[m.group(1)])
                found = _header_columns(line)
                if found and header_at is None:
                    header_at = i
                    cols = _Columns.from_header({**DEFAULT_COLUMNS, **found})
            header_seen |= header_at is not None
            if cols is None:
                cols = _Columns.from_header(DEFAULT_COLUMNS)

            in_table = header_at is not None
            for line in lines[(header_at + 1) if header_at is not None else 0:]:
                text = _text(line)
                first = line[0]
                if _is_footer(text):
                    break
                if _DATE.match(first["text"]) and first["x0"] < cols.date_max_x0:
                    in_table = True
                    current = _start_row(line, cols)
                    raw_rows.append(current)
                    continue
                label = _summary_label(text)
                if label:
                    _parse_summary(label, line, totals)
                    current = None
                    continue
                if in_table and current is not None and cols.desc_min_x0 <= first["x0"] < cols.amount_min_x0:
                    # `current` carries over pages: a description may continue after the next header.
                    current["desc"].extend(w["text"] for w in line if w["x0"] < cols.amount_min_x0)
    finally:
        pdf.close()

    if not header_seen:
        raise UnsupportedPdf("Not a BCA e-statement.")

    rows = []
    for r in raw_rows:
        desc = " ".join(r["desc"])
        if desc.upper().startswith("SALDO AWAL") or r["amount"] is None:
            continue  # opening balance, or a dated line with no MUTASI
        rows.append(BcaRow(
            date=_iso_date(r["date"].group(1), r["date"].group(2), period),
            description=desc,
            amount=r["amount"],
            direction=r["direction"] or "CR",
            balance=r["balance"],
        ))

    period_text = f"{period[0]:04d}-{period[1]:02d}" if period else None
    return BcaStatement(rows=rows, period=period_text, summary_totals=totals)


def statement_frame(statement: BcaStatement) -> pd.DataFrame:
    """Rows as a DataFrame with date, description, amount and direction columns."""
    return pd.DataFrame(
        [(r.date, r.description, r.amount, r.direction) for r in statement.rows],
        columns=["date", "description", "amount", "direction"],
    )
