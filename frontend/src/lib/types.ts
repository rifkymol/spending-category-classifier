// Shapes returned by the FastAPI backend (backend/app/schemas.py).

export const CATEGORIES = ["food", "transport", "shopping", "bills", "transfer"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Row {
  id: number;
  date: string | null;
  description: string;
  amount: number | null;
  /** From bank PDFs: "CR" is money in, "DB" money out. Null for CSV rows (all spending). */
  direction?: "DB" | "CR" | null;
  predicted: string;
  confidence: number;
  needs_review: boolean;
  source: "rule" | "model";
  /** Client-only: a person changed or confirmed this row's category. */
  reviewed?: boolean;
  /** Client-only: the row needed review when it arrived (kept after review clears needs_review). */
  was_flagged?: boolean;
}

export interface CategoryTotal {
  category: string;
  count: number;
  total_amount: number;
  share: number;
}

export interface Summary {
  total_rows: number;
  needs_review: number;
  total_amount: number;
  by_category: CategoryTotal[];
  money_in_total: number;
  money_in_count: number;
}

/** The 50/30/20 buckets. */
export type Bucket = "needs" | "wants" | "savings";

/** Spending insights for one statement (backend/classifier/insights.py). Amounts are positive Rp. */
export interface Merchant {
  merchant: string;
  count: number;
  total: number;
  avg: number;
}

/** A transfer counterparty grouped from the descriptions (backend transfer_key). share is of
 * transfers out (out_*) or of money in (in_by_total); null when that total is 0. */
export interface TransferParty {
  name: string;
  count: number;
  total: number;
  avg: number;
  share: number | null;
}

export interface Insights {
  cash_flow: {
    money_in: number;
    money_in_count: number;
    total_out: number;
    out_count: number;
    /** Money out that is not a transfer. */
    living_spend: number;
    transfers_out: number;
    net: number;
    /** net / money_in; null when nothing came in (e.g. CSV uploads). */
    savings_rate: number | null;
  };
  top_merchants: { by_total: Merchant[]; by_count: Merchant[] };
  /** Transfers by counterparty: rent, debt, family and donations stay trackable. */
  top_transfers: { out_by_total: TransferParty[]; out_by_count: TransferParty[]; in_by_total: TransferParty[] };
  small_spends: { threshold: number; count: number; total: number; share_of_living: number | null };
  fees: { count: number; total: number };
  budget_503020: {
    /** Statement-period amounts and shares. */
    needs: number;
    wants: number;
    /** Income minus all money out; null without an income. */
    savings: number | null;
    unclassified_transfers: number;
    basis: "money_in" | "income_override" | "total_out";
    basis_amount: number;
    shares: { needs: number | null; wants: number | null; savings: number | null; unclassified_transfers: number | null };
    targets: Record<Bucket, number>;
    mapping: Record<string, string[]>;
    /** Per month: the entered income, else money in scaled to a month, else null (e.g. CSV uploads). */
    income_monthly: number | null;
    income_source: "money_in" | "override" | null;
    /** Per month: targets × income. Null without an income. */
    target_amounts: Record<Bucket, number> | null;
    /** Per month. Savings = income − all money out (transfers count as money out); null without an income. */
    actual_amounts: { needs: number; wants: number; savings: number | null };
    transfers_monthly: number;
    /** target − actual, per month. Needs/wants: positive = left under the target, negative = over.
     * Savings: positive = short of the target; zero or negative = on track. Null without an income. */
    difference: Record<Bucket, number> | null;
  };
  period: { start: string | null; end: string | null; days: number | null; months_factor: number };
  /** Spend per category scaled to one month. */
  per_month: Record<string, number>;
  highlights: { text: string; impact_rp: number }[];
  disclaimer: string;
}

export interface ClassifyResponse {
  rows: Row[];
  summary: Summary;
  insights: Insights;
}
