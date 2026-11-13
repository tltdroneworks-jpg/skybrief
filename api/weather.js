const { getWeather } = require("../lib/weather");

module.exports = async function handler(req, res) {
  try {
    const ids = (req.query && req.query.ids) || "FAOR";
    const refresh = req.query && (req.query.refresh === "1" || req.query.refresh === "true");
    const data = await getWeather(ids, { refresh });
    res.setHeader("Cache-Control", "public, max-age=60");
    res.status(200).json(data);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message || "Weather request failed." });
  }
};
