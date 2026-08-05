"use client";
// Menu "Validasi Lokasi Event" (§0.2 poin 3 Lapis 2, §9.2 Outlet Lat/Lng
// Master) — Head TMV/Brand TMV/SPM Sumatera mencocokkan titik event Plan
// (evidence, dari cloud) terhadap referensi lat/lng outlet resmi (reference,
// TIDAK PERNAH diunggah ke cloud — hanya HASIL pencocokan yang di-push).
//
// Keputusan teknis (dicatat di MARTAHUB_DEV_PROGRESS.md, Fase 3 lalu diupgrade
// Housekeeping #7): sekarang pakai "Hubungkan Folder" (File System Access API,
// lib/useFolderConnection.js — pola sama dgn SumatraMap.jsx utk Batas Wilayah/
// Titik Site), fallback <input type="file"> biasa di browser tanpa dukungan
// (Firefox/Safari). Baca & pencocokan tetap 100% di browser — file mentah
// TIDAK PERNAH terkirim ke server (§0.2), hanya HASIL pencocokan yang
// di-push. Yang "diingat": (a) REFERENSI FOLDER (IndexedDB perangkat ini,
// lib/folderHandles.js — bukan isinya) supaya sesi berikutnya tinggal beri
// izin ulang, bukan pilih folder dari nol; (b) METADATA pemetaan kolom (nama
// file terakhir, kolom mana = site_id/lat/lng) lewat mh_local_folder_links
// (SECURITY DEFINER, per-email) — tidak berubah dari desain Fase 3.
import { useState, useEffect, useCallback, useMemo } from "react";
import { CheckCircle2, AlertTriangle, HelpCircle, PlayCircle, RefreshCw } from "lucide-react";
import MartaShell, { T } from "../components/MartaShell";
import { FolderConnectPanel } from "../components/FolderConnect";
import supabaseMarta from "../../../lib/supabaseMarta";
import { getMartaScope, applyMartaScope } from "../../../lib/martaScope";
import { readWorkbook, deriveTable } from "../../../lib/martaSiteImport";
import { useFolderConnection } from "../../../lib/useFolderConnection";

const OUTLET_MASTER_EXT = /\.(xlsx|xls|csv)$/i;

const CAN_RUN_ROLES = ["head", "tmv", "spm_sumatera", "admin"];
const PURPOSE = "outlet_master";

// Haversine — jarak dua titik lat/lng dalam meter.
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const _norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function guessCol(columns, guesses) {
  for (const g of guesses) {
    const ng = _norm(g);
    const hit = columns.find((c) => _norm(c) === ng);
    if (hit) return hit;
  }
  for (const g of guesses) {
    const ng = _norm(g);
    if (ng.length < 3) continue;
    const hit = columns.find((c) => _norm(c).includes(ng));
    if (hit) return hit;
  }
  return "";
}

export default function ValidasiLokasiPage() {
  return (
    <MartaShell active="validasi" title="Validasi Lokasi Event" subtitle="Rekonsiliasi titik event Plan terhadap referensi Outlet Lat/Lng Master (§0.2, §9.2).">
      {(ctx) => <Body email={ctx?.session?.user?.email} />}
    </MartaShell>
  );
}

function Body({ email }) {
  const [scope, setScope] = useState(null);
  const [savedMapping, setSavedMapping] = useState(null); // metadata terakhir tersimpan
  const [radius, setRadius] = useState(200);
  const [mdRadius, setMdRadius] = useState(150);

  // Berkas referensi (in-memory, sesi ini saja — TIDAK pernah terkirim ke server).
  const [file, setFile] = useState(null);
  const [matrix, setMatrix] = useState(null);
  const [headerIdx, setHeaderIdx] = useState(0);
  const [mapping, setMapping] = useState({ site_id: "", latitude: "", longitude: "" });
  const [readErr, setReadErr] = useState("");
  const [savingMap, setSavingMap] = useState(false);
  // "Hubungkan Folder" — HANYA referensi folder yang diingat (IndexedDB
  // perangkat ini), isi file selalu dibaca ulang dari disk. Dipanggil tiap
  // kali ada berkas baru siap dibaca (folder ATAU fallback pilih manual).
  const folderSource = useFolderConnection(PURPOSE, OUTLET_MASTER_EXT, onFile);

  // Activity yang perlu direkonsiliasi.
  const [rows, setRows] = useState([]);
  const [statusMap, setStatusMap] = useState({}); // activity_id -> current status row
  const [loadingRows, setLoadingRows] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  // MD Activities (§8.2) — pemasangan mode Activity/Outlet menunggu
  // rekonsiliasi, pakai REFERENSI YANG SAMA (referenceMap) dgn Lapis 2 event
  // di atas, tapi radius & tabel target BEDA (mh_md_installations, bukan
  // mh_activities). Mode 'activity' tidak punya site_id di baris instalasi
  // sendiri — site_id-nya ikut activity terkait (activitySiteMap).
  const [mdRows, setMdRows] = useState([]);
  const [activitySiteMap, setActivitySiteMap] = useState({});
  const [loadingMd, setLoadingMd] = useState(true);
  const [mdRunning, setMdRunning] = useState(false);
  const [mdResult, setMdResult] = useState(null);
  const [mdErr, setMdErr] = useState("");

  const canRun = CAN_RUN_ROLES.includes(scope?.role);

  const load = useCallback(async () => {
    if (!email) return;
    const sc = await getMartaScope(email);
    setScope(sc);

    const { data: setting } = await supabaseMarta.rpc("mh_get_settings");
    if (setting?.event_site_radius_meters) setRadius(Number(setting.event_site_radius_meters));
    if (setting?.md_activity_radius_meters) setMdRadius(Number(setting.md_activity_radius_meters));

    const { data: link } = await supabaseMarta.rpc("mh_get_folder_link", { p_purpose: PURPOSE, p_caller_email: email });
    if (link && link.fileName) {
      setSavedMapping(link);
      if (link.columnMapping) setMapping((m) => ({ ...m, ...link.columnMapping }));
    }

    setLoadingRows(true);
    try {
      let q = supabaseMarta
        .from("mh_activities")
        .select("id, event_name, site_id, latitude, longitude, plan_date, status")
        .not("site_id", "is", null)
        .not("latitude", "is", null)
        .order("plan_date", { ascending: false })
        .limit(500);
      q = await applyMartaScope(q, sc);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      setRows(data || []);

      const ids = (data || []).map((r) => r.id);
      if (ids.length) {
        const { data: statuses } = await supabaseMarta
          .from("mh_event_site_status_current")
          .select("activity_id, status, matched_site_id, matched_site_name, distance_meters, created_at")
          .in("activity_id", ids);
        const m = {};
        for (const s of statuses || []) m[s.activity_id] = s;
        setStatusMap(m);
      }
    } catch (e) { setErr(e.message || "Gagal memuat activity"); }
    finally { setLoadingRows(false); }

    setLoadingMd(true);
    try {
      const { data: pending, error } = await supabaseMarta.rpc("mh_md_list_pending_reconcile");
      if (error) throw new Error(error.message);
      const list = pending || [];
      setMdRows(list);

      const actIds = [...new Set(list.filter((r) => r.mode === "activity" && r.activity_id).map((r) => r.activity_id))];
      if (actIds.length) {
        const { data: acts } = await supabaseMarta.from("mh_activities").select("id, site_id").in("id", actIds);
        const m = {};
        for (const a of acts || []) m[a.id] = a.site_id;
        setActivitySiteMap(m);
      } else {
        setActivitySiteMap({});
      }
    } catch (e) { setErr(e.message || "Gagal memuat MD Activities"); }
    finally { setLoadingMd(false); }
  }, [email]);
  useEffect(() => { load(); }, [load]);

  // ── Baca & petakan berkas referensi ────────────────────────────────────────
  async function onFile(f) {
    setFile(f); setMatrix(null); setReadErr(""); setHeaderIdx(0); setResult(null);
    if (!f) return;
    try {
      const parsed = await readWorkbook(f);
      setMatrix(parsed.matrix);
    } catch (e) { setReadErr(e.message || "Gagal membaca berkas."); }
  }

  const table = useMemo(() => (matrix ? deriveTable(matrix, headerIdx) : null), [matrix, headerIdx]);
  useEffect(() => {
    if (!table) return;
    setMapping((m) => ({
      site_id: m.site_id || guessCol(table.displayColumns, ["site id", "new site id", "unique id", "site"]),
      latitude: m.latitude || guessCol(table.displayColumns, ["lat new", "latitude", "lat"]),
      longitude: m.longitude || guessCol(table.displayColumns, ["long new", "longitude", "long"]),
    }));
  }, [table]);

  // Referensi site_id -> {lat, lng} dari berkas yang sedang dimuat sesi ini.
  const referenceMap = useMemo(() => {
    if (!table || !mapping.site_id || !mapping.latitude || !mapping.longitude) return null;
    const m = new Map();
    for (const r of table.rows) {
      const id = String(r[mapping.site_id] ?? "").trim();
      const lat = parseFloat(String(r[mapping.latitude] ?? "").replace(",", "."));
      const lng = parseFloat(String(r[mapping.longitude] ?? "").replace(",", "."));
      if (id && Number.isFinite(lat) && Number.isFinite(lng)) m.set(id, { lat, lng });
    }
    return m;
  }, [table, mapping]);

  async function saveMapping() {
    if (!file || !mapping.site_id || !mapping.latitude || !mapping.longitude) return;
    setSavingMap(true);
    try {
      await supabaseMarta.rpc("mh_save_folder_link", {
        p_purpose: PURPOSE, p_folder_name: null, p_file_name: file.name,
        p_column_mapping: mapping, p_caller_email: email,
      });
      setSavedMapping({ fileName: file.name, columnMapping: mapping, updatedAt: new Date().toISOString() });
    } catch (e) { setErr(e.message || "Gagal menyimpan mapping"); }
    finally { setSavingMap(false); }
  }

  // ── Jalankan rekonsiliasi ───────────────────────────────────────────────────
  const preview = useMemo(() => {
    if (!referenceMap) return [];
    return rows.map((r) => {
      const ref = referenceMap.get(String(r.site_id || "").trim());
      if (!ref) return { ...r, newStatus: "mismatch", note: "Site ID tidak ditemukan di referensi", dist: null, matchedName: null };
      const dist = distanceMeters(Number(r.latitude), Number(r.longitude), ref.lat, ref.lng);
      return {
        ...r,
        dist,
        matchedName: r.site_id,
        newStatus: dist <= radius ? "valid" : "mismatch",
        note: dist <= radius ? null : `Jarak ${dist.toFixed(0)}m > radius ${radius}m`,
      };
    });
  }, [rows, referenceMap, radius]);

  async function runReconcile() {
    if (!preview.length) return;
    setRunning(true); setErr(""); setResult(null);
    try {
      const payload = preview.map((p) => ({
        activity_id: p.id,
        status: p.newStatus,
        matched_site_id: p.site_id,
        matched_site_name: p.matchedName,
        distance_meters: p.dist == null ? null : Math.round(p.dist),
        note: p.note,
      }));
      const { data, error } = await supabaseMarta.rpc("mh_event_site_reconcile_batch", { p_results: payload, p_caller_email: email });
      if (error) throw new Error(error.message);
      const valid = preview.filter((p) => p.newStatus === "valid").length;
      setResult({ total: data ?? payload.length, valid, mismatch: payload.length - valid });
      await load();
    } catch (e) { setErr(e.message || "Gagal menjalankan rekonsiliasi"); }
    finally { setRunning(false); }
  }

  // ── MD Activities (mode Activity/Outlet) — pratinjau & jalankan ────────────
  const mdPreview = useMemo(() => {
    if (!referenceMap) return [];
    return mdRows.map((r) => {
      const effectiveSiteId = r.mode === "outlet" ? r.site_id : activitySiteMap[r.activity_id];
      const ref = effectiveSiteId ? referenceMap.get(String(effectiveSiteId).trim()) : null;
      if (!ref) {
        return { ...r, effectiveSiteId, dist: null, newStatus: "mismatch", note: "Site ID tidak ditemukan di referensi (atau activity belum punya Site)" };
      }
      const dist = distanceMeters(Number(r.latitude), Number(r.longitude), ref.lat, ref.lng);
      return {
        ...r, effectiveSiteId, dist,
        newStatus: dist <= mdRadius ? "valid" : "mismatch",
        note: dist <= mdRadius ? null : `Jarak ${dist.toFixed(0)}m > radius ${mdRadius}m`,
      };
    });
  }, [mdRows, referenceMap, activitySiteMap, mdRadius]);

  async function runMdReconcile() {
    if (!mdPreview.length) return;
    setMdRunning(true); setMdErr(""); setMdResult(null);
    try {
      const payload = mdPreview.map((p) => ({
        installation_id: p.id,
        status: p.newStatus,
        matched_site_id: p.effectiveSiteId || null,
        distance_meters: p.dist == null ? null : Math.round(p.dist),
        note: p.note,
      }));
      const { data, error } = await supabaseMarta.rpc("mh_md_reconcile_batch", { p_results: payload, p_caller_email: email });
      if (error) throw new Error(error.message);
      const valid = mdPreview.filter((p) => p.newStatus === "valid").length;
      setMdResult({ total: data ?? payload.length, valid, mismatch: payload.length - valid });
      await load();
    } catch (e) { setMdErr(e.message || "Gagal menjalankan rekonsiliasi MD Activities"); }
    finally { setMdRunning(false); }
  }

  if (!canRun && scope) {
    return (
      <div style={note}>
        Halaman ini khusus Head TMV, Brand TMV, atau SPM Sumatera — role Anda saat ini ({scope.role || "tidak terdaftar"}) tidak memiliki akses menjalankan rekonsiliasi.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1040 }}>
      <div style={{ ...card, background: "linear-gradient(135deg,#FFF5F7,#FFFFFF)", borderColor: T.primaryBd }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <HelpCircle size={18} color={T.primaryD} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: T.mid, lineHeight: 1.6 }}>
            <b style={{ color: T.hi }}>Lapis 2 (§0.2/§9.2):</b> menu ini mencocokkan titik event Plan (evidence) terhadap referensi lat/lng outlet resmi yang Anda muat dari berkas lokal — berkas ini TIDAK PERNAH terkirim ke server, hanya hasil pencocokan (status &ldquo;tervalidasi&rdquo;) yang disimpan. Ini terpisah dari Check-In (Lapis 1, instan) yang sudah berjalan seperti biasa.
          </div>
        </div>
      </div>

      {/* Referensi Outlet Lat/Lng Master */}
      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>1. Muat Referensi Outlet Lat/Lng</div>
        <div style={{ color: T.mid, fontSize: 12.5, marginBottom: 12 }}>
          Hubungkan folder berisi berkas Site ID + lat/lng resmi (.xlsx/.xls/.csv). {savedMapping?.fileName && (
            <span>Pemetaan kolom terakhir sudah diingat dari <b>{savedMapping.fileName}</b> — otomatis dipakai lagi untuk berkas baru.</span>
          )}
        </div>
        <FolderConnectPanel t={T} source={folderSource} color={T.primary} acceptAttr=".xlsx,.xls,.csv" extLabel=".xlsx/.xls/.csv" />
        {readErr && <div style={{ ...note, marginTop: 10, background: T.errorBg, borderColor: T.error, color: T.error }}>{readErr}</div>}

        {table && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: T.mid, textTransform: "uppercase", marginBottom: 8 }}>Petakan Kolom</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 10 }}>
              {[["site_id", "Site ID"], ["latitude", "Latitude"], ["longitude", "Longitude"]].map(([k, label]) => (
                <label key={k} style={{ display: "block" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: T.hi, marginBottom: 5 }}>{label} <span style={{ color: T.error }}>*</span></div>
                  <select value={mapping[k]} onChange={(e) => setMapping((m) => ({ ...m, [k]: e.target.value }))}
                    style={{ ...selectStyle, borderColor: !mapping[k] ? T.error : T.line }}>
                    <option value="">— pilih kolom —</option>
                    {table.displayColumns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={muted}>{referenceMap ? `${referenceMap.size.toLocaleString()} outlet siap dipakai.` : "Lengkapi ketiga kolom di atas dulu."}</span>
              <button onClick={saveMapping} disabled={savingMap || !referenceMap} style={{ ...btn, marginLeft: "auto", ...((savingMap || !referenceMap) ? disabledBtn : {}) }}>
                {savingMap ? "Menyimpan…" : "Ingat Pemetaan Ini"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Jalankan rekonsiliasi */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>2. Jalankan Rekonsiliasi</div>
          <button onClick={load} style={{ ...linkBtn, marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <RefreshCw size={13} /> Muat ulang
          </button>
        </div>
        <div style={{ color: T.mid, fontSize: 12.5, marginBottom: 12 }}>
          Radius toleransi saat ini: <b>{radius} m</b> (bisa diubah di System Settings). {rows.length} activity dengan Site di-assign ditemukan dalam cakupan Anda.
        </div>

        {err && <div style={{ ...note, marginBottom: 12, background: T.errorBg, borderColor: T.error, color: T.error }}>{err}</div>}
        {result && (
          <div style={{ ...note, marginBottom: 12, background: T.successBg, borderColor: T.success, color: "#155724" }}>
            Selesai — {result.total} activity diproses: <b>{result.valid} tervalidasi</b>, <b>{result.mismatch} tidak cocok</b>.
          </div>
        )}

        <div style={{ overflow: "auto", maxHeight: 420, border: `1px solid ${T.line}`, borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
            <thead>
              <tr style={{ background: "#F7F9FC", color: T.mid }}>
                {["Activity", "Site ID", "Status Saat Ini", "Jarak (jika dihitung)", "Status Baru (pratinjau)"].map((h) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingRows && <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: T.lo }}>Memuat…</td></tr>}
              {!loadingRows && rows.length === 0 && <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: T.lo }}>Tidak ada activity dengan Site di-assign.</td></tr>}
              {!loadingRows && preview.length === 0 && rows.length > 0 && (
                <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: T.lo }}>Muat referensi Outlet Lat/Lng dulu (langkah 1) untuk melihat pratinjau.</td></tr>
              )}
              {preview.map((p) => {
                const cur = statusMap[p.id];
                return (
                  <tr key={p.id} style={{ borderTop: `1px solid ${T.line}` }}>
                    <td style={{ padding: "8px 12px", fontWeight: 700, color: T.hi }}>{p.event_name || "—"}</td>
                    <td style={{ padding: "8px 12px", color: T.mid }}>{p.site_id}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <StatusPill status={cur?.status || "pending"} />
                    </td>
                    <td style={{ padding: "8px 12px", color: T.mid }}>{p.dist == null ? "—" : `${p.dist.toFixed(0)} m`}</td>
                    <td style={{ padding: "8px 12px" }}><StatusPill status={p.newStatus} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={runReconcile} disabled={running || !preview.length}
            style={{ ...pbtn, ...((running || !preview.length) ? disabledPbtn : {}) }}>
            <PlayCircle size={15} /> {running ? "Memproses…" : `Jalankan Rekonsiliasi (${preview.length})`}
          </button>
        </div>
      </div>

      {/* Rekonsiliasi MD Activities (§8.2) — mode Activity/Outlet, pakai
          REFERENSI YANG SAMA dari langkah 1 di atas, radius terpisah
          (md_activity_radius_meters). Mode Street Branding TIDAK di sini —
          itu ditinjau manual di Approval Center (bukan geofencing). */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>3. Rekonsiliasi MD Activities (Mode Activity/Outlet)</div>
          <button onClick={load} style={{ ...linkBtn, marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <RefreshCw size={13} /> Muat ulang
          </button>
        </div>
        <div style={{ color: T.mid, fontSize: 12.5, marginBottom: 12 }}>
          Radius toleransi: <b>{mdRadius} m</b>. Pemasangan POSM oleh MD/BME/RGE mode Terikat Activity/Outlet menunggu rekonsiliasi — stok baru berkurang setelah langkah ini dijalankan (§8.2), terlepas hasilnya tervalidasi atau tidak cocok. Muat referensi Outlet Lat/Lng di langkah 1 dulu untuk melihat pratinjau.
        </div>

        {mdErr && <div style={{ ...note, marginBottom: 12, background: T.errorBg, borderColor: T.error, color: T.error }}>{mdErr}</div>}
        {mdResult && (
          <div style={{ ...note, marginBottom: 12, background: T.successBg, borderColor: T.success, color: "#155724" }}>
            Selesai — {mdResult.total} pemasangan diproses: <b>{mdResult.valid} tervalidasi</b>, <b>{mdResult.mismatch} tidak cocok</b>.
          </div>
        )}

        <div style={{ overflow: "auto", maxHeight: 420, border: `1px solid ${T.line}`, borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
            <thead>
              <tr style={{ background: "#F7F9FC", color: T.mid }}>
                {["MD/BME/RGE", "Mode", "Activity / Site", "Jarak", "Status Baru (pratinjau)"].map((h) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingMd && <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: T.lo }}>Memuat…</td></tr>}
              {!loadingMd && mdRows.length === 0 && <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: T.lo }}>Tidak ada pemasangan yang menunggu rekonsiliasi.</td></tr>}
              {!loadingMd && mdPreview.length === 0 && mdRows.length > 0 && (
                <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: T.lo }}>Muat referensi Outlet Lat/Lng dulu (langkah 1) untuk melihat pratinjau.</td></tr>
              )}
              {mdPreview.map((p) => (
                <tr key={p.id} style={{ borderTop: `1px solid ${T.line}` }}>
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: T.hi }}>{p.md_full_name || p.md_email || "—"}</td>
                  <td style={{ padding: "8px 12px", color: T.mid }}>{p.mode === "activity" ? "Terikat Activity" : "Terikat Outlet"}</td>
                  <td style={{ padding: "8px 12px", color: T.mid }}>{p.mode === "activity" ? (p.activity_name || "—") : (p.site_id || "—")}</td>
                  <td style={{ padding: "8px 12px", color: T.mid }}>{p.dist == null ? "—" : `${p.dist.toFixed(0)} m`}</td>
                  <td style={{ padding: "8px 12px" }}><StatusPill status={p.newStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={runMdReconcile} disabled={mdRunning || !mdPreview.length}
            style={{ ...pbtn, ...((mdRunning || !mdPreview.length) ? disabledPbtn : {}) }}>
            <PlayCircle size={15} /> {mdRunning ? "Memproses…" : `Jalankan Rekonsiliasi (${mdPreview.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    valid: { t: "Tervalidasi", c: T.success, bg: T.successBg, icon: <CheckCircle2 size={12} /> },
    mismatch: { t: "Tidak Cocok", c: T.error, bg: T.errorBg, icon: <AlertTriangle size={12} /> },
    pending: { t: "Menunggu Validasi", c: "#8a5b00", bg: T.warningBg, icon: <HelpCircle size={12} /> },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, color: s.c, background: s.bg, border: `1px solid ${s.c}33` }}>
      {s.icon} {s.t}
    </span>
  );
}

const card = { background: "#FFFFFF", border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, fontSize: 13 };
const note = { background: "#FFFDE7", border: `1px solid #F0E3B0`, color: "#7a5b00", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, lineHeight: 1.5 };
const muted = { fontSize: 12.5, color: T.mid };
const btn = { padding: "8px 14px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap", lineHeight: 1 };
const disabledBtn = { opacity: 0.5, cursor: "not-allowed" };
const GRAD = "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)";
const pbtn = { ...btn, background: GRAD, color: "#fff", border: "none", padding: "10px 18px" };
const disabledPbtn = { background: "#F1F2F5", color: T.lo, boxShadow: "none", cursor: "not-allowed" };
const linkBtn = { background: "none", border: "none", color: T.hi, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 };
const CHEV = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>";
const inp = { padding: "8px 11px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 13, outline: "none", boxSizing: "border-box", width: "100%" };
const selectStyle = { ...inp, appearance: "none", WebkitAppearance: "none", MozAppearance: "none", cursor: "pointer", backgroundImage: `url("${CHEV}")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 11px center", backgroundSize: "13px", paddingRight: 32 };
