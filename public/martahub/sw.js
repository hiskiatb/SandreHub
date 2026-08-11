/**
 * Service worker minimal untuk PWA MartaHub mobile-web (scope: /martahub/m/).
 * Sama seperti Promotor (lihat public/promotor/sw.js): app ini online-only
 * (semua data live dari Supabase project MartaHub) — jadi SW ini TIDAK
 * melakukan caching agresif atau offline-first untuk data. Tugasnya hanya:
 *   1. Membuat app ini "installable" (syarat wajib PWA: ada SW terdaftar).
 *   2. Cache app-shell statis (ikon, manifest) supaya load pertama setelah
 *      install lebih cepat, TANPA menyimpan/cache respons Supabase — data
 *      (status plan, validasi, dsb) harus selalu real-time.
 *
 * v2 — perbaikan bug yang sama seperti public/promotor/sw.js: HTML shell
 * (`/martahub/m`) sebelumnya cache-first bareng ikon/manifest, jadi HP yang
 * sudah install app ini bisa memuat HTML LAMA setelah deploy baru (merujuk
 * chunk JS yang sudah tidak ada di server) → "This page couldn't load".
 * Sekarang HTML shell NETWORK-FIRST, cache cuma fallback kalau offline.
 */
const CACHE_NAME = "martahub-m-shell-v2";
const CACHE_FIRST_ASSETS = [
  "/martahub/manifest.webmanifest",
  "/martahub/icon-192.png",
  "/martahub/icon-512.png",
];
const NETWORK_FIRST_ASSETS = ["/martahub/m"];
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
  if (request.method !== "GET") return; // jangan sentuh POST/PATCH (submit plan/report dll.)
  const url = new URL(request.url);

  // Supabase & endpoint lain di luar origin sendiri: selalu network, tidak
  // pernah dari cache — status plan/validasi/transfer harus real-time.
  if (url.origin !== self.location.origin) return;

  // HTML shell: NETWORK-FIRST — selalu coba versi terbaru dari server dulu
  // (deploy baru langsung kepakai), simpan ke cache sekalian, cache cuma
  // dipakai kalau network benar-benar gagal (offline).
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

  // Ikon/manifest: cache-first (statis, jarang berubah, aman utk kecepatan
  // load pertama & syarat "installable" PWA).
  if (CACHE_FIRST_ASSETS.some((a) => url.pathname === a)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
  }
});
