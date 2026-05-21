"use client";

import React, { useState, useMemo, useEffect } from "react";
import supabase from "../../../lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3, TrendingUp, TrendingDown, Download, Loader2,
  AlertCircle, Search, CheckCircle2, Clock, X,
  ArrowUpRight, ArrowDownLeft,
} from "lucide-react";

// ─── Utilities ───────────────────────────────────────────────────────────────
const idr = (v) => {
  const neg = (v || 0) < 0;
  const s = new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(Math.abs(v || 0));
  return neg ? `(${s})` : s;
};
const rto = (v) => (!isFinite(v) || !v) ? "—" : `${Number(v).toFixed(1).replace(".", ",")}%`;
const dtf = (iso) => iso
  ? new Date(iso).toLocaleString("id-ID", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    })
  : null;

const FONT_STACK = `"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", "SF Pro Text", Roboto, system-ui, sans-serif`;

// ─── Design tokens — Indosat Ooredoo Hutchison ────────────────────────────────
const mk = (d) => ({
  bg:        d ? "#0D0D0E" : "#F5F5F6",
  card:      d ? "#1A1A1D" : "#FFFFFF",
  sub:       d ? "#202024" : "#F2F2F4",
  hover:     d ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
  line:      d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.09)",
  lineSoft:  d ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
  hi:        d ? "#F2F2F3" : "#18181B",
  mid:       d ? "#8A8A96" : "#52525B",
  lo:        d ? "#4D4D58" : "#A1A1AA",
  faint:     d ? "#3A3A42" : "#D4D4D8",
  blue:      "#ED1C24",
  blueBg:    d ? "rgba(237,28,36,0.12)"  : "rgba(237,28,36,0.07)",
  blueBd:    d ? "rgba(237,28,36,0.28)"  : "rgba(237,28,36,0.20)",
  blueSoft:  d ? "rgba(237,28,36,0.06)"  : "rgba(237,28,36,0.04)",
  green:     d ? "#32BCAD" : "#1A9E90",
  greenBg:   d ? "rgba(50,188,173,0.13)" : "rgba(50,188,173,0.09)",
  greenBd:   d ? "rgba(50,188,173,0.30)" : "rgba(50,188,173,0.22)",
  amber:     d ? "#FFCB05" : "#C49A00",
  amberBg:   d ? "rgba(255,203,5,0.12)"  : "rgba(255,203,5,0.09)",
  amberBd:   d ? "rgba(255,203,5,0.28)"  : "rgba(255,203,5,0.22)",
  red:       d ? "#FF6B6B" : "#DC2626",
  redBg:     d ? "rgba(255,107,107,0.12)": "rgba(220,38,38,0.07)",
  redBd:     d ? "rgba(255,107,107,0.28)": "rgba(220,38,38,0.20)",
  magenta:   "#C6168D",
  magentaBg: d ? "rgba(198,22,141,0.12)" : "rgba(198,22,141,0.07)",
  magentaBd: d ? "rgba(198,22,141,0.28)" : "rgba(198,22,141,0.18)",
  sm: d ? "0 1px 2px rgba(0,0,0,0.55)"   : "0 1px 2px rgba(26,26,29,0.06)",
  md: d ? "0 6px 18px rgba(0,0,0,0.50)"  : "0 6px 18px rgba(26,26,29,0.09)",
  lg: d ? "0 20px 48px rgba(0,0,0,0.65)" : "0 20px 48px rgba(26,26,29,0.14)",
});

// ─── Global CSS ──────────────────────────────────────────────────────────────
const G = ({ d, t }) => (
  <style>{`
    ::-webkit-scrollbar{width:6px;height:6px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:${d ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)"};border-radius:99px}
    ::-webkit-scrollbar-thumb:hover{background:${d ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.18)"}}
    .fin-tr:hover td{background:${d ? "rgba(237,28,36,0.04)" : "rgba(237,28,36,0.025)"}!important}
    @keyframes breathe{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.92)}}
    @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
    @media(max-width:760px){
      .grid-3{grid-template-columns:1fr 1fr!important}
      .grid-2{grid-template-columns:1fr!important}
    }
    @media(max-width:540px){
      .grid-3{grid-template-columns:1fr!important}
      .tbl{overflow-x:auto;-webkit-overflow-scrolling:touch}
    }
  `}</style>
);

// ─── Calculations — includes _2 suffix items for omset & margin ──────────────
function calcR(data) {
  if (!data) return null;
  const g = (k) => Number(data[k]) || 0;

  // HardPP (HPP) per unit — pertama (prices 1)
  const hsp = {
    qty_sp_3gb_im3: 29000, qty_sp_0_im3: 10000,
    qty_sp_kpk_3id: 10000, qty_sp_3gb_3id: 29000,
  };
  const hvc = {
    qty_vc_0_im3: 300, qty_vc_2_5gb: 12600, qty_vc_3gb_30: 19500,
    qty_vc_3_5gb_5d: 13750, qty_vc_5gb_5d: 16800, qty_vc_7gb_7d: 22400,
    qty_vc_fi_4gb: 24500, qty_vc_fi_1_5gb_1d: 4500, qty_vc_fi_3gb_1d: 6600,
    qty_vc_fi_5gb_2d: 8300, qty_vc_fi_3gb_3d: 11600, qty_vc_fi_5gb_3d: 12800,
    qty_vc_fi_15gb_7d: 27900, qty_vc_0_3id: 500,
  };
  // HPP untuk item _2 (sama dengan item pertama, sesuai produk yang sama)
  const hsp2 = {
    qty_sp_3gb_im3_2: 29000, qty_sp_0_im3_2: 10000,
    qty_sp_kpk_3id_2: 10000, qty_sp_3gb_3id_2: 29000,
  };
  const hvc2 = {
    qty_vc_0_im3_2: 300, qty_vc_2_5gb_2: 12600, qty_vc_3gb_30_2: 19500,
    qty_vc_3_5gb_5d_2: 13750, qty_vc_5gb_5d_2: 16800, qty_vc_7gb_7d_2: 22400,
    qty_vc_fi_4gb_2: 24500, qty_vc_fi_1_5gb_1d_2: 4500, qty_vc_fi_3gb_1d_2: 6600,
    qty_vc_fi_5gb_2d_2: 8300, qty_vc_fi_3gb_3d_2: 11600, qty_vc_fi_5gb_3d_2: 12800,
    qty_vc_fi_15gb_7d_2: 27900, qty_vc_0_3id_2: 500,
  };

  // Pasangan [qty, retail] untuk item pertama (retail 1)
  const sd = [
    ["qty_sp_3gb_im3",  "retail_sp_3gb_im3"],
    ["qty_sp_0_im3",    "retail_sp_0_im3"],
    ["qty_sp_kpk_3id",  "retail_sp_kpk_3id"],
    ["qty_sp_3gb_3id",  "retail_sp_3gb_3id"],
  ];
  const vd = [
    ["qty_vc_0_im3",       "retail_vc_0_im3"],
    ["qty_vc_2_5gb",       "retail_vc_2_5gb"],
    ["qty_vc_3gb_30",      "retail_vc_3gb_30"],
    ["qty_vc_3_5gb_5d",    "retail_vc_3_5gb_5d"],
    ["qty_vc_5gb_5d",      "retail_vc_5gb_5d"],
    ["qty_vc_7gb_7d",      "retail_vc_7gb_7d"],
    ["qty_vc_fi_4gb",      "retail_vc_fi_4gb"],
    ["qty_vc_fi_1_5gb_1d", "retail_vc_fi_1_5gb_1d"],
    ["qty_vc_fi_3gb_1d",   "retail_vc_fi_3gb_1d"],
    ["qty_vc_fi_5gb_2d",   "retail_vc_fi_5gb_2d"],
    ["qty_vc_fi_3gb_3d",   "retail_vc_fi_3gb_3d"],
    ["qty_vc_fi_5gb_3d",   "retail_vc_fi_5gb_3d"],
    ["qty_vc_fi_15gb_7d",  "retail_vc_fi_15gb_7d"],
    ["qty_vc_0_3id",       "retail_vc_0_3id"],
  ];

  // Pasangan [qty, retail] untuk item kedua (_2)
  const sd2 = [
    ["qty_sp_3gb_im3_2",  "retail_sp_3gb_im3_2"],
    ["qty_sp_0_im3_2",    "retail_sp_0_im3_2"],
    ["qty_sp_kpk_3id_2",  "retail_sp_kpk_3id_2"],
    ["qty_sp_3gb_3id_2",  "retail_sp_3gb_3id_2"],
  ];
  const vd2 = [
    ["qty_vc_0_im3_2",       "retail_vc_0_im3_2"],
    ["qty_vc_2_5gb_2",       "retail_vc_2_5gb_2"],
    ["qty_vc_3gb_30_2",      "retail_vc_3gb_30_2"],
    ["qty_vc_3_5gb_5d_2",    "retail_vc_3_5gb_5d_2"],
    ["qty_vc_5gb_5d_2",      "retail_vc_5gb_5d_2"],
    ["qty_vc_7gb_7d_2",      "retail_vc_7gb_7d_2"],
    ["qty_vc_fi_4gb_2",      "retail_vc_fi_4gb_2"],
    ["qty_vc_fi_1_5gb_1d_2", "retail_vc_fi_1_5gb_1d_2"],
    ["qty_vc_fi_3gb_1d_2",   "retail_vc_fi_3gb_1d_2"],
    ["qty_vc_fi_5gb_2d_2",   "retail_vc_fi_5gb_2d_2"],
    ["qty_vc_fi_3gb_3d_2",   "retail_vc_fi_3gb_3d_2"],
    ["qty_vc_fi_5gb_3d_2",   "retail_vc_fi_5gb_3d_2"],
    ["qty_vc_fi_15gb_7d_2",  "retail_vc_fi_15gb_7d_2"],
    ["qty_vc_0_3id_2",       "retail_vc_0_3id_2"],
  ];

  // Omset SP: item pertama + item kedua
  const osp1 = sd.reduce((a, [q, r]) => a + g(q) * g(r), 0);
  const osp2 = sd2.reduce((a, [q, r]) => a + g(q) * g(r), 0);
  const osp  = osp1 + osp2;

  // Omset VC: item pertama + item kedua
  const ovc1 = vd.reduce((a, [q, r]) => a + g(q) * g(r), 0);
  const ovc2 = vd2.reduce((a, [q, r]) => a + g(q) * g(r), 0);
  const ovc  = ovc1 + ovc2;

  const mj  = g("mobo_jual");
  const mm  = g("mobo_modal");
  const tom = osp + ovc + mj;

  // Margin SP: item pertama + item kedua
  const msp1 = sd.reduce((a, [q, r]) => a + g(q) * (g(r) - (hsp[q] || 0)), 0);
  const msp2 = sd2.reduce((a, [q, r]) => a + g(q) * (g(r) - (hsp2[q] || 0)), 0);
  const msp  = msp1 + msp2;

  // Margin VC: item pertama + item kedua
  const mvc1 = vd.reduce((a, [q, r]) => a + g(q) * (g(r) - (hvc[q] || 0)), 0);
  const mvc2 = vd2.reduce((a, [q, r]) => a + g(q) * (g(r) - (hvc2[q] || 0)), 0);
  const mvc  = mvc1 + mvc2;

  const mmb = mj - mm;
  const tmg = msp + mvc + mmb;

  const up  = mm * 0.015;
  const smg = g("realtime_margin") + g("back_margin");
  const sla = g("sla_fee");
  const spc = g("special_program");
  const tko = up + smg + sla + spc;

  const rwc = g("rewards_champions"), rwl = g("rewards_lainnya"), pic = g("partner_income");
  const thd = rwc + rwl + pic;

  const srv = g("grand_total_revenue");
  const tpd = srv > 0 ? srv : (tmg + tko + thd);

  const cs = (ps) => ps.reduce((a, [p, q]) => a + g(p) * g(q), 0);
  const tox = cs([
    ["price_opex_gedung",    "qty_opex_gedung"],
    ["price_opex_kendaraan", "qty_opex_kendaraan"],
    ["price_opex_listrik",   "qty_opex_listrik"],
    ["price_opex_air",       "qty_opex_air"],
    ["price_opex_it",        "qty_opex_it"],
    ["price_opex_logistik",  "qty_opex_logistik"],
    ["price_opex_asuransi",  "qty_opex_asuransi"],
    ["price_opex_lain",      "qty_opex_lain"],
  ]);
  const tsd = cs([
    ["price_sdm_bm",           "qty_sdm_bm"],
    ["price_sdm_admin",        "qty_sdm_admin"],
    ["price_sdm_finance",      "qty_sdm_finance"],
    ["price_sdm_md",           "qty_sdm_md"],
    ["price_sdm_ss",           "qty_sdm_ss"],
    ["price_sdm_ops",          "qty_sdm_ops"],
    ["price_sdm_dinas",        "qty_sdm_dinas"],
    ["price_sdm_tm",           "qty_sdm_tm"],
    ["price_sdm_om",           "qty_sdm_om"],
    ["price_sdm_gm",           "qty_sdm_gm"],
    ["price_sdm_hrd",          "qty_sdm_hrd"],
    ["price_sdm_mis",          "qty_sdm_mis"],
    ["price_sdm_som",          "qty_sdm_som"],
    ["price_sdm_finance_spv",  "qty_sdm_finance_spv"],
    ["price_sdm_finance_staff","qty_sdm_finance_staff"],
    ["price_sdm_ob",           "qty_sdm_ob"],
    ["price_sdm_tss",          "qty_sdm_tss"],
  ]);
  const tmk = cs([
    ["price_mkt_ws",      "qty_mkt_ws"],
    ["price_mkt_retail",  "qty_mkt_retail"],
    ["price_mkt_event",   "qty_mkt_event"],
    ["price_mkt_lain",    "qty_mkt_lain"],
    ["price_mkt_starter", "qty_mkt_starter"],
  ]);
  const tcm = cs([
    ["price_com_admin", "qty_com_admin"],
    ["price_com_bunga", "qty_com_bunga"],
  ]);
  const pex = g("partner_expense");
  const tpg = tox + tsd + tmk + tcm + pex;
  const net = tpd - tpg;
  const p = (v) => tom ? (v / tom * 100) : 0;

  return {
    tom, osp, osp1, osp2, ovc, ovc1, ovc2, mj, mm,
    msp, msp1, msp2, mvc, mvc1, mvc2, mmb, tmg,
    up, smg, sla, spc, tko,
    rwc, rwl, pic, thd, tpd,
    tox, tsd, tmk, tcm, pex, tpg,
    net, p,
    hsp, hsp2, hvc, hvc2, sd, sd2, vd, vd2, g,
  };
}

// ─── Product display names ────────────────────────────────────────────────────
const PROD_NAMES = {
  qty_sp_3gb_im3: "SP 3GB IM3", qty_sp_0_im3: "SP 0 IM3",
  qty_sp_kpk_3id: "SP KPK 3ID", qty_sp_3gb_3id: "SP 3GB 3ID",
  qty_sp_3gb_im3_2: "SP 3GB IM3 (B)", qty_sp_0_im3_2: "SP 0 IM3 (B)",
  qty_sp_kpk_3id_2: "SP KPK 3ID (B)", qty_sp_3gb_3id_2: "SP 3GB 3ID (B)",
  qty_vc_0_im3: "VC 0 IM3", qty_vc_2_5gb: "VC 2.5GB", qty_vc_3gb_30: "VC 3GB/30",
  qty_vc_3_5gb_5d: "VC 3.5GB/5D", qty_vc_5gb_5d: "VC 5GB/5D", qty_vc_7gb_7d: "VC 7GB/7D",
  qty_vc_fi_4gb: "VC FI 4GB", qty_vc_fi_1_5gb_1d: "VC FI 1.5GB/1D",
  qty_vc_fi_3gb_1d: "VC FI 3GB/1D", qty_vc_fi_5gb_2d: "VC FI 5GB/2D",
  qty_vc_fi_3gb_3d: "VC FI 3GB/3D", qty_vc_fi_5gb_3d: "VC FI 5GB/3D",
  qty_vc_fi_15gb_7d: "VC FI 15GB/7D", qty_vc_0_3id: "VC 0 3ID",
  qty_vc_0_im3_2: "VC 0 IM3 (B)", qty_vc_2_5gb_2: "VC 2.5GB (B)", qty_vc_3gb_30_2: "VC 3GB/30 (B)",
  qty_vc_3_5gb_5d_2: "VC 3.5GB/5D (B)", qty_vc_5gb_5d_2: "VC 5GB/5D (B)", qty_vc_7gb_7d_2: "VC 7GB/7D (B)",
  qty_vc_fi_4gb_2: "VC FI 4GB (B)", qty_vc_fi_1_5gb_1d_2: "VC FI 1.5GB/1D (B)",
  qty_vc_fi_3gb_1d_2: "VC FI 3GB/1D (B)", qty_vc_fi_5gb_2d_2: "VC FI 5GB/2D (B)",
  qty_vc_fi_3gb_3d_2: "VC FI 3GB/3D (B)", qty_vc_fi_5gb_3d_2: "VC FI 5GB/3D (B)",
  qty_vc_fi_15gb_7d_2: "VC FI 15GB/7D (B)", qty_vc_0_3id_2: "VC 0 3ID (B)",
};

// ─── PDF Generator — A4 Landscape, enterprise-grade ──────────────────────────
async function makePDF(data, r, ctx) {
  // ── Load jsPDF + autoTable ─────────────────────────────────────────────────
  if (!window.jspdf) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
  if (!window.jspdf?.jsPDF?.API?.autoTable) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.3/jspdf.plugin.autotable.min.js";
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
  const { jsPDF } = window.jspdf;

  // Use landscape A4 — gives us 277 mm content width
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const PW = 297, PH = 210;
  const ML = 14, MR = 14, CW = PW - ML - MR; // 269 mm

  // ── Corporate colour system ────────────────────────────────────────────────
  const C = {
    INK:    [15,  18,  32],   // near-black
    BODY:   [30,  41,  59],   // dark body text
    META:   [71,  85, 105],   // secondary text
    RULE:   [226,232,240],    // hairline
    STRIPE: [248,250,252],    // alternate row
    HEAD:   [241,245,249],    // column header bg
    WHITE:  [255,255,255],
    // Accent
    RED:    [204, 23,  25],   // brand red
    REDBG:  [254,242,242],
    REDB:   [252,165,165],
    GRN:    [13, 118,110],    // teal-green
    GRNBG:  [240,253,250],
    GRNB:   [153,246,228],
    NAV:    [15,  42, 82],    // navy
    NAVBG:  [239,246,255],
    NAVB:   [191,219,254],
    AMB:    [180,120,  0],    // amber/draft
    AMBBG:  [255,251,235],
    AMBB:   [253,230,138],
  };

  // Helper: convert rgb array → css-like string for jsPDF
  const rgb = (a) => a; // autoTable accepts arrays directly

  // ── Formatters (never overflow: short, clean) ──────────────────────────────
  const fRp = (v) => {
    v = Number(v) || 0;
    const neg = v < 0;
    const abs = Math.abs(v);
    // abbreviate large numbers to keep cell narrow
    let s;
    if (abs >= 1_000_000_000) s = (abs / 1_000_000_000).toFixed(1).replace(".", ",") + " M";
    else if (abs >= 1_000_000) s = (abs / 1_000_000).toFixed(1).replace(".", ",") + " jt";
    else s = abs.toLocaleString("id-ID");
    return neg ? `(${s})` : s;
  };
  // Full rupiah — for totals rows where space allows
  const fRpFull = (v) => {
    v = Number(v) || 0;
    const neg = v < 0;
    const s = "Rp " + Math.abs(v).toLocaleString("id-ID", { maximumFractionDigits: 0 });
    return neg ? `(${s})` : s;
  };
  const fQty = (v) => {
    v = Number(v) || 0;
    return v ? v.toLocaleString("id-ID") : "—";
  };
  const fPct = (v) => {
    v = Number(v) || 0;
    return v ? v.toFixed(1).replace(".", ",") + "%" : "—";
  };

  // ── Meta ───────────────────────────────────────────────────────────────────
  const partner = data.partner_name || "—";
  const branch  = data.branch       || "—";
  const mpc     = data.mpc_mp3      || "—";
  const month   = ctx?.month        || "—";
  const year    = String(ctx?.year  || "");
  const gd      = (k) => Number(data[k]) || 0;

  let pageNum = 0;
  let Y = 0;

  // ── DRAW HEADER ────────────────────────────────────────────────────────────
  function drawHeader(pgTitle) {
    // top red bar
    doc.setFillColor(...C.RED);
    doc.rect(0, 0, PW, 2, "F");
    // dark band
    doc.setFillColor(...C.INK);
    doc.rect(0, 2, PW, 12, "F");
    // company
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.setTextColor(...C.WHITE);
    doc.text("SandraHub", ML, 10);
    // separator
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    doc.setTextColor(...C.META);
    doc.text("|", ML + 26, 10);
    doc.text("Laporan Laba Rugi  ·  P&L Report", ML + 30, 10);
    // right: context
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
    doc.setTextColor(...C.META);
    doc.text(`${mpc}  ·  ${partner}  ·  ${branch}  ·  ${month} ${year}`, PW - MR, 10, { align: "right" });
    // page title strip
    doc.setFillColor(...C.NAV);
    doc.rect(ML, 15.5, CW, 6, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.8);
    doc.setTextColor(...C.WHITE);
    doc.text(pgTitle, ML + 3, 19.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6);
    doc.setTextColor(200, 210, 230);
    doc.text(`Hal. ${pageNum}`, PW - MR - 2, 19.5, { align: "right" });
    Y = 24;
  }

  // ── DRAW FOOTER ────────────────────────────────────────────────────────────
  function drawFooter() {
    doc.setDrawColor(...C.RULE);
    doc.setLineWidth(0.2);
    doc.line(ML, PH - 8, PW - MR, PH - 8);
    doc.setFont("helvetica", "normal"); doc.setFontSize(5.5);
    doc.setTextColor(...C.META);
    doc.text("Rahasia — Hanya untuk keperluan internal. Dilarang disebarluaskan.", ML, PH - 4.5);
    const now = new Date().toLocaleString("id-ID", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
    doc.text(`Dicetak: ${now}`, PW - MR, PH - 4.5, { align: "right" });
  }

  // ── NEW PAGE ────────────────────────────────────────────────────────────────
  let _currentTitle = "";
  function newPage(title) {
    if (pageNum > 0) { drawFooter(); doc.addPage(); }
    pageNum++;
    _currentTitle = title || _currentTitle;
    drawHeader(_currentTitle);
  }

  // ── GUARD ──────────────────────────────────────────────────────────────────
  function guard(need) {
    if (Y + need > PH - 12) newPage();
  }

  // ── SECTION HEADER ─────────────────────────────────────────────────────────
  function secHead(label, rightVal) {
    guard(10);
    doc.setFillColor(...C.HEAD);
    doc.rect(ML, Y, CW, 7, "F");
    doc.setFillColor(...C.RED);
    doc.rect(ML, Y, 2.5, 7, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
    doc.setTextColor(...C.NAV);
    doc.text(label, ML + 5.5, Y + 4.8);
    if (rightVal !== undefined) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(7);
      doc.setTextColor(...C.NAV);
      doc.text(fRpFull(rightVal), PW - MR, Y + 4.8, { align: "right" });
    }
    Y += 7;
  }

  // ── SUB SECTION LABEL ──────────────────────────────────────────────────────
  function subHead(label) {
    guard(7);
    doc.setFillColor(...C.NAVBG);
    doc.rect(ML, Y, CW, 5.8, "F");
    doc.setDrawColor(...C.NAVB);
    doc.setLineWidth(0.15);
    doc.line(ML, Y + 5.8, ML + CW, Y + 5.8);
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5);
    doc.setTextColor(...C.NAV);
    doc.text(label, ML + 3.5, Y + 3.9);
    Y += 5.8;
  }

  // ── autoTable wrapper ──────────────────────────────────────────────────────
  // cols: [[idx, widthMM, halign], ...]
  // opts: { boldLast, subtotalRow (idx), compact }
  function tbl(head, rows, cols, opts = {}) {
    if (!rows.length) return;
    const vp = opts.compact ? 1.8 : 2.4;
    doc.autoTable({
      startY: Y,
      margin: { left: ML, right: MR },
      head: [head],
      body: rows,
      columnStyles: Object.fromEntries(
        cols.map(([i, w, a]) => [i, { cellWidth: w, halign: a || "left" }])
      ),
      styles: {
        font: "helvetica",
        fontSize: 6.5,
        textColor: C.BODY,
        overflow: "linebreak",    // wrap instead of overflow
        cellPadding: { top: vp, bottom: vp, left: 3, right: 3 },
      },
      headStyles: {
        fillColor: C.HEAD,
        textColor: C.NAV,
        fontStyle: "bold",
        fontSize: 6.2,
        lineColor: C.RULE,
        lineWidth: { bottom: 0.3, top: 0, left: 0, right: 0 },
        cellPadding: { top: 2.8, bottom: 2.8, left: 3, right: 3 },
      },
      bodyStyles: {
        lineColor: C.RULE,
        lineWidth: { bottom: 0.1, top: 0, left: 0, right: 0 },
        fillColor: C.WHITE,
      },
      alternateRowStyles: { fillColor: C.STRIPE },
      tableLineWidth: 0,
      showHead: "firstPage",
      didParseCell: (h) => {
        const ri = h.row.index;
        // Bold subtotal row(s)
        if (Array.isArray(opts.subtotalRow) ? opts.subtotalRow.includes(ri) : ri === opts.subtotalRow) {
          h.cell.styles.fontStyle   = "bold";
          h.cell.styles.fillColor   = C.NAVBG;
          h.cell.styles.textColor   = C.NAV;
          h.cell.styles.lineColor   = C.NAVB;
          h.cell.styles.lineWidth   = { bottom: 0.3, top: 0.3, left: 0, right: 0 };
          h.cell.styles.cellPadding = { top: 3, bottom: 3, left: 3, right: 3 };
        }
        // Bold last row if boldLast
        if (opts.boldLast && ri === rows.length - 1) {
          h.cell.styles.fontStyle   = "bold";
          h.cell.styles.fillColor   = C.NAVBG;
          h.cell.styles.textColor   = C.NAV;
          h.cell.styles.lineColor   = C.NAVB;
          h.cell.styles.lineWidth   = { bottom: 0.3, top: 0.3, left: 0, right: 0 };
          h.cell.styles.cellPadding = { top: 3, bottom: 3, left: 3, right: 3 };
        }
      },
    });
    Y = doc.lastAutoTable.finalY;
  }

  // ── TOTAL BAR ──────────────────────────────────────────────────────────────
  // style: "income" | "expense" | "net-p" | "net-l" | "neutral"
  function totalBar(label, val, pct, style) {
    guard(11);
    const isNet = style === "net-p" || style === "net-l";
    const h = isNet ? 12 : 9;
    let bg, fg, bd;
    if (style === "income" || style === "net-p") { bg = C.GRNBG; fg = C.GRN; bd = C.GRNB; }
    else if (style === "expense" || style === "net-l") { bg = C.REDBG; fg = C.RED; bd = C.REDB; }
    else { bg = C.NAVBG; fg = C.NAV; bd = C.NAVB; }
    doc.setFillColor(...bg);
    doc.rect(ML, Y, CW, h, "F");
    doc.setDrawColor(...bd); doc.setLineWidth(0.35);
    doc.line(ML, Y, ML + CW, Y);
    doc.line(ML, Y + h, ML + CW, Y + h);
    // left accent
    doc.setFillColor(...fg);
    doc.rect(ML, Y, 2.5, h, "F");
    // label
    const fs = isNet ? 8 : 7;
    doc.setFont("helvetica", "bold"); doc.setFontSize(fs);
    doc.setTextColor(...fg);
    doc.text(label, ML + 5, Y + h / 2 + fs * 0.19);
    // pct
    if (pct !== null && pct !== undefined) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(6);
      doc.setTextColor(...C.META);
      doc.text(fPct(pct), ML + CW * 0.62, Y + h / 2 + 6 * 0.19, { align: "right" });
    }
    // value
    doc.setFont("helvetica", "bold"); doc.setFontSize(isNet ? 9 : 7.5);
    doc.setTextColor(...fg);
    doc.text(fRpFull(val), PW - MR, Y + h / 2 + (isNet ? 9 : 7.5) * 0.19, { align: "right" });
    Y += h;
  }

  // ── COVER LINE ─────────────────────────────────────────────────────────────
  function coverLine() {
    Y += 3;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.setTextColor(...C.INK);
    doc.text(partner, ML, Y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.setTextColor(...C.META);
    doc.text(`${mpc}  ·  ${branch}  ·  Periode: ${month} ${year}`, ML, Y + 5);
    doc.setDrawColor(...C.RED); doc.setLineWidth(0.5);
    doc.line(ML, Y + 8, ML + CW, Y + 8);
    Y += 12;
  }

  const sp = (mm = 3) => { Y += mm; };

  // ──────────────────────────────────────────────────────────────────────────
  // PAGE 1 — RINGKASAN P&L
  // ──────────────────────────────────────────────────────────────────────────
  newPage("LAPORAN LABA RUGI — RINGKASAN P&L");
  coverLine();

  // Status
  const fin = data.is_finalized;
  const stamp = fin && data.finalized_at
    ? `Difinalisasi: ${dtf(data.finalized_at)}`
    : data.updated_at ? `Terakhir disimpan: ${dtf(data.updated_at)}` : "";
  doc.setFillColor(...(fin ? C.GRNBG : C.AMBBG));
  doc.rect(ML, Y, CW, 6.5, "F");
  doc.setDrawColor(...(fin ? C.GRNB : C.AMBB)); doc.setLineWidth(0.2);
  doc.rect(ML, Y, CW, 6.5, "D");
  doc.setFont("helvetica", fin ? "bold" : "normal"); doc.setFontSize(6.5);
  doc.setTextColor(...(fin ? C.GRN : C.AMB));
  doc.text(fin ? `✓  Laporan Final & Tervalidasi   —   ${stamp}` : `Draft   —   ${stamp}`, ML + 3, Y + 4.3);
  Y += 9;

  // KPI row (plain text, no box)
  const kpiItems = [
    { label: "TOTAL OMSET PENJUALAN",    val: r.tom, note: "SP Regular + Voucher + MOBO", color: C.RED },
    { label: "TOTAL PENDAPATAN",         val: r.tpd, note: "Margin + Komisi + Hadiah",    color: C.GRN },
    { label: "TOTAL BEBAN USAHA",        val: r.tpg, note: "OPEX + SDM + Mkt + COM",      color: C.META },
    { label: "LABA / RUGI BERSIH",       val: r.net, note: `${fPct(r.p(r.net))} dari Omset`, color: r.net >= 0 ? C.GRN : C.RED },
  ];
  const kW = CW / kpiItems.length;
  const kY = Y;
  kpiItems.forEach((item, i) => {
    const x = ML + i * kW;
    doc.setFillColor(...item.color);
    doc.rect(x, kY, kW - 2, 1, "F");
    doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(...C.META);
    doc.text(item.label, x, kY + 5.5);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...C.INK);
    doc.text(fRpFull(item.val), x, kY + 13);
    doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(...C.META);
    doc.text(item.note, x, kY + 17);
  });
  Y = kY + 21;
  doc.setDrawColor(...C.RULE); doc.setLineWidth(0.15);
  doc.line(ML, Y, ML + CW, Y); Y += 4;

  // Summary P&L table — merged SP (H1+H2), VC (H1+H2)
  secHead("A.  OMSET PENJUALAN", r.tom);

  // Omset summary — columns: Uraian | Omset (Rp) | % Omset
  const omsetCols = [[0, CW*0.52,"left"],[1, CW*0.28,"right"],[2, CW*0.20,"right"]];
  const omsetRows = [];
  if (r.osp) omsetRows.push(["Penjualan SP Regular", fRpFull(r.osp), fPct(r.p(r.osp))]);
  if (r.ovc) omsetRows.push(["Penjualan Voucher Fisik", fRpFull(r.ovc), fPct(r.p(r.ovc))]);
  if (r.mj)  omsetRows.push(["Penjualan Saldo MOBO", fRpFull(r.mj), fPct(r.p(r.mj))]);
  omsetRows.push(["JUMLAH OMSET PENJUALAN", fRpFull(r.tom), "100,0%"]);
  tbl(["Uraian", "Omset (IDR)", "% Omset"], omsetRows, omsetCols, { boldLast: true });
  sp(5);

  secHead("B.  STRUKTUR PENDAPATAN", r.tpd);

  // Margin
  const pendRows = [];
  if (r.msp) pendRows.push(["Margin SP Regular", fRpFull(r.msp), fPct(r.p(r.msp))]);
  if (r.mvc) pendRows.push(["Margin Voucher Fisik", fRpFull(r.mvc), fPct(r.p(r.mvc))]);
  if (r.mmb) pendRows.push(["Margin Saldo MOBO", fRpFull(r.mmb), fPct(r.p(r.mmb))]);
  pendRows.push(["Sub-total Margin Produk", fRpFull(r.tmg), fPct(r.p(r.tmg))]);
  if (r.up)  pendRows.push(["Upfront Discount (1,5% Modal MOBO)", fRpFull(r.up), fPct(r.p(r.up))]);
  if (r.smg) pendRows.push(["Sales Margin (Realtime + Back)", fRpFull(r.smg), fPct(r.p(r.smg))]);
  if (r.sla) pendRows.push(["Monthly Fee SLA", fRpFull(r.sla), fPct(r.p(r.sla))]);
  if (r.spc) pendRows.push(["Special Program", fRpFull(r.spc), fPct(r.p(r.spc))]);
  pendRows.push(["Sub-total Komisi & Insentif", fRpFull(r.tko), fPct(r.p(r.tko))]);
  if (r.rwc) pendRows.push(["Rewards Champions Club", fRpFull(r.rwc), fPct(r.p(r.rwc))]);
  if (r.rwl) pendRows.push(["Rewards Lainnya", fRpFull(r.rwl), fPct(r.p(r.rwl))]);
  if (r.pic) pendRows.push(["Partner Income", fRpFull(r.pic), fPct(r.p(r.pic))]);
  pendRows.push(["Sub-total Hadiah & Lainnya", fRpFull(r.thd), fPct(r.p(r.thd))]);

  // find subtotal indices
  const stIdxPend = pendRows.map((rr, i) => rr[0].startsWith("Sub-total") ? i : -1).filter(i => i >= 0);
  tbl(["Uraian", "Jumlah (IDR)", "% Omset"], pendRows, omsetCols, { subtotalRow: stIdxPend });
  sp(2);
  totalBar("TOTAL PENDAPATAN", r.tpd, r.p(r.tpd), "income");
  sp(5);

  secHead("C.  STRUKTUR BEBAN USAHA", r.tpg);
  const bebanRows = [];
  if (r.tox) bebanRows.push(["Beban Operasional Branch (OPEX)", fRpFull(r.tox), fPct(r.p(r.tox))]);
  if (r.tsd) bebanRows.push(["Beban Sumber Daya Manusia (SDM)", fRpFull(r.tsd), fPct(r.p(r.tsd))]);
  if (r.tmk) bebanRows.push(["Beban Marketing & Cluster Development", fRpFull(r.tmk), fPct(r.p(r.tmk))]);
  if (r.tcm) bebanRows.push(["Beban Cost of Money", fRpFull(r.tcm), fPct(r.p(r.tcm))]);
  if (r.pex) bebanRows.push(["Partner Expense", fRpFull(r.pex), fPct(r.p(r.pex))]);
  bebanRows.push(["TOTAL BEBAN USAHA", fRpFull(r.tpg), fPct(r.p(r.tpg))]);
  tbl(["Uraian", "Jumlah (IDR)", "% Omset"], bebanRows, omsetCols, { boldLast: true });
  sp(2);
  totalBar(
    r.net >= 0 ? "LABA BERSIH SEBELUM PAJAK  (Net Profit Before Tax)"
               : "RUGI BERSIH SEBELUM PAJAK  (Net Loss Before Tax)",
    r.net, r.p(r.net), r.net >= 0 ? "net-p" : "net-l"
  );

  // ──────────────────────────────────────────────────────────────────────────
  // PAGE 2 — DETAIL PENDAPATAN
  // Kolom SP/VC: Voucher | Qty | Harga Pokok | Harga Retail | Total Modal |
  //              Total Penjualan | Margin Penjualan | % Margin | Komposisi
  // ──────────────────────────────────────────────────────────────────────────
  newPage("DETAIL PENDAPATAN — RINCIAN PRODUK SP, VOUCHER & MOBO");
  coverLine();

  // Column widths for product tables (9 cols, landscape 269mm)
  // Voucher | Qty | Harga Pokok | Harga Retail | Total Modal | Total Penjualan | Margin | % Margin | Komposisi
  const prdHead = [
    "Produk", "Qty", "Harga Pokok", "Harga Retail",
    "Total Modal", "Total Penjualan", "Margin", "% Margin", "Komposisi"
  ];
  // widths sum = CW (269). Allocate proportionally
  const prdCols = [
    [0, 38, "left"],  // Produk
    [1, 16, "right"], // Qty
    [2, 26, "right"], // Harga Pokok
    [3, 26, "right"], // Harga Retail
    [4, 28, "right"], // Total Modal
    [5, 32, "right"], // Total Penjualan
    [6, 32, "right"], // Margin
    [7, 22, "right"], // % Margin
    [8, 22, "right"], // Komposisi
  ];
  // total prdCols width: 242 — leave 27mm as minWidth padding

  function buildPrdRows(pairs, hppMap, totalOmset) {
    const rows = [];
    pairs.forEach(([qk, rk]) => {
      const qty = gd(qk);
      if (!qty) return; // skip empty
      const hpp  = hppMap[qk] || 0;
      const ret  = gd(rk);
      const tMod = hpp * qty;
      const tPenj= ret * qty;
      const marg = tPenj - tMod;
      const pctM = tPenj ? marg / tPenj * 100 : 0;
      const komp = totalOmset ? tPenj / totalOmset * 100 : 0;
      rows.push([
        PROD_NAMES[qk] || qk,
        fQty(qty),
        fRp(hpp),
        fRp(ret),
        fRp(tMod),
        fRp(tPenj),
        fRp(marg),
        fPct(pctM),
        fPct(komp),
      ]);
    });
    return rows;
  }

  // SP — Harga 1
  {
    const rows = buildPrdRows(r.sd, r.hsp, r.osp);
    if (rows.length) {
      const totMod  = r.sd.reduce((a,[q])=>a+gd(q)*(r.hsp[q]||0),0);
      const totPenj = r.osp1;
      const totMarg = r.msp1;
      rows.push(["Sub-total SP Harga 1", "", "", "", fRp(totMod), fRp(totPenj), fRp(totMarg), fPct(totPenj?totMarg/totPenj*100:0), "100,0%"]);
      secHead("I-A.  STARTER PACK (SP) — Harga 1", r.osp1);
      tbl(prdHead, rows, prdCols, { boldLast: true, compact: true });
      sp(3);
    }
  }
  // SP — Harga 2
  {
    const rows = buildPrdRows(r.sd2, r.hsp2, r.osp);
    if (rows.length) {
      const totMod  = r.sd2.reduce((a,[q])=>a+gd(q)*(r.hsp2[q]||0),0);
      const totPenj = r.osp2;
      const totMarg = r.msp2;
      rows.push(["Sub-total SP Harga 2", "", "", "", fRp(totMod), fRp(totPenj), fRp(totMarg), fPct(totPenj?totMarg/totPenj*100:0), fPct(r.osp?r.osp2/r.osp*100:0)]);
      secHead("I-B.  STARTER PACK (SP) — Harga 2", r.osp2);
      tbl(prdHead, rows, prdCols, { boldLast: true, compact: true });
      sp(3);
    }
  }
  // Subtotal SP
  if (r.osp) {
    totalBar("TOTAL OMSET SP REGULAR (Harga 1 + Harga 2)", r.osp, r.p(r.osp), "neutral");
    sp(5);
  }

  // VC — Harga 1
  {
    const rows = buildPrdRows(r.vd, r.hvc, r.ovc);
    if (rows.length) {
      const totMod  = r.vd.reduce((a,[q])=>a+gd(q)*(r.hvc[q]||0),0);
      const totPenj = r.ovc1;
      const totMarg = r.mvc1;
      rows.push(["Sub-total VC Harga 1", "", "", "", fRp(totMod), fRp(totPenj), fRp(totMarg), fPct(totPenj?totMarg/totPenj*100:0), "100,0%"]);
      secHead("II-A.  VOUCHER FISIK (VC) — Harga 1", r.ovc1);
      tbl(prdHead, rows, prdCols, { boldLast: true, compact: true });
      sp(3);
    }
  }
  // VC — Harga 2
  {
    const rows = buildPrdRows(r.vd2, r.hvc2, r.ovc);
    if (rows.length) {
      const totMod  = r.vd2.reduce((a,[q])=>a+gd(q)*(r.hvc2[q]||0),0);
      const totPenj = r.ovc2;
      const totMarg = r.mvc2;
      rows.push(["Sub-total VC Harga 2", "", "", "", fRp(totMod), fRp(totPenj), fRp(totMarg), fPct(totPenj?totMarg/totPenj*100:0), fPct(r.ovc?r.ovc2/r.ovc*100:0)]);
      secHead("II-B.  VOUCHER FISIK (VC) — Harga 2", r.ovc2);
      tbl(prdHead, rows, prdCols, { boldLast: true, compact: true });
      sp(3);
    }
  }
  // Subtotal VC
  if (r.ovc) {
    totalBar("TOTAL OMSET VOUCHER FISIK (Harga 1 + Harga 2)", r.ovc, r.p(r.ovc), "neutral");
    sp(5);
  }

  // MOBO
  if (r.mj) {
    secHead("III.  SALDO MOBO (3SAKTI)", r.mj);
    tbl(
      ["Keterangan", "Modal (Rp)", "Penjualan (Rp)", "Margin (Rp)", "% Margin", "Komposisi"],
      [["Saldo 3Sakti / MOBO", fRpFull(r.mm), fRpFull(r.mj), fRpFull(r.mmb), fPct(r.mj?r.mmb/r.mj*100:0), fPct(r.p(r.mj))]],
      [[0,CW*0.28,"left"],[1,CW*0.14,"right"],[2,CW*0.14,"right"],[3,CW*0.14,"right"],[4,CW*0.12,"right"],[5,CW*0.12,"right"]]
    );
    sp(4);
  }

  // Komisi & Insentif
  {
    const komRows = [];
    if (r.up)  komRows.push(["Upfront Discount (1,5% Modal MOBO)", fRpFull(r.up),  fPct(r.tko?r.up/r.tko*100:0)]);
    if (r.smg) komRows.push(["Sales Margin (Realtime + Back Margin)", fRpFull(r.smg), fPct(r.tko?r.smg/r.tko*100:0)]);
    if (r.sla) komRows.push(["Monthly Fee SLA", fRpFull(r.sla), fPct(r.tko?r.sla/r.tko*100:0)]);
    if (r.spc) komRows.push(["Special Program", fRpFull(r.spc), fPct(r.tko?r.spc/r.tko*100:0)]);
    if (komRows.length) {
      komRows.push(["TOTAL KOMISI & INSENTIF", fRpFull(r.tko), "100,0%"]);
      secHead("IV.  KOMISI & INSENTIF", r.tko);
      tbl(["Keterangan", "Jumlah (IDR)", "% dari Total"], komRows,
        [[0,CW*0.60,"left"],[1,CW*0.25,"right"],[2,CW*0.15,"right"]],
        { boldLast: true });
      sp(4);
    }
  }
  // Hadiah
  {
    const hdRows = [];
    if (r.rwc) hdRows.push(["Rewards Champions Club", fRpFull(r.rwc), fPct(r.thd?r.rwc/r.thd*100:0)]);
    if (r.rwl) hdRows.push(["Rewards Lainnya", fRpFull(r.rwl), fPct(r.thd?r.rwl/r.thd*100:0)]);
    if (r.pic) hdRows.push(["Partner Income", fRpFull(r.pic), fPct(r.thd?r.pic/r.thd*100:0)]);
    if (hdRows.length) {
      hdRows.push(["TOTAL HADIAH & LAINNYA", fRpFull(r.thd), "100,0%"]);
      secHead("V.  HADIAH & LAINNYA", r.thd);
      tbl(["Keterangan", "Jumlah (IDR)", "% dari Total"], hdRows,
        [[0,CW*0.60,"left"],[1,CW*0.25,"right"],[2,CW*0.15,"right"]],
        { boldLast: true });
      sp(3);
    }
  }
  totalBar("TOTAL PENDAPATAN  (Margin + Komisi + Hadiah)", r.tpd, r.p(r.tpd), "income");

  // ──────────────────────────────────────────────────────────────────────────
  // PAGE 3 — DETAIL PENGELUARAN
  // Kolom: Keterangan | Jumlah | Nominal Satuan | Nominal Total | Komposisi
  // ──────────────────────────────────────────────────────────────────────────
  newPage("DETAIL BEBAN USAHA — RINCIAN PENGELUARAN");
  coverLine();

  const peHead = ["Keterangan", "Jumlah", "Nominal Satuan", "Nominal Total", "Komposisi"];
  const peCols = [
    [0, CW*0.38, "left"],
    [1, CW*0.10, "right"],
    [2, CW*0.20, "right"],
    [3, CW*0.22, "right"],
    [4, CW*0.10, "right"],
  ];

  function peRows(defs, totalGroup) {
    const rows = [];
    defs.forEach(([nm, qk, pk]) => {
      const qty = gd(qk), prc = gd(pk);
      if (!qty && !prc) return; // skip empty
      const tot = qty * prc;
      const komp = totalGroup ? tot / totalGroup * 100 : 0;
      rows.push([nm, fQty(qty), fRpFull(prc), fRpFull(tot), fPct(komp)]);
    });
    return rows;
  }

  // 1. OPEX
  {
    const defs = [
      ["Gedung / Sewa Kantor",     "qty_opex_gedung",    "price_opex_gedung"],
      ["Kendaraan",                "qty_opex_kendaraan", "price_opex_kendaraan"],
      ["Listrik",                  "qty_opex_listrik",   "price_opex_listrik"],
      ["Air",                      "qty_opex_air",       "price_opex_air"],
      ["Perangkat IT",             "qty_opex_it",        "price_opex_it"],
      ["Logistik / Pengiriman",    "qty_opex_logistik",  "price_opex_logistik"],
      ["Asuransi",                 "qty_opex_asuransi",  "price_opex_asuransi"],
      ["Lain-lain",                "qty_opex_lain",      "price_opex_lain"],
    ];
    const rows = peRows(defs, r.tox);
    if (rows.length) {
      rows.push(["Sub-total OPEX Branch", "", "", fRpFull(r.tox), fPct(r.tpg?r.tox/r.tpg*100:0)]);
      secHead("1.  BEBAN OPERASIONAL BRANCH (OPEX)", r.tox);
      tbl(peHead, rows, peCols, { boldLast: true, compact: true });
      sp(3);
    }
  }

  // 2. SDM
  {
    const defs = [
      ["Branch Manager",           "qty_sdm_bm",            "price_sdm_bm"],
      ["Admin & Warehouse",        "qty_sdm_admin",         "price_sdm_admin"],
      ["Finance",                  "qty_sdm_finance",       "price_sdm_finance"],
      ["Finance Supervisor",       "qty_sdm_finance_spv",   "price_sdm_finance_spv"],
      ["Finance Staff",            "qty_sdm_finance_staff", "price_sdm_finance_staff"],
      ["Merchandising",            "qty_sdm_md",            "price_sdm_md"],
      ["Sales Support",            "qty_sdm_ss",            "price_sdm_ss"],
      ["Staff Operasional",        "qty_sdm_ops",           "price_sdm_ops"],
      ["Perjalanan Dinas",         "qty_sdm_dinas",         "price_sdm_dinas"],
      ["Territory Manager",        "qty_sdm_tm",            "price_sdm_tm"],
      ["Operation Manager",        "qty_sdm_om",            "price_sdm_om"],
      ["General Manager",          "qty_sdm_gm",            "price_sdm_gm"],
      ["HRD",                      "qty_sdm_hrd",           "price_sdm_hrd"],
      ["MIS / IT Support",         "qty_sdm_mis",           "price_sdm_mis"],
      ["Senior Operation Manager", "qty_sdm_som",           "price_sdm_som"],
      ["Office Boy",               "qty_sdm_ob",            "price_sdm_ob"],
      ["Technical Sales Support",  "qty_sdm_tss",           "price_sdm_tss"],
    ];
    const rows = peRows(defs, r.tsd);
    if (rows.length) {
      rows.push(["Sub-total SDM Branch", "", "", fRpFull(r.tsd), fPct(r.tpg?r.tsd/r.tpg*100:0)]);
      secHead("2.  BEBAN SUMBER DAYA MANUSIA (SDM)", r.tsd);
      tbl(peHead, rows, peCols, { boldLast: true, compact: true });
      sp(3);
    }
  }

  // 3. Marketing
  {
    const defs = [
      ["Wholeseller / Distributor", "qty_mkt_ws",      "price_mkt_ws"],
      ["Retail / Outlet",          "qty_mkt_retail",  "price_mkt_retail"],
      ["Event / Promosi",          "qty_mkt_event",   "price_mkt_event"],
      ["Program Starter Pack",     "qty_mkt_starter", "price_mkt_starter"],
      ["Lainnya",                  "qty_mkt_lain",    "price_mkt_lain"],
    ];
    const rows = peRows(defs, r.tmk);
    if (rows.length) {
      rows.push(["Sub-total Marketing & Cluster", "", "", fRpFull(r.tmk), fPct(r.tpg?r.tmk/r.tpg*100:0)]);
      secHead("3.  BEBAN MARKETING & CLUSTER DEVELOPMENT", r.tmk);
      tbl(peHead, rows, peCols, { boldLast: true, compact: true });
      sp(3);
    }
  }

  // 4. Cost of Money
  {
    const defs = [
      ["Administrasi Bank", "qty_com_admin", "price_com_admin"],
      ["Bunga Pinjaman",    "qty_com_bunga", "price_com_bunga"],
    ];
    const rows = peRows(defs, r.tcm);
    if (rows.length) {
      rows.push(["Sub-total Cost of Money", "", "", fRpFull(r.tcm), fPct(r.tpg?r.tcm/r.tpg*100:0)]);
      secHead("4.  COST OF MONEY", r.tcm);
      tbl(peHead, rows, peCols, { boldLast: true, compact: true });
      sp(3);
    }
  }

  // 5. Partner Expense
  if (r.pex) {
    secHead("5.  PARTNER EXPENSE", r.pex);
    tbl(peHead,
      [
        ["Partner Expense", "—", "—", fRpFull(r.pex), "100,0%"],
        ["Sub-total Partner Expense", "", "", fRpFull(r.pex), fPct(r.tpg?r.pex/r.tpg*100:0)],
      ],
      peCols, { boldLast: true, compact: true }
    );
    sp(3);
  }

  totalBar("TOTAL BEBAN USAHA", r.tpg, r.p(r.tpg), "expense");
  sp(4);
  totalBar(
    r.net >= 0 ? "LABA BERSIH SEBELUM PAJAK  (Net Profit Before Tax)"
               : "RUGI BERSIH SEBELUM PAJAK  (Net Loss Before Tax)",
    r.net, r.p(r.net), r.net >= 0 ? "net-p" : "net-l"
  );

  drawFooter();
  doc.save(`PNL_${partner}_${branch}_${month}_${year}.pdf`.replace(/\s+/g, "_"));
}


// ─── UI primitives ───────────────────────────────────────────────────────────
const Card = ({ children, t, style = {} }) => (
  <div style={{
    borderRadius: 12, border: `1px solid ${t.line}`,
    background: t.card, boxShadow: t.sm, ...style,
  }}>{children}</div>
);

const SLabel = ({ children, icon, t }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
    {icon && <span style={{ display: "flex", color: t.blue }}>{icon}</span>}
    <span style={{
      fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
      textTransform: "uppercase", color: t.mid,
    }}>{children}</span>
  </div>
);

const MetCard = ({ label, value, sub, accent, t }) => (
  <div style={{
    padding: "18px 20px", borderRadius: 11,
    background: t.card, border: `1px solid ${t.line}`,
    display: "flex", flexDirection: "column", gap: 6,
    position: "relative", overflow: "hidden",
  }}>
    <div style={{
      position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
      background: accent,
    }} />
    <div style={{
      fontSize: 10.5, fontWeight: 600, letterSpacing: "0.09em",
      textTransform: "uppercase", color: t.lo,
    }}>{label}</div>
    <div style={{
      fontSize: "clamp(18px, 2.6vw, 22px)", fontWeight: 700,
      letterSpacing: "-0.025em", color: t.hi,
      fontVariantNumeric: "tabular-nums", lineHeight: 1.15,
    }}>{value}</div>
    <div style={{ fontSize: 11.5, color: t.mid, marginTop: 1 }}>{sub}</div>
  </div>
);

// ─── P&L Table Row ───────────────────────────────────────────────────────────
const TR = ({ label, amount, ratio, indent = 0, kind = "data", t }) => {
  const neg   = (amount || 0) < 0;
  const isSec = kind === "section",
        isSub = kind === "subtot",
        isTot = kind === "total",
        isNet = kind === "net",
        isBlank = kind === "blank";
  if (isBlank) return <tr><td colSpan={3} style={{ padding: "3px 0" }}></td></tr>;

  const bg =
    isSub ? "rgba(50,188,173,0.10)" :
    isTot || isNet ? (neg ? t.redBg : t.greenBg) :
    "transparent";

  const tc =
    isSub ? "#32BCAD" :
    isTot || isNet ? (neg ? t.red : t.green) :
    neg && !isSec ? t.red :
    isSec ? t.hi : t.hi;

  const fw = isSec || isSub || isTot || isNet ? 600 : 400;
  const fs = isSec ? 13 : isSub || isTot || isNet ? 12.5 : 12.5;
  const bt = isTot || isNet ? `1.5px solid ${neg ? t.redBd : t.greenBd}` : "none";
  const vp = isTot || isNet ? "11px 16px" : "8px 16px";

  return (
    <tr className="fin-tr" style={{ borderTop: isSec ? `1px solid ${t.line}` : "none" }}>
      <td style={{
        padding: vp, paddingLeft: 16 + indent * 16,
        fontSize: fs, fontWeight: fw, color: tc, background: bg,
        borderTop: bt, borderBottom: `1px solid ${t.lineSoft}`,
      }}>{label}</td>
      <td style={{
        padding: vp, textAlign: "right", fontSize: fs, fontWeight: fw,
        color: tc, background: bg, borderTop: bt,
        borderBottom: `1px solid ${t.lineSoft}`,
        fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
      }}>{amount !== null && amount !== undefined ? idr(amount) : ""}</td>
      <td style={{
        padding: vp, textAlign: "right",
        fontSize: isTot || isNet ? 11.5 : 11,
        fontWeight: isTot || isNet ? 600 : 400,
        color: isTot || isNet ? tc : t.lo,
        background: bg, borderTop: bt,
        borderBottom: `1px solid ${t.lineSoft}`,
        fontVariantNumeric: "tabular-nums",
      }}>{ratio !== null && ratio !== undefined ? rto(ratio) : ""}</td>
    </tr>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────
const MPX_Summary_PNL = ({ activeContext, theme }) => {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [genPdf, setGenPdf]   = useState(false);
  const [toast, setToast]     = useState({ show: false, type: "success", msg: "" });

  const d = theme === "dark";
  const t = mk(d);

  const toast$ = (type, msg) => {
    setToast({ show: true, type, msg });
    setTimeout(() => setToast((p) => ({ ...p, show: false })), 4000);
  };

  useEffect(() => {
    if (!activeContext?.mpxName || !activeContext?.branch
        || !activeContext?.month || !activeContext?.year) {
      setLoading(false); setData(null); return;
    }
    setLoading(true); setError(null);
    (async () => {
      try {
        const bq = () => supabase
          .from("pnl_reports").select("*")
          .eq("partner_name", activeContext.mpxName)
          .eq("branch", activeContext.branch)
          .eq("month", activeContext.month)
          .eq("year", String(activeContext.year));
        let db = null;
        if (activeContext.mpxType) {
          const { data: r1, error: e1 } = await bq().eq("mpc_mp3", activeContext.mpxType).maybeSingle();
          if (e1) throw e1; db = r1;
        }
        if (!db) {
          const { data: r2, error: e2 } = await bq().limit(1).maybeSingle();
          if (e2) throw e2; db = r2;
        }
        setData(db);
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [activeContext]);

  const report = useMemo(() => calcR(data), [data]);

  const handlePDF = async () => {
    if (!data || !report) return;
    setGenPdf(true);
    try {
      await makePDF(data, report, activeContext);
      toast$("success", "PDF berhasil diunduh");
    } catch (e) {
      toast$("error", "Gagal membuat PDF: " + e.message);
    } finally {
      setGenPdf(false);
    }
  };

  // ── Loading ──
  if (loading) return (
    <>
      <G d={d} t={t} />
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        minHeight: 400, gap: 14, fontFamily: FONT_STACK,
      }}>
        <div style={{ position: "relative", width: 52, height: 52 }}>
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            border: "2.5px solid transparent",
            borderTopColor: "#ED1C24", borderRightColor: "#C6168D",
            animation: "spin 0.9s linear infinite",
          }} />
          <div style={{
            position: "absolute", inset: 8, borderRadius: 10,
            background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "breathe 1.8s ease-in-out infinite",
            boxShadow: "0 4px 14px rgba(237,28,36,0.4)",
          }}>
            <BarChart3 size={18} color="#FFFFFF" />
          </div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, letterSpacing: "0.10em",
          textTransform: "uppercase", color: t.mid,
        }}>Memuat laporan…</span>
      </div>
    </>
  );

  // ── Empty state ──
  if (!activeContext?.mpxName) return (
    <>
      <G d={d} t={t} />
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        minHeight: 400, gap: 12, opacity: 0.7, fontFamily: FONT_STACK,
      }}>
        <Search size={36} style={{ color: t.lo, strokeWidth: 1.5 }} />
        <div style={{ fontSize: 13.5, fontWeight: 500, color: t.mid }}>
          Pilih Partner dan Cabang terlebih dahulu
        </div>
      </div>
    </>
  );

  // ── Error / no-data state ──
  if (error || !data || !report) return (
    <>
      <G d={d} t={t} />
      <div style={{
        maxWidth: 480, margin: "48px auto", padding: 28,
        borderRadius: 14, border: `1px solid ${t.line}`, background: t.card,
        textAlign: "center", boxShadow: t.md, fontFamily: FONT_STACK,
      }}>
        <div style={{
          width: 50, height: 50, borderRadius: 12, background: t.sub,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px", border: `1px solid ${t.line}`,
        }}>
          <AlertCircle size={24} style={{ color: t.lo }} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: t.hi, marginBottom: 8 }}>
          {error ? "Terjadi Kesalahan" : "Data Tidak Tersedia"}
        </div>
        <div style={{ fontSize: 13, color: t.mid, lineHeight: 1.6, marginBottom: 18 }}>
          {error
            ? <span style={{ color: t.red }}>{error}</span>
            : <>Belum ada laporan untuk{" "}
                <strong style={{ color: t.hi }}>{activeContext.mpxName}</strong>{" "}
                periode {activeContext.month} {activeContext.year}.</>}
        </div>
        <div style={{
          textAlign: "left", background: t.sub, borderRadius: 9,
          padding: "12px 14px", border: `1px solid ${t.line}`,
        }}>
          {[
            ["partner_name", activeContext?.mpxName],
            ["branch", activeContext?.branch],
            ["mpc_mp3", activeContext?.mpxType || "(tidak tersedia)"],
            ["month", activeContext?.month],
            ["year", activeContext?.year],
          ].map(([k, v]) => (
            <div key={k} style={{
              display: "flex", justifyContent: "space-between", gap: 12,
              padding: "3px 0", fontSize: 11.5,
            }}>
              <span style={{ color: t.lo, fontFamily: "ui-monospace,Menlo,monospace" }}>{k}</span>
              <span style={{ color: v ? t.hi : t.red, fontFamily: "ui-monospace,Menlo,monospace", fontWeight: 500 }}>
                {v || "undefined"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );

  const notes = data.validation_notes || "";
  const hasPend = notes.includes("pendapatan:final");
  const hasPeng = notes.includes("pengeluaran:final");
  const mpcType = data.mpc_mp3 || activeContext?.mpxType || "";
  const netPos = report.net >= 0;

  // ── P&L rows (UI) — SP & VC ditampilkan sebagai total (H1+H2 digabung) ──
  const pnlRows = [
    // A. Omset — SP & VC sudah digabung H1+H2
    { label: "A.  Omset Penjualan",        amount: report.tom,  ratio: 100,                   kind: "section" },
    ...(report.osp ? [{ label: "SP Regular",      amount: report.osp, ratio: report.p(report.osp), indent: 1 }] : []),
    ...(report.ovc ? [{ label: "Voucher Fisik",   amount: report.ovc, ratio: report.p(report.ovc), indent: 1 }] : []),
    ...(report.mj  ? [{ label: "Saldo MOBO",      amount: report.mj,  ratio: report.p(report.mj),  indent: 1 }] : []),
    { kind: "blank" },
    // B. Pendapatan
    { label: "B.  Struktur Pendapatan",    amount: report.tpd,  ratio: report.p(report.tpd),  kind: "section" },
    { label: "Total Margin Produk",        amount: report.tmg,  ratio: report.p(report.tmg),  indent: 1, kind: "subtot" },
    ...(report.msp ? [{ label: "— SP Regular",    amount: report.msp, ratio: report.p(report.msp), indent: 2 }] : []),
    ...(report.mvc ? [{ label: "— Voucher Fisik", amount: report.mvc, ratio: report.p(report.mvc), indent: 2 }] : []),
    ...(report.mmb ? [{ label: "— Saldo MOBO",    amount: report.mmb, ratio: report.p(report.mmb), indent: 2 }] : []),
    { label: "Total Komisi & Insentif",    amount: report.tko,  ratio: report.p(report.tko),  indent: 1, kind: "subtot" },
    ...(report.up  ? [{ label: "— Upfront Discount",  amount: report.up,  ratio: report.p(report.up),  indent: 2 }] : []),
    ...(report.smg ? [{ label: "— Sales Margin",       amount: report.smg, ratio: report.p(report.smg), indent: 2 }] : []),
    ...(report.sla ? [{ label: "— Monthly Fee SLA",    amount: report.sla, ratio: report.p(report.sla), indent: 2 }] : []),
    ...(report.spc ? [{ label: "— Special Program",    amount: report.spc, ratio: report.p(report.spc), indent: 2 }] : []),
    { label: "Total Hadiah & Lainnya",     amount: report.thd,  ratio: report.p(report.thd),  indent: 1, kind: "subtot" },
    ...(report.rwc ? [{ label: "— Champions Club",     amount: report.rwc, ratio: report.p(report.rwc), indent: 2 }] : []),
    ...(report.rwl ? [{ label: "— Hadiah Lainnya",     amount: report.rwl, ratio: report.p(report.rwl), indent: 2 }] : []),
    ...(report.pic ? [{ label: "— Partner Income",     amount: report.pic, ratio: report.p(report.pic), indent: 2 }] : []),
    { label: "TOTAL PENDAPATAN",           amount: report.tpd,  ratio: report.p(report.tpd),  kind: "total" },
    { kind: "blank" },
    // C. Pengeluaran
    { label: "C.  Struktur Pengeluaran",   amount: report.tpg,  ratio: report.p(report.tpg),  kind: "section" },
    ...(report.tox ? [{ label: "OPEX Branch",             amount: report.tox, ratio: report.p(report.tox), indent: 1 }] : []),
    ...(report.tsd ? [{ label: "SDM Branch",              amount: report.tsd, ratio: report.p(report.tsd), indent: 1 }] : []),
    ...(report.tmk ? [{ label: "Marketing & Cluster Dev", amount: report.tmk, ratio: report.p(report.tmk), indent: 1 }] : []),
    ...(report.tcm ? [{ label: "Cost of Money",           amount: report.tcm, ratio: report.p(report.tcm), indent: 1 }] : []),
    ...(report.pex ? [{ label: "Partner Expense",         amount: report.pex, ratio: report.p(report.pex), indent: 1 }] : []),
    { label: "TOTAL PENGELUARAN",          amount: report.tpg,  ratio: report.p(report.tpg),  kind: "total" },
  ];

  return (
    <div style={{
      maxWidth: 960, margin: "0 auto", paddingBottom: 48,
      fontFamily: FONT_STACK, WebkitFontSmoothing: "antialiased", color: t.hi,
    }}>
      <G d={d} t={t} />

      {/* Toast */}
      <AnimatePresence>
        {toast.show && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.17 }}
            style={{ position: "fixed", top: 70, right: 16, zIndex: 999, width: 320, maxWidth: "calc(100vw - 32px)" }}
          >
            <div style={{
              background: t.card,
              border: `1px solid ${toast.type === "success" ? t.greenBd : t.redBd}`,
              borderRadius: 12, boxShadow: t.lg, overflow: "hidden",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "12px 14px" }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: toast.type === "success" ? t.green : t.red, color: "#FFFFFF",
                }}>
                  {toast.type === "success" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.hi }}>
                    {toast.type === "success" ? "Berhasil" : "Error"}
                  </div>
                  <div style={{ fontSize: 12, color: t.mid, marginTop: 2, lineHeight: 1.5 }}>{toast.msg}</div>
                </div>
                <button onClick={() => setToast((p) => ({ ...p, show: false }))} style={{
                  background: "none", border: "none", cursor: "pointer", color: t.lo, display: "flex",
                }}>
                  <X size={14} />
                </button>
              </div>
              <motion.div
                initial={{ width: "100%" }} animate={{ width: "0%" }}
                transition={{ duration: 4, ease: "linear" }}
                style={{ height: 2, background: toast.type === "success" ? t.green : t.red }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Page Header */}
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        gap: 14, marginBottom: 20, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13, minWidth: 0, flex: 1 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 10, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)",
            color: "#FFFFFF", boxShadow: "0 2px 10px rgba(237,28,36,0.30)",
          }}>
            <BarChart3 size={22} strokeWidth={2} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: "clamp(18px, 2.6vw, 22px)", fontWeight: 700,
              letterSpacing: "-0.025em", color: t.hi, lineHeight: 1.2,
            }}>PnL Financial Summary</div>
            <div style={{
              fontSize: 12.5, fontWeight: 500, color: t.mid, marginTop: 3,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {[mpcType, activeContext?.mpxName, activeContext?.branch].filter(Boolean).join("  ·  ")}
              {activeContext?.month ? `  ·  ${activeContext.month} ${activeContext.year}` : ""}
            </div>
          </div>
        </div>
        <button
          onClick={handlePDF} disabled={genPdf}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "9px 16px", borderRadius: 8,
            background: genPdf ? t.sub : "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)",
            color: "#FFFFFF", border: "none",
            cursor: genPdf ? "not-allowed" : "pointer",
            fontSize: 13, fontWeight: 600,
            boxShadow: genPdf ? "none" : "0 2px 10px rgba(237,28,36,0.30)",
            opacity: genPdf ? 0.7 : 1, transition: "all .14s",
            flexShrink: 0, fontFamily: "inherit",
          }}
        >
          {genPdf
            ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />Membuat PDF…</>
            : <><Download size={14} />Download PDF</>}
        </button>
      </div>

      {/* Status banner */}
      <div style={{
        padding: "12px 14px", borderRadius: 10, marginBottom: 20,
        border: `1px solid ${data.is_finalized ? t.greenBd : t.amberBd}`,
        background: data.is_finalized ? t.greenBg : t.amberBg,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
          {data.is_finalized
            ? <CheckCircle2 size={17} style={{ color: t.green, flexShrink: 0 }} />
            : <Clock size={17} style={{ color: t.amber, flexShrink: 0 }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: data.is_finalized ? t.green : t.amber }}>
              {data.is_finalized ? "Laporan tervalidasi & final" : "Status draft — belum difinalisasi"}
            </div>
            <div style={{ fontSize: 11.5, color: t.mid, marginTop: 2 }}>
              {data.is_finalized && data.finalized_at
                ? `Difinalisasi: ${dtf(data.finalized_at)}`
                : data.updated_at ? `Terakhir disimpan: ${dtf(data.updated_at)}` : null}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {hasPend && <Pill icon={<CheckCircle2 size={11} />} text="Pendapatan final" color={t.green} bg={t.greenBg} bd={t.greenBd} />}
          {hasPeng && <Pill icon={<CheckCircle2 size={11} />} text="Pengeluaran final" color={t.magenta} bg={t.magentaBg} bd={t.magentaBd} />}
        </div>
      </div>

      {/* 3 Metric Cards */}
      <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 22 }}>
        <MetCard label="Total Omset"       value={idr(report.tom)} sub="SP + Voucher + MOBO"      accent="#ED1C24"  t={t} />
        <MetCard label="Total Pendapatan"  value={idr(report.tpd)} sub="Margin + Komisi + Hadiah" accent="#32BCAD" t={t} />
        <MetCard label="Total Pengeluaran" value={idr(report.tpg)} sub="OPEX + SDM + Mkt + COM"   accent={t.red}   t={t} />
      </div>

      {/* P&L Table */}
      <Card t={t} style={{ marginBottom: 22, overflow: "hidden" }}>
        <div style={{
          padding: "13px 18px", borderBottom: `1px solid ${t.line}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 8,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: t.hi }}>
            Financial Structure
          </div>
          <div style={{ fontSize: 11.5, color: t.mid }}>
            {activeContext?.month} {activeContext?.year}  ·  Rasio % terhadap Omset
          </div>
        </div>
        <div className="tbl">
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 540 }}>
            <thead>
              <tr style={{ background: t.sub }}>
                {[["Financial Structure", "left", "55%"], ["Jumlah (IDR)", "right", "30%"], ["Rasio", "right", "15%"]].map(([h, a, w]) => (
                  <th key={h} style={{
                    padding: "10px 16px", textAlign: a, width: w,
                    fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
                    textTransform: "uppercase", color: t.mid,
                    borderBottom: `1px solid ${t.line}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pnlRows.map((row, i) => <TR key={i} {...row} t={t} />)}
            </tbody>
          </table>
        </div>

        {/* Net Profit strip */}
        <div style={{
          padding: "18px 22px",
          background: netPos ? t.greenBg : t.redBg,
          borderTop: `1.5px solid ${netPos ? t.greenBd : t.redBd}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 14, flexWrap: "wrap",
        }}>
          <div>
            <div style={{
              fontSize: 10.5, fontWeight: 600, letterSpacing: "0.10em",
              textTransform: "uppercase", color: netPos ? t.green : t.red, marginBottom: 6,
            }}>NET PROFIT BEFORE TAX</div>
            <div style={{
              fontSize: "clamp(22px, 3.6vw, 32px)", fontWeight: 700,
              letterSpacing: "-0.03em", color: netPos ? t.green : t.red,
              fontVariantNumeric: "tabular-nums", lineHeight: 1,
            }}>{idr(report.net)}</div>
            <div style={{ fontSize: 12, color: t.mid, marginTop: 6 }}>
              Total Pendapatan − Total Pengeluaran
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 7 }}>
            <div style={{
              fontSize: 13.5, fontWeight: 600, color: netPos ? t.green : t.red,
              fontVariantNumeric: "tabular-nums",
            }}>{rto(report.p(report.net))}</div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 99,
              background: netPos ? t.green : t.red, color: "#FFFFFF",
              fontSize: 12, fontWeight: 600,
            }}>
              {netPos ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {netPos ? "Profit" : "Loss"}
            </div>
          </div>
        </div>
      </Card>

      {/* Two-column breakdown */}
      <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* Pendapatan */}
        <Card t={t}>
          <div style={{ padding: "20px 22px" }}>
            <SLabel icon={<ArrowUpRight size={13} />} t={t}>Struktur Pendapatan</SLabel>
            {[
              {
                label: "Margin Produk", val: report.tmg,
                note: `SP ${idr(report.msp)}  ·  VC ${idr(report.mvc)}  ·  MOBO ${idr(report.mmb)}`,
              },
              { label: "Komisi & Insentif", val: report.tko, note: "Upfront + Sales Margin + SLA + Special" },
              { label: "Hadiah & Lainnya",  val: report.thd, note: "Champions + Lainnya + Partner Income" },
            ].map((row, i) => (
              <div key={i} style={{ padding: "11px 0", borderBottom: `1px solid ${t.lineSoft}` }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: t.hi, lineHeight: 1.3 }}>{row.label}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: t.hi, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{idr(row.val)}</div>
                </div>
                <div style={{ fontSize: 11, color: t.lo, marginTop: 3, lineHeight: 1.4 }}>{row.note}</div>
              </div>
            ))}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              paddingTop: 14, marginTop: 4, borderTop: `1.5px solid rgba(50,188,173,0.35)`,
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#32BCAD" }}>
                Total Pendapatan
              </span>
              <span style={{ fontSize: 18, fontWeight: 700, color: "#32BCAD", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
                {idr(report.tpd)}
              </span>
            </div>
          </div>
        </Card>

        {/* Pengeluaran */}
        <Card t={t}>
          <div style={{ padding: "20px 22px" }}>
            <SLabel icon={<ArrowDownLeft size={13} />} t={t}>Struktur Pengeluaran</SLabel>
            {[
              { label: "OPEX Branch",         val: report.tox },
              { label: "SDM Branch",          val: report.tsd },
              { label: "Marketing & Cluster", val: report.tmk },
              { label: "Cost of Money",       val: report.tcm },
              { label: "Partner Expense",     val: report.pex },
            ].map((row, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 12, padding: "11px 0", borderBottom: `1px solid ${t.lineSoft}`,
              }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: t.hi }}>{row.label}</span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: t.hi, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                  {idr(row.val)}
                </span>
              </div>
            ))}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              paddingTop: 14, marginTop: 4, borderTop: `1.5px solid ${t.redBd}`,
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: t.red }}>
                Total Pengeluaran
              </span>
              <span style={{ fontSize: 18, fontWeight: 700, color: t.red, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
                {idr(report.tpg)}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ─── Pill ────────────────────────────────────────────────────────────────────
function Pill({ icon, text, color, bg, bd }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "4px 10px", borderRadius: 99,
      background: bg, border: `1px solid ${bd}`,
      fontSize: 11.5, color, fontWeight: 600, fontFamily: "inherit",
    }}>{icon}{text}</span>
  );
}

export default MPX_Summary_PNL;