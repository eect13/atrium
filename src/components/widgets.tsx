"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AppWindow,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  LocateFixed,
  RefreshCw,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import {
  CAT_COLORS,
  fmtDate,
  fmtWhen,
  fromManila,
  hourInTZ,
  isoDate,
  isoMonth,
  isAllDayEvent,
  manilaAt,
  manilaParts,
  peso,
  moneyQuote,
  pct,
  sameDay,
} from "@/lib/format";
import { useAfterPaint } from "@/lib/boot";
import { fetchMarkets, VS_PARAM, type MarketSnapshot } from "@/lib/prices";
import { useAtrium } from "@/lib/store";
import type { CalendarEvent, NewsItem, QuoteCcy, WidgetKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { fetchWeather, wmo, type WeatherPayload, type WmoKind } from "@/lib/weather";
import { locateMe } from "@/lib/locate";
import { bustPseCache } from "@/lib/sw-client";
import { Skeleton } from "@/components/ui/skeleton";

const QUOTES: [string, string][] = [
  ["Attention is the rarest and purest form of generosity.", "Simone Weil"],
  ["We are what we repeatedly do.", "Aristotle"],
  ["The calendar is a map of intention.", "Atrium"],
  ["Make it work, make it right, make it fast.", "Kent Beck"],
];

const WMO_ICON: Record<WmoKind, typeof Sun> = {
  sun: Sun,
  partly: CloudSun,
  cloud: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

const HOUR_PX = 48;
const DAY_START = 7;
const DAY_END = 21;

function hourLabel(hour: number) {
  const ap = hour >= 12 ? "pm" : "am";
  return `${hour % 12 || 12}${ap}`;
}

export function greet() {
  const hour = hourInTZ();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function todayQuote() {
  const day = Number.parseInt(isoDate().slice(-2), 10);
  return QUOTES[day % QUOTES.length];
}

const WEATHER_SNAP = "atrium.weather.snap";
const MARKET_SNAP = "atrium.markets.snap";

function readSnap<T>(key: string): T | undefined {
  if (typeof localStorage === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeSnap(key: string, value: unknown) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

export function useWeather() {
  const profile = useAtrium((s) => s.profile);
  const view = useAtrium((s) => s.view);
  const lat = Number(profile.lat);
  const lon = Number(profile.lon);
  const ready = useAfterPaint(view === "dashboard" ? 40 : 500, view === "dashboard");
  return useQuery({
    queryKey: ["weather", lat, lon],
    queryFn: async () => {
      const data = await fetchWeather({ data: { lat, lon } });
      writeSnap(WEATHER_SNAP, { lat, lon, data });
      return data;
    },
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
    placeholderData: (prev) => {
      if (prev) return prev;
      const snap = readSnap<{ lat: number; lon: number; data: WeatherPayload }>(WEATHER_SNAP);
      if (!snap?.data?.current) return undefined;
      if (Math.abs(snap.lat - lat) > 0.05 || Math.abs(snap.lon - lon) > 0.05) return undefined;
      return snap.data;
    },
    enabled: Number.isFinite(lat) && Number.isFinite(lon) && ready,
  });
}

export function WeatherBody() {
  const profile = useAtrium((s) => s.profile);
  const setProfile = useAtrium((s) => s.setProfile);
  const [locating, setLocating] = useState(false);
  const weather = useWeather();

  async function useMyLocation() {
    setLocating(true);
    try {
      const found = await locateMe();
      if (!found) {
        toast("Location blocked here — type a city in Options");
        return;
      }
      const city = found.hit.city || profile.city;
      setProfile({ lat: found.hit.lat, lon: found.hit.lon, city });
      toast(
        city
          ? found.via === "gps"
            ? `Weather pin: ${city}`
            : `Weather pin: ${city} (network)`
          : "Weather pin updated",
      );
    } finally {
      setLocating(false);
    }
  }

  const locateBtn = (
    <button
      type="button"
      className="inline-flex min-h-8 items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-60"
      onClick={() => void useMyLocation()}
      disabled={locating}
    >
      <LocateFixed className="size-3.5" />
      {locating ? "Locating…" : "Use my location"}
    </button>
  );

  if (weather.isPending && !weather.data) {
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Weather loading…</p>
        {locateBtn}
      </div>
    );
  }
  const payload = weather.data;
  if (weather.isError || payload?.error || !payload?.current || !payload.daily) {
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Weather unavailable.</p>
        <div className="flex items-center gap-3">
          {locateBtn}
          <button type="button" className="min-h-8 text-xs underline" onClick={() => void weather.refetch()}>
            Retry
          </button>
        </div>
      </div>
    );
  }
  const daily = payload.daily;
  const current = payload.current;
  const sky = wmo(current.weather_code);
  const Icon = WMO_ICON[sky.kind];
  const nowKey = isoDate();
  const nowHour = hourInTZ();
  const hourly = payload.hourly;
  const start = hourly
    ? hourly.time.findIndex((t) => t.startsWith(nowKey) && Number(t.slice(11, 13)) >= nowHour)
    : -1;
  const hours =
    hourly && start >= 0
      ? hourly.time.slice(start, start + 6).map((t, i) => ({
          t,
          temp: hourly.temperature_2m[start + i],
          rain: hourly.precipitation_probability?.[start + i],
          mm: hourly.precipitation?.[start + i],
        }))
      : [];

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{profile.city}</p>
        {locateBtn}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Icon className="size-10 shrink-0 text-ring" aria-hidden />
        <div className="flex items-baseline gap-3">
          <span className="font-display text-4xl tabular-nums">
            {Math.round(current.temperature_2m)}°
          </span>
          <span className="text-sm text-muted-foreground">
            {sky.label}
            <br />
            Feels {Math.round(current.apparent_temperature ?? current.temperature_2m)}°
            {" · "}
            Wind {Math.round(current.wind_speed_10m)} km/h
            {current.relative_humidity_2m != null
              ? ` · ${Math.round(current.relative_humidity_2m)}% hum`
              : ""}
          </span>
        </div>
      </div>
      {hours.length ? (
        <div className="mt-4 flex gap-1">
          {hours.map((h) => (
            <div key={h.t} className="flex-1 rounded-md bg-muted px-1 py-2 text-center text-xs text-muted-foreground">
              {hourLabel(Number(h.t.slice(11, 13)))}
              <strong className="mt-1 block text-sm text-foreground tabular-nums">{Math.round(h.temp)}°</strong>
              {h.rain != null && h.rain > 0 ? (
                <span className="tabular-nums">{h.rain}%</span>
              ) : h.mm != null && h.mm > 0 ? (
                <span className="tabular-nums">{h.mm.toFixed(1)}mm</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex gap-2">
        {daily.time.slice(0, 5).map((t, i) => {
          const daySky = wmo(daily.weather_code?.[i] ?? current.weather_code);
          const DayIcon = WMO_ICON[daySky.kind];
          return (
            <div key={t} className="flex flex-1 flex-col items-center rounded-md bg-muted px-1 py-2 text-xs text-muted-foreground">
              <DayIcon className="mb-1 size-3.5" aria-hidden />
              {new Date(`${t}T12:00:00+08:00`).toLocaleDateString("en-PH", {
                weekday: "short",
                timeZone: "Asia/Manila",
              })}
              <strong className="mt-1 text-sm text-foreground tabular-nums">
                {Math.round(daily.temperature_2m_max[i])}°
              </strong>
              <span className="tabular-nums">
                {Math.round(daily.temperature_2m_min?.[i] ?? daily.temperature_2m_max[i])}°
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AgendaBody() {
  const events = useAtrium((s) => s.events);
  const setView = useAtrium((s) => s.setView);
  const today = events
    .filter((e) => sameDay(e.start, new Date()))
    .toSorted((a, b) => +new Date(a.start) - +new Date(b.start));
  if (!today.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing on the calendar. Use the command bar: “Lunch Friday 1pm”.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {today.map((e) => (
        <button
          key={e.id}
          type="button"
          className="flex min-h-11 w-full items-start gap-3 text-left"
          onClick={() => setView("calendar")}
        >
          <span className="mt-1 size-2 shrink-0 rounded-full bg-ring" />
          <span>
            <span className="block text-sm">{e.title}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {fmtWhen(e)}
              {e.loc ? ` · ${e.loc}` : ""}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function layoutTimed(list: CalendarEvent[], startH: number) {
  const startMin = startH * 60;
  const raw = list
    .map((e) => {
      const s = manilaParts(new Date(e.start));
      const t = manilaParts(new Date(e.end));
      const a = s.hour * 60 + s.minute;
      let b = t.hour * 60 + t.minute;
      if (isoDate(new Date(e.end)) !== isoDate(new Date(e.start))) b += 24 * 60;
      if (b <= a) b = a + 30;
      return {
        e,
        a,
        b,
        top: ((a - startMin) / 60) * HOUR_PX,
        height: Math.max(36, ((b - a) / 60) * HOUR_PX),
      };
    })
    .toSorted((x, y) => x.a - y.a || y.b - x.b);

  const colUntil: number[] = [];
  return raw.map((item) => {
    let col = colUntil.findIndex((end) => end <= item.a);
    if (col < 0) {
      col = colUntil.length;
      colUntil.push(item.b);
    } else {
      colUntil[col] = item.b;
    }
    let cols = col + 1;
    for (const other of raw) {
      if (other.e.id === item.e.id) continue;
      if (other.a < item.b && other.b > item.a) cols = Math.max(cols, 2);
    }
    return { ...item, col, cols };
  });
}

export function CalendarPeek({
  date,
  embedded = false,
  onSelect,
}: {
  date?: Date;
  embedded?: boolean;
  onSelect?: (e: CalendarEvent) => void;
}) {
  const events = useAtrium((s) => s.events);
  const setView = useAtrium((s) => s.setView);
  const [day, setDay] = useState(() => isoDate(date ?? new Date()));
  const [now, setNow] = useState(() => new Date());
  const scroller = useRef<HTMLDivElement>(null);
  const todayKey = isoDate(now);

  useEffect(() => {
    if (date) setDay(isoDate(date));
  }, [date]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const days = useMemo(() => {
    const origin = manilaParts(now);
    return Array.from({ length: 7 }, (_, i) =>
      fromManila(origin.year, origin.month, origin.day - origin.weekdayIndex + i, 12),
    );
  }, [todayKey, now]);

  const byDay = useMemo(
    () => Object.groupBy(events, (e) => isoDate(new Date(e.start))),
    [events],
  );
  const list = useMemo(
    () => (byDay[day] ?? []).toSorted((a, b) => a.start.localeCompare(b.start)),
    [byDay, day],
  );
  const allDay = useMemo(() => list.filter(isAllDayEvent), [list]);
  const timed = useMemo(() => list.filter((e) => !isAllDayEvent(e)), [list]);
  const startH = useMemo(() => {
    const hours = timed.map((e) => manilaParts(new Date(e.start)).hour);
    return Math.min(DAY_START, ...hours, DAY_START);
  }, [timed]);
  const endH = useMemo(() => {
    const hours = timed.map((e) => manilaParts(new Date(e.end)).hour);
    return Math.max(DAY_END, ...hours, DAY_END);
  }, [timed]);
  const hours = useMemo(
    () => Array.from({ length: endH - startH + 1 }, (_, i) => startH + i),
    [startH, endH],
  );
  const blocks = useMemo(() => layoutTimed(timed, startH), [timed, startH]);
  const nowParts = manilaParts(now);
  const nowTop = ((nowParts.hour * 60 + nowParts.minute - startH * 60) / 60) * HOUR_PX;
  const showNow = day === todayKey && nowTop >= 0 && nowTop <= hours.length * HOUR_PX;
  const pick = (e: CalendarEvent) => {
    if (onSelect) onSelect(e);
    else setView("calendar");
  };

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const target = showNow ? nowTop - 72 : (blocks[0]?.top ?? 0) - 8;
    node.scrollTop = Math.max(0, target);
  }, [day, showNow, nowTop, blocks]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const key = isoDate(d);
          const on = key === day;
          const isToday = sameDay(d, now);
          const count = byDay[key]?.length ?? 0;
          const parts = manilaParts(d);
          return (
            <button
              key={key}
              type="button"
              onClick={() => setDay(key)}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center rounded-md text-xs",
                on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                isToday && !on && "ring-1 ring-ring",
              )}
            >
              <span>{parts.weekday.slice(0, 2)}</span>
              <span className="tabular-nums">{parts.day}</span>
              {count ? (
                <span className={cn("mt-0.5 size-1 rounded-full", on ? "bg-primary-foreground" : "bg-ring")} />
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.06em] text-muted-foreground">
          {fmtDate(manilaAt(day, 12).toISOString())}
        </p>
        {embedded ? null : (
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => setView("calendar")}
          >
            Full calendar
          </button>
        )}
      </div>
      {allDay.length ? (
        <div className="mt-2 space-y-1">
          {allDay.map((e) => (
            <button
              key={e.id}
              type="button"
              className="flex min-h-9 w-full items-center rounded-sm px-2 text-left text-xs"
              style={{ boxShadow: `inset 3px 0 0 ${CAT_COLORS[e.cat]}` }}
              onClick={() => pick(e)}
            >
              {e.title}
            </button>
          ))}
        </div>
      ) : null}
      <div ref={scroller} className="relative mt-2 min-h-0 flex-1 overflow-auto">
        <div className="relative" style={{ height: hours.length * HOUR_PX }}>
          {hours.map((hour, i) => (
            <div
              key={hour}
              className="absolute left-0 right-0 grid grid-cols-[2.75rem_1fr] border-b border-border"
              style={{ top: i * HOUR_PX, height: HOUR_PX }}
            >
              <span className="pt-1 text-right text-xs tabular-nums text-muted-foreground">
                {hourLabel(hour)}
              </span>
              <div />
            </div>
          ))}
          {blocks.map((item) => (
            <button
              key={item.e.id}
              type="button"
              className="absolute z-[1] overflow-hidden rounded-sm bg-muted px-2 py-1 text-left"
              style={{
                top: item.top,
                height: item.height,
                left: `calc(2.75rem + 6px + ${item.col} * ((100% - 2.75rem - 10px) / ${item.cols}))`,
                width: `calc((100% - 2.75rem - 10px) / ${item.cols} - 4px)`,
                boxShadow: `inset 3px 0 0 ${CAT_COLORS[item.e.cat]}`,
              }}
              onClick={() => pick(item.e)}
            >
              <span className="block truncate text-sm">{item.e.title}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {fmtWhen(item.e)}
                {item.e.loc ? ` · ${item.e.loc}` : ""}
              </span>
            </button>
          ))}
          {showNow ? (
            <div
              className="pointer-events-none absolute left-11 right-0 z-[2] flex items-center"
              style={{ top: nowTop }}
            >
              <span className="size-2 -translate-x-1 rounded-full bg-destructive" />
              <span className="h-px flex-1 bg-destructive" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function QuoteBody() {
  const q = todayQuote();
  if (!q?.[0]) {
    return <p className="text-sm text-muted-foreground">No quote today.</p>;
  }
  return (
    <div>
      <p className="font-display text-lg leading-snug">{q[0]}</p>
      <p className="mt-3 text-xs text-muted-foreground">— {q[1]}</p>
    </div>
  );
}

export function useMarkets() {
  const watch = useAtrium((s) => s.watch);
  const quoteCcy = useAtrium((s) => s.quoteCcy);
  const financeOn = useAtrium((s) => s.modules.finance);
  const view = useAtrium((s) => s.view);
  const ready = useAfterPaint(800, view === "finance");
  const ids = watch.filter((w) => w.kind === "crypto").map((w) => w.symbol);
  return useQuery({
    queryKey: ["markets", ids, quoteCcy],
    queryFn: async () => {
      const data = await fetchMarkets({ data: { ids, vs: VS_PARAM[quoteCcy] } });
      writeSnap(MARKET_SNAP, { ids, quoteCcy, data });
      return data;
    },
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    refetchInterval: ready ? 60_000 : false,
    refetchOnWindowFocus: true,
    retry: 1,
    enabled: financeOn && ready,
    placeholderData: (prev) => {
      if (prev) return prev;
      const snap = readSnap<{ ids: string[]; quoteCcy: QuoteCcy; data: MarketSnapshot }>(MARKET_SNAP);
      if (!snap?.data?.quotes) return undefined;
      if (snap.quoteCcy !== quoteCcy) return undefined;
      return snap.data;
    },
  });
}

export function WarmQueries() {
  const view = useAtrium((s) => s.view);
  useWeather();
  useMarkets();
  const pseReady = useAfterPaint(1400, view === "finance");
  useEffect(() => {
    if (!pseReady) return;
    void fetch("/api/pse").catch(() => undefined);
  }, [pseReady]);
  return null;
}

export function FinancePeek() {
  const { txs, accounts, watch } = useAtrium(
    useShallow((s) => ({ txs: s.txs, accounts: s.accounts, watch: s.watch })),
  );
  const prefix = isoMonth();
  const spent = txs.filter((t) => t.date.startsWith(prefix) && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const liquid = accounts.reduce((s, a) => s + a.balance, 0);
  const markets = useMarkets();
  const quotes = markets.data?.quotes ?? {};
  const quotesPending = markets.isPending && !markets.data;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.06em] text-muted-foreground">On hand</p>
        <button
          type="button"
          className="inline-flex min-h-8 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            bustPseCache();
            void markets.refetch();
          }}
          disabled={markets.isFetching && !markets.data}
        >
          <RefreshCw className={cn("size-3", markets.isFetching && "animate-spin")} />
          {markets.isFetching && !markets.data ? "Updating" : "Live"}
        </button>
      </div>
      <p className="font-display text-3xl tabular-nums">{peso(liquid)}</p>
      <p className="mt-1 text-sm text-destructive">Spent this month {peso(spent)}</p>
      <div className="mt-4 space-y-2" aria-busy={quotesPending || undefined}>
        {watch.slice(0, 4).map((w) => {
          const q = quotes[w.symbol];
          const ch = q?.change;
          return (
            <div key={w.id} className="flex justify-between text-sm">
              <span className="font-mono text-muted-foreground">{w.label}</span>
              {quotesPending && !q ? (
                <Skeleton className="h-4 w-24" />
              ) : (
                <span className={`tabular-nums ${ch == null ? "" : ch >= 0 ? "text-ok" : "text-destructive"}`}>
                  {q ? moneyQuote(q.price, q.ccy) : "—"}
                  {q && ch != null ? ` ${pct(ch)}` : ""}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {markets.isError || markets.data?.failed ? (
        <button type="button" className="mt-2 text-xs underline" onClick={() => void markets.refetch()}>
          Retry prices
        </button>
      ) : null}
    </div>
  );
}

export function QuoteRow({
  label,
  price,
  change,
  ccy = "PHP",
}: {
  label: string;
  price?: number;
  change?: number;
  ccy?: QuoteCcy;
}) {
  const ch = change ?? 0;
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border text-sm">
      <span className="font-mono">{label}</span>
      <span className={`tabular-nums ${ch >= 0 ? "text-ok" : "text-destructive"}`}>
        {price != null ? moneyQuote(price, ccy) : "—"}
        {price != null && change != null ? ` ${pct(ch)}` : ""}
      </span>
    </div>
  );
}

export function NotesPeek() {
  const notes = useAtrium((s) => s.notes);
  const setView = useAtrium((s) => s.setView);
  return (
    <div className="space-y-2">
      {notes.slice(0, 4).map((n) => (
        <button
          key={n.id}
          type="button"
          className="flex min-h-11 w-full items-center gap-3 text-left text-sm"
          onClick={() => setView("notes")}
        >
          <span className="size-2 rounded-full" style={{ background: n.color }} />
          <span className="truncate">{n.text.split("\n")[0] || "Untitled"}</span>
        </button>
      ))}
      {!notes.length && <p className="text-sm text-muted-foreground">No stickies yet.</p>}
    </div>
  );
}

export function NewsPeek({
  headlines,
  loading = false,
  error = false,
}: {
  headlines: NewsItem[];
  loading?: boolean;
  error?: boolean;
}) {
  if (!headlines.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {error ? "Headlines unavailable." : loading ? "Fetching briefing…" : "No headlines yet."}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {headlines.slice(0, 5).map((n) => (
        <a key={`${n.src}-${n.link}-${n.title}`} href={n.link} target="_blank" rel="noopener noreferrer" className="block">
          <span className="block text-sm leading-snug">{n.title}</span>
          <span className="text-xs text-muted-foreground">{n.src}</span>
        </a>
      ))}
    </div>
  );
}

export function WidgetBody({
  kind,
  headlines,
  newsLoading,
  newsError,
}: {
  kind: WidgetKind;
  headlines: NewsItem[];
  newsLoading?: boolean;
  newsError?: boolean;
}) {
  if (kind === "weather") return <WeatherBody />;
  if (kind === "agenda") return <AgendaBody />;
  if (kind === "calendar") return <CalendarPeek />;
  if (kind === "quote") return <QuoteBody />;
  if (kind === "finance") return <FinancePeek />;
  return <NewsPeek headlines={headlines} loading={newsLoading} error={newsError} />;
}

export function FloatBtn({ kind }: { kind: WidgetKind }) {
  const openWindow = useAtrium((s) => s.openWindow);
  const on = useAtrium((s) => s.windows.some((w) => w.kind === kind));
  return (
    <button
      type="button"
      className={cn(
        "flex size-10 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground",
        on && "text-foreground",
      )}
      aria-label={on ? "Show floating window" : "Float on desk"}
      title={on ? "Show floating window" : "Float on desk"}
      onClick={() => openWindow(kind)}
    >
      <AppWindow className="size-4" />
    </button>
  );
}

export function DeskMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const { openWindow, windows, closeWindow, closeAllWindows, modules } = useAtrium(
    useShallow((s) => ({
      openWindow: s.openWindow,
      windows: s.windows,
      closeWindow: s.closeWindow,
      closeAllWindows: s.closeAllWindows,
      modules: s.modules,
    })),
  );
  const items: { kind: WidgetKind; label: string }[] = [
    { kind: "weather", label: "Weather" },
    { kind: "calendar", label: "Calendar" },
    { kind: "quote", label: "Quote" },
    ...(modules.finance ? [{ kind: "finance" as const, label: "Finance" }] : []),
    ...(modules.news ? [{ kind: "news" as const, label: "News" }] : []),
  ];

  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    window.addEventListener(
      "pointerdown",
      (e) => {
        if (!root.current?.contains(e.target as Node)) setOpen(false);
      },
      { signal: ac.signal },
    );
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        setOpen(false);
      },
      { signal: ac.signal, capture: true },
    );
    return () => ac.abort();
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        className="inline-flex size-10 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted"
        aria-label="Floating desk"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Floating desk"
        onClick={() => setOpen((o) => !o)}
      >
        <AppWindow className="size-4" />
      </button>
      {open ? (
        <div
          role="menu"
          data-desk-menu=""
          className="absolute right-0 top-11 z-50 w-56 rounded-lg bg-card p-2 text-card-foreground shadow-[var(--shadow-float)]"
        >
          <p className="px-2 pb-1 text-xs uppercase tracking-[0.06em] text-muted-foreground">Float on desk</p>
          {items.map((item) => {
            const win = windows.find((w) => w.kind === item.kind);
            return (
              <button
                key={item.kind}
                type="button"
                role="menuitem"
                className="flex h-11 w-full items-center justify-between rounded-md px-2 text-sm hover:bg-muted"
                onClick={() => {
                  if (win) closeWindow(win.id);
                  else openWindow(item.kind);
                }}
              >
                <span>{item.label}</span>
                <span className="text-xs text-muted-foreground">{win ? "Close" : "Open"}</span>
              </button>
            );
          })}
          {windows.length > 0 ? (
            <button
              type="button"
              role="menuitem"
              className="mt-1 flex h-11 w-full items-center rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => {
                closeAllWindows();
                setOpen(false);
              }}
            >
              Close all windows
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
