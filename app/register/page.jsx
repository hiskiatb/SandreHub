"use client";
import { useState, useEffect, useRef } from "react";
import supabase from "../../lib/supabase";
import { Mail, Lock, LockKeyhole, User, Shield, Building2, Info, CheckCircle2, XCircle, AlertCircle, ChevronLeft, Send, Loader2, Sun, Moon, Box } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { generateOTP } from "../../lib/email/otp";
import { sendOTPEmail } from "../../lib/email/sendOTP";

const B = { red: "#ED1C24", yellow: "#FFCB05", teal: "#32BCAD", magenta: "#C6168D" };

const mk = (d) => ({
  bg:      d ? "#0D0D0E" : "#F5F5F6",
  card:    d ? "#1A1A1D" : "#FFFFFF",
  sub:     d ? "#202024" : "#F2F2F4",
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
  amber:   d ? "#FFCB05" : "#C49A00",
  amberBg: d ? "rgba(255,203,5,0.12)"  : "rgba(255,203,5,0.09)",
  amberBd: d ? "rgba(255,203,5,0.28)"  : "rgba(255,203,5,0.22)",
  card$:   d ? "0 24px 60px rgba(0,0,0,0.65)" : "0 24px 60px rgba(26,26,29,0.16)",
});

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI","SF Pro Text",Roboto,system-ui,sans-serif`;

// ─── Role definitions ─────────────────────────────────────────────────────────
// internal_ioh = same view as spm_sumatera but read-only on forms & payout upload
const ROLES = [
  { value: "spm_sumatera", label: "SPM Sumatera",   desc: "Akses penuh semua fitur" },
  { value: "finance_mpx",  label: "Finance MPX",    desc: "Akses laporan partner sendiri" },
  { value: "internal_ioh", label: "Internal IOH",   desc: "Akses lihat semua, tanpa edit" },
];

// Roles that require partner_name
const NEEDS_PARTNER = ["finance_mpx"];
// Roles that require access_code to match a specific partner_name in DB
const CODE_PER_PARTNER = ["finance_mpx"];

function SandraHubLogo({ d }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "#FFFFFF", boxShadow: "0 8px 24px rgba(237,28,36,0.30)" }}>
        <Box size={26} strokeWidth={2.2} />
      </div>
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
    input, select, textarea { font-family: "DM Sans", sans-serif !important; font-size: 14px !important }
    input::placeholder, textarea::placeholder { font-weight: 400; opacity: 0.45 }
    select { -webkit-appearance: none; appearance: none }
    select option { background: ${d ? "#1A1A1D" : "#fff"}; color: ${d ? "#F2F2F3" : "#1A1A1D"} }
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
    @media (max-width: 540px) { .reg-grid { grid-template-columns: 1fr !important } input, select, textarea { font-size: 16px !important } }
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
function TInput({ type = "text", placeholder, value, onChange, onBlur, t }) {
  return <input type={type} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} style={{ flex: 1, minWidth: 0, height: "100%", background: "transparent", border: "none", outline: "none", fontSize: 14, fontWeight: 500, color: t.hi, fontFamily: FONT }} />;
}
function TSelect({ value, onChange, children, t }) {
  return <select value={value} onChange={e => onChange(e.target.value)} style={{ flex: 1, minWidth: 0, height: "100%", background: "transparent", border: "none", outline: "none", fontSize: 14, fontWeight: 500, color: t.hi, fontFamily: FONT, cursor: "pointer" }}>{children}</select>;
}
function CheckItem({ label, ok, t }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      {ok ? <CheckCircle2 size={13} strokeWidth={2.5} style={{ color: t.teal, flexShrink: 0 }} /> : <XCircle size={13} strokeWidth={2} style={{ color: t.lo, flexShrink: 0 }} />}
      <span style={{ fontSize: 12, fontWeight: 500, color: ok ? t.teal : t.lo }}>{label}</span>
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const infoRef = useRef(null), infoBtnRef = useRef(null);
  const [form, setForm] = useState({
    email: "", password: "", confirm_password: "",
    full_name: "", username: "",
    role: "spm_sumatera", access_code: "", partner_name: "",
  });
  const [partnersList, setPartnersList] = useState([]);
  const [loadingP, setLoadingP]   = useState(false);
  const [errMsg, setErrMsg]       = useState("");
  const [errors, setErrors]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [d, setD]                 = useState(true);
  const [showInfo, setShowInfo]   = useState(false);
  const [checking, setChecking]   = useState({ email: false, username: false });
  const [exists, setExists]       = useState({ email: false, username: false });

  useEffect(() => {
    setD(localStorage.getItem("sh-theme") !== "light");
    const raw = sessionStorage.getItem("pending_reg");
    if (raw) {
      const p = JSON.parse(raw);
      setForm(f => ({
        ...f,
        email: p.email || "", full_name: p.full_name || "",
        username: p.username || "", role: p.role || "spm_sumatera",
        access_code: p.access_code || "", partner_name: p.partner_name || "",
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
      if (infoRef.current && !infoRef.current.contains(e.target)
        && infoBtnRef.current && !infoBtnRef.current.contains(e.target))
        setShowInfo(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const t = mk(d);
  const up = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => e.filter(x => x !== k)); setErrMsg(""); };
  const debounceRef = useRef({});

  const checkAvail = (field, value) => {
    if (!value) return;
    if (debounceRef.current[field]) clearTimeout(debounceRef.current[field]);
    setChecking(p => ({ ...p, [field]: true }));
    debounceRef.current[field] = setTimeout(async () => {
      const { data, error } = await supabase.rpc("check_user_exists", { p_field: field, p_value: value.toLowerCase().trim() });
      if (!error) setExists(p => ({ ...p, [field]: data }));
      setChecking(p => ({ ...p, [field]: false }));
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

    // Required field check — partner_name only required for finance_mpx
    const needsPartner = NEEDS_PARTNER.includes(form.role);
    const empty = Object.entries(form)
      .filter(([k, v]) => !v && (k !== "partner_name" || needsPartner))
      .map(([k]) => k);
    if (empty.length) { setErrors(empty); setErrMsg("Harap lengkapi semua kolom."); return; }
    if (!Object.values(pass).every(Boolean)) { setErrMsg("Syarat kata sandi belum terpenuhi."); return; }

    setLoading(true);
    try {
      const email        = form.email.trim().toLowerCase();
      const { password, full_name, username, role, access_code, partner_name } = form;
      const codeUpper    = access_code.toUpperCase();

      // Duplicate checks
      if (exists.email)    { setErrMsg("Email sudah terdaftar.");    setLoading(false); return; }
      if (exists.username) { setErrMsg("Username sudah terdaftar."); setLoading(false); return; }
      const { data: dupEmail } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
      if (dupEmail) { setErrMsg("Email sudah terdaftar."); return; }
      const { data: dupUsr } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
      if (dupUsr) { setErrMsg("Username sudah terdaftar."); return; }

      // ── Access code validation ───────────────────────────────────────────
      // Build query: always match code + type + is_active
      let codeQuery = supabase
        .from("access_codes")
        .select("id, partner_name")
        .eq("code", codeUpper)
        .eq("type", role)
        .eq("is_active", true);

      // FIX: for finance_mpx the code must also belong to the selected partner.
      // Without this check, any valid finance_mpx code (even from another partner)
      // would pass, letting the user register under the wrong partner.
      if (CODE_PER_PARTNER.includes(role)) {
        codeQuery = codeQuery.eq("partner_name", partner_name);
      }

      const { data: codeRow } = await codeQuery.maybeSingle();

      if (!codeRow) {
        // Give a specific message for finance_mpx so the user understands
        // the code must match their chosen partner — not just the role type.
        setErrMsg(
          role === "finance_mpx"
            ? "Kode otoritas tidak valid untuk partner yang dipilih."
            : "Kode otoritas tidak valid."
        );
        return;
      }

      // Send OTP
      const otp = generateOTP();
      const { error: otpErr } = await supabase.from("email_otps").insert({
        email, otp: String(otp),
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        verified: false,
      });
      if (otpErr) throw otpErr;
      const res = await sendOTPEmail(email, otp);
      if (!res.success) throw new Error(res.error);

      sessionStorage.setItem("pending_reg", JSON.stringify({
        email, password, full_name, username, role,
        partner_name: needsPartner ? partner_name : "",
        access_code: codeUpper,
      }));
      router.push(`/verify?email=${email}`);
    } catch (e) { setErrMsg(e.message || "Gagal memproses pendaftaran."); }
    finally { setLoading(false); }
  };

  const needsPartner = NEEDS_PARTNER.includes(form.role);
  const selectedRole = ROLES.find(r => r.value === form.role);

  return (
    <div style={{ minHeight: "100svh", position: "relative", color: t.hi, fontFamily: FONT, WebkitFontSmoothing: "antialiased", background: t.bg }}>
      <GlobalCSS d={d} />
      <div className="sh-mesh"><div className="sh-mesh-o1"/><div className="sh-mesh-o2"/><div className="sh-mesh-o3"/><div className="sh-mesh-v"/></div>
      {loading && <LoadingBar />}

      <button className="sh-btn"
        onClick={() => { const n = !d; setD(n); localStorage.setItem("sh-theme", n ? "dark" : "light"); }}
        style={{ position: "fixed", top: 16, right: 16, zIndex: 50, width: 36, height: 36, borderRadius: 9, border: `1px solid ${t.line}`, background: d ? "rgba(22,22,24,0.88)" : "rgba(255,255,255,0.88)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", color: t.mid }}>
        {d ? <Sun size={15} strokeWidth={2} /> : <Moon size={15} strokeWidth={2} />}
      </button>

      <div style={{ padding: "32px 16px 52px", display: "flex", flexDirection: "column", alignItems: "center", position: "relative", zIndex: 1 }}>
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.988 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.48, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{ width: "100%", maxWidth: 490 }}
        >
          <div style={{ marginBottom: 26 }}><SandraHubLogo d={d} /></div>

          <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, boxShadow: t.card$, overflow: "hidden" }}>
            <div style={{ height: 2, background: "linear-gradient(90deg, #ED1C24 0%, #FFCB05 33%, #32BCAD 66%, #C6168D 100%)" }} />

            <div style={{ padding: "24px 22px 20px" }}>
              {/* Heading */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.025em", color: t.hi, lineHeight: 1.2 }}>Buat Akun Baru</div>
                  <div style={{ marginTop: 4, fontSize: 13, color: t.mid }}>Daftarkan akun SandraHub Anda</div>
                </div>
                <button className="sh-btn" onClick={() => router.push("/login")}
                  style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, background: t.tealBg, border: `1px solid ${t.tealBd}`, color: t.teal, borderRadius: 8, padding: "6px 11px", fontFamily: FONT }}>
                  <ChevronLeft size={12} strokeWidth={2.5} />Masuk
                </button>
              </div>

              {/* Error banner */}
              <AnimatePresence>
                {errMsg && (
                  <motion.div key="err"
                    initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                    animate={{ opacity: 1, height: "auto", marginBottom: 16 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ padding: "9px 13px", borderRadius: 10, background: t.redBg, border: `1px solid ${t.redBd}`, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, color: t.red, overflow: "hidden" }}>
                    <AlertCircle size={13} strokeWidth={2.2} style={{ flexShrink: 0 }} />{errMsg}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="reg-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px 11px" }}>

                {/* Nama Lengkap */}
                <div>
                  <Field label="Nama Lengkap" icon={<User size={14} strokeWidth={2} />} hasError={errors.includes("full_name")} t={t}>
                    <TInput placeholder="Nama lengkap" value={form.full_name} onChange={v => up("full_name", v)} t={t} />
                  </Field>
                </div>

                {/* Username */}
                <div>
                  <Field label="Username" icon={<User size={14} strokeWidth={2} />} hasError={errors.includes("username") || exists.username}
                    trailing={checking.username && <Loader2 size={12} style={{ color: B.teal, flexShrink: 0, animation: "sh-spin .85s linear infinite" }} />} t={t}>
                    <TInput placeholder="tanpa spasi" value={form.username}
                      onChange={v => { up("username", v.toLowerCase().replace(/\s+/g, "")); setExists(p => ({ ...p, username: false })); }}
                      onBlur={() => checkAvail("username", form.username)} t={t} />
                  </Field>
                  {exists.username && <div style={{ marginTop: 4, paddingLeft: 2, fontSize: 11, fontWeight: 600, color: t.red }}>Username sudah digunakan</div>}
                </div>

                {/* Email */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label="Alamat Email" icon={<Mail size={14} strokeWidth={2} />} hasError={errors.includes("email") || exists.email}
                    trailing={checking.email && <Loader2 size={12} style={{ color: B.teal, flexShrink: 0, animation: "sh-spin .85s linear infinite" }} />} t={t}>
                    <TInput type="email" placeholder="nama@email.com" value={form.email}
                      onChange={v => { up("email", v); setExists(p => ({ ...p, email: false })); }}
                      onBlur={() => checkAvail("email", form.email)} t={t} />
                  </Field>
                  {exists.email && (
                    <div style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: t.red }}>Email sudah terdaftar</span>
                      <button className="sh-btn" onClick={() => router.push("/login")} style={{ fontSize: 11, fontWeight: 700, color: B.teal, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: FONT }}>Login sekarang →</button>
                    </div>
                  )}
                </div>

                {/* Role — 3 pilihan termasuk Internal IOH */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label="Role Pengguna" icon={<Shield size={14} strokeWidth={2} />} hasError={false} t={t}>
                    <TSelect value={form.role} onChange={v => { up("role", v); up("partner_name", ""); }} t={t}>
                      {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </TSelect>
                  </Field>
                  {/* Role description badge */}
                  {selectedRole && (
                    <div style={{ marginTop: 6, paddingLeft: 2, fontSize: 11.5, color: t.lo }}>
                      <span style={{ fontWeight: 600, color: t.mid }}>{selectedRole.label}:</span> {selectedRole.desc}
                    </div>
                  )}
                </div>

                {/* Partner — hanya untuk finance_mpx */}
                <AnimatePresence>
                  {needsPartner && (
                    <motion.div key="partner"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{ gridColumn: "1 / -1", overflow: "hidden" }}>
                      <Field label="Nama Partner" icon={<Building2 size={14} strokeWidth={2} />} hasError={errors.includes("partner_name")} t={t}>
                        <TSelect value={form.partner_name} onChange={v => up("partner_name", v)} t={t}>
                          <option value="" disabled>{loadingP ? "Memuat..." : "— Pilih Partner —"}</option>
                          {partnersList.map(p => <option key={p} value={p}>{p}</option>)}
                        </TSelect>
                      </Field>
                      {/* Info: kode harus sesuai partner yang dipilih */}
                      <div style={{ marginTop: 6, paddingLeft: 2, fontSize: 11.5, color: t.lo }}>
                        Kode otoritas harus sesuai dengan partner yang dipilih.
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Kode Otoritas */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <label style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: t.lo }}>Kode Otoritas</label>
                    <button ref={infoBtnRef} className="sh-btn"
                      onClick={() => setShowInfo(s => !s)}
                      style={{ background: "none", border: "none", padding: 0, display: "flex", color: showInfo ? B.teal : t.lo, cursor: "pointer" }}>
                      <Info size={11} strokeWidth={2} />
                    </button>
                  </div>
                  <AnimatePresence>
                    {showInfo && (
                      <motion.div ref={infoRef}
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.16 }}
                        style={{ marginBottom: 9, padding: "9px 13px", borderRadius: 10, background: t.tealBg, border: `1px solid ${t.tealBd}`, fontSize: 12.5, color: t.mid, lineHeight: 1.6 }}>
                        <strong style={{ color: t.hi }}>Kode Otoritas</strong> bersifat unik per role & partner.
                        Dapatkan melalui tim <strong style={{ color: t.hi }}>SPM Sumatera</strong>.
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <Field icon={<Shield size={14} strokeWidth={2} />} hasError={errors.includes("access_code")} t={t}>
                    <TInput placeholder="Masukkan kode" value={form.access_code}
                      onChange={v => up("access_code", v.toUpperCase())} t={t} />
                  </Field>
                </div>

                {/* Password */}
                <div>
                  <Field label="Kata Sandi" icon={<Lock size={14} strokeWidth={2} />} hasError={errors.includes("password")} t={t}>
                    <TInput type="password" placeholder="Min. 8 karakter" value={form.password} onChange={v => up("password", v)} t={t} />
                  </Field>
                </div>
                <div>
                  <Field label="Konfirmasi" icon={<LockKeyhole size={14} strokeWidth={2} />} hasError={errors.includes("confirm_password")} t={t}>
                    <TInput type="password" placeholder="Ulangi sandi" value={form.confirm_password} onChange={v => up("confirm_password", v)} t={t} />
                  </Field>
                </div>
              </div>

              {/* Password requirements */}
              <div style={{ marginTop: 13, padding: "13px 15px", borderRadius: 10, background: t.sub, border: `1px solid ${t.line}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 18px" }}>
                <CheckItem label="Minimal 8 karakter" ok={pass.length}  t={t} />
                <CheckItem label="Angka atau simbol"   ok={pass.symbol}  t={t} />
                <CheckItem label="Huruf kapital (A–Z)" ok={pass.capital} t={t} />
                <CheckItem label="Konfirmasi cocok"    ok={pass.match}   t={t} />
              </div>

              {/* Submit */}
              <button className="sh-btn" onClick={handleRegister} disabled={loading}
                style={{ marginTop: 18, width: "100%", height: 46, borderRadius: 10, border: "none", background: loading ? `${B.magenta}55` : `linear-gradient(135deg, ${B.magenta} 0%, #9A1070 100%)`, color: "#fff", fontSize: 13.5, fontWeight: 700, letterSpacing: "-0.01em", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, boxShadow: loading ? "none" : "0 4px 18px rgba(198,22,141,0.28)", cursor: loading ? "not-allowed" : "pointer", transition: "background .18s, box-shadow .18s", fontFamily: FONT }}>
                {loading ? <Loader2 size={17} style={{ animation: "sh-spin .85s linear infinite" }} /> : <><Send size={13} strokeWidth={2.2} /><span>Verifikasi Email</span></>}
              </button>
            </div>

            {/* Footer */}
            <div style={{ padding: "12px 22px", borderTop: `1px solid ${t.line}`, background: d ? "rgba(255,255,255,0.018)" : "rgba(0,0,0,0.018)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <span style={{ fontSize: 13, color: t.mid }}>Sudah terdaftar?</span>
              <button className="sh-btn" onClick={() => router.push("/login")} style={{ fontSize: 13, fontWeight: 700, border: "none", padding: 0, cursor: "pointer", background: "none", color: B.teal, fontFamily: FONT }}>Masuk sekarang</button>
            </div>
          </div>

          <div style={{ marginTop: 22, textAlign: "center", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: t.lo, opacity: 0.35 }}>
            © 2026 SandraHub · SPM Sumatera
          </div>
        </motion.div>
      </div>
    </div>
  );
}