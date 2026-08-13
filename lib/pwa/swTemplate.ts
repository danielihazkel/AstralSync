export const BUILD_ID_PLACEHOLDER = "__BUILD_ID__";

/**
 * Stamp the service-worker source with the running build's id so every deploy
 * is a new worker VERSION (and activate() drops the previous caches). The id
 * lands inside a JS string literal, so anything outside [A-Za-z0-9_-] is
 * stripped rather than trusted.
 */
export function renderServiceWorker(src: string, buildId: string): string {
  const safe = buildId.replace(/[^A-Za-z0-9_-]/g, "");
  return src.replaceAll(BUILD_ID_PLACEHOLDER, safe || "unknown");
}
