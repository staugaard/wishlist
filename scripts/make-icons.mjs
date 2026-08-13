// One-shot icon generator: renders the H𝑖 wordmark stamp on card paper with
// the app's real fonts and screenshots it at each size. Run with:
//   node scripts/make-icons.mjs
// Assets are committed; rerun only if the identity changes.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const fontData = (buf) => `data:font/woff2;base64,${buf.toString("base64")}`;
const newsreader = fontData(
  await readFile("public/fonts/newsreader-var.woff2"),
);
const newsreaderItalic = fontData(
  await readFile("public/fonts/newsreader-italic.woff2"),
);

// padding: fraction of the tile the mark is inset by (maskable needs the
// 80% safe zone; regular icons can breathe less).
const tile = (size, padding) => `<!DOCTYPE html>
<style>
@font-face { font-family: N; font-style: normal; font-weight: 200 500; src: url(${newsreader}) format("woff2"); }
@font-face { font-family: N; font-style: italic; font-weight: 300; src: url(${newsreaderItalic}) format("woff2"); }
* { margin: 0; }
body { width: ${size}px; height: ${size}px; background: #f4eee2; display: grid; place-items: center; }
.mark { font-family: N, Georgia, serif; font-weight: 300; font-size: ${Math.round(size * (1 - padding * 2) * 0.62)}px; color: #33291d; letter-spacing: -0.01em; }
.mark em { font-style: italic; font-weight: 300; color: #8c4028; }
</style>
<body><div class="mark">H<em>i</em></div></body>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await mkdir("public/icons", { recursive: true });

const targets = [
  ["icon-192.png", 192, 0.08],
  ["icon-512.png", 512, 0.08],
  ["icon-maskable-512.png", 512, 0.18],
  ["apple-touch-icon.png", 180, 0.1],
];
for (const [name, size, padding] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(tile(size, padding));
  await page.evaluate(() => document.fonts.ready);
  const shot = await page.screenshot({ type: "png" });
  await writeFile(`public/icons/${name}`, shot);
  console.log(`public/icons/${name} (${size}px)`);
}
await browser.close();
