"use client";
/**
 * AppHeader - baris "Selamat Pagi/Siang/…, NAMA" + tombol Notifikasi &
 * Keluar. Dipakai SAMA PERSIS di keempat menu utama (Beranda/Aktivitas/
 * Kalender/Profil) supaya identitas pengguna & jalan pintas Notifikasi/
 * Keluar selalu ada & konsisten di posisi yang sama, tidak peduli menu mana
 * yang sedang dibuka (sebelumnya cuma ada di Beranda).
 *
 * Mandiri: fetch badge notifikasi/transfer sendiri & kelola sheet konfirmasi
 * Keluar sendiri - halaman pemanggil cukup taruh <AppHeader/> di baris
 * PALING ATAS blok header-nya sendiri (biasanya di dalam wrapper sticky
 * milik halaman itu), tidak perlu bungkus sticky tambahan di sini.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bell, LogOut } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import { FF, logMartaLogout } from "./MobileShell";
import { fetchUnreadCount } from "./notifData";

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Selamat Pagi";
  if (h < 15) return "Selamat Siang";
  if (h < 18) return "Selamat Sore";
  return "Selamat Malam";
}

export function Badge({ n }) {
  return (
    <span style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, background: "#ED1C24", color: "#fff", fontSize: 9.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", border: "2px solid #F4F5F7" }}>
      {n}
    </span>
  );
}

export default function AppHeader({ scope, email }) {
  const router = useRouter();
  const [pendingTransfers, setPendingTransfers] = useState(0);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabaseMarta.rpc("mh_msisdn_transfer_list_for_me");
        if (alive) setPendingTransfers((data || []).filter((t) => t.status === "pending").length);
      } catch { /* best-effort */ }
    })();
    (async () => {
      try {
        const n = await fetchUnreadCount();
        if (alive) setUnreadNotifs(n || 0);
      } catch { /* best-effort */ }
    })();
    return () => { alive = false; };
  }, []);

  // Keluar butuh konfirmasi dulu (LogoutConfirmSheet) - satu tap langsung
  // logout gampang kepencet tidak sengaja krn posisinya persis sebelah
  // ikon Notifikasi.
  const signOut = async () => {
    setLoggingOut(true);
    await logMartaLogout();
    await supabaseMarta.auth.signOut();
    router.replace("/martahub/m/login");
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "#8A8A96", fontWeight: 600 }}>{greeting()},</div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", maxWidth: 230, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {scope?.fullName || email}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* Transfer MSISDN tidak lagi punya akses terpisah - permintaan yg
              ditujukan ke "yang bersangkutan" (pemilik nomor saat ini) masuk
              lewat inbox Notifikasi yang sama, badge-nya digabung di sini. */}
          <button onClick={() => router.push("/martahub/m/notifications")}
            style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, background: "#FFFFFF", border: "1px solid #E4E5EA", borderRadius: 11, cursor: "pointer", color: "#8A8A96" }}>
            <Bell size={15} />
            {(unreadNotifs + pendingTransfers) > 0 && <Badge n={unreadNotifs + pendingTransfers} />}
          </button>
          {/* Keluar - sengaja diberi warna merah (beda dari Notifikasi)
              supaya aksi destruktif ini langsung terlihat beda tegas. */}
          <button onClick={() => setLogoutConfirmOpen(true)}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, background: "#FDECEC", border: "1px solid #F6C6C6", borderRadius: 11, cursor: "pointer", color: "#ED1C24" }}>
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {logoutConfirmOpen && (
        <LogoutConfirmSheet
          loading={loggingOut}
          onCancel={() => setLogoutConfirmOpen(false)}
          onConfirm={signOut}
        />
      )}
    </>
  );
}

function LogoutConfirmSheet({ onCancel, onConfirm, loading }) {
  // Portal ke document.body - AppHeader dipakai di dalam {children} milik
  // MobileShell, & wrapper {children} itu bisa kena `transform` saat gestur
  // pull-to-refresh aktif (lihat komentar di MobileShell.jsx). Sebuah
  // ancestor ber-transform jadi containing block BARU utk semua descendant
  // position:fixed (spec CSS) - jadi sheet ini bisa "terjebak" relatif ke
  // wrapper yg ditranslate itu alih-alih viewport asli, & keliatan nempel
  // di atas layar alih-alih jadi bottom sheet. Portal keluar dari DOM tree
  // {children} sepenuhnya menghindari jebakan ini sama sekali (sama seperti
  // {fab} yg sengaja dirender di luar wrapper itu utk alasan yg sama).
  if (typeof document === "undefined") return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center", fontFamily: FF }}>
      <div onClick={loading ? undefined : onCancel} style={{ position: "absolute", inset: 0, background: "rgba(23,24,28,0.45)" }} />
      <div style={{
        position: "relative", width: "100%", maxWidth: 480, boxSizing: "border-box",
        background: "#FFFFFF", borderRadius: "24px 24px 0 0",
        padding: "22px 20px calc(env(safe-area-inset-bottom,0px) + 20px)",
        boxShadow: "0 -10px 32px rgba(17,17,20,0.16)",
      }}>
        <div style={{ width: 38, height: 4, borderRadius: 99, background: "#E4E5EA", margin: "0 auto 18px" }} />
        <div style={{ width: 52, height: 52, borderRadius: 16, background: "#FDECEC", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <LogOut size={22} color="#ED1C24" />
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, textAlign: "center", color: "#17181C" }}>Keluar dari akun?</div>
        <div style={{ marginTop: 6, fontSize: 12.5, color: "#8A8A96", textAlign: "center", lineHeight: 1.5 }}>
          Anda perlu login kembali untuk mengakses MartaHub.
        </div>
        <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
          <button onClick={onCancel} disabled={loading}
            style={{ flex: 1, padding: "13px 0", borderRadius: 14, background: "#F4F5F7", border: "1px solid #E4E5EA", fontSize: 13.5, fontWeight: 800, color: "#3A3A44", cursor: loading ? "default" : "pointer", fontFamily: FF }}>
            Batal
          </button>
          <button onClick={onConfirm} disabled={loading}
            style={{ flex: 1, padding: "13px 0", borderRadius: 14, background: "#ED1C24", border: "none", fontSize: 13.5, fontWeight: 800, color: "#FFFFFF", cursor: loading ? "default" : "pointer", fontFamily: FF }}>
            {loading ? "Memproses..." : "Ya, Keluar"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
