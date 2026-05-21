"use client";
import { useState, useEffect } from "react";
import supabase from "../../lib/supabase";
import { Mail, Lock, ArrowRight, Loader2, Sun, Moon, AlertCircle, Eye, EyeOff, Box } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

const B = { red: "#ED1C24", yellow: "#FFCB05", teal: "#32BCAD", magenta: "#C6168D" };

const mk = (d) => ({
  bg:      d ? "#0D0D0E" : "#F5F5F6",
  card:    d ? "#1A1A1D" : "#FFFFFF",
  line:    d ? "#2A2A2F" : "#E2E2E6",
  hi:      d ? "#F2F2F3" : "#1A1A1D",
  mid:     d ? "#8A8A96" : "#5A5A68",
  lo:      d ? "#5A5A68" : "#8A8A96",
  fieldBg: d ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)",
  teal:    d ? "#32BCAD" : "#1A9E90",
  tealBg:  d ? "rgba(50,188,173,0.13)"  : "rgba(50,188,173,0.09)",
  tealBd:  d ? "rgba(50,188,173,0.30)"  : "rgba(50,188,173,0.22)",
  red:     d ? "#F87171" : "#DC2626",
  redBg:   d ? "rgba(248,113,113,0.12)" : "rgba(220,38,38,0.07)",
  redBd:   d ? "rgba(248,113,113,0.28)" : "rgba(220,38,38,0.20)",
  card$:   d ? "0 24px 60px rgba(0,0,0,0.65)" : "0 24px 60px rgba(26,26,29,0.16)",
});

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI","SF Pro Text",Roboto,system-ui,sans-serif`;

function SandraHubLogo({ d }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#FFFFFF",
        boxShadow: "0 8px 24px rgba(237,28,36,0.30)",
      }}>
        <Box size={26} strokeWidth={2.2} />
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, color: d ? "#F2F2F3" : "#1A1A1D" }}>
          Sandra
          <span style={{ background: "linear-gradient(90deg,#ED1C24,#C6168D)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Hub</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 9.5, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", color: d ? "#4D4D4F" : "#8A8A96" }}>
          SPM Sumatera
        </div>
      </div>
    </div>
  );
}

const GlobalCSS = ({ d }) => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }
    html { -webkit-text-size-adjust: 100% }
    body { margin: 0; overflow-x: hidden }
    input { font-family: "DM Sans", sans-serif !important; font-size: 14px !important }
    input::placeholder { font-weight: 400; opacity: 0.45 }
    input[type="password"]::-ms-reveal, input[type="password"]::-ms-clear { display: none !important }
    ::-webkit-scrollbar { width: 6px }
    ::-webkit-scrollbar-track { background: transparent }
    ::-webkit-scrollbar-thumb { background: ${d ? "#3A3A40" : "#C8C8D0"}; border-radius: 99px }
    @keyframes load-sweep { 0%{left:-45%;width:42%}50%{left:28%;width:58%}100%{left:110%;width:42%} }
    @keyframes sh-spin { to { transform: rotate(360deg) } }
    @keyframes mesh-1 { 0%,100%{transform:translate(0,0) scale(1)}35%{transform:translate(40px,-30px) scale(1.06)}68%{transform:translate(-20px,35px) scale(0.94)} }
    @keyframes mesh-2 { 0%,100%{transform:translate(0,0) scale(1)}42%{transform:translate(-50px,20px) scale(1.05)}72%{transform:translate(30px,-40px) scale(0.93)} }
    @keyframes mesh-3 { 0%,100%{transform:translate(0,0) scale(1)}52%{transform:translate(35px,30px) scale(1.08)} }
    .sh-mesh { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
    .sh-mesh-o1 { position: absolute; top: -20%; left: -10%; width: 50vw; height: 50vw; border-radius: 50%; background: radial-gradient(circle,rgba(237,28,36,0.14) 0%,transparent 70%); animation: mesh-1 18s ease-in-out infinite; filter: blur(1px); }
    .sh-mesh-o2 { position: absolute; bottom: -20%; right: -10%; width: 55vw; height: 55vw; border-radius: 50%; background: radial-gradient(circle,rgba(198,22,141,0.12) 0%,transparent 70%); animation: mesh-2 24s ease-in-out infinite; filter: blur(1px); }
    .sh-mesh-o3 { position: absolute; top: 35%; right: 15%; width: 35vw; height: 35vw; border-radius: 50%; background: radial-gradient(circle,rgba(50,188,173,0.10) 0%,transparent 70%); animation: mesh-3 28s ease-in-out infinite; filter: blur(1px); }
    .sh-mesh-v { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%,transparent 20%,${d ? "rgba(13,13,14,0.72)" : "rgba(245,245,246,0.60)"} 100%); }
    .sh-btn { transition: opacity .14s ease, transform .12s ease; cursor: pointer }
    .sh-btn:hover:not(:disabled) { opacity: .82 }
    .sh-btn:active:not(:disabled) { transform: scale(.97) }
    .sh-field { transition: border-color .16s, box-shadow .16s }
    .sh-field:focus-within { border-color: #32BCAD !important; box-shadow: 0 0 0 3px rgba(50,188,173,0.14) !important; }
    .sh-field-err { border-color: rgba(220,38,38,0.40) !important }
    .sh-field-err:focus-within { border-color: #DC2626 !important; box-shadow: 0 0 0 3px rgba(220,38,38,0.13) !important; }
    @media (max-width: 480px) { input { font-size: 16px !important } }
  `}</style>
);

const LoadingBar = () => (
  <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 2.5, zIndex: 200, overflow: "hidden", background: "rgba(237,28,36,0.10)" }}>
    <div style={{ position: "absolute", top: 0, height: "100%", borderRadius: 99, background: "linear-gradient(90deg,transparent,#ED1C24 35%,#FFCB05 55%,#32BCAD 75%,#C6168D,transparent)", animation: "load-sweep 1.6s cubic-bezier(0.4,0,0.2,1) infinite" }} />
  </div>
);

function Field({ label, icon, trailing, hasError, children, t }) {
  return (
    <div>
      {label && <label style={{ display: "block", marginBottom: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: t.lo }}>{label}</label>}
      <div className={`sh-field${hasError ? " sh-field-err" : ""}`} style={{ display: "flex", alignItems: "center", gap: 10, height: 46, padding: "0 13px", borderRadius: 10, background: t.fieldBg, border: `1.5px solid ${hasError ? "rgba(220,38,38,0.40)" : t.line}` }}>
        <span style={{ color: hasError ? t.red : t.lo, display: "flex", flexShrink: 0 }}>{icon}</span>
        {children}{trailing}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [form,    setForm]    = useState({ email: "", password: "" });
  const [errors,  setErrors]  = useState([]);
  const [errMsg,  setErrMsg]  = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw,  setShowPw]  = useState(false);
  const [d,       setD]       = useState(true);

  useEffect(() => { setD(localStorage.getItem("sh-theme") !== "light"); }, []);
  const t = mk(d);
  const up = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => e.filter(x => x !== k)); setErrMsg(""); };

  const handleLogin = async () => {
    setErrMsg(""); setErrors([]);
    const empty = ["email", "password"].filter(k => !form[k]);
    if (empty.length) { setErrors(empty); setErrMsg("Harap isi email dan kata sandi."); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: form.email.trim().toLowerCase(), password: form.password });
      if (error) { setErrors(["email","password"]); setErrMsg(error.message.includes("Invalid login") ? "Email atau kata sandi tidak sesuai." : error.message); return; }
      router.refresh(); router.push("/dashboard");
    } catch { setErrMsg("Terjadi gangguan pada sistem."); }
    finally  { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100svh", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", fontFamily: FONT, WebkitFontSmoothing: "antialiased", color: t.hi, background: t.bg }}>
      <GlobalCSS d={d} />
      <div className="sh-mesh"><div className="sh-mesh-o1"/><div className="sh-mesh-o2"/><div className="sh-mesh-o3"/><div className="sh-mesh-v"/></div>
      {loading && <LoadingBar />}

      <button className="sh-btn" onClick={() => { const n = !d; setD(n); localStorage.setItem("sh-theme", n ? "dark" : "light"); }}
        style={{ position: "fixed", top: 16, right: 16, zIndex: 50, width: 36, height: 36, borderRadius: 9, border: `1px solid ${t.line}`, background: d ? "rgba(22,22,24,0.88)" : "rgba(255,255,255,0.88)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", color: t.mid }}>
        {d ? <Sun size={15} strokeWidth={2} /> : <Moon size={15} strokeWidth={2} />}
      </button>

      <motion.div initial={{ opacity: 0, y: 16, scale: 0.988 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.48, ease: [0.25, 0.46, 0.45, 0.94] }} style={{ width: "100%", maxWidth: 390, position: "relative", zIndex: 1 }}>
        <div style={{ marginBottom: 28 }}><SandraHubLogo d={d} /></div>

        <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, boxShadow: t.card$, overflow: "hidden" }}>
          {/* Gradient stripe — same as page.jsx header */}
          <div style={{ height: 2, background: "linear-gradient(90deg, #ED1C24 0%, #FFCB05 33%, #32BCAD 66%, #C6168D 100%)" }} />

          <div style={{ padding: "24px 22px 20px" }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.025em", color: t.hi, lineHeight: 1.2 }}>Masuk ke Akun</div>
              <div style={{ marginTop: 4, fontSize: 13, color: t.mid }}>Selamat datang kembali di SandraHub</div>
            </div>

            <AnimatePresence>
              {errMsg && (
                <motion.div key="err" initial={{ opacity: 0, height: 0, marginBottom: 0 }} animate={{ opacity: 1, height: "auto", marginBottom: 14 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }} transition={{ duration: 0.2 }}
                  style={{ padding: "9px 13px", borderRadius: 10, background: t.redBg, border: `1px solid ${t.redBd}`, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, color: t.red, overflow: "hidden" }}>
                  <AlertCircle size={13} strokeWidth={2.2} style={{ flexShrink: 0 }} />{errMsg}
                </motion.div>
              )}
            </AnimatePresence>

            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              <Field label="Email" icon={<Mail size={14} strokeWidth={2} />} hasError={errors.includes("email")} t={t}>
                <input type="email" placeholder="nama@email.com" value={form.email} onChange={e => up("email", e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} style={{ flex: 1, minWidth: 0, height: "100%", background: "transparent", border: "none", outline: "none", fontSize: 14, fontWeight: 500, color: t.hi, fontFamily: FONT }} />
              </Field>
              <Field label="Kata Sandi" icon={<Lock size={14} strokeWidth={2} />} hasError={errors.includes("password")} t={t}
                trailing={<button type="button" onClick={() => setShowPw(p => !p)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", flexShrink: 0, color: showPw ? B.teal : t.lo }}>{showPw ? <EyeOff size={14} /> : <Eye size={14} />}</button>}>
                <input type={showPw ? "text" : "password"} placeholder="Kata sandi" value={form.password} onChange={e => up("password", e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} style={{ flex: 1, minWidth: 0, height: "100%", background: "transparent", border: "none", outline: "none", fontSize: 14, fontWeight: 500, color: t.hi, fontFamily: FONT, WebkitAppearance: "none" }} />
              </Field>
            </div>

            <button className="sh-btn" onClick={handleLogin} disabled={loading}
              style={{ marginTop: 18, width: "100%", height: 46, borderRadius: 10, border: "none", background: loading ? `${B.teal}55` : `linear-gradient(135deg, ${B.teal} 0%, #1A9E90 100%)`, color: "#fff", fontSize: 13.5, fontWeight: 700, letterSpacing: "-0.01em", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, boxShadow: loading ? "none" : "0 4px 18px rgba(50,188,173,0.30)", cursor: loading ? "not-allowed" : "pointer", transition: "background .18s, box-shadow .18s", fontFamily: FONT }}>
              {loading ? <Loader2 size={17} style={{ animation: "sh-spin .85s linear infinite" }} /> : <><span>Masuk ke Sistem</span><ArrowRight size={14} strokeWidth={2.5} /></>}
            </button>
          </div>

          <div style={{ padding: "12px 22px", borderTop: `1px solid ${t.line}`, background: d ? "rgba(255,255,255,0.018)" : "rgba(0,0,0,0.018)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: t.mid }}>Belum punya akun?</span>
            <button className="sh-btn" onClick={() => router.push("/register")} style={{ fontSize: 13, fontWeight: 700, border: "none", padding: 0, cursor: "pointer", background: "none", color: B.teal, fontFamily: FONT }}>Daftar sekarang</button>
          </div>
        </div>

        <div style={{ marginTop: 22, textAlign: "center", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: t.lo, opacity: 0.35 }}>
          © 2026 SandraHub · SPM Sumatera
        </div>
      </motion.div>
    </div>
  );
}