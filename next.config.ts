import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@astralsync/astro-core", "@astralsync/numero-core"],
  // geo-tz reads its timezone boundary data from node_modules at runtime and
  // must not be bundled.
  serverExternalPackages: ["geo-tz", "@prisma/client"],
  // lib/content.ts reads content/ from process.cwd() at runtime; without this,
  // standalone/containerized builds ship with an empty content library.
  outputFileTracingIncludes: {
    "/*": ["content/**/*"],
  },
  async headers() {
    return [
      {
        // Per the Next PWA guide: never let browsers cache the worker script
        // itself, and pin a strict CSP for it.
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
