import type { Row } from "./types";

// A simplified client-side copy of merchant_key() in backend/classifier/insights.py:
// the first few meaningful words of a description, minus BCA and payment boilerplate.
const BOILERPLATE = [
  "transfer e banking", "e banking", "transaksi debit", "kredit otomatis", "debit otomatis",
  "bifast transfer", "transfer", "qris", "qr", "debit", "kartu", "card", "pembayaran", "bayar",
  "payment", "edc", "tgl", "db", "cr", "ftscy", "ws",
];
const BOILERPLATE_PATTERNS = BOILERPLATE.map((p) => new RegExp(`\\b${p}\\b`, "g"));
const MERCHANT_WORDS = 3;

/** "QRIS 123456 GRAB*FOOD JAKARTA" → "Grab Food Jakarta"; empty when nothing meaningful is left. */
export function merchantKey(description: string): string {
  let text = (description || "")
    .toLowerCase()
    .replace(/\d{2}[/-]\d{2}([/-]\d{2,4})?/g, " ")
    .replace(/\d{4,}/g, " ")
    .replace(/[^a-z\s]/g, " ");
  for (const pattern of BOILERPLATE_PATTERNS) text = text.replace(pattern, " ");
  return text
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, MERCHANT_WORDS)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export interface MerchantTotal {
  name: string;
  count: number;
  total: number;
  avg: number;
  /** Share of these rows' total amount (or of their count when there are no amounts). */
  share: number | null;
}

/** The top `limit` merchants of these rows by total amount (then count). */
export function topMerchants(rows: Row[], limit = 5): MerchantTotal[] {
  const byKey = new Map<string, { name: string; count: number; total: number }>();
  for (const r of rows) {
    const name = merchantKey(r.description);
    if (!name) continue;
    const entry = byKey.get(name) ?? { name, count: 0, total: 0 };
    entry.count += 1;
    entry.total += r.amount === null ? 0 : Math.abs(r.amount);
    byKey.set(name, entry);
  }
  const total = rows.reduce((sum, r) => sum + (r.amount === null ? 0 : Math.abs(r.amount)), 0);
  return [...byKey.values()]
    .sort((a, b) => b.total - a.total || b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((m) => ({
      ...m,
      avg: m.total / m.count,
      share: total > 0 ? m.total / total : rows.length > 0 ? m.count / rows.length : null,
    }));
}
