import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, makeNonce } from "@/lib/csp.mjs";

/**
 * Sets a strict Content-Security-Policy with a fresh nonce on every page (lib/csp.mjs).
 * Next reads the nonce from the request's CSP header and puts it on its own scripts; the layout
 * reads x-nonce for our pre-paint script. A nonce needs a fresh render per request, so pages are
 * dynamically rendered. The other security headers come from next.config.ts.
 */
export function proxy(request: NextRequest) {
  const nonce = makeNonce();
  const csp = buildCsp({
    nonce,
    // The public API URL as it was at build time (next.config.ts), the one lib/api.ts calls.
    apiUrl: process.env.CSP_API_URL,
    dev: process.env.NODE_ENV === "development",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Pages only: static files run no inline code and get the other headers from next.config.ts.
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
