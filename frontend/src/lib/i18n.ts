"use client";

/**
 * English and Indonesian UI text, with no i18n library.
 *
 * The strings live in messages/en.json and messages/id.json (flat keys). Text uses {name}
 * placeholders; plurals are two keys, "<key>_one" and "<key>_other". scripts/check-i18n.mjs
 * fails if the two files have different keys or placeholders.
 *
 * Category keys stay English everywhere (API, exports); only their display names change. Category and
 * group names come from the categories source (lib/categories.ts), not from the message files.
 * Rupiah amounts are always written id-ID style ("Rp 1.234.567"), in both languages.
 */

import { createContext, createElement, Fragment, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { categoryInfo, groupInfo } from "./categories";
import en from "./messages/en.json";
import id from "./messages/id.json";
import { getLocale, getServerLocale, setLocale, subscribePrefs, type Locale } from "./prefs";

export type { Locale };
export type MessageKey = keyof typeof en;
/** Keys that have "_one" and "_other" forms, without the suffix. */
export type PluralKey = { [K in MessageKey]: K extends `${infer B}_one` ? B : never }[MessageKey];
type Vars = Record<string, string | number>;

const DICTIONARIES: Record<Locale, Record<MessageKey, string>> = { en, id };
const INTL_LOCALE: Record<Locale, string> = { en: "en-US", id: "id-ID" };

export const LOCALES = [
  { value: "en", label: "EN", name: "English" },
  { value: "id", label: "ID", name: "Bahasa Indonesia" },
] as const;

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** The text for `key` in `locale`, with {placeholders} filled in. Usable outside React. */
export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  return fill(DICTIONARIES[locale][key] ?? DICTIONARIES.en[key] ?? key, vars);
}

/** The "_one" or "_other" form of `key` for `count`; {count} is filled in too. */
export function translateCount(locale: Locale, key: PluralKey, count: number, vars?: Vars): string {
  const form = new Intl.PluralRules(INTL_LOCALE[locale]).select(count) === "one" ? "one" : "other";
  return translate(locale, `${key}_${form}` as MessageKey, { count: formatNumber(count, locale), ...vars });
}

/** Text with React nodes (links, <code>) in place of its {placeholders}. */
export function translateRich(locale: Locale, key: MessageKey, nodes: Record<string, ReactNode>): ReactNode {
  const parts = translate(locale, key).split(/\{(\w+)\}/);
  // split() with a capture group puts placeholder names at odd indexes.
  return createElement(Fragment, null, ...parts.map((part, i) => (i % 2 === 1 ? (nodes[part] ?? `{${part}}`) : part)));
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale]).format(value);
}

/** 6_912_345 → "Rp 6.9M" (en) or "Rp 6,9 jt" (id): a short Rupiah figure for tight spots. */
export function formatCompactIDR(value: number, locale: Locale): string {
  const short = new Intl.NumberFormat(INTL_LOCALE[locale], { notation: "compact", maximumFractionDigits: 1 }).format(value);
  return `Rp ${short}`;
}

/** 0.125 → "12.5%" (en) or "12,5%" (id). */
export function formatPercent(share: number, locale: Locale, digits = 1): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(share);
}

/** "2026-09-22" → "22 Sep" (or "22 Sep 2026" with the year); Indonesian uses "Okt", "Des" and so on.
 * Anything that is not an ISO date is returned unchanged. */
export function formatDate(value: string | null, locale: Locale, withYear = false): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return value;
  const parts = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).formatToParts(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = `${part("day")} ${part("month").replace(/\.$/, "")}`;
  return withYear ? `${day} ${part("year")}` : day;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** A category's display name; unknown keys (e.g. an old one) are capitalized as they are. */
export function categoryName(category: string, locale: Locale): string {
  const info = categoryInfo(category);
  return info ? (locale === "id" ? info.name_id : info.name_en) : capitalize(category);
}

/** A group's display name (Needs / Wants / Transfers). */
export function groupName(group: string, locale: Locale): string {
  const info = groupInfo(group);
  return info ? (locale === "id" ? info.name_id : info.name_en) : capitalize(group);
}

function bind(locale: Locale) {
  return {
    locale,
    setLocale,
    t: (key: MessageKey, vars?: Vars) => translate(locale, key, vars),
    tc: (key: PluralKey, count: number, vars?: Vars) => translateCount(locale, key, count, vars),
    rich: (key: MessageKey, nodes: Record<string, ReactNode>) => translateRich(locale, key, nodes),
    number: (value: number) => formatNumber(value, locale),
    compactIDR: (value: number) => formatCompactIDR(value, locale),
    percent: (share: number, digits?: number) => formatPercent(share, locale, digits),
    date: (value: string | null, withYear?: boolean) => formatDate(value, locale, withYear),
    category: (category: string) => categoryName(category, locale),
    group: (group: string) => groupName(group, locale),
  };
}

export type LocaleContextValue = ReturnType<typeof bind>;

const LocaleContext = createContext<LocaleContextValue>(bind("en"));

/** Provides the active language. The server renders English; the client switches to the
 * language the head script picked (saved choice or browser language) right after hydration. */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribePrefs, getLocale, getServerLocale);
  const value = useMemo(() => bind(locale), [locale]);
  return createElement(LocaleContext.Provider, { value }, children);
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}
