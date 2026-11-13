const { getForecast, getPoint } = require("../../lib/forecast");

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const lat = Number(q.lat);
    const lon = Number(q.lon);
    const data =
      Number.isFinite(lat) && Number.isFinite(lon) ? await getPoint(lat, lon) : await getForecast();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=120" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: err.status || 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || "Forecast request failed." }),
    };
  }
};
