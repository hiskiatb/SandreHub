"use client";
/**
 * useVisualViewportBox - {top, height} yg SELALU mengikuti area yg BENERAN
 * kelihatan di layar (window.visualViewport), bukan layout viewport statis.
 *
 * Kenapa dibutuhin: sheet/popup full-screen di app ini biasanya dibungkus
 * `position: "fixed", inset: 0` + tinggi dari unit `vh`. Itu jalan normal
 * SELAMA tidak ada keyboard virtual. Begitu ada <input autoFocus> di dalam
 * sheet (mis. search box) dan keyboard muncul, iOS Safari (& banyak WebView
 * Android) TIDAK mengecilkan layout viewport - browser cuma nge-scroll
 * halaman spy input yg fokus kelihatan di atas keyboard. Overlay yg
 * ukuran/posisinya dihitung dari layout viewport lama jadi ikut ke-geser
 * relatif thd area yg BENERAN kelihatan (visual viewport, yg tingginya
 * MENGECIL krn ketutup keyboard) - hasilnya bagian atas sheet (judul, dll)
 * kepotong/ketutup status bar, persis bug "Pilih Site" ke-crop yg
 * dilaporkan user.
 *
 * Fix: dengarkan `window.visualViewport.resize`/`scroll`, lalu pakai
 * `visualViewport.height` (tinggi yg BENERAN kelihatan skrg, sudah
 * memperhitungkan keyboard) & `visualViewport.offsetTop` (brp px area
 * kelihatan itu sudah tergeser dari titik nol layout viewport) sbg
 * `top`/`height` overlay - overlay jadi SELALU pas menutupi persis area yg
 * kelihatan, keyboard terbuka ataupun tidak.
 *
 * Fallback: browser tanpa `visualViewport` (jarang skrg) pakai
 * `window.innerHeight`/top:0 apa adanya - sama spt behavior lama.
 */
import { useEffect, useState } from "react";

export function useVisualViewportBox() {
  const [box, setBox] = useState(() => ({
    top: 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0,
  }));

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return; // fallback: biarkan nilai awal (window.innerHeight, top 0)

    function update() {
      setBox({ top: vv.offsetTop, height: vv.height });
    }
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return box;
}
