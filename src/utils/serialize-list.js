const MAP = {
  name: "n",
  faction: "f",
  maxPoints: "m",
  version: "v",
  mfm_version: "mfm",
  detachments: "ds",
};

const UNIT_MAP = {
  models: "um",
  name: "un",
  points: "up",
  optionName: "uon",
};

const PARSERS = {
  maxPoints: Number,
  models: Number,
  points: Number,
  detachments: (v) => (v ? v.split(",") : []),
};

const SERIALIZERS = {
  detachments: (v) => (Array.isArray(v) ? v.join(",") : ""),
};

export const serializeList = function (data) {
  const search = new URLSearchParams();

  Object.entries(data).forEach(([key, val]) => {
    if (key in MAP) {
      const out = SERIALIZERS[key] ? SERIALIZERS[key](val) : val;
      search.set(MAP[key], encodeURIComponent(out));
    }
  });

  data.units.forEach((u) => {
    Object.entries(UNIT_MAP).forEach(([key, sKey]) => {
      const val = u[key];
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

  return data;
};

function parse(key, val) {
  val = decodeURIComponent(val);
  if (PARSERS[key]) return PARSERS[key](val);
  return val;
}
