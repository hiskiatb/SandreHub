/**
 * Service worker minimal untuk PWA MartaHub mobile-web (scope: /martahub/m/).
 * Sama seperti Promotor (lihat public/promotor/sw.js): app ini online-only
 * (semua data live dari Supabase project MartaHub) — jadi SW ini TIDAK
 * melakukan caching agresif atau offline-first untuk data. Tugasnya hanya:
 *   1. Membuat app ini "installable" (syarat wajib PWA: ada SW terdaftar).
 *   2. Cache app-shell statis (ikon, manifest) supaya load pertama setelah
 *      install lebih cepat, TANPA menyimpan/cache respons Supabase — data
 *      (status plan, validasi, dsb) harus selalu real-time.
 */
const CACHE_NAME = "martahub-m-shell-v1";
const SHELL_ASSETS = [
  "/martahub/m",
  "/martahub/manifest.webmanifest",
  "/martahub/icon-192.png",
  "/martahub/icon-512.png",
];

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
  if (request.method !== "GET") return; // jangan sentuh POST/PATCH (submit plan/report dll.)
  const url = new URL(request.url);

  // Supabase & endpoint lain di luar origin sendiri: selalu network, tidak
  // pernah dari cache — status plan/validasi/transfer harus real-time.
  if (url.origin !== self.location.origin) return;

  // Hanya cache-first untuk app-shell statis (ikon/manifest); halaman &
  // script lain tetap network-first supaya update terbaru selalu terpakai.
  if (SHELL_ASSETS.some((a) => url.pathname === a)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
  }
});
