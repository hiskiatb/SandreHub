"use client";
/**
 * /martahub/m/activities - Daftar aktivitas BME/RGE dengan tab filter status,
 * data dari `mh_activities_for_me()` (RPC scoping sama dgn app Flutter).
 */
import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, Plus, Trash2, CheckCircle2, AlertCircle, ChevronRight, ChevronDown, CardSim, Router, Receipt, MapPin, Pencil, FolderClock, Clock, SlidersHorizontal, Check } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND, NAV_HEIGHT } from "../_shared/MobileShell";
import { fmtDate, fmtTimeLabel, fmtInt, fmtRp, isDraftIncomplete, activityStage, READY_STATUSES, earliestPlanDate } from "../_shared/activityUi";
import { MetricTile, RebuyTile, RevenueCostBanner } from "../_shared/MetricTiles";
import DeleteActivitySheet from "../_shared/DeleteActivitySheet";
import BottomSheet from "../_shared/BottomSheet";

// created_by + field2 wizard (poi_type, event_categories, plan_date_start,
// plan_dates_multi) ditambahkan supaya kartu daftar bisa (a) gerbang opsi
// hapus hanya utk pemilik plan, DAN (b) pakai definisi "draft belum lengkap"
// yg SAMA PERSIS dgn halaman detail (lihat isDraftIncomplete di activityUi.js).
const ACTIVITY_COLS = "id,event_name,brand,mc,site_id,event_category,event_categories,plan_date,plan_date_start,plan_date_end,plan_dates_multi,plan_date_times,is_all_day,start_time,end_time,poi_type,status,target_sp,target_fwa,actual_sp,actual_fwa,target_rebuy_pulsa,target_rebuy_data,actual_rebuy_pulsa,actual_rebuy_data,target_rev_3m,actual_rev_3m,cost_estimate,cost_actual,checkin_valid,validation_note,created_at,created_by,actual_draft_saved_at";

// Warna brand - SAMA PERSIS dgn skema di wizard Buat Plan (ACT_BRAND_COLOR
// di activities/new/page.jsx): IM3 kuning, 3ID (tri) magenta.
const BRAND_COLOR = { im3: "#F5CD46", tri: "#E23B86" };

// Margin kanan & bawah FAB "Buat Plan" - SATU angka dipakai utk keduanya
// (bukan dua nilai beda) spy jaraknya ke tepi kolom & ke navbar keliatan
// simetris/rapi.
const FAB_MARGIN = 20;

const TABS = [
  { key: "all", label: "Semua" },
  { key: "draft", label: "Draft" },
  { key: "plan_submitted", label: "Plan Diajukan" },
  { key: "revision_needed", label: "Revisi" },
  { key: "approved", label: "Selesai" },
  { key: "revision_actual", label: "Revisi Report" },
];

// Kategori event - SAMA PERSIS dgn key yg dipakai wizard Buat Plan
// (event_categories), dipakai jadi salah satu opsi filter.
const CAT_LABEL = { directSelling: "Direct Selling", jointEvent: "Joint Event", openBooth: "Open Booth", project: "Project", sponsorship: "Sponsorship", thematic: "Thematic" };

// "Perlu Tindakan" - filter gabungan yg SENGAJA tidak mengikuti satu status
// mentah manapun, krn maksudnya murni "mana yg harus saya beresin sekarang":
// draft plan yg belum lengkap, plan/report yg diminta revisi, ATAU plan yg
// event-nya sudah tiba/lewat tapi actual belum diisi. Ini yg paling
// membantu semua level (BME/RGE - tahu apa yg harus dikerjakan; TMV/Head -
// tahu siapa yg butuh ditindaklanjuti).
function needsAction(r, userId) {
  if (r.status === "revision_needed" || r.status === "revision_actual") return true;
  if (r.status === "draft") return !!userId && r.created_by === userId && isDraftIncomplete(r);
  if (READY_STATUSES.has(r.status) && r.actual_sp == null) {
    const eventDateStr = earliestPlanDate(r);
    const todayStr = new Date().toISOString().slice(0, 10);
    return !!eventDateStr && eventDateStr <= todayStr;
  }
  return false;
}

function inDateRange(r, range) {
  if (range === "all") return true;
  const eventDateStr = earliestPlanDate(r);
  if (!eventDateStr) return false;
  const eventDate = new Date(eventDateStr + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (range === "week") {
    const day = today.getDay(); // 0=Minggu
    const monday = new Date(today); monday.setDate(today.getDate() - ((day + 6) % 7));
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    return eventDate >= monday && eventDate <= sunday;
  }
  if (range === "month") {
    return eventDate.getFullYear() === today.getFullYear() && eventDate.getMonth() === today.getMonth();
  }
  return true;
}

function ActivitiesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openId = searchParams.get("open");
  const initialTab = searchParams.get("tab");
  const { loading, userId, scope } = useMartaSession();
  const [rows, setRows] = useState(null);
  const [branchBySite, setBranchBySite] = useState({}); // site_id -> branch (mh_sites), utk subtitle "MC · Branch · Brand"
  const [err, setErr] = useState("");
  const [tab, setTab] = useState(initialTab && TABS.some((t) => t.key === initialTab) ? initialTab : "all");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState(null);
  // Filter tambahan (di luar tab status) - dibuka lewat tombol filter di
  // sebelah judul, disimpan terpisah dari `tab` krn ini "AND" dgn tab, bukan
  // pengganti tab.
  const [filterOpen, setFilterOpen] = useState(false);
  const [needsActionOnly, setNeedsActionOnly] = useState(false);
  const [dateRange, setDateRange] = useState("all"); // all | week | month
  const [categories, setCategories] = useState(() => new Set());
  // SATU state hapus dipakai baik dari kebab-menu kartu daftar maupun dari
  // tombol "Hapus Plan" di DetailSheet quick-view - keduanya cuma memicu
  // sheet konfirmasi yg sama (DeleteActivitySheet), bukan alur terpisah.
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name } | null

  useEffect(() => {
    if (loading) return;
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabaseMarta
          .rpc("mh_activities_for_me")
          .select(ACTIVITY_COLS)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;

        // Nama branch per site - dibatch SEKALI utk semua site_id yg muncul
        // di daftar (bukan satu query per kartu), dipakai di subtitle kartu
        // "MC · Branch · Brand" (gantiin badge brand terpisah di sisi kiri
        // judul, lihat ActivityCard).
        //
        // SENGAJA DITUNGGU dulu sebelum setRows/setBranchBySite (bukan
        // setRows duluan lalu branch nyusul belakangan) - dua query ini
        // resolve terpisah, kalau rows di-set duluan kartu langsung
        // render TANPA branch dulu, branch baru "muncul nyelip" sesaat
        // kemudian begitu query kedua selesai (kelihatan kayak lag).
        // Nunggu keduanya lalu commit SEKALIGUS = satu kali render, branch
        // sudah ada dari kartu pertama kali muncul, sama respon-nya kayak
        // info lain.
        const siteIds = Array.from(new Set((data || []).map((r) => r.site_id).filter(Boolean)));
        let map = {};
        if (siteIds.length > 0) {
          const { data: siteRows } = await supabaseMarta.from("mh_sites").select("site_id,branch").in("site_id", siteIds);
          (siteRows || []).forEach((s) => { if (s.branch) map[s.site_id] = s.branch; });
        }
        if (alive) {
          setBranchBySite(map);
          setRows(data || []);
        }
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat aktivitas");
      }
    })();
    return () => { alive = false; };
  }, [loading]);

  useEffect(() => {
    if (openId && rows) setDetail(rows.find((r) => r.id === openId) || null);
  }, [openId, rows]);

  const counts = useMemo(() => {
    const c = { all: rows?.length || 0 };
    for (const r of rows || []) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows || [];
    if (tab !== "all") list = list.filter((r) => r.status === tab);
    const term = q.trim().toLowerCase();
    if (term) list = list.filter((r) => (r.event_name || "").toLowerCase().includes(term) || (r.mc || "").toLowerCase().includes(term) || (r.site_id || "").toLowerCase().includes(term));
    if (needsActionOnly) list = list.filter((r) => needsAction(r, userId));
    if (dateRange !== "all") list = list.filter((r) => inDateRange(r, dateRange));
    if (categories.size > 0) {
      list = list.filter((r) => {
        const cats = Array.isArray(r.event_categories) && r.event_categories.length ? r.event_categories : (r.event_category ? [r.event_category] : []);
        return cats.some((c) => categories.has(c));
      });
    }
    return list;
  }, [rows, tab, q, needsActionOnly, dateRange, categories, userId]);

  const activeFilterCount = (needsActionOnly ? 1 : 0) + (dateRange !== "all" ? 1 : 0) + (categories.size > 0 ? 1 : 0);

  function toggleCategory(key) {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function resetFilters() {
    setNeedsActionOnly(false);
    setDateRange("all");
    setCategories(new Set());
  }

  const draftIncompleteCount = useMemo(
    () => (rows || []).filter((r) => userId && r.created_by === userId && r.status === "draft" && isDraftIncomplete(r)).length,
    [rows, userId]
  );

  function requestDelete(r) {
    setDeleteTarget({ id: r.id, name: r.event_name });
  }

  function handleDeleted() {
    const id = deleteTarget?.id;
    setRows((prev) => (prev || []).filter((x) => x.id !== id));
    if (detail?.id === id) {
      setDetail(null);
      router.replace("/martahub/m/activities");
    }
    setDeleteTarget(null);
  }

  if (loading) return <MobileShell active="activities"><ShellSpinner /></MobileShell>;

  const fab = (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: `calc(env(safe-area-inset-bottom,0px) + ${NAV_HEIGHT}px)`, zIndex: 35, pointerEvents: "none" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", position: "relative", height: 0 }}>
        <button onClick={() => router.push("/martahub/m/activities/new")} aria-label="Buat Plan"
          style={{
            pointerEvents: "auto", position: "absolute", right: FAB_MARGIN, bottom: FAB_MARGIN,
            display: "flex", alignItems: "center", gap: 7,
            padding: "13px 18px", borderRadius: 999, border: "none", background: BRAND, color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: FF, cursor: "pointer",
            boxShadow: "0 8px 20px rgba(17,17,20,0.22)",
          }}>
          <Plus size={16} /> Buat Plan
        </button>
      </div>
    </div>
  );

  return (
    <MobileShell active="activities" fab={fab}>
      {/* Header STICKY dgn glass blur - pola & nilai warna/blur SAMA PERSIS
          dgn header Beranda (app/martahub/m/page.jsx) & Management View,
          supaya bahasa desainnya konsisten antar layar mobile-web
          (sebelumnya cuma div biasa, jadi judul/search/tab ikut tergulung
          hilang begitu daftar aktivitasnya panjang). Search + tab filter
          disertakan sebagai bagian dari blok sticky karena keduanya juga
          navigasi, bukan konten yang perlu di-scroll bersama daftar. */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20, maxWidth: 480, margin: "0 auto",
        padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 12px",
        background: "rgba(244,245,247,0.86)", backdropFilter: "blur(18px) saturate(1.5)", WebkitBackdropFilter: "blur(18px) saturate(1.5)",
        borderBottom: "1px solid rgba(23,24,28,0.06)", boxShadow: "0 6px 20px rgba(23,24,28,0.05)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          {/* Judul mengikuti scope: bme/rge cuma lihat aktivitas di
              branch-nya sendiri ("Aktivitas Branch"), role di atasnya
              (tmv/head/admin/spm_sumatera) lingkupnya region ("Aktivitas
              Region") - biar user langsung sadar cakupan daftar yg dia
              lihat tanpa perlu buka filter dulu. */}
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>
            {scope?.role === "bme_rge" ? "Aktivitas Branch" : "Aktivitas Region"}
          </div>
          {/* Tombol filter - sejajar judul, kanan. Titik merah kecil = ada
              filter aktif (selain tab status) biar user tahu daftar sedang
              dipersempit walau sheet-nya sudah ditutup. */}
          <button onClick={() => setFilterOpen(true)} aria-label="Filter"
            style={{
              position: "relative", flexShrink: 0, width: 36, height: 36, borderRadius: 11,
              border: `1.5px solid ${activeFilterCount > 0 ? BRAND : "#E4E5EA"}`,
              background: activeFilterCount > 0 ? "#FDECEC" : "#FFFFFF",
              color: activeFilterCount > 0 ? BRAND : "#5A5A68",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}>
            <SlidersHorizontal size={15} />
            {activeFilterCount > 0 && (
              <span style={{ position: "absolute", top: -3, right: -3, minWidth: 15, height: 15, padding: "0 3px", borderRadius: 999, background: BRAND, color: "#fff", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FF }}>
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
        {draftIncompleteCount > 0 && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 800, color: "#C2410C", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 999, padding: "3px 8px" }}>
              <AlertCircle size={11} /> {draftIncompleteCount} draft belum lengkap
            </span>
          </div>
        )}

        {/* Search */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, height: 44, padding: "0 13px", borderRadius: 12, background: "#FFFFFF", border: "1px solid #E9EAEE", marginTop: 14 }}>
          <Search size={15} color="#9A9AA6" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari Aktivitas"
            style={{ flex: 1, minWidth: 0, height: "100%", background: "transparent", border: "none", outline: "none", fontSize: 13.5, fontFamily: FF, color: "#17181C" }} />
          {q && (
            <button onClick={() => setQ("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#9A9AA6", display: "flex" }}>
              <X size={15} />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginTop: 14, overflowX: "auto", paddingBottom: 2, WebkitOverflowScrolling: "touch" }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            const n = counts[t.key] || 0;
            if (t.key !== "all" && n === 0) return null;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{
                  flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 999,
                  background: active ? "#17181C" : "#FFFFFF", border: `1px solid ${active ? "#17181C" : "#E9EAEE"}`,
                  color: active ? "#FFFFFF" : "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", whiteSpace: "nowrap",
                }}>
                {t.label}
                <span style={{ fontSize: 10.5, fontWeight: 800, opacity: active ? 0.85 : 0.6 }}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "16px 20px 0" }}>
        {err && <div style={{ padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

        {rows === null && !err ? (
          <ShellSpinner />
        ) : filtered.length === 0 ? (
          <div style={{ marginTop: 4, textAlign: "center", padding: "40px 20px", background: "#FFFFFF", border: "1px dashed #D8D9E0", borderRadius: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#3A3A44" }}>Tidak ada aktivitas</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#8A8A96" }}>Coba ganti filter atau kata kunci pencarian.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((r) => (
              <ActivityCard key={r.id} r={r} userId={userId} branchLabel={branchBySite[r.site_id]}
                onOpen={() => router.push(
                  // Draft = masih tahap pengisian, BUKAN sesuatu yg perlu
                  // "dilihat" dulu di halaman detail (read-only) sebelum
                  // bisa dilanjutkan - klik draft langsung ke wizard edit
                  // (yang otomatis lompat ke step terakhir yg belum
                  // lengkap, lihat stepResumed di new/page.jsx), skip
                  // halaman detail sepenuhnya. Status lain (sudah diajukan
                  // dst.) tetap ke halaman detail spt biasa.
                  (r.status === "draft" || r.status === "revision_needed") && r.created_by === userId
                    ? `/martahub/m/activities/new?edit=${r.id}`
                    : `/martahub/m/activities/${r.id}`
                )} />
            ))}
          </div>
        )}
      </div>

      {detail && (
        <DetailSheet r={detail} userId={userId} branchLabel={branchBySite[detail.site_id]}
          onClose={() => { setDetail(null); router.replace("/martahub/m/activities"); }}
          onRequestDelete={requestDelete} />
      )}

      {deleteTarget && (
        <DeleteActivitySheet
          activityId={deleteTarget.id}
          activityName={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}

      {filterOpen && (
        <BottomSheet onClose={() => setFilterOpen(false)}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#17181C" }}>Filter Aktivitas</div>

          <div style={{ marginTop: 18 }}>
            <button onClick={() => setNeedsActionOnly((v) => !v)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                padding: "12px 14px", borderRadius: 13, border: `1.5px solid ${needsActionOnly ? BRAND : "#E9EAEE"}`,
                background: needsActionOnly ? "#FDECEC" : "#F8F8FA", cursor: "pointer", fontFamily: FF,
              }}>
              <span style={{ textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: needsActionOnly ? BRAND : "#17181C" }}>Perlu Tindakan</div>
                <div style={{ marginTop: 2, fontSize: 11, color: "#8A8A96" }}>Draft belum lengkap, revisi, atau laporan terlambat</div>
              </span>
              <span style={{
                flexShrink: 0, width: 22, height: 22, borderRadius: 7, border: `1.5px solid ${needsActionOnly ? BRAND : "#D6D7DD"}`,
                background: needsActionOnly ? BRAND : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {needsActionOnly && <Check size={13} color="#fff" />}
              </span>
            </button>
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#8A8A96", textTransform: "uppercase", letterSpacing: "0.03em" }}>Tanggal Event</div>
            <div style={{ marginTop: 8, display: "flex", gap: 7 }}>
              {[{ key: "all", label: "Semua" }, { key: "week", label: "Minggu Ini" }, { key: "month", label: "Bulan Ini" }].map((o) => (
                <button key={o.key} onClick={() => setDateRange(o.key)}
                  style={{
                    flex: 1, padding: "9px 0", borderRadius: 11, border: `1.5px solid ${dateRange === o.key ? BRAND : "#E9EAEE"}`,
                    background: dateRange === o.key ? "#FDECEC" : "#F8F8FA", color: dateRange === o.key ? BRAND : "#5A5A68",
                    fontSize: 12, fontWeight: 800, fontFamily: FF, cursor: "pointer",
                  }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#8A8A96", textTransform: "uppercase", letterSpacing: "0.03em" }}>Kategori Event</div>
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 7 }}>
              {Object.entries(CAT_LABEL).map(([key, label]) => {
                const active = categories.has(key);
                return (
                  <button key={key} onClick={() => toggleCategory(key)}
                    style={{
                      padding: "8px 13px", borderRadius: 999, border: `1.5px solid ${active ? BRAND : "#E9EAEE"}`,
                      background: active ? "#FDECEC" : "#F8F8FA", color: active ? BRAND : "#5A5A68",
                      fontSize: 12, fontWeight: 700, fontFamily: FF, cursor: "pointer",
                    }}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
            <button onClick={resetFilters}
              style={{ flex: 1, height: 46, borderRadius: 12, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 13, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
              Reset
            </button>
            <button onClick={() => setFilterOpen(false)}
              style={{ flex: 1, height: 46, borderRadius: 12, border: "none", background: BRAND, color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: FF, cursor: "pointer" }}>
              Terapkan
            </button>
          </div>
        </BottomSheet>
      )}

    </MobileShell>
  );
}

function ActivityCard({ r, userId, branchLabel, onOpen }) {
  const isReady = READY_STATUSES.has(r.status);
  // SATU pill status utk seluruh kartu - activityStage() (activityUi.js)
  // adalah SATU-SATUNYA sumber label status sekarang, tidak ada lagi pill
  // kedua terpisah (dulu ada "Plan Diajukan" dari status DB mentah DIBARENGI
  // pill lain "Berjalan" hasil hitungan tanggal - user bingung dua-duanya
  // beda krn kelihatan kontradiksi padahal maksudnya beda tingkat).
  const stage = activityStage(r);
  const isDraft = r.status === "draft";
  const incomplete = isDraft && isDraftIncomplete(r);
  const showNote = !!r.validation_note && (r.status === "revision_needed" || r.status === "revision_actual" || r.status === "rejected");
  // Plan yg sudah siap TAPI tanggal event-nya belum tiba MASIH BOLEH diedit
  // (bukan terkunci sejak diajukan) - lihat penjelasan yg sama di halaman
  // detail (earliestPlanDate/READY_STATUSES).
  const eventArrived = isReady ? (earliestPlanDate(r) ? earliestPlanDate(r) <= new Date().toISOString().slice(0, 10) : false) : false;
  // Draft Laporan Actual (bukan draft PLAN) - entry SP/FWA/rebuy + cost/insight
  // sudah disimpan DSF via "Simpan Draft" tapi belum di-submit final, jadi
  // status ini harus kelihatan jelas di daftar (bukan cuma tersembunyi di
  // localStorage per-perangkat spt sebelumnya).
  const hasActualDraft = !!r.actual_draft_saved_at && r.actual_sp == null;
  // Laporan actual sudah/belum diisi - dipakai utk warna outline kartu:
  // belum diisi (plan sudah jadi tapi actual_sp masih kosong) = OREN, sudah
  // selesai (actual_sp terisi, laporan sudah masuk) = HIJAU. Draft PLAN
  // (belum jadi plan sama sekali) tetap pakai warna incomplete-nya sendiri,
  // bukan warna actual ini, krn belum relevan mengisi actual sebelum plan-nya
  // jadi.
  const hasActual = r.actual_sp != null;
  const timeLabel = fmtTimeLabel(r);

  // Border kartu balik netral - abu-abu tipis polos spy tidak "ramai",
  // warna status cukup dibawa lewat pill-nya sendiri (planStatus di bawah
  // waktu) & outline oren khusus draft plan yg belum lengkap (itu satu2nya
  // yg masih perlu "ditangkap mata" lewat border sblm dibuka).
  const outlineColor = isDraft && incomplete ? "#FDBA74" : "#EDEDF1";
  const [expanded, setExpanded] = useState(false);

  // Redesign kartu: dulu ada strip warna 4px absolute di sisi kiri (kesan
  // "enterprise dashboard" tp jadi ramai berbarengan dgn kebab di kanan
  // atas) - dihapus, digantikan border+shadow lebih lembut & radius lebih
  // besar spy terasa lebih modern/kalem. Outline sekarang bicara soal status
  // laporan actual (oren = belum diisi, hijau = sudah selesai) - jauh lebih
  // actionable drpd sekadar warna netral, user langsung tahu kartu mana yg
  // masih perlu ditindaklanjuti tanpa buka satu-satu.
  return (
    <div style={{
      position: "relative", background: "#FFFFFF", borderRadius: 18, overflow: "hidden", fontFamily: FF,
      border: `1px solid ${outlineColor}`,
      boxShadow: "0 2px 10px rgba(23,24,28,0.04), 0 1px 2px rgba(23,24,28,0.03)",
    }}>
      {/* Div (bukan <button>) - kartu ini sekarang punya tombol "Lihat Plan
          vs Actual" DI DALAM area yg sama, & <button> di dalam <button> itu
          invalid HTML (juga bikin klik toggle ikut ke-trigger sbg onOpen).
          role="button"+tabIndex spy tetap fokus/aksesibel via keyboard. */}
      <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
        style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "15px 16px 4px", cursor: "pointer", fontFamily: FF }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            {/* Badge brand di kiri judul DIHAPUS - brand-nya sekarang jadi
                pill BACKGROUND SOLID di ujung baris subtitle (bukan teks
                berwarna) - konsepnya SAMA dgn pill status (planStatus) di
                bawah: background solid + teks kontras, IM3 kuning teks
                hitam, 3ID magenta teks putih. */}
            <div style={{ fontSize: 14, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.event_name || "Plan Tanpa Nama"}
            </div>
            {/* Urutan subtitle: Brand (badge) → Branch → MC. */}
            <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              {r.brand && (
                <span style={{
                  flexShrink: 0, fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, whiteSpace: "nowrap",
                  background: BRAND_COLOR[r.brand.toLowerCase()] || "#8A8A96",
                  color: r.brand.toLowerCase() === "tri" ? "#FFFFFF" : "#17181C",
                }}>
                  {r.brand.toLowerCase() === "tri" ? "3ID" : "IM3"}
                </span>
              )}
              <span style={{ fontSize: 11.5, color: "#8A8A96", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                {[branchLabel, r.mc].filter(Boolean).join(" · ")}
              </span>
            </div>
          </div>
          <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, padding: "4px 9px", borderRadius: 999, color: stage.color, background: stage.bg, whiteSpace: "nowrap" }}>
            {hasActualDraft ? "Draft Laporan Actual" : stage.label}
          </span>
        </div>

        {/* Baris waktu (tanggal + jam) - dipisah dari subtitle MC/Branch/Brand
            spy lebih gampang discan sekilas (ikon jam yg dikenali langsung),
            & sekalian nampilin JAM event yg sebelumnya tidak kelihatan sama
            sekali di kartu daftar (cuma ada di halaman detail). */}
        <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "#5A5A68", fontWeight: 600 }}>
          <Clock size={12} color="#B0B0BA" style={{ flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtDate(r.plan_date)} · {timeLabel}</span>
        </div>

        {/* Toggle "Lihat Plan vs Actual" - sendirian rata kanan sekarang
            (status sudah cukup satu pill di kanan-atas, tidak perlu baris
            status kedua di sini lagi). */}
        {!isDraft && (
          <div style={{ marginTop: 9, display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setExpanded((v) => !v); }}
              style={{ flexShrink: 0, padding: "3px 0", border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: "#8A8A96", fontFamily: FF }}>
              {expanded ? "Sembunyikan" : "Lihat Plan vs Actual"}
              <ChevronDown size={13} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            </button>
          </div>
        )}

        {isDraft ? (
          <div style={{
            marginTop: 11, display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderRadius: 11,
            background: incomplete ? "#FFF7ED" : "#F0FBF6", border: `1px solid ${incomplete ? "#FED7AA" : "#BBF0D6"}`,
          }}>
            {incomplete ? <AlertCircle size={14} color="#C2410C" style={{ flexShrink: 0 }} /> : <CheckCircle2 size={14} color="#15803D" style={{ flexShrink: 0 }} />}
            <div style={{ fontSize: 11, fontWeight: 700, color: incomplete ? "#C2410C" : "#15803D", flex: 1 }}>
              {incomplete ? "Belum lengkap · lanjutkan pengisian" : "Lengkap · siap diajukan"}
            </div>
            <ChevronRight size={14} color={incomplete ? "#C2410C" : "#15803D"} style={{ flexShrink: 0 }} />
          </div>
        ) : null}

        {hasActualDraft && (
          <div style={{
            marginTop: 11, display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderRadius: 11,
            background: "#FFFBEB", border: "1px solid #FDE68A",
          }}>
            <FolderClock size={14} color="#B45309" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: "#B45309", flex: 1 }}>
              Draft Laporan Actual · lanjutkan pengisian
            </div>
            <ChevronRight size={14} color="#B45309" style={{ flexShrink: 0 }} />
          </div>
        )}

        {showNote && (
          <div style={{ marginTop: 9, fontSize: 10.5, color: meta.color, background: meta.bg, borderRadius: 9, padding: "7px 9px", fontWeight: 600, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {r.validation_note}
          </div>
        )}
      </div>

      {!isDraft && (
        <div style={{ padding: "0 15px 14px 19px", marginTop: 2 }}>
          <ActivityMetricsBlock r={r} expanded={expanded} />
        </div>
      )}

      {/* Kebab 3-titik DIHAPUS dari kartu daftar - hapus plan tetap bisa
          lewat DetailSheet (quick-view saat kartu di-tap) atau menu di
          halaman Detail Aktivitas, tidak perlu diulang lagi di sini spy
          kartu lebih bersih. */}
    </div>
  );
}

/** Blok metrik Target/Actual SP+FWA, Rebuy, & Estimasi Revenue+Cost Ratio -
 * dipakai di KEDUA tempat (kartu list & DetailSheet) supaya tidak ada dua
 * salinan yg gampang beda kalau salah satu lupa diperbarui (spt yg sempat
 * terjadi sebelumnya - lihat catatan di DetailSheet).
 *
 * PERBAIKAN dari versi sebelumnya: ikon CardSim/Router dulu dipasangkan ke
 * "Target" vs "Actual" (bukan ke SP vs FWA) - jadi ikon SIM-card nempel di
 * baris "Target SP/FWA" (gabungan DUA angka) & ikon router di "Actual
 * SP/FWA", padahal ikon itu SEHARUSNYA menandai jenis PRODUK (SP=CardSim,
 * FWA=Router), bukan kolom target/actual. Sekarang dipecah jadi grid 2×2:
 * tiap sel = SATU kombinasi produk×kolom, ikonnya konsisten per produk di
 * kedua kolom (CardSim selalu utk SP, Router selalu utk FWA).
 *
 * Rebuy & Estimasi Revenue/Cost Ratio SEKARANG SELALU tampil (bukan
 * disembunyikan total kalau kebetulan 0) - fallback "-"/"Rp 0" spy user tahu
 * datanya memang belum diisi, bukan mengira fiturnya tidak ada. */
// `expanded` sekarang DIKONTROL DARI LUAR (toggle-nya sudah pindah jadi
// satu baris dgn status di ActivityCard, bukan header sendiri di sini lagi)
// - undefined (dipakai DetailSheet yg tidak collapsible) berarti selalu
// tampil penuh, boolean eksplisit (dipakai ActivityCard) menentukan show/hide.
function ActivityMetricsBlock({ r, expanded }) {
  const hasActual = r.actual_sp != null;
  const showBreakdown = expanded === undefined ? true : expanded;

  // Grid tile & banner di bawah SEKARANG persis sama (komponen yg SAMA,
  // MetricTiles.jsx) dgn section "Target vs Actual" di halaman Detail
  // Aktivitas - dulu di sini pakai gaya kompak sendiri (StatChip/
  // MetricTileMini "Plan → Actual"), sekarang satu bahasa visual di kedua
  // tempat, tidak ada lagi dua versi berbeda utk data yg sama.
  return (
    <div style={{ marginTop: showBreakdown ? 4 : 0, paddingTop: showBreakdown ? 8 : 0, borderTop: showBreakdown ? "1px solid #F0F0F3" : "none" }}>
      {showBreakdown && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <MetricTile icon={CardSim} accent="#DB2777" label="SP" target={fmtInt(r.target_sp)} actual={hasActual ? fmtInt(r.actual_sp) : "-"} />
          <MetricTile icon={Router} accent="#2563EB" label="FWA" target={fmtInt(r.target_fwa)} actual={hasActual ? fmtInt(r.actual_fwa) : "-"} />
          <div style={{ gridColumn: "1 / -1" }}>
            <RebuyTile
              spTarget={fmtRp(r.target_rebuy_pulsa)} spActual={hasActual ? fmtRp(r.actual_rebuy_pulsa) : "-"}
              fwaTarget={fmtRp(r.target_rebuy_data)} fwaActual={hasActual ? fmtRp(r.actual_rebuy_data) : "-"}
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <MetricTile icon={Receipt} accent="#7C3AED" label="Cost" target={fmtRp(r.cost_estimate)} actual={hasActual ? fmtRp(r.cost_actual ?? r.cost_estimate) : "-"} />
          </div>
        </div>
      )}

      <RevenueCostBanner
        revenueLabel={r.actual_rev_3m != null ? "Total Revenue Actual" : "Estimasi Total Revenue"}
        revenueValue={r.actual_rev_3m != null ? fmtRp(r.actual_rev_3m) : (r.target_rev_3m > 0 ? fmtRp(r.target_rev_3m) : "-")}
        costRatioValue={r.actual_rev_3m != null
          ? `${((Number(r.cost_actual ?? r.cost_estimate) || 0) / r.actual_rev_3m * 100).toFixed(1)}%`
          : (r.target_rev_3m > 0 ? `${((Number(r.cost_estimate) || 0) / r.target_rev_3m * 100).toFixed(1)}%` : "-")}
      />
    </div>
  );
}

function DetailSheet({ r, userId, onClose, onRequestDelete }) {
  const router = useRouter();
  const isReady = READY_STATUSES.has(r.status);
  const meta = activityStage(r);
  const isOwner = !!userId && r.created_by === userId;
  const eventArrived = isReady ? (earliestPlanDate(r) ? earliestPlanDate(r) <= new Date().toISOString().slice(0, 10) : false) : false;

  // Satu aksi kontekstual utama per status - mengikuti percabangan yang sama
  // dgn `_ActivityCard._buildBottom()` di Flutter (activity_list_screen.dart),
  // disederhanakan ke SATU tombol dominan per status alih-alih replikasi
  // penuh semua sub-kasus (mis. "plan belum lengkap" utk draft).
  //
  // Plan SEKARANG TIDAK PERLU approval TMV lagi - "plan_submitted" (atau
  // "approved" utk plan lama) sudah cukup utk lanjut, TIDAK perlu menunggu
  // keputusan approver. Yang menentukan aksinya cuma TANGGAL EVENT: sebelum
  // tiba → masih boleh Edit Plan, begitu tiba → Check In/Isi Laporan Actual
  // (SAMA PERSIS dgn logika di halaman detail [id]/page.jsx).
  let action = null;
  let editAction = null; // aksi sekunder "Edit Plan" - HANYA terisi di fase
  // "sudah tiba tanggal event tapi belum check-in", supaya user tetap bisa
  // koreksi plan sebelum dia benar2 checked-in di lokasi (lihat prompt
  // "Sudah berada di lokasi event?" di bawah).
  let checkinPrompt = false;
  if (r.status === "revision_needed") {
    action = { label: "Revisi Plan", onTap: () => router.push(`/martahub/m/activities/new?edit=${r.id}`) };
  } else if (r.status === "draft") {
    action = { label: "Lanjutkan Plan", onTap: () => router.push(`/martahub/m/activities/new?edit=${r.id}`) };
  } else if (isReady && !eventArrived) {
    action = { label: "Edit Plan", onTap: () => router.push(`/martahub/m/activities/new?edit=${r.id}`) };
  } else if (isReady && eventArrived) {
    if (r.checkin_valid == null) {
      checkinPrompt = true;
      action = { label: "Check In", onTap: () => router.push(`/martahub/m/activities/${r.id}/checkin`) };
      editAction = { label: "Edit Plan", onTap: () => router.push(`/martahub/m/activities/new?edit=${r.id}`) };
    } else {
      const hasActualDraft = !!r.actual_draft_saved_at && r.actual_sp == null;
      action = { label: hasActualDraft ? "Lanjutkan Laporan Actual" : "Isi Laporan Actual", onTap: () => router.push(`/martahub/m/activities/${r.id}/submit`) };
    }
  } else if (r.status === "revision_actual") {
    action = { label: "Revisi & Kirim Ulang", onTap: () => router.push(`/martahub/m/activities/${r.id}/submit`) };
  }

  return (
    <BottomSheet onClose={onClose} zIndex={60} backdropOpacity={0.45}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#17181C" }}>{r.event_name || "-"}</div>
          <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, padding: "5px 10px", borderRadius: 999, color: meta.color, background: meta.bg }}>{meta.label}</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 12.5, color: "#8A8A96", fontWeight: 600 }}>
          {r.mc || "-"} {r.site_id ? `· ${r.site_id}` : ""} · {fmtDate(r.plan_date)}
        </div>
        <ActivityMetricsBlock r={r} />
        {r.validation_note && (
          <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 10, background: meta.bg, color: meta.color, fontSize: 11.5, fontWeight: 600, lineHeight: 1.5 }}>
            {r.validation_note}
          </div>
        )}
        {checkinPrompt && (
          <div style={{ marginTop: 16, padding: "11px 13px", borderRadius: 13, background: "#FFF7ED", border: "1px solid #FED7AA", display: "flex", alignItems: "center", gap: 9 }}>
            <MapPin size={16} color="#C2410C" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 12, fontWeight: 700, color: "#9A3412", flex: 1 }}>Sudah berada di lokasi event?</div>
          </div>
        )}

        <div style={{ marginTop: checkinPrompt ? 10 : 16, display: "flex", gap: 10 }}>
          <button onClick={onClose}
            style={{ flex: 1, height: 48, borderRadius: 12, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 13.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
            Tutup
          </button>
          {action && (
            <button onClick={action.onTap}
              style={{ flex: 1.4, height: 48, borderRadius: 12, border: "none", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              {action.label} {checkinPrompt && <ChevronRight size={15} />}
            </button>
          )}
        </div>

        {editAction && (
          <button onClick={editAction.onTap}
            style={{ width: "100%", marginTop: 10, height: 42, borderRadius: 12, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#3A3A44", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            <Pencil size={13} /> {editAction.label}
          </button>
        )}

        {/* Hapus juga tersedia "di dalamnya" (quick-view sheet), bukan cuma
            dari kartu daftar - sesuai permintaan, tetap digerbang ke pemilik
            plan & tetap lewat DeleteActivitySheet yg sama (satu alur konfirmasi). */}
        {isOwner && (
          <button onClick={() => { onRequestDelete(r); onClose(); }}
            style={{ width: "100%", marginTop: 10, height: 44, borderRadius: 12, border: "1px solid #F7C6C9", background: "#FFF5F6", color: "#DC2626", fontSize: 12.5, fontWeight: 800, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Trash2 size={14} /> Hapus Plan
          </button>
        )}
    </BottomSheet>
  );
}

export default function ActivitiesPage() {
  return (
    <Suspense fallback={<MobileShell active="activities"><ShellSpinner /></MobileShell>}>
      <ActivitiesInner />
    </Suspense>
  );
}
