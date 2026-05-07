import crypto from "node:crypto";

export interface RegisteredClient {
  client_id: string;
  client_id_issued_at: number;
  redirect_uris: string[];
  client_name?: string;
  token_endpoint_auth_method: "none";
  grant_types: ["authorization_code"];
  response_types: ["code"];
}

export interface AuthorizationCode {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: "S256";
  scope?: string;
  refresh_token: string;
  user_id: string;
  expires_at: number;
}

const clients = new Map<string, RegisteredClient>();
const codes = new Map<string, AuthorizationCode>();

const CODE_TTL_MS = 5 * 60 * 1000;

export function registerClient(input: {
  redirect_uris: string[];
  client_name?: string;
}): RegisteredClient {
  const client_id = `fvmcp_${crypto.randomBytes(18).toString("base64url")}`;
  const client: RegisteredClient = {
    client_id,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: input.redirect_uris,
    ...(input.client_name ? { client_name: input.client_name } : {}),
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code"],
    response_types: ["code"],
  };
  clients.set(client_id, client);
  return client;
}

export function getClient(client_id: string): RegisteredClient | undefined {
  return clients.get(client_id);
}

export function issueAuthorizationCode(
  data: Omit<AuthorizationCode, "code" | "expires_at">,
): AuthorizationCode {
  const code = crypto.randomBytes(32).toString("base64url");
  const entry: AuthorizationCode = {
    ...data,
    code,
    expires_at: Date.now() + CODE_TTL_MS,
  };
  codes.set(code, entry);
  return entry;
}

export function consumeAuthorizationCode(
  code: string,
): AuthorizationCode | null {
  const entry = codes.get(code);
  if (!entry) return null;
  codes.delete(code);
  if (entry.expires_at < Date.now()) return null;
  return entry;
}

setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of codes) {
    if (entry.expires_at < now) codes.delete(code);
  }
}, 60_000).unref();
