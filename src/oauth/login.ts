function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface LoginPageOptions {
  client_id: string;
  client_name?: string;
  redirect_uri: string;
  state?: string;
  code_challenge: string;
  code_challenge_method: string;
  scope?: string;
  error?: string;
}

export function renderLoginPage(opts: LoginPageOptions): string {
  const hidden = (name: string, value: string | undefined) =>
    value === undefined
      ? ""
      : `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`;
  const errorBlock = opts.error
    ? `<div class="error">${escapeHtml(opts.error)}</div>`
    : "";
  const clientLabel = opts.client_name
    ? `<strong>${escapeHtml(opts.client_name)}</strong>`
    : `<code>${escapeHtml(opts.client_id)}</code>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect to Foodvisor MCP</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, system-ui, "Segoe UI", sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1.5rem; line-height: 1.55; }
  h1 { font-size: 1.4rem; margin-bottom: 0.5rem; }
  .subtitle { color: #666; margin-bottom: 1.5rem; }
  label { display: block; font-weight: 600; margin-top: 1rem; margin-bottom: 0.35rem; }
  textarea { width: 100%; min-height: 8rem; padding: 0.6rem; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.78rem; border: 1px solid #ccc; border-radius: 8px; box-sizing: border-box; resize: vertical; }
  button { margin-top: 1rem; background: #111; color: #fff; border: 0; border-radius: 8px; padding: 0.7rem 1.4rem; font-size: 1rem; cursor: pointer; }
  button:hover { background: #333; }
  .error { background: #ffe5e5; color: #8a1a1a; border: 1px solid #f5b8b8; padding: 0.6rem 0.9rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.92rem; }
  details { margin-top: 1.4rem; font-size: 0.92rem; color: #444; }
  summary { cursor: pointer; font-weight: 600; }
  ol { padding-left: 1.2rem; }
  code { background: rgba(127,127,127,0.15); padding: 0.05rem 0.3rem; border-radius: 4px; font-size: 0.85em; }
  @media (prefers-color-scheme: dark) {
    body { background: #111; color: #eee; }
    .subtitle { color: #aaa; }
    textarea { background: #1a1a1a; color: #eee; border-color: #333; }
    .error { background: #3a1818; color: #ffb4b4; border-color: #7a2727; }
    details { color: #bbb; }
  }
</style>
</head>
<body>
<h1>Connect Foodvisor</h1>
<p class="subtitle">${clientLabel} is requesting access to your Foodvisor data through this MCP server.</p>
${errorBlock}
<form method="POST" action="/authorize">
  <label for="refresh_token">Foodvisor refresh token</label>
  <textarea id="refresh_token" name="refresh_token" required placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."></textarea>
  ${hidden("client_id", opts.client_id)}
  ${hidden("redirect_uri", opts.redirect_uri)}
  ${hidden("state", opts.state)}
  ${hidden("code_challenge", opts.code_challenge)}
  ${hidden("code_challenge_method", opts.code_challenge_method)}
  ${hidden("scope", opts.scope)}
  <button type="submit">Authorize</button>
</form>
<details>
  <summary>How do I get my Foodvisor refresh token?</summary>
  <ol>
    <li>Install <a href="https://www.charlesproxy.com/" target="_blank" rel="noopener">Charles Proxy</a> (or Proxyman / mitmproxy) and trust its root certificate on your iPhone.</li>
    <li>Open the Foodvisor app and sign in. Look for a <code>POST /api/6.0/ios/FR/fr_FR/user/auth/</code> request.</li>
    <li>The JSON response contains <code>tokens.refresh</code>. Paste that JWT here.</li>
  </ol>
  <p>Refresh tokens are valid for ~6 months. Treat them like passwords — don't share them.</p>
</details>
</body>
</html>`;
}
