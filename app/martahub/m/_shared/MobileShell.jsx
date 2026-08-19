"use client";
/**
 * MobileShell - kerangka bersama utk semua layar sesi mobile-web MartaHub
 * yang SUDAH login (Beranda, Aktivitas, dst). Layar login/verify TIDAK
 * memakai ini (full-bleed, tanpa nav).
 *
 * Pola: dipakai lewat komposisi eksplisit (`<MobileShell active="home">...`)
 * alih-alih Next.js layout.jsx bersarang - supaya /martahub/m/login &
 * /martahub/m/verify (yang berada di path yang sama levelnya) tidak ikut
 * kena wrapper nav ini.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, ListChecks, CalendarDays, User2 } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import { getMartaScope } from "../../../../lib/martaScope";
import { HubLogoLoader } from "../../../../components/HubLogoLoader";

export const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
export const BRAND = "linear-gradient(135deg,#ED1C24,#EC008C)";

const NAV_ITEMS = [
  { key: "home", label: "Beranda", icon: Home, href: "/martahub/m" },
  { key: "activities", label: "Aktivitas", icon: ListChecks, href: "/martahub/m/activities" },
  { key: "calendar", label: "Kalender", icon: CalendarDays, href: "/martahub/m/calendar" },
  { key: "profile", label: "Profil", icon: User2, href: "/martahub/m/profile" },
];

// ── Cache sesi (di luar komponen, level modul) ──────────────────────────────
// useMartaSession() dipanggil di SETIAP halaman /martahub/m/** (tiap halaman
// mengkomposisi <MobileShell active="...">). Sebelumnya hook ini SELALU
// mengulang dari nol tiap kali halaman baru di-mount: getSession() lalu
// getMartaScope() (query mh_profiles sungguhan lewat jaringan) - berurutan,
// tidak ada yang dirender sampai keduanya selesai. Akibatnya tiap kali
// pindah menu (Home → Aktivitas → Kalender dst) splash/spinner nongol lagi,
// padahal scope (role/branch/brand) praktis TIDAK PERNAH berubah di tengah
// sesi yang sama. Cache modul ini (pola sama dgn _branchMapPromise di
// lib/martaScope.js) menyimpan hasil resolusi terakhir; kalau masih segar
// (< SESSION_TTL_MS) dipakai LANGSUNG lewat initializer useState - render
// pertama halaman yang baru dibuka sudah punya data, TANPA splash - sambil
// tetap diverifikasi ulang diam-diam di background (stale-while-revalidate)
// supaya perubahan asli (role dicabut dll) tetap kepakai dlm waktu wajar.
const SESSION_TTL_MS = 90_000;
let _sessionCache = null; // { email, userId, scope, ts }

// Logout HARUS membuang cache ini (jangan sampai sesi user berikutnya di tab
// yang sama "mewarisi" scope user sebelumnya) - dipasang sekali di sini lewat
// listener alih-alih mengubah tiap tombol Keluar di berbagai halaman.
supabaseMarta.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") _sessionCache = null;
});

/** Hook sesi bersama - cek login, ambil scope MartaHub (di-cache sebentar,
 * lihat catatan di atas). Redirect ke login otomatis kalau tidak ada sesi. */
export function useMartaSession() {
  const router = useRouter();
  const [state, setState] = useState(() =>
    _sessionCache
      ? { loading: false, email: _sessionCache.email, userId: _sessionCache.userId, scope: _sessionCache.scope }
      : { loading: true, email: null, userId: null, scope: null }
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabaseMarta.auth.getSession();
      if (!session) { _sessionCache = null; router.replace("/martahub/m/login"); return; }
      if (!alive) return;
      const cacheFresh = _sessionCache && _sessionCache.email === session.user.email && (Date.now() - _sessionCache.ts) < SESSION_TTL_MS;
      const scope = cacheFresh ? _sessionCache.scope : await getMartaScope(session.user.email);
      if (!alive) return;
      // Baris profil ada tapi belum aktif (menunggu assign / dilepas) → jangan
      // masuk shell utama sama sekali, arahkan ke halaman status khusus -
      // SAMA PERSIS dgn routing /pending & /revoked di app Flutter.
      if (scope.authState === "revoked") { _sessionCache = null; router.replace(`/martahub/m/revoked?email=${encodeURIComponent(session.user.email)}`); return; }
      if (scope.authState === "pending") { _sessionCache = null; router.replace(`/martahub/m/pending?email=${encodeURIComponent(session.user.email)}`); return; }
      _sessionCache = { email: session.user.email, userId: session.user.id, scope, ts: Date.now() };
      if (alive) setState({ loading: false, email: session.user.email, userId: session.user.id, scope });
    })();
    return () => { alive = false; };
  }, [router]);

  return state;
}

export default function MobileShell({ active, children }) {
  const router = useRouter();

  // Daftarkan service worker sekali per tab - bikin /martahub/m installable
  // sbg PWA ("Add to Home Screen"). Online-only (lihat public/martahub/sw.js),
  // tidak meng-cache data Supabase - hanya app-shell (ikon/manifest).
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/martahub/sw.js", { scope: "/martahub/m/" }).catch(() => {});
  }, []);

  return (
    <div style={{ minHeight: "100dvh", background: "#F4F5F7", color: "#17181C", fontFamily: FF, WebkitFontSmoothing: "antialiased", overscrollBehaviorY: "none" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{background:#F4F5F7 !important;overscroll-behavior-y:none;height:100%}
        @keyframes mspin{to{transform:rotate(360deg)}}
      `}</style>

      <div style={{ maxWidth: 480, margin: "0 auto", paddingBottom: 96, overscrollBehaviorY: "none" }}>
        {children}
      </div>

      {/* Bottom nav - mengambang, blur, konsisten dgn bahasa desain shell
          Flutter (extendBody + bottom bar blur), supaya transisi dari app
          native ke web terasa senada.
          Catatan naik-turun di PWA: sebelumnya nav ikut "memantul" saat body
          rubber-band scroll (terutama iOS standalone) - dicegah dgn
          overscroll-behavior-y:none di atas + translateZ(0) di sini supaya
          browser mem-promote nav ke layer sendiri (tidak repaint tiap scroll). */}
      <nav style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40,
        paddingBottom: "env(safe-area-inset-bottom,0px)",
        background: "rgba(255,255,255,0.86)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid #EAEBEF", boxShadow: "0 -2px 16px rgba(23,24,28,0.05)",
        transform: "translateZ(0)", willChange: "transform",
      }}>
        <div style={{ maxWidth: 480, margin: "0 auto", display: "flex" }}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === active;
            const disabled = !item.href;
            return (
              <button
                key={item.key}
                onClick={() => item.href && router.push(item.href)}
                disabled={disabled}
                style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                  padding: "10px 4px 8px", background: "none", border: "none", cursor: disabled ? "default" : "pointer",
                  color: isActive ? "#ED1C24" : disabled ? "#C4C4CE" : "#8A8A96", fontFamily: FF,
                }}
              >
                <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                <span style={{ fontSize: 10.5, fontWeight: isActive ? 800 : 600 }}>{item.label}</span>
                {disabled && (
                  <span style={{ fontSize: 8, fontWeight: 800, color: "#C4C4CE", letterSpacing: 0.3, marginTop: -1 }}>SEGERA</span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function ShellSpinner() {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 24, height: 24, border: "2.5px solid #ECEDF0", borderTopColor: "#ED1C24", borderRadius: "50%", animation: "mspin 0.8s linear infinite" }} />
    </div>
  );
}

/** Splash boot penuh-layar - dipakai HANYA di gerbang boot (cek sesi login &
 * loading data awal Beranda), sama persis polanya dgn `Splash()` di
 * app/promotor/page.jsx (phase==="loading") tapi logo/varian MartaHub.
 * Bukan pengganti ShellSpinner - spinner kecil tetap dipakai utk loading
 * dalam-app (sub-halaman yg shell/nav-nya sudah tampil). */
export function MartaSplash() {
  return (
    <div className="mh-splash" style={{ minHeight: "100svh", background: "#F4F5F7", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FF }}>
      {/* Paksa kontras terang walau <html data-theme="dark"> terbawa dari dashboard */}
      <style>{`.mh-splash .hl-name-text{color:#17181C !important}.mh-splash .hl-sub-text{color:#9A9AA6 !important}`}</style>
      <HubLogoLoader variant="marta" logoSize={76} />
    </div>
  );
}
