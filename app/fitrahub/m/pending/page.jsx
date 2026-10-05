"use client";
/**
 * /fitrahub/m/pending - Menunggu approval akses FitraHub (web mobile).
 * Padanan app/martahub/m/pending/page.jsx - ditampilkan saat baris
 * fh_profiles belum aktif (role='pending' atau status!='active'), atau
 * eksplisit 'revoked' (query ?revoked=1).
 */
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock, ShieldOff, Copy, Check, RefreshCw, LogOut, Loader2 } from "lucide-react";
import supabase from "../../../../lib/supabase";
import { getFitraScope } from "../../../../lib/fitraScope";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;

function PendingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const revoked = searchParams.get("revoked") === "1";
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/fitrahub/m/login"); return; }
      if (!alive) return;
    })();
    return () => { alive = false; };
  }, [router]);

  // Cek diam-diam tiap 15 detik (sama pola dgn Marta) - begitu admin
  // mengaktifkan akun ini di User Management, halaman ini pindah sendiri ke
  // Beranda tanpa perlu user tahu harus tap apa.
  useEffect(() => {
    if (!email || revoked) return;
    let alive = true;
    const silentCheck = async () => {
      const scope = await getFitraScope(email);
      if (!alive) return;
      if (scope.authState === "active") router.replace("/fitrahub/m");
    };
    const timer = setInterval(() => { if (document.visibilityState === "visible") silentCheck(); }, 15_000);
    const onVisible = () => { if (document.visibilityState === "visible") silentCheck(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [email, revoked, router]);

  const copyEmail = async () => {
    try { await navigator.clipboard.writeText(email); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* noop */ }
  };

  const recheck = async () => {
    setChecking(true);
    try {
      const scope = await getFitraScope(email);
      if (scope.authState === "active") router.replace("/fitrahub/m");
    } finally {
      setChecking(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/fitrahub/m/login");
  };

  return (
    <div style={{ minHeight: "100svh", background: "#F4F5F7", color: "#17181C", fontFamily: FF, WebkitFontSmoothing: "antialiased" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{background:#F4F5F7 !important}
        @keyframes fhspin{to{transform:rotate(360deg)}}
      `}</style>
      <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
          <div style={{ width: 64, height: 64, margin: "0 auto", borderRadius: "50%", background: revoked ? "rgba(220,38,38,0.10)" : "rgba(237,28,36,0.10)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {revoked ? <ShieldOff size={28} color="#DC2626" /> : <Clock size={28} color="#ED1C24" />}
          </div>

          <h1 style={{ marginTop: 18, fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>
            {revoked ? "Akses Dicabut" : "Menunggu Approval"}
          </h1>
          <p style={{ marginTop: 10, fontSize: 13, color: "#6B6B76", lineHeight: 1.6 }}>
            {revoked
              ? "Akses FitraHub Anda telah dicabut. Hubungi admin FitraHub jika ini tidak sesuai."
              : (<>Akun Anda sudah masuk, tapi belum diaktifkan di FitraHub. Hubungi admin FitraHub Anda dengan email di bawah untuk didaftarkan.</>)}
          </p>

          {email && (
            <button onClick={copyEmail}
              style={{ marginTop: 18, width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 14px", borderRadius: 12, background: "#FFFFFF", border: "1px solid #E9EAEE", cursor: "pointer", fontFamily: FF }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</span>
              {copied ? <Check size={15} color="#15803D" /> : <Copy size={15} color="#9A9AA6" />}
            </button>
          )}

          {!revoked && (
            <button onClick={recheck}
              style={{ marginTop: 22, width: "100%", height: 50, borderRadius: 13, border: "none", cursor: checking ? "default" : "pointer",
                background: "linear-gradient(135deg,#ED1C24,#C6168D)", color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 12px rgba(237,28,36,0.18)" }}>
              {checking ? <Loader2 size={16} style={{ animation: "fhspin .85s linear infinite" }} /> : <RefreshCw size={15} />}
              Saya sudah di-approve - cek ulang
            </button>
          )}

          <button onClick={signOut}
            style={{ marginTop: 12, width: "100%", height: 46, borderRadius: 13, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <LogOut size={14} /> Keluar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PendingPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100svh", background: "#F4F5F7" }} />}>
      <PendingInner />
    </Suspense>
  );
}
