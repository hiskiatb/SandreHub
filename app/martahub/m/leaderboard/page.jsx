"use client";
/**
 * /martahub/m/leaderboard - Peringkat BME/RGE (web mobile), padanan
 * `leaderboard_screen.dart` di Flutter. Baca langsung dari view
 * `mh_leaderboard_summary` (skor sudah dihitung server-side dari bobot di
 * mh_settings), difilter ke scope brand/region user seperti Flutter.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trophy, Crown, Medal, TrendingUp, MapPin } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../_shared/MobileShell";
import { fmtInt } from "../_shared/activityUi";

const COLS = "id,user_id,user_name,branch_id,branch_name,region,brand,total_activities,achievement_pct,productivity_pct,geo_compliance,final_score";

export default function LeaderboardPage() {
  const router = useRouter();
  const { loading: sessionLoading, userId, scope } = useMartaSession();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [scopeFilter, setScopeFilter] = useState("branch"); // branch | region | all

  useEffect(() => {
    if (sessionLoading) return;
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabaseMarta.from("mh_leaderboard_summary").select(COLS).order("final_score", { ascending: false }).limit(300);
        if (error) throw error;
        if (alive) setRows(data || []);
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat leaderboard");
      }
    })();
    return () => { alive = false; };
  }, [sessionLoading]);

  const filtered = useMemo(() => {
    let list = rows || [];
    if (scope?.brand) list = list.filter((r) => (r.brand || "").toLowerCase() === scope.brand.toLowerCase());
    if (scopeFilter === "branch" && scope?.branchName) list = list.filter((r) => r.branch_name === scope.branchName);
    else if (scopeFilter === "region" && scope?.region) list = list.filter((r) => r.region === scope.region);
    return list
      .slice()
      .sort((a, b) => (b.final_score || 0) - (a.final_score || 0))
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }, [rows, scope, scopeFilter]);

  const myRow = filtered.find((r) => r.user_id === userId);

  if (sessionLoading || rows === null) {
    return (
      <MobileShell active="leaderboard">
        <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px" }}><BackBar router={router} /></div>
        <ShellSpinner />
      </MobileShell>
    );
  }

  return (
    <MobileShell active="leaderboard">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 0", fontFamily: FF }}>
        <BackBar router={router} />
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <Trophy size={19} color="#ED1C24" />
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Leaderboard</div>
        </div>
        <div style={{ marginTop: 3, fontSize: 12.5, color: "#8A8A96", fontWeight: 500 }}>
          Peringkat berdasar pencapaian, produktivitas &amp; kepatuhan geo
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {[
            { key: "branch", label: scope?.branchName || "Cabang" },
            { key: "region", label: scope?.region || "Region" },
            { key: "all", label: "Semua" },
          ].map((t) => {
            const active = scopeFilter === t.key;
            const disabled = (t.key === "branch" && !scope?.branchName) || (t.key === "region" && !scope?.region);
            return (
              <button key={t.key} disabled={disabled} onClick={() => setScopeFilter(t.key)}
                style={{
                  padding: "8px 13px", borderRadius: 999,
                  background: active ? "#17181C" : "#FFFFFF", border: `1px solid ${active ? "#17181C" : "#E9EAEE"}`,
                  color: disabled ? "#C4C4CE" : active ? "#FFFFFF" : "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: disabled ? "default" : "pointer",
                }}>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {myRow && (
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{ borderRadius: 18, background: BRAND, padding: "16px 18px", color: "#fff", boxShadow: "0 6px 16px rgba(17,17,20,0.1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.85, textTransform: "uppercase", letterSpacing: 0.3 }}>Peringkat Anda</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 3 }}>#{myRow.rank}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.85, textTransform: "uppercase", letterSpacing: 0.3 }}>Skor</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 3 }}>{fmtInt(Math.round(myRow.final_score || 0))}</div>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "16px 20px 40px" }}>
        {err && <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", background: "#FFFFFF", border: "1px dashed #D8D9E0", borderRadius: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#3A3A44" }}>Belum ada data</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#8A8A96" }}>Leaderboard akan muncul setelah ada aktivitas tervalidasi.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((r) => <LeaderRow key={r.id} r={r} isMe={r.user_id === userId} />)}
          </div>
        )}
      </div>
    </MobileShell>
  );
}

function BackBar({ router }) {
  return (
    <button onClick={() => router.push("/martahub/m")}
      style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
      <ArrowLeft size={16} /> Beranda
    </button>
  );
}

function rankVisual(rank) {
  if (rank === 1) return { icon: <Crown size={16} color="#B45309" />, bg: "rgba(180,83,9,0.08)" };
  if (rank === 2) return { icon: <Medal size={16} color="#6B7280" />, bg: "rgba(107,114,128,0.08)" };
  if (rank === 3) return { icon: <Medal size={16} color="#B45309" />, bg: "rgba(180,83,9,0.06)" };
  return { icon: null, bg: null };
}

function LeaderRow({ r, isMe }) {
  const rv = rankVisual(r.rank);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, background: isMe ? "#FFF5F6" : "#FFFFFF",
      border: `1px solid ${isMe ? "#F7C6C9" : "#E9EAEE"}`, borderRadius: 14, padding: "11px 13px", fontFamily: FF,
    }}>
      <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: "50%", background: rv.bg || "#F0F0F3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#5A5A68" }}>
        {rv.icon || r.rank}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.user_name || "-"} {isMe && <span style={{ color: "#ED1C24" }}>(Anda)</span>}
        </div>
        <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "#8A8A96", fontWeight: 600 }}>
          <MapPin size={10} /> {r.branch_name || "-"} · {fmtInt(r.total_activities)} aktivitas
        </div>
      </div>
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 14, fontWeight: 800, color: "#17181C" }}>
          <TrendingUp size={12} color="#15803D" /> {fmtInt(Math.round(r.final_score || 0))}
        </div>
        <div style={{ fontSize: 9.5, color: "#B0B0BA", fontWeight: 600 }}>{Math.round(r.achievement_pct || 0)}% capaian</div>
      </div>
    </div>
  );
}
