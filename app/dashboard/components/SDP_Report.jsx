"use client";
// ============================================================
// SDP Laporan (migrasi mobile SandraHub → web) — Stage 3
// Ringkasan progres pengisian per periode (mirror reportProvider).
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, RefreshCw, CheckCircle2, Clock, AlertTriangle, TrendingUp, Loader2, PieChart } from "lucide-react";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const mk = (d) => ({
  card: d ? "#161618" : "#FFFFFF", sub: d ? "#1C1C20" : "#F3F4F6", line: d ? "#2A2A2F" : "#E9EAEE",
  hi: d ? "#F1F1F4" : "#17181C", mid: d ? "#8A8A96" : "#61616C", lo: d ? "#5A5A68" : "#A2A2AD",
  brand: "#ED1C24", green: d ? "#30D158" : "#1A9E5A", amber: d ? "#FFB020" : "#B7791F", blue: d ? "#0A84FF" : "#2563EB",
  sm: d ? "0 1px 3px rgba(0,0,0,.5)" : "0 1px 3px rgba(23,24,28,.06)",
  md: d ? "0 8px 24px rgba(0,0,0,.5)" : "0 1px 3px rgba(23,24,28,.06), 0 10px 26px rgba(23,24,28,.05)",
});
const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const pad2 = (n) => String(n).padStart(2, "0");
const periodLabel = (p) => { if (!p) return "—"; const [y, m] = p.split("-"); return `${MONTHS[(+m || 1) - 1]} ${y}`; };
function buildPeriods() {
  const now = new Date(); const out = []; let y = 2026, m = 6;
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) { out.push(`${y}-${pad2(m)}`); m++; if (m > 12) { m = 1; y++; } }
  return out.reverse();
}
const brandOfCluster = (c) => String(c || "").startsWith("CS") ? "3ID" : "IM3";
function statusOf(m, open) {
  if (open) return "pending";
  if (!m) return "belum";
  const fs = m.form_status || "BELUM", bs = m.bsm_status || "PENDING";
  if (bs === "PENDING" && fs === "SUBMIT") return "pending";
  if (bs === "REJECTED") return "rejected";
  if (fs === "SELESAI" && bs === "CONFIRMED") return "selesai";
  if (fs === "BELUM") return "belum";
  return "review";
}

export default function SDP_Report({ supabase, theme = "light", profile }) {
  const d = theme === "dark"; const t = mk(d);
  const role = profile?.role || "";
  const periods = useMemo(() => buildPeriods(), []);
  const [period, setPeriod] = useState(periods[0]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let master = [];
      const base = supabase.from("sdp_master").select("*").eq("period", period);
      if (role === "cse_rse") {
        const { data: codes } = await supabase.from("sales_access_codes").select("scope_value").eq("user_id", profile.id).eq("role", "cse_rse").eq("is_registered", true).eq("is_active", true);
        const clusters = [...new Set((codes || []).map((c) => c.scope_value).filter(Boolean))];
        if (clusters.length) { const { data } = await base.in("cluster", clusters); master = data || []; }
      } else if (role === "bsm") {
        const { data: codes } = await supabase.from("sales_access_codes").select("scope_value, brand").eq("user_id", profile.id).eq("role", "bsm").eq("is_registered", true).eq("is_active", true);
        const pairs = new Set((codes || []).map((c) => `${c.scope_value}|${c.brand}`));
        const branches = [...new Set((codes || []).map((c) => c.scope_value).filter(Boolean))];
        if (branches.length) { const { data } = await base.in("branch", branches); master = (data || []).filter((r) => pairs.has(`${r.branch}|${brandOfCluster(r.cluster)}`)); }
      } else { const { data } = await base; master = data || []; }

      if (!master.length) { setRows([]); setLoading(false); return; }
      const ids = master.map((r) => r.sdp_id);
      const [{ data: mon }, { data: open }] = await Promise.all([
        supabase.from("sdp_monthly_data").select("sdp_id,form_status,bsm_status").eq("period", period).in("sdp_id", ids),
        supabase.from("sdp_edit_requests").select("sdp_id").eq("period", period).eq("status", "PENDING").in("sdp_id", ids),
      ]);
      const monthly = new Map((mon || []).map((r) => [r.sdp_id, r]));
      const openIds = new Set((open || []).map((r) => r.sdp_id));
      setRows(master.map((r) => ({ cluster: r.cluster || "—", status: statusOf(monthly.get(r.sdp_id) || null, openIds.has(r.sdp_id)) })));
    } catch { setRows([]); } finally { setLoading(false); }
  }, [supabase, period, role, profile?.id]);
  useEffect(() => { load(); }, [load]);

  const rep = useMemo(() => {
    let selesai = 0, menunggu = 0, perluAksi = 0;
    const byC = new Map();
    rows.forEach((e) => {
      const done = e.status === "selesai";
      if (done) selesai++; else if (e.status === "pending") menunggu++; else perluAksi++;
      const c = e.cluster || "—"; const g = byC.get(c) || [0, 0]; g[0]++; if (done) g[1]++; byC.set(c, g);
    });
    const groups = [...byC.entries()].map(([name, v]) => ({ name, total: v[0], selesai: v[1], progress: v[0] ? v[1] / v[0] : 0 }))
      .sort((a, b) => (a.progress - b.progress) || a.name.localeCompare(b.name));
    return { total: rows.length, selesai, menunggu, perluAksi, progress: rows.length ? selesai / rows.length : 0, groups };
  }, [rows]);

  const pct = Math.round(rep.progress * 100);

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Laporan</div>
          <div style={{ fontSize: 12.5, color: t.mid, marginTop: 2 }}>Ringkasan progres pengisian SDP.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ position: "relative" }}>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ appearance: "none", fontFamily: FF, fontSize: 14, fontWeight: 700, color: t.hi, background: t.card, border: `1.5px solid ${t.brand}44`, borderRadius: 11, padding: "10px 34px 10px 14px", cursor: "pointer", boxShadow: t.sm }}>
              {periods.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
            </select>
            <ChevronDown size={15} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: t.mid, pointerEvents: "none" }} />
          </div>
          <button onClick={load} style={{ width: 44, borderRadius: 11, border: `1px solid ${t.line}`, background: t.card, color: t.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><RefreshCw size={16} /></button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: "center", color: t.mid }}><Loader2 size={22} className="sdpspin" /><div style={{ marginTop: 8, fontSize: 13 }}>Memuat laporan…</div><style>{`.sdpspin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style></div>
      ) : rep.total === 0 ? (
        <div style={{ padding: "44px 20px", textAlign: "center", color: t.mid, background: t.card, borderRadius: 16, border: `1px solid ${t.line}` }}>
          <PieChart size={26} style={{ opacity: .5, marginBottom: 8 }} /><div style={{ fontSize: 13.5 }}>Belum ada data pada {periodLabel(period)}.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Progress utama */}
          <div style={{ background: t.card, borderRadius: 18, padding: 20, boxShadow: t.md }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: t.lo }}>Pengisian bulan ini</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginTop: 8 }}>
              <div style={{ fontSize: 46, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.03em", color: pct >= 100 ? t.green : pct >= 50 ? t.amber : t.brand }}>{pct}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: t.mid, marginBottom: 5 }}>%</div>
              <div style={{ marginLeft: "auto", fontSize: 13.5, fontWeight: 700, color: t.mid, marginBottom: 6 }}>{rep.selesai} / {rep.total} outlet</div>
            </div>
            <div style={{ height: 10, borderRadius: 99, background: t.sub, marginTop: 12, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, borderRadius: 99, background: pct >= 100 ? t.green : pct >= 50 ? t.amber : t.brand, transition: "width .5s" }} />
            </div>
          </div>

          {/* Breakdown status */}
          <div style={{ display: "flex", gap: 10 }}>
            <StatTile t={t} icon={<CheckCircle2 size={16} />} label="Selesai" value={rep.selesai} col={t.green} />
            <StatTile t={t} icon={<Clock size={16} />} label="Menunggu BSM" value={rep.menunggu} col={t.amber} />
            <StatTile t={t} icon={<AlertTriangle size={16} />} label="Perlu Aksi" value={rep.perluAksi} col={t.brand} />
          </div>

          {/* Per cluster */}
          <div style={{ background: t.card, borderRadius: 18, padding: "6px 18px 14px", boxShadow: t.md }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: t.lo, padding: "14px 0 6px" }}><TrendingUp size={13} /> Progres per cluster</div>
            {rep.groups.map((g) => {
              const p = Math.round(g.progress * 100); const col = p >= 100 ? t.green : p >= 50 ? t.amber : t.brand;
              return (
                <div key={g.name} style={{ padding: "10px 0", borderTop: `1px solid ${t.line}22` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: t.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.name}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: t.mid }}>{g.selesai}/{g.total}</span>
                    <span style={{ width: 40, textAlign: "right", fontSize: 12.5, fontWeight: 800, color: col }}>{p}%</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 99, background: t.sub, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, p)}%`, borderRadius: 99, background: col }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatTile({ t, icon, label, value, col }) {
  return (
    <div style={{ flex: 1, background: t.card, borderRadius: 16, padding: "14px 12px", boxShadow: t.sm, border: `1px solid ${t.line}` }}>
      <div style={{ color: col }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", color: t.hi, marginTop: 6 }}>{value}</div>
      <div style={{ fontSize: 11, color: t.mid, fontWeight: 600, marginTop: 1 }}>{label}</div>
    </div>
  );
}
