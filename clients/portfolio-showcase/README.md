# Portfolio showcase (prototype, PORTFOLIO-N1)

A minimalist editorial portfolio for Julian Passebecq, built as a DataPass Studio client. It doubles as a
framework acceptance client: content family, one custom component, viz kit only, no 3D, no SQL, no runs.

## Sections

- **Intro**: name, role, one-paragraph lede.
- **Read from the repo** (the one bold idea): the framework measuring itself, drawn with its own viz kit.
  KPI count-ups (clients, unit tests passing, commits with a 28-day sparkline, pull requests), the viz
  core size against its 40 KB budget, and a bar chart of emitted JS per reference client.
- **Selected work**: 8 cards with compressed WebP stills (`public/work/`, 178 KB total). Contoso Data Studio and
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
no three.js, each still at most 64 KB, all stills at most 320 KB. Then it runs Chromium:

- On desktop: 8 cards, the KPIs match the stats, 6 stills decode, the theme cycles, no console errors or failed requests.
- At 390 px, light and dark: no horizontal scroll.
- Reduced motion works.
- Full-page captures for light and dark at 1440 and 390 px are taken twice each, and both runs must be byte-identical.

Output goes to `qa/portfolio-showcase/`.

## Content rules

All descriptions point to pull requests in this repository or name a companion repository. No client data and no
FOIL data or images. Stills come from synthetic or illustrative captures. The Contoso still is cropped
to its synthetic retail projects, and the param-lab still to the generic geometry viewport.
