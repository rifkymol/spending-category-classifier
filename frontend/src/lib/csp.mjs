// The Content-Security-Policy and other security headers for every page (PRIVACY.md).
// Plain JavaScript with no imports so that src/proxy.ts, next.config.ts and
// scripts/check-csp.mjs (plain node) all use this one definition. Types: csp.d.mts.
//
// The policy lets a page talk only to itself and the configured API origin. Scripts run only
// with the per-request nonce that src/proxy.ts generates ('strict-dynamic' lets those scripts
// load Next's chunks). Styles allow 'unsafe-inline' because Recharts and React `style` props
// set inline styles; a style cannot run code or send data on its own under this policy.

export const DEFAULT_API_URL = "http://127.0.0.1:8000";

/** The origin (scheme://host:port) of the API URL; the default API origin if it does not parse. */
export function apiOrigin(apiUrl) {
  try {
    const url = new URL(apiUrl || DEFAULT_API_URL);
    if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
  } catch {
    // fall through
  }
  return new URL(DEFAULT_API_URL).origin;
}

/** The API origin plus, in development only, its localhost / 127.0.0.1 twin. */
function connectOrigins(apiUrl, dev) {
  const origin = apiOrigin(apiUrl);
  if (!dev) return [origin];
  const url = new URL(origin);
  const twin = { localhost: "127.0.0.1", "127.0.0.1": "localhost" }[url.hostname];
  if (!twin) return [origin];
  url.hostname = twin;
  return [origin, url.origin];
}

/**
 * The CSP header value. `dev` adds 'unsafe-eval' (React's dev-mode error overlay and HMR use
 * eval) and the localhost twin of the API origin; production never has either.
 */
export function buildCsp({ nonce, apiUrl, dev = false }) {
  const directives = [
    ["default-src", "'self'"],
    ["script-src", "'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "data:", "blob:"],
    ["font-src", "'self'"],
    ["connect-src", "'self'", ...connectOrigins(apiUrl, dev)],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
  ];
  return directives.map((d) => d.join(" ")).join("; ");
}

/** A fresh, unguessable nonce: 16 random bytes, base64. */
export function makeNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

// interest-cohort (FLoC) is left out: browsers dropped it and now log it as an unknown feature.
const PERMISSIONS = ["accelerometer", "camera", "geolocation", "gyroscope", "magnetometer", "microphone", "payment", "usb"];

/** The headers next.config.ts sets on every response, pages and static files alike. */
export const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: PERMISSIONS.map((p) => `${p}=()`).join(", ") },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];
