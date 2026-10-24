# CLAUDE.md: Spending Category Auto-Classifier

## Goal

A self-hosted web app: the user uploads a bank-statement CSV (BCA first) and gets back categorized transactions (food, transport, shopping, bills, transfer), a pie chart and a downloadable summary report. Low-confidence rows are flagged for review, and corrections become new training data. Email is an optional extra.

It is built for the user first, so that anyone can self-host it on their own machine. There is no public hosted service. It is also a portfolio project and will go on GitHub later.

Classifier: keyword rules first, then a TF-IDF (`char_wb`, n-grams 2-5) plus LogisticRegression model. The review threshold starts at 0.6.

**Milestone 1 is done when** `evaluate`, `train` and `predict` work from the CLI under `backend/` and the tests pass.

Constraints: Windows 11 laptop, $0, local-first. Self-hosting only; no hosted deployment.

## Stack and layout

- **Backend:** FastAPI (Python); the classifier runs in-process.
- **Frontend:** Next.js (React + Tailwind, Recharts for charts).
- **Distribution:** Docker Compose for others (`docker compose up`, then open http://localhost:3000); separate backend and frontend dev servers for development.
- **Layout:** `backend/` (FastAPI app plus the classifier package; the planned `src/pipeline.py` work moves here), `frontend/` (Next.js), `docker-compose.yml` at the root.

## Orchestrator model

- The **PM session** plans and delegates. It does no hands-on work itself.
- Every worker gets a self-contained brief with: goal, scope, what is not covered, verified facts, definition of done, and the line "if a permission check blocks you, stop and name the command".
- The brief quotes the user's approval verbatim.
- The PM verifies every worker report with read-only checks before ticking anything off.
- One scoped task per worker.
- Approval for one step never covers the next.
- Read-only research and verification workers use cheaper models.

## Safety rules

- Real statements stay in `data/raw/`. They never go into Git, chat or any cloud API.
- Nobody reads `data/raw/` contents into the conversation. Layout inspection happens only through an anonymized copy or a local script that masks digits and names.
- Never read, print or copy passwords or secrets. BCA e-statement PDFs may be password-protected; the user removes the password themselves.
- No `git init`, dependency installs or other environment changes without the user's explicit yes.

### App privacy rules

1. **No storage:** uploads are processed in memory and dropped after the response. No database, and uploads are never written to disk.
2. **No sensitive logs:** log only counts and timings, never descriptions or amounts.
3. **No outbound calls:** no analytics, no external fonts or CDNs, Next.js telemetry off (`NEXT_TELEMETRY_DISABLED=1`), bind to localhost by default.
4. **Email is off by default.** It works only with the user's own SMTP settings and shows a clear warning that the report leaves the machine.
5. **Synthetic model only in the repo:** the shipped model is trained only on synthetic data. Personal models and labels stay local and gitignored.
6. **Tests enforce these rules:** no files created during an upload; logs contain no descriptions.
7. **Browser storage: UI preferences, plus opt-in corrections.** The frontend may store exactly three keys in `localStorage`: `lang` (`en` | `id`), `theme` (`system` | `light` | `dark`) and `rememberLabels` (`on` | `off`). Only when the user turns on "Remember my corrections on this device" (off by default), the frontend may also keep the user's own corrections in one IndexedDB database (`scc-labels`), holding only description, category, direction and timestamp, plus an optional `hint` flag on rows imported from an old-format labels file (a hint pre-fills a suggestion, never trains a model, and keeps the row flagged for review): no amounts, dates, income or files. A visible "Forget my corrections" button deletes it. No sessionStorage or cookies. The corrections are sent with an upload so the server can train a throwaway model in memory; the server never stores them. A check script enforces this in CI. (D1 approved 2026-10-19; corrections exception approved by the user on 2026-10-23; `hint` flag approved 2026-10-24.)

## Index

**Agents** (`.claude/agents/`)
- `builder`: implements one PM brief; may change only `backend/`, `frontend/`, `docker-compose.yml`, `tests/`, `requirements.txt`, `.gitignore`, `README.md`, `PLAN.md` (and `src/` only while moving it into `backend/`).
- `auditor`: read-only verification; runs `pytest`, the CLI, a localhost-only FastAPI server and the Next.js lint/build/start, and reports pass/fail per check with evidence.

**Skills** (`.claude/skills/`)
- `state-snapshot`: what is true about the project now (files, known gaps, direction, open questions).
- `phase-runbook`: the phase checklists with an owner tag on every item.
