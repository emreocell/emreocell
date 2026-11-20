# Profile artwork

The profile is one painted panel: a single virtual canvas with one grainy mesh gradient, a
desktop layout (1200 px wide) and a separate mobile layout (640 px wide, selected below a 680px
viewport through the README's `picture` elements). It is delivered as a stack of seamless SVG
slices. Most of it is one image (the top block with name, toolkit, activity and the open-source
header, `dist/profile.svg`); it is cut only where something has to be clickable:

- each merged pull request is a pill button (`dist/panel/*-pr0.svg`, `*-pr1.svg`), so a project with
  two merged PRs shows two buttons side by side;
- the "Browse all merged PRs" strip and the three contact buttons (Let's talk, LinkedIn, the
  company wordmark) at the bottom.

Every slice paints the same canvas (same mesh, same grain noise in the same coordinates), so the
cuts are invisible. In the README the slices are inline images with `align="top"` and no
whitespace or blank lines between them, so they touch exactly. A collapsed text version preserves
all information, including every link, as copyable text.

GitHub shows SVGs through `<img>`: text inside them cannot be selected, nothing can be layered on
top of them and links inside an SVG are inert. That is why the buttons are separate images wrapped
in native links, and why the plain-text section exists.

## Edit and build

Requires Node.js 22 or newer. There are no npm dependencies or remote assets
required for a normal build.

```sh
node scripts/build.mjs
```

Edit `profile.config.json` for identity, copy, palette, links, the five core tools and the
open-source list (`openSource`: repository, display name, one-line summary and one or two merged
PR numbers). The two biography lines are joined on desktop and arranged separately on mobile. Keep
copy concise and inspect both layouts after changing it. `opticalScale` balances wide logo shapes
without altering their geometry. `companyLogo` names the wordmark in `assets/brand/` that
replaces the company name in the role line and appears on the contact button. Layout and mesh
drawing live in `scripts/build.mjs`.

Text is measured offline with real Manrope advances from `assets/fonts/manrope-metrics.json`
(for wrapping and for placing the wordmark right after "Full Stack Developer at"). The small
slices embed `assets/fonts/manrope-panel.woff2` (ASCII, weights 500-650) and only the top block
embeds the full font. To regenerate the metrics, the panel font, or to re-trace a logo from a
transparent PNG, see `scripts/tools/` (Python with `fonttools` and `brotli`, plus `opencv-python`
for the trace); none of it runs in CI.

Generated files:

- `dist/profile.svg`, `dist/profile-mobile.svg` — the top block (the only slice that changes with
  the daily refresh).
- `dist/panel/*.svg` — every other slice, desktop and `-mobile`.
- `README.md` — the slices in order, the links around the buttons and the text equivalent, all
  generated from the same configuration and activity snapshot.

The SVGs embed their font, logo paths and wordmark. They need no JavaScript, external font
request, statistics widget, animation or third-party image host. Each has an accessible label.
Artwork hashes in the README image URLs change whenever any image changes, reducing stale image
caching.

## Activity

`scripts/activity.mjs` queries GitHub's GraphQL contribution calendar using the
workflow-provided `GITHUB_TOKEN`. It stores only aggregate daily counts, dates,
the account login and the refresh timestamp in `data/activity.json`. It never
stores a token, repository name or private event detail.

The displayed total covers exactly **365 UTC calendar dates, including the
refresh date**. The first and last weeks may be partial. Empty cells remain
empty; the calendar never invents activity or displays dates after the snapshot.
Its five color levels use quantiles of the nonzero daily counts. The calendar
is a dated snapshot, refreshed daily, and aggregate visibility follows the
GitHub API's response.

```sh
node --test scripts/activity.test.mjs
GITHUB_TOKEN=... node scripts/activity.mjs
node scripts/build.mjs
```

Supply the token through your environment or secret manager; do not put an
actual token in a committed file or shell history. `PROFILE_LOGIN` can override
the fetcher's configured login for local debugging. The renderer rejects a
snapshot whose login differs from the profile configuration.

The workflow runs:

- Daily at approximately **03:17 UTC / 06:17 Europe/Istanbul**.
- When relevant source files change on `main`.
- On manual `workflow_dispatch`.

GitHub may delay scheduled runs. The visible timestamp always records the last
successful snapshot, so an interrupted schedule does not claim fresh data.

The fetcher checks the response, complete date range, weekday positions,
nonnegative integer counts and agreement between daily counts and the total.
An HTTP timeout, invalid response or inconsistent calendar fails the run before
publication. It writes its snapshot atomically only after validation. The build
prepares both SVGs and the README before writing them. The action commits the
data and artwork together only after all steps succeed, preserving the prior
published composition on failure.

Updates are serialized, actions are pinned to verified commits, write
permission is scoped to the update job, and publication uses an ordinary
fast-forward push. No personal access token or force push is needed.

## Assets and attribution

- [Manrope](../assets/fonts/README.md) — a local, subsetted variable font under
  the SIL Open Font License; Turkish characters are retained.
- [Technology marks](../assets/icons/README.md) — authentic vector paths from
  Simple Icons, with primary logo sources and applicable license notices.

All five marks retain their original geometry and use white on the dark
surface. Logo and font source pins, licenses and reproduction notes stay beside
their respective assets.

## Verification

Before publishing, inspect the desktop and mobile renders at actual README
widths, and render the README through GitHub's Markdown API to check sanitization
and image selection markup. The activity tests cover successful bounded
responses, padded weeks, malformed data, HTTP/GraphQL errors and preservation
of the previous snapshot when credentials are missing.

Reference: [GitHub profile README](https://docs.github.com/en/account-and-profile/how-tos/profile-customization/managing-your-profile-readme),
[GitHub Markdown rendering](https://github.com/github/markup), and
[GitHub GraphQL contribution calendar](https://docs.github.com/en/graphql/reference/users#contributioncalendar).
