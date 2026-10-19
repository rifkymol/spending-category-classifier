const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export const formatIDR = (value: number) => idr.format(value);
export const formatPercent = (share: number) => `${(share * 100).toFixed(1)}%`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-22" → "22 Sep" (or "22 Sep 2026" with the year). Anything else is returned unchanged. */
export function formatDate(value: string | null, withYear = false): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return value;
  const day = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
  return withYear ? `${day} ${m[1]}` : day;
}

/** Calm category colors, readable on the light and dark canvas and as chart slices. */
export const CATEGORY_COLORS: Record<string, string> = {
  food: "#D85A30",
  transport: "#378ADD",
  shopping: "#D4537E",
  bills: "#7F77DD",
  transfer: "#1D9E75",
};
export const OTHER_COLOR = "#888780";
export const colorFor = (category: string) => CATEGORY_COLORS[category] ?? OTHER_COLOR;
