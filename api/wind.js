const { getWind } = require("../lib/wind");

module.exports = async function handler(req, res) {
  try {
    const ids = (req.query && req.query.ids) || "FAOR";
    const data = await getWind(ids);
    res.setHeader("Cache-Control", "public, max-age=120");
    res.status(200).json(data);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message || "Wind request failed." });
  }
};
