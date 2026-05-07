import { AuthError } from "../auth/extract.js";
import { getAccessToken, invalidateAccessToken } from "../auth/token-cache.js";
import { env } from "../env.js";

export class FoodvisorApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "FoodvisorApiError";
  }
}

export interface UserContext {
  userId: string;
  refreshToken: string;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | string[] | undefined>;
  body?: unknown;
  /** Internal: prevents recursion on 401 retry. */
  _retried?: boolean;
}

function buildQuery(
  query: RequestOptions["query"],
): string {
  if (!query) return "";
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) sp.append(`${key}[]`, String(v));
    } else {
      sp.append(key, String(value));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function foodvisorRequest<T>(
  ctx: UserContext,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const accessToken = await getAccessToken(ctx.userId, ctx.refreshToken);
  const url = `${env.FOODVISOR_BASE_URL}${env.FOODVISOR_LOCALE_PATH}${path}${buildQuery(opts.query)}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "User-Agent": "foodvisor-mcp/0.1",
  };
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body,
  });

  if (res.status === 401 && !opts._retried) {
    invalidateAccessToken(ctx.userId);
    return foodvisorRequest<T>(ctx, path, { ...opts, _retried: true });
  }

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new AuthError(
        `Foodvisor refused the request (${res.status}). Refresh token may be revoked.`,
        res.status,
      );
    }
    const detail =
      typeof payload === "object" && payload !== null
        ? JSON.stringify(payload)
        : typeof payload === "string"
          ? payload.slice(0, 500)
          : "";
    throw new FoodvisorApiError(
      `Foodvisor API ${res.status} on ${opts.method ?? "GET"} ${path}${detail ? ` — ${detail}` : ""}`,
      res.status,
      payload,
    );
  }

  return payload as T;
}
