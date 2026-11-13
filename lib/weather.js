const CACHE_MS = 5 * 60 * 1000;
const AWC_BASE = "https://aviationweather.gov/api/data";
const USER_AGENT = "PilotWeatherDesk/1.0 (personal briefing helper; +https://aviationweather.gov/data/api/)";

const cache = new Map();
const inflight = new Map();
let lastAwcCall = 0;
const MIN_AWC_GAP_MS = 300;

function parseIds(input) {
  const seen = new Set();
  const ids = [];
  const raw = Array.isArray(input) ? input.join(",") : String(input || "");
  for (const part of raw.split(/[\s,;]+/)) {
    const id = part.trim().toUpperCase();
    if (/^[A-Z]{4}$/.test(id) && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids.slice(0, 8);
}

function cacheKey(ids) {
  return [...ids].sort().join(",");
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

async function awcGet(path, ids) {
  const wait = MIN_AWC_GAP_MS - (Date.now() - lastAwcCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastAwcCall = Date.now();
  const url = `${AWC_BASE}/${path}?ids=${encodeURIComponent(ids.join(","))}&format=json`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AWC ${path} HTTP ${res.status}${body ? `: ${body.slice(0, 180)}` : ""}`);
  }
  return res.json();
}

function summariseMetar(m) {
  const bits = [];
  if (m.fltCat) bits.push(m.fltCat);
  const dir = m.wdir == null ? null : String(m.wdir);
  if (dir && m.wspd != null) {
    const gust = m.wgst != null ? `G${m.wgst}` : "";
    bits.push(`Wind ${dir === "VRB" ? "VRB" : String(dir).padStart(3, "0")}° at ${m.wspd}${gust} kt`);
  }
  if (m.visib != null) {
    const vis = String(m.visib);
    bits.push(`Vis ${vis}${vis.includes("+") || /[A-Za-z]/.test(vis) ? "" : " SM"}`);
  }
  if (m.cover) bits.push(`Sky ${m.cover}`);
  if (m.temp != null && m.dewp != null) bits.push(`Temp ${m.temp}°C / dew ${m.dewp}°C`);
  if (m.altim != null) {
    const hpa = m.altim > 200 ? Math.round(m.altim) : Math.round(m.altim * 33.8639);
    bits.push(`QNH ${hpa} hPa`);
  }
  return bits.join(" · ") || "Decoded fields not provided.";
}

function normalise(ids, metarJson, tafJson, fetchedAt, cached) {
  const metars = asArray(metarJson)
    .map((m) => ({
      icao: String(m.icaoId || "").toUpperCase(),
      raw: m.rawOb || "",
      name: m.name || "",
      fltCat: m.fltCat || "",
      summary: summariseMetar(m),
      lat: typeof m.lat === "number" ? m.lat : null,
      lon: typeof m.lon === "number" ? m.lon : null,
      elev: m.elev ?? null,
      reportTime: m.reportTime || null,
      source: "AWC",
    }))
    .filter((m) => m.icao);

  const tafs = asArray(tafJson)
    .map((t) => ({
      icao: String(t.icaoId || "").toUpperCase(),
      raw: String(t.rawTAF || t.raw || "").replace(/\s+/g, " ").trim(),
      name: t.name || "",
      issueTime: t.issueTime || null,
      source: "AWC",
    }))
    .filter((t) => t.icao && t.raw);

  const missing = ids.filter(
    (id) => !metars.some((m) => m.icao === id) && !tafs.some((t) => t.icao === id)
  );

  return {
    ids,
    fetchedAt,
    cached,
    cacheTtlSec: Math.round(CACHE_MS / 1000),
    source: "Aviation Weather Center (aviationweather.gov)",
    metars,
    tafs,
    missing,
  };
}

async function loadFresh(ids) {
  const [metarJson, tafJson] = await Promise.all([
    awcGet("metar", ids),
    awcGet("taf", ids),
  ]);
  const fetchedAt = new Date().toISOString();
  const payload = normalise(ids, metarJson, tafJson, fetchedAt, false);
  cache.set(cacheKey(ids), { at: Date.now(), payload });
  return payload;
}

async function getWeather(input, { refresh = false } = {}) {
  const ids = parseIds(input);
  if (!ids.length) {
    const err = new Error("Provide at least one 4-letter ICAO code.");
    err.status = 400;
    throw err;
  }
  const key = cacheKey(ids);
  const hit = cache.get(key);
  if (!refresh && hit && Date.now() - hit.at < CACHE_MS) {
    return { ...hit.payload, cached: true, fetchedAt: hit.payload.fetchedAt };
  }
  if (inflight.has(key)) return inflight.get(key);
  const pending = loadFresh(ids).finally(() => inflight.delete(key));
  inflight.set(key, pending);
  return pending;
}

module.exports = { parseIds, getWeather, CACHE_MS };
