"use client";
/**
 * SDP_BatchMonitor.jsx — Fase 3
 * Dashboard kelengkapan registrasi SDP untuk PIC Region & SPM Sumatera.
 * - KPI + breakdown per cluster/CSE (berapa masuk, validated, sisa draft).
 * - Daftar submission + filter periode/status.
 * - "Tandai Validated" massal — HANYA untuk SPM Sumatera (sesuai RLS:
 *   UPDATE sdp_registration diizinkan bila submitted_by = auth.uid() ATAU
 *   role = spm_sumatera). PIC Region memantau (read-only) + mengingatkan CSE.
 *
 * Props: { supabase, theme = "dark", profile, onExit }
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Loader2, Check, AlertCircle, Users, CheckCircle2, FileText, Clock, Filter,
} from "lucide-react";
import { fmtSubmissionMonth } from "../../../lib/sdp";

const mk = (d) => ({
  card: d ? "#17171B" : "#FFFFFF", sub: d ? "#1D1D22" : "#F8F9FA", line: d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi: d ? "#F1F1F4" : "#0F1117", mid: d ? "#8A8A9C" : "#6B7280", lo: d ? "#4A4A5E" : "#A0A8B4", inp: d ? "#111114" : "#FFFFFF", head: d ? "#202028" : "#EEF1F5",
  teal: "#32BCAD", tealD: "#1A9E90", tealBg: d ? "rgba(50,188,173,.12)" : "rgba(26,158,144,.08)", tealBd: d ? "rgba(50,188,173,.3)" : "rgba(26,158,144,.2)",
  blue: "#0A84FF", blueBg: d ? "rgba(10,132,255,.1)" : "rgba(37,99,235,.07)",
  amber: "#FFB020", mag: "#C6168D", acc: "#ED1C24", accBg: d ? "rgba(237,28,36,.1)" : "rgba(237,28,36,.07)",
  ok: "#22C55E", okBg: d ? "rgba(34,197,94,.12)" : "rgba(22,163,74,.08)",
  sm: d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
const STATUS_TONE = { validated: "ok", approved: "blue", submitted: "amber", draft: "lo", rejected: "acc" };

export default function SDP_BatchMonitor({ supabase, theme = "dark", profile, onExit }) {
  const d = theme === "dark";
  const t = mk(d);
  const role = profile?.role ?? "";
  const canApprove = role === "spm_sumatera"; // sesuai RLS

  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [period, setPeriod] = useState("all");
  const [sel, setSel] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    setLoading(true); setErr("");
    try {
      let q = supabase.from("sdp_registration")
        .select("id, sdp_id_new, sdp_name, brand, submission_month, status, submitter_cluster, submitter_region, submitted_by_name, branch, region, created_at")
        .order("created_at", { ascending: false }).limit(5000);
      if (role === "pic_region" && profile?.region) q = q.eq("region", profile.region);
      else q = q.eq("circle", "Sumatera");
      const { data, error } = await q;
      if (error) throw error;
      setAll(data || []);
    } catch (e) { setErr(e.message || String(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [supabase, role, profile?.region]);

  const periods = useMemo(() => {
    const s = new Set(); all.forEach((r) => r.submission_month && s.add(r.submission_month));
    return [...s].sort().reverse();
  }, [all]);

  const rows = useMemo(() => all.filter((r) => period === "all" || r.submission_month === period), [all, period]);

  const kpi = useMemo(() => {
    const k = { total: rows.length, validated: 0, submitted: 0, draft: 0 };
    rows.forEach((r) => { const s = r.status || "submitted"; if (k[s] != null) k[s]++; });
    return k;
  }, [rows]);

  // Breakdown per cluster.
  const byCluster = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => {
      const key = r.submitter_cluster || r.branch || "—";
      if (!m.has(key)) m.set(key, { cluster: key, total: 0, validated: 0, submitted: 0, draft: 0, cse: new Set(), last: null });
      const g = m.get(key); g.total++;
      const s = r.status || "submitted"; if (g[s] != null) g[s]++;
      if (r.submitted_by_name) g.cse.add(r.submitted_by_name);
      if (!g.last || String(r.created_at) > String(g.last)) g.last = r.created_at;
    });
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [rows]);

  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // SPM memvalidasi baris yang sudah disetujui BSM (approved). 'submitted' juga
  // disertakan agar tidak ada yang tersangkut bila alur BSM dilewati.
  const selectable = rows.filter((r) => ["approved", "submitted"].includes(r.status || "submitted"));
  const allSelected = selectable.length > 0 && selectable.every((r) => sel.has(r.id));
  const toggleAll = () => setSel(() => allSelected ? new Set() : new Set(selectable.map((r) => r.id)));

  const approve = async () => {
    if (!sel.size) return;
    setBusy(true); setMsg(null);
    try {
      const ids = [...sel];
      const { error } = await supabase.from("sdp_registration").update({ status: "validated" }).in("id", ids);
      if (error) throw error;
      setMsg({ type: "ok", text: `${ids.length} baris ditandai Validated.` });
      setSel(new Set());
      await load();
    } catch (e) { setMsg({ type: "err", text: "Gagal approve: " + (e.message || e) }); }
    finally { setBusy(false); }
  };

  const toneCol = (s) => ({ ok: t.ok, blue: t.blue, amber: t.amber, acc: t.acc }[STATUS_TONE[s] || "blue"] || t.mid);

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <button onClick={onExit} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 14 }}>
        <ArrowLeft size={15} /> Kembali
      </button>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.4 }}>Monitor Kelengkapan SDP</div>
          <div style={{ fontSize: 12.5, color: t.mid, marginTop: 2 }}>
            {role === "pic_region" ? `Region ${profile?.region || "Anda"}` : "Seluruh Sumatera"} · pantau progres pengisian per cluster/CSE.
          </div>
        </div>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: t.mid }}>Periode
          <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ display: "block", marginTop: 4, padding: "8px 10px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.inp, color: t.hi, fontSize: 13, fontFamily: FF, cursor: "pointer", minWidth: 170 }}>
            <option value="all">Semua periode</option>
            {periods.map((p) => <option key={p} value={p}>{fmtSubmissionMonth(p)}</option>)}
          </select>
        </label>
      </div>

      {/* KPI */}
      <div className="sdp-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi t={t} icon={<FileText size={18} />} tint={t.blue} label="Total Masuk" value={kpi.total} />
        <Kpi t={t} icon={<Clock size={18} />} tint={t.amber} label="Submitted" value={kpi.submitted} />
        <Kpi t={t} icon={<CheckCircle2 size={18} />} tint={t.ok} label="Validated" value={kpi.validated} />
        <Kpi t={t} icon={<Users size={18} />} tint={t.mag} label="Cluster Aktif" value={byCluster.length} />
      </div>

      {msg && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 13px", borderRadius: 10, marginBottom: 14, fontSize: 12.5, fontWeight: 600,
          background: msg.type === "ok" ? t.okBg : t.accBg, color: msg.type === "ok" ? t.ok : t.acc, border: `1px solid ${(msg.type === "ok" ? t.ok : t.acc)}44` }}>
          {msg.type === "ok" ? <Check size={14} /> : <AlertCircle size={14} />} {msg.text}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: t.mid, display: "flex", alignItems: "center", gap: 8 }}><Loader2 size={15} className="spin" /> Memuat…</div>
      ) : err ? (
        <div style={{ fontSize: 13, color: t.acc }}>{err}</div>
      ) : (
        <>
          {/* Breakdown per cluster */}
          <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, boxShadow: t.sm, overflow: "hidden", marginBottom: 18 }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.line}`, fontSize: 13.5, fontWeight: 800 }}>Progres per Cluster</div>
            {byCluster.length === 0 ? (
              <div style={{ padding: 28, textAlign: "center", color: t.mid, fontSize: 13 }}>Belum ada submission pada periode ini.</div>
            ) : byCluster.map((g) => {
              const pct = g.total ? Math.round((g.validated / g.total) * 100) : 0;
              return (
                <div key={g.cluster} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderTop: `1px solid ${t.line}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.hi }}>{g.cluster}</div>
                    <div style={{ fontSize: 11.5, color: t.mid }}>{g.cse.size} CSE · {g.validated}/{g.total} validated · {g.submitted} menunggu</div>
                  </div>
                  <div style={{ width: 120, height: 7, borderRadius: 99, background: t.sub, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: t.ok }} />
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: t.ok, width: 40, textAlign: "right" }}>{pct}%</div>
                </div>
              );
            })}
          </div>

          {/* Daftar submission + approve */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}><Filter size={14} /> Submission ({rows.length})</div>
            {canApprove && (
              <button onClick={approve} disabled={busy || !sel.size} data-primary
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 9, border: "none", background: `linear-gradient(135deg, ${t.acc} 0%, ${t.mag} 100%)`, color: "#fff", fontFamily: FF, fontSize: 12.5, fontWeight: 800, cursor: (busy || !sel.size) ? "default" : "pointer", opacity: (busy || !sel.size) ? 0.5 : 1 }}>
                {busy ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />} Tandai Validated ({sel.size})
              </button>
            )}
          </div>
          {!canApprove && <div style={{ fontSize: 11.5, color: t.mid, marginBottom: 10 }}>Approval (tandai Validated) dilakukan oleh SPM Sumatera. Anda dapat memantau & mengingatkan CSE.</div>}

          <div style={{ overflow: "auto", border: `1px solid ${t.line}`, borderRadius: 12, background: t.card, boxShadow: t.sm, maxHeight: "50vh" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 820, fontSize: 12.5 }}>
              <thead>
                <tr>
                  {canApprove && <th style={thS(t, 36)}><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>}
                  {["SDP ID", "Nama SDP", "Cluster", "CSE", "Periode", "Status"].map((h) => <th key={h} style={thS(t)}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 300).map((r) => {
                  const s = r.status || "submitted";
                  const col = toneCol(s);
                  const canPick = canApprove && s === "submitted";
                  return (
                    <tr key={r.id}>
                      {canApprove && <td style={tdS(t)}>{canPick ? <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} /> : null}</td>}
                      <td style={{ ...tdS(t), fontFamily: "monospace", color: t.mid, whiteSpace: "nowrap" }}>{r.sdp_id_new || "—"}</td>
                      <td style={{ ...tdS(t), fontWeight: 700, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sdp_name || "—"}</td>
                      <td style={{ ...tdS(t), color: t.mid, whiteSpace: "nowrap" }}>{r.submitter_cluster || r.branch || "—"}</td>
                      <td style={{ ...tdS(t), color: t.mid, whiteSpace: "nowrap" }}>{r.submitted_by_name || "—"}</td>
                      <td style={{ ...tdS(t), color: t.mid, whiteSpace: "nowrap" }}>{fmtSubmissionMonth(r.submission_month)}</td>
                      <td style={tdS(t)}><span style={{ display: "inline-flex", padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 800, color: col, background: `${col}1A`, border: `1px solid ${col}33` }}>{s}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > 300 && <div style={{ fontSize: 11.5, color: t.mid, marginTop: 8 }}>Menampilkan 300 dari {rows.length}.</div>}
        </>
      )}
      <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function Kpi({ t, icon, tint, label, value }) {
  return (
    <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 14, boxShadow: t.sm }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, background: `${tint}18`, color: tint, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 10, letterSpacing: -0.03, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: t.mid, marginTop: 1 }}>{label}</div>
    </div>
  );
}
const thS = (t, w) => ({ position: "sticky", top: 0, background: t.head, padding: "9px 12px", textAlign: "left", fontSize: 10.5, fontWeight: 800, color: t.mid, whiteSpace: "nowrap", borderBottom: `1px solid ${t.line}`, width: w });
const tdS = (t) => ({ padding: "9px 12px", borderBottom: `1px solid ${t.line}` });
