"use client";
/**
 * Helper PWA Photobooth - SEKARANG 2 PWA TERPISAH ("scanner dan camera itu
 * menjadi pwa yang terpisah"):
 * - "camera" (dulu "Mode Kamera"/"Mobile") - halaman2 tamu di HP sendiri:
 *   /marta/photobooth/go, /marta/photobooth/upload/[code] (+ /prompt).
 *   Pakai ikon FlashPrint yg sudah ada (permintaan user: "gapapa pakai
 *   icon saat ini untuk camera").
 * - "scanner" - halaman HP operator utk scan QR Photo ID:
 *   /marta/photobooth/scan, /marta/photobooth/scan/[code]. Pakai ikon
 *   viewfinder QR baru (icon-scanner-*.png) biar beda jelas dr ikon Camera
 *   pas di-"Tambah ke Layar Utama".
 * Masing2 punya manifest & service worker sendiri (lihat public/photobooth/
 * manifest-camera.webmanifest + sw-camera.js vs manifest-scanner.webmanifest
 * + sw-scanner.js) - SENGAJA TIDAK dipasang di halaman Panel Operator
 * (root /marta/photobooth, viewer, dst) sama sekali, spt sebelumnya.
 *
 * File diawali underscore (`_pwa.jsx`) supaya TIDAK dianggap route oleh
 * Next.js App Router - murni modul helper biasa.
 */
import { useEffect } from "react";

const VARIANTS = {
  camera: {
    manifest: "/photobooth/manifest-camera.webmanifest",
    icon: "/photobooth/icon-192.png",
    sw: "/photobooth/sw-camera.js",
    scope: "/marta/photobooth/",
    title: "FlashPrint Camera",
  },
  scanner: {
    manifest: "/photobooth/manifest-scanner.webmanifest",
    icon: "/photobooth/icon-scanner-192.png",
    sw: "/photobooth/sw-scanner.js",
    scope: "/marta/photobooth/scan",
    title: "FlashPrint Scanner",
  },
};

export function PhotoboothPwaHead({ variant = "camera" }) {
  const v = VARIANTS[variant] || VARIANTS.camera;
  return (
    <>
      <link rel="manifest" href={v.manifest} />
      <link rel="icon" href={v.icon} />
      <link rel="apple-touch-icon" href={v.icon} />
      <meta name="theme-color" content="#0A0A0B" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="apple-mobile-web-app-title" content={v.title} />
    </>
  );
}

export function usePhotoboothServiceWorker(variant = "camera") {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const v = VARIANTS[variant] || VARIANTS.camera;
    navigator.serviceWorker.register(v.sw, { scope: v.scope }).catch(() => {});
  }, [variant]);
}
