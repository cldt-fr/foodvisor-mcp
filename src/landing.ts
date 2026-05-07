import http from "node:http";
import { publicOrigin } from "./oauth/metadata.js";

export function renderLanding(req: http.IncomingMessage): string {
  const origin = publicOrigin(req);
  const mcpUrl = `${origin}/mcp`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Foodvisor MCP — track your nutrition from Claude</title>
<meta name="description" content="A remote Model Context Protocol server that lets Claude (and other MCP clients) read and write your Foodvisor nutrition data.">
<style>
  :root { color-scheme: light dark; --accent:#16a34a; --accent-fg:#fff; --muted:#666; --bg:#fff; --fg:#111; --card:#f7f7f8; --border:#e5e5e5; }
  @media (prefers-color-scheme: dark) {
    :root { --muted:#a1a1aa; --bg:#0b0b0c; --fg:#f4f4f5; --card:#161618; --border:#27272a; }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, system-ui, "Segoe UI", "Inter", sans-serif; background: var(--bg); color: var(--fg); line-height: 1.6; }
  main { max-width: 44rem; margin: 0 auto; padding: 3.5rem 1.5rem 5rem; }
  header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
  .logo { width: 2.5rem; height: 2.5rem; border-radius: 0.6rem; background: var(--accent); color: var(--accent-fg); display: grid; place-items: center; font-weight: 700; font-size: 1.4rem; }
  h1 { font-size: 1.7rem; margin: 0; letter-spacing: -0.01em; }
  .tagline { color: var(--muted); font-size: 1.05rem; margin: 0.25rem 0 2rem; }
  h2 { font-size: 1.15rem; margin: 2.5rem 0 0.75rem; letter-spacing: -0.005em; }
  p { margin: 0 0 0.85rem; }
  code { background: var(--card); border: 1px solid var(--border); padding: 0.1rem 0.4rem; border-radius: 0.35rem; font-size: 0.88em; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
  .url-row { display: flex; gap: 0.5rem; align-items: stretch; margin: 0.4rem 0 0.5rem; }
  .url-row input { flex: 1; min-width: 0; padding: 0.7rem 0.85rem; border-radius: 0.5rem; border: 1px solid var(--border); background: var(--card); color: var(--fg); font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.92rem; }
  .url-row button { background: var(--accent); color: var(--accent-fg); border: 0; border-radius: 0.5rem; padding: 0 1rem; font-weight: 600; cursor: pointer; font-size: 0.92rem; }
  .url-row button:hover { filter: brightness(1.1); }
  ol { padding-left: 1.3rem; }
  ol li { margin-bottom: 0.45rem; }
  .tool-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0.55rem; margin: 0.6rem 0 0; padding: 0; list-style: none; }
  .tool-grid li { background: var(--card); border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.55rem 0.7rem; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.85rem; }
  details { margin-top: 1rem; padding: 1rem 1.1rem; background: var(--card); border: 1px solid var(--border); border-radius: 0.6rem; }
  details > summary { cursor: pointer; font-weight: 600; }
  pre { background: var(--card); border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.9rem 1rem; overflow-x: auto; font-size: 0.85rem; line-height: 1.5; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .badge { display: inline-block; background: var(--card); border: 1px solid var(--border); padding: 0.15rem 0.55rem; border-radius: 999px; font-size: 0.78rem; color: var(--muted); margin-right: 0.3rem; }
  footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.88rem; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; }
  .warn { background: rgba(234, 179, 8, 0.12); border: 1px solid rgba(234, 179, 8, 0.45); padding: 0.75rem 0.9rem; border-radius: 0.5rem; font-size: 0.92rem; }
</style>
</head>
<body>
<main>
  <header>
    <div class="logo">F</div>
    <div>
      <h1>Foodvisor MCP</h1>
      <p class="tagline">Track your nutrition from Claude.</p>
    </div>
  </header>

  <p>This is a remote <a href="https://modelcontextprotocol.io" target="_blank" rel="noopener">Model Context Protocol</a> server that connects Claude (and any MCP-compatible client) to your <a href="https://www.foodvisor.io" target="_blank" rel="noopener">Foodvisor</a> account. Search foods, log meals, check your daily macros and progress — all from a conversation.</p>

  <p>
    <span class="badge">OAuth 2.1</span>
    <span class="badge">PKCE</span>
    <span class="badge">Streamable HTTP</span>
    <span class="badge">Multi-user</span>
    <span class="badge">Stateless</span>
  </p>

  <h2>What you can do</h2>
  <ul class="tool-grid">
    <li>search_food</li>
    <li>get_food_details</li>
    <li>log_meal</li>
    <li>list_meals</li>
    <li>get_daily_summary</li>
    <li>get_progress</li>
    <li>get_fv_grade_distribution</li>
    <li>get_streak</li>
    <li>get_water_log</li>
    <li>get_profile</li>
  </ul>

  <h2>Add to Claude</h2>
  <ol>
    <li>Open <strong>Claude</strong> (web, Desktop, or Code) → <strong>Settings</strong> → <strong>Connectors</strong> → <strong>Add custom connector</strong>.</li>
    <li>Paste this URL:
      <div class="url-row">
        <input id="mcp-url" type="text" readonly value="${mcpUrl}">
        <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('mcp-url').value);this.textContent='Copied';setTimeout(()=>this.textContent='Copy',1500)">Copy</button>
      </div>
    </li>
    <li>Click <strong>Connect</strong>. Claude will open a login page on this server.</li>
    <li>Paste your <strong>Foodvisor refresh token</strong> (see below) and submit. You're done — Claude can now use the tools.</li>
  </ol>

  <h2>Get your Foodvisor refresh token</h2>
  <p>Foodvisor only authenticates via Sign in with Apple on iOS, so the cleanest way to obtain a token is to capture it once from the iPhone app:</p>
  <ol>
    <li>Install <a href="https://www.charlesproxy.com/" target="_blank" rel="noopener">Charles Proxy</a> (or <a href="https://proxyman.io" target="_blank" rel="noopener">Proxyman</a>, mitmproxy, …) and trust its root certificate on your iPhone.</li>
    <li>Force-quit the Foodvisor app, then reopen it and sign in.</li>
    <li>In the proxy, find a request to <code>POST /api/6.0/ios/FR/fr_FR/user/auth/</code>. The JSON response contains a <code>tokens.refresh</code> field — that's your token.</li>
  </ol>
  <p class="warn">Your refresh token is valid for ~6 months and grants full read/write access to your Foodvisor account. Treat it like a password.</p>

  <details>
    <summary>Power user: skip OAuth and pass the token directly</summary>
    <p style="margin-top: 0.8rem;">Any MCP client that speaks the Streamable HTTP transport can hit <code>${mcpUrl}</code> with your Foodvisor refresh JWT in the Authorization header:</p>
    <pre><code>{
  "mcpServers": {
    "foodvisor": {
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer &lt;YOUR_FOODVISOR_REFRESH_TOKEN&gt;"
      }
    }
  }
}</code></pre>
  </details>

  <h2>Disclaimer</h2>
  <p style="font-size: 0.92rem; color: var(--muted);">This is an unofficial, open-source project. It uses Foodvisor's private mobile API and is not affiliated with or endorsed by Foodvisor. Endpoints may change without notice — use at your own risk.</p>

  <footer>
    <span>Self-hosted. Open source. <a href="https://github.com/cldt-fr/foodvisor-mcp" target="_blank" rel="noopener">Source on GitHub</a>.</span>
    <span>MIT licensed.</span>
  </footer>
</main>
</body>
</html>`;
}
