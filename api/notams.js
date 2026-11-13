const { getNotams } = require("../lib/notams");

module.exports = async function handler(req, res) {
  try {
    const ids = (req.query && req.query.ids) || "FAOR";
    const refresh = req.query && (req.query.refresh === "1" || req.query.refresh === "true");
    const data = await getNotams(ids, { refresh });
    res.setHeader("Cache-Control", data.configured ? "public, max-age=120" : "no-store");
    res.status(200).json(data);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message || "NOTAM request failed." });
  }
};
