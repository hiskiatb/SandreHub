"use client";
import { useState, useEffect, useRef } from "react";
import supabase from "../../lib/supabase";
import {
  Box, Mail, Lock, LockKeyhole, User, Shield, Building2, Info,
  CheckCircle2, XCircle, AlertCircle, ChevronLeft, Send,
  Loader2, Sun, Moon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { generateOTP } from "../../lib/email/otp";
import { sendOTPEmail } from "../../lib/email/sendOTP";

// ─── Design Tokens — Indosat Ooredoo Hutchison ───────────────────────────────
const mk = (d) => ({
  bg:      d ? "#0D0D0E"                       : "#F0F0F3",
  card:    d ? "rgba(22,22,26,0.82)"           : "rgba(255,255,255,0.86)",
  sub:     d ? "rgba(255,255,255,0.05)"        : "rgba(0,0,0,0.04)",
  line:    d ? "rgba(255,255,255,0.10)"        : "rgba(0,0,0,0.10)",
  hi:      d ? "#F2F2F4"                       : "#111113",
  mid:     d ? "#8A8A9A"                       : "#4A4A58",
  lo:      d ? "#4A4A5A"                       : "#9A9AAA",
  // Primary — Red
  red:     "#ED1C24",
  redBg:   d ? "rgba(237,28,36,0.12)"          : "rgba(237,28,36,0.07)",
  redBd:   d ? "rgba(237,28,36,0.28)"          : "rgba(237,28,36,0.18)",
  errRed:  d ? "#FF7070"                       : "#C01018",
  // Teal — success/check
  green:   d ? "#32BCAD"                       : "#1A9E90",
  // Magenta accent
  magenta: "#C6168D",
  magBg:   d ? "rgba(198,22,141,0.11)"         : "rgba(198,22,141,0.07)",
  magBd:   d ? "rgba(198,22,141,0.26)"         : "rgba(198,22,141,0.16)",
  // Info tooltip (teal-ish)
  infoBg:  d ? "rgba(50,188,173,0.10)"         : "rgba(50,188,173,0.07)",
  infoBd:  d ? "rgba(50,188,173,0.26)"         : "rgba(50,188,173,0.16)",
  infoTxt: d ? "#32BCAD"                       : "#1A9E90",
  inputBg: d ? "rgba(255,255,255,0.055)"       : "rgba(0,0,0,0.038)",
  shadow:  d ? "0 28px 72px rgba(0,0,0,0.72)" : "0 28px 72px rgba(0,0,0,0.13)",
});

// ─── Background orbs ─────────────────────────────────────────────────────────
const BgMesh = ({ d }) => (
  <div style={{ position:"fixed", inset:0, zIndex:0, overflow:"hidden", pointerEvents:"none" }}>
    <div className="orb orb-magenta" style={{ top:"-12%", right:"-14%", width:"60vw", height:"60vw",
      background: d ? "radial-gradient(circle,rgba(198,22,141,0.28) 0%,transparent 68%)" : "radial-gradient(circle,rgba(198,22,141,0.16) 0%,transparent 68%)" }}/>
    <div className="orb orb-red" style={{ bottom:"-20%", left:"-12%", width:"58vw", height:"58vw",
      background: d ? "radial-gradient(circle,rgba(237,28,36,0.26) 0%,transparent 68%)" : "radial-gradient(circle,rgba(237,28,36,0.15) 0%,transparent 68%)" }}/>
    <div className="orb orb-teal" style={{ top:"28%", left:"-6%", width:"40vw", height:"40vw",
      background: d ? "radial-gradient(circle,rgba(50,188,173,0.20) 0%,transparent 68%)" : "radial-gradient(circle,rgba(50,188,173,0.13) 0%,transparent 68%)" }}/>
    <div className="orb orb-yellow" style={{ top:"10%", left:"40%", width:"28vw", height:"28vw",
      background: d ? "radial-gradient(circle,rgba(255,203,5,0.11) 0%,transparent 68%)" : "radial-gradient(circle,rgba(255,203,5,0.08) 0%,transparent 68%)" }}/>
    <div style={{ position:"absolute", inset:0,
      background: d
        ? "radial-gradient(ellipse at 50% 45%,transparent 20%,rgba(13,13,14,0.70) 100%)"
        : "radial-gradient(ellipse at 50% 45%,transparent 20%,rgba(240,240,243,0.64) 100%)" }}/>
    <div className="grain" style={{ position:"absolute", inset:"-50%", width:"200%", height:"200%",
      backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      opacity: d ? 0.038 : 0.022, mixBlendMode:"overlay" }}/>
  </div>
);

// ─── Global CSS ──────────────────────────────────────────────────────────────
const GlobalStyle = ({ d }) => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html{-webkit-text-size-adjust:100%;font-size:16px}
    body{margin:0;overflow-x:hidden}
    input,select,textarea{font-size:15px!important;font-family:'DM Sans',sans-serif!important;line-height:1.4}
    input::placeholder,textarea::placeholder{color:${d?"rgba(138,138,154,0.60)":"rgba(154,154,170,0.80)"};font-weight:400;font-size:13px}
    ::-webkit-scrollbar{width:4px}
    ::-webkit-scrollbar-thumb{background:${d?"rgba(255,255,255,0.10)":"rgba(0,0,0,0.12)"};border-radius:99px}
    select{-webkit-appearance:none;appearance:none}
    select option{background:${d?"#1A1A1E":"#ffffff"};color:${d?"#F2F2F4":"#111113"}}

    @keyframes orb-a{0%,100%{transform:translate(0,0) scale(1)}35%{transform:translate(55px,-38px) scale(1.07)}68%{transform:translate(-28px,48px) scale(0.94)}}
    @keyframes orb-b{0%,100%{transform:translate(0,0) scale(1)}42%{transform:translate(-65px,28px) scale(1.06)}72%{transform:translate(36px,-55px) scale(0.93)}}
    @keyframes orb-c{0%,100%{transform:translate(0,0) scale(1)}52%{transform:translate(44px,42px) scale(1.09)}}
    @keyframes grain{0%,100%{transform:translate(0,0)}20%{transform:translate(2%,2%)}40%{transform:translate(-2%,3%)}60%{transform:translate(3%,-2%)}80%{transform:translate(-1%,2%)}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes load-sweep{0%{left:-45%;width:42%}50%{left:28%;width:58%}100%{left:110%;width:42%}}

    .orb{position:absolute;border-radius:50%;filter:blur(1px)}
    .orb-red   {animation:orb-a 20s ease-in-out infinite}
    .orb-magenta{animation:orb-b 25s ease-in-out infinite}
    .orb-teal  {animation:orb-c 30s ease-in-out infinite}
    .orb-yellow{animation:orb-a 34s ease-in-out infinite reverse}
    .grain     {animation:grain 0.35s steps(1) infinite}
    .sh-spin   {animation:spin 0.85s linear infinite}
    .sh-btn    {transition:transform 0.12s ease,opacity 0.12s ease;cursor:pointer}
    .sh-btn:hover:not(:disabled){opacity:0.86}
    .sh-btn:active:not(:disabled){transform:scale(0.97)}
    .sh-field  {transition:border-color 0.15s,box-shadow 0.15s;min-width:0}
    .sh-field:focus-within{border-color:#ED1C24!important;box-shadow:0 0 0 3px rgba(237,28,36,0.15)!important}
    .sh-field-err{border-color:rgba(237,28,36,0.60)!important;box-shadow:0 0 0 3px rgba(237,28,36,0.12)!important}
    .sh-field-err:focus-within{border-color:rgba(237,28,36,0.80)!important;box-shadow:0 0 0 3px rgba(237,28,36,0.18)!important}
    @media(max-width:540px){
      .reg-grid{grid-template-columns:1fr!important}
      input,select,textarea{font-size:16px!important}
    }
  `}</style>
);

// ─── Loading bar ─────────────────────────────────────────────────────────────
const LoadingBar = () => (
  <div style={{ position:"fixed",top:0,left:0,right:0,height:2.5,zIndex:200,overflow:"hidden",
    background:"rgba(237,28,36,0.10)" }}>
    <div style={{ position:"absolute",top:0,height:"100%",borderRadius:99,
      background:"linear-gradient(90deg,transparent,#ED1C24 40%,#FFCB05 60%,#C6168D,transparent)",
      animation:"load-sweep 1.4s cubic-bezier(0.4,0,0.2,1) infinite" }}/>
  </div>
);

// ─── Reusable Field ──────────────────────────────────────────────────────────
function Field({ label, icon, children, hasError, trailing, t, d }) {
  return (
    <div>
      {label && (
        <label style={{ display:"block", marginBottom:7, paddingLeft:1,
          fontSize:10.5, fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase", color:t.lo }}>
          {label}
        </label>
      )}
      <div className={`sh-field${hasError?" sh-field-err":""}`}
        style={{
          display:"flex", alignItems:"center", gap:10,
          height:50, borderRadius:12, padding:"0 14px",
          background:t.inputBg,
          border:`1.5px solid ${hasError?"rgba(237,28,36,0.55)":t.line}`,
          minWidth:0, overflow:"hidden",
        }}>
        <span style={{ color:hasError?"#ED1C24":t.lo, flexShrink:0, display:"flex" }}>{icon}</span>
        {children}
        {trailing}
      </div>
    </div>
  );
}

// ─── TInput ──────────────────────────────────────────────────────────────────
function TInput({ type="text", placeholder, value, onChange, onBlur, t }) {
  return (
    <input type={type} placeholder={placeholder} value={value}
      onChange={e => onChange(e.target.value)} onBlur={onBlur}
      style={{ flex:1, minWidth:0, height:"100%", background:"transparent",
        border:"none", outline:"none", fontSize:14, fontWeight:500,
        color:t.hi, fontFamily:"inherit" }}/>
  );
}

// ─── TSelect ─────────────────────────────────────────────────────────────────
function TSelect({ value, onChange, children, t }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ flex:1, minWidth:0, height:"100%", background:"transparent",
        border:"none", outline:"none", fontSize:14, fontWeight:500,
        color:t.hi, fontFamily:"inherit", cursor:"pointer" }}>
      {children}
    </select>
  );
}

// ─── CheckItem ───────────────────────────────────────────────────────────────
function CheckItem({ label, ok, t }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      {ok
        ? <CheckCircle2 size={14} strokeWidth={2.2} style={{ color:"#32BCAD", flexShrink:0 }}/>
        : <XCircle      size={14} strokeWidth={2}   style={{ color:t.lo, flexShrink:0 }}/>
      }
      <span style={{ fontSize:12, fontWeight:600, color:ok?"#32BCAD":t.lo }}>{label}</span>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function RegisterPage() {
  const router     = useRouter();
  const infoRef    = useRef(null);
  const infoBtnRef = useRef(null);

  const [form, setForm] = useState({
    email:"", password:"", confirm_password:"",
    full_name:"", username:"", role:"spm_sumatera",
    access_code:"", partner_name:"",
  });
  const [partnersList, setPartnersList] = useState([]);
  const [loadingP,     setLoadingP]     = useState(false);
  const [errMsg,       setErrMsg]       = useState("");
  const [errors,       setErrors]       = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [d,            setD]            = useState(true);
  const [showInfo,     setShowInfo]     = useState(false);
  const [checking,     setChecking]     = useState({ email:false, username:false });
  const [exists,       setExists]       = useState({ email:false, username:false });

  useEffect(() => {
    const v = localStorage.getItem("sh-theme");
    setD(v ? v === "dark" : true);
    const raw = sessionStorage.getItem("pending_reg");
    if (raw) {
      const p = JSON.parse(raw);
      setForm(f => ({
        ...f,
        email:p.email||"", full_name:p.full_name||"",
        username:p.username||"", role:p.role||"spm_sumatera",
        access_code:p.access_code||"", partner_name:p.partner_name||"",
      }));
    }
    (async () => {
      setLoadingP(true);
      try {
        const { data } = await supabase.from("partner_branches").select("partner_name");
        if (data) setPartnersList([...new Set(data.map(x => x.partner_name))].sort());
      } catch {}
      finally { setLoadingP(false); }
    })();
    const onClick = e => {
      if (
        infoRef.current && !infoRef.current.contains(e.target) &&
        infoBtnRef.current && !infoBtnRef.current.contains(e.target)
      ) setShowInfo(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const t = mk(d);

  const up = (key, val) => {
    setForm(f => ({ ...f, [key]:val }));
    setErrors(e => e.filter(x => x !== key));
    setErrMsg("");
  };

  const debounceRef = useRef({});
  const checkAvail = (field, value) => {
    if (!value) return;
    if (debounceRef.current[field]) clearTimeout(debounceRef.current[field]);
    setChecking(p => ({ ...p, [field]:true }));
    debounceRef.current[field] = setTimeout(async () => {
      const normalized = (field==="email"||field==="username") ? value.toLowerCase().trim() : value;
      const { data, error } = await supabase.rpc("check_user_exists", { p_field:field, p_value:normalized });
      if (error) { console.error("Error mengecek ketersediaan:", error); setChecking(p => ({ ...p, [field]:false })); return; }
      setExists(p => ({ ...p, [field]:data }));
      setChecking(p => ({ ...p, [field]:false }));
    }, 400);
  };

  const pass = {
    length:  form.password.length >= 8,
    capital: /[A-Z]/.test(form.password),
    symbol:  /[0-9!@#$%^&*]/.test(form.password),
    match:   form.password !== "" && form.password === form.confirm_password,
  };

  const handleRegister = async () => {
    setErrMsg(""); setErrors([]);
    const empty = Object.entries(form)
      .filter(([k,v]) => !v && (k!=="partner_name" || form.role==="finance_mpx"))
      .map(([k]) => k);
    if (empty.length) { setErrors(empty); setErrMsg("Harap lengkapi semua kolom."); return; }
    if (!Object.values(pass).every(Boolean)) { setErrMsg("Syarat kata sandi belum terpenuhi."); return; }
    setLoading(true);
    try {
      const email = form.email.trim().toLowerCase();
      const { password, full_name, username, role, access_code, partner_name } = form;
      if (exists.email)    { setErrMsg("Email sudah terdaftar.");    setLoading(false); return; }
      if (exists.username) { setErrMsg("Username sudah terdaftar."); setLoading(false); return; }
      const { data: dupEmail } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
      if (dupEmail) { setErrMsg("Email sudah terdaftar."); return; }
      const { data: dupUsername } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
      if (dupUsername) { setErrMsg("Username sudah terdaftar."); return; }
      const { data: code } = await supabase.from("access_codes").select("id")
        .eq("code", access_code.toUpperCase()).eq("type", role).eq("is_active", true).maybeSingle();
      if (!code) { setErrMsg("Kode otoritas tidak valid."); return; }
      const otp = generateOTP();
      const { error: otpErr } = await supabase.from("email_otps").insert({
        email, otp:String(otp), expires_at:new Date(Date.now()+600_000).toISOString(), verified:false,
      });
      if (otpErr) throw otpErr;
      const res = await sendOTPEmail(email, otp);
      if (!res.success) throw new Error(res.error);
      sessionStorage.setItem("pending_reg", JSON.stringify({
        email, password, full_name, username, role, partner_name,
        access_code:access_code.toUpperCase(),
      }));
      router.push(`/verify?email=${email}`);
    } catch(e) { setErrMsg(e.message || "Gagal memproses pendaftaran."); }
    finally    { setLoading(false); }
  };

  const lbl = { display:"block", marginBottom:7, paddingLeft:1,
    fontSize:10.5, fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase", color:t.lo };

  return (
    <div style={{
      minHeight:"100svh", position:"relative", overflow:"hidden", color:t.hi,
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

      {/* Scroll container */}
      <div style={{ padding:"32px 16px 52px", display:"flex", flexDirection:"column", alignItems:"center", position:"relative", zIndex:1 }}>
        <motion.div
          initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
          transition={{ duration:0.40, ease:[0.22,1,0.36,1] }}
          style={{ width:"100%", maxWidth:500 }}
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
              {/* Header */}
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:24 }}>
                <div>
                  <div style={{ fontSize:21, fontWeight:800, letterSpacing:"-0.03em", color:t.hi }}>Daftar Akun</div>
                  <div style={{ marginTop:4, fontSize:13, color:t.mid }}>Buat akun SandraHub baru</div>
                </div>
                <button className="sh-btn" onClick={() => router.push("/login")}
                  style={{
                    display:"flex", alignItems:"center", gap:4,
                    fontSize:12, fontWeight:700,
                    background: d?"rgba(237,28,36,0.10)":"rgba(237,28,36,0.07)",
                    border:`1px solid rgba(237,28,36,${d?0.26:0.18})`,
                    color:"#ED1C24",
                    borderRadius:9, padding:"6px 11px",
                  }}>
                  <ChevronLeft size={13} strokeWidth={2.5}/>Masuk
                </button>
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

              {/* Form grid */}
              <div className="reg-grid" style={{
                display:"grid",
                gridTemplateColumns:"repeat(2, minmax(0,1fr))",
                gap:"16px 14px",
              }}>
                {/* Nama Lengkap */}
                <div>
                  <label style={lbl}>Nama Lengkap</label>
                  <Field icon={<User size={15} strokeWidth={2}/>} hasError={errors.includes("full_name")} t={t} d={d}>
                    <TInput placeholder="Nama lengkap" value={form.full_name} onChange={v => up("full_name", v)} t={t}/>
                  </Field>
                </div>

                {/* Username */}
                <div>
                  <label style={lbl}>Username</label>
                  <Field icon={<User size={15} strokeWidth={2}/>}
                    hasError={errors.includes("username")||exists.username}
                    trailing={checking.username && <Loader2 size={13} className="sh-spin" style={{ color:"#ED1C24", flexShrink:0 }}/>}
                    t={t} d={d}>
                    <TInput placeholder="tanpa spasi" value={form.username}
                      onChange={v => { up("username", v.toLowerCase().replace(/\s+/g,"")); setExists(p=>({...p,username:false})); }}
                      onBlur={() => checkAvail("username", form.username)} t={t}/>
                  </Field>
                  {exists.username && (
                    <div style={{ marginTop:5, paddingLeft:2, fontSize:11, fontWeight:600, color:t.errRed }}>
                      Username sudah digunakan
                    </div>
                  )}
                </div>

                {/* Email — full width */}
                <div style={{ gridColumn:"1 / -1" }}>
                  <label style={lbl}>Alamat Email</label>
                  <Field icon={<Mail size={15} strokeWidth={2}/>}
                    hasError={errors.includes("email")||exists.email}
                    trailing={checking.email && <Loader2 size={13} className="sh-spin" style={{ color:"#ED1C24", flexShrink:0 }}/>}
                    t={t} d={d}>
                    <TInput type="email" placeholder="nama@gmail.com" value={form.email}
                      onChange={v => { up("email", v); setExists(p=>({...p,email:false})); }}
                      onBlur={() => checkAvail("email", form.email)} t={t}/>
                  </Field>
                  {exists.email && (
                    <div style={{ marginTop:5, display:"flex", alignItems:"center", justifyContent:"space-between", paddingLeft:2 }}>
                      <span style={{ fontSize:11, fontWeight:600, color:t.errRed }}>Email sudah terdaftar</span>
                      <button className="sh-btn" onClick={() => router.push("/login")}
                        style={{ fontSize:11, fontWeight:700, color:"#ED1C24",
                          background:"none", border:"none", padding:0, cursor:"pointer" }}>
                        Login sekarang →
                      </button>
                    </div>
                  )}
                </div>

                {/* Role — full width */}
                <div style={{ gridColumn:"1 / -1" }}>
                  <label style={lbl}>Role Pengguna</label>
                  <Field icon={<Shield size={15} strokeWidth={2}/>} hasError={false} t={t} d={d}>
                    <TSelect value={form.role} onChange={v => { up("role",v); up("partner_name",""); }} t={t}>
                      <option value="spm_sumatera">SPM Sumatera</option>
                      <option value="finance_mpx">Finance MPX</option>
                    </TSelect>
                  </Field>
                </div>

                {/* Partner — conditional */}
                <AnimatePresence>
                  {form.role === "finance_mpx" && (
                    <motion.div key="partner"
                      initial={{ opacity:0, height:0 }}
                      animate={{ opacity:1, height:"auto" }}
                      exit={{ opacity:0, height:0 }}
                      style={{ gridColumn:"1 / -1", overflow:"hidden" }}>
                      <div>
                        <label style={lbl}>Nama Partner</label>
                        <Field icon={<Building2 size={15} strokeWidth={2}/>} hasError={errors.includes("partner_name")} t={t} d={d}>
                          <TSelect value={form.partner_name} onChange={v => up("partner_name",v)} t={t}>
                            <option value="" disabled>{loadingP?"Memuat...":"— Pilih Partner —"}</option>
                            {partnersList.map(p => <option key={p} value={p}>{p}</option>)}
                          </TSelect>
                        </Field>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Kode Otoritas — full width */}
                <div style={{ gridColumn:"1 / -1" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:7 }}>
                    <label style={{ ...lbl, marginBottom:0 }}>Kode Otoritas</label>
                    <button ref={infoBtnRef} className="sh-btn"
                      onClick={() => setShowInfo(s => !s)}
                      style={{ background:"none", border:"none", padding:0, display:"flex",
                        color: showInfo ? "#32BCAD" : t.lo, cursor:"pointer" }}>
                      <Info size={12} strokeWidth={2}/>
                    </button>
                  </div>
                  <AnimatePresence>
                    {showInfo && (
                      <motion.div ref={infoRef}
                        initial={{ opacity:0, y:-5 }} animate={{ opacity:1, y:0 }}
                        exit={{ opacity:0, y:-5 }} transition={{ duration:0.15 }}
                        style={{
                          marginBottom:10, padding:"10px 14px", borderRadius:11,
                          background:t.infoBg, border:`1px solid ${t.infoBd}`,
                          fontSize:12.5, color:t.mid, lineHeight:1.6,
                        }}>
                        <strong style={{ color:t.hi }}>Kode Otoritas</strong> adalah kunci akses yang dipersonalisasi.
                        Dapatkan melalui tim <strong style={{ color:t.hi }}>SPM Sumatera</strong>.
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <Field icon={<Shield size={15} strokeWidth={2}/>} hasError={errors.includes("access_code")} t={t} d={d}>
                    <TInput placeholder="Masukkan kode" value={form.access_code}
                      onChange={v => up("access_code", v.toUpperCase())} t={t}/>
                  </Field>
                </div>

                {/* Password + Konfirmasi */}
                <div>
                  <label style={lbl}>Kata Sandi</label>
                  <Field icon={<Lock size={15} strokeWidth={2}/>} hasError={errors.includes("password")} t={t} d={d}>
                    <TInput type="password" placeholder="Min. 8 karakter" value={form.password} onChange={v => up("password",v)} t={t}/>
                  </Field>
                </div>
                <div>
                  <label style={lbl}>Konfirmasi</label>
                  <Field icon={<LockKeyhole size={15} strokeWidth={2}/>} hasError={errors.includes("confirm_password")} t={t} d={d}>
                    <TInput type="password" placeholder="Ulangi sandi" value={form.confirm_password} onChange={v => up("confirm_password",v)} t={t}/>
                  </Field>
                </div>
              </div>

              {/* Password checklist */}
              <div style={{
                marginTop:16, padding:"14px 16px", borderRadius:13,
                background:t.sub, border:`1px solid ${t.line}`,
                display:"grid", gridTemplateColumns:"1fr 1fr", gap:"9px 20px",
              }}>
                <CheckItem label="Minimal 8 karakter"  ok={pass.length}  t={t}/>
                <CheckItem label="Angka atau simbol"   ok={pass.symbol}  t={t}/>
                <CheckItem label="Huruf kapital (A-Z)" ok={pass.capital} t={t}/>
                <CheckItem label="Konfirmasi cocok"    ok={pass.match}   t={t}/>
              </div>

              {/* CTA */}
              <button className="sh-btn" onClick={handleRegister} disabled={loading}
                style={{
                  marginTop:20, width:"100%", height:50, borderRadius:13, border:"none",
                  background: loading
                    ? (d?"rgba(237,28,36,0.45)":"rgba(237,28,36,0.35)")
                    : "linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)",
                  color:"#fff", fontSize:13.5, fontWeight:700, letterSpacing:"0.01em",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                  boxShadow: loading?"none":"0 4px 18px rgba(237,28,36,0.40)",
                  cursor: loading?"not-allowed":"pointer",
                }}>
                {loading
                  ? <Loader2 size={18} className="sh-spin"/>
                  : <><Send size={14} strokeWidth={2.2}/><span>Verifikasi Email</span></>
                }
              </button>
            </div>

            {/* Footer */}
            <div style={{
              padding:"14px 28px", borderTop:`1px solid ${t.line}`,
              background: d?"rgba(237,28,36,0.045)":"rgba(237,28,36,0.028)",
              display:"flex", alignItems:"center", justifyContent:"center", gap:6,
            }}>
              <span style={{ fontSize:13, color:t.mid }}>Sudah terdaftar?</span>
              <button className="sh-btn" onClick={() => router.push("/login")}
                style={{
                  fontSize:13, fontWeight:700, border:"none", padding:0, cursor:"pointer",
                  background:"linear-gradient(90deg,#ED1C24,#C6168D)",
                  WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
                }}>Masuk sekarang</button>
            </div>
          </div>

          <div style={{ marginTop:22, textAlign:"center", fontSize:10, fontWeight:600,
            letterSpacing:"0.12em", textTransform:"uppercase", color:t.lo, opacity:0.36 }}>
            © 2026 SandraHub · SPM Sumatera
          </div>
        </motion.div>
      </div>
    </div>
  );
}