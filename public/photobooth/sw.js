/**
 * Service worker minimal untuk PWA "MartaHub Photobooth" (scope:
 * /marta/photobooth/). Sama filosofinya dgn public/promotor/sw.js &
 * public/martahub/sw.js: app ini online-only (semua data live dari
 * Supabase project MARTAHUB) — SW ini TIDAK caching agresif/offline-first
 * utk data, tugasnya cuma dua: (1) bikin app installable, (2) cache
 * ikon/manifest statis biar load pertama lebih cepat.
 *
 * Beda dari martahub/promotor: halaman-halaman Photobooth semuanya DINAMIS
 * per kode sesi (/marta/photobooth/upload/[code], /viewer/[code], /p/
 * [photoCode]) — jadi bukan daftar path statis, melainkan deteksi
 * `request.mode === "navigate"` utk semua HTML di scope ini, tetap
 * NETWORK-FIRST (supaya deploy baru & data sesi terbaru selalu kepakai,
 * cache cuma fallback kalau offline beneran).
 */
const CACHE_NAME = "photobooth-shell-v1";
const CACHE_FIRST_ASSETS = [
  "/photobooth/manifest.webmanifest",
  "/photobooth/icon-192.png",
  "/photobooth/icon-512.png",
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
  if (request.method !== "GET") return; // jangan sentuh POST (upload foto dll.)
  const url = new URL(request.url);

  // Supabase & apapun di luar origin sendiri: selalu network — data foto/
  // sesi harus selalu real-time, tidak boleh basi.
  if (url.origin !== self.location.origin) return;

  // Ikon/manifest: cache-first (statis, aman utk kecepatan load & syarat
  // "installable" PWA).
  if (CACHE_FIRST_ASSETS.some((a) => url.pathname === a)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
    return;
  }

  // Navigasi HTML (halaman apa saja di /marta/photobooth/..., termasuk yg
  // dinamis per kode sesi): NETWORK-FIRST, cache cuma fallback offline.
  if (request.mode === "navigate" && url.pathname.startsWith("/marta/photobooth")) {
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
