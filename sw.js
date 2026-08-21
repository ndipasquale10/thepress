const CACHE_NAME = "thepress-shell-v7";
const STATIC_ASSETS = [
  "./manifest.json",
  "./logo.png",
  "./logo-192.png",
  "./logo-64.png",
  // Image export lives in its own file so it stays out of the app shell. It is
  // precached so "Save Image" still works with no signal on a course.
  "./html2canvas.min.js",
];

self.addEventListener("install", (event) => {
  // Deliberately not cache.addAll(): that rejects atomically, so a single
  // renamed or missing asset fails the whole install, the worker never
  // activates, and the app silently loses offline support entirely. Cache
  // each asset on its own and let the stragglers be fetched on demand.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(STATIC_ASSETS.map((a) => cache.add(a).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// A revalidate usually finishes after the freshly-loaded page has already
// missed the push, and the worker is often terminated between navigations, so
// an in-memory flag is gone by the time the next page asks. Park the notice in
// the cache instead, which survives both, and hand it to the first page that
// asks for it.
const UPDATE_FLAG = "./__shell-updated__";

async function announceUpdate() {
  const cache = await caches.open(CACHE_NAME);
  await cache.put(UPDATE_FLAG, new Response("1"));
  const cs = await self.clients.matchAll({ type: "window" });
  cs.forEach((c) => c.postMessage({ type: "shell-updated" }));
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "check-update") return;
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      if (!(await cache.match(UPDATE_FLAG))) return;
      // Clear it first so only one page prompts, and only once.
      await cache.delete(UPDATE_FLAG);
      event.source?.postMessage({ type: "shell-updated" });
    })
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isAppShell = url.origin === self.location.origin && (url.pathname === "/" || url.pathname.endsWith("/index.html"));

  if (isAppShell) {
    // Stale-while-revalidate. This app gets used on golf courses, where the
    // signal is often one bar or none: network-first meant every launch sat
    // waiting on that network before falling back to a shell already sitting
    // in cache. Serve the cached shell immediately and refresh it in the
    // background instead.
    //
    // The cost is that a new deploy lands on the *next* launch rather than
    // this one, so the revalidate compares what it fetched against what was
    // cached and tells the page when they differ -- the page then offers a
    // reload, which keeps the old network-first promise that fixes reach
    // users without making every launch pay for it.
    // Bypass the HTTP cache for the revalidate specifically: served from it,
    // this compares the stale copy against itself and no deploy is ever
    // noticed.
    const network = fetch(
      new Request(req.url, { cache: "no-cache", credentials: "same-origin" })
    )
      .then(async (res) => {
        if (!res || !res.ok) return res;
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        if (cached) {
          const [a, b] = await Promise.all([
            cached.clone().text(),
            res.clone().text(),
          ]);
          if (a !== b) await announceUpdate();
        }
        await cache.put(req, res.clone());
        return res;
      })
      .catch(() => null);

    // Both of these must be called synchronously, before any await: once the
    // handler has yielded, the event is no longer active and waitUntil throws
    // InvalidStateError -- which silently kills the whole revalidate, so the
    // cache never updates and no deploy is ever detected.
    event.waitUntil(network);
    event.respondWith(
      caches
        .open(CACHE_NAME)
        .then((cache) => cache.match(req))
        // Only wait on the network when there is nothing cached to show.
        .then((cached) => cached || network.then((res) => res || Response.error()))
    );
    return;
  }

  const isStaticAsset = url.origin === self.location.origin && STATIC_ASSETS.some((a) => url.pathname.endsWith(a.replace("./", "")));

  if (isStaticAsset) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        return res;
      }))
    );
  }
});
