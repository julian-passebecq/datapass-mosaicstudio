# Portfolio showcase (prototype, PORTFOLIO-N1, identity N2)

A minimalist portfolio drawn like an engineering sheet for Julian Passebecq, built as a DataPass Studio client. It doubles as a
framework acceptance client: content family, one custom component, viz kit only, no 3D, no SQL, no runs.

## Identity (N2)

An engineering-drawing / instrument-panel language: a framed sheet on a 96 px major grid (16 px minor grid
in the intro), a title block, a dimension line (source → pipeline → model → app), numbered section tabs,
figure captions and a readout panel with channel labels, corner ticks and a 1 KB ruler. Display and text
use Bricolage Grotesque (optical size axis), every number and label uses JetBrains Mono. Both are bundled
woff2 latin subsets (`fonts/`, SIL OFL 1.1, see `fonts/NOTICE.md`) because the CSP is `font-src 'self'`.
Light is blueprint ink on drafting film (cobalt `#2638e8`), dark is phosphor on an instrument panel
(lime `#c5f04a`); one accent per theme, never red on cream.

## Demo videos

Four cards carry a short muted demo (`public/media/*.mp4`, H.264, at most 1280x720, 24 fps, CRF 30, no audio
track, faststart; each at most 2 MB). The card shows a WebP poster inside a button; the `<video>` element
is created only on click (so nothing is fetched before), then plays muted, inline, looped, with controls.
Nothing autoplays, including under reduced motion. Same origin only, so the default CSP (`default-src
'self'`, which covers media) is unchanged. Sources: viz gallery recording (PR #20), Fabric Bricks film
(PR #18), architecture atlas film (PR #24), coding lab recording (PR #22).

## Sections

- **Intro**: name, role, one-paragraph lede.
- **Read from the repo** (the one bold idea): the framework measuring itself, drawn with its own viz kit.
  KPI count-ups (clients, unit tests passing, commits with a 28-day sparkline, pull requests), the viz
  core size against its 40 KB budget, and a bar chart of emitted JS per reference client.
- **Selected work**: 10 cards; 4 with click-to-play demos, 4 with compressed WebP stills (`public/work/`). Contoso Data Studio and
  DiagramCloud are labelled companion apps (separate repositories). DiagramCloud has a schematic, not a
  screenshot. The engineering 2D/3D client is a private card with no data and no images.
- **The framework**: a five-stage architecture strip (produce, declare, run, render, ship).
- **Contact**: plain text. No form, nothing is sent.

Theme is the `pf-theme` view field (auto follows the OS, then light, then dark). Motion uses the viz motion
clock (count-ups, bar transitions) and settles at once under `?capture=1` or reduced motion.

## Numbers

`stats.generated.ts` is written by `tools/stats.mjs` from this repository: client folders, `src/framework`
files and lines, declared tests plus a local `node --test` run, viz core size (esbuild min + gzip, the same
measurement as `test:viz-gallery`), reference-client JS baselines from `scripts/check-client-performance.mjs`,
git commits and activity, and the PR count from `gh` (left unchanged when offline).

```sh
node --experimental-strip-types clients/portfolio-showcase/tools/stats.mjs          # regenerate (runs unit tests)
node --experimental-strip-types clients/portfolio-showcase/tools/stats.mjs --check  # drift check
```

## Acceptance

```sh
npm run client:check -- portfolio-showcase
node --experimental-strip-types clients/portfolio-showcase/qa/smoke.mjs   # builds, then checks
```

The smoke script runs the stats drift check, builds the client, and checks these budgets: JS at most 160 KB gzip,
no three.js, each still or poster at most 64 KB, all at most 360 KB, each video at most 2 MB, all videos
at most 6 MB, the two fonts at most 128 KB. Then it runs Chromium:

- On desktop: 10 cards, the KPIs match the stats, 8 stills and posters decode, no `<video>` before a click, each
  demo plays muted from our origin after its click (at most 720 px high), the theme cycles, no console errors or failed requests.
- At 390 px, light and dark: no horizontal scroll.
- Reduced motion works, and no video starts on its own.
- Full-page captures for light and dark at 1440 and 390 px are taken twice each, and both runs must be byte-identical.

Output goes to `qa/portfolio-showcase/`.

## Content rules

All descriptions point to pull requests in this repository or name a companion repository. No client data and no
FOIL data or images. Stills come from synthetic or illustrative captures. The Contoso still is cropped
to its synthetic retail projects, and the param-lab still to the generic geometry viewport.
