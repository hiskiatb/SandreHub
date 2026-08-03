"use client";
/**
 * /promotor/login — Halaman login Promotor (light, minimalist)
 * Logo SandraHub + tombol Google SSO. Email = Gmail pribadi Promotor.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Loader2, ArrowLeft } from "lucide-react";
import supabase from "../../../lib/supabase";
import { HubLogo } from "../../../components/HubLogo";
import { WhatsAppIcon } from "../../../components/WhatsAppIcon";
import { buildWaLink, fetchCallCenterSetting } from "../../../lib/whatsapp";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;

export default function PromotorLogin() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [waLink, setWaLink] = useState(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => { if (alive && data?.user) router.replace("/promotor"); });
    return () => { alive = false; };
  }, [router]);

  // Tombol "Hubungi Call Center" — nomor & pesan pembuka diatur SPM Sumatera
  // lewat dashboard, sehingga bisa berubah tanpa perlu update aplikasi.
  useEffect(() => {
    let alive = true;
    fetchCallCenterSetting().then((s) => {
      if (!alive) return;
      const link = s ? buildWaLink(s.whatsapp_number, s.message_template) : null;
      setWaLink(link);
    });
    return () => { alive = false; };
  }, []);

  const signIn = async () => {
    setBusy(true); setErr("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/promotor`, queryParams: { prompt: "select_account" } },
      });
      if (error) throw error;
    } catch (e) {
      setErr("Login gagal atau dibatalkan. Coba lagi.");
      setBusy(false);
    }
  };

  return (
    // Background disamakan dgn app utama (C.bg #F4F5F7, lihat page.jsx) —
    // sebelumnya halaman ini pakai putih polos edge-to-edge, jadi terasa
    // "putus" saat transisi login → beranda (beranda punya kanvas abu-abu +
    // aurora, login-nya putih rata). Konten dibungkus kartu bermaxWidth
    // sendiri (bukan lagi full-bleed) supaya di layar lebar (tablet/desktop)
    // tidak terlihat kosong/pecah — mirip kartu 560px yang dipakai di
    // seluruh app promotor lainnya.
    <div style={{ minHeight: "100svh", background: "#F4F5F7", color: "#17181C", fontFamily: FF, WebkitFontSmoothing: "antialiased" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{background:#F4F5F7 !important;overscroll-behavior-y:none}
        @keyframes pspin{to{transform:rotate(360deg)}}
        .promotor-login-card{width:100%;max-width:420px;margin:0 auto;padding:0 24px;box-sizing:border-box}
        @media (min-width:640px){
          .promotor-login-card{
            max-width:460px;margin-top:48px;padding:44px 40px 32px;
            background:#FFFFFF;border:1px solid #E9EAEE;border-radius:24px;
            box-shadow:0 2px 6px rgba(23,24,28,0.07), 0 20px 44px rgba(23,24,28,0.09);
          }
        }
      `}</style>

      {/* Ganti Hub */}
      <div style={{ position: "fixed", top: "calc(env(safe-area-inset-top,0px) + 16px)", left: 18, zIndex: 20 }}>
        <button onClick={() => router.push("/login")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "#FFFFFF", border: "1px solid #E4E5EA", borderRadius: 11, padding: "8px 14px", cursor: "pointer", color: "#61616C", fontSize: 13, fontWeight: 700, fontFamily: FF, boxShadow: "0 1px 2px rgba(23,24,28,0.05)" }}>
          <ArrowLeft size={14} /> Ganti Hub
        </button>
      </div>

      <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "72px 0 calc(env(safe-area-inset-bottom,0px) + 24px)" }}>
        <div className="promotor-login-card" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {/* Logo SandraHub */}
          <HubLogo variant="sandra" size={62} dark={false} shadow inBox />

          <h1 style={{ marginTop: 28, fontSize: 26, fontWeight: 800, letterSpacing: "-0.035em", textAlign: "center", lineHeight: 1.15, color: "#17181C" }}>
            Login sebagai Promotor
          </h1>
          <div style={{ marginTop: 9, display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "#6B6B76", fontWeight: 500 }}>
            Promotor Tracking System
            <span style={{ width: 3, height: 3, borderRadius: 99, background: "#C4C4CE" }} />
            <span style={{ fontWeight: 700, background: "linear-gradient(90deg,#ED1C24,#C6168D)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>SandraHub</span>
          </div>

          {/* Google button */}
          <button onClick={signIn} disabled={busy}
            style={{
              marginTop: 40, width: "100%", height: 54, borderRadius: 14, cursor: busy ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
              background: "#FFFFFF", color: "#1F2430", border: "1.5px solid #E4E5EA", fontFamily: FF, fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em",
              boxShadow: "0 1px 2px rgba(23,24,28,0.05)", opacity: busy ? 0.7 : 1, transition: "border-color .15s, box-shadow .15s, transform .1s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#CFCFD8"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(23,24,28,0.08)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E4E5EA"; e.currentTarget.style.boxShadow = "0 1px 2px rgba(23,24,28,0.05)"; }}
          >
            {busy ? <Loader2 size={21} style={{ animation: "pspin 1s linear infinite", color: "#ED1C24" }} />
                  : <><GoogleG /> Lanjutkan dengan Google</>}
          </button>

          {/* Info note — satu kartu: cara masuk, lalu jalur alternatif
              WhatsApp langsung di bawahnya (tanpa pemisah "ATAU"). */}
          <div style={{ marginTop: 28, width: "100%" }}>
            {err && (
              <div style={{ marginBottom: 12, padding: "11px 14px", borderRadius: 12, background: "#FDECEC", border: "1px solid #F5C2C2", color: "#C62828", fontSize: 12.5, fontWeight: 600, textAlign: "center" }}>{err}</div>
            )}
            <div style={{ borderRadius: 13, background: "#F6F7F9", border: "1px solid #ECEDF0", overflow: "hidden" }}>
              <div style={{ display: "flex", gap: 10, padding: "13px 15px" }}>
                <Info size={16} color="#9A9AA6" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 12.5, color: "#6B6B76", lineHeight: 1.55 }}>
                  Gunakan akun <b style={{ color: "#3A3A44" }}>Google (Gmail)</b>. Hubungi <b style={{ color: "#3A3A44" }}>CSE/RSE</b> Anda untuk didaftarkan.
                </span>
              </div>
              {waLink && (
                <a href={waLink} target="_blank" rel="noopener noreferrer"
                  style={{
                    display: "flex", alignItems: "center", gap: 9, padding: "12px 15px", textDecoration: "none",
                    borderTop: "1px solid #ECEDF0", background: "#F0FBF4", color: "#128C4A",
                    fontFamily: FF, fontSize: 13, fontWeight: 700, transition: "background .15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#E4F9EB"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#F0FBF4"; }}
                >
                  <WhatsAppIcon size={17} /> atau Hubungi Call Center via WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
