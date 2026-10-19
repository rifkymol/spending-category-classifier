"use client";

import { useState } from "react";
import LanguageToggle from "@/components/LanguageToggle";
import ThemeToggle from "@/components/ThemeToggle";
import Upload from "@/components/Upload";
import Results from "@/components/Results";
import { useLocale, type Locale } from "@/lib/i18n";
import type { Insights, Row } from "@/lib/types";

// All data lives in this component's state only: nothing is written to browser storage or the URL.
// (Browser storage holds only the language and theme choices, see lib/prefs.ts.)
export default function Home() {
  const { t } = useLocale();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [insights, setInsights] = useState<Insights | null>(null);
  const [insightsLocale, setInsightsLocale] = useState<Locale>("en");

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-14">
      <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">{t("app.title")}</h1>
          <p className="mt-0.5 text-sm text-muted">{t("app.tagline")}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>
      {rows === null ? (
        <Upload
          onResult={(result, name, locale) => {
            setRows(result.rows);
            setInsights(result.insights ?? null);
            setInsightsLocale(locale);
            setFileName(name);
          }}
        />
      ) : (
        <Results
          rows={rows}
          fileName={fileName}
          initialInsights={insights}
          initialInsightsLocale={insightsLocale}
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
