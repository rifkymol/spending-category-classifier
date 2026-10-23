"use client";

import { useId } from "react";
import { BUCKETS, OTHER_OUT_COLOR } from "./Insights";
import { formatIDR } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import type { Bucket, Insights } from "@/lib/types";

interface Props {
  budget: Insights["budget_503020"];
  /** Opens the Insights section at the full 50/30/20 card. */
  onDetails: () => void;
}

/**
 * The 50/30/20 view at a glance: three mini bars (needs, wants, savings). With an income they show
 * actual vs target in Rupiah per month; without one, shares of money out vs the guideline. Under
 * them, "Other money out" (family and friends, cash, other transfers) with its amount: it is in no
 * bucket, so it is never hidden inside one.
 */
export default function BudgetStrip({ budget, onDetails }: Props) {
  const { t, percent, compactIDR } = useLocale();
  const headingId = useId();
  const withIncome = budget.target_amounts !== null && budget.difference !== null;

  // needs/wants: a positive difference is money left under the target; savings: positive = short.
  const status = (bucket: Bucket, difference: number) =>
    bucket === "savings"
      ? difference > 0
        ? { text: t("strip.short"), good: false }
        : { text: t("budget.onTrack"), good: true }
      : difference >= 0
        ? { text: t("strip.within"), good: true }
        : { text: t("strip.over"), good: false };

  return (
    <section aria-labelledby={headingId}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={headingId} className="text-base font-semibold tracking-tight">
          {t("insights.budget")}
        </h2>
        <button
          type="button"
          onClick={onDetails}
          className="focus-ring rounded-sm text-sm font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
        >
          {t("strip.details")}
        </button>
      </div>
      <p className="mt-0.5 text-sm text-muted">{withIncome ? t("strip.perMonth") : t("strip.shares")}</p>

      <ul className="mt-5 grid grid-cols-3 gap-4 sm:gap-10">
        {BUCKETS.map((b) => {
          let value: string;
          let sub: string;
          let fill = 0;
          let mark = 0;
          let state: { text: string; good: boolean } | null = null;
          if (withIncome) {
            const actual = budget.actual_amounts[b.key] ?? 0;
            const target = budget.target_amounts![b.key];
            const scale = Math.max(target, actual, 1);
            value = compactIDR(actual);
            sub = t("strip.ofTarget", { target: compactIDR(target) });
            fill = (Math.max(actual, 0) / scale) * 100;
            mark = (target / scale) * 100;
            state = status(b.key, budget.difference![b.key]);
          } else {
            const share = budget.shares[b.key];
            const target = budget.targets[b.key];
            const scale = Math.max(share ?? 0, target, 0.0001);
            value = share === null ? "—" : percent(share, 0);
            sub = t("budget.guideline", { pct: percent(target, 0) });
            fill = ((share ?? 0) / scale) * 100;
            mark = (target / scale) * 100;
          }
          return (
            <li key={b.key} className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: b.color }} />
                {t(b.label)}
              </p>
              <p className="mt-1 text-base font-semibold tabular-nums tracking-tight">{value}</p>
              <p className="text-xs tabular-nums text-muted">{sub}</p>
              <div aria-hidden="true" className="relative mt-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
                  <div className="h-full rounded-full" style={{ width: `${fill}%`, background: b.color }} />
                </div>
                <span className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-ink" style={{ left: `${mark}%` }} />
              </div>
              {state && <p className={`mt-1.5 text-xs font-medium ${state.good ? "text-accent" : "text-warn"}`}>{state.text}</p>}
              {withIncome && b.key === "savings" && budget.left_over_monthly !== null && (
                <p className="mt-0.5 text-xs tabular-nums text-muted">
                  {t("insights.savedBreakdown", {
                    left: compactIDR(budget.left_over_monthly),
                    moved: compactIDR(budget.savings_transfers_monthly),
                  })}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {budget.other_out > 0 && (
        <p className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-line pt-3 text-sm">
          <span className="flex items-center gap-1.5 font-medium">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: OTHER_OUT_COLOR }} />
            {t("strip.otherOut")}
          </span>
          <span className="tabular-nums text-ink-2">
            {withIncome
              ? t("strip.perMonthValue", { amount: formatIDR(budget.other_out_monthly) })
              : `${formatIDR(budget.other_out)}${
                  budget.shares.other_out !== null ? ` · ${t("strip.shareOfOut", { pct: percent(budget.shares.other_out, 0) })}` : ""
                }`}
          </span>
          <span className="text-xs text-muted">{t("strip.otherOutHint")}</span>
        </p>
      )}
    </section>
  );
}
