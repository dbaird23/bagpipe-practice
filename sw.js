// Service worker: precache the app shell so the drill works offline, and keep
// Google Fonts in a runtime cache so the type survives without a connection.
//
// Bump CACHE_VERSION whenever index.html / styles.css / app.js change; the new
// worker precaches the fresh copies and deletes every older cache on activate.
const CACHE_VERSION = "v6";
const SHELL_CACHE = "bagpipe-shell-" + CACHE_VERSION;
const FONT_CACHE = "bagpipe-fonts-" + CACHE_VERSION;

const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== FONT_CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

const isFont = (url) =>
  url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Fonts: serve from cache when present, otherwise fetch and keep a copy.
  if (isFont(url)) {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) =>
        cache.match(req).then((hit) =>
          hit || fetch(req).then((res) => {
            if (res.ok || res.type === "opaque") cache.put(req, res.clone());
            return res;
          }).catch(() => hit)
        )
      )
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Navigations: network first so a fresh deploy is picked up, falling back to
  // the cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html", { ignoreSearch: true }))
    );
    return;
  }

  // Everything else: cache first, refreshing the entry in the background.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const network = fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || network;
    })
  );
});
