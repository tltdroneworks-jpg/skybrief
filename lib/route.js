const { parseIds } = require("./weather");
const { firFor } = require("./airports");

function composeRoute({ dep, dest, alts, ids } = {}) {
  const depId = parseIds(dep || "")[0] || "";
  const destId = parseIds(dest || "")[0] || "";
  const altIds = parseIds(alts || "");
  const extraIds = parseIds(ids || "");
  const list = parseIds([depId, destId, ...altIds, ...extraIds].join(","));
  const firs = [...new Set(list.map((id) => firFor(id)))];
  if (!firs.length) firs.push("FAJA");
  return {
    dep: depId,
    dest: destId,
    alts: altIds,
    extras: extraIds,
    ids: list.length ? list : [],
    firs,
  };
}

module.exports = { composeRoute };
