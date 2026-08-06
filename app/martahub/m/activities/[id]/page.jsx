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
  CheckCircle2, XCircle, Clock, FileText, ChevronRight, Layers, Trash2, AlertTriangle, Loader2,
} from "lucide-react";
import supabaseMarta from "../../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../../_shared/MobileShell";
import { statusMeta, fmtDate, fmtInt, fmtRp } from "../../_shared/activityUi";
import { deletePlanImpact, deletePlan } from "../../_shared/planData";
import { fetchAuthedPhotoBlobUrl } from "../../_shared/mediaProxy";

const A_COLS = "id,event_name,event_category,event_categories,brand,mc,site_id,plan_date,plan_date_start,plan_date_end,plan_dates_multi,is_all_day,start_time,end_time,poi_type,network_category,area_potential,address,latitude,longitude,status,target_sp,target_fwa,target_rebuy_pulsa,target_rebuy_data,target_rev_3m,cost_estimate,expected_outcome,actual_sp,actual_fwa,actual_rebuy_pulsa,actual_rebuy_data,actual_rev_3m,cost_actual,insight,checkin_valid,checkin_distance,checkin_at,approved_by_name,approved_at,approval_notes,validation_status,validation_note,validated_at,override_status,override_by_name,override_at,override_note,created_at,created_by";

export default function ActivityDetailPage() {
  const { id: activityId } = useParams();
  const router = useRouter();
  const { loading: sessionLoading, userId } = useMartaSession();
  const [a, setA] = useState(null);
  const [extraSites, setExtraSites] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [entries, setEntries] = useState([]);
  const [editReqs, setEditReqs] = useState([]);
  const [err, setErr] = useState("");
  const [lightbox, setLightbox] = useState(null);
  const [deleteSheet, setDeleteSheet] = useState(null); // {impact} | null
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");
  const [confirmText, setConfirmText] = useState("");

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

  async function openDeleteSheet() {
    setDeleteErr(""); setConfirmText(""); setDeleteLoading(true); setDeleteSheet({ impact: null });
    try {
      const impact = await deletePlanImpact(activityId);
      setDeleteSheet({ impact });
    } catch (e) {
      setDeleteErr(e.message || "Gagal memeriksa dampak hapus");
    } finally {
      setDeleteLoading(false);
    }
  }

  async function confirmDelete() {
    setDeleteBusy(true); setDeleteErr("");
    try {
      await deletePlan(activityId);
      router.replace("/martahub/m/activities");
    } catch (e) {
      setDeleteErr(e.message || "Gagal menghapus plan");
      setDeleteBusy(false);
    }
  }

  if (sessionLoading || (!a && !err)) return <MobileShell active="activities"><ShellSpinner /></MobileShell>;

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

  let action = null;
  if (a.status === "revision_needed") action = { label: "Revisi Plan", onTap: () => router.push(`/martahub/m/activities/new?edit=${a.id}`) };
  else if ((a.status === "draft" || a.status === "approved") && a.checkin_valid == null) action = { label: "Check In", onTap: () => router.push(`/martahub/m/activities/${a.id}/checkin`) };
  else if ((a.status === "draft" || a.status === "approved") && a.checkin_valid != null) action = { label: "Isi Laporan Actual", onTap: () => router.push(`/martahub/m/activities/${a.id}/submit`) };
  else if (a.status === "revision_actual") action = { label: "Revisi & Kirim Ulang", onTap: () => router.push(`/martahub/m/activities/${a.id}/submit`) };

  return (
    <MobileShell active="activities">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 100px", fontFamily: FF }}>
        <BackBar router={router} />

        {/* Header */}
        <div style={{ marginTop: 14, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            {a.brand && (
              <span style={{ fontSize: 10.5, fontWeight: 800, color: a.brand.toLowerCase() === "tri" ? "#ED1C24" : "#F97316" }}>
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

        {/* Info card */}
        <SectionCard title="Informasi Plan" icon={<Calendar size={14} />}>
          <RowKV label="Tanggal" value={dateLabel} />
          <RowKV label="Waktu" value={a.is_all_day === false && a.start_time && a.end_time ? `${a.start_time.slice(0, 5)} – ${a.end_time.slice(0, 5)}` : "Seharian"} />
          <RowKV label="Micro Cluster" value={a.mc || "-"} />
          <RowKV label="Site Utama" value={a.site_id || "-"} />
          {extraSites.length > 0 && <RowKV label="Site Tambahan" value={extraSites.join(", ")} />}
          <RowKV label="POI" value={a.poi_type || "-"} />
          <RowKV label="Kekuatan Sinyal" value={a.network_category || "-"} />
          <RowKV label="Potensi Area" value={a.area_potential || "-"} />
          {a.address && <RowKV label="Alamat" value={a.address} />}
        </SectionCard>

        {/* Multi-site */}
        {extraSites.length > 0 && (
          <SectionCard title={`Site (${extraSites.length + 1})`} icon={<Layers size={14} />}>
            <SiteChipRow label="Utama" value={a.site_id} />
            {extraSites.map((s, i) => <SiteChipRow key={s} label={`Site ${i + 2}`} value={s} />)}
          </SectionCard>
        )}

        {/* Target vs Actual */}
        <SectionCard title="Target vs Actual" icon={<CheckCircle2 size={14} />}>
          <MetricRow label="SP" target={fmtInt(a.target_sp)} actual={a.actual_sp == null ? "-" : fmtInt(a.actual_sp)} />
          <MetricRow label="FWA" target={fmtInt(a.target_fwa)} actual={a.actual_fwa == null ? "-" : fmtInt(a.actual_fwa)} />
          <MetricRow label="Rebuy Pulsa" target={fmtRp(a.target_rebuy_pulsa)} actual={a.actual_rebuy_pulsa == null ? "-" : fmtRp(a.actual_rebuy_pulsa)} />
          <MetricRow label="Rebuy Data" target={fmtRp(a.target_rebuy_data)} actual={a.actual_rebuy_data == null ? "-" : fmtRp(a.actual_rebuy_data)} />
          <MetricRow label="Cost" target={fmtRp(a.cost_estimate)} actual={a.cost_actual == null ? "-" : fmtRp(a.cost_actual)} />
          {a.insight && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #F0F0F3" }}>
              <div style={{ fontSize: 10, color: "#B0B0BA", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 }}>Insight</div>
              <div style={{ fontSize: 12.5, color: "#3A3A44", lineHeight: 1.55 }}>{a.insight}</div>
            </div>
          )}
        </SectionCard>

        {/* Check-in info */}
        {a.checkin_at && (
          <SectionCard title="Check In" icon={<MapPin size={14} />}>
            <RowKV label="Status" value={a.checkin_valid ? "Valid (dalam radius)" : "Di luar radius"} valueColor={a.checkin_valid ? "#15803D" : "#DC2626"} />
            {a.checkin_distance != null && <RowKV label="Jarak" value={`${Math.round(a.checkin_distance)} meter`} />}
            <RowKV label="Waktu" value={new Date(a.checkin_at).toLocaleString("id-ID")} />
          </SectionCard>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <SectionCard title={`Dokumentasi Foto (${photos.length})`} icon={<ImageIcon size={14} />}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {photos.map((p) => (
                <button key={p.id} onClick={() => setLightbox(p.url)}
                  style={{ padding: 0, border: "none", cursor: "pointer", aspectRatio: "1", borderRadius: 10, overflow: "hidden", background: "#F0F0F3" }}>
                  <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </button>
              ))}
            </div>
          </SectionCard>
        )}

        {/* MSISDN lists */}
        {(spEntries.length > 0 || fwaEntries.length > 0) && (
          <SectionCard title="Nomor Terdaftar" icon={<Phone size={14} />}>
            {spEntries.length > 0 && <MsisdnGroup label={`SP (${spEntries.length})`} list={spEntries} />}
            {fwaEntries.length > 0 && <MsisdnGroup label={`FWA (${fwaEntries.length})`} list={fwaEntries} />}
          </SectionCard>
        )}

        {/* History */}
        {editReqs.length > 0 && (
          <SectionCard title="Riwayat Pengajuan Revisi" icon={<FileText size={14} />}>
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
          <SectionCard title="Persetujuan" icon={<CheckCircle2 size={14} />}>
            {a.approved_by_name && <RowKV label="Disetujui oleh" value={a.approved_by_name} />}
            {a.approved_at && <RowKV label="Tanggal" value={new Date(a.approved_at).toLocaleString("id-ID")} />}
            {a.override_by_name && <RowKV label="Override oleh" value={a.override_by_name} />}
          </SectionCard>
        )}

        {userId && a.created_by === userId && (
          <button onClick={openDeleteSheet}
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

      {deleteSheet && (
        <div onClick={() => !deleteBusy && setDeleteSheet(null)} style={{ position: "fixed", inset: 0, background: "rgba(23,24,28,0.45)", zIndex: 70, display: "flex", alignItems: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#FFFFFF", borderRadius: "22px 22px 0 0", padding: "10px 22px calc(env(safe-area-inset-bottom,0px) + 22px)", fontFamily: FF }}>
            <div style={{ width: 40, height: 4, borderRadius: 3, background: "#E4E5EA", margin: "6px auto 16px" }} />

            {deleteLoading ? (
              <div style={{ padding: "24px 0" }}><ShellSpinner /></div>
            ) : !deleteSheet.impact ? (
              <div style={{ padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{deleteErr}</div>
            ) : deleteSheet.impact.blocking_installations > 0 ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <AlertTriangle size={20} color="#DC2626" />
                  <div style={{ fontSize: 15.5, fontWeight: 800, color: "#17181C" }}>Tidak Bisa Dihapus</div>
                </div>
                <div style={{ marginTop: 10, fontSize: 12.5, color: "#5A5A68", lineHeight: 1.6 }}>
                  Plan ini masih memiliki {deleteSheet.impact.blocking_installations} instalasi POSMAT terkait. Selesaikan atau pindahkan instalasi tersebut terlebih dahulu sebelum menghapus plan.
                </div>
                <button onClick={() => setDeleteSheet(null)}
                  style={{ width: "100%", marginTop: 16, height: 48, borderRadius: 12, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#17181C", fontSize: 13.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
                  Mengerti
                </button>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <Trash2 size={20} color="#DC2626" />
                  <div style={{ fontSize: 15.5, fontWeight: 800, color: "#17181C" }}>Hapus Plan?</div>
                </div>
                <div style={{ marginTop: 10, fontSize: 12.5, color: "#5A5A68", lineHeight: 1.6 }}>
                  "{deleteSheet.impact.event_name || a.event_name}" akan dihapus permanen beserta data terkait:
                </div>
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {deleteSheet.impact.sales_entries > 0 && <ImpactPill label={`${deleteSheet.impact.sales_entries} nomor MSISDN`} />}
                  {deleteSheet.impact.documents > 0 && <ImpactPill label={`${deleteSheet.impact.documents} dokumen/foto`} />}
                  {deleteSheet.impact.approvals > 0 && <ImpactPill label={`${deleteSheet.impact.approvals} riwayat approval`} />}
                  {deleteSheet.impact.posmat_movements > 0 && <ImpactPill label={`${deleteSheet.impact.posmat_movements} mutasi POSMAT`} />}
                </div>

                {deleteSheet.impact.needs_strong_confirm ? (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 11.5, color: "#8A8A96", fontWeight: 600, marginBottom: 7 }}>
                      Plan ini sudah masuk status <b>{statusMeta(deleteSheet.impact.status).label}</b>. Ketik <b>HAPUS</b> untuk konfirmasi.
                    </div>
                    <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="HAPUS"
                      style={{ width: "100%", height: 44, borderRadius: 11, border: "1px solid #E4E5EA", padding: "0 13px", fontSize: 13.5, fontFamily: FF, outline: "none" }} />
                  </div>
                ) : null}

                {deleteErr && (
                  <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{deleteErr}</div>
                )}

                <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
                  <button onClick={() => setDeleteSheet(null)} disabled={deleteBusy}
                    style={{ flex: 1, height: 48, borderRadius: 12, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 13.5, fontWeight: 700, fontFamily: FF, cursor: deleteBusy ? "default" : "pointer" }}>
                    Batal
                  </button>
                  <button onClick={confirmDelete}
                    disabled={deleteBusy || (deleteSheet.impact.needs_strong_confirm && confirmText.trim().toUpperCase() !== "HAPUS")}
                    style={{
                      flex: 1.3, height: 48, borderRadius: 12, border: "none", cursor: "pointer", color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF,
                      background: (deleteBusy || (deleteSheet.impact.needs_strong_confirm && confirmText.trim().toUpperCase() !== "HAPUS")) ? "#D8D9E0" : "#DC2626",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                    }}>
                    {deleteBusy ? <Loader2 size={15} style={{ animation: "mspin .85s linear infinite" }} /> : <Trash2 size={15} />}
                    Hapus
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </MobileShell>
  );
}

function ImpactPill({ label }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, color: "#5A5A68", background: "#F0F0F3", borderRadius: 999, padding: "5px 10px" }}>{label}</span>
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

function SectionCard({ title, icon, children }) {
  return (
    <div style={{ marginTop: 14, background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 16, padding: "14px 15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, color: "#5A5A68" }}>
        {icon}
        <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.3 }}>{title}</div>
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

function SiteChipRow({ label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 0" }}>
      <span style={{ fontSize: 9.5, fontWeight: 800, color: "#fff", background: "#9A9AA6", borderRadius: 6, padding: "3px 7px" }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C" }}>{value}</span>
    </div>
  );
}

function MetricRow({ label, target, actual }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #F7F7F9" }}>
      <div style={{ fontSize: 12, color: "#8A8A96", fontWeight: 600 }}>{label}</div>
      <div style={{ display: "flex", gap: 14 }}>
        <div style={{ fontSize: 12, color: "#B0B0BA", fontWeight: 600 }}>Target {target}</div>
        <div style={{ fontSize: 12.5, color: "#17181C", fontWeight: 800 }}>{actual}</div>
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
    pending: { label: "Menunggu", color: "#B45309", bg: "rgba(180,83,9,0.10)" },
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
