const { getWind } = require("../../lib/wind");

exports.handler = async (event) => {
  try {
    const ids = event.queryStringParameters?.ids || "FAOR";
    const data = await getWind(ids);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=120" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: err.status || 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || "Wind request failed." }),
    };
  }
};
