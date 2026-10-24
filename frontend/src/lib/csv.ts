import type { Row } from "./types";

// Same rule as safe_text() in backend/app/reports.py: a text cell that starts with one of
// these would be read as a formula by a spreadsheet, so it gets a leading '.
const INJECTION_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

/** Prefix ' to text a spreadsheet would read as a formula. */
export function neutralizeFormula(value: string): string {
  return INJECTION_PREFIXES.some((p) => value.startsWith(p)) ? `'${value}` : value;
}

/** One CSV field (RFC 4180 quoting). Text is neutralized; numbers are written as-is. */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const text = neutralizeFormula(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export type LabelSource = "user" | "rule" | "memory" | "model";

/**
 * Where a row's category comes from, for training:
 * "user" if a person changed or confirmed it (now or in a remembered correction), "rule" if a keyword rule matched, "memory" if the
 * personal model's recipient memory (built from earlier labels) filled it in, "model" for an
 * unreviewed model guess (the CLI leaves these out of training).
 */
export function labelSource(r: Row): LabelSource {
  // A remembered correction is the user's own label; a review hint (needs_review) is only a guess.
  if (r.reviewed || (r.source === "label" && !r.needs_review)) return "user";
  return r.source === "rule" || r.source === "memory" ? r.source : "model";
}

// A machine format for `classify.py train`: the header and category keys stay English in every UI language.
export const LABEL_COLUMNS = ["date", "description", "amount", "direction", "category", "label_source"] as const;

/** The labels file for `backend/classify.py train`, as CSV text. */
export function labelsCsv(rows: Row[]): string {
  const lines = [LABEL_COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(
      [r.date, r.description, r.amount, r.direction ?? null, r.predicted, labelSource(r)].map(csvField).join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

/** labels-YYYY-MM-DD.csv, using the local date. */
export function labelsFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `labels-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`;
}
