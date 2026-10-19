"use client";

import { useId, useState, type CSSProperties, type ReactNode } from "react";
import BarList from "./BarList";
import SegmentedControl from "./SegmentedControl";
import Stat from "./Stat";
import { CATEGORY_COLORS, OTHER_COLOR, colorFor, formatDate, formatIDR, formatPercent } from "@/lib/format";
import { CATEGORIES, type Insights, type Merchant } from "@/lib/types";

interface Props {
  insights: Insights;
  /** The last re-fetch failed, so these insights may not reflect the latest edits. */
  stale: boolean;
}

const CUT_MAX = 50;
const CUT_STEP = 5;

const BUCKETS = [
  { key: "needs", label: "Needs", color: CATEGORY_COLORS.transport },
  { key: "wants", label: "Wants", color: CATEGORY_COLORS.shopping },
  { key: "savings", label: "Savings", color: CATEGORY_COLORS.transfer },
  { key: "unclassified_transfers", label: "Transfers", color: OTHER_COLOR },
] as const;

const MERCHANT_SORT = [
  { value: "total", label: "By total" },
  { value: "count", label: "By count" },
] as const;

function Block({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={className}>
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

function BudgetBar({ budget }: { budget: Insights["budget_503020"] }) {
  const segments = BUCKETS.map((b) => ({ ...b, amount: budget[b.key], share: budget.shares[b.key] }));
  const drawn = segments.filter((s) => s.share !== null && s.share > 0);
  const total = drawn.reduce((sum, s) => sum + (s.share ?? 0), 0);
  // Shares of money in can add up to more than 100% when spending was higher; scale the bar to fit.
  const scale = Math.max(total, 1);
  const basis = budget.basis === "money_in" ? "money in" : "total out (no money in found)";
  const description = drawn.map((s) => `${s.label} ${formatPercent(s.share!)}`).join(", ");
  // Guideline marks: needs ends at 50%, wants at 50 + 30 = 80% of money in.
  const needsTarget = budget.targets.needs;
  const wantsTarget = budget.targets.wants;
  const marks =
    budget.basis === "money_in" && needsTarget !== undefined && wantsTarget !== undefined
      ? [
          { at: needsTarget, label: formatPercent(needsTarget).replace(".0", "") },
          { at: needsTarget + wantsTarget, label: formatPercent(needsTarget + wantsTarget).replace(".0", "") },
        ]
      : [];

  return (
    <div className="mt-4 space-y-4">
      {drawn.length > 0 ? (
        <div>
          <div className="relative">
            <div
              role="img"
              aria-label={`Stacked bar, share of ${basis}: ${description}`}
              className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-subtle"
            >
              {drawn.map((s) => (
                <div
                  key={s.key}
                  style={{ width: `${((s.share ?? 0) / scale) * 100}%`, background: s.color }}
                  title={`${s.label} ${formatPercent(s.share!)}`}
                />
              ))}
            </div>
            {marks.map((m) => (
              <span
                key={m.at}
                aria-hidden="true"
                className="absolute -top-1 h-5 w-px bg-ink"
                style={{ left: `${(m.at / scale) * 100}%` }}
              />
            ))}
          </div>
          {marks.length > 0 && (
            <div aria-hidden="true" className="relative mt-1 h-4 text-[11px] tabular-nums text-muted">
              {marks.map((m) => (
                <span key={m.at} className="absolute -translate-x-1/2" style={{ left: `${(m.at / scale) * 100}%` }}>
                  {m.label}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">No amounts to compare.</p>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        {segments.map((s) => {
          const target = budget.targets[s.key];
          return (
            <div key={s.key} className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
              <div className="min-w-0">
                <dt className="font-medium">{s.label}</dt>
                <dd className="tabular-nums text-ink-2">
                  {s.amount === null ? "—" : formatIDR(s.amount)}
                  {s.share !== null && <span className="text-muted"> · {formatPercent(s.share)}</span>}
                </dd>
                {target !== undefined && <dd className="text-xs text-muted">guideline {formatPercent(target)}</dd>}
              </div>
            </div>
          );
        })}
      </dl>
      <p className="text-xs text-muted">
        Shares of {basis}. Needs = bills + transport, wants = food + shopping; transfers shown separately.
        {budget.savings !== null && budget.savings < 0 && " Spending was more than money in, so savings is negative."}
      </p>
    </div>
  );
}

function MerchantList({ merchants, by }: { merchants: Merchant[]; by: "total" | "count" }) {
  if (merchants.length === 0) return <p className="mt-4 text-sm text-muted">No merchants found.</p>;
  return (
    <BarList
      className="mt-4"
      items={merchants.map((m) => ({
        key: m.merchant,
        label: m.merchant,
        value: by === "total" ? m.total : m.count,
        display: by === "total" ? formatIDR(m.total) : `${m.count}×`,
        sub: by === "total" ? `${m.count}× · avg ${formatIDR(m.avg)}` : `${formatIDR(m.total)} · avg ${formatIDR(m.avg)}`,
      }))}
    />
  );
}

function WhatIf({ perMonth }: { perMonth: Record<string, number> }) {
  // Transfers are left out: they mix savings and payments to people.
  const categories = CATEGORIES.filter((c) => c !== "transfer" && (perMonth[c] ?? 0) > 0);
  const [cuts, setCuts] = useState<Record<string, number>>({});
  const baseId = useId();

  if (categories.length === 0) return <p className="mt-4 text-sm text-muted">No spending amounts to work with.</p>;

  const saving = (c: string) => ((perMonth[c] ?? 0) * (cuts[c] ?? 0)) / 100;
  const monthly = categories.reduce((sum, c) => sum + saving(c), 0);

  return (
    <div className="mt-5 space-y-5">
      <div className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
        {categories.map((c) => {
          const cut = cuts[c] ?? 0;
          const id = `${baseId}-${c}`;
          const text = `${cut}% cut saves ${formatIDR(saving(c))} a month, ${formatIDR(saving(c) * 12)} a year`;
          return (
            <div key={c}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <label htmlFor={id} className="flex items-center gap-2 font-medium">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: colorFor(c) }} />
                  Cut {c} by <span className="tabular-nums">{cut}%</span>
                </label>
                <span className="text-xs tabular-nums text-muted">{formatIDR(perMonth[c])} / mo now</span>
              </div>
              <input
                id={id}
                type="range"
                min={0}
                max={CUT_MAX}
                step={CUT_STEP}
                value={cut}
                aria-valuetext={text}
                onChange={(e) => setCuts((prev) => ({ ...prev, [c]: Number(e.target.value) }))}
                className="range focus-ring mt-1.5 w-full rounded-full"
                style={{ "--range-color": colorFor(c), "--range-fill": `${(cut / CUT_MAX) * 100}%` } as CSSProperties}
              />
              <p className="mt-1 text-xs tabular-nums text-muted">
                Saves <span className={cut > 0 ? "font-medium text-ink" : ""}>{formatIDR(saving(c))}</span> / month,{" "}
                {formatIDR(saving(c) * 12)} / year
              </p>
            </div>
          );
        })}
      </div>
      <p aria-live="polite" className="border-t border-line pt-4 text-sm tabular-nums text-ink-2">
        Together: saves <span className="font-semibold text-accent">{formatIDR(monthly)}</span> / month,{" "}
        <span className="font-semibold text-accent">{formatIDR(monthly * 12)}</span> / year
      </p>
    </div>
  );
}

export default function InsightsPanel({ insights, stale }: Props) {
  const [merchantsBy, setMerchantsBy] = useState<"total" | "count">("total");
  const { cash_flow: cash, small_spends: small, fees, period } = insights;
  const hasAmounts = cash.total_out > 0 || cash.money_in > 0;
  const merchants = merchantsBy === "total" ? insights.top_merchants.by_total : insights.top_merchants.by_count;

  return (
    <section aria-labelledby="insights-heading" className="space-y-10 border-t border-line pt-10">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 id="insights-heading" className="text-base font-semibold tracking-tight">
          Insights
        </h2>
        {period.start && (
          <p className="text-sm text-muted">
            {formatDate(period.start, true)} – {formatDate(period.end, true)} ({period.days} {period.days === 1 ? "day" : "days"})
          </p>
        )}
      </div>

      {stale && (
        <p role="status" className="-mt-6 rounded-lg bg-warn-soft px-4 py-2 text-sm text-warn">
          Could not update the insights after your last change. Showing the previous figures.
        </p>
      )}

      {!hasAmounts ? (
        <p className="text-sm text-muted">Insights need amounts. This upload has descriptions only.</p>
      ) : (
        <>
          <dl className="-mt-4 grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
            <Stat
              label="Money in"
              value={cash.money_in > 0 ? formatIDR(cash.money_in) : "—"}
              note={cash.money_in > 0 ? `${cash.money_in_count} transactions` : "None found (CSV uploads have none)"}
            />
            <Stat label="Living spend" value={formatIDR(cash.living_spend)} note="Money out, excluding transfers" />
            <Stat label="Transfers out" value={formatIDR(cash.transfers_out)} note="Savings and payments to people" />
            <Stat
              label="Net"
              value={cash.money_in > 0 ? formatIDR(cash.net) : "—"}
              note={cash.savings_rate !== null ? `Savings rate ${formatPercent(cash.savings_rate)}` : "Needs money-in rows"}
            />
          </dl>

          {insights.highlights.length > 0 && (
            <Block title="Highlights">
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
            <Block title="50/30/20 view">
              <BudgetBar budget={insights.budget_503020} />
            </Block>

            <Block title="Top merchants">
              <div className="mt-3">
                <SegmentedControl
                  label="Sort top merchants"
                  size="sm"
                  options={MERCHANT_SORT}
                  value={merchantsBy}
                  onChange={setMerchantsBy}
                />
              </div>
              <MerchantList merchants={merchants} by={merchantsBy} />
              <p className="mt-3 text-xs text-muted">Transfers are left out: they are usually people, not merchants.</p>
            </Block>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="border-l-2 border-warn-bar pl-4 text-sm text-ink-2">
              <p className="font-medium text-ink">Small spends</p>
              <p className="mt-1">
                {small.count} purchases under {formatIDR(small.threshold)} added up to{" "}
                <span className="font-semibold tabular-nums text-ink">{formatIDR(small.total)}</span>
                {small.share_of_living !== null && ` (${formatPercent(small.share_of_living)} of living spend)`}.
              </p>
            </div>
            <div className="border-l-2 border-line-strong pl-4 text-sm text-ink-2">
              <p className="font-medium text-ink">Bank fees</p>
              <p className="mt-1">
                {fees.count === 0 ? (
                  "No bank fees found."
                ) : (
                  <>
                    {fees.count} {fees.count === 1 ? "fee" : "fees"} totalling{" "}
                    <span className="font-semibold tabular-nums text-ink">{formatIDR(fees.total)}</span>.
                  </>
                )}
              </p>
            </div>
          </div>

          <Block title="What if you cut back?">
            <p className="mt-0.5 text-xs text-muted">
              Monthly figures {period.days && period.days > 31 ? `scaled from ${period.days} days` : "from this statement"}. Nothing
              here is sent anywhere.
            </p>
            <WhatIf perMonth={insights.per_month} />
          </Block>
        </>
      )}

      <p className="border-t border-line pt-4 text-xs leading-relaxed text-muted">
        <span aria-hidden="true">* </span>
        {insights.disclaimer}
      </p>
    </section>
  );
}
