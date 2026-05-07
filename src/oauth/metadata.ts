import http from "node:http";
import { env } from "../env.js";

export function publicOrigin(req: http.IncomingMessage): string {
  if (env.MCP_PUBLIC_URL) return env.MCP_PUBLIC_URL.replace(/\/$/, "");
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() ||
    "http";
  const host = req.headers.host ?? "localhost";
  return `${proto}://${host}`;
}

export function buildProtectedResourceMetadata(
  req: http.IncomingMessage,
): Record<string, unknown> {
  const origin = publicOrigin(req);
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    scopes_supported: ["mcp"],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://github.com/cldt-fr/foodvisor-mcp",
  };
}

export function buildAuthorizationServerMetadata(
  req: http.IncomingMessage,
): Record<string, unknown> {
  const origin = publicOrigin(req);
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    registration_endpoint: `${origin}/register`,
    scopes_supported: ["mcp"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    service_documentation: "https://github.com/cldt-fr/foodvisor-mcp",
  };
}
