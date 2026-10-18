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
