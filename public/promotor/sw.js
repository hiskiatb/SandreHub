/**
 * Service worker minimal untuk PWA app Promotor (scope: /promotor/).
 * App ini online-only (semua data live dari Supabase) — jadi SW ini
 * TIDAK melakukan caching agresif atau offline-first untuk data. Tugasnya
 * hanya dua:
 *   1. Membuat app ini "installable" (syarat wajib PWA: ada SW terdaftar).
 *   2. Cache app-shell statis (ikon, manifest) supaya load pertama setelah
 *      install lebih cepat, TANPA menyimpan/cache respons Supabase (API
 *      call) — sengaja dilewati (network passthrough) agar data selalu
 *      real-time & tidak ada risiko data stale/basi untuk tagging klaim.
 */
const CACHE_NAME = "pts-promotor-shell-v1";
const SHELL_ASSETS = [
  "/promotor",
  "/promotor/manifest.webmanifest",
  "/promotor/icon-192.png",
  "/promotor/icon-512.png",
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
  if (request.method !== "GET") return; // jangan sentuh POST/PATCH (submit klaim dll.)
  const url = new URL(request.url);

  // Data API (Supabase) & endpoint apapun di luar origin sendiri: selalu
  // network, tidak pernah dari cache — supaya status klaim/validasi GA
  // selalu real-time.
  if (url.origin !== self.location.origin) return;

  // Hanya cache-first untuk app-shell statis (ikon/manifest); halaman &
  // script lain tetap network-first supaya update terbaru selalu terpakai.
  if (SHELL_ASSETS.some((a) => url.pathname === a)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
  }
});
