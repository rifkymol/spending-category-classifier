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
    direction: Literal["DB", "CR"] | None = None  # from bank PDFs; CR is money in. None for CSV rows.
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
    total_amount: float  # spending only: rows that are not money in
    by_category: list[CategoryTotal]
    money_in_total: float = 0.0
    money_in_count: int = 0


class CashFlow(BaseModel):
    money_in: float
    money_in_count: int
    total_out: float
    out_count: int
    living_spend: float  # money out that is not a transfer
    transfers_out: float
    net: float
    savings_rate: float | None  # net / money_in; None when nothing came in (e.g. CSV uploads)


class Merchant(BaseModel):
    merchant: str
    count: int
    total: float
    avg: float


class TopMerchants(BaseModel):
    by_total: list[Merchant]
    by_count: list[Merchant]


class SmallSpends(BaseModel):
    threshold: int
    count: int
    total: float
    share_of_living: float | None


class Fees(BaseModel):
    count: int
    total: float


class BudgetShares(BaseModel):
    needs: float | None
    wants: float | None
    savings: float | None
    unclassified_transfers: float | None


class Budget503020(BaseModel):
    needs: float
    wants: float
    savings: float | None
    unclassified_transfers: float
    basis: Literal["money_in", "total_out"]
    basis_amount: float
    shares: BudgetShares
    targets: dict[str, float]
    mapping: dict[str, list[str]]


class Period(BaseModel):
    start: str | None
    end: str | None
    days: int | None
    months_factor: float  # multiply statement totals by this to get per-month figures


class Highlight(BaseModel):
    text: str
    impact_rp: float


class Insights(BaseModel):
    cash_flow: CashFlow
    top_merchants: TopMerchants
    small_spends: SmallSpends
    fees: Fees
    budget_503020: Budget503020
    period: Period
    per_month: dict[str, float]
    highlights: list[Highlight]
    disclaimer: str


class ClassifyResponse(BaseModel):
    rows: list[Row]
    summary: Summary
    insights: Insights


class ReportRow(Row):
    """A row sent back for a report: same shape as Row, but the category must be one of the five."""

    predicted: Category


class ReportRequest(BaseModel):
    rows: list[ReportRow] = Field(max_length=MAX_REPORT_ROWS)


class Health(BaseModel):
    status: Literal["ok"]
    model: Literal["synthetic", "custom"]
