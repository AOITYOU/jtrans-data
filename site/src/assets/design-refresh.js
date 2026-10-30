(() => {
  const target = document.getElementById("statPlatforms");
  if (!target) return;

  let renderedText = "";
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();

  const parseGroups = (source) =>
    source
      .split(/\s+\/\s+(?=\d)/)
      .map((part) => {
        const [version, loaderText] = part.split(/\s+—\s+/, 2);
        if (!version || !loaderText) return null;
        const loaders = loaderText
          .split("・")
          .map((loader) => loader.trim())
          .filter(Boolean);
        return loaders.length ? { version: version.trim(), loaders } : null;
      })
      .filter(Boolean);

  const createLoaderList = (loaders) => {
    const list = document.createElement("span");
    list.className = "environment-loaders";
    loaders.forEach((loader) => {
      const item = document.createElement("span");
      item.className = "environment-loader";
      item.dataset.loader = loader.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      item.textContent = loader;
      list.appendChild(item);
    });
    return list;
  };

  const createGroup = (versions, loaders) => {
    const group = document.createElement("span");
    group.className = "environment-group";

    const versionList = document.createElement("span");
    versionList.className = "environment-versions";
    versionList.textContent = versions.join(" / ");

    group.append(versionList, createLoaderList(loaders));
    return group;
  };

  const render = (source) => {
    const normalizedSource = normalize(source);
    const groups = parseGroups(normalizedSource);
    if (!groups.length) {
      renderedText = normalizedSource;
      return;
    }

    // 3バージョン以上は1行に要約する（1.8.0〜: 1.12.2〜26.3 など）。
    // 全文は aria-label に残し、バージョン別の内訳は「あなたの環境」欄へ案内する。
    if (groups.length > 2) {
      const LOADER_ORDER = ["Forge", "NeoForge", "Fabric", "Quilt"];
      const rank = (name) => {
        const index = LOADER_ORDER.indexOf(name);
        return index < 0 ? LOADER_ORDER.length : index;
      };
      const loaders = [...new Set(groups.flatMap((group) => group.loaders))].sort(
        (a, b) => rank(a) - rank(b),
      );
      const group = createGroup(
        [groups[0].version + "〜" + groups[groups.length - 1].version],
        loaders,
      );
      const count = document.createElement("span");
      count.className = "environment-count";
      count.textContent = groups.length + "バージョン";
      group.firstElementChild.append(count);

      const fragment = document.createDocumentFragment();
      fragment.append(group);
      if (document.getElementById("envPicker")) {
        const more = document.createElement("a");
        more.className = "environment-more";
        more.href = "#envPicker";
        more.textContent = "バージョン別の対応を見る ↓";
        fragment.append(more);
      }
      target.setAttribute("aria-label", normalizedSource);
      target.classList.add("is-formatted", "is-summary");
      target.replaceChildren(fragment);
      renderedText = normalize(target.textContent);
      return;
    }
    target.classList.remove("is-summary");

    const firstLoaders = groups[0].loaders.join("\u0000");
    const shareLoaders = groups.every(
      (group) => group.loaders.join("\u0000") === firstLoaders,
    );
    const fragment = document.createDocumentFragment();

    if (shareLoaders) {
      fragment.append(
        createGroup(
          groups.map((group) => group.version),
          groups[0].loaders,
        ),
      );
    } else {
      groups.forEach((group) => {
        fragment.append(createGroup([group.version], group.loaders));
      });
    }

    target.setAttribute("aria-label", normalizedSource);
    target.classList.add("is-formatted");
    target.replaceChildren(fragment);
    renderedText = normalize(target.textContent);
  };

  render(target.textContent);

  new MutationObserver(() => {
    const currentText = normalize(target.textContent);
    if (currentText !== renderedText) render(currentText);
  }).observe(target, { childList: true, subtree: true, characterData: true });
})();

(() => {
  const backToTop = document.getElementById("backToTop");
  const supportedMods = document.getElementById("supportedMods");
  if (!backToTop || !supportedMods) return;

  const setVisibility = (visible) => {
    backToTop.classList.toggle("is-visible", visible);
    backToTop.setAttribute("aria-hidden", String(!visible));
    backToTop.tabIndex = visible ? 0 : -1;
  };

  const syncVisibility = () => {
    const listHasReachedHeader =
      supportedMods.getBoundingClientRect().top <= 80;
    setVisibility(window.scrollY > 0 && listHasReachedHeader);
  };

  let syncFrame = 0;
  const scheduleSync = () => {
    if (syncFrame) return;
    syncFrame = window.requestAnimationFrame(() => {
      syncFrame = 0;
      syncVisibility();
    });
  };

  // 「トップへ」の処理（仮想リストの巻き戻しとスクロール）は app.js 側で
  // a[href="#top"] をまとめて扱うため、ここでは表示状態の同期だけを行う。

  window.addEventListener("scroll", scheduleSync, { passive: true });
  window.addEventListener("resize", scheduleSync);
  window.addEventListener("hashchange", scheduleSync);
  syncVisibility();
})();

/* design v2（2026-10-10 テスト版） */
(() => {
  // 凡例のバッジにも色点用のローダー名を付ける（行のバッジは title で判別できる）
  const tagLegend = () => {
    document.querySelectorAll(".legend .loader-badge:not([data-loader])").forEach((b) => {
      b.dataset.loader = (b.textContent || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
    });
  };
  const legend = document.querySelector(".legend");
  if (legend) { tagLegend(); new MutationObserver(tagLegend).observe(legend, { childList: true, subtree: true }); }
})();

(() => {
  // ヒーローを過ぎてからMOD一覧に着くまでの間だけ、細い検索ヘッダーを出す
  const hero = document.querySelector(".hero");
  const list = document.getElementById("supportedMods");
  const listSearch = document.getElementById("search");
  if (!hero || !list || !listSearch) return;
  const crest = document.querySelector(".crest-mark");
  const bar = document.createElement("div");
  bar.className = "jt-quickbar";
  bar.inert = true;
  bar.setAttribute("aria-hidden", "true");
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "対応MODのクイック検索");
  bar.innerHTML =
    '<div class="jt-quickbar-inner">' +
    '<a class="jt-quickbar-brand" href="#top">' +
    (crest ? '<img src="' + crest.getAttribute("src") + '" alt="" width="22" height="22">' : "") +
    "<span>All Japanese Translate</span></a>" +
    '<form class="jt-quickbar-search" role="search">' +
    '<label class="sr-only" for="jtQuickSearch">対応MODを検索</label>' +
    '<input id="jtQuickSearch" type="search" placeholder="対応MODを検索" autocomplete="off" enterkeyhint="search">' +
    '<button type="submit">一覧で探す</button></form>' +
    '<nav class="jt-quickbar-nav" aria-label="クイックリンク"><a href="#install">導入方法</a><a href="#report">報告・要望</a>' +
    '<a href="https://www.curseforge.com/minecraft/mc-mods/jtrans" target="_blank" rel="noopener noreferrer">CurseForge ↗</a></nav>' +
    "</div>";
  document.body.appendChild(bar);
  const input = bar.querySelector("input");
  bar.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    listSearch.value = input.value.trim();
    listSearch.dispatchEvent(new Event("input", { bubbles: true }));
    input.blur();
    list.scrollIntoView({ block: "start" });
  });
  let frame = 0;
  const update = () => {
    frame = 0;
    const show = hero.getBoundingClientRect().bottom < 0 && list.getBoundingClientRect().top > 60;
    if (bar.classList.contains("is-shown") !== show) {
      bar.classList.toggle("is-shown", show);
      bar.setAttribute("aria-hidden", String(!show));
      bar.inert = !show;
      if (!show && document.activeElement && bar.contains(document.activeElement)) document.activeElement.blur();
    }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  update();
})();

(() => {
  // スマホでは各プレビューに「タップで拡大」を出し、既存の全画面ボタンを押す
  const expand = document.getElementById("comparisonExpand");
  if (!expand) return;
  document.querySelectorAll(".comparison-stage").forEach((stage) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "jt-zoom-chip";
    chip.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>タップで拡大';
    chip.addEventListener("click", (e) => { e.stopPropagation(); expand.click(); });
    stage.appendChild(chip);
  });
})();

(() => {
  // 配色の比較用（ローカルのテスト環境、または ?palette-ui を付けたときだけ表示）
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (!local && !/[?&]palette-ui\b/.test(location.search)) return;
  const OPTIONS = [["genkou", "現行"], ["sumi", "墨"], ["ai", "藍"], ["nezumi", "鼠"], ["kinari", "生成り"]];
  const root = document.documentElement;
  const current = () => root.getAttribute("data-palette") || "sumi";
  const box = document.createElement("div");
  box.className = "jt-palette-switch";
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", "配色の切り替え（テスト用）");
  box.innerHTML = '<span class="jt-palette-title">配色</span>' + OPTIONS.map(([k, label]) =>
    '<button type="button" data-k="' + k + '">' + label + "</button>").join("");
  const sync = () => box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === current())));
  box.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    root.setAttribute("data-palette", b.dataset.k);
    try { localStorage.setItem("jtrans-palette", b.dataset.k); } catch (err) { /* noop */ }
    sync();
  });
  document.body.appendChild(box);
  sync();
})();
