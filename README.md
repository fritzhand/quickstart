# Quickstart

A short, step-by-step guide to publishing your first website by telling an AI agent what you want.
You type or dictate; the agent (Claude Code or Codex) does the work. You click things yourself only
where the agent has no access, such as signing in or switching on GitHub Pages in your repo's settings.

**Live guide:** https://fritzhand.github.io/quickstart/

## The five steps

1. **GitHub.** Create a free GitHub account.
2. **Set up your agent.** Either the app path (Claude Code at claude.ai/code in a browser, with
   nothing to install, or in the Claude mobile or desktop app) or the VS Code path (VS Code with the
   Claude Code or Codex extension).
3. **Just enough Git.** Repos, forks, commits, pushes and the `main` branch, mostly done by prompt.
4. **Make it yours.** Pick a starter and have the agent rewrite it:
   [`fritzhand/history-of-tampa`](https://github.com/fritzhand/history-of-tampa), one long scrolling
   story, to research and tell any history (a city, a material like indigo, an industry, a company, a
   movement), or [`fritzhand/startup-india-guide`](https://github.com/fritzhand/startup-india-guide),
   a multi-page minisite with a sidebar, for any subject (a directory, handbook, resource guide or
   program catalog).
5. **Publish.** Switch on GitHub Pages yourself, once, in the repo's **Settings → Pages**, because the
   agent can't change repo settings. Your site goes live at `https://your-username.github.io/your-repo/`.

## How it's built

A static site with a zero-dependency build (Node 18 or later).

```
content/nav.json      sidebar groups and page order (the single source of navigation)
content/<slug>.html   one page each: a JSON meta comment, then an HTML body fragment
site/                 the skin: tokens.css (all colors and fonts), site.css, site.js, favicon.svg
site.config.json      siteName, siteTagline, siteBase, pathPrefix, repo, author
build.mjs             content + site → docs/   (validates everything, fails loudly)
docs/                 GENERATED: what GitHub Pages serves. Never edit it by hand.
```

`node build.mjs` must exit 0. It checks that `nav.json` and the content files match one to one,
that every page has its required meta fields, that every internal link and anchor resolves, that
external links use `https://`, and that diagrams use only the theme classes.

## Add or edit a page

1. Add the page's slug to `content/nav.json`, in the group and position you want.
2. Create `content/<slug>.html`. Its first bytes are a meta comment holding strict JSON:

   ```html
   <!--meta
   {
     "title": "Turn on GitHub Pages",
     "eyebrow": "Step 5 · Publish",
     "lede": "One or two plain sentences: what this page gets done.",
     "time": "10 min",
     "track": "all"
   }
   -->
   <h2>First section</h2>
   <pre class="say">Commit and push to main.</pre>
   ```

3. Build the body from the components: `pre.say` prompts, numbered steps, tabs, callouts,
   fold-outs, troubleshooting items, cards and inline SVG diagrams. [CLAUDE.md](./CLAUDE.md) lists
   the markup for each one, the diagram rules and the tone rules. An agent working in this repo
   reads that file first.
4. Run `node build.mjs`, fix anything it reports, and commit `docs/` with your change.

## Run it locally

```bash
npm run dev     # builds, then serves docs/ at http://localhost:8000/
npm test        # build checks (node --test)
```

There is nothing to install: no `npm install` step.

## Publish

On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch:
`main`, folder `/docs` → Save.** There is no Actions workflow to maintain. Every push to `main`
that includes a rebuilt `docs/` updates the live site within about 10 minutes.

## License

[MIT](./LICENSE). Copyright (c) 2026 Jeremy Fritzhand.
