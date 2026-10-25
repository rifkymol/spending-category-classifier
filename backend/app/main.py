"""FastAPI app: upload a transactions CSV or a BCA e-statement PDF, get categorized rows and totals back.

Privacy (see CLAUDE.md):
- Uploads are read into memory and dropped after the response. The file is the raw
  request body, not multipart, because Starlette spools multipart files over 1 MB
  to a temp file on disk. PDFs are parsed from memory too.
- Logs hold only method, path, status, duration and row counts. Never descriptions,
  amounts or exception messages, which can quote row data.
- The default model is trained in memory on the synthetic sample. No files are written.
- Uploads may carry the user's own corrections from the browser (JSON body). They train a
  throwaway model for that request only (classifier/personalize.py), dropped with the response.
- Every response carries security headers, and the data endpoints say Cache-Control: no-store,
  so results are never cached (SecurityHeaders below).

Run from the project root:
    .venv\\Scripts\\python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
"""

import base64
import binascii
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
from app.schemas import (
    Categories,
    CategoryTotal,
    MAX_FILE_B64_CHARS,
    ClassifyJsonRequest,
    ClassifyResponse,
    Health,
    Insights,
    ReportRequest,
    Row,
    Summary,
)
from classifier import categories
from classifier.i18n import normalize_lang, t
from classifier import CONFIDENCE_THRESHOLD, MEMORY_ATTR, build_model, classify, clean_description, load_transactions
from classifier.insights import compute_insights
from classifier.personalize import apply_labels, build_request_model
from classifier.importers import PdfPasswordRequired, UnsupportedPdf, parse_bca_pdf, statement_frame

logger = logging.getLogger("app")

CATEGORIES = categories.keys()
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_REPORT_BYTES = 10 * 1024 * 1024
# The JSON upload: the base64 file (at most 5 MB decoded) plus up to 20,000 short labels.
MAX_JSON_BYTES = 12 * 1024 * 1024
JSON_TYPE = "application/json"
ACCEPTED_TYPES = {"text/csv", "application/octet-stream", "application/pdf"}
SAMPLE_CSV = Path(__file__).resolve().parents[2] / "data" / "sample_transactions.csv"
ALLOWED_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]
REPORT_FORMATS = {
    "csv": "text/csv",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pdf": "application/pdf",
}


def load_sample() -> pd.DataFrame:
    """The synthetic training rows (description, category): the base of every model."""
    df = load_transactions(SAMPLE_CSV)
    return df.loc[df["category"].notna(), ["description", "category"]].reset_index(drop=True)


def load_model(sample: pd.DataFrame | None = None):
    """Return (model, kind). Uses MODEL_PATH if it points to a file, else trains on the synthetic sample."""
    model_path = os.environ.get("MODEL_PATH")
    if model_path and Path(model_path).is_file():
        return joblib.load(model_path), "custom"
    df = load_sample() if sample is None else sample
    model = build_model().fit(df["description"].map(clean_description), df["category"])
    setattr(model, MEMORY_ATTR, {})  # the shipped model knows no recipients
    return model, "synthetic"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Uvicorn configures only its own loggers, so give ours a plain stderr handler.
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(levelname)s:     %(name)s: %(message)s"))
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    app.state.sample = load_sample()
    app.state.model, app.state.model_kind = load_model(app.state.sample)
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
        labels = getattr(request.state, "label_count", None)
        extra = (f" rows={rows}" if rows is not None else "") + (f" labels={labels}" if labels is not None else "")
        logger.info("%s %s %d %.1fms%s", request.method, request.url.path, status, ms, extra)


SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"no-referrer"),
    # The API serves only JSON and files, never pages: nothing may load from or frame a response.
    (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'"),
    # Enforced only on no-cors loads (<img>, <script>, …): the frontend's fetch() is CORS mode and
    # is governed by CORSMiddleware, so this blocks embedding without affecting the app.
    (b"cross-origin-resource-policy", b"same-site"),
]
# Financial results: never kept by the browser cache or a proxy. Error responses included.
NO_STORE_PATHS = {"/api/classify", "/api/insights", "/api/report"}
NO_STORE_HEADERS = [(b"cache-control", b"no-store"), (b"pragma", b"no-cache")]


class SecurityHeaders:
    """Adds SECURITY_HEADERS to every response, and no-store to the data endpoints. Pure ASGI and
    the outermost middleware, so CORS preflights, 4xx errors and streamed bodies get them too."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        extra = SECURITY_HEADERS + (NO_STORE_HEADERS if scope["path"] in NO_STORE_PATHS else [])

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                names = {k.lower() for k, _ in message.get("headers", [])}
                message["headers"] = [*message.get("headers", []), *(h for h in extra if h[0] not in names)]
            await send(message)

        await self.app(scope, receive, send_with_headers)


app.add_middleware(SecurityHeaders)


def _validation_errors(errors) -> list[dict]:
    """Field locations and messages only: pydantic's `input` and `ctx` can echo row data."""
    return [{"loc": list(e.get("loc", ())), "msg": e.get("msg", ""), "type": e.get("type", "")} for e in errors]


@app.exception_handler(RequestValidationError)
async def request_validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": _validation_errors(exc.errors())})


# ---- helpers ---------------------------------------------------------------


def lang_param(lang: str | None) -> str:
    """The ?lang= query value as "en" or "id"; anything else is English."""
    return normalize_lang(lang)


async def read_body(request: Request, limit: int = MAX_UPLOAD_BYTES, what: str = "err_what_file",
                    lang: str = "en") -> bytes:
    """Read the request body into memory, refusing anything over `limit` bytes."""
    too_big = t(lang, "err_too_large", what=t(lang, what), mb=limit // (1024 * 1024))
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


def decode(raw: bytes, lang: str = "en") -> str:
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        pass
    try:
        return raw.decode("cp1252")
    except UnicodeDecodeError:
        raise HTTPException(400, t(lang, "err_encoding")) from None


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
    directions = result["direction"] if "direction" in result.columns else pd.Series([None] * n, index=result.index)

    rows = []
    for i, (idx, rec) in enumerate(result.iterrows()):
        source = rec["source"]
        rows.append(
            Row(
                id=i,
                date=_optional_text(dates[idx]),
                description=rec["description"],
                amount=_optional_float(amounts[idx]),
                direction=directions[idx] if directions[idx] in ("DB", "CR") else None,
                predicted=str(rec["predicted"]),
                # Rules, the memory and confirmed labels are certain; a review hint keeps the model's score.
                confidence=float(rec["model_confidence"]) if source == "model" or rec["needs_review"] else 1.0,
                needs_review=bool(rec["needs_review"]),
                source=source,
            )
        )
    return rows


def summarize(rows: list[Row]) -> Summary:
    """Per-category counts and totals of spending. Money-in rows (direction CR) are left out of
    the categories and counted separately. Totals use abs(amount); share is by amount, or by
    count if no amounts. total_rows and needs_review count every row."""
    money_in = [r for r in rows if r.direction == "CR"]
    spending = [r for r in rows if r.direction != "CR"]
    categories = CATEGORIES + sorted({r.predicted for r in spending} - set(CATEGORIES))
    counts = {c: 0 for c in categories}
    totals = {c: 0.0 for c in categories}
    for r in spending:
        counts[r.predicted] += 1
        if r.amount is not None:
            totals[r.predicted] += abs(r.amount)

    total_amount = sum(totals.values())
    spend_rows = len(spending)

    def share(c: str) -> float:
        if total_amount > 0:
            return round(totals[c] / total_amount, 4)
        return round(counts[c] / spend_rows, 4) if spend_rows else 0.0

    return Summary(
        total_rows=len(rows),
        needs_review=sum(r.needs_review for r in rows),
        total_amount=round(total_amount, 2),
        by_category=[
            CategoryTotal(category=c, count=counts[c], total_amount=round(totals[c], 2), share=share(c))
            for c in categories
        ],
        money_in_total=round(sum(abs(r.amount) for r in money_in if r.amount is not None), 2),
        money_in_count=len(money_in),
    )


def read_csv(raw: bytes, lang: str = "en") -> pd.DataFrame:
    try:
        return load_transactions(io.StringIO(decode(raw, lang)))
    except HTTPException:
        raise
    except (pd.errors.EmptyDataError, pd.errors.ParserError):  # both subclass ValueError, so check first
        raise HTTPException(400, t(lang, "err_csv_parse")) from None
    except ValueError as exc:  # missing description column; the message lists column names only
        _, _, found = str(exc).partition("Columns found: ")
        raise HTTPException(400, t(lang, "err_csv_columns", found=found) if found else str(exc)) from None


def read_pdf(raw: bytes, lang: str = "en") -> pd.DataFrame:
    """A BCA e-statement PDF as date, description, amount and direction columns. Parsed in memory."""
    try:
        return statement_frame(parse_bca_pdf(raw))
    except PdfPasswordRequired:
        raise HTTPException(400, t(lang, "err_pdf_password")) from None
    except UnsupportedPdf:
        raise HTTPException(400, t(lang, "err_pdf_unsupported")) from None
    except Exception as exc:  # log the type only: messages can quote row data
        logger.error("pdf import failed: %s", type(exc).__name__)
        raise HTTPException(400, t(lang, "err_pdf_unsupported")) from None


# ---- endpoints -------------------------------------------------------------


@app.get("/api/health", response_model=Health)
def health(request: Request) -> Health:
    return Health(status="ok", model=request.app.state.model_kind)


@app.get("/api/categories", response_model=Categories)
def list_categories(lang: str | None = Query(None)) -> Categories:
    """The categories and groups (classifier/categories.py) with names in `lang`."""
    return Categories.model_validate(categories.for_lang(lang_param(lang)))


@app.post("/api/classify", response_model=ClassifyResponse)
async def classify_upload(
    request: Request,
    threshold: float = Query(CONFIDENCE_THRESHOLD, ge=0.0, le=1.0),
    lang: str | None = Query(None),
) -> ClassifyResponse:
    """The statement as the raw body (text/csv or application/pdf), or as JSON
    {file: {content_type, data_b64}, labels: [...]} when the browser sends the user's corrections.
    With labels, a model is trained for this request only and dropped with the response
    (precedence: request labels > MODEL_PATH > synthetic)."""
    lang = lang_param(lang)
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type == JSON_TYPE:
        raw, content_type, labels = await read_json_upload(request, lang)
    elif content_type in ACCEPTED_TYPES:
        raw, labels = await read_body(request, lang=lang), []
    else:
        raise HTTPException(415, t(lang, "err_content_type"))
    if not raw.strip():
        raise HTTPException(400, t(lang, "err_empty"))

    is_pdf = content_type == "application/pdf" or raw.startswith(b"%PDF-")
    df = read_pdf(raw, lang) if is_pdf else read_csv(raw, lang)
    del raw

    try:
        if labels:
            personal = build_request_model(labels, request.app.state.sample, request.app.state.model)
            result = apply_labels(classify(df, personal.model, threshold), personal)
            del personal, labels
        else:
            result = classify(df, request.app.state.model, threshold)
        rows = to_rows(result)
        summary = summarize(rows)
        insights = compute_insights(rows, lang=lang)
    except Exception as exc:  # log the type only: messages can quote row data
        logger.error("classify failed: %s", type(exc).__name__)
        raise HTTPException(500, t(lang, "err_classify")) from None

    request.state.row_count = len(rows)
    return ClassifyResponse(rows=rows, summary=summary, insights=insights)


async def read_json_upload(request: Request, lang: str = "en") -> tuple[bytes, str, list[dict]]:
    """The JSON upload: (file bytes, content type, labels as dicts). Size-capped before parsing;
    validation errors never echo labels or file data; the file is decoded in memory only."""
    raw = await read_body(request, MAX_JSON_BYTES, "err_what_request", lang)
    try:
        body = ClassifyJsonRequest.model_validate_json(raw)
    except ValidationError as exc:
        raise RequestValidationError(
            [{**e, "loc": ("body", *e["loc"])} for e in exc.errors(include_url=False, include_input=False)]
        ) from None
    del raw
    too_big = t(lang, "err_too_large", what=t(lang, "err_what_file"), mb=MAX_UPLOAD_BYTES // (1024 * 1024))
    if len(body.file.data_b64) > MAX_FILE_B64_CHARS:
        raise HTTPException(413, too_big)
    try:
        data = base64.b64decode(body.file.data_b64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(400, t(lang, "err_file_b64")) from None
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, too_big)
    request.state.label_count = len(body.labels)
    return data, body.file.content_type, [lab.model_dump() for lab in body.labels]


async def read_rows(request: Request, lang: str = "en") -> ReportRequest:
    """The {rows, income_override} JSON body of /api/report and /api/insights. Read and validated
    by hand so its size can be capped before parsing and validation errors never echo row data
    (or the income)."""
    raw = await read_body(request, MAX_REPORT_BYTES, "err_what_request", lang)
    try:
        body = ReportRequest.model_validate_json(raw)
    except ValidationError as exc:
        raise RequestValidationError(
            [{**e, "loc": ("body", *e["loc"])} for e in exc.errors(include_url=False, include_input=False)]
        ) from None
    request.state.row_count = len(body.rows)
    return body


@app.post("/api/insights", response_model=Insights)
async def insights_endpoint(request: Request, lang: str | None = Query(None)) -> Insights:
    """Insights from the (possibly corrected) rows and an optional monthly income override.
    Stateless: nothing is kept after the response."""
    lang = lang_param(lang)
    body = await read_rows(request, lang)
    try:
        return Insights.model_validate(compute_insights(body.rows, body.income_override, lang))
    except Exception as exc:  # log the type only: messages can quote row data
        logger.error("insights failed: %s", type(exc).__name__)
        raise HTTPException(500, t(lang, "err_insights")) from None


@app.post("/api/report")
async def report(
    request: Request,
    format: Literal["csv", "xlsx", "pdf"] = Query("csv"),
    lang: str | None = Query(None),
) -> Response:
    """Build a report from the (possibly corrected) rows. The CSV report is a machine format and
    stays English; the Excel and PDF reports follow `lang`."""
    lang = lang_param(lang)
    body = await read_rows(request, lang)
    rows = body.rows
    summary = summarize(rows)
    try:
        if format == "csv":
            content = report_csv(rows, summary)
        else:
            builder = {"xlsx": report_xlsx, "pdf": report_pdf}[format]
            content = builder(rows, summary, compute_insights(rows, body.income_override, lang), lang)
    except Exception as exc:  # log the type only: messages can quote row data
        logger.error("report failed: %s", type(exc).__name__)
        raise HTTPException(500, t(lang, "err_report")) from None

    return Response(
        content=content,
        media_type=REPORT_FORMATS[format],
        headers={"Content-Disposition": f'attachment; filename="spending-report.{format}"'},
    )
