"use client";

import { useState } from "react";
import { labelsCsv, labelsFileName } from "@/lib/csv";
import { saveBlob } from "@/lib/download";
import { formatIDR, formatPercent } from "@/lib/format";
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

export default function TransactionsTable({ rows, onRelabel, onConfirm }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const progress = reviewProgress(rows);
  const remaining = progress.flagged - progress.reviewed;
  // "Needs review" keeps reviewed rows visible so they can be revisited; "Next to review" hides them.
  const shown =
    filter === "review" ? rows.filter(isFlagged) : filter === "next" ? rows.filter((r) => r.needs_review) : rows;
  const filters: [Filter, string][] = [
    ["all", `All (${rows.length})`],
    ["review", `Needs review (${progress.flagged})`],
    ["next", `Next to review (${remaining})`],
  ];

  return (
    <section aria-labelledby="tx-heading" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="tx-heading" className="font-semibold">
            Transactions
          </h2>
          <p className="text-sm text-slate-600">
            Change a category to correct it, or press ✓ if it looks right. Reviewed rows no longer need review.
          </p>
        </div>
        <fieldset className="flex self-start rounded-lg border border-slate-300 p-0.5 text-sm sm:self-auto">
          <legend className="sr-only">Show</legend>
          {filters.map(([value, label]) => (
            <label
              key={value}
              className={`cursor-pointer rounded-md px-3 py-1.5 focus-within:outline-2 focus-within:outline-blue-700 ${
                filter === value ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <input
                type="radio"
                name="tx-filter"
                value={value}
                checked={filter === value}
                onChange={() => setFilter(value)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-700" aria-live="polite">
          {progress.flagged === 0 ? (
            "Nothing was flagged for review."
          ) : (
            <>
              Reviewed <span className="font-medium tabular-nums">{progress.reviewed}</span> of{" "}
              <span className="font-medium tabular-nums">{progress.flagged}</span> flagged
            </>
          )}
        </p>
        <div className="flex flex-col gap-1 sm:items-end">
          <button
            type="button"
            onClick={() => exportLabels(rows)}
            className="self-start rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 sm:self-auto"
          >
            Export labels
          </button>
          <p className="text-xs text-slate-600">
            Saved to your computer only. Put it in <code>data/labels/</code> to train your personal model.
          </p>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="p-5 text-sm text-slate-600">
          {filter === "next" && progress.flagged > 0 ? "All flagged rows are reviewed." : "No transactions need review."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                <th scope="col" className="px-4 py-2 font-medium">Date</th>
                <th scope="col" className="px-4 py-2 font-medium">Description</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Amount</th>
                <th scope="col" className="px-4 py-2 font-medium">Category</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Confidence</th>
                <th scope="col" className="px-4 py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={`border-b border-slate-100 last:border-0 ${r.needs_review ? "bg-amber-50" : ""}`}>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums text-slate-700">{r.date ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span className="break-all">{r.description}</span>
                    {isMoneyIn(r) && (
                      <span className="ml-2 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
                        In
                      </span>
                    )}
                    {r.needs_review && (
                      <span className="ml-2 inline-block rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">
                        Review
                      </span>
                    )}
                    {r.reviewed && (
                      <span className="ml-2 inline-block rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-800">
                        Reviewed
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                    {r.amount === null ? "—" : `${isMoneyIn(r) ? "+" : ""}${formatIDR(r.amount)}`}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <label className="sr-only" htmlFor={`cat-${r.id}`}>
                      Category for {r.description}
                    </label>
                    <select
                      id={`cat-${r.id}`}
                      value={r.predicted}
                      onChange={(e) => onRelabel(r.id, e.target.value)}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 capitalize focus-visible:outline-2 focus-visible:outline-blue-700"
                    >
                      {!(CATEGORIES as readonly string[]).includes(r.predicted) && (
                        <option value={r.predicted}>{r.predicted}</option>
                      )}
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    {r.needs_review && (
                      <button
                        type="button"
                        onClick={() => onConfirm(r.id)}
                        aria-label={`Looks right: keep ${r.predicted} for ${r.description}`}
                        title="Looks right"
                        className="ml-2 rounded-md border border-emerald-300 bg-white px-2 py-1 font-medium text-emerald-800 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-blue-700"
                      >
                        <span aria-hidden="true">✓</span>
                      </button>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{formatPercent(r.confidence)}</td>
                  <td className="px-4 py-2 text-slate-700">{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
