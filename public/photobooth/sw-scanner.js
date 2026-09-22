/**
 * Service worker PWA "FlashPrint Scanner" (scope: /marta/photobooth/scan) -
 * PWA terpisah dari "FlashPrint Camera" (lihat sw-camera.js), scope-nya
 * SENGAJA lebih spesifik (cuma /marta/photobooth/scan/**) supaya HP yg
 * dipakai jadi scanner operator punya ikon & identitas app sendiri di
 * homescreen, terpisah dari ikon Camera tamu.
 */
const CACHE_NAME = "photobooth-scanner-shell-v1";
const CACHE_FIRST_ASSETS = [
  "/photobooth/manifest-scanner.webmanifest",
  "/photobooth/icon-scanner-192.png",
  "/photobooth/icon-scanner-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHE_FIRST_ASSETS)).catch(() => {})
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

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (CACHE_FIRST_ASSETS.some((a) => url.pathname === a)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
    return;
  }

  if (request.mode === "navigate" && url.pathname.startsWith("/marta/photobooth/scan")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request))
    );
  }
});
