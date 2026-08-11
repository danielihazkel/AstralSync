import type { MetadataRoute } from "next";

// Must match the --bg token in app/globals.css (asserted by manifest.test.ts).
export const THEME_COLOR = "#0e0e14";

export function buildManifest(): MetadataRoute.Manifest {
  return {
    name: "AstralSync",
    short_name: "AstralSync",
    description:
      "Natal charts and numerology — computed once, stored forever, fully offline.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
