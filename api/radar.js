const { getRadar } = require("../lib/radar");

module.exports = async function handler(req, res) {
  try {
    const data = await getRadar();
    res.setHeader("Cache-Control", "public, max-age=60");
    res.status(200).json(data);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message || "Radar request failed." });
  }
};
