"use client";

// ============================================================
// PTS — Promotor Tracking System (SandraHub)
// Admin (spm_sumatera / pic_region): 2 sub-menu
//   1) Upload Mapping — per bulan (download → edit → upload Excel)
//   2) Preview Data    — tabel komprehensif (termasuk "Belum Login")
// Sumber kebenaran: tabel pts_* di Supabase (TraceHub).
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Upload, Download, FileSpreadsheet, Users, MapPin, Search, Filter,
  CheckCircle2, AlertTriangle, Clock, X, ChevronDown, ChevronRight,
  RefreshCw, Image as ImageIcon, LogIn, ShoppingBag, CalendarDays,
  Loader2, Store, UserCheck, UserX, Info, Phone, IdCard, Radar,
  UploadCloud, Plus, Trash2, Pencil, Save, Ban, BarChart3,
} from "lucide-react";

/* ── Design tokens (selaras dashboard SandraHub) ──────────────────────── */
const mk = (d) => ({
  bg    : d ? "#0D0D0F" : "#F5F5F6",
  card  : d ? "#161618" : "#FFFFFF",
  sub   : d ? "#1C1C20" : "#F8F9FB",
  hover : d ? "#202024" : "#F0F0F2",
  line  : d ? "#2A2A2F" : "#E6E6EA",
  lineSoft: d ? "#222226" : "#EEEEF2",
  hi    : d ? "#F1F1F4" : "#17181C",
  mid   : d ? "#8A8A96" : "#5C5C68",
  lo    : d ? "#5A5A68" : "#9A9AA6",
  brand : "#ED1C24",
  brandBg: d ? "rgba(237,28,36,.12)" : "rgba(237,28,36,.07)",
  brandBd: d ? "rgba(237,28,36,.30)" : "rgba(237,28,36,.20)",
  mag   : "#C6168D",
  magBg : d ? "rgba(198,22,141,.13)" : "rgba(198,22,141,.07)",
  magBd : d ? "rgba(198,22,141,.32)" : "rgba(198,22,141,.20)",
  green : d ? "#30D158" : "#1A9E5A",
  greenBg: d ? "rgba(48,209,88,.12)" : "rgba(26,158,90,.08)",
  greenBd: d ? "rgba(48,209,88,.28)" : "rgba(26,158,90,.20)",
  amber : d ? "#FFB020" : "#B7791F",
  amberBg: d ? "rgba(255,176,32,.13)" : "rgba(183,121,31,.09)",
  amberBd: d ? "rgba(255,176,32,.30)" : "rgba(183,121,31,.22)",
  blue  : d ? "#0A84FF" : "#2563EB",
  blueBg: d ? "rgba(10,132,255,.12)" : "rgba(37,99,235,.07)",
  blueBd: d ? "rgba(10,132,255,.28)" : "rgba(37,99,235,.18)",
  red   : d ? "#F87171" : "#DC2626",
  redBg : d ? "rgba(248,113,113,.12)" : "rgba(220,38,38,.07)",
  redBd : d ? "rgba(248,113,113,.30)" : "rgba(220,38,38,.20)",
  inputBg: d ? "#131315" : "#FFFFFF",
  sm    : d ? "0 1px 3px rgba(0,0,0,.55)" : "0 1px 3px rgba(23,24,28,.06)",
  md    : d ? "0 8px 24px rgba(0,0,0,.5)" : "0 8px 24px rgba(23,24,28,.09)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;

/* ── Helpers ──────────────────────────────────────────────────────────── */
const MONTHS_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const pad2 = (n) => String(n).padStart(2, "0");
const ymNow = () => { const x = new Date(); return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}`; };
const ymLabel = (ym) => { if (!ym) return "—"; const [y, m] = ym.split("-"); return `${MONTHS_ID[+m - 1]} ${y}`; };
const periodOptions = (back = 11, fwd = 1) => {
  const out = []; const now = new Date();
  for (let i = -fwd; i <= back; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`); }
  return out;
};
const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }) : "";
const durationOf = (a, b) => {
  if (!a || !b) return "";
  const ms = new Date(b).getTime() - new Date(a).getTime(); if (ms < 0) return "";
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return `${h}j ${pad2(m)}m`;
};
const emailValid = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || "").trim());

// Normalisasi nomor telepon → format 62 (mirror aturan server §6 spec)
export function normalizePhone(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("62")) { /* ok */ }
  else if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return { normalized: d, valid: /^62\d{8,13}$/.test(d), raw: String(raw ?? "") };
}

// Data Mapping Promotor: 1 baris = 1 outlet, kunci relasi = ID Promotor (bukan email lagi)
const TEMPLATE_HEADERS = ["Brand", "ID Outlet", "Nama Outlet", "Cluster", "Branch", "Area", "Region", "Longitude", "Latitude", "ID Promotor"];

// 3 region resmi Sumatera (selaras IOH Territory)
const REGIONS = ["NORTH SUMATERA", "CENTRAL SUMATERA", "SOUTH SUMATERA"];
const REGION_ALIASES = {
  "NORTH SUMATERA": "NORTH SUMATERA", NORTH: "NORTH SUMATERA", "SUMATERA UTARA": "NORTH SUMATERA", UTARA: "NORTH SUMATERA", SUMUT: "NORTH SUMATERA",
  "CENTRAL SUMATERA": "CENTRAL SUMATERA", CENTRAL: "CENTRAL SUMATERA", "SUMATERA TENGAH": "CENTRAL SUMATERA", TENGAH: "CENTRAL SUMATERA",
  "SOUTH SUMATERA": "SOUTH SUMATERA", SOUTH: "SOUTH SUMATERA", "SUMATERA SELATAN": "SOUTH SUMATERA", SELATAN: "SOUTH SUMATERA", SUMSEL: "SOUTH SUMATERA",
};
const canonRegion = (s) => REGION_ALIASES[String(s || "").trim().toUpperCase().replace(/\s+/g, " ")] || null;

// Status validasi GA (D+2, window 3 hari dari tagged_at)
const GA_STATUS_LABEL = {
  BELUM_TERVALIDASI: "Belum Tervalidasi GA",
  TERVALIDASI: "Tervalidasi",
  TERVALIDASI_LUAR_AREA: "Tervalidasi — Luar Area",
  TIDAK_DITEMUKAN: "Tidak Ditemukan",
};
const GA_STATUS_TONE = { BELUM_TERVALIDASI: "amber", TERVALIDASI: "green", TERVALIDASI_LUAR_AREA: "blue", TIDAK_DITEMUKAN: "red" };
const GEOFENCE_SCOPES = [
  { value: "global", label: "Global (semua outlet)" },
  { value: "region", label: "Per Region" },
  { value: "branch", label: "Per Branch" },
  { value: "outlet", label: "Per Outlet (kode outlet)" },
];

/* ── UI atoms ─────────────────────────────────────────────────────────── */
function Segmented({ t, options, value, onChange }) {
  return (
    <div style={{ display: "inline-flex", padding: 3, gap: 2, background: t.sub, border: `1px solid ${t.line}`, borderRadius: 10 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer",
              fontFamily: FF, fontSize: 13, fontWeight: on ? 600 : 500, letterSpacing: "-0.01em",
              background: on ? t.card : "transparent", color: on ? t.hi : t.mid,
              boxShadow: on ? t.sm : "none", transition: "all .15s",
            }}>
            {o.icon}{o.label}{typeof o.count === "number" && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 99, background: on ? t.brandBg : t.hover, color: on ? t.brand : t.mid }}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Stat({ t, icon, label, value, accent }) {
  return (
    <div style={{ flex: "1 1 150px", minWidth: 150, padding: "16px 18px", borderRadius: 12, background: t.card, border: `1px solid ${t.line}`, boxShadow: t.sm, display: "flex", alignItems: "center", gap: 13 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: accent.bg, color: accent.fg, border: `1px solid ${accent.bd}` }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", color: t.hi, lineHeight: 1.05 }}>{value}</div>
        <div style={{ fontSize: 11.5, fontWeight: 500, color: t.mid, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
export default function PTS_Module({ supabase, theme = "light", profile }) {
  const d = theme === "dark";
  const t = mk(d);

  const [tab, setTab] = useState("upload");            // upload | promotor | preview | geofence | ga
  const [period, setPeriod] = useState(ymNow());
  const [outlets, setOutlets] = useState([]);          // {code, ...}
  const outletByCode = useMemo(() => {
    const m = new Map(); outlets.forEach((o) => m.set(String(o.code).trim().toUpperCase(), o)); return m;
  }, [outlets]);

  const loadOutlets = useCallback(async () => {
    const { data } = await supabase.from("pts_outlet").select("*").limit(20000);
    setOutlets(data || []);
  }, [supabase]);
  useEffect(() => { loadOutlets(); }, [loadOutlets]);

  const isFullAdmin = profile?.role === "spm_sumatera" || profile?.role === "internal_ioh";

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <style>{`
        .pts-in{font-family:${FF};font-size:13.5px;color:${t.hi};background:${t.inputBg};border:1px solid ${t.line};border-radius:9px;padding:9px 12px;outline:none;transition:border-color .15s}
        .pts-in:focus{border-color:${t.brandBd}}
        .pts-btn{font-family:${FF};display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;letter-spacing:-.01em;padding:9px 16px;border-radius:10px;cursor:pointer;border:1px solid transparent;transition:all .15s}
        .pts-btn:disabled{opacity:.5;cursor:not-allowed}
        .pts-th{position:sticky;top:0;z-index:2;background:${t.sub};font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${t.mid};padding:11px 12px;text-align:left;white-space:nowrap;border-bottom:1px solid ${t.line}}
        .pts-td{padding:11px 12px;font-size:12.5px;color:${t.hi};border-bottom:1px solid ${t.lineSoft};white-space:nowrap}
        .pts-row:hover{background:${t.hover}}
      `}</style>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 22 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: t.brandBg, color: t.brand, border: `1px solid ${t.brandBd}` }}>
            <MapPin size={22} strokeWidth={2.1} />
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.025em", color: t.hi, lineHeight: 1.1 }}>Promotor Tracking System</h2>
            <p style={{ fontSize: 13, color: t.mid, marginTop: 3 }}>Mapping outlet &amp; pemantauan aktivitas Promotor{profile?.region ? ` — region ${profile.region}` : " — Sumatera"}.</p>
          </div>
        </div>

        {/* Selektor bulan — menonjol */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: t.lo }}>Bulan aktif</label>
          <div style={{ position: "relative" }}>
            <CalendarDays size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: t.brand, pointerEvents: "none" }} />
            <select value={period} onChange={(e) => setPeriod(e.target.value)}
              style={{ appearance: "none", fontFamily: FF, fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em", color: t.hi, background: t.card, border: `1.5px solid ${t.brandBd}`, borderRadius: 11, padding: "10px 38px 10px 34px", cursor: "pointer", boxShadow: t.sm }}>
              {periodOptions().map((p) => <option key={p} value={p}>{ymLabel(p)}</option>)}
            </select>
            <ChevronDown size={15} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: t.mid, pointerEvents: "none" }} />
          </div>
        </div>
      </div>

      {/* ── Tab switch ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 22 }}>
        <Segmented t={t} value={tab} onChange={setTab}
          options={[
            { value: "upload",   label: "Data Mapping Promotor", icon: <Upload size={14} /> },
            { value: "promotor", label: "Data Promotor",         icon: <IdCard size={14} /> },
            { value: "preview",  label: "Preview Data",          icon: <FileSpreadsheet size={14} /> },
            { value: "geofence", label: "Geofence",              icon: <Radar size={14} /> },
            { value: "ga",       label: "Validasi GA",           icon: <UploadCloud size={14} /> },
          ]} />
      </div>

      {tab === "upload"   && <UploadMapping   t={t} d={d} supabase={supabase} profile={profile} period={period} outletByCode={outletByCode} outletsLoaded={outlets.length} onOutletsNeeded={loadOutlets} />}
      {tab === "promotor" && <DataPromotor    t={t} d={d} supabase={supabase} profile={profile} />}
      {tab === "preview"  && <PreviewData     t={t} d={d} supabase={supabase} period={period} outletByCode={outletByCode} />}
      {tab === "geofence" && <GeofenceSettings t={t} d={d} supabase={supabase} profile={profile} outlets={outlets} isFullAdmin={isFullAdmin} />}
      {tab === "ga"       && <GaValidation    t={t} d={d} supabase={supabase} profile={profile} isFullAdmin={isFullAdmin} />}
    </div>
  );
}

/* ══════════════════════════ UPLOAD MAPPING ════════════════════════════ */
function UploadMapping({ t, d, supabase, profile, period, outletByCode, outletsLoaded, onOutletsNeeded }) {
  const fileRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [rows, setRows] = useState(null);        // parsed+validated expanded rows
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  const region = profile?.region || "";
  const picRegion = profile?.role === "pic_region" ? canonRegion(profile?.region) : null;

  const resetParse = () => { setRows(null); setFileName(""); setResult(null); setErr(""); if (fileRef.current) fileRef.current.value = ""; };

  /* Download Excel bulan terpilih (data terkini / template) — format Data Mapping Promotor */
  const downloadExcel = async () => {
    setErr("");
    const { data } = await supabase.from("pts_assignment").select("*").eq("period", period);
    const body = (data || []).map((r) => {
      const o = outletByCode.get(String(r.outlet_code || "").toUpperCase());
      return [r.brand || o?.brand || "", r.outlet_code, o?.name || "", r.cluster || o?.cluster || "", r.branch, r.area, r.region, o?.longitude ?? "", o?.latitude ?? "", r.promotor_id || ""];
    });
    if (body.length === 0) body.push(["IM3", "OTL-MDN-014", "Outlet Contoh Medan", "Cluster A", "Medan", "Medan Kota", picRegion || "NORTH SUMATERA", 98.6785, 3.5952, "PRO-0001"]);
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...body]);
    ws["!cols"] = [{ wch: 10 }, { wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Mapping ${period}`);
    XLSX.writeFile(wb, `PTS_Mapping_${period}.xlsx`);
  };

  /* Parse file → 1 baris = 1 outlet, kunci = ID Promotor → validasi */
  const parseFile = async (file) => {
    setErr(""); setResult(null);
    try {
      if (outletsLoaded === 0) await onOutletsNeeded();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
      if (!raw.length) { setErr("File kosong."); return; }
      const head = raw[0].map((h) => String(h || "").trim().toLowerCase());
      const idx = (name) => head.findIndex((h) => h === name.toLowerCase());
      const iBrand = idx("brand"), iOutlet = idx("id outlet"), iNama = idx("nama outlet"), iCluster = idx("cluster"),
            iBranch = idx("branch"), iArea = idx("area"), iRegion = idx("region"),
            iLng = idx("longitude"), iLat = idx("latitude"), iPromo = idx("id promotor");
      if (iOutlet < 0 || iPromo < 0) { setErr("Header wajib tidak ditemukan: butuh 'ID Outlet' dan 'ID Promotor'."); return; }

      const expanded = [];
      for (let r = 1; r < raw.length; r++) {
        const row = raw[r]; if (!row || row.every((c) => c === "" || c == null)) continue;
        const code = String(row[iOutlet] ?? "").trim();
        const promotorId = String(row[iPromo] ?? "").trim();
        const brand = iBrand >= 0 ? String(row[iBrand] ?? "").trim() : "";
        const namaOutlet = iNama >= 0 ? String(row[iNama] ?? "").trim() : "";
        const cluster = iCluster >= 0 ? String(row[iCluster] ?? "").trim() : "";
        const branch = iBranch >= 0 ? String(row[iBranch] ?? "").trim() : "";
        const area = iArea >= 0 ? String(row[iArea] ?? "").trim() : "";
        const regRaw = iRegion >= 0 ? String(row[iRegion] ?? "").trim() : "";
        const regCanon = canonRegion(regRaw) || canonRegion(region);
        const lng = iLng >= 0 ? Number(row[iLng]) : null;
        const lat = iLat >= 0 ? Number(row[iLat]) : null;
        const o = outletByCode.get(code.toUpperCase());
        const errs = [];
        if (!code) errs.push("ID Outlet kosong");
        if (!promotorId) errs.push("ID Promotor kosong");
        if (!regCanon) errs.push("Region harus North/Central/South Sumatera");
        else if (picRegion && regCanon !== picRegion) errs.push(`Di luar wilayah Anda (${picRegion})`);
        if (!o && (lat == null || isNaN(lat) || lng == null || isNaN(lng))) errs.push("Outlet baru wajib isi Latitude & Longitude");
        expanded.push({
          rowNo: r + 1, period, brand: brand || o?.brand || "", promotor_id: promotorId,
          outlet_code: code, outlet_id: o?.id || null, outlet_name: namaOutlet || o?.name || code,
          cluster: cluster || o?.cluster || "", branch: branch || o?.branch || "", area: area || o?.area || "",
          region: regCanon || regRaw, lat: !isNaN(lat) ? lat : (o?.latitude ?? null), lng: !isNaN(lng) ? lng : (o?.longitude ?? null),
          status: "active", isNewOutlet: !o, errors: errs,
        });
      }
      setRows(expanded);
    } catch (e) {
      setErr("Gagal membaca file: " + (e?.message || e));
    }
  };

  const onPick = (e) => { const f = e.target.files?.[0]; if (f) { setFileName(f.name); parseFile(f); } };
  const onDrop = (e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) { setFileName(f.name); parseFile(f); } };

  const errorCount = rows ? rows.filter((r) => r.errors.length).length : 0;
  const okRows = rows ? rows.filter((r) => !r.errors.length) : [];
  const uniqPromotors = rows ? new Set(okRows.map((r) => r.promotor_id.toUpperCase())).size : 0;
  const newOutlets = rows ? [...new Set(okRows.filter((r) => r.isNewOutlet && r.outlet_code).map((r) => r.outlet_code.toUpperCase()))] : [];
  const unknownPromotors = rows ? [...new Set(okRows.map((r) => r.promotor_id.toUpperCase()))] : [];

  /* Simpan: buat outlet baru → replace mapping bulan ini (relasi kunci: ID Promotor) */
  const save = async () => {
    if (!okRows.length) return;
    setBusy(true); setErr(""); setResult(null);
    try {
      // 1) Auto-create/update outlet dari data mapping (brand, cluster, koordinat)
      const seenOut = new Set();
      const outletPayload = [];
      okRows.forEach((r) => {
        if (!r.outlet_code) return;
        const key = r.outlet_code.toUpperCase();
        if (!seenOut.has(key)) {
          seenOut.add(key);
          outletPayload.push({ code: r.outlet_code, name: r.outlet_name || r.outlet_code, brand: r.brand, cluster: r.cluster, branch: r.branch, area: r.area, region: r.region, latitude: r.lat, longitude: r.lng, status: "active" });
        }
      });
      if (outletPayload.length) {
        const { error: outErr } = await supabase.from("pts_outlet").upsert(outletPayload, { onConflict: "code" });
        if (outErr) throw outErr;
      }

      // 2) Resolve promotor_id (business key) → pts_promotor.id (uuid). Promotor harus sudah terdaftar di Data Promotor.
      const { data: pros } = await supabase.from("pts_promotor").select("id,promotor_id,email,full_name").not("promotor_id", "is", null);
      const proByBizId = new Map((pros || []).map((p) => [String(p.promotor_id).toUpperCase(), p]));
      const missingPromotors = [...new Set(okRows.map((r) => r.promotor_id.toUpperCase()))].filter((pid) => !proByBizId.has(pid));
      if (missingPromotors.length) {
        throw new Error(`ID Promotor belum terdaftar di tab "Data Promotor": ${missingPromotors.slice(0, 8).join(", ")}${missingPromotors.length > 8 ? ` (+${missingPromotors.length - 8} lainnya)` : ""}. Daftarkan dulu di tab Data Promotor sebelum upload mapping.`);
      }

      // 3) Refresh master → resolve outlet_id untuk semua kode
      const { data: freshOutlets } = await supabase.from("pts_outlet").select("id,code");
      const idByCode = new Map((freshOutlets || []).map((o) => [String(o.code).trim().toUpperCase(), o.id]));

      // 4) Replace mapping bulan ini
      const { error: delErr } = await supabase.from("pts_assignment").delete().eq("period", period);
      if (delErr) throw delErr;
      const payload = okRows.map((r) => {
        const pro = proByBizId.get(r.promotor_id.toUpperCase());
        return {
          period: r.period, email: pro?.email || "", full_name: pro?.full_name || "",
          promotor_id_ref: pro?.id || null, brand: r.brand, cluster: r.cluster,
          outlet_id: idByCode.get(r.outlet_code.toUpperCase()) || null,
          outlet_code: r.outlet_code, branch: r.branch, area: r.area, region: r.region,
          status: "active", assigned_by: profile?.id || null,
        };
      });
      const { error: insErr } = await supabase.from("pts_assignment").insert(payload);
      if (insErr) throw insErr;

      await onOutletsNeeded(); // muat ulang master outlet di modul
      setResult({ mappings: payload.length, promotors: uniqPromotors, skipped: errorCount, newOutlets: outletPayload.filter((o) => !outletByCode.get(o.code.toUpperCase())).length });
      setRows(null); setFileName(""); if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setErr("Gagal menyimpan: " + (e?.message || e));
    } finally { setBusy(false); }
  };

  return (
    <div>
      {/* Banner bulan aktif */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 16px", borderRadius: 12, background: t.brandBg, border: `1px solid ${t.brandBd}`, marginBottom: 18 }}>
        <Info size={17} color={t.brand} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13.5, color: t.hi, fontWeight: 500 }}>
          Anda sedang mengedit mapping bulan <b style={{ color: t.brand }}>{ymLabel(period)}</b>. Perubahan hanya berlaku untuk bulan ini.
        </span>
      </div>

      {/* Aksi: download + dropzone */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button className="pts-btn" onClick={downloadExcel}
            style={{ background: t.card, color: t.hi, border: `1px solid ${t.line}`, boxShadow: t.sm }}>
            <Download size={15} /> Download Excel {ymLabel(period)}
          </button>
          <span style={{ fontSize: 12.5, color: t.mid, alignSelf: "center", display: "flex", alignItems: "center", gap: 6 }}>
            <ChevronRight size={13} /> Unduh, edit di Excel, lalu upload kembali di bawah.
          </span>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `1.5px dashed ${drag ? t.brand : t.line}`, borderRadius: 14, padding: "34px 24px", textAlign: "center", cursor: "pointer",
            background: drag ? t.brandBg : t.sub, transition: "all .15s",
          }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onPick} />
          <div style={{ width: 48, height: 48, borderRadius: 12, margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center", background: t.card, border: `1px solid ${t.line}`, color: t.brand }}>
            <FileSpreadsheet size={22} />
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: t.hi }}>{fileName || "Tarik file .xlsx / .csv ke sini, atau klik untuk memilih"}</div>
          <div style={{ fontSize: 12.5, color: t.mid, marginTop: 5 }}>Kolom: Brand · ID Outlet · Nama Outlet · Cluster · Branch · Area · Region · Longitude · Latitude · ID Promotor</div>
          <div style={{ fontSize: 11.5, color: t.lo, marginTop: 3 }}>1 baris = 1 outlet. ID Promotor harus sudah terdaftar di tab &ldquo;Data Promotor&rdquo;. Region valid: North/Central/South Sumatera.</div>
        </div>
      </div>

      {err && (
        <div style={{ marginTop: 16, display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: t.redBg, border: `1px solid ${t.redBd}` }}>
          <AlertTriangle size={16} color={t.red} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, color: t.hi }}>{err}</span>
        </div>
      )}

      {result && (
        <div style={{ marginTop: 16, display: "flex", gap: 11, padding: "14px 16px", borderRadius: 12, background: t.greenBg, border: `1px solid ${t.greenBd}` }}>
          <CheckCircle2 size={18} color={t.green} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13.5, color: t.hi }}>
            <b>Mapping {ymLabel(period)} tersimpan.</b> {result.mappings} mapping outlet untuk {result.promotors} Promotor.
            {result.newOutlets > 0 && <span style={{ color: t.blue }}> {result.newOutlets} outlet baru dibuat.</span>}
            {result.skipped > 0 && <span style={{ color: t.amber }}> {result.skipped} baris dilewati karena error.</span>}
          </div>
        </div>
      )}

      {/* Pratinjau hasil parse */}
      {rows && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: t.hi }}>Pratinjau: {rows.length} baris mapping</span>
              <Chip t={t} tone="green" icon={<CheckCircle2 size={12} />}>{okRows.length} valid</Chip>
              {errorCount > 0 && <Chip t={t} tone="red" icon={<AlertTriangle size={12} />}>{errorCount} error</Chip>}
              <Chip t={t} tone="blue" icon={<Users size={12} />}>{uniqPromotors} promotor</Chip>
              {newOutlets.length > 0 && <Chip t={t} tone="blue" icon={<Store size={12} />}>{newOutlets.length} outlet baru</Chip>}
            </div>
            <div style={{ display: "flex", gap: 9 }}>
              <button className="pts-btn" onClick={resetParse} style={{ background: t.card, color: t.mid, border: `1px solid ${t.line}` }}><X size={14} /> Batal</button>
              <button className="pts-btn" onClick={save} disabled={busy || okRows.length === 0}
                style={{ background: t.brand, color: "#fff", boxShadow: t.sm }}>
                {busy ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />} Simpan Mapping {ymLabel(period).split(" ")[0]}
              </button>
            </div>
          </div>

          <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, overflow: "hidden", boxShadow: t.sm }}>
            <div style={{ maxHeight: 380, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Baris", "Brand", "ID Outlet", "Nama Outlet", "Cluster", "Branch", "Area", "Region", "ID Promotor", "Status"].map((h) => <th key={h} className="pts-th">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 300).map((r, i) => {
                    const bad = r.errors.length > 0;
                    return (
                      <tr key={i} className="pts-row" style={{ background: bad ? t.redBg : "transparent" }}>
                        <td className="pts-td" style={{ color: t.mid }}>{r.rowNo}</td>
                        <td className="pts-td">{r.brand || "—"}</td>
                        <td className="pts-td" style={{ fontFamily: "monospace", fontSize: 12 }}>{r.outlet_code || "—"}</td>
                        <td className="pts-td" style={{ fontWeight: 600 }}>{r.outlet_name || "—"}</td>
                        <td className="pts-td">{r.cluster || "—"}</td>
                        <td className="pts-td">{r.branch || "—"}</td>
                        <td className="pts-td">{r.area || "—"}</td>
                        <td className="pts-td">{r.region || "—"}</td>
                        <td className="pts-td" style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>{r.promotor_id || "—"}</td>
                        <td className="pts-td">
                          {bad
                            ? <span title={r.errors.join("; ")} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: t.red, fontWeight: 600, fontSize: 12 }}><AlertTriangle size={12} /> {r.errors[0]}</span>
                            : r.isNewOutlet
                              ? <span title="Outlet baru — akan dibuat otomatis" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: t.blue, fontWeight: 600, fontSize: 12 }}><Store size={12} /> Outlet baru</span>
                              : <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: t.green, fontWeight: 600, fontSize: 12 }}><CheckCircle2 size={12} /> OK</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > 300 && <div style={{ padding: "9px 14px", fontSize: 12, color: t.mid, borderTop: `1px solid ${t.lineSoft}` }}>Menampilkan 300 dari {rows.length} baris.</div>}
          </div>
        </div>
      )}

      <style>{`.spin{animation:ptsspin 1s linear infinite}@keyframes ptsspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ══════════════════════════ DATA PROMOTOR ══════════════════════════════
   Master identitas promotor — ID Promotor jadi kunci bisnis (dipakai di
   Data Mapping Promotor & pts_sale), email digeser jadi "Email Pribadi". */
const emptyPromotorForm = () => ({ id: null, promotor_id: "", full_name: "", email: "", phone: "", region: "", effective_date: "", status: "active" });

function DataPromotor({ t, d, supabase, profile }) {
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState(emptyPromotorForm());
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const picRegion = profile?.role === "pic_region" ? canonRegion(profile?.region) : null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from("pts_promotor").select("*").order("full_name", { ascending: true });
      setList(data || []);
    } catch { setList([]); } finally { setLoading(false); }
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter((r) => {
      if (picRegion && canonRegion(r.region) && canonRegion(r.region) !== picRegion) return false;
      if (!s) return true;
      return `${r.promotor_id} ${r.full_name} ${r.email} ${r.phone}`.toLowerCase().includes(s);
    });
  }, [list, q, picRegion]);

  const startNew = () => { setForm({ ...emptyPromotorForm(), region: picRegion || "" }); setEditing(true); setErr(""); };
  const startEdit = (r) => { setForm({ id: r.id, promotor_id: r.promotor_id || "", full_name: r.full_name || "", email: r.email || "", phone: r.phone || "", region: r.region || "", effective_date: r.effective_date || "", status: r.status || "active" }); setEditing(true); setErr(""); };
  const cancel = () => { setEditing(false); setForm(emptyPromotorForm()); setErr(""); };

  const save = async () => {
    setErr("");
    if (!form.promotor_id.trim()) return setErr("ID Promotor wajib diisi.");
    if (!form.full_name.trim()) return setErr("Nama Promotor wajib diisi.");
    if (form.email && !emailValid(form.email)) return setErr("Email Pribadi tidak valid.");
    setBusy(true);
    try {
      const payload = {
        promotor_id: form.promotor_id.trim(), full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase() || `${form.promotor_id.trim().toLowerCase()}@pts.local`,
        phone: form.phone.trim() || null, region: form.region || null,
        effective_date: form.effective_date || null, status: form.status,
      };
      if (form.id) {
        const { error } = await supabase.from("pts_promotor").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("pts_promotor").insert(payload);
        if (error) throw error;
      }
      await load(); cancel();
    } catch (e) {
      setErr("Gagal menyimpan: " + (e?.message || e));
    } finally { setBusy(false); }
  };

  const toggleStatus = async (r) => {
    const next = r.status === "active" ? "inactive" : "active";
    await supabase.from("pts_promotor").update({ status: next }).eq("id", r.id);
    load();
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 16px", borderRadius: 12, background: t.brandBg, border: `1px solid ${t.brandBd}`, marginBottom: 18 }}>
        <Info size={17} color={t.brand} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13.5, color: t.hi, fontWeight: 500 }}>
          Master identitas Promotor. <b>ID Promotor</b> adalah kunci yang dipakai saat mengisi <b>Data Mapping Promotor</b> — daftarkan promotor di sini dulu sebelum melakukan mapping outlet.
        </span>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: t.mid }} />
          <input className="pts-in" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari ID Promotor / nama / email"
            style={{ paddingLeft: 32, width: 260 }} />
        </div>
        <div style={{ display: "flex", gap: 9 }}>
          <button className="pts-btn" onClick={load} style={{ background: t.card, color: t.mid, border: `1px solid ${t.line}` }}><RefreshCw size={14} /> Muat ulang</button>
          <button className="pts-btn" onClick={startNew} style={{ background: t.brand, color: "#fff", boxShadow: t.sm }}><Plus size={15} /> Promotor Baru</button>
        </div>
      </div>

      {editing && (
        <div style={{ marginBottom: 18, padding: 18, borderRadius: 14, background: t.card, border: `1px solid ${t.line}`, boxShadow: t.md }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.hi, marginBottom: 14 }}>{form.id ? "Ubah Data Promotor" : "Tambah Promotor Baru"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <Field t={t} label="ID Promotor *"><input className="pts-in" value={form.promotor_id} onChange={(e) => setForm({ ...form, promotor_id: e.target.value })} placeholder="PRO-0001" disabled={!!form.id} /></Field>
            <Field t={t} label="Nama Promotor *"><input className="pts-in" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Nama lengkap" /></Field>
            <Field t={t} label="Email Pribadi"><input className="pts-in" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nama@email.com" /></Field>
            <Field t={t} label="No. HP"><input className="pts-in" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="08xx" /></Field>
            <Field t={t} label="Region">
              <select className="pts-in" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} disabled={!!picRegion}>
                <option value="">— pilih region —</option>
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field t={t} label="Tanggal Efektif Bekerja"><input className="pts-in" type="date" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} /></Field>
          </div>
          {err && <div style={{ marginTop: 12, fontSize: 12.5, color: t.red, display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={13} />{err}</div>}
          <div style={{ display: "flex", gap: 9, marginTop: 16, justifyContent: "flex-end" }}>
            <button className="pts-btn" onClick={cancel} style={{ background: t.sub, color: t.mid, border: `1px solid ${t.line}` }}><X size={14} /> Batal</button>
            <button className="pts-btn" onClick={save} disabled={busy} style={{ background: t.brand, color: "#fff", boxShadow: t.sm }}>{busy ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Simpan</button>
          </div>
        </div>
      )}

      <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, overflow: "hidden", boxShadow: t.sm }}>
        <div style={{ overflow: "auto", maxHeight: 560 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
            <thead><tr>{["ID Promotor", "Nama", "Email Pribadi", "No. HP", "Region", "Efektif Bekerja", "Status", ""].map((h) => <th key={h} className="pts-th">{h}</th>)}</tr></thead>
            <tbody>
              {loading ? (
                <tr><td className="pts-td" colSpan={8} style={{ textAlign: "center", padding: 40, color: t.mid }}><Loader2 size={20} className="spin" style={{ verticalAlign: "middle" }} /> Memuat…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td className="pts-td" colSpan={8} style={{ textAlign: "center", padding: 44, color: t.mid }}><Users size={24} style={{ opacity: .5, marginBottom: 8 }} /><br />Belum ada Promotor terdaftar.</td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id} className="pts-row">
                  <td className="pts-td" style={{ fontFamily: "monospace", fontWeight: 700 }}>{r.promotor_id || "—"}</td>
                  <td className="pts-td" style={{ fontWeight: 600 }}>{r.full_name}</td>
                  <td className="pts-td" style={{ color: t.mid }}>{r.email}</td>
                  <td className="pts-td">{r.phone || "—"}</td>
                  <td className="pts-td">{r.region || "—"}</td>
                  <td className="pts-td">{r.effective_date ? fmtDate(r.effective_date) : "—"}</td>
                  <td className="pts-td">
                    {r.status === "active"
                      ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: t.greenBg, color: t.green, border: `1px solid ${t.greenBd}` }}><UserCheck size={11} /> Aktif</span>
                      : <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: t.hover, color: t.mid, border: `1px solid ${t.line}` }}><UserX size={11} /> Nonaktif</span>}
                  </td>
                  <td className="pts-td">
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => startEdit(r)} title="Ubah" style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${t.line}`, background: t.card, color: t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Pencil size={13} /></button>
                      <button onClick={() => toggleStatus(r)} title={r.status === "active" ? "Nonaktifkan" : "Aktifkan"} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${t.line}`, background: t.card, color: t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Ban size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: t.mid }}>{filtered.length} Promotor.</div>
    </div>
  );
}

function Field({ t, label, children }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: t.mid, marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

/* ══════════════════════════ PREVIEW DATA ══════════════════════════════ */
function PreviewData({ t, d, supabase, period, outletByCode }) {
  const [mode, setMode] = useState("sesi");         // sesi | msisdn
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [statusF, setStatusF] = useState("all");   // all | active | not_logged_in
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(null);   // session id → daftar nomor

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [asgRes, sesRes, proRes] = await Promise.all([
        supabase.from("pts_assignment").select("*").eq("period", period),
        supabase.from("pts_session").select("*").eq("period", period).order("check_in_at", { ascending: false }),
        supabase.from("pts_promotor").select("email,status,full_name,phone"),
      ]);
      const assignments = asgRes.data || [];
      const sessions = sesRes.data || [];
      const proByEmail = new Map((proRes.data || []).map((p) => [(p.email || "").toLowerCase(), p]));

      // sales per session
      let salesBySession = new Map();
      if (sessions.length) {
        const ids = sessions.map((s) => s.id);
        const { data: sales } = await supabase.from("pts_sale").select("session_id,phone_normalized,tagged_at").in("session_id", ids);
        (sales || []).forEach((s) => {
          if (!salesBySession.has(s.session_id)) salesBySession.set(s.session_id, []);
          salesBySession.get(s.session_id).push(s);
        });
      }

      const asgMeta = new Map(); // email → {full_name, branch, area, region, outlets:Set}
      assignments.forEach((a) => {
        const k = (a.email || "").toLowerCase();
        if (!asgMeta.has(k)) asgMeta.set(k, { email: a.email, full_name: a.full_name, branch: a.branch, area: a.area, region: a.region, outlets: new Set() });
        asgMeta.get(k).outlets.add(a.outlet_code);
      });

      const out = [];
      const emailsWithSession = new Set();

      // 1 baris per sesi
      sessions.forEach((s) => {
        const k = (s.email || "").toLowerCase(); emailsWithSession.add(k);
        const meta = asgMeta.get(k) || {};
        const pro = proByEmail.get(k);
        const outlet = outletByCode.get(String(s.outlet_code || "").toUpperCase());
        const sales = salesBySession.get(s.id) || [];
        out.push({
          kind: "session", id: s.id,
          region: outlet?.region || meta.region || "", branch: outlet?.branch || meta.branch || "", area: outlet?.area || meta.area || "",
          outlet: outlet?.name || s.outlet_code || "—", outlet_code: s.outlet_code || "",
          nama: meta.full_name || pro?.full_name || "—", email: s.email || "",
          statusAkun: pro?.status === "active" ? "Aktif" : (pro ? "Aktif" : "Aktif"),
          checkIn: s.check_in_at, checkInLat: s.check_in_lat, checkInLng: s.check_in_lng, checkInPhoto: s.check_in_photo_url,
          checkOut: s.check_out_at, checkOutLat: s.check_out_lat, checkOutLng: s.check_out_lng, checkOutPhoto: s.check_out_photo_url,
          sales, salesCount: sales.length,
          statusSesi: s.auto_checkout ? "Auto-Checkout" : (s.check_out_at ? "Selesai" : "Aktif"),
          geoFlag: s.geo_flag || "ok",
        });
      });

      // Promotor di-map tapi belum ada aktivitas / belum login
      asgMeta.forEach((meta, k) => {
        if (emailsWithSession.has(k)) return;
        const pro = proByEmail.get(k);
        const firstOutletCode = [...meta.outlets][0] || "";
        const outlet = outletByCode.get(String(firstOutletCode).toUpperCase());
        out.push({
          kind: "idle", id: "idle-" + k,
          region: outlet?.region || meta.region || "", branch: outlet?.branch || meta.branch || "", area: outlet?.area || meta.area || "",
          outlet: meta.outlets.size > 1 ? `${meta.outlets.size} outlet` : (outlet?.name || firstOutletCode || "—"), outlet_code: firstOutletCode,
          nama: meta.full_name || pro?.full_name || "—", email: meta.email || "",
          statusAkun: pro ? "Aktif" : "Belum Login",
          checkIn: null, checkOut: null, sales: [], salesCount: 0,
          statusSesi: "—", geoFlag: "—",
        });
      });

      setRows(out);
    } catch (e) {
      setRows([]);
    } finally { setLoading(false); }
  }, [supabase, period, outletByCode]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusF === "active" && r.statusAkun !== "Aktif") return false;
      if (statusF === "not_logged_in" && r.statusAkun !== "Belum Login") return false;
      if (s && !(`${r.nama} ${r.email} ${r.outlet} ${r.outlet_code}`.toLowerCase().includes(s))) return false;
      return true;
    });
  }, [rows, statusF, q]);

  const stats = useMemo(() => {
    const emails = new Set(rows.map((r) => r.email.toLowerCase()));
    const belum = new Set(rows.filter((r) => r.statusAkun === "Belum Login").map((r) => r.email.toLowerCase()));
    const sesRows = rows.filter((r) => r.kind === "session");
    const terjual = sesRows.reduce((a, r) => a + r.salesCount, 0);
    return { promotor: emails.size, belum: belum.size, checkin: sesRows.length, terjual };
  }, [rows]);

  const exportExcel = () => {
    const head = ["No", "Tanggal", "Region", "Branch", "Area", "Outlet", "ID Outlet", "Nama Promotor", "Email", "Status Akun", "Check-In", "Lokasi In", "Foto In", "Check-Out", "Lokasi Out", "Foto Out", "Durasi", "Jml Terjual", "Daftar Nomor", "Status Sesi", "Flag Lokasi"];
    const body = filtered.map((r, i) => [
      i + 1, r.checkIn ? fmtDate(r.checkIn) : "—", r.region, r.branch, r.area, r.outlet, r.outlet_code, r.nama, r.email, r.statusAkun,
      r.checkIn ? fmtTime(r.checkIn) : "—", r.checkInLat != null ? `${r.checkInLat}, ${r.checkInLng}` : "—", r.checkInPhoto || "—",
      r.checkOut ? fmtTime(r.checkOut) : "—", r.checkOutLat != null ? `${r.checkOutLat}, ${r.checkOutLng}` : "—", r.checkOutPhoto || "—",
      durationOf(r.checkIn, r.checkOut) || "—", r.salesCount, (r.sales || []).map((s) => s.phone_normalized).join(" | ") || "—", r.statusSesi, r.geoFlag,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Preview ${period}`);
    XLSX.writeFile(wb, `PTS_Preview_${period}.xlsx`);
  };

  const cellLoc = (lat, lng) => lat != null
    ? <a href={`https://maps.google.com/?q=${lat},${lng}`} target="_blank" rel="noreferrer" style={{ color: t.blue, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}><MapPin size={11} />{Number(lat).toFixed(4)},{Number(lng).toFixed(4)}</a>
    : <span style={{ color: t.lo }}>—</span>;
  const openPhoto = async (p) => {
    if (!p) return;
    let path = p;
    if (/^https?:\/\//.test(path)) { const m = path.match(/pts-photos\/(.+)$/); if (m) path = m[1]; else { window.open(p, "_blank"); return; } }
    const { data } = await supabase.storage.from("pts-photos").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };
  const cellPhoto = (url) => url
    ? <button onClick={() => openPhoto(url)} style={{ color: t.blue, background: "none", border: "none", cursor: "pointer", fontFamily: FF, fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 4, padding: 0 }}><ImageIcon size={12} /> lihat</button>
    : <span style={{ color: t.lo }}>—</span>;

  const modeToggle = (
    <div style={{ marginBottom: 16 }}>
      <Segmented t={t} value={mode} onChange={setMode}
        options={[
          { value: "sesi", label: "Aktivitas (Sesi)", icon: <LogIn size={13} /> },
          { value: "msisdn", label: "Penjualan (MSISDN)", icon: <Phone size={13} /> },
        ]} />
    </div>
  );

  if (mode === "msisdn") return <div>{modeToggle}<MsisdnPanel t={t} supabase={supabase} period={period} outletByCode={outletByCode} /></div>;

  return (
    <div>
      {modeToggle}
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 16px", borderRadius: 12, background: t.amberBg, border: `1px solid ${t.amberBd}`, marginBottom: 18 }}>
        <Info size={17} color={t.amber} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: t.hi }}>
          Sistem Check-In / Check-Out sudah <b>dihentikan</b> dan digantikan alur geofencing langsung pada tagging SP. Tabel di bawah adalah <b>data historis</b> sesi lama (dipertahankan untuk arsip). Aktivitas tagging terbaru — termasuk jarak ke outlet &amp; status validasi GA — ada di tab <b>Penjualan (MSISDN)</b>.
        </span>
      </div>
      {/* Stats */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <Stat t={t} icon={<Users size={18} />}       label="Promotor ter-map" value={stats.promotor} accent={{ fg: t.mag, bg: t.magBg, bd: t.magBd }} />
        <Stat t={t} icon={<UserX size={18} />}        label="Belum login"      value={stats.belum}    accent={{ fg: t.amber, bg: t.amberBg, bd: t.amberBd }} />
        <Stat t={t} icon={<LogIn size={18} />}        label="Sesi check-in"    value={stats.checkin}  accent={{ fg: t.blue, bg: t.blueBg, bd: t.blueBd }} />
        <Stat t={t} icon={<ShoppingBag size={18} />}  label="Kartu terjual"    value={stats.terjual}  accent={{ fg: t.green, bg: t.greenBg, bd: t.greenBd }} />
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Segmented t={t} value={statusF} onChange={setStatusF}
            options={[
              { value: "all", label: "Semua", count: rows.length },
              { value: "active", label: "Aktif" },
              { value: "not_logged_in", label: "Belum login", icon: <UserX size={13} /> },
            ]} />
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: t.mid }} />
            <input className="pts-in" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / email / outlet"
              style={{ paddingLeft: 32, width: 240 }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 9 }}>
          <button className="pts-btn" onClick={load} style={{ background: t.card, color: t.mid, border: `1px solid ${t.line}` }}><RefreshCw size={14} /> Muat ulang</button>
          <button className="pts-btn" onClick={exportExcel} disabled={!filtered.length} style={{ background: t.brand, color: "#fff", boxShadow: t.sm }}><Download size={15} /> Export Excel</button>
        </div>
      </div>

      {/* Tabel komprehensif */}
      <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, overflow: "hidden", boxShadow: t.sm }}>
        <div style={{ overflow: "auto", maxHeight: 620 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
            <thead>
              <tr>
                {["No", "Tgl", "Branch", "Area", "ID Outlet", "Promotor", "Email", "Status Akun", "Check-In", "Lokasi In", "Foto In", "Check-Out", "Lokasi Out", "Foto Out", "Durasi", "Terjual", "Status Sesi", "Flag"].map((h) => (
                  <th key={h} className="pts-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="pts-td" colSpan={18} style={{ textAlign: "center", padding: 40, color: t.mid }}><Loader2 size={20} className="spin" style={{ verticalAlign: "middle" }} /> Memuat data…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td className="pts-td" colSpan={18} style={{ textAlign: "center", padding: 48, color: t.mid }}>
                  <Store size={26} style={{ opacity: .5, marginBottom: 8 }} /><br />
                  Belum ada data untuk {ymLabel(period)}. Upload mapping terlebih dulu di tab <b>Upload Mapping</b>.
                </td></tr>
              ) : filtered.map((r, i) => {
                const belum = r.statusAkun === "Belum Login";
                return (
                  <React.Fragment key={r.id}>
                    <tr className="pts-row" style={{ background: belum ? t.amberBg : "transparent" }}>
                      <td className="pts-td" style={{ color: t.mid }}>{i + 1}</td>
                      <td className="pts-td">{r.checkIn ? fmtDate(r.checkIn) : <span style={{ color: t.lo }}>—</span>}</td>
                      <td className="pts-td">{r.branch || "—"}</td>
                      <td className="pts-td">{r.area || "—"}</td>
                      <td className="pts-td" style={{ fontFamily: "monospace", fontSize: 11.5, color: t.mid }}>{r.outlet_code || "—"}</td>
                      <td className="pts-td" style={{ fontWeight: 600 }}>{r.nama}</td>
                      <td className="pts-td" style={{ color: t.mid }}>{r.email}</td>
                      <td className="pts-td">
                        {belum
                          ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: t.amberBg, color: t.amber, border: `1px solid ${t.amberBd}` }}><UserX size={11} /> Belum Login</span>
                          : <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: t.greenBg, color: t.green, border: `1px solid ${t.greenBd}` }}><UserCheck size={11} /> Aktif</span>}
                      </td>
                      <td className="pts-td" style={{ fontWeight: 600 }}>{r.checkIn ? fmtTime(r.checkIn) : <span style={{ color: t.lo }}>—</span>}</td>
                      <td className="pts-td">{r.checkIn ? cellLoc(r.checkInLat, r.checkInLng) : <span style={{ color: t.lo }}>—</span>}</td>
                      <td className="pts-td">{r.checkIn ? cellPhoto(r.checkInPhoto) : <span style={{ color: t.lo }}>—</span>}</td>
                      <td className="pts-td" style={{ fontWeight: 600 }}>{r.checkOut ? fmtTime(r.checkOut) : <span style={{ color: t.lo }}>—</span>}</td>
                      <td className="pts-td">{r.checkOut ? cellLoc(r.checkOutLat, r.checkOutLng) : <span style={{ color: t.lo }}>—</span>}</td>
                      <td className="pts-td">{r.checkOut ? cellPhoto(r.checkOutPhoto) : <span style={{ color: t.lo }}>—</span>}</td>
                      <td className="pts-td">{durationOf(r.checkIn, r.checkOut) || <span style={{ color: t.lo }}>—</span>}</td>
                      <td className="pts-td">
                        {r.salesCount > 0
                          ? <button onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                              style={{ display: "inline-flex", alignItems: "center", gap: 5, background: t.brandBg, color: t.brand, border: `1px solid ${t.brandBd}`, borderRadius: 8, padding: "3px 9px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FF }}>
                              {r.salesCount} <ChevronRight size={12} style={{ transform: expanded === r.id ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                            </button>
                          : <span style={{ color: t.lo }}>0</span>}
                      </td>
                      <td className="pts-td">
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: r.statusSesi === "Aktif" ? t.blue : r.statusSesi === "Selesai" ? t.green : r.statusSesi === "Auto-Checkout" ? t.amber : t.lo }}>{r.statusSesi}</span>
                      </td>
                      <td className="pts-td"><span style={{ fontSize: 11.5, color: r.geoFlag === "ok" ? t.mid : t.amber }}>{r.geoFlag}</span></td>
                    </tr>
                    {expanded === r.id && r.sales.length > 0 && (
                      <tr>
                        <td colSpan={18} style={{ padding: "12px 16px", background: t.sub, borderBottom: `1px solid ${t.lineSoft}` }}>
                          <div style={{ fontSize: 11.5, fontWeight: 700, color: t.mid, marginBottom: 8, letterSpacing: "0.04em", textTransform: "uppercase" }}>Daftar nomor terjual ({r.sales.length})</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {r.sales.map((s, k) => (
                              <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 10px", borderRadius: 8, background: t.card, border: `1px solid ${t.line}`, fontSize: 12.5, fontFamily: "monospace", color: t.hi }}>
                                {s.phone_normalized}<span style={{ fontFamily: FF, color: t.lo, fontSize: 11 }}>{fmtTime(s.tagged_at)}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: t.mid }}>
        Menampilkan {filtered.length} baris · Baris <b style={{ color: t.amber }}>kuning</b> = Promotor sudah di-map bulan ini tapi belum pernah login.
      </div>

      <style>{`.spin{animation:ptsspin 1s linear infinite}@keyframes ptsspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ══════════════════════════ MSISDN (level penjualan) ══════════════════ */
function MsisdnPanel({ t, supabase, period, outletByCode }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [geoF, setGeoF] = useState("all");   // all | within | outside
  const [gaF, setGaF] = useState("all");     // all | BELUM_TERVALIDASI | TERVALIDASI | ...
  const outletById = useMemo(() => { const m = new Map(); outletByCode.forEach((o) => m.set(o.id, o)); return m; }, [outletByCode]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [y, mo] = period.split("-").map(Number);
      const start = `${period}-01`;
      const nd = new Date(y, mo, 1);
      const end = `${nd.getFullYear()}-${pad2(nd.getMonth() + 1)}-01`;
      const { data: sales } = await supabase.from("pts_sale")
        .select("id,phone_normalized,email,outlet_id,region,lat,lng,tagged_at,raw_qr_value,distance_meters,within_radius,outside_confirmed_at,ga_status")
        .gte("tagged_at", start).lt("tagged_at", end).order("tagged_at", { ascending: false });
      const { data: pros } = await supabase.from("pts_promotor").select("email,full_name");
      const nameByEmail = new Map((pros || []).map((p) => [(p.email || "").toLowerCase(), p.full_name]));
      setRows((sales || []).map((s) => {
        const o = outletById.get(s.outlet_id);
        return { ...s, nama: nameByEmail.get((s.email || "").toLowerCase()) || "—", outlet_code: o?.code || "", branch: o?.branch || "", area: o?.area || "", region: s.region || o?.region || "" };
      }));
    } catch { setRows([]); } finally { setLoading(false); }
  }, [supabase, period, outletById]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (geoF === "within" && r.within_radius === false) return false;
      if (geoF === "outside" && r.within_radius !== false) return false;
      if (gaF !== "all" && (r.ga_status || "BELUM_TERVALIDASI") !== gaF) return false;
      if (s && !`${r.phone_normalized} ${r.nama} ${r.email} ${r.outlet_code}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [rows, q, geoF, gaF]);

  const stats = useMemo(() => {
    const outside = rows.filter((r) => r.within_radius === false).length;
    const belum = rows.filter((r) => (r.ga_status || "BELUM_TERVALIDASI") === "BELUM_TERVALIDASI").length;
    return { total: rows.length, outside, belum };
  }, [rows]);

  const download = () => {
    const head = ["No", "Tanggal", "Jam", "MSISDN", "Nama Promotor", "Email", "ID Outlet", "Branch", "Area", "Region", "Latitude", "Longitude", "Jarak ke Outlet (m)", "Dalam Radius?", "Status Validasi GA"];
    const body = filtered.map((r, i) => [i + 1, fmtDate(r.tagged_at), fmtTime(r.tagged_at), r.phone_normalized, r.nama, r.email, r.outlet_code, r.branch, r.area, r.region, r.lat ?? "", r.lng ?? "", r.distance_meters ?? "", r.within_radius === false ? "Tidak" : "Ya", GA_STATUS_LABEL[r.ga_status] || r.ga_status]);
    const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
    ws["!cols"] = [{ wch: 5 }, { wch: 12 }, { wch: 8 }, { wch: 16 }, { wch: 20 }, { wch: 26 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 20 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, `MSISDN ${period}`);
    XLSX.writeFile(wb, `PTS_MSISDN_${period}.xlsx`);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Stat t={t} icon={<Phone size={18} />}      label="Total tagging"        value={stats.total}  accent={{ fg: t.mag, bg: t.magBg, bd: t.magBd }} />
        <Stat t={t} icon={<Radar size={18} />}       label="Di luar radius"       value={stats.outside} accent={{ fg: t.blue, bg: t.blueBg, bd: t.blueBd }} />
        <Stat t={t} icon={<Clock size={18} />}       label="Belum tervalidasi GA" value={stats.belum}  accent={{ fg: t.amber, bg: t.amberBg, bd: t.amberBd }} />
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: t.mid }} />
            <input className="pts-in" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari MSISDN / nama / email / outlet" style={{ paddingLeft: 32, width: 240 }} />
          </div>
          <Segmented t={t} value={geoF} onChange={setGeoF} options={[
            { value: "all", label: "Semua lokasi" },
            { value: "within", label: "Dalam radius" },
            { value: "outside", label: "Luar radius" },
          ]} />
          <select className="pts-in" value={gaF} onChange={(e) => setGaF(e.target.value)}>
            <option value="all">Semua status GA</option>
            {Object.entries(GA_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 9 }}>
          <button className="pts-btn" onClick={load} style={{ background: t.card, color: t.mid, border: `1px solid ${t.line}` }}><RefreshCw size={14} /> Muat ulang</button>
          <button className="pts-btn" onClick={download} disabled={!filtered.length} style={{ background: t.brand, color: "#fff", boxShadow: t.sm }}><Download size={15} /> Download MSISDN</button>
        </div>
      </div>

      <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, overflow: "hidden", boxShadow: t.sm }}>
        <div style={{ overflow: "auto", maxHeight: 620 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
            <thead>
              <tr>{["No", "Tanggal", "Jam", "MSISDN", "Promotor", "ID Outlet", "Branch", "Region", "Jarak (m)", "Lokasi", "Status GA"].map((h) => <th key={h} className="pts-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="pts-td" colSpan={11} style={{ textAlign: "center", padding: 40, color: t.mid }}><Loader2 size={20} className="spin" style={{ verticalAlign: "middle" }} /> Memuat…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td className="pts-td" colSpan={11} style={{ textAlign: "center", padding: 44, color: t.mid }}><Phone size={24} style={{ opacity: .5, marginBottom: 8 }} /><br />Belum ada penjualan untuk {ymLabel(period)}.</td></tr>
              ) : filtered.map((r, i) => (
                <tr key={r.id} className="pts-row">
                  <td className="pts-td" style={{ color: t.mid }}>{i + 1}</td>
                  <td className="pts-td">{fmtDate(r.tagged_at)}</td>
                  <td className="pts-td" style={{ fontWeight: 600 }}>{fmtTime(r.tagged_at)}</td>
                  <td className="pts-td" style={{ fontFamily: "monospace", fontWeight: 700 }}>{r.phone_normalized}</td>
                  <td className="pts-td" style={{ fontWeight: 600 }}>{r.nama}</td>
                  <td className="pts-td" style={{ fontFamily: "monospace", fontSize: 11.5 }}>{r.outlet_code || "—"}</td>
                  <td className="pts-td">{r.branch || "—"}</td>
                  <td className="pts-td">{r.region || "—"}</td>
                  <td className="pts-td" style={{ fontFamily: "monospace" }}>{r.distance_meters != null ? Math.round(r.distance_meters) : "—"}</td>
                  <td className="pts-td">
                    {r.within_radius === false
                      ? <span title={r.outside_confirmed_at ? `Dikonfirmasi ${fmtDate(r.outside_confirmed_at)} ${fmtTime(r.outside_confirmed_at)}` : ""} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: t.blueBg, color: t.blue, border: `1px solid ${t.blueBd}` }}><Radar size={11} /> Luar area</span>
                      : <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: t.greenBg, color: t.green, border: `1px solid ${t.greenBd}` }}><CheckCircle2 size={11} /> Dalam area</span>}
                  </td>
                  <td className="pts-td"><Chip t={t} tone={GA_STATUS_TONE[r.ga_status] || "amber"}>{GA_STATUS_LABEL[r.ga_status] || r.ga_status}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: t.mid }}>
        Data pada level MSISDN · {filtered.length} baris · Status GA divalidasi dalam rentang 3 hari dari waktu tagging (lihat tab <b>Validasi GA</b>).
      </div>
      <style>{`.spin{animation:ptsspin 1s linear infinite}@keyframes ptsspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ══════════════════════════ GEOFENCE SETTINGS ══════════════════════════
   Radius (meter) yang dipakai untuk validasi lokasi saat tagging SP.
   Resolusi: outlet > branch > region > global > default 30m. */
function GeofenceSettings({ t, d, supabase, profile, outlets, isFullAdmin }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scopeType, setScopeType] = useState("global");
  const [scopeValue, setScopeValue] = useState("");
  const [radius, setRadius] = useState(30);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from("pts_geofence_setting").select("*").order("scope_type", { ascending: true });
      setRows(data || []);
    } catch { setRows([]); } finally { setLoading(false); }
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  const globalRow = rows.find((r) => r.scope_type === "global");
  const effectiveDefault = globalRow?.radius_meters ?? 30;

  const branches = useMemo(() => [...new Set(outlets.map((o) => o.branch).filter(Boolean))].sort(), [outlets]);
  const outletCodes = useMemo(() => outlets.map((o) => o.code).filter(Boolean).sort(), [outlets]);

  const save = async () => {
    setErr("");
    if (!isFullAdmin) return setErr("Hanya SPM Sumatera yang dapat mengubah radius geofence.");
    if (scopeType !== "global" && !scopeValue.trim()) return setErr("Nilai cakupan (region/branch/kode outlet) wajib diisi.");
    if (!(Number(radius) > 0)) return setErr("Radius harus lebih dari 0 meter.");
    setBusy(true);
    try {
      const payload = { scope_type: scopeType, scope_value: scopeType === "global" ? "" : scopeValue.trim(), radius_meters: Number(radius), updated_by: profile?.id || null, updated_at: new Date().toISOString() };
      const { error } = await supabase.from("pts_geofence_setting").upsert(payload, { onConflict: "scope_type,scope_value" });
      if (error) throw error;
      setScopeValue(""); setRadius(30);
      await load();
    } catch (e) {
      setErr("Gagal menyimpan: " + (e?.message || e));
    } finally { setBusy(false); }
  };

  const remove = async (r) => {
    await supabase.from("pts_geofence_setting").delete().eq("id", r.id);
    load();
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 16px", borderRadius: 12, background: t.brandBg, border: `1px solid ${t.brandBd}`, marginBottom: 18 }}>
        <Radar size={17} color={t.brand} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13.5, color: t.hi, fontWeight: 500 }}>
          Radius maksimum jarak tagging dari titik outlet. Sistem memakai aturan paling spesifik: <b>Outlet → Branch → Region → Global</b>. Jika tidak ada aturan sama sekali, default <b>30 meter</b> dipakai. Di luar radius, tagging tetap tersimpan namun ditandai untuk evaluasi.
        </span>
      </div>

      {!isFullAdmin && (
        <div style={{ marginBottom: 16, padding: "11px 14px", borderRadius: 10, background: t.amberBg, border: `1px solid ${t.amberBd}`, fontSize: 12.5, color: t.hi }}>
          Anda melihat pengaturan ini sebagai read-only. Hanya role <b>SPM Sumatera</b> yang dapat mengubah radius geofence.
        </div>
      )}

      <div style={{ marginBottom: 18, padding: 18, borderRadius: 14, background: t.card, border: `1px solid ${t.line}`, boxShadow: t.sm, opacity: isFullAdmin ? 1 : .6, pointerEvents: isFullAdmin ? "auto" : "none" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.hi, marginBottom: 14 }}>Atur / Tambah Radius</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <Field t={t} label="Cakupan">
            <select className="pts-in" value={scopeType} onChange={(e) => { setScopeType(e.target.value); setScopeValue(""); }}>
              {GEOFENCE_SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          {scopeType === "region" && (
            <Field t={t} label="Region">
              <select className="pts-in" value={scopeValue} onChange={(e) => setScopeValue(e.target.value)}>
                <option value="">— pilih region —</option>
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          )}
          {scopeType === "branch" && (
            <Field t={t} label="Branch">
              <select className="pts-in" value={scopeValue} onChange={(e) => setScopeValue(e.target.value)}>
                <option value="">— pilih branch —</option>
                {branches.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
          )}
          {scopeType === "outlet" && (
            <Field t={t} label="Kode Outlet">
              <select className="pts-in" value={scopeValue} onChange={(e) => setScopeValue(e.target.value)}>
                <option value="">— pilih outlet —</option>
                {outletCodes.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          )}
          <Field t={t} label="Radius (meter)"><input className="pts-in" type="number" min={1} value={radius} onChange={(e) => setRadius(e.target.value)} /></Field>
        </div>
        {err && <div style={{ marginTop: 12, fontSize: 12.5, color: t.red, display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={13} />{err}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button className="pts-btn" onClick={save} disabled={busy} style={{ background: t.brand, color: "#fff", boxShadow: t.sm }}>{busy ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Simpan Radius</button>
        </div>
      </div>

      <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, overflow: "hidden", boxShadow: t.sm }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Cakupan", "Nilai", "Radius (m)", "Diubah", ""].map((h) => <th key={h} className="pts-th">{h}</th>)}</tr></thead>
          <tbody>
            {loading ? (
              <tr><td className="pts-td" colSpan={5} style={{ textAlign: "center", padding: 30, color: t.mid }}><Loader2 size={18} className="spin" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="pts-td" colSpan={5} style={{ textAlign: "center", padding: 30, color: t.mid }}>Belum ada aturan — semua tagging memakai default 30 meter.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="pts-row">
                <td className="pts-td" style={{ fontWeight: 600, textTransform: "capitalize" }}>{r.scope_type}</td>
                <td className="pts-td">{r.scope_value || "— (semua)"}</td>
                <td className="pts-td" style={{ fontWeight: 700 }}>{r.radius_meters} m</td>
                <td className="pts-td" style={{ color: t.mid, fontSize: 11.5 }}>{r.updated_at ? `${fmtDate(r.updated_at)} ${fmtTime(r.updated_at)}` : "—"}</td>
                <td className="pts-td">{isFullAdmin && <button onClick={() => remove(r)} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${t.redBd}`, background: t.redBg, color: t.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={13} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: t.mid }}>Radius default saat ini (tanpa aturan lain yang cocok): <b>{effectiveDefault} meter</b>.</div>
    </div>
  );
}

/* ══════════════════════════ VALIDASI GA (D+2) ══════════════════════════
   Upload data usage GA (MSISDN + waktu usage) → cocokkan dengan pts_sale
   dalam rentang 3 hari dari waktu tagging → set status validasi. */
function GaValidation({ t, d, supabase, profile, isFullAdmin }) {
  const fileRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const { data } = await supabase.from("pts_sale").select("ga_status");
      const counts = { BELUM_TERVALIDASI: 0, TERVALIDASI: 0, TERVALIDASI_LUAR_AREA: 0, TIDAK_DITEMUKAN: 0 };
      (data || []).forEach((r) => { counts[r.ga_status] = (counts[r.ga_status] || 0) + 1; });
      setSummary(counts);
    } catch { setSummary(null); } finally { setLoadingSummary(false); }
  }, [supabase]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([["MSISDN", "Waktu Usage (YYYY-MM-DD HH:mm)"], ["6281234567890", "2026-07-13 10:00"]]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "GA Usage");
    XLSX.writeFile(wb, "PTS_GA_Template.xlsx");
  };

  const parseFile = async (file) => {
    setErr(""); setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
      if (!raw.length) { setErr("File kosong."); return; }
      const head = raw[0].map((h) => String(h || "").trim().toLowerCase());
      const idx = (name) => head.findIndex((h) => h.includes(name));
      const iPhone = idx("msisdn"), iTime = idx("waktu");
      if (iPhone < 0 || iTime < 0) { setErr("Header wajib: 'MSISDN' dan 'Waktu Usage'."); return; }
      const parsed = [];
      for (let r = 1; r < raw.length; r++) {
        const row = raw[r]; if (!row || row.every((c) => c === "" || c == null)) continue;
        const phoneRaw = String(row[iPhone] ?? "").trim();
        const { normalized, valid } = normalizePhone(phoneRaw);
        const timeRaw = row[iTime];
        const usageAt = timeRaw instanceof Date ? timeRaw : new Date(String(timeRaw).replace(" ", "T"));
        parsed.push({ phone_normalized: normalized, usage_at: usageAt.toISOString(), valid: valid && !isNaN(usageAt.getTime()) });
      }
      setRows(parsed);
    } catch (e) { setErr("Gagal membaca file: " + (e?.message || e)); }
  };

  const onPick = (e) => { const f = e.target.files?.[0]; if (f) { setFileName(f.name); parseFile(f); } };
  const onDrop = (e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) { setFileName(f.name); parseFile(f); } };

  const okRows = rows ? rows.filter((r) => r.valid) : [];

  const uploadAndValidate = async () => {
    if (!okRows.length) return;
    setUploading(true); setErr(""); setResult(null);
    try {
      const payload = okRows.map((r) => ({ phone_normalized: r.phone_normalized, usage_at: r.usage_at, uploaded_by: profile?.id || null, source_file: fileName || null }));
      const { error: insErr } = await supabase.from("pts_ga_usage").insert(payload);
      if (insErr) throw insErr;
      setValidating(true);
      const { data: rpcRes, error: rpcErr } = await supabase.rpc("pts_apply_ga_validation");
      if (rpcErr) throw rpcErr;
      setResult({ uploaded: payload.length, matched: rpcRes?.matched ?? 0, expired: rpcRes?.expired_unmatched ?? 0 });
      setRows(null); setFileName(""); if (fileRef.current) fileRef.current.value = "";
      await loadSummary();
    } catch (e) {
      setErr("Gagal memproses: " + (e?.message || e));
    } finally { setUploading(false); setValidating(false); }
  };

  const runValidationOnly = async () => {
    setValidating(true); setErr("");
    try {
      const { data: rpcRes, error } = await supabase.rpc("pts_apply_ga_validation");
      if (error) throw error;
      setResult({ uploaded: 0, matched: rpcRes?.matched ?? 0, expired: rpcRes?.expired_unmatched ?? 0 });
      await loadSummary();
    } catch (e) { setErr("Gagal menjalankan validasi: " + (e?.message || e)); } finally { setValidating(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 16px", borderRadius: 12, background: t.brandBg, border: `1px solid ${t.brandBd}`, marginBottom: 18 }}>
        <Info size={17} color={t.brand} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13.5, color: t.hi, fontWeight: 500 }}>
          Data usage GA <b>tidak real-time</b> — umumnya tersedia <b>D+2</b>. Upload data usage untuk memvalidasi tagging ± 2 hari lalu. Sistem mencocokkan MSISDN dalam rentang <b>3 hari</b> dari waktu tagging. Tagging di luar radius outlet tetap tervalidasi (status &ldquo;Tervalidasi — Luar Area&rdquo;) dan menjadi bahan evaluasi program, bukan ditolak.
        </span>
      </div>

      {!isFullAdmin && (
        <div style={{ marginBottom: 16, padding: "11px 14px", borderRadius: 10, background: t.amberBg, border: `1px solid ${t.amberBd}`, fontSize: 12.5, color: t.hi }}>
          Upload &amp; validasi GA hanya dapat dilakukan oleh role <b>SPM Sumatera</b>.
        </div>
      )}

      {/* Ringkasan status */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Stat t={t} icon={<Clock size={18} />}        label="Belum Tervalidasi GA"     value={loadingSummary ? "…" : (summary?.BELUM_TERVALIDASI ?? 0)} accent={{ fg: t.amber, bg: t.amberBg, bd: t.amberBd }} />
        <Stat t={t} icon={<CheckCircle2 size={18} />} label="Tervalidasi"              value={loadingSummary ? "…" : (summary?.TERVALIDASI ?? 0)}       accent={{ fg: t.green, bg: t.greenBg, bd: t.greenBd }} />
        <Stat t={t} icon={<Radar size={18} />}         label="Tervalidasi — Luar Area"  value={loadingSummary ? "…" : (summary?.TERVALIDASI_LUAR_AREA ?? 0)} accent={{ fg: t.blue, bg: t.blueBg, bd: t.blueBd }} />
        <Stat t={t} icon={<AlertTriangle size={18} />} label="Tidak Ditemukan"          value={loadingSummary ? "…" : (summary?.TIDAK_DITEMUKAN ?? 0)}   accent={{ fg: t.red, bg: t.redBg, bd: t.redBd }} />
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <button className="pts-btn" onClick={downloadTemplate} style={{ background: t.card, color: t.hi, border: `1px solid ${t.line}`, boxShadow: t.sm }}><Download size={15} /> Download Template GA</button>
        <button className="pts-btn" onClick={runValidationOnly} disabled={!isFullAdmin || validating} style={{ background: t.card, color: t.hi, border: `1px solid ${t.line}`, boxShadow: t.sm }}>{validating ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} Jalankan Ulang Validasi</button>
      </div>

      <div
        onDragOver={(e) => { if (isFullAdmin) { e.preventDefault(); setDrag(true); } }}
        onDragLeave={() => setDrag(false)}
        onDrop={isFullAdmin ? onDrop : undefined}
        onClick={() => isFullAdmin && fileRef.current?.click()}
        style={{
          border: `1.5px dashed ${drag ? t.brand : t.line}`, borderRadius: 14, padding: "34px 24px", textAlign: "center", cursor: isFullAdmin ? "pointer" : "not-allowed",
          background: drag ? t.brandBg : t.sub, transition: "all .15s", opacity: isFullAdmin ? 1 : .6,
        }}>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onPick} disabled={!isFullAdmin} />
        <div style={{ width: 48, height: 48, borderRadius: 12, margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center", background: t.card, border: `1px solid ${t.line}`, color: t.brand }}>
          <UploadCloud size={22} />
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: t.hi }}>{fileName || "Tarik file GA usage (.xlsx/.csv) ke sini, atau klik untuk memilih"}</div>
        <div style={{ fontSize: 12.5, color: t.mid, marginTop: 5 }}>Kolom: MSISDN · Waktu Usage</div>
      </div>

      {err && <div style={{ marginTop: 16, display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: t.redBg, border: `1px solid ${t.redBd}` }}><AlertTriangle size={16} color={t.red} style={{ flexShrink: 0, marginTop: 1 }} /><span style={{ fontSize: 13, color: t.hi }}>{err}</span></div>}

      {result && (
        <div style={{ marginTop: 16, display: "flex", gap: 11, padding: "14px 16px", borderRadius: 12, background: t.greenBg, border: `1px solid ${t.greenBd}` }}>
          <CheckCircle2 size={18} color={t.green} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13.5, color: t.hi }}>
            {result.uploaded > 0 && <><b>{result.uploaded} baris GA</b> diunggah. </>}
            <b>{result.matched}</b> tagging tervalidasi. <b>{result.expired}</b> tagging melewati window 3 hari tanpa ditemukan di data GA.
          </div>
        </div>
      )}

      {rows && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: t.hi }}>Pratinjau: {rows.length} baris</span>
              <Chip t={t} tone="green" icon={<CheckCircle2 size={12} />}>{okRows.length} valid</Chip>
              {rows.length - okRows.length > 0 && <Chip t={t} tone="red" icon={<AlertTriangle size={12} />}>{rows.length - okRows.length} error</Chip>}
            </div>
            <div style={{ display: "flex", gap: 9 }}>
              <button className="pts-btn" onClick={() => { setRows(null); setFileName(""); }} style={{ background: t.card, color: t.mid, border: `1px solid ${t.line}` }}><X size={14} /> Batal</button>
              <button className="pts-btn" onClick={uploadAndValidate} disabled={!isFullAdmin || uploading || okRows.length === 0} style={{ background: t.brand, color: "#fff", boxShadow: t.sm }}>
                {uploading ? <Loader2 size={15} className="spin" /> : <UploadCloud size={15} />} Upload &amp; Validasi
              </button>
            </div>
          </div>
          <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, overflow: "hidden", boxShadow: t.sm }}>
            <div style={{ maxHeight: 320, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["MSISDN", "Waktu Usage", "Status"].map((h) => <th key={h} className="pts-th">{h}</th>)}</tr></thead>
                <tbody>
                  {rows.slice(0, 300).map((r, i) => (
                    <tr key={i} className="pts-row" style={{ background: r.valid ? "transparent" : t.redBg }}>
                      <td className="pts-td" style={{ fontFamily: "monospace" }}>{r.phone_normalized}</td>
                      <td className="pts-td">{r.usage_at}</td>
                      <td className="pts-td">{r.valid ? <span style={{ color: t.green, fontWeight: 600, fontSize: 12 }}>OK</span> : <span style={{ color: t.red, fontWeight: 600, fontSize: 12 }}>Nomor/waktu tidak valid</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      <style>{`.spin{animation:ptsspin 1s linear infinite}@keyframes ptsspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function Chip({ t, tone, icon, children }) {
  const map = {
    green: [t.greenBg, t.green, t.greenBd], red: [t.redBg, t.red, t.redBd],
    blue: [t.blueBg, t.blue, t.blueBd], amber: [t.amberBg, t.amber, t.amberBd],
  };
  const [bg, fg, bd] = map[tone] || map.blue;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 99, fontSize: 11.5, fontWeight: 700, background: bg, color: fg, border: `1px solid ${bd}` }}>{icon}{children}</span>;
}
