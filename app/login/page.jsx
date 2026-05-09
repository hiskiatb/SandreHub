"use client";

import { useState, useEffect } from "react";
import supabase from "../../lib/supabase";
import { Mail, Lock, ArrowRight, Loader2, Box, Sun, Moon, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [errors, setErrors] = useState([]); // Untuk tracking field kosong

  useEffect(() => {
    const savedTheme = localStorage.getItem("sh-theme") || "dark";
    setTheme(savedTheme);
  }, []);

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
    placeholder: isDark ? 'placeholder:text-slate-500' : 'placeholder:text-slate-400',
    input: isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200',
    hub: isDark ? 'text-emerald-400' : 'text-emerald-600',
    footer: isDark ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-emerald-50 border-emerald-100'
  };

  const handleLogin = async () => {
    setErrorMsg("");
    setErrors([]);
    
    // Validasi Field Kosong
    let emptyFields = [];
    if (!form.email) emptyFields.push('email');
    if (!form.password) emptyFields.push('password');

    if (emptyFields.length > 0) {
      setErrors(emptyFields);
      return setErrorMsg("Harap isi email dan kata sandi Anda.");
    }

    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });

      if (authError) {
        setLoading(false);
        setErrors(['email', 'password']);
        return setErrorMsg(authError.message.includes("Invalid login credentials") 
          ? "Email atau kata sandi tidak sesuai." 
          : authError.message);
      }

      router.refresh();
      router.push("/dashboard");
    } catch (err) {
      setLoading(false);
      setErrorMsg("Terjadi gangguan pada sistem.");
    }
  };

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} flex flex-col items-center justify-center px-6 antialiased transition-colors duration-500 font-sans`}>
      
      {/* Theme Toggle */}
      <button 
        onClick={toggleTheme}
        className={`fixed top-8 right-8 p-3 rounded-2xl border transition-all z-50 ${isDark ? 'bg-white/5 border-white/10 text-emerald-400' : 'bg-white border-slate-200 text-slate-600 shadow-sm'}`}
      >
        {isDark ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[440px]"
      >
        {/* Branding SandraHub - Layout Vertikal */}
        <div className="flex flex-col items-center mb-12 gap-4">
          <div className="w-16 h-16 bg-emerald-600 rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-emerald-600/30">
            <Box size={36} />
          </div>
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight">
              Sandra<span className={t.hub}>Hub</span>
            </h1>
            <p className={`text-[10px] font-bold uppercase tracking-[0.5em] mt-1 ${t.subtext}`}>SPM Sumatera</p>
          </div>
        </div>

        {/* Main Card */}
        <div className={`border rounded-[3rem] overflow-hidden ${t.card} transition-all duration-300`}>
          <div className="p-8 md:p-12">
            <div className="mb-10">
              <h2 className="text-2xl font-bold">Login</h2>
            </div>

            <AnimatePresence mode="wait">
              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="mb-8 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-2xl text-[11px] font-bold flex items-center gap-3"
                >
                  <AlertCircle size={16} />
                  {errorMsg}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-7">
              <InputField
                label="Alamat Gmail"
                icon={<Mail size={18} />}
                placeholder="nama@gmail.com"
                value={form.email}
                hasError={errors.includes('email')}
                onChange={(v) => {
                  setForm({ ...form, email: v });
                  if (errors.includes('email')) setErrors(prev => prev.filter(e => e !== 'email'));
                }}
                t={t}
                isDark={isDark}
              />

              <InputField
                label="Kata Sandi"
                icon={<Lock size={18} />}
                placeholder="••••••••"
                type="password"
                value={form.password}
                hasError={errors.includes('password')}
                onChange={(v) => {
                  setForm({ ...form, password: v });
                  if (errors.includes('password')) setErrors(prev => prev.filter(e => e !== 'password'));
                }}
                t={t}
                isDark={isDark}
              />

              <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-5 rounded-[1.5rem] font-bold text-xs uppercase tracking-[0.2em] transition-all mt-4 shadow-xl shadow-emerald-600/20 flex items-center justify-center gap-3 active:scale-[0.97] disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    <span>Masuk ke Sistem</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Registration Link */}
          <div className={`p-8 border-t text-center ${t.footer}`}>
            <p className="text-sm font-medium">
              <span className={t.subtext}>Belum punya akun?</span>
              <button
                onClick={() => router.push("/register")}
                className="ml-2 text-emerald-600 font-bold hover:underline"
              >
                Daftar Sekarang
              </button>
            </p>
          </div>
        </div>
        
        <p className={`text-center mt-12 text-[10px] font-bold uppercase tracking-widest opacity-20`}>
          &copy; 2026 SandraHub by SPM Sumatera
        </p>
      </motion.div>
    </div>
  );
}

function InputField({ label, icon, placeholder, type = "text", value, onChange, t, isDark, hasError }) {
  return (
    <div className="space-y-2.5">
      <div className="px-1">
        <label className="text-[11px] font-bold tracking-widest uppercase opacity-50">
          {label}
        </label>
      </div>
      <div className={`group flex items-center gap-4 border rounded-2xl px-5 h-[58px] transition-all duration-300 ${t.input} ${hasError ? 'border-rose-500 ring-4 ring-rose-500/10' : isDark ? 'focus-within:border-emerald-500/50' : 'focus-within:border-emerald-500'}`}>
        <span className={`transition-colors duration-300 ${hasError ? 'text-rose-500' : 'text-slate-500 group-focus-within:text-emerald-500'}`}>
          {icon}
        </span>
        <input
          type={type}
          placeholder={placeholder}
          className={`w-full h-full outline-none text-sm bg-transparent font-medium ${t.placeholder}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}