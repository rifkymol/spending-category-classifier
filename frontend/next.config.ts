import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Self-contained server in .next/standalone for the Docker image.
  output: "standalone",
};

export default nextConfig;
