# Contributing

Thanks for your interest! This project handles bank statements, so the most important rule comes first:

> **Never commit, paste or attach a real bank statement**, or any text, screenshot, amount, account number or name taken from one. Not in code, tests, issues, pull requests or commit messages. Use synthetic data only.

## Development setup

You need Python 3.13 and Node.js 22 (Docker Desktop is optional, for the self-hosted build).

```bash
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
cd frontend && npm ci
```

On macOS or Linux, use `.venv/bin/python`. Then run the API and the UI as described in the [README](README.md#run-for-development).

## Running the checks

These are the same checks CI runs ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

```bash
.venv\Scripts\python -m pytest backend/tests -q -p no:cacheprovider
```

```bash
cd frontend && npm run lint && npm run build && npx tsc --noEmit -p .
```

```bash
docker compose build
```

`npm run build` generates `next-env.d.ts`, which the type check needs, so run it before `tsc` on a fresh checkout.

## Code style

- **Python:** keep [`backend/classifier/pipeline.py`](backend/classifier/pipeline.py) pure (no prints, logging or file writes). The CLI prints one-line errors and returns exit code 1. Match the surrounding style: type hints, short docstrings, comments that explain *why*.
- **TypeScript:** strict mode, Tailwind for styles, no external fonts, CDNs or analytics. Uploaded data lives only in React state.
- **Dependencies:** pin exact versions. A new Python runtime dependency goes in `backend/requirements-runtime.txt` *and* its full closure in `backend/requirements-runtime.lock` (see "Updating pinned versions" in the README). Prefer no new dependency at all.
- **Tests:** every behavior change comes with a test; every privacy-relevant change comes with a privacy test.

## Privacy rules every PR must keep

1. **No storage:** uploads are processed in memory and dropped after the response. No database, no temp files. Read request bodies raw; don't switch to multipart forms (they spool to disk).
2. **No sensitive logs:** log only counts and timings, never descriptions, amounts or names. Errors must not quote row data. Cap noisy third-party loggers (as done for `pdfminer`).
3. **No outbound calls:** no analytics, telemetry, external fonts, CDNs or remote APIs at runtime. Bind to `127.0.0.1` by default.
4. **Email stays off by default** and, if added, works only with the user's own SMTP settings and a clear warning.
5. **Synthetic model only in the repo:** the shipped model trains on synthetic data. Personal labels and models stay local and gitignored.
6. **Tests enforce these rules:** keep `test_upload_writes_no_files`, the PDF and report no-files tests and the `caplog` log tests passing, and extend them to any new input path.

See [PRIVACY.md](PRIVACY.md) for how each guarantee is enforced today.

## Adding a bank importer

Importers live in [`backend/classifier/importers/`](backend/classifier/importers/); [`bca_pdf.py`](backend/classifier/importers/bca_pdf.py) is the reference. Here is how it was built without a real statement ever leaving the developer's machine.

1. **Inspect the layout with a masked scan, locally.** Write a small local script (don't commit it) that opens your own statement and prints only its shape: replace every letter with `A` and every digit with `#`, and keep only an allowlist of known column headers and markers (for BCA: `TANGGAL`, `KETERANGAN`, `CBG`, `MUTASI`, `SALDO`, `DB`, `CR`). Print line positions and page breaks too. This shows columns, number formats and how descriptions wrap, without showing any real value. Keep real files in `data/raw/`, which is gitignored, and don't paste even the masked output anywhere public if it could identify you.
2. **Build a synthetic fixture first.** Generate a fake statement in the same layout in code (see [`backend/tests/bca_fixture.py`](backend/tests/bca_fixture.py), which uses `reportlab`): placeholder names, an all-zero account number, made-up merchants and amounts. Cover the hard cases: multi-line descriptions, a row continued across a page break, header/footer and summary lines that are not transactions, money in vs out, and a password-protected file.
3. **Write tests against the fixture, then the importer.** Expected rows, directions, statement period, that summary totals match the rows, clear errors for password-protected or unsupported files that don't quote row text, and privacy tests: no files written and no descriptions or amounts in logs at `DEBUG`.
4. **Wire it in.** Return a DataFrame with the same columns as `statement_frame` (`date`, `description`, `amount`, `direction`), detect the format in `backend/app/main.py` (magic bytes or content type), and add bank-specific abbreviations or noise words next to [`backend/classifier/bca.py`](backend/classifier/bca.py) if needed.
5. **Check it on your real file, locally and masked.** Print only counts and sums (rows by direction, total in and out) and compare them to the statement's own summary. Never print descriptions.
6. **Run a leak check before you commit.** Make a local list of distinctive tokens from your real statement (your name, account digits, unusual merchant strings), search the whole working tree and your staged diff for them, and make sure nothing matches. Then delete the list.
7. **Open the PR** with the synthetic fixture, the tests and aggregate results only.

## Pull requests

- Keep each PR focused on one change, and describe what you tested.
- Update the [README](README.md) and [CHANGELOG.md](CHANGELOG.md) (under `Unreleased`) when behavior changes.
- By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
