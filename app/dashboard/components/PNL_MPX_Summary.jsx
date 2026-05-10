"use client";
import React, { useState, useMemo, useEffect } from 'react';
import supabase from "../../../lib/supabase";
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, TrendingUp, TrendingDown, Download, Loader2, AlertCircle, Search, CheckCircle2, Clock, X } from 'lucide-react';

// ── Utilities ─────────────────────────────────────────────────────────────────
const idr = (v) => {
  const neg = (v||0) < 0;
  const s = new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Math.abs(v||0));
  return neg ? `(${s})` : s;
};
const rto = (v) => (!isFinite(v)||!v) ? '—' : `${Number(v).toFixed(1).replace('.',',')}%`;
const dtf = (iso) => iso ? new Date(iso).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : null;

// ── Design Tokens — tema biru seragam dengan halaman lain ────────────────────
const mk = (d) => ({
  bg:      d ? '#07090D'                       : '#F2F2F7',
  card:    d ? '#0D1019'                       : '#FFFFFF',
  sub:     d ? '#131826'                       : '#F5F5F8',
  line:    d ? 'rgba(255,255,255,0.07)'        : 'rgba(0,0,0,0.09)',
  lineH:   d ? 'rgba(255,255,255,0.04)'        : 'rgba(0,0,0,0.05)',
  hi:      d ? '#EEF0F5'                       : '#1A1A1E',
  mid:     d ? '#8892A4'                       : '#4B5563',
  lo:      d ? '#424D60'                       : '#9CA3AF',
  blue:    '#0A84FF',
  blueBg:  d ? 'rgba(10,132,255,0.11)'         : 'rgba(10,132,255,0.07)',
  blueBd:  d ? 'rgba(10,132,255,0.26)'         : 'rgba(10,132,255,0.18)',
  green:   d ? '#2ED158'                       : '#16A34A',
  greenBg: d ? 'rgba(46,209,88,0.10)'          : 'rgba(22,163,74,0.08)',
  greenBd: d ? 'rgba(46,209,88,0.22)'          : 'rgba(22,163,74,0.18)',
  amber:   d ? '#FFD60A'                       : '#D97706',
  amberBg: d ? 'rgba(255,214,10,0.10)'         : 'rgba(217,119,6,0.08)',
  amberBd: d ? 'rgba(255,214,10,0.22)'         : 'rgba(217,119,6,0.18)',
  red:     d ? '#FF453A'                       : '#DC2626',
  redBg:   d ? 'rgba(255,69,58,0.09)'          : 'rgba(220,38,38,0.07)',
  redBd:   d ? 'rgba(255,69,58,0.22)'          : 'rgba(220,38,38,0.18)',
  sm:      d ? '0 1px 3px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.045)'
             : '0 1px 3px rgba(0,0,0,0.07),0 0 0 1px rgba(0,0,0,0.055)',
  md:      d ? '0 6px 20px rgba(0,0,0,0.45)'  : '0 6px 20px rgba(0,0,0,0.08)',
  lg:      d ? '0 24px 60px rgba(0,0,0,0.65)' : '0 24px 60px rgba(0,0,0,0.12)',
});

// ── Global CSS ─────────────────────────────────────────────────────────────────
const G = ({d,t}) => (
  <style>{`
    *{box-sizing:border-box}
    ::-webkit-scrollbar{width:4px;height:4px}
    ::-webkit-scrollbar-thumb{background:${d?'rgba(255,255,255,0.10)':'rgba(0,0,0,0.12)'};border-radius:99px}
    .fin-tr:hover td{background:${d?'rgba(10,132,255,0.04)':'rgba(10,132,255,0.025)'}!important}
    @keyframes breathe{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.36;transform:scale(.9)}}
    @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
    @media(max-width:640px){
      .g3{grid-template-columns:1fr!important}
      .g2{grid-template-columns:1fr!important}
      .tbl{overflow-x:auto;-webkit-overflow-scrolling:touch}
    }
  `}</style>
);

// ── Calculations ──────────────────────────────────────────────────────────────
function calcR(data) {
  if (!data) return null;
  const g = k => Number(data[k])||0;
  const hsp={qty_sp_3gb_im3:29000,qty_sp_0_im3:10000,qty_sp_kpk_3id:10000,qty_sp_3gb_3id:29000};
  const hvc={qty_vc_0_im3:300,qty_vc_2_5gb:12600,qty_vc_3gb_30:19500,qty_vc_3_5gb_5d:13750,qty_vc_5gb_5d:16800,qty_vc_7gb_7d:22400,qty_vc_fi_4gb:24500,qty_vc_fi_1_5gb_1d:4500,qty_vc_fi_3gb_1d:6600,qty_vc_fi_5gb_2d:8300,qty_vc_fi_3gb_3d:11600,qty_vc_fi_5gb_3d:12800,qty_vc_fi_15gb_7d:27900,qty_vc_0_3id:500};
  const sd=[['qty_sp_3gb_im3','retail_sp_3gb_im3'],['qty_sp_0_im3','retail_sp_0_im3'],['qty_sp_kpk_3id','retail_sp_kpk_3id'],['qty_sp_3gb_3id','retail_sp_3gb_3id']];
  const vd=[['qty_vc_0_im3','retail_vc_0_im3'],['qty_vc_2_5gb','retail_vc_2_5gb'],['qty_vc_3gb_30','retail_vc_3gb_30'],['qty_vc_3_5gb_5d','retail_vc_3_5gb_5d'],['qty_vc_5gb_5d','retail_vc_5gb_5d'],['qty_vc_7gb_7d','retail_vc_7gb_7d'],['qty_vc_fi_4gb','retail_vc_fi_4gb'],['qty_vc_fi_1_5gb_1d','retail_vc_fi_1_5gb_1d'],['qty_vc_fi_3gb_1d','retail_vc_fi_3gb_1d'],['qty_vc_fi_5gb_2d','retail_vc_fi_5gb_2d'],['qty_vc_fi_3gb_3d','retail_vc_fi_3gb_3d'],['qty_vc_fi_5gb_3d','retail_vc_fi_5gb_3d'],['qty_vc_fi_15gb_7d','retail_vc_fi_15gb_7d'],['qty_vc_0_3id','retail_vc_0_3id']];
  const osp=sd.reduce((a,[q,r])=>a+g(q)*g(r),0);
  const ovc=vd.reduce((a,[q,r])=>a+g(q)*g(r),0);
  const mj=g('mobo_jual'),mm=g('mobo_modal');
  const tom=osp+ovc+mj;
  const msp=sd.reduce((a,[q,r])=>a+g(q)*(g(r)-(hsp[q]||0)),0);
  const mvc=vd.reduce((a,[q,r])=>a+g(q)*(g(r)-(hvc[q]||0)),0);
  const mmb=mj-mm; const tmg=msp+mvc+mmb;
  const up=mm*0.015,smg=g('realtime_margin')+g('back_margin'),sla=g('sla_fee'),spc=g('special_program');
  const tko=up+smg+sla+spc;
  const rwc=g('rewards_champions'),rwl=g('rewards_lainnya'),pic=g('partner_income');
  const thd=rwc+rwl+pic;
  const srv=g('grand_total_revenue');
  const tpd=srv>0?srv:(tmg+tko+thd);
  const cs=ps=>ps.reduce((a,[p,q])=>a+g(p)*g(q),0);
  const tox=cs([['price_opex_gedung','qty_opex_gedung'],['price_opex_kendaraan','qty_opex_kendaraan'],['price_opex_listrik','qty_opex_listrik'],['price_opex_air','qty_opex_air'],['price_opex_it','qty_opex_it'],['price_opex_logistik','qty_opex_logistik'],['price_opex_asuransi','qty_opex_asuransi'],['price_opex_lain','qty_opex_lain']]);
  const tsd=cs([['price_sdm_bm','qty_sdm_bm'],['price_sdm_admin','qty_sdm_admin'],['price_sdm_finance','qty_sdm_finance'],['price_sdm_md','qty_sdm_md'],['price_sdm_ss','qty_sdm_ss'],['price_sdm_ops','qty_sdm_ops'],['price_sdm_dinas','qty_sdm_dinas']]);
  const tmk=cs([['price_mkt_ws','qty_mkt_ws'],['price_mkt_retail','qty_mkt_retail'],['price_mkt_event','qty_mkt_event'],['price_mkt_lain','qty_mkt_lain']]);
  const tcm=cs([['price_com_admin','qty_com_admin'],['price_com_bunga','qty_com_bunga']]);
  const pex=g('partner_expense'),tpg=tox+tsd+tmk+tcm+pex;
  const net=tpd-tpg;
  const p=v=>tom?(v/tom*100):0;
  return {tom,osp,ovc,mj,mm,msp,mvc,mmb,tmg,up,smg,sla,spc,tko,rwc,rwl,pic,thd,tpd,tox,tsd,tmk,tcm,pex,tpg,net,p,
    hsp,hvc,sd,vd,g};
}

// ── PDF Generator — ULTRA COMPACT 3 halaman max ──────────────────────────────
async function makePDF(data, r, ctx) {
  // Load jsPDF
  if (!window.jspdf) {
    await new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload=res; s.onerror=rej; document.head.appendChild(s);
    });
  }
  // Load autoTable
  if (!window.jspdf?.jsPDF?.API?.autoTable) {
    await new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.3/jspdf.plugin.autotable.min.js';
      s.onload=res; s.onerror=rej; document.head.appendChild(s);
    });
  }
  const {jsPDF} = window.jspdf;
  const doc = new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});

  // ── Dimensions — margin minimal ────────────────────────────────────────────
  const W=210, H=297, ML=12, MR=12, UW=W-ML-MR;

  // ── Palette ────────────────────────────────────────────────────────────────
  const C = {
    ink:    '#111111', steel:  '#374151', slate:  '#6B7280',
    silver: '#9CA3AF', rule:   '#E5E7EB', tint:   '#F9FAFB',
    white:  '#FFFFFF', navy:   '#1E3A5F', blue:   '#0A84FF',
    blue_lt:'#EBF4FF', grn:    '#14532D', grn_lt: '#F0FDF4',
    red:    '#991B1B', red_lt: '#FEF2F2', amb_lt: '#FFFBEB',
  };

  // ── Formatters ─────────────────────────────────────────────────────────────
  const fR = v => { v=parseFloat(v)||0; const s='Rp '+Math.abs(v).toLocaleString('id-ID',{maximumFractionDigits:0}); return v<0?`(${s})`:s; };
  const fN = v => { v=parseFloat(v)||0; if(!v)return'-'; const s=Math.abs(v).toLocaleString('id-ID',{maximumFractionDigits:0}); return v<0?`(${s})`:s; };
  const fP = v => { v=parseFloat(v)||0; return v?v.toFixed(1).replace('.',',')+' %':'-'; };

  // ── Product name mapping — nama asli produk, bukan key database ───────────
  const pNames = {
    qty_sp_3gb_im3: 'SP 3GB IM3', qty_sp_0_im3: 'SP 0 IM3',
    qty_sp_kpk_3id: 'SP KPK 3ID', qty_sp_3gb_3id: 'SP 3GB 3ID',
    qty_vc_0_im3: 'VC 0 IM3', qty_vc_2_5gb: 'VC 2.5GB', qty_vc_3gb_30: 'VC 3GB/30',
    qty_vc_3_5gb_5d: 'VC 3.5GB/5D', qty_vc_5gb_5d: 'VC 5GB/5D', qty_vc_7gb_7d: 'VC 7GB/7D',
    qty_vc_fi_4gb: 'VC FI 4GB', qty_vc_fi_1_5gb_1d: 'VC FI 1.5GB/1D', qty_vc_fi_3gb_1d: 'VC FI 3GB/1D',
    qty_vc_fi_5gb_2d: 'VC FI 5GB/2D', qty_vc_fi_3gb_3d: 'VC FI 3GB/3D', qty_vc_fi_5gb_3d: 'VC FI 5GB/3D',
    qty_vc_fi_15gb_7d: 'VC FI 15GB/7D', qty_vc_0_3id: 'VC 0 3ID',
  };

  const partner = data.partner_name||'—', branch = data.branch||'—';
  const month = ctx.month||'—', year = String(ctx.year||'');
  const mpc = data.mpc_mp3||'—';
  const subLine = `${mpc} | ${partner} | ${branch} | ${month} ${year}`;
  const pgLbl = {1:'Financial Summary', 2:'Pendapatan Detail', 3:'Pengeluaran Detail'};
  let Y = 0;
  const gd = k => parseFloat(data[k])||0;

  // ── Page header/footer — minimal ───────────────────────────────────────────
  function hdrFtr(pg) {
    doc.setFillColor(C.navy); doc.rect(0,0,W,9,'F');
    doc.setTextColor(C.white); doc.setFontSize(8.5); doc.setFont('helvetica','bold');
    doc.text(pgLbl[pg]||'Laporan', ML, 6.5);
    doc.setFontSize(6); doc.setFont('helvetica','normal');
    doc.setTextColor('#CBD5E1'); doc.text(subLine, W-MR, 6.5, {align:'right'});
    doc.setDrawColor(C.rule); doc.setLineWidth(0.3);
    doc.line(ML, H-8, W-MR, H-8);
    doc.setTextColor(C.silver); doc.setFontSize(5.5);
    doc.text('SandraHub SPM Sumatera  ·  Confidential', ML, H-4.5);
    doc.text(`Hal. ${pg}`, W-MR, H-4.5, {align:'right'});
  }

  // ── Section bar — compact ──────────────────────────────────────────────────
  function secBar(lbl) {
    doc.setFillColor(C.navy); doc.rect(ML, Y, UW, 6, 'F');
    doc.setTextColor(C.white); doc.setFontSize(8); doc.setFont('helvetica','bold');
    doc.text(lbl, ML+3, Y+4.2); Y += 7;
  }

  // ── Sub-section bar ────────────────────────────────────────────────────────
  function subBar(lbl, clr='#164E63') {
    doc.setFillColor(clr); doc.rect(ML, Y, UW, 5.5, 'F');
    doc.setTextColor(C.white); doc.setFontSize(7.5); doc.setFont('helvetica','bold');
    doc.text(lbl, ML+3, Y+3.8); Y += 6.5;
  }

  // ── autoTable — ULTRA COMPACT padding ──────────────────────────────────────
  function aT(head, body, cws, totalIdx, clrTotal) {
    doc.autoTable({
      startY:Y, margin:{left:ML,right:MR},
      head:[head], body,
      columnStyles: Object.fromEntries(cws.map(([i,w,a])=>[i,{cellWidth:w,halign:a||'left'}])),
      headStyles:{ fillColor:C.tint, textColor:C.slate, fontStyle:'bold', fontSize:6,
        lineWidth:0.15, lineColor:C.rule, cellPadding:{top:2.5,bottom:2.5,left:3,right:3} },
      bodyStyles:{ fontSize:6.5, textColor:C.ink, lineWidth:0.15, lineColor:C.rule,
        cellPadding:{top:2.5,bottom:2.5,left:3,right:3} },
      alternateRowStyles:{ fillColor:C.tint },
      tableLineColor:C.rule, tableLineWidth:0.2,
      didParseCell:(hook)=>{
        if(totalIdx != null && hook.row.index === totalIdx) {
          hook.cell.styles.fillColor = clrTotal||C.blue_lt;
          hook.cell.styles.textColor = C.navy;
          hook.cell.styles.fontStyle = 'bold';
          hook.cell.styles.fontSize  = 7;
          hook.cell.styles.cellPadding = {top:3.5,bottom:3.5,left:3,right:3};
        }
      },
    });
    Y = doc.lastAutoTable.finalY + 2.5;
  }

  // ── Space check ────────────────────────────────────────────────────────────
  function spk(n=25) { if(Y+n>H-14){ doc.addPage(); hdrFtr(doc.getNumberOfPages()); Y=12; } }

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 1 — SUMMARY
  // ════════════════════════════════════════════════════════════════════════════
  hdrFtr(1); Y=11;

  // Cover — ultra compact
  doc.setFontSize(6.5); doc.setFont('helvetica','bold'); doc.setTextColor(C.navy);
  doc.text('LAPORAN KEUANGAN INTERNAL', ML, Y); Y+=3.5;
  doc.setFontSize(14); doc.setTextColor(C.ink); doc.text(partner, ML, Y); Y+=4.5;
  doc.setFontSize(7.5); doc.setFont('helvetica','normal'); doc.setTextColor(C.steel);
  doc.text(`${mpc}  ·  ${branch}  ·  ${month} ${year}`, ML, Y); Y+=3.5;
  doc.setDrawColor(C.navy); doc.setLineWidth(0.6); doc.line(ML,Y,ML+UW,Y); Y+=7;

  // 3 summary cards — minimalis
  const cw3=(UW-2)/3, ch=14;
  [{l:'TOTAL OMSET',v:r.tom,s:'SP + VC + MOBO'},
   {l:'PENDAPATAN',v:r.tpd,s:'Margin + Komisi'},
   {l:'PENGELUARAN',v:r.tpg,s:'OPEX + SDM + Mkt'}
  ].forEach((c,i)=>{
    const X=ML+i*(cw3+1);
    doc.setFillColor(C.white); doc.setDrawColor(C.rule); doc.setLineWidth(0.3); doc.rect(X,Y,cw3,ch,'FD');
    doc.setFillColor(C.navy); doc.rect(X,Y,1.5,ch,'F');
    doc.setFontSize(5.5); doc.setFont('helvetica','bold'); doc.setTextColor(C.slate); doc.text(c.l,X+3.5,Y+4);
    doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(C.ink); doc.text(fR(c.v),X+3.5,Y+9.5);
    doc.setFontSize(5.5); doc.setFont('helvetica','normal'); doc.setTextColor(C.slate); doc.text(c.s,X+3.5,Y+12.5);
  });
  Y+=ch+5;


  // Main P&L table
  secBar(`FINANCIAL STRUCTURE  ·  ${month} ${year}`);

  const pnlRows = [
    {k:'secA', l:'A. OMSET PENJUALAN'},
    {k:'sub',  l:'  TOTAL OMSET', a:r.tom,  p:100},
    {k:'data', l:'    - SP Regular',     a:r.osp,  p:r.p(r.osp)},
    {k:'data', l:'    - Voucher',        a:r.ovc,  p:r.p(r.ovc)},
    {k:'data', l:'    - MOBO',           a:r.mj,   p:r.p(r.mj)},
    {k:'secB', l:'B. PENDAPATAN'},
    {k:'sub',  l:'  Total Margin',       a:r.tmg,  p:r.p(r.tmg)},
    {k:'data', l:'    - SP',             a:r.msp,  p:r.p(r.msp)},
    {k:'data', l:'    - Voucher',        a:r.mvc,  p:r.p(r.mvc)},
    {k:'data', l:'    - MOBO',           a:r.mmb,  p:r.p(r.mmb)},
    {k:'sub',  l:'  Total Komisi',       a:r.tko,  p:r.p(r.tko)},
    {k:'data', l:'    - Upfront',        a:r.up,   p:r.p(r.up)},
    {k:'data', l:'    - Sales Margin',   a:r.smg,  p:r.p(r.smg)},
    {k:'data', l:'    - SLA',            a:r.sla,  p:r.p(r.sla)},
    {k:'sub',  l:'  Total Hadiah',       a:r.thd,  p:r.p(r.thd)},
    {k:'data', l:'    - Champions',      a:r.rwc,  p:r.p(r.rwc)},
    {k:'data', l:'    - Lainnya',        a:r.rwl,  p:r.p(r.rwl)},
    {k:'totB', l:'TOTAL PENDAPATAN',     a:r.tpd,  p:r.p(r.tpd)},
    {k:'secC', l:'C. PENGELUARAN'},
    {k:'data', l:'  OPEX',               a:r.tox,  p:r.p(r.tox)},
    {k:'data', l:'  SDM',                a:r.tsd,  p:r.p(r.tsd)},
    {k:'data', l:'  Marketing',          a:r.tmk,  p:r.p(r.tmk)},
    {k:'data', l:'  Cost of Money',      a:r.tcm,  p:r.p(r.tcm)},
    {k:'totR', l:'TOTAL PENGELUARAN',    a:r.tpg,  p:r.p(r.tpg)},
    {k:'net',  l:'NET PROFIT/(LOSS)',    a:r.net,  p:r.p(r.net)},
  ];

  const bodyData = pnlRows.map(row => {
    if(row.k==='secA'||row.k==='secB'||row.k==='secC') return [row.l,'',''];
    return [row.l, fR(row.a), fP(row.p)];
  });

  doc.autoTable({
    startY:Y, margin:{left:ML,right:MR},
    head:[['FINANCIAL STRUCTURE','ABSOLUT','RATIO']],
    body: bodyData,
    columnStyles:{0:{cellWidth:UW*0.62},1:{cellWidth:UW*0.25,halign:'right'},2:{cellWidth:UW*0.13,halign:'center'}},
    headStyles:{fillColor:C.navy, textColor:C.white, fontStyle:'bold', fontSize:7,
      lineWidth:0, cellPadding:{top:3,bottom:3,left:3,right:3}},
    bodyStyles:{fontSize:6.5, textColor:C.ink, lineWidth:0.15, lineColor:C.rule,
      cellPadding:{top:2,bottom:2,left:3,right:3}},
    tableLineColor:C.rule, tableLineWidth:0.2,
    didParseCell:(hook)=>{
      const row = pnlRows[hook.row.index]; if(!row) return;
      const k=row.k;
      if(k==='secA'||k==='secB'||k==='secC'){
        hook.cell.styles.fontStyle='bold';hook.cell.styles.fontSize=7;
        hook.cell.styles.fillColor=C.white;hook.cell.styles.textColor=C.ink;
        hook.cell.styles.cellPadding={top:4,bottom:2,left:3,right:3};
      }
      else if(k==='sub'){
        hook.cell.styles.fontStyle='bold';hook.cell.styles.fillColor=C.blue_lt;
        hook.cell.styles.textColor=C.navy;hook.cell.styles.fontSize=6.5;
        hook.cell.styles.cellPadding={top:2.5,bottom:2.5,left:3,right:3};
      }
      else if(k==='totB'){
        hook.cell.styles.fontStyle='bold';hook.cell.styles.fillColor=C.grn_lt;
        hook.cell.styles.textColor=C.grn;hook.cell.styles.fontSize=7.5;
        hook.cell.styles.cellPadding={top:4,bottom:4,left:3,right:3};
      }
      else if(k==='totR'){
        hook.cell.styles.fontStyle='bold';hook.cell.styles.fillColor=C.red_lt;
        hook.cell.styles.textColor=C.red;hook.cell.styles.fontSize=7.5;
        hook.cell.styles.cellPadding={top:4,bottom:4,left:3,right:3};
      }
      else if(k==='net'){
        const pos=(row.a||0)>=0;
        hook.cell.styles.fontStyle='bold';hook.cell.styles.fontSize=8;
        hook.cell.styles.fillColor=pos?C.grn_lt:C.red_lt;
        hook.cell.styles.textColor=pos?C.grn:C.red;
        hook.cell.styles.cellPadding={top:5,bottom:5,left:3,right:3};
      }
      else if(k==='data' && hook.column.index===1 && (row.a||0)<0){
        hook.cell.styles.textColor=C.red;
      }
    },
  });
  Y = doc.lastAutoTable.finalY + 4;

  // Status badge
  const fin=data.is_finalized;
  const sc=fin?C.grn:C.steel, sb=fin?C.grn_lt:C.amb_lt;
  doc.setFillColor(sb); doc.setDrawColor(C.rule); doc.setLineWidth(0.3); doc.rect(ML,Y,UW,7,'FD');
  doc.setFontSize(6.5); doc.setFont('helvetica','bold'); doc.setTextColor(sc);
  doc.text(fin?'✓  Divalidasi & Final':'○  Draft', ML+4, Y+4.5);
  doc.setFontSize(5.5); doc.setFont('helvetica','normal'); doc.setTextColor(C.slate);
  doc.text(`${data.updated_at||'—'}`, W-MR-3, Y+4.5, {align:'right'});


  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 2 — DETAIL PENDAPATAN
  // ════════════════════════════════════════════════════════════════════════════
  doc.addPage(); hdrFtr(2); Y=11;
  doc.setFontSize(6.5); doc.setFont('helvetica','bold'); doc.setTextColor(C.navy); doc.text('STRUKTUR PENDAPATAN — DETAIL', ML, Y); Y+=3.5;
  doc.setFontSize(11); doc.setTextColor(C.ink); doc.text(partner, ML, Y); Y+=3.5;
  doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(C.steel);
  doc.text(`${mpc} · ${branch} · ${month} ${year}`, ML, Y); Y+=3;
  doc.setDrawColor(C.navy); doc.setLineWidth(0.6); doc.line(ML,Y,ML+UW,Y); Y+=6;

  // A. Omset
  secBar('A. OMSET PENJUALAN');
  aT(['Keterangan','Nominal','%'],
    [['SP Regular',fR(r.osp),fP(r.p(r.osp))],
     ['Voucher',fR(r.ovc),fP(r.p(r.ovc))],
     ['MOBO',fR(r.mj),fP(r.p(r.mj))],
     ['TOTAL',fR(r.tom),'100,0 %']],
    [[0,UW*0.58,'left'],[1,UW*0.26,'right'],[2,UW*0.16,'center']],3,C.blue_lt);
  Y+=3;

  // B. Pendapatan
  secBar('B. MARGIN PRODUCT');
  const mgHead=['Produk','Qty','H.Retail','Margin','%'];
  const mgCws=[[0,UW*0.30,'left'],[1,UW*0.12,'right'],[2,UW*0.18,'right'],[3,UW*0.22,'right'],[4,UW*0.18,'center']];

  // SP — gunakan pNames untuk nama produk asli
  subBar('a. Starter Pack (SP) Regular','#1E4D7B');
  let spB=[],tSpMg=0;
  r.sd.forEach(([_,qk,rk])=>{
    const qty=gd(qk),hpp=r.hsp[qk]||0,ret=gd(rk),penj=ret*qty,mg=penj-hpp*qty;
    tSpMg+=mg;
    spB.push([pNames[qk]||qk, fN(qty), fN(ret), fN(mg), fP(r.osp?penj/r.osp*100:0)]);
  });
  spB.push(['Sub. Total','','',fN(tSpMg),fP(100)]);
  aT(mgHead,spB,mgCws,spB.length-1,C.blue_lt);

  // VC — gunakan pNames untuk nama produk asli
  subBar('b. Voucher Regular','#1E4D7B');
  let vcB=[],tVcMg=0;
  r.vd.forEach(([_,qk,rk])=>{
    const qty=gd(qk),hpp=r.hvc[qk]||0,ret=gd(rk),penj=ret*qty,mg=penj-hpp*qty;
    tVcMg+=mg;
    vcB.push([pNames[qk]||qk, fN(qty), fN(ret), fN(mg), fP(r.ovc?penj/r.ovc*100:0)]);
  });
  vcB.push(['Sub. Total','','',fN(tVcMg),fP(100)]);
  aT(mgHead,vcB,mgCws,vcB.length-1,C.blue_lt);

  // MOBO
  subBar('c. Penjualan Saldo 3SAKTI','#1E4D7B');
  const moboMg=r.mj-r.mm;
  aT(mgHead,[['Saldo 3Sakti','-',fN(r.mj),fN(moboMg),'100,0 %'],
             ['Sub. Total','','',fN(moboMg),'100,0 %']],mgCws,1,C.blue_lt);

  // Total Margin strip
  doc.setFillColor(C.navy); doc.rect(ML,Y,UW,6,'F');
  doc.setTextColor(C.white); doc.setFontSize(7.5); doc.setFont('helvetica','bold');
  doc.text('TOTAL MARGIN', ML+3, Y+4.2);
  doc.text(fR(r.tmg), W-MR-3, Y+4.2, {align:'right'});
  Y+=8;

  // B2 Sales Fee
  spk(30); secBar('C. SALES FEE');
  aT(['Keterangan','Nominal','%'],
    [['Upfront (1,5% Modal MOBO)',fR(r.up),fP(r.tko?r.up/r.tko*100:0)],
     ['Sales Margin',fR(r.smg),fP(r.tko?r.smg/r.tko*100:0)],
     ['SLA Monthly Fee',fR(r.sla),fP(r.tko?r.sla/r.tko*100:0)],
     ['Special Program',fR(r.spc),fP(r.tko?r.spc/r.tko*100:0)],
     ['TOTAL',fR(r.tko),'100,0 %']],
    [[0,UW*0.58,'left'],[1,UW*0.26,'right'],[2,UW*0.16,'center']],4,C.blue_lt);
  Y+=3;

  // B3 Hadiah
  spk(25); secBar('D. HADIAH & LAINNYA');
  aT(['Keterangan','Nominal','%'],
    [['Champions Club',fR(r.rwc),fP(r.thd?r.rwc/r.thd*100:0)],
     ['Lainnya',fR(r.rwl),fP(r.thd?r.rwl/r.thd*100:0)],
     ['Partner Income',fR(r.pic),fP(r.thd?r.pic/r.thd*100:0)],
     ['TOTAL',fR(r.thd),'100,0 %']],
    [[0,UW*0.58,'left'],[1,UW*0.26,'right'],[2,UW*0.16,'center']],3,C.blue_lt);
  Y+=3;

  // Total Pendapatan bar
  const posP=r.tpd>=0;
  doc.setFillColor(posP?C.grn_lt:C.red_lt); doc.setDrawColor(posP?C.grn:C.red); doc.setLineWidth(1);
  doc.rect(ML,Y,UW,8,'FD');
  doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(posP?C.grn:C.red);
  doc.text('TOTAL PENDAPATAN', ML+3, Y+5.5);
  doc.text(fR(r.tpd), W-MR-3, Y+5.5, {align:'right'});


  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 3 — DETAIL PENGELUARAN
  // ════════════════════════════════════════════════════════════════════════════
  doc.addPage(); hdrFtr(3); Y=11;
  doc.setFontSize(6.5); doc.setFont('helvetica','bold'); doc.setTextColor(C.navy); doc.text('STRUKTUR PENGELUARAN — DETAIL', ML, Y); Y+=3.5;
  doc.setFontSize(11); doc.setTextColor(C.ink); doc.text(partner, ML, Y); Y+=3.5;
  doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(C.steel);
  doc.text(`${mpc} · ${branch} · ${month} ${year}`, ML, Y); Y+=3;
  doc.setDrawColor(C.navy); doc.setLineWidth(0.6); doc.line(ML,Y,ML+UW,Y); Y+=6;

  secBar('A. STRUKTUR PENGELUARAN');
  const peCws=[[0,UW*0.50,'left'],[1,UW*0.12,'right'],[2,UW*0.16,'right'],[3,UW*0.22,'right']];
  const peHead=['Keterangan','Qty','Satuan','Total'];

  const secs=[
    ['1  OPEX',
     [['Gedung',gd('qty_opex_gedung'),gd('price_opex_gedung')],
      ['Kendaraan',gd('qty_opex_kendaraan'),gd('price_opex_kendaraan')],
      ['Listrik',gd('qty_opex_listrik'),gd('price_opex_listrik')],
      ['Air',gd('qty_opex_air'),gd('price_opex_air')],
      ['IT',gd('qty_opex_it'),gd('price_opex_it')],
      ['Logistik',gd('qty_opex_logistik'),gd('price_opex_logistik')],
      ['Asuransi',gd('qty_opex_asuransi'),gd('price_opex_asuransi')],
      ['Lain-lain',gd('qty_opex_lain'),gd('price_opex_lain')]],
     'TOTAL OPEX', r.tox],
    ['2  SDM',
     [['BM',gd('qty_sdm_bm'),gd('price_sdm_bm')],
      ['Admin & WH',gd('qty_sdm_admin'),gd('price_sdm_admin')],
      ['Finance',gd('qty_sdm_finance'),gd('price_sdm_finance')],
      ['MD',gd('qty_sdm_md'),gd('price_sdm_md')],
      ['Sales Support',gd('qty_sdm_ss'),gd('price_sdm_ss')],
      ['Staff Ops',gd('qty_sdm_ops'),gd('price_sdm_ops')],
      ['Perj. Dinas',gd('qty_sdm_dinas'),gd('price_sdm_dinas')]],
     'TOTAL SDM', r.tsd],
    ['3  MARKETING',
     [['Wholeseller',gd('qty_mkt_ws'),gd('price_mkt_ws')],
      ['Retail',gd('qty_mkt_retail'),gd('price_mkt_retail')],
      ['Event',gd('qty_mkt_event'),gd('price_mkt_event')],
      ['Lainnya',gd('qty_mkt_lain'),gd('price_mkt_lain')]],
     'TOTAL MARKETING', r.tmk],
    ['4  COST OF MONEY',
     [['Adm. Bank',gd('qty_com_admin'),gd('price_com_admin')],
      ['Bunga',gd('qty_com_bunga'),gd('price_com_bunga')]],
     'TOTAL COM', r.tcm],
  ];

  secs.forEach(([lbl,items,totLbl,totVal])=>{
    spk(items.length*6+18);
    subBar(lbl,'#1E4D7B');
    const rows=items.map(([nm,qty,ps])=>[nm, fN(qty)||'-', fN(ps)||'-', fN(ps*qty)]);
    rows.push([totLbl,'','',fN(totVal)]);
    aT(peHead,rows,peCws,rows.length-1,C.blue_lt);
    Y+=3;
  });

  // Total Pengeluaran
  spk(15);
  doc.setFillColor(C.red_lt); doc.setDrawColor(C.red); doc.setLineWidth(1);
  doc.rect(ML,Y,UW,8,'FD');
  doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(C.red);
  doc.text('TOTAL PENGELUARAN', ML+3, Y+5.5);
  doc.text(fR(r.tpg), W-MR-3, Y+5.5, {align:'right'});
  Y+=11;

  // Net Profit
  spk(13);
  const posN=r.net>=0;
  doc.setFillColor(posN?C.grn_lt:C.red_lt); doc.setDrawColor(posN?C.grn:C.red); doc.setLineWidth(1.5);
  doc.rect(ML,Y,UW,12,'FD');
  doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(posN?C.grn:C.red);
  doc.text(posN?'NET PROFIT':'NET LOSS', ML+3, Y+6);
  doc.setFontSize(11); doc.text(fR(r.net), W-MR-3, Y+7, {align:'right'});
  doc.setFontSize(6.5); doc.setFont('helvetica','normal'); doc.setTextColor(C.slate);
  doc.text(`${fP(r.p(r.net))} dari Omset`, W-MR-3, Y+10.5, {align:'right'});

  doc.save(`Laporan_PNL_${partner}_${branch}_${month}_${year}.pdf`);
}

// ── Primitives ─────────────────────────────────────────────────────────────────
const Card = ({children,t,style={}}) => (
  <div style={{borderRadius:16,border:`1px solid ${t.line}`,background:t.card,boxShadow:t.sm,...style}}>
    {children}
  </div>
);
const SLabel = ({children,t}) => (
  <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:18}}>
    <div style={{width:3,height:14,borderRadius:99,background:t.blue,flexShrink:0}}/>
    <span style={{fontSize:11,fontWeight:700,letterSpacing:'0.07em',textTransform:'uppercase',color:t.mid}}>
      {children}
    </span>
  </div>
);
const MetCard = ({label,value,sub,bg,bd,tc,t}) => (
  <div style={{padding:'22px 24px',borderRadius:14,background:bg,border:`1px solid ${bd}`,display:'flex',flexDirection:'column',gap:7}}>
    <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.09em',textTransform:'uppercase',color:t.lo}}>{label}</div>
    <div style={{fontSize:'clamp(16px,2.8vw,22px)',fontWeight:800,letterSpacing:'-0.04em',color:tc,fontVariantNumeric:'tabular-nums',lineHeight:1.1}}>{value}</div>
    <div style={{fontSize:11.5,color:t.mid,marginTop:2}}>{sub}</div>
  </div>
);

// ── P&L Table Row ──────────────────────────────────────────────────────────────
const TR = ({label,amount,ratio,indent=0,kind='data',t}) => {
  const neg=(amount||0)<0;
  const isSec=kind==='section', isSub=kind==='subtot', isTot=kind==='total';
  const isNet=kind==='net', isBlank=kind==='blank';
  if(isBlank) return <tr><td colSpan={3} style={{padding:'4px 0'}}></td></tr>;
  const bg = isSub?t.blueBg : isTot?(neg?t.redBg:t.greenBg) : isNet?(neg?t.redBg:t.greenBg) : 'transparent';
  const tc = isSub?t.blue : isTot||isNet?(neg?t.red:t.green) : neg&&!isSec?t.red : t.hi;
  const fw = isSec||isSub||isTot||isNet ? 700 : 400;
  const fs = isSec ? 13.5 : isSub||isTot||isNet ? 13 : 12.5;
  const bt = isTot||isNet ? `2px solid ${neg?t.redBd:t.greenBd}` : 'none';
  const vp = isTot||isNet ? '12px 16px' : '9px 16px';
  return (
    <tr className="fin-tr" style={{borderTop:isSec?`1px solid ${t.line}`:'none'}}>
      <td style={{padding:vp,paddingLeft:16+indent*18,fontSize:fs,fontWeight:fw,color:tc,background:bg,borderTop:bt,borderBottom:`1px solid ${t.lineH}`}}>{label}</td>
      <td style={{padding:vp,textAlign:'right',fontSize:fs,fontWeight:fw,color:tc,background:bg,borderTop:bt,borderBottom:`1px solid ${t.lineH}`,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>{amount!==null?idr(amount):''}</td>
      <td style={{padding:vp,textAlign:'center',fontSize:isTot||isNet?12:11,fontWeight:isTot||isNet?700:400,color:isTot||isNet?tc:t.lo,background:bg,borderTop:bt,borderBottom:`1px solid ${t.lineH}`}}>{ratio!==null?rto(ratio):''}</td>
    </tr>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const MPX_Summary_PNL = ({activeContext, theme}) => {
  const [data,setData]       = useState(null);
  const [loading,setLoading] = useState(true);
  const [error,setError]     = useState(null);
  const [genPdf,setGenPdf]   = useState(false);
  const [toast,setToast]     = useState({show:false,type:'success',msg:''});

  const d = theme==='dark', t = mk(d);
  const toast$ = (type,msg) => { setToast({show:true,type,msg}); setTimeout(()=>setToast(p=>({...p,show:false})),4000); };

  // Fetch
  useEffect(()=>{
    if(!activeContext?.mpxName||!activeContext?.branch||!activeContext?.month||!activeContext?.year){
      setLoading(false); setData(null); return;
    }
    setLoading(true); setError(null);
    (async()=>{
      try {
        const bq=()=>supabase.from('pnl_reports').select('*')
          .eq('partner_name',activeContext.mpxName).eq('branch',activeContext.branch)
          .eq('month',activeContext.month).eq('year',String(activeContext.year));
        let db=null;
        if(activeContext.mpxType){const{data:r1,error:e1}=await bq().eq('mpc_mp3',activeContext.mpxType).maybeSingle();if(e1)throw e1;db=r1;}
        if(!db){const{data:r2,error:e2}=await bq().limit(1).maybeSingle();if(e2)throw e2;db=r2;}
        setData(db);
      } catch(e){setError(e.message);}
      finally{setLoading(false);}
    })();
  },[activeContext]);

  const report = useMemo(()=>calcR(data),[data]);

  const handlePDF = async () => {
    if(!data||!report) return;
    setGenPdf(true);
    try { await makePDF(data,report,activeContext); toast$('success','PDF berhasil diunduh'); }
    catch(e) { toast$('error','Gagal: '+e.message); }
    finally { setGenPdf(false); }
  };

  // Loading
  if(loading) return (
    <><G d={d} t={t}/>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:400,gap:16}}>
      <div style={{width:52,height:52,borderRadius:14,background:t.blue,display:'flex',alignItems:'center',justifyContent:'center',animation:'breathe 1.8s ease-in-out infinite'}}><BarChart3 size={24} color="#fff"/></div>
      <span style={{fontSize:11,fontWeight:600,letterSpacing:'0.09em',textTransform:'uppercase',color:t.mid}}>Memuat laporan...</span>
    </div></>
  );

  if(!activeContext?.mpxName) return (
    <><G d={d} t={t}/>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:400,gap:14,opacity:.5}}>
      <Search size={44} style={{color:t.lo}}/>
      <div style={{fontSize:14,fontWeight:600,color:t.mid}}>Pilih Partner dan Cabang terlebih dahulu</div>
    </div></>
  );

  if(error||!data||!report) return (
    <><G d={d} t={t}/>
    <div style={{maxWidth:480,margin:'60px auto',padding:'36px',borderRadius:20,border:`1px solid ${t.line}`,background:t.card,textAlign:'center',boxShadow:t.md}}>
      <div style={{width:56,height:56,borderRadius:14,background:t.sub,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px',border:`1px solid ${t.line}`}}><AlertCircle size={26} style={{color:t.lo}}/></div>
      <div style={{fontSize:17,fontWeight:700,color:t.hi,marginBottom:10}}>{error?'Terjadi Kesalahan':'Data Tidak Tersedia'}</div>
      <div style={{fontSize:13,color:t.mid,lineHeight:1.7,marginBottom:20}}>{error?<span style={{color:t.red}}>{error}</span>:<>Belum ada laporan untuk <strong style={{color:t.hi}}>{activeContext.mpxName}</strong> periode {activeContext.month} {activeContext.year}.</>}</div>
      <div style={{textAlign:'left',background:t.sub,borderRadius:10,padding:'14px 16px',border:`1px solid ${t.line}`}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:t.lo,marginBottom:10}}>Query Context</div>
        {[['partner_name',activeContext?.mpxName],['branch',activeContext?.branch],['mpc_mp3',activeContext?.mpxType||'(tidak tersedia)'],['month',activeContext?.month],['year',activeContext?.year]].map(([k,v])=>(
          <div key={k} style={{display:'flex',justifyContent:'space-between',gap:12,padding:'4px 0',fontSize:11}}>
            <span style={{color:t.lo,fontFamily:'monospace'}}>{k}</span>
            <span style={{color:v?t.hi:t.red,fontFamily:'monospace',fontWeight:600}}>{v||'undefined'}</span>
          </div>
        ))}
      </div>
    </div></>
  );

  const notes=data.validation_notes||'';
  const hasPend=notes.includes('pendapatan:final'), hasPeng=notes.includes('pengeluaran:final');
  const mpcType=data.mpc_mp3||activeContext?.mpxType||'';
  const netPos=report.net>=0;

  const pnlRows = [
    {label:'A.  Omset Penjualan',     amount:report.tom,  ratio:100,              kind:'section'},
    {label:'SP Regular',              amount:report.osp,  ratio:report.p(report.osp), indent:1},
    {label:'Voucher Fisik',           amount:report.ovc,  ratio:report.p(report.ovc), indent:1},
    {label:'Saldo MOBO',              amount:report.mj,   ratio:report.p(report.mj),  indent:1},
    {kind:'blank'},
    {label:'B.  Struktur Pendapatan', amount:report.tpd,  ratio:report.p(report.tpd), kind:'section'},
    {label:'Total Margin Product',    amount:report.tmg,  ratio:report.p(report.tmg), indent:1, kind:'subtot'},
    {label:'— SP Regular',            amount:report.msp,  ratio:report.p(report.msp), indent:2},
    {label:'— Voucher Fisik',         amount:report.mvc,  ratio:report.p(report.mvc), indent:2},
    {label:'— Saldo MOBO',            amount:report.mmb,  ratio:report.p(report.mmb), indent:2},
    {label:'Total Komisi & Insentif', amount:report.tko,  ratio:report.p(report.tko), indent:1, kind:'subtot'},
    {label:'— Upfront Discount',      amount:report.up,   ratio:report.p(report.up),  indent:2},
    {label:'— Sales Margin',          amount:report.smg,  ratio:report.p(report.smg), indent:2},
    {label:'— Monthly Fee SLA',       amount:report.sla,  ratio:report.p(report.sla), indent:2},
    {label:'Total Hadiah & Lainnya',  amount:report.thd,  ratio:report.p(report.thd), indent:1, kind:'subtot'},
    {label:'— Champions Club',        amount:report.rwc,  ratio:report.p(report.rwc), indent:2},
    {label:'— Hadiah Lainnya',        amount:report.rwl,  ratio:report.p(report.rwl), indent:2},
    {label:'TOTAL STRUKTUR PENDAPATAN', amount:report.tpd, ratio:report.p(report.tpd), kind:'total'},
    {kind:'blank'},
    {label:'C.  Struktur Pengeluaran',amount:report.tpg,  ratio:report.p(report.tpg), kind:'section'},
    {label:'OPEX Branch',             amount:report.tox,  ratio:report.p(report.tox), indent:1},
    {label:'SDM Branch',              amount:report.tsd,  ratio:report.p(report.tsd), indent:1},
    {label:'Marketing & Cluster Dev', amount:report.tmk,  ratio:report.p(report.tmk), indent:1},
    {label:'Cost of Money',           amount:report.tcm,  ratio:report.p(report.tcm), indent:1},
    {label:'TOTAL STRUKTUR PENGELUARAN', amount:report.tpg, ratio:report.p(report.tpg), kind:'total'},
  ];

  return (
    <div style={{maxWidth:960,margin:'0 auto',paddingBottom:56,
      fontFamily:"-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',system-ui,sans-serif",
      WebkitFontSmoothing:'antialiased',color:t.hi}}>
      <G d={d} t={t}/>

      {/* Toast */}
      <AnimatePresence>
        {toast.show && (
          <motion.div initial={{opacity:0,y:-12,scale:.97}} animate={{opacity:1,y:0,scale:1}}
            exit={{opacity:0,y:-10,scale:.97}} transition={{duration:.17}}
            style={{position:'fixed',top:66,right:16,zIndex:999,width:320,maxWidth:'calc(100vw - 32px)'}}>
            <div style={{background:t.card,border:`1px solid ${toast.type==='success'?t.greenBd:t.line}`,borderRadius:14,boxShadow:t.lg,overflow:'hidden'}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:12,padding:'14px 16px'}}>
                <div style={{width:32,height:32,borderRadius:8,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:toast.type==='success'?t.green:t.red,color:'#fff'}}>
                  {toast.type==='success'?<CheckCircle2 size={16}/>:<AlertCircle size={16}/>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13.5,fontWeight:700,color:t.hi}}>{toast.type==='success'?'Berhasil':'Error'}</div>
                  <div style={{fontSize:12,color:t.mid,marginTop:3,lineHeight:1.5}}>{toast.msg}</div>
                </div>
                <button onClick={()=>setToast(p=>({...p,show:false}))} style={{background:'none',border:'none',cursor:'pointer',color:t.lo}}><X size={14}/></button>
              </div>
              <motion.div initial={{width:'100%'}} animate={{width:'0%'}} transition={{duration:4,ease:'linear'}} style={{height:2,background:toast.type==='success'?t.green:t.red}}/>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Page Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16,marginBottom:24,flexWrap:'wrap'}}>
        <div style={{display:'flex',alignItems:'center',gap:14,minWidth:0,flex:1}}>
          <div style={{width:46,height:46,borderRadius:12,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:t.blueBg,color:t.blue,border:`1px solid ${t.blueBd}`}}>
            <BarChart3 size={22}/>
          </div>
          <div style={{minWidth:0}}>
            <div style={{fontSize:'clamp(18px,3vw,24px)',fontWeight:800,letterSpacing:'-0.04em',color:t.hi,lineHeight:1.2}}>MPX Financial Summary</div>
            <div style={{fontSize:'clamp(11px,1.8vw,13px)',fontWeight:600,color:t.mid,marginTop:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {[mpcType,activeContext?.mpxName,activeContext?.branch].filter(Boolean).join('  ·  ')}
              {activeContext?.month?`  ·  ${activeContext.month} ${activeContext.year}`:''}
            </div>
          </div>
        </div>
        <button onClick={handlePDF} disabled={genPdf}
          style={{display:'flex',alignItems:'center',gap:8,padding:'10px 18px',borderRadius:11,
            background:t.blue,color:'#fff',border:'none',cursor:genPdf?'not-allowed':'pointer',
            fontSize:12.5,fontWeight:700,letterSpacing:'0.04em',textTransform:'uppercase',
            boxShadow:`0 2px 12px rgba(10,132,255,${d?0.36:0.22})`,
            opacity:genPdf?0.7:1,transition:'all .14s',flexShrink:0}}>
          {genPdf?<><Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/>Membuat...</>:<><Download size={14}/>Download PDF</>}
        </button>
      </div>

      {/* Status Badge */}
      <div style={{padding:'14px 18px',borderRadius:12,marginBottom:24,
        border:`1px solid ${data.is_finalized?t.greenBd:t.amberBd}`,
        background:data.is_finalized?t.greenBg:t.amberBg,
        display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          {data.is_finalized?<CheckCircle2 size={18} style={{color:t.green,flexShrink:0}}/>:<Clock size={18} style={{color:t.amber,flexShrink:0}}/>}
          <div>
            <div style={{fontSize:13,fontWeight:700,color:data.is_finalized?t.green:t.amber}}>
              {data.is_finalized?'Laporan Tervalidasi & Final':'Status: Draft — Belum Difinalisasi'}
            </div>
            <div style={{fontSize:11.5,color:t.mid,marginTop:2}}>
              {data.is_finalized&&data.finalized_at?`Difinalisasi: ${dtf(data.finalized_at)}`:data.updated_at?`Terakhir disimpan: ${dtf(data.updated_at)}`:null}
            </div>
          </div>
        </div>
        <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
          {hasPend&&<div style={{display:'flex',alignItems:'center',gap:5,padding:'5px 12px',borderRadius:99,background:t.greenBg,border:`1px solid ${t.greenBd}`,fontSize:11.5,color:t.green,fontWeight:600}}><CheckCircle2 size={12}/>Pendapatan Final</div>}
          {hasPeng&&<div style={{display:'flex',alignItems:'center',gap:5,padding:'5px 12px',borderRadius:99,background:t.blueBg,border:`1px solid ${t.blueBd}`,fontSize:11.5,color:t.blue,fontWeight:600}}><CheckCircle2 size={12}/>Pengeluaran Final</div>}
        </div>
      </div>

      {/* 3 Metric Cards */}
      <div className="g3" style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:28}}>
        <MetCard label="Total Omset"       value={idr(report.tom)} sub="SP + VC + MOBO"            bg={t.blueBg}  bd={t.blueBd}  tc={t.blue}  t={t}/>
        <MetCard label="Total Pendapatan"  value={idr(report.tpd)} sub="Margin + Komisi + Hadiah"  bg={t.greenBg} bd={t.greenBd} tc={t.green} t={t}/>
        <MetCard label="Total Pengeluaran" value={idr(report.tpg)} sub="OPEX + SDM + Mkt + COM"    bg={t.redBg}   bd={t.redBd}   tc={t.red}   t={t}/>
      </div>

      {/* P&L Table */}
      <Card t={t} style={{marginBottom:28,overflow:'hidden'}}>
        <div style={{padding:'14px 20px',borderBottom:`1px solid ${t.line}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
          <div style={{fontSize:13,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color:t.hi}}>Financial Structure</div>
          <div style={{fontSize:12,color:t.mid}}>{activeContext?.month} {activeContext?.year}  ·  Rasio % terhadap Omset</div>
        </div>
        <div className="tbl">
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:520}}>
            <thead>
              <tr style={{background:t.blue}}>
                {[['Financial Structure','left','55%'],['Jumlah (IDR)','right','30%'],['Rasio','center','15%']].map(([h,a,w])=>(
                  <th key={h} style={{padding:'10px 16px',textAlign:a,width:w,fontSize:10,fontWeight:700,letterSpacing:'0.07em',textTransform:'uppercase',color:'#fff',borderBottom:`1px solid ${t.blueBd}`}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pnlRows.map((row,i)=><TR key={i} {...row} t={t}/>)}
            </tbody>
          </table>
        </div>
        {/* Net Profit Hero */}
        <div style={{padding:'20px 24px',background:netPos?t.greenBg:t.redBg,borderTop:`2px solid ${netPos?t.greenBd:t.redBd}`,display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
          <div>
            <div style={{fontSize:10.5,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:netPos?t.green:t.red,marginBottom:7}}>NET PROFIT BEFORE TAX</div>
            <div style={{fontSize:'clamp(22px,4vw,36px)',fontWeight:800,letterSpacing:'-0.04em',color:netPos?t.green:t.red,fontVariantNumeric:'tabular-nums',lineHeight:1}}>{idr(report.net)}</div>
            <div style={{fontSize:12,color:t.mid,marginTop:7}}>Total Pendapatan − Total Pengeluaran</div>
          </div>
          <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:8}}>
            <div style={{fontSize:14,fontWeight:700,color:netPos?t.green:t.red}}>{rto(report.p(report.net))}</div>
            <div style={{display:'flex',alignItems:'center',gap:7,padding:'8px 18px',borderRadius:99,background:netPos?t.green:t.red,color:'#fff',fontSize:13,fontWeight:700}}>
              {netPos?<TrendingUp size={14}/>:<TrendingDown size={14}/>}{netPos?'Profit':'Loss'}
            </div>
          </div>
        </div>
      </Card>

      {/* Breakdown 2-col */}
      <div className="g2" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        <Card t={t}>
          <div style={{padding:'24px 26px'}}>
            <SLabel t={t}>Struktur Pendapatan</SLabel>
            {[
              {label:'Margin Produk',     val:report.tmg, note:`SP: ${idr(report.msp)}  VC: ${idr(report.mvc)}`},
              {label:'Komisi & Insentif', val:report.tko, note:'Upfront + Sales + SLA'},
              {label:'Hadiah & Lainnya',  val:report.thd, note:'Champions + Lainnya + Partner Income'},
            ].map((row,i)=>(
              <div key={i} style={{padding:'13px 0',borderBottom:`1px solid ${t.lineH}`}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12}}>
                  <div style={{fontSize:13.5,fontWeight:600,color:t.hi,lineHeight:1.3}}>{row.label}</div>
                  <div style={{fontSize:14,fontWeight:700,color:t.blue,fontVariantNumeric:'tabular-nums',flexShrink:0}}>{idr(row.val)}</div>
                </div>
                <div style={{fontSize:11,color:t.lo,marginTop:4}}>{row.note}</div>
              </div>
            ))}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:16,marginTop:4,borderTop:`2px solid ${t.blueBd}`}}>
              <span style={{fontSize:11.5,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',color:t.blue}}>Total Pendapatan</span>
              <span style={{fontSize:20,fontWeight:800,color:t.blue,fontVariantNumeric:'tabular-nums'}}>{idr(report.tpd)}</span>
            </div>
          </div>
        </Card>
        <Card t={t}>
          <div style={{padding:'24px 26px'}}>
            <SLabel t={t}>Struktur Pengeluaran</SLabel>
            {[
              {label:'OPEX Branch',         val:report.tox},
              {label:'SDM Branch',          val:report.tsd},
              {label:'Marketing & Cluster', val:report.tmk},
              {label:'Cost of Money',       val:report.tcm},
              {label:'Partner Expense',     val:report.pex},
            ].map((row,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'12px 0',borderBottom:`1px solid ${t.lineH}`}}>
                <span style={{fontSize:13.5,fontWeight:600,color:t.hi}}>{row.label}</span>
                <span style={{fontSize:14,fontWeight:700,color:t.red,fontVariantNumeric:'tabular-nums',flexShrink:0}}>{idr(row.val)}</span>
              </div>
            ))}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:16,marginTop:4,borderTop:`2px solid ${t.redBd}`}}>
              <span style={{fontSize:11.5,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',color:t.red}}>Total Pengeluaran</span>
              <span style={{fontSize:20,fontWeight:800,color:t.red,fontVariantNumeric:'tabular-nums'}}>{idr(report.tpg)}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default MPX_Summary_PNL;