"""Request and response shapes for the API."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from classifier.categories import keys, migrate_key

# Generated from classifier/categories.py, the one list of category keys.
Category = Literal[tuple(keys())]
MAX_REPORT_ROWS = 50_000
MAX_LABELS = 20_000
MAX_LABEL_CHARS = 300
# base64 of the 5 MB file cap, with room for padding.
MAX_FILE_B64_CHARS = (5 * 1024 * 1024 + 2) // 3 * 4 + 4
MAX_INCOME = 1e12


class Row(BaseModel):
    id: int
    date: str | None
    description: str
    amount: float | None
    direction: Literal["DB", "CR"] | None = None  # from bank PDFs; CR is money in. None for CSV rows.
    predicted: str
    confidence: float
    needs_review: bool
    # memory: "same recipient, same category" from earlier labels; label: the user's own correction
    # sent from the browser with the upload (an exact match).
    source: Literal["rule", "model", "memory", "label"]


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
    # Saved = left over + moved to your savings (savings_transfer out). left_over = money in - total out.
    # left_over, saved and savings_rate are None when nothing came in (e.g. CSV uploads).
    left_over: float | None
    moved_to_savings: float
    saved: float | None
    savings_rate: float | None  # saved / money_in


class Merchant(BaseModel):
    merchant: str
    count: int
    total: float
    avg: float


class TopMerchants(BaseModel):
    by_total: list[Merchant]
    by_count: list[Merchant]


class TransferParty(BaseModel):
    """A transfer counterparty (recipient or source), grouped from the descriptions."""

    name: str
    count: int
    total: float
    avg: float
    share: float | None  # of transfers out (out_*) or of money in (in_by_total); None when that is 0


class CategoryTransfers(BaseModel):
    """One transfer-group category's counterparties; share is of that category's out or in total."""

    out_by_total: list[TransferParty]
    in_by_total: list[TransferParty]


class TopTransfers(BaseModel):
    """Over the whole Transfers group (savings_transfer included), plus per transfer category."""

    out_by_total: list[TransferParty]
    out_by_count: list[TransferParty]
    in_by_total: list[TransferParty]
    by_category: dict[str, CategoryTransfers]


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
    savings_transfers: float | None
    other_out: float | None


class BucketAmounts(BaseModel):
    needs: float
    wants: float
    savings: float


class ActualAmounts(BaseModel):
    needs: float
    wants: float
    savings: float | None  # saved per month: left over + moved to your savings; None without an income


class Budget503020(BaseModel):
    """Amounts and shares are for the statement period; the *_amounts, income_monthly, *_monthly
    and difference fields are per month (see classifier/insights.py)."""

    needs: float
    wants: float
    savings: float | None  # saved = left_over + savings_transfers; None without an income
    left_over: float | None  # income - all money out; None without an income
    savings_transfers: float  # money moved to the user's own savings or e-wallets (counts as savings)
    other_out: float  # family and friends, cash and other transfers: "Other money out"
    basis: Literal["money_in", "income_override", "total_out"]
    basis_amount: float
    shares: BudgetShares
    targets: dict[str, float]
    mapping: dict[str, list[str]]
    income_monthly: float | None
    income_source: Literal["money_in", "override"] | None
    target_amounts: BucketAmounts | None
    actual_amounts: ActualAmounts
    left_over_monthly: float | None
    savings_transfers_monthly: float
    other_out_monthly: float
    # target - actual. Needs/wants: positive = left under target. Savings: positive = short of target.
    difference: BucketAmounts | None


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
    top_transfers: TopTransfers
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
    """A row sent back for a report or insights: same shape as Row, but the category must be a known
    key. Old keys (before Phase 11, e.g. food) are mapped to their new keys first."""

    predicted: Category

    @field_validator("predicted", mode="before")
    @classmethod
    def _migrate(cls, value):
        return migrate_key(value) if isinstance(value, str) else value


class ReportRequest(BaseModel):
    rows: list[ReportRow] = Field(max_length=MAX_REPORT_ROWS)
    # Monthly income typed in by the user, for the 50/30/20 targets. Never stored.
    income_override: float | None = Field(None, ge=0, le=MAX_INCOME, allow_inf_nan=False)


class UploadedFile(BaseModel):
    """A statement inside the JSON upload body, base64 encoded. Decoded in memory only."""

    model_config = ConfigDict(extra="forbid")
    content_type: Literal["text/csv", "application/pdf"]
    data_b64: str  # its size is checked by the endpoint (413, like the raw-body upload)


class Label(BaseModel):
    """One of the user's corrections from the browser. Only these fields are accepted: no amounts,
    dates or income (data minimisation, CLAUDE.md rule 7). hint: imported from an old labels file
    whose key changed meaning, so it is a suggestion to review, not a confirmed label."""

    model_config = ConfigDict(extra="forbid")
    description: str = Field(min_length=1, max_length=MAX_LABEL_CHARS)
    category: Category
    direction: Literal["DB", "CR"] | None = None
    hint: bool = False


class ClassifyJsonRequest(BaseModel):
    """POST /api/classify with Content-Type application/json: the statement plus the user's labels."""

    model_config = ConfigDict(extra="forbid")
    file: UploadedFile
    labels: list[Label] = Field(default_factory=list, max_length=MAX_LABELS)


class CategoryInfo(BaseModel):
    key: str
    group: str
    bucket: Literal["needs", "wants", "savings", "other"]
    color: str
    name: str


class GroupInfo(BaseModel):
    key: str
    color: str
    name: str


class Categories(BaseModel):
    groups: list[GroupInfo]
    categories: list[CategoryInfo]
    other_color: str


class Health(BaseModel):
    status: Literal["ok"]
    model: Literal["synthetic", "custom"]
