"use client";
// ============================================================
// SDP Field — tampilan "Data SDP" TUNGGAL untuk semua role yang ikut
// alur pengisian & approval (CSE/RSE, BSM, SPM Sumatera, PIC Region).
// List per periode (dengan filter wilayah lengkap + export Excel) →
// Detail lengkap (termasuk peta lat/long) → Isi/Ubah data.
// Yang membedakan antar role HANYA:
//   • cakupan data — cluster (CSE), branch (BSM), atau penuh (SPM/PIC)
//   • wewenang — CSE mengajukan (submit_edit, perlu approval), BSM/SPM/
//     PIC Region bisa langsung mengisi & menyelesaikan (bsm_set) DAN
//     menyetujui/menolak pengajuan CSE (approve_edit / reject_edit)
// Tabel: sdp_master, sdp_monthly_data, sdp_edit_requests,
//        sdp_status_log, sales_access_codes, mc_cluster_mapping.
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  ChevronLeft, ChevronRight, ChevronDown, Search, RefreshCw, Store, MapPin,
  CheckCircle2, Clock, XCircle, AlertTriangle, FileText, Loader2, History, Phone, User, Mail, Pencil,
  Download, X,
} from "lucide-react";
import SDP_Edit from "./SDP_Edit";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const mk = (d) => ({
  bg: d ? "#0D0D0F" : "#F4F5F7", card: d ? "#161618" : "#FFFFFF", sub: d ? "#1C1C20" : "#F3F4F6",
  line: d ? "#2A2A2F" : "#E9EAEE", lineSoft: d ? "#222226" : "#F0F1F4",
  hi: d ? "#F1F1F4" : "#17181C", mid: d ? "#8A8A96" : "#61616C", lo: d ? "#5A5A68" : "#A2A2AD",
  brand: "#ED1C24", green: d ? "#30D158" : "#1A9E5A", amber: d ? "#FFB020" : "#B7791F",
  blue: d ? "#0A84FF" : "#2563EB", mag: "#C6168D",
  sm: d ? "0 1px 3px rgba(0,0,0,.5)" : "0 1px 3px rgba(23,24,28,.06)",
  md: d ? "0 8px 24px rgba(0,0,0,.5)" : "0 1px 3px rgba(23,24,28,.06), 0 10px 26px rgba(23,24,28,.05)",
});

/* ── Period helpers (mulai 2026-06) ─────────────────────────── */
const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const pad2 = (n) => String(n).padStart(2, "0");
const periodLabel = (p) => { if (!p) return "—"; const [y, m] = p.split("-"); return `${MONTHS[(+m || 1) - 1]} ${y}`; };
function buildPeriods() {
  const now = new Date(); const out = []; let y = 2026, m = 6;
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
    out.push(`${y}-${pad2(m)}`); m++; if (m > 12) { m = 1; y++; }
  }
  return out.reverse();
}
const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const brandOfCluster = (c) => String(c || "").startsWith("CS") ? "3ID" : "IM3";

// Role dengan wewenang approval: bisa langsung mengisi & menyelesaikan data
// (bsm_set), serta menyetujui/menolak pengajuan CSE. Ini satu-satunya sumber
// perbedaan "tingkatan" antar role — form & tampilannya tetap sama.
const APPROVAL_ROLES = ["bsm", "spm_sumatera", "pic_region"];

/* ── Status alur (mirror SdpEntry.status) ───────────────────── */
function statusOf(monthly, hasOpenRequest) {
  if (hasOpenRequest) return "pending";
  if (!monthly) return "belum";
  const fs = monthly.form_status || "BELUM", bs = monthly.bsm_status || "PENDING";
  if (bs === "PENDING" && fs === "SUBMIT") return "pending";
  if (bs === "REJECTED") return "rejected";
  if (fs === "SELESAI" && bs === "CONFIRMED") return "selesai";
  if (fs === "BELUM") return "belum";
  return "review";
}
const STATUS = {
  selesai:  { label: "Selesai",        icon: CheckCircle2,  tone: "green" },
  pending:  { label: "Menunggu BSM",   icon: Clock,         tone: "amber" },
  rejected: { label: "Ditolak",        icon: XCircle,       tone: "brand" },
  review:   { label: "Perlu Ditinjau", icon: AlertTriangle, tone: "blue" },
  belum:    { label: "Belum Lengkap",  icon: FileText,      tone: "lo" },
};
const ACTION_LABEL = {
  SUBMIT_EDIT:   "Diajukan — menunggu persetujuan",
  APPROVE_EDIT:  "Disetujui",
  REJECT_EDIT:   "Ditolak",
  CANCEL_EDIT:   "Pengajuan dibatalkan",
  BSM_SET:       "Diisi & diselesaikan",
  CARRY_FORWARD: "Disalin dari periode sebelumnya",
  PERIOD_OPEN:   "Periode baru dibuka",
};

/* ── Select kecil (dipakai filter wilayah) ──────────────────── */
function Sel({ value, onChange, opts, t, minWidth = 130 }) {
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ appearance: "none", WebkitAppearance: "none", fontFamily: FF, fontSize: 12.5, fontWeight: 700, color: t.hi, background: t.sub, border: `1px solid ${t.line}`, borderRadius: 9, padding: "8px 28px 8px 11px", cursor: "pointer", minWidth }}>
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={12} color={t.mid} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
export default function SDP_Field({ supabase, theme = "light", profile, readOnly = false }) {
  const d = theme === "dark";
  const t = mk(d);
  const role = profile?.role || "";
  const canApprove = !readOnly && APPROVAL_ROLES.includes(role);
  const canEditCse = !readOnly && role === "cse_rse";
  const periods = useMemo(() => buildPeriods(), []);
  const [period, setPeriod] = useState(periods[0]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [fRegion, setFRegion] = useState("ALL");
  const [fArea, setFArea] = useState("ALL");
  const [fBranch, setFBranch] = useState("ALL");
  const [fCluster, setFCluster] = useState("ALL");
  const [fBrand, setFBrand] = useState("ALL");
  const [detail, setDetail] = useState(null);   // SDP entry sedang dibuka
  const [editing, setEditing] = useState(null);  // SDP entry sedang diedit

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const guard = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("Koneksi timeout. Coba lagi.")), 20000))]);
    try {
      // 1) region map
      const { data: rm } = await guard(supabase.from("mc_cluster_mapping").select("cluster, region"));
      const regionMap = new Map((rm || []).map((r) => [r.cluster, r.region]));

      // 2) scoped master — inilah satu-satunya tempat "cakupan" per role diatur.
      let master = [];
      const base = supabase.from("sdp_master").select("*").eq("period", period);
      if (role === "cse_rse") {
        const { data: codes } = await supabase.from("sales_access_codes").select("scope_value")
          .eq("user_id", profile.id).eq("role", "cse_rse").eq("is_registered", true).eq("is_active", true);
        const clusters = [...new Set((codes || []).map((c) => c.scope_value).filter(Boolean))];
        if (clusters.length) { const { data } = await base.in("cluster", clusters); master = data || []; }
      } else if (role === "bsm") {
        const { data: codes } = await supabase.from("sales_access_codes").select("scope_value, brand")
          .eq("user_id", profile.id).eq("role", "bsm").eq("is_registered", true).eq("is_active", true);
        const pairs = new Set((codes || []).map((c) => `${c.scope_value}|${c.brand}`));
        const branches = [...new Set((codes || []).map((c) => c.scope_value).filter(Boolean))];
        if (branches.length) {
          const { data } = await base.in("branch", branches);
          master = (data || []).filter((r) => pairs.has(`${r.branch}|${brandOfCluster(r.cluster)}`));
        }
      } else {
        const { data } = await base; master = data || [];   // SPM Sumatera / PIC Region / IOH → penuh
      }

      if (!master.length) { setRows([]); setLoading(false); return; }

      // 3) hydrate: monthly + open requests
      const ids = master.map((r) => r.sdp_id);
      const [{ data: mon }, { data: open }] = await guard(Promise.all([
        supabase.from("sdp_monthly_data").select("*").eq("period", period).in("sdp_id", ids),
        supabase.from("sdp_edit_requests").select("sdp_id").eq("period", period).eq("status", "PENDING").in("sdp_id", ids),
      ]));
      const monthly = new Map((mon || []).map((r) => [r.sdp_id, r]));
      const openIds = new Set((open || []).map((r) => r.sdp_id));

      setRows(master.map((r) => {
        const m = monthly.get(r.sdp_id) || null;
        const region = r.cluster ? (regionMap.get(r.cluster) || "") : "";
        return {
          ...r,
          region,
          brand: brandOfCluster(r.cluster),
          monthly: m, hasOpen: openIds.has(r.sdp_id),
          status: statusOf(m, openIds.has(r.sdp_id)),
          name: r.sdp_name || r.sdp_id,
        };
      }));
    } catch (e) { setErr(e?.message || String(e)); setRows([]); } finally { setLoading(false); }
  }, [supabase, period, role, profile?.id]);
  useEffect(() => { load(); }, [load]);

  // ── Opsi filter wilayah bertingkat (mengikuti data yang sudah ter-scope) ──
  const regionOpts  = useMemo(() => ["ALL", ...[...new Set(rows.map((r) => r.region).filter(Boolean))].sort()], [rows]);
  const areaOpts    = useMemo(() => ["ALL", ...[...new Set(rows.filter((r) => fRegion === "ALL" || r.region === fRegion).map((r) => r.area).filter(Boolean))].sort()], [rows, fRegion]);
  const branchOpts  = useMemo(() => ["ALL", ...[...new Set(rows.filter((r) => (fRegion === "ALL" || r.region === fRegion) && (fArea === "ALL" || r.area === fArea)).map((r) => r.branch).filter(Boolean))].sort()], [rows, fRegion, fArea]);
  const clusterOpts = useMemo(() => ["ALL", ...[...new Set(rows.filter((r) => fBranch === "ALL" || r.branch === fBranch).map((r) => r.cluster).filter(Boolean))].sort()], [rows, fBranch]);
  const onRegion = (v) => { setFRegion(v); setFArea("ALL"); setFBranch("ALL"); setFCluster("ALL"); };
  const onArea   = (v) => { setFArea(v); setFBranch("ALL"); setFCluster("ALL"); };
  const onBranch = (v) => { setFBranch(v); setFCluster("ALL"); };
  const hasGeoFilters = regionOpts.length > 2 || branchOpts.length > 2; // >1 pilihan asli selain ALL

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusF !== "all" && r.status !== statusF) return false;
      if (fRegion !== "ALL" && r.region !== fRegion) return false;
      if (fArea !== "ALL" && r.area !== fArea) return false;
      if (fBranch !== "ALL" && r.branch !== fBranch) return false;
      if (fCluster !== "ALL" && r.cluster !== fCluster) return false;
      if (fBrand !== "ALL" && r.brand !== fBrand) return false;
      if (s && !`${r.sdp_id} ${r.name} ${r.cluster} ${r.branch} ${r.area} ${r.pt_name || ""}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [rows, q, statusF, fRegion, fArea, fBranch, fCluster, fBrand]);

  const counts = useMemo(() => {
    const c = { all: rows.length, selesai: 0, pending: 0, rejected: 0, review: 0, belum: 0 };
    rows.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [rows]);

  const exportExcel = () => {
    const cols = [
      ["ID", (r) => r.sdp_id], ["BRAND", (r) => r.brand], ["TYPE", (r) => r.sdp_type],
      ["NAME", (r) => r.name], ["PT NAME", (r) => r.pt_name],
      ["CLUSTER", (r) => r.cluster], ["BRANCH", (r) => r.branch], ["AREA", (r) => r.area], ["REGION", (r) => r.region],
      ["SDP LIVE", (r) => r.monthly?.sdp_live], ["STATUS USAHA", (r) => r.monthly?.status_usaha],
      ["NAMA OWNER", (r) => r.monthly?.nama_owner], ["NIK", (r) => r.monthly?.nik],
      ["NO OTTOCASH", (r) => r.monthly?.no_ottocash], ["ALAMAT", (r) => r.monthly?.alamat],
      ["LATITUDE", (r) => r.monthly?.latitude], ["LONGITUDE", (r) => r.monthly?.longitude],
      ["EMAIL OWNER", (r) => r.monthly?.email_owner], ["NO WHATSAPP", (r) => r.monthly?.no_whatsapp],
      ["STATUS TERMINATE", (r) => r.monthly?.terminate_status],
      ["FORM STATUS", (r) => r.monthly?.form_status], ["BSM STATUS", (r) => r.monthly?.bsm_status],
    ];
    const aoa = [cols.map((c) => c[0]), ...filtered.map((r) => cols.map((c) => c[1](r) ?? ""))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = cols.map((c) => ({ wch: Math.max(10, Math.min(34, c[0].length + 6)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Data SDP ${period}`);
    XLSX.writeFile(wb, `Data_SDP_${period}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (editing) return <SDP_Edit supabase={supabase} theme={theme} profile={profile} entry={editing}
    finalizeDirect={canApprove}
    onBack={() => setEditing(null)}
    onSaved={() => { setEditing(null); setDetail(null); load(); }} />;

  if (detail) return <SdpDetail t={t} d={d} supabase={supabase} profile={profile} entry={detail} onBack={() => setDetail(null)}
    canEdit={(canEditCse && detail.status !== "pending") || canApprove}
    canApprove={canApprove}
    onEdit={() => setEditing(detail)}
    onChanged={() => { setDetail(null); load(); }} />;

  const toneCol = (tone) => ({ green: t.green, amber: t.amber, brand: t.brand, blue: t.blue, lo: t.lo }[tone] || t.mid);

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <style>{`.sdpin{font-family:${FF};font-size:14px;color:${t.hi};background:${d ? "#131315" : "#fff"};border:1px solid ${t.line};border-radius:11px;padding:10px 12px;outline:none;width:100%}
        .sdpin:focus{border-color:${t.brand}66}.sdpspin{animation:sdpsp 1s linear infinite}@keyframes sdpsp{to{transform:rotate(360deg)}}
        .sdpcard{background:${t.card};border:1px solid ${t.line};border-radius:16px;box-shadow:${t.sm};transition:transform .12s,box-shadow .15s;cursor:pointer}
        .sdpcard:active{transform:scale(.99)}`}</style>

      {/* Header + periode */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Data SDP</div>
          <div style={{ fontSize: 12.5, color: t.mid, marginTop: 2 }}>{readOnly ? "Pantau" : "Kelola"} data SDP per periode{role ? ` · ${role}` : ""}.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}
              style={{ appearance: "none", fontFamily: FF, fontSize: 14, fontWeight: 700, color: t.hi, background: t.card, border: `1.5px solid ${t.brand}44`, borderRadius: 11, padding: "10px 34px 10px 14px", cursor: "pointer", boxShadow: t.sm }}>
              {periods.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
            </select>
            <ChevronDown size={15} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: t.mid, pointerEvents: "none" }} />
          </div>
          {filtered.length > 0 && (
            <button onClick={exportExcel} style={{ display: "flex", alignItems: "center", gap: 7, height: 42, padding: "0 16px", borderRadius: 11, background: t.green, border: "none", color: "#fff", fontFamily: FF, fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: t.sm }}>
              <Download size={14} /> Export
            </button>
          )}
        </div>
      </div>

      {/* Search + refresh */}
      <div style={{ display: "flex", gap: 9, marginBottom: 12 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: t.mid }} />
          <input className="sdpin" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari SDP ID / nama / cluster / branch / PT" style={{ paddingLeft: 34 }} />
        </div>
        <button onClick={load} style={{ width: 44, borderRadius: 11, border: `1px solid ${t.line}`, background: t.card, color: t.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><RefreshCw size={16} /></button>
      </div>

      {/* Filter wilayah (muncul bila cakupan role mencakup >1 wilayah) */}
      {hasGeoFilters && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
          <Sel value={fRegion} onChange={onRegion} t={t} opts={regionOpts.map((v) => ({ value: v, label: v === "ALL" ? "Semua Region" : v }))} />
          <Sel value={fArea} onChange={onArea} t={t} opts={areaOpts.map((v) => ({ value: v, label: v === "ALL" ? "Semua Area" : v }))} />
          <Sel value={fBranch} onChange={onBranch} t={t} opts={branchOpts.map((v) => ({ value: v, label: v === "ALL" ? "Semua Branch" : v }))} />
          <Sel value={fCluster} onChange={setFCluster} t={t} opts={clusterOpts.map((v) => ({ value: v, label: v === "ALL" ? "Semua Cluster" : v }))} />
          <Sel value={fBrand} onChange={setFBrand} t={t} minWidth={110} opts={[{ value: "ALL", label: "Semua Brand" }, { value: "3ID", label: "3ID" }, { value: "IM3", label: "IM3" }]} />
        </div>
      )}

      {/* Filter status */}
      <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 6, marginBottom: 12, WebkitOverflowScrolling: "touch" }}>
        {[["all", "Semua"], ["belum", "Belum"], ["review", "Tinjau"], ["pending", "Pending"], ["rejected", "Ditolak"], ["selesai", "Selesai"]].map(([k, lb]) => {
          const on = statusF === k;
          return (
            <button key={k} onClick={() => setStatusF(k)}
              style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 99, border: `1px solid ${on ? t.brand : t.line}`, background: on ? t.brand : t.card, color: on ? "#fff" : t.mid, fontFamily: FF, fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
              {lb}<span style={{ fontSize: 11, fontWeight: 800, opacity: on ? 0.9 : 0.7 }}>{counts[k] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ padding: 48, textAlign: "center", color: t.mid }}><Loader2 size={22} className="sdpspin" /><div style={{ marginTop: 8, fontSize: 13 }}>Memuat data SDP…</div></div>
      ) : err ? (
        <div style={{ padding: "36px 22px", textAlign: "center", color: t.mid, background: t.card, borderRadius: 16, border: `1px solid ${t.line}` }}>
          <AlertTriangle size={26} color={t.brand} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: t.hi }}>Gagal memuat data</div>
          <div style={{ fontSize: 12.5, marginTop: 4, wordBreak: "break-word" }}>{err}</div>
          <button onClick={load} style={{ marginTop: 14, padding: "9px 18px", borderRadius: 11, border: "none", background: t.brand, color: "#fff", fontFamily: FF, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Coba lagi</button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: "44px 20px", textAlign: "center", color: t.mid, background: t.card, borderRadius: 16, border: `1px solid ${t.line}` }}>
          <Store size={26} style={{ opacity: .5, marginBottom: 8 }} /><div style={{ fontSize: 13.5 }}>{rows.length ? "Tidak ada SDP yang cocok dengan filter." : `Tidak ada SDP untuk ${periodLabel(period)}${role === "cse_rse" ? " — pastikan kode cluster sudah diklaim." : "."}`}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.slice(0, 600).map((r) => {
            const st = STATUS[r.status]; const Ico = st.icon; const col = toneCol(st.tone);
            return (
              <div key={r.sdp_id} className="sdpcard" onClick={() => setDetail(r)} style={{ padding: 15 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em", color: t.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                    <div style={{ fontSize: 12, fontFamily: "monospace", color: t.mid, marginTop: 2 }}>{r.sdp_id}</div>
                  </div>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, padding: "4px 9px", borderRadius: 99, fontSize: 11, fontWeight: 800, color: col, background: `${col}1A`, border: `1px solid ${col}33` }}>
                    <Ico size={12} /> {st.label}
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 10, fontSize: 12, color: t.mid }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Store size={12} /> {r.sdp_type || "—"}</span>
                  {r.cluster && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><MapPin size={12} /> {r.cluster}</span>}
                  {r.branch && <span>· {r.branch}</span>}
                  {r.region && <span>· {r.region}</span>}
                </div>
              </div>
            );
          })}
          {filtered.length > 600 && <div style={{ padding: "10px 4px", textAlign: "center", color: t.mid, fontSize: 12 }}>+ {filtered.length - 600} SDP lain — gunakan filter / export untuk daftar lengkap</div>}
        </div>
      )}
      <div style={{ marginTop: 12, fontSize: 12, color: t.mid }}>{filtered.length} SDP · {periodLabel(period)}</div>
    </div>
  );
}

/* ══════════════════════════ DETAIL ════════════════════════════ */
function DetailRow({ t, icon, label, value }) {
  return (
    <div style={{ display: "flex", gap: 11, padding: "11px 0", borderTop: `1px solid ${t.lineSoft}` }}>
      <span style={{ color: t.lo, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 11.5, color: t.mid, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 14, color: t.hi, fontWeight: 600, marginTop: 2, wordBreak: "break-word" }}>{value || <span style={{ color: t.lo }}>—</span>}</div>
      </div>
    </div>
  );
}

/* ── Panel approval (BSM / SPM Sumatera / PIC Region) ───────────── */
function ApprovalPanel({ t, supabase, profile, entry, onChanged }) {
  const [req, setReq] = useState(undefined); // undefined = memuat, null = tak ada
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setReq(undefined);
    supabase.from("sdp_edit_requests").select("id, cse_note, requested_by_name, requested_by_role, created_at")
      .eq("sdp_id", entry.sdp_id).eq("period", entry.period).eq("status", "PENDING")
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (alive) setReq(data || null); });
    return () => { alive = false; };
  }, [supabase, entry.sdp_id, entry.period]);

  const act = async (kind) => {
    if (!req) return;
    setBusy(true); setErr("");
    try {
      const fn = kind === "approve" ? "sdp_approve_edit" : "sdp_reject_edit";
      const { error } = await supabase.rpc(fn, { p_request_id: req.id, p_note: note.trim() || null });
      if (error) throw error;
      onChanged?.();
    } catch (e) { setErr(`Gagal ${kind === "approve" ? "menyetujui" : "menolak"}: ` + (e?.message || e)); setBusy(false); }
  };

  if (req === undefined) return null;
  if (req === null) return null;

  return (
    <div style={{ background: `${t.amber}12`, border: `1px solid ${t.amber}33`, borderRadius: 18, padding: 18, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Clock size={16} color={t.amber} />
        <div style={{ fontSize: 14, fontWeight: 800, color: t.hi }}>Menunggu Persetujuan Anda</div>
      </div>
      <div style={{ fontSize: 12.5, color: t.mid, marginBottom: 10 }}>
        Diajukan oleh <b style={{ color: t.hi }}>{req.requested_by_name || "—"}</b>{req.requested_by_role ? ` (${req.requested_by_role})` : ""} · {fmtDateTime(req.created_at)}
      </div>
      {req.cse_note && (
        <div style={{ fontSize: 12.5, color: t.hi, background: t.card, borderRadius: 10, padding: "8px 11px", marginBottom: 10 }}>
          <b>Catatan pengaju:</b> {req.cse_note}
        </div>
      )}
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Catatan approval (opsional)"
        style={{ width: "100%", boxSizing: "border-box", fontFamily: FF, fontSize: 13, color: t.hi, background: t.card, border: `1px solid ${t.line}`, borderRadius: 10, padding: "9px 11px", outline: "none", resize: "vertical", marginBottom: 10 }} />
      {err && <div style={{ fontSize: 12, color: t.brand, marginBottom: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 9 }}>
        <button onClick={() => act("reject")} disabled={busy} style={{ flex: 1, height: 42, borderRadius: 11, border: `1px solid ${t.brand}55`, background: "transparent", color: t.brand, fontFamily: FF, fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer" }}>
          {busy ? <Loader2 size={15} className="sdpspin" /> : <X size={15} />} Tolak
        </button>
        <button onClick={() => act("approve")} disabled={busy} style={{ flex: 1, height: 42, borderRadius: 11, border: "none", background: t.green, color: "#fff", fontFamily: FF, fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer", boxShadow: t.sm }}>
          {busy ? <Loader2 size={15} className="sdpspin" /> : <CheckCircle2 size={15} />} Setujui
        </button>
      </div>
    </div>
  );
}

function SdpDetail({ t, d, supabase, profile, entry, onBack, canEdit, canApprove, onEdit, onChanged }) {
  const m = entry.monthly || {};
  const [history, setHistory] = useState(null);
  useEffect(() => {
    let alive = true;
    supabase.from("sdp_status_log").select("*").eq("sdp_id", entry.sdp_id).eq("period", entry.period).order("changed_at", { ascending: false }).limit(30)
      .then(({ data }) => { if (alive) setHistory(data || []); });
    return () => { alive = false; };
  }, [supabase, entry.sdp_id, entry.period]);

  const st = STATUS[entry.status]; const Ico = st.icon;
  const col = ({ green: t.green, amber: t.amber, brand: t.brand, blue: t.blue, lo: t.lo }[st.tone] || t.mid);

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 700, padding: 0 }}>
          <ChevronLeft size={16} /> Kembali ke daftar
        </button>
        {canEdit && (
          <button onClick={onEdit} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 11, border: "none", background: t.brand, color: "#fff", fontFamily: FF, fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: t.sm }}>
            <Pencil size={14} /> Isi / Ubah Data
          </button>
        )}
      </div>

      {/* Header kartu */}
      <div style={{ background: t.card, borderRadius: 18, padding: 18, boxShadow: t.md, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>{entry.name}</div>
            <div style={{ fontSize: 12.5, fontFamily: "monospace", color: t.mid, marginTop: 3 }}>{entry.sdp_id} · {entry.period}</div>
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, padding: "5px 10px", borderRadius: 99, fontSize: 11.5, fontWeight: 800, color: col, background: `${col}1A`, border: `1px solid ${col}33` }}><Ico size={13} /> {st.label}</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 12, fontSize: 12.5, color: t.mid }}>
          <span>{entry.sdp_type}</span>{entry.cluster && <span>· {entry.cluster}</span>}{entry.branch && <span>· {entry.branch}</span>}{entry.area && <span>· {entry.area}</span>}{entry.region && <span>· {entry.region}</span>}
        </div>
        {m.bsm_note && entry.status === "rejected" && (
          <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 11, background: `${t.brand}12`, border: `1px solid ${t.brand}33`, fontSize: 12.5, color: t.hi }}>
            <b style={{ color: t.brand }}>Catatan BSM:</b> {m.bsm_note}
          </div>
        )}
      </div>

      {/* Approval — hanya tampil untuk role BSM/SPM/PIC Region saat status pending */}
      {canApprove && entry.status === "pending" && (
        <ApprovalPanel t={t} supabase={supabase} profile={profile} entry={entry} onChanged={onChanged} />
      )}

      {/* Data bulanan */}
      <div style={{ background: t.card, borderRadius: 18, padding: "6px 18px 14px", boxShadow: t.md, marginBottom: 14 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: t.lo, padding: "14px 0 4px" }}>Data Bulanan</div>
        <DetailRow t={t} icon={<Store size={15} />} label="SDP Live" value={m.sdp_live} />
        <DetailRow t={t} icon={<FileText size={15} />} label="Status Usaha" value={m.status_usaha} />
        <DetailRow t={t} icon={<User size={15} />} label="Nama Owner" value={m.nama_owner} />
        <DetailRow t={t} icon={<FileText size={15} />} label="NIK" value={m.nik} />
        <DetailRow t={t} icon={<Phone size={15} />} label="No. WhatsApp" value={m.no_whatsapp} />
        <DetailRow t={t} icon={<Mail size={15} />} label="Email Owner" value={m.email_owner} />
        <DetailRow t={t} icon={<FileText size={15} />} label="No. Ottocash" value={m.no_ottocash} />
        <DetailRow t={t} icon={<MapPin size={15} />} label="Alamat" value={m.alamat} />
        <DetailRow t={t} icon={<MapPin size={15} />} label="Titik Lokasi" value={m.latitude != null ? `${m.latitude}, ${m.longitude}` : null} />
        <DetailRow t={t} icon={<MapPin size={15} />} label="Alamat Gudang" value={m.alamat_gudang} />
        <DetailRow t={t} icon={<AlertTriangle size={15} />} label="Status Terminate" value={m.terminate_status} />
        {m.latitude != null && (
          <a href={`https://maps.google.com/?q=${m.latitude},${m.longitude}`} target="_blank" rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, color: t.blue, textDecoration: "none", fontSize: 13, fontWeight: 700 }}>
            <MapPin size={14} /> Buka di Google Maps
          </a>
        )}
      </div>

      {/* Riwayat */}
      <div style={{ background: t.card, borderRadius: 18, padding: "6px 18px 14px", boxShadow: t.md }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: t.lo, padding: "14px 0 8px" }}><History size={13} /> Riwayat</div>
        {history === null ? (
          <div style={{ padding: 16, color: t.mid, fontSize: 13 }}>Memuat…</div>
        ) : history.length === 0 ? (
          <div style={{ padding: "8px 0 6px", color: t.lo, fontSize: 13 }}>Belum ada riwayat.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {history.map((h, i) => (
              <div key={h.id || i} style={{ display: "flex", gap: 11, padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${t.lineSoft}` }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: t.brand, flexShrink: 0, marginTop: 6 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.hi }}>{ACTION_LABEL[h.action] || h.action || "Perubahan"}</div>
                  <div style={{ fontSize: 11.5, color: t.mid, marginTop: 2 }}>{h.changed_by_name || "sistem"}{h.changed_by_role ? ` · ${h.changed_by_role}` : ""} · {fmtDateTime(h.changed_at)}</div>
                  {h.note && <div style={{ fontSize: 12.5, color: t.mid, marginTop: 3 }}>{h.note}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
