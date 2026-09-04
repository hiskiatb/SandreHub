"use client";
/**
 * BottomSheet - satu komponen dasar reusable utk SEMUA sheet/modal "geser
 * dari bawah" di MartaHub mobile (Hapus Plan, Detail Aktivitas, Konfirmasi
 * Logout, dst.) - backdrop + card putih rounded-top + handle bar geser,
 * SEMUA sheet pakai bahasa visual & interaksi yg SAMA PERSIS lewat satu
 * sumber, bukan re-implementasi terpisah per file yg bisa diam-diam beda.
 *
 * Fitur geser (swipe-to-close): tarik BAGIAN GARIS (handle) ke bawah utk
 * menutup sheet - kalau ditarik lewat ambang tertentu lalu dilepas, sheet
 * menutup; kalau tidak, dia snap balik ke posisi semula. Backdrop-nya ikut
 * memudar proporsional sambil digeser, jadi terasa "hidup"/responsif ke jari.
 *
 * PENTING - kenapa geser handle bisa ikut men-trigger pull-to-refresh
 * halaman di belakangnya: gesture touch di layar itu satu event yg BUBBLE
 * ke atas lewat DOM, dan listener pull-to-refresh (usePullToRefresh di
 * MobileShell.jsx) dipasang di container halaman yg jadi leluhur dari sheet
 * ini (sheet dirender sbg children di dalamnya). Kalau tidak dihentikan,
 * touchmove di handle sheet ini ikut "kebaca" jadi tarikan pull-to-refresh
 * juga → dua gesture nyampur jadi satu (sheet ketarik turun SEKALIGUS
 * "Memuat ulang…" muncul). Makanya semua handler gesture di bawah selalu
 * `stopPropagation()` LEBIH DULU sebelum apapun lain - memastikan gesture
 * di sheet ini berhenti di sini saja, tidak pernah nyampur ke halaman di
 * belakangnya.
 */
import { useEffect, useRef, useState } from "react";
import { FF } from "./MobileShell";

const SWIPE_CLOSE_THRESHOLD = 84; // px tarikan sebelum dilepas = sheet dianggap "mau ditutup"
const SWIPE_MAX_DRAG = 280; // batas atas tarikan visual (rubber-band-ish, dibatasi spy tidak liar)

function useSwipeToClose(onClose, disabled) {
  const handleRef = useRef(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(null);
  // Nilai dragY TERKINI di luar React state - dibaca sinkron di onEnd tanpa
  // lewat functional setState updater. Sebelumnya `onClose()` dipanggil DI
  // DALAM updater `setDragY((cur) => { if (...) onClose(); return 0 })` -
  // updater itu jalan di render phase React, jadi manggil setState komponen
  // LAIN (mis. `setDeleteTarget(null)` di halaman pemanggil) dari situ kena
  // warning "Cannot update a component while rendering a different
  // component". Sekarang dragYRef dibaca dulu utk keputusan, `onClose()`
  // dipanggil sbg efek samping BIASA (bukan di dalam updater), baru
  // `setDragY(0)` dipanggil terpisah.
  const dragYRef = useRef(0);

  useEffect(() => {
    const el = handleRef.current;
    if (!el || disabled) return;

    function onStart(e) {
      // stopPropagation SEJAK touchstart - biar container pull-to-refresh
      // di belakang bahkan tidak sempat mulai "menghitung" gesture ini sbg
      // miliknya sendiri (lihat catatan panjang di atas).
      e.stopPropagation();
      startY.current = e.touches[0].clientY;
      setDragging(true);
    }
    function onMove(e) {
      e.stopPropagation();
      if (startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        // Geser ke ATAS (atau balik ke 0) - bukan niat menutup, biarkan diam
        // di 0 saja (sheet tidak perlu ikut naik melebihi posisinya semula).
        dragYRef.current = 0;
        setDragY(0);
        return;
      }
      e.preventDefault(); // cegah scroll halaman ikut jalan pas jari geser turun
      const next = Math.min(dy, SWIPE_MAX_DRAG);
      dragYRef.current = next;
      setDragY(next);
    }
    function onEnd(e) {
      e.stopPropagation();
      setDragging(false);
      const shouldClose = dragYRef.current > SWIPE_CLOSE_THRESHOLD;
      dragYRef.current = 0;
      setDragY(0);
      startY.current = null;
      if (shouldClose) onClose?.();
    }

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [onClose, disabled]);

  return { handleRef, dragY, dragging };
}

/**
 * @param {{
 *   onClose: () => void,
 *   children: React.ReactNode,
 *   zIndex?: number,
 *   maxWidth?: number,
 *   borderRadius?: string,
 *   boxShadow?: string,
 *   backdropOpacity?: number,
 *   disableBackdropClose?: boolean, // klik area gelap tidak menutup (mis. lagi proses submit)
 *   disableSwipeClose?: boolean,    // geser handle tidak menutup (jarang dipakai - sama alasannya dgn backdrop)
 * }} props
 */
export default function BottomSheet({
  onClose,
  children,
  zIndex = 100,
  maxWidth = 480,
  borderRadius = "22px 22px 0 0",
  boxShadow = "0 -14px 44px rgba(23,24,28,0.2)",
  backdropOpacity = 0.45,
  disableBackdropClose = false,
  disableSwipeClose = false,
}) {
  const { handleRef, dragY, dragging } = useSwipeToClose(onClose, disableSwipeClose || disableBackdropClose);

  return (
    <div onClick={() => !disableBackdropClose && onClose?.()}
      style={{
        position: "fixed", inset: 0, zIndex, display: "flex", alignItems: "flex-end",
        background: `rgba(23,24,28,${(backdropOpacity * (1 - dragY / (SWIPE_MAX_DRAG * 1.4))).toFixed(3)})`,
      }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth, margin: "0 auto", background: "#FFFFFF", borderRadius,
          padding: "10px 22px calc(env(safe-area-inset-bottom,0px) + 22px)", fontFamily: FF, boxShadow,
          transform: `translateY(${dragY}px)`,
          transition: dragging ? "none" : "transform 0.3s cubic-bezier(0.34,1.15,0.64,1)",
        }}>
        {/* Target sentuh handle sengaja lebih besar dari garis visualnya
            (padding di sekeliling) - garis 4px terlalu tipis utk ditarik
            presisi dgn jari, tapi area geser tetap harus cuma di sini
            (bukan seluruh header) spy tidak konflik dgn scroll konten sheet
            yg mungkin panjang (mis. daftar dampak hapus). */}
        <div ref={handleRef} style={{ display: "flex", justifyContent: "center", padding: "10px 60px 12px", margin: "-4px auto 4px", touchAction: "none", cursor: "grab" }}>
          <div style={{ width: 40, height: 4, borderRadius: 3, background: "#E4E5EA" }} />
        </div>
        {children}
      </div>
    </div>
  );
}
