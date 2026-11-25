const VALID_ROLES = new Set(["admin", "maintainer", "user"]);
const PAGE_SIZE = 1000;
const MAX_PAGES = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function getOrigin(value) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== value) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function getAppSiteUrl(value, allowedOrigin) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.origin !== allowedOrigin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url.toString();
  } catch {
    return null;
  }
}

function getConfig() {
  const supabaseUrl = getOrigin(process.env.SUPABASE_URL);
  const allowedOrigin = getOrigin(process.env.CORS_ALLOWED_ORIGIN);
  const appSiteUrl = getAppSiteUrl(process.env.APP_SITE_URL, allowedOrigin);
  const supabaseApiKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !allowedOrigin || !appSiteUrl || !supabaseApiKey) {
    throw new ApiError(500, "API configuration is invalid");
  }

  return { supabaseUrl, allowedOrigin, appSiteUrl, supabaseApiKey };
}

function getBearerToken(request) {
  const value = request.headers.authorization;
  const match = typeof value === "string" && value.match(/^Bearer (.+)$/i);
  if (!match) throw new ApiError(401, "Anmeldung erforderlich");
  return match[1];
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(502, "Supabase hat eine ungültige Antwort geliefert");
  }
}

async function supabaseFetch(config, path, options = {}) {
  const {
    accessToken,
    method = "GET",
    body,
    headers: extraHeaders = {},
  } = options;
  const headers = { apikey: config.supabaseApiKey };
  const bearerToken =
    accessToken ??
    (config.supabaseApiKey.startsWith("sb_secret_")
      ? null
      : config.supabaseApiKey);
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  Object.assign(headers, extraHeaders);
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${config.supabaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await readJson(response);

  if (!response.ok) {
    const message =
      typeof data?.msg === "string"
        ? data.msg
        : typeof data?.message === "string"
          ? data.message
          : "Supabase request failed";
    throw new ApiError(response.status, message);
  }

  return data;
}

async function verifyUser(config, accessToken) {
  const user = await supabaseFetch(config, "/auth/v1/user", { accessToken });
  if (!user?.id || !UUID_PATTERN.test(user.id)) {
    throw new ApiError(401, "Sitzung ist ungültig");
  }
  return user;
}

async function getRole(config, userId) {
  const query = new URLSearchParams({
    select: "role,must_change_password",
    user_id: `eq.${userId}`,
    limit: "1",
  });
  const roles = await supabaseFetch(
    config,
    `/rest/v1/user_roles?${query.toString()}`,
  );
  return roles?.[0] ?? null;
}

async function requireAdmin(config, userId) {
  const role = await getRole(config, userId);
  if (!role || role.role !== "admin" || role.must_change_password) {
    throw new ApiError(403, "Admin-Berechtigung erforderlich");
  }
}

async function listRows(config, table, select, order) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams({
      select,
      order,
      limit: String(PAGE_SIZE),
    });
    const start = page * PAGE_SIZE;
    const data = await supabaseFetch(
      config,
      `/rest/v1/${table}?${query.toString()}`,
      {
        headers: { Range: `${start}-${start + PAGE_SIZE - 1}` },
      },
    );
    if (!Array.isArray(data)) {
      throw new ApiError(502, "Supabase hat eine ungültige Antwort geliefert");
    }
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }

  throw new ApiError(502, "Zu viele Datensätze für eine sichere Auflistung");
}

async function listAuthUsers(config) {
  const users = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const query = new URLSearchParams({
      page: String(page),
      per_page: String(PAGE_SIZE),
    });
    const result = await supabaseFetch(
      config,
      `/auth/v1/admin/users?${query.toString()}`,
    );
    if (!Array.isArray(result?.users)) {
      throw new ApiError(502, "Supabase hat eine ungültige Antwort geliefert");
    }
    users.push(...result.users);
    if (result.users.length < PAGE_SIZE) return users;
  }

  throw new ApiError(502, "Zu viele Benutzer für eine sichere Auflistung");
}

async function listAdminData(config) {
  const [authUsers, roles, memberships, families] = await Promise.all([
    listAuthUsers(config),
    listRows(
      config,
      "user_roles",
      "user_id,role,must_change_password",
      "user_id.asc",
    ),
    listRows(config, "family_memberships", "user_id,family_id", "user_id.asc"),
    listRows(config, "families", "id,name", "name.asc"),
  ]);
  const rolesByUser = new Map(roles.map((role) => [role.user_id, role]));
  const familiesByUser = new Map();
  for (const membership of memberships) {
    const familyIds = familiesByUser.get(membership.user_id) ?? [];
    familyIds.push(membership.family_id);
    familiesByUser.set(membership.user_id, familyIds);
  }

  return {
    users: authUsers.map((user) => {
      const role = rolesByUser.get(user.id);
      return {
        id: user.id,
        email: user.email ?? "",
        displayName: user.user_metadata?.display_name ?? "",
        role: role?.role ?? null,
        mustChangePassword: role?.must_change_password ?? false,
        familyIds: familiesByUser.get(user.id) ?? [],
      };
    }),
    families,
  };
}

async function updateRole(config, userId, role) {
  if (!UUID_PATTERN.test(userId) || !VALID_ROLES.has(role)) {
    throw new ApiError(400, "Ungültige Benutzer-ID oder Rolle");
  }
  const query = new URLSearchParams({
    user_id: `eq.${userId}`,
    select: "user_id",
  });
  const updated = await supabaseFetch(
    config,
    `/rest/v1/user_roles?${query.toString()}`,
    {
      method: "PATCH",
      body: { role },
      headers: { Prefer: "return=representation" },
    },
  );
  if (!Array.isArray(updated)) {
    throw new ApiError(502, "Supabase hat eine ungültige Antwort geliefert");
  }
  if (updated.length === 0) {
    await supabaseFetch(config, "/rest/v1/user_roles", {
      method: "POST",
      body: { user_id: userId, role },
      headers: { Prefer: "return=minimal" },
    });
  }
}

async function assignFamily(config, userId, familyId, assigned) {
  if (!UUID_PATTERN.test(userId) || !UUID_PATTERN.test(familyId)) {
    throw new ApiError(400, "Ungültige Benutzer- oder Familien-ID");
  }

  if (assigned) {
    const query = new URLSearchParams({ on_conflict: "family_id,user_id" });
    await supabaseFetch(
      config,
      `/rest/v1/family_memberships?${query.toString()}`,
      {
        method: "POST",
        body: { family_id: familyId, user_id: userId },
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      },
    );
  } else {
    const query = new URLSearchParams({
      family_id: `eq.${familyId}`,
      user_id: `eq.${userId}`,
    });
    await supabaseFetch(
      config,
      `/rest/v1/family_memberships?${query.toString()}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
  }
}

async function deleteUser(config, userId) {
  if (!UUID_PATTERN.test(userId)) {
    throw new ApiError(400, "Ungültige Benutzer-ID");
  }
  await supabaseFetch(config, `/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
  });
}

function normalizeEmail(value) {
  if (typeof value !== "string") {
    throw new ApiError(400, "Bitte eine gültige E-Mail-Adresse angeben");
  }
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "Bitte eine gültige E-Mail-Adresse angeben");
  }
  return email;
}

async function inviteUser(config, body) {
  const email = normalizeEmail(body.email);
  if (!VALID_ROLES.has(body.role)) {
    throw new ApiError(400, "Ungültige Rolle");
  }
  const familyIds = body.familyIds ?? [];
  if (
    !Array.isArray(familyIds) ||
    familyIds.length > 20 ||
    familyIds.some(
      (familyId) =>
        typeof familyId !== "string" || !UUID_PATTERN.test(familyId),
    )
  ) {
    throw new ApiError(400, "Ungültige Familienauswahl");
  }

  const invited = await supabaseFetch(
    config,
    `/auth/v1/invite?redirect_to=${encodeURIComponent(config.appSiteUrl)}`,
    {
      method: "POST",
      body: {
        email,
        data: { display_name: email.split("@")[0] },
      },
    },
  );
  const userId = invited?.id;
  if (!userId || !UUID_PATTERN.test(userId)) {
    throw new ApiError(502, "Supabase hat kein Benutzerkonto zurückgegeben");
  }

  try {
    await supabaseFetch(config, "/rest/v1/user_roles", {
      method: "POST",
      body: {
        user_id: userId,
        role: body.role,
        must_change_password: true,
      },
      headers: { Prefer: "return=minimal" },
    });
    for (const familyId of new Set(familyIds)) {
      await assignFamily(config, userId, familyId, true);
    }
  } catch (error) {
    try {
      await deleteUser(config, userId);
    } catch (cleanupError) {
      console.error("Could not roll back an incomplete invited account", {
        userId,
        status: cleanupError instanceof ApiError ? cleanupError.status : 500,
      });
    }
    throw error;
  }
}

async function setInitialPassword(config, user, body) {
  if (
    typeof body.password !== "string" ||
    body.password.length < 12 ||
    body.password.length > 128
  ) {
    throw new ApiError(400, "Das Passwort muss 12 bis 128 Zeichen lang sein");
  }
  const role = await getRole(config, user.id);
  if (!role || !role.must_change_password) {
    throw new ApiError(403, "Für dieses Konto ist keine Passwortannahme offen");
  }

  await supabaseFetch(config, `/auth/v1/admin/users/${user.id}`, {
    method: "PUT",
    body: { password: body.password },
  });
  const query = new URLSearchParams({
    user_id: `eq.${user.id}`,
  });
  await supabaseFetch(config, `/rest/v1/user_roles?${query.toString()}`, {
    method: "PATCH",
    body: { must_change_password: false },
    headers: { Prefer: "return=minimal" },
  });
}

function readBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") {
    if (request.body.length > 16_384) {
      throw new ApiError(413, "Anfrage ist zu groß");
    }
    try {
      return JSON.parse(request.body);
    } catch {
      throw new ApiError(400, "Ungültiger Anfrageinhalt");
    }
  }
  return {};
}

async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  let config;
  try {
    config = getConfig();
  } catch (error) {
    return response
      .status(error instanceof ApiError ? error.status : 500)
      .json({ error: "API configuration is invalid" });
  }

  const requestOrigin = request.headers.origin;
  if (requestOrigin && requestOrigin !== config.allowedOrigin) {
    return response.status(403).json({ error: "Origin not allowed" });
  }

  response.setHeader("Access-Control-Allow-Origin", config.allowedOrigin);
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  response.setHeader("Vary", "Origin");

  if (request.method === "OPTIONS") {
    return response.status(204).end();
  }
  if (!["GET", "POST"].includes(request.method)) {
    response.setHeader("Allow", "GET, POST, OPTIONS");
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const accessToken = getBearerToken(request);
    const user = await verifyUser(config, accessToken);

    if (request.method === "GET") {
      await requireAdmin(config, user.id);
      return response.status(200).json(await listAdminData(config));
    }

    const body = readBody(request);
    if (body.action === "set_initial_password") {
      await setInitialPassword(config, user, body);
      return response.status(200).json({ status: "ok" });
    }

    await requireAdmin(config, user.id);
    switch (body.action) {
      case "invite":
        await inviteUser(config, body);
        return response.status(201).json({ status: "invited" });
      case "set_role":
        await updateRole(config, body.userId, body.role);
        return response.status(200).json({ status: "updated" });
      case "set_family":
        if (typeof body.assigned !== "boolean") {
          throw new ApiError(400, "Ungültige Familienzuweisung");
        }
        await assignFamily(config, body.userId, body.familyId, body.assigned);
        return response.status(200).json({ status: "updated" });
      case "delete_user":
        await deleteUser(config, body.userId);
        return response.status(200).json({ status: "deleted" });
      default:
        throw new ApiError(400, "Unbekannte Admin-Aktion");
    }
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) {
        return response.status(401).json({ error: "Sitzung ist ungültig" });
      }
      if (
        error.status === 403 &&
        error.message !== "Admin-Berechtigung erforderlich"
      ) {
        return response.status(403).json({ error: error.message });
      }
      if (error.status === 23514 || /last app admin/i.test(error.message)) {
        return response.status(409).json({
          error:
            "Der letzte Admin kann nicht gelöscht oder herabgestuft werden",
        });
      }
      return response.status(error.status).json({ error: error.message });
    }

    console.error("Unexpected admin API error", error);
    return response.status(500).json({ error: "Interner Serverfehler" });
  }
}

module.exports = handler;
module.exports.getConfig = getConfig;
module.exports.getRole = getRole;
module.exports.listAdminData = listAdminData;
