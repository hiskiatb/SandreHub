"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import MartaShell, { T } from "../components/MartaShell";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";
import { getMartaScope, applyMartaScope } from "../../../lib/martaScope";

const STATUS_LABEL = {
  draft: "Draft", planned: "Planned", checked_in: "Checked In", submitted: "Submitted",
  approved: "Approved", rejected: "Rejected", revisionRequired: "Revision Required",
  inProgress: "In Progress", done: "Done", completed: "Completed", cancelled: "Cancelled",
};
const STATUS_COLOR = {
  draft: [T.mid, "#eef1f6"], planned: [T.blue, T.blueBg], checked_in: [T.blue, T.blueBg],
  submitted: [T.warning, T.warningBg], approved: [T.success, T.successBg], rejected: [T.error, T.errorBg],
  revisionRequired: [T.error, T.errorBg], inProgress: [T.warning, T.warningBg],
  done: [T.success, T.successBg], completed: [T.success, T.successBg], cancelled: [T.mid, "#eef1f6"],
};

const fmtDate = (s) => {
  if (!s || s.length < 10) return "-";
  const [y, m, d] = s.slice(0, 10).split("-");
  const mo = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"][(+m || 1) - 1];
  return `${d} ${mo} ${y}`;
};

export default function MonitoringPage() {
  return (
    <MartaShell active="monitoring" title="Activity Monitoring" subtitle="Pantauan real-time status & geo check-in.">
      {(ctx) => <Body email={ctx?.session?.user?.email} />}
    </MartaShell>
  );
}

function Body({ email }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [scope, setScope] = useState(null);
  const [statusFilter, setStatusFilter] = useState("All");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const sc = email ? await getMartaScope(email) : null;
      setScope(sc);
      let q = supabaseMarta
        .from("mh_activities")
        .select("id, event_name, brand, mc, branch_id, site_id, plan_date, actual_date, status, checkin_valid, geo_compliant, target_sp, actual_sp, created_at, approved_by_name, approved_by_email")
        .order("created_at", { ascending: false })
        .limit(500);
      q = await applyMartaScope(q, sc);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      setRows(data || []);
    } catch (e) { setErr(e.message || "Gagal memuat"); }
    finally { setLoading(false); }
  }, [email]);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const total = rows.length;
    const geoTracked = rows.filter((r) => r.checkin_valid !== null && r.checkin_valid !== undefined || r.geo_compliant !== null && r.geo_compliant !== undefined);
    const geoOk = geoTracked.filter((r) => (r.checkin_valid ?? r.geo_compliant) === true).length;
    const withTarget = rows.filter((r) => r.target_sp);
    const achSum = withTarget.reduce((s, r) => s + (r.actual_sp ?? 0), 0);
    const tgtSum = withTarget.reduce((s, r) => s + (r.target_sp ?? 0), 0);
    return {
      total,
      geoPct: geoTracked.length ? Math.round((geoOk / geoTracked.length) * 100) : 0,
      geoN: geoTracked.length,
      achPct: tgtSum > 0 ? Math.round((achSum / tgtSum) * 100) : 0,
    };
  }, [rows]);

  const statusCounts = useMemo(() => {
    const m = new Map();
    for (const r of rows) m.set(r.status || "draft", (m.get(r.status || "draft") || 0) + 1);
    return m;
  }, [rows]);

  const view = statusFilter === "All" ? rows : rows.filter((r) => (r.status || "draft") === statusFilter);
  const statuses = ["All", ...statusCounts.keys()];

  return (
    <div>
      {!MARTA_CONFIGURED && <div style={{ ...card, borderColor: T.warning, background: T.warningBg, color: "#7a5b00", marginBottom: 16 }}>Supabase MartaHub belum dikonfigurasi / project paused.</div>}
      {err && <div style={{ ...card, borderColor: T.error, background: T.errorBg, color: T.error, marginBottom: 16 }}>{err}</div>}

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 }}>
        <Kpi label="Total Aktivitas" value={String(stats.total)} color={T.blue} />
        <Kpi label="Achievement %" value={`${stats.achPct}%`} color={T.success} />
        <Kpi label="Geo Compliance" value={`${stats.geoPct}%`} sub={`${stats.geoN} tercatat`} color="#0D9488" />
      </div>

      {/* Status filter chips */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        {statuses.map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className="mh-btn"
            style={{ padding: "5px 13px", borderRadius: 100, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
              border: `1.5px solid ${statusFilter === s ? "transparent" : T.line}`,
              background: statusFilter === s ? "linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)" : "#fff",
              color: statusFilter === s ? "#fff" : T.mid }}>
            {s === "All" ? "Semua" : (STATUS_LABEL[s] || s)} <span style={{ opacity: 0.75 }}>· {s === "All" ? stats.total : statusCounts.get(s)}</span>
          </button>
        ))}
        {scope && !scope.unscoped && scope.found && (
          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: T.mid, background: "#F0F4FA", border: `1px solid ${T.line}`, borderRadius: 100, padding: "3px 10px" }}>
            Scope: {scope.region || "-"} · {(scope.brand || "-").toUpperCase()}
          </span>
        )}
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
            <thead><tr style={{ background: "#F7F9FC", color: T.mid, textAlign: "left" }}>
              {["Event", "Brand", "MC", "Site", "Plan", "Aktual", "Status", "Diputuskan Oleh", "Geo"].map((h) => <th key={h} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={9} style={{ padding: 26, textAlign: "center", color: T.lo }}>Memuat…</td></tr>}
              {!loading && view.length === 0 && <tr><td colSpan={9} style={{ padding: 26, textAlign: "center", color: T.lo }}>Belum ada aktivitas.</td></tr>}
              {!loading && view.map((r) => {
                const st = STATUS_COLOR[r.status] || [T.mid, "#eef1f6"];
                return (
                  <tr key={r.id} style={{ borderTop: `1px solid ${T.line}` }}>
                    <td style={{ padding: "10px 14px", fontWeight: 700 }}>{r.event_name || "-"}</td>
                    <td style={{ padding: "10px 14px" }}>{r.brand ? <span style={{ fontSize: 10.5, fontWeight: 800, color: r.brand === "tri" ? T.tri : T.im3 }}>{r.brand === "tri" ? "3ID" : "IM3"}</span> : "-"}</td>
                    <td style={{ padding: "10px 14px", color: T.mid }}>{r.mc || "-"}</td>
                    <td style={{ padding: "10px 14px", color: T.mid }}>{r.site_id || "-"}</td>
                    <td style={{ padding: "10px 14px", color: T.mid }}>{fmtDate(r.plan_date)}</td>
                    <td style={{ padding: "10px 14px", color: T.mid }}>{fmtDate(r.actual_date)}</td>
                    <td style={{ padding: "10px 14px" }}><span style={{ fontSize: 10.5, fontWeight: 800, color: st[0], background: st[1], padding: "2px 8px", borderRadius: 999 }}>{STATUS_LABEL[r.status] || r.status || "Draft"}</span></td>
                    <td style={{ padding: "10px 14px", color: T.mid }}>{r.approved_by_name || r.approved_by_email || "-"}</td>
                    <td style={{ padding: "10px 14px" }}>{fmtBool(r.checkin_valid ?? r.geo_compliant)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function fmtBool(v) {
  if (v === null || v === undefined) return <span style={{ color: T.lo }}>-</span>;
  return v ? <span style={{ color: T.success, fontWeight: 700 }}>✓ Ya</span> : <span style={{ color: T.error, fontWeight: 700 }}>✗ Tidak</span>;
}

function Kpi({ label, value, sub, color }) {
  return (
    <div style={{ ...card, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: color }} />
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", color: T.lo, textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: T.lo, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

const card = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, fontSize: 13 };
