const { getPoint } = require("../../lib/forecast");

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const data = await getPoint(q.lat, q.lon);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=120" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: err.status || 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || "Point forecast request failed." }),
    };
  }
};
