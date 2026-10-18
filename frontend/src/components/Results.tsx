"use client";

import { useMemo, useState } from "react";
import CategoryChart from "./CategoryChart";
import TransactionsTable from "./TransactionsTable";
import { REPORT_FORMATS, downloadReport, type ReportFormat } from "@/lib/api";
import { colorFor, formatIDR, formatPercent } from "@/lib/format";
import { relabel, summarize } from "@/lib/summary";
import type { Row } from "@/lib/types";

interface Props {
  rows: Row[];
  fileName: string;
  onChange: (rows: Row[]) => void;
  onReset: () => void;
}

function Card({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" }) {
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-sm ${tone === "warn" ? "border-amber-300" : "border-slate-200"}`}>
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "warn" ? "text-amber-800" : ""}`}>{value}</dd>
    </div>
  );
}

export default function Results({ rows, fileName, onChange, onReset }: Props) {
  const summary = useMemo(() => summarize(rows), [rows]);
  const hasAmounts = summary.total_amount > 0;
  const [format, setFormat] = useState<ReportFormat>("csv");
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      await downloadReport(rows, format);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the report.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          Results for <span className="font-medium text-slate-900">{fileName}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <div className="flex">
            <label htmlFor="report-format" className="sr-only">
              Report format
            </label>
            <select
              id="report-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as ReportFormat)}
              disabled={downloading}
              className="rounded-l-lg border border-r-0 border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-60"
            >
              {REPORT_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={download}
              disabled={downloading}
              className="rounded-r-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-60"
            >
              {downloading ? "Preparing…" : "Download report"}
            </button>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            Start over
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <dl className={`grid gap-4 sm:grid-cols-2 ${summary.money_in_total > 0 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <Card label="Total spend" value={hasAmounts ? formatIDR(summary.total_amount) : "—"} />
        {summary.money_in_total > 0 && (
          <Card
            label={`Money in (${summary.money_in_count.toLocaleString("id-ID")}, not counted as spend)`}
            value={formatIDR(summary.money_in_total)}
          />
        )}
        <Card label="Transactions" value={summary.total_rows.toLocaleString("id-ID")} />
        <Card
          label="Need review"
          value={summary.needs_review.toLocaleString("id-ID")}
          tone={summary.needs_review ? "warn" : "default"}
        />
      </dl>

      <div className="grid gap-6 lg:grid-cols-5">
        <section aria-labelledby="chart-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3">
          <h2 id="chart-heading" className="font-semibold">
            {hasAmounts ? "Share of spend by category" : "Share of transactions by category"}
          </h2>
          <CategoryChart summary={summary} byAmount={hasAmounts} />
        </section>

        <section aria-labelledby="totals-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 id="totals-heading" className="font-semibold">
            Totals by category
          </h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th scope="col" className="py-2 font-medium">Category</th>
                <th scope="col" className="py-2 text-right font-medium">Count</th>
                <th scope="col" className="py-2 text-right font-medium">Total</th>
                <th scope="col" className="py-2 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody>
              {summary.by_category.map((c) => (
                <tr key={c.category} className="border-b border-slate-100 last:border-0">
                  <th scope="row" className="py-2 text-left font-normal capitalize">
                    <span className="flex items-center gap-2">
                      <span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ background: colorFor(c.category) }} />
                      {c.category}
                    </span>
                  </th>
                  <td className="py-2 text-right tabular-nums">{c.count}</td>
                  <td className="py-2 text-right tabular-nums">{hasAmounts ? formatIDR(c.total_amount) : "—"}</td>
                  <td className="py-2 text-right tabular-nums">{formatPercent(c.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <TransactionsTable rows={rows} onRelabel={(id, category) => onChange(relabel(rows, id, category))} />
    </div>
  );
}
