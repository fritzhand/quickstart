#!/usr/bin/env node
/* ================================================================
   build-cards.mjs: the Instagram launch set for the Quickstart guide
   (https://fritzhand.github.io/quickstart/).

     node collateral/instagram-2026-09/build-cards.mjs            # all five cards, alt text, check, proof
     node collateral/instagram-2026-09/build-cards.mjs 03-say     # one card (or several, by id); PNGs only
     node collateral/instagram-2026-09/build-cards.mjs check      # re-read the PNGs on disk
     node collateral/instagram-2026-09/build-cards.mjs proof      # feed + grid proof (gitignored)

   Runs from any directory. Needs Playwright with Chromium, found the way
   scripts/og.mjs finds it ($PLAYWRIGHT_PATH, a local node_modules, then the
   global /opt/node22 install); it is not a dependency of this repo, and
   nothing else is needed: PNG decoding, the lanczos3 downsample and PNG
   encoding are done here with node:zlib. Behind a proxy, prefix
   NODE_USE_ENV_PROXY=1: every remote request a page makes (Google Fonts,
   the live fritzhand.github.io sites, their CDN scripts and map tiles) is
   fulfilled through node's fetch, so the proxy applies. Analytics requests
   are dropped, so a build never counts as a visit to anyone's site.

   Five 1080x1350 cards, posted in this order as one carousel:

     01-site         the cover: the home page on a phone, on the hero's ink navy
     02-steps        five steps to a live site; Step 2 forks into two paths
     03-say          the one rule, and four real "Say this" prompts
     04-one-prompt   the one message that built history-of-indigo, typos kept
     05-starters     the two starters, each with a live capture of its site

   Nothing on a card is typed twice. Every sentence is read from the site's
   own files at build time (content/*.html, content/nav.json,
   site.config.json) or is a short headline; colors and fonts come from
   site/tokens.css, the icons and brand mark from build.mjs. The phone and
   browser screens are fresh captures: the home page from docs/ served
   locally, the other three sites live.

   Every card is audited in the browser before it is written. The build
   stops if a glyph is drawn by anything but the site's three web fonts, if a
   line of text misses WCAG AA against the pixels actually behind it, if a
   line is set under MIN_PX, if any glyph leaves the crop-safe frame (see
   SAFE_X), or if text overflows its box, an element leaves the card or two
   blocks overlap.

   alt-text.md, the file check and proof.png are rewritten only by the full
   build (no card ids). After a one-card build, run the full build before
   posting, or that slide's alt text may no longer match it.
   ================================================================ */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const W = 1080, H = 1350;   // Instagram's portrait post, 4:5
const SCALE = 2;            // render at 2x, downsample with lanczos3
/* THE CROP. The feed shows a 4:5 post whole, but the profile grid shows it
   as a 3:4 tile: 1350 x 0.75 = 1012.5 px of the width, centered, so 34 px
   go from each side. 64 keeps every letter 30 px clear of that edge. */
const SAFE_X = 64;
const SAFE_Y = 40;
const CARDS = ['01-site', '02-steps', '03-say', '04-one-prompt', '05-starters'];
const fileOf = (id) => `${id}-4x5-1080x1350.png`;

let cleanup = () => {};
const die = (m) => { console.error(`✗ ${m}`); cleanup(); process.exit(1); };

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  for (const id of [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) {
    try { return req(id); } catch { /* try the next one */ }
  }
  return die('Playwright not found. Set PLAYWRIGHT_PATH, or install it where node can find it (it is not a dependency of this repo).');
}

/* ================================================================
   The site's own files, read rather than retyped.
   ================================================================ */
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const CONFIG = JSON.parse(read('site.config.json'));
const NAV = JSON.parse(read('content', 'nav.json'));
const TOKENS = read('site', 'tokens.css');
const BUILD = read('build.mjs');

const SITE_NAME = CONFIG.siteName;                                      // Quickstart
const AUTHOR = CONFIG.author?.name || die('site.config.json has no author.name');
const BASE = new URL(CONFIG.siteBase);
const ADDRESS = `${BASE.host}${BASE.pathname}`.replace(/\/$/, '');     // fritzhand.github.io/quickstart
const DOMAIN = BASE.host;                                               // fritzhand.github.io
const PREFIX = CONFIG.pathPrefix || '/';

/* Web fonts: the site's own Google Fonts request, with display=block so no
   line is ever painted in a fallback while a face is still on its way. */
const FONTS_HREF = ((TOKENS.match(/--fonts-href:\s*"([^"]+)"/) || [])[1] || die('site/tokens.css has no --fonts-href'))
  .replace('display=swap', 'display=block');
const FAMILIES = ['Bricolage Grotesque', 'Inter', 'JetBrains Mono'];
for (const f of FAMILIES) if (!FONTS_HREF.includes(f.replace(/ /g, '+'))) die(`--fonts-href no longer loads ${f}`);

/* Token values, for the few decisions made in node (which theme the cover's
   phone shows). Card CSS uses the custom properties themselves. */
const tokenBlock = (re) => Object.fromEntries([...((TOKENS.match(re) || die(`tokens.css: no block ${re}`))[1]
  .matchAll(/(--[\w-]+):\s*([^;]+);/g))].map((m) => [m[1], m[2].trim()]));
const LIGHT = tokenBlock(/:root,\s*:root\[data-theme="light"\]\s*\{([^}]*)\}/);
const DARK = tokenBlock(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/);

/* Icons and the brand mark, exactly as build.mjs draws them for the site. */
const ICON_WRAP = (BUILD.match(/const I = \(d\) => `([^`]*)`/) || die('build.mjs: the icon wrapper I() is gone'))[1];
const icon = (name) => {
  const m = BUILD.match(new RegExp(`\\n\\s*"?${name}"?: I\\('([^']*)'\\)`)) || die(`build.mjs: no icon "${name}"`);
  return ICON_WRAP.replace('${d}', m[1]);
};
const SAY_LABEL = (BUILD.match(/decode\(custom \|\| "([^"]+)"\)/) || die('build.mjs: the default "Say this" label is gone'))[1];
const COPY_LABEL = (BUILD.match(/<span class="copy-label">([^<]+)<\/span>/) || die('build.mjs: the Copy button\'s label is gone'))[1];
const BRAND_SVG = (BUILD.match(/const BRAND_MARK = `<span class="brand-mark"[^>]*>(<svg[\s\S]*?<\/svg>)<\/span>`/) || die('build.mjs: BRAND_MARK is gone'))[1];

/* A small reader for the content pages: meta JSON + body HTML. */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', mdash: '—', ndash: '–', middot: '·', rarr: '→' };
const decode = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] ?? m));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* Escaped, with every hyphenated word (a repo name such as
   startup-india-guide) kept whole: a line may not break at its hyphens. */
const escNB = (s) => esc(s).replace(/\S+-\S+/g, (w) => `<span class="nb">${w}</span>`);
const text = (html) => decode(String(html).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
/* Sentences end at . ! or ? followed by a space and a capital, so
   "github.com." and "1–2" stay whole. */
const sentences = (s) => String(s).split(/(?<=[.!?])\s+(?=[A-Z0-9"“‘(])/).map((x) => x.trim()).filter(Boolean);
const PAGES = new Map();
const page = (slug) => {
  if (!PAGES.has(slug)) {
    const src = read('content', `${slug}.html`);
    const m = src.match(/^\s*<!--meta([\s\S]*?)-->/) || die(`content/${slug}.html has no meta comment`);
    PAGES.set(slug, { meta: JSON.parse(m[1]), body: src.slice(m[0].length) });
  }
  return PAGES.get(slug);
};
/* The slice of a page from a heading to the next one, so a card reads the
   section it quotes and not a similar sentence elsewhere. */
const section = (slug, startRe, endRe = /<h2[\s>]/) => {
  const body = page(slug).body;
  const i = body.search(startRe);
  if (i < 0) die(`content/${slug}.html: no ${startRe}`);
  const rest = body.slice(i);
  const j = rest.slice(1).search(endRe);
  return j < 0 ? rest : rest.slice(0, j + 1);
};
const pick = (html, re, what) => (html.match(re) || die(`${what}: not found (${re})`));
/* Assert that a source still carries the words a card sets from it. */
const says = (what, hay, ...needles) => {
  for (const n of needles) if (!String(hay).includes(n)) die(`${what} no longer says "${n}". Update the card to match the site.`);
};
/* Only <var> placeholders may cross from a prompt into a card. */
const promptHTML = (html, what) => {
  const stray = html.match(/<(?!\/?var[\s>])[^>]*>/);
  if (stray) die(`${what}: unexpected markup ${stray[0]}`);
  return html;
};
const navItem = (slug) => {
  for (const g of NAV.groups) for (const it of g.items) if (it.slug === slug) return { group: g.label, nav: it.nav };
  return die(`content/nav.json has no page "${slug}"`);
};
const hostPath = (href) => { const u = new URL(href); return `${u.host}${u.pathname}`.replace(/\/$/, ''); };
const lc = (s) => (/^[A-Z](?![A-Z])/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const repoName = (href) => new URL(href).pathname.split('/').filter(Boolean).pop();
const cardsIn = (html) => [...html.matchAll(/<a class="card" href="([^"]+)"[^>]*><span class="card-kicker">([^<]*)<\/span><strong>([^<]*)<\/strong><span>([\s\S]*?)<\/span><\/a>/g)]
  .map((m) => ({ href: m[1], kicker: decode(m[2]), title: decode(m[3]), desc: text(m[4]) }));

/* ================================================================
   Shared furniture
   ================================================================ */
const MARK = `<span class="mark" aria-hidden="true">${BRAND_SVG}</span>`;

/* Inside cards: the site's top bar, restated. Mark, name and the home
   page's title (the cover's deck, so all five cards carry one line; the
   site's siteTagline names Claude Code alone, and the guide covers Codex
   too); on the right, the part of the guide the card's content comes from
   (its nav.json group), so a reader knows where to find it. */
const masthead = (where) => `
<header class="mast" data-block>
  <div class="imprint">${MARK}<div><div class="imprint-name">${esc(SITE_NAME)}</div><div class="imprint-sub">${esc(page('index').meta.title)}</div></div></div>
  <div class="mast-r">${esc(where)}</div>
</header>`;

/* The footer. { url: false } keeps the rule and the byline and drops the
   address, for a card whose own last block is the address (05). */
const foot = ({ url = true } = {}) => `
<footer class="foot${url ? '' : ' no-url'}" data-block>
  ${url ? `<span class="url">${esc(ADDRESS)}</span>` : ''}<span class="by">By <b>${esc(AUTHOR)}</b></span>
</footer>`;

/* A "Say this" box, as the share card (site/og.png) draws one: the default
   label, and the site's Copy button as a plain pill. The label the cheat
   sheet gives each prompt goes in the alt text. */
const sayBox = (p) => `
<div class="say-box">
  <div class="say-head"><span class="say-ic">${icon('message')}</span><span class="say-label">${esc(SAY_LABEL)}</span><span class="say-copy">${esc(COPY_LABEL)}</span></div>
  <div class="say-body">${p.html}</div>
</div>`;

const BASE_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{font-family:var(--font-body);-webkit-font-smoothing:antialiased;background:var(--bg);color:var(--text)}
.card{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:var(--bg)}
.page{position:absolute;left:84px;right:84px;top:56px;bottom:50px;display:flex;flex-direction:column}
.page > *{flex:none}

.mark{display:grid;place-items:center;flex:none;width:54px;height:54px;border-radius:15px;background:var(--hero-bg);box-shadow:inset 0 0 0 1.5px var(--hero-line)}
.mark svg{width:36px;height:36px}
.bm-chevron{fill:none;stroke:var(--hero-text);stroke-width:2.8;stroke-linecap:round;stroke-linejoin:round}
.bm-spark{fill:var(--say-bar)}

.mast{display:flex;align-items:center;justify-content:space-between;gap:24px;padding-bottom:22px;border-bottom:1.5px solid var(--border)}
.imprint{display:flex;align-items:center;gap:16px}
.imprint-name{font:800 30px/1 var(--font-display);letter-spacing:-.02em;color:var(--text)}
.imprint-sub{margin-top:7px;font:500 16px/1.1 var(--font-body);color:var(--text-faint)}
.mast-r{font:700 14px/1 var(--font-body);letter-spacing:.14em;text-transform:uppercase;color:var(--text-faint);text-align:right}

.kicker{font:700 17px/1 var(--font-body);letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.title{font-family:var(--font-display);font-size:78px;font-weight:800;letter-spacing:-.032em;line-height:.98;color:var(--text)}
.stand{font:400 25px/1.45 var(--font-body);color:var(--text-muted)}
/* no line ends on a lone word, and no repo name breaks at a hyphen */
p,.stand,.say-body,.st-use{text-wrap:pretty}
.nb{white-space:nowrap}

.foot{margin-top:auto;padding-top:20px;border-top:1.5px solid var(--border);display:flex;justify-content:space-between;align-items:baseline;gap:24px}
.foot.no-url{justify-content:flex-end}
.url{font:600 21px/1 var(--font-mono);color:var(--link)}
.by{font:600 14px/1 var(--font-body);letter-spacing:.14em;text-transform:uppercase;color:var(--text-faint)}
.by b{color:var(--text);font-weight:800}

var{font-style:normal;font-weight:700;font-family:inherit;color:var(--var-text);background:var(--var-bg);
  border:2px dashed var(--var-border);border-radius:8px;padding:0 .26em;-webkit-box-decoration-break:clone;box-decoration-break:clone}

.say-box{position:relative;overflow:hidden;background:var(--say-bg);border:2px solid var(--say-border);border-left:9px solid var(--say-bar);border-radius:15px;box-shadow:var(--shadow-say)}
.say-head{display:flex;align-items:center;gap:12px;padding:11px 20px 11px 18px;background:var(--say-head-bg);border-bottom:1.5px solid var(--say-border)}
.say-ic{display:grid;color:var(--say-ink)}
.say-ic svg{width:25px;height:25px}
.say-label{font:800 15px/1 var(--font-body);letter-spacing:.12em;text-transform:uppercase;color:var(--say-ink)}
.say-copy{margin-left:auto;padding:7px 14px;border-radius:9px;background:var(--say-btn-bg);border:1.5px solid var(--say-border);font:700 16px/1 var(--font-body);color:var(--say-ink)}
.say-body{padding:16px 24px 19px 22px;font:500 27px/1.52 var(--font-body);color:var(--text)}
`;

/* ================================================================
   Devices. The phone is the indigo set's drawing; the browser window is new.
   Their chrome is the one place literals appear: it is hardware and browser,
   not the brand. Light chrome takes the site's own surface tokens.
   ================================================================ */
const PHONE = { screenW: 390, status: 50, toolbar: 84, bezel: 12, band: 3.5, radius: 54 };
const CHROME = {
  light: { toolbar: 'var(--surface-alt)', pill: 'var(--surface-sunken)', ink: 'var(--text)', home: 'var(--text)', line: 'var(--border)' },
  dark: { toolbar: '#15171E', pill: '#252935', ink: '#ECEEF5', home: '#ECEEF5', line: 'rgba(255,255,255,.07)' },
};
const statusIcons = (c) => `<span class="st-icons" aria-hidden="true">
  <svg width="19" height="12" viewBox="0 0 19 12"><rect x="0" y="8" width="3.2" height="4" rx=".8" fill="${c}"/><rect x="5.2" y="5.5" width="3.2" height="6.5" rx=".8" fill="${c}"/><rect x="10.4" y="3" width="3.2" height="9" rx=".8" fill="${c}"/><rect x="15.6" y="0" width="3.2" height="12" rx=".8" fill="${c}"/></svg>
  <svg width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 11.6 6.1 9.2a3.4 3.4 0 0 1 4.8 0z" fill="${c}"/><path d="M3.7 6.8a6.8 6.8 0 0 1 9.6 0l-1.4 1.4a4.8 4.8 0 0 0-6.8 0z" fill="${c}"/><path d="M1.2 4.3a10.4 10.4 0 0 1 14.6 0l-1.4 1.4a8.4 8.4 0 0 0-11.8 0z" fill="${c}"/></svg>
  <svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.6" fill="none" stroke="${c}" stroke-opacity=".45"/><rect x="2.3" y="2.3" width="19.4" height="8.4" rx="2.2" fill="${c}"/><path d="M25 4.4v4.2c.9-.3 1.5-1.1 1.5-2.1s-.6-1.8-1.5-2.1z" fill="${c}" fill-opacity=".5"/></svg>
</span>`;
const lock = (c) => `<svg class="lock" viewBox="0 0 11 13" aria-hidden="true"><rect x=".5" y="5.5" width="10" height="7" rx="1.6" fill="${c}"/><path d="M2.7 5.6V3.9a2.8 2.8 0 0 1 5.6 0v1.7" fill="none" stroke="${c}" stroke-width="1.3"/></svg>`;

const phoneH = (screen) => PHONE.status + screen.cut + PHONE.toolbar + 2 * (PHONE.bezel + PHONE.band);
const phone = (screen, zoom, paper = false) => {
  const k = CHROME[screen.theme];
  return `<div class="phone${paper ? ' on-paper' : ''}" style="zoom:${zoom}" data-block>
  <div class="phone-body">
    <i class="key l" style="top:150px;height:30px"></i><i class="key l" style="top:206px;height:58px"></i><i class="key l" style="top:276px;height:58px"></i><i class="key r" style="top:226px;height:88px"></i>
    <div class="bezel"><div class="screen" style="background:${screen.statusBg}">
      <div class="status" style="background:${screen.statusBg};color:${screen.statusInk}"><span class="time">9:41</span>${statusIcons(screen.statusInk)}</div>
      <div class="island"></div>
      <img class="shot" src="${screen.uri}" width="${PHONE.screenW}" height="${screen.cut}" alt="">
      <div class="toolbar" style="background:${k.toolbar};border-top:1px solid ${k.line}"><div class="addr" style="background:${k.pill};color:${k.ink}">${lock(k.ink)}<span>${esc(screen.domain)}</span></div><div class="home" style="background:${k.home}"></div></div>
    </div></div>
  </div>
</div>`;
};
const PHONE_CSS = `
.phone{position:relative;flex:none}
.phone-body{position:relative;padding:${PHONE.band}px;border-radius:${PHONE.radius + PHONE.bezel + PHONE.band}px;
  background:linear-gradient(150deg,#7a7e87 0%,#3a3d45 18%,#202228 50%,#3a3d45 82%,#8a8e97 100%);
  box-shadow:0 1px 0 rgba(255,255,255,.18) inset,0 50px 80px -30px rgba(0,0,0,.55)}
.on-paper .phone-body{box-shadow:0 1px 0 rgba(255,255,255,.18) inset,0 28px 44px -24px rgba(20,34,58,.5)}
.bezel{padding:${PHONE.bezel}px;border-radius:${PHONE.radius + PHONE.bezel}px;background:#040507}
.screen{position:relative;width:${PHONE.screenW}px;border-radius:${PHONE.radius}px;overflow:hidden}
.status{height:${PHONE.status}px;display:flex;align-items:center;justify-content:space-between;padding:4px 33px 0 50px}
.time{font:600 17px/1 var(--font-body);letter-spacing:-.01em}
.st-icons{display:flex;gap:6px;align-items:center}
.island{position:absolute;top:11px;left:50%;transform:translateX(-50%);width:122px;height:35px;border-radius:18px;background:#000}
.shot{display:block}
.toolbar{position:relative;height:${PHONE.toolbar}px}
.addr{position:absolute;left:18px;right:18px;top:11px;height:44px;border-radius:22px;display:flex;align-items:center;justify-content:center;gap:7px;font:500 16px/1 var(--font-body)}
.lock{width:11px;height:13px;flex:none}
.home{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);width:134px;height:5px;border-radius:3px}
.key{position:absolute;width:4px;border-radius:2px}
.key.l{left:-2.5px;background:linear-gradient(90deg,#2a2c32,#6a6e77)}
.key.r{right:-2.5px;background:linear-gradient(90deg,#6a6e77,#2a2c32)}`;

/* A desktop browser window around a live capture: neutral dots (three
   traffic-light hues would be three new accents), an address pill, a hairline. */
const browserWindow = (shot, url) => `
<div class="win">
  <div class="win-bar"><span class="dots"><i></i><i></i><i></i></span><span class="win-addr">${lock('currentColor')}<span>${esc(url)}</span></span></div>
  <img class="win-shot" src="${shot.uri}" alt="" style="aspect-ratio:${shot.shape.toFixed(4)}">
</div>`;
const WINDOW_CSS = `
.win{overflow:hidden;border-radius:14px;background:var(--surface);border:1.5px solid var(--border-strong);box-shadow:var(--shadow-3)}
.win-bar{display:flex;align-items:center;gap:14px;height:40px;padding:0 14px;background:var(--surface-alt);border-bottom:1.5px solid var(--border)}
.dots{display:flex;gap:7px;flex:none}
.dots i{display:block;width:11px;height:11px;border-radius:50%;background:var(--border-strong)}
.win-addr{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;gap:7px;height:26px;border-radius:13px;background:var(--surface);
  font:500 14px/1 var(--font-body);color:var(--text-muted);white-space:nowrap;overflow:hidden}
.win-addr .lock{width:10px;height:12px;flex:none}
.win-shot{display:block;width:100%;height:auto}`;

/* ================================================================
   01-site: the cover.

   The ground is the site's hero: the same ink-navy-to-teal gradient and the
   same two glows (teal from the top right, amber from the bottom left), the
   way the home page and the share card open. The phone shows the home page
   in whichever theme contrasts more with that ground, measured below; that
   is the light theme, so the white page and its navy hero panel stand off
   the navy card. The kicker, name and title above it are the site's own:
   the home page's eyebrow and time estimate, siteName, and its title.
   ================================================================ */
const cover = (screen) => {
  const home = page('index').meta;
  const PHONE_PX = 905;                                  // the phone's height on the card
  const zoom = +(PHONE_PX / phoneH(screen)).toFixed(4);
  const [cta1, cta2] = (home.cta || die('index.html meta has no cta')).map((c) => c.text);
  return {
    id: '01-site', file: fileOf('01-site'),
    alt: `On an ink-navy card, under the line "${home.eyebrow} · ${home.time}", the title ${SITE_NAME} and "${home.title}". Below them, a phone shows the guide's home page in its ${screen.theme} theme: the hero panel with the same title, its lede, and the buttons "${cta1}" and "${cta2}". Under the phone, the address ${ADDRESS}.`,
    css: `
.card{background:var(--hero-bg);color:var(--hero-text)}
.card::after{content:"";position:absolute;inset:0;pointer-events:none;background:
  radial-gradient(900px 520px at 104% -6%,var(--hero-glow-a),transparent 66%),
  radial-gradient(860px 560px at -8% 106%,var(--hero-glow-b),transparent 66%)}
.top,.stage,.cover-url{z-index:1}
.top{position:absolute;left:84px;right:84px;top:54px;display:flex;flex-direction:column;align-items:center;text-align:center}
.brandrow{display:flex;align-items:center;gap:16px}
.brandrow .mark{width:46px;height:46px;border-radius:13px}
.brandrow .mark svg{width:31px;height:31px}
.cover-kicker{font:700 17px/1 var(--font-body);letter-spacing:.14em;text-transform:uppercase;color:var(--hero-muted)}
.cover-title{margin-top:20px;font:800 132px/.9 var(--font-display);letter-spacing:-.04em;color:var(--hero-text)}
.cover-deck{margin-top:18px;font:500 35px/1.2 var(--font-body);letter-spacing:-.01em;color:var(--hero-muted)}
.stage{position:absolute;left:0;right:0;top:336px;display:flex;justify-content:center}
.cover-url{position:absolute;left:84px;right:84px;bottom:46px;text-align:center;font:600 25px/1 var(--font-mono);color:var(--hero-text)}
${PHONE_CSS}`,
    body: `
<div class="top" data-block>
  <div class="brandrow">${MARK}<span class="cover-kicker">${esc(home.eyebrow)} &nbsp;&middot;&nbsp; ${esc(home.time)}</span></div>
  <h1 class="cover-title">${esc(SITE_NAME)}</h1>
  <div class="cover-deck">${esc(home.title)}</div>
</div>
<div class="stage">${phone(screen, zoom)}</div>
<div class="cover-url" data-block>${esc(ADDRESS)}</div>`,
  };
};

/* ================================================================
   02-steps: five steps to a live site.

   The steps are nav.json's five "Step N · Name" groups; each line under a
   name is the matching step card on the home page, and the build fails if
   the card's kicker and the nav group ever disagree. Step 2 carries the fork,
   drawn rather than said: the two paths as choose-setup.html names them,
   with that page's Devices row, in the colors the site gives the two paths'
   badges (the home page's fork sentence is checked, and goes in the alt
   text). The route ends where the home page says you end: your own address.
   ================================================================ */
const steps = () => {
  const steps = NAV.groups.map((g) => g.label.match(/^Step (\d+) · (.+)$/)).filter(Boolean)
    .map((m) => ({ n: +m[1], name: m[2], label: m[0] }));
  if (steps.length !== 5 || steps.some((s, i) => s.n !== i + 1)) die(`nav.json has ${steps.length} numbered steps; card 02 is laid out for Steps 1 to 5`);
  const five = section('index', /<h2>The five steps<\/h2>/);
  const kicker = text(pick(five, /<h2>([^<]*)<\/h2>/, 'index.html five steps')[1]);
  const fork = text(pick(five, /<p>([\s\S]*?)<\/p>/, 'index.html fork line')[1]);
  says('index.html, The five steps', fork, 'Step 2', 'the app path', 'the VS Code path');
  const bothLead = sentences(fork)[1] || die('index.html: the fork line no longer says where both paths lead');
  const cards = cardsIn(five);
  steps.forEach((s, i) => {
    const c = cards[i];
    if (!c || c.kicker !== s.label) die(`index.html step card ${i + 1} reads "${c?.kicker}", but nav.json says "${s.label}"`);
    s.desc = c.desc;
  });

  const setup = page('choose-setup').body;
  const heads = [...pick(setup, /<thead>([\s\S]*?)<\/thead>/, 'choose-setup.html table head')[1].matchAll(/<th>([^<]*)<\/th>/g)].map((m) => decode(m[1])).filter(Boolean);
  const row = (name) => {
    const m = pick(setup, new RegExp(`<tr><th scope="row">${name}</th><td>([\\s\\S]*?)</td><td>([\\s\\S]*?)</td></tr>`), `choose-setup.html "${name}" row`);
    return [text(m[1]), text(m[2])];
  };
  if (heads.length !== 2) die('choose-setup.html no longer compares exactly two paths');
  const devices = row('Devices');
  const paths = [
    { name: heads[0], line: devices[0], icon: icon(navItemIcon('claude-app')), cls: 'app' },
    { name: heads[1], line: devices[1], icon: icon(navItemIcon('install-vscode')), cls: 'vscode' },
  ];
  says('choose-setup.html', `${heads.join(' ')} ${devices.join(' ')}`, 'app path', 'VS Code path', 'phone', 'browser');

  const end = section('index', /<h2>What you'll end with<\/h2>/);
  const endKicker = text(pick(end, /<h2>([^<]*)<\/h2>/, 'index.html end heading')[1]);
  const endURL = promptHTML(pick(end, /<p>Your own site at <strong>([\s\S]*?)<\/strong>/, 'index.html "Your own site at"')[1], 'index.html end URL');

  return {
    id: '02-steps', file: fileOf('02-steps'),
    alt: `Headline: Five steps to a live site. The steps run down a numbered route. ${steps.map((s) => `Step ${s.n}, ${s.name}: ${s.desc}`).join(' ')} At Step 2 the route splits into two boxes, ${lc(paths[0].name)} (${lc(paths[0].line)}) or ${lc(paths[1].name)} (${lc(paths[1].line)}): ${lc(bothLead)} The route ends at your own site, ${text(endURL)}, with your username and repo name as highlighted placeholders.`,
    css: `
.kicker{margin-top:40px}
.title{margin-top:14px}
.route{position:relative;margin-top:44px;list-style:none}
.route::before{content:"";position:absolute;left:25px;top:30px;bottom:34px;width:4px;border-radius:2px;background:var(--step-rail)}
.stop{position:relative;display:grid;grid-template-columns:54px 1fr;column-gap:26px;padding-bottom:34px}
.dot{display:grid;place-items:center;width:54px;height:54px;border-radius:50%;background:var(--step-bg);color:var(--step-text);font:800 27px/1 var(--font-display);box-shadow:0 0 0 6px var(--bg)}
.stop-name{padding-top:2px;font:800 34px/1.05 var(--font-display);letter-spacing:-.02em;color:var(--text)}
.stop p{margin-top:7px;font:400 24px/1.4 var(--font-body);color:var(--text-muted);text-wrap:balance}
.paths{margin-top:16px;display:grid;grid-template-columns:1fr auto 1fr;align-items:stretch;column-gap:12px}
.path{display:grid;grid-template-columns:auto 1fr;column-gap:14px;align-items:start;padding:17px 20px 19px 18px;border-radius:14px}
.path.app{background:var(--accent-tint);color:var(--accent-strong)}
.path.vscode{background:var(--info-tint);color:var(--info)}
.path svg{width:32px;height:32px;margin-top:0}
.path b{display:block;font:800 24px/1.15 var(--font-body)}
.path span{display:block;margin-top:7px;font:500 22px/1.35 var(--font-body);color:var(--text-muted);text-wrap:balance}
.or{align-self:center;font:700 15px/1 var(--font-body);letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint)}
.stop.end{padding-bottom:0}
.dot.globe{background:var(--dg-accent-fill);color:var(--dg-on)}
.dot.globe svg{width:28px;height:28px}
.end-k{padding-top:4px;font:700 15px/1 var(--font-body);letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.end-url{margin-top:9px;font:600 23px/1.3 var(--font-mono);color:var(--text)}
.end-url var{font-family:var(--font-mono);font-weight:600}`,
    body: `
<div class="page">
  ${masthead(navItem('index').group)}
  <div class="kicker" data-block>${esc(kicker)} &nbsp;&middot;&nbsp; ${esc(page('index').meta.time)}</div>
  <h2 class="title" data-block>Five steps to a live site.</h2>
  <ol class="route" data-block>
    ${steps.map((s) => `<li class="stop"><div class="dot">${s.n}</div><div>
      <div class="stop-name">${esc(s.name)}</div>
      <p>${escNB(s.desc)}</p>
      ${s.n === 2 ? `<div class="paths">${paths.map((p) => `<div class="path ${p.cls}">${p.icon}<div><b>${esc(p.name)}</b><span>${esc(p.line)}</span></div></div>`).join('<div class="or">or</div>')}</div>` : ''}
    </div></li>`).join('')}
    <li class="stop end"><div class="dot globe">${icon('globe')}</div><div>
      <div class="end-k">${esc(endKicker)}</div>
      <div class="end-url">${endURL}</div>
    </div></li>
  </ol>
  ${foot()}
</div>`,
  };
};
function navItemIcon(slug) {
  for (const g of NAV.groups) for (const it of g.items) if (it.slug === slug) return it.icon;
  return die(`content/nav.json has no page "${slug}"`);
}

/* ================================================================
   03-say: the one rule, and four prompts that follow it.

   The rule is the bold line under "The one rule" on the home page. The
   prompts come from the Prompt cheat sheet (prompts.html), each found by
   the label the site gives it, and each must also appear, word for word,
   on the page that teaches it. Placeholders stay placeholders: the site's
   amber chips, unfilled. One idea per card: what you do by hand stays on
   the site, not here.
   ================================================================ */
const PROMPTS = [
  { label: 'Name the one repo to change', teach: 'multiple-repos' },
  { label: 'Plan before a big change', teach: 'talk-to-it' },
  { label: 'Commit as yourself (add to any prompt)', teach: 'commit-as-you' },
  { label: 'Save it to GitHub', teach: 'save-and-push' },
];
const say = () => {
  const rule = section('index', /<h2>The one rule<\/h2>/);
  const kicker = text(pick(rule, /<h2>([^<]*)<\/h2>/, 'index.html one rule')[1]);
  const line = text(pick(rule, /<p><strong>([\s\S]*?)<\/strong><\/p>/, 'index.html the rule')[1]);
  const parts = sentences(line);
  if (parts.length !== 3) die(`the one rule is now ${parts.length} sentences; card 03 sets it as three lines`);

  const all = [...page('prompts').body.matchAll(/<pre class="say"(?: data-label="([^"]*)")?>([\s\S]*?)<\/pre>/g)]
    .map((m) => ({ label: decode(m[1] || 'Say this'), html: m[2] }));
  const prompts = PROMPTS.map(({ label, teach }) => {
    const p = all.find((x) => x.label === label) || die(`prompts.html has no "Say this" box labeled "${label}"`);
    promptHTML(p.html, `prompts.html "${label}"`);
    says(`content/${teach}.html`, text(page(teach).body), text(p.html));
    return { ...p, teach };
  });

  return {
    id: '03-say', file: fileOf('03-say'),
    alt: `${kicker}, in large type: ${line} Below it, four prompts from the guide's cheat sheet, each in an amber "${SAY_LABEL}" box with a ${COPY_LABEL} button, as the guide shows them. ${prompts.map((p) => `${p.label}: "${text(p.html)}"`).join(' ')} Your username, repo, name and email are highlighted placeholders.`,
    css: `
.kicker{margin-top:40px}
.rule{margin-top:16px;font:800 64px/1.02 var(--font-display);letter-spacing:-.03em;color:var(--text)}
.rule span{display:block}
.rule span:last-child{color:var(--accent)}
.says{margin-top:48px;display:flex;flex-direction:column;gap:26px}
.say-body{padding:20px 26px 22px 24px;font-size:29px}`,
    body: `
<div class="page">
  ${masthead(navItem('talk-to-it').group)}
  <div class="kicker" data-block>${esc(kicker)}</div>
  <h2 class="rule" data-block>${parts.map((s) => `<span>${esc(s)}</span>`).join('')}</h2>
  <div class="says" data-block>${prompts.map(sayBox).join('')}</div>
  ${foot()}
</div>`,
  };
};

/* ================================================================
   04-one-prompt: one message built history-of-indigo.

   The message is the blockquote under "The fastest way: one big prompt" in
   make-your-version.html, typos and all: the page's point is that they did
   not matter, and the card says so in the page's own words. The headline
   names the site, as starters.html does ("history-of-indigo was built from
   a single message."): on a Quickstart card, "this site" would read as the
   guide. The phone is a
   live capture of history-of-indigo, the site that message made, in its
   default dark theme, cut 22 css px under the byline icons (never into the
   buttons), as the indigo set's own cover is.
   ================================================================ */
const onePrompt = (screen) => {
  const one = section('make-your-version', /<h2 id="one-prompt">/, /<ol class="steps">/);
  const kicker = text(pick(one, /<h2[^>]*>([\s\S]*?)<\/h2>/, 'the one-prompt heading')[1]);
  const quote = text(pick(one, /<blockquote><p>([\s\S]*?)<\/p><\/blockquote>/, 'the one-prompt blockquote')[1]);
  const [intro, after] = one.replace(/<blockquote>[\s\S]*?<\/blockquote>/, '').match(/<p>[\s\S]*?<\/p>/g).map(text);
  const asTyped = intro.slice(intro.lastIndexOf('. ') + 2);
  if (!asTyped.startsWith('This is the message')) die(`make-your-version.html: expected "This is the message, exactly as typed:", found "${asTyped}"`);
  const typos = sentences(after)[0];
  if (!/typos/.test(typos)) die(`make-your-version.html: expected the typos line, found "${typos}"`);
  const rest = after.slice(typos.length).trim();
  const lead = pick(rest, /^(.*? says four things:) /, 'make-your-version.html "four things"')[1];
  /* Split the list on commas outside parentheses: "the job (research first,
     then build and publish)" is one item. */
  const list = pick(rest, /says four things: (.*)\.$/, 'make-your-version.html four things list')[1];
  const four = []; let depth = 0, cur = '';
  for (const ch of list) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && !depth) { four.push(cur.trim()); cur = ''; } else cur += ch;
  }
  four.push(cur.trim());
  const items = four.map((s) => s.replace(/^and /, ''));
  if (items.length !== 4) die(`make-your-version.html now lists ${items.length} things; card 04 is laid out for four`);

  const indigo = cardsIn(section('starters', /<h2>What people made from them<\/h2>/)).find((c) => /history-of-indigo/.test(c.href))
    || die('starters.html no longer shows history-of-indigo');
  says('starters.html', text(page('starters').body), 'history-of-indigo was built from a single message');
  const PHONE_PX = 716;                  // the phone's address bar stays at MIN_PX or more
  const zoom = +(PHONE_PX / phoneH(screen)).toFixed(4);

  return {
    id: '04-one-prompt', file: fileOf('04-one-prompt'),
    alt: `Headline: One message built history-of-indigo. On the left, the message that built the history-of-indigo site, exactly as typed, typos included: "${quote}" Under it: ${typos} ${lead} ${items.map((s, i) => `${i + 1}, ${s}`).join('; ')}. On the right, a phone shows that site, ${screen.title}, at ${hostPath(indigo.href)}.`,
    css: `
.kicker{margin-top:40px}
.title{margin-top:14px}
.title .nb{letter-spacing:-.018em}
.duo{margin-top:36px;display:grid;grid-template-columns:1fr auto;column-gap:40px;align-items:start}
.words{min-width:0}
.as-typed{font:600 22px/1.3 var(--font-body);color:var(--text-faint)}
.quote{margin-top:14px;padding:4px 0 4px 24px;border-left:5px solid var(--accent);font:500 27px/1.5 var(--font-body);color:var(--text)}
.quote{text-wrap:pretty}
.typos{margin-top:26px;font:800 44px/1.02 var(--font-display);letter-spacing:-.025em;color:var(--text)}
.fig{display:flex;flex-direction:column;align-items:center}
.cap{margin-top:32px;text-align:center}
.cap-name{font:600 26px/1 var(--font-mono);color:var(--text)}
.cap-k{margin-top:10px;font:700 15px/1 var(--font-body);letter-spacing:.14em;text-transform:uppercase;color:var(--text-faint)}
.four-lead{margin-top:26px;padding-top:22px;border-top:1.5px solid var(--border);font:600 24px/1.35 var(--font-body);color:var(--text);text-wrap:balance}
.four{margin-top:16px;list-style:none;display:flex;flex-direction:column;gap:12px}
.four li{display:grid;grid-template-columns:40px 1fr;column-gap:14px;align-items:center;font:400 24px/1.3 var(--font-body);color:var(--text-muted);text-wrap:balance}
.four .n{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:var(--step-bg);color:var(--step-text);font:800 20px/1 var(--font-display)}
${PHONE_CSS}`,
    body: `
<div class="page">
  ${masthead(navItem('make-your-version').group)}
  <div class="kicker" data-block>${esc(kicker)}</div>
  <h2 class="title" data-block>One message built <span class="nb">${esc(repoName(indigo.href))}</span>.</h2>
  <div class="duo" data-block>
    <div class="words">
      <div class="as-typed">${esc(asTyped)}</div>
      <blockquote class="quote">${escNB(quote)}</blockquote>
      <div class="typos">${esc(typos)}</div>
      <p class="four-lead">${esc(lead)}</p>
      <ol class="four">${items.map((s, i) => `<li><b class="n">${i + 1}</b><span>${esc(s)}</span></li>`).join('')}</ol>
    </div>
    <figure class="fig">${phone(screen, zoom, true)}<figcaption class="cap"><div class="cap-name">${esc(repoName(indigo.href))}</div><div class="cap-k">${esc(indigo.kicker)}</div></figcaption></figure>
  </div>
  ${foot()}
</div>`,
  };
};

/* ================================================================
   05-starters: make your own version.

   The two starters as the site frames them: each card's kicker and its
   "Use it to..." sentence from starters.html, and the one-phrase format
   from the home page's "What you'll end with" list, which the build checks
   against the starters page. Each window is a live capture at one of eleven
   desktop widths (1024 to 1424 css px, see WIN), cut where both sites have
   a clean cut of the same shape, so neither cut slices a line of text, a
   button or an icon. The navy band is the set's closing address, so this
   card's footer keeps its byline and drops the address.
   ================================================================ */
const starters = (shots) => {
  const st = page('starters');
  const cards = cardsIn(section('starters', /<h2>The two starters<\/h2>/));
  if (cards.length !== 2) die(`starters.html now offers ${cards.length} starters; card 05 is laid out for two`);
  const endList = section('index', /<h2>What you'll end with<\/h2>/);
  const items = cards.map((c) => {
    const name = c.title;
    const strong = text(pick(endList, new RegExp(`<li><strong>${name}, ([^<]*)</strong>`), `index.html "${name}" line`)[1]).replace(/\.$/, '');
    if (!c.desc.toLowerCase().includes(strong.toLowerCase())) die(`starters.html's ${name} card no longer says "${strong}"`);
    const use = sentences(c.desc).find((s) => s.startsWith('Use it to')) || die(`starters.html's ${name} card has no "Use it to" line`);
    const shot = shots.get(c.href) || die(`no capture for ${c.href}`);
    return { name, kicker: c.kicker, format: strong, use, shot, url: hostPath(c.href) };
  });
  const title = navItem('make-your-version').nav;
  const stand = sentences(st.meta.lede).slice(0, 2).join(' ');
  says('starters.html lede', stand, 'Copy a real, working site');
  const start = navItem('index').nav;

  return {
    id: '05-starters', file: fileOf('05-starters'),
    alt: `Headline: ${title}. ${stand} Two browser windows show the two starters' live sites, side by side. ${items.map((s) => `${s.name} (${s.kicker}): ${s.format}. ${s.use}`).join(' ')} At the bottom, in a navy band: ${start}, ${ADDRESS}.`,
    css: `
.kicker{margin-top:40px}
.title{margin-top:14px}
.stand{margin-top:20px;max-width:880px;font-size:25px}
.pair{margin-top:42px;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(5,auto);column-gap:30px}
.starter{min-width:0;display:grid;grid-row:span 5;grid-template-rows:subgrid;align-content:start}
.st-k{margin-top:26px;font:700 14px/1.2 var(--font-body);letter-spacing:.13em;text-transform:uppercase;color:var(--accent)}
.st-name{margin-top:11px;font:600 24px/1 var(--font-mono);color:var(--text)}
/* both heads on two balanced lines, so the rows under them line up: the cap
   sits between "A multi-page minisite" (~9.7em) and "One long scrolling
   story" (~11em) */
.st-format{margin-top:13px;max-width:10.35em;font:800 34px/1.08 var(--font-display);letter-spacing:-.02em;color:var(--text);text-wrap:balance}
.st-format::first-letter{text-transform:uppercase}
.st-use{margin-top:14px;font:400 24px/1.42 var(--font-body);color:var(--text-muted)}
.start{margin-top:auto;display:flex;align-items:center;gap:22px;padding:26px 30px;border-radius:18px;background:var(--primary);color:var(--primary-contrast)}
.start .mark{width:50px;height:50px}
.start-k{font:700 16px/1 var(--font-body);letter-spacing:.14em;text-transform:uppercase;color:var(--hero-muted)}
.start-url{margin-top:10px;font:600 33px/1 var(--font-mono);color:var(--primary-contrast)}
.start + .foot{margin-top:40px}
${WINDOW_CSS}`,
    body: `
<div class="page">
  ${masthead(navItem('starters').group)}
  <div class="kicker" data-block>${esc(page('starters').meta.title)}</div>
  <h2 class="title" data-block>${esc(title)}.</h2>
  <p class="stand" data-block>${esc(stand)}</p>
  <div class="pair" data-block>
    ${items.map((s) => `<div class="starter">
      ${browserWindow(s.shot, s.url)}
      <div class="st-k">${esc(s.kicker)}</div>
      <div class="st-name">${esc(s.name)}</div>
      <div class="st-format">${esc(s.format)}</div>
      <p class="st-use">${esc(s.use)}</p>
    </div>`).join('')}
  </div>
  <div class="start" data-block>${MARK}<div><div class="start-k">${esc(start)}</div><div class="start-url">${esc(ADDRESS)}</div></div></div>
  ${foot({ url: false })}
</div>`,
  };
};

/* ================================================================
   Captures
   ================================================================ */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const DROP = /googletagmanager\.com|google-analytics\.com|doubleclick\.net|plausible\.io|stats\.g\.doubleclick/;
const CACHE = new Map();
const viaNode = async (tab) => {
  await tab.route('**/*', async (route) => {
    const u = route.request().url();
    if (u.startsWith('data:') || u.startsWith('http://127.0.0.1') || u.startsWith('http://localhost')) return route.continue();
    if (DROP.test(u)) return route.abort();
    try {
      if (!CACHE.has(u)) {
        const res = await fetch(u, { headers: { 'user-agent': UA } });
        CACHE.set(u, { status: res.status, type: res.headers.get('content-type') || 'application/octet-stream', body: Buffer.from(await res.arrayBuffer()) });
      }
      const c = CACHE.get(u);
      await route.fulfill({ status: c.status, headers: { 'content-type': c.type, 'access-control-allow-origin': '*' }, body: c.body });
    } catch (e) {
      console.error(`  ! ${u}: ${e.message}`);
      await route.abort();
    }
  });
};

/* The page's own fonts must have arrived, or the capture shows a fallback. */
const pageFontsLoaded = () => {
  const fam = (el) => getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim();
  const loaded = (f) => [...document.fonts].some((x) => x.family.replace(/["']/g, '') === f && x.status === 'loaded');
  const want = [...new Set([document.querySelector('h1'), document.body].filter(Boolean).map(fam))];
  return want.filter((f) => !loaded(f));
};
const statusOf = async (tab) => tab.evaluate(() => {
  const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
  const m = metas.find((x) => !x.media || matchMedia(x.media).matches);
  return { themeColor: m?.content || null, theme: document.documentElement.getAttribute('data-theme'), title: document.title };
});
const hexRGB = (h) => { const s = h.replace('#', ''); const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)); };
const lumOf = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [L1, L2] = [lumOf(a), lumOf(b)].sort((x, y) => y - x); return (L1 + 0.05) / (L2 + 0.05); };
/* Status-bar glyphs: black or white, whichever reads on the page's theme-color. */
const inkOn = (bg) => (ratio(hexRGB(bg), [0, 0, 0]) >= ratio(hexRGB(bg), [255, 255, 255]) ? '#000000' : '#FFFFFF');

/* The cover's phone takes whichever theme contrasts more with the ground,
   the hero's darkest stop. Measured, not chosen by eye. */
const coverTheme = () => {
  const ground = hexRGB((LIGHT['--hero-bg'].match(/#[0-9a-f]{6}/i) || die('--hero-bg has no color stop'))[0]);
  const light = ratio(hexRGB(LIGHT['--bg']), ground), dark = ratio(hexRGB(DARK['--bg']), ground);
  return { theme: light >= dark ? 'light' : 'dark', light, dark };
};

/* 01: the home page from docs/, at phone width, cut in the gap between the
   hero panel and the block under it: below both buttons and the time chip,
   and above the progress card, measured from the DOM. */
const captureHome = async (browser, origin) => {
  const choice = coverTheme();
  const ctx = await browser.newContext({ viewport: { width: PHONE.screenW, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: choice.theme });
  const tab = await ctx.newPage();
  await viaNode(tab);
  const res = await tab.goto(`${origin}${PREFIX}`, { waitUntil: 'networkidle', timeout: 90_000 });
  if (!res || !res.ok()) die(`capture: ${origin}${PREFIX} returned HTTP ${res?.status() ?? 'no response'}`);
  await tab.evaluate(() => document.fonts.ready);
  const m = await tab.evaluate(() => {
    const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; };
    const hero = document.querySelector('.hero');
    return {
      topbar: box(document.querySelector('.topbar')), hero: box(hero), next: box(hero?.nextElementSibling),
      buttons: [...document.querySelectorAll('.hero .btn')].map(box),
      h1: document.querySelector('.hero h1')?.textContent.trim(), kicker: document.querySelector('.hero-kicker')?.textContent.trim(),
      lede: document.querySelector('.hero-lede')?.textContent.trim(),
      ctas: [...document.querySelectorAll('.hero .btn')].map((b) => b.textContent.trim()),
      /* the chip carries a screen-reader "Time: " before the estimate */
      time: document.querySelector('.hero .chip-time')?.textContent.replace(/^Time:\s*/, '').trim(),
      width: document.documentElement.scrollWidth,
    };
  });
  const missing = await tab.evaluate(pageFontsLoaded);
  const st = await statusOf(tab);
  const home = page('index').meta;
  if (!m.topbar || m.topbar.top !== 0) die('capture: the site header is not at the top of the home page');
  if (!m.hero || !m.next || !m.buttons.length) die('capture: .hero, its buttons or the block after it is missing from docs/index.html');
  /* The phone shows the hero and the alt text describes it from content/, so
     every word in the hero must still match content/index.html's meta. */
  const shown = [m.kicker, m.h1, m.lede, m.time, ...m.ctas].join(' / ');
  const source = [home.eyebrow, home.title, home.lede, home.time, ...(home.cta || []).map((c) => c.text)].join(' / ');
  if (shown !== source) die(`capture: docs/ is stale (the hero says "${shown}", content/index.html says "${source}"). Run: node build.mjs`);
  if (missing.length) die(`capture: the home page rendered without ${missing.join(', ')} (is the network reachable? try NODE_USE_ENV_PROXY=1)`);
  if (m.width > PHONE.screenW) die(`capture: the home page is ${m.width}px wide at a ${PHONE.screenW}px viewport`);
  if (st.theme !== choice.theme) die(`capture: asked for the ${choice.theme} theme, the page shows ${st.theme}`);
  const cut = Math.round((m.hero.bottom + m.next.top) / 2);
  const lastButton = Math.max(...m.buttons.map((b) => b.bottom));
  if (!(cut > lastButton && cut > m.hero.bottom && cut < m.next.top)) die(`capture: no clean cut (hero ends ${m.hero.bottom}, buttons end ${lastButton}, next block starts ${m.next.top})`);
  const png = await tab.screenshot({ clip: { x: 0, y: 0, width: PHONE.screenW, height: cut }, animations: 'disabled' });
  await ctx.close();
  console.log(`✓ home page captured  ${PHONE.screenW}x${cut} css px at 3x, ${st.theme} theme (contrast with the ground: light ${choice.light.toFixed(1)}:1, dark ${choice.dark.toFixed(1)}:1), cut between the hero and the progress card`);
  return { uri: `data:image/png;base64,${png.toString('base64')}`, cut, theme: choice.theme, statusBg: st.themeColor || LIGHT['--theme-color'], statusInk: inkOn(st.themeColor || LIGHT['--theme-color']), domain: DOMAIN, title: st.title };
};

/* 04: history-of-indigo, live, at phone width, in its default theme. The
   cut is 22 css px under the byline icons, and must land above the buttons. */
const CUT_BELOW_ICONS = 22;
const captureIndigo = async (browser, url) => {
  const ctx = await browser.newContext({ viewport: { width: PHONE.screenW, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'light' });
  const tab = await ctx.newPage();
  await viaNode(tab);
  const res = await tab.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
  if (!res || !res.ok()) die(`capture: ${url} returned HTTP ${res?.status() ?? 'no response'}`);
  await tab.evaluate(() => document.fonts.ready);
  const m = await tab.evaluate(() => {
    const box = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; };
    return { nav: box('#main-nav'), icons: box('.byline-socials'), buttons: box('.hero-actions'), width: document.documentElement.scrollWidth };
  });
  const missing = await tab.evaluate(pageFontsLoaded);
  const st = await statusOf(tab);
  if (!m.nav || Math.abs(m.nav.top) > 0.5) die(`capture: ${url} has no header at the top`);
  if (!m.icons || !m.buttons) die(`capture: ${url} no longer has .byline-socials or .hero-actions`);
  if (missing.length) die(`capture: ${url} rendered without ${missing.join(', ')} (try NODE_USE_ENV_PROXY=1)`);
  if (m.width > PHONE.screenW) die(`capture: ${url} is ${m.width}px wide at a ${PHONE.screenW}px viewport`);
  const cut = Math.ceil(m.icons.bottom + CUT_BELOW_ICONS);
  if (cut >= m.buttons.top) die(`capture: the cut (${cut}) reaches the buttons (${m.buttons.top}) on ${url}`);
  const png = await tab.screenshot({ clip: { x: 0, y: 0, width: PHONE.screenW, height: cut }, animations: 'disabled' });
  await ctx.close();
  const bg = st.themeColor || '#000000';
  const theme = lumOf(hexRGB(bg)) < 0.2 ? 'dark' : 'light';
  console.log(`✓ ${url} captured  ${PHONE.screenW}x${cut} css px at 3x, ${theme} theme, cut ${CUT_BELOW_ICONS}px under the byline icons`);
  return { uri: `data:image/png;base64,${png.toString('base64')}`, cut, theme, statusBg: bg, statusInk: inkOn(bg), domain: new URL(url).host, title: st.title };
};

/* 05: both starters, live, as desktop windows. Each window must end in a
   gap: its bottom edge may cross no line of text, no button or input and
   no small image or icon. Both windows are shown at one size, so they need
   one shape, and a dense page (a sidebar list beside a paragraph) has few
   clean gaps at any one width. So each page is measured at several desktop
   widths, and the build takes the pair of clean cuts whose shapes agree to
   within WIN.tol: at the same width if it can (so both sites show at one
   scale), else at the closest widths, and then the taller window. */
const WIN = { widths: Array.from({ length: 11 }, (_, i) => 1024 + 40 * i), aspect: [1.45, 1.9], clear: 2, tol: 0.003 };
const cleanSpans = ({ W }) => {
  const out = [];
  const vis = (el) => { const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0; };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim() || !n.parentElement || !vis(n.parentElement)) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    for (const b of r.getClientRects()) if (b.width && b.right > 0 && b.left < W) out.push([b.top, b.bottom]);
  }
  /* and every small box: a button, a chip, a badge, an input, an icon or an
     image. A big panel (a hero, a map) may run past the window's edge. */
  for (const el of document.querySelectorAll('body *')) {
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height || b.height >= 160 || b.right <= 0 || b.left >= W || b.top > 1400 || !vis(el)) continue;
    const cs = getComputedStyle(el);
    const boxed = /^(BUTTON|INPUT|SELECT|TEXTAREA|IMG|SVG|VIDEO|CANVAS|svg)$/.test(el.tagName) ||
      !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) || cs.backgroundImage !== 'none' ||
      ['Top', 'Right', 'Bottom', 'Left'].some((k) => parseFloat(cs[`border${k}Width`]) > 0 && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs[`border${k}Color`]));
    if (boxed) out.push([b.top, b.bottom]);
  }
  return out;
};
const captureStarters = async (browser, urls) => {
  const tallest = Math.ceil(Math.max(...WIN.widths) / WIN.aspect[0]);
  const pages = [];
  for (const url of urls) {
    const ctx = await browser.newContext({ viewport: { width: WIN.widths[0], height: tallest + 40 }, deviceScaleFactor: 2, colorScheme: 'light' });
    const tab = await ctx.newPage();
    await viaNode(tab);
    const res = await tab.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
    if (!res || !res.ok()) die(`capture: ${url} returned HTTP ${res?.status() ?? 'no response'}`);
    await tab.evaluate(() => document.fonts.ready);
    const missing = await tab.evaluate(pageFontsLoaded);
    if (missing.length) die(`capture: ${url} rendered without ${missing.join(', ')} (try NODE_USE_ENV_PROXY=1)`);
    const clean = new Map();                       // width -> clean cut heights
    for (const width of WIN.widths) {
      await tab.setViewportSize({ width, height: tallest + 40 });
      await tab.waitForTimeout(350);
      if (await tab.evaluate(() => document.documentElement.scrollWidth) > width) continue;
      const spans = await tab.evaluate(cleanSpans, { W: width });
      const ys = [];
      for (let y = Math.ceil(width / WIN.aspect[1]); y <= Math.floor(width / WIN.aspect[0]); y++)
        if (spans.every(([t, b]) => y <= t - WIN.clear || y >= b + WIN.clear)) ys.push(y);
      clean.set(width, ys);
    }
    if (process.env.CARDS_DEBUG) console.log(`  ${url}\n${[...clean].map(([w, ys]) => `    ${w}: ${ys.length} clean cuts ${ys.length ? `${ys[0]}…${ys.at(-1)}` : ''}`).join('\n')}`);
    pages.push({ url, ctx, tab, clean });
  }
  let best = null;
  const [A, B] = pages;
  for (const [wa, ya] of A.clean) for (const [wb, yb] of B.clean) for (const y1 of ya) {
    const y2 = Math.round(wb * y1 / wa);
    if (!yb.includes(y2)) continue;
    const err = Math.abs(wa / y1 - wb / y2) / (wb / y2);
    if (err > WIN.tol) continue;
    const shape = wa / y1, gap = Math.abs(wa - wb);
    const better = !best || gap < best.gap || (gap === best.gap && (shape < best.shape - 1e-9 || (Math.abs(shape - best.shape) < 1e-9 && err < best.err)));
    if (better) best = { shape, err, gap, a: [wa, y1], b: [wb, y2] };
  }
  if (!best) die(`capture: no pair of clean cuts gives ${urls.join(' and ')} one window shape (widths ${WIN.widths.join(', ')})`);
  const shots = new Map();
  for (const [p, [width, cut]] of [[A, best.a], [B, best.b]]) {
    await p.tab.setViewportSize({ width, height: tallest + 40 });
    await p.tab.waitForTimeout(500);
    const png = await p.tab.screenshot({ clip: { x: 0, y: 0, width, height: cut }, animations: 'disabled' });
    shots.set(p.url, { uri: `data:image/png;base64,${png.toString('base64')}`, width, cut, shape: best.shape });
    await p.ctx.close();
    console.log(`✓ ${p.url} captured  ${width}x${cut} css px at 2x, cut clear of every line of text`);
  }
  console.log(`    one window shape for both: ${best.shape.toFixed(3)}:1, mismatch ${(best.err * 100).toFixed(2)}%`);
  return shots;
};

/* ================================================================
   PNG, without sharp: decode Chrome's screenshots, downsample 2x with
   lanczos3, encode the result. node:zlib does the compression.
   ================================================================ */
const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function decodePNG(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let off = 8, w, h, depth, type, lace; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), kind = buf.toString('latin1', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; lace = data[12]; }
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || (type !== 2 && type !== 6) || lace) throw new Error(`unsupported PNG: depth ${depth}, color type ${type}, interlace ${lace}`);
  const ch = type === 6 ? 4 : 3, stride = w * ch, raw = zlib.inflateSync(Buffer.concat(idat)), px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], s = y * (stride + 1) + 1, d = y * stride, u = d - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[d + x - ch] : 0, b = y ? px[u + x] : 0, c = x >= ch && y ? px[u + x - ch] : 0;
      let v = raw[s + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[d + x] = v & 255;
    }
  }
  return { w, h, ch, px };
}
function encodePNG({ w, h, ch, px }) {
  const stride = w * ch, raw = Buffer.alloc(h * (stride + 1)), rows = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  for (let y = 0; y < h; y++) {
    const d = y * stride, u = d - stride;
    let best = 0, bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const row = rows[f]; let score = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= ch ? px[d + x - ch] : 0, b = y ? px[u + x] : 0, c = x >= ch && y ? px[u + x - ch] : 0;
        let p = 0;
        if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
        else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        const v = (px[d + x] - p) & 255; row[x] = v; score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) { bestScore = score; best = f; }
    }
    raw[y * (stride + 1)] = best; rows[best].copy(raw, y * (stride + 1) + 1);
  }
  const chunk = (kind, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(kind, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(body)); return Buffer.concat([len, body, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = ch === 4 ? 6 : 2;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
/* Exactly half size with a lanczos3 kernel (a = 3, widened x2 for the
   reduction: 12 taps per axis), separable, in sRGB like sharp's resize. */
function halve({ w, h, ch, px }) {
  const sinc = (x) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
  const taps = []; for (let d = -5; d <= 6; d++) { const x = (d - 0.5) / 2; taps.push([d, Math.abs(x) < 3 ? sinc(x) * sinc(x / 3) : 0]); }
  const sum = taps.reduce((s, [, k]) => s + k, 0); for (const t of taps) t[1] /= sum;
  const W2 = w >> 1, H2 = h >> 1, tmp = new Float32Array(W2 * h * ch), out = new Uint8Array(W2 * H2 * ch);
  for (let y = 0; y < h; y++) for (let i = 0; i < W2; i++) for (let c = 0; c < ch; c++) {
    let v = 0; for (const [d, k] of taps) { const x = Math.min(w - 1, Math.max(0, 2 * i + d)); v += k * px[(y * w + x) * ch + c]; }
    tmp[(y * W2 + i) * ch + c] = v;
  }
  for (let j = 0; j < H2; j++) for (let i = 0; i < W2; i++) for (let c = 0; c < ch; c++) {
    let v = 0; for (const [d, k] of taps) { const y = Math.min(h - 1, Math.max(0, 2 * j + d)); v += k * tmp[(y * W2 + i) * ch + c]; }
    out[(j * W2 + i) * ch + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
  }
  return { w: W2, h: H2, ch, px: out };
}

/* ================================================================
   Render and verify
   ================================================================ */
const html = (c) => `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8">
<link rel="stylesheet" href="${esc(FONTS_HREF)}">
<style>${TOKENS}${BASE_CSS}${c.css}</style></head>
<body><div class="card">${c.body}</div></body></html>`;

/* Runs inside the page. Layout and loading problems; empty means sound. */
function audit({ W, H, SAFE_X, SAFE_Y }) {
  const out = [];
  const label = (el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${el.textContent.trim().slice(0, 40)}"`;
  const textEls = [...document.querySelectorAll('.card *')].filter((e) =>
    [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && getComputedStyle(e).visibility !== 'hidden');
  /* every face a line of text is set in must have loaded, in its weight and style */
  const faces = new Set(textEls.map((e) => { const cs = getComputedStyle(e); return `${cs.fontFamily.split(',')[0].replace(/["']/g, '').trim()}|${cs.fontWeight}|${cs.fontStyle}`; }));
  for (const key of faces) {
    const [family, weight, style] = key.split('|');
    const ok = [...document.fonts].some((f) => f.family.replace(/["']/g, '') === family && f.status === 'loaded' && f.style === style &&
      (String(f.weight).includes(' ') ? +String(f.weight).split(' ')[0] <= +weight && +weight <= +String(f.weight).split(' ')[1] : +f.weight === +weight));
    if (!ok) out.push(`font not loaded: ${family} ${weight} ${style}`);
  }
  for (const im of document.images) if (!im.complete || !im.naturalWidth) out.push(`image did not load: ${im.className}`);
  for (const el of textEls) {
    const cs = getComputedStyle(el);
    /* the crop-safe frame, measured on the glyphs themselves */
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      for (const b of r.getClientRects()) {
        if (b.left < SAFE_X - 0.5 || b.right > W - SAFE_X + 0.5 || b.top < SAFE_Y - 0.5 || b.bottom > H - SAFE_Y + 0.5)
          out.push(`outside the safe frame (${Math.round(b.left)},${Math.round(b.top)} to ${Math.round(b.right)},${Math.round(b.bottom)}): ${label(el)}`);
      }
    }
    /* text that runs past its box, whether it is clipped or spills (a
       height test would flag display type set under line-height 1) */
    if (cs.display !== 'inline' && el.scrollWidth > el.clientWidth + 1) out.push(`text overflows its box (${el.scrollWidth} in ${el.clientWidth}): ${label(el)}`);
  }
  /* nothing may leave the card, bar the phone's own parts */
  for (const el of document.querySelectorAll('.card *')) {
    if (el.closest('.phone')) continue;
    const r = el.getBoundingClientRect();
    if (r.width && (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5)) out.push(`leaves the card: ${label(el)}`);
  }
  /* the major blocks must not touch */
  const blocks = [...document.querySelectorAll('[data-block]')].map((e) => ({ e, r: e.getBoundingClientRect() }));
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
    if (blocks[i].e.contains(blocks[j].e) || blocks[j].e.contains(blocks[i].e)) continue;
    const a = blocks[i].r, b = blocks[j].r;
    if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) out.push(`blocks overlap: ${label(blocks[i].e)} / ${label(blocks[j].e)}`);
  }
  return out;
}

/* Runs inside the page: every run of text, with its color, size and boxes. */
function textRuns() {
  const runs = [];
  for (const el of document.querySelectorAll('.card *')) {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden') continue;
    let zoom = 1;
    for (let a = el; a; a = a.parentElement) zoom *= parseFloat(getComputedStyle(a).zoom) || 1;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      const m = cs.color.match(/[\d.]+/g).map(Number);
      runs.push({ text: n.textContent.trim().slice(0, 40), cls: [...el.classList].join('.') || el.tagName.toLowerCase(),
        color: [m[0], m[1], m[2], m.length > 3 ? m[3] : 1], px: parseFloat(cs.fontSize) * zoom, weight: +cs.fontWeight,
        rects: [...r.getClientRects()].filter((b) => b.width > 0 && b.height > 0).map((b) => ({ x: b.left, y: b.top, w: b.width, h: b.height })) });
    }
  }
  return runs;
}

/* WCAG AA against the pixels actually behind the text: the card is shot a
   second time with every glyph made transparent, and each line of text is
   measured against the lightest and the darkest pixel under its box. That
   covers the cover's gradient and glows, which a computed background color
   cannot. Type under 40 card px must reach 4.5:1; display type 3:1. */
const DISPLAY_PX = 40;
/* The smallest type a card may set, in card px (zoom included): 13 card px
   is about 4.5 css px in a 390 px feed, the floor for a caps label. Body
   copy is set at 21 px and up. */
const MIN_PX = 13;
const BARE_CSS = '.card, .card *{color:transparent !important;-webkit-text-fill-color:transparent !important;text-shadow:none !important;text-decoration-color:transparent !important}';
function pixelContrast(bare, runs) {
  const out = [];
  for (const r of runs) {
    let lo = null, hi = null, loL = 2, hiL = -1;
    for (const b of r.rects) {
      const x0 = Math.max(0, Math.floor(b.x * SCALE) + 1), x1 = Math.min(bare.w, Math.ceil((b.x + b.w) * SCALE) - 1);
      const y0 = Math.max(0, Math.floor(b.y * SCALE) + 1), y1 = Math.min(bare.h, Math.ceil((b.y + b.h) * SCALE) - 1);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * bare.w + x) * bare.ch, p = [bare.px[i], bare.px[i + 1], bare.px[i + 2]], L = lumOf(p);
        if (L < loL) { loL = L; lo = p; }
        if (L > hiL) { hiL = L; hi = p; }
      }
    }
    if (r.rects.length && r.px < MIN_PX - 0.01) out.push(`type ${r.px.toFixed(1)}px < ${MIN_PX} for .${r.cls} "${r.text}"`);
    if (!lo) continue;
    const need = r.px >= DISPLAY_PX ? 3 : 4.5;
    const worst = Math.min(...[lo, hi].map((bg) => ratio([0, 1, 2].map((k) => r.color[k] * r.color[3] + bg[k] * (1 - r.color[3])), bg)));
    if (worst < need) out.push(`contrast ${worst.toFixed(2)}:1 < ${need} for .${r.cls} "${r.text}"`);
    r.worst = worst;
  }
  return out;
}

/* No glyph may be drawn by anything but the site's three web fonts. Chrome
   is asked which fonts it actually used for every node. Inter and Bricolage
   Grotesque are also installed on some machines as system fonts; a glyph
   drawn from one of those is a fallback too, and fails. */
const fontReport = async (tab) => {
  const cdp = await tab.context().newCDPSession(tab);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '.card *' });
  const bad = new Map(), used = new Map();
  for (const nodeId of nodeIds) {
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId }).catch(() => ({ fonts: [] }));
    for (const f of fonts) {
      const ok = f.isCustomFont && FAMILIES.some((n) => f.familyName.startsWith(n));
      const map = ok ? used : bad, key = ok ? f.familyName : `${f.familyName}${f.isCustomFont ? '' : ' (system)'}`;
      map.set(key, (map.get(key) || 0) + f.glyphCount);
    }
  }
  await cdp.detach();
  return { problems: [...bad].map(([name, n]) => `${n} glyph(s) drawn by "${name}", not one of the site's web fonts`), used };
};

const ALT = new Map();
const render = async (browser, card) => {
  ALT.set(card.id, { file: card.file, alt: card.alt });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
  const tab = await ctx.newPage();
  await viaNode(tab);
  await tab.setContent(html(card), { waitUntil: 'networkidle', timeout: 90_000 });
  await tab.evaluate(() => document.fonts.ready);
  const layout = await tab.evaluate(audit, { W, H, SAFE_X, SAFE_Y });
  const fonts = await fontReport(tab);
  const runs = await tab.evaluate(textRuns);
  const big = decodePNG(await tab.screenshot({ clip: { x: 0, y: 0, width: W, height: H }, animations: 'disabled' }));
  await tab.addStyleTag({ content: BARE_CSS });
  const bare = decodePNG(await tab.screenshot({ clip: { x: 0, y: 0, width: W, height: H }, animations: 'disabled' }));
  await ctx.close();
  const contrast = pixelContrast(bare, runs);
  const problems = [...layout, ...fonts.problems, ...contrast];
  const small = halve(big);
  if (problems.length) {
    fs.writeFileSync(path.join(HERE, `${card.id}.failed.png`), encodePNG(small));
    die(`${card.file}\n    ${problems.join('\n    ')}\n  (the failed render is in ${card.id}.failed.png)`);
  }
  const out = path.join(HERE, card.file);
  fs.writeFileSync(out, encodePNG(small));
  fs.rmSync(path.join(HERE, `${card.id}.failed.png`), { force: true });
  const lowest = runs.filter((r) => r.worst).reduce((m, r) => (r.worst < m.worst ? r : m));
  const faces = [...fonts.used].map(([n, g]) => `${n} ${g}`).join(', ');
  console.log(`✓ ${card.file}  ${W}x${H}, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
  const smallest = runs.reduce((m, r) => (r.px < m.px ? r : m));
  console.log(`    fonts: ${faces} glyphs, no fallback · contrast: ${runs.length} text runs, lowest ${lowest.worst.toFixed(2)}:1 (.${lowest.cls}) · smallest type ${smallest.px.toFixed(1)}px (.${smallest.cls}) · safe frame, overflow, overlap: clean`);
};

/* ─── alt-text.md: one entry per slide, for the alt text Instagram takes
   per image under a post's accessibility settings. Generated with the cards. ─── */
const writeAlt = () => {
  const lines = ['# Alt text, one per slide', '',
    'Generated by `build-cards.mjs` with the cards, from the same sources, so the words match them.',
    'Paste each into its slide in the post\'s advanced settings, under Accessibility, before posting.', ''];
  for (const [i, id] of CARDS.entries()) {
    const a = ALT.get(id);
    lines.push(`## ${i + 1}. \`${a.file}\``, '', a.alt, '');
  }
  fs.writeFileSync(path.join(HERE, 'alt-text.md'), lines.join('\n'));
  console.log('✓ alt-text.md');
};

/* ─── check: the files on disk are the right size, opaque and not blank ─── */
const check = () => {
  let bad = 0;
  for (const id of CARDS) {
    const f = path.join(HERE, fileOf(id));
    if (!fs.existsSync(f)) { console.error(`✗ ${fileOf(id)} is missing`); bad++; continue; }
    let img;
    try { img = decodePNG(fs.readFileSync(f)); } catch (e) { console.error(`✗ ${fileOf(id)}: ${e.message}`); bad++; continue; }
    const problems = [];
    if (img.w !== W || img.h !== H) problems.push(`is ${img.w}x${img.h}, not ${W}x${H}`);
    const n = img.w * img.h, mean = [0, 0, 0], sq = [0, 0, 0];
    let translucent = 0;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) { const v = img.px[i * img.ch + c]; mean[c] += v; sq[c] += v * v; }
      if (img.ch === 4 && img.px[i * 4 + 3] !== 255) translucent++;
    }
    const spread = Math.max(...[0, 1, 2].map((c) => Math.sqrt(sq[c] / n - (mean[c] / n) ** 2)));
    if (spread < 12) problems.push(`looks blank (channel stdev ${spread.toFixed(1)})`);
    if (translucent) problems.push(`${translucent} pixels are not opaque`);
    if (problems.length) { bad++; console.error(`✗ ${fileOf(id)} ${problems.join('; ')}`); }
    else console.log(`✓ ${fileOf(id)}  ${img.w}x${img.h}, opaque, channel stdev ${spread.toFixed(0)}`);
  }
  if (bad) die(`${bad} card(s) failed`);
  console.log(`✓ all ${CARDS.length} cards present and sound`);
};

/* ─── proof: the carousel as the feed shows it, and the cover as the
   profile grid crops it to 3:4. A proof, not a deliverable: gitignored. ─── */
const proof = async (browser) => {
  for (const id of CARDS) if (!fs.existsSync(path.join(HERE, fileOf(id)))) die(`${fileOf(id)} not built yet`);
  const uri = (id) => `data:image/png;base64,${fs.readFileSync(path.join(HERE, fileOf(id))).toString('base64')}`;
  const tile = 390, tileH = Math.round(tile * H / W), gridW = 150, gridH = Math.round(gridW * 4 / 3);
  const tab = await browser.newPage({ viewport: { width: CARDS.length * (tile + 16) + gridW * 3 + 60, height: tileH + 90 }, deviceScaleFactor: 1 });
  await tab.setContent(`<!doctype html><style>
body{margin:0;background:#fff;font:13px/1.3 system-ui,sans-serif;color:#555;display:flex;gap:16px;padding:16px;align-items:flex-start}
figure{margin:0}img{display:block}figcaption{margin-top:6px}
.feed img{width:${tile}px;height:${tileH}px;outline:1px solid #ddd}
.grid{display:grid;grid-template-columns:repeat(3,${gridW}px);gap:2px}
.grid div{width:${gridW}px;height:${gridH}px;background:#eee;overflow:hidden}
.grid img{width:100%;height:100%;object-fit:cover}</style>
${CARDS.map((id, i) => `<figure class="feed"><img src="${uri(id)}"><figcaption>${i + 1}/${CARDS.length} in the feed, at a phone's width</figcaption></figure>`).join('')}
<figure><div class="grid"><div></div><div><img src="${uri(CARDS[0])}"></div><div></div></div><figcaption>the cover in the 3:4 profile grid</figcaption></figure>`);
  await tab.waitForTimeout(200);
  await tab.screenshot({ path: path.join(HERE, 'proof.png'), fullPage: true });
  await tab.close();
  console.log('✓ proof.png  the feed at 390 px and the profile-grid crop');
};

/* ─── the local server: scripts/serve.mjs on a free port, stopped on exit ─── */
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });
const startServer = async () => {
  if (!fs.existsSync(path.join(ROOT, 'docs', 'index.html'))) {
    console.log('… docs/ is missing: running node build.mjs');
    const b = spawnSync(process.execPath, ['build.mjs'], { cwd: ROOT, encoding: 'utf8' });
    if (b.status !== 0) die(`node build.mjs failed:\n${b.stdout}${b.stderr}`);
  }
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs'), String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const stop = () => { if (child.exitCode === null) child.kill(); };
  process.on('exit', stop);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('scripts/serve.mjs did not start within 10 s')), 10_000);
    child.stdout.on('data', (d) => { if (/Serving/.test(d)) { clearTimeout(t); res(); } });
    child.on('exit', (code) => { clearTimeout(t); rej(new Error(`scripts/serve.mjs exited with ${code}`)); });
  }).catch((e) => die(e.message));
  return { origin: `http://127.0.0.1:${port}`, stop };
};

/* ─── CLI ─── */
const args = process.argv.slice(2);
if (args[0] === 'check') { check(); process.exit(0); }
const { chromium } = loadPlaywright();
const browser = await chromium.launch();
let server = null;
cleanup = () => { server?.stop(); browser.close().catch(() => {}); };
try {
  if (args[0] === 'proof') { await proof(browser); }
  else {
    for (const a of args) if (!CARDS.includes(a)) die(`unknown card "${a}". Try: ${CARDS.join(', ')}, check, proof`);
    const want = args.length ? args : CARDS;
    const make = {
      '01-site': async () => { server = await startServer(); const s = await captureHome(browser, server.origin); server.stop(); server = null; return cover(s); },
      '02-steps': steps,
      '03-say': say,
      '04-one-prompt': async () => {
        const url = cardsIn(section('index', /<h2>What you'll end with<\/h2>/)).find((c) => /history-of-indigo/.test(c.href))?.href || die('index.html no longer links history-of-indigo');
        return onePrompt(await captureIndigo(browser, url));
      },
      '05-starters': async () => starters(await captureStarters(browser, cardsIn(section('starters', /<h2>The two starters<\/h2>/)).map((c) => c.href))),
    };
    for (const id of want) await render(browser, await make[id]());
    if (!args.length) { writeAlt(); check(); await proof(browser); }
    else console.log('  alt-text.md, check and proof.png are rewritten only by the full build: run it before posting.');
  }
} finally {
  server?.stop();
  await browser.close();
}
