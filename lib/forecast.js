const CACHE_MS = 15 * 60 * 1000;
const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
const USER_AGENT = "Skybrief/1.3.2 (personal pilot briefing desk)";
const BATCH = 100;
const STEP = 1;
const BOUNDS = { south: -35, north: -22, west: 16, east: 33 };
const HOURLY_VARS = [
  "temperature_2m",
  "precipitation",
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "visibility",
  "convective_cloud_base",
];
const ATTRIBUTION = "Weather data by Open-Meteo.com";
const LICENSE = "https://open-meteo.com/en/license";

const gridCache = { at: 0, payload: null };
let gridInflight = null;
const pointCache = new Map();
const pointInflight = new Map();

function buildAxis(min, max, step) {
  const out = [];
  for (let v = min; v <= max + 1e-9; v = Math.round((v + step) * 1000) / 1000) {
    out.push(Math.round(v * 1000) / 1000);
  }
  return out;
}

function buildGrid() {
  const lats = buildAxis(BOUNDS.south, BOUNDS.north, STEP);
  const lons = buildAxis(BOUNDS.west, BOUNDS.east, STEP);
  const points = [];
  for (const lat of lats) {
    for (const lon of lons) {
      points.push({ lat, lon });
    }
  }
  return { lats, lons, points };
}

function currentHourUtc() {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  return d;
}

function hourStamp(date) {
  return date.toISOString().slice(0, 13) + ":00";
}

function wantedTimes() {
  const start = currentHourUtc();
  const times = [];
  for (let h = 0; h <= 48; h++) {
    times.push(hourStamp(new Date(start.getTime() + h * 3600 * 1000)));
  }
  return times;
}

function roundVal(name, value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const n = Number(value);
  if (name === "convective_cloud_base" && n < 0) return null;
  if (name === "cloud_cover" || name.startsWith("cloud_cover_") || name === "wind_direction_10m") {
    return Math.round(n);
  }
  if (name === "visibility" || name === "convective_cloud_base") {
    return Math.round(n);
  }
  return Math.round(n * 10) / 10;
}

async function fetchOpenMeteo(points, { forecastDays = 3 } = {}) {
  const lats = points.map((p) => Number(p.lat).toFixed(4)).join(",");
  const lons = points.map((p) => Number(p.lon).toFixed(4)).join(",");
  const params = new URLSearchParams({
    latitude: lats,
    longitude: lons,
    hourly: HOURLY_VARS.join(","),
    wind_speed_unit: "kn",
    forecast_days: String(forecastDays),
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

function extractHourly(block, wanted) {
  const hourly = block.hourly || {};
  const times = hourly.time || [];
  const index = new Map(times.map((t, i) => [String(t).slice(0, 13) + ":00", i]));
  const out = { times: wanted, units: block.hourly_units || {} };
  for (const name of HOURLY_VARS) {
    const src = hourly[name] || [];
    out[name] = wanted.map((t) => {
      const i = index.get(t);
      if (i == null) return null;
      return roundVal(name, src[i]);
    });
  }
  return out;
}

async function fetchBatched(points) {
  const blocks = new Array(points.length);
  for (let i = 0; i < points.length; i += BATCH) {
    const slice = points.slice(i, i + BATCH);
    const part = await fetchOpenMeteo(slice);
    if (part.length !== slice.length) {
      throw new Error(`Open-Meteo returned ${part.length} locations, expected ${slice.length}.`);
    }
    for (let j = 0; j < part.length; j++) blocks[i + j] = part[j];
  }
  return blocks;
}

function unitsFrom(block) {
  const raw = (block && block.hourly_units) || {};
  const units = {};
  for (const name of HOURLY_VARS) units[name] = raw[name] || null;
  return units;
}

async function getForecast() {
  if (gridCache.payload && Date.now() - gridCache.at < CACHE_MS) {
    return { ...gridCache.payload, cached: true };
  }
  if (gridInflight) return gridInflight;

  gridInflight = (async () => {
    const { lats, lons, points } = buildGrid();
    const wanted = wantedTimes();
    const blocks = await fetchBatched(points);
    const fields = {};
    for (const name of HOURLY_VARS) {
      fields[name] = new Array(wanted.length * points.length).fill(null);
    }
    for (let p = 0; p < points.length; p++) {
      const extracted = extractHourly(blocks[p], wanted);
      for (const name of HOURLY_VARS) {
        const series = extracted[name];
        for (let t = 0; t < wanted.length; t++) {
          fields[name][t * points.length + p] = series[t];
        }
      }
    }
    const payload = {
      bounds: { ...BOUNDS },
      step: STEP,
      lats,
      lons,
      times: wanted,
      pointCount: points.length,
      fields,
      units: unitsFrom(blocks[0]),
      fetchedAt: new Date().toISOString(),
      cached: false,
      cacheTtlSec: Math.round(CACHE_MS / 1000),
      source: "Open-Meteo",
      attribution: ATTRIBUTION,
      license: LICENSE,
    };
    gridCache.at = Date.now();
    gridCache.payload = payload;
    return payload;
  })().finally(() => {
    gridInflight = null;
  });

  return gridInflight;
}

function pointKey(lat, lon) {
  const rLat = Math.round(Number(lat) / 0.05) * 0.05;
  const rLon = Math.round(Number(lon) / 0.05) * 0.05;
  return `${rLat.toFixed(2)},${rLon.toFixed(2)}`;
}

async function getPoint(lat, lon) {
  const nLat = Number(lat);
  const nLon = Number(lon);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLon) || nLat < -90 || nLat > 90 || nLon < -180 || nLon > 180) {
    const err = new Error("Provide valid lat and lon.");
    err.status = 400;
    throw err;
  }
  const key = pointKey(nLat, nLon);
  const hit = pointCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return { ...hit.payload, lat: nLat, lon: nLon, cached: true };
  }
  if (pointInflight.has(key)) {
    const payload = await pointInflight.get(key);
    return { ...payload, lat: nLat, lon: nLon, cached: true };
  }

  const pending = (async () => {
    const wanted = wantedTimes();
    const blocks = await fetchOpenMeteo([{ lat: nLat, lon: nLon }]);
    const extracted = extractHourly(blocks[0], wanted);
    const hourly = {};
    for (const name of HOURLY_VARS) hourly[name] = extracted[name];
    const payload = {
      lat: nLat,
      lon: nLon,
      times: wanted,
      hourly,
      units: unitsFrom(blocks[0]),
      fetchedAt: new Date().toISOString(),
      cached: false,
      cacheTtlSec: Math.round(CACHE_MS / 1000),
      source: "Open-Meteo",
      attribution: ATTRIBUTION,
      license: LICENSE,
    };
    pointCache.set(key, { at: Date.now(), payload });
    return payload;
  })().finally(() => pointInflight.delete(key));

  pointInflight.set(key, pending);
  const payload = await pending;
  return { ...payload, lat: nLat, lon: nLon };
}

module.exports = { getForecast, getPoint, CACHE_MS, BOUNDS, HOURLY_VARS };
