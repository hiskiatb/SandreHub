"use client";
/**
 * /promotor — App Promotor (mobile web)
 * Alur: Login(SSO) → cek assignment (pending?) → izin lokasi → Aktivitas Hari Ini
 *       → Check-In (selfie+geo) → Tag QR → Check-Out → Riwayat.
 * Sumber data: tabel pts_* (TraceHub). Online-only.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin, LogOut, RefreshCw, Clock, Store, QrCode, LogIn, CheckCircle2,
  ShoppingBag, ChevronRight, History, Navigation, AlertTriangle, Loader2,
  Camera, X, Hourglass, ChevronLeft, Phone, CalendarDays, Trash2,
  Power, ArrowLeftRight, Check, Inbox, ShieldQuestion,
} from "lucide-react";
import supabase from "../../lib/supabase";
import { HubLogoLoader } from "../../components/HubLogoLoader";
import { CameraSheet, QRScannerSheet, AccessHelp } from "./components";
import {
  ymNow, ymLabel, fmtTime, fmtDateFull, fmtDateTime, durationOf,
  normalizePhone, getPosition, checkGeoPermission, uploadSelfie, signedPhoto,
} from "./ptsClient";

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

export default function PromotorApp() {
  const router = useRouter();
  const [phase, setPhase] = useState("loading");   // loading | pending | app
  const [email, setEmail] = useState("");
  const [uid, setUid] = useState("");
  const [name, setName] = useState("");
  const [promotorId, setPromotorId] = useState(null);
  const [outlets, setOutlets] = useState([]);      // {code,id,branch,area,region,name}
  const [session, setSession] = useState(null);    // sesi aktif
  const [sales, setSales] = useState([]);
  const [view, setView] = useState("home");        // home | history
  const [history, setHistory] = useState([]);

  const [geo, setGeo] = useState(null);
  const [geoErr, setGeoErr] = useState("");
  const [toast, setToast] = useState(null);

  const period = ymNow();
  const flash = (msg, tone = "ok") => { setToast({ msg, tone }); setTimeout(() => setToast(null), 2600); };

  const loadSales = useCallback(async (sid) => {
    const { data } = await supabase.from("pts_sale").select("*").eq("session_id", sid).order("tagged_at", { ascending: false });
    setSales(data || []);
  }, []);

  /* ── Bootstrap: auth + assignment + sesi aktif ─────────────── */
  const bootstrap = useCallback(async () => {
    setPhase("loading");
    const { data: ures } = await supabase.auth.getUser();
    const user = ures?.user;
    if (!user) { router.replace("/promotor/login"); return; }
    const em = (user.email || "").toLowerCase();
    setEmail(em); setUid(user.id);

    // assignment bulan berjalan
    const { data: asg } = await supabase.from("pts_assignment")
      .select("*").ilike("email", em).eq("period", period).eq("status", "active");
    const rows = asg || [];
    const nm = rows[0]?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || em.split("@")[0];
    setName(nm);

    // upsert profil promotor
    const active = rows.length > 0;
    const { data: prof } = await supabase.from("pts_promotor")
      .upsert({ email: em, auth_user_id: user.id, full_name: nm, region: rows[0]?.region || null, status: active ? "active" : "pending", updated_at: new Date().toISOString() }, { onConflict: "email" })
      .select().single();
    setPromotorId(prof?.id || null);

    if (!active) { setPhase("pending"); return; }

    // daftar outlet unik
    const byCode = new Map();
    rows.forEach((r) => { if (!byCode.has(r.outlet_code)) byCode.set(r.outlet_code, { code: r.outlet_code, id: r.outlet_id, branch: r.branch, area: r.area, region: r.region, name: r.outlet_code }); });
    setOutlets([...byCode.values()]);

    // sesi aktif (belum check-out)
    const { data: openSes } = await supabase.from("pts_session")
      .select("*").ilike("email", em).is("check_out_at", null).order("check_in_at", { ascending: false }).limit(1);
    if (openSes && openSes[0]) { setSession(openSes[0]); await loadSales(openSes[0].id); }
    else { setSession(null); setSales([]); }

    setPhase("app");
  }, [router, period, loadSales]);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  // izin lokasi di awal
  useEffect(() => {
    if (phase !== "app") return;
    let alive = true;
    (async () => {
      const st = await checkGeoPermission();
      if (st === "denied") { setGeoErr("Izin lokasi ditolak. Aktifkan lokasi untuk Check-In."); return; }
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
    const { data: ses } = await supabase.from("pts_session").select("*").ilike("email", email).order("check_in_at", { ascending: false }).limit(60);
    const list = ses || [];
    if (list.length) {
      const ids = list.map((s) => s.id);
      const { data: sl } = await supabase.from("pts_sale").select("session_id").in("session_id", ids);
      const cnt = new Map(); (sl || []).forEach((r) => cnt.set(r.session_id, (cnt.get(r.session_id) || 0) + 1));
      const withUrls = await Promise.all(list.map(async (s) => ({
        ...s, salesCount: cnt.get(s.id) || 0,
        inUrl: await signedPhoto(supabase, s.check_in_photo_url),
        outUrl: await signedPhoto(supabase, s.check_out_photo_url),
      })));
      setHistory(withUrls);
    } else setHistory([]);
  }, [email]);

  const signOut = async () => { await supabase.auth.signOut(); router.replace("/promotor/login"); };

  /* ── Render ────────────────────────────────────────────────── */
  if (phase === "loading") return <Splash />;
  if (phase === "pending") return <Pending email={email} onReload={bootstrap} onSignOut={signOut} />;

  return (
    <AppShell
      name={name} email={email} uid={uid} promotorId={promotorId}
      period={period} outlets={outlets}
      session={session} setSession={setSession}
      sales={sales} loadSales={loadSales}
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
    <div style={{ minHeight: "100svh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FF }}>
      <HubLogoLoader variant="sandra" logoSize={76} />
    </div>
  );
}

/* ══════════════════ Pending ══════════════════ */
function Pending({ email, onReload, onSignOut }) {
  const [busy, setBusy] = useState(false);
  const reload = async () => { setBusy(true); await onReload(); setBusy(false); };
  return (
    <div style={{ minHeight: "100svh", background: C.bg, color: C.hi, fontFamily: FF, display: "flex", flexDirection: "column", padding: "0 26px", textAlign: "center" }}>
      <style>{`@keyframes pspin{to{transform:rotate(360deg)}}@keyframes fl{0%,100%{opacity:.55}50%{opacity:1}}`}</style>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <div style={{ width: 76, height: 76, borderRadius: 22, background: "rgba(255,176,32,0.12)", border: "1px solid rgba(255,176,32,0.3)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 22, animation: "fl 2s ease infinite" }}>
          <Hourglass size={34} color={C.amber} />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em" }}>Menunggu Aktivasi</h1>
        <p style={{ fontSize: 14, color: C.mid, lineHeight: 1.6, maxWidth: 320, marginTop: 10 }}>
          Email <b style={{ color: C.hi }}>{email}</b> berhasil masuk, tetapi belum dipetakan ke outlet.
          Hubungi <b style={{ color: C.hi }}>PIC Region</b> Anda untuk didaftarkan, lalu tekan Muat Ulang.
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: "calc(env(safe-area-inset-bottom,0px) + 26px)" }}>
        <button onClick={reload} disabled={busy} style={{ height: 54, borderRadius: 15, border: "none", background: C.brand, color: "#fff", fontFamily: FF, fontSize: 15.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, cursor: "pointer", opacity: busy ? 0.7 : 1 }}>
          {busy ? <Loader2 size={19} style={{ animation: "pspin 1s linear infinite" }} /> : <RefreshCw size={18} />} Muat Ulang Status
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
  const { name, email, uid, promotorId, period, outlets, session, setSession, sales, loadSales, geo, geoErr, refreshGeo, view, setView, history, loadHistory, onSignOut, flash, toast } = p;
  const [sheet, setSheet] = useState(null);        // 'checkin-cam' | 'checkout-cam' | 'qr'
  const [pickOutlet, setPickOutlet] = useState(false);
  const [chosenOutlet, setChosenOutlet] = useState(null);
  const [busy, setBusy] = useState(false);
  const [geoHelp, setGeoHelp] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [delSale, setDelSale] = useState(null);
  const [success, setSuccess] = useState(null);     // msisdn berhasil → animasi
  const [taken, setTaken] = useState(null);          // { phone, owner }
  const [incoming, setIncoming] = useState([]);      // permintaan transfer masuk
  const [approveReq, setApproveReq] = useState(null);

  const loadIncoming = useCallback(async () => {
    const { data } = await supabase.from("pts_transfer_request")
      .select("*").ilike("from_email", email).eq("status", "pending").order("requested_at", { ascending: false });
    setIncoming(data || []);
  }, [email]);
  useEffect(() => { loadIncoming(); }, [loadIncoming]);

  const decideTransfer = async (req, approve) => {
    setApproveReq(null); setBusy(true);
    try {
      const { data, error } = await supabase.rpc(approve ? "pts_approve_transfer" : "pts_reject_transfer", { p_id: req.id });
      if (error) throw error;
      if (data?.status === "approved") { flash("Nomor dipindahkan."); if (session) await loadSales(session.id); }
      else if (data?.status === "rejected") flash("Pengajuan ditolak.");
      else flash("Tidak dapat memproses.", "err");
      await loadIncoming();
    } catch (e) { flash("Gagal: " + (e?.message || e), "err"); }
    finally { setBusy(false); }
  };
  const [nowTs, setNowTs] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNowTs(Date.now()), 30000); return () => clearInterval(id); }, []);
  useEffect(() => { if (success) { const id = setTimeout(() => setSuccess(null), 1900); return () => clearTimeout(id); } }, [success]);

  const fixGeo = async () => { const g = await refreshGeo(); if (!g) setGeoHelp(true); else setGeoHelp(false); };
  const initial = (name || "P").trim().charAt(0).toUpperCase();

  useEffect(() => { if (view === "history") loadHistory(); }, [view, loadHistory]);

  const soldCount = sales.length;

  const stampLines = (outletLabel) => (dt) => {
    const g = geo;
    return [
      fmtDateTime(dt.toISOString()) + " WIB",
      g ? `${g.lat}, ${g.lng}${g.accuracy ? ` · ±${g.accuracy}m` : ""}` : "Lokasi tidak tersedia",
      outletLabel || "",
      name,
    ].filter(Boolean);
  };

  /* Check-In */
  const startCheckIn = () => {
    if (outlets.length === 1) { setChosenOutlet(outlets[0]); setSheet("checkin-cam"); }
    else setPickOutlet(true);
  };
  const onCheckInPhoto = async (shot) => {
    setSheet(null); setBusy(true);
    try {
      let g = geo || await refreshGeo();
      const url = await uploadSelfie(supabase, shot.blob, { uid, kind: "checkin" });
      const payload = {
        promotor_id: promotorId, email, outlet_id: chosenOutlet?.id || null, outlet_code: chosenOutlet?.code || null,
        period, check_in_at: new Date().toISOString(),
        check_in_lat: g?.lat ?? null, check_in_lng: g?.lng ?? null, check_in_accuracy: g?.accuracy ?? null,
        check_in_photo_url: url, geo_flag: g ? (g.accuracy && g.accuracy > 100 ? "low_accuracy" : "ok") : "no_location",
      };
      const { data, error } = await supabase.from("pts_session").insert(payload).select().single();
      if (error) throw error;
      setSession(data); await loadSales(data.id);
      flash("Check-In berhasil");
    } catch (e) { flash("Gagal Check-In: " + (e?.message || e), "err"); }
    finally { setBusy(false); setChosenOutlet(null); }
  };

  /* Tag penjualan (QR) — via RPC pts_tag_sale (cek kepemilikan) */
  const onQR = async (raw) => {
    setSheet(null);
    const { normalized, valid } = normalizePhone(raw);
    if (!valid) { flash(`Nomor tidak valid: ${normalized || raw}`, "err"); return; }
    if (!session) { flash("Belum ada sesi aktif.", "err"); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("pts_tag_sale", {
        p_phone: normalized, p_session: session.id, p_outlet: session.outlet_id,
        p_lat: geo?.lat ?? null, p_lng: geo?.lng ?? null, p_raw: String(raw),
      });
      if (error) throw error;
      const st = data?.status;
      if (st === "ok") { await loadSales(session.id); setBusy(false); playSuccessTone(); setSuccess(normalized); return; }
      if (st === "self") { flash("Nomor ini sudah Anda tag.", "err"); }
      else if (st === "taken" || st === "taken_race") {
        setBusy(false);
        setTaken({ phone: normalized, owner: data?.owner || null });
        return;
      } else { flash("Gagal menyimpan.", "err"); }
    } catch (e) { flash("Gagal menyimpan: " + (e?.message || e), "err"); }
    finally { setBusy(false); }
  };

  /* Ajukan pemindahan nomor yang sudah ditag orang lain */
  const requestTransfer = async () => {
    const phone = taken?.phone; if (!phone) return;
    setTaken(null); setBusy(true);
    try {
      const { data, error } = await supabase.rpc("pts_request_transfer", { p_phone: phone });
      if (error) throw error;
      if (data?.status === "requested") flash("Pengajuan pemindahan terkirim.");
      else if (data?.status === "self") flash("Nomor ini sudah milik Anda.");
      else flash("Nomor tidak ditemukan.", "err");
    } catch (e) { flash("Gagal mengajukan: " + (e?.message || e), "err"); }
    finally { setBusy(false); }
  };

  /* Check-Out */
  const onCheckOutPhoto = async (shot) => {
    setSheet(null); setBusy(true);
    try {
      let g = geo || await refreshGeo();
      const url = await uploadSelfie(supabase, shot.blob, { uid, kind: "checkout" });
      const { data, error } = await supabase.from("pts_session").update({
        check_out_at: new Date().toISOString(), check_out_lat: g?.lat ?? null, check_out_lng: g?.lng ?? null, check_out_photo_url: url,
      }).eq("id", session.id).select().single();
      if (error) throw error;
      setSession(null); setSales([]);
      flash("Check-Out berhasil");
    } catch (e) { flash("Gagal Check-Out: " + (e?.message || e), "err"); }
    finally { setBusy(false); }
  };

  const doDeleteSale = async () => {
    const s = delSale; if (!s) return;
    setDelSale(null); setBusy(true);
    try {
      const { error } = await supabase.from("pts_sale").delete().eq("id", s.id);
      if (error) throw error;
      if (session) await loadSales(session.id);
      flash("Nomor dihapus");
    } catch (e) { flash("Gagal menghapus: " + (e?.message || e), "err"); }
    finally { setBusy(false); }
  };

  const outletLabel = session ? (session.outlet_code || "Outlet") : (chosenOutlet?.code || "");

  return (
    <div style={{ minHeight: "100svh", background: C.bg, color: C.hi, fontFamily: FF, paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 24px)" }}>
      <style>{`@keyframes pspin{to{transform:rotate(360deg)}}@keyframes up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
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
          <IconBtn onClick={() => setView(view === "home" ? "history" : "home")} active={view === "history"}>{view === "history" ? <ChevronLeft size={18} /> : <History size={17} />}</IconBtn>
          <IconBtn onClick={() => setConfirmLogout(true)} danger><Power size={16} /></IconBtn>
        </div>
      </div>

      <div style={{ padding: "8px 18px 0", maxWidth: 560, margin: "0 auto" }}>
        {view === "history"
          ? <HistoryView history={history} />
          : (
            <div style={{ animation: "up .32s cubic-bezier(.22,1,.36,1)" }}>
              {/* Permintaan pemindahan masuk */}
              {incoming.length > 0 && (
                <div style={{ background: C.card, borderRadius: 18, padding: 14, marginBottom: 16, boxShadow: C.md, border: `1px solid ${C.amber}33` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, color: C.amber, marginBottom: 10 }}>
                    <Inbox size={15} /> Permintaan Pemindahan ({incoming.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    {incoming.map((r) => (
                      <div key={r.id} style={{ padding: "11px 12px", borderRadius: 13, background: C.sub }}>
                        <div style={{ fontSize: 15, fontFamily: "monospace", fontWeight: 800, color: C.hi }}>{r.phone_normalized}</div>
                        <div style={{ fontSize: 12, color: C.mid, marginTop: 3, lineHeight: 1.5 }}>
                          Diminta oleh <b style={{ color: C.hi }}>{r.to_full_name || r.to_email}</b>
                          {(r.to_outlet_code || r.to_branch) ? ` · ${[r.to_outlet_code, r.to_branch, r.to_area].filter(Boolean).join(" / ")}` : ""}
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                          <button className="press" onClick={() => decideTransfer(r, false)} disabled={busy} style={{ flex: 1, height: 42, borderRadius: 11, border: `1px solid ${C.line}`, background: C.card, color: C.mid, fontFamily: FF, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Tolak</button>
                          <button className="press" onClick={() => setApproveReq(r)} disabled={busy} style={{ flex: 1.3, height: 42, borderRadius: 11, border: "none", background: C.brand, color: "#fff", fontFamily: FF, fontSize: 13, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><ArrowLeftRight size={14} /> Pindahkan</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tanggal + lokasi */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 10 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.mid, fontWeight: 600 }}>
                  <CalendarDays size={13} /> {fmtDateFull(new Date().toISOString())}
                </div>
                <GeoChip geo={geo} err={geoErr} onFix={fixGeo} />
              </div>

              {!session ? (
                <CheckInPanel outlets={outlets} onStart={startCheckIn} busy={busy} />
              ) : (
                <ActivePanel session={session} sales={sales} soldCount={soldCount} busy={busy} nowTs={nowTs}
                  onTag={() => setSheet("qr")} onCheckout={() => setSheet("checkout-cam")} onDelete={(s) => setDelSale(s)} />
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
        <OutletPicker outlets={outlets} onPick={(o) => { setChosenOutlet(o); setPickOutlet(false); setSheet("checkin-cam"); }} onClose={() => setPickOutlet(false)} />
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
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(17,18,22,0.4)", backdropFilter: "blur(6px)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={() => setGeoHelp(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: "26px 26px 0 0", padding: "10px 18px calc(env(safe-area-inset-bottom,0px) + 20px)", boxShadow: "0 -18px 50px rgba(23,24,28,0.18)", animation: "sheetup .28s cubic-bezier(.22,1,.36,1)", maxWidth: 560, margin: "0 auto", width: "100%" }}>
            <div style={{ width: 38, height: 4, borderRadius: 99, background: C.line, margin: "0 auto 14px" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: C.hi, letterSpacing: "-0.02em" }}>Izin Lokasi</div>
              <button onClick={() => setGeoHelp(false)} style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: C.sub, color: C.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={18} /></button>
            </div>
            <AccessHelp kind="lokasi" onRetry={fixGeo} />
          </div>
        </div>
      )}

      {/* Animasi sukses tag (ala FaceID) */}
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
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", color: C.hi }}>Berhasil di-tag</div>
            <div style={{ fontSize: 16, fontFamily: "monospace", fontWeight: 700, color: C.green, marginTop: 6 }}>{success}</div>
          </div>
          <style>{`@keyframes ring{to{stroke-dashoffset:0}}@keyframes check{to{stroke-dashoffset:0}}`}</style>
        </div>
      )}

      {/* Sudah ditagging oleh ID lain */}
      {taken && (
        <div style={{ position: "fixed", inset: 0, zIndex: 140, background: "rgba(17,18,22,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 26 }} onClick={() => setTaken(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 380, background: C.card, borderRadius: 24, padding: "24px 22px 20px", boxShadow: C.lg, animation: "pop .22s cubic-bezier(.22,1,.36,1)" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
              <div style={{ width: 58, height: 58, borderRadius: 17, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(183,121,31,0.1)", color: C.amber, marginBottom: 14 }}><ShieldQuestion size={26} /></div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: C.hi }}>Nomor sudah di-tag</div>
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
      {sheet === "checkin-cam" && <CameraSheet title="Selfie Check-In" stampLines={stampLines(outletLabel)} onCapture={onCheckInPhoto} onClose={() => setSheet(null)} />}
      {sheet === "checkout-cam" && <CameraSheet title="Selfie Check-Out" stampLines={stampLines(outletLabel)} onCapture={onCheckOutPhoto} onClose={() => setSheet(null)} />}
      {sheet === "qr" && <QRScannerSheet onDetect={onQR} onClose={() => setSheet(null)} />}

      {/* Busy overlay */}
      {busy && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }}>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: "20px 26px", display: "flex", alignItems: "center", gap: 12, color: C.hi, fontSize: 14, fontWeight: 600 }}>
            <Loader2 size={20} style={{ animation: "pspin 1s linear infinite", color: C.brand }} /> Memproses…
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", left: 16, right: 16, bottom: "calc(env(safe-area-inset-bottom,0px) + 20px)", zIndex: 130, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 18px", borderRadius: 13, background: toast.tone === "err" ? "#FDECEC" : "#E7F7ED", border: `1px solid ${toast.tone === "err" ? "#F5C2C2" : "#B7E4C7"}`, color: toast.tone === "err" ? "#C62828" : "#1A9E5A", fontSize: 13.5, fontWeight: 700, boxShadow: "0 10px 30px rgba(23,24,28,0.12)", maxWidth: 460 }}>
            {toast.tone === "err" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}{toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Panels ─────────────────────────────────────────────────── */
function CheckInPanel({ outlets, onStart, busy }) {
  return (
    <div>
      {/* Judul sederhana */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.lo }}>Aktivitas Hari Ini</div>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.035em", color: C.hi, marginTop: 6 }}>Siap mulai bekerja?</div>
        <div style={{ fontSize: 13.5, color: C.mid, marginTop: 5, lineHeight: 1.5 }}>Check-In dulu untuk membuka penjualan &amp; pencatatan.</div>
      </div>

      {/* Outlet list */}
      <div style={{ background: C.card, borderRadius: 18, padding: 14, marginBottom: 16, boxShadow: C.md }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.lo, margin: "2px 4px 12px" }}>
          <Store size={13} /> Outlet Anda ({outlets.length})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {outlets.map((o) => (
            <div key={o.code} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", borderRadius: 14, background: C.sub }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: "#fff", color: C.brand, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: C.sm }}><Store size={17} /></div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", fontFamily: "monospace", color: C.hi }}>{o.code}</div>
                <div style={{ fontSize: 12, color: C.mid }}>{[o.branch, o.area].filter(Boolean).join(" · ") || "—"}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button onClick={onStart} disabled={busy} className="press"
        style={{ width: "100%", height: 58, borderRadius: 16, border: "none", cursor: "pointer", background: C.brand, color: "#fff", fontFamily: FF, fontSize: 16.5, fontWeight: 700, letterSpacing: "-0.01em", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 8px 22px rgba(237,28,36,0.24)" }}>
        <LogIn size={20} /> Check-In Sekarang
      </button>
      <p style={{ fontSize: 12, color: C.mid, textAlign: "center", marginTop: 13, lineHeight: 1.5 }}>
        Anda akan mengambil <b style={{ color: C.hi }}>selfie di outlet</b>. Lokasi &amp; waktu terekam otomatis.
      </p>
    </div>
  );
}

function ActivePanel({ session, sales, soldCount, busy, nowTs, onTag, onCheckout, onDelete }) {
  const dur = (() => {
    const ms = (nowTs || Date.now()) - new Date(session.check_in_at).getTime();
    if (ms < 0) return "0j 00m";
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return `${h}j ${String(m).padStart(2, "0")}m`;
  })();
  return (
    <div style={{ animation: "up .3s ease" }}>
      {/* Sesi aktif — kartu putih bersih */}
      <div style={{ background: C.card, borderRadius: 18, padding: "18px 18px 16px", marginBottom: 14, boxShadow: C.md }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: C.lo }}>Outlet ID</div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", fontFamily: "monospace", marginTop: 4, color: C.hi }}>{session.outlet_code || "Outlet"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: "0.03em", color: C.green, padding: "5px 10px", borderRadius: 99, background: "rgba(26,158,90,0.1)" }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: C.green }} /> AKTIF
          </div>
        </div>
        <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
          <LightStat icon={<LogIn size={13} />} label="Check-In" value={fmtTime(session.check_in_at)} />
          <LightStat icon={<Clock size={13} />} label="Durasi" value={dur} />
          <LightStat icon={<ShoppingBag size={13} />} label="Terjual" value={soldCount} accent={C.green} />
        </div>
      </div>

      {/* Tag penjualan */}
      <button onClick={onTag} disabled={busy} className="press"
        style={{ width: "100%", height: 58, borderRadius: 16, border: "none", cursor: "pointer", background: C.brand, color: "#fff", fontFamily: FF, fontSize: 16.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 8px 22px rgba(237,28,36,0.24)", marginBottom: 14 }}>
        <QrCode size={20} /> Tag Penjualan (Scan QR)
      </button>

      {/* Daftar terjual */}
      {sales.length > 0 && (
        <div style={{ background: C.card, borderRadius: 20, padding: 16, marginBottom: 14, boxShadow: C.md }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.lo, marginBottom: 12 }}>
            <ShoppingBag size={13} /> Kartu terjual hari ini ({sales.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {sales.map((s, i) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 2px", borderTop: i === 0 ? "none" : `1px solid ${C.lineSoft}` }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(26,158,90,0.1)", color: C.green, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Phone size={14} /></span>
                <span style={{ fontSize: 15, fontFamily: "monospace", fontWeight: 700, flex: 1, color: C.hi }}>{s.phone_normalized}</span>
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

      <button onClick={onCheckout} disabled={busy} className="press"
        style={{ width: "100%", height: 56, borderRadius: 18, border: `1.5px solid ${C.line}`, cursor: "pointer", background: C.card, color: C.hi, fontFamily: FF, fontSize: 15.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: C.sm }}>
        <LogOut size={18} /> Check-Out &amp; Akhiri Sesi
      </button>
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

function HistoryView({ history }) {
  return (
    <div style={{ animation: "up .3s ease" }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 14 }}>Riwayat Saya</h2>
      {history.length === 0 ? (
        <div className="card" style={{ padding: "40px 20px", textAlign: "center", color: C.mid }}>
          <History size={26} style={{ opacity: 0.5, marginBottom: 8 }} /><div style={{ fontSize: 13.5 }}>Belum ada aktivitas tercatat.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {history.map((s) => (
            <div key={s.id} style={{ background: C.card, borderRadius: 20, padding: 16, boxShadow: C.md }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(237,28,36,0.09)", color: C.brand, display: "flex", alignItems: "center", justifyContent: "center" }}><Store size={16} /></span>
                  <div>
                    <div style={{ fontSize: 14.5, fontWeight: 800, fontFamily: "monospace", color: C.hi }}>{s.outlet_code || "Outlet"}</div>
                    <div style={{ fontSize: 11.5, color: C.lo, fontWeight: 500 }}>{fmtDateTime(s.check_in_at)}</div>
                  </div>
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.03em", padding: "4px 10px", borderRadius: 99, background: s.check_out_at ? "rgba(26,158,90,0.12)" : "rgba(37,99,235,0.12)", color: s.check_out_at ? C.green : C.blue }}>
                  {s.check_out_at ? "SELESAI" : "AKTIF"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <MiniStat label="Durasi" value={s.check_out_at ? durationOf(s.check_in_at, s.check_out_at) : "berjalan"} />
                <MiniStat label="Terjual" value={`${s.salesCount} kartu`} accent={C.green} />
                <MiniStat label="Selesai" value={s.check_out_at ? fmtTime(s.check_out_at) : "—"} />
              </div>
              {(s.inUrl || s.outUrl) && (
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  {s.inUrl && <a href={s.inUrl} target="_blank" rel="noreferrer" style={{ flex: 1 }}><img src={s.inUrl} alt="in" style={{ width: "100%", height: 78, objectFit: "cover", borderRadius: 12 }} /></a>}
                  {s.outUrl && <a href={s.outUrl} target="_blank" rel="noreferrer" style={{ flex: 1 }}><img src={s.outUrl} alt="out" style={{ width: "100%", height: 78, objectFit: "cover", borderRadius: 12 }} /></a>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Small parts ─────────────────────────────────────────────── */
function IconBtn({ children, onClick, active, danger }) {
  const col = danger ? "#DC2626" : active ? C.brand : C.mid;
  const bd = danger ? "rgba(220,38,38,0.28)" : active ? C.brand : C.line;
  const bg = danger ? "rgba(220,38,38,0.06)" : active ? "rgba(237,28,36,0.08)" : C.card;
  return <button className="press" onClick={onClick} style={{ width: 42, height: 42, borderRadius: 13, border: `1px solid ${bd}`, background: bg, color: col, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: C.sm }}>{children}</button>;
}
function TakenRow({ label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
      <span style={{ color: C.mid, fontWeight: 500 }}>{label}</span>
      <span style={{ color: C.hi, fontWeight: 700, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{value}</span>
    </div>
  );
}
function MiniStat({ label, value, accent }) {
  return (
    <div style={{ flex: 1, background: C.sub, borderRadius: 12, padding: "9px 11px" }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: C.lo }}>{label}</div>
      <div style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: "-0.01em", marginTop: 3, color: accent || C.hi }}>{value}</div>
    </div>
  );
}
function GeoChip({ geo, err, onFix }) {
  if (geo && !err) return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 99, background: "rgba(48,209,88,0.12)", color: C.green, border: "1px solid rgba(48,209,88,0.25)" }}><Navigation size={12} /> Lokasi aktif{geo.accuracy ? ` · ±${geo.accuracy}m` : ""}</span>;
  return <button onClick={onFix} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 99, background: "rgba(255,176,32,0.12)", color: C.amber, border: "1px solid rgba(255,176,32,0.28)", cursor: "pointer", fontFamily: FF }}><AlertTriangle size={12} /> Aktifkan lokasi</button>;
}
function OutletPicker({ outlets, onPick, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(17,18,22,0.4)", backdropFilter: "blur(6px)", display: "flex", flexDirection: "column", justifyContent: "flex-end", fontFamily: FF }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: "26px 26px 0 0", padding: "10px 18px calc(env(safe-area-inset-bottom,0px) + 20px)", boxShadow: "0 -18px 50px rgba(23,24,28,0.18)", animation: "sheetup .28s cubic-bezier(.22,1,.36,1)", maxWidth: 560, margin: "0 auto", width: "100%" }}>
        <div style={{ width: 38, height: 4, borderRadius: 99, background: C.line, margin: "0 auto 14px" }} />
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
      <style>{`@keyframes sheetup{from{transform:translateY(100%)}to{transform:none}}`}</style>
    </div>
  );
}
