"use client";
/**
 * SDP_UploadTerritory.jsx — v4 (manual column mapping)
 * Upload file Territory IOH (.xlsb/.xlsx) → mapping kolom (manual, dgn
 * auto-detect sbg default) → preview → import via RPC.
 *
 * UPDATE (permintaan user - "saya akan memilih headernya dan ke kolom mana
 * saja dia akan di mapping, dan saya ingin informasi lengkap"): versi lama
 * (v3) MENEBAK indeks kolom secara hardcoded per field (circle/region/.../
 * cluster, dst) berdasarkan posisi tetap yang diverifikasi dari 1 contoh
 * file (202606) - begitu IOH mengubah urutan/jumlah kolom di file baru
 * (202610), tebakan itu salah & SELURUH data "hilang" (lihat bug fix
 * sebelumnya di PENCARIAN pola 5/6-kolom + filter idx 15 vs 24). Supaya
 * tahan terhadap perubahan struktur file di masa depan TANPA perlu
 * perbaikan kode lagi tiap kali IOH ganti layout, upload sekarang punya
 * step baru "Mapping Kolom": user melihat SEMUA kolom yang ada (huruf
 * kolom + isi header + contoh nilai baris pertama - "informasi lengkap"),
 * lalu memilih sendiri kolom mana yang jadi Circle/Region/Branch/dst untuk
 * tiap sheet (IOH/3ID/IM3). Auto-detect (logic lama) tetap jalan sbg
 * DEFAULT/prefill supaya kalau strukturnya tidak berubah, user tinggal
 * lanjut tanpa perlu apa-apa lagi - cuma sekarang semuanya BISA diubah
 * manual & terlihat jelas sebelum di-parse.
 *
 * Tulis data: 1 RPC atomik `import_territory(period, mapping, sdps, file, by, by_name)`
 *   → upsert mapping + sdp_master + sdp_monthly_data + diff/log + sync kode + territory_uploads.
 *
 * Props: { supabase, theme = "dark", profile }
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  Upload, FileSpreadsheet, X, CheckCircle2, AlertTriangle, Loader2,
  RotateCcw, Search, CalendarDays, ChevronDown, AlertCircle, Lock,
  ChevronRight, ChevronLeft, History, PlusCircle, MinusCircle, MoveRight, Minus,
  GitBranch, MapPin, KeyRound, RefreshCw, Columns3, Info,
} from "lucide-react";
import { SdpHeaderBanner, SDP_GRADIENT_CTA, SDP_GRADIENT_CTA_SHADOW } from "./SDP2_Shared";

const HEADER_MARKER = "FID";
const T = (v) => String(v ?? "").trim();
const SHEET_NAMES = { ioh: "IOH", sdp3id: "3ID", im3: "IM3" };

// Fallback terakhir (indeks lama, dipakai HANYA kalau auto-detect sama
// sekali tidak menemukan apa-apa & file tidak punya baris FID/CIRCLE sama
// sekali - supaya select tidak kosong total).
const FALLBACK = {
  ioh: { headerRow: 2, circle: 14, region: 15, area: 16, branch: 17, mc: 18, cluster: -1 },
  sdp3id: { headerRow: 3, id: 22, name: 23, cluster: 17, pt: 16, circle: 21, filter: 15, filterValue: "3KIOSK" },
  im3: { headerRow: 3, id: 22, name: 23, cluster: 17, pt: 16, circle: 21, filter: 15, filterValue: "MITRAIM3" },
};

// ─── Baca workbook → rows mentah per sheet (header:1, tanpa parsing field) ──
function readWorkbookRows(arrayBuffer) {
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
  const rowsOf = (sn) => {
    const ws = wb.Sheets[sn];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  };
  return { ioh: rowsOf(SHEET_NAMES.ioh), sdp3id: rowsOf(SHEET_NAMES.sdp3id), im3: rowsOf(SHEET_NAMES.im3) };
}

// ─── Auto-detect (prefill) — logic lama, sekarang cuma utk DEFAULT, semua
// hasilnya tetap bisa diubah manual di step "Mapping Kolom". ─────────────
function autoDetectIoh(rows) {
  let blk = -1, hdr = FALLBACK.ioh.headerRow, blkLen = 0;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rows[i] || [];
    for (let c = 0; c < r.length - 5; c++) {
      const seq6 = [r[c], r[c+1], r[c+2], r[c+3], r[c+4], r[c+5]].map(x => T(x).toUpperCase()).join("|");
      if (seq6 === "CIRCLE|REGION|AREA|BRANCH|MC|CLUSTER") { hdr = i; blk = c; blkLen = 6; break; }
      const seq5 = [r[c], r[c+1], r[c+2], r[c+3], r[c+4]].map(x => T(x).toUpperCase()).join("|");
      if (seq5 === "CIRCLE|REGION|AREA|BRANCH|MC") { hdr = i; blk = c; blkLen = 5; break; }
    }
    if (blk >= 0) break;
  }
  if (blk < 0) return { ...FALLBACK.ioh };
  return {
    headerRow: hdr, circle: blk, region: blk + 1, area: blk + 2, branch: blk + 3, mc: blk + 4,
    cluster: blkLen === 6 ? blk + 5 : -1, // -1 = tidak ada kolom cluster terpisah → alias ke MC
  };
}

function autoDetectSdpSheet(rows, filterValue, fallback) {
  const hi = rows.findIndex(r => T(r?.[0]) === HEADER_MARKER);
  if (hi < 0) return { ...fallback };
  const hdr = rows[hi] || [];
  const findCol = (...labels) => {
    for (const lab of labels) {
      const idx = hdr.findIndex(h => T(h).toUpperCase() === lab.toUpperCase());
      if (idx >= 0) return idx;
    }
    return -1;
  };
  // Cari kolom "after"/kedua (muncul 2x di file ini - before & after) - ambil
  // kemunculan TERAKHIR utk tiap label supaya dapat blok "after" (yg relevan
  // utk periode berjalan), fallback ke indeks lama kalau label tak ketemu.
  const findLast = (...labels) => {
    let found = -1;
    hdr.forEach((h, i) => { if (labels.some(l => T(h).toUpperCase() === l.toUpperCase())) found = i; });
    return found;
  };
  const id = findLast("MP3_ID", "MPC_SHORTCODE") >= 0 ? findLast("MP3_ID", "MPC_SHORTCODE") : fallback.id;
  const name = findLast("PARTNER AFTER") >= 0 ? findLast("PARTNER AFTER") : fallback.name;
  const circle = findLast("CIRCLE") >= 0 ? findLast("CIRCLE") : fallback.circle;
  const pt = findLast("PT") >= 0 ? findLast("PT") : fallback.pt;
  const cluster = findLast("CLUSTER", "MC") >= 0 ? findLast("CLUSTER", "MC") : fallback.cluster;
  const filterCol = findCol("MP3/3KIOSK", "MPC/MITRAIM3");
  return {
    headerRow: hi, id, name, cluster, pt, circle,
    filter: filterCol >= 0 ? filterCol : fallback.filter,
    filterValue,
  };
}

function autoDetectAll(wbRows) {
  return {
    ioh: autoDetectIoh(wbRows.ioh),
    sdp3id: autoDetectSdpSheet(wbRows.sdp3id, "3KIOSK", FALLBACK.sdp3id),
    im3: autoDetectSdpSheet(wbRows.im3, "MITRAIM3", FALLBACK.im3),
  };
}

// ─── Parse final memakai columnMap (hasil auto-detect ATAU hasil pilihan
// manual user di step "Mapping Kolom") — tidak ada lagi indeks hardcoded di
// sini, semuanya datang dari columnMap. ─────────────────────────────────
function parseWithMap(wbRows, columnMap) {
  const iohCols = columnMap.ioh;
  const ioh = wbRows.ioh;
  const mapping = [];
  const byCS = {}, byMC = {};
  const seenMapKey = new Set();
  for (let i = iohCols.headerRow + 1; i < ioh.length; i++) {
    const r = ioh[i] || [];
    if (T(r[iohCols.circle]).toUpperCase() !== "SUMATERA") continue;
    const mc = T(r[iohCols.mc]);
    const m = {
      circle: T(r[iohCols.circle]), region: T(r[iohCols.region]), area: T(r[iohCols.area]),
      branch: T(r[iohCols.branch]), mc,
      cluster: iohCols.cluster != null && iohCols.cluster >= 0 ? T(r[iohCols.cluster]) : mc,
    };
    if (m.cluster) byCS[m.cluster.toUpperCase()] = m;
    if (m.mc)      byMC[m.mc.toUpperCase()]      = m;
    const k = `${m.cluster}|${m.mc}`;
    if (!seenMapKey.has(k) && (m.cluster || m.mc)) { seenMapKey.add(k); mapping.push(m); }
  }

  function parseSheet(rows, cols, sdpType, brand) {
    const out = [];
    const seen = new Set();
    for (let i = cols.headerRow + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const id = T(r[cols.id]);
      if (!id) continue;
      if (cols.circle != null && cols.circle >= 0 && T(r[cols.circle]).toUpperCase() !== "SUMATERA") continue;
      if (cols.filter != null && cols.filter >= 0 && cols.filterValue && T(r[cols.filter]).toUpperCase() !== T(cols.filterValue).toUpperCase()) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      const cluster = T(r[cols.cluster]);
      const map = byMC[cluster.toUpperCase()] || byCS[cluster.toUpperCase()] || null;
      out.push({
        sdp_id: id, sdp_name: T(r[cols.name]), sdp_type: sdpType, brand,
        pt_name: T(r[cols.pt]), cluster,
        branch: map ? map.branch : "", area: map ? map.area : "", region: map ? map.region : "",
        mapped: !!map,
      });
    }
    return out;
  }

  const k3  = parseSheet(wbRows.sdp3id, columnMap.sdp3id, "3KIOSK",    "3ID");
  const im3 = parseSheet(wbRows.im3,    columnMap.im3,    "MITRA IM3", "IM3");
  const sdps = [...k3, ...im3];
  return { mapping, sdps, k3Count: k3.length, im3Count: im3.length };
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const periodLabel = (ym) => { if (!ym) return ""; const [y, m] = ym.split("-"); return `${MONTHS[parseInt(m,10)-1]} ${y}`; };
function colLetter(idx) {
  if (idx == null || idx < 0) return "—";
  let n = idx + 1, s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
const rowPreview = (r) => (r || []).filter(v => v != null && String(v).trim() !== "").slice(0, 6).map(v => String(v)).join(" · ") || "(baris kosong)";

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
  const steps = ["Pilih Periode", "Upload File", "Mapping Kolom", "Preview", "Import"];
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

// ─── Picker kolom — "informasi lengkap": tiap opsi menampilkan huruf
// kolom + isi header + contoh nilai baris data pertama, supaya user bisa
// memilih kolom yang BENAR tanpa harus menebak/menghitung index manual. ──
function ColSelect({ t, rows, headerRow, value, onChange, allowNone, noneLabel, disabled }) {
  const hdr = rows[headerRow] || [];
  const sample = rows[headerRow + 1] || [];
  const maxCols = Math.max(hdr.length, sample.length, 30);
  return (
    <div style={{ position: "relative" }}>
      <select disabled={disabled} value={value == null || value < 0 ? "" : value}
        onChange={(e) => onChange(e.target.value === "" ? -1 : parseInt(e.target.value, 10))}
        style={{ appearance: "none", WebkitAppearance: "none", width: "100%", boxSizing: "border-box", padding: "9px 30px 9px 11px",
          borderRadius: 9, border: `1px solid ${t.line}`, background: disabled ? t.sub : t.card, color: t.hi,
          fontSize: 12.5, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", fontFamily: FF, outline: "none" }}>
        {allowNone && <option value="">{noneLabel || "— tidak dipakai —"}</option>}
        {Array.from({ length: maxCols }).map((_, i) => {
          const label = T(hdr[i]);
          const samp = T(sample[i]);
          return (
            <option key={i} value={i}>
              {colLetter(i)}{label ? ` · ${label}` : " · (tanpa header)"}{samp ? ` — ex: ${samp.slice(0, 28)}` : ""}
            </option>
          );
        })}
      </select>
      <ChevronDown size={12} color={t.mid} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
    </div>
  );
}

function FieldRow({ t, label, hint, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 12, alignItems: "center", marginBottom: 10 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.hi }}>{label}</div>
        {hint && <div style={{ fontSize: 10.5, color: t.lo, marginTop: 1 }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

// ─── Kartu mapping 1 sheet (IOH / 3ID / IM3) ────────────────────────────────
function SheetMapCard({ t, d, title, badgeColor, rows, cols, onChange, sheetMissing }) {
  const [showAllRows, setShowAllRows] = useState(false);
  if (sheetMissing) {
    return (
      <div style={{ background: t.card, border: `1px solid ${t.redBd}`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 800, color: t.red }}>
          <AlertTriangle size={15} /> Sheet "{title}" tidak ditemukan di file
        </div>
      </div>
    );
  }
  const set = (key, val) => onChange({ ...cols, [key]: val });
  const headerRowOptions = Array.from({ length: Math.min(rows.length, 12) }).map((_, i) => i);
  const sampleRow = rows[cols.headerRow + 1] || [];
  const filterValues = useMemo(() => {
    if (cols.filter == null || cols.filter < 0) return [];
    const set2 = new Set();
    for (let i = cols.headerRow + 1; i < Math.min(rows.length, cols.headerRow + 3000); i++) {
      const v = T((rows[i] || [])[cols.filter]);
      if (v) set2.add(v);
    }
    return [...set2].sort();
  }, [rows, cols.filter, cols.headerRow]);

  return (
    <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 18, marginBottom: 14, boxShadow: t.sm }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: badgeColor, flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 800, color: t.hi }}>Sheet "{title}"</span>
      </div>

      <FieldRow t={t} label="Baris Header" hint="Baris yang berisi nama kolom">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <select value={cols.headerRow} onChange={(e) => set("headerRow", parseInt(e.target.value, 10))}
              style={{ appearance: "none", WebkitAppearance: "none", width: "100%", boxSizing: "border-box", padding: "9px 30px 9px 11px",
                borderRadius: 9, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontSize: 12.5, fontWeight: 600,
                cursor: "pointer", fontFamily: FF, outline: "none" }}>
              {headerRowOptions.map((i) => (
                <option key={i} value={i}>Baris {i + 1} — {rowPreview(rows[i]).slice(0, 50)}</option>
              ))}
            </select>
            <ChevronDown size={12} color={t.mid} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          </div>
        </div>
      </FieldRow>

      {"circle" in cols && (
        <FieldRow t={t} label="Circle" hint="Difilter = SUMATERA">
          <ColSelect t={t} rows={rows} headerRow={cols.headerRow} value={cols.circle} onChange={(v) => set("circle", v)} />
        </FieldRow>
      )}
      {"region" in cols && (
        <FieldRow t={t} label="Region">
          <ColSelect t={t} rows={rows} headerRow={cols.headerRow} value={cols.region} onChange={(v) => set("region", v)} />
        </FieldRow>
      )}
      {"area" in cols && (
        <FieldRow t={t} label="Area">
          <ColSelect t={t} rows={rows} headerRow={cols.headerRow} value={cols.area} onChange={(v) => set("area", v)} />
        </FieldRow>
      )}
      {"branch" in cols && (
        <FieldRow t={t} label="Branch">
          <ColSelect t={t} rows={rows} headerRow={cols.headerRow} value={cols.branch} onChange={(v) => set("branch", v)} />
        </FieldRow>
      )}
      {"mc" in cols && (
        <FieldRow t={t} label="Micro Cluster" hint="Kolom bernilai MC-…">
          <ColSelect t={t} rows={rows} headerRow={cols.headerRow} value={cols.mc} onChange={(v) => set("mc", v)} />
        </FieldRow>
      )}
      {"cluster" in cols && "mc" in cols && (
        <FieldRow t={t} label="Cluster" hint="Kosongkan jika sama dgn MC">
          <ColSelect t={t} rows={rows} headerRow={cols.headerRow} value={cols.cluster} onChange={(v) => set("cluster", v)} allowNone noneLabel="— sama dengan Micro Cluster —" />
        </FieldRow>
      )}
      {"id" in cols && (
        <FieldRow t={t} label="SDP ID">
          <ColSelect t={t} rows={rows} headerRow={cols.headerRow} value={cols.id} onChange={(v) => set("id", v)} />
        </FieldRow>
      )}
      {"name" in cols && (
        <FieldRow t={t} label="Nama SDP">
          <ColSelect t={t} rows={rows} headerRow={cols.headerRow} value={cols.name} onChange={(v) => set("name", v)} />
        </FieldRow>
      )}
      {"pt" in cols && (
        <FieldRow t={t} label="PT / Partner">
          <ColSelect t={t} rows={rows} headerRow={cols.headerRow} value={cols.pt} onChange={(v) => set("pt", v)} />
        </FieldRow>
      )}
      {"cluster" in cols && "id" in cols && (
        <FieldRow t={t} label="Cluster / MC" hint="Dipakai utk mapping ke sheet IOH">
          <ColSelect t={t} rows={rows} headerRow={cols.headerRow} value={cols.cluster} onChange={(v) => set("cluster", v)} />
        </FieldRow>
      )}
      {"filter" in cols && (
        <>
          <FieldRow t={t} label="Kolom Filter Tipe" hint="Opsional — kosongkan utk ambil semua baris">
            <ColSelect t={t} rows={rows} headerRow={cols.headerRow} value={cols.filter} onChange={(v) => set("filter", v)} allowNone noneLabel="— tidak difilter —" />
          </FieldRow>
          {cols.filter != null && cols.filter >= 0 && (
            <FieldRow t={t} label="Nilai Filter" hint="Baris yg diambil = kolom di atas sama dgn ini">
              <div style={{ position: "relative" }}>
                <select value={cols.filterValue || ""} onChange={(e) => set("filterValue", e.target.value)}
                  style={{ appearance: "none", WebkitAppearance: "none", width: "100%", boxSizing: "border-box", padding: "9px 30px 9px 11px",
                    borderRadius: 9, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontSize: 12.5, fontWeight: 600,
                    cursor: "pointer", fontFamily: FF, outline: "none" }}>
                  {filterValues.length === 0 && cols.filterValue && <option value={cols.filterValue}>{cols.filterValue}</option>}
                  {filterValues.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                <ChevronDown size={12} color={t.mid} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              </div>
            </FieldRow>
          )}
        </>
      )}

      <button type="button" onClick={() => setShowAllRows((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, background: "none", border: "none", cursor: "pointer", color: t.teal, fontSize: 11.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
        <Columns3 size={12} /> {showAllRows ? "Sembunyikan" : "Lihat"} semua kolom baris header ({(rows[cols.headerRow] || []).length} kolom)
      </button>
      {showAllRows && (
        <div style={{ marginTop: 8, maxHeight: 160, overflowY: "auto", border: `1px solid ${t.line}`, borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <tbody>
              {(rows[cols.headerRow] || []).map((h, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${t.line}` }}>
                  <td style={{ padding: "4px 8px", color: t.lo, fontWeight: 700, whiteSpace: "nowrap" }}>{colLetter(i)}</td>
                  <td style={{ padding: "4px 8px", color: t.hi }}>{T(h) || <span style={{ color: t.lo }}>(kosong)</span>}</td>
                  <td style={{ padding: "4px 8px", color: t.mid }}>{T(sampleRow[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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

  const [step, setStep] = useState("period"); // period|idle|parsing|mapping|preview|saving|done|error
  const [fileName, setFileName] = useState("");
  const [wbRows, setWbRows]     = useState(null); // {ioh, sdp3id, im3} raw rows
  const [columnMap, setColumnMap] = useState(null); // {ioh, sdp3id, im3} field→col idx
  const [parsed, setParsed]     = useState(null); // {mapping, sdps, k3Count, im3Count}
  const [errMsg, setErrMsg]     = useState("");
  const [result, setResult]     = useState(null); // RPC summary
  const [drag, setDrag]   = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const fileRef = useRef(null);

  const stepNum = step === "period" ? 1 : (step === "idle" || step === "parsing") ? 2 : step === "mapping" ? 3 : step === "preview" ? 4 : 5;

  const confirmPeriod = () => { setPeriodConfirmed(true); setStep("idle"); };
  const changePeriod  = () => { setPeriodConfirmed(false); setStep("period"); setParsed(null); setWbRows(null); setColumnMap(null); setFileName(""); setErrMsg(""); setResult(null); };

  const processFile = useCallback(async (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["xlsb", "xlsx", "xls"].includes(ext)) { setErrMsg(`Format tidak didukung: .${ext}. Gunakan .xlsb / .xlsx`); setStep("error"); return; }
    setStep("parsing"); setFileName(file.name); setSearch(""); setTypeFilter("ALL");
    try {
      const buf = await file.arrayBuffer();
      const rows = readWorkbookRows(buf);
      if (!rows.ioh.length && !rows.sdp3id.length && !rows.im3.length) {
        setErrMsg("Tidak ada sheet 'IOH', '3ID', atau 'IM3' ditemukan di file ini."); setStep("error"); return;
      }
      setWbRows(rows);
      setColumnMap(autoDetectAll(rows));
      setStep("mapping");
    } catch (err) { setErrMsg(`Gagal membaca file: ${err.message}`); setStep("error"); }
  }, []);

  const onFileInput = (e) => { processFile(e.target.files?.[0]); e.target.value = ""; };
  const onDrop = (e) => { e.preventDefault(); setDrag(false); processFile(e.dataTransfer.files?.[0]); };

  // Step "Mapping Kolom" → "Lanjut ke Preview": jalankan parseWithMap pakai
  // columnMap final (auto-detect ATAU hasil ubahan manual user).
  const applyMapping = () => {
    if (!wbRows || !columnMap) return;
    try {
      const out = parseWithMap(wbRows, columnMap);
      if (!out.sdps.length) {
        setErrMsg("Tidak ada baris SDP yang cocok dgn mapping ini. Periksa kembali kolom Circle/Filter yang dipilih di step Mapping Kolom.");
        setStep("error");
        return;
      }
      setParsed(out); setStep("preview");
    } catch (err) { setErrMsg(`Gagal memproses mapping: ${err.message}`); setStep("error"); }
  };

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
    setParsed(null); setWbRows(null); setColumnMap(null); setFileName(""); setErrMsg(""); setResult(null); setSearch(""); setTypeFilter("ALL");
  };
  const resetFile = () => { setStep("idle"); setParsed(null); setWbRows(null); setColumnMap(null); setFileName(""); setErrMsg(""); setSearch(""); setTypeFilter("ALL"); };
  const backToMapping = () => { setStep("mapping"); setParsed(null); };

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
    <div style={{ fontFamily: FF, color: t.hi, width: "100%" }}>

      {/* Header — UPDATE (permintaan user - "buat desainnya bagus untuk
          fullscreen"): bar teal->gelap seragam dgn SdpHeaderBanner di
          seluruh modul SDP Management (sebelumnya cuma ikon+judul polos),
          sekaligus wadah utama dilebarkan penuh (maxWidth 940 dihapus) -
          layar "Data Territory" sekarang memakai lebar penuh halaman, tidak
          lagi nyempil di kiri dgn ruang kosong besar di kanan. */}
      <SdpHeaderBanner icon={FileSpreadsheet} title="Upload Territory IOH"
        subtitle="Sinkronisasi SDP Sumatera · master, mapping, kode & ringkasan perubahan" />

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

          {/* Step 1 — period — lebar dibatasi & dipusatkan (bukan step yang
              padat data, jadi tetap fokus/nyaman dibaca walau layar lebar). */}
          {step === "period" && (
            <div style={{ maxWidth: 680, margin: "0 auto", background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, padding: 28, boxShadow: t.md }}>
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
              <button onClick={confirmPeriod} style={{ display: "flex", alignItems: "center", gap: 8, background: SDP_GRADIENT_CTA, border: "none", borderRadius: 10, padding: "11px 24px", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: FF, boxShadow: SDP_GRADIENT_CTA_SHADOW }}>
                Konfirmasi Periode: {periodLabel(period)} <ChevronRight size={15} />
              </button>
            </div>
          )}

          {/* Period confirmed banner */}
          {periodConfirmed && step !== "period" && step !== "done" && (
            <div style={{ maxWidth: 680, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderRadius: 10, background: t.tealBg, border: `1px solid ${t.tealBd}` }}>
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
              style={{ maxWidth: 680, margin: "0 auto", border: `2px dashed ${drag ? t.teal : t.line}`, borderRadius: 16, padding: "56px 32px", textAlign: "center", cursor: "pointer", background: drag ? t.tealBg : t.sub }}>
              <input ref={fileRef} type="file" accept=".xlsb,.xlsx,.xls" style={{ display: "none" }} onChange={onFileInput} />
              {step === "parsing" ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <Loader2 size={32} color={t.teal} style={{ animation: "sut-spin 1s linear infinite" }} />
                  <div style={{ fontSize: 14, color: t.mid }}>Membaca file…</div>
                </div>
              ) : (
                <>
                  <div style={{ width: 56, height: 56, borderRadius: 14, background: t.tealBg, border: `1px solid ${t.tealBd}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                    <Upload size={24} color={t.teal} />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: t.hi, marginBottom: 6 }}>Pilih atau seret file Territory IOH</div>
                  <div style={{ fontSize: 13, color: t.mid, marginBottom: 4 }}>Format <strong>.xlsb</strong> / .xlsx — sheet {`"3ID", "IM3", "IOH"`}</div>
                  <div style={{ display: "inline-block", marginTop: 8, padding: "6px 16px", borderRadius: 8, background: t.tealBg, border: `1px solid ${t.tealBd}`, fontSize: 12.5, color: t.tealD, fontWeight: 600 }}>Langkah berikutnya: pilih sendiri kolom yang dipakai</div>
                </>
              )}
            </div>
          )}

          {/* Step 3 — Mapping Kolom — UPDATE (permintaan user - "saya akan
              memilih headernya dan ke kolom mana saja dia akan di mapping,
              dan saya ingin informasi lengkap"): sebelum di-parse, user
              melihat & mengatur sendiri kolom apa yang jadi Circle/Region/
              Branch/MC/dst untuk tiap sheet - prefill otomatis (logic lama)
              tetap jalan sbg DEFAULT, tapi semua bisa diubah manual di sini,
              dgn info lengkap tiap kolom (huruf + header + contoh nilai). */}
          {step === "mapping" && wbRows && columnMap && (
            <div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 16px", borderRadius: 10, marginBottom: 16, background: t.tealBg, border: `1px solid ${t.tealBd}` }}>
                <Info size={15} color={t.teal} style={{ marginTop: 1, flexShrink: 0 }} />
                <div style={{ fontSize: 12.5, color: t.tealD, lineHeight: 1.5 }}>
                  Kolom di bawah ini sudah ditebak otomatis dari file <strong>{fileName}</strong> — periksa & ubah kalau ada yang salah (tiap pilihan menampilkan huruf kolom, isi header, dan contoh nilainya).
                </div>
              </div>

              <SheetMapCard t={t} d={d} title="IOH" badgeColor={t.mag}
                rows={wbRows.ioh} cols={columnMap.ioh} sheetMissing={!wbRows.ioh.length}
                onChange={(next) => setColumnMap((p) => ({ ...p, ioh: next }))} />
              <SheetMapCard t={t} d={d} title="IM3" badgeColor={t.teal}
                rows={wbRows.im3} cols={columnMap.im3} sheetMissing={!wbRows.im3.length}
                onChange={(next) => setColumnMap((p) => ({ ...p, im3: next }))} />
              <SheetMapCard t={t} d={d} title="3ID" badgeColor={t.blue}
                rows={wbRows.sdp3id} cols={columnMap.sdp3id} sheetMissing={!wbRows.sdp3id.length}
                onChange={(next) => setColumnMap((p) => ({ ...p, sdp3id: next }))} />

              <div className="sut-actions" style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <button onClick={resetFile} style={{ height: 40, padding: "0 18px", borderRadius: 9, background: "none", border: `1px solid ${t.line}`, color: t.mid, fontFamily: FF, fontSize: 13.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  <RotateCcw size={13} /> Ganti File
                </button>
                <button onClick={applyMapping} style={{ height: 40, padding: "0 22px", borderRadius: 9, cursor: "pointer", background: SDP_GRADIENT_CTA, border: "none", color: "#fff", fontFamily: FF, fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", boxShadow: SDP_GRADIENT_CTA_SHADOW, display: "flex", alignItems: "center", gap: 7 }}>
                  Lanjut ke Preview <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {step === "error" && (
            <div style={{ maxWidth: 680, margin: "0 auto", padding: 20, borderRadius: 14, background: t.redBg, border: `1px solid ${t.redBd}`, display: "flex", gap: 14, alignItems: "flex-start" }}>
              <AlertTriangle size={18} color={t.red} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: t.red, marginBottom: 4 }}>Gagal memproses</div>
                <div style={{ fontSize: 13, color: t.mid, lineHeight: 1.5 }}>{errMsg}</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                {wbRows && columnMap && (
                  <button onClick={() => setStep("mapping")} style={{ background: "none", border: `1px solid ${t.redBd}`, borderRadius: 7, cursor: "pointer", color: t.red, padding: "6px 10px", fontSize: 12, fontWeight: 700, fontFamily: FF, display: "flex", alignItems: "center", gap: 5 }}>
                    <ChevronLeft size={13} /> Ubah Mapping
                  </button>
                )}
                <button onClick={resetFile} style={{ background: "none", border: "none", cursor: "pointer", color: t.mid, padding: 4 }}><X size={16} /></button>
              </div>
            </div>
          )}

          {/* Step 4 — preview */}
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
                  <span style={{ fontSize: 12.5, color: t.amber, fontWeight: 600 }}>{unmapped} SDP clusternya tidak ada di mapping IOH — branch/area kosong. Periksa mapping kolom.</span>
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

              <div className="sut-table" style={{ borderRadius: 13, border: `1px solid ${t.line}`, marginBottom: 20, maxHeight: "56vh", overflowY: "auto", overflowX: "auto" }}>
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
                <button onClick={backToMapping} style={{ height: 40, padding: "0 18px", borderRadius: 9, background: "none", border: `1px solid ${t.line}`, color: t.mid, fontFamily: FF, fontSize: 13.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  <ChevronLeft size={13} /> Ubah Mapping
                </button>
                <button onClick={doImport} style={{ height: 40, padding: "0 22px", borderRadius: 9, cursor: "pointer", background: SDP_GRADIENT_CTA, border: "none", color: "#fff", fontFamily: FF, fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", boxShadow: SDP_GRADIENT_CTA_SHADOW, display: "flex", alignItems: "center", gap: 7 }}>
                  <Upload size={14} /> Import {allRows.length} SDP → {periodLabel(period)}
                </button>
              </div>
            </div>
          )}

          {/* Saving */}
          {step === "saving" && (
            <div style={{ maxWidth: 680, margin: "0 auto", padding: 40, textAlign: "center", background: t.card, borderRadius: 16, border: `1px solid ${t.line}` }}>
              <Loader2 size={36} color={t.teal} style={{ animation: "sut-spin 1s linear infinite", marginBottom: 16 }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: t.hi, marginBottom: 4 }}>Mengimport ke database…</div>
              <div style={{ fontSize: 13, color: t.mid }}>Mapping · sdp_master · kode otoritas · ringkasan perubahan ({periodLabel(period)})</div>
            </div>
          )}

          {/* Done */}
          {step === "done" && result && (
            <div style={{ maxWidth: 680, margin: "0 auto", padding: 28, borderRadius: 16, background: t.GL, border: `1px solid ${t.GB}` }}>
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
                <button onClick={reset} style={{ height: 38, padding: "0 20px", borderRadius: 8, cursor: "pointer", background: SDP_GRADIENT_CTA, boxShadow: SDP_GRADIENT_CTA_SHADOW, border: "none", color: "#fff", fontFamily: FF, fontSize: 13, fontWeight: 700 }}>Upload File Lain</button>
              </div>
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes sut-spin { to { transform: rotate(360deg); } }
        /* UPDATE (permintaan user - "buat desainnya bagus untuk
           fullscreen"): sebelumnya statistik dipaksa 4 kolom berapa pun
           lebar layar (sempit & renggang di layar lebar) - sekarang
           auto-fit, jadi kartu melebar proporsional mengisi ruang penuh
           di layar besar, tetap rapi menyusun ulang di layar sempit. */
        .sut-stats { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
        .sut-summary { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
        @media (max-width: 600px) { .sut-stats, .sut-summary { grid-template-columns: repeat(2, 1fr); } }
        .sut-filter { flex-wrap: nowrap; overflow-x: auto; }
        .sut-table table { min-width: 760px; }
        @media (max-width: 480px) { .sut-actions { flex-direction: column-reverse; align-items: stretch; } .sut-actions button { width: 100%; justify-content: center; } }
      `}</style>
    </div>
  );
}
