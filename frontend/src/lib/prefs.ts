/**
 * UI preferences: language and theme. The ONLY things this app keeps in browser storage,
 * under the keys "lang" ("en" | "id") and "theme" ("system" | "light" | "dark").
 * No financial data is ever stored; scripts/check-storage.mjs fails the build check if any
 * other key or any other kind of browser storage shows up in src/.
 *
 * The <html> element is the source of truth while the page runs: the inline script below sets
 * its `lang` and `data-theme` before first paint, and the setters here update both the element
 * and storage. Components read them through useSyncExternalStore (see i18n.ts and ThemeToggle).
 */

export type Locale = "en" | "id";
export type Theme = "system" | "light" | "dark";

/**
 * Runs in <head> before first paint, so a saved dark theme never flashes light.
 * Language: the saved choice, else the browser language ("id…" → Indonesian), else English.
 * Every storage access is inside try/catch: storage can be blocked or unavailable.
 */
export const PREFS_SCRIPT = `(function(){var d=document.documentElement;var t=null,l=null;
try{t=localStorage.getItem("theme");l=localStorage.getItem("lang")}catch(e){}
if(t==="light"||t==="dark")d.setAttribute("data-theme",t);
if(l!=="en"&&l!=="id"){l=String(navigator.language||"").toLowerCase().indexOf("id")===0?"id":"en"}
d.lang=l})();`;

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function subscribePrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---- language ---------------------------------------------------------------

export function getLocale(): Locale {
  return document.documentElement.lang === "id" ? "id" : "en";
}

export const getServerLocale = (): Locale => "en";

export function setLocale(locale: Locale): void {
  document.documentElement.lang = locale;
  try {
    localStorage.setItem("lang", locale);
  } catch {
    // Storage blocked: the choice still applies to this page.
  }
  notify();
}

// ---- theme ------------------------------------------------------------------

export function getTheme(): Theme {
  const value = document.documentElement.getAttribute("data-theme");
  return value === "light" || value === "dark" ? value : "system";
}

export const getServerTheme = (): Theme => "system";

/** "system" removes data-theme, so the CSS follows prefers-color-scheme again. */
export function setTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // Storage blocked: the choice still applies to this page.
  }
  notify();
}
