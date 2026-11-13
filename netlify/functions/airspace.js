const handler = require("../../api/airspace");
exports.handler = async (event) => {
  const req = { query: event.queryStringParameters || {} };
  let status = 200;
  const headers = {};
  let body;
  const res = {
    setHeader(k, v) { headers[k] = v; },
    status(c) { status = c; return this; },
    json(obj) { body = JSON.stringify(obj); return this; },
    send(buf) { body = buf; return this; },
  };
  try {
    await handler(req, res);
    const out = { statusCode: status, headers };
    if (Buffer.isBuffer(body)) {
      out.isBase64Encoded = true;
      out.body = body.toString("base64");
    } else {
      if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
      out.body = body || "";
    }
    return out;
  } catch (err) {
    return { statusCode: err.status || 502, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: err.message }) };
  }
};
