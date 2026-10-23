---
name: phase-runbook
description: Phase-by-phase checklist for the spending-category-classifier self-hosted web app (FastAPI + Next.js), with an owner tag on every item ([You], [builder], [auditor], [PM]). Use to pick the next step and to tick items off after verification.
---

# Phase runbook

Owner tags: **[You]** the user, **[builder]** and **[auditor]** the worker agents, **[PM]** the orchestrator session. The PM ticks an item only after a read-only check confirms it. Approval for one item never covers the next. Every phase follows the privacy rules in `CLAUDE.md`.

## Phase 0: decisions

- [x] [You] Decide whether to `git init` this folder (needed for GitHub later). *(2026-10-18: done. Repo on `main`, pushed to github.com/rifkymol/spending-category-classifier; commit 6d50412, 16 files, none sensitive.)*
- [x] [You] Get one BCA export (CSV or PDF). Avoid the app's maintenance window, 00:00–04:00 WIB. Store it in `data/raw/`; remove any PDF password yourself. *(2026-10-18: September e-statement PDF in `data/raw/`; it opens without a password.)*
- [x] [You] Decide who labels ~200 rows and in what tool. *(2026-10-19: the user labels in the app's review table, using Export labels into `data/labels/`.)*
- [x] [You] Approve creating the Python venv and installing dependencies. *(2026-10-18: approved; `.venv` created with `backend/requirements.txt`.)*
- [x] [You] Approve installing Node.js. *(2026-10-18: not needed; Node.js v22.15.0 already installed.)*
- [x] [You] Approve installing Docker Desktop (needed only by Phase 5). *(2026-10-18: not needed; Docker 29.1.5 already installed.)*

## Phase 1: core classifier under `backend/`

- [x] [builder] Create the pipeline module under `backend/` (replaces the planned `src/pipeline.py`) with `clean_description`, `RULES`, `apply_rules` (word-boundary regex `\b...\b`), `build_model`, `CONFIDENCE_THRESHOLD`, `classify(df, model, threshold)` and `load_transactions(path)` (requires a `description` column; clear error that lists the columns found).
- [x] [builder] Move `src/classify.py` into `backend/` as an argparse CLI with:
  - `evaluate`: stratified CV with `n_splits=min(5, smallest class count)`; reports model-only accuracy, rule coverage and precision, combined accuracy, review share, and a `classification_report`.
  - `train`: saves the model via joblib (personal models gitignored).
  - `predict`: `--model`, `--out`, `--threshold 0.6`; no `category` column needed.
- [x] [builder] Add pytest tests covering cleaning, rules including "shellfish" → None, classify on unlabeled data, the loader error, and end-to-end train + predict with `tmp_path`.
- [x] [builder] Housekeeping: add `pytest>=8` to requirements; gitignore personal models (`models/`, `*.joblib`); fix the README link; update `PLAN.md`.
- [x] [auditor] Run pytest, the three CLI commands on `data/sample_transactions.csv`, and `predict` on a copy without the `category` column.
- [x] [PM] Verify the reports and update `state-snapshot`.

*Phase 1 verified 2026-10-18 (auditor, 9/9 checks; PM reran pytest):*
- *pytest: 11 passed.*
- *evaluate (5-fold): model-only 0.68, rule coverage 0.78, rule precision 1.00, combined 1.00, review share 0.23.*
- *train and predict work; predict works without `category`; a missing `description` gives a one-line error.*
- *No print or logging in `backend/classifier/`. The tree is clean, with no `backend/models/`.*
- *README link removed; PLAN.md updated.*

## Phase 2: FastAPI API

- [x] [builder] `POST` upload endpoint: CSV in, JSON out (rows with `predicted`, `confidence`, `needs_review`, plus category totals). Processed in memory only.
- [x] [builder] Report download endpoint.
- [x] [builder] Privacy tests: no files written during an upload; logs contain no descriptions or amounts.
- [x] [auditor] Verify the API and the privacy tests.
- [x] [PM] Verify and update `state-snapshot`.

*Phase 2 verified 2026-10-18 (auditor, 14/14 checks; PM reran pytest and reviewed the code):*
- *pytest: 23 passed.*
- *The API runs on 127.0.0.1. `/api/classify` takes the raw CSV body (not multipart) with a 5 MB cap (413). Errors return 400 and never echo row data.*
- *`/api/report` returns a CSV attachment that reflects corrections.*
- *Privacy: no new files in the project or the system temp dir after uploads; no descriptions or amounts in the server log; CORS allows only localhost:3000; no outbound HTTP; the model is trained in memory on synthetic data.*
- *Follow-ups (not blocking):*
  - *Neutralize spreadsheet formula injection in the report CSV (values starting with `= + - @`); do it in Phase 4.*
  - *Restrict `predicted` in `/api/report` to the 5 categories and cap that request's size.*

## Phase 3: Next.js UI

- [x] [builder] Upload page.
- [x] [builder] Results page with a pie chart (Recharts), per-category totals and an editable review table for flagged rows.
- [x] [builder] Telemetry off (`NEXT_TELEMETRY_DISABLED=1`), no external fonts, CDNs or analytics.
- [x] [auditor] Verify the UI flow and that no outbound requests are made.
- [x] [PM] Verify and update `state-snapshot`.

*Phase 3 verified 2026-10-18 (auditor, 12/12 checks; PM browser walkthrough):*
- *Versions: Next 16.4.2, React 19.3.1, Recharts 3.10.1, Tailwind 4.3.3, all pinned exactly.*
- *Lint, build and tsc are clean. Telemetry is off in every Next script, and the app binds to 127.0.0.1.*
- *No browser storage, and no data in URLs. The source and build contain no external assets or fetches.*
- *Browser walkthrough on 127.0.0.1:3000: the sample upload gives 40 rows, Rp 6.731.990 and 9 to review, with a correct donut chart. Changing a flagged row to bills moves the review count to 8 and recomputes the totals. All network requests went only to 127.0.0.1:3000 and :8000, and the API log holds no row data.*
- *Phone width works (375 px), with no horizontal scroll.*
- *Not tested: the real "Download report" click, which saves a file; `/api/report` itself was verified by curl in Phase 2.*
- *Observation: all 9 flagged rows are transfers (no transfer rules exist); consider adding transfer rules in Phase 7.*

## Phase 4: reports

- [x] [builder] CSV/Excel download of categorized transactions and totals.
- [x] [builder] PDF summary report.
- [x] [auditor] Verify both downloads.

*Phase 4 verified 2026-10-18 (auditor 11/12 plus a fix; PM reran the suite 5x and checked the PDF):*
- *`POST /api/report?format=csv|xlsx|pdf` builds reports in memory with `backend/app/reports.py` (openpyxl 3.1.5, reportlab 5.0.1).*
- *Excel: Summary sheet with a native pie chart, plus a Transactions sheet.*
- *PDF: pie chart, totals and all rows, using only Helvetica/Helvetica-Bold.*
- *Formula injection is neutralized with a `'` prefix; numbers stay numeric.*
- *Report rows only accept the 5 categories. Limits: 10 MB (413) and 50,000 rows (422). Validation errors return no input data.*
- *No new files and no row data in logs.*
- *The UI has a CSV / Excel / PDF picker.*
- *Failure and fix: two privacy tests were flaky.*
  - *The log test matched amount digits inside a raw duration float.*
  - *The temp-dir test saw other programs' `.tmp` files.*
  - *Fixed by checking only formatted log messages and isolating `tempfile.tempdir` per test. The PDF font is now set explicitly, with a test for it.*
- *Suite: 45 passed, 10x by the builder and 5x by the PM.*
- *Not tested: the real browser download click (it saves a file).*

## Phase 5: self-hosting

- [x] [builder] Dockerfiles for backend and frontend plus `docker-compose.yml` (bound to localhost). *(2026-10-18, PM file review. Ports are published as `127.0.0.1:8000` / `127.0.0.1:3000`. Containers are `read_only` with tmpfs `/tmp`, `cap_drop: ALL`, no-new-privileges, `restart: "no"`, no data volumes, and non-root users. `.dockerignore` keeps `data/` except the sample, plus `.venv`, `.claude` and models, out of the images. Not built yet.)*
- [x] [builder] README "run it locally" guide (`docker compose up`, open http://localhost:3000) and a privacy section. *(2026-10-18, written; the builder reports `docker compose config` OK, a standalone build, lint clean and 45 tests passing.)*
- [x] [auditor] Verify `docker compose up` serves the app on localhost.
- [x] [PM] Verify and update `state-snapshot`.

*Phase 5 verified 2026-10-18 (auditor, all checks; user approved the image pulls and the run):*
- *`docker compose build` OK. Image sizes: api 163 MB content, web 85 MB content.*
- *The images contain only `sample_transactions.csv`, with no raw data, joblib or .env.*
- *Docker publishes only 127.0.0.1:8000 and 127.0.0.1:3000.*
- *The app works end to end: health, classify with the CORS header, PDF report. The web bundle points at 127.0.0.1:8000.*
- *Both containers: read-only root filesystem (writes to /app fail, /tmp works), CapDrop ALL, no-new-privileges, non-root (`app` uid 10001 and `node` uid 1000), restart policy no.*
- *Telemetry is off in the web container (NEXT_TELEMETRY_DISABLED=1). The API logs hold no row data.*
- *`docker compose down` is clean, the images are kept, and the project tree is unchanged.*
- *Note: an unrelated local dev server can occupy port 3000. If 127.0.0.1:3000 shows a different app, stop that server first.*
- *Follow-up: pin the base images and Python package versions before publishing (reproducibility; scikit-learn matters for loading personal models).*

## Phase 6: BCA import

- [x] [PM] Research the format from the user's file via an anonymized page or a local masked-structure script (digits and names masked; raw contents never enter the chat).
- [x] [builder] Importer that outputs `date`, `description`, `amount` (CSV via pandas, or text PDF via pdfplumber).
- [x] [auditor] Verify the importer.

*Phase 6 verified 2026-10-18 (auditor 12/12; PM reran the suite, 91 passed):*
- *6a: the user approved the pdfplumber 0.11.10 install in the worker session. The masked scan found a 10-page text PDF with only a permission lock (it opens without a password), 1,234.56 amounts, and columns TANGGAL/KETERANGAN/CBG/MUTASI/SALDO with DB/CR markers and multi-line descriptions.*
- *6b: `classifier/importers/bca_pdf.py` parses in memory, with columns taken from the header positions. It skips the page headers, SALDO AWAL and the summary/footer, takes the year from PERIODE, and raises `PdfPasswordRequired` / `UnsupportedPdf` (400s).*
- *`classifier/bca.py` holds the abbreviation and noise lists. Rules add `biaya adm` → bills and a transfer group checked last.*
- *The API accepts `application/pdf`. CR rows are returned but excluded from category totals; `money_in_total` / `money_in_count` are new. The UI accepts .pdf, shows a Money in card and an In badge, and the CLI `predict` takes a .pdf.*
- *Privacy: pdfminer logs raw page text at DEBUG, so its loggers are now capped at WARNING (caught by a caplog test). The fixture is a synthetic reportlab PDF (NAMA CONTOH / 0000000000). The leak check found no real tokens in the repo, and the server log has 0 real tokens.*
- *Real file (masked): 98 rows (83 DB, 15 CR). DB and CR sums and counts match the statement summary exactly; 0 empty descriptions.*
- *Known quality gap: 48 QR-payment rows to merchants with no rule go to the model (trained on 40 synthetic rows), which calls 38 of them `bills`. They're flagged for review (48 needing review). Phase 7 labeling and merchant rules address this.*
- *Not done: the Docker images need a rebuild to include pdfplumber; no browser upload of the real PDF yet.*

## Phase 7: labeling and tuning

- [x] [builder] Labeling tools and personal training (7a).
  - UI: a ✓ "Looks right" button, "Reviewed X of Y flagged", a "Next to review" filter, and a client-side **Export labels** (CSV Blob with an injection-safe `csv.ts`, never sent to the API) with `label_source` user/rule/model.
  - CLI: `train`/`evaluate` take several CSVs and drop `model` rows; `--with/--no-synthetic`; CV skips categories with fewer than 2 rows.
  - Public chain merchant rules added; transfer still last.
  - `data/labels/` is gitignored.
  - *Verified 2026-10-18: auditor 11/11 checks passed (114 tests twice; lint/tsc/build; export makes no fetch; CSV escaping; the label filter drops 10/10 model rows; rule ordering incl. "toleransi" ≠ tol). PM browser check on 127.0.0.1:3000 with a made-up CSV: ✓ and edit update "Reviewed 2 of 3" and Need review 3→1; the HokBen rule hits.*
  - *Ports stay 3000/8000 by user decision. An unrelated dev server that was holding port 3000 was stopped on request.*
- [x] [You] Label ~200 rows. Start with the September statement (98 rows) in the app, then use Export labels and move the file to `data/labels/`. *(2026-10-19: September is done. 98 rows: user 44, rule 52, model 2. More months still to come, toward ~200.)*
- [x] [auditor] Run `evaluate` on the labeled set. *(2026-10-19, run by the phase7-train builder, metrics only, on 95–96 trainable rows:)*
  - *Synthetic-only model: model-only 0.54, combined 0.56, review share 0.458 (44 rows) at 0.6. Rows the user labeled scored 0.045, and food recall was 0.07.*
  - *Personal (labels + synthetic, 2-fold CV): model-only 0.97, combined 1.00, review share 0.105 at 0.6.*
  - *Labels only: model-only 0.95.*
  - *Threshold sweep: 0 wrong rows unflagged at any threshold. Review share is 0 / 0 / 0.02 / 0.105 / 0.20 / 0.46 for 0.3 to 0.8.*
  - *Caveat: these are optimistic. It's one month, with only 16 distinct user-labeled descriptions and 2–3 rows for bills/shopping, and CV repeats merchants across folds.*
  - *Trained `models/personal.joblib` (136 rows, gitignored).*
- [x] [PM] Tune the review threshold. The personal model stays local and gitignored. *(2026-10-19: decision is to keep 0.6 for now. The evidence is too thin to lower it, since CV within one month is optimistic. Re-test on the October statement as a true out-of-month check: upload it, count how many flagged rows the user had to change, then decide between 0.5 and 0.6. The PM restarted the dev API with `MODEL_PATH=models/personal.joblib`, and health reports `model: custom`.)*
- [ ] [You] Next month: upload the October statement with the personal model, review it, export labels into `data/labels/`, and report back. The PM then retrains and runs the out-of-month check.

## Phase 8a: spending insights from one statement (approved 2026-10-19)

Goal: an **Insights** panel plus report highlights that turn one uploaded statement into savings/spending suggestions. Computed in memory from the (corrected) rows, using explainable statistics and rules, no stored data, and no financial or investment advice.

**Design**
- **One source of truth:** `backend/classifier/insights.py` holds a pure `compute_insights(rows)`. It's exposed as stateless `POST /api/insights {rows}`, with the same validation and caps as `/api/report`: 10 MB, 50k rows, 5 categories.
  - `/api/classify` also returns initial `insights`, so the first render needs no extra call.
  - The UI re-calls `/api/insights` (debounced) after edits, so corrections flow through.
  - Reports call the same function.
- **Metrics (each one returns the numbers behind it):**
  1. **Cash flow:** money in (CR), total out (DB), net, savings rate = net / money in (null when there's no CR data, e.g. CSV). "Living spend" (excluding transfer) is shown separately from "transfers out", because transfer mixes savings and payments.
  2. **Top merchants:** a merchant key derived from the cleaned description, minus BCA noise and reference numbers. Top 5 by total and top 5 by count, with average ticket size.
  3. **Small-spend leaks:** DB rows under Rp 50,000 (a constant): count, total, share of living spend.
  4. **Fees:** rows matching fee rules (`biaya adm`, admin/transfer fees): count and total.
  5. **50/30/20 view:** needs = bills + transport, wants = food + shopping, as % of money in, with savings = net. Transfers are shown as "unclassified" and the mapping is listed in the UI. The mapping is a constant, easy to change later.
  6. **Monthly normalization:** the period is from the min/max dates, and figures are scaled per month for the what-if.
  7. **Highlights:** 3–5 rule-based sentences ranked by Rp impact, e.g. biggest category, a small-spend leak if > 15%, fees if > 0, savings rate. Each sentence cites its number. No product or investment suggestions.
- **Frontend:** `Insights` panel under the chart.
  - Cash-flow cards and a 50/30/20 bar.
  - The top merchants list.
  - Leak and fee callouts.
  - **What-if sliders:** per category, 0–50% cut → Rp per month and per year, computed client-side from the insights numbers.
  - A disclaimer: "Budgeting insights, not financial advice."
- **Reports:** the PDF gets a "Highlights" section (sentences + 50/30/20 table); the Excel file gets an "Insights" sheet. CSV is unchanged.
- **Privacy:** same rules as before. Nothing is stored; logs hold counts only, and merchant names never appear in logs. Tests enforce this.

**Checklist**
- [x] [You] Approve this plan and the defaults: Rp 50k small-spend threshold, needs = bills + transport, wants = food + shopping. *(2026-10-19: approved as-is, with transfers unclassified.)*
- [x] [builder] `insights.py` + unit tests on synthetic rows: each metric, edge cases (no CR, no amounts, one row, all transfers).
- [x] [builder] The `/api/insights` endpoint, `insights` in the classify response, validation, and privacy tests (no files, no merchant names or amounts in caplog).
- [x] [builder] Frontend Insights panel with what-if sliders and the disclaimer; re-fetch after edits; lint/tsc/build clean.
- [x] [builder] PDF highlights + Excel Insights sheet, with report tests.
- [x] [builder] README features/screenshots note and a CHANGELOG v0.8.0 entry.
- [x] [auditor] Verify the tests, endpoint behaviour, privacy tests and docs accuracy.
- [x] [PM] Browser walkthrough with synthetic data; a masked real-statement check (prints only "sections present: True" and counts, no Rp figures); record; ask before commit.

*Phase 8a verified 2026-10-19:*
- *Auditor 9/9 checks, no fixes: 142 tests twice, and a hand-computed synthetic case matched every field.*
- *Builder judgment calls, accepted: transfers are excluded from small spends and from top merchants; `months_factor` is clamped to ≥ 1 month; savings is null when there's no money in; what-if covers the 4 non-transfer categories; fewer than 3 highlights is possible on sparse data.*
- *PM browser check (synthetic CSV): the panel renders; two "TOKO CONTOH JAYA" QR payments group as one merchant (2×); the food slider at 20% gives Rp 95.200/month and Rp 1.142.400/year (correct); changing INDIHOME bills → shopping re-fetches `/api/insights` and moves needs/wants by Rp 375.000. All requests went to 127.0.0.1 only.*
- *Masked real-statement check (personal model): 98 rows; all 9 sections present; savings rate computed (basis money_in); 5+5 top merchants; 5 highlights; PDF and XLSX reports OK.*
- *The dev servers were restarted on the new build; the API still uses `MODEL_PATH=models/personal.joblib`.*

## Phase UI: minimal redesign (approved 2026-10-19)

Goal: a frontend that is **minimal but more interesting**. Less boxing, stronger typography, a calmer palette, and custom controls instead of plain native dropdowns. No behaviour changes, no new npm dependencies by default, and all privacy rules kept (no external fonts/CDNs, no storage, telemetry off).

**Design direction** (the mockup was shown to the user)
- **Tokens:** design tokens in `globals.css` `@theme`: a warm off-white canvas, near-black ink, hairline borders, one neutral accent, radius scale, and motion durations. Category colors become a calmer harmonious set (teal / violet / pink / coral / blue), defined once in `format.ts` and mirrored in `reports.py` (a test already enforces they match).
- **Typography:** large hero numbers with tabular figures, small muted labels, two weights only. The system font stack is the default; an optional self-hosted font is listed under decisions.
- **Results header:** a hero "Spent Rp X" with the period, plus inline stats (transactions · to review · saved %) instead of three boxed cards.
- **Chart:** a slimmer donut with a center label (the top category and %), with hover/focus highlighting the slice. The totals table becomes a ranked **bar list** (dot, name, amount, thin bar).
- **Category picker (replaces the native `<select>`):**
  - A pill with a color dot, label and chevron. It opens a small popover listbox with color dots and a checkmark on the current value.
  - Keyboard: ↑/↓, Home/End, type-ahead, Enter, Esc. Closes on outside click. ARIA listbox/combobox pattern with focus return. The ✓ "Looks right" button sits next to it as a matching icon pill.
- **Report format:** the native select becomes a **segmented control** (CSV / Excel / PDF) plus a Download button.
- **Filters:** All / To review / Next as a segmented control with counts. Review rows get an amber left accent bar instead of a full yellow row fill.
- **Upload:** a large calm drop zone with an inline SVG icon, a drag-over state, a lock badge with "Processed on this computer, never stored", and the sample link.
- **Insights:**
  - Highlights as a numbered list with emphasized figures.
  - 50/30/20 as one segmented bar with labels.
  - Merchants as a bar list.
  - What-if sliders with category-colored tracks and a live value.
  - The disclaimer as a quiet footnote.
- **Motion:** 150–200 ms fades/slides on the results appearing and on popovers; respects `prefers-reduced-motion`.
- **Accessibility:** AA contrast, visible focus rings, a full-keyboard picker, labelled controls, mobile layout down to 375 px.

**Checklist**
- [x] [You] Approve the direction and the 3 decisions: (1) dark mode yes/no, (2) the font: system stack, or a self-hosted OFL font (needs a one-time font file download, committed to the repo, no runtime fetch), (3) the accent color. *(2026-10-19: approved. Dark mode follows the system; bundle Inter (one-time download, committed, no runtime fetch); near-black with a teal accent.)*
- [x] [builder] Tokens + layout shell + calmer category palette (frontend + `reports.py` colors kept in sync, tests updated).
- [x] [builder] Components: `CategoryPicker` (listbox popover), `SegmentedControl`, `BarList`, `Stat`; replace the selects/filters/totals table; review-row accent.
- [x] [builder] Restyle Upload, Results header, chart and the Insights panel; motion with reduced-motion support; mobile pass.
- [x] [builder] Update the README screenshots (PM captures them with synthetic data) and add a CHANGELOG entry.
- [x] [auditor] lint/tsc/build; picker keyboard + ARIA review; no external URLs/fonts, no storage; contrast spot-check; 142 backend tests still pass.
- [x] [PM] Before/after browser walkthrough (desktop + 375 px) with synthetic data; record; ask before commit.

*Phase UI verified 2026-10-19:*
- *Font: the official Inter v4.1 release (zip sha256 9883fdd4…), InterVariable.woff2 sha256 693b77d4…, plus the OFL-1.1 license, served from `.next/static/media`. There's no runtime fetch.*
- *Auditor: 11/11 checks, no fixes.*
- *PM checks:*
  - *Light mode, dark mode (computed contrast OK) and 375 px (no horizontal scroll).*
  - *Picker, real click: it opens anchored, flips upward near the bottom, relabels, closes and returns focus. An earlier misreading came from clicking the hidden mobile copy in a script.*
- *Three issues found by the PM and fixed with the user's approval:*
  1. *The PDF 50/30/20 headers overlapped. Now there are explicit column widths, short headers and a basis caption.*
  2. *A PDF table header was orphaned at the bottom of a page. Tables now keep their header with the first rows and use `repeatRows`.*
  3. *The donut highlight stuck after hover or tap. It now resets on leave, blur or an outside tap (verified by a real hover: Transport 8.3% → back to Transfer 48.6%).*
- *145 tests pass.*
- *The 4 README screenshots were recaptured in the new design, with the API temporarily on the synthetic model. The API was then switched back to `models/personal.joblib`.*

## Phase 9: two languages, theme toggle, 50/30/20 amounts (approved 2026-10-19)

### 9.1 50/30/20 with Rupiah targets (based on income)
- **Income:** money in (CR rows), scaled to one month via `months_factor`.
  - CSV uploads have no money in. The user can type a **monthly income** into the 50/30/20 card instead, with no storage.
  - The user can also override the detected income (money in can include refunds or transfers from family).
- **Targets:** needs = 50% × income, wants = 30%, savings = 20%, in Rp per month.
- **Each row shows:** target Rp, actual Rp (and %), and the difference, e.g. "Rp 450.000 left" (green) or "Rp 300.000 over" (amber). Savings actual = net (income − spending). Transfers stay "unclassified", shown separately with a note.
- **Backend (`insights.py`):** add `income_monthly`, `target_amounts`, `actual_amounts` and `difference` to `budget_503020`. `/api/insights` accepts an optional `income_override` (number), so the highlights, PDF and Excel use the same figure. Highlights add a sentence such as "Your wants were Rp X over the 30% target".
- **UI:** per bucket, a bar with a target marker, "Rp actual / Rp target", and the difference text. Plus an editable "Monthly income" field with a "detected from money in" hint and a reset link. The what-if section shows how far a cut moves wants toward its target.
- **Reports:** the PDF and Excel 50/30/20 tables get Target, Actual and Difference columns, plus an income line.
- **Tests:** amounts are computed correctly; the override changes the targets; no-income CSV + override; over/under cases; rounding.

### 9.2 Two languages: English and Bahasa Indonesia
- **No new library:** `lib/i18n.ts` with `en` and `id` dictionaries, a `t(key, vars)` helper and a `useLocale()` context. Every UI string moves to these dictionaries, including aria-labels.
- **Categories:** display names are translated (Makanan, Transportasi, Belanja, Tagihan, Transfer); internal keys stay English.
- **Dates and numbers:** `Intl` with the active locale (e.g. "22 Sep" vs "22 Sep", "Okt", "Des"). Rupiah is already id-ID.
- **Backend text:** highlights, the disclaimer, error messages and the PDF/Excel labels take `?lang=en|id` on `/api/classify`, `/api/insights` and `/api/report`, with the strings in a backend dictionary (`classifier/i18n.py`). The API stays English by default.
- **Toggle:** an "EN | ID" segmented control in the header. The default follows the browser language (Indonesian browsers start in Indonesian).
- **Tests:**
  - backend: both languages produce highlights, PDF and Excel text;
  - frontend: a key-parity check (every key exists in both dictionaries) via a small node script;
  - lint, tsc and build pass.

### 9.3 Theme toggle (light, dark, system)
- A "System | Light | Dark" control in the header. It sets `data-theme` on `<html>`, and the tokens already exist for both modes.
- A small inline script in `<head>` applies the saved choice before first paint (no flash).
- The default is **System**, as today.

### Open decisions for the user
- **D1 – remembering preferences:** language and theme can be (a) not remembered (re-detected on every visit), or (b) remembered in browser storage, as UI preferences only. Option (b) needs a narrow exception to the app's "no browser storage" rule in CLAUDE.md, README and PRIVACY: only `lang` and `theme`, never any financial data, plus a test that enforces only those keys.
- **D2 – default language:** follow the browser, or always start in English or Indonesian.
- **D3 – default theme:** System (current) or Light.
- **D4 – income source:** auto-detect from money in with a manual override (proposed), or always ask the user to type it.

### Checklist
- [x] [You] Decide D1–D4. *(2026-10-19: D1 = remember `lang` and `theme` only, as a documented, test-enforced storage exception; D2 = follow the browser; D3 = System; D4 = auto from money in, with a manual override that isn't stored.)*
- [x] [You] Approve the start of the build. *(2026-10-19)*
- [x] [builder] 9.1 50/30/20 amounts (backend, API, UI, reports, tests).
- [x] [builder] 9.2 i18n (frontend dictionaries + backend strings + tests).
- [x] [builder] 9.3 Theme toggle (+ storage exception if D1 = b).
- [x] [auditor] Tests, key parity, storage keys (only the allowed ones), no external loads, a11y of the new controls, docs accuracy.
- [x] [PM] Browser walkthrough in EN/ID × light/dark × desktop/375 px with synthetic data; masked real-statement check (sections present, targets computed, no Rp printed); refresh screenshots; record; ask before commit.

*Phase 9 verified 2026-10-19:*
- *Builder: 190 tests; i18n parity (143 keys); storage check (keys lang/theme only).*
- *Auditor: hand-computed 50/30/20 all pass. Override 20M → targets 10M/6M/4M. `lang=id` highlights and PDF are in Indonesian. Validation rejects −5 and "abc" with no echo. The income is never stored. CI runs check:i18n and check:storage.*
- *PM browser check (synthetic BCA fixture PDF):*
  - *Detected income Rp 8.500.000 → targets 4.25M/2.55M/1.7M; savings 7.574.500 (= income − all out). Typing 20.000.000 → targets 10M/6M/4M and "Entered by you. Not stored".*
  - *Indonesian UI throughout, and the override is kept across the language switch.*
  - *Dark + ID persist across a reload (data-theme set before paint). localStorage holds only lang/theme from this app.*
  - *The PDF 50/30/20 table has Target/Actual/Difference + an income line.*
- *Masked real-statement check (personal model): EN and ID both give 98 rows, income detected (money_in), targets present, 5 highlights. The override is accepted, and PDF/XLSX in ID return 200.*
- *Screenshots: upload.png, results.png and report-pdf.png recaptured (synthetic model); review.png kept.*
- *Known minor items:*
  - *(a) A brief pre-hydration flash of the default labels/toggles (EN/System) before the saved choice applies.*
  - *(b) The PRIVACY.md "no next/font import" sentence is inaccurate (it should say no next/font/google and no remote font).*
  - *(c) `test_upload_writes_no_files` can fail while a Next server writes `.next` cache; add `.next` and `node_modules` to SKIP_DIRS.*
  - *(d) localStorage on 127.0.0.1:3000 also holds `saleseval-auth` from the user's other project, which used the same origin. It isn't from this app.*

## Phase 10: simpler dashboard + category details popup (approved 2026-10-19)

Goal: show only the main things first and reveal details on demand. The behaviour, privacy rules and data flow stay unchanged; this is frontend only, no backend change.

### 10.1 Category details popup
- **Opening it:** clicking a category (a row in the "Where it went" list, or its donut slice) opens a details popup for that category: Makanan, Transportasi, Belanja, Tagihan or Transfer.
- **Popup contents:**
  - Header: category dot + name, total Rp, count, % of spend.
  - Its transactions sorted by date (date, description, amount, an "In" badge for money in), with the CategoryPicker on each row so you can fix a category right there. A relabelled row moves out of the list live, and totals, insights and review counts update as usual.
  - A small "Top merchants in this category" line (computed client-side from these rows).
  - For **Transfer**: rows split into "Out" and "In" sub-groups with their totals, since transfers mix both directions.
- **Accessibility:** a proper dialog (`role="dialog"`, `aria-modal`, labelled by its heading, focus trap, Esc/close button/backdrop click closes it, focus returns to the clicked row). The page behind doesn't scroll. Respects reduced motion.
- **Layout:** a side panel from the right on desktop, a bottom sheet on phones (decision P1).
- **i18n:** all text goes through the EN/ID dictionaries, with parity enforced.

### 10.2 Remove the donut hover highlight (for now)
- No hover/tap highlight on slices and no Recharts tooltip.
- The center label always shows the total spend (or the top category; decision P3).
- Slices become click targets that open the popup (the same as the list rows), with a pointer cursor and keyboard-reachable rows in the list as the accessible path.

### 10.3 Main things first (progressive disclosure)
- **Visible by default:**
  1. hero "Spent Rp X" + period + inline stats (transactions · to review · saved %);
  2. the donut + clickable category list;
  3. a compact 50/30/20 strip (three mini bars: needs/wants/savings vs target, with Rp amounts);
  4. a "N transactions need review → Review" prompt (only when N > 0);
  5. the download control.
- **Collapsed by default** (disclosure sections with a summary line, e.g. "Insights · 5 highlights", "All transactions · 98"):
  - full Insights (highlights, top merchants, small spends, fees, what-if sliders, the income field details);
  - the full transactions table with filters and Export labels.
- **Review prompt:** "Review" opens the transactions section directly on the "To review" filter.
- **Disclosure behaviour:** accessible buttons (`aria-expanded`/`aria-controls`) with a smooth height animation that's off under reduced motion. The open/closed state is NOT stored (resets per upload, per rule 7).

### Checklist
- [x] [You] Decide P1–P3. *(2026-10-19: P1 = side panel (bottom sheet on phones); P2 = the compact 50/30/20 strip is visible by default; P3 = the donut center shows total spend. Monitoring: the Claude mobile app via Remote Control, no Telegram for now.)*
- [x] [You] Approve the start of the build. *(2026-10-19)*
- [x] [builder] 10.2 remove the hover/tooltip; 10.1 popup component + wiring; 10.3 disclosure layout + review prompt; EN/ID strings; keep the storage/i18n checks green.
- [x] [auditor] lint/tsc/build, i18n + storage checks, dialog a11y (focus trap, Esc, focus return), no new deps or external loads, 190 backend tests still pass.
- [x] [PM] Browser walkthrough (EN/ID, light/dark, desktop/375 px) with synthetic data: open every category popup, relabel inside the popup, expand/collapse sections, review prompt; refresh screenshots; record; ask before commit.

*Phase 10 verified 2026-10-19:*
- *Builder: new Sheet, CategoryDetails, Disclosure, BudgetStrip and lib/merchants; 166 i18n keys; no dependency or backend changes.*
- *Auditor: 11/11 checks, no fixes.*
- *PM (real API, synthetic BCA fixture):*
  - *Main view: hero + stats + download, then the donut (center "Total spend Rp 925.5K") + category list, the 50/30/20 strip with Rp vs target, then collapsed Insights ("5 highlights · top merchant …") and All transactions.*
  - *The Transfer panel opens from the list with focus on Close, splits Out (2 · Rp 750.000) and In (2 · Rp 8.500.000), and shows the money-in note. Esc closes it, focus returns to the Transfer row, and the scroll lock is released.*
  - *At 375 px in ID + dark: the bottom sheet (sized to content, max 85%) shows Makanan with "4,9% dari pengeluaran"; the donut center reads "Rp 925,5 rb"; no horizontal scroll.*
- *results.png recaptured (synthetic model).*
- *Correction 10.2 (user, 2026-10-19: "the old hove is should stayed / what iwant remove is just the label when u hovering the pie chart"): the hover highlight is restored (slice emphasis, others dimmed, center shows category + %, the list row emphasized), and only the Recharts floating tooltip is removed. With no hover the center goes back to Total spend; a click still opens the panel. PM verified in the browser: Bills hover → "19.4% · Bills"; leaving → "Total spend Rp 6.7M"; no `.recharts-tooltip-wrapper` in the DOM.*
- *Transfers tracked (user, 2026-10-19: transfers like rent, debt or donations must stay trackable, and "top merchants" in the panel must be prominent). The earlier idea of hiding the line was dropped.*
  - *Backend: `transfer_key()` (counterparty names; cash withdrawals and unnamed transfers each grouped under one localized label). `top_transfers` {out_by_total, out_by_count, in_by_total}. A recipient highlight (EN/ID). PDF/XLSX "Top transfers" tables.*
  - *Frontend: a prominent "Where the money went" card (top 5 with #1 marked "Biggest") at the top of every category panel. Transfer shows Top recipients (out) + Top sources (in). Insights gets a "Top transfers" block.*
  - *Auditor: 9/9 pass, 212 tests. No recipient names or amounts in logs (test + live log grep). Reports are safe (names can't start with "=").*
  - *PM browser check (synthetic CSV): rent Kos Contoh Indah Rp 2.500.000 (53.2%, Biggest), Budi Contoh Rp 1.500.000 2×, ATM Rp 500.000, donation Rp 200.000. The highlight "Your largest transfer recipient was Kos Contoh Indah…" is shown. ID + 375 px: "Penerima teratas (keluar)", "Terbesar", no horizontal scroll.*
  - *Cosmetic follow-ups: (a) at 375 px the #1 name is shortened next to the "Terbesar" pill; (b) README line 83 says transfers are left out of top merchants, which could point to Top transfers; (c) there's no README screenshot of the panel yet.*

## Phase 11: better categories + transfer types (FOCUS; approved 2026-10-23, building)

**Why:**
- "Food" mixes needs (groceries) and wants (eating out), so the 50/30/20 split is wrong.
- Transfers (≈ half of the user's spending) sit outside the budget entirely, so savings and rent aren't recognised.
- The September personal model has never had an honest out-of-month test.

**Done means:**
- The new categories are live everywhere (classifier, API, UI, reports, insights, both languages).
- September is relabelled.
- The personal model is retrained.
- The October out-of-month check is run and the threshold decided.

### 11.1 Proposed taxonomy (decision C1)
| Group | Key | EN | ID | 50/30/20 |
|---|---|---|---|---|
| Needs | `groceries` | Groceries | Kebutuhan harian | Needs |
| Needs | `bills` | Bills and utilities | Tagihan | Needs |
| Needs | `transport` | Transport | Transportasi | Needs |
| Needs | `health` | Health | Kesehatan | Needs |
| Needs | `housing` | Rent and housing | Sewa dan hunian | Needs |
| Wants | `eating_out` | Eating out | Makan di luar | Wants |
| Wants | `shopping` | Shopping | Belanja | Wants |
| Wants | `entertainment` | Entertainment and subscriptions | Hiburan dan langganan | Wants |
| Transfers | `savings_transfer` | To my savings or e-wallet | Ke tabungan atau dompet digital sendiri | **Savings** (not spending) |
| Transfers | `people_transfer` | Family and friends | Keluarga dan teman | Shown separately ("other") |
| Transfers | `cash` | Cash withdrawal | Tarik tunai | Shown separately ("other") |
| Transfers | `other_transfer` | Other transfer | Transfer lainnya | Shown separately ("other") |

Twelve categories, three groups. Education folds into bills (or becomes its own category if the user wants it).

### 11.2 Design
- **One source of truth:** a backend `classifier/categories.py` holding the key, group, budget bucket, color and EN/ID names. The API exposes `GET /api/categories`, so the frontend reads the same list. This removes the 5 hard-coded copies (`main.py`, `schemas.py`, `insights.py`, `types.ts`, tests). Colors: a harmonious 12-color set that works in light and dark, with groups sharing a hue family.
- **50/30/20 v2:**
  - needs = the Needs group;
  - wants = the Wants group;
  - **savings = net + `savings_transfer`** (money moved to your own savings counts as saving, not spending);
  - people/cash/other transfers are listed as "Other money out", with the amount shown.
- **Rules:**
  - public groceries chains (Indomaret, Alfamart, Superindo, Hypermart, …) → groceries;
  - restaurants/cafés → eating_out;
  - pharmacies/hospitals/BPJS → health;
  - streaming/games/cinema → entertainment;
  - e-wallet top-ups (DANA, OVO, GoPay, ShopeePay, "TOP UP") → savings_transfer;
  - TARIK TUNAI/ATM → cash.
  - The transfer group stays last.
- **"My own accounts" (decision C2):** transfers to the user's own other accounts become `savings_transfer`.
  - Option a: learned only from labels, plus a "same recipient → same category" memory from the labels file.
  - Option b: also a local, gitignored `data/labels/own_accounts.txt` the user writes, never committed or logged.
- **Migrating old labels:**
  - The CLI `train`/`evaluate` map old keys: food → eating_out, bills → bills, transport → transport, shopping → shopping, transfer → other_transfer. Mapped rows from old categories that changed meaning (food, transfer) are marked `label_source=migrated` and are NOT used for training until reviewed.
  - When re-uploading, the app flags these rows for review, so September needs only the food and transfer rows re-checked (about 47 + 45 rows).
- **Synthetic data:** extend `data/sample_transactions.csv` and the BCA test fixture to cover all 12 categories (synthetic only). The shipped synthetic model is retrained on it.
- **UI:**
  - The CategoryPicker is grouped (Needs / Wants / Transfers headers) with type-ahead.
  - The category list and donut show the group totals first (Needs / Wants / Transfers), each expandable to its categories, so 12 categories don't feel crowded.
  - The 50/30/20 strip uses the v2 mapping.
  - The details panel works per category.
- **Reports, insights and highlights:** they follow the new keys and names (EN/ID); the PDF and Excel get group subtotals.
- **Tests:** taxonomy integrity (every key has a group, bucket, color, EN and ID names), migration mapping, the v2 budget math (savings_transfer counted as savings), rules for each new category, i18n/storage parity, and the existing privacy tests.

### 11.3 Checklist (owners)
- [x] [You] Decide C1 (taxonomy as above, or edits) and C2 (own accounts: labels only, or a local list). *(2026-10-23: C1 = the 12 categories as proposed; C2 = learn from labels only, with "same recipient → same category" memory from the labels file. No local list.)*
- [x] [You] Approve the start of the build. *(2026-10-23)*
- [x] [builder] 11a: `categories.py` source of truth + `/api/categories`; replace all hard-coded lists; colors; tests.
- [x] [builder] 11b: rules + synthetic data + shipped synthetic model; migration in the CLI; budget v2 in insights/reports/highlights; tests.
- [x] [builder] 11c: frontend grouped picker, group-first chart/list, strip v2, details panel, EN/ID; checks.
- [x] [auditor] Full verification: tests, taxonomy integrity, budget math by hand, no hard-coded category lists left (grep), privacy, i18n, storage. *(2026-10-23: 12/12 pass, 291 tests. Budget v2 by hand is exact (savings 2.45M with savings_transfer counted). Migration excluded 5/12 old food/transfer rows. Recipient memory ANI SAMPEL → savings_transfer (source memory). No names in logs.)*
- [ ] [PM] Browser walkthrough with synthetic data; masked real-statement check (counts per group only); refresh screenshots; ask before commit. *(Walkthrough done 2026-10-23: groups first (Needs 16.2M / Wants 2.1M / Transfers 7.5M), Needs expands to 5 categories and the donut splits; picker has 12 options in 3 ARIA groups; the strip shows "Other money out". Masked real check with the OLD personal model: 98 rows, 46 flagged (migrated food/transfer), 14 DB transfers → savings_transfer by rule, the 15 CR stay other_transfer; income + targets OK; PDF/XLSX 200.)*
  - *Found, to fix before commit:*
    1. *The housing color (indigo) is too close to the Transfers violet; they sit next to each other on the donut.*
    2. *There are two different "savings" figures. Cash-flow net / savings rate (e.g. 950k, 9.5%, used in the "You kept…" highlight) excludes savings_transfer, while the 50/30/20 savings (2.45M) includes it. Unify: "Saved = left over + moved to your savings", with the breakdown shown.*
  - *Both fixes are done (user-approved, 2026-10-23). 298 tests.*
    - *Housing color: slate-teal, with a color-distance test.*
    - *One savings definition, "Saved = left over + moved to your savings". By hand: 10M in, 9.05M out, 1.5M savings_transfer → 950k + 1.5M = 2.45M (24.5%), identical in cash_flow, budget and the highlight. Browser (synthetic BCA): header "Saved 85.2%"; Insights "Rp 7.243.000 = Rp 7.043.000 left over + Rp 200.000 moved to your savings"; the strip shows the same breakdown.*
  - *Screenshots refreshed (synthetic model): results.png (group-first view), review.png (now the category details panel; README caption updated by PM), report-pdf.png (12 categories with group subtotals). upload.png is unchanged.*
  - *The API was restored to `MODEL_PATH=models/personal.joblib` (the old 5-category model; its predictions migrate and get flagged for review).*
- [ ] [You] Re-review September in the app (only the flagged food/transfer rows) → Export labels → `data/labels/`.
- [ ] [PM→worker] Retrain the personal model; masked metrics.
- [ ] [You] October statement: upload, review the flagged rows, export labels.
- [ ] [PM→worker] **Out-of-month check:** train on September, test on October. Report the accuracy, the review share, and how many flagged rows the user had to change; decide the threshold (0.5 vs 0.6); retrain on both months.

## Roadmap (PINNED, not started; only after Phase 11 is done)
In priority order. Each item still needs its own plan and the user's approval.
1. **In-app "bring your own labels" retraining:** stateless per-request training from a labels file (details in "Later"). Removes the CLI + MODEL_PATH restart.
2. **Privacy/security hardening:** a Content-Security-Policy (self + 127.0.0.1:8000 only), X-Frame-Options, Referrer-Policy, Permissions-Policy; Dependabot for pip/npm/Docker digests.
3. **Static demo on GitHub Pages:** the frontend with canned synthetic responses, no backend, zero data.
4. **Frontend tests:** unit tests (summary, merchants, budget, csv) + Playwright e2e (needs a dev-dependency install approval); rebuild the local Docker images; fix the pre-hydration label flash; remove the httpx deprecation warning.
5. **Portfolio finishing:** a panel screenshot, a short GIF, release tags v0.8–v0.11.
6. **Housekeeping:** the Phase 10 cosmetic leftovers (phone #1 name truncation, README line 83), refresh state-snapshot, archive finished worker sessions.
7. **Month-over-month (8b)** and recurring payments; optional email; embeddings comparison; more banks.

## Portfolio polish

- [x] [builder] Wrote the README landing page, PRIVACY.md, MIT LICENSE, CHANGELOG (v0.1–v0.7), CONTRIBUTING and `.github/workflows/ci.yml` (backend pytest; frontend lint → build → tsc; docker build; `contents: read`). *(2026-10-19)*
- [x] [PM] Captured 4 screenshots with synthetic data only: upload, results, review (fake merchants) and a PDF report rendered from the synthetic model. *(2026-10-19)*
- [x] [auditor] Docs accuracy + leak audit. Every claim matches the code, all cited tests exist, links resolve, the YAML parses, the license is right, 114 tests pass, and there are no leaks. The audit flagged that the README results table mixed accuracy bases; the table was fixed, and the 46% figure is traced to the 7b report (0.458). The other-project mentions were removed from `.claude/` files (older commits still contain the folder name). *(2026-10-19)*
- [x] [You] Approve commit + push. The first push triggers GitHub Actions CI, which hasn't been run on Linux yet. *(2026-10-19: commit f45893b, 13 files, pushed; PM verified. First CI run 39151731131 passed all 3 jobs: backend tests, frontend lint/build/tsc and the Docker build. PM checked 2026-10-19.)*
- [ ] [PM] Optional follow-up: a test that fails on `next/font` or external URLs in `frontend/src`, so the "no external assets" guarantee is enforced.

## Later

- [ ] [PM] Plan opt-in email (deferred by the user on 2026-10-18): the user's own SMTP settings, off by default, with a clear warning that the report leaves the machine.
- [ ] [PM] Plan a sentence-embeddings (MiniLM) comparison against the TF-IDF baseline.
- [ ] [PM] Plan the review loop that feeds corrections back into training.
- [ ] [PM] Future plan (parked by the user on 2026-10-19): **"bring your own labels", stateless per-request training.**
  - Each request carries the statement plus the user's labels file (or, opt-in, labels in IndexedDB on the device).
  - The server trains a throwaway mini-model in memory: shared base (synthetic + public rules) + user labels weighted higher + an exact-match shortcut for previously labeled descriptions. It classifies, then discards everything. No accounts, no database, no stored models.
  - It replaces the CLI train + MODEL_PATH restart for self-hosting, and would allow a hosted demo without storing data.
  - Open points: request format (JSON or in-memory multipart, never spooled to disk), a labels size/row cap, validation, and UU PDP obligations if ever hosted publicly.
