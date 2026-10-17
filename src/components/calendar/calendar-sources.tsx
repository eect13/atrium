"use client";

/**
 * Card 241: calendar sources, ICS-only. The source row, masked secret address and colour picker are
 * lifted unchanged from the old Calendars sheet (Card 165/168) so Options › Calendar and the
 * Add iCal link dialog reuse them; that sheet is gone (Card 242).
 */
import { useRef, useState, type ReactNode } from "react";
import { Check, Copy, Eye, EyeOff, Lock, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmRow } from "@/components/ui/confirm-row";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CAT_PALETTE, catFgToken, catToken } from "@/lib/event-cats";
import { fmtTime } from "@/lib/format";
import { fetchIcsUrl } from "@/lib/feeds";
import { parseICSAsync } from "@/lib/parse-ics-async";
import { useAtrium } from "@/lib/store";
import { calendarColourOf } from "@/lib/calendar/source";
import { LEGACY_ICS, maskIcsUrl, type IcsSourceMeta } from "@/lib/calendar/ics-source";
import { icsSourcesWithLegacy, refreshIcsSource, removeIcsSource, updateIcsSource, useCalAccounts } from "@/lib/calendar/accounts";
import { subscribeIcal } from "@/lib/calendar/subscribe";
import { cn } from "@/lib/utils";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";

/** The safety line under a secret address field (Card 168), unchanged. */
export const SECRET_ADDRESS_NOTE = "Treat it like a password: anyone with the address can see the calendar. Atrium keeps it on this device and never shows it in full unless you ask.";

function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cn("inline-block size-4 animate-spin rounded-full border-2 border-[var(--color-input)] border-t-foreground", className)} />;
}

// labelledBy: name the section from an existing visible heading instead of rendering its own h3 (Card 237 N1).
/** Card 168 ICS copy: a saved secret address is masked unless the user asks. */
export function SecretAddress({ url }: { url: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="mt-1 flex min-h-11 items-center gap-1 rounded-md bg-muted pl-2">
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground" title={shown ? url : undefined}>
        {shown ? url : maskIcsUrl(url)}
      </code>
      <Button type="button" variant="ghost" className="h-11 px-3 text-xs" aria-pressed={shown} onClick={() => setShown((v) => !v)}>
        {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        {shown ? "Hide" : "Show"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="h-11 px-3 text-xs"
        onClick={() =>
          void navigator.clipboard?.writeText(url).then(
            () => toast("Address copied"),
            () => toast("Couldn't copy"),
          )
        }
      >
        <Copy className="size-4" aria-hidden />
        Copy
      </Button>
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

/** One 56px row per calendar source (Card 165/168; lifted unchanged in Card 241). */
export function CalendarSourceRow({ name, colour, shown, readOnly, badge, meta, onShown, onColour, actions, extra }: { name: string; colour: string; shown: boolean; readOnly: boolean; badge?: string; meta: string; onShown: (on: boolean) => void; onColour: (key: string) => void; actions?: ReactNode; extra?: ReactNode }) {
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
      {extra}
      {picking ? <ColourPicker name={name} value={colour} onChange={(k) => { onColour(k); setPicking(false); }} /> : null}
    </li>
  );
}

/** Card 241: Options › Calendar list — the sheet's source rows as they were (colour, show, Refresh, Remove, address). */
export function CalendarSourceList() {
  const events = useAtrium((s) => s.events);
  const icsSources = useCalAccounts((s) => s.icsSources);
  const sources = icsSourcesWithLegacy(events, icsSources);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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

  return (
    <>
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
                      extra={s.kind === "ical" && s.url ? <SecretAddress url={s.url} /> : undefined}
                      name={s.name}
                      colour={calendarColourOf(s.id, s.colour)}
                      shown={s.shown !== false}
                      readOnly
                      badge={s.kind === "ical" ? "Read-only · Secret address" : "Read-only · ICS"}
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
    </>
  );
}

/** Card 241: "Add iCal link…" — a small dialog around the unchanged subscribe(). */
export function AddIcalLinkDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement | null>(null);
  async function add() {
    if (busy || !url.trim()) return;
    setBusy(true);
    const ok = await subscribeIcal(url);
    setBusy(false);
    if (!ok) return;
    setUrl("");
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : (setUrl(""), onOpenChange(false)))}>
      <DialogContent aria-describedby="ical-link-note">
        <DialogHeader>
          <DialogTitle>Add iCal link</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Label htmlFor="ical-link">Secret address</Label>
          <Input ref={field} id="ical-link" className="h-11" type="password" autoComplete="off" spellCheck={false} placeholder="Paste a private secret address (.ics)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <p id="ical-link-note" className="text-xs text-muted-foreground">{SECRET_ADDRESS_NOTE}</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="h-11" disabled={busy} aria-busy={busy || undefined}>
              {busy ? <Spinner /> : null}
              Add
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

