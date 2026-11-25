/* =========================================================
   jtrans 公式サイト — 画面まわりの小さな補助（app.js の外側）
   - 対応環境の要約表示（統計の非表示欄を整形。SSR の文言と同期）
   - 「TOP」ボタンの表示切り替え
   - 凡例のローダー名を data-loader に写す
   ========================================================= */
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
      const fragment = document.createDocumentFragment();
      fragment.append(group);
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

  const footer = document.querySelector(".site-footer");
  const toolbar = document.getElementById("toolbar");
  const indexBar = document.getElementById("indexBar");
  const narrow = window.matchMedia("(max-width: 600px)");
  let lastScrollY = window.scrollY;
  let scrollingUp = false;
  const syncVisibility = () => {
    const listHasReachedHeader =
      supportedMods.getBoundingClientRect().top <= 80;
    // スマホでは一覧に重なるので、上へ戻ろうとしている（上スクロール中）ときだけ出す
    const y = window.scrollY;
    if (narrow.matches) {
      if (Math.abs(y - lastScrollY) > 4) scrollingUp = y < lastScrollY;
    } else {
      scrollingUp = true;
    }
    lastScrollY = y;
    setVisibility(y > 0 && listHasReachedHeader && scrollingUp);
    // フッターと重ならないよう、見えている分だけ持ち上げる
    const lift = footer
      ? Math.max(0, window.innerHeight - footer.getBoundingClientRect().top)
      : 0;
    backToTop.style.setProperty("--btt-lift", lift + "px");
    // 検索バーが上端に固定されている間だけ下線を出す
    const sectionStuck = supportedMods.getBoundingClientRect().top < -1;
    supportedMods.classList.toggle("is-stuck", sectionStuck);
    if (toolbar) toolbar.classList.toggle("is-stuck", sectionStuck);
    if (indexBar && toolbar) {
      indexBar.classList.toggle(
        "is-stuck",
        sectionStuck &&
          indexBar.getBoundingClientRect().top <= toolbar.offsetHeight + 1,
      );
    }
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
  // 狭い画面で環境チップが横にはみ出すとき、右端に「›」を出す
  const groups = document.querySelectorAll(".env-group");
  if (!groups.length) return;
  const update = (group) => {
    const options = group.querySelector(".env-options");
    if (!options) return;
    const remaining = options.scrollWidth - options.clientWidth - options.scrollLeft;
    group.classList.toggle("has-overflow-right", remaining > 2);
    group.classList.toggle("has-overflow-left", options.scrollLeft > 2);
  };
  groups.forEach((group) => {
    const options = group.querySelector(".env-options");
    if (!options) return;
    options.addEventListener("scroll", () => update(group), { passive: true });
    if ("ResizeObserver" in window) new ResizeObserver(() => update(group)).observe(options);
    new MutationObserver(() => update(group)).observe(options, { childList: true });
    update(group);
  });
})();

(() => {
  // タイトルの構築線。フォントの実寸（キャップハイト等）を測って線を置き、
  // 紋の円の内側では線を切って、紋の下を通っているように見せる。
  const hero = document.querySelector(".hero");
  const copy = document.querySelector(".hero-copy");
  const title = document.getElementById("pageTitle");
  const guides = document.querySelector(".title-guides");
  const mon = document.querySelector(".kv-svg");
  if (!hero || !copy || !title || !guides) return;
  const ctx = document.createElement("canvas").getContext("2d");
  const wide = window.matchMedia("(min-width: 901px)");

  const sync = () => {
    // ロゴタイプ（SVG）のときは、SVG側の寸法（x-height等）から線の位置を出す
    const wordmark = title.querySelector(".wordmark");
    if (wordmark) {
      copy.style.translate = "";
      const metrics = (box) => {
        const vb = wordmark.viewBox.baseVal;
        const scale = box.height / vb.height;
        const baseline = box.top - vb.y * scale;
        return {
          baseline,
          cap: baseline - Number(wordmark.dataset.cap) * scale,
          x: baseline - Number(wordmark.dataset.x) * scale,
          desc: baseline + Number(wordmark.dataset.desc) * scale,
        };
      };
      let m0 = metrics(wordmark.getBoundingClientRect());
      let shift = 0;
      if (wide.matches && mon && hero.classList.contains("align-baseline")) {
        const mr = mon.getBoundingClientRect();
        shift = mr.top + mr.height / 2 - m0.baseline;
        copy.style.translate = "0 " + shift.toFixed(1) + "px";
      }
      const g = guides.getBoundingClientRect();
      const set = (name, value) => guides.style.setProperty(name, (value + shift - g.top).toFixed(1) + "px");
      set("--g-base", m0.baseline);
      set("--g-cap", m0.cap);
      set("--g-x", m0.x);
      set("--g-desc", m0.desc);
      setMask(g);
      holeWordmark(wordmark);
      guides.classList.add("is-ready");
      return;
    }

    const cs = getComputedStyle(title);
    ctx.font = cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
    const H = ctx.measureText("H");
    const x = ctx.measureText("x");
    const p = ctx.measureText("p");
    const ascent = H.fontBoundingBoxAscent;
    const descent = H.fontBoundingBoxDescent;
    const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;

    // PCでは、タイトルのベースラインを紋の中心（水平の対称軸）にそろえる
    copy.style.translate = "";
    const titleBox = title.getBoundingClientRect();
    const firstBaseline = titleBox.top + (lineHeight - (ascent + descent)) / 2 + ascent;
    let shift = 0;
    if (wide.matches && mon && hero.classList.contains("align-baseline")) {
      const m = mon.getBoundingClientRect();
      shift = m.top + m.height / 2 - firstBaseline;
      copy.style.translate = "0 " + shift.toFixed(1) + "px";
    }

    const g = guides.getBoundingClientRect();
    const base = firstBaseline + shift - g.top;
    const set = (name, value) => guides.style.setProperty(name, value.toFixed(1) + "px");
    set("--g-base", base);
    set("--g-cap", base - H.actualBoundingBoxAscent);
    set("--g-x", base - x.actualBoundingBoxAscent);
    set("--g-desc", base + p.actualBoundingBoxDescent);

    setMask(g);
    guides.classList.add("is-ready");
  };

  // ロゴタイプの構築線も、紋の円の内側では切る（SVGのマスクの穴を紋に合わせる）
  function holeWordmark(svg) {
    const hole = svg.querySelector(".wm-mon-hole");
    if (!hole || !mon) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const m = mon.getBoundingClientRect();
    const pt = svg.createSVGPoint();
    pt.x = m.left + m.width / 2;
    pt.y = m.top + m.height / 2;
    const local = pt.matrixTransform(ctm.inverse());
    hole.setAttribute("cx", local.x.toFixed(1));
    hole.setAttribute("cy", local.y.toFixed(1));
    hole.setAttribute("r", (((m.width * 1254) / 1800 / 2 + 1) / ctm.a).toFixed(1));
  }

  function setMask(g) {
    if (mon) {
      // 紋（viewBox 1800 のうち直径 1254）の外周で線を切る
      const m = mon.getBoundingClientRect();
      const r = (m.width * 1254) / 1800 / 2;
      const cx = m.left + m.width / 2 - g.left;
      const cy = m.top + m.height / 2 - g.top;
      guides.style.setProperty(
        "--g-mask",
        "radial-gradient(circle at " + cx.toFixed(1) + "px " + cy.toFixed(1) + "px, transparent " +
          (r + 1).toFixed(1) + "px, #000 " + (r + 2).toFixed(1) + "px)",
      );
    }
  }

  const schedule = () => requestAnimationFrame(sync);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  if ("ResizeObserver" in window) new ResizeObserver(schedule).observe(hero);
  wide.addEventListener?.("change", schedule);
  schedule();
})();
