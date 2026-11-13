const handler = require("../../api/meta");
exports.handler = async () => {
  let status = 200;
  const headers = {};
  let body;
  const res = {
    setHeader(k, v) { headers[k] = v; },
    status(c) { status = c; return this; },
    json(obj) { body = JSON.stringify(obj); return this; },
  };
  await handler({}, res);
  return { statusCode: status, headers: { "Content-Type": "application/json", ...headers }, body };
};
