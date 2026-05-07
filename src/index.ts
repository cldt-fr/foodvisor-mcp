import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import http from "node:http";
import { AuthError, parseRefreshTokenFromHeader } from "./auth/extract.js";
import { env } from "./env.js";
import { FoodvisorApiError } from "./foodvisor/client.js";
import { renderLanding } from "./landing.js";
import { createMcpServer } from "./mcp/server.js";
import {
  handleAuthorizationServerMetadata,
  handleAuthorizeGet,
  handleAuthorizePost,
  handleProtectedResourceMetadata,
  handleRegister,
  handleToken,
} from "./oauth/handlers.js";
import { publicOrigin } from "./oauth/metadata.js";

const MCP_PATH = "/mcp";

function sendJson(
  res: http.ServerResponse,
  status: number,
  payload: unknown,
  extraHeaders: Record<string, string> = {},
): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new AuthError("Invalid JSON body", 400);
  }
}

function unauthorized(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  message: string,
): void {
  const origin = publicOrigin(req);
  const wwwAuth = `Bearer realm="foodvisor-mcp", resource_metadata="${origin}/.well-known/oauth-protected-resource", error="invalid_token", error_description="${message.replace(/"/g, "'")}"`;
  sendJson(res, 401, { error: message }, { "WWW-Authenticate": wwwAuth });
}

async function handleMcp(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  let ctx;
  try {
    ctx = parseRefreshTokenFromHeader(req.headers.authorization);
  } catch (err) {
    if (err instanceof AuthError) {
      unauthorized(req, res, err.message);
      return;
    }
    throw err;
  }

  const body = req.method === "POST" ? await readJsonBody(req) : undefined;

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    transport.close().catch(() => undefined);
  });

  const server = createMcpServer({
    userId: ctx.userId,
    refreshToken: ctx.refreshToken,
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) {
      sendJson(res, 400, { error: "Missing URL" });
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname === "/health" && req.method === "GET") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if ((url.pathname === "/" || url.pathname === "") && req.method === "GET") {
      const html = renderLanding(req);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": Buffer.byteLength(html),
        "Cache-Control": "public, max-age=300",
      });
      res.end(html);
      return;
    }

    if (
      url.pathname === "/.well-known/oauth-protected-resource" &&
      req.method === "GET"
    ) {
      handleProtectedResourceMetadata(req, res);
      return;
    }
    if (
      url.pathname === "/.well-known/oauth-authorization-server" &&
      req.method === "GET"
    ) {
      handleAuthorizationServerMetadata(req, res);
      return;
    }
    if (url.pathname === "/register") {
      await handleRegister(req, res);
      return;
    }
    if (url.pathname === "/authorize") {
      if (req.method === "GET") {
        await handleAuthorizeGet(req, res, url);
        return;
      }
      if (req.method === "POST") {
        await handleAuthorizePost(req, res);
        return;
      }
      sendJson(res, 405, { error: "method_not_allowed" });
      return;
    }
    if (url.pathname === "/token") {
      await handleToken(req, res);
      return;
    }

    if (url.pathname !== MCP_PATH) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    await handleMcp(req, res);
  } catch (err) {
    if (res.headersSent) {
      res.end();
      return;
    }
    if (err instanceof AuthError) {
      if (err.status === 401) {
        unauthorized(req, res, err.message);
      } else {
        sendJson(res, err.status, { error: err.message });
      }
      return;
    }
    if (err instanceof FoodvisorApiError) {
      sendJson(res, 502, {
        error: err.message,
        upstream_status: err.status,
        upstream_body: err.body,
      });
      return;
    }
    console.error("[mcp] unexpected error", err);
    sendJson(res, 500, { error: "Internal server error" });
  }
});

server.listen(env.PORT, () => {
  console.log(
    `[foodvisor-mcp] listening on :${env.PORT}${MCP_PATH} (OAuth ready)`,
  );
});
