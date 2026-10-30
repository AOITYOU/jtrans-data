// jtrans 公式サイトのビルド。
//
// 方針: source -> dist の一方向ビルド。src/ と static/ は一切書き換えない。
// 生成物は dist/ にだけ出す（.gitignore 済み）。
//
//   src/index.html        __ASSET_*__ を埋めて dist/index.html へ
//   src/assets/*.{js,css} minify + 内容ハッシュ付きで dist/assets/ へ
//   static/*              そのまま dist/ へコピー
//   src/asset-manifest.json  worker が import するハッシュ表
//   release-data          GitHub の jtrans-release-data.json を取得し、
//                         /api・sitemap・ホーム・MOD/環境/ガイドの全ページを
//                         dist/ に静的生成（v7。Worker無料プランのCPU上限対策）
//
// release-data の読み込み先（上から優先）:
//   1. 環境変数 JTRANS_DATA_FILE
//   2. ../jtrans-release-data.json（jtrans-data リポジトリの site/ に置いたとき。
//      Cloudflare Workers Builds は push されたそのコミットのJSONでビルドする）
//   3. GitHub Raw（手元PCで単体フォルダから npm run deploy したとき）
//
// /assets/* は _headers で1年 immutable 配信するため、内容が変わったら
// 必ずファイル名も変わる必要がある。手作業だと変え忘れて最大1年間
// 古いファイルが配られるので、ここで機械的にやる。

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname } from "node:path";
import * as esbuild from "esbuild";

const SOURCES = {
  palette: "src/assets/palette.css",
  app: "src/assets/app.js",
  site: "src/assets/site.css",
  seo: "src/assets/seo-pages.css",
  designRefreshCss: "src/assets/design-refresh.css",
  designRefreshJs: "src/assets/design-refresh.js",
  motionCss: "src/assets/motion.css",
  motionJs: "src/assets/motion.js",
};

const IMAGE_SOURCES = {
  translationBefore: "static/translation-before.webp",
  translationAfter: "static/translation-after.webp",
  translationSample06Before: "static/translation-sample-06-before.webp",
  translationSample06After: "static/translation-sample-06-after.webp",
  translationSample07Before: "static/translation-sample-07-before.webp",
  translationSample07After: "static/translation-sample-07-after.webp",
  jtransCrest: "static/jtrans-crest.png",
};

const IMAGE_PLACEHOLDERS = {
  translationBefore: "__ASSET_TRANSLATION_BEFORE__",
  translationAfter: "__ASSET_TRANSLATION_AFTER__",
  translationSample06Before: "__ASSET_TRANSLATION_SAMPLE_06_BEFORE__",
  translationSample06After: "__ASSET_TRANSLATION_SAMPLE_06_AFTER__",
  translationSample07Before: "__ASSET_TRANSLATION_SAMPLE_07_BEFORE__",
  translationSample07After: "__ASSET_TRANSLATION_SAMPLE_07_AFTER__",
  jtransCrest: "__ASSET_JTRANS_CREST__",
};

const hash = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 10);
const kb = (n) => (n / 1024).toFixed(1) + "KB";

await rm("dist", { recursive: true, force: true });
await mkdir("dist/assets", { recursive: true });
await cp("static", "dist", { recursive: true });
// 比較画像は下でfingerprint版を /assets/ に生成するため、
// static/ からコピーされた非ハッシュ版は公開物から除く。二重アップロードと
// 30日キャッシュされた旧URLへの偶発参照を避ける。
for (const source of Object.values(IMAGE_SOURCES)) {
  await rm(`dist/${basename(source)}`, { force: true });
}

const manifest = {};
for (const [key, source] of Object.entries(SOURCES)) {
  const ext = extname(source);
  const raw = await readFile(source);
  const built = await esbuild.build({
    entryPoints: [source],
    minify: true,
    write: false,
    legalComments: "none",
    loader: { ".css": "css", ".js": "js" },
    target: ["es2022", "chrome111", "firefox111", "safari16"],
  });
  const minified = Buffer.from(built.outputFiles[0].contents);
  const name = `${basename(source, ext)}.${hash(minified)}${ext}`;
  await writeFile(`dist/assets/${name}`, minified);
  manifest[key] = `/assets/${name}`;
  console.log(`  ${source.padEnd(26)} ${kb(raw.length).padStart(8)} -> ${kb(minified.length).padStart(8)}  ${name}`);
}

// 比較スクリーンショットも内容ハッシュ付きで /assets/ へ出す。
// 同名の画像を差し替えても30日キャッシュの旧画像が残らない。
for (const [key, source] of Object.entries(IMAGE_SOURCES)) {
  const ext = extname(source);
  const raw = await readFile(source);
  const name = `${basename(source, ext)}.${hash(raw)}${ext}`;
  await writeFile(`dist/assets/${name}`, raw);
  manifest[key] = `/assets/${name}`;
  console.log(`  ${source.padEnd(26)} ${kb(raw.length).padStart(8)} -> ${name}`);
}

// worker.js がハッシュを直書きしなくて済むようにする。
// dist/ ではなく src/ に置くのは、公開アセットとして配信させないため。
// JSON ではなく JS モジュールにしているのは、素の Node でも import 属性
// (with { type: "json" }) なしにそのまま読めるようにするため。
await writeFile(
  "src/asset-manifest.js",
  "// scripts/build.mjs が生成します。手で編集しないでください。\n" +
    `export default ${JSON.stringify(manifest, null, 2)};\n`,
);

let html = (await readFile("src/index.html", "utf8"))
  .replaceAll("__ASSET_PALETTE_CSS__", manifest.palette)
  .replaceAll("__ASSET_SITE_CSS__", manifest.site)
  .replaceAll("__ASSET_APP_JS__", manifest.app)
  .replaceAll("__ASSET_DESIGN_REFRESH_CSS__", manifest.designRefreshCss)
  .replaceAll("__ASSET_DESIGN_REFRESH_JS__", manifest.designRefreshJs)
  .replaceAll("__ASSET_MOTION_CSS__", manifest.motionCss)
  .replaceAll("__ASSET_MOTION_JS__", manifest.motionJs);
for (const [key, placeholder] of Object.entries(IMAGE_PLACEHOLDERS)) {
  html = html.replaceAll(placeholder, manifest[key]);
}
if (html.includes("__ASSET_")) {
  throw new Error("index.html に未置換のプレースホルダが残っています");
}
await writeFile("dist/index.html", html);
console.log(`  src/index.html             -> dist/index.html (${kb(Buffer.byteLength(html))})`);

// ---- v7: release-data からの静的生成 ----
const { DATA_URL, prerenderSite, setAssetManifest } = await import("../src/render.mjs");
setAssetManifest(manifest);

async function loadReleaseDataText() {
  const localFile = process.env.JTRANS_DATA_FILE ||
    (existsSync("../jtrans-release-data.json") ? "../jtrans-release-data.json" : "");
  if (localFile) {
    console.log(`\nrelease-data: ${localFile}（ローカルファイル）`);
    return readFile(localFile, "utf8");
  }
  console.log(`\nrelease-data: ${DATA_URL}`);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(DATA_URL, {
        headers: { Accept: "application/json", "User-Agent": "jtrans-site-build/7", "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (error) {
      lastError = error;
      console.warn(`  取得失敗 (${attempt}/3): ${error.message}`);
    }
  }
  throw new Error(`release-data を取得できませんでした: ${lastError?.message}`);
}

const payload = JSON.parse(await loadReleaseDataText());
const { files, counts } = prerenderSite(payload, html);
let totalBytes = 0;
const madeDirs = new Set();
for (const [relPath, body] of files) {
  const target = `dist/${relPath}`;
  const dir = dirname(target);
  if (!madeDirs.has(dir)) {
    await mkdir(dir, { recursive: true });
    madeDirs.add(dir);
  }
  await writeFile(target, body);
  totalBytes += Buffer.byteLength(body);
}
console.log(
  `  静的生成: ${files.size} ファイル / ${(totalBytes / 1024 / 1024).toFixed(1)}MB` +
    `（MOD ${counts.mods}・環境 ${counts.landings}・リリース ${payload.release?.version ?? "?"} ${payload.release?.date ?? ""}）`,
);
console.log("\nビルド完了:", JSON.stringify(manifest, null, 2));
