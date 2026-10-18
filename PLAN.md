# Plan: Spending Category Auto-Classifier

Status: Phase 1 (classifier core + CLI under `backend/`) done and verified. Phase 2 (FastAPI API under `backend/app/`) built; awaiting auditor verification. This file is the handoff for moving the project to another Claude environment.

> **Direction update:** this is now a self-hosted FastAPI + Next.js web app (see `CLAUDE.md`). The classifier core lives under `backend/`.

## Goal

Predict a spending category for each bank transaction from its text description (for example "GRAB*FOOD" or "SHOPEE"). Handle the obvious merchants with rules, use a local ML model for the rest, and ask the user to review uncertain cases.

## Scope

**In:**
- Read a bank statement exported as CSV
- Clean descriptions
- Keyword rules for known merchants
- Baseline model (TF-IDF with character n-grams, plus logistic regression)
- Confidence threshold that flags uncertain rows for review
- Output CSV with predicted categories and review flags

**Out (for now):**
- Web or mobile UI
- Sentence embeddings (planned as a later comparison)
- Live bank connections or API access
- Anomaly detection on spending

## Decisions to confirm before coding

1. **Category list.** Current draft: food, transport, shopping, bills, transfer. Confirm or change it.
2. **Real bank CSV format.** Need one anonymized sample: column names, date format, and whether amount is signed (debit and credit).
3. **Training labels.** Plan to label about 200 real transactions by hand. Decide who labels and in what tool (a spreadsheet is fine).
4. **Confidence threshold.** Starting value is 0.6. Tune after the first labeled set.

## Phases

1. **Confirm decisions.** Answer the questions above.
2. **Data.** Export 3 to 6 months of statements. Store them in `data/raw/`, which is gitignored. Label about 200 rows.
3. **Baseline.** Build the cleaning function, the rules, and the TF-IDF model. Evaluate with cross-validation on the labeled set.
4. **Compare.** Try sentence embeddings (MiniLM or similar) against the baseline. Keep whichever scores better on held-out rows.
5. **Review loop.** Add a simple way to confirm or fix flagged rows. Save corrections as new labels.
6. **Polish.** Optional UI (Streamlit or CLI prompt), notes on the results.

**Phase 3 note (web UI):** `frontend/` is a client-only Next.js app that calls the API at `NEXT_PUBLIC_API_URL` (default `http://127.0.0.1:8000`). Privacy: no browser storage, cookies or URL params hold data; no external fonts, CDNs or analytics; telemetry is off in every npm script; dev and start bind to `127.0.0.1:3000`; `poweredByHeader` is off. Editing a row's category clears its review flag and recomputes the summary in the browser (`src/lib/summary.ts`). Dependencies are pinned to exact versions.

**Phase 4 note (reports):** `backend/app/reports.py` builds the CSV, Excel (openpyxl 3.1.5) and PDF (reportlab 5.0.1) reports in memory from `list[Row]` plus the summary; `report_csv` moved there from `main.py`. `POST /api/report?format=csv|xlsx|pdf` reads the JSON body via `read_body` (10 MB cap), validates it with `ReportRequest.model_validate_json` (`predicted` restricted to the 5 categories via `ReportRow`, max 50,000 rows), and returns 422 errors with `loc`/`msg`/`type` only, never the submitted input. Text cells starting with `= + - @`, tab or CR get a `'` prefix in CSV and Excel. PDF chart colors mirror `frontend/src/lib/format.ts` (a test checks they match). The UI has a format select next to "Download report". Tests: `backend/tests/test_reports.py`.

**Phase 5 note (self-hosting):** `docker compose up --build` from the repo root builds two images with the repo root as build context. `backend/Dockerfile` (`python:3.13-slim`, non-root, runtime deps only from `backend/requirements-runtime.txt`, copies `backend/` and `data/sample_transactions.csv` so `SAMPLE_CSV` resolves, healthcheck on `/api/health`). `frontend/Dockerfile` (multi-stage `node:22-alpine`: `npm ci` → `npm run build` with build arg `NEXT_PUBLIC_API_URL`, default `http://127.0.0.1:8000` → non-root runner on Next `output: "standalone"`, `node server.js`). `docker-compose.yml` publishes `127.0.0.1:8000` and `127.0.0.1:3000` only; both services are `read_only` with RAM `tmpfs` (`/tmp`, plus `/app/.next/cache` for web), `cap_drop: [ALL]`, `no-new-privileges`, `restart: "no"`, no data volumes; web waits for api `service_healthy`. An optional read-only `./models:/models` mount with `MODEL_PATH` is commented out. `.dockerignore` keeps `.git`, venvs, `node_modules`, build output, `data/` (except the sample), models, `.claude/` and env files out of the images. `backend/requirements.txt` is now `-r requirements-runtime.txt` plus `pytest` and `httpx`. CORS origins are still hard-coded in `main.py`; a different UI address needs a code change (documented in README). Images have not been built yet.

**Phase 7a note (personal labels):** labels never touch the server (rule 1). In the UI, changing a category or pressing ✓ ("Looks right", flagged rows only) marks a row `reviewed` in React state; "Reviewed X of Y flagged" and a "Next to review" filter track progress (`src/lib/summary.ts`: `confirm`, `reviewProgress`). **Export labels** builds `labels-YYYY-MM-DD.csv` in the browser (`src/lib/csv.ts`, same `= + - @ 	 ` → `'` guard as `reports.py`) with `date,description,amount,direction,category,label_source`, where `label_source` is `user` (reviewed), `rule` or `model` (unreviewed guess). The user keeps it in `data/labels/` (gitignored). `classify.py train` and `evaluate` take several CSVs (wildcards expanded by the CLI for Windows shells) and keep only `user`/`rule` rows; `train` adds the synthetic sample unless `--no-synthetic` and prints per-category counts; `evaluate` skips categories under `--min-per-class` (default 2) from CV with a warning. RULES gained public national chains and generic food words (convenience stores count as shopping); transfer stays last. README: "Teach it your spending".

## Files

| Path | Purpose | State |
|---|---|---|
| `README.md` | Idea overview and approach | Exists |
| `requirements.txt` | Points to `backend/requirements.txt` | Exists |
| `backend/requirements-runtime.txt` | Runtime deps: `pandas`, `scikit-learn`, `joblib`, `fastapi`, `uvicorn`, `openpyxl==3.1.5`, `reportlab==5.0.1` (used by the Docker image) | Exists |
| `backend/requirements.txt` | `-r requirements-runtime.txt` plus `pytest`, `httpx` | Exists |
| `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`, `.dockerignore` | Phase 5 self-hosting: two images, loopback-only ports, read-only hardened containers | Exists, config-parsed; images not built yet |
| `.gitignore` | Keeps statements, personal labels (`data/labels/`), predictions, and models (`models/`, `*.joblib`) out of Git | Exists |
| `data/sample_transactions.csv` | 40 synthetic rows for testing, not real data | Exists |
| `backend/classifier/pipeline.py` | Cleaning, word-boundary rules, model, loader, `classify()` (pure, in-memory) | Exists, CLI-checked |
| `backend/classify.py` | CLI: `evaluate`, `train` (several label CSVs, `label_source` filter), `predict` | Exists, runs on the sample |
| `backend/tests/test_pipeline.py` | pytest tests (cleaning, rules, classify, loader, end-to-end) | Exists, passing |
| `backend/app/main.py` | Phase 2 FastAPI app: `GET /api/health`, `POST /api/classify` (raw CSV body, in memory, 5 MB cap), `POST /api/report?format=csv|xlsx|pdf` (report download, 10 MB / 50,000-row cap), CORS for localhost:3000, counts-only logging | Exists, builder-tested |
| `backend/app/schemas.py` | Pydantic request and response models (`ReportRow` limits `predicted` to the 5 categories) | Exists |
| `backend/app/reports.py` | Phase 4 report builders: CSV, Excel (Summary + pie chart, Transactions), PDF (A4, pie, tables); formula-injection guard | Exists, builder-tested |
| `backend/tests/test_reports.py` | Report format, injection, validation and privacy tests | Exists, passing |
| `backend/tests/test_api.py` | API tests plus privacy tests (no files written during an upload, no descriptions or amounts in logs) | Exists, passing |
| `frontend/` | Phase 3 Next.js 16 UI (App Router, TypeScript, Tailwind 4, Recharts 3): upload with drag-and-drop and checks, summary cards, donut chart, per-category totals, editable transactions table with a review filter, report download. Client-only; data lives in React state | Exists, builder-tested |
| `frontend/src/lib/summary.ts` | Client-side summary recompute, mirrors `summarize()` in `backend/app/main.py` | Exists |
| `PLAN.md` | This file | Exists |

Not yet created: `data/raw/` (real statements), a virtual environment. `src/` was removed after its logic moved into `backend/`.

## Setup for a new environment

1. Copy this whole folder to the new environment.
2. Create a virtual environment: `python -m venv .venv`, then activate it.
3. Install dependencies: `pip install -r requirements.txt`.
4. Run the baseline on the sample data: `python backend/classify.py evaluate data/sample_transactions.csv` (then `train` and `predict`).
5. Expect a rough accuracy number. The sample is synthetic and small, so treat the number as a smoke test only.

## Known gaps to fix

- ~~`src/classify.py` assumes a `category` column exists.~~ Fixed: `predict` works without it.
- ~~`README.md` links to `../ml-project-ideas.md`, which is broken.~~ Fixed: link removed.
- ~~Rules hide the model's real performance.~~ Fixed: `evaluate` reports model-only accuracy on held-out folds, separately from rule coverage and precision.
- ~~No tests yet.~~ Fixed: `backend/tests/test_pipeline.py`.

## Privacy

- Real statements stay local and out of Git.
- Do not send statements to cloud APIs.
- Do not paste real transactions into chat when working in another environment unless the content is anonymized.

## Risks

- **Too few labels.** The model may overfit with about 200 rows. Mitigation: start with rules and review more rows over time.
- **Merchant names change.** Rules can go stale. Mitigation: the review loop feeds new labels back in.
- **Ambiguous descriptions.** Some transfers have no merchant name. Mitigation: flag them for review.

## Open questions

- Do you want income (salary, transfers in) tracked separately from spending?
- Which bank exports do you use, and do they include a category field already?
