/* =========================================================
   jtrans motion layer
   既存の app.js / design-refresh.js には手を入れず、DOMを外側から演出するだけのスクリプト。
   OSの「動きを減らす」設定のときは控えめモード、2回目以降の訪問では短い演出になる。
   ========================================================= */
(() => {
  "use strict";

  const root = document.documentElement;
  // ?motion=full … OSの「動きを減らす」設定でも全部の演出を出す（確認用）
  // ?motion=off  … アニメーションを一切使わない
  const param = new URLSearchParams(location.search).get("motion");
  if (param === "off") { root.classList.remove("jt-motion", "jt-reduced"); return; }
  const osReduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // 「動きを減らす」設定のときは、回転・パララックス・スライドを外した控えめモードにする
  const reduce = osReduce && param !== "full";
  window.__jtMotion = true;
  // 元のサイトCSSの「動きを減らす」一括ルール（再生時間0.01ms）を外す。控えめ表現はこのレイヤーで行う
  Array.from(document.styleSheets).forEach((sh) => {
    let rules; try { rules = sh.cssRules; } catch (e) { return; }
    Array.from(rules || []).forEach((mr) => {
      if (!mr.media || !/prefers-reduced-motion/.test(mr.media.mediaText)) return;
      Array.from(mr.cssRules).forEach((r) => {
        if (r.style && r.style.getPropertyValue("animation-duration")) {
          r.style.removeProperty("animation-duration");
          r.style.removeProperty("transition-duration");
        }
      });
    });
  });
  root.classList.add("jt-motion");
  root.classList.toggle("jt-reduced", reduce);

  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const KANA = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン";
  const LATIN = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const rand = (s) => s[(Math.random() * s.length) | 0];
  const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
  const easeInOut = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const fmt = (n) => Math.round(n).toLocaleString("en-US");

  /* ---------- 0. 訪問の記録（2回目以降は演出を短く・前回からの増分を表示） ---------- */
  const STORE = "jtrans-motion";
  let prev = null;
  try { prev = JSON.parse(localStorage.getItem(STORE) || "null"); } catch (e) { prev = null; }
  if (prev && typeof prev !== "object") prev = null;
  // ?motion=full は確認用なので、毎回フルの登場演出を出す
  const quick = !!prev && param !== "full";
  root.classList.toggle("jt-quick", quick);
  let hintShown = false;
  const saveVisit = () => {
    try {
      const data = { n: ((prev && prev.n) || 0) + 1, t: Date.now(), hint: !!((prev && prev.hint) || hintShown) };
      ["statCount", "statKeyCount"].forEach((id) => {
        const el = document.getElementById(id);
        const v = el && el.__jtTarget;
        data[id] = typeof v === "number" ? v : prev && prev[id];
      });
      const ver = document.getElementById("statVersion");
      data.version = (ver && ver.__jtReal) || (prev && prev.version) || null;
      localStorage.setItem(STORE, JSON.stringify(data));
    } catch (e) { /* 保存できない環境では毎回初回扱い */ }
  };
  window.addEventListener("pagehide", saveVisit);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveVisit(); });
  setTimeout(saveVisit, 8000);

  /* ---------- 1. 見出しのスクランブル登場 ---------- */
  const h1 = $(".hero h1");
  if (h1 && quick) {
    // 2回目以降：シャッフルはせず、下線だけ引く
    h1.classList.add("jt-split");
    requestAnimationFrame(() => requestAnimationFrame(() => h1.classList.add("jt-line-on")));
  } else if (h1) {
    const text = h1.textContent.trim();
    h1.setAttribute("aria-label", text);
    const frag = document.createDocumentFragment();
    const chars = [];
    text.split(/(\s+)/).forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); return; }
      const word = document.createElement("span");
      word.className = "jt-word";
      word.style.cssText = "display:inline-block;white-space:nowrap";
      word.setAttribute("aria-hidden", "true");
      for (const ch of part) {
        const s = document.createElement("span");
        s.className = "jt-char";
        s.textContent = ch;
        s.dataset.ch = ch;
        word.appendChild(s);
        chars.push(s);
      }
      frag.appendChild(word);
    });
    h1.replaceChildren(frag);
    h1.classList.add("jt-split");
    // 最終文字の幅で固定（スクランブル中のガタつき防止）
    chars.forEach((s) => { s.style.width = s.getBoundingClientRect().width + "px"; });

    const start = 420;
    let done = 0;
    chars.forEach((s, i) => {
      const t0 = start + i * 42;
      const dur = 260 + Math.random() * 260;
      setTimeout(() => {
        s.classList.add("is-on", "is-scrambling");
        const pool = Math.random() < .6 ? KANA : LATIN;
        const iv = setInterval(() => { s.textContent = rand(pool); }, 55);
        setTimeout(() => {
          clearInterval(iv);
          s.textContent = s.dataset.ch;
          s.classList.remove("is-scrambling");
          if (++done === chars.length) {
            h1.classList.add("jt-line-on");
            // 終わったら元のテキストに戻す（コピーや折り返しを自然に）
            setTimeout(() => {
              h1.textContent = text;
              h1.removeAttribute("aria-label");
            }, 900);
          }
        }, dur);
      }, t0);
    });
  }

  /* ---------- 2. ヒーロー背景：回る家紋 ---------- */
  const hero = $(".hero");
  let crestBg = null;
  if (hero) {
    const bg = getComputedStyle(hero).backgroundImage;
    if (bg && bg !== "none") {
      crestBg = document.createElement("div");
      crestBg.className = "jt-crest-bg";
      crestBg.setAttribute("aria-hidden", "true");
      const inner = document.createElement("div");
      inner.className = "jt-crest-bg-inner";
      inner.style.backgroundImage = bg;
      crestBg.appendChild(inner);
      hero.prepend(crestBg);
      root.classList.add("jt-has-crest-bg");
    }
  }

  /* ---------- 4. 数字のカウントアップ ---------- */
  const counters = ["statCount", "statKeyCount", "dataNamespaceCount", "dataSourceCount", "dataHardcodedCount", "dataNotesCount"]
    .map((id) => document.getElementById(id)).filter(Boolean);
  const parseNum = (s) => {
    const t = String(s || "").replace(/[,\s]/g, "");
    return /^\d+$/.test(t) ? Number(t) : null;
  };
  // 状態: __jtShown=いま表示している値 / __jtTarget=最終的に出すべき値（app.jsが書いた最新値）
  const writeNum = (el, n) => { el.__jtShown = n; el.__jtLast = fmt(n); el.textContent = el.__jtLast; };
  // 前回訪問時の値（ヒーローの2項目だけ記録している）。今回の値以下なら、そこからカウントする
  const baseFor = (el) => {
    const v = prev && prev[el.id];
    return typeof v === "number" && el.__jtTarget !== null && v <= el.__jtTarget ? v : 0;
  };
  const addDelta = (el) => {
    const base = el.__jtBase || 0;
    const diff = el.__jtTarget - base;
    if (!base || diff <= 0 || el.__jtDelta) return;
    const tag = document.createElement("span");
    tag.className = "jt-delta";
    tag.innerHTML = '前回から <b>+' + fmt(diff) + "</b>";
    (el.closest("dd") || el.parentElement).appendChild(tag);
    el.__jtDelta = tag;
  };
  const runCount = (el, dur) => {
    if (el.__jtRaf) cancelAnimationFrame(el.__jtRaf);
    el.classList.add("jt-counting");
    const from = el.__jtShown || 0;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, Math.max(0, (now - t0) / dur));
      const to = el.__jtTarget;
      writeNum(el, p < 1 ? from + (to - from) * easeOutExpo(p) : to);
      if (p < 1) el.__jtRaf = requestAnimationFrame(step);
      else { el.__jtRaf = 0; el.__jtDone = true; el.classList.remove("jt-counting"); addDelta(el); }
    };
    el.__jtRaf = requestAnimationFrame(step);
  };
  const startCounter = (el, delay) => {
    if (el.__jtStarted || el.__jtTarget === null) return;
    el.__jtStarted = true;
    el.__jtBase = baseFor(el);
    writeNum(el, el.__jtBase);
    if (el.__jtBase === el.__jtTarget) { el.__jtDone = true; return; } // 前回から変化なし：そのまま表示
    const dur = el.__jtBase ? 1300 : el.__jtTarget > 100000 ? 2200 : 1600;
    setTimeout(() => runCount(el, dur), delay);
  };
  counters.forEach((el) => {
    el.__jtTarget = parseNum(el.textContent);
    // ヒーローの数字は表示前から開始値（初回は0、2回目以降は前回の値）にしておく
    if (el.closest(".hero") && el.__jtTarget !== null) writeNum(el, baseFor(el));
    new MutationObserver(() => {
      if (el.textContent === el.__jtLast) return;
      const n = parseNum(el.textContent);
      if (n === null) return;
      el.__jtTarget = n;
      if (el.__jtDone) { if (n !== el.__jtShown) { el.__jtBase = el.__jtBase || el.__jtShown; runCount(el, 1100); } return; }
      if (el.__jtRaf) return; // カウント中：次のフレームで新しい目標値に向かう
      if (el.__jtStarted || el.closest(".hero")) writeNum(el, el.__jtStarted ? el.__jtShown || 0 : baseFor(el));
      if (!el.__jtStarted && el.__jtSeen) startCounter(el, 120);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });
  const counterIO = new IntersectionObserver((es) => {
    es.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      el.__jtSeen = true;
      const heroDelay = quick ? 250 : Math.max(0, 1500 - performance.now());
      startCounter(el, el.closest(".hero") ? heroDelay : 120);
      counterIO.unobserve(el);
    });
  }, { threshold: .4 });
  counters.forEach((el) => counterIO.observe(el));

  // バージョン表記：初回は数字をシャッフルしてから確定。2回目以降は、更新があったときだけシャッフル＋前回の版を表示
  const ver = document.getElementById("statVersion");
  const shuffleVersion = (delay) => {
    if (!ver) return;
    const final = ver.__jtReal;
    setTimeout(() => {
      let n = 0;
      const iv = setInterval(() => {
        ver.__jtLast = final.replace(/\d/g, () => (Math.random() * 10) | 0);
        ver.textContent = ver.__jtLast;
        if (++n > 12) { clearInterval(iv); ver.__jtLast = final; ver.textContent = final; }
      }, 50);
    }, delay);
  };
  const markUpdated = () => {
    if (!ver || !prev || !prev.version || prev.version === ver.__jtReal || ver.__jtUpdated) return false;
    const tag = document.createElement("span");
    tag.className = "jt-delta";
    tag.innerHTML = "前回 " + String(prev.version).replace(/[<>&]/g, "") + " から<b>更新</b>";
    (ver.closest("dd") || ver.parentElement).appendChild(tag);
    ver.__jtUpdated = tag;
    return true;
  };
  if (ver) {
    ver.__jtReal = ver.textContent.trim();
    if (!quick) shuffleVersion(1450);
    else if (markUpdated()) shuffleVersion(250);
    new MutationObserver(() => {
      if (ver.textContent === ver.__jtLast) return;
      ver.__jtReal = ver.textContent.trim();
      ver.__jtLast = ver.textContent;
      if (!quick || markUpdated()) shuffleVersion(0);
    }).observe(ver, { childList: true, characterData: true, subtree: true });
  }

  /* ---------- 5. 対応ローダーのチップに順番を振る ---------- */
  const platforms = document.getElementById("statPlatforms");
  const indexLoaders = () => {
    $$(".environment-loader", platforms || document).forEach((el, i) => el.style.setProperty("--jt-i", i));
  };
  if (platforms) {
    indexLoaders();
    new MutationObserver(indexLoaders).observe(platforms, { childList: true, subtree: true });
  }

  /* ---------- 6. スクロールで出てくる要素 ---------- */
  const revealGroups = [
    ".comparison-intro > *",
    ".comparison-figure",
    ".home-section .section-label",
    ".section-copy > :not(.install-steps)",
    ".install-steps > li",
    ".release-data-heading > *",
    ".technical-details",
    ".directory-intro > *",
    ".site-footer .footer-inner > div > *",
    ".footer-links > a",
  ];
  // clip-path で完全に隠した要素は「見えていない」扱いになるため、見出しは親要素で判定する
  const watchers = new Map();
  const revealIO = new IntersectionObserver((es) => {
    es.forEach((e) => {
      if (!e.isIntersecting) return;
      (watchers.get(e.target) || []).forEach((el) => el.classList.add("is-in"));
      watchers.delete(e.target);
      revealIO.unobserve(e.target);
    });
  }, { threshold: .12, rootMargin: "0px 0px -6% 0px" });
  const watch = (target, el) => {
    if (!watchers.has(target)) { watchers.set(target, []); revealIO.observe(target); }
    watchers.get(target).push(el);
  };
  const seen = new Set();
  revealGroups.forEach((sel) => {
    $$(sel).forEach((el) => {
      if (seen.has(el) || el.closest(".hero")) return;
      seen.add(el);
      const siblings = Array.from(el.parentElement.children).filter((c) => seen.has(c));
      el.style.setProperty("--jt-d", Math.min(siblings.indexOf(el), 6));
      const isHeading = /^H[1-3]$/.test(el.tagName);
      el.classList.add(isHeading ? "jt-reveal-wipe" : "jt-reveal");
      watch(isHeading ? el.parentElement : el, el);
    });
  });

  /* ---------- 7. カーソルを追うスポットライト ---------- */
  if (finePointer) {
    $$(".release-data-metric, .release-data-panel, .install-steps > li, .hero-checker .hero-search")
      .forEach((el) => el.classList.add("jt-spot"));
    document.addEventListener("pointermove", (e) => {
      const el = e.target.closest && e.target.closest(".jt-spot");
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--jt-mx", e.clientX - r.left + "px");
      el.style.setProperty("--jt-my", e.clientY - r.top + "px");
    }, { passive: true });

    /* ---------- 8. メインボタンが少しだけカーソルに吸い寄せられる ---------- */
    if (!reduce) $$(".primary-link").forEach((btn) => {
      btn.addEventListener("pointermove", (e) => {
        const r = btn.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        btn.style.transform = `translate(${(dx * 5).toFixed(1)}px, ${(dy * 4 - 2).toFixed(1)}px)`;
      });
      btn.addEventListener("pointerleave", () => { btn.style.transform = ""; });
    });
  }

  /* ---------- 9. 家紋クリックで回転＋波紋 ---------- */
  const brand = $(".brand");
  const crest = $(".crest-mark");
  if (brand && crest && !reduce) {
    brand.addEventListener("click", () => {
      crest.classList.remove("is-spinning");
      void crest.offsetWidth;
      crest.classList.add("is-spinning");
      const rip = document.createElement("span");
      rip.className = "jt-ripple";
      rip.setAttribute("aria-hidden", "true");
      crest.parentElement.appendChild(rip);
      rip.addEventListener("animationend", () => rip.remove());
    });
    crest.addEventListener("animationend", (e) => {
      if (e.animationName === "jt-spin") crest.classList.remove("is-spinning");
    });
  }

  /* ---------- 10. 検索欄のプレースホルダーをタイプライター風に ---------- */
  const search = document.getElementById("heroSearch");
  if (search) {
    const base = search.getAttribute("placeholder") || "";
    const prefix = (base.match(/^(.*?例[:：]\s*)/) || [, "例: "])[1];
    const fallback = ["Applied Energistics 2", "Botania", "Blood Magic", "Apotheosis", "Create: The Factory Must Grow"];
    const names = () => {
      const pop = $$("#checkerPopularList > *").map((n) => n.textContent.trim()).filter((s) => s && s.length < 40);
      return pop.length >= 3 ? pop : fallback;
    };
    let idx = 0, timer = 0;
    const paused = () => search.value !== "" || document.activeElement === search;
    const typeName = (name, i, deleting) => {
      if (paused()) { search.placeholder = base; timer = setTimeout(() => typeName(name, 0, false), 2000); return; }
      search.classList.add("jt-typing");
      search.placeholder = prefix + name.slice(0, i) + (i < name.length || deleting ? "｜" : "");
      if (!deleting && i < name.length) timer = setTimeout(() => typeName(name, i + 1, false), 55 + Math.random() * 40);
      else if (!deleting) timer = setTimeout(() => typeName(name, i, true), 1900);
      else if (i > 0) timer = setTimeout(() => typeName(name, i - 1, true), 28);
      else { const list = names(); idx = (idx + 1) % list.length; timer = setTimeout(() => typeName(list[idx], 0, false), 350); }
    };
    setTimeout(() => {
      const list = names();
      idx = Math.max(0, list.findIndex((n) => base.includes(n)));
      typeName(list[idx], list[idx].length, false);
    }, 3200);
    search.addEventListener("focus", () => { clearTimeout(timer); search.placeholder = base; });
    search.addEventListener("blur", () => { clearTimeout(timer); timer = setTimeout(() => typeName(names()[idx], 0, false), 1500); });
  }

  /* ---------- 11. 比較プレビュー：最初に一度だけスライダーを動かして見せる ---------- */
  const figure = $(".comparison-figure");
  if (figure && !reduce && !(prev && prev.hint)) {
    let userTouched = false;
    const stopHint = () => { userTouched = true; figure.classList.remove("jt-hint"); };
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach((t) =>
      figure.addEventListener(t, stopHint, { passive: true, once: true }));
    const sweep = () => {
      const slide = $('.comparison-slide[aria-hidden="false"]', figure) || $(".comparison-slide", figure);
      const range = slide && $(".comparison-range", slide);
      const stage = slide && $(".comparison-stage", slide);
      if (!range) return;
      const begin = performance.now();
      const waitLoaded = () => {
        if (userTouched) return;
        if (stage && stage.classList.contains("is-loading") && performance.now() - begin < 5000) {
          setTimeout(waitLoaded, 150); return;
        }
        const start = Number(range.value) || 50;
        const keys = [[0, start], [800, 82], [1900, 18], [2700, start]];
        const t0 = performance.now();
        const step = (now) => {
          if (userTouched) return;
          const t = now - t0;
          let k = 1;
          while (k < keys.length - 1 && t > keys[k][0]) k++;
          const [ta, va] = keys[k - 1], [tb, vb] = keys[k];
          const p = Math.min(1, Math.max(0, (t - ta) / (tb - ta)));
          range.value = String(va + (vb - va) * easeInOut(p));
          range.dispatchEvent(new Event("input"));
          if (t < keys[keys.length - 1][0]) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      };
      waitLoaded();
    };
    const io = new IntersectionObserver((es) => {
      if (!es[0].isIntersecting) return;
      io.disconnect();
      figure.classList.add("jt-hint");
      setTimeout(() => { if (!userTouched) { hintShown = true; sweep(); } }, 900);
      setTimeout(() => figure.classList.remove("jt-hint"), 9000);
    }, { threshold: .55 });
    io.observe(figure);
  }

  /* ---------- 12. スクロール進捗バー＋家紋のパララックス ---------- */
  const bar = document.createElement("div");
  bar.className = "jt-progress";
  bar.setAttribute("aria-hidden", "true");
  document.body.appendChild(bar);
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      // ページの大半はMOD一覧なので、「一覧の手前まで」を100%として測る
      const list = document.getElementById("supportedMods");
      const end = list ? list.getBoundingClientRect().top + y - window.innerHeight * .35 : max;
      const span = Math.max(1, Math.min(max, end));
      bar.style.setProperty("--jt-progress", Math.min(1, y / span).toFixed(4));
      bar.classList.toggle("is-done", y > span + 40);
      if (!reduce && crestBg && hero && y < hero.offsetHeight + 200) crestBg.style.setProperty("--jt-parallax", (y * .3).toFixed(1) + "px");
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();

  /* ---------- 14. MOD一覧の行は最初の表示のときだけふわっと（検索・絞り込みでは出さない） ---------- */
  const main = document.getElementById("mainContent") || document.body;
  const rowWatch = new MutationObserver(() => {
    if (!document.querySelector(".mod-row")) return;
    rowWatch.disconnect();
    setTimeout(() => root.classList.add("jt-rows-settled"), 1200);
  });
  if (document.querySelector(".mod-row")) setTimeout(() => root.classList.add("jt-rows-settled"), 1200);
  else rowWatch.observe(main, { childList: true, subtree: true });

  /* ---------- 15. 対応チェッカーの結果：対応ならチェックを描く／見つからなければ要望ボタンを示す ---------- */
  const result = document.getElementById("heroCheckerResult");
  if (result) {
    let lastName = "", freshTimer = 0;
    const CHECK = '<svg class="jt-check" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.2 8.6l3.1 3L12.9 4.7" pathLength="1"/></svg>';
    const decorate = () => {
      const icon = $(".checker-status-icon", result);
      const name = ($(".checker-mod-name", result) || {}).textContent || "";
      const state = icon ? icon.textContent.trim() : "";
      const key = state + "|" + name;
      // 入力中の再描画で同じ結果が出たときは、アニメーションを繰り返さない
      if (key !== lastName && icon) {
        lastName = key;
        result.classList.remove("jt-fresh");
        void result.offsetWidth;
        result.classList.add("jt-fresh");
        clearTimeout(freshTimer);
        freshTimer = setTimeout(() => result.classList.remove("jt-fresh"), 2600);
      } else if (key === lastName) {
        result.classList.remove("jt-fresh");
      }
      if (icon && state === "\u2713" && !icon.querySelector(".jt-check")) {
        icon.innerHTML = CHECK;
        icon.classList.add("jt-icon-ok");
      } else if (icon && state === "?") {
        icon.classList.add("jt-icon-missing");
        const ask = $('a[href*="/comments"]', result);
        if (ask) ask.classList.add("jt-nudge");
      }
    };
    new MutationObserver(decorate).observe(result, { childList: true });
  }

  /* ---------- 16. 対応MOD一覧の索引：赤い下線が今いる文字へ滑って移動 ---------- */
  const alpha = document.getElementById("alphabetLinks");
  if (alpha) {
    let ind = null;
    const place = () => {
      if (!ind || !ind.isConnected) {
        ind = document.createElement("span");
        ind.className = "jt-alpha-ind";
        ind.setAttribute("aria-hidden", "true");
        alpha.appendChild(ind);
        alpha.classList.add("jt-has-ind");
      }
      const cur = alpha.querySelector('.alphabet-link[aria-current="location"]');
      if (!cur) { ind.style.opacity = "0"; return; }
      ind.style.opacity = "1";
      ind.style.width = Math.max(8, cur.offsetWidth - 12) + "px";
      ind.style.transform = "translateX(" + (cur.offsetLeft + 6) + "px)";
    };
    new MutationObserver((recs) => {
      if (recs.every((r) => r.type === "childList" && [...r.addedNodes].every((n) => n === ind))) return;
      place();
    }).observe(alpha, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-current"] });
    window.addEventListener("resize", place);
    place();
  }

  /* ---------- 17. MODの詳細：高さが伸びるように開き、縮むように閉じる ---------- */
  const tbody = document.getElementById("tbody");
  if (tbody && !reduce) {
    let lastOpenClick = 0;
    const EASE = "cubic-bezier(.16, 1, .3, 1)";
    const boxOf = (card) => {
      const cs = getComputedStyle(card);
      return { h: card.offsetHeight + "px", pt: cs.paddingTop, pb: cs.paddingBottom };
    };
    tbody.addEventListener("click", (e) => {
      const btn = e.target.closest && e.target.closest(".mod-toggle");
      if (!btn || btn.__jtPass) return;
      if (btn.getAttribute("aria-expanded") !== "true") { lastOpenClick = performance.now(); return; }
      const row = btn.closest(".mod-row");
      const detail = row && row.nextElementSibling;
      const card = detail && detail.classList.contains("detail-row") && detail.querySelector(".mod-detail-card");
      if (!card || card.__jtClosing) return;
      e.stopPropagation();
      e.preventDefault();
      card.__jtClosing = true;
      row.classList.add("jt-closing");
      const b = boxOf(card);
      card.style.overflow = "hidden";
      const anim = card.animate(
        [{ height: b.h, paddingTop: b.pt, paddingBottom: b.pb, opacity: 1 },
         { height: "0px", paddingTop: "0px", paddingBottom: "0px", opacity: 0 }],
        { duration: 260, easing: "cubic-bezier(.65, 0, .35, 1)", fill: "forwards" });
      const done = () => {
        row.classList.remove("jt-closing");
        if (!btn.isConnected || btn.getAttribute("aria-expanded") !== "true") return;
        btn.__jtPass = true;
        btn.click();
        btn.__jtPass = false;
      };
      anim.onfinish = done;
      anim.oncancel = done;
    }, true);
    new MutationObserver((recs) => {
      if (performance.now() - lastOpenClick > 600) return; // 再描画で戻ってきた詳細は動かさない
      recs.forEach((r) => r.addedNodes.forEach((n) => {
        if (!(n instanceof Element) || !n.classList.contains("detail-row")) return;
        const card = n.querySelector(".mod-detail-card");
        if (!card) return;
        const b = boxOf(card);
        card.style.overflow = "hidden";
        const anim = card.animate(
          [{ height: "0px", paddingTop: "0px", paddingBottom: "0px", opacity: 0 },
           { height: b.h, paddingTop: b.pt, paddingBottom: b.pb, opacity: 1 }],
          { duration: 380, easing: EASE });
        anim.onfinish = () => { card.style.overflow = ""; };
      }));
    }).observe(tbody, { childList: true });
  }

  /* ---------- 18. セクションの区切り線：表示されたら左から引かれる ---------- */
  const lineIO = new IntersectionObserver((es) => {
    es.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.parentElement.classList.add("is-lined");
      lineIO.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -8% 0px" });
  $$(".home-section").forEach((sec) => {
    const cs = getComputedStyle(sec);
    if (parseFloat(cs.borderBottomWidth) < .5 || cs.borderBottomStyle === "none") return;
    sec.style.setProperty("--jt-line-color", cs.borderBottomColor);
    sec.classList.add("jt-line");
    const s = document.createElement("span");
    s.className = "jt-line-sentinel";
    s.setAttribute("aria-hidden", "true");
    sec.appendChild(s);
    lineIO.observe(s);
  });

  /* ---------- 19. 翻訳プレビュー：切り替えはクロスフェード、つまみに「適用前／適用後」 ---------- */
  const track = document.getElementById("comparisonTrack");
  if (track) {
    const viewport = track.parentElement;
    const slides = Array.from(track.querySelectorAll(".comparison-slide"));
    const parseX = () => {
      const m = /translate3d\((-?[\d.]+)%/.exec(track.style.transform || "");
      return m ? Number(m[1]) : 0;
    };
    let lastX = parseX();
    viewport.classList.add("jt-xfade-host");
    new MutationObserver(() => {
      const x = parseX();
      if (x === lastX) return;
      const prev = slides[Math.round(-lastX / 100)];
      lastX = x;
      if (!prev) return;
      const ghost = prev.cloneNode(true);
      ghost.removeAttribute("aria-hidden");
      ghost.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
      ghost.querySelectorAll("input, button, a").forEach((n) => { n.tabIndex = -1; });
      const layer = document.createElement("div");
      layer.className = "jt-xfade";
      layer.setAttribute("aria-hidden", "true");
      layer.inert = true;
      layer.appendChild(ghost);
      viewport.appendChild(layer);
      const anim = layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduce ? 260 : 420, easing: "ease-out", fill: "forwards" });
      anim.onfinish = () => layer.remove();
    }).observe(track, { attributes: true, attributeFilter: ["style"] });

    $$(".comparison-stage").forEach((stage) => {
      const divider = $(".comparison-divider", stage);
      const range = $(".comparison-range", stage);
      if (!divider || !range) return;
      divider.insertAdjacentHTML("beforeend",
        '<span class="jt-side jt-side-before">適用前</span><span class="jt-side jt-side-after">適用後</span>');
      let t = 0, hover = false;
      const sync = () => {
        const v = Number(range.value);
        stage.classList.toggle("jt-hide-before", v < 16);
        stage.classList.toggle("jt-hide-after", v > 84);
      };
      const show = () => {
        sync();
        stage.classList.add("jt-labels-on");
        clearTimeout(t);
        t = setTimeout(() => { if (!hover) stage.classList.remove("jt-labels-on"); }, 1400);
      };
      range.addEventListener("input", show);
      stage.addEventListener("pointerenter", () => { hover = true; show(); });
      stage.addEventListener("pointerleave", () => { hover = false; show(); });
      sync();
    });
  }

  /* ---------- 20. 絞り込み時の件数：数字が素早く切り替わる ---------- */
  const countLine = document.getElementById("countLine");
  if (countLine) {
    let prevN = null, raf = 0;
    const NUM = /^(0 \/ )?([\d,]+)/;
    new MutationObserver(() => {
      const txt = countLine.textContent;
      if (txt === countLine.__jtLast) return;
      const m = NUM.exec(txt);
      if (!m) return;
      const n = Number(m[2].replace(/,/g, ""));
      const from = prevN;
      prevN = n;
      if (from === null || from === n) return;
      const tail = txt.slice(m[0].length), head = m[1] || "";
      cancelAnimationFrame(raf);
      countLine.classList.remove("jt-count-flash");
      void countLine.offsetWidth;
      countLine.classList.add("jt-count-flash");
      // 先に開始値を書いておき、最終値が1フレームだけ見えるのを防ぐ
      countLine.__jtLast = head + from.toLocaleString("ja-JP") + tail;
      countLine.textContent = countLine.__jtLast;
      const t0 = performance.now(), dur = reduce ? 1 : 360;
      const step = (now) => {
        const p = Math.min(1, Math.max(0, (now - t0) / dur));
        const v = Math.round(from + (n - from) * easeOutExpo(p));
        countLine.__jtLast = head + v.toLocaleString("ja-JP") + tail;
        countLine.textContent = countLine.__jtLast;
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }).observe(countLine, { childList: true, characterData: true, subtree: true });
  }

  /* ---------- 13. ページ内リンクはなめらかにスクロール ---------- */
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (reduce || !a || a.getAttribute("href") === "#" || a.getAttribute("href") === "#top") return;
    root.style.scrollBehavior = "smooth";
    setTimeout(() => { root.style.scrollBehavior = ""; }, 1200);
  }, true);
})();
