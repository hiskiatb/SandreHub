"use client";
/**
 * SDP_RekapCSE.jsx — v3 (rebuild) → "Data SDP"
 * Tabel semua SDP per periode + filter lengkap + detail/riwayat + Export Excel.
 *
 * Sumber:
 *   sdp_master        (identitas: sdp_name, sdp_type, pt_name, cluster, branch, area, region)
 *   sdp_monthly_data  (isian CSE/BSM + form_status, bsm_status)
 *   sdp_status_log    (riwayat per sdp_id)
 *
 * Props: { supabase, theme = "dark", profile }
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  Download, RefreshCw, Loader2, Search, X, AlertTriangle, CalendarDays,
  ChevronDown, ChevronRight, FileSpreadsheet, History, Inbox, ClipboardList,
} from "lucide-react";

// ─── Theme ──────────────────────────────────────────────────────────────────
const mk = (d) => ({
  card  : d ? "#17171B" : "#FFFFFF", sub: d ? "#1D1D22" : "#F8F9FA",
  line  : d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)", hi: d ? "#F1F1F4" : "#0F1117",
  mid   : d ? "#8A8A9C" : "#6B7280", lo: d ? "#4A4A5E" : "#A0A8B4",
  teal  : "#12998B", tealD: "#0E8276", tealBg: d ? "rgba(18,153,139,.14)" : "rgba(18,153,139,.08)", tealBd: d ? "rgba(18,153,139,.32)" : "rgba(18,153,139,.22)",
  blue  : "#2E6BE6", blueBg: d ? "rgba(46,107,230,.12)" : "rgba(37,99,235,.07)", blueBd: d ? "rgba(46,107,230,.28)" : "rgba(37,99,235,.18)",
  amber : "#CC8500", amberBg: d ? "rgba(204,133,0,.14)" : "rgba(204,133,0,.08)", amberBd: d ? "rgba(204,133,0,.34)" : "rgba(204,133,0,.24)",
  mag   : "#C6168D", magBg: d ? "rgba(198,22,141,.12)" : "rgba(198,22,141,.07)", magBd: d ? "rgba(198,22,141,.3)" : "rgba(198,22,141,.18)",
  red   : d ? "#FF453A" : "#DC2626", redBg: d ? "rgba(255,69,58,.1)" : "rgba(220,38,38,.06)", redBd: d ? "rgba(255,69,58,.25)" : "rgba(220,38,38,.18)",
  G     : "#16A34A", GL: d ? "rgba(48,209,88,.1)" : "rgba(22,163,74,.07)", GB: d ? "rgba(48,209,88,.25)" : "rgba(22,163,74,.2)",
  sm    : d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)", md: d ? "0 10px 30px rgba(0,0,0,.6)" : "0 10px 30px rgba(0,0,0,.12)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
const MONO = `ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace`;

const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const periodLabel = (ym) => { if (!ym) return "—"; const [y, m] = ym.split("-"); return `${MONTHS[parseInt(m,10)-1] ?? m} ${y}`; };
const fmtDate = (iso) => { if (!iso) return "—"; try { return new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return iso; } };
const brandOf = (r) => (String(r.cluster || "").toUpperCase().startsWith("MC") || r.sdp_type === "MITRA IM3") ? "IM3" : "3ID";
const arr = (v) => Array.isArray(v) ? v.join("; ") : (v ?? "");

// Export columns (blueprint 4.3 + identitas)
const EXPORT_COLS = [
  ["ID", r => r.sdp_id], ["BRAND", r => r.brand], ["TYPE", r => r.sdp_type],
  ["NAME", r => r.sdp_name], ["PT NAME", r => r.pt_name],
  ["CLUSTER", r => r.cluster], ["BRANCH", r => r.branch], ["AREA", r => r.area], ["REGION", r => r.region],
  ["SDP LIVE", r => r.sdp_live], ["STATUS USAHA", r => r.status_usaha],
  ["NAMA PERUSAHAAN/OWNER", r => r.nama_owner], ["NIK", r => r.nik],
  ["NO. ACCOUNT OTTOCASH", r => r.no_ottocash], ["ALAMAT", r => r.alamat],
  ["EMAIL OWNER", r => r.email_owner], ["EMAIL PIC", r => arr(r.email_pic_list)],
  ["NO WHATSAPP", r => r.no_whatsapp], ["STATUS TERMINATED", r => r.terminate_status],
  ["FORM STATUS", r => r.form_status], ["BSM STATUS", r => r.bsm_status],
];

// status helpers
const formStatusCfg = (t) => ({
  SELESAI: { label: "Selesai", c: t.teal, bg: t.tealBg, bd: t.tealBd },
  SUBMIT : { label: "Menunggu BSM", c: t.amber, bg: t.amberBg, bd: t.amberBd },
  DRAFT  : { label: "Draft", c: t.blue, bg: t.blueBg, bd: t.blueBd },
  BELUM  : { label: "Belum", c: t.lo, bg: t.sub, bd: t.line },
});

function Badge({ cfg }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 99, fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap", background: cfg.bg, color: cfg.c, border: `1px solid ${cfg.bd}` }}>
      {cfg.label}
    </span>
  );
}

function Sel({ value, onChange, opts, t, minWidth = 140 }) {
  return (
    <div style={{ position: "relative" }}>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ appearance: "none", WebkitAppearance: "none", background: t.sub, border: `1px solid ${t.line}`, borderRadius: 9, padding: "9px 30px 9px 12px", color: t.hi, fontFamily: FF, fontSize: 13, fontWeight: 600, cursor: "pointer", minWidth }}>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={13} color={t.mid} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
    </div>
  );
}

// ─── Detail drawer ──────────────────────────────────────────────────────────
function DetailDrawer({ supabase, row, t, d, onClose }) {
  const [log, setLog] = useState([]);
  const [loadingLog, setLoadingLog] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingLog(true);
      const { data } = await supabase
        .from("sdp_status_log")
        .select("action, changed_by_name, field_changes, note, changed_at")
        .eq("sdp_id", row.sdp_id)
        .order("changed_at", { ascending: false })
        .limit(50);
      if (alive) { setLog(data || []); setLoadingLog(false); }
    })();
    return () => { alive = false; };
  }, [supabase, row.sdp_id]);

  const fields = [
    ["CLUSTER", row.cluster],
    ["BRANCH / AREA / REGION", [row.branch, row.area, row.region].filter(Boolean).join(" · ")],
    ["PT NAME", row.pt_name],
    ["SDP LIVE", row.sdp_live],
    ["STATUS USAHA", row.status_usaha],
    ["NAMA OWNER", row.nama_owner],
    ["NIK", row.nik],
    ["NO. OTTOCASH", row.no_ottocash],
    ["ALAMAT", row.alamat],
    ["EMAIL OWNER", row.email_owner],
    ["EMAIL PIC", arr(row.email_pic_list)],
    ["NO WHATSAPP", row.no_whatsapp],
    ["STATUS TERMINATED", row.terminate_status],
  ];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,.45)", display: "flex", justifyContent: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(460px, 100%)", height: "100%", overflowY: "auto", background: d ? "#121214" : "#FFFFFF", boxShadow: t.md, fontFamily: FF, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: t.hi, letterSpacing: -0.3 }}>{row.sdp_name || row.sdp_id}</div>
            <div style={{ fontSize: 12, color: t.mid, marginTop: 2, fontFamily: MONO }}>{row.sdp_id}</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: t.sub, cursor: "pointer", color: t.mid, padding: 6, borderRadius: 8 }}><X size={16} /></button>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6, background: t.sub, color: t.mid, border: `1px solid ${t.line}` }}>{row.brand} · {row.sdp_type}</span>
          <Badge cfg={(formStatusCfg(t)[row.form_status] || formStatusCfg(t).BELUM)} />
        </div>

        <div style={{ marginBottom: 18 }}>
          {fields.map(([label, value]) => (
            <div key={label} style={{ padding: "8px 0", borderBottom: `1px solid ${t.line}` }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: t.lo, letterSpacing: .4, marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, color: value ? t.hi : t.lo }}>{value || "—"}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
          <History size={14} color={t.mid} /><span style={{ fontSize: 13, fontWeight: 700, color: t.hi }}>Riwayat</span>
        </div>
        {loadingLog ? (
          <div style={{ color: t.mid, fontSize: 12.5 }}>Memuat riwayat…</div>
        ) : log.length === 0 ? (
          <div style={{ color: t.lo, fontSize: 12.5 }}>Belum ada riwayat.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {log.map((l, i) => (
              <div key={i} style={{ padding: "8px 12px", borderRadius: 9, background: t.sub, border: `1px solid ${t.line}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: t.hi }}>{l.action}</span>
                  <span style={{ fontSize: 11, color: t.lo }}>{fmtDate(l.changed_at)}</span>
                </div>
                <div style={{ fontSize: 11.5, color: t.mid, marginTop: 2 }}>{l.changed_by_name || "sistem"}{l.note ? ` — ${l.note}` : ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────
export default function SDP_RekapCSE({ supabase, theme = "dark", profile }) {
  const d = theme === "dark";
  const t = mk(d);

  const [periods, setPeriods] = useState([]);
  const [period, setPeriod]   = useState("");
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState("");
  const [detail, setDetail]   = useState(null);

  const [search, setSearch]   = useState("");
  const [fRegion, setFRegion] = useState("ALL");
  const [fArea, setFArea]     = useState("ALL");
  const [fBranch, setFBranch] = useState("ALL");
  const [fCluster, setFCluster] = useState("ALL");
  const [fBrand, setFBrand]   = useState("ALL");
  const [fStatus, setFStatus] = useState("ALL");

  // ── Load period list ──────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from("sdp_master").select("period").order("period", { ascending: false }).limit(5000);
      const uniq = [...new Set((data || []).map(r => r.period))];
      if (alive) { setPeriods(uniq); if (uniq.length) setPeriod(p => p || uniq[0]); }
    })();
    return () => { alive = false; };
  }, [supabase]);

  // ── Load rows for period (master + monthly) ───────────────────────────────
  const load = useCallback(async (p) => {
    if (!p) { setRows([]); return; }
    setLoading(true); setErr("");
    try {
      const [m, md] = await Promise.all([
        supabase.from("sdp_master").select("sdp_id, sdp_name, sdp_type, pt_name, cluster, branch, area, region").eq("period", p).limit(5000),
        supabase.from("sdp_monthly_data").select("sdp_id, sdp_live, status_usaha, nama_owner, nik, no_ottocash, alamat, email_owner, email_pic_list, no_whatsapp, terminate_status, form_status, bsm_status").eq("period", p).limit(5000),
      ]);
      if (m.error) throw new Error(m.error.message);
      if (md.error) throw new Error(md.error.message);
      const map = new Map((md.data || []).map(r => [r.sdp_id, r]));
      const merged = (m.data || []).map(r => {
        const x = map.get(r.sdp_id) || {};
        return {
          ...r, brand: brandOf(r),
          sdp_live: x.sdp_live ?? "", status_usaha: x.status_usaha ?? "", nama_owner: x.nama_owner ?? "",
          nik: x.nik ?? "", no_ottocash: x.no_ottocash ?? "", alamat: x.alamat ?? "",
          email_owner: x.email_owner ?? "", email_pic_list: x.email_pic_list ?? [], no_whatsapp: x.no_whatsapp ?? "",
          terminate_status: x.terminate_status ?? "", form_status: x.form_status ?? "BELUM", bsm_status: x.bsm_status ?? "",
        };
      });
      merged.sort((a, b) => (a.branch || "").localeCompare(b.branch || "") || (a.cluster || "").localeCompare(b.cluster || "") || (a.sdp_id || "").localeCompare(b.sdp_id || ""));
      setRows(merged);
    } catch (e) { setErr(e.message); setRows([]); }
    finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => { if (period) load(period); }, [period, load]);

  // ── Dependent option lists ────────────────────────────────────────────────
  const regionOpts = useMemo(() => ["ALL", ...[...new Set(rows.map(r => r.region).filter(Boolean))].sort()], [rows]);
  const areaOpts   = useMemo(() => ["ALL", ...[...new Set(rows.filter(r => fRegion === "ALL" || r.region === fRegion).map(r => r.area).filter(Boolean))].sort()], [rows, fRegion]);
  const branchOpts = useMemo(() => ["ALL", ...[...new Set(rows.filter(r => (fRegion === "ALL" || r.region === fRegion) && (fArea === "ALL" || r.area === fArea)).map(r => r.branch).filter(Boolean))].sort()], [rows, fRegion, fArea]);
  const clusterOpts= useMemo(() => ["ALL", ...[...new Set(rows.filter(r => fBranch === "ALL" || r.branch === fBranch).map(r => r.cluster).filter(Boolean))].sort()], [rows, fBranch]);

  const onRegion = (v) => { setFRegion(v); setFArea("ALL"); setFBranch("ALL"); setFCluster("ALL"); };
  const onArea   = (v) => { setFArea(v); setFBranch("ALL"); setFCluster("ALL"); };
  const onBranch = (v) => { setFBranch(v); setFCluster("ALL"); };

  // ── Filtered ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (fRegion !== "ALL" && r.region !== fRegion) return false;
      if (fArea !== "ALL" && r.area !== fArea) return false;
      if (fBranch !== "ALL" && r.branch !== fBranch) return false;
      if (fCluster !== "ALL" && r.cluster !== fCluster) return false;
      if (fBrand !== "ALL" && r.brand !== fBrand) return false;
      if (fStatus !== "ALL" && (r.form_status || "BELUM") !== fStatus) return false;
      if (q) {
        const hay = `${r.sdp_id} ${r.sdp_name} ${r.cluster} ${r.branch} ${r.pt_name} ${r.nama_owner}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, fRegion, fArea, fBranch, fCluster, fBrand, fStatus, search]);

  const kpi = useMemo(() => ({
    total: filtered.length,
    selesai: filtered.filter(r => r.form_status === "SELESAI").length,
    menunggu: filtered.filter(r => r.form_status === "SUBMIT").length,
    belum: filtered.filter(r => !r.form_status || r.form_status === "BELUM").length,
  }), [filtered]);

  // ── Export Excel ──────────────────────────────────────────────────────────
  const exportExcel = () => {
    const aoa = [EXPORT_COLS.map(c => c[0]), ...filtered.map(r => EXPORT_COLS.map(c => c[1](r) ?? ""))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = EXPORT_COLS.map(c => ({ wch: Math.max(10, Math.min(34, c[0].length + 6)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Data SDP ${period}`);
    XLSX.writeFile(wb, `Data_SDP_${period}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const fsCfg = formStatusCfg(t);

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <style>{`@keyframes ds-spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: t.blueBg, border: `1px solid ${t.blueBd}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ClipboardList size={18} color={t.blue} />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.3 }}>Data SDP</div>
            <div style={{ fontSize: 12.5, color: t.mid, marginTop: 1 }}>Semua SDP per periode · isian, status &amp; riwayat</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Sel value={period} onChange={setPeriod} t={t} minWidth={150}
            opts={periods.length ? periods.map(p => ({ value: p, label: periodLabel(p) })) : [{ value: "", label: "— belum ada data —" }]} />
          <button onClick={() => load(period)} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 14px", borderRadius: 9, background: t.sub, border: `1px solid ${t.line}`, color: t.hi, fontFamily: FF, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <RefreshCw size={14} color={t.blue} style={loading ? { animation: "ds-spin 1s linear infinite" } : undefined} /> Muat ulang
          </button>
          <button onClick={exportExcel} disabled={!filtered.length} style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 18px", borderRadius: 9, background: `linear-gradient(135deg, #12998B, #0E8276)`, border: "none", color: "#fff", fontFamily: FF, fontSize: 13, fontWeight: 700, cursor: filtered.length ? "pointer" : "default", opacity: filtered.length ? 1 : 0.55, boxShadow: "0 4px 14px rgba(18,153,139,.3)" }}>
            <Download size={14} /> Export Excel
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="ds-kpi" style={{ display: "grid", gap: 12, marginBottom: 16 }}>
        {[
          { label: "Total SDP", value: kpi.total, color: t.hi },
          { label: "Selesai", value: kpi.selesai, color: t.teal },
          { label: "Menunggu BSM", value: kpi.menunggu, color: t.amber },
          { label: "Belum diisi", value: kpi.belum, color: t.lo },
        ].map((s, i) => (
          <div key={i} style={{ padding: "13px 16px", borderRadius: 12, background: t.card, border: `1px solid ${t.line}`, boxShadow: t.sm }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, letterSpacing: -0.5 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: t.mid, marginTop: 2, fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <div style={{ flex: "1 1 200px", display: "flex", alignItems: "center", gap: 8, background: t.sub, border: `1px solid ${t.line}`, borderRadius: 9, padding: "0 12px", height: 38, minWidth: 180 }}>
          <Search size={14} color={t.lo} />
          <input placeholder="Cari ID, nama, cluster, owner…" value={search} onChange={e => setSearch(e.target.value)} style={{ border: "none", background: "none", outline: "none", flex: 1, fontSize: 13, color: t.hi, fontFamily: FF }} />
          {search && <button onClick={() => setSearch("")} style={{ border: "none", background: "none", cursor: "pointer", color: t.lo }}><X size={12} /></button>}
        </div>
        <Sel value={fRegion} onChange={onRegion} t={t} minWidth={140} opts={regionOpts.map(v => ({ value: v, label: v === "ALL" ? "Semua Region" : v }))} />
        <Sel value={fArea}   onChange={onArea}   t={t} minWidth={140} opts={areaOpts.map(v => ({ value: v, label: v === "ALL" ? "Semua Area" : v }))} />
        <Sel value={fBranch} onChange={onBranch} t={t} minWidth={130} opts={branchOpts.map(v => ({ value: v, label: v === "ALL" ? "Semua Branch" : v }))} />
        <Sel value={fCluster} onChange={setFCluster} t={t} minWidth={140} opts={clusterOpts.map(v => ({ value: v, label: v === "ALL" ? "Semua Cluster" : v }))} />
        <Sel value={fBrand}  onChange={setFBrand}  t={t} minWidth={110} opts={[{ value: "ALL", label: "Semua Brand" }, { value: "3ID", label: "3ID" }, { value: "IM3", label: "IM3" }]} />
        <Sel value={fStatus} onChange={setFStatus} t={t} minWidth={130} opts={[{ value: "ALL", label: "Semua Status" }, { value: "BELUM", label: "Belum" }, { value: "DRAFT", label: "Draft" }, { value: "SUBMIT", label: "Menunggu BSM" }, { value: "SELESAI", label: "Selesai" }]} />
      </div>

      {err && (
        <div style={{ padding: 14, borderRadius: 12, background: t.redBg, border: `1px solid ${t.redBd}`, display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
          <AlertTriangle size={16} color={t.red} /><span style={{ fontSize: 13, color: t.red }}>{err}</span>
        </div>
      )}

      {/* Table */}
      <div style={{ borderRadius: 13, border: `1px solid ${t.line}`, overflow: "hidden", background: t.card, boxShadow: t.sm }}>
        <div className="ds-table" style={{ overflowX: "auto", maxHeight: 540, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 920 }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, zIndex: 1 }}>
                {["ID", "BRAND", "NAME", "CLUSTER", "BRANCH", "AREA", "OWNER", "STATUS", ""].map(h => (
                  <th key={h} style={{ padding: "11px 13px", textAlign: "left", fontWeight: 700, fontSize: 10.5, letterSpacing: .4, color: t.mid, borderBottom: `1px solid ${t.line}`, whiteSpace: "nowrap", background: d ? "#1D1D22" : "#F4F6F8" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ padding: 44, textAlign: "center", color: t.mid }}>
                  <Loader2 size={22} style={{ animation: "ds-spin 1s linear infinite" }} /><div style={{ marginTop: 8, fontSize: 13 }}>Memuat data…</div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 44, textAlign: "center", color: t.lo }}>
                  <Inbox size={26} style={{ marginBottom: 8 }} /><div style={{ fontSize: 13 }}>{rows.length ? "Tidak ada hasil yang cocok." : "Belum ada data SDP untuk periode ini."}</div>
                </td></tr>
              ) : filtered.slice(0, 600).map((r, i) => {
                const isIM3 = r.brand === "IM3";
                const cfg = fsCfg[r.form_status] || fsCfg.BELUM;
                return (
                  <tr key={r.sdp_id} onClick={() => setDetail(r)} style={{ background: i % 2 === 0 ? t.card : (d ? "rgba(255,255,255,.02)" : "#FAFBFC"), borderBottom: `1px solid ${t.line}`, cursor: "pointer" }}>
                    <td style={{ padding: "9px 13px", fontFamily: MONO, fontSize: 11.5, color: t.hi, whiteSpace: "nowrap" }}>{r.sdp_id}</td>
                    <td style={{ padding: "9px 13px" }}><span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 700, background: isIM3 ? t.tealBg : t.blueBg, color: isIM3 ? t.tealD : t.blue, border: `1px solid ${isIM3 ? t.tealBd : t.blueBd}` }}>{r.brand}</span></td>
                    <td style={{ padding: "9px 13px", color: t.hi, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sdp_name}</td>
                    <td style={{ padding: "9px 13px", color: t.mid, whiteSpace: "nowrap" }}>{r.cluster}</td>
                    <td style={{ padding: "9px 13px", color: t.mid, whiteSpace: "nowrap" }}>{r.branch || "—"}</td>
                    <td style={{ padding: "9px 13px", color: t.mid, whiteSpace: "nowrap" }}>{r.area || "—"}</td>
                    <td style={{ padding: "9px 13px", color: r.nama_owner ? t.hi : t.lo, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nama_owner || "—"}</td>
                    <td style={{ padding: "9px 13px" }}><Badge cfg={cfg} /></td>
                    <td style={{ padding: "9px 13px", color: t.lo }}><ChevronRight size={15} /></td>
                  </tr>
                );
              })}
              {filtered.length > 600 && <tr><td colSpan={9} style={{ padding: "10px 13px", textAlign: "center", color: t.mid, fontSize: 12 }}>+ {filtered.length - 600} baris lain — gunakan filter / export untuk daftar lengkap</td></tr>}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <div style={{ padding: "9px 14px", borderTop: `1px solid ${t.line}`, fontSize: 12, color: t.mid }}>
            {filtered.length} SDP · periode {periodLabel(period)} · klik baris untuk detail &amp; riwayat
          </div>
        )}
      </div>

      {detail && <DetailDrawer supabase={supabase} row={detail} t={t} d={d} onClose={() => setDetail(null)} />}

      <style>{`
        .ds-kpi { grid-template-columns: repeat(4, 1fr); }
        @media (max-width: 640px) { .ds-kpi { grid-template-columns: repeat(2, 1fr); } }
      `}</style>
    </div>
  );
}
