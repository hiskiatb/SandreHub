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
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Home, ListChecks, CalendarDays, User2, RefreshCw } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import { getMartaScope } from "../../../../lib/martaScope";
import { HubLogoLoader } from "../../../../components/HubLogoLoader";

export const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
export const BRAND = "linear-gradient(135deg,#ED1C24,#EC008C)";
// Tinggi nav bawah TANPA safe-area (elemen safe-area-nya sendiri ditambah
// terpisah via paddingBottom di style nav-nya) - dijadikan konstanta &
// dipakai jadi `height` eksplisit di nav (bukan cuma dibiarkan setinggi
// konten) supaya layar lain yg perlu menempel PERSIS di atas nav (mis.
// action bar fixed di wizard Buat Plan) bisa memakai angka yg SAMA PERSIS,
// bukan angka taksiran yg gampang meleset & menyisakan celah/gap.
export const NAV_HEIGHT = 58;

/** Haptic feedback ringan ala iOS (selection tick) - dipakai saat pindah
 * tab bottom-nav supaya perpindahan menu "terasa" bukan cuma keliatan.
 * Web belum punya Taptic Engine asli spt native iOS, jadi ini best-effort
 * via Vibration API (Android Chrome + sebagian besar browser Android) -
 * di iOS Safari API ini tidak ada sama sekali (silent no-op, aman dipanggil
 * di semua platform). Durasi SANGAT pendek (10ms) supaya berasa "tick"
 * halus, bukan getar panjang yg terasa berat/murahan. */
export function hapticTick() {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
  } catch {}
}

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
  if (event === "SIGNED_OUT") { _sessionCache = null; try { sessionStorage.removeItem(LOGIN_LOGGED_KEY); } catch { /* noop */ } }
});

// ── Log aktivitas: login & logout ───────────────────────────────────────────
// Dicatat SEKALI per tab/sesi browser (bukan tiap kali useMartaSession
// dipanggil ulang di tiap halaman - itu bisa berkali-kali dlm satu sesi
// login yg sama). Ditandai lewat sessionStorage (bukan _sessionCache yg
// TTL-nya cuma 90 detik) supaya tidak tercatat "login" berulang cuma krn
// pindah-pindah menu/tab lama dibuka lagi.
const LOGIN_LOGGED_KEY = "mh_login_logged_uid";

function logMartaLogin(userId) {
  try {
    if (sessionStorage.getItem(LOGIN_LOGGED_KEY) === userId) return;
    sessionStorage.setItem(LOGIN_LOGGED_KEY, userId);
  } catch { /* sessionStorage tidak tersedia - tetap coba catat sekali */ }
  supabaseMarta.rpc("mh_log_activity", { p_action: "login" }).then(({ error }) => {
    if (error) console.warn("[MartaHub] gagal mencatat log login:", error.message);
  });
}

/** Dipanggil dari tombol Keluar (profile/pending/revoked) SEBELUM
 * auth.signOut() - setelah signOut, auth.uid() sudah kosong jadi RPC tidak
 * bisa lagi mengenali siapa yg logout. Best-effort: kegagalan di sini TIDAK
 * boleh menghalangi proses keluar itu sendiri. */
export async function logMartaLogout() {
  try {
    await supabaseMarta.rpc("mh_log_activity", { p_action: "logout" });
  } catch { /* best-effort, jangan sampai memblokir logout */ }
}

/** Hook sesi bersama - cek login, ambil scope MartaHub (di-cache sebentar,
 * lihat catatan di atas). Redirect ke login otomatis kalau tidak ada sesi. */
// Dipanggil setelah user berhasil ganti nama sendiri (mh_set_my_name) -
// supaya _sessionCache langsung ikut update, biar kalau pindah halaman lain
// (tanpa reload penuh) nama baru sudah kepakai, bukan nama lama sampai TTL
// cache habis / re-login.
export function updateCachedFullName(name) {
  if (_sessionCache) _sessionCache = { ..._sessionCache, scope: { ..._sessionCache.scope, fullName: name } };
}

export function useMartaSession() {
  const router = useRouter();
  const [state, setState] = useState(() =>
    _sessionCache
      ? { loading: false, email: _sessionCache.email, userId: _sessionCache.userId, scope: _sessionCache.scope }
      : { loading: true, email: null, userId: null, scope: null }
  );

  useEffect(() => {
    let alive = true;
    let channel = null;
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
      logMartaLogin(session.user.id);

      // ── Auto sign-out real-time ────────────────────────────────────────
      // Kalau admin MENGHAPUS penugasan user ini di User Management saat
      // sesi ini masih terbuka (mis. di tab/HP lain), mh_delete_assignment
      // langsung memanggil mh_rebind_email → baris mh_profiles user ini
      // diturunkan (role='pending', status='revoked') SAAT ITU JUGA. Tanpa
      // ini, sesi yang sudah terbuka baru "sadar" kalau kebetulan pindah
      // halaman lagi (useMartaSession dipanggil ulang). Berlangganan
      // perubahan baris mh_profiles milik user INI sendiri (filter id
      // = auth.uid()-nya) supaya begitu baris itu berubah jadi tidak aktif,
      // sesi langsung di-sign-out paksa & diarahkan ke login - real-time,
      // tanpa perlu refresh manual.
      try {
        channel = supabaseMarta
          .channel(`mh-profile-guard-${session.user.id}`)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "mh_profiles", filter: `id=eq.${session.user.id}` }, async (payload) => {
            const row = payload.new || {};
            if (row.status !== "active" || row.role === "pending") {
              _sessionCache = null;
              try { await supabaseMarta.auth.signOut(); } catch { /* noop */ }
              router.replace(`/martahub/m/login?revoked=1`);
            }
          })
          .subscribe();
      } catch { /* realtime opsional - kegagalan di sini tidak boleh menghalangi sesi normal */ }
    })();
    return () => { alive = false; if (channel) { try { supabaseMarta.removeChannel(channel); } catch { /* noop */ } } };
  }, [router]);

  return state;
}

// Pull-to-refresh custom - PWA standalone (`overscroll-behavior-y:none` di
// atas) sengaja MEMATIKAN gesture tarik-turun-refresh bawaan browser (perlu
// dimatikan supaya body tidak "memantul" rubber-band di iOS standalone, lihat
// catatan di nav bawah) - jadi gesture-nya harus diganti versi custom di sini
// spy tetap terasa senada dgn app native (harus tarik SAMPAI penuh baru
// memicu refresh, bukan cuma nyenggol dikit, sesuai permintaan user).
const PTR_MAX_PULL = 88; // px - batas jarak visual tarikan
const PTR_THRESHOLD = 64; // px - jarak MINIMAL yg harus ditarik sblm dilepas spy refresh terpicu
const PTR_RESIST = 0.52; // rubber-band: jari harus geser lebih jauh dari nilai visualnya

function usePullToRefresh(containerRef) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const setPullState = (v) => { pullRef.current = v; setPull(v); };
    const getScrollTop = () => window.scrollY || document.documentElement.scrollTop || 0;

    let startY = 0;
    let active = false; // sesi sentuhan ini dimulai dari posisi paling atas (scrollTop 0)

    const onTouchStart = (e) => {
      if (refreshingRef.current) return;
      if (getScrollTop() > 0) { active = false; return; }
      active = true;
      startY = e.touches[0].clientY;
      setDragging(true);
    };
    const onTouchMove = (e) => {
      if (!active || refreshingRef.current) return;
      const delta = e.touches[0].clientY - startY;
      if (delta <= 0 || getScrollTop() > 0) { active = false; setPullState(0); return; }
      e.preventDefault();
      // Damping - makin ditarik makin "berat" (bukan linear), terasa elastis spt native.
      const next = PTR_MAX_PULL * (1 - Math.exp((-delta * PTR_RESIST) / PTR_MAX_PULL));
      setPullState(Math.min(PTR_MAX_PULL, next));
    };
    const onTouchEnd = () => {
      setDragging(false);
      if (!active) return;
      active = false;
      if (pullRef.current >= PTR_THRESHOLD) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPullState(PTR_THRESHOLD - 6);
        // Beri jeda sebentar spy animasi spinner sempat kelihatan sebelum
        // halaman benar-benar reload (data di-refetch total, paling andal
        // krn tiap halaman fetch datanya sendiri lewat useEffect on-mount).
        setTimeout(() => window.location.reload(), 550);
      } else {
        setPullState(0);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [containerRef]);

  return { pull, refreshing, dragging };
}

function PullToRefreshIndicator({ pull, refreshing, dragging }) {
  const progress = Math.min(1, pull / PTR_THRESHOLD);
  const ready = progress >= 1;
  const visible = refreshing || pull > 0;
  const label = refreshing ? "Memuat ulang…" : ready ? "Lepas untuk refresh" : "Tarik untuk refresh";
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, height: PTR_MAX_PULL, zIndex: 5,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
      gap: 6, paddingBottom: 12, pointerEvents: "none",
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: "50%", background: "#FFFFFF",
        display: "flex", alignItems: "center", justifyContent: "center",
        // Glow merah dihapus - shadow netral konsisten baik lagi ditarik,
        // siap dilepas, maupun sedang refresh, tidak perlu efek menyala.
        boxShadow: "0 4px 14px rgba(23,24,28,0.12)",
        border: `1.5px solid ${ready || refreshing ? "#ED1C24" : "#EAEBEF"}`,
        opacity: visible ? 1 : 0,
        transform: `scale(${refreshing ? 1 : 0.55 + progress * 0.45})`,
        transition: dragging ? "border-color 0.15s, box-shadow 0.15s" : "opacity 0.22s ease, transform 0.3s cubic-bezier(0.34,1.56,0.64,1), border-color 0.15s, box-shadow 0.15s",
      }}>
        <RefreshCw
          size={16}
          color={ready || refreshing ? "#ED1C24" : "#B0B0BA"}
          style={{
            animation: refreshing ? "mspin 0.7s linear infinite" : "none",
            transform: refreshing ? "none" : `rotate(${progress * 220}deg)`,
            transition: dragging ? "none" : "transform 0.25s ease",
          }}
        />
      </div>
      <div style={{
        fontSize: 10, fontWeight: 700, color: ready || refreshing ? "#ED1C24" : "#9A9AA6", fontFamily: FF,
        opacity: visible && pull > 24 ? 1 : 0,
        transition: dragging ? "none" : "opacity 0.2s ease",
        whiteSpace: "nowrap",
      }}>
        {label}
      </div>
    </div>
  );
}

export default function MobileShell({ active, children, hideNav, fab }) {
  const router = useRouter();
  const ptrRef = useRef(null);
  const { pull, refreshing, dragging } = usePullToRefresh(ptrRef);
  const activeNavIndex = NAV_ITEMS.findIndex((item) => item.key === active);

  // ── Feedback instan saat pindah tab ─────────────────────────────────────
  // Sebelumnya tap ikon nav langsung memanggil router.push() tanpa indikasi
  // apapun - kalau kode halaman tujuan belum ke-cache/di-compile (umum di
  // dev, atau di koneksi lambat), layar terasa "freeze" beberapa detik krn
  // TIDAK ADA tanda tap-nya kepencet. isPending (useTransition) dipakai
  // utk menandai "sedang berpindah", dipakai utk 2 hal: (1) tab yg ditap
  // langsung ganti ikon jadi spinner kecil, (2) progress bar tipis muncul
  // di paling atas layar - selama transisi berlangsung. Begitu halaman
  // baru selesai mount, isPending otomatis balik false.
  const [isPending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState(null);
  const goTo = (item) => {
    if (!item.href || item.key === active) return;
    hapticTick();
    setPendingKey(item.key);
    startTransition(() => { router.push(item.href); });
  };
  // isPending balik false stlh halaman baru mount → bersihkan pendingKey
  // supaya tidak "nyangkut" spinner kalau user balik lagi ke tab yg sama.
  useEffect(() => { if (!isPending) setPendingKey(null); }, [isPending]);

  // ── Feedback instan utk SEMUA tombol yang bisa ditap, di semua layar ────
  // Sebelumnya perbaikan "kerasa freeze" cuma dipasang di nav bawah. Supaya
  // berlaku ke SEMUA tombol di seluruh MartaHub mobile (kartu aktivitas,
  // tombol menu, CTA, tombol Kembali dll) tanpa perlu mengubah satu-satu
  // di puluhan file halaman, dipasang SATU listener klik global di sini
  // (MobileShell membungkus SEMUA halaman sesi yg sudah login) - lewat
  // capture phase supaya kepakai walau tombolnya di dalam bottom-sheet/
  // modal yg dirender di {children}.
  //
  // Didebounce 150ms sblm tombol didim+diberi spinner: aksi yg SELESAI
  // instan (buka sheet, ganti tab filter, dll) tidak sempat kelihatan
  // "kedip" - cuma aksi yg BENAR2 makan waktu (navigasi antar halaman,
  // query jaringan) yg dapat indikator. Auto-bersih begitu halaman
  // berpindah (pathname berubah) ATAU maksimal 6 detik (jaga2 kalau
  // tombolnya ternyata memicu aksi async di halaman yang sama & lupa
  // kelola loading state sendiri) supaya tombol tidak "nyangkut" kelihatan
  // disabled selamanya.
  const [tapPending, setTapPending] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    let pendingEl = null;
    let armTimer = null;
    let safetyTimer = null;

    const clearPending = () => {
      clearTimeout(safetyTimer);
      safetyTimer = null;
      if (pendingEl) { pendingEl.classList.remove("mh-tap-pending"); pendingEl = null; }
      setTapPending(false);
    };

    const onClickCapture = (e) => {
      const btn = e.target.closest("button:not([disabled]):not([data-no-tap-pending])");
      clearTimeout(armTimer);
      if (pendingEl) clearPending();
      if (!btn) return;
      armTimer = setTimeout(() => {
        if (!document.body.contains(btn)) return; // sudah hilang (mis. sheet ditutup) - tidak perlu indikator lagi
        btn.classList.add("mh-tap-pending");
        pendingEl = btn;
        setTapPending(true);
        safetyTimer = setTimeout(clearPending, 6000);
      }, 150);
    };

    document.addEventListener("click", onClickCapture, true);
    return () => {
      document.removeEventListener("click", onClickCapture, true);
      clearTimeout(armTimer);
      clearPending();
    };
  }, []);
  // Halaman berganti (navigasi berhasil) → bersihkan indikator tap manapun
  // yang masih nyala (elemen lama kemungkinan sudah unmount bersama halaman
  // sebelumnya, ini jaga2 kalau msh ada sisa).
  useEffect(() => { setTapPending(false); }, [pathname]);

  // Daftarkan service worker sekali per tab - bikin /martahub/m installable
  // sbg PWA ("Add to Home Screen"). Online-only (lihat public/martahub/sw.js),
  // tidak meng-cache data Supabase - hanya app-shell (ikon/manifest).
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/martahub/sw.js", { scope: "/martahub/m/" }).catch(() => {});
  }, []);

  // Prefetch SEMUA rute bottom-nav begitu shell mount (bukan cuma saat
  // link masuk viewport / di-hover spt default Next.js - nav bawah ini
  // memang SELALU di viewport, tapi prefetch eksplisit di sini memastikan
  // JS chunk halaman lain sudah diunduh/dicompile SEBELUM user sempat tap,
  // jadi begitu ditap, transisinya nyaris instan alih2 nunggu chunk baru
  // diambil dari jaringan.
  useEffect(() => {
    for (const item of NAV_ITEMS) if (item.href && item.key !== active) router.prefetch(item.href);
  }, [router, active]);

  return (
    <div style={{ minHeight: "100dvh", background: "#F4F5F7", color: "#17181C", fontFamily: FF, WebkitFontSmoothing: "antialiased", overscrollBehaviorY: "none" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{background:#F4F5F7 !important;overscroll-behavior-y:none;height:100%}
        @keyframes mspin{to{transform:rotate(360deg)}}
        @keyframes navIndicatorGrow{0%{transform:scaleX(0.2);opacity:0.5}55%{transform:scaleX(1.12)}100%{transform:scaleX(1);opacity:1}}
        @keyframes navProgressSlide{0%{transform:translateX(-100%)}50%{transform:translateX(30%)}100%{transform:translateX(100%)}}
        .mh-tap-pending{opacity:0.5 !important;pointer-events:none !important;transition:opacity .15s ease}
      `}</style>

      {/* Progress bar tipis di paling atas - muncul SELAMA transisi antar
          tab bottom-nav berlangsung (isPending dari useTransition), supaya
          ada tanda visual instan begitu ditap ("sudah kepencet, lagi
          proses") - bukan cuma spinner di ikon nav yg mungkin di luar
          fokus mata user saat itu. */}
      {(isPending || tapPending) && (
        <div aria-hidden style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, zIndex: 60, overflow: "hidden", background: "rgba(237,28,36,0.12)" }}>
          <div style={{ position: "absolute", top: 0, bottom: 0, width: "40%", background: "linear-gradient(90deg,#ED1C24,#EC008C)", animation: "navProgressSlide 0.9s ease-in-out infinite" }} />
        </div>
      )}

      <div ref={ptrRef} style={{ position: "relative" }}>
        <PullToRefreshIndicator pull={pull} refreshing={refreshing} dragging={dragging} />
        <div style={{
          maxWidth: 480, margin: "0 auto", paddingBottom: hideNav ? 0 : 96, overscrollBehaviorY: "none",
          // PENTING: `transform` (bahkan translateY(0px)) SELALU membuat elemen
          // ini jadi containing block baru utk descendant `position:fixed` -
          // artinya SEMUA modal/sheet (mis. DeleteActivitySheet) yang dirender
          // di dalam {children} jadi "terjebak" di sini alih-alih relatif ke
          // viewport: overlay-nya cuma setinggi konten (bukan penuh layar) dan
          // bottom nav (di luar wrapper ini) malah tampil di ATAS modal walau
          // z-index-nya lebih rendah. Makanya transform CUMA dipasang saat
          // benar2 lagi ada pull aktif (pull!==0) - saat istirahat (kondisi
          // paling umum ketika modal dibuka) nilainya "none" spy fixed-position
          // anak-anaknya balik normal relatif ke viewport.
          transform: pull !== 0 ? `translateY(${pull}px)` : "none",
          transition: dragging ? "none" : "transform 0.32s cubic-bezier(0.34,1.56,0.64,1)",
        }}>
          {children}
        </div>
      </div>

      {/* FAB (mis. "Buat Plan" di Aktivitas/Kalender) - render lewat prop
          di SINI, di LUAR wrapper transform di atas (bukan inline di dalam
          {children} spt sebelumnya). Alasan sama persis dgn modal/sheet:
          FAB pakai position:fixed relatif viewport - kalau dirender di
          dalam {children}, begitu wrapper kena transform (saat pull-to-
          refresh ditarik), FAB ikut "terjebak" jadi relatif ke wrapper
          (yg tingginya = seluruh konten, bukan viewport) alih-alih ke
          viewport - itu sebabnya FAB kelihatan "lompat" ke atas saat
          ditarik utk refresh. Di luar sini, FAB selalu aman relatif
          viewport terlepas dari drag pull-to-refresh yg sedang berjalan. */}
      {fab}

      {/* Bottom nav - mengambang, blur, konsisten dgn bahasa desain shell
          Flutter (extendBody + bottom bar blur), supaya transisi dari app
          native ke web terasa senada.
          Catatan naik-turun di PWA: sebelumnya nav ikut "memantul" saat body
          rubber-band scroll (terutama iOS standalone) - dicegah dgn
          overscroll-behavior-y:none di atas + translateZ(0) di sini supaya
          browser mem-promote nav ke layer sendiri (tidak repaint tiap scroll). */}
      {!hideNav && (
      <nav style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40, height: NAV_HEIGHT, boxSizing: "border-box",
        paddingBottom: "env(safe-area-inset-bottom,0px)",
        background: "rgba(255,255,255,0.86)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid #EAEBEF", boxShadow: "0 -2px 16px rgba(23,24,28,0.05)",
        transform: "translateZ(0)", willChange: "transform",
      }}>
        <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", position: "relative" }}>
          {/* Garis indikator menu aktif - nempel di garis atas navbar, geser
              horizontal mengikuti tab yang aktif dgn animasi pegas supaya
              perpindahan antar menu terasa hidup (bukan cuma warna ikon
              berubah tiba-tiba). */}
          {/* Digerakkan pakai transform (bukan `left`) supaya di-composite GPU -
              perpindahan antar menu jadi mulus, tidak "patah"/lag spt kalau
              animasi properti layout (left/margin) biasa. */}
          <span aria-hidden style={{
            position: "absolute", top: -1.5, left: 0, height: 3, width: `${100 / NAV_ITEMS.length}%`,
            display: "flex", justifyContent: "center",
            transform: `translateX(${activeNavIndex >= 0 ? activeNavIndex * 100 : 0}%)`,
            opacity: activeNavIndex >= 0 ? 1 : 0,
            transition: "transform 0.5s cubic-bezier(0.65,0,0.35,1), opacity 0.25s ease",
            willChange: "transform", pointerEvents: "none",
          }}>
            <span key={active} style={{
              width: 26, height: 3, borderRadius: 999, background: "linear-gradient(90deg,#ED1C24,#EC008C)",
              transformOrigin: "center", animation: "navIndicatorGrow 0.28s cubic-bezier(0.34,1.56,0.64,1)",
            }} />
          </span>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === active;
            const disabled = !item.href;
            return (
              <button
                key={item.key}
                onClick={() => goTo(item)}
                disabled={disabled}
                data-no-tap-pending
                style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                  padding: "10px 4px 8px", background: "none", border: "none", cursor: disabled ? "default" : "pointer",
                  color: isActive ? "#ED1C24" : disabled ? "#C4C4CE" : "#8A8A96", fontFamily: FF,
                  transition: "color 0.25s ease",
                }}
              >
                <span style={{
                  display: "inline-flex",
                  transform: isActive ? "scale(1.08) translateY(-1px)" : "scale(1)",
                  transition: "transform 0.4s cubic-bezier(0.65,0,0.35,1)",
                }}>
                  {pendingKey === item.key ? (
                    // Tap sudah "kena" tapi halaman tujuan masih dimuat -
                    // ikon diganti spinner supaya user langsung tahu ini
                    // BUKAN freeze, cuma lagi proses pindah halaman.
                    <RefreshCw size={20} strokeWidth={2.2} style={{ animation: "mspin 0.7s linear infinite" }} />
                  ) : (
                    <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                  )}
                </span>
                <span style={{ fontSize: 10.5, fontWeight: isActive ? 800 : 600, transition: "font-weight 0.2s ease" }}>
                  {pendingKey === item.key ? "Memuat…" : item.label}
                </span>
                {disabled && (
                  <span style={{ fontSize: 8, fontWeight: 800, color: "#C4C4CE", letterSpacing: 0.3, marginTop: -1 }}>SEGERA</span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
      )}
    </div>
  );
}

/** Loading utk KONTEN SATU HALAMAN PENUH (list utama halaman itu sendiri
 * masih kosong) - mengambil tinggi cukup besar spy tidak "meloncat" begitu
 * data datang, TAPI tetap di dalam MobileShell (nav bawah & header tetap
 * kelihatan, bukan overlay yg menutup seluruh layar). Utk loading di DALAM
 * section kecil yg halamannya sendiri sudah terlihat (mis. satu blok
 * "Aktivitas Terbaru" di Beranda, isi satu kartu, dst) pakai InlineSpinner
 * di bawah - jangan pakai ini, minHeight-nya kegedean utk konteks kecil. */
export function ShellSpinner({ minHeight, label }) {
  // Tanpa `minHeight` (kasus paling umum - loading satu halaman penuh) ->
  // dipusatkan persis di tengah LAYAR (position fixed), bukan cuma di tengah
  // kotak 50vh yang posisinya suka kelihatan "naik" tergantung tinggi
  // konten di atasnya. Kalau `minHeight` diisi eksplisit (dipakai utk
  // loading di dalam satu kartu/section kecil, mis. "120px") tetap perilaku
  // lama - dipusatkan di dalam kotak itu sendiri, bukan overlay layar penuh.
  if (!minHeight) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, pointerEvents: "none" }}>
        <div style={{ width: 26, height: 26, border: "2.5px solid #ECEDF0", borderTopColor: "#ED1C24", borderRadius: "50%", animation: "mspin 0.8s linear infinite" }} />
        {label && <div style={{ fontSize: 12, fontWeight: 600, color: "#9A9AA6" }}>{label}</div>}
      </div>
    );
  }
  return (
    <div style={{ minHeight, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
      <div style={{ width: 22, height: 22, border: "2.5px solid #ECEDF0", borderTopColor: "#ED1C24", borderRadius: "50%", animation: "mspin 0.8s linear infinite" }} />
      {label && <div style={{ fontSize: 12, fontWeight: 600, color: "#9A9AA6" }}>{label}</div>}
    </div>
  );
}

/** Loading MINIMALIS utk konteks yg lebih kecil dari satu halaman penuh:
 * satu section/blok di dalam halaman yg sisanya sudah tampil (mis. daftar
 * "Aktivitas Terbaru" di Beranda saat difilter ulang, isi satu tab/kartu),
 * atau ditaruh inline di samping teks lain. TIDAK PERNAH menutup layar -
 * cuma ambil ruang seperlunya (padding kecil, bukan minHeight besar). */
export function InlineSpinner({ label = "Memuat…", size = 16, align = "center" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: align === "center" ? "center" : "flex-start", gap: 8, padding: "14px 0", color: "#9A9AA6" }}>
      <div style={{ width: size, height: size, border: "2px solid #ECEDF0", borderTopColor: "#ED1C24", borderRadius: "50%", animation: "mspin 0.8s linear infinite", flexShrink: 0 }} />
      {label && <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>}
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
