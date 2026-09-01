"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import MartaShell, { T, brandLabel } from "../components/MartaShell";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";
import { getMartaScope, applyMartaScope } from "../../../lib/martaScope";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const CAT_LABEL = { directSelling: "Direct Selling", jointEvent: "Joint Event", openBooth: "Open Booth", project: "Project", sponsorship: "Sponsorship", thematic: "Thematic" };

function sumBy(rows, fn) { return rows.reduce((s, r) => s + (fn(r) || 0), 0); }
function productivityPct(rows) {
  const cost = sumBy(rows, (r) => r.cost_actual ?? r.cost_estimate);
  const rev = sumBy(rows, (r) => r.actual_rev_3m);
  return cost > 0 ? (rev / cost) * 100 : 0;
}
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
function rowCategory(r) {
  const arr = Array.isArray(r.event_categories) ? r.event_categories : null;
  const key = (arr && arr[0]) || r.event_category || "others";
  return { key, label: CAT_LABEL[key] || key };
}
function monthKeyOf(d) { return d ? String(d).slice(0, 7) : null; }
const fmtDate = (s) => {
  if (!s || s.length < 10) return "-";
  const [y, m, d] = s.slice(0, 10).split("-");
  const mo = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"][(+m || 1) - 1];
  return `${d} ${mo} ${y}`;
};

// ── Kolom query DIGABUNG dari dua menu lama (Productivity Analytics +
// Performance Insight, sekarang jadi SATU menu ini) - satu fetch, satu
// dataset dipakai bersama utk trend productivity, ranking cabang, DAN
// catatan insight lapangan. ────────────────────────────────────────────
const COLS = "id,event_name,branch_id,event_category,event_categories,plan_date,cost_estimate,cost_actual,actual_rev_3m,target_sp,actual_sp,checkin_valid,geo_compliant,insight,status";

export default function AnalyticsPage() {
  return (
    <MartaShell active="analytics" title="Analytics" subtitle="Productivity Analytics & Performance Insight - satu menu, dua bagian.">
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
        .select(COLS)
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

  const overall = useMemo(() => productivityPct(rows), [rows]);

  const trend = useMemo(() => {
    const now = new Date();
    const keys = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); }
    return keys.map((k) => ({
      key: k,
      label: `${MONTH_ABBR[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`,
      value: productivityPct(rows.filter((r) => monthKeyOf(r.plan_date) === k)),
    }));
  }, [rows]);
  const trendMax = Math.max(100, ...trend.map((t) => t.value));

  const byBranch = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const key = r.branch_id || "unassigned";
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(r);
    }
    return [...m.entries()]
      .map(([id, list]) => ({ id, name: branchMap.get(id) || "Belum ditetapkan", value: productivityPct(list), n: list.length }))
      .sort((a, b) => b.value - a.value);
  }, [rows, branchMap]);
  const byBranchMax = Math.max(100, ...byBranch.map((b) => b.value));

  const byCategory = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const c = rowCategory(r);
      if (!m.has(c.key)) m.set(c.key, { label: c.label, rows: [] });
      m.get(c.key).rows.push(r);
    }
    return [...m.values()].map((c) => ({ label: c.label, value: productivityPct(c.rows), n: c.rows.length })).sort((a, b) => b.value - a.value);
  }, [rows]);
  const byCategoryMax = Math.max(100, ...byCategory.map((c) => c.value));

  // ── Dari Performance Insight (menu lama) - ranking achievement per cabang
  // + catatan insight lapangan, pakai dataset (rows) yang sama dgn di atas. ──
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

      <SectionHeading label="Productivity Analytics" desc="Rasio revenue terhadap biaya, per cabang & kategori kegiatan." />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ ...card, flex: "0 0 200px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", color: T.lo, textTransform: "uppercase", marginBottom: 8 }}>Productivity % (6 bulan)</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#7C3AED" }}>{Math.round(overall)}%</div>
          <div style={{ fontSize: 10.5, color: T.lo, marginTop: 4 }}>revenue ÷ cost, {rows.length} aktivitas</div>
        </div>
        {scope && !scope.unscoped && scope.found && (
          <span style={{ fontSize: 11, fontWeight: 700, color: T.mid, background: "#F0F4FA", border: `1px solid ${T.line}`, borderRadius: 100, padding: "3px 10px" }}>
            Scope: {scope.region || "-"} · {brandLabel(scope.brand)}
          </span>
        )}
      </div>

      {/* Trend */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Tren Productivity per Bulan</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 120 }}>
          {trend.map((t) => (
            <div key={t.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#7C3AED" }}>{Math.round(t.value)}%</div>
              <div style={{ width: "70%", maxWidth: 34, height: `${Math.max(4, (t.value / trendMax) * 88)}px`, background: "linear-gradient(180deg,#7C3AED,#B794F6)", borderRadius: "6px 6px 2px 2px" }} />
              <div style={{ fontSize: 10, color: T.lo, fontWeight: 600 }}>{t.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* By branch */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Productivity per Cabang</div>
          {byBranch.length === 0 && <div style={{ color: T.lo, fontSize: 12.5, padding: "10px 0" }}>Belum ada data.</div>}
          {byBranch.map((b) => (
            <div key={b.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 12 }}>
                <span style={{ fontWeight: 600, color: T.hi }}>{b.name} <span style={{ color: T.lo, fontWeight: 400 }}>({b.n})</span></span>
                <span style={{ fontWeight: 700, color: "#7C3AED" }}>{Math.round(b.value)}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 99, background: "#F0F4FA", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(100, (b.value / byBranchMax) * 100)}%`, background: "#7C3AED", borderRadius: 99 }} />
              </div>
            </div>
          ))}
        </div>

        {/* By category */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Productivity per Kategori Event</div>
          {byCategory.length === 0 && <div style={{ color: T.lo, fontSize: 12.5, padding: "10px 0" }}>Belum ada data.</div>}
          {byCategory.map((c) => (
            <div key={c.label} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 12 }}>
                <span style={{ fontWeight: 600, color: T.hi }}>{c.label} <span style={{ color: T.lo, fontWeight: 400 }}>({c.n})</span></span>
                <span style={{ fontWeight: 700, color: T.primary }}>{Math.round(c.value)}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 99, background: "#F0F4FA", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(100, (c.value / byCategoryMax) * 100)}%`, background: T.primary, borderRadius: 99 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Dari Performance Insight (menu lama, sekarang bagian dari
          halaman ini): ranking achievement Top/Bottom 5 cabang + catatan
          insight lapangan. ──────────────────────────────────────────── */}
      <SectionHeading label="Performance Insight" desc="Ranking cabang & catatan lapangan terbaru." />

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

function SectionHeading({ label, desc }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 14px" }}>
      <div style={{ width: 4, height: 20, borderRadius: 99, background: "linear-gradient(180deg,#ED1C24,#C6168D)", flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.hi, lineHeight: 1.2 }}>{label}</div>
        <div style={{ fontSize: 11.5, color: T.lo, marginTop: 2 }}>{desc}</div>
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
