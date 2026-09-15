"use client";
/**
 * Cooldown kirim-ulang OTP email - dipakai bersama oleh /martahub/m/login
 * (tombol "Kirim Kode") & /martahub/m/verify (tombol "Kirim Ulang").
 *
 * KENAPA INI ADA: Supabase Auth membatasi maksimal 1x kirim OTP per 60 detik
 * per alamat email (batas SERVER, bukan bisa diubah dari sini) - kalau
 * dilanggar, signInWithOtp() balas error 429
 * "For security purposes, you can only request this after N seconds."
 * Sebelumnya halaman verify punya cooldown visual 30 detik (LEBIH PENDEK dari
 * batas server 60 detik) yg cuma hidup di state React (useState+setTimeout),
 * dan halaman login sama sekali tidak punya cooldown - jadi:
 *   1. Begitu app ditutup/direfresh/dipindah background lalu dibuka lagi,
 *      hitungannya reset ke 0 walau batas 60 detik di server belum lewat -
 *      tombol kelihatan aktif padahal server pasti masih menolak.
 *   2. User yg pindah dari /verify balik ke /login lalu submit ulang sama
 *      sekali tidak kena cooldown apa pun.
 *   3. Kasus nyata: user berkali-kali kena 429 tanpa pernah sampai memasukkan
 *      kode sama sekali - dari sudut pandang dia terlihat spt "OTP gagal
 *      terus", padahal cuma kena rate-limit kirim ulang.
 *
 * Perbaikan di sini: simpan waktu "terakhir kirim" sbg TIMESTAMP ABSOLUT di
 * localStorage (per email, bertahan lintas reload/tutup-app/tab baru) lalu
 * SELALU hitung ulang sisa waktu dari selisih jam nyata (Date.now() -
 * lastSentAt) - bukan counter yg didekremen sendiri. Dengan begitu, sisa
 * waktu otomatis benar berapa pun lama app ditutup, dan disinkronkan ulang
 * tiap tab kembali terlihat (visibilitychange/focus) supaya tidak meleset
 * krn timer di-throttle browser saat tab/app di-background.
 */
import { useEffect, useState } from "react";

const KEY_PREFIX = "mh_otp_last_sent:";
// Batas asli Supabase 60 detik + sedikit buffer jaringan/jam client yg tidak
// presisi - lebih baik tombol aktif SEDIKIT lebih lambat drpd lebih cepat
// (yg berarti pasti kena 429 lagi).
export const OTP_RESEND_COOLDOWN_MS = 65_000;

function storageKey(email) {
  return KEY_PREFIX + String(email || "").trim().toLowerCase();
}

function readLastSentAt(email) {
  try {
    const raw = localStorage.getItem(storageKey(email));
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null; // localStorage tidak tersedia (mode privat dll) - anggap tidak ada cooldown tersimpan
  }
}

function remainingMsFor(email, cooldownMs) {
  const last = readLastSentAt(email);
  if (last == null) return 0;
  const left = cooldownMs - (Date.now() - last);
  return left > 0 ? left : 0;
}

/** Panggil SETELAH signInWithOtp() sukses - catat waktu kirim sekarang. */
export function markOtpSent(email) {
  try { localStorage.setItem(storageKey(email), String(Date.now())); } catch { /* best-effort */ }
}

// Pesan Supabase saat 429: "For security purposes, you can only request
// this after 43 seconds." - server SELALU tahu sisa waktu yg SEBENARNYA
// (mis. krn dikirim dari tab/perangkat lain barusan) - kalau angka ini ada,
// itu yg dipakai utk menyetel ulang cooldown persis, bukan nebak dari 0 lagi.
function parseRetryAfterSeconds(error) {
  const msg = String(error?.message || "");
  const m = msg.match(/after (\d+) second/i);
  return m ? Number(m[1]) : null;
}

/** Panggil saat signInWithOtp() gagal - selaraskan cooldown lokal ke sisa
 * waktu ASLI dari server kalau errornya rate-limit, & kembalikan pesan yg
 * enak dibaca (bukan teks mentah bahasa Inggris dari Supabase). */
export function reconcileOtpError(email, error) {
  const seconds = parseRetryAfterSeconds(error);
  if (seconds != null) {
    try {
      const lastSentAt = Date.now() - (OTP_RESEND_COOLDOWN_MS - seconds * 1000);
      localStorage.setItem(storageKey(email), String(lastSentAt));
    } catch { /* best-effort */ }
    return `Tunggu ${seconds} detik lagi sebelum minta kode baru.`;
  }
  return error?.message || "Gagal mengirim kode. Coba lagi.";
}

/**
 * Hook cooldown - sisa detik dihitung ulang dari timestamp tersimpan (BUKAN
 * counter lokal), disegarkan tiap detik SELAGI halaman terlihat + langsung
 * disinkronkan ulang begitu tab/app kembali ke depan (visibilitychange &
 * focus) supaya benar walau timer sempat di-throttle saat di-background.
 */
export function useOtpResendCooldown(email) {
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    if (!email) { setRemainingMs(0); return; }
    const tick = () => setRemainingMs(remainingMsFor(email, OTP_RESEND_COOLDOWN_MS));
    tick(); // nilai awal - benar sejak render pertama, termasuk stlh reload/buka app lagi
    const interval = setInterval(tick, 1000);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [email]);

  return {
    remainingSeconds: Math.ceil(remainingMs / 1000),
    /** Cek sinkron sesaat sblm memanggil signInWithOtp - hindari kirim
     * request yg PASTI akan ditolak server (hemat kuota rate-limit). */
    isReady: () => remainingMsFor(email, OTP_RESEND_COOLDOWN_MS) <= 0,
    markSent: () => { markOtpSent(email); setRemainingMs(remainingMsFor(email, OTP_RESEND_COOLDOWN_MS)); },
    reconcileError: (error) => {
      const message = reconcileOtpError(email, error);
      setRemainingMs(remainingMsFor(email, OTP_RESEND_COOLDOWN_MS));
      return message;
    },
  };
}
