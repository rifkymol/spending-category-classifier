# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Each version maps to one development phase; commit hashes refer to `main` (phases 4 and 5 landed in one commit).

## [Unreleased]

### Added
- Portfolio docs: rewritten README, `PRIVACY.md`, `CONTRIBUTING.md`, this changelog and an MIT `LICENSE`.
- GitHub Actions CI: backend tests, frontend lint/typecheck/build, and `docker compose build`.
- Dark mode that follows the system setting (`prefers-color-scheme`); every color is a design token that swaps in dark mode.
- Bundled Inter 4.1 variable font (`frontend/src/app/fonts/`, SIL OFL 1.1), loaded with `next/font/local` and served by the app itself. No runtime font fetch.
- Custom, keyboard-accessible controls with no new dependencies: a category picker (pill + listbox popover with arrow keys, Home/End, type-ahead, Enter/Space, Esc/Tab), segmented controls (report format, table filters, merchant sort) and ranked bar lists.

### Changed
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
