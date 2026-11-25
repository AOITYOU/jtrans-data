// このMOD一覧の中身（対応MOD・バージョン・ローダー・最新リリース情報）は
      // 外部の公開データ(jtrans-release-data.json)を起動時に読み込んで描画する。
      // jtransの新バージョンをリリースした際は、このJSONを更新するだけで
      // このページ側は一切編集せずに内容が最新化される。
      const DATA_URL = "/api/release-data.json";
      const DATA_CACHE_KEY = "jtrans-release-data-cache-v4";
      const EMBEDDED_PREVIEW_DATA = globalThis.__JTRANS_PREVIEW_DATA__ || null;
      const EMBEDDED_PREVIEW_TOTAL = Number(globalThis.__JTRANS_PREVIEW_TOTAL_MODS__) || 0;
      // 一覧はページ分割せず、スクロール位置に近い行だけDOMへ残す。
      // 元データは検索用にメモリへ保持するが、表示DOMは最大150件程度に制限する。
      const VIRTUAL_CHUNK_SIZE = 50;
      const VIRTUAL_INITIAL_ROWS = 100;
      const VIRTUAL_MAX_ROWS = 150;
      const VIRTUAL_LOAD_MARGIN = 1100;

      const tbody = document.getElementById("tbody");
      const statCount = document.getElementById("statCount");
      const countLine = document.getElementById("countLine");
      const countLive = document.getElementById("countLive");
      const emptyMsg = document.getElementById("emptyMsg");
      const virtualListStatus = document.getElementById("virtualListStatus");
      const searchInput = document.getElementById("search");
      const clearSearch = document.getElementById("clearSearch");
      const versionFilter = document.getElementById("versionFilter");
      const loaderFilter = document.getElementById("loaderFilter");
      const modeFilter = document.getElementById("modeFilter");
      const sourceFilter = document.getElementById("sourceFilter");
      const resetFilters = document.getElementById("resetFilters");
      const filterToggle = document.getElementById("filterToggle");
      const activeFilters = document.getElementById("activeFilters");
      const activeFilterChips = document.getElementById("activeFilterChips");
      const clearRefinements = document.getElementById("clearRefinements");
      const emptyClearRefinements = document.getElementById("emptyClearRefinements");
      const emptyClearSearch = document.getElementById("emptyClearSearch");
      const emptyResetFilters = document.getElementById("emptyResetFilters");
      const envPicker = document.getElementById("envPicker");
      const envVersionOptions = document.getElementById("envVersionOptions");
      const envLoaderOptions = document.getElementById("envLoaderOptions");
      const envSummary = document.getElementById("envSummary");
      const alphabetLinks = document.getElementById("alphabetLinks");
      const alphabetNav = document.querySelector(".alphabet-nav");
      const indexBar = document.getElementById("indexBar");
      const toolbarEl = document.getElementById("toolbar");
      const resultsStart = document.getElementById("resultsStart");
      const legend = document.getElementById("legend");
      const newOnlyToggle = document.getElementById("newOnlyToggle");
      const newOnlyLabel = document.getElementById("newOnlyLabel");
      const headRow = document.getElementById("headRow");
      const crestMark = document.querySelector(".crest-mark");
      const excludedMatch = document.getElementById("excludedMatch");
      const cacheNote = document.getElementById("cacheNote");
      const modDirectoryTable = document.getElementById("modDirectoryTable");
      const masthead = document.querySelector(".site-masthead");
      const menuToggle = document.getElementById("menuToggle");
      const siteNav = document.getElementById("siteNav");
      const supportedModsSection = document.getElementById("supportedMods");
      const backToTop = document.getElementById("backToTop");

      const ALPHABET = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "漢"];

      // 読み込んだJSONの中身を後から詰め替えるためのプレースホルダー。
      // 実際の値は loadReleaseData() が fetch 成功後に設定する。
      let LOADERS = {};
      let VERSIONS = [];
      let LATEST_RELEASE = "";
      let LATEST_RELEASE_ADDITIONS = new Set();
      let MODS = [];
      let EXCLUDED_MODS = [];
      let ACTIVE_LOADER_CODES = [];
      let HAS_UNSUPPORTED_CELLS = false;

      // TOPボタンの表示は ui.js がまとめて管理する。

      if (menuToggle && masthead && siteNav) {
        menuToggle.addEventListener("click", () => {
          const open = masthead.classList.toggle("menu-open");
          menuToggle.setAttribute("aria-expanded", String(open));
        });
        siteNav.addEventListener("click", (event) => {
          if (event.target.closest("a")) {
            masthead.classList.remove("menu-open");
            menuToggle.setAttribute("aria-expanded", "false");
          }
        });
        document.addEventListener("keydown", (event) => {
          if (
            event.key === "Escape" &&
            masthead.classList.contains("menu-open")
          ) {
            masthead.classList.remove("menu-open");
            menuToggle.setAttribute("aria-expanded", "false");
            menuToggle.focus();
          }
        });
      }

      function formatJapaneseDate(dateStr) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ""));
        if (!m) return "";
        return m[1] + "." + m[2] + "." + m[3];
      }

      // 構造化データのバージョン・更新日だけをJSONに追従させる。
      function applyStructuredData(payload) {
        const node = document.getElementById("ldJson");
        if (!node) return;
        try {
          const data = JSON.parse(node.textContent);
          const version = (payload.release && payload.release.version) || "";
          const date = (payload.release && payload.release.date) || "";
          if (version) data.softwareVersion = version;
          if (date) {
            data.datePublished = date;
            data.dateModified = date;
          }
          node.textContent = JSON.stringify(data);
        } catch (err) {
          console.warn("構造化データの更新に失敗しました:", err);
        }
      }

      // ページタイトルは公式サイトとして固定し、JSONからはリリース情報だけを反映する。
      function applyReleaseMeta(payload) {
        const versionText = LATEST_RELEASE;
        const newCountText =
          LATEST_RELEASE_ADDITIONS.size.toLocaleString("ja-JP");
        const keyCount =
          payload.stats && typeof payload.stats.translationKeyCount === "number"
            ? payload.stats.translationKeyCount
            : null;
        const keyCountText =
          keyCount !== null ? keyCount.toLocaleString("ja-JP") : "-";
        const platformsText = VERSIONS.map((version) => {
          const codes = Object.keys(LOADERS).filter((code) =>
            MODS.some((mod) => (mod[version.key] || []).includes(code)),
          );
          if (!codes.length) return null;
          return (
            version.label +
            " — " +
            codes.map((code) => LOADERS[code].label).join("・")
          );
        })
          .filter(Boolean)
          .join(" / ");
        const dateISO = (payload.release && payload.release.date) || "";
        const dateText = formatJapaneseDate(dateISO);

        const statVersion = document.getElementById("statVersion");
        const statNewCount = document.getElementById("statNewCount");
        const statKeyCount = document.getElementById("statKeyCount");
        const statPlatforms = document.getElementById("statPlatforms");
        const statUpdated = document.getElementById("statUpdated");

        if (statVersion) statVersion.textContent = versionText;
        if (statNewCount) statNewCount.textContent = newCountText;
        // E1: 0件のKPIは出さない。
        const statNewItem = document.getElementById("statNewItem");
        if (statNewItem) statNewItem.hidden = LATEST_RELEASE_ADDITIONS.size === 0;
        if (statKeyCount) statKeyCount.textContent = keyCountText;
        if (statPlatforms) statPlatforms.textContent = platformsText || "-";
        if (statUpdated) {
          statUpdated.textContent = dateText || "-";
          statUpdated.setAttribute("datetime", dateISO);
        }

        applyStructuredData(payload);
      }

      function normalizeJtransBrand(value) {
        return String(value).replace(/jtrans/gi, "jtrans");
      }

      function showLoadingState() {
        document.body.classList.add("data-loading");
        countLine.textContent = "最新の対応MOD情報を読み込み中…";
        emptyMsg.hidden = true;
        // SSR済みのMOD行がある場合は、検索エンジン/利用者向けの初期HTMLを
        // スケルトンで消さない。release-data取得後に既存JSが通常どおり再描画する。
        if (tbody.querySelector(".mod-row")) return;
        // 最初の文字見出し + MOD行13件を、実表示とほぼ同じ高さで先に確保する。
        // 特にモバイルでは実MOD行が約98pxになるため、短い骨組みだと大きなCLSが残る。
        tbody.innerHTML =
          '<tr class="loading-row loading-divider" aria-hidden="true"><td><span class="loading-bar"></span></td></tr>' +
          Array.from(
            { length: 13 },
            () =>
              '<tr class="loading-row" aria-hidden="true"><td><span class="loading-bar"></span></td></tr>',
          ).join("");
      }

      function showErrorState() {
        emptyMsg.hidden = true;

        // クライアント側のrelease-data取得だけが失敗しても、Worker SSRで
        // すでに配信された対応MOD一覧は捨てない。検索エンジンと利用者の
        // 初期HTMLを維持し、通信復旧後の再読み込みだけ案内する。
        if (tbody.querySelector(".ssr-mod-row")) {
          countLine.textContent =
            "最新データの再取得に失敗したため、配信時点の対応MOD一覧を表示しています。";
          if (cacheNote) {
            cacheNote.textContent =
              "一部の絞り込み機能は利用できません。時間を置いて再読み込みしてください。";
            cacheNote.hidden = false;
          }
          document.body.classList.remove("data-loading");
          return;
        }

        countLine.textContent = "";
        if (cacheNote) {
          cacheNote.textContent =
            "最新の対応情報を取得できませんでした。時間を置いて再読み込みしてください。";
          cacheNote.hidden = false;
        }
        const colspan = Math.max(headRow.children.length, 1);
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = colspan;
        cell.style.padding = "32px 16px";
        cell.style.textAlign = "center";
        cell.style.color = "var(--text-dim)";
        cell.textContent =
          "対応MOD情報の取得に失敗しました。通信環境をご確認のうえ、再読み込みしてください。";
        const retryBtn = document.createElement("button");
        retryBtn.type = "button";
        retryBtn.textContent = "再読み込み";
        retryBtn.style.marginLeft = "10px";
        retryBtn.style.padding = "6px 14px";
        retryBtn.style.cursor = "pointer";
        retryBtn.style.borderRadius = "2px";
        retryBtn.style.border = "1px solid var(--border)";
        retryBtn.style.background = "var(--surface-alt)";
        retryBtn.style.color = "var(--text)";
        retryBtn.addEventListener("click", () => window.location.reload());
        cell.appendChild(retryBtn);
        row.appendChild(cell);
        tbody.innerHTML = "";
        tbody.appendChild(row);
        document.body.classList.remove("data-loading");
      }

      // jtrans-release-data.json を取得し、対応MOD一覧・最新リリース情報を反映する。
      // 取得成功時はブラウザへ保存し、データAPIへ一時的に接続できない場合は前回データを使う。
      async function loadReleaseData() {
        showLoadingState();
        let payload = null;
        let fromCache = false;

        try {
          if (EMBEDDED_PREVIEW_DATA) {
            payload = EMBEDDED_PREVIEW_DATA;
          } else {
          // 配信側が max-age=300 を返すため、HTTPキャッシュをそのまま活かす。
          // B2: タイムアウトがないと、応答が返らないときに catch へ入らず
          // localStorage フォールバックにも落ちないまま読み込み中で止まる。
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          let res;
          try {
            res = await fetch(DATA_URL, { signal: controller.signal });
          } finally {
            clearTimeout(timeoutId);
          }
          if (!res.ok) throw new Error("HTTP " + res.status);
          // B3: 本文は1度だけ読む。以前は payload を JSON.stringify で
          // 作り直して(約1MB)同期 setItem していたため、初期描画を止めていた。
          const rawText = await res.text();
          payload = JSON.parse(rawText);
          const saveCache = () => {
            try {
              localStorage.setItem(DATA_CACHE_KEY, rawText);
            } catch (cacheErr) {
              // 容量超過なら古い値を消しておく（毎回の無駄な再試行を避ける）。
              try {
                localStorage.removeItem(DATA_CACHE_KEY);
              } catch (_) {}
              console.warn("jtrans release data の保存に失敗しました:", cacheErr);
            }
          };
          if ("requestIdleCallback" in window) {
            requestIdleCallback(saveCache, { timeout: 2000 });
          } else {
            setTimeout(saveCache, 0);
          }
          }
        } catch (err) {
          console.error("jtrans release data の取得に失敗しました:", err);
          try {
            const cached = localStorage.getItem(DATA_CACHE_KEY);
            if (cached) {
              payload = JSON.parse(cached);
              fromCache = true;
            }
          } catch (cacheErr) {
            console.warn(
              "jtrans release data のキャッシュ読込に失敗しました:",
              cacheErr,
            );
          }
        }

        if (!payload) {
          showErrorState();
          return;
        }

        LOADERS = payload.loaders || {};
        VERSIONS = Array.isArray(payload.versions) ? payload.versions : [];
        LATEST_RELEASE =
          "v" + ((payload.release && payload.release.version) || "");
        LATEST_RELEASE_ADDITIONS = new Set(
          Array.isArray(payload.newlyAdded) ? payload.newlyAdded : [],
        );
        MODS = Array.isArray(payload.mods) ? payload.mods : [];
        EXCLUDED_MODS = Array.isArray(payload.excludedMods)
          ? payload.excludedMods
          : [];

        if (cacheNote) {
          cacheNote.textContent = EMBEDDED_PREVIEW_DATA
            ? "ローカルプレビュー用のサンプルデータを表示しています。"
            : "通信できないため、前回取得した対応情報を表示しています。";
          cacheNote.hidden = EMBEDDED_PREVIEW_DATA ? false : !fromCache;
        }
        applyReleaseMeta(payload);
        init();
      }

      // 取得済みデータをもとに、一覧表・検索/絞り込みUI・イベントを一度だけ構築する。
      function init() {
        ACTIVE_LOADER_CODES = Object.keys(LOADERS).filter((code) =>
          MODS.some((mod) =>
            VERSIONS.some((version) => (mod[version.key] || []).includes(code)),
          ),
        );
        HAS_UNSUPPORTED_CELLS = MODS.some((mod) =>
          VERSIONS.some((version) => !(mod[version.key] || []).length),
        );
        const reducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        );

        // 現在のように対応環境が1種類だけなら、意味のない絞り込み欄を自動で隠す。
        toolbarEl.classList.toggle(
          "single-profile",
          VERSIONS.length === 1 && ACTIVE_LOADER_CODES.length === 1,
        );

        // 「＋新着MODのみ」トグル。初回描画では幅を予約してCLSを防ぐ。
        // 新規追加がない場合は領域を維持したまま非表示にする。
        newOnlyToggle.classList.toggle(
          "is-pending",
          LATEST_RELEASE_ADDITIONS.size === 0,
        );
        newOnlyToggle.setAttribute("aria-pressed", "false");
        newOnlyToggle.setAttribute(
          "aria-label",
          LATEST_RELEASE + "で新規追加されたMODのみ表示する",
        );
        newOnlyLabel.textContent = LATEST_RELEASE + "で追加のみ";

        // ロゴは見出しと同じ内容を補助する装飾画像として扱う。
        crestMark.alt = "";
        crestMark.setAttribute("width", "30");
        crestMark.setAttribute("height", "30");
        crestMark.decoding = "async";

        function escapeMarkup(value) {
          return String(value).replace(
            /[&<>"']/g,
            (char) =>
              ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
              })[char],
          );
        }

        function escapeHTML(value) {
          // A2: エスケープ関数で表示名を書き換えない。ブランド正規化が要る箇所では
          // normalizeJtransBrand() を明示的に呼ぶ。
          return escapeMarkup(value);
        }

        function escapeURL(value) {
          return escapeMarkup(value);
        }

        function safeExternalURL(value) {
          try {
            const url = new URL(String(value || ""));
            return url.protocol === "https:" ? url.href : "";
          } catch (_) {
            return "";
          }
        }

        function normalizeText(value) {
          return String(value)
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
        }

        // 表示名はそのまま残し、索引・並び順だけ装飾的な接頭辞を無視する。
        // 例: "[TACZ] - Leaning" -> "Leaning"、"'Dustrial Decor" -> "Dustrial Decor"。
        // 数字は意味のある先頭文字として残すため、"3d-Skin-Layers" は数字・記号グループのまま。
        function indexName(name) {
          const trimmed = String(name).trim();
          const withoutBracketPrefix = trimmed.replace(/^(?:\[[^\]]*\]\s*)+/, "");
          const withoutDecorativePrefix = withoutBracketPrefix.replace(/^[\p{P}\p{S}\s]+/u, "");
          return withoutDecorativePrefix || withoutBracketPrefix || trimmed;
        }

        function initialKey(name) {
          const indexed = indexName(name);
          const first = indexed.charAt(0);
          const upper = first.toUpperCase();
          if (/^[A-Z]$/.test(upper)) return upper;
          if (/\p{Script=Han}/u.test(first)) return "漢";
          return "#";
        }

        function anchorId(initial) {
          if (initial === "#") return "mod-other";
          if (initial === "漢") return "mod-han";
          return "mod-" + initial.toLowerCase();
        }

        const INITIAL_ORDER = ALPHABET.reduce((map, key, index) => {
          map[key] = index;
          return map;
        }, {});

        // A3: 比較のたびに生成せず、1度だけ作って使い回す。
        const EN_COLLATOR = new Intl.Collator("en", {
          sensitivity: "base",
          numeric: true,
        });
        const HAN_COLLATOR = new Intl.Collator("zh-Hans-u-co-pinyin", {
          sensitivity: "base",
          numeric: true,
        });

        function compareMods(a, b) {
          const initialA = initialKey(a.name);
          const initialB = initialKey(b.name);
          const orderA = Object.prototype.hasOwnProperty.call(INITIAL_ORDER, initialA)
            ? INITIAL_ORDER[initialA]
            : INITIAL_ORDER["#"];
          const orderB = Object.prototype.hasOwnProperty.call(INITIAL_ORDER, initialB)
            ? INITIAL_ORDER[initialB]
            : INITIAL_ORDER["#"];
          if (orderA !== orderB) return orderA - orderB;

          const locale = initialA === "漢" ? "zh-Hans-u-co-pinyin" : "en";
          return indexName(a.name).localeCompare(indexName(b.name), locale, {
            sensitivity: "base",
            numeric: true,
          });
        }

        function supportSummary(codes) {
          const supported = new Set(codes || []);
          const labels = ACTIVE_LOADER_CODES.filter((code) =>
            supported.has(code),
          ).map((code) => LOADERS[code].label);
          return labels.length ? labels.join("、") + "対応" : "対応なし";
        }

        function safeColor(value, fallback) {
          return /^#[0-9a-fA-F]{6}$/.test(String(value || ""))
            ? String(value)
            : fallback;
        }

        function badgeHTML(codes) {
          const supported = new Set(codes || []);
          const badges = ACTIVE_LOADER_CODES.filter((code) =>
            supported.has(code),
          ).map((code) => {
            const loader = LOADERS[code];
            const style =
              "--loader-color:" +
              safeColor(loader.color, "#444444") +
              ";--loader-text:" +
              safeColor(loader.textColor, "#FFFFFF") +
              ";";
            return (
              '<span class="loader-badge on" style="' +
              style +
              '" title="' +
              escapeHTML(loader.label) +
              '対応" aria-hidden="true">' +
              escapeHTML(loader.label) +
              "</span>"
            );
          });
          return badges.length
            ? badges.join("")
            : '<span class="no-support" aria-hidden="true">—</span>';
        }

        function translationModesFor(mod) {
          const values = new Set();
          Object.values(mod.translationMode || {}).forEach((modes) => {
            if (!Array.isArray(modes)) return;
            modes.forEach((mode) => values.add(mode));
          });
          return Array.from(values);
        }

        function sourceProvidersFor(mod) {
          const source = mod.source || {};
          return ["curseforge", "modrinth", "maven"].filter((provider) => source[provider]);
        }

        function modeChipHTML(mode) {
          const label = mode === "hardcoded" ? "ハードコード" : mode === "lang" ? "言語ファイル" : mode;
          return '<span class="data-chip ' +
            (mode === "hardcoded" ? "hardcoded" : "") +
            '">' + escapeHTML(label) + "</span>";
        }

        function targetSummary(targets) {
          if (!targets || typeof targets !== "object") return "";
          return VERSIONS.map((version) => {
            const codes = targets[version.key];
            if (!Array.isArray(codes) || !codes.length) return null;
            return version.label + "：" + codes.map((code) => LOADERS[code]?.label || code).join("・");
          }).filter(Boolean).join(" / ");
        }

        function sourceEntriesHTML(mod) {
          const source = mod.source || {};
          const entries = [];
          const cf = source.curseforge;
          if (cf) {
            const projects = Array.isArray(cf.projects)
              ? cf.projects
              : cf.projectId != null
                ? [{ projectId: cf.projectId }]
                : [];
            projects.forEach((project) => {
              const id = project.projectId;
              const target = targetSummary(project.targets);
              const projectURL = "https://www.curseforge.com/projects/" + encodeURIComponent(id);
              entries.push(
                '<div class="source-entry"><div class="source-entry-main"><strong>CurseForge</strong><small>' +
                  escapeHTML([target, "ID " + id].filter(Boolean).join(" · ")) +
                  "</small>" +
                  '</div><a class="source-link" href="' + projectURL + '" target="_blank" rel="noopener noreferrer">開く ↗</a></div>',
              );
            });
          }
          const mr = source.modrinth;
          if (mr && mr.projectId) {
            const id = mr.projectId;
            entries.push(
              '<div class="source-entry"><div class="source-entry-main"><strong>Modrinth</strong><small>ID ' +
                escapeHTML(id) +
                '</small></div><a class="source-link" href="https://modrinth.com/mod/' +
                encodeURIComponent(id) +
                '" target="_blank" rel="noopener noreferrer">開く ↗</a></div>',
            );
          }
          const maven = source.maven;
          if (maven && typeof maven === "object") {
            const repository = safeExternalURL(maven.repository);
            const modules = Array.isArray(maven.modules) ? maven.modules : [];
            modules.forEach((module) => {
              const coordinate = [module.groupId, module.artifactId].filter(Boolean).join(":") || "Mavenアーティファクト";
              const target = targetSummary(module.targets);
              entries.push(
                '<div class="source-entry"><div class="source-entry-main"><strong>公式配布元 · ' +
                  escapeHTML(coordinate) +
                  "</strong>" +
                  (target ? "<small>" + escapeHTML(target) + "</small>" : "") +
                  '</div>' +
                  (repository
                    ? '<a class="source-link" href="' + escapeURL(repository) + '" target="_blank" rel="noopener noreferrer">リポジトリを開く ↗</a>'
                    : "") +
                  "</div>",
              );
            });
            if (!modules.length && repository) {
              entries.push(
                '<div class="source-entry"><div class="source-entry-main"><strong>公式配布元</strong></div>' +
                  '<a class="source-link" href="' + escapeURL(repository) + '" target="_blank" rel="noopener noreferrer">リポジトリを開く ↗</a></div>',
              );
            }
          }
          return entries.length
            ? '<div class="source-list">' + entries.join("") + "</div>"
            : '<p class="detail-empty">出典は公開データに記録されていません。</p>';
        }

        function versionResourceHTML(mod, version, hasSupport) {
          const keyCount = hasSupport ? checkerVersionKeyCount(mod, version.key) : null;
          const namespaces = Array.isArray(mod.namespacesByVersion?.[version.key])
            ? mod.namespacesByVersion[version.key]
            : hasSupport && Array.isArray(mod.namespaces)
              ? mod.namespaces
              : [];
          if (keyCount == null && !namespaces.length) return "";
          const lines = [];
          if (keyCount != null) {
            lines.push(
              '<div class="detail-version-resource-line"><strong>翻訳項目</strong> ' +
                escapeHTML(keyCount.toLocaleString("ja-JP")) +
                "</div>",
            );
          }
          if (namespaces.length) {
            lines.push(
              '<div class="detail-version-resource-line"><strong>namespace</strong> <span class="namespace-list">' +
                namespaces.map((ns) => '<code class="namespace-chip">' + escapeHTML(ns) + "</code>").join("") +
                "</span></div>",
            );
          }
          return '<div class="detail-version-resource">' + lines.join("") + "</div>";
        }

        function supportDetailsHTML(mod) {
          const blocks = VERSIONS.map((version) => {
            const codes = Array.isArray(mod[version.key]) ? mod[version.key] : [];
            const modes = Array.isArray(mod.translationMode?.[version.key])
              ? mod.translationMode[version.key]
              : [];
            if (!codes.length) return null;
            const resource = versionResourceHTML(mod, version, true);
            const badges = badgeHTML(codes);
            const modeBadges = modes.length
              ? modes.map(modeChipHTML).join("")
              : '<span class="data-chip">方式未記録</span>';
            return '<div class="detail-support-item"><span class="detail-version">' +
              escapeHTML(version.label) +
              '</span><div class="detail-support-body">' + badges + modeBadges + "</div>" + resource + "</div>";
          }).filter(Boolean);
          return blocks.length
            ? '<div class="detail-support-list">' + blocks.join("") + "</div>"
            : '<p class="detail-empty">対応環境の詳細は記録されていません。</p>';
        }

        function entryTypeLabel(mod) {
          if (mod.entryType === "component") return "コンポーネント";
          if (mod.entryType === "resource_group") return "リソースグループ";
          return "MOD";
        }

        function provenanceHTML(mod) {
          const p = mod.provenance;
          if (!p || typeof p !== "object") return "";
          const rows = [];
          const add = (label, value) => {
            if (value == null || value === "") return;
            rows.push('<div class="provenance-line"><dt>' + escapeHTML(label) + '</dt><dd>' + escapeHTML(value) + '</dd></div>');
          };
          add("種類", p.kind);
          add("コンポーネント", p.componentId);
          add("配布形態", p.distributionMode || p.distributionNote);
          add("親データ", p.parentRowId);
          add("配布物の識別状態", p.artifactIdentityStatus);
          add("識別の確度", p.identityConfidence);
          if (p.parentDistribution && typeof p.parentDistribution === "object") {
            const pd = p.parentDistribution;
            const bits = [pd.name, pd.type].filter(Boolean);
            if (pd.curseforge?.projectId != null) bits.push("CurseForge " + pd.curseforge.projectId);
            const target = targetSummary(pd.targets);
            if (target) bits.push(target);
            add("親配布物", bits.join(" / "));
          }
          add("リポジトリ", p.sourceRepository);
          const note = p.note ? '<p class="provenance-note">' + escapeHTML(p.note) + "</p>" : "";
          return rows.length || note
            ? '<div class="detail-block"><p class="detail-title">由来情報</p><dl class="provenance-card">' + rows.join("") + "</dl>" + note + "</div>"
            : "";
        }

        function modDetailHTML(mod) {
          const notes = Array.isArray(mod.notes) && mod.notes.length
            ? '<div class="detail-block"><p class="detail-title">メモ</p><ul class="notes-list">' + mod.notes.map((note) => "<li>" + escapeHTML(note) + "</li>").join("") + "</ul></div>"
            : "";
          return '<div class="mod-detail-card"><div class="mod-detail-grid">' +
            '<div><div class="detail-block"><p class="detail-title">対応環境 / 翻訳方式</p>' + supportDetailsHTML(mod) + "</div>" +
            notes + provenanceHTML(mod) + "</div>" +
            // 翻訳項目とnamespaceは左の対応環境に出ているので、ここには重ねない。
            '<div><div class="detail-block"><p class="detail-title">詳細情報</p><dl class="detail-kv">' +
            (mod.entryType ? '<dt>種別</dt><dd><span class="data-chip component">' + escapeHTML(entryTypeLabel(mod)) + "</span></dd>" : "") +
            '<dt>内部ID</dt><dd><code>' + escapeHTML(mod.id || "-") + "</code></dd>" +
            (mod.addedIn ? '<dt>jtransに追加</dt><dd>v' + escapeHTML(mod.addedIn) + "</dd>" : "") +
            '</dl></div><div class="detail-block"><p class="detail-title">配布元</p>' + sourceEntriesHTML(mod) + "</div></div>" +
            "</div></div>";
        }

        // 文字見出しが分断されないよう、JSON側の並びに依存せずここで整列する。
        // A-Z、数字・記号、漢字を別グループとしてまとめてから、その中で並び替える。
        //
        // A3: compareMods は比較のたびに indexName()/initialKey() を呼び直し、
        // localeCompare もその場で生成するため、2,894件で約62.8msかかっていた。
        // ソートキーを1件につき1回だけ作り、Collator を使い回すと約4.5msになる。
        {
          const keyed = MODS.map((mod) => {
            const initial = initialKey(mod.name);
            return {
              mod,
              sortName: indexName(mod.name),
              order: Object.prototype.hasOwnProperty.call(INITIAL_ORDER, initial)
                ? INITIAL_ORDER[initial]
                : INITIAL_ORDER["#"],
              han: initial === "漢",
            };
          });
          keyed.sort((a, b) =>
            a.order !== b.order
              ? a.order - b.order
              : (a.han ? HAN_COLLATOR : EN_COLLATOR).compare(a.sortName, b.sortName),
          );
          MODS = keyed.map((entry) => entry.mod);
        }

        // 全件で先に必要なのは絞り込み用の索引だけにする。一覧行HTMLは表示する
        // ページで初めて生成・キャッシュし、初期化直後の長時間タスクを避ける。
        MODS.forEach((mod, modIndex) => {
          const searchSource = [
            mod.name,
            indexName(mod.name),
            mod.id || "",
            mod.entryType || "",
            mod.provenance?.kind || "",
            mod.provenance?.componentId || "",
            mod.provenance?.parentRowId || "",
            mod.provenance?.note || "",
            ...(Array.isArray(mod.aliases) ? mod.aliases : []),
            ...(Array.isArray(mod.namespaces) ? mod.namespaces : []),
            ...Object.values(mod.namespacesByVersion || {}).flatMap((list) => Array.isArray(list) ? list : []),
            ...(Array.isArray(mod.notes) ? mod.notes : []),
            ...(Array.isArray(mod.source?.maven?.modules)
              ? mod.source.maven.modules.flatMap((module) => [module.groupId || "", module.artifactId || ""])
              : []),
          ];
          mod.searchKey = normalizeText(searchSource.join(" "));
          mod.modeSet = new Set(translationModesFor(mod));
          mod.sourceSet = new Set(sourceProvidersFor(mod));
          mod.resultIndex = modIndex;
          mod.rowCells = "";
          mod.detailHTML = "";
        });

        function checkerVersionKeyCount(mod, versionKey) {
          if (Number.isFinite(mod.translationKeysByVersion?.[versionKey])) {
            return mod.translationKeysByVersion[versionKey];
          }
          // translationKeys は全版共通値のことがある。複数版対応MODでは
          // 版別の値として流用せず、誤認を避ける。
          const supportedVersionKeys = VERSIONS.filter((version) =>
            Array.isArray(mod[version.key]) &&
            mod[version.key].some((code) => ACTIVE_LOADER_CODES.includes(code))
          ).map((version) => version.key);
          if (
            supportedVersionKeys.length === 1 &&
            supportedVersionKeys[0] === versionKey &&
            Number.isFinite(mod.translationKeys)
          ) {
            return mod.translationKeys;
          }
          return null;
        }

        /* ---- 「あなたの環境」ピッカー（2026-10-22） ----
           対応バージョンが増えても表の横幅が変わらないよう、バージョンごとの列をやめて
           「対応環境」1列にする。環境（バージョン／ローダー）を選ぶと、その環境の
           対応可否だけを表示する。状態の本体は既存の versionFilter / loaderFilter で、
           URL（?mc= / ?loader=）・絞り込みチップ・解除ボタンはそのまま連動する。 */
        const ENV_STORAGE_KEY = "jtrans.env.v1";

        function profileKey() {
          return versionFilter.value + "|" + loaderFilter.value;
        }

        function loaderSlug(code) {
          return String(LOADERS[code]?.label || code).toLowerCase();
        }

        function modeLabelText(modes) {
          return (modes || [])
            .map((mode) =>
              mode === "hardcoded" ? "ハードコード" : mode === "lang" ? "言語ファイル" : mode,
            )
            .join("+");
        }

        function supportedCodes(mod, versionKey) {
          const codes = new Set(mod[versionKey] || []);
          return ACTIVE_LOADER_CODES.filter((code) => codes.has(code));
        }

        function envBadgeHTML(code, dim) {
          const loader = LOADERS[code];
          return (
            '<span class="loader-badge on' +
            (dim ? " is-dim" : "") +
            '" data-loader="' +
            escapeHTML(loaderSlug(code)) +
            '" style="--loader-color:' +
            safeColor(loader.color, "#444444") +
            ";--loader-text:" +
            safeColor(loader.textColor, "#FFFFFF") +
            ';" aria-hidden="true">' +
            escapeHTML(loader.label) +
            "</span>"
          );
        }

        // 環境を選んだとき：その環境での対応だけを1セルで示す。
        // 環境未指定のとき：対応しているバージョンだけを「1.20.1 ●●」の形で並べる。
        function envCellHTML(mod) {
          const versionKey = versionFilter.value;
          const loaderCode = loaderFilter.value;
          if (versionKey) {
            const version = VERSIONS.find((entry) => entry.key === versionKey);
            const codes = supportedCodes(mod, versionKey);
            const modes = modeLabelText(mod.translationMode?.[versionKey]);
            const label =
              "Minecraft " +
              (version ? version.label : "") +
              (loaderCode ? "・" + LOADERS[loaderCode].label : "") +
              "：対応（" +
              codes.map((code) => LOADERS[code].label).join("、") +
              (modes ? "／" + modes : "") +
              "）";
            return (
              '<td class="ver env-cell is-profile" role="cell" aria-label="' +
              escapeHTML(label) +
              '"><span class="env-ok" aria-hidden="true">対応</span>' +
              codes.map((code) => envBadgeHTML(code, loaderCode && code !== loaderCode)).join("") +
              (modes ? '<span class="env-mode" aria-hidden="true">' + escapeHTML(modes) + "</span>" : "") +
              "</td>"
            );
          }

          const versions = VERSIONS.filter((version) => supportedCodes(mod, version.key).length);
          if (!versions.length) {
            return '<td class="ver env-cell" role="cell"><span class="no-support">—</span></td>';
          }
          return (
            '<td class="ver env-cell" role="cell" aria-label="' +
            escapeHTML(
              versions.map((version) => version.label + "：" + supportSummary(mod[version.key])).join("、"),
            ) +
            '">' +
            versions
              .map((version) => {
                const codes = supportedCodes(mod, version.key);
                const dim = loaderCode && !codes.includes(loaderCode);
                return (
                  '<span class="ver-chip' +
                  (dim ? " is-dim" : "") +
                  '" title="' +
                  escapeHTML(version.label + "：" + supportSummary(mod[version.key])) +
                  '" aria-hidden="true"><b>' +
                  escapeHTML(version.label) +
                  "</b>" +
                  codes
                    .map((code) => '<i class="ver-dot" data-loader="' + escapeHTML(loaderSlug(code)) + '"></i>')
                    .join("") +
                  "</span>"
                );
              })
              .join("") +
            "</td>"
          );
        }

        function renderEnvHead() {
          const version = VERSIONS.find((entry) => entry.key === versionFilter.value);
          const loader = LOADERS[loaderFilter.value];
          let th = headRow.querySelector("th.ver");
          if (!th) {
            th = document.createElement("th");
            th.className = "ver";
            th.scope = "col";
            th.setAttribute("role", "columnheader");
            headRow.appendChild(th);
          }
          th.textContent = version
            ? "Minecraft " + version.label + (loader ? " · " + loader.label : "")
            : "対応環境";
          document.body.classList.toggle("env-profile-active", Boolean(version));
        }

        // 件数は他の絞り込み（検索語・方式など）に関係なく、環境だけで数える。
        const envCountCache = new Map();
        function envModCount(versionKey, loaderCode) {
          const key = versionKey + "|" + loaderCode;
          if (envCountCache.has(key)) return envCountCache.get(key);
          let count = 0;
          for (const mod of MODS) {
            const supported = versionKey
              ? supportedCodes(mod, versionKey)
              : VERSIONS.flatMap((version) => supportedCodes(mod, version.key));
            if (loaderCode ? supported.includes(loaderCode) : supported.length) count += 1;
          }
          envCountCache.set(key, count);
          return count;
        }

        function envOptionHTML(kind, value, label, count, pressed, disabled) {
          return (
            '<button type="button" class="env-option' +
            (kind === "loader" && value ? " is-loader" : "") +
            (value ? "" : " is-none") +
            '" data-env-' +
            kind +
            '="' +
            escapeHTML(value) +
            '"' +
            (kind === "loader" && value ? ' data-loader="' + escapeHTML(loaderSlug(value)) + '"' : "") +
            ' aria-pressed="' +
            String(pressed) +
            '"' +
            (disabled ? " disabled" : "") +
            "><span>" +
            escapeHTML(label) +
            "</span>" +
            (count == null ? "" : "<small>" + count.toLocaleString("ja-JP") + "</small>") +
            "</button>"
          );
        }

        let lastEnvRenderKey = null;
        function renderEnvPicker() {
          if (!envPicker) return;
          const key = profileKey();
          if (key === lastEnvRenderKey) return;
          // ピッカー・チップの×・解除ボタンのどれで変わっても、最後の環境を覚える。
          // 初回描画（URLか保存値から復元した直後）は保存しない。
          if (lastEnvRenderKey) rememberEnv();
          lastEnvRenderKey = key;
          envPicker.hidden = false;

          const versionKey = versionFilter.value;
          const loaderCode = loaderFilter.value;
          const version = VERSIONS.find((entry) => entry.key === versionKey);

          envVersionOptions.innerHTML =
            envOptionHTML("version", "", "指定なし", null, !versionKey, false) +
            VERSIONS.map((entry) =>
              envOptionHTML("version", entry.key, entry.label, envModCount(entry.key, ""), entry.key === versionKey, false),
            ).join("");

          envLoaderOptions.innerHTML =
            envOptionHTML("loader", "", "指定なし", null, !loaderCode, false) +
            ACTIVE_LOADER_CODES.map((code) => {
              const count = envModCount(versionKey, code);
              return envOptionHTML("loader", code, LOADERS[code].label, count, code === loaderCode, count === 0);
            }).join("");

          if (!versionKey && !loaderCode) {
            envSummary.textContent =
              "遊んでいるMinecraftのバージョンとローダーを選ぶと、その環境で使える翻訳だけを表示します。";
            return;
          }
          let html =
            "<strong>" +
            escapeHTML(
              (version ? "Minecraft " + version.label : "全バージョン") +
                (loaderCode ? " + " + LOADERS[loaderCode].label : ""),
            ) +
            "</strong> で使える翻訳：<strong>" +
            envModCount(versionKey, loaderCode).toLocaleString("ja-JP") +
            "件</strong>" +
            (versionKey ? "" : "（バージョンも選ぶと表示がすっきりします）") +
            '<button type="button" class="env-clear" data-env-clear>環境の指定を解除</button>';
          if (version?.coverage === "partial") {
            html +=
              '<span class="env-partial">このバージョンは、人気上位MODの日本語が足りない部分を補う範囲での対応です。一覧にないMODは翻訳されません。</span>';
          }
          envSummary.innerHTML = html;
        }

        function rememberEnv() {
          try {
            localStorage.setItem(
              ENV_STORAGE_KEY,
              JSON.stringify({
                mc: VERSIONS.find((entry) => entry.key === versionFilter.value)?.label || "",
                loader: LOADERS[loaderFilter.value]?.label || "",
              }),
            );
          } catch (_) {}
        }

        // URLに環境の指定が無いときだけ、前回選んだ環境を戻す。
        function restoreRememberedEnv() {
          const params = new URLSearchParams(window.location.search);
          if (params.has("mc") || params.has("loader")) return;
          try {
            const saved = JSON.parse(localStorage.getItem(ENV_STORAGE_KEY) || "null");
            if (!saved) return;
            const version = VERSIONS.find((entry) => entry.label === saved.mc);
            const code = Object.keys(LOADERS).find((key) => LOADERS[key].label === saved.loader);
            if (version) versionFilter.value = version.key;
            if (code && ACTIVE_LOADER_CODES.includes(code)) loaderFilter.value = code;
          } catch (_) {}
        }

        function setEnv(versionKey, loaderCode) {
          if (versionKey && loaderCode && !envModCount(versionKey, loaderCode)) loaderCode = "";
          versionFilter.value = versionKey;
          loaderFilter.value = loaderCode;
          versionFilter.dispatchEvent(new Event("change"));
        }

        envPicker?.addEventListener("click", (event) => {
          const button = event.target.closest("button");
          if (!button || button.disabled) return;
          if (button.hasAttribute("data-env-clear")) setEnv("", "");
          else if (button.hasAttribute("data-env-version"))
            setEnv(button.getAttribute("data-env-version"), loaderFilter.value);
          else if (button.hasAttribute("data-env-loader"))
            setEnv(versionFilter.value, button.getAttribute("data-env-loader"));
        });

        function rowCellsHTML(mod) {
          if (mod.rowCells && mod.rowCellsKey === profileKey()) return mod.rowCells;
          mod.rowCellsKey = profileKey();
          const releaseBadge = LATEST_RELEASE_ADDITIONS.has(mod.name)
            ? '<span class="release-added-badge" title="' +
              escapeHTML(LATEST_RELEASE) +
              'で追加" aria-label="' +
              escapeHTML(LATEST_RELEASE) +
              'で追加">新着</span>'
            : "";
          const inlineSummary = [
            Array.from(mod.modeSet)
              .map((mode) =>
                mode === "hardcoded"
                  ? "ハードコード"
                  : mode === "lang"
                    ? "言語ファイル"
                    : mode,
              )
              .join("+"),
            Array.from(mod.sourceSet)
              .map((provider) =>
                provider === "curseforge"
                  ? "CurseForge"
                  : provider === "modrinth"
                    ? "Modrinth"
                    : "Maven",
              )
              .join("+"),
            mod.entryType ? entryTypeLabel(mod) : "",
            Number.isFinite(mod.translationKeys)
              ? mod.translationKeys.toLocaleString("ja-JP") + " 件"
              : "",
          ]
            .filter(Boolean)
            .join(" · ");
          mod.rowCells =
            '<td class="name" role="cell"><button class="mod-toggle" type="button" aria-expanded="false">' +
            escapeHTML(mod.name) +
            "</button>" +
            releaseBadge +
            '<a class="mod-inline-meta" href="/mods/' +
            encodeURIComponent(mod.id || "") +
            '" data-meta="' +
            escapeHTML(inlineSummary) +
            '" aria-label="' +
            escapeHTML((inlineSummary ? inlineSummary + " · " : "") + mod.name + " の個別ページ") +
            '"></a></td>' +
            envCellHTML(mod);
          return mod.rowCells;
        }
        EXCLUDED_MODS.forEach((mod) => {
          mod.searchKey = normalizeText(mod.name || "");
        });

        // フィルターと凡例は定義と実データから自動生成する。表見出しは renderEnvHead()。
        VERSIONS.forEach((version) => {
          const option = document.createElement("option");
          option.value = version.key;
          option.textContent = version.label;
          versionFilter.appendChild(option);
        });

        ACTIVE_LOADER_CODES.forEach((code) => {
          const option = document.createElement("option");
          option.value = code;
          option.textContent = LOADERS[code].label;
          loaderFilter.appendChild(option);
        });

        legend.innerHTML =
          ACTIVE_LOADER_CODES.map((code) => {
            const loader = LOADERS[code];
            const style =
              "--loader-color:" +
              safeColor(loader.color, "#444444") +
              ";--loader-text:" +
              safeColor(loader.textColor, "#FFFFFF") +
              ";";
            return (
              '<span><i class="loader-badge on" style="' +
              style +
              '" aria-hidden="true">' +
              escapeHTML(loader.label) +
              "</i></span>"
            );
          }).join("");

        alphabetLinks.innerHTML = ALPHABET.map((initial) => {
          const label =
            initial === "#"
              ? "数字・記号から始まるMOD"
              : initial === "漢"
                ? "漢字で始まるMOD"
                : initial + "から始まるMOD";
          return (
            '<a class="alphabet-link" href="#' +
            anchorId(initial) +
            '" data-initial="' +
            initial +
            '" aria-label="' +
            label +
            '">' +
            initial +
            "</a>"
          );
        }).join("");

        statCount.textContent = (EMBEDDED_PREVIEW_TOTAL || MODS.length).toLocaleString("ja-JP");

        // 検索用データは全件保持しつつ、DOMには現在位置の前後だけを置く。
        // これでページ送りなしに全件を連続閲覧でき、通過済みの大量行はDOMから外れる。
        let visibleDividers = [];
        let currentFilteredMods = [];
        let virtualStart = 0;
        let virtualEnd = 0;
        let virtualTopHeight = 0;
        let virtualLastScrollY = window.scrollY;
        let virtualScrollFrame = 0;
        const virtualChunkHeights = new Map();

        function resetVirtualWindow(list, targetIndex = 0) {
          virtualChunkHeights.clear();
          virtualTopHeight = 0;
          if (!list.length) {
            virtualStart = 0;
            virtualEnd = 0;
            return;
          }
          const targetChunk = Math.floor(Math.max(0, targetIndex) / VIRTUAL_CHUNK_SIZE);
          virtualStart = targetIndex > 0
            ? Math.max(0, (targetChunk - 1) * VIRTUAL_CHUNK_SIZE)
            : 0;
          virtualEnd = Math.min(
            virtualStart + (targetIndex > 0 ? VIRTUAL_MAX_ROWS : VIRTUAL_INITIAL_ROWS),
            list.length,
          );
        }

        function dividerCountBefore(list, endExclusive) {
          const limit = Math.max(0, Math.min(endExclusive, list.length));
          let count = 0;
          let previousInitial = null;
          for (let i = 0; i < limit; i += 1) {
            const initial = initialKey(list[i].name);
            if (initial !== previousInitial) {
              count += 1;
              previousInitial = initial;
            }
          }
          return count;
        }

        function buildRows(list) {
          virtualStart = Math.max(0, Math.min(virtualStart, list.length));
          virtualEnd = Math.max(
            virtualStart,
            Math.min(virtualEnd || VIRTUAL_INITIAL_ROWS, list.length),
          );
          const pageMods = list.slice(virtualStart, virtualEnd);
          const rowMarkup = [];
          // aria-rowindex は未描画のMOD行と頭文字区切りも含む論理位置を示す。
          // これにより仮想化しても支援技術から全体の行位置が崩れない。
          let logicalRowIndex = 2 + virtualStart + dividerCountBefore(list, virtualStart);
          // 仮想ウィンドウ先頭が同じ頭文字の途中なら、不要な区切りを増やさない。
          let currentInitial =
            virtualStart > 0 ? initialKey(list[virtualStart - 1].name) : null;

          if (virtualTopHeight > 0) {
            rowMarkup.push(
              '<tr class="virtual-spacer virtual-spacer-top" aria-hidden="true"><td colspan="' +
                2 +
                '" style="height:' +
                Math.max(0, Math.round(virtualTopHeight)) +
                'px"></td></tr>',
            );
          }

          pageMods.forEach((mod, offset) => {
            const listIndex = virtualStart + offset;
            const initial = initialKey(mod.name);
            if (currentInitial !== initial) {
              const dividerLabel =
                initial === "#"
                  ? "数字・記号"
                  : initial === "漢"
                    ? "漢字"
                    : initial;
              rowMarkup.push(
                '<tr class="letter-divider" id="' +
                  escapeHTML(anchorId(initial)) +
                  '" data-initial="' +
                  escapeHTML(initial) +
                  '" role="row" aria-rowindex="' +
                  logicalRowIndex +
                  '"><th colspan="' +
                  2 +
                  '" scope="rowgroup" role="rowheader">' +
                  escapeHTML(dividerLabel) +
                  "</th></tr>",
              );
              currentInitial = initial;
              logicalRowIndex += 1;
            }

            rowMarkup.push(
              '<tr class="mod-row" role="row" data-mod-index="' +
                mod.resultIndex +
                '" data-virtual-position="' +
                listIndex +
                '" aria-rowindex="' +
                logicalRowIndex +
                '">' +
                rowCellsHTML(mod) +
                "</tr>",
            );
            logicalRowIndex += 1;
          });

          if (virtualEnd < list.length) {
            rowMarkup.push(
              '<tr class="virtual-load-sentinel" aria-hidden="true"><td colspan="' +
                2 +
                '"><span>スクロールで続きを表示</span></td></tr>',
            );
          }

          tbody.innerHTML = rowMarkup.join("");
          if (modDirectoryTable) {
            const totalDividerRows = dividerCountBefore(list, list.length);
            modDirectoryTable.setAttribute("aria-rowcount", String(1 + list.length + totalDividerRows));
          }
          visibleDividers = Array.from(tbody.querySelectorAll(".letter-divider"));
          updateVirtualListStatus(list);
          return { start: virtualStart, end: virtualEnd };
        }

        function updateVirtualListStatus(list) {
          if (!virtualListStatus) return;
          if (!list.length) {
            virtualListStatus.textContent = "";
            virtualListStatus.hidden = true;
            return;
          }
          virtualListStatus.hidden = false;
          virtualListStatus.textContent =
            virtualEnd >= list.length
              ? "末尾まで表示しました。ページ分割はありません。"
              : "ページ分割なしで全件を連続表示します。下へスクロールすると続きが読み込まれます。";
        }

        function measureLeadingChunkHeight() {
          const boundary = virtualStart + VIRTUAL_CHUNK_SIZE;
          let height = 0;
          let pendingDividerHeight = 0;

          // 実際に次のbuildRows()で捨てられる要素だけを加算する。
          // 境界ちょうどで頭文字が変わる場合、その新グループのdividerは
          // retained側で再生成されるため、先に高さへ足すと二重計上になる。
          for (const row of Array.from(tbody.children)) {
            if (row.classList.contains("virtual-spacer")) continue;
            if (row.classList.contains("virtual-load-sentinel")) break;

            if (row.classList.contains("letter-divider")) {
              pendingDividerHeight = row.getBoundingClientRect().height;
              continue;
            }

            if (row.classList.contains("mod-row")) {
              const position = Number(row.dataset.virtualPosition);
              if (position >= boundary) break;
              height += pendingDividerHeight;
              pendingDividerHeight = 0;
              height += row.getBoundingClientRect().height;
              continue;
            }

            height += row.getBoundingClientRect().height;
          }
          return height;
        }

        function closeVirtualizedDetail() {
          const expanded = tbody.querySelector(".mod-row.is-expanded");
          if (expanded) {
            expanded.classList.remove("is-expanded");
            expanded
              .querySelector(".mod-toggle")
              ?.setAttribute("aria-expanded", "false");
          }
          tbody.querySelectorAll(".detail-row").forEach((row) => row.remove());
        }

        function loadNextVirtualChunk() {
          if (virtualEnd >= currentFilteredMods.length) return false;
          closeVirtualizedDetail();

          const renderedCount = virtualEnd - virtualStart;
          if (renderedCount >= VIRTUAL_MAX_ROWS) {
            const removedHeight = measureLeadingChunkHeight();
            virtualChunkHeights.set(virtualStart, removedHeight);
            virtualTopHeight += removedHeight;
            virtualStart = Math.min(
              virtualStart + VIRTUAL_CHUNK_SIZE,
              currentFilteredMods.length,
            );
          }

          virtualEnd = Math.min(
            virtualEnd + VIRTUAL_CHUNK_SIZE,
            currentFilteredMods.length,
          );
          buildRows(currentFilteredMods);
          return true;
        }

        function loadPreviousVirtualChunk() {
          if (virtualStart <= 0) return false;
          closeVirtualizedDetail();
          const previousStart = Math.max(0, virtualStart - VIRTUAL_CHUNK_SIZE);
          const previousFirstMod = tbody.querySelector(".mod-row");
          const previousModIndex = previousFirstMod
            ? previousFirstMod.getAttribute("data-mod-index")
            : null;
          const beforeTop = previousFirstMod?.getBoundingClientRect().top ?? 0;
          const knownHeight = virtualChunkHeights.get(previousStart);

          virtualStart = previousStart;
          if (virtualEnd - virtualStart > VIRTUAL_MAX_ROWS) {
            virtualEnd = Math.max(virtualStart, virtualEnd - VIRTUAL_CHUNK_SIZE);
          }
          if (Number.isFinite(knownHeight)) {
            virtualTopHeight = Math.max(0, virtualTopHeight - knownHeight);
          }

          buildRows(currentFilteredMods);

          // リサイズ後などchunk実測値が失効している場合は、追加した50件を
          // 新しい幅でその場で測り直してtop spacerから差し引く。これをしないと
          // 上へ戻るたびに古いspacerが残り、最終的に先頭へ戻っても空白が残る。
          if (!Number.isFinite(knownHeight)) {
            const measuredHeight = measureLeadingChunkHeight();
            if (Number.isFinite(measuredHeight) && measuredHeight > 0) {
              virtualChunkHeights.set(previousStart, measuredHeight);
              virtualTopHeight = Math.max(0, virtualTopHeight - measuredHeight);
              buildRows(currentFilteredMods);
            }
          }

          // 索引ジャンプ直後など、まだ上側の実測高さがなかった場合でも
          // いま見ていた行が画面上で動かないように差分だけスクロール補正する。
          if (!Number.isFinite(knownHeight) && previousModIndex !== null) {
            const sameRow = tbody.querySelector(
              '.mod-row[data-mod-index="' + CSS.escape(previousModIndex) + '"]',
            );
            if (sameRow) {
              const afterTop = sameRow.getBoundingClientRect().top;
              window.scrollBy(0, afterTop - beforeTop);
            }
          }
          return true;
        }

        function updateVirtualWindowOnScroll() {
          virtualScrollFrame = 0;
          if (!currentFilteredMods.length) return;
          const currentY = window.scrollY;
          const movingDown = currentY >= virtualLastScrollY;
          virtualLastScrollY = currentY;

          if (movingDown) {
            const sentinel = tbody.querySelector(".virtual-load-sentinel");
            if (
              sentinel &&
              sentinel.getBoundingClientRect().top <
                window.innerHeight + VIRTUAL_LOAD_MARGIN
            ) {
              loadNextVirtualChunk();
            }
            return;
          }

          const firstMod = tbody.querySelector(".mod-row");
          if (
            virtualStart > 0 &&
            firstMod &&
            firstMod.getBoundingClientRect().top > -VIRTUAL_LOAD_MARGIN
          ) {
            loadPreviousVirtualChunk();
          }
        }

        function scheduleVirtualWindowUpdate() {
          if (virtualScrollFrame) return;
          virtualScrollFrame = requestAnimationFrame(updateVirtualWindowOnScroll);
        }

        let virtualLayoutWidth = Math.round(tbody.getBoundingClientRect().width);
        let virtualResizeFrame = 0;
        function refreshVirtualMetricsAfterResize() {
          virtualResizeFrame = 0;
          const nextWidth = Math.round(tbody.getBoundingClientRect().width);
          if (!nextWidth || nextWidth === virtualLayoutWidth || !currentFilteredMods.length) return;
          virtualLayoutWidth = nextWidth;

          // 幅変更後は過去chunkの実測値を再利用しない。
          virtualChunkHeights.clear();

          if (virtualStart <= 0) {
            virtualTopHeight = 0;
            buildRows(currentFilteredMods);
            return;
          }

          // 現在表示中の行高から先頭spacerを再推定し、
          // 同じ先頭行のviewport位置を合わせて急なジャンプを抑える。
          const anchor = tbody.querySelector(".mod-row");
          const anchorPosition = anchor ? Number(anchor.dataset.virtualPosition) : virtualStart;
          const beforeTop = anchor?.getBoundingClientRect().top ?? 0;
          const visibleModRows = Array.from(tbody.querySelectorAll(".mod-row"));
          const visibleDividersNow = Array.from(tbody.querySelectorAll(".letter-divider"));
          const avgRowHeight = visibleModRows.length
            ? visibleModRows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0) / visibleModRows.length
            : 0;
          const avgDividerHeight = visibleDividersNow.length
            ? visibleDividersNow.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0) / visibleDividersNow.length
            : 0;
          let dividerCountBefore = 0;
          let previousInitial = null;
          for (let i = 0; i < virtualStart; i += 1) {
            const initial = initialKey(currentFilteredMods[i].name);
            if (initial !== previousInitial) {
              dividerCountBefore += 1;
              previousInitial = initial;
            }
          }
          virtualTopHeight = Math.max(
            0,
            avgRowHeight * virtualStart + avgDividerHeight * dividerCountBefore,
          );
          buildRows(currentFilteredMods);

          const sameAnchor = tbody.querySelector(
            '.mod-row[data-virtual-position="' + CSS.escape(String(anchorPosition)) + '"]',
          );
          if (sameAnchor) {
            window.scrollBy(0, sameAnchor.getBoundingClientRect().top - beforeTop);
          }
        }

        window.addEventListener("resize", () => {
          if (virtualResizeFrame) cancelAnimationFrame(virtualResizeFrame);
          virtualResizeFrame = requestAnimationFrame(refreshVirtualMetricsAfterResize);
        });

        function jumpVirtualWindowToIndex(targetIndex) {
          resetVirtualWindow(currentFilteredMods, targetIndex);
          buildRows(currentFilteredMods);
        }

        function createDetailRow(mod, row) {
          const detailRow = document.createElement("tr");
          detailRow.className = "detail-row";
          detailRow.hidden = true;
          const detailCell = document.createElement("td");
          detailCell.colSpan = 2;
          if (!mod.detailHTML) mod.detailHTML = modDetailHTML(mod);
          detailCell.innerHTML = mod.detailHTML;
          detailRow.appendChild(detailCell);
          row.insertAdjacentElement("afterend", detailRow);
          return detailRow;
        }


        let alphabetNavigationList = null;
        function updateAlphabetNavigation(list) {
          // ページ送りでは絞り込み結果自体は変わらないため、全件の頭文字集合と
          // 各リンク属性を作り直さない。
          if (list === alphabetNavigationList) return;
          alphabetNavigationList = list;
          const available = new Set(list.map((mod) => initialKey(mod.name)));
          alphabetLinks.querySelectorAll(".alphabet-link").forEach((link) => {
            const initial = link.dataset.initial;
            if (available.has(initial)) {
              link.href = "#" + anchorId(initial);
              link.removeAttribute("aria-disabled");
              link.removeAttribute("tabindex");
            } else {
              link.removeAttribute("href");
              link.removeAttribute("aria-current");
              link.setAttribute("aria-disabled", "true");
              link.setAttribute("tabindex", "-1");
            }
          });
          scheduleAlphabetOverflowUpdate();
        }

        let alphabetOverflowFrame = 0;
        function updateAlphabetOverflow() {
          alphabetOverflowFrame = 0;
          const remaining =
            alphabetLinks.scrollWidth -
            alphabetLinks.clientWidth -
            alphabetLinks.scrollLeft;
          alphabetNav.classList.toggle("has-overflow-right", remaining > 2);
        }

        function scheduleAlphabetOverflowUpdate() {
          if (alphabetOverflowFrame) return;
          alphabetOverflowFrame = requestAnimationFrame(updateAlphabetOverflow);
        }

        function isNewOnly() {
          return newOnlyToggle.getAttribute("aria-pressed") === "true";
        }

        function restoreFilterStateFromURL() {
          restoreRememberedEnv();
          const params = new URLSearchParams(window.location.search);
          searchInput.value = params.get("q") || "";

          const mc = params.get("mc");
          if (mc) {
            const version = VERSIONS.find((item) => item.label === mc);
            if (version) versionFilter.value = version.key;
          }

          const loaderLabel = params.get("loader");
          if (loaderLabel) {
            const code = Object.keys(LOADERS).find(
              (item) => LOADERS[item].label === loaderLabel,
            );
            if (code && ACTIVE_LOADER_CODES.includes(code))
              loaderFilter.value = code;
          }

          const mode = params.get("mode");
          if (["lang", "hardcoded"].includes(mode)) modeFilter.value = mode;
          const source = params.get("source");
          if (["curseforge", "modrinth", "maven", "none"].includes(source))
            sourceFilter.value = source;

          if (params.get("new") === "1" && LATEST_RELEASE_ADDITIONS.size > 0) {
            newOnlyToggle.setAttribute("aria-pressed", "true");
          }
        }

        function syncFilterStateToURL() {
          const url = new URL(window.location.href);
          const query = searchInput.value.trim();
          const version = VERSIONS.find(
            (item) => item.key === versionFilter.value,
          );
          const loader = LOADERS[loaderFilter.value];
          const mode = modeFilter.value;
          const source = sourceFilter.value;

          if (query) url.searchParams.set("q", query);
          else url.searchParams.delete("q");
          if (version) url.searchParams.set("mc", version.label);
          else url.searchParams.delete("mc");
          if (loader) url.searchParams.set("loader", loader.label);
          else url.searchParams.delete("loader");
          if (mode) url.searchParams.set("mode", mode);
          else url.searchParams.delete("mode");
          if (source) url.searchParams.set("source", source);
          else url.searchParams.delete("source");
          if (isNewOnly()) url.searchParams.set("new", "1");
          else url.searchParams.delete("new");

          // 検索条件を共有・再読み込みしたときは、以前のセクションではなく結果位置を開く。
          if (query || version || loader || mode || source || isNewOnly()) {
            url.hash = "resultsStart";
          }

          if (window.location.protocol !== "file:") {
            window.history.replaceState(
              null,
              "",
              url.pathname + url.search + url.hash,
            );
          }
        }

        function renderExcludedMatches() {
          const query = normalizeText(searchInput.value.trim());
          if (!query) {
            excludedMatch.hidden = true;
            excludedMatch.innerHTML = "";
            return 0;
          }

          const matches = EXCLUDED_MODS.filter((mod) =>
            mod.searchKey.includes(query),
          );
          if (!matches.length) {
            excludedMatch.hidden = true;
            excludedMatch.innerHTML = "";
            return 0;
          }

          excludedMatch.innerHTML = matches
            .map((mod) => {
              // 理由は内部向けの記録なので、たたんでおく。
              return (
                '<details class="excluded-item"><summary><strong>' +
                escapeHTML(mod.name) +
                "</strong>は現在jtransの対象外です</summary>" +
                (mod.reason ? "<p>" + escapeHTML(mod.reason) + "</p>" : "") +
                "</details>"
              );
            })
            .join("");
          excludedMatch.hidden = false;
          return matches.length;
        }

        function activeFilterLabels() {
          const labels = [];
          const query = searchInput.value.trim();
          if (query) labels.push("検索「" + query + "」");
          if (versionFilter.value)
            labels.push(versionFilter.selectedOptions[0].textContent);
          if (loaderFilter.value)
            labels.push(loaderFilter.selectedOptions[0].textContent);
          if (modeFilter.value)
            labels.push("方式:" + modeFilter.selectedOptions[0].textContent);
          if (sourceFilter.value)
            labels.push("出典:" + sourceFilter.selectedOptions[0].textContent);
          if (isNewOnly()) labels.push(newOnlyLabel.textContent);
          return labels;
        }

        // 件数の読み上げは入力ごとに走らせず、手が止まってから一度だけ伝える。
        let announceTimer = 0;
        function announceCount(text) {
          if (!countLive) return;
          clearTimeout(announceTimer);
          announceTimer = setTimeout(() => {
            countLive.textContent = text;
          }, 600);
        }

        function render(list, resetWindow = true, targetIndex = 0) {
          const listChanged = currentFilteredMods !== list;
          currentFilteredMods = list;
          if (resetWindow || listChanged) resetVirtualWindow(list, targetIndex);
          const windowInfo = buildRows(list);

          const excludedCount = renderExcludedMatches();
          emptyMsg.hidden = list.length !== 0 || excludedCount > 0;

          const labels = activeFilterLabels();
          const range = list.length
            ? list.length.toLocaleString("ja-JP") + "件"
            : "0件";
          const summary =
            range +
            (list.length !== MODS.length
              ? "（全" + MODS.length.toLocaleString("ja-JP") + "件）"
              : "") +
            "";
          // 条件は検索欄・環境ピッカー・チップに見えているので、画面上は件数だけにする。
          // 読み上げでは条件も伝える。
          countLine.textContent = summary;
          announceCount(summary + (labels.length ? " — " + labels.join("・") : ""));

          updateAlphabetNavigation(list);
          scheduleActiveAlphabetUpdate();
          if (windowInfo.end < list.length) scheduleVirtualWindowUpdate();
        }

        function filteredMods() {
          const query = normalizeText(searchInput.value.trim());
          const versionKey = versionFilter.value;
          const loaderCode = loaderFilter.value;
          const mode = modeFilter.value;
          const source = sourceFilter.value;
          const onlyNew = isNewOnly();

          return MODS.filter((mod) => {
            if (query && !mod.searchKey.includes(query)) return false;
            if (onlyNew && !LATEST_RELEASE_ADDITIONS.has(mod.name))
              return false;
            if (mode) {
              if (versionKey) {
                const versionModes = Array.isArray(mod.translationMode?.[versionKey])
                  ? mod.translationMode[versionKey]
                  : [];
                if (!versionModes.includes(mode)) return false;
              } else if (!mod.modeSet.has(mode)) {
                return false;
              }
            }
            if (source === "none" && mod.sourceSet.size) return false;
            if (source && source !== "none" && !mod.sourceSet.has(source)) return false;
            if (versionKey && loaderCode)
              return (mod[versionKey] || []).includes(loaderCode);
            if (versionKey)
              return (mod[versionKey] || []).some((code) =>
                ACTIVE_LOADER_CODES.includes(code),
              );
            if (loaderCode)
              return VERSIONS.some((version) =>
                (mod[version.key] || []).includes(loaderCode),
              );
            return true;
          });
        }

        // 「絞り込み中」のチップ。前回と同じ内容なら作り直さない。
        let lastFilterChipKey = "";
        const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        function motionEnabled() {
          return (
            document.documentElement.classList.contains("jt-motion") &&
            !document.documentElement.classList.contains("jt-reduced") &&
            !reducedMotionQuery.matches
          );
        }

        function renderFilterChips(entries) {
          const animate = motionEnabled();
          const existing = new Map(
            [...activeFilterChips.querySelectorAll("button:not(.jt-chip-leaving)")].map(
              (chip) => [chip.dataset.filterId, chip],
            ),
          );
          const nextIds = new Set(entries.map(({ id }) => id));

          existing.forEach((chip, id) => {
            if (nextIds.has(id)) return;
            if (!animate) {
              chip.remove();
              return;
            }
            // 消えるチップは幅を0へ縮めてから外し、隣のチップを滑らかに詰める。
            const width = chip.getBoundingClientRect().width;
            const gap = parseFloat(getComputedStyle(activeFilters).columnGap) || 0;
            chip.disabled = true;
            chip.inert = true;
            chip.setAttribute("aria-hidden", "true");
            chip.classList.add("jt-chip-leaving");
            chip.getAnimations().forEach((animation) => animation.cancel());
            const leaving = chip.animate(
              [
                { opacity: 1, width: width + "px", minWidth: 0 },
                {
                  opacity: 0,
                  width: "0px",
                  minWidth: 0,
                  paddingInline: "0px",
                  borderInlineWidth: "0px",
                  marginInlineEnd: -gap + "px",
                },
              ],
              { duration: 160, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" },
            );
            const done = () => {
              chip.remove();
              activeFilters.hidden =
                !activeFilterEntries().length && !activeFilterChips.children.length;
            };
            leaving.finished.then(done, done);
          });

          entries.forEach(({ id, label }) => {
            let chip = existing.get(id);
            const isNew = !chip;
            if (!chip) {
              chip = document.createElement("button");
              chip.type = "button";
              chip.className = "active-filter-chip";
              chip.dataset.filterId = id;
              const text = document.createElement("span");
              const mark = document.createElement("span");
              mark.textContent = "×";
              mark.setAttribute("aria-hidden", "true");
              chip.append(text, mark);
            }
            chip.firstElementChild.textContent = label;
            chip.setAttribute("aria-label", label + " の絞り込みを解除");
            activeFilterChips.append(chip);
            if (isNew && animate) {
              chip.animate(
                [
                  { opacity: 0, transform: "translateY(3px) scale(.96)" },
                  { opacity: 1, transform: "none" },
                ],
                { duration: 180, easing: "cubic-bezier(.2,.7,.2,1)" },
              );
            }
          });

          activeFilters.hidden = !entries.length && !activeFilterChips.children.length;
        }

        function activeFilterEntries() {
          // バージョンとMODローダーは環境ピッカー側で選択状態が見えるので、チップには出さない。
          const entries = [
            [modeFilter, "翻訳方式"],
            [sourceFilter, "出典"],
          ]
            .filter(([control]) => control.value)
            .map(([control, name]) => ({
              id: control.id,
              label: name + ": " + control.selectedOptions[0].textContent,
            }));
          if (isNewOnly())
            entries.push({ id: "newOnlyToggle", label: newOnlyLabel.textContent });
          return entries;
        }

        function updateControlState() {
          renderEnvHead();
          renderEnvPicker();
          clearSearch.hidden = searchInput.value.length === 0;
          resetFilters.disabled =
            !searchInput.value &&
            !versionFilter.value &&
            !loaderFilter.value &&
            !modeFilter.value &&
            !sourceFilter.value &&
            !isNewOnly();
          const entries = activeFilterEntries();
          const activeFilterCount = entries.length;
          filterToggle.textContent = activeFilterCount
            ? "絞り込み " + activeFilterCount
            : "絞り込み";
          // 空状態のボタンは「その状況で意味のあるもの」だけを出す。
          const hasSearchText = searchInput.value.length > 0;
          const refinementCount =
            activeFilterCount + (versionFilter.value ? 1 : 0) + (loaderFilter.value ? 1 : 0);
          emptyClearSearch.hidden = !(hasSearchText && refinementCount === 0);
          emptyClearRefinements.hidden = !(hasSearchText && refinementCount > 0);
          emptyResetFilters.hidden = hasSearchText && refinementCount === 0;
          const chipKey = JSON.stringify(entries);
          if (chipKey !== lastFilterChipKey) {
            lastFilterChipKey = chipKey;
            renderFilterChips(entries);
          }
        }

        let repositionFrame = 0;
        function applyFilters(reposition = false, syncURL = true, animateRows = false) {
          render(filteredMods(), true);
          if (animateRows && motionEnabled()) {
            [...tbody.querySelectorAll(".mod-row")].slice(0, 6).forEach((row, index) => {
              row.classList.add("jt-filter-enter");
              row.style.setProperty("--jt-filter-order", index);
            });
          }
          updateControlState();
          if (syncURL) syncFilterStateToURL();
          if (reposition && window.scrollY > resultsStart.offsetTop) {
            if (repositionFrame) cancelAnimationFrame(repositionFrame);
            repositionFrame = requestAnimationFrame(() => {
              repositionFrame = 0;
              resultsStart.scrollIntoView({ behavior: "auto", block: "start" });
            });
          }
        }

        // クリックやキー入力のイベント内では重いDOM置換を行わず、まずブラウザに
        // 操作フィードバックを描画させる。続けて操作された場合は最新の処理だけを実行する。
        let deferredInteractionToken = 0;
        function deferInteractionWork(work) {
          const token = ++deferredInteractionToken;
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (token !== deferredInteractionToken) return;
              work();
            }, 0);
          });
        }

        function scheduleApplyFilters(reposition = false) {
          updateControlState();
          deferInteractionWork(() => applyFilters(reposition, true, true));
        }

        let activeInitial = null;
        function setActiveAlphabet(initial) {
          if (initial === activeInitial) return;
          activeInitial = initial;
          let activeLink = null;

          alphabetLinks.querySelectorAll(".alphabet-link").forEach((link) => {
            const isActive =
              link.dataset.initial === initial &&
              link.getAttribute("aria-disabled") !== "true";
            if (isActive) link.setAttribute("aria-current", "location");
            else link.removeAttribute("aria-current");
            if (isActive) activeLink = link;
          });

          if (activeLink && window.matchMedia("(max-width: 1160px)").matches) {
            const left =
              activeLink.offsetLeft -
              (alphabetLinks.clientWidth - activeLink.offsetWidth) / 2;
            alphabetLinks.scrollTo({
              left: Math.max(0, left),
              behavior: "auto",
            });
          }
        }

        // スクロール中は描画時にキャッシュした見出し行だけを見る。
        function updateActiveAlphabet() {
          if (!visibleDividers.length) {
            setActiveAlphabet(null);
            return;
          }

          const threshold = stickyHeight() + 28;
          let current = visibleDividers[0].dataset.initial;
          for (const divider of visibleDividers) {
            if (divider.getBoundingClientRect().top <= threshold)
              current = divider.dataset.initial;
            else break;
          }
          setActiveAlphabet(current);
        }

        let activeAlphabetFrame = 0;
        function scheduleActiveAlphabetUpdate() {
          if (activeAlphabetFrame) return;
          activeAlphabetFrame = requestAnimationFrame(() => {
            activeAlphabetFrame = 0;
            updateActiveAlphabet();
          });
        }

        // 検索バーと索引バーはそれぞれ上部に固定される。合計が一覧の見出し位置になる。
        function stickyHeight() {
          return toolbarEl.offsetHeight + (indexBar ? indexBar.offsetHeight : 0);
        }

        function syncHeaderOffset() {
          const rootStyle = document.documentElement.style;
          rootStyle.setProperty("--toolbar-h", toolbarEl.offsetHeight + "px");
          rootStyle.setProperty("--header-offset", stickyHeight() + "px");
          scheduleActiveAlphabetUpdate();
        }

        if ("ResizeObserver" in window) {
          new ResizeObserver(syncHeaderOffset).observe(toolbarEl);
          if (indexBar) new ResizeObserver(syncHeaderOffset).observe(indexBar);
          new ResizeObserver(scheduleAlphabetOverflowUpdate).observe(
            alphabetLinks,
          );
        }
        window.addEventListener("resize", syncHeaderOffset);
        window.addEventListener("resize", scheduleAlphabetOverflowUpdate);
        window.addEventListener("scroll", scheduleActiveAlphabetUpdate, {
          passive: true,
        });
        window.addEventListener("scroll", scheduleVirtualWindowUpdate, {
          passive: true,
        });
        alphabetLinks.addEventListener(
          "scroll",
          scheduleAlphabetOverflowUpdate,
          { passive: true },
        );

        alphabetLinks.addEventListener("click", (event) => {
          const link = event.target.closest(".alphabet-link");
          if (!link || link.getAttribute("aria-disabled") === "true") return;
          const href = link.getAttribute("href");
          if (!href) return;
          const targetIndex = currentFilteredMods.findIndex(
            (mod) => initialKey(mod.name) === link.dataset.initial,
          );
          if (targetIndex < 0) return;
          event.preventDefault();
          const initial = link.dataset.initial;
          deferInteractionWork(() => {
            jumpVirtualWindowToIndex(targetIndex);
            requestAnimationFrame(() => {
              const target = document.getElementById(href.slice(1));
              if (!target) return;
              setActiveAlphabet(initial);
              target.scrollIntoView({ behavior: "auto", block: "start" });
              const url = new URL(window.location.href);
              url.hash = href;
              if (window.location.protocol !== "file:") {
                window.history.replaceState(
                  null,
                  "",
                  url.pathname + url.search + url.hash,
                );
              }
            });
          });
        });

        let searchDebounce = 0;

        // 「トップへ」系のリンク（右下のボタン、クイック検索のロゴなど）は、
        // 仮想リストの上側スペーサーを戻してから確実に先頭へ移動する。
        document.addEventListener("click", (event) => {
          if (
            !event.target.closest?.('a[href="#top"]') ||
            event.defaultPrevented ||
            event.button !== 0 ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          clearTimeout(searchDebounce);
          deferredInteractionToken += 1;
          cancelAnimationFrame(repositionFrame);
          cancelAnimationFrame(virtualScrollFrame);
          cancelAnimationFrame(virtualResizeFrame);
          repositionFrame = virtualScrollFrame = virtualResizeFrame = 0;
          document.documentElement.style.scrollBehavior = "auto";
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
          applyFilters(false, false);
          virtualLastScrollY = 0;
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
          document.getElementById("top")?.focus({ preventScroll: true });
          const url = new URL(window.location.href);
          url.hash = "top";
          window.history.replaceState(null, "", url.href);
        });

        searchInput.addEventListener("input", () => {
          clearTimeout(searchDebounce);
          deferredInteractionToken += 1;
          updateControlState();
          // 連続入力中の再描画を避け、低性能端末でも次のキー入力を妨げない。
          searchDebounce = setTimeout(() => scheduleApplyFilters(true), 180);
        });

        searchInput.addEventListener("keydown", (event) => {
          if (event.key === "Escape" && searchInput.value) {
            clearTimeout(searchDebounce);
            searchInput.value = "";
            scheduleApplyFilters(true);
          }
        });

        clearSearch.addEventListener("click", () => {
          clearTimeout(searchDebounce);
          searchInput.value = "";
          searchInput.focus();
          scheduleApplyFilters(true);
        });

        filterToggle.addEventListener("click", () => {
          const isOpen = toolbarEl.classList.toggle("filters-open");
          filterToggle.setAttribute("aria-expanded", String(isOpen));
        });

        versionFilter.addEventListener("change", () => scheduleApplyFilters(true));
        loaderFilter.addEventListener("change", () => scheduleApplyFilters(true));
        modeFilter.addEventListener("change", () => scheduleApplyFilters(true));
        sourceFilter.addEventListener("change", () => scheduleApplyFilters(true));

        newOnlyToggle.addEventListener("click", () => {
          const pressed = newOnlyToggle.getAttribute("aria-pressed") === "true";
          newOnlyToggle.setAttribute("aria-pressed", String(!pressed));
          scheduleApplyFilters(true);
        });

        function clearRefinementValues() {
          versionFilter.value = "";
          loaderFilter.value = "";
          modeFilter.value = "";
          sourceFilter.value = "";
          newOnlyToggle.setAttribute("aria-pressed", "false");
        }

        // 検索語も絞り込みもすべて解除する。
        function resetAllFilters() {
          clearTimeout(searchDebounce);
          searchInput.value = "";
          clearRefinementValues();
          toolbarEl.classList.remove("filters-open");
          filterToggle.setAttribute("aria-expanded", "false");
          searchInput.focus();
          scheduleApplyFilters(true);
        }
        resetFilters.addEventListener("click", resetAllFilters);
        emptyResetFilters.addEventListener("click", resetAllFilters);
        emptyClearSearch.addEventListener("click", () => clearSearch.click());

        // 検索語は残して、絞り込みだけ解除する。
        function clearRefinementsOnly() {
          clearTimeout(searchDebounce);
          clearRefinementValues();
          searchInput.focus();
          scheduleApplyFilters(true);
        }
        clearRefinements.addEventListener("click", clearRefinementsOnly);
        emptyClearRefinements.addEventListener("click", clearRefinementsOnly);

        // チップの×で、その条件だけ解除する。フォーカスは隣のチップへ移す。
        activeFilterChips.addEventListener("click", (event) => {
          const chip = event.target.closest("button[data-filter-id]");
          if (!chip) return;
          const index = [
            ...activeFilterChips.querySelectorAll("button:not(:disabled)"),
          ].indexOf(chip);
          const control = document.getElementById(chip.dataset.filterId);
          if (control === newOnlyToggle) control.setAttribute("aria-pressed", "false");
          else control.value = "";
          clearTimeout(searchDebounce);
          scheduleApplyFilters(true);
          const remaining = [
            ...activeFilterChips.querySelectorAll("button:not(:disabled)"),
          ];
          (remaining[index] || remaining.at(-1) || searchInput).focus();
        });


        tbody.addEventListener("click", (event) => {
          const button = event.target.closest(".mod-toggle");
          if (!button) return;
          const row = button.closest(".mod-row");
          const modIndex = row ? Number(row.dataset.modIndex) : -1;
          const mod = Number.isInteger(modIndex) ? MODS[modIndex] : null;
          if (!mod) return;
          const expanded = button.getAttribute("aria-expanded") !== "true";
          const currentDetail = row.nextElementSibling?.classList.contains(
            "detail-row",
          )
            ? row.nextElementSibling
            : null;

          if (!expanded) {
            row.classList.remove("is-expanded");
            button.setAttribute("aria-expanded", "false");
            currentDetail?.remove();
            return;
          }

          // 詳細は同時に1件だけ保持し、閉じた行の大きなDOMを残さない。
          const previousExpandedRow = tbody.querySelector(
            ".mod-row.is-expanded",
          );
          if (previousExpandedRow && previousExpandedRow !== row) {
            previousExpandedRow.classList.remove("is-expanded");
            previousExpandedRow
              .querySelector(".mod-toggle")
              ?.setAttribute("aria-expanded", "false");
            if (
              previousExpandedRow.nextElementSibling?.classList.contains(
                "detail-row",
              )
            ) {
              previousExpandedRow.nextElementSibling.remove();
            }
          }

          const detailRow = currentDetail || createDetailRow(mod, row);
          row.classList.add("is-expanded");
          button.setAttribute("aria-expanded", "true");
          detailRow.hidden = false;
        });

        restoreFilterStateFromURL();
        syncHeaderOffset();
        applyFilters(false, true);
        const requestedInitial = ALPHABET.find(
          (initial) => "#" + anchorId(initial) === window.location.hash,
        );
        if (requestedInitial) {
          const requestedIndex = currentFilteredMods.findIndex(
            (mod) => initialKey(mod.name) === requestedInitial,
          );
          if (requestedIndex >= 0) {
            jumpVirtualWindowToIndex(requestedIndex);
          }
        }
        requestAnimationFrame(() => {
          document.body.classList.remove("data-loading");
        });

        // 共有されたハッシュ付きURLでも、動的生成後に対象位置へ移動する。
        if (window.location.hash) {
          requestAnimationFrame(() => {
            const target = document.getElementById(
              window.location.hash.slice(1),
            );
            if (target && !target.hidden)
              target.scrollIntoView({ behavior: "auto", block: "start" });
          });
        }
      }

      loadReleaseData();
