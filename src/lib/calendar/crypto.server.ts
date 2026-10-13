/**
 * Token sealing for calendar refresh tokens (Card 163: AES-256-GCM at rest, key from env).
 * Format: `v1.<iv>.<tag>.<ciphertext>` (base64url). A wrong key, a changed byte or a
 * different `aad` fails to open; it never returns garbage.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export class SealError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SealError";
  }
}

/** `CALENDAR_TOKEN_ENC_KEY`: 32 bytes as base64, base64url or 64 hex chars. Null when missing or the wrong size. */
export function parseSealKey(raw: string | undefined): Buffer | null {
  const v = raw?.trim();
  if (!v) return null;
  let key: Buffer | null = null;
  if (/^[0-9a-f]{64}$/i.test(v)) key = Buffer.from(v, "hex");
  else if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(v)) key = Buffer.from(v.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  return key && key.length === 32 ? key : null;
}

const b64u = (b: Buffer) => b.toString("base64url");

export function seal(plain: string, key: Buffer, aad = "atrium.calendar"): string {
  if (key.length !== 32) throw new SealError("key must be 32 bytes");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", b64u(iv), b64u(c.getAuthTag()), b64u(ct)].join(".");
}

export function open(sealed: string, key: Buffer, aad = "atrium.calendar"): string {
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new SealError("not a sealed value");
  try {
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(parts[1]!, "base64url"));
    d.setAAD(Buffer.from(aad));
    d.setAuthTag(Buffer.from(parts[2]!, "base64url"));
    return Buffer.concat([d.update(Buffer.from(parts[3]!, "base64url")), d.final()]).toString("utf8");
  } catch {
    throw new SealError("could not open sealed value");
  }
}

export function sha256(s: string) {
  return createHash("sha256").update(s).digest("base64url");
}

export function randomToken(bytes = 32) {
  return b64u(randomBytes(bytes));
}

export function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** PKCE S256 challenge for a verifier. */
export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}
