// Fails (exit 1) if the English and Indonesian dictionaries differ: missing keys on either side,
// empty strings, different {placeholders}, or a plural key without both "_one" and "_other".
// Plain node, no dependencies. Run from frontend/: node scripts/check-i18n.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "messages");
const load = (name) => JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"));
const dicts = { en: load("en"), id: load("id") };
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

const problems = [];
const [enKeys, idKeys] = [new Set(Object.keys(dicts.en)), new Set(Object.keys(dicts.id))];
for (const key of enKeys) if (!idKeys.has(key)) problems.push(`missing in id.json: ${key}`);
for (const key of idKeys) if (!enKeys.has(key)) problems.push(`missing in en.json: ${key}`);

for (const [lang, dict] of Object.entries(dicts)) {
  for (const [key, value] of Object.entries(dict)) {
    if (typeof value !== "string" || value.trim() === "") problems.push(`${lang}.json: empty or not text: ${key}`);
    const base = key.replace(/_(one|other)$/, "");
    if (base !== key && !(`${base}_one` in dict && `${base}_other` in dict)) {
      problems.push(`${lang}.json: plural ${base} needs both _one and _other`);
    }
  }
}
for (const key of enKeys) {
  if (idKeys.has(key) && placeholders(dicts.en[key]) !== placeholders(dicts.id[key])) {
    problems.push(`placeholders differ for ${key}: en {${placeholders(dicts.en[key])}} vs id {${placeholders(dicts.id[key])}}`);
  }
}

if (problems.length) {
  console.error(`i18n check failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`i18n check passed: ${enKeys.size} keys in en and id, placeholders match.`);
