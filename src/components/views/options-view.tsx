"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LocateFixed } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { AppearancePicker } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAtrium } from "@/lib/store";
import { WIDGET_LABEL, type Profile, type WidgetKind } from "@/lib/types";
import { lookupPlace, mapsPin } from "@/lib/weather";
import { locateMe } from "@/lib/locate";

const OPTIONAL = [
  { id: "notes" as const, label: "Sticky notes", blurb: "Board plus pin-to-desktop floating windows." },
  { id: "finance" as const, label: "Finance watcher", blurb: "Cash books, Quotes board, backup, market watch." },
  { id: "news" as const, label: "News briefing", blurb: "RSS mosaic in the MSN style." },
];

const DESK: { kind: WidgetKind; need?: "finance" | "news" }[] = [
  { kind: "weather" },
  { kind: "calendar" },
  { kind: "quote" },
  { kind: "finance", need: "finance" },
  { kind: "news", need: "news" },
];

const JUMP = [
  { id: "opt-appearance", label: "Appearance" },
  { id: "opt-desk", label: "Desk" },
  { id: "opt-modules", label: "Modules" },
  { id: "opt-profile", label: "Profile" },
  { id: "opt-keys", label: "Shortcuts" },
  { id: "opt-data", label: "Data" },
];

function ProfileFields({ profile, setProfile }: { profile: Profile; setProfile: (p: Partial<Profile>) => void }) {
  const [name, setName] = useState(profile.name);
  const [city, setCity] = useState(profile.city);
  const [lat, setLat] = useState(String(profile.lat));
  const [lon, setLon] = useState(String(profile.lon));
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    setName(profile.name);
    setCity(profile.city);
    setLat(String(profile.lat));
    setLon(String(profile.lon));
  }, [profile.name, profile.city, profile.lat, profile.lon]);

  async function pinCity(raw: string) {
    const q = raw.trim() || "Las Piñas";
    setCity(q);
    const hit = await lookupPlace({ data: { name: q } });
    if (!hit) {
      setProfile({ city: q });
      toast("Could not map that place — coords unchanged");
      return;
    }
    setLat(String(hit.lat));
    setLon(String(hit.lon));
    setCity(hit.city);
    setProfile({ city: hit.city, lat: hit.lat, lon: hit.lon });
    toast(`Weather pin: ${hit.city}`);
  }

  async function useMyLocation() {
    setLocating(true);
    try {
      const found = await locateMe();
      if (!found) {
        toast("Location blocked here — type a city instead");
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

  const pin = mapsPin(profile.lat, profile.lon);
  const ns = profile.lat >= 0 ? "N" : "S";
  const ew = profile.lon >= 0 ? "E" : "W";
  const coord = `${Math.abs(profile.lat).toFixed(4)}° ${ns}  ${Math.abs(profile.lon).toFixed(4)}° ${ew}`;

  return (
    <CardContent className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor="opt-name">Name</Label>
        <Input
          id="opt-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={(e) => setProfile({ name: e.target.value.trim() || "Eric" })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="opt-city">City</Label>
        <Input
          id="opt-city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          onBlur={(e) => void pinCity(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void pinCity(e.currentTarget.value);
            }
          }}
        />
      </div>
      <div className="sm:col-span-2 rounded-xl bg-muted p-5">
        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Weather pin</p>
        <p className="mt-1 font-display text-2xl tracking-tight">{profile.city}</p>
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
          <a
            href={pin.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center text-xs text-muted-foreground hover:text-foreground"
          >
            Open pin in Maps
          </a>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Type a city and press Enter to recast the pin. Lat / lon stay on this device.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="opt-lat">Latitude</Label>
            <Input
              id="opt-lat"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              onBlur={(e) => {
                const n = Number(e.target.value);
                setProfile({ lat: Number.isFinite(n) ? n : 14.4508 });
                if (!Number.isFinite(n)) setLat("14.4508");
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
                const n = Number(e.target.value);
                setProfile({ lon: Number.isFinite(n) ? n : 120.9828 });
                if (!Number.isFinite(n)) setLon("120.9828");
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
    setView,
    windows,
    openWindow,
    closeWindow,
    closeAllWindows,
    notes,
  } = useAtrium(
    useShallow((s) => ({
      modules: s.modules,
      toggleModule: s.toggleModule,
      profile: s.profile,
      setProfile: s.setProfile,
      reset: s.reset,
      setView: s.setView,
      windows: s.windows,
      openWindow: s.openWindow,
      closeWindow: s.closeWindow,
      closeAllWindows: s.closeAllWindows,
      notes: s.notes,
    })),
  );
  const pinned = notes.filter((n) => n.pinned).length;

  function jump(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="font-display text-2xl font-medium tracking-tight">Options</h2>
      <nav className="flex flex-wrap gap-2" aria-label="Jump to section">
        {JUMP.map((s) => (
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
            Pop widgets out like sticky notes — calendar, weather, markets, headlines. Nothing floats until you pin a note or open one from this list or the desk menu. Drag the title bar, resize the corner, Esc to dock.
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

      <Card id="opt-profile" className="scroll-mt-4">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <ProfileFields profile={profile} setProfile={setProfile} />
      </Card>

      <Card id="opt-keys" className="scroll-mt-4">
        <CardHeader>
          <CardTitle>Shortcuts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between gap-4 border-b border-border py-2">
            <span className="text-muted-foreground">Command bar</span>
            <kbd className="rounded-sm bg-muted px-2 py-0.5 font-mono text-xs">Ctrl+K</kbd>
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

      <Card id="opt-data" className="scroll-mt-4">
        <CardHeader>
          <CardTitle>Calendar & data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Atrium is local-first. Hook Fantastical, Google, Outlook, or Apple by exporting an .ics or
            pasting a public iCal URL on the Calendar screen. Google Calendar can also be pulled when this
            app is opened through a connected Grok session.
          </p>
          <p>
            Cash books have their own backup: save a JSON file, open it on another device, or restore the
            last local copy. That lives on the Cash tab under Options — same idea as Finance Manager.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setView("finance")}>
              Cash books backup
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                reset();
                toast("Demo data restored");
              }}
            >
              Reset demo data
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
