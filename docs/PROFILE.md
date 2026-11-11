# Profile artwork

The profile is one continuous SVG composition with a separate mobile layout.
GitHub selects the mobile SVG below a 680px viewport through the README's
`picture` element. Contact links are native README anchors, so they remain
clickable and keyboard accessible. A collapsed text version preserves the
profile information for readers who cannot use the artwork.

## Edit and build

Requires Node.js 22 or newer. There are no npm dependencies or remote assets
required for a normal build.

```sh
node scripts/build.mjs
```

Edit `profile.config.json` for identity, copy, palette, links and the five core
tools. The two biography lines are joined on desktop and arranged separately
on mobile. Keep copy concise and inspect both layouts after changing it.
`opticalScale` balances wide logo shapes without altering their geometry.
Layout and mesh drawing live in `scripts/build.mjs`.

Generated files:

- `dist/profile.svg` — 1200 × 1440 desktop composition.
- `dist/profile-mobile.svg` — 640 × 1600 mobile composition.
- `README.md` — responsive images, real contact links and an accessible text
  equivalent, all generated from the same configuration and activity snapshot.

The SVGs embed their font and logo paths. They need no JavaScript, external font
request, statistics widget, animation or third-party image host. Both have a
title and description. Artwork hashes in the README image URLs change whenever
either composition changes, reducing stale image caching.

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
