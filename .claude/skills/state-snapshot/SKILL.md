---
name: state-snapshot
description: What is true about the spending-category-classifier project right now (files, known gaps, environment, open questions). Read before planning or briefing a worker; the PM updates it after each verified step.
---

# State snapshot

**As of 2026-10-18.** Update the date and facts whenever a verified step lands.

## Decided

- Categories: food, transport, shopping, bills, transfer.
- Keyword rules run first, then a TF-IDF (`char_wb`, n-grams 2-5) plus LogisticRegression model.
- Review threshold starts at 0.6.
- Milestone-1 plan approved on 2026-10-18; under the new direction its items move under `backend/` (see `phase-runbook`, Phase 1).

## Direction change (2026-10-18)

- **Product:** a web app. The user uploads a bank-statement CSV and gets back categorized transactions, a pie chart and a downloadable summary report. Email is an optional extra, deferred to "Later" in the runbook.
- **Stack:** FastAPI backend (Python; the classifier runs in-process) and Next.js frontend (React + Tailwind, Recharts for charts).
- **Audience:** the user first. Anyone can self-host it on their own machine; there is no public hosted service. It is also a portfolio project and will go on GitHub later.
- **Distribution:** Docker Compose for others (`docker compose up`, then open http://localhost:3000); separate backend and frontend dev servers for development.
- **Classifier:** unchanged (5 categories, rules first, then TF-IDF `char_wb` 2-5 + LogisticRegression, review threshold 0.6).
- **Layout:** `backend/` (FastAPI app plus the classifier package; the planned `src/pipeline.py` work moves here), `frontend/` (Next.js), `docker-compose.yml` at the root.
- **Privacy rules:** in-memory processing only, no database, no uploads on disk; logs hold only counts and timings; no outbound calls (no analytics, no external fonts/CDNs, `NEXT_TELEMETRY_DISABLED=1`, bind to localhost); email off by default and only via the user's own SMTP with a warning; the shipped model is trained only on synthetic data, personal models and labels stay local and gitignored; automated tests enforce these rules.
- **Phases 1–3 are done and verified (2026-10-18):** the core classifier, the FastAPI API and the Next.js UI. Phase 4 (reports) is next.

## Files in the repo

| Path | State |
|---|---|
| `backend/classifier/pipeline.py` | Pure core: `clean_description`, `RULES` (word-boundary regex), `apply_rules`, `build_model`, `CONFIDENCE_THRESHOLD = 0.6`, `OUTPUT_COLUMNS`, `load_transactions(path_or_buffer)`, `classify(df, model, threshold)`. No prints, logging or file writes. |
| `backend/classify.py` | argparse CLI: `evaluate`, `train` (default model `backend/models/model.joblib`), `predict` (default out `data/predictions.csv`). Errors print one line and return 1. |
| `backend/app/main.py`, `backend/app/schemas.py` | FastAPI app.<br>Endpoints:<br>- `GET /api/health` returns `model` = synthetic or custom.<br>- `POST /api/classify` takes the raw CSV body (`text/csv` or `application/octet-stream`), with a 5 MB cap and an optional `threshold`. It returns rows (id, date, description, amount, predicted, confidence, needs_review, source) and a summary (total_rows, needs_review, total_amount, `by_category` list of 5 entries with category, count, total_amount, share).<br>- `POST /api/report` takes `{rows}` and returns a CSV attachment.<br>CORS allows only localhost:3000. The model comes from `MODEL_PATH`, or is trained in memory on the sample. Run with `.venv\Scripts\python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000`. |
| `frontend/` | Next.js 16.4.2 App Router + React 19.3.1 + Tailwind 4.3.3 + Recharts 3.10.1 (exact pins).<br>- One page `/`: upload (drag and drop or picker, .csv only, 5 MB check, privacy note, synthetic `public/sample.csv`), then results (IDR summary cards, donut chart, totals table, transactions table with an All / Needs review filter and an editable category per row, Download report, Start over).<br>- Calls the API directly at `NEXT_PUBLIC_API_URL` (default `http://127.0.0.1:8000`).<br>- Telemetry is off via `cross-env NEXT_TELEMETRY_DISABLED=1`. Dev and start bind to 127.0.0.1:3000. Data lives only in React state. |
| `backend/tests/` | `test_pipeline.py` (11) and `test_api.py` (12, including privacy tests); `conftest.py` adds `backend/` to sys.path. 23 tests total. |
| `backend/requirements.txt` | `pandas>=2.0`, `scikit-learn>=1.3`, `joblib`, `pytest>=8`, `fastapi`, `uvicorn`, `httpx`. Root `requirements.txt` is `-r backend/requirements.txt`. |
| `.gitignore` | `data/raw/`, `data/predictions.csv`, `*.pkl`, `__pycache__/`, `.venv/`, `models/`, `*.joblib`. |
| `data/sample_transactions.csv` | 40 synthetic labeled rows; columns `date,description,amount,category`. Counts: bills 9, transfer 9, transport 8, food 7, shopping 7. |
| `README.md`, `PLAN.md` | Usage shows the three commands; the broken link is removed. PLAN.md notes the web app direction and marks the old gaps as fixed. |
| `CLAUDE.md`, `.claude/` | PM scaffolding (agents `builder`, `auditor`; skills `state-snapshot`, `phase-runbook`). |
| `src/` | Removed; its logic moved to `backend/`. |

## Verified results (2026-10-18, synthetic sample)

- pytest: 11 passed.
- evaluate (5-fold, held-out only): model-only accuracy 0.68, rule coverage 0.78 (31/40), rule precision 1.00, combined 1.00, review share 0.23 (9 rows).
- The combined 1.00 comes from rules on a rule-friendly synthetic sample. The real signal is model-only 0.68, so expect lower numbers on real BCA data.

## Known gaps

- The model has been tested only on 40 synthetic rows. It needs real labeled data (Phase 7).
- There are no rules for `transfer`; the model handles those rows.
- The report CSV does not yet neutralize spreadsheet formula injection (`= + - @` prefixes). Planned for Phase 4.
- `/api/report` accepts any `predicted` string and has no size cap.
- With the sample, all 9 flagged rows are transfers, because there are no transfer rules. Consider adding them in Phase 7.
- The real "Download report" click (which saves a file) has not been tested in a browser.

## Environment

- Git repo on `main`, remote `origin` = github.com/rifkymol/spending-category-classifier. Initial commit 6d50412 (16 files, no sensitive files) is pushed. Phase 2 commit 576c6d9 is pushed. Not committed yet: `frontend/`, `.gitignore`, README, PLAN, and the PM's `auditor.md`, `CLAUDE.md` and `.claude/skills/` edits.
- `.venv` exists (Python 3.13.3) with `backend/requirements.txt` installed, including fastapi, uvicorn and httpx.
- System Python 3.13.3 also has pandas 2.2.3 and scikit-learn 1.8.0.
- Node.js v22.15.0 and Docker 29.1.5 are installed.

## Open questions

- **BCA export format is unknown.** Either a KlikBCA "Mutasi Rekening" CSV-style download or a myBCA/BCA mobile e-statement PDF; unverified.
- The user's first download attempt hit the app's scheduled maintenance window, 00:00–04:00 WIB. Try outside that window.
- Who labels ~200 rows, and in what tool (Phase 0).
