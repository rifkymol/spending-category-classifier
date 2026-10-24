"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { labelsCsv, labelsFileName } from "@/lib/csv";
import { saveBlob } from "@/lib/download";
import { useLocale } from "@/lib/i18n";
import {
  clearAll,
  getCachedCount,
  getServerCount,
  importCsv,
  saveLabel,
  setEnabled,
  subscribeLabels,
} from "@/lib/labelsStore";
import { getRememberLabels, getServerRememberLabels, subscribePrefs } from "@/lib/prefs";
import type { Row } from "@/lib/types";

/** Built in the browser and saved locally. The file is a machine format (also for `classify.py
 * train`), so its header and category keys stay English in every language. */
function exportLabels(rows: Row[]) {
  saveBlob(new Blob([labelsCsv(rows)], { type: "text/csv;charset=utf-8" }), labelsFileName());
}

const button =
  "focus-ring rounded-full border border-line px-3 py-1 text-sm font-medium text-ink transition-colors duration-150 hover:border-line-strong hover:bg-subtle disabled:pointer-events-none disabled:opacity-50";

/** "Your corrections": the opt-in switch to remember corrections in this browser, the count, and
 * Import / Export / Forget. Sits in the All transactions section. */
export default function YourCorrections({ rows }: { rows: Row[] }) {
  const { t, tc, rich } = useLocale();
  const enabled = useSyncExternalStore(subscribePrefs, getRememberLabels, getServerRememberLabels);
  const saved = useSyncExternalStore(subscribeLabels, getCachedCount, getServerCount);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function toggle() {
    setStatus(null);
    const on = !enabled;
    setEnabled(on);
    // Rows already reviewed in this upload are remembered too.
    if (on) for (const r of rows.filter((row) => row.reviewed)) await saveLabel(r);
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    setStatus(null);
    try {
      const result = await importCsv(await file.text());
      setStatus(
        result
          ? t("labels.imported", { imported: result.imported, hints: result.hints, skipped: result.skipped })
          : t("labels.importError"),
      );
    } catch {
      setStatus(t("labels.importError"));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function forget() {
    if (!window.confirm(t("labels.forgetConfirm"))) return;
    setStatus((await clearAll()) ? t("labels.forgotten") : t("labels.forgetError"));
  }

  return (
    <section aria-labelledby="your-corrections" className="mt-5 rounded-lg border border-line px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id="your-corrections" className="text-sm font-semibold">
            {t("labels.heading")}
          </h3>
          <p className="mt-0.5 max-w-prose text-xs text-muted">{t("labels.explain")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm text-ink-2">
          <span aria-hidden="true" className="hidden sm:inline">
            {t("labels.remember")}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={t("labels.remember")}
            onClick={toggle}
            className={`focus-ring relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 ${
              enabled ? "bg-accent" : "bg-line-strong"
            }`}
          >
            <span
              aria-hidden="true"
              className={`inline-block h-4 w-4 rounded-full bg-surface shadow transition-transform duration-150 ${
                enabled ? "translate-x-[18px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>
      <p aria-hidden="true" className="mt-1 text-sm text-ink-2 sm:hidden">
        {t("labels.remember")}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-xs tabular-nums text-muted">
          {enabled || saved > 0 ? tc("labels.count", saved) : t("labels.off")}
        </span>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={!enabled}
          title={enabled ? undefined : t("labels.importNeedsOn")}
          className={button}
        >
          {t("labels.import")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => importFile(e.target.files?.[0])}
        />
        <button type="button" onClick={() => exportLabels(rows)} className={button}>
          {t("tx.export")}
        </button>
        <button type="button" onClick={forget} disabled={saved === 0} className={`${button} text-danger`}>
          {t("labels.forget")}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">
        {rich("tx.exportNote", { folder: <code className="font-mono">data/labels/</code> })}
      </p>
      {status && (
        <p role="status" className="mt-2 text-xs text-ink-2">
          {status}
        </p>
      )}
    </section>
  );
}
