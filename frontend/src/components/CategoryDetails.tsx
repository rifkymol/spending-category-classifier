"use client";

import { useId, useRef, useState, type AnimationEvent } from "react";
import MoneyWent from "./MoneyWent";
import Sheet from "./Sheet";
import { CategoryCell, badge } from "./TransactionsTable";
import { CloseIcon } from "./icons";
import { isTransfer as inTransfers } from "@/lib/categories";
import { colorFor, formatIDR } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { topMerchants } from "@/lib/merchants";
import { isMoneyIn } from "@/lib/summary";
import type { Insights, Row, Summary } from "@/lib/types";

interface Props {
  category: string;
  /** All rows; the panel shows the ones in `category`. */
  rows: Row[];
  summary: Summary;
  /** The file has amounts (false: totals are by count). */
  byAmount: boolean;
  /** The latest insights (top transfers for the transfer categories' panels); null when unavailable. */
  insights: Insights | null;
  returnFocus: HTMLElement | null;
  onClosed: () => void;
  /** The same relabel/confirm flow as the transactions table (summary and insights follow). */
  onRelabel: (id: number, category: string) => void;
  onConfirm: (id: number) => void;
}

// If animationend never fires (e.g. the tab is hidden), a relabelled row still goes away.
const LEAVE_FALLBACK_MS = 600;

const sumAmounts = (rows: Row[]) => rows.reduce((sum, r) => sum + (r.amount === null ? 0 : Math.abs(r.amount)), 0);

/** Newest first; rows without a date go last. */
const byDateDesc = (a: Row, b: Row) => (b.date ?? "").localeCompare(a.date ?? "") || b.id - a.id;

/** One category's transactions in a side panel (a bottom sheet on phones), relabelled in place. */
export default function CategoryDetails({
  category: key,
  rows,
  summary,
  byAmount,
  insights,
  returnFocus,
  onClosed,
  onRelabel,
  onConfirm,
}: Props) {
  const { t, tc, number, percent, date, category } = useLocale();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Rows relabelled away from this category, kept on screen (as they were) while they animate out.
  const [leaving, setLeaving] = useState<Row[]>([]);
  const [announcement, setAnnouncement] = useState("");

  const inCategory = rows.filter((r) => r.predicted === key);
  const current = new Set(inCategory.map((r) => r.id));
  const shown = [...inCategory, ...leaving.filter((r) => !current.has(r.id))].sort(byDateDesc);
  const leavingIds = new Set(leaving.map((r) => r.id));

  // The header counts only the live rows, so it updates as soon as a row is relabelled.
  const spend = inCategory.filter((r) => !isMoneyIn(r));
  const moneyIn = inCategory.filter(isMoneyIn);
  const share = summary.by_category.find((c) => c.category === key)?.share ?? 0;
  const isTransfer = inTransfers(key);
  // "Where the money went". Other categories: merchants from this category's money-out rows,
  // recomputed live. A transfer category uses its recipients and sources from the API's
  // top_transfers.by_category (grouped by counterparty, refreshed after every relabel), falling back
  // to the client's merchant grouping without insights.
  const transfers = isTransfer ? insights?.top_transfers.by_category[key] : undefined;
  const merchants = isTransfer ? [] : topMerchants(spend);
  const recipients = isTransfer && spend.length > 0 ? (transfers?.out_by_total ?? topMerchants(spend)) : [];
  const sources = isTransfer && moneyIn.length > 0 ? (transfers?.in_by_total ?? topMerchants(moneyIn)) : [];

  const drop = (id: number) => setLeaving((prev) => prev.filter((r) => r.id !== id));

  function relabelHere(id: number, next: string) {
    const row = rows.find((r) => r.id === id);
    if (row && next !== key) {
      setLeaving((prev) => [...prev.filter((r) => r.id !== id), row]);
      setAnnouncement(t("details.moved", { description: row.description, category: category(next) }));
      // The picker just used leaves with its row (which turns inert): keep focus inside the dialog.
      headingRef.current?.focus({ preventScroll: true });
      setTimeout(() => drop(id), LEAVE_FALLBACK_MS);
    }
    onRelabel(id, next);
  }

  function leftList(id: number, e: AnimationEvent<HTMLLIElement>) {
    if (e.target === e.currentTarget) drop(id);
  }

  const amount = (r: Row) =>
    r.amount === null ? (
      "—"
    ) : (
      <span className={isMoneyIn(r) ? "text-accent" : ""}>
        {isMoneyIn(r) ? "+" : ""}
        {formatIDR(Math.abs(r.amount))}
      </span>
    );

  const list = (items: Row[]) => (
    <ul className="border-t border-line">
      {items.map((r) => {
        const isLeaving = leavingIds.has(r.id) && !current.has(r.id);
        return (
          <li
            key={r.id}
            inert={isLeaving}
            onAnimationEnd={isLeaving ? (e) => leftList(r.id, e) : undefined}
            className={`border-b border-line py-3 ${isLeaving ? "animate-row-out overflow-hidden" : ""}`}
          >
            <div className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="text-xs tabular-nums text-muted">{date(r.date)}</p>
                <p className="mt-0.5">
                  <span className="break-words [overflow-wrap:anywhere]">{r.description}</span>
                  {isMoneyIn(r) && <span className={`${badge} bg-accent-soft text-accent`}>{t("tx.badgeIn")}</span>}
                  {r.needs_review && <span className={`${badge} bg-warn-soft text-warn`}>{t("tx.badgeReview")}</span>}
                </p>
              </div>
              <p className="shrink-0 whitespace-nowrap font-medium tabular-nums">{amount(r)}</p>
            </div>
            <div className="mt-2">
              <CategoryCell row={r} onRelabel={relabelHere} onConfirm={onConfirm} />
            </div>
          </li>
        );
      })}
    </ul>
  );

  const group = (title: string, items: Row[], live: Row[]) =>
    items.length > 0 && (
      <section className="mt-6" aria-label={title}>
        <h3 className="flex items-baseline justify-between gap-3 pb-2 text-sm font-semibold">
          <span>{title}</span>
          <span className="text-xs font-normal tabular-nums text-muted">
            {tc("chart.transactions", live.length)}
            {byAmount && <> · {formatIDR(sumAmounts(live))}</>}
          </span>
        </h3>
        {list(items)}
      </section>
    );

  return (
    <Sheet labelledBy={headingId} returnFocus={returnFocus} onClosed={onClosed}>
      {(close) => (
        <>
          <header className="border-b border-line px-5 pb-4 pt-3 sm:pt-5">
            <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong sm:hidden" />
            <div className="flex items-start justify-between gap-4">
              <h2
                id={headingId}
                ref={headingRef}
                tabIndex={-1}
                className="flex items-center gap-2 rounded-sm text-base font-semibold tracking-tight outline-none"
              >
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: colorFor(key) }} />
                {category(key)}
              </h2>
              <button
                type="button"
                data-autofocus
                onClick={close}
                aria-label={t("details.close")}
                title={t("details.close")}
                className="focus-ring -mr-1.5 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-subtle hover:text-ink"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 text-[1.75rem] font-semibold leading-none tracking-[-0.02em] tabular-nums">
              {byAmount ? formatIDR(sumAmounts(spend)) : number(spend.length)}
            </p>
            <p className="mt-1.5 text-sm tabular-nums text-muted">
              {tc("chart.transactions", spend.length)} · {t("details.ofSpend", { pct: percent(share) })}
            </p>
            {moneyIn.length > 0 && (
              <p className="mt-1 text-xs tabular-nums text-muted">
                {t("details.plusIn", { count: number(moneyIn.length), amount: formatIDR(sumAmounts(moneyIn)) })}
              </p>
            )}
          </header>

          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-4">
            <p aria-live="polite" className="sr-only">
              {announcement}
            </p>
            {isTransfer ? (
              <div className="space-y-3">
                {recipients.length > 0 && (
                  <MoneyWent title={t("details.topRecipients")} items={recipients} color={colorFor(key)} byAmount={byAmount} />
                )}
                {sources.length > 0 && (
                  <MoneyWent title={t("details.topSources")} items={sources} color={colorFor(key)} byAmount={byAmount} />
                )}
              </div>
            ) : (
              merchants.length > 0 && (
                <MoneyWent title={t("details.whereWent")} items={merchants} color={colorFor(key)} byAmount={byAmount} />
              )
            )}

            {shown.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">{t("details.empty")}</p>
            ) : isTransfer ? (
              <>
                {group(t("details.out"), shown.filter((r) => !isMoneyIn(r)), spend)}
                {group(t("details.in"), shown.filter(isMoneyIn), moneyIn)}
              </>
            ) : (
              <div className="mt-5">{list(shown)}</div>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}
