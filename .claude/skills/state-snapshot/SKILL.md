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
- **Repo files have not changed yet:** there is no `backend/` or `frontend/`.

## Files in the repo

| Path | State |
|---|---|
| `README.md` | Idea overview, approach, stack, privacy notes. Status line says "Idea, not started". |
| `PLAN.md` | Planning handoff: scope, decisions, phases, known gaps, setup steps. |
| `requirements.txt` | `pandas>=2.0`, `scikit-learn>=1.3`. No pytest yet. |
| `.gitignore` | `data/raw/`, `data/predictions.csv`, `*.pkl`, `__pycache__/`, `.venv/`. Does not yet cover `models/` or `*.joblib`. |
| `data/sample_transactions.csv` | 40 synthetic labeled rows; columns `date,description,amount,category`. Counts: bills 9, transfer 9, transport 8, food 7, shopping 7. |
| `src/classify.py` | Single untested script: `clean_description`, `RULES` (substring match, no rules for transfer), `CONFIDENCE_THRESHOLD = 0.6`, `build_model`, `main(csv_path)`. 3-fold CV, then fits on all labeled rows and writes `data/predictions.csv`. |
| `CLAUDE.md`, `.claude/` | PM scaffolding (agents `builder`, `auditor`; skills `state-snapshot`, `phase-runbook`). |

## Known gaps

- `src/classify.py` crashes on CSVs without a `category` column (`df["category"]` is accessed unconditionally).
- Its accuracy is inflated: rules decide most sample rows, and the final accuracy is measured on the same rows the model was trained on.
- Rules use plain substring matching, so a phrase can match inside another word.
- The README link `../ml-project-ideas.md` is broken.

## Environment

- The folder is **not** a git repo.
- There is no venv and nothing is installed for this project.
- There are no tests.
- Node.js and Docker: not installed or not checked.

## Open questions

- **BCA export format is unknown.** Either a KlikBCA "Mutasi Rekening" CSV-style download or a myBCA/BCA mobile e-statement PDF; unverified.
- The user's first download attempt hit the app's scheduled maintenance window, 00:00–04:00 WIB. Try outside that window.
- Phase 0 decisions: `git init` (needed for GitHub), who labels ~200 rows in what tool, and approvals for the Python venv, Node.js and Docker Desktop.
