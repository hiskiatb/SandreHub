"use client";
import { useState, useEffect, useCallback } from "react";
import MartaShell, { T, brandLabel } from "../components/MartaShell";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";

export default function LeaderboardPage() {
  return (
    <MartaShell active="leaderboard" title="Leaderboard" subtitle="Peringkat performa DMO.">
      {() => <Body />}
    </MartaShell>
  );
}

function Body() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // FITUR (permintaan user - "di tampilan level lebih tinggi misal pada
  // leaderboard kita bisa lihat bahwa si DMO tersebut memiliki orang lain
  // yang juga turut berpartisipasi"): DMP (mh_profile_slots.mc
  // terisi - lihat app/martahub/assignments/page.jsx) tetap dihitung
  // kumulatif ke branch yang sama, jadi di leaderboard ini TIDAK perlu
  // baris/branch terpisah - cukup badge kecil di baris DMO utama branch
  // itu, menandai dia didampingi N DMP (+ daftar MC-nya lewat tooltip).
  const [helpersByBranch, setHelpersByBranch] = useState(new Map()); // branch_id -> [{full_name, mc}]
  const [mainNamesByBranch, setMainNamesByBranch] = useState(new Map()); // branch_id -> Set(full_name lowercase)

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data }, { data: slots }] = await Promise.all([
        supabaseMarta.from("mh_leaderboard_summary").select("*").order("final_score", { ascending: false }).limit(100),
        supabaseMarta.from("mh_profile_slots").select("full_name, branch_id, mc").eq("role", "bme_rge").eq("status", "active"),
      ]);
      setRows(data || []);
      const helpers = new Map();
      const mains = new Map();
      for (const s of slots || []) {
        if (!s.branch_id) continue;
        const key = (s.full_name || "").trim().toLowerCase();
        if (s.mc) {
          if (!helpers.has(s.branch_id)) helpers.set(s.branch_id, []);
          helpers.get(s.branch_id).push({ full_name: s.full_name, mc: s.mc });
        } else if (key) {
          if (!mains.has(s.branch_id)) mains.set(s.branch_id, new Set());
          mains.get(s.branch_id).add(key);
        }
      }
      setHelpersByBranch(helpers);
      setMainNamesByBranch(mains);
    } catch (_) { setRows([]); setHelpersByBranch(new Map()); setMainNamesByBranch(new Map()); }
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
                  <td style={{ padding: "10px 14px", fontWeight: 700 }}>
                    {r.user_name || r.user_id || "-"}
                    {(() => {
                      const isMain = r.branch_id && mainNamesByBranch.get(r.branch_id)?.has((r.user_name || "").trim().toLowerCase());
                      const helpers = isMain ? (helpersByBranch.get(r.branch_id) || []) : [];
                      if (!helpers.length) return null;
                      return (
                        <span title={`DMP: ${helpers.map((h) => `${h.full_name} (${h.mc})`).join(", ")}`}
                          style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 800, padding: "1px 6px", borderRadius: 999, background: "rgba(15,110,86,0.12)", color: "#0F6E56", cursor: "default" }}>
                          +{helpers.length} DMP
                        </span>
                      );
                    })()}
                  </td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{r.branch_name || r.branch_id || "-"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{brandLabel(r.brand)}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{r.total_activities ?? 0}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{r.achievement_pct != null ? `${Math.round(r.achievement_pct)}%` : "-"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{r.productivity_pct != null ? `${Math.round(r.productivity_pct)}%` : "-"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{r.geo_compliance != null ? `${Math.round(r.geo_compliance)}%` : "-"}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 800 }}>{r.final_score != null ? Math.round(r.final_score) : "-"}</td>
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
