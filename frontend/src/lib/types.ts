// Shapes returned by the FastAPI backend (backend/app/schemas.py).

// The category keys come from the categories source (lib/categories.ts).
export { CATEGORIES } from "./categories";
/** A category key (see lib/categories.ts). */
export type Category = string;

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
  /** "memory": a personal model's "same recipient, same category" memory from earlier labels. */
  source: "rule" | "model" | "memory";
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

/** One transfer category's counterparties; share is of that category's out (or in) total. */
export interface CategoryTransfers {
  out_by_total: TransferParty[];
  in_by_total: TransferParty[];
}

export interface Insights {
  cash_flow: {
    money_in: number;
    money_in_count: number;
    total_out: number;
    out_count: number;
    /** Money out outside the Transfers group (Needs + Wants). */
    living_spend: number;
    /** The whole Transfers group, savings_transfer included. */
    transfers_out: number;
    /** Saved = left over + moved to your savings. left_over = money in − total out; moved_to_savings =
     * savings_transfer out. left_over, saved and savings_rate are null when nothing came in (e.g. CSV uploads). */
    left_over: number | null;
    moved_to_savings: number;
    saved: number | null;
    /** saved / money_in. */
    savings_rate: number | null;
  };
  top_merchants: { by_total: Merchant[]; by_count: Merchant[] };
  /** Transfers-group rows by counterparty (rent, debt, family and donations stay trackable), and the
   * same per transfer category. */
  top_transfers: {
    out_by_total: TransferParty[];
    out_by_count: TransferParty[];
    in_by_total: TransferParty[];
    by_category: Record<string, CategoryTransfers>;
  };
  small_spends: { threshold: number; count: number; total: number; share_of_living: number | null };
  fees: { count: number; total: number };
  /** 50/30/20 v2: needs = the Needs group, wants = the Wants group, savings = saved = left over
   * (income − all money out) + moved to your savings (savings_transfer), and "other money out"
   * (family and friends, cash, other transfers) shown on its own. */
  budget_503020: {
    /** Statement-period amounts and shares. */
    needs: number;
    wants: number;
    /** Income minus spending; null without an income. */
    savings: number | null;
    /** Income − all money out; null without an income. */
    left_over: number | null;
    savings_transfers: number;
    other_out: number;
    basis: "money_in" | "income_override" | "total_out";
    basis_amount: number;
    shares: {
      needs: number | null;
      wants: number | null;
      savings: number | null;
      savings_transfers: number | null;
      other_out: number | null;
    };
    targets: Record<Bucket, number>;
    mapping: Record<string, string[]>;
    /** Per month: the entered income, else money in scaled to a month, else null (e.g. CSV uploads). */
    income_monthly: number | null;
    income_source: "money_in" | "override" | null;
    /** Per month: targets × income. Null without an income. */
    target_amounts: Record<Bucket, number> | null;
    /** Per month. Savings = left over + moved to your savings; null without an income. */
    actual_amounts: { needs: number; wants: number; savings: number | null };
    left_over_monthly: number | null;
    savings_transfers_monthly: number;
    other_out_monthly: number;
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
