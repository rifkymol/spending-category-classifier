"""Synthetic BCA-style e-statement PDFs, built in memory with reportlab.

Mimics the real layout (A4, header block on every page, table header words at the same
x positions, dates at x 44, descriptions at x 89/130/194, right-aligned MUTASI and SALDO,
a DB marker at x 442). All names and numbers are made up.
"""

import io

from reportlab.lib.pagesizes import A4
from reportlab.lib.pdfencrypt import StandardEncryption
from reportlab.pdfgen import canvas

FONT, SIZE, LEADING = "Helvetica", 6, 12  # 6 pt so "TRANSAKSI" at x 89 ends before "DEBIT" at x 130
TEST_PASSWORD = "fixture-only"  # a made-up user password for the encrypted variant

# (date, [(x, text), ...] on the first line, amount, marker, balance, [continuation lines at x 194])
PAGE_1 = [
    ("01/09", [(89, "SALDO AWAL")], None, None, "5,000,000.00", []),
    ("02/09", [(89, "TRANSAKSI"), (130, "DEBIT"), (194, "TGL: 01/09")], "45,000.00", "DB", "4,955,000.00",
     ["QR 936000000000000001", "KFC SUDIRMAN"]),
    ("03/09", [(89, "TRSF"), (130, "E-BANKING DB"), (194, "0309/FTSCY/WS95051")], "250,000.00", "DB", None,
     ["BUDI CONTOH"]),
    ("05/09", [(89, "TRSF"), (130, "E-BANKING CR"), (194, "0509/FTSCY/WS95011")], "7,500,000.00", "CR", "12,205,000.00",
     ["GAJI PT CONTOH"]),
    ("08/09", [(89, "KR OTOMATIS")], "1,000,000.00", None, "13,205,000.00",
     ["LLG-ANTAR BANK"]),
]
CARRIED_OVER = ["DARI CONTOH"]  # continues the last page-1 row, after page 2's header
PAGE_2 = [
    ("10/09", [(89, "TRANSAKSI"), (130, "DEBIT"), (194, "TGL: 09/09")], "120,500.00", "DB", "13,084,500.00",
     ["QRIS 936000000000000002", "SHOPEE INDONESIA"]),
    ("15/09", [(89, "BIAYA ADM")], "10,000.00", "DB", "13,074,500.00", []),
    ("20/09", [(89, "TARIK TUNAI")], "500,000.00", "DB", "12,574,500.00", ["ATM CONTOH 01"]),
]
SUMMARY = [
    ("SALDO AWAL", "5,000,000.00", None),
    ("MUTASI CR", "8,500,000.00", "2"),
    ("MUTASI DB", "925,500.00", "5"),
    ("SALDO AKHIR", "12,574,500.00", None),
]

# What parse_bca_pdf should return, in order.
EXPECTED = [
    ("2026-09-02", "TRANSAKSI DEBIT TGL: 01/09 QR 936000000000000001 KFC SUDIRMAN", 45000.0, "DB", 4955000.0),
    ("2026-09-03", "TRSF E-BANKING DB 0309/FTSCY/WS95051 BUDI CONTOH", 250000.0, "DB", None),
    ("2026-09-05", "TRSF E-BANKING CR 0509/FTSCY/WS95011 GAJI PT CONTOH", 7500000.0, "CR", 12205000.0),
    ("2026-09-08", "KR OTOMATIS LLG-ANTAR BANK DARI CONTOH", 1000000.0, "CR", 13205000.0),
    ("2026-09-10", "TRANSAKSI DEBIT TGL: 09/09 QRIS 936000000000000002 SHOPEE INDONESIA", 120500.0, "DB", 13084500.0),
    ("2026-09-15", "BIAYA ADM", 10000.0, "DB", 13074500.0),
    ("2026-09-20", "TARIK TUNAI ATM CONTOH 01", 500000.0, "DB", 12574500.0),
]
SUMMARY_TOTALS = {"mutasi_cr_total": 8500000.0, "mutasi_cr_count": 2, "mutasi_db_total": 925500.0, "mutasi_db_count": 5}

# Text that must never become part of a row.
NOT_ROWS = ["NAMA CONTOH", "REKENING", "HALAMAN", "PERIODE", "Bersambung", "SALDO AKHIR", "MUTASI DB", "CATATAN"]


def _y(top: float) -> float:
    return A4[1] - top


def _header(c: canvas.Canvas, page: int, pages: int) -> float:
    """Draw the per-page header block and the table header; return the first table line's top."""
    c.setFont(FONT, SIZE)
    left = ["NAMA CONTOH", "JL CONTOH NO 1", "KEL CONTOH", "JAKARTA 10000"]
    right = ["NO. REKENING : 0000000000", f"HALAMAN : {page} / {pages}", "PERIODE : SEPTEMBER 2026",
             "MATA UANG : IDR"]
    for i, text in enumerate(left):
        c.drawString(33, _y(60 + i * LEADING), text)
    for i, text in enumerate(right):
        c.drawString(330, _y(60 + i * LEADING), text)
    notice = [
        "CATATAN:",
        "Apabila nasabah tidak melakukan sanggahan atas Laporan Mutasi Rekening ini sampai dengan",
        "akhir bulan berikutnya, nasabah dianggap telah menyetujui isi Laporan Mutasi Rekening ini.",
    ]
    for i, text in enumerate(notice):
        c.drawString(33, _y(130 + i * LEADING), text)
    for x, text in [(33, "TANGGAL"), (164, "KETERANGAN"), (308, "CBG"), (380, "MUTASI"), (501, "SALDO")]:
        c.drawString(x, _y(190), text)
    return 210


def _row(c: canvas.Canvas, top: float, row) -> float:
    date, first, amount, marker, balance, more = row
    c.drawString(44, _y(top), date)
    for x, text in first:
        c.drawString(x, _y(top), text)
    if amount:
        c.drawRightString(438, _y(top), amount)
    if marker:
        c.drawString(442, _y(top), marker)
    if balance:
        c.drawRightString(558, _y(top), balance)
    for line in more:
        top += LEADING
        c.drawString(194, _y(top), line)
    return top + LEADING


def make_bca_pdf(password: str | None = None) -> bytes:
    buf = io.BytesIO()
    encrypt = StandardEncryption(password, canPrint=1) if password else None
    c = canvas.Canvas(buf, pagesize=A4, encrypt=encrypt)

    top = _header(c, 1, 2)
    for row in PAGE_1:
        top = _row(c, top, row)
    c.drawString(33, _y(top + LEADING), "Bersambung ke Halaman berikut")
    c.showPage()

    top = _header(c, 2, 2)
    for line in CARRIED_OVER:
        c.drawString(194, _y(top), line)
        top += LEADING
    for row in PAGE_2:
        top = _row(c, top, row)
    top += LEADING
    for label, total, count in SUMMARY:
        c.drawString(33, _y(top), label)
        c.drawString(110, _y(top), ":")
        c.drawRightString(200, _y(top), total)
        if count:
            c.drawRightString(240, _y(top), count)
        top += LEADING
    c.showPage()
    c.save()
    return buf.getvalue()


def make_plain_pdf(text: str = "hello") -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.drawString(72, 760, text)
    c.showPage()
    c.save()
    return buf.getvalue()
