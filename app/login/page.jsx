"use client";
import { useState, useEffect } from "react";
import supabase from "../../lib/supabase";
import { Box, Mail, Lock, ArrowRight, Loader2, Sun, Moon, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

// ─── Design Tokens — Indosat Ooredoo Hutchison ───────────────────────────────
const mk = (d) => ({
  bg:      d ? "#0D0D0E"                       : "#F0F0F3",
  card:    d ? "rgba(22,22,26,0.82)"           : "rgba(255,255,255,0.86)",
  line:    d ? "rgba(255,255,255,0.10)"        : "rgba(0,0,0,0.10)",
  hi:      d ? "#F2F2F4"                       : "#111113",
  mid:     d ? "#8A8A9A"                       : "#4A4A58",
  lo:      d ? "#4A4A5A"                       : "#9A9AAA",
  red:     "#ED1C24",
  redBg:   d ? "rgba(237,28,36,0.12)"          : "rgba(237,28,36,0.07)",
  redBd:   d ? "rgba(237,28,36,0.28)"          : "rgba(237,28,36,0.18)",
  errRed:  d ? "#FF7070"                       : "#C01018",
  shadow:  d ? "0 28px 72px rgba(0,0,0,0.72)" : "0 28px 72px rgba(0,0,0,0.13)",
});

// ─── Animated gradient background ────────────────────────────────────────────
const BgMesh = ({ d }) => (
  <div style={{ position:"fixed", inset:0, zIndex:0, overflow:"hidden", pointerEvents:"none" }}>
    <div className="orb orb-red"   style={{ top:"-18%",  left:"-12%",  width:"58vw", height:"58vw",
      background: d ? "radial-gradient(circle,rgba(237,28,36,0.30) 0%,transparent 68%)" : "radial-gradient(circle,rgba(237,28,36,0.18) 0%,transparent 68%)" }}/>
    <div className="orb orb-magenta" style={{ bottom:"-22%", right:"-16%", width:"64vw", height:"64vw",
      background: d ? "radial-gradient(circle,rgba(198,22,141,0.26) 0%,transparent 68%)" : "radial-gradient(circle,rgba(198,22,141,0.15) 0%,transparent 68%)" }}/>
    <div className="orb orb-teal"  style={{ top:"32%",   right:"-6%",  width:"46vw", height:"46vw",
      background: d ? "radial-gradient(circle,rgba(50,188,173,0.22) 0%,transparent 68%)" : "radial-gradient(circle,rgba(50,188,173,0.14) 0%,transparent 68%)" }}/>
    <div className="orb orb-yellow" style={{ bottom:"16%", left:"1%",   width:"32vw", height:"32vw",
      background: d ? "radial-gradient(circle,rgba(255,203,5,0.13) 0%,transparent 68%)" : "radial-gradient(circle,rgba(255,203,5,0.09) 0%,transparent 68%)" }}/>
    {/* vignette */}
    <div style={{ position:"absolute", inset:0,
      background: d
        ? "radial-gradient(ellipse at 50% 45%,transparent 25%,rgba(13,13,14,0.72) 100%)"
        : "radial-gradient(ellipse at 50% 45%,transparent 25%,rgba(240,240,243,0.66) 100%)" }}/>
    {/* grain */}
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
    html{-webkit-text-size-adjust:100%}
    body{margin:0;overflow-x:hidden}
    input,select,textarea{font-size:15px!important;font-family:'DM Sans',sans-serif!important}
    input::placeholder{color:${d?"rgba(138,138,154,0.60)":"rgba(154,154,170,0.80)"};font-weight:400}
    ::-webkit-scrollbar{width:4px}
    ::-webkit-scrollbar-thumb{background:${d?"rgba(255,255,255,0.10)":"rgba(0,0,0,0.12)"};border-radius:99px}

    @keyframes orb-a{0%,100%{transform:translate(0,0) scale(1)}35%{transform:translate(55px,-38px) scale(1.07)}68%{transform:translate(-28px,48px) scale(0.94)}}
    @keyframes orb-b{0%,100%{transform:translate(0,0) scale(1)}42%{transform:translate(-65px,28px) scale(1.06)}72%{transform:translate(36px,-55px) scale(0.93)}}
    @keyframes orb-c{0%,100%{transform:translate(0,0) scale(1)}52%{transform:translate(44px,42px) scale(1.09)}}
    @keyframes grain{0%,100%{transform:translate(0,0)}20%{transform:translate(2%,2%)}40%{transform:translate(-2%,3%)}60%{transform:translate(3%,-2%)}80%{transform:translate(-1%,2%)}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes load-sweep{0%{left:-45%;width:42%}50%{left:28%;width:58%}100%{left:110%;width:42%}}
    @keyframes pulse-ring{0%,100%{transform:scale(1);opacity:0.7}50%{transform:scale(1.18);opacity:0}}

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
    .sh-field  {transition:border-color 0.15s,box-shadow 0.15s}
    .sh-field:focus-within{border-color:#ED1C24!important;box-shadow:0 0 0 3px rgba(237,28,36,0.15)!important}
    .sh-field-err{border-color:rgba(237,28,36,0.60)!important;box-shadow:0 0 0 3px rgba(237,28,36,0.12)!important}
    .sh-field-err:focus-within{border-color:rgba(237,28,36,0.80)!important;box-shadow:0 0 0 3px rgba(237,28,36,0.18)!important}
    /* ── Suppress ALL browser-native password reveal icons ── */
    input[type="password"]::-ms-reveal,
    input[type="password"]::-ms-clear { display: none !important; }
    input[type="password"]::-webkit-contacts-auto-fill-button,
    input[type="password"]::-webkit-credentials-auto-fill-button { display: none !important; visibility: hidden !important; pointer-events: none !important; }
    /* Chrome/Edge native eye */
    input::-webkit-textfield-decoration-container { display: none !important; }
    input[type="search"]::-webkit-search-decoration,
    input[type="search"]::-webkit-search-cancel-button { -webkit-appearance: none !important; appearance: none !important; }
    @media(max-width:480px){input,select,textarea{font-size:16px!important}}
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

// ─── Field ────────────────────────────────────────────────────────────────────
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
          background: d ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.038)",
          border:`1.5px solid ${hasError?"rgba(237,28,36,0.55)":t.line}`,
          minWidth:0,
        }}>
        <span style={{ color:hasError?"#ED1C24":t.lo, flexShrink:0, display:"flex" }}>{icon}</span>
        {children}
        {trailing}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [form,    setForm]    = useState({ email:"", password:"" });
  const [errors,  setErrors]  = useState([]);
  const [errMsg,  setErrMsg]  = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw,  setShowPw]  = useState(false);
  const [d,       setD]       = useState(true);

  useEffect(() => {
    const v = localStorage.getItem("sh-theme");
    setD(v ? v === "dark" : true);
  }, []);

  const t = mk(d);

  const update = (key, val) => {
    setForm(f => ({ ...f, [key]:val }));
    setErrors(e => e.filter(x => x !== key));
    setErrMsg("");
  };

  const handleLogin = async () => {
    setErrMsg(""); setErrors([]);
    const empty = ["email","password"].filter(k => !form[k]);
    if (empty.length) { setErrors(empty); setErrMsg("Harap isi email dan kata sandi."); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      if (error) {
        setErrors(["email","password"]);
        setErrMsg(error.message.includes("Invalid login") ? "Email atau kata sandi tidak sesuai." : error.message);
        return;
      }
      router.refresh(); router.push("/dashboard");
    } catch { setErrMsg("Terjadi gangguan pada sistem."); }
    finally  { setLoading(false); }
  };

  return (
    <div style={{
      minHeight:"100svh", position:"relative", overflow:"hidden",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:"24px 16px",
      fontFamily:"'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif",
      WebkitFontSmoothing:"antialiased", color:t.hi,
      background: d ? "#0D0D0E" : "#F0F0F3",
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
          background: d ? "rgba(22,22,26,0.72)" : "rgba(255,255,255,0.72)",
          backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)",
          display:"flex", alignItems:"center", justifyContent:"center", color:t.mid,
        }}>
        {d ? <Sun size={16} strokeWidth={2}/> : <Moon size={16} strokeWidth={2}/>}
      </button>

      <motion.div
        initial={{ opacity:0, y:22, scale:0.975 }}
        animate={{ opacity:1, y:0,  scale:1 }}
        transition={{ duration:0.42, ease:[0.22,1,0.36,1] }}
        style={{ width:"100%", maxWidth:400, position:"relative", zIndex:1 }}
      >
        {/* Logo */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:13, marginBottom:30 }}>
          <div style={{
            width:66, height:66, borderRadius:20,
            background:"linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)",
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:`0 8px 28px rgba(237,28,36,${d?0.52:0.36}),0 0 0 5px rgba(237,28,36,${d?0.11:0.07})`,
          }}>
            <Box size={30} strokeWidth={2.2} color="#fff"/>
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:31, fontWeight:800, letterSpacing:"-0.045em", lineHeight:1, color:t.hi }}>
              Sandra
              <span style={{
                background:"linear-gradient(90deg,#ED1C24,#C6168D)",
                WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
              }}>Hub</span>
            </div>
            <div style={{ marginTop:6, fontSize:9.5, fontWeight:700, letterSpacing:"0.38em",
              textTransform:"uppercase", color:t.lo }}>SPM Sumatera</div>
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

          <div style={{ padding:"28px 28px 22px" }}>
            <div style={{ marginBottom:22 }}>
              <div style={{ fontSize:21, fontWeight:800, letterSpacing:"-0.03em", color:t.hi }}>Masuk</div>
              <div style={{ marginTop:4, fontSize:13, color:t.mid }}>ke akun SandraHub Anda</div>
            </div>

            {/* Error banner */}
            <AnimatePresence>
              {errMsg && (
                <motion.div key="err"
                  initial={{ opacity:0, height:0, marginBottom:0 }}
                  animate={{ opacity:1, height:"auto", marginBottom:16 }}
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

            {/* Fields */}
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <Field label="Email" icon={<Mail size={15} strokeWidth={2}/>}
                hasError={errors.includes("email")} t={t} d={d}>
                <input type="email" placeholder="nama@gmail.com" value={form.email}
                  onChange={e => update("email", e.target.value)}
                  onKeyDown={e => e.key==="Enter" && handleLogin()}
                  style={{ flex:1, minWidth:0, height:"100%", background:"transparent",
                    border:"none", outline:"none", fontSize:14, fontWeight:500, color:t.hi, fontFamily:"inherit" }}/>
              </Field>

              {/* Password — SINGLE eye toggle */}
              <Field label="Kata Sandi" icon={<Lock size={15} strokeWidth={2}/>}
                hasError={errors.includes("password")} t={t} d={d}
                trailing={
                  <button type="button" onClick={() => setShowPw(p => !p)}
                    style={{ background:"none", border:"none", cursor:"pointer",
                      color:t.lo, display:"flex", alignItems:"center",
                      padding:"0 2px", flexShrink:0, lineHeight:1 }}>
                    {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
                  </button>
                }>
                <input type={showPw?"text":"password"} placeholder="Kata sandi" value={form.password}
                  onChange={e => update("password", e.target.value)}
                  onKeyDown={e => e.key==="Enter" && handleLogin()}
                  style={{
                    flex:1, minWidth:0, height:"100%", background:"transparent",
                    border:"none", outline:"none", fontSize:14, fontWeight:500, color:t.hi, fontFamily:"inherit",
                    /* kill Edge/IE reveal */ msReveal:"none",
                    WebkitAppearance:"none", appearance:"none",
                  }}/>
              </Field>
            </div>

            {/* CTA */}
            <button className="sh-btn" onClick={handleLogin} disabled={loading}
              style={{
                marginTop:20, width:"100%", height:50, borderRadius:13, border:"none",
                background: loading
                  ? (d?"rgba(237,28,36,0.45)":"rgba(237,28,36,0.35)")
                  : "linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)",
                color:"#fff", fontSize:13.5, fontWeight:700, letterSpacing:"0.01em",
                display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                boxShadow: loading ? "none" : "0 4px 18px rgba(237,28,36,0.40)",
                cursor: loading ? "not-allowed" : "pointer",
                transition:"background 0.18s,box-shadow 0.18s",
              }}>
              {loading
                ? <Loader2 size={18} className="sh-spin"/>
                : <><span>Masuk ke Sistem</span><ArrowRight size={15} strokeWidth={2.5}/></>
              }
            </button>
          </div>

          {/* Footer */}
          <div style={{
            padding:"14px 28px",
            borderTop:`1px solid ${t.line}`,
            background: d ? "rgba(237,28,36,0.045)" : "rgba(237,28,36,0.028)",
            display:"flex", alignItems:"center", justifyContent:"center", gap:6,
          }}>
            <span style={{ fontSize:13, color:t.mid }}>Belum punya akun?</span>
            <button className="sh-btn" onClick={() => router.push("/register")}
              style={{
                fontSize:13, fontWeight:700, border:"none", padding:0, cursor:"pointer",
                background:"linear-gradient(90deg,#ED1C24,#C6168D)",
                WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
              }}>Daftar sekarang</button>
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