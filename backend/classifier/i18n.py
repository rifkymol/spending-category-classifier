"""User-facing backend text in English and Indonesian: highlights, the disclaimer, the
50/30/20 labels (category and group names come from categories.py), report headings and labels, and API error messages.

`lang` is "en" or "id"; anything else falls back to English. Rupiah amounts are always
written id-ID style ("Rp 1.234.567") in both languages. A test checks that both
dictionaries have the same keys.
"""

from . import categories

LANGS = ("en", "id")
DEFAULT_LANG = "en"

STRINGS: dict[str, dict[str, str]] = {
    "en": {
        # buckets (category and group names live in categories.py)
        "bucket_needs": "Needs",
        "bucket_wants": "Wants",
        "bucket_savings": "Savings",
        "bucket_other": "Other money out",
        "bucket_needs_long": "Needs (essentials)",
        "bucket_wants_long": "Wants (lifestyle)",
        "bucket_savings_long": "Savings (left over + moved to savings)",
        "bucket_other_long": "Other money out (family, cash, other transfers)",
        # highlights
        "hl_biggest": "{cat} was your biggest spending category at {amount} ({pct} of living spend).",
        "hl_saved": "You saved {saved} ({rate}): {left_over} left over + {moved} moved to your savings.",
        "hl_saved_left_over": "You saved {saved} ({rate}) of the {money_in} that came in, all of it left over.",
        "hl_overspent": "Your spending was {amount} more than the {money_in} that came in this period.",
        "hl_small": "{count} purchases under {threshold} added up to {total} ({pct} of living spend).",
        "hl_fees_one": "You paid {total} in bank fees across {count} transaction.",
        "hl_fees_many": "You paid {total} in bank fees across {count} transactions.",
        "hl_merchant_one": "Your top merchant was {merchant}: {total} over {count} payment (about {avg} each).",
        "hl_merchant_many": "Your top merchant was {merchant}: {total} over {count} payments (about {avg} each).",
        "hl_other_out": "{amount} went to family and friends, cash and other transfers. It is shown as other "
                        "money out, not as living spend.",
        "hl_saved_transfers": "You moved {amount} to your own savings or e-wallets. It counts as savings, "
                              "not spending.",
        "hl_over_target": "{bucket} were {over} a month over the {pct} target ({target}).",
        "hl_savings_short": "Savings were {short} a month short of the {pct} target ({target}).",
        "hl_recipient_one": "Your largest transfer recipient was {name}: {total} over {count} payment "
                            "({pct} of transfers).",
        "hl_recipient_many": "Your largest transfer recipient was {name}: {total} over {count} payments "
                             "({pct} of transfers).",
        "transfer_cash": "Cash withdrawal (ATM)",
        "transfer_other": "Other transfer",
        "disclaimer": "Budgeting insights, not financial advice.",
        # reports
        "report_title": "Spending report",
        "report_footer": "Generated locally. No data left this computer.",
        "page": "Page {n}",
        "generated": "Generated",
        "generated_on": "Generated {date}",
        "period": "Period",
        "period_range": "{start} to {end}",
        "total_spend": "Total spend",
        "transactions": "Transactions",
        "needs_review": "Needs review",
        "rows_needing_review": "Rows needing review",
        "money_in": "Money in",
        "money_in_transactions": "Money-in transactions",
        "money_in_line": "Money in: {amount} ({count} transactions, not counted as spend)",
        "share_by_category_amount": "Share of spend by category",
        "share_by_category_count": "Share of transactions by category",
        "spend_by_category": "Spend by category",
        "transactions_by_category": "Transactions by category",
        "totals_by_category": "Totals by category",
        "totals_by_group": "Totals by group",
        "subtotal": "{group} subtotal",
        "col_category": "Category",
        "col_group": "Group",
        "col_count": "Count",
        "col_total": "Total",
        "col_share": "Share",
        "col_date": "Date",
        "col_description": "Description",
        "col_amount": "Amount",
        "col_source": "Source",
        "col_average": "Average",
        "col_target": "Target",
        "col_actual": "Actual",
        "col_difference": "Difference",
        "col_guideline": "Guideline",
        "col_bucket": "Bucket",
        "col_merchant": "Merchant",
        "col_recipient": "Recipient",
        "col_highlight": "Highlight",
        "col_impact": "Impact",
        "src_rule": "rule",
        "src_model": "model",
        "src_memory": "memory",
        "highlights": "Highlights",
        "no_highlights": "Not enough amounts in this statement for highlights.",
        "budget_view": "50/30/20 view",
        "top_merchants_total": "Top merchants by total",
        "top_transfers_out": "Top transfers (out)",
        "review_note": "* needs review",
        "money_in_note": "; + money in",
        "sheet_summary": "Summary",
        "sheet_transactions": "Transactions",
        "sheet_insights": "Insights",
        "insights": "Insights",
        "cash_flow": "Cash flow",
        "total_out": "Total out",
        "living_spend": "Living spend",
        "transfers_out": "Transfers out",
        "left_over": "Left over",
        "moved_to_savings": "Moved to your savings",
        "saved": "Saved",
        "savings_rate": "Savings rate",
        "saved_breakdown": "Saved per month: {saved} = {left_over} left over + {moved} moved to your savings.",
        "small_spends": "Small spends",
        "small_under_count": "Under {threshold}: count",
        "small_total": "Small spends total",
        "small_share": "Share of living spend",
        "fees": "Fees",
        "fee_count": "Fee count",
        "fees_total": "Fees total",
        "idr": "IDR",
        "per_month": "per month",
        "income_line": "Income (per month): {amount} ({source})",
        "income_detected": "detected from money in",
        "income_entered": "entered",
        "income_none": "Income (per month): not available. Enter a monthly income to see Rupiah targets.",
        "budget_caption_income": "Target, Actual and Difference are per month. Share = share of income. "
                                 "Saved = left over (income - all money out) + money moved to your own savings or "
                                 "e-wallets. Other money out (family, cash, other transfers) is shown on its own.",
        "budget_caption_total_out": "Actual is per month. Share = share of total out (no income found).",
        "diff_left": "{amount} left",
        "diff_over": "{amount} over",
        "diff_short": "{amount} short",
        "diff_on_track": "On track",
        "diff_note": "Difference = target - actual. Needs/wants: positive = under budget (left), negative = over. "
                     "Savings: positive = short of target, zero or negative = on track.",
        # API errors
        "err_too_large": "{what} is larger than {mb} MB.",
        "err_what_file": "File",
        "err_what_request": "Request",
        "err_encoding": "Could not read the file. Save it as UTF-8 CSV.",
        "err_csv_parse": "Could not parse the file as CSV.",
        "err_csv_columns": "CSV must have a 'description' column. Columns found: {found}",
        "err_pdf_password": "This PDF is password-protected. Save a copy without the password and upload that.",
        "err_pdf_unsupported": "Only BCA e-statement PDFs are supported right now.",
        "err_content_type": "Send the file as the request body with Content-Type: text/csv or application/pdf.",
        "err_empty": "The file is empty.",
        "err_classify": "Classification failed.",
        "err_insights": "Could not compute insights.",
        "err_report": "Could not build the report.",
    },
    "id": {
        "bucket_needs": "Kebutuhan",
        "bucket_wants": "Keinginan",
        "bucket_savings": "Tabungan",
        "bucket_other": "Uang keluar lainnya",
        "bucket_needs_long": "Kebutuhan (pokok)",
        "bucket_wants_long": "Keinginan (gaya hidup)",
        "bucket_savings_long": "Tabungan (sisa + dipindahkan ke tabungan)",
        "bucket_other_long": "Uang keluar lainnya (keluarga, tunai, transfer lain)",
        "hl_biggest": "{cat} adalah kategori pengeluaran terbesar Anda, sebesar {amount} "
                      "({pct} dari biaya hidup).",
        "hl_saved": "Anda menabung {saved} ({rate}): sisa {left_over} + {moved} dipindahkan ke tabungan Anda.",
        "hl_saved_left_over": "Anda menabung {saved} ({rate}) dari {money_in} uang masuk, semuanya berupa sisa.",
        "hl_overspent": "Pengeluaran Anda {amount} lebih besar dari {money_in} uang masuk pada periode ini.",
        "hl_small": "{count} pembelian di bawah {threshold} berjumlah {total} ({pct} dari biaya hidup).",
        "hl_fees_one": "Anda membayar biaya bank {total} dari {count} transaksi.",
        "hl_fees_many": "Anda membayar biaya bank {total} dari {count} transaksi.",
        "hl_merchant_one": "Merchant teratas Anda adalah {merchant}: {total} dari {count} pembayaran "
                           "(sekitar {avg} per pembayaran).",
        "hl_merchant_many": "Merchant teratas Anda adalah {merchant}: {total} dari {count} pembayaran "
                            "(sekitar {avg} per pembayaran).",
        "hl_other_out": "{amount} keluar ke keluarga dan teman, tarik tunai dan transfer lain. Ini ditampilkan "
                        "sebagai uang keluar lainnya, bukan biaya hidup.",
        "hl_saved_transfers": "Anda memindahkan {amount} ke tabungan atau dompet digital sendiri. Ini dihitung "
                              "sebagai tabungan, bukan pengeluaran.",
        "hl_over_target": "{bucket} {over} per bulan di atas target {pct} ({target}).",
        "hl_savings_short": "Tabungan {short} per bulan di bawah target {pct} ({target}).",
        "hl_recipient_one": "Penerima transfer terbesar Anda adalah {name}: {total} dari {count} pembayaran "
                            "({pct} dari transfer).",
        "hl_recipient_many": "Penerima transfer terbesar Anda adalah {name}: {total} dari {count} pembayaran "
                             "({pct} dari transfer).",
        "transfer_cash": "Tarik tunai (ATM)",
        "transfer_other": "Transfer lainnya",
        "disclaimer": "Wawasan anggaran, bukan nasihat keuangan.",
        "report_title": "Laporan pengeluaran",
        "report_footer": "Dibuat di komputer ini. Tidak ada data yang keluar dari komputer ini.",
        "page": "Halaman {n}",
        "generated": "Dibuat",
        "generated_on": "Dibuat {date}",
        "period": "Periode",
        "period_range": "{start} s.d. {end}",
        "total_spend": "Total pengeluaran",
        "transactions": "Transaksi",
        "needs_review": "Perlu ditinjau",
        "rows_needing_review": "Baris yang perlu ditinjau",
        "money_in": "Uang masuk",
        "money_in_transactions": "Transaksi uang masuk",
        "money_in_line": "Uang masuk: {amount} ({count} transaksi, tidak dihitung sebagai pengeluaran)",
        "share_by_category_amount": "Porsi pengeluaran per kategori",
        "share_by_category_count": "Porsi transaksi per kategori",
        "spend_by_category": "Pengeluaran per kategori",
        "transactions_by_category": "Transaksi per kategori",
        "totals_by_category": "Total per kategori",
        "totals_by_group": "Total per kelompok",
        "subtotal": "Subtotal {group}",
        "col_category": "Kategori",
        "col_group": "Kelompok",
        "col_count": "Jumlah",
        "col_total": "Total",
        "col_share": "Porsi",
        "col_date": "Tanggal",
        "col_description": "Keterangan",
        "col_amount": "Nominal",
        "col_source": "Sumber",
        "col_average": "Rata-rata",
        "col_target": "Target",
        "col_actual": "Aktual",
        "col_difference": "Selisih",
        "col_guideline": "Pedoman",
        "col_bucket": "Kelompok",
        "col_merchant": "Merchant",
        "col_recipient": "Penerima",
        "col_highlight": "Sorotan",
        "col_impact": "Dampak",
        "src_rule": "aturan",
        "src_model": "model",
        "src_memory": "memori",
        "highlights": "Sorotan",
        "no_highlights": "Nominal di laporan ini belum cukup untuk sorotan.",
        "budget_view": "Tampilan 50/30/20",
        "top_merchants_total": "Merchant teratas menurut total",
        "top_transfers_out": "Transfer teratas (keluar)",
        "review_note": "* perlu ditinjau",
        "money_in_note": "; + uang masuk",
        "sheet_summary": "Ringkasan",
        "sheet_transactions": "Transaksi",
        "sheet_insights": "Wawasan",
        "insights": "Wawasan",
        "cash_flow": "Arus kas",
        "total_out": "Total keluar",
        "living_spend": "Biaya hidup",
        "transfers_out": "Transfer keluar",
        "left_over": "Sisa",
        "moved_to_savings": "Dipindahkan ke tabungan Anda",
        "saved": "Ditabung",
        "savings_rate": "Tingkat tabungan",
        "saved_breakdown": "Ditabung per bulan: {saved} = sisa {left_over} + {moved} dipindahkan ke tabungan Anda.",
        "small_spends": "Pengeluaran kecil",
        "small_under_count": "Di bawah {threshold}: jumlah",
        "small_total": "Total pengeluaran kecil",
        "small_share": "Porsi dari biaya hidup",
        "fees": "Biaya bank",
        "fee_count": "Jumlah biaya",
        "fees_total": "Total biaya",
        "idr": "IDR",
        "per_month": "per bulan",
        "income_line": "Pendapatan (per bulan): {amount} ({source})",
        "income_detected": "terdeteksi dari uang masuk",
        "income_entered": "diisi manual",
        "income_none": "Pendapatan (per bulan): tidak tersedia. Isi pendapatan bulanan untuk melihat target Rupiah.",
        "budget_caption_income": "Target, Aktual dan Selisih adalah per bulan. Porsi = porsi dari pendapatan. "
                                 "Ditabung = sisa (pendapatan - semua uang keluar) + uang yang dipindahkan ke "
                                 "tabungan atau dompet digital sendiri. Uang keluar lainnya (keluarga, tunai, "
                                 "transfer lain) ditampilkan terpisah.",
        "budget_caption_total_out": "Aktual adalah per bulan. Porsi = porsi dari total keluar "
                                    "(pendapatan tidak ditemukan).",
        "diff_left": "sisa {amount}",
        "diff_over": "lebih {amount}",
        "diff_short": "kurang {amount}",
        "diff_on_track": "Sesuai target",
        "diff_note": "Selisih = target - aktual. Kebutuhan/keinginan: positif = di bawah anggaran (sisa), "
                     "negatif = melebihi. Tabungan: positif = kurang dari target, nol atau negatif = sesuai target.",
        "err_too_large": "{what} lebih besar dari {mb} MB.",
        "err_what_file": "File",
        "err_what_request": "Permintaan",
        "err_encoding": "File tidak dapat dibaca. Simpan sebagai CSV UTF-8.",
        "err_csv_parse": "File tidak dapat dibaca sebagai CSV.",
        "err_csv_columns": "CSV harus memiliki kolom 'description'. Kolom yang ditemukan: {found}",
        "err_pdf_password": "PDF ini dilindungi kata sandi. Simpan salinan tanpa kata sandi, lalu unggah salinan itu.",
        "err_pdf_unsupported": "Saat ini hanya PDF e-statement BCA yang didukung.",
        "err_content_type": "Kirim file sebagai isi permintaan dengan Content-Type: text/csv atau application/pdf.",
        "err_empty": "File kosong.",
        "err_classify": "Klasifikasi gagal.",
        "err_insights": "Wawasan tidak dapat dihitung.",
        "err_report": "Laporan tidak dapat dibuat.",
    },
}


def normalize_lang(value) -> str:
    """"en" or "id"; anything else (missing, "fr", "ID-x") is English."""
    return value if value in LANGS else DEFAULT_LANG


def t(lang: str, key: str, **values) -> str:
    """The text for `key` in `lang`, with {placeholders} filled in."""
    text = STRINGS[normalize_lang(lang)][key]
    return text.format(**values) if values else text


def category_name(lang: str, category: str) -> str:
    """Display name for a category key (from categories.py); unknown keys are capitalized as they are."""
    return categories.name(category, normalize_lang(lang)) or category.capitalize()


def group_name(lang: str, group: str) -> str:
    """Display name for a group key (needs, wants, transfers)."""
    return categories.group_name(group, normalize_lang(lang)) or group.capitalize()
