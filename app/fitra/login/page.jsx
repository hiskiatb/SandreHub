"use client";
/**
 * /fitra/login - Gerbang login utama FitraHub (Finance Sumatera Hub).
 * Mirror struktur & tema app/marta/login/page.jsx persis (kartu terang/gelap
 * toggle, header logo, tombol utama, tombol sekunder "Login FitraHub Mobile"
 * di bawah). FitraHub belum punya CMS/auth terpisah berbasis password -
 * satu-satunya mekanisme auth yg ada sekarang adalah Google OAuth yang sama
 * dgn /fitrahub/m/login (lihat file itu utk implementasi aslinya). Jadi
 * kartu utama di sini tetap satu langkah (tombol Google), bukan dua langkah
 * email+password spt Marta - tapi tema, proporsi, dan pola tombol sekunder
 * di bawahnya dibuat identik.
 */
import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, ArrowLeft, UserRound, ChevronRight, Sun, Moon } from "lucide-react";
import { motion } from "framer-motion";
import supabase from "../../../lib/supabase";
import { HubLogo } from "../../../components/HubLogo";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED  = "#ED1C24";
const MAGA = "#C6168D";

const mk = (d) => ({
  bg:      d ? "#0A0A0B" : "#F4F4F6",
  card:    d ? "#141417" : "#FFFFFF",
  line:    d ? "#22222A" : "#E4E2EA",
  hi:      d ? "#F0F0F2" : "#111116",
  mid:     d ? "#8A8A96" : "#5A5A68",
  lo:      d ? "#4A4A58" : "#C8C5D0",
  fieldBg: d ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)",
  red:     d ? "#F87171" : "#DC2626",
  redBg:   d ? "rgba(248,113,113,0.10)" : "rgba(220,38,38,0.07)",
  redBd:   d ? "rgba(248,113,113,0.25)" : "rgba(220,38,38,0.20)",
  card$:   d ? "0 24px 60px rgba(0,0,0,0.65)" : "0 8px 40px rgba(0,0,0,0.10)",
});

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

function FitraLoginInner() {
  const router = useRouter();
  const [d, setD] = useState(true);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const t = mk(d);

  useEffect(() => {
    setD(localStorage.getItem("hub-theme") !== "light");
    let alive = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!alive) return;
      if (session) router.replace("/fitrahub/m");
      else setChecking(false);
    });
    return () => { alive = false; };
  }, [router]);

  const signIn = async () => {
    setBusy(true); setErr("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/fitrahub/m`, queryParams: { prompt: "select_account" } },
      });
      if (error) throw error;
    } catch {
      setErr("Login gagal atau dibatalkan. Coba lagi.");
      setBusy(false);
    }
  };

  if (checking) return (
    <div style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--background,#0A0A0B)" }}>
      <Loader2 size={26} color={RED} style={{ animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{
      minHeight: "100svh", fontFamily: FONT, background: t.bg,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "28px 20px", position: "relative",
      WebkitFontSmoothing: "antialiased",
    }}>

      {/* Mesh bg - sama pola dgn Marta */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-20%", left: "-10%", width: "60vw", height: "60vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(237,28,36,0.08) 0%,transparent 70%)", filter: "blur(2px)" }} />
        <div style={{ position: "absolute", bottom: "-15%", right: "-5%", width: "50vw", height: "50vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(194,24,124,0.07) 0%,transparent 70%)", filter: "blur(2px)" }} />
        <div style={{ position: "absolute", inset: 0, background: d ? "radial-gradient(ellipse at 50% 50%,transparent 30%,rgba(10,10,11,0.7) 100%)" : "radial-gradient(ellipse at 50% 50%,transparent 30%,rgba(244,244,246,0.6) 100%)" }} />
      </div>

      {/* Back + Theme - fixed */}
      <div style={{ position: "fixed", top: 18, left: 18, zIndex: 50 }}>
        <button onClick={() => router.push("/login")} style={{ display: "flex", alignItems: "center", gap: 6, background: d ? "rgba(20,20,23,0.9)" : "rgba(255,255,255,0.9)", border: `1px solid ${t.line}`, borderRadius: 10, padding: "8px 14px", cursor: "pointer", color: t.mid, fontSize: 13, fontWeight: 600, fontFamily: FONT, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
          <ArrowLeft size={14} /> Ganti Hub
        </button>
      </div>
      <button onClick={() => { const n = !d; setD(n); localStorage.setItem("hub-theme", n ? "dark" : "light"); }} style={{ position: "fixed", top: 18, right: 18, zIndex: 50, width: 36, height: 36, borderRadius: 10, border: `1px solid ${t.line}`, background: d ? "rgba(20,20,23,0.9)" : "rgba(255,255,255,0.9)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", color: t.mid, cursor: "pointer" }}>
        {d ? <Sun size={15} /> : <Moon size={15} />}
      </button>

      {/* Card */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42 }}
        style={{ width: "100%", maxWidth: 400, position: "relative", zIndex: 1 }}>

        <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 18, boxShadow: t.card$, overflow: "hidden" }}>
          <div style={{ height: 3, background: `linear-gradient(90deg,${RED},${MAGA})` }} />

          <div style={{ padding: "28px 28px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
              <HubLogo variant="fitra" size={52} shadow inBox pad={3} />
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.04em", color: t.hi, lineHeight: 1.1 }}>
                  Fitra<span style={{ background: `linear-gradient(90deg,${RED},${MAGA})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Hub</span>
                </div>
                <div style={{ marginTop: 3, fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: t.mid }}>Finance Sumatera</div>
              </div>
            </div>

            {err && (
              <div style={{ marginBottom: 14, padding: "9px 13px", borderRadius: 10, background: t.redBg, border: `1px solid ${t.redBd}`, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, color: t.red }}>
                <AlertCircle size={13} strokeWidth={2.2} style={{ flexShrink: 0 }} />{err}
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: t.hi, letterSpacing: "-0.02em" }}>Masuk ke Akun</div>
              <div style={{ marginTop: 3, fontSize: 13, color: t.mid }}>Gunakan akun Google (Gmail) Anda</div>
            </div>

            <button onClick={signIn} disabled={busy}
              style={{
                width: "100%", height: 46, borderRadius: 10, cursor: busy ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                background: t.fieldBg, color: t.hi, border: `1.5px solid ${t.line}`, fontFamily: FONT, fontSize: 14, fontWeight: 700,
                opacity: busy ? 0.7 : 1,
              }}>
              {busy ? <Loader2 size={18} style={{ animation: "spin .85s linear infinite" }} /> : <><GoogleG /> Lanjutkan dengan Google</>}
            </button>

            <div style={{ marginTop: 12, fontSize: 11.5, color: t.mid, lineHeight: 1.5 }}>
              Akses baru akan menunggu approval admin FitraHub sebelum aktif.
            </div>
          </div>
        </div>

        {/* Jalur FitraHub Mobile - sama pola dgn tombol sekunder di Marta,
            walau saat ini kedua jalur berujung ke Google OAuth yang sama. */}
        <button onClick={() => router.push("/fitrahub/m/login")}
          style={{ marginTop: 16, width: "100%", display: "flex", alignItems: "center", gap: 13, padding: "14px 16px", borderRadius: 14, cursor: "pointer", textAlign: "left", fontFamily: FONT,
            background: d ? "rgba(237,28,36,0.08)" : "rgba(237,28,36,0.05)", border: `1.5px solid ${d ? "rgba(237,28,36,0.35)" : "rgba(237,28,36,0.28)"}`, transition: "transform .12s, box-shadow .15s, border-color .15s" }}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 26px rgba(237,28,36,0.18)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}>
          <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", boxShadow: "0 4px 14px rgba(237,28,36,0.32)" }}>
            <UserRound size={21} strokeWidth={2.2} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em", color: t.hi }}>Login FitraHub Mobile</span>
          </span>
          <ChevronRight size={18} style={{ color: RED, flexShrink: 0 }} />
        </button>

        <div style={{ marginTop: 18, textAlign: "center", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: t.lo, opacity: 0.35, fontWeight: 600 }}>
          © 2026 FitraHub · Finance Sumatera
        </div>
      </motion.div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0 }
        body { margin:0 }
        @keyframes spin { to { transform:rotate(360deg) } }
        button { transition: opacity 0.14s, transform 0.12s; }
        button:hover:not(:disabled) { opacity: 0.9; }
        button:active:not(:disabled) { transform: scale(0.97); }
      `}</style>
    </div>
  );
}

export default function FitraLoginPage() {
  return (
    <Suspense fallback={null}>
      <FitraLoginInner />
    </Suspense>
  );
}
