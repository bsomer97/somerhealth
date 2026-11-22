// Service worker: makes the app installable and usable offline.
//
// App code (html/js/css) is NETWORK-FIRST: whenever you're online you get the
// newest version you pushed to GitHub, and the cached copy is only used
// offline. So — unlike the old app — you no longer have to bump a version
// number on every release for changes to show up.
//
// Big, rarely-changing files (exercise list, photos, Firebase SDK) are
// CACHE-FIRST so they load instantly and don't eat data.
//
// Firebase's own database traffic is never touched here; Firestore keeps
// its own offline copy.

const CACHE = "ourhealth-v1";
const APP_SHELL = [
  "./", "./index.html", "./manifest.json", "./css/style.css",
  "./js/config.js", "./js/store.js", "./js/app.js", "./js/cloud.js", "./js/muscle-map.js",
  "./js/views/workouts.js", "./js/views/food.js", "./js/views/progress.js", "./js/views/settings.js",
  "./js/vendor/body-highlighter.esm.js", "./data/exercises.json",
  "./icons/icon-192.png", "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cacheFirst(request) {
  return caches.match(request).then((cached) => cached || fetch(request).then((res) => {
    if (res && (res.ok || res.type === "opaque")) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
    }
    return res;
  }));
}

function networkFirst(request) {
  return fetch(request).then((res) => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
    }
    return res;
  }).catch(() => caches.match(request, { ignoreSearch: true }).then((c) => c || caches.match("./index.html")));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Firebase SDK files (versioned URLs, never change) and exercise photos.
  if (url.hostname === "www.gstatic.com" || url.hostname === "raw.githubusercontent.com") {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (url.origin !== self.location.origin) return; // Firestore, auth, etc.

  if (url.pathname.endsWith("/data/exercises.json") || url.pathname.includes("/data/images/") || url.pathname.includes("/icons/")) {
    event.respondWith(cacheFirst(req));
    return;
  }
  event.respondWith(networkFirst(req));
});
