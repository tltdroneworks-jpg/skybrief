const { getSigmets } = require("../lib/sigmets");
const { composeRoute } = require("../lib/route");

module.exports = async function handler(req, res) {
  try {
    const route = composeRoute({
      dep: req.query && req.query.dep,
      dest: req.query && req.query.dest,
      alts: req.query && req.query.alts,
      ids: req.query && req.query.ids,
    });
    const firs = (req.query && req.query.firs) || route.firs.join(",");
    const refresh = req.query && (req.query.refresh === "1" || req.query.refresh === "true");
    const data = await getSigmets(firs, { refresh });
    res.setHeader("Cache-Control", "public, max-age=60");
    res.status(200).json(data);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message || "SIGMET request failed." });
  }
};
