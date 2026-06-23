# A Warhammer 40k 11th edition army list builder

Hosted on: https://furka.github.io/40k-11th-list-builder/

This app helps you build and manage 11th-edition army lists with the official
Munitorum Field Manual at [mfm.warhammer-community.com](https://mfm.warhammer-community.com/).
Detachment Points, tier-based unit pricing, Leader/Support bodyguard
matching, and the Incursion / Strike Force / Onslaught battle-size caps are
all enforced.

# Local development

```
npm ci
npm run dev
```

# Re-scraping MFM data

When Games Workshop updates the online MFM, run:

```
npm run mfm:scrape          # uses cached HTML where unchanged
npm run mfm:scrape:refresh  # forces a re-fetch of every faction page
```

Each scrape that detects content changes mints a new sparse
`src/data/munitorum-field-manual-11th/v<siteVersion>-<date>/` directory
alongside any older snapshots. Sparse means only the faction JSONs whose
content actually changed are written into the new dir, plus a
`_changes.md` summary of points/datasheet changes vs the previous
snapshot. Older snapshots and saved lists keep resolving points from
their original MFM version via the overlay aggregator.

# History

Forked from [40k-10th-list-builder](https://github.com/furka/40k-10th-list-builder)
when 11th edition launched. The original 10th-edition app stays available
at that URL but is no longer maintained.

# Discord server

Discuss app development at: https://discord.gg/CtbC5kBeJ2
