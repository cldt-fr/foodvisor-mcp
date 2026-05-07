import { env } from "../env.js";
import { decryptRefreshToken, verifyAccessToken } from "../oauth/jwt.js";

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status = 401,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export interface RefreshTokenPayload {
  token_type: "refresh";
  user_id: string;
  exp: number;
  iat: number;
  jti: string;
}

export interface AccessTokenPayload {
  token_type: "access";
  user_id: string;
  exp: number;
  iat: number;
  jti: string;
}

function base64UrlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? 0 : 4 - (input.length % 4);
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  return Buffer.from(b64, "base64").toString("utf8");
}

export function decodeJwtPayload<T = unknown>(token: string): T {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AuthError("Invalid JWT format");
  }
  try {
    return JSON.parse(base64UrlDecode(parts[1]!)) as T;
  } catch {
    throw new AuthError("Invalid JWT payload");
  }
}

export function extractBearer(authHeader: string | undefined | null): string {
  if (!authHeader) {
    throw new AuthError("Missing Authorization header");
  }
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) {
    throw new AuthError("Authorization header must use Bearer scheme");
  }
  return match[1]!.trim();
}

export interface RefreshContext {
  userId: string;
  refreshToken: string;
}

/**
 * Resolves a Bearer token into a Foodvisor refresh-token context.
 *
 * Two token shapes are accepted:
 *  1. An OAuth-issued JWT (signed with MCP_JWT_SECRET, contains an encrypted Foodvisor refresh).
 *  2. A raw Foodvisor refresh JWT (legacy passthrough mode).
 */
export function parseRefreshTokenFromHeader(
  authHeader: string | undefined | null,
): RefreshContext {
  const token = extractBearer(authHeader);

  // Try our OAuth-issued JWT first.
  const ours = verifyAccessToken(token, env.MCP_JWT_SECRET);
  if (ours) {
    try {
      const fv = decryptRefreshToken(ours.fvr, env.MCP_JWT_SECRET);
      return { userId: ours.sub, refreshToken: fv };
    } catch {
      throw new AuthError("Access token integrity check failed");
    }
  }

  // Fallback: treat as a raw Foodvisor refresh JWT.
  let payload: RefreshTokenPayload;
  try {
    payload = decodeJwtPayload<RefreshTokenPayload>(token);
  } catch (e) {
    throw e instanceof AuthError ? e : new AuthError("Invalid token");
  }
  if (payload.token_type !== "refresh") {
    throw new AuthError(
      "Bearer token must be either an OAuth access token issued by this server or a Foodvisor refresh JWT (not the short-lived access token)",
    );
  }
  if (!payload.user_id || !payload.exp) {
    throw new AuthError("Refresh token payload missing user_id or exp");
  }
  if (payload.exp * 1000 <= Date.now()) {
    throw new AuthError("Refresh token has expired");
  }
  return { userId: payload.user_id, refreshToken: token };
}
