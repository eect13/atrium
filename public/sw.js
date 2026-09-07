/* Atrium service worker.
 *
 * atrium-v2: versioned cache, TTL on PSE, never store empty tapes, SWR icons,
 * cache-first fonts, ignore HTML/JS/POST/__grok. Messages: SKIP_WAITING, INVALIDATE.
 */
const CACHE = "atrium-v2";
const PRECACHE = ["/favicon.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];
const PSE_FRESH_MS = 60_000;
const PSE_STALE_MS = 60 * 60_000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (data.type === "INVALIDATE") {
    event.waitUntil(invalidate(data.urls));
  }
});

async function invalidate(urls) {
  if (!urls || !urls.length) {
    await caches.delete(CACHE);
    return;
  }
  const cache = await caches.open(CACHE);
  const keys = await cache.keys();
  await Promise.all(
    keys
      .filter((req) =>
        urls.some((u) => {
          try {
            const want = new URL(u, self.location.origin);
            const got = new URL(req.url);
            return got.origin === want.origin && got.pathname === want.pathname;
          } catch {
            return req.url.includes(String(u));
          }
        }),
      )
      .map((req) => cache.delete(req)),
  );
}

function kindOf(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.pathname === "/sw.js") return null;
  if (parsed.pathname.startsWith("/__grok")) return null;
  if (parsed.origin === self.location.origin && parsed.pathname === "/api/pse") return "pse";
  if (parsed.origin === self.location.origin && /\.(svg|png|jpe?g|webp|ico)$/i.test(parsed.pathname)) {
    return "static";
  }
  if (parsed.hostname === "fonts.gstatic.com" || parsed.hostname === "fonts.googleapis.com") return "font";
  return null;
}

function canonGet(request) {
  const u = new URL(request.url);
  return new Request(u.origin + u.pathname, { method: "GET" });
}

function emptyPse() {
  return new Response(JSON.stringify({ rows: [] }), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function ageMs(res) {
  const stamped = Number(res.headers.get("x-atrium-cached"));
  if (Number.isFinite(stamped) && stamped > 0) return Date.now() - stamped;
  const date = Date.parse(res.headers.get("date") || "");
  if (Number.isFinite(date)) return Date.now() - date;
  return Number.POSITIVE_INFINITY;
}

function wantsNetwork(request) {
  const mode = request.cache;
  if (mode === "reload" || mode === "no-store") return true;
  const cc = request.headers.get("cache-control") || "";
  return /no-cache|max-age=0/i.test(cc);
}

async function putPse(cache, request, res) {
  if (!res || !res.ok) return;
  const buf = await res.clone().arrayBuffer();
  let rowsOk = false;
  try {
    const json = JSON.parse(new TextDecoder().decode(buf));
    rowsOk = Array.isArray(json.rows) && json.rows.length > 0;
  } catch {
    rowsOk = false;
  }
  if (!rowsOk) return;
  const headers = new Headers(res.headers);
  headers.set("x-atrium-cached", String(Date.now()));
  await cache.put(canonGet(request), new Response(buf, { status: res.status, statusText: res.statusText, headers }));
}

async function networkPse(request, cache) {
  const res = await fetch(request);
  await putPse(cache, request, res);
  return res;
}

async function pseStrategy(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(canonGet(request), { ignoreSearch: true });
  const force = wantsNetwork(request);

  if (force) {
    try {
      const fresh = await networkPse(request, cache);
      if (fresh && fresh.ok) return fresh;
    } catch {
      /* fall through to cache */
    }
    if (cached) return cached;
    return emptyPse();
  }

  if (cached) {
    const age = ageMs(cached);
    if (age < PSE_FRESH_MS) {
      return cached;
    }
    if (age < PSE_STALE_MS) {
      void networkPse(request, cache).catch(() => undefined);
      return cached;
    }
    try {
      const fresh = await networkPse(request, cache);
      if (fresh && fresh.ok) return fresh;
    } catch {
      /* stale fallback */
    }
    return cached;
  }

  try {
    const fresh = await networkPse(request, cache);
    if (fresh) return fresh;
  } catch {
    /* empty */
  }
  return emptyPse();
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const key = canonGet(request);
  const cached = await cache.match(key, { ignoreSearch: true });
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) void cache.put(key, res.clone());
      return res;
    })
    .catch(() => undefined);
  if (cached) {
    void network;
    return cached;
  }
  const fresh = await network;
  if (fresh) return fresh;
  return fetch(request);
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && fresh.ok) void cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const kind = kindOf(req.url);
  if (!kind) return;
  if (kind === "pse") {
    event.respondWith(pseStrategy(req));
    return;
  }
  if (kind === "static") {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  event.respondWith(cacheFirst(req));
});
