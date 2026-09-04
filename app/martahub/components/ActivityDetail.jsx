"use client";
// Modal detail Activity Plan - dipakai bersama oleh Activity Plan (klik baris
// tabel) dan Calendar (klik event di kalender), supaya keduanya menampilkan
// detail yang PERSIS SAMA, bukan versi ringkas terpisah yang gampang beda.
// Self-contained: helper kecil (format, status, brand badge) sengaja
// diduplikasi ringan di sini alih-alih diimpor dari activities/page.jsx,
// supaya file ini tidak bergantung pada internal halaman lain.
import { useState, useEffect } from "react";
import { X, MapPin, Image as ImageIcon, Phone, FileText, Layers, Info, Target as TargetIcon, CheckCircle2 } from "lucide-react";
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
      return ["Terlambat Lapor", T.error, T.errorBg];
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

export function BrandBadge({ brand }) {
  if (!brand) return <span style={{ color: T.lo }}>-</span>;
  const isTri = String(brand).toLowerCase() === "tri";
  const bg = isTri ? "#E6007E" : "#FFC700";
  const fg = isTri ? "#fff" : "#1A1300";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", fontSize: 10.5, fontWeight: 800,
      color: fg, background: bg, padding: "3px 9px", borderRadius: 7, letterSpacing: "0.02em",
    }}>
      {brandLabel(brand)}
    </span>
  );
}

const PHOTO_BUCKET = "mh-photos";
function photoUrl(path) {
  return supabaseMarta.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

export const DETAIL_COLS = "id,event_name,event_category,event_categories,brand,mc,branch_id,site_id,plan_date,plan_date_start,plan_date_end,plan_dates_multi,is_all_day,start_time,end_time,poi_type,network_category,area_potential,address,latitude,longitude,status,target_sp,target_fwa,target_rebuy_pulsa,target_rebuy_data,target_rev_3m,cost_estimate,expected_outcome,actual_sp,actual_fwa,actual_rebuy_pulsa,actual_rebuy_data,actual_rev_3m,cost_actual,insight,checkin_valid,checkin_distance,checkin_at,approved_by_name,approved_by_email,approved_at,approval_notes,validation_status,validation_note,validated_at,override_status,override_by_name,override_at,override_note,created_at";

const badge = (txt, c, bg) => <span style={{ fontSize: 10.5, fontWeight: 800, color: c, background: bg, border: `1px solid ${c}33`, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>{txt}</span>;
const btn = { padding: "8px 13px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 };

// SPM Sumatera bisa menghapus Activity Plan langsung dari modal detail ini,
// dengan konfirmasi ketik "HAPUS" (lihat DeleteConfirm di bawah) supaya tidak
// kepencet tidak sengaja - aksi ini permanen (hard delete row mh_activities).
export function ActivityDetailModal({ id, onClose, canDelete, onDeleted, email }) {
  const [a, setA] = useState(null);
  const [extraSites, setExtraSites] = useState([]);
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
    setA(null); setErr(""); setPhotos([]); setEntries([]); setEditReqs([]); setExtraSites([]); setSiteNames({}); setBranchName(null);
    (async () => {
      try {
        const [{ data: act, error: e1 }, { data: sites }, { data: docs }, { data: sales }, { data: edits }] = await Promise.all([
          supabaseMarta.from("mh_activities").select(DETAIL_COLS).eq("id", id).single(),
          supabaseMarta.from("mh_activity_sites").select("site_id, is_primary").eq("activity_id", id).eq("is_primary", false),
          supabaseMarta.from("mh_documents").select("id, storage_path, file_type, created_at").eq("activity_id", id).order("created_at"),
          supabaseMarta.from("mh_dsf_sales_entries").select("id, category, msisdn, validation_status").eq("activity_id", id).order("created_at"),
          supabaseMarta.from("mh_activity_edit_requests").select("id, status, reason, requested_by_name, decided_by_name, decision_notes, created_at, decided_at").eq("activity_id", id).order("created_at", { ascending: false }),
        ]);
        if (e1) throw e1;
        if (!alive) return;
        setA(act);
        setExtraSites((sites || []).map((s) => s.site_id));
        setEntries(sales || []);
        setEditReqs(edits || []);
        setPhotos((docs || []).filter((d) => d.file_type === "photo").map((d) => ({ ...d, url: photoUrl(d.storage_path) })));

        const allSiteIds = Array.from(new Set([act?.site_id, ...(sites || []).map((s) => s.site_id)].filter(Boolean)));
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

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: FONT }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 720, maxHeight: "88vh", background: "#fff", borderRadius: 20, border: `1px solid ${T.line}`, boxShadow: "0 24px 64px rgba(13,17,23,0.22)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {!a && !err ? (
          <div style={{ padding: 40, textAlign: "center", color: T.lo }}>Memuat…</div>
        ) : err && !a ? (
          <div style={{ padding: 20 }}>
            <div style={{ padding: "10px 12px", borderRadius: 10, background: T.errorBg, color: T.error, fontSize: 12.5, fontWeight: 600 }}>{err}</div>
            <button onClick={onClose} style={{ ...btn, marginTop: 14 }}>Tutup</button>
          </div>
        ) : (
          <>
            <div style={{ padding: "20px 24px", borderBottom: `1px solid ${T.line}`, background: "#F7F9FC", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                {a.brand && <BrandBadge brand={a.brand} />}
                <div style={{ marginTop: 8, fontSize: 19, fontWeight: 800, color: T.hi, letterSpacing: "-0.01em" }}>{a.event_name || "-"}</div>
                <div style={{ marginTop: 4, fontSize: 11.5, color: T.lo }}>Dibuat {a.created_at ? new Date(a.created_at).toLocaleString("id-ID") : "-"}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: st[1], background: st[2], padding: "5px 12px", borderRadius: 999, whiteSpace: "nowrap" }}>{st[0]}</span>
                {canDelete && (
                  <button onClick={() => setConfirmDelete(true)} title="Hapus Activity Plan"
                    style={{ width: 32, height: 32, borderRadius: 10, border: `1px solid ${T.error}55`, background: T.errorBg, color: T.error, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <TrashIcon />
                  </button>
                )}
                <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, border: "none", background: "#F0F4FA", color: T.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={15} /></button>
              </div>
            </div>

            <div style={{ padding: "18px 24px", overflowY: "auto" }}>
              {err && (
                <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 10, background: T.errorBg, color: T.error, fontSize: 12.5, fontWeight: 600 }}>{err}</div>
              )}
              {categories.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                  {categories.map((c, i) => (
                    <span key={i} style={{ fontSize: 11, fontWeight: 700, color: T.mid, background: "#F0F4FA", borderRadius: 999, padding: "3px 10px" }}>{fmtTag(CAT_LABEL[c] || c)}</span>
                  ))}
                </div>
              )}

              {(a.validation_note || a.override_note || a.approval_notes) && (
                <div style={{ marginBottom: 14, padding: "10px 13px", borderRadius: 10, background: st[2], color: st[1], fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>
                  {a.validation_note || a.override_note || a.approval_notes}
                </div>
              )}

              <DetailSection title="Informasi Plan" icon={<Info size={13} />}>
                <KVGrid>
                  <KV label="Branch" value={branchName || "-"} />
                  <KV label="Micro Cluster" value={a.mc || "-"} />
                  <KV label="Tanggal" value={planDateLabel(a)} />
                  <KV label="Waktu" value={a.is_all_day === false && a.start_time && a.end_time ? `${a.start_time.slice(0, 5)} – ${a.end_time.slice(0, 5)}` : "Seharian"} />
                  <KV label="POI" value={unsnake(a.poi_type)} />
                  <KV label="Kekuatan Sinyal" value={unsnake(a.network_category)} />
                  <KV label="Potensi Area" value={unsnake(a.area_potential)} />
                  {a.address && <KV label="Alamat" value={a.address} span2 />}
                </KVGrid>
              </DetailSection>

              {a.site_id && (
                <DetailSection title={`Site (${extraSites.length + 1})`} icon={<Layers size={13} />}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 12.5, color: T.hi }}><b>Utama:</b> {a.site_id}{siteNames[a.site_id] ? ` · ${siteNames[a.site_id]}` : ""}</div>
                    {extraSites.map((s, i) => (
                      <div key={s} style={{ fontSize: 12.5, color: T.hi }}><b>Site {i + 2}:</b> {s}{siteNames[s] ? ` · ${siteNames[s]}` : ""}</div>
                    ))}
                  </div>
                </DetailSection>
              )}

              <DetailSection title="Target vs Actual" icon={<TargetIcon size={13} />}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead><tr style={{ color: T.lo, textAlign: "left", borderBottom: `1.5px solid ${T.line}` }}>
                      {["Metrik", "Target", "Actual"].map((h) => <th key={h} style={{ padding: "0 10px 8px 0", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      <MetricRow label="SP" target={fmtInt(a.target_sp)} actual={entries.length ? fmtInt(spEntries.filter((e) => e.validation_status === "valid").length) : fmtInt(a.actual_sp)} />
                      <MetricRow label="FWA" target={fmtInt(a.target_fwa)} actual={entries.length ? fmtInt(fwaEntries.filter((e) => e.validation_status === "valid").length) : fmtInt(a.actual_fwa)} />
                      <MetricRow label="Rebuy SP" target={fmtRp(a.target_rebuy_pulsa)} actual={fmtRp(a.actual_rebuy_pulsa)} />
                      <MetricRow label="Rebuy FWA" target={fmtRp(a.target_rebuy_data)} actual={fmtRp(a.actual_rebuy_data)} />
                      <MetricRow label="Estimasi Total Revenue" target={fmtRp(a.target_rev_3m)} actual={fmtRp(a.actual_rev_3m)} />
                      <MetricRow label="Cost" target={fmtRp(a.cost_estimate)} actual={fmtRp(a.cost_actual)} />
                      <MetricRow label="Cost Ratio" target={a.target_rev_3m > 0 ? `${((Number(a.cost_estimate) || 0) / a.target_rev_3m * 100).toFixed(1)}%` : "-"} actual={a.actual_rev_3m > 0 ? `${((Number(a.cost_actual) || 0) / a.actual_rev_3m * 100).toFixed(1)}%` : "-"} />
                    </tbody>
                  </table>
                </div>
                {a.insight && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.line}` }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: T.lo, textTransform: "uppercase", marginBottom: 4 }}>Insight</div>
                    <div style={{ fontSize: 12.5, color: T.hi, lineHeight: 1.55 }}>{a.insight}</div>
                  </div>
                )}
              </DetailSection>

              {a.checkin_at && (
                <DetailSection title="Check In" icon={<MapPin size={13} />}>
                  <KVGrid>
                    <KV label="Status" value={a.checkin_valid ? "Valid (dalam radius)" : "Di luar radius"} valueColor={a.checkin_valid ? T.success : T.error} />
                    {a.checkin_distance != null && <KV label="Jarak" value={`${Math.round(a.checkin_distance)} meter`} />}
                    <KV label="Waktu" value={new Date(a.checkin_at).toLocaleString("id-ID")} span2 />
                  </KVGrid>
                </DetailSection>
              )}

              {photos.length > 0 && (
                <DetailSection title={`Dokumentasi Foto (${photos.length})`} icon={<ImageIcon size={13} />}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                    {photos.map((p) => (
                      <button key={p.id} onClick={() => setLightbox(p.url)}
                        style={{ padding: 0, border: "none", cursor: "pointer", aspectRatio: "1", borderRadius: 10, overflow: "hidden", background: "#F0F4FA" }}>
                        <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </button>
                    ))}
                  </div>
                </DetailSection>
              )}

              {(spEntries.length > 0 || fwaEntries.length > 0) && (
                <DetailSection title="Nomor Terdaftar" icon={<Phone size={13} />}>
                  {spEntries.length > 0 && <MsisdnList label={`SP (${spEntries.length})`} list={spEntries} />}
                  {fwaEntries.length > 0 && <MsisdnList label={`FWA (${fwaEntries.length})`} list={fwaEntries} />}
                </DetailSection>
              )}

              {editReqs.length > 0 && (
                <DetailSection title="Riwayat Pengajuan Revisi" icon={<FileText size={13} />}>
                  {editReqs.map((r) => (
                    <div key={r.id} style={{ padding: "8px 0", borderBottom: `1px solid ${T.line}` }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.hi }}>{r.requested_by_name || "-"}</div>
                        {badge(
                          r.status === "approved" ? "Disetujui" : r.status === "rejected" ? "Ditolak" : "Menunggu",
                          r.status === "approved" ? T.success : r.status === "rejected" ? T.error : T.warning,
                          r.status === "approved" ? T.successBg : r.status === "rejected" ? T.errorBg : T.warningBg
                        )}
                      </div>
                      {r.reason && <div style={{ marginTop: 3, fontSize: 11.5, color: T.lo }}>{r.reason}</div>}
                      <div style={{ marginTop: 3, fontSize: 10.5, color: T.lo }}>{new Date(r.created_at).toLocaleString("id-ID")}</div>
                      {r.decision_notes && (
                        <div style={{ marginTop: 5, fontSize: 11.5, color: T.mid, background: "#F7F9FC", borderRadius: 8, padding: "6px 9px" }}>
                          {r.decided_by_name ? `${r.decided_by_name}: ` : ""}{r.decision_notes}
                        </div>
                      )}
                    </div>
                  ))}
                </DetailSection>
              )}

              {(a.approved_by_name || a.override_by_name) && (
                <DetailSection title="Persetujuan" icon={<CheckCircle2 size={13} />}>
                  <KVGrid>
                    {a.approved_by_name && <KV label="Disetujui oleh" value={a.approved_by_name} />}
                    {a.approved_at && <KV label="Tanggal" value={new Date(a.approved_at).toLocaleString("id-ID")} />}
                    {a.override_by_name && <KV label="Override oleh" value={a.override_by_name} />}
                  </KVGrid>
                </DetailSection>
              )}
            </div>
          </>
        )}
      </div>

      {lightbox && (
        <div onClick={(e) => { e.stopPropagation(); setLightbox(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <img src={lightbox} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
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
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 16, padding: 22, boxShadow: "0 24px 64px rgba(13,17,23,0.3)" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.hi, marginBottom: 6 }}>Hapus Activity Plan?</div>
        <div style={{ fontSize: 12.5, color: T.mid, lineHeight: 1.5, marginBottom: 14 }}>
          Tindakan ini permanen dan tidak bisa dibatalkan{eventName ? <> untuk <b>{eventName}</b></> : ""}. Ketik <b>HAPUS</b> untuk konfirmasi.
        </div>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ketik HAPUS"
          autoFocus
          style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: `1px solid ${T.line}`, fontSize: 13, fontFamily: FONT, marginBottom: 14 }} />
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

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
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

function DetailSection({ title, icon, children }) {
  return (
    <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${T.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 11 }}>
        {icon && (
          <div style={{ width: 20, height: 20, borderRadius: 6, background: T.primaryBg, color: T.primary, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {icon}
          </div>
        )}
        <div style={{ fontSize: 11, fontWeight: 800, color: T.mid, textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function KVGrid({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 24px" }}>{children}</div>;
}

function KV({ label, value, valueColor, span2 }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10,
      gridColumn: span2 ? "1 / -1" : "auto", padding: "6px 0", borderBottom: `1px dashed ${T.line}`,
    }}>
      <span style={{ fontSize: 12, color: T.lo, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: valueColor || T.hi, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function MetricRow({ label, target, actual }) {
  return (
    <tr style={{ borderTop: `1px solid ${T.line}` }}>
      <td style={{ padding: "8px 10px 8px 0", color: T.hi, fontWeight: 600 }}>{label}</td>
      <td style={{ padding: "8px 10px 8px 0", color: T.mid }}>{target}</td>
      <td style={{ padding: "8px 10px 8px 0", color: T.hi, fontWeight: 800 }}>{actual}</td>
    </tr>
  );
}

function MsisdnList({ label, list }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: T.lo, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      {list.map((e) => (
        <div key={e.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${T.line}` }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: T.hi, fontVariantNumeric: "tabular-nums" }}>{e.msisdn}</span>
          {e.validation_status === "valid"
            ? badge("Valid", T.success, T.successBg)
            : e.validation_status === "pending"
              ? badge("Menunggu Validasi", T.warning, T.warningBg)
              : badge(e.validation_status || "-", T.error, T.errorBg)}
        </div>
      ))}
    </div>
  );
}
