# The post copy

The five cards make one carousel, in order: `01-site`, `02-steps`, `03-say`, `04-one-prompt`,
`05-starters`. Paste the alt text from [`alt-text.md`](./alt-text.md) into each slide (in the
post's advanced settings, under Accessibility) before sharing. The cards carry the headlines and
the site's own sentences; the caption says what the guide is and who it's for.

Every claim below is one the guide makes. The table at the end says where. If the site changes,
rebuild the cards and check the caption against `alt-text.md`, which a full build (no card ids)
regenerates.

---

## Caption

> Quickstart is up: a step-by-step guide to publishing your first website by telling an AI agent
> what you want.
>
> You type or say what you want. The agent does the work. You check it.
>
> There are five steps: create a GitHub account, set up your agent, learn just enough Git, make a
> starter site your own, and publish it with GitHub Pages. Step 2 is the only fork in the road.
> The app path runs in a browser with nothing to install, or in the Claude app on your phone. The
> VS Code path runs on your computer. Both lead to the same published site.
>
> You don't start from a blank page. history-of-tampa is one long scrolling story, for learning
> any history. startup-india-guide is a multi-page minisite with a sidebar, for organizing any
> subject. history-of-indigo was built from a single message, typos and all, and the guide shows
> that message and how to use it for your own subject.
>
> You need a free GitHub account and a paid AI plan: Claude Pro or higher for Claude Code, or
> ChatGPT Plus or higher for Codex. Plan on about 1–2 hours.
>
> Link in bio: fritzhand.github.io/quickstart

**Hashtags.** Keep it to a handful:

`#claudecode #codex #githubpages #aiagents #firstwebsite`

---

## Short version, for a Story or a repost

> Publish your first website by telling an AI agent what you want. Five steps, about 1–2 hours,
> from your phone or your computer. fritzhand.github.io/quickstart

---

## Where the caption's claims come from

| In the caption | On the site |
|---|---|
| A step-by-step guide; publishing your first website by telling an AI agent what you want | The home page's eyebrow and lede; the repo README's first line |
| You type or say what you want. The agent does the work. You check it. | The home page, *The one rule* (card 03) |
| The five steps, and publishing with GitHub Pages | `nav.json` and the home page's step cards (card 02) |
| Step 2 is the only fork in the road; both lead to the same published site | The home page, *The five steps* (card 02 draws the fork) |
| The app path runs in a browser with nothing to install, or in the Claude app on your phone; the VS Code path runs on your computer | The lede of *App or VS Code?* (`choose-setup.html`) |
| You don't start from a blank page | The lede of *Pick a starter* (card 05) |
| One long scrolling story, for learning any history; a multi-page minisite with a sidebar, for organizing any subject | The home page's *What you'll end with* and the starter cards (card 05) |
| history-of-indigo was built from a single message; the guide shows it and how to use it | *Pick a starter* (`starters.html`) and *Make your own version* (card 04) |
| Typos and all | *Make your own version*: "exactly as typed" and "The typos didn't matter." (card 04) |
| A free GitHub account; Claude Pro or higher, or ChatGPT Plus or higher | The home page, *What you need* |
| About 1–2 hours | The home page's time estimate (meta `time`, shown as the clock chip) (card 01) |
| From your phone or your computer | The home page's lede |

The caption does not call the guide the first, the fastest or the easiest of anything, and it
does not promise a price beyond what *What you need* says.
