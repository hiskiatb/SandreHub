"use client";
/**
 * SDP2_Home.jsx — SDP Management (Baru), Registrasi — landing CSE/RSE.
 *
 * Rebuild dari SDP Management lama, hasil diskusi "rombak total":
 *   • 1 layar: daftar "SDP Saya" + progress 4-tahap (bukan 5 kolom status
 *     terpisah) + tombol utama "+ Registrasi SDP Baru".
 *   • Form pengisian & edit TETAP memakai SDP_QuickForm / SDP_RegistrationDetail
 *     yang sudah teruji (validasi, upload dokumen, RLS) — yang di-rebuild di
 *     sini murni lapisan navigasi & visual, bukan menulis ulang logic data.
 *   • Modul lama tidak dihapus — tetap ada sebagai "SDP Management (Archive)".
 *
 * Props: { supabase, theme = "dark", profile, onExit }
 */
import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Loader2, AlertCircle, Search, Inbox } from "lucide-react";
import { computeSdpProgress, SDP_STAGES } from "../../../lib/sdp/progress";
import SDP_QuickForm from "./SDP_QuickForm";
import SDP2_Detail from "./SDP2_Detail";

const mk = (d) => ({
  card: d ? "#17171B" : "#FFFFFF", sub: d ? "#1D1D22" : "#F8F9FA", line: d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi: d ? "#F1F1F4" : "#0F1117", mid: d ? "#8A8A9C" : "#6B7280", lo: d ? "#4A4A5E" : "#A0A8B4", inp: d ? "#111114" : "#FFFFFF",
  teal: "#32BCAD", tealD: "#1A9E90", tealBg: d ? "rgba(50,188,173,.12)" : "rgba(26,158,144,.08)",
  amber: "#FFB020", amberBg: d ? "rgba(255,176,32,.14)" : "rgba(255,176,32,.09)",
  acc: "#ED1C24", accBg: d ? "rgba(237,28,36,.12)" : "rgba(237,28,36,.08)",
  ok: "#22C55E", okBg: d ? "rgba(34,197,94,.14)" : "rgba(22,163,74,.09)",
  blue: "#0A84FF", blueBg: d ? "rgba(10,132,255,.12)" : "rgba(37,99,235,.08)",
  sm: d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)",
  md: d ? "0 8px 24px rgba(0,0,0,.5)" : "0 8px 20px rgba(15,17,23,.08)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
const TONE_COL = (t, tone) => ({ ok: t.ok, amber: t.amber, acc: t.acc, blue: t.blue }[tone] || t.mid);
const TONE_BG = (t, tone) => ({ ok: t.okBg, amber: t.amberBg, acc: t.accBg, blue: t.blueBg }[tone] || t.sub);

// Mini progress bar 4-titik dipakai di kartu list (versi ringkas dari yang
// besar di SDP2_Detail) — lihat lib/sdp/progress.js untuk aturan tahapnya.
function MiniStages({ t, stageIndex, tone }) {
  const col = TONE_COL(t, tone);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {SDP_STAGES.map((s, i) => (
        <React.Fragment key={s.key}>
          <div style={{ width: 7, height: 7, borderRadius: 99, background: i <= stageIndex ? col : t.line, flexShrink: 0 }} />
          {i < SDP_STAGES.length - 1 && <div style={{ width: 12, height: 2, background: i < stageIndex ? col : t.line, flexShrink: 0 }} />}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function SDP2_Home({ supabase, theme = "dark", profile, onExit }) {
  const d = theme === "dark";
  const t = mk(d);
  const role = profile?.role ?? "";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [screen, setScreen] = useState("list"); // list | new | detail
  const [openRow, setOpenRow] = useState(null);

  const load = async () => {
    setLoading(true); setErr("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let query = supabase.from("sdp_registration")
        .select("id, sdp_id_new, sdp_name, brand, branch, region, submission_month, circle_submit_status, hq_validation_status, final_registration_status, system_account_status, id_validation_status, hq_revision_note, created_at")
        .order("created_at", { ascending: false }).limit(500);
      // CSE/RSE: hanya SDP yang mereka ajukan sendiri — inti dari "SDP Saya".
      if (user?.id) query = query.eq("submitted_by", user.id);
      const { data, error } = await query;
      if (error) throw error;
      setRows(data || []);
    } catch (e) { setErr(e.message || String(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [supabase]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => `${r.sdp_name || ""} ${r.sdp_id_new || ""} ${r.branch || ""}`.toLowerCase().includes(needle));
  }, [rows, q]);

  const withProgress = useMemo(() => filtered.map((r) => ({ row: r, prog: computeSdpProgress(r) })), [filtered]);
  const needsAttention = withProgress.filter((x) => x.prog.blocked);

  if (screen === "new") {
    return (
      <SDP_QuickForm supabase={supabase} theme={theme} profile={profile}
        onExit={() => { setScreen("list"); load(); }} />
    );
  }
  if (screen === "detail" && openRow) {
    return (
      <SDP2_Detail supabase={supabase} theme={theme} profile={profile} entry={openRow}
        onBack={() => { setScreen("list"); load(); }} />
    );
  }

  return (
    <div style={{ fontFamily: FF, color: t.hi, width: "100%" }}>
      <button onClick={onExit} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 20 }}>
        <ArrowLeft size={15} /> Kembali
      </button>

      <div className="sdp2-header" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 18, marginBottom: 22, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5 }}>SDP Saya</div>
          <div style={{ fontSize: 13, color: t.mid, marginTop: 4 }}>Registrasi yang pernah Anda ajukan, dengan progres tiap tahapnya.</div>
        </div>
        {/* Aksi utama — paling menonjol, sejajar judul di layar lebar */}
        <button onClick={() => setScreen("new")}
          style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "14px 22px", borderRadius: 14, border: "none",
            background: `linear-gradient(135deg, ${t.tealD} 0%, ${t.teal} 100%)`, color: "#06231F", fontFamily: FF, fontSize: 14.5, fontWeight: 800, cursor: "pointer", boxShadow: t.md }}>
          <Plus size={18} /> Registrasi SDP Baru
        </button>
      </div>

      {needsAttention.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 15px", borderRadius: 12, marginBottom: 16, background: t.accBg, border: `1px solid ${t.acc}33` }}>
          <AlertCircle size={15} color={t.acc} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: t.hi }}>{needsAttention.length} SDP butuh tindakan Anda (Need Revision/Hold).</span>
        </div>
      )}

      <div style={{ position: "relative", marginBottom: 18, maxWidth: 420 }}>
        <Search size={14} color={t.lo} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama SDP, SDP ID, atau branch…"
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px 10px 36px", borderRadius: 12, border: `1px solid ${t.line}`, background: t.inp, color: t.hi, fontSize: 13.5, fontFamily: FF, outline: "none" }} />
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: t.mid, display: "flex", alignItems: "center", gap: 8, padding: "20px 0" }}><Loader2 size={15} className="spin" /> Memuat…</div>
      ) : err ? (
        <div style={{ fontSize: 13, color: t.acc }}>{err}</div>
      ) : withProgress.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "56px 22px", color: t.mid, background: t.card, border: `1px dashed ${t.line}`, borderRadius: 18 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: t.sub, border: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
            <Inbox size={22} color={t.lo} />
          </div>
          <div style={{ fontSize: 13.5, maxWidth: 320, lineHeight: 1.5 }}>{q ? "Tidak ada yang cocok." : "Belum ada SDP yang Anda ajukan. Mulai dari tombol di atas."}</div>
        </div>
      ) : (
        <div className="sdp2-list-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {withProgress.map(({ row: r, prog }) => (
            <button key={r.id} onClick={() => { setOpenRow(r); setScreen("detail"); }}
              style={{ textAlign: "left", display: "block", width: "100%", background: t.card, border: `1px solid ${prog.blocked ? `${t.acc}55` : t.line}`, borderRadius: 16, padding: 17, boxShadow: t.sm, cursor: "pointer", fontFamily: FF, color: t.hi, transition: "transform .15s, box-shadow .15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = t.md; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = t.sm; }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sdp_name || "(Belum ada nama)"}</div>
                  <div style={{ fontSize: 11.5, fontFamily: "monospace", color: t.mid, marginTop: 2 }}>{r.sdp_id_new || "Draft"} {r.branch ? `· ${r.branch}` : ""}</div>
                </div>
                <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: 99, color: TONE_COL(t, prog.tone), background: TONE_BG(t, prog.tone) }}>{prog.headline}</span>
              </div>
              <div style={{ marginTop: 13 }}>
                <MiniStages t={t} stageIndex={prog.stageIndex} tone={prog.tone} />
              </div>
            </button>
          ))}
        </div>
      )}
      <style>{`
        .spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}
        @media (max-width: 560px) {
          .sdp2-header{flex-direction:column; align-items:stretch;}
          .sdp2-header button{width:100%;}
          .sdp2-list-grid{grid-template-columns:1fr !important;}
        }
      `}</style>
    </div>
  );
}
