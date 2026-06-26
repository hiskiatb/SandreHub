"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import supabase from "../../lib/supabase";
import { generateOTP } from "../../lib/email/otp";
import { sendOTPEmail } from "../../lib/email/sendOTP";
import { Sun, Moon, Loader2, ChevronLeft, MailOpen, ShieldCheck, RefreshCw, Edit3, AlertCircle } from "lucide-react";
import { HubLogo } from "../../components/HubLogo";

const B = { red: "#ED1C24", yellow: "#FFCB05", teal: "#32BCAD", magenta: "#C6168D" };

const mk = (d) => ({
  bg:     d ? "#0D0D0E" : "#F5F5F6",
  card:   d ? "#1A1A1D" : "#FFFFFF",
  sub:    d ? "#202024" : "#F2F2F4",
  line:   d ? "#2A2A2F" : "#E2E2E6",
  hi:     d ? "#F2F2F3" : "#1A1A1D",
  mid:    d ? "#8A8A96" : "#5A5A68",
  lo:     d ? "#5A5A68" : "#8A8A96",
  teal:   d ? "#32BCAD" : "#1A9E90",
  tealBg: d ? "rgba(50,188,173,0.13)"  : "rgba(50,188,173,0.09)",
  tealBd: d ? "rgba(50,188,173,0.30)"  : "rgba(50,188,173,0.22)",
  red:    d ? "#F87171" : "#DC2626",
  redBg:  d ? "rgba(248,113,113,0.12)" : "rgba(220,38,38,0.07)",
  redBd:  d ? "rgba(248,113,113,0.28)" : "rgba(220,38,38,0.20)",
  otpBg:  d ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)",
  card$:  d ? "0 24px 60px rgba(0,0,0,0.65)" : "0 24px 60px rgba(26,26,29,0.16)",
});

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI","SF Pro Text",Roboto,system-ui,sans-serif`;

function SandraHubLogo({ d }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <HubLogo variant="sandra" size={64} dark={d} shadow inBox />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, color: d ? "#F2F2F3" : "#1A1A1D" }}>
          Sandra<span style={{ background: "linear-gradient(90deg,#ED1C24,#C6168D)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Hub</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 9.5, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", color: d ? "#4D4D4F" : "#8A8A96" }}>SPM Sumatera</div>
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
    input { font-family: "DM Sans", sans-serif !important; font-size: 16px !important }
    ::-webkit-scrollbar { width: 6px }
    ::-webkit-scrollbar-track { background: transparent }
    ::-webkit-scrollbar-thumb { background: ${d ? "#3A3A40" : "#C8C8D0"}; border-radius: 99px }
    @keyframes load-sweep { 0%{left:-45%;width:42%}50%{left:28%;width:58%}100%{left:110%;width:42%} }
    @keyframes sh-spin { to { transform: rotate(360deg) } }
    @keyframes ring-expand { 0%{transform:scale(1);opacity:.45}100%{transform:scale(2.6);opacity:0} }
    @keyframes otp-shake { 0%,100%{transform:translateX(0)}20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)} }
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
    .otp-cell { transition: border-color .16s, box-shadow .16s, transform .14s, background .16s; text-align: center; outline: none; -webkit-appearance: none; appearance: none; caret-color: #32BCAD; }
    .otp-cell:focus { border-color: #32BCAD !important; box-shadow: 0 0 0 3px rgba(50,188,173,0.15) !important; transform: scale(1.04); }
    .otp-filled { border-color: rgba(50,188,173,0.36) !important; background: ${d ? "rgba(50,188,173,0.09)" : "rgba(50,188,173,0.06)"} !important; }
    .otp-err { border-color: rgba(220,38,38,0.52) !important; box-shadow: 0 0 0 3px rgba(220,38,38,0.13) !important; }
    .otp-shake { animation: otp-shake .36s ease }
  `}</style>
);

const LoadingBar = () => (
  <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 2.5, zIndex: 200, overflow: "hidden", background: "rgba(237,28,36,0.10)" }}>
    <div style={{ position: "absolute", top: 0, height: "100%", borderRadius: 99, background: "linear-gradient(90deg,transparent,#ED1C24 35%,#FFCB05 55%,#32BCAD 75%,#C6168D,transparent)", animation: "load-sweep 1.6s cubic-bezier(0.4,0,0.2,1) infinite" }} />
  </div>
);

function VerifyContent() {
  const router = useRouter(), params = useSearchParams(), emailParam = params.get("email");
  const inputRefs = useRef([]);
  const [otp,       setOtp]      = useState(Array(6).fill(""));
  const [loading,   setLoading]  = useState(false);
  const [resending, setResending]= useState(false);
  const [errMsg,    setErrMsg]   = useState("");
  const [d,         setD]        = useState(true);
  const [timer,     setTimer]    = useState(60);
  const [canResend, setCanResend]= useState(false);
  const [pending,   setPending]  = useState(null);
  const [done,      setDone]     = useState(false);
  const [shaking,   setShaking]  = useState(false);

  useEffect(() => {
    setD(localStorage.getItem("sh-theme") !== "light");
    const raw = sessionStorage.getItem("pending_reg");
    if (raw) {
      const parsed = JSON.parse(raw);
      setPending(parsed);
    } else if (!emailParam) router.replace("/register");
  }, [emailParam, router]);

  useEffect(() => {
    if (timer <= 0) { setCanResend(true); return; }
    const id = setTimeout(() => setTimer(n => n - 1), 1000);
    return () => clearTimeout(id);
  }, [timer]);

  const t = mk(d);
  const handleChange = (el, i) => { if (!/^\d?$/.test(el.value)) return; const next = [...otp]; next[i] = el.value; setOtp(next); setErrMsg(""); if (el.value && i < 5) inputRefs.current[i + 1]?.focus(); };
  const handleKeyDown = (e, i) => { if (e.key === "Backspace") { if (otp[i]) { const n = [...otp]; n[i] = ""; setOtp(n); } else if (i > 0) inputRefs.current[i - 1]?.focus(); } if (e.key === "ArrowLeft" && i > 0) inputRefs.current[i - 1]?.focus(); if (e.key === "ArrowRight" && i < 5) inputRefs.current[i + 1]?.focus(); };
  const handlePaste = (e) => { e.preventDefault(); const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6); const next = Array(6).fill(""); paste.split("").forEach((c, i) => { next[i] = c; }); setOtp(next); inputRefs.current[Math.min(paste.length, 5)]?.focus(); };
  const triggerShake = () => { setShaking(true); setTimeout(() => setShaking(false), 400); };

  const handleResend = async () => {
    if (!canResend || !emailParam) return;
    setResending(true); setErrMsg("");
    try {
      const newOtp = generateOTP();
      const { error } = await supabase.from("email_otps").insert({ email: emailParam, otp: String(newOtp), expires_at: new Date(Date.now() + 600_000).toISOString(), verified: false });
      if (error) throw error;
      const res = await sendOTPEmail(emailParam, newOtp);
      if (!res.success) throw new Error(res.error);
      setTimer(60); setCanResend(false); setOtp(Array(6).fill(""));
      inputRefs.current[0]?.focus();
    } catch { setErrMsg("Gagal kirim ulang kode."); }
    finally  { setResending(false); }
  };

const handleVerify = async () => {
  const full = otp.join("");

  if (full.length !== 6) {
    setErrMsg("Masukkan 6 digit kode OTP.");
    triggerShake();
    return;
  }

  if (!pending) {
    setErrMsg("Data registrasi tidak ditemukan. Silakan daftar ulang.");
    return;
  }

  setLoading(true);
  setErrMsg("");

  try {
    const payload = {
      email: emailParam?.trim().toLowerCase(),
      otp: full,
      ...pending,
    };

    console.log("VERIFY PAYLOAD:", payload);

    const res = await fetch("/api/verify-otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    console.log("VERIFY RESPONSE:", {
      status: res.status,
      data,
    });

    if (!res.ok) {
      throw new Error(data.message || "Verifikasi gagal");
    }

    sessionStorage.removeItem("pending_reg");
    setDone(true);

    // Redirect ke login yang sesuai berdasarkan role
    const isSandraRole = ["bsm","cse_rse"].includes(pending?.role);
    setTimeout(() => {
      router.push(isSandraRole ? "/sandra/login?verified=1" : "/login?verified=true");
    }, 1800);

  } catch (err) {
    console.error("VERIFY ERROR:", err);
    setErrMsg(err.message || "Terjadi gangguan sistem.");
    setOtp(Array(6).fill(""));
    triggerShake();
    setTimeout(() => inputRefs.current[0]?.focus(), 80);
  } finally {
    setLoading(false);
  }
};

const isErr = !!errMsg && !done;
const isComplete = otp.every(Boolean);

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
          <div style={{ height: 2, background: "linear-gradient(90deg, #ED1C24 0%, #FFCB05 33%, #32BCAD 66%, #C6168D 100%)" }} />

          <div style={{ padding: "26px 22px 22px" }}>
            <div style={{ textAlign: "center", marginBottom: 22 }}>
              <AnimatePresence mode="wait">
                {done ? (
                  <motion.div key="done" initial={{ opacity: 0, scale: 0.75 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.38, type: "spring", stiffness: 220 }}>
                    <div style={{ position: "relative", width: 52, height: 52, margin: "0 auto 14px" }}>
                      {[0, 1].map(i => <div key={i} style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `1.5px solid rgba(50,188,173,${d ? .32 : .22})`, animation: `ring-expand 2.2s ease-out ${i * 0.75}s infinite` }} />)}
                      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: t.tealBg, border: `1.5px solid ${t.tealBd}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <ShieldCheck size={22} style={{ color: t.teal }} strokeWidth={2} />
                      </div>
                    </div>
                    <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.025em", color: t.hi }}>Akun Terverifikasi!</div>
                    <div style={{ marginTop: 5, fontSize: 13, color: t.mid }}>Mengalihkan ke halaman login…</div>
                  </motion.div>
                ) : (
                  <motion.div key="verify" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div style={{ width: 50, height: 50, borderRadius: 13, margin: "0 auto 14px", background: t.tealBg, border: `1.5px solid ${t.tealBd}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <MailOpen size={21} style={{ color: t.teal }} strokeWidth={2} />
                    </div>
                    <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.025em", color: t.hi }}>Verifikasi Email</div>
                    <div style={{ marginTop: 7, fontSize: 13, color: t.mid }}>Kode 6 digit dikirim ke</div>
                    <div style={{ marginTop: 9, display: "inline-flex", alignItems: "center", padding: "6px 14px", borderRadius: 9, background: t.sub, border: `1px solid ${t.line}`, fontSize: 13, fontWeight: 600, color: t.hi, wordBreak: "break-all", maxWidth: "100%" }}>{emailParam}</div>
                    <div style={{ marginTop: 9 }}>
                      <button className="sh-btn" onClick={() => router.push("/register")} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, color: t.teal, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: FONT }}>
                        <Edit3 size={11} strokeWidth={2} />Ubah alamat email
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {errMsg && (
                <motion.div key="err" initial={{ opacity: 0, height: 0, marginBottom: 0 }} animate={{ opacity: 1, height: "auto", marginBottom: 18 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }} transition={{ duration: 0.2 }}
                  style={{ padding: "9px 13px", borderRadius: 10, background: t.redBg, border: `1px solid ${t.redBd}`, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, color: t.red, overflow: "hidden" }}>
                  <AlertCircle size={13} strokeWidth={2.2} style={{ flexShrink: 0 }} />{errMsg}
                </motion.div>
              )}
            </AnimatePresence>

            {!done && (
              <>
                <div onPaste={handlePaste} style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 7, marginBottom: 14 }}>
                  {otp.map((val, i) => (
                    <input key={i} ref={el => inputRefs.current[i] = el} type="text" inputMode="numeric" maxLength={1} value={val}
                      onChange={e => handleChange(e.target, i)} onKeyDown={e => handleKeyDown(e, i)}
                      className={["otp-cell", val ? "otp-filled" : "", isErr ? "otp-err" : "", shaking ? "otp-shake" : ""].filter(Boolean).join(" ")}
                      style={{ width: "100%", minWidth: 0, height: 54, borderRadius: 10, border: `1.5px solid ${isErr ? "rgba(220,38,38,0.52)" : val ? "rgba(50,188,173,0.34)" : t.line}`, background: isErr ? (d ? "rgba(220,38,38,0.07)" : "rgba(220,38,38,0.04)") : val ? t.tealBg : t.otpBg, color: t.hi, fontSize: 20, fontWeight: 800, fontFamily: FONT, boxSizing: "border-box" }}
                    />
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 5, marginBottom: 18 }}>
                  {otp.map((v, i) => <motion.div key={i} animate={{ width: v ? 10 : 6, background: v ? B.teal : t.line }} transition={{ duration: 0.18 }} style={{ height: 5, borderRadius: 99 }} />)}
                </div>
                <button className="sh-btn" onClick={handleVerify} disabled={loading || !isComplete}
                  style={{ width: "100%", height: 46, borderRadius: 10, border: "none", background: (!isComplete || loading) ? `${B.teal}44` : `linear-gradient(135deg, ${B.teal} 0%, #1A9E90 100%)`, color: "#fff", fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, boxShadow: (isComplete && !loading) ? "0 4px 18px rgba(50,188,173,0.30)" : "none", opacity: (!isComplete && !loading) ? 0.52 : 1, cursor: (!isComplete || loading) ? "not-allowed" : "pointer", transition: "background .18s, box-shadow .18s, opacity .18s", marginBottom: 16, fontFamily: FONT }}>
                  {loading ? <Loader2 size={17} style={{ animation: "sh-spin .85s linear infinite" }} /> : <><ShieldCheck size={14} strokeWidth={2.2} /><span>Verifikasi Akun</span></>}
                </button>
                <div style={{ textAlign: "center" }}>
                  {canResend ? (
                    <button className="sh-btn" onClick={handleResend} disabled={resending} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, border: "none", padding: 0, background: "none", color: t.teal, opacity: resending ? 0.58 : 1, cursor: "pointer", fontFamily: FONT }}>
                      {resending ? <Loader2 size={13} style={{ animation: "sh-spin .85s linear infinite" }} /> : <RefreshCw size={13} strokeWidth={2} />}Kirim Ulang Kode
                    </button>
                  ) : (
                    <div style={{ fontSize: 13, fontWeight: 500, color: t.mid }}>
                      Kirim ulang dalam <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", color: t.teal }}>{timer}d</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {done && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                <div style={{ height: 3, borderRadius: 99, overflow: "hidden", background: t.line, marginTop: 12 }}>
                  <motion.div initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 1.7, ease: "linear" }} style={{ height: "100%", display: "flex" }}>
                    {[B.red, B.yellow, B.teal, B.magenta].map((c, i) => <div key={i} style={{ flex: 1, background: c }} />)}
                  </motion.div>
                </div>
              </motion.div>
            )}
          </div>

          <div style={{ padding: "12px 22px", borderTop: `1px solid ${t.line}`, background: d ? "rgba(255,255,255,0.018)" : "rgba(0,0,0,0.018)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <button className="sh-btn" onClick={() => router.push("/register")} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, border: "none", padding: 0, cursor: "pointer", background: "none", color: t.teal, fontFamily: FONT }}>
              <ChevronLeft size={13} strokeWidth={2.5} />Kembali ke Pendaftaran
            </button>
          </div>
        </div>

        <div style={{ marginTop: 22, textAlign: "center", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: t.lo, opacity: 0.35 }}>
          © 2026 SandraHub · SPM Sumatera
        </div>
      </motion.div>
    </div>
  );
}

// ─── Suspense Fallback — matches page.jsx LoadingScreen style ─────────────────
function VerifyFallback() {
  return (
    <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0, background: "#0D0D0E", fontFamily: `"DM Sans", sans-serif`, position: "relative", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@700;800&display=swap');
        @keyframes load-sweep { 0%{left:-45%;width:42%}50%{left:28%;width:58%}100%{left:110%;width:42%} }
        @keyframes spin-ring { to { transform: rotate(360deg) } }
        @keyframes spin-ring-r { to { transform: rotate(-360deg) } }
        @keyframes brand-beat { 0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(.9)} }
        @keyframes fade-in-up { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }
        @keyframes dot-b { 0%,80%,100%{transform:scale(0.4);opacity:.3}40%{transform:scale(1);opacity:1} }
        @keyframes mesh-1 { 0%,100%{transform:translate(0,0) scale(1)}35%{transform:translate(40px,-30px) scale(1.06)}68%{transform:translate(-20px,35px) scale(0.94)} }
        @keyframes mesh-2 { 0%,100%{transform:translate(0,0) scale(1)}42%{transform:translate(-50px,20px) scale(1.05)}72%{transform:translate(30px,-40px) scale(0.93)} }
        @keyframes mesh-3 { 0%,100%{transform:translate(0,0) scale(1)}52%{transform:translate(35px,30px) scale(1.08)} }
      `}</style>
      {/* Mesh orbs */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "-20%", left: "-10%", width: "50vw", height: "50vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(237,28,36,0.18) 0%,transparent 70%)", animation: "mesh-1 18s ease-in-out infinite", filter: "blur(1px)" }}/>
        <div style={{ position: "absolute", bottom: "-20%", right: "-10%", width: "55vw", height: "55vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(198,22,141,0.16) 0%,transparent 70%)", animation: "mesh-2 24s ease-in-out infinite", filter: "blur(1px)" }}/>
        <div style={{ position: "absolute", top: "35%", right: "15%", width: "35vw", height: "35vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(50,188,173,0.14) 0%,transparent 70%)", animation: "mesh-3 28s ease-in-out infinite", filter: "blur(1px)" }}/>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 50%,transparent 20%,rgba(13,13,14,0.80) 100%)" }}/>
      </div>
      {/* Loading bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2.5, overflow: "hidden", background: "rgba(237,28,36,0.10)" }}>
        <div style={{ position: "absolute", top: 0, height: "100%", borderRadius: 99, background: "linear-gradient(90deg,transparent,#ED1C24 35%,#FFCB05 55%,#32BCAD 75%,#C6168D,transparent)", animation: "load-sweep 1.6s cubic-bezier(0.4,0,0.2,1) infinite" }}/>
      </div>
      {/* Spinner + icon box — identical to page.jsx LoadingScreen */}
      <div style={{ position: "relative", width: 80, height: 80, marginBottom: 28, animation: "fade-in-up 0.4s ease both", animationDelay: "0.1s" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1.5px solid rgba(237,28,36,0.14)" }}/>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid transparent", borderTopColor: "#ED1C24", borderRightColor: "transparent", animation: "spin-ring 1.1s linear infinite" }}/>
        <div style={{ position: "absolute", inset: 6, borderRadius: "50%", border: "1.5px solid transparent", borderTopColor: "#C6168D", borderLeftColor: "transparent", animation: "spin-ring-r 1.7s linear infinite" }}/>
        <div style={{ position: "absolute", inset: 14, borderRadius: 12, background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)", display: "flex", alignItems: "center", justifyContent: "center", animation: "brand-beat 2s ease-in-out infinite" }}>
          <Box size={22} color="#FFFFFF" strokeWidth={2.2} />
        </div>
      </div>
      {/* Wordmark */}
      <div style={{ textAlign: "center", animation: "fade-in-up 0.4s ease both", animationDelay: "0.2s" }}>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 8, color: "#F2F2F3" }}>
          Sandra<span style={{ background: "linear-gradient(90deg,#ED1C24,#C6168D)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Hub</span>
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", color: "#4D4D4F" }}>SPM Sumatera</div>
      </div>
      {/* Dot loader */}
      <div style={{ display: "flex", gap: 7, marginTop: 32, animation: "fade-in-up 0.4s ease both", animationDelay: "0.35s" }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: i === 0 ? "#ED1C24" : i === 1 ? "#FFCB05" : "#32BCAD", animation: `dot-b 1.4s ease-in-out ${i * 0.16}s infinite` }}/>
        ))}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<VerifyFallback />}>
      <VerifyContent />
    </Suspense>
  );
}