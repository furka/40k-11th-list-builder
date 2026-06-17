import { JSDOM } from "jsdom";

/**
 * Extracts an intermediate JSON representation of a faction page.
 *
 * The mfm.warhammer-community.com pages are Next.js SSR'd: unit point values
 * are streamed in as deferred templates (`<template id="P:N"></template>`) and
 * resolved later in the document by `$RS("S:N","P:N")` script calls that swap
 * in `<div hidden id="S:N"><span>X pts</span></div>` content.
 *
 * Approach:
 *   1. Build a map of P-id → points by scanning `<div hidden id="S:N">` blocks
 *      whose innerHTML matches `<span>NUMBER pts</span>` (the leaf points
 *      content blocks; complex S:N wrappers don't match this shape).
 *   2. Find the DETACHMENTS section: parse each detachment block (name + DP +
 *      enhancements with inline points).
 *   3. Find the UNITS section (inside the hidden S:1 boundary): parse each
 *      datasheet block (name + tiered cost lines with template references +
 *      leader/support attaches-to relationships).
 */
export function extractFactionData(html) {
  // The Next.js streaming SSR emits deferred chunks as `<template id="P:N">`
  // or `<template id="B:N">` placeholders that get swapped in later by
  // `$RS("S:N","P:N")` / `$RC("B:N","S:M")` script calls. We resolve those
  // substitutions via DOM manipulation (jsdom) before traversing — string
  // regex can't reliably handle the non-uniform script-tag shapes (some
  // script tags contain a one-liner $RC, others wrap a big JS init blob).
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  resolveTemplates(doc);

  const siteVersion = extractSiteVersion(doc);
  const detachments = extractDetachments(doc);
  const datasheets = extractDatasheets(doc);

  return {
    siteVersion,
    detachments,
    datasheets,
  };
}

function resolveTemplates(doc) {
  // 1. Parse all script tag contents to build a map of placeholder → source id.
  //    $RS("S:N","P:N") and $RC("B:N","S:M") are the two flavors.
  const placeholderToSource = {};
  const rsRe = /\$RS\("S:([0-9a-f]+)","P:([0-9a-f]+)"\)/g;
  const rcRe = /\$RC\("B:([0-9a-f]+)","S:([0-9a-f]+)"\)/g;
  for (const script of doc.querySelectorAll("script")) {
    const txt = script.textContent;
    let m;
    while ((m = rsRe.exec(txt)) !== null) {
      placeholderToSource[`P:${m[2]}`] = m[1];
    }
    rsRe.lastIndex = 0;
    while ((m = rcRe.exec(txt)) !== null) {
      placeholderToSource[`B:${m[1]}`] = m[2];
    }
    rcRe.lastIndex = 0;
  }

  // 2. Build source map: { S-id → innerHTML } from every <div hidden id="S:N">.
  const sourceMap = {};
  for (const div of doc.querySelectorAll('div[hidden][id^="S:"]')) {
    const id = div.getAttribute("id").slice(2);
    sourceMap[id] = div.innerHTML;
    div.remove(); // Drop the source wrapper from the live tree.
  }

  // 3. Iteratively replace each <template id="(P|B):N"></template> with the
  //    HTML of its source. Templates can nest (source content can contain
  //    more templates), so loop until no replacements occur.
  for (let pass = 0; pass < 16; pass++) {
    const templates = doc.querySelectorAll('template[id^="P:"], template[id^="B:"]');
    if (templates.length === 0) break;

    let replaced = 0;
    for (const tpl of templates) {
      const tplId = tpl.getAttribute("id");
      const sourceId = placeholderToSource[tplId];
      if (sourceId === undefined || sourceMap[sourceId] === undefined) continue;

      // Replace the template node with the parsed nodes from the source HTML.
      const fragmentHost = doc.createElement("div");
      fragmentHost.innerHTML = sourceMap[sourceId];
      const parent = tpl.parentNode;
      if (!parent) continue;
      while (fragmentHost.firstChild) {
        parent.insertBefore(fragmentHost.firstChild, tpl);
      }
      tpl.remove();
      replaced++;
    }
    if (replaced === 0) break;
  }
}

function extractSiteVersion(doc) {
  // <h2 class="text-xl font-semibold">v1.0</h2> appears in the page header.
  const h2s = doc.querySelectorAll("h2.text-xl.font-semibold");
  for (const h2 of h2s) {
    const text = h2.textContent.trim();
    if (/^v\d+(\.\d+)?$/i.test(text)) return text;
  }
  return "v?";
}

function extractDetachments(doc) {
  // DETACHMENTS section: <h3>DETACHMENTS</h3> immediately followed by a grid of
  // detachment cards. Each card has the structure:
  //   <div class="flex flex-col space-y-1 m-1 ...">
  //     <div class="flex flex-row justify-between ... bg-slate-500 ...">
  //       <span class="text-xl break-all">NAME</span>
  //       <span class="text-sm self-end pl-2">3DP</span>
  //     </div>
  //     <div ...>BATTLE TACTIC</div>   (optional)
  //     <div ...><span>UNIQUE: TYPE</span></div>   (optional)
  //     <div class="space-y-1">
  //       <div ...>ENHANCEMENTS</div>
  //       <ul class="leaders">
  //         <li><div class="..."><span>name</span><span>10 pts</span></div></li>
  //         ...
  //       </ul>
  //     </div>
  //   </div>
  const out = [];
  const heading = findHeadingNode(doc, "DETACHMENTS");
  if (!heading) return out;

  // The grid is the next sibling div of the heading's parent (or nearby).
  // Walk forward to the grid div and iterate its direct children.
  const grid = heading.nextElementSibling || heading.parentElement.querySelector(".grid");
  if (!grid) return out;

  for (const card of grid.children) {
    const headerEl = card.querySelector(":scope > div:first-child");
    const nameEl = headerEl?.querySelector("span.text-xl, span.break-all");
    const dpEl = headerEl?.querySelector("span.text-sm, span.self-end");
    if (!nameEl || !dpEl) continue;

    const name = nameEl.textContent.trim();
    const dpMatch = dpEl.textContent.trim().match(/(\d+)DP/);
    const dp = dpMatch ? Number(dpMatch[1]) : 0;

    const enhancements = [];
    const enhUl = card.querySelector("ul.leaders");
    if (enhUl) {
      for (const li of enhUl.querySelectorAll("li")) {
        const spans = li.querySelectorAll("span");
        if (spans.length >= 2) {
          const rawName = spans[0].textContent.trim();
          const ptsMatch = spans[1].textContent.trim().match(/(\d+) pts/);
          const { name: cleanName, isUnitUpgrade } = parseEnhancementName(rawName);
          enhancements.push({
            name: cleanName,
            points: ptsMatch ? Number(ptsMatch[1]) : 0,
            ...(isUnitUpgrade ? { isUnitUpgrade: true } : {}),
          });
        }
      }
    }

    // Optional flags: UNIQUE/battle-tactic tags.
    const tags = [];
    for (const div of card.querySelectorAll(":scope > div")) {
      const t = div.textContent.trim();
      if (t.startsWith("UNIQUE:")) tags.push(t);
    }

    // Battlefield role bar: a div with an inline background-color holding the
    // role name (PURGE THE FOE / TAKE AND HOLD / etc.). The site colors are
    // intrinsic to the role, but we capture the rendered color too so future
    // UI changes on the official site flow through without a code change.
    let role = null;
    for (const div of card.querySelectorAll(":scope > div[style*='background-color']")) {
      const text = div.textContent.trim();
      const styleMatch = div.getAttribute("style").match(/background-color:\s*(#[0-9A-Fa-f]+)/);
      if (!text || !styleMatch) continue;
      role = { name: text, color: styleMatch[1] };
      break;
    }

    // Detachment-level LEADER row: e.g. CURSED LEGION shows
    //   "LEADER: LOKHUST DESTROYERS, SKORPEKH DESTROYERS, …"
    // tucked inside the enhancements <ul class="leaders"> after the last <li>.
    // It tells the player which units can absorb the detachment-rule leader
    // effect, distinct from the unit-level leader fields on datasheets.
    let leader = null;
    const leaderDiv = card.querySelector("ul.leaders div.mx-3.font-bold");
    if (leaderDiv) {
      const spans = leaderDiv.querySelectorAll("span");
      const labelText = spans[0]?.textContent.trim() ?? "";
      if (labelText.startsWith("LEADER:") && spans[1]) {
        const attachesTo = spans[1].textContent
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (attachesTo.length) leader = { attachesTo };
      }
    }

    out.push({ name, dp, role, leader, enhancements, tags });
  }

  return out;
}

/**
 * Detachment enhancements may carry a trailing "(Upgrade)" marker in the
 * source HTML (e.g. "Enlivened Sentinels (Upgrade)") signalling that the
 * enhancement attaches to a regular squad rather than to a character. The
 * scraper is the ONLY layer that does the string match — downstream code
 * reads the `isUnitUpgrade` boolean on the normalised enhancement.
 *
 * The regex is anchored at end-of-string and case-insensitive: matches the
 * literal trailing "(Upgrade)" suffix in any casing, and won't strip the
 * substring if it happens to appear mid-name.
 */
export function parseEnhancementName(rawName) {
  const name = String(rawName ?? "");
  const stripped = name.replace(/\s*\(upgrade\)\s*$/i, "");
  return {
    name: stripped,
    isUnitUpgrade: stripped !== name,
  };
}

function extractDatasheets(doc) {
  // UNITS section is inside a hidden S:1 suspense boundary. Its children are
  // a grid of datasheet cards. Each card wraps in <div hidden id="S:N">
  // around its actual content node.
  const out = [];

  // Find every datasheet card by structure rather than by parent — they all
  // share the layout `<div class="px-1 py-0.5 bg-slate-500 ...">NAME</div>`
  // followed by one or more `YOUR ... COSTS` blocks.
  const cards = doc.querySelectorAll(
    "div.flex.flex-col.space-y-1.m-1.print\\:break-inside-avoid-page"
  );

  for (const card of cards) {
    // Skip detachment cards: they have a child with class "self-end" (DP badge)
    // and an ENHANCEMENTS heading. Datasheets have a "text-xl text-white" name div
    // (not nested in a flex-row).
    const nameDiv = card.querySelector(
      ":scope > div.px-1.py-0\\.5.bg-slate-500.font-bold.text-xl.text-white"
    );
    if (!nameDiv) continue;

    const name = nameDiv.textContent.trim();
    if (!name) continue;

    const tiers = [];
    const wargearOptions = [];
    let leader = null;
    let support = null;
    let epicHero = false;

    // Iterate the cost / leader / support / wargear / epic-hero sections.
    for (const section of card.querySelectorAll(":scope > div.space-y-1")) {
      const headingDiv = section.querySelector(":scope > div:first-child");
      const headingText = headingDiv?.textContent.trim() ?? "";

      if (/COSTS?$/i.test(headingText) && /YOUR/i.test(headingText)) {
        // tier block. Post-template-resolution, each <li> contains exactly
        // two spans: the size label and the points value.
        const tier = parseTierHeading(headingText);
        const options = [];
        const lis = section.querySelectorAll("li");
        for (const li of lis) {
          const spans = li.querySelectorAll("span");
          if (spans.length < 2) continue;
          const sizeText = spans[0].textContent.trim();
          const modelsMatch = sizeText.match(/(\d+)\s*models?/i);
          const models = modelsMatch ? Number(modelsMatch[1]) : null;
          const ptsMatch = spans[1].textContent.trim().match(/([\d,]+)\s*pts/);
          const points = ptsMatch ? Number(ptsMatch[1].replace(/,/g, "")) : null;
          options.push({ name: sizeText, models, points });
        }
        tiers.push({ tierHeading: headingText, ...tier, options });
        continue;
      }

      // Leader/Support/Wargear marker block:
      //   <div class="space-y-1">
      //     <div class="flex flex-row justify-between ..."><span>LEADER</span><img src="/leader.svg"/></div>
      //     <span class="font-bold">UNIT A, UNIT B</span>
      //   </div>
      const markerSpan = headingDiv?.querySelector("span");
      const markerText = markerSpan?.textContent.trim() ?? "";
      if (markerText === "LEADER" || markerText === "SUPPORT") {
        const attachesSpan = section.querySelector("span.font-bold");
        const attachesTo = (attachesSpan?.textContent ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (markerText === "LEADER") leader = { attachesTo };
        else support = { attachesTo };
        continue;
      }

      if (/^WARGEAR\s+OPTIONS?$/i.test(markerText)) {
        // Wargear block has the same <li><span>label</span><span>X pts</span></li>
        // shape as a cost tier. The MFM consistently writes labels as "per X"
        // (it reads naturally as "per Bombast field gun: 10 pts" in the
        // manual's typesetting). Strip the leading "per " here — the codex
        // card re-prepends it for display — so the wargear's identity is the
        // bare item name. That keeps the army list / print output clean
        // ("[Wgr] Bombast field gun" rather than "[Wgr] PER BOMBAST FIELD GUN").
        const lis = section.querySelectorAll("li");
        for (const li of lis) {
          const spans = li.querySelectorAll("span");
          if (spans.length < 2) continue;
          const rawName = spans[0].textContent.trim();
          const optName = rawName.replace(/^per\s+/i, "");
          const ptsMatch = spans[1].textContent.trim().match(/([\d,]+)\s*pts/);
          const points = ptsMatch ? Number(ptsMatch[1].replace(/,/g, "")) : null;
          if (optName && points != null) {
            wargearOptions.push({ name: optName, points });
          }
        }
        continue;
      }

      if (/EPIC HERO/i.test(headingText)) {
        epicHero = true;
      }
    }

    if (tiers.length === 0) continue; // not actually a datasheet card

    const record = {
      name,
      tiers,
      leader,
      support,
      epicHero,
    };
    if (wargearOptions.length) record.wargearOptions = wargearOptions;
    out.push(record);
  }

  return out;
}

function parseTierHeading(text) {
  // Possible patterns:
  //   YOUR UNIT COSTS                     -> { minCount: 1 }
  //   YOUR 1ST UNIT COSTS                 -> { minCount: 1, maxCount: 1 }
  //   YOUR 2ND + UNIT COSTS               -> { minCount: 2 }
  //   YOUR 1ST TO 2ND UNITS COST          -> { minCount: 1, maxCount: 2 }
  //   YOUR 3RD + UNIT COSTS               -> { minCount: 3 }
  const upper = text.toUpperCase();

  const rangeMatch = upper.match(
    /YOUR\s+(\d+)(?:ST|ND|RD|TH)\s+TO\s+(\d+)(?:ST|ND|RD|TH)\s+UNITS?\s+COST/
  );
  if (rangeMatch) {
    return { minCount: Number(rangeMatch[1]), maxCount: Number(rangeMatch[2]) };
  }

  const openEndedMatch = upper.match(
    /YOUR\s+(\d+)(?:ST|ND|RD|TH)\s+\+\s+UNITS?\s+COST/
  );
  if (openEndedMatch) {
    return { minCount: Number(openEndedMatch[1]) };
  }

  const singleNthMatch = upper.match(
    /YOUR\s+(\d+)(?:ST|ND|RD|TH)\s+UNITS?\s+COST/
  );
  if (singleNthMatch) {
    const n = Number(singleNthMatch[1]);
    return { minCount: n, maxCount: n };
  }

  // Default: flat-priced unit
  return { minCount: 1 };
}

function findHeadingNode(doc, text) {
  const headings = doc.querySelectorAll("h3");
  for (const h of headings) {
    if (h.textContent.trim() === text) return h;
  }
  return null;
}
