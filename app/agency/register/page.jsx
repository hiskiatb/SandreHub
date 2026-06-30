"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "../../../lib/supabase";
import { generateOTP } from "../../../lib/email/otp";
import { sendOTPEmail } from "../../../lib/email/sendOTP";
import { HubLogo } from "../../../components/HubLogo";
import { Mail, Lock, Eye, EyeOff, User, KeyRound, Loader2, AlertCircle, CheckCircle2, Sun, Moon, ArrowLeft, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24"; const MAGA = "#C6168D"; const TEAL = "#1A9E90";

const mk = (d) => ({
  bg: d ? "#0A0A0B" : "#F4F4F6", card: d ? "#141417" : "#FFFFFF", line: d ? "#22222A" : "#E4E2EA",
  hi: d ? "#F0F0F2" : "#111116", mid: d ? "#8A8A96" : "#5A5A68", lo: d ? "#4A4A58" : "#C8C5D0",
  fieldBg: d ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)",
  red: d ? "#F87171" : "#DC2626", redBg: d ? "rgba(248,113,113,0.10)" : "rgba(220,38,38,0.07)", redBd: d ? "rgba(248,113,113,0.25)" : "rgba(220,38,38,0.20)",
  okBg: d ? "rgba(26,158,144,0.12)" : "rgba(26,158,144,0.08)", okBd: d ? "rgba(26,158,144,0.3)" : "rgba(26,158,144,0.25)",
  card$: d ? "0 24px 60px rgba(0,0,0,0.65)" : "0 8px 40px rgba(0,0,0,0.10)",
});

export default function AgencyRegisterPage() {
  const router = useRouter();
  const [d, setD] = useState(true);
  const t = mk(d);
  const [f, setF] = useState({ full_name: "", email: "", password: "", code: "" });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [agencyName, setAgencyName] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const set = (k, v) => { setF((p) => ({ ...p, [k]: v })); setErrMsg(""); if (k === "code") setAgencyName(""); };

  async function checkCode() {
    if (!f.code.trim()) { setErrMsg("Masukkan kode agency."); return; }
    setChecking(true); setErrMsg(""); setAgencyName("");
    try {
      const res = await fetch("/api/agency/validate-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: f.code.trim() }) });
      const data = await res.json();
      if (data.valid) setAgencyName(data.agency_name);
      else setErrMsg(data.message || "Kode tidak valid.");
    } catch { setErrMsg("Gagal memeriksa kode."); }
    finally { setChecking(false); }
  }

  async function submit() {
    setErrMsg("");
    const email = f.email.trim().toLowerCase();
    if (!f.full_name.trim() || !email || !f.password || !f.code.trim()) { setErrMsg("Lengkapi semua kolom."); return; }
    if (f.password.length < 8) { setErrMsg("Kata sandi minimal 8 karakter."); return; }
    setLoading(true);
    try {
      // pastikan kode valid
      const vr = await fetch("/api/agency/validate-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: f.code.trim() }) });
      const vd = await vr.json();
      if (!vd.valid) { setErrMsg(vd.message || "Kode agency tidak valid."); setLoading(false); return; }
      setAgencyName(vd.agency_name);

      // cek email belum terdaftar
      const { data: dup } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
      if (dup) { setErrMsg("Email sudah terdaftar. Silakan masuk."); setLoading(false); return; }

      // kirim OTP
      const otp = generateOTP();
      const { error: otpErr } = await supabase.from("email_otps").insert({ email, otp: String(otp), expires_at: new Date(Date.now() + 600_000).toISOString(), verified: false });
      if (otpErr) throw otpErr;
      const res = await sendOTPEmail(email, otp);
      if (!res.success) throw new Error(res.error);

      sessionStorage.setItem("pending_reg", JSON.stringify({
        email, password: f.password, full_name: f.full_name.trim(),
        role: "agency", agency_code: f.code.trim(),
      }));
      router.push(`/verify?email=${encodeURIComponent(email)}`);
    } catch (e) { setErrMsg(e.message || "Gagal memproses pendaftaran."); setLoading(false); }
  }

  const fieldStyle = { display: "flex", alignItems: "center", gap: 10, height: 46, padding: "0 14px", borderRadius: 10, background: t.fieldBg, border: `1.5px solid ${t.line}` };
  const inputStyle = { flex: 1, minWidth: 0, height: "100%", background: "transparent", border: "none", outline: "none", fontSize: 14, fontWeight: 500, color: t.hi, fontFamily: FONT };

  return (
    <div style={{ minHeight: "100svh", fontFamily: FONT, background: t.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "28px 20px", position: "relative", WebkitFontSmoothing: "antialiased" }}>
      <div style={{ position: "fixed", top: 18, left: 18, zIndex: 50 }}>
        <button onClick={() => router.push("/login")} style={{ display: "flex", alignItems: "center", gap: 6, background: d ? "rgba(20,20,23,0.9)" : "rgba(255,255,255,0.9)", border: `1px solid ${t.line}`, borderRadius: 10, padding: "8px 14px", cursor: "pointer", color: t.mid, fontSize: 13, fontWeight: 600, fontFamily: FONT }}>
          <ArrowLeft size={14} /> Ganti Hub
        </button>
      </div>
      <button onClick={() => setD(!d)} style={{ position: "fixed", top: 18, right: 18, zIndex: 50, width: 36, height: 36, borderRadius: 10, border: `1px solid ${t.line}`, background: d ? "rgba(20,20,23,0.9)" : "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", justifyContent: "center", color: t.mid, cursor: "pointer" }}>
        {d ? <Sun size={15} /> : <Moon size={15} />}
      </button>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42 }} style={{ width: "100%", maxWidth: 420, position: "relative", zIndex: 1 }}>
        <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 18, boxShadow: t.card$, overflow: "hidden" }}>
          <div style={{ height: 3, background: `linear-gradient(90deg,${RED},${MAGA})` }} />
          <div style={{ padding: "28px 28px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
              <HubLogo variant="sandra" size={48} dark={d} shadow inBox pad={3} />
              <div>
                <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.04em", color: t.hi, lineHeight: 1.1 }}>Daftar Agency</div>
                <div style={{ marginTop: 3, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: t.mid }}>Pemenuhan Manpower</div>
              </div>
            </div>

            <AnimatePresence>
              {errMsg && (
                <motion.div key="e" initial={{ opacity: 0, height: 0, marginBottom: 0 }} animate={{ opacity: 1, height: "auto", marginBottom: 14 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  style={{ padding: "9px 13px", borderRadius: 10, background: t.redBg, border: `1px solid ${t.redBd}`, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, color: t.red, overflow: "hidden" }}>
                  <AlertCircle size={13} style={{ flexShrink: 0 }} />{errMsg}
                </motion.div>
              )}
            </AnimatePresence>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={lbl(t)}>Kode Agency</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ ...fieldStyle, flex: 1 }}>
                    <KeyRound size={14} color={t.lo} />
                    <input value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="AGN-XXXX-XXXX" style={inputStyle} />
                  </div>
                  <button onClick={checkCode} disabled={checking} style={{ height: 46, padding: "0 14px", borderRadius: 10, border: `1px solid ${t.line}`, background: t.fieldBg, color: t.hi, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" }}>
                    {checking ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : "Cek"}
                  </button>
                </div>
                {agencyName && <div style={{ marginTop: 7, padding: "7px 11px", borderRadius: 9, background: t.okBg, border: `1px solid ${t.okBd}`, display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: TEAL }}><CheckCircle2 size={13} /> {agencyName}</div>}
              </div>

              <div><label style={lbl(t)}>Nama Lengkap (PIC)</label>
                <div style={fieldStyle}><User size={14} color={t.lo} /><input value={f.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Nama PIC agency" style={inputStyle} /></div>
              </div>
              <div><label style={lbl(t)}>Email</label>
                <div style={fieldStyle}><Mail size={14} color={t.lo} /><input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="nama@agency.com" style={inputStyle} autoComplete="email" /></div>
              </div>
              <div><label style={lbl(t)}>Kata Sandi</label>
                <div style={fieldStyle}><Lock size={14} color={t.lo} />
                  <input type={showPw ? "text" : "password"} value={f.password} onChange={(e) => set("password", e.target.value)} placeholder="Minimal 8 karakter" style={inputStyle} autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPw((p) => !p)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: showPw ? RED : t.lo }}>{showPw ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                </div>
              </div>
            </div>

            <button onClick={submit} disabled={loading} style={{ marginTop: 20, width: "100%", height: 46, borderRadius: 10, border: "none", background: loading ? `${RED}55` : `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: loading ? "not-allowed" : "pointer", fontFamily: FONT }}>
              {loading ? <Loader2 size={16} style={{ animation: "spin .85s linear infinite" }} /> : <><span>Daftar & Kirim OTP</span><ArrowRight size={14} strokeWidth={2.5} /></>}
            </button>
          </div>
          <div style={{ padding: "12px 28px", borderTop: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: t.mid }}>Sudah punya akun?</span>
            <button onClick={() => router.push("/sandra/login")} style={{ fontSize: 13, fontWeight: 700, border: "none", padding: 0, cursor: "pointer", background: "none", color: RED, fontFamily: FONT }}>Masuk</button>
          </div>
        </div>
      </motion.div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0} body{margin:0}
        input::placeholder{opacity:0.4} @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
    </div>
  );
}

const lbl = (t) => ({ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.mid, marginBottom: 5, display: "block" });
