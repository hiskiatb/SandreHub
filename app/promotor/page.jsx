"use client";
/**
 * /promotor — App Promotor (mobile web)
 * Alur baru (geofencing, tanpa Check-In/Check-Out):
 *   Login(SSO) → cek assignment (pending?) → pilih outlet aktif → aktifkan lokasi
 *   → Tag QR (setiap tagging dicek jarak ke outlet; di luar radius → konfirmasi,
 *     tetap tersimpan tapi ditandai untuk evaluasi) → Riwayat.
 * Sumber data: tabel pts_* (TraceHub). Online-only.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin, LogOut, RefreshCw, Clock, Store, QrCode, CheckCircle2,
  ShoppingBag, ChevronRight, ChevronDown, History, Navigation, AlertTriangle,
  X, ChevronLeft, CalendarDays, Trash2,
  ArrowLeftRight, Inbox, ShieldQuestion, Radar, RefreshCcw, Pencil, Check,
  Target, TrendingUp, Sparkles,
  ListChecks, ScanFace, XCircle, HelpCircle, IdCard, Circle,
} from "lucide-react";
import lottie from "lottie-web";
import successAnimData from "../../public/promotor/success-animation.json";
import supabase from "../../lib/supabase";
import { HubLogoLoader } from "../../components/HubLogoLoader";
import { WhatsAppIcon } from "../../components/WhatsAppIcon";
import { buildWaLink, fetchCallCenterSetting } from "../../lib/whatsapp";
import { QRScannerSheet, AccessHelp, BottomSheet, Sheet, Spinner } from "./components";
import {
  ymNow, ymLabel, pad2, fmtTime, fmtDateFull, fmtDateTime,
  normalizePhone, getPosition, checkGeoPermission,
} from "./ptsClient";

// PTS mulai berjalan Agustus 2026 — tidak ada mapping/data sebelum bulan
// ini. Semua daftar periode di bawah dihitung OTOMATIS dari tanggal hari
// ini, mulai dari Agustus 2026, sehingga begitu kalender berganti bulan
// (mis. 1 September 2026), daftar & default periode ikut maju sendiri
// tanpa perlu update kode setiap bulan.
const PTS_FIRST_PERIOD = "2026-08"; // PTS mulai berjalan — tidak ada data sebelum ini

// Bulan berjalan sekarang, tapi tidak pernah mundur sebelum PTS_FIRST_PERIOD
// (menjaga perilaku lama: sebelum tanggal 1 Agustus 2026 tiba, aplikasi
// tetap menganggap "sekarang" adalah Agustus 2026 — bukan bulan sebelumnya
// yang belum ada datanya sama sekali).
function currentPtsPeriod() {
  const now = new Date();
  const ym = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  return ym < PTS_FIRST_PERIOD ? PTS_FIRST_PERIOD : ym;
}

// Daftar periode untuk mapping outlet/assignment (dipakai di layar Menunggu
// Aktivasi) — Agustus 2026 s.d. bulan berjalan sekarang, urut naik. Dulu ini
// daftar TETAP yang harus ditambah manual tiap bulan baru; sekarang otomatis
// mengikuti tanggal hari ini.
function periodOptions() {
  const out = [];
  const curYm = currentPtsPeriod();
  let y = 2026, m = 8;
  while (true) {
    const ym = `${y}-${pad2(m)}`;
    out.push(ym);
    if (ym >= curYm) break;
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

// Selector "Lihat performa" di beranda — TERPISAH dari `period` (yang
// mengatur mapping outlet/assignment, dipakai di layar Menunggu Aktivasi).
// Ini murni untuk menjelajah histori Kontribusi Anda ke bulan-bulan lalu,
// karena pencapaian bisa "pindah periode" mengikuti ga_dt hasil validasi
// GA — bukan lagi selalu bulan tagging. Rentang: 6 bulan ke belakang s.d.
// bulan berjalan sekarang (tidak perlu bulan depan, belum ada datanya).
function statsPeriodOptions() {
  const out = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}`;
    if (ym < PTS_FIRST_PERIOD) break; // jangan tampilkan bulan sebelum PTS mulai
    out.push(ym);
  }
  return out; // terbaru dulu
}

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const C = {
  bg: "#F4F5F7", card: "#FFFFFF", sub: "#F3F4F6", line: "#E9EAEE", lineSoft: "#F0F1F4",
  hi: "#17181C", mid: "#61616C", lo: "#A2A2AD", brand: "#ED1C24", mag: "#C6168D",
  green: "#1A9E5A", amber: "#B7791F", blue: "#2563EB",
  sm: "0 1px 2px rgba(23,24,28,0.05)",
  md: "0 1px 3px rgba(23,24,28,0.06), 0 10px 26px rgba(23,24,28,0.05)",
  lg: "0 2px 6px rgba(23,24,28,0.07), 0 20px 44px rgba(23,24,28,0.09)",
  grad: "linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)",
};

/* Palet identitas untuk hero card home — dipakai konsisten sebagai aksen
   di ring target, chip status, dan sub-stat. Charcoal jadi dasar hero
   (bukan hitam pekat) supaya tetap terasa premium tapi tidak "gelap mati". */
const PAL = {
  charcoal: "#4A4A4D",
  red: "#ED1C24",
  yellow: "#F6CB43",
  teal: "#5AC8A8",
  purple: "#B0298F",
  pink: "#EC1E79",
};

/* Warna identitas brand — dipakai konsisten di seluruh app promotor supaya
   promotor langsung sadar dia sedang meng-claim untuk brand yang mana.
   IM3 kuning → teks HARUS gelap (kuning + putih tidak terbaca);
   3ID magenta → teks putih.
   `soft`/`ink` untuk badge kecil di atas kartu putih, `solid`/`onSolid`
   untuk tombol primary. */
const BRAND = {
  // Kontras teks-vs-tombol sudah dicek: IM3 11.65:1, 3ID 5.38:1 (WCAG AA
  // butuh 4.5:1 utk teks 16.5px). Magenta dipakai #C6168D — bukan #EC008C
  // yang cuma 4.25:1 dan gagal AA untuk teks putih.
  IM3:   { solid: "#FFCB05", onSolid: "#17181C", soft: "rgba(255,203,5,0.20)", ink: "#8A6A00" },
  "3ID": { solid: "#C6168D", onSolid: "#FFFFFF", soft: "rgba(198,22,141,0.10)", ink: "#C6168D" },
};
const brandTheme = (b) => BRAND[b] || null;

// Nada sukses — pakai sound effect asli (mirip notifikasi Apple Pay) yang
// disediakan. Sengaja diputar lewat Web Audio API (decode buffer sekali,
// lalu setiap kali dipanggil bikin AudioBufferSourceNode baru), BUKAN lewat
// elemen <audio> biasa. Alasannya: file mp3 aslinya sempat punya metadata
// ID3 (genre "Music", cover art) yang membuat sebagian browser/HP
// menampilkan kontrol media (now-playing/lock screen) dengan tombol ulang —
// jadi terasa seperti "lagu yang bisa diputar berulang", padahal maksudnya
// cuma efek suara sekali ketuk. Metadata itu sudah dibersihkan dari file-nya,
// dan dengan Web Audio API pemutarannya tidak pernah masuk ke Media Session
// (tidak ada UI now-playing/repeat sama sekali) serta otomatis berhenti
// begitu selesai — tidak ada opsi loop.
let _successCtx = null;
let _successBufferPromise = null;
function playSuccessTone() {
  try {
    if (typeof window === "undefined") return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    if (!_successCtx) _successCtx = new AC();
    if (_successCtx.state === "suspended") _successCtx.resume().catch(() => {});
    if (!_successBufferPromise) {
      _successBufferPromise = fetch("/promotor/success-sound.mp3")
        .then((r) => r.arrayBuffer())
        .then((buf) => _successCtx.decodeAudioData(buf));
    }
    _successBufferPromise.then((buffer) => {
      const src = _successCtx.createBufferSource();
      src.buffer = buffer;
      src.loop = false; // one-shot, tegas — bukan musik yang bisa diulang
      const gain = _successCtx.createGain();
      gain.gain.value = 0.9;
      src.connect(gain); gain.connect(_successCtx.destination);
      src.start(0);
    }).catch(() => { /* abaikan — gagal decode/putar tidak boleh menghentikan alur claim */ });
  } catch { /* abaikan */ }
}

// Jarak antar dua titik (meter) — dipakai untuk cek geofence SEPENUHNYA di
// browser (lihat tagSale di AppShell). Lat/lng device promotor tidak pernah
// dikirim ke server; server hanya menerima hasil akhirnya (dalam radius
// atau tidak), sesuai keputusan agar koordinat mentah tidak pernah tersimpan
// di database.
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Ikon animasi sukses — pakai file Lottie asli yang dilampirkan (bukan lagi
// checkmark SVG buatan sendiri), dirender via lottie-web langsung ke sebuah
// <div> container. Diputar sekali (loop:false) begitu overlay muncul.
function SuccessLottieIcon() {
  const hostRef = useRef(null);
  useEffect(() => {
    if (!hostRef.current) return;
    const anim = lottie.loadAnimation({
      container: hostRef.current,
      renderer: "svg",
      loop: false,
      autoplay: true,
      animationData: successAnimData,
    });
    return () => anim.destroy();
  }, []);
  return <div ref={hostRef} style={{ width: 140, height: 140 }} />;
}

const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };

export default function PromotorApp() {
  const router = useRouter();
  const [phase, setPhase] = useState("loading");   // loading | pending | app
  const [email, setEmail] = useState("");
  const [uid, setUid] = useState("");
  const [name, setName] = useState("");
  const [promotorId, setPromotorId] = useState(null);
  const [salesTarget, setSalesTarget] = useState(150); // diset admin SPM per-promotor

  /* ── Mode Pratinjau Admin (khusus SPM Sumatera) ────────────────────────
     ?admin_preview=<pts_promotor.id> — SPM bisa melihat app ini PERSIS
     seperti yang dilihat promotor tsb saat login, tanpa perlu tahu
     password/akun Google-nya. Data live (query yang sama, RLS admin sudah
     mengizinkan baca semua baris) — hanya AKSI TULIS yang dikunci (lihat
     `previewMode` di AppShell) supaya tidak ada sale/nama/mapping yang
     ke-submit atas nama SPM padahal sedang "meminjam" tampilan promotor. */
  const [previewId, setPreviewId] = useState(null);
  const [previewReady, setPreviewReady] = useState(false);
  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get("admin_preview");
    setPreviewId(pid || null);
    setPreviewReady(true);
  }, []);
  const previewMode = !!previewId;
  const backToDashboard = () => router.push("/dashboard");
  const [outlets, setOutlets] = useState([]);      // {code,id,branch,area,region,name}
  const [assignmentSrc, setAssignmentSrc] = useState(null); // { sourcePeriod, carried, mc } — mapping ini dari bulan mana
  const [activeOutlet, setActiveOutlet] = useState(null);
  const [todaySales, setTodaySales] = useState([]);
  const [view, setView] = useState("home");        // home | history
  const [history, setHistory] = useState([]);

  const [geo, setGeo] = useState(null);
  const [geoErr, setGeoErr] = useState("");
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const [period, setPeriod] = useState(currentPtsPeriod);
  // Satu-satunya selector periode yang tampil di beranda — lihat komentar
  // statsPeriodOptions() di atas. Default bulan berjalan.
  const [statsPeriod, setStatsPeriod] = useState(statsPeriodOptions()[0]);

  // Tombol "Hubungi Call Center" (WhatsApp) — nomor & pesan pembuka diatur
  // SPM Sumatera lewat dashboard (pts_call_center_setting), dipakai baik di
  // layar Menunggu Aktivasi maupun di header aplikasi utama.
  const [waLink, setWaLink] = useState(null);
  useEffect(() => {
    let alive = true;
    fetchCallCenterSetting().then((s) => {
      if (!alive) return;
      setWaLink(s ? buildWaLink(s.whatsapp_number, s.message_template) : null);
    });
    return () => { alive = false; };
  }, []);
  // Toast error dibiarkan tampil jauh lebih lama (dan bisa diketuk untuk
  // ditutup) — sebelumnya 2.6 detik untuk semua tone, terlalu cepat untuk
  // sempat dibaca/screenshot saat error.
  const flash = (msg, tone = "ok") => {
    setToast({ msg, tone });
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), tone === "err" ? 10000 : 2600);
  };

  // Jaring pengaman: tangkap error JS/promise yang lolos dari try/catch di
  // manapun (mis. dari dalam QRScannerSheet) supaya tidak gagal diam-diam
  // tanpa pesan apapun — semua error tetap tampil lewat toast yang sama.
  useEffect(() => {
    const onError = (e) => flash("Error tak terduga: " + (e?.error?.message || e?.message || "unknown"), "err");
    const onRejection = (e) => flash("Error tak terduga: " + (e?.reason?.message || e?.reason || "unknown"), "err");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);

  const loadTodaySales = useCallback(async (proId, outletId) => {
    if (!outletId) { setTodaySales([]); return; }
    const { data } = await supabase.from("pts_sale").select("*")
      .eq("promotor_id", proId).eq("outlet_id", outletId).gte("tagged_at", todayStart())
      .order("tagged_at", { ascending: false });
    setTodaySales(data || []);
  }, []);

  /* ── Identitas: auth + tautan ke pts_promotor — jalan SEKALI saat masuk.
     Identitas dipegang oleh promotor_id (uuid, permanen) — bukan email.
     Email hanya dipakai SEKALI untuk mengklaim slot yang sudah didaftarkan
     admin (mis. dari roster ID); setelah auth_user_id tertaut, perubahan
     nama/email berikutnya tidak memutus riwayat pencapaian. ────────────── */
  const resolveIdentity = useCallback(async () => {
    if (!previewReady) return; // tunggu cek ?admin_preview dulu, baru resolve identitas
    const { data: ures } = await supabase.auth.getUser();
    const user = ures?.user;
    if (!user) { router.replace("/promotor/login"); return; }

    if (previewId) {
      // Mode Pratinjau Admin: verifikasi role SPM Sumatera lewat akun admin
      // yang SEDANG login (bukan akun promotor), lalu muat identitas TARGET
      // langsung by id — bukan identitas si admin sendiri.
      const { data: adminProfile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (adminProfile?.role !== "spm_sumatera") {
        flash("Anda tidak punya akses untuk mode pratinjau ini.", "err");
        router.replace("/dashboard");
        return;
      }
      const { data: target } = await supabase.from("pts_promotor").select("*").eq("id", previewId).maybeSingle();
      if (!target) {
        flash("Promotor tidak ditemukan.", "err");
        router.replace("/dashboard");
        return;
      }
      setEmail(target.email || ""); setUid(target.auth_user_id || "");
      setPromotorId(target.id);
      setName(target.full_name || target.promotor_id || "Promotor");
      setSalesTarget(target.sales_target || 150);
      return;
    }

    const em = (user.email || "").toLowerCase();
    setEmail(em); setUid(user.id);
    const googleName = user.user_metadata?.full_name || user.user_metadata?.name || em.split("@")[0];

    // 1) Cari profil yang sudah tertaut ke akun ini (via auth_user_id — stabil).
    let { data: prof } = await supabase.from("pts_promotor")
      .select("*").eq("auth_user_id", user.id).maybeSingle();

    if (!prof) {
      // 2) Belum tertaut: klaim slot yang sudah didaftarkan admin lewat email,
      //    tanpa menimpa promotor_id/full_name yang sudah diisi admin.
      const { data: existing } = await supabase.from("pts_promotor")
        .select("*").ilike("email", em).is("auth_user_id", null).maybeSingle();
      if (existing) {
        const { data: linked } = await supabase.from("pts_promotor")
          .update({ auth_user_id: user.id, full_name: existing.full_name || googleName, updated_at: new Date().toISOString() })
          .eq("id", existing.id).select().single();
        prof = linked;
      } else {
        // 3) Benar-benar baru: buat profil "pending" tanpa promotor_id (admin
        //    akan mengaitkan ID roster ke profil ini nanti bila perlu).
        const { data: created } = await supabase.from("pts_promotor")
          .insert({ email: em, auth_user_id: user.id, full_name: googleName, status: "pending" })
          .select().single();
        prof = created;
      }
    }
    setPromotorId(prof?.id || null);
    setName(prof?.full_name || googleName);
    setSalesTarget(prof?.sales_target || 150);
  }, [router, previewReady, previewId]);

  useEffect(() => { resolveIdentity(); }, [resolveIdentity]);

  /* ── Assignment per periode — jalan ulang tiap kali promotorId siap ATAU
     periode yang dipilih berubah (dropdown bulan), tanpa perlu resolve
     identitas dari awal lagi. ─────────────────────────────────────────── */
  const loadPeriodAssignment = useCallback(async () => {
    if (!promotorId) return;
    setPhase("loading");
    // Alokasi outlet dianggap tetap sampai diubah admin — kalau periode ini
    // belum pernah di-upload, pts_effective_assignment otomatis pakai
    // mapping bulan terakhir yang ada (bukan kosong).
    const { data: asgAll } = await supabase.rpc("pts_effective_assignment", { p_period: period });
    const rows = (asgAll || []).filter((r) => r.promotor_id_ref === promotorId && r.status === "active");
    const active = rows.length > 0;
    setAssignmentSrc(active ? { sourcePeriod: rows[0].source_period, carried: rows[0].is_carried_forward, mc: rows[0].mc || null } : null);

    // "status" TIDAK disentuh di sini lagi — sejak sekarang artinya identitas
    // Aktif/Vacant/Pending yang dikelola admin (Roster Promotor), bukan lagi
    // "ada assignment periode ini atau tidak".
    await supabase.from("pts_promotor")
      .update({ region: rows[0]?.region || null, updated_at: new Date().toISOString() })
      .eq("id", promotorId);

    if (!active) { setOutlets([]); setActiveOutlet(null); setTodaySales([]); setPhase("pending"); return; }

    // daftar outlet unik
    const byCode = new Map();
    rows.forEach((r) => { if (!byCode.has(r.outlet_code)) byCode.set(r.outlet_code, { code: r.outlet_code, id: r.outlet_id, branch: r.branch, area: r.area, region: r.region, brand: r.brand, cluster: r.cluster, name: r.outlet_code }); });
    const outletList = [...byCode.values()];

    // Ambil code_3id per outlet — satu outlet fisik bisa punya ID IM3 dan ID
    // 3ID sekaligus, jadi pencapaian di outlet itu harus dipilih brand-nya
    // saat tagging (bukan diambil dari assignment).
    const outletIds = outletList.map((o) => o.id).filter(Boolean);
    if (outletIds.length) {
      // latitude/longitude ikut diambil di sini — dipakai promotor app untuk
      // menghitung geofence LOKAL di browser (lihat tagSale), bukan lagi
      // dikirim ke server untuk dihitung di sana.
      const { data: outRows } = await supabase.from("pts_outlet").select("id,code_3id,name,latitude,longitude").in("id", outletIds);
      const meta = new Map((outRows || []).map((r) => [r.id, r]));
      outletList.forEach((o) => {
        const m = meta.get(o.id);
        o.code3id = m?.code_3id || null;
        if (m?.name) o.name = m.name;   // nama outlet asli, bukan pakai kode sebagai fallback
        o.latitude = m?.latitude ?? null;
        o.longitude = m?.longitude ?? null;
      });
    }
    setOutlets(outletList);

    // outlet aktif: otomatis jika hanya 1, selain itu tunggu pilihan promotor
    if (outletList.length === 1) { setActiveOutlet(outletList[0]); await loadTodaySales(promotorId, outletList[0].id); }
    else { setActiveOutlet(null); setTodaySales([]); }

    setPhase("app");
  }, [promotorId, period, loadTodaySales]);

  useEffect(() => { loadPeriodAssignment(); }, [loadPeriodAssignment]);

  // izin lokasi di awal
  useEffect(() => {
    if (phase !== "app") return;
    let alive = true;
    (async () => {
      const st = await checkGeoPermission();
      if (st === "denied") { setGeoErr("Izin lokasi ditolak. Aktifkan lokasi untuk melakukan claim."); return; }
      try { const p = await getPosition(); if (alive) { setGeo(p); setGeoErr(""); } }
      catch { if (alive) setGeoErr("Lokasi belum aktif. Ketuk untuk mengizinkan."); }
    })();
    return () => { alive = false; };
  }, [phase]);

  const refreshGeo = async () => {
    try { const p = await getPosition(); setGeo(p); setGeoErr(""); return p; }
    catch { setGeoErr("Tidak bisa mendapatkan lokasi. Pastikan GPS & izin aktif."); return null; }
  };

  // Termasuk nomor yang AWALNYA diajukan promotor lain tapi hasil validasi
  // GA memindahkan kreditnya ke promotor ini (credited_promotor_id) — bukan
  // cuma yang dia tagging sendiri (promotor_id).
  //
  // PENTING — sinkronisasi dengan Kontribusi Anda/Riwayat/Detail Outlet:
  // sebelumnya query ini TIDAK difilter periode sama sekali, hanya diambil
  // "80 baris terakhir lintas semua periode & outlet". Itu sumber utama
  // ketidaksamaan angka antara Kontribusi Anda (loadSummary, difilter
  // `credited_period = statsPeriod`) dengan Riwayat Pengajuan & Detail
  // Pengajuan Outlet (dulu memakai daftar 80-baris ini apa adanya) — kalau
  // promotor sudah punya >80 transaksi sepanjang masa, transaksi lama dari
  // periode yang sedang dilihat bisa "terdesak keluar" dari 80 baris itu
  // oleh transaksi periode lain yang lebih baru, sehingga jumlahnya beda.
  // Sekarang query ini memakai FILTER PERIODE YANG SAMA PERSIS dengan
  // loadSummary, supaya ketiga tampilan selalu menunjukkan data yang identik.
  const loadHistory = useCallback(async () => {
    const { data } = await supabase.from("pts_sale").select("*")
      .eq("credited_period", statsPeriod)
      .or(`promotor_id.eq.${promotorId},credited_promotor_id.eq.${promotorId}`)
      .order("tagged_at", { ascending: false }).limit(500);
    setHistory(data || []);
  }, [promotorId, statsPeriod]);

  const signOut = async () => { await supabase.auth.signOut(); router.replace("/promotor/login"); };

  /* ── Render ────────────────────────────────────────────────── */
  if (phase === "loading") return <Splash />;
  if (phase === "pending") return <Pending email={email} period={period} setPeriod={setPeriod} onReload={loadPeriodAssignment} onSignOut={signOut} previewMode={previewMode} onBack={backToDashboard} waLink={waLink} />;

  return (
    <AppShell
      name={name} setName={setName} email={email} uid={uid} promotorId={promotorId} salesTarget={salesTarget}
      period={period} setPeriod={setPeriod} statsPeriod={statsPeriod} setStatsPeriod={setStatsPeriod}
      outlets={outlets} setOutlets={setOutlets} assignmentSrc={assignmentSrc}
      activeOutlet={activeOutlet} setActiveOutlet={setActiveOutlet}
      todaySales={todaySales} loadTodaySales={loadTodaySales}
      geo={geo} geoErr={geoErr} refreshGeo={refreshGeo}
      view={view} setView={setView}
      history={history} loadHistory={loadHistory}
      onSignOut={signOut} flash={flash} toast={toast}
      previewMode={previewMode} onBack={backToDashboard}
      waLink={waLink}
    />
  );
}

/* ══════════════════ Splash (loader SandraHub) ══════════════════ */
function Splash() {
  return (
    <div className="pts-splash" style={{ minHeight: "100svh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FF }}>
      {/* Paksa kontras terang walau <html data-theme="dark"> terbawa dari dashboard */}
      <style>{`.pts-splash .hl-name-text{color:#17181C !important}.pts-splash .hl-sub-text{color:#9A9AA6 !important}`}</style>
      <HubLogoLoader variant="sandra" logoSize={76} />
    </div>
  );
}

/* ══════════════════ Pending ══════════════════ */
function Pending({ email, period, setPeriod, onReload, onSignOut, previewMode, onBack, waLink }) {
  const [busy, setBusy] = useState(false);
  const reload = async () => { setBusy(true); await onReload(); setBusy(false); };
  return (
    <div style={{ minHeight: "100svh", background: C.bg, color: C.hi, fontFamily: FF, display: "flex", flexDirection: "column", padding: "0 26px", textAlign: "center" }}>
      <style>{`@keyframes fl{0%,100%{opacity:.55}50%{opacity:1}}`}</style>
      {previewMode && (
        <div style={{ margin: "14px -26px 0", padding: "10px 26px", background: "#FDF6E3", borderBottom: "1px solid #F0DCA8", fontSize: 12, fontWeight: 700, color: "#B7791F" }}>Mode Pratinjau Admin — read-only</div>
      )}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <div style={{ width: 76, height: 76, borderRadius: 22, background: "rgba(255,176,32,0.12)", border: "1px solid rgba(255,176,32,0.3)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 22, animation: "fl 2s ease infinite" }}>
          <Spinner size={34} color={C.amber} />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em" }}>Menunggu Aktivasi</h1>
        <p style={{ fontSize: 14, color: C.mid, lineHeight: 1.6, maxWidth: 320, marginTop: 10 }}>
          Email <b style={{ color: C.hi }}>{email}</b> berhasil masuk, tetapi belum dipetakan ke outlet untuk periode <b style={{ color: C.hi }}>{ymLabel(period)}</b>.
          Hubungi <b style={{ color: C.hi }}>SPM Sumatera</b> Anda untuk didaftarkan di Data Promotor &amp; Data Mapping Promotor, lalu tekan Muat Ulang.
        </p>
        {setPeriod && (
          <div style={{ marginTop: 16, width: "100%", maxWidth: 280 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.lo, marginBottom: 6 }}>Cek periode lain</label>
            <div style={{ position: "relative" }}>
              <select value={period} onChange={(e) => setPeriod(e.target.value)}
                style={{ appearance: "none", width: "100%", height: 46, borderRadius: 12, border: `1px solid ${C.line}`, background: C.card, color: C.hi, fontFamily: FF, fontSize: 14, fontWeight: 600, padding: "0 38px 0 14px", cursor: "pointer" }}>
                {periodOptions().map((p) => <option key={p} value={p}>{ymLabel(p)}</option>)}
              </select>
              <ChevronDown size={16} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: C.lo, pointerEvents: "none" }} />
            </div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: "calc(env(safe-area-inset-bottom,0px) + 26px)" }}>
        <button onClick={reload} disabled={busy} style={{ height: 54, borderRadius: 15, border: "none", background: C.brand, color: "#fff", fontFamily: FF, fontSize: 15.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, cursor: "pointer", opacity: busy ? 0.7 : 1 }}>
          {busy ? <Spinner size={19} color="#fff" /> : <RefreshCw size={18} />} Muat Ulang Status
        </button>
        {waLink && (
          <a href={waLink} target="_blank" rel="noopener noreferrer"
            style={{ height: 50, borderRadius: 14, textDecoration: "none", background: "#E9FBF0", color: "#128C4A", border: "1.5px solid #BDEFD1", fontFamily: FF, fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <WhatsAppIcon size={18} /> Hubungi Call Center via WhatsApp
          </a>
        )}
        {previewMode ? (
          <button onClick={onBack} style={{ height: 50, borderRadius: 14, border: `1px solid ${C.line}`, background: "transparent", color: C.mid, fontFamily: FF, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}>
            <ChevronLeft size={16} /> Kembali ke Dashboard
          </button>
        ) : (
          <button onClick={onSignOut} style={{ height: 50, borderRadius: 14, border: `1px solid ${C.line}`, background: "transparent", color: C.mid, fontFamily: FF, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}>
            <LogOut size={16} /> Keluar
          </button>
        )}
      </div>
    </div>
  );
}

/* ══════════════════ App Shell ══════════════════ */
function AppShell(p) {
  const { name, setName, email, promotorId, salesTarget, period, setPeriod, statsPeriod, setStatsPeriod, outlets, setOutlets, assignmentSrc, activeOutlet, setActiveOutlet, todaySales, loadTodaySales, geo, geoErr, refreshGeo, view, setView, history, loadHistory, onSignOut, flash, toast, previewMode, onBack, waLink } = p;
  // Semua aksi tulis dikunci saat Mode Pratinjau Admin — dipanggil di awal
  // tiap handler supaya tidak ada satupun jalur yang lolos.
  const guardPreview = () => { if (previewMode) { flash("Mode pratinjau — tidak bisa melakukan aksi ini.", "err"); return true; } return false; };
  const [sheet, setSheet] = useState(null);        // 'qr'
  const [pickOutlet, setPickOutlet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [geoHelp, setGeoHelp] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [delSale, setDelSale] = useState(null);
  const [delAck, setDelAck] = useState(false);      // centang wajib jika nomor sudah tervalidasi GA
  const [success, setSuccess] = useState(null);     // msisdn berhasil → animasi
  const [taken, setTaken] = useState(null);          // { phone, owner }
  const [selfClaim, setSelfClaim] = useState(null);  // { phone, sale } — nomor ini sudah di-claim SENDIRI di outlet lain
  const [moveBusy, setMoveBusy] = useState(false);
  const [outsideConfirm, setOutsideConfirm] = useState(null); // { phone, raw, distance, radius }
  const [incoming, setIncoming] = useState([]);      // permintaan transfer masuk
  const [approveReq, setApproveReq] = useState(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [brand, setBrand] = useState(null);          // brand yang dipilih utk claim di outlet dual-brand
  useEffect(() => { setBrand(null); }, [activeOutlet?.id]);

  // Cache radius geofence per outlet (hasil pts_resolve_radius) — dipakai
  // untuk validasi lokasi LOKAL di browser (lihat tagSale), supaya tidak
  // perlu tanya server berulang-ulang untuk outlet yang sama.
  const radiusCacheRef = useRef(new Map());
  const resolveRadius = async (outletId) => {
    if (radiusCacheRef.current.has(outletId)) return radiusCacheRef.current.get(outletId);
    const { data, error } = await supabase.rpc("pts_resolve_radius", { p_outlet: outletId });
    const r = error || data == null ? 30 : Number(data);
    radiusCacheRef.current.set(outletId, r);
    return r;
  };
  const [summary, setSummary] = useState(null);      // ringkasan klaim per periode
  const [editProfile, setEditProfile] = useState(false);   // edit nama sendiri
  const [renamingOutlet, setRenamingOutlet] = useState(null); // outlet yg sedang diganti namanya

  /* Navigasi dari kartu Kontribusi Anda (sisi detail) ke Riwayat Pengajuan,
     sudah dipisah ke konteks/section yang sesuai (mis. tap "RGU-GA
     Biometric" → Riwayat langsung menampilkan hanya section tervalidasi
     biometric). `null` = tampilkan semua section seperti biasa. */
  const [historyFilter, setHistoryFilter] = useState(null);
  const openHistory = (filter = null) => { setHistoryFilter(filter); setView("history"); };

  /* Kembali ke beranda — outlet yang tadi dipilih SENGAJA tidak diingat.
     Begitu keluar dari layar Claim Penjualan, memilih outlet lagi lain kali
     selalu diminta ulang (bukan otomatis terpilih dari sesi sebelumnya). */
  const goHome = () => { setView("home"); setActiveOutlet(null); setBrand(null); };

  /* Ubah nama sendiri — hanya full_name, ID (promotor_id/user_id_3id) dikunci
     server-side (trigger) apapun yang dikirim dari sini. */
  const saveProfileName = async (val) => {
    if (previewMode) throw new Error("Mode pratinjau — tidak bisa mengubah data.");
    const trimmed = val.trim();
    if (!trimmed) throw new Error("Nama tidak boleh kosong.");
    const { error } = await supabase.from("pts_promotor").update({ full_name: trimmed, updated_at: new Date().toISOString() }).eq("id", promotorId);
    if (error) throw error;
    setName(trimmed);
  };

  /* Ubah nama outlet yang sedang di-mapping ke promotor ini — RLS+trigger
     server memastikan hanya kolom `name` yang benar-benar berubah, ID
     outlet (IM3/3ID) tidak bisa disentuh dari sini. */
  const saveOutletName = async (outlet, val) => {
    if (previewMode) throw new Error("Mode pratinjau — tidak bisa mengubah data.");
    const trimmed = val.trim();
    if (!trimmed) throw new Error("Nama outlet tidak boleh kosong.");
    const { error } = await supabase.from("pts_outlet").update({ name: trimmed }).eq("id", outlet.id);
    if (error) throw error;
    setOutlets((prev) => prev.map((o) => (o.id === outlet.id ? { ...o, name: trimmed } : o)));
    if (activeOutlet?.id === outlet.id) setActiveOutlet((prev) => (prev ? { ...prev, name: trimmed } : prev));
  };

  const loadIncoming = useCallback(async () => {
    const { data } = await supabase.from("pts_transfer_request")
      .select("*").ilike("from_email", email).eq("status", "pending").order("requested_at", { ascending: false });
    setIncoming(data || []);
  }, [email]);
  useEffect(() => { loadIncoming(); }, [loadIncoming]);

  /* Notifikasi info (hasil validasi GA yang memindahkan/mempengaruhi
     pencapaian) — digabung ke Kotak Masuk yang sama dengan permintaan
     approval di atas, tapi tabel & makna berbeda: ini murni informasi,
     tidak perlu keputusan. Badge berkurang HANYA setelah item benar-benar
     ditap (lihat markNotificationRead). */
  const [notifications, setNotifications] = useState([]);
  const [notifFilter, setNotifFilter] = useState("all"); // 'all' | 'YYYY-MM'
  const loadNotifications = useCallback(async () => {
    if (!promotorId) { setNotifications([]); return; }
    const { data } = await supabase.from("pts_notification")
      .select("*").eq("promotor_id", promotorId).order("created_at", { ascending: false }).limit(150);
    setNotifications(data || []);
  }, [promotorId]);
  useEffect(() => { loadNotifications(); }, [loadNotifications]);
  useEffect(() => { if (inboxOpen) loadNotifications(); }, [inboxOpen, loadNotifications]);

  const markNotificationRead = async (n) => {
    if (!n.read_at) {
      await supabase.rpc("pts_mark_notification_read", { p_id: n.id });
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    }
  };

  /* Ringkasan Claim Penjualan: jumlah SP di-claim + rincian validasi GA —
     difilter dari `credited_period`, BUKAN dari tagged_at. Ini disengaja:
     setelah GA Validation v2, periode "yang diakui" ikut ga_dt, jadi
     pengajuan yang ditag bulan ini bisa saja ternyata masuk hitungan bulan
     lalu (atau sebaliknya). `statsPeriod` adalah satu-satunya selector
     periode di beranda — gantinya otomatis me-refresh ringkasan ini.
     Query juga mencakup nomor yang KREDITNYA masuk ke promotor ini meski
     awalnya diajukan promotor lain (credited_promotor_id). */
  const loadSummary = useCallback(async () => {
    if (!promotorId) { setSummary(null); return; }
    const { data } = await supabase.from("pts_sale").select("ga_status,biometric_status,credited_transfer_type,credited_promotor_id")
      .eq("credited_period", statsPeriod)
      .or(`promotor_id.eq.${promotorId},credited_promotor_id.eq.${promotorId}`);
    // Baris yang KREDITNYA sudah pindah ke promotor lain (diff_promotor,
    // credited_promotor_id != promotorId) tidak lagi dihitung sebagai
    // pencapaian promotor ini — hanya relevan di Riwayat sebagai catatan.
    const rows = (data || []).filter((r) => r.credited_promotor_id == null || r.credited_promotor_id === promotorId);
    // Rincian status RGU-GA selengkap mungkin — bukan cuma "tervalidasi vs
    // belum", tapi tiap tahap pengajuan sampai hasil akhirnya:
    //  - pending      : BELUM_TERVALIDASI — masih dalam pengajuan, GA belum sempat cocok
    //  - validated    : TERVALIDASI + TERVALIDASI_LUAR_AREA — RGU-GA ketemu & cocok
    //    - bio/reg    : pecahan validated berdasar biometric_status
    //  - waitingOutlet: MENUNGGU_MAPPING_OUTLET — outlet dikenal, belum ada promotor termapping
    //  - rejected     : TIDAK_SESUAI_OUTLET — outlet di luar jaringan promotor manapun
    //  - notFound     : TIDAK_DITEMUKAN — sampai window habis, RGU-GA tidak pernah ketemu sama sekali
    const validated = rows.filter((r) => r.ga_status === "TERVALIDASI" || r.ga_status === "TERVALIDASI_LUAR_AREA").length;
    const bio = rows.filter((r) => r.biometric_status === "BIOMETRIC").length;
    const reg = rows.filter((r) => r.biometric_status === "REGULAR").length;
    const pending = rows.filter((r) => !r.ga_status || r.ga_status === "BELUM_TERVALIDASI").length;
    const waitingOutlet = rows.filter((r) => r.ga_status === "MENUNGGU_MAPPING_OUTLET").length;
    const rejected = rows.filter((r) => r.ga_status === "TIDAK_SESUAI_OUTLET").length;
    const notFound = rows.filter((r) => r.ga_status === "TIDAK_DITEMUKAN").length;
    setSummary({ total: rows.length, validated, bio, reg, pending, waitingOutlet, rejected, notFound });
  }, [promotorId, statsPeriod]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  /* Total RGU-GA SP Biometric SELURUH outlet yang sedang dimapping ke promotor
     ini (bukan cuma pengajuan miliknya sendiri) — murni angka pembanding,
     TIDAK PERNAH disimpan ke database, hanya dihitung di sisi client dari
     data pts_sale yang sudah ada (jadi otomatis ikut ter-refresh setiap kali
     admin upload raw data GA baru, tanpa perlu logic tambahan apapun).
     Dipakai untuk menunjukkan persentase kontribusi promotor terhadap total
     pencapaian outlet-nya. */
  const [outletBioTotal, setOutletBioTotal] = useState(null);
  const loadOutletBioTotal = useCallback(async () => {
    const outletIds = [...new Set(outlets.map((o) => o.id).filter(Boolean))];
    if (!outletIds.length) { setOutletBioTotal(null); return; }
    const { count } = await supabase.from("pts_sale").select("id", { count: "exact", head: true })
      .eq("credited_period", statsPeriod).eq("biometric_status", "BIOMETRIC").in("credited_outlet_id", outletIds);
    setOutletBioTotal(typeof count === "number" ? count : null);
  }, [outlets, statsPeriod]);
  useEffect(() => { loadOutletBioTotal(); }, [loadOutletBioTotal]);

  const decideTransfer = async (req, approve) => {
    if (guardPreview()) return;
    setApproveReq(null); setBusy(true);
    try {
      const { data, error } = await supabase.rpc(approve ? "pts_approve_transfer" : "pts_reject_transfer", { p_id: req.id });
      if (error) throw error;
      if (data?.status === "approved") { flash("Nomor dipindahkan."); if (activeOutlet) await loadTodaySales(promotorId, activeOutlet.id); loadSummary(); }
      else if (data?.status === "rejected") flash("Pengajuan ditolak.");
      else flash("Tidak dapat memproses.", "err");
      await loadIncoming();
    } catch (e) { flash("Gagal: " + describeError(e, "decideTransfer"), "err"); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (success) { const id = setTimeout(() => setSuccess(null), 2600); return () => clearTimeout(id); } }, [success]);

  const fixGeo = async () => { const g = await refreshGeo(); if (!g) setGeoHelp(true); else setGeoHelp(false); };
  const initial = (name || "P").trim().charAt(0).toUpperCase();
  // Nama lengkap TETAP disimpan di database (pts_promotor.full_name) apa
  // adanya — ini murni potongan tampilan supaya header tidak melebar saat
  // nama gabungan panjang (>14 karakter, pakai kata pertama saja).
  const displayName = useMemo(() => {
    const trimmed = (name || "").trim();
    return trimmed.length > 14 ? (trimmed.split(/\s+/)[0] || trimmed) : trimmed;
  }, [name]);

  /* Tombol "Claim Penjualan" mengambang — supaya aksi utama tetap 1 tap
     tanpa perlu scroll lewat hero card + detail status dulu. Kalau semua
     syarat sudah terpenuhi, langsung buka scanner; kalau belum, geser layar
     ke bagian yang perlu diisi (bukan cuma diam/error tanpa arah). */
  const actionSectionRef = useRef(null);
  const needsBrandFab = !!activeOutlet?.code3id;
  const fabReady = !!(activeOutlet && geo && (!needsBrandFab || brand));
  // "Claim Penjualan" sekarang membuka LAYAR TERSENDIRI (bukan lagi disatukan
  // dengan beranda) — beranda hanya menampilkan ringkasan capaian, sementara
  // pemilihan outlet, gerbang lokasi, dan panel tagging pindah ke view
  // "claim" yang baru. Kalau semua syarat sudah siap, scanner QR langsung
  // dibuka begitu masuk layar tsb supaya tetap terasa 1 tap.
  const handleFabClick = () => {
    if (guardPreview()) return;
    setView("claim");
    if (fabReady) setSheet("qr");
  };

  // Riwayat juga dimuat saat masuk layar Claim Penjualan — dipakai untuk
  // menampilkan detail pengajuan per outlet (bukan lagi cuma "terjual hari
  // ini") di bawah panel tagging.
  useEffect(() => { if (view === "history" || view === "claim") loadHistory(); }, [view, loadHistory]);

  const soldCount = todaySales.length;

  const chooseOutlet = async (o) => { setActiveOutlet(o); setPickOutlet(false); await loadTodaySales(promotorId, o.id); };

  /* Tag penjualan (QR) — via RPC pts_tag_sale. Geofencing dihitung
     SEPENUHNYA di sini (browser): jarak antara lokasi device promotor dan
     titik outlet dibandingkan ke radius yang berlaku, dan HANYA hasilnya
     (dalam radius atau tidak) yang dikirim ke server — koordinat mentah
     device promotor tidak pernah lewat jaringan maupun tersimpan di
     database. IMEI juga tidak lagi diminta/dikirim (dihapus sesi
     sebelumnya). */
  const tagSale = async (normalized, raw, confirmOutside) => {
    if (!activeOutlet?.id) throw new Error("Outlet aktif tidak ditemukan, pilih ulang outlet.");
    if (activeOutlet.code3id && !brand) throw new Error("Pilih brand (IM3/3ID) untuk pencapaian di outlet ini terlebih dulu.");

    const hasCoords = activeOutlet.latitude != null && activeOutlet.longitude != null
      && !(Number(activeOutlet.latitude) === 0 && Number(activeOutlet.longitude) === 0);
    let withinRadius = null, geoAvailable = !!geo, localDistance = null, localRadius = null;
    if (hasCoords) {
      if (geo) {
        localRadius = await resolveRadius(activeOutlet.id);
        localDistance = haversineMeters(Number(activeOutlet.latitude), Number(activeOutlet.longitude), geo.lat, geo.lng);
        withinRadius = localDistance <= localRadius;
      } else {
        geoAvailable = false;
      }
    }

    const { data, error } = await supabase.rpc("pts_tag_sale", {
      p_phone: normalized, p_session: null, p_outlet: activeOutlet.id, p_raw: String(raw),
      p_confirm_outside: confirmOutside,
      p_brand: activeOutlet.code3id ? brand : null,
      p_within_radius: withinRadius, p_geo_available: geoAvailable,
    });
    if (error) throw error;
    // Jarak/radius yang dihitung lokal ditempel di sini (bukan dari server —
    // server tidak pernah tahu angka jaraknya) supaya dialog konfirmasi
    // "di luar radius" tetap bisa menunjukkan info ke promotor secara
    // sesaat, tanpa disimpan di database.
    if (data?.status === "outside_radius") { data.distance_meters = localDistance; data.radius_meters = localRadius; }
    return data;
  };

  // Ambil pesan sedetail mungkin dari error Supabase (message/details/hint/code)
  // dan catat ke console — supaya kegagalan tagging bisa didiagnosis dari
  // remote debugging, bukan cuma tampil "Gagal menyimpan" tanpa info.
  const describeError = (e, tag) => {
    console.error(`[PTS ${tag}]`, e);
    if (!e) return "Terjadi kesalahan tidak dikenal.";
    const parts = [e.message, e.details, e.hint].filter(Boolean);
    const msg = parts.length ? parts.join(" — ") : String(e);
    return e.code ? `${msg} (${e.code})` : msg;
  };

  const onQR = async ({ phone, raw }) => {
    setSheet(null);
    if (guardPreview()) return;
    try {
      const { normalized, valid } = normalizePhone(phone);
      if (!valid) { flash(`Nomor tidak valid: ${normalized || phone}`, "err"); return; }
      if (!activeOutlet) { flash("Pilih outlet aktif terlebih dulu.", "err"); return; }
      let g = geo;
      if (!g) { g = await refreshGeo(); if (!g) { setGeoHelp(true); return; } }
      setBusy(true);
      const data = await tagSale(normalized, raw, false);
      await handleTagResult(data, normalized, raw);
    } catch (e) { flash("Gagal menyimpan: " + describeError(e, "onQR"), "err"); setBusy(false); }
  };

  const handleTagResult = async (data, normalized, raw) => {
    const st = data?.status;
    if (st === "ok") {
      // Refresh SEMUA ringkasan yang bergantung pada data ini — supaya
      // begitu berhasil claim, promotor langsung lihat angka bertambah di
      // Kontribusi Anda, Detail Pengajuan Outlet, dan Riwayat, tanpa perlu
      // keluar-masuk layar dulu.
      await loadTodaySales(promotorId, activeOutlet.id);
      loadSummary(); loadOutletBioTotal(); loadHistory();
      setBusy(false); playSuccessTone();
      setSuccess({ msisdn: normalized, at: new Date().toISOString(), brand: data?.brand || null });
      return;
    }
    if (st === "self") { setBusy(false); setSelfClaim({ phone: normalized, sale: data?.sale || null }); return; }
    if (st === "taken" || st === "taken_race") { setBusy(false); setTaken({ phone: normalized, owner: data?.owner || null }); return; }
    if (st === "outside_radius") {
      setBusy(false);
      setOutsideConfirm({ phone: normalized, raw, distance: data?.distance_meters, radius: data?.radius_meters });
      return;
    }
    if (st === "geo_required") { setBusy(false); flash("Lokasi diperlukan untuk claim di outlet ini. Aktifkan lokasi lalu coba lagi.", "err"); setGeoHelp(true); return; }
    if (st === "invalid_phone") { flash(`Nomor tidak valid: ${normalized || raw}`, "err"); setBusy(false); return; }
    if (st === "unauth") { flash("Sesi login berakhir, silakan masuk ulang.", "err"); setBusy(false); return; }
    flash("Gagal menyimpan.", "err"); setBusy(false);
  };

  const confirmOutsideTag = async () => {
    const c = outsideConfirm; if (!c) return;
    setOutsideConfirm(null);
    if (guardPreview()) return;
    setBusy(true);
    try {
      const data = await tagSale(c.phone, c.raw, true);
      await handleTagResult(data, c.phone, c.raw);
    } catch (e) { flash("Gagal menyimpan: " + describeError(e, "confirmOutsideTag"), "err"); setBusy(false); }
  };

  /* Ajukan pemindahan nomor yang sudah ditag orang lain — outlet aktif dikirim
     eksplisit (bukan diturunkan dari sesi check-in/out lama yang sudah tidak
     dipakai lagi), supaya outlet tujuan pengajuan tercatat benar. */
  const requestTransfer = async () => {
    const phone = taken?.phone; if (!phone) return;
    setTaken(null);
    if (guardPreview()) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("pts_request_transfer", { p_phone: phone, p_outlet: activeOutlet?.id || null });
      if (error) throw error;
      if (data?.status === "requested") flash("Pengajuan pemindahan terkirim.");
      else if (data?.status === "self") flash("Nomor ini sudah milik Anda.");
      else if (data?.status === "notfound") flash("Nomor tidak ditemukan.", "err");
      else flash("Gagal mengajukan pemindahan.", "err");
    } catch (e) { flash("Gagal mengajukan: " + describeError(e, "requestTransfer"), "err"); }
    finally { setBusy(false); }
  };

  /* Pindahkan nomor yang sudah di-claim SENDIRI ke outlet aktif saat ini —
     tanpa approval (beda dengan requestTransfer di atas), karena datanya
     tetap milik promotor yang sama, cuma atribusi outlet/brand-nya yang
     diperbaiki. */
  const moveOwnSale = async () => {
    const c = selfClaim; if (!c || !activeOutlet) return;
    if (guardPreview()) return;
    setMoveBusy(true);
    try {
      const { data, error } = await supabase.rpc("pts_move_own_sale", {
        p_phone: c.phone, p_new_outlet: activeOutlet.id,
        p_brand: activeOutlet.code3id ? brand : null,
      });
      if (error) throw error;
      if (data?.status === "ok") {
        setSelfClaim(null);
        await loadTodaySales(promotorId, activeOutlet.id);
        loadSummary(); loadOutletBioTotal(); loadHistory();
        const targetBrand = activeOutlet.code3id ? brand : null;
        flash(targetBrand ? `Nomor dipindahkan & dicatat sebagai ${targetBrand}.` : "Nomor dipindahkan ke outlet ini.");
      } else if (data?.status === "invalid_brand") {
        flash("Pilih brand (IM3/3ID) untuk outlet ini terlebih dulu.", "err");
      } else {
        flash("Gagal memindahkan nomor.", "err");
      }
    } catch (e) { flash("Gagal memindahkan: " + describeError(e, "moveOwnSale"), "err"); }
    finally { setMoveBusy(false); }
  };

  const doDeleteSale = async () => {
    const s = delSale; if (!s) return;
    setDelSale(null); setDelAck(false);
    if (guardPreview()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("pts_sale").delete().eq("id", s.id);
      if (error) throw error;
      if (activeOutlet) await loadTodaySales(promotorId, activeOutlet.id);
      loadSummary(); loadHistory();
      flash("Nomor dihapus");
    } catch (e) { flash("Gagal menghapus: " + describeError(e, "doDeleteSale"), "err"); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position: "relative", minHeight: "100svh", background: C.bg, color: C.hi, fontFamily: FF, paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 24px)", isolation: "isolate" }}>
      <style>{`@keyframes up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @keyframes pop{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}
        @keyframes sheetup{from{transform:translateY(100%)}to{transform:none}}
        @keyframes auroraFloat{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-3%,2%) scale(1.06)}}
        @keyframes shakeCard{10%,90%{transform:translateX(-1px)}20%,80%{transform:translateX(2px)}30%,50%,70%{transform:translateX(-4px)}40%,60%{transform:translateX(4px)}}
        .press{transition:transform .12s}.press:active{transform:scale(.975)}`}</style>

      {/* Aurora — sentuhan warna lembut di belakang konten, statis & sangat
          halus (bukan dekorasi berat) supaya beranda terasa premium tanpa
          mengganggu keterbacaan. */}
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: -120, left: -80, width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle, rgba(237,28,36,0.10), transparent 70%)", animation: "auroraFloat 16s ease-in-out infinite" }} />
        <div style={{ position: "absolute", top: -60, right: -100, width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle, rgba(198,22,141,0.08), transparent 70%)", animation: "auroraFloat 20s ease-in-out infinite reverse" }} />
      </div>
      <div style={{ position: "relative", zIndex: 1 }}>

      {/* Mode Pratinjau Admin — pita read-only, supaya tidak mungkin lupa
          sedang "meminjam" tampilan promotor lain. */}
      {previewMode && (
        <div style={{ position: "sticky", top: 0, zIndex: 6, padding: "calc(env(safe-area-inset-top,0px) + 8px) 18px 8px", background: "#B7791F", color: "#fff", fontSize: 12, fontWeight: 700, textAlign: "center" }}>
          Mode Pratinjau Admin — melihat sebagai {name} · read-only
        </div>
      )}

      {/* Header — pada sub-screen (claim/history) menampilkan JUDUL LAYAR,
          bukan lagi mengulang "Selamat datang / Nama" (itu cukup di beranda
          saja, supaya tidak terasa berulang & lebih jelas konteksnya). */}
      <div style={{ padding: `${previewMode ? "10px" : "calc(env(safe-area-inset-top,0px) + 16px)"} 18px 12px`, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: previewMode ? 34 : 0, background: "linear-gradient(180deg,rgba(244,245,247,0.92) 70%,rgba(244,245,247,0))", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", zIndex: 5, maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {view !== "home" ? (
            <>
              <IconBtn onClick={goHome} aria-label="Kembali ke beranda"><ChevronLeft size={18} /></IconBtn>
              <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em", color: C.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {view === "claim" ? "Claim Penjualan" : "Riwayat Pengajuan"}
              </span>
            </>
          ) : (
            <>
              <div style={{ width: 40, height: 40, borderRadius: 13, flexShrink: 0, background: C.grad, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, boxShadow: "0 6px 16px rgba(237,28,36,0.24)" }}>{initial}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.mid, fontWeight: 600, letterSpacing: "0.02em" }}>Selamat datang</div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, marginTop: 1 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150, color: C.hi }}>{displayName}</span>
                  {!previewMode && (
                    <button className="press" onClick={() => setEditProfile(true)} aria-label="Edit profil"
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 8, border: `1px solid ${C.line}`, background: C.card, color: C.mid, cursor: "pointer", flexShrink: 0, boxShadow: C.sm }}>
                      <Pencil size={11} />
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <IconBtn onClick={() => setInboxOpen(true)} badge={incoming.length + notifications.filter((n) => !n.read_at).length}><Inbox size={17} /></IconBtn>
          {previewMode ? (
            <IconBtn onClick={onBack} label="Kembali"><ChevronLeft size={16} /></IconBtn>
          ) : (
            <IconBtn onClick={() => setConfirmLogout(true)} danger label="Keluar"><LogOut size={16} /></IconBtn>
          )}
        </div>
      </div>

      <div style={{ padding: "8px 18px 0", maxWidth: 560, margin: "0 auto" }}>
        {view === "history" ? (
          <HistoryView history={history} onDelete={(s) => setDelSale(s)} promotorId={promotorId}
            period={statsPeriod} onPeriodChange={setStatsPeriod} filter={historyFilter} />
        ) : view === "claim" ? (
          <div ref={actionSectionRef} style={{ animation: "up .32s cubic-bezier(.22,1,.36,1)" }}>
            {/* Label "Aktivitas Hari Ini" & chip "Lokasi aktif" dihilangkan
                dari sini (status geo tetap divalidasi di balik layar,
                GeoGatePanel tampil kalau belum ada izin lokasi). Selector
                periode PINDAH ke dalam kartu "Pilih Outlet Anda"/"Outlet
                Aktif" di bawah (bukan lagi baris terpisah di sini) — dan
                yang dipakai adalah `period` (periode assignment/mapping
                outlet), BUKAN `statsPeriod` (itu cuma utk tampilan Kontribusi
                Anda di beranda). Ini penting: ganti periode di sini akan
                ikut mengganti daftar outlet yang termapping (lihat
                loadPeriodAssignment yang bergantung ke `period`), sesuai
                permintaan "mapping outlet juga berubah sesuai periode yang
                dipilih". Default-nya selalu bulan berjalan. */}
            {!activeOutlet ? (
              <OutletSelectPanel outlets={outlets} onPick={chooseOutlet} onRename={setRenamingOutlet} period={period} onPeriodChange={setPeriod} />
            ) : !geo ? (
              <GeoGatePanel outlet={activeOutlet} err={geoErr} onFix={fixGeo} onChangeOutlet={() => setPickOutlet(true)} />
            ) : (
              <TagPanel outlet={activeOutlet} sales={todaySales} soldCount={soldCount} busy={busy} geo={geo}
                brand={brand} onBrandChange={setBrand} assignmentSrc={assignmentSrc} onRename={setRenamingOutlet}
                onTag={() => { if (!guardPreview()) setSheet("qr"); }} onDelete={(s) => setDelSale(s)} onChangeOutlet={() => setPickOutlet(true)} multiOutlet={outlets.length > 1}
                detail={history.filter((s) => (s.outlet_id === activeOutlet.id || s.credited_outlet_id === activeOutlet.id) && s.credited_period === period)}
                promotorId={promotorId} periodLabel={ymLabel(period)} period={period} onPeriodChange={setPeriod} />
            )}
          </div>
        ) : (
          <div style={{ animation: "up .32s cubic-bezier(.22,1,.36,1)" }}>
            {/* Kiri: info MC promotor (dari mapping assignment) — kanan:
                satu-satunya selector periode di beranda, mengontrol tampilan
                Kontribusi Anda (bukan outlet aktif untuk tagging, itu selalu
                ikut bulan berjalan sesungguhnya). Bisa mundur ke bulan lalu
                karena pencapaian bisa "pindah periode" mengikuti ga_dt.
                "Lokasi aktif" dihilangkan dari beranda — itu hanya relevan
                saat benar-benar tagging di layar Claim Penjualan. */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: C.lo }}>Micro Cluster</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200, marginTop: 1 }}>{assignmentSrc?.mc || "—"}</div>
              </div>
              <div style={{ position: "relative" }}>
                <select value={statsPeriod} onChange={(e) => setStatsPeriod(e.target.value)}
                  style={{ appearance: "none", height: 38, borderRadius: 12, border: `1px solid ${C.brand}55`, background: C.card, color: C.hi, fontFamily: FF, fontSize: 13.5, fontWeight: 700, padding: "0 30px 0 34px", cursor: "pointer", boxShadow: C.sm }}>
                  {statsPeriodOptions().map((pOpt) => <option key={pOpt} value={pOpt}>{ymLabel(pOpt)}</option>)}
                </select>
                <CalendarDays size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.brand, pointerEvents: "none" }} />
                <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: C.lo, pointerEvents: "none" }} />
              </div>
            </div>

            {/* Kontribusi Anda — kartu flip: sisi depan ringkasan target,
                sisi belakang rincian status pengajuan. Digabung jadi satu
                kartu (bukan dua kartu terpisah selalu tampil) supaya Claim
                Penjualan bisa naik lebih dekat ke jempol. */}
            <ContributionCard summary={summary} target={salesTarget}
              outletBioTotal={outletBioTotal} onNavigateHistory={openHistory} outlets={outlets} />

            {/* Ringkasan outlet — hanya pratinjau, tap untuk buka layar Claim
                Penjualan (outlet, gerbang lokasi, dan tagging kini di layar
                terpisah, tidak lagi menyatu dengan beranda). */}
            <ClaimEntryCard outlet={activeOutlet} outletsCount={outlets.length} soldCount={soldCount}
              onOpen={handleFabClick} />

            {/* Navigasi sekunder — pindahan dari header (Riwayat & Call
                Center) supaya header lebih ringkas dan kedua aksi ini lebih
                mudah dijangkau di dekat area jempol. */}
            <button onClick={() => openHistory(null)} className="press" style={{
              width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
              border: `1px solid ${C.line}`, background: C.card, borderRadius: 16, padding: "13px 14px",
              marginBottom: 10, cursor: "pointer", fontFamily: FF, boxShadow: C.sm,
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: C.sub, color: C.hi, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <History size={16} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.hi }}>Riwayat Pengajuan Anda</div>
                <div style={{ fontSize: 11.5, color: C.mid, marginTop: 1 }}>Lihat semua nomor yang pernah di-claim</div>
              </div>
              <ChevronRight size={16} color={C.lo} />
            </button>

            {waLink && (
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="press" style={{
                width: "100%", display: "flex", alignItems: "center", gap: 12, textDecoration: "none",
                border: "1px solid #BDEFD1", background: "#F0FBF4", borderRadius: 16, padding: "13px 14px",
                marginBottom: 14, fontFamily: FF, boxShadow: C.sm,
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 11, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <WhatsAppIcon size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "#128C4A" }}>Mengalami kendala?</div>
                  <div style={{ fontSize: 11.5, color: "#3E8464", marginTop: 1 }}>Hubungi Call Center via WhatsApp</div>
                </div>
                <ChevronRight size={16} color="#7FB89A" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* Konfirmasi Logout */}
      {confirmLogout && (
        <div style={{ position: "fixed", inset: 0, zIndex: 140, background: "rgba(17,18,22,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 26 }} onClick={() => setConfirmLogout(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 360, background: C.card, borderRadius: 24, padding: "26px 22px 20px", boxShadow: C.lg, textAlign: "center", animation: "pop .22s cubic-bezier(.22,1,.36,1)" }}>
            <div style={{ width: 60, height: 60, borderRadius: 18, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(237,28,36,0.09)", color: C.brand }}><LogOut size={26} /></div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: C.hi }}>Keluar dari akun?</div>
            <div style={{ fontSize: 13.5, color: C.mid, marginTop: 7, lineHeight: 1.55 }}>Anda perlu login ulang dengan akun Google untuk masuk kembali.</div>
            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button className="press" onClick={() => setConfirmLogout(false)} style={{ flex: 1, height: 50, borderRadius: 14, border: `1px solid ${C.line}`, background: C.card, color: C.hi, fontFamily: FF, fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>Batal</button>
              <button className="press" onClick={onSignOut} style={{ flex: 1, height: 50, borderRadius: 14, border: "none", background: C.brand, color: "#fff", fontFamily: FF, fontSize: 14.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 22px rgba(237,28,36,0.3)" }}>Keluar</button>
            </div>
          </div>
        </div>
      )}

      {/* Outlet picker */}
      {pickOutlet && (
        <OutletPicker outlets={outlets} onPick={chooseOutlet} onClose={() => setPickOutlet(false)} onRename={setRenamingOutlet} />
      )}

      {/* Edit nama saya — hanya nama, ID tidak bisa diubah dari sini */}
      {editProfile && (
        <RenameSheet title="Edit Nama Saya" label="Nama Promotor" placeholder="Nama lengkap Anda"
          initial={name} onClose={() => setEditProfile(false)}
          onSave={async (val) => { await saveProfileName(val); flash("Nama berhasil diperbarui."); }}
        />
      )}

      {/* Ganti nama outlet yang di-mapping ke Anda — ID outlet (IM3/3ID) tetap terkunci */}
      {renamingOutlet && (
        <RenameSheet title="Ganti Nama Outlet" label="Nama Outlet" placeholder="Nama outlet"
          initial={renamingOutlet.name && renamingOutlet.name !== renamingOutlet.code ? renamingOutlet.name : ""}
          note={`ID Outlet IM3 ${renamingOutlet.code}${renamingOutlet.code3id ? ` · 3ID ${renamingOutlet.code3id}` : ""} tidak bisa diubah — hanya nama outlet.`}
          onClose={() => setRenamingOutlet(null)}
          onSave={async (val) => { await saveOutletName(renamingOutlet, val); flash("Nama outlet berhasil diperbarui."); }}
        />
      )}

      {/* Konfirmasi Hapus Nomor — peringatan lebih tegas jika sudah tervalidasi GA */}
      {delSale && (() => {
        const isValidated = delSale.ga_status === "TERVALIDASI" || delSale.ga_status === "TERVALIDASI_LUAR_AREA";
        const canDelete = !isValidated || delAck;
        const closeModal = () => { setDelSale(null); setDelAck(false); };
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 140, background: "rgba(17,18,22,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 26 }} onClick={closeModal}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 380, background: C.card, borderRadius: 24, padding: "26px 22px 20px", boxShadow: C.lg, textAlign: "center", animation: "pop .22s cubic-bezier(.22,1,.36,1)" }}>
              <div style={{ width: 60, height: 60, borderRadius: 18, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(220,38,38,0.09)", color: "#DC2626" }}><Trash2 size={25} /></div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: C.hi }}>Hapus nomor ini?</div>
              <div style={{ fontSize: 15, fontFamily: "monospace", fontWeight: 700, color: C.hi, marginTop: 10, padding: "8px 12px", borderRadius: 10, background: C.sub, display: "inline-block" }}>{delSale.phone_normalized}</div>
              <div style={{ fontSize: 13, color: C.mid, marginTop: 10, lineHeight: 1.5 }}>Data claim ini akan dihapus permanen dan tidak bisa dikembalikan.</div>
              {isValidated && (
                <div style={{ marginTop: 14, textAlign: "left", padding: "12px 14px", borderRadius: 12, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: "#DC2626", fontWeight: 700, lineHeight: 1.5 }}>
                    <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                    Nomor ini <u>sudah tervalidasi GA</u>. Menghapusnya akan menghilangkan pencapaian yang sudah terbukti valid.
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11, fontSize: 12.5, color: C.hi, fontWeight: 600, cursor: "pointer" }}>
                    <input type="checkbox" checked={delAck} onChange={(e) => setDelAck(e.target.checked)} style={{ width: 17, height: 17, flexShrink: 0 }} />
                    Saya paham nomor ini sudah tervalidasi dan tetap ingin menghapusnya.
                  </label>
                </div>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button className="press" onClick={closeModal} style={{ flex: 1, height: 50, borderRadius: 14, border: `1px solid ${C.line}`, background: C.card, color: C.hi, fontFamily: FF, fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>Batal</button>
                <button className="press" onClick={doDeleteSale} disabled={!canDelete} style={{ flex: 1, height: 50, borderRadius: 14, border: "none", background: canDelete ? "#DC2626" : C.line, color: canDelete ? "#fff" : C.lo, fontFamily: FF, fontSize: 14.5, fontWeight: 800, cursor: canDelete ? "pointer" : "default", boxShadow: canDelete ? "0 8px 22px rgba(220,38,38,0.28)" : "none" }}>{isValidated ? "Tetap Hapus" : "Hapus"}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bantuan izin lokasi (mis. sebelumnya 'never allow') */}
      {geoHelp && (
        <BottomSheet onClose={() => setGeoHelp(false)}>
          <div style={{ padding: "2px 18px calc(env(safe-area-inset-bottom,0px) + 20px)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: C.hi, letterSpacing: "-0.02em" }}>Izin Lokasi</div>
              <button onClick={() => setGeoHelp(false)} style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: C.sub, color: C.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={18} /></button>
            </div>
            <AccessHelp kind="lokasi" onRetry={fixGeo} />
          </div>
        </BottomSheet>
      )}

      {/* Konfirmasi tagging di luar radius outlet (geofencing) */}
      {outsideConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 145, background: "rgba(17,18,22,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 26 }} onClick={() => setOutsideConfirm(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 380, background: C.card, borderRadius: 24, padding: "24px 22px 20px", boxShadow: C.lg, animation: "pop .22s cubic-bezier(.22,1,.36,1)" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
              <div style={{ width: 58, height: 58, borderRadius: 17, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(37,99,235,0.1)", color: C.blue, marginBottom: 14 }}><Radar size={26} /></div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: C.hi }}>Anda di luar area outlet</div>
              <div style={{ fontSize: 13.5, color: C.mid, marginTop: 8, lineHeight: 1.55 }}>
                Terdeteksi <b style={{ color: C.hi }}>± {outsideConfirm.distance != null ? Math.round(outsideConfirm.distance) : "?"} meter</b> dari outlet (radius diizinkan {outsideConfirm.radius ?? "?"} m).
                Penjualan ini akan <b style={{ color: C.hi }}>tetap tercatat</b>, namun ditandai sebagai tagging di luar area outlet untuk bahan evaluasi program.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="press" onClick={() => setOutsideConfirm(null)} style={{ flex: 1, height: 50, borderRadius: 14, border: `1px solid ${C.line}`, background: C.card, color: C.hi, fontFamily: FF, fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>Batal</button>
              <button className="press" onClick={confirmOutsideTag} style={{ flex: 1.3, height: 50, borderRadius: 14, border: "none", background: C.blue, color: "#fff", fontFamily: FF, fontSize: 14, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>Tetap Simpan</button>
            </div>
          </div>
        </div>
      )}

      {/* Animasi sukses claim — kartu putih melayang dengan spring pop-in
          (ala notifikasi sukses di iOS), memakai animasi Lottie asli yang
          dilampirkan (lebih halus & "mewah" dibanding checkmark SVG buatan
          sendiri) plus sound effect Apple Pay yang dilampirkan (lihat
          playSuccessTone, dipanggil terpisah saat status sukses di-set). */}
      {success && (
        <div style={{ position: "fixed", inset: 0, zIndex: 150, background: "rgba(17,18,22,0.38)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 26 }}>
          <div style={{
            width: "100%", maxWidth: 300, background: "#FFFFFF", borderRadius: 28, padding: "22px 26px 30px",
            display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
            boxShadow: "0 30px 80px rgba(23,24,28,0.28), 0 4px 14px rgba(23,24,28,0.1)",
            animation: "successPop .52s cubic-bezier(.19,1.28,.32,1.02) both",
          }}>
            <div style={{ position: "relative", width: 140, height: 140, marginBottom: 4, flexShrink: 0 }}>
              <div style={{ position: "absolute", inset: 10, borderRadius: "50%", background: "radial-gradient(circle, rgba(26,158,90,0.22), transparent 72%)", animation: "successGlow 1s ease-out .05s both" }} />
              <div style={{ position: "relative" }}><SuccessLottieIcon /></div>
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em", color: C.hi, animation: "up .32s .5s both" }}>Berhasil Diajukan</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11, animation: "up .32s .56s both" }}>
              <span style={{ fontSize: 16.5, fontFamily: "monospace", fontWeight: 800, color: C.hi, background: C.sub, borderRadius: 10, padding: "6px 13px" }}>{success.msisdn}</span>
              {success.brand && <BrandChip brand={success.brand} />}
            </div>
            <div style={{ fontSize: 12, color: C.mid, marginTop: 10, animation: "up .32s .62s both" }}>{fmtDateTime(success.at)}</div>
          </div>
          <style>{`
            @keyframes successPop{0%{opacity:0;transform:scale(.8) translateY(8px)}100%{opacity:1;transform:scale(1) translateY(0)}}
            @keyframes successGlow{0%{opacity:0;transform:scale(.55)}55%{opacity:1}100%{opacity:0;transform:scale(1.4)}}
          `}</style>
        </div>
      )}

      {/* Sudah di-claim oleh ID lain */}
      {taken && (
        <div style={{ position: "fixed", inset: 0, zIndex: 140, background: "rgba(17,18,22,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 26 }} onClick={() => setTaken(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 380, background: C.card, borderRadius: 24, padding: "24px 22px 20px", boxShadow: C.lg, animation: "pop .22s cubic-bezier(.22,1,.36,1)" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
              <div style={{ width: 58, height: 58, borderRadius: 17, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(183,121,31,0.1)", color: C.amber, marginBottom: 14 }}><ShieldQuestion size={26} /></div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: C.hi }}>Nomor Ini Sudah Di-Claim</div>
              <div style={{ fontSize: 13, color: C.mid, marginTop: 4 }}>oleh promotor lain — detail di bawah</div>
              <div style={{ fontSize: 15, fontFamily: "monospace", fontWeight: 700, color: C.hi, marginTop: 8, padding: "6px 12px", borderRadius: 10, background: C.sub }}>{taken.phone}</div>
            </div>
            {taken.owner && (
              <div style={{ marginTop: 16, borderRadius: 14, background: C.sub, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
                <TakenRow label="Oleh" value={taken.owner.full_name || taken.owner.email} />
                <TakenRow label="Outlet" value={taken.owner.outlet_code || "—"} />
                {taken.owner.brand && <TakenRow label="Brand" value={taken.owner.brand} />}
                <TakenRow label="Branch" value={taken.owner.branch || "—"} />
                <TakenRow label="Area" value={taken.owner.area || "—"} />
                <TakenRow label="Region" value={taken.owner.region || "—"} />
                <TakenRow label="Waktu" value={taken.owner.tagged_at ? fmtDateTime(taken.owner.tagged_at) : "—"} />
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="press" onClick={() => setTaken(null)} style={{ flex: 1, height: 50, borderRadius: 14, border: `1px solid ${C.line}`, background: C.card, color: C.hi, fontFamily: FF, fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>Batal</button>
              <button className="press" onClick={requestTransfer} style={{ flex: 1.4, height: 50, borderRadius: 14, border: "none", background: C.brand, color: "#fff", fontFamily: FF, fontSize: 14, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, boxShadow: "0 8px 22px rgba(237,28,36,0.26)" }}><ArrowLeftRight size={16} /> Ajukan Pemindahan</button>
            </div>
          </div>
        </div>
      )}

      {/* Nomor ini sudah Anda claim sendiri — mungkin di outlet lain milik
          Anda. Beda dengan modal "taken" (promotor lain): di sini tidak
          perlu approval, tinggal klik Pindahkan. */}
      {selfClaim && (() => {
        const s = selfClaim.sale;
        // Target brand yang sedang dipilih di layar Claim saat ini (kalau
        // outlet aktif butuh brand). Dibandingkan dengan brand yang sudah
        // tercatat di baris sale ini — kalau outlet-nya sama TAPI brand-nya
        // beda (mis. sudah IM3, sekarang mau dicatat sebagai 3ID di outlet
        // dual-brand yang sama), tetap dianggap "belum sama" supaya tombol
        // "Pindahkan ke Sini" tetap muncul dan bisa memperbaiki brand-nya.
        // Sebelumnya sameOutlet hanya membandingkan outlet_id, sehingga kasus
        // ini salah dianggap "sudah di sini" dan tombol pindahnya hilang.
        const targetBrand = activeOutlet?.code3id ? (brand || null) : null;
        const currentBrand = s?.brand || null;
        const sameOutlet = !!(s && activeOutlet && s.outlet_id === activeOutlet.id && currentBrand === targetBrand);
        const onlyBrandDiffers = !!(s && activeOutlet && s.outlet_id === activeOutlet.id && currentBrand !== targetBrand);
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 140, background: "rgba(17,18,22,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 26 }} onClick={() => setSelfClaim(null)}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 380, background: C.card, borderRadius: 24, padding: "24px 22px 20px", boxShadow: C.lg, animation: "pop .22s cubic-bezier(.22,1,.36,1)" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <div style={{ width: 58, height: 58, borderRadius: 17, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(37,99,235,0.1)", color: C.blue, marginBottom: 14 }}><ShieldQuestion size={26} /></div>
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: C.hi }}>Nomor Ini Sudah Anda Claim</div>
                <div style={{ fontSize: 13, color: C.mid, marginTop: 4 }}>
                  {sameOutlet
                    ? "sudah tercatat di outlet ini"
                    : onlyBrandDiffers
                      ? `tercatat sebagai ${currentBrand || "brand lain"} di outlet ini — pindahkan ke ${targetBrand || "brand ini"}?`
                      : "tercatat di outlet lain milik Anda — detail di bawah"}
                </div>
                <div style={{ fontSize: 15, fontFamily: "monospace", fontWeight: 700, color: C.hi, marginTop: 8, padding: "6px 12px", borderRadius: 10, background: C.sub }}>{selfClaim.phone}</div>
              </div>
              {s && (
                <div style={{ marginTop: 16, borderRadius: 14, background: C.sub, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
                  <TakenRow label="Outlet" value={s.outlet_name || s.outlet_code || "—"} />
                  {s.brand && <TakenRow label="Brand" value={s.brand} />}
                  <TakenRow label="Branch" value={s.branch || "—"} />
                  <TakenRow label="Area" value={s.area || "—"} />
                  <TakenRow label="Region" value={s.region || "—"} />
                  <TakenRow label="Waktu" value={s.tagged_at ? fmtDateTime(s.tagged_at) : "—"} />
                </div>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <button className="press" onClick={() => setSelfClaim(null)} style={{ flex: 1, height: 50, borderRadius: 14, border: `1px solid ${C.line}`, background: C.card, color: C.hi, fontFamily: FF, fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>Batal</button>
                {!sameOutlet && (
                  <button className="press" onClick={moveOwnSale} disabled={moveBusy} style={{ flex: 1.4, height: 50, borderRadius: 14, border: "none", background: C.blue, color: "#fff", fontFamily: FF, fontSize: 14, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                    {moveBusy ? <Spinner size={16} color="#fff" /> : <ArrowLeftRight size={16} />} Pindahkan ke Sini
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Konfirmasi setujui pemindahan */}
      {approveReq && (
        <div style={{ position: "fixed", inset: 0, zIndex: 145, background: "rgba(17,18,22,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 26 }} onClick={() => setApproveReq(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 360, background: C.card, borderRadius: 24, padding: "26px 22px 20px", boxShadow: C.lg, textAlign: "center", animation: "pop .22s cubic-bezier(.22,1,.36,1)" }}>
            <div style={{ width: 60, height: 60, borderRadius: 18, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(237,28,36,0.09)", color: C.brand }}><ArrowLeftRight size={25} /></div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: C.hi }}>Pindahkan nomor ini?</div>
            <div style={{ fontSize: 15, fontFamily: "monospace", fontWeight: 700, color: C.hi, marginTop: 10 }}>{approveReq.phone_normalized}</div>
            <div style={{ fontSize: 13, color: C.mid, marginTop: 10, lineHeight: 1.5 }}>Kepemilikan penjualan akan dipindahkan ke <b style={{ color: C.hi }}>{approveReq.to_full_name || approveReq.to_email}</b>. Nomor ini akan hilang dari daftar Anda.</div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="press" onClick={() => setApproveReq(null)} style={{ flex: 1, height: 50, borderRadius: 14, border: `1px solid ${C.line}`, background: C.card, color: C.hi, fontFamily: FF, fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>Batal</button>
              <button className="press" onClick={() => decideTransfer(approveReq, true)} style={{ flex: 1, height: 50, borderRadius: 14, border: "none", background: C.brand, color: "#fff", fontFamily: FF, fontSize: 14.5, fontWeight: 800, cursor: "pointer" }}>Pindahkan</button>
            </div>
          </div>
        </div>
      )}

      {/* Sheets */}
      {sheet === "qr" && <QRScannerSheet onDetect={onQR} onClose={() => setSheet(null)} />}

      {/* Kotak Masuk — gabungan permintaan approval (pindah nomor manual)
          dan notifikasi info (hasil validasi GA). Dua jenis berbeda, tapi
          disatukan di satu tempat dengan bagian terpisah supaya tidak
          tercampur: approval selalu di atas (perlu keputusan), notifikasi
          info di bawah dengan filter periode. */}
      {inboxOpen && (() => {
        const filteredNotifs = notifications.filter((n) => notifFilter === "all" || n.period === notifFilter);
        const unreadCount = notifications.filter((n) => !n.read_at).length;
        return (
          <BottomSheet onClose={() => setInboxOpen(false)}>
            <div style={{ padding: "2px 18px calc(env(safe-area-inset-bottom,0px) + 20px)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 11, background: C.sub, color: C.brand, display: "flex", alignItems: "center", justifyContent: "center" }}><Inbox size={17} /></div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: C.hi, letterSpacing: "-0.02em" }}>Kotak Masuk</div>
                </div>
                <button onClick={() => setInboxOpen(false)} style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: C.sub, color: C.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={18} /></button>
              </div>

              {/* Perlu persetujuan — badge tetap nyala sampai diputuskan */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 7, background: incoming.length > 0 ? "rgba(237,28,36,0.1)" : C.sub, color: incoming.length > 0 ? C.brand : C.lo, flexShrink: 0 }}><ArrowLeftRight size={12} /></span>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: C.mid }}>Perlu Persetujuan</span>
                {incoming.length > 0 && <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: C.brand, borderRadius: 99, padding: "1px 7px" }}>{incoming.length}</span>}
              </div>
              {incoming.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "22px 14px", background: C.sub, borderRadius: 16, marginBottom: 22 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: C.lo, marginBottom: 9, boxShadow: C.sm }}><ArrowLeftRight size={17} /></div>
                  <div style={{ fontSize: 12.5, color: C.mid }}>Tidak ada permintaan pemindahan claim.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 22 }}>
                  {incoming.map((r) => (
                    <div key={r.id} style={{ padding: "13px 14px", borderRadius: 16, background: C.card, border: `1px solid ${C.line}`, boxShadow: C.sm }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <span style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(237,28,36,0.08)", color: C.brand, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><SimCardIcon size={15} /></span>
                        <span style={{ fontSize: 15, fontFamily: "monospace", fontWeight: 800, color: C.hi }}>{r.phone_normalized}</span>
                      </div>
                      <div style={{ fontSize: 12, color: C.mid, marginTop: 9, lineHeight: 1.55 }}>
                        Diminta oleh <b style={{ color: C.hi }}>{r.to_full_name || r.to_email}</b>
                        {(r.to_outlet_code || r.to_branch) ? ` · ${[r.to_outlet_code, r.to_branch, r.to_area].filter(Boolean).join(" / ")}` : ""}
                      </div>
                      <div style={{ fontSize: 11, color: C.lo, marginTop: 4 }}>{fmtDateTime(r.requested_at)}</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
                        <button className="press" onClick={() => decideTransfer(r, false)} disabled={busy} style={{ flex: 1, height: 42, borderRadius: 12, border: `1px solid ${C.line}`, background: C.sub, color: C.mid, fontFamily: FF, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Tolak</button>
                        <button className="press" onClick={() => setApproveReq(r)} disabled={busy} style={{ flex: 1.3, height: 42, borderRadius: 12, border: "none", background: C.brand, color: "#fff", fontFamily: FF, fontSize: 13, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: "0 8px 18px rgba(237,28,36,0.22)" }}><ArrowLeftRight size={14} /> Pindahkan</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ height: 1, background: C.lineSoft, margin: "0 0 20px" }} />

              {/* Notifikasi info — badge berkurang begitu item ditap */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 11, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 7, background: unreadCount > 0 ? "rgba(37,99,235,0.1)" : C.sub, color: unreadCount > 0 ? C.blue : C.lo, flexShrink: 0 }}><Inbox size={12} /></span>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: C.mid }}>Notifikasi</span>
                  {unreadCount > 0 && <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: C.blue, borderRadius: 99, padding: "1px 7px" }}>{unreadCount}</span>}
                </div>
                <div style={{ position: "relative" }}>
                  <select value={notifFilter} onChange={(e) => setNotifFilter(e.target.value)}
                    style={{ appearance: "none", height: 30, borderRadius: 9, border: `1px solid ${C.line}`, background: C.card, color: C.hi, fontFamily: FF, fontSize: 11.5, fontWeight: 700, padding: "0 26px 0 10px", cursor: "pointer" }}>
                    <option value="all">Semua periode</option>
                    {statsPeriodOptions().map((p) => <option key={p} value={p}>{ymLabel(p)}</option>)}
                  </select>
                  <ChevronDown size={12} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: C.lo, pointerEvents: "none" }} />
                </div>
              </div>
              {filteredNotifs.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "26px 14px", background: C.sub, borderRadius: 16 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: C.lo, marginBottom: 9, boxShadow: C.sm }}><Inbox size={17} /></div>
                  <div style={{ fontSize: 12.5, color: C.mid }}>Belum ada notifikasi.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {filteredNotifs.map((n) => (
                    <button key={n.id} onClick={() => markNotificationRead(n)} className="press" style={{
                      display: "flex", alignItems: "flex-start", gap: 9, width: "100%", textAlign: "left", cursor: "pointer", fontFamily: FF,
                      padding: "13px 14px", borderRadius: 16, background: n.read_at ? C.card : "rgba(37,99,235,0.06)",
                      border: `1px solid ${n.read_at ? C.line : "rgba(37,99,235,0.24)"}`, boxShadow: C.sm,
                    }}>
                      {!n.read_at && <span style={{ width: 7, height: 7, borderRadius: 99, background: C.blue, marginTop: 6, flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: C.hi }}>{n.title}</span>
                        <div style={{ fontSize: 12, color: C.mid, marginTop: 4, lineHeight: 1.55 }}>{n.body}</div>
                        <div style={{ fontSize: 10.5, color: C.lo, marginTop: 6 }}>{fmtDateTime(n.created_at)}{n.period ? ` · periode ${ymLabel(n.period)}` : ""}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </BottomSheet>
        );
      })()}

      {/* Busy overlay */}
      {busy && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }}>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: "20px 26px", display: "flex", alignItems: "center", gap: 12, color: C.hi, fontSize: 14, fontWeight: 600 }}>
            <Spinner size={20} color={C.brand} /> Memproses…
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", left: 16, right: 16, bottom: view === "home" ? "calc(env(safe-area-inset-bottom,0px) + 82px)" : "calc(env(safe-area-inset-bottom,0px) + 20px)", zIndex: 130, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <div onClick={() => { clearTimeout(toastTimerRef.current); setToast(null); }} style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 18px", borderRadius: 13, background: toast.tone === "err" ? "#FDECEC" : "#E7F7ED", border: `1px solid ${toast.tone === "err" ? "#F5C2C2" : "#B7E4C7"}`, color: toast.tone === "err" ? "#C62828" : "#1A9E5A", fontSize: 13.5, fontWeight: 700, boxShadow: "0 10px 30px rgba(23,24,28,0.12)", maxWidth: 460, pointerEvents: "auto", cursor: "pointer" }}>
            {toast.tone === "err" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}<span>{toast.msg}</span>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

/* ── Panels ─────────────────────────────────────────────────── */
/* Satu-satunya pintu masuk ke alur Claim Penjualan di beranda — menggantikan
   tombol mengambang (FAB) lama supaya tidak ada dua elemen yang melakukan
   hal yang sama. Tap di mana saja pada kartu ini membuka layar "Claim
   Penjualan" (pilih outlet → pilih brand → scan QR). Saat outlet sudah
   aktif, kartu juga menampilkan ringkasan singkat outlet & jumlah terjual
   hari ini supaya tetap informatif tanpa perlu kartu terpisah. */
function ClaimEntryCard({ outlet, outletsCount, soldCount, onOpen }) {
  const displayName = outlet ? (outlet.name && outlet.name !== outlet.code ? outlet.name : outlet.code) : null;
  return (
    <button onClick={onOpen} className="press" style={{
      width: "100%", textAlign: "left", border: "none", cursor: "pointer", fontFamily: FF,
      background: C.grad, borderRadius: 22, padding: "18px 18px 18px 16px", marginBottom: 14,
      boxShadow: "0 10px 26px rgba(237,28,36,0.24)", display: "flex", alignItems: "center", gap: 14,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", right: -26, top: -26, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.09)" }} />
      <div style={{
        width: 50, height: 50, borderRadius: 15, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(255,255,255,0.18)", color: "#fff",
      }}>
        <QrCode size={23} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em", color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
          Claim Penjualan Anda <ChevronRight size={17} />
        </div>
        {outlet ? (
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 5, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "rgba(255,255,255,0.92)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>{displayName}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
              <ShoppingBag size={11} /> {soldCount} terjual hari ini
            </span>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)", marginTop: 5, lineHeight: 1.4 }}>
            {outletsCount > 0 ? `Pilih outlet, brand, lalu scan QR` : "Tunggu mapping outlet dari SPM Sumatera"}
          </div>
        )}
      </div>
    </button>
  );
}

function OutletSelectPanel({ outlets, onPick, onRename, period, onPeriodChange }) {
  return (
    <div>
      <div style={{ background: C.card, borderRadius: 18, padding: 14, boxShadow: C.md }}>
        {/* Judul "Pilih Outlet Anda" + selector periode di kanannya —
            menggantikan subheading lama ("Pilih outlet tempat Anda...") yang
            dihapus karena judul kartu ini sendiri sudah cukup jelas. Ganti
            periode di sini akan ikut mengganti daftar outlet yang
            termapping di bawah (default selalu bulan berjalan). */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", margin: "2px 4px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.lo }}>
            <Store size={13} /> Pilih Outlet Anda ({outlets.length})
          </div>
          {period && onPeriodChange && (
            <div style={{ position: "relative" }}>
              <select value={period} onChange={(e) => onPeriodChange(e.target.value)}
                style={{ appearance: "none", height: 30, borderRadius: 9, border: `1px solid ${C.brand}55`, background: C.card, color: C.hi, fontFamily: FF, fontSize: 11.5, fontWeight: 700, padding: "0 26px 0 28px", cursor: "pointer" }}>
                {periodOptions().map((p) => <option key={p} value={p}>{ymLabel(p)}</option>)}
              </select>
              <CalendarDays size={11} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.brand, pointerEvents: "none" }} />
              <ChevronDown size={11} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: C.lo, pointerEvents: "none" }} />
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {outlets.map((o) => {
            const displayName = o.name && o.name !== o.code ? o.name : o.code;
            const hasDual = !!o.code3id;
            return (
              <div key={o.code} role="button" tabIndex={0} onClick={() => onPick(o)}
                onKeyDown={(e) => { if (e.key === "Enter") onPick(o); }} className="press"
                style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: 14, background: C.sub, width: "100%", padding: "13px 12px", cursor: "pointer", fontFamily: FF, boxSizing: "border-box" }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "#fff", color: C.brand, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: C.sm }}><Store size={18} /></div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  {/* Tombol edit nama diletakkan LANGSUNG di sebelah nama outlet
                      (bukan lagi terpisah di ujung kanan baris) supaya jelas
                      fungsinya untuk mengganti nama outlet ini. */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: "-0.01em", color: C.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</span>
                    {onRename && (
                      <button onClick={(e) => { e.stopPropagation(); onRename(o); }} aria-label="Ganti nama outlet"
                        style={{ width: 23, height: 23, borderRadius: 7, border: "none", background: "#fff", color: C.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, boxShadow: C.sm }}>
                        <Pencil size={11} />
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 5, marginTop: 5, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", padding: "1px 6px", borderRadius: 99, background: BRAND.IM3.soft, color: BRAND.IM3.ink }}>IM3 {o.code}</span>
                    {hasDual && <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", padding: "1px 6px", borderRadius: 99, background: BRAND["3ID"].soft, color: BRAND["3ID"].ink }}>3ID {o.code3id}</span>}
                  </div>
                  {/* Branch dihilangkan — cukup area saja, supaya baris ini
                      tidak sesak & lebih proporsional. */}
                  {o.area && <div style={{ fontSize: 11.5, color: C.mid, marginTop: 4 }}>{o.area}</div>}
                </div>
                <ChevronRight size={18} color={C.lo} style={{ flexShrink: 0 }} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GeoGatePanel({ outlet, err, onFix, onChangeOutlet }) {
  return (
    <div style={{ animation: "up .3s ease" }}>
      <div style={{ background: C.card, borderRadius: 18, padding: "18px 18px 16px", marginBottom: 14, boxShadow: C.md, textAlign: "center" }}>
        <div style={{ width: 60, height: 60, borderRadius: 18, margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,176,32,0.12)", color: C.amber }}><MapPin size={26} /></div>
        <div style={{ fontSize: 17, fontWeight: 800, color: C.hi, letterSpacing: "-0.02em" }}>Aktifkan lokasi untuk mulai tagging</div>
        <div style={{ fontSize: 13, color: C.mid, marginTop: 8, lineHeight: 1.5 }}>Outlet aktif: <b style={{ color: C.hi, fontFamily: "monospace" }}>{outlet.code}</b>. Setiap tagging membutuhkan lokasi untuk validasi jarak ke outlet.</div>
        {err && <div style={{ marginTop: 10, fontSize: 12, color: "#C62828" }}>{err}</div>}
        <button onClick={onFix} className="press" style={{ marginTop: 16, width: "100%", height: 52, borderRadius: 14, border: "none", background: C.brand, color: "#fff", fontFamily: FF, fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Navigation size={17} /> Aktifkan Lokasi
        </button>
        <button onClick={onChangeOutlet} className="press" style={{ marginTop: 9, width: "100%", height: 42, borderRadius: 12, border: `1px solid ${C.line}`, background: "transparent", color: C.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          Ganti outlet
        </button>
      </div>
    </div>
  );
}

function TagPanel({ outlet, sales, soldCount, busy, onTag, onDelete, onChangeOutlet, onRename, multiOutlet, brand, onBrandChange, assignmentSrc, detail, promotorId, periodLabel, period, onPeriodChange }) {
  const needsBrand = !!outlet.code3id;
  const canTag = !needsBrand || !!brand;
  // Tema warna aktif = brand yang dipilih. Outlet single-brand tidak punya
  // pilihan, jadi tetap pakai warna netral (merah) — bukan menebak brand.
  const bt = brandTheme(brand);
  const [detailSale, setDetailSale] = useState(null);
  // Kalau promotor coba klik Claim Penjualan padahal brand belum dipilih,
  // kartu "Claim untuk brand" digetarkan (bukan cuma tombolnya di-disable
  // diam-diam) supaya jelas field mana yang harus diisi dulu.
  const [shakeBrand, setShakeBrand] = useState(false);
  const handleTagClick = () => {
    if (needsBrand && !brand) {
      setShakeBrand(true);
      setTimeout(() => setShakeBrand(false), 420);
      return;
    }
    onTag();
  };
  // Detail Pengajuan Outlet mengikuti brand yang sedang dipilih di atas
  // (kalau outlet-nya dual-brand) — belum pilih brand sama sekali =
  // tampilkan TOTAL gabungan IM3+3ID, seperti semula.
  const detailRows = useMemo(() => {
    const rows = detail || [];
    return brand ? rows.filter((s) => s.brand === brand) : rows;
  }, [detail, brand]);
  const counts = useMemo(() => {
    const c = { pending: 0, bio: 0, reg: 0, waitingOutlet: 0, rejected: 0, notFound: 0 };
    detailRows.forEach((s) => {
      const cat = categoryOf(s);
      if (cat === "validated") {
        if (s.biometric_status === "BIOMETRIC") c.bio += 1;
        else if (s.biometric_status === "REGULAR") c.reg += 1;
      } else if (c[cat] !== undefined) c[cat] += 1;
    });
    return c;
  }, [detailRows]);
  return (
    <div style={{ animation: "up .3s ease" }}>
      <div style={{ background: C.card, borderRadius: 18, padding: "16px 18px", marginBottom: 14, boxShadow: C.md }}>
        {/* Selector periode dipindah ke sini (kanan judul "Outlet Aktif"),
            memakai `period` (periode assignment/mapping), bukan statsPeriod
            — ganti periode di sini ikut mengganti outlet yang termapping. */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: C.lo }}>Outlet Aktif</div>
          {period && onPeriodChange && (
            <div style={{ position: "relative" }}>
              <select value={period} onChange={(e) => onPeriodChange(e.target.value)}
                style={{ appearance: "none", height: 28, borderRadius: 9, border: `1px solid ${C.brand}55`, background: C.card, color: C.hi, fontFamily: FF, fontSize: 11, fontWeight: 700, padding: "0 24px 0 26px", cursor: "pointer" }}>
                {periodOptions().map((p) => <option key={p} value={p}>{ymLabel(p)}</option>)}
              </select>
              <CalendarDays size={10.5} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: C.brand, pointerEvents: "none" }} />
              <ChevronDown size={10.5} style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", color: C.lo, pointerEvents: "none" }} />
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", color: C.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {outlet.name && outlet.name !== outlet.code ? outlet.name : outlet.code}
              </span>
              {onRename && (
                <button onClick={() => onRename(outlet)} aria-label="Ganti nama outlet"
                  style={{ width: 26, height: 26, borderRadius: 8, border: "none", background: C.sub, color: C.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                  <Pencil size={12} />
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 5, marginTop: 5, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", padding: "1px 6px", borderRadius: 99, background: BRAND.IM3.soft, color: BRAND.IM3.ink }}>IM3 {outlet.code}</span>
              {outlet.code3id && <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", padding: "1px 6px", borderRadius: 99, background: BRAND["3ID"].soft, color: BRAND["3ID"].ink }}>3ID {outlet.code3id}</span>}
            </div>
            {/* Branch dihilangkan — area saja cukup, kartu jadi lebih ringkas
                & proporsional. */}
            {outlet.area && <div style={{ fontSize: 12, color: C.mid, marginTop: 4 }}>{outlet.area}</div>}
            {assignmentSrc?.carried && (
              <div style={{ fontSize: 10.5, color: C.amber, marginTop: 4, fontWeight: 600 }}>Mapping dari {ymLabel(assignmentSrc.sourcePeriod)} (belum ada update)</div>
            )}
          </div>
          {multiOutlet && (
            <button onClick={onChangeOutlet} className="press" style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 12, height: 40, padding: "0 13px", borderRadius: 12, background: C.sub, border: `1px solid ${C.line}`, cursor: "pointer", fontFamily: FF }}>
              <RefreshCcw size={15} color={C.brand} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: C.brand }}>Ganti</span>
            </button>
          )}
        </div>
      </div>

      {/* Pilihan brand — outlet ini punya ID IM3 & 3ID sekaligus, pencapaian
          harus dipilih per-tagging supaya SP masuk ke brand yang benar.
          Tap brand yang SUDAH terpilih lagi untuk membatalkan pilihan —
          Detail Pengajuan Outlet di bawah otomatis kembali menampilkan
          TOTAL gabungan kedua brand saat tidak ada yang dipilih. */}
      {needsBrand && (
        <div style={{
          background: C.card, borderRadius: 18, padding: 14, marginBottom: 14, boxShadow: C.md,
          animation: shakeBrand ? "shakeCard .42s ease" : undefined,
          outline: shakeBrand ? `2px solid ${C.brand}` : "none", outlineOffset: 2,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: C.lo, marginBottom: 10 }}>Claim untuk brand</div>
          <div style={{ display: "flex", gap: 8 }}>
            {["IM3", "3ID"].map((b) => {
              const on = brand === b;
              const bt = BRAND[b];
              return (
                <button key={b} type="button" className="press" onClick={() => onBrandChange(on ? null : b)}
                  style={{
                    flex: 1, height: 46, borderRadius: 13,
                    border: `1.5px solid ${on ? bt.solid : C.line}`,
                    background: on ? bt.solid : C.sub,
                    color: on ? bt.onSolid : C.hi,
                    fontFamily: FF, fontSize: 14.5, fontWeight: 800, cursor: "pointer", transition: "background .15s, color .15s",
                  }}>
                  {b}
                </button>
              );
            })}
          </div>
          {!brand && <div style={{ fontSize: 11.5, color: C.amber, fontWeight: 600, marginTop: 9 }}>Pilih brand dulu sebelum claim penjualan.</div>}
        </div>
      )}

      {/* Tag penjualan — warna tombol mengikuti brand yang sedang dipilih
          (IM3 kuning/teks hitam, 3ID magenta/teks putih) supaya promotor
          tidak salah brand. Outlet single-brand tetap merah netral. Tombol
          ini SENGAJA tidak di-disable total saat brand belum dipilih — tetap
          bisa ditekan supaya bisa memicu getaran (shake) pada kartu "Claim
          untuk brand" di atas, memberi tahu field mana yang harus diisi
          dulu, bukan cuma diam/tidak bereaksi. */}
      <button onClick={handleTagClick} disabled={busy} className="press"
        style={{
          width: "100%", height: 58, borderRadius: 16, border: "none",
          cursor: "pointer",
          background: !canTag ? C.line : (bt ? bt.solid : C.brand),
          color: !canTag ? C.lo : (bt ? bt.onSolid : "#fff"),
          fontFamily: FF, fontSize: 16.5, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          marginBottom: 14, transition: "background .15s, color .15s",
        }}>
        <QrCode size={20} /> Claim Penjualan{bt ? ` ${brand}` : ""} (Scan QR)
      </button>

      {/* Ringkasan pengajuan outlet ini — pengganti "Terjual hari ini" yang
          lama (cuma satu angka, tanggal hari ini saja) dengan ringkasan
          status yang sebenarnya dibutuhkan promotor saat mau claim: berapa
          total, berapa yang masih menunggu validasi GA, berapa yang sudah
          tervalidasi biometric/non-biometric, dan berapa yang ditolak.
          Discoped ke PERIODE YANG SAMA dengan "Lihat performa" di beranda
          (statsPeriod) dan sumber data yang identik dengan Riwayat
          Pengajuan & Kontribusi Anda, supaya angkanya selalu tepat & sinkron
          di mana pun ditampilkan. */}
      <OutletSummaryGrid total={detailRows.length} pending={counts.pending} bio={counts.bio} reg={counts.reg}
        rejected={counts.rejected} extra={counts.waitingOutlet + counts.notFound} periodLabel={periodLabel}
        brand={brand} showBrandBadge={needsBrand} />

      <div style={{ background: C.card, borderRadius: 20, padding: 16, marginBottom: 14, boxShadow: C.md }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.lo }}>
            <ListChecks size={13} /> Detail Pengajuan ({detailRows.length})
          </div>
          {needsBrand && brand && <BrandChip brand={brand} />}
        </div>
        {detailRows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "22px 10px", color: C.mid, fontSize: 12.5 }}>Belum ada pengajuan di outlet ini.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {detailRows.map((s) => <HistoryRow key={s.id} s={s} promotorId={promotorId} onDelete={onDelete} onOpen={setDetailSale} />)}
          </div>
        )}
      </div>
      {detailSale && <GaMatchDetailModal sale={detailSale} onClose={() => setDetailSale(null)} />}
    </div>
  );
}

/* Hero card "Kontribusi Anda" — pengganti ringkasan lama yang cuma daftar
   angka putih polos. Progress ring menunjukkan % dari target bulanan
   (target diset admin SPM per-promotor, default 150), warnanya berubah
   sesuai capaian supaya sekilas terasa "hidup", bukan sekadar dashboard.
   Catatan istilah: ini KLAIM KONTRIBUSI promotor atas SP yang terjual di
   outlet-nya (bisa lewat scan QR atau input manual) — bukan klaim bahwa
   promotor sendiri yang menjual eceran; itu sebabnya SP di outlet yang
   tidak di-claim promotor manapun tidak ikut terhitung di sini. */
/* Kartu flip "Kontribusi Anda" — menggabungkan ringkasan target (depan) dan
   rincian status pengajuan (belakang) jadi SATU kartu, supaya keduanya
   tidak selalu makan tempat sekaligus (Claim Penjualan bisa naik lebih
   dekat ke jempol). Animasi flip 3D cepat-tapi-mulus: kedua sisi memakai
   CSS Grid stacking (grid-area sama) supaya tinggi kontainer otomatis
   mengikuti sisi yang lebih tinggi tanpa perlu ukur manual via JS. */
function ContributionCard({ summary, target, outletBioTotal, onNavigateHistory, outlets }) {
  const [open, setOpen] = useState(false);
  const bio = summary?.bio ?? 0;
  const pct = target > 0 ? Math.min(100, Math.round((bio / target) * 100)) : 0;
  const tier = pct >= 80 ? { color: PAL.teal, grad: `linear-gradient(90deg, ${PAL.yellow}, ${PAL.teal})`, label: "Sudah dekat target!" }
    : pct >= 40 ? { color: PAL.yellow, grad: `linear-gradient(90deg, ${PAL.pink}, ${PAL.yellow})`, label: "Terus jalan, hampir separuh" }
    : { color: PAL.pink, grad: `linear-gradient(90deg, ${PAL.red}, ${PAL.pink})`, label: "Ayo mulai kejar target" };

  // Kontribusi terhadap TOTAL pencapaian outlet (semua promotor di outlet
  // yang sama) — murni angka pembanding, dihitung live dari pts_sale,
  // TIDAK disimpan ke database apapun. null = belum ada outlet/loading.
  const sharePct = (outletBioTotal != null && outletBioTotal > 0) ? Math.round((bio / outletBioTotal) * 100) : null;

  // Kartu depan (jumlah outlet 1..4 → tinggi berbeda-beda) dan kartu
  // belakang bisa punya tinggi asli yang berbeda. Kedua sisi tetap
  // ditumpuk dengan CSS Grid (gridArea sama) TAPI dengan alignSelf:"start"
  // supaya masing-masing sisi TIDAK ikut diregangkan menyamai sisi lain —
  // artinya offsetHeight yang diukur benar-benar tinggi konten asli sisi
  // itu sendiri (bukan tinggi induk/sisi lain). Tinggi container lalu
  // di-set eksplisit lewat JS mengikuti sisi yang sedang tampil, dan
  // dianimasikan halus bersamaan dengan rotasi flip — jadi tinggi selalu
  // pas dengan jumlah outlet yang sedang dimapping, tidak pernah
  // menyisakan ruang kosong ATAUPUN memotong konten.
  const frontRef = useRef(null);
  const backRef = useRef(null);
  const [frontH, setFrontH] = useState(null);
  const [backH, setBackH] = useState(null);
  useEffect(() => {
    const measure = () => {
      if (frontRef.current) setFrontH(frontRef.current.scrollHeight);
      if (backRef.current) setBackH(backRef.current.scrollHeight);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    if (frontRef.current) ro.observe(frontRef.current);
    if (backRef.current) ro.observe(backRef.current);
    return () => ro.disconnect();
  }, [summary, outlets, outletBioTotal, bio, target]);

  const faceBase = { gridArea: "1/1", alignSelf: "start", backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", borderRadius: 22, boxShadow: C.md };
  const nav = (filter) => { if (onNavigateHistory) onNavigateHistory(filter); };

  return (
    <div style={{ marginBottom: 14, perspective: 1600 }}>
      <div style={{
        position: "relative", display: "grid", transformStyle: "preserve-3d", overflow: "visible",
        height: (open ? backH : frontH) ?? undefined,
        transition: "transform .46s cubic-bezier(.34,1,.4,1), height .42s cubic-bezier(.22,1,.36,1)",
        transform: open ? "rotateY(180deg)" : "rotateY(0deg)",
      }}>
        {/* ── Depan: ringkasan target ── */}
        <div ref={frontRef} style={{
          ...faceBase, position: "relative", overflow: "hidden",
          background: `linear-gradient(160deg, ${PAL.charcoal} 0%, #333335 100%)`,
          padding: "16px 16px 15px", pointerEvents: open ? "none" : "auto",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 13 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <Sparkles size={13} color={PAL.yellow} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.65)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                Kontribusi Anda
              </span>
            </div>
            <button onClick={() => setOpen(true)} className="press" style={{
              display: "flex", alignItems: "center", gap: 4, border: "none", cursor: "pointer", flexShrink: 0,
              background: "rgba(255,255,255,0.14)", color: "#fff", borderRadius: 10, padding: "7px 11px 7px 12px",
              fontFamily: FF, fontSize: 11.5, fontWeight: 700,
            }}>
              Lihat Detail <ChevronRight size={13} />
            </button>
          </div>

          {/* Hero stat — persentase capaian jadi angka UTAMA yang paling
              menonjol (bukan lagi angka bio/target kecil di atas dan %
              mungil di kanan). Ikon Target diperbesar & diberi badge
              lingkaran ber-tema warna tier supaya kontras & gampang dibaca
              sekilas, sesuai palet identitas (PAL). */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 60, height: 60, borderRadius: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              background: `${tier.color}26`, border: `1.5px solid ${tier.color}55`, color: tier.color,
            }}>
              <Target size={28} strokeWidth={2.2} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-0.04em", color: "#fff", lineHeight: 1 }}>{pct}</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: tier.color, letterSpacing: "-0.02em" }}>%</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.68)", marginTop: 2 }}>
                <span style={{ color: "#fff" }}>{bio}</span> / {target} RGU-GA SP Biometric
              </div>
            </div>
          </div>

          {/* Progress target sebagai line bar bergradasi (bukan ring lagi) —
              warna gradasinya berubah mengikuti tier capaian. */}
          <div style={{ height: 12, borderRadius: 99, background: "rgba(255,255,255,0.14)", overflow: "hidden", marginTop: 14 }}>
            <div style={{ height: "100%", width: `${pct}%`, minWidth: pct > 0 ? 12 : 0, borderRadius: 99, background: tier.grad, transition: "width .6s cubic-bezier(.22,1,.36,1)" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
            <TrendingUp size={13} color={tier.color} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: tier.color }}>{tier.label}</span>
          </div>

          {/* Total pencapaian RGU-GA SP Biometric SELURUH outlet Anda (semua
              promotor) + persentase kontribusi promotor ini terhadapnya —
              angka pembanding saja, tidak pernah tersimpan ke database. */}
          {sharePct != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 13, padding: "9px 11px", borderRadius: 12, background: "rgba(255,255,255,0.08)" }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: PAL.teal }}>
                <Store size={14} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "#fff" }}>{sharePct}% dari total outlet Anda</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 1 }}>{bio} dari {outletBioTotal} RGU-GA SP Biometric seluruh outlet</div>
              </div>
            </div>
          )}

          {/* Outlet Anda — SELALU ditampilkan di kartu ringkasan ini (bukan
              di sisi Detail Status), walau belum ada data pengajuan sama
              sekali di periode ini, supaya promotor tetap tahu persis outlet
              mana saja yang sedang dimapping ke dirinya. */}
          {outlets && outlets.length > 0 && (
            <div style={{ marginTop: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Store size={11} color="rgba(255,255,255,0.55)" />
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Outlet Anda ({outlets.length})</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {outlets.map((o) => {
                  const oname = o.name && o.name !== o.code ? o.name : o.code;
                  return (
                    <div key={o.code} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 9px", borderRadius: 12, background: "rgba(255,255,255,0.07)" }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.12)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Store size={13} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#fff", letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{oname}</div>
                        <div style={{ display: "flex", gap: 5, marginTop: 3, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "monospace", padding: "1px 6px", borderRadius: 99, background: "rgba(255,203,5,0.22)", color: "#FFCB05" }}>IM3 {o.code}</span>
                          {o.code3id && <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "monospace", padding: "1px 6px", borderRadius: 99, background: "rgba(198,22,141,0.28)", color: "#F0A8DE" }}>3ID {o.code3id}</span>}
                        </div>
                      </div>
                      {o.area && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", textAlign: "right", flexShrink: 0, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.area}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Belakang: rincian status pengajuan — setiap baris bisa ditap
            untuk langsung membuka Riwayat Pengajuan yang sudah difilter ke
            konteks/section yang sesuai. ── */}
        <div ref={backRef} style={{
          ...faceBase, transform: "rotateY(180deg)", background: C.card,
          padding: "14px 15px 12px", pointerEvents: open ? "auto" : "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: C.lo }}>Detail Status Pengajuan</div>
            {/* Teks & arah panah dibuat mencerminkan tombol "Lihat Detail >"
                di kartu depan, supaya jelas ini navigasi flip kembali (bukan
                sekadar "tutup"). */}
            <button onClick={() => setOpen(false)} className="press" aria-label="Kembali ke ringkasan"
              style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: C.sub, color: C.mid, borderRadius: 9, padding: "5px 9px 5px 7px", cursor: "pointer", fontFamily: FF, fontSize: 11.5, fontWeight: 700 }}>
              <ChevronLeft size={13} /> Ringkasan
            </button>
          </div>

          {summary ? (() => {
            // Semua baris SELALU bisa ditap — mengarah ke Riwayat Pengajuan di
            // tab yang sesuai (kalau memang kosong, tab-nya akan menampilkan
            // kosong, tapi navigasinya tetap konsisten & tidak membingungkan
            // "kenapa tidak bisa diklik"). Disusun sebagai array supaya garis
            // pemisah tipis bisa disisipkan otomatis di ANTARA setiap baris
            // yang benar-benar tampil (termasuk baris kondisional seperti
            // "Menunggu Mapping Outlet"/"Tidak Ditemukan"), bukan cuma
            // setelah baris pertama seperti sebelumnya.
            const rows = [
              <StatusRow key="total" icon={<ListChecks size={15} />} label="Total Pengajuan" value={summary.total} color={C.hi} bold onClick={() => nav(null)} />,
              <StatusRow key="pending" icon={<Clock size={15} />} label="Dalam Pengajuan" sub="Belum tercatat RGU-GA" value={summary.pending} color={C.amber}
                onClick={() => nav({ key: "pending", label: "Dalam Pengajuan" })} />,
              <StatusRow key="validated" icon={<CheckCircle2 size={15} />} label="Total Tervalidasi" value={summary.validated} color={C.green}
                onClick={() => nav({ key: "validated", label: "Total Tervalidasi" })} />,
              <StatusRow key="bio" icon={<ScanFace size={15} />} label="RGU-GA SP Biometric" value={summary.bio} color="#2563EB" indent
                onClick={() => nav({ key: "validated", biometric: true, label: "RGU-GA SP Biometric" })} />,
              <StatusRow key="reg" icon={<IdCard size={15} />} label="RGU-GA Non-Biometric" value={summary.reg} color={PAL.purple} indent
                onClick={() => nav({ key: "validated", biometric: false, label: "RGU-GA Non-Biometric" })} />,
            ];
            if (summary.waitingOutlet > 0) {
              rows.push(<StatusRow key="waitingOutlet" icon={<Clock size={15} />} label="Menunggu Mapping Outlet" sub="Outlet dikenal, belum ada promotor termapping" value={summary.waitingOutlet} color={C.amber}
                onClick={() => nav({ key: "waitingOutlet", label: "Menunggu Mapping Outlet" })} />);
            }
            rows.push(<StatusRow key="rejected" icon={<XCircle size={15} />} label="Di Luar Jaringan Outlet" value={summary.rejected}
              color="#DC2626" onClick={() => nav({ key: "rejected", label: "Di Luar Jaringan Outlet" })} />);
            if (summary.notFound > 0) {
              rows.push(<StatusRow key="notFound" icon={<HelpCircle size={15} />} label="Tidak Ditemukan di RGU-GA" sub="Sampai batas waktu, data GA tidak pernah cocok" value={summary.notFound} color={C.mid}
                onClick={() => nav({ key: "notFound", label: "Tidak Ditemukan di RGU-GA" })} />);
            }
            return rows.map((row, i) => (
              <div key={row.key}>
                {i > 0 && <div style={{ height: 1, background: C.lineSoft, margin: "2px 0" }} />}
                {row}
              </div>
            ));
          })() : (
            <div style={{ fontSize: 12.5, color: C.mid, padding: "10px 2px" }}>Memuat ringkasan…</div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusRow({ icon, label, sub, value, color, bold, indent, onClick }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp type={onClick ? "button" : undefined} onClick={onClick} className={onClick ? "press" : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 2px",
        marginLeft: indent ? 22 : 0, maxWidth: indent ? `calc(100% - 22px)` : "100%",
        border: "none", background: "transparent", textAlign: "left",
        fontFamily: FF, cursor: onClick ? "pointer" : "default", boxSizing: "border-box",
      }}>
      <span style={{ color, flexShrink: 0, display: "flex" }}>{icon}</span>
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <div style={{ fontSize: bold ? 13.5 : 12.5, fontWeight: bold ? 800 : 600, color: C.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
        {sub && <div style={{ fontSize: 10.5, color: C.mid, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
      </div>
      <span style={{
        fontSize: bold ? 18 : 15, fontWeight: 800, color, flexShrink: 0, flexGrow: 0,
        minWidth: bold ? 30 : 26, textAlign: "right", fontVariantNumeric: "tabular-nums",
        fontFeatureSettings: '"tnum"',
      }}>{value}</span>
      {onClick && <ChevronRight size={14} color={C.lo} style={{ flexShrink: 0 }} />}
    </Comp>
  );
}

function LightStat({ icon, label, value, accent }) {
  return (
    <div style={{ flex: 1, background: C.sub, borderRadius: 13, padding: "10px 11px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, color: C.lo, fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>{icon}{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 4, color: accent || C.hi }}>{value}</div>
    </div>
  );
}

/* Ringkasan pengajuan outlet — ditampilkan di layar Claim Penjualan sebelum
   promotor mulai scan. Hero row "Total Pengajuan" + grid 2x2 status utama
   (Menunggu Validasi, GA Biometric, GA Non-Biometric, Pengajuan Ditolak).
   Semua angka berasal dari `detail` (pts_sale) yang sudah difilter periode
   & outlet yang sama persis dengan Riwayat Pengajuan/Kontribusi Anda. */
function OutletSummaryGrid({ total, pending, bio, reg, rejected, extra, periodLabel, brand, showBrandBadge }) {
  const tiles = [
    { key: "pending", label: "Menunggu Validasi", value: pending, color: C.amber, icon: <Clock size={15} /> },
    { key: "bio", label: "Total GA Biometric", value: bio, color: "#2563EB", icon: <ScanFace size={15} /> },
    { key: "reg", label: "Total GA Non-Biometric", value: reg, color: PAL.purple, icon: <IdCard size={15} /> },
    { key: "rejected", label: "Pengajuan Ditolak", value: rejected, color: "#DC2626", icon: <XCircle size={15} /> },
  ];
  const bt = brand ? BRAND[brand] : null;
  return (
    <div style={{ background: C.card, borderRadius: 20, padding: 17, marginBottom: 14, boxShadow: C.md }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 15 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: C.lo }}>Total Pengajuan</span>
            {showBrandBadge && (
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.03em", padding: "2px 7px", borderRadius: 99, background: bt ? bt.soft : C.sub, color: bt ? bt.ink : C.mid }}>{brand || "Semua Brand"}</span>
            )}
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", color: C.hi, marginTop: 5 }}>{total}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginTop: 2 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(237,28,36,0.1)", color: C.brand, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ShoppingBag size={18} />
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
        {tiles.map((t) => (
          <div key={t.key} style={{ borderRadius: 14, padding: "11px 12px", background: `${t.color}0F`, border: `1px solid ${t.color}30` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
              <span style={{ color: t.color, display: "flex" }}>{t.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.02em", color: C.mid, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.label}</span>
            </div>
            <div style={{ fontSize: 21, fontWeight: 700, color: t.color, letterSpacing: "-0.02em" }}>{t.value}</div>
          </div>
        ))}
      </div>
      {extra > 0 && (
        <div style={{ marginTop: 11, fontSize: 11, color: C.mid, textAlign: "center" }}>
          + {extra} lainnya (menunggu mapping outlet / belum ditemukan di RGU-GA)
        </div>
      )}
    </div>
  );
}

// Label konsisten dengan Detail Status Pengajuan di home — supaya istilah
// di Riwayat dan di Ringkasan tidak beda-beda.
const GA_BADGE = {
  BELUM_TERVALIDASI: { label: "Dalam Pengajuan", fg: "#B7791F", bg: "rgba(255,176,32,0.14)" },
  TERVALIDASI: { label: "Tervalidasi", fg: "#1A9E5A", bg: "rgba(26,158,90,0.12)" },
  TERVALIDASI_LUAR_AREA: { label: "Tervalidasi · Luar Area", fg: "#1A9E5A", bg: "rgba(26,158,90,0.12)" },
  MENUNGGU_MAPPING_OUTLET: { label: "Menunggu Mapping Outlet", fg: "#B7791F", bg: "rgba(255,176,32,0.14)" },
  TIDAK_SESUAI_OUTLET: { label: "Di Luar Jaringan Outlet", fg: "#DC2626", bg: "rgba(220,38,38,0.1)" },
  TIDAK_DITEMUKAN: { label: "Tidak Ditemukan", fg: "#61616C", bg: "rgba(97,97,108,0.12)" },
};
const gaBadge = (status) => GA_BADGE[status] || GA_BADGE.BELUM_TERVALIDASI;

/* Ikon kartu SIM — dipakai konsisten sebagai representasi MSISDN di seluruh
   app promotor (pengganti ikon telepon generik yang kurang tepat konteksnya
   untuk "nomor kartu perdana yang di-claim"). */
function SimCardIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.5 3h8.5l4.5 4.5V20a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <rect x="8.3" y="10.2" width="7.4" height="6.3" rx="1.3" stroke="currentColor" strokeWidth="1.4" />
      <line x1="8.3" y1="13.35" x2="15.7" y2="13.35" stroke="currentColor" strokeWidth="1.1" />
      <line x1="12" y1="10.2" x2="12" y2="16.5" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

function BrandChip({ brand }) {
  const bt = brandTheme(brand);
  if (!bt) return null;
  return (
    <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.03em", padding: "2px 7px", borderRadius: 99, flexShrink: 0, background: bt.soft, color: bt.ink }}>
      {brand}
    </span>
  );
}

// Konteks/section Riwayat — konsisten dengan kartu Kontribusi Anda di
// beranda, supaya tap dari sana langsung mendarat di section yang benar.
function categoryOf(s) {
  const st = s.ga_status;
  if (st === "TERVALIDASI" || st === "TERVALIDASI_LUAR_AREA") return "validated";
  if (st === "MENUNGGU_MAPPING_OUTLET") return "waitingOutlet";
  if (st === "TIDAK_SESUAI_OUTLET") return "rejected";
  if (st === "TIDAK_DITEMUKAN") return "notFound";
  return "pending";
}
// Tab Riwayat — konsisten dengan kartu Kontribusi Anda di beranda, supaya
// tap dari sana langsung mendarat di tab yang benar.
const HISTORY_TABS = [
  { key: "all", title: "Semua" },
  { key: "validated", title: "Tervalidasi" },
  { key: "pending", title: "Dalam Pengajuan" },
  { key: "waitingOutlet", title: "Menunggu Outlet" },
  { key: "rejected", title: "Di Luar Jaringan" },
  { key: "notFound", title: "Tidak Ditemukan" },
];

function HistoryView({ history, onDelete, promotorId, period, onPeriodChange, filter }) {
  const [detailSale, setDetailSale] = useState(null);
  const [tab, setTab] = useState(filter?.key || "all");
  const [bioFilter, setBioFilter] = useState(filter?.key === "validated" ? (filter.biometric === true ? "bio" : filter.biometric === false ? "reg" : "all") : "all");

  // Kalau ada tap baru dari Kontribusi Anda (mis. ganti dari "Tervalidasi"
  // ke "Menunggu Mapping Outlet") sementara sudah di layar ini, ikuti tab
  // barunya.
  useEffect(() => {
    setTab(filter?.key || "all");
    setBioFilter(filter?.key === "validated" ? (filter.biometric === true ? "bio" : filter.biometric === false ? "reg" : "all") : "all");
  }, [filter]);

  // Sejalan dengan Kontribusi Anda di beranda: mengikuti credited_period
  // (bulan yang sama dengan selector "Lihat performa"), bukan tagged_at.
  const scoped = useMemo(() => (period ? history.filter((s) => s.credited_period === period) : history), [history, period]);
  const withCat = useMemo(() => scoped.map((s) => ({ ...s, _cat: categoryOf(s) })), [scoped]);

  const counts = useMemo(() => {
    const c = { all: withCat.length, validated: 0, pending: 0, waitingOutlet: 0, rejected: 0, notFound: 0 };
    withCat.forEach((s) => { c[s._cat] = (c[s._cat] || 0) + 1; });
    return c;
  }, [withCat]);

  const visible = useMemo(() => {
    let v = tab === "all" ? withCat : withCat.filter((s) => s._cat === tab);
    if (tab === "validated" && bioFilter !== "all") {
      v = v.filter((s) => s.biometric_status === (bioFilter === "bio" ? "BIOMETRIC" : "REGULAR"));
    }
    return v;
  }, [withCat, tab, bioFilter]);

  const isEmptyOverall = counts.all === 0;

  // Pesan kosong yang disesuaikan per konteks — supaya "belum ada apa-apa
  // sama sekali" terlihat berbeda (dan lebih tenang/rapi) dibanding "ada
  // data lain, tapi kategori ini yang kosong".
  const emptyCopy = isEmptyOverall
    ? { title: "Belum Ada Pengajuan", sub: `Riwayat pengajuan Anda untuk periode ${period ? ymLabel(period) : "ini"} akan muncul di sini.` }
    : { title: "Tidak Ada di Kategori Ini", sub: "Coba pilih tab lain untuk melihat pengajuan dengan status berbeda." };

  return (
    <div style={{ animation: "up .3s ease" }}>
      {/* Selector periode — sama seperti di beranda, supaya promotor bisa
          langsung pindah bulan dari layar ini juga tanpa harus balik dulu
          ke Kontribusi Anda. Selalu tampil (baik ada data atau tidak). */}
      {onPeriodChange && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 12.5, color: C.mid, fontWeight: 600 }}>{isEmptyOverall ? "Belum ada pengajuan" : `${counts.all} pengajuan tercatat`}</span>
          <div style={{ position: "relative" }}>
            <select value={period} onChange={(e) => onPeriodChange(e.target.value)}
              style={{ appearance: "none", height: 34, borderRadius: 11, border: `1px solid ${C.brand}55`, background: C.card, color: C.hi, fontFamily: FF, fontSize: 12.5, fontWeight: 700, padding: "0 28px 0 30px", cursor: "pointer", boxShadow: C.sm }}>
              {statsPeriodOptions().map((pOpt) => <option key={pOpt} value={pOpt}>{ymLabel(pOpt)}</option>)}
            </select>
            <CalendarDays size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.brand, pointerEvents: "none" }} />
            <ChevronDown size={12} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: C.lo, pointerEvents: "none" }} />
          </div>
        </div>
      )}

      {/* Tab section — pengganti daftar bertumpuk sebelumnya, supaya
          promotor bisa langsung lompat ke konteks yang diinginkan. Tidak
          ditampilkan sama sekali kalau memang belum ada data apa pun,
          supaya layar kosong terasa bersih. Kalau sudah ada data, SEMUA
          tab selalu ditampilkan (walau count-nya 0) — sebelumnya tab
          dengan count 0 disembunyikan, yang membuat layar ini "terlihat
          beda" tergantung dari mana masuknya (tombol Riwayat di beranda vs
          tap baris tertentu di Detail Status Pengajuan), padahal datanya
          sama, cuma tab aktifnya yang berbeda. */}
      {!isEmptyOverall && (
        <>
          <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 4, marginBottom: tab === "validated" ? 10 : 14, WebkitOverflowScrolling: "touch" }}>
            {HISTORY_TABS.map((t) => {
              const on = tab === t.key;
              return (
                <button key={t.key} onClick={() => { setTab(t.key); if (t.key !== "validated") setBioFilter("all"); }} className="press"
                  style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 13px", borderRadius: 99, border: `1px solid ${on ? C.brand : C.line}`, background: on ? C.brand : C.card, color: on ? "#fff" : C.hi, fontFamily: FF, fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                  {t.title}
                  <span style={{ fontSize: 10.5, fontWeight: 800, padding: "1px 6px", borderRadius: 99, background: on ? "rgba(255,255,255,0.22)" : C.sub, color: on ? "#fff" : C.mid }}>{counts[t.key] || 0}</span>
                </button>
              );
            })}
          </div>

          {tab === "validated" && (
            <div style={{ display: "flex", gap: 7, marginBottom: 14 }}>
              {[["all", "Semua"], ["bio", "Biometric"], ["reg", "Non-Biometric"]].map(([k, label]) => {
                const on = bioFilter === k;
                return (
                  <button key={k} onClick={() => setBioFilter(k)} className="press"
                    style={{ height: 28, padding: "0 11px", borderRadius: 99, border: `1px solid ${on ? C.blue : C.line}`, background: on ? "rgba(37,99,235,0.1)" : C.card, color: on ? C.blue : C.mid, fontFamily: FF, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {visible.length === 0 ? (
        <div style={{ background: C.card, borderRadius: 20, padding: "40px 22px", textAlign: "center", boxShadow: C.md }}>
          <div style={{ width: 54, height: 54, borderRadius: 16, margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center", background: C.sub, color: C.lo }}>
            <History size={23} />
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: C.hi, letterSpacing: "-0.01em" }}>{emptyCopy.title}</div>
          <div style={{ fontSize: 12.5, color: C.mid, marginTop: 6, lineHeight: 1.55, maxWidth: 280, marginLeft: "auto", marginRight: "auto" }}>{emptyCopy.sub}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visible.map((s) => <HistoryRow key={s.id} s={s} promotorId={promotorId} onDelete={onDelete} onOpen={setDetailSale} />)}
        </div>
      )}
      {detailSale && <GaMatchDetailModal sale={detailSale} onClose={() => setDetailSale(null)} />}
    </div>
  );
}

function HistoryRow({ s, promotorId, onDelete, onOpen }) {
  const badge = gaBadge(s.ga_status);
  // Pindah kredit — tampilkan info singkat kalau baris ini bukan lagi murni
  // "diajukan dan diakui di outlet sendiri".
  const movedAway = s.promotor_id === promotorId && s.credited_promotor_id && s.credited_promotor_id !== promotorId;
  const gainedFromOther = s.credited_promotor_id === promotorId && s.promotor_id !== promotorId;
  const movedOutletOnly = s.credited_transfer_type === "same_promotor_diff_outlet";
  // Ikon utama baris ini disederhanakan jadi gaya "task list": tanda
  // centang kalau sudah tervalidasi RGU-GA, lingkaran kosong kalau belum —
  // diperbesar supaya proporsinya seimbang dengan konten teks di kanannya
  // (sebelumnya ikon SIM card/radar 34px terasa kekecilan).
  const isValidated = categoryOf(s) === "validated";
  return (
    <div onClick={() => onOpen(s)} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(s); }} className="press" style={{
      display: "block", width: "100%", textAlign: "left", border: "none", cursor: "pointer", fontFamily: FF,
      background: C.card, borderRadius: 16, padding: 13, boxShadow: C.md,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 44, height: 44, borderRadius: 13, background: isValidated ? "rgba(26,158,90,0.12)" : C.sub, color: isValidated ? C.green : C.lo, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{isValidated ? <CheckCircle2 size={23} /> : <Circle size={20} />}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14.5, fontWeight: 800, fontFamily: "monospace", color: C.hi }}>{s.phone_normalized}</span>
            {s.brand && <BrandChip brand={s.brand} />}
            {s.biometric_status === "BIOMETRIC" && (
              <span title="RGU-GA SP Biometric" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 99, background: "rgba(37,99,235,0.12)", color: "#2563EB" }}><ScanFace size={10} /> Biometric</span>
            )}
            {s.biometric_status === "REGULAR" && (
              <span title="RGU-GA Non-Biometric" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 99, background: PAL.purple + "22", color: PAL.purple }}><IdCard size={10} /> Non-Biometric</span>
            )}
          </div>
          {s.imei && <div style={{ fontSize: 10.5, fontFamily: "monospace", color: C.lo }}>IMEI {s.imei}</div>}
          <div style={{ fontSize: 11.5, color: C.lo, fontWeight: 500 }}>{fmtDateTime(s.tagged_at)}{s.within_radius === false ? " · di luar area" : ""}{s.credited_period ? ` · periode ${ymLabel(s.credited_period)}` : ""}</div>
        </div>
        <ChevronRight size={15} color={C.lo} style={{ flexShrink: 0 }} />
        {onDelete && (
          <button onClick={(e) => { e.stopPropagation(); onDelete(s); }} aria-label="Hapus" style={{ width: 30, height: 30, borderRadius: 9, border: "none", background: "rgba(220,38,38,0.08)", color: "#DC2626", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {(badge || movedAway || gainedFromOther || movedOutletOnly) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 9, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.03em", padding: "4px 9px", borderRadius: 99, background: badge.bg, color: badge.fg, whiteSpace: "nowrap" }}>{badge.label}</span>
          {movedAway && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: "#B45309" }}><ArrowLeftRight size={11} /> Dipindahkan ke promotor lain</span>
          )}
          {gainedFromOther && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: C.green }}><ArrowLeftRight size={11} /> Tambahan dari promotor lain</span>
          )}
          {movedOutletOnly && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: C.blue }}><ArrowLeftRight size={11} /> Pindah outlet</span>
          )}
        </div>
      )}
      {s.ga_note && (
        <div style={{
          marginTop: 9, padding: "8px 10px", borderRadius: 10, lineHeight: 1.5, fontSize: 11.5,
          background: s.ga_status === "TIDAK_SESUAI_OUTLET" ? "rgba(220,38,38,0.08)" : "rgba(255,176,32,0.1)",
          color: s.ga_status === "TIDAK_SESUAI_OUTLET" ? "#DC2626" : C.amber,
        }}>
          {s.ga_note}
        </div>
      )}
    </div>
  );
}

/* Popup detail GA — ditampilkan saat baris Riwayat di-tap. Menampilkan data
   mentah hasil pencocokan GA (ga_dt, brand, ga_branch, organization_id,
   biometric_status) dari pts_ga_match, plus outlet/promotor yang diakui
   kalau kreditnya berpindah. */
function GaMatchDetailModal({ sale, onClose }) {
  const [match, setMatch] = useState(undefined); // undefined=loading, null=belum ada, object=ada
  const [creditedInfo, setCreditedInfo] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: m } = await supabase.from("pts_ga_match").select("*").eq("sale_id", sale.id).maybeSingle();
      if (!alive) return;
      setMatch(m || null);

      if (sale.credited_outlet_id || sale.credited_promotor_id) {
        const [{ data: outlet }, { data: promotor }] = await Promise.all([
          sale.credited_outlet_id ? supabase.from("pts_outlet").select("name,code,code_3id,branch,area,region").eq("id", sale.credited_outlet_id).maybeSingle() : Promise.resolve({ data: null }),
          sale.credited_promotor_id ? supabase.from("pts_promotor").select("full_name,promotor_id,user_id_3id").eq("id", sale.credited_promotor_id).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        if (alive) setCreditedInfo({ outlet, promotor });
      }
    })();
    return () => { alive = false; };
  }, [sale.id]);

  const badge = gaBadge(sale.ga_status);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 150, background: "rgba(17,18,22,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 22 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 400, maxHeight: "85vh", overflowY: "auto", background: C.card, borderRadius: 22, padding: "22px 20px 18px", boxShadow: C.lg, animation: "pop .22s cubic-bezier(.22,1,.36,1)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontFamily: "monospace", fontWeight: 800, color: C.hi }}>{sale.phone_normalized}</div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 9, border: "none", background: C.sub, color: C.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={16} /></button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.03em", padding: "3px 9px", borderRadius: 99, background: badge.bg, color: badge.fg }}>{badge.label}</span>
          {sale.credited_period && <span style={{ fontSize: 11, color: C.mid, fontWeight: 600 }}>periode {ymLabel(sale.credited_period)}</span>}
        </div>

        {match === undefined ? (
          <div style={{ display: "flex", alignItems: "center", gap: 9, color: C.mid, fontSize: 13, padding: "10px 0" }}><Spinner size={16} color={C.brand} /> Memuat detail…</div>
        ) : match === null ? (
          <div style={{ fontSize: 13, color: C.mid, padding: "10px 0", lineHeight: 1.5 }}>Belum ada data GA yang cocok untuk nomor ini — masih menunggu validasi.</div>
        ) : (
          <div style={{ borderRadius: 14, background: C.sub, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.lo, marginBottom: 2 }}>Data GA (Raw)</div>
            <TakenRow label="GA Date" value={match.ga_dt || "—"} />
            <TakenRow label="Brand" value={match.brand || "—"} />
            <TakenRow label="MSISDN" value={match.msisdn || "—"} />
            <TakenRow label="GA Branch" value={match.ga_branch || "—"} />
            <TakenRow label="Organization ID" value={match.organization_id || "—"} />
            <TakenRow label="Biometric Status" value={match.biometric_status || "—"} />
          </div>
        )}

        {creditedInfo && (creditedInfo.outlet || creditedInfo.promotor) && (
          <div style={{ borderRadius: 14, background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.16)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.blue, marginBottom: 2 }}>Diakui Sebagai Pencapaian</div>
            {creditedInfo.promotor && (
              <TakenRow label="Promotor" value={creditedInfo.promotor.full_name || (match?.brand === "3ID" ? creditedInfo.promotor.user_id_3id : creditedInfo.promotor.promotor_id) || "—"} />
            )}
            {creditedInfo.outlet && (
              <>
                <TakenRow label="Outlet" value={creditedInfo.outlet.name || creditedInfo.outlet.code || "—"} />
                <TakenRow label="Branch" value={creditedInfo.outlet.branch || "—"} />
                <TakenRow label="Area" value={creditedInfo.outlet.area || "—"} />
                <TakenRow label="Region" value={creditedInfo.outlet.region || "—"} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Small parts ─────────────────────────────────────────────── */
function IconBtn({ children, onClick, active, danger, label, badge }) {
  const col = danger ? "#DC2626" : active ? C.brand : C.mid;
  const bd = danger ? "rgba(220,38,38,0.28)" : active ? C.brand : C.line;
  const bg = danger ? "rgba(220,38,38,0.06)" : active ? "rgba(237,28,36,0.08)" : C.card;
  return (
    <button className="press" onClick={onClick} style={{ position: "relative", height: 42, minWidth: 42, padding: label ? "0 14px" : 0, borderRadius: 13, border: `1px solid ${bd}`, background: bg, color: col, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer", boxShadow: C.sm, fontFamily: FF, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" }}>
      {children}{label}
      {badge > 0 && <span style={{ position: "absolute", top: -5, right: -5, minWidth: 18, height: 18, padding: "0 4px", borderRadius: 99, background: C.brand, color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 2px #F4F5F7" }}>{badge}</span>}
    </button>
  );
}
function TakenRow({ label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
      <span style={{ color: C.mid, fontWeight: 500 }}>{label}</span>
      <span style={{ color: C.hi, fontWeight: 700, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{value}</span>
    </div>
  );
}
function GeoChip({ geo, err, onFix }) {
  if (geo && !err) return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 99, background: "rgba(48,209,88,0.12)", color: C.green, border: "1px solid rgba(48,209,88,0.25)" }}><Navigation size={12} /> Lokasi aktif{geo.accuracy ? ` · ±${geo.accuracy}m` : ""}</span>;
  return <button onClick={onFix} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 99, background: "rgba(255,176,32,0.12)", color: C.amber, border: "1px solid rgba(255,176,32,0.28)", cursor: "pointer", fontFamily: FF }}><AlertTriangle size={12} /> Aktifkan lokasi</button>;
}
function OutletPicker({ outlets, onPick, onClose, onRename }) {
  return (
    <BottomSheet onClose={onClose}>
      <div style={{ padding: "2px 18px calc(env(safe-area-inset-bottom,0px) + 20px)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.hi, letterSpacing: "-0.02em" }}>Pilih Outlet</div>
            <div style={{ fontSize: 12, color: C.mid, marginTop: 2 }}>{outlets.length} outlet aktif — tap salah satu untuk berpindah</div>
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: C.sub, color: C.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={18} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {outlets.map((o) => {
            const displayName = o.name && o.name !== o.code ? o.name : o.code;
            const hasDual = !!o.code3id;
            return (
              <div key={o.code} role="button" tabIndex={0} onClick={() => onPick(o)}
                onKeyDown={(e) => { if (e.key === "Enter") onPick(o); }} className="press"
                style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: 14, background: C.sub, padding: "14px", cursor: "pointer", fontFamily: FF, boxSizing: "border-box" }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "#fff", color: C.brand, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: C.sm }}><Store size={18} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Tombol edit nama langsung di sebelah nama outlet, supaya
                      jelas fungsinya untuk mengganti nama outlet ini. */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 800, color: C.hi, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</span>
                    {onRename && (
                      <button onClick={(e) => { e.stopPropagation(); onRename(o); }} aria-label="Ganti nama outlet"
                        style={{ width: 24, height: 24, borderRadius: 7, border: "none", background: "#fff", color: C.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, boxShadow: C.sm }}>
                        <Pencil size={12} />
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, fontFamily: "monospace", padding: "2px 7px", borderRadius: 99, background: BRAND.IM3.soft, color: BRAND.IM3.ink }}>IM3 {o.code}</span>
                    {hasDual && <span style={{ fontSize: 10.5, fontWeight: 700, fontFamily: "monospace", padding: "2px 7px", borderRadius: 99, background: BRAND["3ID"].soft, color: BRAND["3ID"].ink }}>3ID {o.code3id}</span>}
                  </div>
                  {o.area && <div style={{ fontSize: 11.5, color: C.mid, marginTop: 5 }}>{o.area}</div>}
                </div>
                <ChevronRight size={18} color={C.lo} style={{ flexShrink: 0 }} />
              </div>
            );
          })}
        </div>
      </div>
    </BottomSheet>
  );
}

/* ── Sheet generik utk ganti nama (dipakai utk nama promotor & nama outlet
   sendiri) — cuma satu field teks, tidak pernah menyentuh kolom ID apapun. ── */
function RenameSheet({ title, label, placeholder, initial, note, onClose, onSave }) {
  const [val, setVal] = useState(initial || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!val.trim()) { setErr("Tidak boleh kosong."); return; }
    setSaving(true); setErr("");
    try {
      await onSave(val.trim());
      onClose();
    } catch (e) {
      setErr(e?.message || "Gagal menyimpan.");
      setSaving(false);
    }
  };

  return (
    <Sheet title={title} onClose={onClose}>
      <div style={{ padding: "0 18px calc(env(safe-area-inset-bottom,0px) + 20px)", display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: C.mid }}>{label}</label>
          <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} placeholder={placeholder} maxLength={120} enterKeyHint="done"
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            style={{ width: "100%", height: 52, borderRadius: 13, border: `1px solid ${C.line}`, background: C.sub, color: C.hi, fontFamily: FF, fontSize: 16, fontWeight: 600, padding: "0 15px", outline: "none", marginTop: 6, boxSizing: "border-box" }} />
        </div>
        {note && <div style={{ fontSize: 11.5, color: C.lo, lineHeight: 1.5 }}>{note}</div>}
        {err && <div style={{ fontSize: 12.5, fontWeight: 700, color: "#DC2626" }}>{err}</div>}
        <button onClick={submit} disabled={saving || !val.trim()} className="press"
          style={{ height: 52, borderRadius: 13, border: "none", background: val.trim() ? C.brand : C.line, color: val.trim() ? "#fff" : C.lo, fontFamily: FF, fontSize: 15, fontWeight: 700, cursor: val.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {saving ? <Spinner size={18} color="#fff" /> : <Check size={18} />} Simpan
        </button>
      </div>
    </Sheet>
  );
}
