"use client";
/**
 * /martahub/m/verify — Verifikasi kode 6 digit yang dikirim dari
 * /martahub/m/login (jalur email OTP, alternatif dari Google). Menyamai
 * `email_login_screen.dart` di app Flutter (verifyOTP → session), tapi
 * lewat supabaseMarta (project MartaHub sendiri, BUKAN SandraHub).
 */
import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import { HubLogo } from "../../../../components/HubLogo";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;

function VerifyInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputs = useRef([]);

  useEffect(() => {
    if (!email) { router.replace("/martahub/m/login"); return; }
    inputs.current[0]?.focus();
  }, [email, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const code = digits.join("");

  const onDigit = (i, v) => {
    const clean = v.replace(/\D/g, "").slice(-1);
    setDigits((d) => { const next = [...d]; next[i] = clean; return next; });
    setErr("");
    if (clean && i < 5) inputs.current[i + 1]?.focus();
  };

  const onKeyDown = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
  };

  const onPaste = (e) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    setDigits(text.padEnd(6, "").split("").slice(0, 6));
    inputs.current[Math.min(text.length, 5)]?.focus();
  };

  const verify = async () => {
    if (code.length !== 6 || busy) return;
    setBusy(true); setErr("");
    try {
      const { error } = await supabaseMarta.auth.verifyOtp({ email, token: code, type: "email" });
      if (error) throw error;
      router.replace("/martahub/m");
    } catch (e) {
      setErr("Kode salah atau sudah kedaluwarsa. Coba lagi.");
      setDigits(["", "", "", "", "", ""]);
      inputs.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { if (code.length === 6) verify(); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const resend = async () => {
    if (resending || cooldown > 0) return;
    setResending(true); setErr("");
    try {
      const { error } = await supabaseMarta.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) throw error;
      setCooldown(30);
    } catch (e) {
      setErr("Gagal mengirim ulang kode.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div style={{ minHeight: "100svh", background: "#F4F5F7", color: "#17181C", fontFamily: FF, WebkitFontSmoothing: "antialiased" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{background:#F4F5F7 !important;overscroll-behavior-y:none}
        @keyframes mspin{to{transform:rotate(360deg)}}
        .marta-verify-card{width:100%;max-width:420px;margin:0 auto;padding:0 24px;box-sizing:border-box}
        @media (min-width:640px){
          .marta-verify-card{
            max-width:460px;margin-top:48px;padding:44px 40px 32px;
            background:#FFFFFF;border:1px solid #E9EAEE;border-radius:24px;
            box-shadow:0 2px 6px rgba(23,24,28,0.07), 0 20px 44px rgba(23,24,28,0.09);
          }
        }
        .otp-box{width:46px;height:56px;text-align:center;font-size:22px;font-weight:800;border-radius:12px;background:#F6F7F9;border:1.5px solid #ECEDF0;color:#17181C;font-family:${FF};outline:none;transition:border-color .15s}
        .otp-box:focus{border-color:#ED1C24}
      `}</style>

      <div style={{ position: "fixed", top: "calc(env(safe-area-inset-top,0px) + 16px)", left: 18, zIndex: 20 }}>
        <button onClick={() => router.push("/martahub/m/login")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "#FFFFFF", border: "1px solid #E4E5EA", borderRadius: 11, padding: "8px 14px", cursor: "pointer", color: "#61616C", fontSize: 13, fontWeight: 700, fontFamily: FF, boxShadow: "0 1px 2px rgba(23,24,28,0.05)" }}>
          <ArrowLeft size={14} /> Kembali
        </button>
      </div>

      <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "72px 0 calc(env(safe-area-inset-bottom,0px) + 24px)" }}>
        <div className="marta-verify-card" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <HubLogo variant="marta" size={56} dark={false} shadow inBox />

          <h1 style={{ marginTop: 24, fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", textAlign: "center", lineHeight: 1.2, color: "#17181C" }}>
            Masukkan Kode
          </h1>
          <div style={{ marginTop: 8, fontSize: 13, color: "#6B6B76", textAlign: "center", lineHeight: 1.5 }}>
            Kode 6 digit sudah dikirim ke<br /><b style={{ color: "#3A3A44" }}>{email}</b>
          </div>

          {err && (
            <div style={{ marginTop: 18, width: "100%", padding: "11px 14px", borderRadius: 12, background: "#FDECEC", border: "1px solid #F5C2C2", color: "#C62828", fontSize: 12.5, fontWeight: 600, textAlign: "center" }}>{err}</div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 28 }} onPaste={onPaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => (inputs.current[i] = el)}
                className="otp-box"
                inputMode="numeric"
                maxLength={1}
                value={d}
                disabled={busy}
                onChange={(e) => onDigit(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
              />
            ))}
          </div>

          {busy && (
            <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 8, color: "#6B6B76", fontSize: 13, fontWeight: 600 }}>
              <Loader2 size={15} style={{ animation: "mspin .9s linear infinite", color: "#ED1C24" }} /> Memverifikasi…
            </div>
          )}

          <button onClick={resend} disabled={resending || cooldown > 0}
            style={{ marginTop: 22, background: "none", border: "none", cursor: resending || cooldown > 0 ? "default" : "pointer", color: cooldown > 0 ? "#B0B0BA" : "#ED1C24", fontSize: 13, fontWeight: 700, fontFamily: FF }}>
            {cooldown > 0 ? `Kirim ulang dalam ${cooldown}s` : resending ? "Mengirim…" : "Kirim ulang kode"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MartaVerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyInner />
    </Suspense>
  );
}
