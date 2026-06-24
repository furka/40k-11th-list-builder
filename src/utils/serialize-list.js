const MAP = {
  name: "n",
  faction: "f",
  maxPoints: "m",
  version: "v",
  mfm_version: "mfm",
  detachments: "ds",
  allies: "al",
  sortOrder: "so",
  bonusBattleline: "bb",
};

import { v4 as uuidv4 } from "uuid";

const UNIT_MAP = {
  models: "um",
  name: "un",
  points: "up",
  optionName: "uon",
  // Wargear pseudo-units carry the host's datasheet name so a stale shared URL
  // (or a future MFM upgrade) can still validate the attachment scope.
  parentDataSheet: "upd",
  // attachedTo is stored as the host unit's *array index* (as a string), not
  // its UUID — UUIDs are regenerated when a shared list is deserialized into
  // a new client, so any cross-instance reference must be position-based. The
  // index is rehydrated to the new UUID after the units array is built.
  attachedTo: "uat",
  // Enhancement units carry their parent detachment so removing that
  // detachment can cascade-remove its enhancements. Without it the cascade
  // falls back to name-matching, which breaks when two detachments share an
  // enhancement name.
  detachment: "ud",
  // "1" when the unit was added from an allied faction's datasheet pool,
  // otherwise omitted. Used for visual distinction only — has no rule effect.
  allied: "ua",
  // "1" when the user manually attached this unit via the free-attach override,
  // bypassing the normal Leader/Support restrictions. Carried so a shared list
  // keeps the override (and suppresses the otherwise-illegal-attachment error).
  forcedAttach: "ufa",
  // "1" when the unit was added over its per-list maximum via the bypass
  // override. Carried so a shared list keeps the override (and suppresses the
  // otherwise "Only X allowed" error).
  forcedMax: "ufm",
  // "1" when a duplicate enhancement was added past its per-army limit via the
  // bypass override. Carried so a shared list keeps the override (and
  // suppresses the otherwise "Only X of this enhancement allowed" error).
  forcedLimit: "ufl",
  // Pinned source faction when `allied` is set — required to disambiguate
  // same-named datasheets in different codexes (e.g. INTERCESSOR SQUAD
  // exists in several Space Marine chapters, often at different points).
  alliedFaction: "uaf",
};

const PARSERS = {
  maxPoints: Number,
  models: Number,
  points: Number,
  detachments: (v) => (v ? v.split(",") : []),
  allies: (v) => (v ? v.split(",") : []),
  bonusBattleline: (v) => (v ? v.split("|") : []),
  allied: (v) => v === "1",
  forcedAttach: (v) => v === "1",
  forcedMax: (v) => v === "1",
  forcedLimit: (v) => v === "1",
};

const SERIALIZERS = {
  detachments: (v) => (Array.isArray(v) ? v.join(",") : ""),
  allies: (v) => (Array.isArray(v) ? v.join(",") : ""),
  // `|` separator because datasheet names like "ORDO HERETICUS, PURGATION FORCE"
  // contain commas and would otherwise round-trip incorrectly.
  bonusBattleline: (v) => (Array.isArray(v) ? v.join("|") : ""),
  allied: (v) => (v ? "1" : ""),
  forcedAttach: (v) => (v ? "1" : ""),
  forcedMax: (v) => (v ? "1" : ""),
  forcedLimit: (v) => (v ? "1" : ""),
};

export const serializeList = function (data) {
  const search = new URLSearchParams();

  Object.entries(data).forEach(([key, val]) => {
    if (key in MAP) {
      const out = SERIALIZERS[key] ? SERIALIZERS[key](val) : val;
      search.set(MAP[key], encodeURIComponent(out));
    }
  });

  // Lookup table: unit.id → its array index. Used to encode `attachedTo` as a
  // small integer string instead of a UUID.
  const indexById = new Map();
  data.units.forEach((u, i) => indexById.set(u.id, i));

  data.units.forEach((u) => {
    Object.entries(UNIT_MAP).forEach(([key, sKey]) => {
      let val = u[key];
      if (key === "attachedTo") {
        const idx = val ? indexById.get(val) : undefined;
        val = idx === undefined ? "" : String(idx);
      } else if (SERIALIZERS[key]) {
        val = SERIALIZERS[key](val);
      }
      search.append(sKey, encodeURIComponent(val || ""));
    });
  });

  return "?" + search.toString();
};

export const deserializeList = function (search) {
  const data = { units: [] };

  Object.entries(UNIT_MAP).forEach(([key, sKey]) => {
    const res = search.getAll(sKey);
    for (let i = 0; i < res.length; i++) {
      if (!data.units[i]) data.units[i] = {};
      if (res[i]) data.units[i][key] = parse(key, res[i]);
    }
  });

  Object.entries(MAP).forEach(([key, sKey]) => {
    const res = search.get(sKey);
    if (res) data[key] = parse(key, res);
  });

  // Mint fresh UUIDs for each unit (the serialised form doesn't carry them),
  // then swap each digit-string `attachedTo` for the host unit's new UUID.
  for (const u of data.units) {
    if (!u.id) u.id = uuidv4();
  }
  for (const u of data.units) {
    if (typeof u.attachedTo === "string" && /^\d+$/.test(u.attachedTo)) {
      const host = data.units[Number(u.attachedTo)];
      u.attachedTo = host?.id;
      if (!u.attachedTo) delete u.attachedTo;
    } else if (!u.attachedTo) {
      delete u.attachedTo;
    }
  }

  return data;
};

function parse(key, val) {
  val = decodeURIComponent(val);
  if (PARSERS[key]) return PARSERS[key](val);
  return val;
}
