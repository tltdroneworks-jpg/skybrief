const CACHE_MS = 2 * 60 * 1000;
const SOURCE = "https://api.rainviewer.com/public/weather-maps.json";
const USER_AGENT = "Skybrief/1.3 (personal pilot briefing desk)";

let cache = null;
let inflight = null;

function frameList(arr, kind) {
  return (arr || [])
    .filter((f) => f && (f.path || f.time))
    .map((f) => ({
      time: Number(f.time) || null,
      path: f.path,
      kind,
    }));
}

async function getRadar() {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return { ...cache.payload, cached: true };
  }
  if (inflight) return inflight;

  inflight = (async () => {
    const res = await fetch(SOURCE, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`RainViewer HTTP ${res.status}${body ? `: ${body.slice(0, 180)}` : ""}`);
    }
    const json = await res.json();
    const host = String(json.host || "https://tilecache.rainviewer.com").replace(/\/$/, "");
    const radar = json.radar || {};
    const satellite = json.satellite || {};
    const past = frameList(radar.past, "past");
    const nowcast = frameList(radar.nowcast, "nowcast");
    const infrared = frameList(satellite.infrared, "infrared");
    const payload = {
      version: json.version || null,
      generated: json.generated || null,
      host,
      frames: [...past, ...nowcast],
      past,
      nowcast,
      satellite: { infrared },
      tile: {
        size: 256,
        color: 2,
        colorName: "Universal Blue",
        options: "1_1",
        maxZoom: 7,
        template: "{host}{path}/{size}/{z}/{x}/{y}/{color}/{options}.png",
      },
      coveragePath: "/v2/coverage/0",
      nowcastAvailable: nowcast.length > 0,
      infraredAvailable: infrared.length > 0,
      fetchedAt: new Date().toISOString(),
      cached: false,
      cacheTtlSec: Math.round(CACHE_MS / 1000),
      source: "RainViewer",
      attribution: "Weather data by RainViewer",
      sourceUrl: "https://www.rainviewer.com/",
      terms: "https://www.rainviewer.com/api.html",
      notes:
        "Free RainViewer Weather Maps API, personal and educational use. Past radar is about 2 hours at 10-minute steps. Nowcast and infrared satellite were withdrawn from the free API on 1 Jan 2026; they are included only if the feed still lists frames. Colour scheme is Universal Blue (id 2). Tiles are limited to zoom 7.",
    };
    cache = { at: Date.now(), payload };
    return payload;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

module.exports = { getRadar, CACHE_MS };
