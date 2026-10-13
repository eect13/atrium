"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Lock, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { ConfirmRow } from "@/components/ui/confirm-row";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { GoogleSignInButton } from "@/components/calendar/google-button";
import { CAT_PALETTE, catFgToken, catToken } from "@/lib/event-cats";
import { fmtTime } from "@/lib/format";
import { fetchIcsUrl } from "@/lib/feeds";
import { parseICSAsync } from "@/lib/parse-ics-async";
import { useAtrium } from "@/lib/store";
import { calendarColourOf, isWritableRole } from "@/lib/calendar/source";
import { LEGACY_ICS, type IcsSourceMeta } from "@/lib/calendar/ics-source";
import {
  addIcsSource,
  cancelConnect,
  refreshStatus,
  connectGoogle,
  disconnectGoogle,
  icsSourcesWithLegacy,
  refreshIcsSource,
  removeIcsSource,
  setCalendarColour,
  syncNow,
  toggleGoogleCalendar,
  updateIcsSource,
  useCalAccounts,
  type Banner,
} from "@/lib/calendar/accounts";
import type { GCalDesk } from "@/lib/types";
import { cn } from "@/lib/utils";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";

function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cn("inline-block size-4 animate-spin rounded-full border-2 border-[var(--color-input)] border-t-foreground", className)} />;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border-t border-border py-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function SyncBanner({ kind, at, onRetry, onSignIn, onAllow }: { kind: Exclude<Banner, null>; at: string; onRetry: () => void; onSignIn: () => void; onAllow: () => void }) {
  const copy = {
    failed: ["Couldn't sync with Google", "Your changes are saved here and will sync when it works."],
    expired: ["Google sign-in expired", `Calendars show as of ${at}. Sign in again to keep syncing.`],
    offline: ["You're offline", `Showing calendars as of ${at}. Edits sync when you're back online.`],
    partial: ["Atrium can see your calendars but not change them", "Two-way sync needs permission to edit. Google asks once."],
  }[kind];
  const alert = kind === "failed" || kind === "expired";
  return (
    <div role={alert ? "alert" : "status"} className={cn("mb-3 rounded-2xl bg-muted p-3", alert && "shadow-[inset_3px_0_0_var(--color-destructive)]")}>
      <p className={cn("text-sm font-semibold", alert && "text-destructive")}>{copy[0]}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{copy[1]}</p>
      {kind === "failed" ? (
        <Button variant="outline" className="mt-2 h-11" onClick={onRetry}>
          Retry
        </Button>
      ) : kind === "expired" ? (
        <GoogleSignInButton className="mt-2" onClick={onSignIn} />
      ) : kind === "partial" ? (
        <Button className="mt-2 h-11" onClick={onAllow}>
          Allow editing
        </Button>
      ) : null}
    </div>
  );
}

function ColourPicker({ name, value, onChange }: { name: string; value: string; onChange: (key: string) => void }) {
  return (
    <div role="radiogroup" aria-label={`Colour for ${name}`} className="flex flex-wrap">
      {CAT_PALETTE.map((p) => (
        <button
          key={p.key}
          type="button"
          role="radio"
          aria-checked={value === p.key}
          aria-label={p.name}
          className={cn("inline-flex size-11 items-center justify-center rounded-full", FOCUS)}
          onClick={() => onChange(p.key)}
        >
          <span
            aria-hidden
            className={cn("inline-flex size-6 items-center justify-center rounded-full", value === p.key ? "shadow-[0_0_0_2px_var(--color-card),0_0_0_4px_var(--color-foreground)]" : "ring-1 ring-[var(--color-input)]")}
            style={{ background: catToken(p.key) }}
          >
            {value === p.key ? <Check className="size-3.5" style={{ color: catFgToken(p.key) }} /> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

/** One 56px row shared by Google calendars and ICS sources. */
export function CalendarSourceRow({ name, colour, shown, readOnly, badge, meta, onShown, onColour, actions }: { name: string; colour: string; shown: boolean; readOnly: boolean; badge?: string; meta: string; onShown: (on: boolean) => void; onColour: (key: string) => void; actions?: ReactNode }) {
  const [picking, setPicking] = useState(false);
  return (
    <li className="py-1">
      <div className="flex min-h-14 items-center gap-1">
        <button type="button" aria-label={`Colour for ${name}`} aria-expanded={picking} className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-full", FOCUS)} onClick={() => setPicking((v) => !v)}>
          <span aria-hidden className="size-5 rounded-full ring-1 ring-[var(--color-input)]" style={{ background: catToken(colour) }} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {readOnly ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-muted px-1.5 py-px text-foreground ring-1 ring-[var(--color-input)]">
                <Lock className="size-3" aria-hidden />
                {badge ?? "Read-only"}
              </span>
            ) : null}
            <span className="truncate">{meta}</span>
          </p>
        </div>
        {actions}
        <span className="inline-flex size-11 shrink-0 items-center justify-center">
          <Switch checked={shown} onCheckedChange={(v) => onShown(v === true)} aria-label={`Show ${name}`} />
        </span>
      </div>
      {picking ? <ColourPicker name={name} value={colour} onChange={(k) => { onColour(k); setPicking(false); }} /> : null}
    </li>
  );
}

function googleMeta(c: GCalDesk, canEdit: boolean) {
  if (!canEdit) return { readOnly: true, meta: "Edit access not granted" };
  if (c.accessRole === "owner") return { readOnly: false, meta: "Owner · two-way" };
  if (c.accessRole === "writer") return { readOnly: false, meta: "Can edit · two-way" };
  if (/#contacts@group\.v\.calendar\.google\.com$/.test(c.id) || /birthday/i.test(c.label)) return { readOnly: true, meta: "From Google Contacts" };
  if (/#holiday@group\.v\.calendar\.google\.com$/.test(c.id)) return { readOnly: true, meta: "Public" };
  return { readOnly: true, meta: "View only" };
}


export function CalendarAccountsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const acc = useCalAccounts();
  const { gcalCals, gcalOff, events } = useAtrium(useShallow((s) => ({ gcalCals: s.gcalCals, gcalOff: s.gcalOff, events: s.events })));
  const [confirm, setConfirm] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const file = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (open) void refreshStatus();
  }, [open]);
  const status = acc.status;
  const connected = Boolean(acc.email) && status?.state !== "disconnected";
  const at = acc.lastSync ? fmtTime(acc.lastSync) : "—";
  const banner: Banner = connected ? (acc.banner ?? (!acc.canEdit && status?.state === "connected" ? "partial" : null)) : null;
  const statusLine = !connected
    ? ""
    : acc.syncing
      ? "Syncing…"
      : banner === "failed"
        ? `Sync paused · Last synced ${at}`
        : banner === "offline"
          ? `Offline · Last synced ${at}`
          : banner === "expired"
            ? `Sign-in expired · Last synced ${at}`
            : !acc.canEdit
              ? `Read-only sync · Last synced ${at}`
              : `Two-way sync · Last synced ${at}`;
  const sources = icsSourcesWithLegacy(events, acc.icsSources);

  async function signIn(hint?: string) {
    try {
      await connectGoogle({ loginHint: hint });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't start Google sign-in");
    }
  }

  async function subscribe() {
    const u = url.trim();
    if (!u) return;
    setBusy("subscribe");
    try {
      const evs = await parseICSAsync(await fetchIcsUrl({ data: { url: u } }));
      let name = u;
      try {
        name = new URL(u).hostname.replace(/^www\./, "");
      } catch {
        /* keep raw */
      }
      const n = addIcsSource({ kind: "ical", name, url: u, refreshedAt: new Date().toISOString(), shown: true }, evs);
      toast(n ? `Imported ${n} event${n === 1 ? "" : "s"}` : "Already up to date");
      setUrl("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not fetch calendar");
    } finally {
      setBusy(null);
    }
  }

  async function importFile(f: File) {
    try {
      const evs = await parseICSAsync(await f.text());
      const n = addIcsSource({ kind: "ics", name: f.name, importedAt: new Date().toISOString(), shown: true }, evs);
      toast(n ? `Imported ${n} event${n === 1 ? "" : "s"}` : "Already up to date");
    } catch {
      toast("Could not read that calendar file");
    }
  }

  async function refresh(s: IcsSourceMeta) {
    if (!s.url) return;
    setBusy(s.id);
    try {
      refreshIcsSource(s.id, await parseICSAsync(await fetchIcsUrl({ data: { url: s.url } })));
      toast("Refreshed");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not fetch calendar");
    } finally {
      setBusy(null);
    }
  }

  const unconfigured = status?.state === "unconfigured";
  const unreachable = status?.state === "unreachable" && !connected;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 sm:w-[520px]" aria-describedby={undefined}>
        <div className="flex h-16 items-center border-b border-border px-5 pr-14">
          <SheetTitle className="text-[18px] font-semibold">Calendar accounts</SheetTitle>
        </div>
        <div className="px-5 py-4">
          <Section title="Google">
            {banner ? <SyncBanner kind={banner} at={at} onRetry={() => void syncNow()} onSignIn={() => void signIn(acc.email ?? undefined)} onAllow={() => void signIn(acc.email ?? undefined)} /> : null}
            {connected ? (
              <div>
                <div className="flex items-center gap-3">
                  <span aria-hidden className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-base font-semibold" style={{ background: catToken("work"), color: catFgToken("work") }}>
                    {(acc.email ?? "?").charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold">{acc.email}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span aria-hidden className={cn("size-2 rounded-full", banner === "failed" || banner === "expired" ? "bg-destructive" : "bg-ok")} />
                      {statusLine}
                    </p>
                  </div>
                </div>
                {confirm === "google" ? (
                  <ConfirmRow
                    className="mt-3"
                    subject={acc.email ?? "this account"}
                    verb="Disconnect"
                    detail="Its calendars leave Atrium. Nothing is deleted in Google."
                    triggerId="google-disconnect"
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => {
                      setConfirm(null);
                      void disconnectGoogle().then(() => toast("Disconnected"));
                    }}
                  />
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button variant="outline" className="h-11" disabled={acc.syncing} onClick={() => void syncNow()}>
                      {acc.syncing ? <Spinner /> : null}
                      Sync now
                    </Button>
                    <Button variant="outline" className="h-11" data-confirm-trigger="google-disconnect" onClick={() => setConfirm("google")}>
                      Disconnect
                    </Button>
                  </div>
                )}
              </div>
            ) : acc.connecting ? (
              <div className="flex items-center gap-3 rounded-2xl bg-muted p-3" role="status">
                <Spinner className="size-5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Waiting for Google…</p>
                  <p className="text-xs text-muted-foreground">Finish signing in in the Google window, then come back here.</p>
                </div>
                <Button variant="outline" className="h-11" onClick={cancelConnect}>
                  Cancel
                </Button>
              </div>
            ) : unconfigured ? (
              <div className="rounded-2xl bg-muted p-3" role="status">
                <p className="text-sm font-medium">Google Calendar isn't set up on this server yet</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Sign-in stays off until these settings exist: {status.missing.join(", ")}.</p>
              </div>
            ) : unreachable ? (
              <div className="rounded-2xl bg-muted p-3" role="status">
                <p className="text-sm font-medium">Can't reach Atrium's calendar service</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Check your connection, then open this sheet again.</p>
              </div>
            ) : (
              <div>
                <p className="text-sm">See and edit your Google calendars here, next to imported ones.</p>
                <GoogleSignInButton className="mt-3" disabled={!status} onClick={() => void signIn()} />
                <p className="mt-2 text-xs text-muted-foreground">Atrium asks Google to see and edit your calendars. You choose which ones show.</p>
              </div>
            )}
          </Section>
          {connected && gcalCals.length ? (
            <Section title="Google calendars" hint="Shown calendars appear in Calendar and the widget.">
              <ul>
                {gcalCals.map((c) => {
                  const m = googleMeta(c, acc.canEdit);
                  return (
                    <CalendarSourceRow
                      key={c.id}
                      name={c.primary ? (acc.email ?? c.label) : c.label}
                      colour={calendarColourOf(c.id, c.colour)}
                      shown={!gcalOff.includes(c.id)}
                      readOnly={m.readOnly || !isWritableRole(c.accessRole)}
                      meta={m.meta}
                      onShown={() => void toggleGoogleCalendar(c.id)}
                      onColour={(k) => setCalendarColour(c.id, k)}
                    />
                  );
                })}
              </ul>
            </Section>
          ) : null}
          <Section title="Other calendars" hint="Read-only. Edit these where they come from.">
            {sources.length ? (
              <ul>
                {sources.map((s) =>
                  confirm === s.id ? (
                    <li key={s.id} className="py-1">
                      <ConfirmRow
                        subject={s.name}
                        verb="Remove"
                        detail="Its events leave Calendar. You can import it again."
                        triggerId={`src-${s.id}`}
                        onCancel={() => setConfirm(null)}
                        onConfirm={() => {
                          removeIcsSource(s.id);
                          setConfirm(null);
                          toast("Removed");
                        }}
                      />
                    </li>
                  ) : (
                    <CalendarSourceRow
                      key={s.id}
                      name={s.name}
                      colour={calendarColourOf(s.id, s.colour)}
                      shown={s.shown !== false}
                      readOnly
                      badge={s.kind === "ical" ? "Read-only · iCal URL" : "Read-only · ICS"}
                      meta={s.kind === "ical" && s.refreshedAt ? `Refreshed ${fmtTime(s.refreshedAt)}` : s.importedAt ? `Imported ${new Date(s.importedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : s.id === LEGACY_ICS ? "Imported before accounts" : ""}
                      onShown={(on) => updateIcsSource(s.id, { shown: on })}
                      onColour={(k) => updateIcsSource(s.id, { colour: k })}
                      actions={
                        <>
                          {s.kind === "ical" && s.url ? (
                            <button type="button" aria-label={`Refresh ${s.name}`} className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground", FOCUS)} onClick={() => void refresh(s)}>
                              {busy === s.id ? <Spinner /> : <RefreshCw className="size-4" aria-hidden />}
                            </button>
                          ) : null}
                          <button type="button" data-confirm-trigger={`src-${s.id}`} aria-label={`Remove ${s.name}`} className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-destructive", FOCUS)} onClick={() => setConfirm(s.id)}>
                            <Trash2 className="size-4" aria-hidden />
                          </button>
                        </>
                      }
                    />
                  ),
                )}
              </ul>
            ) : null}
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Input className="h-11" placeholder="Paste a public iCal URL" aria-label="Public iCal URL" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void subscribe()} />
              <div className="flex gap-2">
                <Button variant="secondary" className="h-11 flex-1" disabled={busy === "subscribe"} onClick={() => void subscribe()}>
                  Subscribe
                </Button>
                <Button variant="outline" className="h-11 flex-1" onClick={() => file.current?.click()}>
                  Import ICS
                </Button>
              </div>
              <input
                ref={file}
                type="file"
                accept=".ics,text/calendar"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

