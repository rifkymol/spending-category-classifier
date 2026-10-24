# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Each version maps to one development phase; commit hashes refer to `main` (phases 4 and 5 landed in one commit).

## [Unreleased]

### Added
- Phase 11.5: remember corrections in the browser (opt-in). A "Your corrections" panel under All transactions has a "Remember my corrections on this device" switch (off by default; localStorage `rememberLabels`), the count of saved corrections, **Import labels file**, **Export labels** and **Forget my corrections** (with a confirmation). When on, every relabel and ✓ is saved in IndexedDB (`scc-labels`, via `frontend/src/lib/labelsStore.ts` only): description, category, direction and a timestamp, no amounts, dates or income. Importing an old labels file maps old keys like the backend; old food/transfer rows become review hints, not confirmed labels. EN/ID text.
- Phase 11.5: `POST /api/classify` also accepts `application/json` `{file: {content_type, data_b64}, labels}` (12 MB body, 5 MB decoded file, ≤ 20,000 validated labels, no echo). `backend/classifier/personalize.py` trains a throwaway model per request: the synthetic sample plus the labels (weight 3), an exact-match shortcut (new source `label`, confidence 1.0) and recipient memory from transfer labels. Precedence per row: label > non-transfer rule > memory > transfer rule > model; per model: request labels > `MODEL_PATH` > synthetic. The results show "Using N of your corrections". `check-storage.mjs` now allows `rememberLabels` and IndexedDB `scc-labels` in `labelsStore.ts` only. The exported categories JSON carries the migration map.
- Phase 11: 12 categories in three groups. Needs: groceries, bills, transport, health, housing; Wants: eating_out, shopping, entertainment; Transfers: savings_transfer (own savings or e-wallet), people_transfer (family and friends), cash, other_transfer. One source of truth, `backend/classifier/categories.py` (key, group, 50/30/20 bucket, color, EN/ID names), used by the classifier, the API's `Category` type, insights and reports; `backend/scripts/export_categories.py` writes `frontend/src/lib/categories.json` for the web app, and `GET /api/categories?lang=` serves the list. Tests check integrity, the exported JSON, ≥ 3:1 color contrast in both themes and that no old hard-coded category list is left.
- Phase 11: rules for groceries (Indomaret, Alfamart, Superindo, Hypermart, pasar, …), health (apotek, Kimia Farma, Guardian, rumah sakit, klinik, Halodoc, BPJS Kesehatan), entertainment (Netflix, Spotify, YouTube Premium, Steam, cinema), housing (kos, kost, sewa, apartemen, IPL), cash (tarik tunai, ATM) and savings_transfer (top-ups of DANA, OVO, GoPay, ShopeePay, LinkAja, Flip, Bibit, Ajaib, Bareksa, reksa dana); the transfer group stays last. people_transfer has no rule.
- Phase 11: a "same recipient, same category" memory. `classify.py train` saves recipient → category for labeled transfer rows (user or rule) inside the personal model file; classification uses it for transfer rows (source `memory`, confidence 1.0, never flagged; non-transfer rules still win). The synthetic model's memory is empty. New `memory` source badge and label source.
- Phase 11: label migration. `train`/`evaluate` map old keys (food → eating_out, transfer → other_transfer, the rest unchanged); old food and transfer rows get `label_source=migrated` and are excluded from training, with a printed count. Report and insights requests with old keys are mapped too, and an old personal model's food/transfer predictions are mapped and flagged for review.
- Phase 11: `top_transfers.by_category` (recipients and sources per transfer category) for the category details panel, and group subtotals in the PDF totals table and an Excel "Totals by group" block.
- Phase 10: a category details panel. Clicking a category in the "Where it went" list (now a list of buttons) or its donut slice opens a dialog (a side panel from the right; a bottom sheet under 640 px) with the category's total, count and share of spend, a prominent "Where the money went" card (the top 5 merchants by total with count, average and share, the biggest one emphasized; for Transfer, "Top recipients (out)" and "Top sources (in)" from the API's `top_transfers`), and its transactions newest first with an "In" badge, the category picker and ✓ "Looks right" on each row. A row relabelled away animates out while the totals, insights and review counts update. Transfer splits into "Out" and "In" with subtotals. It is a proper modal: `role="dialog"`, `aria-modal`, labelled by its heading, a focus trap, Esc / close button / backdrop click to close, focus back on the opener, no page scroll behind, and no animation under `prefers-reduced-motion`. No new dependencies.
- Phase 10: a compact 50/30/20 strip under the chart (needs, wants and savings: actual vs target in Rupiah per month with an income, else shares vs the guideline) with a "Budget details" link to the full card, and an "N transactions need review → Review" prompt that opens the transactions on the "To review" filter.
- Phase 10: top transfers, so rent, debt, family and donations stay trackable. `transfer_key()` names the counterparty of a BCA transfer (reference codes, dates and transfer boilerplate removed; cash withdrawals and unnamed transfers get localized "Cash withdrawal (ATM)" / "Other transfer" keys), and insights gain `top_transfers` (`out_by_total`, `out_by_count`, `in_by_total`: name, count, total, average and share of transfers out or money in). A new highlight names the largest transfer recipient when it is at least 20% of transfers out or 10% of all money out. The Insights section shows "Top transfers" beside "Top merchants" (by total / by count), and the PDF and Excel reports get a "Top transfers (out)" table. Recipient names are never logged (tested).
- Phase 9: 50/30/20 in Rupiah. `budget_503020` gains `income_monthly`, `income_source`, `target_amounts`, `actual_amounts`, `transfers_monthly` and `difference` (target − actual, per month). Income is money in scaled to one month, or an optional `income_override` on `POST /api/insights` and `POST /api/report` (validated as a finite number from 0 to 10^12, never echoed or logged). Savings = income − all money out, so transfers are not counted as savings. New highlights for wants/needs over target and savings short of target.
- Phase 9: the Insights 50/30/20 card has a "Monthly income" field (prefilled from money in, with "Use detected"; not stored) and, per bucket, a bar with a target marker, "Rp actual of Rp target" and "Rp X left" / "Rp X over" / "Rp X short of target" / "On track". The what-if section shows where wants lands after the food and shopping cuts. PDF and Excel 50/30/20 tables get Target, Actual and Difference columns plus an income line.
- Phase 9: English and Bahasa Indonesia. An EN | ID switch (default: the browser language) translates every UI string and aria-label (`frontend/src/lib/messages/{en,id}.json`, `lib/i18n.ts`, no library), category display names (Makanan, Transportasi, Belanja, Tagihan, Transfer; keys stay English), dates and numbers. `?lang=en|id` on `/api/classify`, `/api/insights` and `/api/report` translates highlights, the disclaimer, API error messages and the Excel/PDF reports (`backend/classifier/i18n.py`). The CSV report and the exported labels file stay English (machine formats). Rupiah stays id-ID in both languages.
- Phase 9: a System | Light | Dark theme switch. It sets `data-theme` on `<html>`; an inline head script applies the saved choice before first paint, so there is no flash.
- `frontend/scripts/check-i18n.mjs` (`npm run check:i18n`: same keys, placeholders and plural forms in both languages) and `frontend/scripts/check-storage.mjs` (`npm run check:storage`), both run in CI before lint.
- Portfolio docs: rewritten README, `PRIVACY.md`, `CONTRIBUTING.md`, this changelog and an MIT `LICENSE`.
- GitHub Actions CI: backend tests, frontend lint/typecheck/build, and `docker compose build`.
- Dark mode that follows the system setting (`prefers-color-scheme`); every color is a design token that swaps in dark mode.
- Bundled Inter 4.1 variable font (`frontend/src/app/fonts/`, SIL OFL 1.1), loaded with `next/font/local` and served by the app itself. No runtime font fetch.
- Custom, keyboard-accessible controls with no new dependencies: a category picker (pill + listbox popover with arrow keys, Home/End, type-ahead, Enter/Space, Esc/Tab), segmented controls (report format, table filters, merchant sort) and ranked bar lists.

### Changed
- Phase 11: one savings definition everywhere: saved = left over (money in − total out) + moved to your savings (savings_transfer out); savings rate = saved / money in. `cash_flow` replaces `net` with `left_over`, `moved_to_savings` and `saved` (null without money in); `budget_503020` adds `left_over` and `left_over_monthly`, and its savings equals `cash_flow.saved`. The "You kept…" highlight becomes "You saved Rp X (Y%): Rp A left over + Rp B moved to your savings" (EN/ID); the Insights "Saved" card, the 50/30/20 card and strip, the header's "Saved" share, the Excel cash-flow block and a PDF/Excel "Saved per month" line show the same figure and breakdown.
- Phase 11: housing gets a deep slate-teal (`#3E7274`) instead of an indigo that looked like the Transfers violet, and the group colors become deeper or softer tones (Needs `#1B7298`, Wants `#975B26`, Transfers `#9382C9`) so no group dot matches a category. A new test keeps every category and group color at least 11 CIEDE2000 units apart.
- Phase 11: 50/30/20 v2. needs = the Needs group, wants = the Wants group, savings = income − spending where savings_transfer is not spending (it counts as savings), and people_transfer + cash + other_transfer are "Other money out", shown with their amount. `budget_503020` replaces `unclassified_transfers`/`transfers_monthly` with `savings_transfers`, `other_out`, `savings_transfers_monthly` and `other_out_monthly` (shares too). The transfers highlight becomes "Other money out" plus a new "moved to your own savings" highlight (EN/ID); the PDF/Excel 50/30/20 tables have an "Other money out" row.
- Phase 11: "Where it went" is group first: the donut and list show Needs, Wants and Transfers (total, share, bar), each row expands (keyboard-accessible, `aria-expanded`) to its categories, and an expanded group's ring segment splits into them. Clicking a category opens its details panel as before; every transfer category shows its recipients and sources.
- Phase 11: the category picker is grouped under Needs / Wants / Transfers headers (`role="group"` labelled by the header), scrolls on short screens, and its type-ahead matches typed text against the start of any word across all groups. The 50/30/20 strip and card show "Other money out"; the what-if sliders cover the Needs and Wants categories.
- Phase 11: category names now come from the categories source in both languages (e.g. Kebutuhan harian, Makan di luar, Ke tabungan atau dompet digital sendiri); the old `cat.*` message keys are gone. New 12-color palette: cool hues for Needs, warm for Wants, violet and grays for Transfers.
- Phase 11: the synthetic sample has 81 rows covering every category (≥ 6 each), and the BCA test fixture covers groceries, eating out, health, entertainment, savings transfers and cash.
- Phase 10: main things first. The results page shows the hero and stats, the donut and category list, the 50/30/20 strip and the review prompt; the full Insights and "All transactions" (table, filters, Export labels) start collapsed in accessible disclosure sections (`aria-expanded`/`aria-controls`, a height transition that is off under reduced motion) with a summary line each. The open/closed state is never stored and resets on Start over.
- Phase 10: the donut has no floating tooltip any more. Hovering a slice or a list row still highlights it and shows that category's share in the center; otherwise the center shows the total spend (short Rupiah, e.g. "Rp 6,9 jt", plus the full amount). A click or tap opens the category details.
- Phase 10: the "Top merchants" note now points to the new "Top transfers" list instead of saying transfers are left out.
- Browser storage: the app now remembers two UI preferences, `lang` and `theme`, in `localStorage` (a documented exception; see PRIVACY.md). No financial data is ever stored, and `check-storage.mjs` fails on any other key or storage API.
- `budget_503020.basis` can be `income_override` when an income is entered; shares are then of that income. Without any income the 50/30/20 card keeps the share-of-total-out view.
- Minimal UI redesign: less boxing, hairline dividers, a warm off-white canvas with near-black ink and a teal accent, larger hero figures with tabular numbers, and 150–200 ms motion that is turned off under `prefers-reduced-motion`.
- Results header: a hero "Spent" amount with the statement period and an inline stat line, replacing the stat cards.
- The donut is slimmer with a center label, and a bar list replaces the totals table. The transactions table uses hairline rows, an amber left bar on rows to review, short dates ("22 Sep") and a stacked layout on phones.
- Insights: numbered highlights, a single 50/30/20 bar with guideline marks, merchants as a bar list, quiet callouts, category-colored what-if sliders and the disclaimer as a footnote.
- Calmer category palette (food `#D85A30`, transport `#378ADD`, shopping `#D4537E`, bills `#7F77DD`, transfer `#1D9E75`, other `#888780`), kept in sync between the web app and the Excel/PDF reports.

## [0.8.0] - 2026-10-19 (Phase 8a: Unreleased)

### Added
- Spending insights from one statement (`backend/classifier/insights.py`): cash flow and savings rate, living spend vs transfers, top 5 merchants by total and by count, small spends under Rp 50,000, bank fees, a 50/30/20 view (needs = bills + transport, wants = food + shopping, transfers unclassified), per-month figures and 3–5 highlights ranked by Rupiah impact.
- `POST /api/insights` (same caps and no-echo validation as `/api/report`); `/api/classify` now returns `insights` too.
- Insights panel in the UI: cash-flow cards, a 50/30/20 bar, top merchants, small-spend and fee callouts, highlights and what-if sliders (0–50% per category). It refreshes after every correction and keeps the last figures if a refresh fails.
- PDF report "Highlights" section and an Excel "Insights" sheet.
- The disclaimer "Budgeting insights, not financial advice." in the UI and reports.

## [0.7.0] - 2026-10-19 (Phase 7: `767b369`, `3c2ac87`, `0baf046`)

### Added
- Labeling tools in the UI: "Looks right" confirmation, "Reviewed X of Y flagged" progress, a "Next to review" filter and client-side **Export labels**.
- CLI `train` and `evaluate` accept several label files and wildcards, keep only `user`/`rule` labels, and include the synthetic sample by default.
- Personal models loaded through `MODEL_PATH`; `data/labels/` and `models/` gitignored.
- Phase 7 results recorded: a personal model trained on one month of the author's labeled statement, evaluated with aggregate metrics only.

### Changed
- Exact version pins for all Python and npm dependencies, plus a full transitive lock (`backend/requirements-runtime.lock`) used as a pip constraints file.
- Docker base images pinned by digest.
- Review threshold kept at 0.6 until an out-of-month test is done.

## [0.6.0] - 2026-10-18 (Phase 6: `39914e9`)

### Added
- BCA e-statement PDF importer (`pdfplumber`, in memory): multi-line descriptions, page breaks, DB/CR directions, statement period and summary checks.
- BCA abbreviation expansion and noise removal; rules for bank fees and a transfer group checked last.
- Money in (CR) shown but excluded from spending totals.
- Synthetic `reportlab` statement fixture and PDF privacy tests; `pdfminer` loggers capped at `WARNING`.

## [0.5.0] - 2026-10-18 (Phase 5: `1170c3b`)

### Added
- Docker Compose self-hosting: localhost-only ports, read-only non-root containers, `tmpfs`, all capabilities dropped.

## [0.4.0] - 2026-10-18 (Phase 4: `1170c3b`)

### Added
- Reports as CSV, Excel (summary sheet with a pie chart) and A4 PDF, built in memory, with formula-injection protection and size limits.

## [0.3.0] - 2026-10-18 (Phase 3: `53f97e0`)

### Added
- Next.js UI: upload, donut chart, per-category totals, editable review table with a needs-review filter, and report download. Telemetry off; no external fonts or CDNs.

## [0.2.0] - 2026-10-18 (Phase 2: `576c6d9`)

### Added
- FastAPI upload API: in-memory `POST /api/classify` (raw body, 5 MB cap), CSV report endpoint, health check, localhost-only CORS.
- Privacy tests: no files written during an upload, no descriptions or amounts in logs.

## [0.1.0] - 2026-10-18 (Phase 1: `6d50412`)

### Added
- Classifier core: description cleaning, word-boundary keyword rules, TF-IDF (`char_wb`, 2–5) + LogisticRegression, review threshold 0.6.
- CLI with `evaluate`, `train` and `predict`; 40-row synthetic sample.
