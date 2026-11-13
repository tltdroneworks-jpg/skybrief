const { getWeather } = require("../../lib/weather");

exports.handler = async (event) => {
  try {
    const ids = event.queryStringParameters?.ids || "FAOR";
    const refresh = event.queryStringParameters?.refresh === "1";
    const data = await getWeather(ids, { refresh });
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: err.status || 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || "Weather request failed." }),
    };
  }
};
