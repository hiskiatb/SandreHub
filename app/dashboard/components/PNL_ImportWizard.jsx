"use client";
/**
 * PNL_ImportWizard.jsx — v10.0
 * Role: Apple-level UI/UX designer
 * Per-column decimal, DB refresh with status, manual refresh,
 * single-row clean diff header, form type list, zero-noise design
 */
import React,{useState,useCallback,useRef,useMemo,useEffect}from"react";
import*as XLSX from"xlsx";
import{
  Upload,FileSpreadsheet,X,CheckCircle2,AlertTriangle,Info,
  Loader2,Link2,Download,RefreshCw,Table2,ZapIcon,
  ArrowUpDown,Check,AlertCircle,Search,Plus,Minus,
  FileDown,Database,Sparkles,ChevronRight,LayoutList,
  Clock,WifiOff,
}from"lucide-react";

const PK=["partner_name","branch","mpc_mp3","month","year"];
const FF=`"DM Sans",-apple-system,"Helvetica Neue",sans-serif`;

/* ─────────────────────────────────────────────────────────────────────────────
   DESIGN TOKENS  — Apple Human Interface Guidelines
   ───────────────────────────────────────────────────────────────────────────── */
const T=d=>({
  /* surfaces */
  bg:       d?"#0E0E10":"#F5F5F7",
  card:     d?"#1C1C1E":"#FFFFFF",
  raised:   d?"#242428":"#FAFAFA",
  inset:    d?"#111113":"#EAEAEC",
  /* separators */
  line:     d?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.09)",
  lineS:    d?"rgba(255,255,255,0.045)":"rgba(0,0,0,0.055)",
  /* labels (WCAG AA compliant in both modes) */
  t1:       d?"#F5F5F7":"#1D1D1F",   /* 4.6:1 on card */
  t2:       d?"rgba(245,245,247,0.68)":"rgba(29,29,31,0.68)", /* secondary */
  t3:       d?"rgba(245,245,247,0.40)":"rgba(29,29,31,0.44)", /* tertiary */
  /* brand */
  acc:      "#ED1C24",
  accL:     d?"rgba(237,28,36,0.16)":"rgba(237,28,36,0.09)",
  accB:     d?"rgba(237,28,36,0.35)":"rgba(237,28,36,0.24)",
  /* green */
  G:        d?"#30D158":"#28A745",
  GL:       d?"rgba(48,209,88,0.13)":"rgba(40,167,69,0.10)",
  GB:       d?"rgba(48,209,88,0.30)":"rgba(40,167,69,0.25)",
  /* amber */
  A:        d?"#FFD60A":"#B87400",
  AL:       d?"rgba(255,214,10,0.13)":"rgba(184,116,0,0.10)",
  AB:       d?"rgba(255,214,10,0.32)":"rgba(184,116,0,0.26)",
  /* red */
  R:        d?"#FF453A":"#D93025",
  RL:       d?"rgba(255,69,58,0.13)":"rgba(217,48,37,0.09)",
  RB:       d?"rgba(255,69,58,0.32)":"rgba(217,48,37,0.22)",
  /* blue */
  B:        d?"#0A84FF":"#0066CC",
  BL:       d?"rgba(10,132,255,0.13)":"rgba(0,102,204,0.09)",
  BB:       d?"rgba(10,132,255,0.32)":"rgba(0,102,204,0.24)",
  /* info */
  I:        d?"#64D2FF":"#007AFF",
  IL:       d?"rgba(100,210,255,0.13)":"rgba(0,122,255,0.09)",
  IB:       d?"rgba(100,210,255,0.30)":"rgba(0,122,255,0.24)",
  /* input */
  iBg:      d?"rgba(255,255,255,0.06)":"#FFFFFF",
  iBd:      d?"rgba(255,255,255,0.12)":"rgba(0,0,0,0.16)",
  /* shadows */
  s1:       d?"0 1px 3px rgba(0,0,0,0.55)":"0 1px 2px rgba(0,0,0,0.06),0 0 0 1px rgba(0,0,0,0.04)",
  s2:       d?"0 4px 14px rgba(0,0,0,0.55)":"0 4px 12px rgba(0,0,0,0.08)",
  s3:       d?"0 20px 60px rgba(0,0,0,0.72)":"0 20px 50px rgba(0,0,0,0.13)",
});
const FORM_DEFS = {
  pendapatan: {
    id: "pendapatan", label: "Form Pendapatan",
    description: "Margin produk (SP & VC), Saldo Mobo, Sales Fee, dan Rewards",
    primaryKeys: ["partner_name","branch","mpc_mp3","month","year"],
    fields: [
      {key:"partner_name",      label:"Nama Partner",                    group:"primary",  required:true,  type:"text",   hint:"Harus sama persis"},
      {key:"branch",            label:"Branch / Cabang",                 group:"primary",  required:true,  type:"text"},
      {key:"mpc_mp3",           label:"MPC / MP3",                       group:"primary",  required:true,  type:"text",   hint:"MPC atau MP3"},
      {key:"month",             label:"Bulan",                           group:"primary",  required:true,  type:"text",   hint:"Januari, Februari, dst."},
      {key:"year",              label:"Tahun",                           group:"primary",  required:true,  type:"text",   hint:"Format: 2026"},
      {key:"mobo_modal",        label:"Total Alokasi Mobo",              group:"mobo",     required:false, type:"numeric"},
      {key:"mobo_jual",         label:"Total Penjualan Saldo ke Outlet", group:"mobo",     required:false, type:"numeric"},
      {key:"qty_sp_3gb_im3",    label:"Qty SP 3GB IM3",                  group:"sp",       required:false, type:"numeric"},
      {key:"retail_sp_3gb_im3", label:"Retail SP 3GB IM3",               group:"sp",       required:false, type:"numeric"},
      {key:"qty_sp_0_im3",      label:"Qty SP 0 IM3",                    group:"sp",       required:false, type:"numeric"},
      {key:"retail_sp_0_im3",   label:"Retail SP 0 IM3",                 group:"sp",       required:false, type:"numeric"},
      {key:"qty_sp_kpk_3id",    label:"Qty SP KPK 3ID",                  group:"sp",       required:false, type:"numeric"},
      {key:"retail_sp_kpk_3id", label:"Retail SP KPK 3ID",               group:"sp",       required:false, type:"numeric"},
      {key:"qty_sp_3gb_3id",    label:"Qty SP 3GB 3ID",                  group:"sp",       required:false, type:"numeric"},
      {key:"retail_sp_3gb_3id", label:"Retail SP 3GB 3ID",               group:"sp",       required:false, type:"numeric"},
      {key:"qty_vc_0_im3",        label:"Qty VC 0 IM3",            group:"vc", required:false, type:"numeric"},
      {key:"retail_vc_0_im3",     label:"Retail VC 0 IM3",          group:"vc", required:false, type:"numeric"},
      {key:"qty_vc_2_5gb",        label:"Qty VC 2.5GB",             group:"vc", required:false, type:"numeric"},
      {key:"retail_vc_2_5gb",     label:"Retail VC 2.5GB",          group:"vc", required:false, type:"numeric"},
      {key:"qty_vc_3gb_30",       label:"Qty VC 3GB/30",            group:"vc", required:false, type:"numeric"},
      {key:"retail_vc_3gb_30",    label:"Retail VC 3GB/30",         group:"vc", required:false, type:"numeric"},
      {key:"qty_vc_3_5gb_5d",     label:"Qty VC 3.5GB/5D",          group:"vc", required:false, type:"numeric"},
      {key:"retail_vc_3_5gb_5d",  label:"Retail VC 3.5GB/5D",       group:"vc", required:false, type:"numeric"},
      {key:"qty_vc_5gb_5d",       label:"Qty VC 5GB/5D",            group:"vc", required:false, type:"numeric"},
      {key:"retail_vc_5gb_5d",    label:"Retail VC 5GB/5D",         group:"vc", required:false, type:"numeric"},
      {key:"qty_vc_7gb_7d",       label:"Qty VC 7GB/7D",            group:"vc", required:false, type:"numeric"},
      {key:"retail_vc_7gb_7d",    label:"Retail VC 7GB/7D",         group:"vc", required:false, type:"numeric"},
      {key:"qty_vc_fi_4gb",       label:"Qty VC FI 4GB",            group:"vc", required:false, type:"numeric"},
      {key:"retail_vc_fi_4gb",    label:"Retail VC FI 4GB",         group:"vc", required:false, type:"numeric"},
      {key:"qty_vc_fi_1_5gb_1d",  label:"Qty VC FI 1.5GB/1D",       group:"vc", required:false, type:"numeric"},
      {key:"retail_vc_fi_1_5gb_1d",label:"Retail VC FI 1.5GB/1D",  group:"vc", required:false, type:"numeric"},
      {key:"qty_vc_fi_3gb_1d",    label:"Qty VC FI 3GB/1D",         group:"vc", required:false, type:"numeric"},
      {key:"retail_vc_fi_3gb_1d", label:"Retail VC FI 3GB/1D",      group:"vc", required:false, type:"numeric"},
      {key:"qty_vc_fi_5gb_2d",    label:"Qty VC FI 5GB/2D",         group:"vc", required:false, type:"numeric"},
      {key:"retail_vc_fi_5gb_2d", label:"Retail VC FI 5GB/2D",      group:"vc", required:false, type:"numeric"},
      {key:"qty_vc_fi_3gb_3d",    label:"Qty VC FI 3GB/3D",         group:"vc", required:false, type:"numeric"},
      {key:"retail_vc_fi_3gb_3d", label:"Retail VC FI 3GB/3D",      group:"vc", required:false, type:"numeric"},
      {key:"qty_vc_fi_5gb_3d",    label:"Qty VC FI 5GB/3D",         group:"vc", required:false, type:"numeric"},
      {key:"retail_vc_fi_5gb_3d", label:"Retail VC FI 5GB/3D",      group:"vc", required:false, type:"numeric"},
      {key:"qty_vc_fi_15gb_7d",   label:"Qty VC FI 15GB/7D",        group:"vc", required:false, type:"numeric"},
      {key:"retail_vc_fi_15gb_7d",label:"Retail VC FI 15GB/7D",     group:"vc", required:false, type:"numeric"},
      {key:"qty_vc_0_3id",        label:"Qty VC 0 3ID",             group:"vc", required:false, type:"numeric"},
      {key:"retail_vc_0_3id",     label:"Retail VC 0 3ID",          group:"vc", required:false, type:"numeric"},
      {key:"realtime_margin",   label:"Realtime Margin",                 group:"salesfee", required:false, type:"numeric"},
      {key:"back_margin",       label:"Back Margin",                     group:"salesfee", required:false, type:"numeric"},
      {key:"sla_fee",           label:"SLA Monthly Fee",                 group:"salesfee", required:false, type:"numeric"},
      {key:"special_program",   label:"Special Program",                 group:"salesfee", required:false, type:"numeric"},
      {key:"rewards_champions", label:"Hadiah Champions Club",           group:"rewards",  required:false, type:"numeric"},
      {key:"rewards_lainnya",   label:"Hadiah Lainnya",                  group:"rewards",  required:false, type:"numeric"},
      {key:"partner_income",    label:"Pendapatan Partner (Manual)",     group:"rewards",  required:false, type:"numeric"},
    ],
  },
  pengeluaran: {
    id: "pengeluaran", label: "Form Pengeluaran",
    description: "OPEX, SDM, dan Marketing — biaya operasional partner",
    primaryKeys: ["partner_name","branch","mpc_mp3","month","year"],
    fields: [
      {key:"partner_name",             label:"Nama Partner",               group:"primary", required:true,  type:"text"},
      {key:"branch",                   label:"Branch / Cabang",            group:"primary", required:true,  type:"text"},
      {key:"mpc_mp3",                  label:"MPC / MP3",                  group:"primary", required:true,  type:"text"},
      {key:"month",                    label:"Bulan",                      group:"primary", required:true,  type:"text"},
      {key:"year",                     label:"Tahun",                      group:"primary", required:true,  type:"text"},
      {key:"qty_opex_gedung",          label:"Qty OPEX Gedung",            group:"opex",    required:false, type:"numeric"},
      {key:"price_opex_gedung",        label:"Harga OPEX Gedung",          group:"opex",    required:false, type:"numeric"},
      {key:"qty_opex_kendaraan",       label:"Qty Kendaraan",              group:"opex",    required:false, type:"numeric"},
      {key:"price_opex_kendaraan",     label:"Harga Kendaraan",            group:"opex",    required:false, type:"numeric"},
      {key:"qty_opex_listrik",         label:"Qty Listrik",                group:"opex",    required:false, type:"numeric"},
      {key:"price_opex_listrik",       label:"Harga Listrik",              group:"opex",    required:false, type:"numeric"},
      {key:"qty_opex_air",             label:"Qty Air",                    group:"opex",    required:false, type:"numeric"},
      {key:"price_opex_air",           label:"Harga Air",                  group:"opex",    required:false, type:"numeric"},
      {key:"qty_opex_it",              label:"Qty IT & Telekomunikasi",    group:"opex",    required:false, type:"numeric"},
      {key:"price_opex_it",            label:"Harga IT & Telekomunikasi",  group:"opex",    required:false, type:"numeric"},
      {key:"qty_opex_logistik",        label:"Qty Logistik / Gudang",      group:"opex",    required:false, type:"numeric"},
      {key:"price_opex_logistik",      label:"Harga Logistik / Gudang",    group:"opex",    required:false, type:"numeric"},
      {key:"qty_opex_asuransi",        label:"Qty Asuransi Aset",          group:"opex",    required:false, type:"numeric"},
      {key:"price_opex_asuransi",      label:"Harga Asuransi Aset",        group:"opex",    required:false, type:"numeric"},
      {key:"qty_opex_lain",            label:"Qty OPEX Lain-lain",         group:"opex",    required:false, type:"numeric"},
      {key:"price_opex_lain",          label:"Harga OPEX Lain-lain",       group:"opex",    required:false, type:"numeric"},
      {key:"qty_sdm_bm",               label:"Qty Benefit BM",             group:"sdm",     required:false, type:"numeric"},
      {key:"price_sdm_bm",             label:"Gaji BM",                    group:"sdm",     required:false, type:"numeric"},
      {key:"qty_sdm_tm",               label:"Qty Benefit TM",             group:"sdm",     required:false, type:"numeric"},
      {key:"price_sdm_tm",             label:"Gaji TM",                    group:"sdm",     required:false, type:"numeric"},
      {key:"qty_sdm_om",               label:"Qty Operational Manager",    group:"sdm",     required:false, type:"numeric"},
      {key:"price_sdm_om",             label:"Gaji Operational Manager",   group:"sdm",     required:false, type:"numeric"},
      {key:"qty_sdm_gm",               label:"Qty Benefit GM",             group:"sdm",     required:false, type:"numeric"},
      {key:"price_sdm_gm",             label:"Gaji GM",                    group:"sdm",     required:false, type:"numeric"},
      {key:"qty_sdm_hrd",              label:"Qty HRD",                    group:"sdm",     required:false, type:"numeric"},
      {key:"price_sdm_hrd",            label:"Gaji HRD",                   group:"sdm",     required:false, type:"numeric"},
      {key:"qty_sdm_mis",              label:"Qty MIS",                    group:"sdm",     required:false, type:"numeric"},
      {key:"price_sdm_mis",            label:"Gaji MIS",                   group:"sdm",     required:false, type:"numeric"},
      {key:"qty_sdm_som",              label:"Qty SOM",                    group:"sdm",     required:false, type:"numeric"},
      {key:"price_sdm_som",            label:"Gaji SOM",                   group:"sdm",     required:false, type:"numeric"},
      {key:"qty_sdm_finance_spv",      label:"Qty Finance SPV",            group:"sdm",     required:false, type:"numeric"},
      {key:"price_sdm_finance_spv",    label:"Gaji Finance SPV",           group:"sdm",     required:false, type:"numeric"},
      {key:"qty_sdm_finance_staff",    label:"Qty Finance Staff",          group:"sdm",     required:false, type:"numeric"},
      {key:"price_sdm_finance_staff",  label:"Gaji Finance Staff",         group:"sdm",     required:false, type:"numeric"},
      {key:"qty_sdm_ob",               label:"Qty OB",                     group:"sdm",     required:false, type:"numeric"},
      {key:"price_sdm_ob",             label:"Gaji OB",                    group:"sdm",     required:false, type:"numeric"},
      {key:"qty_sdm_tss",              label:"Qty Territory Sales SPV",    group:"sdm",     required:false, type:"numeric"},
      {key:"price_sdm_tss",            label:"Gaji Territory Sales SPV",   group:"sdm",     required:false, type:"numeric"},
      {key:"qty_sdm_admin",            label:"Qty Admin & WH",             group:"sdm",     required:false, type:"numeric"},
      {key:"price_sdm_admin",          label:"Gaji Admin & WH",            group:"sdm",     required:false, type:"numeric"},
      {key:"qty_sdm_finance",          label:"Qty Finance",                group:"sdm",     required:false, type:"numeric"},
      {key:"price_sdm_finance",        label:"Gaji Finance",               group:"sdm",     required:false, type:"numeric"},
      {key:"qty_sdm_md",               label:"Qty MD",                     group:"sdm",     required:false, type:"numeric"},
      {key:"price_sdm_md",             label:"Gaji MD",                    group:"sdm",     required:false, type:"numeric"},
      {key:"qty_sdm_ss",               label:"Qty Sales Support",          group:"sdm",     required:false, type:"numeric"},
      {key:"price_sdm_ss",             label:"Gaji Sales Support",         group:"sdm",     required:false, type:"numeric"},
      {key:"qty_sdm_ops",              label:"Qty Operasional Staff",      group:"sdm",     required:false, type:"numeric"},
      {key:"price_sdm_ops",            label:"Gaji Operasional Staff",     group:"sdm",     required:false, type:"numeric"},
      {key:"qty_sdm_dinas",            label:"Qty Perjalanan Dinas",       group:"sdm",     required:false, type:"numeric"},
      {key:"price_sdm_dinas",          label:"Biaya Perjalanan Dinas",     group:"sdm",     required:false, type:"numeric"},
      {key:"qty_sdm_benefit_sales",    label:"Qty Benefit Sales",          group:"sdm",     required:false, type:"numeric"},
      {key:"price_sdm_benefit_sales",  label:"Biaya Benefit Sales",        group:"sdm",     required:false, type:"numeric"},
      {key:"qty_sdm_benefit_nonsales", label:"Qty Benefit Non-Sales",      group:"sdm",     required:false, type:"numeric"},
      {key:"price_sdm_benefit_nonsales",label:"Biaya Benefit Non-Sales",   group:"sdm",     required:false, type:"numeric"},
      {key:"qty_mkt_ws",               label:"Qty Program WS",             group:"mkt",     required:false, type:"numeric"},
      {key:"price_mkt_ws",             label:"Biaya Program WS",           group:"mkt",     required:false, type:"numeric"},
      {key:"qty_mkt_retail",           label:"Qty Program Retail",         group:"mkt",     required:false, type:"numeric"},
      {key:"price_mkt_retail",         label:"Biaya Program Retail",       group:"mkt",     required:false, type:"numeric"},
      {key:"qty_mkt_starter",          label:"Qty Diskon Starter Pack",    group:"mkt",     required:false, type:"numeric"},
      {key:"price_mkt_starter",        label:"Biaya Diskon Starter Pack",  group:"mkt",     required:false, type:"numeric"},
      {key:"qty_mkt_event",            label:"Qty Program Event",          group:"mkt",     required:false, type:"numeric"},
      {key:"price_mkt_event",          label:"Biaya Program Event",        group:"mkt",     required:false, type:"numeric"},
      {key:"partner_expense",          label:"Pengeluaran Partner (Manual)",group:"mkt",    required:false, type:"numeric"},
      {key:"qty_com_admin",            label:"Qty Biaya Administrasi",     group:"com",     required:false, type:"numeric"},
      {key:"price_com_admin",          label:"Biaya Administrasi",         group:"com",     required:false, type:"numeric"},
      {key:"qty_com_bunga",            label:"Qty Bunga Pinjaman Bank",    group:"com",     required:false, type:"numeric"},
      {key:"price_com_bunga",          label:"Bunga Pinjaman Bank",        group:"com",     required:false, type:"numeric"},
    ],
  },

};

const GROUP_META = {
  primary:  { label: "🔑 Primary Key",    desc: "Identifikasi unik laporan" },
  mobo:     { label: "💰 Saldo Mobo",     desc: "" },
  sp:       { label: "📦 Starter Pack",   desc: "" },
  vc:       { label: "🎫 Voucher",        desc: "" },
  salesfee: { label: "⚡ Sales Fee",      desc: "" },
  rewards:  { label: "🏆 Rewards",        desc: "" },
  opex:     { label: "🏢 OPEX",           desc: "" },
  sdm:      { label: "👥 SDM / HR",       desc: "" },
  mkt:      { label: "📣 Marketing",      desc: "" },
  com:      { label: "💳 Cost of Money",  desc: "" },
};


/* ─────────────────────────────────────────────────────────────────────────────
   NUMBER PARSING  — handles ID / EN formats, plain integers, strings from DB
   ───────────────────────────────────────────────────────────────────────────── */
function detectSep(samples){
  let id=0,en=0;
  for(const raw of samples){
    const s=String(raw).trim();
    if(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s))id+=3;
    else if(/\.\d{3}/.test(s))id+=1;
    if(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s))en+=3;
    else if(/,\d{3}/.test(s))en+=1;
  }
  return id>=en?"id":"en";
}

function pNum(raw,style){
  if(raw===null||raw===undefined)return null;
  if(typeof raw==="number")return isNaN(raw)?null:raw;
  let s=String(raw).trim().replace(/[Rp$€£\u00a0]/g,"").replace(/\s/g,"");
  if(!s||s==="-"||s==="—")return null;
  if(/^-?\d+$/.test(s))return parseInt(s,10);
  if(/^-?\d+\.\d+$/.test(s))return parseFloat(s);
  if(style==="id"){
    if(/\./.test(s)&&/,/.test(s))s=s.replace(/\./g,"").replace(",",".");
    else if(/,/.test(s)){
      const p=s.split(",");
      s=p.length===2&&p[1].length<=2?s.replace(",","."):s.replace(/,/g,"");
    } else if(/\./.test(s)){
      const p=s.split(".");
      if(p.length===2&&p[1].length===3)s=s.replace(/\./g,"");
    }
  } else {
    if(/,/.test(s)&&/\./.test(s))s=s.replace(/,/g,"");
    else if(/,/.test(s)){
      const p=s.split(",");
      s=p.length===2&&p[1].length<=2?s.replace(",","."):s.replace(/,/g,"");
    }
  }
  const n=parseFloat(s);
  return isNaN(n)?null:n;
}

/* Per-column decimal formatting:
   - INCREASE: adds trailing zeros (1500 → 1,500.0 → 1,500.00)
   - DECREASE: never removes significant digits (1500.50 → 1,500.5 → 1,500 at 0)
   If the value has no fractional part, increasing adds ".0"
   If decreasing at 0, nothing changes (already integer)
*/
function fmtCol(val,dec,style,isDb){
  /* isDb: value came from Supabase (may be string "1500000") */
  const n=typeof val==="number"?val:pNum(val,style);
  if(n===null||n===undefined)return"—";
  /* Determine actual decimal places in the number */
  const str=String(n);
  const dotIdx=str.indexOf(".");
  const naturalDec=dotIdx>=0?str.length-dotIdx-1:0;
  /* Effective decimals: max of requested and natural (never truncate) */
  const effDec=Math.max(dec,0);
  /* But we also respect "decrease doesn't remove digits" — if dec < naturalDec, show naturalDec */
  const showDec=dec>=naturalDec?dec:naturalDec;
  return new Intl.NumberFormat(style==="id"?"id-ID":"en-US",{
    minimumFractionDigits:showDec,
    maximumFractionDigits:Math.max(showDec,dec),
  }).format(n);
}

function dispRaw(raw,isNum,dec,style){
  if(raw===undefined||raw===null||raw==="")return"—";
  if(!isNum)return String(raw);
  const n=pNum(raw,style);
  return n===null?"—":fmtCol(n,dec,style,false);
}

/* ─────────────────────────────────────────────────────────────────────────────
   UTILITIES
   ───────────────────────────────────────────────────────────────────────────── */
function autoMatch(cols,fields){
  const map={},used=new Set();
  const n=s=>s.toLowerCase().replace(/[\s_\-\.\/]/g,"").replace(/[^a-z0-9]/g,"");
  for(const f of fields){
    const nt=n(f.key),nl=n(f.label);
    let best=null,bs=0;
    for(const c of cols){
      if(used.has(c))continue;
      const nc=n(c);
      if(nc===nt||nc===nl){best=c;bs=100;break;}
      let sc=0;
      if(nc.includes(nt)||nt.includes(nc))sc=Math.max(sc,60);
      if(nc.includes(nl)||nl.includes(nc))sc=Math.max(sc,55);
      if(sc>bs){bs=sc;best=c;}
    }
    if(best&&bs>=55){map[f.key]=best;used.add(best);}
  }
  return map;
}

function dlTemplate(fd){
  const h=fd.fields.map(f=>f.key);
  const ex={};
  fd.fields.forEach(f=>{
    ex[f.key]=f.key==="month"?"Mei":f.key==="year"?"2026":
      f.key==="mpc_mp3"?"MPC":f.required?`[${f.label}]`:
      f.type==="numeric"?0:"";
  });
  const ws=XLSX.utils.json_to_sheet([ex],{header:h});
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,"Template");
  XLSX.writeFile(wb,`template_${fd.id}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

function relTime(d){
  if(!d)return null;
  const s=Math.round((Date.now()-d)/1000);
  if(s<5)return"baru saja";
  if(s<60)return`${s}d lalu`;
  if(s<3600)return`${Math.round(s/60)}m lalu`;
  return`${Math.round(s/3600)}j lalu`;
}

/* ─────────────────────────────────────────────────────────────────────────────
   MICRO COMPONENTS
   ───────────────────────────────────────────────────────────────────────────── */
function Chip({label,used,onDrag}){
  return(
    <div draggable={!used}
      onDragStart={onDrag}
      style={{display:"inline-flex",alignItems:"center",gap:4,
        padding:"3px 9px",borderRadius:7,
        background:used?"transparent":"transparent",
        border:`1px solid ${used?"var(--gb)":"var(--line)"}`,
        fontSize:11.5,fontWeight:500,
        color:used?"var(--G)":"var(--t1)",
        cursor:used?"default":"grab",userSelect:"none",
        transition:"all .12s",flexShrink:0,whiteSpace:"nowrap"}}>
      {used?<Link2 size={8} style={{flexShrink:0}}/>:<ArrowUpDown size={8} style={{flexShrink:0}}/>}
      {label}
    </div>
  );
}

function Bdg({c="gray",children}){
  /* c: green|amber|red|blue|gray|acc */
  const S={
    green:{bg:"var(--GL)",bd:"var(--GB)",tx:"var(--G)"},
    amber:{bg:"var(--AL)",bd:"var(--AB)",tx:"var(--A)"},
    red:  {bg:"var(--RL)",bd:"var(--RB)",tx:"var(--R)"},
    blue: {bg:"var(--BL)",bd:"var(--BB)",tx:"var(--B)"},
    acc:  {bg:"var(--accL)",bd:"var(--accB)",tx:"var(--acc)"},
    gray: {bg:"rgba(128,128,128,.10)",bd:"var(--line)",tx:"var(--t2)"},
  };
  const s=S[c]||S.gray;
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:3,
      padding:"2px 7px",borderRadius:99,fontSize:11,fontWeight:600,
      letterSpacing:"-.01em",whiteSpace:"nowrap",
      background:s.bg,border:`1px solid ${s.bd}`,color:s.tx}}>
      {children}
    </span>
  );
}

/* Stepper — per-column decimal */
function DecStepper({value,onChange}){
  return(
    <div style={{display:"inline-flex",alignItems:"center",gap:2,
      padding:"2px 5px",borderRadius:7,
      border:"1px solid var(--line)",background:"var(--inset)"}}>
      <button onClick={()=>onChange(Math.max(0,value-1))}
        style={{width:18,height:18,borderRadius:4,border:"none",
          background:"transparent",cursor:"pointer",display:"flex",
          alignItems:"center",justifyContent:"center",color:"var(--t2)"}}>
        <Minus size={9}/>
      </button>
      <span style={{fontSize:11,fontWeight:700,color:"var(--t1)",
        minWidth:12,textAlign:"center",fontVariantNumeric:"tabular-nums"}}>
        {value}
      </span>
      <button onClick={()=>onChange(Math.min(6,value+1))}
        style={{width:18,height:18,borderRadius:4,border:"none",
          background:"transparent",cursor:"pointer",display:"flex",
          alignItems:"center",justifyContent:"center",color:"var(--t2)"}}>
        <Plus size={9}/>
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
   ───────────────────────────────────────────────────────────────────────────── */
export default function PNL_ImportWizard({theme="dark",onImport,supabase:sb}){
  const d=theme==="dark", t=T(d);

  /* CSS variables injected so child components can use them */
  const cssVars={
    "--t1":t.t1,"--t2":t.t2,"--t3":t.t3,
    "--acc":t.acc,"--accL":t.accL,"--accB":t.accB,
    "--G":t.G,"--GL":t.GL,"--GB":t.GB,
    "--A":t.A,"--AL":t.AL,"--AB":t.AB,
    "--R":t.R,"--RL":t.RL,"--RB":t.RB,
    "--B":t.B,"--BL":t.BL,"--BB":t.BB,
    "--line":t.line,"--lineS":t.lineS,
    "--card":t.card,"--raised":t.raised,"--inset":t.inset,
  };

  /* ── state ── */
  const[file,      setFile]      =useState(null);
  const[workbook,  setWorkbook]  =useState(null);
  const[sheets,    setSheets]    =useState([]);
  const[sheet,     setSheet]     =useState("");
  const[rawRows,   setRawRows]   =useState([]);
  const[headerRow, setHeaderRow] =useState(0);
  const[fileCols,  setFileCols]  =useState([]);
  const[fileRows,  setFileRows]  =useState([]);
  const[numStyle,  setNumStyle]  =useState("id");
  const[formType,  setFormType]  =useState("pendapatan");
  const[dragOver,  setDragOver]  =useState(false);
  const[mapping,   setMapping]   =useState({});
  const[dragField, setDragField] =useState(null);
  const[colQ,      setColQ]      =useState("");
  const[filter,    setFilter]    =useState("all");
  const[importing, setImporting] =useState(false);
  const[result,    setResult]    =useState(null);
  const[existing,  setExisting]  =useState({});
  const[loadingDB, setLoadingDB] =useState(false);
  const[dbError,   setDbError]   =useState(null);
  const[lastSync,  setLastSync]  =useState(null); /* timestamp */
  const[toast,     setToast]     =useState(null);
  /* Per-column decimal: {[fieldKey]: number} */
  const[colDec,    setColDec]    =useState({});
  const fileRef=useRef(null);
  const fd=FORM_DEFS[formType];
  const toast$=(type,msg)=>{setToast({type,msg});setTimeout(()=>setToast(null),4500);};
  const setDec=(key,v)=>setColDec(p=>({...p,[key]:v}));
  const getDec=key=>colDec[key]??0;

  /* ── file parsing ── */
  const applyHeader=useCallback((raw,hRow)=>{
    if(!raw.length){setFileCols([]);setFileRows([]);return;}
    const seen={};
    const hArr=(raw[hRow]||[]).map((h,i)=>{
      const base=String(h||"").trim()||`col_${i}`;
      if(!seen[base]){seen[base]=1;return base;}
      seen[base]++;return`${base}_${seen[base]}`;
    });
    const rows=raw.slice(hRow+1)
      .filter(r=>Array.isArray(r)&&r.some(c=>String(c||"").trim()!==""))
      .map(r=>{const o={};hArr.forEach((h,i)=>{o[h]=r[i]??"";}); return o;});
    setFileCols(hArr);
    setFileRows(rows);
    const samp=[];
    for(const row of rows.slice(0,40))
      for(const v of Object.values(row)){
        const s=String(v||"").trim();
        if(s&&/[\d.,]{2,}/.test(s)&&s.length<20)samp.push(s);
      }
    if(samp.length>=3)setNumStyle(detectSep(samp));
  },[]);

  const parseSheet=useCallback((wb,name)=>{
    const ws=wb.Sheets[name];
    const json=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:false});
    setRawRows(json);
    let h=0;
    for(let i=0;i<Math.min(15,json.length);i++){
      if((json[i]||[]).filter(c=>String(c||"").trim()!=="").length>=3){h=i;break;}
    }
    setHeaderRow(h);applyHeader(json,h);
  },[applyHeader]);

  const loadFile=useCallback(f=>{
    if(!f)return;
    const ext=f.name.split(".").pop().toLowerCase();
    if(!["xlsx","xls","csv"].includes(ext)){
      toast$("error","Format tidak didukung — gunakan .xlsx, .xls, atau .csv");return;
    }
    const r=new FileReader();
    r.onload=e=>{
      try{
        const wb=XLSX.read(new Uint8Array(e.target.result),{type:"array",raw:false});
        setWorkbook(wb);setSheets(wb.SheetNames);setSheet(wb.SheetNames[0]);
        parseSheet(wb,wb.SheetNames[0]);setFile(f);setMapping({});setColDec({});
      }catch(err){toast$("error","Gagal membaca: "+err.message);}
    };
    r.readAsArrayBuffer(f);
  },[parseSheet]);

  /* ── mapping ── */
  const usedCols=useMemo(()=>new Set(Object.values(mapping)),[mapping]);
  const removeMp=k=>setMapping(p=>{const n={...p};delete n[k];return n;});
  const runAuto=()=>{
    const a=autoMatch(fileCols,fd.fields);setMapping(a);
    toast$("success",`Auto-match: ${Object.keys(a).length} / ${fd.fields.length} field dipetakan`);
  };

  /* ── parsed rows ── */
  const parsedRows=useMemo(()=>{
    if(!fileRows.length||!Object.keys(mapping).length)return[];
    return fileRows.map((row,i)=>{
      const out={};let okPK=true;
      for(const f of fd.fields){
        const src=mapping[f.key];
        const raw=src!==undefined?(row[src]??""):"";
        if(f.type==="numeric"){const n=pNum(raw,numStyle);out[f.key]=n!==null?n:(raw!==""?raw:"");}
        else out[f.key]=String(raw||"").trim();
        if(f.required&&(out[f.key]===""||out[f.key]===null))okPK=false;
      }
      const pk=PK.map(k=>String(out[k]||"").trim().toLowerCase()).join("|");
      return{_i:i,_ok:okPK,_pk:pk,...out};
    });
  },[fileRows,mapping,fd,numStyle]);

  const valid    =useMemo(()=>parsedRows.filter(r=>r._ok),[parsedRows]);
  const skipped  =useMemo(()=>parsedRows.filter(r=>!r._ok),[parsedRows]);
  const conflicts=useMemo(()=>valid.filter(r=>existing[r._pk]),[valid,existing]);
  const news     =useMemo(()=>valid.filter(r=>!existing[r._pk]),[valid,existing]);
  const displayed=useMemo(()=>{
    if(filter==="ok")return valid;
    if(filter==="skip")return skipped;
    if(filter==="conflict")return conflicts;
    if(filter==="new")return news;
    return parsedRows;
  },[parsedRows,valid,skipped,conflicts,news,filter]);

  const validation=useMemo(()=>{
    const miss=fd.fields.filter(f=>f.required&&!mapping[f.key]);
    return{miss,ok:miss.length===0,mapped:Object.keys(mapping).length};
  },[mapping,fd]);

  const pkAllMapped=useMemo(()=>PK.every(k=>!!mapping[k]),[mapping]);

  /* ── DB load ── */
  const loadExisting=useCallback(async()=>{
    if(!sb||!parsedRows.length)return;
    const v=parsedRows.filter(r=>r._ok);
    if(!v.length){setExisting({});return;}
    setLoadingDB(true);setDbError(null);
    try{
      const partners=[...new Set(v.map(r=>String(r.partner_name||"").trim()).filter(Boolean))];
      let{data,error}=await sb.from("pnl_reports").select("*").in("partner_name",partners);
      if(!error&&(!data||data.length===0)&&partners.length>0){
        const orF=partners.map(p=>`partner_name.ilike.${p}`).join(",");
        ({data,error}=await sb.from("pnl_reports").select("*").or(orF));
      }
      if(error)throw error;
      const map={};
      (data||[]).forEach(row=>{
        const pk=PK.map(k=>String(row[k]||"").trim().toLowerCase()).join("|");
        map[pk]=row;
      });
      setExisting(map);setLastSync(Date.now());
    }catch(e){
      setDbError(e.message);
      toast$("error","Gagal memuat DB: "+e.message);
    }finally{setLoadingDB(false);}
  },[sb,parsedRows]);

  useEffect(()=>{if(pkAllMapped)loadExisting();},[pkAllMapped,loadExisting]);

  /* ── refresh ticker (shows "X menit lalu") ── */
  const[tick,setTick]=useState(0);
  useEffect(()=>{
    if(!lastSync)return;
    const id=setInterval(()=>setTick(p=>p+1),15000);
    return()=>clearInterval(id);
  },[lastSync]);

  /* ── import ── */
  const doImport=async()=>{
    if(!valid.length){toast$("error","Tidak ada baris valid");return;}
    setImporting(true);
    try{
      let ok=0,fail=0,errs=[];
      const rows=valid.map(row=>{
        const ex=existing[row._pk];
        const base=ex?{...ex}:{};
        ["id","user_id","created_at","updated_at","is_finalized",
         "finalized_at","finalized_by"].forEach(k=>delete base[k]);
        for(const f of fd.fields){
          if(!mapping[f.key])continue;
          if(PK.includes(f.key)){if(!ex)base[f.key]=String(row[f.key]||"").trim();continue;}
          const v=row[f.key];
          base[f.key]=f.type==="numeric"?(typeof v==="number"?v:(pNum(v,numStyle)??0)):String(v||"").trim();
        }
        return base;
      });
      if(sb){
        for(let i=0;i<rows.length;i+=50){
          const{error}=await sb.from("pnl_reports")
            .upsert(rows.slice(i,i+50),{onConflict:"partner_name,branch,mpc_mp3,month,year"});
          if(error){fail+=50;errs.push(error.message);}else ok+=50;
        }
        ok=Math.min(ok,rows.length);fail=rows.length-ok;
      }else{
        await onImport?.(rows,formType);ok=rows.length;
      }
      setResult({ok,fail,total:valid.length,errs});
      toast$(fail===0?"success":"error",
        fail===0?`${ok} baris berhasil diimport`:`${ok} berhasil, ${fail} gagal`);
    }catch(e){toast$("error","Import gagal: "+e.message);}
    finally{setImporting(false);}
  };

  const reset=()=>{
    setFile(null);setWorkbook(null);setSheets([]);setSheet("");
    setRawRows([]);setHeaderRow(0);setFileCols([]);setFileRows([]);
    setMapping({});setResult(null);setFilter("all");setExisting({});
    setColQ("");setColDec({});setLastSync(null);setDbError(null);
    if(fileRef.current)fileRef.current.value="";
  };

  const mappedNonPK=useMemo(()=>
    fd.fields.filter(f=>!PK.includes(f.key)&&mapping[f.key])
  ,[fd,mapping]);

  const skipReason=row=>
    fd.fields.filter(f=>f.required&&(!row[f.key]||row[f.key]===""))
    .map(f=>f.label).slice(0,2).join(", ");

  /* ═══════════════════════════════════════════════════════════════════════════
     GLOBAL CSS
     ═══════════════════════════════════════════════════════════════════════════ */
  const G=`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap');
    *,*::before,*::after{box-sizing:border-box}
    body{-webkit-font-smoothing:antialiased}
    ::-webkit-scrollbar{width:4px;height:4px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:${d?"rgba(255,255,255,0.15)":"rgba(0,0,0,0.14)"};border-radius:99px}
    ::-webkit-scrollbar-thumb:hover{background:${d?"rgba(255,255,255,0.25)":"rgba(0,0,0,0.24)"}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes shimmer{0%{opacity:.5}50%{opacity:1}100%{opacity:.5}}
    .pw{animation:fadeUp .2s cubic-bezier(.22,1,.36,1)}
    input,button,select{font-family:${FF};-webkit-font-smoothing:antialiased}
    input:focus{outline:none}
    .card{background:${t.card};border-radius:14px;border:1px solid ${t.line};box-shadow:${t.s1};overflow:hidden}
    .card-body{padding:0}
    .sh{padding:12px 16px;border-bottom:1px solid ${t.line};
      display:flex;align-items:center;gap:9px;flex-wrap:wrap}
    .sl{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
      color:${t.t2}}
    .inp{background:${t.iBg};border:1px solid ${t.iBd};border-radius:8px;
      color:${t.t1};font-size:12px;transition:border-color .14s,box-shadow .14s}
    .inp:focus{border-color:${t.acc};box-shadow:0 0 0 2.5px ${t.accL}}
    .inp::placeholder{color:${t.t3}}
    /* chip */
    .chip{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:7px;
      border:1px solid ${t.line};font-size:11.5px;font-weight:500;color:${t.t1};
      cursor:grab;user-select:none;transition:all .12s;flex-shrink:0;white-space:nowrap}
    .chip:hover:not(.cu){border-color:${t.accB};color:${t.acc};background:${t.accL};transform:translateY(-1px)}
    .chip.cu{border-color:${t.GB};color:${t.G};background:${t.GL};cursor:default}
    /* slot */
    .slot{border-radius:8px;border:1.5px dashed ${t.line};padding:5px 10px;
      min-height:32px;display:flex;align-items:center;gap:7px;transition:.12s;font-size:11px}
    .slot.ov{border-style:solid;border-color:${t.acc};background:${t.accL}}
    .slot.ok{border-style:solid;border-color:${t.GB};background:${t.GL}}
    .slot.req{border-color:${t.RB};background:${t.RL}}
    /* table */
    .dr:hover td{background:${d?"rgba(255,255,255,0.022)":"rgba(0,0,0,0.016)"}!important}
    .hr{cursor:pointer}
    .hr:hover td{background:${d?"rgba(237,28,36,0.055)":"rgba(237,28,36,0.035)"}!important}
    .hr.sel td{background:${d?"rgba(237,28,36,0.11)":"rgba(237,28,36,0.06)"}!important;
      color:${t.acc}!important;font-weight:600}
    /* form type list */
    .fti{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;
      border-bottom:1px solid ${t.lineS};transition:background .11s}
    .fti:last-child{border-bottom:none}
    .fti:hover{background:${d?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.025)"}}
    .fti.act{background:${t.accL}}
    /* ghost button */
    .gbtn{display:inline-flex;align-items:center;gap:5px;padding:0 10px;height:28px;
      border-radius:7px;border:1px solid ${t.line};background:${t.raised};
      color:${t.t2};font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;
      transition:.12s;white-space:nowrap}
    .gbtn:hover{border-color:${t.acc};color:${t.acc}}
    .gbtn:disabled{opacity:.4;cursor:default}
  `;

  /* ═══════════════════════════════════════════════════════════════════════════
     UPLOAD SCREEN
     ═══════════════════════════════════════════════════════════════════════════ */
  if(!file) return(
    <div style={{width:"100%",fontFamily:FF,color:t.t1,...cssVars}}>
      <style>{G}</style>
      <div className="pw" style={{display:"flex",flexDirection:"column",gap:14,maxWidth:640}}>
        {/* wordmark */}
        <div style={{display:"flex",alignItems:"center",gap:13}}>
          <div style={{width:46,height:46,borderRadius:12,background:t.acc,flexShrink:0,
            display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",
            boxShadow:`0 4px 14px rgba(237,28,36,.30)`}}>
            <FileSpreadsheet size={21} strokeWidth={1.7}/>
          </div>
          <div>
            <div style={{fontSize:19,fontWeight:700,letterSpacing:"-.035em",color:t.t1}}>
              Import Data
            </div>
            <div style={{fontSize:12,color:t.t2,marginTop:2}}>
              Upload Excel · Petakan kolom · Cek diff · Merge ke database
            </div>
          </div>
        </div>

        {/* drop zone */}
        <div className="card"
          onDragOver={e=>{e.preventDefault();setDragOver(true)}}
          onDragLeave={()=>setDragOver(false)}
          onDrop={e=>{e.preventDefault();setDragOver(false);loadFile(e.dataTransfer.files[0]);}}
          onClick={()=>fileRef.current?.click()}
          style={{padding:"52px 28px",textAlign:"center",cursor:"pointer",transition:"all .18s",
            borderColor:dragOver?t.acc:t.line,
            background:dragOver?t.accL:t.card,
            boxShadow:dragOver?`0 0 0 3px ${t.accB},${t.s1}`:t.s1}}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}}
            onChange={e=>{loadFile(e.target.files[0]);e.target.value="";}}/>
          <div style={{width:68,height:68,borderRadius:18,margin:"0 auto 18px",
            background:dragOver?t.acc:t.raised,
            border:`1.5px solid ${dragOver?t.acc:t.line}`,
            display:"flex",alignItems:"center",justifyContent:"center",transition:"all .18s",
            boxShadow:dragOver?"0 6px 20px rgba(237,28,36,.28)":"none"}}>
            <Upload size={27} strokeWidth={1.6} style={{color:dragOver?"#fff":t.t2}}/>
          </div>
          <div style={{fontSize:15,fontWeight:600,color:t.t1,marginBottom:5}}>
            {dragOver?"Lepaskan file di sini":"Klik atau drag & drop"}
          </div>
          <div style={{fontSize:12,color:t.t3}}>.xlsx &nbsp;·&nbsp; .xls &nbsp;·&nbsp; .csv</div>
        </div>

        {/* howto */}
        <div className="card" style={{padding:"14px 16px"}}>
          <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
            <div style={{width:32,height:32,borderRadius:8,background:t.BL,flexShrink:0,
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              <Info size={14} style={{color:t.B}}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:600,color:t.t1,marginBottom:4}}>Cara kerja import</div>
              <div style={{fontSize:12,color:t.t2,lineHeight:1.7}}>
                Preview Excel tampil <strong style={{color:t.t1}}>lengkap</strong> — semua kolom, semua sheet, bisa scroll.
                Petakan kolom ke field form. Data lama dari DB otomatis dimuat saat Primary Key lengkap.
                Tabel diff menampilkan <strong style={{color:t.G}}>Data Baru</strong> vs{" "}
                <strong style={{color:t.R}}>Data Lama</strong> per kolom berdampingan.
                Hanya kolom yang dipetakan yang ditimpa — kolom lain di DB{" "}
                <strong style={{color:t.t1}}>100% aman</strong>.
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
              {Object.values(FORM_DEFS).map(f=>(
                <button key={f.id} className="gbtn"
                  onClick={e=>{e.stopPropagation();dlTemplate(f);}}>
                  <FileDown size={11}/>{f.label.replace("Form ","")}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════════════════════════════════════
     MAIN LAYOUT
     ═══════════════════════════════════════════════════════════════════════════ */
  return(
    <div style={{width:"100%",fontFamily:FF,color:t.t1,...cssVars}}>
      <style>{G}</style>

      {/* ── Toast ── */}
      {toast&&(
        <div style={{position:"fixed",top:66,right:18,zIndex:9999,
          minWidth:260,maxWidth:320,borderRadius:13,overflow:"hidden",
          border:`1px solid ${toast.type==="success"?t.GB:t.RB}`,
          background:t.card,boxShadow:t.s3,animation:"fadeUp .17s ease"}}>
          <div style={{display:"flex",gap:10,padding:"11px 13px",alignItems:"flex-start"}}>
            <div style={{width:28,height:28,borderRadius:7,flexShrink:0,
              background:toast.type==="success"?t.G:t.R,
              display:"flex",alignItems:"center",justifyContent:"center",color:"#fff"}}>
              {toast.type==="success"?<CheckCircle2 size={14}/>:<AlertCircle size={14}/>}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:600,color:t.t1,marginBottom:1}}>
                {toast.type==="success"?"Berhasil":"Gagal"}
              </div>
              <div style={{fontSize:11,color:t.t2,lineHeight:1.5}}>{toast.msg}</div>
            </div>
            <button onClick={()=>setToast(null)}
              style={{background:"none",border:"none",cursor:"pointer",color:t.t3,padding:2}}>
              <X size={12}/>
            </button>
          </div>
          <div style={{height:2,background:toast.type==="success"?t.G:t.R,opacity:.7}}/>
        </div>
      )}

      <div className="pw" style={{display:"flex",flexDirection:"column",gap:12}}>

        {/* ── topbar ── */}
        <div style={{display:"flex",alignItems:"center",gap:11,flexWrap:"wrap"}}>
          <div style={{width:38,height:38,borderRadius:9,background:t.acc,flexShrink:0,
            display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",
            boxShadow:`0 2px 8px rgba(237,28,36,.26)`}}>
            <FileSpreadsheet size={17} strokeWidth={1.7}/>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:600,color:t.t1,
              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {file.name}
            </div>
            <div style={{fontSize:11,color:t.t2,marginTop:2}}>
              {fileRows.length.toLocaleString("id-ID")} baris
              &nbsp;·&nbsp;{fileCols.length} kolom
              &nbsp;·&nbsp;{sheets.length} sheet
            </div>
          </div>
          <button className="gbtn" onClick={()=>dlTemplate(fd)}>
            <FileDown size={11}/>Template
          </button>
          <button className="gbtn" onClick={reset}>
            <X size={11}/>Ganti File
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            CARD 1 — Excel Preview
            ══════════════════════════════════════════════════════════════ */}
        <div className="card">
          <div className="sh">
            <Table2 size={13} style={{color:t.t2,flexShrink:0}}/>
            <span className="sl" style={{flex:1}}>Preview Excel</span>
            {/* sheet tabs */}
            <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
              {sheets.map(s=>(
                <button key={s}
                  onClick={()=>{setSheet(s);parseSheet(workbook,s);setMapping({});}}
                  style={{height:26,padding:"0 10px",borderRadius:6,border:"none",cursor:"pointer",
                    fontSize:11,fontWeight:600,fontFamily:FF,transition:".12s",
                    background:sheet===s?t.acc:"transparent",
                    color:sheet===s?"#fff":t.t2}}>
                  {s}
                </button>
              ))}
            </div>
            {/* number format */}
            <button className="gbtn"
              onClick={()=>setNumStyle(p=>p==="id"?"en":"id")}>
              {numStyle==="id"?"🇮🇩 1.500,50":"🇺🇸 1,500.50"}
            </button>
          </div>
          <div style={{padding:"6px 16px 6px",borderBottom:`1px solid ${t.lineS}`,
            fontSize:11,color:t.t3}}>
            Klik baris untuk memilih sebagai header kolom
          </div>
          {/* full excel table */}
          <div style={{overflowX:"auto",overflowY:"auto",maxHeight:280}}>
            <table style={{borderCollapse:"collapse",fontSize:12,minWidth:"max-content"}}>
              <tbody>
                {rawRows.slice(0,Math.min(200,rawRows.length)).map((row,ri)=>{
                  const isH=ri===headerRow;
                  const cells=Array.isArray(row)?row:Object.values(row);
                  return(
                    <tr key={ri} className={`hr${isH?" sel":""}`}
                      onClick={()=>{setHeaderRow(ri);applyHeader(rawRows,ri);setMapping({});}}>
                      <td style={{padding:"4px 9px",position:"sticky",left:0,zIndex:2,
                        background:isH?t.accL:t.card,
                        borderRight:`1px solid ${t.line}`,
                        borderBottom:`1px solid ${t.lineS}`,
                        width:32,textAlign:"center"}}>
                        <span style={{fontSize:10,fontWeight:600,
                          color:isH?t.acc:t.t3,fontVariantNumeric:"tabular-nums"}}>
                          {ri+1}
                        </span>
                      </td>
                      {cells.map((cell,ci)=>(
                        <td key={ci} style={{padding:"4px 13px",
                          borderBottom:`1px solid ${t.lineS}`,
                          borderRight:`1px solid ${t.lineS}`,
                          color:isH?t.acc:t.t1,fontWeight:isH?600:400,
                          whiteSpace:"nowrap",background:isH?t.accL:"transparent"}}>
                          {String(cell??"")}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{padding:"6px 16px",borderTop:`1px solid ${t.lineS}`,
            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:11,color:t.t3}}>
              {Math.min(200,rawRows.length)} / {rawRows.length} baris
              &nbsp;·&nbsp;Header: baris {headerRow+1}
            </span>
            {fileCols.length>0&&(
              <span style={{fontSize:11,color:t.G,fontWeight:500,
                display:"flex",alignItems:"center",gap:4}}>
                <CheckCircle2 size={10}/>{fileCols.length} kolom terdeteksi
              </span>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            CARD 2 — Form Type List + Mapping
            ══════════════════════════════════════════════════════════════ */}
        <div className="card">
          {/* header with DB status */}
          <div className="sh" style={{gap:10}}>
            <div style={{width:26,height:26,borderRadius:6,background:t.accL,flexShrink:0,
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              <Link2 size={12} style={{color:t.acc}}/>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <span className="sl">Mapping Kolom</span>
              <div style={{marginTop:3,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span style={{fontSize:11,color:t.t2}}>
                  {validation.mapped}/{fd.fields.length} dipetakan
                </span>
                {/* DB status pill */}
                {pkAllMapped&&(
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    {loadingDB?(
                      <span style={{fontSize:11,color:t.A,display:"flex",alignItems:"center",gap:4}}>
                        <Loader2 size={10} style={{animation:"spin 1s linear infinite"}}/>
                        Memuat data DB…
                      </span>
                    ):dbError?(
                      <span style={{fontSize:11,color:t.R,display:"flex",alignItems:"center",gap:4}}>
                        <WifiOff size={10}/>Gagal memuat DB
                      </span>
                    ):lastSync?(
                      <span style={{fontSize:11,color:t.G,display:"flex",alignItems:"center",gap:4}}>
                        <CheckCircle2 size={10}/>
                        {Object.keys(existing).length} record
                        <span style={{color:t.t3,fontSize:10}}>
                          · {relTime(lastSync)}
                        </span>
                      </span>
                    ):(
                      <span style={{fontSize:11,color:t.t3}}>Siap memuat DB…</span>
                    )}
                    {/* manual refresh button */}
                    <button className="gbtn"
                      style={{height:24,padding:"0 8px",fontSize:10}}
                      disabled={loadingDB}
                      onClick={loadExisting}
                      title="Refresh data dari database">
                      <RefreshCw size={10}
                        style={loadingDB?{animation:"spin 1s linear infinite"}:{}}/>
                      Refresh
                    </button>
                  </div>
                )}
                {!validation.ok&&(
                  <span style={{fontSize:11,color:t.R,display:"flex",alignItems:"center",gap:3}}>
                    <AlertTriangle size={10}/>
                    Wajib: {validation.miss.map(f=>f.label).join(", ")}
                  </span>
                )}
              </div>
            </div>
            <button className="gbtn" onClick={runAuto}>
              <Sparkles size={11}/>Auto-match
            </button>
          </div>

          <div style={{display:"flex",height:520,overflow:"hidden"}}>
            {/* ── LEFT PANEL: form type list + columns ── */}
            <div style={{width:220,flexShrink:0,borderRight:`1px solid ${t.line}`,
              display:"flex",flexDirection:"column",overflow:"hidden"}}>

              {/* form type list */}
              <div style={{borderBottom:`1px solid ${t.line}`,flexShrink:0}}>
                <div style={{padding:"8px 13px 5px",display:"flex",alignItems:"center",gap:5}}>
                  <LayoutList size={10} style={{color:t.t3}}/>
                  <span style={{fontSize:9,fontWeight:700,letterSpacing:".07em",
                    textTransform:"uppercase",color:t.t3}}>Jenis Laporan</span>
                </div>
                {Object.values(FORM_DEFS).map(f=>(
                  <div key={f.id}
                    className={`fti${formType===f.id?" act":""}`}
                    onClick={()=>{setFormType(f.id);setMapping({});setColDec({});}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,
                        color:formType===f.id?t.acc:t.t1,
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {f.label.replace("Form ","")}
                      </div>
                      <div style={{fontSize:10,color:t.t3,marginTop:1}}>
                        {f.fields.length} field &nbsp;·&nbsp; {f.fields.filter(x=>x.required).length} wajib
                      </div>
                    </div>
                    {formType===f.id&&(
                      <ChevronRight size={12} style={{color:t.acc,flexShrink:0}}/>
                    )}
                  </div>
                ))}
              </div>

              {/* column chip search */}
              <div style={{padding:"9px 11px",borderBottom:`1px solid ${t.lineS}`,flexShrink:0}}>
                <div style={{position:"relative"}}>
                  <Search size={11} style={{position:"absolute",left:8,top:"50%",
                    transform:"translateY(-50%)",color:t.t3,pointerEvents:"none"}}/>
                  <input className="inp" value={colQ}
                    onChange={e=>setColQ(e.target.value)}
                    placeholder="Cari kolom file…"
                    style={{paddingLeft:26,height:30,width:"100%"}}/>
                </div>
                <div style={{marginTop:5,fontSize:10,color:t.t3}}>
                  {fileCols.length} kolom · drag ke slot →
                </div>
              </div>
              <div style={{flex:1,overflowY:"auto",padding:"9px 11px",
                display:"flex",flexWrap:"wrap",gap:5,alignContent:"flex-start"}}>
                {fileCols
                  .filter(c=>!colQ||c.toLowerCase().includes(colQ.toLowerCase()))
                  .map((col,ci)=>(
                    <div key={`${col}__${ci}`}
                      draggable={!usedCols.has(col)}
                      onDragStart={e=>{
                        e.dataTransfer.setData("col",col);
                        e.dataTransfer.effectAllowed="link";
                      }}
                      className={`chip${usedCols.has(col)?" cu":""}`}>
                      {usedCols.has(col)
                        ?<Link2 size={8} style={{flexShrink:0}}/>
                        :<ArrowUpDown size={8} style={{flexShrink:0}}/>}
                      {col}
                    </div>
                  ))}
              </div>
            </div>

            {/* ── RIGHT PANEL: field slots ── */}
            <div style={{flex:1,overflowY:"auto",padding:"12px 15px",
              display:"flex",flexDirection:"column",gap:16}}>
              {Object.entries(
                fd.fields.reduce((a,f)=>{
                  if(!a[f.group])a[f.group]=[];
                  a[f.group].push(f);return a;
                },{})
              ).map(([group,fields])=>{
                const gc=fields.filter(f=>mapping[f.key]).length;
                return(
                  <div key={group}>
                    {/* group header */}
                    <div style={{display:"flex",alignItems:"center",gap:6,
                      marginBottom:7,paddingBottom:5,
                      borderBottom:`1px solid ${group==="primary"?t.accB:t.lineS}`}}>
                      <span style={{fontSize:9,fontWeight:700,letterSpacing:".07em",
                        textTransform:"uppercase",
                        color:group==="primary"?t.acc:t.t3}}>
                        {(GROUP_META[group]||{}).label||group}
                      </span>
                      {group==="primary"&&(
                        <span style={{fontSize:10,color:t.t3,fontWeight:400,
                          textTransform:"none",letterSpacing:0}}>
                          — petakan semua untuk auto-load DB
                        </span>
                      )}
                      {gc>0&&(
                        <Bdg c="green">{gc}/{fields.length}</Bdg>
                      )}
                    </div>
                    {/* field grid */}
                    <div style={{display:"grid",
                      gridTemplateColumns:"repeat(auto-fill,minmax(185px,1fr))",gap:6}}>
                      {fields.map(f=>{
                        const mp=mapping[f.key];
                        const isOver=dragField===f.key;
                        const isNum=f.type==="numeric";
                        const sc=`slot${isOver?" ov":""}${mp?" ok":""}${!mp&&f.required?" req":""}`;
                        return(
                          <div key={f.key}>
                            <div style={{fontSize:11,fontWeight:500,color:t.t2,
                              marginBottom:3,display:"flex",alignItems:"center",gap:3}}>
                              {f.required&&(
                                <span style={{color:t.R,fontSize:8}}>●</span>
                              )}
                              <span style={{overflow:"hidden",textOverflow:"ellipsis",
                                whiteSpace:"nowrap",flex:1}}>{f.label}</span>
                              {f.required&&<Bdg c="red">wajib</Bdg>}
                            </div>
                            <div className={sc}
                              onDragOver={e=>{e.preventDefault();setDragField(f.key);}}
                              onDragLeave={()=>setDragField(null)}
                              onDrop={e=>{
                                e.preventDefault();
                                const col=e.dataTransfer.getData("col");
                                if(!col)return;
                                setMapping(p=>{
                                  const c=Object.fromEntries(
                                    Object.entries(p).filter(([,v])=>v!==col));
                                  return{...c,[f.key]:col};
                                });
                                setDragField(null);
                              }}>
                              {mp?(
                                <>
                                  <Link2 size={10} style={{color:t.G,flexShrink:0}}/>
                                  <span style={{fontSize:11,fontWeight:500,color:t.G,flex:1,
                                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                    {mp}
                                  </span>
                                  {/* per-column decimal (only for numeric) */}
                                  {isNum&&(
                                    <DecStepper value={getDec(f.key)}
                                      onChange={v=>setDec(f.key,v)}/>
                                  )}
                                  <button onClick={()=>removeMp(f.key)}
                                    style={{background:"none",border:"none",
                                      cursor:"pointer",color:t.t3,padding:2,
                                      display:"flex",flexShrink:0}}>
                                    <X size={10}/>
                                  </button>
                                </>
                              ):(
                                <span style={{color:isOver?t.acc:t.t3,fontStyle:"italic"}}>
                                  {isOver?"Lepaskan di sini…":"Drop kolom di sini"}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            CARD 3 — Diff Table
            ══════════════════════════════════════════════════════════════ */}
        {parsedRows.length>0&&(
          <div className="card">
            <div className="sh" style={{gap:8,flexWrap:"wrap"}}>
              <Database size={13} style={{color:t.t2,flexShrink:0}}/>
              <span className="sl" style={{flex:1}}>Preview Diff</span>
              {/* filter chips */}
              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                {[
                  {k:"all",l:"Semua",n:parsedRows.length,c:t.t2},
                  {k:"ok",l:"Siap",n:valid.length,c:t.G},
                  {k:"conflict",l:"Timpa",n:conflicts.length,c:t.A},
                  {k:"new",l:"Baru",n:news.length,c:t.B},
                  {k:"skip",l:"Skip",n:skipped.length,c:t.R},
                ].map(x=>(
                  <button key={x.k} onClick={()=>setFilter(x.k)}
                    style={{display:"flex",alignItems:"center",gap:4,
                      padding:"3px 9px",height:26,borderRadius:7,
                      border:`1px solid ${filter===x.k?t.acc:t.line}`,
                      background:filter===x.k?t.accL:"transparent",
                      color:filter===x.k?t.acc:t.t2,
                      fontSize:11,fontWeight:500,cursor:"pointer",fontFamily:FF,
                      transition:".12s"}}>
                    <span style={{fontWeight:700,color:x.c}}>{x.n}</span>
                    {x.l}
                  </button>
                ))}
              </div>
            </div>

            {conflicts.length>0&&(
              <div style={{padding:"8px 16px",background:t.AL,
                borderBottom:`1px solid ${t.AB}`,
                display:"flex",alignItems:"center",gap:7}}>
                <AlertTriangle size={12} style={{color:t.A,flexShrink:0}}/>
                <span style={{fontSize:12,color:t.A}}>
                  <strong>{conflicts.length} baris</strong> akan menimpa data yang ada —
                  hanya kolom yang dipetakan yang berubah
                </span>
              </div>
            )}

            <div style={{overflowX:"auto",overflowY:"auto",maxHeight:500}}>
              <table style={{borderCollapse:"collapse",fontSize:12,minWidth:"max-content"}}>
                <thead style={{position:"sticky",top:0,zIndex:10}}>
                  {/* ── SINGLE HEADER ROW — no gap ── */}
                  <tr style={{background:t.raised}}>
                    {/* Status */}
                    <th style={{padding:"9px 11px",position:"sticky",left:0,zIndex:11,
                      background:t.raised,borderBottom:`2px solid ${t.line}`,
                      borderRight:`1px solid ${t.line}`,
                      width:80,minWidth:80,verticalAlign:"middle"}}>
                      <span style={{fontSize:9,fontWeight:700,letterSpacing:".07em",
                        textTransform:"uppercase",color:t.t3}}>Status</span>
                    </th>
                    {/* PK cols */}
                    {PK.map((k,ki)=>{
                      const f=fd.fields.find(x=>x.key===k);
                      return(
                        <th key={k} style={{padding:"9px 11px",textAlign:"left",
                          verticalAlign:"middle",
                          background:t.raised,
                          borderBottom:`2px solid ${t.line}`,
                          borderRight:ki===PK.length-1
                            ?`2px solid ${t.line}`
                            :`1px solid ${t.lineS}`,
                          fontSize:10,fontWeight:700,color:t.acc,
                          whiteSpace:"nowrap",minWidth:120}}>
                          <div>{f?.label||k}</div>
                          <div style={{fontSize:9,fontWeight:400,color:t.t3,marginTop:1}}>PK</div>
                        </th>
                      );
                    })}
                    {/* Per-field: [name / Baru | Lama] — all in one <th> */}
                    {mappedNonPK.map(f=>{
                      const dec=getDec(f.key);
                      return(
                        <th key={f.key} colSpan={2} style={{padding:0,
                          background:t.raised,
                          borderBottom:`2px solid ${t.line}`,
                          borderLeft:`2px solid ${t.line}`,
                          minWidth:220}}>
                          {/* field name row */}
                          <div style={{padding:"5px 11px 3px",borderBottom:`1px solid ${t.lineS}`,
                            display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:11,fontWeight:600,color:t.t1,
                              flex:1,whiteSpace:"nowrap"}}>
                              {f.label}
                            </span>
                            <span style={{fontSize:10,color:t.t3}}>← {mapping[f.key]}</span>
                            {/* per-col decimal stepper */}
                            {f.type==="numeric"&&(
                              <DecStepper value={dec}
                                onChange={v=>setDec(f.key,v)}/>
                            )}
                          </div>
                          {/* sub-labels */}
                          <div style={{display:"flex"}}>
                            <div style={{flex:1,padding:"3px 10px",textAlign:"right",
                              fontSize:10,fontWeight:700,color:t.G,
                              borderRight:`1px solid ${t.lineS}`}}>
                              ↑ Baru
                            </div>
                            <div style={{flex:1,padding:"3px 10px",textAlign:"right",
                              fontSize:10,fontWeight:700,color:t.R,
                              background:d?"rgba(255,69,58,0.035)":"rgba(217,48,37,0.025)"}}>
                              Lama (DB)
                            </div>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((row,idx)=>{
                    const ex=existing[row._pk];
                    const isConflict=row._ok&&!!ex;
                    const isNew=row._ok&&!ex;
                    const rowBg=idx%2===0
                      ?"transparent"
                      :d?"rgba(255,255,255,0.015)":"rgba(0,0,0,0.015)";
                    const stickyBg=isConflict
                      ?(d?"#1A1500":"#FFFBEA")
                      :isNew
                        ?(d?"#001412":"#F0FDF5")
                        :t.card;

                    const nChanges=ex?mappedNonPK.filter(f=>{
                      const nv=row[f.key],ov=ex[f.key];
                      if(f.type==="numeric"){
                        const nn=typeof nv==="number"?nv:pNum(nv,numStyle);
                        return nn!==null&&nn!==pNum(ov,numStyle);
                      }
                      return nv&&String(nv)!==String(ov??"");
                    }).length:0;

                    return(
                      <tr key={row._i} className="dr"
                        style={{background:rowBg,borderBottom:`1px solid ${t.lineS}`}}>
                        {/* status — sticky */}
                        <td style={{padding:"7px 11px",position:"sticky",left:0,zIndex:2,
                          background:stickyBg,borderRight:`1px solid ${t.line}`,
                          verticalAlign:"top",whiteSpace:"nowrap"}}>
                          {!row._ok?(
                            <div>
                              <Bdg c="red">Skip</Bdg>
                              <div style={{fontSize:10,color:t.R,marginTop:3,
                                maxWidth:72,lineHeight:1.4,fontWeight:500,
                                overflow:"hidden",textOverflow:"ellipsis"}}>
                                {skipReason(row)}
                              </div>
                            </div>
                          ):isConflict?(
                            <div>
                              <Bdg c="amber">
                                <AlertTriangle size={9}/> Timpa
                              </Bdg>
                              {nChanges>0&&(
                                <div style={{fontSize:10,color:t.A,
                                  marginTop:3,fontWeight:600}}>
                                  {nChanges} berubah
                                </div>
                              )}
                            </div>
                          ):(
                            <Bdg c="green">
                              <CheckCircle2 size={9}/> Baru
                            </Bdg>
                          )}
                        </td>
                        {/* PK cells */}
                        {PK.map((k,ki)=>(
                          <td key={k} style={{padding:"7px 11px",
                            color:!row[k]&&fd.fields.find(f=>f.key===k)?.required?t.R:t.t1,
                            fontWeight:ki===0?500:400,
                            whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",
                            maxWidth:180,verticalAlign:"top",
                            borderRight:ki===PK.length-1
                              ?`2px solid ${t.line}`
                              :`1px solid ${t.lineS}`,
                            ...(k==="partner_name"?{
                              position:"sticky",left:80,zIndex:2,
                              background:stickyBg,
                            }:{})}}>
                            {String(row[k]||"—")}
                          </td>
                        ))}
                        {/* data pairs */}
                        {mappedNonPK.map(f=>{
                          const nRaw=row[f.key];
                          const oRaw=ex?ex[f.key]:undefined;
                          const isNum=f.type==="numeric";
                          const dec=getDec(f.key);
                          const nDisp=dispRaw(nRaw,isNum,dec,numStyle);
                          const oDisp=oRaw===undefined?"—":dispRaw(oRaw,isNum,dec,numStyle);
                          let changed=false;
                          if(ex&&nDisp!=="—"){
                            if(isNum){
                              const nn=typeof nRaw==="number"?nRaw:pNum(nRaw,numStyle);
                              changed=nn!==null&&nn!==pNum(oRaw,numStyle);
                            } else {
                              changed=String(nRaw)!==String(oRaw??"");
                            }
                          }
                          return(
                            <React.Fragment key={f.key}>
                              <td style={{padding:"7px 10px",textAlign:"right",
                                fontVariantNumeric:"tabular-nums",fontSize:12,
                                borderLeft:`2px solid ${t.line}`,
                                borderRight:`1px solid ${t.lineS}`,
                                verticalAlign:"top",whiteSpace:"nowrap",
                                color:changed?t.G:nDisp==="—"?t.t3:t.t1,
                                fontWeight:changed?600:400,
                                background:changed
                                  ?(d?"rgba(48,209,88,0.055)":"rgba(40,167,69,0.04)")
                                  :"transparent"}}>
                                {nDisp}
                              </td>
                              <td style={{padding:"7px 10px",textAlign:"right",
                                fontVariantNumeric:"tabular-nums",fontSize:12,
                                borderRight:`1px solid ${t.line}`,
                                verticalAlign:"top",whiteSpace:"nowrap",
                                color:changed?t.R:t.t3,
                                fontWeight:changed?600:400,
                                background:d?"rgba(255,255,255,0.018)":"rgba(0,0,0,0.016)"}}>
                                {ex===undefined
                                  ?<span style={{color:t.t3,fontStyle:"italic",fontSize:10}}>—</span>
                                  :oDisp}
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {displayed.length===0&&(
                    <tr><td colSpan={999} style={{padding:"36px",textAlign:"center",
                      color:t.t3,fontSize:13}}>
                      Tidak ada baris untuk filter ini
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{padding:"7px 16px",borderTop:`1px solid ${t.lineS}`,
              display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:t.t3}}>
                {displayed.length.toLocaleString("id-ID")} / {parsedRows.length.toLocaleString("id-ID")} baris
              </span>
              <span style={{fontSize:11,color:t.G,display:"flex",alignItems:"center",gap:4}}>
                <span style={{width:7,height:7,borderRadius:2,background:t.G,display:"inline-block"}}/>
                Data Baru
              </span>
              <span style={{fontSize:11,color:t.R,display:"flex",alignItems:"center",gap:4}}>
                <span style={{width:7,height:7,borderRadius:2,background:t.R,display:"inline-block"}}/>
                Data Lama (DB)
              </span>
              <span style={{fontSize:11,color:t.t3,marginLeft:"auto"}}>
                ← Scroll horizontal untuk semua kolom
              </span>
            </div>
          </div>
        )}

        {/* ── import button / result ── */}
        {!result?(
          <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",
            gap:9,paddingBottom:24,flexWrap:"wrap"}}>
            {valid.length===0&&parsedRows.length>0&&(
              <span style={{fontSize:12,color:t.R,fontWeight:500,
                display:"flex",alignItems:"center",gap:4}}>
                <AlertTriangle size={12}/>Tidak ada baris valid
              </span>
            )}
            {!validation.ok&&valid.length>0&&(
              <span style={{fontSize:12,color:t.A,fontWeight:500,
                display:"flex",alignItems:"center",gap:4}}>
                <AlertTriangle size={12}/>Petakan kolom wajib dulu
              </span>
            )}
            <button onClick={doImport}
              disabled={importing||valid.length===0||!validation.ok}
              style={{display:"inline-flex",alignItems:"center",gap:7,
                height:40,padding:"0 20px",borderRadius:9,border:"none",
                background:"#ED1C24",color:"#fff",fontFamily:FF,
                fontSize:13,fontWeight:600,cursor:"pointer",letterSpacing:"-.01em",
                boxShadow:"0 2px 10px rgba(237,28,36,.28)",
                opacity:importing||valid.length===0||!validation.ok?.44:1,
                transition:"all .14s"}}>
              {importing?(
                <><Loader2 size={14} style={{animation:"spin 1s linear infinite"}}/>
                  Mengimport {valid.length.toLocaleString("id-ID")} baris…</>
              ):(
                <><Download size={14}/>
                  Import {valid.length.toLocaleString("id-ID")} Baris
                  {conflicts.length>0&&(
                    <span style={{opacity:.72,fontWeight:400,fontSize:11}}>
                      &nbsp;· {conflicts.length} timpa
                    </span>
                  )}
                </>
              )}
            </button>
          </div>
        ):(
          <div className="card" style={{padding:"28px 22px",textAlign:"center",marginBottom:24,
            borderColor:result.fail===0?t.GB:t.AB}}>
            <div style={{width:52,height:52,borderRadius:14,margin:"0 auto 14px",
              background:result.fail===0?t.G:t.A,
              display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",
              boxShadow:result.fail===0?"0 4px 18px rgba(48,209,88,.32)":"0 4px 18px rgba(255,214,10,.30)"}}>
              {result.fail===0?<CheckCircle2 size={24}/>:<AlertTriangle size={24}/>}
            </div>
            <div style={{fontSize:18,fontWeight:700,letterSpacing:"-.025em",marginBottom:6,
              color:result.fail===0?t.G:t.A}}>
              {result.fail===0?"Import Berhasil":"Selesai dengan Peringatan"}
            </div>
            <div style={{fontSize:13,color:t.t2,lineHeight:1.75,marginBottom:14}}>
              <strong style={{color:t.G}}>{result.ok.toLocaleString("id-ID")}</strong> berhasil
              &nbsp;·&nbsp;
              <strong style={{color:result.fail?t.R:t.t3}}>{result.fail}</strong> gagal
              &nbsp;·&nbsp;
              total <strong style={{color:t.t1}}>{result.total.toLocaleString("id-ID")}</strong>
            </div>
            {result.fail===0&&(
              <div style={{fontSize:12,color:t.G,marginBottom:18}}>
                Hanya kolom yang dipetakan yang diperbarui — data lain di DB tetap aman
              </div>
            )}
            {result.errs?.length>0&&(
              <div style={{fontSize:12,color:t.R,marginBottom:14}}>{result.errs[0]}</div>
            )}
            <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
              <button className="gbtn" style={{height:32,padding:"0 14px",fontSize:12}}
                onClick={reset}>
                <RefreshCw size={11}/>Import File Baru
              </button>
              <button className="gbtn" style={{height:32,padding:"0 14px",fontSize:12}}
                onClick={()=>setResult(null)}>
                Lihat Data Lagi
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}