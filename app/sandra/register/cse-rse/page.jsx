"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import supabase from "../../../../lib/supabase";
import { generateOTP } from "../../../../lib/email/otp";
import { sendOTPEmail } from "../../../../lib/email/sendOTP";
import { HubLogo } from "../../../../components/HubLogo";
import { Mail, Loader2, ShieldCheck, Lock, User, Eye, EyeOff, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED  = "#ED1C24";
const TEAL = "#32BCAD";

const mk = (d) => ({
  bg:     d ? "#0A0A0B" : "#F4F4F6",
  card:   d ? "#141417" : "#FFFFFF",
  line:   d ? "#22222A" : "#E4E2EA",
  hi:     d ? "#F0F0F2" : "#111116",
  mid:    d ? "#7A7A88" : "#5A5A68",
  fieldBg:d ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)",
  red:    d ? "#F87171" : "#DC2626",
  redBg:  d ? "rgba(248,113,113,0.10)" : "rgba(220,38,38,0.07)",
  redBd:  d ? "rgba(248,113,113,0.25)" : "rgba(220,38,38,0.20)",
  tealBg: d ? "rgba(50,188,173,0.10)" : "rgba(50,188,173,0.07)",
  tealBd: d ? "rgba(50,188,173,0.28)" : "rgba(50,188,173,0.20)",
});

// Registrasi khusus CSE/RSE — LEBIH SEDERHANA dari /sandra/register (tanpa
// pilih role/kode otoritas manual) karena SPM Sumatera sudah men-assign
// email + MC lewat menu "Mapping CSE/RSE" di dashboard. Alurnya: masukkan
// email -> kalau sudah dipetakan SPM, kirim OTP -> isi nama & kata sandi ->
// akun langsung aktif & otomatis masuk (sesi tersimpan, tidak perlu OTP lagi
// di login berikutnya karena supabase client persistSession:true).
function CseRseRegisterInner() {
  const router = useRouter();
  const [d, setD] = useState(true);
  const [stage, setStage] = useState("email"); // email | otp
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const t = mk(d);

  useEffect(() => { setD(localStorage.getItem("hub-theme") !== "light"); }, []);

  const sendOtp = async (cleanEmail) => {
    const code = generateOTP();
    const { error: otpErr } = await supabase.from("email_otps").insert({
      email: cleanEmail, otp: String(code),
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      verified: false,
    });
    if (otpErr) throw otpErr;
    const res = await sendOTPEmail(cleanEmail, code);
    if (!res.success) throw new Error(res.error || "Gagal mengirim OTP.");
  };

  const handleCheckEmail = async () => {
    setErrMsg("");
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) { setErrMsg("Format email tidak valid."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/cse-mapping/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "check", email: clean }),
      });
      const json = await res.json();
      if (!json.success) { setErrMsg(json.message || "Email tidak dapat digunakan."); return; }
      await sendOtp(clean);
      setStage("otp");
    } catch (e) { setErrMsg(e.message || "Terjadi kesalahan."); }
    finally { setLoading(false); }
  };

  const handleResend = async () => {
    setResending(true); setErrMsg("");
    try { await sendOtp(email.trim().toLowerCase()); }
    catch (e) { setErrMsg(e.message || "Gagal mengirim ulang OTP."); }
    finally { setResending(false); }
  };

  const handleActivate = async () => {
    setErrMsg("");
    if (!fullName.trim()) { setErrMsg("Nama lengkap wajib diisi."); return; }
    if (otp.trim().length !== 6) { setErrMsg("Kode OTP terdiri dari 6 digit."); return; }
    if (password.length < 8) { setErrMsg("Kata sandi minimal 8 karakter."); return; }
    setLoading(true);
    try {
      const clean = email.trim().toLowerCase();
      const res = await fetch("/api/cse-mapping/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "verify", email: clean, otp: otp.trim(), password, full_name: fullName.trim() }),
      });
      const json = await res.json();
      if (!json.success) { setErrMsg(json.message || "Gagal mengaktifkan akun."); return; }

      // Langsung masuk — sesi tersimpan otomatis (persistSession), jadi
      // login berikutnya cukup email+password tanpa OTP lagi.
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: clean, password });
      if (signInErr) { router.push("/sandra/login?verified=1"); return; }
      router.push("/dashboard");
    } catch (e) { setErrMsg(e.message || "Terjadi kesalahan."); }
    finally { setLoading(false); }
  };

  const inputStyle = {
    width: "100%", height: 50, borderRadius: 13, border: `1px solid ${t.line}`,
    background: t.fieldBg, color: t.hi, fontFamily: FONT, fontSize: 14.5,
    padding: "0 14px 0 42px", outline: "none",
  };

  return (
    <div style={{ minHeight: "100dvh", background: t.bg, fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420, background: t.card, border: `1px solid ${t.line}`, borderRadius: 22, padding: "36px 30px", boxShadow: d ? "0 24px 60px rgba(0,0,0,0.65)" : "0 8px 40px rgba(0,0,0,0.10)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <HubLogo variant="sandra" size={54} dark={d} shadow inBox />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.03em", color: t.hi }}>
              Aktivasi Akun <span style={{ background: `linear-gradient(90deg,${RED},#C6168D)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>CSE/RSE</span>
            </div>
            <div style={{ marginTop: 5, fontSize: 11.5, color: t.mid }}>
              {stage === "email" ? "Email Anda harus sudah dipetakan oleh SPM Sumatera" : `Kode OTP dikirim ke ${email}`}
            </div>
          </div>
        </div>

        {errMsg && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", borderRadius: 11, background: t.redBg, border: `1px solid ${t.redBd}`, marginBottom: 16, fontSize: 12.5, color: t.red }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            {errMsg}
          </div>
        )}

        {stage === "email" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ position: "relative" }}>
              <Mail size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: t.mid }} />
              <input type="email" placeholder="Email CSE/RSE Anda" value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCheckEmail()}
                style={inputStyle} />
            </div>
            <button onClick={handleCheckEmail} disabled={loading}
              style={{ height: 50, borderRadius: 13, border: "none", background: `linear-gradient(90deg,${RED},#C6168D)`, color: "#fff", fontFamily: FONT, fontWeight: 700, fontSize: 14.5, cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {loading ? <Loader2 size={17} className="spin" /> : "Kirim Kode OTP"}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ position: "relative" }}>
              <User size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: t.mid }} />
              <input type="text" placeholder="Nama Lengkap" value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ position: "relative" }}>
              <ShieldCheck size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: t.mid }} />
              <input type="text" inputMode="numeric" maxLength={6} placeholder="Kode OTP (6 digit)" value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} style={{ ...inputStyle, letterSpacing: "0.3em", fontWeight: 700 }} />
            </div>
            <div style={{ position: "relative" }}>
              <Lock size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: t.mid }} />
              <input type={showPw ? "text" : "password"} placeholder="Buat Kata Sandi (min. 8 karakter)" value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleActivate()}
                style={{ ...inputStyle, paddingRight: 42 }} />
              <button type="button" onClick={() => setShowPw((v) => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: t.mid, cursor: "pointer", display: "flex" }}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <button onClick={handleActivate} disabled={loading}
              style={{ height: 50, borderRadius: 13, border: "none", background: `linear-gradient(90deg,${TEAL},#1A9E90)`, color: "#fff", fontFamily: FONT, fontWeight: 700, fontSize: 14.5, cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {loading ? <Loader2 size={17} className="spin" /> : <><CheckCircle2 size={17} /> Aktifkan Akun</>}
            </button>
            <button onClick={handleResend} disabled={resending}
              style={{ height: 40, borderRadius: 11, border: `1px solid ${t.line}`, background: "transparent", color: t.mid, fontFamily: FONT, fontWeight: 600, fontSize: 12.5, cursor: resending ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <RefreshCw size={13} className={resending ? "spin" : ""} /> {resending ? "Mengirim ulang…" : "Kirim ulang OTP"}
            </button>
          </div>
        )}
      </div>
      <style>{`.spin{animation:sh-spin 1s linear infinite}@keyframes sh-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export default function CseRseRegisterPage() {
  return (
    <Suspense fallback={null}>
      <CseRseRegisterInner />
    </Suspense>
  );
}
