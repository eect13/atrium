/** Google OAuth 2.0 for the calendar connection (authorization code + PKCE, offline access). */
import { CALENDAR_SCOPES } from "./config.server.ts";
import { pkceChallenge } from "./crypto.server.ts";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const REVOKE = "https://oauth2.googleapis.com/revoke";
const USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";

export type Fetch = typeof fetch;
export type Tokens = { access_token: string; expires_in: number; refresh_token?: string; scope?: string; id_token?: string };

export class OAuthError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    this.name = "OAuthError";
  }
}

export function authUrl(o: { clientId: string; redirectUri: string; state: string; verifier: string; loginHint?: string; scopes?: readonly string[] }) {
  const p = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: "code",
    scope: (o.scopes ?? CALENDAR_SCOPES).join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state: o.state,
    code_challenge: pkceChallenge(o.verifier),
    code_challenge_method: "S256",
  });
  if (o.loginHint) p.set("login_hint", o.loginHint);
  return `${AUTH}?${p}`;
}

async function tokenCall(f: Fetch, body: Record<string, string>): Promise<Tokens> {
  const res = await f(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  const json = (await res.json().catch(() => ({}))) as Partial<Tokens> & { error?: string };
  if (!res.ok || !json.access_token) throw new OAuthError(json.error === "invalid_grant" ? "Google sign-in expired" : "Google token request failed", json.error || `http_${res.status}`);
  return json as Tokens;
}

export function exchangeCode(f: Fetch, o: { clientId: string; clientSecret: string; code: string; redirectUri: string; verifier: string }) {
  return tokenCall(f, { grant_type: "authorization_code", code: o.code, client_id: o.clientId, client_secret: o.clientSecret, redirect_uri: o.redirectUri, code_verifier: o.verifier });
}

export function refreshAccess(f: Fetch, o: { clientId: string; clientSecret: string; refreshToken: string }) {
  return tokenCall(f, { grant_type: "refresh_token", refresh_token: o.refreshToken, client_id: o.clientId, client_secret: o.clientSecret });
}

export async function revoke(f: Fetch, token: string) {
  await f(REVOKE, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) }).catch(() => undefined);
}

export async function userInfo(f: Fetch, accessToken: string): Promise<{ sub?: string; email?: string; picture?: string; name?: string }> {
  const res = await f(USERINFO, { headers: { authorization: `Bearer ${accessToken}` } });
  return res.ok ? ((await res.json()) as { sub?: string; email?: string }) : {};
}
