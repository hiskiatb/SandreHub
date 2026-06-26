"use client";

import React, { useState, useMemo, useEffect } from "react";
import supabase from "../../../lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { downloadAsArrayBuffer } from '../../../lib/pnlAttachments';
import {
  BarChart3, TrendingUp, TrendingDown, Download, Loader2,
  AlertCircle, Search, CheckCircle2, Clock, X, Paperclip,
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
const MAX_LAIN = 10;

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

// ─── calcR — mirror semua field FormPendapatan + FormPengeluaran ─────────────
function calcR(data) {
  if (!data) return null;
  const g = (k) => Number(data[k]) || 0;

  // HPP map
  const hsp = { qty_sp_3gb_im3: 29000, qty_sp_0_im3: 10000, qty_sp_kpk_3id: 10000, qty_sp_3gb_3id: 29000 };
  const hvc = {
    qty_vc_0_im3: 300, qty_vc_2_5gb: 12600, qty_vc_3gb_30: 19500,
    qty_vc_3_5gb_5d: 13750, qty_vc_5gb_5d: 16800, qty_vc_7gb_7d: 22400,
    qty_vc_fi_4gb: 24500, qty_vc_fi_1_5gb_1d: 4500, qty_vc_fi_3gb_1d: 6600,
    qty_vc_fi_5gb_2d: 8300, qty_vc_fi_3gb_3d: 11600, qty_vc_fi_5gb_3d: 12800,
    qty_vc_fi_15gb_7d: 27900, qty_vc_0_3id: 500,
  };
  const hsp2 = { qty_sp_3gb_im3_2: 29000, qty_sp_0_im3_2: 10000, qty_sp_kpk_3id_2: 10000, qty_sp_3gb_3id_2: 29000 };
  const hvc2 = {
    qty_vc_0_im3_2: 300, qty_vc_2_5gb_2: 12600, qty_vc_3gb_30_2: 19500,
    qty_vc_3_5gb_5d_2: 13750, qty_vc_5gb_5d_2: 16800, qty_vc_7gb_7d_2: 22400,
    qty_vc_fi_4gb_2: 24500, qty_vc_fi_1_5gb_1d_2: 4500, qty_vc_fi_3gb_1d_2: 6600,
    qty_vc_fi_5gb_2d_2: 8300, qty_vc_fi_3gb_3d_2: 11600, qty_vc_fi_5gb_3d_2: 12800,
    qty_vc_fi_15gb_7d_2: 27900, qty_vc_0_3id_2: 500,
  };

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

  const osp1 = sd.reduce((a, [q, r]) => a + g(q) * g(r), 0);
  const osp2 = sd2.reduce((a, [q, r]) => a + g(q) * g(r), 0);
  const osp  = osp1 + osp2;
  const ovc1 = vd.reduce((a, [q, r]) => a + g(q) * g(r), 0);
  const ovc2 = vd2.reduce((a, [q, r]) => a + g(q) * g(r), 0);
  const ovc  = ovc1 + ovc2;

  const mj  = g("mobo_jual");
  const mm  = g("mobo_modal");
  const tom = osp + ovc + mj;

  const msp1 = sd.reduce((a, [q, r]) => a + g(q) * (g(r) - (hsp[q] || 0)), 0);
  const msp2 = sd2.reduce((a, [q, r]) => a + g(q) * (g(r) - (hsp2[q] || 0)), 0);
  const msp  = msp1 + msp2;
  const mvc1 = vd.reduce((a, [q, r]) => a + g(q) * (g(r) - (hvc[q] || 0)), 0);
  const mvc2 = vd2.reduce((a, [q, r]) => a + g(q) * (g(r) - (hvc2[q] || 0)), 0);
  const mvc  = mvc1 + mvc2;

  const mmb = mj - mm;
  const tmg = msp + mvc;

  const up  = mm * 0.015;
  const smg = g("realtime_margin") + g("back_margin");
  const sla = g("sla_fee");
  const spc = g("special_program");
  const tko = up + smg + sla + spc;

  const rwc = g("rewards_champions"), rwl = g("rewards_lainnya"), pic = g("partner_income");
  const thd = rwc + rwl + pic;

  const tpd = tmg + tko + thd;

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
    ["price_sdm_bm",              "qty_sdm_bm"],
    ["price_sdm_admin",           "qty_sdm_admin"],
    ["price_sdm_finance",         "qty_sdm_finance"],
    ["price_sdm_md",              "qty_sdm_md"],
    ["price_sdm_ss",              "qty_sdm_ss"],
    ["price_sdm_ops",             "qty_sdm_ops"],
    ["price_sdm_dinas",           "qty_sdm_dinas"],
    ["price_sdm_tm",              "qty_sdm_tm"],
    ["price_sdm_om",              "qty_sdm_om"],
    ["price_sdm_gm",              "qty_sdm_gm"],
    ["price_sdm_hrd",             "qty_sdm_hrd"],
    ["price_sdm_mis",             "qty_sdm_mis"],
    ["price_sdm_som",             "qty_sdm_som"],
    ["price_sdm_finance_spv",     "qty_sdm_finance_spv"],
    ["price_sdm_finance_staff",   "qty_sdm_finance_staff"],
    ["price_sdm_ob",              "qty_sdm_ob"],
    ["price_sdm_tss",             "qty_sdm_tss"],
    ["price_sdm_benefit_sales",   "qty_sdm_benefit_sales"],
    ["price_sdm_benefit_nonsales","qty_sdm_benefit_nonsales"],
  ]);

  const tmkStatic = cs([
    ["price_mkt_ws",      "qty_mkt_ws"],
    ["price_mkt_retail",  "qty_mkt_retail"],
    ["price_mkt_event",   "qty_mkt_event"],
    ["price_mkt_starter", "qty_mkt_starter"],
  ]);

  let tmkLain = 0;
  const mktLainDetail = [];
  for (let n = 1; n <= MAX_LAIN; n++) {
    const qty   = g(`qty_mkt_lain_${n}`);
    const price = g(`price_mkt_lain_${n}`);
    const label = data[`label_mkt_lain_${n}`] || `Program Lain ${n}`;
    const total = qty * price;
    if (total > 0 || qty > 0) {
      tmkLain += total;
      mktLainDetail.push({ n, label, qty, price, total });
    }
  }
  const tmk = tmkStatic + tmkLain;

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
    tox, tsd, tmk, tmkStatic, tmkLain, mktLainDetail, tcm, pex, tpg,
    net, p,
    hsp, hsp2, hvc, hvc2, sd, sd2, vd, vd2, g,
  };
}

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

// ─── pdf-lib loader (untuk merge lampiran) ───────────────────────────────────
async function ensurePdfLib() {
  if (window.PDFLib) return window.PDFLib;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
    s.onload = res;
    s.onerror = () => rej(new Error('Gagal memuat pdf-lib'));
    document.head.appendChild(s);
  });
  return window.PDFLib;
}

// ─── PDF Generator ────────────────────────────────────────────────────────────
// FIX: signature sekarang menerima `attachments` sebagai parameter ke-4.
async function makePDF(data, r, ctx, attachments = []) {
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
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const PW = 210, PH = 297;
  const ML = 16, MR = 16;
  const CW = PW - ML - MR;

  const C = {
    TEXT:    [40,  40,  40],
    PRIMARY: [20,  35,  60],
    LINE:    [200, 205, 210],
    HEAVY:   [100, 105, 110],
    HEADBG:  [244, 246, 248],
    STRIPE:  [250, 251, 252],
    GREEN:   [26,  158, 144],
    RED:     [220, 38,  38],
    TEAL:    [50,  188, 173],
    BRAND:   [237, 28,  36],
  };

  const fRp     = (v) => v ? Math.abs(v).toLocaleString("id-ID") : "—";
  const fRpFull = (v) => {
    if (!v) return "—";
    const s = Math.abs(v).toLocaleString("id-ID", { maximumFractionDigits: 0 });
    return v < 0 ? `(Rp ${s})` : `Rp ${s}`;
  };
  const fQty  = (v) => v ? Number(v).toLocaleString("id-ID") : "—";
  const fPct  = (v) => v ? Number(v).toFixed(2).replace(".", ",") + "%" : "—";
  const fPctR = (v) => (!isFinite(v) || !v) ? "—" : `${Number(v).toFixed(1).replace(".", ",")}%`;

  const partner = data.partner_name || "—";
  const branch  = data.branch       || "—";
  const mpc     = data.mpc_mp3      || "—";
  const month   = ctx?.month        || "—";
  const year    = String(ctx?.year  || "");
  const gd      = (k) => Number(data[k]) || 0;

  let Y = 0;
  let pageNum = 0;

  function drawHeader(title) {
    pageNum++;
    doc.setFillColor(...C.BRAND);
    doc.rect(0, 0, PW, 4, "F");

    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(...C.PRIMARY);
    doc.text(title, ML, 18);

    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...C.TEXT);
    doc.text(`Partner: ${partner} | Branch: ${branch} | MPX: ${mpc}`, ML, 23);
    doc.text(`Periode: ${month} ${year}`, ML, 27);

    doc.setFont("helvetica", "italic"); doc.setFontSize(7);
    doc.text(`Dicetak: ${new Date().toLocaleString("id-ID")}`, PW - MR, 23, { align: "right" });
    doc.text(`Hal. ${pageNum}`, PW - MR, 27, { align: "right" });

    doc.setDrawColor(...C.HEAVY); doc.setLineWidth(0.5);
    doc.line(ML, 30, PW - MR, 30);
    Y = 36;
  }

  let _currentTitle = "";
  function tbl(title, head, rows, cols, opts = {}) {
    if (!rows.length) return;
    if (Y > PH - 40) { doc.addPage(); drawHeader(_currentTitle || "LANJUTAN"); }
    if (title) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...C.PRIMARY);
      doc.text(title, ML, Y);
      Y += 3.5;
    }
    doc.autoTable({
      startY: Y,
      margin: { left: ML, right: MR, top: 35, bottom: 20 },
      head: [head],
      body: rows,
      columnStyles: Object.fromEntries(cols.map(([i, w, a]) => [i, { cellWidth: w, halign: a || "left" }])),
      styles: {
        font: "helvetica", fontSize: 6.5, textColor: C.TEXT,
        cellPadding: { top: 2.5, bottom: 2.5, left: 2.5, right: 2.5 },
        lineColor: C.LINE, lineWidth: 0.1,
        overflow: "ellipsize",
      },
      headStyles: {
        fillColor: C.HEADBG, textColor: C.PRIMARY, fontStyle: "bold",
        lineWidth: { top: 0.5, bottom: 0.5, left: 0.1, right: 0.1 }, lineColor: C.HEAVY,
      },
      bodyStyles: { fillColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: C.STRIPE },
      didParseCell: (h) => {
        const ri = h.row.index;
        const isSubtotal = Array.isArray(opts.subtotalRow) ? opts.subtotalRow.includes(ri) : ri === opts.subtotalRow;
        const isLast = opts.boldLast && ri === rows.length - 1;
        if (isSubtotal || isLast) {
          h.cell.styles.fontStyle = "bold";
          h.cell.styles.textColor = C.PRIMARY;
          h.cell.styles.fillColor = [240, 240, 240];
          h.cell.styles.lineWidth = { top: 0.3, bottom: isLast ? 0.8 : 0.3, left: 0.1, right: 0.1 };
          h.cell.styles.lineColor = C.HEAVY;
        }
      },
      didDrawPage: (data) => {
        if (data.pageNumber > 1 && data.cursor.y < 50) {
          drawHeader(_currentTitle || "LANJUTAN");
        }
      },
    });
    Y = doc.lastAutoTable.finalY + 8;
  }

  // ── HALAMAN 1: SUMMARY ──
  _currentTitle = "RINGKASAN LAPORAN LABA RUGI";
  drawHeader(_currentTitle);

  const infoY = Y;
  doc.setFillColor(...C.HEADBG);
  doc.roundedRect(ML, infoY, CW, 18, 2, 2, "F");
  doc.setDrawColor(...C.LINE);
  doc.setLineWidth(0.3);
  doc.roundedRect(ML, infoY, CW, 18, 2, 2, "S");

  const infoCols = [
    ["Partner", partner],
    ["Branch", branch],
    ["MPX", mpc],
    ["Periode", `${month} ${year}`],
  ];
  const iColW = CW / 4;
  infoCols.forEach(([lbl, val], i) => {
    const x = ML + i * iColW + 4;
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...C.HEAVY);
    doc.text(lbl, x, infoY + 6);
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...C.PRIMARY);
    doc.text(val, x, infoY + 13);
  });
  Y = infoY + 24;

  tbl("A. RINGKASAN STRUKTUR PENDAPATAN",
    ["Komponen Pendapatan", "Jumlah (IDR)", "% Omset"],
    [
      ...(r.tmg  ? [["Margin Produk Fisik (SP + VC)",   fRpFull(r.tmg),  fPctR(r.p(r.tmg))]]  : []),
      ...(r.msp  ? [["  — Margin Starter Pack",         fRpFull(r.msp),  fPctR(r.p(r.msp))]]  : []),
      ...(r.mvc  ? [["  — Margin Voucher Fisik",        fRpFull(r.mvc),  fPctR(r.p(r.mvc))]]  : []),
      ...(r.tko  ? [["Komisi & Insentif",               fRpFull(r.tko),  fPctR(r.p(r.tko))]]  : []),
      ...(r.up   ? [["  — Upfront Discount (1,5% MOBO)",fRpFull(r.up),   fPctR(r.p(r.up))]]   : []),
      ...(r.smg  ? [["  — Sales Margin (RT + Back)",    fRpFull(r.smg),  fPctR(r.p(r.smg))]]  : []),
      ...(r.sla  ? [["  — Monthly Fee SLA",             fRpFull(r.sla),  fPctR(r.p(r.sla))]]  : []),
      ...(r.spc  ? [["  — Tactical Program",             fRpFull(r.spc),  fPctR(r.p(r.spc))]]  : []),
      ...(r.thd  ? [["Hadiah & Lainnya",                fRpFull(r.thd),  fPctR(r.p(r.thd))]]  : []),
      ...(r.rwc  ? [["  — Rewards Champions Club",      fRpFull(r.rwc),  fPctR(r.p(r.rwc))]]  : []),
      ...(r.rwl  ? [["  — Rewards Lainnya",             fRpFull(r.rwl),  fPctR(r.p(r.rwl))]]  : []),
      ...(r.pic  ? [["  — Partner Income",              fRpFull(r.pic),  fPctR(r.p(r.pic))]]  : []),
      ["TOTAL PENDAPATAN",                              fRpFull(r.tpd),  fPctR(r.p(r.tpd))],
    ],
    [[0, 100, "left"], [1, 48, "right"], [2, 30, "right"]],
    { boldLast: true }
  );

  tbl("B. RINGKASAN STRUKTUR PENGELUARAN",
    ["Komponen Pengeluaran", "Jumlah (IDR)", "% Omset"],
    [
      ...(r.tox ? [["OPEX Branch",               fRpFull(r.tox), fPctR(r.p(r.tox))]] : []),
      ...(r.tsd ? [["SDM Branch",                fRpFull(r.tsd), fPctR(r.p(r.tsd))]] : []),
      ...(r.tmk ? [["Marketing & Cluster Dev",   fRpFull(r.tmk), fPctR(r.p(r.tmk))]] : []),
      ...(r.tmkStatic ? [["  — Program Reguler", fRpFull(r.tmkStatic), fPctR(r.p(r.tmkStatic))]] : []),
      ...(r.tmkLain   ? [["  — Program Lain",    fRpFull(r.tmkLain),   fPctR(r.p(r.tmkLain))]]   : []),
      ...(r.tcm ? [["Cost of Money",             fRpFull(r.tcm), fPctR(r.p(r.tcm))]] : []),
      ...(r.pex ? [["Partner Expense",           fRpFull(r.pex), fPctR(r.p(r.pex))]] : []),
      ["TOTAL PENGELUARAN",                      fRpFull(r.tpg), fPctR(r.p(r.tpg))],
    ],
    [[0, 100, "left"], [1, 48, "right"], [2, 30, "right"]],
    { boldLast: true }
  );

  tbl("C. RINGKASAN OMSET PENJUALAN",
    ["Komponen Omset", "Jumlah (IDR)", "% Total"],
    [
      ...(r.osp ? [["SP Regular",    fRpFull(r.osp), fPctR(r.tom ? r.osp / r.tom * 100 : 0)]] : []),
      ...(r.ovc ? [["Voucher Fisik", fRpFull(r.ovc), fPctR(r.tom ? r.ovc / r.tom * 100 : 0)]] : []),
      ...(r.mj  ? [["Saldo MOBO",    fRpFull(r.mj),  fPctR(r.tom ? r.mj  / r.tom * 100 : 0)]] : []),
      ["TOTAL OMSET",                fRpFull(r.tom), "100,0%"],
    ],
    [[0, 100, "left"], [1, 48, "right"], [2, 30, "right"]],
    { boldLast: true }
  );

  if (Y > PH - 52) { doc.addPage(); drawHeader(_currentTitle); }
  const netPos = r.net >= 0;
  const netBoxY = Y;
  const netFill = netPos ? C.TEAL : C.RED;
  doc.setFillColor(...netFill);
  doc.roundedRect(ML, netBoxY, CW, 36, 3, 3, "F");

  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
  doc.text("NET PROFIT BEFORE TAX", ML + 6, netBoxY + 8);
  doc.text(`(Total Pendapatan − Total Pengeluaran)`, ML + 6, netBoxY + 13.5);

  doc.setFontSize(20);
  doc.text(
    (r.net >= 0 ? "" : "(") + "Rp " + Math.abs(r.net).toLocaleString("id-ID") + (r.net < 0 ? ")" : ""),
    ML + 6, netBoxY + 26
  );

  const pctStr = fPctR(r.p(r.net));
  doc.setFontSize(10);
  doc.text(pctStr + " dari Omset", PW - MR - 4, netBoxY + 20, { align: "right" });
  doc.setFontSize(8);
  doc.text(netPos ? "PROFIT ▲" : "LOSS ▼", PW - MR - 4, netBoxY + 28, { align: "right" });
  Y = netBoxY + 44;

  // ── HALAMAN PRODUK & PENDAPATAN ──
  doc.addPage();
  _currentTitle = "RINCIAN PRODUK & PENDAPATAN";
  drawHeader(_currentTitle);

  const prdHead = ["Produk", "Qty", "HPP", "Retail", "Modal (Rp)", "Jual (Rp)", "Margin (Rp)", "% Mgn", "Komp"];
  const prdCols = [
    [0, 40, "left"], [1, 12, "right"], [2, 16, "right"], [3, 16, "right"],
    [4, 22, "right"], [5, 22, "right"], [6, 22, "right"], [7, 14, "right"], [8, 14, "right"],
  ];

  function buildPrdRows(pairs, hppMap, totalOmset) {
    const rows = [];
    pairs.forEach(([qk, rk]) => {
      const qty = gd(qk); if (!qty) return;
      const hpp = hppMap[qk] || 0, ret = gd(rk);
      const tMod = hpp * qty, tPenj = ret * qty, marg = tPenj - tMod;
      const pctM = tPenj ? marg / tPenj * 100 : 0;
      const komp = totalOmset ? tPenj / totalOmset * 100 : 0;
      rows.push([PROD_NAMES[qk] || qk, fQty(qty), fRp(hpp), fRp(ret), fRp(tMod), fRp(tPenj), fRp(marg), fPct(pctM), fPct(komp)]);
    });
    return rows;
  }

  // SP
  let spRows = buildPrdRows(r.sd, r.hsp, r.osp);
  if (spRows.length) {
    const tMod = r.sd.reduce((a, [q]) => a + gd(q) * (r.hsp[q] || 0), 0);
    spRows.push(["Sub-total SP Harga 1", "", "", "", fRp(tMod), fRp(r.osp1), fRp(r.msp1), fPct(r.osp1 ? r.msp1 / r.osp1 * 100 : 0), ""]);
  }
  let spRows2 = buildPrdRows(r.sd2, r.hsp2, r.osp);
  if (spRows2.length) {
    const tMod = r.sd2.reduce((a, [q]) => a + gd(q) * (r.hsp2[q] || 0), 0);
    spRows2.push(["Sub-total SP Harga 2", "", "", "", fRp(tMod), fRp(r.osp2), fRp(r.msp2), fPct(r.osp2 ? r.msp2 / r.osp2 * 100 : 0), ""]);
  }
  const allSpRows = [...spRows, ...spRows2];
  if (allSpRows.length) {
    allSpRows.push(["TOTAL SP REGULAR", "", "", "", "", fRp(r.osp), fRp(r.msp), fPct(r.osp ? r.msp / r.osp * 100 : 0), "100%"]);
    const subIdx = allSpRows.map((x, i) => x[0].includes("Sub-total") ? i : -1).filter(i => i >= 0);
    tbl("1. RINCIAN STARTER PACK (SP)", prdHead, allSpRows, prdCols, { subtotalRow: subIdx, boldLast: true });
  }

  // VC
  let vcRows = buildPrdRows(r.vd, r.hvc, r.ovc);
  if (vcRows.length) {
    const tMod = r.vd.reduce((a, [q]) => a + gd(q) * (r.hvc[q] || 0), 0);
    vcRows.push(["Sub-total VC Harga 1", "", "", "", fRp(tMod), fRp(r.ovc1), fRp(r.mvc1), fPct(r.ovc1 ? r.mvc1 / r.ovc1 * 100 : 0), ""]);
  }
  let vcRows2 = buildPrdRows(r.vd2, r.hvc2, r.ovc);
  if (vcRows2.length) {
    const tMod = r.vd2.reduce((a, [q]) => a + gd(q) * (r.hvc2[q] || 0), 0);
    vcRows2.push(["Sub-total VC Harga 2", "", "", "", fRp(tMod), fRp(r.ovc2), fRp(r.mvc2), fPct(r.ovc2 ? r.mvc2 / r.ovc2 * 100 : 0), ""]);
  }
  const allVcRows = [...vcRows, ...vcRows2];
  if (allVcRows.length) {
    allVcRows.push(["TOTAL VOUCHER FISIK", "", "", "", "", fRp(r.ovc), fRp(r.mvc), fPct(r.ovc ? r.mvc / r.ovc * 100 : 0), "100%"]);
    const subIdx = allVcRows.map((x, i) => x[0].includes("Sub-total") ? i : -1).filter(i => i >= 0);
    tbl("2. RINCIAN VOUCHER FISIK", prdHead, allVcRows, prdCols, { subtotalRow: subIdx, boldLast: true });
  }

  if (r.mj) {
    tbl("3. SALDO MOBO",
      ["Keterangan", "Modal (Rp)", "Penjualan (Rp)", "Komposisi"],
      [["Saldo MOBO", fRpFull(r.mm), fRpFull(r.mj), fPct(r.p(r.mj))]],
      [[0, 88, "left"], [1, 40, "right"], [2, 35, "right"], [3, 15, "right"]]
    );
  }

  const komRows = [];
  if (r.up)  komRows.push(["Upfront Discount (1,5% Modal MOBO)", fRpFull(r.up),  fPct(r.tko ? r.up  / r.tko * 100 : 0)]);
  if (r.smg) komRows.push(["Sales Margin (Realtime + Back Margin)", fRpFull(r.smg), fPct(r.tko ? r.smg / r.tko * 100 : 0)]);
  if (r.sla) komRows.push(["Monthly Fee SLA", fRpFull(r.sla), fPct(r.tko ? r.sla / r.tko * 100 : 0)]);
  if (r.spc) komRows.push(["Tactical Program", fRpFull(r.spc), fPct(r.tko ? r.spc / r.tko * 100 : 0)]);
  if (komRows.length) {
    komRows.push(["TOTAL KOMISI & INSENTIF", fRpFull(r.tko), "100,00%"]);
    tbl("4. KOMISI & INSENTIF", ["Keterangan", "Jumlah (IDR)", "% dari Total"], komRows,
      [[0, 108, "left"], [1, 40, "right"], [2, 30, "right"]], { boldLast: true });
  }

  const hdRows = [];
  if (r.rwc) hdRows.push(["Rewards Champions Club", fRpFull(r.rwc), fPct(r.thd ? r.rwc / r.thd * 100 : 0)]);
  if (r.rwl) hdRows.push(["Rewards Lainnya",         fRpFull(r.rwl), fPct(r.thd ? r.rwl / r.thd * 100 : 0)]);
  if (r.pic) hdRows.push(["Partner Income",           fRpFull(r.pic), fPct(r.thd ? r.pic / r.thd * 100 : 0)]);
  if (hdRows.length) {
    hdRows.push(["TOTAL HADIAH & LAINNYA", fRpFull(r.thd), "100,00%"]);
    tbl("5. HADIAH & LAINNYA", ["Keterangan", "Jumlah (IDR)", "% dari Total"], hdRows,
      [[0, 108, "left"], [1, 40, "right"], [2, 30, "right"]], { boldLast: true });
  }

  // ── HALAMAN BEBAN USAHA ──
  doc.addPage();
  _currentTitle = "RINCIAN BEBAN USAHA";
  drawHeader(_currentTitle);

  const exHead = ["Keterangan Beban", "Qty", "Harga Satuan (Rp)", "Total Biaya (Rp)", "Komposisi"];
  const exCols = [[0, 60, "left"], [1, 18, "right"], [2, 30, "right"], [3, 40, "right"], [4, 30, "right"]];

  function buildExRows(defs, totalGroup) {
    const rows = [];
    defs.forEach(([nm, qk, pk]) => {
      const qty = gd(qk), prc = gd(pk); if (!qty && !prc) return;
      const tot = qty * prc;
      rows.push([nm, fQty(qty), fRp(prc), fRp(tot), fPct(totalGroup ? tot / totalGroup * 100 : 0)]);
    });
    return rows;
  }

  const opexRows = buildExRows([
    ["Gedung / Sewa Kantor",  "qty_opex_gedung",    "price_opex_gedung"],
    ["Kendaraan",             "qty_opex_kendaraan", "price_opex_kendaraan"],
    ["Listrik",               "qty_opex_listrik",   "price_opex_listrik"],
    ["Air",                   "qty_opex_air",       "price_opex_air"],
    ["Perangkat IT",          "qty_opex_it",        "price_opex_it"],
    ["Logistik / Pengiriman", "qty_opex_logistik",  "price_opex_logistik"],
    ["Asuransi",              "qty_opex_asuransi",  "price_opex_asuransi"],
    ["Lain-lain",             "qty_opex_lain",      "price_opex_lain"],
  ], r.tox);
  if (opexRows.length) {
    opexRows.push(["TOTAL OPEX", "", "", fRp(r.tox), "100%"]);
    tbl("1. OPERASIONAL BRANCH (OPEX)", exHead, opexRows, exCols, { boldLast: true });
  }

  const sdmRows = buildExRows([
    ["Branch Manager",           "qty_sdm_bm",              "price_sdm_bm"],
    ["Admin & Warehouse",        "qty_sdm_admin",           "price_sdm_admin"],
    ["Finance",                  "qty_sdm_finance",         "price_sdm_finance"],
    ["Finance Supervisor",       "qty_sdm_finance_spv",     "price_sdm_finance_spv"],
    ["Finance Staff",            "qty_sdm_finance_staff",   "price_sdm_finance_staff"],
    ["Merchandising",            "qty_sdm_md",              "price_sdm_md"],
    ["Sales Support",            "qty_sdm_ss",              "price_sdm_ss"],
    ["Staff Operasional",        "qty_sdm_ops",             "price_sdm_ops"],
    ["Perjalanan Dinas",         "qty_sdm_dinas",           "price_sdm_dinas"],
    ["Territory Manager",        "qty_sdm_tm",              "price_sdm_tm"],
    ["Operation Manager",        "qty_sdm_om",              "price_sdm_om"],
    ["General Manager",          "qty_sdm_gm",              "price_sdm_gm"],
    ["HRD",                      "qty_sdm_hrd",             "price_sdm_hrd"],
    ["MIS / IT Support",         "qty_sdm_mis",             "price_sdm_mis"],
    ["Senior Operation Manager", "qty_sdm_som",             "price_sdm_som"],
    ["Office Boy",               "qty_sdm_ob",              "price_sdm_ob"],
    ["Technical Sales Support",  "qty_sdm_tss",             "price_sdm_tss"],
    ["Benefit Sales",            "qty_sdm_benefit_sales",   "price_sdm_benefit_sales"],
    ["Benefit Non-Sales",        "qty_sdm_benefit_nonsales","price_sdm_benefit_nonsales"],
  ], r.tsd);
  if (sdmRows.length) {
    sdmRows.push(["TOTAL SDM", "", "", fRp(r.tsd), "100%"]);
    tbl("2. SUMBER DAYA MANUSIA (SDM)", exHead, sdmRows, exCols, { boldLast: true });
  }

  const mktStaticRows = buildExRows([
    ["Wholeseller / Distributor",    "qty_mkt_ws",      "price_mkt_ws"],
    ["Retail / Outlet",              "qty_mkt_retail",  "price_mkt_retail"],
    ["Event / Promosi",              "qty_mkt_event",   "price_mkt_event"],
    ["Program Starter Pack",         "qty_mkt_starter", "price_mkt_starter"],
  ], r.tmk);

  const mktLainRows = [];
  r.mktLainDetail.forEach(({ label, qty, price, total }) => {
    mktLainRows.push([
      label || "Program Lain",
      fQty(qty),
      fRp(price),
      fRp(total),
      fPct(r.tmk ? total / r.tmk * 100 : 0),
    ]);
  });

  const allMktRows = [...mktStaticRows, ...mktLainRows];
  if (allMktRows.length) {
    allMktRows.push(["TOTAL MARKETING", "", "", fRp(r.tmk), "100%"]);
    tbl("3. MARKETING & CLUSTER DEV", exHead, allMktRows, exCols, { boldLast: true });
  }

  const comRows = buildExRows([
    ["Administrasi Bank",  "qty_com_admin", "price_com_admin"],
    ["Bunga Pinjaman",     "qty_com_bunga", "price_com_bunga"],
  ], r.tcm);
  if (comRows.length) {
    comRows.push(["TOTAL COST OF MONEY", "", "", fRp(r.tcm), "100%"]);
    tbl("4. COST OF MONEY", exHead, comRows, exCols, { boldLast: true });
  }

  if (r.pex) {
    tbl("5. PARTNER EXPENSE", exHead,
      [["Partner Expense (Luar Template)", "—", "—", fRp(r.pex), "100%"]],
      exCols, { boldLast: true });
  }

  // ── Balance check footer ──
  if (Y > PH - 52) { doc.addPage(); drawHeader(_currentTitle); }
  const balY = Y;
  doc.setFillColor(...C.HEADBG);
  doc.roundedRect(ML, balY, CW, 28, 2, 2, "F");
  doc.setDrawColor(...C.HEAVY); doc.setLineWidth(0.3);
  doc.roundedRect(ML, balY, CW, 28, 2, 2, "S");

  const colW3 = CW / 3;
  [
    ["TOTAL PENDAPATAN", fRpFull(r.tpd), C.TEAL],
    ["TOTAL PENGELUARAN", fRpFull(r.tpg), C.RED],
    ["NET PROFIT", fRpFull(r.net), netPos ? C.TEAL : C.RED],
  ].forEach(([label, val, color], i) => {
    const x = ML + i * colW3 + 4;
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...C.HEAVY);
    doc.text(label, x, balY + 8);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...color);
    doc.text(val, x, balY + 18);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // FINALIZE: simpan base PDF, lalu (kalau ada lampiran) merge dengan pdf-lib
  // ══════════════════════════════════════════════════════════════════════════
  const fileName = `PnL_${partner}_${branch}_${month}_${year}.pdf`.replace(/\s+/g, '_');
  const baseBytes = doc.output('arraybuffer');

  // Tanpa lampiran → langsung download
  if (!attachments || attachments.length === 0) {
    const blob = new Blob([baseBytes], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { merged: 0, failed: 0, failedNames: [] };
  }

  // ── Merge lampiran dengan pdf-lib ──
  const PDFLib = await ensurePdfLib();
  const { PDFDocument, StandardFonts, rgb } = PDFLib;

  const mergedDoc = await PDFDocument.load(baseBytes);
  const helv      = await mergedDoc.embedFont(StandardFonts.HelveticaBold);
  const helvR     = await mergedDoc.embedFont(StandardFonts.Helvetica);

  let merged = 0, failed = 0;
  const failedNames = [];

  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    try {
      // Halaman pemisah
      const sep = mergedDoc.addPage([595.28, 841.89]);
      sep.drawRectangle({ x: 0, y: 821.89, width: 595.28, height: 20, color: rgb(0.93, 0.11, 0.14) });
      sep.drawText('LAMPIRAN', { x: 40, y: 760, size: 9, font: helvR, color: rgb(0.4, 0.4, 0.45) });
      sep.drawText(`${i + 1}. ${att.name}`, {
        x: 40, y: 730, size: 18, font: helv, color: rgb(0.08, 0.14, 0.24), maxWidth: 515,
      });
      if (att.category) sep.drawText(`Kategori: ${att.category}`, { x: 40, y: 705, size: 10, font: helvR, color: rgb(0.3, 0.3, 0.35) });
      if (att.size)     sep.drawText(`Ukuran: ${(att.size / 1024).toFixed(1)} KB`, { x: 40, y: 690, size: 10, font: helvR, color: rgb(0.3, 0.3, 0.35) });

      // Embed isi PDF
      const bytes  = await downloadAsArrayBuffer(att.path);
      const attDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages  = await mergedDoc.copyPages(attDoc, attDoc.getPageIndices());
      pages.forEach(p => mergedDoc.addPage(p));
      merged++;
    } catch (e) {
      failed++;
      failedNames.push(att.name);
      console.error('Merge fail', att.name, e);
      const err = mergedDoc.addPage([595.28, 841.89]);
      err.drawText('LAMPIRAN GAGAL DIMUAT', { x: 40, y: 760, size: 14, font: helv, color: rgb(0.86, 0.15, 0.15) });
      err.drawText(att.name, { x: 40, y: 735, size: 11, font: helvR, color: rgb(0.2, 0.2, 0.25), maxWidth: 515 });
      err.drawText(String(e.message || e), { x: 40, y: 715, size: 9, font: helvR, color: rgb(0.5, 0.5, 0.55), maxWidth: 515 });
    }
  }

  const finalBytes = await mergedDoc.save();
  const blob = new Blob([finalBytes], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { merged, failed, failedNames };
}

// ─── UI primitives ───────────────────────────────────────────────────────────
const Card = ({ children, t, style = {} }) => (
  <div style={{ borderRadius: 12, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.sm, ...style }}>{children}</div>
);

const SLabel = ({ children, icon, t }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
    {icon && <span style={{ display: "flex", color: t.blue }}>{icon}</span>}
    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: t.mid }}>{children}</span>
  </div>
);

const MetCard = ({ label, value, sub, accent, t }) => (
  <div style={{
    padding: "18px 20px", borderRadius: 11, background: t.card, border: `1px solid ${t.line}`,
    display: "flex", flexDirection: "column", gap: 6, position: "relative", overflow: "hidden",
  }}>
    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: accent }} />
    <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase", color: t.lo }}>{label}</div>
    <div style={{ fontSize: "clamp(18px, 2.6vw, 22px)", fontWeight: 700, letterSpacing: "-0.025em", color: t.hi, fontVariantNumeric: "tabular-nums", lineHeight: 1.15 }}>{value}</div>
    <div style={{ fontSize: 11.5, color: t.mid, marginTop: 1 }}>{sub}</div>
  </div>
);

const TR = ({ label, amount, ratio, indent = 0, kind = "data", t }) => {
  const neg = (amount || 0) < 0;
  const isSec = kind === "section", isSub = kind === "subtot", isTot = kind === "total", isNet = kind === "net", isBlank = kind === "blank";
  if (isBlank) return <tr><td colSpan={3} style={{ padding: "3px 0" }}></td></tr>;

  const bg = isSub ? "rgba(50,188,173,0.10)" : isTot || isNet ? (neg ? t.redBg : t.greenBg) : "transparent";
  const tc = isSub ? "#32BCAD" : isTot || isNet ? (neg ? t.red : t.green) : neg && !isSec ? t.red : isSec ? t.hi : t.hi;
  const fw = isSec || isSub || isTot || isNet ? 600 : 400;
  const fs = isSec ? 13 : isSub || isTot || isNet ? 12.5 : 12.5;
  const bt = isTot || isNet ? `1.5px solid ${neg ? t.redBd : t.greenBd}` : "none";
  const vp = isTot || isNet ? "11px 16px" : "8px 16px";

  return (
    <tr className="fin-tr" style={{ borderTop: isSec ? `1px solid ${t.line}` : "none" }}>
      <td style={{ padding: vp, paddingLeft: 16 + indent * 16, fontSize: fs, fontWeight: fw, color: tc, background: bg, borderTop: bt, borderBottom: `1px solid ${t.lineSoft}` }}>{label}</td>
      <td style={{ padding: vp, textAlign: "right", fontSize: fs, fontWeight: fw, color: tc, background: bg, borderTop: bt, borderBottom: `1px solid ${t.lineSoft}`, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{amount !== null && amount !== undefined ? idr(amount) : ""}</td>
      <td style={{ padding: vp, textAlign: "right", fontSize: isTot || isNet ? 11.5 : 11, fontWeight: isTot || isNet ? 600 : 400, color: isTot || isNet ? tc : t.lo, background: bg, borderTop: bt, borderBottom: `1px solid ${t.lineSoft}`, fontVariantNumeric: "tabular-nums" }}>{ratio !== null && ratio !== undefined ? rto(ratio) : ""}</td>
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

  const d = theme === "dark", t = mk(d);
  const toast$ = (type, msg) => { setToast({ show: true, type, msg }); setTimeout(() => setToast((p) => ({ ...p, show: false })), 4000); };

  useEffect(() => {
    if (!activeContext?.mpxName || !activeContext?.branch || !activeContext?.month || !activeContext?.year) {
      setLoading(false); setData(null); return;
    }
    setLoading(true); setError(null);
    (async () => {
      try {
        const bq = () => supabase.from("pnl_reports").select("*")
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

  // FIX: kumpulkan attachments dari 3 kolom dan kirim ke makePDF
  const handlePDF = async () => {
    if (!data || !report) return;
    setGenPdf(true);
    try {
      const att = [
        ...(Array.isArray(data.attachments_pendapatan)  ? data.attachments_pendapatan  : []).map(a => ({ ...a, category: 'Pendapatan' })),
        ...(Array.isArray(data.attachments_pengeluaran) ? data.attachments_pengeluaran : []).map(a => ({ ...a, category: 'Pengeluaran' })),
        ...(Array.isArray(data.attachments_marketing)   ? data.attachments_marketing   : []).map(a => ({ ...a, category: 'Marketing' })),
      ];
      const res = await makePDF(data, report, activeContext, att);
      if (res?.merged > 0 && res?.failed === 0)      toast$('success', `PDF berhasil diunduh dengan ${res.merged} lampiran terlampir`);
      else if (res?.merged > 0 && res?.failed > 0)   toast$('success', `PDF diunduh: ${res.merged} berhasil, ${res.failed} gagal dilampirkan`);
      else if (res?.failed > 0)                      toast$('error',   `PDF utama diunduh tapi ${res.failed} lampiran gagal`);
      else                                            toast$('success', 'PDF berhasil diunduh');
    } catch (e) {
      console.error(e);
      toast$('error', 'Gagal membuat PDF: ' + e.message);
    } finally {
      setGenPdf(false);
    }
  };

  if (loading) return (
    <><G d={d} t={t} /><div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, gap: 14, fontFamily: FONT_STACK }}>
      <div style={{ position: "relative", width: 52, height: 52 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2.5px solid transparent", borderTopColor: "#ED1C24", borderRightColor: "#C6168D", animation: "spin 0.9s linear infinite" }} />
        <div style={{ position: "absolute", inset: 8, borderRadius: 10, background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)", display: "flex", alignItems: "center", justifyContent: "center", animation: "breathe 1.8s ease-in-out infinite", boxShadow: "0 4px 14px rgba(237,28,36,0.4)" }}><BarChart3 size={18} color="#FFFFFF" /></div>
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase", color: t.mid }}>Memuat laporan…</span>
    </div></>
  );

  if (!activeContext?.mpxName) return (
    <><G d={d} t={t} /><div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, gap: 12, opacity: 0.7, fontFamily: FONT_STACK }}>
      <Search size={36} style={{ color: t.lo, strokeWidth: 1.5 }} />
      <div style={{ fontSize: 13.5, fontWeight: 500, color: t.mid }}>Pilih Partner dan Cabang terlebih dahulu</div>
    </div></>
  );

  if (error || !data || !report) return (
    <><G d={d} t={t} /><div style={{ maxWidth: 480, margin: "48px auto", padding: 28, borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, textAlign: "center", boxShadow: t.md, fontFamily: FONT_STACK }}>
      <div style={{ width: 50, height: 50, borderRadius: 12, background: t.sub, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", border: `1px solid ${t.line}` }}><AlertCircle size={24} style={{ color: t.lo }} /></div>
      <div style={{ fontSize: 16, fontWeight: 600, color: t.hi, marginBottom: 8 }}>{error ? "Terjadi Kesalahan" : "Data Tidak Tersedia"}</div>
      <div style={{ fontSize: 13, color: t.mid, lineHeight: 1.6, marginBottom: 18 }}>{error ? <span style={{ color: t.red }}>{error}</span> : <>Belum ada laporan untuk <strong style={{ color: t.hi }}>{activeContext.mpxName}</strong> periode {activeContext.month} {activeContext.year}.</>}</div>
    </div></>
  );

  const notes = data.validation_notes || "";
  const hasPend = notes.includes("pendapatan:final");
  const hasPeng = notes.includes("pengeluaran:final");
  const mpcType = data.mpc_mp3 || activeContext?.mpxType || "";
  const netPos  = report.net >= 0;

  const totalAtt =
    (data.attachments_pendapatan?.length || 0) +
    (data.attachments_pengeluaran?.length || 0) +
    (data.attachments_marketing?.length || 0);

  const pnlRows = [
    { label: "A.  Omset Penjualan",        amount: report.tom,  ratio: 100,                   kind: "section" },
    ...(report.osp ? [{ label: "SP Regular",      amount: report.osp, ratio: report.p(report.osp), indent: 1 }] : []),
    ...(report.ovc ? [{ label: "Voucher Fisik",   amount: report.ovc, ratio: report.p(report.ovc), indent: 1 }] : []),
    ...(report.mj  ? [{ label: "Saldo MOBO",      amount: report.mj,  ratio: report.p(report.mj),  indent: 1 }] : []),
    { kind: "blank" },

    { label: "B.  Struktur Pendapatan",    amount: report.tpd,  ratio: report.p(report.tpd),  kind: "section" },
    { label: "Total Margin Produk",        amount: report.tmg,  ratio: report.p(report.tmg),  indent: 1, kind: "subtot" },
    ...(report.msp ? [{ label: "— SP Regular",    amount: report.msp, ratio: report.p(report.msp), indent: 2 }] : []),
    ...(report.mvc ? [{ label: "— Voucher Fisik", amount: report.mvc, ratio: report.p(report.mvc), indent: 2 }] : []),

    { label: "Total Komisi & Insentif",    amount: report.tko,  ratio: report.p(report.tko),  indent: 1, kind: "subtot" },
    ...(report.up  ? [{ label: "— Upfront Discount",  amount: report.up,  ratio: report.p(report.up),  indent: 2 }] : []),
    ...(report.smg ? [{ label: "— Sales Margin",       amount: report.smg, ratio: report.p(report.smg), indent: 2 }] : []),
    ...(report.sla ? [{ label: "— Monthly Fee SLA",    amount: report.sla, ratio: report.p(report.sla), indent: 2 }] : []),
    ...(report.spc ? [{ label: "— Tactical Program",    amount: report.spc, ratio: report.p(report.spc), indent: 2 }] : []),

    { label: "Total Hadiah & Lainnya",     amount: report.thd,  ratio: report.p(report.thd),  indent: 1, kind: "subtot" },
    ...(report.rwc ? [{ label: "— Champions Club",     amount: report.rwc, ratio: report.p(report.rwc), indent: 2 }] : []),
    ...(report.rwl ? [{ label: "— Hadiah Lainnya",     amount: report.rwl, ratio: report.p(report.rwl), indent: 2 }] : []),
    ...(report.pic ? [{ label: "— Partner Income",     amount: report.pic, ratio: report.p(report.pic), indent: 2 }] : []),

    { label: "TOTAL PENDAPATAN",           amount: report.tpd,  ratio: report.p(report.tpd),  kind: "total" },
    { kind: "blank" },

    { label: "C.  Struktur Pengeluaran",   amount: report.tpg,  ratio: report.p(report.tpg),  kind: "section" },
    ...(report.tox ? [{ label: "OPEX Branch",             amount: report.tox, ratio: report.p(report.tox), indent: 1 }] : []),
    ...(report.tsd ? [{ label: "SDM Branch",              amount: report.tsd, ratio: report.p(report.tsd), indent: 1 }] : []),
    ...(report.tmk ? [{
      label: report.tmkLain > 0 ? "Marketing (Reguler + Program Lain)" : "Marketing & Cluster Dev",
      amount: report.tmk, ratio: report.p(report.tmk), indent: 1
    }] : []),
    ...(report.tmkStatic && report.tmkLain > 0 ? [{ label: "— Program Reguler",   amount: report.tmkStatic, ratio: report.p(report.tmkStatic), indent: 2 }] : []),
    ...(report.tmkLain   > 0                   ? [{ label: "— Program Lain",       amount: report.tmkLain,   ratio: report.p(report.tmkLain),   indent: 2 }] : []),
    ...(report.tcm ? [{ label: "Cost of Money",           amount: report.tcm, ratio: report.p(report.tcm), indent: 1 }] : []),
    ...(report.pex ? [{ label: "Partner Expense",         amount: report.pex, ratio: report.p(report.pex), indent: 1 }] : []),
    { label: "TOTAL PENGELUARAN",          amount: report.tpg,  ratio: report.p(report.tpg),  kind: "total" },
  ];

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", paddingBottom: 48, fontFamily: FONT_STACK, WebkitFontSmoothing: "antialiased", color: t.hi }}>
      <G d={d} t={t} />
      <AnimatePresence>
        {toast.show && (
          <motion.div initial={{ opacity: 0, y: -10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }} transition={{ duration: 0.17 }} style={{ position: "fixed", top: 70, right: 16, zIndex: 999, width: 320, maxWidth: "calc(100vw - 32px)" }}>
            <div style={{ background: t.card, border: `1px solid ${toast.type === "success" ? t.greenBd : t.redBd}`, borderRadius: 12, boxShadow: t.lg, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "12px 14px" }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: toast.type === "success" ? t.green : t.red, color: "#FFFFFF" }}>{toast.type === "success" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}</div>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, color: t.hi }}>{toast.type === "success" ? "Berhasil" : "Error"}</div><div style={{ fontSize: 12, color: t.mid, marginTop: 2, lineHeight: 1.5 }}>{toast.msg}</div></div>
                <button onClick={() => setToast((p) => ({ ...p, show: false }))} style={{ background: "none", border: "none", cursor: "pointer", color: t.lo, display: "flex" }}><X size={14} /></button>
              </div>
              <motion.div initial={{ width: "100%" }} animate={{ width: "0%" }} transition={{ duration: 4, ease: "linear" }} style={{ height: 2, background: toast.type === "success" ? t.green : t.red }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13, minWidth: 0, flex: 1 }}>
          <div style={{ width: 46, height: 46, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)", color: "#FFFFFF", boxShadow: "0 2px 10px rgba(237,28,36,0.30)" }}><BarChart3 size={22} strokeWidth={2} /></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "clamp(18px, 2.6vw, 22px)", fontWeight: 700, letterSpacing: "-0.025em", color: t.hi, lineHeight: 1.2 }}>PnL Financial Summary</div>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: t.mid, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[mpcType, activeContext?.mpxName, activeContext?.branch].filter(Boolean).join("  ·  ")}{activeContext?.month ? `  ·  ${activeContext.month} ${activeContext.year}` : ""}</div>
          </div>
        </div>
        <button onClick={handlePDF} disabled={genPdf} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 8, background: genPdf ? t.sub : "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)", color: "#FFFFFF", border: "none", cursor: genPdf ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, boxShadow: genPdf ? "none" : "0 2px 10px rgba(237,28,36,0.30)", opacity: genPdf ? 0.7 : 1, transition: "all .14s", flexShrink: 0, fontFamily: "inherit" }}>
          {genPdf ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />Membuat PDF…</> : <><Download size={14} />Download PDF</>}
        </button>
      </div>

      {/* ── Status banner ── */}
      <div style={{ padding: "12px 14px", borderRadius: 10, marginBottom: 16, border: `1px solid ${data.is_finalized ? t.greenBd : t.amberBd}`, background: data.is_finalized ? t.greenBg : t.amberBg, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
          {data.is_finalized ? <CheckCircle2 size={17} style={{ color: t.green, flexShrink: 0 }} /> : <Clock size={17} style={{ color: t.amber, flexShrink: 0 }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: data.is_finalized ? t.green : t.amber }}>{data.is_finalized ? "Laporan tervalidasi & final" : "Status draft — belum difinalisasi"}</div>
            <div style={{ fontSize: 11.5, color: t.mid, marginTop: 2 }}>{data.is_finalized && data.finalized_at ? `Difinalisasi: ${dtf(data.finalized_at)}` : data.updated_at ? `Terakhir disimpan: ${dtf(data.updated_at)}` : null}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {hasPend && <Pill icon={<CheckCircle2 size={11} />} text="Pendapatan final" color={t.green}   bg={t.greenBg}   bd={t.greenBd} />}
          {hasPeng && <Pill icon={<CheckCircle2 size={11} />} text="Pengeluaran final" color={t.magenta} bg={t.magentaBg} bd={t.magentaBd} />}
        </div>
      </div>

      {/* ── Lampiran info banner (di LUAR grid metric) ── */}
      {totalAtt > 0 && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 9, border: `1px solid ${t.blueBd}`, background: t.blueBg, display: "flex", alignItems: "center", gap: 8 }}>
          <Paperclip size={14} style={{ color: t.blue, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: t.blue, fontWeight: 600 }}>
            {totalAtt} lampiran PDF akan disertakan otomatis di halaman akhir saat download
          </span>
        </div>
      )}

      {/* ── Metric cards ── */}
      <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 22 }}>
        <MetCard label="Total Omset"       value={idr(report.tom)} sub="SP + Voucher + MOBO"      accent="#ED1C24"  t={t} />
        <MetCard label="Total Pendapatan"  value={idr(report.tpd)} sub="Margin + Komisi + Hadiah" accent="#32BCAD"  t={t} />
        <MetCard label="Total Pengeluaran" value={idr(report.tpg)} sub="OPEX + SDM + MKT + COM + Partner" accent={t.red} t={t} />
      </div>

      {/* ── Financial Structure table ── */}
      <Card t={t} style={{ marginBottom: 22, overflow: "hidden" }}>
        <div style={{ padding: "13px 18px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: t.hi }}>Financial Structure</div>
          <div style={{ fontSize: 11.5, color: t.mid }}>{activeContext?.month} {activeContext?.year}  ·  Rasio % terhadap Omset</div>
        </div>
        <div className="tbl">
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 540 }}>
            <thead>
              <tr style={{ background: t.sub }}>
                {[["Financial Structure", "left", "55%"], ["Jumlah (IDR)", "right", "30%"], ["Rasio", "right", "15%"]].map(([h, a, w]) => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: a, width: w, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: t.mid, borderBottom: `1px solid ${t.line}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>{pnlRows.map((row, i) => <TR key={i} {...row} t={t} />)}</tbody>
          </table>
        </div>

        {/* ── Net Profit footer ── */}
        <div style={{ padding: "18px 22px", background: netPos ? t.greenBg : t.redBg, borderTop: `1.5px solid ${netPos ? t.greenBd : t.redBd}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase", color: netPos ? t.green : t.red, marginBottom: 6 }}>NET PROFIT BEFORE TAX</div>
            <div style={{ fontSize: "clamp(22px, 3.6vw, 32px)", fontWeight: 700, letterSpacing: "-0.03em", color: netPos ? t.green : t.red, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{idr(report.net)}</div>
            <div style={{ fontSize: 12, color: t.mid, marginTop: 6 }}>Total Pendapatan − Total Pengeluaran</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 7 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: netPos ? t.green : t.red, fontVariantNumeric: "tabular-nums" }}>{rto(report.p(report.net))}</div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 99, background: netPos ? t.green : t.red, color: "#FFFFFF", fontSize: 12, fontWeight: 600 }}>{netPos ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{netPos ? "Profit" : "Loss"}</div>
          </div>
        </div>
      </Card>

      {/* ── Pendapatan / Pengeluaran cards ── */}
      <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Card t={t}>
          <div style={{ padding: "20px 22px" }}>
            <SLabel icon={<ArrowUpRight size={13} />} t={t}>Struktur Pendapatan</SLabel>
            {[
              { label: "Margin Produk",     val: report.tmg, note: "Margin SP + Margin VC" },
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 14, marginTop: 4, borderTop: `1.5px solid rgba(50,188,173,0.35)` }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#32BCAD" }}>Total Pendapatan</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: "#32BCAD", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{idr(report.tpd)}</span>
            </div>
          </div>
        </Card>

        <Card t={t}>
          <div style={{ padding: "20px 22px" }}>
            <SLabel icon={<ArrowDownLeft size={13} />} t={t}>Struktur Pengeluaran</SLabel>
            {[
              { label: "OPEX Branch",         val: report.tox },
              { label: "SDM Branch",          val: report.tsd },
              {
                label: report.tmkLain > 0 ? "Marketing (Reg. + Lain)" : "Marketing & Cluster Dev",
                val: report.tmk,
                note: report.tmkLain > 0
                  ? `Reguler: ${idr(report.tmkStatic)} · Lain: ${idr(report.tmkLain)}`
                  : null
              },
              { label: "Cost of Money",       val: report.tcm },
              { label: "Partner Expense",     val: report.pex },
            ].map((row, i) => (
              <div key={i} style={{ padding: "11px 0", borderBottom: `1px solid ${t.lineSoft}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: t.hi }}>{row.label}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: t.hi, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{idr(row.val)}</span>
                </div>
                {row.note && <div style={{ fontSize: 11, color: t.lo, marginTop: 3 }}>{row.note}</div>}
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 14, marginTop: 4, borderTop: `1.5px solid ${t.redBd}` }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: t.red }}>Total Pengeluaran</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: t.red, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{idr(report.tpg)}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

function Pill({ icon, text, color, bg, bd }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 99, background: bg, border: `1px solid ${bd}`, fontSize: 11.5, color, fontWeight: 600, fontFamily: "inherit" }}>
      {icon}{text}
    </span>
  );
}

export default MPX_Summary_PNL;
