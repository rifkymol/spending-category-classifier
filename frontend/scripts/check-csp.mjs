// Enforces the browser-side half of "this page talks only to itself and the local API"
// (PRIVACY.md): builds the Content-Security-Policy from src/lib/csp.mjs, the same code
// src/proxy.ts uses, and fails (exit 1) unless, in production:
//   - script-src is exactly 'self' + the nonce + 'strict-dynamic' (so no 'unsafe-eval',
//     'unsafe-inline', hosts or schemes);
//   - connect-src is exactly 'self' + the API origin (also checked for a custom NEXT_PUBLIC_API_URL);
//   - object-src 'none', frame-ancestors 'none', base-uri 'self', form-action 'self',
//     default-src 'self', font-src 'self';
//   - no directive anywhere allows 'unsafe-eval' or a wildcard;
//   - the other security headers (nosniff, no-referrer, DENY, COOP, Permissions-Policy) are set;
//   - src/proxy.ts and the layout still use the builder and the nonce, and the proxy takes the API
//     URL from the build-time CSP_API_URL (next.config.ts).
// It also checks that 'unsafe-eval' appears only in the development policy.
// Plain node, no dependencies. Run from frontend/: node scripts/check-csp.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_API_URL, SECURITY_HEADERS, apiOrigin, buildCsp, makeNonce } from "../src/lib/csp.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const NONCE = "PLACEHOLDER";
const failures = [];

function check(ok, message) {
  if (!ok) failures.push(message);
}

function parse(csp) {
  const map = new Map();
  for (const part of csp.split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (!name) continue;
    check(!map.has(name), `duplicate directive ${name}`);
    map.set(name, values);
  }
  return map;
}

function same(actual, expected) {
  return actual !== undefined && actual.length === expected.length && actual.every((v, i) => v === expected[i]);
}

function expect(policy, name, expected, label) {
  const actual = policy.get(name);
  check(same(actual, expected), `${label}: ${name} is "${actual?.join(" ")}", expected "${expected.join(" ")}"`);
}

const cases = [
  [undefined, "http://127.0.0.1:8000"],
  ["http://127.0.0.1:8000/", "http://127.0.0.1:8000"],
  ["https://api.example.test:9443/base/", "https://api.example.test:9443"],
];
check(apiOrigin(undefined) === new URL(DEFAULT_API_URL).origin, "the default API origin is not 127.0.0.1:8000");

for (const [apiUrl, origin] of cases) {
  const label = `production, NEXT_PUBLIC_API_URL=${apiUrl ?? "(unset)"}`;
  const policy = parse(buildCsp({ nonce: NONCE, apiUrl }));
  expect(policy, "default-src", ["'self'"], label);
  expect(policy, "script-src", ["'self'", `'nonce-${NONCE}'`, "'strict-dynamic'"], label);
  expect(policy, "style-src", ["'self'", "'unsafe-inline'"], label);
  expect(policy, "img-src", ["'self'", "data:", "blob:"], label);
  expect(policy, "font-src", ["'self'"], label);
  expect(policy, "connect-src", ["'self'", origin], label);
  expect(policy, "object-src", ["'none'"], label);
  expect(policy, "base-uri", ["'self'"], label);
  expect(policy, "form-action", ["'self'"], label);
  expect(policy, "frame-ancestors", ["'none'"], label);
  for (const [name, values] of policy) {
    check(!values.includes("'unsafe-eval'"), `${label}: ${name} allows 'unsafe-eval'`);
    check(!values.some((v) => v.includes("*")), `${label}: ${name} has a wildcard`);
  }
}

const dev = parse(buildCsp({ nonce: NONCE, apiUrl: undefined, dev: true }));
check(dev.get("script-src")?.includes("'unsafe-eval'"), "development: script-src should allow 'unsafe-eval' for React's dev tools");
check(
  same(dev.get("connect-src"), ["'self'", "http://127.0.0.1:8000", "http://localhost:8000"]),
  `development: connect-src is "${dev.get("connect-src")?.join(" ")}"`,
);

const a = makeNonce();
check(/^[A-Za-z0-9+/]{22}==$/.test(a) && a !== makeNonce(), "makeNonce does not return a fresh 16-byte base64 value");

const headers = new Map(SECURITY_HEADERS.map((h) => [h.key.toLowerCase(), h.value]));
check(headers.get("x-content-type-options") === "nosniff", "X-Content-Type-Options is not nosniff");
check(headers.get("referrer-policy") === "no-referrer", "Referrer-Policy is not no-referrer");
check(headers.get("x-frame-options") === "DENY", "X-Frame-Options is not DENY");
check(headers.get("cross-origin-opener-policy") === "same-origin", "Cross-Origin-Opener-Policy is not same-origin");
const permissions = headers.get("permissions-policy") ?? "";
for (const feature of ["camera", "microphone", "geolocation", "payment", "usb"]) {
  check(permissions.includes(`${feature}=()`), `Permissions-Policy does not disable ${feature}`);
}

const proxy = readFileSync(join(root, "src", "proxy.ts"), "utf8");
check(/export function proxy\b/.test(proxy) && proxy.includes("buildCsp(") && proxy.includes('"x-nonce"'),
  "src/proxy.ts no longer builds the CSP with buildCsp and passes x-nonce");
// The proxy runs on the server, where NEXT_PUBLIC_* is read at run time; CSP_API_URL is inlined
// at build time, so the policy matches the API URL baked into the client bundle.
check(proxy.includes("process.env.CSP_API_URL") && !proxy.includes("NEXT_PUBLIC_API_URL"),
  "src/proxy.ts must take the API URL from the build-time CSP_API_URL");
const layout = readFileSync(join(root, "src", "app", "layout.tsx"), "utf8");
check(/<script nonce=\{nonce\}/.test(layout), "the pre-paint script in layout.tsx has no nonce");
const config = readFileSync(join(root, "next.config.ts"), "utf8");
check(config.includes("SECURITY_HEADERS"), "next.config.ts no longer sets SECURITY_HEADERS");
check(/CSP_API_URL:\s*process\.env\.NEXT_PUBLIC_API_URL/.test(config), "next.config.ts no longer inlines CSP_API_URL");

if (failures.length) {
  console.error(`check-csp: ${failures.length} problem(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("check-csp: OK (strict nonce CSP, connect-src limited to self + the API origin, security headers set)");
