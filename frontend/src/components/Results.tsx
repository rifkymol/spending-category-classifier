"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CategoryChart from "./CategoryChart";
import InsightsPanel from "./Insights";
import SegmentedControl from "./SegmentedControl";
import Stat from "./Stat";
import TransactionsTable from "./TransactionsTable";
import { DownloadIcon } from "./icons";
import { REPORT_FORMATS, downloadReport, fetchInsights, type ReportFormat } from "@/lib/api";
import { formatIDR } from "@/lib/format";
import { formatDate, useLocale, type Locale } from "@/lib/i18n";
import { confirm, relabel, summarize } from "@/lib/summary";
import type { Insights, Row } from "@/lib/types";

interface Props {
  rows: Row[];
  fileName: string;
  /** Insights that came with the classify response, for the rows as uploaded. */
  initialInsights: Insights | null;
  /** The language those insights were written in. */
  initialInsightsLocale: Locale;
  onChange: (rows: Row[]) => void;
  onReset: () => void;
}

const INSIGHTS_DEBOUNCE_MS = 300;

/** "1 Sep – 30 Sep 2026" from the ISO dates in the rows, or null when there are none. */
function period(rows: Row[], locale: Locale): string | null {
  const dates = rows
    .map((r) => r.date)
    .filter((d): d is string => d !== null && /^\d{4}-\d{2}-\d{2}/.test(d))
    .sort();
  if (dates.length === 0) return null;
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first.slice(0, 10) === last.slice(0, 10)) return formatDate(first, locale, true);
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  return `${formatDate(first, locale, !sameYear)} – ${formatDate(last, locale, true)}`;
}

export default function Results({ rows, fileName, initialInsights, initialInsightsLocale, onChange, onReset }: Props) {
  const { locale, t, number, percent } = useLocale();
  const summary = useMemo(() => summarize(rows), [rows]);
  const span = useMemo(() => period(rows, locale), [rows, locale]);
  const hasAmounts = summary.total_amount > 0;
  const moneyIn = summary.money_in_total;
  const savedShare = moneyIn > 0 ? (moneyIn - summary.total_amount) / moneyIn : null;
  const [format, setFormat] = useState<ReportFormat>("csv");
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insights | null>(initialInsights);
  const [insightsStale, setInsightsStale] = useState(false);
  // Monthly income typed into the 50/30/20 card; null = use the income detected from money in.
  // Kept in this component's state only, never stored.
  const [incomeOverride, setIncomeOverride] = useState<number | null>(null);
  // What the insights on screen were computed for.
  const shown = useRef({ rows, income: null as number | null, locale: initialInsightsLocale });

  // After a relabel or confirm, a new income or a language switch, ask the API for fresh insights
  // (debounced). A newer change cancels the older request, so a stale response never overwrites
  // a newer one. On error the last insights stay up with a small notice.
  useEffect(() => {
    const current = shown.current;
    if (current.rows === rows && current.income === incomeOverride && current.locale === locale) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const next = await fetchInsights(rows, incomeOverride, locale, controller.signal);
        if (!controller.signal.aborted) {
          shown.current = { rows, income: incomeOverride, locale };
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
  }, [rows, incomeOverride, locale]);

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      await downloadReport(rows, format, incomeOverride, locale);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("results.reportError"));
    } finally {
      setDownloading(false);
    }
  }

  const formats = REPORT_FORMATS.map((f) => ({ value: f, label: f === "xlsx" ? t("format.excel") : f.toUpperCase() }));

  return (
    <div className="animate-fade-in space-y-14">
      <section aria-labelledby="results-heading" className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 id="results-heading" className="text-sm text-muted">
            {hasAmounts ? t("results.spent") : t("results.transactions")}
            {span && <span> · {span}</span>}
            <span className="sr-only">{t("results.inFile", { file: fileName })}</span>
          </h2>
          <p className="mt-1 text-[2.5rem] font-semibold leading-none tracking-[-0.03em] tabular-nums">
            {hasAmounts ? formatIDR(summary.total_amount) : number(summary.total_rows)}
          </p>
          <p className="mt-2 truncate text-xs text-muted" title={fileName}>
            {fileName}
          </p>
          <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
            <Stat label={t("results.transactions")} value={number(summary.total_rows)} />
            <Stat
              label={t("results.toReview")}
              value={number(summary.needs_review)}
              tone={summary.needs_review ? "warn" : "default"}
            />
            {savedShare !== null && <Stat label={t("results.saved")} value={percent(savedShare)} />}
            {moneyIn > 0 && (
              <Stat label={t("results.moneyIn", { count: number(summary.money_in_count) })} value={formatIDR(moneyIn)} />
            )}
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label={t("results.reportFormat")}
            options={formats}
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
              t("results.preparing")
            ) : (
              <span>
                {t("results.download")}
                <span className="sr-only">{t("results.downloadReport")}</span>
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="focus-ring rounded-full px-3 py-1.5 text-sm font-medium text-muted transition-colors duration-150 hover:bg-subtle hover:text-ink"
          >
            {t("results.startOver")}
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
          {hasAmounts ? t("results.whereItWent") : t("results.shareByCount")}
        </h2>
        <p className="mt-0.5 text-sm text-muted">{hasAmounts ? t("results.whereSub") : t("results.countSub")}</p>
        <CategoryChart summary={summary} byAmount={hasAmounts} />
      </section>

      {insights && (
        <InsightsPanel
          insights={insights}
          stale={insightsStale}
          incomeOverride={incomeOverride}
          onIncomeChange={setIncomeOverride}
        />
      )}

      <TransactionsTable
        rows={rows}
        onRelabel={(id, category) => onChange(relabel(rows, id, category))}
        onConfirm={(id) => onChange(confirm(rows, id))}
      />
    </div>
  );
}
