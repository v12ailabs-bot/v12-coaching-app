// One-off generator for the V12 PWA/home-screen icon set, run manually via
// `node scripts/generate-app-icons.mjs` whenever src/assets/v12-logo-source.jpg
// changes. Source is the approved orange-metallic V12 mark (808x807, near-
// black background that already matches the app's own S.bg #0B0B0D almost
// exactly — sampled corner pixels are within a few RGB values of it).
//
// The mark's bounding box in the source fills ~81% of the frame's width but
// only ~58% of its height (it's a wide mark on a square canvas) -- too tight
// a margin for Android's maskable-icon safe zone (content must fit inside an
// 80%-diameter centered circle) and for iOS's own corner-rounding not to
// clip it. Rather than crop (which would require finding the mark's exact
// silhouette) or stretch (forbidden -- must preserve proportions), the whole
// source frame is scaled down uniformly and centered on a larger canvas of
// the same background color, adding a uniform safe margin without touching
// the mark's shape at all.
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src/assets/v12-logo-source.jpg", import.meta.url));
const BG = { r: 11, g: 11, b: 13 }; // #0B0B0D, matches theme.jsx S.bg
const CANVAS = 1024;
const SCALE = 0.82; // -> ~16-17% margin on the tightest (horizontal) axis

async function buildPaddedSquare() {
  const side = Math.round(CANVAS * SCALE);
  const shrunk = await sharp(SRC).resize(side, side, { fit: "cover" }).toBuffer();
  // Materialize to a buffer immediately -- chaining .clone().resize() on a
  // Sharp instance with a still-pending composite() resizes the base canvas
  // BEFORE compositing (not after), which breaks once the target is smaller
  // than the shrunk overlay. Baking it to a fixed 1024x1024 PNG first avoids
  // that ordering entirely; every downstream resize starts from a flat image.
  return sharp({ create: { width: CANVAS, height: CANVAS, channels: 3, background: BG } })
    .composite([{ input: shrunk, gravity: "center" }])
    .png()
    .toBuffer();
}

const outDir = fileURLToPath(new URL("../public/", import.meta.url));
mkdirSync(outDir + "icons", { recursive: true });

const base = await buildPaddedSquare();
const targets = [
  ["icons/icon-192.png", 192],
  ["icons/icon-512.png", 512],
  ["icons/maskable-icon-512.png", 512], // same safe-padded art; already within the maskable safe zone
  ["apple-touch-icon.png", 180],
  ["favicon-32.png", 32],
  ["favicon-16.png", 16],
];
for (const [rel, size] of targets) {
  await sharp(base).resize(size, size).toFile(outDir + rel);
  console.log(`wrote public/${rel} (${size}x${size})`);
}
