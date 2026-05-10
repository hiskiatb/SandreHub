"use client";

import { useState, useEffect } from "react";
import supabase from "../../lib/supabase";
import { Box, Mail, Lock, ArrowRight, Loader2, Sun, Moon, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

// ─── Design Tokens (seragam dengan seluruh sistem) ────────────────────────────
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
  red:     d ? "#FF453A" : "#DC2626",
  redBg:   d ? "rgba(255,69,58,0.09)"  : "rgba(220,38,38,0.07)",
  redBd:   d ? "rgba(255,69,58,0.22)"  : "rgba(220,38,38,0.18)",
  shadow:  d ? "0 24px 60px rgba(0,0,0,0.65)" : "0 24px 60px rgba(0,0,0,0.10)",
  ring:    d ? "0 0 0 1px rgba(255,255,255,0.045)" : "0 0 0 1px rgba(0,0,0,0.055)",
});

// ─── Global CSS ───────────────────────────────────────────────────────────────
// font-size 16px mencegah auto-zoom iOS; user tetap bisa pinch-zoom manual
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
    .sh-btn {
      transition: transform 0.12s ease, opacity 0.12s ease;
      cursor: pointer;
    }
    .sh-btn:hover:not(:disabled) { opacity: 0.88; }
    .sh-btn:active:not(:disabled) { transform: scale(0.97); }
    .sh-field { transition: border-color 0.15s, box-shadow 0.15s; }
    .sh-field:focus-within {
      border-color: #0A84FF !important;
      box-shadow: 0 0 0 3px rgba(10,132,255,0.16) !important;
    }
    .sh-field-error {
      border-color: #FF453A !important;
      box-shadow: 0 0 0 3px rgba(255,69,58,0.14) !important;
    }
    .sh-field-error:focus-within {
      border-color: #FF453A !important;
      box-shadow: 0 0 0 3px rgba(255,69,58,0.18) !important;
    }
  `}</style>
);

export default function LoginPage() {
  const router = useRouter();
  const [form,    setForm]    = useState({ email: "", password: "" });
  const [errors,  setErrors]  = useState([]);
  const [errMsg,  setErrMsg]  = useState("");
  const [loading, setLoading] = useState(false);
  const [d,       setD]       = useState(true);

  useEffect(() => {
    const v = localStorage.getItem("sh-theme");
    setD(v ? v === "dark" : true);
  }, []);

  const t = mk(d);

  const setTheme = (next) => {
    setD(next);
    localStorage.setItem("sh-theme", next ? "dark" : "light");
  };

  const update = (key, val) => {
    setForm((f) => ({ ...f, [key]: val }));
    setErrors((e) => e.filter((x) => x !== key));
    setErrMsg("");
  };

  const handleLogin = async () => {
    setErrMsg(""); setErrors([]);
    const empty = ["email", "password"].filter((k) => !form[k]);
    if (empty.length) { setErrors(empty); setErrMsg("Harap isi email dan kata sandi."); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      if (error) {
        setErrors(["email", "password"]);
        setErrMsg(error.message.includes("Invalid login") ? "Email atau kata sandi tidak sesuai." : error.message);
        return;
      }
      router.refresh();
      router.push("/dashboard");
    } catch { setErrMsg("Terjadi gangguan pada sistem."); }
    finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: "100svh",
      background: t.bg,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "24px 16px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif",
      WebkitFontSmoothing: "antialiased",
      color: t.hi,
      transition: "background 0.3s",
    }}>
      <GlobalStyle d={d} />

      {/* ── Theme Toggle ── */}
      <button
        className="sh-btn"
        onClick={() => setTheme(!d)}
        style={{
          position: "fixed", top: 20, right: 20, zIndex: 50,
          width: 40, height: 40, borderRadius: 12,
          border: `1px solid ${t.line}`,
          background: t.card,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: t.mid,
          boxShadow: t.ring,
        }}
      >
        {d ? <Sun size={17} strokeWidth={2} /> : <Moon size={17} strokeWidth={2} />}
      </button>

      {/* ── Wrapper ── */}
      <motion.div
        initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: "100%", maxWidth: 380 }}
      >
        {/* ── Logo & Branding ── */}
        <div style={{
          display: "flex", flexDirection: "column",
          alignItems: "center", gap: 16, marginBottom: 36,
        }}>
          {/* Logo box */}
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: t.blue, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 8px 32px rgba(10,132,255,${d ? 0.45 : 0.30}), 0 0 0 6px ${t.blueBg}`,
          }}>
            <Box size={30} strokeWidth={2} color="#fff" />
          </div>
          {/* Wordmark */}
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontSize: 30, fontWeight: 800,
              letterSpacing: "-0.04em", lineHeight: 1,
              color: t.hi,
            }}>
              Sandra<span style={{ color: t.blue }}>Hub</span>
            </div>
            <div style={{
              marginTop: 7,
              fontSize: 10, fontWeight: 700,
              letterSpacing: "0.40em",
              textTransform: "uppercase",
              color: t.lo,
            }}>
              SPM Sumatera
            </div>
          </div>
        </div>

        {/* ── Card ── */}
        <div style={{
          background: t.card,
          border: `1px solid ${t.line}`,
          borderRadius: 24,
          boxShadow: t.shadow,
          overflow: "hidden",
        }}>
          {/* Body */}
          <div style={{ padding: "36px 32px 28px" }}>
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em" }}>Masuk</div>
              <div style={{ marginTop: 5, fontSize: 13.5, color: t.mid }}>
                ke akun SandraHub Anda
              </div>
            </div>

            {/* Error banner */}
            <AnimatePresence>
              {errMsg && (
                <motion.div
                  key="err"
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: "auto", marginBottom: 20 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 13,
                    background: t.redBg,
                    border: `1px solid ${t.redBd}`,
                    display: "flex", alignItems: "center", gap: 10,
                    fontSize: 13, fontWeight: 600, color: t.red,
                    overflow: "hidden",
                  }}
                >
                  <AlertCircle size={15} strokeWidth={2.2} style={{ flexShrink: 0 }} />
                  {errMsg}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <AuthField
                label="Email" icon={<Mail size={16} strokeWidth={2} />}
                type="email" placeholder="nama@gmail.com"
                value={form.email} hasError={errors.includes("email")}
                onChange={(v) => update("email", v)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                t={t} d={d}
              />
              <AuthField
                label="Kata Sandi" icon={<Lock size={16} strokeWidth={2} />}
                type="password" placeholder="Kata sandi"
                value={form.password} hasError={errors.includes("password")}
                onChange={(v) => update("password", v)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                t={t} d={d}
              />
            </div>

            {/* CTA */}
            <button
              className="sh-btn"
              onClick={handleLogin} disabled={loading}
              style={{
                marginTop: 24,
                width: "100%", height: 52,
                borderRadius: 14, border: "none",
                background: loading ? t.blue : t.blue,
                color: "#fff",
                fontSize: 14, fontWeight: 700, letterSpacing: "0.01em",
                opacity: loading ? 0.72 : 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: `0 4px 20px rgba(10,132,255,${d ? 0.42 : 0.30})`,
              }}
            >
              {loading
                ? <Loader2 size={18} className="sh-spin" />
                : <><span>Masuk ke Sistem</span><ArrowRight size={16} strokeWidth={2.5} /></>
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
            <span style={{ fontSize: 13.5, color: t.mid }}>Belum punya akun?</span>
            <button
              className="sh-btn"
              onClick={() => router.push("/register")}
              style={{
                fontSize: 13.5, fontWeight: 700, color: t.blue,
                background: "none", border: "none", padding: 0,
              }}
            >
              Daftar sekarang
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

// ─── Shared Field Component ───────────────────────────────────────────────────
function AuthField({ label, icon, type, placeholder, value, onChange, onKeyDown, hasError, t, d }) {
  return (
    <div>
      <label style={{
        display: "block", marginBottom: 8, paddingLeft: 1,
        fontSize: 11, fontWeight: 700,
        letterSpacing: "0.07em", textTransform: "uppercase",
        color: t.lo,
      }}>
        {label}
      </label>
      <div
        className={`sh-field${hasError ? " sh-field-error" : ""}`}
        style={{
          display: "flex", alignItems: "center", gap: 11,
          height: 52, borderRadius: 13, padding: "0 16px",
          background: d ? "rgba(255,255,255,0.045)" : t.sub,
          border: `1.5px solid ${hasError ? t.red : t.line}`,
        }}
      >
        <span style={{ color: hasError ? t.red : t.lo, flexShrink: 0, display: "flex" }}>
          {icon}
        </span>
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          style={{
            flex: 1, height: "100%",
            background: "transparent", border: "none", outline: "none",
            fontSize: 15, fontWeight: 500, color: t.hi,
            fontFamily: "inherit",
          }}
        />
      </div>
    </div>
  );
}