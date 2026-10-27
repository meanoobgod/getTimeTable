/* ============================================================
   Service Worker — caches ALL pages, CSVs, JSONs, and CDN
   scripts so the app works fully offline after the first visit.
   ============================================================
   ⚠️ IMPORTANT: bump CACHE_VERSION whenever you update ANY of
   the CSV, JSON, HTML, or CSS files. Otherwise users will keep
   seeing the old cached copy.
   ============================================================ */
const CACHE_VERSION = "v1.0.0";
const CACHE_NAME    = `timetable-${CACHE_VERSION}`;

const ASSETS = [
  // pages & shell
  "./",
  "./index.html",
  "./time_table.html",
  "./time_table_teacher.html",
  "./manifest.json",
  "./icon.svg",

  // data files
  "./Clean_teachers.csv",
  "./Clean_I_Sem_student_list.csv",
  "./Clean_III_Sem_student_list.csv",
  "./Clean_V_Sem_student_list.csv",
  "./Clean_VII_Sem_student_list.csv",
  "./Clean_semI_routen.json",
  "./Clean_semIII_routen.json",
  "./Clean_semV_routen.json",
  "./Clean_semVII_routen.json",

  // CDN libs (jsPDF) — immutable versioned URLs
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"
];

/* -------- INSTALL: cache everything (tolerate individual failures) ------- */
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
    await self.skipWaiting(); // activate immediately
  })());
});

/* -------- ACTIVATE: clean up old versions of the cache ------------------- */
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    );
    await self.clients.claim(); // take control of open tabs
  })());
});

/* -------- FETCH: stale-while-revalidate --------------------------------
   1. Serve from cache instantly (works offline).
   2. Revalidate in background when online; new copy used next visit.
   ----------------------------------------------------------------------- */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url          = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isCDN        = url.hostname.includes("cdnjs.cloudflare.com");

  if (!isSameOrigin && !isCDN) return; // let browser handle everything else

  event.respondWith((async () => {
    const cache  = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    // Fire-and-forget revalidation
    const networkPromise = fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type !== "opaque") {
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      })
      .catch(() => null);

    if (cached) {
      networkPromise; // update in background
      return cached;
    }

    const fresh = await networkPromise;
    if (fresh) return fresh;

    // ---- offline fallbacks ----
    if (request.mode === "navigate") {
      const fallback = await cache.match("./index.html");
      if (fallback) return fallback;
      return new Response(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Offline</title></head>
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
