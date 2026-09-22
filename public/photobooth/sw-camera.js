/**
 * Service worker PWA "FlashPrint Camera" (scope: /marta/photobooth/) -
 * dipisah dari sw-scanner.js ("pisahkan camera dan scanner jadi PWA yang
 * terpisah") supaya tamu bisa install ikon "Camera" tersendiri di HP-nya,
 * beda dari ikon "Scanner" yg dipakai operator/petugas pemindai QR.
 * Filosofi sama dgn sw.js lama: online-only (semua data live dari Supabase
 * MARTAHUB), SW ini cuma (1) bikin app installable, (2) cache shell statis
 * (ikon/manifest) biar load pertama lebih cepat - HTML navigasi tetap
 * NETWORK-FIRST supaya deploy baru & data sesi terbaru selalu kepakai.
 */
const CACHE_NAME = "photobooth-camera-shell-v1";
const CACHE_FIRST_ASSETS = [
  "/photobooth/manifest-camera.webmanifest",
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
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (CACHE_FIRST_ASSETS.some((a) => url.pathname === a)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
    return;
  }

  // Cuma ambil alih halaman KAMERA tamu (go & upload/[code]), BUKAN
  // /marta/photobooth/scan/** - itu diurus sw-scanner.js sendiri (scope-nya
  // lebih spesifik jadi otomatis menang di subtree itu, tapi dijaga juga
  // di sini biar jelas & tidak tumpang tindih cache-nya).
  if (
    request.mode === "navigate" &&
    url.pathname.startsWith("/marta/photobooth") &&
    !url.pathname.startsWith("/marta/photobooth/scan")
  ) {
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
