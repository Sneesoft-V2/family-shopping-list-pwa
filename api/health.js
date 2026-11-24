function getAllowedOrigin() {
  const value = process.env.CORS_ALLOWED_ORIGIN;

  if (!value) {
    return null;
  }

  let parsedOrigin;
  try {
    parsedOrigin = new URL(value);
  } catch (error) {
    if (error instanceof TypeError) {
      return null;
    }

    throw error;
  }

  if (
    !["http:", "https:"].includes(parsedOrigin.protocol) ||
    parsedOrigin.origin !== value
  ) {
    return null;
  }

  return value;
}

function handler(request, response) {
  const allowedOrigin = getAllowedOrigin();

  if (!allowedOrigin) {
    return response.status(500).json({ error: "API configuration is invalid" });
  }

  const requestOrigin = request.headers.origin;
  if (requestOrigin && requestOrigin !== allowedOrigin) {
    return response.status(403).json({ error: "Origin not allowed" });
  }

  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  response.setHeader("Vary", "Origin");

  if (request.method === "OPTIONS") {
    return response.status(204).end();
  }

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, OPTIONS");
    return response.status(405).json({ error: "Method not allowed" });
  }

  return response.status(200).json({ status: "ok" });
}

module.exports = handler;
