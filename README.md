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

Each scrape that detects content changes mints a new
`src/data/munitorum-field-manual-11th/v<siteVersion>-<date>/` directory
alongside any older snapshots so existing saved lists can still resolve
points from their original MFM version.

# History

Forked from [40k-10th-list-builder](https://github.com/furka/40k-10th-list-builder)
when 11th edition launched. The original 10th-edition app stays available
at that URL but is no longer maintained.

# Discord server

Discuss app development at: https://discord.gg/CtbC5kBeJ2
