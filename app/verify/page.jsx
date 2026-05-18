"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import supabase from "../../lib/supabase";
import { generateOTP } from "../../lib/email/otp";
import { sendOTPEmail } from "../../lib/email/sendOTP";
import {
  Box, Sun, Moon, Loader2, ChevronLeft,
  MailOpen, ShieldCheck, RefreshCw, Edit3, AlertCircle,
} from "lucide-react";

// ─── Design Tokens — Indosat Ooredoo Hutchison ───────────────────────────────
const mk = (d) => ({
  bg:      d ? "#0D0D0E"                       : "#F0F0F3",
  card:    d ? "rgba(22,22,26,0.82)"           : "rgba(255,255,255,0.86)",
  sub:     d ? "rgba(255,255,255,0.05)"        : "rgba(0,0,0,0.04)",
  line:    d ? "rgba(255,255,255,0.10)"        : "rgba(0,0,0,0.10)",
  hi:      d ? "#F2F2F4"                       : "#111113",
  mid:     d ? "#8A8A9A"                       : "#4A4A58",
  lo:      d ? "#4A4A5A"                       : "#9A9AAA",
  red:     "#ED1C24",
  redBg:   d ? "rgba(237,28,36,0.12)"          : "rgba(237,28,36,0.07)",
  redBd:   d ? "rgba(237,28,36,0.28)"          : "rgba(237,28,36,0.18)",
  errRed:  d ? "#FF7070"                       : "#C01018",
  teal:    d ? "#32BCAD"                       : "#1A9E90",
  tealBg:  d ? "rgba(50,188,173,0.12)"         : "rgba(50,188,173,0.07)",
  tealBd:  d ? "rgba(50,188,173,0.28)"         : "rgba(50,188,173,0.18)",
  // OTP cells
  otpBg:   d ? "rgba(255,255,255,0.06)"        : "rgba(0,0,0,0.04)",
  otpFill: d ? "rgba(50,188,173,0.10)"         : "rgba(50,188,173,0.08)",
  otpFillBd:d? "rgba(50,188,173,0.40)"         : "rgba(50,188,173,0.30)",
  shadow:  d ? "0 28px 72px rgba(0,0,0,0.72)" : "0 28px 72px rgba(0,0,0,0.13)",
});

// ─── Background orbs — teal-dominant for "verification" mood ─────────────────
const BgMesh = ({ d }) => (
  <div style={{ position:"fixed", inset:0, zIndex:0, overflow:"hidden", pointerEvents:"none" }}>
    {/* Teal top-centre */}
    <div className="orb orb-teal" style={{ top:"-15%", left:"30%",
      width:"56vw", height:"56vw",
      background: d ? "radial-gradient(circle,rgba(50,188,173,0.26) 0%,transparent 68%)" : "radial-gradient(circle,rgba(50,188,173,0.16) 0%,transparent 68%)" }}/>
    {/* Red bottom-right */}
    <div className="orb orb-red" style={{ bottom:"-18%", right:"-12%",
      width:"58vw", height:"58vw",
      background: d ? "radial-gradient(circle,rgba(237,28,36,0.24) 0%,transparent 68%)" : "radial-gradient(circle,rgba(237,28,36,0.14) 0%,transparent 68%)" }}/>
    {/* Magenta bottom-left */}
    <div className="orb orb-magenta" style={{ bottom:"-10%", left:"-12%",
      width:"44vw", height:"44vw",
      background: d ? "radial-gradient(circle,rgba(198,22,141,0.20) 0%,transparent 68%)" : "radial-gradient(circle,rgba(198,22,141,0.12) 0%,transparent 68%)" }}/>
    <div style={{ position:"absolute", inset:0,
      background: d
        ? "radial-gradient(ellipse at 50% 45%,transparent 22%,rgba(13,13,14,0.72) 100%)"
        : "radial-gradient(ellipse at 50% 45%,transparent 22%,rgba(240,240,243,0.66) 100%)" }}/>
    <div className="grain" style={{ position:"absolute", inset:"-50%", width:"200%", height:"200%",
      backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      opacity: d?0.038:0.022, mixBlendMode:"overlay" }}/>
  </div>
);

// ─── Global CSS ──────────────────────────────────────────────────────────────
const GlobalStyle = ({ d }) => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html{-webkit-text-size-adjust:100%}
    body{margin:0;overflow-x:hidden}
    input,select,textarea{font-size:16px!important;font-family:'DM Sans',sans-serif!important}
    ::-webkit-scrollbar{width:4px}
    ::-webkit-scrollbar-thumb{background:${d?"rgba(255,255,255,0.10)":"rgba(0,0,0,0.12)"};border-radius:99px}

    @keyframes orb-a{0%,100%{transform:translate(0,0) scale(1)}35%{transform:translate(55px,-38px) scale(1.07)}68%{transform:translate(-28px,48px) scale(0.94)}}
    @keyframes orb-b{0%,100%{transform:translate(0,0) scale(1)}42%{transform:translate(-65px,28px) scale(1.06)}72%{transform:translate(36px,-55px) scale(0.93)}}
    @keyframes orb-c{0%,100%{transform:translate(0,0) scale(1)}52%{transform:translate(44px,42px) scale(1.09)}}
    @keyframes grain{0%,100%{transform:translate(0,0)}20%{transform:translate(2%,2%)}40%{transform:translate(-2%,3%)}60%{transform:translate(3%,-2%)}80%{transform:translate(-1%,2%)}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes load-sweep{0%{left:-45%;width:42%}50%{left:28%;width:58%}100%{left:110%;width:42%}}
    @keyframes success-pop{0%{transform:scale(0.55);opacity:0}70%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
    @keyframes ring-pulse{0%{transform:scale(1);opacity:0.5}100%{transform:scale(2.2);opacity:0}}

    .orb{position:absolute;border-radius:50%;filter:blur(1px)}
    .orb-teal  {animation:orb-c 22s ease-in-out infinite}
    .orb-red   {animation:orb-a 20s ease-in-out infinite}
    .orb-magenta{animation:orb-b 28s ease-in-out infinite}
    .grain     {animation:grain 0.35s steps(1) infinite}
    .sh-spin   {animation:spin 0.85s linear infinite}
    .sh-btn    {transition:transform 0.12s ease,opacity 0.12s ease;cursor:pointer}
    .sh-btn:hover:not(:disabled){opacity:0.86}
    .sh-btn:active:not(:disabled){transform:scale(0.97)}

    /* OTP cells */
    .otp-cell{
      transition:border-color 0.15s,box-shadow 0.15s,transform 0.12s,background 0.15s;
      text-align:center;
      caret-color:#32BCAD;
    }
    .otp-cell:focus{
      outline:none;
      border-color:#ED1C24!important;
      box-shadow:0 0 0 3px rgba(237,28,36,0.16)!important;
      transform:scale(1.05);
    }
    .otp-filled{
      border-color:rgba(50,188,173,0.45)!important;
      background:${d?"rgba(50,188,173,0.10)":"rgba(50,188,173,0.07)"}!important;
    }
    .otp-cell-error{
      border-color:rgba(237,28,36,0.65)!important;
      box-shadow:0 0 0 3px rgba(237,28,36,0.14)!important;
      animation:otp-shake 0.35s ease;
    }
    @keyframes otp-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}
  `}</style>
);

// ─── Loading bar ─────────────────────────────────────────────────────────────
const LoadingBar = () => (
  <div style={{ position:"fixed",top:0,left:0,right:0,height:2.5,zIndex:200,overflow:"hidden",
    background:"rgba(50,188,173,0.12)" }}>
    <div style={{ position:"absolute",top:0,height:"100%",borderRadius:99,
      background:"linear-gradient(90deg,transparent,#32BCAD 40%,#ED1C24 60%,#C6168D,transparent)",
      animation:"load-sweep 1.4s cubic-bezier(0.4,0,0.2,1) infinite" }}/>
  </div>
);

// ─── VerifyContent ────────────────────────────────────────────────────────────
function VerifyContent() {
  const router     = useRouter();
  const params     = useSearchParams();
  const emailParam = params.get("email");
  const inputRefs  = useRef([]);

  const [otp,       setOtp]       = useState(Array(6).fill(""));
  const [loading,   setLoading]   = useState(false);
  const [resending, setResending] = useState(false);
  const [errMsg,    setErrMsg]    = useState("");
  const [d,         setD]         = useState(true);
  const [timer,     setTimer]     = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [pending,   setPending]   = useState(null);
  const [done,      setDone]      = useState(false);

  useEffect(() => {
    const v = localStorage.getItem("sh-theme");
    setD(v ? v === "dark" : true);
    const raw = sessionStorage.getItem("pending_reg");
    if (raw) setPending(JSON.parse(raw));
    else if (!emailParam) router.replace("/register");
  }, [emailParam, router]);

  useEffect(() => {
    if (timer <= 0) { setCanResend(true); return; }
    const id = setTimeout(() => setTimer(n => n-1), 1000);
    return () => clearTimeout(id);
  }, [timer]);

  const t = mk(d);

  // ── OTP handlers ─────────────────────────────────────────────────────────
  const handleChange = (el, i) => {
    if (!/^\d?$/.test(el.value)) return;
    const next = [...otp]; next[i] = el.value; setOtp(next);
    setErrMsg("");
    if (el.value && i < 5) inputRefs.current[i+1]?.focus();
  };

  const handleKeyDown = (e, i) => {
    if (e.key === "Backspace") {
      if (otp[i]) {
        const next = [...otp]; next[i] = ""; setOtp(next);
      } else if (i > 0) {
        inputRefs.current[i-1]?.focus();
      }
    }
    if (e.key === "ArrowLeft"  && i > 0) inputRefs.current[i-1]?.focus();
    if (e.key === "ArrowRight" && i < 5) inputRefs.current[i+1]?.focus();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const paste = e.clipboardData.getData("text").replace(/\D/g,"").slice(0,6);
    const next = Array(6).fill("");
    paste.split("").forEach((c,i) => { next[i]=c; });
    setOtp(next);
    inputRefs.current[Math.min(paste.length,5)]?.focus();
  };

  // ── Resend ───────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (!canResend || !emailParam) return;
    setResending(true); setErrMsg("");
    try {
      const newOtp = generateOTP();
      const { error } = await supabase.from("email_otps").insert({
        email:emailParam, otp:String(newOtp),
        expires_at:new Date(Date.now()+600_000).toISOString(), verified:false,
      });
      if (error) throw error;
      const res = await sendOTPEmail(emailParam, newOtp);
      if (!res.success) throw new Error(res.error);
      setTimer(60); setCanResend(false);
      setOtp(Array(6).fill(""));
      inputRefs.current[0]?.focus();
    } catch { setErrMsg("Gagal kirim ulang kode."); }
    finally  { setResending(false); }
  };

  // ── Verify ───────────────────────────────────────────────────────────────
  const handleVerify = async () => {
    const full = otp.join("");
    if (full.length < 6) { setErrMsg("Masukkan 6 digit kode OTP."); return; }
    setLoading(true); setErrMsg("");
    try {
      const res = await fetch("/api/verify-otp", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ email:emailParam?.trim().toLowerCase(), otp:full, ...pending }),
      });
      const data = await res.json();
      if (data.success) {
        sessionStorage.removeItem("pending_reg");
        setDone(true);
        setTimeout(() => router.push("/login?verified=true"), 1600);
      } else {
        setErrMsg(data.message || "Kode OTP salah atau sudah kadaluarsa.");
        setOtp(Array(6).fill(""));
        setTimeout(() => inputRefs.current[0]?.focus(), 80);
      }
    } catch { setErrMsg("Terjadi gangguan sistem."); }
    finally  { setLoading(false); }
  };

  const isErr = !!errMsg && !done;
  const isComplete = otp.every(Boolean);

  return (
    <div style={{
      minHeight:"100svh", position:"relative", overflow:"hidden", color:t.hi,
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:"24px 16px",
      fontFamily:"'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif",
      WebkitFontSmoothing:"antialiased", background: d?"#0D0D0E":"#F0F0F3",
    }}>
      <GlobalStyle d={d} />
      <BgMesh d={d} />
      {loading && <LoadingBar />}

      {/* Theme toggle */}
      <button className="sh-btn"
        onClick={() => { const n=!d; setD(n); localStorage.setItem("sh-theme",n?"dark":"light"); }}
        style={{
          position:"fixed", top:16, right:16, zIndex:50,
          width:38, height:38, borderRadius:10,
          border:`1px solid ${t.line}`,
          background: d?"rgba(22,22,26,0.72)":"rgba(255,255,255,0.72)",
          backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)",
          display:"flex", alignItems:"center", justifyContent:"center", color:t.mid,
        }}>
        {d ? <Sun size={16} strokeWidth={2}/> : <Moon size={16} strokeWidth={2}/>}
      </button>

      <motion.div
        initial={{ opacity:0, y:22, scale:0.975 }}
        animate={{ opacity:1, y:0,  scale:1 }}
        transition={{ duration:0.42, ease:[0.22,1,0.36,1] }}
        style={{ width:"100%", maxWidth:420, position:"relative", zIndex:1 }}
      >
        {/* Logo */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:13, marginBottom:28 }}>
          <div style={{
            width:64, height:64, borderRadius:20,
            background:"linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)",
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:`0 8px 28px rgba(237,28,36,${d?0.52:0.36}),0 0 0 5px rgba(237,28,36,${d?0.11:0.07})`,
          }}>
            <Box size={28} strokeWidth={2.2} color="#fff"/>
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:29, fontWeight:800, letterSpacing:"-0.045em", lineHeight:1, color:t.hi }}>
              Sandra
              <span style={{ background:"linear-gradient(90deg,#ED1C24,#C6168D)",
                WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" }}>Hub</span>
            </div>
            <div style={{ marginTop:6, fontSize:9.5, fontWeight:700, letterSpacing:"0.38em", textTransform:"uppercase", color:t.lo }}>
              SPM Sumatera
            </div>
          </div>
        </div>

        {/* Card */}
        <div style={{
          background:t.card, border:`1px solid ${t.line}`, borderRadius:22,
          boxShadow:t.shadow, backdropFilter:"blur(28px)", WebkitBackdropFilter:"blur(28px)",
          overflow:"hidden",
        }}>
          {/* 4-colour stripe */}
          <div style={{ height:3, background:"linear-gradient(90deg,#ED1C24 0%,#FFCB05 33%,#32BCAD 66%,#C6168D 100%)" }}/>

          <div style={{ padding:"28px 28px 24px" }}>
            {/* Icon + heading */}
            <div style={{ textAlign:"center", marginBottom:24 }}>
              <AnimatePresence mode="wait">
                {done ? (
                  /* ── Success icon ── */
                  <motion.div key="done-icon"
                    initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                    style={{ position:"relative", width:60, height:60, margin:"0 auto 16px" }}>
                    {/* Pulse rings */}
                    {[0,1].map(i => (
                      <div key={i} style={{
                        position:"absolute", inset:0, borderRadius:"50%",
                        border:`2px solid rgba(50,188,173,${d?0.4:0.3})`,
                        animation:`ring-pulse 1.6s ease-out ${i*0.5}s infinite`,
                      }}/>
                    ))}
                    <motion.div
                      initial={{ scale:0.5, opacity:0 }}
                      animate={{ scale:1, opacity:1 }}
                      transition={{ duration:0.4, type:"spring", stiffness:220 }}
                      style={{
                        position:"absolute", inset:0, borderRadius:"50%",
                        background:`radial-gradient(circle,${t.tealBg},transparent)`,
                        border:`1.5px solid ${t.tealBd}`,
                        display:"flex", alignItems:"center", justifyContent:"center",
                      }}>
                      <ShieldCheck size={26} style={{ color:t.teal }} strokeWidth={2}/>
                    </motion.div>
                  </motion.div>
                ) : (
                  /* ── Mail icon ── */
                  <motion.div key="mail-icon"
                    initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                    style={{
                      width:54, height:54, borderRadius:15, margin:"0 auto 16px",
                      background:t.tealBg, border:`1px solid ${t.tealBd}`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                    }}>
                    <MailOpen size={24} style={{ color:t.teal }} strokeWidth={2}/>
                  </motion.div>
                )}
              </AnimatePresence>

              <div style={{ fontSize:20, fontWeight:800, letterSpacing:"-0.03em", color:t.hi }}>
                {done ? "Akun Terverifikasi!" : "Verifikasi Email"}
              </div>

              {!done && (
                <div style={{ marginTop:10 }}>
                  <div style={{ fontSize:13, color:t.mid, marginBottom:10 }}>
                    Kode 6 digit dikirim ke
                  </div>
                  {/* Email pill */}
                  <div style={{
                    display:"inline-flex", alignItems:"center",
                    padding:"7px 14px", borderRadius:10,
                    background:t.tealBg, border:`1px solid ${t.tealBd}`,
                    fontSize:13, fontWeight:700, color:t.hi,
                    wordBreak:"break-all", maxWidth:"100%",
                  }}>
                    {emailParam}
                  </div>
                  <div style={{ marginTop:10 }}>
                    <button className="sh-btn" onClick={() => router.push("/register")}
                      style={{
                        display:"inline-flex", alignItems:"center", gap:5,
                        fontSize:11.5, fontWeight:700, color:t.teal,
                        background:"none", border:"none", padding:0, cursor:"pointer",
                      }}>
                      <Edit3 size={11} strokeWidth={2}/>Ubah alamat email
                    </button>
                  </div>
                </div>
              )}

              {done && (
                <div style={{ marginTop:8, fontSize:13, color:t.mid }}>
                  Mengalihkan ke halaman login…
                </div>
              )}
            </div>

            {/* Error banner */}
            <AnimatePresence>
              {errMsg && (
                <motion.div key="err"
                  initial={{ opacity:0, height:0, marginBottom:0 }}
                  animate={{ opacity:1, height:"auto", marginBottom:20 }}
                  exit={{ opacity:0, height:0, marginBottom:0 }}
                  transition={{ duration:0.2 }}
                  style={{
                    padding:"10px 14px", borderRadius:11,
                    background:t.redBg, border:`1px solid ${t.redBd}`,
                    display:"flex", alignItems:"center", gap:9,
                    fontSize:12.5, fontWeight:600, color:t.errRed, overflow:"hidden",
                  }}>
                  <AlertCircle size={14} strokeWidth={2.2} style={{ flexShrink:0 }}/>
                  {errMsg}
                </motion.div>
              )}
            </AnimatePresence>

            {/* OTP cells + actions */}
            {!done && (
              <>
                {/* 6 OTP cells */}
                <div onPaste={handlePaste}
                  style={{
                    display:"grid", gridTemplateColumns:"repeat(6, minmax(0,1fr))",
                    gap:8, marginBottom:20, width:"100%",
                  }}>
                  {otp.map((val, i) => (
                    <input key={i}
                      ref={el => (inputRefs.current[i] = el)}
                      type="text" inputMode="numeric" maxLength={1} value={val}
                      onChange={e => handleChange(e.target, i)}
                      onKeyDown={e => handleKeyDown(e, i)}
                      className={[
                        "otp-cell",
                        val ? "otp-filled" : "",
                        isErr ? "otp-cell-error" : "",
                      ].join(" ")}
                      style={{
                        width:"100%", minWidth:0,
                        height:58, borderRadius:13,
                        border:`1.5px solid ${isErr?"rgba(237,28,36,0.60)":val?"rgba(50,188,173,0.35)":t.line}`,
                        background: isErr
                          ? (d?"rgba(237,28,36,0.08)":"rgba(237,28,36,0.05)")
                          : val ? t.tealBg : t.otpBg,
                        color:t.hi,
                        fontSize:22, fontWeight:800, textAlign:"center",
                        fontFamily:"'DM Sans',sans-serif",
                        boxSizing:"border-box",
                      }}/>
                  ))}
                </div>

                {/* Progress dots */}
                <div style={{ display:"flex", justifyContent:"center", gap:5, marginBottom:20 }}>
                  {otp.map((v, i) => (
                    <div key={i} style={{
                      width: v ? 8 : 6,
                      height: v ? 8 : 6,
                      borderRadius:"50%",
                      background: v ? t.teal : t.line,
                      transition:"all 0.2s",
                    }}/>
                  ))}
                </div>

                {/* CTA */}
                <button className="sh-btn" onClick={handleVerify} disabled={loading}
                  style={{
                    width:"100%", height:50, borderRadius:13, border:"none",
                    background: (!isComplete || loading)
                      ? (d?"rgba(237,28,36,0.35)":"rgba(237,28,36,0.28)")
                      : "linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)",
                    color:"#fff", fontSize:13.5, fontWeight:700, letterSpacing:"0.01em",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                    boxShadow:(isComplete&&!loading) ? "0 4px 18px rgba(237,28,36,0.40)" : "none",
                    opacity: (!isComplete && !loading) ? 0.65 : 1,
                    cursor: (!isComplete||loading) ? "not-allowed" : "pointer",
                    transition:"background 0.2s,box-shadow 0.2s,opacity 0.2s",
                    marginBottom:18,
                  }}>
                  {loading
                    ? <Loader2 size={18} className="sh-spin"/>
                    : <><ShieldCheck size={15} strokeWidth={2.2}/><span>Verifikasi Akun</span></>
                  }
                </button>

                {/* Resend timer */}
                <div style={{ textAlign:"center" }}>
                  {canResend ? (
                    <button className="sh-btn" onClick={handleResend} disabled={resending}
                      style={{
                        display:"inline-flex", alignItems:"center", gap:7,
                        fontSize:13, fontWeight:700, border:"none", padding:0,
                        background:"linear-gradient(90deg,#32BCAD,#ED1C24)",
                        WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
                        backgroundClip:"text", opacity:resending?0.6:1, cursor:"pointer",
                      }}>
                      {resending
                        ? <Loader2 size={13} className="sh-spin" style={{ color:"#32BCAD" }}/>
                        : <RefreshCw size={13} strokeWidth={2.2} style={{ color:"#32BCAD" }}/>
                      }
                      Kirim Ulang Kode
                    </button>
                  ) : (
                    <div style={{ fontSize:13, fontWeight:500, color:t.mid }}>
                      Kirim ulang dalam{" "}
                      <span style={{
                        fontWeight:800, fontVariantNumeric:"tabular-nums",
                        background:"linear-gradient(90deg,#32BCAD,#ED1C24)",
                        WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
                        backgroundClip:"text",
                      }}>{timer}d</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Done redirect bar */}
            {done && (
              <motion.div
                initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.3 }}>
                <div style={{ height:3, borderRadius:99, overflow:"hidden",
                  background: d?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.07)", marginTop:8 }}>
                  <motion.div
                    initial={{ width:"0%" }} animate={{ width:"100%" }}
                    transition={{ duration:1.5, ease:"linear" }}
                    style={{ height:"100%", borderRadius:99,
                      background:"linear-gradient(90deg,#32BCAD,#ED1C24,#C6168D)" }}/>
                </div>
              </motion.div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding:"14px 28px", borderTop:`1px solid ${t.line}`,
            background: d?"rgba(50,188,173,0.045)":"rgba(50,188,173,0.030)",
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>
            <button className="sh-btn" onClick={() => router.push("/register")}
              style={{
                display:"flex", alignItems:"center", gap:5,
                fontSize:13, fontWeight:700, border:"none", padding:0, cursor:"pointer",
                background:"linear-gradient(90deg,#32BCAD,#ED1C24)",
                WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
              }}>
              <ChevronLeft size={14} strokeWidth={2.5} style={{ color:"#32BCAD" }}/>
              Kembali ke Pendaftaran
            </button>
          </div>
        </div>

        <div style={{ marginTop:22, textAlign:"center", fontSize:10, fontWeight:600,
          letterSpacing:"0.12em", textTransform:"uppercase", color:t.lo, opacity:0.36 }}>
          © 2026 SandraHub · SPM Sumatera
        </div>
      </motion.div>
    </div>
  );
}

// ─── Page Export ─────────────────────────────────────────────────────────────
export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight:"100svh", display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center", gap:16,
        background:"#0D0D0E",
        fontFamily:"'DM Sans',sans-serif",
      }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,700;9..40,800&display=swap');
          @keyframes spin{to{transform:rotate(360deg)}}
          @keyframes load-sweep{0%{left:-45%;width:42%}50%{left:28%;width:58%}100%{left:110%;width:42%}}
          .sh-spin{animation:spin 0.85s linear infinite}
        `}</style>
        {/* Loading bar */}
        <div style={{ position:"fixed",top:0,left:0,right:0,height:2.5,overflow:"hidden",
          background:"rgba(50,188,173,0.12)" }}>
          <div style={{ position:"absolute",top:0,height:"100%",borderRadius:99,
            background:"linear-gradient(90deg,transparent,#32BCAD 40%,#ED1C24 60%,#C6168D,transparent)",
            animation:"load-sweep 1.4s cubic-bezier(0.4,0,0.2,1) infinite" }}/>
        </div>
        {/* Spinner */}
        <div style={{ position:"relative", width:48, height:48 }}>
          <div className="sh-spin" style={{
            position:"absolute", inset:0, borderRadius:"50%",
            border:"2.5px solid transparent",
            borderTopColor:"#ED1C24", borderRightColor:"#32BCAD",
          }}/>
          <div style={{
            position:"absolute", inset:7, borderRadius:10,
            background:"linear-gradient(135deg,#ED1C24,#C6168D)",
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>
            <Box size={16} color="#fff" strokeWidth={2.2}/>
          </div>
        </div>
        <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.14em",
          textTransform:"uppercase", color:"rgba(138,138,154,0.7)" }}>
          Memuat…
        </span>
      </div>
    }>
      <VerifyContent />
    </Suspense>
  );
}