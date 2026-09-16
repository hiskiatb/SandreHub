"use client";
/**
 * Lightbox foto pakai PhotoSwipe (https://photoswipe.com) - dipilih drpd
 * bikin gesture pinch-zoom/pan/swipe sendiri dari nol (lihat diskusi user
 * 2026-09-16: minta lib ringan yg sudah teruji, "sejenis photo-swipe").
 * Dipakai baik di detail Aktivitas (foto yg SUDAH tersubmit) maupun bisa
 * dipakai ulang di tempat lain yg py galeri foto serupa.
 *
 * API-nya sengaja bukan komponen React (tidak perlu render apa pun sendiri)
 * - cukup panggil `openPhotoLightbox(photos, startIndex)` dari onClick, jadi
 * pemanggil tidak perlu simpan state lightbox terpisah, mount komponen
 * tambahan, atau import CSS PhotoSwipe di tiap halaman.
 */

// CSS PhotoSwipe di-import statis di sini (bukan di tiap halaman pemanggil)
// - modul ini "use client", jadi Next.js tetap membundelnya dgn benar, dan
// begitu file ini di-dynamic-import PERTAMA KALI (lihat openPhotoLightbox),
// stylesheet-nya otomatis ikut ke-load bareng, tidak perlu diurus manual
// oleh setiap halaman yg memakai lightbox ini.
import "photoswipe/style.css";

// Ukuran asli foto WAJIB diketahui PhotoSwipe utk hitung level zoom/posisi -
// diukur dari blob yg SUDAH ada di memori (bukan network baru), jadi instan,
// tidak ada flicker/loading tambahan drpd yg sudah dialami user.
function measure(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1600, height: img.naturalHeight || 1200 });
    img.onerror = () => resolve({ width: 1600, height: 1200 });
    img.src = src;
  });
}

function downloadIconSvg() {
  return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`;
}

/**
 * @param {Array<{id?:string, url:string}>} photos - hanya yg `url`-nya sudah
 *   siap (blob) yg dikirim, sisanya (msh loading/gagal) disaring pemanggil.
 * @param {number} startIndex - foto mana yg diklik pertama.
 * @param {{ filenamePrefix?: string }} [opts]
 */
export async function openPhotoLightbox(photos, startIndex = 0, opts = {}) {
  if (typeof window === "undefined" || !photos?.length) return;
  const { default: PhotoSwipeLightbox } = await import("photoswipe/lightbox");
  const dataSource = await Promise.all(
    photos.map(async (p, i) => {
      const { width, height } = await measure(p.url);
      return { src: p.url, width, height, alt: "", _idx: i };
    })
  );

  const lightbox = new PhotoSwipeLightbox({
    dataSource,
    index: Math.max(0, Math.min(startIndex, dataSource.length - 1)),
    pswpModule: () => import("photoswipe"),
    bgOpacity: 0.94,
    showHideAnimationType: "zoom",
    showAnimationDuration: 220,
    hideAnimationDuration: 200,
    wheelToZoom: true,
    // Pinch-to-zoom & swipe antar foto keduanya BAWAAN PhotoSwipe (tidak
    // perlu konfigurasi tambahan) - ini yg mengganti overlay <img> statis
    // lama yg tidak bisa di-zoom/geser sama sekali.
    padding: { top: 24, bottom: 40, left: 12, right: 12 },
  });

  // Tombol Download - foto blob: URL (sudah ada di memori device, bukan
  // link Google Drive/Storage langsung - lihat mediaProxy.js) jadi cukup
  // <a download> biasa, tidak perlu fetch ulang apa pun.
  lightbox.on("uiRegister", () => {
    lightbox.pswp.ui.registerElement({
      name: "download-button",
      order: 8,
      isButton: true,
      tagName: "button",
      html: downloadIconSvg(),
      title: "Unduh foto",
      onClick: (e, el, pswp) => {
        const slide = pswp.currSlide;
        if (!slide?.data?.src) return;
        const a = document.createElement("a");
        a.href = slide.data.src;
        const idx = (slide.index ?? 0) + 1;
        a.download = `${opts.filenamePrefix || "dokumentasi"}-${idx}.jpg`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      },
    });
  });

  lightbox.init();
  lightbox.loadAndOpen(Math.max(0, Math.min(startIndex, dataSource.length - 1)));
  return lightbox;
}
