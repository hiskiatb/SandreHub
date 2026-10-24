"use client";

/* ──────────────────────────────────────────────────────────────────────────────
   PNL_PivotSummary
   - Fixed CSV export: proper quoting, raw integer values (no abbreviation)
   - Added Excel export: formatted accounting, header styles, freeze panes
   - Uses SheetJS (xlsx) for Excel generation — no server needed
────────────────────────────────────────────────────────────────────────────── */

import React, { useState, useMemo, useEffect, useRef, useCallback, useLayoutEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import supabase from "../../../lib/supabase";
import {
  Search, Check, ChevronDown, ChevronRight, X,
  RotateCcw, Download, Calendar, BarChart3, AlertCircle,
  TrendingUp, TrendingDown, Wallet, Lock, FileSpreadsheet, Rows3,
} from "lucide-react";

// ─── Brand palette ───────────────────────────────────────────────────────────
const B = {
  teal:    "#32BCAD",
  red:     "#ED1C24",
  yellow:  "#FFCB05",
  magenta: "#C6168D",
};

const MONTHS_FULL  = ["JANUARI","FEBRUARI","MARET","APRIL","MEI","JUNI",
                      "JULI","AGUSTUS","SEPTEMBER","OKTOBER","NOVEMBER","DESEMBER"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

// ─── Rincian kategori biaya (untuk tombol "Export Detail Form") ──────────────
// Daftar ini SENGAJA disalin 1:1 dari definisi item di PNL_FormPengeluaran.jsx
// (array `defaults().opex/sdm/marketing/com`) — setiap kategori di sana
// disimpan sbg 2 kolom terpisah di tabel pnl_reports: qty_<x> (jumlah/unit)
// & price_<x> (harga satuan); nilai Rupiah kategori itu = qty_<x> * price_<x>.
// Kalau suatu saat ada kategori BARU ditambahkan di form pengeluaran, baris
// yg sepadan HARUS ditambahkan juga di sini (grup + nama kolom qty/price
// harus PERSIS sama) supaya ikut muncul di export detail ini.
const EXPENSE_CATEGORIES = [
  // ── OPEX (Infrastruktur & Operasional Kantor) ──
  { group: "OPEX", label: "Infrastruktur Gedung",   qtyCol: "qty_opex_gedung",    priceCol: "price_opex_gedung" },
  { group: "OPEX", label: "Penyewaan Kendaraan",    qtyCol: "qty_opex_kendaraan", priceCol: "price_opex_kendaraan" },
  { group: "OPEX", label: "Listrik",                qtyCol: "qty_opex_listrik",   priceCol: "price_opex_listrik" },
  { group: "OPEX", label: "Air",                    qtyCol: "qty_opex_air",       priceCol: "price_opex_air" },
  { group: "OPEX", label: "Telekomunikasi & IT",    qtyCol: "qty_opex_it",        priceCol: "price_opex_it" },
  { group: "OPEX", label: "Logistik (Gudang)",      qtyCol: "qty_opex_logistik",  priceCol: "price_opex_logistik" },
  { group: "OPEX", label: "Asuransi Aset",          qtyCol: "qty_opex_asuransi",  priceCol: "price_opex_asuransi" },
  { group: "OPEX", label: "Lain-lain Internal",     qtyCol: "qty_opex_lain",      priceCol: "price_opex_lain" },
  // ── SDM ──
  { group: "SDM", label: "Benefit BM",                  qtyCol: "qty_sdm_bm",               priceCol: "price_sdm_bm" },
  { group: "SDM", label: "Benefit TM",                  qtyCol: "qty_sdm_tm",               priceCol: "price_sdm_tm" },
  { group: "SDM", label: "Benefit Operational Manager", qtyCol: "qty_sdm_om",               priceCol: "price_sdm_om" },
  { group: "SDM", label: "Benefit GM",                  qtyCol: "qty_sdm_gm",               priceCol: "price_sdm_gm" },
  { group: "SDM", label: "Benefit HRD",                 qtyCol: "qty_sdm_hrd",              priceCol: "price_sdm_hrd" },
  { group: "SDM", label: "Benefit MIS",                 qtyCol: "qty_sdm_mis",              priceCol: "price_sdm_mis" },
  { group: "SDM", label: "Benefit SOM",                 qtyCol: "qty_sdm_som",              priceCol: "price_sdm_som" },
  { group: "SDM", label: "Benefit Finance SPV",         qtyCol: "qty_sdm_finance_spv",      priceCol: "price_sdm_finance_spv" },
  { group: "SDM", label: "Benefit Finance Staff",       qtyCol: "qty_sdm_finance_staff",    priceCol: "price_sdm_finance_staff" },
  { group: "SDM", label: "Benefit OB",                  qtyCol: "qty_sdm_ob",               priceCol: "price_sdm_ob" },
  { group: "SDM", label: "Territory Sales SPV",         qtyCol: "qty_sdm_tss",              priceCol: "price_sdm_tss" },
  { group: "SDM", label: "Benefit Admin & WH",          qtyCol: "qty_sdm_admin",            priceCol: "price_sdm_admin" },
  { group: "SDM", label: "Benefit Finance",             qtyCol: "qty_sdm_finance",          priceCol: "price_sdm_finance" },
  { group: "SDM", label: "Benefit MD",                  qtyCol: "qty_sdm_md",               priceCol: "price_sdm_md" },
  { group: "SDM", label: "Benefit Sales Support",       qtyCol: "qty_sdm_ss",               priceCol: "price_sdm_ss" },
  { group: "SDM", label: "Operasional Staff",           qtyCol: "qty_sdm_ops",              priceCol: "price_sdm_ops" },
  { group: "SDM", label: "Perjalanan Dinas",            qtyCol: "qty_sdm_dinas",            priceCol: "price_sdm_dinas" },
  { group: "SDM", label: "Benefit Sales",               qtyCol: "qty_sdm_benefit_sales",    priceCol: "price_sdm_benefit_sales" },
  { group: "SDM", label: "Benefit Non-Sales",           qtyCol: "qty_sdm_benefit_nonsales", priceCol: "price_sdm_benefit_nonsales" },
  // ── MARKETING ──
  { group: "Marketing", label: "Program Wholeseller",               qtyCol: "qty_mkt_ws",      priceCol: "price_mkt_ws" },
  { group: "Marketing", label: "Program Retail",                    qtyCol: "qty_mkt_retail",  priceCol: "price_mkt_retail" },
  { group: "Marketing", label: "Diskon / Subsidi Starter Pack",     qtyCol: "qty_mkt_starter", priceCol: "price_mkt_starter" },
  { group: "Marketing", label: "Program Event",                     qtyCol: "qty_mkt_event",   priceCol: "price_mkt_event" },
  // ── COM (Cost of Money) ──
  { group: "COM", label: "Biaya Administrasi",  qtyCol: "qty_com_admin", priceCol: "price_com_admin" },
  { group: "COM", label: "Bunga Pinjaman Bank", qtyCol: "qty_com_bunga", priceCol: "price_com_bunga" },
];

// Nama 4 grup di atas ("OPEX","SDM","Marketing","COM") SENGAJA disamakan
// persis dgn label step wizard form Pengeluaran (lihat `ITEMS` &
// `SecHero title=` di PNL_FormPengeluaran.jsx: "OPEX Branch","SDM
// Branch","Marketing","Cost of Money"/"COM") — disingkat spy kolom "Grup"
// tetap ringkas, tapi orang yg biasa isi form langsung kenal istilahnya.

// "Mkt Lain" (label-nya sendiri dinamis, diisi user di form —
// disimpan di label_mkt_lain_N, bukan nama tetap seperti kategori di atas).
const MKT_LAIN_SLOTS = Array.from({ length: 10 }, (_, i) => i + 1);

const EXPENSE_DETAIL_COLS = [
  ...EXPENSE_CATEGORIES.flatMap(c => [c.qtyCol, c.priceCol]),
  ...MKT_LAIN_SLOTS.flatMap(n => [`qty_mkt_lain_${n}`, `price_mkt_lain_${n}`, `label_mkt_lain_${n}`]),
];

// ─── Rincian sisi PENDAPATAN (produk SP/VC + Sales Fee + Rewards) ───────────
// Disalin 1:1 dari defaults().sp/vc di PNL_FormPendapatan.jsx. Tiap produk
// bisa py 2 "entry" harga (dbQty/dbRetail = Entry 1, dbQty2/dbRetail2 =
// Entry 2 — form menandainya dgn label "Entry 2") — masing2 jadi 1 baris
// terpisah di export (sama persis sptnya tampil sbg 2 baris di form).
// CATATAN PENTING: kolom "Total" utk baris SP/VC = NILAI JUAL KOTOR
// (qty × Retail), BUKAN margin/profit. Margin sebenarnya (yg dipakai utk
// Grand Total Revenue sistem) = Nilai Jual − HPP, dan HPP produk disimpan
// terpisah di tabel `pnl_hpp_prices` (bisa beda per partner/waktu, ada
// override) — bukan kolom tetap di `pnl_reports`, jadi SENGAJA tidak dicoba
// dihitung ulang di sini supaya tidak salah/approx. Baris "Total Pendapatan"
// (grand_total_revenue, berbasis margin — lihat baris itu di bawah) tetap
// jadi angka resmi; baris per-SKU di bawahnya murni utk lihat VOLUME &
// NILAI JUAL per produk per Partner/Branch/Bulan.
const REVENUE_PRODUCTS = [
  { group: "SP", label: "SP 3GB IM3",  qtyCol: "qty_sp_3gb_im3",  retailCol: "retail_sp_3gb_im3",  qty2Col: "qty_sp_3gb_im3_2",  retail2Col: "retail_sp_3gb_im3_2" },
  { group: "SP", label: "SP 0 IM3",    qtyCol: "qty_sp_0_im3",    retailCol: "retail_sp_0_im3",    qty2Col: "qty_sp_0_im3_2",    retail2Col: "retail_sp_0_im3_2" },
  { group: "SP", label: "SP KPK 3ID",  qtyCol: "qty_sp_kpk_3id",  retailCol: "retail_sp_kpk_3id",  qty2Col: "qty_sp_kpk_3id_2",  retail2Col: "retail_sp_kpk_3id_2" },
  { group: "SP", label: "SP 3GB 3ID",  qtyCol: "qty_sp_3gb_3id",  retailCol: "retail_sp_3gb_3id",  qty2Col: "qty_sp_3gb_3id_2",  retail2Col: "retail_sp_3gb_3id_2" },
  { group: "VC", label: "VC 0 IM3",        qtyCol: "qty_vc_0_im3",       retailCol: "retail_vc_0_im3",       qty2Col: "qty_vc_0_im3_2",       retail2Col: "retail_vc_0_im3_2" },
  { group: "VC", label: "VC 2.5GB",        qtyCol: "qty_vc_2_5gb",       retailCol: "retail_vc_2_5gb",       qty2Col: "qty_vc_2_5gb_2",       retail2Col: "retail_vc_2_5gb_2" },
  { group: "VC", label: "VC 3GB/30",       qtyCol: "qty_vc_3gb_30",      retailCol: "retail_vc_3gb_30",      qty2Col: "qty_vc_3gb_30_2",      retail2Col: "retail_vc_3gb_30_2" },
  { group: "VC", label: "VC 3.5GB/5D",     qtyCol: "qty_vc_3_5gb_5d",    retailCol: "retail_vc_3_5gb_5d",    qty2Col: "qty_vc_3_5gb_5d_2",    retail2Col: "retail_vc_3_5gb_5d_2" },
  { group: "VC", label: "VC 5GB/5D",       qtyCol: "qty_vc_5gb_5d",      retailCol: "retail_vc_5gb_5d",      qty2Col: "qty_vc_5gb_5d_2",      retail2Col: "retail_vc_5gb_5d_2" },
  { group: "VC", label: "VC 7GB/7D",       qtyCol: "qty_vc_7gb_7d",      retailCol: "retail_vc_7gb_7d",      qty2Col: "qty_vc_7gb_7d_2",      retail2Col: "retail_vc_7gb_7d_2" },
  { group: "VC", label: "VC FI 4GB",       qtyCol: "qty_vc_fi_4gb",      retailCol: "retail_vc_fi_4gb",      qty2Col: "qty_vc_fi_4gb_2",      retail2Col: "retail_vc_fi_4gb_2" },
  { group: "VC", label: "VC FI 1.5GB/1D",  qtyCol: "qty_vc_fi_1_5gb_1d", retailCol: "retail_vc_fi_1_5gb_1d", qty2Col: "qty_vc_fi_1_5gb_1d_2", retail2Col: "retail_vc_fi_1_5gb_1d_2" },
  { group: "VC", label: "VC FI 3GB/1D",    qtyCol: "qty_vc_fi_3gb_1d",   retailCol: "retail_vc_fi_3gb_1d",   qty2Col: "qty_vc_fi_3gb_1d_2",   retail2Col: "retail_vc_fi_3gb_1d_2" },
  { group: "VC", label: "VC FI 5GB/2D",    qtyCol: "qty_vc_fi_5gb_2d",   retailCol: "retail_vc_fi_5gb_2d",   qty2Col: "qty_vc_fi_5gb_2d_2",   retail2Col: "retail_vc_fi_5gb_2d_2" },
  { group: "VC", label: "VC FI 3GB/3D",    qtyCol: "qty_vc_fi_3gb_3d",   retailCol: "retail_vc_fi_3gb_3d",   qty2Col: "qty_vc_fi_3gb_3d_2",   retail2Col: "retail_vc_fi_3gb_3d_2" },
  { group: "VC", label: "VC FI 5GB/3D",    qtyCol: "qty_vc_fi_5gb_3d",   retailCol: "retail_vc_fi_5gb_3d",   qty2Col: "qty_vc_fi_5gb_3d_2",   retail2Col: "retail_vc_fi_5gb_3d_2" },
  { group: "VC", label: "VC FI 15GB/7D",   qtyCol: "qty_vc_fi_15gb_7d",  retailCol: "retail_vc_fi_15gb_7d",  qty2Col: "qty_vc_fi_15gb_7d_2",  retail2Col: "retail_vc_fi_15gb_7d_2" },
  { group: "VC", label: "VC 0 3ID",        qtyCol: "qty_vc_0_3id",       retailCol: "retail_vc_0_3id",       qty2Col: "qty_vc_0_3id_2",       retail2Col: "retail_vc_0_3id_2" },
];

// Komponen Pendapatan di luar produk SP/VC — nilainya LANGSUNG (bukan
// qty × harga), disalin dari field & label PERSIS yg ada di step "Sales
// Fee" & "Rewards" form Pendapatan (lihat RMAP/SumRow/SpmField di
// PNL_FormPendapatan.jsx). `col` = nama kolom di pnl_reports, `derive`
// (opsional) = transformasi sebelum ditampilkan (mis. Upfront Fee = 1.5%
// dari mobo_jual, PERSIS rumus `stats.upfront` di form — bukan nilai
// mentah mobo_jual-nya).
const REVENUE_OTHER = [
  { group: "Sales Fee", label: "Upfront Fee (1.5% × Penjualan Saldo Mobo)", col: "mobo_jual",         derive: (v) => v * 0.015 },
  { group: "Sales Fee", label: "Realtime Margin",                          col: "realtime_margin" },
  { group: "Sales Fee", label: "Back Margin",                              col: "back_margin" },
  { group: "Sales Fee", label: "SLA Monthly Fee",                          col: "sla_fee" },
  { group: "Sales Fee", label: "Tactical Program",                         col: "special_program" },
  { group: "Rewards",   label: "Champions Reward",                         col: "rewards_champions" },
  { group: "Rewards",   label: "Hadiah Lainnya",                           col: "rewards_lainnya" },
  { group: "Partner Income", label: "Partner Income",                      col: "partner_income" },
  // Info saja — TIDAK masuk ke Total Pendapatan (lihat catatan "Info saja ·
  // tidak masuk total" di form Pendapatan persis di sebelah field ini).
  { group: "Mobo (Info)", label: "Total Alokasi Mobo (tidak masuk total)", col: "mobo_modal" },
];

const REVENUE_DETAIL_COLS = [
  ...REVENUE_PRODUCTS.flatMap(p => [p.qtyCol, p.retailCol, p.qty2Col, p.retail2Col]),
  ...REVENUE_OTHER.map(r => r.col),
];

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,system-ui,sans-serif`;
const MONO = `ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace`;

// ─── Number formatters ────────────────────────────────────────────────────────
const fNum = (v) => {
  if (v === null || v === undefined || isNaN(v) || v === 0) return "—";
  const abs = Math.abs(v);
  let s;
  if (abs >= 1_000_000_000)  s = (abs / 1_000_000_000).toFixed(2) + "M";
  else if (abs >= 1_000_000) s = (abs / 1_000_000).toFixed(0) + "Jt";
  else if (abs >= 1_000)     s = (abs / 1_000).toFixed(0) + "rb";
  else                       s = abs.toFixed(0);
  return v < 0 ? "−" + s : s;
};

const fFull = (v) =>
  v == null ? "—" : `Rp ${new Intl.NumberFormat("id-ID").format(Math.abs(v))}${v < 0 ? "  (Loss)" : ""}`;

// Raw integer for export — no abbreviation, no currency symbol, safe for CSV/Excel
const fRaw = (v) => (v == null || isNaN(v)) ? 0 : Math.round(Number(v));

// CSV-safe string: wrap in quotes, escape internal quotes
const csvCell = (v) => {
  if (v === null || v === undefined) return '""';
  const s = String(v).replace(/"/g, '""');
  return `"${s}"`;
};

const STOPWORDS = new Set(["PT","CV","TBK","PERSERO","DAN","AND","THE","OF","INDONESIA","INTERNATIONAL","GROUP"]);
const abbreviatePartner = (name) => {
  if (!name) return "—";
  const cleaned = name.replace(/[().,]/g," ").replace(/\s+/g," ").trim().toUpperCase();
  const words = cleaned.split(" ").filter(w => w && !STOPWORDS.has(w));
  if (!words.length) return cleaned.slice(0, 4);
  const letters = words.map(w => w[0]).join("");
  return letters.length > 5 ? letters.slice(0, 5) : letters;
};

// ─── Design tokens ────────────────────────────────────────────────────────────
const tk = (d) => ({
  bg:      d ? "#0C0D0F" : "#F3F4F6",
  panel:   d ? "#141618" : "#FFFFFF",
  panel2:  d ? "#1C1E22" : "#F4F5F8",
  hover:   d ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.035)",
  line:    d ? "rgba(255,255,255,0.10)" : "rgba(15,18,25,0.12)",
  line2:   d ? "rgba(255,255,255,0.06)" : "rgba(15,18,25,0.07)",
  ink:     d ? "#F0F1F3" : "#10131A",
  ink2:    d ? "#CAD0DC" : "#262932",
  mute:    d ? "#A0A6B5" : "#525560",
  mute2:   d ? "#7B8090" : "#727682",
  faint:   d ? "#363C48" : "#C9CCD3",
  teal:    B.teal,
  tealBg:  d ? "rgba(50,188,173,0.14)"  : "rgba(50,188,173,0.10)",
  tealBd:  d ? "rgba(50,188,173,0.28)"  : "rgba(50,188,173,0.26)",
  tealTx:  d ? "#3FC9BA" : "#0E847A",
  red:     B.red,
  redBg:   d ? "rgba(237,28,36,0.10)" : "rgba(237,28,36,0.07)",
  redBd:   d ? "rgba(237,28,36,0.24)" : "rgba(237,28,36,0.18)",
  chipBg:    d ? "rgba(255,255,255,0.06)" : "#F0F2F6",
  chipBd:    d ? "rgba(255,255,255,0.12)" : "rgba(15,18,25,0.13)",
  chipAct:   d ? "rgba(50,188,173,0.14)"  : "rgba(50,188,173,0.12)",
  chipActBd: d ? "rgba(50,188,173,0.32)"  : "rgba(50,188,173,0.32)",
  pos:    d ? "#3CDB66" : "#108A38",
  posBg:  d ? "rgba(46,209,88,0.12)"  : "rgba(16,138,56,0.08)",
  neg:    d ? "#FF7A72" : "#B81C1C",
  negBg:  d ? "rgba(255,105,97,0.12)" : "rgba(184,28,28,0.08)",
});

// ─── Popover portal ───────────────────────────────────────────────────────────
function Pop({ anchor, open, onClose, children, w = 280, t, d }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchor?.current) return;
    const r = anchor.current.getBoundingClientRect();
    let left = r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    setPos({ top: r.bottom + 6, left });
  }, [open, anchor, w]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (ref.current?.contains(e.target) || anchor?.current?.contains(e.target)) return;
      onClose();
    };
    const k = (e) => e.key === "Escape" && onClose();
    const id = setTimeout(() => document.addEventListener("mousedown", h), 0);
    document.addEventListener("keydown", k);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open, onClose, anchor]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} style={{
      position: "fixed", top: pos.top, left: pos.left, width: w,
      background: t.panel, border: `1px solid ${t.line}`, borderRadius: 10,
      boxShadow: d ? "0 12px 36px rgba(0,0,0,0.60)" : "0 12px 36px rgba(15,18,25,0.16)",
      zIndex: 2147483646, overflow: "hidden", fontFamily: FONT, color: t.ink,
    }}>{children}</div>,
    document.body
  );
}

// ─── FilterChip ──────────────────────────────────────────────────────────────
function FilterChip({ label, options, selected, onChange, sortDir, onSort, t, d }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const btn = useRef(null);
  const active = selected.length > 0 || !!sortDir;

  const filtered = useMemo(() => options.filter(o => o.toLowerCase().includes(q.toLowerCase())), [options, q]);
  const allSel = filtered.length > 0 && filtered.every(o => selected.includes(o));
  const toggleAll = () => onChange(allSel ? selected.filter(s => !filtered.includes(s)) : [...new Set([...selected, ...filtered])]);
  const toggle = (v) => onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]);

  return (
    <>
      <button ref={btn} onClick={() => setOpen(o => !o)} style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        height: 32, padding: "0 11px", borderRadius: 8,
        border: `1px solid ${active ? t.chipActBd : t.chipBd}`,
        background: active ? t.chipAct : t.chipBg,
        color: active ? t.tealTx : t.ink2,
        fontSize: 12.5, fontWeight: 500, cursor: "pointer",
        fontFamily: FONT, letterSpacing: "-0.005em", transition: "all .14s",
      }}>
        <span style={{ color: active ? t.tealTx : t.mute, fontSize: 12 }}>{label}</span>
        {selected.length > 0
          ? <span style={{ fontWeight: 700, color: active ? t.tealTx : t.ink }}>{selected.length === 1 ? selected[0] : `${selected.length}`}</span>
          : <span style={{ color: t.mute2, fontWeight: 400 }}>Semua</span>}
        <ChevronDown size={11} strokeWidth={2} />
      </button>

      <Pop anchor={btn} open={open} onClose={() => setOpen(false)} w={272} t={t} d={d}>
        <div style={{ display: "flex", borderBottom: `1px solid ${t.line2}` }}>
          {[["asc","A→Z"],["desc","Z→A"]].map(([dir, lbl]) => {
            const on = sortDir === dir;
            return (
              <button key={dir} onClick={() => onSort(on ? null : dir)} style={{
                flex: 1, height: 32, border: "none",
                background: on ? t.chipAct : "transparent",
                color: on ? t.tealTx : t.mute,
                fontSize: 12, fontWeight: on ? 600 : 500, cursor: "pointer", fontFamily: FONT,
                borderRight: dir === "asc" ? `1px solid ${t.line2}` : "none",
              }}>{lbl}</button>
            );
          })}
        </div>
        <div style={{ padding: "7px 9px", borderBottom: `1px solid ${t.line2}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, height: 28, padding: "0 9px", background: t.panel2, border: `1px solid ${t.line}`, borderRadius: 7 }}>
            <Search size={12} color={t.mute2} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Cari ${label.toLowerCase()}…`}
              style={{ flex: 1, border: "none", background: "none", outline: "none", color: t.ink, fontSize: 12, fontFamily: FONT }} />
          </div>
        </div>
        <div style={{ maxHeight: 240, overflowY: "auto", padding: "3px 0" }}>
          <ChipRow label="Semua" sel={allSel} onClick={toggleAll} emphasize count={filtered.length} t={t} />
          {filtered.map(o => <ChipRow key={o} label={o} sel={selected.includes(o)} onClick={() => toggle(o)} t={t} />)}
          {filtered.length === 0 && <div style={{ padding: "20px 14px", textAlign: "center", color: t.mute2, fontSize: 12 }}>Tidak ada hasil</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 9px", borderTop: `1px solid ${t.line2}`, background: t.panel2 }}>
          <button onClick={() => { onChange([]); onSort(null); }} style={{ border: "none", background: "none", color: t.mute, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>Reset</button>
          <button onClick={() => setOpen(false)} style={{ height: 26, padding: "0 12px", border: `1px solid ${t.line}`, background: t.panel, borderRadius: 6, color: t.ink2, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: FONT }}>Tutup</button>
        </div>
      </Pop>
    </>
  );
}

function ChipRow({ label, sel, onClick, emphasize, count, t }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 8, width: "100%",
      padding: "6px 11px", border: "none", background: "transparent", cursor: "pointer",
      color: emphasize ? t.ink : t.ink2, fontWeight: emphasize ? 600 : 400,
      textAlign: "left", fontSize: 12.5, fontFamily: FONT,
    }}
    onMouseEnter={e => e.currentTarget.style.background = t.hover}
    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      <div style={{
        width: 14, height: 14, borderRadius: 4, flexShrink: 0,
        background: sel ? t.teal : "transparent",
        border: `1px solid ${sel ? t.teal : t.faint}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {sel && <Check size={10} strokeWidth={3} color="#fff" />}
      </div>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {count !== undefined && <span style={{ color: t.mute2, fontSize: 11, flexShrink: 0 }}>{count}</span>}
    </button>
  );
}

// ─── Month range picker ──────────────────────────────────────────────────────
function MonthRange({ available, selected, onChange, t, d }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const all = selected.length === available.length;

  const toggle = (m) => onChange(selected.includes(m) ? selected.filter(v => v !== m) : [...selected, m]);
  const setRange = (from, to) => onChange(available.slice(from, to + 1));

  return (
    <>
      <button ref={btn} onClick={() => setOpen(o => !o)} style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        height: 32, padding: "0 11px", borderRadius: 8,
        border: `1px solid ${!all ? t.chipActBd : t.chipBd}`,
        background: !all ? t.chipAct : t.chipBg,
        color: !all ? t.tealTx : t.ink2,
        fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: FONT, transition: "all .14s",
      }}>
        <Calendar size={12} strokeWidth={2} style={{ color: !all ? t.tealTx : t.mute }} />
        {all
          ? <span style={{ color: t.mute }}>{available.length} bulan</span>
          : <span style={{ fontWeight: 700 }}>{selected.length}/{available.length} bulan</span>}
        <ChevronDown size={11} strokeWidth={2} />
      </button>

      <Pop anchor={btn} open={open} onClose={() => setOpen(false)} w={296} t={t} d={d}>
        <div style={{ padding: "9px 11px 6px", borderBottom: `1px solid ${t.line2}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: t.ink }}>Pilih bulan</span>
          <div style={{ display: "flex", gap: 4 }}>
            {[
              ["YTD", () => setRange(0, available.length - 1)],
              ["Q1",  () => setRange(0, Math.min(2, available.length - 1))],
              ["H1",  () => setRange(0, Math.min(5, available.length - 1))],
            ].map(([l, fn]) => (
              <button key={l} onClick={fn} style={{
                height: 22, padding: "0 8px",
                border: `1px solid ${t.chipActBd}`, background: t.chipAct,
                borderRadius: 5, fontSize: 11, fontWeight: 600,
                color: t.tealTx, cursor: "pointer", fontFamily: FONT,
              }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ padding: "10px 11px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
          {available.map(m => {
            const sel = selected.includes(m);
            const short = MONTHS_SHORT[MONTHS_FULL.indexOf(m)];
            return (
              <button key={m} onClick={() => toggle(m)} style={{
                height: 30, border: `1px solid ${sel ? t.tealBd : t.line}`,
                background: sel ? t.tealBg : "transparent",
                color: sel ? t.tealTx : t.ink2,
                borderRadius: 6, fontSize: 12, fontWeight: sel ? 700 : 500,
                cursor: "pointer", fontFamily: FONT, transition: "all .12s",
              }}>{short}</button>
            );
          })}
        </div>
        <div style={{ padding: "6px 10px 10px", display: "flex", justifyContent: "space-between" }}>
          <button onClick={() => onChange(available)} style={{ border: "none", background: "none", color: t.mute, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>Semua</button>
          <button onClick={() => setOpen(false)} style={{
            height: 26, padding: "0 14px", border: "none",
            background: t.teal, color: "#fff",
            borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
          }}>Selesai</button>
        </div>
      </Pop>
    </>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, tone, icon: Icon, primary, t }) {
  const valColor = tone === "pos" ? t.pos : tone === "neg" ? t.neg : t.ink;
  const accentColor = primary === "red" ? B.red : primary === "teal" ? B.teal : t.faint;
  return (
    <div style={{
      padding: "16px 18px", background: t.panel,
      display: "flex", flexDirection: "column", gap: 10,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accentColor }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.mute }}>
          {label}
        </span>
        <Icon size={13} style={{ color: t.mute2 }} />
      </div>
      <div style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 20, fontWeight: 600, color: valColor, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
        {value}
      </div>
    </div>
  );
}

function TypePill({ mpc, t }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", height: 19, padding: "0 7px",
      fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
      color: t.mute, background: t.panel2,
      border: `1px solid ${t.line}`,
      borderRadius: 4, fontFamily: FONT, whiteSpace: "nowrap",
    }}>{mpc}</span>
  );
}

function Kv({ label, value, tone, t }) {
  const color = tone === "pos" ? t.pos : tone === "neg" ? t.neg : t.ink;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "2px 0" }}>
      <span style={{ fontSize: 12, color: t.mute }}>{label}</span>
      <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 12.5, color, fontWeight: tone ? 600 : 500 }}>{value}</span>
    </div>
  );
}

function Th({ children, align = "left", style, t }) {
  return (
    <th style={{
      padding: "10px 12px", textAlign: align,
      fontSize: 10.5, fontWeight: 700, letterSpacing: "0.07em",
      color: t.mute, textTransform: "uppercase",
      borderBottom: `1px solid ${t.line}`,
      background: t.panel2,
      position: "sticky", top: 0, zIndex: 1,
      ...style,
    }}>{children}</th>
  );
}

function MonthCell({ md, label, setTooltip, t, partner, grand }) {
  const empty = !md || (md.rev === 0 && md.exp === 0);
  if (empty && !partner && !grand) {
    return (
      <td style={{ padding: "9px 12px", textAlign: "right" }}>
        <span style={{ fontFamily: MONO, color: t.mute2, fontSize: 13 }}>—</span>
      </td>
    );
  }
  const rev = md?.rev ?? 0, exp = md?.exp ?? 0, pl = rev - exp;
  return (
    <td style={{
      padding: "9px 12px", textAlign: "right",
      background: partner ? t.hover : undefined,
      borderTop:    grand   ? `1px solid ${t.line}` : undefined,
      borderBottom: partner ? `1px solid ${t.line}` : undefined,
      cursor: "help",
    }}
      onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, rev, exp, label })}
      onMouseMove={e => setTooltip(tt => tt ? { ...tt, x: e.clientX, y: e.clientY } : null)}
      onMouseLeave={() => setTooltip(null)}>
      <div style={{
        fontFamily: MONO, fontVariantNumeric: "tabular-nums",
        fontSize: 13, fontWeight: partner || grand ? 700 : 500, lineHeight: 1.2,
        color: pl > 0 ? t.pos : pl < 0 ? t.neg : t.mute2,
      }}>{fNum(pl)}</div>
      <div style={{
        fontFamily: MONO, fontVariantNumeric: "tabular-nums",
        fontSize: 11, color: t.mute2, marginTop: 2, lineHeight: 1.1, fontWeight: 400,
      }}>{fNum(rev)} · {fNum(exp)}</div>
    </td>
  );
}

function YTDCell({ rev, exp, label, setTooltip, t, partner, grand }) {
  const pl = rev - exp;
  return (
    <td style={{
      padding: "9px 16px", textAlign: "right",
      background: t.tealBg,
      borderLeft: `1px solid ${t.tealBd}`,
      borderTop:    grand   ? `1px solid ${t.line}` : undefined,
      borderBottom: partner ? `1px solid ${t.line}` : undefined,
      cursor: "help",
    }}
      onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, rev, exp, label })}
      onMouseMove={e => setTooltip(tt => tt ? { ...tt, x: e.clientX, y: e.clientY } : null)}
      onMouseLeave={() => setTooltip(null)}>
      <div style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 13, fontWeight: 700, lineHeight: 1.2, color: pl > 0 ? t.pos : pl < 0 ? t.neg : t.mute2 }}>
        {fNum(pl)}
      </div>
      <div style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 11, color: t.tealTx, marginTop: 2, lineHeight: 1.1, fontWeight: 500, opacity: 0.95 }}>
        {fNum(rev)} · {fNum(exp)}
      </div>
    </td>
  );
}

function Seg({ children, active, onClick, t }) {
  return (
    <button onClick={onClick} style={{
      height: 30, padding: "0 12px", border: "none",
      background: active ? t.chipAct : "transparent",
      color: active ? t.tealTx : t.mute,
      fontSize: 12, fontWeight: active ? 600 : 500, cursor: "pointer", fontFamily: FONT, transition: "all .12s",
    }}>{children}</button>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function PNL_PivotSummary({ theme, activeYear, userRole, partnerName }) {
  const d = theme === "dark";
  const t = tk(d);

  const isMPX = userRole === "finance_mpx";
  const lockedPartner = isMPX ? (partnerName || null) : null;

  const now      = new Date();
  const curYear  = now.getFullYear().toString();
  const curMIdx  = now.getMonth();

  const availMonths = useMemo(
    () => activeYear === curYear ? MONTHS_FULL.slice(0, curMIdx + 1) : MONTHS_FULL,
    [activeYear, curYear, curMIdx]
  );

  const [raw,       setRaw]       = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [filters,   setFilters]   = useState({ partner: [], branch: [], mpc: [] });
  const [sorts,     setSorts]     = useState({ partner: null, branch: null, mpc: null });
  const [selMonths, setSelMonths] = useState(availMonths);
  const [collapsed, setCollapsed] = useState(new Set());
  const [search,    setSearch]    = useState("");
  const [tooltip,   setTooltip]   = useState(null);

  useEffect(() => { setSelMonths(availMonths); }, [availMonths]);

  useEffect(() => {
    if (!activeYear) return;
    setLoading(true); setError(null);
    (async () => {
      try {
        let query = supabase
          .from("pnl_reports")
          .select(`partner_name,branch,mpc_mp3,month,year,grand_total_revenue,grand_total_pengeluaran,is_finalized,expense_data,revenue_data,${EXPENSE_DETAIL_COLS.join(",")},${REVENUE_DETAIL_COLS.join(",")}`)
          .eq("year", activeYear);
        if (lockedPartner) query = query.eq("partner_name", lockedPartner);
        const { data, error: err } = await query;
        if (err) throw err;
        setRaw(data || []);
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [activeYear, lockedPartner]);

  const rows = useMemo(() => {
    const map = {};
    raw.forEach(r => {
      if (lockedPartner && r.partner_name !== lockedPartner) return;
      const key = `${r.partner_name}|||${r.branch}|||${r.mpc_mp3}`;
      if (!map[key]) map[key] = { partner: r.partner_name, branch: r.branch, mpc: r.mpc_mp3, months: {} };
      map[key].months[r.month.toUpperCase()] = {
        rev: Number(r.grand_total_revenue) || 0,
        exp: Number(r.grand_total_pengeluaran) || 0,
        _raw: r, // baris asli (semua kolom qty_*/price_*/expense_data) — dipakai exportDetailForm
      };
    });
    return Object.values(map);
  }, [raw, lockedPartner]);

  const opts = useMemo(() => {
    const ex = (skip) => rows.filter(r => Object.entries(filters).every(([col, sel]) => {
      if (col === skip || !sel.length) return true;
      const v = col === "partner" ? r.partner : col === "branch" ? r.branch : r.mpc;
      return sel.includes(v);
    }));
    const uniq = (arr, fn) => [...new Set(arr.map(fn))].sort();
    return {
      partner: uniq(ex("partner"), r => r.partner),
      branch:  uniq(ex("branch"),  r => r.branch),
      mpc:     uniq(ex("mpc"),     r => r.mpc),
    };
  }, [rows, filters]);

  const filteredRows = useMemo(() => {
    let list = rows.filter(r => {
      if (filters.partner.length && !filters.partner.includes(r.partner)) return false;
      if (filters.branch.length  && !filters.branch.includes(r.branch))   return false;
      if (filters.mpc.length     && !filters.mpc.includes(r.mpc))         return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(r.partner.toLowerCase().includes(q) || r.branch.toLowerCase().includes(q))) return false;
      }
      return true;
    });
    const se = Object.entries(sorts).find(([, dir]) => dir);
    if (se) {
      const [col, dir] = se;
      list = [...list].sort((a, b) => {
        const va = col === "partner" ? a.partner : col === "branch" ? a.branch : a.mpc;
        const vb = col === "partner" ? b.partner : col === "branch" ? b.branch : b.mpc;
        return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return list;
  }, [rows, filters, sorts, search]);

  const grouped = useMemo(() => {
    const g = {};
    const order = [];
    filteredRows.forEach(r => {
      if (!g[r.partner]) { g[r.partner] = { partner: r.partner, abbr: abbreviatePartner(r.partner), branches: [] }; order.push(r.partner); }
      g[r.partner].branches.push(r);
    });
    return Object.values(g);
  }, [filteredRows]);

  const activeMths = useMemo(() => availMonths.filter(m => selMonths.includes(m)), [availMonths, selMonths]);

  const ytdOf = useCallback((mData) => {
    let rev = 0, exp = 0;
    activeMths.forEach(m => { const md = mData[m]; if (md) { rev += md.rev; exp += md.exp; } });
    return { rev, exp, pl: rev - exp };
  }, [activeMths]);

  const { gtMth, gtRev, gtExp } = useMemo(() => {
    const gtMth = {};
    let gtRev = 0, gtExp = 0;
    activeMths.forEach(m => {
      let rev = 0, exp = 0;
      filteredRows.forEach(r => { const md = r.months[m]; if (md) { rev += md.rev; exp += md.exp; } });
      gtMth[m] = { rev, exp }; gtRev += rev; gtExp += exp;
    });
    return { gtMth, gtRev, gtExp };
  }, [filteredRows, activeMths]);

  const gtPL   = gtRev - gtExp;
  const margin = gtRev > 0 ? ((gtPL / gtRev) * 100).toFixed(1) + "%" : "—";

  const togglePartner = (p) => setCollapsed(s => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });
  const expandAll     = () => setCollapsed(new Set());
  const collapseAll   = () => setCollapsed(new Set(grouped.map(g => g.partner)));
  const clearAll      = () => { setFilters({ partner: [], branch: [], mpc: [] }); setSorts({ partner: null, branch: null, mpc: null }); setSelMonths(availMonths); setSearch(""); };

  const activeFilterCount = filters.partner.length + filters.branch.length + filters.mpc.length + (search ? 1 : 0);

  const fileBaseName = `PNL_${activeYear}${lockedPartner ? "_" + lockedPartner.replace(/\s+/g,"_") : ""}`;

  // ── Export CSV (fixed) ────────────────────────────────────────────────────
  // All text cells are quoted. All numeric cells written as plain integers.
  const exportCSV = () => {
    const monthCols = activeMths.flatMap(m => {
      const s = MONTHS_SHORT[MONTHS_FULL.indexOf(m)];
      return [`${s}_REV`, `${s}_EXP`, `${s}_PL`];
    });
    const headers = ["Partner","Tipe","Branch", ...monthCols, "YTD_REV","YTD_EXP","YTD_PL"];

    const lines = [headers.map(csvCell).join(",")];

    grouped.forEach(g => {
      g.branches.forEach(b => {
        const yt = ytdOf(b.months);
        const monthVals = activeMths.flatMap(m => {
          const md = b.months[m];
          const rev = md ? fRaw(md.rev) : 0;
          const exp = md ? fRaw(md.exp) : 0;
          return [rev, exp, rev - exp];
        });
        const row = [
          csvCell(b.partner),
          csvCell(b.mpc),
          csvCell(b.branch),
          ...monthVals.map(String),
          fRaw(yt.rev),
          fRaw(yt.exp),
          fRaw(yt.pl),
        ];
        lines.push(row.join(","));
      });

      // Partner subtotal row
      const pYTD = ytdOf(Object.fromEntries(
        activeMths.map(m => {
          let rev = 0, exp = 0;
          g.branches.forEach(b => { const md = b.months[m]; if (md) { rev += md.rev; exp += md.exp; } });
          return [m, { rev, exp }];
        })
      ));
      const pMonthVals = activeMths.flatMap(m => {
        let rev = 0, exp = 0;
        g.branches.forEach(b => { const md = b.months[m]; if (md) { rev += md.rev; exp += md.exp; } });
        return [fRaw(rev), fRaw(exp), fRaw(rev - exp)];
      });
      lines.push([
        csvCell(`[SUBTOTAL] ${g.partner}`),
        csvCell(""),
        csvCell(""),
        ...pMonthVals.map(String),
        fRaw(pYTD.rev),
        fRaw(pYTD.exp),
        fRaw(pYTD.pl),
      ].join(","));
    });

    // Grand total row
    const gtMonthVals = activeMths.flatMap(m => {
      const md = gtMth[m] || { rev: 0, exp: 0 };
      return [fRaw(md.rev), fRaw(md.exp), fRaw(md.rev - md.exp)];
    });
    lines.push([
      csvCell("[GRAND TOTAL]"),
      csvCell(""),
      csvCell(""),
      ...gtMonthVals.map(String),
      fRaw(gtRev),
      fRaw(gtExp),
      fRaw(gtPL),
    ].join(","));

    // BOM for Excel UTF-8 compatibility
    const bom = "\uFEFF";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bom + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" }));
    a.download = `${fileBaseName}.csv`;
    a.click();
  };

  // ── Export Excel (new) ────────────────────────────────────────────────────
  const exportXLSX = () => {
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Detail pivot ─────────────────────────────────────────────
    const idrFmt  = '#,##0;(#,##0);"-"';   // accounting, negative in parens, zero as dash
    const pctFmt  = '0.0%';

    const monthCols = activeMths.flatMap(m => {
      const s = MONTHS_SHORT[MONTHS_FULL.indexOf(m)];
      return [`${s} Rev`, `${s} Exp`, `${s} P&L`];
    });

    // Header row 1: month group labels (spanning 3 cols each)
    const hdr1 = ["Partner","Tipe","Branch"];
    activeMths.forEach(m => { hdr1.push(m, "", ""); });
    hdr1.push("YTD","","");

    // Header row 2: sub-labels
    const hdr2 = ["Partner","Tipe","Branch", ...monthCols, "YTD Rev","YTD Exp","YTD P&L"];

    const aoa = [hdr1, hdr2];
    const dataStartRow = 3; // 1-indexed (rows 1,2 = headers)

    // Track row indices for grand-total formula range
    const branchRows = []; // row indices (1-indexed) of detail rows

    grouped.forEach(g => {
      g.branches.forEach(b => {
        const rowData = [b.partner, b.mpc, b.branch];
        activeMths.forEach(m => {
          const md = b.months[m];
          rowData.push(md ? fRaw(md.rev) : null);
          rowData.push(md ? fRaw(md.exp) : null);
          rowData.push(md ? fRaw(md.rev - md.exp) : null);
        });
        const yt = ytdOf(b.months);
        rowData.push(fRaw(yt.rev), fRaw(yt.exp), fRaw(yt.pl));
        aoa.push(rowData);
        branchRows.push(aoa.length);
      });

      // Partner subtotal
      const subRow = [`[Subtotal] ${g.partner}`, "", ""];
      activeMths.forEach(m => {
        let rev = 0, exp = 0;
        g.branches.forEach(b => { const md = b.months[m]; if (md) { rev += md.rev; exp += md.exp; } });
        subRow.push(fRaw(rev), fRaw(exp), fRaw(rev - exp));
      });
      const pYTD = ytdOf(Object.fromEntries(
        activeMths.map(m => {
          let rev = 0, exp = 0;
          g.branches.forEach(b => { const md = b.months[m]; if (md) { rev += md.rev; exp += md.exp; } });
          return [m, { rev, exp }];
        })
      ));
      subRow.push(fRaw(pYTD.rev), fRaw(pYTD.exp), fRaw(pYTD.pl));
      aoa.push(subRow);
    });

    // Grand total
    const gtRow = ["GRAND TOTAL", "", ""];
    activeMths.forEach(m => {
      const md = gtMth[m] || { rev: 0, exp: 0 };
      gtRow.push(fRaw(md.rev), fRaw(md.exp), fRaw(md.rev - md.exp));
    });
    gtRow.push(fRaw(gtRev), fRaw(gtExp), fRaw(gtPL));
    aoa.push(gtRow);

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // ── Column widths ─────────────────────────────────────────────────────
    const colWidths = [
      { wch: 36 }, // Partner
      { wch: 10 }, // Tipe
      { wch: 28 }, // Branch
    ];
    activeMths.forEach(() => { colWidths.push({ wch: 16 }, { wch: 16 }, { wch: 16 }); });
    colWidths.push({ wch: 18 }, { wch: 18 }, { wch: 18 });
    ws["!cols"] = colWidths;

    // ── Freeze panes (freeze row 1+2 and col A-C) ─────────────────────────
    ws["!freeze"] = { xSplit: 3, ySplit: 2 };

    // ── Apply number format & styles to data cells ────────────────────────
    const totalCols = 3 + activeMths.length * 3 + 3;
    const numericStartCol = 3; // 0-indexed col D

    for (let ri = 1; ri < aoa.length; ri++) { // skip header row 0
      const row = aoa[ri];
      for (let ci = numericStartCol; ci < totalCols; ci++) {
        const cellAddr = XLSX.utils.encode_cell({ r: ri, c: ci });
        if (!ws[cellAddr]) ws[cellAddr] = { t: "n", v: 0 };
        if (ws[cellAddr].t === "n") {
          ws[cellAddr].z = idrFmt;
        }
      }
    }

    // ── Row height hints (SheetJS sets via !rows) ─────────────────────────
    ws["!rows"] = aoa.map((_, i) => ({ hpt: i < 2 ? 28 : 20 }));

    XLSX.utils.book_append_sheet(wb, ws, "Detail");

    // ── Sheet 2: Summary KPI ──────────────────────────────────────────────
    const summaryAoa = [
      ["P&L Summary Report"],
      [`Tahun: ${activeYear}`],
      [`Dicetak: ${new Date().toLocaleDateString("id-ID", { day:"2-digit", month:"long", year:"numeric" })}`],
      [],
      ["Metrik","Nilai"],
      ["Total Pendapatan (YTD)", fRaw(gtRev)],
      ["Total Pengeluaran (YTD)", fRaw(gtExp)],
      ["Net P&L (YTD)", fRaw(gtPL)],
      ["Margin (%)", gtRev > 0 ? gtPL / gtRev : 0],
      [],
      ["Total Partner", grouped.length],
      ["Total Branch", filteredRows.length],
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
    wsSummary["!cols"] = [{ wch: 32 }, { wch: 22 }];

    // Format numeric cells on summary sheet
    [[5,1],[6,1],[7,1]].forEach(([r,c]) => {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (wsSummary[addr]) wsSummary[addr].z = idrFmt;
    });
    // Margin as percentage
    const marginAddr = XLSX.utils.encode_cell({ r: 8, c: 1 });
    if (wsSummary[marginAddr]) wsSummary[marginAddr].z = pctFmt;

    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    XLSX.writeFile(wb, `${fileBaseName}.xlsx`);
  };

  // ── Export Detail Form (BARU) ───────────────────────────────────────────
  // Beda dari exportCSV/exportXLSX di atas (yg formatnya "lebar" — 1 baris
  // per Partner/Branch, kolom per bulan, cuma total REV & EXP) — export ini
  // "tidy"/panjang: 1 BARIS per Partner × Branch × Bulan × KATEGORI, utk
  // KEDUA sisi Pendapatan (SP/VC per produk, Sales Fee, Rewards, Partner
  // Income) MAUPUN Pengeluaran (semua kategori tetap form Pengeluaran +
  // "Lain-lain" dinamis) — persis rincian yg diisi SPV di kedua form itu
  // (lihat REVENUE_PRODUCTS/REVENUE_OTHER & EXPENSE_CATEGORIES di atas file
  // ini). Tujuannya supaya gampang di-Pivot Table sendiri di Excel: tinggal
  // drag "Bulan"/"Partner"/"Branch"/"Kategori" ke Rows/Columns & "Total" ke
  // Values — mis. mau lihat "Jan, Infrastruktur Gedung, per Branch, per
  // Partner" tinggal filter+pivot kolom2 itu, tidak perlu nulis formula.
  // CATATAN: baris per-SKU SP/VC pakai NILAI JUAL KOTOR (qty × Retail),
  // bukan margin/profit — margin sebenarnya butuh tabel HPP terpisah
  // (`pnl_hpp_prices`, bisa beda per partner/waktu), jadi sengaja tidak
  // dihitung ulang di sini spy tidak salah/approx. Baris "Total Pendapatan"
  // (berbasis margin, angka resmi sistem) tetap disertakan apa adanya.
  // Sheet 1 "Detail" (tidy/panjang, lihat komentar di atas) DAN Sheet 2
  // "Flat" (BARU — 1 baris per Partner/Branch/Bulan, SEMUA kategori TETAP
  // sudah jadi kolom sendiri2, dijejerkan ke samping — tidak perlu bikin
  // Pivot Table lagi utk sekadar lihat semuanya sekaligus; cuma kategori yg
  // namanya DINAMIS/bebas-isi-sendiri (SP/VC Custom, Mkt Lain, SDM Custom)
  // yg digabung jadi 1 kolom total per baris di sini — karena tidak punya
  // 1 nama kolom tetap yg sama di semua baris, rinciannya TETAP lengkap di
  // sheet "Detail").
  const DETAIL_HEADERS = ["Tahun","Bln#","Bulan","Partner","Tipe MPC","Branch","Grup","Kategori","Qty","Harga Satuan","Total"];
  const FLAT_HEADERS = [
    "Tahun","Bln#","Bulan","Partner","Tipe MPC","Branch",
    "Total Pendapatan",
    ...REVENUE_PRODUCTS.map(p => p.label),
    "SP Custom (Total)", "VC Custom (Total)",
    ...REVENUE_OTHER.map(r => r.label),
    "Total Pengeluaran",
    ...EXPENSE_CATEGORIES.map(c => c.label),
    "Mkt Lain (Total)", "SDM Custom (Total)",
  ];

  const exportDetailForm = () => {
    const detailAoa = [DETAIL_HEADERS];
    const flatAoa = [FLAT_HEADERS];

    filteredRows.forEach(b => {
      activeMths.forEach(m => {
        const md = b.months[m];
        const raw = md?._raw;
        const idx = MONTHS_FULL.indexOf(m);
        const bulanShort = MONTHS_SHORT[idx];
        const base = [activeYear, idx + 1, bulanShort, b.partner, b.mpc, b.branch];

        // ── Sheet "Detail": baris Total Pendapatan (ANGKA RESMI sistem, berbasis margin — lihat REVENUE_PRODUCTS utk kenapa baris per-SKU di bawah TIDAK dijumlah jadi angka ini) ──
        detailAoa.push([...base, "Pendapatan", "Total Pendapatan", "", "", fRaw(md?.rev)]);

        if (!raw) { // bulan ini tidak ada laporan tersimpan — baris flat tetap muncul (semua 0), tapi tidak ada rincian "Detail" apa pun utk di-expand
          flatAoa.push([...base, fRaw(md?.rev), ...FLAT_HEADERS.slice(7).map(() => 0)]);
          return;
        }

        const flatRow = [...base, fRaw(md.rev)];

        // ══ PENDAPATAN: SP/VC per produk (selalu dimunculkan di sheet Detail, termasuk yg 0; Entry 2 cuma dimunculkan kalau memang dipakai) — di sheet Flat, Entry 1+2 digabung jadi 1 kolom per produk ══
        REVENUE_PRODUCTS.forEach(p => {
          const qty = Number(raw[p.qtyCol]) || 0, retail = Number(raw[p.retailCol]) || 0;
          detailAoa.push([...base, p.group, p.label, qty, fRaw(retail), fRaw(qty * retail)]);
          const qty2 = Number(raw[p.qty2Col]) || 0, retail2 = Number(raw[p.retail2Col]) || 0;
          let totalProduk = qty * retail;
          if (qty2 || retail2) {
            detailAoa.push([...base, p.group, `${p.label} (Entry 2)`, qty2, fRaw(retail2), fRaw(qty2 * retail2)]);
            totalProduk += qty2 * retail2;
          }
          flatRow.push(fRaw(totalProduk));
        });

        // ── Produk SP/VC Custom (nama bebas — rinciannya di sheet Detail, totalnya digabung 1 kolom di sheet Flat) ──
        let spCustomTotal = 0;
        const spCustom = Array.isArray(raw.revenue_data?.sp_custom) ? raw.revenue_data.sp_custom : [];
        spCustom.forEach(item => {
          const qty = Number(item?.qty) || 0, retail = Number(item?.hRetail) || 0;
          const label = (item?.name || "").trim();
          if (!qty && !retail && !label) return;
          detailAoa.push([...base, "SP", label ? `${label} (Custom)` : "Produk Custom", qty, fRaw(retail), fRaw(qty * retail)]);
          spCustomTotal += qty * retail;
          const qty2 = Number(item?.qty2) || 0, retail2 = Number(item?.hRetail2) || 0;
          if (!qty2 && !retail2) return;
          detailAoa.push([...base, "SP", `${label || "Produk Custom"} (Custom, Entry 2)`, qty2, fRaw(retail2), fRaw(qty2 * retail2)]);
          spCustomTotal += qty2 * retail2;
        });
        flatRow.push(fRaw(spCustomTotal));

        let vcCustomTotal = 0;
        const vcCustom = Array.isArray(raw.revenue_data?.vc_custom) ? raw.revenue_data.vc_custom : [];
        vcCustom.forEach(item => {
          const qty = Number(item?.qty) || 0, retail = Number(item?.hRetail) || 0;
          const label = (item?.name || "").trim();
          if (!qty && !retail && !label) return;
          detailAoa.push([...base, "VC", label ? `${label} (Custom)` : "Produk Custom", qty, fRaw(retail), fRaw(qty * retail)]);
          vcCustomTotal += qty * retail;
        });
        flatRow.push(fRaw(vcCustomTotal));

        // ── Sales Fee, Rewards, Partner Income, Mobo (nilai langsung, bukan qty × harga) ──
        REVENUE_OTHER.forEach(r => {
          const rawVal = Number(raw[r.col]) || 0;
          const val = r.derive ? r.derive(rawVal) : rawVal;
          detailAoa.push([...base, r.group, r.label, "", "", fRaw(val)]);
          flatRow.push(fRaw(val));
        });

        // ══ PENGELUARAN: kategori tetap form Pengeluaran ══
        flatRow.push(fRaw(md.exp)); // Total Pengeluaran (angka resmi, sejajar dgn Total Pendapatan di atas)
        EXPENSE_CATEGORIES.forEach(c => {
          const qty = Number(raw[c.qtyCol]) || 0, price = Number(raw[c.priceCol]) || 0;
          detailAoa.push([...base, c.group, c.label, qty, fRaw(price), fRaw(qty * price)]);
          flatRow.push(fRaw(qty * price));
        });

        // ── "Mkt Lain" (label dinamis, slot 1-10) ──
        let mktLainTotal = 0;
        MKT_LAIN_SLOTS.forEach(n => {
          const qty = Number(raw[`qty_mkt_lain_${n}`]) || 0, price = Number(raw[`price_mkt_lain_${n}`]) || 0;
          const label = (raw[`label_mkt_lain_${n}`] || "").trim();
          if (!qty && !price && !label) return; // slot kosong — skip, tidak perlu baris nilai 0 tanpa nama
          detailAoa.push([...base, "Mkt Lain", label || `Lain-lain ${n}`, qty, fRaw(price), fRaw(qty * price)]);
          mktLainTotal += qty * price;
        });
        flatRow.push(fRaw(mktLainTotal));

        // ── "SDM Custom" (role tambahan bebas, disimpan di expense_data.sdm_custom) ──
        let sdmCustomTotal = 0;
        const sdmCustom = Array.isArray(raw.expense_data?.sdm_custom) ? raw.expense_data.sdm_custom : [];
        sdmCustom.forEach(item => {
          const qty = Number(item?.qty) || 0, price = Number(item?.price) || 0;
          const label = (item?.name || "").trim();
          if (!qty && !price && !label) return;
          detailAoa.push([...base, "SDM Custom", label || "Role Custom", qty, fRaw(price), fRaw(qty * price)]);
          sdmCustomTotal += qty * price;
        });
        flatRow.push(fRaw(sdmCustomTotal));

        flatAoa.push(flatRow);
      });
    });

    const wb = XLSX.utils.book_new();

    const wsDetail = XLSX.utils.aoa_to_sheet(detailAoa);
    wsDetail["!cols"] = [{ wch: 6 }, { wch: 5 }, { wch: 6 }, { wch: 28 }, { wch: 10 }, { wch: 20 }, { wch: 14 }, { wch: 30 }, { wch: 9 }, { wch: 13 }, { wch: 14 }];
    wsDetail["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, wsDetail, "Detail");

    const wsFlat = XLSX.utils.aoa_to_sheet(flatAoa);
    wsFlat["!cols"] = [{ wch: 6 }, { wch: 5 }, { wch: 6 }, { wch: 28 }, { wch: 10 }, { wch: 20 }, ...FLAT_HEADERS.slice(6).map(() => ({ wch: 15 }))];
    wsFlat["!freeze"] = { xSplit: 6, ySplit: 1 }; // freeze kolom Tahun..Branch + baris header — scroll ke kanan/bawah tetap kelihatan konteksnya
    XLSX.utils.book_append_sheet(wb, wsFlat, "Flat (Semua Kategori)");

    XLSX.writeFile(wb, `${fileBaseName}_DetailForm.xlsx`);

    return detailAoa.length - 1;
  };

  // ── Loading ──
  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 360, gap: 14, background: t.panel, borderRadius: 12, border: `1px solid ${t.line}`, fontFamily: FONT }}>
      <style>{`@keyframes pvSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}} @keyframes pvBeat{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(.88)}}`}</style>
      <div style={{ position: "relative", width: 50, height: 50 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid transparent", borderTopColor: B.teal, animation: "pvSpin 1s linear infinite" }} />
        <div style={{ position: "absolute", inset: 5, borderRadius: "50%", border: "1.5px solid transparent", borderTopColor: t.faint, animation: "pvSpin 1.7s linear infinite reverse" }} />
        <div style={{ position: "absolute", inset: 12, borderRadius: 8, background: t.tealBg, display: "flex", alignItems: "center", justifyContent: "center", animation: "pvBeat 1.8s ease-in-out infinite" }}>
          <BarChart3 size={15} color={B.teal} strokeWidth={2.2} />
        </div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 500, color: t.mute }}>Memuat data pivot…</span>
    </div>
  );

  if (error) return (
    <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "15px 18px", borderRadius: 10, background: t.panel, border: `1px solid ${t.neg}`, fontFamily: FONT }}>
      <AlertCircle size={19} color={t.neg} style={{ flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: t.neg }}>Gagal memuat data</div>
        <div style={{ fontSize: 12, color: t.mute, marginTop: 2 }}>{error}</div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: FONT, WebkitFontSmoothing: "antialiased", color: t.ink }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <div style={{ height: 18, width: 3, borderRadius: 2, background: B.teal }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: t.tealTx }}>
              Pivot Report
            </span>
            {lockedPartner && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                padding: "2px 8px", borderRadius: 4,
                background: t.tealBg, color: t.tealTx, border: `1px solid ${t.tealBd}`,
              }}>
                <Lock size={9} /> {lockedPartner}
              </span>
            )}
          </div>
          <h1 style={{ margin: 0, fontSize: "clamp(18px,3vw,22px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.15, color: t.ink }}>
            P&amp;L Pivot Summary
            <span style={{ color: t.mute, fontWeight: 400, fontSize: "0.72em", marginLeft: 9 }}>· {activeYear}</span>
          </h1>
          <div style={{ marginTop: 5, fontSize: 12.5, color: t.mute }}>
            {filteredRows.length} branch · {grouped.length} partner
          </div>
        </div>

        {/* Export buttons */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={exportCSV} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            height: 34, padding: "0 14px",
            border: `1px solid ${t.chipBd}`,
            background: t.chipBg, color: t.ink2,
            borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT,
            transition: "opacity .14s",
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.78"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
            <Download size={13} strokeWidth={2} />
            CSV
          </button>

          <button onClick={exportXLSX} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            height: 34, padding: "0 14px",
            border: `1px solid ${t.tealBd}`,
            background: t.teal, color: "#fff",
            borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
            transition: "opacity .14s",
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
            <FileSpreadsheet size={13} strokeWidth={2} />
            Export Excel
          </button>

          <button onClick={exportDetailForm} title="File Excel 2 sheet: 'Detail' (1 baris per Partner/Branch/Bulan/Kategori, siap di-Pivot Table sendiri) dan 'Flat (Semua Kategori)' (1 baris per Partner/Branch/Bulan, SEMUA kategori sudah jadi kolom berjejer — tidak perlu pivot lagi). Mencakup semua rincian Pendapatan (SP/VC/Sales Fee/Rewards) & Pengeluaran (Infrastruktur Gedung, Benefit BM, dst)." style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            height: 34, padding: "0 14px",
            border: `1px solid ${B.magenta}55`,
            background: d ? "rgba(198,22,141,0.14)" : "rgba(198,22,141,0.08)",
            color: B.magenta,
            borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
            transition: "opacity .14s",
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.82"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
            <Rows3 size={13} strokeWidth={2.2} />
            Export Detail Form
          </button>
        </div>
      </div>

      {/* Keterangan singkat ttg tombol "Export Detail Form" — sengaja dibuat
          sangat eksplisit (bukan cuma tooltip) spy tidak ada yg salah paham
          formatnya beda dari CSV/Excel biasa di atas (yg "lebar", 1 baris per
          Branch, kolom per bulan) */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 9,
        padding: "10px 13px", marginBottom: 18, borderRadius: 9,
        background: d ? "rgba(198,22,141,0.09)" : "rgba(198,22,141,0.05)",
        border: `1px solid ${B.magenta}33`,
      }}>
        <Rows3 size={14} color={B.magenta} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, lineHeight: 1.55, color: t.mute }}>
          <b style={{ color: t.ink2 }}>Export Detail Form</b> = file Excel dgn <b>2 sheet</b>. Sheet <b>Detail</b> = format &ldquo;panjang&rdquo; (1 baris per Partner, Branch, Bulan, <i>dan</i> Kategori — persis rincian yang diisi di form, grupnya pun pakai istilah yang sama dengan step di form: <b>SP/VC</b>, <b>Sales Fee</b>, <b>Rewards</b>, <b>Partner Income</b> dari form Pendapatan, serta <b>OPEX/SDM/Marketing/COM</b> dari form Pengeluaran) — cocok dipakai bikin Pivot Table sendiri di Excel untuk breakdown apa pun, tinggal drag <b>Bulan</b>/<b>Kategori</b> ke Rows/Filter dan <b>Total</b> ke Values. Sheet <b>Flat (Semua Kategori)</b> = sudah &ldquo;dijejerkan&rdquo; duluan — 1 baris per Partner/Branch/Bulan, semua kategori tetap sudah jadi kolom sendiri2 di sampingnya, tinggal dibaca langsung tanpa perlu pivot lagi (kategori yang namanya bebas/dinamis seperti &ldquo;Mkt Lain&rdquo; &amp; produk Custom digabung jadi 1 kolom total di sheet ini — rinciannya tetap lengkap di sheet Detail). Keduanya mencakup KEDUA sisi Pendapatan dan Pengeluaran, tidak ada yang terlewat. Satu catatan: baris/kolom SP/VC memakai nilai jual kotor (qty × Retail), bukan margin — margin produk butuh tabel HPP terpisah yang bisa berubah per waktu, jadi <b>Total Pendapatan</b> (berbasis margin, angka resmi sistem) tetap disertakan apa adanya di samping rincian per produknya.
        </div>
      </div>

      {/* KPI strip */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 1, marginBottom: 18,
        background: t.line, border: `1px solid ${t.line}`,
        borderRadius: 10, overflow: "hidden",
      }}>
        <KpiCard label="Pendapatan"  value={fNum(gtRev)} tone="neutral"                     icon={TrendingUp}   primary="red"     t={t} />
        <KpiCard label="Pengeluaran" value={fNum(gtExp)} tone="neutral"                     icon={TrendingDown} primary="neutral" t={t} />
        <KpiCard label="Net P&L"     value={fNum(gtPL)}  tone={gtPL >= 0 ? "pos" : "neg"}  icon={Wallet}       primary={gtPL >= 0 ? "teal" : "neutral"} t={t} />
        <KpiCard label="Margin"      value={margin}      tone={gtPL >= 0 ? "pos" : "neg"}  icon={BarChart3}    primary="neutral" t={t} />
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 11px", border: `1px solid ${t.chipBd}`, background: t.chipBg, borderRadius: 8, flex: "1 1 200px", minWidth: 180, maxWidth: 264 }}>
          <Search size={12} color={t.mute2} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari partner atau branch…"
            style={{ flex: 1, border: "none", background: "none", outline: "none", color: t.ink, fontSize: 12.5, fontFamily: FONT, minWidth: 0 }} />
          {search && <button onClick={() => setSearch("")} style={{ border: "none", background: "none", cursor: "pointer", color: t.mute, padding: 0, display: "flex" }}><X size={12} /></button>}
        </div>

        {!lockedPartner && (
          <FilterChip label="Partner" options={opts.partner} selected={filters.partner} onChange={v => setFilters(f => ({ ...f, partner: v }))} sortDir={sorts.partner} onSort={v => setSorts(s => ({ ...s, partner: v }))} t={t} d={d} />
        )}
        <FilterChip label="Branch"  options={opts.branch}  selected={filters.branch}  onChange={v => setFilters(f => ({ ...f, branch: v }))}  sortDir={sorts.branch}  onSort={v => setSorts(s => ({ ...s, branch: v }))}  t={t} d={d} />
        <FilterChip label="Tipe"    options={opts.mpc}     selected={filters.mpc}     onChange={v => setFilters(f => ({ ...f, mpc: v }))}     sortDir={sorts.mpc}     onSort={v => setSorts(s => ({ ...s, mpc: v }))}     t={t} d={d} />
        <MonthRange available={availMonths} selected={selMonths} onChange={setSelMonths} t={t} d={d} />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          {grouped.length > 0 && (
            <div style={{ display: "flex", border: `1px solid ${t.line}`, borderRadius: 8, overflow: "hidden", height: 32 }}>
              <Seg active={collapsed.size === 0} onClick={expandAll} t={t}>Buka semua</Seg>
              <Seg active={collapsed.size === grouped.length && grouped.length > 0} onClick={collapseAll} t={t}>Tutup semua</Seg>
            </div>
          )}
          {activeFilterCount > 0 && (
            <button onClick={clearAll} style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              height: 32, padding: "0 11px",
              border: `1px solid ${t.line}`,
              background: t.chipBg, color: t.mute,
              borderRadius: 8, fontSize: 12.5, cursor: "pointer", fontFamily: FONT,
              transition: "all .14s",
            }}>
              <RotateCcw size={12} strokeWidth={2} />
              Reset
              <span style={{ color: t.mute2 }}>({activeFilterCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 10, fontSize: 11.5, color: t.mute2, alignItems: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.pos }} />Profit
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.neg }} />Loss
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: B.teal, opacity: 0.7 }} />
          Kolom YTD
        </span>
        <span style={{ marginLeft: "auto", color: t.mute2, fontSize: 11 }}>
          Klik partner untuk lipat/buka · hover untuk nilai lengkap
        </span>
      </div>

      {/* Table */}
      <div style={{ border: `1px solid ${t.line}`, borderRadius: 10, background: t.panel, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 280 + 64 + activeMths.length * 90 + 110 }}>
            <colgroup>
              <col style={{ width: 272 }} />
              <col style={{ width: 60 }} />
              {activeMths.map(m => <col key={m} style={{ width: 90 }} />)}
              <col style={{ width: 112 }} />
            </colgroup>
            <thead>
              <tr>
                <Th align="left" style={{ paddingLeft: 17 }} t={t}>Branch</Th>
                <Th align="left" t={t}>Tipe</Th>
                {activeMths.map(m => (
                  <Th key={m} align="right" t={t}>
                    {MONTHS_SHORT[MONTHS_FULL.indexOf(m)].toUpperCase()}
                  </Th>
                ))}
                <Th align="right" style={{
                  paddingRight: 16,
                  color: t.tealTx,
                  background: t.tealBg,
                  borderLeft: `1px solid ${t.tealBd}`,
                }} t={t}>YTD</Th>
              </tr>
            </thead>

            <tbody>
              {grouped.length === 0 && (
                <tr>
                  <td colSpan={2 + activeMths.length + 1} style={{ padding: "72px 0", textAlign: "center", color: t.mute2, fontSize: 13.5 }}>
                    Tidak ada data untuk filter yang dipilih.
                  </td>
                </tr>
              )}

              {grouped.map((g, gi) => {
                const isC = collapsed.has(g.partner);
                const pMth = {};
                activeMths.forEach(m => {
                  let rev = 0, exp = 0;
                  g.branches.forEach(b => { const md = b.months[m]; if (md) { rev += md.rev; exp += md.exp; } });
                  pMth[m] = { rev, exp };
                });
                const pYTD = ytdOf(Object.fromEntries(activeMths.map(m => [m, pMth[m]])));
                const partnerRowBg = d ? "rgba(255,255,255,0.025)" : "rgba(15,18,25,0.025)";

                return (
                  <Fragment key={g.partner}>
                    <tr style={{ background: partnerRowBg }}>
                      <td colSpan={2} style={{
                        padding: "11px 17px",
                        borderTop: gi === 0 ? "none" : `1px solid ${t.line}`,
                        borderBottom: `1px solid ${t.line}`,
                      }}>
                        <button onClick={() => togglePartner(g.partner)} style={{
                          display: "flex", alignItems: "center", gap: 9,
                          border: "none", background: "none", cursor: "pointer",
                          color: t.ink, padding: 0, fontFamily: FONT, textAlign: "left",
                          width: "100%", minWidth: 0,
                        }}>
                          <span style={{ color: t.mute, display: "flex", flexShrink: 0 }}>
                            {isC ? <ChevronRight size={13} strokeWidth={2} /> : <ChevronDown size={13} strokeWidth={2} />}
                          </span>
                          <span style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            minWidth: 36, height: 20, padding: "0 7px",
                            fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em",
                            color: t.mute, background: t.panel2,
                            border: `1px solid ${t.line}`,
                            borderRadius: 4, flexShrink: 0,
                          }}>{g.abbr}</span>
                          <span style={{
                            fontSize: 13.5, fontWeight: 700, letterSpacing: "-0.01em", color: t.ink,
                            flex: "1 1 auto", minWidth: 0,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>{g.partner}</span>
                          <span style={{
                            display: "inline-block", padding: "1px 8px", borderRadius: 99,
                            background: t.panel2, fontSize: 10.5, fontWeight: 600,
                            color: t.mute, border: `1px solid ${t.line}`,
                            flexShrink: 0, whiteSpace: "nowrap",
                          }}>
                            {g.branches.length} branch
                          </span>
                        </button>
                      </td>
                      {activeMths.map(m => (
                        <MonthCell key={m} md={pMth[m]} label={`${g.partner} · ${m}`} setTooltip={setTooltip} t={t} partner />
                      ))}
                      <YTDCell rev={pYTD.rev} exp={pYTD.exp} label={`${g.partner} · YTD`} setTooltip={setTooltip} t={t} partner />
                    </tr>

                    {!isC && g.branches.map((b, bi) => {
                      const yt = ytdOf(b.months);
                      return (
                        <tr
                          key={b.branch + b.mpc}
                          style={{ borderBottom: bi === g.branches.length - 1 ? "none" : `1px solid ${t.line2}`, transition: "background .1s" }}
                          onMouseEnter={e => e.currentTarget.style.background = t.hover}
                          onMouseLeave={e => e.currentTarget.style.background = ""}
                        >
                          <td style={{ padding: "9px 17px 9px 26px", fontSize: 13, color: t.ink2, fontWeight: 500, minWidth: 0, overflow: "hidden" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                              <span style={{ fontFamily: MONO, fontSize: 10.5, color: t.mute, fontWeight: 600, letterSpacing: "0.04em", flexShrink: 0 }}>{g.abbr}</span>
                              <span style={{ color: t.mute2, flexShrink: 0 }}>–</span>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.branch}</span>
                            </div>
                          </td>
                          <td style={{ padding: "9px 12px" }}><TypePill mpc={b.mpc} t={t} /></td>
                          {activeMths.map(m => <MonthCell key={m} md={b.months[m]} label={`${b.branch} · ${m}`} setTooltip={setTooltip} t={t} />)}
                          <YTDCell rev={yt.rev} exp={yt.exp} label={`${b.branch} · YTD`} setTooltip={setTooltip} t={t} />
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>

            {filteredRows.length > 0 && (
              <tfoot>
                <tr style={{ background: t.panel2 }}>
                  <td colSpan={2} style={{
                    padding: "12px 17px",
                    borderTop: `2px solid ${t.line}`,
                    position: "relative",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: t.ink, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      Grand Total
                    </div>
                    <div style={{ fontSize: 11, color: t.mute, marginTop: 2 }}>
                      {filteredRows.length} branch · {grouped.length} partner
                    </div>
                  </td>
                  {activeMths.map(m => (
                    <MonthCell key={m} md={gtMth[m]} label={`Grand Total · ${m}`} setTooltip={setTooltip} t={t} grand />
                  ))}
                  <YTDCell rev={gtRev} exp={gtExp} label="Grand Total · YTD" setTooltip={setTooltip} t={t} grand />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 11.5, color: t.mute2, display: "flex", flexWrap: "wrap", gap: 12 }}>
        <span>Sumber: <span style={{ color: t.mute }}>pnl_reports</span></span>
        <span>Tahun {activeYear}</span>
        {lockedPartner && <span style={{ color: t.tealTx }}>Akses dibatasi ke {lockedPartner}</span>}
        <span>Nilai disingkat (rb · Jt · M) — hover untuk nilai lengkap</span>
      </div>

      {/* Tooltip */}
      {tooltip && typeof document !== "undefined" && createPortal(
        <div style={{
          position: "fixed",
          top: tooltip.y + 16,
          left: Math.min(tooltip.x + 12, window.innerWidth - 240),
          background: t.panel,
          border: `1px solid ${t.line}`,
          borderRadius: 9,
          padding: "11px 14px",
          zIndex: 2147483647, pointerEvents: "none",
          boxShadow: d ? "0 8px 28px rgba(0,0,0,0.60)" : "0 8px 28px rgba(15,18,25,0.16)",
          minWidth: 210, fontFamily: FONT, overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: B.teal }} />
          <div style={{ fontSize: 11, color: t.mute, marginBottom: 8, fontWeight: 500, marginTop: 4 }}>{tooltip.label}</div>
          <Kv label="Pendapatan"  value={fFull(tooltip.rev)} t={t} />
          <Kv label="Pengeluaran" value={fFull(tooltip.exp)} t={t} />
          <div style={{ height: 1, background: t.line2, margin: "6px 0" }} />
          <Kv label="Net P&L" value={fFull(tooltip.rev - tooltip.exp)} tone={tooltip.rev - tooltip.exp >= 0 ? "pos" : "neg"} t={t} />
        </div>,
        document.body
      )}
    </div>
  );
}