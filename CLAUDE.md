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

`node build.mjs` must exit 0. It validates that nav.json and content files match one to one, that the
required meta fields are present, that every internal link resolves, that external links are
`https://`, and that `<var data-k>` keys are known. Commit `docs/` after building.

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
- Only the home page (`index`) uses `"hero": true`, which renders the header as a large hero panel, and
  `"cta": [{ "text": "…", "href": "…", "primary": true }]`, which renders buttons under the lede.
- The body is an HTML fragment. Do not repeat the H1, because the engine renders title, eyebrow, lede and badges.
- Use `<h2>` for sections. The engine adds `id`s to headings that don't have one.
- Internal links are relative, e.g. `href="github-pages.html"` or `href="glossary.html#fork"`.
- External links are full `https://` URLs. The engine opens them in a new tab.

## Component vocabulary (the only markup content should need)

| Component | Markup |
|---|---|
| **Say this** prompt (the heart of every page) | `<pre class="say">Fork fritzhand/history-of-tampa into my account…</pre>` · optional `data-label="Say this in the Claude app"`. The engine adds a label and a **Copy** button. |
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
| Progress summary | `<div data-progress></div>` (x of N steps done and a "continue" link, from the reader's ticks) |
| Diagram | `<figure class="diagram"><svg class="dg" …>…</svg><figcaption>…</figcaption></figure>`, described below |

## Diagrams: our own inline SVG, only where a picture explains a concept

- Put the SVG inline in the page so it themes with light and dark mode. **Never hard-code a color.**
  Use only these classes, which site.css maps to theme tokens:
  - boxes: `dg-box` (neutral), `dg-box-primary`, `dg-box-accent`, `dg-box-soft`, `dg-box-dashed`
  - connectors: `dg-line`, `dg-line-accent`, `dg-line-dashed`
  - arrowheads: `dg-arrowhead`, `dg-arrowhead-accent`, used inside a `<marker>`
  - text: `dg-text` (15px body), `dg-text-sm` (13px muted), `dg-text-strong`, `dg-label` (12px caps, accent), `dg-text-on` (text on a filled shape)
  - fills: `dg-fill-primary`, `dg-fill-accent`, `dg-fill-soft`
- **Design for a phone first:** `viewBox` width ≤ 480, flow top to bottom, text ≥ 13 units, no more than 3 boxes side by side.
- Always include `role="img"`, a `<title>` and a `<desc>`, with `aria-labelledby` pointing to both.
  Prefix every `id` (title, desc, marker) with the page slug so ids stay unique.
- Do not reuse infographics from other repos. Draw simple, labeled boxes and arrows.

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
