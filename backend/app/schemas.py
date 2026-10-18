"""Request and response shapes for the API."""

from typing import Literal

from pydantic import BaseModel


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


class ReportRequest(BaseModel):
    rows: list[Row]


class Health(BaseModel):
    status: Literal["ok"]
    model: Literal["synthetic", "custom"]
