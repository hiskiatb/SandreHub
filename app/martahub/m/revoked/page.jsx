"use client";
/**
 * /martahub/m/revoked - Akses dilepas (web mobile). Padanan `revoked_screen.dart`
 * di Flutter: tidak ada jalur self-service recheck, hanya info + logout.
 */
import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldOff, LogOut } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import { HubLogo } from "../../../../components/HubLogo";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;

function RevokedInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabaseMarta.auth.getSession();
      if (!session) { router.replace("/martahub/m/login"); return; }
      if (!alive) return;
    })();
    return () => { alive = false; };
  }, [router]);

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
      `}</style>
      <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
          <HubLogo variant="marta" size={50} dark={false} shadow inBox />

          <div style={{ marginTop: 26, width: 64, height: 64, margin: "26px auto 0", borderRadius: "50%", background: "rgba(220,38,38,0.10)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ShieldOff size={28} color="#DC2626" />
          </div>

          <h1 style={{ marginTop: 18, fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>Akses Dilepas</h1>
          <p style={{ marginTop: 10, fontSize: 13, color: "#6B6B76", lineHeight: 1.6 }}>
            Akses akun {email ? <b style={{ color: "#3A3A44" }}>{email}</b> : "Anda"} ke MartaHub telah dilepas oleh tim Marcomm Region. Data plan/aktivitas yang sudah pernah dibuat tetap tersimpan.
          </p>
          <p style={{ marginTop: 8, fontSize: 12.5, color: "#8A8A96", lineHeight: 1.6 }}>
            Hubungi tim <b style={{ color: "#3A3A44" }}>Marcomm Region</b> Anda untuk mengaktifkan kembali akses.
          </p>

          <button onClick={signOut}
            style={{ marginTop: 22, width: "100%", height: 48, borderRadius: 13, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <LogOut size={14} /> Keluar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RevokedPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100svh", background: "#F4F5F7" }} />}>
      <RevokedInner />
    </Suspense>
  );
}
