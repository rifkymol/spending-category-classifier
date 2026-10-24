"use client";

import { useId, useRef, useState } from "react";
import { LockIcon, UploadIcon } from "./icons";
import { classify, isPdf, MAX_BYTES } from "@/lib/api";
import { useLocale, type Locale, type MessageKey } from "@/lib/i18n";
import { labelsForUpload } from "@/lib/labelsStore";
import type { ClassifyResponse } from "@/lib/types";

interface Props {
  /** `locale` is the language the response's insights were written in; `labelsUsed` is how many of
   * the user's remembered corrections went with the upload. */
  onResult: (result: ClassifyResponse, fileName: string, locale: Locale, labelsUsed: number) => void;
}

function validate(file: File): MessageKey | null {
  if (!file.name.toLowerCase().endsWith(".csv") && !isPdf(file)) return "upload.errType";
  if (file.size > MAX_BYTES) return "upload.errSize";
  if (file.size === 0) return "upload.errEmpty";
  return null;
}

const code = "rounded bg-subtle px-1 py-px font-mono text-[0.85em] text-ink-2";

export default function Upload({ onResult }: Props) {
  const { locale, t, rich } = useLocale();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(file: File | undefined) {
    if (!file || loading) return;
    const problem = validate(file);
    if (problem) {
      setError(t(problem));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      // Empty unless "Remember my corrections" is on and some are saved.
      const labels = await labelsForUpload();
      onResult(await classify(file, locale, labels), file.name, locale, labels.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("upload.errGeneric"));
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
            {t("upload.heading")}
          </h2>
          <p className="mt-2 text-ink-2">{t("upload.sub")}</p>
        </div>
        <p className="inline-flex items-center gap-1.5 self-start rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent sm:self-auto">
          <LockIcon className="h-3.5 w-3.5" />
          {t("upload.privacy")}
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
            {t("upload.loading")}
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
            <span className="mt-4 font-medium text-ink">{dragging ? t("upload.drop") : t("upload.prompt")}</span>
            <span className="mt-2 max-w-md text-sm text-muted">
              {/* Column names are the CSV's own headers, so they stay English. */}
              {rich("upload.help", {
                description: <code className={code}>description</code>,
                date: <code className={code}>date</code>,
                amount: <code className={code}>amount</code>,
              })}
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
        {rich("upload.sample", {
          link: (
            <a
              href="/sample.csv"
              download="sample_transactions.csv"
              className="focus-ring rounded-sm font-medium text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
            >
              {t("upload.sampleLink")}
            </a>
          ),
        })}
      </p>
    </section>
  );
}
