"use client";

/** Card 204: Options › Clock, Options › Widgets (and desktop widgets). One look for every widget. */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OptionsSwitchRow } from "@/components/ui/options-switch-row";
import { Switch } from "@/components/ui/switch";
import { useAtrium } from "@/lib/store";
import { nativeWindows } from "@/lib/platform";
import { LOOK_DEFAULTS, widgetLook, widgetOpts, type ClockStyle, type DeskSnap } from "@/lib/widget-prefs";
import { cn } from "@/lib/utils";

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          className={cn(
            "min-h-11 rounded-[calc(var(--radius-xl)-2px)] px-3.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === o.v ? "bg-background text-foreground ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
      </span>
      {children}
    </div>
  );
}

export function ClockOptionsCard() {
  const prefs = useAtrium((s) => s.dashPrefs);
  const setLook = useAtrium((s) => s.setWidgetLook);
  const setOpt = useAtrium((s) => s.setWidgetOpt);
  const look = widgetLook(prefs);
  const seconds = widgetOpts(prefs, "clock").seconds;
  return (
    <Card id="opt-clock" className="scroll-mt-4">
      <CardHeader>
        <CardTitle>Clock</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        <Row title="Clock style" hint="Used by the Clock widget and its desk float.">
          <Segmented<ClockStyle> label="Clock style" value={look.clockStyle} options={[{ v: "digital", label: "Digital" }, { v: "analog", label: "Analog" }]} onChange={(clockStyle) => setLook({ clockStyle })} />
        </Row>
        <OptionsSwitchRow title="Seconds" hint="Show seconds on the clock.">
          <Switch aria-label="Seconds" checked={seconds} onCheckedChange={(v) => setOpt("clock", "seconds", v)} />
        </OptionsSwitchRow>
      </CardContent>
    </Card>
  );
}

export function WidgetsOptionsCard() {
  const prefs = useAtrium((s) => s.dashPrefs);
  const setLook = useAtrium((s) => s.setWidgetLook);
  // Desktop widgets (native float windows) only: not on the website or phone.
  const floats = nativeWindows();
  const look = widgetLook(prefs);
  return (
    <Card id="opt-widgets" className="scroll-mt-4">
      <CardHeader>
        <CardTitle>Widgets</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        <OptionsSwitchRow title="Compact widgets" hint="Each widget shows one size smaller.">
          <Switch aria-label="Compact widgets" checked={look.compact} onCheckedChange={(compact) => setLook({ compact })} />
        </OptionsSwitchRow>
        {floats ? (
          <>
            <Row title="Desktop widget opacity" hint={`${look.deskOpacity}% · default ${LOOK_DEFAULTS.deskOpacity}%`}>
              <input
                type="range"
                min={40}
                max={100}
                step={2}
                aria-label="Desktop widget opacity"
                className="h-11 w-48 accent-foreground"
                value={look.deskOpacity}
                onChange={(e) => setLook({ deskOpacity: Number(e.target.value) })}
              />
            </Row>
            <Row title="Snap desktop widgets" hint="Edges: 24px from the screen edge. Grid: 24px steps.">
              <Segmented<DeskSnap>
                label="Snap desktop widgets"
                value={look.deskSnap}
                options={[
                  { v: "off", label: "Off" },
                  { v: "edges", label: "Edges" },
                  { v: "grid", label: "Grid" },
                ]}
                onChange={(deskSnap) => setLook({ deskSnap })}
              />
            </Row>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
