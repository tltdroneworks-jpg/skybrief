const { getWeather, parseIds } = require("../lib/weather");
const { getNotams } = require("../lib/notams");
const { getSigmets } = require("../lib/sigmets");
const { airspaceNotes } = require("../lib/airspace");
const { weatherPdf } = require("../lib/pdf");
const { composeRoute } = require("../lib/route");

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

module.exports = async function handler(req, res) {
  try {
    const q = req.query || {};
    const route = composeRoute({ dep: q.dep, dest: q.dest, alts: q.alts, ids: q.ids });
    const ids = route.ids.length ? route.ids : parseIds(q.ids || "FAOR");
    const includeNotams = q.notams === "1" || q.notams === "true";
    const includeSigmets = q.sigmets === "1" || q.sigmets === "true";
    const includeAirspace = q.airspace === "1" || q.airspace === "true";
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
      const lat = Number(q.lat);
      const lon = Number(q.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        options.airspaceNotes = airspaceNotes(lat, lon);
      } else {
        options.airspaceNotes = {
          text: "Airspace / drone notes were requested but no map point (lat/lon) was provided.",
        };
      }
    }
    const { title, buffer } = weatherPdf(data, options);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${title}-${pdfStamp()}SAST.pdf"`);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(buffer);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message || "PDF request failed." });
  }
};
