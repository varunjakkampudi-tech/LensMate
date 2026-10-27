/* LensMate service worker: caches only the public app shell and static bundle so the app opens offline.
 * It never caches broker or AI calls, captures, notes, credentials or any request with a query string or an
 * Authorization header. Everything else goes straight to the network. Bump CACHE when this file changes. */
const CACHE = "lensmate-static-v1";
const SHELL = [
  "/",
  "/manifest.json",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Paths that may be cached: the Expo static bundle, the app icons and the manifest. Matched on the exact path.
function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_expo/static/") ||
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/favicon.ico"
  );
}

// Decides whether a request may be cached. Exported through the global for the unit tests.
function shouldCache(request, url) {
  if (request.method !== "GET") return false;
  if (url.origin !== self.location.origin) return false;
  if (url.search !== "") return false;
  if (request.headers.get("authorization") !== null) return false;
  if (request.mode === "navigate") return url.pathname === "/";
  return isStaticAsset(url);
}

self.__lensmatePolicy = { shouldCache, isStaticAsset, CACHE, SHELL };

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

// The page asks the waiting worker to take over only after the user taps "Update", so the app never reloads mid-task.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!shouldCache(event.request, url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (event.request.mode === "navigate") {
        try {
          const fresh = await fetch(event.request);
          if (fresh.ok) cache.put("/", fresh.clone());
          return fresh;
        } catch {
          const shell = await cache.match("/");
          if (shell) return shell;
          throw new Error("offline and no app shell");
        }
      }
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok && response.type === "basic") cache.put(event.request, response.clone());
      return response;
    })(),
  );
});
