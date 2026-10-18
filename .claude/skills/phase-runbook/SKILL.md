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

- [ ] [builder] Upload page.
- [ ] [builder] Results page with a pie chart (Recharts), per-category totals and an editable review table for flagged rows.
- [ ] [builder] Telemetry off (`NEXT_TELEMETRY_DISABLED=1`), no external fonts, CDNs or analytics.
- [ ] [auditor] Verify the UI flow and that no outbound requests are made.
- [ ] [PM] Verify and update `state-snapshot`.

## Phase 4: reports

- [ ] [builder] CSV/Excel download of categorized transactions and totals.
- [ ] [builder] PDF summary report.
- [ ] [auditor] Verify both downloads.

## Phase 5: self-hosting

- [ ] [builder] Dockerfiles for backend and frontend plus `docker-compose.yml` (bound to localhost).
- [ ] [builder] README "run it locally" guide (`docker compose up`, open http://localhost:3000) and a privacy section.
- [ ] [auditor] Verify `docker compose up` serves the app on localhost.
- [ ] [PM] Verify and update `state-snapshot`.

## Phase 6: BCA import

- [ ] [PM] Research the format from the user's file via an anonymized page or a local masked-structure script (digits and names masked; raw contents never enter the chat).
- [ ] [builder] Importer that outputs `date`, `description`, `amount` (CSV via pandas, or text PDF via pdfplumber).
- [ ] [auditor] Verify the importer.

## Phase 7: labeling and tuning

- [ ] [You] Label ~200 rows.
- [ ] [auditor] Run `evaluate` on the labeled set.
- [ ] [PM] Tune the review threshold. The personal model stays local and gitignored.

## Later

- [ ] [PM] Plan opt-in email (deferred by the user on 2026-10-18): the user's own SMTP settings, off by default, with a clear warning that the report leaves the machine.
- [ ] [PM] Plan a sentence-embeddings (MiniLM) comparison against the TF-IDF baseline.
- [ ] [PM] Plan the review loop that feeds corrections back into training.
