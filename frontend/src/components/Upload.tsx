"use client";

import { useId, useRef, useState } from "react";
import { classify, isPdf, MAX_BYTES } from "@/lib/api";
import type { ClassifyResponse } from "@/lib/types";

interface Props {
  onResult: (result: ClassifyResponse, fileName: string) => void;
}

function validate(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".csv") && !isPdf(file)) return "Please choose a .pdf or .csv file.";
  if (file.size > MAX_BYTES) return "That file is larger than 5 MB.";
  if (file.size === 0) return "That file is empty.";
  return null;
}

export default function Upload({ onResult }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(file: File | undefined) {
    if (!file || loading) return;
    const problem = validate(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      onResult(await classify(file), file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section aria-labelledby="upload-heading" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 id="upload-heading" className="text-lg font-semibold">
        Upload a statement
      </h2>
      <p className="mt-1 text-sm text-slate-700">Upload a BCA e-statement PDF or a CSV.</p>
      <p className="mt-1 flex items-center gap-2 text-sm text-emerald-800">
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0 fill-current">
          <path d="M10 1.5 3 4.5v5c0 4.2 3 7.9 7 9 4-1.1 7-4.8 7-9v-5l-7-3Zm-1 12.1-3.3-3.3 1.4-1.4L9 10.8l3.9-3.9 1.4 1.4L9 13.6Z" />
        </svg>
        Your file is processed on this computer and never stored.
      </p>

      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handle(e.dataTransfer.files[0]);
        }}
        className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-600 ${
          dragging ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
        } ${loading ? "pointer-events-none opacity-70" : ""}`}
      >
        {loading ? (
          <span role="status" className="flex items-center gap-3 text-slate-700">
            <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
            Classifying transactions…
          </span>
        ) : (
          <>
            <span className="font-medium text-slate-800">Drop a PDF or CSV file here, or click to choose one</span>
            <span className="mt-1 text-sm text-slate-600">
              PDF: a BCA e-statement without a password. CSV: needs a{" "}
              <code className="rounded bg-slate-100 px-1">description</code> column; <code className="rounded bg-slate-100 px-1">date</code> and{" "}
              <code className="rounded bg-slate-100 px-1">amount</code> are optional. Max 5 MB.
            </span>
          </>
        )}
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept=".csv,.pdf,text/csv,application/pdf"
          className="sr-only"
          disabled={loading}
          onChange={(e) => handle(e.target.files?.[0])}
        />
      </label>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <p className="mt-6 text-sm text-slate-600">
        No statement handy?{" "}
        <a href="/sample.csv" download="sample_transactions.csv" className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900">
          Download a synthetic sample CSV
        </a>{" "}
        and upload it.
      </p>
    </section>
  );
}
