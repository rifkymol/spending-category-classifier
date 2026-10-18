import { CATEGORIES, type Row, type Summary } from "./types";

const round = (value: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

/** Money in (direction CR) is not spending. */
export const isMoneyIn = (r: Row) => r.direction === "CR";

/**
 * Per-category counts and totals, mirroring summarize() in backend/app/main.py.
 * Money-in rows are left out of the categories and counted separately.
 * Totals use abs(amount); share is by amount, or by count when there are no amounts.
 * total_rows and needs_review count every row.
 */
export function summarize(rows: Row[]): Summary {
  const moneyIn = rows.filter(isMoneyIn);
  const spending = rows.filter((r) => !isMoneyIn(r));
  const extra = [...new Set(spending.map((r) => r.predicted))]
    .filter((c) => !(CATEGORIES as readonly string[]).includes(c))
    .sort();
  const categories = [...CATEGORIES, ...extra];
  const counts = new Map(categories.map((c) => [c, 0]));
  const totals = new Map(categories.map((c) => [c, 0]));
  for (const r of spending) {
    counts.set(r.predicted, counts.get(r.predicted)! + 1);
    if (r.amount !== null) totals.set(r.predicted, totals.get(r.predicted)! + Math.abs(r.amount));
  }

  const totalAmount = [...totals.values()].reduce((a, b) => a + b, 0);
  const spendRows = spending.length;
  const share = (c: string) => {
    if (totalAmount > 0) return round(totals.get(c)! / totalAmount, 4);
    return spendRows ? round(counts.get(c)! / spendRows, 4) : 0;
  };

  return {
    total_rows: rows.length,
    needs_review: rows.filter((r) => r.needs_review).length,
    total_amount: round(totalAmount, 2),
    by_category: categories.map((c) => ({
      category: c,
      count: counts.get(c)!,
      total_amount: round(totals.get(c)!, 2),
      share: share(c),
    })),
    money_in_total: round(
      moneyIn.reduce((sum, r) => sum + (r.amount === null ? 0 : Math.abs(r.amount)), 0),
      2,
    ),
    money_in_count: moneyIn.length,
  };
}

/** Returns a copy of rows with one row re-labelled by the user (no longer needs review). */
export function relabel(rows: Row[], id: number, category: string): Row[] {
  return rows.map((r) => (r.id === id ? { ...r, predicted: category, needs_review: false } : r));
}
