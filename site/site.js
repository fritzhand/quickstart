/* ============================================================
   site.js — the Quickstart runtime. Vanilla JS, no dependencies.
   Theme · drawer · search · copy · personalize · tabs · progress ·
   checklists · heading links · on-this-page rail.
   Everything saved lives in this browser's localStorage only:
     qs-theme   "light" | "dark"
     qs-details { user, repo, name, email }
     qs-tabs    { os, agent, where }
     qs-done    [slug, …]
     qs-checks  { "slug:index": 1 }
   Every storage call is wrapped: private windows and blocked storage
   must never break the page.
   ============================================================ */
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const html = document.documentElement;
  const ROOT = html.getAttribute("data-root") || "";
  const SLUG = html.getAttribute("data-slug") || "";
  const IS_MAC = /mac|iphone|ipad|ipod/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || "");

  const raw = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };
  const store = {
    get(k, fallback) { const v = raw.get(k); if (v == null) return fallback; try { const p = JSON.parse(v); return p ?? fallback; } catch { return fallback; } },
    set(k, v) { return raw.set(k, JSON.stringify(v)); },
    del: raw.del,
  };

  /* ---------------- toast ---------------- */
  const toastEl = $("#qs-toast");
  let toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2000);
  }

  /* ---------------- clipboard ---------------- */
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    } catch { /* fall through */ }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed"; ta.style.top = "-1000px"; ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
  function selectText(el) {
    try { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch { /* ignore */ }
  }

  /* ---------------- theme ---------------- */
  const themeBtn = $("#qs-theme");
  function syncThemeUI() {
    const dark = html.getAttribute("data-theme") === "dark";
    if (themeBtn) themeBtn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    const c = getComputedStyle(html).getPropertyValue("--theme-color").trim();
    if (c) $$('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", c));
  }
  function setTheme(t, save) {
    html.setAttribute("data-theme", t);
    if (save) raw.set("qs-theme", t);
    syncThemeUI();
  }
  if (themeBtn) themeBtn.addEventListener("click", () => setTheme(html.getAttribute("data-theme") === "dark" ? "light" : "dark", true));
  if (window.matchMedia) {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onSys = () => { const saved = raw.get("qs-theme"); if (saved !== "light" && saved !== "dark") setTheme(mq.matches ? "dark" : "light", false); };
    mq.addEventListener ? mq.addEventListener("change", onSys) : mq.addListener && mq.addListener(onSys);
  }
  if (raw.get("qs-theme")) syncThemeUI(); else if (themeBtn) themeBtn.setAttribute("aria-label", html.getAttribute("data-theme") === "dark" ? "Switch to light theme" : "Switch to dark theme");

  /* ---------------- keyboard hint ---------------- */
  $$("[data-k-hint]").forEach((k) => { k.textContent = IS_MAC ? "⌘K" : "Ctrl K"; });

  /* ---------------- focus trap for dialogs + drawer ---------------- */
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function trapTab(container, e) {
    if (e.key !== "Tab") return;
    const f = $$(FOCUSABLE, container).filter((el) => el.offsetParent !== null || el.getClientRects().length);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  const setInert = (on) => {
    [$("#main"), $(".footer")].forEach((el) => { if (el) { if (on) el.setAttribute("inert", ""); else el.removeAttribute("inert"); } });
  };

  /* ---------------- mobile drawer ---------------- */
  const navBtn = $("#qs-nav-toggle"), sidebar = $("#qs-sidebar"), scrim = $("#qs-scrim");
  const desktop = window.matchMedia ? matchMedia("(min-width: 1024px)") : { matches: true };
  const isNavOpen = () => document.body.classList.contains("nav-open");
  function openNav() {
    if (isNavOpen() || desktop.matches) return;
    const y = window.scrollY || 0;
    document.body.dataset.lockY = String(y);
    document.body.style.top = `-${y}px`;
    document.body.classList.add("nav-open");
    if (navBtn) { navBtn.setAttribute("aria-expanded", "true"); navBtn.setAttribute("aria-label", "Close navigation"); }
    setInert(true);
    const cur = sidebar && ($('.nav-link[aria-current="page"]', sidebar) || $(".nav-link", sidebar));
    if (cur) setTimeout(() => cur.focus({ preventScroll: true }), 60);
  }
  function closeNav(returnFocus = true) {
    if (!isNavOpen()) return;
    document.body.classList.remove("nav-open");
    const y = parseInt(document.body.dataset.lockY || "0", 10);
    document.body.style.top = "";
    window.scrollTo({ top: y, left: 0, behavior: "instant" });
    if (navBtn) { navBtn.setAttribute("aria-expanded", "false"); navBtn.setAttribute("aria-label", "Open navigation"); }
    setInert(false);
    if (returnFocus && navBtn) navBtn.focus();
  }
  if (navBtn) navBtn.addEventListener("click", () => (isNavOpen() ? closeNav() : openNav()));
  if (scrim) scrim.addEventListener("click", () => closeNav());
  /* while the drawer is open, Tab cycles through the toggle + the drawer links */
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || !isNavOpen() || !sidebar || !navBtn) return;
    const f = [navBtn, ...$$(FOCUSABLE, sidebar)];
    const i = f.indexOf(document.activeElement);
    if (i < 0) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus(); }
    else if (e.shiftKey && i === 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  });
  const onDesktop = () => { if (desktop.matches) closeNav(false); };
  desktop.addEventListener ? desktop.addEventListener("change", onDesktop) : desktop.addListener && desktop.addListener(onDesktop);

  /* keep the current page visible in a long sidebar */
  const current = sidebar && $('.nav-link[aria-current="page"]', sidebar);
  if (current && sidebar) {
    const top = current.offsetTop, h = sidebar.clientHeight;
    if (top > h - 80) sidebar.scrollTop = top - h / 2;
  }

  /* ---------------- modals (search + personalize) ---------------- */
  let openModal = null, lastFocus = null;
  function showModal(m, focusEl) {
    if (!m) return;
    if (openModal && openModal !== m) hideModal(false);
    closeNav(false);
    lastFocus = document.activeElement;
    m.hidden = false;
    openModal = m;
    html.classList.add("modal-open");
    setInert(true);
    (focusEl || $(FOCUSABLE, m))?.focus();
  }
  function hideModal(restore = true) {
    if (!openModal) return;
    if (openModal.contains(document.activeElement)) document.activeElement.blur();
    openModal.hidden = true;
    openModal = null;
    html.classList.remove("modal-open");
    setInert(false);
    if (restore && lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $$(".modal").forEach((m) => {
    $$("[data-close]", m).forEach((b) => b.addEventListener("click", () => hideModal()));
    m.addEventListener("keydown", (e) => trapTab(m, e));
  });

  /* ---------------- search ---------------- */
  const sModal = $("#qs-search"), sInput = $("#qs-search-input"), sResults = $("#qs-search-results"), sStatus = $("#qs-search-status");
  let INDEX = null, loading = null, sel = -1;
  const norm = (s) => String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  function loadIndex() {
    if (!loading) {
      loading = fetch(`${ROOT}assets/search-index.json`)
        .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
        .then((data) => {
          INDEX = data.map((p) => ({
            ...p,
            _t: norm(p.t), _n: norm(p.n), _d: norm(p.d), _g: norm(p.g),
            _s: (p.s || []).map(([id, h, x]) => ({ id, h, x, _h: norm(h), _x: norm(x) })),
          }));
        })
        .catch(() => { INDEX = false; });
    }
    return loading;
  }
  const navIcon = (u) => {
    const a = sidebar && $(`.nav-link[data-slug="${CSS.escape(u.replace(/\.html$/, ""))}"] .nav-ic`, sidebar);
    return a ? a.innerHTML : "";
  };
  function mark(text, terms) {
    let out = esc(text);
    const t = terms.filter((x) => x.length > 1).sort((a, b) => b.length - a.length);
    if (!t.length) return out;
    const re = new RegExp(`(${t.map((x) => esc(x).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
    return out.replace(re, "<mark>$1</mark>");
  }
  function snippet(text, terms) {
    const low = text.toLowerCase();
    let at = -1;
    for (const t of terms) { const i = low.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; }
    if (at < 0) return text.length > 150 ? `${text.slice(0, 150).replace(/\s\S*$/, "")}…` : text;
    const start = Math.max(0, at - 50);
    const s = text.slice(start, start + 160);
    return `${start > 0 ? "…" : ""}${s.replace(/^\S*\s/, start > 0 ? "" : "$&").replace(/\s\S*$/, "")}…`;
  }
  function runSearch(q) {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    const phrase = norm(q).trim();
    const hits = [];
    for (const p of INDEX) {
      let score = 0;
      for (const term of terms) {
        let s = 0;
        if (p._t.includes(term)) s += p._t.startsWith(term) ? 40 : 26;
        if (p._n.includes(term)) s += 20;
        if (p._d.includes(term)) s += 8;
        if (p._g.includes(term)) s += 4;
        for (const sec of p._s) { if (sec._h.includes(term)) s += 10; else if (sec._x.includes(term)) s += 2; }
        if (!s) { score = -1; break; }
        score += s;
      }
      if (score < 0) continue;
      if (phrase.length > 2 && (p._t.includes(phrase) || p._n.includes(phrase))) score += 60;
      /* best section: most terms, headings weigh more, whole phrase wins */
      let best = null, bestScore = 0;
      for (const sec of p._s) {
        let ss = 0;
        for (const term of terms) { if (sec._h.includes(term)) ss += 6; else if (sec._x.includes(term)) ss += 2; }
        if (phrase.length > 2 && (sec._h.includes(phrase) || sec._x.includes(phrase))) ss += 8;
        if (ss > bestScore) { bestScore = ss; best = sec; }
      }
      const titleHit = terms.every((t) => p._t.includes(t) || p._n.includes(t));
      hits.push({ p, score, sec: titleHit && !(best && best.id && terms.every((t) => best._h.includes(t))) ? null : best });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, 12);
  }
  function render(qRaw) {
    if (!sResults) return;
    sel = -1;
    if (sInput) sInput.removeAttribute("aria-activedescendant");
    if (INDEX === false) { sResults.innerHTML = `<div class="none">Search needs the site to be served over http(s). Use the sidebar instead.</div>`; return; }
    if (!INDEX) { sResults.innerHTML = `<div class="none">Loading…</div>`; return; }
    const q = qRaw.trim();
    const terms = norm(q).split(/\s+/).filter(Boolean);
    let items;
    if (!q) {
      items = INDEX.map((p) => ({ p, sec: null, sub: p.g }));
      sResults.innerHTML = `<div class="r-label">All pages</div>`;
    } else {
      items = runSearch(q).map(({ p, sec }) => ({ p, sec, sub: snippet(sec && sec.x ? sec.x : p.d, terms) }));
      sResults.innerHTML = "";
    }
    if (sStatus) sStatus.textContent = q ? `${items.length} result${items.length === 1 ? "" : "s"}` : "";
    if (!items.length) { sResults.innerHTML = `<div class="none">No matches for “${esc(q)}”. Try a shorter word.</div>`; return; }
    sResults.insertAdjacentHTML("beforeend", items.map(({ p, sec, sub }, i) => {
      const href = `${ROOT}${p.u}${sec && sec.id ? `#${encodeURIComponent(sec.id)}` : ""}`;
      return `<a class="hit" role="option" id="qs-hit-${i}" href="${esc(href)}" aria-selected="false">
        <span class="hit-ic" aria-hidden="true">${navIcon(p.u)}</span>
        <span class="hit-body"><span class="hit-title">${mark(p.n || p.t, terms)}${sec && sec.h ? `<span class="hit-sec"> › ${mark(sec.h, terms)}</span>` : ""}</span>
        ${sub ? `<span class="hit-sub">${q ? mark(sub, terms) : esc(sub)}</span>` : ""}</span></a>`;
    }).join(""));
  }
  function moveSel(d) {
    const hits = $$(".hit", sResults);
    if (!hits.length) return;
    sel = sel < 0 ? (d > 0 ? 0 : hits.length - 1) : Math.max(0, Math.min(hits.length - 1, sel + d));
    hits.forEach((h, i) => { h.classList.toggle("sel", i === sel); h.setAttribute("aria-selected", String(i === sel)); });
    hits[sel].scrollIntoView({ block: "nearest" });
    sInput.setAttribute("aria-activedescendant", hits[sel].id);
  }
  function openSearch() {
    if (!sModal) return;
    showModal(sModal, sInput);
    if (sInput) sInput.value = "";
    render("");
    loadIndex().then(() => { if (!sModal.hidden) render(sInput ? sInput.value : ""); });
  }
  $$("[data-search-open]").forEach((b) => b.addEventListener("click", openSearch));
  if (sInput) {
    sInput.addEventListener("input", () => render(sInput.value));
    sInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); moveSel(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); moveSel(-1); }
      else if (e.key === "Enter") {
        const hits = $$(".hit", sResults);
        const h = hits[sel >= 0 ? sel : 0];
        if (h) { e.preventDefault(); h.click(); }
      }
    });
  }
  if (sResults) sResults.addEventListener("click", (e) => { if (e.target.closest(".hit")) hideModal(false); });

  /* ---------------- global keys ---------------- */
  const typing = (el) => el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key || "").toLowerCase() === "k") {
      e.preventDefault();
      if (openModal === sModal) hideModal(); else openSearch();
    } else if (e.key === "/" && !openModal && !typing(document.activeElement)) {
      e.preventDefault(); openSearch();
    } else if (e.key === "Escape") {
      if (openModal) hideModal(); else if (isNavOpen()) closeNav();
    }
  });

  /* ---------------- copy buttons ---------------- */
  $$("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const box = btn.closest(".say-box, .cmd-box");
      const pre = box && $("pre", box);
      if (!pre) return;
      const text = pre.textContent.replace(/\s+$/, "");
      const ok = await copyText(text);
      const label = $(".copy-label", btn);
      if (ok) {
        btn.classList.add("is-copied");
        if (label) label.textContent = "Copied";
        toast(box.classList.contains("say-box") ? "Copied. Paste it into your agent." : "Copied");
        setTimeout(() => { btn.classList.remove("is-copied"); if (label) label.textContent = "Copy"; }, 1800);
      } else {
        selectText(pre);
        toast(IS_MAC ? "Press ⌘C to copy" : "Press Ctrl+C to copy");
      }
    });
  });

  /* ---------------- personalize ---------------- */
  const KEYS = ["user", "repo", "name", "email"];
  const clean = (o) => { const d = {}; if (o && typeof o === "object") for (const k of KEYS) if (typeof o[k] === "string" && o[k].trim()) d[k] = o[k].trim().slice(0, 200); return d; };
  let details = clean(store.get("qs-details", {}));
  const pzModal = $("#qs-pz");
  const vars = $$("var[data-k]");
  vars.forEach((v) => { v.dataset.ph = v.textContent; v.title = "Fill in your details to personalize this"; });
  function applyDetails() {
    vars.forEach((v) => {
      const val = details[v.dataset.k] || "";
      v.textContent = val || v.dataset.ph;
      v.classList.toggle("is-filled", !!val);
      v.title = val ? "From your saved details" : "Fill in your details to personalize this";
    });
    $$(".say-box").forEach((box) => {
      const foot = $(".say-foot", box);
      if (foot) foot.hidden = !$$("var[data-k]", box).some((v) => !v.classList.contains("is-filled"));
    });
    $$(".pz-open").forEach((b) => b.classList.toggle("has-details", Object.keys(details).length > 0));
    $$("[data-pz-form]").forEach((form) => {
      for (const k of KEYS) { const inp = form.elements[k]; if (inp && inp !== document.activeElement) inp.value = details[k] || ""; }
      const warnEl = $("[data-pz-warn]", form);
      if (warnEl) warnEl.hidden = !(details.email && !/@users\.noreply\.github\.com$/i.test(details.email));
    });
  }
  function saveDetails(statusEl) {
    const ok = Object.keys(details).length ? store.set("qs-details", details) : (store.del("qs-details"), true);
    if (statusEl) {
      statusEl.textContent = ok ? "Saved in this browser." : "Couldn’t save (storage is blocked), but this page is filled in.";
      statusEl.classList.toggle("is-saved", ok);
      clearTimeout(statusEl._t);
      statusEl._t = setTimeout(() => { statusEl.textContent = "Saved only in this browser."; statusEl.classList.remove("is-saved"); }, 2200);
    }
  }
  $$("[data-pz-form]").forEach((form) => {
    const status = $("[data-pz-status]", form);
    form.addEventListener("input", (e) => {
      const k = e.target && e.target.name;
      if (!KEYS.includes(k)) return;
      const v = e.target.value.trim();
      if (v) details[k] = v.slice(0, 200); else delete details[k];
      applyDetails();
      saveDetails(status);
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      saveDetails(status);
      if (form.closest("#qs-pz")) { hideModal(); toast(Object.keys(details).length ? "Details saved. Prompts are filled in." : "Saved"); }
      else toast("Details saved. Prompts are filled in.");
    });
    const clear = $("[data-pz-clear]", form);
    if (clear) clear.addEventListener("click", () => {
      details = {};
      store.del("qs-details");
      $$("[data-pz-form] input").forEach((i) => { i.value = ""; });
      applyDetails();
      toast("Details cleared");
    });
  });
  $$("[data-personalize-open]").forEach((b) => b.addEventListener("click", () => {
    showModal(pzModal, pzModal && $('input[name="user"]', pzModal));
  }));
  applyDetails();

  /* ---------------- tabs ---------------- */
  let tabPrefs = store.get("qs-tabs", {});
  if (!tabPrefs || typeof tabPrefs !== "object") tabPrefs = {};
  const tabSets = $$(".tabs");
  function selectInSet(set, value, focus) {
    const btns = $$(":scope > .tab-list > .tab-btn", set), panels = $$(":scope > .tab-panel", set);
    let idx = btns.findIndex((b) => b.dataset.tab === value);
    if (idx < 0) idx = 0;
    btns.forEach((b, i) => { b.setAttribute("aria-selected", String(i === idx)); b.tabIndex = i === idx ? 0 : -1; });
    panels.forEach((p, i) => { p.hidden = i !== idx; });
    if (focus && btns[idx]) btns[idx].focus();
  }
  function chooseTab(set, value, focus) {
    const group = set.dataset.group;
    if (!group) { selectInSet(set, value, focus); return; }
    const anchor = set.getBoundingClientRect().top;
    tabPrefs[group] = value;
    store.set("qs-tabs", tabPrefs);
    html.setAttribute(`data-tab-${group}`, value);
    tabSets.filter((s) => s.dataset.group === group).forEach((s) => selectInSet(s, value, focus && s === set));
    const drift = set.getBoundingClientRect().top - anchor;
    if (Math.abs(drift) > 1) window.scrollBy(0, drift); /* keep the clicked tabs under the pointer */
  }
  tabSets.forEach((set, si) => {
    const list = $(":scope > .tab-list", set);
    const btns = $$(":scope > .tab-list > .tab-btn", set), panels = $$(":scope > .tab-panel", set);
    if (!list || !btns.length) return;
    list.setAttribute("role", "tablist");
    btns.forEach((b, i) => {
      const p = panels[i];
      b.id = `qs-tab-${si}-${i}`;
      b.setAttribute("role", "tab");
      if (p) { p.id = p.id || `qs-panel-${si}-${i}`; b.setAttribute("aria-controls", p.id); p.setAttribute("role", "tabpanel"); p.setAttribute("aria-labelledby", b.id); p.tabIndex = 0; }
      b.addEventListener("click", () => chooseTab(set, b.dataset.tab, false));
      b.addEventListener("keydown", (e) => {
        let j = -1;
        if (e.key === "ArrowRight") j = (i + 1) % btns.length;
        else if (e.key === "ArrowLeft") j = (i - 1 + btns.length) % btns.length;
        else if (e.key === "Home") j = 0;
        else if (e.key === "End") j = btns.length - 1;
        if (j >= 0) { e.preventDefault(); chooseTab(set, btns[j].dataset.tab, true); }
      });
    });
    const group = set.dataset.group;
    selectInSet(set, group ? html.getAttribute(`data-tab-${group}`) : btns[0].dataset.tab, false);
    set.classList.add("is-ready");
  });

  /* ---------------- progress ---------------- */
  const pages = sidebar ? $$(".nav-link[data-slug]", sidebar).map((a) => ({ slug: a.dataset.slug, href: a.getAttribute("href"), title: $(".nav-t", a).textContent, a })) : [];
  const known = new Set(pages.map((p) => p.slug));
  let done = new Set((Array.isArray(store.get("qs-done", [])) ? store.get("qs-done", []) : []).filter((s) => known.has(s)));
  function renderProgress() {
    const n = pages.length, d = pages.filter((p) => done.has(p.slug)).length;
    pages.forEach((p) => p.a.classList.toggle("is-done", done.has(p.slug)));
    $$("[data-p-done]").forEach((el) => { el.textContent = String(d); });
    $$('.bar[role="progressbar"]').forEach((bar) => {
      bar.setAttribute("aria-valuenow", String(d));
      bar.setAttribute("aria-valuetext", `${d} of ${n} pages done`);
      const fill = $("span", bar);
      if (fill) fill.style.width = `${n ? (d / n) * 100 : 0}%`;
    });
    const t = $("[data-done-toggle]");
    if (t) {
      const on = done.has(SLUG);
      t.setAttribute("aria-pressed", String(on));
      const l = $(".done-label", t);
      if (l) l.textContent = on ? "Done! Marked as complete" : "Mark this page as done";
    }
    const next = pages.find((p) => !done.has(p.slug) && p.slug !== SLUG) || null;
    $$("[data-p-next-wrap]").forEach((w) => {
      const a = $("[data-p-next]", w), l = $("[data-p-next-label]", w);
      w.hidden = !next;
      if (next && a) { if (l) l.textContent = d ? "Continue:" : "Start with:"; a.textContent = next.title; a.setAttribute("href", next.href); }
    });
    $$("[data-p-finished]").forEach((el) => { el.hidden = d !== n; });
  }
  const doneBtn = $("[data-done-toggle]");
  if (doneBtn && known.has(SLUG)) {
    doneBtn.addEventListener("click", () => {
      if (done.has(SLUG)) done.delete(SLUG); else done.add(SLUG);
      store.set("qs-done", [...done]);
      renderProgress();
      toast(done.has(SLUG) ? `Marked as done. ${done.size} of ${pages.length} pages.` : "Marked as not done");
    });
  } else if (doneBtn) {
    doneBtn.closest(".done-row")?.remove();
  }
  $$("[data-p-reset]").forEach((b) => b.addEventListener("click", () => {
    if (!window.confirm("Clear your progress on this device? Your saved details stay.")) return;
    done = new Set();
    store.del("qs-done");
    renderProgress();
    toast("Progress reset");
  }));
  renderProgress();

  /* ---------------- checklists ---------------- */
  const checks = store.get("qs-checks", {}) || {};
  $$("input.ck-input[data-ck]").forEach((inp) => {
    const key = `${SLUG}:${inp.dataset.ck}`;
    inp.checked = !!checks[key];
    inp.addEventListener("change", () => {
      if (inp.checked) checks[key] = 1; else delete checks[key];
      store.set("qs-checks", checks);
    });
  });

  /* ---------------- heading links ---------------- */
  $$(".h-anchor").forEach((a) => a.addEventListener("click", async (e) => {
    e.preventDefault();
    const id = a.getAttribute("href").slice(1);
    const url = `${location.href.split("#")[0]}#${id}`;
    try { history.replaceState(null, "", `#${id}`); } catch { /* file:// */ }
    const target = document.getElementById(decodeURIComponent(id));
    if (target) target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    if (await copyText(url)) toast("Link to this section copied");
  }));

  /* ---------------- on-this-page rail ---------------- */
  const tocLinks = $$(".toc a");
  if (tocLinks.length) {
    const byId = new Map(tocLinks.map((a) => [decodeURIComponent(a.getAttribute("href").slice(1)), a]));
    const heads = [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean);
    let ticking = false;
    const update = () => {
      ticking = false;
      let cur = null; /* the last section heading that has scrolled past the top bar */
      for (const h of heads) { if (h.getBoundingClientRect().top <= 140) cur = h; else break; }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = heads[heads.length - 1] || cur;
      tocLinks.forEach((a) => a.classList.toggle("active", !!cur && a === byId.get(cur.id)));
    };
    window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }
})();
