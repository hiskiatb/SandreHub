"use client";
/**
 * /martahub/m/activities/[id] - Halaman Detail Aktivitas penuh (web mobile).
 * Padanan `plan_detail_screen.dart` di Flutter: ringkasan plan, target vs
 * actual, galeri foto dokumentasi, daftar MSISDN per kategori, riwayat
 * approval/validasi/edit-request, dan multi-site.
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, MapPin, Calendar, Tag, Image as ImageIcon, Phone,
  CheckCircle2, XCircle, Clock, FileText, ChevronRight, Layers, Trash2,
  CardSim, Router, Wallet, SignalHigh, Receipt,
} from "lucide-react";
import supabaseMarta from "../../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../../_shared/MobileShell";
import { statusMeta, fmtDate, fmtInt, fmtRp, isDraftIncomplete } from "../../_shared/activityUi";
import { fetchAuthedPhotoBlobUrl } from "../../_shared/mediaProxy";
import DeleteActivitySheet from "../../_shared/DeleteActivitySheet";

const A_COLS = "id,event_name,event_category,event_categories,brand,mc,site_id,plan_date,plan_date_start,plan_date_end,plan_dates_multi,is_all_day,start_time,end_time,poi_type,network_category,area_potential,address,latitude,longitude,status,target_sp,target_fwa,target_rebuy_pulsa,target_rebuy_data,target_rev_3m,cost_estimate,expected_outcome,actual_sp,actual_fwa,actual_rebuy_pulsa,actual_rebuy_data,actual_rev_3m,cost_actual,insight,checkin_valid,checkin_distance,checkin_at,approved_by_name,approved_at,approval_notes,validation_status,validation_note,validated_at,override_status,override_by_name,override_at,override_note,created_at,created_by";

// Sama seperti syarat "siap diajukan" step Info + Lokasi di wizard Create
// Plan (new/page.jsx validateStep) - dipakai utk deteksi draft yang masih
// bolong (MC/site/POI/dst. belum diisi) supaya langsung dilempar ke wizard
// alih-alih ditampilkan sbg halaman detail read-only dulu.
export default function ActivityDetailPage() {
  const { id: activityId } = useParams();
  const router = useRouter();
  const { loading: sessionLoading, userId } = useMartaSession();
  const [a, setA] = useState(null);
  const [extraSites, setExtraSites] = useState([]);
  const [siteNames, setSiteNames] = useState({}); // site_id -> site_name (mh_sites), utk label di list gabungan
  const [photos, setPhotos] = useState([]);
  const [entries, setEntries] = useState([]);
  const [editReqs, setEditReqs] = useState([]);
  const [err, setErr] = useState("");
  const [lightbox, setLightbox] = useState(null);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);

  useEffect(() => {
    if (sessionLoading || !activityId) return;
    let alive = true;
    (async () => {
      try {
        const [{ data: act, error: e1 }, { data: sites }, { data: docs }, { data: sales }, { data: edits }] = await Promise.all([
          supabaseMarta.from("mh_activities").select(A_COLS).eq("id", activityId).single(),
          supabaseMarta.from("mh_activity_sites").select("site_id, is_primary").eq("activity_id", activityId).eq("is_primary", false),
          supabaseMarta.from("mh_documents").select("id, storage_path, file_type, created_at").eq("activity_id", activityId).order("created_at"),
          supabaseMarta.from("mh_dsf_sales_entries").select("id, category, msisdn, imei, validation_status, product_type_id").eq("activity_id", activityId).order("created_at"),
          supabaseMarta.from("mh_activity_edit_requests").select("id, status, reason, requested_by_name, decided_by_name, decision_notes, created_at, decided_at").eq("activity_id", activityId).order("created_at", { ascending: false }),
        ]);
        if (e1) throw e1;
        if (!alive) return;
        setA(act);
        setExtraSites((sites || []).map((s) => s.site_id));
        setEntries(sales || []);
        setEditReqs(edits || []);

        // Nama site (bukan cuma kode) - dipakai di list gabungan Site Utama +
        // Site Tambahan, biar bukan teks kode doang.
        const allSiteIds = Array.from(new Set([act?.site_id, ...(sites || []).map((s) => s.site_id)].filter(Boolean)));
        if (allSiteIds.length > 0) {
          const { data: siteRows } = await supabaseMarta.from("mh_sites").select("site_id,site_name").in("site_id", allSiteIds);
          const map = {};
          (siteRows || []).forEach((s) => { map[s.site_id] = s.site_name; });
          if (alive) setSiteNames(map);
        }

        const photoDocs = (docs || []).filter((d) => d.file_type === "photo");
        if (photoDocs.length) {
          // Lewat proxy media-view (Google Drive kalau sudah dimirror, fallback
          // Storage kalau belum) - browser tidak pernah lihat link Drive-nya.
          const withUrls = await Promise.all(
            photoDocs.map(async (d) => {
              try {
                const url = await fetchAuthedPhotoBlobUrl("document", d.id);
                return { ...d, url };
              } catch {
                return { ...d, url: null };
              }
            })
          );
          if (alive) setPhotos(withUrls.filter((p) => p.url));
        }
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat detail aktivitas");
      }
    })();
    return () => { alive = false; };
  }, [sessionLoading, activityId]);

  // Draft yang PUNYA SENDIRI & belum lengkap - jangan tampilkan halaman
  // detail read-only ini dulu (cuma bikin ekstra tap "Lanjutkan Plan" utk
  // sampai ke wizard), langsung lempar ke wizard edit supaya lanjut mengisi
  // dari step yang masih kurang. Dibatasi HANYA punya sendiri (`created_by
  // === userId`) - draft orang lain yang sedang ditinjau (mis. TMV lihat
  // draft BME dari Approval/Calendar) TETAP tampil sbg halaman detail biasa,
  // jangan dilempar paksa ke form edit yang bukan miliknya.
  const [redirectingToEdit, setRedirectingToEdit] = useState(false);
  useEffect(() => {
    if (!a || !userId || a.created_by !== userId || a.status !== "draft") return;
    if (isDraftIncomplete(a)) {
      setRedirectingToEdit(true);
      router.replace(`/martahub/m/activities/new?edit=${activityId}`);
    }
  }, [a, userId, activityId, router]);

  if (sessionLoading || (!a && !err) || redirectingToEdit) return <MobileShell active="activities"><ShellSpinner /></MobileShell>;

  if (err) {
    return (
      <MobileShell active="activities">
        <div style={{ padding: 20 }}>
          <BackBar router={router} />
          <div style={{ marginTop: 16, padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>
        </div>
      </MobileShell>
    );
  }

  const meta = statusMeta(a.status);
  const categories = Array.isArray(a.event_categories) && a.event_categories.length ? a.event_categories : (a.event_category ? [a.event_category] : []);
  const dateLabel = planDateLabel(a);
  const spEntries = entries.filter((e) => e.category === "sp");
  const fwaEntries = entries.filter((e) => e.category === "fwa");
  // "Aktual" yg ditampilkan HANYA nomor yg sudah tervalidasi (validation_status
  // === 'valid') - nomor yg masih "menunggu validasi" belum dihitung ke
  // target actual, tapi tetap kelihatan statusnya (bukan hilang begitu saja).
  const spValid = spEntries.filter((e) => e.validation_status === "valid").length;
  const spPending = spEntries.filter((e) => e.validation_status === "pending").length;
  const fwaValid = fwaEntries.filter((e) => e.validation_status === "valid").length;
  const fwaPending = fwaEntries.filter((e) => e.validation_status === "pending").length;

  // Draft = belum diajukan/disetujui TMV - BELUM boleh langsung Check In
  // (sebelumnya disamakan dgn "approved", jadi plan yang masih draft bisa
  // check-in padahal belum tentu lengkap/disetujui). Aksi utama draft
  // sekarang melengkapi & mengajukan plan lewat wizard edit yang sama.
  let action = null;
  if (a.status === "revision_needed") action = { label: "Revisi Plan", onTap: () => router.push(`/martahub/m/activities/new?edit=${a.id}`) };
  else if (a.status === "draft") action = { label: "Lanjutkan Plan", onTap: () => router.push(`/martahub/m/activities/new?edit=${a.id}`) };
  else if (a.status === "approved" && a.checkin_valid == null) action = { label: "Check In", onTap: () => router.push(`/martahub/m/activities/${a.id}/checkin`) };
  else if (a.status === "approved" && a.checkin_valid != null) action = { label: "Isi Laporan Actual", onTap: () => router.push(`/martahub/m/activities/${a.id}/submit`) };
  else if (a.status === "revision_actual") action = { label: "Revisi & Kirim Ulang", onTap: () => router.push(`/martahub/m/activities/${a.id}/submit`) };

  return (
    <MobileShell active="activities">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 100px", fontFamily: FF }}>
        <BackBar router={router} />

        {/* Header */}
        <div style={{ marginTop: 14, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            {a.brand && (
              <span style={{ fontSize: 10.5, fontWeight: 800, color: a.brand.toLowerCase() === "tri" ? "#E23B86" : "#E53935" }}>
                {a.brand.toLowerCase() === "tri" ? "3ID" : "IM3"}
              </span>
            )}
            <div style={{ marginTop: 3, fontSize: 18, fontWeight: 800, color: "#17181C", lineHeight: 1.25 }}>{a.event_name || "-"}</div>
          </div>
          <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, padding: "6px 11px", borderRadius: 999, color: meta.color, background: meta.bg, whiteSpace: "nowrap" }}>{meta.label}</span>
        </div>

        {categories.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {categories.map((c, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "#5A5A68", background: "#F0F0F3", borderRadius: 999, padding: "4px 10px" }}>
                <Tag size={11} /> {c}
              </span>
            ))}
          </div>
        )}

        {(a.validation_note || a.override_note || a.approval_notes) && (
          <div style={{ marginTop: 14, padding: "11px 13px", borderRadius: 12, background: meta.bg, color: meta.color, fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>
            {a.validation_note || a.override_note || a.approval_notes}
          </div>
        )}

        {/* Info card - site TIDAK lagi disebut di sini sbg teks (Site
            Utama/Site Tambahan terpisah) - semua site sekarang satu list
            gabungan di section "Site" di bawah, lengkap dgn labelnya. */}
        <SectionCard title="Informasi Plan" icon={<Calendar size={13} />} accent="#2563EB">
          <RowKV label="Tanggal" value={dateLabel} />
          <RowKV label="Waktu" value={a.is_all_day === false && a.start_time && a.end_time ? `${a.start_time.slice(0, 5)} – ${a.end_time.slice(0, 5)}` : "Seharian"} />
          <RowKV label="Micro Cluster" value={a.mc || "-"} />
          <RowKV label="POI" value={a.poi_type || "-"} />
          <RowKV label="Kekuatan Sinyal" value={a.network_category || "-"} />
          <RowKV label="Potensi Area" value={a.area_potential || "-"} />
          {a.address && <RowKV label="Alamat" value={a.address} />}
        </SectionCard>

        {/* Site - satu list gabungan (Utama + Tambahan sekaligus), tiap
            baris berupa kartu dgn badge label + nama site, bukan cuma
            teks kode yg digabung koma spt sebelumnya. */}
        {a.site_id && (
          <SectionCard title={`Site (${extraSites.length + 1})`} icon={<Layers size={13} />} accent="#7C3AED">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <SiteCard label="Utama" siteId={a.site_id} siteName={siteNames[a.site_id]} primary />
              {extraSites.map((s, i) => <SiteCard key={s} label={`Site ${i + 2}`} siteId={s} siteName={siteNames[s]} />)}
            </div>
          </SectionCard>
        )}

        {/* Target vs Actual - grid tile berikon, senada dgn report tile di
            halaman Laporan Actual (CardSim/Router/Wallet/SignalHigh/Receipt) */}
        <SectionCard title="Target vs Actual" icon={<CheckCircle2 size={13} />} accent="#15803D">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <MetricTile icon={CardSim} accent="#DB2777" label="SP" target={fmtInt(a.target_sp)} actual={entries.length ? fmtInt(spValid) : (a.actual_sp == null ? "-" : fmtInt(a.actual_sp))} pending={spPending} />
            <MetricTile icon={Router} accent="#2563EB" label="FWA" target={fmtInt(a.target_fwa)} actual={entries.length ? fmtInt(fwaValid) : (a.actual_fwa == null ? "-" : fmtInt(a.actual_fwa))} pending={fwaPending} />
            <MetricTile icon={Wallet} accent="#B45309" label="Rebuy Pulsa" target={fmtRp(a.target_rebuy_pulsa)} actual={a.actual_rebuy_pulsa == null ? "-" : fmtRp(a.actual_rebuy_pulsa)} />
            <MetricTile icon={SignalHigh} accent="#0D9488" label="Rebuy Data" target={fmtRp(a.target_rebuy_data)} actual={a.actual_rebuy_data == null ? "-" : fmtRp(a.actual_rebuy_data)} />
            <div style={{ gridColumn: "1 / -1" }}>
              <MetricTile icon={Receipt} accent="#7C3AED" label="Cost" target={fmtRp(a.cost_estimate)} actual={a.cost_actual == null ? "-" : fmtRp(a.cost_actual)} />
            </div>
          </div>
          {a.insight && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #F0F0F3" }}>
              <div style={{ fontSize: 10, color: "#B0B0BA", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 }}>Insight</div>
              <div style={{ fontSize: 12.5, color: "#3A3A44", lineHeight: 1.55 }}>{a.insight}</div>
            </div>
          )}
        </SectionCard>

        {/* Check-in info */}
        {a.checkin_at && (
          <SectionCard title="Check In" icon={<MapPin size={13} />} accent="#EA580C">
            <RowKV label="Status" value={a.checkin_valid ? "Valid (dalam radius)" : "Di luar radius"} valueColor={a.checkin_valid ? "#15803D" : "#DC2626"} />
            {a.checkin_distance != null && <RowKV label="Jarak" value={`${Math.round(a.checkin_distance)} meter`} />}
            <RowKV label="Waktu" value={new Date(a.checkin_at).toLocaleString("id-ID")} />
          </SectionCard>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <SectionCard title={`Dokumentasi Foto (${photos.length})`} icon={<ImageIcon size={13} />} accent="#DB2777">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {photos.map((p) => (
                <button key={p.id} onClick={() => setLightbox(p.url)}
                  style={{ padding: 0, border: "none", cursor: "pointer", aspectRatio: "1", borderRadius: 12, overflow: "hidden", background: "#F0F0F3" }}>
                  <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </button>
              ))}
            </div>
          </SectionCard>
        )}

        {/* MSISDN lists */}
        {(spEntries.length > 0 || fwaEntries.length > 0) && (
          <SectionCard title="Nomor Terdaftar" icon={<Phone size={13} />} accent="#0D9488">
            {spEntries.length > 0 && <MsisdnGroup label={`SP (${spEntries.length})`} list={spEntries} />}
            {fwaEntries.length > 0 && <MsisdnGroup label={`FWA (${fwaEntries.length})`} list={fwaEntries} />}
          </SectionCard>
        )}

        {/* History */}
        {editReqs.length > 0 && (
          <SectionCard title="Riwayat Pengajuan Revisi" icon={<FileText size={13} />} accent="#6B7280">
            {editReqs.map((r) => (
              <div key={r.id} style={{ padding: "9px 0", borderBottom: "1px solid #F0F0F3" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#17181C" }}>{r.requested_by_name || "-"}</div>
                  <EditReqBadge status={r.status} />
                </div>
                {r.reason && <div style={{ marginTop: 3, fontSize: 11.5, color: "#8A8A96" }}>{r.reason}</div>}
                <div style={{ marginTop: 3, fontSize: 10.5, color: "#B0B0BA" }}>{new Date(r.created_at).toLocaleString("id-ID")}</div>
                {r.decision_notes && (
                  <div style={{ marginTop: 5, fontSize: 11.5, color: "#5A5A68", background: "#F7F7F9", borderRadius: 8, padding: "6px 9px" }}>
                    {r.decided_by_name ? `${r.decided_by_name}: ` : ""}{r.decision_notes}
                  </div>
                )}
              </div>
            ))}
          </SectionCard>
        )}

        {(a.approved_by_name || a.override_by_name) && (
          <SectionCard title="Persetujuan" icon={<CheckCircle2 size={13} />} accent="#15803D">
            {a.approved_by_name && <RowKV label="Disetujui oleh" value={a.approved_by_name} />}
            {a.approved_at && <RowKV label="Tanggal" value={new Date(a.approved_at).toLocaleString("id-ID")} />}
            {a.override_by_name && <RowKV label="Override oleh" value={a.override_by_name} />}
          </SectionCard>
        )}

        {userId && a.created_by === userId && (
          <button onClick={() => setShowDeleteSheet(true)}
            style={{ width: "100%", marginTop: 14, height: 46, borderRadius: 13, border: "1px solid #F7C6C9", background: "#FFF5F6", color: "#DC2626", fontSize: 12.5, fontWeight: 800, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Trash2 size={15} /> Hapus Plan
          </button>
        )}
      </div>

      {action && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 66, zIndex: 45, background: "linear-gradient(180deg,rgba(244,245,247,0) 0%,#F4F5F7 30%)", padding: "16px 0 0" }}>
          <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 20px calc(env(safe-area-inset-bottom,0px) + 10px)" }}>
            <button onClick={action.onTap}
              style={{ width: "100%", height: 50, borderRadius: 14, border: "none", cursor: "pointer", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 14px rgba(17,17,20,0.11)" }}>
              {action.label} <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <img src={lightbox} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
        </div>
      )}

      {showDeleteSheet && (
        <DeleteActivitySheet
          activityId={activityId}
          activityName={a.event_name}
          onClose={() => setShowDeleteSheet(false)}
          onDeleted={() => router.replace("/martahub/m/activities")}
        />
      )}
    </MobileShell>
  );
}

function BackBar({ router }) {
  return (
    <button onClick={() => router.back()}
      style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
      <ArrowLeft size={16} /> Kembali
    </button>
  );
}

function SectionCard({ title, icon, accent = "#5A5A68", children }) {
  return (
    <div style={{
      marginTop: 14, background: "#FFFFFF", border: "1px solid #EDEDF1", borderRadius: 20, padding: "16px",
      boxShadow: "0 6px 16px rgba(17,17,20,0.05), 0 1px 3px rgba(17,17,20,0.03)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
        <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 9, background: `${accent}1A`, color: accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {icon}
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.3, color: "#3A3A44" }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function RowKV({ label, value, valueColor }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "5px 0" }}>
      <div style={{ fontSize: 12, color: "#8A8A96", fontWeight: 600, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: valueColor || "#17181C", fontWeight: 700, textAlign: "right" }}>{value}</div>
    </div>
  );
}

/** Satu baris = satu kartu site (bukan teks polos) - badge label (Utama/
 * Site N) + kode site + nama site (kalau ada di `mh_sites`). */
function SiteCard({ label, siteId, siteName, primary }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F8F8FA", border: "1px solid #EFEFF2", borderRadius: 13, padding: "9px 11px" }}>
      <span style={{
        flexShrink: 0, fontSize: 9.5, fontWeight: 800, borderRadius: 7, padding: "4px 9px",
        color: primary ? "#fff" : "#7C3AED",
        background: primary ? "#7C3AED" : "rgba(124,58,237,0.12)",
      }}>{label}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>{siteId}</div>
        {siteName && <div style={{ marginTop: 1, fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>{siteName}</div>}
      </div>
    </div>
  );
}

/** Tile target vs actual - senada dgn ReportTile di halaman Laporan Actual
 * (icon chip berwarna + label + target muted + actual tebal). */
function MetricTile({ icon: Icon, accent, label, target, actual, pending }) {
  return (
    <div style={{ borderRadius: 14, background: "#F8F8FA", border: "1px solid #EFEFF2", padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 9, background: `${accent}1A`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={14} color={accent} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: "#B0B0BA" }}>{label} · Target {target}</div>
        <div style={{ marginTop: 1, fontSize: 14, fontWeight: 800, color: "#17181C" }}>{actual}</div>
        {/* Nomor yg masih menunggu validasi TIDAK ikut dihitung ke actual di
            atas, tapi tetap disebut di sini supaya tidak "hilang" begitu
            saja dari mata pengguna. */}
        {pending > 0 && (
          <div style={{ marginTop: 1, fontSize: 9.5, fontWeight: 700, color: "#B45309" }}>+{pending} menunggu validasi</div>
        )}
      </div>
    </div>
  );
}

function MsisdnGroup({ label, list }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: "#B0B0BA", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6 }}>{label}</div>
      {list.map((e) => (
        <div key={e.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #F7F7F9" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C", fontVariantNumeric: "tabular-nums" }}>{e.msisdn}</div>
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
  return <span style={{ fontSize: 9.5, fontWeight: 800, padding: "3px 8px", borderRadius: 999, color: m.color, background: m.bg }}>{m.label}</span>;
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

function planDateLabel(a) {
  if (a.plan_dates_multi) {
    const parts = a.plan_dates_multi.split(",").filter(Boolean);
    return `${parts.length} tanggal (${fmtDate(parts[0])}${parts.length > 1 ? ` – ${fmtDate(parts[parts.length - 1])}` : ""})`;
  }
  if (a.plan_date_start && a.plan_date_end) return `${fmtDate(a.plan_date_start)} – ${fmtDate(a.plan_date_end)}`;
  return fmtDate(a.plan_date);
}
