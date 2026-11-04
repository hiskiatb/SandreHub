"use client";
/**
 * <PwaInstallBanner /> — saran instal ke Home Screen (PWA).
 *
 * - Android/Chrome: dengerin `beforeinstallprompt`, simpan event-nya,
 *   lalu panggil `.prompt()` pas tombol "Instal Aplikasi" ditekan.
 * - iOS Safari: `beforeinstallprompt` TIDAK pernah fire, jadi kasih
 *   instruksi manual (tombol Share → Add to Home Screen).
 * - Tidak muncul kalau app sudah jalan sebagai PWA terinstal
 *   (display-mode: standalone / navigator.standalone di iOS).
 * - Dismiss disimpan di localStorage (indefinite — simple, no nagging).
 *
 * Styling ikut konvensi kartu login (card bg, border, shadow) dari
 * halaman pemanggil lewat props `dark`/`accent`, supaya konsisten di
 * semua varian login (Sandra/Marta/Fitra/dst) tanpa duplikasi logic.
 */
import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

const DISMISS_KEY = "pwa-install-dismissed";
const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;

function isStandalone() {
  try {
    return (
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator?.standalone === true
    );
  } catch {
    return false;
  }
}

function isIos() {
  try {
    return /iPad|iPhone|iPod/.test(window.navigator.userAgent) && !window.MSStream;
  } catch {
    return false;
  }
}

export function PwaInstallBanner({ dark = false, accent = "#32BCAD", accentDark = "#1A9E90" }) {
  const [platform, setPlatform] = useState(null); // "android" | "ios" | null
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(true); // default hidden sampai cek klien selesai
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    let dismissedBefore = false;
    try {
      dismissedBefore = localStorage.getItem(DISMISS_KEY) === "1";
    } catch { /* localStorage bisa diblokir — anggap belum pernah dismiss */ }
    setDismissed(dismissedBefore);

    if (isStandalone()) return; // sudah terinstal — jangan tampilkan apa pun

    if (isIos()) {
      setPlatform("ios");
      return;
    }

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setPlatform("android");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const onInstalled = () => {
      setPlatform(null);
      setDeferredPrompt(null);
      try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* best-effort */ }
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* best-effort */ }
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice?.outcome === "accepted") dismiss();
      else setDismissed(true); // ditolak sekali — jangan nagging terus
      setDeferredPrompt(null);
    } catch { /* best-effort */ }
    finally { setInstalling(false); }
  };

  if (dismissed || !platform) return null;
  if (platform === "android" && !deferredPrompt) return null;

  const bg = dark ? "rgba(50,188,173,0.08)" : "rgba(50,188,173,0.06)";
  const border = dark ? "rgba(50,188,173,0.30)" : "rgba(50,188,173,0.24)";
  const hi = dark ? "#F0F0F2" : "#111116";
  const mid = dark ? "#9A9AA6" : "#5A5A68";

  return (
    <div
      style={{
        marginTop: 14,
        width: "100%",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "13px 14px",
        borderRadius: 14,
        background: bg,
        border: `1.5px solid ${border}`,
        fontFamily: FONT,
        position: "relative",
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg,${accent},${accentDark})`,
          color: "#fff",
        }}
      >
        {platform === "ios" ? <Share size={15} /> : <Download size={15} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: hi, letterSpacing: "-0.01em" }}>
          Instal aplikasi ke Home Screen
        </div>
        {platform === "ios" ? (
          <div style={{ marginTop: 3, fontSize: 12, color: mid, lineHeight: 1.5 }}>
            Ketuk tombol <b>Share</b> <Share size={11} style={{ display: "inline", verticalAlign: "-1px" }} /> di Safari, lalu pilih <b>&quot;Add to Home Screen&quot;</b>.
          </div>
        ) : (
          <>
            <div style={{ marginTop: 3, fontSize: 12, color: mid, lineHeight: 1.5 }}>
              Akses lebih cepat, tampilan full-screen seperti aplikasi native.
            </div>
            <button
              onClick={handleInstall}
              disabled={installing}
              style={{
                marginTop: 9,
                padding: "7px 14px",
                borderRadius: 9,
                border: "none",
                cursor: installing ? "not-allowed" : "pointer",
                background: `linear-gradient(135deg,${accent},${accentDark})`,
                color: "#fff",
                fontSize: 12.5,
                fontWeight: 700,
                fontFamily: FONT,
                opacity: installing ? 0.7 : 1,
              }}
            >
              {installing ? "Memproses…" : "Instal Aplikasi"}
            </button>
          </>
        )}
      </div>

      <button
        onClick={dismiss}
        aria-label="Tutup"
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 22,
          height: 22,
          borderRadius: 7,
          border: "none",
          background: "transparent",
          color: mid,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <X size={13} />
      </button>
    </div>
  );
}
