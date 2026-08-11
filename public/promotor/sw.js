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
 *
 * v2 — perbaikan bug nyata: HTML shell (`/promotor`) sebelumnya di-cache
 * CACHE-FIRST bareng ikon/manifest. Begitu ada deploy baru, HP yang sudah
 * install app ini (home-screen icon) tetap memuat HTML LAMA dari cache —
 * yang merujuk ke file JS build lama yang sudah tidak ada di server begitu
 * deploy baru menggantikannya. Efeknya: app kelihatan kebuka tapi begitu
 * ada interaksi yang butuh chunk JS itu, gagal fetch → browser menampilkan
 * "This page couldn't load". PERBAIKAN: HTML shell sekarang NETWORK-FIRST
 * (coba internet dulu, cache cuma fallback kalau offline beneran) — ikon &
 * manifest (jarang berubah, aman) TETAP cache-first spy tetap cepat &
 * PWA tetap "installable" walau nama variabelnya sama SHELL_ASSETS.
 */
const CACHE_NAME = "pts-promotor-shell-v2";
const CACHE_FIRST_ASSETS = [
  "/promotor/manifest.webmanifest",
  "/promotor/icon-192.png",
  "/promotor/icon-512.png",
];
const NETWORK_FIRST_ASSETS = ["/promotor"];
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
  if (request.method !== "GET") return; // jangan sentuh POST/PATCH (submit klaim dll.)
  const url = new URL(request.url);

  // Data API (Supabase) & endpoint apapun di luar origin sendiri: selalu
  // network, tidak pernah dari cache — supaya status klaim/validasi GA
  // selalu real-time.
  if (url.origin !== self.location.origin) return;

  // HTML shell: NETWORK-FIRST — selalu coba ambil versi terbaru dari server
  // dulu (supaya deploy baru langsung kepakai), simpan salinannya ke cache
  // sekalian, dan HANYA pakai cache kalau network benar-benar gagal (mis.
  // offline) — bukan sumber utama.
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
