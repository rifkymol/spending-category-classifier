// Shapes returned by the FastAPI backend (backend/app/schemas.py).

export const CATEGORIES = ["food", "transport", "shopping", "bills", "transfer"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Row {
  id: number;
  date: string | null;
  description: string;
  amount: number | null;
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
}

export interface ClassifyResponse {
  rows: Row[];
  summary: Summary;
}
