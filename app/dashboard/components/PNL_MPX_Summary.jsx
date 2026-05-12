"use client";

import React, { useState, useMemo, useEffect } from "react";
import supabase from "../../../lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3, TrendingUp, TrendingDown, Download, Loader2,
  AlertCircle, Search, CheckCircle2, Clock, X,
  ArrowUpRight, ArrowDownLeft, Wallet, Receipt,
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

const FONT_STACK = `-apple-system, BlinkMacSystemFont, "Segoe UI", "SF Pro Text", Roboto, system-ui, sans-serif`;

// ─── Design tokens — slate + blue, consistent with the shell ─────────────────
const mk = (d) => ({
  bg:        d ? "#0A0C12" : "#F7F8FA",
  card:      d ? "#11141C" : "#FFFFFF",
  sub:       d ? "#171B26" : "#F2F4F8",
  hover:     d ? "#171B26" : "#F4F6FB",

  line:      d ? "#242937" : "#E4E7EE",
  lineSoft:  d ? "#1C2030" : "#EDEFF4",

  hi:        d ? "#F1F5F9" : "#0F172A",
  mid:       d ? "#94A3B8" : "#64748B",
  lo:        d ? "#64748B" : "#94A3B8",
  faint:     d ? "#475569" : "#CBD5E1",

  blue:      "#0A84FF",
  blueBg:    d ? "#0E223F" : "#E8F1FF",
  blueBd:    d ? "#1B3A6E" : "#BFD9FF",
  blueSoft:  d ? "#122B52" : "#F0F6FF",

  green:     d ? "#34D399" : "#16A34A",
  greenBg:   d ? "#0F2A1F" : "#E8F7EE",
  greenBd:   d ? "#1F4A33" : "#BFE5CC",

  amber:     d ? "#FBBF24" : "#D97706",
  amberBg:   d ? "#251D08" : "#FFF7E5",
  amberBd:   d ? "#4A3914" : "#F5DDA8",

  red:       d ? "#F87171" : "#DC2626",
  redBg:     d ? "#2A1414" : "#FEEDEC",
  redBd:     d ? "#4A1F1F" : "#F5C8C5",

  sm: d ? "0 1px 2px rgba(0,0,0,0.45)"  : "0 1px 2px rgba(15,23,42,0.05)",
  md: d ? "0 6px 18px rgba(0,0,0,0.40)" : "0 6px 18px rgba(15,23,42,0.08)",
  lg: d ? "0 20px 48px rgba(0,0,0,0.55)": "0 20px 48px rgba(15,23,42,0.14)",
});

// ─── Global CSS ──────────────────────────────────────────────────────────────
const G = ({ d, t }) => (
  <style>{`
    *{box-sizing:border-box}
    ::-webkit-scrollbar{width:8px;height:8px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:${d ? "#2A3144" : "#D1D6E0"};border-radius:99px}
    ::-webkit-scrollbar-thumb:hover{background:${d ? "#3A4258" : "#B6BDCC"}}
    .fin-tr:hover td{background:${d ? "#141826" : "#F4F6FB"}!important}
    @keyframes breathe{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.92)}}
    @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
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

// ─── Calculations (preserved 1:1 from original) ──────────────────────────────
function calcR(data) {
  if (!data) return null;
  const g = (k) => Number(data[k]) || 0;
  const hsp = { qty_sp_3gb_im3: 29000, qty_sp_0_im3: 10000, qty_sp_kpk_3id: 10000, qty_sp_3gb_3id: 29000 };
  const hvc = {
    qty_vc_0_im3: 300, qty_vc_2_5gb: 12600, qty_vc_3gb_30: 19500,
    qty_vc_3_5gb_5d: 13750, qty_vc_5gb_5d: 16800, qty_vc_7gb_7d: 22400,
    qty_vc_fi_4gb: 24500, qty_vc_fi_1_5gb_1d: 4500, qty_vc_fi_3gb_1d: 6600,
    qty_vc_fi_5gb_2d: 8300, qty_vc_fi_3gb_3d: 11600, qty_vc_fi_5gb_3d: 12800,
    qty_vc_fi_15gb_7d: 27900, qty_vc_0_3id: 500,
  };
  const sd = [
    ["qty_sp_3gb_im3", "retail_sp_3gb_im3"],
    ["qty_sp_0_im3",   "retail_sp_0_im3"],
    ["qty_sp_kpk_3id", "retail_sp_kpk_3id"],
    ["qty_sp_3gb_3id", "retail_sp_3gb_3id"],
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
  const osp = sd.reduce((a, [q, r]) => a + g(q) * g(r), 0);
  const ovc = vd.reduce((a, [q, r]) => a + g(q) * g(r), 0);
  const mj  = g("mobo_jual"), mm = g("mobo_modal");
  const tom = osp + ovc + mj;

  const msp = sd.reduce((a, [q, r]) => a + g(q) * (g(r) - (hsp[q] || 0)), 0);
  const mvc = vd.reduce((a, [q, r]) => a + g(q) * (g(r) - (hvc[q] || 0)), 0);
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
    ["price_sdm_bm",      "qty_sdm_bm"],
    ["price_sdm_admin",   "qty_sdm_admin"],
    ["price_sdm_finance", "qty_sdm_finance"],
    ["price_sdm_md",      "qty_sdm_md"],
    ["price_sdm_ss",      "qty_sdm_ss"],
    ["price_sdm_ops",     "qty_sdm_ops"],
    ["price_sdm_dinas",   "qty_sdm_dinas"],
  ]);
  const tmk = cs([
    ["price_mkt_ws",     "qty_mkt_ws"],
    ["price_mkt_retail", "qty_mkt_retail"],
    ["price_mkt_event",  "qty_mkt_event"],
    ["price_mkt_lain",   "qty_mkt_lain"],
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
    tom, osp, ovc, mj, mm,
    msp, mvc, mmb, tmg,
    up, smg, sla, spc, tko,
    rwc, rwl, pic, thd, tpd,
    tox, tsd, tmk, tcm, pex, tpg,
    net, p,
    hsp, hvc, sd, vd, g,
  };
}

// ─── Product display names (shared by UI + PDF) ──────────────────────────────
const PROD_NAMES = {
  qty_sp_3gb_im3: "SP 3GB IM3", qty_sp_0_im3: "SP 0 IM3",
  qty_sp_kpk_3id: "SP KPK 3ID", qty_sp_3gb_3id: "SP 3GB 3ID",
  qty_vc_0_im3: "VC 0 IM3", qty_vc_2_5gb: "VC 2.5GB", qty_vc_3gb_30: "VC 3GB/30",
  qty_vc_3_5gb_5d: "VC 3.5GB/5D", qty_vc_5gb_5d: "VC 5GB/5D", qty_vc_7gb_7d: "VC 7GB/7D",
  qty_vc_fi_4gb: "VC FI 4GB", qty_vc_fi_1_5gb_1d: "VC FI 1.5GB/1D",
  qty_vc_fi_3gb_1d: "VC FI 3GB/1D", qty_vc_fi_5gb_2d: "VC FI 5GB/2D",
  qty_vc_fi_3gb_3d: "VC FI 3GB/3D", qty_vc_fi_5gb_3d: "VC FI 5GB/3D",
  qty_vc_fi_15gb_7d: "VC FI 15GB/7D", qty_vc_0_3id: "VC 0 3ID",
};

// ─── PDF Generator — clean 3-page export ─────────────────────────────────────
async function makePDF(data, r, ctx) {
  // Load jsPDF + autoTable from CDN once
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

  // Page dimensions
  const W = 210, H = 297, ML = 14, MR = 14, UW = W - ML - MR;

  // Palette — print-friendly, blue + slate
  const C = {
    ink:    "#0F172A",
    slate:  "#475569",
    gray:   "#64748B",
    silver: "#94A3B8",
    rule:   "#E2E8F0",
    tint:   "#F8FAFC",
    white:  "#FFFFFF",
    navy:   "#0F2A52",
    blue:   "#0A84FF",
    blueLt: "#EFF5FF",
    blueBd: "#BFD9FF",
    grn:    "#15803D",
    grnLt:  "#ECFDF3",
    grnBd:  "#BFE5CC",
    red:    "#B91C1C",
    redLt:  "#FEF2F2",
    redBd:  "#F5C8C5",
  };

  // Number formatters
  const fR = (v) => {
    v = parseFloat(v) || 0;
    const s = "Rp " + Math.abs(v).toLocaleString("id-ID", { maximumFractionDigits: 0 });
    return v < 0 ? `(${s})` : s;
  };
  const fN = (v) => {
    v = parseFloat(v) || 0;
    if (!v) return "—";
    const s = Math.abs(v).toLocaleString("id-ID", { maximumFractionDigits: 0 });
    return v < 0 ? `(${s})` : s;
  };
  const fP = (v) => {
    v = parseFloat(v) || 0;
    return v ? v.toFixed(1).replace(".", ",") + " %" : "—";
  };

  const partner = data.partner_name || "—";
  const branch  = data.branch || "—";
  const month   = ctx?.month || "—";
  const year    = String(ctx?.year || "");
  const mpc     = data.mpc_mp3 || "—";
  const subLine = `${mpc}  ·  ${partner}  ·  ${branch}  ·  ${month} ${year}`;

  const pgLbl = {
    1: "P&L Summary",
    2: "Detail Pendapatan",
    3: "Detail Pengeluaran",
  };
  let Y = 0;
  const gd = (k) => parseFloat(data[k]) || 0;

  // ── Page header + footer chrome ─────────────────────────────────────────────
  function hdrFtr(pg) {
    // Top thin navy bar
    doc.setFillColor(C.navy); doc.rect(0, 0, W, 9, "F");
    doc.setTextColor(C.white); doc.setFontSize(8.5); doc.setFont("helvetica", "bold");
    doc.text(`SandraHub  ·  ${pgLbl[pg] || ""}`, ML, 6);
    doc.setFontSize(6.8); doc.setFont("helvetica", "normal"); doc.setTextColor("#CBD5E1");
    doc.text(subLine, W - MR, 6, { align: "right" });

    // Bottom footer line
    doc.setDrawColor(C.rule); doc.setLineWidth(0.2);
    doc.line(ML, H - 9, W - MR, H - 9);
    doc.setTextColor(C.silver); doc.setFontSize(6);
    doc.text("Confidential  ·  Internal use only", ML, H - 5);
    doc.text(`Halaman ${pg} dari 3`, W - MR, H - 5, { align: "right" });
  }

  // ── Section bar ─────────────────────────────────────────────────────────────
  function secBar(lbl, sub) {
    doc.setFillColor(C.navy); doc.rect(ML, Y, UW, 6.4, "F");
    doc.setTextColor(C.white); doc.setFontSize(8); doc.setFont("helvetica", "bold");
    doc.text(lbl, ML + 3, Y + 4.3);
    if (sub) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
      doc.setTextColor("#CBD5E1");
      doc.text(sub, W - MR - 3, Y + 4.3, { align: "right" });
    }
    Y += 7.6;
  }

  // ── Sub-section bar ─────────────────────────────────────────────────────────
  function subBar(lbl) {
    doc.setFillColor(C.blueLt); doc.setDrawColor(C.blueBd); doc.setLineWidth(0.2);
    doc.rect(ML, Y, UW, 5.6, "FD");
    doc.setTextColor(C.navy); doc.setFontSize(7.2); doc.setFont("helvetica", "bold");
    doc.text(lbl, ML + 3, Y + 3.8);
    Y += 6.6;
  }

  // ── autoTable helper ────────────────────────────────────────────────────────
  function aT(head, body, cws, totalIdx, totalBg) {
    doc.autoTable({
      startY: Y,
      margin: { left: ML, right: MR },
      head: [head],
      body,
      columnStyles: Object.fromEntries(cws.map(([i, w, a]) => [i, { cellWidth: w, halign: a || "left" }])),
      headStyles: {
        fillColor: C.tint, textColor: C.slate,
        fontStyle: "bold", fontSize: 6.5,
        lineWidth: 0.15, lineColor: C.rule,
        cellPadding: { top: 3, bottom: 3, left: 3.5, right: 3.5 },
      },
      bodyStyles: {
        fontSize: 7, textColor: C.ink,
        lineWidth: 0.15, lineColor: C.rule,
        cellPadding: { top: 2.8, bottom: 2.8, left: 3.5, right: 3.5 },
      },
      alternateRowStyles: { fillColor: "#FAFBFD" },
      tableLineColor: C.rule, tableLineWidth: 0.15,
      didParseCell: (hook) => {
        if (totalIdx != null && hook.row.index === totalIdx) {
          hook.cell.styles.fillColor = totalBg || C.blueLt;
          hook.cell.styles.textColor = C.navy;
          hook.cell.styles.fontStyle = "bold";
          hook.cell.styles.fontSize  = 7.5;
          hook.cell.styles.cellPadding = { top: 3.8, bottom: 3.8, left: 3.5, right: 3.5 };
        }
      },
    });
    Y = doc.lastAutoTable.finalY + 3;
  }

  // ── Page-break check ────────────────────────────────────────────────────────
  function spk(need = 25) {
    if (Y + need > H - 14) {
      doc.addPage();
      hdrFtr(doc.getNumberOfPages());
      Y = 14;
    }
  }

  // ═══ PAGE 1 — SUMMARY ═══════════════════════════════════════════════════════
  hdrFtr(1); Y = 14;

  // Cover block
  doc.setFontSize(6.5); doc.setFont("helvetica", "bold"); doc.setTextColor(C.blue);
  Y += 4.5;
  doc.setFontSize(16); doc.setTextColor(C.ink); doc.setFont("helvetica", "bold");
  doc.text(partner, ML, Y);
  Y += 5.5;
  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(C.gray);
  doc.text(`${mpc}  ·  ${branch}  ·  ${month} ${year}`, ML, Y);
  Y += 4;
  doc.setDrawColor(C.navy); doc.setLineWidth(0.4);
  doc.line(ML, Y, ML + UW, Y);
  Y += 7;

  // 3 summary cards
  const cw3 = (UW - 4) / 3, ch = 16;
  const cards = [
    { l: "TOTAL OMSET",      v: r.tom, s: "SP + Voucher + MOBO",    clr: C.navy },
    { l: "TOTAL PENDAPATAN", v: r.tpd, s: "Margin + Komisi + Hadiah", clr: C.grn },
    { l: "TOTAL PENGELUARAN",v: r.tpg, s: "OPEX + SDM + Mkt + COM", clr: C.red },
  ];
  cards.forEach((c, i) => {
    const X = ML + i * (cw3 + 2);
    doc.setFillColor(C.white); doc.setDrawColor(C.rule); doc.setLineWidth(0.3);
    doc.rect(X, Y, cw3, ch, "FD");
    doc.setFillColor(c.clr); doc.rect(X, Y, 1.8, ch, "F");
    doc.setFontSize(5.8); doc.setFont("helvetica", "bold"); doc.setTextColor(C.gray);
    doc.text(c.l, X + 4, Y + 4.5);
    doc.setFontSize(9.5); doc.setFont("helvetica", "bold"); doc.setTextColor(C.ink);
    doc.text(fR(c.v), X + 4, Y + 10.5);
    doc.setFontSize(5.8); doc.setFont("helvetica", "normal"); doc.setTextColor(C.gray);
    doc.text(c.s, X + 4, Y + 14);
  });
  Y += ch + 6;

  // P&L structure table
  secBar("FINANCIAL STRUCTURE", `Rasio terhadap Omset · ${month} ${year}`);

  const pnlRows = [
    { k: "secA", l: "A.  OMSET PENJUALAN" },
    { k: "sub",  l: "  Total Omset",            a: r.tom, p: 100 },
    { k: "data", l: "    SP Regular",           a: r.osp, p: r.p(r.osp) },
    { k: "data", l: "    Voucher",              a: r.ovc, p: r.p(r.ovc) },
    { k: "data", l: "    Saldo MOBO",           a: r.mj,  p: r.p(r.mj) },

    { k: "secB", l: "B.  STRUKTUR PENDAPATAN" },
    { k: "sub",  l: "  Total Margin Produk",    a: r.tmg, p: r.p(r.tmg) },
    { k: "data", l: "    SP Regular",           a: r.msp, p: r.p(r.msp) },
    { k: "data", l: "    Voucher",              a: r.mvc, p: r.p(r.mvc) },
    { k: "data", l: "    Saldo MOBO",           a: r.mmb, p: r.p(r.mmb) },
    { k: "sub",  l: "  Total Komisi & Insentif",a: r.tko, p: r.p(r.tko) },
    { k: "data", l: "    Upfront Discount",     a: r.up,  p: r.p(r.up) },
    { k: "data", l: "    Sales Margin",         a: r.smg, p: r.p(r.smg) },
    { k: "data", l: "    Monthly Fee SLA",      a: r.sla, p: r.p(r.sla) },
    { k: "data", l: "    Special Program",      a: r.spc, p: r.p(r.spc) },
    { k: "sub",  l: "  Total Hadiah & Lainnya", a: r.thd, p: r.p(r.thd) },
    { k: "data", l: "    Champions Club",       a: r.rwc, p: r.p(r.rwc) },
    { k: "data", l: "    Lainnya",              a: r.rwl, p: r.p(r.rwl) },
    { k: "data", l: "    Partner Income",       a: r.pic, p: r.p(r.pic) },
    { k: "totB", l: "TOTAL PENDAPATAN",         a: r.tpd, p: r.p(r.tpd) },

    { k: "secC", l: "C.  STRUKTUR PENGELUARAN" },
    { k: "data", l: "  OPEX Branch",            a: r.tox, p: r.p(r.tox) },
    { k: "data", l: "  SDM Branch",             a: r.tsd, p: r.p(r.tsd) },
    { k: "data", l: "  Marketing & Cluster",    a: r.tmk, p: r.p(r.tmk) },
    { k: "data", l: "  Cost of Money",          a: r.tcm, p: r.p(r.tcm) },
    { k: "data", l: "  Partner Expense",        a: r.pex, p: r.p(r.pex) },
    { k: "totR", l: "TOTAL PENGELUARAN",        a: r.tpg, p: r.p(r.tpg) },

    { k: "net",  l: "NET PROFIT / (LOSS)",      a: r.net, p: r.p(r.net) },
  ];

  doc.autoTable({
    startY: Y,
    margin: { left: ML, right: MR },
    head: [["Keterangan", "Nilai (IDR)", "Rasio"]],
    body: pnlRows.map((row) => {
      if (row.k === "secA" || row.k === "secB" || row.k === "secC") return [row.l, "", ""];
      return [row.l, fR(row.a), fP(row.p)];
    }),
    columnStyles: {
      0: { cellWidth: UW * 0.60 },
      1: { cellWidth: UW * 0.26, halign: "right" },
      2: { cellWidth: UW * 0.14, halign: "right" },
    },
    headStyles: {
      fillColor: C.navy, textColor: C.white,
      fontStyle: "bold", fontSize: 6.8,
      lineWidth: 0, cellPadding: { top: 3.2, bottom: 3.2, left: 3.5, right: 3.5 },
    },
    bodyStyles: {
      fontSize: 7, textColor: C.ink,
      lineWidth: 0.15, lineColor: C.rule,
      cellPadding: { top: 2.4, bottom: 2.4, left: 3.5, right: 3.5 },
    },
    tableLineColor: C.rule, tableLineWidth: 0.15,
    didParseCell: (hook) => {
      const row = pnlRows[hook.row.index]; if (!row) return;
      const k = row.k;
      if (k === "secA" || k === "secB" || k === "secC") {
        hook.cell.styles.fontStyle = "bold";
        hook.cell.styles.fontSize = 7.2;
        hook.cell.styles.fillColor = "#F1F5F9";
        hook.cell.styles.textColor = C.navy;
        hook.cell.styles.cellPadding = { top: 4, bottom: 2.5, left: 3.5, right: 3.5 };
      } else if (k === "sub") {
        hook.cell.styles.fontStyle = "bold";
        hook.cell.styles.fillColor = C.blueLt;
        hook.cell.styles.textColor = C.navy;
        hook.cell.styles.fontSize = 7;
        hook.cell.styles.cellPadding = { top: 2.8, bottom: 2.8, left: 3.5, right: 3.5 };
      } else if (k === "totB") {
        hook.cell.styles.fontStyle = "bold";
        hook.cell.styles.fillColor = C.grnLt;
        hook.cell.styles.textColor = C.grn;
        hook.cell.styles.fontSize = 7.6;
        hook.cell.styles.cellPadding = { top: 4, bottom: 4, left: 3.5, right: 3.5 };
      } else if (k === "totR") {
        hook.cell.styles.fontStyle = "bold";
        hook.cell.styles.fillColor = C.redLt;
        hook.cell.styles.textColor = C.red;
        hook.cell.styles.fontSize = 7.6;
        hook.cell.styles.cellPadding = { top: 4, bottom: 4, left: 3.5, right: 3.5 };
      } else if (k === "net") {
        const pos = (row.a || 0) >= 0;
        hook.cell.styles.fontStyle = "bold";
        hook.cell.styles.fontSize  = 8.4;
        hook.cell.styles.fillColor = pos ? C.grnLt : C.redLt;
        hook.cell.styles.textColor = pos ? C.grn : C.red;
        hook.cell.styles.cellPadding = { top: 5, bottom: 5, left: 3.5, right: 3.5 };
      } else if (k === "data" && hook.column.index === 1 && (row.a || 0) < 0) {
        hook.cell.styles.textColor = C.red;
      }
    },
  });
  Y = doc.lastAutoTable.finalY + 4;

  // Status pill
  const fin = data.is_finalized;
  const sBg = fin ? C.grnLt : "#FFF7E5";
  const sBd = fin ? C.grnBd : "#F5DDA8";
  const sFg = fin ? C.grn : "#92400E";
  doc.setFillColor(sBg); doc.setDrawColor(sBd); doc.setLineWidth(0.3);
  doc.rect(ML, Y, UW, 7.5, "FD");
  doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(sFg);
  doc.text(fin ? "Status: Tervalidasi & Final" : "Status: Draft (belum difinalisasi)", ML + 4, Y + 4.8);
  doc.setFontSize(6); doc.setFont("helvetica", "normal"); doc.setTextColor(C.gray);
  const stamp = (fin && data.finalized_at) ? dtf(data.finalized_at)
              : data.updated_at ? `Disimpan: ${dtf(data.updated_at)}`
              : "—";
  doc.text(stamp || "—", W - MR - 4, Y + 4.8, { align: "right" });

  // ═══ PAGE 2 — DETAIL PENDAPATAN ═════════════════════════════════════════════
  doc.addPage(); hdrFtr(2); Y = 14;
  doc.setFontSize(6.5); doc.setFont("helvetica", "bold"); doc.setTextColor(C.blue); Y += 4.5;
  doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(C.ink);
  doc.text(partner, ML, Y); Y += 4.5;
  doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(C.gray);
  doc.text(`${mpc}  ·  ${branch}  ·  ${month} ${year}`, ML, Y); Y += 4;
  doc.setDrawColor(C.navy); doc.setLineWidth(0.4);
  doc.line(ML, Y, ML + UW, Y); Y += 6;

  // A. Omset
  secBar("A.  OMSET PENJUALAN");
  aT(["Keterangan", "Nominal", "% terhadap Omset"],
    [
      ["SP Regular",     fR(r.osp), fP(r.p(r.osp))],
      ["Voucher Fisik",  fR(r.ovc), fP(r.p(r.ovc))],
      ["Saldo MOBO",     fR(r.mj),  fP(r.p(r.mj))],
      ["TOTAL OMSET",    fR(r.tom), "100,0 %"],
    ],
    [[0, UW * 0.56, "left"], [1, UW * 0.26, "right"], [2, UW * 0.18, "right"]],
    3, C.blueLt);

  // B. Margin Product
  secBar("B.  MARGIN PRODUCT");
  const mgHead = ["Produk", "Qty", "Retail (Rp)", "Margin (Rp)", "% kontrib."];
  const mgCws  = [
    [0, UW * 0.30, "left"], [1, UW * 0.13, "right"],
    [2, UW * 0.18, "right"], [3, UW * 0.22, "right"], [4, UW * 0.17, "right"],
  ];

  // SP
  subBar("a.  Starter Pack (SP) Regular");
  let spB = [], tSpMg = 0;
  r.sd.forEach(([qk, rk]) => {
    const qty = gd(qk), hpp = r.hsp[qk] || 0, ret = gd(rk);
    const penj = ret * qty, mg = penj - hpp * qty;
    tSpMg += mg;
    spB.push([
      PROD_NAMES[qk] || qk, fN(qty), fN(ret), fN(mg),
      fP(r.osp ? penj / r.osp * 100 : 0),
    ]);
  });
  spB.push(["Sub Total SP", "", "", fN(tSpMg), "100,0 %"]);
  aT(mgHead, spB, mgCws, spB.length - 1, C.blueLt);

  // VC
  subBar("b.  Voucher Fisik (VC)");
  let vcB = [], tVcMg = 0;
  r.vd.forEach(([qk, rk]) => {
    const qty = gd(qk), hpp = r.hvc[qk] || 0, ret = gd(rk);
    const penj = ret * qty, mg = penj - hpp * qty;
    tVcMg += mg;
    vcB.push([
      PROD_NAMES[qk] || qk, fN(qty), fN(ret), fN(mg),
      fP(r.ovc ? penj / r.ovc * 100 : 0),
    ]);
  });
  vcB.push(["Sub Total VC", "", "", fN(tVcMg), "100,0 %"]);
  aT(mgHead, vcB, mgCws, vcB.length - 1, C.blueLt);

  // MOBO
  subBar("c.  Saldo 3Sakti (MOBO)");
  const moboMg = r.mj - r.mm;
  aT(mgHead,
    [
      ["Saldo 3Sakti", "—", fN(r.mj), fN(moboMg), "100,0 %"],
      ["Sub Total MOBO", "", "", fN(moboMg), "100,0 %"],
    ],
    mgCws, 1, C.blueLt);

  // Total Margin strip
  spk(10);
  doc.setFillColor(C.navy); doc.rect(ML, Y, UW, 7, "F");
  doc.setTextColor(C.white); doc.setFontSize(8); doc.setFont("helvetica", "bold");
  doc.text("TOTAL MARGIN PRODUCT", ML + 3, Y + 4.8);
  doc.text(fR(r.tmg), W - MR - 3, Y + 4.8, { align: "right" });
  Y += 9;

  // C. Sales Fee
  spk(32);
  secBar("C.  KOMISI & INSENTIF");
  aT(["Keterangan", "Nominal", "% dari Komisi"],
    [
      ["Upfront (1,5% Modal MOBO)", fR(r.up),  fP(r.tko ? r.up  / r.tko * 100 : 0)],
      ["Sales Margin",              fR(r.smg), fP(r.tko ? r.smg / r.tko * 100 : 0)],
      ["Monthly Fee SLA",           fR(r.sla), fP(r.tko ? r.sla / r.tko * 100 : 0)],
      ["Special Program",           fR(r.spc), fP(r.tko ? r.spc / r.tko * 100 : 0)],
      ["TOTAL KOMISI",              fR(r.tko), "100,0 %"],
    ],
    [[0, UW * 0.56, "left"], [1, UW * 0.26, "right"], [2, UW * 0.18, "right"]],
    4, C.blueLt);

  // D. Hadiah
  spk(28);
  secBar("D.  HADIAH & LAINNYA");
  aT(["Keterangan", "Nominal", "% dari Hadiah"],
    [
      ["Champions Club", fR(r.rwc), fP(r.thd ? r.rwc / r.thd * 100 : 0)],
      ["Lainnya",        fR(r.rwl), fP(r.thd ? r.rwl / r.thd * 100 : 0)],
      ["Partner Income", fR(r.pic), fP(r.thd ? r.pic / r.thd * 100 : 0)],
      ["TOTAL HADIAH",   fR(r.thd), "100,0 %"],
    ],
    [[0, UW * 0.56, "left"], [1, UW * 0.26, "right"], [2, UW * 0.18, "right"]],
    3, C.blueLt);

  // Total Pendapatan
  spk(11);
  const posP = r.tpd >= 0;
  doc.setFillColor(posP ? C.grnLt : C.redLt);
  doc.setDrawColor(posP ? C.grn : C.red); doc.setLineWidth(0.6);
  doc.rect(ML, Y, UW, 9, "FD");
  doc.setFontSize(9); doc.setFont("helvetica", "bold");
  doc.setTextColor(posP ? C.grn : C.red);
  doc.text("TOTAL PENDAPATAN", ML + 4, Y + 6);
  doc.text(fR(r.tpd), W - MR - 4, Y + 6, { align: "right" });

  // ═══ PAGE 3 — DETAIL PENGELUARAN ════════════════════════════════════════════
  doc.addPage(); hdrFtr(3); Y = 14;
  doc.setFontSize(6.5); doc.setFont("helvetica", "bold"); doc.setTextColor(C.blue); Y += 4.5;
  doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(C.ink);
  doc.text(partner, ML, Y); Y += 4.5;
  doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(C.gray);
  doc.text(`${mpc}  ·  ${branch}  ·  ${month} ${year}`, ML, Y); Y += 4;
  doc.setDrawColor(C.navy); doc.setLineWidth(0.4);
  doc.line(ML, Y, ML + UW, Y); Y += 6;

  secBar("STRUKTUR PENGELUARAN");

  const peCws = [
    [0, UW * 0.50, "left"], [1, UW * 0.13, "right"],
    [2, UW * 0.17, "right"], [3, UW * 0.20, "right"],
  ];
  const peHead = ["Keterangan", "Qty", "Harga Satuan", "Total"];

  const sections = [
    {
      title: "1.  OPEX Branch",
      items: [
        ["Gedung",     "qty_opex_gedung",    "price_opex_gedung"],
        ["Kendaraan",  "qty_opex_kendaraan", "price_opex_kendaraan"],
        ["Listrik",    "qty_opex_listrik",   "price_opex_listrik"],
        ["Air",        "qty_opex_air",       "price_opex_air"],
        ["IT",         "qty_opex_it",        "price_opex_it"],
        ["Logistik",   "qty_opex_logistik",  "price_opex_logistik"],
        ["Asuransi",   "qty_opex_asuransi",  "price_opex_asuransi"],
        ["Lain-lain",  "qty_opex_lain",      "price_opex_lain"],
      ],
      totalLabel: "Sub Total OPEX", total: r.tox,
    },
    {
      title: "2.  SDM Branch",
      items: [
        ["Branch Manager", "qty_sdm_bm",      "price_sdm_bm"],
        ["Admin & WH",     "qty_sdm_admin",   "price_sdm_admin"],
        ["Finance",        "qty_sdm_finance", "price_sdm_finance"],
        ["MD",             "qty_sdm_md",      "price_sdm_md"],
        ["Sales Support",  "qty_sdm_ss",      "price_sdm_ss"],
        ["Staff Ops",      "qty_sdm_ops",     "price_sdm_ops"],
        ["Perj. Dinas",    "qty_sdm_dinas",   "price_sdm_dinas"],
      ],
      totalLabel: "Sub Total SDM", total: r.tsd,
    },
    {
      title: "3.  Marketing & Cluster",
      items: [
        ["Wholeseller", "qty_mkt_ws",     "price_mkt_ws"],
        ["Retail",      "qty_mkt_retail", "price_mkt_retail"],
        ["Event",       "qty_mkt_event",  "price_mkt_event"],
        ["Lainnya",     "qty_mkt_lain",   "price_mkt_lain"],
      ],
      totalLabel: "Sub Total Marketing", total: r.tmk,
    },
    {
      title: "4.  Cost of Money",
      items: [
        ["Adm. Bank", "qty_com_admin", "price_com_admin"],
        ["Bunga",     "qty_com_bunga", "price_com_bunga"],
      ],
      totalLabel: "Sub Total COM", total: r.tcm,
    },
  ];

  sections.forEach((sec) => {
    spk(sec.items.length * 6 + 18);
    subBar(sec.title);
    const rows = sec.items.map(([nm, qk, pk]) => {
      const qty = gd(qk), prc = gd(pk);
      return [nm, fN(qty), fN(prc), fN(qty * prc)];
    });
    rows.push([sec.totalLabel, "", "", fN(sec.total)]);
    aT(peHead, rows, peCws, rows.length - 1, C.blueLt);
  });

  // Partner Expense (single line, if any)
  if (r.pex) {
    spk(20);
    subBar("5.  Partner Expense");
    aT(peHead,
      [
        ["Partner Expense", "—", "—", fN(r.pex)],
        ["Sub Total Partner Expense", "", "", fN(r.pex)],
      ],
      peCws, 1, C.blueLt);
  }

  // Total Pengeluaran
  spk(12);
  doc.setFillColor(C.redLt); doc.setDrawColor(C.red); doc.setLineWidth(0.6);
  doc.rect(ML, Y, UW, 9, "FD");
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(C.red);
  doc.text("TOTAL PENGELUARAN", ML + 4, Y + 6);
  doc.text(fR(r.tpg), W - MR - 4, Y + 6, { align: "right" });
  Y += 12;

  // Net Profit hero
  spk(18);
  const posN = r.net >= 0;
  doc.setFillColor(posN ? C.grnLt : C.redLt);
  doc.setDrawColor(posN ? C.grn : C.red); doc.setLineWidth(0.9);
  doc.rect(ML, Y, UW, 14, "FD");
  doc.setFontSize(7); doc.setFont("helvetica", "bold");
  doc.setTextColor(posN ? C.grn : C.red);
  doc.text(posN ? "NET PROFIT BEFORE TAX" : "NET LOSS BEFORE TAX", ML + 4, Y + 5.5);
  doc.setFontSize(13);
  doc.text(fR(r.net), W - MR - 4, Y + 9, { align: "right" });
  doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(C.gray);
  doc.text(`${fP(r.p(r.net))} terhadap Omset`, ML + 4, Y + 11.5);

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
    isSub ? t.blueBg :
    isTot || isNet ? (neg ? t.redBg : t.greenBg) :
    "transparent";

  const tc =
    isSub ? t.blue :
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

  // ── Fetch (preserved 1:1) ──
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
        <div style={{
          width: 46, height: 46, borderRadius: 12, background: t.blue,
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "breathe 1.6s ease-in-out infinite",
        }}>
          <BarChart3 size={22} color="#FFFFFF" />
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
        <div style={{
          fontSize: 16, fontWeight: 600, color: t.hi, marginBottom: 8,
          letterSpacing: "-0.015em",
        }}>{error ? "Terjadi Kesalahan" : "Data Tidak Tersedia"}</div>
        <div style={{ fontSize: 13, color: t.mid, lineHeight: 1.6, marginBottom: 18 }}>
          {error
            ? <span style={{ color: t.red }}>{error}</span>
            : <>Belum ada laporan untuk{" "}
                <strong style={{ color: t.hi, fontWeight: 600 }}>{activeContext.mpxName}</strong>{" "}
                periode {activeContext.month} {activeContext.year}.</>}
        </div>
        <div style={{
          textAlign: "left", background: t.sub, borderRadius: 9,
          padding: "12px 14px", border: `1px solid ${t.line}`,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
            textTransform: "uppercase", color: t.lo, marginBottom: 8,
          }}>Query Context</div>
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
              <span style={{
                color: v ? t.hi : t.red,
                fontFamily: "ui-monospace,Menlo,monospace", fontWeight: 500,
              }}>{v || "undefined"}</span>
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

  // ── P&L rows (UI) ──
  const pnlRows = [
    { label: "A.  Omset Penjualan",        amount: report.tom, ratio: 100,                  kind: "section" },
    { label: "SP Regular",                 amount: report.osp, ratio: report.p(report.osp), indent: 1 },
    { label: "Voucher Fisik",              amount: report.ovc, ratio: report.p(report.ovc), indent: 1 },
    { label: "Saldo MOBO",                 amount: report.mj,  ratio: report.p(report.mj),  indent: 1 },
    { kind: "blank" },
    { label: "B.  Struktur Pendapatan",    amount: report.tpd, ratio: report.p(report.tpd), kind: "section" },
    { label: "Total Margin Produk",        amount: report.tmg, ratio: report.p(report.tmg), indent: 1, kind: "subtot" },
    { label: "— SP Regular",               amount: report.msp, ratio: report.p(report.msp), indent: 2 },
    { label: "— Voucher Fisik",            amount: report.mvc, ratio: report.p(report.mvc), indent: 2 },
    { label: "— Saldo MOBO",               amount: report.mmb, ratio: report.p(report.mmb), indent: 2 },
    { label: "Total Komisi & Insentif",    amount: report.tko, ratio: report.p(report.tko), indent: 1, kind: "subtot" },
    { label: "— Upfront Discount",         amount: report.up,  ratio: report.p(report.up),  indent: 2 },
    { label: "— Sales Margin",             amount: report.smg, ratio: report.p(report.smg), indent: 2 },
    { label: "— Monthly Fee SLA",          amount: report.sla, ratio: report.p(report.sla), indent: 2 },
    { label: "— Special Program",          amount: report.spc, ratio: report.p(report.spc), indent: 2 },
    { label: "Total Hadiah & Lainnya",     amount: report.thd, ratio: report.p(report.thd), indent: 1, kind: "subtot" },
    { label: "— Champions Club",           amount: report.rwc, ratio: report.p(report.rwc), indent: 2 },
    { label: "— Hadiah Lainnya",           amount: report.rwl, ratio: report.p(report.rwl), indent: 2 },
    { label: "— Partner Income",           amount: report.pic, ratio: report.p(report.pic), indent: 2 },
    { label: "TOTAL PENDAPATAN",           amount: report.tpd, ratio: report.p(report.tpd), kind: "total" },
    { kind: "blank" },
    { label: "C.  Struktur Pengeluaran",   amount: report.tpg, ratio: report.p(report.tpg), kind: "section" },
    { label: "OPEX Branch",                amount: report.tox, ratio: report.p(report.tox), indent: 1 },
    { label: "SDM Branch",                 amount: report.tsd, ratio: report.p(report.tsd), indent: 1 },
    { label: "Marketing & Cluster Dev",    amount: report.tmk, ratio: report.p(report.tmk), indent: 1 },
    { label: "Cost of Money",              amount: report.tcm, ratio: report.p(report.tcm), indent: 1 },
    { label: "Partner Expense",            amount: report.pex, ratio: report.p(report.pex), indent: 1 },
    { label: "TOTAL PENGELUARAN",          amount: report.tpg, ratio: report.p(report.tpg), kind: "total" },
  ];

  return (
    <div style={{
      maxWidth: 960, margin: "0 auto", paddingBottom: 48,
      fontFamily: FONT_STACK,
      WebkitFontSmoothing: "antialiased", color: t.hi,
    }}>
      <G d={d} t={t} />

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast.show && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.17 }}
            style={{
              position: "fixed", top: 70, right: 16, zIndex: 999,
              width: 320, maxWidth: "calc(100vw - 32px)",
            }}
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
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: 4, ease: "linear" }}
                style={{ height: 2, background: toast.type === "success" ? t.green : t.red }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Page Header ── */}
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        gap: 14, marginBottom: 20, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13, minWidth: 0, flex: 1 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 10, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: t.blueBg, color: t.blue, border: `1px solid ${t.blueBd}`,
          }}>
            <BarChart3 size={25} strokeWidth={2} />
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
          onClick={handlePDF}
          disabled={genPdf}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "9px 16px", borderRadius: 8,
            background: t.blue, color: "#FFFFFF", border: "none",
            cursor: genPdf ? "not-allowed" : "pointer",
            fontSize: 13, fontWeight: 600,
            boxShadow: `0 2px 8px rgba(10,132,255,${d ? 0.32 : 0.18})`,
            opacity: genPdf ? 0.7 : 1, transition: "all .14s",
            flexShrink: 0, fontFamily: "inherit",
          }}
        >
          {genPdf
            ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />Membuat PDF…</>
            : <><Download size={14} />Download PDF</>}
        </button>
      </div>

      {/* ── Status banner ── */}
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
            <div style={{
              fontSize: 12.5, fontWeight: 600,
              color: data.is_finalized ? t.green : t.amber,
            }}>
              {data.is_finalized ? "Laporan tervalidasi & final" : "Status draft — belum difinalisasi"}
            </div>
            <div style={{ fontSize: 11.5, color: t.mid, marginTop: 2 }}>
              {data.is_finalized && data.finalized_at
                ? `Difinalisasi: ${dtf(data.finalized_at)}`
                : data.updated_at
                  ? `Terakhir disimpan: ${dtf(data.updated_at)}`
                  : null}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {hasPend && <Pill icon={<CheckCircle2 size={11} />} text="Pendapatan final" color={t.green} bg={t.greenBg} bd={t.greenBd} />}
          {hasPeng && <Pill icon={<CheckCircle2 size={11} />} text="Pengeluaran final" color={t.blue} bg={t.blueBg} bd={t.blueBd} />}
        </div>
      </div>

      {/* ── 3 Metric Cards ── */}
      <div className="grid-3" style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 22,
      }}>
        <MetCard label="Total Omset"       value={idr(report.tom)} sub="SP + Voucher + MOBO"      accent={t.blue}  t={t} />
        <MetCard label="Total Pendapatan"  value={idr(report.tpd)} sub="Margin + Komisi + Hadiah" accent={t.green} t={t} />
        <MetCard label="Total Pengeluaran" value={idr(report.tpg)} sub="OPEX + SDM + Mkt + COM"   accent={t.red}   t={t} />
      </div>

      {/* ── P&L Table ── */}
      <Card t={t} style={{ marginBottom: 22, overflow: "hidden" }}>
        <div style={{
          padding: "13px 18px", borderBottom: `1px solid ${t.line}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 8,
        }}>
          <div style={{
            fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
            textTransform: "uppercase", color: t.hi,
          }}>Financial Structure</div>
          <div style={{ fontSize: 11.5, color: t.mid }}>
            {activeContext?.month} {activeContext?.year}  ·  Rasio % terhadap Omset
          </div>
        </div>
        <div className="tbl">
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 540 }}>
            <thead>
              <tr style={{ background: t.sub }}>
                {[
                  ["Financial Structure", "left",   "55%"],
                  ["Jumlah (IDR)",        "right",  "30%"],
                  ["Rasio",               "right",  "15%"],
                ].map(([h, a, w]) => (
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

        {/* Net Profit hero strip */}
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
              textTransform: "uppercase", color: netPos ? t.green : t.red,
              marginBottom: 6,
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
              fontSize: 13.5, fontWeight: 600,
              color: netPos ? t.green : t.red,
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

      {/* ── Two-column breakdown ── */}
      <div className="grid-2" style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14,
      }}>
        {/* Pendapatan */}
        <Card t={t}>
          <div style={{ padding: "20px 22px" }}>
            <SLabel icon={<ArrowUpRight size={13} />} t={t}>Struktur Pendapatan</SLabel>
            {[
              { label: "Margin Produk",     val: report.tmg, note: `SP ${idr(report.msp)}  ·  VC ${idr(report.mvc)}  ·  MOBO ${idr(report.mmb)}` },
              { label: "Komisi & Insentif", val: report.tko, note: "Upfront + Sales Margin + SLA + Special" },
              { label: "Hadiah & Lainnya",  val: report.thd, note: "Champions + Lainnya + Partner Income" },
            ].map((row, i) => (
              <div key={i} style={{ padding: "11px 0", borderBottom: `1px solid ${t.lineSoft}` }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: t.hi, lineHeight: 1.3 }}>{row.label}</div>
                  <div style={{
                    fontSize: 13.5, fontWeight: 600, color: t.hi,
                    fontVariantNumeric: "tabular-nums", flexShrink: 0,
                  }}>{idr(row.val)}</div>
                </div>
                <div style={{ fontSize: 11, color: t.lo, marginTop: 3, lineHeight: 1.4 }}>{row.note}</div>
              </div>
            ))}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              paddingTop: 14, marginTop: 4, borderTop: `1.5px solid ${t.blueBd}`,
            }}>
              <span style={{
                fontSize: 11, fontWeight: 600, textTransform: "uppercase",
                letterSpacing: "0.08em", color: t.blue,
              }}>Total Pendapatan</span>
              <span style={{
                fontSize: 18, fontWeight: 700, color: t.blue,
                fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
              }}>{idr(report.tpd)}</span>
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
                <span style={{
                  fontSize: 13.5, fontWeight: 600, color: t.hi,
                  fontVariantNumeric: "tabular-nums", flexShrink: 0,
                }}>{idr(row.val)}</span>
              </div>
            ))}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              paddingTop: 14, marginTop: 4, borderTop: `1.5px solid ${t.redBd}`,
            }}>
              <span style={{
                fontSize: 11, fontWeight: 600, textTransform: "uppercase",
                letterSpacing: "0.08em", color: t.red,
              }}>Total Pengeluaran</span>
              <span style={{
                fontSize: 18, fontWeight: 700, color: t.red,
                fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
              }}>{idr(report.tpg)}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ─── Small pill component (used in status banner) ────────────────────────────
function Pill({ icon, text, color, bg, bd }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "4px 10px", borderRadius: 99,
      background: bg, border: `1px solid ${bd}`,
      fontSize: 11.5, color, fontWeight: 600,
      fontFamily: "inherit",
    }}>{icon}{text}</span>
  );
}

export default MPX_Summary_PNL;
