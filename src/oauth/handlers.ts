import http from "node:http";
import { decodeJwtPayload, RefreshTokenPayload } from "../auth/extract.js";
import { env } from "../env.js";
import { encryptRefreshToken, signAccessToken } from "./jwt.js";
import { renderLoginPage } from "./login.js";
import {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
} from "./metadata.js";
import {
  consumeAuthorizationCode,
  getClient,
  issueAuthorizationCode,
  registerClient,
} from "./store.js";
import crypto from "node:crypto";

function send(
  res: http.ServerResponse,
  status: number,
  body: string,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, {
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  payload: unknown,
  headers: Record<string, string> = {},
): void {
  send(res, status, JSON.stringify(payload), {
    "Content-Type": "application/json",
    ...headers,
  });
}

function sendHtml(res: http.ServerResponse, status: number, html: string): void {
  send(res, status, html, { "Content-Type": "text/html; charset=utf-8" });
}

async function readBody(req: http.IncomingMessage): Promise<{
  json?: unknown;
  form?: URLSearchParams;
  raw: string;
}> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return { raw };
  const ct = (req.headers["content-type"] ?? "").toLowerCase();
  if (ct.includes("application/json")) {
    try {
      return { raw, json: JSON.parse(raw) };
    } catch {
      return { raw };
    }
  }
  if (ct.includes("application/x-www-form-urlencoded")) {
    return { raw, form: new URLSearchParams(raw) };
  }
  return { raw };
}

export function handleProtectedResourceMetadata(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  sendJson(res, 200, buildProtectedResourceMetadata(req));
}

export function handleAuthorizationServerMetadata(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  sendJson(res, 200, buildAuthorizationServerMetadata(req));
}

const REDIRECT_URI_SCHEMA = /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)|[a-z][a-z0-9+.-]*:\/\/)/i;

export async function handleRegister(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }
  const { json } = await readBody(req);
  if (!json || typeof json !== "object") {
    sendJson(res, 400, {
      error: "invalid_client_metadata",
      error_description: "Body must be JSON",
    });
    return;
  }
  const body = json as Record<string, unknown>;
  const redirect_uris = Array.isArray(body.redirect_uris)
    ? (body.redirect_uris as unknown[]).filter(
        (u): u is string => typeof u === "string" && REDIRECT_URI_SCHEMA.test(u),
      )
    : [];
  if (redirect_uris.length === 0) {
    sendJson(res, 400, {
      error: "invalid_redirect_uri",
      error_description: "At least one redirect_uri is required (https or app scheme)",
    });
    return;
  }
  const client_name =
    typeof body.client_name === "string" ? body.client_name : undefined;

  const client = registerClient({ redirect_uris, client_name });
  sendJson(res, 201, client);
}

interface AuthorizeQuery {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  state?: string;
  scope?: string;
  code_challenge: string;
  code_challenge_method: string;
}

function parseAuthorizeParams(
  params: URLSearchParams,
): AuthorizeQuery | { error: string } {
  const need = (k: string) => params.get(k);
  const response_type = need("response_type");
  const client_id = need("client_id");
  const redirect_uri = need("redirect_uri");
  const code_challenge = need("code_challenge");
  const code_challenge_method = need("code_challenge_method");
  if (
    !response_type ||
    !client_id ||
    !redirect_uri ||
    !code_challenge ||
    !code_challenge_method
  ) {
    return { error: "missing_required_parameter" };
  }
  if (response_type !== "code")
    return { error: "unsupported_response_type" };
  if (code_challenge_method !== "S256")
    return { error: "invalid_request: code_challenge_method must be S256" };
  return {
    response_type,
    client_id,
    redirect_uri,
    code_challenge,
    code_challenge_method,
    state: params.get("state") ?? undefined,
    scope: params.get("scope") ?? undefined,
  };
}

function validateClientAndRedirect(
  client_id: string,
  redirect_uri: string,
):
  | { ok: true; client: ReturnType<typeof getClient> }
  | { ok: false; error: string } {
  const client = getClient(client_id);
  if (!client) return { ok: false, error: "unknown client_id" };
  if (!client.redirect_uris.includes(redirect_uri)) {
    return { ok: false, error: "redirect_uri not registered for this client" };
  }
  return { ok: true, client };
}

export async function handleAuthorizeGet(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const parsed = parseAuthorizeParams(url.searchParams);
  if ("error" in parsed) {
    sendHtml(res, 400, `<h1>Invalid authorization request</h1><p>${parsed.error}</p>`);
    return;
  }
  const check = validateClientAndRedirect(parsed.client_id, parsed.redirect_uri);
  if (!check.ok) {
    sendHtml(res, 400, `<h1>Invalid authorization request</h1><p>${check.error}</p>`);
    return;
  }
  const html = renderLoginPage({
    client_id: parsed.client_id,
    client_name: check.client?.client_name,
    redirect_uri: parsed.redirect_uri,
    state: parsed.state,
    code_challenge: parsed.code_challenge,
    code_challenge_method: parsed.code_challenge_method,
    scope: parsed.scope,
  });
  sendHtml(res, 200, html);
}

function buildRedirect(
  redirect_uri: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(redirect_uri);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  return url.toString();
}

async function validateFoodvisorRefreshToken(
  refreshToken: string,
): Promise<{ user_id: string } | { error: string }> {
  let payload: RefreshTokenPayload;
  try {
    payload = decodeJwtPayload<RefreshTokenPayload>(refreshToken);
  } catch {
    return { error: "Invalid JWT format" };
  }
  if (payload.token_type !== "refresh") {
    return {
      error:
        "Token is not a refresh token. Make sure you copy the `tokens.refresh` field, not `tokens.access`.",
    };
  }
  if (!payload.user_id || !payload.exp) {
    return { error: "Refresh token payload missing user_id or exp" };
  }
  if (payload.exp * 1000 <= Date.now()) {
    return { error: "Refresh token has expired" };
  }

  const url = `${env.FOODVISOR_BASE_URL}${env.FOODVISOR_LOCALE_PATH}/user/token/access/refresh/`;
  try {
    const probe = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: refreshToken }),
    });
    if (probe.status === 401 || probe.status === 403) {
      return { error: "Foodvisor rejected this refresh token (revoked or invalid)" };
    }
    if (!probe.ok) {
      return { error: `Foodvisor refresh probe failed: ${probe.status}` };
    }
  } catch (e) {
    return {
      error: `Could not contact Foodvisor: ${(e as Error).message}`,
    };
  }
  return { user_id: payload.user_id };
}

export async function handleAuthorizePost(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const { form } = await readBody(req);
  if (!form) {
    sendJson(res, 400, { error: "invalid_request" });
    return;
  }

  const params = parseAuthorizeParams(form);
  if ("error" in params) {
    sendJson(res, 400, { error: params.error });
    return;
  }
  const check = validateClientAndRedirect(params.client_id, params.redirect_uri);
  if (!check.ok) {
    sendJson(res, 400, { error: "invalid_client", error_description: check.error });
    return;
  }

  const refreshToken = (form.get("refresh_token") ?? "").trim();
  if (!refreshToken) {
    sendHtml(
      res,
      400,
      renderLoginPage({
        client_id: params.client_id,
        client_name: check.client?.client_name,
        redirect_uri: params.redirect_uri,
        state: params.state,
        code_challenge: params.code_challenge,
        code_challenge_method: params.code_challenge_method as "S256",
        scope: params.scope,
        error: "Please paste your Foodvisor refresh token.",
      }),
    );
    return;
  }

  const validation = await validateFoodvisorRefreshToken(refreshToken);
  if ("error" in validation) {
    sendHtml(
      res,
      400,
      renderLoginPage({
        client_id: params.client_id,
        client_name: check.client?.client_name,
        redirect_uri: params.redirect_uri,
        state: params.state,
        code_challenge: params.code_challenge,
        code_challenge_method: params.code_challenge_method as "S256",
        scope: params.scope,
        error: validation.error,
      }),
    );
    return;
  }

  const code = issueAuthorizationCode({
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
    code_challenge: params.code_challenge,
    code_challenge_method: "S256",
    scope: params.scope ?? undefined,
    refresh_token: refreshToken,
    user_id: validation.user_id,
  });

  res.writeHead(302, {
    Location: buildRedirect(params.redirect_uri, {
      code: code.code,
      state: params.state,
    }),
    "Cache-Control": "no-store",
  });
  res.end();
}

function verifyPkce(verifier: string, challenge: string): boolean {
  const hash = crypto.createHash("sha256").update(verifier).digest();
  const expected = hash.toString("base64url");
  if (expected.length !== challenge.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(challenge),
  );
}

export async function handleToken(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }
  const { form, json } = await readBody(req);
  const params: URLSearchParams = form
    ? form
    : new URLSearchParams(
        Object.entries((json as Record<string, string>) ?? {}).filter(
          ([, v]) => typeof v === "string",
        ) as [string, string][],
      );

  const grant_type = params.get("grant_type");
  if (grant_type !== "authorization_code") {
    sendJson(res, 400, {
      error: "unsupported_grant_type",
      error_description: "Only authorization_code is supported",
    });
    return;
  }
  const code = params.get("code");
  const redirect_uri = params.get("redirect_uri");
  const client_id = params.get("client_id");
  const code_verifier = params.get("code_verifier");
  if (!code || !redirect_uri || !client_id || !code_verifier) {
    sendJson(res, 400, { error: "invalid_request" });
    return;
  }

  const entry = consumeAuthorizationCode(code);
  if (!entry) {
    sendJson(res, 400, {
      error: "invalid_grant",
      error_description: "code unknown, expired or already used",
    });
    return;
  }
  if (
    entry.client_id !== client_id ||
    entry.redirect_uri !== redirect_uri
  ) {
    sendJson(res, 400, {
      error: "invalid_grant",
      error_description: "client_id or redirect_uri mismatch",
    });
    return;
  }
  if (!verifyPkce(code_verifier, entry.code_challenge)) {
    sendJson(res, 400, {
      error: "invalid_grant",
      error_description: "PKCE verification failed",
    });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + env.MCP_ACCESS_TOKEN_TTL;
  const access_token = signAccessToken(
    {
      sub: entry.user_id,
      fvr: encryptRefreshToken(entry.refresh_token, env.MCP_JWT_SECRET),
      iat: now,
      exp,
      client_id: entry.client_id,
    },
    env.MCP_JWT_SECRET,
  );

  sendJson(res, 200, {
    access_token,
    token_type: "Bearer",
    expires_in: env.MCP_ACCESS_TOKEN_TTL,
    scope: entry.scope ?? "mcp",
  });
}
