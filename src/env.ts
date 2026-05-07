import crypto from "node:crypto";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  FOODVISOR_BASE_URL: z.string().url().default("https://api.foodvisor.io"),
  FOODVISOR_LOCALE_PATH: z.string().default("/api/6.0/ios/FR/fr_FR"),
  /** Public origin where this server is reachable (e.g. https://foodvisor-mcp.example.com).
   *  Optional: if unset, derived per-request from Host + X-Forwarded-Proto. */
  MCP_PUBLIC_URL: z.string().url().optional(),
  /** HMAC secret used to sign OAuth-issued access tokens. Min 32 chars.
   *  If unset, a random one is generated at startup (logs warn — tokens lost on restart). */
  MCP_JWT_SECRET: z.string().min(32).optional(),
  /** Access token lifetime issued by /token, in seconds. Default 30 days. */
  MCP_ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
});

const parsed = schema.parse(process.env);

let jwtSecret = parsed.MCP_JWT_SECRET;
if (!jwtSecret) {
  jwtSecret = crypto.randomBytes(48).toString("base64url");
  console.warn(
    "[foodvisor-mcp] MCP_JWT_SECRET not set — generated a random one. OAuth-issued tokens will be invalidated on every restart. Set MCP_JWT_SECRET to a stable 32+ char value in production.",
  );
}

export const env = {
  ...parsed,
  MCP_JWT_SECRET: jwtSecret,
};
export type Env = typeof env;
