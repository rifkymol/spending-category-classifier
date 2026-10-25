import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/lib/csp.mjs";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Self-contained server in .next/standalone for the Docker image.
  output: "standalone",
  // The API URL for the CSP's connect-src, inlined at build time like the client bundle's
  // NEXT_PUBLIC_API_URL. The proxy runs on the server, where NEXT_PUBLIC_* is otherwise read at
  // run time, and the Docker image sets it only while building.
  env: { CSP_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "" },
  // On every response; the Content-Security-Policy itself is set per page by src/proxy.ts.
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
