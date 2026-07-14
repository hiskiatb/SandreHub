"use client";
// ============================================================
// SDP Home CSE (replika home_screen Flutter) — responsif
// Hero progres + status breakdown + Status Kontrak + Akan Berakhir
// + Perlu Tindakan + akses cepat. onNavigate → sub-menu Form SDP.
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown, ChevronRight, CalendarDays, CheckCircle2, Clock, AlertTriangle, XCircle, FileText,
  Store, Ban, Hourglass, Pencil, KeyRound, TrendingUp, FilePlus2, Loader2,
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
function statusOf(m, open) {
  if (open) return "pending"; if (!m) return "belum";
  const fs = m.form_status || "BELUM", bs = m.bsm_status || "PENDING";
  if (bs === "PENDING" && fs === "SUBMIT") return "pending";
  if (bs === "REJECTED") return "rejected";
  if (fs === "SELESAI" && bs === "CONFIRMED") return "selesai";
  if (fs === "BELUM") return "belum";
  return "review";
}

export default function SDP_Home({ supabase, theme = "light", profile, onNavigate }) {
  const d = theme === "dark"; const t = mk(d);
  const role = profile?.role || "";
  const periods = useMemo(() => buildPeriods(), []);
  const [period, setPeriod] = useState(periods[0]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const guard = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("Koneksi timeout. Coba lagi.")), 20000))]);
    try {
      let master = [];
      const base = supabase.from("sdp_master").select("sdp_id,cluster,branch").eq("period", period);
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

      if (!master.length) { setRows([]); setLoading(false); return; }
      const ids = master.map((r) => r.sdp_id);
      const [{ data: mon }, { data: open }] = await guard(Promise.all([
        supabase.from("sdp_monthly_data").select("sdp_id,form_status,bsm_status,terminate_status").eq("period", period).in("sdp_id", ids),
        supabase.from("sdp_edit_requests").select("sdp_id").eq("period", period).eq("status", "PENDING").in("sdp_id", ids),
      ]));
      const monthly = new Map((mon || []).map((r) => [r.sdp_id, r]));
      const openIds = new Set((open || []).map((r) => r.sdp_id));
      setRows(master.map((r) => { const m = monthly.get(r.sdp_id) || null; return { status: statusOf(m, openIds.has(r.sdp_id)), ts: m?.terminate_status || null }; }));
    } catch (e) { setErr(e?.message || String(e)); setRows([]); } finally { setLoading(false); }
  }, [supabase, period, role, profile?.id]);
  useEffect(() => { load(); }, [load]);

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

  return (
    <div style={{ fontFamily: FF, color: t.hi, maxWidth: 720, margin: "0 auto" }}>
      {/* Greeting + role + periode */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, color: t.mid, fontWeight: 500 }}>{greeting()},</div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em" }}>{shortName(profile?.full_name) || "Pengguna"}</div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, padding: "5px 11px", borderRadius: 99, background: `${t.teal}18`, color: t.teal, fontSize: 12, fontWeight: 800 }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: t.teal }} /> {role === "bsm" ? "BSM" : "CSE / RSE"}
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

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: t.mid }}><Loader2 size={22} style={{ animation: "hspin 1s linear infinite" }} /><div style={{ marginTop: 8, fontSize: 13 }}>Memuat…</div><style>{`@keyframes hspin{to{transform:rotate(360deg)}}`}</style></div>
      ) : err ? (
        <div style={{ padding: "36px 22px", textAlign: "center", background: t.card, borderRadius: 16, border: `1px solid ${t.line}`, boxShadow: t.sm }}>
          <AlertTriangle size={26} color={t.brand} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: t.hi }}>Gagal memuat data</div>
          <div style={{ fontSize: 12.5, color: t.mid, marginTop: 4, wordBreak: "break-word" }}>{err}</div>
          <button onClick={load} style={{ marginTop: 14, padding: "9px 18px", borderRadius: 11, border: "none", background: t.brand, color: "#fff", fontFamily: FF, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Coba lagi</button>
        </div>
      ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Hero progres (tappable → Data SDP) */}
        <button onClick={() => nav("field")} style={{ textAlign: "left", cursor: "pointer", border: "none", position: "relative", overflow: "hidden", borderRadius: 22, padding: "22px 22px", background: "linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)", color: "#fff", boxShadow: t.md, fontFamily: FF }}>
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
            <button onClick={() => nav("field")} style={{ width: "100%", display: "flex", alignItems: "center", gap: 13, padding: "14px 16px", borderRadius: 16, border: `1px solid ${t.brand}33`, background: `${t.brand}0D`, cursor: "pointer", fontFamily: FF }}>
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
          <StatusRow t={t} icon={<CheckCircle2 size={17} />} tone={t.green} title="Selesai" value={agg.selesai} onClick={() => nav("field")} />
          <StatusRow t={t} icon={<Clock size={17} />} tone={t.amber} title="Menunggu BSM" value={agg.pending} onClick={() => nav("field")} />
          <StatusRow t={t} icon={<AlertTriangle size={17} />} tone={t.blue} title="Perlu ditinjau" value={agg.review} onClick={() => nav("field")} />
          <StatusRow t={t} icon={<XCircle size={17} />} tone={t.brand} title="Ditolak" value={agg.rejected} onClick={() => nav("field")} />
          <StatusRow t={t} icon={<FileText size={17} />} tone={t.lo} title="Belum lengkap" value={agg.belum} onClick={() => nav("field")} />
        </div>

        {/* Akses cepat */}
        <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>Akses cepat</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 11 }}>
          <QuickItem t={t} icon={<Store size={20} />} tint={t.blue} label="Data SDP" sub="Daftar & isi data" onClick={() => nav("field")} />
          <QuickItem t={t} icon={<TrendingUp size={20} />} tint={t.gold} label="Laporan" sub="Progres pengisian" onClick={() => nav("report")} />
          <QuickItem t={t} icon={<KeyRound size={20} />} tint={t.mag} label="Kode Otoritas" sub="Klaim cluster" onClick={() => nav("mycodes")} />
          <QuickItem t={t} icon={<FilePlus2 size={20} />} tint={t.brand} label="Registrasi" sub="Reg / Terminasi" onClick={() => nav("submission_forms")} />
        </div>
      </div>
      )}
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
