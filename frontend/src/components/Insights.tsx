"use client";

import { useId, useState, type CSSProperties, type ReactNode } from "react";
import BarList from "./BarList";
import SegmentedControl from "./SegmentedControl";
import Stat from "./Stat";
import { MAX_INCOME } from "@/lib/api";
import { CATEGORY_COLORS, OTHER_COLOR, colorFor, formatIDR } from "@/lib/format";
import { useLocale, type LocaleContextValue } from "@/lib/i18n";
import { CATEGORIES, type Bucket, type Insights, type Merchant } from "@/lib/types";

interface Props {
  insights: Insights;
  /** The last re-fetch failed, so these insights may not reflect the latest edits. */
  stale: boolean;
  /** Monthly income the user typed in; null = use the income detected from money in. */
  incomeOverride: number | null;
  onIncomeChange: (value: number | null) => void;
}

const CUT_MAX = 50;
const CUT_STEP = 5;

export const BUCKETS = [
  { key: "needs", label: "budget.needs", color: CATEGORY_COLORS.transport },
  { key: "wants", label: "budget.wants", color: CATEGORY_COLORS.shopping },
  { key: "savings", label: "budget.savings", color: CATEGORY_COLORS.transfer },
] as const;

type Budget = Insights["budget_503020"];

/** The id of the 50/30/20 card, which the compact budget strip's "Budget details" link scrolls to. */
export const BUDGET_ANCHOR = "budget-503020";

function Block({ title, children, anchor }: { title: string; children: ReactNode; anchor?: string }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      id={anchor}
      tabIndex={anchor ? -1 : undefined}
      className={anchor ? "scroll-mt-6 rounded-sm outline-none" : undefined}
    >
      <h3 id={id} className="text-sm font-semibold">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Emphasizes the first Rupiah figure (or percentage) in a highlight sentence. */
function emphasize(text: string): ReactNode {
  const m = /-?Rp [\d.]+|\d+%/.exec(text);
  if (!m) return text;
  return (
    <>
      {text.slice(0, m.index)}
      <strong className="font-semibold text-ink">{m[0]}</strong>
      {text.slice(m.index + m[0].length)}
    </>
  );
}

/**
 * How a bucket stands against its target. `difference` is target − actual (per month):
 * needs/wants: ≥ 0 is money left, < 0 is over; savings: > 0 is short of the target, else on track.
 */
function bucketStatus(bucket: Bucket, difference: number, t: LocaleContextValue["t"]): { text: string; good: boolean } {
  if (bucket === "savings") {
    return difference > 0
      ? { text: t("budget.short", { amount: formatIDR(difference) }), good: false }
      : { text: t("budget.onTrack"), good: true };
  }
  return difference >= 0
    ? { text: t("budget.left", { amount: formatIDR(difference) }), good: true }
    : { text: t("budget.over", { amount: formatIDR(-difference) }), good: false };
}

/** The "Monthly income" field: prefilled from money in, editable, never stored. */
function IncomeField({
  detected,
  incomeOverride,
  onIncomeChange,
}: {
  detected: number | null;
  incomeOverride: number | null;
  onIncomeChange: (value: number | null) => void;
}) {
  const { t } = useLocale();
  const id = useId();
  // What the user is typing; null shows the entered or detected income.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (incomeOverride !== null ? String(incomeOverride) : detected !== null ? String(Math.round(detected)) : "");
  const parsed = shown.trim() === "" ? null : Number(shown);
  const invalid = parsed !== null && !(Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_INCOME);
  const hint = invalid
    ? t("budget.incomeInvalid")
    : incomeOverride !== null
      ? t("budget.incomeEntered")
      : detected !== null
        ? t("budget.incomeDetected")
        : t("budget.incomeEnter");

  function change(value: string) {
    setDraft(value);
    if (value.trim() === "") {
      onIncomeChange(null); // cleared: back to the detected income, if any
      return;
    }
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0 && n <= MAX_INCOME) onIncomeChange(n > 0 ? n : null);
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label htmlFor={id} className="text-sm font-medium">
          {t("budget.income")}
        </label>
        {incomeOverride !== null && detected !== null && (
          <button
            type="button"
            onClick={() => {
              setDraft(null);
              onIncomeChange(null);
            }}
            className="focus-ring rounded-sm text-xs font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
          >
            {t("budget.useDetected")}
          </button>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span aria-hidden="true" className="text-sm text-muted">
          Rp
        </span>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_INCOME}
          step="any"
          value={shown}
          onChange={(e) => change(e.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-hint`}
          className={`focus-ring w-full max-w-56 rounded-md border bg-surface px-2.5 py-1.5 text-sm tabular-nums text-ink ${
            invalid ? "border-danger" : "border-line hover:border-line-strong"
          }`}
        />
        {parsed !== null && !invalid && parsed > 0 && (
          <span aria-hidden="true" className="text-xs tabular-nums text-muted">
            {formatIDR(parsed)}
          </span>
        )}
      </div>
      <p id={`${id}-hint`} className={`mt-1 text-xs ${invalid ? "text-danger" : "text-muted"}`}>
        {hint}
      </p>
    </div>
  );
}

/** Per bucket: actual vs target in Rupiah per month, a bar with a target marker, and the difference. */
function BucketTargets({ budget }: { budget: Budget }) {
  const { t, percent } = useLocale();
  const targets = budget.target_amounts!;
  const difference = budget.difference!;
  const income = budget.income_monthly ?? 0;

  return (
    <div className="mt-5 space-y-5">
      {BUCKETS.map((b) => {
        const actual = budget.actual_amounts[b.key] ?? 0;
        const target = targets[b.key];
        const status = bucketStatus(b.key, difference[b.key], t);
        // The bar spans the larger of actual and target, so the marker and the fill always fit.
        const scale = Math.max(target, actual, 1);
        const fill = (Math.max(actual, 0) / scale) * 100;
        const mark = (target / scale) * 100;
        const label = t(b.label);
        return (
          <div key={b.key}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: b.color }} />
                {label}
              </span>
              <span className="tabular-nums text-ink-2">
                {t("budget.actualOfTarget", { actual: formatIDR(actual), target: formatIDR(target) })}
              </span>
            </div>
            <div
              role="img"
              aria-label={t("budget.barAria", {
                bucket: label,
                actual: formatIDR(actual),
                target: formatIDR(target),
                status: status.text,
              })}
              className="relative mt-1.5"
            >
              <div className="h-2 overflow-hidden rounded-full bg-subtle">
                <div className="h-full rounded-full" style={{ width: `${fill}%`, background: b.color }} />
              </div>
              <span
                aria-hidden="true"
                title={t("budget.targetMark")}
                className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-ink"
                style={{ left: `${mark}%` }}
              />
            </div>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs tabular-nums">
              <span className={`font-medium ${status.good ? "text-accent" : "text-warn"}`}>{status.text}</span>
              {income > 0 && (
                <span className="text-muted">
                  {t("budget.share", { pct: percent(actual / income) })} · {t("budget.guideline", { pct: percent(budget.targets[b.key], 0) })}
                </span>
              )}
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted">
        {t("budget.perMonth")}{" "}
        {budget.transfers_monthly > 0 && t("budget.transfersNote", { amount: formatIDR(budget.transfers_monthly) })}
      </p>
    </div>
  );
}

/** Without an income: one stacked bar of shares of total out, as before Rupiah targets. */
function SharesBar({ budget }: { budget: Budget }) {
  const { t, percent } = useLocale();
  const segments = [
    ...BUCKETS.filter((b) => b.key !== "savings").map((b) => ({
      key: b.key,
      label: t(b.label),
      color: b.color,
      amount: budget[b.key] as number | null,
      share: budget.shares[b.key],
      target: budget.targets[b.key] as number | undefined,
    })),
    {
      key: "transfers",
      label: t("budget.transfers"),
      color: OTHER_COLOR,
      amount: budget.unclassified_transfers,
      share: budget.shares.unclassified_transfers,
      target: undefined,
    },
  ];
  const drawn = segments.filter((s) => s.share !== null && s.share > 0);
  const scale = Math.max(
    drawn.reduce((sum, s) => sum + (s.share ?? 0), 0),
    1,
  );
  const description = drawn.map((s) => `${s.label} ${percent(s.share!)}`).join(", ");

  return (
    <div className="mt-5 space-y-4">
      {drawn.length > 0 ? (
        <div
          role="img"
          aria-label={t("budget.stackedAria", { basis: t("budget.basisTotalOut"), description })}
          className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-subtle"
        >
          {drawn.map((s) => (
            <div
              key={s.key}
              style={{ width: `${((s.share ?? 0) / scale) * 100}%`, background: s.color }}
              title={`${s.label} ${percent(s.share!)}`}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">{t("budget.noAmounts")}</p>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        {segments.map((s) => (
          <div key={s.key} className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
            <div className="min-w-0">
              <dt className="font-medium">{s.label}</dt>
              <dd className="tabular-nums text-ink-2">
                {s.amount === null ? "—" : formatIDR(s.amount)}
                {s.share !== null && <span className="text-muted"> · {percent(s.share)}</span>}
              </dd>
              {s.target !== undefined && <dd className="text-xs text-muted">{t("budget.guideline", { pct: percent(s.target, 0) })}</dd>}
            </div>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted">{t("budget.sharesNote")}</p>
    </div>
  );
}

function MerchantList({ merchants, by }: { merchants: Merchant[]; by: "total" | "count" }) {
  const { t } = useLocale();
  if (merchants.length === 0) return <p className="mt-4 text-sm text-muted">{t("insights.noMerchants")}</p>;
  return (
    <BarList
      className="mt-4"
      items={merchants.map((m) => ({
        key: m.merchant,
        label: m.merchant,
        value: by === "total" ? m.total : m.count,
        display: by === "total" ? formatIDR(m.total) : `${m.count}×`,
        sub:
          by === "total"
            ? t("insights.merchantSubTotal", { count: m.count, avg: formatIDR(m.avg) })
            : t("insights.merchantSubCount", { total: formatIDR(m.total), avg: formatIDR(m.avg) }),
      }))}
    />
  );
}

function TopTransfers({ transfers }: { transfers: Insights["top_transfers"] }) {
  const { t, percent } = useLocale();
  const [by, setBy] = useState<"total" | "count">("total");
  const items = by === "total" ? transfers.out_by_total : transfers.out_by_count;
  const sort = [
    { value: "total", label: t("insights.byTotal") },
    { value: "count", label: t("insights.byCount") },
  ] as const;

  return (
    <Block title={t("insights.topTransfers")}>
      <div className="mt-3">
        <SegmentedControl label={t("insights.sortTransfers")} size="sm" options={sort} value={by} onChange={setBy} />
      </div>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{t("insights.noTransfers")}</p>
      ) : (
        <BarList
          className="mt-4"
          items={items.map((m) => ({
            key: m.name,
            label: m.name,
            value: by === "total" ? m.total : m.count,
            display: by === "total" ? formatIDR(m.total) : `${m.count}×`,
            color: CATEGORY_COLORS.transfer,
            sub: [
              by === "total"
                ? t("insights.merchantSubTotal", { count: m.count, avg: formatIDR(m.avg) })
                : t("insights.merchantSubCount", { total: formatIDR(m.total), avg: formatIDR(m.avg) }),
              m.share !== null ? t("insights.ofTransfers", { pct: percent(m.share) }) : null,
            ]
              .filter(Boolean)
              .join(" · "),
          }))}
        />
      )}
      <p className="mt-3 text-xs text-muted">{t("insights.transfersCount")}</p>
    </Block>
  );
}

function WhatIf({ perMonth, budget }: { perMonth: Record<string, number>; budget: Budget }) {
  const { t, rich, category } = useLocale();
  // Transfers are left out: they mix savings and payments to people.
  const categories = CATEGORIES.filter((c) => c !== "transfer" && (perMonth[c] ?? 0) > 0);
  const [cuts, setCuts] = useState<Record<string, number>>({});
  const baseId = useId();

  if (categories.length === 0) return <p className="mt-4 text-sm text-muted">{t("whatif.none")}</p>;

  const saving = (c: string) => ((perMonth[c] ?? 0) * (cuts[c] ?? 0)) / 100;
  const monthly = categories.reduce((sum, c) => sum + saving(c), 0);
  const money = (value: number) => <span className="font-semibold text-accent">{formatIDR(value)}</span>;

  // How far the food and shopping cuts move wants toward its Rupiah target.
  let wantsLine: string | null = null;
  if (budget.target_amounts && budget.difference) {
    const after = budget.actual_amounts.wants - saving("food") - saving("shopping");
    const status = bucketStatus("wants", budget.target_amounts.wants - after, t);
    wantsLine = t("whatif.wantsOver", {
      after: formatIDR(after),
      target: formatIDR(budget.target_amounts.wants),
      status: status.text,
    });
  }

  return (
    <div className="mt-5 space-y-5">
      <div className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
        {categories.map((c) => {
          const cut = cuts[c] ?? 0;
          const id = `${baseId}-${c}`;
          const pct = `${cut}%`;
          const vars = { month: formatIDR(saving(c)), year: formatIDR(saving(c) * 12) };
          return (
            <div key={c}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <label htmlFor={id} className="flex items-center gap-2 font-medium">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: colorFor(c) }} />
                  <span className="tabular-nums">{t("whatif.cut", { category: category(c), cut: pct })}</span>
                </label>
                <span className="text-xs tabular-nums text-muted">{t("whatif.now", { amount: formatIDR(perMonth[c]) })}</span>
              </div>
              <input
                id={id}
                type="range"
                min={0}
                max={CUT_MAX}
                step={CUT_STEP}
                value={cut}
                aria-valuetext={t("whatif.aria", { cut: pct, ...vars })}
                onChange={(e) => setCuts((prev) => ({ ...prev, [c]: Number(e.target.value) }))}
                className="range focus-ring mt-1.5 w-full rounded-full"
                style={{ "--range-color": colorFor(c), "--range-fill": `${(cut / CUT_MAX) * 100}%` } as CSSProperties}
              />
              <p className={`mt-1 text-xs tabular-nums ${cut > 0 ? "text-ink-2" : "text-muted"}`}>{t("whatif.saves", vars)}</p>
            </div>
          );
        })}
      </div>
      <div aria-live="polite" className="space-y-1 border-t border-line pt-4 text-sm tabular-nums text-ink-2">
        <p>{rich("whatif.together", { month: money(monthly), year: money(monthly * 12) })}</p>
        {wantsLine && <p className="text-xs text-muted">{wantsLine}</p>}
      </div>
    </div>
  );
}

export default function InsightsPanel({ insights, stale, incomeOverride, onIncomeChange }: Props) {
  const { t, tc, rich, number, percent, date } = useLocale();
  const strong = (text: string) => <span className="font-semibold tabular-nums text-ink">{text}</span>;
  const [merchantsBy, setMerchantsBy] = useState<"total" | "count">("total");
  const { cash_flow: cash, small_spends: small, fees, period } = insights;
  const budget = insights.budget_503020;
  const hasAmounts = cash.total_out > 0 || cash.money_in > 0;
  const merchants = merchantsBy === "total" ? insights.top_merchants.by_total : insights.top_merchants.by_count;
  // Money in per month, the same figure the API uses when no income is entered.
  const detectedIncome = cash.money_in > 0 ? cash.money_in * period.months_factor : null;
  const merchantSort = [
    { value: "total", label: t("insights.byTotal") },
    { value: "count", label: t("insights.byCount") },
  ] as const;

  return (
    // The "Insights" heading is the disclosure button around this panel (see Results).
    <div className="space-y-10">
      {period.start && period.days !== null && (
        <p className="text-sm text-muted">
          {date(period.start, true)} – {date(period.end, true)} ({tc("insights.days", period.days)})
        </p>
      )}

      {stale && (
        <p role="status" className="rounded-lg bg-warn-soft px-4 py-2 text-sm text-warn">
          {t("insights.stale")}
        </p>
      )}

      {!hasAmounts ? (
        <p className="text-sm text-muted">{t("insights.needAmounts")}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
            <Stat
              label={t("insights.moneyIn")}
              value={cash.money_in > 0 ? formatIDR(cash.money_in) : "—"}
              note={cash.money_in > 0 ? tc("insights.moneyInNote", cash.money_in_count) : t("insights.moneyInNone")}
            />
            <Stat label={t("insights.living")} value={formatIDR(cash.living_spend)} note={t("insights.livingNote")} />
            <Stat label={t("insights.transfersOut")} value={formatIDR(cash.transfers_out)} note={t("insights.transfersNote")} />
            <Stat
              label={t("insights.net")}
              value={cash.money_in > 0 ? formatIDR(cash.net) : "—"}
              note={
                cash.savings_rate !== null
                  ? t("insights.savingsRate", { rate: percent(cash.savings_rate) })
                  : t("insights.needsMoneyIn")
              }
            />
          </dl>

          {insights.highlights.length > 0 && (
            <Block title={t("insights.highlights")}>
              <ol className="mt-4 space-y-3">
                {insights.highlights.map((h, i) => (
                  <li key={h.text} className="flex gap-4 text-sm leading-relaxed text-ink-2">
                    <span aria-hidden="true" className="w-5 shrink-0 pt-px text-xs font-medium tabular-nums text-muted">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{emphasize(h.text)}</span>
                  </li>
                ))}
              </ol>
            </Block>
          )}

          <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
            <Block title={t("insights.topMerchants")}>
              <div className="mt-3">
                <SegmentedControl
                  label={t("insights.sortMerchants")}
                  size="sm"
                  options={merchantSort}
                  value={merchantsBy}
                  onChange={setMerchantsBy}
                />
              </div>
              <MerchantList merchants={merchants} by={merchantsBy} />
              <p className="mt-3 text-xs text-muted">{t("insights.merchantsNote")}</p>
            </Block>

            <TopTransfers transfers={insights.top_transfers} />
          </div>

          <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
            <Block title={t("insights.budget")} anchor={BUDGET_ANCHOR}>
              <IncomeField detected={detectedIncome} incomeOverride={incomeOverride} onIncomeChange={onIncomeChange} />
              {budget.target_amounts && budget.difference ? <BucketTargets budget={budget} /> : <SharesBar budget={budget} />}
            </Block>

            <div className="space-y-6">
              <div className="border-l-2 border-warn-bar pl-4 text-sm text-ink-2">
                <p className="font-medium text-ink">{t("insights.smallSpends")}</p>
                <p className="mt-1">
                  {rich("insights.smallText", {
                    count: number(small.count),
                    threshold: formatIDR(small.threshold),
                    total: strong(formatIDR(small.total)),
                    share: small.share_of_living !== null ? t("insights.smallShare", { share: percent(small.share_of_living) }) : "",
                  })}
                </p>
              </div>
              <div className="border-l-2 border-line-strong pl-4 text-sm text-ink-2">
                <p className="font-medium text-ink">{t("insights.fees")}</p>
                <p className="mt-1">
                  {fees.count === 0
                    ? t("insights.noFees")
                    : rich(fees.count === 1 ? "insights.feesText_one" : "insights.feesText_other", {
                        count: number(fees.count),
                        total: strong(formatIDR(fees.total)),
                      })}
                </p>
              </div>
            </div>
          </div>

          <Block title={t("insights.whatIf")}>
            <p className="mt-0.5 text-xs text-muted">
              {period.days && period.days > 31
                ? t("insights.whatIfScaled", { days: period.days })
                : t("insights.whatIfStatement")}
            </p>
            <WhatIf perMonth={insights.per_month} budget={budget} />
          </Block>
        </>
      )}

      <p className="border-t border-line pt-4 text-xs leading-relaxed text-muted">
        <span aria-hidden="true">* </span>
        {insights.disclaimer}
      </p>
    </div>
  );
}
