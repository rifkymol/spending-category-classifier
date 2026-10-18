"""FastAPI app: upload a transactions CSV, get categorized rows and totals back.

Privacy (see CLAUDE.md):
- Uploads are read into memory and dropped after the response. The CSV is the raw
  request body, not multipart, because Starlette spools multipart files over 1 MB
  to a temp file on disk.
- Logs hold only method, path, status, duration and row counts. Never descriptions,
  amounts or exception messages, which can quote row data.
- The default model is trained in memory on the synthetic sample. No files are written.

Run from the project root:
    .venv\\Scripts\\python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
"""

import io
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.reports import report_csv, report_pdf, report_xlsx
from app.schemas import CategoryTotal, ClassifyResponse, Health, ReportRequest, Row, Summary
from classifier import CONFIDENCE_THRESHOLD, build_model, classify, clean_description, load_transactions

logger = logging.getLogger("app")

CATEGORIES = ["food", "transport", "shopping", "bills", "transfer"]
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_REPORT_BYTES = 10 * 1024 * 1024
ACCEPTED_TYPES = {"text/csv", "application/octet-stream"}
SAMPLE_CSV = Path(__file__).resolve().parents[2] / "data" / "sample_transactions.csv"
ALLOWED_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]
REPORT_FORMATS = {
    "csv": "text/csv",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pdf": "application/pdf",
}


def load_model():
    """Return (model, kind). Uses MODEL_PATH if it points to a file, else trains on the synthetic sample."""
    model_path = os.environ.get("MODEL_PATH")
    if model_path and Path(model_path).is_file():
        return joblib.load(model_path), "custom"
    df = load_transactions(SAMPLE_CSV)
    df = df[df["category"].notna()]
    model = build_model().fit(df["description"].map(clean_description), df["category"])
    return model, "synthetic"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Uvicorn configures only its own loggers, so give ours a plain stderr handler.
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(levelname)s:     %(name)s: %(message)s"))
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    app.state.model, app.state.model_kind = load_model()
    logger.info("model ready: %s", app.state.model_kind)
    yield


app = FastAPI(title="Spending Category Classifier", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    expose_headers=["Content-Disposition"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
        return response
    finally:
        ms = (time.perf_counter() - start) * 1000
        rows = getattr(request.state, "row_count", None)
        extra = f" rows={rows}" if rows is not None else ""
        logger.info("%s %s %d %.1fms%s", request.method, request.url.path, status, ms, extra)


def _validation_errors(errors) -> list[dict]:
    """Field locations and messages only: pydantic's `input` and `ctx` can echo row data."""
    return [{"loc": list(e.get("loc", ())), "msg": e.get("msg", ""), "type": e.get("type", "")} for e in errors]


@app.exception_handler(RequestValidationError)
async def request_validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": _validation_errors(exc.errors())})


# ---- helpers ---------------------------------------------------------------


async def read_body(request: Request, limit: int = MAX_UPLOAD_BYTES, what: str = "File") -> bytes:
    """Read the request body into memory, refusing anything over `limit` bytes."""
    too_big = f"{what} is larger than {limit // (1024 * 1024)} MB."
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise HTTPException(413, too_big)
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            raise HTTPException(413, too_big)
        chunks.append(chunk)
    return b"".join(chunks)


def decode(raw: bytes) -> str:
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        pass
    try:
        return raw.decode("cp1252")
    except UnicodeDecodeError:
        raise HTTPException(400, "Could not read the file. Save it as UTF-8 CSV.") from None


def _optional_text(value) -> str | None:
    return None if pd.isna(value) else str(value)


def _optional_float(value) -> float | None:
    return None if pd.isna(value) else float(value)


def to_rows(result: pd.DataFrame) -> list[Row]:
    n = len(result)
    dates = result["date"] if "date" in result.columns else pd.Series([None] * n, index=result.index)
    if "amount" in result.columns:
        amounts = pd.to_numeric(result["amount"], errors="coerce")
    else:
        amounts = pd.Series([None] * n, index=result.index)

    rows = []
    for i, (idx, rec) in enumerate(result.iterrows()):
        is_rule = pd.notna(rec["rule_category"])
        rows.append(
            Row(
                id=i,
                date=_optional_text(dates[idx]),
                description=rec["description"],
                amount=_optional_float(amounts[idx]),
                predicted=str(rec["predicted"]),
                confidence=1.0 if is_rule else float(rec["model_confidence"]),
                needs_review=bool(rec["needs_review"]),
                source="rule" if is_rule else "model",
            )
        )
    return rows


def summarize(rows: list[Row]) -> Summary:
    """Per-category counts and totals. Totals use abs(amount); share is by amount, or by count if no amounts."""
    categories = CATEGORIES + sorted({r.predicted for r in rows} - set(CATEGORIES))
    counts = {c: 0 for c in categories}
    totals = {c: 0.0 for c in categories}
    for r in rows:
        counts[r.predicted] += 1
        if r.amount is not None:
            totals[r.predicted] += abs(r.amount)

    total_amount = sum(totals.values())
    total_rows = len(rows)

    def share(c: str) -> float:
        if total_amount > 0:
            return round(totals[c] / total_amount, 4)
        return round(counts[c] / total_rows, 4) if total_rows else 0.0

    return Summary(
        total_rows=total_rows,
        needs_review=sum(r.needs_review for r in rows),
        total_amount=round(total_amount, 2),
        by_category=[
            CategoryTotal(category=c, count=counts[c], total_amount=round(totals[c], 2), share=share(c))
            for c in categories
        ],
    )


# ---- endpoints -------------------------------------------------------------


@app.get("/api/health", response_model=Health)
def health(request: Request) -> Health:
    return Health(status="ok", model=request.app.state.model_kind)


@app.post("/api/classify", response_model=ClassifyResponse)
async def classify_upload(
    request: Request,
    threshold: float = Query(CONFIDENCE_THRESHOLD, ge=0.0, le=1.0),
) -> ClassifyResponse:
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type not in ACCEPTED_TYPES:
        raise HTTPException(415, "Send the CSV as the request body with Content-Type: text/csv.")

    raw = await read_body(request)
    if not raw.strip():
        raise HTTPException(400, "The file is empty.")

    try:
        df = load_transactions(io.StringIO(decode(raw)))
    except HTTPException:
        raise
    except (pd.errors.EmptyDataError, pd.errors.ParserError):  # both subclass ValueError, so check first
        raise HTTPException(400, "Could not parse the file as CSV.") from None
    except ValueError as exc:  # missing description column; the message lists column names only
        raise HTTPException(400, str(exc)) from None
    del raw

    try:
        result = classify(df, request.app.state.model, threshold)
        rows = to_rows(result)
        summary = summarize(rows)
    except Exception as exc:  # log the type only: messages can quote row data
        logger.error("classify failed: %s", type(exc).__name__)
        raise HTTPException(500, "Classification failed.") from None

    request.state.row_count = len(rows)
    return ClassifyResponse(rows=rows, summary=summary)


@app.post("/api/report")
async def report(
    request: Request,
    format: Literal["csv", "xlsx", "pdf"] = Query("csv"),
) -> Response:
    """Build a report from the (possibly corrected) rows. The JSON body is read and validated by hand
    so its size can be capped before parsing and validation errors never echo row data."""
    raw = await read_body(request, MAX_REPORT_BYTES, "Request")
    try:
        body = ReportRequest.model_validate_json(raw)
    except ValidationError as exc:
        raise RequestValidationError(
            [{**e, "loc": ("body", *e["loc"])} for e in exc.errors(include_url=False, include_input=False)]
        ) from None
    del raw

    rows = body.rows
    request.state.row_count = len(rows)
    summary = summarize(rows)
    try:
        builder = {"csv": report_csv, "xlsx": report_xlsx, "pdf": report_pdf}[format]
        content = builder(rows, summary)
    except Exception as exc:  # log the type only: messages can quote row data
        logger.error("report failed: %s", type(exc).__name__)
        raise HTTPException(500, "Could not build the report.") from None

    return Response(
        content=content,
        media_type=REPORT_FORMATS[format],
        headers={"Content-Disposition": f'attachment; filename="spending-report.{format}"'},
    )
