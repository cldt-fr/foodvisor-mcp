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
  refreshExpiresAt: Date;
}

export function parseRefreshTokenFromHeader(
  authHeader: string | undefined | null,
): RefreshContext {
  const token = extractBearer(authHeader);
  const payload = decodeJwtPayload<RefreshTokenPayload>(token);
  if (payload.token_type !== "refresh") {
    throw new AuthError(
      "Bearer token must be a Foodvisor refresh token (use the long-lived refresh JWT, not the short-lived access token)",
    );
  }
  const exp = new Date(payload.exp * 1000);
  if (exp.getTime() <= Date.now()) {
    throw new AuthError("Refresh token has expired");
  }
  return {
    userId: payload.user_id,
    refreshToken: token,
    refreshExpiresAt: exp,
  };
}
