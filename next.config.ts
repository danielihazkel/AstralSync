import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `typescript` resolves to the TS 6 line (typescript-eslint needs its JS
  // API — see the aliases in package.json), and that package ships no `tsc`
  // bin for the CLI mode Next defaults to. Type-check via the TS 6 API;
  // `npm run typecheck` covers the fast native TS 7 compiler path.
  experimental: {
    useTypeScriptCli: false,
  },
  transpilePackages: [
    "@astralsync/astro-core",
    "@astralsync/numero-core",
    "@astralsync/hebrew-core",
  ],
  // geo-tz reads its timezone boundary data from node_modules at runtime and
  // must not be bundled.
  serverExternalPackages: ["geo-tz", "@prisma/client"],
  // lib/content.ts reads content/ from process.cwd() at runtime; without this,
  // standalone/containerized builds ship with an empty content library.
  outputFileTracingIncludes: {
    "/*": ["content/**/*"],
    // app/sw.js/route.ts reads the worker source from disk at runtime.
    "/sw.js": ["lib/pwa/sw.src.js"],
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
