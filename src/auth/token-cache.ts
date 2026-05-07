import { env } from "../env.js";
import {
  AccessTokenPayload,
  AuthError,
  decodeJwtPayload,
} from "./extract.js";

interface CachedAccess {
  accessToken: string;
  expiresAt: Date;
}

const cache = new Map<string, CachedAccess>();
const inflight = new Map<string, Promise<CachedAccess>>();

const SAFETY_WINDOW_MS = 30_000;

function isFresh(entry: CachedAccess): boolean {
  return entry.expiresAt.getTime() - SAFETY_WINDOW_MS > Date.now();
}

async function refreshAccessToken(refreshToken: string): Promise<CachedAccess> {
  const url = `${env.FOODVISOR_BASE_URL}${env.FOODVISOR_LOCALE_PATH}/user/token/access/refresh/`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "foodvisor-mcp/0.1",
    },
    body: JSON.stringify({ refresh: refreshToken }),
  });

  if (res.status === 401 || res.status === 403) {
    throw new AuthError(
      "Foodvisor rejected the refresh token (expired or revoked)",
      401,
    );
  }
  if (!res.ok) {
    throw new AuthError(
      `Foodvisor refresh failed: ${res.status} ${res.statusText}`,
      502,
    );
  }

  const body = (await res.json()) as { access?: string };
  if (!body.access) {
    throw new AuthError("Foodvisor refresh response missing access token", 502);
  }

  const payload = decodeJwtPayload<AccessTokenPayload>(body.access);
  return {
    accessToken: body.access,
    expiresAt: new Date(payload.exp * 1000),
  };
}

export async function getAccessToken(
  userId: string,
  refreshToken: string,
): Promise<string> {
  const cached = cache.get(userId);
  if (cached && isFresh(cached)) {
    return cached.accessToken;
  }

  const existing = inflight.get(userId);
  if (existing) {
    return (await existing).accessToken;
  }

  const promise = refreshAccessToken(refreshToken)
    .then((entry) => {
      cache.set(userId, entry);
      return entry;
    })
    .finally(() => {
      inflight.delete(userId);
    });

  inflight.set(userId, promise);
  return (await promise).accessToken;
}

export function invalidateAccessToken(userId: string): void {
  cache.delete(userId);
}
