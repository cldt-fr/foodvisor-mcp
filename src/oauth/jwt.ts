import crypto from "node:crypto";

const ENC_KEY_INFO = "foodvisor-mcp:refresh-token-encryption:v1";

function deriveKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(`${secret}:${ENC_KEY_INFO}`).digest();
}

export function encryptRefreshToken(refreshToken: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(refreshToken, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

export function decryptRefreshToken(blob: string, secret: string): string {
  const buf = Buffer.from(blob, "base64url");
  if (buf.length < 28) throw new Error("ciphertext too short");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

export interface AccessTokenPayload {
  iss?: string;
  sub: string;
  fvr: string;
  iat: number;
  exp: number;
  aud?: string;
  client_id?: string;
}

function b64url(buf: Buffer | string): string {
  return (typeof buf === "string" ? Buffer.from(buf) : buf).toString("base64url");
}

export function signAccessToken(
  payload: AccessTokenPayload,
  secret: string,
): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyAccessToken(
  token: string,
  secret: string,
): AccessTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, b, s] = parts as [string, string, string];
  const data = `${h}.${b}`;
  const expected = crypto.createHmac("sha256", secret).update(data).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(s, "base64url");
  } catch {
    return null;
  }
  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(b, "base64url").toString("utf8"),
    ) as AccessTokenPayload;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) {
      return null;
    }
    if (typeof payload.sub !== "string" || typeof payload.fvr !== "string") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
