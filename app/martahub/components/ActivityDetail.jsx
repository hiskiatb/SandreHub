"use client";
// Modal detail Activity Plan - dipakai bersama oleh Activity Plan (klik baris
// tabel) dan Calendar (klik event di kalender), supaya keduanya menampilkan
// detail yang PERSIS SAMA, bukan versi ringkas terpisah yang gampang beda.
// Self-contained: helper kecil (format, status, brand badge) sengaja
// diduplikasi ringan di sini alih-alih diimpor dari activities/page.jsx,
// supaya file ini tidak bergantung pada internal halaman lain.
//
// Tampilan mengikuti bahasa desain "Activity Detail" versi mobile MartaHub
// (app/martahub/m/activities/[id]/page.jsx) - header sticky glass-blur,
// kartu putih rounded ber-aksen warna per section (SectionCard), pill status
// bulat, grid metric tile, grid foto - TAPI dibuat lega/luas utk layar
// desktop (modal lebar ~1040px, multi-kolom di bagian yg relevan), bukan
// panel sempit yg terasa seperti layar HP yg discale-up. Fetching data,
// RPC hapus, dan seluruh logic (deriveStatusInfo, DETAIL_COLS, dst) TIDAK
// diubah - murni redesign presentasi.
import { useState, useEffect } from "react";
import {
  X, MapPin, Image as ImageIcon, Phone, FileText, Layers, Info,
  Target as TargetIcon, CheckCircle2, Clock, XCircle, Tag, Trash2, Calendar, Pencil,
} from "lucide-react";
import { T, FONT, brandLabel } from "./MartaShell";
import supabaseMarta from "../../../lib/supabaseMarta";

const CAT_LABEL = {
  directSelling: "Direct Selling", jointEvent: "Join Event", openBooth: "Open Booth",
  project: "Project", sponsorship: "Sponsorship", thematic: "Thematic",
};
const STATUS = {
  draft: ["Draft", T.mid, "#eef1f6"], submitted: ["Laporan Masuk", T.blue, T.blueBg],
  approved: ["Disetujui", T.success, T.successBg], rejected: ["Ditolak", T.error, T.errorBg],
  completed: ["Selesai", T.success, T.successBg], inProgress: ["Berlangsung", T.warning, T.warningBg],
  plan_submitted: ["Plan Diajukan", T.blue, T.blueBg], revision_needed: ["Revisi Plan", T.warning, T.warningBg],
  pending_validation: ["Menunggu Validasi", T.blue, T.blueBg],
  revision_actual: ["Perlu Perbaikan Lokasi/Bukti", T.warning, T.warningBg],
};

export function deriveStatusInfo(r) {
  if (r?.status === "approved") {
    const planDateStr = r.plan_date_start || r.plan_date;
    if (planDateStr) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const planDate = new Date(planDateStr.slice(0, 10)); planDate.setHours(0, 0, 0, 0);
      const diffDays = Math.round((today - planDate) / 86400000);
      if (diffDays < 0) return ["Menunggu Hari-H", T.blue, T.blueBg];
      if (diffDays === 0) return ["Hari-H / Berlangsung", T.warning, T.warningBg];
      return ["Menunggu Laporan", T.error, T.errorBg];
    }
  }
  return STATUS[r?.status] || [r?.status, T.mid, "#eef1f6"];
}

const fmtDate = (s) => {
  if (!s || s.length < 10) return "-";
  const [y, m, d] = s.slice(0, 10).split("-");
  const mo = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"][(+m || 1) - 1];
  return `${d} ${mo} ${y}`;
};
const fmtInt = (n) => (n == null ? "-" : Number(n).toLocaleString("id-ID"));
const fmtRp = (n) => (n == null ? "-" : `Rp${Number(n).toLocaleString("id-ID")}`);
const fmtTag = (s) => (s ? String(s).replace(/_/g, " ").toUpperCase() : "-");
// Title Case ("Public Area") dipakai khusus utk POI/Network/Area supaya
// tidak sekaligus huruf kapital semua (fmtTag/ALL CAPS di atas tetap
// dipakai utk kategori event).
const unsnake = (s) => (s ? String(s).split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : "-");

export function BrandBadge({ brand, big }) {
  if (!brand) return <span style={{ color: T.lo }}>-</span>;
  const isTri = String(brand).toLowerCase() === "tri";
  const bg = isTri ? "#E6007E" : "#FFC700";
  const fg = isTri ? "#fff" : "#1A1300";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", fontSize: big ? 11.5 : 10.5, fontWeight: 800,
      color: fg, background: bg, padding: big ? "4px 11px" : "3px 9px", borderRadius: 999, letterSpacing: "0.02em",
    }}>
      {brandLabel(brand)}
    </span>
  );
}

// Foto ditampilkan lewat proxy Edge Function `media-view` (sama seperti versi
// mobile) - browser TIDAK PERNAH memanggil Google Drive langsung / melihat
// link Storage privat-nya. Function itu ambil bytes dari Drive (kalau sudah
// dimirror) atau fallback ke Supabase Storage (foto lama/belum dimirror),
// lalu dialirkan balik. Butuh header Authorization, jadi tidak bisa dipakai
// langsung sbg <img src> - di-fetch manual lalu diubah jadi object URL blob.
const MEDIA_VIEW_URL = (process.env.NEXT_PUBLIC_MARTA_SUPABASE_URL || "").replace(/\/$/, "") + "/functions/v1/media-view";
async function fetchAuthedPhotoBlobUrl(kind, id) {
  const { data: sessionData } = await supabaseMarta.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Belum login");
  const res = await fetch(`${MEDIA_VIEW_URL}?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gagal memuat foto (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export const DETAIL_COLS = "id,event_name,event_category,event_categories,brand,mc,branch_id,site_id,actual_site_id,plan_date,plan_date_start,plan_date_end,plan_dates_multi,is_all_day,start_time,end_time,poi_type,network_category,area_potential,address,latitude,longitude,status,target_sp,target_fwa,target_rebuy_pulsa,target_rebuy_data,target_rev_3m,cost_estimate,expected_outcome,actual_sp,actual_fwa,actual_rebuy_pulsa,actual_rebuy_data,actual_rev_3m,cost_actual,insight,checkin_valid,checkin_distance,checkin_at,approved_by_name,approved_by_email,approved_at,approval_notes,validation_status,validation_note,validated_at,override_status,override_by_name,override_at,override_note,created_at";

const btn = { padding: "9px 15px", borderRadius: 11, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 };

// SPM Sumatera bisa menghapus Activity Plan langsung dari modal detail ini,
// dengan konfirmasi ketik "HAPUS" (lihat DeleteConfirm di bawah) supaya tidak
// kepencet tidak sengaja - aksi ini permanen (hard delete row mh_activities).
export function ActivityDetailModal({ id, onClose, canDelete, onDeleted, email }) {
  const [a, setA] = useState(null);
  const [planSites, setPlanSites] = useState([]);
  const [actualSites, setActualSites] = useState([]);
  const [siteNames, setSiteNames] = useState({});
  const [branchName, setBranchName] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [entries, setEntries] = useState([]);
  const [editReqs, setEditReqs] = useState([]);
  const [err, setErr] = useState("");
  const [lightbox, setLightbox] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let alive = true;
    setA(null); setErr(""); setPhotos([]); setEntries([]); setEditReqs([]); setPlanSites([]); setActualSites([]); setSiteNames({}); setBranchName(null);
    (async () => {
      try {
        const [{ data: act, error: e1 }, { data: sites }, { data: docs }, { data: sales }, { data: edits }] = await Promise.all([
          supabaseMarta.from("mh_activities").select(DETAIL_COLS).eq("id", id).single(),
          supabaseMarta.from("mh_activity_sites").select("site_id, is_primary, site_kind").eq("activity_id", id).eq("is_primary", false),
          supabaseMarta.from("mh_documents").select("id, storage_path, file_type, created_at").eq("activity_id", id).order("created_at"),
          supabaseMarta.from("mh_dsf_sales_entries").select("id, category, msisdn, validation_status").eq("activity_id", id).order("created_at"),
          supabaseMarta.from("mh_activity_edit_requests").select("id, status, reason, requested_by_name, decided_by_name, decision_notes, created_at, decided_at").eq("activity_id", id).order("created_at", { ascending: false }),
        ]);
        if (e1) throw e1;
        if (!alive) return;
        setA(act);
        setPlanSites((sites || []).filter((s) => s.site_kind !== "actual").map((s) => s.site_id));
        setActualSites((sites || []).filter((s) => s.site_kind === "actual").map((s) => s.site_id));
        setEntries(sales || []);
        setEditReqs(edits || []);
        const photoDocs = (docs || []).filter((d) => d.file_type === "photo");
        if (photoDocs.length) {
          const withUrls = await Promise.all(
            photoDocs.map(async (d) => {
              try { return { ...d, url: await fetchAuthedPhotoBlobUrl("document", d.id) }; }
              catch { return { ...d, url: null }; }
            })
          );
          if (alive) setPhotos(withUrls.filter((p) => p.url));
        } else {
          setPhotos([]);
        }

        const allSiteIds = Array.from(new Set([act?.site_id, act?.actual_site_id, ...(sites || []).map((s) => s.site_id)].filter(Boolean)));
        if (allSiteIds.length > 0) {
          const { data: siteRows } = await supabaseMarta.from("mh_sites").select("site_id,site_name").in("site_id", allSiteIds);
          const map = {};
          (siteRows || []).forEach((s) => { map[s.site_id] = s.site_name; });
          if (alive) setSiteNames(map);
        }
        if (act?.branch_id) {
          const { data: b } = await supabaseMarta.from("mh_branches").select("name").eq("id", act.branch_id).maybeSingle();
          if (alive) setBranchName(b?.name || null);
        }
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat detail aktivitas");
      }
    })();
    return () => { alive = false; };
  }, [id]);

  async function handleDelete() {
    setDeleting(true); setErr("");
    try {
      const { error } = await supabaseMarta.rpc("mh_delete_activity", { p_activity_id: id, p_caller_email: email });
      if (error) throw error;
      onDeleted?.(id);
      onClose();
    } catch (e) { setErr(e.message || "Gagal menghapus activity plan"); setDeleting(false); }
  }

  const st = a ? deriveStatusInfo(a) : null;
  const categories = a ? (Array.isArray(a.event_categories) && a.event_categories.length ? a.event_categories : (a.event_category ? [a.event_category] : [])) : [];
  const spEntries = entries.filter((e) => e.category === "sp");
  const fwaEntries = entries.filter((e) => e.category === "fwa");
  const spValid = spEntries.filter((e) => e.validation_status === "valid").length;
  const fwaValid = fwaEntries.filter((e) => e.validation_status === "valid").length;

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(13,17,23,.55)", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center", padding: "4vh 20px", fontFamily: FONT,
    }}>
      <style>{`
        @keyframes mh-ad-in { from { opacity:0; transform:translateY(10px) scale(.99); } to { opacity:1; transform:translateY(0) scale(1); } }
        .mh-ad-modal{ animation: mh-ad-in .22s cubic-bezier(.22,1,.36,1); }
        .mh-ad-grid2{ display:grid; grid-template-columns: 1fr 1fr; gap: 22px; }
        .mh-ad-kv{ display:grid; grid-template-columns: 1fr 1fr; gap: 4px 28px; }
        .mh-ad-metrics{ display:grid; grid-template-columns: repeat(4,1fr); gap: 10px; }
        .mh-ad-photos{ display:grid; grid-template-columns: repeat(6,1fr); gap: 10px; }
        @media (max-width: 860px) {
          .mh-ad-grid2{ grid-template-columns: 1fr; }
          .mh-ad-kv{ grid-template-columns: 1fr; }
          .mh-ad-metrics{ grid-template-columns: repeat(2,1fr); }
          .mh-ad-photos{ grid-template-columns: repeat(3,1fr); }
        }
      `}</style>
      <div className="mh-ad-modal" onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 1040, maxHeight: "92vh", background: "#F5F6FA",
        borderRadius: 24, border: "1px solid #E4E5EA", boxShadow: "0 30px 80px rgba(13,17,23,0.28)",
        overflow: "hidden", display: "flex", flexDirection: "column",
      }}>
        {!a && !err ? (
          <div style={{ padding: 60, textAlign: "center", color: T.lo, fontSize: 13, fontWeight: 600 }}>Memuat…</div>
        ) : err && !a ? (
          <div style={{ padding: 24 }}>
            <div style={{ padding: "12px 14px", borderRadius: 12, background: T.errorBg, color: T.error, fontSize: 12.5, fontWeight: 600 }}>{err}</div>
            <button onClick={onClose} style={{ ...btn, marginTop: 14 }}>Tutup</button>
          </div>
        ) : (
          <>
            {/* Header sticky - senada persis dgn header glass-blur di mobile
                Activity Detail (frosted, border tipis bawah), TAPI di sini
                langsung memuat identitas event penuh (bukan cuma judul
                "Activity Detail" polos) karena ruang desktop cukup lega
                utk itu tanpa terasa sempit. */}
            <div style={{
              position: "sticky", top: 0, zIndex: 5, flexShrink: 0,
              padding: "20px 28px 16px", background: "rgba(245,246,250,0.9)",
              backdropFilter: "blur(18px) saturate(1.5)", WebkitBackdropFilter: "blur(18px) saturate(1.5)",
              borderBottom: "1px solid rgba(23,24,28,0.07)", boxShadow: "0 6px 20px rgba(23,24,28,0.05)",
              display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16,
            }}>
              <div style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flexShrink: 0, width: 3, alignSelf: "stretch", minHeight: 40, borderRadius: 99, background: st[1] }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {a.brand && <BrandBadge brand={a.brand} big />}
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: st[1], background: st[2], padding: "4px 11px", borderRadius: 999, whiteSpace: "nowrap" }}>{st[0]}</span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 20, fontWeight: 800, color: "#17181C", letterSpacing: "-0.01em", lineHeight: 1.28 }}>{a.event_name || "-"}</div>
                  <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#8A8A96", fontWeight: 600, flexWrap: "wrap" }}>
                    <Clock size={12} color="#B0B0BA" />
                    <span>{planDateLabel(a)}</span>
                    <span style={{ opacity: 0.5 }}>·</span>
                    <span>Dibuat {a.created_at ? new Date(a.created_at).toLocaleString("id-ID") : "-"}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {canDelete && (
                  <button onClick={() => window.open(`${window.location.origin}/martahub/m/activities/new?edit=${a.id}`, "_blank")} title="Edit Plan"
                    style={{ height: 36, padding: "0 12px", borderRadius: 11, border: "1px solid #E4E5EA", background: "#fff", color: "#3A3A44", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: FONT }}>
                    <Pencil size={14} /> Edit Plan
                  </button>
                )}
                {canDelete && (
                  <button onClick={() => window.open(`${window.location.origin}/martahub/m/activities/${a.id}/submit`, "_blank")} title="Isi/Edit Laporan Actual"
                    style={{ height: 36, padding: "0 12px", borderRadius: 11, border: "1px solid #E4E5EA", background: "#fff", color: "#3A3A44", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: FONT }}>
                    <FileText size={14} /> {a.actual_sp == null ? "Isi Laporan Actual" : "Edit Laporan Actual"}
                  </button>
                )}
                {canDelete && (
                  <button onClick={() => setConfirmDelete(true)} title="Hapus Activity Plan"
                    style={{ width: 36, height: 36, borderRadius: 11, border: `1px solid ${T.error}44`, background: T.errorBg, color: T.error, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <Trash2 size={15} />
                  </button>
                )}
                <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 11, border: "1px solid #E4E5EA", background: "#fff", color: "#5A5A68", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={16} /></button>
              </div>
            </div>

            {/* Body - kolom lebar dgn max-width supaya konten tetap enak
                dibaca di layar sangat lebar (bukan mepet tepi kiri-kanan). */}
            <div style={{ padding: "20px 28px 32px", overflowY: "auto" }}>
              <div style={{ maxWidth: 940, margin: "0 auto" }}>
                {err && (
                  <div style={{ marginBottom: 16, padding: "11px 14px", borderRadius: 12, background: T.errorBg, color: T.error, fontSize: 12.5, fontWeight: 600 }}>{err}</div>
                )}

                {(a.validation_note || a.override_note || a.approval_notes) && (
                  <div style={{ marginBottom: 16, padding: "13px 16px", borderRadius: 14, background: st[2], color: st[1], fontSize: 12.5, fontWeight: 600, lineHeight: 1.55 }}>
                    {a.validation_note || a.override_note || a.approval_notes}
                  </div>
                )}

                {/* Info Plan + Site berdampingan di layar lebar - dua section
                    pendek yg secara alami cocok side-by-side, memanfaatkan
                    ruang desktop drpd ditumpuk vertikal spt di HP. */}
                <div className="mh-ad-grid2">
                  <SectionCard title="Informasi Plan" icon={<Info size={13} />} accent="#2563EB">
                    {categories.length > 0 && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                        {categories.map((c, i) => (
                          <span key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "#2563EB", background: "rgba(37,99,235,0.08)", borderRadius: 999, padding: "4px 10px" }}>
                            <Tag size={11} /> {fmtTag(CAT_LABEL[c] || c)}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mh-ad-kv">
                      <KV label="Branch" value={branchName || "-"} />
                      <KV label="Micro Cluster" value={a.mc || "-"} />
                      <KV label="Tanggal" value={planDateLabel(a)} />
                      <KV label="Waktu" value={a.is_all_day === false && a.start_time && a.end_time ? `${a.start_time.slice(0, 5)} – ${a.end_time.slice(0, 5)}` : "Seharian"} />
                      <KV label="POI" value={unsnake(a.poi_type)} />
                      <KV label="Kekuatan Sinyal" value={unsnake(a.network_category)} />
                      <KV label="Potensi Area" value={unsnake(a.area_potential)} />
                    </div>
                    {a.address && (
                      <div style={{ marginTop: 6, paddingTop: 10, borderTop: "1px solid #F0F0F3" }}>
                        <div style={{ fontSize: 11.5, color: "#8A8A96", fontWeight: 600, marginBottom: 3 }}>Alamat</div>
                        <div style={{ fontSize: 12.5, color: "#17181C", fontWeight: 700, lineHeight: 1.5 }}>{a.address}</div>
                      </div>
                    )}
                  </SectionCard>

                  {a.site_id ? (
                    <SectionCard title={`Site Plan (${planSites.length + 1})`} icon={<Layers size={13} />} accent="#7C3AED">
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <SiteRow label="Site 1" siteId={a.site_id} siteName={siteNames[a.site_id]} />
                        {planSites.map((s, i) => <SiteRow key={s} label={`Site ${i + 2}`} siteId={s} siteName={siteNames[s]} />)}
                      </div>
                      {a.checkin_at && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #F0F0F3" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, color: "#8A8A96", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 8 }}>
                            <MapPin size={12} /> Check In
                          </div>
                          <div className="mh-ad-kv">
                            <KV label="Status" value={a.checkin_valid ? "Valid (dalam radius)" : "Di luar radius"} valueColor={a.checkin_valid ? T.success : T.error} />
                            {a.checkin_distance != null && <KV label="Jarak" value={`${Math.round(a.checkin_distance)} meter`} />}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 11, color: "#8A8A96" }}>{new Date(a.checkin_at).toLocaleString("id-ID")}</div>
                        </div>
                      )}
                    </SectionCard>
                  ) : <div />}

                  {/* Site Actual - baru ada begitu Laporan Actual mulai
                      diisi (di-seed dari Site Plan lewat
                      mh_seed_activity_actual_sites saat halaman submit
                      dibuka pertama kali) - dipisah dari Site Plan krn bisa
                      berbeda (misal ganti lokasi saat eksekusi). */}
                  {(a.actual_site_id || actualSites.length > 0) ? (
                    <SectionCard title={`Site Actual (${a.actual_site_id ? actualSites.length + 1 : actualSites.length})`} icon={<Layers size={13} />} accent="#DB2777">
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {a.actual_site_id && <SiteRow label="Site 1" siteId={a.actual_site_id} siteName={siteNames[a.actual_site_id]} />}
                        {actualSites.map((s, i) => <SiteRow key={s} label={`Site ${i + (a.actual_site_id ? 2 : 1)}`} siteId={s} siteName={siteNames[s]} />)}
                      </div>
                    </SectionCard>
                  ) : <div />}
                </div>

                {/* Target vs Actual - grid metric tile 4 kolom (2 di layar
                    sempit), senada gaya MetricTile mobile. */}
                <SectionCard title="Target vs Actual" icon={<TargetIcon size={13} />} accent="#15803D">
                  <div className="mh-ad-metrics">
                    <MetricTile accent="#DB2777" label="SP" target={fmtInt(a.target_sp)} actual={entries.length ? fmtInt(spValid) : fmtInt(a.actual_sp)} />
                    <MetricTile accent="#2563EB" label="FWA" target={fmtInt(a.target_fwa)} actual={entries.length ? fmtInt(fwaValid) : fmtInt(a.actual_fwa)} />
                    <MetricTile accent="#B45309" label="Rebuy SP" target={fmtRp(a.target_rebuy_pulsa)} actual={fmtRp(a.actual_rebuy_pulsa)} money />
                    <MetricTile accent="#B45309" label="Rebuy FWA" target={fmtRp(a.target_rebuy_data)} actual={fmtRp(a.actual_rebuy_data)} money />
                    <MetricTile accent="#7C3AED" label="Cost" target={fmtRp(a.cost_estimate)} actual={fmtRp(a.cost_actual)} money />
                    <MetricTile accent="#0D9488" label="Est. Revenue" target={fmtRp(a.target_rev_3m)} actual={fmtRp(a.actual_rev_3m)} money />
                    <MetricTile accent="#5A5A68" label="Cost Ratio (Target)" target={a.target_rev_3m > 0 ? `${((Number(a.cost_estimate) || 0) / a.target_rev_3m * 100).toFixed(1)}%` : "-"} actual={null} single />
                    <MetricTile accent="#5A5A68" label="Cost Ratio (Actual)" target={a.actual_rev_3m > 0 ? `${((Number(a.cost_actual) || 0) / a.actual_rev_3m * 100).toFixed(1)}%` : "-"} actual={null} single />
                  </div>
                  {a.insight && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #F0F0F3" }}>
                      <div style={{ fontSize: 10.5, color: "#B0B0BA", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 5 }}>Insight</div>
                      <div style={{ fontSize: 12.5, color: "#3A3A44", lineHeight: 1.6 }}>{a.insight}</div>
                    </div>
                  )}
                </SectionCard>

                {photos.length > 0 && (
                  <SectionCard title={`Dokumentasi Foto (${photos.length})`} icon={<ImageIcon size={13} />} accent="#DB2777">
                    <div className="mh-ad-photos">
                      {photos.map((p) => (
                        <button key={p.id} onClick={() => setLightbox(p.url)}
                          style={{ padding: 0, border: "none", cursor: "pointer", aspectRatio: "1", borderRadius: 12, overflow: "hidden", background: "#F0F0F3" }}>
                          <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform .18s" }}
                            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.06)")}
                            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")} />
                        </button>
                      ))}
                    </div>
                  </SectionCard>
                )}

                {(spEntries.length > 0 || fwaEntries.length > 0) && (
                  <SectionCard title="Nomor Terdaftar" icon={<Phone size={13} />} accent="#0D9488">
                    <div className="mh-ad-grid2">
                      {spEntries.length > 0 && <MsisdnGroup label={`SP (${spEntries.length})`} list={spEntries} />}
                      {fwaEntries.length > 0 && <MsisdnGroup label={`FWA (${fwaEntries.length})`} list={fwaEntries} />}
                    </div>
                  </SectionCard>
                )}

                {editReqs.length > 0 && (
                  <SectionCard title="Riwayat Pengajuan Revisi" icon={<FileText size={13} />} accent="#6B7280">
                    {editReqs.map((r) => (
                      <div key={r.id} style={{ padding: "10px 0", borderBottom: "1px solid #F0F0F3" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C" }}>{r.requested_by_name || "-"}</div>
                          <EditReqBadge status={r.status} />
                        </div>
                        {r.reason && <div style={{ marginTop: 3, fontSize: 11.5, color: "#8A8A96" }}>{r.reason}</div>}
                        <div style={{ marginTop: 3, fontSize: 10.5, color: "#B0B0BA" }}>{new Date(r.created_at).toLocaleString("id-ID")}</div>
                        {r.decision_notes && (
                          <div style={{ marginTop: 6, fontSize: 11.5, color: "#5A5A68", background: "#F7F7F9", borderRadius: 9, padding: "7px 10px" }}>
                            {r.decided_by_name ? `${r.decided_by_name}: ` : ""}{r.decision_notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </SectionCard>
                )}

                {(a.approved_by_name || a.override_by_name) && (
                  <SectionCard title="Persetujuan" icon={<CheckCircle2 size={13} />} accent="#15803D" last>
                    <div className="mh-ad-kv">
                      {a.approved_by_name && <KV label="Disetujui oleh" value={a.approved_by_name} />}
                      {a.approved_at && <KV label="Tanggal" value={new Date(a.approved_at).toLocaleString("id-ID")} />}
                      {a.override_by_name && <KV label="Override oleh" value={a.override_by_name} />}
                    </div>
                  </SectionCard>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {lightbox && (
        <div onClick={(e) => { e.stopPropagation(); setLightbox(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
          <img src={lightbox} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 10 }} />
        </div>
      )}

      {confirmDelete && (
        <DeleteConfirm
          eventName={a?.event_name}
          deleting={deleting}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

// Konfirmasi hapus - user harus ketik persis "HAPUS" sebelum tombol Hapus
// aktif, supaya tidak ada penghapusan permanen yang kepencet tidak sengaja.
function DeleteConfirm({ eventName, deleting, onCancel, onConfirm }) {
  const [text, setText] = useState("");
  const ready = text.trim().toUpperCase() === "HAPUS";
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 220, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 18, padding: 24, boxShadow: "0 24px 64px rgba(13,17,23,0.3)" }}>
        <div style={{ fontSize: 15.5, fontWeight: 800, color: T.hi, marginBottom: 6 }}>Hapus Activity Plan?</div>
        <div style={{ fontSize: 12.5, color: T.mid, lineHeight: 1.55, marginBottom: 14 }}>
          Tindakan ini permanen dan tidak bisa dibatalkan{eventName ? <> untuk <b>{eventName}</b></> : ""}. Ketik <b>HAPUS</b> untuk konfirmasi.
        </div>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ketik HAPUS"
          autoFocus
          style={{ width: "100%", padding: "10px 13px", borderRadius: 10, border: `1px solid ${T.line}`, fontSize: 13, fontFamily: FONT, marginBottom: 14 }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} disabled={deleting} style={{ ...btn }}>Batal</button>
          <button onClick={onConfirm} disabled={!ready || deleting}
            style={{ ...btn, background: ready ? T.error : "#F0F2F5", color: ready ? "#fff" : T.lo, border: "none", cursor: ready && !deleting ? "pointer" : "default" }}>
            {deleting ? "Menghapus…" : "Hapus Permanen"}
          </button>
        </div>
      </div>
    </div>
  );
}

function planDateLabel(a) {
  if (a.plan_dates_multi) {
    const parts = a.plan_dates_multi.split(",").filter(Boolean);
    return `${parts.length} tanggal (${fmtDate(parts[0])}${parts.length > 1 ? ` – ${fmtDate(parts[parts.length - 1])}` : ""})`;
  }
  if (a.plan_date_start && a.plan_date_end) return `${fmtDate(a.plan_date_start)} – ${fmtDate(a.plan_date_end)}`;
  return fmtDate(a.plan_date);
}

// Kartu section putih rounded ber-aksen warna - pola PERSIS SectionCard di
// mobile Activity Detail (icon chip 26x26 tint 10% + judul uppercase kecil),
// dgn sedikit lebih banyak padding krn ruang desktop lebih lega.
function SectionCard({ title, icon, accent = "#5A5A68", children, last }) {
  return (
    <div style={{
      marginBottom: last ? 0 : 18, background: "#FFFFFF", border: "1px solid #EDEDF1", borderRadius: 20, padding: "18px 20px",
      boxShadow: "0 6px 18px rgba(17,17,20,0.05), 0 1px 3px rgba(17,17,20,0.03)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ flexShrink: 0, width: 27, height: 27, borderRadius: 9, background: `${accent}1A`, color: accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {icon}
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.3, color: "#3A3A44" }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function KV({ label, value, valueColor }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, padding: "6px 0", borderBottom: "1px dashed #F0F0F3" }}>
      <span style={{ fontSize: 12, color: "#8A8A96", fontWeight: 600, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: valueColor || "#17181C", textAlign: "right" }}>{value}</span>
    </div>
  );
}

function SiteRow({ label, siteId, siteName }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F8F8FA", border: "1px solid #EFEFF2", borderRadius: 13, padding: "9px 11px" }}>
      <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 800, borderRadius: 7, padding: "4px 9px", color: "#7C3AED", background: "rgba(124,58,237,0.12)" }}>{label}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>{siteId}</div>
        {siteName && <div style={{ marginTop: 1, fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>{siteName}</div>}
      </div>
    </div>
  );
}

// Tile Target vs Actual - senada MetricTile mobile (label kecil, target vs
// actual berdampingan, aksen warna tipis di ikon). `single` dipakai utk
// tile yang cuma punya satu nilai (Cost Ratio) tanpa kolom Target/Actual.
function MetricTile({ accent, label, target, actual, money, single }) {
  return (
    <div style={{ background: "#F8F8FA", border: "1px solid #EFEFF2", borderRadius: 14, padding: "12px 13px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: accent, flexShrink: 0 }} />
        <span style={{ fontSize: 10.5, fontWeight: 800, color: "#8A8A96", textTransform: "uppercase", letterSpacing: 0.2 }}>{label}</span>
      </div>
      {single ? (
        <div style={{ fontSize: money ? 14 : 16, fontWeight: 800, color: "#17181C", fontVariantNumeric: "tabular-nums" }}>{target}</div>
      ) : (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 9.5, color: "#B0B0BA", fontWeight: 700 }}>Target</div>
            <div style={{ fontSize: money ? 13 : 15, fontWeight: 700, color: "#5A5A68", fontVariantNumeric: "tabular-nums" }}>{target}</div>
          </div>
          <div style={{ width: 1, alignSelf: "stretch", background: "#E9E9EF" }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 9.5, color: "#B0B0BA", fontWeight: 700 }}>Actual</div>
            <div style={{ fontSize: money ? 13 : 15, fontWeight: 800, color: "#17181C", fontVariantNumeric: "tabular-nums" }}>{actual}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function MsisdnGroup({ label, list }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: "#B0B0BA", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 7 }}>{label}</div>
      {list.map((e) => (
        <div key={e.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #F7F7F9" }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C", fontVariantNumeric: "tabular-nums" }}>{e.msisdn}</span>
          <ValidationBadge status={e.validation_status} />
        </div>
      ))}
    </div>
  );
}

function ValidationBadge({ status }) {
  const map = {
    valid: { label: "Valid", color: "#15803D", bg: "rgba(21,128,61,0.10)" },
    pending: { label: "Menunggu Validasi", color: "#B45309", bg: "rgba(180,83,9,0.10)" },
    invalid: { label: "Tidak Valid", color: "#DC2626", bg: "rgba(220,38,38,0.10)" },
    duplicate: { label: "Duplikat", color: "#DC2626", bg: "rgba(220,38,38,0.10)" },
  };
  const m = map[status] || { label: status || "-", color: "#6B7280", bg: "rgba(107,114,128,0.10)" };
  return <span style={{ fontSize: 9.5, fontWeight: 800, padding: "3px 8px", borderRadius: 999, color: m.color, background: m.bg, whiteSpace: "nowrap" }}>{m.label}</span>;
}

function EditReqBadge({ status }) {
  const map = {
    pending: { label: "Menunggu", color: "#B45309", bg: "rgba(180,83,9,0.10)", icon: <Clock size={10} /> },
    approved: { label: "Disetujui", color: "#15803D", bg: "rgba(21,128,61,0.10)", icon: <CheckCircle2 size={10} /> },
    rejected: { label: "Ditolak", color: "#DC2626", bg: "rgba(220,38,38,0.10)", icon: <XCircle size={10} /> },
  };
  const m = map[status] || { label: status || "-", color: "#6B7280", bg: "rgba(107,114,128,0.10)", icon: null };
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9.5, fontWeight: 800, padding: "3px 8px", borderRadius: 999, color: m.color, background: m.bg }}>
      {m.icon} {m.label}
    </span>
  );
}
