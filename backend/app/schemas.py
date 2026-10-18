"""Request and response shapes for the API."""

from typing import Literal

from pydantic import BaseModel, Field

Category = Literal["food", "transport", "shopping", "bills", "transfer"]
MAX_REPORT_ROWS = 50_000


class Row(BaseModel):
    id: int
    date: str | None
    description: str
    amount: float | None
    predicted: str
    confidence: float
    needs_review: bool
    source: Literal["rule", "model"]


class CategoryTotal(BaseModel):
    category: str
    count: int
    total_amount: float
    share: float


class Summary(BaseModel):
    total_rows: int
    needs_review: int
    total_amount: float
    by_category: list[CategoryTotal]


class ClassifyResponse(BaseModel):
    rows: list[Row]
    summary: Summary


class ReportRow(Row):
    """A row sent back for a report: same shape as Row, but the category must be one of the five."""

    predicted: Category


class ReportRequest(BaseModel):
    rows: list[ReportRow] = Field(max_length=MAX_REPORT_ROWS)


class Health(BaseModel):
    status: Literal["ok"]
    model: Literal["synthetic", "custom"]
