// One-time icon generation: rasterizes app/icon.svg into the committed PNGs
// referenced by lib/pwa/manifest.ts. Rerun only when the SVG changes:
//   npm run icons:generate
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const svg = await readFile(path.join(root, "app", "icon.svg"));
const outDir = path.join(root, "public", "icons");
await mkdir(outDir, { recursive: true });

const render = (size) => sharp(svg, { density: 300 }).resize(size, size).png();

for (const size of [192, 512]) {
  await writeFile(
    path.join(outDir, `icon-${size}.png`),
    await render(size).toBuffer()
  );
}

// Maskable: star at ~80% centered on a full-bleed background so launcher
// masks (circle, squircle) never clip the mark.
for (const size of [192, 512]) {
  const inner = Math.round(size * 0.8);
  const icon = await render(inner).toBuffer();
  const composed = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: "#0e0e14",
    },
  })
    .composite([{ input: icon, gravity: "center" }])
    .png()
    .toBuffer();
  await writeFile(path.join(outDir, `icon-maskable-${size}.png`), composed);
}

// Apple touch icon: opaque (iOS turns transparency black) 180×180.
await writeFile(
  path.join(root, "app", "apple-icon.png"),
  await render(180).flatten({ background: "#0e0e14" }).toBuffer()
);

console.log("Icons written to public/icons/ and app/apple-icon.png");
