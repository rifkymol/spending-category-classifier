"use client";

import SegmentedControl from "./SegmentedControl";
import { LOCALES, useLocale } from "@/lib/i18n";

/** EN | ID. Sets <html lang> and remembers the choice. */
export default function LanguageToggle() {
  const { locale, setLocale, t } = useLocale();
  const options = LOCALES.map((l) => ({
    value: l.value,
    // Shown as EN / ID; read out as each language's own name, in that language.
    label: l.label,
    ariaLabel: l.name,
    lang: l.value,
  }));
  return <SegmentedControl label={t("prefs.language")} size="sm" options={options} value={locale} onChange={setLocale} />;
}
