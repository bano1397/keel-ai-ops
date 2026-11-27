import type { NextConfig } from "next";

const backend = (process.env.KEEL_BACKEND_URL || "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  compress: false,
  async rewrites() {
    if (!backend) return [];
    return ["/api/:path*", "/webhooks/:path*", "/help/:path*", "/docs-files/:path*", "/health"].map((source) => ({
      source,
      destination: `${backend}${source}`,
    }));
  },
};

export default nextConfig;
