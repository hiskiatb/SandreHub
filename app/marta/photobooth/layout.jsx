"use client";
/**
 * Layout /marta/photobooth/** — TIDAK LAGI blanket-install PWA di semua
 * sub-halaman ("pisahkan yang untuk mobile dan operator, agar bisa di add
 * to homescreen itu hanya yang bagian kamera hp saja"). Sebelumnya file ini
 * mendaftarkan manifest + service worker Photobooth utk SEMUA route di
 * bawah /marta/photobooth/ (termasuk Panel Operator, Galeri, Upload Hasil
 * Gemini, Viewer) - jadi tombol "Tambah ke Layar Utama" browser bisa muncul
 * di halaman operator juga, yg tidak masuk akal (operator kerja dari
 * laptop/PC panitia, bukan aplikasi yg mereka install di HP).
 *
 * Sekarang link manifest & registrasi service worker dipindah ke
 * `_pwa.jsx` (PhotoboothPwaHead + usePhotoboothServiceWorker) dan CUMA
 * dipasang manual di halaman2 Mode Kamera tamu:
 * - /marta/photobooth/go (pilih sesi)
 * - /marta/photobooth/upload/[code] (kamera live + upload tamu)
 * Halaman Panel Operator (root, gallery, gemini, viewer) TIDAK memanggil
 * helper itu, jadi browser tidak akan menawarkan install di sana.
 *
 * UPDATE (permintaan user - "masih ada loading yang screen putih"): halaman
 * tamu (go & upload/[code]) semuanya SUDAH pakai tema gelap + FpAmbientBg
 * begitu komponennya ter-render - tapi SEBELUM bundle JS selesai dieksekusi
 * (fase paint pertama/hydrasi), background yg kelihatan adalah punya
 * `<body>` dr root layout (app/layout.js: `background: var(--background)`,
 * DEFAULT TERANG krn halaman tamu ini tdk pernah set data-theme="dark" di
 * localStorage spt panel operator) - jadi tetap ada kilatan putih SEKEJAP
 * sblm React sempat menggambar FpDarkScreen gelapnya. Layout ini skrg
 * mendeteksi route tamu (go/upload) dari pathname & langsung membungkus
 * children dgn div gelap FULL-BLEED sblm konten anaknya ter-render apa pun -
 * div pembungkus ini ikut ke-render di HTML AWAL (server-rendered, bukan
 * nunggu useEffect), jadi background gelap sudah ada di cat pertama,
 * BUKAN lagi nunggu state React di dalam page.jsx. Rute Panel Operator
 * (root, gallery, gemini, viewer) TIDAK match pathname di bawah -> tetap
 * passthrough biasa, warna terang bawaan tidak berubah.
 */
import { usePathname } from "next/navigation";

const GUEST_ROUTE_PREFIXES = ["/marta/photobooth/go", "/marta/photobooth/upload"];

export default function PhotoboothLayout({ children }) {
  const pathname = usePathname() || "";
  const isGuestRoute = GUEST_ROUTE_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isGuestRoute) return children;
  return (
    <div style={{ minHeight: "100svh", background: "#0A0A0B", colorScheme: "dark" }}>
      {children}
    </div>
  );
}
