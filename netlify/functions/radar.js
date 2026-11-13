const { getRadar } = require("../../lib/radar");

exports.handler = async () => {
  try {
    const data = await getRadar();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: err.status || 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || "Radar request failed." }),
    };
  }
};
