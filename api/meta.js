const { AIRPORTS, WEBCAMS, PRESETS } = require("../lib/airports");
const { configuredProviders, setupGuide } = require("../lib/notams");
const { loadAirspace, SOURCE_PAGE } = require("../lib/airspace");

module.exports = async function handler(_req, res) {
  const providers = configuredProviders();
  const air = loadAirspace();
  res.setHeader("Cache-Control", "public, max-age=60");
  res.status(200).json({
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
};
