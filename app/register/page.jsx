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

// ─── Design Tokens ────────────────────────────────────────────────────────────
const mk = (d) => ({
  bg:      d ? "#07090D" : "#F2F2F7",
  card:    d ? "#0D1019" : "#FFFFFF",
  sub:     d ? "#131826" : "#F5F5F8",
  line:    d ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.09)",
  hi:      d ? "#EEF0F5" : "#1A1A1E",
  mid:     d ? "#8892A4" : "#4B5563",
  lo:      d ? "#424D60" : "#9CA3AF",
  blue:    "#0A84FF",
  blueBg:  d ? "rgba(10,132,255,0.11)" : "rgba(10,132,255,0.07)",
  blueBd:  d ? "rgba(10,132,255,0.26)" : "rgba(10,132,255,0.18)",
  green:   d ? "#2ED158" : "#16A34A",
  red:     d ? "#FF453A" : "#DC2626",
  redBg:   d ? "rgba(255,69,58,0.09)"  : "rgba(220,38,38,0.07)",
  redBd:   d ? "rgba(255,69,58,0.22)"  : "rgba(220,38,38,0.18)",
  // Select & input share same bg so there's no colour mismatch
  inputBg: d ? "rgba(255,255,255,0.045)" : "#F5F5F8",
  shadow:  d ? "0 24px 60px rgba(0,0,0,0.65)" : "0 24px 60px rgba(0,0,0,0.10)",
  ring:    d ? "0 0 0 1px rgba(255,255,255,0.045)" : "0 0 0 1px rgba(0,0,0,0.055)",
});

// ─── Global CSS ───────────────────────────────────────────────────────────────
const GlobalStyle = ({ d }) => (
  <style>{`
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { -webkit-text-size-adjust: 100%; }
    body { margin: 0; }
    /* 16px prevents iOS auto-zoom; manual pinch-zoom still works */
    input, select, textarea { font-size: 16px !important; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-thumb {
      background: ${d ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)"};
      border-radius: 99px;
    }
    @keyframes sh-spin { to { transform: rotate(360deg); } }
    .sh-spin { animation: sh-spin 0.9s linear infinite; }
    .sh-btn { transition: transform 0.12s ease, opacity 0.12s ease; cursor: pointer; }
    .sh-btn:hover:not(:disabled) { opacity: 0.88; }
    .sh-btn:active:not(:disabled) { transform: scale(0.97); }
    /* Field focus ring */
    .sh-field { transition: border-color 0.15s, box-shadow 0.15s; }
    .sh-field:focus-within {
      border-color: #0A84FF !important;
      box-shadow: 0 0 0 3px rgba(10,132,255,0.16) !important;
    }
    .sh-field-error { border-color: #FF453A !important; box-shadow: 0 0 0 3px rgba(255,69,58,0.14) !important; }
    .sh-field-error:focus-within { border-color: #FF453A !important; box-shadow: 0 0 0 3px rgba(255,69,58,0.18) !important; }
    /* Make native <select> seamless — removes default arrow styling differences */
    select { -webkit-appearance: none; appearance: none; }
  `}</style>
);

// ─── Reusable Field ───────────────────────────────────────────────────────────
function Field({ label, icon, children, hasError, trailing, t, d }) {
  return (
    <div>
      {label && (
        <label style={{
          display: "block", marginBottom: 8, paddingLeft: 1,
          fontSize: 11, fontWeight: 700, letterSpacing: "0.07em",
          textTransform: "uppercase", color: t.lo,
        }}>
          {label}
        </label>
      )}
      <div
        className={`sh-field${hasError ? " sh-field-error" : ""}`}
        style={{
          display: "flex", alignItems: "center", gap: 11,
          height: 52, borderRadius: 13, padding: "0 16px",
          background: t.inputBg,
          border: `1.5px solid ${hasError ? t.red : t.line}`,
          minWidth: 0,
overflow: "hidden",
        }}
      >
        <span style={{ color: hasError ? t.red : t.lo, flexShrink: 0, display: "flex" }}>
          {icon}
        </span>
        {children}
        {trailing}
      </div>
    </div>
  );
}

// ─── Text Input ───────────────────────────────────────────────────────────────
function TInput({ type = "text", placeholder, value, onChange, onBlur, t }) {
  return (
    <input
      type={type} placeholder={placeholder} value={value}
      onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
      style={{
        flex: 1, minWidth: 0, height: "100%", background: "transparent",
        border: "none", outline: "none",
        fontSize: 15, fontWeight: 500, color: t.hi, fontFamily: "inherit",
      }}
    />
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────
// Using same inputBg so no color mismatch between native select & div container
function TSelect({ value, onChange, children, t }) {
  return (
    <select
      value={value} onChange={(e) => onChange(e.target.value)}
      style={{
        flex: 1, minWidth: 0, height: "100%",
        background: "transparent",   // ← transparent so parent bg shows through
        border: "none", outline: "none",
        fontSize: 15, fontWeight: 500, color: t.hi, fontFamily: "inherit",
        cursor: "pointer",
      }}
    >
      {children}
    </select>
  );
}

// ─── CheckItem ────────────────────────────────────────────────────────────────
function CheckItem({ label, ok, t }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {ok
        ? <CheckCircle2 size={14} strokeWidth={2.2} style={{ color: "#2ED158", flexShrink: 0 }} />
        : <XCircle      size={14} strokeWidth={2}   style={{ color: t.lo,      flexShrink: 0 }} />
      }
      <span style={{ fontSize: 12, fontWeight: 600, color: ok ? "#2ED158" : t.lo }}>{label}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RegisterPage() {
  const router    = useRouter();
  const infoRef   = useRef(null);
  const infoBtnRef = useRef(null);

  const [form, setForm] = useState({
    email: "", password: "", confirm_password: "",
    full_name: "", username: "", role: "spm_sumatera",
    access_code: "", partner_name: "",
  });
  const [partnersList, setPartnersList] = useState([]);
  const [loadingP, setLoadingP]         = useState(false);
  const [errMsg,   setErrMsg]           = useState("");
  const [errors,   setErrors]           = useState([]);
  const [loading,  setLoading]          = useState(false);
  const [d,        setD]                = useState(true);
  const [showInfo, setShowInfo]         = useState(false);
  const [checking, setChecking]         = useState({ email: false, username: false });
  const [exists,   setExists]           = useState({ email: false, username: false });

  useEffect(() => {
    const v = localStorage.getItem("sh-theme");
    setD(v ? v === "dark" : true);

    // Restore session
    const raw = sessionStorage.getItem("pending_reg");
    if (raw) {
      const p = JSON.parse(raw);
      setForm((f) => ({
        ...f,
        email: p.email || "", full_name: p.full_name || "",
        username: p.username || "", role: p.role || "spm_sumatera",
        access_code: p.access_code || "", partner_name: p.partner_name || "",
      }));
    }

    // Fetch partners
    (async () => {
      setLoadingP(true);
      try {
        const { data } = await supabase.from("partner_branches").select("partner_name");
        if (data) setPartnersList([...new Set(data.map((x) => x.partner_name))].sort());
      } catch {}
      finally { setLoadingP(false); }
    })();

    const onClick = (e) => {
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
    setForm((f) => ({ ...f, [key]: val }));
    setErrors((e) => e.filter((x) => x !== key));
    setErrMsg("");
  };

  const checkAvail = async (field, value) => {
    if (!value) return;
    setChecking((p) => ({ ...p, [field]: true }));
    const { data } = await supabase.from("profiles").select(field).eq(field, value).maybeSingle();
    setExists((p) => ({ ...p, [field]: !!data }));
    setChecking((p) => ({ ...p, [field]: false }));
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
      .filter(([k, v]) => !v && (k !== "partner_name" || form.role === "finance_mpx"))
      .map(([k]) => k);
    if (empty.length) { setErrors(empty); setErrMsg("Harap lengkapi semua kolom."); return; }
    if (!Object.values(pass).every(Boolean)) { setErrMsg("Syarat kata sandi belum terpenuhi."); return; }
    setLoading(true);
    try {
      const email = form.email.trim().toLowerCase();
      const { password, full_name, username, role, access_code, partner_name } = form;
      const { data: dup } = await supabase.from("profiles").select("id")
        .or(`email.eq.${email},username.eq.${username}`).maybeSingle();
      if (dup) { setErrMsg("Email atau Username sudah terdaftar."); return; }
      const { data: code } = await supabase.from("access_codes").select("id")
        .eq("code", access_code.toUpperCase()).eq("type", role).eq("is_active", true).maybeSingle();
      if (!code) { setErrMsg("Kode otoritas tidak valid."); return; }
      const otp = generateOTP();
      const { error: otpErr } = await supabase.from("email_otps").insert({
        email, otp: String(otp),
        expires_at: new Date(Date.now() + 600_000).toISOString(), verified: false,
      });
      if (otpErr) throw otpErr;
      const res = await sendOTPEmail(email, otp);
      if (!res.success) throw new Error(res.error);
      sessionStorage.setItem("pending_reg", JSON.stringify({
        email, password, full_name, username, role, partner_name,
        access_code: access_code.toUpperCase(),
      }));
      router.push(`/verify?email=${email}`);
    } catch (e) { setErrMsg(e.message || "Gagal memproses pendaftaran."); }
    finally { setLoading(false); }
  };

  // Shared label style
  const lbl = {
    display: "block", marginBottom: 8, paddingLeft: 1,
    fontSize: 11, fontWeight: 700, letterSpacing: "0.07em",
    textTransform: "uppercase", color: t.lo,
  };

  return (
    <div style={{
      minHeight: "100svh", background: t.bg, color: t.hi,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif",
      WebkitFontSmoothing: "antialiased",
      transition: "background 0.3s",
    }}>
      <GlobalStyle d={d} />

      {/* ── Theme Toggle ── */}
      <button className="sh-btn" onClick={() => { const n = !d; setD(n); localStorage.setItem("sh-theme", n ? "dark" : "light"); }}
        style={{
          position: "fixed", top: 20, right: 20, zIndex: 50,
          width: 40, height: 40, borderRadius: 12,
          border: `1px solid ${t.line}`, background: t.card,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: t.mid, boxShadow: t.ring,
        }}
      >
        {d ? <Sun size={17} strokeWidth={2} /> : <Moon size={17} strokeWidth={2} />}
      </button>

      {/* ── Scroll container ── */}
      <div style={{ padding: "32px 16px 48px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <motion.div
          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          style={{ width: "100%", maxWidth: 480 }}
        >
          {/* ── Logo & Branding ── */}
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 16, marginBottom: 32,
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: 18, background: t.blue,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 8px 32px rgba(10,132,255,${d ? 0.45 : 0.30}), 0 0 0 6px ${t.blueBg}`,
            }}>
              <Box size={30} strokeWidth={2} color="#fff" />
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, color: t.hi }}>
                Sandra<span style={{ color: t.blue }}>Hub</span>
              </div>
              <div style={{ marginTop: 7, fontSize: 10, fontWeight: 700, letterSpacing: "0.40em", textTransform: "uppercase", color: t.lo }}>
                SPM Sumatera
              </div>
            </div>
          </div>

          {/* ── Card ── */}
          <div style={{
            background: t.card, border: `1px solid ${t.line}`,
            borderRadius: 24, boxShadow: t.shadow, overflow: "hidden",
          }}>
            <div style={{ padding: "36px 32px 28px" }}>

              {/* Card header */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em" }}>Daftar Akun</div>
                  <div style={{ marginTop: 5, fontSize: 13.5, color: t.mid }}>Buat akun SandraHub baru</div>
                </div>
                <button className="sh-btn" onClick={() => router.push("/login")}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    fontSize: 12.5, fontWeight: 700, color: t.blue,
                    background: t.blueBg, border: `1px solid ${t.blueBd}`,
                    borderRadius: 10, padding: "7px 12px",
                  }}>
                  <ChevronLeft size={14} strokeWidth={2.5} />Masuk
                </button>
              </div>

              {/* Error banner */}
              <AnimatePresence>
                {errMsg && (
                  <motion.div key="err"
                    initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                    animate={{ opacity: 1, height: "auto", marginBottom: 24 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{
                      padding: "12px 16px", borderRadius: 13,
                      background: t.redBg, border: `1px solid ${t.redBd}`,
                      display: "flex", alignItems: "center", gap: 10,
                      fontSize: 13, fontWeight: 600, color: t.red, overflow: "hidden",
                    }}>
                    <AlertCircle size={15} strokeWidth={2.2} style={{ flexShrink: 0 }} />
                    {errMsg}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Form grid ── */}
<div
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "18px 16px",
  }}
>
                {/* Nama Lengkap */}
                <div>
                  <label style={lbl}>Nama Lengkap</label>
                  <Field icon={<User size={16} strokeWidth={2} />} hasError={errors.includes("full_name")} t={t} d={d}>
                    <TInput placeholder="Nama lengkap" value={form.full_name} onChange={(v) => up("full_name", v)} t={t} />
                  </Field>
                </div>

                {/* Username */}
                <div>
                  <label style={lbl}>Username</label>
                  <Field
                    icon={<User size={16} strokeWidth={2} />}
                    hasError={errors.includes("username") || exists.username}
                    trailing={checking.username && <Loader2 size={14} className="sh-spin" style={{ color: t.blue, flexShrink: 0 }} />}
                    t={t} d={d}
                  >
                    <TInput placeholder="tanpa spasi" value={form.username}
                      onChange={(v) => { up("username", v.toLowerCase().replace(/\s+/g, "")); setExists((p) => ({ ...p, username: false })); }}
                      onBlur={() => checkAvail("username", form.username)} t={t} />
                  </Field>
                  {exists.username && (
                    <div style={{ marginTop: 6, paddingLeft: 2, fontSize: 11.5, fontWeight: 600, color: t.red }}>
                      Username sudah digunakan
                    </div>
                  )}
                </div>

                {/* Email — full width */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Alamat Gmail</label>
                  <Field
                    icon={<Mail size={16} strokeWidth={2} />}
                    hasError={errors.includes("email") || exists.email}
                    trailing={checking.email && <Loader2 size={14} className="sh-spin" style={{ color: t.blue, flexShrink: 0 }} />}
                    t={t} d={d}
                  >
                    <TInput type="email" placeholder="nama@gmail.com" value={form.email}
                      onChange={(v) => { up("email", v); setExists((p) => ({ ...p, email: false })); }}
                      onBlur={() => checkAvail("email", form.email)} t={t} />
                  </Field>
                  {exists.email && (
                    <div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 2 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: t.red }}>Email sudah terdaftar</span>
                      <button className="sh-btn" onClick={() => router.push("/login")}
                        style={{ fontSize: 11.5, fontWeight: 700, color: t.blue, background: "none", border: "none", padding: 0 }}>
                        Login sekarang →
                      </button>
                    </div>
                  )}
                </div>

                {/* Role — full width */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Role Pengguna</label>
                  <Field icon={<Shield size={16} strokeWidth={2} />} hasError={false} t={t} d={d}>
                    <TSelect value={form.role} onChange={(v) => { up("role", v); up("partner_name", ""); }} t={t}>
                      <option value="spm_sumatera">SPM Sumatera</option>
                      <option value="finance_mpx">Finance MPX</option>
                    </TSelect>
                  </Field>
                </div>

                {/* Partner — conditional, full width */}
                <AnimatePresence>
                  {form.role === "finance_mpx" && (
                    <motion.div
                      key="partner"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{ gridColumn: "1 / -1", overflow: "hidden" }}
                    >
                      <div style={{ paddingTop: 0 }}>
                        <label style={lbl}>Nama Partner</label>
                        <Field icon={<Building2 size={16} strokeWidth={2} />} hasError={errors.includes("partner_name")} t={t} d={d}>
                          <TSelect value={form.partner_name} onChange={(v) => up("partner_name", v)} t={t}>
                            <option value="" disabled>{loadingP ? "Memuat..." : "— Pilih Partner —"}</option>
                            {partnersList.map((p) => <option key={p} value={p}>{p}</option>)}
                          </TSelect>
                        </Field>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Kode Otoritas — full width */}
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <label style={{ ...lbl, marginBottom: 0 }}>Kode Otoritas</label>
                    <button ref={infoBtnRef} className="sh-btn"
                      onClick={() => setShowInfo((s) => !s)}
                      style={{
                        background: "none", border: "none", padding: 0,
                        display: "flex", color: showInfo ? t.blue : t.lo,
                      }}>
                      <Info size={13} strokeWidth={2} />
                    </button>
                  </div>
                  <AnimatePresence>
                    {showInfo && (
                      <motion.div ref={infoRef}
                        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
                        style={{
                          marginBottom: 10, padding: "12px 16px", borderRadius: 13,
                          background: t.blueBg, border: `1px solid ${t.blueBd}`,
                          fontSize: 13, color: t.mid, lineHeight: 1.6,
                        }}>
                        <strong style={{ color: t.hi }}>Kode Otoritas</strong> adalah kunci akses yang dipersonalisasi.
                        Dapatkan melalui tim <strong style={{ color: t.hi }}>SPM Sumatera</strong>.
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <Field icon={<Shield size={16} strokeWidth={2} />} hasError={errors.includes("access_code")} t={t} d={d}>
                    <TInput placeholder="Masukkan kode" value={form.access_code}
                      onChange={(v) => up("access_code", v.toUpperCase())} t={t} />
                  </Field>
                </div>

                {/* Kata Sandi */}
                <div>
                  <label style={lbl}>Kata Sandi</label>
                  <Field icon={<Lock size={16} strokeWidth={2} />} hasError={errors.includes("password")} t={t} d={d}>
                    <TInput type="password" placeholder="Min. 8 karakter" value={form.password} onChange={(v) => up("password", v)} t={t} />
                  </Field>
                </div>

                {/* Konfirmasi */}
                <div>
                  <label style={lbl}>Konfirmasi</label>
                  <Field icon={<LockKeyhole size={16} strokeWidth={2} />} hasError={errors.includes("confirm_password")} t={t} d={d}>
                    <TInput type="password" placeholder="Ulangi sandi" value={form.confirm_password} onChange={(v) => up("confirm_password", v)} t={t} />
                  </Field>
                </div>
              </div>

              {/* ── Password Checklist ── */}
              <div style={{
                marginTop: 20,
                padding: "16px 18px",
                borderRadius: 14,
                background: t.sub,
                border: `1px solid ${t.line}`,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px 24px",
              }}>
                <CheckItem label="Minimal 8 karakter"  ok={pass.length}  t={t} />
                <CheckItem label="Angka atau simbol"   ok={pass.symbol}  t={t} />
                <CheckItem label="Huruf kapital (A-Z)" ok={pass.capital} t={t} />
                <CheckItem label="Konfirmasi cocok"    ok={pass.match}   t={t} />
              </div>

              {/* ── CTA ── */}
              <button
                className="sh-btn"
                onClick={handleRegister} disabled={loading}
                style={{
                  marginTop: 24, width: "100%", height: 52,
                  borderRadius: 14, border: "none",
                  background: t.blue, color: "#fff",
                  fontSize: 14, fontWeight: 700, letterSpacing: "0.01em",
                  opacity: loading ? 0.72 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: `0 4px 20px rgba(10,132,255,${d ? 0.42 : 0.30})`,
                }}
              >
                {loading
                  ? <Loader2 size={18} className="sh-spin" />
                  : <><Send size={15} strokeWidth={2.2} /><span>Verifikasi Email</span></>
                }
              </button>
            </div>

            {/* Footer */}
            <div style={{
              padding: "18px 32px",
              borderTop: `1px solid ${t.line}`,
              background: t.blueBg,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <span style={{ fontSize: 13.5, color: t.mid }}>Sudah terdaftar?</span>
              <button className="sh-btn" onClick={() => router.push("/login")}
                style={{ fontSize: 13.5, fontWeight: 700, color: t.blue, background: "none", border: "none", padding: 0 }}>
                Masuk sekarang
              </button>
            </div>
          </div>

          <div style={{
            marginTop: 28, textAlign: "center",
            fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em",
            textTransform: "uppercase", color: t.lo, opacity: 0.35,
          }}>
            © 2026 SandraHub · SPM Sumatera
          </div>
        </motion.div>
      </div>
    </div>
  );
}