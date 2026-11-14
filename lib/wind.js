const { AIRPORTS } = require("./airports");
const { parseIds } = require("./weather");

const CACHE_MS = 15 * 60 * 1000;
const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
const USER_AGENT = "Skybrief/1.3.2 (personal pilot briefing desk)";
const GRID_SIZE = 5;
const GRID_STEP = 0.32; // ~35 km
const MAX_POINTS = 80;

const cache = new Map();
const inflight = new Map();

function airportCoords(icao) {
  const known = AIRPORTS[icao];
  if (known) return { icao, lat: known.lat, lon: known.lon, name: known.name };
  return null;
}

function buildGrid(ids, coordOverride = {}) {
  const centres = [];
  for (const icao of ids) {
    const c = coordOverride[icao] || airportCoords(icao);
    if (c && Number.isFinite(c.lat) && Number.isFinite(c.lon) && (c.lat || c.lon)) {
      centres.push({ icao, lat: c.lat, lon: c.lon });
    }
  }
  const seen = new Set();
  const points = [];
  const half = (GRID_SIZE - 1) / 2;
  for (const centre of centres) {
    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE; j++) {
        const lat = Math.round((centre.lat + (i - half) * GRID_STEP) * 10000) / 10000;
        const lon = Math.round((centre.lon + (j - half) * GRID_STEP) * 10000) / 10000;
        const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        points.push({ lat, lon, near: centre.icao });
        if (points.length >= MAX_POINTS) return { centres, points };
      }
    }
  }
  return { centres, points };
}

function currentHour(block) {
  const current = block.current || {};
  if (current.wind_speed_10m != null && current.wind_direction_10m != null) {
    return {
      time: current.time || null,
      speedKt: current.wind_speed_10m,
      dirDeg: current.wind_direction_10m,
      gustKt: current.wind_gusts_10m ?? null,
    };
  }
  // Fallback: first hourly step if current is missing.
  const hourly = block.hourly || {};
  const times = hourly.time || [];
  if (!times.length) return null;
  return {
    time: times[0],
    speedKt: (hourly.wind_speed_10m || [])[0],
    dirDeg: (hourly.wind_direction_10m || [])[0],
    gustKt: (hourly.wind_gusts_10m || [])[0] ?? null,
  };
}

async function fetchOpenMeteo(points) {
  const lats = points.map((p) => p.lat.toFixed(4)).join(",");
  const lons = points.map((p) => p.lon.toFixed(4)).join(",");
  const params = new URLSearchParams({
    latitude: lats,
    longitude: lons,
    current: "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
    wind_speed_unit: "kn",
    forecast_days: "1",
    timezone: "UTC",
  });
  const res = await fetch(`${OPEN_METEO}?${params.toString()}`, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Open-Meteo HTTP ${res.status}${body ? `: ${body.slice(0, 180)}` : ""}`);
  }
  const json = await res.json();
  return Array.isArray(json) ? json : [json];
}

async function getWind(input, coordOverride = {}) {
  const ids = parseIds(input);
  if (!ids.length) {
    const err = new Error("Provide at least one 4-letter ICAO code.");
    err.status = 400;
    throw err;
  }
  const { centres, points } = buildGrid(ids, coordOverride);
  if (!points.length) {
    const err = new Error("No coordinates available for those airports, so a wind grid cannot be built.");
    err.status = 400;
    throw err;
  }
  const key = points.map((p) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`).join("|");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return { ...hit.payload, cached: true };
  }
  if (inflight.has(key)) return inflight.get(key);

  const pending = (async () => {
    const blocks = await fetchOpenMeteo(points);
    const windPoints = blocks.map((block, i) => {
      const now = currentHour(block) || {};
      return {
        lat: block.latitude ?? points[i].lat,
        lon: block.longitude ?? points[i].lon,
        speedKt: now.speedKt ?? null,
        dirDeg: now.dirDeg ?? null,
        gustKt: now.gustKt ?? null,
        time: now.time || null,
        near: points[i].near,
      };
    }).filter((p) => p.speedKt != null && p.dirDeg != null);

    const payload = {
      ids,
      centres,
      points: windPoints,
      fetchedAt: new Date().toISOString(),
      cached: false,
      cacheTtlSec: Math.round(CACHE_MS / 1000),
      source: "Open-Meteo",
      attribution: "Weather data by Open-Meteo.com",
      license: "https://open-meteo.com/en/license",
    };
    cache.set(key, { at: Date.now(), payload });
    return payload;
  })().finally(() => inflight.delete(key));

  inflight.set(key, pending);
  return pending;
}

module.exports = { getWind, CACHE_MS, buildGrid };
