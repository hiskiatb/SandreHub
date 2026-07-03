"use client";
import { useState, useEffect, useCallback } from "react";
import MartaShell, { T } from "../components/MartaShell";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";

export default function LeaderboardPage() {
  return (
    <MartaShell active="leaderboard" title="Leaderboard" subtitle="Peringkat performa BME/RGE.">
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
        .from("mh_leaderboard_summary")
        .select("*")
        .order("final_score", { ascending: false })
        .limit(100);
      setRows(data || []);
    } catch (_) { setRows([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const medal = (i) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`);

  return (
    <div>
      {!MARTA_CONFIGURED && <div style={{ ...card, borderColor: T.warning, background: T.warningBg, color: "#7a5b00", marginBottom: 16 }}>Supabase MartaHub belum dikonfigurasi / project paused.</div>}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
            <thead><tr style={{ background: "#F7F9FC", color: T.mid, textAlign: "left" }}>
              {["#", "User", "Branch", "Brand", "Aktivitas", "Achievement", "Produktivitas", "Geo", "Skor"].map((h) => <th key={h} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={9} style={{ padding: 26, textAlign: "center", color: T.lo }}>Memuat…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={9} style={{ padding: 26, textAlign: "center", color: T.lo }}>Belum ada data leaderboard.</td></tr>}
              {!loading && rows.map((r, i) => (
                <tr key={r.id || i} style={{ borderTop: `1px solid ${T.line}` }}>
                  <td style={{ padding: "10px 14px", fontWeight: 800 }}>{medal(i)}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 700 }}>{r.user_name || r.user_id || "—"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{r.branch_id || "—"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{r.brand || "—"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{r.total_activities ?? 0}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{r.achievement_pct != null ? `${Math.round(r.achievement_pct)}%` : "—"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{r.productivity_pct != null ? `${Math.round(r.productivity_pct)}%` : "—"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{r.geo_compliance != null ? `${Math.round(r.geo_compliance)}%` : "—"}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 800 }}>{r.final_score != null ? Math.round(r.final_score) : "—"}</td>
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
