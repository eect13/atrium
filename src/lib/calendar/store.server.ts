/** Calendar connection, session and hand-off rows (Postgres via `src/lib/db.ts`, or any `Sql` in tests). */
import { randomInt } from "node:crypto";
import { open, pkceChallenge, randomToken, sameSecret, seal, sha256 } from "./crypto.server.ts";

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

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (v: string | Date | null | undefined) => (v == null ? null : new Date(v).getTime());

// ---------- connections ----------

/** One row per Google account (by `sub`): a re-consent from any device updates it. */
export async function upsertConnection(sql: Sql, key: Buffer, c: { email?: string; sub?: string; scopes: string[]; refreshToken?: string }): Promise<{ id: string } | null> {
  const found = c.sub ? (await sql.query<{ id: string }>("select id from calendar_connection where account_sub = $1", [c.sub]))[0] : undefined;
  if (found) {
    await updateConnection(sql, key, found.id, { refreshToken: c.refreshToken, scopes: c.scopes, email: c.email });
    return { id: found.id };
  }
  if (!c.refreshToken) return null;
  const id = randomToken(12);
  await sql.query("insert into calendar_connection (id, account_email, account_sub, refresh_token_enc, scopes) values ($1, $2, $3, $4, $5)", [
    id,
    c.email ?? null,
    c.sub ?? null,
    seal(c.refreshToken, key, `conn:${id}`),
    c.scopes.join(" "),
  ]);
  return { id };
}

export async function findConnection(sql: Sql, key: Buffer, id: string): Promise<Connection | null> {
  const r = (await sql.query<Row>("select id, account_email, account_sub, scopes, refresh_token_enc from calendar_connection where id = $1", [id]))[0];
  if (!r) return null;
  return { id: r.id, email: r.account_email, sub: r.account_sub, scopes: r.scopes.split(/\s+/).filter(Boolean), refreshToken: open(r.refresh_token_enc, key, `conn:${r.id}`) };
}

/** Google may rotate the refresh token or widen scopes (incremental consent). */
export async function updateConnection(sql: Sql, key: Buffer, id: string, patch: { refreshToken?: string; scopes?: string[]; email?: string }) {
  if (patch.refreshToken) await sql.query("update calendar_connection set refresh_token_enc = $2, updated_at = now() where id = $1", [id, seal(patch.refreshToken, key, `conn:${id}`)]);
  if (patch.scopes) await sql.query("update calendar_connection set scopes = $2, updated_at = now() where id = $1", [id, patch.scopes.join(" ")]);
  if (patch.email) await sql.query("update calendar_connection set account_email = $2, updated_at = now() where id = $1", [id, patch.email]);
}

/** Deletes the connection; its sessions go with it (on delete cascade). */
export async function deleteConnection(sql: Sql, id: string) {
  await sql.query("delete from calendar_session where connection_id = $1", [id]);
  await sql.query("delete from calendar_connection where id = $1", [id]);
}

// ---------- sessions (Card 167 M2) ----------

export const ACCESS_TTL_MS = 60 * 60_000;
export const REFRESH_IDLE_MS = 14 * 86_400_000;
export const REFRESH_ABS_MS = 90 * 86_400_000;
export const REUSE_GRACE_MS = 10_000;

export type SessionPair = { access: string; refresh: string; accessExp: number; refreshExp: number };

type SessionRow = { id: string; connection_id: string; family_id: string; access_exp: string | Date; refresh_exp: string | Date; abs_exp: string | Date; rotated_at: string | Date | null; revoked_at: string | Date | null };

async function insertPair(sql: Sql, connectionId: string, familyId: string, absExp: number, now: number): Promise<SessionPair> {
  const access = randomToken(32);
  const refresh = randomToken(32);
  const accessExp = Math.min(now + ACCESS_TTL_MS, absExp);
  const refreshExp = Math.min(now + REFRESH_IDLE_MS, absExp);
  await sql.query(
    "insert into calendar_session (id, connection_id, family_id, access_hash, access_exp, refresh_hash, refresh_exp, abs_exp, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    [randomToken(12), connectionId, familyId, sha256(access), iso(accessExp), sha256(refresh), iso(refreshExp), iso(absExp), iso(now)],
  );
  return { access, refresh, accessExp, refreshExp };
}

/** A new device session (new family) for a connection. */
export function newSession(sql: Sql, connectionId: string, now = Date.now()) {
  return insertPair(sql, connectionId, randomToken(12), now + REFRESH_ABS_MS, now);
}

export type SessionLookup = { connectionId: string; familyId: string } | "expired" | null;

/** Access handle → session. "expired" once its hour is up (the device refreshes); null if unknown or revoked. */
export async function sessionFor(sql: Sql, access: string | null | undefined, now = Date.now()): Promise<SessionLookup> {
  if (!access) return null;
  const r = (await sql.query<SessionRow>("select id, connection_id, family_id, access_exp, refresh_exp, abs_exp, rotated_at, revoked_at from calendar_session where access_hash = $1", [sha256(access)]))[0];
  if (!r || r.revoked_at) return null;
  if (r.rotated_at || ms(r.access_exp)! <= now || ms(r.abs_exp)! <= now) return "expired";
  return { connectionId: r.connection_id, familyId: r.family_id };
}

export type RotateResult = { pair: SessionPair; connectionId: string; familyId: string } | "retry" | "reuse" | "ended";

/**
 * Rotate a refresh handle. A handle used again after rotation revokes the whole family
 * ("reuse"), except within a 10 s grace for concurrent tabs ("retry": reread storage).
 * Idle (14 d) or absolute (90 d) expiry and revoked families give "ended" (reconnect).
 */
export async function rotateSession(sql: Sql, refresh: string, now = Date.now()): Promise<RotateResult> {
  const r = (await sql.query<SessionRow>("select id, connection_id, family_id, access_exp, refresh_exp, abs_exp, rotated_at, revoked_at from calendar_session where refresh_hash = $1", [sha256(refresh)]))[0];
  if (!r || r.revoked_at) return "ended";
  if (r.rotated_at) {
    if (now - ms(r.rotated_at)! <= REUSE_GRACE_MS) return "retry";
    await revokeFamily(sql, r.family_id, now);
    return "reuse";
  }
  if (ms(r.refresh_exp)! <= now || ms(r.abs_exp)! <= now) return "ended";
  const won = await sql.query("update calendar_session set rotated_at = $2 where id = $1 and rotated_at is null returning id", [r.id, iso(now)]);
  if (!won.length) return "retry";
  const pair = await insertPair(sql, r.connection_id, r.family_id, ms(r.abs_exp)!, now);
  return { pair, connectionId: r.connection_id, familyId: r.family_id };
}

export async function revokeFamily(sql: Sql, familyId: string, now = Date.now()) {
  await sql.query("update calendar_session set revoked_at = $2 where family_id = $1 and revoked_at is null", [familyId, iso(now)]);
}

// ---------- hand-off (Card 167 B2) ----------

export const HANDOFF_START_TTL_MS = 5 * 60_000;
export const HANDOFF_CLAIM_TTL_MS = 2 * 60_000;
export const HANDOFF_MAX_ATTEMPTS = 5;
export const HANDOFF_RATE = { max: 10, windowMs: 10 * 60_000 };
const FINAL_KEEP_MS = 86_400_000;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Crockford base32 code, 6 characters (~30 bits), shown as "K7Q-4M2". */
export function newCode() {
  let c = "";
  for (let i = 0; i < 6; i++) c += CROCKFORD[randomInt(32)];
  return c;
}
export const showCode = (c: string) => `${c.slice(0, 3)}-${c.slice(3)}`;
/** What the user typed → canonical code (case, dashes, spaces; O→0, I/L→1). */
export function normCode(raw: string) {
  return raw.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}

type HandoffRow = { hid: string; challenge: string; state: string; code_hash: string | null; session_enc: string | null; attempts: number; created_at: string | Date; expires_at: string | Date };

async function handoffRow(sql: Sql, hid: string) {
  return (await sql.query<HandoffRow>("select hid, challenge, state, code_hash, session_enc, attempts, created_at, expires_at from calendar_handoff where hid = $1", [hid]))[0] ?? null;
}

/** Step 1: the app registers its challenge. "limited" past 10 starts per IP per 10 min. */
export async function startHandoff(sql: Sql, challenge: string, ipHash: string | null, now = Date.now()): Promise<{ hid: string } | "limited"> {
  await sql.query("delete from calendar_handoff where (final_at is not null and final_at < $1) or expires_at < $1", [iso(now - FINAL_KEEP_MS)]);
  if (ipHash) {
    const n = await sql.query<{ n: number }>("select count(*)::int as n from calendar_handoff where ip_hash = $1 and created_at > $2", [ipHash, iso(now - HANDOFF_RATE.windowMs)]);
    if ((n[0]?.n ?? 0) >= HANDOFF_RATE.max) return "limited";
  }
  const hid = randomToken(16);
  await sql.query("insert into calendar_handoff (hid, challenge, state, ip_hash, created_at, expires_at) values ($1, $2, 'started', $3, $4, $5)", [hid, challenge, ipHash, iso(now), iso(now + HANDOFF_START_TTL_MS)]);
  return { hid };
}

/** Step 2: /connect binds the browser. Only a known, unexpired, `started` hid passes. */
export async function bindHandoff(sql: Sql, hid: string, now = Date.now()) {
  const r = await sql.query("update calendar_handoff set state = 'browser_bound' where hid = $1 and state = 'started' and expires_at > $2 returning hid", [hid, iso(now)]);
  return r.length > 0;
}

/** Step 3: after consent, park the connection (sealed to this hid) and return the code to show. */
export async function consentHandoff(sql: Sql, key: Buffer, hid: string, connectionId: string, now = Date.now()): Promise<string | null> {
  const code = newCode();
  const r = await sql.query(
    "update calendar_handoff set state = 'consented', code_hash = $2, session_enc = $3, expires_at = $4 where hid = $1 and state = 'browser_bound' and expires_at > $5 returning hid",
    [hid, sha256(`code:${hid}:${code}`), seal(JSON.stringify({ connectionId }), key, `handoff:${hid}`), iso(now + HANDOFF_CLAIM_TTL_MS), iso(now)],
  );
  return r.length ? code : null;
}

export async function handoffBound(sql: Sql, hid: string, now = Date.now()) {
  const r = await handoffRow(sql, hid);
  return Boolean(r && r.state === "browser_bound" && ms(r.expires_at)! > now);
}

/** Card 177: "used" (claimed already) vs "gone" (expired, burned or unknown) so the app can say which. */
export type ClaimResult = { pair: SessionPair } | "pending" | "bad" | "gone" | "used";

/**
 * Step 4: the app claims with its verifier and the code the user typed. Both must match, the
 * row must be `consented` and unexpired. Each wrong try counts; the 5th burns the row. One claim.
 */
export async function claimHandoff(sql: Sql, key: Buffer, hid: string, verifier: string, code: string, now = Date.now()): Promise<ClaimResult> {
  // Card 174 K1: reserve one attempt in a single statement (increment-and-check), so parallel
  // claims can't each read the same count. Only HANDOFF_MAX_ATTEMPTS claims ever get past here.
  const got = await sql.query<{ attempts: number; challenge: string; code_hash: string | null; session_enc: string | null }>(
    "update calendar_handoff set attempts = attempts + 1 where hid = $1 and state = 'consented' and expires_at > $2 and attempts < $3 returning attempts, challenge, code_hash, session_enc",
    [hid, iso(now), HANDOFF_MAX_ATTEMPTS],
  );
  const g = got[0];
  if (!g) {
    const r = await handoffRow(sql, hid);
    if (!r) return "gone";
    if (r.state === "consented" && r.attempts >= HANDOFF_MAX_ATTEMPTS) {
      await sql.query("update calendar_handoff set state = 'burned', session_enc = null, final_at = $2 where hid = $1 and state = 'consented'", [hid, iso(now)]);
      return "gone";
    }
    if (r.state === "claimed") return "used";
    if (r.state === "burned" || r.state === "expired" || ms(r.expires_at)! <= now) {
      if (r.state !== "claimed" && r.state !== "burned") await sql.query("update calendar_handoff set state = 'expired', session_enc = null, final_at = $2 where hid = $1", [hid, iso(now)]);
      return "gone";
    }
    // Not consented yet: the browser half isn't done. Doesn't spend an attempt.
    return sameSecret(pkceChallenge(verifier), r.challenge) ? "pending" : "bad";
  }
  const verOk = sameSecret(pkceChallenge(verifier), g.challenge);
  const codeOk = Boolean(g.code_hash) && sameSecret(sha256(`code:${hid}:${normCode(code)}`), g.code_hash!);
  if (!verOk || !codeOk) {
    if (g.attempts >= HANDOFF_MAX_ATTEMPTS) await sql.query("update calendar_handoff set state = 'burned', session_enc = null, final_at = $2 where hid = $1 and state = 'consented'", [hid, iso(now)]);
    return "bad";
  }
  const won = await sql.query(
    "update calendar_handoff set state = 'claimed', session_enc = null, final_at = $2 where hid = $1 and state = 'consented' returning hid",
    [hid, iso(now)],
  );
  if (!won.length || !g.session_enc) return "used";
  const { connectionId } = JSON.parse(open(g.session_enc, key, `handoff:${hid}`)) as { connectionId: string };
  return { pair: await newSession(sql, connectionId, now) };
}

/** Card 174 K1: wrong codes per client IP across all hand-offs (stops spraying many hids). */
export const CLAIM_FAIL_RATE = { max: 20, windowMs: 10 * 60_000 };

export async function claimLimited(sql: Sql, ipHash: string, now = Date.now()) {
  const n = await sql.query<{ n: number }>("select count(*)::int as n from calendar_claim_fail where ip_hash = $1 and failed_at > $2", [ipHash, iso(now - CLAIM_FAIL_RATE.windowMs)]);
  return (n[0]?.n ?? 0) >= CLAIM_FAIL_RATE.max;
}

export async function noteClaimFail(sql: Sql, ipHash: string, now = Date.now()) {
  await sql.query("delete from calendar_claim_fail where failed_at < $1", [iso(now - CLAIM_FAIL_RATE.windowMs)]);
  await sql.query("insert into calendar_claim_fail (ip_hash, failed_at) values ($1, $2)", [ipHash, iso(now)]);
}

