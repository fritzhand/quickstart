#!/usr/bin/env node
/* ============================================================
   scripts/og.mjs — renders site/og.png, the 1200×630 social-share image.

   DEV-TIME ONLY. The site build (build.mjs) never runs this; it just copies
   site/og.png into docs/assets/ when the file exists. Re-run it only when the
   title, subtitle or brand colors change:  npm run og

   Needs Playwright with Chromium. It is not a dependency of this repo; the
   script looks for it in this order: $PLAYWRIGHT_PATH, a local
   node_modules/playwright, then a global install at
   /opt/node22/lib/node_modules/playwright. Colors come from site/tokens.css
   (light theme), so the image always matches the site.
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "site", "og.png");
const TITLE = "Quickstart";
const SUBTITLE = "Publish your first website with an AI agent";

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const candidates = [process.env.PLAYWRIGHT_PATH, "playwright", "/opt/node22/lib/node_modules/playwright"].filter(Boolean);
  for (const id of candidates) {
    try { return require(id); } catch { /* try the next one */ }
  }
  console.error("✗ Playwright not found. Install it (npm i -D playwright && npx playwright install chromium) or set PLAYWRIGHT_PATH.");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(path.join(ROOT, "site.config.json"), "utf8"));
const tokens = fs.readFileSync(path.join(ROOT, "site", "tokens.css"), "utf8");
const fontsHref = (tokens.match(/--fonts-href:\s*"([^"]+)"/) || [])[1] || "";
const host = String(config.siteBase || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const page = `<!doctype html>
<html data-theme="light"><head><meta charset="utf-8">
${fontsHref ? `<link rel="stylesheet" href="${esc(fontsHref)}">` : ""}
<style>${tokens}
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px}
body{position:relative;overflow:hidden;background:var(--hero-bg);color:var(--hero-text);font-family:var(--font-body)}
body::after{content:"";position:absolute;inset:0;background:
  radial-gradient(700px 380px at 100% -10%,var(--hero-glow-a),transparent 65%),
  radial-gradient(620px 360px at -10% 115%,var(--hero-glow-b),transparent 65%)}
.wrap{position:relative;z-index:1;display:grid;grid-template-columns:1.15fr .85fr;gap:40px;align-items:center;height:100%;padding:64px 72px}
.brand{display:flex;align-items:center;gap:16px}
.mark{width:64px;height:64px;border-radius:17px;background:var(--hero-bg);box-shadow:inset 0 0 0 2px var(--hero-line);display:grid;place-items:center}
.mark svg{width:44px;height:44px}
.chev{fill:none;stroke:var(--hero-text);stroke-width:2.8;stroke-linecap:round;stroke-linejoin:round}
.spark{fill:var(--say-bar)}
.kicker{font-size:22px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--hero-muted)}
h1{margin-top:34px;font-family:var(--font-display);font-weight:800;font-size:112px;line-height:1;letter-spacing:-.035em}
p.sub{margin-top:22px;font-size:38px;line-height:1.25;color:var(--hero-muted);max-width:14em;font-weight:500}
.url{margin-top:40px;font-family:var(--font-mono);font-size:22px;color:var(--hero-muted)}
.say{background:var(--say-bg);border:2px solid var(--say-border);border-left:10px solid var(--say-bar);border-radius:18px;box-shadow:var(--shadow-3);transform:rotate(-2deg);overflow:hidden}
.say-head{display:flex;align-items:center;gap:12px;padding:16px 22px;background:var(--say-head-bg);border-bottom:2px solid var(--say-border);color:var(--say-ink);font-weight:800;font-size:20px;letter-spacing:.12em;text-transform:uppercase}
.say-head svg{width:28px;height:28px}
.say-head .copy{margin-left:auto;font-size:17px;letter-spacing:0;text-transform:none;border:2px solid var(--say-border);background:var(--say-btn-bg);border-radius:9px;padding:5px 14px}
.say-body{padding:24px 26px 28px;color:var(--text);font-size:31px;line-height:1.45;font-weight:500}
var{font-style:normal;font-weight:700;color:var(--var-text);background:var(--var-bg);border:2px dashed var(--var-border);border-radius:8px;padding:0 8px}
</style></head>
<body><div class="wrap">
  <div>
    <div class="brand"><div class="mark"><svg viewBox="0 0 24 24"><path class="chev" d="m8 6 6 6-6 6"/><path class="spark" d="M18.5 3.2l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/></svg></div><div class="kicker">A step-by-step guide</div></div>
    <h1>${esc(TITLE)}</h1>
    <p class="sub">${esc(SUBTITLE)}</p>
    ${host ? `<p class="url">${esc(host)}</p>` : ""}
  </div>
  <div class="say">
    <div class="say-head"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/><path d="M8 9h8M8 13h5"/></svg>Say this<span class="copy">Copy</span></div>
    <div class="say-body">Make my own copy of this starter site, call it <var>my-site</var>, and publish it with GitHub Pages.</div>
  </div>
</div></body></html>`;

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
try {
  const tab = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await tab.setContent(page, { waitUntil: "load" });
  await tab.evaluate(() => document.fonts && document.fonts.ready);
  await tab.screenshot({ path: OUT, type: "png" });
  console.log(`✓ wrote ${path.relative(ROOT, OUT)} (1200×630)`);
} finally {
  await browser.close();
}
