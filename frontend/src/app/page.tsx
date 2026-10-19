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
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-14">
      <header className="mb-10 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Spending Classifier
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Sort bank-statement transactions into food, transport, shopping, bills and transfer.
          </p>
        </div>
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
