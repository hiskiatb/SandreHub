"use client";
/**
 * SDP_UploadTerritory.jsx — v3 (rebuild)
 * Upload file Territory IOH (.xlsb/.xlsx) → parse 3 sheet → preview → import via RPC.
 *
 * Parsing (kolom terverifikasi pada file 202606):
 *   Sheet IOH  : blok bersih "after" — header di baris idx 2, kolom 14..19 =
 *                CIRCLE, REGION, AREA, BRANCH, MC, CLUSTER. Filter CIRCLE='SUMATERA'.
 *                → mc_cluster_mapping + lookup branch/area/region per cluster.
 *   Sheet 3ID  : header (FID) → after-block: id=22 (MP3_ID), name=23 (PARTNER AFTER),
 *                cluster=16 (CS …), pt=17, circle=21. sdp_type='3KIOSK'.
 *   Sheet IM3  : id=22 (MPC_SHORTCODE), name=23, cluster=17 (MC-…), pt=16, circle=21.
 *                sdp_type='MITRA IM3'.
 *   Filter global: CIRCLE='SUMATERA', dedup per sdp_id.
 *
 * Tulis data: 1 RPC atomik `import_territory(period, mapping, sdps, file, by, by_name)`
 *   → upsert mapping + sdp_master + sdp_monthly_data + diff/log + sync kode + territory_uploads.
 *
 * Props: { supabase, theme = "dark", profile }
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  Upload, FileSpreadsheet, X, CheckCircle2, AlertTriangle, Loader2,
  RotateCcw, Search, CalendarDays, ChevronDown, AlertCircle, Lock,
  ChevronRight, History, PlusCircle, MinusCircle, MoveRight, Minus,
  GitBranch, MapPin, KeyRound, RefreshCw,
} from "lucide-react";

// ─── Verified column indices ────────────────────────────────────────────────
const IOH = { circle: 14, region: 15, area: 16, branch: 17, mc: 18, cluster: 19, headerRow: 2 };
// kolom Y (idx 24) = filter tipe outlet: hanya ambil 3KIOSK (sheet 3ID) & MITRAIM3 (sheet IM3),
// abaikan baris distributor MP3 / MPC.
const SHEET_3ID = { id: 22, name: 23, cluster: 16, pt: 17, circle: 21, tsid: 36, filter: 24, filterValue: "3KIOSK" };
const SHEET_IM3 = { id: 22, name: 23, cluster: 17, pt: 16, circle: 21, filter: 24, filterValue: "MITRAIM3" };
const HEADER_MARKER = "FID";
const T = (v) => String(v ?? "").trim();

// ─── Parser ─────────────────────────────────────────────────────────────────
function parseWorkbook(arrayBuffer) {
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
  const rowsOf = (sn) => {
    const ws = wb.Sheets[sn];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  };

  // 1) IOH mapping — locate clean block; fall back to known indices
  const ioh = rowsOf("IOH");
  let blk = IOH.cluster - 5, hdr = IOH.headerRow;
  for (let i = 0; i < Math.min(8, ioh.length); i++) {
    const r = ioh[i] || [];
    for (let c = 0; c < r.length - 5; c++) {
      const seq = [r[c], r[c+1], r[c+2], r[c+3], r[c+4], r[c+5]].map(x => T(x).toUpperCase()).join("|");
      if (seq === "CIRCLE|REGION|AREA|BRANCH|MC|CLUSTER") { hdr = i; blk = c; break; }
    }
    if (blk >= 0 && hdr === i) break;
  }
  const mapping = [];
  const byCS = {}, byMC = {};
  const seenMapKey = new Set();
  for (let i = hdr + 1; i < ioh.length; i++) {
    const r = ioh[i] || [];
    if (T(r[blk]).toUpperCase() !== "SUMATERA") continue;
    const m = {
      circle : T(r[blk]),
      region : T(r[blk + 1]),
      area   : T(r[blk + 2]),
      branch : T(r[blk + 3]),
      mc     : T(r[blk + 4]),
      cluster: T(r[blk + 5]),
    };
    if (m.cluster) byCS[m.cluster.toUpperCase()] = m;
    if (m.mc)      byMC[m.mc.toUpperCase()]      = m;
    const k = `${m.cluster}|${m.mc}`;
    if (!seenMapKey.has(k) && (m.cluster || m.mc)) { seenMapKey.add(k); mapping.push(m); }
  }

  // 2) SDP sheets
  function parseSheet(sn, cols, sdpType, brand, isMc) {
    const rows = rowsOf(sn);
    const hi = rows.findIndex(r => T(r?.[0]) === HEADER_MARKER);
    if (hi < 0) return [];
    const seen = new Set();
    const out = [];
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const id = T(r[cols.id]);
      if (!id) continue;
      if (T(r[cols.circle]).toUpperCase() !== "SUMATERA") continue;
      if (cols.filter != null && T(r[cols.filter]).toUpperCase() !== cols.filterValue) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      const cluster = T(r[cols.cluster]);
      const map = (isMc ? byMC : byCS)[cluster.toUpperCase()] || null;
      out.push({
        sdp_id  : id,
        sdp_name: T(r[cols.name]),
        sdp_type: sdpType,
        brand,
        pt_name : T(r[cols.pt]),
        cluster,
        branch  : map ? map.branch : "",
        area    : map ? map.area   : "",
        region  : map ? map.region : "",
        mapped  : !!map,
      });
    }
    return out;
  }

  const k3  = parseSheet("3ID", SHEET_3ID, "3KIOSK",    "3ID", false);
  const im3 = parseSheet("IM3", SHEET_IM3, "MITRA IM3", "IM3", true);
  const sdps = [...k3, ...im3];
  return { mapping, sdps, k3Count: k3.length, im3Count: im3.length };
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const periodLabel = (ym) => { if (!ym) return ""; const [y, m] = ym.split("-"); return `${MONTHS[parseInt(m,10)-1]} ${y}`; };

// ─── Theme ──────────────────────────────────────────────────────────────────
const mk = (d) => ({
  bg: d ? "#0D0D0F" : "#F2F4F7", card: d ? "#17171B" : "#FFFFFF", sub: d ? "#1D1D22" : "#F8F9FA",
  line: d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)", hi: d ? "#F1F1F4" : "#0F1117",
  mid: d ? "#8A8A9C" : "#6B7280", lo: d ? "#4A4A5E" : "#A0A8B4",
  teal: "#12998B", tealD: "#0E8276",
  tealBg: d ? "rgba(18,153,139,.14)" : "rgba(18,153,139,.08)", tealBd: d ? "rgba(18,153,139,.32)" : "rgba(18,153,139,.22)",
  blue: "#2E6BE6", blueBg: d ? "rgba(46,107,230,.12)" : "rgba(37,99,235,.07)", blueBd: d ? "rgba(46,107,230,.28)" : "rgba(37,99,235,.18)",
  amber: "#CC8500", amberBg: d ? "rgba(204,133,0,.14)" : "rgba(204,133,0,.08)", amberBd: d ? "rgba(204,133,0,.34)" : "rgba(204,133,0,.24)",
  red: d ? "#FF453A" : "#DC2626", redBg: d ? "rgba(255,69,58,.1)" : "rgba(220,38,38,.06)", redBd: d ? "rgba(255,69,58,.25)" : "rgba(220,38,38,.18)",
  mag: "#C6168D", magBg: d ? "rgba(198,22,141,.12)" : "rgba(198,22,141,.07)", magBd: d ? "rgba(198,22,141,.3)" : "rgba(198,22,141,.18)",
  G: d ? "#30D158" : "#16A34A", GL: d ? "rgba(48,209,88,.1)" : "rgba(22,163,74,.07)", GB: d ? "rgba(48,209,88,.25)" : "rgba(22,163,74,.2)",
  sm: d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)", md: d ? "0 6px 20px rgba(0,0,0,.55)" : "0 6px 18px rgba(0,0,0,.09)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

// ─── Step bar ───────────────────────────────────────────────────────────────
function StepBar({ current, t }) {
  const steps = ["Pilih Periode", "Upload File", "Preview", "Import"];
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 26 }}>
      {steps.map((label, i) => {
        const idx = i + 1, done = idx < current, active = idx === current;
        return (
          <React.Fragment key={i}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: i < steps.length - 1 ? "0 0 auto" : 1 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, background: done ? t.teal : active ? t.tealBg : t.sub, border: `2px solid ${done || active ? t.teal : t.line}`, color: done ? "#fff" : active ? t.teal : t.lo }}>
                {done ? "✓" : idx}
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", color: active ? t.teal : done ? t.mid : t.lo }}>{label}</div>
            </div>
            {i < steps.length - 1 && <div style={{ flex: 1, height: 2, margin: "0 6px 18px", background: done ? t.teal : t.line }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
};

// ─── Riwayat Upload ─────────────────────────────────────────────────────────
function RiwayatUpload({ supabase, t, d }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expand, setExpand] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("territory_uploads")
        .select("*")
        .order("uploaded_at", { ascending: false });
      if (alive) { setRows(data || []); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [supabase]);

  if (loading) return (
    <div style={{ padding: 48, textAlign: "center", color: t.mid }}>
      <Loader2 size={22} style={{ animation: "sut-spin 1s linear infinite" }} />
      <div style={{ marginTop: 8, fontSize: 13 }}>Memuat riwayat…</div>
    </div>
  );

  if (rows.length === 0) return (
    <div style={{ padding: "56px 24px", textAlign: "center", background: t.card, borderRadius: 16, border: `1px solid ${t.line}` }}>
      <History size={28} color={t.lo} style={{ marginBottom: 12 }} />
      <div style={{ fontSize: 15, fontWeight: 700, color: t.hi, marginBottom: 4 }}>Belum ada riwayat upload</div>
      <div style={{ fontSize: 13, color: t.mid }}>Riwayat akan muncul setiap kali Territory diimport.</div>
    </div>
  );

  const Pill = ({ icon: Ic, label, value, color, bg, bd }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8, background: bg, border: `1px solid ${bd}` }}>
      <Ic size={13} color={color} />
      <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}</span>
      <span style={{ fontSize: 11.5, color: t.mid }}>{label}</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((r) => {
        const s = r.summary || {};
        const ok = r.status === "SUCCESS";
        const open = expand === r.id;
        return (
          <div key={r.id} style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, boxShadow: t.sm, overflow: "hidden" }}>
            <div onClick={() => setExpand(open ? null : r.id)} style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: ok ? t.tealBg : t.redBg, border: `1px solid ${ok ? t.tealBd : t.redBd}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CalendarDays size={17} color={ok ? t.teal : t.red} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: t.hi }}>{periodLabel(r.period)}
                    <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: ok ? t.tealBg : t.redBg, color: ok ? t.teal : t.red, border: `1px solid ${ok ? t.tealBd : t.redBd}` }}>{r.status}</span>
                  </div>
                  <div style={{ fontSize: 12, color: t.mid, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {fmtDate(r.uploaded_at)} · {r.uploaded_by_name || "—"} · {r.file_name || "—"}
                  </div>
                </div>
              </div>
              <ChevronRight size={16} color={t.lo} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
            </div>
            {open && (
              <div style={{ padding: "0 16px 16px", display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Pill icon={FileSpreadsheet} label="total SDP" value={s.sdp_total ?? "—"} color={t.hi}  bg={t.sub}    bd={t.line} />
                <Pill icon={PlusCircle}      label="ditambah"  value={s.sdp_added ?? 0}  color={t.G}    bg={t.GL}     bd={t.GB} />
                <Pill icon={MinusCircle}     label="dihapus"   value={s.sdp_removed ?? 0} color={t.red} bg={t.redBg}  bd={t.redBd} />
                <Pill icon={MoveRight}       label="pindah"    value={s.sdp_moved ?? 0}  color={t.blue} bg={t.blueBg} bd={t.blueBd} />
                <Pill icon={Minus}           label="tetap"     value={s.sdp_unchanged ?? 0} color={t.mid} bg={t.sub} bd={t.line} />
                <Pill icon={GitBranch}       label="branch baru" value={s.branches_new ?? 0} color={t.amber} bg={t.amberBg} bd={t.amberBd} />
                <Pill icon={MapPin}          label="cluster baru" value={s.clusters_new ?? 0} color={t.amber} bg={t.amberBg} bd={t.amberBd} />
                <Pill icon={KeyRound}        label="kode baru" value={s.codes_added ?? 0} color={t.mag} bg={t.magBg} bd={t.magBd} />
                {r.error && <div style={{ width: "100%", fontSize: 12.5, color: t.red, marginTop: 4 }}>Error: {r.error}</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab button ─────────────────────────────────────────────────────────────
function TabBtn({ icon: Ic, label, active, t, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px", borderRadius: 9, cursor: "pointer",
      fontFamily: FF, fontSize: 13.5, fontWeight: 700,
      background: active ? t.tealBg : "transparent", color: active ? t.teal : t.mid,
      border: `1px solid ${active ? t.tealBd : t.line}`,
    }}>
      <Ic size={15} /> {label}
    </button>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────
export default function SDP_UploadTerritory({ supabase, theme = "dark", profile }) {
  const d = theme === "dark";
  const t = mk(d);

  const [tab, setTab] = useState("upload"); // upload | riwayat

  const now = new Date();
  const curYear = now.getFullYear(), curMonth = now.getMonth() + 1;
  const [selYear, setSelYear]   = useState(curYear);
  const [selMonth, setSelMonth] = useState(curMonth);
  const [periodConfirmed, setPeriodConfirmed] = useState(false);

  const period = `${selYear}-${String(selMonth).padStart(2, "0")}`;
  const isCurrentMonth = selYear === curYear && selMonth === curMonth;
  const isFuture = new Date(selYear, selMonth - 1) > new Date(curYear, curMonth - 1);

  const [step, setStep] = useState("period"); // period|idle|parsing|preview|saving|done|error
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed]     = useState(null); // {mapping, sdps, k3Count, im3Count}
  const [errMsg, setErrMsg]     = useState("");
  const [result, setResult]     = useState(null); // RPC summary
  const [drag, setDrag]   = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const fileRef = useRef(null);

  const stepNum = step === "period" ? 1 : (step === "idle" || step === "parsing") ? 2 : step === "preview" ? 3 : 4;

  const confirmPeriod = () => { setPeriodConfirmed(true); setStep("idle"); };
  const changePeriod  = () => { setPeriodConfirmed(false); setStep("period"); setParsed(null); setFileName(""); setErrMsg(""); setResult(null); };

  const processFile = useCallback(async (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["xlsb", "xlsx", "xls"].includes(ext)) { setErrMsg(`Format tidak didukung: .${ext}. Gunakan .xlsb / .xlsx`); setStep("error"); return; }
    setStep("parsing"); setFileName(file.name); setSearch(""); setTypeFilter("ALL");
    try {
      const buf = await file.arrayBuffer();
      const out = parseWorkbook(buf);
      if (!out.sdps.length) { setErrMsg("Tidak ada data SUMATERA ditemukan. Pastikan sheet '3ID', 'IM3', dan 'IOH' ada."); setStep("error"); return; }
      setParsed(out); setStep("preview");
    } catch (err) { setErrMsg(`Gagal membaca file: ${err.message}`); setStep("error"); }
  }, []);

  const onFileInput = (e) => { processFile(e.target.files?.[0]); e.target.value = ""; };
  const onDrop = (e) => { e.preventDefault(); setDrag(false); processFile(e.dataTransfer.files?.[0]); };

  const doImport = async () => {
    if (!parsed) return;
    setStep("saving");
    try {
      const mapping = parsed.mapping.map(m => ({ circle: m.circle, region: m.region, area: m.area, branch: m.branch, mc: m.mc, cluster: m.cluster }));
      const sdps = parsed.sdps.map(s => ({
        sdp_id: s.sdp_id, sdp_name: s.sdp_name, sdp_type: s.sdp_type, pt_name: s.pt_name,
        cluster: s.cluster, branch: s.branch, area: s.area, region: s.region,
      }));
      const { data, error } = await supabase.rpc("import_territory", {
        p_period: period,
        p_mapping: mapping,
        p_sdps: sdps,
        p_file_name: fileName,
        p_uploaded_by: profile?.id ?? null,
        p_uploaded_by_name: profile?.full_name ?? profile?.name ?? null,
      });
      if (error) throw new Error(error.message);
      setResult(data?.summary || {});
      setStep("done");
    } catch (err) { setErrMsg(err.message); setStep("error"); }
  };

  const reset = () => {
    setStep("period"); setPeriodConfirmed(false);
    setSelYear(curYear); setSelMonth(curMonth);
    setParsed(null); setFileName(""); setErrMsg(""); setResult(null); setSearch(""); setTypeFilter("ALL");
  };
  const resetFile = () => { setStep("idle"); setParsed(null); setFileName(""); setErrMsg(""); setSearch(""); setTypeFilter("ALL"); };

  const allRows = parsed?.sdps || [];
  const im3Count = parsed?.im3Count || 0;
  const kioskCount = parsed?.k3Count || 0;
  const unmapped = allRows.filter(r => !r.mapped).length;
  const filtered = allRows.filter(r => {
    if (typeFilter === "IM3" && r.brand !== "IM3") return false;
    if (typeFilter === "3ID" && r.brand !== "3ID") return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return r.sdp_id.toLowerCase().includes(q) || r.sdp_name.toLowerCase().includes(q) ||
           r.cluster.toLowerCase().includes(q) || (r.branch || "").toLowerCase().includes(q);
  });

  return (
    <div style={{ fontFamily: FF, color: t.hi, width: "100%", maxWidth: 940 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: t.tealBg, border: `1px solid ${t.tealBd}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <FileSpreadsheet size={18} color={t.teal} />
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.3 }}>Upload Territory IOH</div>
          <div style={{ fontSize: 12.5, color: t.mid, marginTop: 1 }}>Sinkronisasi SDP Sumatera · master, mapping, kode &amp; ringkasan perubahan</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
        <TabBtn icon={Upload}  label="Upload Baru"     active={tab === "upload"}  t={t} onClick={() => setTab("upload")} />
        <TabBtn icon={History} label="Riwayat Upload"  active={tab === "riwayat"} t={t} onClick={() => setTab("riwayat")} />
      </div>

      {tab === "riwayat" ? (
        <RiwayatUpload supabase={supabase} t={t} d={d} />
      ) : (
        <>
          {step !== "done" && <StepBar current={stepNum} t={t} />}

          {/* Step 1 — period */}
          {step === "period" && (
            <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, padding: 24, boxShadow: t.sm }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <CalendarDays size={16} color={t.teal} /><span style={{ fontSize: 14, fontWeight: 700 }}>Pilih Periode Upload</span>
              </div>
              <div style={{ fontSize: 13, color: t.mid, marginBottom: 20 }}>Pastikan periode sesuai file Territory IOH. Data disimpan untuk periode ini (kunci: sdp_id × periode).</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
                <div style={{ position: "relative" }}>
                  <select value={selMonth} onChange={e => setSelMonth(parseInt(e.target.value, 10))} style={{ appearance: "none", WebkitAppearance: "none", background: t.sub, border: `1px solid ${t.line}`, borderRadius: 9, padding: "10px 36px 10px 14px", color: t.hi, fontFamily: FF, fontSize: 14, fontWeight: 600, cursor: "pointer", minWidth: 130 }}>
                    {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                  <ChevronDown size={13} color={t.mid} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                </div>
                <div style={{ position: "relative" }}>
                  <select value={selYear} onChange={e => setSelYear(parseInt(e.target.value, 10))} style={{ appearance: "none", WebkitAppearance: "none", background: t.sub, border: `1px solid ${t.line}`, borderRadius: 9, padding: "10px 36px 10px 14px", color: t.hi, fontFamily: FF, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                    {[curYear - 1, curYear, curYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <ChevronDown size={13} color={t.mid} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                </div>
                <div style={{ padding: "10px 16px", borderRadius: 9, background: t.tealBg, border: `1px solid ${t.tealBd}`, fontSize: 15, fontWeight: 800, color: t.teal }}>{periodLabel(period)}</div>
              </div>
              {!isCurrentMonth && !isFuture && (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 16px", borderRadius: 10, marginBottom: 16, background: t.amberBg, border: `1px solid ${t.amberBd}` }}>
                  <AlertCircle size={16} color={t.amber} style={{ marginTop: 1, flexShrink: 0 }} />
                  <div style={{ fontSize: 13, color: t.amber, lineHeight: 1.5 }}><strong>Periode historis</strong> — {periodLabel(period)} sudah lewat. Data periode ini akan ditimpa.</div>
                </div>
              )}
              {isFuture && (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 16px", borderRadius: 10, marginBottom: 16, background: t.amberBg, border: `1px solid ${t.amberBd}` }}>
                  <AlertCircle size={16} color={t.amber} style={{ marginTop: 1, flexShrink: 0 }} />
                  <div style={{ fontSize: 13, color: t.amber, lineHeight: 1.5 }}><strong>Periode mendatang</strong> — {periodLabel(period)}. Pastikan file memang untuk periode ini.</div>
                </div>
              )}
              <button onClick={confirmPeriod} style={{ display: "flex", alignItems: "center", gap: 8, background: `linear-gradient(135deg, #12998B, #0E8276)`, border: "none", borderRadius: 10, padding: "11px 24px", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: FF, boxShadow: "0 4px 14px rgba(18,153,139,.3)" }}>
                Konfirmasi Periode: {periodLabel(period)} <ChevronRight size={15} />
              </button>
            </div>
          )}

          {/* Period confirmed banner */}
          {periodConfirmed && step !== "period" && step !== "done" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderRadius: 10, marginBottom: 16, background: t.tealBg, border: `1px solid ${t.tealBd}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Lock size={13} color={t.teal} /><span style={{ fontSize: 13, fontWeight: 700, color: t.teal }}>Periode: {periodLabel(period)}</span>
                {!isCurrentMonth && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: t.amberBg, border: `1px solid ${t.amberBd}`, color: t.amber }}>⚠ Bukan bulan ini</span>}
              </div>
              <button onClick={changePeriod} style={{ fontSize: 12, fontWeight: 600, color: t.teal, background: "none", border: `1px solid ${t.tealBd}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: FF }}>Ubah</button>
            </div>
          )}

          {/* Step 2 — drop zone */}
          {(step === "idle" || step === "parsing") && (
            <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop} onClick={() => fileRef.current?.click()}
              style={{ border: `2px dashed ${drag ? t.teal : t.line}`, borderRadius: 16, padding: "48px 32px", textAlign: "center", cursor: "pointer", background: drag ? t.tealBg : t.sub }}>
              <input ref={fileRef} type="file" accept=".xlsb,.xlsx,.xls" style={{ display: "none" }} onChange={onFileInput} />
              {step === "parsing" ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <Loader2 size={32} color={t.teal} style={{ animation: "sut-spin 1s linear infinite" }} />
                  <div style={{ fontSize: 14, color: t.mid }}>Membaca &amp; mem-parse 3 sheet…</div>
                </div>
              ) : (
                <>
                  <div style={{ width: 56, height: 56, borderRadius: 14, background: t.tealBg, border: `1px solid ${t.tealBd}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                    <Upload size={24} color={t.teal} />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: t.hi, marginBottom: 6 }}>Pilih atau seret file Territory IOH</div>
                  <div style={{ fontSize: 13, color: t.mid, marginBottom: 4 }}>Format <strong>.xlsb</strong> / .xlsx — sheet {`"3ID", "IM3", "IOH"`}</div>
                  <div style={{ display: "inline-block", marginTop: 8, padding: "6px 16px", borderRadius: 8, background: t.tealBg, border: `1px solid ${t.tealBd}`, fontSize: 12.5, color: t.tealD, fontWeight: 600 }}>Filter otomatis: Circle = SUMATERA</div>
                </>
              )}
            </div>
          )}

          {/* Error */}
          {step === "error" && (
            <div style={{ padding: 20, borderRadius: 14, background: t.redBg, border: `1px solid ${t.redBd}`, display: "flex", gap: 14, alignItems: "flex-start" }}>
              <AlertTriangle size={18} color={t.red} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: t.red, marginBottom: 4 }}>Gagal memproses</div>
                <div style={{ fontSize: 13, color: t.mid, lineHeight: 1.5 }}>{errMsg}</div>
              </div>
              <button onClick={resetFile} style={{ background: "none", border: "none", cursor: "pointer", color: t.mid, padding: 4 }}><X size={16} /></button>
            </div>
          )}

          {/* Step 3 — preview */}
          {step === "preview" && parsed && (
            <div>
              <div className="sut-stats" style={{ display: "grid", gap: 12, marginBottom: 16 }}>
                {[
                  { label: "Total SDP", value: allRows.length, color: t.teal },
                  { label: "MITRA IM3", value: im3Count, color: t.tealD },
                  { label: "3KIOSK", value: kioskCount, color: t.blue },
                  { label: "Mapping (IOH)", value: parsed.mapping.length, color: t.mag },
                ].map((s, i) => (
                  <div key={i} style={{ padding: "14px 16px", borderRadius: 12, background: t.card, border: `1px solid ${t.line}`, boxShadow: t.sm }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: s.color, letterSpacing: -0.5 }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: t.mid, marginTop: 2, fontWeight: 600 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {unmapped > 0 && (
                <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 14px", borderRadius: 10, marginBottom: 12, background: t.amberBg, border: `1px solid ${t.amberBd}` }}>
                  <AlertCircle size={15} color={t.amber} />
                  <span style={{ fontSize: 12.5, color: t.amber, fontWeight: 600 }}>{unmapped} SDP clusternya tidak ada di mapping IOH — branch/area kosong. Periksa file.</span>
                </div>
              )}

              <div className="sut-filter" style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: t.sub, border: `1px solid ${t.line}`, borderRadius: 9, padding: "0 12px", height: 36 }}>
                  <Search size={13} color={t.lo} />
                  <input placeholder="Cari ID, nama, cluster, branch…" value={search} onChange={e => setSearch(e.target.value)} style={{ border: "none", background: "none", outline: "none", flex: 1, fontSize: 13, color: t.hi, fontFamily: FF }} />
                  {search && <button onClick={() => setSearch("")} style={{ border: "none", background: "none", cursor: "pointer", color: t.lo }}><X size={12} /></button>}
                </div>
                {["ALL", "IM3", "3ID"].map(f => (
                  <button key={f} onClick={() => setTypeFilter(f)} style={{ padding: "0 14px", height: 36, borderRadius: 9, cursor: "pointer", fontFamily: FF, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", background: typeFilter === f ? t.tealBg : t.sub, color: typeFilter === f ? t.tealD : t.mid, border: `1px solid ${typeFilter === f ? t.tealBd : t.line}` }}>
                    {f === "ALL" ? `Semua (${allRows.length})` : f === "IM3" ? `IM3 (${im3Count})` : `3ID (${kioskCount})`}
                  </button>
                ))}
              </div>

              <div className="sut-table" style={{ borderRadius: 13, border: `1px solid ${t.line}`, marginBottom: 20, maxHeight: 380, overflowY: "auto", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr>{["#", "BRAND", "TYPE", "ID", "NAME", "CLUSTER", "BRANCH", "AREA", "REGION"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, fontSize: 11, letterSpacing: .4, color: t.mid, borderBottom: `1px solid ${t.line}`, whiteSpace: "nowrap", background: d ? "#1D1D22" : "#F4F6F8", position: "sticky", top: 0 }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 200).map((row, i) => {
                      const isIM3 = row.brand === "IM3";
                      return (
                        <tr key={row.sdp_id} style={{ background: i % 2 === 0 ? t.card : (d ? "rgba(255,255,255,.02)" : "#FAFBFC"), borderBottom: `1px solid ${t.line}` }}>
                          <td style={{ padding: "9px 12px", color: t.lo, fontSize: 11 }}>{i + 1}</td>
                          <td style={{ padding: "9px 12px" }}><span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 700, background: isIM3 ? t.tealBg : t.blueBg, color: isIM3 ? t.tealD : t.blue, border: `1px solid ${isIM3 ? t.tealBd : t.blueBd}` }}>{row.brand}</span></td>
                          <td style={{ padding: "9px 12px", color: t.mid, whiteSpace: "nowrap" }}>{row.sdp_type}</td>
                          <td style={{ padding: "9px 12px", fontWeight: 600, color: t.hi, whiteSpace: "nowrap" }}>{row.sdp_id}</td>
                          <td style={{ padding: "9px 12px", color: t.hi, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.sdp_name}</td>
                          <td style={{ padding: "9px 12px", color: t.mid, whiteSpace: "nowrap" }}>{row.cluster}</td>
                          <td style={{ padding: "9px 12px", color: row.branch ? t.mid : t.amber, whiteSpace: "nowrap" }}>{row.branch || "—"}</td>
                          <td style={{ padding: "9px 12px", color: t.mid, whiteSpace: "nowrap" }}>{row.area || "—"}</td>
                          <td style={{ padding: "9px 12px", color: t.mid, whiteSpace: "nowrap" }}>{row.region || "—"}</td>
                        </tr>
                      );
                    })}
                    {filtered.length > 200 && <tr><td colSpan={9} style={{ padding: "10px 12px", textAlign: "center", color: t.mid, fontSize: 12 }}>+ {filtered.length - 200} baris lain (pakai filter untuk mempersempit)</td></tr>}
                    {filtered.length === 0 && <tr><td colSpan={9} style={{ padding: "24px 12px", textAlign: "center", color: t.lo }}>Tidak ada hasil</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="sut-actions" style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
                <button onClick={resetFile} style={{ height: 40, padding: "0 18px", borderRadius: 9, background: "none", border: `1px solid ${t.line}`, color: t.mid, fontFamily: FF, fontSize: 13.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  <RotateCcw size={13} /> Ganti File
                </button>
                <button onClick={doImport} style={{ height: 40, padding: "0 22px", borderRadius: 9, cursor: "pointer", background: `linear-gradient(135deg, #12998B, #0E8276)`, border: "none", color: "#fff", fontFamily: FF, fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", boxShadow: "0 4px 14px rgba(18,153,139,.3)", display: "flex", alignItems: "center", gap: 7 }}>
                  <Upload size={14} /> Import {allRows.length} SDP → {periodLabel(period)}
                </button>
              </div>
            </div>
          )}

          {/* Saving */}
          {step === "saving" && (
            <div style={{ padding: 40, textAlign: "center", background: t.card, borderRadius: 16, border: `1px solid ${t.line}` }}>
              <Loader2 size={36} color={t.teal} style={{ animation: "sut-spin 1s linear infinite", marginBottom: 16 }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: t.hi, marginBottom: 4 }}>Mengimport ke database…</div>
              <div style={{ fontSize: 13, color: t.mid }}>Mapping · sdp_master · kode otoritas · ringkasan perubahan ({periodLabel(period)})</div>
            </div>
          )}

          {/* Done */}
          {step === "done" && result && (
            <div style={{ padding: 28, borderRadius: 16, background: t.GL, border: `1px solid ${t.GB}` }}>
              <div style={{ textAlign: "center", marginBottom: 22 }}>
                <CheckCircle2 size={40} color={t.G} style={{ marginBottom: 12 }} />
                <div style={{ fontSize: 18, fontWeight: 800, color: t.hi, marginBottom: 6, letterSpacing: -0.3 }}>Import Berhasil</div>
                <div style={{ fontSize: 13, color: t.mid }}>Periode <strong style={{ color: t.hi }}>{periodLabel(period)}</strong> — {result.sdp_total} SDP diproses{result.prev_period ? ` · dibandingkan ${periodLabel(result.prev_period)}` : ""}</div>
              </div>
              <div className="sut-summary" style={{ display: "grid", gap: 10, marginBottom: 18 }}>
                {[
                  { label: "Ditambah", value: result.sdp_added, color: t.G, Ic: PlusCircle },
                  { label: "Dihapus", value: result.sdp_removed, color: t.red, Ic: MinusCircle },
                  { label: "Pindah", value: result.sdp_moved, color: t.blue, Ic: MoveRight },
                  { label: "Tetap", value: result.sdp_unchanged, color: t.mid, Ic: Minus },
                ].map((s, i) => (
                  <div key={i} style={{ padding: "12px 8px", borderRadius: 10, background: t.card, border: `1px solid ${t.line}`, textAlign: "center" }}>
                    <s.Ic size={16} color={s.color} style={{ marginBottom: 4 }} />
                    <div style={{ fontSize: 22, fontWeight: 800, color: s.color, letterSpacing: -0.5 }}>{s.value ?? 0}</div>
                    <div style={{ fontSize: 11, color: t.mid, fontWeight: 600 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 20 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: t.amber, padding: "5px 10px", borderRadius: 8, background: t.amberBg, border: `1px solid ${t.amberBd}` }}>{result.branches_new ?? 0} branch baru</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: t.amber, padding: "5px 10px", borderRadius: 8, background: t.amberBg, border: `1px solid ${t.amberBd}` }}>{result.clusters_new ?? 0} cluster baru</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: t.mag, padding: "5px 10px", borderRadius: 8, background: t.magBg, border: `1px solid ${t.magBd}` }}>{result.codes_added ?? 0} kode otoritas baru</span>
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button onClick={() => setTab("riwayat")} style={{ height: 38, padding: "0 18px", borderRadius: 8, cursor: "pointer", background: "none", border: `1px solid ${t.line}`, color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                  <History size={14} /> Lihat Riwayat
                </button>
                <button onClick={reset} style={{ height: 38, padding: "0 20px", borderRadius: 8, cursor: "pointer", background: t.tealBg, border: `1px solid ${t.tealBd}`, color: t.tealD, fontFamily: FF, fontSize: 13, fontWeight: 700 }}>Upload File Lain</button>
              </div>
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes sut-spin { to { transform: rotate(360deg); } }
        .sut-stats { grid-template-columns: repeat(4, 1fr); }
        .sut-summary { grid-template-columns: repeat(4, 1fr); }
        @media (max-width: 600px) { .sut-stats, .sut-summary { grid-template-columns: repeat(2, 1fr); } }
        .sut-filter { flex-wrap: nowrap; overflow-x: auto; }
        .sut-table table { min-width: 760px; }
        @media (max-width: 480px) { .sut-actions { flex-direction: column-reverse; align-items: stretch; } .sut-actions button { width: 100%; justify-content: center; } }
      `}</style>
    </div>
  );
}
