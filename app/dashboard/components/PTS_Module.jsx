"use client";

// ============================================================
// PTS — Promotor Tracking System (SandraHub)
// Admin (spm_sumatera / pic_region), sub-menu diurut sesuai alur kerja:
//   1) Roster Promotor        — daftar identitas promotor (master data)
//   2) Mapping Outlet Promotor — assignment promotor↔outlet per bulan
//   3) Geofence                — atur radius validasi tagging
//   4) Ringkasan Aktivitas     — status login & klaim SP per promotor/brand
//   5) Validasi GA              — cocokkan klaim dengan data usage GA
//   6) Klaim Nomor              — audit pengajuan pemindahan MSISDN
// Tidak ada lagi fitur Check-In/Check-Out — sudah digantikan alur
// geofencing langsung pada Claim Penjualan (tagging QR/manual).
// Sumber kebenaran: tabel pts_* di Supabase (TraceHub).
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import {
  Upload, Download, FileSpreadsheet, Users, MapPin, Search, Filter, FilterX,
  CheckCircle2, AlertTriangle, Clock, X, ChevronDown, ChevronRight,
  RefreshCw, ShoppingBag, CalendarDays,
  Loader2, Store, UserCheck, UserX, Info, Phone, IdCard, Radar,
  UploadCloud, Plus, Trash2, Save, Ban, BarChart3, ArrowLeftRight, Eye, Pencil,
  Trophy, Medal, Award, PieChart,
} from "lucide-react";
import { passesRow, optionsFor, FilterTh, FilterMenu } from "./MFTS_TableFilter";
import { WhatsAppIcon } from "../../../components/WhatsAppIcon";

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
  // Alias ke brand (merah) — dipakai komponen filter tabel bersama (MFTS_TableFilter)
  // yang menulis t.teal/tealBg/tealBd, supaya warna highlight-nya konsisten dgn PTS.
  teal  : d ? "#ED1C24" : "#ED1C24",
  tealBg: d ? "rgba(237,28,36,.12)" : "rgba(237,28,36,.07)",
  tealBd: d ? "rgba(237,28,36,.30)" : "rgba(237,28,36,.20)",
  inputBg: d ? "#131315" : "#FFFFFF",
  sm    : d ? "0 1px 3px rgba(0,0,0,.55)" : "0 1px 3px rgba(23,24,28,.06)",
  md    : d ? "0 8px 24px rgba(0,0,0,.5)" : "0 8px 24px rgba(23,24,28,.09)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;

/* ── Helpers ──────────────────────────────────────────────────────────── */
const MONTHS_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const pad2 = (n) => String(n).padStart(2, "0");
const ymLabel = (ym) => { if (!ym) return "—"; const [y, m] = ym.split("-"); return `${MONTHS_ID[+m - 1]} ${y}`; };
// PTS baru mulai berjalan Agustus 2026 — bulan aktif dibatasi ke Agustus & September saja.
const PERIOD_OPTIONS = ["2026-08", "2026-09"];
const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }) : "";
const emailValid = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || "").trim());

// Normalisasi nomor telepon → format 62 (mirror aturan server §6 spec)
export function normalizePhone(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("62")) { /* ok */ }
  else if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return { normalized: d, valid: /^62\d{8,13}$/.test(d), raw: String(raw ?? "") };
}

// Mapping Outlet Promotor: 1 baris file = 1 promotor, sampai 4 outlet per
// baris (masing-masing outlet punya ID IM3 & ID 3ID sendiri-sendiri). Kunci
// relasi promotor: ID Promotor (IM3) diutamakan, lalu ID Promotor (3ID),
// email sebagai cadangan terakhir — pola ID-dulu-email-cadangan yang sama
// dipakai di seluruh sistem ini.
const OUTLET_SLOTS = 4;
const MAPPING_HEADERS = [
  "ALAMAT EMAIL PROMOTOR", "ID PROMOTOR (IM3)", "ID PROMOTOR (3ID)", "REGION", "BRANCH", "MC",
  ...Array.from({ length: OUTLET_SLOTS }, (_, i) => i + 1).flatMap((n) => [
    `NAMA OUTLET ${n}`, `KATEGORI OUTLET ${n}`, `ID OUTLET ${n} (IM3)`, `ID OUTLET ${n} (3ID)`,
  ]),
];
// Header Excel kadang ada spasi liar sebelum ")" (mis. "(IM3 )") — normalisasi
// sebelum dibandingkan supaya tetap match.
const normHeader = (h) => String(h || "").trim().toUpperCase().replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");

// 3 region resmi Sumatera (selaras IOH Territory)
const REGIONS = ["NORTH SUMATERA", "CENTRAL SUMATERA", "SOUTH SUMATERA"];
const REGION_ALIASES = {
  "NORTH SUMATERA": "NORTH SUMATERA", NORTH: "NORTH SUMATERA", "SUMATERA UTARA": "NORTH SUMATERA", UTARA: "NORTH SUMATERA", SUMUT: "NORTH SUMATERA",
  "CENTRAL SUMATERA": "CENTRAL SUMATERA", CENTRAL: "CENTRAL SUMATERA", "SUMATERA TENGAH": "CENTRAL SUMATERA", TENGAH: "CENTRAL SUMATERA",
  "SOUTH SUMATERA": "SOUTH SUMATERA", SOUTH: "SOUTH SUMATERA", "SUMATERA SELATAN": "SOUTH SUMATERA", SELATAN: "SOUTH SUMATERA", SUMSEL: "SOUTH SUMATERA",
};
const canonRegion = (s) => REGION_ALIASES[String(s || "").trim().toUpperCase().replace(/\s+/g, " ")] || null;
const REGION_SFM_ROLE = { "NORTH SUMATERA": "region_sfm_north", "CENTRAL SUMATERA": "region_sfm_central", "SOUTH SUMATERA": "region_sfm_south" };

// Status validasi GA (D+2, window 3 hari dari tagged_at)
const GA_STATUS_LABEL = {
  BELUM_TERVALIDASI: "Belum Tervalidasi GA",
  TERVALIDASI: "Tervalidasi",
  TERVALIDASI_LUAR_AREA: "Tervalidasi — Luar Area",
  TIDAK_SESUAI_OUTLET: "Outlet Tidak Sesuai",
  TIDAK_DITEMUKAN: "Tidak Ditemukan",
};
const GA_STATUS_TONE = { BELUM_TERVALIDASI: "amber", TERVALIDASI: "green", TERVALIDASI_LUAR_AREA: "blue", TIDAK_SESUAI_OUTLET: "amber", TIDAK_DITEMUKAN: "red" };
// Kategori ringkas status GA untuk agregasi Ringkasan Aktivitas (ranking &
// donut chart). "validated" = TERVALIDASI + TERVALIDASI_LUAR_AREA.
// Target RGU-GA SP Biometric per-promotor (default 150, sama seperti nilai
// default `salesTarget` di app Promotor). Dipakai untuk menghitung % pencapaian
// individu maupun agregat level Branch/MC/Region (target level = jumlah
// promotor x 150).
const PROMOTOR_BIO_TARGET = 150;
function gaCategory(ga_status) {
  const s = ga_status || "BELUM_TERVALIDASI";
  if (s === "TERVALIDASI" || s === "TERVALIDASI_LUAR_AREA") return "validated";
  if (s === "TIDAK_SESUAI_OUTLET") return "rejected";
  if (s === "TIDAK_DITEMUKAN") return "notfound";
  return "pending";
}
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

/* Indikator proses bertahap (step-by-step) — dipakai untuk proses yang
   punya beberapa tahapan berurutan dan makan waktu (upload/validasi GA,
   upload titik koordinat outlet), supaya promotor/admin bisa lihat persis
   proses mana yang sedang berjalan, bukan cuma satu spinner generik.
   steps: [{ key, label, sub? }] — statusnya ditentukan dari activeIndex:
     i < activeIndex  → selesai (centang hijau)
     i === activeIndex → sedang berjalan (spinner + progress bar opsional)
     i > activeIndex  → belum mulai (bulat kosong, abu-abu)
   progress (0..1, opsional) hanya dipakai untuk step yang sedang aktif. */
function StepProgress({ t, steps, activeIndex, progress }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {steps.map((s, i) => {
        const done = i < activeIndex || activeIndex >= steps.length;
        const active = i === activeIndex;
        const pct = active && typeof progress === "number" ? Math.max(0, Math.min(1, progress)) : null;
        return (
          <div key={s.key} style={{ display: "flex", gap: 12, padding: "9px 2px" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                background: done ? t.greenBg : active ? t.brandBg : t.sub,
                border: `1.5px solid ${done ? t.greenBd : active ? t.brandBd : t.line}`,
                color: done ? t.green : active ? t.brand : t.lo, transition: "all .2s",
              }}>
                {done ? <CheckCircle2 size={15} /> : active ? <Loader2 size={13} className="spin" /> : <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />}
              </div>
              {i < steps.length - 1 && <div style={{ width: 1.5, flex: 1, minHeight: 14, marginTop: 4, background: done ? t.greenBd : t.line }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingBottom: i < steps.length - 1 ? 10 : 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: done || active ? t.hi : t.mid }}>{s.label}</div>
              {s.sub && <div style={{ fontSize: 12, color: t.mid, marginTop: 2 }}>{s.sub}</div>}
              {active && pct != null && (
                <div style={{ marginTop: 8, height: 6, borderRadius: 99, background: t.sub, overflow: "hidden", maxWidth: 320 }}>
                  <div style={{ height: "100%", width: `${Math.round(pct * 100)}%`, background: t.brand, borderRadius: 99, transition: "width .25s ease" }} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
export default function PTS_Module({ supabase, theme = "light", profile }) {
  const d = theme === "dark";
  const t = mk(d);

  // Default ke tab pertama ("promotor") — sebelumnya default-nya "upload",
  // yang bukan salah satu value tab yang valid (lihat daftar Segmented di
  // bawah), sehingga tidak ada satupun konten tab yang cocok untuk
  // dirender saat pertama masuk halaman ini (tampak kosong/blank sampai
  // promotor tap salah satu menu).
  const [tab, setTab] = useState("promotor");           // promotor | geofence | preview | ga | claims | whatsapp
  const [period, setPeriod] = useState(PERIOD_OPTIONS[0]);
  const [outlets, setOutlets] = useState([]);          // {code, ...}
  // Outlet fisik bisa punya ID IM3 (code) dan ID 3ID (code_3id) sekaligus —
  // keduanya harus bisa dipakai untuk mencocokkan ID Outlet dari file upload.
  const outletByCode = useMemo(() => {
    const m = new Map();
    outlets.forEach((o) => {
      if (o.code) m.set(String(o.code).trim().toUpperCase(), o);
      if (o.code_3id) m.set(String(o.code_3id).trim().toUpperCase(), o);
    });
    return m;
  }, [outlets]);

  const loadOutlets = useCallback(async () => {
    const { data } = await supabase.from("pts_outlet").select("*").limit(20000);
    setOutlets(data || []);
  }, [supabase]);
  useEffect(() => { loadOutlets(); }, [loadOutlets]);

  /* ── "Lihat sebagai" (View As) — hanya utk SPM Sumatera ────────────────
     Supaya SPM bisa mengecek tampilan SFM Circle / SFM Region / CSE-RSE
     per MC tanpa perlu login berganti-ganti akun. Ini simulasi TAMPILAN
     & SCOPING KLIEN saja (roleLockedRegion/roleLockedMc, tombol aksi) —
     data yang sudah ter-fetch tetap penuh (RLS asli SPM tidak berubah),
     jadi write tetap memakai wewenang SPM yang sesungguhnya. ──────────── */
  const isSpmSumatera = profile?.role === "spm_sumatera";
  const [viewAs, setViewAs] = useState("self");            // self | circle | region | cse
  const [viewAsRegion, setViewAsRegion] = useState(REGIONS[0]);
  const [viewAsMc, setViewAsMc] = useState("");
  const [mcOptions, setMcOptions] = useState([]);

  useEffect(() => {
    if (!isSpmSumatera) return;
    (async () => {
      const { data } = await supabase.from("pts_assignment").select("mc").not("mc", "is", null);
      const uniq = [...new Set((data || []).map((r) => String(r.mc || "").trim()).filter(Boolean))].sort();
      setMcOptions(uniq);
      setViewAsMc((cur) => cur || uniq[0] || "");
    })();
  }, [isSpmSumatera, supabase]);

  const isViewingAs = isSpmSumatera && viewAs !== "self";
  const effectiveProfile = useMemo(() => {
    if (!isViewingAs) return profile;
    if (viewAs === "circle") return { ...profile, role: "salesforce_mgmt_sumatera" };
    if (viewAs === "region") return { ...profile, role: REGION_SFM_ROLE[viewAsRegion], region: viewAsRegion };
    if (viewAs === "cse") return { ...profile, role: "cse_rse", cluster: viewAsMc };
    return profile;
  }, [isViewingAs, viewAs, viewAsRegion, viewAsMc, profile]);

  const viewAsSummary = viewAs === "circle" ? "SFM Circle (Salesforce Mgmt Sumatera)"
    : viewAs === "region" ? `SFM Region — ${viewAsRegion}`
    : viewAs === "cse" ? `CSE / RSE — MC ${viewAsMc || "(pilih MC)"}`
    : "";

  // pts_full_admin() di server juga meng-include salesforce_mgmt_sumatera —
  // klien wajib konsisten, supaya simulasi "Lihat sebagai SFM Circle"
  // benar-benar merepresentasikan akses aslinya (bukan tampilan salah).
  const isFullAdmin = effectiveProfile?.role === "spm_sumatera" || effectiveProfile?.role === "internal_ioh" || effectiveProfile?.role === "salesforce_mgmt_sumatera";

  // Role dengan akses menu dipersempit (lihat komentar di Segmented di
  // bawah): SFM Circle, SFM Region (semua region), dan CSE/RSE.
  const isRestrictedTabRole = effectiveProfile?.role === "salesforce_mgmt_sumatera"
    || effectiveProfile?.role === "cse_rse"
    || Object.values(REGION_SFM_ROLE).includes(effectiveProfile?.role);

  // Kalau tab yang sedang aktif ternyata tidak diizinkan untuk role saat ini
  // (mis. SPM sedang di tab "Validasi GA" lalu beralih "Lihat sebagai" SFM
  // Circle), pindahkan otomatis ke tab pertama yang diizinkan supaya tidak
  // nyangkut di layar yang menu-nya sudah hilang dari Segmented.
  useEffect(() => {
    if (isRestrictedTabRole && tab !== "promotor" && tab !== "preview") setTab("promotor");
  }, [isRestrictedTabRole, tab]);

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <style>{`
        .pts-in{font-family:${FF};font-size:13.5px;color:${t.hi};background:${t.inputBg};border:1px solid ${t.line};border-radius:9px;padding:9px 12px;outline:none;transition:border-color .15s}
        .pts-in:focus{border-color:${t.brandBd}}
        /* Select memakai class tambahan ini supaya panah dropdown-nya tidak
           mepet ke tepi kotak (sebelumnya .pts-in dipakai apa adanya untuk
           <select>, jadi mengandalkan panah bawaan browser yang render-nya
           terlalu dekat ke border). appearance:none + panah kustom via
           background-image, dengan jarak yang konsisten dari tepi kanan. */
        .pts-select{appearance:none;-webkit-appearance:none;-moz-appearance:none;cursor:pointer;padding-right:34px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='${encodeURIComponent(t.mid)}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;background-size:15px}
        .pts-btn{font-family:${FF};display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;letter-spacing:-.01em;padding:9px 16px;border-radius:10px;cursor:pointer;border:1px solid transparent;transition:all .15s}
        .pts-btn:disabled{opacity:.5;cursor:not-allowed}
        .pts-th{position:sticky;top:0;z-index:2;background:${t.sub};font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${t.mid};padding:11px 12px;text-align:left;white-space:nowrap;border-bottom:1px solid ${t.line}}
        .pts-td{padding:11px 12px;font-size:12.5px;color:${t.hi};border-bottom:1px solid ${t.lineSoft};white-space:nowrap}
        .pts-row:hover{background:${t.hover}}
        .pts-th-sticky{left:0;z-index:3;box-shadow:1px 0 0 ${t.line}}
        .pts-td-sticky{position:sticky;left:0;z-index:1;background:${t.card};box-shadow:1px 0 0 ${t.lineSoft}}
        .pts-row:hover .pts-td-sticky{background:${t.hover}}
      `}</style>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 22 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: t.brandBg, color: t.brand, border: `1px solid ${t.brandBd}` }}>
            <Store size={22} strokeWidth={2.1} />
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.025em", color: t.hi, lineHeight: 1.1 }}>Promotor Tracking System</h2>
            <p style={{ fontSize: 13, color: t.mid, marginTop: 3 }}>Mapping outlet &amp; pemantauan aktivitas Promotor {profile?.region ? `region ${profile.region}` : "Sumatera"}.</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          {/* "Lihat sebagai" — hanya utk SPM Sumatera, supaya bisa cek tampilan
              role lain (SFM Circle/Region, CSE-RSE per MC) tanpa ganti akun. */}
          {isSpmSumatera && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: t.lo }}>Lihat sebagai</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {/* Setiap select dibungkus wrapper relative + ikon panah
                    sendiri (bukan andalkan panah bawaan browser yang hilang
                    gara-gara appearance:none), dengan padding kanan yang
                    cukup supaya panahnya tidak mepet ke tepi/teks. */}
                <div style={{ position: "relative" }}>
                  <select value={viewAs} onChange={(e) => setViewAs(e.target.value)}
                    style={{ appearance: "none", fontFamily: FF, fontSize: 13, fontWeight: 700, color: isViewingAs ? t.amber : t.hi, background: t.card, border: `1.5px solid ${isViewingAs ? t.amberBd : t.line}`, borderRadius: 11, padding: "10px 34px 10px 14px", cursor: "pointer", boxShadow: t.sm }}>
                    <option value="self">Saya sendiri (SPM Sumatera)</option>
                    <option value="circle">SFM Circle</option>
                    <option value="region">SFM Region</option>
                    <option value="cse">CSE / RSE (per MC)</option>
                  </select>
                  <ChevronDown size={14} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: isViewingAs ? t.amber : t.mid, pointerEvents: "none" }} />
                </div>
                {viewAs === "region" && (
                  <div style={{ position: "relative" }}>
                    <select value={viewAsRegion} onChange={(e) => setViewAsRegion(e.target.value)}
                      style={{ appearance: "none", fontFamily: FF, fontSize: 13, fontWeight: 600, color: t.hi, background: t.card, border: `1.5px solid ${t.amberBd}`, borderRadius: 11, padding: "10px 34px 10px 14px", cursor: "pointer", boxShadow: t.sm }}>
                      {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <ChevronDown size={14} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: t.amber, pointerEvents: "none" }} />
                  </div>
                )}
                {viewAs === "cse" && (
                  <div style={{ position: "relative" }}>
                    <select value={viewAsMc} onChange={(e) => setViewAsMc(e.target.value)}
                      style={{ appearance: "none", fontFamily: FF, fontSize: 13, fontWeight: 600, color: t.hi, background: t.card, border: `1.5px solid ${t.amberBd}`, borderRadius: 11, padding: "10px 34px 10px 14px", cursor: "pointer", boxShadow: t.sm, maxWidth: 220 }}>
                      {mcOptions.length === 0 && <option value="">(belum ada data MC)</option>}
                      {mcOptions.map((mc) => <option key={mc} value={mc}>{mc}</option>)}
                    </select>
                    <ChevronDown size={14} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: t.amber, pointerEvents: "none" }} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Selektor bulan — menonjol */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: t.lo }}>Bulan aktif</label>
            <div style={{ position: "relative" }}>
              <CalendarDays size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: t.brand, pointerEvents: "none" }} />
              <select value={period} onChange={(e) => setPeriod(e.target.value)}
                style={{ appearance: "none", fontFamily: FF, fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em", color: t.hi, background: t.card, border: `1.5px solid ${t.brandBd}`, borderRadius: 11, padding: "10px 40px 10px 34px", cursor: "pointer", boxShadow: t.sm }}>
                {PERIOD_OPTIONS.map((p) => <option key={p} value={p}>{ymLabel(p)}</option>)}
              </select>
              <ChevronDown size={15} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: t.mid, pointerEvents: "none" }} />
            </div>
          </div>
        </div>
      </div>

      {isViewingAs && (
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 16px", borderRadius: 12, background: t.amberBg, border: `1px solid ${t.amberBd}`, marginBottom: 18 }}>
          <Eye size={17} color={t.amber} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: t.hi, flex: 1 }}>
            Sedang melihat tampilan sebagai <b style={{ color: t.amber }}>{viewAsSummary}</b> — data terlihat &amp; tombol aksi mengikuti batasan role ini. Aksi simpan/hapus tetap memakai wewenang Anda (SPM Sumatera) yang sebenarnya, bukan batasan simulasi ini.
          </span>
          <button onClick={() => setViewAs("self")} className="pts-btn" style={{ background: t.card, color: t.amber, border: `1px solid ${t.amberBd}`, flexShrink: 0 }}><X size={13} /> Kembali ke tampilan saya</button>
        </div>
      )}

      {/* ── Tab switch — diurut sesuai alur kerja: daftarkan & map promotor →
          atur radius → pantau aktivitas → validasi GA → audit klaim.
          Roster & Mapping Outlet SENGAJA digabung jadi satu menu — identitas
          promotor dan penugasan outletnya adalah satu pekerjaan, bukan dua
          tab terpisah yang harus bolak-balik.
          Role SFM (Circle/Region) & CSE/RSE cuma perlu memantau, bukan
          mengatur geofence/validasi GA/klaim/WA — jadi menu untuk mereka
          dipersempit ke Promotor & Outlet + Ringkasan Aktivitas saja. Ini
          otomatis ikut berlaku juga saat SPM memakai "Lihat sebagai" untuk
          menyimulasikan tampilan role tsb, karena keduanya sama-sama lewat
          effectiveProfile.role. ───────────────────────── */}
      <div style={{ marginBottom: 22 }}>
        <Segmented t={t} value={tab} onChange={setTab}
          options={[
            { value: "promotor", label: "Promotor & Outlet",        icon: <IdCard size={14} /> },
            ...(isRestrictedTabRole ? [] : [{ value: "geofence", label: "Geofence", icon: <Radar size={14} /> }]),
            { value: "preview",  label: "Ringkasan Aktivitas",      icon: <FileSpreadsheet size={14} /> },
            ...(isRestrictedTabRole ? [] : [
              { value: "ga",       label: "Validasi GA",            icon: <UploadCloud size={14} /> },
              { value: "claims",   label: "Klaim Nomor",            icon: <ArrowLeftRight size={14} /> },
              { value: "whatsapp", label: "Call Center WA",         icon: <Phone size={14} /> },
            ]),
          ]} />
      </div>

      {tab === "promotor" && <PromotorOutletManager t={t} d={d} supabase={supabase} profile={effectiveProfile} period={period} outletByCode={outletByCode} outletsLoaded={outlets.length} onOutletsNeeded={loadOutlets} />}
      {tab === "preview"  && <PreviewData     t={t} d={d} supabase={supabase} period={period} outletByCode={outletByCode} />}
      {tab === "geofence" && <GeofenceSettings t={t} d={d} supabase={supabase} profile={effectiveProfile} outlets={outlets} isFullAdmin={isFullAdmin} onOutletsChanged={loadOutlets} />}
      {tab === "ga"       && <GaValidation    t={t} d={d} supabase={supabase} profile={effectiveProfile} isFullAdmin={isFullAdmin} outletByCode={outletByCode} period={period} />}
      {tab === "claims"   && <ClaimHistory    t={t} d={d} supabase={supabase} />}
      {tab === "whatsapp" && <WhatsappSettings t={t} supabase={supabase} profile={effectiveProfile} isFullAdmin={isFullAdmin} />}
    </div>
  );
}

/* ══════════════════════════ UPLOAD MAPPING ════════════════════════════ */
/* ══════════════════════════ PROMOTOR & OUTLET ══════════════════════════
   Satu menu gabungan: identitas promotor (roster) DAN mapping outlet
   ditangani bersama — identitas orang dan penugasan outletnya adalah satu
   pekerjaan, jadi tidak perlu dua tab terpisah. ID Promotor jadi kunci
   bisnis (dipakai di mapping outlet & pts_sale), email digeser jadi
   "Email Pribadi" (dipakai utk login). Outlet per bulan dibaca lewat
   pts_effective_assignment — kalau bulan berjalan belum di-upload, otomatis
   pakai mapping bulan terakhir yang ada (alokasi dianggap tetap sampai
   diubah, bukan wajib upload ulang tiap bulan). */
const emptyPromotorForm = () => ({ id: null, promotor_id: "", full_name: "", email: "", phone: "", region: "", effective_date: "", status: "active", sales_target: 150 });

function PromotorOutletManager({ t, d, supabase, profile, period, outletByCode, outletsLoaded, onOutletsNeeded }) {
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState([]);
  const [assignSrc, setAssignSrc] = useState(null); // { sourcePeriod, carried } — dari pts_effective_assignment
  const [q, setQ] = useState("");
  // Filter ala-Excel langsung di header kolom tabel (pola sama dgn roster
  // Manpower — lihat MFTS_TableFilter/MFTS_Manpower): klik ikon filter di
  // <th>, cascading options, tidak auto-apply (tombol Terapkan/Bersihkan).
  const [filters, setFilters] = useState({});
  const [openCol, setOpenCol] = useState("");
  const [rect, setRect] = useState(null);
  const [form, setForm] = useState(emptyPromotorForm());
  const [editing, setEditing] = useState(false);
  const [idLocked, setIdLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showBulkMapping, setShowBulkMapping] = useState(false);
  const [editingMapping, setEditingMapping] = useState(null); // promotor row sedang di-kelola mapping-nya

  const region = profile?.region || "";
  // Role-locked region: PIC Region terkunci ke profile.region, sedangkan
  // SFM Region terkunci ke wilayah role-nya (north/central/south).
  const roleLockedRegion = useMemo(() => {
    const r = profile?.role;
    if (r === "pic_region") return canonRegion(profile?.region) || null;
    if (r === "region_sfm_north") return "NORTH SUMATERA";
    if (r === "region_sfm_central") return "CENTRAL SUMATERA";
    if (r === "region_sfm_south") return "SOUTH SUMATERA";
    return null;
  }, [profile?.role, profile?.region]);
  const picRegion = roleLockedRegion; // backward-compat: variable dipakai di beberapa tempat lama

  // CSE/RSE terkunci ke 1 MC (cluster) — sejalan dgn RLS pts_cse_ok_mc di
  // server. Klien fetch data penuh (RLS asli pemanggil yang membatasi utk
  // CSE sungguhan), jadi filter MC ini dibutuhkan di sisi klien juga.
  const roleLockedMc = useMemo(() => {
    if (profile?.role === "cse_rse" && profile?.cluster) return String(profile.cluster).trim().toUpperCase();
    return null;
  }, [profile?.role, profile?.cluster]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [proRes, asgRes] = await Promise.all([
        // Urut tetap berdasarkan ID Promotor — vacant TIDAK dikelompokkan
        // terpisah, tetap di posisi ID-nya supaya urutan baris stabil &
        // gampang dicari (baris tidak "meloncat" saat status berubah).
        supabase.from("pts_promotor").select("*").order("promotor_id", { ascending: true, nullsFirst: false }),
        supabase.rpc("pts_effective_assignment", { p_period: period }),
      ]);
      const promotors = proRes.data || [];
      const asg = asgRes.data || [];
      setAssignSrc(asg.length ? { sourcePeriod: asg[0].source_period, carried: asg[0].is_carried_forward } : null);

      const outletsByPromotor = new Map(); // promotor.id → [assignment rows]
      const metaByPromotor = new Map();    // promotor.id → {branch, mc}
      asg.forEach((a) => {
        if (!a.promotor_id_ref) return;
        if (!outletsByPromotor.has(a.promotor_id_ref)) outletsByPromotor.set(a.promotor_id_ref, []);
        outletsByPromotor.get(a.promotor_id_ref).push(a);
        if (!metaByPromotor.has(a.promotor_id_ref)) metaByPromotor.set(a.promotor_id_ref, { branch: a.branch, mc: a.mc });
      });

      const enriched = promotors.map((p) => {
        const rows = outletsByPromotor.get(p.id) || [];
        const meta = metaByPromotor.get(p.id);
        const vacant = !!p.vacant;
        const hasRealEmail = !!p.email;
        return {
          ...p,
          outlets: rows.map((a) => {
            const o = outletByCode.get(String(a.outlet_code || "").toUpperCase());
            return { name: o?.name || a.outlet_code, category: o?.category || "", im3: o?.code || a.outlet_code, tid: o?.code_3id || "", idPending: !!o?.id_pending };
          }),
          branch: meta?.branch || "", mc: meta?.mc || "",
          // Field flat (string) supaya bisa langsung difilter ala-Excel di header
          // kolom (lihat FCOLS/MFTS_TableFilter) — bukan objek turunan terpisah.
          statusPromo: vacant ? "Vacant" : (hasRealEmail && p.effective_date ? "Aktif" : "Pending"),
          statusMap: rows.length > 0 ? "Sudah ter-mapping" : "Belum ter-mapping",
          statusLogin: p.auth_user_id ? "Sudah login" : "Belum login",
        };
      });
      setList(enriched);
    } catch { setList([]); } finally { setLoading(false); }
  }, [supabase, period, outletByCode]);
  useEffect(() => { load(); }, [load]);

  // Kolom yang bisa difilter ala-Excel langsung dari header tabel. Region/MC
  // dikeluarkan kalau role sudah dikunci ke 1 region/MC saja (tak ada gunanya).
  const FCOLS = useMemo(() => {
    const cols = [];
    if (!roleLockedRegion) cols.push(["region", "Region"]);
    cols.push(["branch", "Branch"]);
    if (!roleLockedMc) cols.push(["mc", "MC"]);
    cols.push(["statusPromo", "Status Promotor"], ["statusMap", "Status Mapping"], ["statusLogin", "Login"]);
    return cols;
  }, [roleLockedRegion, roleLockedMc]);

  // Scope role-lock (region ATAU MC, tergantung role) + pencarian teks bebas
  // → baru difilter header kolom di atasnya.
  const searched = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter((r) => {
      if (roleLockedRegion && canonRegion(r.region) !== roleLockedRegion) return false;
      if (roleLockedMc && String(r.mc || "").trim().toUpperCase() !== roleLockedMc) return false;
      if (!s) return true;
      return `${r.promotor_id} ${r.full_name || ""} ${r.email || ""} ${r.phone || ""} ${r.outlets.map((o) => o.im3 + " " + o.tid).join(" ")}`.toLowerCase().includes(s);
    });
  }, [list, q, roleLockedRegion, roleLockedMc]);

  const filtered = useMemo(() => searched.filter((r) => passesRow(r, filters, FCOLS, null)), [searched, filters, FCOLS]);

  const resetFilters = () => { setQ(""); setFilters({}); setOpenCol(""); };
  const anyFilterActive = Boolean(q) || FCOLS.some(([k]) => (filters[k] || []).length);

  // Ringkasan atas dihitung dari BARIS YANG SEDANG TAMPIL (sesuai filter aktif)
  // — bukan dari total keseluruhan — supaya angkanya benar-benar mencerminkan
  // apa yang sedang difilter/dilihat admin.
  const stats = useMemo(() => {
    let aktif = 0, vacant = 0, pending = 0, mapped = 0, unmapped = 0, loggedIn = 0, notLoggedIn = 0;
    filtered.forEach((r) => {
      if (r.statusPromo === "Aktif") aktif++; else if (r.statusPromo === "Vacant") vacant++; else pending++;
      if (r.statusMap === "Sudah ter-mapping") mapped++; else unmapped++;
      if (r.statusLogin === "Sudah login") loggedIn++; else notLoggedIn++;
    });
    return { total: filtered.length, aktif, vacant, pending, mapped, unmapped, loggedIn, notLoggedIn };
  }, [filtered]);
  // Denominator konteks ("X dari Y") — total dalam scope role, TANPA filter —
  // dipisah dari `stats` supaya keduanya bisa punya arti masing-masing.
  const scopedTotal = useMemo(() => list.filter((r) =>
    (!roleLockedRegion || canonRegion(r.region) === roleLockedRegion) &&
    (!roleLockedMc || String(r.mc || "").trim().toUpperCase() === roleLockedMc)
  ).length, [list, roleLockedRegion, roleLockedMc]);

  const startNew = () => { setForm({ ...emptyPromotorForm(), region: picRegion || "" }); setIdLocked(false); setEditing(true); setErr(""); };
  const cancel = () => { setEditing(false); setForm(emptyPromotorForm()); setErr(""); };

  const saveForm = async () => {
    setErr("");
    if (!form.promotor_id.trim()) return setErr("ID Promotor wajib diisi.");
    if (!form.full_name.trim()) return setErr("Nama Promotor wajib diisi.");
    if (form.email && !emailValid(form.email)) return setErr("Email Pribadi tidak valid.");
    if (!(Number(form.sales_target) > 0)) return setErr("Target Penjualan harus lebih dari 0.");
    setBusy(true);
    try {
      const payload = {
        promotor_id: form.promotor_id.trim(),
        full_name: form.full_name.trim() || null,
        // Email kosong → NULL. Tidak boleh jadi dummy @pts.local — biar
        // status "Pending" (belum ada email) bisa difilter dengan benar.
        email: form.email.trim().toLowerCase() || null,
        phone: form.phone.trim() || null,
        region: form.region || null,
        effective_date: form.effective_date || null,
        status: form.status,
        sales_target: Number(form.sales_target),
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

  // Status Promotor: Vacant (override manual oleh CSE/SFM Region, dicek
  // ulang di server via RPC) > Aktif (email pribadi + tanggal efektif
  // terisi) > Pending (default, data belum lengkap).
  const promotorStatusInfo = (r) => {
    if (r.vacant) return { label: "Vacant", bg: t.amberBg, fg: t.amber, bd: t.amberBd, icon: <UserX size={11} /> };
    const hasRealEmail = !!r.email;
    if (hasRealEmail && r.effective_date) return { label: "Aktif", bg: t.greenBg, fg: t.green, bd: t.greenBd, icon: <UserCheck size={11} /> };
    return { label: "Pending", bg: t.hover, fg: t.mid, bd: t.line, icon: <Clock size={11} /> };
  };

  // Hint UI saja (tombol muncul/tidak) — otorisasi sesungguhnya selalu dicek
  // ulang di RPC pts_set_promotor_vacant / RLS di server.
  //
  // Aturan scope (identik dgn RLS Supabase):
  //  - spm_sumatera / internal_ioh / salesforce_mgmt_sumatera  → semua promotor
  //  - region_sfm_* / pic_region                                → per region
  //  - cse_rse                                                   → per MC (dari assignment)
  const canManagePromotor = (r) => {
    const role = profile?.role;
    if (role === "spm_sumatera" || role === "internal_ioh" || role === "salesforce_mgmt_sumatera") return true;
    if (role === "region_sfm_north") return canonRegion(r.region) === "NORTH SUMATERA";
    if (role === "region_sfm_central") return canonRegion(r.region) === "CENTRAL SUMATERA";
    if (role === "region_sfm_south") return canonRegion(r.region) === "SOUTH SUMATERA";
    if (role === "pic_region") return canonRegion(r.region) === canonRegion(profile?.region);
    if (role === "cse_rse") {
      // CSE hanya boleh baris promotor yang MC-nya = cluster dia.
      if (!profile?.cluster) return false;
      return String(r.mc || "").toUpperCase() === String(profile.cluster).toUpperCase();
    }
    return false;
  };
  const canManageVacancy = canManagePromotor;   // gate yang sama

  const [vacantBusy, setVacantBusy] = useState(null);
  const toggleVacant = async (r) => {
    setVacantBusy(r.id); setErr("");
    try {
      const { data, error } = await supabase.rpc("pts_set_promotor_vacant", { p_promotor_id: r.id, p_vacant: !r.vacant });
      if (error) throw error;
      if (data?.status === "forbidden") { setErr(`Anda tidak punya akses menandai ${r.full_name} vacant (di luar scope MC/Region Anda).`); return; }
      if (data?.status !== "ok") { setErr("Gagal mengubah status vacant."); return; }
      await load();
    } catch (e) {
      setErr("Gagal: " + (e?.message || e));
    } finally { setVacantBusy(null); }
  };

  /* ── Hapus Promotor ────────────────────────────────────────────────────
     pts_assignment.promotor_id_ref → pts_promotor.id pakai delete_rule
     NO ACTION (bukan cascade) — kalau promotor punya mapping outlet di
     periode manapun, hapus langsung akan gagal kena FK. Jadi bersihkan dulu
     SEMUA baris pts_assignment miliknya (lintas periode), baru hapus
     identitasnya. Riwayat pts_sale TIDAK ikut terhapus (kolom promotor_id
     otomatis jadi NULL via ON DELETE SET NULL) — pencapaian historis tetap
     ada, cuma tautan identitasnya lepas. */
  const [deletingPromotor, setDeletingPromotor] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");
  const deletePromotor = async (r) => {
    setDeleteBusy(true); setDeleteErr("");
    try {
      const { error: delAsgErr } = await supabase.from("pts_assignment").delete().eq("promotor_id_ref", r.id);
      if (delAsgErr) throw delAsgErr;
      const { error: delProErr } = await supabase.from("pts_promotor").delete().eq("id", r.id);
      if (delProErr) throw delProErr;
      setDeletingPromotor(null);
      await load();
    } catch (e) {
      setDeleteErr("Gagal menghapus: " + (e?.message || e));
    } finally { setDeleteBusy(false); }
  };

  /* ── Upload Mapping (bulk identitas + assignment) ─────────────────────
     1 baris file = 1 promotor, sampai 4 slot outlet → di-expand jadi 1
     baris internal per outlet. Relasi kunci: ID Promotor (IM3) diutamakan,
     lalu ID Promotor (3ID), email sebagai cadangan terakhir. ────────────── */
  const mapFileRef = useRef(null);
  const [mapDrag, setMapDrag] = useState(false);
  const [mapRows, setMapRows] = useState(null);
  const [mapFileName, setMapFileName] = useState("");
  const [mapBusy, setMapBusy] = useState(false);
  const [mapResult, setMapResult] = useState(null);
  const [mapErr, setMapErr] = useState("");

  const resetMapParse = () => { setMapRows(null); setMapFileName(""); setMapResult(null); setMapErr(""); if (mapFileRef.current) mapFileRef.current.value = ""; };

  const downloadExcel = () => {
    setMapErr("");
    const withOutlets = list.filter((p) => p.outlets.length > 0);
    const body = withOutlets.map((p) => {
      const row = [p.email || "", p.promotor_id || "", p.user_id_3id || "", p.region || "", p.branch || "", p.mc || ""];
      for (let n = 0; n < OUTLET_SLOTS; n++) {
        const o = p.outlets[n];
        row.push(o?.name || "", o?.category || "", o?.im3 || "", o?.tid || "");
      }
      return row;
    });
    if (body.length === 0) body.push([
      "nama@email.com", "PRSMTRSS1001", "PR3IDSS1001", picRegion || "SOUTH SUMATERA", "Palembang", "MC-01",
      "Outlet Contoh 1", "Kios", "OTL-IM3-0001", "OTL-3ID-0001", "", "", "", "", "", "", "", "", "", "", "", "",
    ]);
    const ws = XLSX.utils.aoa_to_sheet([MAPPING_HEADERS, ...body]);
    ws["!cols"] = MAPPING_HEADERS.map((h) => ({ wch: h.startsWith("NAMA") ? 22 : h.startsWith("ID") ? 16 : 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Mapping ${period}`);
    XLSX.writeFile(wb, `PTS_Mapping_${period}.xlsx`);
  };

  const parseMapFile = async (file) => {
    setMapErr(""); setMapResult(null);
    try {
      if (outletsLoaded === 0) await onOutletsNeeded();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
      if (!raw.length) { setMapErr("File kosong."); return; }
      const head = raw[0].map(normHeader);
      const idx = (name) => head.findIndex((h) => h === normHeader(name));
      const iEmail = idx("ALAMAT EMAIL PROMOTOR"), iIdIm3 = idx("ID PROMOTOR (IM3)"), iId3id = idx("ID PROMOTOR (3ID)"),
            iRegion = idx("REGION"), iBranch = idx("BRANCH"), iMc = idx("MC");
      if (iIdIm3 < 0 && iId3id < 0) {
        setMapErr("Header wajib tidak ditemukan: butuh minimal salah satu 'ID PROMOTOR (IM3)' / 'ID PROMOTOR (3ID)'.");
        return;
      }
      const slots = Array.from({ length: OUTLET_SLOTS }, (_, i) => i + 1).map((n) => ({
        n, iNama: idx(`NAMA OUTLET ${n}`), iKategori: idx(`KATEGORI OUTLET ${n}`),
        iIm3: idx(`ID OUTLET ${n} (IM3)`), iTid: idx(`ID OUTLET ${n} (3ID)`),
      })).filter((s) => s.iNama >= 0 || s.iIm3 >= 0 || s.iTid >= 0);
      if (!slots.length) { setMapErr("Header wajib tidak ditemukan: minimal 1 slot outlet (mis. 'ID OUTLET 1 (IM3)')."); return; }

      // Slot outlet EFEKTIF per promotor — bukan posisi kolom baris asal.
      // Kalau ID Promotor yang sama muncul lagi di baris lain (mis. dobel
      // input, masing-masing cuma isi Outlet 1 dengan outlet berbeda),
      // kemunculan kedua otomatis digeser ke slot berikutnya yang masih
      // kosong (Outlet 2, dst) — bukan tabrakan di slot 1 yang sama.
      // Maksimal tetap 4 outlet per promotor; kelebihannya error, bukan
      // dibuang diam-diam.
      const slotCounter = new Map(); // promoKey → jumlah outlet terpakai
      const nextSlot = (key) => {
        const n = (slotCounter.get(key) || 0) + 1;
        slotCounter.set(key, n);
        return n;
      };

      const expanded = [];
      for (let r = 1; r < raw.length; r++) {
        const row = raw[r]; if (!row || row.every((c) => c === "" || c == null)) continue;
        const email = String(row[iEmail] ?? "").trim();
        const promotorId = iIdIm3 >= 0 ? String(row[iIdIm3] ?? "").trim() : "";
        const user3id = iId3id >= 0 ? String(row[iId3id] ?? "").trim() : "";
        if (!email && !promotorId && !user3id) continue;
        const regRaw = iRegion >= 0 ? String(row[iRegion] ?? "").trim() : "";
        const regCanon = canonRegion(regRaw) || canonRegion(region);
        const branch = iBranch >= 0 ? String(row[iBranch] ?? "").trim() : "";
        const mc = iMc >= 0 ? String(row[iMc] ?? "").trim() : "";

        const rowErrs = [];
        // Email pribadi opsional di tahap ini (dipakai untuk sinkron login bila
        // diisi) — identitas promotor sudah cukup dari ID IM3/3ID saja.
        if (!promotorId && !user3id) rowErrs.push("ID Promotor (IM3/3ID) kosong");
        if (!regCanon) rowErrs.push("Region harus North/Central/South Sumatera");
        else if (picRegion && regCanon !== picRegion) rowErrs.push(`Di luar wilayah Anda (${picRegion})`);

        const promoKey = (promotorId || user3id || email || `row-${r}`).toUpperCase();

        let anyOutlet = false;
        slots.forEach((s) => {
          const outletName = s.iNama >= 0 ? String(row[s.iNama] ?? "").trim() : "";
          const kategori = s.iKategori >= 0 ? String(row[s.iKategori] ?? "").trim() : "";
          const outIm3 = s.iIm3 >= 0 ? String(row[s.iIm3] ?? "").trim() : "";
          const outTid = s.iTid >= 0 ? String(row[s.iTid] ?? "").trim() : "";
          if (!outletName && !outIm3 && !outTid) return; // slot benar-benar kosong — lewati
          anyOutlet = true;

          // Slot efektif promotor ini (lintas baris) — bukan posisi kolom
          // baris asal. ID Promotor sama yang muncul lagi di baris lain
          // otomatis lanjut ke slot berikutnya (Outlet 2, 3, 4), bukan
          // tabrakan di slot yang sama.
          const effSlot = nextSlot(promoKey);
          if (effSlot > OUTLET_SLOTS) {
            expanded.push({
              rowNo: r + 1, slot: effSlot, period,
              email, promotor_id: promotorId, user_id_3id: user3id,
              outlet_code: "", outlet_code_3id: null, outlet_im3: outIm3 || "", outlet_3id: outTid || "",
              outlet_id: null, outlet_name: outletName || "", category: kategori || "",
              branch, mc, region: regCanon || regRaw, isNewOutlet: false, idIncomplete: false,
              errors: [...rowErrs, `Promotor sudah punya ${OUTLET_SLOTS} outlet — outlet ke-${effSlot} ini tidak bisa diproses`],
            });
            return;
          }

          // Outlet dengan nama tapi belum ada ID sama sekali TETAP disimpan
          // (bukan error yang menggagalkan baris) — itu tetap alokasi nyata,
          // cuma ID resminya belum lengkap. Pakai kode placeholder supaya
          // baris ini tidak pernah dibuang begitu saja.
          const hasId = !!(outIm3 || outTid);
          const idIncomplete = !hasId;
          const primaryCode = outIm3 || outTid || `PENDING-${promoKey}-${effSlot}`;
          const secondaryCode = outIm3 && outTid ? outTid : null;
          const existing = hasId ? outletByCode.get(primaryCode.toUpperCase()) : null;
          expanded.push({
            rowNo: r + 1, slot: effSlot, period,
            email, promotor_id: promotorId, user_id_3id: user3id,
            outlet_code: primaryCode, outlet_code_3id: secondaryCode,
            outlet_im3: outIm3 || "", outlet_3id: outTid || "",
            outlet_id: existing?.id || null, outlet_name: outletName || existing?.name || primaryCode,
            category: kategori || existing?.category || "",
            branch, mc, region: regCanon || regRaw,
            isNewOutlet: !existing, idIncomplete, errors: [...rowErrs],
          });
        });
        if (!anyOutlet) {
          // Identity-only row: promotor terdaftar/di-update, tapi belum
          // punya outlet bulan ini. Bukan error — tetap tersimpan supaya
          // status Aktif/Vacant/Pending & filter berjalan benar.
          expanded.push({
            rowNo: r + 1, slot: 0, period, email, promotor_id: promotorId, user_id_3id: user3id,
            outlet_code: "", outlet_code_3id: null, outlet_id: null, outlet_name: "", category: "",
            branch, mc, region: regCanon || regRaw, isNewOutlet: false, identityOnly: true,
            errors: [...rowErrs],
          });
        }
      }
      setMapRows(expanded);
    } catch (e) {
      setMapErr("Gagal membaca file: " + (e?.message || e));
    }
  };

  const onMapPick = (e) => { const f = e.target.files?.[0]; if (f) { setMapFileName(f.name); parseMapFile(f); } };
  const onMapDrop = (e) => { e.preventDefault(); setMapDrag(false); const f = e.dataTransfer.files?.[0]; if (f) { setMapFileName(f.name); parseMapFile(f); } };

  const mapErrorCount = mapRows ? mapRows.filter((r) => r.errors.length).length : 0;
  const mapOkRows = mapRows ? mapRows.filter((r) => !r.errors.length) : [];
  const mapUniqPromotors = mapRows ? new Set(mapOkRows.map((r) => (r.email || r.promotor_id || r.user_id_3id).toLowerCase())).size : 0;
  const mapNewOutlets = mapRows ? [...new Set(mapOkRows.filter((r) => r.isNewOutlet && r.outlet_code).map((r) => r.outlet_code.toUpperCase()))] : [];
  const mapIncompleteCount = mapRows ? mapOkRows.filter((r) => r.idIncomplete).length : 0;

  const saveMap = async () => {
    if (!mapOkRows.length) return;
    setMapBusy(true); setMapErr(""); setMapResult(null);
    try {
      // 1) Upsert outlet dari tiap slot (code = ID IM3/3ID mana pun yang terisi)
      const seenOut = new Set();
      const outletPayload = [];
      mapOkRows.forEach((r) => {
        if (!r.outlet_code) return;
        const key = r.outlet_code.toUpperCase();
        if (seenOut.has(key)) return;
        seenOut.add(key);
        outletPayload.push({
          code: r.outlet_code, code_3id: r.outlet_code_3id || null,
          name: r.outlet_name || r.outlet_code, category: r.category || null,
          branch: r.branch, region: r.region, status: "active",
          id_pending: !!r.idIncomplete,
        });
      });
      if (outletPayload.length) {
        const { error: outErr } = await supabase.from("pts_outlet").upsert(outletPayload, { onConflict: "code" });
        if (outErr) throw outErr;
      }

      // 2) Resolve promotor: ID IM3 → ID 3ID → email (pola ID-dulu-email-cadangan).
      //    Yang belum terdaftar OTOMATIS dibuat (upsert by promotor_id) —
      //    tidak perlu langkah "roster import" terpisah lagi.
      let { data: pros } = await supabase.from("pts_promotor").select("id,promotor_id,user_id_3id,email,full_name");
      const buildMaps = (list) => ({
        byIm3: new Map((list || []).filter((p) => p.promotor_id).map((p) => [String(p.promotor_id).toUpperCase(), p])),
        by3id: new Map((list || []).filter((p) => p.user_id_3id).map((p) => [String(p.user_id_3id).toUpperCase(), p])),
        byEmail: new Map((list || []).map((p) => [(p.email || "").toLowerCase(), p])),
      });
      let { byIm3: proByIm3, by3id: proBy3id, byEmail: proByEmail } = buildMaps(pros);
      const resolvePro = (r) => (r.promotor_id && proByIm3.get(r.promotor_id.toUpperCase()))
        || (r.user_id_3id && proBy3id.get(r.user_id_3id.toUpperCase()))
        || (r.email && proByEmail.get(r.email.toLowerCase()));

      const uniqByPromotor = new Map(); // 1 entri per promotor unik (dedup lintas slot)
      mapOkRows.forEach((r) => { const k = (r.promotor_id || r.user_id_3id || r.email).toUpperCase(); if (!uniqByPromotor.has(k)) uniqByPromotor.set(k, r); });

      // Baris tanpa promotor_id (IM3) tidak bisa auto-create karena
      // promotor_id adalah kunci bisnis wajib. Yang mungkin dibuat: ada
      // promotor_id tapi belum ada di DB.
      const toCreate = [...uniqByPromotor.values()].filter((r) => r.promotor_id && !resolvePro(r));
      let createdCount = 0;
      if (toCreate.length) {
        const createPayload = toCreate.map((r) => ({
          promotor_id: r.promotor_id,
          user_id_3id: r.user_id_3id || null,
          full_name: null,   // nama menyusul dari Promotor Baru / Edit
          email: r.email || null,
          region: r.region || null,
          status: "pending",
        }));
        const { error: crErr } = await supabase.from("pts_promotor").upsert(createPayload, { onConflict: "promotor_id" });
        if (crErr) throw crErr;
        createdCount = createPayload.length;
        // Refresh cache dari server supaya baris baru bisa diresolve
        const refresh = await supabase.from("pts_promotor").select("id,promotor_id,user_id_3id,email,full_name");
        pros = refresh.data || pros;
        ({ byIm3: proByIm3, by3id: proBy3id, byEmail: proByEmail } = buildMaps(pros));
      }

      const stillMissing = [...uniqByPromotor.values()].filter((r) => !resolvePro(r));
      if (stillMissing.length) {
        const preview = stillMissing.slice(0, 8).map((r) => r.email || r.user_id_3id).join(", ");
        throw new Error(`Baris tanpa ID Promotor (IM3) tidak bisa dibuat otomatis: ${preview}${stillMissing.length > 8 ? ` (+${stillMissing.length - 8} lainnya)` : ""}. Lengkapi ID Promotor (IM3) di file.`);
      }

      // 3) Sinkron email pribadi & ID 3ID promotor dari file (tidak pernah
      //    menimpa nilai asli dengan kosong; kegagalan 1 promotor tidak
      //    menggagalkan keseluruhan batch — email unik bisa bentrok).
      const proUpdates = [];
      uniqByPromotor.forEach((r) => {
        const pro = resolvePro(r);
        const patch = {};
        if (r.email && pro.email?.toLowerCase() !== r.email.toLowerCase()) patch.email = r.email;
        if (r.user_id_3id && pro.user_id_3id !== r.user_id_3id) patch.user_id_3id = r.user_id_3id;
        if (Object.keys(patch).length) proUpdates.push({ id: pro.id, patch });
      });
      await Promise.all(proUpdates.map(async ({ id, patch }) => {
        const { error } = await supabase.from("pts_promotor").update(patch).eq("id", id);
        if (error) console.warn("Gagal sinkron promotor", id, error.message);
      }));

      // 4) Refresh master outlet → resolve outlet_id untuk semua kode
      const { data: freshOutlets } = await supabase.from("pts_outlet").select("id,code");
      const idByCode = new Map((freshOutlets || []).map((o) => [String(o.code).trim().toUpperCase(), o.id]));

      // 5) Replace mapping bulan ini — HANYA baris yang punya outlet yang
      //    di-insert ke pts_assignment. Baris identity-only sudah di-upsert
      //    ke pts_promotor di atas dan tidak menghasilkan assignment.
      const { error: delErr } = await supabase.from("pts_assignment").delete().eq("period", period);
      if (delErr) throw delErr;
      const payload = mapOkRows.filter((r) => r.outlet_code).map((r) => {
        const pro = resolvePro(r);
        return {
          period: r.period, email: pro?.email || r.email || null, full_name: pro?.full_name || null,
          promotor_id_ref: pro?.id || null, mc: r.mc || null,
          outlet_id: idByCode.get(r.outlet_code.toUpperCase()) || null,
          outlet_code: r.outlet_code, branch: r.branch, region: r.region,
          status: "active", assigned_by: profile?.id || null,
        };
      });
      if (payload.length) {
        const { error: insErr } = await supabase.from("pts_assignment").insert(payload);
        if (insErr) throw insErr;
      }

      await onOutletsNeeded(); // muat ulang master outlet di modul
      await load(); // refresh tabel gabungan
      const identityOnlyCount = mapOkRows.filter((r) => r.identityOnly).length;
      setMapResult({
        mappings: payload.length,
        promotors: uniqByPromotor.size,
        identityOnly: identityOnlyCount,
        created: createdCount,
        skipped: mapErrorCount,
        newOutlets: outletPayload.filter((o) => !outletByCode.get(o.code.toUpperCase())).length,
      });
      setMapRows(null); setMapFileName(""); if (mapFileRef.current) mapFileRef.current.value = "";
    } catch (e) {
      setMapErr("Gagal menyimpan: " + (e?.message || e));
    } finally { setMapBusy(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 16px", borderRadius: 12, background: t.brandBg, border: `1px solid ${t.brandBd}`, marginBottom: 18 }}>
        <Info size={17} color={t.brand} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13.5, color: t.hi, fontWeight: 500 }}>
          Identitas Promotor &amp; penugasan outlet-nya untuk <b style={{ color: t.brand }}>{ymLabel(period)}</b> dalam satu tabel. Alokasi outlet dianggap tetap sampai diubah — kalau bulan ini belum di-upload, otomatis pakai mapping bulan terakhir.
          {assignSrc?.carried && <> <b style={{ color: t.amber }}>Sedang menampilkan mapping dari {ymLabel(assignSrc.sourcePeriod)}.</b></>}
        </span>
      </div>

      {/* Ringkasan — mengikuti filter yang sedang aktif (search + filter
          header kolom), bukan total keseluruhan. Angka "X dari Y" total
          tanpa-filter tetap ada di caption bawah tabel untuk konteks. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 14 }}>
        <StatMini t={t} label="Ditampilkan"  value={stats.total}       tone="neutral" />
        <StatMini t={t} label="Aktif"        value={stats.aktif}       tone="green" />
        <StatMini t={t} label="Vacant"       value={stats.vacant}      tone="amber" />
        <StatMini t={t} label="Pending"      value={stats.pending}     tone="neutral" />
        <StatMini t={t} label="Ter-mapping"  value={stats.mapped}      tone="green" />
        <StatMini t={t} label="Belum mapping" value={stats.unmapped}   tone="blue" />
        <StatMini t={t} label="Sudah login"  value={stats.loggedIn}    tone="green" />
        <StatMini t={t} label="Belum login"  value={stats.notLoggedIn} tone="amber" />
      </div>

      {/* Toolbar: search + actions. Filter per kolom sekarang langsung di
          header tabel (klik ikon filter di setiap <th>, ala-Excel) — lihat
          FilterTh/FilterMenu di bawah, pola yang sama seperti roster Manpower. */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: t.mid }} />
            <input className="pts-in" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari ID Promotor / nama / email / outlet"
              style={{ paddingLeft: 32, width: 300 }} />
          </div>
          {anyFilterActive && (
            <button className="pts-btn" onClick={resetFilters} style={{ background: t.redBg, color: t.red, border: `1px solid ${t.redBd}` }}><FilterX size={14} /> Hapus filter</button>
          )}
          {anyFilterActive && <span style={{ fontSize: 11.5, color: t.mid, fontWeight: 600 }}>{filtered.length} dari {searched.length} baris</span>}
        </div>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <button className="pts-btn" onClick={load} style={{ background: t.card, color: t.mid, border: `1px solid ${t.line}` }}><RefreshCw size={14} /> Muat ulang</button>
          <button className="pts-btn" onClick={downloadExcel} style={{ background: t.card, color: t.hi, border: `1px solid ${t.line}`, boxShadow: t.sm }}><Download size={15} /> Download Mapping {ymLabel(period)}</button>
          {/* Upload massal via Excel — level SFM ke atas saja (SFM Circle/Region,
              PIC Region, SPM). CSE/RSE hanya kelola per-promotor lewat "Edit Data". */}
          {profile?.role !== "cse_rse" && (
            <button className="pts-btn" onClick={() => { setShowBulkMapping((v) => !v); resetMapParse(); }} style={{ background: t.card, color: t.hi, border: `1px solid ${t.line}`, boxShadow: t.sm }}><Upload size={15} /> Upload Mapping</button>
          )}
          {profile?.role !== "cse_rse" && (
            <button className="pts-btn" onClick={startNew} style={{ background: t.brand, color: "#fff", boxShadow: t.sm }}><Plus size={15} /> Promotor Baru</button>
          )}
        </div>
      </div>

      {/* ── Panel: Upload Mapping — dijaga ganda (tombol pembukanya sudah
          disembunyikan dari CSE/RSE, ini jaga-jaga kalau showBulkMapping
          somehow true). ─────────────────────────────────────────────── */}
      {showBulkMapping && profile?.role !== "cse_rse" && (
        <div style={{ marginBottom: 18, padding: 18, borderRadius: 14, background: t.card, border: `1px solid ${t.line}`, boxShadow: t.md }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.hi, marginBottom: 6 }}>Upload Mapping — {ymLabel(period)}</div>
          <div style={{ fontSize: 12.5, color: t.mid, marginBottom: 14 }}>
            Kolom: Alamat Email Promotor · ID Promotor (IM3) · ID Promotor (3ID) · Region · Branch · MC · lalu Nama/Kategori/ID Outlet (IM3)/(3ID) untuk Outlet 1–4. 1 baris = 1 promotor, sampai 4 outlet. Promotor baru akan otomatis dibuat berdasarkan ID Promotor bila belum ada di sistem.
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setMapDrag(true); }}
            onDragLeave={() => setMapDrag(false)}
            onDrop={onMapDrop}
            onClick={() => mapFileRef.current?.click()}
            style={{
              border: `1.5px dashed ${mapDrag ? t.brand : t.line}`, borderRadius: 14, padding: "26px 20px", textAlign: "center", cursor: "pointer",
              background: mapDrag ? t.brandBg : t.sub, transition: "all .15s",
            }}>
            <input ref={mapFileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onMapPick} />
            <FileSpreadsheet size={22} style={{ color: t.brand, marginBottom: 8 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: t.hi }}>{mapFileName || "Tarik file .xlsx / .csv ke sini, atau klik untuk memilih"}</div>
          </div>

          {mapErr && (
            <div style={{ marginTop: 14, display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: t.redBg, border: `1px solid ${t.redBd}` }}>
              <AlertTriangle size={16} color={t.red} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13, color: t.hi }}>{mapErr}</span>
            </div>
          )}

          {mapResult && (
            <div style={{ marginTop: 14, display: "flex", gap: 11, padding: "14px 16px", borderRadius: 12, background: t.greenBg, border: `1px solid ${t.greenBd}` }}>
              <CheckCircle2 size={18} color={t.green} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13.5, color: t.hi }}>
                <b>Mapping {ymLabel(period)} tersimpan.</b> {mapResult.mappings} mapping outlet untuk {mapResult.promotors} Promotor.
                {mapResult.created > 0 && <span style={{ color: t.blue }}> {mapResult.created} promotor baru dibuat.</span>}
                {mapResult.identityOnly > 0 && <span style={{ color: t.mid }}> {mapResult.identityOnly} identitas tersimpan tanpa outlet.</span>}
                {mapResult.newOutlets > 0 && <span style={{ color: t.blue }}> {mapResult.newOutlets} outlet baru dibuat.</span>}
                {mapResult.skipped > 0 && <span style={{ color: t.amber }}> {mapResult.skipped} baris dilewati karena error.</span>}
              </div>
            </div>
          )}

          {mapRows && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: t.hi }}>Pratinjau: {mapRows.length} baris mapping</span>
                  <Chip t={t} tone="green" icon={<CheckCircle2 size={12} />}>{mapOkRows.length} valid</Chip>
                  {mapErrorCount > 0 && <Chip t={t} tone="red" icon={<AlertTriangle size={12} />}>{mapErrorCount} error</Chip>}
                  <Chip t={t} tone="blue" icon={<Users size={12} />}>{mapUniqPromotors} promotor</Chip>
                  {mapNewOutlets.length > 0 && <Chip t={t} tone="blue" icon={<Store size={12} />}>{mapNewOutlets.length} outlet baru</Chip>}
                  {mapIncompleteCount > 0 && <Chip t={t} tone="amber" icon={<AlertTriangle size={12} />}>{mapIncompleteCount} ID belum lengkap — tetap disimpan</Chip>}
                </div>
                <div style={{ display: "flex", gap: 9 }}>
                  <button className="pts-btn" onClick={resetMapParse} style={{ background: t.card, color: t.mid, border: `1px solid ${t.line}` }}><X size={14} /> Batal</button>
                  <button className="pts-btn" onClick={saveMap} disabled={mapBusy || mapOkRows.length === 0}
                    style={{ background: t.brand, color: "#fff", boxShadow: t.sm }}>
                    {mapBusy ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />} Simpan Mapping {ymLabel(period).split(" ")[0]}
                  </button>
                </div>
              </div>

              <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, overflow: "hidden", boxShadow: t.sm }}>
                <div style={{ maxHeight: 380, overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Baris", "Slot", "Email Promotor", "ID (IM3)", "ID (3ID)", "Region", "Branch", "MC", "Nama Outlet", "Kategori", "ID Outlet (IM3)", "ID Outlet (3ID)", "Status"].map((h) => <th key={h} className="pts-th">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {mapRows.slice(0, 300).map((r, i) => {
                        const bad = r.errors.length > 0;
                        return (
                          <tr key={i} className="pts-row" style={{ background: bad ? t.redBg : "transparent" }}>
                            <td className="pts-td" style={{ color: t.mid }}>{r.rowNo}</td>
                            <td className="pts-td" style={{ color: t.mid }}>{r.slot || "—"}</td>
                            <td className="pts-td">{r.email || "—"}</td>
                            <td className="pts-td" style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>{r.promotor_id || "—"}</td>
                            <td className="pts-td" style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>{r.user_id_3id || "—"}</td>
                            <td className="pts-td">{r.region || "—"}</td>
                            <td className="pts-td">{r.branch || "—"}</td>
                            <td className="pts-td">{r.mc || "—"}</td>
                            <td className="pts-td" style={{ fontWeight: 600 }}>{r.outlet_name || "—"}</td>
                            <td className="pts-td">{r.category || "—"}</td>
                            <td className="pts-td" style={{ fontFamily: "monospace", fontSize: 12 }}>{r.outlet_im3 || "—"}</td>
                            <td className="pts-td" style={{ fontFamily: "monospace", fontSize: 12 }}>{r.outlet_3id || "—"}</td>
                            <td className="pts-td">
                              {bad
                                ? <span title={r.errors.join("; ")} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: t.red, fontWeight: 600, fontSize: 12 }}><AlertTriangle size={12} /> {r.errors[0]}</span>
                                : r.idIncomplete
                                  ? <span title="Nama outlet sudah tercatat, ID IM3/3ID belum diisi — tetap disimpan sebagai alokasi, lengkapi ID-nya lain kali" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: t.amber, fontWeight: 600, fontSize: 12 }}><AlertTriangle size={12} /> ID belum lengkap</span>
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
                {mapRows.length > 300 && <div style={{ padding: "9px 14px", fontSize: 12, color: t.mid, borderTop: `1px solid ${t.lineSoft}` }}>Menampilkan 300 dari {mapRows.length} baris.</div>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Panel: Tambah/Ubah Promotor (identitas) ──────────────────── */}
      {editing && (
        <div style={{ marginBottom: 18, padding: 18, borderRadius: 14, background: t.card, border: `1px solid ${t.line}`, boxShadow: t.md }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.hi, marginBottom: 14 }}>{form.id ? "Ubah Data Promotor" : "Tambah Promotor Baru"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <Field t={t} label="ID Promotor *"><input className="pts-in" value={form.promotor_id} onChange={(e) => setForm({ ...form, promotor_id: e.target.value })} placeholder="PRO-0001" disabled={idLocked} /></Field>
            <Field t={t} label="Nama Promotor *"><input className="pts-in" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Nama lengkap" /></Field>
            <Field t={t} label="Email Pribadi"><input className="pts-in" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nama@email.com" /></Field>
            <Field t={t} label="No. HP"><input className="pts-in" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="08xx" /></Field>
            <Field t={t} label="Region">
              <select className="pts-in pts-select" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} disabled={!!picRegion}>
                <option value="">— pilih region —</option>
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field t={t} label="Tanggal Efektif Bekerja"><input className="pts-in" type="date" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} /></Field>
            <Field t={t} label={`Target Penjualan (SP/bulan)${profile?.role !== "spm_sumatera" ? " — hanya SPM Sumatera" : ""}`}>
              <input className="pts-in" type="number" min={1} value={form.sales_target}
                disabled={profile?.role !== "spm_sumatera"}
                onChange={(e) => setForm({ ...form, sales_target: e.target.value })} />
            </Field>
          </div>
          {err && <div style={{ marginTop: 12, fontSize: 12.5, color: t.red, display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={13} />{err}</div>}
          <div style={{ display: "flex", gap: 9, marginTop: 16, justifyContent: "flex-end" }}>
            <button className="pts-btn" onClick={cancel} style={{ background: t.sub, color: t.mid, border: `1px solid ${t.line}` }}><X size={14} /> Batal</button>
            <button className="pts-btn" onClick={saveForm} disabled={busy} style={{ background: t.brand, color: "#fff", boxShadow: t.sm }}>{busy ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Simpan</button>
          </div>
        </div>
      )}

      {err && !editing && (
        <div style={{ marginBottom: 16, display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: t.redBg, border: `1px solid ${t.redBd}` }}>
          <AlertTriangle size={16} color={t.red} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 13, color: t.hi }}>{err}</span>
        </div>
      )}

      {/* ── Tabel gabungan — struktur kolomnya persis mengikuti template
          Excel Mapping: Email · ID (IM3) · ID (3ID) · Region · Branch · MC ·
          Outlet 1..4 (nama + kategori + ID IM3 + ID 3ID di tiap sel) —
          plus kolom status di ujung untuk mengganti "check-mark"
          spreadsheet dengan info live. */}
      <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, overflow: "hidden", boxShadow: t.sm }}>
        <div style={{ overflow: "auto", maxHeight: 620 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 2100 }}>
            <thead>
              <tr>
                <th className="pts-th pts-th-sticky" style={{ minWidth: profile?.role === "spm_sumatera" ? 136 : 104 }}>Aksi</th>
                <th className="pts-th">Nama Promotor</th>
                <th className="pts-th">Email Promotor</th>
                <th className="pts-th">Efektif</th>
                <th className="pts-th">ID Promotor (IM3)</th>
                <th className="pts-th">ID Promotor (3ID)</th>
                {FCOLS.map(([k, label]) => <FilterTh key={k} t={t} label={label} colKey={k} filters={filters} className="pts-th" onOpen={(ck, r) => { setRect(r); setOpenCol(ck); }} />)}
                {[1, 2, 3, 4].map((n) => <th key={n} className="pts-th" style={{ minWidth: 220 }}>Outlet {n} (Nama · Kategori · ID IM3 · ID 3ID)</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="pts-td" colSpan={10 + FCOLS.length} style={{ textAlign: "center", padding: 40, color: t.mid }}><Loader2 size={20} className="spin" style={{ verticalAlign: "middle" }} /> Memuat…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td className="pts-td" colSpan={10 + FCOLS.length} style={{ textAlign: "center", padding: 44, color: t.mid }}><Users size={24} style={{ opacity: .5, marginBottom: 8 }} /><br />Tidak ada Promotor yang sesuai filter.</td></tr>
              ) : filtered.map((r) => {
                const si = promotorStatusInfo(r);
                return (
                  <tr key={r.id} className="pts-row">
                    <td className="pts-td pts-td-sticky">
                      <div style={{ display: "flex", gap: 6 }}>
                        {/* Khusus SPM Sumatera: buka app promotor PERSIS seperti yang
                            dilihat promotor tsb saat login (data live, read-only) —
                            tanpa perlu tahu akun/password-nya. */}
                        {profile?.role === "spm_sumatera" && (
                          <button onClick={() => window.open(`/promotor?admin_preview=${r.id}`, "_blank", "noopener")} title="Lihat sebagai Promotor ini (read-only)"
                            style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${t.blueBd}`, background: t.blueBg, color: t.blue, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Eye size={13} />
                          </button>
                        )}
                        {canManagePromotor(r) && (
                          <button onClick={() => setEditingMapping(r)} title="Edit Data — data diri & mapping outlet"
                            style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${t.brandBd}`, background: t.brandBg, color: t.brand, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Pencil size={13} />
                          </button>
                        )}
                        {canManageVacancy(r) && (
                          <button onClick={() => toggleVacant(r)} disabled={vacantBusy === r.id} title={r.vacant ? "Aktifkan kembali" : "Tandai Vacant"}
                            style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${r.vacant ? t.amberBd : t.line}`, background: r.vacant ? t.amberBg : t.card, color: r.vacant ? t.amber : t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {vacantBusy === r.id ? <Loader2 size={13} className="spin" /> : r.vacant ? <UserCheck size={13} /> : <Ban size={13} />}
                          </button>
                        )}
                        {canManagePromotor(r) && (
                          <button onClick={() => { setDeletingPromotor(r); setDeleteErr(""); }} title="Hapus Data — hapus promotor ini"
                            style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${t.redBd}`, background: t.redBg, color: t.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="pts-td" style={{ fontWeight: 700, color: r.full_name ? t.hi : t.lo, fontStyle: r.full_name ? "normal" : "italic" }}>{r.full_name || "belum diisi"}</td>
                    <td className="pts-td" style={{ color: r.email ? t.hi : t.lo, fontStyle: r.email ? "normal" : "italic" }}>{r.email || "belum diisi"}</td>
                    <td className="pts-td">{r.effective_date ? fmtDate(r.effective_date) : <span style={{ color: t.lo }}>—</span>}</td>
                    <td className="pts-td" style={{ fontFamily: "monospace", fontWeight: 700 }}>{r.promotor_id || <span style={{ color: t.lo }}>—</span>}</td>
                    <td className="pts-td" style={{ fontFamily: "monospace", fontWeight: 700 }}>{r.user_id_3id || <span style={{ color: t.lo }}>—</span>}</td>
                    {!roleLockedRegion && <td className="pts-td">{r.region || <span style={{ color: t.lo }}>—</span>}</td>}
                    <td className="pts-td">{r.branch || <span style={{ color: t.lo }}>—</span>}</td>
                    {!roleLockedMc && <td className="pts-td">{r.mc || <span style={{ color: t.lo }}>—</span>}</td>}
                    <td className="pts-td">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: si.bg, color: si.fg, border: `1px solid ${si.bd}` }}>{si.icon} {si.label}</span>
                    </td>
                    <td className="pts-td">
                      {r.statusMap === "Belum ter-mapping"
                        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: t.blueBg, color: t.blue, border: `1px solid ${t.blueBd}` }}><Store size={11} /> Belum ter-mapping</span>
                        : <span style={{ fontSize: 11.5, fontWeight: 600, color: t.hi }}>{r.outlets.length} outlet</span>}
                    </td>
                    <td className="pts-td">
                      {r.statusLogin === "Sudah login"
                        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 99, fontSize: 10.5, fontWeight: 700, background: t.greenBg, color: t.green, border: `1px solid ${t.greenBd}` }}><UserCheck size={10} /> Aktif</span>
                        : <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 99, fontSize: 10.5, fontWeight: 700, background: t.amberBg, color: t.amber, border: `1px solid ${t.amberBd}` }}><UserX size={10} /> Belum</span>}
                    </td>
                    {[0, 1, 2, 3].map((i) => {
                      const o = r.outlets[i];
                      return (
                        <td key={i} className="pts-td" style={{ verticalAlign: "top", padding: "8px 12px" }}>
                          {o ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              <div style={{ fontWeight: 700, fontSize: 12.5, color: t.hi }}>
                                {o.name || "—"}
                                {o.idPending && <span title="ID outlet belum lengkap" style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: t.amber }}>ID belum lengkap</span>}
                              </div>
                              <div style={{ fontSize: 11, color: t.mid }}>{o.category || "—"}</div>
                              <div style={{ fontFamily: "monospace", fontSize: 11, color: "#ED1C24" }}>IM3 {o.im3 || "—"}</div>
                              <div style={{ fontFamily: "monospace", fontSize: 11, color: "#2563EB" }}>3ID {o.tid || "—"}</div>
                            </div>
                          ) : (
                            <span style={{ color: t.lo, fontSize: 12 }}>—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: t.mid }}>{filtered.length} dari {scopedTotal} Promotor{anyFilterActive ? " (sesuai filter aktif)" : ""}.</div>

      {openCol && (
        <FilterMenu t={t} rect={rect} label={(FCOLS.find(([k]) => k === openCol) || [, openCol])[1]}
          options={optionsFor(searched, filters, FCOLS, openCol)} selected={filters[openCol] || []}
          onChange={(arr) => setFilters((p) => ({ ...p, [openCol]: arr }))} onClose={() => { setOpenCol(""); setRect(null); }} />
      )}

      {editingMapping && (
        <MappingEditModal t={t} supabase={supabase} profile={profile} period={period} row={editingMapping} outletByCode={outletByCode} picRegion={picRegion}
          onClose={() => setEditingMapping(null)}
          onSaved={async () => { setEditingMapping(null); await onOutletsNeeded(); await load(); }} />
      )}

      {deletingPromotor && (
        <DeletePromotorModal t={t} row={deletingPromotor} busy={deleteBusy} err={deleteErr}
          onClose={() => { if (!deleteBusy) { setDeletingPromotor(null); setDeleteErr(""); } }}
          onConfirm={() => deletePromotor(deletingPromotor)} />
      )}

      <style>{`.spin{animation:ptsspin 1s linear infinite}@keyframes ptsspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ══════════════════════ KELOLA MAPPING (modal, per promotor) ═══════════
   "Sangat mudah diedit langsung dari UI": Branch/MC + 4 slot outlet
   (Nama/Kategori/ID IM3/ID 3ID) untuk 1 promotor, semua kolom bisa
   diganti-ganti bebas tanpa perlu bolak-balik Excel. Aturan resolusi ID
   outlet & kode placeholder PERSIS sama dengan upload massal (saveMap):
   IM3 diutamakan → 3ID → kode sementara PENDING-xxx bila cuma nama yang
   terisi. Hanya menghapus/mengganti assignment MILIK promotor ini saja
   untuk periode berjalan — promotor lain tidak tersentuh. ──────────────── */
function MappingEditModal({ t, supabase, profile, period, row, outletByCode, picRegion, onClose, onSaved }) {
  // Data diri — digabung ke modal yang sama dgn mapping outlet supaya admin
  // tidak perlu buka 2 tombol terpisah utk 1 promotor. ID Promotor/3ID
  // sengaja tetap read-only (kunci identitas, hanya bisa ditautkan lewat
  // alur "Promotor Baru" / Import Roster ID).
  const [fullName, setFullName] = useState(row.full_name || "");
  const [email, setEmail] = useState(row.email || "");
  const [phone, setPhone] = useState(row.phone || "");
  const [region, setRegion] = useState(row.region || "");
  const [effectiveDate, setEffectiveDate] = useState(row.effective_date || "");
  const [salesTarget, setSalesTarget] = useState(row.sales_target || 150);
  const [status, setStatus] = useState(row.status || "active");

  const [branch, setBranch] = useState(row.branch || "");
  const [mc, setMc] = useState(row.mc || "");
  const [slots, setSlots] = useState(() => Array.from({ length: OUTLET_SLOTS }, (_, i) => {
    const o = row.outlets[i];
    if (!o) return { name: "", category: "", im3: "", tid: "" };
    // Kode placeholder (PENDING-...) bukan ID asli — jangan ditampilkan
    // seolah-olah sudah ada ID resmi.
    return { name: o.name || "", category: o.category || "", im3: o.idPending ? "" : (o.im3 || ""), tid: o.tid || "" };
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const setSlot = (i, patch) => setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const clearSlot = (i) => setSlot(i, { name: "", category: "", im3: "", tid: "" });

  const filledCount = slots.filter((s) => s.name || s.im3 || s.tid || s.category).length;

  const save = async () => {
    setErr("");
    if (!fullName.trim()) { setErr("Nama Promotor wajib diisi."); return; }
    if (email && !emailValid(email)) { setErr("Email Pribadi tidak valid."); return; }
    if (!(Number(salesTarget) > 0)) { setErr("Target Penjualan harus lebih dari 0."); return; }
    setSaving(true);
    try {
      // 0) Simpan data diri promotor dulu
      const identityPayload = {
        full_name: fullName.trim(), email: email.trim().toLowerCase() || null, phone: phone.trim() || null,
        region: region || null, effective_date: effectiveDate || null, status, sales_target: Number(salesTarget),
      };
      const { error: idErr } = await supabase.from("pts_promotor").update(identityPayload).eq("id", row.id);
      if (idErr) throw idErr;

      const promotorKey = (row.promotor_id || row.user_id_3id || email || "X").toUpperCase();
      const resolved = slots
        .map((s, i) => ({ ...s, n: i + 1 }))
        .filter((s) => s.name || s.im3 || s.tid || s.category)
        .map((s) => {
          const hasId = !!(s.im3 || s.tid);
          const outlet_code = s.im3 || s.tid || `PENDING-${promotorKey}-${s.n}`;
          const outlet_code_3id = s.im3 && s.tid ? s.tid : null;
          const existing = hasId ? outletByCode.get(outlet_code.toUpperCase()) : null;
          return {
            outlet_code, outlet_code_3id,
            outlet_name: s.name || existing?.name || outlet_code,
            category: s.category || existing?.category || "",
            idIncomplete: !hasId,
          };
        });

      // 1) Upsert outlet per slot terisi
      if (resolved.length) {
        const outletPayload = resolved.map((r) => ({
          code: r.outlet_code, code_3id: r.outlet_code_3id || null,
          name: r.outlet_name, category: r.category || null,
          branch: branch.trim() || null, region: region || null, status: "active",
          id_pending: r.idIncomplete,
        }));
        const { error } = await supabase.from("pts_outlet").upsert(outletPayload, { onConflict: "code" });
        if (error) throw error;
      }

      // 2) Refresh master → resolve outlet_id
      const { data: freshOutlets } = await supabase.from("pts_outlet").select("id,code");
      const idByCode = new Map((freshOutlets || []).map((o) => [String(o.code).trim().toUpperCase(), o.id]));

      // 3) Replace assignment milik promotor INI SAJA utk periode berjalan
      const { error: delErr } = await supabase.from("pts_assignment").delete().eq("period", period).eq("promotor_id_ref", row.id);
      if (delErr) throw delErr;

      if (resolved.length) {
        const payload = resolved.map((r) => ({
          period, email: email.trim().toLowerCase() || null, full_name: fullName.trim() || null,
          promotor_id_ref: row.id, mc: mc.trim() || null,
          outlet_id: idByCode.get(r.outlet_code.toUpperCase()) || null,
          outlet_code: r.outlet_code, branch: branch.trim() || null, region: region || null,
          status: "active", assigned_by: profile?.id || null,
        }));
        const { error: insErr } = await supabase.from("pts_assignment").insert(payload);
        if (insErr) throw insErr;
      }

      await onSaved();
    } catch (e) {
      setErr("Gagal menyimpan: " + (e?.message || e));
      setSaving(false);
    }
  };

  const inp = { fontFamily: "inherit", fontSize: 13, color: t.hi, background: t.inputBg, border: `1px solid ${t.line}`, borderRadius: 8, padding: "8px 10px", outline: "none", width: "100%", boxSizing: "border-box" };
  const lbl = { display: "block", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: t.lo, marginBottom: 5 };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 760, maxHeight: "90vh", overflowY: "auto", background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, boxShadow: t.md }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 20px", borderBottom: `1px solid ${t.line}`, position: "sticky", top: 0, background: t.card, borderRadius: "16px 16px 0 0", zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: t.hi }}>Edit Data — {row.full_name || row.promotor_id || "Promotor"}</div>
            <div style={{ fontSize: 12, color: t.mid, marginTop: 2 }}>
              ID (IM3) <b style={{ color: t.hi, fontFamily: "monospace" }}>{row.promotor_id || "—"}</b>
              {" · "}ID (3ID) <b style={{ color: t.hi, fontFamily: "monospace" }}>{row.user_id_3id || "—"}</b>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "transparent", color: t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={18} /></button>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: t.mid, marginBottom: 8 }}>Data Promotor</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
            <div><label style={lbl}>Nama Promotor *</label><input style={inp} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nama lengkap" /></div>
            <div><label style={lbl}>Email Pribadi</label><input style={inp} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" /></div>
            <div><label style={lbl}>No. HP</label><input style={inp} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xx" /></div>
            <div>
              <label style={lbl}>Region</label>
              <select style={inp} value={region} onChange={(e) => setRegion(e.target.value)} disabled={!!picRegion}>
                <option value="">— pilih region —</option>
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Tanggal Efektif Bekerja</label><input style={inp} type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></div>
            <div><label style={lbl}>Target Penjualan</label><input style={inp} type="number" min={1} value={salesTarget} onChange={(e) => setSalesTarget(e.target.value)} /></div>
            <div>
              <label style={lbl}>Status</label>
              <select style={inp} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="active">Aktif</option><option value="inactive">Nonaktif</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, padding: "11px 14px", borderRadius: 10, background: t.brandBg, border: `1px solid ${t.brandBd}`, marginBottom: 18 }}>
            <Info size={15} color={t.brand} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12.5, color: t.hi }}>Ubah Branch/MC dan sampai 4 outlet langsung di sini — tidak perlu Excel. Kalau ID Outlet (IM3/3ID) belum ada, isi Nama Outlet saja; sistem otomatis pakai kode sementara sampai ID resminya dilengkapi.</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
            <div><label style={lbl}>Branch</label><input style={inp} value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="mis. Bandar Lampung" /></div>
            <div><label style={lbl}>MC</label><input style={inp} value={mc} onChange={(e) => setMc(e.target.value)} placeholder="mis. MC-Lampung Selatan" /></div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: t.mid, marginBottom: 8 }}>
            Outlet ({filledCount}/{OUTLET_SLOTS} terisi)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {slots.map((s, i) => {
              const active = !!(s.name || s.im3 || s.tid || s.category);
              return (
                <div key={i} style={{ border: `1px solid ${active ? t.brandBd : t.line}`, background: active ? t.brandBg : t.sub, borderRadius: 12, padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: t.hi, display: "inline-flex", alignItems: "center", gap: 6 }}><Store size={13} color={active ? t.brand : t.lo} /> Outlet {i + 1}</span>
                    {active && <button onClick={() => clearSlot(i)} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: t.mid, background: "transparent", border: "none", cursor: "pointer" }}><Trash2 size={12} /> Kosongkan</button>}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 8 }}>
                    <div><label style={lbl}>Nama Outlet</label><input style={inp} value={s.name} onChange={(e) => setSlot(i, { name: e.target.value })} placeholder="Nama outlet" /></div>
                    <div><label style={lbl}>Kategori</label><input style={inp} value={s.category} onChange={(e) => setSlot(i, { category: e.target.value })} placeholder="REGULAR/KRO/KAM" /></div>
                    <div><label style={lbl}>ID Outlet (IM3)</label><input style={{ ...inp, fontFamily: "monospace" }} value={s.im3} onChange={(e) => setSlot(i, { im3: e.target.value })} placeholder="—" /></div>
                    <div><label style={lbl}>ID Outlet (3ID)</label><input style={{ ...inp, fontFamily: "monospace" }} value={s.tid} onChange={(e) => setSlot(i, { tid: e.target.value })} placeholder="—" /></div>
                  </div>
                </div>
              );
            })}
          </div>

          {err && <div style={{ marginTop: 16, display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: t.redBg, border: `1px solid ${t.redBd}` }}><AlertTriangle size={16} color={t.red} style={{ flexShrink: 0, marginTop: 1 }} /><span style={{ fontSize: 13, color: t.hi }}>{err}</span></div>}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, padding: "14px 20px", borderTop: `1px solid ${t.line}`, position: "sticky", bottom: 0, background: t.card, borderRadius: "0 0 16px 16px" }}>
          <button onClick={onClose} className="pts-btn" style={{ background: t.sub, color: t.mid, border: `1px solid ${t.line}` }}>Batal</button>
          <button onClick={save} disabled={saving} className="pts-btn" style={{ background: t.brand, color: "#fff", boxShadow: t.sm }}>
            {saving ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />} Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════ HAPUS PROMOTOR (konfirmasi ketik "HAPUS") ═══════
   Aksi permanen: hapus semua mapping outlet promotor ini (lintas periode)
   lalu identitasnya. Riwayat penjualan (pts_sale) TETAP ada, hanya tautan
   promotor_id-nya lepas (ON DELETE SET NULL) — bukan ikut terhapus. */
function DeletePromotorModal({ t, row, busy, err, onClose, onConfirm }) {
  const [ack, setAck] = useState("");
  const ready = ack.trim().toUpperCase() === "HAPUS";
  const mappingCount = row.outlets?.length || 0;

  return (
    <div onClick={busy ? undefined : onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, boxShadow: t.md }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 20px 0" }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: t.redBg, color: t.red, border: `1px solid ${t.redBd}` }}>
            <Trash2 size={19} />
          </div>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: t.hi }}>Hapus Promotor</div>
            <div style={{ fontSize: 12.5, color: t.mid, marginTop: 1 }}>Tindakan ini permanen dan tidak bisa dibatalkan.</div>
          </div>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ padding: "12px 14px", borderRadius: 10, background: t.sub, border: `1px solid ${t.line}`, marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.hi }}>{row.full_name || "(nama belum diisi)"}</div>
            <div style={{ fontSize: 12, color: t.mid, marginTop: 2, fontFamily: "monospace" }}>{row.promotor_id || "—"}{row.user_id_3id ? ` · ${row.user_id_3id}` : ""}</div>
          </div>

          <div style={{ display: "flex", gap: 10, padding: "11px 14px", borderRadius: 10, background: t.amberBg, border: `1px solid ${t.amberBd}`, marginBottom: 16 }}>
            <AlertTriangle size={16} color={t.amber} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12.5, color: t.hi, lineHeight: 1.55 }}>
              Menghapus juga menghapus <b>semua mapping outlet</b> promotor ini di setiap periode{mappingCount > 0 ? ` (saat ini terlihat ${mappingCount} outlet di bulan aktif)` : ""}.
              Riwayat penjualan yang sudah tercatat tetap tersimpan, tapi tautannya ke promotor ini akan lepas.
            </span>
          </div>

          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: t.mid, marginBottom: 6 }}>
            Ketik <b style={{ color: t.red, fontFamily: "monospace" }}>HAPUS</b> untuk konfirmasi
          </label>
          <input className="pts-in" value={ack} onChange={(e) => setAck(e.target.value)} placeholder="HAPUS" autoFocus
            style={{ width: "100%", boxSizing: "border-box", fontFamily: "monospace", letterSpacing: "0.05em" }} />

          {err && <div style={{ marginTop: 12, display: "flex", gap: 8, fontSize: 12.5, color: t.red }}><AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />{err}</div>}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, padding: "14px 20px", borderTop: `1px solid ${t.line}` }}>
          <button onClick={onClose} disabled={busy} className="pts-btn" style={{ background: t.sub, color: t.mid, border: `1px solid ${t.line}` }}>Batal</button>
          <button onClick={onConfirm} disabled={!ready || busy} className="pts-btn" style={{ background: ready ? t.red : t.line, color: ready ? "#fff" : t.lo, boxShadow: ready ? t.sm : "none" }}>
            {busy ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />} Hapus Permanen
          </button>
        </div>
      </div>
    </div>
  );
}

// Kartu ringkasan mini untuk header Promotor & Outlet — dipisah supaya
// tidak menabrak Stat besar yang dipakai di Ringkasan Aktivitas.
function StatMini({ t, label, value, tone }) {
  const tones = {
    green:   { fg: t.green, bg: t.greenBg, bd: t.greenBd },
    amber:   { fg: t.amber, bg: t.amberBg, bd: t.amberBd },
    blue:    { fg: t.blue,  bg: t.blueBg,  bd: t.blueBd  },
    neutral: { fg: t.hi,    bg: t.sub,     bd: t.line    },
  };
  const c = tones[tone] || tones.neutral;
  return (
    <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 10, padding: "10px 12px", boxShadow: t.sm }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: t.mid, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", color: c.fg }}>{value}</span>
        <span style={{ height: 6, width: 6, borderRadius: 99, background: c.fg, opacity: .7 }} />
      </div>
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
/* ══════════════ RINGKASAN AKTIVITAS ══════════════
   Catatan: sistem Check-In/Check-Out (pts_session) sudah dihapus total dari
   modul ini — digantikan alur geofencing langsung pada saat Claim Penjualan
   (tagging). Tab ini murni: siapa yang sudah dipetakan bulan ini, siapa yang
   belum pernah login (auth_user_id kosong), dan berapa SP yang sudah
   diklaim per brand (IM3/3ID). Detail per nomor MSISDN ada di sub-tampilan
   "Detail per Nomor". */
function StatusDonut({ t, agg, size = 148 }) {
  const segs = [
    { key: "validated", label: "Tervalidasi", value: agg.validated, color: t.green },
    { key: "pending", label: "Belum Tervalidasi", value: agg.pending, color: t.amber },
    { key: "rejected", label: "Outlet Tidak Sesuai", value: agg.rejected, color: t.blue },
    { key: "notfound", label: "Tidak Ditemukan", value: agg.notfound, color: t.red },
  ];
  const total = segs.reduce((a, s) => a + s.value, 0);
  let acc = 0;
  const stops = total
    ? segs.map((s) => {
        const from = (acc / total) * 360;
        acc += s.value;
        const to = (acc / total) * 360;
        return { ...s, from, to };
      })
    : [];
  const gradient = total
    ? `conic-gradient(${stops.map((s) => `${s.color} ${s.from}deg ${s.to}deg`).join(", ")})`
    : `conic-gradient(${t.line} 0deg 360deg)`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <div style={{ width: size, height: size, borderRadius: "50%", background: gradient }} />
        <div style={{ position: "absolute", inset: size * 0.17, borderRadius: "50%", background: t.card, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: t.hi }}>{total}</div>
          <div style={{ fontSize: 10, color: t.mid, fontWeight: 600 }}>Total Klaim</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 170 }}>
        {segs.map((s) => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ color: t.mid, flex: 1 }}>{s.label}</span>
            <span style={{ fontWeight: 700, color: t.hi }}>{s.value}</span>
            <span style={{ color: t.mid, fontSize: 11, width: 38, textAlign: "right" }}>{total ? Math.round((s.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AchievementBarList({ t, title, icon, items }) {
  return (
    <div style={{ border: `1px solid ${t.line}`, borderRadius: 14, padding: 16, background: t.card, boxShadow: t.sm, flex: 1, minWidth: 260 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: t.mid, marginBottom: 12, textTransform: "uppercase", letterSpacing: ".03em" }}>
        {icon} {title}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12.5, color: t.mid, padding: "10px 0" }}>Belum ada data.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {items.map((it, i) => {
            const barColor = it.pct >= 100 ? t.green : it.pct >= 60 ? t.blue : it.pct >= 30 ? t.amber : t.red;
            return (
              <div key={it.name + i}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                    {i === 0 && it.pct > 0 && <Trophy size={11} style={{ marginRight: 4, verticalAlign: -1 }} color="#D4A017" />}
                    {it.name}
                  </span>
                  <span style={{ fontSize: 11.5, color: t.mid }}>
                    <b style={{ color: t.green, fontSize: 12.5 }}>{it.bio}</b> / {it.target} <span style={{ color: t.mid }}>({it.pct}%)</span>
                  </span>
                </div>
                <div style={{ height: 7, borderRadius: 99, background: t.hover, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, it.pct)}%`, borderRadius: 99, background: barColor, transition: "width .3s" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RankBadge({ rank }) {
  if (rank === 1) return <Trophy size={16} color="#D4A017" fill="#F6CB43" />;
  if (rank === 2) return <Medal size={16} color="#8C8C8C" fill="#C9C9C9" />;
  if (rank === 3) return <Award size={16} color="#8A5A2B" fill="#C68642" />;
  return null;
}

function PromotorDetailModal({ t, row, outletById, onClose }) {
  if (!row) return null;
  const outlets = [...row.byOutlet.entries()].map(([oid, v]) => ({ ...v, outlet: outletById.get(oid) }));
  const summaryChips = [
    { label: "Total Pengajuan", value: row.total, tone: "blue" },
    { label: "Dalam Pengajuan", value: row.pending, tone: "amber" },
    { label: "Total Tervalidasi", value: row.bio + row.reg, tone: "green" },
    { label: `GA SP Biometric (${Math.round((row.bio / PROMOTOR_BIO_TARGET) * 100)}% dari target ${PROMOTOR_BIO_TARGET})`, value: row.bio, tone: "green" },
    { label: "GA SP Non-Biometric", value: row.reg, tone: "blue" },
    { label: "GA di luar Outlet", value: row.rejected + row.notfound, tone: "amber" },
  ];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: t.card, borderRadius: 16, maxWidth: 640, width: "100%", maxHeight: "86vh", overflow: "auto", boxShadow: t.lg || "0 10px 40px rgba(0,0,0,.25)" }}>
        <div style={{ padding: "18px 20px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: t.card, zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: t.hi, display: "flex", alignItems: "center", gap: 7 }}>
              {row.rank <= 3 && <RankBadge rank={row.rank} />} {row.nama}
              {row.rank ? <span style={{ fontSize: 11.5, fontWeight: 700, color: t.mid }}>· Peringkat #{row.rank}</span> : null}
            </div>
            <div style={{ fontSize: 12.5, color: t.mid, marginTop: 2 }}>{row.email}</div>
          </div>
          <button onClick={onClose} className="pts-btn" style={{ background: t.hover, color: t.mid, padding: "6px 8px" }}><X size={15} /></button>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: t.mid, marginBottom: 10, textTransform: "uppercase", letterSpacing: ".03em" }}>Ringkasan Status</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
            {summaryChips.map((c) => (
              <Chip key={c.label} t={t} tone={c.tone}>{c.label}: {c.value}</Chip>
            ))}
          </div>

          <div style={{ fontSize: 12.5, fontWeight: 700, color: t.mid, marginBottom: 10, textTransform: "uppercase", letterSpacing: ".03em" }}>Detail per Outlet</div>
          <div style={{ border: `1px solid ${t.line}`, borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Outlet", "Total Pengajuan", "GA SP Biometric", "GA SP Non-Biometric", "Dalam Pengajuan", "GA di luar Outlet"].map((h) => (
                    <th key={h} className="pts-th" style={{ fontSize: 10.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {outlets.length === 0 ? (
                  <tr><td className="pts-td" colSpan={6} style={{ textAlign: "center", padding: 24, color: t.mid }}>Tidak ada klaim per outlet.</td></tr>
                ) : outlets.map((o, i) => (
                  <tr key={i} className="pts-row">
                    <td className="pts-td" style={{ fontWeight: 600 }}>{o.outlet?.name || o.outlet?.code_3id || "Outlet tidak dikenal"}</td>
                    <td className="pts-td" style={{ fontWeight: 700 }}>{o.total}</td>
                    <td className="pts-td" style={{ background: t.greenBg, color: t.green, fontWeight: 800 }}>{o.bio || "—"}</td>
                    <td className="pts-td" style={{ color: t.blue }}>{o.reg || "—"}</td>
                    <td className="pts-td" style={{ color: t.amber }}>{o.pending || "—"}</td>
                    <td className="pts-td" style={{ color: t.mid }}>{(o.rejected + o.notfound) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function LeaderboardPanel({ t, period, rows, onSelectRow }) {
  const [regionF, setRegionF] = useState("all");
  const [branchF, setBranchF] = useState("all");

  const regionOptions = useMemo(() => [...new Set(rows.map((r) => r.region).filter(Boolean))].sort(), [rows]);
  const branchOptions = useMemo(
    () => [...new Set(rows.filter((r) => regionF === "all" || r.region === regionF).map((r) => r.branch).filter(Boolean))].sort(),
    [rows, regionF]
  );
  // Kalau ganti region dan branch yang sedang dipilih jadi tidak relevan lagi, reset ke "Semua Branch".
  useEffect(() => {
    if (branchF !== "all" && !branchOptions.includes(branchF)) setBranchF("all");
  }, [branchOptions, branchF]);

  const scoped = useMemo(
    () => rows.filter((r) => (regionF === "all" || r.region === regionF) && (branchF === "all" || r.branch === branchF)),
    [rows, regionF, branchF]
  );

  const ranked = useMemo(() => {
    const sorted = [...scoped].sort((a, b) => (b.bio - a.bio) || ((b.bio + b.reg) - (a.bio + a.reg)) || (b.total - a.total) || a.nama.localeCompare(b.nama));
    return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [scoped]);

  const topThree = useMemo(() => ranked.filter((r) => r.rank <= 3 && (r.bio > 0 || r.reg > 0 || r.total > 0)), [ranked]);

  const statusAgg = useMemo(() => ranked.reduce((a, r) => {
    a.validated += r.bio + r.reg; a.pending += r.pending; a.rejected += r.rejected; a.notfound += r.notfound;
    return a;
  }, { validated: 0, pending: 0, rejected: 0, notfound: 0 }), [ranked]);

  const buildLevelAgg = (keyFn) => {
    const m = new Map();
    ranked.forEach((r) => {
      const key = keyFn(r) || "Tidak diketahui";
      if (!m.has(key)) m.set(key, { bio: 0, promotor: 0 });
      const g = m.get(key);
      g.bio += r.bio;
      g.promotor += 1;
    });
    return [...m.entries()]
      .map(([name, g]) => {
        const target = g.promotor * PROMOTOR_BIO_TARGET;
        return { name, bio: g.bio, target, pct: target ? Math.round((g.bio / target) * 100) : 0 };
      })
      .sort((a, b) => b.pct - a.pct || b.bio - a.bio);
  };
  const regionAgg = useMemo(() => buildLevelAgg((r) => r.region), [ranked]);
  const branchAgg = useMemo(() => buildLevelAgg((r) => r.branch), [ranked]);
  const mcAgg = useMemo(() => buildLevelAgg((r) => r.mc), [ranked]);

  const hasFilter = regionF !== "all" || branchF !== "all";

  return (
    <div>
      {/* Filter khusus tab Leaderboard — tidak memengaruhi tab Ringkasan Promotor. */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: t.mid }}>
          <Filter size={13} /> Filter
        </div>
        <select className="pts-in pts-select" value={regionF} onChange={(e) => setRegionF(e.target.value)} style={{ height: 32 }}>
          <option value="all">Semua Region</option>
          {regionOptions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="pts-in pts-select" value={branchF} onChange={(e) => setBranchF(e.target.value)} style={{ height: 32 }}>
          <option value="all">Semua Branch</option>
          {branchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        {hasFilter && (
          <button className="pts-btn" onClick={() => { setRegionF("all"); setBranchF("all"); }} style={{ background: t.hover, color: t.mid }}>
            <FilterX size={13} /> Reset
          </button>
        )}
      </div>

      {/* Top-3 leaderboard individu + donut distribusi status, ikut filter di atas */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,1.1fr) minmax(260px,1fr)", gap: 14, marginBottom: 20 }}>
        <div style={{ border: `1px solid ${t.line}`, borderRadius: 14, padding: 16, background: t.card, boxShadow: t.sm }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: t.mid, marginBottom: 12, textTransform: "uppercase", letterSpacing: ".03em" }}>
            <Trophy size={14} /> Leaderboard Pencapaian ({ymLabel(period)})
          </div>
          {topThree.length === 0 ? (
            <div style={{ fontSize: 12.5, color: t.mid, padding: "10px 0" }}>Belum ada klaim tervalidasi untuk cakupan filter ini.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {topThree.map((r) => (
                <div key={r.id} onClick={() => onSelectRow(r)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 10, background: t.hover, cursor: "pointer" }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: r.rank === 1 ? "#F6CB4333" : r.rank === 2 ? "#C9C9C933" : "#C6864233", border: `1.5px solid ${r.rank === 1 ? "#D4A017" : r.rank === 2 ? "#8C8C8C" : "#8A5A2B"}` }}>
                    <RankBadge rank={r.rank} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nama}</div>
                    <div style={{ fontSize: 11, color: t.mid }}>{r.outlet}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: t.green }}>{r.bio}</div>
                    <div style={{ fontSize: 10, color: t.mid }}>Biometric</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ border: `1px solid ${t.line}`, borderRadius: 14, padding: 16, background: t.card, boxShadow: t.sm }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: t.mid, marginBottom: 12, textTransform: "uppercase", letterSpacing: ".03em" }}>
            <PieChart size={14} /> Distribusi Status Klaim
          </div>
          <StatusDonut t={t} agg={statusAgg} />
        </div>
      </div>

      {/* Ranking Branch & MC — dipisah dari tabel Ringkasan Promotor supaya tidak numpuk */}
      <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: ".03em" }}>
        <BarChart3 size={14} /> Ranking Pencapaian GA SP Biometric per Level (target {PROMOTOR_BIO_TARGET}/promotor)
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <AchievementBarList t={t} title="Ranking Region" icon={<MapPin size={13} />} items={regionAgg} />
        <AchievementBarList t={t} title="Ranking Branch" icon={<Store size={13} />} items={branchAgg} />
        <AchievementBarList t={t} title="Ranking MC (Micro Cluster)" icon={<Users size={13} />} items={mcAgg} />
      </div>
    </div>
  );
}

function PreviewData({ t, d, supabase, period, outletByCode }) {
  const [mode, setMode] = useState("ringkasan");    // ringkasan | msisdn
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [statusF, setStatusF] = useState("all");    // all | active | not_logged_in
  const [q, setQ] = useState("");
  const [detailRow, setDetailRow] = useState(null);

  // Kunci identitas promotor untuk pengelompokan: promotor_id (uuid, permanen)
  // bila ada, baru jatuh ke email untuk baris lama / belum tertaut ID.
  const idKey = (promotorId, email) => promotorId || `e:${(email || "").toLowerCase()}`;

  const outletById = useMemo(() => {
    const m = new Map();
    outletByCode.forEach((o) => { if (o?.id) m.set(o.id, o); });
    return m;
  }, [outletByCode]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Basis: SEMUA promotor (RLS sudah membatasi per-region utk pic_region/
      // SFM), bukan cuma yang punya assignment bulan ini — supaya promotor
      // yang belum/tidak ter-mapping bulan ini tetap kelihatan (Status
      // Mapping: "Belum ter-mapping"), bukan hilang diam-diam.
      const [asgRes, proRes] = await Promise.all([
        supabase.rpc("pts_effective_assignment", { p_period: period }),
        supabase.from("pts_promotor").select("id,email,full_name,auth_user_id,region,effective_date,vacant"),
      ]);
      const assignments = asgRes.data || [];
      const promotors = proRes.data || [];
      const proById = new Map(promotors.map((p) => [p.id, p]));

      const outletsByKey = new Map();  // key → Set(outlet_code)
      const metaByKey = new Map();     // key → {branch, mc, region, email, full_name}
      assignments.forEach((a) => {
        const k = idKey(a.promotor_id_ref, a.email);
        if (!outletsByKey.has(k)) outletsByKey.set(k, new Set());
        outletsByKey.get(k).add(a.outlet_code);
        if (!metaByKey.has(k)) metaByKey.set(k, { branch: a.branch, mc: a.mc, region: a.region, email: a.email, full_name: a.full_name });
      });

      // Klaim SP periode ini — pakai credited_period (bukan rentang tanggal
      // dari tagged_at) supaya SELALU sinkron dengan app Promotor. Kepemilikan
      // klaim memakai credited_promotor_id/credited_outlet_id sebagai sumber
      // kebenaran (bisa berpindah dari promotor_id/outlet_id asal saat
      // tagging), persis logika "Kontribusi Anda" di app Promotor: jika
      // credited_promotor_id terisi, dialah pemilik; jika kosong, fallback ke
      // promotor_id/outlet_id. Pencapaian ranking = klaim TERVALIDASI dengan
      // biometric_status = BIOMETRIC (RGU-GA SP Biometric), sama seperti
      // definisi "Kontribusi Anda" pada app Promotor.
      const salesByPromotor = new Map();
      const { data: sales } = await supabase.from("pts_sale")
        .select("promotor_id,credited_promotor_id,outlet_id,credited_outlet_id,brand,ga_status,biometric_status")
        .eq("credited_period", period);
      (sales || []).forEach((s) => {
        const owner = s.credited_promotor_id || s.promotor_id;
        if (!owner) return;
        const outletId = s.credited_outlet_id || s.outlet_id;
        const cat = gaCategory(s.ga_status);
        if (!salesByPromotor.has(owner)) {
          salesByPromotor.set(owner, { total: 0, im3: 0, tid: 0, bio: 0, reg: 0, pending: 0, rejected: 0, notfound: 0, byOutlet: new Map() });
        }
        const agg = salesByPromotor.get(owner);
        agg.total++;
        if (s.brand === "IM3") agg.im3++; else if (s.brand === "3ID") agg.tid++;
        if (cat === "validated") { if (s.biometric_status === "BIOMETRIC") agg.bio++; else agg.reg++; }
        else if (cat === "rejected") agg.rejected++;
        else if (cat === "notfound") agg.notfound++;
        else agg.pending++;

        if (outletId) {
          if (!agg.byOutlet.has(outletId)) agg.byOutlet.set(outletId, { total: 0, bio: 0, reg: 0, pending: 0, rejected: 0, notfound: 0 });
          const o = agg.byOutlet.get(outletId);
          o.total++;
          if (cat === "validated") { if (s.biometric_status === "BIOMETRIC") o.bio++; else o.reg++; }
          else if (cat === "rejected") o.rejected++;
          else if (cat === "notfound") o.notfound++;
          else o.pending++;
        }
      });

      // Gabungan kunci: tiap promotor roster + kunci assignment lama yang
      // tidak tertaut promotor_id_ref (email-only, baris legacy) + promotor
      // manapun yang punya klaim ter-credit ke dirinya periode ini (jaga-jaga
      // bila tidak ada di roster/assignment karena alasan lain).
      const allKeys = new Set(promotors.map((p) => p.id));
      metaByKey.forEach((_, k) => { if (!proById.has(k)) allKeys.add(k); });
      salesByPromotor.forEach((_, k) => allKeys.add(k));

      const emptyAgg = { total: 0, im3: 0, tid: 0, bio: 0, reg: 0, pending: 0, rejected: 0, notfound: 0, byOutlet: new Map() };
      const out = [...allKeys].map((k) => {
        const pro = proById.get(k);
        const meta = metaByKey.get(k);
        const outlets = outletsByKey.get(k) || new Set();
        const firstOutletCode = [...outlets][0] || "";
        const outlet = outletByCode.get(String(firstOutletCode).toUpperCase());
        const agg = salesByPromotor.get(k) || emptyAgg;
        const hasRealEmail = !!pro?.email;
        const promotorStatus = pro?.vacant ? "Vacant" : (hasRealEmail && pro?.effective_date ? "Aktif" : "Pending");
        return {
          id: k,
          region: outlet?.region || meta?.region || pro?.region || "", branch: outlet?.branch || meta?.branch || "", mc: meta?.mc || "",
          outletCount: outlets.size,
          outlet: outlets.size > 1 ? `${outlets.size} outlet` : (outlet?.name || firstOutletCode || "—"), outlet_code: firstOutletCode,
          nama: pro?.full_name || meta?.full_name || "—", email: pro?.email || meta?.email || "",
          loginStatus: pro?.auth_user_id ? "Aktif" : "Belum Login",
          promotorStatus,
          total: agg.total, im3: agg.im3, tid: agg.tid,
          bio: agg.bio, reg: agg.reg, pending: agg.pending, rejected: agg.rejected, notfound: agg.notfound,
          byOutlet: agg.byOutlet,
        };
      });

      setRows(out);
    } catch (e) {
      setRows([]);
    } finally { setLoading(false); }
  }, [supabase, period, outletByCode]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const f = rows.filter((r) => {
      if (statusF === "active" && r.loginStatus !== "Aktif") return false;
      if (statusF === "not_logged_in" && r.loginStatus !== "Belum Login") return false;
      if (s && !(`${r.nama} ${r.email} ${r.outlet} ${r.outlet_code}`.toLowerCase().includes(s))) return false;
      return true;
    });
    // Sort berdasarkan rangking pencapaian: RGU-GA SP Biometric tervalidasi
    // (agg.bio) terbanyak di atas, lalu total tervalidasi, lalu total klaim,
    // lalu nama sebagai tie-breaker stabil.
    const sorted = [...f].sort((a, b) => (b.bio - a.bio) || ((b.bio + b.reg) - (a.bio + a.reg)) || (b.total - a.total) || a.nama.localeCompare(b.nama));
    return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [rows, statusF, q]);

  const stats = useMemo(() => {
    const belum = rows.filter((r) => r.loginStatus === "Belum Login").length;
    const vacant = rows.filter((r) => r.promotorStatus === "Vacant").length;
    const belumMapping = rows.filter((r) => r.outletCount === 0).length;
    const total = rows.reduce((a, r) => a + r.total, 0);
    return { promotor: rows.length, belum, vacant, belumMapping, total };
  }, [rows]);

  // Leaderboard individu, ranking Region/Branch/MC, dan distribusi status
  // sekarang dihitung di dalam <LeaderboardPanel> sendiri (tab terpisah),
  // berbasis `rows` supaya filter Region/Branch di sana independen dari
  // pencarian/filter status login di tab Ringkasan Promotor ini.

  const mappingLabel = (r) => (r.outletCount === 0 ? "Belum ter-mapping" : `${r.outletCount} outlet`);

  const exportExcel = () => {
    const head = ["No", "Rank", "Region", "Branch", "MC", "Outlet", "ID Outlet", "Nama Promotor", "Email", "Status Promotor", "Status Mapping", "Status Login", "Total Pengajuan", "Dalam Pengajuan", "Total Tervalidasi", "GA SP Biometric", "% Pencapaian (target 150)", "GA SP Non-Biometric", "GA di luar Outlet", "IM3", "3ID"];
    const body = filtered.map((r, i) => [i + 1, r.rank, r.region, r.branch, r.mc, r.outlet, r.outlet_code, r.nama, r.email, r.promotorStatus, mappingLabel(r), r.loginStatus, r.total, r.pending, r.bio + r.reg, r.bio, `${Math.round((r.bio / PROMOTOR_BIO_TARGET) * 100)}%`, r.reg, r.rejected + r.notfound, r.im3, r.tid]);
    const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Ringkasan ${period}`);
    XLSX.writeFile(wb, `PTS_Ringkasan_${period}.xlsx`);
  };

  const modeToggle = (
    <div style={{ marginBottom: 16 }}>
      <Segmented t={t} value={mode} onChange={setMode}
        options={[
          { value: "ringkasan", label: "Ringkasan Promotor", icon: <Users size={13} /> },
          { value: "leaderboard", label: "Leaderboard", icon: <Trophy size={13} /> },
          { value: "msisdn", label: "Detail per Nomor", icon: <Phone size={13} /> },
        ]} />
    </div>
  );

  if (mode === "msisdn") return <div>{modeToggle}<MsisdnPanel t={t} supabase={supabase} period={period} outletByCode={outletByCode} /></div>;

  if (mode === "leaderboard") {
    return (
      <div>
        {modeToggle}
        <LeaderboardPanel t={t} period={period} rows={rows} onSelectRow={setDetailRow} />
        {detailRow && <PromotorDetailModal t={t} row={detailRow} outletById={outletById} onClose={() => setDetailRow(null)} />}
      </div>
    );
  }

  return (
    <div>
      {modeToggle}
      {/* Stats */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <Stat t={t} icon={<Users size={18} />}       label="Total Promotor"   value={stats.promotor}     accent={{ fg: t.mag, bg: t.magBg, bd: t.magBd }} />
        <Stat t={t} icon={<Store size={18} />}       label="Belum ter-mapping" value={stats.belumMapping} accent={{ fg: t.blue, bg: t.blueBg, bd: t.blueBd }} />
        <Stat t={t} icon={<Ban size={18} />}         label="Vacant"           value={stats.vacant}       accent={{ fg: t.amber, bg: t.amberBg, bd: t.amberBd }} />
        <Stat t={t} icon={<UserX size={18} />}       label="Belum login"      value={stats.belum}        accent={{ fg: t.amber, bg: t.amberBg, bd: t.amberBd }} />
        <Stat t={t} icon={<ShoppingBag size={18} />} label="Total Klaim SP"   value={stats.total}        accent={{ fg: t.green, bg: t.greenBg, bd: t.greenBd }} />
      </div>

      {/* Visualisasi ranking (leaderboard individu, ranking Region/Branch/MC,
          distribusi status) dipindah ke tab "Leaderboard" tersendiri — supaya
          tab ini fokus ke tabel data mentah & tidak numpuk. */}

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Segmented t={t} value={statusF} onChange={setStatusF}
            options={[
              { value: "all", label: "Semua", count: rows.length },
              { value: "active", label: "Login: Aktif" },
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

      {/* Tabel ringkasan per promotor — sudah diurutkan berdasarkan rangking pencapaian */}
      <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, overflow: "hidden", boxShadow: t.sm }}>
        <div style={{ overflow: "auto", maxHeight: 620 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1560 }}>
            <thead>
              <tr>
                {["#", "Branch", "MC", "Outlet", "Promotor", "Email", "Status Promotor", "Status Mapping", "Status Login"].map((h) => (
                  <th key={h} className="pts-th">{h}</th>
                ))}
                <th className="pts-th">Total Pengajuan</th>
                <th className="pts-th" style={{ color: t.amber }}>Dalam Pengajuan</th>
                <th className="pts-th" style={{ color: t.green }}>Total Tervalidasi</th>
                <th className="pts-th" style={{ color: "#fff", background: t.green, borderBottom: `1px solid ${t.green}` }}>★ GA SP Biometric</th>
                <th className="pts-th" style={{ color: t.blue }}>GA SP Non-Biometric</th>
                <th className="pts-th" style={{ color: t.mid }}>GA di luar Outlet</th>
                <th className="pts-th">IM3</th>
                <th className="pts-th">3ID</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="pts-td" colSpan={17} style={{ textAlign: "center", padding: 40, color: t.mid }}><Loader2 size={20} className="spin" style={{ verticalAlign: "middle" }} /> Memuat data…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td className="pts-td" colSpan={17} style={{ textAlign: "center", padding: 48, color: t.mid }}>
                  <Store size={26} style={{ opacity: .5, marginBottom: 8 }} /><br />
                  Belum ada data untuk {ymLabel(period)}. Mapping outlet promotor terlebih dulu di tab <b>Mapping Outlet Promotor</b>.
                </td></tr>
              ) : filtered.map((r) => {
                const belumLogin = r.loginStatus === "Belum Login";
                const belumMapping = r.outletCount === 0;
                const psTone = r.promotorStatus === "Vacant" ? { bg: t.amberBg, fg: t.amber, bd: t.amberBd } : r.promotorStatus === "Aktif" ? { bg: t.greenBg, fg: t.green, bd: t.greenBd } : { bg: t.hover, fg: t.mid, bd: t.line };
                return (
                  <tr key={r.id} className="pts-row" onClick={() => setDetailRow(r)} style={{ background: r.promotorStatus === "Vacant" ? t.amberBg : belumMapping ? t.hover : "transparent", cursor: "pointer" }}>
                    <td className="pts-td" style={{ color: t.mid, fontWeight: r.rank <= 3 ? 800 : 400 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{r.rank <= 3 && <RankBadge rank={r.rank} />}{r.rank}</span>
                    </td>
                    <td className="pts-td">{r.branch || "—"}</td>
                    <td className="pts-td">{r.mc || "—"}</td>
                    <td className="pts-td" style={{ fontFamily: "monospace", fontSize: 11.5, color: t.mid }}>{r.outlet_code || "—"}</td>
                    <td className="pts-td" style={{ fontWeight: 600 }}>{r.nama}</td>
                    <td className="pts-td" style={{ color: t.mid }}>{r.email}</td>
                    <td className="pts-td">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: psTone.bg, color: psTone.fg, border: `1px solid ${psTone.bd}` }}>{r.promotorStatus}</span>
                    </td>
                    <td className="pts-td">
                      {belumMapping
                        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: t.blueBg, color: t.blue, border: `1px solid ${t.blueBd}` }}><Store size={11} /> Belum ter-mapping</span>
                        : <span style={{ fontSize: 11.5, fontWeight: 600, color: t.hi }}>{mappingLabel(r)}</span>}
                    </td>
                    <td className="pts-td">
                      {belumLogin
                        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: t.amberBg, color: t.amber, border: `1px solid ${t.amberBd}` }}><UserX size={11} /> Belum Login</span>
                        : <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: t.greenBg, color: t.green, border: `1px solid ${t.greenBd}` }}><UserCheck size={11} /> Aktif</span>}
                    </td>
                    <td className="pts-td" style={{ fontWeight: 700 }}>{r.total}</td>
                    <td className="pts-td" style={{ fontWeight: 600, color: t.amber }}>{r.pending || "—"}</td>
                    <td className="pts-td" style={{ fontWeight: 700, color: t.green }}>{r.bio + r.reg || "—"}</td>
                    <td className="pts-td" style={{ background: t.greenBg, borderLeft: `2px solid ${t.green}`, borderRight: `2px solid ${t.green}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ fontWeight: 800, color: t.green, fontSize: 13.5 }}>{r.bio}</span>
                        <span style={{ fontSize: 10.5, color: t.mid }}>/ {PROMOTOR_BIO_TARGET}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99, background: r.bio >= PROMOTOR_BIO_TARGET ? t.green : t.card, color: r.bio >= PROMOTOR_BIO_TARGET ? "#fff" : t.green, border: `1px solid ${t.green}` }}>
                          {Math.round((r.bio / PROMOTOR_BIO_TARGET) * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className="pts-td" style={{ color: t.blue }}>{r.reg || "—"}</td>
                    <td className="pts-td" style={{ color: t.mid }}>{(r.rejected + r.notfound) || "—"}</td>
                    <td className="pts-td" style={{ color: t.mid }}>{r.im3 || "—"}</td>
                    <td className="pts-td" style={{ color: t.mid }}>{r.tid || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: t.mid }}>
        Menampilkan {filtered.length} baris, diurutkan berdasarkan rangking RGU-GA SP Biometric tervalidasi · Baris <b style={{ color: t.amber }}>kuning</b> = Vacant, baris abu-abu = belum ter-mapping bulan ini · Klik baris untuk detail per outlet.
      </div>

      {detailRow && <PromotorDetailModal t={t} row={detailRow} outletById={outletById} onClose={() => setDetailRow(null)} />}

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
  const [brandF, setBrandF] = useState("all"); // all | IM3 | 3ID
  const outletById = useMemo(() => { const m = new Map(); outletByCode.forEach((o) => m.set(o.id, o)); return m; }, [outletByCode]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Sama seperti tab Ringkasan Aktivitas — filter pakai credited_period,
      // bukan rentang tanggal tagged_at, supaya konsisten dengan app
      // Promotor dan tidak "kehilangan" klaim yang ditag menjelang tengah
      // malam WIB (tagged_at dibandingkan sebagai UTC kalau pakai string
      // tanggal polos).
      // lat/lng/distance_meters SENGAJA tidak diambil — geofencing kini
      // dihitung lokal di browser promotor, koordinat mentahnya tidak
      // pernah dikirim ke server maupun tersimpan di database (histori lama
      // juga sudah di-redact). Yang tersimpan & bisa diaudit di sini cuma
      // status akhirnya: within_radius (dalam/luar radius).
      const { data: sales } = await supabase.from("pts_sale")
        .select("id,phone_normalized,brand,email,promotor_id,outlet_id,region,tagged_at,raw_qr_value,within_radius,outside_confirmed_at,ga_status,biometric_status,ga_note,credited_period")
        .eq("credited_period", period).order("tagged_at", { ascending: false });
      const { data: pros } = await supabase.from("pts_promotor").select("id,email,full_name");
      const nameById = new Map((pros || []).map((p) => [p.id, p.full_name]));
      const nameByEmail = new Map((pros || []).map((p) => [(p.email || "").toLowerCase(), p.full_name]));
      // promotor_id (uuid, permanen) diutamakan; email hanya cadangan untuk baris lama.
      setRows((sales || []).map((s) => {
        const o = outletById.get(s.outlet_id);
        const nama = (s.promotor_id && nameById.get(s.promotor_id)) || nameByEmail.get((s.email || "").toLowerCase()) || "—";
        return { ...s, nama, outlet_code: o?.code || "", branch: o?.branch || "", area: o?.area || "", region: s.region || o?.region || "" };
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
      if (brandF !== "all" && r.brand !== brandF) return false;
      if (s && !`${r.phone_normalized} ${r.nama} ${r.email} ${r.outlet_code}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [rows, q, geoF, gaF, brandF]);

  const stats = useMemo(() => {
    const outside = rows.filter((r) => r.within_radius === false).length;
    const belum = rows.filter((r) => (r.ga_status || "BELUM_TERVALIDASI") === "BELUM_TERVALIDASI").length;
    return { total: rows.length, outside, belum };
  }, [rows]);

  const download = () => {
    const head = ["No", "Tanggal", "Jam", "MSISDN", "Brand", "Nama Promotor", "Email", "ID Outlet", "Branch", "Area", "Region", "Dalam Radius?", "Status Validasi GA", "Biometric", "Catatan GA"];
    const body = filtered.map((r, i) => [i + 1, fmtDate(r.tagged_at), fmtTime(r.tagged_at), r.phone_normalized, r.brand || "", r.nama, r.email, r.outlet_code, r.branch, r.area, r.region, r.within_radius === false ? "Tidak" : "Ya", GA_STATUS_LABEL[r.ga_status] || r.ga_status, r.biometric_status || "", r.ga_note || ""]);
    const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
    ws["!cols"] = [{ wch: 5 }, { wch: 12 }, { wch: 8 }, { wch: 16 }, { wch: 8 }, { wch: 20 }, { wch: 26 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 34 }];
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
          <select className="pts-in pts-select" value={gaF} onChange={(e) => setGaF(e.target.value)}>
            <option value="all">Semua status GA</option>
            {Object.entries(GA_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="pts-in pts-select" value={brandF} onChange={(e) => setBrandF(e.target.value)}>
            <option value="all">Semua brand</option>
            <option value="IM3">IM3</option>
            <option value="3ID">3ID</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: 9 }}>
          <button className="pts-btn" onClick={load} style={{ background: t.card, color: t.mid, border: `1px solid ${t.line}` }}><RefreshCw size={14} /> Muat ulang</button>
          <button className="pts-btn" onClick={download} disabled={!filtered.length} style={{ background: t.brand, color: "#fff", boxShadow: t.sm }}><Download size={15} /> Download MSISDN</button>
        </div>
      </div>

      <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, overflow: "hidden", boxShadow: t.sm }}>
        <div style={{ overflow: "auto", maxHeight: 620 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1440 }}>
            <thead>
              {/* Kolom Latitude/Longitude/Jarak sengaja tidak ada lagi —
                  geofencing sekarang dihitung lokal di browser promotor,
                  koordinat mentahnya tidak pernah dikirim/disimpan di
                  database. Kolom "Lokasi" di bawah tetap menampilkan status
                  akhirnya (dalam/luar radius), itu satu-satunya hal yang
                  memang perlu diaudit di sini. */}
              <tr>{["No", "Tanggal", "Jam", "MSISDN", "Brand", "Promotor", "ID Outlet", "Branch", "Region", "Lokasi", "Status GA", "Biometric"].map((h) => <th key={h} className="pts-th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="pts-td" colSpan={12} style={{ textAlign: "center", padding: 40, color: t.mid }}><Loader2 size={20} className="spin" style={{ verticalAlign: "middle" }} /> Memuat…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td className="pts-td" colSpan={12} style={{ textAlign: "center", padding: 44, color: t.mid }}><Phone size={24} style={{ opacity: .5, marginBottom: 8 }} /><br />Belum ada penjualan untuk {ymLabel(period)}.</td></tr>
              ) : filtered.map((r, i) => (
                <tr key={r.id} className="pts-row">
                  <td className="pts-td" style={{ color: t.mid }}>{i + 1}</td>
                  <td className="pts-td">{fmtDate(r.tagged_at)}</td>
                  <td className="pts-td" style={{ fontWeight: 600 }}>{fmtTime(r.tagged_at)}</td>
                  <td className="pts-td" style={{ fontFamily: "monospace", fontWeight: 700 }}>{r.phone_normalized}</td>
                  <td className="pts-td">{r.brand ? <Chip t={t} tone={r.brand === "3ID" ? "blue" : "red"}>{r.brand}</Chip> : "—"}</td>
                  <td className="pts-td" style={{ fontWeight: 600 }}>{r.nama}</td>
                  <td className="pts-td" style={{ fontFamily: "monospace", fontSize: 11.5 }}>{r.outlet_code || "—"}</td>
                  <td className="pts-td">{r.branch || "—"}</td>
                  <td className="pts-td">{r.region || "—"}</td>
                  <td className="pts-td">
                    {r.within_radius === false
                      ? <span title={r.outside_confirmed_at ? `Dikonfirmasi ${fmtDate(r.outside_confirmed_at)} ${fmtTime(r.outside_confirmed_at)}` : ""} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: t.blueBg, color: t.blue, border: `1px solid ${t.blueBd}` }}><Radar size={11} /> Luar area</span>
                      : <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: t.greenBg, color: t.green, border: `1px solid ${t.greenBd}` }}><CheckCircle2 size={11} /> Dalam area</span>}
                  </td>
                  <td className="pts-td"><span title={r.ga_note || ""}><Chip t={t} tone={GA_STATUS_TONE[r.ga_status] || "amber"}>{GA_STATUS_LABEL[r.ga_status] || r.ga_status}</Chip></span></td>
                  <td className="pts-td" style={{ fontSize: 11.5, color: t.mid }}>{r.biometric_status || "—"}</td>
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
   Radius (meter) yang dipakai untuk validasi lokasi saat tagging SP —
   SATU standar global untuk semua outlet (tidak ada lagi pengaturan per
   region/branch/outlet — disederhanakan supaya tidak membingungkan). */
function GeofenceSettings({ t, d, supabase, profile, outlets, isFullAdmin, onOutletsChanged }) {
  const [loading, setLoading] = useState(true);
  const [radius, setRadius] = useState(30);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);

  // ── Upload titik outlet (BRAND + ID OUTLET + LATITUDE + LONGITUDE) ──
  // File ini hanya diproses di memori: koordinat langsung di-upsert ke
  // pts_outlet (kolom latitude/longitude) sesuai brand:
  //   BRAND=IM3 → cocokkan ke pts_outlet.code
  //   BRAND=3ID → cocokkan ke pts_outlet.code_3id
  // Dua brand pada outlet fisik yang sama akan berbagi koordinat yang
  // sama karena keduanya menunjuk row pts_outlet yang sama (kunci = code).
  const coordFileRef = useRef(null);
  const [coordDrag, setCoordDrag] = useState(false);
  const [coordFileName, setCoordFileName] = useState("");
  const [coordRows, setCoordRows] = useState(null);
  const [coordBusy, setCoordBusy] = useState(false);
  const [coordProgress, setCoordProgress] = useState(null); // { done, total }
  const [coordResult, setCoordResult] = useState(null);
  const [coordErr, setCoordErr] = useState("");

  const outletByAnyCode = useMemo(() => {
    const m = new Map();
    outlets.forEach((o) => {
      if (o.code) m.set(String(o.code).trim().toUpperCase(), o);
      if (o.code_3id) m.set(String(o.code_3id).trim().toUpperCase(), o);
    });
    return m;
  }, [outlets]);

  const resetCoord = () => { setCoordRows(null); setCoordFileName(""); setCoordResult(null); setCoordErr(""); if (coordFileRef.current) coordFileRef.current.value = ""; };

  const downloadCoordTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["BRAND", "ID OUTLET", "LATITUDE", "LONGITUDE"],
      ["IM3", "OTL-IM3-0001", -3.5952, 98.6785],
      ["3ID", "OTL-3ID-0001", -3.5952, 98.6785],
    ]);
    ws["!cols"] = [{ wch: 8 }, { wch: 18 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Titik Outlet");
    XLSX.writeFile(wb, "PTS_Outlet_Coords_Template.xlsx");
  };

  const parseCoordFile = async (file) => {
    setCoordErr(""); setCoordResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
      if (!raw.length) { setCoordErr("File kosong."); return; }
      const head = raw[0].map((h) => String(h || "").trim().toUpperCase());
      const idx = (name) => head.findIndex((h) => h === name);
      const iBrand = idx("BRAND"), iCode = idx("ID OUTLET"), iLat = idx("LATITUDE"), iLng = idx("LONGITUDE");
      if (iCode < 0 || iLat < 0 || iLng < 0) { setCoordErr("Header wajib: 'ID OUTLET', 'LATITUDE', 'LONGITUDE' (BRAND opsional tapi disarankan)."); return; }
      const parsed = [];
      for (let r = 1; r < raw.length; r++) {
        const row = raw[r]; if (!row || row.every((c) => c === "" || c == null)) continue;
        const code = String(row[iCode] ?? "").trim();
        const brand = iBrand >= 0 ? String(row[iBrand] ?? "").trim().toUpperCase() : "";
        // Number("") === 0 di JS — cek eksplisit supaya sel kosong tidak jadi 0
        const latRaw = String(row[iLat] ?? "").trim();
        const lngRaw = String(row[iLng] ?? "").trim();
        const lat = latRaw === "" ? NaN : Number(latRaw);
        const lng = lngRaw === "" ? NaN : Number(lngRaw);
        const outlet = code ? outletByAnyCode.get(code.toUpperCase()) : null;
        const errs = [];
        if (!code) errs.push("ID Outlet kosong");
        else if (!outlet) errs.push("ID Outlet tidak ditemukan di master outlet");
        if (isNaN(lat) || isNaN(lng)) errs.push("Lat/Lng harus angka");
        if (!isNaN(lat) && !isNaN(lng) && lat === 0 && lng === 0) errs.push("Koordinat (0,0) tidak valid");
        if (brand && !["IM3", "3ID"].includes(brand)) errs.push("BRAND harus IM3 atau 3ID (atau kosong)");
        parsed.push({
          rowNo: r + 1, brand, code, outlet_id: outlet?.id || null, outlet_name: outlet?.name || "",
          lat, lng, errors: errs,
        });
      }
      if (!parsed.length) { setCoordErr("Tidak ada baris data pada file ini."); return; }
      setCoordRows(parsed);
    } catch (e) { setCoordErr("Gagal membaca file: " + (e?.message || e)); }
  };

  const onCoordPick = (e) => { const f = e.target.files?.[0]; if (f) { setCoordFileName(f.name); parseCoordFile(f); } };
  const onCoordDrop = (e) => { e.preventDefault(); setCoordDrag(false); const f = e.dataTransfer.files?.[0]; if (f) { setCoordFileName(f.name); parseCoordFile(f); } };

  const coordOkRows = coordRows ? coordRows.filter((r) => !r.errors.length) : [];
  const coordErrCount = coordRows ? coordRows.filter((r) => r.errors.length).length : 0;

  const saveCoords = async () => {
    if (!coordOkRows.length) return;
    setCoordBusy(true); setCoordErr(""); setCoordResult(null);
    try {
      // Group by outlet_id — beberapa baris (brand IM3 & 3ID) untuk outlet
      // fisik yang sama harus jadi 1 update, koordinat terakhir menang.
      const byOutlet = new Map();
      coordOkRows.forEach((r) => { byOutlet.set(r.outlet_id, { latitude: r.lat, longitude: r.lng }); });
      let updated = 0;
      const total = byOutlet.size;
      setCoordProgress({ done: 0, total });
      for (const [outlet_id, patch] of byOutlet) {
        const { error } = await supabase.from("pts_outlet").update(patch).eq("id", outlet_id);
        if (error) throw error;
        updated++;
        setCoordProgress({ done: updated, total });
      }
      setCoordResult({ updated, rows: coordOkRows.length, skipped: coordErrCount });
      setCoordRows(null); setCoordFileName(""); if (coordFileRef.current) coordFileRef.current.value = "";
      if (onOutletsChanged) await onOutletsChanged();
    } catch (e) {
      setCoordErr("Gagal menyimpan: " + (e?.message || e));
    } finally { setCoordBusy(false); setCoordProgress(null); }
  };

  // Hanya baca/tulis SATU baris (scope_type='global') — tidak ada lagi
  // pengaturan per region/branch/outlet.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from("pts_geofence_setting").select("*").eq("scope_type", "global").maybeSingle();
      setRadius(data?.radius_meters ?? 30);
    } catch { setRadius(30); } finally { setLoading(false); }
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setErr(""); setSaved(false);
    if (!isFullAdmin) return setErr("Hanya SPM Sumatera yang dapat mengubah radius geofence.");
    if (!(Number(radius) > 0)) return setErr("Radius harus lebih dari 0 meter.");
    setBusy(true);
    try {
      const payload = { scope_type: "global", scope_value: "", radius_meters: Number(radius), updated_by: profile?.id || null, updated_at: new Date().toISOString() };
      const { error } = await supabase.from("pts_geofence_setting").upsert(payload, { onConflict: "scope_type,scope_value" });
      if (error) throw error;
      setSaved(true);
      await load();
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr("Gagal menyimpan: " + (e?.message || e));
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 16px", borderRadius: 12, background: t.brandBg, border: `1px solid ${t.brandBd}`, marginBottom: 18 }}>
        <Radar size={17} color={t.brand} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13.5, color: t.hi, fontWeight: 500 }}>
          Radius maksimum jarak tagging dari titik outlet. Satu standar <b>global</b> berlaku untuk semua outlet, tidak ada pengecualian per region/branch/outlet. Di luar radius, tagging tetap tersimpan namun ditandai untuk evaluasi.
        </span>
      </div>

      {!isFullAdmin && (
        <div style={{ marginBottom: 16, padding: "11px 14px", borderRadius: 10, background: t.amberBg, border: `1px solid ${t.amberBd}`, fontSize: 12.5, color: t.hi }}>
          Anda melihat pengaturan ini sebagai read-only. Hanya role <b>SPM Sumatera</b> yang dapat mengubah radius geofence.
        </div>
      )}

      {/* ── Upload titik outlet (BRAND + ID OUTLET + LATITUDE + LONGITUDE) ── */}
      <div style={{ marginBottom: 18, padding: 18, borderRadius: 14, background: t.card, border: `1px solid ${t.line}`, boxShadow: t.sm, opacity: isFullAdmin ? 1 : .6, pointerEvents: isFullAdmin ? "auto" : "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.hi }}>Upload Titik Outlet (BRAND · ID OUTLET · Lat · Lng)</div>
            <div style={{ fontSize: 12.5, color: t.mid, marginTop: 3 }}>Koordinat inilah yang dibandingkan dengan lokasi promotor saat Claim Penjualan (baik scan QR maupun input manual). ID Outlet cocokkan ke IM3 <b>atau</b> 3ID — dua brand di outlet fisik yang sama akan berbagi 1 titik.</div>
          </div>
          <button className="pts-btn" onClick={downloadCoordTemplate} style={{ background: t.card, color: t.hi, border: `1px solid ${t.line}`, boxShadow: t.sm }}><Download size={14} /> Template</button>
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setCoordDrag(true); }}
          onDragLeave={() => setCoordDrag(false)}
          onDrop={onCoordDrop}
          onClick={() => coordFileRef.current?.click()}
          style={{
            border: `1.5px dashed ${coordDrag ? t.brand : t.line}`, borderRadius: 12, padding: "22px 16px", textAlign: "center", cursor: "pointer",
            background: coordDrag ? t.brandBg : t.sub, transition: "all .15s",
          }}>
          <input ref={coordFileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onCoordPick} />
          <FileSpreadsheet size={22} style={{ color: t.brand, marginBottom: 8 }} />
          <div style={{ fontSize: 13.5, fontWeight: 600, color: t.hi }}>{coordFileName || "Tarik file .xlsx / .csv ke sini, atau klik untuk memilih"}</div>
          <div style={{ fontSize: 11.5, color: t.lo, marginTop: 5 }}>Kolom wajib: BRAND · ID OUTLET · LATITUDE · LONGITUDE</div>
        </div>
        {coordErr && (
          <div style={{ marginTop: 12, display: "flex", gap: 10, padding: "11px 13px", borderRadius: 10, background: t.redBg, border: `1px solid ${t.redBd}` }}>
            <AlertTriangle size={16} color={t.red} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 13, color: t.hi }}>{coordErr}</span>
          </div>
        )}
        {coordResult && (
          <div style={{ marginTop: 12, display: "flex", gap: 11, padding: "12px 14px", borderRadius: 12, background: t.greenBg, border: `1px solid ${t.greenBd}` }}>
            <CheckCircle2 size={18} color={t.green} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 13.5, color: t.hi }}>
              <b>{coordResult.updated}</b> outlet diperbarui titik koordinatnya.
              {coordResult.skipped > 0 && <span style={{ color: t.amber }}> {coordResult.skipped} baris dilewati karena error.</span>}
            </div>
          </div>
        )}
        {coordRows && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: t.hi }}>Pratinjau: {coordRows.length} baris</span>
                <Chip t={t} tone="green" icon={<CheckCircle2 size={12} />}>{coordOkRows.length} valid</Chip>
                {coordErrCount > 0 && <Chip t={t} tone="red" icon={<AlertTriangle size={12} />}>{coordErrCount} error</Chip>}
              </div>
              <div style={{ display: "flex", gap: 9 }}>
                <button className="pts-btn" onClick={resetCoord} style={{ background: t.card, color: t.mid, border: `1px solid ${t.line}` }}><X size={14} /> Batal</button>
                <button className="pts-btn" onClick={saveCoords} disabled={coordBusy || coordOkRows.length === 0}
                  style={{ background: t.brand, color: "#fff", boxShadow: t.sm }}>
                  {coordBusy ? <Loader2 size={15} className="spin" /> : <MapPin size={15} />} Simpan {coordOkRows.length} Titik
                </button>
              </div>
            </div>
            {coordBusy && (
              <div style={{ marginBottom: 12, border: `1px solid ${t.line}`, borderRadius: 12, padding: "16px 18px", background: t.card, boxShadow: t.sm }}>
                <StepProgress t={t} activeIndex={1} progress={coordProgress ? coordProgress.done / coordProgress.total : 0} steps={[
                  { key: "read", label: "Membaca & memvalidasi file" },
                  { key: "save", label: "Menyimpan titik koordinat ke database", sub: coordProgress ? `${coordProgress.done}/${coordProgress.total} outlet` : undefined },
                ]} />
              </div>
            )}
            <div style={{ border: `1px solid ${t.line}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ maxHeight: 260, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{["Baris", "Brand", "ID Outlet", "Nama Outlet", "Lat", "Lng", "Status"].map((h) => <th key={h} className="pts-th">{h}</th>)}</tr></thead>
                  <tbody>
                    {coordRows.slice(0, 300).map((r, i) => (
                      <tr key={i} className="pts-row" style={{ background: r.errors.length ? t.redBg : "transparent" }}>
                        <td className="pts-td" style={{ color: t.mid }}>{r.rowNo}</td>
                        <td className="pts-td">{r.brand || "—"}</td>
                        <td className="pts-td" style={{ fontFamily: "monospace", fontSize: 12 }}>{r.code || "—"}</td>
                        <td className="pts-td">{r.outlet_name || <span style={{ color: t.lo }}>—</span>}</td>
                        <td className="pts-td" style={{ fontFamily: "monospace" }}>{isNaN(r.lat) ? "—" : r.lat}</td>
                        <td className="pts-td" style={{ fontFamily: "monospace" }}>{isNaN(r.lng) ? "—" : r.lng}</td>
                        <td className="pts-td">
                          {r.errors.length
                            ? <span title={r.errors.join("; ")} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: t.red, fontWeight: 600, fontSize: 12 }}><AlertTriangle size={12} /> {r.errors[0]}</span>
                            : <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: t.green, fontWeight: 600, fontSize: 12 }}><CheckCircle2 size={12} /> OK</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {coordRows.length > 300 && <div style={{ padding: "9px 14px", fontSize: 12, color: t.mid, borderTop: `1px solid ${t.lineSoft}` }}>Menampilkan 300 dari {coordRows.length} baris.</div>}
            </div>
          </div>
        )}
      </div>

      {/* Satu radius global saja — tidak ada lagi pilihan cakupan per
          region/branch/outlet, supaya konsisten & tidak membingungkan. */}
      <div style={{ padding: 18, borderRadius: 14, background: t.card, border: `1px solid ${t.line}`, boxShadow: t.sm, opacity: isFullAdmin ? 1 : .6, pointerEvents: isFullAdmin ? "auto" : "none" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.hi, marginBottom: 3 }}>Radius Geofence</div>
        <div style={{ fontSize: 12.5, color: t.mid, marginBottom: 14 }}>Berlaku untuk semua outlet, semua brand.</div>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: t.mid, fontSize: 13, padding: "6px 0" }}><Loader2 size={16} className="spin" /> Memuat…</div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
            <Field t={t} label="Radius (meter)">
              <input className="pts-in" type="number" min={1} value={radius} onChange={(e) => setRadius(e.target.value)} style={{ width: 140 }} />
            </Field>
            <button className="pts-btn" onClick={save} disabled={busy} style={{ background: t.brand, color: "#fff", boxShadow: t.sm }}>
              {busy ? <Loader2 size={14} className="spin" /> : saved ? <CheckCircle2 size={14} /> : <Save size={14} />} {saved ? "Tersimpan" : "Simpan Radius"}
            </button>
          </div>
        )}
        {err && <div style={{ marginTop: 12, fontSize: 12.5, color: t.red, display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={13} />{err}</div>}
      </div>
    </div>
  );
}

/* ══════════════════════ CALL CENTER WHATSAPP ═══════════════════════════
   Pengaturan singkat: nomor WhatsApp call center + template pesan pembuka
   yang dipakai promotor lewat tombol "Hubungi Call Center via WhatsApp" di
   layar login & aplikasi utama (app/promotor). Disimpan sebagai 1 baris
   singleton di pts_call_center_setting. */
function WhatsappSettings({ t, supabase, profile }) {
  const [row, setRow] = useState(null);
  const [number, setNumber] = useState("");
  const [template, setTemplate] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  // Verifikasi hak akses LANGSUNG dari server (RPC pts_call_center_admin(),
  // fungsi yang sama persis dipakai RLS untuk mengizinkan/menolak simpan).
  // Menu ini SENGAJA dipersempit: hanya role spm_sumatera persis yang boleh
  // mengubah — beda dengan fitur lain (mis. Geofence) yang juga mengizinkan
  // internal_ioh & salesforce_mgmt_sumatera. isFullAdmin dari props tidak
  // dipakai di sini karena terlalu longgar untuk menu ini.
  const [serverAdmin, setServerAdmin] = useState(null); // null=belum dicek, true/false=hasil RPC

  useEffect(() => {
    let alive = true;
    supabase.rpc("pts_call_center_admin").then(({ data, error }) => {
      if (!alive) return;
      setServerAdmin(error ? false : !!data);
    });
    return () => { alive = false; };
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from("pts_call_center_setting").select("*").limit(1).maybeSingle();
      setRow(data || null);
      setNumber(data?.whatsapp_number || "");
      setTemplate(data?.message_template || "");
    } catch { setRow(null); } finally { setLoading(false); }
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  const normalized = String(number || "").replace(/[^\d]/g, "").replace(/^0/, "62");
  const previewLink = normalized ? `https://wa.me/${normalized}${template ? `?text=${encodeURIComponent(template)}` : ""}` : null;

  // Boleh mencoba simpan hanya jika server MENGKONFIRMASI hak akses — bukan
  // sekadar isFullAdmin di klien, supaya tidak ada lagi kejutan "berhasil
  // di UI tapi ditolak RLS".
  const canSave = serverAdmin === true;

  const save = async () => {
    setErr(""); setSaved(false);
    if (!canSave) return setErr(`Menu ini khusus role SPM Sumatera${profile?.role ? ` (role login Anda saat ini: ${profile.role})` : ""}. Hubungi SPM Sumatera untuk melakukan perubahan.`);
    if (!number.trim()) return setErr("Nomor WhatsApp wajib diisi.");
    if (!/^\d{8,15}$/.test(normalized)) return setErr("Nomor tidak valid — gunakan format 08xx atau 62xx tanpa spasi/simbol.");
    setBusy(true);
    try {
      const payload = { whatsapp_number: number.trim(), message_template: template.trim(), updated_by: profile?.id || null, updated_at: new Date().toISOString() };
      const { error } = row?.id
        ? await supabase.from("pts_call_center_setting").update(payload).eq("id", row.id)
        : await supabase.from("pts_call_center_setting").insert(payload);
      if (error) throw error;
      setSaved(true);
      await load();
    } catch (e) {
      const rls = /row-level security/i.test(e?.message || "");
      setErr(rls
        ? `Gagal menyimpan: akses ditolak sistem (RLS). Menu ini khusus role SPM Sumatera — akun Anda belum terdaftar dengan role tersebut.`
        : "Gagal menyimpan: " + (e?.message || e));
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 16px", borderRadius: 12, background: "#E9FBF0", border: "1px solid #BDEFD1", marginBottom: 18 }}>
        <WhatsAppIcon size={19} />
        <span style={{ fontSize: 13.5, color: t.hi, fontWeight: 500 }}>
          Nomor & pesan pembuka di sini akan tampil sebagai tombol <b>"Hubungi Call Center via WhatsApp"</b> di layar login promotor dan di halaman utama aplikasi promotor (SandraHub). Kosongkan nomor untuk menyembunyikan tombol tersebut.
        </span>
      </div>

      {serverAdmin === false && (
        <div style={{ marginBottom: 16, padding: "11px 14px", borderRadius: 10, background: t.amberBg, border: `1px solid ${t.amberBd}`, fontSize: 12.5, color: t.hi }}>
          Anda melihat pengaturan ini sebagai read-only. Menu ini khusus role <b>SPM Sumatera</b>
          {profile?.role ? <> — role login Anda saat ini: <b>{profile.role}</b></> : ""}.
        </div>
      )}

      <div style={{ padding: 18, borderRadius: 14, background: t.card, border: `1px solid ${t.line}`, boxShadow: t.sm, opacity: serverAdmin === false ? .6 : 1, pointerEvents: serverAdmin === false ? "none" : "auto", maxWidth: 520 }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 9, color: t.mid, fontSize: 13 }}><Loader2 size={16} className="spin" /> Memuat…</div>
        ) : (
          <>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: t.mid, marginBottom: 6 }}>Nomor WhatsApp Call Center</label>
            <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="mis. 081234567890"
              style={{ width: "100%", height: 44, borderRadius: 10, border: `1px solid ${t.line}`, background: t.sub, color: t.hi, padding: "0 13px", fontSize: 14, fontWeight: 600, marginBottom: 16 }} />

            <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: t.mid, marginBottom: 6 }}>Template Pesan Pembuka</label>
            <textarea value={template} onChange={(e) => setTemplate(e.target.value)} rows={3} placeholder="mis. Halo, saya promotor SandraHub ingin bertanya mengenai..."
              style={{ width: "100%", borderRadius: 10, border: `1px solid ${t.line}`, background: t.sub, color: t.hi, padding: "11px 13px", fontSize: 13.5, fontFamily: "inherit", resize: "vertical", marginBottom: 14 }} />

            {previewLink && (
              <a href={previewLink} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: "#128C4A", textDecoration: "none", marginBottom: 14 }}>
                <WhatsAppIcon size={15} /> Pratinjau &amp; uji coba tautan
              </a>
            )}

            {err && (
              <div style={{ marginBottom: 14, display: "flex", gap: 9, padding: "10px 13px", borderRadius: 10, background: t.redBg, border: `1px solid ${t.redBd}` }}>
                <AlertTriangle size={15} color={t.red} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 12.5, color: t.hi }}>{err}</span>
              </div>
            )}
            {saved && !err && (
              <div style={{ marginBottom: 14, display: "flex", gap: 9, padding: "10px 13px", borderRadius: 10, background: t.greenBg, border: `1px solid ${t.greenBd}` }}>
                <CheckCircle2 size={15} color={t.green} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 12.5, color: t.hi }}>Pengaturan tersimpan.</span>
              </div>
            )}

            <button className="pts-btn" onClick={save} disabled={busy || serverAdmin === null}
              style={{ background: "#25D366", color: "#fff", boxShadow: t.sm, opacity: (busy || serverAdmin === null) ? .7 : 1 }}>
              {busy || serverAdmin === null ? <Loader2 size={15} className="spin" /> : <Save size={15} />} Simpan Pengaturan
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════ VALIDASI GA (D+2) ══════════════════════════
   Upload data usage GA (MSISDN + waktu usage) → cocokkan dengan pts_sale
   dalam rentang 3 hari dari waktu tagging → set status validasi. */
// Normalisasi MSISDN ringan khusus untuk pencocokan GA v2 — sama aturannya
// dengan normalizePhone di app promotor (0xxx → 62xxx, 8xxx → 62xxx),
// tapi tidak butuh detail alasan invalid, cukup boolean.
function normalizeMsisdnLite(raw) {
  let d = String(raw ?? "").replace(/[^\d]/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  const valid = /^62[0-9]{8,13}$/.test(d);
  return { normalized: d, valid };
}

/* ══════════════════════════ VALIDASI GA v2 ══════════════════════════════
   Beda total dari v1: file GA sekarang dicocokkan (organization_id + brand)
   ke outlet, lalu ke assignment promotor — bisa lintas outlet/promotor.
   File bisa berjumlah JUTAAN baris (mis. 8 juta), jadi TIDAK dimuat penuh
   ke memori — di-stream via PapaParse (worker terpisah), dicocokkan ke
   pool nomor pts_sale (kecil, cukup di-load sekali), dan HANYA baris yang
   match yang dikirim ke server. Baris yang tidak match dibuang langsung,
   tidak pernah disimpan di manapun. */
function GaValidation({ t, d, supabase, profile, isFullAdmin, period }) {
  const fileRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [fileName, setFileName] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | scanning | preview | uploading | done
  const [scanStats, setScanStats] = useState({ scanned: 0, matched: 0 });
  const [matchedRows, setMatchedRows] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null); // { done, total }
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const cancelRef = useRef(false);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const { data } = await supabase.from("pts_sale").select("ga_status,biometric_status,credited_transfer_type");
      const counts = { BELUM_TERVALIDASI: 0, TERVALIDASI: 0, TERVALIDASI_LUAR_AREA: 0, TIDAK_SESUAI_OUTLET: 0, TIDAK_DITEMUKAN: 0, MENUNGGU_MAPPING_OUTLET: 0, BIOMETRIC: 0, REGULAR: 0, same_promotor_diff_outlet: 0, diff_promotor: 0 };
      (data || []).forEach((r) => {
        counts[r.ga_status] = (counts[r.ga_status] || 0) + 1;
        if (r.biometric_status) counts[r.biometric_status] = (counts[r.biometric_status] || 0) + 1;
        if (r.credited_transfer_type) counts[r.credited_transfer_type] = (counts[r.credited_transfer_type] || 0) + 1;
      });
      setSummary(counts);
    } catch { setSummary(null); } finally { setLoadingSummary(false); }
  }, [supabase]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["ga_dt", "brand", "msisdn", "ga_branch", "organization_id", "biometric_status"],
      ["2026-07-02", "IM3", "6281234567890", "MEDAN", "OTL-MDN-014", "BIOMETRIC"],
    ]);
    ws["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "GA Raw");
    XLSX.writeFile(wb, "PTS_GA_Template_v2.xlsx");
  };

  /* Bangun satu kali per sesi upload: Set nomor yang PERNAH ditag promotor
     (bukan cuma yang belum tervalidasi — GA yang sama bisa datang lagi
     dengan koreksi biometric_status/outlet meski sebelumnya sudah
     tervalidasi). Ini pool KECIL (ribuan, bukan jutaan) — muat aman. */
  const loadPool = async () => {
    const { data, error } = await supabase.from("pts_sale").select("phone_normalized");
    if (error) throw error;
    return new Set((data || []).map((r) => r.phone_normalized));
  };

  const resetFile = () => {
    setPhase("idle"); setMatchedRows(null); setScanStats({ scanned: 0, matched: 0 });
    setFileName(""); setResult(null); if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (file) => {
    setErr(""); setResult(null); setFileName(file.name); setPhase("scanning");
    setScanStats({ scanned: 0, matched: 0 });
    cancelRef.current = false;
    try {
      const pool = await loadPool();
      const matched = [];
      let scanned = 0;
      let lastUiUpdate = 0;

      const consumeRow = (obj) => {
        scanned++;
        const msisdnRaw = obj.msisdn ?? obj.MSISDN;
        const { normalized, valid } = normalizeMsisdnLite(msisdnRaw);
        if (valid && pool.has(normalized)) {
          matched.push({
            msisdn: normalized,
            brand: String(obj.brand ?? obj.BRAND ?? "").trim().toUpperCase(),
            ga_dt: String(obj.ga_dt ?? obj.GA_DT ?? "").trim(),
            organization_id: String(obj.organization_id ?? obj.ORGANIZATION_ID ?? "").trim(),
            ga_branch: String(obj.ga_branch ?? obj.GA_BRANCH ?? "").trim(),
            biometric_status: String(obj.biometric_status ?? obj.BIOMETRIC_STATUS ?? "").trim().toUpperCase(),
          });
        }
        // Throttle re-render — cukup tiap 20rb baris atau tiap 400ms supaya
        // parser tidak menunggu React sibuk re-render tiap baris.
        const now = Date.now();
        if (scanned % 20000 === 0 || now - lastUiUpdate > 400) {
          lastUiUpdate = now;
          setScanStats({ scanned, matched: matched.length });
        }
      };

      const isCsv = /\.csv$/i.test(file.name);
      if (isCsv) {
        await new Promise((resolve, reject) => {
          Papa.parse(file, {
            header: true, skipEmptyLines: true, worker: true, chunkSize: 1024 * 1024,
            step: (res) => { if (cancelRef.current) return; consumeRow(res.data || {}); },
            complete: () => resolve(),
            error: (e) => reject(e),
          });
        });
      } else {
        // File kecil (.xlsx/.xls) — aman dimuat penuh, dipakai untuk file
        // uji coba kecil saja (Excel tidak sanggup menampung jutaan baris).
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
        json.forEach((obj) => consumeRow(obj));
      }

      setScanStats({ scanned, matched: matched.length });
      setMatchedRows(matched);
      setPhase("preview");
    } catch (e) {
      setErr("Gagal membaca file: " + (e?.message || e));
      setPhase("idle");
    }
  };

  const onPick = (e) => { const f = e.target.files?.[0]; if (f) handleFile(f); };
  const onDrop = (e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); };

  const uploadAndValidate = async () => {
    if (!matchedRows || !matchedRows.length) return;
    setPhase("uploading"); setErr(""); setResult(null);
    const chunkSize = 1500;
    const total = Math.ceil(matchedRows.length / chunkSize);
    setUploadProgress({ done: 0, total });
    try {
      let processed = 0, changed = 0;
      for (let i = 0; i < matchedRows.length; i += chunkSize) {
        const chunk = matchedRows.slice(i, i + chunkSize);
        const { data: rpcRes, error: rpcErr } = await supabase.rpc("pts_apply_ga_validation_batch_v2", { p_rows: chunk, p_source_period: period });
        if (rpcErr) throw rpcErr;
        processed += rpcRes?.processed ?? 0; changed += rpcRes?.changed ?? 0;
        setUploadProgress({ done: Math.min(total, Math.floor(i / chunkSize) + 1), total });
      }
      // Kolam mengambang: outlet yang sekarang sudah termapping bisa langsung
      // "hidup" begitu ada upload apa pun, tidak perlu menunggu file bulan itu lagi.
      const { data: sweepRes } = await supabase.rpc("pts_resweep_floating_ga_matches");
      setResult({ processed, changed, resolvedFloating: sweepRes?.resolved ?? 0, scanned: scanStats.scanned, matchedTotal: matchedRows.length });
      resetFile();
      await loadSummary();
    } catch (e) {
      setErr("Gagal memproses: " + (e?.message || e));
      setPhase("preview");
    }
  };

  const busy = phase === "scanning" || phase === "uploading";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 16px", borderRadius: 12, background: t.brandBg, border: `1px solid ${t.brandBd}`, marginBottom: 18 }}>
        <Info size={17} color={t.brand} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13.5, color: t.hi, fontWeight: 500 }}>
          Data GA <b>tidak real-time</b> — umumnya tersedia <b>D+2</b>. File bisa berisi <b>jutaan baris</b> — diproses langsung di browser Anda (tidak diunggah ke server), dan hanya nomor yang benar-benar cocok dengan pengajuan promotor yang dikirim ke database. Kepemilikan outlet ditentukan dari <b>organization_id + brand</b>, periode pencapaian mengikuti <b>ga_dt</b> (bukan tanggal pengajuan).
        </span>
      </div>

      {!isFullAdmin && (
        <div style={{ marginBottom: 16, padding: "11px 14px", borderRadius: 10, background: t.amberBg, border: `1px solid ${t.amberBd}`, fontSize: 12.5, color: t.hi }}>
          Upload &amp; validasi GA hanya dapat dilakukan oleh role <b>SPM Sumatera</b>.
        </div>
      )}

      {/* Ringkasan status */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <Stat t={t} icon={<Clock size={18} />}        label="Belum Tervalidasi GA"     value={loadingSummary ? "…" : (summary?.BELUM_TERVALIDASI ?? 0)} accent={{ fg: t.amber, bg: t.amberBg, bd: t.amberBd }} />
        <Stat t={t} icon={<CheckCircle2 size={18} />} label="Total Tervalidasi"        value={loadingSummary ? "…" : ((summary?.TERVALIDASI ?? 0) + (summary?.TERVALIDASI_LUAR_AREA ?? 0))} accent={{ fg: t.green, bg: t.greenBg, bd: t.greenBd }} />
        <Stat t={t} icon={<Radar size={18} />}         label="Tervalidasi — Luar Area"  value={loadingSummary ? "…" : (summary?.TERVALIDASI_LUAR_AREA ?? 0)} accent={{ fg: t.blue, bg: t.blueBg, bd: t.blueBd }} />
        <Stat t={t} icon={<ArrowLeftRight size={18} />} label="Pindah Outlet (Sama Promotor)" value={loadingSummary ? "…" : (summary?.same_promotor_diff_outlet ?? 0)} accent={{ fg: t.blue, bg: t.blueBg, bd: t.blueBd }} />
        <Stat t={t} icon={<ArrowLeftRight size={18} />} label="Pindah Promotor Lain"     value={loadingSummary ? "…" : (summary?.diff_promotor ?? 0)} accent={{ fg: t.mag, bg: t.magBg, bd: t.magBd }} />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <Stat t={t} icon={<Clock size={18} />}        label="Menunggu Mapping Outlet"  value={loadingSummary ? "…" : (summary?.MENUNGGU_MAPPING_OUTLET ?? 0)} accent={{ fg: t.amber, bg: t.amberBg, bd: t.amberBd }} />
        <Stat t={t} icon={<AlertTriangle size={18} />} label="Outlet Tidak Sesuai"      value={loadingSummary ? "…" : (summary?.TIDAK_SESUAI_OUTLET ?? 0)} accent={{ fg: t.mag, bg: t.magBg, bd: t.magBd }} />
        <Stat t={t} icon={<AlertTriangle size={18} />} label="Tidak Ditemukan"          value={loadingSummary ? "…" : (summary?.TIDAK_DITEMUKAN ?? 0)}   accent={{ fg: t.red, bg: t.redBg, bd: t.redBd }} />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Stat t={t} icon={<CheckCircle2 size={18} />} label="GA Biometric"     value={loadingSummary ? "…" : (summary?.BIOMETRIC ?? 0)} accent={{ fg: t.green, bg: t.greenBg, bd: t.greenBd }} />
        <Stat t={t} icon={<CheckCircle2 size={18} />} label="GA Non-Biometric" value={loadingSummary ? "…" : (summary?.REGULAR ?? 0)}   accent={{ fg: t.blue, bg: t.blueBg, bd: t.blueBd }} />
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <button className="pts-btn" onClick={downloadTemplate} style={{ background: t.card, color: t.hi, border: `1px solid ${t.line}`, boxShadow: t.sm }}><Download size={15} /> Download Template GA</button>
      </div>

      {phase === "idle" && (
        <div
          onDragOver={(e) => { if (isFullAdmin) { e.preventDefault(); setDrag(true); } }}
          onDragLeave={() => setDrag(false)}
          onDrop={isFullAdmin ? onDrop : undefined}
          onClick={() => isFullAdmin && fileRef.current?.click()}
          style={{
            border: `1.5px dashed ${drag ? t.brand : t.line}`, borderRadius: 14, padding: "34px 24px", textAlign: "center", cursor: isFullAdmin ? "pointer" : "not-allowed",
            background: drag ? t.brandBg : t.sub, transition: "all .15s", opacity: isFullAdmin ? 1 : .6,
          }}>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={onPick} disabled={!isFullAdmin} />
          <div style={{ width: 48, height: 48, borderRadius: 12, margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center", background: t.card, border: `1px solid ${t.line}`, color: t.brand }}>
            <UploadCloud size={22} />
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: t.hi }}>{fileName || "Tarik file GA (.csv untuk file besar) ke sini, atau klik untuk memilih"}</div>
          <div style={{ fontSize: 12.5, color: t.mid, marginTop: 5 }}>Kolom: ga_dt · brand · msisdn · ga_branch · organization_id · biometric_status</div>
        </div>
      )}

      {phase === "scanning" && (
        <div style={{ border: `1px solid ${t.line}`, borderRadius: 14, padding: "20px 22px", background: t.card, boxShadow: t.sm }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.hi, marginBottom: 4 }}>Memproses {fileName}</div>
          <StepProgress t={t} activeIndex={0} steps={[
            { key: "scan", label: "Memindai & mencocokkan file GA", sub: `${scanStats.scanned.toLocaleString("id-ID")} baris dipindai · ${scanStats.matched.toLocaleString("id-ID")} cocok dengan pengajuan promotor` },
            { key: "save", label: "Validasi & simpan ke database" },
          ]} />
          <div style={{ fontSize: 11.5, color: t.lo, marginTop: 6 }}>Diproses langsung di browser (web worker) — baris yang tidak cocok langsung dibuang, tidak disimpan.</div>
        </div>
      )}

      {err && <div style={{ marginTop: 16, display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: t.redBg, border: `1px solid ${t.redBd}` }}><AlertTriangle size={16} color={t.red} style={{ flexShrink: 0, marginTop: 1 }} /><span style={{ fontSize: 13, color: t.hi }}>{err}</span></div>}

      {result && (
        <div style={{ marginTop: 16, display: "flex", gap: 11, padding: "14px 16px", borderRadius: 12, background: t.greenBg, border: `1px solid ${t.greenBd}` }}>
          <CheckCircle2 size={18} color={t.green} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13.5, color: t.hi }}>
            <b>{result.scanned.toLocaleString("id-ID")} baris</b> dipindai, <b>{result.matchedTotal.toLocaleString("id-ID")}</b> cocok &amp; diproses, <b>{result.changed}</b> ada perubahan (notifikasi terkirim), <b>{result.resolvedFloating}</b> pencapaian yang sebelumnya menunggu mapping outlet kini terselesaikan.
          </div>
        </div>
      )}

      {(phase === "preview" || phase === "uploading") && matchedRows && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: t.hi }}>{scanStats.scanned.toLocaleString("id-ID")} baris dipindai</span>
              <Chip t={t} tone="green" icon={<CheckCircle2 size={12} />}>{matchedRows.length.toLocaleString("id-ID")} cocok pengajuan</Chip>
            </div>
            <div style={{ display: "flex", gap: 9 }}>
              <button className="pts-btn" onClick={resetFile} disabled={phase === "uploading"} style={{ background: t.card, color: t.mid, border: `1px solid ${t.line}` }}><X size={14} /> Batal</button>
              <button className="pts-btn" onClick={uploadAndValidate} disabled={!isFullAdmin || busy || matchedRows.length === 0} style={{ background: t.brand, color: "#fff", boxShadow: t.sm }}>
                {phase === "uploading" ? <Loader2 size={15} className="spin" /> : <UploadCloud size={15} />}
                {phase === "uploading" && uploadProgress ? ` Memproses ${uploadProgress.done}/${uploadProgress.total}` : ` Proses Validasi (${matchedRows.length.toLocaleString("id-ID")})`}
              </button>
            </div>
          </div>
          {phase === "uploading" && (
            <div style={{ marginBottom: 14, border: `1px solid ${t.line}`, borderRadius: 14, padding: "18px 20px", background: t.card, boxShadow: t.sm }}>
              <StepProgress t={t} activeIndex={1} progress={uploadProgress ? uploadProgress.done / uploadProgress.total : 0} steps={[
                { key: "scan", label: "Memindai & mencocokkan file GA" },
                { key: "save", label: "Validasi & simpan ke database", sub: uploadProgress ? `Batch ${uploadProgress.done}/${uploadProgress.total}` : undefined },
              ]} />
            </div>
          )}
          {matchedRows.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", color: t.mid, fontSize: 13, border: `1px solid ${t.line}`, borderRadius: 12 }}>
              Tidak ada nomor di file ini yang cocok dengan pengajuan promotor manapun.
            </div>
          ) : (
            <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, overflow: "hidden", boxShadow: t.sm }}>
              <div style={{ maxHeight: 320, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{["MSISDN", "Brand", "GA Date", "Organization ID", "GA Branch", "Biometric"].map((h) => <th key={h} className="pts-th">{h}</th>)}</tr></thead>
                  <tbody>
                    {matchedRows.slice(0, 300).map((r, i) => (
                      <tr key={i} className="pts-row">
                        <td className="pts-td" style={{ fontFamily: "monospace", fontWeight: 700 }}>{r.msisdn}</td>
                        <td className="pts-td">{r.brand || "—"}</td>
                        <td className="pts-td">{r.ga_dt || "—"}</td>
                        <td className="pts-td" style={{ fontFamily: "monospace", fontSize: 12 }}>{r.organization_id || "—"}</td>
                        <td className="pts-td">{r.ga_branch || "—"}</td>
                        <td className="pts-td">{r.biometric_status || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {matchedRows.length > 300 && <div style={{ padding: "8px 14px", fontSize: 11.5, color: t.mid, borderTop: `1px solid ${t.line}` }}>Menampilkan 300 dari {matchedRows.length.toLocaleString("id-ID")} baris cocok.</div>}
            </div>
          )}
        </div>
      )}
      <style>{`.spin{animation:ptsspin 1s linear infinite}@keyframes ptsspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ══════════════════════════ KLAIM NOMOR (audit transfer) ═══════════════
   Riwayat pengajuan klaim MSISDN yang sudah di-tag promotor lain — untuk
   audit/monitor admin, bukan untuk memutuskan (keputusan terima/tolak ada
   di sisi promotor yang tagging pertama kali, lewat approval center di
   app Promotor itu sendiri). ────────────────────────────────────────── */
function ClaimHistory({ t, supabase }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [statusF, setStatusF] = useState("all"); // all | pending | approved | rejected
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRes, proRes] = await Promise.all([
        supabase.from("pts_transfer_request").select("*").order("requested_at", { ascending: false }).limit(500),
        supabase.from("pts_promotor").select("id,email,full_name"),
      ]);
      const proById = new Map((proRes.data || []).map((p) => [p.id, p.full_name]));
      const proByEmail = new Map((proRes.data || []).map((p) => [(p.email || "").toLowerCase(), p.full_name]));
      const nameOf = (id, email) => (id && proById.get(id)) || proByEmail.get((email || "").toLowerCase()) || email || "—";
      setRows((reqRes.data || []).map((r) => ({
        ...r,
        from_name: nameOf(r.from_promotor_id, r.from_email),
        to_name: nameOf(r.to_promotor_id, r.to_email),
      })));
    } catch { setRows([]); } finally { setLoading(false); }
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusF !== "all" && r.status !== statusF) return false;
      if (s && !`${r.phone_normalized} ${r.from_name} ${r.to_name} ${r.to_outlet_code}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [rows, statusF, q]);

  const STATUS_LABEL = { pending: "Menunggu", approved: "Disetujui", rejected: "Ditolak", canceled: "Dibatalkan" };
  const STATUS_TONE = { pending: "amber", approved: "green", rejected: "red", canceled: "blue" };

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0, canceled: 0 };
    rows.forEach((r) => { if (c[r.status] != null) c[r.status]++; });
    return c;
  }, [rows]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 16px", borderRadius: 12, background: t.brandBg, border: `1px solid ${t.brandBd}`, marginBottom: 18 }}>
        <ArrowLeftRight size={17} color={t.brand} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13.5, color: t.hi, fontWeight: 500 }}>
          Riwayat pengajuan klaim nomor yang sudah ditagging promotor lain. Keputusan terima/tolak dilakukan oleh promotor yang tagging pertama kali (lewat approval di app Promotor) — tab ini untuk audit &amp; pemantauan.
        </span>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <Stat t={t} icon={<Clock size={18} />} label="Menunggu" value={counts.pending} accent={{ fg: t.amber, bg: t.amberBg, bd: t.amberBd }} />
        <Stat t={t} icon={<CheckCircle2 size={18} />} label="Disetujui" value={counts.approved} accent={{ fg: t.green, bg: t.greenBg, bd: t.greenBd }} />
        <Stat t={t} icon={<X size={18} />} label="Ditolak" value={counts.rejected} accent={{ fg: t.red, bg: t.redBg, bd: t.redBd }} />
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Segmented t={t} value={statusF} onChange={setStatusF} options={[
            { value: "all", label: "Semua", count: rows.length },
            { value: "pending", label: "Menunggu" },
            { value: "approved", label: "Disetujui" },
            { value: "rejected", label: "Ditolak" },
          ]} />
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: t.mid }} />
            <input className="pts-in" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nomor / nama / outlet" style={{ paddingLeft: 32, width: 240 }} />
          </div>
        </div>
        <button className="pts-btn" onClick={load} style={{ background: t.card, color: t.mid, border: `1px solid ${t.line}` }}><RefreshCw size={14} /> Muat ulang</button>
      </div>

      <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, overflow: "hidden", boxShadow: t.sm }}>
        <div style={{ overflow: "auto", maxHeight: 620 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
            <thead><tr>{["MSISDN", "Dari", "Ke", "Outlet Tujuan", "Diajukan", "Diselesaikan", "Status"].map((h) => <th key={h} className="pts-th">{h}</th>)}</tr></thead>
            <tbody>
              {loading ? (
                <tr><td className="pts-td" colSpan={7} style={{ textAlign: "center", padding: 40, color: t.mid }}><Loader2 size={20} className="spin" style={{ verticalAlign: "middle" }} /> Memuat…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td className="pts-td" colSpan={7} style={{ textAlign: "center", padding: 44, color: t.mid }}><ArrowLeftRight size={24} style={{ opacity: .5, marginBottom: 8 }} /><br />Belum ada pengajuan klaim nomor.</td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id} className="pts-row">
                  <td className="pts-td" style={{ fontFamily: "monospace", fontWeight: 700 }}>{r.phone_normalized}</td>
                  <td className="pts-td" style={{ fontWeight: 600 }}>{r.from_name}</td>
                  <td className="pts-td" style={{ fontWeight: 600 }}>{r.to_name}</td>
                  <td className="pts-td">{[r.to_outlet_code, r.to_branch].filter(Boolean).join(" / ") || "—"}</td>
                  <td className="pts-td" style={{ color: t.mid, fontSize: 12 }}>{r.requested_at ? `${fmtDate(r.requested_at)} ${fmtTime(r.requested_at)}` : "—"}</td>
                  <td className="pts-td" style={{ color: t.mid, fontSize: 12 }}>{r.resolved_at ? `${fmtDate(r.resolved_at)} ${fmtTime(r.resolved_at)}` : "—"}</td>
                  <td className="pts-td"><Chip t={t} tone={STATUS_TONE[r.status] || "blue"}>{STATUS_LABEL[r.status] || r.status}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: t.mid }}>{filtered.length} pengajuan.</div>
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
