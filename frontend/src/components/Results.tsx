"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CategoryChart from "./CategoryChart";
import InsightsPanel from "./Insights";
import SegmentedControl from "./SegmentedControl";
import Stat from "./Stat";
import TransactionsTable from "./TransactionsTable";
import { DownloadIcon } from "./icons";
import { REPORT_FORMATS, downloadReport, fetchInsights, type ReportFormat } from "@/lib/api";
import { formatDate, formatIDR, formatPercent } from "@/lib/format";
import { confirm, relabel, summarize } from "@/lib/summary";
import type { Insights, Row } from "@/lib/types";

interface Props {
  rows: Row[];
  fileName: string;
  /** Insights that came with the classify response, for the rows as uploaded. */
  initialInsights: Insights | null;
  onChange: (rows: Row[]) => void;
  onReset: () => void;
}

const INSIGHTS_DEBOUNCE_MS = 300;

/** "1 Sep – 30 Sep 2026" from the ISO dates in the rows, or null when there are none. */
function period(rows: Row[]): string | null {
  const dates = rows
    .map((r) => r.date)
    .filter((d): d is string => d !== null && /^\d{4}-\d{2}-\d{2}/.test(d))
    .sort();
  if (dates.length === 0) return null;
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first.slice(0, 10) === last.slice(0, 10)) return formatDate(first, true);
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  return `${formatDate(first, !sameYear)} – ${formatDate(last, true)}`;
}

export default function Results({ rows, fileName, initialInsights, onChange, onReset }: Props) {
  const summary = useMemo(() => summarize(rows), [rows]);
  const span = useMemo(() => period(rows), [rows]);
  const hasAmounts = summary.total_amount > 0;
  const moneyIn = summary.money_in_total;
  const savedShare = moneyIn > 0 ? (moneyIn - summary.total_amount) / moneyIn : null;
  const [format, setFormat] = useState<ReportFormat>("csv");
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insights | null>(initialInsights);
  const [insightsStale, setInsightsStale] = useState(false);
  const uploadedRows = useRef(rows);

  // After a relabel or confirm, ask the API for fresh insights (debounced). A newer edit
  // cancels the older request, so a stale response never overwrites a newer one.
  // On error the last insights stay up with a small notice.
  useEffect(() => {
    if (rows === uploadedRows.current) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const next = await fetchInsights(rows, controller.signal);
        if (!controller.signal.aborted) {
          setInsights(next);
          setInsightsStale(false);
        }
      } catch {
        if (!controller.signal.aborted) setInsightsStale(true);
      }
    }, INSIGHTS_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [rows]);

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
    <div className="animate-fade-in space-y-14">
      <section aria-labelledby="results-heading" className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 id="results-heading" className="text-sm text-muted">
            {hasAmounts ? "Spent" : "Transactions"}
            {span && <span> · {span}</span>}
            <span className="sr-only"> in {fileName}</span>
          </h2>
          <p className="mt-1 text-[2.5rem] font-semibold leading-none tracking-[-0.03em] tabular-nums">
            {hasAmounts ? formatIDR(summary.total_amount) : summary.total_rows.toLocaleString("id-ID")}
          </p>
          <p className="mt-2 truncate text-xs text-muted" title={fileName}>
            {fileName}
          </p>
          <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
            <Stat label="Transactions" value={summary.total_rows.toLocaleString("id-ID")} />
            <Stat
              label="To review"
              value={summary.needs_review.toLocaleString("id-ID")}
              tone={summary.needs_review ? "warn" : "default"}
            />
            {savedShare !== null && <Stat label="Saved" value={formatPercent(savedShare)} />}
            {moneyIn > 0 && (
              <Stat
                label={`Money in (${summary.money_in_count.toLocaleString("id-ID")}, not spend)`}
                value={formatIDR(moneyIn)}
              />
            )}
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label="Report format"
            options={REPORT_FORMATS}
            value={format}
            onChange={setFormat}
            disabled={downloading}
          />
          <button
            type="button"
            onClick={download}
            disabled={downloading}
            className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-on-ink transition-colors duration-150 hover:bg-ink-2 disabled:opacity-60"
          >
            <DownloadIcon className="h-4 w-4" />
            {downloading ? (
              "Preparing…"
            ) : (
              <span>
                Download<span className="sr-only"> report</span>
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="focus-ring rounded-full px-3 py-1.5 text-sm font-medium text-muted transition-colors duration-150 hover:bg-subtle hover:text-ink"
          >
            Start over
          </button>
        </div>
      </section>

      {error && (
        <p role="alert" className="-mt-8 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <section aria-labelledby="chart-heading">
        <h2 id="chart-heading" className="text-base font-semibold tracking-tight">
          {hasAmounts ? "Where it went" : "Share of transactions by category"}
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          {hasAmounts ? "Share of spend by category, money in not counted." : "No amounts in this file, so shares are by count."}
        </p>
        <CategoryChart summary={summary} byAmount={hasAmounts} />
      </section>

      {insights && <InsightsPanel insights={insights} stale={insightsStale} />}

      <TransactionsTable
        rows={rows}
        onRelabel={(id, category) => onChange(relabel(rows, id, category))}
        onConfirm={(id) => onChange(confirm(rows, id))}
      />
    </div>
  );
}
