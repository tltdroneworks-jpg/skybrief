/*
 * Skybrief browser-side Open-Meteo client.
 *
 * Fetches Open-Meteo directly from the user's browser (Open-Meteo allows CORS),
 * so each user's own IP and free-tier quota is used instead of the shared
 * server IP. Builds the same data shapes as lib/wind.js and lib/forecast.js
 * (/api/wind, /api/forecast, /api/point). Results are cached in memory and in
 * localStorage for 15 minutes.
 *
 * Weather data by Open-Meteo.com, CC BY 4.0 (https://open-meteo.com/en/license).
 */
(function () {
  "use strict";

  const CACHE_MS = 15 * 60 * 1000;
  const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
  const ATTRIBUTION = "Weather data by Open-Meteo.com";
  const LICENSE = "https://open-meteo.com/en/license";
  const LS_PREFIX = "skybrief:om:v1:";

  // Wind grid (mirrors lib/wind.js)
  const WIND_GRID_SIZE = 5;
  const WIND_GRID_STEP = 0.32;
  const WIND_MAX_POINTS = 80;

  // Forecast grid (mirrors lib/forecast.js)
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

  const memory = new Map();
  const inflight = new Map();

  function cacheGet(key) {
    const hit = memory.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.payload;
    try {
      const raw = window.localStorage.getItem(LS_PREFIX + key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Date.now() - parsed.at < CACHE_MS) {
          memory.set(key, parsed);
          return parsed.payload;
        }
        window.localStorage.removeItem(LS_PREFIX + key);
      }
    } catch {
      /* storage unavailable */
    }
    return null;
  }

  function cacheSet(key, payload) {
    const entry = { at: Date.now(), payload };
    memory.set(key, entry);
    try {
      window.localStorage.setItem(LS_PREFIX + key, JSON.stringify(entry));
    } catch {
      // Quota or private mode: prune our old entries and try once more.
      try {
        for (let i = window.localStorage.length - 1; i >= 0; i--) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith(LS_PREFIX) && k !== LS_PREFIX + key) window.localStorage.removeItem(k);
        }
        window.localStorage.setItem(LS_PREFIX + key, JSON.stringify(entry));
      } catch {
        /* memory cache only */
      }
    }
  }

  function once(key, fn) {
    if (inflight.has(key)) return inflight.get(key);
    const p = fn().finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  async function callOpenMeteo(points, extra) {
    const params = new URLSearchParams({
      latitude: points.map((p) => Number(p.lat).toFixed(4)).join(","),
      longitude: points.map((p) => Number(p.lon).toFixed(4)).join(","),
      wind_speed_unit: "kn",
      timezone: "UTC",
      ...extra,
    });
    const res = await fetch(`${OPEN_METEO}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      let reason = "";
      try {
        const body = await res.json();
        reason = body && body.reason ? `: ${body.reason}` : "";
      } catch {
        /* ignore */
      }
      throw new Error(`Open-Meteo HTTP ${res.status}${reason}`);
    }
    const json = await res.json();
    return Array.isArray(json) ? json : [json];
  }

  /* ---------------- wind grid ---------------- */

  function buildWindGrid(ids, airports) {
    const centres = [];
    for (const icao of ids) {
      const c = airports && airports[icao];
      if (c && Number.isFinite(c.lat) && Number.isFinite(c.lon) && (c.lat || c.lon)) {
        centres.push({ icao, lat: c.lat, lon: c.lon });
      }
    }
    const seen = new Set();
    const points = [];
    const half = (WIND_GRID_SIZE - 1) / 2;
    for (const centre of centres) {
      for (let i = 0; i < WIND_GRID_SIZE; i++) {
        for (let j = 0; j < WIND_GRID_SIZE; j++) {
          const lat = Math.round((centre.lat + (i - half) * WIND_GRID_STEP) * 10000) / 10000;
          const lon = Math.round((centre.lon + (j - half) * WIND_GRID_STEP) * 10000) / 10000;
          const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          points.push({ lat, lon, near: centre.icao });
          if (points.length >= WIND_MAX_POINTS) return { centres, points };
        }
      }
    }
    return { centres, points };
  }

  function currentWind(block) {
    const current = block.current || {};
    if (current.wind_speed_10m != null && current.wind_direction_10m != null) {
      return {
        time: current.time || null,
        speedKt: current.wind_speed_10m,
        dirDeg: current.wind_direction_10m,
        gustKt: current.wind_gusts_10m ?? null,
      };
    }
    return null;
  }

  async function getWind(ids, airports) {
    const list = (ids || []).filter(Boolean);
    const { centres, points } = buildWindGrid(list.length ? list : ["FAOR"], airports || {});
    if (!points.length) throw new Error("No coordinates available for those airports.");
    const key = "wind:" + points.map((p) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`).join("|");
    const hit = cacheGet(key);
    if (hit) return { ...hit, cached: true };
    return once(key, async () => {
      const blocks = await callOpenMeteo(points, {
        current: "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
        forecast_days: "1",
      });
      const windPoints = blocks
        .map((block, i) => {
          const now = currentWind(block) || {};
          return {
            lat: block.latitude ?? points[i].lat,
            lon: block.longitude ?? points[i].lon,
            speedKt: now.speedKt ?? null,
            dirDeg: now.dirDeg ?? null,
            gustKt: now.gustKt ?? null,
            time: now.time || null,
            near: points[i] && points[i].near,
          };
        })
        .filter((p) => p.speedKt != null && p.dirDeg != null);
      const payload = {
        ids: list,
        centres,
        points: windPoints,
        fetchedAt: new Date().toISOString(),
        cached: false,
        cacheTtlSec: CACHE_MS / 1000,
        source: "Open-Meteo",
        via: "browser",
        attribution: ATTRIBUTION,
        license: LICENSE,
      };
      cacheSet(key, payload);
      return payload;
    });
  }

  /* ---------------- forecast grid and point ---------------- */

  function buildAxis(min, max, step) {
    const out = [];
    for (let v = min; v <= max + 1e-9; v = Math.round((v + step) * 1000) / 1000) {
      out.push(Math.round(v * 1000) / 1000);
    }
    return out;
  }

  function hourStamp(date) {
    return date.toISOString().slice(0, 13) + ":00";
  }

  function wantedTimes() {
    const start = new Date();
    start.setUTCMinutes(0, 0, 0);
    const times = [];
    for (let h = 0; h <= 48; h++) times.push(hourStamp(new Date(start.getTime() + h * 3600 * 1000)));
    return times;
  }

  function roundVal(name, value) {
    if (value == null || Number.isNaN(Number(value))) return null;
    const n = Number(value);
    if (name === "convective_cloud_base" && n < 0) return null;
    if (name === "cloud_cover" || name.startsWith("cloud_cover_") || name === "wind_direction_10m") return Math.round(n);
    if (name === "visibility" || name === "convective_cloud_base") return Math.round(n);
    return Math.round(n * 10) / 10;
  }

  function extractHourly(block, wanted) {
    const hourly = block.hourly || {};
    const times = hourly.time || [];
    const index = new Map(times.map((t, i) => [String(t).slice(0, 13) + ":00", i]));
    const out = {};
    for (const name of HOURLY_VARS) {
      const src = hourly[name] || [];
      out[name] = wanted.map((t) => {
        const i = index.get(t);
        return i == null ? null : roundVal(name, src[i]);
      });
    }
    return out;
  }

  function unitsFrom(block) {
    const raw = (block && block.hourly_units) || {};
    const units = {};
    for (const name of HOURLY_VARS) units[name] = raw[name] || null;
    return units;
  }

  function hourlyParams() {
    return { hourly: HOURLY_VARS.join(","), forecast_days: "3" };
  }

  async function getForecast() {
    const wanted = wantedTimes();
    const key = "forecast:" + wanted[0];
    const hit = cacheGet(key);
    if (hit) return { ...hit, cached: true };
    return once(key, async () => {
      const lats = buildAxis(BOUNDS.south, BOUNDS.north, STEP);
      const lons = buildAxis(BOUNDS.west, BOUNDS.east, STEP);
      const points = [];
      for (const lat of lats) for (const lon of lons) points.push({ lat, lon });
      // Same batching as the server: ceil(252 / 100) = 3 requests, run in parallel.
      const slices = [];
      for (let i = 0; i < points.length; i += BATCH) slices.push(points.slice(i, i + BATCH));
      const parts = await Promise.all(slices.map((s) => callOpenMeteo(s, hourlyParams())));
      const blocks = [];
      parts.forEach((part, k) => {
        if (part.length !== slices[k].length) {
          throw new Error(`Open-Meteo returned ${part.length} locations, expected ${slices[k].length}.`);
        }
        blocks.push(...part);
      });
      const fields = {};
      for (const name of HOURLY_VARS) fields[name] = new Array(wanted.length * points.length).fill(null);
      for (let p = 0; p < points.length; p++) {
        const ex = extractHourly(blocks[p], wanted);
        for (const name of HOURLY_VARS) {
          const series = ex[name];
          for (let t = 0; t < wanted.length; t++) fields[name][t * points.length + p] = series[t];
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
        cacheTtlSec: CACHE_MS / 1000,
        source: "Open-Meteo",
        via: "browser",
        attribution: ATTRIBUTION,
        license: LICENSE,
      };
      cacheSet(key, payload);
      return payload;
    });
  }

  function pointKey(lat, lon) {
    const rLat = Math.round(Number(lat) / 0.05) * 0.05;
    const rLon = Math.round(Number(lon) / 0.05) * 0.05;
    return `${rLat.toFixed(2)},${rLon.toFixed(2)}`;
  }

  async function getPoint(lat, lon) {
    const nLat = Number(lat);
    const nLon = Number(lon);
    if (!Number.isFinite(nLat) || !Number.isFinite(nLon) || Math.abs(nLat) > 90 || Math.abs(nLon) > 180) {
      throw new Error("Provide valid lat and lon.");
    }
    const wanted = wantedTimes();
    const key = `point:${pointKey(nLat, nLon)}:${wanted[0]}`;
    const hit = cacheGet(key);
    if (hit) return { ...hit, lat: nLat, lon: nLon, cached: true };
    const payload = await once(key, async () => {
      const blocks = await callOpenMeteo([{ lat: nLat, lon: nLon }], hourlyParams());
      const hourly = extractHourly(blocks[0], wanted);
      const out = {
        lat: nLat,
        lon: nLon,
        times: wanted,
        hourly,
        units: unitsFrom(blocks[0]),
        fetchedAt: new Date().toISOString(),
        cached: false,
        cacheTtlSec: CACHE_MS / 1000,
        source: "Open-Meteo",
        via: "browser",
        attribution: ATTRIBUTION,
        license: LICENSE,
      };
      cacheSet(key, out);
      return out;
    });
    return { ...payload, lat: nLat, lon: nLon };
  }

  window.SkyOpenMeteo = { getWind, getForecast, getPoint, CACHE_MS, HOURLY_VARS, BOUNDS };
})();
