"use client";
/**
 * login-admin-mc/page.jsx — Login "Admin MC" via Email OTP (tanpa password).
 *
 * Alur:
 *  1. User masukkan email → dicek ke mf_dse_admin_mc_mapping (mf_dse_admin_mc_lookup).
 *     Kalau tidak terdaftar, ditolak di sini juga (tidak lanjut ke OTP).
 *  2. Kalau terdaftar → kirim kode OTP 6 digit via Supabase Auth
 *     (supabase.auth.signInWithOtp), tanpa bikin akun password.
 *  3. User masukkan kode → supabase.auth.verifyOtp() membentuk sesi asli
 *     (auth.uid() valid, dipakai semua RLS yang sudah ada).
 *  4. Panggil RPC mf_dse_admin_mc_login_apply() — menyamakan profiles.role
 *     ('finance_mpx') & partner_name (= MC) dgn mapping, lalu redirect ke
 *     /dashboard (otomatis cuma lihat menu yg relevan utk Admin MC, termasuk
 *     "DSE Prod. & AR").
 */
import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import supabase from "../../../lib/supabase";
import { HubLogo } from "../../../components/HubLogo";
import { Mail, KeyRound, Loader2, AlertCircle, Sun, Moon, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const TEAL = "#32BCAD";
const RED  = "#ED1C24";
const MAGA = "#C6168D";

const mk = (d) => ({
  bg: d ? "#0A0A0B" : "#F4F4F6", card: d ? "#141417" : "#FFFFFF", line: d ? "#22222A" : "#E4E2EA",
  hi: d ? "#F0F0F2" : "#111116", mid: d ? "#7A7A88" : "#5A5A68", lo: d ? "#4A4A58" : "#C8C5D0",
  fieldBg: d ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)",
  red: d ? "#F87171" : "#DC2626", redBg: d ? "rgba(248,113,113,0.10)" : "rgba(220,38,38,0.07)", redBd: d ? "rgba(248,113,113,0.25)" : "rgba(220,38,38,0.20)",
  tealBg: d ? "rgba(50,188,173,0.10)" : "rgba(50,188,173,0.07)", tealBd: d ? "rgba(50,188,173,0.28)" : "rgba(50,188,173,0.20)",
  card$: d ? "0 24px 60px rgba(0,0,0,0.65)" : "0 8px 40px rgba(0,0,0,0.10)",
});

function AdminMcLoginInner() {
  const router = useRouter();
  const [d, setD] = useState(true);
  const [stage, setStage] = useState("email"); // email | otp
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [mcName, setMcName] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const t = mk(d);

  useEffect(() => {
    setD(localStorage.getItem("hub-theme") !== "light");
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/dashboard");
      else setChecking(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSendOtp = async () => {
    setErrMsg("");
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setErrMsg("Masukkan email yang valid."); return; }
    setLoading(true);
    try {
      const { data: lookup, error: lookupErr } = await supabase.rpc("mf_dse_admin_mc_lookup", { p_email: cleanEmail });
      if (lookupErr || !lookup?.found) {
        setErrMsg("Email ini belum terdaftar sebagai Admin MC. Hubungi SPM untuk didaftarkan.");
        return;
      }
      setMcName(lookup.mc || "");
      const { error: otpErr } = await supabase.auth.signInWithOtp({ email: cleanEmail, options: { shouldCreateUser: true } });
      if (otpErr) { setErrMsg(otpErr.message || "Gagal mengirim kode OTP."); return; }
      setStage("otp");
    } catch {
      setErrMsg("Terjadi gangguan pada sistem.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setErrMsg("");
    const cleanOtp = otp.trim();
    if (!cleanOtp) { setErrMsg("Masukkan kode OTP."); return; }
    setLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const { error: verifyErr } = await supabase.auth.verifyOtp({ email: cleanEmail, token: cleanOtp, type: "email" });
      if (verifyErr) {
        setErrMsg(verifyErr.message?.toLowerCase().includes("expired") ? "Kode OTP sudah kedaluwarsa. Kirim ulang." : "Kode OTP salah atau sudah tidak berlaku.");
        return;
      }
      await supabase.rpc("mf_dse_admin_mc_login_apply").catch(() => {});
      router.refresh();
      router.push("/dashboard");
    } catch {
      setErrMsg("Terjadi gangguan pada sistem.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setErrMsg("");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
      if (error) setErrMsg(error.message || "Gagal mengirim ulang kode OTP.");
    } finally {
      setLoading(false);
    }
  };

  if (checking) return (
    <div style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0A0A0B" }}>
      <Loader2 size={26} color={TEAL} style={{ animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const fieldStyle = { display: "flex", alignItems: "center", gap: 10, height: 46, padding: "0 14px", borderRadius: 10, background: t.fieldBg, border: `1.5px solid ${t.line}` };
  const inputStyle = { flex: 1, minWidth: 0, height: "100%", background: "transparent", border: "none", outline: "none", fontSize: 14, fontWeight: 500, color: t.hi, fontFamily: FONT, WebkitAppearance: "none" };

  return (
    <div style={{ minHeight: "100svh", fontFamily: FONT, background: t.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "28px 20px", position: "relative", WebkitFontSmoothing: "antialiased" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-20%", left: "-10%", width: "60vw", height: "60vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(50,188,173,0.08) 0%,transparent 70%)", filter: "blur(2px)" }} />
        <div style={{ position: "absolute", inset: 0, background: d ? "radial-gradient(ellipse at 50% 50%,transparent 30%,rgba(10,10,11,0.7) 100%)" : "radial-gradient(ellipse at 50% 50%,transparent 30%,rgba(244,244,246,0.6) 100%)" }} />
      </div>

      <div style={{ position: "fixed", top: 18, left: 18, zIndex: 50 }}>
        <button onClick={() => router.push("/sandra/login")} style={{ display: "flex", alignItems: "center", gap: 6, background: d ? "rgba(20,20,23,0.9)" : "rgba(255,255,255,0.9)", border: `1px solid ${t.line}`, borderRadius: 10, padding: "8px 14px", cursor: "pointer", color: t.mid, fontSize: 13, fontWeight: 600, fontFamily: FONT, backdropFilter: "blur(20px)" }}>
          <ArrowLeft size={14} /> Kembali
        </button>
      </div>
      <button onClick={() => { const n = !d; setD(n); localStorage.setItem("hub-theme", n ? "dark" : "light"); }} style={{ position: "fixed", top: 18, right: 18, zIndex: 50, width: 36, height: 36, borderRadius: 10, border: `1px solid ${t.line}`, background: d ? "rgba(20,20,23,0.9)" : "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", justifyContent: "center", color: t.mid, cursor: "pointer" }}>
        {d ? <Sun size={15} /> : <Moon size={15} />}
      </button>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42 }} style={{ width: "100%", maxWidth: 400, position: "relative", zIndex: 1 }}>
        <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 18, boxShadow: t.card$, overflow: "hidden" }}>
          <div style={{ height: 3, background: `linear-gradient(90deg,${TEAL},${MAGA})` }} />
          <div style={{ padding: "28px 28px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 26 }}>
              <HubLogo variant="sandra" size={52} shadow inBox />
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.04em", color: t.hi, lineHeight: 1.1 }}>
                  Admin <span style={{ background: `linear-gradient(90deg,${TEAL},${MAGA})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>MC</span>
                </div>
                <div style={{ marginTop: 3, fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: t.mid }}>Login via Email OTP</div>
              </div>
            </div>

            <AnimatePresence>
              {errMsg && (
                <motion.div key="err" initial={{ opacity: 0, height: 0, marginBottom: 0 }} animate={{ opacity: 1, height: "auto", marginBottom: 14 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }} transition={{ duration: 0.18 }}
                  style={{ padding: "9px 13px", borderRadius: 10, background: t.redBg, border: `1px solid ${t.redBd}`, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, color: t.red, overflow: "hidden" }}>
                  <AlertCircle size={13} strokeWidth={2.2} style={{ flexShrink: 0 }} />{errMsg}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
              {stage === "email" ? (
                <motion.div key="s-email" initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.22 }}>
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: t.hi, letterSpacing: "-0.02em" }}>Masuk sebagai Admin MC</div>
                    <div style={{ marginTop: 3, fontSize: 13, color: t.mid }}>Tidak perlu kata sandi — masuk cukup dengan kode OTP yang dikirim ke email terdaftar.</div>
                  </div>
                  <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.mid }}>Email</label>
                  <div style={{ ...fieldStyle, marginTop: 5 }}>
                    <Mail size={14} color={t.lo} style={{ flexShrink: 0 }} />
                    <input type="email" placeholder="nama@email.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSendOtp()} style={inputStyle} autoComplete="email" autoFocus />
                  </div>
                  <button onClick={handleSendOtp} disabled={loading}
                    style={{ marginTop: 20, width: "100%", height: 46, borderRadius: 10, border: "none", background: loading ? `${TEAL}55` : `linear-gradient(135deg,${TEAL},#1A9E90)`, color: "#fff", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: loading ? "not-allowed" : "pointer", fontFamily: FONT }}>
                    {loading ? <Loader2 size={16} style={{ animation: "spin .85s linear infinite" }} /> : <><span>Kirim Kode OTP</span><ArrowRight size={14} strokeWidth={2.5} /></>}
                  </button>
                </motion.div>
              ) : (
                <motion.div key="s-otp" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 14 }} transition={{ duration: 0.22 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", borderRadius: 10, background: t.fieldBg, border: `1px solid ${t.line}`, marginBottom: 10 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <Mail size={14} color={t.lo} style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</span>
                    </span>
                    <button onClick={() => { setStage("email"); setOtp(""); setErrMsg(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: TEAL, fontSize: 12.5, fontWeight: 700, fontFamily: FONT, flexShrink: 0 }}>Ganti</button>
                  </div>

                  {mcName && (
                    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", borderRadius: 10, background: t.tealBg, border: `1px solid ${t.tealBd}`, marginBottom: 16 }}>
                      <CheckCircle2 size={15} color={TEAL} style={{ flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: t.hi }}>Terdaftar sebagai Admin MC</div>
                        <div style={{ fontSize: 11.5, color: t.mid }}>MC: {mcName}</div>
                      </div>
                    </div>
                  )}

                  <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.mid }}>Kode OTP (6 digit)</label>
                  <div style={{ ...fieldStyle, marginTop: 5 }}>
                    <KeyRound size={14} color={t.lo} style={{ flexShrink: 0 }} />
                    <input type="text" inputMode="numeric" maxLength={6} placeholder="••••••" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()} style={{ ...inputStyle, letterSpacing: 4 }} autoFocus />
                  </div>
                  <button onClick={handleVerifyOtp} disabled={loading}
                    style={{ marginTop: 20, width: "100%", height: 46, borderRadius: 10, border: "none", background: loading ? `${TEAL}55` : `linear-gradient(135deg,${TEAL},#1A9E90)`, color: "#fff", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: loading ? "not-allowed" : "pointer", fontFamily: FONT }}>
                    {loading ? <Loader2 size={16} style={{ animation: "spin .85s linear infinite" }} /> : <><span>Verifikasi & Masuk</span><ArrowRight size={14} strokeWidth={2.5} /></>}
                  </button>
                  <button onClick={handleResend} disabled={loading} style={{ marginTop: 12, width: "100%", background: "none", border: "none", cursor: "pointer", color: t.mid, fontSize: 12.5, fontWeight: 600, fontFamily: FONT }}>
                    Belum dapat kode? Kirim ulang
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        <div style={{ marginTop: 18, textAlign: "center", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: t.lo, opacity: 0.35, fontWeight: 600 }}>
          © 2026 SandraHub · Admin MC
        </div>
      </motion.div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0 }
        body { margin:0 }
        input::placeholder { opacity:0.4 }
        @keyframes spin { to { transform:rotate(360deg) } }
        button { transition: opacity 0.14s, transform 0.12s; }
        button:hover:not(:disabled) { opacity: 0.84; }
        button:active:not(:disabled) { transform: scale(0.97); }
      `}</style>
    </div>
  );
}

export default function AdminMcLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminMcLoginInner />
    </Suspense>
  );
}
