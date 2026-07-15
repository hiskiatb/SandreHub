"use client";
// ============================================================
// SDP Home (replika home_screen Flutter untuk mobile + dashboard
// desktop khusus web). Mobile tetap identik dengan app Flutter.
// Desktop (>=1024px) menampilkan dashboard komprehensif: KPI row,
// tabel SDP Terbaru + pagination, panel Quick Actions & Aktivitas
// Terbaru, siklus SDP, dan pengingat — bukan sekadar mobile yang
// dibesarkan.
// onNavigate → sub-menu Form SDP. Untuk aksi Register/Rebordering/
// Terminate, kirim id majemuk "submission_forms:<jenis>" agar
// SDP_StatusForm bisa langsung membuka form yang dituju.
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown, ChevronRight, ChevronLeft, CalendarDays, CheckCircle2, Clock, AlertTriangle, XCircle, FileText,
  Store, Ban, Hourglass, Pencil, KeyRound, TrendingUp, FilePlus2, FileMinus2, Shuffle, Loader2,
  Users, Info, Activity, Eye,
} from "lucide-react";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const mk = (d) => ({
  card: d ? "#161618" : "#FFFFFF", sub: d ? "#1C1C20" : "#F3F4F6", line: d ? "#2A2A2F" : "#E9EAEE", lineSoft: d ? "#222226" : "#F0F1F4",
  hi: d ? "#F1F1F4" : "#17181C", mid: d ? "#8A8A96" : "#61616C", lo: d ? "#5A5A68" : "#A2A2AD",
  brand: "#ED1C24", mag: "#C6168D", teal: d ? "#32BCAD" : "#1A9E90", green: d ? "#30D158" : "#1A9E5A",
  amber: d ? "#FFB020" : "#B7791F", blue: d ? "#0A84FF" : "#2563EB", gold: "#D4A800",
  sm: d ? "0 1px 3px rgba(0,0,0,.5)" : "0 1px 3px rgba(23,24,28,.06)",
  md: d ? "0 8px 24px rgba(0,0,0,.5)" : "0 1px 3px rgba(23,24,28,.06), 0 10px 26px rgba(23,24,28,.05)",
});
const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const pad2 = (n) => String(n).padStart(2, "0");
const periodLabel = (p) => { if (!p) return "—"; const [y, m] = p.split("-"); return `${MONTHS[(+m || 1) - 1]} ${y}`; };
const nextPeriodLabel = (p) => { const [y, m] = p.split("-").map(Number); let ny = y, nm = m + 1; if (nm > 12) { nm = 1; ny++; } return `${MONTHS[nm - 1]} ${ny}`; };
function buildPeriods() { const now = new Date(); const out = []; let y = 2026, m = 6; while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) { out.push(`${y}-${pad2(m)}`); m++; if (m > 12) { m = 1; y++; } } return out.reverse(); }
const brandOfCluster = (c) => String(c || "").startsWith("CS") ? "3ID" : "IM3";
const greeting = () => { const h = new Date().getHours(); return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 18 ? "Selamat sore" : "Selamat malam"; };
const shortName = (n) => { const p = String(n || "").trim().split(/\s+/).filter(Boolean); const cap = (w) => w[0].toUpperCase() + w.slice(1).toLowerCase(); return p.length ? (p.length === 1 ? cap(p[0]) : `${cap(p[0])} ${cap(p[p.length - 1])}`) : ""; };
const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const roleLabel = (role) => role === "bsm" ? "BSM" : role === "spm_sumatera" ? "SPM Sumatera" : role === "pic_region" ? "PIC Region" : "CSE / RSE";
function statusOf(m, open) {
  if (open) return "pending"; if (!m) return "belum";
  const fs = m.form_status || "BELUM", bs = m.bsm_status || "PENDING";
  if (bs === "PENDING" && fs === "SUBMIT") return "pending";
  if (bs === "REJECTED") return "rejected";
  if (fs === "SELESAI" && bs === "CONFIRMED") return "selesai";
  if (fs === "BELUM") return "belum";
  return "review";
}
const STATUS_META = {
  selesai:  { label: "Selesai",        tone: "green" },
  pending:  { label: "Menunggu BSM",   tone: "amber" },
  rejected: { label: "Ditolak",        tone: "brand" },
  review:   { label: "Perlu Ditinjau", tone: "blue" },
  belum:    { label: "Belum Lengkap",  tone: "lo" },
};

const DESKTOP_BP = 1024;
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => (typeof window !== "undefined" ? window.innerWidth >= DESKTOP_BP : false));
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsDesktop(window.innerWidth >= DESKTOP_BP);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isDesktop;
}

export default function SDP_Home({ supabase, theme = "light", profile, onNavigate, listMenuId = "field", availableIds }) {
  const d = theme === "dark"; const t = mk(d);
  const role = profile?.role || "";
  const isDesktop = useIsDesktop();
  const periods = useMemo(() => buildPeriods(), []);
  const [period, setPeriod] = useState(periods[0]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [activity, setActivity] = useState([]);
  const [monthCounts, setMonthCounts] = useState({ registration: 0, rebordering: 0, termination: 0 });
  const [err, setErr] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const guard = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("Koneksi timeout. Coba lagi.")), 20000))]);
    try {
      let master = [];
      const base = supabase.from("sdp_master").select("sdp_id,cluster,branch,sdp_name,pt_name,sdp_type,area").eq("period", period);
      if (role === "cse_rse") {
        const { data: codes } = await guard(supabase.from("sales_access_codes").select("scope_value").eq("user_id", profile.id).eq("role", "cse_rse").eq("is_registered", true).eq("is_active", true));
        const clusters = [...new Set((codes || []).map((c) => c.scope_value).filter(Boolean))];
        if (clusters.length) { const { data } = await guard(base.in("cluster", clusters)); master = data || []; }
      } else if (role === "bsm") {
        const { data: codes } = await supabase.from("sales_access_codes").select("scope_value, brand").eq("user_id", profile.id).eq("role", "bsm").eq("is_registered", true).eq("is_active", true);
        const pairs = new Set((codes || []).map((c) => `${c.scope_value}|${c.brand}`));
        const branches = [...new Set((codes || []).map((c) => c.scope_value).filter(Boolean))];
        if (branches.length) { const { data } = await base.in("branch", branches); master = (data || []).filter((r) => pairs.has(`${r.branch}|${brandOfCluster(r.cluster)}`)); }
      } else { const { data } = await base; master = data || []; }

      if (!master.length) { setRows([]); setActivity([]); setLoading(false); return; }
      const ids = master.map((r) => r.sdp_id);
      const [{ data: mon }, { data: open }, { data: rm }] = await guard(Promise.all([
        supabase.from("sdp_monthly_data").select("sdp_id,form_status,bsm_status,terminate_status,updated_at").eq("period", period).in("sdp_id", ids),
        supabase.from("sdp_edit_requests").select("sdp_id").eq("period", period).eq("status", "PENDING").in("sdp_id", ids),
        supabase.from("mc_cluster_mapping").select("cluster, region"),
      ]));
      const monthly = new Map((mon || []).map((r) => [r.sdp_id, r]));
      const openIds = new Set((open || []).map((r) => r.sdp_id));
      const regionMap = new Map((rm || []).map((r) => [r.cluster, r.region]));
      setRows(master.map((r) => {
        const m = monthly.get(r.sdp_id) || null;
        return {
          sdp_id: r.sdp_id, name: r.sdp_name || r.sdp_id, ptName: r.pt_name || r.sdp_name || "—",
          cluster: r.cluster || "", branch: r.branch || "", region: r.cluster ? (regionMap.get(r.cluster) || "") : "",
          status: statusOf(m, openIds.has(r.sdp_id)), ts: m?.terminate_status || null, updatedAt: m?.updated_at || null,
        };
      }));

      // Aktivitas terbaru (opsional — jangan sampai gagalkan dashboard bila tabel/kolom beda)
      try {
        const { data: act } = await supabase.from("sdp_status_log").select("*").in("sdp_id", ids).order("created_at", { ascending: false }).limit(6);
        setActivity(act || []);
      } catch { setActivity([]); }

      // Registrasi / Rebordering / Terminasi bulan ini (opsional, scoped by submitter_cluster/branch)
      try {
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const scopeQ = (q) => role === "cse_rse" && profile?.cluster ? q.eq("submitter_cluster", profile.cluster)
          : role === "bsm" && profile?.bsm_branch ? q.eq("submitter_branch", profile.bsm_branch) : q;
        const [reg, reb, term] = await Promise.all([
          scopeQ(supabase.from("sdp_registration").select("id", { count: "exact", head: true }).gte("created_at", startOfMonth)),
          scopeQ(supabase.from("sdp_rebordering").select("id", { count: "exact", head: true }).gte("created_at", startOfMonth)),
          scopeQ(supabase.from("sdp_termination").select("id", { count: "exact", head: true }).gte("created_at", startOfMonth)),
        ]);
        setMonthCounts({ registration: reg.count || 0, rebordering: reb.count || 0, termination: term.count || 0 });
      } catch { setMonthCounts({ registration: 0, rebordering: 0, termination: 0 }); }
    } catch (e) { setErr(e?.message || String(e)); setRows([]); } finally { setLoading(false); }
  }, [supabase, period, role, profile?.id, profile?.cluster, profile?.bsm_branch]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [period, rows.length]);

  const agg = useMemo(() => {
    const c = { total: rows.length, selesai: 0, pending: 0, review: 0, rejected: 0, belum: 0, aktif: 0, akan: 0, terminate: 0 };
    rows.forEach((r) => {
      c[r.status] = (c[r.status] || 0) + 1;
      if (r.ts === "TERMINATED") c.terminate++; else if (r.ts && r.ts.includes("S/D")) c.akan++; else c.aktif++;
    });
    c.progress = c.total ? c.selesai / c.total : 0;
    return c;
  }, [rows]);
  const pct = Math.round(agg.progress * 100);
  const nav = (id) => onNavigate?.(id);

  const sortedRows = useMemo(() => [...rows].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))), [rows]);

  if (loading) {
    return <div style={{ fontFamily: FF, padding: 60, textAlign: "center", color: t.mid }}><Loader2 size={22} style={{ animation: "hspin 1s linear infinite" }} /><div style={{ marginTop: 8, fontSize: 13 }}>Memuat…</div><style>{`@keyframes hspin{to{transform:rotate(360deg)}}`}</style></div>;
  }
  if (err) {
    return (
      <div style={{ fontFamily: FF, padding: "36px 22px", textAlign: "center", background: t.card, borderRadius: 16, border: `1px solid ${t.line}`, boxShadow: t.sm }}>
        <AlertTriangle size={26} color={t.brand} style={{ marginBottom: 8 }} />
        <div style={{ fontSize: 14, fontWeight: 700, color: t.hi }}>Gagal memuat data</div>
        <div style={{ fontSize: 12.5, color: t.mid, marginTop: 4, wordBreak: "break-word" }}>{err}</div>
        <button onClick={load} style={{ marginTop: 14, padding: "9px 18px", borderRadius: 11, border: "none", background: t.brand, color: "#fff", fontFamily: FF, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Coba lagi</button>
      </div>
    );
  }

  if (isDesktop) {
    return (
      <DesktopDashboard
        t={t} role={role} profile={profile} period={period} periods={periods} setPeriod={setPeriod}
        agg={agg} pct={pct} monthCounts={monthCounts} sortedRows={sortedRows} page={page} setPage={setPage}
        nav={nav} activity={activity} listMenuId={listMenuId} availableIds={availableIds} nextPeriodLabel={nextPeriodLabel} period0={period}
      />
    );
  }
  return (
    <MobileHome t={t} role={role} profile={profile} period={period} periods={periods} setPeriod={setPeriod}
      agg={agg} pct={pct} nav={nav} listMenuId={listMenuId} availableIds={availableIds} />
  );
}

// ════════════════════════ MOBILE (replika app) ════════════════════════
function MobileHome({ t, role, profile, period, periods, setPeriod, agg, pct, nav, listMenuId, availableIds }) {
  const has = (id) => !availableIds || availableIds.has(id);
  return (
    <div style={{ fontFamily: FF, color: t.hi, maxWidth: 720, margin: "0 auto" }}>
      {/* Greeting + role + periode */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, color: t.mid, fontWeight: 500 }}>{greeting()},</div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em" }}>{shortName(profile?.full_name) || "Pengguna"}</div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, padding: "5px 11px", borderRadius: 99, background: `${t.teal}18`, color: t.teal, fontSize: 12, fontWeight: 800 }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: t.teal }} /> {roleLabel(role)}
          </span>
        </div>
        <div style={{ position: "relative" }}>
          <CalendarDays size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: t.brand, pointerEvents: "none" }} />
          <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ appearance: "none", fontFamily: FF, fontSize: 14, fontWeight: 700, color: t.hi, background: t.card, border: `1.5px solid ${t.brand}44`, borderRadius: 11, padding: "10px 34px 10px 34px", cursor: "pointer", boxShadow: t.sm }}>
            {periods.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
          </select>
          <ChevronDown size={15} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: t.mid, pointerEvents: "none" }} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Hero progres (tappable → Data SDP) */}
        <button onClick={() => nav(listMenuId)} style={{ textAlign: "left", cursor: "pointer", border: "none", position: "relative", overflow: "hidden", borderRadius: 22, padding: "22px 22px", background: "linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)", color: "#fff", boxShadow: t.md, fontFamily: FF }}>
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 800, letterSpacing: "-0.01em" }}><CalendarDays size={17} /> Progres Pengisian Data SDP</div>
              <ChevronRight size={18} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 16, gap: 12 }}>
              <div>
                <div style={{ fontSize: 12.5, opacity: 0.9 }}>SDP sudah diisi</div>
                <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05 }}>{agg.selesai} <span style={{ fontSize: 15, fontWeight: 700, opacity: 0.9 }}>dari {agg.total} SDP</span></div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12.5, opacity: 0.9 }}>Selesai</div>
                <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05 }}>{pct}%</div>
              </div>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: "rgba(255,255,255,0.25)", marginTop: 14, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, borderRadius: 99, background: "#fff" }} />
            </div>
          </div>
        </button>

        {/* Status Kontrak SDP */}
        <div style={{ background: t.card, borderRadius: 18, padding: 16, boxShadow: t.md }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: t.hi }}>Status Kontrak SDP</div>
          <div style={{ fontSize: 12.5, color: t.mid, marginTop: 2 }}>Jumlah SDP binaan per status</div>
          <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
            <ContractTile t={t} icon={<CheckCircle2 size={20} />} label="SDP Aktif" value={agg.aktif + agg.akan} col={t.teal} />
            <ContractTile t={t} icon={<Ban size={20} />} label="SDP Terminate" value={agg.terminate} col={t.brand} />
          </div>
        </div>

        {/* SDP Akan Berakhir */}
        <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 16px", borderRadius: 16, background: `${t.amber}14`, border: `1px solid ${t.amber}33` }}>
          <span style={{ width: 42, height: 42, borderRadius: 12, background: t.amber, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Hourglass size={20} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: t.hi }}>SDP Akan Berakhir</div>
            <div style={{ fontSize: 12, color: t.mid, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Efektif terminate 01 {nextPeriodLabel(period)}</div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 5, background: t.card, padding: "6px 12px", borderRadius: 11, boxShadow: t.sm }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: t.amber }}>{agg.akan}</span><span style={{ fontSize: 11, fontWeight: 700, color: t.mid }}>SDP</span>
          </div>
        </div>

        {/* Perlu tindakan */}
        {(agg.belum + agg.review + agg.rejected) > 0 && (
          <>
            <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>Perlu tindakan</div>
            <button onClick={() => nav(listMenuId)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 13, padding: "14px 16px", borderRadius: 16, border: `1px solid ${t.brand}33`, background: `${t.brand}0D`, cursor: "pointer", fontFamily: FF }}>
              <span style={{ width: 42, height: 42, borderRadius: 12, background: `${t.brand}18`, color: t.brand, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Pencil size={19} /></span>
              <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: t.hi }}>Lengkapi data outlet</div>
                <div style={{ fontSize: 12, color: t.mid }}>{agg.belum + agg.review + agg.rejected} SDP belum tuntas bulan ini</div>
              </div>
              <ChevronRight size={18} color={t.brand} />
            </button>
          </>
        )}

        {/* Ringkasan status (baris) */}
        <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>Ringkasan status</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <StatusRow t={t} icon={<CheckCircle2 size={17} />} tone={t.green} title="Selesai" value={agg.selesai} onClick={() => nav(listMenuId)} />
          <StatusRow t={t} icon={<Clock size={17} />} tone={t.amber} title="Menunggu BSM" value={agg.pending} onClick={() => nav(listMenuId)} />
          <StatusRow t={t} icon={<AlertTriangle size={17} />} tone={t.blue} title="Perlu ditinjau" value={agg.review} onClick={() => nav(listMenuId)} />
          <StatusRow t={t} icon={<XCircle size={17} />} tone={t.brand} title="Ditolak" value={agg.rejected} onClick={() => nav(listMenuId)} />
          <StatusRow t={t} icon={<FileText size={17} />} tone={t.lo} title="Belum lengkap" value={agg.belum} onClick={() => nav(listMenuId)} />
        </div>

        {/* Akses cepat */}
        <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>Akses cepat</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 11 }}>
          <QuickItem t={t} icon={<Store size={20} />} tint={t.blue} label="Data SDP" sub="Daftar & isi data" onClick={() => nav(listMenuId)} />
          {has("report") && <QuickItem t={t} icon={<TrendingUp size={20} />} tint={t.gold} label="Laporan" sub="Progres pengisian" onClick={() => nav("report")} />}
          {has("mycodes") && <QuickItem t={t} icon={<KeyRound size={20} />} tint={t.mag} label="Kode Otoritas" sub="Klaim cluster" onClick={() => nav("mycodes")} />}
          {has("submission_forms") && <QuickItem t={t} icon={<FilePlus2 size={20} />} tint={t.brand} label="Registrasi" sub="Reg / Terminasi" onClick={() => nav("submission_forms")} />}
        </div>
      </div>
    </div>
  );
}

function StatusRow({ t, icon, tone, title, value, onClick }) {
  return (
    <button onClick={onClick} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, cursor: "pointer", fontFamily: FF, boxShadow: t.sm }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: `${tone}1A`, color: tone, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, textAlign: "left", fontSize: 14, fontWeight: 700, color: t.hi }}>{title}</span>
      <span style={{ fontSize: 16, fontWeight: 800, color: tone }}>{value}</span>
      <ChevronRight size={17} color={t.lo} />
    </button>
  );
}
function ContractTile({ t, icon, label, value, col }) {
  return (
    <div style={{ flex: 1, borderRadius: 14, padding: "14px 14px", background: `${col}12`, border: `1px solid ${col}2A` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ width: 40, height: 40, borderRadius: 11, background: col, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>
        <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", color: col }}>{value}</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: t.hi, marginTop: 10 }}>{label}</div>
    </div>
  );
}
function QuickItem({ t, icon, tint, label, sub, onClick }) {
  return (
    <button onClick={onClick} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 15, borderRadius: 16, border: `1px solid ${t.line}`, background: t.card, cursor: "pointer", textAlign: "left", fontFamily: FF, boxShadow: t.sm }}>
      <span style={{ width: 42, height: 42, borderRadius: 12, background: `${tint}18`, color: tint, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>
      <div>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: t.hi }}>{label}</div>
        <div style={{ fontSize: 12, color: t.mid, marginTop: 1 }}>{sub}</div>
      </div>
    </button>
  );
}

// ════════════════════════ DESKTOP (dashboard komprehensif) ════════════════════════
const PAGE_SIZE = 8;

function DesktopDashboard({ t, role, profile, period, periods, setPeriod, agg, pct, monthCounts, sortedRows, page, setPage, nav, activity, listMenuId, availableIds }) {
  const has = (id) => !availableIds || availableIds.has(id);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pageRows = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const start = sortedRows.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const end = Math.min(page * PAGE_SIZE, sortedRows.length);
  const toneCol = (tone) => ({ green: t.green, amber: t.amber, brand: t.brand, blue: t.blue, lo: t.lo }[tone] || t.mid);

  const kpis = [
    { key: "aktif", icon: <Users size={19} />, label: "Total SDP Aktif", value: agg.aktif + agg.akan, sub: `dari ${agg.total} SDP binaan`, tint: t.blue },
    { key: "reg", icon: <FilePlus2 size={19} />, label: "Registrasi Baru", value: monthCounts.registration, sub: "bulan ini", tint: t.teal },
    { key: "reb", icon: <Shuffle size={19} />, label: "Rebordering", value: monthCounts.rebordering, sub: "bulan ini", tint: t.blue },
    { key: "term", icon: <Ban size={19} />, label: "Terminasi", value: monthCounts.termination, sub: "bulan ini", tint: t.brand },
    { key: "pending", icon: <Hourglass size={19} />, label: "Menunggu Approval", value: agg.pending, sub: "perlu tindak lanjut", tint: t.amber },
  ];

  const quickActions = [
    { need: "submission_forms", id: "submission_forms:registration", icon: FilePlus2, label: "Register SDP", sub: "Ajukan pendaftaran SDP baru", tint: t.teal },
    { need: "submission_forms", id: "submission_forms:rebordering", icon: Shuffle, label: "Rebordering SDP", sub: "Ubah territory / lokasi SDP", tint: t.blue },
    { need: "submission_forms", id: "submission_forms:termination", icon: FileMinus2, label: "Terminate SDP", sub: "Ajukan penghentian SDP", tint: t.brand },
    { need: listMenuId, id: listMenuId, icon: Store, label: "Lihat Semua SDP", sub: "Daftar & kelola data SDP", tint: t.mag },
  ].filter((it) => has(it.need));

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>Dashboard SDP</div>
          <div style={{ fontSize: 13, color: t.mid, marginTop: 3 }}>{greeting()}, {shortName(profile?.full_name) || "Pengguna"} · {roleLabel(role)}</div>
        </div>
        <div style={{ position: "relative" }}>
          <CalendarDays size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: t.brand, pointerEvents: "none" }} />
          <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ appearance: "none", fontFamily: FF, fontSize: 14, fontWeight: 700, color: t.hi, background: t.card, border: `1.5px solid ${t.brand}44`, borderRadius: 11, padding: "10px 34px 10px 34px", cursor: "pointer", boxShadow: t.sm }}>
            {periods.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
          </select>
          <ChevronDown size={15} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: t.mid, pointerEvents: "none" }} />
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 14, marginBottom: 20 }}>
        {kpis.map((k) => (
          <div key={k.key} style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, padding: 16, boxShadow: t.sm }}>
            <span style={{ width: 38, height: 38, borderRadius: 11, background: `${k.tint}18`, color: k.tint, display: "flex", alignItems: "center", justifyContent: "center" }}>{k.icon}</span>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", color: t.hi, marginTop: 12, fontVariantNumeric: "tabular-nums" }}>{k.value}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: t.hi, marginTop: 2 }}>{k.label}</div>
            <div style={{ fontSize: 11, color: t.mid, marginTop: 1 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Main grid: tabel + panel kanan */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 18, alignItems: "start", marginBottom: 20 }}>
        {/* Recent SDP table */}
        <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 18, boxShadow: t.sm, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: `1px solid ${t.line}` }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: t.hi }}>SDP Terbaru</div>
              <div style={{ fontSize: 12, color: t.mid, marginTop: 1 }}>Diurutkan dari yang terakhir diperbarui</div>
            </div>
            {has(listMenuId) && (
              <button onClick={() => nav(listMenuId)} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: `1px solid ${t.line}`, borderRadius: 9, padding: "7px 12px", cursor: "pointer", fontFamily: FF, fontSize: 12.5, fontWeight: 700, color: t.hi }}>
                Lihat Semua <ChevronRight size={13} />
              </button>
            )}
          </div>
          {pageRows.length === 0 ? (
            <div style={{ padding: "44px 20px", textAlign: "center", color: t.mid }}>
              <Store size={24} style={{ opacity: .5, marginBottom: 8 }} />
              <div style={{ fontSize: 13.5 }}>Tidak ada SDP untuk {periodLabel(period)}.</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: t.sub, borderBottom: `1px solid ${t.line}` }}>
                    {["SDP ID", "Nama SDP", "Partner", "Wilayah", "Status", "Diperbarui", ""].map((h) => (
                      <th key={h} style={{ padding: "9px 14px", textAlign: h === "" ? "center" : "left", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: t.mid, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => {
                    const sm = STATUS_META[r.status] || STATUS_META.belum;
                    const col = toneCol(sm.tone);
                    return (
                      <tr key={r.sdp_id} onClick={() => nav(listMenuId)} style={{ borderBottom: `1px solid ${t.lineSoft}`, cursor: has(listMenuId) ? "pointer" : "default" }}>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: t.mid, whiteSpace: "nowrap" }}>{r.sdp_id}</td>
                        <td style={{ padding: "10px 14px", fontWeight: 700, color: t.hi, whiteSpace: "nowrap", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</td>
                        <td style={{ padding: "10px 14px", color: t.mid, whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{r.ptName}</td>
                        <td style={{ padding: "10px 14px", color: t.mid, whiteSpace: "nowrap" }}>{[r.branch, r.region].filter(Boolean).join(" · ") || "—"}</td>
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 800, color: col, background: `${col}1A`, border: `1px solid ${col}33` }}>{sm.label}</span>
                        </td>
                        <td style={{ padding: "10px 14px", color: t.mid, fontSize: 12, whiteSpace: "nowrap" }}>{r.updatedAt ? fmtDateTime(r.updatedAt) : "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}><Eye size={15} color={t.lo} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {sortedRows.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderTop: `1px solid ${t.line}` }}>
              <div style={{ fontSize: 12, color: t.mid }}>Menampilkan {start}–{end} dari {sortedRows.length} SDP</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${t.line}`, background: t.card, color: page <= 1 ? t.lo : t.hi, cursor: page <= 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={15} /></button>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: t.hi }}>{page} / {totalPages}</div>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${t.line}`, background: t.card, color: page >= totalPages ? t.lo : t.hi, cursor: page >= totalPages ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronRight size={15} /></button>
              </div>
            </div>
          )}
        </div>

        {/* Panel kanan */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 18, boxShadow: t.sm, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: t.hi, marginBottom: 12 }}>Quick Actions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {quickActions.map((qa) => {
                const Icon = qa.icon;
                return (
                  <button key={qa.id} onClick={() => nav(qa.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 10px", borderRadius: 12, border: `1px solid ${t.line}`, background: t.sub, cursor: "pointer", fontFamily: FF, textAlign: "left" }}>
                    <span style={{ width: 34, height: 34, borderRadius: 10, background: `${qa.tint}18`, color: qa.tint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={16} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.hi }}>{qa.label}</div>
                      <div style={{ fontSize: 11, color: t.mid, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{qa.sub}</div>
                    </div>
                    <ChevronRight size={15} color={t.lo} />
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 18, boxShadow: t.sm, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: t.hi, marginBottom: 12 }}>Aktivitas Terbaru</div>
            {activity.length === 0 ? (
              <div style={{ fontSize: 12.5, color: t.mid, padding: "8px 0" }}>Belum ada aktivitas tercatat.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {activity.map((a, i) => (
                  <div key={a.id || i} style={{ display: "flex", gap: 10, padding: "9px 0", borderTop: i ? `1px solid ${t.lineSoft}` : "none" }}>
                    <span style={{ width: 26, height: 26, borderRadius: 8, background: `${t.blue}18`, color: t.blue, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}><Activity size={13} /></span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: t.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.action || a.status || a.note || "Perubahan"} · {a.sdp_id}</div>
                      <div style={{ fontSize: 11, color: t.mid, marginTop: 1 }}>{a.actor_name || a.by_name || ""}{(a.actor_name || a.by_name) ? " · " : ""}{fmtDateTime(a.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lifecycle + reminder */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 18 }}>
        <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 18, boxShadow: t.sm, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: t.hi }}>Siklus SDP</div>
          <div style={{ fontSize: 12, color: t.mid, marginTop: 2, marginBottom: 18 }}>Satu SDP, beberapa tahap pengelolaan</div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            {[
              { icon: FilePlus2, label: "Registrasi", desc: "Daftarkan SDP baru", col: t.teal, id: has("submission_forms") ? "submission_forms:registration" : null },
              { icon: CheckCircle2, label: "Aktif", desc: "SDP aktif & operasional", col: t.green, id: has(listMenuId) ? listMenuId : null },
              { icon: Shuffle, label: "Rebordering", desc: "Update territory / lokasi", col: t.blue, id: has("submission_forms") ? "submission_forms:rebordering" : null },
              { icon: Ban, label: "Terminasi", desc: "Akhiri kemitraan SDP", col: t.brand, id: has("submission_forms") ? "submission_forms:termination" : null },
            ].map((s, i, arr) => {
              const Icon = s.icon;
              return (
                <React.Fragment key={s.label}>
                  <button onClick={() => s.id && nav(s.id)} disabled={!s.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "none", border: "none", cursor: s.id ? "pointer" : "default", fontFamily: FF, padding: 0 }}>
                    <span style={{ width: 46, height: 46, borderRadius: 14, background: `${s.col}18`, color: s.col, display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${s.col}33` }}><Icon size={20} /></span>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: t.hi }}>{s.label}</div>
                      <div style={{ fontSize: 10.5, color: t.mid, marginTop: 1, maxWidth: 100 }}>{s.desc}</div>
                    </div>
                  </button>
                  {i < arr.length - 1 && <ChevronRight size={16} color={t.lo} style={{ marginTop: 13, flexShrink: 0 }} />}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div style={{ background: `${t.blue}0D`, border: `1px solid ${t.blue}33`, borderRadius: 18, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Info size={17} color={t.blue} />
            <div style={{ fontSize: 14, fontWeight: 800, color: t.hi }}>Pengingat Penting</div>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5, color: t.mid, lineHeight: 1.5 }}>
            <li>Pastikan data yang diinput sudah benar dan lengkap.</li>
            <li>Untuk Rebordering, pilih SDP existing agar data utama terisi otomatis — tidak perlu input ulang.</li>
            <li>Dokumen KTP/NPWP wajib diunggah dalam format PDF pada Form Registrasi.</li>
            <li>Status akan berubah mengikuti alur review BSM/SPM setiap bulan.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
