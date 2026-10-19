"use client";

import { useId, useRef, useState } from "react";
import { LockIcon, UploadIcon } from "./icons";
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

const code = "rounded bg-subtle px-1 py-px font-mono text-[0.85em] text-ink-2";

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
    <section aria-labelledby="upload-heading" className="animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="upload-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Upload a statement
          </h2>
          <p className="mt-2 text-ink-2">A BCA e-statement PDF or a CSV.</p>
        </div>
        <p className="inline-flex items-center gap-1.5 self-start rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent sm:self-auto">
          <LockIcon className="h-3.5 w-3.5" />
          Processed on this computer, never stored
        </p>
      </div>

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
        className={`mt-8 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center transition-colors duration-200 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent sm:py-24 ${
          dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-surface hover:border-ink-2/40"
        } ${loading ? "pointer-events-none opacity-70" : ""}`}
      >
        {loading ? (
          <span role="status" className="flex items-center gap-3 text-ink-2">
            <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
            Classifying transactions…
          </span>
        ) : (
          <>
            <span
              aria-hidden="true"
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-200 ${
                dragging ? "bg-surface text-accent" : "bg-subtle text-ink-2"
              }`}
            >
              <UploadIcon className="h-6 w-6" />
            </span>
            <span className="mt-4 font-medium text-ink">
              {dragging ? "Drop to classify" : "Drop a PDF or CSV here, or click to choose one"}
            </span>
            <span className="mt-2 max-w-md text-sm text-muted">
              PDF: a BCA e-statement without a password. CSV: needs a <code className={code}>description</code> column;{" "}
              <code className={code}>date</code> and <code className={code}>amount</code> are optional. Max 5 MB.
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
        <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <p className="mt-6 text-sm text-muted">
        No statement handy?{" "}
        <a
          href="/sample.csv"
          download="sample_transactions.csv"
          className="focus-ring rounded-sm font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
        >
          Download a synthetic sample CSV
        </a>{" "}
        and upload it.
      </p>
    </section>
  );
}
