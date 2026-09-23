#!/usr/bin/env node
/* ============================================================
   build.mjs — the Quickstart static-site engine.

   content/nav.json + content/<slug>.html + site/ + site.config.json
     → docs/  (what GitHub Pages serves from main → /docs)

   Node ≥ 18, ESM, zero npm dependencies. Content-agnostic: every page,
   label and link comes from content/ and site.config.json.

   It FAILS LOUDLY: every problem it finds is listed and the process exits
   non-zero before anything is written, so docs/ keeps the last good build.
   Run:  node build.mjs
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONTENT = path.join(ROOT, "content");
const SITE = path.join(ROOT, "site");
const OUT = path.join(ROOT, "docs");
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

/* ---------------- error collection ---------------- */
const errors = [];
const warnings = [];
const fail = (where, msg) => errors.push(where ? `${where}  ${msg}` : msg);
const warn = (where, msg) => warnings.push(where ? `${where}  ${msg}` : msg);
function bail() {
  console.error(`\n✗ build failed: ${errors.length} error${errors.length === 1 ? "" : "s"}\n`);
  for (const e of errors) console.error(`  • ${e}`);
  for (const w of warnings) console.error(`  ⚠ ${w}`);
  console.error("");
  process.exit(1);
}
function readJSON(file) {
  let raw;
  try { raw = fs.readFileSync(file, "utf8"); } catch { fail(rel(file), "file is missing"); return null; }
  try { return JSON.parse(raw); } catch (e) { fail(rel(file), `invalid JSON: ${e.message}`); return null; }
}

/* ---------------- small helpers ---------------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const attr = esc;
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rarr: "→", larr: "←", uarr: "↑", darr: "↓", mdash: "—", ndash: "–", hellip: "…", middot: "·", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", times: "×", copy: "©", bull: "•", check: "✓" };
const decode = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
  if (e[0] === "#") {
    const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
  }
  return ENT[e] ?? ENT[e.toLowerCase()] ?? m;
});
const squash = (s) => s.replace(/\s+/g, " ").trim();
const slugify = (s) => (s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  .slice(0, 64).replace(/-+$/, "")) || "section";

/* ---------------- config + nav ---------------- */
const CONFIG = readJSON(path.join(ROOT, "site.config.json"));
const NAV = readJSON(path.join(CONTENT, "nav.json"));
if (!CONFIG || !NAV) bail();

for (const k of ["siteName", "siteBase", "pathPrefix", "repo"]) {
  if (typeof CONFIG[k] !== "string" || !CONFIG[k].trim()) fail("site.config.json", `"${k}" is required`);
}
if (CONFIG.siteBase && !/^https:\/\/.+\/$/.test(CONFIG.siteBase)) fail("site.config.json", `"siteBase" must be an https:// URL ending in "/"`);
if (CONFIG.pathPrefix && !/^\/(.+\/)?$/.test(CONFIG.pathPrefix)) fail("site.config.json", `"pathPrefix" must start and end with "/" (e.g. "/quickstart/")`);
if (CONFIG.repo && !/^https:\/\//.test(CONFIG.repo)) fail("site.config.json", `"repo" must be an https:// URL`);
if (CONFIG.author && (typeof CONFIG.author.name !== "string" || !/^https:\/\//.test(CONFIG.author.github || ""))) {
  fail("site.config.json", `"author" needs "name" and an https:// "github" URL`);
}
if (errors.length) bail();

const SITE_NAME = CONFIG.siteName;
const SITE_TAGLINE = CONFIG.siteTagline || "";
const SITE_BASE = CONFIG.siteBase;
const PATH_PREFIX = CONFIG.pathPrefix;
const REPO_URL = CONFIG.repo;
const AUTHOR = CONFIG.author || null;

/* ---------------- vocabulary (mirrors CLAUDE.md) ---------------- */
const META_KEYS = ["title", "eyebrow", "lede", "time", "track", "jump", "hero", "cta"];
const TRACKS = {
  all: null,
  app: { label: "App path", icon: "smartphone" },
  vscode: { label: "VS Code path", icon: "monitor" },
};
const VAR_KEYS = ["user", "repo", "name", "email"];
/* Tab groups and their values. site.css and the inline boot script know
   these too (so the remembered tab shows before site.js runs). */
const TAB_GROUPS = {
  os: { label: "Your computer", values: ["mac", "windows"] },
  agent: { label: "Your agent", values: ["claude", "codex"] },
  where: { label: "Where you run it", values: ["app", "vscode"] },
};
const CALLOUTS = {
  tip: { title: "Tip", icon: "lightbulb" },
  note: { title: "Note", icon: "info" },
  warn: { title: "Heads up", icon: "alert" },
  manual: { title: "Do this yourself", icon: "hand" },
  check: { title: "Check it worked", icon: "check-circle" },
};
const DG_CLASSES = new Set([
  "dg",
  "dg-box", "dg-box-primary", "dg-box-accent", "dg-box-soft", "dg-box-dashed",
  "dg-line", "dg-line-accent", "dg-line-dashed",
  "dg-arrowhead", "dg-arrowhead-accent",
  "dg-text", "dg-text-sm", "dg-text-strong", "dg-label", "dg-text-on",
  "dg-fill-primary", "dg-fill-accent", "dg-fill-soft",
]);
const HTML_TAGS = new Set(("a abbr aside b blockquote br caption cite code col colgroup dd del details dfn div dl dt em " +
  "figcaption figure h2 h3 h4 h5 h6 hr i img ins kbd li mark ol p pre q s samp section small span strong sub summary sup " +
  "table tbody td tfoot th thead time tr u ul var wbr").split(" "));
const SVG_TAGS = new Set("svg g rect circle ellipse line polyline polygon path text tspan title desc defs marker use symbol".split(" "));
const VOID = new Set("area base br col embed hr img input link meta source track wbr".split(" "));
const OPTIONAL_CLOSE = new Set("p li dt dd tr td th thead tbody tfoot colgroup".split(" "));
/* Like a browser: an opening tag implicitly closes these open siblings. */
const IMPLIED_CLOSE = { li: ["li"], dt: ["dt", "dd"], dd: ["dt", "dd"], tr: ["tr", "td", "th"], td: ["td", "th"], th: ["td", "th"], tbody: ["tbody", "thead", "tr", "td", "th"], tfoot: ["tbody", "thead", "tr", "td", "th"] };
const CLOSES_P = new Set("address article aside blockquote details div dl figcaption figure h1 h2 h3 h4 h5 h6 hr ol p pre section table ul".split(" "));
const BLOCKISH = new Set("p div section aside li ul ol h2 h3 h4 h5 h6 pre table tr td th figure figcaption details summary blockquote dd dt br hr".split(" "));
const COLOR_ATTRS = new Set(["fill", "stroke", "stop-color", "flood-color", "lighting-color", "color"]);
const RESERVED_IDS = new Set(["main"]); // plus anything starting with "qs-"

/* ---------------- icons (lucide-style: 24×24, stroke 2, round caps) ---------------- */
const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
const ICONS = {
  /* nav */
  flag: I('<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 8 2a6 6 0 0 0 3-.7V14a6 6 0 0 1-3 .7c-3 0-5-2-8-2a6 6 0 0 0-4 1.4"/>'),
  map: I('<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14"/>'),
  mic: I('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4"/>'),
  github: I('<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>'),
  split: I('<path d="M16 3h5v5M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.17-2.87L3 3m12 6 6-6"/>'),
  smartphone: I('<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>'),
  layers: I('<path d="m12 2 9 5-9 5-9-5 9-5Zm-9 10 9 5 9-5M3 17l9 5 9-5"/>'),
  monitor: I('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>'),
  wrench: I('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z"/>'),
  shield: I('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z"/><path d="m9 12 2 2 4-4"/>'),
  "folder-lock": I('<rect x="14" y="17" width="8" height="5" rx="1"/><path d="M10 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v2.5"/><path d="M20 17v-2a2 2 0 1 0-4 0v2"/>'),
  box: I('<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>'),
  "git-fork": I('<circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9m6 3v3"/>'),
  upload: I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5m5-5v12"/>'),
  "git-branch": I('<path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>'),
  "user-check": I('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>'),
  layout: I('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>'),
  pencil: I('<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5Z"/><path d="m15 5 4 4"/>'),
  globe: I('<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z"/>'),
  share: I('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>'),
  clipboard: I('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>'),
  "life-buoy": I('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="m4.93 4.93 4.24 4.24m5.66 0 4.24-4.24m0 14.14-4.24-4.24m-5.66 0-4.24 4.24"/>'),
  book: I('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15Z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>'),
  info: I('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/>'),
  /* ui */
  menu: I('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  x: I('<path d="M18 6 6 18M6 6l12 12"/>'),
  search: I('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  sun: I('<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4"/>'),
  moon: I('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
  user: I('<circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/>'),
  copy: I('<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"/>'),
  check: I('<path d="M20 6 9 17l-5-5"/>'),
  external: I('<path d="M15 3h6v6m0-6L10 14M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
  "arrow-left": I('<path d="M19 12H5m7 7-7-7 7-7"/>'),
  "arrow-right": I('<path d="M5 12h14m-7-7 7 7-7 7"/>'),
  chevron: I('<path d="m9 18 6-6-6-6"/>'),
  clock: I('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  message: I('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/><path d="M8 9h8M8 13h5"/>'),
  terminal: I('<rect x="2" y="3" width="20" height="18" rx="2"/><path d="m7 9 3 3-3 3m6 0h4"/>'),
  lightbulb: I('<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6m-5 4h4"/>'),
  alert: I('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4m0 4h.01"/>'),
  hand: I('<path d="M14 4.1 12 6M5.1 8l-2.9-.8M6 12l-1.9 2M7.2 2.2 8 5.1"/><path d="M9.04 9.69a.5.5 0 0 1 .65-.65l11 4.5a.5.5 0 0 1-.07.95l-4.35 1.04a1 1 0 0 0-.74.74l-1.04 4.35a.5.5 0 0 1-.95.07Z"/>'),
  "check-circle": I('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
  circle: I('<circle cx="12" cy="12" r="10"/>'),
  link: I('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
  skip: I('<path d="m6 17 5-5-5-5m7 10 5-5-5-5"/>'),
  reset: I('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'),
};
const icon = (name, cls = "") => (ICONS[name] || "").replace("<svg ", `<svg${cls ? ` class="${cls}"` : ""} `);

/* ---------------- tokens.css: meta tokens + no-JS dark theme ---------------- */
const TOKENS_SRC = fs.readFileSync(path.join(SITE, "tokens.css"), "utf8");
const FONTS_HREF = (TOKENS_SRC.match(/--fonts-href:\s*"([^"]+)"/) || [])[1] || "";
const darkBlock = TOKENS_SRC.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/);
const lightTheme = (TOKENS_SRC.match(/--theme-color:\s*(#[0-9a-fA-F]{3,8})/) || [])[1] || "";
const darkTheme = darkBlock ? ((darkBlock[1].match(/--theme-color:\s*(#[0-9a-fA-F]{3,8})/) || [])[1] || "") : "";
if (!darkBlock) fail("site/tokens.css", `no :root[data-theme="dark"] { … } block found`);
const TOKENS_OUT = TOKENS_SRC + (darkBlock ? `
/* ---- generated by build.mjs: the dark block again, for readers with
   JavaScript off (no data-theme attribute) and a dark system setting ---- */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {${darkBlock[1]}}
}
` : "");

/* ============================================================
   A tiny, forgiving HTML parser (no dependencies).
   It keeps every byte of the source so the output is the input plus
   the engine's additions. Nodes:
     { t: "text"|"comment", raw }
     { t: "el", name, tag, attrs: [[name, value|null]], open, close,
       kids, parent, line, pre, post, before, after, dirty, inner }
   pre/post are inserted inside the element; before/after around it;
   inner(html) rewrites the serialized children.
   ============================================================ */
const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
const ATTR = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function parseAttrs(s) {
  const out = [];
  let m;
  ATTR.lastIndex = 0;
  while ((m = ATTR.exec(s))) out.push([m[1], m[2] ?? m[3] ?? m[4] ?? null]);
  return out;
}

function parseHTML(html, where, lineOffset) {
  const root = { t: "root", kids: [], name: "#root" };
  const stack = [root];
  let last = 0, line = 1 + lineOffset, lineAt = 0, m;
  const lineOf = (idx) => { for (; lineAt < idx; lineAt++) if (html.charCodeAt(lineAt) === 10) line++; return line; };
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(html))) {
    const top = stack[stack.length - 1];
    if (m.index > last) top.kids.push({ t: "text", raw: html.slice(last, m.index) });
    last = TOKEN.lastIndex;
    const ln = lineOf(m.index);
    if (m[0].startsWith("<!--")) { top.kids.push({ t: "comment", raw: m[0] }); continue; }
    const tag = m[2], name = tag.toLowerCase();
    if (m[1] === "/") {
      let i = stack.length - 1;
      while (i > 0 && stack[i].name !== name) i--;
      if (i === 0) {
        fail(`${where}:${ln}`, `stray closing tag </${tag}> (nothing to close)${name === "p" ? ` — a block element (<div>, <ul>, <pre>, <figure>, <aside>…) inside <p> ends the paragraph early` : ""}`);
        top.kids.push({ t: "text", raw: m[0] });
        continue;
      }
      for (let j = stack.length - 1; j > i; j--) {
        if (!OPTIONAL_CLOSE.has(stack[j].name)) fail(`${where}:${stack[j].line}`, `<${stack[j].tag}> is never closed (found </${tag}> first on line ${ln})`);
      }
      stack[i].close = m[0];
      stack.length = i;
      continue;
    }
    while (stack.length > 1 && ((IMPLIED_CLOSE[name] || []).includes(stack[stack.length - 1].name) || (CLOSES_P.has(name) && stack[stack.length - 1].name === "p"))) stack.length--;
    let a = m[3];
    const selfClose = /\/\s*$/.test(a);
    if (selfClose) a = a.replace(/\/\s*$/, "");
    const parent = stack[stack.length - 1];
    const node = { t: "el", name, tag, attrs: parseAttrs(a), open: m[0], close: "", kids: [], parent, line: ln, selfClose, pre: "", post: "", before: "", after: "", dirty: false, inner: null };
    parent.kids.push(node);
    if (!VOID.has(name) && !selfClose) stack.push(node);
  }
  if (last < html.length) stack[stack.length - 1].kids.push({ t: "text", raw: html.slice(last) });
  for (let j = stack.length - 1; j > 0; j--) {
    if (!OPTIONAL_CLOSE.has(stack[j].name)) fail(`${where}:${stack[j].line}`, `<${stack[j].tag}> is never closed`);
  }
  return root;
}

const getA = (n, k) => { const a = n.attrs.find(([x]) => x.toLowerCase() === k); return a ? (a[1] ?? "") : undefined; };
const hasA = (n, k) => n.attrs.some(([x]) => x.toLowerCase() === k);
const setA = (n, k, v) => { const a = n.attrs.find(([x]) => x.toLowerCase() === k); if (a) a[1] = v; else n.attrs.push([k, v]); n.dirty = true; };
const classes = (n) => (getA(n, "class") || "").split(/\s+/).filter(Boolean);
const hasClass = (n, c) => classes(n).includes(c);
const addClass = (n, c) => { if (!hasClass(n, c)) setA(n, "class", [...classes(n), c].join(" ")); };
const elKids = (n) => n.kids.filter((k) => k.t === "el");
const hasAncestor = (n, test) => { for (let p = n.parent; p && p.t === "el"; p = p.parent) if (test(p)) return true; return false; };
function walk(n, fn) { for (const k of n.kids) if (k.t === "el") { fn(k); walk(k, fn); } }
function textOf(n) {
  let s = "";
  for (const k of n.kids) s += k.t === "text" ? decode(k.raw) : k.t === "el" ? textOf(k) : "";
  return s;
}
function serialize(n) {
  if (n.t === "text" || n.t === "comment") return n.raw;
  let inner = n.kids.map(serialize).join("");
  if (n.inner) inner = n.inner(inner);
  if (n.t === "root") return inner;
  const open = n.dirty
    ? `<${n.tag}${n.attrs.map(([k, v]) => (v === null ? ` ${k}` : ` ${k}="${String(v).replace(/"/g, "&quot;")}"`)).join("")}${n.selfClose ? " /" : ""}>`
    : n.open;
  return n.before + open + n.pre + inner + n.post + n.close + n.after;
}
/* Strip the blank first/last lines and the common indent of a <pre> body. */
function dedent(s) {
  const lines = s.replace(/\r\n?/g, "\n").replace(/^(?:[ \t]*\n)+/, "").replace(/\s+$/, "").split("\n");
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)[0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(Math.min(min, l.match(/^[ \t]*/)[0].length))).join("\n");
}

/* ---------------- read nav + content ---------------- */
const PAGES = [];          // nav order: { slug, nav, icon, group, groupIndex }
const BY_SLUG = new Map();
if (!Array.isArray(NAV.groups) || !NAV.groups.length) fail("content/nav.json", `needs a non-empty "groups" array`);
for (const [gi, g] of (NAV.groups || []).entries()) {
  if (typeof g.label !== "string" || !g.label.trim()) fail("content/nav.json", `group #${gi + 1} needs a "label"`);
  if (!Array.isArray(g.items) || !g.items.length) { fail("content/nav.json", `group "${g.label}" needs a non-empty "items" array`); continue; }
  for (const it of g.items) {
    const where = `content/nav.json [${g.label}]`;
    if (typeof it.slug !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(it.slug)) { fail(where, `invalid slug ${JSON.stringify(it.slug)} (lowercase letters, digits, hyphens)`); continue; }
    if (BY_SLUG.has(it.slug)) { fail(where, `duplicate slug "${it.slug}"`); continue; }
    if (typeof it.nav !== "string" || !it.nav.trim()) fail(where, `"${it.slug}" needs a "nav" label`);
    if (!it.icon || !ICONS[it.icon]) fail(where, `"${it.slug}" uses unknown icon ${JSON.stringify(it.icon)} (known: ${Object.keys(ICONS).join(", ")})`);
    const p = { slug: it.slug, nav: it.nav || it.slug, icon: it.icon, group: g.label, groupIndex: gi };
    PAGES.push(p);
    BY_SLUG.set(p.slug, p);
  }
}
if (!BY_SLUG.has("index")) fail("content/nav.json", `must include the home page, slug "index"`);

let contentFiles = [];
try { contentFiles = fs.readdirSync(CONTENT).filter((f) => f.endsWith(".html")); } catch { fail("content/", "folder is missing"); }
for (const f of contentFiles) {
  if (f.startsWith("_")) continue;
  const slug = f.slice(0, -5);
  if (!BY_SLUG.has(slug)) fail(`content/${f}`, `is not listed in content/nav.json (add it there, or prefix the file name with "_" to keep it as an unpublished draft)`);
}
for (const p of PAGES) if (!contentFiles.includes(`${p.slug}.html`)) fail("content/nav.json", `lists "${p.slug}" but content/${p.slug}.html does not exist`);

/* ---------------- process each page ---------------- */
function processPage(p) {
  const file = `content/${p.slug}.html`;
  const src = fs.readFileSync(path.join(CONTENT, `${p.slug}.html`), "utf8");
  const mm = src.match(/^\uFEFF?\s*<!--meta\b([\s\S]*?)-->/);
  if (!mm) { fail(file, `must start with a <!--meta { … } --> comment holding JSON`); return null; }
  let meta;
  try { meta = JSON.parse(mm[1]); } catch (e) { fail(`${file}:1`, `invalid meta JSON: ${e.message}`); return null; }
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) { fail(file, "meta must be a JSON object"); return null; }

  /* meta validation */
  for (const k of Object.keys(meta)) if (!META_KEYS.includes(k)) fail(file, `unknown meta key "${k}" (allowed: ${META_KEYS.join(", ")})`);
  for (const k of ["title", "eyebrow", "lede", "time"]) {
    if (typeof meta[k] !== "string" || !meta[k].trim()) fail(file, `meta "${k}" is required (a non-empty string)`);
  }
  meta.track = meta.track ?? "all";
  if (!(meta.track in TRACKS)) fail(file, `unknown track ${JSON.stringify(meta.track)} (use ${Object.keys(TRACKS).join(", ")})`);
  if (meta.hero !== undefined && typeof meta.hero !== "boolean") fail(file, `meta "hero" must be true or false`);
  if (meta.hero && p.slug !== "index") warn(file, `"hero": true is meant for the home page only`);
  const linkChecks = [];
  if (meta.jump !== undefined) {
    if (!meta.jump || typeof meta.jump.text !== "string" || !meta.jump.text.trim() || typeof meta.jump.href !== "string") fail(file, `meta "jump" needs { "text": "…", "href": "…" }`);
    else linkChecks.push({ href: meta.jump.href, where: `${file} (meta jump)`, inCode: false });
  }
  if (meta.cta !== undefined) {
    if (!Array.isArray(meta.cta)) fail(file, `meta "cta" must be an array of { "text", "href", "primary"? }`);
    else meta.cta.forEach((c, i) => {
      if (!c || typeof c.text !== "string" || !c.text.trim() || typeof c.href !== "string") fail(file, `meta "cta"[${i}] needs "text" and "href"`);
      else linkChecks.push({ href: c.href, where: `${file} (meta cta ${i + 1})`, inCode: false });
    });
  }

  const lineOffset = (mm[0].match(/\n/g) || []).length;
  const tree = parseHTML(src.slice(mm[0].length), file, lineOffset);
  const at = (n) => `${file}:${n.line}`;

  /* 1. element allowlist + ids */
  const ids = new Map();
  walk(tree, (n) => {
    const inSvg = n.name === "svg" || hasAncestor(n, (a) => a.name === "svg");
    if (n.name === "h1") fail(at(n), `<h1> is not allowed: the engine renders the page title — start sections at <h2>`);
    else if (n.name === "script" || n.name === "style") fail(at(n), `<${n.name}> is not allowed in content`);
    else if (inSvg) { if (!SVG_TAGS.has(n.name) && !HTML_TAGS.has(n.name)) fail(at(n), `unknown SVG element <${n.tag}>`); }
    else if (!HTML_TAGS.has(n.name)) {
      fail(at(n), SVG_TAGS.has(n.name)
        ? `<${n.tag}> must be inside an <svg>`
        : `unknown element <${n.tag}> — if this is a placeholder write <var>${n.tag}</var> (or &lt;${n.tag}&gt;)`);
    }
    const id = getA(n, "id");
    if (id !== undefined) {
      if (!id) fail(at(n), `empty id=""`);
      else if (ids.has(id)) fail(at(n), `duplicate id "${id}" (also on line ${ids.get(id).line})`);
      else if (RESERVED_IDS.has(id) || id.startsWith("qs-")) fail(at(n), `id "${id}" is reserved for the page shell`);
      else ids.set(id, n);
    }
    const style = getA(n, "style");
    if (style !== undefined) {
      if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(|color\s*:|background|fill\s*:|stroke\s*:/i.test(style)) fail(at(n), `hard-coded color in style="${style}" — use classes (colors live in site/tokens.css)`);
      else warn(at(n), `inline style="${style}" — prefer a class`);
    }
    if (inSvg) {
      for (const [k, v] of n.attrs) {
        if (COLOR_ATTRS.has(k.toLowerCase()) && v !== null && !/^(none|currentcolor|transparent|inherit|url\(#[^)]+\))$/i.test(v.trim())) {
          fail(at(n), `hard-coded color ${k}="${v}" in an SVG — use the dg-* classes`);
        }
      }
      for (const c of classes(n)) if (c.startsWith("dg") && !DG_CLASSES.has(c)) fail(at(n), `unknown diagram class "${c}"`);
    }
  });

  /* 2. heading ids (h2/h3 without one) */
  const toc = [];
  walk(tree, (n) => {
    if (n.name !== "h2" && n.name !== "h3") return;
    const text = squash(textOf(n));
    if (!text) { fail(at(n), `empty <${n.name}>`); return; }
    let id = getA(n, "id");
    if (!id) {
      const base = slugify(text);
      id = base;
      for (let i = 2; ids.has(id) || RESERVED_IDS.has(id); i++) id = `${base}-${i}`;
      setA(n, "id", id);
      ids.set(id, n);
    }
    n.headText = text;
    n.post += `<a class="h-anchor" href="#${attr(id)}" aria-label="Link to this section: ${attr(text)}">${icon("link")}</a>`;
    if (n.name === "h2" && !hasAncestor(n, (a) => a.name === "section" || a.name === "li" || a.name === "details")) toc.push([id, text]);
  });

  /* 3. search text, split by heading (before the engine adds any UI text) */
  const sections = [["", "", []]];
  (function collect(n) {
    for (const k of n.kids) {
      if (k.t === "text") sections[sections.length - 1][2].push(decode(k.raw));
      else if (k.t === "el") {
        if (k.name === "svg") continue;
        if ((k.name === "h2" || k.name === "h3") && k.headText) { sections.push([getA(k, "id"), k.headText, []]); continue; }
        const b = BLOCKISH.has(k.name) || (n.t === "el" && n.name === "a" && hasClass(n, "card"));
        if (b) sections[sections.length - 1][2].push(" ");
        collect(k);
        if (b) sections[sections.length - 1][2].push(" ");
      }
    }
  })(tree);
  const search = sections.map(([id, h, x]) => [id, h, squash(x.join("")).slice(0, 4000)]).filter(([id, h, x]) => id || x);

  /* 4. components */
  let ckIndex = 0, pzIndex = 0;
  walk(tree, (n) => {
    const cls = classes(n);

    /* links */
    if (n.name === "a") {
      const href = getA(n, "href");
      if (href === undefined) { if (!hasA(n, "id") && !hasA(n, "name")) warn(at(n), `<a> without href`); }
      else {
        const h = decode(href).trim();
        const inCode = hasAncestor(n, (a) => a.name === "pre" || a.name === "code");
        linkChecks.push({ href: h, where: at(n), inCode, node: n });
        if (/^https?:\/\//i.test(h)) {
          if (!hasA(n, "target")) setA(n, "target", "_blank");
          if (!/noopener/.test(getA(n, "rel") || "")) setA(n, "rel", [getA(n, "rel"), "noopener"].filter(Boolean).join(" "));
          const bare = cls.includes("card") || cls.includes("btn");
          n.post = (bare ? "" : `<span class="ext-ic" aria-hidden="true">${icon("external")}</span>`) + `<span class="sr-only"> (opens in a new tab)</span>` + n.post;
        }
      }
    }

    /* Say this / terminal command */
    if (n.name === "pre" && cls.includes("say")) {
      const label = decode(getA(n, "data-label") || "Say this");
      n.before = `<div class="say-box"><div class="say-head"><span class="say-ic" aria-hidden="true">${icon("message")}</span><span class="say-label">${esc(label)}</span>` +
        copyButton("Copy prompt") + `</div>`;
      const needsDetails = (function has(x) { return x.kids.some((k) => k.t === "el" && ((k.name === "var" && hasA(k, "data-k")) || has(k))); })(n);
      n.after = (needsDetails ? `<div class="say-foot" hidden><button type="button" class="say-fill" data-personalize-open>${icon("user")}<span>Add your details to fill in the highlighted parts</span></button></div>` : "") + `</div>`;
      n.inner = dedent;
    } else if (n.name === "pre" && cls.includes("cmd")) {
      const shell = decode(getA(n, "data-shell") || "Terminal");
      n.before = `<div class="cmd-box"><div class="cmd-head"><span class="cmd-ic" aria-hidden="true">${icon("terminal")}</span><span class="cmd-label">${esc(shell)}</span>` +
        copyButton("Copy command") + `</div>`;
      n.after = `</div>`;
      if (!hasA(n, "tabindex")) setA(n, "tabindex", "0");
      n.inner = (s) => {
        const c = s.match(/^\s*(<code\b[^>]*>)([\s\S]*)(<\/code>)\s*$/i);
        return c ? c[1] + dedent(c[2]) + c[3] : dedent(s);
      };
    } else if (n.name === "pre") {
      n.inner = dedent;
    }

    /* component classes on the wrong element render as plain HTML: catch them */
    const needs = { say: "pre", cmd: "pre", steps: "ol", checklist: "ul", tabs: "div", callout: "aside", cards: "div", "table-wrap": "div", diagram: "figure" };
    for (const c of cls) if (needs[c] && n.name !== needs[c] && !hasAncestor(n, (a) => a.name === "svg")) fail(at(n), `class="${c}" belongs on <${needs[c]}>, not <${n.tag}>`);
    if (n.name === "div" && cls.includes("table-wrap") && !elKids(n).some((k) => k.name === "table")) fail(at(n), `.table-wrap needs a <table> inside`);
    if (n.name === "div" && cls.includes("cards")) for (const k of elKids(n)) if (!(k.name === "a" && hasClass(k, "card"))) fail(at(k), `.cards may only contain <a class="card" href="…"> (found <${k.tag}>)`);

    /* placeholders */
    if (n.name === "var" && hasA(n, "data-k")) {
      const k = getA(n, "data-k");
      if (!VAR_KEYS.includes(k)) fail(at(n), `unknown <var data-k="${k}"> (known keys: ${VAR_KEYS.join(", ")})`);
      if (!squash(textOf(n))) fail(at(n), `<var data-k="${k}"> needs placeholder text, e.g. <var data-k="user">your-username</var>`);
    }

    /* tabs */
    if (n.name === "div" && cls.includes("tabs")) {
      const group = getA(n, "data-group");
      const spec = group !== undefined ? TAB_GROUPS[group] : null;
      if (group !== undefined && !spec) fail(at(n), `unknown tab group "${group}" (use ${Object.keys(TAB_GROUPS).join(", ")})`);
      const secs = elKids(n);
      if (!secs.length) fail(at(n), `tabs need at least one <section data-tab data-label>`);
      const seen = new Set();
      secs.forEach((s, i) => {
        if (s.name !== "section") { fail(at(s), `only <section data-tab="…" data-label="…"> may sit directly inside .tabs (found <${s.tag}>)`); return; }
        const label = getA(s, "data-label");
        let tab = getA(s, "data-tab");
        if (!label) fail(at(s), `tab section needs data-label="…"`);
        if (!tab) { if (group !== undefined) fail(at(s), `tab section needs data-tab="…" (${spec ? spec.values.join(" or ") : "a value"})`); tab = `t${i + 1}`; setA(s, "data-tab", tab); }
        else if (spec && !spec.values.includes(tab)) fail(at(s), `data-tab="${tab}" is not valid in group "${group}" (use ${spec.values.join(" or ")})`);
        if (seen.has(tab)) fail(at(s), `duplicate data-tab="${tab}" in one tab set`);
        seen.add(tab);
        addClass(s, "tab-panel");
        s.pre = `<p class="tab-title">${esc(decode(label || tab))}</p>` + s.pre;
      });
      const btns = secs.filter((s) => s.name === "section").map((s) => `<button type="button" class="tab-btn" data-tab="${attr(getA(s, "data-tab"))}">${esc(decode(getA(s, "data-label") || getA(s, "data-tab")))}</button>`).join("");
      n.pre = `<div class="tab-list" aria-label="${attr(spec ? spec.label : "Options")}">${btns}</div>` + n.pre;
    }

    /* callouts */
    if (n.name === "aside" && cls.includes("callout")) {
      const kinds = cls.filter((c) => c in CALLOUTS);
      if (kinds.length !== 1) fail(at(n), `callout needs exactly one kind class: ${Object.keys(CALLOUTS).join(", ")}`);
      const kind = CALLOUTS[kinds[0]] || CALLOUTS.note;
      const title = decode(getA(n, "data-title") || kind.title);
      if (!hasA(n, "role")) setA(n, "role", "note");
      n.pre = `<p class="callout-head"><span class="callout-ic" aria-hidden="true">${icon(kind.icon)}</span><span class="callout-title">${esc(title)}</span></p><div class="callout-body">` + n.pre;
      n.post += `</div>`;
    }

    /* fold-outs */
    if (n.name === "details") {
      const sum = elKids(n)[0];
      if (!sum || sum.name !== "summary") fail(at(n), `<details> must start with a <summary>`);
      else {
        const ic = cls.includes("fix") ? "wrench" : cls.includes("more") ? "terminal" : "";
        sum.pre = (ic ? `<span class="sum-ic" aria-hidden="true">${icon(ic)}</span>` : "") + `<span class="sum-t">` + sum.pre;
        sum.post += `</span><span class="sum-chev" aria-hidden="true">${icon("chevron")}</span>`;
      }
    }

    /* checklist: real checkboxes, remembered per page + index */
    if (n.name === "ul" && cls.includes("checklist")) {
      for (const li of elKids(n)) {
        if (li.name !== "li") continue;
        const id = `qs-ck-${ckIndex}`;
        li.pre = `<input type="checkbox" class="ck-input" id="${id}" data-ck="${ckIndex}"><label class="ck-label" for="${id}">` + li.pre;
        li.post += `</label>`;
        ckIndex++;
      }
    }

    /* cards */
    if (n.name === "a" && cls.includes("card")) n.post += `<span class="card-go" aria-hidden="true">${icon(/^https?:/i.test(getA(n, "href") || "") ? "external" : "arrow-right")}</span>`;

    /* scrollable tables */
    if (n.name === "div" && cls.includes("table-wrap")) {
      if (!hasA(n, "tabindex")) setA(n, "tabindex", "0");
      if (!hasA(n, "role")) setA(n, "role", "region");
      if (!hasA(n, "aria-label")) {
        let cap = null;
        walk(n, (x) => { if (!cap && x.name === "caption") cap = squash(textOf(x)); });
        setA(n, "aria-label", cap || "Table");
      }
    }

    /* personalize form + progress summary */
    if (hasA(n, "data-personalize")) n.post += personalizeForm(`qs-pz${pzIndex++}`);
    if (hasA(n, "data-progress")) n.post += progressCard();

    /* diagrams */
    if (n.name === "figure" && cls.includes("diagram")) {
      const svg = elKids(n).find((k) => k.name === "svg");
      if (!svg) { fail(at(n), `figure.diagram needs an inline <svg class="dg">`); return; }
      if (!hasClass(svg, "dg")) addClass(svg, "dg");
      if (getA(svg, "role") !== "img") fail(at(svg), `diagram <svg> needs role="img"`);
      const t = elKids(svg).find((k) => k.name === "title"), d = elKids(svg).find((k) => k.name === "desc");
      if (!t || !d) fail(at(svg), `diagram <svg> needs a <title> and a <desc> as direct children`);
      const lab = (getA(svg, "aria-labelledby") || "").split(/\s+/).filter(Boolean);
      if (t && d && !(lab.includes(getA(t, "id")) && lab.includes(getA(d, "id")))) fail(at(svg), `diagram <svg> needs aria-labelledby="<title id> <desc id>"`);
      const vb = (getA(svg, "viewbox") || "").trim().split(/[\s,]+/).map(Number);
      if (vb.length !== 4 || vb.some((x) => !Number.isFinite(x))) fail(at(svg), `diagram <svg> needs a viewBox`);
      else {
        if (vb[2] > 480) warn(at(svg), `diagram viewBox is ${vb[2]} wide — keep it ≤ 480 so it reads on a phone`);
        if (!hasA(svg, "style")) setA(svg, "style", `--dg-w:${Math.round(vb[2] * 1.25)}px`);
      }
      if (!elKids(n).some((k) => k.name === "figcaption")) warn(at(n), `diagram has no <figcaption>`);
    }

    /* images: there is no image pipeline — draw an inline SVG instead */
    if (n.name === "img") {
      const s = getA(n, "src") || "";
      if (!/^https:\/\//.test(s)) fail(at(n), `<img src="${s}">: only https:// images are supported (there is no image folder) — draw an inline SVG diagram instead`);
      if (!hasA(n, "alt")) fail(at(n), `<img> needs alt="…"`);
    }
  });

  return { ...p, file, meta, tree, ids, toc, search, linkChecks };
}

function copyButton(label) {
  return `<button type="button" class="copy-btn" data-copy aria-label="${attr(label)}"><span class="copy-ic" aria-hidden="true">${icon("copy")}${icon("check")}</span><span class="copy-label">Copy</span></button>`;
}

function personalizeForm(p) {
  const field = (k, label, ph, extra = "", hint = "") => `
    <div class="pz-field">
      <label for="${p}-${k}">${label}</label>
      <input id="${p}-${k}" name="${k}" type="text" placeholder="${attr(ph)}" autocomplete="off" autocapitalize="off" spellcheck="false"${extra}>
      ${hint ? `<p class="pz-hint" id="${p}-${k}-hint">${hint}</p>` : ""}
    </div>`;
  return `<form class="pz-form" data-pz-form novalidate>
    <div class="pz-grid">${field("user", "GitHub username", "your-username", ` aria-describedby="${p}-user-hint"`, "The name in your GitHub profile address, github.com/<b>your-username</b>.")}${field("repo", "Repo name for your site", "my-site", ` aria-describedby="${p}-repo-hint"`, "What you want to call the repository that holds your website.")}${field("name", "Your name", "Your Name", ` autocomplete="name" aria-describedby="${p}-name-hint"`, "Shown as the author of your commits.")}${field("email", "GitHub noreply email", "12345678+your-username@users.noreply.github.com", ` inputmode="email" aria-describedby="${p}-email-hint"`, `On GitHub, open <span class="ui">Settings</span> → <span class="ui">Emails</span> and check <span class="ui">Keep my email addresses private</span>. GitHub then shows your address ending in <code>@users.noreply.github.com</code>.`)}
    </div>
    <p class="pz-warn" data-pz-warn hidden>That doesn’t look like a GitHub noreply address. It should end in <code>@users.noreply.github.com</code>.</p>
    <div class="pz-actions">
      <button type="submit" class="btn btn-primary">${icon("check")}Save</button>
      <button type="button" class="btn btn-secondary" data-pz-clear>Clear</button>
      <span class="pz-status" data-pz-status role="status">Saved only in this browser.</span>
    </div>
  </form>`;
}

function progressCard() {
  const n = PAGES.length;
  return `<div class="progress-card" data-progress-card>
    <div class="pc-top">
      <p class="pc-count"><strong data-p-done>0</strong> of ${n} pages done</p>
      <button type="button" class="pc-reset" data-p-reset>${icon("reset")}<span>Reset</span></button>
    </div>
    <div class="bar" role="progressbar" aria-label="Pages done" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="0"><span></span></div>
    <p class="pc-next" data-p-next-wrap><span data-p-next-label>Start with:</span> <a data-p-next href="${PAGES[1] ? `${PAGES[1].slug}.html` : "index.html"}">${esc(PAGES[1] ? PAGES[1].nav : "")}</a></p>
    <p class="pc-next" data-p-finished hidden>You’ve finished every page. Nice work.</p>
    <p class="pc-note">Progress is saved only in this browser. Mark a page done with the button at the bottom of each page.</p>
  </div>`;
}

const built = PAGES.filter((p) => contentFiles.includes(`${p.slug}.html`)).map(processPage).filter(Boolean);
const BUILT = new Map(built.map((b) => [b.slug, b]));

/* ---------------- link validation (needs every page's ids) ---------------- */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);
for (const b of built) {
  for (const { href, where, inCode } of b.linkChecks) {
    if (!href) { fail(where, `empty href`); continue; }
    if (/^https:\/\//i.test(href)) {
      let u; try { u = new URL(href); } catch { fail(where, `invalid URL ${href}`); continue; }
      if (!u.hostname.includes(".")) fail(where, `suspicious URL ${href}`);
      continue;
    }
    if (/^http:\/\//i.test(href)) {
      let u; try { u = new URL(href); } catch { fail(where, `invalid URL ${href}`); continue; }
      if (!(inCode && LOCAL_HOSTS.has(u.hostname))) fail(where, `insecure link ${href} — use https:// (http:// is allowed only for localhost examples inside <pre>/<code>)`);
      continue;
    }
    if (/^mailto:/i.test(href)) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) { fail(where, `unsupported link ${href}`); continue; }
    if (href === "#") { fail(where, `dead link href="#"`); continue; }
    const hashAt = href.indexOf("#");
    const pathPart = (hashAt < 0 ? href : href.slice(0, hashAt)).replace(/\?.*$/, "");
    const frag = hashAt < 0 ? "" : decodeURIComponent(href.slice(hashAt + 1));
    let target = b;
    if (pathPart) {
      const m = pathPart.match(/^(?:\.\/)?([a-z0-9][a-z0-9-]*)\.html$/);
      if (!m) { fail(where, `internal link "${href}" must look like "page.html" or "page.html#section" (flat, relative)`); continue; }
      target = BUILT.get(m[1]);
      if (!target) {
        if (!BY_SLUG.has(m[1])) fail(where, `broken link "${href}": there is no page "${m[1]}" in content/nav.json`);
        continue; /* listed in nav but failed to load: already reported */
      }
    }
    if (frag && !target.ids.has(frag)) fail(where, `broken anchor "${href}": ${target.slug}.html has no id="${frag}"`);
  }
}

if (errors.length) bail();

/* ============================================================
   Render
   ============================================================ */
const N = PAGES.length;
const BUILD_DATE = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const HAS_OG = fs.existsSync(path.join(SITE, "og.png"));
const canonicalOf = (slug) => (slug === "index" ? SITE_BASE : `${SITE_BASE}${slug}.html`);
const hrefOf = (root, slug) => `${root}${slug}.html`;

/* Inline <head> script: no theme flash, js class, remembered tabs. */
const TAB_BOOT = JSON.stringify(Object.fromEntries(Object.entries(TAB_GROUPS).map(([g, s]) => [g, s.values])));
const BOOT = `<script>(function(){var d=document.documentElement,t,s={};d.className=d.className.replace(/\\bno-js\\b/,"js");
try{t=localStorage.getItem("qs-theme")}catch(e){}
if(t!=="light"&&t!=="dark")t=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
d.setAttribute("data-theme",t);
try{s=JSON.parse(localStorage.getItem("qs-tabs")||"{}")||{}}catch(e){}
var g=${TAB_BOOT},p=(navigator.userAgentData&&navigator.userAgentData.platform)||navigator.platform||navigator.userAgent||"",
f={os:/win/i.test(p)?"windows":"mac",agent:"claude",where:"app"};
for(var k in g)d.setAttribute("data-tab-"+k,g[k].indexOf(s[k])>-1?s[k]:(f[k]||g[k][0]));})();</script>`;

function sidebar(root, active) {
  let html = `<nav class="sidebar" id="qs-sidebar" aria-label="Guide">
  <div class="sb-progress" data-sb-progress>
    <div class="sb-progress-row"><span class="sb-progress-label">Your progress</span><span class="sb-progress-count"><span data-p-done>0</span> of ${N} done</span></div>
    <div class="bar" role="progressbar" aria-label="Pages done" aria-valuemin="0" aria-valuemax="${N}" aria-valuenow="0"><span></span></div>
  </div>`;
  for (const g of NAV.groups) {
    html += `\n  <div class="sb-group"><p class="sb-title">${esc(g.label)}</p><ul>`;
    for (const it of g.items) {
      html += `\n    <li><a class="nav-link" href="${hrefOf(root, it.slug)}" data-slug="${it.slug}"${it.slug === active ? ' aria-current="page"' : ""}><span class="nav-ic">${icon(it.icon)}</span><span class="nav-t">${esc(it.nav)}</span><span class="nav-done" aria-hidden="true">${icon("check")}</span><span class="sr-only nav-done-sr"> (done)</span></a></li>`;
    }
    html += `\n  </ul></div>`;
  }
  return html + `\n</nav>`;
}

const BRAND_MARK = `<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path class="bm-chevron" d="m8 6 6 6-6 6"/><path class="bm-spark" d="M18.5 3.2l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/></svg></span>`;

const HERO_ART = `<svg class="hero-svg" viewBox="0 0 360 300" aria-hidden="true" focusable="false">
  <defs><marker id="qs-hero-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="ha-arrowhead" d="M0 1 9 5 0 9z"/></marker></defs>
  <g class="ha-site">
    <rect class="ha-window" x="92" y="120" width="252" height="164" rx="14"/>
    <path class="ha-bar" d="M92 134a14 14 0 0 1 14-14h224a14 14 0 0 1 14 14v12H92z"/>
    <circle class="ha-dot" cx="110" cy="133" r="3.5"/><circle class="ha-dot" cx="122" cy="133" r="3.5"/><circle class="ha-dot" cx="134" cy="133" r="3.5"/>
    <rect class="ha-url" x="152" y="127" width="132" height="12" rx="6"/>
    <rect class="ha-ink" x="112" y="164" width="140" height="14" rx="7"/>
    <rect class="ha-line" x="112" y="188" width="208" height="8" rx="4"/>
    <rect class="ha-line" x="112" y="203" width="168" height="8" rx="4"/>
    <rect class="ha-card-a" x="112" y="224" width="100" height="42" rx="8"/>
    <rect class="ha-card-b" x="222" y="224" width="100" height="42" rx="8"/>
    <circle class="ha-badge" cx="338" cy="124" r="20"/>
    <path class="ha-badge-ink" d="m329 124 6.5 6.5L347 118"/>
  </g>
  <path class="ha-arrow" d="M58 122c-6 40 4 70 26 92" marker-end="url(#qs-hero-arrow)"/>
  <g class="ha-say-g">
    <path class="ha-say" d="M32 18h196a14 14 0 0 1 14 14v58a14 14 0 0 1-14 14H80l-20 18v-18H32a14 14 0 0 1-14-14V32a14 14 0 0 1 14-14z"/>
    <rect class="ha-say-bar" x="18" y="30" width="4" height="62" rx="2"/>
    <text class="ha-say-label" x="36" y="42">SAY THIS</text>
    <rect class="ha-say-line" x="36" y="54" width="182" height="9" rx="4.5"/>
    <rect class="ha-var" x="36" y="71" width="78" height="17" rx="5"/>
    <rect class="ha-say-line" x="122" y="75" width="96" height="9" rx="4.5"/>
  </g>
</svg>`;

function crumbs(root, p) {
  if (p.slug === "index") return "";
  return `<nav class="crumbs" aria-label="Breadcrumb"><a href="${hrefOf(root, "index")}">Home</a><span class="sep" aria-hidden="true">/</span><span>${esc(p.group)}</span><span class="sep" aria-hidden="true">/</span><span aria-current="page">${esc(p.nav)}</span></nav>`;
}
function chips(meta) {
  const t = TRACKS[meta.track];
  return `<div class="chips"><span class="chip chip-time">${icon("clock")}<span><span class="sr-only">Time: </span>${esc(meta.time)}</span></span>${t ? `<span class="chip chip-track track-${meta.track}">${icon(t.icon)}<span>${esc(t.label)}</span></span>` : ""}</div>`;
}
function linkAttrs(href) {
  return /^https?:\/\//.test(href) ? `href="${attr(href)}" target="_blank" rel="noopener"` : `href="${attr(href)}"`;
}
function pageHead(root, b) {
  const m = b.meta;
  const cta = Array.isArray(m.cta) && m.cta.length
    ? `<div class="cta-row">${m.cta.map((c) => `<a class="btn ${c.primary ? "btn-primary" : m.hero ? "btn-glass" : "btn-secondary"}" ${linkAttrs(c.href)}>${esc(c.text)}${c.primary ? icon("arrow-right") : ""}</a>`).join("")}</div>`
    : "";
  if (m.hero) {
    return `<header class="hero">
  <div class="hero-copy">
    <p class="hero-kicker">${esc(m.eyebrow)}</p>
    <h1>${esc(m.title)}</h1>
    <p class="hero-lede">${esc(m.lede)}</p>
    ${cta}
    ${chips(m)}
  </div>
  <div class="hero-art" aria-hidden="true">${HERO_ART}</div>
</header>`;
  }
  return `${crumbs(root, b)}
<header class="page-head">
  <p class="eyebrow">${esc(m.eyebrow)}</p>
  <h1>${esc(m.title)}</h1>
  <p class="lede">${esc(m.lede)}</p>
  ${chips(m)}
  ${cta}
</header>`;
}
function pageFoot(root, b) {
  const i = PAGES.findIndex((p) => p.slug === b.slug);
  const prev = PAGES[i - 1], next = PAGES[i + 1];
  const done = `<div class="done-row">
  <button type="button" class="done-toggle" data-done-toggle aria-pressed="false">
    <span class="done-ic" aria-hidden="true">${icon("circle", "i-off")}${icon("check-circle", "i-on")}</span>
    <span class="done-label">Mark this page as done</span>
  </button>
  <p class="done-hint">Saved only in this browser.</p>
</div>`;
  const jump = b.meta.jump
    ? `<a class="jump-card" ${linkAttrs(b.meta.jump.href)}><span class="jump-ic" aria-hidden="true">${icon("skip")}</span><span class="jump-t">${esc(b.meta.jump.text)}</span><span class="jump-go" aria-hidden="true">${icon("arrow-right")}</span></a>`
    : "";
  const nav = prev || next
    ? `<nav class="pagenav" aria-label="Previous and next page">${prev ? `<a class="prev" href="${hrefOf(root, prev.slug)}" rel="prev"><span class="dir">${icon("arrow-left")}Previous</span><span class="t">${esc(prev.nav)}</span></a>` : "<span></span>"}${next ? `<a class="next" href="${hrefOf(root, next.slug)}" rel="next"><span class="dir">Next${icon("arrow-right")}</span><span class="t">${esc(next.nav)}</span></a>` : ""}</nav>`
    : "";
  return done + jump + nav;
}
function tocAside(toc) {
  if (toc.length < 3) return "";
  return `<aside class="toc" aria-label="On this page"><p class="toc-title">On this page</p><ul>${toc.map(([id, t]) => `<li><a href="#${attr(id)}">${esc(t)}</a></li>`).join("")}</ul></aside>`;
}

function shell({ root, slug, title, description, canonical, head, body, after = "", toc = "", noindex = false }) {
  const fullTitle = title === SITE_NAME ? `${SITE_NAME}${SITE_TAGLINE ? ` · ${SITE_TAGLINE}` : ""}` : `${title} · ${SITE_NAME}`;
  const brandParts = SITE_NAME.split(" ");
  return `<!doctype html>
<html lang="en" class="no-js" data-root="${attr(root)}" data-slug="${attr(slug)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${attr(description)}">
${canonical ? `<link rel="canonical" href="${attr(canonical)}">\n` : ""}${noindex ? `<meta name="robots" content="noindex">\n` : ""}<meta name="color-scheme" content="light dark">
${lightTheme ? `<meta name="theme-color" content="${lightTheme}" media="(prefers-color-scheme: light)">\n` : ""}${darkTheme ? `<meta name="theme-color" content="${darkTheme}" media="(prefers-color-scheme: dark)">\n` : ""}<meta property="og:type" content="website">
<meta property="og:site_name" content="${attr(SITE_NAME)}">
<meta property="og:title" content="${attr(fullTitle)}">
<meta property="og:description" content="${attr(description)}">
${canonical ? `<meta property="og:url" content="${attr(canonical)}">\n` : ""}${HAS_OG ? `<meta property="og:image" content="${SITE_BASE}assets/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${attr(`${SITE_NAME}${SITE_TAGLINE ? ` — ${SITE_TAGLINE}` : ""}`)}">
` : ""}<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="${root}assets/favicon.svg">
${FONTS_HREF ? `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${attr(FONTS_HREF)}">
` : ""}${BOOT}
<link rel="stylesheet" href="${root}assets/tokens.css">
<link rel="stylesheet" href="${root}assets/site.css">
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="topbar">
  <button class="icon-btn nav-toggle" id="qs-nav-toggle" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="qs-sidebar"><span class="hb" aria-hidden="true"><span></span><span></span><span></span></span></button>
  <a class="brand" href="${hrefOf(root, "index")}">
    ${BRAND_MARK}
    <span class="brand-name">${esc(brandParts[0])}${brandParts.length > 1 ? ` <span class="thin">${esc(brandParts.slice(1).join(" "))}</span>` : ""}</span>
    ${SITE_TAGLINE ? `<span class="brand-tag">${esc(SITE_TAGLINE)}</span>` : ""}
  </a>
  <span class="topbar-spacer"></span>
  <button class="searchbtn" type="button" data-search-open aria-label="Search the guide" aria-keyshortcuts="Control+K Meta+K /">${icon("search")}<span class="searchbtn-label">Search the guide…</span><kbd class="k-hint" data-k-hint>Ctrl K</kbd></button>
  <button class="icon-btn pz-open" type="button" data-personalize-open aria-haspopup="dialog">${icon("user")}<span class="pz-open-label">Personalize</span><span class="pz-dot" aria-hidden="true"></span></button>
  <button class="icon-btn theme-toggle" id="qs-theme" type="button" aria-label="Switch theme"><span class="i-sun">${icon("sun")}</span><span class="i-moon">${icon("moon")}</span></button>
  <a class="icon-btn gh-link" href="${attr(REPO_URL)}" target="_blank" rel="noopener" aria-label="Source on GitHub (opens in a new tab)">${icon("github")}</a>
</header>
<div class="scrim" id="qs-scrim"></div>
<div class="layout">
${sidebar(root, slug)}
<main id="main" class="content" tabindex="-1">
  <div class="page-grid${toc ? " has-toc" : ""}">
    <article class="page">
${head}
      <div class="prose">
${body}
      </div>
${after}
    </article>
${toc}
  </div>
</main>
</div>
<footer class="footer"><div class="footer-inner">
  ${AUTHOR ? `<p class="footer-by">A guide by <a href="${attr(AUTHOR.github)}" target="_blank" rel="noopener">${esc(AUTHOR.name)}</a></p>` : ""}
  <p class="footer-links">
    <a href="${attr(REPO_URL)}" target="_blank" rel="noopener">${icon("github")}Source on GitHub</a>
    <span>Built with Claude Code</span>
    <span>Last built ${esc(BUILD_DATE)}</span>
  </p>
</div></footer>

<div class="modal search-modal" id="qs-search" hidden>
  <div class="modal-backdrop" data-close></div>
  <div class="modal-panel search-panel" role="dialog" aria-modal="true" aria-label="Search the guide">
    <div class="search-head">${icon("search")}<input id="qs-search-input" type="search" placeholder="Search the guide…" autocomplete="off" autocapitalize="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="qs-search-results" aria-autocomplete="list"><button type="button" class="icon-btn search-close" data-close aria-label="Close search">${icon("x")}</button></div>
    <div class="sr-only" id="qs-search-status" role="status" aria-live="polite"></div>
    <div class="results" id="qs-search-results" role="listbox" aria-label="Search results"></div>
    <div class="search-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>
  </div>
</div>

<div class="modal pz-modal" id="qs-pz" hidden>
  <div class="modal-backdrop" data-close></div>
  <div class="modal-panel pz-panel" role="dialog" aria-modal="true" aria-labelledby="qs-pz-title">
    <div class="pz-head"><h2 id="qs-pz-title">${icon("user")}Your details</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon("x")}</button></div>
    <p class="pz-intro">Fill these in once. Every prompt in the guide updates to use them, so you can copy and paste without editing.</p>
    ${personalizeForm("qs-pzm")}
  </div>
</div>
<div class="toast" id="qs-toast" role="status" aria-live="polite"></div>
<script src="${root}assets/site.js" defer></script>
</body>
</html>
`;
}

/* ---------------- write docs/ ---------------- */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "assets"), { recursive: true });
const write = (name, data) => fs.writeFileSync(path.join(OUT, name), data);

for (const b of built) {
  const body = serialize(b.tree).replace(/^\s*\n/, "").replace(/\s+$/, "");
  const html = shell({
    root: "",
    slug: b.slug,
    title: b.meta.title,
    description: b.meta.lede,
    canonical: canonicalOf(b.slug),
    head: pageHead("", b),
    body,
    after: pageFoot("", b),
    toc: tocAside(b.toc),
  });
  write(`${b.slug}.html`, html);
}

/* 404: every link absolute, because Pages serves it at any depth */
write("404.html", shell({
  root: PATH_PREFIX,
  slug: "404",
  title: "Page not found",
  description: "That page doesn’t exist.",
  canonical: "",
  noindex: true,
  head: `<header class="page-head">
  <p class="eyebrow">Error 404</p>
  <h1>Page not found</h1>
  <p class="lede">That page doesn’t exist. It may have moved, or the link has a typo.</p>
</header>`,
  body: `<div class="cta-row"><a class="btn btn-primary" href="${PATH_PREFIX}index.html">Go to the start${icon("arrow-right")}</a><button type="button" class="btn btn-secondary" data-search-open>${icon("search")}Search the guide</button></div>`,
}));

/* search index: one entry per page, text split by heading */
write("assets/search-index.json", JSON.stringify(built.map((b) => ({
  u: `${b.slug}.html`, t: b.meta.title, n: b.nav, g: b.group, d: b.meta.lede, s: b.search,
}))));

write("assets/tokens.css", TOKENS_OUT);
for (const f of ["site.css", "site.js", "favicon.svg"]) fs.copyFileSync(path.join(SITE, f), path.join(OUT, "assets", f));
if (HAS_OG) fs.copyFileSync(path.join(SITE, "og.png"), path.join(OUT, "assets", "og.png"));
write(".nojekyll", "");
write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE_BASE}sitemap.xml\n`);
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${built.map((b) => `  <url><loc>${esc(canonicalOf(b.slug))}</loc></url>`).join("\n")}
</urlset>
`);

for (const w of warnings) console.warn(`⚠ ${w}`);
console.log(`✓ built ${built.length} pages → docs/${warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? "" : "s"})` : ""}`);
