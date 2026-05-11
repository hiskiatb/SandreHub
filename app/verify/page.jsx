"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import supabase from "../../lib/supabase";
import { generateOTP } from "../../lib/email/otp";
import { sendOTPEmail } from "../../lib/email/sendOTP";
import {
  Box, Sun, Moon, Loader2, ChevronLeft,
  MailOpen, ShieldCheck, RefreshCw, Edit3, AlertCircle,
} from "lucide-react";

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
  greenBg: d ? "rgba(46,209,88,0.10)"  : "rgba(22,163,74,0.08)",
  greenBd: d ? "rgba(46,209,88,0.22)"  : "rgba(22,163,74,0.18)",
  red:     d ? "#FF453A" : "#DC2626",
  redBg:   d ? "rgba(255,69,58,0.09)"  : "rgba(220,38,38,0.07)",
  redBd:   d ? "rgba(255,69,58,0.22)"  : "rgba(220,38,38,0.18)",
  shadow:  d ? "0 24px 60px rgba(0,0,0,0.65)" : "0 24px 60px rgba(0,0,0,0.10)",
  ring:    d ? "0 0 0 1px rgba(255,255,255,0.045)" : "0 0 0 1px rgba(0,0,0,0.055)",
});

// ─── Global CSS ───────────────────────────────────────────────────────────────
const GlobalStyle = ({ d }) => (
  <style>{`
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { -webkit-text-size-adjust: 100%; }
    body { margin: 0; }
    input, select, textarea { font-size: 16px !important; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-thumb {
      background: ${d ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)"};
      border-radius: 99px;
    }
    @keyframes sh-spin { to { transform: rotate(360deg); } }
    .sh-spin { animation: sh-spin 0.9s linear infinite; }
    .sh-btn { transition: transform 0.12s ease, opacity 0.12s ease; cursor: pointer; }
    .sh-btn:hover:not(:disabled) { opacity: 0.85; }
    .sh-btn:active:not(:disabled) { transform: scale(0.97); }
    /* OTP cell */
    .otp-cell {
      transition: border-color 0.15s, box-shadow 0.15s;
      text-align: center;
      caret-color: #0A84FF;
    }
    .otp-cell:focus {
      outline: none;
      border-color: #0A84FF !important;
      box-shadow: 0 0 0 3px rgba(10,132,255,0.18) !important;
    }
    .otp-cell-error {
      border-color: #FF453A !important;
      box-shadow: 0 0 0 3px rgba(255,69,58,0.16) !important;
    }
  `}</style>
);

// ─── Verify Content ───────────────────────────────────────────────────────────
function VerifyContent() {
  const router     = useRouter();
  const params     = useSearchParams();
  const emailParam = params.get("email");
  const inputRefs  = useRef([]);

  const [otp,      setOtp]      = useState(Array(6).fill(""));
  const [loading,  setLoading]  = useState(false);
  const [resending,setResending]= useState(false);
  const [errMsg,   setErrMsg]   = useState("");
  const [d,        setD]        = useState(true);
  const [timer,    setTimer]    = useState(60);
  const [canResend,setCanResend]= useState(false);
  const [pending,  setPending]  = useState(null);
  const [done,     setDone]     = useState(false);   // success state

  useEffect(() => {
    const v = localStorage.getItem("sh-theme");
    setD(v ? v === "dark" : true);
    const raw = sessionStorage.getItem("pending_reg");
    if (raw) setPending(JSON.parse(raw));
    else if (!emailParam) router.replace("/register");
  }, [emailParam, router]);

  // Countdown
  useEffect(() => {
    if (timer <= 0) { setCanResend(true); return; }
    const id = setTimeout(() => setTimer((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [timer]);

  const t = mk(d);

  // ── OTP handlers ────────────────────────────────────────────────────────────
  const handleChange = (el, i) => {
    if (!/^\d?$/.test(el.value)) return;
    const next = [...otp]; next[i] = el.value; setOtp(next);
    setErrMsg("");
    if (el.value && i < 5) inputRefs.current[i + 1]?.focus();
  };

  const handleKeyDown = (e, i) => {
    if (e.key === "Backspace") {
      if (otp[i]) {
        const next = [...otp]; next[i] = ""; setOtp(next);
      } else if (i > 0) {
        inputRefs.current[i - 1]?.focus();
      }
    }
    if (e.key === "ArrowLeft"  && i > 0) inputRefs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) inputRefs.current[i + 1]?.focus();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const next  = Array(6).fill("");
    paste.split("").forEach((c, i) => { next[i] = c; });
    setOtp(next);
    const focus = Math.min(paste.length, 5);
    inputRefs.current[focus]?.focus();
  };

  // ── Resend ───────────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (!canResend || !emailParam) return;
    setResending(true); setErrMsg("");
    try {
      const newOtp = generateOTP();
      const { error } = await supabase.from("email_otps").insert({
        email: emailParam, otp: String(newOtp),
        expires_at: new Date(Date.now() + 600_000).toISOString(), verified: false,
      });
      if (error) throw error;
      const res = await sendOTPEmail(emailParam, newOtp);
      if (!res.success) throw new Error(res.error);
      setTimer(60); setCanResend(false);
      setOtp(Array(6).fill(""));
      inputRefs.current[0]?.focus();
    } catch { setErrMsg("Gagal kirim ulang kode."); }
    finally { setResending(false); }
  };

  // ── Verify ────────────────────────────────────────────────────────────────────
  const handleVerify = async () => {
    const full = otp.join("");
    if (full.length < 6) { setErrMsg("Masukkan 6 digit kode OTP."); return; }
    setLoading(true); setErrMsg("");
    try {
      const res  = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailParam?.trim().toLowerCase(), otp: full, ...pending }),
      });
      const data = await res.json();
      if (data.success) {
        sessionStorage.removeItem("pending_reg");
        setDone(true);
        setTimeout(() => router.push("/login?verified=true"), 1400);
      } else {
        setErrMsg(data.message || "Kode OTP salah atau sudah kadaluarsa.");
        setOtp(Array(6).fill(""));
        setTimeout(() => inputRefs.current[0]?.focus(), 80);
      }
    } catch { setErrMsg("Terjadi gangguan sistem."); }
    finally { setLoading(false); }
  };

  const isErr = !!errMsg && !done;

  return (
    <div style={{
      minHeight: "100svh", background: t.bg, color: t.hi,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "24px 16px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif",
      WebkitFontSmoothing: "antialiased",
      transition: "background 0.3s",
    }}>
      <GlobalStyle d={d} />

      {/* ── Theme Toggle ── */}
      <button className="sh-btn"
        onClick={() => { const n = !d; setD(n); localStorage.setItem("sh-theme", n ? "dark" : "light"); }}
        style={{
          position: "fixed", top: 20, right: 20, zIndex: 50,
          width: 40, height: 40, borderRadius: 12,
          border: `1px solid ${t.line}`, background: t.card,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: t.mid, boxShadow: t.ring,
        }}>
        {d ? <Sun size={17} strokeWidth={2} /> : <Moon size={17} strokeWidth={2} />}
      </button>

      {/* ── Wrapper ── */}
      <motion.div
        initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: "100%", maxWidth: 420 }}
      >
        {/* ── Logo & Branding ── */}
        <div style={{
          display: "flex", flexDirection: "column",
          alignItems: "center", gap: 16, marginBottom: 32,
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

            {/* Icon + heading */}
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: done ? t.greenBg : t.blueBg,
                border: `1px solid ${done ? t.greenBd : t.blueBd}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 18px",
                transition: "background 0.3s, border-color 0.3s",
              }}>
                {done
                  ? <ShieldCheck size={26} style={{ color: t.green }} strokeWidth={2} />
                  : <MailOpen    size={26} style={{ color: t.blue  }} strokeWidth={2} />
                }
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em" }}>
                {done ? "Akun Terverifikasi!" : "Verifikasi Email"}
              </div>
              {!done && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 13.5, color: t.mid, marginBottom: 8 }}>
                    Kode 6 digit dikirim ke
                  </div>
                  {/* Email badge */}
                  <div style={{
                    display: "inline-block",
                    padding: "8px 16px", borderRadius: 10,
                    background: t.blueBg, border: `1px solid ${t.blueBd}`,
                    fontSize: 13.5, fontWeight: 700, color: t.hi,
                    wordBreak: "break-all", maxWidth: "100%",
                  }}>
                    {emailParam}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <button className="sh-btn" onClick={() => router.push("/register")}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        fontSize: 12, fontWeight: 700, color: t.blue,
                        background: "none", border: "none", padding: 0,
                        letterSpacing: "0.02em",
                      }}>
                      <Edit3 size={12} strokeWidth={2} />Ubah alamat email
                    </button>
                  </div>
                </div>
              )}
              {done && (
                <div style={{ marginTop: 8, fontSize: 13.5, color: t.mid }}>
                  Mengalihkan ke halaman login…
                </div>
              )}
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

            {/* OTP inputs */}
            {!done && (
              <>
                <div
  onPaste={handlePaste}
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
    gap: 8,
    marginBottom: 24,
    width: "100%",
    maxWidth: "100%",
  }}
>
                  {otp.map((val, i) => (
                    <input
                      key={i}
                      ref={(el) => (inputRefs.current[i] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={val}
                      onChange={(e) => handleChange(e.target, i)}
                      onKeyDown={(e) => handleKeyDown(e, i)}
                      className={`otp-cell${isErr ? " otp-cell-error" : ""}`}
                      style={{
  width: "100%",
  minWidth: 0,
  height: 60,
  borderRadius: 14,
  border: `1.5px solid ${isErr ? t.red : t.line}`,
  background: d ? "rgba(255,255,255,0.045)" : t.sub,
  color: t.hi,
  fontSize: 24,
  fontWeight: 800,
  textAlign: "center",
  fontFamily: "inherit",
  boxSizing: "border-box",
}}
                    />
                  ))}
                </div>

                {/* CTA */}
                <button
                  className="sh-btn"
                  onClick={handleVerify} disabled={loading}
                  style={{
                    width: "100%", height: 52, borderRadius: 14, border: "none",
                    background: t.blue, color: "#fff",
                    fontSize: 14, fontWeight: 700, letterSpacing: "0.01em",
                    opacity: loading ? 0.72 : 1,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    boxShadow: `0 4px 20px rgba(10,132,255,${d ? 0.42 : 0.30})`,
                    marginBottom: 20,
                  }}
                >
                  {loading
                    ? <Loader2 size={18} className="sh-spin" />
                    : <><ShieldCheck size={16} strokeWidth={2.2} /><span>Verifikasi Akun</span></>
                  }
                </button>

                {/* Resend */}
                <div style={{ textAlign: "center" }}>
                  {canResend ? (
                    <button className="sh-btn" onClick={handleResend} disabled={resending}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 7,
                        fontSize: 13, fontWeight: 700, color: t.blue,
                        background: "none", border: "none", padding: 0,
                        opacity: resending ? 0.6 : 1,
                      }}>
                      {resending
                        ? <Loader2 size={14} className="sh-spin" />
                        : <RefreshCw size={14} strokeWidth={2.2} />
                      }
                      Kirim Ulang Kode
                    </button>
                  ) : (
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.lo }}>
                      Kirim ulang dalam{" "}
                      <span style={{ color: t.blue, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                        {timer}d
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "18px 32px",
            borderTop: `1px solid ${t.line}`,
            background: t.blueBg,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <button className="sh-btn" onClick={() => router.push("/register")}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                fontSize: 13.5, fontWeight: 700, color: t.blue,
                background: "none", border: "none", padding: 0,
              }}>
              <ChevronLeft size={15} strokeWidth={2.5} />Kembali ke Pendaftaran
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
  );
}

// ─── Page Export ──────────────────────────────────────────────────────────────
export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: "100svh", display: "flex",
        alignItems: "center", justifyContent: "center",
        background: "#07090D",
      }}>
        <Loader2 size={28} style={{ color: "#0A84FF" }} className="sh-spin" />
      </div>
    }>
      <VerifyContent />
    </Suspense>
  );
}