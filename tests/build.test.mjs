/* ============================================================
   tests/build.test.mjs — node:test checks for build.mjs.
   Every test builds in a throwaway copy of the repo (build.mjs, site/,
   content/, site.config.json), so the real docs/ is never touched.
   Run: npm test   (node --test tests/*.test.mjs)
   ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NAV = JSON.parse(fs.readFileSync(path.join(REPO, "content", "nav.json"), "utf8"));
const SLUGS = NAV.groups.flatMap((g) => g.items.map((i) => i.slug));
const CONFIG = JSON.parse(fs.readFileSync(path.join(REPO, "site.config.json"), "utf8"));

function copyRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qs-build-"));
  for (const f of ["build.mjs", "site.config.json"]) fs.copyFileSync(path.join(REPO, f), path.join(dir, f));
  for (const d of ["site", "content"]) fs.cpSync(path.join(REPO, d), path.join(dir, d), { recursive: true });
  return dir;
}
const build = (dir) => spawnSync(process.execPath, ["build.mjs"], { cwd: dir, encoding: "utf8" });
const read = (dir, f) => fs.readFileSync(path.join(dir, f), "utf8");
const write = (dir, f, s) => fs.writeFileSync(path.join(dir, f), s);
const cleanup = (dir) => fs.rmSync(dir, { recursive: true, force: true });

/* a page other than index to poke at */
const PAGE = SLUGS.find((s) => s !== "index");
const appendTo = (slug, html) => (dir) => write(dir, `content/${slug}.html`, `${read(dir, `content/${slug}.html`)}\n${html}\n`);
function editMeta(slug, fn) {
  return (dir) => {
    const src = read(dir, `content/${slug}.html`);
    const m = src.match(/^\s*<!--meta([\s\S]*?)-->/);
    const meta = JSON.parse(m[1]);
    fn(meta);
    write(dir, `content/${slug}.html`, `<!--meta\n${JSON.stringify(meta, null, 2)}\n-->${src.slice(m[0].length)}`);
  };
}

/* Every internal href/src in the built HTML must point at a real file and a real id. */
function brokenLinks(docs) {
  const files = fs.readdirSync(docs).filter((f) => f.endsWith(".html") && f !== "404.html");
  const idsOf = new Map(files.map((f) => [f, new Set([...read(docs, f).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))]));
  const broken = [];
  for (const f of files) {
    const html = read(docs, f);
    for (const [, attr, url] of html.matchAll(/\s(href|src)="([^"]*)"/g)) {
      if (/^(https?:|mailto:|data:)/.test(url)) continue;
      const [p, frag] = url.split("#");
      const target = p ? p : f;
      if (!fs.existsSync(path.join(docs, target))) { broken.push(`${f}: ${attr}="${url}"`); continue; }
      if (frag && target.endsWith(".html") && !idsOf.get(target)?.has(decodeURIComponent(frag))) broken.push(`${f}: ${attr}="${url}" (no such id)`);
    }
  }
  return broken;
}

test("the real content builds, and every page, link and index entry is there", () => {
  const dir = copyRepo();
  try {
    const r = build(dir);
    assert.equal(r.status, 0, `build failed:\n${r.stderr}${r.stdout}`);
    assert.match(r.stdout, new RegExp(`✓ built ${SLUGS.length} pages → docs/`));
    const docs = path.join(dir, "docs");
    for (const s of SLUGS) assert.ok(fs.existsSync(path.join(docs, `${s}.html`)), `missing docs/${s}.html`);
    for (const f of ["404.html", "sitemap.xml", "robots.txt", ".nojekyll", "assets/tokens.css", "assets/site.css", "assets/site.js", "assets/favicon.svg", "assets/search-index.json"]) {
      assert.ok(fs.existsSync(path.join(docs, f)), `missing docs/${f}`);
    }
    assert.deepEqual(brokenLinks(docs), []);

    const index = JSON.parse(read(docs, "assets/search-index.json"));
    assert.equal(index.length, SLUGS.length, "one search entry per page");
    assert.deepEqual(index.map((e) => e.u).sort(), SLUGS.map((s) => `${s}.html`).sort());
    for (const e of index) assert.ok(e.t && e.d && Array.isArray(e.s), `incomplete index entry for ${e.u}`);

    const sitemap = read(docs, "sitemap.xml");
    assert.equal((sitemap.match(/<loc>/g) || []).length, SLUGS.length);
    assert.ok(sitemap.includes(`<loc>${CONFIG.siteBase}</loc>`), "index maps to siteBase");

    const nf = read(docs, "404.html");
    const rel = [...nf.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|mailto:|#|data:)/.test(u));
    assert.ok(rel.length > 0);
    for (const u of rel) assert.ok(u.startsWith(CONFIG.pathPrefix), `404.html link not absolute: ${u}`);

    for (const s of SLUGS) {
      const html = read(docs, `${s}.html`);
      assert.match(html, /<title>[^<]+ · /, `${s}: title`);
      assert.match(html, /<link rel="canonical" href="https:\/\//, `${s}: canonical`);
      assert.match(html, /aria-current="page"/, `${s}: active nav item`);
      assert.doesNotMatch(html.split('<div class="prose">')[1] || "", /<h1[\s>]/, `${s}: content must not add an <h1>`);
    }
  } finally { cleanup(dir); }
});

test("the engine renders every component in the vocabulary", () => {
  const dir = copyRepo();
  try {
    write(dir, `content/${PAGE}.html`, `<!--meta
{ "title": "Fixture", "eyebrow": "Test", "lede": "Every component.", "time": "1 min", "track": "vscode",
  "jump": { "text": "Skip", "href": "index.html" } }
-->
<h2>Say</h2>
<pre class="say" data-label="Say this in VS Code">
  Clone <var data-k="user">your-username</var>/<var data-k="repo">my-site</var> &amp; open it.
  Second line with <var>anything</var>.
</pre>
<pre class="cmd" data-shell="PowerShell"><code>
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
</code></pre>
<ol class="steps"><li><h3>One</h3><p>a</p></li><li><h3>Two</h3><p>b</p></li></ol>
<div class="tabs" data-group="os"><section data-tab="mac" data-label="Mac"><p>m</p></section><section data-tab="windows" data-label="Windows"><p>w</p></section></div>
<aside class="callout tip" data-title="Nice"><p>t</p></aside>
<aside class="callout manual"><p>m</p></aside>
<details class="more"><summary>What the agent runs for you</summary><pre class="cmd"><code>git push <a href="http://localhost:8000/">http://localhost:8000/</a></code></pre></details>
<details class="fix"><summary>It broke</summary><p>fix</p></details>
<p><span class="ui">Settings</span> → <kbd>Ctrl</kbd> <a href="https://docs.github.com/">docs</a> <a href="#say">up</a></p>
<ul class="checklist"><li>one</li><li>two</li></ul>
<div class="cards"><a class="card" href="index.html"><span class="card-kicker">K</span><strong>T</strong><span>L</span></a></div>
<div class="table-wrap"><table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table></div>
<div data-personalize></div>
<div data-progress></div>
<figure class="diagram"><svg class="dg" viewBox="0 0 320 120" role="img" aria-labelledby="fx-t fx-d"><title id="fx-t">T</title><desc id="fx-d">D</desc>
<defs><marker id="fx-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path class="dg-arrowhead" d="M0 0 10 5 0 10z"/></marker></defs>
<rect class="dg-box-primary" x="10" y="10" width="120" height="40" rx="8"/><text class="dg-text dg-text-on" x="20" y="35">Hi</text>
<path class="dg-line" d="M130 30h60" marker-end="url(#fx-a)"/></svg><figcaption>Cap</figcaption></figure>
`);
    const r = build(dir);
    assert.equal(r.status, 0, r.stderr);
    const html = read(dir, `docs/${PAGE}.html`);
    for (const needle of [
      'class="say-box"', "Say this in VS Code", 'class="copy-btn"', 'class="say-foot"', 'class="cmd-box"', "PowerShell",
      'class="tab-list"', 'data-tab="windows"', 'class="tab-title"', 'class="callout-head"', ">Nice<", ">Do this yourself<",
      'class="sum-chev"', 'class="ck-input"', 'class="card-go"', 'role="region"', 'data-pz-form', 'data-progress-card',
      'class="chip chip-track track-vscode"', 'class="jump-card"', 'class="h-anchor"', 'target="_blank" rel="noopener"', 'class="ext-ic"',
      'id="say"', 'data-done-toggle', 'class="pagenav"',
    ]) assert.ok(html.includes(needle), `missing ${needle}`);
    /* <pre> bodies are dedented and trimmed */
    assert.match(html, /<pre class="say" data-label="Say this in VS Code">Clone <var/);
    assert.match(html, /<code>Set-ExecutionPolicy -Scope CurrentUser RemoteSigned<\/code>/);
    /* the search index splits text by heading */
    const entry = JSON.parse(read(dir, "docs/assets/search-index.json")).find((e) => e.u === `${PAGE}.html`);
    assert.ok(entry.s.some(([id, h]) => id === "say" && h === "Say"));
  } finally { cleanup(dir); }
});

test("underscore drafts are ignored and http://localhost is allowed inside code", () => {
  const dir = copyRepo();
  try {
    write(dir, "content/_draft.html", "not even meta");
    appendTo(PAGE, `<pre class="cmd"><code>open <a href="http://localhost:8000/">http://localhost:8000/</a></code></pre>`)(dir);
    const r = build(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!fs.existsSync(path.join(dir, "docs", "_draft.html")));
  } finally { cleanup(dir); }
});

test("progress, Previous/Next and the where tab follow the reader's path", () => {
  const dir = copyRepo();
  try {
    const r = build(dir);
    assert.equal(r.status, 0, r.stderr);
    const trackOf = (slug) => JSON.parse(read(dir, `content/${slug}.html`).match(/^\s*<!--meta([\s\S]*?)-->/)[1]).track || "all";
    const refSlugs = new Set(NAV.groups.filter((g) => g.reference ?? /^reference$/i.test(g.label)).flatMap((g) => g.items.map((i) => i.slug)));
    const html = read(dir, "docs/index.html");
    /* every sidebar link carries its page's track; Reference links are marked */
    for (const s of SLUGS) {
      const a = html.match(new RegExp(`<a class="nav-link"[^>]*data-slug="${s}"[^>]*>`))[0];
      assert.ok(a.includes(`data-track="${trackOf(s)}"`), `${s}: nav link track`);
      assert.equal(a.includes('data-ref="1"'), refSlugs.has(s), `${s}: data-ref`);
    }
    /* the static total is the default (app) path, without Reference pages */
    const n = SLUGS.filter((s) => !refSlugs.has(s) && ["all", "app"].includes(trackOf(s))).length;
    assert.match(html, new RegExp(`<span data-p-total>${n}</span>`));
    /* a page on one path: <html data-track>, and Next skips the other path's pages */
    for (const [i, s] of SLUGS.entries()) {
      const t = trackOf(s);
      if (t === "all") continue;
      const page = read(dir, `docs/${s}.html`);
      assert.match(page, new RegExp(`<html[^>]*data-track="${t}"`), `${s}: html data-track`);
      const next = SLUGS.slice(i + 1).find((x) => ["all", t].includes(trackOf(x)));
      if (next) assert.match(page, new RegExp(`<a class="next" href="${next}\\.html"`), `${s}: Next should be ${next}`);
    }
  } finally { cleanup(dir); }
});

test("long pages get an On this page list; numbered steps fill in when there are few h2s", () => {
  const dir = copyRepo();
  try {
    write(dir, `content/${PAGE}.html`, `<!--meta
{ "title": "Fixture", "eyebrow": "Test", "lede": "Steps.", "time": "1 min" }
-->
<p>Intro.</p>
<ol class="steps"><li><h3>Fork it</h3><p>a</p></li><li><h3>Clone it</h3><p>b</p></li><li><h3>Edit it</h3><p>c</p></li><li><h3>Push it</h3><p>d</p></li></ol>
<h2>If it goes wrong</h2><p>e</p>
<pre class="say">Fork fritzhand/history-of-tampa into my account.</pre>
<pre class="say" data-label="Push">Commit and push to main.</pre>
`);
    const r = build(dir);
    assert.equal(r.status, 0, r.stderr);
    const html = read(dir, `docs/${PAGE}.html`);
    assert.match(html, /<aside class="toc"/);
    assert.match(html, /<details class="toc-mobile">/);
    assert.match(html, /<li class="toc-sub"><a href="#fork-it">1\. Fork it<\/a><\/li>/);
    assert.match(html, /<li><a href="#if-it-goes-wrong">If it goes wrong<\/a><\/li>/);
    /* each Copy button has its own accessible name */
    assert.ok(html.includes('aria-label="Copy prompt: Fork fritzhand/history-of-tampa into my account."'));
    assert.ok(html.includes('aria-label="Copy prompt: Push"'));
  } finally { cleanup(dir); }
});

const BROKEN = [
  ["a broken internal link", appendTo(PAGE, `<p><a href="does-not-exist.html">x</a></p>`), "does-not-exist.html"],
  ["a broken anchor", appendTo(PAGE, `<p><a href="index.html#no-such-anchor">x</a></p>`), "no-such-anchor"],
  ["an http:// link", appendTo(PAGE, `<p><a href="http://example.com/">x</a></p>`), "insecure link"],
  ["an unknown placeholder key", appendTo(PAGE, `<p><var data-k="zip">x</var></p>`), `data-k="zip"`],
  ["a duplicate id", appendTo(PAGE, `<p id="twice">a</p><p id="twice">b</p>`), `duplicate id "twice"`],
  ["an unknown element (placeholder written as a tag)", appendTo(PAGE, `<p>github.com/<your-username></p>`), "unknown element <your-username>"],
  ["an <h1> in the body", appendTo(PAGE, `<h1>Again</h1>`), "<h1> is not allowed"],
  ["a block element inside <p>", appendTo(PAGE, `<p>x <div>y</div></p>`), "stray closing tag </p>"],
  ["a callout without a kind", appendTo(PAGE, `<aside class="callout"><p>x</p></aside>`), "callout needs exactly one kind"],
  ["a component class on the wrong element", appendTo(PAGE, `<div class="say">x</div>`), `class="say" belongs on <pre>`],
  ["an unknown tab group", appendTo(PAGE, `<div class="tabs" data-group="browser"><section data-tab="a" data-label="A"></section></div>`), `unknown tab group "browser"`],
  ["a hard-coded diagram color", appendTo(PAGE, `<figure class="diagram"><svg class="dg" viewBox="0 0 10 10" role="img" aria-labelledby="bt bd"><title id="bt">t</title><desc id="bd">d</desc><rect fill="#ff0000" width="5" height="5"/></svg></figure>`), "hard-coded color"],
  ["a missing meta field", editMeta(PAGE, (m) => { delete m.time; }), `meta "time" is required`],
  ["an unknown track", editMeta(PAGE, (m) => { m.track = "phone"; }), "unknown track"],
  ["invalid meta JSON", (dir) => write(dir, `content/${PAGE}.html`, read(dir, `content/${PAGE}.html`).replace(/^\s*<!--meta\s*\{/, "<!--meta\n{,")), "invalid meta JSON"],
  ["a content file that is not in nav.json", (dir) => write(dir, "content/orphan-page.html", `<!--meta {"title":"a","eyebrow":"b","lede":"c","time":"1 min"} --><p>x</p>`), "orphan-page.html"],
  ["a nav slug with no content file", (dir) => fs.rmSync(path.join(dir, `content/${PAGE}.html`)), `content/${PAGE}.html does not exist`],
  ["white diagram text with no filled shape", appendTo(PAGE, `<figure class="diagram"><svg class="dg" viewBox="0 0 10 10" role="img" aria-labelledby="wt wd"><title id="wt">t</title><desc id="wd">d</desc><rect class="dg-box" width="5" height="5"/><text class="dg-text dg-text-on" x="1" y="4">x</text></svg><figcaption>c</figcaption></figure>`), "dg-text-on is white"],
  ["HTML in a meta field", editMeta(PAGE, (m) => { m.lede = "Run <code>git</code> first."; }), "is plain text"],
  ["an entity in a meta field", editMeta(PAGE, (m) => { m.title = "Fork &amp; clone"; }), "is plain text"],
  ["an invalid data-set-where", appendTo(PAGE, `<p><a href="index.html" data-set-where="phone">x</a></p>`), `data-set-where="phone"`],
  ["an empty Say this box", appendTo(PAGE, `<pre class="say">  </pre>`), `empty <pre class="say">`],
  ["an unknown nav key", (dir) => { const n = JSON.parse(read(dir, "content/nav.json")); n.groups[0].items[0].track = "app"; write(dir, "content/nav.json", JSON.stringify(n)); }, `unknown key "track"`],
  ["an unknown nav icon", (dir) => { const n = JSON.parse(read(dir, "content/nav.json")); n.groups[0].items[0].icon = "no-such-icon"; write(dir, "content/nav.json", JSON.stringify(n)); }, "unknown icon"],
];

for (const [name, mutate, expected] of BROKEN) {
  test(`fails loudly on ${name}`, () => {
    const dir = copyRepo();
    try {
      mutate(dir);
      const r = build(dir);
      assert.notEqual(r.status, 0, `expected the build to fail on ${name}`);
      assert.ok(r.stderr.includes(expected), `stderr should mention ${JSON.stringify(expected)}:\n${r.stderr}`);
      assert.ok(!fs.existsSync(path.join(dir, "docs")), "a failed build must not write docs/");
    } finally { cleanup(dir); }
  });
}
