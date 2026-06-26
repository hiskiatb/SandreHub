"use client";
import { useState, useEffect, useRef } from "react";
import supabase from "../../../lib/supabase";
import {
  ChevronDown, Mail, Lock, LockKeyhole, User, Shield, Building2, Info,
  CheckCircle2, XCircle, AlertCircle, ChevronLeft, Send, ArrowLeft,
  Loader2, Sun, Moon, Users, MapPin, Hash, Search, X, Briefcase,
} from "lucide-react";
import { HubLogo } from "../../../components/HubLogo";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { generateOTP } from "../../../lib/email/otp";
import { sendOTPEmail } from "../../../lib/email/sendOTP";

const B = { red: "#ED1C24", yellow: "#FFCB05", teal: "#32BCAD", magenta: "#C6168D" };

const mk = (d) => ({
  bg:      d ? "#0A0A0B" : "#F4F4F6",
  card:    d ? "#1A1A1D" : "#FFFFFF",
  sub:     d ? "#202024" : "#F2F2F4",
  line:    d ? "#2A2A2F" : "#E2E2E6",
  lineS:   d ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
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
  amberBg: d ? "rgba(255,203,5,0.12)"   : "rgba(255,203,5,0.09)",
  amberBd: d ? "rgba(255,203,5,0.28)"   : "rgba(255,203,5,0.22)",
  blue:    d ? "#0A84FF" : "#0066CC",
  blueBg:  d ? "rgba(10,132,255,0.12)"  : "rgba(0,102,204,0.08)",
  blueBd:  d ? "rgba(10,132,255,0.28)"  : "rgba(0,102,204,0.20)",
  green:   d ? "#30D158" : "#1A9E5A",
  greenBg: d ? "rgba(48,209,88,0.12)"   : "rgba(26,158,90,0.08)",
  greenBd: d ? "rgba(48,209,88,0.28)"   : "rgba(26,158,90,0.22)",
  card$:   d ? "0 24px 60px rgba(0,0,0,0.65)" : "0 24px 60px rgba(26,26,29,0.16)",
});

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI","SF Pro Text",Roboto,system-ui,sans-serif`;

// ─── Role definitions ─────────────────────────────────────────────────────────
const ROLES = [
  {
    value: "spm_sumatera",
    label: "SPM Sumatera",
    desc: "Akses penuh semua fitur & modul",
    icon: Shield, color: "#C6168D",
  },
  {
    value: "finance_mpx",
    label: "Finance MPX",
    desc: "Akses laporan P&L partner sendiri",
    icon: Building2, color: "#32BCAD",
  },
  {
    value: "bsm",
    label: "Branch Sales Manager (BSM)",
    desc: "Kelola SDP di branch Anda sesuai brand yang ditugaskan",
    icon: Briefcase, color: "#32BCAD",
  },
  {
    value: "cse_rse",
    label: "Cluster / Rural Sales Executives (CSE/RSE)",
    desc: "Update & verifikasi data SDP di micro cluster Anda",
    icon: Users, color: "#0A84FF",
  },
  {
    value: "internal_ioh",
    label: "IOH All Sumatera",
    desc: "Akses lihat seluruh region Sumatera, tanpa edit",
    icon: Shield, color: "#FFCB05",
  },
  {
    value: "ioh_north_sumatera",
    label: "IOH North Sumatera",
    desc: "Akses lihat region North Sumatera",
    icon: Shield, color: "#FFCB05",
  },
  {
    value: "ioh_central_sumatera",
    label: "IOH Central Sumatera",
    desc: "Akses lihat region Central Sumatera",
    icon: Shield, color: "#FFCB05",
  },
  {
    value: "ioh_south_sumatera",
    label: "IOH South Sumatera",
    desc: "Akses lihat region South Sumatera",
    icon: Shield, color: "#FFCB05",
  },
];

const NEEDS_PARTNER  = ["finance_mpx"];
const NEEDS_CLUSTER  = [];               // CSE tidak perlu cluster saat daftar
const NEEDS_BSM      = ["bsm"];
const CODE_PER_PARTNER = ["finance_mpx"];
const NO_CODE_ROLES  = ["cse_rse"];      // role yang tidak butuh kode otoritas

const BSM_BRANDS = [
  { value: "3ID",    label: "3ID",    color: "#ED1C24" },
  { value: "IM3",    label: "IM3",    color: "#FFCB05" },
  { value: "Hybrid", label: "Hybrid", color: "#32BCAD" },
];

// ─── Components ───────────────────────────────────────────────────────────────
function SandraHubLogo({ d }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <HubLogo variant="sandra" size={52} shadow inBox />
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.1, color: d ? "#F2F2F3" : "#1A1A1D" }}>
          Sandra<span style={{ background: "linear-gradient(90deg,#ED1C24,#C6168D)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Hub</span>
        </div>
        <div style={{ marginTop: 3, fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: d ? "#8A8A96" : "#5A5A68" }}>S&D Sumatera</div>
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
    ::-webkit-scrollbar { width: 5px }
    ::-webkit-scrollbar-track { background: transparent }
    ::-webkit-scrollbar-thumb { background: ${d ? "#3A3A40" : "#C8C8D0"}; border-radius: 99px }
    @keyframes load-sweep { 0%{left:-45%;width:42%}50%{left:28%;width:58%}100%{left:110%;width:42%} }
    @keyframes sh-spin { to { transform: rotate(360deg) } }
    @keyframes mesh-1 { 0%,100%{transform:translate(0,0) scale(1)}35%{transform:translate(40px,-30px) scale(1.06)}68%{transform:translate(-20px,35px) scale(0.94)} }
    @keyframes mesh-2 { 0%,100%{transform:translate(0,0) scale(1)}42%{transform:translate(-50px,20px) scale(1.05)}72%{transform:translate(30px,-40px) scale(0.93)} }
    @keyframes mesh-3 { 0%,100%{transform:translate(0,0) scale(1)}52%{transform:translate(35px,30px) scale(1.08)} }
    .sh-mesh { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
    .sh-mesh-o1 { position: absolute; top: -20%; left: -10%; width: 60vw; height: 60vw; border-radius: 50%; background: radial-gradient(circle,rgba(237,28,36,0.08) 0%,transparent 70%); animation: mesh-1 18s ease-in-out infinite; filter: blur(2px); }
    .sh-mesh-o2 { position: absolute; bottom: -15%; right: -5%; width: 50vw; height: 50vw; border-radius: 50%; background: radial-gradient(circle,rgba(194,24,124,0.07) 0%,transparent 70%); animation: mesh-2 24s ease-in-out infinite; filter: blur(2px); }
    .sh-mesh-o3 { position: absolute; top: 35%; right: 15%; width: 35vw; height: 35vw; border-radius: 50%; background: radial-gradient(circle,rgba(50,188,173,0.05) 0%,transparent 70%); animation: mesh-3 28s ease-in-out infinite; filter: blur(2px); }
    .sh-mesh-v { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%,transparent 30%,${d ? "rgba(10,10,11,0.7)" : "rgba(244,244,246,0.6)"} 100%); }
    .sh-btn { transition: opacity .14s ease, transform .12s ease; cursor: pointer }
    .sh-btn:hover:not(:disabled) { opacity: .82 }
    .sh-btn:active:not(:disabled) { transform: scale(.97) }
    .sh-field { transition: border-color .16s, box-shadow .16s }
    .sh-field:focus-within { border-color: #32BCAD !important; box-shadow: 0 0 0 3px rgba(50,188,173,0.14) !important; }
    .sh-field-err { border-color: rgba(220,38,38,0.40) !important }
    .sh-field-err:focus-within { border-color: #DC2626 !important; box-shadow: 0 0 0 3px rgba(220,38,38,0.13) !important; }
    .sh-field-ok { border-color: rgba(48,209,88,0.40) !important }
    .sdp-drop { position: absolute; top: 100%; left: 0; right: 0; z-index: 80; margin-top: 4px; border-radius: 10px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.22); max-height: 220px; overflow-y: auto; }
    .sdp-opt { padding: 9px 13px; cursor: pointer; font-size: 13px; font-weight: 500; transition: background .1s; }
    .sdp-opt:hover { background: ${d ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.045)"}; }
    @media (max-width: 540px) { .reg-grid { grid-template-columns: 1fr !important } input, select, textarea { font-size: 16px !important } }
  `}</style>
);

const LoadingBar = () => (
  <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 2.5, zIndex: 200, overflow: "hidden", background: "rgba(237,28,36,0.10)" }}>
    <div style={{ position: "absolute", top: 0, height: "100%", borderRadius: 99, background: "linear-gradient(90deg,transparent,#ED1C24 35%,#FFCB05 55%,#32BCAD 75%,#C6168D,transparent)", animation: "load-sweep 1.6s cubic-bezier(0.4,0,0.2,1) infinite" }} />
  </div>
);

function Field({ label, icon, trailing, hasError, isOk, children, t }) {
  return (
    <div>
      {label && <label style={{ display: "block", marginBottom: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: t.lo }}>{label}</label>}
      <div className={`sh-field${hasError ? " sh-field-err" : isOk ? " sh-field-ok" : ""}`}
        style={{ display: "flex", alignItems: "center", gap: 10, height: 46, padding: "0 13px", borderRadius: 10, background: t.fieldBg, border: `1.5px solid ${hasError ? "rgba(220,38,38,0.40)" : t.line}` }}>
        <span style={{ color: hasError ? t.red : isOk ? t.green : t.lo, display: "flex", flexShrink: 0 }}>{icon}</span>
        {children}
        {trailing}
      </div>
    </div>
  );
}
function TInput({ type = "text", placeholder, value, onChange, onBlur, t, readOnly }) {
  return <input type={type} placeholder={placeholder} value={value} readOnly={readOnly}
    onChange={e => onChange(e.target.value)} onBlur={onBlur}
    style={{ flex: 1, minWidth: 0, height: "100%", background: "transparent", border: "none", outline: "none", fontSize: 14, fontWeight: 500, color: t.hi, fontFamily: FONT, cursor: readOnly ? "default" : "text" }} />;
}
function TSelect({ value, onChange, children, t }) {
  return <select value={value} onChange={e => onChange(e.target.value)}
    style={{ flex: 1, minWidth: 0, height: "100%", background: "transparent", border: "none", outline: "none", fontSize: 14, fontWeight: 500, color: t.hi, fontFamily: FONT, cursor: "pointer" }}>{children}</select>;
}
function CheckItem({ label, ok, t }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      {ok ? <CheckCircle2 size={13} strokeWidth={2.5} style={{ color: t.teal, flexShrink: 0 }} /> : <XCircle size={13} strokeWidth={2} style={{ color: t.lo, flexShrink: 0 }} />}
      <span style={{ fontSize: 12, fontWeight: 500, color: ok ? t.teal : t.lo }}>{label}</span>
    </div>
  );
}

// ── Role Groups (for <optgroup> in dropdown) ─────────────────────────────────
const ROLE_GROUPS = [
  {
    label: "Tim Internal",
    roles: ROLES.filter(r => ["spm_sumatera", "finance_mpx"].includes(r.value)),
  },
  {
    label: "IOH (Read-only)",
    roles: ROLES.filter(r => r.value === "internal_ioh" || r.value.startsWith("ioh_")),
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════
export default function RegisterPage() {
  const router = useRouter();
  const infoRef = useRef(null), infoBtnRef = useRef(null);

  const [form, setForm] = useState({
    email: "", password: "", confirm_password: "",
    full_name: "", username: "",
    role: "", access_code: "",
    partner_name: "",
    cluster: "",
    bsm_brand: "",
    bsm_branch: "",
  });

  const [partnersList,  setPartnersList]  = useState([]);
  const [clustersList,  setClustersList]  = useState([]);
  const [bsmBranchList, setBsmBranchList] = useState([]);
  const [loadingP,      setLoadingP]      = useState(false);
  const [loadingC,      setLoadingC]      = useState(false);
  const [loadingBB,     setLoadingBB]     = useState(false);
  const [errMsg,       setErrMsg]       = useState("");
  const [errors,       setErrors]       = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [d,            setD]            = useState(true);
  const [showInfo,     setShowInfo]     = useState(false);
  const [checking,     setChecking]     = useState({ email: false, username: false });
  const [exists,       setExists]       = useState({ email: false, username: false });

  useEffect(() => {
    setD(localStorage.getItem("sh-theme") !== "light");
    // Restore from sessionStorage
    const raw = sessionStorage.getItem("pending_reg");
    if (raw) {
      const p = JSON.parse(raw);
      setForm(f => ({
        ...f,
        email: p.email || "", full_name: p.full_name || "",
        username: p.username || "", role: p.role || "",
        access_code: p.access_code || "", partner_name: p.partner_name || "",
        cluster: p.cluster || "",
        bsm_brand: p.bsm_brand || "", bsm_branch: p.bsm_branch || "",
      }));
    }
    // Load partners
    (async () => {
      setLoadingP(true);
      const { data } = await supabase.from("partner_branches").select("partner_name");
      if (data) setPartnersList([...new Set(data.map(x => x.partner_name))].sort());
      setLoadingP(false);
    })();
    // Dismiss info popup on outside click
    const onClick = e => {
      if (infoRef.current && !infoRef.current.contains(e.target)
        && infoBtnRef.current && !infoBtnRef.current.contains(e.target))
        setShowInfo(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Load BSM branches when role = bsm
  useEffect(() => {
    if (form.role !== "bsm") return;
    (async () => {
      setLoadingBB(true);
      const { data } = await supabase
        .from("sdp_assignments")
        .select("branch, area")
        .eq("role", "bsm")
        .eq("is_active", true)
        .order("area").order("branch");
      if (data) {
        const unique = [...new Map(data.map(x => [x.branch, x])).values()];
        setBsmBranchList(unique);
      }
      setLoadingBB(false);
    })();
  }, [form.role]);

  // Load clusters when role = cse_rse
  useEffect(() => {
    if (form.role !== "cse_rse") return;
    (async () => {
      setLoadingC(true);
      const { data } = await supabase
        .from("sdp_data")
        .select("cluster_key, cluster, area, branch")
        .order("cluster_key");
      if (data) {
        const unique = [...new Map(data.map(d => [d.cluster_key || d.cluster, d])).values()];
        setClustersList(unique.sort((a, b) => (a.cluster_key || a.cluster).localeCompare(b.cluster_key || b.cluster)));
      }
      setLoadingC(false);
    })();
  }, [form.role]);

  const t = mk(d);
  const up = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => e.filter(x => x !== k));
    setErrMsg("");
  };

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

  const needsPartner = NEEDS_PARTNER.includes(form.role);
  const needsCluster = NEEDS_CLUSTER.includes(form.role);
  const needsBsm     = NEEDS_BSM.includes(form.role);

  const handleRegister = async () => {
    setErrMsg(""); setErrors([]);

    // ── Validasi role wajib dipilih ──────────────────────────────────────
    if (!form.role) {
      setErrMsg("Harap pilih role pengguna terlebih dahulu.");
      return;
    }

    // Validate required fields
    const noCode = NO_CODE_ROLES.includes(form.role);
    const requiredFields = ["email","password","confirm_password","full_name","username"];
    if (!noCode) requiredFields.push("access_code");
    if (needsPartner) requiredFields.push("partner_name");
    if (needsCluster) requiredFields.push("cluster");
    if (needsBsm)     { requiredFields.push("bsm_brand"); requiredFields.push("bsm_branch"); }

    const empty = requiredFields.filter(k => !form[k]);
    if (empty.length) { setErrors(empty); setErrMsg("Harap lengkapi semua kolom yang wajib diisi."); return; }
    if (!Object.values(pass).every(Boolean)) { setErrMsg("Syarat kata sandi belum terpenuhi."); return; }

    setLoading(true);
    try {
      const email      = form.email.trim().toLowerCase();
      const codeUpper  = form.access_code.toUpperCase();
      const { password, full_name, username, role, partner_name, cluster, bsm_brand, bsm_branch } = form;

      // Duplicate checks
      if (exists.email)    { setErrMsg("Email sudah terdaftar.");    setLoading(false); return; }
      if (exists.username) { setErrMsg("Username sudah terdaftar."); setLoading(false); return; }
      const { data: dupEmail } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
      if (dupEmail) { setErrMsg("Email sudah terdaftar."); return; }
      const { data: dupUsr } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
      if (dupUsr) { setErrMsg("Username sudah terdaftar."); return; }

      // ── Access code validation ──────────────────────────────────────────
      let assignmentId = null;

      if (!noCode) {
        if (needsBsm) {
          // BSM: validasi kode dari sdp_assignments (branch-scoped)
          const { data: asmRow } = await supabase
            .from("sdp_assignments")
            .select("id, is_registered")
            .eq("authority_code", codeUpper)
            .eq("role", "bsm")
            .eq("branch", bsm_branch)
            .eq("is_active", true)
            .maybeSingle();
          if (!asmRow) {
            setErrMsg("Kode otoritas BSM tidak valid untuk branch yang dipilih. Dapatkan dari SPM Sumatera.");
            return;
          }
          if (asmRow.is_registered) {
            setErrMsg("Kode ini sudah pernah digunakan. Hubungi SPM Sumatera.");
            return;
          }
          assignmentId = asmRow.id;
        } else {
          let codeQuery = supabase
            .from("access_codes")
            .select("id, partner_name")
            .eq("code", codeUpper)
            .eq("type", role)
            .eq("is_active", true);
          if (CODE_PER_PARTNER.includes(role)) {
            codeQuery = codeQuery.eq("partner_name", partner_name);
          }
          const { data: codeRow } = await codeQuery.maybeSingle();
          if (!codeRow) {
            const msgs = {
              finance_mpx: "Kode otoritas tidak valid untuk partner yang dipilih.",
            };
            setErrMsg(msgs[role] || "Kode otoritas tidak valid.");
            return;
          }
        }
      }
      // CSE: tidak perlu validasi kode, langsung lanjut ke OTP

      // ── Send OTP ────────────────────────────────────────────────────────
      const otp = generateOTP();
      const { error: otpErr } = await supabase.from("email_otps").insert({
        email, otp: String(otp),
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        verified: false,
      });
      if (otpErr) throw otpErr;
      const res = await sendOTPEmail(email, otp);
      if (!res.success) throw new Error(res.error);

      // Save to sessionStorage
      sessionStorage.setItem("pending_reg", JSON.stringify({
        email, password, full_name, username, role,
        partner_name:  needsPartner ? partner_name : "",
        cluster:       needsCluster ? cluster      : "",
        access_code:   noCode ? "" : codeUpper,
        bsm_brand:     needsBsm     ? bsm_brand    : null,
        bsm_branch:    needsBsm     ? bsm_branch   : null,
        assignment_id: assignmentId,
      }));
      router.push(`/verify?email=${encodeURIComponent(email)}`);

    } catch (e) {
      setErrMsg(e.message || "Gagal memproses pendaftaran.");
    } finally {
      setLoading(false);
    }
  };

  const selectedRole = ROLES.find(r => r.value === form.role);

  return (
    <div style={{ minHeight: "100svh", position: "relative", color: t.hi, fontFamily: FONT, WebkitFontSmoothing: "antialiased", background: t.bg }}>
      <GlobalCSS d={d} />
      <div className="sh-mesh"><div className="sh-mesh-o1"/><div className="sh-mesh-o2"/><div className="sh-mesh-o3"/><div className="sh-mesh-v"/></div>
      {loading && <LoadingBar />}

      {/* Back to hub picker */}
      <button className="sh-btn" onClick={() => router.push("/login")}
        style={{ position: "fixed", top: 16, left: 16, zIndex: 50, display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 13px", borderRadius: 9, border: `1px solid ${t.line}`, background: d ? "rgba(22,22,24,0.88)" : "rgba(255,255,255,0.88)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", color: t.mid, fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
        <ArrowLeft size={14} strokeWidth={2} /> Ganti Hub
      </button>

      {/* Theme toggle */}
      <button className="sh-btn"
        onClick={() => { const n = !d; setD(n); localStorage.setItem("sh-theme", n ? "dark" : "light"); }}
        style={{ position: "fixed", top: 16, right: 16, zIndex: 50, width: 36, height: 36, borderRadius: 9, border: `1px solid ${t.line}`, background: d ? "rgba(22,22,24,0.88)" : "rgba(255,255,255,0.88)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", color: t.mid }}>
        {d ? <Sun size={15} strokeWidth={2} /> : <Moon size={15} strokeWidth={2} />}
      </button>

      <div style={{ padding: "32px 16px 60px", display: "flex", flexDirection: "column", alignItems: "center", position: "relative", zIndex: 1 }}>
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.988 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.48, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{ width: "100%", maxWidth: 500 }}
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
                <button className="sh-btn" onClick={() => router.push("/sandra/login")}
                  style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, background: t.tealBg, border: `1px solid ${t.tealBd}`, color: t.teal, borderRadius: 8, padding: "6px 11px", fontFamily: FONT }}>
                  <ArrowLeft size={12} strokeWidth={2.5} /> Kembali
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

              {/* ── Form Grid ── */}
              <div className="reg-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px 11px" }}>

                {/* Nama + Username */}
                <div>
                  <Field label="Nama Lengkap" icon={<User size={14} strokeWidth={2} />} hasError={errors.includes("full_name")} t={t}>
                    <TInput placeholder="Nama lengkap" value={form.full_name} onChange={v => up("full_name", v)} t={t} />
                  </Field>
                </div>
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
                      <button className="sh-btn" onClick={() => router.push("/sandra/login")} style={{ fontSize: 11, fontWeight: 700, border: "none", padding: 0, cursor: "pointer", background: "none", color: B.teal, fontFamily: FONT }}>Login sekarang →</button>
                    </div>
                  )}
                </div>

                {/* ── Role Dropdown ── */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <Field
                    label="Role Pengguna"
                    icon={<Shield size={14} strokeWidth={2} />}
                    hasError={false}
                    t={t}
                  >
                    <div style={{ flex: 1, minWidth: 0, height: "100%", position: "relative", display: "flex", alignItems: "center" }}>
                      <select
                        value={form.role}
                        onChange={e => {
                          up("role", e.target.value);
                          up("partner_name", "");
                          up("cluster", "");
                          up("bsm_brand", "");
                          up("bsm_branch", "");
                        }}
                        style={{
                          width: "100%", height: "100%", background: "transparent",
                          border: "none", outline: "none",
                          fontSize: 14, fontWeight: form.role ? 500 : 400,
                          color: form.role ? t.hi : t.lo,
                          fontFamily: FONT, cursor: "pointer",
                          paddingRight: 24,
                        }}
                      >
                        {/* ← Placeholder wajib pilih */}
                        <option value="" disabled>— Pilih Role —</option>
                        {ROLE_GROUPS.map(g => (
                          <optgroup key={g.label} label={g.label}>
                            {g.roles.map(r => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <ChevronDown size={13} style={{ position: "absolute", right: 0, pointerEvents: "none", color: t.lo }} />
                    </div>
                  </Field>
                  {/* Role description — hanya tampil setelah role dipilih */}
                  {selectedRole && (
                    <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 8, padding: "7px 11px", borderRadius: 8, background: t.sub, border: `1px solid ${t.line}` }}>
                      <div style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: selectedRole.color + (d ? "22" : "18"), border: `1px solid ${selectedRole.color}44` }}>
                        <selectedRole.icon size={12} strokeWidth={2} style={{ color: selectedRole.color }} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: selectedRole.color }}>{selectedRole.label}: </span>
                        <span style={{ fontSize: 12, color: t.mid }}>{selectedRole.desc}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Conditional: Partner (finance_mpx) ── */}
                <AnimatePresence>
                  {needsPartner && (
                    <motion.div key="partner" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ gridColumn: "1 / -1", overflow: "hidden" }}>
                      <Field label="Nama Partner" icon={<Building2 size={14} strokeWidth={2} />} hasError={errors.includes("partner_name")} t={t}>
                        <TSelect value={form.partner_name} onChange={v => up("partner_name", v)} t={t}>
                          <option value="" disabled>{loadingP ? "Memuat..." : "— Pilih Partner —"}</option>
                          {partnersList.map(p => <option key={p} value={p}>{p}</option>)}
                        </TSelect>
                      </Field>
                      <div style={{ marginTop: 5, paddingLeft: 2, fontSize: 11.5, color: t.lo }}>
                        Kode otoritas harus sesuai dengan partner yang dipilih.
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── Conditional: BSM Brand + Branch ── */}
                <AnimatePresence>
                  {needsBsm && (
                    <motion.div key="bsm" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ gridColumn: "1 / -1", overflow: "hidden" }}>

                      {/* Brand */}
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ display: "block", marginBottom: 8, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: errors.includes("bsm_brand") ? t.red : t.lo }}>
                          Brand BSM <span style={{ color: t.red }}>*</span>
                        </label>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                          {BSM_BRANDS.map(b => {
                            const sel = form.bsm_brand === b.value;
                            return (
                              <button key={b.value} type="button"
                                onClick={() => up("bsm_brand", b.value)}
                                style={{
                                  padding: "10px 8px", borderRadius: 10, cursor: "pointer", textAlign: "center",
                                  border: `1.5px solid ${sel ? b.color : errors.includes("bsm_brand") ? "rgba(220,38,38,0.40)" : t.line}`,
                                  background: sel ? b.color + "18" : t.fieldBg,
                                  boxShadow: sel ? `0 0 0 2px ${b.color}30` : "none",
                                  transition: "all .15s", fontFamily: FONT,
                                }}>
                                <div style={{ fontSize: 15, fontWeight: 800, color: sel ? b.color : t.hi, letterSpacing: -0.3 }}>{b.label}</div>
                              </button>
                            );
                          })}
                        </div>
                        {form.bsm_brand && (
                          <div style={{ marginTop: 5, paddingLeft: 2, fontSize: 11.5, color: t.green, fontWeight: 600 }}>
                            ✓ Brand <strong>{form.bsm_brand}</strong> dipilih — akun ini hanya dapat mengelola SDP brand tersebut.
                          </div>
                        )}
                      </div>

                      {/* Branch */}
                      <Field label="Branch BSM" icon={<MapPin size={14} strokeWidth={2} />}
                        hasError={errors.includes("bsm_branch")} isOk={!!form.bsm_branch} t={t}>
                        <TSelect value={form.bsm_branch} onChange={v => up("bsm_branch", v)} t={t}>
                          <option value="" disabled>{loadingBB ? "Memuat daftar branch..." : "— Pilih Branch —"}</option>
                          {["NORTH SUMATERA","CENTRAL SUMATERA","SOUTH SUMATERA"].map(area => {
                            const items = bsmBranchList.filter(x => x.area === area);
                            if (!items.length) return null;
                            return (
                              <optgroup key={area} label={area.replace(" SUMATERA", "")}>
                                {items.map(x => (
                                  <option key={x.branch} value={x.branch}>{x.branch}</option>
                                ))}
                              </optgroup>
                            );
                          })}
                        </TSelect>
                      </Field>
                      <div style={{ marginTop: 5, paddingLeft: 2, fontSize: 11.5, color: t.lo }}>
                        Kode otoritas harus sesuai dengan branch yang dipilih.
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── Conditional: Cluster (cse_rse) ── */}
                <AnimatePresence>
                  {needsCluster && (
                    <motion.div key="cluster" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ gridColumn: "1 / -1", overflow: "hidden" }}>
                      <div style={{ marginBottom: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: t.lo }}>Micro Cluster Anda <span style={{ color: t.red }}>*</span></div>
                      <div className={`sh-field${errors.includes("cluster") ? " sh-field-err" : form.cluster ? " sh-field-ok" : ""}`}
                        style={{ display: "flex", alignItems: "center", gap: 10, height: 46, padding: "0 13px", borderRadius: 10, background: t.fieldBg, border: `1.5px solid ${errors.includes("cluster") ? "rgba(220,38,38,0.40)" : t.line}` }}>
                        <MapPin size={14} style={{ color: errors.includes("cluster") ? t.red : form.cluster ? t.green : t.lo, flexShrink: 0 }} />
                        <select value={form.cluster} onChange={e => up("cluster", e.target.value)}
                          style={{ flex: 1, minWidth: 0, height: "100%", background: "transparent", border: "none", outline: "none", fontSize: 14, fontWeight: 500, color: t.hi, fontFamily: FONT, cursor: "pointer" }}>
                          <option value="" disabled>{loadingC ? "Memuat cluster..." : "— Pilih Micro Cluster —"}</option>
                          {["NORTH SUMATERA","CENTRAL SUMATERA","SOUTH SUMATERA"].map(area => {
                            const areaItems = clustersList.filter(c => c.area === area);
                            if (areaItems.length === 0) return null;
                            return (
                              <optgroup key={area} label={area.replace(" SUMATERA", "")}>
                                {areaItems.map(c => (
                                  <option key={c.cluster_key || c.cluster} value={c.cluster_key || c.cluster}>
                                    {c.cluster_key || c.cluster} ({c.branch})
                                  </option>
                                ))}
                              </optgroup>
                            );
                          })}
                        </select>
                      </div>
                      {form.cluster && (
                        <div style={{ marginTop: 5, paddingLeft: 2, fontSize: 11.5, color: t.green, fontWeight: 600 }}>
                          ✓ Cluster dipilih: <strong>{form.cluster}</strong>
                        </div>
                      )}
                      <div style={{ marginTop: 5, paddingLeft: 2, fontSize: 11.5, color: t.lo }}>
                        Anda hanya bisa mengelola SDP dalam cluster ini.
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── Kode Otoritas — disembunyikan untuk CSE ── */}
                <div style={{ gridColumn: "1 / -1", display: NO_CODE_ROLES.includes(form.role) ? "none" : undefined }}>
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
                        style={{ marginBottom: 9, padding: "10px 13px", borderRadius: 10, background: t.tealBg, border: `1px solid ${t.tealBd}`, fontSize: 12.5, color: t.mid, lineHeight: 1.6 }}>
                        <strong style={{ color: t.hi }}>Kode Otoritas</strong> bersifat unik per role.
                        <br />
                        <span style={{ fontSize: 11.5 }}>
                          • SPM / Finance MPX / IOH → dari <strong style={{ color: t.hi }}>SPM Sumatera</strong><br />
                          • CSE → dari <strong style={{ color: t.hi }}>SPM Sumatera</strong><br />
                          • SDP User → dari <strong style={{ color: t.hi }}>SPM</strong> atau <strong style={{ color: t.hi }}>CSE</strong> cluster Anda<br />
                          • BSM → dari <strong style={{ color: t.hi }}>SPM Sumatera</strong>, scope per branch
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <Field icon={<Shield size={14} strokeWidth={2} />} hasError={errors.includes("access_code")} t={t}>
                    <TInput placeholder="Masukkan kode otoritas" value={form.access_code}
                      onChange={v => up("access_code", v.toUpperCase())} t={t} />
                  </Field>
                </div>

                {/* ── Password ── */}
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
            <div style={{ padding: "12px 22px", borderTop: `1px solid ${t.line}`, background: d ? "rgba(255,255,255,0.018)" : "rgba(0,0,0,0.018)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: t.mid }}>Sudah terdaftar?</span>
                <button className="sh-btn" onClick={() => router.push("/sandra/login")} style={{ fontSize: 13, fontWeight: 700, border: "none", padding: 0, cursor: "pointer", background: "none", color: B.teal, fontFamily: FONT }}>Masuk sekarang</button>
              </div>
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