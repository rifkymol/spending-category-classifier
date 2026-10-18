---
name: phase-runbook
description: Phase-by-phase checklist for the spending-category-classifier self-hosted web app (FastAPI + Next.js), with an owner tag on every item ([You], [builder], [auditor], [PM]). Use to pick the next step and to tick items off after verification.
---

# Phase runbook

Owner tags: **[You]** the user, **[builder]** and **[auditor]** the worker agents, **[PM]** the orchestrator session. The PM ticks an item only after a read-only check confirms it. Approval for one item never covers the next. Every phase follows the privacy rules in `CLAUDE.md`.

## Phase 0: decisions

- [x] [You] Decide whether to `git init` this folder (needed for GitHub later). *(2026-10-18: done. Repo on `main`, pushed to github.com/rifkymol/spending-category-classifier; commit 6d50412, 16 files, none sensitive.)*
- [ ] [You] Get one BCA export (CSV or PDF). Avoid the app's maintenance window, 00:00–04:00 WIB. Store it in `data/raw/`; remove any PDF password yourself.
- [ ] [You] Decide who labels ~200 rows and in what tool.
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
- *Note: an unrelated dev server from the user's other project (fe-sales-evaluation, node PID 36740) listens on 0.0.0.0:3000. It's not this app, but it shares port 3000.*
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
  - *Ports stay 3000/8000 by user decision. The user's other dev server (fe-sales-evaluation) was stopped on request.*
- [ ] [You] Label ~200 rows. Start with the September statement (98 rows) in the app, then use Export labels and move the file to `data/labels/`.
- [ ] [auditor] Run `evaluate` on the labeled set.
- [ ] [PM] Tune the review threshold. The personal model stays local and gitignored.

## Later

- [ ] [PM] Plan opt-in email (deferred by the user on 2026-10-18): the user's own SMTP settings, off by default, with a clear warning that the report leaves the machine.
- [ ] [PM] Plan a sentence-embeddings (MiniLM) comparison against the TF-IDF baseline.
- [ ] [PM] Plan the review loop that feeds corrections back into training.
