"use client";
/**
 * /martahub/m/login - Login mobile-web MartaHub (BME/RGE, TMV, & SPM
 * Sumatera sama-sama masuk lewat sini - fitur yg tampil sesudahnya
 * menyesuaikan role masing-masing, lihat ADDABLE_ROLES_FOR di planData.js).
 *
 * Sesi TERPISAH dari:
 *  - /marta/login (web admin/TMV - pakai project SandraHub + role bridge)
 *  - App Flutter marta_hub (native)
 * Keduanya sama-sama connect ke project Supabase MartaHub sendiri lewat
 * `supabaseMarta` (lib/supabaseMarta.js), storageKey terpisah ("marta-auth-
 * token"), jadi tidak akan bentrok sesi dgn SandraHub di browser yang sama.
 *
 * Konsepnya SENGAJA meniru /promotor/login (SandraHub): kartu mobile-first,
 * ringkas, Google SSO sbg jalur utama (paling cepat utk BME/RGE lapangan),
 * kode email 6-digit sbg alternatif (dipakai jalur email non-Gmail spt
 * Outlook, sama seperti pilihan di app Flutter).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Info, Loader2, ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../../lib/supabaseMarta";
import { getMartaScope } from "../../../../lib/martaScope";
import { HubLogo } from "../../../../components/HubLogo";
import { MartaSplash } from "../_shared/MobileShell";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const ROLE_LABEL = { bme_rge: "BME/RGE", tmv: "Brand TMV", head: "Head TMV", admin: "Admin", spm_sumatera: "SPM Sumatera" };

export default function MartaMobileLogin() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [busyGoogle, setBusyGoogle] = useState(false);
  const [email, setEmail] = useState("");
  const [detected, setDetected] = useState(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    supabaseMarta.auth.getSession().then(({ data: { session } }) => {
      if (!alive) return;
      if (session) router.replace("/martahub/m");
      else setChecking(false);
    });
    return () => { alive = false; };
  }, [router]);

  // Deteksi role dari mh_profiles sambil user mengetik email - sekadar
  // preview "Masuk sebagai ..." (sama seperti /sandra/login), TIDAK memblokir
  // pengiriman kode kalau gagal/tidak ketemu (bisa jadi belum terdaftar,
  // BME tetap boleh coba & diarahkan hubungi Marcomm Region kalau ditolak).
  useEffect(() => {
    const v = email.trim().toLowerCase();
    if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setDetected(null); return; }
    let alive = true;
    setCheckingEmail(true);
    const t = setTimeout(async () => {
      try {
        const scope = await getMartaScope(v);
        if (alive) setDetected(scope.found ? scope : null);
      } catch { if (alive) setDetected(null); }
      finally { if (alive) setCheckingEmail(false); }
    }, 420);
    return () => { alive = false; clearTimeout(t); };
  }, [email]);

  const signInGoogle = async () => {
    setBusyGoogle(true); setErr("");
    try {
      const { error } = await supabaseMarta.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/martahub/m`, queryParams: { prompt: "select_account" } },
      });
      if (error) throw error;
    } catch (e) {
      setErr("Login Google gagal atau dibatalkan. Coba lagi.");
      setBusyGoogle(false);
    }
  };

  const sendCode = async () => {
    const v = email.trim().toLowerCase();
    if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setErr("Masukkan email yang valid."); return; }
    setSendingCode(true); setErr("");
    try {
      const { error } = await supabaseMarta.auth.signInWithOtp({ email: v, options: { shouldCreateUser: true } });
      if (error) throw error;
      router.push(`/martahub/m/verify?email=${encodeURIComponent(v)}`);
    } catch (e) {
      setErr(e.message || "Gagal mengirim kode. Coba lagi.");
      setSendingCode(false);
    }
  };

  if (checking) return <MartaSplash />;

  return (
    <div style={{ minHeight: "100svh", background: "#F4F5F7", color: "#17181C", fontFamily: FF, WebkitFontSmoothing: "antialiased" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{background:#F4F5F7 !important;overscroll-behavior-y:none}
        @keyframes mspin{to{transform:rotate(360deg)}}
        .marta-login-card{width:100%;max-width:420px;margin:0 auto;padding:0 24px;box-sizing:border-box}
        @media (min-width:640px){
          .marta-login-card{
            max-width:460px;margin-top:48px;padding:44px 40px 32px;
            background:#FFFFFF;border:1px solid #E9EAEE;border-radius:24px;
            box-shadow:0 2px 6px rgba(23,24,28,0.07), 0 20px 44px rgba(23,24,28,0.09);
          }
        }
      `}</style>

      {!MARTA_CONFIGURED && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 30, background: "#FDECEC", color: "#C62828", textAlign: "center", fontSize: 12, fontWeight: 700, padding: "8px 12px" }}>
          Supabase MartaHub belum dikonfigurasi.
        </div>
      )}

      {/* Ganti Hub */}
      <div style={{ position: "fixed", top: "calc(env(safe-area-inset-top,0px) + 16px)", left: 18, zIndex: 20 }}>
        <button onClick={() => router.push("/login")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "#FFFFFF", border: "1px solid #E4E5EA", borderRadius: 11, padding: "8px 14px", cursor: "pointer", color: "#61616C", fontSize: 13, fontWeight: 700, fontFamily: FF, boxShadow: "0 1px 2px rgba(23,24,28,0.05)" }}>
          <ArrowLeft size={14} /> Ganti Hub
        </button>
      </div>

      <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "72px 0 calc(env(safe-area-inset-bottom,0px) + 24px)" }}>
        <div className="marta-login-card" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <HubLogo variant="marta" size={62} dark={false} shadow inBox />

          <h1 style={{ marginTop: 26, fontSize: 25, fontWeight: 800, letterSpacing: "-0.035em", textAlign: "center", lineHeight: 1.15, color: "#17181C" }}>
            Login MartaHub Mobile
          </h1>

          {err && (
            <div style={{ marginTop: 20, width: "100%", padding: "11px 14px", borderRadius: 12, background: "#FDECEC", border: "1px solid #F5C2C2", color: "#C62828", fontSize: 12.5, fontWeight: 600, textAlign: "center" }}>{err}</div>
          )}

          {/* Email - jalur utama, SELALU tampil (bukan di balik toggle),
              karena sebagian besar BME/RGE pakai email kantor non-Gmail
              (mis. Outlook) yang tidak bisa lewat tombol Google. */}
          <div style={{ marginTop: 34, width: "100%" }}>
            <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#8A8A96" }}>Masuk dengan Email</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10, height: 54, padding: "0 14px", borderRadius: 14, background: "#F6F7F9", border: "1.5px solid #ECEDF0", marginTop: 7 }}>
              <Mail size={16} color="#9A9AA6" style={{ flexShrink: 0 }} />
              <input type="email" placeholder="nama@perusahaan.com" value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendCode()}
                style={{ flex: 1, minWidth: 0, height: "100%", background: "transparent", border: "none", outline: "none", fontSize: 15, fontWeight: 500, color: "#17181C", fontFamily: FF }}
                autoComplete="email"
                autoFocus
              />
              {checkingEmail && <Loader2 size={14} color="#9A9AA6" style={{ animation: "mspin .9s linear infinite" }} />}
            </div>

            {detected && (
              <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", borderRadius: 10, background: "rgba(50,188,173,0.08)", border: "1px solid rgba(50,188,173,0.25)", marginTop: 10 }}>
                <ShieldCheck size={15} color="#1A9E90" style={{ flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>Masuk sebagai {ROLE_LABEL[detected.role] || detected.role}</div>
                  <div style={{ fontSize: 11.5, color: "#6B6B76", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[detected.brand, detected.branchName, detected.region].filter(Boolean).join(" · ") || "Scope MartaHub"}
                  </div>
                </div>
              </div>
            )}

            <button onClick={sendCode} disabled={sendingCode}
              style={{ marginTop: 14, width: "100%", height: 54, borderRadius: 14, border: "none", cursor: sendingCode ? "default" : "pointer",
                background: sendingCode ? "linear-gradient(135deg,#F08D91,#F0A8CE)" : "linear-gradient(135deg,#ED1C24,#EC008C)",
                color: "#fff", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: sendingCode ? "none" : "0 4px 12px rgba(17,17,20,0.1)", fontFamily: FF }}>
              {sendingCode ? <Loader2 size={16} style={{ animation: "mspin .85s linear infinite" }} /> : <><span>Kirim Kode</span><ArrowRight size={14} strokeWidth={2.5} /></>}
            </button>
          </div>

          {/* Pemisah */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", marginTop: 22 }}>
            <div style={{ flex: 1, height: 1, background: "#ECEDF0" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#B0B0BA", letterSpacing: 0.3 }}>ATAU</span>
            <div style={{ flex: 1, height: 1, background: "#ECEDF0" }} />
          </div>

          {/* Google - jalur sekunder */}
          <button onClick={signInGoogle} disabled={busyGoogle}
            style={{
              marginTop: 18, width: "100%", height: 50, borderRadius: 14, cursor: busyGoogle ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
              background: "#FFFFFF", color: "#1F2430", border: "1.5px solid #E4E5EA", fontFamily: FF, fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em",
              boxShadow: "0 1px 2px rgba(23,24,28,0.05)", opacity: busyGoogle ? 0.7 : 1, transition: "border-color .15s, box-shadow .15s, transform .1s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#CFCFD8"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(23,24,28,0.08)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E4E5EA"; e.currentTarget.style.boxShadow = "0 1px 2px rgba(23,24,28,0.05)"; }}
          >
            {busyGoogle ? <Loader2 size={19} style={{ animation: "mspin 1s linear infinite", color: "#ED1C24" }} />
                        : <><GoogleG /> Lanjutkan dengan Google</>}
          </button>

          {/* Info note */}
          <div style={{ marginTop: 28, width: "100%" }}>
            <div style={{ borderRadius: 13, background: "#F6F7F9", border: "1px solid #ECEDF0", padding: "13px 15px", display: "flex", gap: 10 }}>
              <Info size={16} color="#9A9AA6" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 12.5, color: "#6B6B76", lineHeight: 1.55 }}>
                Belum bisa masuk? Hubungi tim <b style={{ color: "#3A3A44" }}>Marcomm Region</b> Anda dan informasikan role & email aktif untuk didaftarkan.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
