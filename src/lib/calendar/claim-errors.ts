/**
 * Card 176 L7 (Form): fixed messages for a failed sign-in code claim. Never shows a server
 * message, status or code. The server tells "used" from "expired" (Card 177); codes last
 * 2 minutes from the browser showing them (HANDOFF_CLAIM_TTL_MS).
 */
export type ClaimFail = "bad_code" | "rate_limited" | "expired" | "used" | "offline" | "unknown";

export const CLAIM_COPY: Record<ClaimFail, string> = {
  bad_code: "That code doesn't match. Check the code in your browser and try again.",
  rate_limited: "Too many tries. Wait a minute, then try again.",
  expired: "This code has expired. Codes last 2 minutes.",
  used: "This code has already been used. Start again to get a new one.",
  offline: "Can't connect right now. Check your internet connection and try again.",
  unknown: "Something went wrong while connecting. Try again, or start again.",
};

export const RATE_LIMIT_WAIT_MS = 60_000;

export function claimFailKind(e: unknown): ClaimFail {
  const err = e as { status?: unknown; code?: unknown } | null;
  const status = typeof err?.status === "number" ? err.status : -1;
  const code = typeof err?.code === "string" ? err.code : "";
  if (status === 401) return "bad_code";
  if (status === 429) return "rate_limited";
  if (status === 410) return code === "used" ? "used" : "expired";
  if (status === 0 || code === "offline") return "offline";
  return "unknown";
}

/** "Try again in 0:59" while the Connect button waits after a 429. */
export function retryLabel(msLeft: number) {
  const s = Math.max(0, Math.ceil(msLeft / 1000));
  return `Try again in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
