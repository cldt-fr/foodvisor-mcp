# foodvisor-mcp

A remote [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the [Foodvisor](https://www.foodvisor.io) nutrition API to LLM agents (Claude, Cursor, …). Search foods, log meals, fetch progress and macros — all from your assistant.

> **Disclaimer.** This project is **unofficial**. It uses Foodvisor's private mobile API by reverse-engineering its requests and is not endorsed by Foodvisor. Use at your own risk; endpoints may change without notice.

## Features

- 🥗 **Catalog search** with calories, macros, brand, image, Nutriscore.
- 📒 **Log meals** (breakfast/lunch/dinner/snack/custom_*) with quantities and serving multipliers.
- 📊 **Daily summary** — server-side aggregation of calories and macros vs. your targets.
- 📈 **Progress** — daily calories, weight and grade history (≈90 days).
- 🔥 **Streak** — current consecutive logging days and freezes available.
- 💧 **Hydration log**.
- 👤 **Profile & nutritional goals** — per-weekday calorie/macro targets.
- 🔐 **OAuth 2.1 + PKCE** with dynamic client registration — works as a one-click [Claude](https://claude.ai) connector.
- 🔄 **Stateless multi-user**: tokens are self-contained (no database). Foodvisor refresh tokens are encrypted (AES-256-GCM) inside the OAuth-issued JWT.
- ♻️ **Automatic access-token refresh** with in-memory caching and stampede protection.

## Available MCP tools

| Tool | Description |
|---|---|
| `search_food` | Search the Foodvisor catalog by free-text query. |
| `get_food_details` | Full nutritional info (macros, vitamins, units) for one or more `food_id`s. |
| `log_meal` | Add foods to a meal slot on a given date. |
| `list_meals` | Logged meals on a date range. |
| `get_daily_summary` | Total calories/macros for a day vs. your targets. |
| `get_progress` | Daily calories, weight and Foodvisor grade for ~90 days. |
| `get_fv_grade_distribution` | Share of A/B/C/D meals over rolling 7/30/90 day windows. |
| `get_streak` | Current logging streak and freezes. |
| `get_water_log` | Daily water intake on a date range. |
| `get_profile` | Profile and nutritional goals. |

## Quick start with Docker

```bash
git clone https://github.com/cldt-fr/foodvisor-mcp.git
cd foodvisor-mcp
docker compose up -d
```

The server now listens on `http://localhost:3000/mcp`. Health probe at `/health`.

To run behind a reverse proxy (Caddy, Traefik, nginx) on a public domain, just terminate TLS in front of port 3000.

## Authentication

`foodvisor-mcp` supports two ways to authenticate, both backed by the **same** underlying credential — your Foodvisor **refresh token**:

1. **OAuth 2.1 (recommended)** — the server is a full OAuth authorization server with dynamic client registration and PKCE. Compatible MCP clients (Claude, Cursor, …) handle the flow automatically: they discover the auth endpoints, register themselves, and open a login page where you paste your Foodvisor refresh token once. The server then issues its own JWT with your refresh token AES-256-GCM-encrypted inside.
2. **Direct Bearer (power-user)** — pass your Foodvisor refresh JWT directly as `Authorization: Bearer …`. Useful for scripts or quick tests. The server detects the token shape and proxies as before.

Either way, no per-user state is stored on the server: the OAuth-issued JWT is self-contained and the legacy mode is purely passthrough.

### Obtaining your Foodvisor refresh token

Foodvisor only authenticates via Apple Sign-In on iOS — there is no public OAuth or password endpoint. Capture the `POST /user/auth/` response on a real iPhone with [Charles Proxy](https://www.charlesproxy.com) (or [Proxyman](https://proxyman.io), mitmproxy, …) configured as an HTTPS man-in-the-middle:

1. Install Charles' root certificate on your iPhone and enable full trust.
2. Force-quit and reopen the Foodvisor app, then sign in.
3. Look for a `POST https://api.foodvisor.io/api/6.0/ios/FR/fr_FR/user/auth/` request. The JSON response contains `tokens.refresh` — that's your long-lived credential (≈ 6 months).

Refresh tokens give full access to your nutrition history. **Treat them like passwords.**

## Configuring an MCP client

### Claude (web / Desktop / Code) — OAuth

Add the server as a connector with its public `/mcp` URL (e.g. `https://foodvisor-mcp.example.com/mcp`). Claude will:

1. Discover the OAuth metadata at `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`.
2. Register itself via `POST /register`.
3. Open the `/authorize` page in your browser. **Paste your Foodvisor refresh token** in the form and submit.
4. Exchange the returned code for a long-lived access token (default 30 days).

After that you can use the tools directly from Claude. When the access token expires, Claude re-runs the flow.

### Direct Bearer (any MCP client speaking Streamable HTTP)

```json
{
  "mcpServers": {
    "foodvisor": {
      "url": "https://foodvisor-mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_FOODVISOR_REFRESH_TOKEN>"
      }
    }
  }
}
```

## Local development

Requires Node ≥ 22.

```bash
npm install
npm run dev      # tsx watch on $PORT (default 3000)
npm run typecheck
npm run build && npm start
```

### Project layout

```
src/
├── index.ts                  # Node http server + per-request MCP transport + OAuth routes
├── env.ts                    # zod-validated env vars
├── auth/
│   ├── extract.ts            # Bearer parsing — accepts OAuth JWT and legacy Foodvisor refresh
│   └── token-cache.ts        # Foodvisor access-token cache + refresh
├── oauth/
│   ├── jwt.ts                # HS256 sign/verify + AES-256-GCM encrypt/decrypt
│   ├── store.ts              # in-memory clients + auth codes (TTL)
│   ├── login.ts              # HTML login page (paste refresh token)
│   ├── handlers.ts           # /register, /authorize, /token handlers
│   └── metadata.ts           # /.well-known/* metadata builders
├── foodvisor/
│   ├── client.ts             # fetch wrapper with 401 retry
│   ├── endpoints.ts          # typed endpoint helpers
│   └── types.ts              # response shapes
└── mcp/
    ├── server.ts             # createMcpServer(ctx)
    └── tools/                # one file per tool group
        ├── food.ts
        ├── meal.ts
        ├── progress.ts
        ├── trackers.ts
        └── profile.ts
```

The HTTP server is intentionally minimal (no Express/Hono) — each `POST /mcp` spins up a fresh `McpServer` bound to the caller's `userId`/`refreshToken` and a stateless `StreamableHTTPServerTransport`.

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |
| `MCP_PUBLIC_URL` | derived | Public origin (e.g. `https://foodvisor-mcp.example.com`). Used in OAuth metadata. If unset, derived per-request from `Host` + `X-Forwarded-Proto`. |
| `MCP_JWT_SECRET` | random | HMAC secret used to sign OAuth-issued tokens. Min 32 chars. **Set explicitly in production** — otherwise tokens are invalidated on every restart. |
| `MCP_ACCESS_TOKEN_TTL` | `2592000` | Lifetime of OAuth access tokens, in seconds (default 30 days). |
| `FOODVISOR_BASE_URL` | `https://api.foodvisor.io` | Override only for testing |
| `FOODVISOR_LOCALE_PATH` | `/api/6.0/ios/FR/fr_FR` | Locale path prefix used by upstream |

Generate a stable secret with:

```bash
openssl rand -base64 48
```

## Security notes

- The server is a **trusted proxy** to Foodvisor: anyone holding a valid Foodvisor refresh token can use it to read and **write** that user's nutrition data. Front the `/mcp` endpoint with HTTPS in production and consider IP allowlists if it is exposed publicly.
- Tokens are kept **in process memory only**. They are never persisted to disk.
- The token cache is keyed by the JWT's `user_id`, so concurrent requests from the same user share a single access token; concurrent refresh attempts coalesce via an in-flight map.

## Roadmap

- Photo-based meal recognition (Foodvisor's killer feature) once the upload endpoint is reverse-engineered.
- Activities log, weigh-ins, custom recipes & favorites.
- Optional persistent token store for resilience across restarts.

## Contributing

Issues and PRs welcome at <https://github.com/cldt-fr/foodvisor-mcp>. Please don't open issues asking for help reverse-engineering Foodvisor endpoints; capture them yourself with Charles/Proxyman and contribute a typed wrapper.

## License

MIT — see [LICENSE](./LICENSE).
