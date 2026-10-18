import { CATEGORIES, type Row, type Summary } from "./types";

const round = (value: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

/**
 * Per-category counts and totals, mirroring summarize() in backend/app/main.py.
 * Totals use abs(amount); share is by amount, or by count when there are no amounts.
 */
export function summarize(rows: Row[]): Summary {
  const extra = [...new Set(rows.map((r) => r.predicted))]
    .filter((c) => !(CATEGORIES as readonly string[]).includes(c))
    .sort();
  const categories = [...CATEGORIES, ...extra];
  const counts = new Map(categories.map((c) => [c, 0]));
  const totals = new Map(categories.map((c) => [c, 0]));
  for (const r of rows) {
    counts.set(r.predicted, counts.get(r.predicted)! + 1);
    if (r.amount !== null) totals.set(r.predicted, totals.get(r.predicted)! + Math.abs(r.amount));
  }

  const totalAmount = [...totals.values()].reduce((a, b) => a + b, 0);
  const totalRows = rows.length;
  const share = (c: string) => {
    if (totalAmount > 0) return round(totals.get(c)! / totalAmount, 4);
    return totalRows ? round(counts.get(c)! / totalRows, 4) : 0;
  };

  return {
    total_rows: totalRows,
    needs_review: rows.filter((r) => r.needs_review).length,
    total_amount: round(totalAmount, 2),
    by_category: categories.map((c) => ({
      category: c,
      count: counts.get(c)!,
      total_amount: round(totals.get(c)!, 2),
      share: share(c),
    })),
  };
}

/** Returns a copy of rows with one row re-labelled by the user (no longer needs review). */
export function relabel(rows: Row[], id: number, category: string): Row[] {
  return rows.map((r) => (r.id === id ? { ...r, predicted: category, needs_review: false } : r));
}
