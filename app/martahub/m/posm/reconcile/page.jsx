"use client";
/**
 * /martahub/m/posm/reconcile — Rekonsiliasi lokasi instalasi POSM (khusus
 * approver: Head/Brand TMV/SPM Sumatera/Admin). Dua alur berbeda, SAMA
 * PERSIS dgn RPC aslinya (lihat _shared/posmData.js):
 *   - Terikat Activity/Outlet → dihitung BATCH: jarak instalasi ke titik
 *     acuan (site/activity) dihitung di klien, submit sekaligus via
 *     mh_md_reconcile_batch.
 *   - Street Branding → direview SATU-SATU (approve/reject manual dari
 *     foto+deskripsi, tidak ada acuan GPS) via mh_web_decide_md_installation.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, PackageCheck, CheckCircle2, XCircle, Loader2, MapPin, Navigation, Milestone, Image as ImageIcon } from "lucide-react";
import supabaseMarta from "../../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../../_shared/MobileShell";
import { fmtInt } from "../../_shared/activityUi";
import { fetchPendingReconcile, fetchStreetPending, reconcileBatch, decideStreetInstallation, haversineMeters } from "../../_shared/posmData";

const TABS = [{ key: "geo", label: "Activity/Outlet" }, { key: "street", label: "Street Branding" }];
const PHOTO_BUCKET = "mh-photos";

export default function PosmReconcilePage() {
  const router = useRouter();
  const { loading: sessionLoading, email } = useMartaSession();
  const [tab, setTab] = useState("geo");

  return (
    <MobileShell active="home">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 0", fontFamily: FF }}>
        <button onClick={() => router.push("/martahub/m/posm/stock")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
          <ArrowLeft size={16} /> Stok POSM
        </button>
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <PackageCheck size={19} color="#ED1C24" />
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Rekonsiliasi Instalasi</div>
        </div>
        <div style={{ marginTop: 3, fontSize: 12.5, color: "#8A8A96", fontWeight: 500 }}>Validasi lokasi &amp; kelengkapan instalasi materi POSM lapangan.</div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: "8px 14px", borderRadius: 999, background: tab === t.key ? "#17181C" : "#FFFFFF", border: `1px solid ${tab === t.key ? "#17181C" : "#E9EAEE"}`, color: tab === t.key ? "#FFFFFF" : "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {sessionLoading ? <ShellSpinner /> : tab === "geo" ? <GeoReconcileTab email={email} /> : <StreetReviewTab email={email} />}
    </MobileShell>
  );
}

// ═══════════════════════════ Tab 1: Activity/Outlet ════════════════════════
function GeoReconcileTab({ email }) {
  const [rows, setRows] = useState(null);
  const [radius, setRadius] = useState(100);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [overrides, setOverrides] = useState({}); // installation_id -> 'valid'|'mismatch'

  async function load() {
    setRows(null); setErr("");
    try {
      const [installs, settingsRes] = await Promise.all([
        fetchPendingReconcile(),
        supabaseMarta.rpc("mh_get_settings"),
      ]);
      const r = settingsRes?.data && typeof settingsRes.data === "object" ? settingsRes.data.checkin_radius_meters : null;
      if (r) setRadius(r);

      const pending = (installs || []).filter((i) => !i.location_status || i.location_status === "pending");
      const outletIds = [...new Set(pending.filter((i) => i.mode === "outlet" && i.site_id).map((i) => i.site_id))];
      const activityIds = [...new Set(pending.filter((i) => i.mode === "activity" && i.activity_id).map((i) => i.activity_id))];

      const [{ data: sites }, { data: acts }] = await Promise.all([
        outletIds.length ? supabaseMarta.from("mh_sites").select("site_id, site_name, latitude, longitude").in("site_id", outletIds) : Promise.resolve({ data: [] }),
        activityIds.length ? supabaseMarta.from("mh_activities").select("id, event_name, latitude, longitude").in("id", activityIds) : Promise.resolve({ data: [] }),
      ]);
      const siteMap = new Map((sites || []).map((s) => [s.site_id, s]));
      const actMap = new Map((acts || []).map((a) => [a.id, a]));

      const computed = pending.map((i) => {
        const target = i.mode === "outlet" ? siteMap.get(i.site_id) : i.mode === "activity" ? actMap.get(i.activity_id) : null;
        const targetLat = target?.latitude != null ? Number(target.latitude) : null;
        const targetLng = target?.longitude != null ? Number(target.longitude) : null;
        const hasCoords = i.latitude != null && i.longitude != null && targetLat != null && targetLng != null;
        const distance = hasCoords ? Math.round(haversineMeters(Number(i.latitude), Number(i.longitude), targetLat, targetLng)) : null;
        const autoStatus = !hasCoords ? "mismatch" : distance <= r ? "valid" : "mismatch";
        return { ...i, target_label: target ? (target.site_name || target.event_name || i.site_id || i.activity_id) : "—", distance, hasCoords, autoStatus };
      });
      setRows(computed);
    } catch (e) {
      setErr(e.message || "Gagal memuat data rekonsiliasi");
      setRows([]);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function statusFor(row) { return overrides[row.id] || row.autoStatus; }
  function toggle(row, status) { setOverrides((prev) => ({ ...prev, [row.id]: status })); }

  async function processAll() {
    if (!rows || rows.length === 0) return;
    setBusy(true); setErr("");
    try {
      const results = rows.map((r) => ({
        installation_id: r.id,
        status: statusFor(r),
        matched_site_id: r.mode === "outlet" ? r.site_id : (r.target_label !== "—" ? null : null),
        distance_meters: r.distance,
        note: r.hasCoords ? null : "Site/activity tidak memiliki koordinat referensi",
      }));
      await reconcileBatch(results, email);
      await load();
    } catch (e) {
      setErr(e.message || "Gagal memproses rekonsiliasi");
    } finally {
      setBusy(false);
    }
  }

  if (rows === null) return <div style={{ padding: 20 }}><ShellSpinner /></div>;

  return (
    <div style={{ padding: "16px 20px 100px", fontFamily: FF }}>
      {err && <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

      {rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", background: "#FFFFFF", border: "1px dashed #D8D9E0", borderRadius: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#3A3A44" }}>Tidak ada instalasi menunggu rekonsiliasi</div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11.5, color: "#8A8A96", fontWeight: 600, marginBottom: 10 }}>
            Radius toleransi {radius} m. Status dihitung otomatis dari jarak ke site/activity — bisa ditimpa manual sebelum diproses.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map((r) => {
              const status = statusFor(r);
              const Icon = r.mode === "outlet" ? MapPin : Milestone;
              return (
                <div key={r.id} style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 16, padding: "13px 14px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 10, background: "#F0F0F3", display: "flex", alignItems: "center", justifyContent: "center", color: "#5A5A68" }}>
                      <Icon size={15} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>{r.md_full_name || "—"}</div>
                      <div style={{ marginTop: 2, fontSize: 11, color: "#8A8A96", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.target_label}</div>
                      <div style={{ marginTop: 4, fontSize: 10.5, color: "#B0B0BA", fontWeight: 600 }}>
                        {r.hasCoords ? `Jarak ${fmtInt(r.distance)} m` : "Tidak ada koordinat acuan"} · {new Date(r.created_at).toLocaleDateString("id-ID")}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={() => toggle(r, "mismatch")}
                      style={{ flex: 1, height: 36, borderRadius: 10, border: `1.5px solid ${status === "mismatch" ? "#DC2626" : "#ECEDF0"}`, background: status === "mismatch" ? "rgba(220,38,38,0.08)" : "#F6F7F9", color: status === "mismatch" ? "#DC2626" : "#8A8A96", fontSize: 11.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                      <XCircle size={13} /> Tidak Cocok
                    </button>
                    <button onClick={() => toggle(r, "valid")}
                      style={{ flex: 1, height: 36, borderRadius: 10, border: `1.5px solid ${status === "valid" ? "#15803D" : "#ECEDF0"}`, background: status === "valid" ? "rgba(21,128,61,0.08)" : "#F6F7F9", color: status === "valid" ? "#15803D" : "#8A8A96", fontSize: 11.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                      <CheckCircle2 size={13} /> Valid
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ position: "sticky", bottom: 66, marginTop: 16, background: "linear-gradient(180deg,rgba(244,245,247,0) 0%,#F4F5F7 30%)", paddingTop: 16 }}>
            <button onClick={processAll} disabled={busy}
              style={{ width: "100%", height: 50, borderRadius: 14, border: "none", cursor: busy ? "default" : "pointer", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 14px rgba(17,17,20,0.11)" }}>
              {busy ? <Loader2 size={16} style={{ animation: "mspin .85s linear infinite" }} /> : <CheckCircle2 size={16} />}
              {busy ? "Memproses…" : `Proses Semua (${rows.length})`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════ Tab 2: Street Branding ═══════════════════════
function StreetReviewTab({ email }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [urls, setUrls] = useState({});

  async function load() {
    setRows(null); setErr("");
    try {
      const data = await fetchStreetPending();
      setRows(data || []);
      const allPaths = (data || []).flatMap((r) => (r.photos || []).map((p) => p.storage_path));
      if (allPaths.length) {
        const entries = await Promise.all(allPaths.map(async (path) => {
          const { data: d } = await supabaseMarta.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
          return [path, d?.signedUrl || null];
        }));
        setUrls(Object.fromEntries(entries));
      }
    } catch (e) {
      setErr(e.message || "Gagal memuat street branding");
      setRows([]);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(id, decision) {
    setBusyId(id);
    try {
      await decideStreetInstallation(id, decision, null, email);
      await load();
    } catch (e) {
      setErr(e.message || "Gagal memproses keputusan");
    } finally {
      setBusyId(null);
    }
  }

  if (rows === null) return <div style={{ padding: 20 }}><ShellSpinner /></div>;

  return (
    <div style={{ padding: "16px 20px 40px", fontFamily: FF }}>
      {err && <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

      {rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", background: "#FFFFFF", border: "1px dashed #D8D9E0", borderRadius: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#3A3A44" }}>Tidak ada Street Branding menunggu review</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((r) => (
            <div key={r.id} style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 16, padding: "13px 14px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 10, background: "#F0F0F3", display: "flex", alignItems: "center", justifyContent: "center", color: "#5A5A68" }}>
                  <Navigation size={15} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>{r.md_full_name || "—"}</div>
                  <div style={{ marginTop: 2, fontSize: 11.5, color: "#5A5A68", fontWeight: 600 }}>{r.street_description}</div>
                  <div style={{ marginTop: 4, fontSize: 10.5, color: "#B0B0BA", fontWeight: 600 }}>{new Date(r.created_at).toLocaleString("id-ID")}</div>
                </div>
              </div>

              {(r.items || []).length > 0 && (
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {r.items.map((it, i) => (
                    <span key={i} style={{ fontSize: 10.5, fontWeight: 700, color: "#5A5A68", background: "#F0F0F3", borderRadius: 999, padding: "4px 9px" }}>{it.type_name} · {fmtInt(it.qty)} {it.unit}</span>
                  ))}
                </div>
              )}

              {(r.photos || []).length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 10 }}>
                  {r.photos.map((p, i) => (
                    <div key={i} style={{ aspectRatio: "1", borderRadius: 9, overflow: "hidden", background: "#F0F0F3" }}>
                      {urls[p.storage_path] ? <img src={urls[p.storage_path]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><ImageIcon size={14} color="#C4C4CE" /></div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ marginTop: 10, fontSize: 10.5, color: "#B45309", fontWeight: 700 }}>Tidak ada foto bukti</div>
              )}

              {r.note && <div style={{ marginTop: 8, fontSize: 11, color: "#8A8A96", fontStyle: "italic" }}>"{r.note}"</div>}

              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button onClick={() => decide(r.id, "rejected")} disabled={busyId === r.id}
                  style={{ flex: 1, height: 40, borderRadius: 11, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 12, fontWeight: 700, fontFamily: FF, cursor: busyId === r.id ? "default" : "pointer" }}>
                  Tolak
                </button>
                <button onClick={() => decide(r.id, "approved")} disabled={busyId === r.id}
                  style={{ flex: 1.3, height: 40, borderRadius: 11, border: "none", background: BRAND, color: "#fff", fontSize: 12, fontWeight: 800, fontFamily: FF, cursor: busyId === r.id ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {busyId === r.id ? <Loader2 size={13} style={{ animation: "mspin .85s linear infinite" }} /> : <CheckCircle2 size={13} />}
                  Setujui
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
