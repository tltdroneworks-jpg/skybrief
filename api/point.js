const { getPoint } = require("../lib/forecast");

module.exports = async function handler(req, res) {
  try {
    const q = req.query || {};
    const data = await getPoint(q.lat, q.lon);
    res.setHeader("Cache-Control", "public, max-age=120");
    res.status(200).json(data);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message || "Point forecast request failed." });
  }
};
