import { saveBlob } from "./download";
import { translate, type Locale } from "./i18n";
import type { ClassifyResponse, Insights, Row } from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
export const MAX_BYTES = 5 * 1024 * 1024;
export const REVIEW_THRESHOLD = 0.6;
/** Same cap as MAX_INCOME in backend/app/schemas.py. */
export const MAX_INCOME = 1e12;

async function errorMessage(res: Response, locale: Locale): Promise<string> {
  try {
    const body = await res.json();
    // The API writes its own messages in the requested language (?lang=).
    if (typeof body?.detail === "string") return body.detail;
    if (res.status === 422) return translate(locale, "api.invalid");
  } catch {
    // not JSON; fall through
  }
  return translate(locale, "api.error", { status: res.status });
}

async function send(path: string, init: RequestInit, locale: Locale): Promise<Response> {
  const sep = path.includes("?") ? "&" : "?";
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}${sep}lang=${locale}`, { ...init, cache: "no-store" });
  } catch {
    throw new Error(translate(locale, "api.unreachable", { host: API_URL.replace(/^https?:\/\//, "") }));
  }
  if (!res.ok) throw new Error(await errorMessage(res, locale));
  return res;
}

export const isPdf = (file: File) => file.name.toLowerCase().endsWith(".pdf");

export async function classify(file: File, locale: Locale): Promise<ClassifyResponse> {
  const res = await send(
    `/api/classify?threshold=${REVIEW_THRESHOLD}`,
    {
      method: "POST",
      headers: { "Content-Type": isPdf(file) ? "application/pdf" : "text/csv" },
      body: file,
    },
    locale,
  );
  return res.json();
}

/** The JSON body of /api/insights and /api/report. The income is sent only when the user typed one. */
function rowsBody(rows: Row[], incomeOverride: number | null): string {
  return JSON.stringify(incomeOverride === null ? { rows } : { rows, income_override: incomeOverride });
}

/** Insights for the current (possibly corrected) rows and the entered income. Stateless on the server. */
export async function fetchInsights(
  rows: Row[],
  incomeOverride: number | null,
  locale: Locale,
  signal?: AbortSignal,
): Promise<Insights> {
  const res = await send(
    "/api/insights",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: rowsBody(rows, incomeOverride), signal },
    locale,
  );
  return res.json();
}

export const REPORT_FORMATS = ["csv", "xlsx", "pdf"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export async function downloadReport(
  rows: Row[],
  format: ReportFormat,
  incomeOverride: number | null,
  locale: Locale,
): Promise<void> {
  const res = await send(
    `/api/report?format=${format}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: rowsBody(rows, incomeOverride) },
    locale,
  );
  saveBlob(await res.blob(), `spending-report.${format}`);
}
