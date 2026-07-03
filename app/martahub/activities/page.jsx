"use client";
import { useState, useEffect, useCallback } from "react";
import MartaShell, { T, FONT } from "../components/MartaShell";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";

const CAT_LABEL = {
  directSelling: "Direct Selling", jointEvent: "Join Event", openBooth: "Open Booth",
  project: "Project", sponsorship: "Sponsorship", thematic: "Thematic",
};
const STATUS = {
  draft: ["Draft", T.mid, "#eef1f6"], submitted: ["Planned", T.blue, T.blueBg],
  approved: ["Disetujui", T.success, T.successBg], rejected: ["Ditolak", T.error, T.errorBg],
  completed: ["Selesai", T.success, T.successBg], inProgress: ["Berlangsung", T.warning, T.warningBg],
};

const fmtDate = (s) => {
  if (!s || s.length < 10) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  const mo = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"][(+m || 1) - 1];
  return `${d} ${mo} ${y}`;
};

export default function ActivityPlanPage() {
  return (
    <MartaShell active="activities" title="Activity Plan" subtitle="Rencana kegiatan yang dibuat BME/RGE di lapangan.">
      {() => <Body />}
    </MartaShell>
  );
}

function Body() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const { data, error } = await supabaseMarta
        .from("mh_activities")
        .select("id, event_name, brand, mc, branch_id, event_categories, plan_date_start, plan_date, site_id, network_category, area_potential, status, checkin_valid, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      setRows(data || []);
    } catch (e) { setErr(e.message || "Gagal memuat"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const term = q.trim().toLowerCase();
  const view = rows.filter((r) => !term ||
    (r.event_name || "").toLowerCase().includes(term) ||
    (r.mc || "").toLowerCase().includes(term) ||
    (r.site_id || "").toLowerCase().includes(term));

  const cats = (r) => {
    const arr = Array.isArray(r.event_categories) ? r.event_categories : [];
    if (!arr.length) return "—";
    return arr.map((c) => CAT_LABEL[c] || c).join(", ");
  };

  return (
    <div>
      {!MARTA_CONFIGURED && (
        <div style={{ ...card, borderColor: T.warning, background: T.warningBg, color: "#7a5b00", marginBottom: 16 }}>
          Supabase MartaHub belum dikonfigurasi / project paused — data tampil kosong.
        </div>
      )}
      {err && <div style={{ ...card, borderColor: T.error, background: T.errorBg, color: T.error, marginBottom: 16 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari event / MC / site…"
          style={{ ...inp, maxWidth: 320 }} />
        <div style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12.5, color: T.mid }}>{view.length} plan</div>
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
            <thead><tr style={{ background: "#F7F9FC", color: T.mid, textAlign: "left" }}>
              {["Event", "Brand", "MC", "Site", "Kategori", "Tanggal", "Network", "Status", "Check-in"].map((h) => <th key={h} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={9} style={{ padding: 26, textAlign: "center", color: T.lo }}>Memuat…</td></tr>}
              {!loading && view.length === 0 && <tr><td colSpan={9} style={{ padding: 26, textAlign: "center", color: T.lo }}>Belum ada activity plan.</td></tr>}
              {!loading && view.map((r) => {
                const st = STATUS[r.status] || [r.status, T.mid, "#eef1f6"];
                return (
                  <tr key={r.id} style={{ borderTop: `1px solid ${T.line}` }}>
                    <td style={{ padding: "10px 14px", fontWeight: 700 }}>{r.event_name || "—"}</td>
                    <td style={{ padding: "10px 14px" }}>{r.brand ? <span style={{ fontSize: 10.5, fontWeight: 800, color: r.brand === "tri" ? T.tri : T.im3 }}>{r.brand === "tri" ? "3ID" : "IM3"}</span> : "—"}</td>
                    <td style={{ padding: "10px 14px", color: T.mid }}>{r.mc || "—"}</td>
                    <td style={{ padding: "10px 14px", color: T.mid }}>{r.site_id || "—"}</td>
                    <td style={{ padding: "10px 14px", color: T.mid }}>{cats(r)}</td>
                    <td style={{ padding: "10px 14px", color: T.mid }}>{fmtDate(r.plan_date_start || r.plan_date)}</td>
                    <td style={{ padding: "10px 14px", color: T.mid }}>{r.network_category || "—"}</td>
                    <td style={{ padding: "10px 14px" }}><span style={{ fontSize: 10.5, fontWeight: 800, color: st[1], background: st[2], padding: "2px 8px", borderRadius: 999 }}>{st[0]}</span></td>
                    <td style={{ padding: "10px 14px" }}>{r.checkin_valid == null ? "—" : r.checkin_valid ? <span style={{ color: T.success, fontWeight: 700 }}>Valid</span> : <span style={{ color: T.error, fontWeight: 700 }}>Invalid</span>}</td>
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

const card = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, fontSize: 13 };
const inp = { width: "100%", padding: "9px 12px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" };
