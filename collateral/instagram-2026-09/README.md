# Instagram launch set, September 2026

Five 1080×1350 (4:5) cards announcing the [Quickstart guide](https://fritzhand.github.io/quickstart/),
built by [`build-cards.mjs`](./build-cards.mjs) from the site's own files. They make one carousel,
in the order below. The caption is in [`caption.md`](./caption.md), and the alt text for each slide
is in [`alt-text.md`](./alt-text.md), which the full build writes.

| # | File | Carries |
|---|---|---|
| 1 | `01-site-4x5-1080x1350.png` | The cover. *Quickstart* and the home page's title on the hero's ink navy, a phone showing the home page down to just below its buttons, and the address. |
| 2 | `02-steps-4x5-1080x1350.png` | *Five steps to a live site.* The five steps on a numbered route, with Step 2's fork into the app path and the VS Code path, ending at *your-username*.github.io/*your-repo*. |
| 3 | `03-say-4x5-1080x1350.png` | The one rule, *You type or say what you want. The agent does the work. You check it.*, and four real "Say this" prompts. |
| 4 | `04-one-prompt-4x5-1080x1350.png` | *One message built history-of-indigo.* That message, typos kept, why it worked, and the site on a phone. |
| 5 | `05-starters-4x5-1080x1350.png` | *Make your own version.* The two starters, each in a browser window showing its live site, with the site's framing for each, and the address. |

The PNGs are generated. To change a card, edit `build-cards.mjs` and rebuild. A PNG edited by
hand skips the checks below and is overwritten by the next build.

## Build

```bash
node collateral/instagram-2026-09/build-cards.mjs              # all five cards, alt text, check, proof
node collateral/instagram-2026-09/build-cards.mjs 03-say       # one card (or several ids); PNGs only
node collateral/instagram-2026-09/build-cards.mjs check        # re-read the PNGs on disk
node collateral/instagram-2026-09/build-cards.mjs proof        # the carousel as the feed shows it
```

`alt-text.md`, the check and `proof.png` are rewritten only by the full build (no card ids). After
a one-card build, run the full build before posting, or that slide's alt text may not match it.

It runs from any directory in about a minute. It needs Playwright with Chromium (found as
`scripts/og.mjs` finds it; not a dependency of this repo) and nothing else: the builder encodes the
PNGs itself. It needs the network for Google Fonts and three live sites; behind a proxy, prefix
`NODE_USE_ENV_PROXY=1`. Analytics requests are dropped.

For card 01 it serves `docs/` with `scripts/serve.mjs` and stops it when done, running
`node build.mjs` first if `docs/` is missing. It never writes to `docs/`.

Cards render at 2× and are downsampled to 1080×1350. `proof.png` (gitignored) shows the carousel
at a phone's width and the cover in the 3:4 grid. A card that fails is written as
`<id>.failed.png` (also gitignored).

### What the build refuses to write

- A glyph drawn by anything but Bricolage Grotesque, Inter or JetBrains Mono loaded as web fonts
  (Chrome's `CSS.getPlatformFontsForNode`; a locally installed copy counts as a fallback).
- A face that did not load in the weight and style a line is set in.
- A line of text under WCAG AA against the pixels behind it: 4.5:1 under 40 card px, 3:1 above.
- A line set under 13 card px.
- A glyph outside the crop-safe frame: 64 px from each side (the 3:4 grid tile takes 34), 40 px
  top and bottom.
- Text that runs past its box, an element that leaves the card, or two blocks that overlap.
- A source that no longer says what the card says. The build names the file and the words.
- A capture that is not clean: an HTTP error, a missing web font, a stale `docs/` (the hero's
  kicker, title, lede, buttons or time no longer match `content/index.html`), or a cut that would
  slice text or a button.

### The captures

- **01, the home page** from `docs/`, 390 css px at 3×, light theme (14.1:1 against the ground; the
  dark theme is 1.3:1). Cut between the hero panel and the next block, below both buttons.
- **04, history-of-indigo, live**, 390 css px at 3×, its default dark theme, cut 22 css px under
  the byline icons and above the buttons.
- **05, the two starters, live**, as desktop windows at one shared shape, cut where neither window
  slices text, a button or an icon. The builder picks the width (see `WIN`); this build used
  1344×907 for both.

Cards 04 and 05 show those sites as they are on the day of the build.

## Where the words come from

Nothing on a card is typed twice. The only words written into the builder are two headlines
(*Five steps to a live site.* and *One message built*, which the build completes with the repo
name), the period after *Make your own version*, the word *or* between the two paths, *By* before
the author's name, and the phone's clock (*9:41*).

| On the card | Read from |
|---|---|
| *Quickstart*, the address (all); *By Jeremy Fritzhand* (02–05) | `site.config.json`: `siteName`, `siteBase`, `author.name` |
| The line under *Quickstart* in the header (02–05), the cover's deck (01) | `content/index.html` meta `title` |
| The label at the top right of 02–05 | The `nav.json` group of the page the card draws from |
| Kicker and time on the cover (01) | `content/index.html` meta: `eyebrow`, `time` |
| The brand mark and every icon | `build.mjs`: `BRAND_MARK` and `ICONS` |
| *Say this* and *Copy* on each prompt box (03) | `build.mjs`: the default prompt label and the Copy button's label |
| *The five steps* (02) | `content/index.html`, the section *The five steps* |
| Step names (02) | `content/nav.json`, the five `Step N · Name` group labels |
| The line under each step (02) | The matching step card on the home page, checked against `nav.json` |
| *The app path*, *The VS Code path* and their devices (02) | `content/choose-setup.html`, the table head and the *Devices* row |
| The route's end (02) | `content/index.html`, *What you'll end with* |
| *The one rule* and the rule (03) | `content/index.html`, the section *The one rule* |
| The four prompts (03) | `content/prompts.html`, found by label, each checked on the page that teaches it: `multiple-repos.html`, `talk-to-it.html`, `commit-as-you.html`, `save-and-push.html` |
| The kicker, *This is the message, exactly as typed:*, the message, *The typos didn't matter.* and the four things (04) | `content/make-your-version.html`, *The fastest way: one big prompt* |
| *One message built history-of-indigo.* (04) | A headline, checked against `starters.html`: "history-of-indigo was built from a single message." |
| *history-of-indigo* and *From history-of-tampa* under the phone (04) | The history-of-indigo card in `content/starters.html` |
| *Pick a starter*, *Make your own version*, the standfirst (05) | `content/starters.html` meta `title` and the first two sentences of its `lede`; the `nav.json` label of `make-your-version` |
| Each starter's kicker and *Use it to…* line (05) | The two cards under *The two starters* in `content/starters.html` |
| *One long scrolling story*, *A multi-page minisite with a sidebar* (05) | `content/index.html`, *What you'll end with*, checked against the starter cards |
| *Start here* (05) | `nav.json`, the label of the home page |

Placeholders render as the site's unfilled amber chips. Quoted site text keeps its own
characters, including the typos in card 04's message.

## Why the cards look the way they do

- **The hero's ground for the cover, the site's page for the rest.** The cover uses the home
  page's hero gradient and its two glows, as the share card does. The four cards behind it are the
  site's light theme, with the site's top bar restated as a header.
- **One accent.** Teal (`--accent`) carries the kickers, the address and *You check it.* Amber
  marks only "Say this" boxes and placeholder chips, as on the site; otherwise it appears only in
  the brand mark's spark and the cover's warm glow, both taken from the site. The VS Code path's
  blue badge on card 02 is the one other hue, with the meaning the site gives it.
- **The site's own components.** Step circles and the route rail are `--step-bg` and
  `--step-rail`. The "Say this" box is drawn as the share card (`site/og.png`) draws it.
- **One idea per card, one title size.** The titles on 02, 04 and 05 share one size, 78 px. Card
  03 keeps to the rule and the prompts; what you do by hand stays on the site.
- **Type at feed size.** Body copy is 22 px and up (about 8 px in a 390 px feed); labels are 13 px
  and up. Repo names never break at a hyphen.
- **Devices.** The phone is the indigo set's drawing. Hardware is the only color literal.
- **No em dashes in new copy.** Site text appears as the site writes it.

## Open items and posting notes

1. **The link.** Instagram does not link from captions. Put `fritzhand.github.io/quickstart` in
   the bio before posting, or add a link sticker to a Story that shares the post.
2. **Alt text.** Paste each entry in `alt-text.md` into the matching slide, in the post's advanced
   settings under Accessibility.
3. **Rebuild before posting.** Cards 04 and 05 capture three live sites. startup-india-guide shows
   a news ticker whose headlines change. Run the full build on the day, and look at `proof.png`.
