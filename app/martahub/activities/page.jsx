"use client";
import { useState, useEffect, useCallback } from "react";
import { X, MapPin, Image as ImageIcon, Phone, FileText, Layers } from "lucide-react";
import MartaShell, { T, FONT, brandLabel } from "../components/MartaShell";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";
import { getMartaScope, applyMartaScope } from "../../../lib/martaScope";

const CAT_LABEL = {
  directSelling: "Direct Selling", jointEvent: "Join Event", openBooth: "Open Booth",
  project: "Project", sponsorship: "Sponsorship", thematic: "Thematic",
};
const STATUS = {
  draft: ["Draft", T.mid, "#eef1f6"], submitted: ["Planned", T.blue, T.blueBg],
  approved: ["Disetujui", T.success, T.successBg], rejected: ["Ditolak", T.error, T.errorBg],
  completed: ["Selesai", T.success, T.successBg], inProgress: ["Berlangsung", T.warning, T.warningBg],
  plan_submitted: ["Menunggu Approval", T.blue, T.blueBg], revision_needed: ["Revisi Plan", T.warning, T.warningBg],
  pending_validation: ["Menunggu Validasi", T.blue, T.blueBg], revision_actual: ["Revisi Report", T.warning, T.warningBg],
};

const fmtDate = (s) => {
  if (!s || s.length < 10) return "-";
  const [y, m, d] = s.slice(0, 10).split("-");
  const mo = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"][(+m || 1) - 1];
  return `${d} ${mo} ${y}`;
};
const fmtInt = (n) => (n == null ? "-" : Number(n).toLocaleString("id-ID"));
const fmtRp = (n) => (n == null ? "-" : `Rp${Number(n).toLocaleString("id-ID")}`);

// Bucket foto POSM/aktivitas - SAMA PERSIS dgn pola yg sudah dipakai
// app/martahub/approval/page.jsx (mdPhotoUrl) - bucket publik, jadi cukup
// getPublicUrl langsung tanpa proxy otentikasi spt di mobile.
const PHOTO_BUCKET = "mh-photos";
function photoUrl(path) {
  return supabaseMarta.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

const DETAIL_COLS = "id,event_name,event_category,event_categories,brand,mc,branch_id,site_id,plan_date,plan_date_start,plan_date_end,plan_dates_multi,is_all_day,start_time,end_time,poi_type,network_category,area_potential,address,latitude,longitude,status,target_sp,target_fwa,target_rebuy_pulsa,target_rebuy_data,target_rev_3m,cost_estimate,expected_outcome,actual_sp,actual_fwa,actual_rebuy_pulsa,actual_rebuy_data,actual_rev_3m,cost_actual,insight,checkin_valid,checkin_distance,checkin_at,approved_by_name,approved_by_email,approved_at,approval_notes,validation_status,validation_note,validated_at,override_status,override_by_name,override_at,override_note,created_at";

export default function ActivityPlanPage() {
  return (
    <MartaShell active="activities" title="Activity Plan" subtitle="Rencana kegiatan yang dibuat BME/RGE di lapangan.">
      {(ctx) => <Body email={ctx?.session?.user?.email} />}
    </MartaShell>
  );
}

function Body({ email }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [scope, setScope] = useState(null);
  const [detailId, setDetailId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const sc = email ? await getMartaScope(email) : null;
      setScope(sc);
      let query = supabaseMarta
        .from("mh_activities")
        .select("id, event_name, brand, mc, branch_id, event_categories, plan_date_start, plan_date, site_id, network_category, area_potential, status, checkin_valid, created_at, approved_by_name, approved_by_email")
        .order("created_at", { ascending: false })
        .limit(500);
      query = await applyMartaScope(query, sc);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      setRows(data || []);
    } catch (e) { setErr(e.message || "Gagal memuat"); }
    finally { setLoading(false); }
  }, [email]);
  useEffect(() => { load(); }, [load]);

  const term = q.trim().toLowerCase();
  const view = rows.filter((r) => !term ||
    (r.event_name || "").toLowerCase().includes(term) ||
    (r.mc || "").toLowerCase().includes(term) ||
    (r.site_id || "").toLowerCase().includes(term));

  const cats = (r) => {
    const arr = Array.isArray(r.event_categories) ? r.event_categories : [];
    if (!arr.length) return "-";
    return arr.map((c) => CAT_LABEL[c] || c).join(", ");
  };

  return (
    <div>
      {!MARTA_CONFIGURED && (
        <div style={{ ...card, borderColor: T.warning, background: T.warningBg, color: "#7a5b00", marginBottom: 16 }}>
          Supabase MartaHub belum dikonfigurasi / project paused - data tampil kosong.
        </div>
      )}
      {err && <div style={{ ...card, borderColor: T.error, background: T.errorBg, color: T.error, marginBottom: 16 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari event / MC / site…"
          style={{ ...inp, maxWidth: 320 }} />
        {scope && !scope.unscoped && scope.found && (
          <div style={{ alignSelf: "center", fontSize: 11, fontWeight: 700, color: T.mid, background: "#F0F4FA", border: `1px solid ${T.line}`, borderRadius: 100, padding: "2px 10px" }}>
            Scope: {scope.region || "-"} · {brandLabel(scope.brand)}
          </div>
        )}
        <div style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12.5, color: T.mid }}>{view.length} plan</div>
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
            <thead><tr style={{ background: "#F7F9FC", color: T.mid, textAlign: "left" }}>
              {["Event", "Brand", "MC", "Site", "Kategori", "Tanggal", "Network", "Status", "Diputuskan Oleh", "Check-in"].map((h) => <th key={h} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={10} style={{ padding: 26, textAlign: "center", color: T.lo }}>Memuat…</td></tr>}
              {!loading && view.length === 0 && <tr><td colSpan={10} style={{ padding: 26, textAlign: "center", color: T.lo }}>Belum ada activity plan.</td></tr>}
              {!loading && view.map((r) => {
                const st = STATUS[r.status] || [r.status, T.mid, "#eef1f6"];
                return (
                  <tr key={r.id} onClick={() => setDetailId(r.id)} style={{ borderTop: `1px solid ${T.line}`, cursor: "pointer" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#F7F9FC"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                    <td style={{ padding: "10px 14px", fontWeight: 700 }}>{r.event_name || "-"}</td>
                    <td style={{ padding: "10px 14px" }}>{r.brand ? <span style={{ fontSize: 10.5, fontWeight: 800, color: String(r.brand).toLowerCase() === "tri" ? T.tri : T.im3 }}>{brandLabel(r.brand)}</span> : "-"}</td>
                    <td style={{ padding: "10px 14px", color: T.mid }}>{r.mc || "-"}</td>
                    <td style={{ padding: "10px 14px", color: T.mid }}>{r.site_id || "-"}</td>
                    <td style={{ padding: "10px 14px", color: T.mid }}>{cats(r)}</td>
                    <td style={{ padding: "10px 14px", color: T.mid }}>{fmtDate(r.plan_date_start || r.plan_date)}</td>
                    <td style={{ padding: "10px 14px", color: T.mid }}>{r.network_category || "-"}</td>
                    <td style={{ padding: "10px 14px" }}><span style={{ fontSize: 10.5, fontWeight: 800, color: st[1], background: st[2], padding: "2px 8px", borderRadius: 999 }}>{st[0]}</span></td>
                    <td style={{ padding: "10px 14px", color: T.mid }}>{r.approved_by_name || r.approved_by_email || "-"}</td>
                    <td style={{ padding: "10px 14px" }}>{r.checkin_valid == null ? "-" : r.checkin_valid ? <span style={{ color: T.success, fontWeight: 700 }}>Valid</span> : <span style={{ color: T.error, fontWeight: 700 }}>Invalid</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {detailId && <ActivityDetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

/** Modal detail satu activity plan - dibuka dgn klik baris tabel. Padanan
 * desktop dari /martahub/m/activities/[id] (mobile) yang sudah lebih dulu
 * punya ini - ringkasan plan, target vs actual, site, foto dokumentasi,
 * daftar MSISDN, & riwayat pengajuan revisi, supaya admin/TMV/Head bisa
 * "tracking dengan mudah" tanpa perlu buka app Flutter/mobile-web terpisah. */
function ActivityDetailModal({ id, onClose }) {
  const [a, setA] = useState(null);
  const [extraSites, setExtraSites] = useState([]);
  const [siteNames, setSiteNames] = useState({});
  const [branchName, setBranchName] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [entries, setEntries] = useState([]);
  const [editReqs, setEditReqs] = useState([]);
  const [err, setErr] = useState("");
  const [lightbox, setLightbox] = useState(null);

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

  const st = a ? (STATUS[a.status] || [a.status, T.mid, "#eef1f6"]) : null;
  const categories = a ? (Array.isArray(a.event_categories) && a.event_categories.length ? a.event_categories : (a.event_category ? [a.event_category] : [])) : [];
  const spEntries = entries.filter((e) => e.category === "sp");
  const fwaEntries = entries.filter((e) => e.category === "fwa");

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: FONT }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 680, maxHeight: "88vh", background: "#fff", borderRadius: 16, border: `1px solid ${T.line}`, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {!a && !err ? (
          <div style={{ padding: 40, textAlign: "center", color: T.lo }}>Memuat…</div>
        ) : err ? (
          <div style={{ padding: 20 }}>
            <div style={{ padding: "10px 12px", borderRadius: 10, background: T.errorBg, color: T.error, fontSize: 12.5, fontWeight: 600 }}>{err}</div>
            <button onClick={onClose} style={{ ...btn, marginTop: 14 }}>Tutup</button>
          </div>
        ) : (
          <>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                {a.brand && (
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: String(a.brand).toLowerCase() === "tri" ? T.tri : T.im3 }}>
                    {brandLabel(a.brand)}
                  </span>
                )}
                <div style={{ marginTop: 3, fontSize: 17, fontWeight: 800, color: T.hi }}>{a.event_name || "-"}</div>
                <div style={{ marginTop: 4, fontSize: 11.5, color: T.lo }}>Dibuat {a.created_at ? new Date(a.created_at).toLocaleString("id-ID") : "-"}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: st[1], background: st[2], padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>{st[0]}</span>
                <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 9, border: "none", background: "#F0F4FA", color: T.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={14} /></button>
              </div>
            </div>

            <div style={{ padding: "16px 20px", overflowY: "auto" }}>
              {categories.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                  {categories.map((c, i) => (
                    <span key={i} style={{ fontSize: 11, fontWeight: 700, color: T.mid, background: "#F0F4FA", borderRadius: 999, padding: "3px 10px" }}>{CAT_LABEL[c] || c}</span>
                  ))}
                </div>
              )}

              {(a.validation_note || a.override_note || a.approval_notes) && (
                <div style={{ marginBottom: 14, padding: "10px 13px", borderRadius: 10, background: st[2], color: st[1], fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>
                  {a.validation_note || a.override_note || a.approval_notes}
                </div>
              )}

              <DetailSection title="Informasi Plan">
                <KVGrid>
                  <KV label="Branch" value={branchName || "-"} />
                  <KV label="Micro Cluster" value={a.mc || "-"} />
                  <KV label="Tanggal" value={planDateLabel(a)} />
                  <KV label="Waktu" value={a.is_all_day === false && a.start_time && a.end_time ? `${a.start_time.slice(0, 5)} – ${a.end_time.slice(0, 5)}` : "Seharian"} />
                  <KV label="POI" value={a.poi_type || "-"} />
                  <KV label="Kekuatan Sinyal" value={a.network_category || "-"} />
                  <KV label="Potensi Area" value={a.area_potential || "-"} />
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

              <DetailSection title="Target vs Actual">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead><tr style={{ color: T.mid, textAlign: "left" }}>
                      {["Metrik", "Target", "Actual"].map((h) => <th key={h} style={{ padding: "4px 10px 4px 0", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase" }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      <MetricRow label="SP" target={fmtInt(a.target_sp)} actual={entries.length ? fmtInt(spEntries.filter((e) => e.validation_status === "valid").length) : fmtInt(a.actual_sp)} />
                      <MetricRow label="FWA" target={fmtInt(a.target_fwa)} actual={entries.length ? fmtInt(fwaEntries.filter((e) => e.validation_status === "valid").length) : fmtInt(a.actual_fwa)} />
                      <MetricRow label="Rebuy Pulsa" target={fmtRp(a.target_rebuy_pulsa)} actual={fmtRp(a.actual_rebuy_pulsa)} />
                      <MetricRow label="Rebuy Data" target={fmtRp(a.target_rebuy_data)} actual={fmtRp(a.actual_rebuy_data)} />
                      <MetricRow label="Revenue 3 Bulan" target={fmtRp(a.target_rev_3m)} actual={fmtRp(a.actual_rev_3m)} />
                      <MetricRow label="Cost" target={fmtRp(a.cost_estimate)} actual={fmtRp(a.cost_actual)} />
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
                <DetailSection title="Persetujuan">
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
        <div onClick={(e) => { e.stopPropagation(); setLightbox(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <img src={lightbox} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
        </div>
      )}
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

function DetailSection({ title, icon, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        {icon}
        <div style={{ fontSize: 11, fontWeight: 800, color: T.mid, textTransform: "uppercase", letterSpacing: "0.04em" }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function KVGrid({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px" }}>{children}</div>;
}

function KV({ label, value, valueColor, span2 }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, gridColumn: span2 ? "1 / -1" : "auto" }}>
      <span style={{ fontSize: 12, color: T.lo }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: valueColor || T.hi, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function MetricRow({ label, target, actual }) {
  return (
    <tr style={{ borderTop: `1px solid ${T.line}` }}>
      <td style={{ padding: "6px 10px 6px 0", color: T.hi, fontWeight: 600 }}>{label}</td>
      <td style={{ padding: "6px 10px 6px 0", color: T.mid }}>{target}</td>
      <td style={{ padding: "6px 10px 6px 0", color: T.hi, fontWeight: 700 }}>{actual}</td>
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

const card = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, fontSize: 13 };
const inp = { width: "100%", padding: "9px 12px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" };
const btn = { padding: "8px 13px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 };
const badge = (txt, c, bg) => <span style={{ fontSize: 10.5, fontWeight: 800, color: c, background: bg, border: `1px solid ${c}33`, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>{txt}</span>;
