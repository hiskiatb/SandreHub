"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";
import { HubLogo } from "../../../components/HubLogo";
import { Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, Sun, Moon, ArrowLeft, ArrowRight, Construction } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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

function MartaLoginInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [d, setD]    = useState(true);
  const [form,     setForm]     = useState({ email: "", password: "" });
  const [errors,   setErrors]   = useState([]);
  const [errMsg,   setErrMsg]   = useState("");
  const [loading,  setLoading]  = useState(false);
  const [showPw,   setShowPw]   = useState(false);
  const [checking, setChecking] = useState(true);
  const t = mk(d);

  const redirect = searchParams.get("redirect") || "/martahub";

  useEffect(() => {
    setD(localStorage.getItem("hub-theme") !== "light");
    supabaseMarta.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace(redirect);
      else setChecking(false);
    });
  }, []);

  const up = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => e.filter(x => x !== k));
    setErrMsg("");
  };

  const handleLogin = async () => {
    setErrMsg(""); setErrors([]);
    if (!MARTA_CONFIGURED) { setErrMsg("MartaHub masih dalam pengembangan — login belum tersedia."); return; }
    const empty = ["email", "password"].filter(k => !form[k]);
    if (empty.length) { setErrors(empty); setErrMsg("Harap isi email dan kata sandi."); return; }
    setLoading(true);
    try {
      const { data, error } = await supabaseMarta.auth.signInWithPassword({
        email: form.email.trim().toLowerCase(), password: form.password,
      });
      if (error) {
        setErrors(["email", "password"]);
        setErrMsg(error.message.includes("Invalid login") ? "Email atau kata sandi tidak sesuai." : error.message);
        return;
      }
      // Check profile active status
      const { data: profile } = await supabaseMarta
        .from("mh_profiles")
        .select("is_active")
        .eq("id", data.user.id)
        .single();
      if (!profile?.is_active) {
        await supabaseMarta.auth.signOut();
        setErrMsg("Akun belum aktif. Hubungi admin untuk aktivasi.");
        return;
      }
      router.refresh();
      router.push(redirect);
    } catch { setErrMsg("Terjadi gangguan pada sistem."); }
    finally  { setLoading(false); }
  };

  if (checking) return (
    <div style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--background,#0A0A0B)" }}>
      <Loader2 size={26} color={RED} style={{ animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const fieldStyle = {
    display: "flex", alignItems: "center", gap: 10,
    height: 46, padding: "0 14px", borderRadius: 10,
    background: t.fieldBg, border: `1.5px solid ${t.line}`,
    transition: "border-color 0.15s",
  };
  const inputStyle = {
    flex: 1, minWidth: 0, height: "100%", background: "transparent",
    border: "none", outline: "none", fontSize: 14, fontWeight: 500,
    color: t.hi, fontFamily: FONT, WebkitAppearance: "none",
  };

  return (
    <div style={{
      minHeight: "100svh", fontFamily: FONT, background: t.bg,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "28px 20px", position: "relative",
      WebkitFontSmoothing: "antialiased",
    }}>

      {/* Mesh bg — sama persis dengan hub picker */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-20%", left: "-10%", width: "60vw", height: "60vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(237,28,36,0.08) 0%,transparent 70%)", filter: "blur(2px)" }} />
        <div style={{ position: "absolute", bottom: "-15%", right: "-5%", width: "50vw", height: "50vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(194,24,124,0.07) 0%,transparent 70%)", filter: "blur(2px)" }} />
        <div style={{ position: "absolute", inset: 0, background: d ? "radial-gradient(ellipse at 50% 50%,transparent 30%,rgba(10,10,11,0.7) 100%)" : "radial-gradient(ellipse at 50% 50%,transparent 30%,rgba(244,244,246,0.6) 100%)" }} />
      </div>

      {/* Back + Theme — fixed */}
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
          {/* Top accent bar */}
          <div style={{ height: 3, background: `linear-gradient(90deg,${RED},${MAGA})` }} />

          <div style={{ padding: "28px 28px 24px" }}>

            {/* Logo row — left-aligned */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
              <HubLogo variant="marta" size={52} shadow inBox pad={3} />
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.04em", color: t.hi, lineHeight: 1.1 }}>
                  Marta<span style={{ background: `linear-gradient(90deg,${RED},${MAGA})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Hub</span>
                </div>
                <div style={{ marginTop: 5, display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 999, background: d ? "rgba(245,158,11,0.14)" : "rgba(217,119,6,0.10)", border: `1px solid ${d ? "rgba(245,158,11,0.32)" : "rgba(217,119,6,0.28)"}` }}>
                  <Construction size={11} color={d ? "#FBBF24" : "#B45309"} strokeWidth={2.4} />
                  <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: d ? "#FBBF24" : "#B45309" }}>Dalam Pengembangan</span>
                </div>
              </div>
            </div>

            {/* Heading */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: t.hi, letterSpacing: "-0.02em" }}>Masuk ke Akun</div>
              <div style={{ marginTop: 3, fontSize: 13, color: t.mid }}>Selamat datang kembali</div>
            </div>

            {/* Dev notice */}
            <div style={{ marginBottom: 18, padding: "10px 13px", borderRadius: 10, background: d ? "rgba(245,158,11,0.10)" : "rgba(217,119,6,0.07)", border: `1px solid ${d ? "rgba(245,158,11,0.26)" : "rgba(217,119,6,0.22)"}`, display: "flex", alignItems: "flex-start", gap: 9 }}>
              <Construction size={15} color={d ? "#FBBF24" : "#B45309"} strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.5, color: d ? "#FBBF24" : "#B45309" }}>
                MartaHub sedang dalam tahap pengembangan{MARTA_CONFIGURED ? "" : " — sebagian fitur, termasuk login, belum tersedia"}.
              </span>
            </div>

            {/* Error */}
            <AnimatePresence>
              {errMsg && (
                <motion.div key="err" initial={{ opacity: 0, height: 0, marginBottom: 0 }} animate={{ opacity: 1, height: "auto", marginBottom: 14 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }} transition={{ duration: 0.18 }}
                  style={{ padding: "9px 13px", borderRadius: 10, background: t.redBg, border: `1px solid ${t.redBd}`, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, color: t.red, overflow: "hidden" }}>
                  <AlertCircle size={13} strokeWidth={2.2} style={{ flexShrink: 0 }} />{errMsg}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Email */}
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.mid }}>Email</label>
                <div style={{ ...fieldStyle, borderColor: errors.includes("email") ? "rgba(220,38,38,0.5)" : t.line }}
                  onFocusCapture={e => e.currentTarget.style.borderColor = RED}
                  onBlurCapture={e => e.currentTarget.style.borderColor = errors.includes("email") ? "rgba(220,38,38,0.5)" : t.line}>
                  <Mail size={14} color={t.lo} style={{ flexShrink: 0 }} />
                  <input type="email" placeholder="nama@ioh.co.id" value={form.email} onChange={e => up("email", e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} style={inputStyle} autoComplete="email" />
                </div>
              </div>

              {/* Password */}
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.mid }}>Kata Sandi</label>
                <div style={{ ...fieldStyle, borderColor: errors.includes("password") ? "rgba(220,38,38,0.5)" : t.line }}
                  onFocusCapture={e => e.currentTarget.style.borderColor = RED}
                  onBlurCapture={e => e.currentTarget.style.borderColor = errors.includes("password") ? "rgba(220,38,38,0.5)" : t.line}>
                  <Lock size={14} color={t.lo} style={{ flexShrink: 0 }} />
                  <input type={showPw ? "text" : "password"} placeholder="Kata sandi" value={form.password} onChange={e => up("password", e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} style={inputStyle} autoComplete="current-password" />
                  <button type="button" onClick={() => setShowPw(p => !p)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", flexShrink: 0, color: showPw ? RED : t.lo }}>
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Submit */}
            <button onClick={handleLogin} disabled={loading || !MARTA_CONFIGURED}
              style={{ marginTop: 20, width: "100%", height: 46, borderRadius: 10, border: "none", background: (loading || !MARTA_CONFIGURED) ? `${RED}55` : `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, boxShadow: (loading || !MARTA_CONFIGURED) ? "none" : `0 4px 18px rgba(237,28,36,0.25)`, cursor: (loading || !MARTA_CONFIGURED) ? "not-allowed" : "pointer", fontFamily: FONT, transition: "opacity 0.15s" }}>
              {!MARTA_CONFIGURED ? <span>Login belum tersedia</span> : loading ? <Loader2 size={16} style={{ animation: "spin .85s linear infinite" }} /> : <><span>Masuk ke MartaHub</span><ArrowRight size={14} strokeWidth={2.5} /></>}
            </button>
          </div>

          {/* Footer */}
          <div style={{ padding: "12px 28px", borderTop: `1px solid ${t.line}`, background: d ? "rgba(255,255,255,0.018)" : "rgba(0,0,0,0.018)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: t.mid }}>Belum punya akun MartaHub?</span>
            <button onClick={() => router.push("/marta/register")} style={{ fontSize: 13, fontWeight: 700, border: "none", padding: 0, cursor: "pointer", background: "none", color: RED, fontFamily: FONT }}>
              Daftar
            </button>
          </div>
        </div>

        <div style={{ marginTop: 18, textAlign: "center", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: t.lo, opacity: 0.35, fontWeight: 600 }}>
          © 2026 MartaHub · Marketing Sumatera
        </div>
      </motion.div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0 }
        body { margin:0 }
        input::placeholder { opacity:0.4 }
        input::-ms-reveal, input::-ms-clear { display:none }
        input::-webkit-credentials-auto-fill-button { visibility:hidden }
        input[type="password"]::-webkit-textfield-decoration-container { display:none }
        @keyframes spin { to { transform:rotate(360deg) } }
        button { transition: opacity 0.14s, transform 0.12s; }
        button:hover:not(:disabled) { opacity: 0.84; }
        button:active:not(:disabled) { transform: scale(0.97); }
        @media (max-width: 480px) {
          input { font-size: 16px !important; }
        }
      `}</style>
    </div>
  );
}

export default function MartaLoginPage() {
  return (
    <Suspense fallback={null}>
      <MartaLoginInner />
    </Suspense>
  );
}
