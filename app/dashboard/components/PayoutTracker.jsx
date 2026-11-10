"use client";

/*
  PayoutTracker.jsx — v5.2-EN (Full English Localization)
  ─────────────────────────────────────────────────────────────────────

  ─────────────────────────────────────────────────────────────────────
*/

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import supabase from "../../../lib/supabase";
import { DocsCell, PoDocsTab, usePartnerDocStats } from "./PayoutPartnerDocs";
import { PartnerLettersTab } from "./PayoutPartnerLetters";
import { DOC_REF_COLUMN, refKey, statKey, doneCount, DOC_TYPES } from "../../../lib/payoutPartnerDocs";

let _xlsx = null;
async function getXLSX() {
  if (_xlsx) return _xlsx;
  _xlsx = await import("xlsx");
  return _xlsx;
}

const C = {
  red:"#ED1C24", teal:"#32BCAD", tealD:"#27a093", tealDp:"#1d8078",
  yellow:"#FFCB05", yellowD:"#c49b00", magenta:"#C6168D", pink:"#EC008C", grey:"#4D4D4F",
};

const MONO = "'SF Mono','Fira Code','DM Mono',monospace";

const kbd = (fn) => ({
  role: "button",
  tabIndex: 0,
  onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } },
});

// Hint kolom. Prefix "=" → hanya exact match (hindari "invoice" ikut cocok ke "Invoice Number").
const H_INV   = ["invoice submission","invoice submission date","inv submission","=invoice"];
const H_CLV   = ["clv date","=clv"];
const H_CLR   = ["clearing date","=clearing","clearing bank"];
const H_SURAT = ["surat pemberitahuan date","surat pemberitahuan","=surat"];
const H_EST   = ["estimation date","estimasi"];
const H_STAT  = ["=status","=payment status","status"];

// Flow sejak Coupa go-live 11 Oct 2026: PO (Req → PO → Invoice) atau Direct Invoice (tanpa Req/PO).
const FLOW_PO = "PO", FLOW_DI = "Direct Invoice";

// Saklar fitur dokumen: tab "Document Upload & Merge", tab "Partner Letters" & kolom Documents di Raw Data.
// false = disembunyikan untuk semua role & tidak ada fetch dokumen. Komponen, API, tabel & data tetap ada;
// ubah ke true untuk mengaktifkan kembali.
const SHOW_DOCUMENT_TABS = false;

const SLA_P = [
  { key:"reva_po",   flow:FLOW_PO, label:"Reva → PO",                sla:2, from:["reva date","reva"],                 to:["po date","=po number"] },
  { key:"po_surat",  flow:FLOW_PO, label:"PO → Surat Pemberitahuan",       sla:1, from:["po date"],                         to:H_SURAT },
  { key:"surat_inv", flow:FLOW_PO, label:"Surat Pemberitahuan → Invoice",  sla:2, from:["surat pemberitahuan date","=surat"], to:H_INV },
  { key:"inv_clv",   flow:FLOW_PO, label:"Invoice → CLV",             sla:2, from:H_INV,     to:H_CLV },
  { key:"clv_clear", flow:FLOW_PO, label:"CLV → Bank Clearing",       sla:3, from:H_CLV,     to:H_CLR },
];
const SLA_A = [
  { key:"req_po",    flow:FLOW_PO, label:"Req → PO",                  sla:2, from:["req date","reva date"],             to:["po date","=po number"] },
  { key:"po_inv",    flow:FLOW_PO, label:"PO → Invoice",               sla:2, from:["po date"],                         to:H_INV },
  { key:"inv_clv",   flow:FLOW_PO, label:"Invoice → CLV",              sla:2, from:H_INV,    to:H_CLV },
  { key:"clv_clear", flow:FLOW_PO, label:"CLV → Bank Clearing",        sla:3, from:H_CLV,    to:H_CLR },
];
// Direct Invoice (MOM Coupa): Invoice → AP Verified (Clv Date) 4 WD, AP Verified → Bank Clearing 5 WD
const SLA_DI = [
  { key:"di_inv_ap",   flow:FLOW_DI, label:"Invoice → AP Verified",       sla:4, from:H_INV, to:H_CLV },
  { key:"di_ap_clear", flow:FLOW_DI, label:"AP Verified → Bank Clearing", sla:5, from:H_CLV, to:H_CLR },
];
const slaStepsFor = (isAg, flow) => {
  const po = isAg ? SLA_A : SLA_P;
  if (flow===FLOW_PO) return po;
  if (flow===FLOW_DI) return SLA_DI;
  return [...po, ...SLA_DI];
};

// Accrual Agency: kategori yang tidak di-accrue & agency yang dikecualikan
const ACCRUAL_SKIP_PROG   = ["SALARYUUCK","THR","INCENTIVEMEUGANG"];
const ACCRUAL_SKIP_AGENCY = ["ADHITAMA MITRA NUSANTARA"];

function unique(arr) { return [...new Set(arr.filter(v => v != null && v !== ""))]; }

const MO = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,mei:5,agu:8,okt:10,des:12 };
function monthKey(m) {
  if (!m) return 0;
  const s = String(m).trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})/); if (iso) return +iso[1]*100 + +iso[2];
  const dash = s.match(/^([A-Za-z]{3})[- ](\d{2,4})$/);
  if (dash) { let y = +dash[2]; if (y<100) y+=2000; return y*100+(MO[dash[1].toLowerCase()]||0); }
  const lon = s.match(/([A-Za-z]+)\s+(\d{4})/);
  if (lon) return +lon[2]*100+(MO[lon[1].toLowerCase().slice(0,3)]||0);
  return 0;
}

function fmtMoney(n, short=true) {
  if (n == null || n === "") return "—";
  n = Number(n); if (isNaN(n)) return "—";
  if (!short) return "IDR " + n.toLocaleString("id-ID");
  const f1 = v => v.toFixed(1).replace(".", ",");
  if (Math.abs(n)>=1e12) return "IDR "+f1(n/1e12)+" Tn";
  if (Math.abs(n)>=1e9)  return "IDR "+f1(n/1e9)+" Bn";
  if (Math.abs(n)>=1e6)  return "IDR "+f1(n/1e6)+" Mn";
  if (Math.abs(n)>=1e3)  return "IDR "+(n/1e3).toFixed(0)+" K";
  return "IDR "+n.toFixed(0);
}

function fmtDate(x) {
  if (!x) return "—";
  const d = x instanceof Date ? x : new Date(x);
  if (isNaN(d)) return String(x);
  return d.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"2-digit" });
}

function toDate(x) {
  if (!x && x!==0) return null;
  if (x instanceof Date) return isNaN(x)?null:x;
  if (typeof x==="number" && x>1000 && x<200000) {
    const d = new Date(new Date(1899,11,30).getTime()+x*86400000);
    return isNaN(d)?null:d;
  }
  if (typeof x==="string") {
    if (!x.trim()) return null;
    const d = new Date(x); if (!isNaN(d)) return d;
    const p = x.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (p) { let y=+p[3]; if(y<100)y+=2000; const d2=new Date(y,+p[2]-1,+p[1]); return isNaN(d2)?null:d2; }
  }
  return null;
}

// hanya parse nilai yang JELAS tanggal (Date / serial Excel / ISO / dd-mm-yyyy 4 digit).
// Teks ambigu seperti "Jun-25" sengaja TIDAK diubah agar tak salah tafsir tahun.
function toRealDate(x) {
  if (x instanceof Date) return isNaN(x) ? null : x;
  if (typeof x==="number" && x>1000 && x<200000) { const d=new Date(new Date(1899,11,30).getTime()+x*86400000); return isNaN(d)?null:d; }
  if (typeof x==="string") {
    const s=x.trim();
    if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(s)) { const d=new Date(s); return isNaN(d)?null:d; }
    const p=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/); if (p) { const d=new Date(+p[3],+p[2]-1,+p[1]); return isNaN(d)?null:d; }
  }
  return null;
}
// short date (tanpa jam/menit) → "29/06/2026"; teks non-tanggal dibiarkan apa adanya
function fmtShortDate(x) {
  if (!x && x!==0) return "";
  const d = toRealDate(x);
  if (!d) return typeof x==="string" ? x : "";
  return d.toLocaleDateString("en-GB", { day:"2-digit", month:"2-digit", year:"numeric" });
}
// bulan & tahun saja → "Jun 2025"; teks non-tanggal dibiarkan apa adanya
function fmtMonthYear(x) {
  if (!x && x!==0) return "";
  const d = toRealDate(x);
  if (!d) return typeof x==="string" ? x : String(x ?? "");
  return d.toLocaleDateString("en-GB", { month:"short", year:"numeric" });
}

// Hari kerja (Senin–Jumat) dari a (eksklusif) s.d. b (inklusif). Negatif → null.
function workDaysBetween(a, b) {
  const d1=toDate(a), d2=toDate(b);
  if (!d1||!d2) return null;
  const s=new Date(d1.getFullYear(),d1.getMonth(),d1.getDate()), e=new Date(d2.getFullYear(),d2.getMonth(),d2.getDate());
  const total=Math.round((e-s)/86400000);
  if (total<0) return null;
  const weeks=Math.floor(total/7);
  let wd=weeks*5;
  for (let i=1, dow=s.getDay(); i<=total%7; i++) { const x=(dow+i)%7; if (x!==0&&x!==6) wd++; }
  return wd;
}

const normKey = (s) => String(s).toLowerCase().replace(/\s+/g," ").trim();
// Cache resolusi kolom per (header set, hints) — findCol dipanggil per baris × per hint.
const _colCache = new Map();
function findCol(row, hints) {
  if (!row) return null;
  const ks = Object.keys(row);
  const ck = ks.join("\x01")+"\x03"+hints.join("\x02");
  const hit = _colCache.get(ck);
  if (hit!==undefined) return hit;
  let res = null;
  const nks = ks.map(normKey);
  outer: for (const h of hints) {
    const hh = normKey(h.startsWith("=") ? h.slice(1) : h);
    for (let i=0;i<ks.length;i++) if (nks[i]===hh) { res=ks[i]; break outer; }
  }
  if (!res) outer2: for (const h of hints) {
    if (h.startsWith("=")) continue;
    const hh = normKey(h);
    for (let i=0;i<ks.length;i++) if (nks[i].includes(hh)) { res=ks[i]; break outer2; }
  }
  if (_colCache.size>2000) _colCache.clear();
  _colCache.set(ck,res);
  return res;
}

const gcell = (row,hints,fb="") => { const k=findCol(row,hints); return k&&row[k]!=null ? row[k] : fb; };
const gnum  = (row,hints)       => { const v=gcell(row,hints,0); if(typeof v==="number")return v; const n=parseFloat(String(v).replace(/[^\d.-]/g,"")); return isNaN(n)?0:n; };
const gstr  = (row,hints)       => String(gcell(row,hints,"")||"").trim();
const pct   = (a,b)             => b ? Math.round((a/b)*100) : 0;

// ── Status: label lama Agency disamakan ke label baru ──
const STATUS_ALIAS = {
  "on process payment":"Payment Process", "payment process":"Payment Process", "on payment process":"Payment Process",
  "awaiting inv submission":"Invoice Not Submitted", "awaiting invoice submission":"Invoice Not Submitted", "invoice not submitted":"Invoice Not Submitted",
};
function normalizeStatus(v) {
  const s = String(v ?? "").trim();
  if (!s) return s;
  const k = s.toLowerCase().replace(/\s+/g," ");
  if (STATUS_ALIAS[k]) return STATUS_ALIAS[k];
  if (/^paid\b/.test(k)) return "PAID";
  return s;
}
const isPaidStatus    = (s) => s==="PAID";
const isProcessStatus = (s) => s==="Payment Process";
const isNotSubStatus  = (s) => s==="Invoice Not Submitted";

function normalizeFlow(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return "";
  if (s.includes("direct") || s.startsWith("inv") || s==="di" || s.includes("non po") || s.includes("non-po")) return FLOW_DI;
  if (s.startsWith("po")) return FLOW_PO;
  return "";
}

/*
  Lengkapi tiap baris dengan Flow, PO Number, Invoice Number & status ternormalisasi.
  • File baru : kolom "Flow", "PO Number", "Invoice Number" terpisah.
  • File lama : satu kolom "PO Number / Inv Number" + "Ref Type" (PO/Invoice);
                tanpa Ref Type → nomor diawali "481" = PO, selain itu Direct Invoice.
  Field turunan disimpan di _flow/_po/_inv/_status; kolom "Flow" & "Invoice Number"
  ditambahkan bila belum ada supaya tampil di Raw Data & export.
*/
function enrichRow(r) {
  const o = { ...r };
  const ks = Object.keys(r);
  const flowK  = findCol(r,["=flow","=payment flow","=flow type"]);
  const refK   = findCol(r,["=ref type","=reference type"]);
  const combK  = ks.find(k=>{ const n=normKey(k); return n.includes("po") && n.includes("inv") && (n.includes("/")||n.includes("number")) && !n.includes("date") && !n.includes("submission"); }) || null;
  const poK    = findCol(r,["=po number","=po #","=no po","=po no","=po"]);
  const invK   = findCol(r,["=invoice number","=inv number","=invoice no","=invoice #","=no invoice","=inv no"]);
  const statK  = findCol(r,H_STAT);
  // Placeholder "0" / "-" = belum ada nomor
  const num = (v) => { const s = String(v ?? "").trim(); return /^(0|-+|—|n\/?a)$/i.test(s) ? "" : s; };
  let po  = poK  && poK!==combK  ? num(r[poK])  : "";
  let inv = invK && invK!==combK ? num(r[invK]) : "";
  let flow = flowK ? normalizeFlow(r[flowK]) : "";
  const refFlow = refK ? normalizeFlow(r[refK]) : "";
  if (combK) {
    const val = num(r[combK]);
    if (val) {
      const f = refFlow || (val.startsWith("481") ? FLOW_PO : FLOW_DI);
      if (f===FLOW_PO) { if (!po) po = val; } else if (!inv) inv = val;
      if (!flow) flow = f;
    }
  }
  if (!flow) flow = refFlow || (po ? FLOW_PO : inv ? FLOW_DI : FLOW_PO);
  const status = statK ? normalizeStatus(r[statK]) : "";
  if (statK) o[statK] = status;
  if (flowK) o[flowK] = flow; else o["Flow"] = flow;
  if (!invK) o["Invoice Number"] = inv || null;
  o._flow = flow; o._po = po; o._inv = inv; o._status = status;
  return o;
}
const refNo = (r) => r._po || r._inv || "";
// Tampilan MDI: entity "MPX" ditampilkan sebagai "MDI" (nilai data tidak diubah)
const entLabel = (v, flowSel) => (flowSel===FLOW_DI && String(v??"").trim().toUpperCase()==="MPX") ? "MDI" : v;
// Kolom khusus alur PO/Requisition — disembunyikan di tampilan MDI
const isPoOnlyCol = (k) => /^(#?\s*req\b|req id|req date|requisition|reva\b|reva date|po\b|po #|po number|po date|no po|surat|ref type)/.test(normKey(k));
const rowStatus = (r) => r._status ?? normalizeStatus(gstr(r,H_STAT));
const rowFlow   = (r) => r._flow || FLOW_PO;

function sumRows(rows) {
  return rows.reduce((acc,r)=>({
    n:acc.n+(r.n||0), po:acc.po+(r.po||0), surat:acc.surat+(r.surat||0),
    inv:acc.inv+(r.inv||0), clv:acc.clv+(r.clv||0), clr:acc.clr+(r.clr||0), amt:acc.amt+(r.amt||0),
  }), {n:0,po:0,surat:0,inv:0,clv:0,clr:0,amt:0});
}

const DATE_COLS = ["clv date","clv","clearing date","clearing","invoice submission","invoice","surat pemberitahuan date","po date","reva date","req date","estimation date"];
// kolom periode (bulan) → tampil bulan+tahun saja, BUKAN tanggal penuh
const isMonthKey = (k) => { const kl=String(k).toLowerCase().replace(/\s+/g," ").trim(); return kl==="program date"||kl==="month"||kl==="bulan"||kl==="periode"||kl==="period"||kl.includes("bulan")||kl.includes("periode")||(kl.includes("month")&&!kl.includes("amount")); };
const isDateKey = (k) => { if (isMonthKey(k)) return false; const kl=k.toLowerCase().replace(/\s+/g," ").trim(); return DATE_COLS.some(d=>kl===d||kl.includes("date")||kl.includes("tanggal")); };

// nilai sel untuk EXPORT: tanggal → short date (tanpa jam:menit), periode → bulan+tahun
function fmtExportCell(val, key) {
  if (val == null) return "";
  if (isMonthKey(key)) return fmtMonthYear(val);
  if (isDateKey(key))  return fmtShortDate(val);
  if (val instanceof Date) return isNaN(val) ? "" : fmtShortDate(val);
  if (typeof val==="string" && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(val)) return fmtShortDate(val);
  return val;
}

function isRawRow(r, src) {
  const m = gstr(r,["program date","month","bulan"]).toLowerCase();
  const e = gstr(r,["entity","agency name"]).toLowerCase();
  if (m.includes("total")||m.includes("grand")) return false;
  if (e.includes("total")||e.includes("grand")) return false;
  if (src==="agency") return !!(gstr(r,["agency name"])||gstr(r,["project title","#req id"]));
  return !!(gstr(r,["partner name"])||gstr(r,["project title","#req id"]));
}

function buildAgg(rows, src) {
  const groups = {};
  rows.forEach(r => {
    const ag    = src==="agency";
    const month = gstr(r,["program date","month","bulan","periode"]);
    const entity= gstr(r,["entity"]);
    const ptype = ag ? gstr(r,["agency name"]) : gstr(r,["partner type","partnertype","partner_type"]);
    const prog  = gstr(r,["program type","programtype"]);
    const flow  = rowFlow(r);
    const isPO  = flow===FLOW_PO;
    if (!month) return;
    const key = [month,entity,ptype,prog,flow].join("\x00");
    if (!groups[key]) groups[key]={ month,entity,ptype,prog,flow,src,n:0,po:0,surat:0,inv:0,clv:0,clr:0,amt:0 };
    const g = groups[key];
    g.n++;
    // PO Issued & Surat Pemberitahuan hanya berlaku untuk Flow PO
    if (isPO && (r._po || gcell(r,["po date"]))) g.po++;
    if (isPO && !ag && gcell(r,H_SURAT)) g.surat++;
    if (gcell(r,H_INV)) g.inv++;
    if (gcell(r,H_CLV)) g.clv++;
    if (gcell(r,H_CLR)) g.clr++;
    g.amt += gnum(r,["amount","nilai"]);
  });
  return Object.values(groups);
}

function parseRows(raw, src) {
  const rows = raw.filter(r=>isRawRow(r,src));
  return { raw: rows, agg: buildAgg(rows,src) };
}

function heatClr(p) {
  if (p>=95) return C.tealDp; if (p>=80) return C.tealD; if (p>=65) return C.teal;
  if (p>=45) return C.yellow; if (p>=25) return C.yellowD; if (p>0) return "#b27c00";
  return C.grey;
}

function normalizeName(s) {
  if (!s) return "";
  let n = s.toString().trim().toUpperCase();
  for (const sf of [", PT.", ", CV.", ", TBK.", ", PT", ", CV", ", TBK"]) {
    if (n.endsWith(sf)) { n = n.slice(0, -sf.length).trimEnd().replace(/,\s*$/, "").trim(); break; }
  }
  for (const pf of ["PT. ", "CV. ", "TBK. ", "PT ", "CV ", "TBK "]) {
    if (n.startsWith(pf)) { n = n.slice(pf.length).trim(); break; }
  }
  return n;
}

function getMpxTypeFromRow(r) {
  return (r["Partner Type"]||r["partner type"]||r["partnertype"]||r["partner_type"]||r["PartnerType"]||r["Entity"]||r["entity"]||"").toString().toUpperCase().trim();
}

function getRegionFromRow(r) {
  return (r["Region"]||r["region"]||r["REGION"]||r["regional"]||r["Regional"]||"").toString().trim().toUpperCase();
}

function getPartnerNameFromRow(r) {
  return (r["Partner Name"]||r["partner name"]||r["PARTNER NAME"]||r["partner_name"]||r["partnerName"]||"").toString();
}

function applySidebarFilter(rows, partnerName, filterMpxType, regionFilter, masterData, src) {
  let result = rows;
  if (partnerName && src !== "agency") {
    const targetPartner = normalizeName(partnerName);
    result = result.filter(r => normalizeName(getPartnerNameFromRow(r)) === targetPartner);
  }
  if (filterMpxType && src !== "agency") {
    const tp = filterMpxType.toUpperCase().trim();
    result = result.filter(r => getMpxTypeFromRow(r) === tp);
  }
  if (regionFilter) {
    const targetRegion = regionFilter.toUpperCase().trim();
    result = result.filter(r => {
      const rowRegion = getRegionFromRow(r);
      if (rowRegion) {
        // Kolom Region bisa MULTI-region, dipisah titik koma (;) — mis.
        // "NORTH SUMATERA; CENTRAL SUMATERA" → dapat diakses kedua region.
        const parts = rowRegion.split(";").map(s => s.trim()).filter(Boolean);
        if (parts.some(p => p === "ALL" || p === "SUMATERA" || p === "ALL SUMATERA")) return true;
        return parts.includes(targetRegion);
      }
      // Fallback: turunkan region dari master partner bila kolom Region kosong.
      if (masterData && masterData.length > 0) {
        const match = masterData.find(m => normalizeName(m.partner_name) === normalizeName(getPartnerNameFromRow(r)));
        if (match) return match.region?.toUpperCase().trim() === targetRegion;
      }
      return false;
    });
  }
  return result;
}

const CACHE = "pt_v3_cache";
const getCache   = () => { try { const s=sessionStorage.getItem(CACHE); return s?JSON.parse(s):null; } catch { return null; } };
const setCache   = (d) => { try { sessionStorage.setItem(CACHE,JSON.stringify(d)); } catch {} };
const clearCache = () => { try { sessionStorage.removeItem(CACHE); } catch {} };

async function dbSave(payload) {
  try {
    // NON-DESTRUKTIF: insert baris baru DULU, ambil id-nya, baru hapus baris lama.
    // Jika insert gagal, data lama di DB tetap utuh (tidak ada window kosong).
    const { data, error } = await supabase.from("payout_data").insert({
      file_name:payload.fileName, row_count:payload.rowCount,
      published_at:payload.publishedAt, raw_data:payload.rows, mode:"raw",
    }).select("id").single();
    if (error) throw error;
    // Sisakan hanya baris terbaru sebagai satu sumber kebenaran.
    await supabase.from("payout_data").delete().neq("id", data.id);
    return { ok:true, error:null };
  } catch (e) {
    console.error("dbSave error:", e);
    return { ok:false, error:e?.message || String(e) };
  }
}

// Melempar error bila gagal baca — dipakai publish agar "gagal baca" tidak dianggap "data kosong".
async function dbFetch() {
  const { data, error } = await supabase.from("payout_data")
    .select("*").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { fileName:data.file_name||"", rowCount:data.row_count||0, publishedAt:data.published_at||"", rows:data.raw_data||[] };
}

async function dbLoad() {
  try { return await dbFetch(); }
  catch (e) { console.error(e); return null; }
}

async function dbDelete() {
  try { const { error } = await supabase.from("payout_data").delete().gt("id",0); return !error; }
  catch { return false; }
}

// Workbook baru punya banyak sheet (Panduan, Temuan, Outstanding Payment, Accrual Summary,
// Lists, Coupa_*, SAP…). Ambil sheet "Partner Prepaid"/"Agency Prepaid": exact → startsWith → includes.
// Tidak ketemu → null (bukan sheet pertama): sheet yang salah bisa mengganti data live.
function pickSheet(names, src) {
  const want = src==="agency" ? "agency prepaid" : "partner prepaid";
  // Sheet "… MDI" dibaca terpisah (lihat mdiSheet), jangan sampai terambil sebagai sheet utama
  const n = names.map(s=>({ s, k:normKey(s) })).filter(x=>!/\bmdi\b/.test(x.k));
  const hit = n.find(x=>x.k===want)
    || n.find(x=>x.k.startsWith(want))
    || n.find(x=>x.k.includes(want) && !/coupa|sap|accrual|outstanding|summary|list|panduan|temuan/.test(x.k));
  return hit ? hit.s : null;
}

// Sheet Direct Invoice sejak Coupa: "Partner Prepaid MDI" / "Agency Prepaid MDI"
function mdiSheet(names, src) {
  const want = src==="agency" ? "agency prepaid" : "partner prepaid";
  const n = names.map(s=>({ s, k:normKey(s) }));
  const hit = n.find(x=>x.k===want+" mdi") || n.find(x=>x.k.startsWith(want) && /\bmdi\b/.test(x.k));
  return hit ? hit.s : null;
}

function sheetRows(XLSX, ws, src, forceFlow) {
  const arr = XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
  const hints = src==="agency"
    ? ["agency name","program type","#req","amount","po number","invoice number","flow","status"]
    : ["partner name","program type","#req","amount","po number","invoice number","flow","status","reva date"];
  let hdr = 0;
  for (let i=0;i<Math.min(arr.length,12);i++) {
    const row = arr[i].map(c=>String(c).toLowerCase()).join(" ");
    if (hints.filter(h=>row.includes(h)).length>=2) { hdr=i; break; }
  }
  const rawRows = XLSX.utils.sheet_to_json(ws,{defval:null,range:hdr});
  return rawRows.map(row=>{
    const clean={};
    Object.keys(row).forEach(k=>{
      const v=row[k];
      clean[k.trim()] = v instanceof Date ? (isNaN(v)?null:v.toISOString()) : v;
    });
    if (forceFlow) clean.Flow = forceFlow; // semua baris sheet MDI = Direct Invoice
    clean._source=src;
    return clean;
  }).filter(r=>isRawRow(r,src)); // baris Total/kosong tidak ikut dipublish
}

// Baca satu workbook → { partner:{sheet,rows}|null, agency:{sheet,rows}|null }.
// File satu sheet tanpa nama yang cocok (mis. CSV) dikenali dari header kolomnya.
async function readWorkbook(file) {
  const XLSX = await getXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf,{type:"array",cellDates:true});
  const names = wb.SheetNames;
  const found = { partner:pickSheet(names,"partner"), agency:pickSheet(names,"agency") };
  if (!found.partner && !found.agency && names.length===1 && !mdiSheet(names,"partner") && !mdiSheet(names,"agency")) {
    const head = XLSX.utils.sheet_to_json(wb.Sheets[names[0]],{header:1,defval:""}).slice(0,12).flat().map(c=>normKey(c));
    if (head.includes("agency name")) found.agency = names[0];
    else if (head.includes("partner name")) found.partner = names[0];
  }
  const side = (src) => {
    const mdi = mdiSheet(names, src);
    const base = found[src] ? sheetRows(XLSX, wb.Sheets[found[src]], src) : [];
    const di = mdi ? sheetRows(XLSX, wb.Sheets[mdi], src, FLOW_DI) : [];
    const rows = [...base, ...di];
    if (!rows.length) return null;
    // Baris yang muncul di dua sheet (pemilik + nomor invoice sama) → kemungkinan dobel
    const key = (r) => { const e = enrichRow(r); return e._inv ? normalizeName(ownerName(r))+"|"+e._inv.toUpperCase() : null; };
    const baseKeys = new Set(base.map(key).filter(Boolean));
    const dup = di.filter(r=>{ const k=key(r); return k && baseKeys.has(k); }).length;
    return { sheet:[found[src],mdi].filter(Boolean).join(" + "), rows, dup };
  };
  return { partner:side("partner"), agency:side("agency") };
}

const LIGHT = {
  bg:"#F0F0F3",surf:"#FFFFFF",surf2:"#F2F2F6",surf3:"#E8E8EE",surf4:"#D8D8E0",
  ink:"#111113",ink2:"#2A2A30",muted:"#52525B",muted2:"#8A8A96",
  line:"rgba(0,0,0,0.09)",line2:"rgba(0,0,0,0.14)",
  accent:C.teal,accentD:C.tealD,red:C.red,yellow:C.yellow,yellowD:C.yellowD,magenta:C.magenta,pink:C.pink,
  good:C.teal,goodDark:C.tealDp,goodBg:"rgba(50,188,173,0.10)",goodBd:"rgba(50,188,173,0.25)",
  warn:C.yellow,warnDark:"#8a6a00",warnBg:"rgba(255,203,5,0.12)",warnBd:"rgba(255,203,5,0.30)",
  bad:C.red,badDark:"#aa1018",badBg:"rgba(237,28,36,0.09)",badBd:"rgba(237,28,36,0.22)",
  info:"#0060CC",infoBg:"rgba(0,96,204,0.08)",infoBd:"rgba(0,96,204,0.20)",
  spotBg:"#111113",grandBg:"#111113",spotInk:"#FFFFFF",
  rowHover:"rgba(50,188,173,0.06)",rowStripe:"rgba(0,0,0,0.025)",monthBg:"rgba(50,188,173,0.07)",
  shadow1:"0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.05)",
  shadow2:"0 4px 16px rgba(0,0,0,0.09), 0 1px 4px rgba(0,0,0,0.05)",
  shadow3:"0 12px 40px rgba(0,0,0,0.14), 0 4px 12px rgba(0,0,0,0.06)",
};

const DARK = {
  bg:"#0D0D0E",surf:"#13161F",surf2:"#1A1D28",surf3:"#222535",surf4:"#2A2E3E",
  ink:"#F1F5F9",ink2:"#CBD5E1",muted:"#94A3B8",muted2:"#64748B",
  line:"#242937",line2:"#2E3347",
  accent:C.teal,accentD:C.tealD,red:"#FF5A5F",yellow:"#FFCB05",yellowD:"#c49b00",magenta:"#D420A0",pink:"#FF3399",
  good:C.teal,goodDark:"#7ee8e0",goodBg:"rgba(50,188,173,0.13)",goodBd:"rgba(50,188,173,0.30)",
  warn:"#FFCB05",warnDark:"#ffe066",warnBg:"rgba(255,203,5,0.13)",warnBd:"rgba(255,203,5,0.30)",
  bad:"#FF5A5F",badDark:"#ff8a8d",badBg:"rgba(255,90,95,0.13)",badBd:"rgba(255,90,95,0.30)",
  info:"#4D9FFF",infoBg:"rgba(77,159,255,0.12)",infoBd:"rgba(77,159,255,0.28)",
  spotBg:"#0A0C12",grandBg:"#0A0C12",spotInk:"#F1F5F9",
  rowHover:"rgba(50,188,173,0.09)",rowStripe:"rgba(255,255,255,0.025)",monthBg:"rgba(50,188,173,0.09)",
  shadow1:"0 1px 2px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.30)",
  shadow2:"0 6px 18px rgba(0,0,0,0.55), 0 1px 4px rgba(0,0,0,0.35)",
  shadow3:"0 20px 48px rgba(0,0,0,0.65), 0 4px 12px rgba(0,0,0,0.45)",
};

function resolveTheme(themeProp) {
  if (themeProp === "dark")  return true;
  if (themeProp === "light") return false;
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("sh-theme");
    if (stored === "dark")  return true;
    if (stored === "light") return false;
    const el   = document.documentElement;
    const attr = el.getAttribute("data-theme") || el.getAttribute("data-color-scheme") || "";
    if (attr === "dark")  return true;
    if (attr === "light") return false;
    if (el.classList.contains("dark") || document.body.classList.contains("dark")) return true;
  }
  return true;
}

function useTheme(themeProp) {
  const [dark, setDark] = useState(() => resolveTheme(themeProp));
  useEffect(() => { setDark(resolveTheme(themeProp)); }, [themeProp]);
  useEffect(() => {
    if (themeProp) return;
    const checkAll = () => setDark(resolveTheme(null));
    window.addEventListener("storage", checkAll);
    const obs = new MutationObserver(checkAll);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme","data-color-scheme","class"] });
    obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => { obs.disconnect(); window.removeEventListener("storage", checkAll); };
  }, [themeProp]);
  return dark ? DARK : LIGHT;
}

// Lebar area Payout Tracker (bukan jendela): di dashboard ada sidebar, jadi breakpoint
// harus mengikuti ruang yang benar-benar tersedia. Diisi oleh ThemeWrapper lewat ResizeObserver.
const WidthCtx = React.createContext(null);
function useWidth() {
  const box = React.useContext(WidthCtx);
  const [w, setW] = useState(typeof window!=="undefined"?window.innerWidth:1200);
  useEffect(()=>{
    const fn = ()=>setW(window.innerWidth);
    window.addEventListener("resize",fn,{passive:true});
    return ()=>window.removeEventListener("resize",fn);
  },[]);
  return box ?? w;
}

function useHover() {
  const [hov, setHov] = useState(false);
  return [hov, { onMouseEnter:()=>setHov(true), onMouseLeave:()=>setHov(false) }];
}

let _kfInjected = false;
function useKeyframes() {
  useEffect(()=>{
    if (_kfInjected) return;
    const el = document.createElement("style");
    el.id = "__pt_kf__";
    el.textContent = [
      "@keyframes _pt_spin{to{transform:rotate(360deg)}}",
      "@keyframes _pt_fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}",
      "@keyframes _pt_sweep{0%{left:-45%;width:42%}50%{left:28%;width:58%}100%{left:110%;width:42%}}",
      "[role='button']:focus-visible,button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid #32BCAD;outline-offset:2px;border-radius:8px}",
    ].join("");
    document.head.appendChild(el);
    _kfInjected = true;
  },[]);
}

function Spinner({ size=24, color }) {
  useKeyframes();
  return (
    <span style={{width:size,height:size,borderWidth:"2.5px",borderStyle:"solid",borderColor:"rgba(128,128,128,0.18)",borderTopColor:color||C.teal,borderRadius:"50%",display:"inline-block",animation:"_pt_spin 0.75s linear infinite",flexShrink:0}}/>
  );
}

function LoadingBar() {
  return (
    <div style={{position:"fixed",top:0,left:0,right:0,height:2.5,zIndex:9999,overflow:"hidden",background:"rgba(50,188,173,0.12)"}}>
      <div style={{position:"absolute",top:0,height:"100%",borderRadius:99,background:`linear-gradient(90deg,transparent,${C.red} 30%,${C.yellow} 55%,${C.teal} 75%,${C.magenta},transparent)`,animation:"_pt_sweep 1.4s cubic-bezier(0.4,0,0.2,1) infinite"}}/>
    </div>
  );
}

function Btn({ children, variant="outline", sm=false, style={}, t, ...rest }) {
  const [hov,hE] = useHover();
  const base = {display:"inline-flex",alignItems:"center",gap:7,cursor:"pointer",fontFamily:"inherit",fontWeight:600,borderRadius:12,border:"1px solid transparent",transition:"all 0.15s",whiteSpace:"nowrap",letterSpacing:"-0.01em",fontSize:sm?12:13,padding:sm?"6px 14px":"9px 18px"};
  const vs = {
    primary:{ background:hov?C.tealD:C.teal, color:"#fff", borderColor:C.teal },
    outline:{ background:hov?t.surf3:t.surf, color:t.ink, borderColor:t.line2 },
    danger: { background:hov?t.bad:t.badBg, color:hov?t.spotInk:t.bad, borderColor:t.bad },
    ghost:  { background:hov?t.surf3:"transparent", color:hov?t.ink:t.muted, borderColor:"transparent" },
  };
  return <button style={{...base,...(vs[variant]||vs.outline),...style}} {...hE} {...rest}>{children}</button>;
}

function Card({ children, style={}, t, pad=true }) {
  return (
    <div style={{background:t.surf,border:`1px solid ${t.line}`,borderRadius:18,overflow:"hidden",boxShadow:t.shadow1,...style}}>
      {pad ? <div style={{padding:20}}>{children}</div> : children}
    </div>
  );
}

function CardHead({ title, sub, accent, right, t }) {
  const ac = accent || C.teal;
  return (
    <div style={{padding:"14px 20px",borderBottom:`1px solid ${t.line}`,display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap",background:t.surf2}}>
      <div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{width:4,height:18,borderRadius:2,background:ac,display:"block",flexShrink:0}}/>
          <span style={{fontWeight:700,fontSize:14,letterSpacing:"-0.02em",color:t.ink}}>{title}</span>
        </div>
        {sub&&<div style={{marginTop:4,marginLeft:14,fontFamily:MONO,fontSize:10.5,color:t.muted}}>{sub}</div>}
      </div>
      {right&&<div style={{flexShrink:0}}>{right}</div>}
    </div>
  );
}

function MsOption({o,label,checked,onToggle,t}) {
  const [hov,hE]=useHover();
  return (
    <label {...hE} style={{display:"flex",alignItems:"center",gap:9,padding:"7px 12px",cursor:"pointer",background:hov?t.surf3:checked?`${C.teal}10`:"transparent",borderTop:`1px solid ${t.line}`,transition:"background .1s"}}>
      <input type="checkbox" checked={checked} onChange={onToggle} style={{width:14,height:14,accentColor:C.teal,cursor:"pointer",flexShrink:0,margin:0}}/>
      <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:12.5,fontWeight:checked?600:400,color:t.ink}}>{label??o}</span>
      {checked&&<span style={{color:C.teal,fontSize:11,fontWeight:700,flexShrink:0}}>✓</span>}
    </label>
  );
}

function MultiSel({ values, options, onChange, placeholder, t, labelOf=(v)=>v }) {
  const [open,setOpen]=useState(false);
  const [hov,hE]=useHover();
  const boxRef=useRef(null);
  useEffect(()=>{
    if (!open) return;
    const onDoc=e=>{ if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const onKey=e=>{ if (e.key==="Escape") setOpen(false); };
    document.addEventListener("mousedown",onDoc);
    document.addEventListener("keydown",onKey);
    return ()=>{ document.removeEventListener("mousedown",onDoc); document.removeEventListener("keydown",onKey); };
  },[open]);
  const toggle=v=>onChange(values.includes(v)?values.filter(x=>x!==v):[...values,v]);
  const active=values.length>0;
  const label=!active?placeholder:values.length<=2?values.map(labelOf).join(", "):`${values.length} selected`;
  return (
    <div ref={boxRef} style={{position:"relative",minWidth:110,flex:"1 1 110px"}}>
      <button type="button" onClick={()=>setOpen(o=>!o)} {...hE}
        style={{width:"100%",display:"flex",alignItems:"center",gap:7,padding:"7px 11px",fontSize:12.5,borderRadius:10,border:`1px solid ${active?C.teal:(hov||open)?C.tealD:t.line2}`,background:t.surf2,color:active?t.ink:t.muted,fontFamily:"inherit",cursor:"pointer",outline:"none",boxShadow:active||open?`0 0 0 3px ${C.teal}26`:"none",transition:"border-color .15s, box-shadow .15s",textAlign:"left",boxSizing:"border-box"}}>
        <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</span>
        {active&&<span style={{fontFamily:MONO,fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:99,background:C.teal,color:"#fff",flexShrink:0}}>{values.length}</span>}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink:0,transform:open?"rotate(180deg)":"none",transition:"transform .15s",opacity:.7}}><path d="m6 9 6 6 6-6"/></svg>
      </button>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,minWidth:"100%",width:"max-content",maxWidth:"min(280px, calc(100vw - 32px))",zIndex:400,background:t.surf,border:`1px solid ${t.line2}`,borderRadius:12,boxShadow:t.shadow3,overflow:"hidden"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"7px 12px",background:t.surf2,fontFamily:MONO,fontSize:9.5,letterSpacing:"0.1em",textTransform:"uppercase",color:active?C.tealD:t.muted}}>
            <span>Selected: {values.length} item{values.length!==1?"s":""}</span>
            {active&&<button type="button" onClick={()=>onChange([])} style={{border:"none",background:"transparent",color:t.bad,cursor:"pointer",fontFamily:"inherit",fontSize:9.5,letterSpacing:"0.1em",textTransform:"uppercase",padding:0}}>Clear</button>}
          </div>
          <div style={{maxHeight:220,overflowY:"auto"}}>
            {options.length===0
              ? <div style={{padding:"10px 12px",fontSize:12,color:t.muted,fontStyle:"italic"}}>No options available</div>
              : options.map(o=><MsOption key={o} o={o} label={labelOf(o)} checked={values.includes(o)} onToggle={()=>toggle(o)} t={t}/>)}
          </div>
        </div>
      )}
    </div>
  );
}

function PctBadge({ val, t }) {
  const ok=val>=80, mid=val>=50;
  const bg=ok?t.goodBg:mid?t.warnBg:t.badBg, bd=ok?t.goodBd:mid?t.warnBd:t.badBd;
  const clr=ok?t.goodDark:mid?t.warnDark:t.badDark, dot=ok?t.good:mid?t.warn:t.bad;
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 9px",borderRadius:99,fontFamily:MONO,fontSize:11,fontWeight:700,background:bg,color:clr,border:`1px solid ${bd}`}}>
      <span style={{width:7,height:7,borderRadius:"50%",background:dot,flexShrink:0}}/>{val}%
    </span>
  );
}

function StatusBadge({ val, t }) {
  const s = String(val||"").toLowerCase();
  let bg=t.surf3, c=t.muted, bd=t.line;
  if (s.includes("paid")&&!s.includes("not")&&!s.includes("un")) { bg=t.goodBg; c=t.goodDark; bd=t.goodBd; }
  else if (s.includes("process")) { bg=t.infoBg; c=t.info; bd=t.infoBd; }
  else if (s.includes("not")||s.includes("pending")||s.includes("awaiting")||s.includes("unpaid")) { bg=t.warnBg; c=t.warnDark; bd=t.warnBd; }
  return <span style={{display:"inline-flex",padding:"2px 8px",borderRadius:6,fontFamily:MONO,fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",background:bg,color:c,border:`1px solid ${bd}`}}>{val}</span>;
}

function BarChart({ series, t }) {
  if (!series.length) return null;
  const W=480,H=200,pL=36,pR=8,pT=12,pB=40;
  const cW=W-pL-pR, cH=H-pT-pB;
  const gW=cW/series.length, bW=Math.max(6,Math.min(gW*0.35,22)), gap=2;
  const yF=v=>pT+cH-(Math.min(100,Math.max(0,v))/100)*cH;
  const xC=i=>pL+i*gW+gW/2, bot=yF(0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}} preserveAspectRatio="xMidYMid meet">
      <rect x={pL} y={pT} width={cW} height={cH} fill={t.surf2} rx={6}/>
      {[0,25,50,75,100].map(v=>{
        const y=yF(v);
        return <g key={v}><line x1={pL} y1={y} x2={W-pR} y2={y} stroke={t.line} strokeWidth={v?1:1.5} strokeDasharray={v?"4 3":"0"}/><text x={pL-4} y={y+3.5} textAnchor="end" fontSize={9} fill={t.muted} fontFamily={MONO}>{v}%</text></g>;
      })}
      {series.map((s,i)=>{
        const xc=xC(i), xI=xc-bW-gap/2, xCl=xc+gap/2;
        const yI=yF(s.inv), hI=Math.max(2,bot-yI);
        const yCl=yF(s.clr), hCl=Math.max(2,bot-yCl);
        let lbl=String(s.month||"");
        lbl=lbl.replace(/([A-Za-z]{3})[a-z]*[\s\-](\d{2,4})/,(_,m,y)=>m+"'"+(y.length===4?y.slice(-2):y));
        lbl=lbl.replace(/^(\d{4})[\/\-](\d{1,2})$/,(_,y,mo)=>{ const ms=["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return (ms[+mo]||mo)+"'"+y.slice(-2); });
        return (
          <g key={i}>
            <rect x={xI} y={yI} width={bW} height={hI} fill={t.yellow} rx="3"><title>{s.month} Invoice: {s.inv.toFixed(1)}%</title></rect>
            {s.inv>=8&&hI>16&&<text x={xI+bW/2} y={yI-3} textAnchor="middle" fontSize={8} fontWeight="700" fill={t.yellowD} fontFamily={MONO}>{Math.round(s.inv)}%</text>}
            <rect x={xCl} y={yCl} width={bW} height={hCl} fill={C.teal} rx="3"><title>{s.month} Clearing: {s.clr.toFixed(1)}%</title></rect>
            {s.clr>=8&&hCl>16&&<text x={xCl+bW/2} y={yCl-3} textAnchor="middle" fontSize={8} fontWeight="700" fill={C.tealD} fontFamily={MONO}>{Math.round(s.clr)}%</text>}
            <text x={xc} y={H-pB+14} textAnchor="middle" fontSize={8.5} fill={t.muted} fontFamily={MONO}>{lbl}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function PayoutTracker({
  profile      = null,
  theme        = null,
  partnerName  = null,
  filterType   = null,
  readOnly     = false,
  regionFilter = null,
  masterData   = [],
}) {
  const isSPM    = profile?.role === "spm_sumatera";
  const isIOHAny = ["internal_ioh","ioh_north_sumatera","ioh_central_sumatera","ioh_south_sumatera"].includes(profile?.role);
  const isIOHRegional = ["ioh_north_sumatera","ioh_central_sumatera","ioh_south_sumatera"].includes(profile?.role);
  // IOH Sumatera (umbrella) boleh memilih region view sendiri di sidebar payout.
  const isIOHUmbrella = isIOHAny && !isIOHRegional;
  // Role yang melihat seluruh Sumatera & boleh memfilter per-region: SPM + IOH Sumatera.
  const canPickRegion = isSPM || isIOHUmbrella;

  const filterMpxType = filterType || null;

  // Pilihan region view. "" = seluruh Sumatera (tidak difilter).
  // Nilai awal mengikuti regionFilter yang dibawa dari view lain (mis. MFTS).
  const [regionView, setRegionView] = useState(canPickRegion ? (regionFilter || "") : "");
  // Daftar region dari master data (fallback ke 3 region Sumatera).
  const regionOptions = useMemo(() => {
    const fromMaster = [...new Set((masterData || []).map(m => (m.region || "").toUpperCase().trim()).filter(Boolean))];
    const fallback = ["NORTH SUMATERA","CENTRAL SUMATERA","SOUTH SUMATERA"];
    return fromMaster.length ? fromMaster.sort() : fallback;
  }, [masterData]);
  // Region efektif yang dipakai memfilter data:
  //  • SPM / IOH umbrella → pilihan regionView (null jika "Seluruh Sumatera")
  //  • IOH regional terkunci → regionFilter dari prop
  const effectiveRegion = canPickRegion ? (regionView || null) : regionFilter;

  const [screen, setScreen]          = useState("loading");
  const [src, setSrc]                = useState("partner");
  const [activeTab, setActiveTab]    = useState("dash");
  const [heatMetric, setHeatMetric]  = useState("clr");
  const [loading, setLoading]        = useState(false);
  const [loadText, setLoadText]      = useState("Loading…");
  const [toast, setToast]            = useState({ msg:"", type:"", show:false });
  const [allRaw, setAllRaw]          = useState([]);
  const [pubMeta, setPubMeta]        = useState(null);
  // Hasil upload per sisi: { file, sheet, rows } atau null
  const [upload, setUpload] = useState({ partner:null, agency:null });

  const [showAllCols, setShowAllCols] = useState(false);

  // Data lama di DB tetap jalan: Flow/Invoice Number/status diturunkan saat load.
  const enrichedRaw = useMemo(() => allRaw.map(enrichRow), [allRaw]);

  const { partnerRaw, agencyRaw } = useMemo(() => {
    const pAll = enrichedRaw.filter(r => r._source === "partner" || !r._source);
    const aAll = enrichedRaw.filter(r => r._source === "agency");
    const pR = applySidebarFilter(pAll, partnerName, filterMpxType, effectiveRegion, masterData, "partner");
    const aR = applySidebarFilter(aAll, null, null, effectiveRegion, masterData, "agency");
    return { partnerRaw: pR, agencyRaw: aR };
  }, [enrichedRaw, partnerName, filterMpxType, effectiveRegion, masterData]);

  const { partnerAgg, agencyAgg } = useMemo(() => {
    const { agg: pAgg } = parseRows(partnerRaw, "partner");
    const { agg: aAgg } = parseRows(agencyRaw, "agency");
    return { partnerAgg: pAgg, agencyAgg: aAgg };
  }, [partnerRaw, agencyRaw]);

  const [filters, setFilters]         = useState({ month:[], entity:[], ptype:[], prog:[], status:[], flow:"all", q:"" });
  const [searchInput, setSearchInput] = useState("");
  const [tblSort, setTblSort]         = useState({ col:"month", dir:"desc" });
  const [rawSort, setRawSort]         = useState({ col:null, dir:"asc" });
  const [rawPage, setRawPage]         = useState(1);
  const [rawPageSize]                 = useState(100);
  // Status collapse Monthly Summary: { sig, map } — map hanya berlaku untuk set bulan (sig) saat itu.
  const [collapseState, setCollapseState] = useState({ sig:null, map:{} });
  const [searchFocus, setSearchFocus] = useState(false);
  const [searchIdx, setSearchIdx]     = useState(-1);
  const searchRef                     = useRef(null);
  const [funnelExp, setFunnelExp]     = useState(null);
  const [bnExp, setBnExp]             = useState(null);
  const realtimeCh = useRef(null);
  const toastTmr   = useRef(null);

  const isAg   = src === "agency";
  const curRaw = isAg ? agencyRaw  : partnerRaw;
  const curAgg = isAg ? agencyAgg  : partnerAgg;
  const flowSel = filters.flow==="PO" ? FLOW_PO : filters.flow==="DI" ? FLOW_DI : "all";
  const slaSet = useMemo(()=>slaStepsFor(isAg, flowSel),[isAg,flowSel]);

  const showToast = useCallback((msg,type="")=>{
    clearTimeout(toastTmr.current);
    setToast({msg,type,show:true});
    toastTmr.current = setTimeout(()=>setToast(x=>({...x,show:false})),3500);
  },[]);

  const startLoad = (lbl="Loading…") => { setLoadText(lbl); setLoading(true); };
  const stopLoad  = () => setLoading(false);

  useEffect(()=>{
    const id = setTimeout(()=>{
      setFilters(f => f.q === searchInput.trim() ? f : ({ ...f, q: searchInput.trim() }));
    }, 300);
    return ()=>clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[searchInput]);

  function ingestCloud(saved) {
    setAllRaw(Array.isArray(saved.rows) ? saved.rows : []);
    setPubMeta({ fileName:saved.fileName, rowCount:saved.rowCount, publishedAt:saved.publishedAt });
  }

  useEffect(()=>{
    (async()=>{
      // 1) Cache dipakai HANYA sebagai placeholder cepat agar layar tidak kosong.
      //    Ini TIDAK dijadikan sumber kebenaran.
      const cached = getCache();
      if (cached?.rows?.length) {
        ingestCloud(cached); setScreen(isSPM?"admin":"dashboard"); setLoading(false);
      } else {
        startLoad("Loading data…");
      }
      // 2) SELALU ambil versi otoritatif dari Supabase supaya semua device
      //    menampilkan data & timestamp "Last updated" yang identik.
      const saved = await dbLoad(); stopLoad();
      if (saved?.rows?.length) {
        setCache(saved); ingestCloud(saved);
        setScreen(isSPM?"admin":"dashboard");
      } else {
        // DB kosong = tidak ada data terpublish → bersihkan cache lokal yang basi.
        clearCache(); setAllRaw([]); setPubMeta(null);
        setScreen(isSPM?"admin":"empty");
      }
    })();
    const ch = supabase.channel("pt_rt_v3")
      .on("postgres_changes",{event:"*",schema:"public",table:"payout_data"}, async ()=>{
        const saved = await dbLoad();
        if (!saved?.rows?.length) { if (!isSPM) { clearCache(); setScreen("empty"); showToast("Data removed by Admin",""); } return; }
        setCache(saved); ingestCloud(saved);
        if (!isSPM) { setScreen("dashboard"); showToast("Latest data received 📡","success"); }
        else setPubMeta({ fileName:saved.fileName, rowCount:saved.rowCount, publishedAt:saved.publishedAt });
      }).subscribe();
    realtimeCh.current = ch;
    return () => { try { supabase.removeChannel(ch); } catch {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  async function handleFile(file) {
    if (!file) return;
    try {
      const res = await readWorkbook(file);
      if (!res.partner && !res.agency) { showToast('No "Partner Prepaid" or "Agency Prepaid" sheet with data found in this file',"error"); return; }
      // Sisi yang tidak ada di file ini tetap dari upload sebelumnya → dua file terpisah tetap bisa
      setUpload(u=>({
        partner: res.partner ? { ...res.partner, file:file.name } : u.partner,
        agency:  res.agency  ? { ...res.agency,  file:file.name } : u.agency,
      }));
      const lbl = [res.partner&&`Partner ${res.partner.rows.length.toLocaleString()}`, res.agency&&`Agency ${res.agency.rows.length.toLocaleString()}`].filter(Boolean).join(" · ");
      showToast(`File read: ${lbl} rows`,"success");
    } catch(e) { showToast("Failed to read file: "+e.message,"error"); }
  }

  async function publish() {
    const { partner, agency } = upload;
    if (!partner && !agency) { showToast("Please upload a file first","error"); return; }
    startLoad("Uploading to cloud…");
    // Semua data tersimpan di SATU baris payout_data, dan dbSave mengganti baris itu.
    // Sisi yang tidak di-upload disalin dari data live supaya tidak ikut hilang.
    let keepPartner = [], keepAgency = [], kept = "";
    if (!partner || !agency) {
      let live;
      try { live = await dbFetch(); }
      catch (e) { stopLoad(); showToast("Could not read live data, nothing was published: "+(e?.message||e),"error"); return; }
      const liveRows = live?.rows || [];
      if (!partner) { keepPartner = liveRows.filter(r=>r._source==="partner"||!r._source); kept = "Partner"; }
      else          { keepAgency  = liveRows.filter(r=>r._source==="agency"); kept = "Agency"; }
    }
    const merged = [...(partner?partner.rows:keepPartner),...(agency?agency.rows:keepAgency)];
    const ts = new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
    const fnames = unique([partner?.file,agency?.file]).join(", ")+(kept?` (${kept} unchanged)`:"");
    const res = await dbSave({ fileName:fnames, rowCount:merged.length, publishedAt:ts, rows:merged });
    stopLoad();
    if (res.ok) { const meta={fileName:fnames,rowCount:merged.length,publishedAt:ts}; setPubMeta(meta); setCache({...meta,rows:merged}); setAllRaw(merged); showToast("✓ Published — all viewers auto-updated","success"); }
    else showToast("Unable to save to cloud: "+(res.error||"unknown error"),"error");
  }

  async function viewDash() {
    startLoad("Loading…"); const saved=await dbLoad(); stopLoad();
    if (saved?.rows?.length) { setCache(saved); ingestCloud(saved); setScreen("dashboard"); }
    else if (allRaw.length) setScreen("dashboard");
    else showToast("No data available","error");
  }

  async function clearData() {
    startLoad("Deleting…"); const ok=await dbDelete(); stopLoad();
    if (ok) { setPubMeta(null); setAllRaw([]); clearCache(); showToast("Data deleted","success"); }
    else showToast("Failed to delete data","error");
  }

  const opts = useMemo(()=>{
    if (!curAgg.length) return { months:[],entities:[],ptypes:[],progs:[],statuses:[] };
    return {
      months:   unique(curAgg.map(r=>r.month)).sort((a,b)=>monthKey(a)-monthKey(b)),
      entities: unique(curAgg.map(r=>r.entity)).sort(),
      ptypes:   unique(curAgg.map(r=>r.ptype)).sort(),
      progs:    unique(curAgg.map(r=>r.prog)).sort(),
      statuses: unique(curRaw.map(rowStatus)).sort(),
    };
  },[curAgg,curRaw]);

  const { filtAgg, filtRaw } = useMemo(()=>{
    const { month,entity,ptype,prog,status,q } = filters;
    const flow = filters.flow==="PO" ? FLOW_PO : filters.flow==="DI" ? FLOW_DI : null;
    const ql = q.toLowerCase().trim();
    const toArr = v => Array.isArray(v) ? v : (v ? [v] : []);
    const monthSel=toArr(month), entSel=toArr(entity), ptypeSel=toArr(ptype), progSel=toArr(prog), statusSel=toArr(status);
    let agg = curAgg.filter(r=>
      (monthSel.length===0||monthSel.includes(r.month))&&
      (entSel.length===0||entSel.includes(r.entity))&&
      (ptypeSel.length===0||ptypeSel.includes(r.ptype))&&
      (progSel.length===0||progSel.includes(r.prog))&&
      (!flow||r.flow===flow)
    );
    let raw = curRaw.filter(r=>{
      if (flow && rowFlow(r)!==flow) return false;
      if (monthSel.length>0 && !monthSel.includes(gstr(r,["program date","month"]))) return false;
      if (entSel.length>0   && !entSel.includes(gstr(r,["entity"]))) return false;
      if (ptypeSel.length>0 && !ptypeSel.includes(gstr(r,["partner type","agency name"]))) return false;
      if (progSel.length>0  && !progSel.includes(gstr(r,["program type"]))) return false;
      if (statusSel.length>0 && !statusSel.includes(rowStatus(r))) return false;
      if (ql) { const blob=[gstr(r,["partner name","agency name"]),gstr(r,["project title"]),r._po,r._inv,gstr(r,["#req id"])].join(" ").toLowerCase(); if (!blob.includes(ql)) return false; }
      return true;
    });
    if (statusSel.length>0||ql) agg = buildAgg(raw, src);
    return { filtAgg:agg, filtRaw:raw };
  },[curAgg,curRaw,filters,src]);

  const grand = useMemo(()=>sumRows(filtAgg),[filtAgg]);

  const grandPartnerCount = useMemo(()=>{
    return unique(filtRaw.map(r=>gstr(r,["partner name","agency name"]))).length;
  },[filtRaw]);

  const funnelStages = useMemo(()=>{
    const g = grand;
    const inv = {key:"inv",label:"Invoice Submitted",val:g.inv,color:C.teal};
    const clr = {key:"clr",label:"Bank Cleared",val:g.clr,color:C.yellowD};
    // Direct Invoice tidak punya Req/PO → mulai dari Invoice; "All" juga mulai dari Invoice agar sebanding.
    if (flowSel===FLOW_DI) return [inv,{key:"clv",label:"AP Verified",val:g.clv,color:C.yellow},clr];
    if (flowSel!==FLOW_PO) return [inv,{key:"clv",label:"CLV / AP Verified",val:g.clv,color:C.yellow},clr];
    const po = {key:"po",label:"PO Issued",val:g.po,color:C.tealDp};
    const clv = {key:"clv",label:"CLV",val:g.clv,color:C.yellow};
    if (isAg) return [po,inv,clv,clr];
    return [po,{key:"surat",label:"Surat Pemberitahuan",val:g.surat,color:C.tealD},inv,clv,clr];
  },[grand,isAg,flowSel]);

  const trendSeries = useMemo(()=>{
    return unique(filtAgg.map(r=>r.month)).sort((a,b)=>monthKey(a)-monthKey(b)).map(m=>{
      const g = sumRows(filtAgg.filter(r=>r.month===m));
      return { month:m, inv:g.n?(g.inv/g.n)*100:0, clr:g.n?(g.clr/g.n)*100:0 };
    });
  },[filtAgg]);

  const bnResults = useMemo(()=>{
    if (!filtRaw.length) return [];
    return slaSet.map(p=>{
      const details=[];
      // Tiap step hanya menghitung baris dari flow-nya (step PO tidak ikut menghitung Direct Invoice, dan sebaliknya)
      filtRaw.forEach(r=>{ if(p.flow&&rowFlow(r)!==p.flow)return; const d=workDaysBetween(gcell(r,p.from),gcell(r,p.to)); if(d==null)return; details.push({days:d,po:refNo(r),name:gstr(r,["partner name","agency name"]),title:gstr(r,["project title"])||"—",month:gstr(r,["program date","month"]),amt:gnum(r,["amount"])}); });
      const ds=details.map(d=>d.days);
      return {...p,avg:ds.length?ds.reduce((a,b)=>a+b,0)/ds.length:0,n:ds.length,ok:ds.filter(d=>d<=p.sla).length,details:details.sort((a,b)=>b.days-a.days)};
    });
  },[filtRaw,slaSet]);

  const heatData = useMemo(()=>{
    const months=unique(filtAgg.map(r=>r.month)).sort((a,b)=>monthKey(b)-monthKey(a));
    const ptypes=unique(filtAgg.map(r=>r.ptype)).filter(Boolean).sort();
    const cells={};
    filtAgg.forEach(r=>{ const k=r.month+"\x00"+r.ptype; if(!cells[k])cells[k]={n:0,inv:0,clv:0,clr:0}; const c=cells[k]; c.n+=r.n; c.inv+=r.inv; c.clv+=r.clv; c.clr+=r.clr; });
    return { months, ptypes, cells };
  },[filtAgg]);

  const sortedMonths = useMemo(()=>unique(filtAgg.map(r=>r.month)).sort((a,b)=>{ const d=monthKey(a)-monthKey(b); return tblSort.dir==="asc"?d:-d; }),[filtAgg,tblSort]);
  // Default Monthly Summary (semua user): hanya bulan terakhir terbuka, lainnya collapse.
  // Default dipakai ulang setiap set bulan berubah (load data, ganti Partner/Agency, filter);
  // toggle manual user tetap dipertahankan selama set bulannya sama. Arah sort tidak berpengaruh.
  const monthsSig = useMemo(()=>src+"|"+unique(filtAgg.map(r=>r.month)).sort((a,b)=>monthKey(a)-monthKey(b)).join("¦"),[filtAgg,src]);
  const defaultCollapsed = useMemo(()=>{
    const ms=unique(filtAgg.map(r=>r.month)); if(!ms.length) return {};
    const latest=ms.reduce((a,b)=>monthKey(b)>monthKey(a)?b:a);
    const map={}; ms.forEach(m=>{ if(m!==latest) map[m]=true; }); return map;
  },[filtAgg]);
  const collapsed = collapseState.sig===monthsSig ? collapseState.map : defaultCollapsed;
  const setCollapsed = useCallback(upd=>setCollapseState(st=>{
    const base = st.sig===monthsSig ? st.map : defaultCollapsed;
    return { sig:monthsSig, map: typeof upd==="function" ? upd(base) : upd };
  }),[monthsSig,defaultCollapsed]);

  async function exportSummary(fmt) {
    if (!filtAgg.length) { showToast("No data available","error"); return; }
    const stamp=new Date().toISOString().slice(0,10), pref=isAg?"agency":"partner";
    if (fmt==="xlsx") {
      const XLSX=await getXLSX();
      const wb=XLSX.utils.book_new();
      const ws=XLSX.utils.json_to_sheet(filtAgg.map(r=>({"Program Date":fmtMonthYear(r.month),"Entity":r.entity,"Partner/Agency Type":r.ptype,"Program Type":r.prog,"Flow":r.flow,"#Records":r.n,"PO":r.po,"Surat Pemberitahuan":r.surat,"Invoice":r.inv,"CLV":r.clv,"Clearing":r.clr,"% Invoice":r.n?+(r.inv/r.n*100).toFixed(1):0,"% CLV":r.n?+(r.clv/r.n*100).toFixed(1):0,"% Clearing":r.n?+(r.clr/r.n*100).toFixed(1):0})));
      XLSX.utils.book_append_sheet(wb,ws,"Summary"); XLSX.writeFile(wb,`${pref}_summary_${stamp}.xlsx`);
      showToast("Filtered summary downloaded — Excel","success");
    } else {
      const hdr="Program Date,Entity,Partner Type,Program Type,Flow,#Rec,PO,Surat Pemberitahuan,Invoice,CLV,Clearing,% Invoice,% CLV,% Clearing";
      const csv=v=>{ const s=String(v??""); return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; };
      const body=filtAgg.map(r=>[fmtMonthYear(r.month),r.entity,r.ptype,r.prog,r.flow,r.n,r.po,r.surat,r.inv,r.clv,r.clr,r.n?+(r.inv/r.n*100).toFixed(1):0,r.n?+(r.clv/r.n*100).toFixed(1):0,r.n?+(r.clr/r.n*100).toFixed(1):0].map(csv).join(",")).join("\n");
      const a=document.createElement("a"); a.href="data:text/csv;charset=utf-8,\uFEFF"+encodeURIComponent(hdr+"\n"+body); a.download=`${pref}_${stamp}.csv`; a.click();
      showToast("Filtered summary downloaded — CSV","success");
    }
  }

  async function exportRaw() {
    if (!filtRaw.length) { showToast("No data available","error"); return; }
    const XLSX=await getXLSX();
    const allKeys=Object.keys(filtRaw[0]).filter(k=>!k.startsWith("_"));
    // urutan kolom mengikuti tampilan front-end (rawKeys), sisanya menyusul di belakang
    const seen=new Set(), keys=[];
    for (const k of rawKeys) if (allKeys.includes(k) && !seen.has(k)) { keys.push(k); seen.add(k); }
    for (const k of allKeys) if (!seen.has(k)) { keys.push(k); seen.add(k); }
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.json_to_sheet(filtRaw.map(r=>{ const o={}; keys.forEach(k=>{ o[k]=fmtExportCell(r[k],k); }); return o; }));
    XLSX.utils.book_append_sheet(wb,ws,"Raw");
    XLSX.writeFile(wb,`${isAg?"agency":"partner"}_raw_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast("Raw data (filtered, all columns) downloaded","success");
  }

  useEffect(()=>{
    // IOH regional kini boleh lihat Agency juga — datanya sudah ter-scope region.
    if (!isSPM && !isIOHAny && src==="agency") setSrc("partner");
  },[isSPM,isIOHAny,src]);

  useEffect(()=>{
    const canAgency = isSPM || isIOHAny;
    if (partnerRaw.length===0 && agencyRaw.length>0 && canAgency) setSrc("agency");
    else if (agencyRaw.length===0 && partnerRaw.length>0) setSrc("partner");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[partnerRaw.length, agencyRaw.length, isSPM, isIOHAny, isIOHRegional]);

  const searchSuggestions = useMemo(()=>{
    const q=(searchInput||"").toLowerCase().trim();
    if (!q||q.length<2||!curRaw.length) return {partners:[],pos:[],projects:[]};
    const pCnt={},poCnt={},prCnt={};
    curRaw.forEach(r=>{ const n=gstr(r,["partner name","agency name"]); if(n)pCnt[n]=(pCnt[n]||0)+1; [r._po,r._inv].forEach(po=>{ if(po)poCnt[po]=(poCnt[po]||0)+1; }); const pr=gstr(r,["project title"]); if(pr)prCnt[pr]=(prCnt[pr]||0)+1; });
    return {
      partners:Object.entries(pCnt).filter(([k])=>k.toLowerCase().includes(q)).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>({label:k,count:v,type:"partner"})),
      pos:     Object.entries(poCnt).filter(([k])=>k.toLowerCase().includes(q)).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>({label:k,count:v,type:"po"})),
      projects:Object.entries(prCnt).filter(([k])=>k.toLowerCase().includes(q)).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>({label:k,count:v,type:"project"})),
    };
  },[searchInput,curRaw]);

  const allSuggestions = useMemo(()=>[...searchSuggestions.partners,...searchSuggestions.pos,...searchSuggestions.projects],[searchSuggestions]);
  useEffect(()=>{ if(filters.q==="") setSearchInput(""); },[filters.q]);
  useEffect(()=>{ setRawPage(1); },[filters]);

  const G = {
    month:["Program Date","program date","month","Month","bulan","Bulan","Periode"],
    ptype:["Partner Type","partner type","partnertype","partner_type","PartnerType","Agency Name","agency name"],
    entity:["Entity","entity"],
    title:["Project Title","project title","ProjectTitle"],
    name:["Partner Name","partner name","partner_name","partnerName","Agency Name","agency name"],
    amount:["Amount","amount","Nilai","nilai"],
    flow:["Flow","flow"],
    req:["#Req ID","#req id","req id"],
    po:["PO Number","po number","PO #","po #","No PO","no po"],
    reqDate:["Reva Date","reva date","Req Date","req date"],
    poDate:["PO Date","po date"],
    surat:["Surat Pemberitahuan Date","surat pemberitahuan date","surat pemberitahuan"],
    inv:["Invoice Number","invoice number","Inv Number","inv number","Invoice No"],
    invDate:["Invoice Date","invoice date"],
    invSub:["Invoice Submission","invoice submission","Invoice","invoice"],
    clv:["Clv Date","clv date","CLV"],
    clr:["Clearing Bank","clearing date","Clearing Date","clearing","Clearing","Cleared Bank","cleared bank"],
    est:["Estimation Date","estimation date","Estimasi","estimasi"],
    status:["Status","status","Payment Status","payment status"],
  };
  // Kolom utama per tampilan: All / PO (lama) / MDI (Direct Invoice)
  const MAIN_RAW_GROUPS = flowSel===FLOW_PO
    ? [G.month,G.name,G.title,G.req,G.amount,G.po,G.reqDate,G.poDate,...(isAg?[]:[G.surat]),G.invSub,G.clr,G.status]
    : flowSel===FLOW_DI
    ? [G.month,G.entity,G.name,G.title,G.amount,G.inv,G.invDate,G.invSub,G.clv,G.clr,G.est,G.status]
    : [G.month,G.ptype,G.title,G.name,G.amount,G.flow,G.po,G.inv,G.invSub,G.clr,G.est,G.status];

  const RAW_COL_ORDER = ["Program Date","program date","Entity","entity","Partner Type","partner type","partnertype","partner_type","Project Title","project title","#Req ID","#req id","req id","Partner Name","partner name","partner_name","Amount","amount","Flow","PO Number","po number","PO #","po #","Invoice Number","Reva Date","reva date","PO Date","po date","Surat Pemberitahuan Date","surat pemberitahuan date","surat pemberitahuan","Invoice Submission","invoice submission","invoice","CLV Date","clv date","clv","Estimation Date","estimation date","Status","status","Payment Status","payment status"];

  const rawKeysAll = useMemo(()=>{
    if (!curRaw.length) return [];
    const allKeys=Object.keys(curRaw[0]).filter(k=>!k.startsWith("_"));
    const seen=new Set(), ordered=[];
    for (const p of RAW_COL_ORDER) { const f=allKeys.find(k=>k.toLowerCase().trim()===p.toLowerCase().trim()); if(f&&!seen.has(f)){ordered.push(f);seen.add(f);} }
    for (const k of allKeys) { if(!seen.has(k))ordered.push(k); }
    return flowSel===FLOW_DI ? ordered.filter(k=>!isPoOnlyCol(k)) : ordered;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[curRaw,flowSel]);

  const rawKeysMain = useMemo(()=>{
    if (!curRaw.length) return [];
    const allKeys=Object.keys(curRaw[0]).filter(k=>!k.startsWith("_"));
    const norm = s => s.toLowerCase().replace(/\s+/g," ").trim();
    const seen=new Set(), ordered=[];
    for (const group of MAIN_RAW_GROUPS) {
      let found=null;
      for (const cand of group) { const f=allKeys.find(k=>norm(k)===norm(cand)); if(f){found=f;break;} }
      if(!found) for (const cand of group) { const f=allKeys.find(k=>norm(k).includes(norm(cand))); if(f){found=f;break;} }
      if(found && !seen.has(found)){ ordered.push(found); seen.add(found); }
    }
    return flowSel===FLOW_DI ? ordered.filter(k=>!isPoOnlyCol(k)) : ordered;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[curRaw,flowSel,isAg]);

  const rawKeys = showAllCols ? rawKeysAll : (rawKeysMain.length ? rawKeysMain : rawKeysAll);

  const sortedRaw = useMemo(()=>{
    let rows=[...filtRaw];
    if (rawSort.col) { const col=rawSort.col,dir=rawSort.dir; rows.sort((a,b)=>{ const av=a[col],bv=b[col],da=toDate(av),db=toDate(bv); if(da&&db)return dir==="asc"?da-db:db-da; if(typeof av==="number"&&typeof bv==="number")return dir==="asc"?av-bv:bv-av; return dir==="asc"?String(av||"").localeCompare(String(bv||"")):String(bv||"").localeCompare(String(av||"")); }); }
    return rows;
  },[filtRaw,rawSort]);

  const totalRawPages = Math.max(1,Math.ceil(sortedRaw.length/rawPageSize));
  const curRawPage    = Math.min(rawPage,totalRawPages);
  const pageRaw       = sortedRaw.slice((curRawPage-1)*rawPageSize, curRawPage*rawPageSize);
  const isLeftCol     = k => { const kk=k.toLowerCase().replace(/\s+/g,""); return kk.includes("name")||kk.includes("title")||kk.includes("entity")||kk.includes("type")||kk.includes("project")||kk==="remarks"; };

  const fmtCellT = (val,key,t) => {
    if (val==null||val==="") return <span style={{fontFamily:MONO,fontStyle:"italic",fontSize:10.5,color:t.muted2}}>—</span>;
    if (isMonthKey(key)) return fmtMonthYear(val);
    if (isDateKey(key)) { const d=toDate(val); if(d) return fmtDate(d); }
    const kl=key.toLowerCase().replace(/\s+/g,"");
    if (kl==="entity") return String(entLabel(val,flowSel));
    if (kl==="status"||kl==="paymentstatus") return <StatusBadge val={String(val)} t={t}/>;
    if (kl==="amount"||kl.includes("amount")) { const n=typeof val==="number"?val:parseFloat(String(val).replace(/[^\d.-]/g,"")); if(!isNaN(n)&&n!==0)return <span style={{fontFamily:MONO,fontSize:11.5,textAlign:"right",display:"block",color:t.ink}}>{fmtMoney(n,false)}</span>; }
    return String(val);
  };

  const sharedProps = {
    isSPM,isIOHAny,isIOHRegional,isIOHUmbrella,canPickRegion,profile,
    regionView,setRegionView,regionOptions,
    partnerName,filterMpxType,regionFilter:effectiveRegion,
    screen,setScreen,loading,loadText,toast,
    upload,setUpload,
    viewPartnerRaw:partnerRaw, viewAgencyRaw:agencyRaw,
    pubMeta,
    filters,setFilters,opts,tblSort,setTblSort,rawSort,setRawSort,
    rawPage,setRawPage,rawPageSize,collapsed,setCollapsed,
    searchFocus,setSearchFocus,searchIdx,setSearchIdx,
    searchRef,searchSuggestions,allSuggestions,searchInput,setSearchInput,
    funnelExp,setFunnelExp,bnExp,setBnExp,
    src,setSrc,flowSel,activeTab,setActiveTab,heatMetric,setHeatMetric,
    curRaw,curAgg,filtAgg,filtRaw,grand,grandPartnerCount,
    funnelStages,trendSeries,heatData,bnResults,sortedMonths,
    rawKeys,rawKeysAll,rawKeysMain,showAllCols,setShowAllCols,
    pageRaw,curRawPage,totalRawPages,fmtCellT,isLeftCol,
    handleFile,publish,viewDash,clearData,exportSummary,exportRaw,showToast,
  };

  return <ThemeWrapper themeProp={theme} {...sharedProps}/>;
}

function ThemeWrapper(props) {
  const t = useTheme(props.themeProp);
  useKeyframes();
  const rootRef = useRef(null);
  const [boxW, setBoxW] = useState(null);
  useEffect(()=>{
    const el = rootRef.current;
    if (!el || typeof ResizeObserver==="undefined") return;
    const ro = new ResizeObserver(es=>{ const cw = Math.round(es[0].contentRect.width); if (cw>0) setBoxW(cw); });
    ro.observe(el);
    return ()=>ro.disconnect();
  },[]);
  const { loading, loadText, toast, screen } = props;
  const toastBg    = toast.type==="success"?t.goodBg :toast.type==="error"?t.badBg :t.surf;
  const toastColor = toast.type==="success"?t.goodDark:toast.type==="error"?t.badDark:t.ink;
  const toastBd    = toast.type==="success"?t.goodBd :toast.type==="error"?t.badBd :t.line;
  return (
    <WidthCtx.Provider value={boxW}>
    <div ref={rootRef} style={{fontFamily:"-apple-system,'DM Sans','Plus Jakarta Sans',BlinkMacSystemFont,'SF Pro Text',sans-serif",fontSize:14,lineHeight:1.45,color:t.ink,WebkitFontSmoothing:"antialiased",minHeight:"100%",background:"transparent"}}>
      {loading && <LoadingBar/>}
      {loading && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)",padding:16}}>
          <div style={{background:t.surf,border:`1px solid ${t.line}`,borderRadius:20,padding:"24px 32px",display:"flex",alignItems:"center",gap:16,boxShadow:t.shadow3,maxWidth:"calc(100vw - 32px)"}}>
            <Spinner size={28} color={C.teal}/>
            <span style={{fontFamily:MONO,fontSize:13,color:t.muted}}>{loadText}</span>
          </div>
        </div>
      )}
      {/* Toast: width capped to viewport to prevent overflow on mobile */}
      <div style={{position:"fixed",bottom:20,right:16,left:"auto",zIndex:9997,padding:"13px 18px",borderRadius:14,background:toastBg,color:toastColor,border:`1px solid ${toastBd}`,boxShadow:t.shadow3,fontWeight:600,fontSize:13,transition:"opacity .25s, transform .25s",opacity:toast.show?1:0,transform:toast.show?"translateY(0)":"translateY(16px)",pointerEvents:"none",maxWidth:"min(360px, calc(100vw - 32px))"}}>
        {toast.msg}
      </div>
      {screen==="loading"   && <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:300,gap:12,color:t.muted,flexDirection:"column"}}><Spinner size={32} color={C.teal}/><span style={{fontFamily:MONO,fontSize:13}}>Loading data…</span></div>}
      {screen==="empty"     && <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:320,gap:16,textAlign:"center",padding:"0 24px"}}><div style={{fontSize:52}}>📭</div><div style={{fontWeight:800,fontSize:22,letterSpacing:"-0.03em",color:t.ink}}>No data available</div><div style={{color:t.muted,maxWidth:360,lineHeight:1.65,fontSize:14}}>No data has been published by Admin yet. This page updates automatically when data becomes available.</div></div>}
      {screen==="admin"     && <AdminScreen {...props} t={t}/>}
      {screen==="dashboard" && <DashScreen  {...props} t={t}/>}
    </div>
    </WidthCtx.Provider>
  );
}

function AdminScreen({ t, pubMeta, upload, setUpload, handleFile, publish, viewDash, clearData }) {
  const w = useWidth();
  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmPub, setConfirmPub] = useState(false);
  const [drag, setDrag] = useState(false);
  const sides = useMemo(()=>[["partner","Partner Prepaid",C.teal],["agency","Agency Prepaid",C.magenta]].map(([k,label,ac])=>{
    const u = upload[k];
    const di = u ? u.rows.filter(r=>rowFlow(enrichRow(r))===FLOW_DI).length : 0;
    return { k, label, ac, u, n:u?u.rows.length:0, di, amt:u?u.rows.reduce((a,r)=>a+gnum(r,["amount","nilai"]),0):0 };
  }),[upload]);
  const ready = sides.filter(x=>x.u), missing = sides.filter(x=>!x.u);
  const confirmText = `This will replace ${ready.map(x=>`${x.label} (${x.n.toLocaleString()} rows)`).join(" and ")} for everyone.${missing.length&&ready.length?` ${missing[0].label} stays as it is.`:""}`;
  const pick = (file) => { setConfirmPub(false); handleFile(file); };
  return (
    <div style={{maxWidth:1200,margin:"0 auto",padding:w<480?"18px 14px 44px":w<768?"20px 16px 48px":"24px 20px 56px"}}>
      <div style={{marginBottom:28}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          <span style={{fontFamily:MONO,fontSize:10,letterSpacing:"0.18em",textTransform:"uppercase",color:t.muted}}>Admin · Payout Tracker</span>
          <span style={{width:5,height:5,borderRadius:"50%",background:C.teal,display:"inline-block"}}/>
          <span style={{fontFamily:MONO,fontSize:10,color:C.teal,letterSpacing:"0.1em"}}>Realtime</span>
        </div>
        <h1 style={{fontWeight:800,fontSize:"clamp(1.8rem,4vw,2.8rem)",letterSpacing:"-0.03em",color:t.ink,margin:"0 0 8px",lineHeight:1.05}}>Upload &amp; Publish Data</h1>
        <p style={{color:t.muted,fontSize:14,maxWidth:"60ch",lineHeight:1.65,margin:0}}>Upload one workbook. The &ldquo;Partner Prepaid&rdquo; and &ldquo;Agency Prepaid&rdquo; sheets are read together; other sheets are ignored. All viewers update automatically after you publish.</p>
        <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}>
          {[{l:"Partner SLA 2/1/2/2/3 WD (Working Days)",c:C.teal},{l:"Agency SLA 2/2/2/3 WD (Working Days)",c:C.magenta},{l:"Direct Invoice SLA 4/5 WD (Working Days)",c:C.yellowD}].map((b,i)=>(
            <span key={i} style={{display:"inline-flex",alignItems:"center",padding:"5px 12px",borderRadius:99,background:`${b.c}18`,color:b.c,border:`1px solid ${b.c}40`,fontFamily:MONO,fontSize:10.5,fontWeight:600}}>{b.l}</span>
          ))}
        </div>
      </div>
      {pubMeta&&(
        <div style={{background:t.goodBg,border:`1px solid ${t.goodBd}`,borderRadius:16,padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:14,marginBottom:22,flexWrap:"wrap",boxShadow:t.shadow1}}>
          <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}>
            <div style={{width:36,height:36,background:C.teal,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",flexShrink:0}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{minWidth:0}}>
              <div style={{fontWeight:700,fontSize:13.5,color:t.goodDark}}>Data published successfully — all viewers auto-updated</div>
              <div style={{fontFamily:MONO,fontSize:10.5,color:t.muted,marginTop:2,wordBreak:"break-word"}}>{pubMeta.fileName} · {(pubMeta.rowCount||0).toLocaleString()} rows · {pubMeta.publishedAt}</div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <Btn t={t} variant="outline" sm onClick={viewDash}>View Dashboard</Btn>
            {!confirmDel
              ? <Btn t={t} variant="danger" sm onClick={()=>setConfirmDel(true)}>Delete Data</Btn>
              : (
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",padding:"6px 10px",background:t.badBg,border:`1px solid ${t.badBd}`,borderRadius:12}}>
                  <span style={{fontSize:11.5,color:t.badDark,fontWeight:600}}>All viewers will immediately lose access. Are you sure?</span>
                  <Btn t={t} variant="danger" sm onClick={()=>{setConfirmDel(false);clearData();}}>Yes, Delete Permanently</Btn>
                  <Btn t={t} variant="ghost" sm onClick={()=>setConfirmDel(false)}>Cancel</Btn>
                </div>
              )}
          </div>
        </div>
      )}
      <div
        style={{background:drag?`${C.teal}12`:t.surf,border:`2px dashed ${drag?C.teal:ready.length?t.goodBd:t.line2}`,borderRadius:18,padding:w<480?"26px 18px 22px":"32px 24px 26px",textAlign:"center",cursor:"pointer",transition:"all .18s",boxShadow:t.shadow1,marginBottom:14}}
        onDrop={e=>{e.preventDefault();setDrag(false);pick(e.dataTransfer.files[0]);}}
        onDragOver={e=>{e.preventDefault();setDrag(true);}}
        onDragLeave={()=>setDrag(false)}
        onClick={()=>document.getElementById("pt-f-upload").click()}
        {...kbd(()=>document.getElementById("pt-f-upload").click())}>
        <div style={{width:54,height:54,borderRadius:15,background:C.teal,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </div>
        <div style={{fontWeight:700,fontSize:15,color:t.ink,marginBottom:5}}>Drop the payout workbook here</div>
        <div style={{fontFamily:MONO,fontSize:10.5,color:t.muted}}>or click to browse · .xlsx · .xls · .csv</div>
        <input id="pt-f-upload" type="file" accept=".xlsx,.xls,.csv" onClick={e=>e.stopPropagation()} onChange={e=>{pick(e.target.files[0]);e.target.value="";}} style={{display:"none"}}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:14,marginBottom:10}}>
        {sides.map(x=>(
          <div key={x.k} style={{background:x.u?t.goodBg:t.surf,border:`1px solid ${x.u?t.goodBd:t.line}`,borderLeft:`3px solid ${x.ac}`,borderRadius:14,padding:"12px 16px",minWidth:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <span style={{fontWeight:700,fontSize:13.5,color:t.ink}}>{x.label}</span>
              <span style={{fontFamily:MONO,fontSize:10,fontWeight:600,color:x.u?t.goodDark:t.muted}}>{x.u?"✓ Found":"Not found"}</span>
            </div>
            {x.u
              ? <>
                  <div style={{fontWeight:800,fontSize:18,color:t.ink,marginTop:4}}>{x.n.toLocaleString()} rows · {fmtRp(x.amt)}</div>
                  <div style={{fontFamily:MONO,fontSize:10.5,color:t.muted,marginTop:2,wordBreak:"break-word"}}>{fmtRpFull(x.amt)} · sheet &ldquo;{x.u.sheet}&rdquo; · {x.u.file}</div>
                  <div style={{fontSize:12,color:t.ink2,marginTop:4}}>PO (lama) {(x.n-x.di).toLocaleString()} · MDI (Direct Invoice) {x.di.toLocaleString()}</div>
                  {x.u.dup>0&&<div style={{fontSize:12,color:t.badDark,fontWeight:600,marginTop:4}}>⚠ {x.u.dup} MDI row{x.u.dup!==1?"s":""} also appear in the old sheet (same invoice number) — check for double counting.</div>}
                </>
              : <div style={{fontSize:12.5,color:t.muted,marginTop:4,lineHeight:1.5}}>{ready.length?"Live data for this side stays unchanged. You can also drop a second file for it.":"Waiting for a file."}</div>}
          </div>
        ))}
      </div>
      {confirmPub&&ready.length>0&&(
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",padding:"10px 14px",background:t.warnBg,border:`1px solid ${t.warnBd}`,borderRadius:12,marginBottom:12}}>
          <span style={{flex:"1 1 260px",fontSize:13,fontWeight:600,color:t.ink}}>{confirmText}</span>
          <Btn t={t} variant="primary" sm onClick={()=>{setConfirmPub(false);publish();}}>Yes, Publish</Btn>
          <Btn t={t} variant="ghost" sm onClick={()=>setConfirmPub(false)}>Cancel</Btn>
        </div>
      )}
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:12}}>
        <Btn t={t} variant="primary" disabled={!ready.length} style={ready.length?{}:{opacity:.5,cursor:"not-allowed"}} onClick={()=>setConfirmPub(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Publish to Cloud
        </Btn>
        <Btn t={t} variant="outline" onClick={viewDash}>View Live Dashboard</Btn>
        <Btn t={t} variant="ghost" onClick={()=>{setConfirmPub(false);setUpload({partner:null,agency:null});}}>Reset Upload</Btn>
      </div>
    </div>
  );
}

function SegBtn({s,active,disabled,count,label,onClick,t}) {
  const [hov,hE]=useHover();
  const ac=s==="partner"?C.teal:C.magenta;
  return <button {...hE} onClick={onClick} disabled={disabled} style={{fontWeight:600,fontSize:12.5,padding:"8px 18px",borderRadius:10,border:0,background:active?ac:hov?t.surf3:"transparent",color:active?"#fff":hov?t.ink:t.muted,cursor:disabled?"default":"pointer",display:"inline-flex",alignItems:"center",gap:8,transition:"all .15s",whiteSpace:"nowrap",opacity:disabled?.38:1,pointerEvents:disabled?"none":"auto"}}>{label}<span style={{fontFamily:MONO,fontSize:10,padding:"2px 7px",borderRadius:99,background:active?"rgba(255,255,255,.22)":t.surf4,color:active?"#fff":t.ink2}}>{count}</span></button>;
}

// Switch utama sebelum/sesudah Coupa: PO (lama) vs MDI (Direct Invoice). "All" = gabungan.
function FlowSwitch({value,onChange,t}) {
  const items=[{v:"all",l:"All",sub:"PO + MDI"},{v:"PO",l:"PO (lama)",sub:"Req → PO → Invoice"},{v:"DI",l:"MDI",sub:"Direct Invoice"}];
  return (
    <div role="group" aria-label="Payment flow" style={{display:"inline-flex",gap:4,background:t.surf,border:`1px solid ${value!=="all"?C.yellowD:t.line}`,borderRadius:14,padding:4,boxShadow:t.shadow1,maxWidth:"100%",overflowX:"auto"}}>
      {items.map(it=>{ const on=value===it.v; return (
        <button key={it.v} type="button" aria-pressed={on} onClick={()=>onChange(it.v)} title={it.sub}
          style={{fontFamily:"inherit",fontWeight:600,fontSize:12.5,padding:"8px 14px",borderRadius:10,border:0,cursor:"pointer",whiteSpace:"nowrap",transition:"all .15s",background:on?C.yellow:"transparent",color:on?"#1a1a1a":t.muted,display:"inline-flex",flexDirection:"column",alignItems:"flex-start",lineHeight:1.2}}>
          <span>{it.l}</span><span style={{fontFamily:MONO,fontSize:9.5,fontWeight:500,opacity:.8}}>{it.sub}</span>
        </button>
      ); })}
    </div>
  );
}

function TabBtn({label,count,active,onClick,t}) {
  const [hov,hE]=useHover();
  return (
    <button {...hE} onClick={onClick} style={{background:"transparent",border:0,fontWeight:600,fontSize:13,padding:"10px 0 14px",color:active?t.ink:hov?t.ink2:t.muted,cursor:"pointer",position:"relative",display:"inline-flex",alignItems:"center",gap:8,whiteSpace:"nowrap",flexShrink:0,transition:"color .15s"}}>
      {label}
      {count!==undefined&&<span style={{fontFamily:MONO,fontSize:10,padding:"2px 7px",borderRadius:99,background:active?`${C.magenta}18`:t.surf3,color:active?C.magenta:t.muted,border:`1px solid ${active?`${C.magenta}30`:t.line}`}}>{count.toLocaleString()}</span>}
      {active&&<span style={{position:"absolute",left:0,right:0,bottom:-1,height:"2.5px",background:C.magenta,borderRadius:"2px 2px 0 0"}}/>}
    </button>
  );
}

function SugItem({s,active,iconLabel,accentColor,onPick,t}) {
  const [hov,hE]=useHover();
  return <div {...hE} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 14px",cursor:"pointer",background:active||hov?t.surf3:"transparent",borderTop:`1px solid ${t.line}`,transition:"background .1s"}} onMouseDown={onPick}><span style={{width:22,height:22,borderRadius:7,background:accentColor,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontFamily:MONO,fontSize:8,fontWeight:700,color:"#fff"}}>{iconLabel}</span><span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:12.5,fontWeight:500,color:t.ink}}>{s.label}</span><span style={{fontFamily:MONO,fontSize:10,flexShrink:0,color:t.muted}}>{s.count}</span></div>;
}

function HeatBtn({m,active,onClick,t}) {
  const [hov,hE]=useHover();
  return <button {...hE} onClick={onClick} style={{fontFamily:MONO,fontSize:10,letterSpacing:"0.06em",textTransform:"uppercase",padding:"5px 10px",borderRadius:8,border:`1px solid ${active?m.ac:hov?C.tealD:t.line}`,background:active?m.ac:hov?t.surf3:t.surf2,color:active?(m.dark?"#1a1a1a":"#fff"):hov?t.ink:t.muted,cursor:"pointer",transition:"all .15s"}}>{m.l}</button>;
}

function HeatCell({bg,light,pp,v,n}) {
  const [hov,hE]=useHover();
  return <div {...hE} style={{borderRadius:8,padding:"9px 5px",textAlign:"center",background:bg,color:light?"#1a1a1a":"#fff",cursor:"default",transition:"transform .12s",transform:hov?"scale(1.05)":"scale(1)",position:"relative",zIndex:hov?2:0}}><div style={{fontWeight:700,fontSize:12,fontFamily:MONO,lineHeight:1}}>{pp}%</div><div style={{fontSize:9,opacity:.9,marginTop:2,fontFamily:MONO}}>{v}/{n}</div></div>;
}

function BnDetailRow({d,t}) {
  const [hov,hE]=useHover();
  return <div {...hE} style={{display:"grid",gridTemplateColumns:"44px auto 1fr auto",gap:8,padding:"7px 12px",borderBottom:`1px solid ${t.line}`,fontSize:11,alignItems:"center",background:hov?t.surf2:"transparent",transition:"background .1s"}}><span style={{fontFamily:MONO,fontSize:11,fontWeight:700,color:t.bad,textAlign:"center",background:t.badBg,padding:"3px 5px",borderRadius:6}}>{d.days}d</span><span style={{fontFamily:MONO,fontSize:10,fontWeight:600,background:t.surf3,padding:"2px 7px",borderRadius:5,border:`1px solid ${t.line}`,whiteSpace:"nowrap",color:t.ink}}>{d.po||"No PO"}</span><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:t.ink2}}>{d.title}</span><span style={{fontFamily:MONO,fontSize:10,color:t.muted,textAlign:"right",whiteSpace:"nowrap"}}>{d.month}{d.amt&&<><br/>{fmtMoney(d.amt)}</>}</span></div>;
}

function RawThCell({k,rawSort,setRawSort,setRawPage,isLeftCol,label,t}) {
  const [hov,hE]=useHover();
  const active=rawSort.col===k;
  return <th {...hE} onClick={()=>{setRawSort(s=>({col:k,dir:s.col===k&&s.dir==="asc"?"desc":"asc"}));setRawPage(1);}} style={{position:"sticky",top:0,zIndex:2,fontFamily:MONO,fontSize:10,letterSpacing:"0.08em",textTransform:"uppercase",color:active?C.teal:hov?t.ink:t.muted,fontWeight:active?700:500,background:hov?t.surf3:t.surf2,padding:"9px",textAlign:isLeftCol(k)?"left":"center",borderBottom:`1.5px solid ${t.line2}`,whiteSpace:"nowrap",cursor:"pointer",transition:"all .15s"}}>{label||k}{active?(rawSort.dir==="asc"?" ▲":" ▼"):""}</th>;
}

function RawDataRow({r,i,rawKeys,isLeftCol,fmtCellT,t,docs,segment}) {
  const [hov,hE]=useHover();
  return <tr {...hE} style={{borderBottom:`1px solid ${t.line}`,background:hov?t.rowHover:i%2===1?t.rowStripe:"transparent",transition:"background .1s"}}>{rawKeys.map(k=><td key={k} title={String(r[k]||"")} style={{padding:"8px 9px",textAlign:isLeftCol(k)?"left":"center",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:t.ink2}}>{fmtCellT(r[k],k,t)}</td>)}{SHOW_DOCUMENT_TABS&&<td style={{padding:"6px 9px",textAlign:"center",whiteSpace:"nowrap"}}><DocsCell refId={refKey(gstr(r,DOC_REF_COLUMN))} partnerName={gstr(r,["partner name","agency name"])} segment={segment} title={gstr(r,["project title"])} amountText={fmtMoney(gnum(r,["amount"]),false)} docs={docs} t={t}/></td>}</tr>;
}

// Milestone tercapai? (PO & Surat hanya relevan untuk Flow PO)
const STAGE_HINTS = { surat:H_SURAT, inv:H_INV, clv:H_CLV, clr:H_CLR };
function stageDone(r, key) {
  if (key==="po") return rowFlow(r)===FLOW_PO && !!(r._po || gcell(r,["po date"]));
  if (key==="surat" && rowFlow(r)!==FLOW_PO) return false;
  return !!gcell(r, STAGE_HINTS[key]||[]);
}

function FunnelRowItem({s,prevKey,drop,isExp,filtRaw,grand,onToggle,t}) {
  const [hov,hE]=useHover();
  const pending=isExp&&filtRaw.length?filtRaw.filter(r=>!stageDone(r,s.key)&&(!prevKey||stageDone(r,prevKey))).map(r=>({po:refNo(r),name:gstr(r,["partner name","agency name"])||"—",month:gstr(r,["program date"]),amt:gnum(r,["amount"])})).sort((a,b)=>b.amt-a.amt):[];
  return (
    <div style={{borderBottom:`1px solid ${t.line}`,paddingBottom:6,marginBottom:6}}>
      <div {...hE} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"5px 8px",borderRadius:8,background:hov?t.surf2:"transparent",transition:"background .1s"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
          <span style={{width:4,height:22,borderRadius:2,background:s.color,flexShrink:0}}/>
          <div>
            <div style={{fontWeight:600,fontSize:12.5,color:t.ink}}>{s.label}</div>
            {drop>0&&(
              <button onClick={e=>{e.stopPropagation();onToggle();}} aria-expanded={isExp}
                style={{display:"inline-flex",alignItems:"center",gap:5,marginTop:4,fontFamily:MONO,fontSize:10,fontWeight:700,color:t.bad,background:t.badBg,border:`1px solid ${t.badBd}`,borderRadius:99,padding:"2px 9px",cursor:"pointer",lineHeight:1.4}}>
                {drop} pending {isExp?"▲":"▼"}
              </button>
            )}
          </div>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontWeight:700,fontSize:14,fontFamily:MONO,color:t.ink}}>{s.val.toLocaleString()}</div>
          <div style={{fontSize:10,color:t.muted}}>{pct(s.val,grand.n)}%</div>
        </div>
      </div>
      {isExp&&pending.length>0&&(
        <div style={{marginTop:6,borderRadius:10,background:t.badBg,border:`1px solid ${t.badBd}`,borderLeft:`3px solid ${t.bad}`,padding:"8px 10px"}}>
          <div style={{fontFamily:MONO,fontSize:9.5,color:t.bad,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,fontWeight:600}}>Pending · {pending.length} records</div>
          <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:200,overflowY:"auto"}}>
            {pending.slice(0,30).map((r,j)=>(
              <div key={j} style={{display:"grid",gridTemplateColumns:"auto 1fr auto",gap:7,padding:"4px 6px",borderBottom:`1px solid ${t.badBd}`,fontSize:11,alignItems:"start"}}>
                <span style={{fontFamily:MONO,fontSize:10,fontWeight:700,color:t.bad}}>{r.po||"No PO"}</span>
                <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:t.ink2}}>{r.name}</span>
                <span style={{fontFamily:MONO,fontSize:10,color:t.muted,textAlign:"right",whiteSpace:"nowrap"}}>{r.month}{r.amt&&<><br/>{fmtMoney(r.amt)}</>}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {isExp&&pending.length===0&&(
        <div style={{marginTop:6,padding:"8px 10px",borderRadius:10,background:t.surf2,border:`1px solid ${t.line}`,fontSize:11.5,fontStyle:"italic",color:t.muted}}>No pending records match the current filters.</div>
      )}
    </div>
  );
}

function DashScreen(props) {
  const w = useWidth();
  const { t, src, setSrc, setScreen, activeTab, setActiveTab, isSPM, isIOHAny, isIOHRegional,
    isIOHUmbrella, canPickRegion, regionView, setRegionView, regionOptions,
    regionFilter, filterMpxType, viewPartnerRaw, viewAgencyRaw, pubMeta,
    filters, setFilters, opts, curAgg, curRaw, filtAgg, filtRaw,
    setCollapsed, searchFocus, setSearchFocus, searchIdx, setSearchIdx,
    searchRef, searchSuggestions, allSuggestions, searchInput, setSearchInput,
    setRawPage, showToast, exportSummary, profile, flowSel } = props;
  const isAg = src === "agency";
  const isYtd = activeTab==="ytd";

  // Dokumen per PO (Partner & Agency): dipakai kolom Dokumen di Raw Data & tab Upload & Merge Dokumen
  // profile null → hook tidak aktif (docs.enabled=false), tidak ada fetch dokumen/approval
  const docs = usePartnerDocStats(SHOW_DOCUMENT_TABS ? profile : null);
  // 1 entri per (pemilik, PO): baris dobel → amount dijumlah, records dihitung. Baris tanpa PO dihitung terpisah.
  // ym = periode PO (YYYY-MM) dari program date; ptype = MPC/MP3 dari kolom Partner Type/Entity (untuk generator BAST/Letter)
  const buildDocPOs = useCallback((rowsIn) => {
    const m = new Map(); let noRef = 0;
    rowsIn.forEach(r => {
      const ref = refKey(gstr(r,DOC_REF_COLUMN));
      const owner = gstr(r,["partner name","agency name"]);
      if (!ref || !owner) { noRef++; return; }
      const k = statKey(src, owner, ref);
      const e = m.get(k);
      if (e) { e.records++; e.amount += gnum(r,["amount"]); if (!e.title) e.title = gstr(r,["project title"]); return; }
      const pd = gcell(r,["program date","month","periode"]);
      let mk = monthKey(pd); if (!mk) { const d = toRealDate(pd); if (d) mk = d.getFullYear()*100 + d.getMonth() + 1; }
      const ym = mk ? `${Math.floor(mk/100)}-${String(mk%100).padStart(2,"0")}` : "";
      m.set(k,{ref,partner:owner,title:gstr(r,["project title"]),amount:gnum(r,["amount"]),records:1,ym,ptype:getMpxTypeFromRow(r)});
    });
    return { list: [...m.values()].map(p => ({...p, amountText: fmtMoney(p.amount,false)})), noRef };
  }, [src]);
  const { docPOs, docNoRef } = useMemo(() => { const x = buildDocPOs(SHOW_DOCUMENT_TABS ? filtRaw : []); return { docPOs: x.list, docNoRef: x.noRef }; }, [filtRaw, buildDocPOs]);
  // Semua PO segment ini (tanpa filter dashboard) — dipakai generator untuk mencocokkan PO
  const docPOsAll = useMemo(() => buildDocPOs(SHOW_DOCUMENT_TABS ? curRaw : []).list, [curRaw, buildDocPOs]);
  const docPOsDone = docPOs.filter(p => doneCount(docs.byRef[statKey(src,p.partner,p.ref)]) === DOC_TYPES.length).length;

  const isMobile = w < 640;
  const [showFilters, setShowFilters] = useState(false);

  const segPartnerCount = (viewPartnerRaw||[]).length;
  const segAgencyCount  = (viewAgencyRaw||[]).length;
  const segVisible = ((isSPM||isIOHAny)?["partner","agency"]:["partner"])
    .filter(s=>(s==="partner"?segPartnerCount:segAgencyCount)>0);

  const resetFilters = () => { setFilters(f=>({month:[],entity:[],ptype:[],prog:[],status:[],flow:f.flow||"all",q:""})); setSearchInput(""); };

  const chipDefs = [["month","Month"],["entity","Entity"],["ptype",isAg?"Agency":"Partner"],["prog","Program"],["status","Status"]];
  const chips = [];
  chipDefs.forEach(([k,lbl])=>{ (Array.isArray(filters[k])?filters[k]:[]).forEach(v=>chips.push({k,v,lbl})); });
  if (filters.q) chips.push({k:"q",v:filters.q,lbl:"Search"});
  const activeFilterCount = chips.length;
  const removeChip = (c) => {
    if (c.k==="q") { setFilters(f=>({...f,q:""})); setSearchInput(""); }
    else setFilters(f=>({...f,[c.k]:f[c.k].filter(x=>x!==c.v)}));
  };

  const filtersEmpty = curAgg.length>0 && filtAgg.length===0;

  // Format published timestamp to "LAST UPDATED MMM DD, YYYY"
  const pubLabel = pubMeta?.publishedAt
    ? `LAST UPDATED ${pubMeta.publishedAt.toUpperCase()}`
    : "LIVE PREVIEW";

  return (
    <div style={{maxWidth:1400,margin:"0 auto",padding:w<480?"16px 12px 44px":w<768?"18px 16px 48px":"20px 20px 56px"}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:20,marginBottom:20,flexWrap:"wrap"}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,fontFamily:MONO,fontSize:10,letterSpacing:"0.2em",textTransform:"uppercase",color:t.muted,flexWrap:"wrap"}}>
            <span style={{width:16,height:1,background:C.magenta,display:"inline-block"}}/>
            {pubLabel}
          </div>
          <h1 style={{fontWeight:800,fontSize:"clamp(1.6rem,3.5vw,2.4rem)",letterSpacing:"-0.03em",color:t.ink,margin:"0 0 8px",lineHeight:1.04}}>
            Payout Tracker <em style={{fontStyle:"italic",color:C.magenta}}>Sumatera</em>
          </h1>
          <p style={{color:t.muted,fontSize:14,margin:0,lineHeight:1.6}}>PO &amp; Direct Invoice payouts · Partner &amp; Agency Prepaid</p>
          {(regionFilter || filterMpxType) && (
            <div style={{display:"inline-flex",alignItems:"center",gap:8,marginTop:10,padding:"5px 12px",borderRadius:8,background:t.surf2,border:`1px solid ${t.line}`,fontSize:12,color:t.muted,flexWrap:"wrap"}}>
              <span style={{width:7,height:7,borderRadius:"50%",background:C.teal,flexShrink:0}}/>
              {regionFilter&&<span>Region: <strong style={{color:t.yellow}}>{regionFilter}</strong></span>}
              {regionFilter&&filterMpxType&&<span style={{color:t.line2}}>·</span>}
              {filterMpxType&&<span>Type: <strong style={{color:t.ink}}>{filterMpxType}</strong></span>}
            </div>
          )}
        </div>
        {isSPM&&(
          <div style={{flexShrink:0}}>
            <Btn t={t} variant="outline" onClick={()=>setScreen("admin")}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
              Back to Admin
            </Btn>
          </div>
        )}
      </div>

      {canPickRegion&&(
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
          <span style={{display:"inline-flex",alignItems:"center",gap:6,fontFamily:MONO,fontSize:10,letterSpacing:"0.14em",textTransform:"uppercase",color:t.muted}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            Region View
          </span>
          <select value={regionView||""} onChange={e=>setRegionView(e.target.value)}
            style={{
              fontFamily:"inherit",fontSize:13,fontWeight:600,color:t.ink,
              background:`${t.surf} url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23${(t.muted||'#8894a8').replace('#','')}' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>") no-repeat right 12px center`,
              border:`1px solid ${t.line}`,borderRadius:9,
              padding:"8px 34px 8px 13px",cursor:"pointer",outline:"none",minWidth:190,
              WebkitAppearance:"none",MozAppearance:"none",appearance:"none",lineHeight:1.2
            }}>
            <option value="">All Sumatera</option>
            {(regionOptions||[]).map(r=><option key={r} value={r}>{r}</option>)}
          </select>
          {regionView&&(
            <button onClick={()=>setRegionView("")}
              style={{fontFamily:"inherit",fontSize:11.5,fontWeight:600,color:t.muted,background:"transparent",border:`1px solid ${t.line}`,borderRadius:8,padding:"6px 10px",cursor:"pointer"}}>
              Reset
            </button>
          )}
        </div>
      )}

      {!isYtd&&<div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginBottom:18}}>
      {segVisible.length>0&&(
        <div style={{display:"inline-flex",gap:4,background:t.surf,border:`1px solid ${t.line}`,borderRadius:14,padding:4,boxShadow:t.shadow1,overflowX:"auto",maxWidth:"100%"}}>
          {segVisible.map(s=>(
            <SegBtn key={s} s={s} active={src===s} disabled={false}
              count={(s==="partner"?segPartnerCount:segAgencyCount).toLocaleString()}
              label={s==="partner"?"Partner Prepaid":"Agency Prepaid"}
              onClick={()=>{
                if (s===src) return;
                setSrc(s);
                resetFilters();
                setSearchIdx(-1); setCollapsed({}); setRawPage(1);
                showToast(`Switched to ${s==="partner"?"Partner":"Agency"} Prepaid — filters reset`);
              }}
              t={t}/>
          ))}
        </div>
      )}
        <FlowSwitch value={filters.flow||"all"} onChange={v=>{ setFilters(f=>({...f,flow:v})); setRawPage(1); }} t={t}/>
      </div>}

      <div style={{display:"flex",gap:24,borderBottom:`1px solid ${t.line}`,marginBottom:18,overflowX:"auto"}}>
        {[{id:"dash",label:"Dashboard"},{id:"raw",label:"Raw Data",count:filtRaw.length},{id:"ytd",label:"YTD Summary"},...(SHOW_DOCUMENT_TABS&&docs.enabled?[{id:"docs",label:"Document Upload & Merge",count:docPOsDone}]:[]),...(SHOW_DOCUMENT_TABS&&docs.enabled&&docs.canManageApprovals?[{id:"letters",label:"Partner Letters"}]:[])].map(tab=>(
          <TabBtn key={tab.id} label={tab.label} count={tab.count} active={activeTab===tab.id} onClick={()=>setActiveTab(tab.id)} t={t}/>
        ))}
      </div>

      {curAgg.length>0&&!isYtd&&(
        <div style={{background:t.surf,border:`1px solid ${t.line}`,borderRadius:14,padding:"10px 16px",marginBottom:chips.length>0?8:18,boxShadow:t.shadow1,position:"relative",zIndex:10}}>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span style={{fontFamily:MONO,fontSize:10,letterSpacing:"0.16em",textTransform:"uppercase",color:t.muted,paddingRight:12,borderRight:`1px solid ${t.line}`,flexShrink:0}}>Filters</span>
            {isMobile&&(
              <button onClick={()=>setShowFilters(v=>!v)} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:10,border:`1px solid ${activeFilterCount?C.teal:t.line2}`,background:t.surf2,color:t.ink,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600}}>
                {showFilters?"Hide filters":"Show filters"}
                {activeFilterCount>0&&<span style={{fontFamily:MONO,fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:99,background:C.teal,color:"#fff"}}>{activeFilterCount}</span>}
              </button>
            )}
            <div style={{display:"flex",gap:8,flexShrink:0,marginLeft:"auto"}}>
              <Btn t={t} variant="outline" sm onClick={()=>exportSummary("csv")} title="Export filtered summary (CSV)">CSV</Btn>
              <Btn t={t} variant="primary" sm onClick={()=>exportSummary("xlsx")} title="Export filtered summary (Excel)">Excel</Btn>
            </div>
          </div>
          {(!isMobile||showFilters)&&(
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginTop:10}}>
              <MultiSel t={t} values={Array.isArray(filters.month)?filters.month:[]} options={opts.months.filter(Boolean)} placeholder="All Months" onChange={vals=>setFilters(f=>({...f,month:vals}))}/>
              <MultiSel t={t} values={Array.isArray(filters.entity)?filters.entity:[]} options={opts.entities.filter(Boolean)} labelOf={v=>entLabel(v,flowSel)} placeholder="All Entities" onChange={vals=>setFilters(f=>({...f,entity:vals}))}/>
              <MultiSel t={t} values={Array.isArray(filters.ptype)?filters.ptype:[]} options={opts.ptypes.filter(Boolean)} placeholder={isAg?"All Agencies":"All Partners"} onChange={vals=>setFilters(f=>({...f,ptype:vals}))}/>
              <MultiSel t={t} values={Array.isArray(filters.prog)?filters.prog:[]} options={opts.progs.filter(Boolean)} placeholder="All Programs" onChange={vals=>setFilters(f=>({...f,prog:vals}))}/>
              {curRaw.length>0&&<MultiSel t={t} values={Array.isArray(filters.status)?filters.status:[]} options={opts.statuses.filter(Boolean)} placeholder="All Statuses" onChange={vals=>setFilters(f=>({...f,status:vals}))}/>}
              <div ref={searchRef} style={{position:"relative",flex:"1 1 200px",minWidth:160}}>
                <svg style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",color:t.muted}} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                <input type="text" placeholder="Search partner, PO / invoice no., or project…" value={searchInput}
                  onChange={e=>{setSearchInput(e.target.value);setSearchIdx(-1);}}
                  onFocus={()=>setSearchFocus(true)} onBlur={()=>setTimeout(()=>setSearchFocus(false),160)}
                  onKeyDown={e=>{
                    const items=allSuggestions;
                    if(e.key==="ArrowDown"){e.preventDefault();setSearchIdx(i=>Math.min(i+1,items.length-1));}
                    else if(e.key==="ArrowUp"){e.preventDefault();setSearchIdx(i=>Math.max(i-1,-1));}
                    else if(e.key==="Enter"){e.preventDefault();if(searchIdx>=0&&items[searchIdx]){const picked=items[searchIdx].label;setSearchInput(picked);setFilters(f=>({...f,q:picked}));setSearchFocus(false);setSearchIdx(-1);}else if(searchInput.trim()){setFilters(f=>({...f,q:searchInput.trim()}));setSearchFocus(false);setSearchIdx(-1);}}
                    else if(e.key==="Escape"){setSearchFocus(false);setSearchIdx(-1);}
                  }}
                  style={{width:"100%",padding:"7px 28px 7px 32px",fontSize:12.5,borderRadius:10,border:`1px solid ${searchFocus?C.teal:t.line2}`,background:t.surf2,color:t.ink,fontFamily:"inherit",outline:"none",boxSizing:"border-box",boxShadow:searchFocus?`0 0 0 3px ${C.teal}22`:"none",transition:"all .15s"}}/>
                {searchInput&&<button onClick={()=>{setSearchInput("");setFilters(f=>({...f,q:""}));}} aria-label="Clear search" style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",width:18,height:18,borderRadius:"50%",border:"none",background:t.surf4,color:t.muted,cursor:"pointer",fontSize:10,padding:0}}>✕</button>}
                {searchFocus&&allSuggestions.length>0&&(
                  <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,right:0,zIndex:300,background:t.surf,border:`1px solid ${t.line2}`,borderRadius:14,boxShadow:t.shadow3,overflow:"hidden"}}>
                    {[{g:searchSuggestions.partners,l:isAg?"Agency":"Partner",ic:C.teal,lbl:"P",off:0},{g:searchSuggestions.pos,l:"PO / Invoice Number",ic:C.magenta,lbl:"PO",off:searchSuggestions.partners.length},{g:searchSuggestions.projects,l:"Project",ic:C.pink,lbl:"Pr",off:searchSuggestions.partners.length+searchSuggestions.pos.length}].filter(x=>x.g.length>0).map(({g,l,ic,lbl,off})=>(
                      <div key={l}>
                        <div style={{padding:"5px 14px 4px",fontFamily:MONO,fontSize:9,textTransform:"uppercase",letterSpacing:"0.14em",color:t.muted,background:t.surf2,display:"flex",justifyContent:"space-between"}}><span>{l}</span><span style={{color:C.teal}}>{g.length}</span></div>
                        {g.map((s,i)=><SugItem key={i} s={s} active={searchIdx===off+i} iconLabel={lbl} accentColor={ic} t={t} onPick={()=>{setSearchInput(s.label);setFilters(f=>({...f,q:s.label}));setSearchFocus(false);setSearchIdx(-1);}}/>)}
                      </div>
                    ))}
                    <div style={{display:"flex",justifyContent:"space-between",padding:"5px 14px",fontFamily:MONO,fontSize:9.5,color:t.muted,background:t.surf2,borderTop:`1px solid ${t.line}`}}><span>↑↓ navigate</span><span>↵ select</span><span>Esc close</span></div>
                  </div>
                )}
              </div>
              <Btn t={t} variant="ghost" sm onClick={resetFilters} style={{flexShrink:0}}>Reset</Btn>
            </div>
          )}
        </div>
      )}

      {chips.length>0&&!isYtd&&(
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:18}}>
          <span style={{fontFamily:MONO,fontSize:9.5,letterSpacing:"0.1em",textTransform:"uppercase",color:t.muted}}>Active:</span>
          {chips.map((c,i)=>(
            <span key={i} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"3px 6px 3px 10px",borderRadius:99,background:`${C.teal}14`,border:`1px solid ${C.teal}40`,fontSize:11.5,color:t.ink}}>
              <span style={{color:t.muted,fontSize:10.5}}>{c.lbl}:</span>
              <span style={{fontWeight:600,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.k==="entity"?entLabel(c.v,flowSel):c.v}</span>
              <button onClick={()=>removeChip(c)} aria-label={`Remove filter ${c.lbl} ${c.v}`} style={{width:16,height:16,borderRadius:"50%",border:"none",background:`${C.teal}30`,color:t.ink,cursor:"pointer",fontSize:9,padding:0,lineHeight:1,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </span>
          ))}
          <button onClick={resetFilters} style={{border:"none",background:"transparent",color:t.bad,cursor:"pointer",fontFamily:"inherit",fontSize:11.5,fontWeight:600,padding:"3px 6px"}}>Clear all</button>
        </div>
      )}

      {isYtd ? (
        <YtdTab partnerRows={viewPartnerRaw||[]} agencyRows={(isSPM||isIOHAny)?(viewAgencyRaw||[]):[]} showTeam={isSPM||isIOHAny} w={w} t={t} showToast={showToast}/>
      ) : filtersEmpty ? (
        <Card t={t} style={{marginBottom:14}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,padding:"28px 16px",textAlign:"center"}}>
            <div style={{fontSize:40}}>🔍</div>
            <div style={{fontWeight:700,fontSize:16,color:t.ink}}>No matching records</div>
            <div style={{color:t.muted,fontSize:13,maxWidth:380,lineHeight:1.6}}>The current filter combination returned no results. Try relaxing one of your filters, or start fresh.</div>
            <Btn t={t} variant="primary" onClick={resetFilters}>Reset Filters</Btn>
          </div>
        </Card>
      ) : (
        <>
          {activeTab==="dash" && <DashTab {...props} t={t} w={w}/>}
          {activeTab==="raw"  && <RawTab  {...props} t={t} w={w} docs={docs}/>}
          {SHOW_DOCUMENT_TABS && activeTab==="letters" && docs.enabled && docs.canManageApprovals && <PartnerLettersTab docs={docs} partnerNames={src==="partner"?[...new Set(docPOsAll.map(p=>p.partner).filter(Boolean))].sort():[]} t={t}/>}
          {SHOW_DOCUMENT_TABS && activeTab==="docs" && docs.enabled && <PoDocsTab pos={docPOs} allPos={docPOsAll} segment={src} docs={docs} noRefCount={docNoRef} fmtAmount={n=>fmtMoney(n)} onGoLetters={docs.canManageApprovals?()=>setActiveTab("letters"):undefined} t={t}/>}
        </>
      )}

      <div style={{marginTop:28,paddingTop:18,borderTop:`1px solid ${t.line}`,textAlign:"center",fontFamily:MONO,fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",color:t.muted,lineHeight:1.6}}>
        Partner &amp; Agency Payout Tracker · Sumatera · SAP &amp; Web Coupa · PO SLA {isAg?"2/2/2/3":"2/1/2/2/3"} WD · Direct Invoice SLA 4/5 WD (Working Days)
        {regionFilter&&<span style={{marginLeft:12,color:t.yellow}}>· {regionFilter}</span>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   INSIGHTS — KPI cards, Outstanding (aging + due this/next week), Partners,
   Flow Comparison, Accrual Agency.
   Semua dihitung sekali dari filtRaw (sudah ikut filter Flow/Month/Entity/dst).
   ───────────────────────────────────────────────────────────────────── */
const DAY = 86400000;
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const ownerName = (r) => gstr(r,["partner name","agency name"]);
const ymLabel = (mk) => { const ms=["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return mk ? `${ms[mk%100]||"?"} ${Math.floor(mk/100)}` : "—"; };
function rowMonthKey(r) {
  const v = gcell(r,["program date","month","bulan","periode"]);
  const d = toRealDate(v);
  return d ? d.getFullYear()*100 + d.getMonth() + 1 : monthKey(v);
}
// SLA compliance: step yang sama, target berbeda per flow (PO vs Direct Invoice)
const SLA_COMPLIANCE = [
  { key:"inv_ap", label:"Invoice → CLV / AP Verified",      from:H_INV, to:H_CLV, sla:{ [FLOW_PO]:2, [FLOW_DI]:4 } },
  { key:"ap_clr", label:"CLV / AP Verified → Bank Clearing", from:H_CLV, to:H_CLR, sla:{ [FLOW_PO]:3, [FLOW_DI]:5 } },
];
const stripCat = (s) => String(s||"").toUpperCase().replace(/[^A-Z0-9]/g,"");

// Accrual Agency: actual per Agency × Program Type × bulan; bulan kosong = rata-rata bulan terisi
// (kecuali kategori non-accrual), agency pengecualian di-skip.
function computeAccrual(rows) {
  const skipAg = ACCRUAL_SKIP_AGENCY.map(normalizeName);
  const groups = {}; const monthSet = new Set();
  rows.forEach(r=>{
    const mk = rowMonthKey(r); if (!mk) return;
    const ag = gstr(r,["agency name"]); if (!ag) return;
    monthSet.add(mk);
    const na = normalizeName(ag);
    if (skipAg.some(x=>na.includes(x))) return;
    const prog = gstr(r,["program type","programtype"]) || "—";
    const key = ag+"\x00"+prog;
    if (!groups[key]) groups[key] = { agency:ag, prog, act:{} };
    groups[key].act[mk] = (groups[key].act[mk]||0) + gnum(r,["amount"]);
  });
  const months = [...monthSet].sort((a,b)=>a-b);
  const tot = {}; months.forEach(m=>{ tot[m]={act:0,est:0}; });
  const list = Object.values(groups).map(g=>{
    const filled = Object.keys(g.act).map(Number);
    const avg = filled.length ? filled.reduce((s,m)=>s+g.act[m],0)/filled.length : 0;
    const noAccrue = ACCRUAL_SKIP_PROG.includes(stripCat(g.prog));
    const cells = {}; let act=0, est=0;
    months.forEach(m=>{
      if (g.act[m]!=null) { cells[m]={v:g.act[m],est:false}; act+=g.act[m]; tot[m].act+=g.act[m]; }
      else if (!noAccrue && avg) { cells[m]={v:avg,est:true}; est+=avg; tot[m].est+=avg; }
    });
    return { ...g, cells, act, est, noAccrue };
  }).sort((a,b)=>a.agency.localeCompare(b.agency)||a.prog.localeCompare(b.prog));
  return { months, list, tot };
}

function FlowBadge({ flow, t }) {
  if (!flow) return null;
  const di = flow===FLOW_DI;
  return <span style={{display:"inline-flex",padding:"2px 7px",borderRadius:6,fontFamily:MONO,fontSize:9.5,fontWeight:600,letterSpacing:"0.04em",whiteSpace:"nowrap",background:di?`${C.yellow}22`:`${C.teal}18`,color:di?t.warnDark:t.goodDark,border:`1px solid ${di?`${C.yellow}55`:`${C.teal}40`}`}}>{di?"Direct Inv":"PO"}</span>;
}

const thS = (t, left) => ({position:"sticky",top:0,zIndex:1,fontFamily:MONO,fontSize:10,letterSpacing:"0.08em",textTransform:"uppercase",color:t.muted,fontWeight:500,background:t.surf2,padding:"8px 9px",textAlign:left?"left":"right",borderBottom:`1.5px solid ${t.line2}`,whiteSpace:"nowrap"});
const tdS = (t, left) => ({padding:"7px 9px",textAlign:left?"left":"right",borderBottom:`1px solid ${t.line}`,fontSize:11.5,color:t.ink2,whiteSpace:"nowrap",maxWidth:left?240:undefined,overflow:"hidden",textOverflow:"ellipsis"});
const EmptyNote = ({ t, children }) => <div style={{textAlign:"center",color:t.muted,padding:"1.5rem",fontFamily:MONO,fontSize:12}}>{children}</div>;

// Rupiah: ringkas (juta/miliar) untuk kartu, penuh untuk tabel
function fmtRp(n) {
  n = Number(n) || 0;
  const a = Math.abs(n), f = (v,d=1) => v.toFixed(d).replace(".", ",");
  if (a>=1e12) return "Rp "+f(n/1e12)+" T";
  if (a>=1e9)  return "Rp "+f(n/1e9)+" M";
  if (a>=1e6)  return "Rp "+f(n/1e6,0)+" jt";
  return "Rp "+Math.round(n).toLocaleString("id-ID");
}
const fmtRpFull = (n) => "Rp "+Math.round(Number(n)||0).toLocaleString("id-ID");
const pctClr = (p, t) => p>=80 ? { c:t.goodDark, bg:t.goodBg, bd:t.goodBd, dot:t.good } : p>=50 ? { c:t.warnDark, bg:t.warnBg, bd:t.warnBd, dot:t.warn } : { c:t.badDark, bg:t.badBg, bd:t.badBd, dot:t.bad };

function computeInsights(rows) {
  const today = dayStart(new Date());
  const wk0 = new Date(today.getTime() - ((today.getDay()+6)%7)*DAY); // Senin minggu ini
  const wk1 = new Date(wk0.getTime()+7*DAY), wk2 = new Date(wk0.getTime()+14*DAY);
  const k = { total:0, n:rows.length, paid:0, paidN:0, out:0, outN:0, notSub:0, notSubAmt:0, cycSum:0, cycN:0 };
  const out = [], due = { this:[], next:[] }, notSub = [];
  const newFlow = () => ({ n:0, amt:0, out:0, cycSum:0, cycN:0, slaN:0, slaOk:0 });
  const fl = { [FLOW_PO]:newFlow(), [FLOW_DI]:newFlow() };
  const owners = {};
  rows.forEach(r=>{
    const amt = gnum(r,["amount"]), st = rowStatus(r), flow = rowFlow(r), name = ownerName(r) || "—";
    const invV = gcell(r,H_INV), clrV = gcell(r,H_CLR);
    const paid = isPaidStatus(st), proc = isProcessStatus(st);
    const f = fl[flow] || fl[FLOW_PO];
    k.total += amt; f.n++; f.amt += amt;
    if (paid) { k.paid += amt; k.paidN++; }
    if (proc) { k.out += amt; k.outN++; f.out += amt; }
    if (isNotSubStatus(st)) { k.notSub++; k.notSubAmt += amt; }
    const cyc = workDaysBetween(invV, clrV);
    if (cyc!=null) { k.cycSum += cyc; k.cycN++; f.cycSum += cyc; f.cycN++; }
    SLA_COMPLIANCE.forEach(s=>{ const wd = workDaysBetween(gcell(r,s.from), gcell(r,s.to)); if (wd==null) return; f.slaN++; if (wd<=s.sla[flow]) f.slaOk++; });
    if (!owners[name]) owners[name] = { name, total:0, paid:0, out:0, n:0 };
    const o = owners[name]; o.total += amt; o.n++; if (paid) o.paid += amt; if (proc) o.out += amt;
    if (!proc && (paid || clrV)) return;
    const invD = toDate(invV), estD = toDate(gcell(r,H_EST));
    const days = invD ? Math.max(0, Math.round((today - dayStart(invD))/DAY)) : null;
    const stage = isNotSubStatus(st) || !invV ? "Waiting for invoice"
      : !gcell(r,H_CLV) ? (flow===FLOW_DI ? "AP verification" : "CLV verification")
      : !clrV ? "Waiting for bank" : (st || "—");
    const mk = rowMonthKey(r);
    const item = { name, title:gstr(r,["project title"])||"—", ref:refNo(r), flow, amt, days, est:estD?dayStart(estD):null, status:st, stage, period:mk?ymLabel(mk):"—" };
    if (isNotSubStatus(st)) notSub.push(item);
    if (proc) { item.bucket = days==null ? "nod" : days<=14 ? "b0" : days<=30 ? "b15" : "b30"; out.push(item); }
    if (item.est && !paid && !clrV) { if (item.est>=wk0 && item.est<wk1) due.this.push(item); else if (item.est>=wk1 && item.est<wk2) due.next.push(item); }
  });
  out.sort((a,b)=>(b.days??-1)-(a.days??-1));
  due.this.sort((a,b)=>a.est-b.est); due.next.sort((a,b)=>a.est-b.est);
  notSub.sort((a,b)=>(a.est||Infinity)-(b.est||Infinity));
  return { k, out, due, notSub, fl, owners:Object.values(owners), wk0, wk1, wk2 };
}

/* ── KPI: 4 kartu (nominal besar + jumlah kecil) ── */
function KpiCards({ ins, partnerCount, monthsCount, isAg, w, t }) {
  const { k } = ins;
  const cards = [
    { l:"Total Payout",          v:k.total,     n:k.n,      ac:C.yellow,  s:"records" },
    { l:"Paid",                  v:k.paid,      n:k.paidN,  ac:C.teal,    s:`paid · ${pct(k.paid,k.total)}% of amount` },
    { l:"Outstanding",           v:k.out,       n:k.outN,   ac:C.magenta, s:"in Payment Process" },
    { l:"Invoice Not Submitted", v:k.notSubAmt, n:k.notSub, ac:C.red,     s:"waiting for invoice" },
  ];
  return (
    <div style={{marginBottom:14}}>
      <div style={{display:"grid",gridTemplateColumns:w>=900?"repeat(4,1fr)":"repeat(2,1fr)",gap:12}}>
        {cards.map(c=>(
          <div key={c.l} style={{background:t.surf,border:`1px solid ${t.line}`,borderTop:`3px solid ${c.ac}`,borderRadius:16,padding:w<480?"12px 13px":"14px 16px",boxShadow:t.shadow1,minWidth:0}}>
            <div style={{fontFamily:MONO,fontSize:9.5,letterSpacing:"0.1em",textTransform:"uppercase",color:t.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.l}</div>
            <div style={{fontWeight:800,fontSize:w<480?19:24,letterSpacing:"-0.03em",color:t.ink,lineHeight:1.15,marginTop:6}} title={fmtRpFull(c.v)}>{fmtRp(c.v)}</div>
            <div style={{fontSize:12,color:t.muted,marginTop:3}}><strong style={{color:t.ink2}}>{c.n.toLocaleString()}</strong> {c.s}</div>
          </div>
        ))}
      </div>
      <div style={{fontFamily:MONO,fontSize:10.5,color:t.muted,marginTop:8,display:"flex",gap:12,flexWrap:"wrap"}}>
        <span>Avg days to clear: <strong style={{color:t.ink}}>{k.cycN?`${(k.cycSum/k.cycN).toFixed(1)} WD`:"—"}</strong> (Invoice → Bank Cleared)</span>
        <span>{partnerCount.toLocaleString()} {isAg?"agencies":"partners"} · {monthsCount} month{monthsCount!==1?"s":""}</span>
      </div>
    </div>
  );
}

/* ── SLA strip: rata-rata hari kerja vs target + % tepat waktu per step ── */
function SlaStrip({ steps, showFlow, bnExp, setBnExp, t }) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {steps.map(r=>{
        const p = pct(r.ok, r.n), pc = pctClr(p, t), open = bnExp===r.key, can = r.n>0;
        return (
          <div key={r.key} style={{border:`1px solid ${open?C.magenta:t.line}`,borderRadius:10,background:t.surf2}}>
            <div {...(can?kbd(()=>setBnExp(e=>e===r.key?null:r.key)):{})} onClick={can?()=>setBnExp(e=>e===r.key?null:r.key):undefined} aria-expanded={open}
              style={{display:"grid",gridTemplateColumns:"1fr auto auto",alignItems:"center",gap:10,padding:"8px 11px",cursor:can?"pointer":"default"}}>
              <div style={{minWidth:0,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                <span style={{fontWeight:600,fontSize:12.5,color:t.ink}}>{r.label}</span>
                {showFlow&&<FlowBadge flow={r.flow} t={t}/>}
              </div>
              <span style={{fontFamily:MONO,fontSize:11.5,color:t.ink2,whiteSpace:"nowrap"}} title="Average working days vs SLA target">
                {r.n?<><strong style={{color:r.avg<=r.sla?t.goodDark:t.badDark}}>{r.avg.toFixed(1)}</strong> / {r.sla} WD</>:"—"}
              </span>
              <span style={{display:"inline-flex",alignItems:"center",gap:5,minWidth:78,justifyContent:"center",padding:"3px 8px",borderRadius:99,fontFamily:MONO,fontSize:10.5,fontWeight:700,background:r.n?pc.bg:t.surf3,color:r.n?pc.c:t.muted,border:`1px solid ${r.n?pc.bd:t.line}`,whiteSpace:"nowrap"}} title={`${r.ok} of ${r.n} on time`}>
                {r.n?<><span style={{width:6,height:6,borderRadius:"50%",background:pc.dot}}/>{p}% on time</>:"no data"}
              </span>
            </div>
            {open&&r.details.length>0&&(
              <div style={{borderTop:`1px solid ${t.line}`,maxHeight:220,overflowY:"auto",background:t.surf}}>
                <div style={{padding:"6px 12px",fontFamily:MONO,fontSize:9.5,color:t.bad,textTransform:"uppercase",letterSpacing:"0.08em"}}>Longest {Math.min(r.details.length,20)} of {r.n}</div>
                {r.details.slice(0,20).map((d,j)=><BnDetailRow key={j} d={d} t={t}/>)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DashTab(props) {
  const { t, w, grand, grandPartnerCount, filtAgg, filtRaw, src, flowSel, funnelStages, bnResults, funnelExp, setFunnelExp, bnExp, setBnExp } = props;
  const isAg = src==="agency";
  const ins = useMemo(()=>computeInsights(filtRaw),[filtRaw]);
  const monthsCount = useMemo(()=>unique(filtAgg.map(r=>r.month)).length,[filtAgg]);
  const flowLbl = flowSel===FLOW_PO?"PO flow":flowSel===FLOW_DI?"Direct Invoice flow":"All flows · starts at Invoice Submitted";
  return (
    <>
      <KpiCards ins={ins} partnerCount={grandPartnerCount} monthsCount={monthsCount} isAg={isAg} w={w} t={t}/>
      <div style={{display:"grid",gridTemplateColumns:w>=1000?"1fr 1fr":"1fr",gap:14,marginBottom:14}}>
        <Card t={t} pad={false}>
          <CardHead title="Payment Progress" accent={C.teal} sub={`${flowLbl} · click "pending" to see records`} t={t}/>
          <div style={{padding:18,display:"flex",gap:18,alignItems:"flex-start",flexWrap:"wrap"}}>
            {w>=480&&<div style={{flexShrink:0}}>
              {(()=>{
                const W=150,H=Math.max(110,funnelStages.length*40),pad=4,sH=(H-pad*2)/funnelStages.length,maxV=grand.n||1;
                return <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{display:"block"}} role="img" aria-label="Payment funnel">{funnelStages.map((s,i)=>{ const w1=(s.val/maxV)*(W-10); const nv=funnelStages[i+1]?funnelStages[i+1].val:s.val; const w2=(nv/maxV)*(W-10); const x1a=(W-w1)/2,x1b=x1a+w1,x2a=(W-w2)/2,x2b=x2a+w2,y1=pad+i*sH,y2=y1+sH-1; const darkTxt=s.color===C.yellow; return <g key={s.key}><path d={`M${x1a},${y1} L${x1b},${y1} L${x2b},${y2} L${x2a},${y2} Z`} fill={s.color} opacity={.95}/><text x={W/2} y={y1+sH/2+4} textAnchor="middle" fill={darkTxt?"#1a1a1a":"#fff"} fontSize={10.5} fontWeight="700" fontFamily="inherit">{pct(s.val,grand.n)}%</text></g>; })}</svg>;
              })()}
            </div>}
            <div style={{flex:1,minWidth:200}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:t.muted,padding:"0 8px 6px"}}><span>Total records</span><strong style={{fontFamily:MONO,color:t.ink}}>{grand.n.toLocaleString()}</strong></div>
              {funnelStages.map((s,i)=>{ const prev=i>0?funnelStages[i-1]:null; const drop=(prev?prev.val:grand.n)-s.val; return <FunnelRowItem key={s.key} s={s} prevKey={prev?prev.key:null} drop={drop} isExp={funnelExp===s.key} filtRaw={filtRaw} grand={grand} onToggle={()=>setFunnelExp(k=>k===s.key?null:s.key)} t={t}/>; })}
            </div>
          </div>
        </Card>
        <Card t={t} pad={false}>
          <CardHead title="SLA by Step" accent={C.red} sub="Avg working days vs target · % on time · click a step for the longest cases" t={t}/>
          <div style={{padding:18}}>
            {filtRaw.length===0?<EmptyNote t={t}>No data available</EmptyNote>:<SlaStrip steps={bnResults} showFlow={flowSel==="all"} bnExp={bnExp} setBnExp={setBnExp} t={t}/>}
            <div style={{display:"flex",gap:12,marginTop:10,flexWrap:"wrap",fontFamily:MONO,fontSize:9.5,color:t.muted}}>
              {[{c:t.good,l:"≥80% on time"},{c:t.warn,l:"50–79%"},{c:t.bad,l:"<50%"}].map(x=><span key={x.l} style={{display:"inline-flex",alignItems:"center",gap:5}}><span style={{width:8,height:8,borderRadius:2,background:x.c}}/>{x.l}</span>)}
            </div>
          </div>
        </Card>
      </div>
      <DetailsTabs {...props} ins={ins} isAg={isAg}/>
    </>
  );
}

/* ── Area detail bertab (default: Outstanding) ── */
function DetailsTabs(props) {
  const { t, w, ins, isAg, flowSel } = props;
  const [tab, setTab] = useState("out");
  const tabs = [
    { id:"out",  label:"Outstanding", count:ins.out.length },
    { id:"own",  label:isAg?"Agencies":"Partners", count:ins.owners.length },
    { id:"mon",  label:"Monthly" },
    { id:"flow", label:"Flow Comparison" },
    ...(isAg?[{ id:"acc", label:"Accrual" }]:[]),
  ];
  const cur = tabs.some(x=>x.id===tab) ? tab : "out";
  return (
    <Card t={t} pad={false} style={{marginBottom:14}}>
      <div style={{display:"flex",gap:22,padding:"0 20px",borderBottom:`1px solid ${t.line}`,background:t.surf2,overflowX:"auto"}} role="tablist">
        {tabs.map(x=><TabBtn key={x.id} label={x.label} count={x.count} active={cur===x.id} onClick={()=>setTab(x.id)} t={t}/>)}
      </div>
      {cur==="out"  && <OutstandingTab ins={ins} isAg={isAg} w={w} t={t}/>}
      {cur==="own"  && <PartnersTab ins={ins} isAg={isAg} w={w} t={t}/>}
      {cur==="mon"  && <MonthlyTab {...props}/>}
      {cur==="flow" && <FlowCompareTab ins={ins} flowSel={flowSel} t={t}/>}
      {cur==="acc"  && isAg && <AccrualTab rows={props.curRaw} w={w} t={t} showToast={props.showToast}/>}
    </Card>
  );
}

function Chip({ active, onClick, children, t, tone }) {
  const ac = tone || C.teal;
  return <button type="button" onClick={onClick} aria-pressed={active} style={{fontFamily:"inherit",fontSize:12,fontWeight:600,padding:"5px 12px",borderRadius:99,cursor:"pointer",whiteSpace:"nowrap",border:`1px solid ${active?ac:t.line2}`,background:active?ac:t.surf,color:active?"#fff":t.ink2,transition:"all .15s"}}>{children}</button>;
}

function SortTh({ col, sort, setSort, left, children, t }) {
  const on = sort.col===col;
  return <th onClick={()=>setSort(s=>({col,dir:s.col===col&&s.dir==="desc"?"asc":"desc"}))} aria-sort={on?(sort.dir==="asc"?"ascending":"descending"):"none"} style={{...thS(t,left),cursor:"pointer",color:on?C.teal:t.muted,fontWeight:on?700:500}}>{children}{on?(sort.dir==="asc"?" ▲":" ▼"):""}</th>;
}

function PartnersTab({ ins, isAg, w, t }) {
  const [sort, setSort] = useState({ col:"total", dir:"desc" });
  const list = useMemo(()=>{
    const arr = ins.owners.map(o=>({ ...o, pPaid: o.total ? o.paid/o.total*100 : 0 }));
    const { col, dir } = sort, m = dir==="asc" ? 1 : -1;
    arr.sort((a,b)=>col==="name" ? m*a.name.localeCompare(b.name) : m*(a[col]-b[col]));
    return arr;
  },[ins.owners,sort]);
  const phone = w<640;
  if (!list.length) return <EmptyNote t={t}>No data available</EmptyNote>;
  return (
    <div style={{maxHeight:460,overflow:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr>
          <SortTh col="name" left sort={sort} setSort={setSort} t={t}>{isAg?"Agency":"Partner"}</SortTh>
          <SortTh col="total" sort={sort} setSort={setSort} t={t}>Total</SortTh>
          {!phone&&<SortTh col="paid" sort={sort} setSort={setSort} t={t}>Paid</SortTh>}
          <SortTh col="out" sort={sort} setSort={setSort} t={t}>Outstanding</SortTh>
          <SortTh col="pPaid" sort={sort} setSort={setSort} t={t}>% Paid</SortTh>
        </tr></thead>
        <tbody>{list.map((o,i)=>{ const p=Math.round(o.pPaid); return (
          <tr key={o.name} style={{background:i%2===1?t.rowStripe:"transparent"}}>
            <td style={{...tdS(t,true),fontWeight:600,color:t.ink,maxWidth:phone?140:320}} title={o.name}>{o.name}</td>
            <td style={{...tdS(t),fontFamily:MONO}}>{fmtRpFull(o.total)}</td>
            {!phone&&<td style={{...tdS(t),fontFamily:MONO}}>{fmtRpFull(o.paid)}</td>}
            <td style={{...tdS(t),fontFamily:MONO,color:o.out?t.warnDark:t.muted}}>{fmtRpFull(o.out)}</td>
            <td style={tdS(t)}><PctBadge val={p} t={t}/></td>
          </tr>
        ); })}</tbody>
      </table>
    </div>
  );
}

function FlowCompareTab({ ins, flowSel, t }) {
  const cols = [FLOW_PO, FLOW_DI];
  const f = ins.fl;
  const rows = [
    { l:"Records",             v:(x)=>x.n.toLocaleString() },
    { l:"Amount",              v:(x)=>fmtRpFull(x.amt) },
    { l:"Avg days to clear",   v:(x)=>x.cycN?`${(x.cycSum/x.cycN).toFixed(1)} WD`:"—" },
    { l:"% on time (SLA)",     v:(x)=>x.slaN?<PctBadge val={pct(x.slaOk,x.slaN)} t={t}/>:"—" },
  ];
  return (
    <div style={{padding:18}}>
      {flowSel!=="all"&&<div style={{fontSize:12,color:t.muted,marginBottom:10}}>Flow filter is on — set it to <strong style={{color:t.ink}}>All Flows</strong> to compare both side by side.</div>}
      <div style={{overflowX:"auto",border:`1px solid ${t.line}`,borderRadius:10,maxWidth:640}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr><th style={thS(t,true)}>Metric</th>{cols.map(c=><th key={c} style={thS(t)}><FlowBadge flow={c} t={t}/></th>)}</tr></thead>
          <tbody>{rows.map(r=>(
            <tr key={r.l}><td style={{...tdS(t,true),fontWeight:600,color:t.ink}}>{r.l}</td>{cols.map(c=><td key={c} style={{...tdS(t),fontFamily:MONO}}>{r.v(f[c])}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
      <div style={{fontFamily:MONO,fontSize:10,color:t.muted,marginTop:8}}>Avg days = Invoice Submission → Bank Cleared (working days). On time: PO 2 + 3 WD · Direct Invoice 4 + 5 WD.</div>
    </div>
  );
}

/* ── Outstanding: daftar tindak lanjut ── */
function OutstandingTab({ ins, isAg, w, t }) {
  const [view, setView] = useState("all"); // all | b0 | b15 | b30 | nod | notsub | this | next
  const cnt = (b) => ins.out.filter(x=>x.bucket===b).length;
  const rows = useMemo(()=>{
    if (view==="this" || view==="next") return ins.due[view];
    if (view==="notsub") return ins.notSub;
    return view==="all" ? ins.out : ins.out.filter(x=>x.bucket===view);
  },[ins,view]);
  const amt = rows.reduce((a,r)=>a+r.amt,0);
  const phone = w<640;
  const today = dayStart(new Date());
  const dayClr = (d) => d==null ? t.muted : d>30 ? t.bad : d>14 ? t.warnDark : t.goodDark;
  const title = view==="this" ? "Due this week" : view==="next" ? "Due next week" : view==="notsub" ? "Invoice not submitted" : "Total outstanding";
  const sub = view==="this"||view==="next"
    ? `Unpaid, Est. Pay Date ${fmtDate(view==="this"?ins.wk0:ins.wk1)} – ${fmtDate(new Date((view==="this"?ins.wk1:ins.wk2).getTime()-DAY))}`
    : view==="notsub" ? "Status Invoice Not Submitted" : "Status Payment Process · oldest first";
  const estTh = { ...thS(t,true), background:`${C.yellow}33`, color:t.ink, fontWeight:700 };
  return (
    <div style={{padding:18}}>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:12}}>
        <Chip t={t} active={view==="all"} onClick={()=>setView("all")}>All outstanding · {ins.out.length}</Chip>
        <Chip t={t} active={view==="b0"} onClick={()=>setView("b0")}>0–14 days · {cnt("b0")}</Chip>
        <Chip t={t} active={view==="b15"} onClick={()=>setView("b15")} tone={C.yellowD}>15–30 days · {cnt("b15")}</Chip>
        <Chip t={t} active={view==="b30"} onClick={()=>setView("b30")} tone={C.red}>&gt;30 days · {cnt("b30")}</Chip>
        {cnt("nod")>0&&<Chip t={t} active={view==="nod"} onClick={()=>setView("nod")} tone={C.grey}>No invoice date · {cnt("nod")}</Chip>}
        <Chip t={t} active={view==="notsub"} onClick={()=>setView("notsub")} tone={C.grey}>Not submitted · {ins.notSub.length}</Chip>
        <span style={{flex:"1 1 0"}}/>
        <Chip t={t} active={view==="this"} onClick={()=>setView("this")} tone={C.magenta}>Due this week · {ins.due.this.length}</Chip>
        <Chip t={t} active={view==="next"} onClick={()=>setView("next")} tone={C.magenta}>Due next week · {ins.due.next.length}</Chip>
      </div>
      <div style={{display:"flex",alignItems:"baseline",gap:12,flexWrap:"wrap",padding:"10px 14px",background:t.surf2,border:`1px solid ${t.line}`,borderRadius:12,marginBottom:10}}>
        <span style={{fontSize:12.5,fontWeight:600,color:t.muted}}>{title}</span>
        <span style={{fontWeight:800,fontSize:20,color:t.ink,letterSpacing:"-0.02em"}}>{fmtRpFull(amt)}</span>
        <span style={{fontSize:12,color:t.muted}}>{rows.length.toLocaleString()} records · {sub}</span>
      </div>
      {rows.length===0 ? <EmptyNote t={t}>{view==="this"||view==="next"?"No payments due in this period":view==="notsub"?"No invoices waiting":"No outstanding payments"}</EmptyNote> : (
        <div style={{maxHeight:440,overflow:"auto",border:`1px solid ${t.line}`,borderRadius:10}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>
              <th style={thS(t,true)}>{isAg?"Agency":"Partner"}</th>
              {!phone&&<th style={thS(t,true)}>Project Title</th>}
              <th style={estTh}>Est. Date</th>
              {!phone&&<th style={thS(t,true)}>Period</th>}
              <th style={thS(t)}>Outstanding</th>
              {!phone&&<th style={thS(t,true)}>Status / Stage</th>}
              {!phone&&<th style={thS(t)}>Days</th>}
            </tr></thead>
            <tbody>{rows.slice(0,300).map((a,i)=>{
              const late = a.est && a.est < today;
              return (
                <tr key={i} style={{background:i%2===1?t.rowStripe:"transparent"}}>
                  <td style={{...tdS(t,true),maxWidth:phone?130:180,color:t.ink,fontWeight:600}} title={`${a.name} · ${a.ref||"no ref"} · ${a.flow}`}>{a.name}</td>
                  {!phone&&<td style={{...tdS(t,true),maxWidth:w<1100?170:260}} title={a.title}>{a.title}</td>}
                  <td style={{...tdS(t,true),fontFamily:MONO,fontWeight:700,background:late?t.badBg:`${C.yellow}14`,color:late?t.bad:t.ink}} title={late?"Estimation date has passed":undefined}>{a.est?fmtDate(a.est):"—"}</td>
                  {!phone&&<td style={{...tdS(t,true),fontFamily:MONO}}>{a.period}</td>}
                  <td style={{...tdS(t),fontFamily:MONO,color:t.ink}}>{fmtRpFull(a.amt)}</td>
                  {!phone&&<td style={{...tdS(t,true),maxWidth:170}} title={a.status}>{a.stage}</td>}
                  {!phone&&<td style={{...tdS(t),fontFamily:MONO,fontWeight:700,color:dayClr(a.days)}} title="Days since Invoice Submission">{a.days==null?"—":a.days}</td>}
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      {rows.length>300&&<div style={{fontFamily:MONO,fontSize:10,color:t.muted,marginTop:6}}>Showing 300 of {rows.length.toLocaleString()} — narrow the filters or use Raw Data for the rest.</div>}
      <div style={{fontFamily:MONO,fontSize:10,color:t.muted,marginTop:8}}>Est. Date in red = already past today. Days = since Invoice Submission.</div>
    </div>
  );
}

/* ── Tahun (YTD Summary & Accrual) ── */
const rowYear = (r) => { const mk = rowMonthKey(r); return mk ? Math.floor(mk/100) : 0; };
function yearsOf(rows) { return [...new Set(rows.map(rowYear).filter(Boolean))].sort((a,b)=>b-a); }
function useYear(years) {
  const cy = new Date().getFullYear();
  const [y, setY] = useState(null);
  const year = y && years.includes(y) ? y : (years.includes(cy) ? cy : (years[0] || cy));
  return [year, setY];
}
function YearSelect({ years, value, onChange, t }) {
  return (
    <select value={value} onChange={e=>onChange(+e.target.value)} aria-label="Year"
      style={{fontFamily:"inherit",fontSize:13,fontWeight:700,color:t.ink,background:t.surf2,border:`1px solid ${t.line2}`,borderRadius:9,padding:"6px 10px",cursor:"pointer"}}>
      {(years.length?years:[value]).map(y=><option key={y} value={y}>{y}</option>)}
    </select>
  );
}

/* ── YTD Summary: biaya Sales Team (Agency) + insentif Partner per bulan ── */
// Program Type yang dihitung "Salary" (dibandingkan setelah huruf/angka saja); selain ini = Incentive
const SALARY_TYPES = ["SALARY","SALARYFWA","SALARYUUCK","THR"];
const MONTHS_SHORT = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function computeYtd(pRows, aRows, year) {
  const cell = () => ({ a:0, p:0 });
  const data = {}; const ents = new Set(); let maxM = 0;
  const at = (m) => (data[m] = data[m] || { sal:cell(), inc:cell(), ent:{} });
  const add = (c, amt, paid) => { c.a += amt; if (paid) c.p += amt; };
  aRows.forEach(r=>{
    const mk = rowMonthKey(r); if (!mk || Math.floor(mk/100)!==year) return;
    const m = mk%100; maxM = Math.max(maxM, m);
    const amt = gnum(r,["amount"]), paid = !!gcell(r,H_CLR);
    add(SALARY_TYPES.includes(stripCat(gstr(r,["program type","programtype"]))) ? at(m).sal : at(m).inc, amt, paid);
  });
  pRows.forEach(r=>{
    const mk = rowMonthKey(r); if (!mk || Math.floor(mk/100)!==year) return;
    const m = mk%100; maxM = Math.max(maxM, m);
    const e = gstr(r,["entity"]) || "(blank)"; ents.add(e);
    const d = at(m); add(d.ent[e] = d.ent[e] || cell(), gnum(r,["amount"]), !!gcell(r,H_CLR));
  });
  const entList = [...ents].sort();
  const sum = (cs) => cs.reduce((x,c)=>({ a:x.a+(c?.a||0), p:x.p+(c?.p||0) }), cell());
  const rowOf = (d) => {
    const sal = d?.sal||cell(), inc = d?.inc||cell(), ent = entList.map(e=>d?.ent[e]||cell());
    const team = sum([sal,inc]), partner = sum(ent);
    return { sal, inc, team, ent, partner, grand:sum([team,partner]) };
  };
  const rows = []; for (let m=1;m<=maxM;m++) rows.push({ m, label:`${MONTHS_SHORT[m]} ${year}`, ...rowOf(data[m]) });
  const tot = { m:0, label:`YTD ${year}`, sal:sum(rows.map(r=>r.sal)), inc:sum(rows.map(r=>r.inc)), team:sum(rows.map(r=>r.team)),
    ent:entList.map((_,i)=>sum(rows.map(r=>r.ent[i]))), partner:sum(rows.map(r=>r.partner)), grand:sum(rows.map(r=>r.grand)) };
  return { rows, tot, entList };
}

function YtdTab({ partnerRows, agencyRows, showTeam, w, t, showToast }) {
  const years = useMemo(()=>yearsOf([...partnerRows,...agencyRows]),[partnerRows,agencyRows]);
  const [year, setYear] = useYear(years);
  const ytd = useMemo(()=>computeYtd(partnerRows, showTeam?agencyRows:[], year),[partnerRows,agencyRows,showTeam,year]);
  const phone = w<700;
  const cols = [
    ...(showTeam?[{k:"sal",l:"Salary",g:"team",split:true},{k:"inc",l:"Incentive",g:"team",split:true},{k:"team",l:"Total",g:"team",tot:true}]:[]),
    ...ytd.entList.map((e,i)=>({k:"ent",i,l:e,g:"partner",split:true})),
    {k:"partner",l:"Total",g:"partner",tot:true},
    {k:"grand",l:"Grand Total",g:"grand",tot:true},
  ].filter(c=>!(phone&&c.split));
  const val = (row,c) => c.k==="ent" ? row.ent[c.i] : row[c.k];
  const num = (n) => Math.round(n).toLocaleString("id-ID");
  const groups = [["team","Sales Team · Agency Prepaid"],["partner","Partner Incentive · Partner Prepaid"],["grand",""]].map(([g,l])=>({g,l,n:cols.filter(c=>c.g===g).length})).filter(x=>x.n);
  const exportXlsx = async () => {
    const XLSX = await getXLSX();
    const line = (r) => {
      const o = { Month:r.label };
      if (showTeam) { o["Sales Team Salary Amount"]=r.sal.a; o["Sales Team Salary Paid"]=r.sal.p; o["Sales Team Incentive Amount"]=r.inc.a; o["Sales Team Incentive Paid"]=r.inc.p; o["Sales Team Amount"]=r.team.a; o["Sales Team Paid"]=r.team.p; }
      ytd.entList.forEach((e,i)=>{ o[`Partner ${e} Amount`]=r.ent[i].a; o[`Partner ${e} Paid`]=r.ent[i].p; });
      o["Partner Amount"]=r.partner.a; o["Partner Paid"]=r.partner.p; o["Grand Total Amount"]=r.grand.a; o["Grand Total Paid"]=r.grand.p;
      return o;
    };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([...ytd.rows.map(line), line(ytd.tot)]), `YTD ${year}`);
    XLSX.writeFile(wb, `ytd_summary_${year}.xlsx`);
    showToast(`YTD ${year} downloaded — Excel`,"success");
  };
  const cellTd = (c, v, foot) => (
    <td key={c.k+(c.i??"")} style={{...tdS(t),fontFamily:MONO,verticalAlign:"top",background:foot?"#1E2128":c.tot?t.surf2:undefined,color:foot?"#fff":t.ink,fontWeight:c.tot||foot?700:500,borderLeft:c.tot?`1px solid ${t.line}`:undefined}}>
      <div>{v.a?num(v.a):"—"}</div>
      {v.a>0&&<div style={{fontSize:10,fontWeight:500,color:foot?"#C9CDD6":t.muted,marginTop:2}} title={`Paid ${fmtRpFull(v.p)} of ${fmtRpFull(v.a)}`}>paid {num(v.p)} · {pct(v.p,v.a)}%</div>}
    </td>
  );
  return (
    <Card t={t} pad={false} style={{marginBottom:14}}>
      <CardHead title={`YTD Summary ${year}`} accent={C.yellow}
        sub="Amount = committed · Paid = Clearing Date filled · by Program Date month"
        right={<div style={{display:"flex",gap:8,alignItems:"center"}}><YearSelect years={years} value={year} onChange={setYear} t={t}/><Btn t={t} variant="primary" sm onClick={exportXlsx} disabled={!ytd.rows.length}>Export Excel</Btn></div>} t={t}/>
      <div style={{padding:"10px 20px",fontSize:12,color:t.muted,lineHeight:1.55,borderBottom:`1px solid ${t.line}`}}>
        {showTeam&&<>Sales Team = Agency Prepaid; <strong style={{color:t.ink2}}>Salary</strong> = SALARY, SALARY FWA, SALARYUUCK, THR; <strong style={{color:t.ink2}}>Incentive</strong> = all other programs. </>}
        Partner = Partner Prepaid by Entity. Includes PO and MDI rows; dashboard filters don&rsquo;t apply here. Amounts in Rupiah.
      </div>
      {!ytd.rows.length ? <EmptyNote t={t}>No data for {year}</EmptyNote> : (
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:phone?undefined:Math.max(720,140+cols.length*125)}}>
            <thead>
              <tr><th style={{...thS(t,true),borderBottom:0}}/>{groups.map(x=><th key={x.g} colSpan={x.n} style={{...thS(t),textAlign:"center",borderBottom:0,color:t.ink,fontWeight:700}}>{x.l}</th>)}</tr>
              <tr><th style={thS(t,true)}>Month</th>{cols.map(c=><th key={c.k+(c.i??"")} style={{...thS(t),color:c.tot?t.ink:t.muted,fontWeight:c.tot?700:500}}>{c.l}</th>)}</tr>
            </thead>
            <tbody>{ytd.rows.map((r,i)=>(
              <tr key={r.m} style={{background:i%2===1?t.rowStripe:"transparent"}}>
                <td style={{...tdS(t,true),fontWeight:700,color:t.ink,verticalAlign:"top"}}>{r.label}</td>
                {cols.map(c=>cellTd(c,val(r,c),false))}
              </tr>
            ))}</tbody>
            <tfoot><tr>
              <td style={{...tdS(t,true),background:"#1E2128",color:"#fff",fontWeight:800,borderTop:`2px solid ${C.teal}`,verticalAlign:"top"}}>{ytd.tot.label}</td>
              {cols.map(c=>cellTd(c,val(ytd.tot,c),true))}
            </tr></tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ── Accrual Agency: checklist submission + estimasi ── */
// Jadwal submission yang DIHARAPKAN per Program Type (kunci = huruf/angka saja, kapital).
// DEFAULT — menunggu konfirmasi Saila. "monthly" = setiap bulan; array = bulan tertentu (1–12).
const ACCRUAL_SCHEDULE = {
  INCENTIVE:    "monthly",
  SALARY:       "monthly",
  INCENTIVEFWA: "monthly",
  SALARYFWA:    "monthly",
  SALARYUUCK:   [3,6,9,12],   // kuartalan
  THR:          [3],          // tahunan, Lebaran 2026 (Maret)
};
const isExpected = (prog, m) => { const s = ACCRUAL_SCHEDULE[stripCat(prog)]; return s==="monthly" || (Array.isArray(s) && s.includes(m)); };
// Jadwal kuartalan/tahunan: dianggap sudah submit bila ada baris di periodenya, yaitu bulan setelah
// jadwal sebelumnya s.d. bulan jadwal (mis. SALARYUUCK Mar → Jan–Mar; THR Mar → Jan–Mar).
function periodStart(prog, m) {
  const s = ACCRUAL_SCHEDULE[stripCat(prog)];
  if (!Array.isArray(s)) return m;
  const prev = s.filter(x=>x<m);
  return prev.length ? Math.max(...prev)+1 : 1;
}

function computeChecklist(rows, year) {
  const now = new Date(), cy = now.getFullYear();
  const last = year<cy ? 12 : year===cy ? now.getMonth() : 0; // s.d. bulan terakhir yang sudah lewat
  const months = []; for (let m=1;m<=last;m++) months.push(m);
  const skip = ACCRUAL_SKIP_AGENCY.map(normalizeName);
  const ags = {};
  rows.forEach(r=>{
    const mk = rowMonthKey(r); if (!mk || Math.floor(mk/100)!==year) return;
    const m = mk%100, name = gstr(r,["agency name"]); if (!name) return;
    const prog = gstr(r,["program type","programtype"]) || "—";
    const a = ags[name] = ags[name] || { name, first:13, progs:{} };
    a.first = Math.min(a.first, m);
    const c = a.progs[prog] = a.progs[prog] || {};
    c[m] = (c[m]||0) + gnum(r,["amount"]);
  });
  const list = [], missing = [];
  Object.values(ags).sort((a,b)=>a.name.localeCompare(b.name)).forEach(a=>{
    const excluded = skip.some(x=>normalizeName(a.name).includes(x));
    Object.keys(a.progs).sort((x,y)=>(ACCRUAL_SCHEDULE[stripCat(y)]?1:0)-(ACCRUAL_SCHEDULE[stripCat(x)]?1:0) || x.localeCompare(y)).forEach(prog=>{
      const c = a.progs[prog];
      const cells = months.map(m=>{
        if (c[m]!=null) return { s:"ok", amt:c[m] };
        const covered = () => { for (let x=periodStart(prog,m); x<=m; x++) if (c[x]!=null) return true; return false; };
        if (!excluded && m>=a.first && isExpected(prog,m) && !covered()) { missing.push({ agency:a.name, prog, m, period:`${MONTHS_SHORT[m]} ${year}` }); return { s:"miss" }; }
        return { s:"na" };
      });
      list.push({ agency:a.name, prog, cells, scheduled:!!ACCRUAL_SCHEDULE[stripCat(prog)] });
    });
  });
  return { months, list, missing, last };
}

function AccrualTab({ rows, w, t, showToast }) {
  const years = useMemo(()=>yearsOf(rows),[rows]);
  const [year, setYear] = useYear(years);
  const yearRows = useMemo(()=>rows.filter(r=>rowYear(r)===year),[rows,year]);
  const ck = useMemo(()=>computeChecklist(rows, year),[rows,year]);
  const acc = useMemo(()=>computeAccrual(yearRows),[yearRows]);
  const [sort, setSort] = useState({ col:"agency", dir:"asc" });
  const missing = useMemo(()=>{
    const m = sort.dir==="asc"?1:-1;
    return [...ck.missing].sort((a,b)=> sort.col==="period" ? m*(a.m-b.m) : m*String(a[sort.col]).localeCompare(String(b[sort.col])) || a.m-b.m);
  },[ck.missing,sort]);
  const phone = w<640;
  const exportMissing = async () => {
    const XLSX = await getXLSX();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(missing.map(x=>({ Agency:x.agency, Program:x.prog, Period:x.period }))), "Missing");
    XLSX.writeFile(wb, `agency_missing_submissions_${year}.xlsx`);
    showToast("Missing list downloaded — Excel","success");
  };
  const mark = { ok:{ c:t.goodDark, bg:t.goodBg, s:"✓" }, miss:{ c:t.bad, bg:t.badBg, s:"✗" }, na:{ c:t.muted2, bg:"transparent", s:"–" } };
  return (
    <div style={{padding:18}}>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:10}}>
        <span style={{fontWeight:700,fontSize:14,color:t.ink}}>Submission checklist</span>
        <YearSelect years={years} value={year} onChange={setYear} t={t}/>
        <span style={{display:"inline-flex",alignItems:"center",gap:6,padding:"3px 10px",borderRadius:99,background:ck.missing.length?t.badBg:t.goodBg,color:ck.missing.length?t.badDark:t.goodDark,fontWeight:700,fontSize:12}}>{ck.missing.length?`${ck.missing.length} missing`:"Nothing missing"}</span>
      </div>
      <div style={{fontSize:12,color:t.muted,lineHeight:1.55,marginBottom:10,maxWidth:"90ch"}}>
        ✓ submitted (amount) · <span style={{color:t.bad,fontWeight:700}}>✗</span> expected but missing · – not expected. Months up to the last completed month. Expected schedule (defaults, to be confirmed): INCENTIVE, SALARY, INCENTIVE FWA, SALARY FWA monthly; SALARYUUCK once per quarter (due Mar/Jun/Sep/Dec); THR once by March. An agency is only checked for programs it has submitted this year, from its first month this year. ADHITAMA MITRA NUSANTARA is never marked missing. All Agency rows (PO + MDI); dashboard filters don&rsquo;t apply.
      </div>
      {!ck.list.length||!ck.months.length ? <EmptyNote t={t}>No agency data for {year}</EmptyNote> : (
        <div style={{maxHeight:440,overflow:"auto",border:`1px solid ${t.line}`,borderRadius:10,marginBottom:16}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:Math.max(phone?480:640,230+ck.months.length*72)}}>
            <thead><tr><th style={thS(t,true)}>Agency · Program</th>{ck.months.map(m=><th key={m} style={{...thS(t),textAlign:"center"}}>{MONTHS_SHORT[m]}</th>)}</tr></thead>
            <tbody>{ck.list.map((g,i)=>(
              <tr key={g.agency+"\x00"+g.prog} style={{background:i%2===1?t.rowStripe:"transparent"}}>
                <td style={{...tdS(t,true),maxWidth:260}} title={`${g.agency} · ${g.prog}`}><strong style={{color:t.ink}}>{g.agency}</strong><span style={{color:t.muted}}> · {g.prog}</span>{!g.scheduled&&<span style={{marginLeft:6,fontFamily:MONO,fontSize:9,color:t.muted}}>(no schedule)</span>}</td>
                {g.cells.map((c,j)=>{ const k=mark[c.s]; return (
                  <td key={j} style={{...tdS(t),textAlign:"center",background:k.bg,color:k.c,fontWeight:700,padding:"5px 4px"}} title={c.s==="ok"?fmtRpFull(c.amt):c.s==="miss"?"Expected but missing":"Not expected"}>
                    <div>{k.s}</div>{c.s==="ok"&&<div style={{fontFamily:MONO,fontSize:9.5,fontWeight:500,color:t.muted}}>{fmtRp(c.amt).replace("Rp ","")}</div>}
                  </td>
                ); })}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:8}}>
        <span style={{fontWeight:700,fontSize:14,color:t.ink}}>Missing list <span style={{fontWeight:400,fontSize:12,color:t.muted}}>· {missing.length} items</span></span>
        <Btn t={t} variant="outline" sm onClick={exportMissing} disabled={!missing.length}>Export Excel</Btn>
      </div>
      {!missing.length ? <EmptyNote t={t}>No missing submissions</EmptyNote> : (
        <div style={{maxHeight:300,overflow:"auto",border:`1px solid ${t.line}`,borderRadius:10,marginBottom:20}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>
              <SortTh col="agency" left sort={sort} setSort={setSort} t={t}>Agency</SortTh>
              <SortTh col="prog" left sort={sort} setSort={setSort} t={t}>Program</SortTh>
              <SortTh col="period" left sort={sort} setSort={setSort} t={t}>Period</SortTh>
            </tr></thead>
            <tbody>{missing.map((x,i)=>(
              <tr key={i} style={{background:i%2===1?t.rowStripe:"transparent"}}>
                <td style={{...tdS(t,true),fontWeight:600,color:t.ink}}>{x.agency}</td>
                <td style={tdS(t,true)}>{x.prog}</td>
                <td style={{...tdS(t,true),fontFamily:MONO}}>{x.period}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <AccrualEstimate acc={acc} year={year} w={w} t={t}/>
    </div>
  );
}

function AccrualEstimate({ acc, year, w, t }) {
  const [allMonths, setAllMonths] = useState(false);
  if (!acc || !acc.list.length || !acc.months.length) return <EmptyNote t={t}>No agency data for {year}</EmptyNote>;
  const months = allMonths ? acc.months : acc.months.slice(-4);
  const rowTotal = (g) => months.reduce((a,m)=>a+(g.cells[m]?.v||0),0);
  const phone = w<640;
  return (
    <div>
      <div style={{fontWeight:700,fontSize:14,color:t.ink,marginBottom:6}}>Accrual estimate {year}</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:10}}>
        <div style={{fontSize:12,color:t.muted,maxWidth:"70ch",lineHeight:1.5}}>Actual amount per agency and program type. Empty months are <em>estimated</em> (italic) with the average of filled months. Not accrued: SALARYUUCK, THR, INCENTIVE MEUGANG. Excludes ADHITAMA MITRA NUSANTARA.</div>
        {acc.months.length>4&&<Chip t={t} active={allMonths} onClick={()=>setAllMonths(v=>!v)}>{allMonths?"Last 4 months":`All ${acc.months.length} months`}</Chip>}
      </div>
      <div style={{maxHeight:460,overflow:"auto",border:`1px solid ${t.line}`,borderRadius:10}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:phone?Math.max(480,220+months.length*110):undefined}}>
          <thead><tr>
            <th style={thS(t,true)}>Agency · Program</th>
            {months.map(m=><th key={m} style={thS(t)}>{ymLabel(m)}</th>)}
            <th style={thS(t)}>Total</th>
          </tr></thead>
          <tbody>{acc.list.map((g,i)=>(
            <tr key={g.agency+"\x00"+g.prog} style={{background:i%2===1?t.rowStripe:"transparent"}}>
              <td style={{...tdS(t,true),maxWidth:280}} title={`${g.agency} · ${g.prog}`}><strong style={{color:t.ink}}>{g.agency}</strong><span style={{color:t.muted}}> · {g.prog}</span>{g.noAccrue&&<span style={{marginLeft:6,fontFamily:MONO,fontSize:9,color:t.muted}}>(no accrual)</span>}</td>
              {months.map(m=>{ const c=g.cells[m]; return <td key={m} style={{...tdS(t),fontFamily:MONO,fontStyle:c?.est?"italic":"normal",color:c?.est?t.muted:t.ink2}}>{c?fmtRpFull(c.v):"—"}</td>; })}
              <td style={{...tdS(t),fontFamily:MONO,fontWeight:700,color:t.ink}}>{fmtRpFull(rowTotal(g))}</td>
            </tr>
          ))}</tbody>
          <tfoot><tr>
            {(()=>{ const ft={...tdS(t),background:"#1E2128",color:"#fff",fontFamily:MONO,fontWeight:700,borderTop:`2px solid ${C.teal}`,position:"sticky",bottom:0}; return <>
              <td style={{...ft,textAlign:"left",fontFamily:"inherit",fontWeight:800}}>TOTAL</td>
              {months.map(m=><td key={m} style={ft} title={`Actual ${fmtRpFull(acc.tot[m].act)} · Estimated ${fmtRpFull(acc.tot[m].est)}`}>{fmtRpFull(acc.tot[m].act+acc.tot[m].est)}</td>)}
              <td style={ft}>{fmtRpFull(months.reduce((a,m)=>a+acc.tot[m].act+acc.tot[m].est,0))}</td>
            </>; })()}
          </tr></tfoot>
        </table>
      </div>
    </div>
  );
}

/* ── Monthly: tren + heatmap + ringkasan per bulan (≤ 6 kolom) ── */
function MonthlyTab(props) {
  const { t, w, filtAgg, grand, sortedMonths, collapsed, setCollapsed, tblSort, setTblSort, trendSeries, heatData, heatMetric, setHeatMetric, exportSummary, isAg } = props;
  const phone = w<640;
  const series = useMemo(()=>trendSeries.map(s=>({...s,month:fmtMonthYear(s.month)})),[trendSeries]);
  const allExpanded = sortedMonths.length>0 && sortedMonths.every(m=>!collapsed[m]);
  const toggleAll = () => { const next={}; if(allExpanded) sortedMonths.forEach(m=>{next[m]=true;}); setCollapsed(next); };
  const byMonth = useMemo(()=>{ const m={}; filtAgg.forEach(r=>{ (m[r.month]=m[r.month]||[]).push(r); }); return m; },[filtAgg]);
  const pcell = (v,n) => n?<PctBadge val={pct(v,n)} t={t}/>:"—";
  return (
    <div style={{padding:18}}>
      <div style={{display:"grid",gridTemplateColumns:w>=1000?"1fr 1fr":"1fr",gap:14,marginBottom:16}}>
        <div>
          <div style={{fontWeight:700,fontSize:13,color:t.ink,marginBottom:8}}>% Invoiced &amp; % Cleared per month</div>
          <BarChart series={series} t={t}/>
          <div style={{display:"flex",gap:14,justifyContent:"center",marginTop:6,fontSize:11.5,color:t.ink}}>
            <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:10,height:10,background:C.yellow,borderRadius:3}}/>% Invoice</span>
            <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:10,height:10,background:C.teal,borderRadius:3}}/>% Cleared</span>
          </div>
        </div>
        <div style={{minWidth:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:8}}>
            <span style={{fontWeight:700,fontSize:13,color:t.ink}}>Month × {isAg?"Agency":"Partner Type"}</span>
            <div style={{display:"flex",gap:5}}>{[{k:"inv",l:"Invoice",ac:C.yellow,dark:true},{k:"clv",l:"CLV",ac:C.tealD},{k:"clr",l:"Cleared",ac:C.teal}].map(m=><HeatBtn key={m.k} m={m} active={heatMetric===m.k} onClick={()=>setHeatMetric(m.k)} t={t}/>)}</div>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{borderCollapse:"separate",borderSpacing:3,fontSize:12,width:"100%"}}>
              <thead><tr><th style={{fontFamily:MONO,fontSize:9.5,color:t.muted,textAlign:"left",padding:"4px 6px",fontWeight:500}}>MONTH</th>{heatData.ptypes.map(p=><th key={p} style={{fontFamily:MONO,fontSize:9.5,color:t.muted,padding:"4px 6px",fontWeight:500,whiteSpace:"nowrap"}}>{p}</th>)}</tr></thead>
              <tbody>{heatData.months.map(m=><tr key={m}><td style={{fontFamily:MONO,fontSize:11,fontWeight:600,color:t.ink,padding:"3px 6px",whiteSpace:"nowrap"}}>{fmtMonthYear(m)}</td>{heatData.ptypes.map(p=>{ const c=heatData.cells[m+"\x00"+p]; if(!c)return <td key={p}><div style={{borderRadius:8,padding:"9px 5px",textAlign:"center",background:t.surf3,color:t.muted2,fontFamily:MONO,fontSize:11}}>—</div></td>; const v=c[heatMetric]||0,pp=pct(v,c.n),bg=heatClr(pp),light=bg===C.yellow; return <td key={p} title={`${fmtMonthYear(m)} · ${p}: ${v}/${c.n} (${pp}%)`}><HeatCell bg={bg} light={light} pp={pp} v={v} n={c.n}/></td>; })}</tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:8}}>
        <span style={{fontWeight:700,fontSize:13,color:t.ink}}>Monthly summary <span style={{fontWeight:400,fontSize:12,color:t.muted}}>· click a month to expand</span></span>
        <div style={{display:"flex",gap:8}}>
          <Btn t={t} variant="ghost" sm onClick={toggleAll}>{allExpanded?"Collapse all":"Expand all"}</Btn>
          <Btn t={t} variant="outline" sm onClick={()=>exportSummary("csv")}>CSV</Btn>
          <Btn t={t} variant="primary" sm onClick={()=>exportSummary("xlsx")}>Excel</Btn>
        </div>
      </div>
      <div style={{overflowX:"auto",border:`1px solid ${t.line}`,borderRadius:10}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr>
            <SortTh col="month" left sort={tblSort} setSort={setTblSort} t={t}>Month / Group</SortTh>
            {!phone&&<th style={thS(t,true)}>Flow</th>}
            <th style={thS(t)}>Records</th>
            <th style={thS(t)}>% Invoice</th>
            {!phone&&<th style={thS(t)}>% CLV</th>}
            <th style={thS(t)}>% Cleared</th>
          </tr></thead>
          <tbody>
            {sortedMonths.map(m=>{
              const rows=byMonth[m]||[], mT=sumRows(rows), isCol=!!collapsed[m];
              return (
                <React.Fragment key={m}>
                  <tr {...kbd(()=>setCollapsed(c=>({...c,[m]:!c[m]})))} onClick={()=>setCollapsed(c=>({...c,[m]:!c[m]}))} aria-expanded={!isCol} style={{background:t.monthBg,cursor:"pointer"}}>
                    <td style={{...tdS(t,true),fontWeight:700,color:t.ink}}><span style={{display:"inline-block",width:14,color:t.muted,transform:isCol?"rotate(-90deg)":"none",transition:"transform .15s"}}>▼</span>{fmtMonthYear(m)}</td>
                    {!phone&&<td style={tdS(t,true)}/>}
                    <td style={{...tdS(t),fontFamily:MONO,fontWeight:700,color:t.ink}}>{mT.n.toLocaleString()}</td>
                    <td style={tdS(t)}>{pcell(mT.inv,mT.n)}</td>
                    {!phone&&<td style={tdS(t)}>{pcell(mT.clv,mT.n)}</td>}
                    <td style={tdS(t)}>{pcell(mT.clr,mT.n)}</td>
                  </tr>
                  {!isCol&&rows.map((r,j)=>(
                    <tr key={j}>
                      <td style={{...tdS(t,true),paddingLeft:28,maxWidth:phone?180:380}} title={`${entLabel(r.entity,props.flowSel)} · ${r.ptype} · ${r.prog}`}><strong style={{color:t.ink}}>{r.ptype||"—"}</strong><span style={{color:t.muted}}> · {r.prog||"—"}{r.entity?` · ${entLabel(r.entity,props.flowSel)}`:""}</span></td>
                      {!phone&&<td style={tdS(t,true)}><FlowBadge flow={r.flow} t={t}/></td>}
                      <td style={{...tdS(t),fontFamily:MONO}}>{r.n}</td>
                      <td style={tdS(t)}>{pcell(r.inv,r.n)}</td>
                      {!phone&&<td style={tdS(t)}>{pcell(r.clv,r.n)}</td>}
                      <td style={tdS(t)}>{pcell(r.clr,r.n)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
            {sortedMonths.length===0&&<tr><td colSpan={6}><EmptyNote t={t}>No data matches the current filters</EmptyNote></td></tr>}
          </tbody>
          <tfoot><tr>
            {(()=>{ const ft={...tdS(t),background:"#1E2128",color:"#fff",fontFamily:MONO,fontWeight:800,borderTop:`2px solid ${C.teal}`,position:"sticky",bottom:0}; const pf=(v)=><span style={{padding:"3px 10px",borderRadius:99,background:C.tealD}}>{pct(v,grand.n)}%</span>; return <>
              <td style={{...ft,textAlign:"left",fontFamily:"inherit"}}>TOTAL · {fmtRp(grand.amt)}</td>
              {!phone&&<td style={ft}/>}
              <td style={ft}>{grand.n.toLocaleString()}</td>
              <td style={ft}>{pf(grand.inv)}</td>
              {!phone&&<td style={ft}>{pf(grand.clv)}</td>}
              <td style={ft}>{pf(grand.clr)}</td>
            </>; })()}
          </tr></tfoot>
        </table>
      </div>
    </div>
  );
}

function RawTab(props) {
  const { t, w, filtRaw, curRaw, rawKeys, rawKeysAll, rawKeysMain, showAllCols, setShowAllCols,
    pageRaw, curRawPage, totalRawPages, rawSort, setRawSort, setRawPage, isLeftCol, fmtCellT, exportRaw, src, docs } = props;
  const isAg = src==="agency";
  const narrow = w<700;
  const hiddenCount = Math.max(0, rawKeysAll.length - rawKeysMain.length);

  return (
    <Card t={t} pad={false} style={{marginBottom:14}}>
      <CardHead title="Raw Data" accent={C.magenta}
        sub={`${filtRaw.length.toLocaleString()} records · showing ${rawKeys.length} ${showAllCols?"(all)":"primary"} columns`}
        t={t}
        right={
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {/* toggle: Primary columns vs All columns */}
            <div style={{display:"inline-flex",background:t.surf3,borderRadius:10,padding:3,gap:2,border:`1px solid ${t.line}`}}>
              <button onClick={()=>setShowAllCols(false)}
                style={{fontFamily:"inherit",fontSize:11.5,fontWeight:600,padding:"5px 11px",borderRadius:8,border:0,cursor:"pointer",transition:"all .15s",background:!showAllCols?C.teal:"transparent",color:!showAllCols?"#fff":t.muted}}>
                Primary columns
              </button>
              <button onClick={()=>setShowAllCols(true)}
                style={{fontFamily:"inherit",fontSize:11.5,fontWeight:600,padding:"5px 11px",borderRadius:8,border:0,cursor:"pointer",transition:"all .15s",background:showAllCols?C.teal:"transparent",color:showAllCols?"#fff":t.muted}}>
                All columns{hiddenCount>0?` (+${hiddenCount})`:""}
              </button>
            </div>
            <Btn t={t} variant="primary" sm onClick={exportRaw}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export Excel
            </Btn>
          </div>
        }/>

      {/* Info: export always includes all columns */}
      {!showAllCols&&(
        <div style={{padding:"7px 16px",fontSize:11,color:t.muted,background:t.infoBg,borderBottom:`1px solid ${t.infoBd}`,display:"flex",alignItems:"center",gap:7,lineHeight:1.4}}>
          <span style={{color:t.info,fontWeight:700,fontSize:13}}>ℹ</span>
          This view shows only the {rawKeysMain.length} primary columns. The Excel export always includes <strong>all columns</strong> as a complete backup.
        </div>
      )}
      {narrow&&(
        <div style={{padding:"7px 16px",fontFamily:MONO,fontSize:10,color:t.muted,background:t.surf2,borderBottom:`1px solid ${t.line}`,display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:13}}>↔</span> Scroll horizontally to view all columns
        </div>
      )}

      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5,minWidth:narrow?Math.max(720,rawKeys.length*110):undefined}}>
          <thead><tr>{rawKeys.map(k=><RawThCell key={k} k={k} rawSort={rawSort} setRawSort={setRawSort} setRawPage={setRawPage} isLeftCol={isLeftCol} t={t}/>)}{SHOW_DOCUMENT_TABS&&<th style={{position:"sticky",top:0,zIndex:2,fontFamily:MONO,fontSize:10,letterSpacing:"0.08em",textTransform:"uppercase",color:t.muted,fontWeight:500,background:t.surf2,padding:"9px",textAlign:"center",borderBottom:`1.5px solid ${t.line2}`,whiteSpace:"nowrap"}}>Documents</th>}</tr></thead>
          <tbody>
            {pageRaw.length===0
              ? <tr><td colSpan={rawKeys.length+(SHOW_DOCUMENT_TABS?1:0)} style={{padding:"28px",textAlign:"center",color:t.muted,fontFamily:MONO,fontSize:12}}>No records match the current filters</td></tr>
              : pageRaw.map((r,i)=><RawDataRow key={i} r={r} i={i} rawKeys={rawKeys} isLeftCol={isLeftCol} fmtCellT={fmtCellT} t={t} docs={docs} segment={src}/>)}
          </tbody>
        </table>
      </div>

      {totalRawPages>1&&(
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"12px 16px",borderTop:`1px solid ${t.line}`,background:t.surf2,flexWrap:"wrap"}}>
          <span style={{fontFamily:MONO,fontSize:11,color:t.muted}}>
            Page {curRawPage} of {totalRawPages} · {filtRaw.length.toLocaleString()} records
          </span>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <RawPageBtn label="‹ Prev" disabled={curRawPage<=1} onClick={()=>setRawPage(p=>Math.max(1,p-1))} t={t}/>
            {(()=>{
              const pages=[]; const tp=totalRawPages, cp=curRawPage;
              let start=Math.max(1,cp-2), end=Math.min(tp,start+4);
              start=Math.max(1,end-4);
              for(let p=start;p<=end;p++) pages.push(p);
              return pages.map(p=><RawPageBtn key={p} label={String(p)} active={p===cp} onClick={()=>setRawPage(p)} t={t}/>);
            })()}
            <RawPageBtn label="Next ›" disabled={curRawPage>=totalRawPages} onClick={()=>setRawPage(p=>Math.min(totalRawPages,p+1))} t={t}/>
          </div>
        </div>
      )}
    </Card>
  );
}

function RawPageBtn({ label, active, disabled, onClick, t }) {
  const [hov,hE]=useHover();
  return (
    <button {...hE} onClick={onClick} disabled={disabled}
      style={{
        fontFamily:MONO, fontSize:11, fontWeight:active?700:500,
        padding:"5px 11px", borderRadius:8,
        border:`1px solid ${active?C.teal:hov&&!disabled?C.tealD:t.line2}`,
        background:active?C.teal:hov&&!disabled?t.surf3:t.surf,
        color:active?"#fff":disabled?t.muted2:t.ink,
        cursor:disabled?"default":"pointer", opacity:disabled?.45:1,
        transition:"all .15s", minWidth:32,
      }}>{label}</button>
  );
}