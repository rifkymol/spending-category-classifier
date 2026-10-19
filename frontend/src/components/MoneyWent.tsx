"use client";

import { useId } from "react";
import { formatIDR } from "@/lib/format";
import { useLocale } from "@/lib/i18n";

export interface RankedItem {
  name: string;
  count: number;
  total: number;
  avg: number;
  /** Share of the card's total (this category, transfers out or money in); null when unknown. */
  share: number | null;
}

interface Props {
  title: string;
  items: RankedItem[];
  /** The category color: the #1 row's bar and the card's accent. */
  color: string;
  /** The file has amounts (false: ranked by count, no Rupiah). */
  byAmount: boolean;
}

/**
 * "Where the money went": the top places (merchants, recipients or sources) as a prominent card,
 * biggest first. The #1 row is emphasized, so the largest expense is the first thing you see.
 */
export default function MoneyWent({ title, items, color, byAmount }: Props) {
  const { t, number, percent } = useLocale();
  const headingId = useId();
  const max = Math.max(...items.map((i) => (byAmount ? i.total : i.count)), 0);

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-line bg-canvas p-4"
      style={{ borderTopColor: color, borderTopWidth: 3 }}
    >
      <h3 id={headingId} className="text-sm font-semibold tracking-tight">
        {title}
      </h3>
      <ol className="mt-3 space-y-3.5">
        {items.map((item, i) => {
          const first = i === 0;
          const value = byAmount ? item.total : item.count;
          return (
            <li key={item.name}>
              <div className="flex items-baseline gap-2">
                <span className={`min-w-0 flex-1 truncate ${first ? "text-[15px] font-semibold" : "text-sm"}`} title={item.name}>
                  {item.name}
                </span>
                {first && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-subtle px-1.5 py-px text-[11px] font-medium text-ink-2">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                    {t("details.biggest")}
                  </span>
                )}
                <span className={`shrink-0 tabular-nums ${first ? "text-lg font-semibold tracking-tight" : "text-base font-medium"}`}>
                  {byAmount ? formatIDR(item.total) : `${number(item.count)}×`}
                </span>
              </div>
              <p className="mt-0.5 text-xs tabular-nums text-muted">
                {byAmount
                  ? t("details.rowSub", { count: number(item.count), avg: formatIDR(item.avg) })
                  : t("details.rowSubCount", { count: number(item.count) })}
                {item.share !== null && <> · {t("details.rowShare", { pct: percent(item.share) })}</>}
              </p>
              <div aria-hidden="true" className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-subtle">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${max > 0 ? (value / max) * 100 : 0}%`,
                    background: first ? color : "var(--color-line-strong)",
                  }}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
