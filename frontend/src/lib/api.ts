import { saveBlob } from "./download";
import type { ClassifyResponse, Row } from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
export const MAX_BYTES = 5 * 1024 * 1024;
export const REVIEW_THRESHOLD = 0.6;

const UNREACHABLE = `Could not reach the API. Is the API running on ${API_URL.replace(/^https?:\/\//, "")}?`;

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
    if (res.status === 422) return "The report request was not valid. Check that every row has a category.";
  } catch {
    // not JSON; fall through
  }
  return `The API returned an error (${res.status}).`;
}

async function send(path: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, cache: "no-store" });
  } catch {
    throw new Error(UNREACHABLE);
  }
  if (!res.ok) throw new Error(await errorMessage(res));
  return res;
}

export const isPdf = (file: File) => file.name.toLowerCase().endsWith(".pdf");

export async function classify(file: File): Promise<ClassifyResponse> {
  const res = await send(`/api/classify?threshold=${REVIEW_THRESHOLD}`, {
    method: "POST",
    headers: { "Content-Type": isPdf(file) ? "application/pdf" : "text/csv" },
    body: file,
  });
  return res.json();
}

export const REPORT_FORMATS = [
  { value: "csv", label: "CSV" },
  { value: "xlsx", label: "Excel" },
  { value: "pdf", label: "PDF" },
] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number]["value"];

export async function downloadReport(rows: Row[], format: ReportFormat = "csv"): Promise<void> {
  const res = await send(`/api/report?format=${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows }),
  });
  saveBlob(await res.blob(), `spending-report.${format}`);
}
