/**
 * Card 174 M-a (Critic 171): the desktop/Android calendar refresh handle never enters the
 * WebView. Rust claims the hand-off and rotates the handle (`cal_session_*` commands), keeps it
 * DPAPI-sealed on Windows, and returns only the 1 h access handle. There is no command that
 * reads the refresh handle back. Web never holds either (HttpOnly cookies).
 */
import { isTauri } from "../http.ts";
import { CalendarApiError } from "./google-source.ts";

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: inv } = await import("@tauri-apps/api/core");
  return inv<T>(cmd, args);
}

export type DeviceAccess = { access: string; accessExp: number };
type Reply = { status: number; sealWarning?: string; body: { access?: string; accessExp?: number; error?: string; message?: string } | null };

export function unwrapReply(r: Reply): DeviceAccess {
  if (r.status === 200 && typeof r.body?.access === "string" && typeof r.body.accessExp === "number") return { access: r.body.access, accessExp: r.body.accessExp };
  throw new CalendarApiError(r.status, r.body?.error || (r.status ? "error" : "offline"), r.body?.message);
}

async function call(cmd: string, args?: Record<string, unknown>): Promise<DeviceAccess> {
  let r: Reply;
  try {
    r = await invoke<Reply>(cmd, args);
  } catch (e) {
    throw new CalendarApiError(0, "offline", e instanceof Error ? e.message : String(e));
  }
  if (r.sealWarning) warnSeal();
  return unwrapReply(r);
}

/** Card 197: the device couldn't re-seal an old session file. Calendar keeps working; say so once, without blocking. */
const SEAL_WARNING = "Couldn't secure the saved calendar sign-in on this device. Calendar still works; Atrium will try again next time.";
let sealWarned = false;
function warnSeal() {
  if (sealWarned) return;
  sealWarned = true;
  void import("sonner").then(({ toast }) => toast.error(SEAL_WARNING)).catch(() => undefined);
}

/** Hand-off step 4 done in Rust: the refresh handle is stored there, JS gets the access handle. */
export function claimOnDevice(hid: string, verifier: string, code: string): Promise<DeviceAccess> {
  return call("cal_session_claim", { hid, verifier, code });
}

/** Rotate in Rust (Card 167 M2). 401 = signed out on the server; Rust has already forgotten it. */
export function refreshOnDevice(): Promise<DeviceAccess> {
  if (!isTauri()) return Promise.reject(new CalendarApiError(401, "disconnected"));
  return call("cal_session_refresh");
}

/** One-time move of a Card 165-era handle from localStorage. Write-only. */
export async function adoptLegacy(value: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("cal_session_adopt", { value });
}

export async function clearRefresh(): Promise<void> {
  if (!isTauri()) return;
  await invoke("cal_session_clear").catch(() => undefined);
}
