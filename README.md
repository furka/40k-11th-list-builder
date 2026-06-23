# A Warhammer 40k 11th edition army list builder

Hosted on: https://furka.github.io/40k-11th-list-builder/

# Local development

```
npm ci
npm run dev
```

# Where the data comes from

Points and datasheets are read straight from the official
[Munitorum Field Manual](https://mfm.warhammer-community.com/). Detachment
rules, enhancements, and unit keywords are pulled from the official Faction
Pack PDFs (parsed by Claude). For older content that Games
Workshop doesn't publish online, the app falls back to the community-maintained
[BSData](https://github.com/BSData/wh40k-10e) catalogs.

All of this updates **automatically**: a scheduled job checks the upstream
sources once a day and opens a pull request when something has changed. New
points usually land in the app within a day of GW publishing them.

# Discord server

Discuss app development at: https://discord.gg/CtbC5kBeJ2
