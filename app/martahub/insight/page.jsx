"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import MartaShell, { T } from "../components/MartaShell";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";
import { getMartaScope, applyMartaScope } from "../../../lib/martaScope";

function sumBy(rows, fn) { return rows.reduce((s, r) => s + (fn(r) || 0), 0); }
function achievementPct(rows) {
  const t = sumBy(rows, (r) => r.target_sp);
  const a = sumBy(rows, (r) => r.actual_sp);
  return t > 0 ? (a / t) * 100 : 0;
}
function geoPct(rows) {
  const tracked = rows.filter((r) => (r.checkin_valid !== null && r.checkin_valid !== undefined) || (r.geo_compliant !== null && r.geo_compliant !== undefined));
  if (!tracked.length) return null;
  const ok = tracked.filter((r) => (r.checkin_valid ?? r.geo_compliant) === true).length;
  return (ok / tracked.length) * 100;
}
const fmtDate = (s) => {
  if (!s || s.length < 10) return "-";
  const [y, m, d] = s.slice(0, 10).split("-");
  const mo = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"][(+m || 1) - 1];
  return `${d} ${mo} ${y}`;
};

export default function InsightPage() {
  return (
    <MartaShell active="insight" title="Performance Insight" subtitle="Ranking cabang & catatan lapangan terbaru.">
      {(ctx) => <Body email={ctx?.session?.user?.email} />}
    </MartaShell>
  );
}

function Body({ email }) {
  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [scope, setScope] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const sc = email ? await getMartaScope(email) : null;
      setScope(sc);

      const { data: bData } = await supabaseMarta.from("mh_branches").select("id, name, region");
      setBranches(bData || []);

      const since = new Date(); since.setMonth(since.getMonth() - 5); since.setDate(1);
      let q = supabaseMarta
        .from("mh_activities")
        .select("id, event_name, branch_id, plan_date, target_sp, actual_sp, checkin_valid, geo_compliant, insight, status")
        .gte("plan_date", since.toISOString().slice(0, 10))
        .order("plan_date", { ascending: false });
      q = await applyMartaScope(q, sc);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      setRows(data || []);
    } catch (e) { setErr(e.message || "Gagal memuat"); }
    finally { setLoading(false); }
  }, [email]);
  useEffect(() => { load(); }, [load]);

  const branchMap = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);

  const ranked = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const key = r.branch_id || "unassigned";
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(r);
    }
    return [...m.entries()]
      .map(([id, list]) => ({ id, name: branchMap.get(id) || "Belum ditetapkan", ach: achievementPct(list), geo: geoPct(list), n: list.length }))
      .filter((b) => b.n > 0)
      .sort((a, b) => b.ach - a.ach);
  }, [rows, branchMap]);

  const top5 = ranked.slice(0, 5);
  const bottom5 = [...ranked].slice(-5).reverse();

  const notes = useMemo(() => rows.filter((r) => r.insight && r.insight.trim()).slice(0, 12), [rows]);

  return (
    <div>
      {!MARTA_CONFIGURED && <div style={{ ...card, borderColor: T.warning, background: T.warningBg, color: "#7a5b00", marginBottom: 16 }}>Supabase MartaHub belum dikonfigurasi / project paused.</div>}
      {err && <div style={{ ...card, borderColor: T.error, background: T.errorBg, color: T.error, marginBottom: 16 }}>{err}</div>}
      {loading && <div style={{ ...card, marginBottom: 16, textAlign: "center", color: T.lo }}>Memuat…</div>}
      {scope && !scope.unscoped && scope.found && (
        <div style={{ display: "inline-block", marginBottom: 14, fontSize: 11, fontWeight: 700, color: T.mid, background: "#F0F4FA", border: `1px solid ${T.line}`, borderRadius: 100, padding: "3px 10px" }}>
          Scope: {scope.region || "-"} · {(scope.brand || "-").toUpperCase()}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <RankCard title="Top 5 Achievement" rows={top5} color={T.success} empty="Belum cukup data." />
        <RankCard title="Perlu Perhatian (Bottom 5)" rows={bottom5} color={T.error} empty="Belum cukup data." />
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, fontWeight: 800, fontSize: 13.5 }}>Catatan / Insight Lapangan Terbaru</div>
        {notes.length === 0 && <div style={{ padding: 22, textAlign: "center", color: T.lo, fontSize: 12.5 }}>Belum ada catatan insight dari lapangan.</div>}
        {notes.map((n) => (
          <div key={n.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 12.5 }}>{n.event_name || "-"}</span>
              <span style={{ fontSize: 11, color: T.lo }}>{fmtDate(n.plan_date)}</span>
            </div>
            <div style={{ fontSize: 12.5, color: T.mid }}>{n.insight}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankCard({ title, rows, color, empty }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{title}</div>
      {rows.length === 0 && <div style={{ color: T.lo, fontSize: 12.5, padding: "8px 0" }}>{empty}</div>}
      {rows.map((b, i) => (
        <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i === 0 ? "none" : `1px solid ${T.line}` }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#F0F4FA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 800, color: T.mid, flexShrink: 0 }}>{i + 1}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: T.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</div>
            <div style={{ fontSize: 10.5, color: T.lo }}>{b.n} aktivitas{b.geo != null ? ` · Geo ${Math.round(b.geo)}%` : ""}</div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color }}>{Math.round(b.ach)}%</div>
        </div>
      ))}
    </div>
  );
}

const card = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, fontSize: 13 };
