"use client";
import React,{useState,useCallback,useRef,useMemo,useEffect}from"react";
import*as XLSX from"xlsx";
import{
  Upload,FileSpreadsheet,X,CheckCircle2,AlertTriangle,Info,
  Loader2,Link2,Download,RefreshCw,Table2,Search,
  FileDown,Database,Sparkles,ChevronRight,LayoutList,
  Clock,WifiOff,History,Save,FolderOpen,ChevronDown,
  Undo2,RotateCcw,XCircle,ShieldCheck,SlidersHorizontal,
  AlertCircle,Check,ArrowRight,Equal,User,
}from"lucide-react";

const FF=`"DM Sans",-apple-system,"Helvetica Neue",sans-serif`;
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);

/* ─────────────────────────────────────────────────────────────
   NOT-NULL DEFAULTS  — semua kolom NOT NULL yang bukan PK (PNL)
   ───────────────────────────────────────────────────────────── */
const PNL_NOT_NULL_DEFAULTS={
  label_mkt_lain_1:"Program Lain",
  qty_mkt_lain_2:0,price_mkt_lain_2:0,label_mkt_lain_2:"",
  qty_mkt_lain_3:0,price_mkt_lain_3:0,label_mkt_lain_3:"",
  qty_mkt_lain_4:0,price_mkt_lain_4:0,label_mkt_lain_4:"",
  qty_mkt_lain_5:0,price_mkt_lain_5:0,label_mkt_lain_5:"",
  qty_mkt_lain_6:0,price_mkt_lain_6:0,label_mkt_lain_6:"",
  qty_mkt_lain_7:0,price_mkt_lain_7:0,label_mkt_lain_7:"",
  qty_mkt_lain_8:0,price_mkt_lain_8:0,label_mkt_lain_8:"",
  qty_mkt_lain_9:0,price_mkt_lain_9:0,label_mkt_lain_9:"",
  qty_mkt_lain_10:0,price_mkt_lain_10:0,label_mkt_lain_10:"",
  attachments_pendapatan:[],
  attachments_pengeluaran:[],
  attachments_marketing:[],
};



/* ─────────────────────────────────────────────────────────────
   DESIGN TOKENS
   ───────────────────────────────────────────────────────────── */
const T=d=>({
  bg:d?"#0E0E10":"#F5F5F7",card:d?"#1C1C1E":"#FFFFFF",
  raised:d?"#242428":"#FAFAFA",inset:d?"#111113":"#EAEAEC",
  line:d?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.09)",
  lineS:d?"rgba(255,255,255,0.045)":"rgba(0,0,0,0.055)",
  t1:d?"#F5F5F7":"#1D1D1F",t2:d?"rgba(245,245,247,0.68)":"rgba(29,29,31,0.68)",
  t3:d?"rgba(245,245,247,0.38)":"rgba(29,29,31,0.42)",
  acc:"#ED1C24",accL:d?"rgba(237,28,36,0.14)":"rgba(237,28,36,0.08)",
  accB:d?"rgba(237,28,36,0.32)":"rgba(237,28,36,0.22)",
  G:d?"#30D158":"#28A745",GL:d?"rgba(48,209,88,0.12)":"rgba(40,167,69,0.09)",
  GB:d?"rgba(48,209,88,0.28)":"rgba(40,167,69,0.23)",
  A:d?"#FFD60A":"#B87400",AL:d?"rgba(255,214,10,0.12)":"rgba(184,116,0,0.09)",
  AB:d?"rgba(255,214,10,0.30)":"rgba(184,116,0,0.24)",
  R:d?"#FF453A":"#D93025",RL:d?"rgba(255,69,58,0.12)":"rgba(217,48,37,0.08)",
  RB:d?"rgba(255,69,58,0.30)":"rgba(217,48,37,0.20)",
  B:d?"#0A84FF":"#0066CC",BL:d?"rgba(10,132,255,0.12)":"rgba(0,102,204,0.08)",
  BB:d?"rgba(10,132,255,0.30)":"rgba(0,102,204,0.22)",
  iBg:d?"rgba(255,255,255,0.05)":"#FFFFFF",iBd:d?"rgba(255,255,255,0.11)":"rgba(0,0,0,0.15)",
  s1:d?"0 1px 3px rgba(0,0,0,0.55)":"0 1px 2px rgba(0,0,0,0.06),0 0 0 1px rgba(0,0,0,0.04)",
  s3:d?"0 20px 60px rgba(0,0,0,0.72)":"0 20px 50px rgba(0,0,0,0.13)",
});

/* ─────────────────────────────────────────────────────────────
   FORM DEFINITIONS
   Setiap form punya: pk[], table, conflictKey, notNullDefaults
   ───────────────────────────────────────────────────────────── */
const FORM_DEFS={
  sdp_rekap:{
    id:"sdp_rekap",label:"Rekap Data SDP",
    description:"Import data bulanan SDP: status usaha, owner, kontak",
    pk:["sdp_id","period"],
    table:"sdp_monthly_data",
    conflictKey:"sdp_id,period",
    notNullDefaults:{},
    fields:[
      {key:"sdp_id",    label:"SDP ID",              group:"primary",required:true, type:"text"},
      {key:"period",    label:"Periode",              group:"primary",required:true, type:"period_select"},
      {key:"status_usaha",          label:"Status Usaha",          group:"data",required:false,type:"text"},
      {key:"nama_owner",            label:"Nama Owner",            group:"data",required:false,type:"text"},
      {key:"nik",                   label:"NIK",                   group:"data",required:false,type:"text"},
      {key:"no_ottocash",           label:"No Ottocash",           group:"data",required:false,type:"text"},
      {key:"alamat",                label:"Alamat",                group:"data",required:false,type:"text"},
      {key:"email_owner",           label:"Email Owner",           group:"data",required:false,type:"text"},
      {key:"email_pic_list",        label:"Email PIC (pisah koma)",group:"data",required:false,type:"array"},
      {key:"no_whatsapp",           label:"No WhatsApp",           group:"data",required:false,type:"text"},
      {key:"terminate_status",      label:"Status Kemitraan",       group:"status",required:false,type:"text"},
      {key:"bsm_status",            label:"Status BSM",             group:"status",required:false,type:"text"},
    ],
  },
  pendapatan:{
    id:"pendapatan",label:"Form Pendapatan",
    description:"Margin produk, Saldo Mobo, Sales Fee, Rewards",
    pk:["partner_name","branch","mpc_mp3","month","year"],
    table:"pnl_reports",
    conflictKey:"partner_name,branch,mpc_mp3,month,year",
    notNullDefaults:PNL_NOT_NULL_DEFAULTS,
    fields:[
      {key:"partner_name",label:"Nama Partner",group:"primary",required:true,type:"text"},
      {key:"branch",label:"Branch / Cabang",group:"primary",required:true,type:"text"},
      {key:"mpc_mp3",label:"MPC / MP3",group:"primary",required:true,type:"text"},
      {key:"month",label:"Bulan",group:"primary",required:true,type:"text"},
      {key:"year",label:"Tahun",group:"primary",required:true,type:"text"},
      {key:"mobo_modal",label:"Total Alokasi Mobo",group:"mobo",required:false,type:"numeric"},
      {key:"mobo_jual",label:"Total Penjualan Saldo ke Outlet",group:"mobo",required:false,type:"numeric"},
      {key:"qty_sp_3gb_im3",label:"Qty SP 3GB IM3",group:"sp",required:false,type:"numeric"},
      {key:"retail_sp_3gb_im3",label:"Retail SP 3GB IM3",group:"sp",required:false,type:"numeric"},
      {key:"qty_sp_0_im3",label:"Qty SP 0 IM3",group:"sp",required:false,type:"numeric"},
      {key:"retail_sp_0_im3",label:"Retail SP 0 IM3",group:"sp",required:false,type:"numeric"},
      {key:"qty_sp_kpk_3id",label:"Qty SP KPK 3ID",group:"sp",required:false,type:"numeric"},
      {key:"retail_sp_kpk_3id",label:"Retail SP KPK 3ID",group:"sp",required:false,type:"numeric"},
      {key:"qty_sp_3gb_3id",label:"Qty SP 3GB 3ID",group:"sp",required:false,type:"numeric"},
      {key:"retail_sp_3gb_3id",label:"Retail SP 3GB 3ID",group:"sp",required:false,type:"numeric"},
      {key:"qty_vc_0_im3",label:"Qty VC 0 IM3",group:"vc",required:false,type:"numeric"},
      {key:"retail_vc_0_im3",label:"Retail VC 0 IM3",group:"vc",required:false,type:"numeric"},
      {key:"qty_vc_2_5gb",label:"Qty VC 2.5GB",group:"vc",required:false,type:"numeric"},
      {key:"retail_vc_2_5gb",label:"Retail VC 2.5GB",group:"vc",required:false,type:"numeric"},
      {key:"qty_vc_3gb_30",label:"Qty VC 3GB/30",group:"vc",required:false,type:"numeric"},
      {key:"retail_vc_3gb_30",label:"Retail VC 3GB/30",group:"vc",required:false,type:"numeric"},
      {key:"qty_vc_3_5gb_5d",label:"Qty VC 3.5GB/5D",group:"vc",required:false,type:"numeric"},
      {key:"retail_vc_3_5gb_5d",label:"Retail VC 3.5GB/5D",group:"vc",required:false,type:"numeric"},
      {key:"qty_vc_5gb_5d",label:"Qty VC 5GB/5D",group:"vc",required:false,type:"numeric"},
      {key:"retail_vc_5gb_5d",label:"Retail VC 5GB/5D",group:"vc",required:false,type:"numeric"},
      {key:"qty_vc_7gb_7d",label:"Qty VC 7GB/7D",group:"vc",required:false,type:"numeric"},
      {key:"retail_vc_7gb_7d",label:"Retail VC 7GB/7D",group:"vc",required:false,type:"numeric"},
      {key:"qty_vc_fi_4gb",label:"Qty VC FI 4GB",group:"vc",required:false,type:"numeric"},
      {key:"retail_vc_fi_4gb",label:"Retail VC FI 4GB",group:"vc",required:false,type:"numeric"},
      {key:"qty_vc_fi_1_5gb_1d",label:"Qty VC FI 1.5GB/1D",group:"vc",required:false,type:"numeric"},
      {key:"retail_vc_fi_1_5gb_1d",label:"Retail VC FI 1.5GB/1D",group:"vc",required:false,type:"numeric"},
      {key:"qty_vc_fi_3gb_1d",label:"Qty VC FI 3GB/1D",group:"vc",required:false,type:"numeric"},
      {key:"retail_vc_fi_3gb_1d",label:"Retail VC FI 3GB/1D",group:"vc",required:false,type:"numeric"},
      {key:"qty_vc_fi_5gb_2d",label:"Qty VC FI 5GB/2D",group:"vc",required:false,type:"numeric"},
      {key:"retail_vc_fi_5gb_2d",label:"Retail VC FI 5GB/2D",group:"vc",required:false,type:"numeric"},
      {key:"qty_vc_fi_3gb_3d",label:"Qty VC FI 3GB/3D",group:"vc",required:false,type:"numeric"},
      {key:"retail_vc_fi_3gb_3d",label:"Retail VC FI 3GB/3D",group:"vc",required:false,type:"numeric"},
      {key:"qty_vc_fi_5gb_3d",label:"Qty VC FI 5GB/3D",group:"vc",required:false,type:"numeric"},
      {key:"retail_vc_fi_5gb_3d",label:"Retail VC FI 5GB/3D",group:"vc",required:false,type:"numeric"},
      {key:"qty_vc_fi_15gb_7d",label:"Qty VC FI 15GB/7D",group:"vc",required:false,type:"numeric"},
      {key:"retail_vc_fi_15gb_7d",label:"Retail VC FI 15GB/7D",group:"vc",required:false,type:"numeric"},
      {key:"qty_vc_0_3id",label:"Qty VC 0 3ID",group:"vc",required:false,type:"numeric"},
      {key:"retail_vc_0_3id",label:"Retail VC 0 3ID",group:"vc",required:false,type:"numeric"},
      {key:"realtime_margin",label:"Realtime Margin",group:"salesfee",required:false,type:"numeric"},
      {key:"back_margin",label:"Back Margin",group:"salesfee",required:false,type:"numeric"},
      {key:"sla_fee",label:"SLA Monthly Fee",group:"salesfee",required:false,type:"numeric"},
      {key:"special_program",label:"Tactical Program",group:"salesfee",required:false,type:"numeric"},
      {key:"rewards_champions",label:"Hadiah Champions Club",group:"rewards",required:false,type:"numeric"},
      {key:"rewards_lainnya",label:"Hadiah Lainnya",group:"rewards",required:false,type:"numeric"},
      {key:"partner_income",label:"Pendapatan Partner (Manual)",group:"rewards",required:false,type:"numeric"},
    ],
  },
  pengeluaran:{
    id:"pengeluaran",label:"Form Pengeluaran",
    description:"OPEX, SDM, Marketing — biaya operasional partner",
    pk:["partner_name","branch","mpc_mp3","month","year"],
    table:"pnl_reports",
    conflictKey:"partner_name,branch,mpc_mp3,month,year",
    notNullDefaults:PNL_NOT_NULL_DEFAULTS,
    fields:[
      {key:"partner_name",label:"Nama Partner",group:"primary",required:true,type:"text"},
      {key:"branch",label:"Branch / Cabang",group:"primary",required:true,type:"text"},
      {key:"mpc_mp3",label:"MPC / MP3",group:"primary",required:true,type:"text"},
      {key:"month",label:"Bulan",group:"primary",required:true,type:"text"},
      {key:"year",label:"Tahun",group:"primary",required:true,type:"text"},
      {key:"qty_opex_gedung",label:"Qty OPEX Gedung",group:"opex",required:false,type:"numeric"},
      {key:"price_opex_gedung",label:"Harga OPEX Gedung",group:"opex",required:false,type:"numeric"},
      {key:"qty_opex_kendaraan",label:"Qty Kendaraan",group:"opex",required:false,type:"numeric"},
      {key:"price_opex_kendaraan",label:"Harga Kendaraan",group:"opex",required:false,type:"numeric"},
      {key:"qty_opex_listrik",label:"Qty Listrik",group:"opex",required:false,type:"numeric"},
      {key:"price_opex_listrik",label:"Harga Listrik",group:"opex",required:false,type:"numeric"},
      {key:"qty_opex_air",label:"Qty Air",group:"opex",required:false,type:"numeric"},
      {key:"price_opex_air",label:"Harga Air",group:"opex",required:false,type:"numeric"},
      {key:"qty_opex_it",label:"Qty IT & Telekomunikasi",group:"opex",required:false,type:"numeric"},
      {key:"price_opex_it",label:"Harga IT & Telekomunikasi",group:"opex",required:false,type:"numeric"},
      {key:"qty_opex_logistik",label:"Qty Logistik / Gudang",group:"opex",required:false,type:"numeric"},
      {key:"price_opex_logistik",label:"Harga Logistik / Gudang",group:"opex",required:false,type:"numeric"},
      {key:"qty_opex_asuransi",label:"Qty Asuransi Aset",group:"opex",required:false,type:"numeric"},
      {key:"price_opex_asuransi",label:"Harga Asuransi Aset",group:"opex",required:false,type:"numeric"},
      {key:"qty_opex_lain",label:"Qty OPEX Lain-lain",group:"opex",required:false,type:"numeric"},
      {key:"price_opex_lain",label:"Harga OPEX Lain-lain",group:"opex",required:false,type:"numeric"},
      {key:"qty_sdm_bm",label:"Qty Benefit BM",group:"sdm",required:false,type:"numeric"},
      {key:"price_sdm_bm",label:"Gaji BM",group:"sdm",required:false,type:"numeric"},
      {key:"qty_sdm_tm",label:"Qty Benefit TM",group:"sdm",required:false,type:"numeric"},
      {key:"price_sdm_tm",label:"Gaji TM",group:"sdm",required:false,type:"numeric"},
      {key:"qty_sdm_om",label:"Qty Operational Manager",group:"sdm",required:false,type:"numeric"},
      {key:"price_sdm_om",label:"Gaji Operational Manager",group:"sdm",required:false,type:"numeric"},
      {key:"qty_sdm_gm",label:"Qty Benefit GM",group:"sdm",required:false,type:"numeric"},
      {key:"price_sdm_gm",label:"Gaji GM",group:"sdm",required:false,type:"numeric"},
      {key:"qty_sdm_hrd",label:"Qty HRD",group:"sdm",required:false,type:"numeric"},
      {key:"price_sdm_hrd",label:"Gaji HRD",group:"sdm",required:false,type:"numeric"},
      {key:"qty_sdm_mis",label:"Qty MIS",group:"sdm",required:false,type:"numeric"},
      {key:"price_sdm_mis",label:"Gaji MIS",group:"sdm",required:false,type:"numeric"},
      {key:"qty_sdm_som",label:"Qty SOM",group:"sdm",required:false,type:"numeric"},
      {key:"price_sdm_som",label:"Gaji SOM",group:"sdm",required:false,type:"numeric"},
      {key:"qty_sdm_finance_spv",label:"Qty Finance SPV",group:"sdm",required:false,type:"numeric"},
      {key:"price_sdm_finance_spv",label:"Gaji Finance SPV",group:"sdm",required:false,type:"numeric"},
      {key:"qty_sdm_finance_staff",label:"Qty Finance Staff",group:"sdm",required:false,type:"numeric"},
      {key:"price_sdm_finance_staff",label:"Gaji Finance Staff",group:"sdm",required:false,type:"numeric"},
      {key:"qty_sdm_ob",label:"Qty OB",group:"sdm",required:false,type:"numeric"},
      {key:"price_sdm_ob",label:"Gaji OB",group:"sdm",required:false,type:"numeric"},
      {key:"qty_sdm_tss",label:"Qty Territory Sales SPV",group:"sdm",required:false,type:"numeric"},
      {key:"price_sdm_tss",label:"Gaji Territory Sales SPV",group:"sdm",required:false,type:"numeric"},
      {key:"qty_sdm_admin",label:"Qty Admin & WH",group:"sdm",required:false,type:"numeric"},
      {key:"price_sdm_admin",label:"Gaji Admin & WH",group:"sdm",required:false,type:"numeric"},
      {key:"qty_sdm_finance",label:"Qty Finance",group:"sdm",required:false,type:"numeric"},
      {key:"price_sdm_finance",label:"Gaji Finance",group:"sdm",required:false,type:"numeric"},
      {key:"qty_sdm_md",label:"Qty MD",group:"sdm",required:false,type:"numeric"},
      {key:"price_sdm_md",label:"Gaji MD",group:"sdm",required:false,type:"numeric"},
      {key:"qty_sdm_ss",label:"Qty Sales Support",group:"sdm",required:false,type:"numeric"},
      {key:"price_sdm_ss",label:"Gaji Sales Support",group:"sdm",required:false,type:"numeric"},
      {key:"qty_sdm_ops",label:"Qty Operasional Staff",group:"sdm",required:false,type:"numeric"},
      {key:"price_sdm_ops",label:"Gaji Operasional Staff",group:"sdm",required:false,type:"numeric"},
      {key:"qty_sdm_dinas",label:"Qty Perjalanan Dinas",group:"sdm",required:false,type:"numeric"},
      {key:"price_sdm_dinas",label:"Biaya Perjalanan Dinas",group:"sdm",required:false,type:"numeric"},
      {key:"qty_sdm_benefit_sales",label:"Qty Benefit Sales",group:"sdm",required:false,type:"numeric"},
      {key:"price_sdm_benefit_sales",label:"Biaya Benefit Sales",group:"sdm",required:false,type:"numeric"},
      {key:"qty_sdm_benefit_nonsales",label:"Qty Benefit Non-Sales",group:"sdm",required:false,type:"numeric"},
      {key:"price_sdm_benefit_nonsales",label:"Biaya Benefit Non-Sales",group:"sdm",required:false,type:"numeric"},
      {key:"qty_mkt_ws",label:"Qty Program WS",group:"mkt",required:false,type:"numeric"},
      {key:"price_mkt_ws",label:"Biaya Program WS",group:"mkt",required:false,type:"numeric"},
      {key:"qty_mkt_retail",label:"Qty Program Retail",group:"mkt",required:false,type:"numeric"},
      {key:"price_mkt_retail",label:"Biaya Program Retail",group:"mkt",required:false,type:"numeric"},
      {key:"qty_mkt_starter",label:"Qty Diskon Starter Pack",group:"mkt",required:false,type:"numeric"},
      {key:"price_mkt_starter",label:"Biaya Diskon Starter Pack",group:"mkt",required:false,type:"numeric"},
      {key:"qty_mkt_event",label:"Qty Program Event",group:"mkt",required:false,type:"numeric"},
      {key:"price_mkt_event",label:"Biaya Program Event",group:"mkt",required:false,type:"numeric"},
      {key:"partner_expense",label:"Pengeluaran Partner (Manual)",group:"mkt",required:false,type:"numeric"},
      {key:"qty_com_admin",label:"Qty Biaya Administrasi",group:"com",required:false,type:"numeric"},
      {key:"price_com_admin",label:"Biaya Administrasi",group:"com",required:false,type:"numeric"},
      {key:"qty_com_bunga",label:"Qty Bunga Pinjaman Bank",group:"com",required:false,type:"numeric"},
      {key:"price_com_bunga",label:"Bunga Pinjaman Bank",group:"com",required:false,type:"numeric"},
    ],
  },
};
const GROUP_META={
  primary:{label:"🔑 Primary Key"},mobo:{label:"💰 Saldo Mobo"},
  sp:{label:"📦 Starter Pack"},vc:{label:"🎫 Voucher"},
  salesfee:{label:"⚡ Sales Fee"},rewards:{label:"🏆 Rewards"},
  opex:{label:"🏢 OPEX"},sdm:{label:"👥 SDM / HR"},
  mkt:{label:"📣 Marketing"},com:{label:"💳 Cost of Money"},
  data:{label:"📋 Data SDP"},status:{label:"⚠️ Status Terminate"},
};

/* ─────────────────────────────────────────────────────────────
   NUMBER UTILITIES
   ───────────────────────────────────────────────────────────── */
function pNum(raw){
  if(raw===null||raw===undefined)return null;
  if(typeof raw==="number")return isNaN(raw)?null:Math.round(raw);
  let s=String(raw).trim().replace(/[Rp$€£\u00a0\s]/g,"");
  if(!s||s==="-"||s==="—")return null;
  if(/^-?\d+$/.test(s))return parseInt(s,10);
  const lastDot=s.lastIndexOf("."),lastComma=s.lastIndexOf(",");
  if(lastDot>-1&&lastComma>-1){
    if(lastDot>lastComma)s=s.replace(/,/g,"");
    else s=s.replace(/\./g,"").replace(",",".");
  }else if(lastDot>-1){
    const p=s.split(".");
    if(p[p.length-1].length===3)s=s.replace(/\./g,"");
  }else if(lastComma>-1){
    const p=s.split(",");
    if(p.length===2&&p[1].length<=2)s=s.replace(",",".");
    else s=s.replace(/,/g,"");
  }
  const n=parseFloat(s);return isNaN(n)?null:Math.round(n);
}
function fmtNum(n){
  if(n===null||n===undefined)return"—";
  const r=Math.round(Number(n));
  if(isNaN(r))return"—";
  return new Intl.NumberFormat("id-ID",{maximumFractionDigits:0}).format(r);
}
function dispRaw(raw,isNum){
  if(raw===undefined||raw===null||raw==="")return"—";
  if(!isNum)return String(raw);
  const n=pNum(raw);return n===null?"—":fmtNum(n);
}
function fmtDateTime(iso){
  if(!iso)return"—";
  return new Date(iso).toLocaleString("id-ID",{
    day:"2-digit",month:"short",year:"numeric",
    hour:"2-digit",minute:"2-digit",
  });
}
function relTime(d){
  if(!d)return null;
  const ms=typeof d==="string"?Date.now()-new Date(d).getTime():(Date.now()-d);
  const s=Math.round(ms/1000);
  if(s<5)return"baru saja";if(s<60)return`${s}d lalu`;
  if(s<3600)return`${Math.round(s/60)}m lalu`;
  if(s<86400)return`${Math.round(s/3600)}j lalu`;
  return`${Math.round(s/86400)}h lalu`;
}

/* ─────────────────────────────────────────────────────────────
   UTILITIES
   ───────────────────────────────────────────────────────────── */
function autoMatch(cols,fields){
  const map={},used=new Set();
  const n=s=>s.toLowerCase().replace(/[\s_\-\.\/]/g,"").replace(/[^a-z0-9]/g,"");
  for(const f of fields){
    const nt=n(f.key),nl=n(f.label);let best=null,bs=0;
    for(const c of cols){
      if(used.has(c))continue;const nc=n(c);
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
  const ex={};fd.fields.forEach(f=>{
    ex[f.key]=f.key==="month"?"Mei":f.key==="year"?"2026":
      f.key==="mpc_mp3"?"MPC":f.required?`[${f.label}]`:f.type==="numeric"?0:"";
  });
  const ws=XLSX.utils.json_to_sheet([ex],{header:h});
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Template");
  XLSX.writeFile(wb,`template_${fd.id}_${new Date().toISOString().slice(0,10)}.xlsx`);
}
function saveToLS(key,val){
  try{localStorage.setItem(key,JSON.stringify(val));}catch{}
}
function loadFromLS(key,fallback){
  try{const r=localStorage.getItem(key);return r?JSON.parse(r):fallback;}catch{return fallback;}
}

/* ─────────────────────────────────────────────────────────────
   MICRO COMPONENTS
   ───────────────────────────────────────────────────────────── */
function Bdg({c="gray",children,small}){
  const S={
    green:{bg:"var(--GL)",bd:"var(--GB)",tx:"var(--G)"},
    amber:{bg:"var(--AL)",bd:"var(--AB)",tx:"var(--A)"},
    red:{bg:"var(--RL)",bd:"var(--RB)",tx:"var(--R)"},
    blue:{bg:"var(--BL)",bd:"var(--BB)",tx:"var(--B)"},
    acc:{bg:"var(--accL)",bd:"var(--accB)",tx:"var(--acc)"},
    gray:{bg:"rgba(128,128,128,.10)",bd:"var(--line)",tx:"var(--t2)"},
  };const s=S[c]||S.gray;
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:3,
      padding:small?"1px 5px":"2px 7px",borderRadius:99,
      fontSize:small?10:11,fontWeight:600,letterSpacing:"-.01em",whiteSpace:"nowrap",
      background:s.bg,border:`1px solid ${s.bd}`,color:s.tx}}>
      {children}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function PNL_ImportWizard({theme="dark",onImport,supabase:sb,formTypeProp=null}){
  const d=theme==="dark",t=T(d);
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

  /* ── file / parse ── */
  const[file,setFile]=useState(null);
  const[workbook,setWorkbook]=useState(null);
  const[sheets,setSheets]=useState([]);
  const[sheet,setSheet]=useState("");
  const[rawRows,setRawRows]=useState([]);
  const[headerRow,setHeaderRow]=useState(0);
  const[fileCols,setFileCols]=useState([]);
  const[fileRows,setFileRows]=useState([]);
  const[formType,setFormType]=useState(formTypeProp??"pendapatan");
  const[dragOver,setDragOver]=useState(false);

  /* ── mapping ── */
  const[mapping,setMapping]=useState({});
  const[dragField,setDragField]=useState(null);
  const[colQ,setColQ]=useState("");
  const[fieldQ,setFieldQ]=useState("");
  const[collapsedGroups,setCollapsedGroups]=useState(new Set());
  const[savedMapping,setSavedMapping]=useState(()=>loadFromLS("pnl_saved_mappings",{}));

  /* ── DB / import ── */
  const[existing,setExisting]=useState({});
  const[loadingDB,setLoadingDB]=useState(false);
  const[dbError,setDbError]=useState(null);
  const[lastSync,setLastSync]=useState(null);
  const[filter,setFilter]=useState("all");
  const[importing,setImporting]=useState(false);
  const[importProgress,setImportProgress]=useState(null);
  const[result,setResult]=useState(null);
  const[confirmOpen,setConfirmOpen]=useState(false);

  /* ── change log (SQL) ── */
  const[changeLog,setChangeLog]=useState([]);
  const[logLoading,setLogLoading]=useState(false);
  const[showLog,setShowLog]=useState(false);
  const[revertingId,setRevertingId]=useState(null);
  const[logExpandedSession,setLogExpandedSession]=useState(null);
  const[logExpandedEntry,setLogExpandedEntry]=useState(null);
  const[currentUser,setCurrentUser]=useState(null);

  /* ── SDP fixed values & period list ── */
  const[fixedValues,setFixedValues]=useState({});
  const[sdpPeriods,setSdpPeriods]=useState([]);

  /* ── toast ── */
  const[toast,setToast]=useState(null);
  const[selectedChip,setSelectedChip]=useState(null); // click-to-map
  const fileRef=useRef(null);
  const abortRef=useRef(false);
  const fd=FORM_DEFS[formType];

  /* ── Per-form config (PK, table, conflict key) ── */
  const formPK          = fd?.pk          ?? ["partner_name","branch","mpc_mp3","month","year"];
  const formTable       = fd?.table       ?? "pnl_reports";
  const formConflict    = fd?.conflictKey ?? "partner_name,branch,mpc_mp3,month,year";
  const formDefaults    = fd?.notNullDefaults ?? PNL_NOT_NULL_DEFAULTS;
  const isSDP           = formType === "sdp_rekap";

  const toast$=(type,msg)=>{setToast({type,msg});setTimeout(()=>setToast(null),4500);};

  /* ── keyboard shortcuts ── */
  useEffect(()=>{
    const h=(e)=>{
      if(e.key==="Escape"){
        if(selectedChip){setSelectedChip(null);return;}
        setShowLog(false);setConfirmOpen(false);
      }
      if((e.metaKey||e.ctrlKey)&&e.key==="l"){e.preventDefault();setShowLog(p=>!p);}
    };
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[selectedChip]);

  /* ── get current user ── */
  useEffect(()=>{
    if(!sb)return;
    sb.auth.getUser().then(({data})=>{
      if(data?.user)setCurrentUser({id:data.user.id,email:data.user.email});
    });
  },[sb]);

  /* ── fetch available periods for SDP period_select dropdown ── */
  useEffect(()=>{
    if(!isSDP||!sb)return;
    sb.from("sdp_master").select("period").then(({data})=>{
      const periods=[...new Set((data||[]).map(r=>r.period).filter(Boolean))].sort().reverse();
      setSdpPeriods(periods);
    });
  },[isSDP,sb]);

  /* ─────────────────────────────────────────────────────────
     LOG OPERATIONS — Supabase SQL table (fallback: localStorage)
     ───────────────────────────────────────────────────────── */
  const loadLogsFromDB=useCallback(async()=>{
    if(!sb){
      setChangeLog(loadFromLS("pnl_import_log",[]));
      return;
    }
    setLogLoading(true);
    try{
      const{data,error}=await sb
        .from("pnl_import_logs")
        .select("*")
        .order("created_at",{ascending:false})
        .limit(100);
      if(error)throw error;
      setChangeLog(data||[]);
    }catch(e){
      console.error("load logs error:",e);
      setChangeLog(loadFromLS("pnl_import_log",[]));
    }finally{setLogLoading(false);}
  },[sb]);

  /* Load logs on mount */
  useEffect(()=>{loadLogsFromDB();},[loadLogsFromDB]);

  /* Refresh when log panel opens */
  useEffect(()=>{
    if(showLog)loadLogsFromDB();
  },[showLog]);

  const saveLogEntry=useCallback(async(entry)=>{
    if(!sb){
      const newLog=[{...entry,id:uid(),created_at:new Date().toISOString(),
        updated_at:new Date().toISOString()},...changeLog].slice(0,100);
      setChangeLog(newLog);
      saveToLS("pnl_import_log",newLog);
      return;
    }
    try{
      const{error}=await sb.from("pnl_import_logs").insert({
        form_type:entry.formType,
        file_name:entry.fileName,
        summary:entry.summary,
        entries:entry.entries,
        user_id:currentUser?.id||null,
        user_email:currentUser?.email||null,
      });
      if(error)throw error;
      await loadLogsFromDB();
    }catch(e){
      console.error("save log error:",e);
      toast$("error","Log tidak tersimpan ke DB: "+e.message);
    }
  },[sb,changeLog,currentUser,loadLogsFromDB]);

  const updateLogInDB=useCallback(async(logId,newEntries)=>{
    setChangeLog(prev=>prev.map(l=>l.id===logId?{...l,entries:newEntries,updated_at:new Date().toISOString()}:l));
    if(!sb){
      saveToLS("pnl_import_log",
        changeLog.map(l=>l.id===logId?{...l,entries:newEntries}:l));
      return;
    }
    try{
      const{error}=await sb.from("pnl_import_logs")
        .update({entries:newEntries})
        .eq("id",logId);
      if(error)throw error;
    }catch(e){
      console.error("update log error:",e);
      await loadLogsFromDB();
    }
  },[sb,changeLog,loadLogsFromDB]);

  /* ── tick for relative time ── */
  const[,setTick]=useState(0);
  useEffect(()=>{
    if(!lastSync)return;
    const id=setInterval(()=>setTick(p=>p+1),15000);return()=>clearInterval(id);
  },[lastSync]);

  /* ─────────────────────────────────────────────────────────
     FILE PARSING
     ───────────────────────────────────────────────────────── */
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
      .map(r=>{const o={};hArr.forEach((h,i)=>{o[h]=r[i]??""});return o;});
    setFileCols(hArr);setFileRows(rows);
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
        parseSheet(wb,wb.SheetNames[0]);setFile(f);setMapping({});
      }catch(err){toast$("error","Gagal membaca: "+err.message);}
    };
    r.readAsArrayBuffer(f);
  },[parseSheet]);

  /* ── mapping ── */
  const usedCols=useMemo(()=>new Set(Object.values(mapping)),[mapping]);
  const removeMp=k=>setMapping(p=>{const n={...p};delete n[k];return n;});
  /* click-to-assign: click chip → select it, click slot → assign */
  const assignChip=(fieldKey)=>{
    if(!selectedChip)return;
    setMapping(p=>{
      const c=Object.fromEntries(Object.entries(p).filter(([,v])=>v!==selectedChip));
      return{...c,[fieldKey]:selectedChip};
    });
    setSelectedChip(null);
  };
  const runAuto=()=>{
    const a=autoMatch(fileCols,fd.fields);setMapping(a);
    toast$("success",`Auto-match: ${Object.keys(a).length} / ${fd.fields.length} field dipetakan`);
  };
  const toggleGroup=g=>setCollapsedGroups(prev=>{
    const next=new Set(prev);next.has(g)?next.delete(g):next.add(g);return next;
  });
  const saveMapping=()=>{
    const next={...savedMapping,[formType]:{mapping,savedAt:Date.now()}};
    setSavedMapping(next);saveToLS("pnl_saved_mappings",next);
    toast$("success","Mapping tersimpan untuk "+fd.label);
  };
  const loadSavedMapping=()=>{
    const s=savedMapping[formType];
    if(!s){toast$("error","Belum ada mapping tersimpan untuk form ini");return;}
    setMapping(s.mapping||{});
    toast$("success","Mapping dimuat · "+new Date(s.savedAt).toLocaleString("id-ID"));
  };

  /* ── parsed rows ── */
  const parsedRows=useMemo(()=>{
    if(!fileRows.length||!Object.keys(mapping).length)return[];
    return fileRows.map((row,i)=>{
      const out={};let okPK=true;
      for(const f of fd.fields){
        const hasFixed=fixedValues[f.key]!==undefined;
        const src=mapping[f.key];
        const raw=hasFixed?fixedValues[f.key]:(src!==undefined?(row[src]??""):"");
        if(f.type==="numeric"){const n=pNum(raw);out[f.key]=n!==null?n:(raw!==""?raw:"");}
        else if(f.type==="array"){out[f.key]=String(raw||"").split(",").map(s=>s.trim()).filter(Boolean);}
        else out[f.key]=String(raw||"").trim();
        if(f.required&&(out[f.key]===""||out[f.key]===null||(Array.isArray(out[f.key])&&!out[f.key].length)))okPK=false;
      }
      const pk=formPK.map(k=>{const v=out[k];return String(Array.isArray(v)?v.join(","):v||"").trim().toLowerCase();}).join("|");
      return{_i:i,_ok:okPK,_pk:pk,...out};
    });
  },[fileRows,mapping,fixedValues,fd,formPK]);

  const mappedNonPK=useMemo(()=>fd.fields.filter(f=>!formPK.includes(f.key)&&mapping[f.key]),[fd,mapping,formPK]);

  /* ── row classification ── */
  const rowStatus=useCallback((row)=>{
    if(!row._ok)return"skip";
    const ex=existing[row._pk];
    if(!ex)return"new";
    const changed=mappedNonPK.some(f=>{
      const nv=row[f.key],ov=ex[f.key];
      if(f.type==="numeric"){
        const nn=typeof nv==="number"?nv:pNum(nv);
        const on=pNum(String(ov??""));
        return nn!==null&&nn!==on;
      }
      return String(nv||"").trim()!==String(ov||"").trim();
    });
    return changed?"update":"same";
  },[existing,mappedNonPK]);

  const valid    =useMemo(()=>parsedRows.filter(r=>r._ok),[parsedRows]);
  const skipped  =useMemo(()=>parsedRows.filter(r=>!r._ok),[parsedRows]);
  const newsRows =useMemo(()=>valid.filter(r=>rowStatus(r)==="new"),[valid,rowStatus]);
  const updates  =useMemo(()=>valid.filter(r=>rowStatus(r)==="update"),[valid,rowStatus]);
  const sameRows =useMemo(()=>valid.filter(r=>rowStatus(r)==="same"),[valid,rowStatus]);
  const toImport =useMemo(()=>[...newsRows,...updates],[newsRows,updates]);

  const displayed=useMemo(()=>{
    if(filter==="new")return newsRows;
    if(filter==="update")return updates;
    if(filter==="same")return sameRows;
    if(filter==="skip")return skipped;
    if(filter==="import")return toImport;
    return parsedRows;
  },[parsedRows,newsRows,updates,sameRows,skipped,toImport,filter]);

  const validation=useMemo(()=>{
    const miss=fd.fields.filter(f=>f.required&&!mapping[f.key]&&fixedValues[f.key]===undefined);
    return{miss,ok:miss.length===0,mapped:Object.keys(mapping).length};
  },[mapping,fixedValues,fd]);
  const pkAllMapped=useMemo(()=>formPK.every(k=>!!mapping[k]||fixedValues[k]!==undefined),[mapping,fixedValues,formPK]);

  const totalChangedFields=useMemo(()=>{
    let count=0;
    for(const row of updates){
      const ex=existing[row._pk];if(!ex)continue;
      for(const f of mappedNonPK){
        const nv=row[f.key],ov=ex[f.key];
        if(f.type==="numeric"){
          const nn=typeof nv==="number"?nv:pNum(nv);
          if(nn!==null&&nn!==pNum(String(ov??"")))count++;
        }else if(String(nv||"").trim()!==String(ov||"").trim())count++;
      }
    }
    return count;
  },[updates,existing,mappedNonPK]);

  const filteredFields=useMemo(()=>{
    if(!fieldQ)return fd.fields;
    const q=fieldQ.toLowerCase();
    return fd.fields.filter(f=>f.label.toLowerCase().includes(q)||f.key.toLowerCase().includes(q));
  },[fd.fields,fieldQ]);

  /* ── DB load ── */
  const loadExisting=useCallback(async()=>{
    if(!sb||!parsedRows.length)return;
    const v=parsedRows.filter(r=>r._ok);
    if(!v.length){setExisting({});return;}
    setLoadingDB(true);setDbError(null);
    try{
      const filterField=formPK[0];
      const filterVals=[...new Set(v.map(r=>String(r[filterField]||"").trim()).filter(Boolean))];
      let{data,error}=await sb.from(formTable).select("*").in(filterField,filterVals);
      if(!error&&(!data||!data.length)&&filterVals.length&&!isSDP){
        const orF=filterVals.map(p=>`${filterField}.ilike.${p}`).join(",");
        ({data,error}=await sb.from(formTable).select("*").or(orF));
      }
      if(error)throw error;
      const map={};
      (data||[]).forEach(row=>{
        const pk=formPK.map(k=>String(row[k]||"").trim().toLowerCase()).join("|");
        map[pk]=row;
      });
      setExisting(map);setLastSync(Date.now());
    }catch(e){setDbError(e.message);toast$("error","Gagal memuat DB: "+e.message);}
    finally{setLoadingDB(false);}
  },[sb,parsedRows,formTable,formPK,isSDP]);

  useEffect(()=>{if(pkAllMapped)loadExisting();},[pkAllMapped,loadExisting]);

  /* ── build change log entries ── */
  const buildLogEntries=useCallback((rows)=>{
    return rows.map(row=>{
      const ex=existing[row._pk];
      const pkValues={};formPK.forEach(k=>{pkValues[k]=String(row[k]||"").trim();});
      const changes=[];
      if(ex){
        /* Existing row: record only changed fields */
        for(const f of mappedNonPK){
          const nv=row[f.key],ov=ex[f.key];
          let changed=false;
          if(f.type==="numeric"){
            const nn=typeof nv==="number"?nv:pNum(nv);
            changed=nn!==null&&nn!==pNum(String(ov??""));
          }else changed=String(nv||"").trim()!==String(ov||"").trim();
          if(changed)changes.push({
            field:f.key,label:f.label,type:f.type,
            oldVal:ov,newVal:nv,reverted:false,
          });
        }
      }else{
        /* New row: record all mapped fields — oldVal is 0/null so we can zero them back */
        for(const f of mappedNonPK){
          const nv=row[f.key];
          const newVal=f.type==="numeric"?(typeof nv==="number"?nv:(pNum(nv)??0)):String(nv||"").trim();
          if(newVal===0||newVal==="")continue; // skip empty/zero fields, nothing to revert
          changes.push({
            field:f.key,label:f.label,type:f.type,
            oldVal:f.type==="numeric"?0:null,
            newVal,reverted:false,
          });
        }
      }
      return{pk:row._pk,pkValues,isNew:!ex,changes};
    });
  },[existing,mappedNonPK]);

  /* ── export diff ── */
  const exportDiff=()=>{
    const headers=["Status","Last Updated DB",...formPK,
      ...mappedNonPK.flatMap(f=>[`${f.label} (Baru)`,`${f.label} (Lama DB)`])];
    const rows=parsedRows.map(row=>{
      const ex=existing[row._pk];
      const st={skip:"Skip",new:"Baru",update:"Update",same:"Sama"}[rowStatus(row)]||"?";
      const lastUpd=ex?.updated_at?fmtDateTime(ex.updated_at):"—";
      const pkVals=formPK.map(k=>String(row[k]||""));
      const dataPairs=mappedNonPK.flatMap(f=>{
        const nv=dispRaw(row[f.key],f.type==="numeric");
        const ov=ex?dispRaw(ex[f.key],f.type==="numeric"):"—";
        return[nv,ov];
      });
      return[st,lastUpd,...pkVals,...dataPairs];
    });
    const ws=XLSX.utils.aoa_to_sheet([headers,...rows]);
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Diff");
    XLSX.writeFile(wb,`diff_${fd.id}_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast$("success","Diff diekspor ke Excel");
  };

  /* ── IMPORT ── */
  const doImport=async()=>{
    if(!toImport.length){toast$("error","Tidak ada baris untuk diimport");return;}
    setConfirmOpen(false);setImporting(true);abortRef.current=false;
    setImportProgress({done:0,total:toImport.length});
    const logEntries=buildLogEntries(toImport);
    try{
      let ok=0,fail=0,errs=[];
      const rows=toImport.map(row=>{
        const ex=existing[row._pk];
        const base=ex?{...ex}:{};
        /* Hapus kolom sistem */
        ["id","user_id","created_at","updated_at","is_finalized",
          "finalized_at","finalized_by"].forEach(k=>delete base[k]);
        /* Terapkan field dari mapping / fixed values */
        for(const f of fd.fields){
          const hasMapped=!!mapping[f.key];
          const hasFixed=fixedValues[f.key]!==undefined;
          if(!hasMapped&&!hasFixed)continue;
          if(formPK.includes(f.key)){if(!ex)base[f.key]=String(row[f.key]||"").trim();continue;}
          const v=row[f.key];
          if(f.type==="numeric")base[f.key]=typeof v==="number"?v:(pNum(v)??0);
          else if(f.type==="array")base[f.key]=Array.isArray(v)?v:String(v||"").split(",").map(s=>s.trim()).filter(Boolean);
          else base[f.key]=String(v||"").trim();
        }
        /* Pastikan kolom NOT NULL tidak null (per-form defaults) */
        Object.entries(formDefaults).forEach(([k,v])=>{
          if(base[k]===undefined||base[k]===null)base[k]=v;
        });
        return base;
      });

      if(sb){
        for(let i=0;i<rows.length;i+=50){
          if(abortRef.current){fail+=rows.length-i;break;}
          const{error}=await sb.from(formTable)
            .upsert(rows.slice(i,i+50),{onConflict:formConflict});
          if(error){fail+=Math.min(50,rows.length-i);errs.push(error.message);}
          else ok+=Math.min(50,rows.length-i);
          setImportProgress({done:Math.min(i+50,rows.length),total:rows.length});
        }
      }else{
        await onImport?.(rows,formType);ok=rows.length;
        setImportProgress({done:rows.length,total:rows.length});
      }

      /* Save log to SQL */
      await saveLogEntry({
        formType,fileName:file?.name,
        summary:{total:toImport.length,changed:updates.length,
          new:newsRows.length,same:sameRows.length,ok,fail},
        entries:logEntries,
      });

      setResult({ok,fail,total:toImport.length,
        skippedSame:sameRows.length,errs,aborted:abortRef.current});
      toast$(fail===0&&!abortRef.current?"success":"error",
        abortRef.current?`Import dihentikan — ${ok} berhasil`
          :fail===0?`${ok} baris berhasil diimport`:`${ok} berhasil, ${fail} gagal`);
    }catch(e){toast$("error","Import gagal: "+e.message);}
    finally{setImporting(false);setImportProgress(null);}
  };

  /* ── REVERT ── */
  const revertField=async(logId,pkValues,field,oldVal)=>{
    if(!sb){toast$("error","Supabase tidak tersedia");return;}
    const pkStr=Object.values(pkValues).join("|");
    setRevertingId({logId,pkStr,field});
    try{
      const{error}=await sb.from(FORM_DEFS[formType]?.table??"pnl_reports")
        .update({[field]:oldVal!==undefined?oldVal:null}).match(pkValues);
      if(error)throw error;
      toast$("success","Kolom berhasil dikembalikan ke nilai sebelumnya");
      const log=changeLog.find(l=>l.id===logId);
      if(!log)return;
      const newEntries=log.entries.map(e=>
        Object.values(e.pkValues).join("|")===pkStr
          ?{...e,changes:e.changes.map(c=>c.field===field?{...c,reverted:true}:c)}:e
      );
      await updateLogInDB(logId,newEntries);
      /* Reload DB data to refresh updated_at */
      await loadExisting();
    }catch(e){toast$("error","Gagal revert: "+e.message);}
    finally{setRevertingId(null);}
  };

  const revertRow=async(logId,entry)=>{
    if(!sb){toast$("error","Supabase tidak tersedia");return;}
    const pending=entry.changes.filter(c=>!c.reverted);
    if(!pending.length)return;
    /* For new rows: set fields back to oldVal (0 or null)
       For updated rows: set fields back to previous DB value */
    const upd={};pending.forEach(c=>{upd[c.field]=c.oldVal!==undefined?c.oldVal:null;});
    const pkStr=Object.values(entry.pkValues).join("|");
    setRevertingId({logId,pkStr,field:"__row__"});
    try{
      const{error}=await sb.from(FORM_DEFS[formType]?.table??"pnl_reports").update(upd).match(entry.pkValues);
      if(error)throw error;
      toast$("success",`${Object.keys(upd).length} kolom dikembalikan`);
      const log=changeLog.find(l=>l.id===logId);
      if(!log)return;
      const newEntries=log.entries.map(e=>
        Object.values(e.pkValues).join("|")===pkStr
          ?{...e,changes:e.changes.map(c=>({...c,reverted:true}))}:e
      );
      await updateLogInDB(logId,newEntries);
      await loadExisting();
    }catch(e){toast$("error","Gagal revert baris: "+e.message);}
    finally{setRevertingId(null);}
  };

  const revertBatch=async(logId)=>{
    const log=changeLog.find(l=>l.id===logId);if(!log)return;
    for(const entry of (log.entries||[]).filter(e=>(e.changes||[]).some(c=>!c.reverted))){
      await revertRow(logId,entry);
    }
    toast$("success","Semua perubahan pada sesi ini telah direvert");
  };

  const reset=()=>{
    setFile(null);setWorkbook(null);setSheets([]);setSheet("");
    setRawRows([]);setHeaderRow(0);setFileCols([]);setFileRows([]);
    setMapping({});setResult(null);setFilter("all");setExisting({});
    setColQ("");setFieldQ("");setLastSync(null);setDbError(null);
    setImportProgress(null);setConfirmOpen(false);
    if(fileRef.current)fileRef.current.value="";
  };

  const skipReason=row=>
    fd.fields.filter(f=>f.required&&(!row[f.key]||row[f.key]===""))
      .map(f=>f.label).slice(0,2).join(", ");

  const totalPendingReverts=useMemo(()=>
    changeLog.reduce((s,l)=>
      s+((l.entries||[]).reduce((es,e)=>es+(e.changes||[]).filter(c=>!c.reverted).length,0)),0)
  ,[changeLog]);

  /* ═══════════════════════════════════════════════════════════════
     GLOBAL CSS
     ═══════════════════════════════════════════════════════════════ */
  const G=`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap');
    *,*::before,*::after{box-sizing:border-box}
    body{-webkit-font-smoothing:antialiased}
    ::-webkit-scrollbar{width:4px;height:4px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:${d?"rgba(255,255,255,0.15)":"rgba(0,0,0,0.14)"};border-radius:99px}
    @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes slideInRight{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
    @keyframes bgFadeIn{from{opacity:0}to{opacity:1}}
    .pw{animation:fadeUp .22s cubic-bezier(.22,1,.36,1)}
    input,button,select,textarea{font-family:${FF};-webkit-font-smoothing:antialiased}
    input:focus,textarea:focus{outline:none}
    .card{background:${t.card};border-radius:14px;border:1px solid ${t.line};box-shadow:${t.s1};overflow:hidden}
    .sh{padding:12px 16px;border-bottom:1px solid ${t.line};display:flex;align-items:center;gap:9px;flex-wrap:wrap;min-height:48px}
    .sl{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${t.t2}}
    .inp{background:${t.iBg};border:1px solid ${t.iBd};border-radius:8px;color:${t.t1};font-size:12px;transition:border-color .14s,box-shadow .14s;padding:0 10px}
    .inp:focus{border-color:${t.acc};box-shadow:0 0 0 3px ${t.accL}}
    .inp::placeholder{color:${t.t3}}
    .chip{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:7px;border:1px solid ${t.line};font-size:11.5px;font-weight:500;color:${t.t1};cursor:pointer;user-select:none;transition:all .12s;flex-shrink:0;white-space:nowrap}
    .chip:hover:not(.cu){border-color:${t.accB};color:${t.acc};background:${t.accL}}
    .chip.cu{border-color:${t.GB};color:${t.G};background:${t.GL};cursor:default}
    .chip.sel{border-color:${t.acc};color:${t.acc};background:${t.accL};box-shadow:0 0 0 2px ${t.accB};cursor:pointer}
    .slot{border-radius:8px;border:1.5px dashed ${t.line};padding:5px 10px;min-height:32px;display:flex;align-items:center;gap:7px;transition:all .12s;font-size:11px;cursor:default}
    .slot.ov{border-style:solid;border-color:${t.acc};background:${t.accL}}
    .slot.ok{border-style:solid;border-color:${t.GB};background:${t.GL}}
    .slot.req{border-color:${t.RB}}
    .slot.clickable{cursor:pointer}
    .slot.clickable:hover{border-color:${t.acc};background:${t.accL}}
    .dr:hover td{background:${d?"rgba(255,255,255,0.022)":"rgba(0,0,0,0.018)"}!important}
    .hr{cursor:pointer}
    .hr:hover td{background:${d?"rgba(237,28,36,0.055)":"rgba(237,28,36,0.035)"}!important}
    .hr.sel td{background:${d?"rgba(237,28,36,0.11)":"rgba(237,28,36,0.07)"}!important;color:${t.acc}!important;font-weight:600}
    .fti{display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;border-bottom:1px solid ${t.lineS};transition:background .11s}
    .fti:last-child{border-bottom:none}
    .fti:hover{background:${d?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.025)"}}
    .fti.act{background:${t.accL}}
    .gbtn{display:inline-flex;align-items:center;gap:5px;padding:0 10px;height:28px;border-radius:7px;border:1px solid ${t.line};background:${t.raised};color:${t.t2};font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;transition:.12s;white-space:nowrap;flex-shrink:0}
    .gbtn:hover:not(:disabled){border-color:${t.acc};color:${t.acc};background:${t.accL}}
    .gbtn:disabled{opacity:.4;cursor:default}
    .log-entry{transition:background .1s;cursor:pointer}
    .log-entry:hover{background:${d?"rgba(255,255,255,0.035)":"rgba(0,0,0,0.025)"}}
    .chg-row{display:flex;align-items:center;gap:8px;padding:5px 10px;border-radius:8px;transition:.1s}
    .chg-row:hover{background:${d?"rgba(255,255,255,0.035)":"rgba(0,0,0,0.025)"}}
    .stat-pill{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:9px 16px;border-radius:10px;border:1px solid ${t.line};background:${t.raised};cursor:pointer;transition:all .15s;min-width:70px;flex:1}
    .stat-pill:hover{border-color:var(--pill-color,${t.acc});background:${t.accL}}
    .stat-pill.active{border-color:${t.acc};background:${t.accL}}
    .prog-bar{height:3px;border-radius:99px;background:${t.inset};overflow:hidden;margin-top:4px}
    .prog-fill{height:100%;border-radius:99px;transition:width .3s ease}
    @media(max-width:640px){
      .mapping-panel{flex-direction:column!important}
      .left-panel{width:100%!important;max-height:200px!important;border-right:none!important;border-bottom:1px solid ${t.line}!important}
    }
  `;

  /* ═══════════════════════════════════════════════════════════════
     LOG PANEL
     ═══════════════════════════════════════════════════════════════ */
  const LogPanel=()=>{
    return(
      <div style={{position:"fixed",inset:0,zIndex:10000,animation:"bgFadeIn .18s ease"}}
        onClick={()=>setShowLog(false)}>
        <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.52)"}}/>
        <div style={{position:"absolute",right:0,top:0,bottom:0,width:"min(700px,98vw)",
          background:t.card,borderLeft:`1px solid ${t.line}`,
          boxShadow:t.s3,display:"flex",flexDirection:"column",
          animation:"slideInRight .22s cubic-bezier(.22,1,.36,1)"}}
          onClick={e=>e.stopPropagation()}>
          {/* header */}
          <div style={{padding:"16px 20px",borderBottom:`1px solid ${t.line}`,
            display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
            <div style={{width:34,height:34,borderRadius:8,background:t.BL,flexShrink:0,
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              <History size={15} style={{color:t.B}}/>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:15,fontWeight:700,color:t.t1,letterSpacing:"-.025em"}}>
                Log Perubahan Import
              </div>
              <div style={{fontSize:11,color:t.t3,marginTop:1,display:"flex",gap:8,flexWrap:"wrap"}}>
                <span style={{color:t.G,display:"flex",alignItems:"center",gap:4}}>
                  <Database size={9}/>Supabase SQL
                </span>
                {totalPendingReverts>0&&(
                  <span style={{color:t.A,fontWeight:600}}>
                    · {totalPendingReverts} perubahan belum direvert
                  </span>
                )}
                <span style={{color:t.t3}}>· Esc tutup</span>
              </div>
            </div>
            <button onClick={()=>setShowLog(false)}
              style={{width:30,height:30,borderRadius:7,border:`1px solid ${t.line}`,
                background:t.raised,cursor:"pointer",color:t.t2,
                display:"flex",alignItems:"center",justifyContent:"center"}}>
              <X size={13}/>
            </button>
          </div>

          {/* log list */}
          <div style={{flex:1,overflowY:"auto",padding:"12px 16px",
            display:"flex",flexDirection:"column",gap:8}}>
            {logLoading&&(
              <div style={{padding:"40px",textAlign:"center"}}>
                <Loader2 size={24} style={{color:t.t3,animation:"spin 1s linear infinite",
                  display:"block",margin:"0 auto 10px"}}/>
                <div style={{fontSize:12,color:t.t3}}>Memuat log dari database…</div>
              </div>
            )}
            {!logLoading&&changeLog.length===0&&(
              <div style={{padding:"60px 20px",textAlign:"center"}}>
                <Clock size={44} style={{color:t.t3,display:"block",margin:"0 auto 14px"}}/>
                <div style={{fontSize:14,fontWeight:500,color:t.t2}}>Belum ada riwayat</div>
                <div style={{fontSize:12,color:t.t3,marginTop:4}}>
                  Log import akan muncul di sini setelah kamu mengimport data
                </div>
              </div>
            )}
            {!logLoading&&changeLog.map(log=>{
              const entries=log.entries||[];
              /* All entries that have pending revertable changes */
              const revertableEntries=entries.filter(e=>(e.changes||[]).length>0);
              const newEntries=entries.filter(e=>e.isNew&&(e.changes||[]).length>0);
              const changedEntries=entries.filter(e=>!e.isNew&&(e.changes||[]).length>0);
              const pending=revertableEntries.reduce((s,e)=>(e.changes||[]).filter(c=>!c.reverted).length+s,0);
              const allReverted=revertableEntries.length>0&&pending===0;
              const isExp=logExpandedSession===log.id;
              const fd2=FORM_DEFS[log.form_type];
              const summary=log.summary||{};
              return(
                <div key={log.id} style={{borderRadius:12,
                  border:`1px solid ${isExp?t.acc:t.line}`,overflow:"hidden",transition:"border-color .15s"}}>
                  {/* session header */}
                  <div onClick={()=>setLogExpandedSession(isExp?null:log.id)}
                    style={{padding:"11px 14px",cursor:"pointer",
                      background:isExp?t.accL:"transparent",
                      display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:8,height:8,borderRadius:3,flexShrink:0,
                      background:allReverted?t.G:pending>0?t.A:t.B,
                      boxShadow:`0 0 7px ${allReverted?t.G:pending>0?t.A:t.B}`}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,
                        color:isExp?t.acc:t.t1,display:"flex",gap:7,flexWrap:"wrap",alignItems:"center"}}>
                        {fd2?.label||log.form_type}
                        {log.file_name&&(
                          <span style={{fontSize:10,color:t.t3,fontWeight:400}}>· {log.file_name}</span>
                        )}
                        {log.user_email&&(
                          <span style={{fontSize:10,color:t.B,display:"flex",alignItems:"center",gap:3}}>
                            <User size={9}/>{log.user_email}
                          </span>
                        )}
                      </div>
                      <div style={{fontSize:10,color:t.t3,marginTop:2,display:"flex",gap:8,flexWrap:"wrap"}}>
                        <span>📥 {fmtDateTime(log.created_at)}</span>
                        {log.updated_at&&log.updated_at!==log.created_at&&(
                          <span style={{color:t.A}}>↩ {fmtDateTime(log.updated_at)}</span>
                        )}
                        {newEntries.length>0&&<span style={{color:t.B}}>+{newEntries.length} baru</span>}
                        {changedEntries.length>0&&<span style={{color:t.A}}>{changedEntries.length} diubah</span>}
                        {summary.ok!==undefined&&<span style={{color:t.G}}>{summary.ok} berhasil</span>}
                        {pending>0
                          ?<span style={{color:t.A,fontWeight:600}}>{pending} belum direvert</span>
                          :allReverted&&<span style={{color:t.G,display:"flex",alignItems:"center",gap:3}}>
                            <ShieldCheck size={9}/>Semua direvert
                          </span>}
                      </div>
                    </div>
                    {pending>0&&sb&&(
                      <button className="gbtn" style={{fontSize:10,color:t.A,borderColor:t.AB,flexShrink:0}}
                        onClick={e=>{e.stopPropagation();revertBatch(log.id);}}>
                        <RotateCcw size={9}/>Revert Semua
                      </button>
                    )}
                    <ChevronRight size={13} style={{color:t.t3,flexShrink:0,
                      transform:isExp?"rotate(90deg)":"none",transition:"transform .15s"}}/>
                  </div>

                  {/* expanded: all entries (new + updated) */}
                  {isExp&&(
                    <div style={{borderTop:`1px solid ${t.lineS}`}}>
                      {revertableEntries.map(entry=>{
                        const entryKey=`${log.id}:${entry.pk}`;
                        const isEE=logExpandedEntry===entryKey;
                        const ePending=(entry.changes||[]).filter(c=>!c.reverted);
                        const isRowRev=revertingId?.logId===log.id
                          &&revertingId?.pkStr===entry.pk
                          &&revertingId?.field==="__row__";
                        return(
                          <div key={entry.pk} style={{borderBottom:`1px solid ${t.lineS}`}}>
                            <div onClick={()=>setLogExpandedEntry(isEE?null:entryKey)}
                              className="log-entry"
                              style={{padding:"9px 14px",display:"flex",alignItems:"center",gap:8,
                                background:isEE?t.raised:"transparent"}}>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:1}}>
                                  {entry.isNew&&(
                                    <Bdg c="blue" small>Baru</Bdg>
                                  )}
                                  <span style={{fontSize:11,fontWeight:500,color:t.t1,
                                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                    {Object.values(entry.pkValues||{}).join(" · ")}
                                  </span>
                                </div>
                                <div style={{fontSize:10,color:t.t3}}>
                                  {(entry.changes||[]).length} kolom ·{" "}
                                  {ePending.length>0
                                    ?<span style={{color:t.A}}>{ePending.length} belum direvert</span>
                                    :<span style={{color:t.G}}>semua direvert ✓</span>}
                                  {entry.isNew&&<span style={{color:t.t3}}> · mengembalikan nilai ke 0</span>}
                                </div>
                              </div>
                              {ePending.length>0&&sb&&(
                                <button className="gbtn"
                                  style={{fontSize:10,height:24,padding:"0 8px",color:t.A,borderColor:t.AB}}
                                  disabled={!!isRowRev}
                                  onClick={e=>{e.stopPropagation();revertRow(log.id,entry);}}>
                                  {isRowRev?<Loader2 size={9} style={{animation:"spin 1s linear infinite"}}/>
                                    :<RotateCcw size={9}/>}Revert Baris
                                </button>
                              )}
                              <ChevronRight size={12} style={{color:t.t3,flexShrink:0,
                                transform:isEE?"rotate(90deg)":"none",transition:"transform .15s"}}/>
                            </div>
                            {isEE&&(
                              <div style={{padding:"6px 14px 10px",display:"flex",flexDirection:"column",gap:3}}>
                                {(entry.changes||[]).map(change=>{
                                  const isFieldRev=revertingId?.logId===log.id
                                    &&revertingId?.pkStr===entry.pk
                                    &&revertingId?.field===change.field;
                                  const isNum=change.type==="numeric";
                                  const oldD=isNum?fmtNum(pNum(String(change.oldVal??""))):String(change.oldVal??0);
                                  const newD=isNum?fmtNum(typeof change.newVal==="number"?change.newVal:pNum(change.newVal)):String(change.newVal??"—");
                                  return(
                                    <div key={change.field} className="chg-row"
                                      style={{border:`1px solid ${change.reverted?t.GB:t.lineS}`,
                                        background:change.reverted
                                          ?(d?"rgba(48,209,88,0.07)":"rgba(40,167,69,0.05)")
                                          :"transparent",opacity:change.reverted?.7:1}}>
                                      <div style={{flex:1,minWidth:0}}>
                                        <div style={{fontSize:10,fontWeight:600,color:t.t2,marginBottom:3,
                                          textDecoration:change.reverted?"line-through":"none"}}>
                                          {change.label}
                                        </div>
                                        <div style={{display:"flex",alignItems:"center",gap:7}}>
                                          <span style={{fontSize:12,fontWeight:600,color:t.R,
                                            fontVariantNumeric:"tabular-nums"}}>{oldD}</span>
                                          <ArrowRight size={11} style={{color:t.t3,flexShrink:0}}/>
                                          <span style={{fontSize:12,fontWeight:600,color:t.G,
                                            fontVariantNumeric:"tabular-nums"}}>{newD}</span>
                                        </div>
                                      </div>
                                      {change.reverted
                                        ?<Bdg c="green"><Check size={8}/>Direvert</Bdg>
                                        :sb&&(
                                          <button className="gbtn"
                                            style={{fontSize:10,height:24,padding:"0 8px",color:t.A,borderColor:t.AB}}
                                            disabled={!!revertingId}
                                            onClick={()=>revertField(log.id,entry.pkValues,change.field,change.oldVal)}>
                                            {isFieldRev?<Loader2 size={9} style={{animation:"spin 1s linear infinite"}}/>
                                              :<Undo2 size={9}/>}Revert
                                          </button>
                                        )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {revertableEntries.length===0&&(
                        <div style={{padding:"12px 14px",fontSize:11,color:t.t3,textAlign:"center"}}>
                          Tidak ada perubahan yang tercatat pada sesi ini
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* footer */}
          <div style={{padding:"10px 16px",borderTop:`1px solid ${t.lineS}`,flexShrink:0,
            display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:11,color:t.t3}}>
              Log tersimpan di Supabase · dapat diakses semua user
            </span>
            <div style={{display:"flex",gap:6}}>
              <button className="gbtn" style={{fontSize:10}}
                onClick={loadLogsFromDB} disabled={logLoading}>
                <RefreshCw size={10} style={logLoading?{animation:"spin 1s linear infinite"}:{}}/>
                Refresh
              </button>
              <button className="gbtn" onClick={()=>setShowLog(false)}>
                <X size={10}/>Tutup
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ── Confirm Dialog ── */
  const ConfirmDialog=()=>(
    <div style={{position:"fixed",inset:0,zIndex:10001,
      display:"flex",alignItems:"center",justifyContent:"center",
      background:"rgba(0,0,0,0.55)",animation:"bgFadeIn .15s ease"}}
      onClick={()=>setConfirmOpen(false)}>
      <div style={{maxWidth:440,width:"90%",borderRadius:16,padding:"28px 24px",
        background:t.card,border:`1px solid ${t.AB}`,boxShadow:t.s3,
        textAlign:"center",animation:"fadeUp .18s ease"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{width:54,height:54,borderRadius:14,margin:"0 auto 16px",
          background:t.AL,border:`1px solid ${t.AB}`,
          display:"flex",alignItems:"center",justifyContent:"center"}}>
          <AlertTriangle size={24} style={{color:t.A}}/>
        </div>
        <div style={{fontSize:17,fontWeight:700,letterSpacing:"-.03em",color:t.t1,marginBottom:8}}>
          Konfirmasi Import
        </div>
        <div style={{fontSize:13,color:t.t2,lineHeight:1.75,marginBottom:6}}>
          Akan mengimport{" "}
          <strong style={{color:t.G}}>{newsRows.length} baris baru</strong>
          {updates.length>0&&<>{" "}dan memperbarui{" "}
            <strong style={{color:t.A}}>{updates.length} baris</strong>{" "}
            dengan <strong style={{color:t.A}}>{totalChangedFields} perubahan nilai</strong></>}.
          {sameRows.length>0&&<>{" "}<strong style={{color:t.t3}}>{sameRows.length} baris dilewati</strong> (tidak ada perubahan).</>}
        </div>
        <div style={{fontSize:12,color:t.t3,marginBottom:22,lineHeight:1.65,
          background:t.raised,padding:"9px 13px",borderRadius:8,border:`1px solid ${t.lineS}`,textAlign:"left"}}>
          <span style={{color:t.G,fontWeight:700}}>✓</span>{" "}
          Setiap perubahan dicatat di <strong>Log SQL</strong> dan bisa{" "}
          <strong>direvert per-kolom</strong> kapan saja.{" "}
          Kolom yang tidak dipetakan di DB <strong>100% aman</strong>.
        </div>
        <div style={{display:"flex",gap:9,justifyContent:"center"}}>
          <button className="gbtn" style={{height:38,padding:"0 18px",fontSize:12}}
            onClick={()=>setConfirmOpen(false)}>Batalkan</button>
          <button onClick={doImport}
            style={{height:38,padding:"0 20px",borderRadius:9,border:"none",
              background:t.acc,color:"#fff",fontSize:13,fontWeight:600,
              cursor:"pointer",fontFamily:FF,boxShadow:"0 2px 10px rgba(237,28,36,.28)",
              display:"flex",alignItems:"center",gap:7}}>
            <Download size={14}/>Lanjutkan Import
          </button>
        </div>
      </div>
    </div>
  );

  /* ── Progress Overlay ── */
  const ProgressOverlay=()=>{
    if(!importProgress)return null;
    const pct=Math.round((importProgress.done/importProgress.total)*100);
    return(
      <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",
        zIndex:9998,minWidth:320,maxWidth:420,borderRadius:14,background:t.card,
        border:`1px solid ${t.line}`,boxShadow:t.s3,padding:"14px 16px",animation:"fadeUp .2s ease"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <Loader2 size={15} style={{color:t.acc,animation:"spin 1s linear infinite",flexShrink:0}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:12,fontWeight:600,color:t.t1}}>Mengimport data…</div>
            <div style={{fontSize:11,color:t.t3,marginTop:1}}>
              {importProgress.done.toLocaleString("id-ID")} / {importProgress.total.toLocaleString("id-ID")} baris
            </div>
          </div>
          <span style={{fontSize:15,fontWeight:700,color:t.acc,fontVariantNumeric:"tabular-nums"}}>{pct}%</span>
          <button className="gbtn" style={{color:t.R,borderColor:t.RB,fontSize:10,height:26,padding:"0 9px"}}
            onClick={()=>{abortRef.current=true;}}>
            <XCircle size={10}/>Stop
          </button>
        </div>
        <div style={{height:5,borderRadius:99,background:t.inset,overflow:"hidden"}}>
          <div style={{height:"100%",borderRadius:99,background:t.acc,
            width:`${pct}%`,transition:"width .3s ease"}}/>
        </div>
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════════════════
     UPLOAD SCREEN — full width
     ═══════════════════════════════════════════════════════════════ */
  if(!file)return(
    <div style={{width:"100%",fontFamily:FF,color:t.t1,...cssVars}}>
      <style>{G}</style>
      {showLog&&<LogPanel/>}
      <div className="pw" style={{display:"flex",flexDirection:"column",gap:16}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:40,height:40,borderRadius:10,background:t.acc,flexShrink:0,
            display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",
            boxShadow:"0 4px 14px rgba(237,28,36,.28)"}}>
            <FileSpreadsheet size={20} strokeWidth={1.7}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:20,fontWeight:700,letterSpacing:"-.04em",color:t.t1}}>Import Data PNL</div>
            <div style={{fontSize:12,color:t.t3}}>Upload Excel · Petakan kolom · Cek diff · Merge ke Supabase</div>
          </div>
          <button className="gbtn" style={{position:"relative"}} onClick={()=>setShowLog(true)}>
            <History size={12}/>Log
            {totalPendingReverts>0&&(
              <span style={{position:"absolute",top:-5,right:-5,width:16,height:16,borderRadius:99,
                background:t.A,color:"#000",fontSize:9,fontWeight:700,
                display:"flex",alignItems:"center",justifyContent:"center"}}>
                {totalPendingReverts>9?"9+":totalPendingReverts}
              </span>
            )}
          </button>
        </div>

        {/* drop zone */}
        <div className="card"
          onDragOver={e=>{e.preventDefault();setDragOver(true)}}
          onDragLeave={()=>setDragOver(false)}
          onDrop={e=>{e.preventDefault();setDragOver(false);loadFile(e.dataTransfer.files[0]);}}
          onClick={()=>fileRef.current?.click()}
          style={{padding:"56px 40px",textAlign:"center",cursor:"pointer",transition:"all .18s",
            borderColor:dragOver?t.acc:t.line,background:dragOver?t.accL:t.card,
            boxShadow:dragOver?`0 0 0 3px ${t.accB},${t.s1}`:t.s1}}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}}
            onChange={e=>{loadFile(e.target.files[0]);e.target.value="";}}/>
          <div style={{width:72,height:72,borderRadius:18,margin:"0 auto 18px",
            background:dragOver?t.acc:t.raised,border:`1.5px solid ${dragOver?t.acc:t.line}`,
            display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s",
            boxShadow:dragOver?"0 8px 24px rgba(237,28,36,.30)":"none"}}>
            <Upload size={28} strokeWidth={1.5} style={{color:dragOver?"#fff":t.t2}}/>
          </div>
          <div style={{fontSize:16,fontWeight:700,letterSpacing:"-.025em",color:t.t1,marginBottom:5}}>
            {dragOver?"Lepaskan file di sini":"Klik atau drag & drop"}
          </div>
          <div style={{fontSize:12,color:t.t3}}>
            <strong style={{color:t.t2}}>.xlsx</strong>&nbsp;·&nbsp;
            <strong style={{color:t.t2}}>.xls</strong>&nbsp;·&nbsp;
            <strong style={{color:t.t2}}>.csv</strong>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12}}>
          <div className="card" style={{padding:"18px 18px 16px"}}>
            <div style={{fontSize:12,fontWeight:700,color:t.t1,marginBottom:12,
              display:"flex",alignItems:"center",gap:6}}>
              <Info size={13} style={{color:t.B}}/>Cara Kerja Import
            </div>
            {[
              {n:1,tx:"Upload file Excel, pilih sheet dan baris header yang tepat"},
              {n:2,tx:"Pilih jenis laporan, petakan kolom ke field (atau Auto-match)"},
              {n:3,tx:"Baris yang nilainya sama persis dengan DB dilewati otomatis — hemat bandwidth"},
              {n:4,tx:"Setiap perubahan dicatat di Log SQL & bisa direvert per-kolom kapan saja"},
            ].map(s=>(
              <div key={s.n} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:8}}>
                <div style={{width:20,height:20,borderRadius:6,background:t.accL,
                  border:`1px solid ${t.accB}`,flexShrink:0,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:10,fontWeight:800,color:t.acc}}>{s.n}</div>
                <div style={{fontSize:12,color:t.t2,lineHeight:1.6,paddingTop:1}}>{s.tx}</div>
              </div>
            ))}
          </div>
          <div className="card" style={{padding:"18px 18px 16px"}}>
            <div style={{fontSize:12,fontWeight:700,color:t.t1,marginBottom:12,
              display:"flex",alignItems:"center",gap:6}}>
              <FileDown size={13} style={{color:t.G}}/>Download Template Excel
            </div>
            {Object.values(FORM_DEFS).map(f=>(
              <button key={f.id} onClick={()=>dlTemplate(f)}
                style={{display:"flex",alignItems:"center",gap:10,padding:"11px 13px",
                  borderRadius:9,border:`1px solid ${t.line}`,background:t.raised,
                  cursor:"pointer",textAlign:"left",transition:".12s",fontFamily:FF,width:"100%",
                  marginBottom:8}}>
                <div style={{width:32,height:32,borderRadius:8,background:t.GL,
                  border:`1px solid ${t.GB}`,flexShrink:0,
                  display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <FileSpreadsheet size={14} style={{color:t.G}}/>
                </div>
                <div style={{flex:1,minWidth:0,textAlign:"left"}}>
                  <div style={{fontSize:12,fontWeight:600,color:t.t1}}>{f.label}</div>
                  <div style={{fontSize:10,color:t.t3,marginTop:1}}>{f.description}</div>
                </div>
                <Download size={12} style={{color:t.t3,flexShrink:0}}/>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════════════════════════
     MAIN LAYOUT
     ═══════════════════════════════════════════════════════════════ */
  return(
    <div style={{width:"100%",fontFamily:FF,color:t.t1,...cssVars}}>
      <style>{G}</style>
      {showLog&&<LogPanel/>}
      {confirmOpen&&<ConfirmDialog/>}
      <ProgressOverlay/>

      {/* Toast */}
      {toast&&(
        <div style={{position:"fixed",top:66,right:18,zIndex:9999,minWidth:260,maxWidth:320,
          borderRadius:13,overflow:"hidden",background:t.card,boxShadow:t.s3,
          border:`1px solid ${toast.type==="success"?t.GB:t.RB}`,animation:"fadeUp .17s ease"}}>
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
        {/* topbar */}
        <div style={{display:"flex",alignItems:"center",gap:11,flexWrap:"wrap"}}>
          <div style={{width:38,height:38,borderRadius:9,background:t.acc,flexShrink:0,
            display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",
            boxShadow:"0 2px 8px rgba(237,28,36,.26)"}}>
            <FileSpreadsheet size={17} strokeWidth={1.7}/>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:600,color:t.t1,
              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{file.name}</div>
            <div style={{fontSize:11,color:t.t2,marginTop:1}}>
              {fileRows.length.toLocaleString("id-ID")} baris &nbsp;·&nbsp;
              {fileCols.length} kolom &nbsp;·&nbsp;{sheets.length} sheet
            </div>
          </div>
          <button className="gbtn" style={{position:"relative"}} onClick={()=>setShowLog(true)}>
            <History size={11}/>Log
            {totalPendingReverts>0&&(
              <span style={{position:"absolute",top:-4,right:-4,width:15,height:15,borderRadius:99,
                background:t.A,color:"#000",fontSize:9,fontWeight:700,
                display:"flex",alignItems:"center",justifyContent:"center"}}>
                {totalPendingReverts>9?"9+":totalPendingReverts}
              </span>
            )}
          </button>
          <button className="gbtn" onClick={()=>dlTemplate(fd)}><FileDown size={11}/>Template</button>
          <button className="gbtn" onClick={reset}><X size={11}/>Ganti File</button>
        </div>

        {/* CARD 1 — Preview Excel */}
        <div className="card">
          <div className="sh">
            <Table2 size={13} style={{color:t.t2,flexShrink:0}}/>
            <span className="sl" style={{flex:1}}>Preview Excel</span>
            <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
              {sheets.map(s=>(
                <button key={s}
                  onClick={()=>{setSheet(s);parseSheet(workbook,s);setMapping({});}}
                  style={{height:26,padding:"0 10px",borderRadius:6,border:"none",cursor:"pointer",
                    fontSize:11,fontWeight:600,fontFamily:FF,transition:".12s",
                    background:sheet===s?t.acc:"transparent",color:sheet===s?"#fff":t.t2}}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div style={{padding:"5px 16px",borderBottom:`1px solid ${t.lineS}`,fontSize:11,color:t.t3}}>
            Klik nomor baris untuk memilih sebagai header kolom
          </div>
          <div style={{overflowX:"auto",overflowY:"auto",maxHeight:260}}>
            <table style={{borderCollapse:"collapse",fontSize:12,minWidth:"max-content"}}>
              <tbody>
                {rawRows.slice(0,Math.min(200,rawRows.length)).map((row,ri)=>{
                  const isH=ri===headerRow;
                  const cells=Array.isArray(row)?row:Object.values(row);
                  return(
                    <tr key={ri} className={`hr${isH?" sel":""}`}
                      onClick={()=>{setHeaderRow(ri);applyHeader(rawRows,ri);setMapping({});}}>
                      <td style={{padding:"4px 9px",position:"sticky",left:0,zIndex:2,
                        background:isH?t.accL:t.card,borderRight:`1px solid ${t.line}`,
                        borderBottom:`1px solid ${t.lineS}`,width:32,textAlign:"center"}}>
                        <span style={{fontSize:10,fontWeight:600,
                          color:isH?t.acc:t.t3,fontVariantNumeric:"tabular-nums"}}>{ri+1}</span>
                      </td>
                      {cells.map((cell,ci)=>(
                        <td key={ci} style={{padding:"4px 13px",
                          borderBottom:`1px solid ${t.lineS}`,borderRight:`1px solid ${t.lineS}`,
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
              {Math.min(200,rawRows.length)} / {rawRows.length} baris · Header baris {headerRow+1}
            </span>
            {fileCols.length>0&&(
              <span style={{fontSize:11,color:t.G,fontWeight:500,display:"flex",alignItems:"center",gap:4}}>
                <CheckCircle2 size={10}/>{fileCols.length} kolom terdeteksi
              </span>
            )}
          </div>
        </div>

        {/* CARD 2 — Mapping */}
        <div className="card">
          <div className="sh" style={{gap:10}}>
            <div style={{width:26,height:26,borderRadius:6,background:t.accL,flexShrink:0,
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              <Link2 size={12} style={{color:t.acc}}/>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span className="sl">Mapping Kolom</span>
                {/* progress bar */}
                <div style={{flex:1,maxWidth:120}}>
                  <div className="prog-bar">
                    <div className="prog-fill" style={{
                      width:`${fd.fields.length?Math.round(validation.mapped/fd.fields.length*100):0}%`,
                      background:validation.ok?t.G:t.acc,
                    }}/>
                  </div>
                </div>
                <span style={{fontSize:10,color:validation.ok?t.G:t.t3,fontWeight:600,
                  fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>
                  {validation.mapped}/{fd.fields.length}
                </span>
              </div>
              <div style={{marginTop:3,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                {pkAllMapped&&(
                  <>
                    {loadingDB
                      ?<span style={{fontSize:11,color:t.A,display:"flex",alignItems:"center",gap:4}}>
                        <Loader2 size={10} style={{animation:"spin 1s linear infinite"}}/>Memuat DB…
                      </span>
                      :dbError
                        ?<span style={{fontSize:11,color:t.R,display:"flex",alignItems:"center",gap:4}}>
                          <WifiOff size={10}/>Gagal memuat DB
                        </span>
                        :lastSync
                          ?<span style={{fontSize:11,color:t.G,display:"flex",alignItems:"center",gap:4}}>
                            <CheckCircle2 size={10}/>{Object.keys(existing).length} record · {relTime(lastSync)}
                          </span>
                          :<span style={{fontSize:11,color:t.t3}}>Siap memuat…</span>
                    }
                    <button className="gbtn" style={{height:24,padding:"0 8px",fontSize:10}}
                      disabled={loadingDB} onClick={loadExisting}>
                      <RefreshCw size={10} style={loadingDB?{animation:"spin 1s linear infinite"}:{}}/>Refresh
                    </button>
                  </>
                )}
                {!validation.ok&&validation.miss.length>0&&(
                  <span style={{fontSize:11,color:t.R,display:"flex",alignItems:"center",gap:3}}>
                    <AlertTriangle size={10}/>
                    {validation.miss.slice(0,2).map(f=>f.label).join(", ")}
                    {validation.miss.length>2&&` +${validation.miss.length-2}`}
                  </span>
                )}
                {selectedChip&&(
                  <span style={{fontSize:11,color:t.acc,fontWeight:600,
                    display:"flex",alignItems:"center",gap:4,
                    animation:"fadeUp .15s ease"}}>
                    <Link2 size={10}/>Klik slot untuk assign "{selectedChip}"
                    <button onClick={()=>setSelectedChip(null)}
                      style={{background:"none",border:"none",cursor:"pointer",
                        color:t.t3,padding:0,display:"flex"}}>
                      <X size={10}/>
                    </button>
                  </span>
                )}
              </div>
            </div>
            <button className="gbtn" title="Simpan mapping" onClick={saveMapping} style={{fontSize:10}}>
              <Save size={10}/>Simpan
            </button>
            <button className="gbtn" disabled={!savedMapping[formType]}
              onClick={loadSavedMapping} style={{fontSize:10}}>
              <FolderOpen size={10}/>Muat
              {savedMapping[formType]&&<span style={{fontSize:9,color:t.G}}>●</span>}
            </button>
            <button className="gbtn" onClick={runAuto}><Sparkles size={11}/>Auto-match</button>
          </div>

          <div className="mapping-panel" style={{display:"flex",height:560,overflow:"hidden"}}>
            <div className="left-panel" style={{width:220,flexShrink:0,
              borderRight:`1px solid ${t.line}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              <div style={{borderBottom:`1px solid ${t.line}`,flexShrink:0}}>
                <div style={{padding:"8px 13px 5px",display:"flex",alignItems:"center",gap:5}}>
                  <LayoutList size={10} style={{color:t.t3}}/>
                  <span style={{fontSize:9,fontWeight:700,letterSpacing:".07em",
                    textTransform:"uppercase",color:t.t3}}>Jenis Laporan</span>
                </div>
                {Object.values(FORM_DEFS).map(f=>(
                  <div key={f.id} className={`fti${formType===f.id?" act":""}`}
                    onClick={()=>{setFormType(f.id);setMapping({});setFieldQ("");}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,
                        color:formType===f.id?t.acc:t.t1,
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {f.label.replace("Form ","")}
                      </div>
                      <div style={{fontSize:10,color:t.t3,marginTop:1}}>
                        {f.fields.length} field · {f.fields.filter(x=>x.required).length} wajib
                      </div>
                    </div>
                    {formType===f.id&&<ChevronRight size={12} style={{color:t.acc,flexShrink:0}}/>}
                  </div>
                ))}
              </div>
              <div style={{padding:"9px 11px",borderBottom:`1px solid ${t.lineS}`,flexShrink:0}}>
                <div style={{position:"relative"}}>
                  <Search size={11} style={{position:"absolute",left:8,top:"50%",
                    transform:"translateY(-50%)",color:t.t3,pointerEvents:"none"}}/>
                  <input className="inp" value={colQ} onChange={e=>setColQ(e.target.value)}
                    placeholder="Cari kolom file…" style={{paddingLeft:26,height:30,width:"100%"}}/>
                  {colQ&&<button onClick={()=>setColQ("")}
                    style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",
                      background:"none",border:"none",cursor:"pointer",color:t.t3,padding:2}}>
                    <X size={10}/>
                  </button>}
                </div>
                <div style={{marginTop:5,fontSize:10,color:t.t3,display:"flex",justifyContent:"space-between"}}>
                  <span>{fileCols.filter(c=>!usedCols.has(c)).length} tersedia · {usedCols.size} terpetakan</span>
                  <span style={{color:selectedChip?t.acc:t.t3}}>
                    {selectedChip?"klik slot →":"klik / drag →"}
                  </span>
                </div>
              </div>
              <div style={{flex:1,overflowY:"auto",padding:"9px 11px",
                display:"flex",flexWrap:"wrap",gap:5,alignContent:"flex-start"}}>
                {fileCols
                  .filter(c=>!colQ||c.toLowerCase().includes(colQ.toLowerCase()))
                  .map((col,ci)=>{
                    const isUsed=usedCols.has(col);
                    const isSel=selectedChip===col;
                    return(
                      <div key={`${col}__${ci}`}
                        draggable={!isUsed}
                        onDragStart={e=>{e.dataTransfer.setData("col",col);e.dataTransfer.effectAllowed="link";setSelectedChip(null);}}
                        onClick={()=>{if(!isUsed)setSelectedChip(isSel?null:col);}}
                        className={`chip${isUsed?" cu":isSel?" sel":""}`}>
                        {isUsed?<CheckCircle2 size={8} style={{flexShrink:0}}/>
                          :isSel?<Link2 size={8} style={{flexShrink:0}}/>
                          :null}
                        {col}
                      </div>
                    );
                  })}
              </div>
            </div>

            <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              <div style={{padding:"8px 12px",borderBottom:`1px solid ${t.lineS}`,flexShrink:0,
                display:"flex",alignItems:"center",gap:8,
                background:selectedChip?t.accL:"transparent",transition:"background .15s"}}>
                <div style={{position:"relative",flex:1}}>
                  <SlidersHorizontal size={11} style={{position:"absolute",left:8,top:"50%",
                    transform:"translateY(-50%)",color:t.t3,pointerEvents:"none"}}/>
                  <input className="inp" value={fieldQ} onChange={e=>setFieldQ(e.target.value)}
                    placeholder={selectedChip?`Cari field untuk "${selectedChip}"…`:"Cari field laporan…"}
                    style={{paddingLeft:26,height:28,width:"100%",
                      borderColor:selectedChip?t.acc:undefined,
                      boxShadow:selectedChip?`0 0 0 2px ${t.accL}`:undefined}}/>
                  {fieldQ&&(
                    <button onClick={()=>setFieldQ("")}
                      style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",
                        background:"none",border:"none",cursor:"pointer",color:t.t3,padding:2}}>
                      <X size={10}/>
                    </button>
                  )}
                </div>
                <span style={{fontSize:11,color:t.t3,whiteSpace:"nowrap",flexShrink:0}}>
                  {validation.mapped}/{fd.fields.length}
                </span>
              </div>
              <div style={{flex:1,overflowY:"auto",padding:"12px 15px",
                display:"flex",flexDirection:"column",gap:14}}>
                {Object.entries(
                  filteredFields.reduce((a,f)=>{
                    if(!a[f.group])a[f.group]=[];a[f.group].push(f);return a;
                  },{})
                ).map(([group,fields])=>{
                  const gc=fields.filter(f=>mapping[f.key]).length;
                  const collapsed=collapsedGroups.has(group);
                  return(
                    <div key={group}>
                      <div onClick={()=>toggleGroup(group)}
                        style={{display:"flex",alignItems:"center",gap:6,marginBottom:collapsed?0:7,
                          paddingBottom:5,cursor:"pointer",userSelect:"none",
                          borderBottom:`1px solid ${group==="primary"?t.accB:t.lineS}`}}>
                        <ChevronDown size={12} style={{color:t.t3,flexShrink:0,
                          transform:collapsed?"rotate(-90deg)":"none",transition:"transform .15s"}}/>
                        <span style={{fontSize:9,fontWeight:700,letterSpacing:".07em",
                          textTransform:"uppercase",color:group==="primary"?t.acc:t.t3}}>
                          {(GROUP_META[group]||{}).label||group}
                        </span>
                        {group==="primary"&&(
                          <span style={{fontSize:10,color:t.t3,fontWeight:400,
                            textTransform:"none",letterSpacing:0}}>
                            — isi semua untuk auto-load DB
                          </span>
                        )}
                        {gc>0&&<Bdg c="green">{gc}/{fields.length}</Bdg>}
                      </div>
                      {!collapsed&&(
                        <div style={{display:"grid",
                          gridTemplateColumns:"repeat(auto-fill,minmax(185px,1fr))",gap:5}}>
                          {fields.map(f=>{
                            const mp=mapping[f.key];
                            const isOver=dragField===f.key;
                            const canAssign=!!selectedChip&&!mp;
                            const sc=`slot${isOver||canAssign?" ov":""}${mp?" ok":""}${!mp&&f.required&&!canAssign?" req":""}${canAssign?" clickable":""}`;
                            return(
                              <div key={f.key}>
                                <div style={{fontSize:10,fontWeight:600,color:t.t3,marginBottom:2,
                                  display:"flex",alignItems:"center",gap:3}}>
                                  {f.required&&<span style={{color:mp?t.G:t.R,fontSize:7}}>●</span>}
                                  <span style={{overflow:"hidden",textOverflow:"ellipsis",
                                    whiteSpace:"nowrap",flex:1,color:mp?t.t1:t.t2}}>{f.label}</span>
                                </div>
                                <div className={sc}
                                  onClick={()=>{if(canAssign)assignChip(f.key);else if(mp&&!selectedChip)removeMp(f.key);}}
                                  onDragOver={e=>{e.preventDefault();setDragField(f.key);}}
                                  onDragLeave={()=>setDragField(null)}
                                  onDrop={e=>{
                                    e.preventDefault();
                                    const col=e.dataTransfer.getData("col");if(!col)return;
                                    setMapping(p=>{
                                      const c=Object.fromEntries(Object.entries(p).filter(([,v])=>v!==col));
                                      return{...c,[f.key]:col};
                                    });
                                    setDragField(null);
                                  }}>
                                  {mp?(
                                    <>
                                      <CheckCircle2 size={10} style={{color:t.G,flexShrink:0}}/>
                                      <span style={{fontSize:11,fontWeight:500,color:t.G,flex:1,
                                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                        {mp}
                                      </span>
                                      <button onClick={e=>{e.stopPropagation();removeMp(f.key);}}
                                        style={{background:"none",border:"none",cursor:"pointer",
                                          color:t.t3,padding:2,display:"flex",flexShrink:0,
                                          borderRadius:4,transition:".1s"}}
                                        title="Hapus mapping">
                                        <X size={10}/>
                                      </button>
                                    </>
                                  ):canAssign?(
                                    <span style={{color:t.acc,fontStyle:"italic",fontSize:11}}>
                                      Klik untuk assign "{selectedChip}"
                                    </span>
                                  ):(
                                    <span style={{color:isOver?t.acc:t.t3,fontStyle:"italic",fontSize:11}}>
                                      {isOver?"Lepaskan di sini…":"Drop / klik kolom"}
                                    </span>
                                  )}
                                </div>
                                {/* Period dropdown for period_select type */}
                                {f.type==="period_select"&&(
                                  <div style={{marginTop:4}}>
                                    <select
                                      value={fixedValues[f.key]||""}
                                      onChange={e=>{
                                        const v=e.target.value;
                                        if(v){
                                          setFixedValues(p=>({...p,[f.key]:v}));
                                          /* clear column mapping if any */
                                          setMapping(p=>{const c={...p};delete c[f.key];return c;});
                                        }else{
                                          setFixedValues(p=>{const c={...p};delete c[f.key];return c;});
                                        }
                                      }}
                                      style={{width:"100%",fontSize:11,padding:"4px 6px",
                                        background:fixedValues[f.key]?t.G+"22":t.bg,
                                        color:fixedValues[f.key]?t.G:t.t2,
                                        border:`1px solid ${fixedValues[f.key]?t.G:t.lineS}`,
                                        borderRadius:5,cursor:"pointer",outline:"none"}}>
                                      <option value="">— Pilih periode —</option>
                                      {sdpPeriods.map(p=>(
                                        <option key={p} value={p}>{p}</option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* CARD 3 — Diff Table */}
        {parsedRows.length>0&&(
          <div className="card">
            <div style={{padding:"10px 16px",borderBottom:`1px solid ${t.line}`,
              display:"flex",gap:6,flexWrap:"wrap",alignItems:"stretch"}}>
              {[
                {k:"all",l:"Semua",n:parsedRows.length,c:t.t2,bg:"transparent"},
                {k:"new",l:"Baru",n:newsRows.length,c:t.B,bg:t.BL,desc:"akan ditambah"},
                {k:"update",l:"Update",n:updates.length,c:t.A,bg:t.AL,desc:totalChangedFields>0?`${totalChangedFields} nilai berubah`:"ada di DB"},
                {k:"same",l:"Sama",n:sameRows.length,c:t.t3,bg:"transparent",desc:"dilewati"},
                {k:"skip",l:"Invalid",n:skipped.length,c:t.R,bg:t.RL,desc:"kolom wajib kosong"},
              ].map(x=>(
                <button key={x.k} onClick={()=>setFilter(x.k)}
                  className={`stat-pill${filter===x.k?" active":""}`}
                  style={{"--pill-color":x.c}}>
                  <span style={{fontSize:20,fontWeight:800,color:filter===x.k?t.acc:x.c,
                    fontVariantNumeric:"tabular-nums",lineHeight:1.1,letterSpacing:"-.02em"}}>{x.n}</span>
                  <span style={{fontSize:10,fontWeight:700,color:filter===x.k?t.acc:t.t2,
                    letterSpacing:".01em"}}>{x.l}</span>
                  {x.desc&&<span style={{fontSize:9,color:t.t3}}>{x.desc}</span>}
                </button>
              ))}
              <div style={{flex:1}}/>
              {mappedNonPK.length>0&&(
                <button className="gbtn" onClick={exportDiff} style={{alignSelf:"center"}}>
                  <FileDown size={11}/>Export Diff
                </button>
              )}
            </div>

            {updates.length>0&&(
              <div style={{padding:"8px 16px",background:t.AL,borderBottom:`1px solid ${t.AB}`,
                display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                <AlertTriangle size={12} style={{color:t.A,flexShrink:0}}/>
                <span style={{fontSize:12,color:t.A,flex:1}}>
                  <strong>{updates.length} baris</strong> akan diperbarui ·{" "}
                  <strong>{totalChangedFields} nilai berubah</strong>
                  {sameRows.length>0&&<> · <strong>{sameRows.length} baris sama</strong> dilewati otomatis</>}
                </span>
                <span style={{fontSize:11,color:t.t3,display:"flex",alignItems:"center",gap:4}}>
                  <History size={10}/>Tercatat di Log SQL
                </span>
              </div>
            )}

            <div style={{overflowX:"auto",overflowY:"auto",maxHeight:520}}>
              <table style={{borderCollapse:"collapse",fontSize:12,minWidth:"max-content"}}>
                <thead style={{position:"sticky",top:0,zIndex:10}}>
                  <tr style={{background:t.raised}}>
                    <th style={{padding:"9px 12px",position:"sticky",left:0,zIndex:11,
                      background:t.raised,borderBottom:`2px solid ${t.line}`,
                      borderRight:`1px solid ${t.line}`,width:110,minWidth:110,verticalAlign:"middle"}}>
                      <span style={{fontSize:9,fontWeight:700,letterSpacing:".07em",
                        textTransform:"uppercase",color:t.t3}}>Status</span>
                    </th>
                    {formPK.map((k,ki)=>{
                      const f=fd.fields.find(x=>x.key===k);
                      return(
                        <th key={k} style={{padding:"9px 11px",textAlign:"left",verticalAlign:"middle",
                          background:t.raised,borderBottom:`2px solid ${t.line}`,
                          borderRight:ki===formPK.length-1?`2px solid ${t.line}`:`1px solid ${t.lineS}`,
                          fontSize:10,fontWeight:700,color:t.acc,whiteSpace:"nowrap",minWidth:120}}>
                          <div>{f?.label||k}</div>
                          <div style={{fontSize:9,fontWeight:400,color:t.t3,marginTop:1}}>Primary Key</div>
                        </th>
                      );
                    })}
                    {/* Last Updated column */}
                    <th style={{padding:"9px 11px",textAlign:"left",verticalAlign:"middle",
                      background:t.raised,borderBottom:`2px solid ${t.line}`,
                      borderRight:`2px solid ${t.line}`,fontSize:10,fontWeight:700,
                      color:t.t3,whiteSpace:"nowrap",minWidth:130}}>
                      <div>Last Updated</div>
                      <div style={{fontSize:9,fontWeight:400,color:t.t3,marginTop:1}}>Di Database</div>
                    </th>
                    {mappedNonPK.map(f=>(
                      <th key={f.key} colSpan={2} style={{padding:0,background:t.raised,
                        borderBottom:`2px solid ${t.line}`,borderLeft:`2px solid ${t.line}`,minWidth:200}}>
                        <div style={{padding:"5px 11px 3px",borderBottom:`1px solid ${t.lineS}`,
                          display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:11,fontWeight:600,color:t.t1,flex:1,whiteSpace:"nowrap"}}>
                            {f.label}
                          </span>
                          <span style={{fontSize:10,color:t.t3,whiteSpace:"nowrap"}}>← {mapping[f.key]}</span>
                        </div>
                        <div style={{display:"flex"}}>
                          <div style={{flex:1,padding:"3px 10px",textAlign:"right",
                            fontSize:10,fontWeight:700,color:t.G,borderRight:`1px solid ${t.lineS}`}}>
                            ↑ Baru
                          </div>
                          <div style={{flex:1,padding:"3px 10px",textAlign:"right",
                            fontSize:10,fontWeight:700,color:t.R,
                            background:d?"rgba(255,69,58,0.03)":"rgba(217,48,37,0.02)"}}>
                            Lama (DB)
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((row,idx)=>{
                    const ex=existing[row._pk];
                    const st=rowStatus(row);
                    const rowBg=idx%2===0?"transparent":d?"rgba(255,255,255,0.012)":"rgba(0,0,0,0.014)";
                    const isSame=st==="same";
                    const stickyBg=st==="update"?(d?"#1A1500":"#FFFBEA")
                      :st==="new"?(d?"#001412":"#F0FDF5")
                      :isSame?(d?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.025)")
                      :t.card;
                    const nChanges=st==="update"&&ex?mappedNonPK.filter(f=>{
                      const nv=row[f.key],ov=ex[f.key];
                      if(f.type==="numeric"){
                        const nn=typeof nv==="number"?nv:pNum(nv);
                        return nn!==null&&nn!==pNum(String(ov??""));
                      }
                      return String(nv||"").trim()!==String(ov||"").trim();
                    }).length:0;

                    return(
                      <tr key={row._i} className="dr"
                        style={{background:rowBg,borderBottom:`1px solid ${t.lineS}`,
                          opacity:isSame?.55:1}}>
                        {/* status cell */}
                        <td style={{padding:"6px 12px",position:"sticky",left:0,zIndex:2,
                          background:stickyBg,borderRight:`1px solid ${t.line}`,
                          verticalAlign:"middle",whiteSpace:"nowrap"}}>
                          {st==="skip"?(
                            <div>
                              <Bdg c="red">Skip</Bdg>
                              <div style={{fontSize:9,color:t.R,marginTop:2,maxWidth:100,
                                lineHeight:1.4}}>{skipReason(row)}</div>
                            </div>
                          ):st==="new"?(
                            <Bdg c="green"><CheckCircle2 size={9}/>Baru</Bdg>
                          ):st==="update"?(
                            <div style={{display:"flex",flexDirection:"column",gap:2}}>
                              <Bdg c="amber"><AlertTriangle size={9}/>Update</Bdg>
                              {nChanges>0&&(
                                <span style={{fontSize:9,color:t.A,fontWeight:600}}>
                                  {nChanges} kolom berubah
                                </span>
                              )}
                            </div>
                          ):(
                            <div style={{display:"flex",flexDirection:"column",gap:2}}>
                              <Bdg c="gray"><Equal size={9}/>Sama</Bdg>
                              <span style={{fontSize:9,color:t.t3}}>dilewati</span>
                            </div>
                          )}
                        </td>
                        {/* PK cells */}
                        {formPK.map((k,ki)=>(
                          <td key={k} style={{padding:"6px 11px",
                            color:!row[k]&&fd.fields.find(f=>f.key===k)?.required?t.R:t.t1,
                            fontWeight:ki===0?600:400,whiteSpace:"nowrap",
                            overflow:"hidden",textOverflow:"ellipsis",maxWidth:180,verticalAlign:"middle",
                            borderRight:ki===formPK.length-1?`2px solid ${t.line}`:`1px solid ${t.lineS}`,
                            ...(ki===0?{
                              position:"sticky",left:110,zIndex:2,background:stickyBg}:{})}}>
                            {String(row[k]||"—")}
                          </td>
                        ))}
                        {/* Last Updated from DB */}
                        <td style={{padding:"6px 11px",verticalAlign:"middle",
                          borderRight:`2px solid ${t.line}`,whiteSpace:"nowrap"}}>
                          {ex?.updated_at?(
                            <div style={{lineHeight:1.3}}>
                              <div style={{fontSize:11,color:t.t2}}>
                                {new Date(ex.updated_at).toLocaleDateString("id-ID",{
                                  day:"2-digit",month:"short",year:"numeric"
                                })}
                              </div>
                              <div style={{fontSize:10,color:t.t3}}>
                                {new Date(ex.updated_at).toLocaleTimeString("id-ID",{
                                  hour:"2-digit",minute:"2-digit"
                                })}
                              </div>
                            </div>
                          ):(
                            <span style={{fontSize:11,color:t.t3,fontStyle:"italic"}}>
                              {st==="new"?"Baru":"—"}
                            </span>
                          )}
                        </td>
                        {/* data pairs */}
                        {mappedNonPK.map(f=>{
                          const nRaw=row[f.key],oRaw=ex?ex[f.key]:undefined;
                          const isNum=f.type==="numeric";
                          const nDisp=dispRaw(nRaw,isNum);
                          const oDisp=oRaw===undefined?"—":dispRaw(oRaw,isNum);
                          let changed=false;
                          if(ex&&nDisp!=="—"&&!isSame){
                            if(isNum){
                              const nn=typeof nRaw==="number"?nRaw:pNum(nRaw);
                              changed=nn!==null&&nn!==pNum(String(oRaw??""));
                            }else changed=String(nRaw||"").trim()!==String(oRaw||"").trim();
                          }
                          return(
                            <React.Fragment key={f.key}>
                              <td style={{padding:"6px 10px",textAlign:"right",
                                fontVariantNumeric:"tabular-nums",fontSize:12,
                                borderLeft:`2px solid ${t.line}`,borderRight:`1px solid ${t.lineS}`,
                                verticalAlign:"middle",whiteSpace:"nowrap",
                                color:changed?t.G:isSame?t.t3:nDisp==="—"?t.t3:t.t1,
                                fontWeight:changed?700:400,
                                background:changed?(d?"rgba(48,209,88,0.07)":"rgba(40,167,69,0.06)"):"transparent"}}>
                                {changed&&<span style={{fontSize:9,marginRight:4,opacity:.7}}>↑</span>}
                                {nDisp}
                              </td>
                              <td style={{padding:"6px 10px",textAlign:"right",
                                fontVariantNumeric:"tabular-nums",fontSize:12,
                                borderRight:`1px solid ${t.line}`,verticalAlign:"middle",whiteSpace:"nowrap",
                                color:changed?t.R:t.t3,fontWeight:changed?600:400,
                                background:d?"rgba(255,255,255,0.016)":"rgba(0,0,0,0.013)"}}>
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
                    <tr><td colSpan={999} style={{padding:"36px",textAlign:"center",color:t.t3,fontSize:13}}>
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
                <span style={{width:7,height:7,borderRadius:2,background:t.G,display:"inline-block"}}/>Nilai Baru
              </span>
              <span style={{fontSize:11,color:t.R,display:"flex",alignItems:"center",gap:4}}>
                <span style={{width:7,height:7,borderRadius:2,background:t.R,display:"inline-block"}}/>Nilai Lama (DB)
              </span>
              {sameRows.length>0&&(
                <span style={{fontSize:11,color:t.t3,display:"flex",alignItems:"center",gap:4}}>
                  <Equal size={10}/>{sameRows.length} baris sama dilewati
                </span>
              )}
              <span style={{fontSize:11,color:t.t3,marginLeft:"auto"}}>← Scroll horizontal</span>
            </div>
          </div>
        )}

        {/* Import button / result */}
        {!result?(
          <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",
            gap:9,paddingBottom:24,flexWrap:"wrap"}}>
            {toImport.length===0&&parsedRows.length>0&&(
              <span style={{fontSize:12,color:t.t3,fontWeight:500,
                display:"flex",alignItems:"center",gap:4}}>
                <Check size={12}/>{sameRows.length>0
                  ?"Semua data sudah sama dengan DB — tidak ada yang perlu diimport"
                  :"Tidak ada baris valid"}
              </span>
            )}
            {!validation.ok&&toImport.length>0&&(
              <span style={{fontSize:12,color:t.A,fontWeight:500,
                display:"flex",alignItems:"center",gap:4}}>
                <AlertTriangle size={12}/>Petakan kolom wajib dulu
              </span>
            )}
            {sameRows.length>0&&toImport.length>0&&(
              <span style={{fontSize:12,color:t.t3,display:"flex",alignItems:"center",gap:4}}>
                <Equal size={12}/>{sameRows.length} baris sama dilewati otomatis
              </span>
            )}
            <button
              onClick={updates.length>0?()=>setConfirmOpen(true):doImport}
              disabled={importing||toImport.length===0||!validation.ok}
              style={{display:"inline-flex",alignItems:"center",gap:7,
                height:42,padding:"0 22px",borderRadius:10,border:"none",
                background:"#ED1C24",color:"#fff",fontFamily:FF,
                fontSize:13,fontWeight:600,cursor:"pointer",letterSpacing:"-.01em",
                boxShadow:"0 2px 12px rgba(237,28,36,.28)",
                opacity:importing||toImport.length===0||!validation.ok?.44:1,transition:"all .14s"}}>
              {importing
                ?<><Loader2 size={14} style={{animation:"spin 1s linear infinite"}}/>Mengimport…</>
                :<><Download size={14}/>
                  Import {toImport.length.toLocaleString("id-ID")} Baris
                  {updates.length>0&&(
                    <span style={{opacity:.75,fontWeight:400,fontSize:11}}>
                      &nbsp;· {updates.length} update
                    </span>
                  )}
                </>
              }
            </button>
          </div>
        ):(
          <div className="card" style={{padding:"28px 24px",textAlign:"center",marginBottom:24,
            borderColor:result.fail===0?t.GB:t.AB}}>
            <div style={{width:54,height:54,borderRadius:14,margin:"0 auto 16px",
              background:result.fail===0?t.G:t.A,
              display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",
              boxShadow:result.fail===0?"0 4px 18px rgba(48,209,88,.32)":"0 4px 18px rgba(255,214,10,.30)"}}>
              {result.fail===0?<CheckCircle2 size={24}/>:<AlertTriangle size={24}/>}
            </div>
            <div style={{fontSize:18,fontWeight:700,letterSpacing:"-.03em",marginBottom:8,
              color:result.fail===0?t.G:t.A}}>
              {result.aborted?"Import Dihentikan"
                :result.fail===0?"Import Berhasil":"Selesai dengan Peringatan"}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",
              gap:8,marginBottom:16}}>
              {[
                {label:"Berhasil",val:result.ok,c:t.G},
                {label:"Gagal",val:result.fail,c:result.fail?t.R:t.t3},
                {label:"Sama (skip)",val:result.skippedSame||0,c:t.t3},
              ].map(x=>(
                <div key={x.label} style={{background:t.raised,borderRadius:9,padding:"10px 12px",
                  border:`1px solid ${t.lineS}`}}>
                  <div style={{fontSize:22,fontWeight:800,color:x.c,
                    fontVariantNumeric:"tabular-nums"}}>{x.val.toLocaleString("id-ID")}</div>
                  <div style={{fontSize:11,color:t.t3,marginTop:2}}>{x.label}</div>
                </div>
              ))}
            </div>
            {result.fail===0&&!result.aborted&&(
              <div style={{fontSize:12,color:t.t3,marginBottom:4}}>
                <Database size={11} style={{verticalAlign:"middle"}}/>{" "}
                Perubahan tercatat di Log SQL — bisa direvert per-kolom kapan saja
              </div>
            )}
            {result.errs?.length>0&&(
              <div style={{fontSize:12,color:t.R,marginBottom:10,padding:"8px 12px",
                background:t.RL,borderRadius:8,border:`1px solid ${t.RB}`}}>
                {result.errs[0]}
              </div>
            )}
            <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",marginTop:16}}>
              <button className="gbtn" style={{height:34,padding:"0 14px",fontSize:12}}
                onClick={()=>setShowLog(true)}>
                <History size={11}/>Lihat Log Perubahan
              </button>
              <button className="gbtn" style={{height:34,padding:"0 14px",fontSize:12}} onClick={reset}>
                <RefreshCw size={11}/>Import File Baru
              </button>
              <button className="gbtn" style={{height:34,padding:"0 14px",fontSize:12}}
                onClick={()=>setResult(null)}>Lihat Data Lagi</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}