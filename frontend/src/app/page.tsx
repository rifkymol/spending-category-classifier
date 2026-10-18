"use client";

import { useState } from "react";
import Upload from "@/components/Upload";
import Results from "@/components/Results";
import type { Insights, Row } from "@/lib/types";

// All data lives in this component's state only: nothing is written to browser storage or the URL.
export default function Home() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [insights, setInsights] = useState<Insights | null>(null);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Spending Classifier</h1>
        <p className="mt-1 text-slate-600">
          Sort bank-statement transactions into food, transport, shopping, bills and transfer.
        </p>
      </header>
      {rows === null ? (
        <Upload
          onResult={(result, name) => {
            setRows(result.rows);
            setInsights(result.insights ?? null);
            setFileName(name);
          }}
        />
      ) : (
        <Results
          rows={rows}
          fileName={fileName}
          initialInsights={insights}
          onChange={setRows}
          onReset={() => {
            setRows(null);
            setInsights(null);
            setFileName("");
          }}
        />
      )}
    </main>
  );
}
