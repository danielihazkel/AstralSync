/**
 * Client-only helpers for downloading a rendered chart wheel as a standalone
 * SVG or PNG file. The live SVG leans on CSS Modules and custom properties;
 * a saved file has neither, so computed styles are copied to inline
 * presentation attributes on a clone before serializing.
 */

/** Presentation properties worth carrying into the standalone file. */
const STYLE_ALLOWLIST = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
  "paint-order",
] as const;

/** Safe cross-platform file name; falls back to "chart" if nothing survives. */
export function sanitizeFileName(base: string): string {
  const cleaned = base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return cleaned || "chart";
}

/**
 * Serialize the SVG with computed styles inlined, interaction-only elements
 * stripped, and an opaque page-colored background rect prepended.
 */
export function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;

  // Parallel walk: querySelectorAll returns document order, identical for an
  // unmodified deep clone — inline styles first, prune afterwards.
  const sourceNodes = [svg, ...svg.querySelectorAll("*")];
  const cloneNodes = [clone, ...clone.querySelectorAll("*")];
  sourceNodes.forEach((node, i) => {
    if (!(node instanceof Element)) return;
    const computed = window.getComputedStyle(node);
    const target = cloneNodes[i] as Element;
    for (const prop of STYLE_ALLOWLIST) {
      const value = computed.getPropertyValue(prop);
      if (value && value !== "none" && value !== "normal") {
        (target as SVGElement).style.setProperty(prop, value);
      }
    }
    target.removeAttribute("class");
  });

  // Invisible hover/tap hit targets serve no purpose in a file.
  for (const hit of clone.querySelectorAll('[stroke="transparent"]')) {
    hit.remove();
  }

  const viewBox = svg.viewBox.baseVal;
  const bg = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue("--bg")
    .trim();
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", String(viewBox.x));
  rect.setAttribute("y", String(viewBox.y));
  rect.setAttribute("width", String(viewBox.width));
  rect.setAttribute("height", String(viewBox.height));
  rect.setAttribute("fill", bg || "#0e0e14");
  clone.insertBefore(rect, clone.firstChild);

  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(viewBox.width));
  clone.setAttribute("height", String(viewBox.height));

  return new XMLSerializer().serializeToString(clone);
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

export function downloadSvg(svg: SVGSVGElement, baseName: string): void {
  const blob = new Blob([serializeSvg(svg)], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  try {
    triggerDownload(url, `${sanitizeFileName(baseName)}.svg`);
  } finally {
    // Delay revocation so the click's navigation can start.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/** Rasterize the wheel to a PNG Blob — shared by download and Web Share. */
export function pngBlob(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([serializeSvg(svg)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const viewBox = svg.viewBox.baseVal;
      const canvas = document.createElement("canvas");
      canvas.width = viewBox.width * scale;
      canvas.height = viewBox.height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas 2d context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((png) => {
        if (!png) {
          reject(new Error("PNG encoding failed"));
          return;
        }
        resolve(png);
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("could not rasterize the SVG"));
    };
    img.src = url;
  });
}

export async function downloadPng(
  svg: SVGSVGElement,
  baseName: string,
  scale = 2,
): Promise<void> {
  const png = await pngBlob(svg, scale);
  const pngUrl = URL.createObjectURL(png);
  triggerDownload(pngUrl, `${sanitizeFileName(baseName)}.png`);
  setTimeout(() => URL.revokeObjectURL(pngUrl), 10_000);
}
