const { loadAirspace, queryPoint } = require("../lib/airspace");

module.exports = async function handler(req, res) {
  try {
    if (req.query && req.query.lat && req.query.lon) {
      const lat = Number(req.query.lat);
      const lon = Number(req.query.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        res.status(400).json({ error: "Provide lat and lon." });
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json(queryPoint(lat, lon));
      return;
    }
    const air = loadAirspace();
    const types = String((req.query && req.query.types) || "")
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
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.status(200).json({ meta: air.meta, geojson });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message || "Airspace request failed." });
  }
};
