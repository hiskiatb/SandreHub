"use client";
/**
 * MobileShell - kerangka bersama utk semua layar sesi mobile-web FitraHub
 * yang SUDAH login (Beranda, User Management, dst). Layar login TIDAK
 * memakai ini (full-bleed, tanpa nav).
 *
 * Adaptasi dari app/martahub/m/_shared/MobileShell.jsx, disederhanakan utk
 * fase pertama (User Management saja) - TAPI, berbeda dari MartaHub,
 * FitraHub TIDAK punya project/sesi Supabase sendiri: ia memakai client
 * `supabase` utama (project SandraHub) langsung, sesuai keputusan eksplisit
 * utk tidak membuat project baru. Nav extensible: "Home" & "User Management"
 * sekarang, "Reimburse" dkk menyusul nanti tinggal nambah entri NAV_ITEMS.
 */
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Home, Users2, RefreshCw } from "lucide-react";
import supabase from "../../../../lib/supabase";
import { getFitraScope, ensureFitraProfile } from "../../../../lib/fitraScope";
import { HubLogo } from "../../../../components/HubLogo";

export const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
// Merah->magenta, sama dgn brand Sandra/Marta (FitraHub tidak pakai warna beda).
export const BRAND = "linear-gradient(135deg,#ED1C24,#C6168D)";
export const ACCENT = "#ED1C24";

export const NAV_HEIGHT = 64;

const NAV_ITEMS = [
  { key: "home", label: "Beranda", icon: Home, href: "/fitrahub/m" },
  { key: "users", label: "User Management", icon: Users2, href: "/fitrahub/m/users" },
];

// ── Cache sesi (level modul, sama pola dgn useMartaSession) ─────────────────
const SESSION_TTL_MS = 90_000;
let _sessionCache = null; // { email, userId, scope, ts }

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") _sessionCache = null;
});

/** Hook sesi bersama - cek login (sesi SandraHub yg sama), pastikan baris
 * fh_profiles ada (fh_ensure_profile, best-effort), lalu ambil scope
 * FitraHub. Redirect ke login/pending otomatis sesuai authState. */
export function useFitraSession() {
  const router = useRouter();
  const [state, setState] = useState(() =>
    _sessionCache
      ? { loading: false, email: _sessionCache.email, userId: _sessionCache.userId, scope: _sessionCache.scope }
      : { loading: true, email: null, userId: null, scope: null }
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { _sessionCache = null; router.replace("/fitrahub/m/login"); return; }
      if (!alive) return;
      const cacheFresh = _sessionCache && _sessionCache.email === session.user.email && (Date.now() - _sessionCache.ts) < SESSION_TTL_MS;
      if (!cacheFresh) {
        // Provisioning first-login: buat baris fh_profiles 'pending' kalau
        // belum ada sama sekali - lihat catatan di fh_ensure_profile (DB) &
        // lib/fitraScope.js.
        await ensureFitraProfile();
      }
      const scope = cacheFresh ? _sessionCache.scope : await getFitraScope(session.user.email);
      if (!alive) return;
      if (scope.authState === "revoked") { _sessionCache = null; router.replace(`/fitrahub/m/pending?email=${encodeURIComponent(session.user.email)}&revoked=1`); return; }
      if (scope.authState === "pending") { _sessionCache = null; router.replace(`/fitrahub/m/pending?email=${encodeURIComponent(session.user.email)}`); return; }
      _sessionCache = { email: session.user.email, userId: session.user.id, scope, ts: Date.now() };
      if (alive) setState({ loading: false, email: session.user.email, userId: session.user.id, scope });
    })();
    return () => { alive = false; };
  }, [router]);

  return state;
}

export default function MobileShell({ active, children, hideNav }) {
  const router = useRouter();
  const activeNavIndex = NAV_ITEMS.findIndex((item) => item.key === active);

  useEffect(() => {
    for (const item of NAV_ITEMS) if (item.href && item.key !== active) router.prefetch(item.href);
  }, [router, active]);

  return (
    <div style={{ minHeight: "100dvh", background: "#F4F5F7", color: "#17181C", fontFamily: FF, WebkitFontSmoothing: "antialiased", overscrollBehaviorY: "none" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{background:#F4F5F7 !important;overscroll-behavior-y:none;height:100%}
        @keyframes fhspin{to{transform:rotate(360deg)}}
      `}</style>

      <div style={{ position: "relative" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", paddingBottom: hideNav ? 0 : 96 }}>
          {children}
        </div>
      </div>

      {!hideNav && (
      <nav style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40, height: NAV_HEIGHT, boxSizing: "border-box",
        paddingBottom: "env(safe-area-inset-bottom,0px)",
        background: "rgba(255,255,255,0.86)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid #EAEBEF", boxShadow: "0 -2px 16px rgba(23,24,28,0.05)",
      }}>
        <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", position: "relative" }}>
          <span aria-hidden style={{
            position: "absolute", top: -1.5, left: 0, height: 3, width: `${100 / NAV_ITEMS.length}%`,
            display: "flex", justifyContent: "center",
            transform: `translateX(${activeNavIndex >= 0 ? activeNavIndex * 100 : 0}%)`,
            opacity: activeNavIndex >= 0 ? 1 : 0,
            transition: "transform 0.5s cubic-bezier(0.65,0,0.35,1), opacity 0.25s ease",
          }}>
            <span style={{ width: 26, height: 3, borderRadius: 999, background: BRAND }} />
          </span>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === active;
            return (
              <button
                key={item.key}
                onClick={() => item.href && item.key !== active && router.push(item.href)}
                style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                  padding: "10px 4px 8px", background: "none", border: "none", cursor: "pointer",
                  color: isActive ? ACCENT : "#8A8A96", fontFamily: FF,
                  transition: "color 0.25s ease",
                }}
              >
                <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                <span style={{ fontSize: 10.5, fontWeight: isActive ? 800 : 600 }}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
      )}
    </div>
  );
}

export function ShellSpinner({ minHeight, label }) {
  if (!minHeight) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, pointerEvents: "none" }}>
        <div style={{ width: 26, height: 26, border: "2.5px solid #ECEDF0", borderTopColor: ACCENT, borderRadius: "50%", animation: "fhspin 0.8s linear infinite" }} />
        {label && <div style={{ fontSize: 12, fontWeight: 600, color: "#9A9AA6" }}>{label}</div>}
      </div>
    );
  }
  return (
    <div style={{ minHeight, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
      <div style={{ width: 22, height: 22, border: "2.5px solid #ECEDF0", borderTopColor: ACCENT, borderRadius: "50%", animation: "fhspin 0.8s linear infinite" }} />
      {label && <div style={{ fontSize: 12, fontWeight: 600, color: "#9A9AA6" }}>{label}</div>}
    </div>
  );
}

export function FitraSplash() {
  return (
    <div style={{ minHeight: "100svh", background: "#F4F5F7", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FF }}>
      <HubLogo variant="fitra" size={64} shadow />
    </div>
  );
}
