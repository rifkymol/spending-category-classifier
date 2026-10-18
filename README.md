# Spending Category Auto-Classifier

Automatically categorize bank transactions from their text descriptions, so you don't have to tag every transaction by hand. The model handles the easy ones, and you only correct the mistakes.

**Status:** Idea, not started
**Difficulty:** Beginner to intermediate
**Estimated time:** About 1 to 2 weekends
**Estimated cost:** $0 (everything runs locally)

## Goal

Predict a category (food, transport, shopping, bills, and so on) for each transaction from its description, such as "GRAB*FOOD" or "SHOPEE", with a review step for uncertain cases.

## Self-host with Docker

The easiest way to run the whole app (API plus web UI) on your own machine.

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and **running** (on Windows and macOS, start Docker Desktop before the commands below). Nothing else is needed: no Python or Node.js.

From the project root:

```bash
docker compose up --build
```

Then open http://127.0.0.1:3000.

- The first build downloads the official `python:3.13-slim` and `node:22-alpine` base images plus the Python and npm packages, so it takes a few minutes. Later starts reuse them and are fast.
- The API waits until its model is ready (about a few seconds); the web container starts only after the API reports healthy.
- Stop it with **Ctrl+C**, or run `docker compose down` from another terminal (this also removes the containers; no data is lost because none is stored).

**Use your own model (optional):** train one with `python backend/classify.py train ...` (see "Usage"), copy the `.joblib` file to `./models/model.joblib`, and uncomment the `environment` and `volumes` lines under `api` in `docker-compose.yml`. The folder is mounted read-only. `models/` is gitignored and excluded from the image build.

**Changing the API URL:** the browser calls the API directly, so its address is baked into the web bundle at build time through the `NEXT_PUBLIC_API_URL` build arg (default `http://127.0.0.1:8000`, set under `web.build.args` in `docker-compose.yml`). If you change it, or open the UI on another address than `http://127.0.0.1:3000` or `http://localhost:3000`, also add that UI origin to `ALLOWED_ORIGINS` in `backend/app/main.py` (CORS), then rebuild with `docker compose up --build`.

## Run for development

Run the API and the web UI as two local dev servers instead of containers. You need Python 3.10+ and Node.js 22.

```bash
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

In a second terminal:

```bash
cd frontend && npm install && npm run dev
```

Open http://127.0.0.1:3000. (On macOS or Linux, use `.venv/bin/python`.) `requirements.txt` installs the runtime packages from `backend/requirements-runtime.txt` plus `pytest` and `httpx` for the tests; the Docker image installs the runtime file only. More detail is in "Run the API" and "Run the web app" below.

## Approach

1. **Export data:** 3 to 6 months of transactions as CSV from the bank app.
2. **Clean descriptions:** lowercase, strip reference numbers, dates, and branch codes.
3. **Keyword rules first:** map obvious merchants (GRAB, SHOPEE, and so on) directly. This covers a large share with no ML.
4. **Label about 200 transactions by hand** for the rest.
5. **Baseline model:** TF-IDF plus logistic regression.
6. **Improve:** add sentence embeddings (for example, a MiniLM model) and compare the results.
7. **Confidence threshold:** below a set score, ask the user instead of guessing.
8. **Review screen:** confirm or fix predictions. Each correction becomes new training data.

## Stack

- Python 3.10+
- `pandas` (CSV handling)
- `scikit-learn` (TF-IDF, logistic regression, evaluation)
- `sentence-transformers` (embeddings, optional)
- Simple UI later: Streamlit or a CLI prompt

## Usage

The classifier core and CLI live under `backend/`. Run these from the project root:

```bash
pip install -r requirements.txt
python backend/classify.py evaluate data/sample_transactions.csv   # cross-validated accuracy, rule coverage, review share
python backend/classify.py train data/sample_transactions.csv      # saves backend/models/model.joblib
python backend/classify.py predict data/sample_transactions.csv --out data/predictions.csv
```

`predict` does not need a `category` column. Use `--threshold` (default 0.6) to change when rows are flagged for review. Run the tests with `pytest backend`.

## Run the API

The FastAPI app lives in `backend/app/`. Start it from the project root (it binds to 127.0.0.1 only):

```bash
.venv\Scripts\python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

On startup it trains a model in memory on the synthetic `data/sample_transactions.csv`. Set `MODEL_PATH` to a joblib file (for example one saved by `classify.py train`) to use your own model instead. No files are written either way.

| Endpoint | What it does |
|---|---|
| `GET /api/health` | `{"status": "ok", "model": "synthetic" or "custom"}` |
| `POST /api/classify?threshold=0.6` | Body: the raw CSV (`Content-Type: text/csv`, max 5 MB, needs a `description` column; `date` and `amount` are optional). Returns rows with `predicted`, `confidence`, `needs_review` and `source` (`rule` or `model`), plus per-category totals. |
| `POST /api/report?format=csv` | Body: `{"rows": [...]}` (the rows from `/api/classify`, with any corrected `predicted` values). `format` is `csv` (default), `xlsx` or `pdf`; see "Reports". |

```bash
curl -X POST --data-binary @data/sample_transactions.csv -H "Content-Type: text/csv" http://127.0.0.1:8000/api/classify
```

Uploads are read into memory and dropped after the response; the CSV is sent as the raw body rather than a multipart form so it is never spooled to disk. Logs hold only the method, path, status, duration and row count.

## Reports

After reviewing, pick a format next to **Download report** in the web app, or call `POST /api/report?format=...` directly. Every report is built in memory and streamed back; nothing is written to disk.

| Format | File | Contents |
|---|---|---|
| CSV | `spending-report.csv` | Per-category summary (count, total, share), a blank line, then every row. |
| Excel | `spending-report.xlsx` | A **Summary** sheet (generated date, period, total spend, rows needing review, per-category table in `#,##0` IDR and `0.0%`, and a pie chart) and a **Transactions** sheet with a frozen header and filters. |
| PDF | `spending-report.pdf` | A4 summary: totals in `Rp 6.731.990` style, a pie chart in the same category colors as the web app, a category table and the full transaction list (header repeats on each page). Uses built-in Helvetica only, so no fonts are fetched. |

```bash
curl -X POST -H "Content-Type: application/json" --data-binary @rows.json -o spending-report.xlsx "http://127.0.0.1:8000/api/report?format=xlsx"
```

Safety and limits:

- **Formula injection:** any text cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading `'`, so Excel and LibreOffice show it as text instead of running it. Numbers stay numbers (negative amounts are untouched).
- **Validation:** `predicted` must be one of `food`, `transport`, `shopping`, `bills`, `transfer`. An unknown format or category returns 422 with field locations and messages only; the submitted rows are never echoed back.
- **Size:** the request body is capped at 10 MB (413) and at 50,000 rows (422).

## Run the web app

The UI is a Next.js app in `frontend/`. It talks to the API above straight from your browser; nothing goes anywhere else.

1. Start the API (see "Run the API"), so it listens on http://127.0.0.1:8000.
2. In a second terminal:

   ```bash
   cd frontend && npm install && npm run dev
   ```

3. Open http://127.0.0.1:3000, drop in a CSV (or use the sample link on the page), review flagged rows, fix categories and download the report as CSV, Excel or PDF.

For a production build, use `npm run build` and then `npm run start`. Both servers bind to `127.0.0.1` only. Next.js telemetry is turned off in every npm script (`NEXT_TELEMETRY_DISABLED=1`), and the page loads no external fonts, CDNs or analytics. Uploaded data lives only in the page's memory; reloading or clicking "Start over" clears it. To point the UI at a different API address, copy `frontend/.env.example` to `frontend/.env.local` and set `NEXT_PUBLIC_API_URL`.

## Privacy

Bank statements are sensitive, so the app is built to keep them on your machine and out of storage.

- **Processed in memory, never stored.** An uploaded CSV is read into memory, classified and dropped when the response is sent. There is no database, uploads are never written to disk, and reports are built in memory too. In the browser, your data lives only in the page; reloading or "Start over" clears it.
- **Read-only containers.** With Docker, both containers run with a read-only filesystem, as a non-root user, with all Linux capabilities dropped and `no-new-privileges`. The only writable places are `/tmp` (and Next.js's cache folder), which are `tmpfs`: they live in RAM and vanish when the container stops. No volumes hold your data.
- **Only localhost ports.** The ports are published as `127.0.0.1:3000` and `127.0.0.1:8000`, so only your own computer can reach the app, not other devices on your network. The dev servers also bind to `127.0.0.1`.
- **No analytics, telemetry or outbound calls.** The app loads no external fonts, CDNs or trackers, and Next.js telemetry is off (`NEXT_TELEMETRY_DISABLED=1`) in the image and in every npm script. The only downloads happen while *building* the images (base images and packages); the running app talks to nothing outside your machine.
- **Logs hold no transaction data.** The API logs only method, path, status, duration and row count, never descriptions or amounts.
- **The bundled model is synthetic only.** By default the API trains at startup on `data/sample_transactions.csv`, 40 made-up rows. Your own model and labels stay local and are gitignored (`models/`, `*.joblib`) and excluded from the Docker build (`.dockerignore`), as is `data/` apart from the sample.

**Check it yourself:**

- `docker compose config` shows the published ports with `host_ip: 127.0.0.1`, plus `read_only: true`, `cap_drop: [ALL]` and the `tmpfs` mounts.
- `docker compose ps` (while running) lists the ports as `127.0.0.1:3000->3000/tcp` and `127.0.0.1:8000->8000/tcp`.
- In your browser's developer tools (Network tab), every request after the page loads goes only to `127.0.0.1:3000` or `127.0.0.1:8000`.
- `docker compose logs api` shows counts and timings only.
- Run the privacy tests: `.venv\Scripts\python -m pytest backend/tests` (they check that an upload creates no files and that logs contain no descriptions or amounts).

Also: don't commit real statements to Git. Keep them in `data/raw/`, which is gitignored.

## Open questions

- Which categories do you want? Keep the list short at first (5 to 8).
- Do you want the classifier to also flag unusual spending?
- Export format: does your bank's CSV have consistent column names?
