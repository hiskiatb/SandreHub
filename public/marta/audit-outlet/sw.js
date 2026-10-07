/**
 * Service worker minimal untuk PWA Pendataan Outlet (scope: /marta/audit-outlet/).
 * Sama pola dgn public/martahub/sw.js & public/promotor/sw.js: app ini
 * online-only (semua data live dari Supabase project MartaHub) - jadi SW
 * ini TIDAK melakukan caching agresif/offline-first untuk data. Tugasnya
 * hanya:
 *   1. Membuat app ini "installable" (syarat wajib PWA: ada SW terdaftar).
 *   2. Cache app-shell statis (ikon, manifest) supaya load pertama setelah
 *      install lebih cepat, TANPA menyimpan/cache respons Supabase.
 *
 * HTML shell (`/marta/audit-outlet/isi`) NETWORK-FIRST (bukan cache-first)
 * - supaya DSE yg sudah install app ini selalu dapat versi terbaru stlh
 * deploy baru, cache cuma fallback kalau offline (sama fix spt v2 sw.js
 * martahub/promotor stlh bug "This page couldn't load" krn HTML lama).
 */
const CACHE_NAME = "ao-form-shell-v1";
const CACHE_FIRST_ASSETS = [
  "/marta/audit-outlet/manifest.webmanifest",
  "/marta/audit-outlet/icon-192.png",
  "/marta/audit-outlet/icon-512.png",
];
const NETWORK_FIRST_ASSETS = ["/marta/audit-outlet/isi"];
const SHELL_ASSETS = [...NETWORK_FIRST_ASSETS, ...CACHE_FIRST_ASSETS];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
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
  if (request.method !== "GET") return; // jangan sentuh POST (submit form, upload foto)
  const url = new URL(request.url);

  // Supabase & endpoint lain di luar origin sendiri: selalu network.
  if (url.origin !== self.location.origin) return;

  if (NETWORK_FIRST_ASSETS.some((a) => url.pathname === a)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (CACHE_FIRST_ASSETS.some((a) => url.pathname === a)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
  }
});
