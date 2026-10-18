const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export const formatIDR = (value: number) => idr.format(value);
export const formatPercent = (share: number) => `${(share * 100).toFixed(1)}%`;

/** Fixed colors per category (Tailwind 600-ish shades; readable on white and as chart slices). */
export const CATEGORY_COLORS: Record<string, string> = {
  food: "#ea580c",
  transport: "#2563eb",
  shopping: "#db2777",
  bills: "#7c3aed",
  transfer: "#0d9488",
};
export const OTHER_COLOR = "#64748b";
export const colorFor = (category: string) => CATEGORY_COLORS[category] ?? OTHER_COLOR;
