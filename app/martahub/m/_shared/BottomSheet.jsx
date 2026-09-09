"use client";
/**
 * BottomSheet - satu komponen dasar reusable utk SEMUA sheet/modal "geser
 * dari bawah" di MartaHub mobile (Hapus Plan, Detail Aktivitas, Konfirmasi
 * Logout, Atur Waktu, Pilih Site, dst.) - backdrop + card putih rounded-top
 * + handle bar geser, SEMUA sheet pakai bahasa visual & interaksi yg SAMA
 * PERSIS lewat satu sumber, bukan re-implementasi terpisah per file yg bisa
 * diam-diam beda.
 *
 * RIWAYAT: versi awal komponen ini (sebelum revisi ini) sudah py swipe-to-
 * close yg solid, tapi TIDAK py animasi MASUK (sheet muncul tiba2 di posisi
 * akhir, bukan slide-up dari bawah) maupun animasi KELUAR (onClose dipanggil
 * LANGSUNG saat backdrop diketuk/swipe ngelewatin threshold, jadi consumer
 * unmount sheet ini seketika - keliatan "loncat balik ke halaman
 * sebelumnya" tanpa transisi, bukannya lanjut meluncur turun keluar layar).
 * Revisi ini nambahin itu SEMUA tanpa mengubah kontrak prop yg sudah dipakai
 * beberapa halaman (`activities/page.jsx`, `DeleteActivitySheet.jsx`) -
 * `onClose` dkk tetap kerja sama persis, cuma sekarang dibungkus fase
 * masuk/keluar yg dianimasikan dulu sebelum `onClose` beneran dipanggil.
 *
 * FITUR BARU:
 * - Slide-up saat mount (translateY 100% → 0%), slide-down saat menutup
 *   (dipicu backdrop tap, swipe lewat ambang jarak ATAUPUN kecepatan
 *   tarikan/fling, atau close-programatik lewat ref) SEBELUM `onClose`
 *   consumer benar2 dipanggil - drag yg sudah lewat ambang MELANJUTKAN arah
 *   turunnya (transisi dimulai dari posisi jari terakhir, bukan snap balik
 *   ke atas dulu baru "loncat" turun).
 * - Posisi/tinggi overlay dihitung dari `visualViewport` (via
 *   `useVisualViewportBox`) bukan `inset:0` polos - supaya tidak ada gap
 *   atau kepotong di tampilan PWA/standalone (viewport lebih tinggi krn
 *   address bar hilang) ataupun saat keyboard virtual muncul.
 * - `ref.current.close(afterCloseFn)` (opsional, lewat forwardRef) - utk
 *   tombol AKSI di dalam sheet (mis. "Simpan"/"Konfirmasi") yg perlu
 *   animasi keluar yg SAMA tapi manggil callback BEDA dari `onClose` biasa
 *   (mis. "onClose" berarti batal, sedangkan tombol konfirmasi TIDAK boleh
 *   dianggap batal). Consumer lama yg tidak pakai ref tetap jalan seperti
 *   biasa (`onClose` dipanggil setelah animasi keluar selesai).
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
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { FF } from "./MobileShell";
import { useVisualViewportBox } from "./useVisualViewportBox";
import { lockPullToRefresh, unlockPullToRefresh } from "./pullToRefreshLock";

const SWIPE_CLOSE_THRESHOLD = 84; // px tarikan sebelum dilepas = sheet dianggap "mau ditutup"
const SWIPE_MAX_DRAG = 280; // batas atas tarikan visual selama MASIH digenggam (rubber-band-ish, dibatasi spy tidak liar)
const SWIPE_VELOCITY_CLOSE = 0.5; // px/ms - tarikan CEPAT (fling) langsung dianggap "mau nutup" walau blm lewat SWIPE_CLOSE_THRESHOLD
const ENTER_MS = 300;
const EXIT_MS = 240;
const EASE = "cubic-bezier(0.32,0.72,0,1)"; // easing gaya sheet native iOS - cepat di awal, empuk di akhir

function useSwipeToClose(onRequestClose, disabled) {
  const handleRef = useRef(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(null);
  // Nilai dragY & kecepatan TERKINI di luar React state - dibaca sinkron di
  // onEnd tanpa lewat functional setState updater (lihat catatan lama:
  // manggil setState komponen LAIN di dalam updater bikin warning "Cannot
  // update a component while rendering a different component").
  const dragYRef = useRef(0);
  const lastSampleRef = useRef({ y: 0, t: 0 });
  const velocityRef = useRef(0);

  useEffect(() => {
    const el = handleRef.current;
    if (!el || disabled) return;

    function onStart(e) {
      e.stopPropagation();
      startY.current = e.touches[0].clientY;
      lastSampleRef.current = { y: e.touches[0].clientY, t: performance.now() };
      velocityRef.current = 0;
      setDragging(true);
    }
    function onMove(e) {
      e.stopPropagation();
      if (startY.current == null) return;
      const y = e.touches[0].clientY;
      const dy = y - startY.current;
      if (dy <= 0) {
        dragYRef.current = 0;
        setDragY(0);
        return;
      }
      e.preventDefault();
      const next = Math.min(dy, SWIPE_MAX_DRAG);
      dragYRef.current = next;
      setDragY(next);
      const now = performance.now();
      const dt = now - lastSampleRef.current.t;
      if (dt > 0) velocityRef.current = (y - lastSampleRef.current.y) / dt;
      lastSampleRef.current = { y, t: now };
    }
    function onEnd(e) {
      e.stopPropagation();
      setDragging(false);
      const shouldClose = dragYRef.current > SWIPE_CLOSE_THRESHOLD || velocityRef.current > SWIPE_VELOCITY_CLOSE;
      startY.current = null;
      if (shouldClose) {
        // SENGAJA tidak reset dragY ke 0 di sini - onRequestClose men-trigger
        // fase "closing" di parent yg transisi transform-nya berangkat dari
        // dragY SAAT INI menuju keluar layar, jadi gerakannya melanjutkan
        // arah tarikan, bukan snap balik ke atas dulu.
        onRequestClose?.();
      } else {
        dragYRef.current = 0;
        setDragY(0);
      }
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
  }, [onRequestClose, disabled]);

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
 *
 * Imperative (opsional, via ref): `ref.current.close(afterCloseFn)` - mainkan
 * animasi keluar yg sama, lalu panggil `afterCloseFn` (bukan `onClose`)
 * setelah animasi selesai. Tanpa ref pun komponen ini jalan normal seperti
 * sebelumnya (backdrop/swipe animasi keluar dulu, baru `onClose` dipanggil).
 */
const BottomSheet = forwardRef(function BottomSheet(
  {
    onClose,
    children,
    zIndex = 100,
    maxWidth = 480,
    borderRadius = "22px 22px 0 0",
    boxShadow = "0 -14px 44px rgba(23,24,28,0.2)",
    backdropOpacity = 0.45,
    disableBackdropClose = false,
    disableSwipeClose = false,
    lockScroll = true, // kunci scroll halaman di belakang + pull-to-refresh selagi sheet ini terbuka (reference-counted, aman dipakai bertumpuk/nested)
  },
  ref
) {
  const vv = useVisualViewportBox();

  useEffect(() => {
    if (!lockScroll) return;
    const { overflow, touchAction } = document.body.style;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    lockPullToRefresh();
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.touchAction = touchAction;
      unlockPullToRefresh();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockScroll]);
  const [entered, setEntered] = useState(false); // 1 frame setelah mount → trigger transisi slide-up
  const [closing, setClosing] = useState(false);
  const afterCloseRef = useRef(onClose);
  // BUG YG SEMPAT KEJADIAN: baris ini dulu jalan TANPA syarat di SETIAP
  // render, termasuk render yg dipicu `setClosing(true)` di startClose()
  // sendiri - akibatnya callback custom yg baru saja di-set startClose()
  // (mis. `onConfirm` dari tombol "Gunakan Rentang Waktu Ini") langsung
  // KETIMPA lagi jadi `onClose` (dismiss) SEBELUM animasi selesai & fn-nya
  // sempat dipanggil. Hasilnya: user klik confirm, tapi yg jalan malah
  // logic BATAL (mis. tanggal yg baru dipilih ikut ke-remove lagi).
  // Fix: cuma sinkron ke `onClose` TERBARU selagi TIDAK sedang menutup -
  // begitu `closing` true, biarkan afterCloseRef tetap pegang callback
  // custom yg sudah di-set sampai animasi selesai & fn-nya terpanggil.
  if (!closing) afterCloseRef.current = onClose;

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  function startClose(afterClose) {
    if (closing) return; // sudah dlm proses menutup - jangan tumpang tindih
    if (afterClose) afterCloseRef.current = afterClose;
    setClosing(true);
  }

  useImperativeHandle(ref, () => ({ close: (afterClose) => startClose(afterClose) }));

  const { handleRef, dragY, dragging } = useSwipeToClose(
    () => startClose(onClose),
    disableSwipeClose || disableBackdropClose
  );

  const closedTransform = "translateY(100%)";
  const openTransform = dragY ? `translateY(${dragY}px)` : "translateY(0)";
  const transform = closing ? closedTransform : entered ? openTransform : closedTransform;
  const duration = dragging ? 0 : closing ? EXIT_MS : ENTER_MS;
  const fadeFactor = closing || !entered ? 0 : 1 - dragY / (SWIPE_MAX_DRAG * 1.4);

  return (
    <div
      onClick={() => !disableBackdropClose && startClose(onClose)}
      style={{
        position: "fixed", top: vv.top, left: 0, right: 0, height: vv.height, zIndex,
        display: "flex", alignItems: "flex-end",
        background: `rgba(23,24,28,${(backdropOpacity * fadeFactor).toFixed(3)})`,
        transition: dragging ? "none" : `background ${duration}ms ease`,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onTransitionEnd={(e) => {
          if (e.propertyName !== "transform" || !closing) return;
          const fn = afterCloseRef.current;
          if (fn) fn();
        }}
        style={{
          width: "100%", maxWidth, margin: "0 auto", background: "#FFFFFF", borderRadius,
          padding: "10px 0 0", fontFamily: FF, boxShadow,
          transform,
          transition: `transform ${duration}ms ${dragging ? "linear" : EASE}`,
          // Konten sheet BISA lebih tinggi dari layar (mis. banyak "plan lain
          // sudah ada" di tanggal yg sama) - dulu tidak ada batas tinggi sama
          // sekali di sini, jadi kartu ini tumbuh mengikuti konten & bagian
          // atasnya kepotong di luar viewport TANPA bisa discroll (body sudah
          // dikunci scroll-nya via lockScroll di atas). Fix: batasi tinggi
          // kartu ke viewport (via vv.height, sadar keyboard/PWA chrome) dan
          // jadikan flex column - handle tetap fixed di atas, isi (termasuk
          // padding kiri/kanan/bawah yg dulu ada di sini) pindah ke wrapper
          // scrollable di bawah supaya SELALU bisa digeser sampai konten
          // terakhir kelihatan, seberapa pun banyaknya.
          display: "flex", flexDirection: "column",
          maxHeight: `calc(${vv.height}px - 24px)`,
          overflow: "hidden",
        }}
      >
        {/* Target sentuh handle sengaja lebih besar dari garis visualnya
            (padding di sekeliling) - garis 4px terlalu tipis utk ditarik
            presisi dgn jari, tapi area geser tetap harus cuma di sini
            (bukan seluruh header) spy tidak konflik dgn scroll konten sheet
            yg mungkin panjang (mis. daftar dampak hapus). */}
        <div ref={handleRef} style={{ flexShrink: 0, display: "flex", justifyContent: "center", padding: "10px 60px 12px", margin: "-4px auto 4px", touchAction: "none", cursor: "grab" }}>
          <div style={{ width: 40, height: 4, borderRadius: 3, background: "#E4E5EA" }} />
        </div>
        <div style={{
          flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain",
          padding: "0 22px calc(env(safe-area-inset-bottom,0px) + 22px)",
        }}>
          {children}
        </div>
      </div>
    </div>
  );
});

export default BottomSheet;
