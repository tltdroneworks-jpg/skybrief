const CACHE_MS = 5 * 60 * 1000;
const USER_AGENT = "Skybrief/1.2 (personal pilot briefing desk)";
const DEFAULT_FIRS = ["FAJA", "FACA"];
const RELATED_FIRS = ["FAJO"];

let cache = { at: 0, payload: null };
let inflight = null;

function parseFirs(input) {
  const raw = String(input || "")
    .split(/[\s,;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{4}$/.test(s));
  const seen = new Set();
  const out = [];
  for (const id of raw.length ? raw : DEFAULT_FIRS) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function formatWhen(unix) {
  if (unix == null || unix === "") return "";
  const date = new Date(unix > 1e12 ? unix : unix * 1000);
  if (Number.isNaN(date.getTime())) return String(unix);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date) + " UTC";
}

async function fetchIsigmets() {
  const res = await fetch("https://aviationweather.gov/api/data/isigmet?format=json", {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (res.status === 204) return [];
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AWC SIGMET HTTP ${res.status}${body ? ": " + body.slice(0, 180) : ""}`);
  }
  const json = await res.json();
  return Array.isArray(json) ? json : json.items || json.data || [];
}

function normalise(row) {
  return {
    firId: row.firId || "",
    firName: row.firName || "",
    icaoId: row.icaoId || "",
    seriesId: row.seriesId || "",
    hazard: row.hazard || "",
    qualifier: row.qualifier || "",
    base: row.base ?? null,
    top: row.top ?? null,
    validFrom: formatWhen(row.validTimeFrom),
    validTo: formatWhen(row.validTimeTo),
    validTimeFrom: row.validTimeFrom,
    validTimeTo: row.validTimeTo,
    coords: row.coords || [],
    raw: row.rawSigmet || row.raw || "",
  };
}

async function getSigmets(input, { refresh = false, includeRelated = true } = {}) {
  const firs = parseFirs(input);
  const watch = new Set(firs);
  if (includeRelated) RELATED_FIRS.forEach((f) => watch.add(f));
  if (!refresh && cache.payload && Date.now() - cache.at < CACHE_MS) {
    const sigmets = cache.payload.all.filter((s) => watch.has(s.firId));
    return {
      firs,
      fetchedAt: cache.payload.fetchedAt,
      cached: true,
      cacheTtlSec: Math.round(CACHE_MS / 1000),
      source: "Aviation Weather Center international SIGMETs (aviationweather.gov)",
      sigmets,
    };
  }
  if (inflight) return inflight;
  inflight = (async () => {
    const rows = await fetchIsigmets();
    const all = rows.map(normalise);
    const fetchedAt = new Date().toISOString();
    cache = { at: Date.now(), payload: { all, fetchedAt } };
    const sigmets = all.filter((s) => watch.has(s.firId));
    return {
      firs,
      fetchedAt,
      cached: false,
      cacheTtlSec: Math.round(CACHE_MS / 1000),
      source: "Aviation Weather Center international SIGMETs (aviationweather.gov)",
      sigmets,
    };
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

module.exports = { getSigmets, parseFirs, DEFAULT_FIRS };
