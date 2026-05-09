"use client";

import { useState, useEffect, useRef } from "react";
import supabase from "../../lib/supabase";
import { 
  Mail, Lock, User, Shield, CheckCircle2, XCircle,
  Loader2, ChevronLeft, Box, Sun, Moon, Building2, Info, Send, LockKeyhole, AlertCircle
} from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { generateOTP } from "../../lib/email/otp";
import { sendOTPEmail } from "../../lib/email/sendOTP";

export default function RegisterPage() {
  const router = useRouter();
  const infoRef = useRef(null);
  const infoBtnRef = useRef(null); 
  
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirm_password: "",
    full_name: "",
    username: "",
    role: "spm_sumatera",
    access_code: "",
    partner_name: "",
  });

  const [partnersList, setPartnersList] = useState([]);
  const [isFetchingPartners, setIsFetchingPartners] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [showInfo, setShowInfo] = useState(false);
  const [errors, setErrors] = useState([]);
  
  const [checking, setChecking] = useState({ email: false, username: false });
  const [exists, setExists] = useState({ email: false, username: false });

  useEffect(() => {

    const savedData = sessionStorage.getItem("pending_reg");
  if (savedData) {
    const parsedData = JSON.parse(savedData);
    setForm({
      email: parsedData.email || "",
      password: "", // Sandi sebaiknya tetap kosong untuk keamanan
      confirm_password: "",
      full_name: parsedData.full_name || "",
      username: parsedData.username || "",
      role: parsedData.role || "spm_sumatera",
      access_code: parsedData.access_code || "",
      partner_name: parsedData.partner_name || "",
    });
  }
    const savedTheme = localStorage.getItem("sh-theme") || "dark";
    setTheme(savedTheme);

    const fetchPartners = async () => {
      setIsFetchingPartners(true);
      try {
        const { data } = await supabase.from('partner_branches').select('partner_name');
        if (data) {
          const uniquePartners = [...new Set(data.map(item => item.partner_name))];
          setPartnersList(uniquePartners.sort());
        }
      } catch (err) { console.error(err); } 
      finally { setIsFetchingPartners(false); }
    };
    fetchPartners();

    const handleClickOutside = (event) => {
      if (infoRef.current && !infoRef.current.contains(event.target) && 
          infoBtnRef.current && !infoBtnRef.current.contains(event.target)) {
        setShowInfo(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const checkAvailability = async (field, value) => {
    if (!value) return;
    setChecking(prev => ({ ...prev, [field]: true }));
    const { data } = await supabase.from('profiles').select(field).eq(field, value).maybeSingle();
    setExists(prev => ({ ...prev, [field]: !!data }));
    setChecking(prev => ({ ...prev, [field]: false }));
  };

  const passChecks = {
    length: form.password.length >= 8,
    capital: /[A-Z]/.test(form.password),
    symbol: /[0-9!@#$%^&*]/.test(form.password),
    match: form.password !== "" && form.password === form.confirm_password
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
    footer: isDark ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-emerald-50 border-emerald-100',
    select: isDark ? 'bg-[#1C2026] text-slate-100' : 'bg-white text-slate-900'
  };

const handleRegister = async () => {
  setErrorMsg("");
  setErrors([]);
  
  // 1. Validasi Field Kosong
  let emptyFields = [];
  Object.keys(form).forEach(key => {
      if (!form[key] && key !== 'partner_name') emptyFields.push(key);
      if (form.role === 'finance_mpx' && !form.partner_name) emptyFields.push('partner_name');
  });

  if (emptyFields.length > 0) {
    setErrors(emptyFields);
    return setErrorMsg("Harap lengkapi semua kolom.");
  }

  if (!Object.values(passChecks).every(Boolean)) return setErrorMsg("Syarat kata sandi belum terpenuhi.");

  setLoading(true);

  try {
    const email = form.email.trim().toLowerCase();
    const { password, full_name, username, role, access_code, partner_name } = form;

    // 2. Cek apakah email/username SUDAH ADA di tabel profiles yang sudah aktif
    const { data: existingUser } = await supabase
      .from("profiles")
      .select("id")
      .or(`email.eq.${email},username.eq.${username}`)
      .maybeSingle();

    if (existingUser) {
      setLoading(false);
      return setErrorMsg("Email atau Username sudah terdaftar dan aktif.");
    }

    // 3. Cek Kode Otoritas
    const { data: codeData } = await supabase
      .from("access_codes")
      .select("id")
      .eq("code", access_code.toUpperCase())
      .eq("type", role)
      .eq("is_active", true)
      .maybeSingle();

    if (!codeData) {
      setLoading(false);
      return setErrorMsg("Kode otoritas tidak valid.");
    }

    // 4. GENERATE OTP & SIMPAN KE DB
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: otpError } = await supabase.from("email_otps").insert({
      email,
      otp: String(otp),
      expires_at: expiresAt,
      verified: false
    });

    if (otpError) throw otpError;

    // 5. KIRIM EMAIL
    const emailRes = await sendOTPEmail(email, otp);
    if (!emailRes.success) throw new Error(emailRes.error);

    // 6. SIMPAN SEMUA DATA KE SESSION (Termasuk Password)
    // Password aman di sini karena hanya ada di memori browser user selama sesi pendaftaran
    const pendingData = { 
      email, password, full_name, username, role, partner_name, 
      access_code: access_code.toUpperCase() 
    };
    sessionStorage.setItem("pending_reg", JSON.stringify(pendingData));

    router.push(`/verify?email=${email}`);

  } catch (err) {
    setErrorMsg(err.message || "Gagal memproses pendaftaran.");
  } finally {
    setLoading(false);
  }
};

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} flex flex-col items-center justify-center px-6 py-12 antialiased transition-colors duration-500 font-sans`}>
      
      <button onClick={() => {
        const nt = theme === "dark" ? "light" : "dark";
        setTheme(nt);
        localStorage.setItem("sh-theme", nt);
      }} className={`fixed top-8 right-8 p-3 rounded-2xl border transition-all z-50 ${isDark ? 'bg-white/5 border-white/10 text-emerald-400' : 'bg-white border-slate-200 text-slate-600 shadow-sm'}`}>
        {isDark ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[640px]">
        
        {/* Branding SandraHub */}
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

        <div className={`border rounded-[3rem] overflow-hidden ${t.card}`}>
          <div className="p-8 md:p-14">
            <div className="flex items-center justify-between mb-12">
              <h2 className="text-2xl font-bold">Daftar Akun</h2>
              <button onClick={() => router.push("/login")} className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-600 hover:opacity-70 transition-all">
                <ChevronLeft size={16} /> Kembali
              </button>
            </div>

            <AnimatePresence mode="wait">
              {errorMsg && (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="mb-8 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-2xl text-[11px] font-bold flex items-center gap-3">
                  <AlertCircle size={16} /> {errorMsg}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              <RegisterInput label="Nama Lengkap" icon={<User size={18} />} value={form.full_name} hasError={errors.includes('full_name')} onChange={(v) => setForm({ ...form, full_name: v })} t={t} isDark={isDark} />
              
              <RegisterInput 
                label="Username" icon={<User size={18} />} placeholder="kecil & tanpa spasi" 
                value={form.username} hasError={errors.includes('username') || exists.username} 
                onBlur={() => checkAvailability('username', form.username)}
                checking={checking.username}
                onChange={(v) => {
                  const cleaned = v.toLowerCase().replace(/\s+/g, '');
                  setForm({ ...form, username: cleaned });
                  if (exists.username) setExists(prev => ({ ...prev, username: false }));
                  if (errors.includes('username')) setErrors(prev => prev.filter(e => e !== 'username'));
                }} 
                t={t} isDark={isDark} 
                footer={exists.username && <span className="text-[10px] text-rose-500 font-bold ml-1 mt-1 block">Username sudah digunakan</span>}
              />
              
              <div className="md:col-span-2">
                <RegisterInput 
                  label="Alamat Gmail" icon={<Mail size={18} />} placeholder="username@gmail.com" 
                  value={form.email} hasError={errors.includes('email') || exists.email} 
                  onBlur={() => checkAvailability('email', form.email)}
                  checking={checking.email}
                  onChange={(v) => {
                    setForm({ ...form, email: v });
                    if (exists.email) setExists(prev => ({ ...prev, email: false }));
                    if (errors.includes('email')) setErrors(prev => prev.filter(e => e !== 'email'));
                  }} 
                  t={t} isDark={isDark} 
                  footer={exists.email && (
                    <div className="flex items-center justify-between mt-1 px-1">
                      <span className="text-[10px] text-rose-500 font-bold">Gmail sudah terdaftar.</span>
                      <button onClick={() => router.push("/login")} className="text-[10px] font-bold text-emerald-500 hover:underline">LOGIN SEKARANG</button>
                    </div>
                  )}
                />
              </div>

              {/* Role & Partner */}
              <div className="md:col-span-2 space-y-2">
                <div className="px-1"><label className="text-[11px] font-bold tracking-widest uppercase opacity-50">Role Pengguna</label></div>
                <div className={`flex items-center border rounded-2xl px-5 h-[58px] transition-all ${t.input} ${isDark ? 'focus-within:border-emerald-500/50' : 'focus-within:border-emerald-500'}`}>
                  <select className={`w-full h-full outline-none text-sm bg-transparent font-medium cursor-pointer ${t.select}`} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, partner_name: "" })}>
                    <option value="spm_sumatera">SPM Sumatera</option>
                    <option value="finance_mpx">Finance MPX</option>
                  </select>
                </div>
              </div>

              <AnimatePresence>
                {form.role === 'finance_mpx' && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="md:col-span-2 space-y-2 overflow-hidden">
                    <div className="px-1"><label className="text-[11px] font-bold tracking-widest uppercase opacity-50">Nama Partner</label></div>
                    <div className={`flex items-center border rounded-2xl px-5 h-[58px] ${t.input} ${errors.includes('partner_name') ? 'border-rose-500 ring-4 ring-rose-500/10' : ''}`}>
                      <Building2 size={18} className="text-slate-500 mr-2" />
                      {/* Ganti select Nama Partner kamu dengan ini */}
<select
  className={`w-full h-full outline-none text-sm bg-transparent font-medium cursor-pointer ${t.select}`}
  value={form.partner_name}
  onChange={(e) => setForm({ ...form, partner_name: e.target.value })}
>
  {isFetchingPartners ? (
    <option>Memuat daftar partner...</option>
  ) : (
    <>
      <option value="" disabled>-- Pilih Nama Partner --</option>
      {partnersList.length > 0 ? (
        partnersList.map((p) => (
          <option key={p} value={p} className={isDark ? 'bg-[#1C2026]' : 'bg-white'}>
            {p}
          </option>
        ))
      ) : (
        <option disabled>Data partner tidak ditemukan</option>
      )}
    </>
  )}
</select>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Access Code */}
              <div className="md:col-span-2 space-y-2 relative">
                <div className="flex items-center px-1 gap-2">
                  <label className="text-[11px] font-bold tracking-widest uppercase opacity-50">Kode Otoritas</label>
                  <button 
                    ref={infoBtnRef}
                    onClick={() => setShowInfo(!showInfo)} 
                    className={`flex items-center transition-colors ${showInfo ? 'text-emerald-400' : 'text-slate-500 hover:text-emerald-500'}`}
                  >
                    <Info size={14} />
                  </button>
                </div>
                
                <RegisterInput icon={<Shield size={18} />} placeholder="Kode otoritas sistem" value={form.access_code} hasError={errors.includes('access_code')} onChange={(v) => setForm({ ...form, access_code: v.toUpperCase() })} t={t} isDark={isDark} />
                
                <AnimatePresence>
                  {showInfo && (
                    <motion.div ref={infoRef} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={`absolute left-0 bottom-full mb-4 w-72 p-5 rounded-2xl border shadow-2xl z-[60] text-[11px] leading-relaxed ${t.card} backdrop-blur-xl`}>
                      <p><strong>Kode Otoritas</strong> adalah kunci akses data yang sudah <strong>terpersonalisasi</strong> untuk fungsi Anda. Dapatkan kode melalui tim <strong>SPM Sumatera</strong>.</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Passwords */}
              <RegisterInput label="Kata Sandi" icon={<Lock size={18} />} type="password" value={form.password} hasError={errors.includes('password')} onChange={(v) => setForm({ ...form, password: v })} t={t} isDark={isDark} />
              <RegisterInput label="Konfirmasi Sandi" icon={<LockKeyhole size={18} />} type="password" value={form.confirm_password} hasError={errors.includes('confirm_password')} onChange={(v) => setForm({ ...form, confirm_password: v })} t={t} isDark={isDark} />
            </div>

            {/* Checklist Kata Sandi - High Contrast Minimalis */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-3 px-2">
                <CheckItem label="Huruf Kapital (A-Z)" active={passChecks.capital} isDark={isDark} />
                <CheckItem label="Angka atau Simbol" active={passChecks.symbol} isDark={isDark} />
                <CheckItem label="Minimal 8 Karakter" active={passChecks.length} isDark={isDark} />
                <CheckItem label="Konfirmasi Cocok" active={passChecks.match} isDark={isDark} />
            </div>

            <button onClick={handleRegister} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-5 rounded-[1.5rem] font-bold text-xs uppercase tracking-[0.2em] transition-all mt-14 shadow-xl shadow-emerald-600/20 flex items-center justify-center gap-3 active:scale-[0.97] disabled:opacity-50">
              {loading ? <Loader2 className="animate-spin" size={20} /> : <><Send size={18} /> <span>Verifikasi Alamat Email</span></>}
            </button>
          </div>

          <div className={`p-8 border-t text-center ${t.footer}`}>
            <p className="text-sm font-medium">
              <span className={t.subtext}>Sudah terdaftar?</span>
              <button onClick={() => router.push("/login")} className="ml-2 text-emerald-600 font-bold hover:underline">Masuk Sekarang</button>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function RegisterInput({ label, icon, placeholder, type = "text", value, onChange, onBlur, checking, t, isDark, hasError, footer }) {
  return (
    <div className="space-y-2">
      <div className="px-1">{label && <label className="text-[11px] font-bold tracking-widest uppercase opacity-50">{label}</label>}</div>
      <div className={`group flex items-center gap-4 border rounded-2xl px-5 h-[58px] transition-all duration-300 ${t.input} ${hasError ? 'border-rose-500 ring-4 ring-rose-500/10' : isDark ? 'focus-within:border-emerald-500/50' : 'focus-within:border-emerald-500'}`}>
        <span className={`transition-colors ${hasError ? 'text-rose-500' : 'text-slate-500 group-focus-within:text-emerald-500'}`}>{icon}</span>
        <input 
          type={type} 
          placeholder={placeholder} 
          onBlur={onBlur} 
          className={`w-full h-full outline-none text-sm bg-transparent font-medium ${t.placeholder}`} 
          value={value} 
          onChange={(e) => onChange(e.target.value)} 
        />
        {checking && <Loader2 size={16} className="animate-spin text-emerald-500" />}
      </div>
      {footer}
    </div>
  );
}

function CheckItem({ label, active, isDark }) {
  return (
    <div className="flex items-center gap-2.5">
      {active ? (
        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
      ) : (
        <XCircle size={16} className={`shrink-0 ${isDark ? 'text-slate-600' : 'text-slate-300'}`} />
      )}
      <span className={`text-[10px] font-bold uppercase tracking-tight transition-colors ${
        active 
          ? 'text-emerald-500' 
          : isDark ? 'text-slate-500' : 'text-slate-500'
      }`}>
        {label}
      </span>
    </div>
  );
}