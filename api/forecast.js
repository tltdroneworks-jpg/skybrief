const { getForecast, getPoint } = require("../lib/forecast");

module.exports = async function handler(req, res) {
  try {
    const q = req.query || {};
    const lat = Number(q.lat);
    const lon = Number(q.lon);
    const data =
      Number.isFinite(lat) && Number.isFinite(lon) ? await getPoint(lat, lon) : await getForecast();
    res.setHeader("Cache-Control", "public, max-age=120");
    res.status(200).json(data);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message || "Forecast request failed." });
  }
};
