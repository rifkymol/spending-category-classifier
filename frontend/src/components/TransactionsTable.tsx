"use client";

import { useState } from "react";
import { formatIDR, formatPercent } from "@/lib/format";
import { isMoneyIn } from "@/lib/summary";
import { CATEGORIES, type Row } from "@/lib/types";

interface Props {
  rows: Row[];
  onRelabel: (id: number, category: string) => void;
}

type Filter = "all" | "review";

export default function TransactionsTable({ rows, onRelabel }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const reviewCount = rows.filter((r) => r.needs_review).length;
  const shown = filter === "review" ? rows.filter((r) => r.needs_review) : rows;
  const filters: [Filter, string][] = [
    ["all", `All (${rows.length})`],
    ["review", `Needs review (${reviewCount})`],
  ];

  return (
    <section aria-labelledby="tx-heading" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="tx-heading" className="font-semibold">
            Transactions
          </h2>
          <p className="text-sm text-slate-600">Change a category to correct it. Corrected rows no longer need review.</p>
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

      {shown.length === 0 ? (
        <p className="p-5 text-sm text-slate-600">No transactions need review.</p>
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
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                    {r.amount === null ? "—" : `${isMoneyIn(r) ? "+" : ""}${formatIDR(r.amount)}`}
                  </td>
                  <td className="px-4 py-2">
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
