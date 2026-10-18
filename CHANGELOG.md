# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Each version maps to one development phase; commit hashes refer to `main` (phases 4 and 5 landed in one commit).

## [Unreleased]

### Added
- Portfolio docs: rewritten README, `PRIVACY.md`, `CONTRIBUTING.md`, this changelog and an MIT `LICENSE`.
- GitHub Actions CI: backend tests, frontend lint/typecheck/build, and `docker compose build`.

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
