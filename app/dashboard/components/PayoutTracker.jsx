"use client";

/*
  PayoutTracker.jsx — v5.2-EN (Full English Localization)
  ─────────────────────────────────────────────────────────────────────

  ─────────────────────────────────────────────────────────────────────
*/

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import supabase from "../../../lib/supabase";

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

const SLA_P = [
  { key:"reva_po",   label:"Reva → PO",                sla:2, from:["reva date","reva"],                 to:["po date","po number"] },
  { key:"po_surat",  label:"PO → Payment Letter",       sla:1, from:["po date"],                         to:["surat pemberitahuan date","surat pemberitahuan","surat"] },
  { key:"surat_inv", label:"Payment Letter → Invoice",  sla:2, from:["surat pemberitahuan date","surat"], to:["invoice submission","invoice"] },
  { key:"inv_clv",   label:"Invoice → CLV",             sla:2, from:["invoice submission","invoice"],     to:["clv date","clv"] },
  { key:"clv_clear", label:"CLV → Bank Clearing",       sla:3, from:["clv date","clv"],                   to:["clearing date","clearing"] },
];
const SLA_A = [
  { key:"req_po",    label:"Req → PO",                  sla:2, from:["req date","reva date"],             to:["po date","po number"] },
  { key:"po_inv",    label:"PO → Invoice",               sla:2, from:["po date"],                         to:["invoice submission","invoice"] },
  { key:"inv_clv",   label:"Invoice → CLV",              sla:2, from:["invoice submission","invoice"],    to:["clv date","clv"] },
  { key:"clv_clear", label:"CLV → Bank Clearing",        sla:3, from:["clv date","clv"],                  to:["clearing date","clearing"] },
];

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

function daysBetween(a, b) {
  const d1=toDate(a), d2=toDate(b);
  if (!d1||!d2) return null;
  return Math.round((d2-d1)/86400000);
}

function findCol(row, hints) {
  if (!row) return null;
  const ks = Object.keys(row);
  for (const h of hints) {
    const hh = h.toLowerCase().replace(/\s+/g," ").trim();
    for (const k of ks) if (k.toLowerCase().replace(/\s+/g," ").trim()===hh) return k;
  }
  for (const h of hints) {
    const hh = h.toLowerCase().replace(/\s+/g," ").trim();
    for (const k of ks) if (k.toLowerCase().replace(/\s+/g," ").trim().includes(hh)) return k;
  }
  return null;
}

const gcell = (row,hints,fb="") => { const k=findCol(row,hints); return k&&row[k]!=null ? row[k] : fb; };
const gnum  = (row,hints)       => { const v=gcell(row,hints,0); if(typeof v==="number")return v; const n=parseFloat(String(v).replace(/[^\d.-]/g,"")); return isNaN(n)?0:n; };
const gstr  = (row,hints)       => String(gcell(row,hints,"")||"").trim();
const pct   = (a,b)             => b ? Math.round((a/b)*100) : 0;

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
    if (!month) return;
    const key = [month,entity,ptype,prog].join("\x00");
    if (!groups[key]) groups[key]={ month,entity,ptype,prog,src,n:0,po:0,surat:0,inv:0,clv:0,clr:0,amt:0 };
    const g = groups[key];
    g.n++;
    if (gcell(r,["po number","po #","no po","po date"])) g.po++;
    if (!ag && gcell(r,["surat pemberitahuan date","surat pemberitahuan","surat"])) g.surat++;
    if (gcell(r,["invoice submission","invoice"])) g.inv++;
    if (gcell(r,["clv date","clv"])) g.clv++;
    if (gcell(r,["clearing date","clearing"])) g.clr++;
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
  if (regionFilter && src !== "agency") {
    const targetRegion = regionFilter.toUpperCase().trim();
    result = result.filter(r => {
      const rowRegion = getRegionFromRow(r);
      if (rowRegion) return rowRegion === targetRegion;
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
    await supabase.from("payout_data").delete().gt("id",0);
    const { error } = await supabase.from("payout_data").insert({
      file_name:payload.fileName, row_count:payload.rowCount,
      published_at:payload.publishedAt, raw_data:payload.rows, mode:"raw",
    });
    if (error) throw error;
    return true;
  } catch (e) { console.error(e); return false; }
}

async function dbLoad() {
  try {
    const { data, error } = await supabase.from("payout_data")
      .select("*").order("created_at",{ascending:false}).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { fileName:data.file_name||"", rowCount:data.row_count||0, publishedAt:data.published_at||"", rows:data.raw_data||[] };
  } catch (e) { console.error(e); return null; }
}

async function dbDelete() {
  try { const { error } = await supabase.from("payout_data").delete().gt("id",0); return !error; }
  catch { return false; }
}

async function readXLSX(file, src) {
  const XLSX = await getXLSX();
  return new Promise((resolve,reject)=>{
    const rd = new FileReader();
    rd.onload = e => {
      try {
        const wb  = XLSX.read(e.target.result,{type:"array",cellDates:true});
        let sn    = wb.SheetNames[0];
        const ms  = wb.SheetNames.find(n=>n.toLowerCase().includes(src));
        if (ms) sn = ms;
        const ws  = wb.Sheets[sn];
        const arr = XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
        const hints = src==="agency"
          ? ["agency name","program type","#req","amount","po number","status"]
          : ["partner name","program type","#req","amount","po number","status","reva date"];
        let hdr = 0;
        for (let i=0;i<Math.min(arr.length,12);i++) {
          const row = arr[i].map(c=>String(c).toLowerCase()).join(" ");
          if (hints.filter(h=>row.includes(h)).length>=2) { hdr=i; break; }
        }
        const rawRows = XLSX.utils.sheet_to_json(ws,{defval:null,range:hdr});
        const processed = rawRows.map(row=>{
          const clean={};
          Object.keys(row).forEach(k=>{
            const v=row[k];
            clean[k.trim()] = v instanceof Date ? (isNaN(v)?null:v.toISOString()) : v;
          });
          clean._source=src;
          return clean;
        });
        resolve(processed);
      } catch(err) { reject(err); }
    };
    rd.onerror = ()=>reject(new Error("File could not be read"));
    rd.readAsArrayBuffer(file);
  });
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

function useWidth() {
  const [w, setW] = useState(typeof window!=="undefined"?window.innerWidth:1200);
  useEffect(()=>{
    const fn = ()=>setW(window.innerWidth);
    window.addEventListener("resize",fn,{passive:true});
    return ()=>window.removeEventListener("resize",fn);
  },[]);
  return w;
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

function MsOption({o,checked,onToggle,t}) {
  const [hov,hE]=useHover();
  return (
    <label {...hE} style={{display:"flex",alignItems:"center",gap:9,padding:"7px 12px",cursor:"pointer",background:hov?t.surf3:checked?`${C.teal}10`:"transparent",borderTop:`1px solid ${t.line}`,transition:"background .1s"}}>
      <input type="checkbox" checked={checked} onChange={onToggle} style={{width:14,height:14,accentColor:C.teal,cursor:"pointer",flexShrink:0,margin:0}}/>
      <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:12.5,fontWeight:checked?600:400,color:t.ink}}>{o}</span>
      {checked&&<span style={{color:C.teal,fontSize:11,fontWeight:700,flexShrink:0}}>✓</span>}
    </label>
  );
}

function MultiSel({ values, options, onChange, placeholder, t }) {
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
  const label=!active?placeholder:values.length<=2?values.join(", "):`${values.length} selected`;
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
              : options.map(o=><MsOption key={o} o={o} checked={values.includes(o)} onToggle={()=>toggle(o)} t={t}/>)}
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

function DonutChart({ pieces, t, size=144 }) {
  if (!pieces.length) return null;
  const total = pieces.reduce((a,b)=>a+b.v,0);
  const cx=size/2, cy=size/2, R=size/2-7, r2=R*0.75;
  let ang = -Math.PI/2;
  const paths = pieces.map((p,i)=>{
    const sh=p.v/total, nx=ang+sh*2*Math.PI, lg=sh>0.5?1:0;
    const x1=cx+R*Math.cos(ang),y1=cy+R*Math.sin(ang);
    const x2=cx+R*Math.cos(nx), y2=cy+R*Math.sin(nx);
    const x3=cx+r2*Math.cos(nx),y3=cy+r2*Math.sin(nx);
    const x4=cx+r2*Math.cos(ang),y4=cy+r2*Math.sin(ang);
    ang=nx;
    return <path key={i} d={`M${x1},${y1} A${R},${R} 0 ${lg} 1 ${x2},${y2} L${x3},${y3} A${r2},${r2} 0 ${lg} 0 ${x4},${y4} Z`} fill={p.color} stroke={t.surf} strokeWidth="2"><title>{p.label}: {p.v.toLocaleString()}</title></path>;
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{display:"block",margin:"0 auto",flexShrink:0}}>
      {paths}
      <text x={cx} y={cy+2} textAnchor="middle" fontSize={size*0.16} fontWeight="800" fill={t.ink} fontFamily="inherit">{total.toLocaleString()}</text>
      <text x={cx} y={cy+18} textAnchor="middle" fontSize={9} fill={t.muted} fontFamily={MONO}>TOTAL</text>
    </svg>
  );
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

  const filterMpxType = filterType || null;

  const [screen, setScreen]          = useState("loading");
  const [src, setSrc]                = useState("partner");
  const [activeTab, setActiveTab]    = useState("dash");
  const [heatMetric, setHeatMetric]  = useState("clr");
  const [loading, setLoading]        = useState(false);
  const [loadText, setLoadText]      = useState("Loading…");
  const [toast, setToast]            = useState({ msg:"", type:"", show:false });
  const [allRaw, setAllRaw]          = useState([]);
  const [pubMeta, setPubMeta]        = useState(null);
  const [adminPartnerRaw, setAdminPartnerRaw] = useState([]);
  const [adminAgencyRaw,  setAdminAgencyRaw]  = useState([]);
  const [partnerFile, setPartnerFile] = useState("");
  const [agencyFile,  setAgencyFile]  = useState("");

  const [showAllCols, setShowAllCols] = useState(false);

  const { partnerRaw, agencyRaw } = useMemo(() => {
    const pAll = allRaw.filter(r => r._source === "partner" || !r._source);
    const aAll = allRaw.filter(r => r._source === "agency");
    const pR = applySidebarFilter(pAll, partnerName, filterMpxType, regionFilter, masterData, "partner");
    const aR = applySidebarFilter(aAll, null, null, null, null, "agency");
    return { partnerRaw: pR, agencyRaw: aR };
  }, [allRaw, partnerName, filterMpxType, regionFilter, masterData]);

  const { partnerAgg, agencyAgg } = useMemo(() => {
    const { agg: pAgg } = parseRows(partnerRaw, "partner");
    const { agg: aAgg } = parseRows(agencyRaw, "agency");
    return { partnerAgg: pAgg, agencyAgg: aAgg };
  }, [partnerRaw, agencyRaw]);

  const [filters, setFilters]         = useState({ month:[], entity:[], ptype:[], prog:[], status:[], q:"" });
  const [searchInput, setSearchInput] = useState("");
  const [tblSort, setTblSort]         = useState({ col:"month", dir:"desc" });
  const [rawSort, setRawSort]         = useState({ col:null, dir:"asc" });
  const [rawPage, setRawPage]         = useState(1);
  const [rawPageSize]                 = useState(100);
  const [collapsed, setCollapsed]     = useState({});
  const [dragOver, setDragOver]       = useState({ partner:false, agency:false });
  const [searchFocus, setSearchFocus] = useState(false);
  const [searchIdx, setSearchIdx]     = useState(-1);
  const searchRef                     = useRef(null);
  const [funnelExp, setFunnelExp]     = useState(null);
  const [donutExp, setDonutExp]       = useState(null);
  const [bnExp, setBnExp]             = useState(null);
  const [tpExp, setTpExp]             = useState(null);
  const realtimeCh = useRef(null);
  const toastTmr   = useRef(null);

  const isAg   = src === "agency";
  const curRaw = isAg ? agencyRaw  : partnerRaw;
  const curAgg = isAg ? agencyAgg  : partnerAgg;
  const slaSet = isAg ? SLA_A : SLA_P;

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
      const cached = getCache();
      if (cached?.rows?.length) {
        ingestCloud(cached); setScreen(isSPM?"admin":"dashboard"); setLoading(false);
      } else {
        startLoad("Loading data…");
        const saved = await dbLoad(); stopLoad();
        if (isSPM) { if (saved?.rows?.length) { setCache(saved); ingestCloud(saved); } setScreen("admin"); }
        else { if (!saved?.rows?.length) { setScreen("empty"); return; } setCache(saved); ingestCloud(saved); setScreen("dashboard"); }
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

  async function handleFile(file, s) {
    if (!file) return;
    try {
      const rows = await readXLSX(file, s);
      if (s==="partner") { setAdminPartnerRaw(rows); setPartnerFile(file.name); }
      else               { setAdminAgencyRaw(rows);  setAgencyFile(file.name); }
      showToast(`${s==="partner"?"Partner":"Agency"} file read: ${rows.length.toLocaleString()} rows`,"success");
    } catch(e) { showToast("Failed to read file: "+e.message,"error"); }
  }

  async function publish() {
    const total = adminPartnerRaw.length + adminAgencyRaw.length;
    if (!total) { showToast("Please upload a file first","error"); return; }
    const merged = [...adminPartnerRaw.map(r=>({...r,_source:"partner"})),...adminAgencyRaw.map(r=>({...r,_source:"agency"}))];
    const ts = new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
    const fnames = [partnerFile,agencyFile].filter(Boolean).join(", ")||"Data";
    startLoad("Uploading to cloud…");
    const ok = await dbSave({ fileName:fnames, rowCount:merged.length, publishedAt:ts, rows:merged });
    stopLoad();
    if (ok) { const meta={fileName:fnames,rowCount:merged.length,publishedAt:ts}; setPubMeta(meta); setCache({...meta,rows:merged}); setAllRaw(merged); showToast("✓ Published — all viewers auto-updated","success"); }
    else showToast("Failed to save to cloud","error");
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
      statuses: unique(curRaw.map(r=>gstr(r,["status","payment status"]))).sort(),
    };
  },[curAgg,curRaw]);

  const { filtAgg, filtRaw } = useMemo(()=>{
    const { month,entity,ptype,prog,status,q } = filters;
    const ql = q.toLowerCase().trim();
    const toArr = v => Array.isArray(v) ? v : (v ? [v] : []);
    const monthSel=toArr(month), entSel=toArr(entity), ptypeSel=toArr(ptype), progSel=toArr(prog), statusSel=toArr(status);
    let agg = curAgg.filter(r=>
      (monthSel.length===0||monthSel.includes(r.month))&&
      (entSel.length===0||entSel.includes(r.entity))&&
      (ptypeSel.length===0||ptypeSel.includes(r.ptype))&&
      (progSel.length===0||progSel.includes(r.prog))
    );
    let raw = curRaw.filter(r=>{
      if (monthSel.length>0 && !monthSel.includes(gstr(r,["program date","month"]))) return false;
      if (entSel.length>0   && !entSel.includes(gstr(r,["entity"]))) return false;
      if (ptypeSel.length>0 && !ptypeSel.includes(gstr(r,["partner type","agency name"]))) return false;
      if (progSel.length>0  && !progSel.includes(gstr(r,["program type"]))) return false;
      if (statusSel.length>0 && !statusSel.includes(gstr(r,["status","payment status"]))) return false;
      if (ql) { const blob=[gstr(r,["partner name","agency name"]),gstr(r,["project title"]),gstr(r,["po number","po #"]),gstr(r,["#req id"])].join(" ").toLowerCase(); if (!blob.includes(ql)) return false; }
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
    if (isAg) return [{key:"po",label:"PO Issued",val:g.po,color:C.tealDp},{key:"inv",label:"Invoice Submitted",val:g.inv,color:C.teal},{key:"clv",label:"CLV",val:g.clv,color:C.yellow},{key:"clr",label:"Bank Cleared",val:g.clr,color:C.yellowD}];
    return [{key:"po",label:"PO Issued",val:g.po,color:C.tealDp},{key:"surat",label:"Payment Letter",val:g.surat,color:C.tealD},{key:"inv",label:"Invoice Submitted",val:g.inv,color:C.teal},{key:"clv",label:"CLV",val:g.clv,color:C.yellow},{key:"clr",label:"Bank Cleared",val:g.clr,color:C.yellowD}];
  },[grand,isAg]);

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
      filtRaw.forEach(r=>{ const d=daysBetween(gcell(r,p.from),gcell(r,p.to)); if(d==null||d<0)return; details.push({days:d,po:gstr(r,["po number","po #"]),name:gstr(r,["partner name","agency name"]),title:gstr(r,["project title"])||"—",month:gstr(r,["program date","month"]),amt:gnum(r,["amount"])}); });
      const ds=details.map(d=>d.days);
      return {...p,avg:ds.length?ds.reduce((a,b)=>a+b,0)/ds.length:0,n:ds.length,details:details.sort((a,b)=>b.days-a.days)};
    });
  },[filtRaw,slaSet]);

  const topPartners = useMemo(()=>{
    if (!filtRaw.length) return [];
    const agg={};
    filtRaw.forEach(r=>{ const n=gstr(r,["partner name","agency name"]); if(!n)return; if(!agg[n])agg[n]={name:n,amt:0,n:0,clr:0,progs:[]}; agg[n].amt+=gnum(r,["amount"]); agg[n].n++; if(gcell(r,["clearing date","clearing"]))agg[n].clr++; agg[n].progs.push({po:gstr(r,["po number"]),title:gstr(r,["project title"])||"—",month:gstr(r,["program date","month"]),amt:gnum(r,["amount"]),cleared:!!gcell(r,["clearing date","clearing"])}); });
    return Object.values(agg).sort((a,b)=>b.amt-a.amt).slice(0,10);
  },[filtRaw]);

  const donutPieces = useMemo(()=>{
    const cm={"PAID H+3":C.teal,"Payment Process":C.tealD,"Invoice Not Submitted":C.yellow,"Awaiting Inv Submission":C.yellowD,"On Process Payment":C.magenta,"Unknown":C.grey};
    const cnt={};
    filtRaw.forEach(r=>{ const s=gstr(r,["status","payment status"])||"Unknown"; cnt[s]=(cnt[s]||0)+1; });
    return Object.entries(cnt).map(([label,v])=>({label,v,color:cm[label]||C.pink}));
  },[filtRaw]);

  const heatData = useMemo(()=>{
    const months=unique(filtAgg.map(r=>r.month)).sort((a,b)=>monthKey(b)-monthKey(a));
    const ptypes=unique(filtAgg.map(r=>r.ptype)).filter(Boolean).sort();
    const cells={};
    filtAgg.forEach(r=>{ const k=r.month+"\x00"+r.ptype; if(!cells[k])cells[k]={n:0,inv:0,clv:0,clr:0}; const c=cells[k]; c.n+=r.n; c.inv+=r.inv; c.clv+=r.clv; c.clr+=r.clr; });
    return { months, ptypes, cells };
  },[filtAgg]);

  const sortedMonths = useMemo(()=>unique(filtAgg.map(r=>r.month)).sort((a,b)=>{ const d=monthKey(a)-monthKey(b); return tblSort.dir==="asc"?d:-d; }),[filtAgg,tblSort]);

  async function exportSummary(fmt) {
    if (!filtAgg.length) { showToast("No data available","error"); return; }
    const stamp=new Date().toISOString().slice(0,10), pref=isAg?"agency":"partner";
    if (fmt==="xlsx") {
      const XLSX=await getXLSX();
      const wb=XLSX.utils.book_new();
      const ws=XLSX.utils.json_to_sheet(filtAgg.map(r=>({"Program Date":fmtMonthYear(r.month),"Entity":r.entity,"Partner/Agency Type":r.ptype,"Program Type":r.prog,"#Records":r.n,"PO":r.po,"Payment Letter":r.surat,"Invoice":r.inv,"CLV":r.clv,"Clearing":r.clr,"% Invoice":r.n?+(r.inv/r.n*100).toFixed(1):0,"% CLV":r.n?+(r.clv/r.n*100).toFixed(1):0,"% Clearing":r.n?+(r.clr/r.n*100).toFixed(1):0})));
      XLSX.utils.book_append_sheet(wb,ws,"Summary"); XLSX.writeFile(wb,`${pref}_summary_${stamp}.xlsx`);
      showToast("Filtered summary downloaded — Excel","success");
    } else {
      const hdr="Program Date,Entity,Partner Type,Program Type,#Rec,PO,Payment Letter,Invoice,CLV,Clearing,% Invoice,% CLV,% Clearing";
      const body=filtAgg.map(r=>[fmtMonthYear(r.month),r.entity,r.ptype,r.prog,r.n,r.po,r.surat,r.inv,r.clv,r.clr,r.n?+(r.inv/r.n*100).toFixed(1):0,r.n?+(r.clv/r.n*100).toFixed(1):0,r.n?+(r.clr/r.n*100).toFixed(1):0].join(",")).join("\n");
      const a=document.createElement("a"); a.href="data:text/csv;charset=utf-8,\uFEFF"+encodeURIComponent(hdr+"\n"+body); a.download=`${pref}_${stamp}.csv`; a.click();
      showToast("Filtered summary downloaded — CSV","success");
    }
  }

  async function exportRaw() {
    if (!filtRaw.length) { showToast("No data available","error"); return; }
    const XLSX=await getXLSX();
    const allKeys=Object.keys(filtRaw[0]).filter(k=>k!=="_source");
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
    if (isIOHRegional && src==="agency") setSrc("partner");
    if (!isSPM && !isIOHAny && src==="agency") setSrc("partner");
  },[isSPM,isIOHAny,isIOHRegional,src]);

  useEffect(()=>{
    const canAgency = isSPM || (isIOHAny && !isIOHRegional);
    if (partnerRaw.length===0 && agencyRaw.length>0 && canAgency) setSrc("agency");
    else if (agencyRaw.length===0 && partnerRaw.length>0) setSrc("partner");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[partnerRaw.length, agencyRaw.length, isSPM, isIOHAny, isIOHRegional]);

  const searchSuggestions = useMemo(()=>{
    const q=(searchInput||"").toLowerCase().trim();
    if (!q||q.length<2||!curRaw.length) return {partners:[],pos:[],projects:[]};
    const pCnt={},poCnt={},prCnt={};
    curRaw.forEach(r=>{ const n=gstr(r,["partner name","agency name"]); if(n)pCnt[n]=(pCnt[n]||0)+1; const po=gstr(r,["po number","po #"]); if(po)poCnt[po]=(poCnt[po]||0)+1; const pr=gstr(r,["project title"]); if(pr)prCnt[pr]=(prCnt[pr]||0)+1; });
    return {
      partners:Object.entries(pCnt).filter(([k])=>k.toLowerCase().includes(q)).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>({label:k,count:v,type:"partner"})),
      pos:     Object.entries(poCnt).filter(([k])=>k.toLowerCase().includes(q)).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>({label:k,count:v,type:"po"})),
      projects:Object.entries(prCnt).filter(([k])=>k.toLowerCase().includes(q)).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>({label:k,count:v,type:"project"})),
    };
  },[searchInput,curRaw]);

  const allSuggestions = useMemo(()=>[...searchSuggestions.partners,...searchSuggestions.pos,...searchSuggestions.projects],[searchSuggestions]);
  useEffect(()=>{ if(filters.q==="") setSearchInput(""); },[filters.q]);
  useEffect(()=>{ setRawPage(1); },[filters]);

  const MAIN_RAW_GROUPS = [
    ["Program Date","program date","month","Month","bulan","Bulan","Periode"],
    ["Partner Type","partner type","partnertype","partner_type","PartnerType","Agency Name","agency name"],
    ["Project Title","project title","ProjectTitle"],
    ["Partner Name","partner name","partner_name","partnerName","Agency Name","agency name"],
    ["Amount","amount","Nilai","nilai"],
    ["PO Number","po number","PO #","po #","No PO","no po"],
    ["Invoice Submission","invoice submission","Invoice","invoice"],
    ["Clearing Bank","clearing date","Clearing Date","clearing","Clearing","Cleared Bank","cleared bank"],
    ["Estimation Date","estimation date","Estimasi","estimasi"],
    ["Status","status","Payment Status","payment status"],
  ];

  const RAW_COL_ORDER = ["Program Date","program date","Entity","entity","Partner Type","partner type","partnertype","partner_type","Project Title","project title","#Req ID","#req id","req id","Partner Name","partner name","partner_name","Amount","amount","PO Number","po number","PO #","po #","Reva Date","reva date","PO Date","po date","Surat Pemberitahuan Date","surat pemberitahuan date","surat pemberitahuan","Invoice Submission","invoice submission","invoice","CLV Date","clv date","clv","Estimation Date","estimation date","Status","status","Payment Status","payment status"];

  const rawKeysAll = useMemo(()=>{
    if (!curRaw.length) return [];
    const allKeys=Object.keys(curRaw[0]).filter(k=>k!=="_source");
    const seen=new Set(), ordered=[];
    for (const p of RAW_COL_ORDER) { const f=allKeys.find(k=>k.toLowerCase().trim()===p.toLowerCase().trim()); if(f&&!seen.has(f)){ordered.push(f);seen.add(f);} }
    for (const k of allKeys) { if(!seen.has(k))ordered.push(k); }
    return ordered;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[curRaw]);

  const rawKeysMain = useMemo(()=>{
    if (!curRaw.length) return [];
    const allKeys=Object.keys(curRaw[0]).filter(k=>k!=="_source");
    const norm = s => s.toLowerCase().replace(/\s+/g," ").trim();
    const seen=new Set(), ordered=[];
    for (const group of MAIN_RAW_GROUPS) {
      let found=null;
      for (const cand of group) { const f=allKeys.find(k=>norm(k)===norm(cand)); if(f){found=f;break;} }
      if(!found) for (const cand of group) { const f=allKeys.find(k=>norm(k).includes(norm(cand))); if(f){found=f;break;} }
      if(found && !seen.has(found)){ ordered.push(found); seen.add(found); }
    }
    return ordered;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[curRaw]);

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
    if (kl==="status"||kl==="paymentstatus") return <StatusBadge val={String(val)} t={t}/>;
    if (kl==="amount"||kl.includes("amount")) { const n=typeof val==="number"?val:parseFloat(String(val).replace(/[^\d.-]/g,"")); if(!isNaN(n)&&n!==0)return <span style={{fontFamily:MONO,fontSize:11.5,textAlign:"right",display:"block",color:t.ink}}>{fmtMoney(n,false)}</span>; }
    return String(val);
  };

  const sharedProps = {
    isSPM,isIOHAny,isIOHRegional,profile,
    partnerName,filterMpxType,regionFilter,
    screen,setScreen,loading,loadText,toast,
    partnerRaw:adminPartnerRaw,agencyRaw:adminAgencyRaw,
    viewPartnerRaw:partnerRaw, viewAgencyRaw:agencyRaw,
    partnerFile,agencyFile,setPartnerRaw:setAdminPartnerRaw,setAgencyRaw:setAdminAgencyRaw,
    setPartnerFile,setAgencyFile,pubMeta,
    filters,setFilters,opts,tblSort,setTblSort,rawSort,setRawSort,
    rawPage,setRawPage,rawPageSize,collapsed,setCollapsed,
    dragOver,setDragOver,searchFocus,setSearchFocus,searchIdx,setSearchIdx,
    searchRef,searchSuggestions,allSuggestions,searchInput,setSearchInput,
    funnelExp,setFunnelExp,donutExp,setDonutExp,bnExp,setBnExp,tpExp,setTpExp,
    src,setSrc,activeTab,setActiveTab,heatMetric,setHeatMetric,
    curRaw,curAgg,filtAgg,filtRaw,grand,grandPartnerCount,
    funnelStages,trendSeries,donutPieces,heatData,bnResults,topPartners,sortedMonths,
    rawKeys,rawKeysAll,rawKeysMain,showAllCols,setShowAllCols,
    pageRaw,curRawPage,totalRawPages,fmtCellT,isLeftCol,
    handleFile,publish,viewDash,clearData,exportSummary,exportRaw,showToast,
  };

  return <ThemeWrapper themeProp={theme} {...sharedProps}/>;
}

function ThemeWrapper(props) {
  const t = useTheme(props.themeProp);
  useKeyframes();
  const { loading, loadText, toast, screen } = props;
  const toastBg    = toast.type==="success"?t.goodBg :toast.type==="error"?t.badBg :t.surf;
  const toastColor = toast.type==="success"?t.goodDark:toast.type==="error"?t.badDark:t.ink;
  const toastBd    = toast.type==="success"?t.goodBd :toast.type==="error"?t.badBd :t.line;
  return (
    <div style={{fontFamily:"-apple-system,'DM Sans','Plus Jakarta Sans',BlinkMacSystemFont,'SF Pro Text',sans-serif",fontSize:14,lineHeight:1.45,color:t.ink,WebkitFontSmoothing:"antialiased",minHeight:"100%",background:"transparent"}}>
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
  );
}

function AdminScreen({ t, pubMeta, partnerFile, agencyFile, partnerRaw, agencyRaw, setPartnerRaw, setAgencyRaw, setPartnerFile, setAgencyFile, dragOver, setDragOver, handleFile, publish, viewDash, clearData }) {
  const w = useWidth();
  const [confirmDel, setConfirmDel] = useState(false);
  return (
    <div style={{maxWidth:1200,margin:"0 auto",padding:w<480?"18px 14px 44px":w<768?"20px 16px 48px":"24px 20px 56px"}}>
      <div style={{marginBottom:28}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          <span style={{fontFamily:MONO,fontSize:10,letterSpacing:"0.18em",textTransform:"uppercase",color:t.muted}}>Admin · Payout Tracker</span>
          <span style={{width:5,height:5,borderRadius:"50%",background:C.teal,display:"inline-block"}}/>
          <span style={{fontFamily:MONO,fontSize:10,color:C.teal,letterSpacing:"0.1em"}}>Realtime</span>
        </div>
        <h1 style={{fontWeight:800,fontSize:"clamp(1.8rem,4vw,2.8rem)",letterSpacing:"-0.03em",color:t.ink,margin:"0 0 8px",lineHeight:1.05}}>Upload &amp; Publish Data</h1>
        <p style={{color:t.muted,fontSize:14,maxWidth:"52ch",lineHeight:1.65,margin:0}}>Upload Partner Prepaid &amp; Agency Prepaid files, then publish. All viewers update automatically via realtime sync.</p>
        <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}>
          {[{l:"Partner SLA 2/1/2/2/3 WD (Working Days)",c:C.teal},{l:"Agency SLA 2/2/2/3 WD (Working Days)",c:C.magenta}].map((b,i)=>(
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
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:14,marginBottom:16}}>
        {["partner","agency"].map(s=>{
          const fname=s==="partner"?partnerFile:agencyFile, rws=s==="partner"?partnerRaw:agencyRaw, ac=s==="partner"?C.teal:C.magenta, drag=dragOver[s];
          return (
            <div key={s}
              style={{background:drag?`${ac}12`:fname?t.goodBg:t.surf,border:`2px dashed ${drag?ac:fname?t.goodBd:t.line2}`,borderRadius:18,padding:w<480?"26px 18px 22px":"32px 24px 26px",textAlign:"center",cursor:"pointer",position:"relative",transition:"all .18s",boxShadow:t.shadow1}}
              onDrop={e=>{e.preventDefault();setDragOver(d=>({...d,[s]:false}));handleFile(e.dataTransfer.files[0],s);}}
              onDragOver={e=>{e.preventDefault();setDragOver(d=>({...d,[s]:true}));}}
              onDragLeave={()=>setDragOver(d=>({...d,[s]:false}))}
              onClick={()=>document.getElementById(`pt-f-${s}`).click()}
              {...kbd(()=>document.getElementById(`pt-f-${s}`).click())}>
              <span style={{position:"absolute",top:14,left:14,display:"inline-flex",padding:"3px 10px",borderRadius:99,background:`${ac}18`,color:ac,border:`1px solid ${ac}40`,fontFamily:MONO,fontSize:9.5,letterSpacing:"0.1em",textTransform:"uppercase"}}>{s==="partner"?"Partner Prepaid":"Agency Prepaid"}</span>
              <div style={{width:54,height:54,borderRadius:15,background:ac,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </div>
              <div style={{fontWeight:700,fontSize:15,color:t.ink,marginBottom:5}}>{s==="partner"?"Drop Partner file here":"Drop Agency file here"}</div>
              <div style={{fontFamily:MONO,fontSize:10.5,color:t.muted}}>or click to browse · .xlsx · .xls · .csv</div>
              <input type="file" id={`pt-f-${s}`} accept=".xlsx,.xls,.csv" onChange={e=>handleFile(e.target.files[0],s)} style={{display:"none"}}/>
              {fname&&(
                <div style={{marginTop:14,padding:"7px 14px",background:t.goodBg,color:t.goodDark,border:`1px solid ${t.goodBd}`,borderRadius:10,fontSize:11.5,fontWeight:600,display:"inline-flex",alignItems:"center",gap:7,maxWidth:"100%",wordBreak:"break-all",lineHeight:1.3}}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {fname} · {rws.length.toLocaleString()} rows
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:12}}>
        <Btn t={t} variant="primary" onClick={publish}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Publish to Cloud
        </Btn>
        <Btn t={t} variant="outline" onClick={viewDash}>Preview Dashboard</Btn>
        <Btn t={t} variant="ghost" onClick={()=>{setPartnerRaw([]);setAgencyRaw([]);setPartnerFile("");setAgencyFile("");}}>Reset Upload</Btn>
      </div>
      {(partnerRaw.length>0||agencyRaw.length>0)&&(
        <div style={{fontFamily:MONO,fontSize:11,color:t.muted,padding:"8px 14px",background:t.surf2,borderRadius:10,border:`1px solid ${t.line}`,marginTop:2,wordBreak:"break-word"}}>
          Ready to publish: {[partnerRaw.length&&`Partner ${partnerRaw.length.toLocaleString()}`,agencyRaw.length&&`Agency ${agencyRaw.length.toLocaleString()}`].filter(Boolean).join(" · ")} · Total {(partnerRaw.length+agencyRaw.length).toLocaleString()} rows
        </div>
      )}
    </div>
  );
}

function NoteCard({n,t}) {
  const [hov,hE]=useHover();
  return <div {...hE} style={{padding:"10px 14px",borderRadius:12,background:hov?t.surf3:t.surf2,borderTop:`1px solid ${hov?t.line2:t.line}`,borderRight:`1px solid ${hov?t.line2:t.line}`,borderBottom:`1px solid ${hov?t.line2:t.line}`,borderLeft:`3px solid ${n.c}`,transition:"all .15s"}}><div style={{fontFamily:MONO,fontSize:9.5,letterSpacing:"0.12em",textTransform:"uppercase",color:t.muted,marginBottom:4}}>{n.l}</div><div style={{fontSize:12,color:t.ink2,lineHeight:1.45}}>{n.txt}</div></div>;
}

function SegBtn({s,active,disabled,count,label,onClick,t}) {
  const [hov,hE]=useHover();
  const ac=s==="partner"?C.teal:C.magenta;
  return <button {...hE} onClick={onClick} disabled={disabled} style={{fontWeight:600,fontSize:12.5,padding:"8px 18px",borderRadius:10,border:0,background:active?ac:hov?t.surf3:"transparent",color:active?"#fff":hov?t.ink:t.muted,cursor:disabled?"default":"pointer",display:"inline-flex",alignItems:"center",gap:8,transition:"all .15s",whiteSpace:"nowrap",opacity:disabled?.38:1,pointerEvents:disabled?"none":"auto"}}>{label}<span style={{fontFamily:MONO,fontSize:10,padding:"2px 7px",borderRadius:99,background:active?"rgba(255,255,255,.22)":t.surf4,color:active?"#fff":t.ink2}}>{count}</span></button>;
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

function DonutRow({p,total,isExp,onToggle,filtRaw,t}) {
  const [hov,hE]=useHover();
  const recs=isExp?filtRaw.filter(r=>(gstr(r,["status","payment status"])||"Unknown")===p.label).slice(0,30):[];
  return (
    <div>
      <div {...hE} {...kbd(onToggle)} onClick={onToggle} aria-expanded={isExp} style={{display:"grid",gridTemplateColumns:"1fr auto 20px",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:10,background:isExp?`${C.teal}12`:hov?t.surf3:t.surf2,border:`1px solid ${isExp?C.teal:hov?t.line2:t.line}`,cursor:"pointer",transition:"all .15s"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}><span style={{width:10,height:10,borderRadius:"50%",background:p.color,flexShrink:0}}/><span style={{fontWeight:600,fontSize:12,color:t.ink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.label}</span></div>
        <div style={{display:"flex",alignItems:"baseline",gap:5}}><span style={{fontFamily:MONO,fontWeight:600,fontSize:12,color:t.ink}}>{p.v.toLocaleString()}</span><span style={{fontFamily:MONO,fontSize:10,color:t.muted}}>({Math.round(p.v/(total||1)*100)}%)</span></div>
        <span style={{fontSize:9,color:isExp?C.teal:t.muted,display:"inline-block",transform:isExp?"rotate(180deg)":"none",transition:"transform .2s"}}>▼</span>
      </div>
      {isExp&&recs.length>0&&<div style={{marginTop:4,background:t.surf2,border:`1px solid ${t.line}`,borderRadius:10,overflow:"hidden",maxHeight:200,overflowY:"auto"}}>{recs.map((r,j)=><DetailRow key={j} po={gstr(r,["po number","po #"])||"No PO"} name={gstr(r,["project title"])||gstr(r,["partner name","agency name"])||"—"} meta={fmtMoney(gnum(r,["amount"]))} t={t}/>)}</div>}
      {isExp&&recs.length===0&&<div style={{marginTop:4,padding:"8px 12px",background:t.surf2,border:`1px solid ${t.line}`,borderRadius:10,fontSize:11.5,fontStyle:"italic",color:t.muted}}>No records match the current filters.</div>}
    </div>
  );
}

function DetailRow({po,name,meta,t}) {
  const [hov,hE]=useHover();
  return <div {...hE} style={{display:"grid",gridTemplateColumns:"auto 1fr auto",gap:8,padding:"7px 12px",borderBottom:`1px solid ${t.line}`,fontSize:11.5,alignItems:"center",background:hov?t.surf3:"transparent",transition:"background .1s"}}><span style={{fontFamily:MONO,fontSize:10,fontWeight:600,background:t.surf3,padding:"2px 7px",borderRadius:5,border:`1px solid ${t.line}`,whiteSpace:"nowrap",color:t.ink}}>{po}</span><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:t.ink2}}>{name}</span><span style={{fontFamily:MONO,fontSize:10,color:t.muted,textAlign:"right",whiteSpace:"nowrap"}}>{meta}</span></div>;
}

function HeatBtn({m,active,onClick,t}) {
  const [hov,hE]=useHover();
  return <button {...hE} onClick={onClick} style={{fontFamily:MONO,fontSize:10,letterSpacing:"0.06em",textTransform:"uppercase",padding:"5px 10px",borderRadius:8,border:`1px solid ${active?m.ac:hov?C.tealD:t.line}`,background:active?m.ac:hov?t.surf3:t.surf2,color:active?(m.dark?"#1a1a1a":"#fff"):hov?t.ink:t.muted,cursor:"pointer",transition:"all .15s"}}>{m.l}</button>;
}

function HeatCell({bg,light,pp,v,n}) {
  const [hov,hE]=useHover();
  return <div {...hE} style={{borderRadius:8,padding:"9px 5px",textAlign:"center",background:bg,color:light?"#1a1a1a":"#fff",cursor:"default",transition:"transform .12s",transform:hov?"scale(1.05)":"scale(1)",position:"relative",zIndex:hov?2:0}}><div style={{fontWeight:700,fontSize:12,fontFamily:MONO,lineHeight:1}}>{pp}%</div><div style={{fontSize:9,opacity:.9,marginTop:2,fontFamily:MONO}}>{v}/{n}</div></div>;
}

function BnRow({r,isExp,onToggle,t}) {
  const [hov,hE]=useHover();
  const s=r.avg<=r.sla?"ok":r.avg<=r.sla*1.5?"warn":"breach";
  const sc=s==="ok"?t.good:s==="warn"?t.warn:t.bad;
  const sb=s==="ok"?t.goodBg:s==="warn"?t.warnBg:t.badBg;
  const sbd=s==="ok"?t.goodBd:s==="warn"?t.warnBd:t.badBd;
  const fill=Math.min(100,(r.avg/(r.sla*2))*100);
  const clickable=r.n>0;
  return (
    <div {...hE} {...(clickable?kbd(onToggle):{})} onClick={clickable?onToggle:undefined} aria-expanded={isExp} style={{borderRadius:12,background:hov?t.surf3:t.surf2,border:`${isExp?"2":"1"}px solid ${isExp?C.magenta:hov?t.line2:t.line}`,padding:"11px 14px",transition:"all .15s",cursor:clickable?"pointer":"default"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:8,flexWrap:"wrap"}}>
        <div style={{fontWeight:700,fontSize:13,color:t.ink,display:"flex",alignItems:"center",gap:6}}>{r.label}{clickable&&<span style={{fontSize:9,color:isExp?C.magenta:t.muted,display:"inline-block",transform:isExp?"rotate(180deg)":"none",transition:"transform .2s"}}>▼</span>}</div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontFamily:MONO,fontSize:9.5,fontWeight:600,padding:"3px 8px",borderRadius:6,background:sb,color:sc,border:`1px solid ${sbd}`,textTransform:"uppercase",letterSpacing:"0.08em"}}>{s==="ok"?"WITHIN SLA":s==="warn"?"APPROACHING SLA":"OVERDUE"}</span>
          <span style={{fontFamily:MONO,fontWeight:700,fontSize:14}}><span style={{color:sc}}>{r.avg.toFixed(1)}d</span><span style={{fontSize:10,color:t.muted,fontWeight:400}}> / {r.sla} WD</span></span>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:9}}>
        <div style={{flex:1,height:7,borderRadius:4,background:t.surf4,position:"relative",overflow:"hidden"}}><div style={{position:"absolute",top:0,left:0,height:"100%",width:`${fill}%`,background:sc,borderRadius:4,transition:"width .4s"}}/><div style={{position:"absolute",top:-3,bottom:-3,left:"50%",width:2,background:t.ink,opacity:.25,borderRadius:1}}/></div>
        <span style={{fontFamily:MONO,fontSize:10,color:t.muted,minWidth:40,textAlign:"right"}}>n={r.n}</span>
      </div>
      {isExp&&r.details.length>0&&(
        <div style={{marginTop:10,background:t.surf,border:`1px solid ${t.line}`,borderRadius:10,overflow:"hidden"}}>
          <div style={{padding:"7px 12px",background:t.badBg,borderBottom:`1px solid ${t.badBd}`,fontFamily:MONO,fontSize:9.5,color:t.bad,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:600}}>Top {Math.min(r.details.length,20)} longest cases</div>
          <div style={{maxHeight:250,overflowY:"auto"}}>{r.details.slice(0,20).map((d,j)=><BnDetailRow key={j} d={d} t={t}/>)}</div>
        </div>
      )}
    </div>
  );
}

function BnDetailRow({d,t}) {
  const [hov,hE]=useHover();
  return <div {...hE} style={{display:"grid",gridTemplateColumns:"44px auto 1fr auto",gap:8,padding:"7px 12px",borderBottom:`1px solid ${t.line}`,fontSize:11,alignItems:"center",background:hov?t.surf2:"transparent",transition:"background .1s"}}><span style={{fontFamily:MONO,fontSize:11,fontWeight:700,color:t.bad,textAlign:"center",background:t.badBg,padding:"3px 5px",borderRadius:6}}>{d.days}d</span><span style={{fontFamily:MONO,fontSize:10,fontWeight:600,background:t.surf3,padding:"2px 7px",borderRadius:5,border:`1px solid ${t.line}`,whiteSpace:"nowrap",color:t.ink}}>{d.po||"No PO"}</span><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:t.ink2}}>{d.title}</span><span style={{fontFamily:MONO,fontSize:10,color:t.muted,textAlign:"right",whiteSpace:"nowrap"}}>{d.month}{d.amt&&<><br/>{fmtMoney(d.amt)}</>}</span></div>;
}

function TpRow({p,i,maxAmt,isExp,onToggle,t}) {
  const [hov,hE]=useHover();
  const cr=p.n?Math.round(p.clr/p.n*100):0;
  const clrC=cr>=80?t.good:cr>=50?t.warn:t.bad, clrBg=cr>=80?t.goodBg:cr>=50?t.warnBg:t.badBg, clrBd=cr>=80?t.goodBd:cr>=50?t.warnBd:t.badBd;
  const grads=["linear-gradient(90deg,#EC008C,#C6168D)","linear-gradient(90deg,#FFCB05,#c49b00)","linear-gradient(90deg,#32BCAD,#1d8078)","linear-gradient(90deg,#32BCAD,#27a093)"];
  return (
    <div {...hE} {...kbd(onToggle)} onClick={onToggle} aria-expanded={isExp} style={{borderRadius:12,background:hov?t.surf3:t.surf2,border:`${isExp?"2":"1"}px solid ${isExp?C.magenta:hov?t.line2:t.line}`,padding:"10px 12px",cursor:"pointer",transition:"all .15s"}}>
      <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:7,flexWrap:"wrap"}}>
        <span style={{fontFamily:MONO,fontSize:11,fontWeight:600,color:t.muted,width:22,flexShrink:0}}>#{i+1}</span>
        <span style={{fontWeight:700,fontSize:12.5,flex:"1 1 120px",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:t.ink}}>{p.name}</span>
        <span style={{fontFamily:MONO,fontSize:9.5,fontWeight:600,padding:"2px 7px",borderRadius:6,background:clrBg,color:clrC,border:`1px solid ${clrBd}`,flexShrink:0}}>{cr}% cleared</span>
        <span style={{fontWeight:700,fontSize:12.5,flexShrink:0,fontFamily:MONO,color:t.ink}}>{fmtMoney(p.amt)}</span>
        <span style={{fontSize:9,color:isExp?C.magenta:t.muted,display:"inline-block",transform:isExp?"rotate(180deg)":"none",transition:"transform .2s",flexShrink:0}}>▼</span>
      </div>
      <div style={{height:5,borderRadius:3,background:t.surf4,overflow:"hidden"}}><div style={{height:"100%",width:`${(p.amt/maxAmt)*100}%`,background:grads[Math.min(i,3)],borderRadius:3,transition:"width .4s"}}/></div>
      {isExp&&(
        <div style={{marginTop:9,background:t.surf,border:`1px solid ${t.line}`,borderRadius:10,overflow:"hidden"}}>
          <div style={{padding:"7px 12px",background:t.surf2,borderBottom:`1px solid ${t.line}`,display:"flex",justifyContent:"space-between",fontFamily:MONO,fontSize:9.5,color:C.magenta,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:600,flexWrap:"wrap",gap:8}}>
            <span>{p.progs.length} program{p.progs.length!==1?"s":""} · {p.clr} cleared</span><span>Total {fmtMoney(p.amt)}</span>
          </div>
          <div style={{maxHeight:260,overflowY:"auto"}}>{p.progs.sort((a,b)=>b.amt-a.amt).slice(0,20).map((pr,j)=><TpProgRow key={j} pr={pr} t={t}/>)}</div>
        </div>
      )}
    </div>
  );
}

function TpProgRow({pr,t}) {
  const [hov,hE]=useHover();
  return <div {...hE} style={{display:"grid",gridTemplateColumns:"auto 1fr auto auto",gap:8,padding:"7px 12px",borderBottom:`1px solid ${t.line}`,fontSize:11,alignItems:"center",background:hov?t.surf2:"transparent",transition:"background .1s"}}><span style={{fontFamily:MONO,fontSize:10,fontWeight:600,background:t.surf3,padding:"2px 7px",borderRadius:5,border:`1px solid ${t.line}`,whiteSpace:"nowrap",color:t.ink}}>{pr.po||"No PO"}</span><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:t.ink2}}>{pr.title}</span><span style={{fontFamily:MONO,fontSize:11,fontWeight:600,color:t.ink}}>{fmtMoney(pr.amt)}</span><span style={{fontFamily:MONO,fontSize:9,fontWeight:600,padding:"3px 7px",borderRadius:5,textTransform:"uppercase",background:pr.cleared?t.goodBg:t.warnBg,color:pr.cleared?t.goodDark:t.warnDark,border:`1px solid ${pr.cleared?t.goodBd:t.warnBd}`}}>{pr.cleared?"✓ Clr":"Pending"}</span></div>;
}

function ThCell({col,sortState,setSort,t}) {
  const [hov,hE]=useHover();
  const active=sortState.col===col.k;
  return <th {...hE} onClick={()=>setSort(s=>({col:col.k,dir:s.col===col.k&&s.dir==="desc"?"asc":"desc"}))} style={{position:"sticky",top:0,zIndex:2,fontFamily:MONO,fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",color:active?C.teal:hov?t.ink:t.muted,fontWeight:active?700:500,background:hov?t.surf3:t.surf2,padding:"9px",textAlign:col.left?"left":"center",borderBottom:`1.5px solid ${t.line2}`,whiteSpace:"nowrap",cursor:"pointer",transition:"all .15s"}}>{col.l}{active?(sortState.dir==="asc"?" ▲":" ▼"):""}</th>;
}

function SummaryDataRow({r,j,isAg,t}) {
  const [hov,hE]=useHover();
  return (
    <tr {...hE} style={{borderBottom:`1px solid ${t.line}`,background:hov?t.rowHover:j%2===1?t.rowStripe:"transparent",transition:"background .1s"}}>
      <td style={{padding:"8px 9px 8px 28px",textAlign:"left",fontSize:12,color:t.muted}}>{r.month}</td>
      <td style={{padding:"8px 9px",textAlign:"left",fontSize:12,color:t.ink}}>{r.entity}</td>
      <td style={{padding:"8px 9px",textAlign:"left",fontSize:12,fontWeight:600,color:t.ink}}>{r.ptype}</td>
      <td style={{padding:"8px 9px",textAlign:"left",fontSize:12,color:t.muted}}>{r.prog}</td>
      <td style={{textAlign:"center",padding:"8px 9px",color:t.ink}}>{r.n||""}</td>
      <td style={{textAlign:"center",padding:"8px 9px",color:t.ink}}>{r.po||""}</td>
      {!isAg&&<td style={{textAlign:"center",padding:"8px 9px",color:t.ink}}>{r.surat||""}</td>}
      <td style={{textAlign:"center",padding:"8px 9px",color:t.ink}}>{r.inv||""}</td>
      <td style={{textAlign:"center",padding:"8px 9px",color:t.ink}}>{r.clv||""}</td>
      <td style={{textAlign:"center",padding:"8px 9px",color:t.ink}}>{r.clr||""}</td>
      <td style={{textAlign:"center",padding:"8px 9px"}}>{r.n?<PctBadge val={pct(r.inv,r.n)} t={t}/>:""}</td>
      <td style={{textAlign:"center",padding:"8px 9px"}}>{r.n?<PctBadge val={pct(r.clv,r.n)} t={t}/>:""}</td>
      <td style={{textAlign:"center",padding:"8px 9px"}}>{r.n?<PctBadge val={pct(r.clr,r.n)} t={t}/>:""}</td>
    </tr>
  );
}

function MonthTotalRow({m,mT,isAg,isCol,colCount,onToggle,t}) {
  const [hov,hE]=useHover();
  return <tr {...hE} {...kbd(onToggle)} onClick={onToggle} aria-expanded={!isCol} style={{background:hov?`${C.teal}18`:t.monthBg,borderTop:`1px solid ${C.teal}30`,cursor:"pointer",transition:"background .1s"}}><td colSpan={colCount} style={{padding:"9px",textAlign:"left",fontWeight:700,fontSize:12.5,color:t.ink}}><span style={{display:"inline-block",width:14,marginRight:6,color:t.muted,transition:"transform .15s",transform:isCol?"rotate(-90deg)":"rotate(0deg)"}}>▼</span>TOTAL {fmtMonthYear(m)} · {mT.n} records · {pct(mT.clr,mT.n)}% cleared</td></tr>;
}

function RawThCell({k,rawSort,setRawSort,setRawPage,isLeftCol,label,t}) {
  const [hov,hE]=useHover();
  const active=rawSort.col===k;
  return <th {...hE} onClick={()=>{setRawSort(s=>({col:k,dir:s.col===k&&s.dir==="asc"?"desc":"asc"}));setRawPage(1);}} style={{position:"sticky",top:0,zIndex:2,fontFamily:MONO,fontSize:10,letterSpacing:"0.08em",textTransform:"uppercase",color:active?C.teal:hov?t.ink:t.muted,fontWeight:active?700:500,background:hov?t.surf3:t.surf2,padding:"9px",textAlign:isLeftCol(k)?"left":"center",borderBottom:`1.5px solid ${t.line2}`,whiteSpace:"nowrap",cursor:"pointer",transition:"all .15s"}}>{label||k}{active?(rawSort.dir==="asc"?" ▲":" ▼"):""}</th>;
}

function RawDataRow({r,i,rawKeys,isLeftCol,fmtCellT,t}) {
  const [hov,hE]=useHover();
  return <tr {...hE} style={{borderBottom:`1px solid ${t.line}`,background:hov?t.rowHover:i%2===1?t.rowStripe:"transparent",transition:"background .1s"}}>{rawKeys.map(k=><td key={k} title={String(r[k]||"")} style={{padding:"8px 9px",textAlign:isLeftCol(k)?"left":"center",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:t.ink2}}>{fmtCellT(r[k],k,t)}</td>)}</tr>;
}

function FunnelRowItem({s,prevKey,drop,isExp,filtRaw,grand,onToggle,t}) {
  const [hov,hE]=useHover();
  const stH={po:["po number","po #","no po","po date"],surat:["surat pemberitahuan date","surat pemberitahuan","surat"],inv:["invoice submission","invoice"],clv:["clv date","clv"],clr:["clearing date","clearing"]};
  const pending=isExp&&filtRaw.length?filtRaw.filter(r=>!gcell(r,stH[s.key]||[])&&(!prevKey||!!gcell(r,stH[prevKey]||[]))).map(r=>({po:gstr(r,["po number"]),name:gstr(r,["partner name","agency name"])||"—",month:gstr(r,["program date"]),amt:gnum(r,["amount"])})).sort((a,b)=>b.amt-a.amt):[];
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

/* ─────────────────────────────────────────────────────────────────────
   GRAND TOTAL BANNER (v5.2-EN — fully responsive, all-English)
   Hero summary: Total Amount · Total Transactions · Total Partners ·
   Bank Cleared + milestone progress. 2-col grid on mobile, 4 on desktop.
   ───────────────────────────────────────────────────────────────────── */
function GrandTotalBanner({ grand, partnerCount, monthsCount = 0, groupCount = 0, isAg, w, t }) {
  const invPct = pct(grand.inv, grand.n);
  const clvPct = pct(grand.clv, grand.n);
  const clrPct = pct(grand.clr, grand.n);
  const isNarrow = w < 600;
  const isTiny   = w < 400;
  const pad      = isTiny ? "16px 14px 18px" : isNarrow ? "18px 18px 20px" : "24px 28px 24px";
  const padLeft  = isTiny ? 18 : isNarrow ? 22 : 34;

  const metricBox = (icon, label, value, sub, accent) => (
    <div style={{
      background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.13)",
      borderRadius:14, padding:isTiny?"12px 13px":"14px 16px",
      display:"flex", flexDirection:"column", gap:5, minWidth:0,
    }}>
      <div style={{display:"flex",alignItems:"center",gap:7,minWidth:0}}>
        <span style={{width:24,height:24,borderRadius:7,background:accent||"rgba(255,255,255,0.18)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{icon}</span>
        <span style={{fontFamily:MONO,fontSize:9.5,letterSpacing:"0.1em",textTransform:"uppercase",color:"rgba(255,255,255,0.72)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</span>
      </div>
      <div style={{fontWeight:900,fontSize:isTiny?20:isNarrow?23:26,letterSpacing:"-0.03em",color:"#FFFFFF",lineHeight:1.05,wordBreak:"break-word"}}>{value}</div>
      {sub&&<div style={{fontFamily:MONO,fontSize:9.5,color:"rgba(255,255,255,0.55)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sub}</div>}
    </div>
  );

  return (
    <div style={{
      position:"relative", overflow:"hidden", borderRadius:20, marginBottom:16,
      background:`linear-gradient(135deg, ${C.grey} 0%, #15151a 40%, ${C.magenta} 150%)`,
      boxShadow:t.shadow3, border:"1px solid rgba(255,255,255,0.10)",
    }}>
      {/* brand color accent bar on the left */}
      <div style={{position:"absolute",top:0,bottom:0,left:0,width:6,background:`linear-gradient(180deg,${C.yellow},${C.teal},${C.magenta})`}}/>
      {/* decorative transparent circle */}
      <div style={{position:"absolute",right:-50,top:-50,width:220,height:220,borderRadius:"50%",background:"radial-gradient(circle,rgba(255,203,5,0.16),transparent 70%)",pointerEvents:"none"}}/>

      <div style={{padding:pad,paddingLeft:padLeft,position:"relative",zIndex:1}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap"}}>
          <span style={{width:13,height:13,borderRadius:4,background:C.yellow,display:"inline-block",boxShadow:`0 0 12px ${C.yellow}`,flexShrink:0}}/>
          <span style={{fontWeight:900,fontSize:isNarrow?17:22,letterSpacing:"-0.02em",color:"#FFFFFF"}}>GRAND TOTAL</span>
          <span style={{fontFamily:MONO,fontSize:9.5,letterSpacing:"0.12em",textTransform:"uppercase",color:"rgba(255,255,255,0.62)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:99,padding:"3px 10px"}}>
            {isAg?"Agency Prepaid":"Partner Prepaid"}
          </span>
        </div>
        <div style={{fontFamily:MONO,fontSize:10.5,color:"rgba(255,255,255,0.55)",marginBottom:16,letterSpacing:"0.03em"}}>
          {monthsCount} active month{monthsCount!==1?"s":""} · {groupCount} groups · {grand.n.toLocaleString()} records
        </div>

        <div style={{display:"grid",gridTemplateColumns:isNarrow?"repeat(2,1fr)":"repeat(4,1fr)",gap:isTiny?9:12}}>
          {metricBox(
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1a1a1d" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
            "Total Amount", fmtMoney(grand.amt), isTiny?null:fmtMoney(grand.amt,false), C.yellow
          )}
          {metricBox(
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>,
            "Total Transactions", grand.n.toLocaleString(), `${grand.po.toLocaleString()} POs issued`, C.teal
          )}
          {metricBox(
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
            isAg?"Total Agencies":"Total Partners", partnerCount.toLocaleString(), "unique entities", C.magenta
          )}
          {metricBox(
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1a1a1d" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
            "Bank Cleared", `${clrPct}%`, `${grand.clr.toLocaleString()} / ${grand.n.toLocaleString()} records`, clrPct>=80?C.teal:clrPct>=50?C.yellow:C.red
          )}
        </div>

        {/* milestone progress bars */}
        <div style={{display:"grid",gridTemplateColumns:isNarrow?"1fr":"repeat(3,1fr)",gap:isNarrow?12:14,marginTop:16}}>
          {[
            {l:"Invoice Sub.", v:invPct, c:C.yellow, desc:"Submitted to Coupa · AP verification"},
            {l:"CLV", v:clvPct, c:C.teal, desc:"Checklist Verification · Finance approved"},
            {l:"Bank Cleared", v:clrPct, c:"#7ee8e0", desc:"Fund transfer completed (3 WD)"},
          ].map((m,i)=>(
            <div key={i}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5,fontFamily:MONO,fontSize:10,color:"rgba(255,255,255,0.7)"}}>
                <span style={{textTransform:"uppercase",letterSpacing:"0.08em"}}>{m.l}</span>
                <span style={{fontWeight:700,color:"#fff"}}>{m.v}%</span>
              </div>
              <div style={{height:8,borderRadius:5,background:"rgba(255,255,255,0.14)",overflow:"hidden"}}>
                <div style={{height:"100%",width:`${m.v}%`,background:m.c,borderRadius:5,transition:"width .5s"}}/>
              </div>
              <div style={{marginTop:6,fontFamily:MONO,fontSize:9.5,lineHeight:1.45,color:"rgba(255,255,255,0.5)"}}>{m.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DashScreen(props) {
  const w = useWidth();
  const { t, src, setSrc, setScreen, activeTab, setActiveTab, isSPM, isIOHAny, isIOHRegional,
    regionFilter, filterMpxType, viewPartnerRaw, viewAgencyRaw, pubMeta,
    filters, setFilters, opts, curAgg, curRaw, filtAgg, filtRaw,
    setCollapsed, searchFocus, setSearchFocus, searchIdx, setSearchIdx,
    searchRef, searchSuggestions, allSuggestions, searchInput, setSearchInput,
    setRawPage, showToast, exportSummary } = props;
  const isAg = src === "agency";

  const isMobile = w < 640;
  const [showFilters, setShowFilters] = useState(false);

  const segPartnerCount = (viewPartnerRaw||[]).length;
  const segAgencyCount  = (viewAgencyRaw||[]).length;
  const segVisible = ((isSPM||(isIOHAny&&!isIOHRegional))?["partner","agency"]:["partner"])
    .filter(s=>(s==="partner"?segPartnerCount:segAgencyCount)>0);

  const resetFilters = () => { setFilters({month:[],entity:[],ptype:[],prog:[],status:[],q:""}); setSearchInput(""); };

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
          <p style={{color:t.muted,fontSize:14,margin:0,lineHeight:1.6}}>Milestone PO → Invoice → CLV → Bank Cleared · Partner &amp; Agency Prepaid</p>
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

      {segVisible.length>0&&(
        <div style={{display:"inline-flex",gap:4,background:t.surf,border:`1px solid ${t.line}`,borderRadius:14,padding:4,marginBottom:18,boxShadow:t.shadow1,overflowX:"auto",maxWidth:"100%"}}>
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

      <div style={{display:"flex",gap:24,borderBottom:`1px solid ${t.line}`,marginBottom:18,overflowX:"auto"}}>
        {[{id:"dash",label:"Dashboard"},{id:"raw",label:"Raw Data",count:filtRaw.length}].map(tab=>(
          <TabBtn key={tab.id} label={tab.label} count={tab.count} active={activeTab===tab.id} onClick={()=>setActiveTab(tab.id)} t={t}/>
        ))}
      </div>

      {curAgg.length>0&&(
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
              <MultiSel t={t} values={Array.isArray(filters.entity)?filters.entity:[]} options={opts.entities.filter(Boolean)} placeholder="All Entities" onChange={vals=>setFilters(f=>({...f,entity:vals}))}/>
              <MultiSel t={t} values={Array.isArray(filters.ptype)?filters.ptype:[]} options={opts.ptypes.filter(Boolean)} placeholder={isAg?"All Agencies":"All Partners"} onChange={vals=>setFilters(f=>({...f,ptype:vals}))}/>
              <MultiSel t={t} values={Array.isArray(filters.prog)?filters.prog:[]} options={opts.progs.filter(Boolean)} placeholder="All Programs" onChange={vals=>setFilters(f=>({...f,prog:vals}))}/>
              {curRaw.length>0&&<MultiSel t={t} values={Array.isArray(filters.status)?filters.status:[]} options={opts.statuses.filter(Boolean)} placeholder="All Statuses" onChange={vals=>setFilters(f=>({...f,status:vals}))}/>}
              <div ref={searchRef} style={{position:"relative",flex:"1 1 200px",minWidth:160}}>
                <svg style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",color:t.muted}} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                <input type="text" placeholder="Search partner, PO, or project…" value={searchInput}
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
                    {[{g:searchSuggestions.partners,l:isAg?"Agency":"Partner",ic:C.teal,lbl:"P",off:0},{g:searchSuggestions.pos,l:"PO Number",ic:C.magenta,lbl:"PO",off:searchSuggestions.partners.length},{g:searchSuggestions.projects,l:"Project",ic:C.pink,lbl:"Pr",off:searchSuggestions.partners.length+searchSuggestions.pos.length}].filter(x=>x.g.length>0).map(({g,l,ic,lbl,off})=>(
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

      {chips.length>0&&(
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:18}}>
          <span style={{fontFamily:MONO,fontSize:9.5,letterSpacing:"0.1em",textTransform:"uppercase",color:t.muted}}>Active:</span>
          {chips.map((c,i)=>(
            <span key={i} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"3px 6px 3px 10px",borderRadius:99,background:`${C.teal}14`,border:`1px solid ${C.teal}40`,fontSize:11.5,color:t.ink}}>
              <span style={{color:t.muted,fontSize:10.5}}>{c.lbl}:</span>
              <span style={{fontWeight:600,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.v}</span>
              <button onClick={()=>removeChip(c)} aria-label={`Remove filter ${c.lbl} ${c.v}`} style={{width:16,height:16,borderRadius:"50%",border:"none",background:`${C.teal}30`,color:t.ink,cursor:"pointer",fontSize:9,padding:0,lineHeight:1,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </span>
          ))}
          <button onClick={resetFilters} style={{border:"none",background:"transparent",color:t.bad,cursor:"pointer",fontFamily:"inherit",fontSize:11.5,fontWeight:600,padding:"3px 6px"}}>Clear all</button>
        </div>
      )}

      {filtersEmpty ? (
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
          {activeTab==="raw"  && <RawTab  {...props} t={t} w={w}/>}
        </>
      )}

      <div style={{marginTop:28,paddingTop:18,borderTop:`1px solid ${t.line}`,textAlign:"center",fontFamily:MONO,fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",color:t.muted,lineHeight:1.6}}>
        Partner &amp; Agency Payout Tracker · Sumatera · SAP &amp; Web Coupa · SLA {isAg?"2/2/2/3":"2/1/2/2/3"} WD (Working Days)
        {regionFilter&&<span style={{marginLeft:12,color:t.yellow}}>· {regionFilter}</span>}
      </div>
    </div>
  );
}

function DashTab(props) {
  const { t, w, grand, grandPartnerCount, filtAgg, filtRaw, src, funnelStages, trendSeries, donutPieces, heatData, heatMetric, setHeatMetric, bnResults, topPartners, sortedMonths, collapsed, setCollapsed, tblSort, setTblSort, funnelExp, setFunnelExp, donutExp, setDonutExp, bnExp, setBnExp, tpExp, setTpExp, exportSummary } = props;
  const isAg = src==="agency";
  const noteItems = [
    {l:"Data Source",   txt:`SAP & Web Coupa · ${isAg?"Agency SLA 2/2/2/3":"Partner SLA 2/1/2/2/3"} WD (Working Days)`, c:C.teal},
    {l:"Invoice Sub.",  txt:"Submitted to Coupa · AP verification",                                                        c:C.yellow},
    {l:"CLV",           txt:"Cleared Voucher · Finance approved",                                                           c:C.magenta},
    {l:"Bank Cleared",  txt:"Fund transfer completed (3 WD)",                                                               c:C.tealD},
  ];
  return (
    <>
      {/* Grand Total Banner — hero summary */}
      <GrandTotalBanner grand={grand} partnerCount={grandPartnerCount} monthsCount={unique(filtAgg.map(r=>r.month)).length} groupCount={filtAgg.length} isAg={isAg} w={w} t={t}/>

      <div style={{display:"grid",gridTemplateColumns:w>=1000?"1.05fr 1fr":"1fr",gap:14,marginBottom:14}}>
        <Card t={t} pad={false}>
          <CardHead title="Completion Funnel" accent={C.teal} sub={`${isAg?"Agency milestones":"Partner milestones"} · click "pending" badge to view records`} t={t}/>
          <div style={{padding:20,display:"flex",gap:18,alignItems:"flex-start",flexWrap:"wrap"}}>
            <div style={{flexShrink:0}}>
              {(()=>{
                const W=190,H=isAg?175:215,pad=5,sH=(H-pad*2)/funnelStages.length;
                const maxV=grand.n||1;
                return <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{display:"block"}} role="img" aria-label="Milestone funnel">{funnelStages.map((s,i)=>{ const w1=(s.val/maxV)*(W-12); const nv=funnelStages[i+1]?funnelStages[i+1].val:s.val; const w2=(nv/maxV)*(W-12); const x1a=(W-w1)/2,x1b=x1a+w1,x2a=(W-w2)/2,x2b=x2a+w2,y1=pad+i*sH,y2=y1+sH-1; const darkTxt=s.color===C.yellow||s.color==="#FFCB05"; return <g key={s.key}><path d={`M${x1a},${y1} L${x1b},${y1} L${x2b},${y2} L${x2a},${y2} Z`} fill={s.color} opacity={.95}/><text x={W/2} y={y1+sH/2+4} textAnchor="middle" fill={darkTxt?"#1a1a1a":"#fff"} fontSize={10.5} fontWeight="700" fontFamily="inherit">{s.val.toLocaleString()}</text></g>; })}</svg>;
              })()}
            </div>
            <div style={{flex:1,minWidth:220}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:`linear-gradient(90deg,${C.red},${C.magenta})`,color:"#fff",borderRadius:10,padding:"9px 14px",marginBottom:10,fontSize:13,fontWeight:700}}><span>Total Records</span><span style={{fontFamily:MONO,fontSize:16,fontWeight:600}}>{grand.n.toLocaleString()}</span></div>
              {funnelStages.map((s,i)=>{ const prev=i>0?funnelStages[i-1]:null; const drop=(prev?prev.val:grand.n)-s.val; return <FunnelRowItem key={s.key} s={s} prevKey={prev?prev.key:null} drop={drop} isExp={funnelExp===s.key} filtRaw={filtRaw} grand={grand} onToggle={()=>setFunnelExp(k=>k===s.key?null:s.key)} t={t}/>; })}
            </div>
          </div>
        </Card>
        <Card t={t} pad={false}>
          <CardHead title="Status Distribution" accent={C.magenta} sub="Click a status to view records" t={t}/>
          <div style={{padding:20}}>
            <DonutChart pieces={donutPieces} t={t} size={140}/>
            <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:5}}>
              {donutPieces.map((p,i)=><DonutRow key={i} p={p} total={donutPieces.reduce((a,b)=>a+b.v,0)} isExp={donutExp===p.label} filtRaw={filtRaw} onToggle={()=>setDonutExp(e=>e===p.label?null:p.label)} t={t}/>)}
            </div>
          </div>
        </Card>
      </div>
      <div style={{display:"grid",gridTemplateColumns:w>=1000?"1fr 1fr":"1fr",gap:14,marginBottom:14}}>
        <Card t={t} pad={false}>
          <CardHead title="Monthly Trends" accent={C.yellow} sub="% Invoice & % Bank Cleared per month" t={t}/>
          <div style={{padding:20}}>
            <BarChart series={trendSeries} t={t}/>
            <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:10,flexWrap:"wrap",fontSize:12,fontWeight:600}}>
              <span style={{display:"flex",alignItems:"center",gap:6,color:t.ink}}><span style={{width:12,height:12,background:C.yellow,borderRadius:3,display:"inline-block"}}/> % Invoice</span>
              <span style={{display:"flex",alignItems:"center",gap:6,color:t.ink}}><span style={{width:12,height:12,background:C.teal,borderRadius:3,display:"inline-block"}}/> % Cleared</span>
            </div>
          </div>
        </Card>
        <Card t={t} pad={false}>
          <CardHead title="Completion Heatmap" accent={C.magenta} sub={`Month × ${isAg?"Agency":"Partner"} Type`} t={t}
            right={<div style={{display:"flex",gap:5,marginTop:8,flexWrap:"wrap"}}>{[{k:"inv",l:"Invoice",ac:C.yellow,dark:true},{k:"clv",l:"CLV",ac:C.tealD},{k:"clr",l:"Clearing",ac:C.teal}].map(m=><HeatBtn key={m.k} m={m} active={heatMetric===m.k} onClick={()=>setHeatMetric(m.k)} t={t}/>)}</div>}/>
          <div style={{padding:20}}>
            <div style={{overflowX:"auto"}}>
              <table style={{borderCollapse:"separate",borderSpacing:3,minWidth:320,fontSize:12,width:"100%"}}>
                <thead><tr><th style={{fontFamily:MONO,fontSize:9.5,color:t.muted,textAlign:"left",padding:"4px 6px",textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:500}}>Month</th>{heatData.ptypes.map(p=><th key={p} style={{fontFamily:MONO,fontSize:9.5,color:t.muted,textAlign:"center",padding:"4px 6px",textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:500}}>{p}</th>)}</tr></thead>
                <tbody>{heatData.months.map(m=><tr key={m}><td style={{fontFamily:MONO,fontSize:11,fontWeight:600,color:t.ink,padding:"3px 6px",whiteSpace:"nowrap"}}>{m}</td>{heatData.ptypes.map(p=>{ const c=heatData.cells[m+"\x00"+p]; if(!c)return <td key={p}><div style={{borderRadius:8,padding:"9px 5px",textAlign:"center",background:t.surf3,color:t.muted2,fontFamily:MONO,fontSize:11}}>—</div></td>; const v=c[heatMetric]||0,pp=pct(v,c.n),bg=heatClr(pp),light=bg==="#FFCB05"||bg===C.yellow; return <td key={p} title={`${m}·${p}: ${v}/${c.n} (${pp}%)`}><HeatCell bg={bg} light={light} pp={pp} v={v} n={c.n}/></td>; })}</tr>)}</tbody>
              </table>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:7,marginTop:10,fontFamily:MONO,fontSize:10,color:t.muted,flexWrap:"wrap"}}>
              Scale: <div style={{display:"flex",gap:2}}>{[5,25,50,70,85,97].map(p=><span key={p} style={{width:20,height:11,borderRadius:3,background:heatClr(p),display:"block"}}/>)}</div> 0% → 100%
            </div>
          </div>
        </Card>
      </div>
      {filtRaw.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:w>=1000?"1fr 1fr":"1fr",gap:14,marginBottom:14}}>
          <Card t={t} pad={false}>
            <CardHead title="SLA Bottleneck Analysis" accent={C.red} sub={`${isAg?"Agency 2/2/2/3":"Partner 2/1/2/2/3"} WD (Working Days)`} t={t}/>
            <div style={{padding:20}}>
              <div style={{fontFamily:MONO,fontSize:10,color:t.muted,padding:"6px 12px",background:t.surf2,borderRadius:9,marginBottom:14,borderLeft:`3px solid ${C.teal}`}}><strong style={{color:t.ink,fontSize:11}}>{unique(filtRaw.map(r=>gstr(r,["program date","month"]))).length} month{unique(filtRaw.map(r=>gstr(r,["program date","month"]))).length!==1?"s":""}</strong>{" · "}<strong style={{color:t.ink,fontSize:11}}>{filtRaw.length.toLocaleString()}</strong> records</div>
              <div style={{display:"flex",flexDirection:"column",gap:9}}>{bnResults.map(r=><BnRow key={r.key} r={r} isExp={bnExp===r.key} onToggle={()=>r.n>0&&setBnExp(e=>e===r.key?null:r.key)} t={t}/>)}</div>
              <div style={{display:"flex",gap:12,marginTop:12,padding:"8px 12px",background:t.surf2,borderRadius:9,border:`1px solid ${t.line}`,flexWrap:"wrap",fontFamily:MONO,fontSize:10,color:t.muted,textTransform:"uppercase",letterSpacing:"0.06em"}}>{[{c:t.good,l:"Within SLA"},{c:t.warn,l:"Approaching SLA"},{c:t.bad,l:"Overdue"}].map(x=><span key={x.l} style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:10,height:10,borderRadius:3,background:x.c}}/>{x.l}</span>)}</div>
            </div>
          </Card>
          <Card t={t} pad={false}>
            <CardHead title={isAg?"Top 10 Agencies":"Top 10 Partners"} accent={C.magenta} sub="By total amount · click to view all programs" t={t}/>
            <div style={{padding:20}}>
              {topPartners.length===0?<div style={{textAlign:"center",color:t.muted,padding:"2rem",fontFamily:MONO,fontSize:12}}>No data available</div>:<div style={{display:"flex",flexDirection:"column",gap:6}}>{topPartners.map((p,i)=><TpRow key={i} p={p} i={i} maxAmt={topPartners[0]?.amt||1} isExp={tpExp===p.name} onToggle={()=>setTpExp(e=>e===p.name?null:p.name)} t={t}/>)}</div>}
            </div>
          </Card>
        </div>
      )}
      <SummaryTable t={t} w={w} filtAgg={filtAgg} grand={grand} grandPartnerCount={grandPartnerCount} sortedMonths={sortedMonths} collapsed={collapsed} setCollapsed={setCollapsed} tblSort={tblSort} setTblSort={setTblSort} isAg={isAg} exportSummary={exportSummary}/>
      <Card t={t} pad={false} style={{marginBottom:14}}>
        <div style={{padding:"13px 20px",fontWeight:700,fontSize:13.5,letterSpacing:"-0.01em",borderBottom:`1px solid ${t.line}`,color:t.ink,background:t.surf2}}>Data References &amp; Remarks</div>
        <div style={{display:"grid",gridTemplateColumns:w>=900?"repeat(4,1fr)":w>=600?"repeat(2,1fr)":"1fr",gap:12,padding:16}}>{noteItems.map((n,i)=><NoteCard key={i} n={n} t={t}/>)}</div>
      </Card>
    </>
  );
}

function SummaryTable({ t, w, filtAgg, grand, grandPartnerCount, sortedMonths, collapsed, setCollapsed, tblSort, setTblSort, isAg, exportSummary }) {
  const COLS = [
    {k:"month",l:"Month",left:true},
    {k:"entity",l:"Entity",left:true},
    {k:"ptype",l:isAg?"Agency":"Partner Type",left:true},
    {k:"prog",l:"Program",left:true},
    {k:"n",l:"#Rec"},
    {k:"po",l:"PO"},
    ...(!isAg?[{k:"surat",l:"Pmt. Letter"}]:[]),
    {k:"inv",l:"Invoice"},
    {k:"clv",l:"CLV"},
    {k:"clr",l:"Clearing"},
    {k:"pInv",l:"% Inv"},
    {k:"pClv",l:"% CLV"},
    {k:"pClr",l:"% Clr"},
  ];
  const colCount = COLS.length;
  const allCollapsed = sortedMonths.length>0 && sortedMonths.every(m=>collapsed[m]);
  const toggleAll = () => { const next={}; if(!allCollapsed) sortedMonths.forEach(m=>{next[m]=true;}); setCollapsed(next); };
  const invPct = pct(grand.inv,grand.n), clvPct = pct(grand.clv,grand.n), clrPct = pct(grand.clr,grand.n);
  const narrow = w<700;

  return (
    <Card t={t} pad={false} style={{marginBottom:14}}>
      <CardHead title="Monthly Summary" accent={C.teal}
        sub={`${filtAgg.length} groups · ${sortedMonths.length} months · click month row to expand/collapse`}
        t={t}
        right={
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <Btn t={t} variant="ghost" sm onClick={toggleAll}>{allCollapsed?"Expand all":"Collapse all"}</Btn>
            <Btn t={t} variant="outline" sm onClick={()=>exportSummary("csv")}>CSV</Btn>
          </div>
        }/>
      {narrow&&(
        <div style={{padding:"7px 16px",fontFamily:MONO,fontSize:10,color:t.muted,background:t.surf2,borderBottom:`1px solid ${t.line}`,display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:13}}>↔</span> Scroll horizontally to view all columns
        </div>
      )}
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:narrow?720:undefined}}>
          <thead><tr>{COLS.map(c=><ThCell key={c.k} col={c} sortState={tblSort} setSort={setTblSort} t={t}/>)}</tr></thead>
          <tbody>
            {sortedMonths.map(m=>{
              const rows=filtAgg.filter(r=>r.month===m);
              const mT=sumRows(rows);
              const isCol=!!collapsed[m];
              return (
                <React.Fragment key={`grp-${m}`}>
                  <MonthTotalRow m={m} mT={mT} isAg={isAg} isCol={isCol} colCount={colCount} onToggle={()=>setCollapsed(c=>({...c,[m]:!c[m]}))} t={t}/>
                  {!isCol && rows.map((r,j)=><SummaryDataRow key={`${m}-${j}`} r={r} j={j} isAg={isAg} t={t}/>)}
                </React.Fragment>
              );
            })}
            {sortedMonths.length===0&&(
              <tr><td colSpan={colCount} style={{padding:"28px",textAlign:"center",color:t.muted,fontFamily:MONO,fontSize:12}}>No data matches the current filters</td></tr>
            )}
          </tbody>
          {/* ───────────────────────────────────────────────────────────────────
             GRAND TOTAL footer row — uniform charcoal background, white text,
             thin teal accent line, teal pills. Sticky so it stays visible
             while scrolling.
             ─────────────────────────────────────────────────────────────────── */}
          <tfoot>
            <tr style={{position:"sticky",bottom:0,zIndex:3}}>
              {/* GRAND TOTAL label */}
              <td colSpan={4} style={{
                background:"#1E2128", padding:"14px 12px",
                borderTop:`2px solid ${C.teal}`, whiteSpace:"nowrap",
              }}>
                <span style={{display:"inline-flex",alignItems:"center",gap:9}}>
                  <span style={{width:11,height:11,borderRadius:3,background:C.teal,display:"inline-block",flexShrink:0}}/>
                  <span style={{fontWeight:900,fontSize:15,letterSpacing:"-0.01em",color:"#FFFFFF"}}>GRAND TOTAL</span>
                  <span style={{fontFamily:MONO,fontWeight:600,fontSize:11,color:"#E8E8EE",letterSpacing:"0.04em"}}>
                    {grandPartnerCount} {isAg?"agenc":"partner"}{grandPartnerCount!==1?(isAg?"ies":"s"):(isAg?"y":"")} · {fmtMoney(grand.amt)}
                  </span>
                </span>
              </td>
              {/* count cells — uniform charcoal background, bright white numerals */}
              {[grand.n,grand.po,...(!isAg?[grand.surat]:[]),grand.inv,grand.clv,grand.clr].map((v,i)=>(
                <td key={i} style={{
                  background:"#1E2128",
                  textAlign:"center", padding:"12px 9px",
                  borderTop:`2px solid ${C.teal}`,
                }}>
                  <span style={{
                    display:"inline-block",
                    fontFamily:MONO, fontWeight:900, fontSize:19,
                    letterSpacing:"-0.02em", color:"#FFFFFF",
                  }}>{v.toLocaleString()}</span>
                </td>
              ))}
              {/* percentage badges — standardized solid teal pill, white text */}
              {[invPct, clvPct, clrPct].map((val,i)=>(
                <td key={i} style={{background:"#1E2128",textAlign:"center",padding:"12px 9px",borderTop:`2px solid ${C.teal}`}}>
                  <span style={{
                    display:"inline-flex", alignItems:"center", gap:6,
                    padding:"5px 12px", borderRadius:99,
                    background:C.tealD, color:"#FFFFFF",
                    fontFamily:MONO, fontWeight:900, fontSize:12,
                    letterSpacing:"0.02em",
                  }}>
                    <span style={{width:7,height:7,borderRadius:"50%",background:"#FFFFFF",opacity:0.75,flexShrink:0}}/>
                    {val}%
                  </span>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

function RawTab(props) {
  const { t, w, filtRaw, curRaw, rawKeys, rawKeysAll, rawKeysMain, showAllCols, setShowAllCols,
    pageRaw, curRawPage, totalRawPages, rawSort, setRawSort, setRawPage, isLeftCol, fmtCellT, exportRaw, src } = props;
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
          This view shows only the 10 primary columns. The Excel export always includes <strong>all columns</strong> as a complete backup.
        </div>
      )}
      {narrow&&(
        <div style={{padding:"7px 16px",fontFamily:MONO,fontSize:10,color:t.muted,background:t.surf2,borderBottom:`1px solid ${t.line}`,display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:13}}>↔</span> Scroll horizontally to view all columns
        </div>
      )}

      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11.5,minWidth:narrow?Math.max(720,rawKeys.length*110):undefined}}>
          <thead><tr>{rawKeys.map(k=><RawThCell key={k} k={k} rawSort={rawSort} setRawSort={setRawSort} setRawPage={setRawPage} isLeftCol={isLeftCol} t={t}/>)}</tr></thead>
          <tbody>
            {pageRaw.length===0
              ? <tr><td colSpan={rawKeys.length||1} style={{padding:"28px",textAlign:"center",color:t.muted,fontFamily:MONO,fontSize:12}}>No records match the current filters</td></tr>
              : pageRaw.map((r,i)=><RawDataRow key={i} r={r} i={i} rawKeys={rawKeys} isLeftCol={isLeftCol} fmtCellT={fmtCellT} t={t}/>)}
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