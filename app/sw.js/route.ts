import { readFileSync } from "node:fs";
import path from "node:path";
import { renderServiceWorker } from "@/lib/pwa/swTemplate";

/**
 * Serves the service worker with its cache VERSION stamped to the Next build
 * id (lib/pwa/sw.src.js is the source). A route handler rather than a static
 * public/ file so the version tracks every build automatically — a forgotten
 * manual bump would otherwise serve returning users stale cached HTML.
 */

function resolveBuildId(): string {
  if (process.env.NODE_ENV !== "production") return "dev";
  try {
    return readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    // Build id is unreadable in some standalone layouts; a fixed fallback
    // still beats failing the request (updates then rely on byte-diffing).
    return "unknown";
  }
}

// The source and build id are fixed for the process lifetime.
let rendered: string | null = null;

export function GET() {
  if (rendered === null) {
    const src = readFileSync(
      path.join(process.cwd(), "lib", "pwa", "sw.src.js"),
      "utf8",
    );
    rendered = renderServiceWorker(src, resolveBuildId());
  }
  // next.config.ts pins the same headers on /sw.js; set them here too so the
  // response is correct even if the config route matching ever changes.
  return new Response(rendered, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'",
    },
  });
}
