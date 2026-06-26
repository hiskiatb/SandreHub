"use client";
/**
 * /sandra/register/assignment — Daftar via kode otoritas assignment (BSM/CSE/RGE)
 *
 * Alur 3 langkah:
 *   1. Masukkan kode → validasi → preview akses
 *   2. Isi nama, email, password
 *   3. OTP verification → redirect /login
 */
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import supabase from "../../../../lib/supabase";
import {
  KeyRound, User, Mail, Lock, CheckCircle2, AlertTriangle,
  ChevronRight, ArrowLeft, Loader2, Sun, Moon, Eye, EyeOff,
} from "lucide-react";
import { generateOTP } from "../../../../lib/email/otp";
import { sendOTPEmail } from "../../../../lib/email/sendOTP";

// ─── Theme ─────────────────────────────────────────────────────────────────────
const mk = (d) => ({
  bg   : d ? "#0A0A0B" : "#F4F4F6",
  card : d ? "#1A1A1D" : "#FFFFFF",
  sub  : d ? "#202024" : "#F2F2F4",
  line : d ? "#2A2A2F" : "#E2E2E6",
  hi   : d ? "#F2F2F3" : "#1A1A1D",
  mid  : d ? "#8A8A96" : "#5A5A68",
  lo   : d ? "#5A5A68" : "#9898B0",
  teal : "#32BCAD", tealD: "#1A9E90",
  tealBg: d ? "rgba(50,188,173,.13)" : "rgba(50,188,173,.09)",
  tealBd: d ? "rgba(50,188,173,.30)" : "rgba(50,188,173,.22)",
  blue : d ? "#0A84FF" : "#2563EB",
  blueBg: d ? "rgba(10,132,255,.12)" : "rgba(37,99,235,.07)",
  blueBd: d ? "rgba(10,132,255,.28)" : "rgba(37,99,235,.18)",
  mag  : d ? "#E040BE" : "#C6168D",
  magBg: d ? "rgba(224,64,190,.12)" : "rgba(198,22,141,.07)",
  magBd: d ? "rgba(224,64,190,.28)" : "rgba(198,22,141,.18)",
  G    : d ? "#30D158" : "#16A34A",
  GL   : d ? "rgba(48,209,88,.12)"  : "rgba(22,163,74,.07)",
  GB   : d ? "rgba(48,209,88,.28)"  : "rgba(22,163,74,.2)",
  R    : d ? "#F87171" : "#DC2626",
  RL   : d ? "rgba(248,113,113,.12)": "rgba(220,38,38,.07)",
  RB   : d ? "rgba(248,113,113,.28)": "rgba(220,38,38,.20)",
  A    : d ? "#FFD60A" : "#D97706",
  AL   : d ? "rgba(255,214,10,.12)" : "rgba(217,119,6,.07)",
  AB   : d ? "rgba(255,214,10,.28)" : "rgba(217,119,6,.2)",
  iB   : d ? "rgba(255,255,255,.04)": "#FFFFFF",
  iBd  : d ? "rgba(255,255,255,.10)": "rgba(0,0,0,.11)",
  shadow: d ? "0 24px 60px rgba(0,0,0,.65)" : "0 24px 60px rgba(26,26,29,.16)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

const ROLE_CFG = {
  bsm: { label: "BSM", sub: "Branch Sales Manager",        color: "#32BCAD", bg: "rgba(50,188,173,.1)",  bd: "rgba(50,188,173,.25)" },
  cse: { label: "CSE", sub: "Cluster Sales Executive",     color: "#2563EB", bg: "rgba(37,99,235,.07)",  bd: "rgba(37,99,235,.18)"  },
  rge: { label: "RGE", sub: "Regional Growth Executive",   color: "#D97706", bg: "rgba(217,119,6,.07)",  bd: "rgba(217,119,6,.18)"  },
};

const BSM_BRANDS = [
  { value: "3ID",    label: "3ID",    desc: "Pelanggan brand Tri",        color: "#ED1C24" },
  { value: "IM3",    label: "IM3",    desc: "Pelanggan brand Indosat",    color: "#FFCB05" },
  { value: "Hybrid", label: "Hybrid", desc: "3ID & IM3 (kedua brand)",   color: "#32BCAD" },
];

export default function RegisterAssignment() {
  const router = useRouter();
  const [d, setD]           = useState(true);
  const [step, setStep]     = useState(1);     // 1=kode, 2=data, 3=done
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg]   = useState("");

  // Step 1
  const [code,       setCode]       = useState("");
  const [assignment, setAssignment] = useState(null);  // row dari sdp_assignments

  // Step 2
  const [fullName,   setFullName]   = useState("");
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [showPw,     setShowPw]     = useState(false);
  const [bsmBrand,   setBsmBrand]   = useState("");

  useEffect(() => {
    setD(localStorage.getItem("sh-theme") !== "light");
  }, []);

  const t = mk(d);

  // ── Step 1: Validasi kode ──────────────────────────────────────────────────
  const validateCode = async () => {
    const clean = code.trim().toUpperCase();
    if (clean.length !== 8) { setErrMsg("Kode otoritas terdiri dari 8 karakter."); return; }
    setLoading(true); setErrMsg("");
    try {
      const { data, error } = await supabase
        .from("sdp_assignments")
        .select("*")
        .eq("authority_code", clean)
        .eq("is_active", true)
        .maybeSingle();

      if (error || !data) {
        setErrMsg("Kode otoritas tidak ditemukan atau sudah tidak aktif.");
        return;
      }
      if (data.is_registered) {
        setErrMsg("Kode ini sudah pernah digunakan untuk mendaftar.");
        return;
      }
      setAssignment(data);
      setStep(2);
    } catch (e) {
      setErrMsg(e.message);
    } finally { setLoading(false); }
  };

  // ── Step 2: Submit data & kirim OTP ───────────────────────────────────────
  const handleSubmit = async () => {
    if (!fullName.trim()) { setErrMsg("Nama lengkap wajib diisi."); return; }
    if (!email.trim() || !email.includes("@")) { setErrMsg("Email tidak valid."); return; }
    if (password.length < 8) { setErrMsg("Password minimal 8 karakter."); return; }
    if (assignment.role === "bsm" && !bsmBrand) { setErrMsg("Harap pilih brand BSM Anda."); return; }

    setLoading(true); setErrMsg("");
    try {
      // Cek duplikat email
      const { data: dup } = await supabase.from("profiles").select("id").eq("email", email.trim().toLowerCase()).maybeSingle();
      if (dup) { setErrMsg("Email sudah terdaftar. Gunakan email lain."); return; }

      // Kirim OTP
      const otp = generateOTP();
      const { error: otpErr } = await supabase.from("email_otps").insert({
        email: email.trim().toLowerCase(),
        otp: String(otp),
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        verified: false,
      });
      if (otpErr) throw otpErr;
      const res = await sendOTPEmail(email.trim().toLowerCase(), otp);
      if (!res.success) throw new Error(res.error ?? "Gagal kirim email OTP.");

      // Simpan ke sessionStorage untuk verify page
      sessionStorage.setItem("pending_reg", JSON.stringify({
        email      : email.trim().toLowerCase(),
        password,
        full_name  : fullName.trim(),
        username   : fullName.trim().toLowerCase().replace(/\s+/g, "_"),
        role       : assignment.role,
        partner_name : "",
        cluster    : assignment.cluster ?? "",
        sdp_id     : "",
        access_code: assignment.authority_code,
        assignment_id: assignment.id,
        bsm_brand  : assignment.role === "bsm" ? bsmBrand : null,
        bsm_branch : assignment.role === "bsm" ? (assignment.branch ?? "") : null,
      }));

      router.push(`/verify?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch (e) {
      setErrMsg(e.message);
    } finally { setLoading(false); }
  };

  // ── UI helpers ─────────────────────────────────────────────────────────────
  const InputField = ({ icon: Icon, label, value, onChange, type = "text", placeholder, action }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: t.mid, marginBottom: 5 }}>{label}</div>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: t.iB, border: `1px solid ${t.iBd}`,
        borderRadius: 11, padding: "0 14px", height: 44,
      }}>
        <Icon size={15} color={t.lo} />
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={e => { onChange(e.target.value); setErrMsg(""); }}
          style={{
            flex: 1, border: "none", background: "none", outline: "none",
            fontSize: 14, color: t.hi, fontFamily: FF,
          }}
        />
        {action}
      </div>
    </div>
  );

  const roleCfg = assignment ? (ROLE_CFG[assignment.role] ?? ROLE_CFG.cse) : null;

  return (
    <div style={{ minHeight: "100svh", background: t.bg, fontFamily: FF, color: t.hi,
      display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 16px 60px" }}>

      {/* Theme toggle */}
      <button onClick={() => { const n = !d; setD(n); localStorage.setItem("sh-theme", n ? "dark" : "light"); }}
        style={{ position: "fixed", top: 16, right: 16, zIndex: 50, width: 36, height: 36, borderRadius: 9,
          border: `1px solid ${t.line}`, background: d ? "rgba(22,22,24,.88)" : "rgba(255,255,255,.88)",
          backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", color: t.mid, cursor: "pointer" }}>
        {d ? <Sun size={15} /> : <Moon size={15} />}
      </button>

      <div style={{ width: "100%", maxWidth: 420 }}>

        {/* Back */}
        <button onClick={() => step === 1 ? router.push("/sandra/register") : setStep(1)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
            cursor: "pointer", color: t.mid, fontSize: 13, fontWeight: 600, marginBottom: 28, padding: 0 }}>
          <ArrowLeft size={15} /> {step === 1 ? "Kembali ke Pilihan Daftar" : "Ubah Kode"}
        </button>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, margin: "0 auto 14px",
            background: t.tealBg, border: `1px solid ${t.tealBd}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <KeyRound size={24} color={t.tealD} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -.5, color: t.hi }}>
            Daftar dengan Kode
          </div>
          <div style={{ fontSize: 13.5, color: t.mid, marginTop: 4 }}>
            {step === 1 ? "Masukkan kode otoritas yang diberikan oleh SPM atau BSM Anda"
                        : "Lengkapi data akun Anda"}
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: t.card, borderRadius: 18,
          border: `1px solid ${t.line}`, boxShadow: t.shadow,
          padding: "28px 24px",
        }}>

          {/* ── STEP 1: Kode ── */}
          {step === 1 && (
            <>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.mid, marginBottom: 5 }}>KODE OTORITAS</div>
                <input
                  placeholder="Contoh: AB3KD7PX"
                  value={code}
                  onChange={e => { setCode(e.target.value.toUpperCase()); setErrMsg(""); }}
                  onKeyDown={e => e.key === "Enter" && validateCode()}
                  maxLength={8}
                  style={{
                    width: "100%", height: 48, textAlign: "center",
                    fontFamily: "monospace", fontSize: 22, fontWeight: 800,
                    letterSpacing: 6, color: t.hi,
                    background: t.sub, border: `1px solid ${errMsg ? t.RB : t.line}`,
                    borderRadius: 12, outline: "none", boxSizing: "border-box",
                    transition: "border-color .15s",
                  }}
                />
              </div>
              {errMsg && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", borderRadius: 9,
                  background: t.RL, border: `1px solid ${t.RB}`, fontSize: 13, color: t.R, marginBottom: 14 }}>
                  <AlertTriangle size={14} /> {errMsg}
                </div>
              )}
              <button onClick={validateCode} disabled={loading || code.length < 8} style={{
                width: "100%", height: 44, borderRadius: 11, cursor: "pointer",
                background: code.length === 8
                  ? `linear-gradient(135deg, #32BCAD, #1A9E90)`
                  : t.sub,
                border: "none", color: code.length === 8 ? "#fff" : t.lo,
                fontFamily: FF, fontSize: 14, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                boxShadow: code.length === 8 ? "0 4px 14px rgba(50,188,173,.3)" : "none",
                transition: "all .15s",
              }}>
                {loading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <><ChevronRight size={16} /> Validasi Kode</>}
              </button>
            </>
          )}

          {/* ── STEP 2: Data diri ── */}
          {step === 2 && assignment && (
            <>
              {/* Preview akses */}
              <div style={{
                padding: "12px 14px", borderRadius: 11, marginBottom: 20,
                background: roleCfg.bg, border: `1px solid ${roleCfg.bd}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <CheckCircle2 size={15} color={roleCfg.color} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: roleCfg.color }}>
                    Kode valid — Akses yang akan diberikan:
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.hi, marginBottom: 2 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 800, letterSpacing: .3,
                    color: roleCfg.color, background: roleCfg.bg,
                    border: `1px solid ${roleCfg.bd}`,
                    padding: "1px 7px", borderRadius: 5, marginRight: 8,
                  }}>
                    {roleCfg.label}
                  </span>
                  {assignment.branch}
                  {assignment.cluster ? ` · ${assignment.cluster}` : ""}
                </div>
                <div style={{ fontSize: 11.5, color: t.mid }}>
                  {assignment.bu_type} · {assignment.area}
                  {assignment.label ? ` · ${assignment.label}` : ""}
                </div>
              </div>

              {/* ── Brand selection for BSM ── */}
              {assignment.role === "bsm" && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: t.mid, marginBottom: 8 }}>BRAND BSM ANDA <span style={{ color: t.R }}>*</span></div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {BSM_BRANDS.map(b => {
                      const sel = bsmBrand === b.value;
                      return (
                        <button
                          key={b.value}
                          onClick={() => { setBsmBrand(b.value); setErrMsg(""); }}
                          style={{
                            padding: "10px 8px",
                            borderRadius: 10,
                            border: `1.5px solid ${sel ? b.color : t.line}`,
                            background: sel ? b.color + "18" : t.iB,
                            cursor: "pointer",
                            textAlign: "center",
                            transition: "all .15s",
                            boxShadow: sel ? `0 0 0 2px ${b.color}33` : "none",
                          }}
                        >
                          <div style={{ fontSize: 15, fontWeight: 800, color: sel ? b.color : t.hi, letterSpacing: -.3 }}>{b.label}</div>
                          <div style={{ fontSize: 10.5, color: t.lo, marginTop: 3, lineHeight: 1.3 }}>{b.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                  {bsmBrand && (
                    <div style={{ marginTop: 7, fontSize: 12, color: t.G, fontWeight: 600 }}>
                      ✓ Brand dipilih: <strong>{bsmBrand}</strong> — akun ini hanya dapat mengelola SDP brand {bsmBrand}
                    </div>
                  )}
                </div>
              )}

              <InputField icon={User}  label="NAMA LENGKAP"
                value={fullName} onChange={setFullName} placeholder="Nama lengkap Anda" />

              <InputField icon={Mail}  label="EMAIL"
                value={email} onChange={setEmail} type="email" placeholder="email@contoh.com" />

              <InputField icon={Lock}  label="PASSWORD"
                value={password} onChange={setPassword}
                type={showPw ? "text" : "password"}
                placeholder="Minimal 8 karakter"
                action={
                  <button onClick={() => setShowPw(p => !p)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: t.lo, padding: 0 }}>
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                }
              />

              {errMsg && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", borderRadius: 9,
                  background: t.RL, border: `1px solid ${t.RB}`, fontSize: 13, color: t.R, marginBottom: 14 }}>
                  <AlertTriangle size={14} /> {errMsg}
                </div>
              )}

              <button onClick={handleSubmit} disabled={loading} style={{
                width: "100%", height: 44, borderRadius: 11, cursor: "pointer",
                background: `linear-gradient(135deg, #32BCAD, #1A9E90)`,
                border: "none", color: "#fff", fontFamily: FF, fontSize: 14, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                boxShadow: "0 4px 14px rgba(50,188,173,.3)",
                opacity: loading ? .7 : 1,
              }}>
                {loading
                  ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                  : <><Mail size={15} /> Kirim Kode Verifikasi</>
                }
              </button>
            </>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: t.mid }}>
          Sudah punya akun?{" "}
          <a href="/sandra/login" style={{ color: t.tealD, fontWeight: 700, textDecoration: "none" }}>
            Masuk di sini
          </a>
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
