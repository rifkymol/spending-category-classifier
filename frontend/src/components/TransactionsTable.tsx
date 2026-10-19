"use client";

import { useState } from "react";
import CategoryPicker from "./CategoryPicker";
import SegmentedControl from "./SegmentedControl";
import { CheckIcon } from "./icons";
import { labelsCsv, labelsFileName } from "@/lib/csv";
import { saveBlob } from "@/lib/download";
import { formatDate, formatIDR, formatPercent } from "@/lib/format";
import { isFlagged, isMoneyIn, reviewProgress } from "@/lib/summary";
import { CATEGORIES, type Row } from "@/lib/types";

interface Props {
  rows: Row[];
  onRelabel: (id: number, category: string) => void;
  onConfirm: (id: number) => void;
}

type Filter = "all" | "review" | "next";

/** Built in the browser and saved locally; the labels never go to the API. */
function exportLabels(rows: Row[]) {
  saveBlob(new Blob([labelsCsv(rows)], { type: "text/csv;charset=utf-8" }), labelsFileName());
}

const badge = "ml-2 inline-block rounded-full px-1.5 py-px align-[1px] text-[11px] font-medium";

/** The category picker plus, for rows still under review, the "Looks right" pill. */
function CategoryCell({ row, onRelabel, onConfirm }: { row: Row } & Omit<Props, "rows">) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <CategoryPicker
        value={row.predicted}
        options={CATEGORIES}
        onChange={(c) => onRelabel(row.id, c)}
        label={`Category for ${row.description}`}
      />
      {row.needs_review && (
        <button
          type="button"
          onClick={() => onConfirm(row.id)}
          aria-label={`Looks right: keep ${row.predicted} for ${row.description}`}
          title="Looks right"
          className="focus-ring inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border border-line bg-surface text-accent transition-colors duration-150 hover:border-accent hover:bg-accent-soft"
        >
          <CheckIcon className="h-4 w-4" />
        </button>
      )}
    </span>
  );
}

export default function TransactionsTable({ rows, onRelabel, onConfirm }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const progress = reviewProgress(rows);
  const remaining = progress.flagged - progress.reviewed;
  // "To review" keeps reviewed rows visible so they can be revisited; "Next" hides them.
  const shown =
    filter === "review" ? rows.filter(isFlagged) : filter === "next" ? rows.filter((r) => r.needs_review) : rows;
  const filters = [
    { value: "all", label: "All", count: rows.length },
    { value: "review", label: "To review", count: progress.flagged },
    { value: "next", label: "Next", count: remaining },
  ] as const;

  return (
    <section aria-labelledby="tx-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="tx-heading" className="text-base font-semibold tracking-tight">
            Transactions
          </h2>
          <p className="mt-0.5 max-w-prose text-sm text-muted">
            Change a category to correct it, or press ✓ if it looks right. Reviewed rows no longer need review.
          </p>
        </div>
        <SegmentedControl label="Show" options={filters} value={filter} onChange={setFilter} />
      </div>

      <div className="mt-5 flex flex-col gap-2 border-y border-line py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite" className="flex items-center gap-3 text-ink-2">
          {progress.flagged === 0 ? (
            "Nothing was flagged for review."
          ) : (
            <>
              <span>
                Reviewed <span className="font-semibold tabular-nums text-ink">{progress.reviewed}</span> of{" "}
                <span className="font-semibold tabular-nums text-ink">{progress.flagged}</span> flagged
              </span>
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
            Saved to your computer only. Put it in <code className="font-mono">data/labels/</code> to train your personal model.
          </p>
          <button
            type="button"
            onClick={() => exportLabels(rows)}
            className="focus-ring rounded-full border border-line px-3 py-1 text-sm font-medium text-ink transition-colors duration-150 hover:border-line-strong hover:bg-subtle"
          >
            Export labels
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="py-8 text-sm text-muted">
          {filter === "next" && progress.flagged > 0 ? "All flagged rows are reviewed." : "No transactions need review."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th scope="col" className="hidden py-2.5 pl-3 pr-4 font-medium sm:table-cell">Date</th>
                <th scope="col" className="py-2.5 pl-3 pr-4 font-medium sm:pl-0">Description</th>
                <th scope="col" className="py-2.5 pr-3 text-right font-medium sm:pr-4">Amount</th>
                <th scope="col" className="hidden py-2.5 pr-4 font-medium sm:table-cell">Category</th>
                <th scope="col" className="hidden py-2.5 pr-4 text-right font-medium md:table-cell">Confidence</th>
                <th scope="col" className="hidden py-2.5 pr-3 font-medium md:table-cell">Source</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                // A 2px amber bar on the row's first visible cell marks rows still under review.
                const bar = r.needs_review ? "shadow-[inset_2px_0_0_var(--color-warn-bar)]" : "";
                return (
                  <tr key={r.id} className="border-b border-line align-top transition-colors duration-150 hover:bg-subtle/50">
                    <td className={`hidden whitespace-nowrap py-3 pl-3 pr-4 tabular-nums text-muted sm:table-cell ${bar}`}>
                      {formatDate(r.date)}
                    </td>
                    <td className={`py-3 pl-3 pr-4 sm:pl-0 sm:shadow-none ${bar}`}>
                      <span className="block text-xs tabular-nums text-muted sm:hidden">{formatDate(r.date)}</span>
                      <span className="break-words [overflow-wrap:anywhere]">{r.description}</span>
                      {isMoneyIn(r) && <span className={`${badge} bg-accent-soft text-accent`}>In</span>}
                      {r.needs_review && <span className={`${badge} bg-warn-soft text-warn`}>Review</span>}
                      {r.reviewed && <span className={`${badge} bg-subtle text-muted`}>Reviewed</span>}
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
                      {formatPercent(r.confidence)}
                    </td>
                    <td className="hidden py-3 pr-3 text-xs text-muted md:table-cell">{r.source}</td>
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
