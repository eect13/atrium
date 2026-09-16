"use client";

import { APP_LABEL } from "@/lib/version";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, LocateFixed } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { AppearancePicker } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAtrium } from "@/lib/store";
import { downloadProfileBackup, parseProfileBackup, restoreProfileBackup, wipeAtriumStorage } from "@/lib/profile-desk";
import { DEFAULT_TAGLINE, STOCK_TAPES, WIDGET_LABEL, type Profile, type WidgetKind } from "@/lib/types";
import { DASH_LABEL, shiftDash, type DashCard } from "@/lib/dash";
import { useModHint } from "@/lib/keys";
import { mapsPin, hasWeatherPin } from "@/lib/weather";
import { locateMe, locationBlockedCopy } from "@/lib/locate";
import { PlaceField } from "@/components/place-field";
import { DeskStorage } from "./finance-options";
import { Chip, FIELD_SELECT } from "./finance-chip";
import { FEED_PACKS, packIsOn } from "@/lib/feeds";
import { DESK_REGIONS, regionOf } from "@/lib/region";
import { cn } from "@/lib/utils";

const OPTIONAL = [
  { id: "weather" as const, label: "Weather", blurb: "Forecast tab, Today card, and city or ZIP pin." },
  { id: "notes" as const, label: "Sticky notes", blurb: "Board plus pin-to-desktop floating windows. Pencil for freehand." },
  { id: "finance" as const, label: "Finance watcher", blurb: "Cash books, market board, backup." },
  { id: "quotes" as const, label: "Quotes", blurb: "Daily lines from public feeds. Random shuffles the live set." },
  { id: "news" as const, label: "News briefing", blurb: "RSS mosaic in the MSN style." },
];

const DESK: { kind: WidgetKind; need?: "finance" | "news" | "quotes" | "weather" }[] = [
  { kind: "weather", need: "weather" },
  { kind: "calendar" },
  { kind: "quote", need: "quotes" },
  { kind: "finance", need: "finance" },
  { kind: "news", need: "news" },
];

const JUMP = [
  { id: "opt-appearance", label: "Appearance" },
  { id: "opt-desk", label: "Desk" },
  { id: "opt-dash", label: "Dashboard" },
  { id: "opt-modules", label: "Modules" },
  { id: "opt-markets", label: "Markets" },
  { id: "opt-news", label: "News" },
  { id: "opt-profile", label: "Profile" },
  { id: "opt-keys", label: "Shortcuts" },
  { id: "opt-storage", label: "Storage" },
  { id: "opt-data", label: "Data" },
];

function ProfileFields({ profile, setProfile }: { profile: Profile; setProfile: (p: Partial<Profile>) => void }) {
  const setView = useAtrium((s) => s.setView);
  const [name, setName] = useState(profile.name);
  const [city, setCity] = useState(profile.city);
  const [tagline, setTagline] = useState(profile.tagline);
  const [lat, setLat] = useState(profile.lat == null ? "" : String(profile.lat));
  const [lon, setLon] = useState(profile.lon == null ? "" : String(profile.lon));
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    setName(profile.name);
    setCity(profile.city);
    setTagline(profile.tagline);
    setLat(profile.lat == null ? "" : String(profile.lat));
    setLon(profile.lon == null ? "" : String(profile.lon));
  }, [profile.name, profile.city, profile.tagline, profile.lat, profile.lon]);

  async function useMyLocation() {
    setLocating(true);
    try {
      const found = await locateMe();
      if (!found) {
        toast(locationBlockedCopy());
        return;
      }
      const cityName = found.hit.city || profile.city;
      setLat(String(found.hit.lat));
      setLon(String(found.hit.lon));
      setCity(cityName);
      setProfile({ lat: found.hit.lat, lon: found.hit.lon, city: cityName });
      toast(
        cityName
          ? found.via === "gps"
            ? `Weather pin: ${cityName}`
            : `Weather pin: ${cityName} (network)`
          : "Weather pin updated",
      );
    } finally {
      setLocating(false);
    }
  }

  const pinned = hasWeatherPin(profile);
  const pin = pinned ? mapsPin(profile.lat!, profile.lon!) : null;
  const ns = (profile.lat ?? 0) >= 0 ? "N" : "S";
  const ew = (profile.lon ?? 0) >= 0 ? "E" : "W";
  const coord = pinned
    ? `${Math.abs(profile.lat!).toFixed(4)}° ${ns}  ${Math.abs(profile.lon!).toFixed(4)}° ${ew}`
    : "No pin yet";

  return (
    <CardContent className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor="opt-name">Name</Label>
        <Input
          id="opt-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={(e) => setProfile({ name: e.target.value.trim() })}
          placeholder="Your name"
        />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <p className="text-xs uppercase tracking-[0.06em] text-muted-foreground">Desk region</p>
        <select
          aria-label="Desk region"
          className={cn(FIELD_SELECT, "mt-2 sm:hidden")}
          value={profile.region || "PH"}
          onChange={(e) => {
            const r = regionOf(e.target.value);
            setProfile({ region: r.id });
            toast(r.factory ? "Philippines — factory desk" : `Desk region: ${r.name}`);
          }}
        >
          {DESK_REGIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.factory ? " · default" : ""}
            </option>
          ))}
        </select>
        <div className="mt-2 hidden flex-wrap gap-2 sm:flex">
          {DESK_REGIONS.map((r) => (
            <Chip
              key={r.id}
              active={(profile.region || "PH") === r.id}
              onClick={() => {
                setProfile({ region: r.id });
                toast(r.factory ? "Philippines — factory desk" : `Desk region: ${r.name}`);
              }}
            >
              {r.name}
              {r.factory ? " · default" : ""}
            </Chip>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Clock, calendar, and weather follow this country. Philippines is the factory default. Books currency stays
          what you set on Cash.
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="opt-city">City or ZIP</Label>
        <PlaceField
          id="opt-city"
          country={profile.region}
          placeholder={regionOf(profile.region).cityHint}
          pinned={profile.city}
          onPick={(hit) => {
            setLat(String(hit.lat));
            setLon(String(hit.lon));
            setCity(hit.city);
            setProfile({ city: hit.city, lat: hit.lat, lon: hit.lon });
            toast(`Weather pin: ${hit.city}`);
          }}
          onClear={() => {
            setCity("");
            setLat("");
            setLon("");
            setProfile({ city: "", lat: null, lon: null });
            toast("Weather pin cleared");
          }}
        />
        <p className="text-xs text-muted-foreground">
          Type a city or ZIP — suggestions appear as you type. The Weather tab is the main place for this pin.
        </p>
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="opt-tagline">Sidebar tagline</Label>
        <Input
          id="opt-tagline"
          value={tagline}
          maxLength={48}
          placeholder="Tagline (optional)"
          onChange={(e) => setTagline(e.target.value)}
          onBlur={(e) => setProfile({ tagline: e.target.value.trim() || DEFAULT_TAGLINE })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setProfile({ tagline: e.currentTarget.value.trim() || DEFAULT_TAGLINE });
            }
          }}
        />
        <p className="text-xs text-muted-foreground">Shown at the foot of the sidebar. Stays on this device.</p>
      </div>
      <div className="sm:col-span-2 rounded-xl bg-muted p-5">
        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Weather pin</p>
        <p className="mt-1 font-display text-2xl tracking-tight">{profile.city.trim() || "No place pinned"}</p>
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">{coord}</p>
          </TooltipTrigger>
          <TooltipContent>Used for local weather — not shared</TooltipContent>
        </Tooltip>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="outline" onClick={() => void useMyLocation()} disabled={locating}>
                <LocateFixed className="size-4" />
                {locating ? "Locating…" : "Use my location"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>GPS first, then network if the browser blocks it</TooltipContent>
          </Tooltip>
          {pin ? (
            <a
              href={pin.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center text-xs text-muted-foreground hover:text-foreground"
            >
              Open pin in Maps
            </a>
          ) : null}
          <Button type="button" variant="outline" onClick={() => setView("weather")}>
            Open Weather
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Same pin as the Weather tab. Lat / lon stay on this device.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="opt-lat">Latitude</Label>
            <Input
              id="opt-lat"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              onBlur={(e) => {
                const raw = e.target.value.trim();
                if (!raw) {
                  setProfile({ lat: null });
                  setLat("");
                  return;
                }
                const n = Number(raw);
                if (Number.isFinite(n)) setProfile({ lat: n });
                else setLat(profile.lat == null ? "" : String(profile.lat));
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="opt-lon">Longitude</Label>
            <Input
              id="opt-lon"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              onBlur={(e) => {
                const raw = e.target.value.trim();
                if (!raw) {
                  setProfile({ lon: null });
                  setLon("");
                  return;
                }
                const n = Number(raw);
                if (Number.isFinite(n)) setProfile({ lon: n });
                else setLon(profile.lon == null ? "" : String(profile.lon));
              }}
            />
          </div>
        </div>
      </div>
    </CardContent>
  );
}

export function OptionsView() {
  const {
    modules,
    toggleModule,
    profile,
    setProfile,
    reset,
    wipeProfile,
    setView,
    windows,
    openWindow,
    closeWindow,
    closeAllWindows,
    notes,
    feeds,
    setFeedPack,
    dashOrder,
    setDashOrder,
    resetDash,
    marketPrefs,
    setMarketPrefs,
  } = useAtrium(
    useShallow((s) => ({
      modules: s.modules,
      toggleModule: s.toggleModule,
      profile: s.profile,
      setProfile: s.setProfile,
      reset: s.reset,
      wipeProfile: s.wipeProfile,
      setView: s.setView,
      windows: s.windows,
      openWindow: s.openWindow,
      closeWindow: s.closeWindow,
      closeAllWindows: s.closeAllWindows,
      notes: s.notes,
      feeds: s.feeds,
      setFeedPack: s.setFeedPack,
      dashOrder: s.dashOrder,
      setDashOrder: s.setDashOrder,
      resetDash: s.resetDash,
      marketPrefs: s.marketPrefs,
      setMarketPrefs: s.setMarketPrefs,
    })),
  );
  const pinned = notes.filter((n) => n.pinned).length;
  const modHint = useModHint();
  const profileFile = useRef<HTMLInputElement>(null);
  const [wipeOpen, setWipeOpen] = useState(false);

  function backupProfile() {
    downloadProfileBackup();
    toast("Profile file downloaded");
  }

  async function openProfileFile(file: File) {
    try {
      restoreProfileBackup(parseProfileBackup(await file.text()));
      toast("Profile restored — reloading");
      window.setTimeout(() => window.location.reload(), 400);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not open that file.");
    }
  }

  function confirmWipe() {
    wipeAtriumStorage();
    wipeProfile();
    setWipeOpen(false);
    toast("Desk wiped — start fresh");
    window.setTimeout(() => window.location.reload(), 400);
  }

  function jump(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="font-display text-2xl font-medium tracking-tight">Options</h2>
        <p className="text-xs text-muted-foreground">{APP_LABEL}</p>
      </div>
      <nav className="flex flex-wrap gap-2" aria-label="Jump to section">
        {JUMP.filter((s) => (s.id !== "opt-news" || modules.news) && (s.id !== "opt-markets" || modules.finance)).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => jump(s.id)}
            className="min-h-11 rounded-full border border-border bg-card px-3 text-xs text-muted-foreground hover:text-foreground"
          >
            {s.label}
          </button>
        ))}
      </nav>

      <Card id="opt-appearance" className="scroll-mt-4">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <AppearancePicker />
          <p className="mt-3 text-xs text-muted-foreground">
            Surfaces stay solid — no glass. The sun and moon in the header swap with the theme.
          </p>
        </CardContent>
      </Card>

      <Card id="opt-desk" className="scroll-mt-4">
        <CardHeader>
          <CardTitle>Floating desk</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Pop widgets out like sticky notes — calendar, weather, markets, headlines. Nothing floats until you pin a note or open one from this list or the desk menu. Drag the bar at the top, resize any corner, Esc to dock.
          </p>
          {DESK.filter((d) => !d.need || modules[d.need]).map((d) => {
            const win = windows.find((w) => w.kind === d.kind);
            return (
              <div key={d.kind} className="flex items-center justify-between border-b border-border py-3 last:border-0">
                <p className="text-sm">{WIDGET_LABEL[d.kind]}</p>
                <Button
                  variant={win ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => (win ? closeWindow(win.id) : openWindow(d.kind))}
                >
                  {win ? "Close" : "Float"}
                </Button>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            {pinned} pinned {pinned === 1 ? "note" : "notes"} on the desk.
          </p>
          {windows.length > 0 ? (
            <Button variant="outline" onClick={() => closeAllWindows()}>
              Close all widget windows
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card id="opt-dash" className="scroll-mt-4">
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Unlock the dashboard lock to drag cards, or step them here. Reset restores the factory order and widths.
          </p>
          {dashOrder.map((id, i) => (
            <div key={id} className="flex items-center justify-between gap-2 border-b border-border py-1 last:border-0">
              <p className="text-sm">{DASH_LABEL[id]}</p>
              <div className="flex">
                <button
                  type="button"
                  className="inline-flex size-11 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label={`Move ${DASH_LABEL[id]} up`}
                  disabled={i === 0}
                  onClick={() => setDashOrder(shiftDash(dashOrder, id as DashCard, -1))}
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  className="inline-flex size-11 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label={`Move ${DASH_LABEL[id]} down`}
                  disabled={i === dashOrder.length - 1}
                  onClick={() => setDashOrder(shiftDash(dashOrder, id as DashCard, 1))}
                >
                  <ChevronDown className="size-4" />
                </button>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={() => resetDash()}>
            Reset dashboard
          </Button>
        </CardContent>
      </Card>

      <Card id="opt-modules" className="scroll-mt-4">
        <CardHeader>
          <CardTitle>Modules</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between border-b border-border py-3">
            <div>
              <p className="text-sm">Calendar</p>
              <p className="text-xs text-muted-foreground">Core — always on</p>
            </div>
            <Switch checked disabled />
          </div>
          {OPTIONAL.map((m) => (
            <div key={m.id} className="flex items-center justify-between border-b border-border py-3 last:border-0">
              <div>
                <p className="text-sm">{m.label}</p>
                <p className="text-xs text-muted-foreground">{m.blurb}</p>
              </div>
              <Switch checked={modules[m.id]} onCheckedChange={() => toggleModule(m.id)} />
            </div>
          ))}
        </CardContent>
      </Card>

      {modules.finance ? (
        <Card id="opt-markets" className="scroll-mt-4">
          <CardHeader>
            <CardTitle>Stock tape</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Auto keeps PSE last on phisix and uses Yahoo for global last, sparks, and PE. Yahoo-only skips phisix.
            </p>
            <div className="flex flex-wrap gap-2">
              {STOCK_TAPES.map((t) => (
                <Chip
                  key={t.id}
                  active={(marketPrefs.stockTape ?? "auto") === t.id}
                  onClick={() => setMarketPrefs({ stockTape: t.id })}
                >
                  {t.label}
                </Chip>
              ))}
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {STOCK_TAPES.map((t) => (
                <li key={t.id}>
                  {t.label} — {t.blurb}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {modules.news ? (
        <Card id="opt-news" className="scroll-mt-4">
          <CardHeader>
            <CardTitle>News packs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Sources stay off until you pick them. A pack turns a slice on — not the whole catalog.
            </p>
            <div className="flex flex-wrap gap-2">
              {FEED_PACKS.map((p) => {
                const on = packIsOn(feeds, p.id);
                return (
                  <Chip key={p.id} active={on} onClick={() => setFeedPack(p.id, !on)}>
                    {p.label}
                  </Chip>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {FEED_PACKS.map((p) => `${p.label}: ${p.hint}`).join(" · ")}
            </p>
            <Button variant="outline" onClick={() => setView("news")}>
              Open briefing
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card id="opt-profile" className="scroll-mt-4">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <ProfileFields profile={profile} setProfile={setProfile} />
        <CardContent className="space-y-3 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            Backup is the whole desk — profile, notes, calendar, books, and feeds. Delete wipes this
            device so you can start with a blank desk and add everything yourself.
          </p>
          <input
            ref={profileFile}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void openProfileFile(file);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={backupProfile}>
              Backup profile
            </Button>
            <Button variant="outline" onClick={() => profileFile.current?.click()}>
              Restore profile
            </Button>
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setWipeOpen(true)}>
              Delete profile
            </Button>
          </div>
        </CardContent>
      </Card>
      <Dialog open={wipeOpen} onOpenChange={setWipeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this profile?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Clears name, notes, calendar, books, watchlist, and feeds on this device. Backup first if
            you want it back. This cannot be undone.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmWipe}>
              Wipe and start fresh
            </Button>
            <Button variant="outline" onClick={() => setWipeOpen(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card id="opt-keys" className="scroll-mt-4">
        <CardHeader>
          <CardTitle>Shortcuts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between gap-4 border-b border-border py-2">
            <span className="text-muted-foreground">Command bar</span>
            <kbd className="rounded-sm bg-muted px-2 py-0.5 font-mono text-xs">{modHint}</kbd>
          </div>
          <div className="flex justify-between gap-4 border-b border-border py-2">
            <span className="text-muted-foreground">Add a sticky</span>
            <span className="font-mono text-xs">note: call the bank</span>
          </div>
          <div className="flex justify-between gap-4 border-b border-border py-2">
            <span className="text-muted-foreground">Log an expense</span>
            <span className="font-mono text-xs">spend 500 Grab</span>
          </div>
          <div className="flex justify-between gap-4 border-b border-border py-2">
            <span className="text-muted-foreground">Dock top window</span>
            <kbd className="rounded-sm bg-muted px-2 py-0.5 font-mono text-xs">Esc</kbd>
          </div>
          <div className="flex justify-between gap-4 py-2">
            <span className="text-muted-foreground">New event</span>
            <span className="font-mono text-xs">Lunch Friday 1pm</span>
          </div>
        </CardContent>
      </Card>

      <DeskStorage />

      <Card id="opt-data" className="scroll-mt-4">
        <CardHeader>
          <CardTitle>Calendar & data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Atrium stays on this device. Hook Fantastical, Google, Outlook, or Apple by exporting an .ics or
            pasting a public iCal URL on the Calendar screen. Google Calendar can also be pulled when this
            app is opened through a connected Grok session.
          </p>
          <p>
            Cash books still have their own JSON on the Cash tab. The profile backup above is the
            whole desk.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setView("finance")}>
              Cash books backup
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                reset();
                toast("Sample desk loaded");
              }}
            >
              Load sample desk
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
