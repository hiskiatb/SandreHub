"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import supabase from "../../../lib/supabase";
import { HubLogo } from "../../../components/HubLogo";
import { Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, Sun, Moon, ArrowLeft, ArrowRight, CheckCircle2, UserRound, ChevronRight, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const FONT  = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const TEAL  = "#32BCAD";
const RED   = "#ED1C24";
const MAGA  = "#C6168D";

const ROLE_LABEL = { cse_rse: "CSE / RSE", bsm: "BSM", pic_region: "PIC Region", spm_sumatera: "SPM Sumatera", internal_ioh: "Internal IOH" };

const mk = (d) => ({
  bg:      d ? "#0A0A0B" : "#F4F4F6",
  card:    d ? "#141417" : "#FFFFFF",
  line:    d ? "#22222A" : "#E4E2EA",
  hi:      d ? "#F0F0F2" : "#111116",
  mid:     d ? "#7A7A88" : "#5A5A68",
  lo:      d ? "#4A4A58" : "#C8C5D0",
  fieldBg: d ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)",
  red:     d ? "#F87171" : "#DC2626",
  redBg:   d ? "rgba(248,113,113,0.10)" : "rgba(220,38,38,0.07)",
  redBd:   d ? "rgba(248,113,113,0.25)" : "rgba(220,38,38,0.20)",
  tealBg:  d ? "rgba(50,188,173,0.10)" : "rgba(50,188,173,0.07)",
  tealBd:  d ? "rgba(50,188,173,0.28)" : "rgba(50,188,173,0.20)",
  card$:   d ? "0 24px 60px rgba(0,0,0,0.65)" : "0 8px 40px rgba(0,0,0,0.10)",
});

function SandraLoginInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [d, setD]    = useState(true);
  const [stage, setStage] = useState("email");   // email | password
  const [form,     setForm]     = useState({ email: "", password: "" });
  const [errors,   setErrors]   = useState([]);
  const [errMsg,   setErrMsg]   = useState("");
  const [loading,  setLoading]  = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [detected, setDetected] = useState(null);
  const [showPw,   setShowPw]   = useState(false);
  const [checking, setChecking] = useState(true);
  const t = mk(d);

  const verified = searchParams.get("verified") === "1";
  const [verifiedBanner, setVerifiedBanner] = useState(false);

  useEffect(() => {
    setD(localStorage.getItem("hub-theme") !== "light");
    if (verified) setVerifiedBanner(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/dashboard");
      else setChecking(false);
    });
  }, []);

  const up = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => e.filter(x => x !== k)); setErrMsg(""); };

  // Langkah 1 — cek email di mapping lalu lanjut ke password.
  const handleEmailNext = async () => {
    setErrMsg(""); setErrors([]);
    const email = form.email.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setErrors(["email"]); setErrMsg("Masukkan email yang valid."); return; }
    setCheckingEmail(true);
    try {
      const { data } = await supabase.rpc("sdp_login_lookup", { p_email: email });
      setDetected(data && !data.error ? data : null);
    } catch { setDetected(null); }   // jangan blokir login bila cek gagal
    finally { setCheckingEmail(false); setStage("password"); }
  };

  // Langkah 2 — login (auth tetap password) + terapkan mapping ke profil.
  const handleLogin = async () => {
    setErrMsg(""); setErrors([]);
    if (!form.password) { setErrors(["password"]); setErrMsg("Masukkan kata sandi."); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: form.email.trim().toLowerCase(), password: form.password });
      if (error) {
        setErrors(["password"]);
        setErrMsg(error.message.includes("Invalid login") ? "Email atau kata sandi tidak sesuai." : error.message);
        return;
      }
      try { await supabase.rpc("sdp_login_apply"); } catch { /* best-effort */ }
      router.refresh();
      router.push("/dashboard");
    } catch { setErrMsg("Terjadi gangguan pada sistem."); }
    finally  { setLoading(false); }
  };

  if (checking) return (
    <div style={{ minHeight:"100svh", display:"flex", alignItems:"center", justifyContent:"center", background:"var(--background,#0A0A0B)" }}>
      <Loader2 size={26} color={TEAL} style={{ animation:"spin 1s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const fieldStyle = { display:"flex", alignItems:"center", gap:10, height:46, padding:"0 14px", borderRadius:10, background: t.fieldBg, border:`1.5px solid ${t.line}`, transition:"border-color 0.15s" };
  const inputStyle = { flex:1, minWidth:0, height:"100%", background:"transparent", border:"none", outline:"none", fontSize:14, fontWeight:500, color:t.hi, fontFamily:FONT, WebkitAppearance:"none" };

  return (
    <div style={{ minHeight:"100svh", fontFamily:FONT, background:t.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"28px 20px", position:"relative", WebkitFontSmoothing:"antialiased" }}>

      <div style={{ position:"fixed", inset:0, zIndex:0, pointerEvents:"none", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:"-20%", left:"-10%", width:"60vw", height:"60vw", borderRadius:"50%", background:"radial-gradient(circle,rgba(237,28,36,0.08) 0%,transparent 70%)", filter:"blur(2px)" }} />
        <div style={{ position:"absolute", bottom:"-15%", right:"-5%", width:"50vw", height:"50vw", borderRadius:"50%", background:"radial-gradient(circle,rgba(194,24,124,0.07) 0%,transparent 70%)", filter:"blur(2px)" }} />
        <div style={{ position:"absolute", inset:0, background:d?"radial-gradient(ellipse at 50% 50%,transparent 30%,rgba(10,10,11,0.7) 100%)":"radial-gradient(ellipse at 50% 50%,transparent 30%,rgba(244,244,246,0.6) 100%)" }} />
      </div>

      <div style={{ position:"fixed", top:18, left:18, zIndex:50 }}>
        <button onClick={() => router.push("/login")} style={{ display:"flex", alignItems:"center", gap:6, background:d?"rgba(20,20,23,0.9)":"rgba(255,255,255,0.9)", border:`1px solid ${t.line}`, borderRadius:10, padding:"8px 14px", cursor:"pointer", color:t.mid, fontSize:13, fontWeight:600, fontFamily:FONT, backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)" }}>
          <ArrowLeft size={14}/> Ganti Hub
        </button>
      </div>
      <button onClick={() => { const n=!d; setD(n); localStorage.setItem("hub-theme",n?"dark":"light"); }} style={{ position:"fixed", top:18, right:18, zIndex:50, width:36, height:36, borderRadius:10, border:`1px solid ${t.line}`, background:d?"rgba(20,20,23,0.9)":"rgba(255,255,255,0.9)", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", display:"flex", alignItems:"center", justifyContent:"center", color:t.mid, cursor:"pointer" }}>
        {d ? <Sun size={15}/> : <Moon size={15}/>}
      </button>

      <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.42 }} style={{ width:"100%", maxWidth:400, position:"relative", zIndex:1 }}>
        <div style={{ background:t.card, border:`1px solid ${t.line}`, borderRadius:18, boxShadow:t.card$, overflow:"hidden" }}>
          <div style={{ height:3, background:`linear-gradient(90deg,${RED},${MAGA})` }} />
          <div style={{ padding:"28px 28px 24px" }}>

            <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:26 }}>
              <HubLogo variant="sandra" size={52} shadow inBox />
              <div>
                <div style={{ fontSize:20, fontWeight:800, letterSpacing:"-0.04em", color:t.hi, lineHeight:1.1 }}>
                  Sandra<span style={{ background:`linear-gradient(90deg,${RED},${MAGA})`, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" }}>Hub</span>
                </div>
                <div style={{ marginTop:3, fontSize:11, fontWeight:600, letterSpacing:"0.14em", textTransform:"uppercase", color:t.mid }}>S&D Sumatera</div>
              </div>
            </div>

            <AnimatePresence>
              {verifiedBanner && stage === "email" && (
                <motion.div key="ok" initial={{opacity:0,height:0,marginBottom:0}} animate={{opacity:1,height:"auto",marginBottom:14}} exit={{opacity:0,height:0,marginBottom:0}} transition={{duration:0.18}}
                  style={{ padding:"9px 13px", borderRadius:10, background:t.tealBg, border:`1px solid ${t.tealBd}`, display:"flex", alignItems:"center", gap:8, fontSize:12.5, fontWeight:600, color:TEAL, overflow:"hidden" }}>
                  <CheckCircle2 size={13} strokeWidth={2.2} style={{flexShrink:0}}/> Email berhasil diverifikasi. Silakan masuk.
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {errMsg && (
                <motion.div key="err" initial={{opacity:0,height:0,marginBottom:0}} animate={{opacity:1,height:"auto",marginBottom:14}} exit={{opacity:0,height:0,marginBottom:0}} transition={{duration:0.18}}
                  style={{ padding:"9px 13px", borderRadius:10, background:t.redBg, border:`1px solid ${t.redBd}`, display:"flex", alignItems:"center", gap:8, fontSize:12.5, fontWeight:600, color:t.red, overflow:"hidden" }}>
                  <AlertCircle size={13} strokeWidth={2.2} style={{flexShrink:0}}/>{errMsg}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
              {stage === "email" ? (
                <motion.div key="s-email" initial={{opacity:0, x:-14}} animate={{opacity:1, x:0}} exit={{opacity:0, x:-14}} transition={{duration:0.22}}>
                  <div style={{ marginBottom:18 }}>
                    <div style={{ fontSize:17, fontWeight:700, color:t.hi, letterSpacing:"-0.02em" }}>Masuk dengan Email</div>
                    <div style={{ marginTop:3, fontSize:13, color:t.mid }}>Masukkan email Anda untuk melanjutkan</div>
                  </div>
                  <label style={{ fontSize:11, fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase", color:t.mid }}>Email</label>
                  <div style={{ ...fieldStyle, marginTop:5, borderColor: errors.includes("email") ? "rgba(220,38,38,0.5)" : t.line }}
                    onFocusCapture={e => e.currentTarget.style.borderColor=TEAL}
                    onBlurCapture={e => e.currentTarget.style.borderColor=errors.includes("email")?"rgba(220,38,38,0.5)":t.line}>
                    <Mail size={14} color={t.lo} style={{flexShrink:0}}/>
                    <input type="email" placeholder="nama@email.com" value={form.email} onChange={e=>up("email",e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleEmailNext()} style={inputStyle} autoComplete="email" autoFocus/>
                  </div>
                  <button onClick={handleEmailNext} disabled={checkingEmail}
                    style={{ marginTop:20, width:"100%", height:46, borderRadius:10, border:"none", background:checkingEmail?`${TEAL}55`:`linear-gradient(135deg,${TEAL},#1A9E90)`, color:"#fff", fontSize:14, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", gap:7, boxShadow:checkingEmail?"none":`0 4px 18px rgba(50,188,173,0.25)`, cursor:checkingEmail?"not-allowed":"pointer", fontFamily:FONT }}>
                    {checkingEmail ? <Loader2 size={16} style={{animation:"spin .85s linear infinite"}}/> : <><span>Lanjutkan</span><ArrowRight size={14} strokeWidth={2.5}/></>}
                  </button>
                </motion.div>
              ) : (
                <motion.div key="s-pw" initial={{opacity:0, x:14}} animate={{opacity:1, x:0}} exit={{opacity:0, x:14}} transition={{duration:0.22}}>
                  {/* Email + ganti */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, padding:"10px 12px", borderRadius:10, background:t.fieldBg, border:`1px solid ${t.line}`, marginBottom: detected?.found ? 10 : 16 }}>
                    <span style={{ display:"flex", alignItems:"center", gap:8, minWidth:0 }}>
                      <Mail size={14} color={t.lo} style={{flexShrink:0}}/>
                      <span style={{ fontSize:13.5, fontWeight:600, color:t.hi, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{form.email}</span>
                    </span>
                    <button onClick={() => { setStage("email"); setForm(f=>({...f, password:""})); setDetected(null); setErrMsg(""); }} style={{ background:"none", border:"none", cursor:"pointer", color:TEAL, fontSize:12.5, fontWeight:700, fontFamily:FONT, flexShrink:0 }}>Ganti</button>
                  </div>

                  {/* Role terdeteksi dari mapping */}
                  {detected?.found && (
                    <div style={{ display:"flex", alignItems:"center", gap:9, padding:"10px 12px", borderRadius:10, background:t.tealBg, border:`1px solid ${t.tealBd}`, marginBottom:16 }}>
                      <ShieldCheck size={15} color={TEAL} style={{flexShrink:0}}/>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:12.5, fontWeight:800, color:t.hi }}>Masuk sebagai {ROLE_LABEL[detected.role] || detected.role}</div>
                        <div style={{ fontSize:11.5, color:t.mid, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{[detected.brand, detected.branch || detected.cluster, detected.region].filter(Boolean).join(" · ") || "Scope dari mapping"}</div>
                      </div>
                    </div>
                  )}

                  <label style={{ fontSize:11, fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase", color:t.mid }}>Kata Sandi</label>
                  <div style={{ ...fieldStyle, marginTop:5, borderColor: errors.includes("password") ? "rgba(220,38,38,0.5)" : t.line }}
                    onFocusCapture={e => e.currentTarget.style.borderColor=TEAL}
                    onBlurCapture={e => e.currentTarget.style.borderColor=errors.includes("password")?"rgba(220,38,38,0.5)":t.line}>
                    <Lock size={14} color={t.lo} style={{flexShrink:0}}/>
                    <input type={showPw?"text":"password"} placeholder="Kata sandi" value={form.password} onChange={e=>up("password",e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} style={inputStyle} autoComplete="current-password" autoFocus/>
                    <button type="button" onClick={()=>setShowPw(p=>!p)} style={{background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",flexShrink:0,color:showPw?TEAL:t.lo}}>
                      {showPw?<EyeOff size={14}/>:<Eye size={14}/>}
                    </button>
                  </div>
                  <button onClick={handleLogin} disabled={loading}
                    style={{ marginTop:20, width:"100%", height:46, borderRadius:10, border:"none", background:loading?`${TEAL}55`:`linear-gradient(135deg,${TEAL},#1A9E90)`, color:"#fff", fontSize:14, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", gap:7, boxShadow:loading?"none":`0 4px 18px rgba(50,188,173,0.25)`, cursor:loading?"not-allowed":"pointer", fontFamily:FONT }}>
                    {loading ? <Loader2 size={16} style={{animation:"spin .85s linear infinite"}}/> : <><span>Masuk ke SandraHub</span><ArrowRight size={14} strokeWidth={2.5}/></>}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div style={{ padding:"12px 28px", borderTop:`1px solid ${t.line}`, background:d?"rgba(255,255,255,0.018)":"rgba(0,0,0,0.018)", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            <span style={{ fontSize:13, color:t.mid }}>Belum punya akun SandraHub?</span>
            <button onClick={()=>router.push("/sandra/register")} style={{ fontSize:13, fontWeight:700, border:"none", padding:0, cursor:"pointer", background:"none", color:TEAL, fontFamily:FONT }}>Daftar</button>
          </div>
        </div>

        <button onClick={()=>router.push("/promotor")}
          style={{ marginTop:16, width:"100%", display:"flex", alignItems:"center", gap:13, padding:"14px 16px", borderRadius:14, cursor:"pointer", textAlign:"left", fontFamily:FONT,
            background:d?"rgba(237,28,36,0.08)":"rgba(237,28,36,0.05)", border:`1.5px solid ${d?"rgba(237,28,36,0.35)":"rgba(237,28,36,0.28)"}`, transition:"transform .12s, box-shadow .15s, border-color .15s" }}
          onMouseEnter={(e)=>{ e.currentTarget.style.boxShadow="0 8px 26px rgba(237,28,36,0.18)"; e.currentTarget.style.transform="translateY(-1px)"; }}
          onMouseLeave={(e)=>{ e.currentTarget.style.boxShadow="none"; e.currentTarget.style.transform="none"; }}>
          <span style={{ width:42, height:42, borderRadius:12, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", background:"linear-gradient(135deg,#ED1C24,#C6168D)", color:"#fff", boxShadow:"0 4px 14px rgba(237,28,36,0.32)" }}>
            <UserRound size={21} strokeWidth={2.2} />
          </span>
          <span style={{ flex:1, minWidth:0 }}>
            <span style={{ display:"block", fontSize:14.5, fontWeight:800, letterSpacing:"-0.02em", color:t.hi }}>Login sebagai Promotor</span>
            <span style={{ display:"block", fontSize:12, color:t.mid, marginTop:2 }}>Untuk tim promotor lapangan — masuk dengan akun Google</span>
          </span>
          <ChevronRight size={18} style={{ color:"#ED1C24", flexShrink:0 }} />
        </button>

        <div style={{ marginTop:18, textAlign:"center", fontSize:10.5, letterSpacing:"0.12em", textTransform:"uppercase", color:t.lo, opacity:0.35, fontWeight:600 }}>
          © 2026 SandraHub · S&D Sumatera
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
      `}</style>
    </div>
  );
}

export default function SandraLoginPage() {
  return (
    <Suspense fallback={null}>
      <SandraLoginInner />
    </Suspense>
  );
}
