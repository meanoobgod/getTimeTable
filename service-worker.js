/* ============================================================
   service-worker.js — Full offline support for Time Table app
   ============================================================
   • Caches every page, CSV, JSON, and CDN script.
   • Serves cached copies instantly (works fully offline).
   • Revalidates in the background when online.
   • Uses ignoreSearch:true so time_table.html?roll=...&sem=...
     matches the cached time_table.html (no query-string cache miss).
   • Safe fallback to index.html for offline navigations.
   ============================================================
   ⚠️  BUMP CACHE_VERSION every time you change this file OR
       update any CSV / JSON / HTML.
   ============================================================ */
const CACHE_VERSION = "v2.0.1";
const CACHE_NAME    = `timetable-${CACHE_VERSION}`;

/* -------- Files to pre-cache on install -------- */
const ASSETS = [
  // App shell
  "./",
  "./index.html",
  "./time_table.html",
  "./time_table_teacher.html",
  "./manifest.json",
  "./icon.svg",

  // Data files
  "./Clean_teachers.csv",
  "./Clean_I_Sem_student_list.csv",
  "./Clean_III_Sem_student_list.csv",
  "./Clean_V_Sem_student_list.csv",
  "./Clean_VII_Sem_student_list.csv",
  "./Clean_semI_routen.json",
  "./Clean_semIII_routen.json",
  "./Clean_semV_routen.json",
  "./Clean_semVII_routen.json",

  // CDN libraries
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"
];

/* ============================================================
   INSTALL — download and cache every asset
   Uses allSettled so one failed CDN fetch doesn't kill install.
   ============================================================ */
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(
      ASSETS.map((url) =>
        cache.add(url).catch((err) =>
          console.warn("[SW] Failed to cache:", url, err)
        )
      )
    );
    await self.skipWaiting();   // activate immediately
  })());
});

/* ============================================================
   ACTIVATE — delete every old cache version
   ============================================================ */
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k !== CACHE_NAME)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();  // take control of open tabs
  })());
});

/* ============================================================
   FETCH — stale-while-revalidate
   ⭐ Fix: cache.match uses { ignoreSearch: true } so URLs with
      query strings (e.g. ?roll=U26BB102&sem=I) hit the cached
      time_table.html / time_table_teacher.html.
   ============================================================ */
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== "GET") return;

  const url          = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isCDN        = url.hostname.includes("cdnjs.cloudflare.com");

  // Ignore everything else (analytics, fonts, etc.)
  if (!isSameOrigin && !isCDN) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    // ⭐ THE KEY LINE — ignore query string when matching
    const cached = await cache.match(request, { ignoreSearch: true });

    // Kick off a background network fetch (fire-and-forget revalidate)
    const networkPromise = fetch(request)
      .then((response) => {
        if (
          response &&
          response.status === 200 &&
          response.type !== "opaque"
        ) {
          // Store under the URL WITHOUT the query string, so all
          // future ?roll=… requests match this same entry cleanly.
          const clean = new URL(request.url);
          clean.search = "";
          cache
            .put(clean.toString(), response.clone())
            .catch(() => { /* ignore quota / opaque errors */ });
        }
        return response;
      })
      .catch(() => null);   // network failure → null (offline case)

    // Cache hit → serve instantly, refresh in background
    if (cached) {
      networkPromise;      // not awaited on purpose
      return cached;
    }

    // Cache miss → wait for network
    const fresh = await networkPromise;
    if (fresh) return fresh;

    // ---------- True offline fallbacks ----------
    if (request.mode === "navigate") {
      // Any navigation (including ?roll=…) → serve cached index.html
      const fallback = await cache.match("./index.html", { ignoreSearch: true });
      if (fallback) return fallback;

      return new Response(
        `<!DOCTYPE html><html><head><meta charset="utf-8">
         <title>Offline</title></head>
         <body style="font-family:system-ui,sans-serif;text-align:center;padding:48px;">
           <h1>Offline</h1>
           <p>The app has not been cached yet. Please connect to the internet for the first load.</p>
         </body></html>`,
        { headers: { "Content-Type": "text/html" }, status: 503 }
      );
    }

    return new Response("Offline", { status: 503 });
  })());
});
