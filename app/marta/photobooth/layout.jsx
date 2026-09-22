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
 * Layout ini sendiri sekarang cuma passthrough biasa.
 */
export default function PhotoboothLayout({ children }) {
  return children;
}
