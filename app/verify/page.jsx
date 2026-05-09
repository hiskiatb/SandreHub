"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import supabase from "../../lib/supabase";
import { generateOTP } from "../../lib/email/otp";
import { sendOTPEmail } from "../../lib/email/sendOTP";
import { 
  Box, Sun, Moon, Loader2, ChevronLeft, 
  MailOpen, ShieldCheck, RefreshCw, Edit3 
} from "lucide-react";

// CATATAN: AlertCircle dihapus dari import lucide-react di atas 
// agar tidak bentrok dengan fungsi di bawah.

function VerifyContent() {
    const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email");

  const [otp, setOtp] = useState(new Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [theme, setTheme] = useState("dark");
  const [timer, setTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [pendingData, setPendingData] = useState(null);

  const inputRefs = useRef([]);

  useEffect(() => {
    const savedTheme = localStorage.getItem("sh-theme") || "dark";
    setTheme(savedTheme);

    const data = sessionStorage.getItem("pending_reg");
    if (data) {
      setPendingData(JSON.parse(data));
    } else if (!emailParam) {
      // Jika data hilang dan tidak ada email di URL, balik ke register
      router.replace("/register");
    }

    if (timer > 0) {
      const interval = setInterval(() => setTimer((t) => t - 1), 1000);
      return () => clearInterval(interval);
    } else {
      setCanResend(true);
    }
  }, [timer, emailParam, router]);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("sh-theme", newTheme);
  };

  const isDark = theme === "dark";
  const t = {
    bg: isDark ? 'bg-[#0F1115]' : 'bg-[#F8FAFC]',
    card: isDark ? 'bg-[#16191E] border-white/5 shadow-2xl' : 'bg-white border-slate-200 shadow-xl',
    text: isDark ? 'text-slate-100' : 'text-slate-900',
    subtext: isDark ? 'text-slate-400' : 'text-slate-500',
    input: isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200',
    hub: isDark ? 'text-emerald-400' : 'text-emerald-600',
    footer: isDark ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-emerald-50 border-emerald-100'
  };

  const handleChange = (element, index) => {
    if (isNaN(element.value)) return false;
    const newOtp = [...otp];
    newOtp[index] = element.value;
    setOtp(newOtp);
    if (element.value !== "" && index < 5) inputRefs.current[index + 1].focus();
  };

  const handleKeyDown = (e, index) => {
    if (e.key === "Backspace" && otp[index] === "" && index > 0) {
      inputRefs.current[index - 1].focus();
    }
  };

  const handleResend = async () => {
    if (!canResend || !emailParam) return;
    setResending(true);
    setErrorMsg("");

    try {
      const newOtp = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const { error: dbError } = await supabase.from("email_otps").insert({
        email: emailParam,
        otp: String(newOtp),
        expires_at: expiresAt,
        verified: false
      });

      if (dbError) throw dbError;

      const res = await sendOTPEmail(emailParam, newOtp);
      if (!res.success) throw new Error(res.error);

      setTimer(60);
      setCanResend(false);
      setOtp(new Array(6).fill("")); // Reset input OTP saat resend
    } catch (err) {
      setErrorMsg("Gagal mengirim ulang kode.");
    } finally {
      setResending(false);
    }
  };

  const handleVerify = async () => {
    setErrorMsg("");
    const fullOtp = otp.join("");
    if (fullOtp.length < 6) return setErrorMsg("Harap masukkan kode 6 digit.");
    
    setLoading(true);
    try {
      const res = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailParam?.trim().toLowerCase(),
          otp: fullOtp,
          ...pendingData
        }),
      });
      const data = await res.json();
      if (data.success) {
        sessionStorage.removeItem("pending_reg");
        router.push("/login?verified=true");
      } else {
        setErrorMsg(data.message || "Kode OTP salah.");
      }
    } catch (err) {
      setErrorMsg("Terjadi gangguan sistem.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} flex flex-col items-center justify-center px-6 py-12 antialiased transition-colors duration-500 font-sans`}>
      <button onClick={toggleTheme} className={`fixed top-8 right-8 p-3 rounded-2xl border transition-all z-50 ${isDark ? 'bg-white/5 border-white/10 text-emerald-400' : 'bg-white border-slate-200 text-slate-600 shadow-sm'}`}>
        {isDark ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[540px]">
        <div className="flex flex-col items-center mb-12 gap-4">
          <div className="w-16 h-16 bg-emerald-600 rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-emerald-600/30">
            <Box size={36} />
          </div>
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight">Sandra<span className={t.hub}>Hub</span></h1>
            <p className={`text-[10px] font-bold uppercase tracking-[0.5em] mt-1 ${t.subtext}`}>Verification Center</p>
          </div>
        </div>

        <div className={`border rounded-[3rem] overflow-hidden ${t.card}`}>
          <div className="p-8 md:p-14">
            <div className="flex flex-col items-center text-center mb-10">
              <div className={`w-14 h-14 rounded-2xl ${isDark ? 'bg-white/5' : 'bg-slate-50'} flex items-center justify-center mb-6`}>
                <MailOpen size={28} className="text-emerald-500" />
              </div>
              <h2 className="text-2xl font-bold">Verifikasi Email</h2>
              <div className="mt-3 flex flex-col items-center gap-1">
                <span className={`${isDark ? 'text-white' : 'text-black'} font-bold break-all text-sm`}>{emailParam}</span>
                <button 
                  onClick={() => router.push('/register')}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-500 uppercase tracking-widest hover:underline mt-1"
                >
                  <Edit3 size={12} /> Ubah Alamat Email
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {errorMsg && (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="mb-8 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-2xl text-[11px] font-bold flex items-center gap-3">
                  <AlertCircle size={16} /> {errorMsg}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex justify-between gap-2 md:gap-4 mb-10">
              {otp.map((data, index) => (
                <input
                  key={index}
                  ref={(el) => (inputRefs.current[index] = el)}
                  type="text"
                  maxLength="1"
                  className={`w-full h-16 md:h-20 text-center text-2xl md:text-3xl font-bold rounded-2xl border transition-all outline-none ${t.input} ${errorMsg ? 'border-rose-500 ring-4 ring-rose-500/10' : isDark ? 'focus:border-emerald-500/50' : 'focus:border-emerald-500'}`}
                  value={data}
                  onChange={(e) => handleChange(e.target, index)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                />
              ))}
            </div>

            <button onClick={handleVerify} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-5 rounded-[1.5rem] font-bold text-xs uppercase tracking-[0.2em] transition-all shadow-xl shadow-emerald-600/20 flex items-center justify-center gap-3 active:scale-[0.97] disabled:opacity-50">
              {loading ? <Loader2 className="animate-spin" size={20} /> : <><ShieldCheck size={18} /> <span>Verifikasi Akun</span></>}
            </button>

            <div className="mt-8 text-center">
              {canResend ? (
                <button onClick={handleResend} disabled={resending} className="text-xs font-bold text-emerald-500 hover:underline flex items-center gap-2 mx-auto uppercase tracking-widest disabled:opacity-50">
                  {resending ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />} 
                  Kirim Ulang Kode
                </button>
              ) : (
                <p className={`text-[11px] font-bold uppercase tracking-widest ${t.subtext}`}>Kirim ulang dalam <span className="text-emerald-500">{timer}s</span></p>
              )}
            </div>
          </div>

          <div className={`p-8 border-t text-center ${t.footer}`}>
            <button onClick={() => router.push("/register")} className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest mx-auto opacity-60 hover:opacity-100 transition-all">
              <ChevronLeft size={16} /> Kembali ke Pendaftaran
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VerifyContent />
    </Suspense>
  );
}
// FUNGSI INI YANG MENYEBABKAN ERROR TADI (KARENA NAMANYA SAMA DENGAN IMPORT)
function AlertCircle({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
  );
}