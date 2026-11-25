const assert = require("node:assert/strict");
const test = require("node:test");
const handler = require("../../api/admin/users");

const allowedOrigin = "https://sneesoft-v2.github.io";
const adminId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const familyId = "33333333-3333-4333-8333-333333333333";

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

function setConfig(t) {
  const keys = [
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "CORS_ALLOWED_ORIGIN",
    "APP_SITE_URL",
  ];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  process.env.SUPABASE_URL = "https://project.supabase.co";
  delete process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-test-key";
  process.env.CORS_ALLOWED_ORIGIN = allowedOrigin;
  process.env.APP_SITE_URL = `${allowedOrigin}/family-shopping-list-pwa`;
}

function mockFetch(t, responder) {
  const previous = global.fetch;
  t.after(() => {
    global.fetch = previous;
  });
  global.fetch = async (input, options = {}) => {
    const url = new URL(input);
    const result = await responder(url, {
      ...options,
      method: options.method ?? "GET",
    });
    return new Response(
      result.body === undefined ? "" : JSON.stringify(result.body),
      { status: result.status ?? 200 },
    );
  };
}

function request(method, body) {
  return {
    method,
    headers: {
      authorization: "Bearer user-access-token",
      origin: allowedOrigin,
    },
    body,
  };
}

test("rejects a non-admin before reading admin data", async (t) => {
  setConfig(t);
  let adminListRequested = false;
  let roleRequest;
  mockFetch(t, (url, options) => {
    if (url.pathname === "/auth/v1/user") {
      return { body: { id: userId } };
    }
    if (url.pathname === "/rest/v1/user_roles") {
      roleRequest = options;
      return {
        body: [{ role: "user", must_change_password: false }],
      };
    }
    if (url.pathname === "/auth/v1/admin/users") {
      adminListRequested = true;
      return { body: { users: [] } };
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });

  const response = createResponse();
  await handler(request("GET"), response);

  assert.equal(response.statusCode, 403);
  assert.equal(adminListRequested, false);
  assert.equal(roleRequest.headers.apikey, "server-only-test-key");
  assert.equal(
    roleRequest.headers.Authorization,
    "Bearer server-only-test-key",
  );
});

test("sends a new Supabase secret key only in the apikey header", async (t) => {
  setConfig(t);
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test-key";
  const requests = [];
  mockFetch(t, (url, options) => {
    requests.push({ url, options });
    if (url.pathname === "/auth/v1/user") {
      return { body: { id: adminId } };
    }
    if (url.pathname === "/auth/v1/admin/users") {
      return { body: { users: [] } };
    }
    if (url.pathname === "/rest/v1/user_roles") {
      return {
        body: [
          {
            user_id: adminId,
            role: "admin",
            must_change_password: false,
          },
        ],
      };
    }
    if (
      url.pathname === "/rest/v1/family_memberships" ||
      url.pathname === "/rest/v1/families"
    ) {
      return { body: [] };
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });

  const response = createResponse();
  await handler(request("GET"), response);

  assert.equal(response.statusCode, 200);
  for (const { options } of requests) {
    assert.equal(options.headers.apikey, "sb_secret_test-key");
  }
  const userRequest = requests.find(
    ({ url }) => url.pathname === "/auth/v1/user",
  );
  assert.equal(
    userRequest.options.headers.Authorization,
    "Bearer user-access-token",
  );
  for (const { url, options } of requests) {
    if (url.pathname !== "/auth/v1/user") {
      assert.equal(options.headers.Authorization, undefined);
    }
  }
});

test("invites a user and assigns role before exposing admin success", async (t) => {
  setConfig(t);
  const requests = [];
  mockFetch(t, (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ url, options, body });

    if (url.pathname === "/auth/v1/user") {
      return { body: { id: adminId } };
    }
    if (url.pathname === "/rest/v1/user_roles") {
      if (options.method === "GET") {
        return {
          body: [{ role: "admin", must_change_password: false }],
        };
      }
      return { body: null };
    }
    if (url.pathname === "/auth/v1/invite") {
      return { body: { id: userId } };
    }
    if (url.pathname === "/rest/v1/family_memberships") {
      return { body: null };
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });

  const response = createResponse();
  await handler(
    request("POST", {
      action: "invite",
      email: "  new.user@example.com ",
      role: "maintainer",
      familyIds: [familyId],
    }),
    response,
  );

  assert.equal(response.statusCode, 201);
  const invite = requests.find(({ url }) => url.pathname === "/auth/v1/invite");
  assert.equal(
    invite.url.searchParams.get("redirect_to"),
    `${allowedOrigin}/family-shopping-list-pwa/`,
  );
  assert.deepEqual(invite.body, {
    email: "new.user@example.com",
    data: { display_name: "new.user" },
  });
  const roleInsert = requests.find(
    ({ url, options }) =>
      url.pathname === "/rest/v1/user_roles" && options.method === "POST",
  );
  assert.deepEqual(roleInsert.body, {
    user_id: userId,
    role: "maintainer",
    must_change_password: true,
  });
});

test("sets the invited user's password before allowing app access", async (t) => {
  setConfig(t);
  const requests = [];
  mockFetch(t, (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ url, options, body });

    if (url.pathname === "/auth/v1/user") {
      return { body: { id: userId } };
    }
    if (url.pathname === "/rest/v1/user_roles") {
      if (options.method === "GET") {
        return {
          body: [{ role: "user", must_change_password: true }],
        };
      }
      return { body: null };
    }
    if (url.pathname === `/auth/v1/admin/users/${userId}`) {
      return { body: { id: userId } };
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });

  const response = createResponse();
  await handler(
    request("POST", {
      action: "set_initial_password",
      password: "a-long-initial-password",
    }),
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.equal(
    requests.some(
      ({ url, options, body }) =>
        url.pathname === `/auth/v1/admin/users/${userId}` &&
        options.method === "PUT" &&
        body.password === "a-long-initial-password",
    ),
    true,
  );
  assert.equal(
    requests.some(
      ({ url, options, body }) =>
        url.pathname === "/rest/v1/user_roles" &&
        options.method === "PATCH" &&
        body.must_change_password === false,
    ),
    true,
  );
});

test("maps the database last-admin guard to a conflict", async (t) => {
  setConfig(t);
  mockFetch(t, (url, options) => {
    if (url.pathname === "/auth/v1/user") {
      return { body: { id: adminId } };
    }
    if (url.pathname === "/rest/v1/user_roles") {
      if (options.method === "GET") {
        return {
          body: [{ role: "admin", must_change_password: false }],
        };
      }
      return {
        status: 400,
        body: { message: "The last app admin cannot be removed or demoted" },
      };
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });

  const response = createResponse();
  await handler(
    request("POST", {
      action: "set_role",
      userId: adminId,
      role: "user",
    }),
    response,
  );

  assert.equal(response.statusCode, 409);
  assert.match(response.body.error, /letzte Admin/i);
});

test("rejects an untrusted browser origin before authentication", async (t) => {
  setConfig(t);
  mockFetch(t, () => {
    throw new Error("Fetch must not be called for a disallowed origin");
  });

  const response = createResponse();
  await handler(
    {
      method: "GET",
      headers: { origin: "https://attacker.example" },
    },
    response,
  );

  assert.equal(response.statusCode, 403);
});

test("rejects an app URL on a different origin", async (t) => {
  setConfig(t);
  process.env.APP_SITE_URL =
    "https://attacker.example/family-shopping-list-pwa/";
  mockFetch(t, () => {
    throw new Error("Fetch must not be called for invalid configuration");
  });

  const response = createResponse();
  await handler(request("GET"), response);

  assert.equal(response.statusCode, 500);
  assert.match(response.body.error, /configuration/i);
});
