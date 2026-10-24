/**
 * The user's own corrections, remembered in this browser (opt-in; CLAUDE.md privacy rule 7).
 *
 * The ONLY module that touches IndexedDB (scripts/check-storage.mjs enforces it). One database,
 * "scc-labels", with one object store, "labels". Each record holds the description, its category,
 * the direction (DB / CR / null) and when it was saved: no amounts, dates, income or files. Records
 * imported from an old labels file whose category key changed meaning carry `hint: true`: they are
 * sent as suggestions to review, never as confirmed labels.
 *
 * Saving happens only while the user's "Remember my corrections on this device" switch is on
 * (the "rememberLabels" preference, see prefs.ts). "Forget my corrections" deletes the database.
 * Every call is wrapped in try/catch and does nothing when IndexedDB is unavailable (private
 * windows, blocked storage, the server render).
 */

import data from "./categories.json";
import { CATEGORIES } from "./categories";
import { getRememberLabels, setRememberLabels } from "./prefs";

const DB_NAME = "scc-labels";
const DB_VERSION = 1;
const STORE = "labels";
/** Same caps as the API (backend/app/schemas.py): longer descriptions or more labels are refused. */
export const MAX_LABEL_CHARS = 300;
export const MAX_LABELS = 20_000;

const MIGRATION: Record<string, string> = data.migration;
const CHANGED_MEANING = new Set<string>(data.changed_meaning);

export type Direction = "DB" | "CR" | null;

export interface StoredLabel {
  /** labelKey(description, direction): one record per merchant and direction. */
  key: string;
  description: string;
  category: string;
  direction: Direction;
  updatedAt: number;
  hint?: true;
}

/** What is sent with an upload: the description, category and direction only. */
export interface LabelPayload {
  description: string;
  category: string;
  direction: Direction;
  hint?: true;
}

/**
 * The record key: the description lowercased, words with digits (reference codes, dates) and
 * punctuation removed, whitespace collapsed, plus the direction. The server matches on the same
 * idea (backend classifier/personalize.py label_key), so one merchant is stored once.
 */
export function labelKey(description: string, direction: Direction): string {
  const text = description
    .toLowerCase()
    .replace(/\S*\d\S*/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${text}|${direction ?? ""}`;
}

// ---- change notifications (for the count shown in the UI) --------------------

const listeners = new Set<() => void>();
let cachedCount = 0;

function changed() {
  for (const listener of listeners) listener();
}

async function refreshCount() {
  const next = await count();
  if (next !== cachedCount) {
    cachedCount = next;
    changed();
  }
}

/** For useSyncExternalStore: subscribing also loads the current count. */
export function subscribeLabels(listener: () => void): () => void {
  listeners.add(listener);
  void refreshCount();
  return () => listeners.delete(listener);
}

export const getCachedCount = () => cachedCount;
export const getServerCount = () => 0;

// ---- IndexedDB ----------------------------------------------------------------

/** Opens the database. Reads pass create = false, so they never re-create it after "Forget". */
function openDb(create: boolean): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        if (!create && event.oldVersion === 0) {
          request.transaction?.abort(); // no database yet: leave it that way (onerror resolves null)
          return;
        }
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Runs `work` in one transaction and resolves with its result once the transaction completes,
 * or with `fallback` when IndexedDB is unavailable or anything fails. */
async function withStore<T>(mode: IDBTransactionMode, fallback: T, work: (store: IDBObjectStore) => () => T): Promise<T> {
  const db = await openDb(mode === "readwrite");
  if (!db) return fallback;
  return new Promise<T>((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const result = work(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(result());
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        resolve(fallback);
      };
    } catch {
      db.close();
      resolve(fallback);
    }
  });
}

// ---- API ----------------------------------------------------------------------

export const isEnabled = (): boolean => getRememberLabels();

export function setEnabled(on: boolean): void {
  setRememberLabels(on);
}

const validCategory = (category: string) => CATEGORIES.includes(category);
const validDescription = (description: string) => description.trim() !== "" && description.length <= MAX_LABEL_CHARS;

function record(description: string, category: string, direction: Direction, hint = false): StoredLabel {
  return { key: labelKey(description, direction), description, category, direction, updatedAt: Date.now(), ...(hint ? { hint: true as const } : {}) };
}

/** Remembers one row the user relabeled or confirmed. Does nothing while the switch is off, and
 * skips what the API would refuse (an unknown category, an empty or over-long description). */
export async function saveLabel(row: { description: string; predicted: string; direction?: Direction }): Promise<boolean> {
  if (!isEnabled() || !validCategory(row.predicted) || !validDescription(row.description)) return false;
  const saved = await withStore("readwrite", false, (store) => {
    store.put(record(row.description, row.predicted, row.direction ?? null));
    return () => true;
  });
  if (saved) await refreshCount();
  return saved;
}

/** Every remembered label, oldest first (so later ones win on the server). */
export async function getAll(): Promise<StoredLabel[]> {
  const all = await withStore<StoredLabel[]>("readonly", [], (store) => {
    const request = store.getAll();
    return () => (request.result as StoredLabel[]) ?? [];
  });
  return all.filter((l) => validCategory(l.category) && validDescription(l.description)).sort((a, b) => a.updatedAt - b.updatedAt);
}

/** What to send with an upload: the newest MAX_LABELS labels, without keys or timestamps. */
export async function labelsForUpload(): Promise<LabelPayload[]> {
  if (!isEnabled()) return [];
  return (await getAll()).slice(-MAX_LABELS).map(({ description, category, direction, hint }) =>
    hint ? { description, category, direction, hint } : { description, category, direction },
  );
}

export async function count(): Promise<number> {
  return withStore("readonly", 0, (store) => {
    const request = store.count();
    return () => request.result ?? 0;
  });
}

/** "Forget my corrections": deletes the whole database. */
export async function clearAll(): Promise<boolean> {
  const done = await new Promise<boolean>((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(false);
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
      request.onblocked = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
  cachedCount = 0;
  changed();
  return done;
}

// ---- import -------------------------------------------------------------------

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Undoes the ' that the export puts before text a spreadsheet would read as a formula (lib/csv.ts). */
const unneutralize = (value: string) => (/^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value);

// Rows a person reviewed ("user") or that came from earlier labels ("memory"); a file without the
// column is all labels. Rule rows are left out (the rules find them anyway), as are model guesses.
const IMPORT_SOURCES = new Set(["user", "memory", "label", ""]);

export interface ImportResult {
  imported: number;
  /** Old food/transfer rows: imported as hints that stay flagged for review. */
  hints: number;
  skipped: number;
}

/**
 * Imports an exported labels CSV (description and category columns; direction and label_source
 * optional), including files from before the 12 categories: old keys are mapped like the backend's
 * categories.MIGRATION, and old food/transfer rows become hints, not confirmed labels. A hint never
 * replaces a confirmed label. Returns null when the file has no description/category columns.
 */
export async function importCsv(text: string): Promise<ImportResult | null> {
  const [header, ...lines] = parseCsv(text.replace(/^﻿/, ""));
  const col = (name: string) => (header ?? []).findIndex((h) => h.trim().toLowerCase() === name);
  const [iDesc, iCat, iDir, iSrc] = ["description", "category", "direction", "label_source"].map(col);
  if (iDesc < 0 || iCat < 0) return null;

  const result: ImportResult = { imported: 0, hints: 0, skipped: 0 };
  const records = new Map<string, StoredLabel>();
  for (const line of lines) {
    if (line.every((f) => f.trim() === "")) continue;
    const description = unneutralize(line[iDesc] ?? "").trim();
    const raw = (line[iCat] ?? "").trim();
    const source = iSrc < 0 ? "" : (line[iSrc] ?? "").trim();
    const dir = iDir < 0 ? "" : (line[iDir] ?? "").trim().toUpperCase();
    const category = MIGRATION[raw] ?? raw;
    if (!IMPORT_SOURCES.has(source) || !validCategory(category) || !validDescription(description)) {
      result.skipped++;
      continue;
    }
    const hint = CHANGED_MEANING.has(raw);
    const rec = record(description, category, dir === "DB" || dir === "CR" ? dir : null, hint);
    records.set(rec.key, rec);
  }

  const done = await withStore("readwrite", false, (store) => {
    for (const rec of records.values()) {
      if (!rec.hint) {
        store.put(rec);
        result.imported++;
        continue;
      }
      // A hint is added only where no confirmed label exists.
      const existing = store.get(rec.key);
      existing.onsuccess = () => {
        const current = existing.result as StoredLabel | undefined;
        if (!current || current.hint) {
          store.put(rec);
          result.hints++;
        } else result.skipped++;
      };
    }
    return () => true;
  });
  if (!done) return null;
  await refreshCount();
  return result;
}
