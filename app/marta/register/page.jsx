"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import supabaseMarta from "../../../lib/supabaseMarta";
import { HubLogo } from "../../../components/HubLogo";
import {
  Mail, Lock, Eye, EyeOff, Loader2, AlertCircle,
  User, Building2, Check, Sun, Moon, ArrowLeft, ArrowRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED  = "#ED1C24";
const MAGA = "#C6168D";

const mk = (d) => ({
  bg:      d ? "#0A0A0B" : "#F4F4F6",
  card:    d ? "#141417" : "#FFFFFF",
  line:    d ? "#22222A" : "#E4E2EA",
  hi:      d ? "#F0F0F2" : "#111116",
  mid:     d ? "#8A8A96" : "#5A5A68",
  lo:      d ? "#4A4A58" : "#C8C5D0",
  fieldBg: d ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)",
  red:     d ? "#F87171" : "#DC2626",
  redBg:   d ? "rgba(248,113,113,0.10)" : "rgba(220,38,38,0.07)",
  redBd:   d ? "rgba(248,113,113,0.25)" : "rgba(220,38,38,0.20)",
  ok:      d ? "#34D399" : "#059669",
  okBg:    d ? "rgba(52,211,153,0.10)"  : "rgba(5,150,105,0.07)",
  okBd:    d ? "rgba(52,211,153,0.25)"  : "rgba(5,150,105,0.20)",
  chip:    d ? "#1E1E22" : "#F0EFF4",
  chipA:   d ? "rgba(237,28,36,0.12)"   : "rgba(237,28,36,0.06)",
  card$:   d ? "0 24px 60px rgba(0,0,0,0.65)" : "0 8px 40px rgba(0,0,0,0.10)",
});

const ROLES = [
  { value: "bme",     label: "BME",     desc: "Brand Marketing Executive" },
  { value: "rge",     label: "RGE",     desc: "Retail Grassroot Executive" },
  { value: "tm_im3",  label: "TM IM3",  desc: "Territory Manager — IM3" },
  { value: "tm_tri",  label: "TM Tri",  desc: "Territory Manager — Tri" },
  { value: "head_tm", label: "Head TM", desc: "Head of Territory Management" },
];

const BRANDS = ["IM3", "Tri", "Both"];

// ── Step indicator ───────────────────────────────────────────────────────────
function Stepper({ step, t }) {
  const steps = [
    { num: 1, label: "Akun" },
    { num: 2, label: "Profil" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 28 }}>
      {steps.map((s, i) => {
        const done    = step > s.num;
        const active  = step === s.num;
        const pending = step < s.num;
        return (
          <div key={s.num} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "unset" }}>
            {/* Node */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700, fontFamily: FONT,
                background: done
                  ? `linear-gradient(135deg,${RED},${MAGA})`
                  : active
                    ? `linear-gradient(135deg,${RED},${MAGA})`
                    : t.chip,
                color: pending ? t.mid : "#fff",
                boxShadow: active ? `0 0 0 4px ${RED}22` : "none",
                transition: "background 0.25s, box-shadow 0.25s",
              }}>
                {done ? <Check size={14} strokeWidth={3} /> : s.num}
              </div>
              <span style={{
                fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em",
                textTransform: "uppercase", fontFamily: FONT,
                color: pending ? t.mid : t.hi,
                transition: "color 0.2s",
              }}>{s.label}</span>
            </div>
            {/* Connector line */}
            {i < steps.length - 1 && (
              <div style={{
                flex: 1, height: 2, marginBottom: 18, marginLeft: 8, marginRight: 8,
                borderRadius: 99,
                background: done
                  ? `linear-gradient(90deg,${RED},${MAGA})`
                  : t.line,
                transition: "background 0.3s",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Field wrapper ────────────────────────────────────────────────────────────
function Field({ label, note, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" }}>
          {label}
        </label>
        {note && <span style={{ fontSize: 11 }}>{note}</span>}
      </div>
      {children}
    </div>
  );
}

export default function MartaRegisterPage() {
  const router      = useRouter();
  const [d, setD]   = useState(true);
  const [step, setStep] = useState(1); // 1 | 2 | 3(done)
  const t = mk(d);

  // Step 1 state
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [showPw,   setShowPw]   = useState(false);

  // Step 2 state
  const [fullName,  setFullName]  = useState("");
  const [role,      setRole]      = useState("");
  const [brand,     setBrand]     = useState("");
  const [authCode,  setAuthCode]  = useState("");

  const [loading, setLoading] = useState(false);
  const [errMsg,  setErrMsg]  = useState("");

  useEffect(() => {
    setD(localStorage.getItem("hub-theme") !== "light");
    supabaseMarta.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/martahub");
    });
  }, []);

  const needsBrand = role === "bme" || role === "rge";
  const isManager  = ["tm_im3", "tm_tri", "head_tm"].includes(role);

  const pwStrong   = password.length >= 8;
  const pwMatch    = password === confirm;
  const step1Valid = email.trim() && pwStrong && pwMatch;
  const step2Valid = fullName.trim() && role && (needsBrand ? brand : true);

  async function handleRegister() {
    setLoading(true);
    setErrMsg("");

    // Validate auth code
    let authCodeId = null;
    if (authCode.trim()) {
      const { data: codeRow } = await supabaseMarta
        .from("mh_auth_codes")
        .select("id, is_used, expires_at")
        .eq("code", authCode.trim().toUpperCase())
        .single();
      if (!codeRow) { setErrMsg("Kode registrasi tidak valid."); setLoading(false); return; }
      if (codeRow.is_used) { setErrMsg("Kode registrasi sudah digunakan."); setLoading(false); return; }
      if (codeRow.expires_at && new Date(codeRow.expires_at) < new Date()) {
        setErrMsg("Kode registrasi sudah kedaluwarsa."); setLoading(false); return;
      }
      authCodeId = codeRow.id;
    }

    // Sign up
    const { data, error: signUpErr } = await supabaseMarta.auth.signUp({
      email:   email.trim().toLowerCase(),
      password,
      options: { data: { full_name: fullName.trim() } },
    });
    if (signUpErr) {
      setErrMsg(signUpErr.message.includes("already registered")
        ? "Email ini sudah terdaftar. Silakan login."
        : signUpErr.message);
      setLoading(false);
      return;
    }

    const userId = data.user?.id;
    if (!userId) { setErrMsg("Gagal membuat akun. Coba lagi."); setLoading(false); return; }

    // Insert profile
    const finalBrand = isManager
      ? (role === "tm_im3" ? "IM3" : role === "tm_tri" ? "Tri" : null)
      : brand;
    const { error: profileErr } = await supabaseMarta.from("mh_profiles").insert({
      id:           userId,
      email:        email.trim().toLowerCase(),
      full_name:    fullName.trim(),
      role,
      brand:        finalBrand,
      auth_code_id: authCodeId,
      is_active:    false,
    });
    if (profileErr) { setErrMsg("Gagal menyimpan profil: " + profileErr.message); setLoading(false); return; }

    // Mark code used
    if (authCodeId) {
      await supabaseMarta.from("mh_auth_codes")
        .update({ is_used: true, used_by: userId, used_at: new Date().toISOString() })
        .eq("id", authCodeId);
    }

    setStep(3);
    setLoading(false);
  }

  // ── Shared styles ────────────────────────────────────────────────────────
  const fieldStyle = {
    display: "flex", alignItems: "center", gap: 10,
    height: 46, padding: "0 14px", borderRadius: 10,
    background: t.fieldBg, border: `1.5px solid ${t.line}`,
    transition: "border-color 0.15s",
  };
  const inputStyle = {
    flex: 1, minWidth: 0, height: "100%", background: "transparent",
    border: "none", outline: "none", fontSize: 14, fontWeight: 500,
    color: t.hi, fontFamily: FONT, WebkitAppearance: "none",
  };
  const labelColor = { color: t.mid };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100svh", fontFamily: FONT, background: t.bg,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: step === 3 ? "center" : "flex-start",
      padding: "28px 20px", paddingTop: step === 3 ? 28 : 80,
      position: "relative", WebkitFontSmoothing: "antialiased",
    }}>

      {/* Mesh bg — sama persis dengan hub picker */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-20%", left: "-10%", width: "60vw", height: "60vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(237,28,36,0.08) 0%,transparent 70%)", filter: "blur(2px)" }} />
        <div style={{ position: "absolute", bottom: "-15%", right: "-5%", width: "50vw", height: "50vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(194,24,124,0.07) 0%,transparent 70%)", filter: "blur(2px)" }} />
        <div style={{ position: "absolute", inset: 0, background: d ? "radial-gradient(ellipse at 50% 50%,transparent 30%,rgba(10,10,11,0.7) 100%)" : "radial-gradient(ellipse at 50% 50%,transparent 30%,rgba(244,244,246,0.6) 100%)" }} />
      </div>

      {/* Back + Theme — fixed */}
      <div style={{ position: "fixed", top: 18, left: 18, zIndex: 50 }}>
        <button
          onClick={() => step > 1 && step < 3 ? (setErrMsg(""), setStep(s => s - 1)) : router.push("/marta/login")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: d ? "rgba(20,20,23,0.9)" : "rgba(255,255,255,0.9)", border: `1px solid ${t.line}`, borderRadius: 10, padding: "8px 14px", cursor: "pointer", color: t.mid, fontSize: 13, fontWeight: 600, fontFamily: FONT, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
          <ArrowLeft size={14} /> {step > 1 && step < 3 ? "Kembali" : "Login"}
        </button>
      </div>
      <button onClick={() => { const n = !d; setD(n); localStorage.setItem("hub-theme", n ? "dark" : "light"); }} style={{ position: "fixed", top: 18, right: 18, zIndex: 50, width: 36, height: 36, borderRadius: 10, border: `1px solid ${t.line}`, background: d ? "rgba(20,20,23,0.9)" : "rgba(255,255,255,0.9)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", color: t.mid, cursor: "pointer" }}>
        {d ? <Sun size={15} /> : <Moon size={15} />}
      </button>

      {/* Card */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42 }}
        style={{ width: "100%", maxWidth: 420, position: "relative", zIndex: 1 }}>

        {step < 3 ? (
          <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 18, boxShadow: t.card$, overflow: "hidden" }}>
            {/* Top accent bar */}
            <div style={{ height: 3, background: `linear-gradient(90deg,${RED},${MAGA})` }} />

            <div style={{ padding: "28px 28px 24px" }}>

              {/* Logo row */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
                <HubLogo variant="marta" size={48} shadow inBox pad={3} />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.04em", color: t.hi, lineHeight: 1.1 }}>
                    Marta<span style={{ background: `linear-gradient(90deg,${RED},${MAGA})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Hub</span>
                  </div>
                  <div style={{ marginTop: 2, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: t.mid }}>
                    Buat Akun Baru
                  </div>
                </div>
              </div>

              {/* Stepper */}
              <Stepper step={step} t={t} />

              {/* Error */}
              <AnimatePresence>
                {errMsg && (
                  <motion.div key="err" initial={{ opacity: 0, height: 0, marginBottom: 0 }} animate={{ opacity: 1, height: "auto", marginBottom: 16 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }} transition={{ duration: 0.18 }}
                    style={{ padding: "9px 13px", borderRadius: 10, background: t.redBg, border: `1px solid ${t.redBd}`, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, color: t.red, overflow: "hidden" }}>
                    <AlertCircle size={13} strokeWidth={2.2} style={{ flexShrink: 0 }} />{errMsg}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Step content */}
              <AnimatePresence mode="wait">

                {/* ── Step 1: Akun ──────────────────────────────────────── */}
                {step === 1 && (
                  <motion.div key="step1"
                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.22 }}
                    style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                    <div style={{ marginBottom: 4 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: t.hi, letterSpacing: "-0.02em" }}>Buat Akun</div>
                      <div style={{ marginTop: 2, fontSize: 13, color: t.mid }}>Email dan kata sandi untuk login</div>
                    </div>

                    {/* Email */}
                    <Field label="Email">
                      <div style={{ ...fieldStyle }}
                        onFocusCapture={e => e.currentTarget.style.borderColor = RED}
                        onBlurCapture={e => e.currentTarget.style.borderColor = t.line}>
                        <Mail size={14} color={t.lo} style={{ flexShrink: 0 }} />
                        <input type="email" placeholder="nama@ioh.co.id" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} autoComplete="email" />
                      </div>
                    </Field>

                    {/* Password */}
                    <Field label="Kata Sandi"
                      note={<span style={{ color: pwStrong && password ? t.ok : t.lo }}>min. 8 karakter</span>}>
                      <div style={{ ...fieldStyle, borderColor: password && !pwStrong ? t.red : t.line }}
                        onFocusCapture={e => e.currentTarget.style.borderColor = RED}
                        onBlurCapture={e => e.currentTarget.style.borderColor = password && !pwStrong ? t.red : t.line}>
                        <Lock size={14} color={t.lo} style={{ flexShrink: 0 }} />
                        <input type={showPw ? "text" : "password"} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} autoComplete="new-password" />
                        <button type="button" onClick={() => setShowPw(p => !p)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", flexShrink: 0, color: showPw ? RED : t.lo }}>
                          {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </Field>

                    {/* Confirm */}
                    <Field label="Konfirmasi Kata Sandi">
                      <div style={{ ...fieldStyle, borderColor: confirm && !pwMatch ? t.red : t.line }}
                        onFocusCapture={e => e.currentTarget.style.borderColor = pwMatch || !confirm ? RED : t.red}
                        onBlurCapture={e => e.currentTarget.style.borderColor = confirm && !pwMatch ? t.red : t.line}>
                        <Lock size={14} color={t.lo} style={{ flexShrink: 0 }} />
                        <input type="password" placeholder="••••••••" value={confirm} onChange={e => setConfirm(e.target.value)} style={inputStyle} autoComplete="new-password" />
                      </div>
                      <AnimatePresence>
                        {confirm && !pwMatch && (
                          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            style={{ fontSize: 11.5, fontWeight: 600, color: t.red }}>
                            Kata sandi tidak cocok
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </Field>

                    <button onClick={() => { setErrMsg(""); setStep(2); }} disabled={!step1Valid}
                      style={{ marginTop: 6, width: "100%", height: 46, borderRadius: 10, border: "none", background: step1Valid ? `linear-gradient(135deg,${RED},${MAGA})` : t.lo, color: "#fff", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: step1Valid ? "pointer" : "not-allowed", fontFamily: FONT, boxShadow: step1Valid ? `0 4px 18px rgba(237,28,36,0.22)` : "none", transition: "background 0.2s, box-shadow 0.2s" }}>
                      Lanjut ke Profil <ArrowRight size={14} strokeWidth={2.5} />
                    </button>
                  </motion.div>
                )}

                {/* ── Step 2: Profil ────────────────────────────────────── */}
                {step === 2 && (
                  <motion.div key="step2"
                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.22 }}
                    style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                    <div style={{ marginBottom: 4 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: t.hi, letterSpacing: "-0.02em" }}>Lengkapi Profil</div>
                      <div style={{ marginTop: 2, fontSize: 13, color: t.mid }}>Nama dan jabatan kamu di MartaHub</div>
                    </div>

                    {/* Name */}
                    <Field label="Nama Lengkap">
                      <div style={{ ...fieldStyle }}
                        onFocusCapture={e => e.currentTarget.style.borderColor = RED}
                        onBlurCapture={e => e.currentTarget.style.borderColor = t.line}>
                        <User size={14} color={t.lo} style={{ flexShrink: 0 }} />
                        <input type="text" placeholder="Nama sesuai KTP" value={fullName} onChange={e => setFullName(e.target.value)} style={inputStyle} />
                      </div>
                    </Field>

                    {/* Role */}
                    <Field label="Role / Jabatan">
                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        {ROLES.map(r => (
                          <button key={r.value} type="button" onClick={() => { setRole(r.value); setBrand(""); }}
                            style={{
                              display: "flex", alignItems: "center", gap: 12,
                              padding: "10px 13px", borderRadius: 10,
                              border: `1.5px solid ${role === r.value ? RED : t.line}`,
                              background: role === r.value ? t.chipA : t.fieldBg,
                              cursor: "pointer", textAlign: "left", transition: "border-color 0.15s, background 0.15s",
                            }}>
                            <div style={{
                              width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                              border: `2px solid ${role === r.value ? RED : t.line}`,
                              background: role === r.value ? RED : "transparent",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              transition: "all 0.15s",
                            }}>
                              {role === r.value && <Check size={10} color="#fff" strokeWidth={3} />}
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: t.hi }}>{r.label}</div>
                              <div style={{ fontSize: 11, color: t.mid }}>{r.desc}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </Field>

                    {/* Brand (conditional) */}
                    <AnimatePresence>
                      {needsBrand && (
                        <motion.div key="brand"
                          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }}>
                          <Field label="Brand">
                            <div style={{ display: "flex", gap: 8 }}>
                              {BRANDS.map(b => (
                                <button key={b} type="button" onClick={() => setBrand(b)}
                                  style={{ flex: 1, height: 40, borderRadius: 10, border: `1.5px solid ${brand === b ? RED : t.line}`, background: brand === b ? t.chipA : t.fieldBg, cursor: "pointer", fontSize: 13, fontWeight: 700, color: brand === b ? RED : t.mid, fontFamily: FONT, transition: "all 0.15s" }}>
                                  {b}
                                </button>
                              ))}
                            </div>
                          </Field>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Auth code */}
                    <Field label="Kode Registrasi"
                      note={<span style={{ color: t.mid, fontWeight: 500 }}>opsional</span>}>
                      <div style={{ ...fieldStyle }}
                        onFocusCapture={e => e.currentTarget.style.borderColor = RED}
                        onBlurCapture={e => e.currentTarget.style.borderColor = t.line}>
                        <Building2 size={14} color={t.lo} style={{ flexShrink: 0 }} />
                        <input type="text" placeholder="Contoh: MH-XXXX" value={authCode}
                          onChange={e => setAuthCode(e.target.value.toUpperCase())}
                          style={{ ...inputStyle, letterSpacing: "0.1em" }} />
                      </div>
                      <span style={{ fontSize: 11, color: t.mid, fontWeight: 500 }}>Diberikan oleh admin atau Head TM</span>
                    </Field>

                    <button onClick={handleRegister} disabled={!step2Valid || loading}
                      style={{ marginTop: 6, width: "100%", height: 46, borderRadius: 10, border: "none", background: step2Valid && !loading ? `linear-gradient(135deg,${RED},${MAGA})` : t.lo, color: "#fff", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: step2Valid && !loading ? "pointer" : "not-allowed", fontFamily: FONT, boxShadow: step2Valid && !loading ? `0 4px 18px rgba(237,28,36,0.22)` : "none", transition: "background 0.2s, box-shadow 0.2s" }}>
                      {loading ? <Loader2 size={16} style={{ animation: "spin .85s linear infinite" }} /> : <><span>Daftar Sekarang</span><ArrowRight size={14} strokeWidth={2.5} /></>}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div style={{ padding: "12px 28px", borderTop: `1px solid ${t.line}`, background: d ? "rgba(255,255,255,0.018)" : "rgba(0,0,0,0.018)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <span style={{ fontSize: 13, color: t.mid }}>Sudah punya akun?</span>
              <button onClick={() => router.push("/marta/login")} style={{ fontSize: 13, fontWeight: 700, border: "none", padding: 0, cursor: "pointer", background: "none", color: RED, fontFamily: FONT }}>
                Masuk
              </button>
            </div>
          </div>
        ) : (
          /* ── Step 3: Done ─────────────────────────────────────────────── */
          <motion.div key="done"
            initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.38, ease: [0.25, 0.46, 0.45, 0.94] }}>
            <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 18, boxShadow: t.card$, overflow: "hidden" }}>
              <div style={{ height: 3, background: `linear-gradient(90deg,${t.ok},#34D399)` }} />
              <div style={{ padding: "36px 28px 32px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14 }}>

                {/* Check circle */}
                <div style={{ width: 68, height: 68, borderRadius: "50%", background: t.okBg, border: `1.5px solid ${t.okBd}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Check size={30} color={t.ok} strokeWidth={2.5} />
                </div>

                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: t.hi, letterSpacing: "-0.03em", marginBottom: 6 }}>Pendaftaran Berhasil!</div>
                  <div style={{ fontSize: 13.5, color: t.mid, lineHeight: 1.65, maxWidth: 300 }}>
                    Akun kamu sudah dibuat dan menunggu verifikasi admin.<br />
                    Proses aktivasi biasanya 1×24 jam kerja.
                  </div>
                </div>

                {/* Email badge */}
                <div style={{ width: "100%", background: t.fieldBg, border: `1px solid ${t.line}`, borderRadius: 10, padding: "12px 16px", textAlign: "left" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: t.mid, marginBottom: 4 }}>Email terdaftar</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: t.hi }}>{email}</div>
                </div>

                <button onClick={() => router.push("/marta/login")}
                  style={{ marginTop: 4, width: "100%", height: 46, borderRadius: 10, border: "none", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT, boxShadow: `0 4px 18px rgba(237,28,36,0.22)` }}>
                  Ke Halaman Login
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {step < 3 && (
          <div style={{ marginTop: 18, textAlign: "center", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: t.lo, opacity: 0.35, fontWeight: 600 }}>
            © 2026 MartaHub · Marketing Sumatera
          </div>
        )}
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
        button { transition: opacity 0.14s, transform 0.12s; font-family: ${FONT}; }
        button:hover:not(:disabled) { opacity: 0.84; }
        button:active:not(:disabled) { transform: scale(0.97); }
        @media (max-width: 480px) {
          input { font-size: 16px !important; }
        }
      `}</style>
    </div>
  );
}
