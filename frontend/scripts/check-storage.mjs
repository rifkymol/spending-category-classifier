// Enforces the browser-storage rule (CLAUDE.md rule 7, PRIVACY.md):
//   - localStorage holds only the UI preferences "lang", "theme" and "rememberLabels", and only
//     src/lib/prefs.ts touches it;
//   - IndexedDB holds only the user's opt-in corrections, in the one database "scc-labels", and only
//     src/lib/labelsStore.ts touches it;
//   - nothing else, ever. No sessionStorage, cookies, Cache Storage or Web SQL.
//
// Fails (exit 1) if any file under src/:
//   - touches localStorage outside prefs.ts, or in any way other than getItem/setItem with one of the
//     literal keys above (so no other key, no computed key, no removeItem/clear/key()/length, no aliasing);
//   - mentions IndexedDB in any spelling outside labelsStore.ts; inside it, uses `indexedDB` other than
//     `typeof indexedDB`, `indexedDB.open(DB_NAME, …)` or `indexedDB.deleteDatabase(DB_NAME)` (or the
//     literal "scc-labels"), or defines DB_NAME as anything but "scc-labels";
//   - uses sessionStorage, cookies (document.cookie, cookieStore, next/headers cookies), the Cache
//     Storage API or Web SQL.
// Plain node, no dependencies. Run from frontend/: node scripts/check-storage.mjs
// Pass a directory to check another tree (used to test the check itself): node scripts/check-storage.mjs <src>
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = process.argv[2] ? resolve(process.argv[2]) : join(root, "src");
const ALLOWED_KEYS = new Set(["lang", "theme", "rememberLabels"]);
const PREFS_FILE = "lib/prefs.ts";
const LABELS_FILE = "lib/labelsStore.ts";
const DB_NAME = "scc-labels";
const FORBIDDEN = [
  [/\bsessionStorage\b/, "sessionStorage"],
  [/\bdocument\s*\.\s*cookie\b/, "document.cookie"],
  [/\bcookieStore\b/, "cookieStore"],
  [/\bcookies\s*\(/, "cookies()"],
  [/\bcaches\s*\.\s*open\b/, "Cache Storage"],
  [/\bopenDatabase\b/, "Web SQL"],
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name)) yield path;
  }
}

const problems = [];
const keysSeen = new Set();
let uses = 0;
let dbUses = 0;
for (const path of files(src)) {
  const text = readFileSync(path, "utf8");
  const rel = relative(src, path).split("\\").join("/");
  const where = (index) => `${relative(root, path)}:${text.slice(0, index).split("\n").length}`;

  for (const [pattern, name] of FORBIDDEN) {
    const m = pattern.exec(text);
    if (m) problems.push(`${where(m.index)}: ${name} is not allowed`);
  }

  // ---- localStorage: prefs.ts only, three literal keys --------------------------
  for (const m of text.matchAll(/\blocalStorage\b/g)) {
    uses++;
    if (rel !== PREFS_FILE) {
      problems.push(`${where(m.index)}: localStorage is only allowed in src/${PREFS_FILE}`);
      continue;
    }
    const call = /^localStorage\.(getItem|setItem)\(\s*(["'])([^"']*)\2\s*[,)]/.exec(text.slice(m.index));
    if (!call) {
      problems.push(`${where(m.index)}: localStorage may only be used as getItem/setItem("lang" | "theme" | "rememberLabels")`);
    } else if (!ALLOWED_KEYS.has(call[3])) {
      problems.push(`${where(m.index)}: localStorage key "${call[3]}" is not allowed (only "lang", "theme" and "rememberLabels")`);
    } else {
      keysSeen.add(call[3]);
    }
  }

  // ---- IndexedDB: labelsStore.ts only, one database ------------------------------
  if (rel !== LABELS_FILE) {
    const m = /indexed\s*db|\bIDB[A-Z]\w*/i.exec(text);
    if (m) problems.push(`${where(m.index)}: IndexedDB is only allowed in src/${LABELS_FILE}`);
    continue;
  }
  const names = [...text.matchAll(/\bDB_NAME\s*=\s*([^;\n]*)/g)];
  if (names.length !== 1 || names[0][1].trim() !== `"${DB_NAME}"`) {
    problems.push(`${where(names[0]?.index ?? 0)}: DB_NAME must be defined once, as "${DB_NAME}"`);
  }
  for (const m of text.matchAll(/\bindexedDB\b/g)) {
    dbUses++;
    const before = text.slice(Math.max(0, m.index - 7), m.index);
    const call = /^indexedDB\.(open|deleteDatabase)\(\s*(DB_NAME|(["'])([^"']*)\3)\s*[,)]/.exec(text.slice(m.index));
    if (before === "typeof ") continue;
    if (!call) {
      problems.push(`${where(m.index)}: indexedDB may only be used as open/deleteDatabase(DB_NAME) or typeof indexedDB`);
    } else if (call[2] !== "DB_NAME" && call[4] !== DB_NAME) {
      problems.push(`${where(m.index)}: IndexedDB database "${call[4]}" is not allowed (only "${DB_NAME}")`);
    }
  }
}

if (problems.length) {
  console.error(`storage check failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `storage check passed: ${uses} localStorage uses, keys: ${[...keysSeen].sort().join(", ") || "none"}; ` +
    `${dbUses} indexedDB uses, database: ${DB_NAME} (src/${LABELS_FILE} only).`,
);
