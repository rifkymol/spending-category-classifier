// Rupiah is always written id-ID style ("Rp 1.234.567"), in English and Indonesian alike.
// Dates, percentages and other numbers follow the active language: see lib/i18n.ts.
const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export const formatIDR = (value: number) => idr.format(value);

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
