---
name: phase-runbook
description: Phase-by-phase checklist for the spending-category-classifier self-hosted web app (FastAPI + Next.js), with an owner tag on every item ([You], [builder], [auditor], [PM]). Use to pick the next step and to tick items off after verification.
---

# Phase runbook

Owner tags: **[You]** the user, **[builder]** and **[auditor]** the worker agents, **[PM]** the orchestrator session. The PM ticks an item only after a read-only check confirms it. Approval for one item never covers the next. Every phase follows the privacy rules in `CLAUDE.md`.

## Phase 0: decisions

- [ ] [You] Decide whether to `git init` this folder (needed for GitHub later).
- [ ] [You] Get one BCA export (CSV or PDF). Avoid the app's maintenance window, 00:00–04:00 WIB. Store it in `data/raw/`; remove any PDF password yourself.
- [ ] [You] Decide who labels ~200 rows and in what tool.
- [ ] [You] Approve creating the Python venv and installing dependencies.
- [ ] [You] Approve installing Node.js.
- [ ] [You] Approve installing Docker Desktop (needed only by Phase 5).

## Phase 1: core classifier under `backend/`

- [ ] [builder] Create the pipeline module under `backend/` (replaces the planned `src/pipeline.py`) with `clean_description`, `RULES`, `apply_rules` (word-boundary regex `\b...\b`), `build_model`, `CONFIDENCE_THRESHOLD`, `classify(df, model, threshold)` and `load_transactions(path)` (requires a `description` column; clear error that lists the columns found).
- [ ] [builder] Move `src/classify.py` into `backend/` as an argparse CLI with:
  - `evaluate`: stratified CV with `n_splits=min(5, smallest class count)`; reports model-only accuracy, rule coverage and precision, combined accuracy, review share, and a `classification_report`.
  - `train`: saves the model via joblib (personal models gitignored).
  - `predict`: `--model`, `--out`, `--threshold 0.6`; no `category` column needed.
- [ ] [builder] Add pytest tests covering cleaning, rules including "shellfish" → None, classify on unlabeled data, the loader error, and end-to-end train + predict with `tmp_path`.
- [ ] [builder] Housekeeping: add `pytest>=8` to requirements; gitignore personal models (`models/`, `*.joblib`); fix the README link; update `PLAN.md`.
- [ ] [auditor] Run pytest, the three CLI commands on `data/sample_transactions.csv`, and `predict` on a copy without the `category` column.
- [ ] [PM] Verify the reports and update `state-snapshot`.

## Phase 2: FastAPI API

- [ ] [builder] `POST` upload endpoint: CSV in, JSON out (rows with `predicted`, `confidence`, `needs_review`, plus category totals). Processed in memory only.
- [ ] [builder] Report download endpoint.
- [ ] [builder] Privacy tests: no files written during an upload; logs contain no descriptions or amounts.
- [ ] [auditor] Verify the API and the privacy tests.
- [ ] [PM] Verify and update `state-snapshot`.

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
