"use client";
/**
 * /martahub/m/revoked - Akses dilepas (web mobile). Padanan `revoked_screen.dart`
 * di Flutter, ditambah: copy email, refresh manual, dan auto-redirect real-time
 * begitu admin meng-assign ulang akun ini (mh_profiles balik ke status=active).
 */
import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldOff, LogOut, Mail, Copy, Check, RefreshCw } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import { logMartaLogout } from "../_shared/MobileShell";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const BRAND = "linear-gradient(135deg,#ED1C24,#EC008C)";

function RevokedInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";

  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState("");
  const userIdRef = useRef(null);

  // Cek status terkini di mh_profiles - dipakai baik oleh tombol Refresh
  // maupun oleh callback realtime di bawah. Kalau sudah aktif kembali,
  // langsung arahkan ke halaman utama tanpa perlu logout/login ulang.
  const checkAndMaybeEnter = async (userEmail) => {
    if (!userEmail) return false;
    const { data } = await supabaseMarta
      .from("mh_profiles")
      .select("role, status")
      .eq("email", userEmail.toLowerCase())
      .maybeSingle();
    const active = data && data.status === "active" && (data.role || "pending") !== "pending";
    if (active) {
      router.replace("/martahub/m");
      return true;
    }
    return false;
  };

  useEffect(() => {
    let alive = true;
    let channel = null;
    (async () => {
      const { data: { session } } = await supabaseMarta.auth.getSession();
      if (!session) { router.replace("/martahub/m/login"); return; }
      if (!alive) return;
      userIdRef.current = session.user.id;

      // Real-time: begitu admin meng-assign ulang role/region untuk akun ini,
      // mh_rebind_email akan meng-update baris mh_profiles milik user ini ->
      // langsung tembak masuk ke halaman utama, tanpa harus refresh manual.
      try {
        channel = supabaseMarta
          .channel(`mh-revoked-watch-${session.user.id}`)
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "mh_profiles", filter: `id=eq.${session.user.id}` },
            (payload) => {
              const row = payload.new || {};
              if (row.status === "active" && (row.role || "pending") !== "pending") {
                router.replace("/martahub/m");
              }
            }
          )
          .subscribe();
      } catch { /* realtime opsional */ }
    })();
    return () => {
      alive = false;
      if (channel) { try { supabaseMarta.removeChannel(channel); } catch { /* noop */ } }
    };
  }, [router]);

  const signOut = async () => {
    await logMartaLogout();
    await supabaseMarta.auth.signOut();
    router.replace("/martahub/m/login");
  };

  const copyEmail = async () => {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
    } catch {
      // fallback utk browser lama / non-secure context
      const ta = document.createElement("textarea");
      ta.value = email;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* noop */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshNote("");
    try {
      const entered = await checkAndMaybeEnter(email);
      if (!entered) setRefreshNote("Belum ada perubahan akses.");
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshNote(""), 2400);
    }
  };

  return (
    <div style={{ minHeight: "100svh", background: "#F4F5F7", color: "#17181C", fontFamily: FF, WebkitFontSmoothing: "antialiased" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{background:#F4F5F7 !important}
        @keyframes revokedFadeUp{ from{ opacity:0; transform:translateY(10px); } to{ opacity:1; transform:translateY(0); } }
        @keyframes revokedRing{ 0%{ box-shadow:0 0 0 0 rgba(220,38,38,0.16); } 100%{ box-shadow:0 0 0 14px rgba(220,38,38,0); } }
        @keyframes revokedSpin{ from{ transform:rotate(0deg); } to{ transform:rotate(360deg); } }
      `}</style>

      {/* Latar penuh - gradient lembut + dua "blob" dekoratif senada aksen
          merah-pink MartaHub, supaya layar status ini tidak terasa kosong
          polos di layar tinggi/lebar (sebelumnya cuma teks mengambang di
          tengah kanvas abu-abu rata). */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", zIndex: 0 }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 90% at 50% -10%, #FFF5F5 0%, #F4F5F7 55%)" }} />
        <div style={{ position: "absolute", top: "-14%", right: "-18%", width: 320, height: 320, borderRadius: "50%", background: BRAND, opacity: 0.10, filter: "blur(6px)" }} />
        <div style={{ position: "absolute", bottom: "-16%", left: "-16%", width: 280, height: 280, borderRadius: "50%", background: BRAND, opacity: 0.08, filter: "blur(6px)" }} />
      </div>

      <div style={{ position: "relative", zIndex: 1, minHeight: "100svh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 22px" }}>
        <div style={{ width: "100%", maxWidth: 380, animation: "revokedFadeUp .5s cubic-bezier(.22,.9,.32,1)" }}>
          {/* Kartu status - membungkus semua info dalam satu permukaan jelas
              (bayangan + border tipis + aksen atas), bukan lagi teks
              lepas di atas latar polos, supaya layar ini terasa seperti
              tampilan status yang sengaja dirancang, bukan halaman kosong. */}
          <div style={{ background: "#FFFFFF", borderRadius: 22, border: "1px solid #ECECF1", boxShadow: "0 18px 48px -12px rgba(23,24,28,0.14), 0 2px 8px rgba(23,24,28,0.04)", overflow: "hidden" }}>
            <div style={{ height: 4, background: BRAND }} />
            <div style={{ padding: "34px 26px 26px", textAlign: "center" }}>
              <div style={{
                width: 68, height: 68, margin: "0 auto", borderRadius: "50%",
                background: "linear-gradient(135deg,#FFF1F1,#FFE4EC)",
                display: "flex", alignItems: "center", justifyContent: "center",
                animation: "revokedRing 2.2s ease-out infinite",
              }}>
                <ShieldOff size={30} color="#DC2626" strokeWidth={2.1} />
              </div>

              <h1 style={{ marginTop: 20, fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em" }}>Akses Dilepas</h1>

              {email && (
                <button
                  onClick={copyEmail}
                  title="Salin alamat email"
                  style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 8px 6px 12px", borderRadius: 999, background: copied ? "#ECFDF5" : "#F4F5F7", border: `1px solid ${copied ? "#A7F3D0" : "#ECECF1"}`, cursor: "pointer", fontFamily: FF, transition: "background .15s, border-color .15s" }}>
                  <Mail size={12} color={copied ? "#059669" : "#8A8A96"} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: copied ? "#059669" : "#3A3A44" }}>{email}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: copied ? "#D1FAE5" : "#ECECF1", marginLeft: 2 }}>
                    {copied ? <Check size={10} color="#059669" strokeWidth={3} /> : <Copy size={10} color="#8A8A96" />}
                  </span>
                </button>
              )}

              <p style={{ marginTop: 16, fontSize: 13, color: "#6B6B76", lineHeight: 1.65 }}>
                Akses akun ini ke MartaHub telah dilepas oleh tim <b style={{ color: "#3A3A44" }}>Marcomm Region</b>. Data plan/aktivitas yang sudah pernah dibuat tetap tersimpan dan tidak hilang.
              </p>

              <div style={{ marginTop: 20, borderTop: "1px solid #F0F0F3" }} />

              <p style={{ marginTop: 16, fontSize: 12, color: "#8A8A96", lineHeight: 1.65 }}>
                Hubungi tim <b style={{ color: "#3A3A44" }}>Marcomm Region</b> Anda untuk mengaktifkan kembali akses. Halaman ini akan otomatis masuk begitu akses diaktifkan kembali - atau cek manual lewat tombol di bawah.
              </p>

              {refreshNote && (
                <p style={{ marginTop: 10, fontSize: 11, color: "#B3462F", fontWeight: 600 }}>{refreshNote}</p>
              )}

              <div style={{ marginTop: 22, display: "flex", gap: 8 }}>
                <button onClick={refresh} disabled={refreshing}
                  style={{ flex: 1, height: 48, borderRadius: 13, border: "1px solid #E4E5EA", background: "#FAFAFB", color: "#3A3A44", fontSize: 13, fontWeight: 700, fontFamily: FF, cursor: refreshing ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "background .15s, border-color .15s", opacity: refreshing ? 0.7 : 1 }}
                  onMouseEnter={(e) => { if (!refreshing) { e.currentTarget.style.background = "#F0F0F3"; e.currentTarget.style.borderColor = "#DADAE0"; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#FAFAFB"; e.currentTarget.style.borderColor = "#E4E5EA"; }}>
                  <RefreshCw size={14} style={refreshing ? { animation: "revokedSpin .8s linear infinite" } : undefined} /> Refresh
                </button>
                <button onClick={signOut}
                  style={{ flex: 1, height: 48, borderRadius: 13, border: "1px solid #E4E5EA", background: "#FAFAFB", color: "#3A3A44", fontSize: 13, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "background .15s, border-color .15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#F0F0F3"; e.currentTarget.style.borderColor = "#DADAE0"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#FAFAFB"; e.currentTarget.style.borderColor = "#E4E5EA"; }}>
                  <LogOut size={14} /> Keluar
                </button>
              </div>
            </div>
          </div>

          <p style={{ marginTop: 20, textAlign: "center", fontSize: 11, color: "#B3B3BC", fontWeight: 600 }}>MartaHub · IOH Sumatera</p>
        </div>
      </div>
    </div>
  );
}

export default function RevokedPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100svh", background: "#F4F5F7" }} />}>
      <RevokedInner />
    </Suspense>
  );
}
