# Muster Armies (11th edition)

These army-building rules are published only inside the official Warhammer
40,000 app (sections **25.03 Select Battle Size** and **25.04 Fill Your
Army Roster**) and are absent from the public Core Rules PDF. They are
transcribed here verbatim so the list builder's enforcement can be audited
against the source.

The transcription is from the in-app text as of the date this file was
committed. If GW edits the wording, treat the app as authoritative and
update this file together with any affected enforcement code.

---

## 25.03 Select Battle Size

> Select a battle size below. This will determine the total number of
> points (also known as the points total) each player can spend to build
> their army. The points values for units can be found in the Warhammer
> 40,000 app. You will need to refer to these when building your army.
>
> The battle size will also determine the total number of Detachment
> Points (DP) players will have to unlock **detachments** with, the
> number of units with the same datasheet name that they can include in
> their army, and the number of **enhancements** that they can include
> in their army.

| Battle size  | Points total | Detachment Points (DP) | Enhancement Limit | Unit Limit\* |
| ------------ | ------------ | ---------------------- | ----------------- | ------------ |
| Incursion    | 1000         | 2                      | 2                 | 2            |
| Strike Force | 2000         | 3                      | 4                 | 3            |

> \* The unit limit for **BATTLELINE** and **DEDICATED TRANSPORT** units
> is double the relevant amount shown above, and every **EPIC HERO** has
> a unit limit of 1, regardless of the battle size.

---

## 25.04 Fill Your Army Roster

> You will now select your **detachments**, units, **WARLORD** and
> **enhancements** that will be in your army. You will also attach your
> **leader** and **support** units to other units.
>
> When doing so:
>
> - You cannot exceed any of the values presented in the Select Battle
>   Size table (25.03). For example, in an Incursion battle, you cannot
>   select **detachments** with a combined value of more than 2 DP.
> - **No unit (including attached units) can have more than one
>   enhancement.**
> - Your army roster must follow all restrictions placed on it by the
>   rules and units being included in it.

### Select detachments

> You can now use your DP to select **detachments** for your army. You
> can only select from those available to your **army faction**. Each
> one will give you access to different **force dispositions**,
> **detachment rules**, **enhancements** and/or **stratagems** to use in
> the coming battle. You cannot select the same **detachment** more
> than once. Record your selected **detachments** on your army roster.
>
> Note that some **detachment rules** list units and other
> **detachments** that your army either must include or cannot include;
> you must follow all such rules when building your army for the
> **detachments** you have selected.

### Select units

> Select all the units you want to include in your army. You can only
> select units with your faction keyword and units available to your
> **army faction**. Each time you include a unit in your army, it can
> take any wargear or options it has access to. Note on your army
> roster the number of models in the unit, any wargear and upgrades it
> has, and its points value.
>
> Select one **CHARACTER** unit to be your Warlord's unit. This must
> be a unit that has the faction keyword you chose as your **army
> faction**. Then select one **CHARACTER** model in that unit to be
> your Warlord – the supreme leader of your army – and make a note of
> this on your army roster. That model gains the **WARLORD** keyword.
> Some units have a rule on their datasheet stating that they must be
> your **WARLORD**. If you want to include one or more of these units
> in your army, you must select one of them to be your **WARLORD**.
> Rules that state that a model cannot be your **WARLORD** take
> precedence over ones that require it to be your **WARLORD**.

### Attach leaders and support units

> For each **leader** and **support** unit in your roster, you can
> attach them to a **bodyguard** unit that they can join, following
> the rules for Forming Attached Units (19.01). Each **support** unit
> in your roster must be attached to a **bodyguard** unit.

### Select enhancements

> Select all of the **enhancements** you want to include from the
> **detachments** you selected and give each one to a different unit
> in your army. When you do, increase those units' points values
> accordingly. The points values for **enhancements** can be found in
> the Warhammer 40,000 app.
>
> Unless otherwise stated:
>
> - Only **CHARACTER** units can be given **enhancements**. If such a
>   unit contains more than one model, select one **CHARACTER** model
>   in that unit to have that **enhancement**.
> - **EPIC HEROES** cannot have **enhancements**.
> - Your army cannot include more than one of the same
>   **enhancement**.
>
> **Upgrades:** Some **enhancements** are tagged with 'Upgrade'. Unlike
> other **enhancements**:
>
> - These can be given to non-**CHARACTER** units.
> - You can include up to three of the same Upgrade in your army (the
>   second and third instances of the same Upgrade do not count towards
>   the total number of **enhancements** in your army, but you must
>   still spend the stated points cost each time).

---

## How this app enforces the rules

This table maps each rule above to the module that enforces it.

The CHARACTER and EPIC HERO defaults from §25.04 ("unless otherwise
stated") are applied as **universal defaults** by the validators — they
no longer require a per-enhancement opt-in. Two carve-outs apply:

1. The `nonCharacterOnly` flag, derived from the "(Upgrade)" suffix in
   [`scripts/scrape-mfm-11th/extract.mjs`](../scripts/scrape-mfm-11th/extract.mjs),
   exempts Upgrades from the CHARACTER rule.
2. An enhancement that explicitly names this host in its `allowedHosts`
   whitelist is "otherwise stating" — both the CHARACTER and the EPIC
   HERO defaults yield to that whitelist. Example: Necron *Quantum Goad*
   has `allowedHosts: ["C'TAN SHARD OF THE NIGHTBRINGER"]`, and the
   Nightbringer is an EPIC HERO MONSTER — the explicit name override
   allows attachment despite the universal EPIC HERO block.

Per-enhancement metadata in
[`src/data/configs/enhancement-restrictions.auto.json`](../src/data/configs/enhancement-restrictions.auto.json) —
LLM-scraped from the official Faction Pack PDFs by
[`scripts/scrape-mfm-11th/`](../scripts/scrape-mfm-11th/) — layers
narrower restrictions on top (`allowedHosts`, `requiredKeywords`,
`limit`). The scraper output is the single source of truth: fixes go in
the scraper, not the JSON.

| Rule | Enforced by |
| --- | --- |
| Battle-size table (Incursion 1000, Strike Force 2000): points, DP, enhancement limit, unit limit | [`src/utils/battle-size.js`](../src/utils/battle-size.js) |
| Battleline / Dedicated Transport doubled unit cap; Epic Hero unit cap of 1 | [`src/utils/unit-max.js`](../src/utils/unit-max.js) |
| DP budget enforced when adding detachments; 3-DP detachments require Strike Force and own the army | [`src/stores/armyList.js`](../src/stores/armyList.js) (`whyCantAddDetachment`) |
| Same detachment can't be added twice | [`src/stores/armyList.js`](../src/stores/armyList.js) (`whyCantAddDetachment`) |
| Battle-size enhancement count cap (Incursion 2 / Strike Force 4) | [`src/stores/armyList.js`](../src/stores/armyList.js) (`getUnitValidationError`, enhancement branch) |
| **No unit (including attached units) can have more than one enhancement** | [`src/utils/legal-drop-slots.js`](../src/utils/legal-drop-slots.js) (drag-time) and [`src/stores/armyList.js`](../src/stores/armyList.js) (post-hoc) |
| Enhancement must be attached; never on another enhancement | [`src/utils/legal-drop-slots.js`](../src/utils/legal-drop-slots.js) and [`src/stores/armyList.js`](../src/stores/armyList.js) |
| Support unit must be attached to a bodyguard | [`src/stores/armyList.js`](../src/stores/armyList.js) (`getUnitValidationError`) |
| Leader attaches only to its `attachesTo` list; max 1 leader and max 1 support per host | [`src/utils/legal-drop-slots.js`](../src/utils/legal-drop-slots.js) and [`src/utils/attachment-rules.js`](../src/utils/attachment-rules.js) |
| **Only CHARACTER units can be given enhancements** (universal default; bypassed by `nonCharacterOnly` or a host in `allowedHosts`) | [`src/utils/legal-drop-slots.js`](../src/utils/legal-drop-slots.js) and [`src/stores/armyList.js`](../src/stores/armyList.js) |
| **EPIC HEROES cannot have enhancements** (universal default; bypassed by a host in `allowedHosts`) | [`src/utils/legal-drop-slots.js`](../src/utils/legal-drop-slots.js) and [`src/stores/armyList.js`](../src/stores/armyList.js) |
| **Your army cannot include more than one of the same enhancement** (universal default: 1 per army, 3 for Upgrades; an explicit `limit` overrides) | [`src/stores/armyList.js`](../src/stores/armyList.js) (`effectiveEnhancementLimit`, consumed by `enhancementsTaken` for codex availability and `getUnitValidationError` post-hoc) |
| 2nd/3rd copy of the same Upgrade does not count toward the army enhancement total | [`src/stores/armyList.js`](../src/stores/armyList.js) (`totalEnhancementsCount` and the `overCountIds` billing pass in `getUnitValidationError`) |
| Upgrade-tagged enhancements can attach to non-character units | `nonCharacterOnly` flag, derived from the "(Upgrade)" suffix during scrape |

The `characterOnly` and `notOnEpicHeroes` flags still appear in the
scraped JSON for ~130 / ~3 enhancements respectively but the validators
no longer consult them — they're redundant with the universal defaults.
A follow-up can drop them from the scraper schema.

### Free-attach override

An opt-in **"Attach freely"** toggle (`appStore.freeAttach`, surfaced in
CodexOptions) lets the player attach any unit/enhancement to any host to model
special datasheet rules the data doesn't capture (e.g. Cryptothralls joining a
Cryptek-led unit). It relaxes **only the SOFT "unless otherwise stated"
attachment-placement rules**: leader/support `attachesTo` lists, the max-1-leader
and max-1-support per host caps, "regular units can't attach", and the
enhancement host-eligibility defaults (CHARACTER-only, EPIC HERO block,
`nonCharacterOnly`, `allowedHosts`, `requiredKeywords`).

It never relaxes **HARD** rules: the one-enhancement-per-attached-unit cap
(§25.04), "enhancement must be attached / never on another enhancement", the
structural Forming-Attached-Units (19.01) invariants (single parent, no cycles,
depth ≤ 3), or any roster/battle-size count (unit max, enhancement count cap,
per-enhancement `limit`, DP). An overridden attachment is stamped with a
per-unit `forcedAttach` flag (serialised as `ufa`, shown as an `OVERRIDE` badge)
which suppresses the soft host-eligibility errors only.

### Rules deliberately NOT auto-enforced

- **Warlord designation.** The roster carries no explicit Warlord
  marker. Selecting which CHARACTER model is the Warlord is left to the
  player.
- **Detachment-specific must-include / cannot-include rules** (e.g.
  "your army must include X" on a detachment). The roster builder
  trusts the player to read the detachment text and obey it.
