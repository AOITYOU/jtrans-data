/**
 * All Japanese Translate / jtrans official site — page renderer (v7 / prerender)
 *
 * v7: Workers無料プランのCPU上限(10ms/リクエスト)を超えて /api と各ページが
 * exceededCpu で落ちたため、release-data の整形とページ生成はすべて
 * `npm run build` 時（手元PC）に行い、dist/ へ静的ファイルとして書き出す。
 * このモジュールは scripts/build.mjs からだけ import される。
 * 実行時の Worker（src/worker.js）はここを import しない。
 */

// F1: /assets/ のハッシュ付きファイル名はビルドが決める。ここに直書きすると
// CSSを直したときに変え忘れて、1年 immutable の古いファイルが配られる。
// v7: 素の Node（type 指定なし）でも読めるよう import せず、build.mjs が
// setAssetManifest() で渡す。

export const DATA_URL =
  "https://raw.githubusercontent.com/AOITYOU/jtrans-data/refs/heads/main/jtrans-release-data.json";

const RELEASE_DATA_TTL = 300;
const PAGE_CACHE_TTL = 1800;
const HOME_SSR_ROWS = 50;
let SEO_PAGE_CSS_HREF = "";
let PALETTE_CSS_HREF = "";
let CREST_HREF = "";
let ASSETS = {};
export function setAssetManifest(manifest) {
  ASSETS = manifest;
  SEO_PAGE_CSS_HREF = manifest.seo;
  PALETTE_CSS_HREF = manifest.palette;
  CREST_HREF = manifest.jtransMon;
  if (!SEO_PAGE_CSS_HREF || !PALETTE_CSS_HREF || !CREST_HREF) {
    throw new Error("asset manifest is missing seo / palette / jtransMon");
  }
}
const FONT_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700&amp;family=Noto+Sans+JP:wght@400;500;700&amp;display=swap">`;
const NAME_COLLATOR = new Intl.Collator("ja", { numeric: true });

// A1: トップのSSR行はクライアント(app.js)の compareMods と同じ順序で出す。
// 以前は JSON の配列順の先頭50件だったため、ハイドレーション後に別の50件へ
// 丸ごと差し替わっていた（実測で一致は24/50）。
const HOME_ALPHABET = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "漢"];
const HOME_INITIAL_ORDER = HOME_ALPHABET.reduce((map, key, index) => {
  map[key] = index;
  return map;
}, Object.create(null));
const EN_COLLATOR = new Intl.Collator("en", { sensitivity: "base", numeric: true });
const HAN_COLLATOR = new Intl.Collator("zh-Hans-u-co-pinyin", { sensitivity: "base", numeric: true });

// v1.8.0 keeps the long-standing 1.20.1 / 1.21.1 directory in `mods[]`, while
// the newly supported environments live under release.top500Expansion.  The
// public site needs one normalized view so its filters, SSR pages, sitemap and
// API all agree without changing the signed release JAR or duplicating records
// in the release package itself.
const EXPANSION_VERSION_DEFINITIONS = Object.freeze([
  { key: "v1122", label: "1.12.2", coverage: "partial" },
  { key: "v1165", label: "1.16.5", coverage: "partial" },
  { key: "v1182", label: "1.18.2", coverage: "partial" },
  { key: "v1192", label: "1.19.2", coverage: "partial" },
  { key: "v20", label: "1.20.1" },
  { key: "v21", label: "1.21.1" },
  { key: "v12111", label: "1.21.11", coverage: "partial" },
  { key: "v263", label: "26.3", coverage: "partial" },
]);
const VERSION_KEY_BY_LABEL = new Map(
  EXPANSION_VERSION_DEFINITIONS.map((version) => [version.label, version.key]),
);
const LOADER_CODE_BY_SLUG = Object.freeze({
  forge: "F",
  neoforge: "N",
  fabric: "FA",
  quilt: "Q",
});

const SECURITY_HEADERS = Object.freeze({
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "x-frame-options": "SAMEORIGIN",
});


function uniqueSiteModId(rawSlug, projectId, usedIds) {
  const slug = String(rawSlug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const fallback = `modrinth-${String(projectId || "project").toLowerCase()}`;
  let candidate = slug || fallback;
  if (usedIds.has(candidate)) candidate = fallback;
  let suffix = 2;
  const base = candidate;
  while (usedIds.has(candidate)) candidate = `${base}-${suffix++}`;
  usedIds.add(candidate);
  return candidate;
}

export function normalizeReleaseData(payload) {
  const expansion = payload?.release?.top500Expansion;
  const projects = Array.isArray(expansion?.projects) ? expansion.projects : [];
  if (!projects.length) return payload;

  const originalMods = Array.isArray(payload.mods) ? payload.mods : [];
  const mods = originalMods.slice();
  const usedIds = new Set(mods.map((mod) => String(mod?.id || "")).filter(Boolean));
  const byModrinthProject = new Map();
  for (const mod of mods) {
    const projectId = mod?.source?.modrinth?.projectId;
    if (projectId != null && String(projectId)) {
      byModrinthProject.set(String(projectId), mod);
    }
  }

  let expansionOnlyProjectCount = 0;
  for (const project of projects) {
    if (!project || !Array.isArray(project.profiles) || !project.profiles.length) continue;
    const projectId = String(project.projectId || "").trim();
    if (!projectId) continue;

    let mod = byModrinthProject.get(projectId);
    if (!mod) {
      mod = {
        id: uniqueSiteModId(project.slug, projectId, usedIds),
        name: String(project.title || project.slug || projectId),
        addedIn: String(payload.release?.version || "1.8.0"),
        translationMode: {},
        translationKeysByVersion: {},
        source: { modrinth: { projectId } },
        notes: [
          "v1.8.0の拡張プロファイルから追加。環境ごとの収録項目合計はMinecraftバージョン別ページに掲載しています。",
        ],
      };
      mods.push(mod);
      byModrinthProject.set(projectId, mod);
      expansionOnlyProjectCount++;
    }

    if (!mod.translationMode || typeof mod.translationMode !== "object") {
      mod.translationMode = {};
    }
    if (!mod.translationKeysByVersion || typeof mod.translationKeysByVersion !== "object") {
      mod.translationKeysByVersion = {};
    }
    for (const profile of project.profiles) {
      const versionKey = VERSION_KEY_BY_LABEL.get(String(profile?.minecraft || ""));
      const loaderCode = LOADER_CODE_BY_SLUG[String(profile?.loader || "").toLowerCase()];
      if (!versionKey || !loaderCode) continue;

      const codes = Array.isArray(mod[versionKey]) ? mod[versionKey] : [];
      if (!codes.includes(loaderCode)) codes.push(loaderCode);
      mod[versionKey] = codes;

      const modes = Array.isArray(mod.translationMode[versionKey])
        ? mod.translationMode[versionKey]
        : [];
      if (!modes.includes("lang")) modes.push("lang");
      mod.translationMode[versionKey] = modes;

    }
  }

  const usedVersionLabels = new Set();
  for (const mod of mods) {
    for (const version of EXPANSION_VERSION_DEFINITIONS) {
      if (Array.isArray(mod?.[version.key]) && mod[version.key].length) {
        usedVersionLabels.add(version.label);
      }
    }
  }
  payload.versions = EXPANSION_VERSION_DEFINITIONS
    .filter((version) => usedVersionLabels.has(version.label))
    .map((version) => ({ ...version }));
  payload.mods = mods;
  payload.siteStats = {
    primaryModCount: Number(payload.stats?.modCount) || originalMods.length,
    directoryModCount: mods.length,
    expansionProjectCount: Number(expansion.emittedProjects) || projects.length,
    expansionOnlyProjectCount,
    profileCount: Number(expansion.profileCount) || 0,
    profileKeyOccurrences: Number(expansion.installedProfileKeyOccurrences) || 0,
    languageFiles: Number(expansion.languageFiles) || 0,
  };
  return payload;
}

// 索引・並び順だけ装飾的な接頭辞を無視する（app.js の indexName と同一）。
function indexName(name) {
  const trimmed = String(name).trim();
  const withoutBracket = trimmed.replace(/^(?:\[[^\]]*\]\s*)+/, "");
  const withoutDecorative = withoutBracket.replace(/^[\p{P}\p{S}\s]+/u, "");
  return withoutDecorative || withoutBracket || trimmed;
}

function homeSortKey(mod) {
  const sortName = indexName(mod.name);
  const first = sortName.charAt(0);
  const upper = first.toUpperCase();
  const initial = /^[A-Z]$/.test(upper)
    ? upper
    : (/\p{Script=Han}/u.test(first) ? "漢" : "#");
  return {
    mod,
    sortName,
    order: HOME_INITIAL_ORDER[initial] ?? HOME_INITIAL_ORDER["#"],
    han: initial === "漢",
  };
}

function compareHomeKeys(a, b) {
  if (a.order !== b.order) return a.order - b.order;
  return (a.han ? HAN_COLLATOR : EN_COLLATOR).compare(a.sortName, b.sortName);
}

// 全件ソートはせず、上位 limit 件だけを選ぶ。キーは buildDerivedData が
// 既存ループのついでに作った homeKeys を使う（mods を二度走査しない）。
// id / name を持たない行はキー作成時点で除外済みなので "/mods//" は出ない(A4)。
function pickHomeRows(homeKeys, limit) {
  const top = [];
  for (const entry of homeKeys) {
    if (top.length === limit && compareHomeKeys(entry, top[limit - 1]) >= 0) continue;
    let at = top.length;
    for (let i = 0; i < top.length; i++) {
      if (compareHomeKeys(entry, top[i]) < 0) { at = i; break; }
    }
    top.splice(at, 0, entry);
    if (top.length > limit) top.pop();
  }
  return top.map((entry) => entry.mod);
}

function landingKey(versionKey, loaderCode = "") {
  return `${versionKey}\u0000${loaderCode}`;
}

function versionTranslationKeys(mod, versionKey, versions, loaderCode = "") {
  if (
    loaderCode &&
    Number.isFinite(mod?.translationKeysByProfile?.[versionKey]?.[loaderCode])
  ) {
    return mod.translationKeysByProfile[versionKey][loaderCode];
  }
  if (Number.isFinite(mod?.translationKeysByVersion?.[versionKey])) {
    return mod.translationKeysByVersion[versionKey];
  }
  if (!Number.isFinite(mod?.translationKeys)) return null;

  // translationKeys は全バージョン共通の総数として記録されている行が多い。
  // 複数Minecraft版に対応するMODへ同じ値を各版の件数として複製すると、
  // 個別ページと版別集計の両方で誤認を生む。単一版対応のときだけ版別値へ流用する。
  let supportedCount = 0;
  let supportedKey = "";
  for (const version of versions || []) {
    if (!version?.key) continue;
    const codes = Array.isArray(mod?.[version.key]) ? mod[version.key] : [];
    if (!codes.length) continue;
    supportedCount++;
    supportedKey = version.key;
    if (supportedCount > 1) return null;
  }
  return supportedCount === 1 && supportedKey === versionKey ? mod.translationKeys : null;
}

export function buildDerivedData(payload) {
  const mods = Array.isArray(payload.mods) ? payload.mods : [];
  const versions = (Array.isArray(payload.versions) ? payload.versions : []).filter((version) => version?.key);
  const modsById = new Map();
  const versionByLabel = new Map();
  const modsByVersion = new Map();
  const modsByVersionLoader = new Map();
  const supportedLoadersByVersion = new Map();
  const landingStats = new Map();
  const relatedProfiles = [];
  // A1: トップの行順に使うソートキー。mods を二度走査しないよう、
  // 下の既存ループの中で1件につき1回だけ作る。
  const homeKeys = [];

  for (const version of versions) {
    versionByLabel.set(String(version.label || ""), version);
    modsByVersion.set(version.key, []);
    supportedLoadersByVersion.set(version.key, new Set());
  }

  const addStats = (key, mod, versionKey, loaderCode = "") => {
    let stats = landingStats.get(key);
    if (!stats) {
      stats = { count: 0, keyCount: 0, keyCountUnknownMods: 0, hardcodedCount: 0 };
      landingStats.set(key, stats);
    }
    stats.count++;
    const versionKeys = versionTranslationKeys(mod, versionKey, versions, loaderCode);
    if (Number.isFinite(versionKeys)) stats.keyCount += versionKeys;
    else stats.keyCountUnknownMods++;
    if (modModesForVersion(mod, versionKey).includes("hardcoded")) stats.hardcodedCount++;
  };

  for (const mod of mods) {
    if (!mod) continue;
    if (mod.id) modsById.set(String(mod.id), mod);

    const relatedName = String(mod.name || "").toLowerCase();
    relatedProfiles.push({ mod, name: relatedName });
    if (mod.id && mod.name) homeKeys.push(homeSortKey(mod));

    for (const version of versions) {
      const codes = Array.isArray(mod?.[version.key]) ? mod[version.key] : [];
      if (!codes.length) continue;
      modsByVersion.get(version.key).push(mod);
      addStats(landingKey(version.key), mod, version.key);

      for (const code of new Set(codes)) {
        supportedLoadersByVersion.get(version.key).add(code);
        const key = landingKey(version.key, code);
        let list = modsByVersionLoader.get(key);
        if (!list) {
          list = [];
          modsByVersionLoader.set(key, list);
        }
        list.push(mod);
        addStats(key, mod, version.key, code);
      }
    }
  }

  // The per-project manifest claims can overlap when files are merged.  Use the
  // post-merge installedPayloadKeys values for environment landing totals so
  // the public number exactly matches the embedded profile ZIPs.
  const versionProfileTotals = new Map();
  const resourcePacks = Array.isArray(payload?.release?.top500Expansion?.resourcePacks)
    ? payload.release.top500Expansion.resourcePacks
    : [];
  for (const pack of resourcePacks) {
    const installedKeys = Number(pack?.installedPayloadKeys);
    if (!Number.isFinite(installedKeys) || installedKeys < 0) continue;
    const labels = Array.isArray(pack.minecraft) ? pack.minecraft : [];
    const loaderSlugs = Array.isArray(pack.loaders) ? pack.loaders : [];
    for (const label of labels) {
      const versionKey = VERSION_KEY_BY_LABEL.get(String(label));
      if (!versionKey) continue;
      versionProfileTotals.set(
        versionKey,
        (versionProfileTotals.get(versionKey) || 0) + installedKeys,
      );
      for (const loaderSlug of loaderSlugs) {
        const loaderCode = LOADER_CODE_BY_SLUG[String(loaderSlug).toLowerCase()];
        if (!loaderCode) continue;
        const loaderStats = landingStats.get(landingKey(versionKey, loaderCode));
        if (loaderStats) {
          loaderStats.keyCount = installedKeys;
          loaderStats.keyCountUnknownMods = 0;
        }
      }
    }
  }
  for (const [versionKey, installedKeys] of versionProfileTotals) {
    const versionStats = landingStats.get(landingKey(versionKey));
    if (versionStats) {
      versionStats.keyCount = installedKeys;
      versionStats.keyCountUnknownMods = 0;
    }
  }

  // C1: ここで全リストをソートすると毎回 約6.3ms かかるが、使うのは
  // /minecraft/<version>/<loader>/ だけ。実際に要求されたときに一度だけ並べる。
  return {
    modsById,
    versionByLabel,
    modsByVersion,
    modsByVersionLoader,
    supportedLoadersByVersion,
    landingStats,
    relatedProfiles,
    homeKeys,
    relatedCache: new Map(),
    sortedLists: new WeakSet(),
    home: null,
    sitemap: null,
  };
}

// C1: 対象のリストを初回アクセス時だけ並べ、以後は使い回す。
function getLandingMods(derived, versionKey, loaderCode) {
  if (!derived) return [];
  const map = loaderCode ? derived.modsByVersionLoader : derived.modsByVersion;
  const key = loaderCode ? landingKey(versionKey, loaderCode) : versionKey;
  const list = map?.get(key);
  if (!list) return [];
  if (!derived.sortedLists.has(list)) {
    list.sort((a, b) => NAME_COLLATOR.compare(String(a?.name || ""), String(b?.name || "")));
    derived.sortedLists.add(list);
  }
  return list;
}

function getHomeDerived(payload, derived) {
  if (derived.home) return derived.home;
  derived.home = {
    meta: buildMeta(payload),
    rowsHTML: buildRows(payload, derived.homeKeys),
  };
  return derived.home;
}


function headOnly(response) {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function htmlResponse(html, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "content-type": "text/html; charset=UTF-8",
    "cache-control": `public, max-age=0, s-maxage=${PAGE_CACHE_TTL}`,
    "x-jtrans-worker": "1",
    "x-jtrans-ssr": "1",
    "x-jtrans-ssr-engine": "dynamic-seo-v2-indexed",
    ...SECURITY_HEADERS,
    ...extraHeaders,
  });
  return new Response(html, { status, headers });
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "content-type": "application/json; charset=UTF-8",
    "cache-control": `public, max-age=${RELEASE_DATA_TTL}, s-maxage=${RELEASE_DATA_TTL}`,
    "x-jtrans-worker": "1",
    ...SECURITY_HEADERS,
    ...extraHeaders,
  });
  return new Response(JSON.stringify(payload), { status, headers });
}

function dynamicUnavailable(label, stage) {
  const html = renderShell({
    title: `${label} | jtrans`,
    description: "jtransの最新対応データを取得できませんでした。",
    canonical: "https://jtrans.aoiserver.com/",
    robots: "noindex,nofollow",
    body: `<main class="page"><div class="panel"><h1>${escapeHTML(label)}</h1><p class="lead">最新の対応データを取得できませんでした。時間を置いて再読み込みしてください。</p><p class="muted">stage: ${escapeHTML(stage || "unknown")}</p><a class="button" href="/">トップへ戻る</a></div></main>`,
  });
  return htmlResponse(html, 503, { "cache-control": "no-store", "retry-after": "300" });
}

function notFoundPage(message, url) {
  const html = renderShell({
    title: `404 | jtrans`,
    description: message,
    canonical: null,
    robots: "noindex,follow",
    body: `<main class="page"><div class="panel"><h1>${escapeHTML(message)}</h1><p class="lead">お探しのページは移動したか、削除された可能性があります。</p><a class="button" href="/#supportedMods">対応MOD一覧へ</a></div></main>`,
  });
  return htmlResponse(html, 404, { "cache-control": "public, max-age=60" });
}

function safeDecodeURIComponent(value) {
  try { return decodeURIComponent(value); } catch (_) { return value; }
}

function safeExternalURL(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch (_) {
    return "";
  }
}

function applySecurityHeaders(headers) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
}

function isSSRPage(pathname) {
  return pathname === "/" || pathname === "/index.html";
}

function debugHeaders(stage) {
  return {
    "content-type": "text/plain; charset=UTF-8",
    "cache-control": "no-store",
    "x-jtrans-worker": "1",
    "x-jtrans-ssr": "0",
    "x-jtrans-ssr-stage": stage,
    ...SECURITY_HEADERS,
  };
}

function cloneWithDebug(response, stage) {
  const headers = new Headers(response.headers);
  headers.set("x-jtrans-worker", "1");
  headers.set("x-jtrans-ssr", "0");
  headers.set("x-jtrans-ssr-stage", stage);
  applySecurityHeaders(headers);
  headers.delete("content-length");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function htmlFallback(assetResponse, html, stage) {
  const headers = new Headers(assetResponse.headers);
  headers.set("content-type", "text/html; charset=UTF-8");
  headers.set("cache-control", "no-store");
  headers.set("x-jtrans-worker", "1");
  headers.set("x-jtrans-ssr", "0");
  headers.set("x-jtrans-ssr-stage", stage);
  applySecurityHeaders(headers);
  headers.delete("content-length");
  return new Response(html, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers,
  });
}

function applyHomeSSR(html, replacements) {
  const startRe = /<([A-Za-z][\w:-]*)\b[^>]*\bid=(["'])(tbody|statVersion|statCount|statNewItem|statKeyCount|statPlatforms|statUpdated|ldJson)\2[^>]*>/gi;
  const chunks = [];
  const replaced = new Set();
  let cursor = 0;
  let match;

  while ((match = startRe.exec(html))) {
    if (match.index < cursor) continue;
    const id = match[3];
    const replacement = replacements[id];
    if (!replacement) continue;

    const close = findElementClose(html, match[1], startRe.lastIndex);
    if (!close) continue;

    let startTag = match[0];
    const sourceInner = html.slice(startRe.lastIndex, close.start);
    let inner = sourceInner;

    if (replacement.kind === "text") {
      inner = escapeHTML(replacement.value);
    } else if (replacement.kind === "html") {
      inner = String(replacement.value ?? "");
    } else if (replacement.kind === "time") {
      inner = escapeHTML(replacement.value);
      startTag = setTagAttribute(startTag, "datetime", replacement.datetime || "");
    } else if (replacement.kind === "structured-data") {
      inner = updateStructuredDataInner(sourceInner, replacement.meta);
    }

    chunks.push(html.slice(cursor, match.index), startTag, inner, close.tag);
    cursor = close.end;
    startRe.lastIndex = cursor;
    replaced.add(id);
  }

  chunks.push(html.slice(cursor));
  return { html: chunks.join(""), replaced };
}

function findElementClose(html, tagName, fromIndex) {
  const tagRe = new RegExp(`<\\/?${escapeRegExp(tagName)}\\b[^>]*>`, "gi");
  tagRe.lastIndex = fromIndex;
  let depth = 1;
  let match;
  while ((match = tagRe.exec(html))) {
    const token = match[0];
    if (/^<\s*\//.test(token)) {
      depth--;
      if (depth === 0) {
        return { start: match.index, end: tagRe.lastIndex, tag: token };
      }
    } else if (!/\/\s*>$/.test(token)) {
      depth++;
    }
  }
  return null;
}

function setTagAttribute(tag, name, value) {
  const attrRe = new RegExp(`\\s+${escapeRegExp(name)}\\s*=\\s*(["'])[^"']*\\1`, "i");
  if (!value) return tag.replace(attrRe, "");
  const attr = ` ${name}="${escapeHTML(value)}"`;
  if (attrRe.test(tag)) return tag.replace(attrRe, attr);
  return tag.replace(/>$/, `${attr}>`);
}

function updateStructuredDataInner(source, meta) {
  try {
    const data = JSON.parse(source);
    if (meta.versionRaw) data.softwareVersion = meta.versionRaw;
    if (meta.dateISO) {
      data.datePublished = meta.dateISO;
      data.dateModified = meta.dateISO;
    }
    // B4: renderShell と同じく </script> を無害化する。
    return `\n${escapeScriptJSON(JSON.stringify(data, null, 2))}\n`;
  } catch (_) {
    return source;
  }
}

function buildMeta(payload) {
  const versions = Array.isArray(payload.versions) ? payload.versions : [];
  const loaders = payload.loaders || {};
  const loaderCodes = Object.keys(loaders);
  const mods = Array.isArray(payload.mods) ? payload.mods : [];
  const newlyAdded = Array.isArray(payload.newlyAdded) ? payload.newlyAdded : [];

  const versionRaw = String(payload.release?.version || "");
  const versionText = versionRaw ? `v${versionRaw}` : "-";
  const dateISO = String(payload.release?.date || "");
  const dateText = formatDate(dateISO);
  const modCount =
    payload.siteStats && Number.isFinite(payload.siteStats.directoryModCount)
      ? payload.siteStats.directoryModCount
      : payload.stats && Number.isFinite(payload.stats.modCount)
      ? payload.stats.modCount
      : mods.length;
  const keyCount =
    payload.stats && Number.isFinite(payload.stats.translationKeyCount)
      ? payload.stats.translationKeyCount
      : null;

  const validVersions = versions
    .filter((version) => version && version.key)
    .map((version) => ({
      key: version.key,
      label: version.label || version.key,
      platformCodes: new Set(),
    }));

  for (const mod of mods) {
    if (!mod) continue;

    for (const version of validVersions) {
      const codes = mod[version.key];
      if (Array.isArray(codes) && codes.length) {
        for (const code of codes) {
          if (Object.prototype.hasOwnProperty.call(loaders, code)) {
            version.platformCodes.add(code);
          }
        }
      }
    }
  }

  const platformsText = validVersions
    .map((version) => {
      const codes = loaderCodes.filter((code) => version.platformCodes.has(code));
      if (!codes.length) return null;
      return `${version.label} — ${codes
        .map((code) => loaders[code]?.label || code)
        .join("・")}`;
    })
    .filter(Boolean)
    .join(" / ");

  return {
    versionRaw,
    versionText,
    dateISO,
    dateText,
    modCountText: formatInteger(modCount),
    // E1: 0件のKPIを一等地に出さない。空なら項目ごと消す（下の statNewItem）。
    newCount: newlyAdded.length,
    newCountText: formatInteger(newlyAdded.length),
    keyCountText: keyCount === null ? "-" : formatInteger(keyCount),
    platformsText,
  };
}

function formatInteger(value) {
  return String(Math.trunc(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  return m ? `${m[1]}.${m[2]}.${m[3]}` : "";
}

function buildRows(payload, homeKeys) {
  const versions = Array.isArray(payload.versions) ? payload.versions : [];
  const loaders = payload.loaders || {};
  const out = [];

  for (const mod of pickHomeRows(homeKeys, HOME_SSR_ROWS)) {

    const supports = [];
    for (const version of versions) {
      if (!version || !version.key) continue;
      const codes = mod[version.key];
      if (!Array.isArray(codes) || !codes.length) continue;
      const versionModes = modModesForVersion(mod, version.key);
      const versionKeys = versionTranslationKeys(mod, version.key, versions);
      const versionBits = [
        codes.map((code) => loaders[code]?.label || code).join("・"),
        versionModes.length
          ? `方式: ${versionModes.map((mode) => mode === "lang" ? "言語ファイル" : mode === "hardcoded" ? "ハードコード" : mode).join("+")}`
          : "方式: 未記録",
        Number.isFinite(versionKeys)
          ? `翻訳項目 ${formatInteger(versionKeys)}件`
          : "翻訳項目 未集計",
      ];
      supports.push(`${version.label || version.key}：${versionBits.join(" / ")}`);
    }

    const namespaces = Array.isArray(mod.namespaces) ? mod.namespaces : [];
    const sourceLabels = [];
    if (mod.source?.curseforge) sourceLabels.push("CurseForge");
    if (mod.source?.modrinth) sourceLabels.push("Modrinth");
    if (mod.source?.maven) sourceLabels.push("Maven");
    const detailBits = [];
    if (namespaces.length) detailBits.push(`namespace: ${namespaces.join(", ")}`);
    if (mod.addedIn) detailBits.push(`追加 v${mod.addedIn}`);
    if (mod.entryType) detailBits.push(`種別: ${mod.entryType === "component" ? "コンポーネント" : mod.entryType}`);
    if (sourceLabels.length) detailBits.push(`配布元: ${sourceLabels.join("+")}`);

    out.push(
      '<tr class="mod-row ssr-mod-row" role="row"><td class="name" role="cell">' +
        '<a class="ssr-mod-link" href="/mods/' + encodeURIComponent(mod.id || "") + '/">' + escapeHTML(mod.name) + '</a>' +
        (supports.length
          ? ' <span class="ssr-support">' + escapeHTML(supports.join(" / ")) + "</span>"
          : "") +
        (detailBits.length
          ? ' <span class="ssr-detail">' + escapeHTML(detailBits.join(" / ")) + "</span>"
          : "") +
        "</td></tr>",
    );
  }
  return out.join("");
}


function loaderSlug(label, code) {
  const normalized = String(label || code || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || String(code || "loader").toLowerCase();
}

function canonicalModURL(mod) {
  return `https://jtrans.aoiserver.com/mods/${encodeURIComponent(mod.id)}/`;
}

function isIndexableMod(mod) {
  if (!mod || !mod.id || !mod.name) return false;
  let signals = 0;
  if (Number.isFinite(mod.translationKeys) || (mod.translationKeysByVersion && Object.values(mod.translationKeysByVersion).some(Number.isFinite))) signals++;
  if ((Array.isArray(mod.namespaces) && mod.namespaces.length) || (mod.namespacesByVersion && Object.values(mod.namespacesByVersion).some((v) => Array.isArray(v) && v.length))) signals++;
  if (mod.translationMode && Object.values(mod.translationMode).some((v) => Array.isArray(v) && v.length)) signals++;
  if (mod.source && typeof mod.source === "object" && Object.keys(mod.source).length) signals++;
  if (Array.isArray(mod.notes) && mod.notes.length) signals++;
  // Avoid flooding the index with legacy rows that contain little more than a
  // name/version flag. They remain accessible and crawlable via noindex pages.
  return signals >= 2;
}

function getVersionEntry(payload, label) {
  return (Array.isArray(payload.versions) ? payload.versions : []).find(
    (version) => String(version?.label || "") === String(label || ""),
  );
}

function resolveMinecraftLanding(payload, versionLabel, loaderSlugValue, derived) {
  const version = derived?.versionByLabel?.get(String(versionLabel || "")) || getVersionEntry(payload, versionLabel);
  if (!version) return null;
  if (!loaderSlugValue) return { version, loaderCode: "", loader: null };
  const supported = derived?.supportedLoadersByVersion?.get(version.key);
  for (const [code, loader] of Object.entries(payload.loaders || {})) {
    if (loaderSlug(loader?.label, code) === loaderSlugValue.toLowerCase()) {
      if (!supported || supported.has(code)) return { version, loaderCode: code, loader };
      return null;
    }
  }
  return null;
}

function buildSitemapData(payload, derived) {
  if (derived?.sitemap) return derived.sitemap;
  const releaseDate = /^\d{4}-\d{2}-\d{2}/.test(String(payload.release?.date || ""))
    ? String(payload.release.date).slice(0, 10)
    : "";
  const urls = new Set([
    "https://jtrans.aoiserver.com/",
    "https://jtrans.aoiserver.com/guide/minecraft-mod-japanese/",
  ]);
  for (const version of Array.isArray(payload.versions) ? payload.versions : []) {
    if (!version?.label || !version?.key) continue;
    const base = `https://jtrans.aoiserver.com/minecraft/${encodeURIComponent(version.label)}/`;
    urls.add(base);
    const supported = derived?.supportedLoadersByVersion?.get(version.key);
    for (const [code, loader] of Object.entries(payload.loaders || {})) {
      if (supported ? !supported.has(code) : !(payload.mods || []).some((mod) => Array.isArray(mod?.[version.key]) && mod[version.key].includes(code))) continue;
      urls.add(base + loaderSlug(loader?.label, code) + "/");
    }
  }
  for (const mod of payload.mods || []) {
    if (isIndexableMod(mod)) urls.add(canonicalModURL(mod));
  }
  const rows = Array.from(urls).map((loc) =>
    `  <url>\n    <loc>${escapeXML(loc)}</loc>${releaseDate ? `\n    <lastmod>${releaseDate}</lastmod>` : ""}\n  </url>`,
  );
  const data = {
    xml: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</urlset>\n`,
    urlCount: urls.size,
  };
  if (derived) derived.sitemap = data;
  return data;
}

function sitemapResponse(payload, derived) {
  const sitemap = buildSitemapData(payload, derived);
  return new Response(sitemap.xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=UTF-8",
      "cache-control": `public, max-age=0, s-maxage=${PAGE_CACHE_TTL}`,
      "x-jtrans-worker": "1",
      "x-jtrans-sitemap-urls": String(sitemap.urlCount),
      ...SECURITY_HEADERS,
    },
  });
}

function escapeXML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function modKeyCountText(payload, mod) {
  if (Number.isFinite(mod?.translationKeys)) return `${formatInteger(mod.translationKeys)}件`;
  const byVersion = mod?.translationKeysByVersion;
  if (byVersion && typeof byVersion === "object") {
    const bits = (payload.versions || [])
      .map((version) => Number.isFinite(byVersion?.[version.key])
        ? `${version.label} ${formatInteger(byVersion[version.key])}件`
        : null)
      .filter(Boolean);
    if (bits.length) return bits.join(" / ");
  }
  return "未集計";
}

function modNamespacesForVersion(mod, versionKey) {
  const byVersion = mod?.namespacesByVersion?.[versionKey];
  if (Array.isArray(byVersion) && byVersion.length) return byVersion;
  return Array.isArray(mod?.namespaces) ? mod.namespaces : [];
}

function modModesForVersion(mod, versionKey) {
  return Array.isArray(mod?.translationMode?.[versionKey]) ? mod.translationMode[versionKey] : [];
}

function sourceLinks(mod) {
  const out = [];
  const cf = mod?.source?.curseforge;
  if (cf) {
    const projects = Array.isArray(cf.projects)
      ? cf.projects
      : cf.projectId != null ? [{ projectId: cf.projectId }] : [];
    for (const project of projects) {
      if (project?.projectId == null) continue;
      out.push({
        // 複数プロジェクトのときだけIDを添えて区別する
        label: projects.length > 1 ? `CurseForge（ID ${project.projectId}）` : "CurseForge",
        href: `https://www.curseforge.com/projects/${encodeURIComponent(project.projectId)}`,
      });
    }
  }
  const mr = mod?.source?.modrinth;
  if (mr?.projectId) {
    out.push({
      label: "Modrinth",
      href: `https://modrinth.com/mod/${encodeURIComponent(mr.projectId)}`,
    });
  }
  const maven = mod?.source?.maven;
  if (maven?.repository) {
    const repository = safeExternalURL(maven.repository);
    if (repository) out.push({ label: "公式Maven / 配布元", href: repository });
  }
  return out;
}

function relatedMods(derived, mod, limit = 8) {
  if (!derived || !mod) return [];
  const cacheKey = `${mod.id || mod.name || ""}\u0000${limit}`;
  const cached = derived.relatedCache.get(cacheKey);
  if (cached) return cached;

  const currentName = String(mod.name || "").toLowerCase();
  const words = currentName.split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
  const base = currentName.split(/[:\-]/)[0].trim();
  const top = [];
  const compare = (a, b) => b.score - a.score || String(a.mod.name || "").localeCompare(String(b.mod.name || ""));

  for (const profile of derived.relatedProfiles) {
    const candidate = profile.mod;
    if (!candidate?.id || candidate.id === mod.id) continue;
    let score = base.length >= 4 && profile.name.startsWith(base) ? 8 : 0;
    for (const word of words) if (profile.name.includes(word)) score += 2;
    if (score <= 0) continue;

    const entry = { mod: candidate, score };
    let at = top.length;
    for (let i = 0; i < top.length; i++) {
      if (compare(entry, top[i]) < 0) {
        at = i;
        break;
      }
    }
    top.splice(at, 0, entry);
    if (top.length > limit) top.pop();
  }

  const result = top.map((entry) => entry.mod);
  derived.relatedCache.set(cacheKey, result);
  return result;
}

function renderModPage(payload, mod, derived) {
  const versions = Array.isArray(payload.versions) ? payload.versions : [];
  const loaders = payload.loaders || {};
  const supportRows = versions
    .map((version) => {
      const codes = Array.isArray(mod?.[version.key]) ? mod[version.key] : [];
      // 対応LoaderがないMinecraft版は表に出さない。global namespace は
      // 対応版で共通利用するためのfallbackであり、未対応版を増やす根拠ではない。
      if (!codes.length) return "";
      const modes = modModesForVersion(mod, version.key);
      const namespaces = modNamespacesForVersion(mod, version.key);
      const versionKeys = versionTranslationKeys(mod, version.key, versions);
      const perVersionKeys = Number.isFinite(versionKeys)
        ? `${formatInteger(versionKeys)}件`
        : "未集計";
      const loaderText = codes.length ? codes.map((code) => loaders?.[code]?.label || code).join(" / ") : "—";
      const modeText = modes.length ? modes.map((mode) => mode === "lang" ? "言語ファイル" : mode === "hardcoded" ? "ハードコード" : mode).join(" + ") : "未記録";
      const nsText = namespaces.length ? namespaces.join(", ") : "—";
      const versionURL = `/minecraft/${encodeURIComponent(version.label)}/`;
      return `<tr><th><a href="${versionURL}">Minecraft ${escapeHTML(version.label)}</a></th><td data-label="MODローダー">${escapeHTML(loaderText)}</td><td data-label="翻訳方式">${escapeHTML(modeText)}</td><td data-label="翻訳項目">${escapeHTML(perVersionKeys)}</td><td data-label="namespace"><code>${escapeHTML(nsText)}</code></td></tr>`;
    })
    .filter(Boolean)
    .join("");
  const source = sourceLinks(mod);
  const sourceHTML = source.length
    ? source.map((entry) => `<a class="source-card" href="${escapeURL(entry.href)}" target="_blank" rel="noopener noreferrer">${escapeHTML(entry.label)} <span>↗</span></a>`).join("")
    : `<p class="muted">公開データに配布元は記録されていません。</p>`;
  const notes = Array.isArray(mod.notes) && mod.notes.length
    ? `<ul class="notes">${mod.notes.map((note) => `<li>${escapeHTML(note)}</li>`).join("")}</ul>`
    : `<p class="muted">個別の監査メモはありません。</p>`;
  const related = relatedMods(derived, mod);
  const relatedHTML = related.length
    ? `<div class="related-grid">${related.map((entry) => `<a href="/mods/${encodeURIComponent(entry.id)}/">${escapeHTML(entry.name)}<span aria-hidden="true">→</span></a>`).join("")}</div>`
    : `<p class="muted">関連MODはrelease-dataから自動抽出されませんでした。</p>`;
  const versionText = versions
    .filter((version) => Array.isArray(mod?.[version.key]) && mod[version.key].length)
    .map((version) => version.label)
    .join(" / ") || "対応バージョン未記録";
  const modeSet = new Set(Object.values(mod.translationMode || {}).flatMap((value) => Array.isArray(value) ? value : []));
  const modeText = Array.from(modeSet).map((mode) => mode === "lang" ? "言語ファイル" : mode === "hardcoded" ? "ハードコード" : mode).join(" + ") || "方式未記録";
  const canonical = canonicalModURL(mod);
  const releaseVersion = payload.release?.version ? `v${payload.release.version}` : "最新版";
  const supportedVersions = versions.filter((version) => Array.isArray(mod?.[version.key]) && mod[version.key].length);
  // 「a〜b」は間のバージョンが全部対応しているときだけ使う（飛び飛びなら並べる）
  const indexes = supportedVersions.map((version) => versions.indexOf(version));
  const contiguous = indexes.every((value, i) => i === 0 || value === indexes[i - 1] + 1);
  const labels = supportedVersions.map((version) => version.label);
  const versionRange = labels.length <= 1
    ? labels[0] || ""
    : contiguous
      ? `${labels[0]}〜${labels[labels.length - 1]}`
      : labels.length <= 3 ? labels.join(" / ") : "";
  // タイトル用：飛び飛びで4つ以上なら数だけ
  const titleRange = versionRange ? `Minecraft ${versionRange} 対応` : labels.length ? `Minecraft ${labels.length}バージョン対応` : "";
  const loaderNames = Array.from(new Set(supportedVersions.flatMap((version) => mod[version.key].map((code) => loaders?.[code]?.label || code))));
  const modName = normalizeJtransBrand(mod.name);
  // 検索結果に出る説明文：何をすれば日本語になるか → 対応環境 → このページで分かること
  const description = `${modName}を日本語化するには、翻訳MOD「jtrans」を一緒に入れるだけ。Minecraft ${versionText}${loaderNames.length ? `（${loaderNames.join(" / ")}）` : ""}に対応。バージョンごとの翻訳方式と翻訳項目数も確認できます。`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": canonical,
        "url": canonical,
        "name": `${normalizeJtransBrand(mod.name)} 日本語化 | jtrans`,
        "description": description,
        "inLanguage": "ja",
        "isPartOf": { "@id": "https://jtrans.aoiserver.com/#website" },
        "dateModified": payload.release?.date || undefined,
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "jtrans", "item": "https://jtrans.aoiserver.com/" },
          { "@type": "ListItem", "position": 2, "name": "対応MOD", "item": "https://jtrans.aoiserver.com/#supportedMods" },
          { "@type": "ListItem", "position": 3, "name": normalizeJtransBrand(mod.name), "item": canonical },
        ],
      },
    ],
  };
  const added = mod.addedIn ? `v${mod.addedIn}` : "既存対応";
  const body = `<main class="page">
    <nav class="breadcrumbs" aria-label="パンくず"><a href="/">jtrans</a><span>/</span><a href="/#supportedMods">対応MOD</a><span>/</span><span>${escapeHTML(mod.name)}</span></nav>
    <section class="hero compact"><h1>${escapeHTML(mod.name)} <span>日本語化</span></h1><p class="page-meta">${added === "既存対応" ? "" : `<span class="page-meta-new">jtrans ${escapeHTML(added)} で追加</span> · `}${escapeHTML(modeText)}</p><p class="page-lede">jtransを一緒に入れると、${escapeHTML(mod.name)}の表示が日本語になります。${labels.length ? `Minecraft ${escapeHTML(versionRange || labels.join(" / "))}に対応。` : ""}<a href="/guide/minecraft-mod-japanese/">入れ方を見る</a></p></section>
    <section class="panel"><div class="section-head"><h2>対応環境</h2></div><div class="table-wrap"><table class="support-table"><thead><tr><th>バージョン</th><th>MODローダー</th><th>翻訳方式</th><th>翻訳項目</th><th>namespace</th></tr></thead><tbody>${supportRows}</tbody></table></div></section>
    ${Array.isArray(mod.notes) && mod.notes.length ? `<section class="two-col"><article class="panel"><div class="section-head"><h2>配布元</h2></div><div class="source-list">${sourceHTML}</div></article><article class="panel"><div class="section-head"><h2>監査・対応メモ</h2></div>${notes}</article></section>` : `<section class="panel"><div class="section-head"><h2>配布元</h2></div><div class="source-list source-list-row">${sourceHTML}</div></section>`}
    <section class="panel"><div class="section-head"><h2>関連する対応MOD</h2></div>${relatedHTML}</section>
  </main>`;
  return renderShell({
    title: `${modName} 日本語化${titleRange ? ` | ${titleRange}` : ""} - jtrans`,
    description,
    canonical,
    body,
    jsonLd,
    robots: isIndexableMod(mod) ? "index,follow" : "noindex,follow",
  });
}

function renderMinecraftLanding(payload, resolved, derived) {
  const { version, loaderCode, loader } = resolved;
  const indexKey = landingKey(version.key, loaderCode);
  const mods = getLandingMods(derived, version.key, loaderCode);
  const stats = derived?.landingStats?.get(indexKey) || { count: mods.length, keyCount: 0, keyCountUnknownMods: 0, hardcodedCount: 0 };
  const loaderLabel = loaderCode ? (loader?.label || loaderCode) : "全Loader";
  const pageName = loaderCode
    ? `Minecraft ${version.label} ${loaderLabel} MOD 日本語化`
    : `Minecraft ${version.label} MOD 日本語化`;
  const canonical = `https://jtrans.aoiserver.com/minecraft/${encodeURIComponent(version.label)}/${loaderCode ? loaderSlug(loader?.label, loaderCode) + "/" : ""}`;
  const list = mods
    .map((mod) => {
      const codes = Array.isArray(mod?.[version.key]) ? mod[version.key] : [];
      const loaderText = codes.map((code) => payload.loaders?.[code]?.label || code).join(" / ");
      const modes = modModesForVersion(mod, version.key).map((mode) => mode === "lang" ? "言語ファイル" : mode === "hardcoded" ? "ハードコード" : mode).join(" + ");
      const versionKeys = versionTranslationKeys(mod, version.key, payload.versions || []);
      const keys = Number.isFinite(versionKeys)
        ? formatInteger(versionKeys) + "件"
        : "未集計";
      return `<li><a href="/mods/${encodeURIComponent(mod.id)}/"><strong>${escapeHTML(mod.name)}</strong><span>${escapeHTML(loaderText || "Loader未記録")} · ${escapeHTML(modes || "方式未記録")} · ${escapeHTML(keys)}</span></a></li>`;
    })
    .join("");
  const supported = derived?.supportedLoadersByVersion?.get(version.key);
  const loaderNav = Object.entries(payload.loaders || {})
    .filter(([code]) => !supported || supported.has(code))
    .map(([code, item]) => {
      const slug = loaderSlug(item?.label, code);
      const active = code === loaderCode ? " active" : "";
      return `<a class="filter-link${active}" href="/minecraft/${encodeURIComponent(version.label)}/${slug}/">${escapeHTML(item?.label || code)}</a>`;
    })
    .join("");
  const description = `${pageName}の対応一覧。jtransで日本語化できる${formatInteger(mods.length)}件のMODと、MODローダー・翻訳方式・翻訳項目数を確認できます。`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": pageName,
    "url": canonical,
    "description": description,
    "inLanguage": "ja",
    "dateModified": payload.release?.date || undefined,
  };
  const body = `<main class="page">
    <nav class="breadcrumbs"><a href="/">jtrans</a><span>/</span><span>Minecraft ${escapeHTML(version.label)}</span>${loaderCode ? `<span>/</span><span>${escapeHTML(loaderLabel)}</span>` : ""}</nav>
    <section class="hero compact"><h1>${escapeHTML(pageName)}</h1><p class="page-meta">対応MOD ${formatInteger(stats.count)}件 · 翻訳項目 ${formatInteger(stats.keyCount)}${stats.keyCountUnknownMods ? "件以上" : "件"}</p></section>
    <nav class="filter-links" aria-label="ローダーで絞り込む"><a class="filter-link${loaderCode ? "" : " active"}" href="/minecraft/${encodeURIComponent(version.label)}/">すべて</a>${loaderNav}</nav>
    <section class="panel"><h2 class="sr-only">${escapeHTML(pageName)}一覧</h2><ol class="mod-list">${list}</ol></section>
  </main>`;
  return renderShell({ title: `${pageName} | jtrans`, description, canonical, body, jsonLd });
}

function renderGuidePage(payload) {
  const modCount = Number.isFinite(payload.stats?.modCount) ? payload.stats.modCount : (payload.mods || []).length;
  const versions = (payload.versions || []).map((v) => v.label).filter(Boolean);
  const canonical = "https://jtrans.aoiserver.com/guide/minecraft-mod-japanese/";
  const description = `Minecraft MODを日本語化する方法とjtransの入れ方。${formatInteger(modCount)}件の対応MOD、翻訳の前後比較、誤訳の報告先をまとめています。`;
  const download = "https://www.curseforge.com/minecraft/mc-mods/jtrans";
  const comments = "https://www.curseforge.com/minecraft/mc-mods/jtrans/comments";
  const samples = [
    ["Applied Energistics 2 のガイド画面", ASSETS.translationBefore, ASSETS.translationAfter, 1920, 1080],
    ["Sodium Extras の設定画面", ASSETS.translationSample06Before, ASSETS.translationSample06After, 1920, 1080],
    ["TerraMining の進行ガイド", ASSETS.translationSample07Before, ASSETS.translationSample07After, 1919, 1078],
  ].filter(([, before, after]) => before && after);
  const compare = samples.map(([name, before, after, w, h]) => `<figure class="compare"><div class="compare-stage" style="--split:50%"><img src="${escapeURL(before)}" alt="${escapeHTML(name)}（導入前・英語）" width="${w}" height="${h}" loading="lazy" decoding="async"><div class="compare-after"><img src="${escapeURL(after)}" alt="${escapeHTML(name)}（jtrans導入後・日本語）" width="${w}" height="${h}" loading="lazy" decoding="async"></div><span class="compare-line" aria-hidden="true"></span><input class="compare-range" type="range" min="0" max="100" value="50" aria-label="${escapeHTML(name)}：導入前と導入後の境目"></div><figcaption>${escapeHTML(name)}<span>左：導入前 / 右：導入後</span></figcaption></figure>`).join("");
  const untranslated = (Array.isArray(payload.intentionallyUntranslated) ? payload.intentionallyUntranslated : [])
    .filter((note) => typeof note === "string" && note.trim());
  const body = `<main class="page">
    <nav class="breadcrumbs"><a href="/">jtrans</a><span>/</span><span>導入ガイド</span></nav>
    <section class="hero compact"><h1>Minecraft MODを日本語化する方法</h1><p class="page-meta">jtrans（All Japanese Translate）の入れ方と、報告の窓口</p></section>
    <section class="panel"><div class="section-head"><h2>入れ方</h2></div><ol class="steps"><li><span><a href="${download}" target="_blank" rel="noopener noreferrer">CurseForge ↗</a>から、遊ぶ環境に合うjtransをダウンロード</span></li><li><span><code>.jar</code> ファイルを <code>mods</code> フォルダに入れる</span></li><li><span>Minecraftを起動する（jtrans側の設定は不要）</span></li></ol><p class="note">jtransは翻訳だけを入れるMODです。遊びたいMOD本体と、その前提MODは別に入れてください。</p></section>
    ${compare ? `<section class="panel"><div class="section-head"><h2>翻訳の前後比較</h2></div><div class="compare-list">${compare}</div></section>` : ""}
    <section class="panel"><div class="section-head"><h2>報告・要望</h2></div><p class="lead-sm">誤訳・未翻訳の報告や、対応してほしいMODの要望は、CurseForgeのコメント欄へ。MOD名・Minecraftのバージョン・該当の文章があると確認が早くなります。元のMOD作者への問い合わせはご遠慮ください。</p><p><a class="button" href="${comments}" target="_blank" rel="noopener noreferrer">コメント欄を開く ↗</a></p>${untranslated.length ? `<details class="fold"><summary>意図的に翻訳していないもの</summary><ul>${untranslated.map((note) => `<li>${escapeHTML(normalizeJtransBrand(note))}</li>`).join("")}</ul></details>` : ""}</section>
    <section class="panel"><div class="section-head"><h2>よくある質問</h2></div><dl class="faq"><dt>一覧にない環境でも使えますか？</dt><dd>言語ファイルの翻訳は、一覧にない環境でも反映される場合があります。ただしMOD側の更新で一部が英語に戻ることがあり、ハードコードされた文章の翻訳はForge / NeoForgeのみ対応です。</dd><dt>すべての英語が日本語になりますか？</dt><dd>MODの作りによっては、独自の画面や動的な表示に英語が残る場合があります。</dd><dt>対応MODを探すには？</dt><dd><a href="/">トップの検索</a>か、バージョン別の一覧（${versions.map((v) => `<a href="/minecraft/${encodeURIComponent(v)}/">${escapeHTML(v)}</a>`).join("・")}）から確認できます。</dd></dl></section>
  </main>
  <script>document.querySelectorAll(".compare-range").forEach(function(r){var s=r.closest(".compare-stage");var u=function(){s.style.setProperty("--split",r.value+"%")};r.addEventListener("input",u);u();});</script>`;
  return renderShell({
    title: "Minecraft MOD 日本語化ガイド - jtransの入れ方と報告窓口",
    description,
    canonical,
    body,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": "Minecraft MODを日本語化する方法",
      "description": description,
      "mainEntityOfPage": canonical,
      "inLanguage": "ja",
      "dateModified": payload.release?.date || undefined,
      "author": { "@type": "Person", "name": "aoityou" },
    },
  });
}

function renderShell({ title, description, canonical, body, jsonLd = null, robots = "index,follow" }) {
  const structured = jsonLd ? `<script type="application/ld+json">${escapeScriptJSON(JSON.stringify(jsonLd))}</script>` : "";
  return `<!doctype html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHTML(title)}</title><meta name="description" content="${escapeHTML(description)}"><meta name="robots" content="${escapeHTML(robots)}">${canonical ? `<link rel="canonical" href="${escapeURL(canonical)}">` : ""}
<meta name="theme-color" content="#0d0d0d"><meta property="og:type" content="website"><meta property="og:site_name" content="All Japanese Translate"><meta property="og:title" content="${escapeHTML(title)}"><meta property="og:description" content="${escapeHTML(description)}">${canonical ? `<meta property="og:url" content="${escapeURL(canonical)}">` : ""}<meta property="og:image" content="https://jtrans.aoiserver.com/og-image-3.png"><meta property="og:locale" content="ja_JP"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHTML(title)}"><meta name="twitter:description" content="${escapeHTML(description)}"><meta name="twitter:image" content="https://jtrans.aoiserver.com/og-image-3.png">
<link rel="icon" href="/favicon.ico?v=2" sizes="any"><link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2">${structured}
${FONT_LINKS}<link rel="stylesheet" href="${PALETTE_CSS_HREF}"><link rel="stylesheet" href="${SEO_PAGE_CSS_HREF}"></head><body><a class="skip" href="#main">本文へ</a><header class="mast"><div class="mast-inner"><a class="brand" href="/" aria-label="All Japanese Translate ホーム"><img class="crest" src="${CREST_HREF}" width="32" height="32" alt=""><span class="brand-name">All Japanese Translate</span></a><nav aria-label="サイト内"><a href="/guide/minecraft-mod-japanese/">導入ガイド</a><a class="nav-download" href="https://www.curseforge.com/minecraft/mc-mods/jtrans" target="_blank" rel="noopener noreferrer"><span class="nav-long">CurseForgeで</span>ダウンロード ↗</a></nav></div></header><div id="main" tabindex="-1">${body}</div><footer><div><strong><img class="crest" src="${CREST_HREF}" width="28" height="28" alt="">All Japanese Translate</strong><p>jtransは各MODとは独立した非公式の翻訳MODです。© 2026 aoityou</p></div><nav aria-label="フッターリンク"><a href="https://www.curseforge.com/minecraft/mc-mods/jtrans/files/all" target="_blank" rel="noopener noreferrer">更新履歴 ↗</a><a href="https://www.curseforge.com/minecraft/mc-mods/jtrans/comments" target="_blank" rel="noopener noreferrer">報告・要望 ↗</a><a href="https://github.com/AOITYOU/jtrans-data" target="_blank" rel="noopener noreferrer">対応データ (GitHub) ↗</a></nav></footer></body></html>`;
}

function escapeScriptJSON(value) {
  return String(value).replace(/</g, "\\u003c");
}


function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeJtransBrand(value) {
  return String(value).replace(/jtrans/gi, "jtrans");
}

function escapeMarkup(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHTML(value) {
  // A2: ここでブランド正規化をしない。表示名（例: "JTrans Internal ..."）が
  // 書き換わってしまうため、正規化は title / description / JSON-LD の生成箇所で
  // 明示的に normalizeJtransBrand() を呼ぶ。
  return escapeMarkup(value);
}

function escapeURL(value) {
  return escapeMarkup(value);
}


// ---------------------------------------------------------------------------
// v7 prerender: build.mjs から呼ばれ、公開する全ページを文字列で返す。
// 中身は v6 の Worker が各リクエストで返していたものと同一になるようにしてある
// （同じ関数を同じ順で呼ぶ）。違いは「いつ作るか」だけ。
// ---------------------------------------------------------------------------

// バッジ（jtrans-badge Worker）用の小さな集計。バッジは5MBの release-data を
// 毎回 JSON.parse するとそれだけで無料プランのCPU上限を超えうるため、
// 必要な値だけをここで先に計算しておく。形はバッジ側の既存コード
// （stats / siteStats / release / loaders / versions / mods）がそのまま読める
// ようにし、mods はバージョンごとの対応ローダーを1行にまとめた要約にする。
export function buildBadgeStats(payload) {
  const versions = (Array.isArray(payload.versions) ? payload.versions : [])
    .filter((version) => version?.key && version?.label)
    .map((version) => ({ key: version.key, label: version.label }));
  const summary = {};
  for (const version of versions) {
    const codes = new Set();
    for (const mod of payload.mods || []) {
      const list = mod?.[version.key];
      if (Array.isArray(list)) for (const code of list) codes.add(code);
    }
    if (codes.size) summary[version.key] = [...codes];
  }
  const loaders = {};
  for (const [code, loader] of Object.entries(payload.loaders || {})) {
    loaders[code] = { label: loader?.label };
  }
  return {
    schema: "jtrans-badge-stats/1",
    generatedFrom: DATA_URL,
    release: { version: payload.release?.version ?? null, date: payload.release?.date ?? null },
    stats: {
      modCount: payload.stats?.modCount ?? null,
      translationKeyCount: payload.stats?.translationKeyCount ?? null,
    },
    siteStats: { directoryModCount: payload.siteStats?.directoryModCount ?? null },
    loaders,
    versions,
    mods: [summary],
  };
}

function renderHomeHTML(payload, derived, templateHTML) {
  const home = getHomeDerived(payload, derived);
  const meta = home.meta;
  if (!home.rowsHTML) throw new Error("home SSR: rows-empty");
  const rendered = applyHomeSSR(templateHTML, {
    tbody: { kind: "html", value: home.rowsHTML },
    statVersion: { kind: "text", value: meta.versionText },
    statCount: { kind: "text", value: meta.modCountText },
    statNewItem: {
      kind: "html",
      value: meta.newCount
        ? `<dt>新規追加</dt><dd><strong>${escapeHTML(meta.newCountText)}</strong><span class="meta-unit"> 件</span></dd>`
        : "",
    },
    statKeyCount: { kind: "text", value: meta.keyCountText },
    statPlatforms: { kind: "text", value: meta.platformsText || "-" },
    statUpdated: { kind: "time", value: meta.dateText || "-", datetime: meta.dateISO },
    ldJson: { kind: "structured-data", meta },
  });
  if (!rendered.replaced.has("tbody")) throw new Error("home SSR: tbody-target-missing");
  return rendered.html;
}

function render404HTML() {
  return renderShell({
    title: "404 | jtrans",
    description: "ページが見つかりません",
    canonical: null,
    robots: "noindex,follow",
    body: `<main class="page"><div class="panel"><h1>ページが見つかりません</h1><p class="lead">お探しのページは移動したか、削除された可能性があります。</p><a class="button" href="/#supportedMods">対応MOD一覧へ</a></div></main>`,
  });
}

// 安全なファイルパスだけを出す（Windows でも書ける名前・大文字小文字の衝突なし）。
function assertSafeSegment(segment, kind) {
  if (!/^[A-Za-z0-9._-]+$/.test(segment) || /^\.+$/.test(segment) || /\.$/.test(segment)) {
    throw new Error(`prerender: unsafe ${kind} path segment: ${JSON.stringify(segment)}`);
  }
  return segment;
}

/**
 * @param {object} payload  jtrans-release-data.json を JSON.parse したもの（書き換えられる）
 * @param {string} homeTemplateHTML  build.mjs が作った dist/index.html
 * @returns {{ files: Map<string,string>, counts: object }}  key は dist/ からの相対パス
 */
export function prerenderSite(payload, homeTemplateHTML) {
  if (!payload || !Array.isArray(payload.mods) || !payload.mods.length) {
    throw new Error("prerender: release-data payload is invalid (mods is empty)");
  }
  normalizeReleaseData(payload);
  const derived = buildDerivedData(payload);
  const files = new Map();
  const counts = { mods: 0, landings: 0 };
  const seenLower = new Set();
  const put = (relPath, body) => {
    const lower = relPath.toLowerCase();
    if (seenLower.has(lower)) throw new Error(`prerender: duplicate path (case-insensitive): ${relPath}`);
    seenLower.add(lower);
    files.set(relPath, body);
  };

  // v6 と同じ順: normalize → derived → JSON.stringify
  put("api/release-data.json", JSON.stringify(payload));
  put("api/badge-stats.json", JSON.stringify(buildBadgeStats(payload)));
  put("sitemap.xml", buildSitemapData(payload, derived).xml);
  put("guide/minecraft-mod-japanese/index.html", renderGuidePage(payload));
  put("index.html", renderHomeHTML(payload, derived, homeTemplateHTML));
  put("404.html", render404HTML());

  for (const version of Array.isArray(payload.versions) ? payload.versions : []) {
    if (!version?.label || !version?.key) continue;
    const label = String(version.label);
    const resolved = resolveMinecraftLanding(payload, label, "", derived);
    if (!resolved) continue;
    const dir = `minecraft/${assertSafeSegment(label, "version")}`;
    put(`${dir}/index.html`, renderMinecraftLanding(payload, resolved, derived));
    counts.landings++;
    for (const [code, loader] of Object.entries(payload.loaders || {})) {
      const slug = loaderSlug(loader?.label, code);
      const resolvedLoader = resolveMinecraftLanding(payload, label, slug, derived);
      if (!resolvedLoader) continue;
      put(`${dir}/${assertSafeSegment(slug, "loader")}/index.html`, renderMinecraftLanding(payload, resolvedLoader, derived));
      counts.landings++;
    }
  }

  for (const [id, mod] of derived.modsById) {
    put(`mods/${assertSafeSegment(id, "mod id")}/index.html`, renderModPage(payload, mod, derived));
    counts.mods++;
  }

  return { files, counts };
}
