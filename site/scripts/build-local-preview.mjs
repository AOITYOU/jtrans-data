// Build a single-file local preview without npm/esbuild/Cloudflare.
// It intentionally uses the unminified production CSS/JS so the preview stays
// easy to inspect while matching the production source behavior.
import { readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";

const mimeByExt = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/vnd.microsoft.icon",
};

async function dataUri(path) {
  const raw = await readFile(path);
  const mime = mimeByExt[extname(path).toLowerCase()] || "application/octet-stream";
  return `data:${mime};base64,${raw.toString("base64")}`;
}

const [sourceHtml, css, appJs, refreshCss, refreshJs, previewData] = await Promise.all([
  readFile("src/index.html", "utf8"),
  readFile("src/assets/site.css", "utf8"),
  readFile("src/assets/app.js", "utf8"),
  readFile("src/assets/design-refresh.css", "utf8"),
  readFile("src/assets/design-refresh.js", "utf8"),
  readFile("scripts/preview-data.json", "utf8"),
]);

const images = {
  __ASSET_TRANSLATION_BEFORE__: await dataUri("static/translation-before.webp"),
  __ASSET_TRANSLATION_AFTER__: await dataUri("static/translation-after.webp"),
  __ASSET_TRANSLATION_SAMPLE_06_BEFORE__: await dataUri("static/translation-sample-06-before.webp"),
  __ASSET_TRANSLATION_SAMPLE_06_AFTER__: await dataUri("static/translation-sample-06-after.webp"),
  __ASSET_TRANSLATION_SAMPLE_07_BEFORE__: await dataUri("static/translation-sample-07-before.webp"),
  __ASSET_TRANSLATION_SAMPLE_07_AFTER__: await dataUri("static/translation-sample-07-after.webp"),
  __ASSET_JTRANS_CREST__: await dataUri("static/jtrans-crest.png"),
};

const logo = await dataUri("static/logo.png");
const favicon = await dataUri("static/favicon.ico");
const favicon16 = await dataUri("static/favicon-16x16.png");
const favicon32 = await dataUri("static/favicon-32x32.png");
const appleTouch = await dataUri("static/apple-touch-icon.png");

let html = sourceHtml;
html = html.replace(
  '<link rel="stylesheet" href="__ASSET_SITE_CSS__" />',
  `<style>\n${css}\n</style>`,
);
html = html.replace(
  '<link rel="stylesheet" href="__ASSET_DESIGN_REFRESH_CSS__" />',
  `<style>\n${refreshCss}\n</style>`,
);
html = html.replace('<script src="__ASSET_APP_JS__" defer></script>', "");
html = html.replace('<script src="__ASSET_DESIGN_REFRESH_JS__" defer></script>', "");
for (const [placeholder, uri] of Object.entries(images)) {
  html = html.replaceAll(placeholder, uri);
}
html = html
  .replaceAll('src="logo.png"', `src="${logo}"`)
  .replaceAll('href="favicon.ico?v=2"', `href="${favicon}"`)
  .replaceAll('href="favicon-32x32.png?v=2"', `href="${favicon32}"`)
  .replaceAll('href="favicon-16x16.png?v=2"', `href="${favicon16}"`)
  .replaceAll('href="apple-touch-icon.png?v=2"', `href="${appleTouch}"`);

const parsedPreview = JSON.parse(previewData);
const previewBootstrap = `\n<script>\nwindow.__JTRANS_PREVIEW_TOTAL_MODS__ = 2894;\nwindow.__JTRANS_PREVIEW_DATA__ = ${JSON.stringify(parsedPreview)};\n</script>\n`;
const appScript = `<script>\n${appJs}\n</script>\n<script>\n${refreshJs}\n</script>\n`;
html = html.replace("</body>", `${previewBootstrap}${appScript}</body>`);

if (html.includes("__ASSET_")) {
  throw new Error("local-preview.html に未置換の __ASSET_* プレースホルダがあります");
}
if (!html.includes("window.__JTRANS_PREVIEW_DATA__")) {
  throw new Error("preview data bootstrap missing");
}

await writeFile("local-preview.html", html, "utf8");
console.log(`local-preview.html generated (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MiB)`);
