"use client";
/**
 * Layout khusus /marta/photobooth/** — bikin fitur Photobooth installable
 * sebagai PWA-nya SENDIRI, TERPISAH dari PWA MartaHub mobile
 * (app/martahub/m/layout.jsx). Sengaja dipisah krn dipakai dgn cara beda:
 * dibuka tamu tanpa login lewat QR di acara (upload/viewer per kode
 * sesi), bukan tim lapangan yg login harian - jadi wajar kalau tamu mau
 * "Add to Home Screen" versi Photobooth-nya sendiri, dgn ikon & nama beda
 * (bukan ikon MartaHub), tanpa scope-nya nyampur ke manifest MartaHub.
 *
 * metadata di sini TIDAK dieksport sbg `export const metadata` krn file
 * ini "use client" (perlu client component utk registrasi service worker
 * di bawah) - Next.js App Router tidak izinkan export metadata dari client
 * component, jadi manifest/icon di-set manual lewat <head> via komponen
 * kecil <PhotoboothHead/> di bawah (setara efeknya dgn metadata object).
 */
import { useEffect } from "react";

function PhotoboothHead() {
  return (
    <>
      <link rel="manifest" href="/photobooth/manifest.webmanifest" />
      <link rel="icon" href="/photobooth/icon-192.png" />
      <link rel="apple-touch-icon" href="/photobooth/icon-192.png" />
      <meta name="theme-color" content="#0A0A0B" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="apple-mobile-web-app-title" content="Photobooth" />
    </>
  );
}

export default function PhotoboothLayout({ children }) {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/photobooth/sw.js", { scope: "/marta/photobooth/" }).catch(() => {});
  }, []);

  return (
    <>
      <PhotoboothHead />
      {children}
    </>
  );
}
