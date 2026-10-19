"use client";

import { useState } from "react";
import CategoryPicker from "./CategoryPicker";
import SegmentedControl from "./SegmentedControl";
import { CheckIcon } from "./icons";
import { labelsCsv, labelsFileName } from "@/lib/csv";
import { saveBlob } from "@/lib/download";
import { formatIDR } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { isFlagged, isMoneyIn, reviewProgress } from "@/lib/summary";
import { CATEGORIES, type Row } from "@/lib/types";

interface Props {
  rows: Row[];
  onRelabel: (id: number, category: string) => void;
  onConfirm: (id: number) => void;
}

type Filter = "all" | "review" | "next";

/** Built in the browser and saved locally; the labels never go to the API. The file is a machine
 * format for `classify.py train`, so its header and category keys stay English in every language. */
function exportLabels(rows: Row[]) {
  saveBlob(new Blob([labelsCsv(rows)], { type: "text/csv;charset=utf-8" }), labelsFileName());
}

const badge = "ml-2 inline-block rounded-full px-1.5 py-px align-[1px] text-[11px] font-medium";

/** The category picker plus, for rows still under review, the "Looks right" pill. */
function CategoryCell({ row, onRelabel, onConfirm }: { row: Row } & Omit<Props, "rows">) {
  const { t, category } = useLocale();
  return (
    <span className="inline-flex items-center gap-1.5">
      <CategoryPicker
        value={row.predicted}
        options={CATEGORIES}
        onChange={(c) => onRelabel(row.id, c)}
        label={t("tx.categoryFor", { description: row.description })}
        optionLabel={category}
      />
      {row.needs_review && (
        <button
          type="button"
          onClick={() => onConfirm(row.id)}
          aria-label={t("tx.looksRightAria", { category: category(row.predicted), description: row.description })}
          title={t("tx.looksRight")}
          className="focus-ring inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border border-line bg-surface text-accent transition-colors duration-150 hover:border-accent hover:bg-accent-soft"
        >
          <CheckIcon className="h-4 w-4" />
        </button>
      )}
    </span>
  );
}

export default function TransactionsTable({ rows, onRelabel, onConfirm }: Props) {
  const { t, rich, date, percent } = useLocale();
  const [filter, setFilter] = useState<Filter>("all");
  const progress = reviewProgress(rows);
  const remaining = progress.flagged - progress.reviewed;
  // "To review" keeps reviewed rows visible so they can be revisited; "Next" hides them.
  const shown =
    filter === "review" ? rows.filter(isFlagged) : filter === "next" ? rows.filter((r) => r.needs_review) : rows;
  const filters = [
    { value: "all", label: t("tx.all"), count: rows.length },
    { value: "review", label: t("tx.toReview"), count: progress.flagged },
    { value: "next", label: t("tx.next"), count: remaining },
  ] as const;
  const strong = (value: number) => <span className="font-semibold tabular-nums text-ink">{value}</span>;

  return (
    <section aria-labelledby="tx-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="tx-heading" className="text-base font-semibold tracking-tight">
            {t("tx.heading")}
          </h2>
          <p className="mt-0.5 max-w-prose text-sm text-muted">{t("tx.help")}</p>
        </div>
        <SegmentedControl label={t("tx.show")} options={filters} value={filter} onChange={setFilter} />
      </div>

      <div className="mt-5 flex flex-col gap-2 border-y border-line py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite" className="flex items-center gap-3 text-ink-2">
          {progress.flagged === 0 ? (
            t("tx.nothingFlagged")
          ) : (
            <>
              <span>{rich("tx.progress", { reviewed: strong(progress.reviewed), flagged: strong(progress.flagged) })}</span>
              <span aria-hidden="true" className="h-1 w-20 overflow-hidden rounded-full bg-subtle">
                <span
                  className="block h-full rounded-full bg-accent transition-[width] duration-200"
                  style={{ width: `${(progress.reviewed / progress.flagged) * 100}%` }}
                />
              </span>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-xs text-muted">
            {rich("tx.exportNote", { folder: <code className="font-mono">data/labels/</code> })}
          </p>
          <button
            type="button"
            onClick={() => exportLabels(rows)}
            className="focus-ring rounded-full border border-line px-3 py-1 text-sm font-medium text-ink transition-colors duration-150 hover:border-line-strong hover:bg-subtle"
          >
            {t("tx.export")}
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="py-8 text-sm text-muted">
          {filter === "next" && progress.flagged > 0 ? t("tx.allReviewed") : t("tx.noneNeedReview")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th scope="col" className="hidden py-2.5 pl-3 pr-4 font-medium sm:table-cell">{t("tx.date")}</th>
                <th scope="col" className="py-2.5 pl-3 pr-4 font-medium sm:pl-0">{t("tx.description")}</th>
                <th scope="col" className="py-2.5 pr-3 text-right font-medium sm:pr-4">{t("tx.amount")}</th>
                <th scope="col" className="hidden py-2.5 pr-4 font-medium sm:table-cell">{t("tx.category")}</th>
                <th scope="col" className="hidden py-2.5 pr-4 text-right font-medium md:table-cell">{t("tx.confidence")}</th>
                <th scope="col" className="hidden py-2.5 pr-3 font-medium md:table-cell">{t("tx.source")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                // A 2px amber bar on the row's first visible cell marks rows still under review.
                const bar = r.needs_review ? "shadow-[inset_2px_0_0_var(--color-warn-bar)]" : "";
                return (
                  <tr key={r.id} className="border-b border-line align-top transition-colors duration-150 hover:bg-subtle/50">
                    <td className={`hidden whitespace-nowrap py-3 pl-3 pr-4 tabular-nums text-muted sm:table-cell ${bar}`}>
                      {date(r.date)}
                    </td>
                    <td className={`py-3 pl-3 pr-4 sm:pl-0 sm:shadow-none ${bar}`}>
                      <span className="block text-xs tabular-nums text-muted sm:hidden">{date(r.date)}</span>
                      <span className="break-words [overflow-wrap:anywhere]">{r.description}</span>
                      {isMoneyIn(r) && <span className={`${badge} bg-accent-soft text-accent`}>{t("tx.badgeIn")}</span>}
                      {r.needs_review && <span className={`${badge} bg-warn-soft text-warn`}>{t("tx.badgeReview")}</span>}
                      {r.reviewed && <span className={`${badge} bg-subtle text-muted`}>{t("tx.badgeReviewed")}</span>}
                      <div className="mt-2 sm:hidden">
                        <CategoryCell row={r} onRelabel={onRelabel} onConfirm={onConfirm} />
                      </div>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-3 text-right font-medium tabular-nums sm:pr-4">
                      {r.amount === null ? (
                        "—"
                      ) : (
                        <span className={isMoneyIn(r) ? "text-accent" : ""}>
                          {isMoneyIn(r) ? "+" : ""}
                          {formatIDR(r.amount)}
                        </span>
                      )}
                    </td>
                    <td className="hidden whitespace-nowrap py-2 pr-4 sm:table-cell">
                      <CategoryCell row={r} onRelabel={onRelabel} onConfirm={onConfirm} />
                    </td>
                    <td className="hidden whitespace-nowrap py-3 pr-4 text-right text-xs tabular-nums text-muted md:table-cell">
                      {percent(r.confidence)}
                    </td>
                    <td className="hidden py-3 pr-3 text-xs text-muted md:table-cell">
                      {t(r.source === "rule" ? "tx.source.rule" : "tx.source.model")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
