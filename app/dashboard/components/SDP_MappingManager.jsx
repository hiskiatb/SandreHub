"use client";
/**
 * SDP_MappingManager.jsx — v4
 * Tabel kode otoritas BSM & CSE/RGE.
 * - SDP aktif per cluster
 * - Export CSV (Excel) & Print
 * - Tanpa toggle nonaktif (data permanen)
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Plus, Copy, Check, RefreshCw, Loader2,
  UserCheck, Clock, Search, X, KeyRound,
  AlertTriangle, Download, Printer, ChevronDown,
} from "lucide-react";

// ─── Theme ────────────────────────────────────────────────────────────────────
const mk = (d) => ({
  bg    : d ? "#0D0D0F" : "#F2F4F7",
  card  : d ? "#17171B" : "#FFFFFF",
  sub   : d ? "#1D1D22" : "#F8F9FA",
  line  : d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi    : d ? "#F1F1F4" : "#0F1117",
  mid   : d ? "#8A8A9C" : "#6B7280",
  lo    : d ? "#4A4A5E" : "#A0A8B4",
  teal  : "#32BCAD", tealD : "#1A9E90",
  tealBg: d ? "rgba(50,188,173,.12)"  : "rgba(26,158,144,.09)",
  tealBd: d ? "rgba(50,188,173,.3)"   : "rgba(26,158,144,.25)",
  blue  : d ? "#0A84FF" : "#2563EB",
  blueBg: d ? "rgba(10,132,255,.1)"   : "rgba(37,99,235,.07)",
  blueBd: d ? "rgba(10,132,255,.25)"  : "rgba(37,99,235,.2)",
  G     : d ? "#30D158" : "#16A34A",
  GL    : d ? "rgba(48,209,88,.1)"    : "rgba(22,163,74,.07)",
  GB    : d ? "rgba(48,209,88,.25)"   : "rgba(22,163,74,.2)",
  A     : d ? "#FFD60A" : "#D97706",
  AL    : d ? "rgba(255,214,10,.08)"  : "rgba(217,119,6,.06)",
  AB    : d ? "rgba(255,214,10,.22)"  : "rgba(217,119,6,.18)",
  R     : d ? "#FF453A" : "#DC2626",
  RL    : d ? "rgba(255,69,58,.1)"    : "rgba(220,38,38,.07)",
  RB    : d ? "rgba(255,69,58,.25)"   : "rgba(220,38,38,.2)",
  sm    : d ? "0 1px 4px rgba(0,0,0,.5)"  : "0 1px 3px rgba(0,0,0,.06)",
  md    : d ? "0 6px 20px rgba(0,0,0,.5)" : "0 6px 18px rgba(0,0,0,.09)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

// ─── Static ───────────────────────────────────────────────────────────────────
const BRANCH_MAP = {
  "CENTRAL SUMATERA": ["BATAM","DUMAI","JAMBI","PADANG","PEKANBARU"],
  "NORTH SUMATERA"  : ["ACEH","DELI SERDANG","KISARAN","LHOKSEUMAWE","MEDAN","SIANTAR SIDEMPUAN"],
  "SOUTH SUMATERA"  : ["BANDAR LAMPUNG","BATURAJA","BENGKULU","METRO - KOTA BUMI","PALEMBANG","PANGKAL PINANG","SRIBAWONO"],
};
const AREAS    = Object.keys(BRANCH_MAP);
const BU_TYPES = ["MITRA IM3", "3KIOSK"];

const genCode = () => {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => c[Math.floor(Math.random() * c.length)]).join("");
};
const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("id-ID", { day:"2-digit", month:"short", year:"numeric" }) : "–";
const getClusters = (row) =>
  row.clusters?.length ? row.clusters : (row.cluster ? [row.cluster] : []);

// ─── CodeChip ─────────────────────────────────────────────────────────────────
function CodeChip({ code, t }) {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="no-print-btn" style={{ display:"flex", alignItems:"center", gap:4 }}>
      <code style={{ fontFamily:"monospace", fontSize:12, fontWeight:800, letterSpacing:2.5, color:t.hi, background:t.sub, padding:"3px 8px", borderRadius:5, border:`1px solid ${t.line}` }}>
        {code}
      </code>
      <button onClick={copy} title="Salin" style={{ background:"none", border:"none", cursor:"pointer", color:copied?t.G:t.lo, padding:3, transition:"color .15s" }}>
        {copied ? <Check size={11}/> : <Copy size={11}/>}
      </button>
    </div>
  );
}

// ─── Create Modal ─────────────────────────────────────────────────────────────
function CreateModal({ profile, supabase, sdpClusters, onCreated, onClose, t }) {
  const isSPM = profile?.role === "spm_sumatera";
  const isBSM = profile?.role === "bsm";
  const bsmA  = profile?._assignment ?? (profile?.bsm_branch ? { branch: profile.bsm_branch, bu_type: null, area: null } : null);

  const [role,    setRole]    = useState(isSPM ? "bsm" : "cse_rge");
  const [buType,  setBuType]  = useState(bsmA?.bu_type ?? BU_TYPES[0]);
  const [area,    setArea]    = useState(AREAS[0]);
  const [branch,  setBranch]  = useState(BRANCH_MAP[AREAS[0]][0]);
  const [selCls,  setSelCls]  = useState([]);
  const [label,   setLabel]   = useState("");
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState("");

  const branches    = BRANCH_MAP[area] ?? [];
  const clusterList = useMemo(() =>
    [...new Set(sdpClusters.filter(c => c.branch === (isBSM ? bsmA?.branch : branch) && c.bu_type === buType).map(c => c.cluster))].sort(),
    [sdpClusters, branch, buType, isBSM, bsmA]
  );

  const toggle = (cl) => setSelCls(p => p.includes(cl) ? p.filter(x=>x!==cl) : [...p, cl]);

  const handleCreate = async () => {
    if (role !== "bsm" && selCls.length === 0) { setErr("Pilih minimal satu cluster."); return; }
    setLoading(true); setErr("");
    try {
      const effBranch = isBSM ? bsmA.branch  : branch;
      const effBuType = isBSM ? bsmA.bu_type : buType;
      const effArea   = isBSM ? bsmA.area    : area;
      const { error } = await supabase.from("sdp_assignments").insert({
        role,
        bu_type        : effBuType,
        area           : effArea,
        branch         : effBranch,
        cluster        : (role!=="bsm" && selCls.length===1) ? selCls[0] : null,
        clusters       : role!=="bsm" ? selCls : [],
        label          : label.trim()||null,
        authority_code : genCode(),
        is_registered  : false,
        is_active      : true,
        created_by     : profile?.id   ?? null,
        created_by_name: profile?.full_name ?? null,
        created_by_role: profile?.role  ?? null,
      });
      if (error) throw error;
      onCreated(); onClose();
    } catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const SL = ({ lbl, value, onChange, children }) => (
    <div style={{ marginBottom:11 }}>
      <div style={{ fontSize:11, fontWeight:700, color:t.mid, letterSpacing:.5, marginBottom:4 }}>{lbl}</div>
      <select value={value} onChange={e=>onChange(e.target.value)} style={{ width:"100%", height:35, padding:"0 10px", borderRadius:8, fontFamily:FF, fontSize:13, color:t.hi, background:t.sub, border:`1px solid ${t.line}`, outline:"none" }}>
        {children}
      </select>
    </div>
  );

  return (
    <div style={{ position:"fixed", inset:0, zIndex:300, background:"rgba(0,0,0,.55)", backdropFilter:"blur(7px)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ width:"100%", maxWidth:420, background:t.card, borderRadius:18, border:`1px solid ${t.line}`, boxShadow:t.md, padding:"24px 22px 20px", maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:18 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:t.hi, letterSpacing:-.3 }}>Buat Kode Otoritas</div>
            <div style={{ fontSize:12, color:t.mid, marginTop:2 }}>Kode akan digenerate otomatis</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:t.lo }}><X size={17}/></button>
        </div>

        {isSPM && <SL lbl="ROLE" value={role} onChange={setRole}><option value="bsm">BSM</option><option value="cse_rge">CSE/RGE</option></SL>}
        {!isBSM && <SL lbl="SDP TYPE" value={buType} onChange={v=>{setBuType(v);setSelCls([]);}}>{BU_TYPES.map(b=><option key={b} value={b}>{b}</option>)}</SL>}
        {isSPM && <>
          <SL lbl="AREA" value={area} onChange={v=>{setArea(v);setBranch(BRANCH_MAP[v][0]);setSelCls([]);}}>{AREAS.map(a=><option key={a} value={a}>{a}</option>)}</SL>
          <SL lbl="BRANCH" value={branch} onChange={v=>{setBranch(v);setSelCls([]);}}>{branches.map(b=><option key={b} value={b}>{b}</option>)}</SL>
        </>}
        {isBSM && <div style={{ marginBottom:12, padding:"9px 12px", borderRadius:8, background:t.tealBg, border:`1px solid ${t.tealBd}`, fontSize:12, color:t.tealD, fontWeight:700 }}>{bsmA?.branch} · {bsmA?.bu_type}</div>}

        {/* Cluster picker */}
        {role !== "bsm" && (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:t.mid, letterSpacing:.5, marginBottom:6 }}>CLUSTER <span style={{ color:t.lo, fontWeight:400, letterSpacing:0 }}>(pilih satu atau lebih)</span></div>
            {clusterList.length === 0
              ? <div style={{ fontSize:12, color:t.lo, fontStyle:"italic" }}>Tidak ada cluster tersedia</div>
              : <div style={{ display:"flex", flexWrap:"wrap", gap:5, padding:"9px", borderRadius:9, background:t.sub, border:`1px solid ${t.line}` }}>
                  {clusterList.map(cl => {
                    const on = selCls.includes(cl);
                    return (
                      <span key={cl} onClick={()=>toggle(cl)} style={{ fontSize:11.5, fontWeight:on?700:500, padding:"3px 10px", borderRadius:20, background:on?t.tealBg:"transparent", border:`1.5px ${on?"solid":"dashed"} ${on?t.teal:t.lo}`, color:on?t.tealD:t.mid, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:4, userSelect:"none" }}>
                        {on && <Check size={9} strokeWidth={3}/>}{cl}
                      </span>
                    );
                  })}
                </div>
            }
            {selCls.length > 1 && <div style={{ fontSize:11, color:t.tealD, marginTop:5, fontWeight:600 }}>✓ {selCls.length} cluster → satu kode otoritas</div>}
          </div>
        )}

        {/* Label */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:t.mid, letterSpacing:.5, marginBottom:4 }}>LABEL <span style={{ color:t.lo, fontWeight:400 }}>(opsional)</span></div>
          <input placeholder="Contoh: Ahmad — CSE Padang IM3" value={label} onChange={e=>setLabel(e.target.value)}
            style={{ width:"100%", height:35, padding:"0 10px", boxSizing:"border-box", borderRadius:8, fontFamily:FF, fontSize:13, color:t.hi, background:t.sub, border:`1px solid ${t.line}`, outline:"none" }}/>
        </div>

        {err && <div style={{ padding:"8px 12px", borderRadius:8, marginBottom:10, background:t.RL, border:`1px solid ${t.RB}`, fontSize:12.5, color:t.R }}>{err}</div>}

        <div style={{ display:"flex", gap:7 }}>
          <button onClick={onClose} style={{ flex:1, height:38, borderRadius:9, cursor:"pointer", background:"none", border:`1px solid ${t.line}`, color:t.mid, fontFamily:FF, fontSize:13, fontWeight:600 }}>Batal</button>
          <button onClick={handleCreate} disabled={loading} style={{ flex:2, height:38, borderRadius:9, cursor:"pointer", background:"linear-gradient(135deg,#32BCAD,#1A9E90)", border:"none", color:"#fff", fontFamily:FF, fontSize:13, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", gap:6, boxShadow:"0 4px 12px rgba(50,188,173,.3)", opacity:loading?.7:1 }}>
            {loading ? <Loader2 size={14} style={{ animation:"spin 1s linear infinite" }}/> : <><KeyRound size={13}/> Generate Kode</>}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SDP_MappingManager({ supabase, theme = "dark", profile }) {
  const d   = theme === "dark";
  const t   = mk(d);
  const isSPM = profile?.role === "spm_sumatera";
  const isBSM = profile?.role === "bsm";
  const bsmA  = profile?._assignment ?? (profile?.bsm_branch ? { branch: profile.bsm_branch, bu_type: null, area: null } : null);

  const [rows,       setRows]       = useState([]);
  const [sdpClusters, setSdpClusters] = useState([]);
  const [sdpCountMap, setSdpCountMap] = useState({});   // "branch|type|cluster" → count
  const [loading,    setLoading]    = useState(false);
  const [err,        setErr]        = useState("");
  const [search,     setSearch]     = useState("");
  const [fRole,      setFRole]      = useState("ALL");
  const [fStatus,    setFStatus]    = useState("ALL");
  const [fBuType,    setFBuType]    = useState("ALL");
  const [fBranch,    setFBranch]    = useState("ALL");
  const [showForm,   setShowForm]   = useState(false);
  const printRef = useRef(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      let aQ = supabase.from("sdp_assignments").select("*")
        .eq("is_active", true)
        .order("role").order("branch").order("bu_type");
      if (isBSM && bsmA) aQ = aQ.eq("branch", bsmA.branch).eq("bu_type", bsmA.bu_type);

      let mQ = supabase.from("sdp_master_current").select("area,branch,type,cluster");
      if (isBSM && bsmA) mQ = mQ.eq("branch", bsmA.branch).eq("type", bsmA.bu_type);

      const [aRes, mRes] = await Promise.all([aQ, mQ]);
      if (aRes.error) throw new Error(aRes.error.message);
      if (mRes.error) throw new Error(mRes.error.message);

      setRows(aRes.data ?? []);

      // Build sdp count map + deduplicated cluster list
      const countMap = {};
      const seen     = new Set();
      const uniq     = [];
      for (const r of (mRes.data ?? [])) {
        if (!r.cluster?.trim()) continue;
        // Count per (branch|type|cluster)
        const k = `${r.branch}|${r.type}|${r.cluster}`;
        countMap[k] = (countMap[k] ?? 0) + 1;
        // Count per (branch|type) for BSM rows
        const kb = `${r.branch}|${r.type}`;
        countMap[kb] = (countMap[kb] ?? 0) + 1;
        if (!seen.has(k)) { seen.add(k); uniq.push({ area:r.area, branch:r.branch, bu_type:r.type, cluster:r.cluster }); }
      }
      setSdpCountMap(countMap);
      setSdpClusters(uniq);
    } catch(e) { setErr(e.message ?? String(e)); }
    finally { setLoading(false); }
  }, [supabase, isBSM, bsmA]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Branch options for filter ──────────────────────────────────────────────
  const allBranches = useMemo(() => {
    const s = new Set(rows.map(r => r.branch)); return [...s].sort();
  }, [rows]);

  // ── SDP count for a row ────────────────────────────────────────────────────
  const sdpCount = useCallback((row) => {
    if (row.role === "bsm") return sdpCountMap[`${row.branch}|${row.bu_type}`] ?? 0;
    const cls = getClusters(row);
    return cls.reduce((s, cl) => s + (sdpCountMap[`${row.branch}|${row.bu_type}|${cl}`] ?? 0), 0);
  }, [sdpCountMap]);

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = rows;
    if (fRole   !== "ALL") list = list.filter(r => fRole==="bsm" ? r.role==="bsm" : r.role!=="bsm");
    if (fStatus !== "ALL") list = list.filter(r => fStatus==="registered" ? r.is_registered : !r.is_registered);
    if (fBuType !== "ALL") list = list.filter(r => r.bu_type === fBuType);
    if (fBranch !== "ALL") list = list.filter(r => r.branch === fBranch);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        [r.authority_code, r.branch, r.label, r.user_name, r.user_email, ...getClusters(r)]
          .filter(Boolean).some(v => v.toLowerCase().includes(q))
      );
    }
    return list;
  }, [rows, fRole, fStatus, fBuType, fBranch, search]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const total  = rows.length;
  const regCt  = rows.filter(r => r.is_registered).length;
  const pendCt = rows.filter(r => !r.is_registered).length;
  const totalSdp = Object.values(sdpCountMap).filter((_,i,arr) => {
    // avoid double-counting; just count from sdpClusters
    return false;
  }).length; // easier: use sdpClusters.length
  const sdpTotal = sdpClusters.length > 0
    ? Object.entries(sdpCountMap).filter(([k]) => k.split("|").length === 3).reduce((s, [,v]) => s + v, 0) / 2
    : 0;
  // simpler: just count sdp_master rows
  const activeSdp = Object.entries(sdpCountMap).filter(([k]) => k.split("|").length === 3).reduce((s,[,v])=>s+v,0) / 2;
  // actually the countMap double-counts (once per row + once for branch). Let me just use sdpClusters count as proxy.
  const uniqueSdpCount = sdpClusters.length;

  // ── Export CSV ────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const headers = ["No","Role","Branch","Area","SDP Type","Cluster","SDP Aktif","Kode Otoritas","Label","Status","Pemegang","Email","Tgl Buat","Tgl Daftar"];
    const csvRows = filtered.map((r, i) => {
      const cls = getClusters(r).join("; ") || "-";
      const sdp = sdpCount(r);
      return [
        i+1,
        r.role === "bsm" ? "BSM" : "CSE/RGE",
        r.branch,
        r.area ?? "-",
        r.bu_type,
        cls,
        sdp,
        r.authority_code,
        r.label ?? "-",
        r.is_registered ? "Terdaftar" : "Menunggu",
        r.user_name ?? "-",
        r.user_email ?? "-",
        fmtDate(r.created_at),
        fmtDate(r.registered_at),
      ];
    });
    const csv = [headers, ...csvRows]
      .map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(","))
      .join("\n");
    const bom  = "﻿"; // BOM for Excel UTF-8
    const blob = new Blob([bom + csv], { type:"text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `kode_otoritas_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // ── Print ─────────────────────────────────────────────────────────────────
  const handlePrint = () => window.print();

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily:FF, color:t.hi }}>

      {/* Print styles */}
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @media print {
          body * { visibility: hidden !important; }
          #sdp-mapping-print, #sdp-mapping-print * { visibility: visible !important; }
          #sdp-mapping-print { position: fixed; top: 0; left: 0; width: 100%; }
          .no-print-btn { display: none !important; }
          .print-only { display: block !important; }
        }
        .print-only { display: none; }
      `}</style>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontSize:17, fontWeight:800, letterSpacing:-.3, color:t.hi }}>Kode Otoritas</div>
          <div style={{ fontSize:12.5, color:t.mid, marginTop:2 }}>Mapping BSM & CSE/RGE — bagikan kode untuk pendaftaran akun</div>
        </div>
        <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
          <button onClick={fetchAll} disabled={loading} title="Refresh" style={{ width:32, height:32, borderRadius:8, cursor:"pointer", background:t.sub, border:`1px solid ${t.line}`, display:"flex", alignItems:"center", justifyContent:"center", color:t.mid }}>
            <RefreshCw size={13} style={{ animation:loading?"spin 1s linear infinite":"none" }}/>
          </button>
          <button onClick={exportCSV} title="Export Excel / CSV" style={{ height:32, padding:"0 12px", borderRadius:8, cursor:"pointer", background:t.sub, border:`1px solid ${t.line}`, color:t.mid, fontFamily:FF, fontSize:12, fontWeight:600, display:"flex", alignItems:"center", gap:5 }}>
            <Download size={13}/> Excel
          </button>
          <button onClick={handlePrint} title="Print / Simpan sebagai gambar" style={{ height:32, padding:"0 12px", borderRadius:8, cursor:"pointer", background:t.sub, border:`1px solid ${t.line}`, color:t.mid, fontFamily:FF, fontSize:12, fontWeight:600, display:"flex", alignItems:"center", gap:5 }}>
            <Printer size={13}/> Print
          </button>
          <button onClick={() => setShowForm(true)} style={{ height:32, padding:"0 14px", borderRadius:8, cursor:"pointer", background:"linear-gradient(135deg,#32BCAD,#1A9E90)", border:"none", color:"#fff", fontFamily:FF, fontSize:12.5, fontWeight:700, display:"flex", alignItems:"center", gap:5, boxShadow:"0 3px 10px rgba(50,188,173,.3)" }}>
            <Plus size={13}/> Buat Kode
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))", gap:8, marginBottom:16 }}>
        {[
          { l:"Total Kode",    v:total,         c:t.tealD, bg:t.tealBg, bd:t.tealBd },
          { l:"Terdaftar",     v:regCt,         c:t.G,     bg:t.GL,     bd:t.GB     },
          { l:"Menunggu",      v:pendCt,        c:t.A,     bg:t.AL,     bd:t.AB     },
          { l:"SDP Aktif",     v:uniqueSdpCount, c:t.mid,  bg:t.sub,    bd:t.line   },
        ].map((s,i)=>(
          <div key={i} style={{ padding:"10px 12px", borderRadius:10, background:t.card, border:`1px solid ${s.bd}`, boxShadow:t.sm }}>
            <div style={{ fontSize:20, fontWeight:800, color:s.c, letterSpacing:-.5 }}>{s.v}</div>
            <div style={{ fontSize:10.5, color:t.mid, fontWeight:600, marginTop:2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Error */}
      {err && (
        <div style={{ padding:"9px 12px", borderRadius:9, marginBottom:12, background:t.RL, border:`1px solid ${t.RB}`, fontSize:12.5, color:t.R, display:"flex", gap:7, alignItems:"center" }}>
          <AlertTriangle size={13}/> {err}
        </div>
      )}

      {/* Filters */}
      <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap", alignItems:"center" }}>
        {/* Search */}
        <div style={{ flex:"1 1 160px", display:"flex", alignItems:"center", gap:6, background:t.sub, border:`1px solid ${t.line}`, borderRadius:8, padding:"0 10px", height:32 }}>
          <Search size={12} color={t.lo}/>
          <input placeholder="Cari kode, nama, cluster…" value={search} onChange={e=>setSearch(e.target.value)}
            style={{ border:"none", background:"none", outline:"none", flex:1, fontSize:12.5, color:t.hi, fontFamily:FF }}/>
          {search && <button onClick={()=>setSearch("")} style={{ border:"none", background:"none", cursor:"pointer", color:t.lo, padding:2 }}><X size={10}/></button>}
        </div>

        {/* Pill filters */}
        {[
          { opts:[["ALL","Semua"],["bsm","BSM"],["cse_rge","CSE/RGE"]], val:fRole, set:setFRole },
          { opts:[["ALL","Semua Status"],["pending","⏳ Menunggu"],["registered","✓ Terdaftar"]], val:fStatus, set:setFStatus },
        ].map((g,gi)=>(
          <div key={gi} style={{ display:"flex", gap:4 }}>
            {g.opts.map(([v,l])=>(
              <button key={v} onClick={()=>g.set(v)} style={{ height:30, padding:"0 10px", borderRadius:8, cursor:"pointer", fontFamily:FF, fontSize:11.5, fontWeight:600, background:g.val===v?t.tealBg:t.sub, color:g.val===v?t.tealD:t.mid, border:`1px solid ${g.val===v?t.tealBd:t.line}`, whiteSpace:"nowrap" }}>{l}</button>
            ))}
          </div>
        ))}

        {/* Dropdowns */}
        {[
          { val:fBuType, set:setFBuType, opts:[["ALL","Semua Type"],...BU_TYPES.map(b=>[b,b])] },
          { val:fBranch, set:setFBranch, opts:[["ALL","Semua Branch"],...allBranches.map(b=>[b,b])] },
        ].map((s,i)=>(
          <select key={i} value={s.val} onChange={e=>s.set(e.target.value)} style={{ height:30, padding:"0 8px", borderRadius:8, fontFamily:FF, fontSize:11.5, color:t.hi, background:t.sub, border:`1px solid ${t.line}`, outline:"none", cursor:"pointer" }}>
            {s.opts.map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
        ))}
      </div>

      {/* Table wrapper */}
      <div id="sdp-mapping-print" ref={printRef} style={{ borderRadius:12, border:`1px solid ${t.line}`, overflow:"hidden", boxShadow:t.sm }}>

        {/* Print header (hidden on screen) */}
        <div className="print-only" style={{ padding:"16px 20px", borderBottom:`1px solid ${t.line}`, background:t.sub }}>
          <div style={{ fontSize:16, fontWeight:800 }}>Daftar Kode Otoritas SDP</div>
          <div style={{ fontSize:12, color:t.mid, marginTop:2 }}>Dicetak: {new Date().toLocaleDateString("id-ID",{day:"2-digit",month:"long",year:"numeric"})}</div>
        </div>

        {/* Table header */}
        <div style={{ display:"grid", gridTemplateColumns:"70px minmax(150px,1fr) 95px 55px 120px 115px 75px", background:t.sub, borderBottom:`1px solid ${t.line}`, padding:"8px 14px", gap:8 }}>
          {["Role","Branch / Cluster","SDP Type","SDP","Kode Otoritas","Status","Tgl Buat"].map((h,i)=>(
            <div key={i} style={{ fontSize:10, fontWeight:800, color:t.lo, letterSpacing:.7, textTransform:"uppercase" }}>{h}</div>
          ))}
        </div>

        {/* Loading */}
        {loading && rows.length===0 ? (
          <div style={{ padding:"40px", textAlign:"center", color:t.mid }}>
            <Loader2 size={20} color={t.teal} style={{ animation:"spin 1s linear infinite", marginBottom:10 }}/>
            <div style={{ fontSize:13 }}>Memuat…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:"32px", textAlign:"center", color:t.lo, fontSize:13 }}>
            {rows.length===0 ? "Belum ada kode. Klik \"Buat Kode\" untuk mulai." : "Tidak ada hasil yang cocok."}
          </div>
        ) : (
          <>
            {filtered.map((row, idx) => {
              const cls    = getClusters(row);
              const sdp    = sdpCount(row);
              const isReg  = row.is_registered;
              const isBSMRow = row.role === "bsm";
              const isIM3  = row.bu_type === "MITRA IM3";
              const isLast = idx === filtered.length - 1;

              return (
                <div key={row.id} style={{
                  display:"grid",
                  gridTemplateColumns:"70px minmax(150px,1fr) 95px 55px 120px 115px 75px",
                  gap:8,
                  padding:"10px 14px",
                  alignItems:"center",
                  borderBottom: isLast ? "none" : `1px solid ${t.line}`,
                  background: !isReg
                    ? (d ? "rgba(255,214,10,.025)" : "rgba(217,119,6,.02)")
                    : "transparent",
                }}>

                  {/* Role */}
                  <div>
                    <span style={{ fontSize:10, fontWeight:800, letterSpacing:.4, padding:"2px 7px", borderRadius:5, color:isBSMRow?t.tealD:t.blue, background:isBSMRow?t.tealBg:t.blueBg, border:`1px solid ${isBSMRow?t.tealBd:t.blueBd}`, whiteSpace:"nowrap" }}>
                      {isBSMRow ? "BSM" : "CSE/RGE"}
                    </span>
                  </div>

                  {/* Branch + clusters + label */}
                  <div>
                    <div style={{ fontSize:12.5, fontWeight:700, color:t.hi, marginBottom:2 }}>{row.branch}</div>
                    {cls.length > 0 && (
                      <div style={{ display:"flex", flexWrap:"wrap", gap:3, marginBottom:2 }}>
                        {cls.map(cl=>(
                          <span key={cl} style={{ fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:10, background:isIM3?t.tealBg:t.blueBg, color:isIM3?t.tealD:t.blue, border:`1px solid ${isIM3?t.tealBd:t.blueBd}` }}>{cl}</span>
                        ))}
                      </div>
                    )}
                    {row.label && <div style={{ fontSize:10.5, color:t.lo }}>{row.label}</div>}
                  </div>

                  {/* SDP Type */}
                  <div>
                    <span style={{ fontSize:10.5, fontWeight:700, padding:"2px 7px", borderRadius:6, color:isIM3?t.tealD:t.blue, background:isIM3?t.tealBg:t.blueBg, border:`1px solid ${isIM3?t.tealBd:t.blueBd}`, whiteSpace:"nowrap" }}>
                      {isIM3 ? "MITRA IM3" : "3KIOSK"}
                    </span>
                  </div>

                  {/* SDP count */}
                  <div style={{ fontSize:13, fontWeight:800, color: sdp>0?t.hi:t.lo, textAlign:"center" }}>
                    {sdp > 0 ? sdp : <span style={{ fontSize:11, color:t.lo }}>—</span>}
                  </div>

                  {/* Code */}
                  <div><CodeChip code={row.authority_code} t={t}/></div>

                  {/* Status */}
                  <div>
                    {isReg ? (
                      <div>
                        <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                          <UserCheck size={11} color={t.G}/>
                          <span style={{ fontSize:11.5, fontWeight:700, color:t.G }}>Terdaftar</span>
                        </div>
                        {(row.user_name || row.user_email) && (
                          <div style={{ fontSize:10.5, color:t.mid, marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:110 }}>
                            {row.user_name ?? row.user_email}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                        <Clock size={11} color={t.A}/>
                        <span style={{ fontSize:11.5, fontWeight:600, color:t.A }}>Menunggu</span>
                      </div>
                    )}
                  </div>

                  {/* Date */}
                  <div style={{ fontSize:11, color:t.lo }}>{fmtDate(row.created_at)}</div>

                </div>
              );
            })}

            {/* Footer row */}
            <div style={{ padding:"8px 14px", background:t.sub, borderTop:`1px solid ${t.line}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:11.5, color:t.lo }}>
                {filtered.length} kode ditampilkan · {regCt} terdaftar · {pendCt} menunggu
              </span>
              <span style={{ fontSize:11, color:t.lo }}>
                SDP aktif: {uniqueSdpCount} cluster
              </span>
            </div>
          </>
        )}
      </div>

      {/* Create Modal */}
      {showForm && (
        <CreateModal
          profile={profile}
          supabase={supabase}
          sdpClusters={sdpClusters}
          onCreated={fetchAll}
          onClose={() => setShowForm(false)}
          t={t}
        />
      )}
    </div>
  );
}
