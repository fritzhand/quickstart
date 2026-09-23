# CLAUDE.md — operating manual for the Quickstart guide

## What this repo is

A short, step-by-step beginner guide published on GitHub Pages at
**https://fritzhand.github.io/quickstart/**. It takes someone from zero to a published website:

1. Create a GitHub account.
2. Run an AI coding agent: **Claude Code** (from the Claude app on phone, browser or desktop, or
   inside VS Code), or **Codex** in VS Code.
3. Fork or copy a starter site (e.g. `fritzhand/history-of-tampa`, `fritzhand/startup-india-guide`)
   and make your own version.
4. Publish it with GitHub Pages.

**The one idea behind every page: you type or dictate what you want, and the agent does the work.**
Almost nothing is done by hand. A page leads with what to *say* to the agent. It shows manual clicks
only where the agent has no access: creating your GitHub account, installing VS Code and the agent
extension, signing in, approving a permission prompt, and **repository settings on github.com**. The
main example is **Settings → Pages → Deploy from a branch → `main`**, the canonical manual step on
both paths. On the VS Code path the GitHub CLI can do it as an optional shortcut. Raw git commands
appear only inside "What the agent runs for you" fold-outs, for the curious.

**The two starters, and how to frame them:**
- `fritzhand/history-of-tampa` is one long scrolling story. It is a way to **learn any history
  subject** by researching, sourcing and telling it. The subject can be a city or neighborhood, or a
  topic like `history-of-indigo`, an industry, a company or a movement.
- `fritzhand/startup-india-guide` is a **multi-page minisite with a sidebar**. Use it to organize any
  subject that needs several pages: a directory, handbook, resource guide or program catalog. The
  Florida ecosystem map was built from it, and so was this guide.

It is deliberately **simple**. It teaches only what a beginner needs to publish a site. Do not add
backends, frameworks, databases, APIs, model theory or anything else a beginner doesn't need.

## How the site is built

```
content/nav.json      sidebar groups + page order (the single source of navigation)
content/<slug>.html   one page each: a JSON meta comment + an HTML body fragment
site/                 the engine skin: tokens.css (all colors/fonts), site.css, site.js, favicon.svg
site.config.json      siteName, siteBase, pathPrefix, repo
build.mjs             content + site → docs/   (Node ≥ 18, zero npm dependencies, fails loudly)
docs/                 GENERATED — what GitHub Pages serves (main → /docs). Never hand-edit.
```

`node build.mjs` must exit 0 (see "What the build rejects" below), and `npm test` must pass. Commit
`docs/` after building.

`content/nav.json` holds `groups: [{ "label", "items": [{ "slug", "nav", "icon" }], "reference"? }]`; any
other key fails. A group labeled `Reference` (or with `"reference": true`) holds look-up pages, which don't
count toward progress.

Publishing: **Settings → Pages → Deploy from a branch → `main` → `/docs` → Save.** No Actions workflow.

## Page format (`content/<slug>.html`)

The first bytes are a meta comment holding strict JSON:

```html
<!--meta
{
  "title": "Create your GitHub account",
  "eyebrow": "Step 1 · GitHub",
  "lede": "One or two plain sentences: what this page gets done and why it matters.",
  "time": "5 min",
  "track": "all",
  "jump": { "text": "On the app path? Skip ahead to Step 3", "href": "repos.html" }
}
-->
<h2>…</h2>
…
```

- `title`, `eyebrow`, `lede` and `time` are required. `track` is `all` (the default), `app` or `vscode`,
  and shows a badge. `jump` is optional and renders a skip-ahead card above the prev/next links.
- Meta values are **plain text**: type `&`, `’` or `→` as characters. HTML tags and entities (`<code>`,
  `&amp;`) fail the build, because they would show literally.
- `track` drives the path logic. A page on one path gets Previous/Next links that skip the other path's
  pages, and the reader's "where" tab follows the path of the pages they open until they pick a tab.
  Progress counts shared pages plus the chosen path's pages, and never Reference pages.
- Only the home page (`index`) uses `"hero": true`, which renders the header as a large hero panel, and
  `"cta": [{ "text": "…", "href": "…", "primary": true }]`, which renders buttons under the lede.
- The body is an HTML fragment. Do not repeat the H1, because the engine renders title, eyebrow, lede and badges.
- Use `<h2>` for sections. The engine adds `id`s to headings that don't have one.
- Internal links are relative, e.g. `href="github-pages.html"` or `href="glossary.html#fork"`.
- External links are full `https://` URLs. The engine opens them in a new tab.

## Component vocabulary (the only markup content should need)

| Component | Markup |
|---|---|
| **Say this** prompt (the heart of every page) | `<pre class="say">Fork fritzhand/history-of-tampa into my account…</pre>` · optional `data-label="Fork a starter"` (a short name; it also names the Copy button for screen readers). The engine adds a label and a **Copy** button. Placeholders the reader hasn't filled are copied in `[brackets]`. |
| Personal placeholders (filled from the reader's saved details) | `<var data-k="user">your-username</var>` · keys: `user` (GitHub username), `repo` (their site's repo name), `name` (full name), `email` (GitHub noreply email) |
| Other placeholders | `<var>anything-else</var>` |
| Terminal command (manual fallback only) | `<pre class="cmd" data-shell="PowerShell"><code>Set-ExecutionPolicy …</code></pre>` gets a Copy button |
| Numbered steps | `<ol class="steps"><li><h3>Step title</h3><p>…</p></li>…</ol>` |
| Tabs (remembered across pages) | `<div class="tabs" data-group="os"><section data-tab="mac" data-label="Mac">…</section><section data-tab="windows" data-label="Windows">…</section></div>` · groups: `os` (mac/windows), `agent` (claude/codex), `where` (app/vscode) |
| Callouts | `<aside class="callout tip" data-title="Tip">…</aside>` · kinds: `tip`, `note`, `warn`, `manual` (a "Do this yourself" step no agent can do), `check` ("Check it worked") |
| Fold-out | `<details class="more"><summary>What the agent runs for you</summary>…</details>` |
| Troubleshooting item | `<details class="fix"><summary>Symptom in the reader's words</summary>…</details>` |
| UI label / click path | `<span class="ui">Settings</span> → <span class="ui">Pages</span>` |
| Keys | `<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd>` |
| Checklist (reader can tick, remembered) | `<ul class="checklist"><li>…</li></ul>` |
| Card grid | `<div class="cards"><a class="card" href="x.html"><span class="card-kicker">Kicker</span><strong>Title</strong><span>One line.</span></a>…</div>` |
| Table | `<div class="table-wrap"><table>…</table></div>` |
| Personalize form | `<div data-personalize></div>` (renders the "Your details" form) |
| Progress summary | `<div data-progress></div>` (x of N pages done on the reader's path and a "continue" link) |
| Path choice on a link | `<a class="card" href="install-vscode.html" data-set-where="vscode">…</a>` · `app` or `vscode`; clicking it records the reader's path, as a tab click would |
| Diagram | `<figure class="diagram"><svg class="dg" …>…</svg><figcaption>…</figcaption></figure>`, described below |

## Diagrams: our own inline SVG, only where a picture explains a concept

- Put the SVG inline in the page so it themes with light and dark mode. **Never hard-code a color.**
  Use only these classes, which site.css maps to theme tokens:
  - boxes: `dg-box` (neutral), `dg-box-primary`, `dg-box-accent`, `dg-box-soft`, `dg-box-dashed`
  - connectors: `dg-line`, `dg-line-accent`, `dg-line-dashed`
  - arrowheads: `dg-arrowhead`, `dg-arrowhead-accent`, used inside a `<marker>`
  - text: `dg-text` (15px body), `dg-text-sm` (13px muted), `dg-text-strong`, `dg-label` (12px caps, accent), `dg-text-on` (text on a filled shape)
  - fills: `dg-fill-primary`, `dg-fill-accent`, `dg-fill-soft`
- `dg-text-on` is white. Use it only on text that sits on `dg-box-primary`, `dg-fill-primary` or
  `dg-fill-accent`. On any other shape use `dg-text`, `dg-text-strong` or `dg-text-sm`.
- **Design for a phone first.** On a phone the figure runs edge to edge, about 378 px wide on a 390 px
  screen. On a desktop it renders at 1.25 × its viewBox width. So:
  - `viewBox` width **340–360** (the build warns above 400), flowing top to bottom.
  - Text ≥ 13 units (`dg-text` 15, `dg-text-sm` 13). Only `dg-label` is 12. That keeps rendered text at
    12 px or more.
  - At most 2 boxes side by side, and no text line longer than about 150 units (roughly 20 characters at
    15 units) inside a side-by-side box. Wrap with a second `<text>` line instead.
- Always include `role="img"`, a `<title>` and a `<desc>`, with `aria-labelledby` pointing to both.
  Prefix every `id` (title, desc, marker) with the page slug so ids stay unique.
- Do not reuse infographics from other repos. Draw simple, labeled boxes and arrows.

## What the build rejects

The build lists every problem, exits non-zero and leaves `docs/` untouched. It fails on:

- **Structure:** a nav slug without a content file, or the reverse (prefix a file with `_` to keep a
  draft); an unknown nav key or icon; a duplicate slug.
- **Meta:** invalid JSON, an unknown key, a missing required field, an unknown `track`, a bad `jump` or
  `cta`, or HTML or entities in a meta value.
- **Markup:** `<h1>`, `<script>`, `<style>`; an unknown element (write `<var>your-username</var>`, not
  `<your-username>`); an unclosed or stray tag (a `<div>`, `<ul>` or `<pre>` inside `<p>` ends the
  paragraph early); a duplicate id, or an id that is `main` or starts with `qs-`; a color in a `style`
  attribute; a component class on the wrong element; anything but `a.card` inside `.cards`; a
  `.table-wrap` without a table; a malformed tab set; a callout without exactly one kind; a `<details>`
  that doesn't start with `<summary>`; an unknown or empty `<var data-k>`; an empty `pre.say`; a bad
  `data-set-where`; a non-`https` `<img>` or one without `alt`.
- **Links:** an internal link that isn't a flat `page.html` or `page.html#id`, or whose page or id doesn't
  exist; `href="#"`; an `http://` link (allowed only for localhost inside `<pre>`/`<code>`); any scheme
  but `https:` and `mailto:`.
- **Diagrams:** a missing `role="img"`, `<title>`, `<desc>`, `aria-labelledby` or `viewBox`; an unknown
  `dg-*` class; a color attribute; `dg-text-on` in a diagram with no filled shape. It **warns** on a
  viewBox wider than 400 and on a missing `<figcaption>`.

## Tone and truth

- Plain American English, second person, short sentences. Write for someone who has never opened a
  terminal. No marketing language and no emoji.
- **Never invent a fact:** no invented command, menu label, URL, price or product behavior. Verify
  against the official docs (code.claude.com, docs.github.com, code.visualstudio.com,
  learn.microsoft.com, learn.chatgpt.com). If a UI label can't be verified, describe the control
  generically ("the repository picker under the message box").
- Every prompt must be something a reader can paste as-is after filling the placeholders.
- Lead with "Say this". Put a manual fallback ("If the agent can't, click…") after it, never before.
- Keep pages short. Remove a sentence if the reader can succeed without it.
