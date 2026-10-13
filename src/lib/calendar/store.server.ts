/** Calendar connection rows (Postgres via `src/lib/db.ts`, or any `Sql` in tests). */
import { open, randomToken, seal, sha256 } from "./crypto.server.ts";

export type Sql = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

export type Connection = {
  id: string;
  email: string | null;
  sub: string | null;
  scopes: string[];
  refreshToken: string;
};

type Row = { id: string; account_email: string | null; account_sub: string | null; scopes: string; refresh_token_enc: string };

const HANDOFF_TTL_MS = 10 * 60_000;

/** New connection. Returns the device session secret (shown to the device once, stored only as a hash). */
export async function createConnection(sql: Sql, key: Buffer, c: { email?: string; sub?: string; scopes: string[]; refreshToken: string }) {
  const id = randomToken(12);
  const sid = randomToken(32);
  await sql.query(
    "insert into calendar_connection (id, sid_hash, account_email, account_sub, refresh_token_enc, scopes) values ($1, $2, $3, $4, $5, $6)",
    [id, sha256(sid), c.email ?? null, c.sub ?? null, seal(c.refreshToken, key, `conn:${id}`), c.scopes.join(" ")],
  );
  return { id, sid };
}

export async function findBySid(sql: Sql, key: Buffer, sid: string | null | undefined): Promise<Connection | null> {
  if (!sid) return null;
  const rows = await sql.query<Row>("select id, account_email, account_sub, scopes, refresh_token_enc from calendar_connection where sid_hash = $1", [sha256(sid)]);
  const r = rows[0];
  if (!r) return null;
  return { id: r.id, email: r.account_email, sub: r.account_sub, scopes: r.scopes.split(/\s+/).filter(Boolean), refreshToken: open(r.refresh_token_enc, key, `conn:${r.id}`) };
}

/** Google may rotate the refresh token or widen scopes (incremental consent). */
export async function updateConnection(sql: Sql, key: Buffer, id: string, patch: { refreshToken?: string; scopes?: string[] }) {
  if (patch.refreshToken) await sql.query("update calendar_connection set refresh_token_enc = $2, updated_at = now() where id = $1", [id, seal(patch.refreshToken, key, `conn:${id}`)]);
  if (patch.scopes) await sql.query("update calendar_connection set scopes = $2, updated_at = now() where id = $1", [id, patch.scopes.join(" ")]);
}

export async function deleteConnection(sql: Sql, id: string) {
  await sql.query("delete from calendar_connection where id = $1", [id]);
}

/** Desktop opened the browser with `challenge`; OAuth finished; park the sealed session for one claim. */
export async function parkHandoff(sql: Sql, key: Buffer, challenge: string, sid: string, now = Date.now()) {
  await sql.query("delete from calendar_handoff where expires_at < $1", [new Date(now).toISOString()]);
  await sql.query(
    "insert into calendar_handoff (challenge, sid_enc, expires_at) values ($1, $2, $3) on conflict (challenge) do nothing",
    [challenge, seal(sid, key, `handoff:${challenge}`), new Date(now + HANDOFF_TTL_MS).toISOString()],
  );
}

/**
 * The app proves it started the flow with the PKCE verifier (sha256 → challenge).
 * One claim only; expired or claimed rows give null. "pending" while OAuth is still open.
 */
export async function claimHandoff(sql: Sql, key: Buffer, verifier: string, now = Date.now()): Promise<{ sid: string } | "pending" | null> {
  const challenge = sha256(verifier);
  const rows = await sql.query<{ sid_enc: string | null; expires_at: string | Date; claimed_at: string | Date | null }>(
    "select sid_enc, expires_at, claimed_at from calendar_handoff where challenge = $1",
    [challenge],
  );
  const r = rows[0];
  if (!r) return "pending";
  if (r.claimed_at || !r.sid_enc || new Date(r.expires_at).getTime() < now) return null;
  const claimed = await sql.query("update calendar_handoff set claimed_at = $2, sid_enc = null where challenge = $1 and claimed_at is null returning challenge", [challenge, new Date(now).toISOString()]);
  if (!claimed.length) return null;
  return { sid: open(r.sid_enc, key, `handoff:${challenge}`) };
}
