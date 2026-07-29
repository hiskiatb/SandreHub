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
  ShoppingBag, ChevronRight, History, Navigation, AlertTriangle,
  X, ChevronLeft, Phone, CalendarDays, Trash2,
  ArrowLeftRight, Inbox, ShieldQuestion, Radar, RefreshCcw,
} from "lucide-react";
import supabase from "../../lib/supabase";
import { HubLogoLoader } from "../../components/HubLogoLoader";
import { QRScannerSheet, AccessHelp, BottomSheet, imeiValid, Spinner } from "./components";
import {
  ymNow, ymLabel, pad2, fmtTime, fmtDateFull, fmtDateTime,
  normalizePhone, getPosition, checkGeoPermission,
} from "./ptsClient";

// Rollout SandraHub dimulai Juli 2026 — periode tidak bisa dipilih sebelum ini.
const PERIOD_FLOOR = "2026-07";
function periodOptions() {
  const out = [];
  const now = new Date();
  const floor = new Date(2026, 6, 1);
  for (let d = new Date(now.getFullYear(), now.getMonth(), 1); d >= floor; d.setMonth(d.getMonth() - 1)) {
    out.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
  }
  if (!out.length) out.push(PERIOD_FLOOR);
  return out;
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

// Nada sukses (dua nada naik) via Web Audio — tanpa file
function playSuccessTone() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = new AC();
    [[880, 0], [1174, 0.12]].forEach(([f, t]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      o.connect(g); g.connect(ctx.destination);
      const s = ctx.currentTime + t;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.25, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.16);
      o.start(s); o.stop(s + 0.18);
    });
    setTimeout(() => ctx.close?.(), 500);
  } catch { /* abaikan */ }
}

const todayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };

export default function PromotorApp() {
  const router = useRouter();
  const [phase, setPhase] = useState("loading");   // loading | pending | app
  const [email, setEmail] = useState("");
  const [uid, setUid] = useState("");
  const [name, setName] = useState("");
  const [promotorId, setPromotorId] = useState(null);
  const [outlets, setOutlets] = useState([]);      // {code,id,branch,area,region,name}
  const [activeOutlet, setActiveOutlet] = useState(null);
  const [todaySales, setTodaySales] = useState([]);
  const [view, setView] = useState("home");        // home | history
  const [history, setHistory] = useState([]);

  const [geo, setGeo] = useState(null);
  const [geoErr, setGeoErr] = useState("");
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const [period, setPeriod] = useState(ymNow());
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
    const { data: ures } = await supabase.auth.getUser();
    const user = ures?.user;
    if (!user) { router.replace("/promotor/login"); return; }
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
  }, [router]);

  useEffect(() => { resolveIdentity(); }, [resolveIdentity]);

  /* ── Assignment per periode — jalan ulang tiap kali promotorId siap ATAU
     periode yang dipilih berubah (dropdown bulan), tanpa perlu resolve
     identitas dari awal lagi. ─────────────────────────────────────────── */
  const loadPeriodAssignment = useCallback(async () => {
    if (!promotorId) return;
    setPhase("loading");
    const { data: asg } = await supabase.from("pts_assignment")
      .select("*").eq("promotor_id_ref", promotorId).eq("period", period).eq("status", "active");
    const rows = asg || [];
    const active = rows.length > 0;

    await supabase.from("pts_promotor")
      .update({ region: rows[0]?.region || null, status: active ? "active" : "pending", updated_at: new Date().toISOString() })
      .eq("id", promotorId);

    if (!active) { setOutlets([]); setActiveOutlet(null); setTodaySales([]); setPhase("pending"); return; }

    // daftar outlet unik
    const byCode = new Map();
    rows.forEach((r) => { if (!byCode.has(r.outlet_code)) byCode.set(r.outlet_code, { code: r.outlet_code, id: r.outlet_id, branch: r.branch, area: r.area, region: r.region, brand: r.brand, cluster: r.cluster, name: r.outlet_code }); });
    const outletList = [...byCode.values()];
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

  const loadHistory = useCallback(async () => {
    const { data } = await supabase.from("pts_sale").select("*").eq("promotor_id", promotorId).order("tagged_at", { ascending: false }).limit(80);
    setHistory(data || []);
  }, [promotorId]);

  const signOut = async () => { await supabase.auth.signOut(); router.replace("/promotor/login"); };

  /* ── Render ────────────────────────────────────────────────── */
  if (phase === "loading") return <Splash />;
  if (phase === "pending") return <Pending email={email} period={period} setPeriod={setPeriod} onReload={loadPeriodAssignment} onSignOut={signOut} />;

  return (
    <AppShell
      name={name} email={email} uid={uid} promotorId={promotorId}
      period={period} setPeriod={setPeriod} outlets={outlets}
      activeOutlet={activeOutlet} setActiveOutlet={setActiveOutlet}
      todaySales={todaySales} loadTodaySales={loadTodaySales}
      geo={geo} geoErr={geoErr} refreshGeo={refreshGeo}
      view={view} setView={setView}
      history={history} loadHistory={loadHistory}
      onSignOut={signOut} flash={flash} toast={toast}
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
function Pending({ email, period, setPeriod, onReload, onSignOut }) {
  const [busy, setBusy] = useState(false);
  const reload = async () => { setBusy(true); await onReload(); setBusy(false); };
  return (
    <div style={{ minHeight: "100svh", background: C.bg, color: C.hi, fontFamily: FF, display: "flex", flexDirection: "column", padding: "0 26px", textAlign: "center" }}>
      <style>{`@keyframes fl{0%,100%{opacity:.55}50%{opacity:1}}`}</style>
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
            <select value={period} onChange={(e) => setPeriod(e.target.value)}
              style={{ width: "100%", height: 46, borderRadius: 12, border: `1px solid ${C.line}`, background: C.card, color: C.hi, fontFamily: FF, fontSize: 14, fontWeight: 600, padding: "0 14px" }}>
              {periodOptions().map((p) => <option key={p} value={p}>{ymLabel(p)}</option>)}
            </select>
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: "calc(env(safe-area-inset-bottom,0px) + 26px)" }}>
        <button onClick={reload} disabled={busy} style={{ height: 54, borderRadius: 15, border: "none", background: C.brand, color: "#fff", fontFamily: FF, fontSize: 15.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, cursor: "pointer", opacity: busy ? 0.7 : 1 }}>
          {busy ? <Spinner size={19} color="#fff" /> : <RefreshCw size={18} />} Muat Ulang Status
        </button>
        <button onClick={onSignOut} style={{ height: 50, borderRadius: 14, border: `1px solid ${C.line}`, background: "transparent", color: C.mid, fontFamily: FF, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}>
          <LogOut size={16} /> Keluar
        </button>
      </div>
    </div>
  );
}

/* ══════════════════ App Shell ══════════════════ */
function AppShell(p) {
  const { name, email, promotorId, period, setPeriod, outlets, activeOutlet, setActiveOutlet, todaySales, loadTodaySales, geo, geoErr, refreshGeo, view, setView, history, loadHistory, onSignOut, flash, toast } = p;
  const [sheet, setSheet] = useState(null);        // 'qr'
  const [pickOutlet, setPickOutlet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [geoHelp, setGeoHelp] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [delSale, setDelSale] = useState(null);
  const [success, setSuccess] = useState(null);     // msisdn berhasil → animasi
  const [taken, setTaken] = useState(null);          // { phone, owner }
  const [outsideConfirm, setOutsideConfirm] = useState(null); // { phone, imei, raw, distance, radius }
  const [incoming, setIncoming] = useState([]);      // permintaan transfer masuk
  const [approveReq, setApproveReq] = useState(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [summary, setSummary] = useState(null);      // ringkasan klaim per periode

  const loadIncoming = useCallback(async () => {
    const { data } = await supabase.from("pts_transfer_request")
      .select("*").ilike("from_email", email).eq("status", "pending").order("requested_at", { ascending: false });
    setIncoming(data || []);
  }, [email]);
  useEffect(() => { loadIncoming(); }, [loadIncoming]);

  /* Ringkasan Claim Penjualan periode terpilih: jumlah SP di-claim + rincian
     validasi GA (total tervalidasi, biometric, non-biometric). */
  const loadSummary = useCallback(async () => {
    if (!promotorId) { setSummary(null); return; }
    const [y, mo] = period.split("-").map(Number);
    const start = `${period}-01`;
    const nd = new Date(y, mo, 1);
    const end = `${nd.getFullYear()}-${pad2(nd.getMonth() + 1)}-01`;
    const { data } = await supabase.from("pts_sale").select("ga_status,biometric_status")
      .eq("promotor_id", promotorId).gte("tagged_at", start).lt("tagged_at", end);
    const rows = data || [];
    const validated = rows.filter((r) => r.ga_status === "TERVALIDASI" || r.ga_status === "TERVALIDASI_LUAR_AREA").length;
    const bio = rows.filter((r) => r.biometric_status === "BIOMETRIC").length;
    const reg = rows.filter((r) => r.biometric_status === "REGULAR").length;
    setSummary({ total: rows.length, validated, bio, reg });
  }, [promotorId, period]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  const decideTransfer = async (req, approve) => {
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
  useEffect(() => { if (success) { const id = setTimeout(() => setSuccess(null), 1900); return () => clearTimeout(id); } }, [success]);

  const fixGeo = async () => { const g = await refreshGeo(); if (!g) setGeoHelp(true); else setGeoHelp(false); };
  const initial = (name || "P").trim().charAt(0).toUpperCase();

  useEffect(() => { if (view === "history") loadHistory(); }, [view, loadHistory]);

  const soldCount = todaySales.length;

  const chooseOutlet = async (o) => { setActiveOutlet(o); setPickOutlet(false); await loadTodaySales(promotorId, o.id); };

  /* Tag penjualan (QR) — via RPC pts_tag_sale (geofence-aware).
     Payload tag sebenarnya "nomor|imei" — IMEI ikut disimpan per tagging. */
  const tagSale = async (normalized, imei, raw, confirmOutside) => {
    if (!activeOutlet?.id) throw new Error("Outlet aktif tidak ditemukan, pilih ulang outlet.");
    const { data, error } = await supabase.rpc("pts_tag_sale", {
      p_phone: normalized, p_session: null, p_outlet: activeOutlet.id,
      p_lat: geo?.lat ?? null, p_lng: geo?.lng ?? null, p_raw: String(raw),
      p_confirm_outside: confirmOutside, p_imei: imei || null,
    });
    if (error) throw error;
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

  const onQR = async ({ phone, imei, raw }) => {
    setSheet(null);
    try {
      const { normalized, valid } = normalizePhone(phone);
      if (!valid) { flash(`Nomor tidak valid: ${normalized || phone}`, "err"); return; }
      if (!imeiValid(imei)) { flash("IMEI belum valid, periksa lagi.", "err"); return; }
      if (!activeOutlet) { flash("Pilih outlet aktif terlebih dulu.", "err"); return; }
      let g = geo;
      if (!g) { g = await refreshGeo(); if (!g) { setGeoHelp(true); return; } }
      setBusy(true);
      const data = await tagSale(normalized, imei, raw, false);
      await handleTagResult(data, normalized, imei, raw);
    } catch (e) { flash("Gagal menyimpan: " + describeError(e, "onQR"), "err"); setBusy(false); }
  };

  const handleTagResult = async (data, normalized, imei, raw) => {
    const st = data?.status;
    if (st === "ok") { await loadTodaySales(promotorId, activeOutlet.id); loadSummary(); setBusy(false); playSuccessTone(); setSuccess({ msisdn: normalized, at: new Date().toISOString() }); return; }
    if (st === "self") { flash("Nomor ini sudah Anda claim.", "err"); setBusy(false); return; }
    if (st === "taken" || st === "taken_race") { setBusy(false); setTaken({ phone: normalized, owner: data?.owner || null }); return; }
    if (st === "outside_radius") {
      setBusy(false);
      setOutsideConfirm({ phone: normalized, imei, raw, distance: data?.distance_meters, radius: data?.radius_meters });
      return;
    }
    if (st === "geo_required") { setBusy(false); flash("Lokasi diperlukan untuk claim di outlet ini. Aktifkan lokasi lalu coba lagi.", "err"); setGeoHelp(true); return; }
    if (st === "invalid_phone") { flash(`Nomor tidak valid: ${normalized || raw}`, "err"); setBusy(false); return; }
    if (st === "unauth") { flash("Sesi login berakhir, silakan masuk ulang.", "err"); setBusy(false); return; }
    flash("Gagal menyimpan.", "err"); setBusy(false);
  };

  const confirmOutsideTag = async () => {
    const c = outsideConfirm; if (!c) return;
    setOutsideConfirm(null); setBusy(true);
    try {
      const data = await tagSale(c.phone, c.imei, c.raw, true);
      await handleTagResult(data, c.phone, c.imei, c.raw);
    } catch (e) { flash("Gagal menyimpan: " + describeError(e, "confirmOutsideTag"), "err"); setBusy(false); }
  };

  /* Ajukan pemindahan nomor yang sudah ditag orang lain — outlet aktif dikirim
     eksplisit (bukan diturunkan dari sesi check-in/out lama yang sudah tidak
     dipakai lagi), supaya outlet tujuan pengajuan tercatat benar. */
  const requestTransfer = async () => {
    const phone = taken?.phone; if (!phone) return;
    setTaken(null); setBusy(true);
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

  const doDeleteSale = async () => {
    const s = delSale; if (!s) return;
    setDelSale(null); setBusy(true);
    try {
      const { error } = await supabase.from("pts_sale").delete().eq("id", s.id);
      if (error) throw error;
      if (activeOutlet) await loadTodaySales(promotorId, activeOutlet.id);
      loadSummary();
      flash("Nomor dihapus");
    } catch (e) { flash("Gagal menghapus: " + describeError(e, "doDeleteSale"), "err"); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: "100svh", background: C.bg, color: C.hi, fontFamily: FF, paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 24px)" }}>
      <style>{`@keyframes up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @keyframes pop{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}
        @keyframes sheetup{from{transform:translateY(100%)}to{transform:none}}
        .press{transition:transform .12s}.press:active{transform:scale(.975)}`}</style>

      {/* Header */}
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 16px) 18px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "linear-gradient(180deg,#F4F5F7 76%,rgba(244,245,247,0))", zIndex: 5, maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0, background: C.grad, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, boxShadow: "0 6px 16px rgba(237,28,36,0.28)" }}>{initial}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: C.mid, fontWeight: 600, letterSpacing: "0.02em" }}>Selamat datang</div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 190 }}>{name}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <IconBtn onClick={() => setInboxOpen(true)} badge={incoming.length}><Inbox size={17} /></IconBtn>
          <IconBtn onClick={() => setView(view === "home" ? "history" : "home")} active={view === "history"}>{view === "history" ? <ChevronLeft size={18} /> : <History size={17} />}</IconBtn>
          <IconBtn onClick={() => setConfirmLogout(true)} danger label="Keluar"><LogOut size={16} /></IconBtn>
        </div>
      </div>

      <div style={{ padding: "8px 18px 0", maxWidth: 560, margin: "0 auto" }}>
        {view === "history"
          ? <HistoryView history={history} />
          : (
            <div style={{ animation: "up .32s cubic-bezier(.22,1,.36,1)" }}>
              {/* Periode aktif */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
                <div style={{ position: "relative" }}>
                  <select value={period} onChange={(e) => setPeriod(e.target.value)}
                    style={{ appearance: "none", height: 38, borderRadius: 12, border: `1px solid ${C.brand}55`, background: C.card, color: C.hi, fontFamily: FF, fontSize: 13.5, fontWeight: 700, padding: "0 32px 0 34px", cursor: "pointer", boxShadow: C.sm }}>
                    {periodOptions().map((pOpt) => <option key={pOpt} value={pOpt}>{ymLabel(pOpt)}</option>)}
                  </select>
                  <CalendarDays size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.brand, pointerEvents: "none" }} />
                </div>
                <GeoChip geo={geo} err={geoErr} onFix={fixGeo} />
              </div>

              {/* Ringkasan Claim Penjualan periode ini */}
              {summary && (
                <div style={{ background: C.card, borderRadius: 18, padding: 16, marginBottom: 16, boxShadow: C.md }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: C.lo, marginBottom: 11 }}>Ringkasan Claim Penjualan · {ymLabel(period)}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 9 }}>
                    <LightStat icon={<ShoppingBag size={13} />} label="Jumlah SP di-claim" value={summary.total} accent={C.mag} />
                    <LightStat icon={<CheckCircle2 size={13} />} label="Total GA Tervalidasi" value={summary.validated} accent={C.green} />
                    <LightStat icon={<CheckCircle2 size={13} />} label="GA Biometric" value={summary.bio} accent={C.blue} />
                    <LightStat icon={<CheckCircle2 size={13} />} label="GA Non-Biometric" value={summary.reg} accent={C.amber} />
                  </div>
                </div>
              )}

              {!activeOutlet ? (
                <OutletSelectPanel outlets={outlets} onPick={chooseOutlet} />
              ) : !geo ? (
                <GeoGatePanel outlet={activeOutlet} err={geoErr} onFix={fixGeo} onChangeOutlet={() => setPickOutlet(true)} />
              ) : (
                <TagPanel outlet={activeOutlet} sales={todaySales} soldCount={soldCount} busy={busy} geo={geo}
                  onTag={() => setSheet("qr")} onDelete={(s) => setDelSale(s)} onChangeOutlet={() => setPickOutlet(true)} multiOutlet={outlets.length > 1} />
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
        <OutletPicker outlets={outlets} onPick={chooseOutlet} onClose={() => setPickOutlet(false)} />
      )}

      {/* Konfirmasi Hapus Nomor */}
      {delSale && (
        <div style={{ position: "fixed", inset: 0, zIndex: 140, background: "rgba(17,18,22,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 26 }} onClick={() => setDelSale(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 360, background: C.card, borderRadius: 24, padding: "26px 22px 20px", boxShadow: C.lg, textAlign: "center", animation: "pop .22s cubic-bezier(.22,1,.36,1)" }}>
            <div style={{ width: 60, height: 60, borderRadius: 18, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(220,38,38,0.09)", color: "#DC2626" }}><Trash2 size={25} /></div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: C.hi }}>Hapus nomor ini?</div>
            <div style={{ fontSize: 15, fontFamily: "monospace", fontWeight: 700, color: C.hi, marginTop: 10, padding: "8px 12px", borderRadius: 10, background: C.sub, display: "inline-block" }}>{delSale.phone_normalized}</div>
            <div style={{ fontSize: 13, color: C.mid, marginTop: 10, lineHeight: 1.5 }}>Data penjualan ini akan dihapus permanen dan tidak bisa dikembalikan.</div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="press" onClick={() => setDelSale(null)} style={{ flex: 1, height: 50, borderRadius: 14, border: `1px solid ${C.line}`, background: C.card, color: C.hi, fontFamily: FF, fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>Batal</button>
              <button className="press" onClick={doDeleteSale} style={{ flex: 1, height: 50, borderRadius: 14, border: "none", background: "#DC2626", color: "#fff", fontFamily: FF, fontSize: 14.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 22px rgba(220,38,38,0.28)" }}>Hapus</button>
            </div>
          </div>
        </div>
      )}

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

      {/* Animasi sukses claim (ala FaceID) */}
      {success && (
        <div style={{ position: "fixed", inset: 0, zIndex: 150, background: "rgba(244,245,247,0.86)", backdropFilter: "blur(8px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
          <svg width="128" height="128" viewBox="0 0 128 128">
            <circle cx="64" cy="64" r="56" fill="none" stroke="rgba(26,158,90,0.18)" strokeWidth="8" />
            <circle cx="64" cy="64" r="56" fill="none" stroke="#1A9E5A" strokeWidth="8" strokeLinecap="round"
              strokeDasharray="352" strokeDashoffset="352" transform="rotate(-90 64 64)"
              style={{ animation: "ring .5s cubic-bezier(.4,0,.2,1) forwards" }} />
            <path d="M42 65 L57 80 L86 49" fill="none" stroke="#1A9E5A" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray="70" strokeDashoffset="70" style={{ animation: "check .35s .42s cubic-bezier(.4,0,.2,1) forwards" }} />
          </svg>
          <div style={{ textAlign: "center", animation: "up .3s .5s both" }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", color: C.hi }}>Berhasil di-Claim</div>
            <div style={{ fontSize: 16, fontFamily: "monospace", fontWeight: 700, color: C.green, marginTop: 6 }}>{success.msisdn}</div>
            <div style={{ fontSize: 12.5, color: C.mid, marginTop: 5 }}>{fmtDateTime(success.at)}</div>
          </div>
          <style>{`@keyframes ring{to{stroke-dashoffset:0}}@keyframes check{to{stroke-dashoffset:0}}`}</style>
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

      {/* Kotak Masuk — permintaan pemindahan claim dari promotor lain */}
      {inboxOpen && (
        <BottomSheet onClose={() => setInboxOpen(false)}>
          <div style={{ padding: "2px 18px calc(env(safe-area-inset-bottom,0px) + 20px)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 17, fontWeight: 800, color: C.hi, letterSpacing: "-0.02em" }}><Inbox size={18} /> Kotak Masuk</div>
              <button onClick={() => setInboxOpen(false)} style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: C.sub, color: C.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={18} /></button>
            </div>
            {incoming.length === 0 ? (
              <div style={{ textAlign: "center", padding: "34px 10px", color: C.mid }}>
                <Inbox size={26} style={{ opacity: .4, marginBottom: 8 }} /><div style={{ fontSize: 13 }}>Belum ada permintaan pemindahan claim.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {incoming.map((r) => (
                  <div key={r.id} style={{ padding: "11px 12px", borderRadius: 13, background: C.sub }}>
                    <div style={{ fontSize: 15, fontFamily: "monospace", fontWeight: 800, color: C.hi }}>{r.phone_normalized}</div>
                    <div style={{ fontSize: 12, color: C.mid, marginTop: 3, lineHeight: 1.5 }}>
                      Diminta oleh <b style={{ color: C.hi }}>{r.to_full_name || r.to_email}</b>
                      {(r.to_outlet_code || r.to_branch) ? ` · ${[r.to_outlet_code, r.to_branch, r.to_area].filter(Boolean).join(" / ")}` : ""}
                    </div>
                    <div style={{ fontSize: 11, color: C.lo, marginTop: 3 }}>{fmtDateTime(r.requested_at)}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button className="press" onClick={() => decideTransfer(r, false)} disabled={busy} style={{ flex: 1, height: 42, borderRadius: 11, border: `1px solid ${C.line}`, background: C.card, color: C.mid, fontFamily: FF, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Tolak</button>
                      <button className="press" onClick={() => setApproveReq(r)} disabled={busy} style={{ flex: 1.3, height: 42, borderRadius: 11, border: "none", background: C.brand, color: "#fff", fontFamily: FF, fontSize: 13, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><ArrowLeftRight size={14} /> Pindahkan</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </BottomSheet>
      )}

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
        <div style={{ position: "fixed", left: 16, right: 16, bottom: "calc(env(safe-area-inset-bottom,0px) + 20px)", zIndex: 130, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <div onClick={() => { clearTimeout(toastTimerRef.current); setToast(null); }} style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 18px", borderRadius: 13, background: toast.tone === "err" ? "#FDECEC" : "#E7F7ED", border: `1px solid ${toast.tone === "err" ? "#F5C2C2" : "#B7E4C7"}`, color: toast.tone === "err" ? "#C62828" : "#1A9E5A", fontSize: 13.5, fontWeight: 700, boxShadow: "0 10px 30px rgba(23,24,28,0.12)", maxWidth: 460, pointerEvents: "auto", cursor: "pointer" }}>
            {toast.tone === "err" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}<span>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Panels ─────────────────────────────────────────────────── */
function OutletSelectPanel({ outlets, onPick }) {
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.lo }}>Aktivitas Hari Ini</div>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.035em", color: C.hi, marginTop: 6 }}>Pilih outlet aktif</div>
        <div style={{ fontSize: 13.5, color: C.mid, marginTop: 5, lineHeight: 1.5 }}>Pilih outlet tempat Anda bertugas hari ini sebelum mulai tagging.</div>
      </div>
      <div style={{ background: C.card, borderRadius: 18, padding: 14, boxShadow: C.md }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.lo, margin: "2px 4px 12px" }}>
          <Store size={13} /> Outlet Anda ({outlets.length})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {outlets.map((o) => (
            <button key={o.code} className="press" onClick={() => onPick(o)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", borderRadius: 14, background: C.sub, border: "none", cursor: "pointer", textAlign: "left", fontFamily: FF, width: "100%" }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: "#fff", color: C.brand, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: C.sm }}><Store size={17} /></div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", fontFamily: "monospace", color: C.hi }}>{o.code}</div>
                <div style={{ fontSize: 12, color: C.mid }}>{[o.branch, o.area].filter(Boolean).join(" · ") || "—"}</div>
              </div>
              <ChevronRight size={18} color={C.lo} />
            </button>
          ))}
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

function TagPanel({ outlet, sales, soldCount, busy, onTag, onDelete, onChangeOutlet, multiOutlet }) {
  const OutletHeader = multiOutlet ? "button" : "div";
  return (
    <div style={{ animation: "up .3s ease" }}>
      <div style={{ background: C.card, borderRadius: 18, padding: "18px 18px 16px", marginBottom: 14, boxShadow: C.md }}>
        <OutletHeader
          type={multiOutlet ? "button" : undefined}
          onClick={multiOutlet ? onChangeOutlet : undefined}
          className={multiOutlet ? "press" : undefined}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
            border: "none", background: "transparent", padding: 0, margin: 0, textAlign: "left",
            cursor: multiOutlet ? "pointer" : "default", fontFamily: FF,
          }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: C.lo }}>Outlet Aktif</div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", fontFamily: "monospace", marginTop: 4, color: C.hi }}>{outlet.code}</div>
            <div style={{ fontSize: 12, color: C.mid, marginTop: 2 }}>{[outlet.branch, outlet.area].filter(Boolean).join(" · ") || "—"}</div>
          </div>
          {multiOutlet && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 12, height: 40, padding: "0 13px", borderRadius: 12, background: C.sub, border: `1px solid ${C.line}` }}>
              <RefreshCcw size={15} color={C.brand} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: C.brand }}>Ganti</span>
            </div>
          )}
        </OutletHeader>
        <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
          <LightStat icon={<ShoppingBag size={13} />} label="Terjual hari ini" value={soldCount} accent={C.green} />
        </div>
      </div>

      {/* Tag penjualan */}
      <button onClick={onTag} disabled={busy} className="press"
        style={{ width: "100%", height: 58, borderRadius: 16, border: "none", cursor: "pointer", background: C.brand, color: "#fff", fontFamily: FF, fontSize: 16.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 8px 22px rgba(237,28,36,0.24)", marginBottom: 14 }}>
        <QrCode size={20} /> Claim Penjualan (Scan QR)
      </button>
      <p style={{ fontSize: 11.5, color: C.mid, textAlign: "center", marginTop: -8, marginBottom: 14, lineHeight: 1.5 }}>
        Lokasi Anda dicek otomatis. Di luar radius outlet, Anda akan diminta konfirmasi sebelum tersimpan.
      </p>

      {/* Daftar terjual */}
      {sales.length > 0 && (
        <div style={{ background: C.card, borderRadius: 20, padding: 16, marginBottom: 14, boxShadow: C.md }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.lo, marginBottom: 12 }}>
            <ShoppingBag size={13} /> Kartu terjual hari ini ({sales.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {sales.map((s, i) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 2px", borderTop: i === 0 ? "none" : `1px solid ${C.lineSoft}` }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, background: s.within_radius === false ? "rgba(37,99,235,0.1)" : "rgba(26,158,90,0.1)", color: s.within_radius === false ? C.blue : C.green, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{s.within_radius === false ? <Radar size={14} /> : <Phone size={14} />}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontFamily: "monospace", fontWeight: 700, color: C.hi }}>{s.phone_normalized}</div>
                  {s.imei && <div style={{ fontSize: 10.5, fontFamily: "monospace", color: C.lo }}>IMEI {s.imei}</div>}
                </div>
                <span style={{ fontSize: 12, color: C.mid, fontWeight: 500 }}>{fmtTime(s.tagged_at)}</span>
                <button className="press" onClick={() => onDelete(s)} disabled={busy} aria-label="Hapus"
                  style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: "rgba(220,38,38,0.08)", color: "#DC2626", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
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

const GA_BADGE = {
  TERVALIDASI: { label: "Tervalidasi", fg: "#1A9E5A", bg: "rgba(26,158,90,0.12)" },
  TERVALIDASI_LUAR_AREA: { label: "Tervalidasi · luar area", fg: "#1A9E5A", bg: "rgba(26,158,90,0.12)" },
  TIDAK_SESUAI_OUTLET: { label: "Outlet tidak sesuai", fg: "#B7791F", bg: "rgba(255,176,32,0.14)" },
  TIDAK_DITEMUKAN: { label: "Tdk ditemukan", fg: "#DC2626", bg: "rgba(220,38,38,0.1)" },
};
const gaBadge = (status) => GA_BADGE[status] || { label: "Belum GA", fg: "#B7791F", bg: "rgba(255,176,32,0.14)" };

function HistoryView({ history }) {
  return (
    <div style={{ animation: "up .3s ease" }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 14 }}>Riwayat Claim Saya</h2>
      {history.length === 0 ? (
        <div className="card" style={{ padding: "40px 20px", textAlign: "center", color: C.mid }}>
          <History size={26} style={{ opacity: 0.5, marginBottom: 8 }} /><div style={{ fontSize: 13.5 }}>Belum ada aktivitas tercatat.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {history.map((s) => {
            const badge = gaBadge(s.ga_status);
            return (
              <div key={s.id} style={{ background: C.card, borderRadius: 16, padding: 14, boxShadow: C.md }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: s.within_radius === false ? "rgba(37,99,235,0.1)" : "rgba(26,158,90,0.1)", color: s.within_radius === false ? C.blue : C.green, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{s.within_radius === false ? <Radar size={16} /> : <Phone size={16} />}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 800, fontFamily: "monospace", color: C.hi }}>{s.phone_normalized}</div>
                    {s.imei && <div style={{ fontSize: 10.5, fontFamily: "monospace", color: C.lo }}>IMEI {s.imei}</div>}
                    <div style={{ fontSize: 11.5, color: C.lo, fontWeight: 500 }}>{fmtDateTime(s.tagged_at)}{s.within_radius === false ? " · di luar area" : ""}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.03em", padding: "4px 9px", borderRadius: 99, background: badge.bg, color: badge.fg, whiteSpace: "nowrap" }}>{badge.label}</span>
                </div>
                {s.ga_note && (
                  <div style={{ marginTop: 9, padding: "8px 10px", borderRadius: 10, background: "rgba(255,176,32,0.1)", fontSize: 11.5, color: C.amber, lineHeight: 1.5 }}>{s.ga_note}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
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
function OutletPicker({ outlets, onPick, onClose }) {
  return (
    <BottomSheet onClose={onClose}>
      <div style={{ padding: "2px 18px calc(env(safe-area-inset-bottom,0px) + 20px)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.hi, letterSpacing: "-0.02em" }}>Pilih Outlet</div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: C.sub, color: C.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={18} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {outlets.map((o) => (
            <button className="press" key={o.code} onClick={() => onPick(o)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 14, background: C.sub, border: "none", cursor: "pointer", textAlign: "left", fontFamily: FF }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: "#fff", color: C.brand, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: C.sm }}><Store size={17} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.hi, fontFamily: "monospace" }}>{o.code}</div>
                <div style={{ fontSize: 12, color: C.mid }}>{[o.branch, o.area].filter(Boolean).join(" · ") || "—"}</div>
              </div>
              <ChevronRight size={18} color={C.lo} />
            </button>
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}
