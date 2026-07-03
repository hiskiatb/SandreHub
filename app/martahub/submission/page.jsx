"use client";
import { useState, useEffect, useCallback } from "react";
import MartaShell, { T } from "../components/MartaShell";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";

const fmtDate = (s) => {
  if (!s || s.length < 10) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  const mo = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"][(+m || 1) - 1];
  return `${d} ${mo} ${y}`;
};

export default function SubmissionPage() {
  return (
    <MartaShell active="submission" title="Activity Submission" subtitle="Realisasi kegiatan yang sudah dijalankan & di-check-in.">
      {() => <Body />}
    </MartaShell>
  );
}

function Body() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabaseMarta
        .from("mh_activities")
        .select("id, event_name, brand, mc, site_id, plan_date_start, plan_date, actual_date, checkin_valid, status")
        .in("status", ["submitted", "approved", "completed"])
        .order("created_at", { ascending: false })
        .limit(500);
      setRows(data || []);
    } catch (_) { setRows([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {!MARTA_CONFIGURED && <div style={{ ...card, borderColor: T.warning, background: T.warningBg, color: "#7a5b00", marginBottom: 16 }}>Supabase MartaHub belum dikonfigurasi / project paused.</div>}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
            <thead><tr style={{ background: "#F7F9FC", color: T.mid, textAlign: "left" }}>
              {["Event", "Brand", "MC", "Site", "Tgl Rencana", "Tgl Aktual", "Check-in"].map((h) => <th key={h} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7} style={{ padding: 26, textAlign: "center", color: T.lo }}>Memuat…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={7} style={{ padding: 26, textAlign: "center", color: T.lo }}>Belum ada submission.</td></tr>}
              {!loading && rows.map((r) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${T.line}` }}>
                  <td style={{ padding: "10px 14px", fontWeight: 700 }}>{r.event_name || "—"}</td>
                  <td style={{ padding: "10px 14px" }}>{r.brand ? <span style={{ fontSize: 10.5, fontWeight: 800, color: r.brand === "tri" ? T.tri : T.im3 }}>{r.brand === "tri" ? "3ID" : "IM3"}</span> : "—"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{r.mc || "—"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{r.site_id || "—"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{fmtDate(r.plan_date_start || r.plan_date)}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{fmtDate(r.actual_date)}</td>
                  <td style={{ padding: "10px 14px" }}>{r.checkin_valid == null ? "—" : r.checkin_valid ? <span style={{ color: T.success, fontWeight: 700 }}>Valid</span> : <span style={{ color: T.error, fontWeight: 700 }}>Invalid</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const card = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, fontSize: 13 };
