/**
 * Inline, render-blocking theme bootstrap: resolves the stored preference
 * and stamps <html data-theme> before first paint so a light-theme user
 * never sees a dark flash. Must stay in sync with lib/themeSettings.ts
 * (same key, same default, same resolution rule).
 */

const BOOTSTRAP = `(function () {
  var t = "dark";
  try { t = localStorage.getItem("settings.theme") || "dark"; } catch (e) {}
  if (t !== "light" && t !== "dark") {
    t = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  document.documentElement.dataset.theme = t;
})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: BOOTSTRAP }} />;
}
