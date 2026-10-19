// Enforces the one browser-storage exception (see PRIVACY.md): the app may keep only the UI
// preferences "lang" and "theme" in localStorage, and nothing else, ever. No financial data.
//
// Fails (exit 1) if any file under src/:
//   - touches localStorage in any way other than getItem/setItem with the literal key "lang" or "theme"
//     (so no other key, no computed key, no removeItem/clear/key()/length, no aliasing);
//   - uses sessionStorage, indexedDB, cookies (document.cookie, cookieStore, next/headers cookies)
//     or the Cache Storage API.
// Plain node, no dependencies. Run from frontend/: node scripts/check-storage.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");
const ALLOWED_KEYS = new Set(["lang", "theme"]);
const FORBIDDEN = [
  [/\bsessionStorage\b/, "sessionStorage"],
  [/\bindexedDB\b/i, "IndexedDB"],
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
for (const path of files(src)) {
  const text = readFileSync(path, "utf8");
  const where = (index) => `${relative(root, path)}:${text.slice(0, index).split("\n").length}`;

  for (const [pattern, name] of FORBIDDEN) {
    const m = pattern.exec(text);
    if (m) problems.push(`${where(m.index)}: ${name} is not allowed`);
  }

  for (const m of text.matchAll(/\blocalStorage\b/g)) {
    uses++;
    const call = /^localStorage\.(getItem|setItem)\(\s*(["'])([^"']*)\2\s*[,)]/.exec(text.slice(m.index));
    if (!call) {
      problems.push(`${where(m.index)}: localStorage may only be used as getItem/setItem("lang" | "theme")`);
    } else if (!ALLOWED_KEYS.has(call[3])) {
      problems.push(`${where(m.index)}: localStorage key "${call[3]}" is not allowed (only "lang" and "theme")`);
    } else {
      keysSeen.add(call[3]);
    }
  }
}

if (problems.length) {
  console.error(`storage check failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`storage check passed: ${uses} localStorage uses, keys: ${[...keysSeen].sort().join(", ") || "none"}.`);
