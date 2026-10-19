"use client";

import { useSyncExternalStore } from "react";
import SegmentedControl from "./SegmentedControl";
import { useLocale } from "@/lib/i18n";
import { getServerTheme, getTheme, setTheme, subscribePrefs, type Theme } from "@/lib/prefs";

/** System | Light | Dark. Sets data-theme on <html> (none = follow the system) and remembers the choice. */
export default function ThemeToggle() {
  const { t } = useLocale();
  const theme = useSyncExternalStore(subscribePrefs, getTheme, getServerTheme);
  const options = [
    { value: "system", label: t("theme.system") },
    { value: "light", label: t("theme.light") },
    { value: "dark", label: t("theme.dark") },
  ] as const satisfies readonly { value: Theme; label: string }[];
  return <SegmentedControl label={t("prefs.theme")} size="sm" options={options} value={theme} onChange={setTheme} />;
}
