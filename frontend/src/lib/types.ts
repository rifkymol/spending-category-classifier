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

export interface ClassifyResponse {
  rows: Row[];
  summary: Summary;
}
