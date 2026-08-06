"use client";
/**
 * /martahub/m/pending — Menunggu penetapan branch/role (web mobile).
 * Padanan `pending_screen.dart` di Flutter: ditampilkan saat baris
 * mh_profiles belum ada, atau status/role belum aktif (default aman —
 * lihat authState di lib/martaScope.js).
 */
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock, Copy, Check, RefreshCw, LogOut, Loader2 } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import { getMartaScope } from "../../../../lib/martaScope";
import { HubLogo } from "../../../../components/HubLogo";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;

function PendingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabaseMarta.auth.getSession();
      if (!session) { router.replace("/martahub/m/login"); return; }
      if (!alive) return;
    })();
    return () => { alive = false; };
  }, [router]);

  const copyEmail = async () => {
    try { await navigator.clipboard.writeText(email); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* noop */ }
  };

  const recheck = async () => {
    setChecking(true);
    try {
      const scope = await getMartaScope(email);
      if (scope.authState === "active") { router.replace("/martahub/m"); return; }
      if (scope.authState === "revoked") { router.replace(`/martahub/m/revoked?email=${encodeURIComponent(email)}`); return; }
    } finally {
      setChecking(false);
    }
  };

  const signOut = async () => {
    await supabaseMarta.auth.signOut();
    router.replace("/martahub/m/login");
  };

  return (
    <div style={{ minHeight: "100svh", background: "#F4F5F7", color: "#17181C", fontFamily: FF, WebkitFontSmoothing: "antialiased" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{background:#F4F5F7 !important}
        @keyframes mspin{to{transform:rotate(360deg)}}
      `}</style>
      <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
          <HubLogo variant="marta" size={50} dark={false} shadow inBox />

          <div style={{ marginTop: 26, width: 64, height: 64, margin: "26px auto 0", borderRadius: "50%", background: "rgba(180,83,9,0.10)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Clock size={28} color="#B45309" />
          </div>

          <h1 style={{ marginTop: 18, fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>Menunggu Penetapan Branch</h1>
          <p style={{ marginTop: 10, fontSize: 13, color: "#6B6B76", lineHeight: 1.6 }}>
            Akun Anda sudah masuk, tapi belum ditetapkan ke branch/role tertentu di MartaHub. Hubungi tim <b style={{ color: "#3A3A44" }}>Marcomm Region</b> Anda dengan email di bawah untuk didaftarkan.
          </p>

          {email && (
            <button onClick={copyEmail}
              style={{ marginTop: 18, width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 14px", borderRadius: 12, background: "#FFFFFF", border: "1px solid #E9EAEE", cursor: "pointer", fontFamily: FF }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</span>
              {copied ? <Check size={15} color="#15803D" /> : <Copy size={15} color="#9A9AA6" />}
            </button>
          )}

          <button onClick={recheck} disabled={checking}
            style={{ marginTop: 22, width: "100%", height: 50, borderRadius: 13, border: "none", cursor: checking ? "default" : "pointer",
              background: "linear-gradient(135deg,#ED1C24,#EC008C)", color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 12px rgba(17,17,20,0.1)" }}>
            {checking ? <Loader2 size={16} style={{ animation: "mspin .85s linear infinite" }} /> : <RefreshCw size={15} />}
            Saya sudah di-assign — cek ulang
          </button>

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
