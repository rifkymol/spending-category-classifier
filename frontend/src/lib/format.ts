// Rupiah is always written id-ID style ("Rp 1.234.567"), in English and Indonesian alike.
// Dates, percentages and other numbers follow the active language: see lib/i18n.ts.
const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export const formatIDR = (value: number) => idr.format(value);

// Category and group colors come from the categories source (lib/categories.ts).
export { OTHER_COLOR, colorFor, groupColor } from "./categories";
