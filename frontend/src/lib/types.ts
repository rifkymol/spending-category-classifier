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
