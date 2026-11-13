const fs = require("fs");
const path = require("path");
const express = require("express");
const { AIRPORTS, WEBCAMS, PRESETS } = require("./lib/airports");
const { getWeather, parseIds } = require("./lib/weather");
const { weatherPdf } = require("./lib/pdf");
const { getWind } = require("./lib/wind");
const { getRadar } = require("./lib/radar");
const { getForecast, getPoint } = require("./lib/forecast");
const zlib = require("zlib");
const { getNotams, configuredProviders, setupGuide } = require("./lib/notams");
const { getSigmets } = require("./lib/sigmets");
const { loadAirspace, queryPoint, airspaceNotes, SOURCE_PAGE } = require("./lib/airspace");
const { composeRoute } = require("./lib/route");

function loadDotEnv() {
  const file = path.join(__dirname, ".env");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") process.env[key] = val;
  }
}
loadDotEnv();

const app = express();
const PORT = Number(process.env.PORT) || 3847;

app.set("trust proxy", 1);
app.use(express.json({ limit: "32kb" }));

function sendError(res, err, fallback) {
  const status = err.status || 502;
  res.status(status).json({ error: err.message || fallback });
}

function sendJson(req, res, data, cacheControl) {
  const body = JSON.stringify(data);
  if (cacheControl) res.set("Cache-Control", cacheControl);
  res.type("application/json");
  if (/\bgzip\b/.test(String(req.headers["accept-encoding"] || ""))) {
    res.set("Content-Encoding", "gzip");
    res.send(zlib.gzipSync(Buffer.from(body)));
    return;
  }
  res.send(body);
}


function pdfStamp() {
  return new Date()
    .toLocaleString("en-CA", {
      timeZone: "Africa/Johannesburg",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(/[^0-9]+/g, "-");
}

function routeFromReq(req) {
  return composeRoute({
    dep: req.query.dep,
    dest: req.query.dest,
    alts: req.query.alts,
    ids: req.query.ids,
  });
}

function idsFromReq(req) {
  const route = routeFromReq(req);
  return route.ids.length ? route.ids : parseIds(req.query.ids || "FAOR");
}

app.get("/api/health", (_req, res) => {
  const air = loadAirspace();
  res.json({
    ok: true,
    service: "pilot-weather-site",
    notamProviders: configuredProviders(),
    airspaceCycle: air.meta.cycle || null,
    airspaceFeatures: air.meta.featureCount || (air.geojson.features || []).length,
  });
});

app.get("/api/meta", (_req, res) => {
  const providers = configuredProviders();
  const air = loadAirspace();
  res.json({
    airports: AIRPORTS,
    webcams: WEBCAMS,
    presets: PRESETS,
    notams: {
      configured: providers.length > 0,
      providers,
      setup: providers.length ? null : setupGuide(),
    },
    airspace: {
      available: (air.geojson.features || []).length > 0,
      cycle: air.meta.cycle || null,
      counts: air.meta.counts || {},
      sourceUrl: air.meta.sourceUrl || SOURCE_PAGE,
      attribution: air.meta.attribution || "",
      part101: air.meta.part101 || null,
    },
  });
});

app.get("/api/weather", async (req, res) => {
  try {
    const ids = idsFromReq(req);
    const data = await getWeather(ids.join(",") || "FAOR", {
      refresh: req.query.refresh === "1" || req.query.refresh === "true",
    });
    res.set("Cache-Control", "public, max-age=60");
    res.json(data);
  } catch (err) {
    sendError(res, err, "Weather request failed.");
  }
});

app.get("/api/wind", async (req, res) => {
  try {
    const ids = idsFromReq(req);
    const data = await getWind(ids.join(",") || "FAOR");
    res.set("Cache-Control", "public, max-age=120");
    res.json(data);
  } catch (err) {
    sendError(res, err, "Wind request failed.");
  }
});

app.get("/api/radar", async (req, res) => {
  try {
    const data = await getRadar();
    sendJson(req, res, data, "public, max-age=60");
  } catch (err) {
    sendError(res, err, "Radar request failed.");
  }
});

app.get("/api/forecast", async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const data =
      Number.isFinite(lat) && Number.isFinite(lon) ? await getPoint(lat, lon) : await getForecast();
    sendJson(req, res, data, "public, max-age=120");
  } catch (err) {
    sendError(res, err, "Forecast request failed.");
  }
});

app.get("/api/point", async (req, res) => {
  try {
    const data = await getPoint(req.query.lat, req.query.lon);
    sendJson(req, res, data, "public, max-age=120");
  } catch (err) {
    sendError(res, err, "Point forecast request failed.");
  }
});


app.get("/api/notams", async (req, res) => {
  try {
    const ids = idsFromReq(req);
    const data = await getNotams(ids.join(",") || "FAOR", {
      refresh: req.query.refresh === "1" || req.query.refresh === "true",
    });
    res.set("Cache-Control", data.configured ? "public, max-age=120" : "no-store");
    res.json(data);
  } catch (err) {
    sendError(res, err, "NOTAM request failed.");
  }
});

app.get("/api/sigmets", async (req, res) => {
  try {
    const route = routeFromReq(req);
    const firs = req.query.firs || route.firs.join(",");
    const data = await getSigmets(firs, {
      refresh: req.query.refresh === "1" || req.query.refresh === "true",
    });
    res.set("Cache-Control", "public, max-age=60");
    res.json(data);
  } catch (err) {
    sendError(res, err, "SIGMET request failed.");
  }
});

app.get("/api/airspace", (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    res.set("Cache-Control", "no-store");
    res.json(queryPoint(lat, lon));
    return;
  }
  const air = loadAirspace();
  const types = String(req.query.types || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  let geojson = air.geojson;
  if (types.length) {
    geojson = {
      type: "FeatureCollection",
      features: (air.geojson.features || []).filter((f) => types.includes(f.properties?.class)),
    };
  }
  res.set("Cache-Control", "public, max-age=86400");
  res.json({ meta: air.meta, geojson });
});

app.get("/api/airspace/query", (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: "Provide lat and lon." });
    return;
  }
  res.set("Cache-Control", "no-store");
  res.json(queryPoint(lat, lon));
});

app.get("/api/briefing", async (req, res) => {
  try {
    const route = routeFromReq(req);
    const ids = route.ids.length ? route.ids : ["FAOR"];
    const refresh = req.query.refresh === "1" || req.query.refresh === "true";
    const [weather, notams, sigmets] = await Promise.all([
      getWeather(ids.join(","), { refresh }),
      getNotams(ids.join(","), { refresh }).catch((err) => ({
        configured: false,
        ids,
        notams: [],
        error: err.message,
      })),
      getSigmets(route.firs.join(","), { refresh }),
    ]);
    let airspace = null;
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      airspace = airspaceNotes(lat, lon);
    }
    res.set("Cache-Control", "public, max-age=60");
    res.json({ route: { ...route, ids }, weather, notams, sigmets, airspace });
  } catch (err) {
    sendError(res, err, "Briefing request failed.");
  }
});

app.get("/api/pdf", async (req, res) => {
  try {
    const route = routeFromReq(req);
    const ids = route.ids.length ? route.ids : parseIds(req.query.ids || "FAOR");
    const includeNotams = req.query.notams === "1" || req.query.notams === "true";
    const includeSigmets = req.query.sigmets === "1" || req.query.sigmets === "true";
    const includeAirspace = req.query.airspace === "1" || req.query.airspace === "true";
    const data = await getWeather(ids.join(","));
    const options = { route };
    if (includeNotams) {
      try {
        options.notams = await getNotams(ids.join(","));
      } catch (err) {
        options.notams = { configured: false, ids, notams: [], error: err.message };
      }
    }
    if (includeSigmets) {
      try {
        options.sigmets = await getSigmets(route.firs.join(","));
      } catch (err) {
        options.sigmets = { firs: route.firs, sigmets: [], error: err.message };
      }
    }
    if (includeAirspace) {
      const lat = Number(req.query.lat);
      const lon = Number(req.query.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        options.airspaceNotes = airspaceNotes(lat, lon);
      } else {
        options.airspaceNotes = {
          text: "Airspace / drone notes were requested but no map point (lat/lon) was provided. Click a point on the Skybrief map, then download the pack again.",
        };
      }
    }
    const { title, buffer } = weatherPdf(data, options);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${title}-${pdfStamp()}SAST.pdf"`,
      "Cache-Control": "no-store",
    });
    res.send(buffer);
  } catch (err) {
    sendError(res, err, "PDF request failed.");
  }
});

app.get("/api/icaos", (req, res) => {
  res.json({ ...routeFromReq(req), ids: idsFromReq(req) });
});

app.get("/sw.js", (req, res) => {
  res.set("Cache-Control", "no-cache");
  res.type("application/javascript");
  res.sendFile(path.join(__dirname, "public", "sw.js"));
});

app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));
app.use("/data", express.static(path.join(__dirname, "data"), { maxAge: "1d" }));

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const server = app.listen(PORT, "0.0.0.0", () => {
  const providers = configuredProviders();
  const air = loadAirspace();
  console.log(`Pilot weather desk running on http://127.0.0.1:${PORT}`);
  console.log(
    providers.length
      ? `NOTAM providers configured: ${providers.join(", ")}`
      : "No NOTAM API credentials configured. Live NOTAM text will stay empty until AUTOROUTER_*, FAA_* or ICAO_API_KEY is set."
  );
  console.log(
    air.meta.featureCount
      ? `ATNS airspace loaded: ${air.meta.featureCount} features, cycle ${air.meta.cycle || "unknown"}`
      : "ATNS airspace GeoJSON missing. Run python3 scripts/convert-atns.py"
  );
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
