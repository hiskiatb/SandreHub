"use client";
/**
 * Helper PWA Photobooth - dipakai HANYA di halaman2 "Mode Kamera" (tamu di
 * HP sendiri): /marta/photobooth/go, /marta/photobooth/upload/[code]
 * (kamera live tamu). SENGAJA TIDAK dipasang di halaman Panel Operator (root
 * /marta/photobooth, upload/[code]/gallery, upload/[code]/gemini, viewer)
 * per permintaan user: "pisahkan yang untuk mobile dan operator, agar bisa
 * di add to homescreen itu hanya yang bagian kamera hp saja" - link manifest
 * (yg memicu tombol "Tambah ke Layar Utama"/"Install" di browser) CUMA
 * dirender di halaman2 kamera tamu ini, bukan di seluruh /marta/photobooth/**
 * spt sebelumnya.
 *
 * File diawali underscore (`_pwa.jsx`) supaya TIDAK dianggap route oleh
 * Next.js App Router - murni modul helper biasa.
 */
import { useEffect } from "react";

export function PhotoboothPwaHead() {
  return (
    <>
      <link rel="manifest" href="/photobooth/manifest.webmanifest" />
      <link rel="icon" href="/photobooth/icon-192.png" />
      <link rel="apple-touch-icon" href="/photobooth/icon-192.png" />
      <meta name="theme-color" content="#0A0A0B" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="apple-mobile-web-app-title" content="FlashPrint" />
    </>
  );
}

export function usePhotoboothServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/photobooth/sw.js", { scope: "/marta/photobooth/" }).catch(() => {});
  }, []);
}
