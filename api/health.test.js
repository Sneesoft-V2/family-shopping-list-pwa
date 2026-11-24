const assert = require("node:assert/strict");
const test = require("node:test");
const handler = require("./health");

const allowedOrigin = "https://sneesoft-v2.github.io";

function createResponse() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

function setAllowedOrigin(t, value) {
  const previous = process.env.CORS_ALLOWED_ORIGIN;
  t.after(() => {
    if (previous === undefined) {
      delete process.env.CORS_ALLOWED_ORIGIN;
    } else {
      process.env.CORS_ALLOWED_ORIGIN = previous;
    }
  });

  if (value === undefined) {
    delete process.env.CORS_ALLOWED_ORIGIN;
  } else {
    process.env.CORS_ALLOWED_ORIGIN = value;
  }
}

test("returns health for the configured origin", (t) => {
  setAllowedOrigin(t, allowedOrigin);
  const response = createResponse();

  handler({ method: "GET", headers: { origin: allowedOrigin } }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { status: "ok" });
  assert.equal(response.headers["access-control-allow-origin"], allowedOrigin);
});

test("rejects requests from a different origin", (t) => {
  setAllowedOrigin(t, allowedOrigin);
  const response = createResponse();

  handler(
    { method: "GET", headers: { origin: "https://example.com" } },
    response,
  );

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { error: "Origin not allowed" });
});

test("answers valid preflight requests", (t) => {
  setAllowedOrigin(t, allowedOrigin);
  const response = createResponse();

  handler({ method: "OPTIONS", headers: { origin: allowedOrigin } }, response);

  assert.equal(response.statusCode, 204);
  assert.equal(response.ended, true);
  assert.equal(response.headers["access-control-allow-origin"], allowedOrigin);
});

test("reports missing or invalid CORS configuration", (t) => {
  setAllowedOrigin(t, undefined);
  const response = createResponse();

  handler({ method: "GET", headers: {} }, response);

  assert.equal(response.statusCode, 500);

  process.env.CORS_ALLOWED_ORIGIN = `${allowedOrigin}/path`;
  const invalidResponse = createResponse();
  handler({ method: "GET", headers: {} }, invalidResponse);

  assert.equal(invalidResponse.statusCode, 500);
});
