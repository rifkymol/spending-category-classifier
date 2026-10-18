"use client";

import { useId, useState, type ReactNode } from "react";
import { colorFor, formatIDR, formatPercent } from "@/lib/format";
import { CATEGORIES, type Insights, type Merchant } from "@/lib/types";

interface Props {
  insights: Insights;
  /** The last re-fetch failed, so these insights may not reflect the latest edits. */
  stale: boolean;
}

const CUT_MAX = 50;
const CUT_STEP = 5;

const BUCKETS = [
  { key: "needs", label: "Needs", color: "#2563eb" },
  { key: "wants", label: "Wants", color: "#db2777" },
  { key: "savings", label: "Savings", color: "#16a34a" },
  { key: "unclassified_transfers", label: "Transfers", color: "#64748b" },
] as const;

function Panel({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <h3 id={id} className="font-semibold">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
      {note && <dd className="mt-1 text-xs text-slate-600">{note}</dd>}
    </div>
  );
}

function BudgetBar({ budget }: { budget: Insights["budget_503020"] }) {
  const segments = BUCKETS.map((b) => ({ ...b, amount: budget[b.key], share: budget.shares[b.key] }));
  const drawn = segments.filter((s) => s.share !== null && s.share > 0);
  const total = drawn.reduce((sum, s) => sum + (s.share ?? 0), 0);
  const basis = budget.basis === "money_in" ? "money in" : "total out (no money in found)";
  const description = drawn.map((s) => `${s.label} ${formatPercent(s.share!)}`).join(", ");

  return (
    <div className="mt-3 space-y-3">
      {drawn.length > 0 ? (
        <div role="img" aria-label={`Stacked bar, share of ${basis}: ${description}`} className="flex h-6 w-full overflow-hidden rounded-md bg-slate-100">
          {drawn.map((s) => (
            <div
              key={s.key}
              style={{ width: `${((s.share ?? 0) / Math.max(total, 1)) * 100}%`, background: s.color }}
              title={`${s.label} ${formatPercent(s.share!)}`}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-600">No amounts to compare.</p>
      )}
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        {segments.map((s) => {
          const target = budget.targets[s.key];
          return (
            <div key={s.key} className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: s.color }} />
              <div>
                <dt className="font-medium">{s.label}</dt>
                <dd className="tabular-nums text-slate-700">
                  {s.amount === null ? "—" : formatIDR(s.amount)}
                  {s.share !== null && ` · ${formatPercent(s.share)}`}
                  {target !== undefined && <span className="text-slate-600"> (guideline {formatPercent(target)})</span>}
                </dd>
              </div>
            </div>
          );
        })}
      </dl>
      <p className="text-xs text-slate-600">
        Shares of {basis}. Needs = bills + transport, wants = food + shopping; transfers shown separately.
        {budget.savings !== null && budget.savings < 0 && " Spending was more than money in, so savings is negative."}
      </p>
    </div>
  );
}

function MerchantList({ merchants, by }: { merchants: Merchant[]; by: "total" | "count" }) {
  if (merchants.length === 0) return <p className="mt-3 text-sm text-slate-600">No merchants found.</p>;
  return (
    <ol className="mt-3 divide-y divide-slate-100 text-sm">
      {merchants.map((m) => (
        <li key={m.merchant} className="flex items-baseline justify-between gap-3 py-2">
          <span className="min-w-0 truncate">{m.merchant}</span>
          <span className="shrink-0 text-right tabular-nums text-slate-700">
            {by === "total" ? formatIDR(m.total) : `${m.count}×`}
            <span className="block text-xs text-slate-600">
              {by === "total" ? `${m.count}× · avg ${formatIDR(m.avg)}` : `${formatIDR(m.total)} · avg ${formatIDR(m.avg)}`}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function WhatIf({ perMonth }: { perMonth: Record<string, number> }) {
  // Transfers are left out: they mix savings and payments to people.
  const categories = CATEGORIES.filter((c) => c !== "transfer" && (perMonth[c] ?? 0) > 0);
  const [cuts, setCuts] = useState<Record<string, number>>({});
  const baseId = useId();

  if (categories.length === 0) return <p className="mt-3 text-sm text-slate-600">No spending amounts to work with.</p>;

  const saving = (c: string) => ((perMonth[c] ?? 0) * (cuts[c] ?? 0)) / 100;
  const monthly = categories.reduce((sum, c) => sum + saving(c), 0);

  return (
    <div className="mt-3 space-y-4">
      {categories.map((c) => {
        const cut = cuts[c] ?? 0;
        const id = `${baseId}-${c}`;
        const text = `${cut}% cut saves ${formatIDR(saving(c))} a month, ${formatIDR(saving(c) * 12)} a year`;
        return (
          <div key={c}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <label htmlFor={id} className="flex items-center gap-2 font-medium capitalize">
                <span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ background: colorFor(c) }} />
                Cut {c} by {cut}%
              </label>
              <span className="tabular-nums text-slate-600">{formatIDR(perMonth[c])} / month now</span>
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
              className="mt-1 w-full accent-blue-700"
            />
            <p className="text-xs tabular-nums text-slate-600">
              Saves {formatIDR(saving(c))} / month, {formatIDR(saving(c) * 12)} / year
            </p>
          </div>
        );
      })}
      <p aria-live="polite" className="rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-900 tabular-nums">
        Together: saves {formatIDR(monthly)} / month, {formatIDR(monthly * 12)} / year
      </p>
    </div>
  );
}

export default function InsightsPanel({ insights, stale }: Props) {
  const [merchantsBy, setMerchantsBy] = useState<"total" | "count">("total");
  const { cash_flow: cash, small_spends: small, fees, period } = insights;
  const hasAmounts = cash.total_out > 0 || cash.money_in > 0;
  const merchants = merchantsBy === "total" ? insights.top_merchants.by_total : insights.top_merchants.by_count;
  const toggle = (value: "total" | "count", label: string) => (
    <button
      type="button"
      aria-pressed={merchantsBy === value}
      onClick={() => setMerchantsBy(value)}
      className={`px-3 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
        merchantsBy === value ? "bg-blue-700 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section aria-labelledby="insights-heading" className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 id="insights-heading" className="text-lg font-semibold">
          Insights
        </h2>
        {period.start && (
          <p className="text-sm text-slate-600">
            {period.start} to {period.end} ({period.days} {period.days === 1 ? "day" : "days"})
          </p>
        )}
      </div>

      {stale && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Could not update the insights after your last change. Showing the previous figures.
        </p>
      )}

      {!hasAmounts ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
          Insights need amounts. This upload has descriptions only.
        </p>
      ) : (
        <>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <Panel title="Highlights">
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-800">
                {insights.highlights.map((h) => (
                  <li key={h.text}>{h.text}</li>
                ))}
              </ol>
            </Panel>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="50/30/20 view">
              <BudgetBar budget={insights.budget_503020} />
            </Panel>

            <Panel title="Top merchants">
              <div role="group" aria-label="Sort top merchants" className="mt-2 inline-flex overflow-hidden rounded-lg border border-slate-300">
                {toggle("total", "By total")}
                {toggle("count", "By count")}
              </div>
              <MerchantList merchants={merchants} by={merchantsBy} />
              <p className="mt-2 text-xs text-slate-600">Transfers are left out: they are usually people, not merchants.</p>
            </Panel>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
              <p className="font-semibold">Small spends</p>
              <p className="mt-1">
                {small.count} purchases under {formatIDR(small.threshold)} added up to{" "}
                <span className="font-semibold tabular-nums">{formatIDR(small.total)}</span>
                {small.share_of_living !== null && ` (${formatPercent(small.share_of_living)} of living spend)`}.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-900">
              <p className="font-semibold">Bank fees</p>
              <p className="mt-1">
                {fees.count === 0 ? (
                  "No bank fees found."
                ) : (
                  <>
                    {fees.count} {fees.count === 1 ? "fee" : "fees"} totalling{" "}
                    <span className="font-semibold tabular-nums">{formatIDR(fees.total)}</span>.
                  </>
                )}
              </p>
            </div>
          </div>

          <Panel title="What if you cut back?">
            <p className="mt-1 text-xs text-slate-600">
              Monthly figures {period.days && period.days > 31 ? `scaled from ${period.days} days` : "from this statement"}. Nothing
              here is sent anywhere.
            </p>
            <WhatIf perMonth={insights.per_month} />
          </Panel>
        </>
      )}

      <p className="text-xs text-slate-600">{insights.disclaimer}</p>
    </section>
  );
}
