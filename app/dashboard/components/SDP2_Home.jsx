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
    <div style={{ fontFamily: FF, color: t.hi, maxWidth: 640, margin: "0 auto" }}>
      <button onClick={onExit} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 16 }}>
        <ArrowLeft size={15} /> Kembali
      </button>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.4 }}>SDP Saya</div>
        <div style={{ fontSize: 12.5, color: t.mid, marginTop: 3 }}>Registrasi yang pernah Anda ajukan, dengan progres tiap tahapnya.</div>
      </div>

      {/* Aksi utama — paling atas & paling menonjol, sesuai keputusan landing */}
      <button onClick={() => setScreen("new")}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "15px 18px", borderRadius: 16, border: "none",
          background: `linear-gradient(135deg, ${t.tealD} 0%, ${t.teal} 100%)`, color: "#06231F", fontFamily: FF, fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: t.md, marginBottom: 16 }}>
        <Plus size={19} /> Registrasi SDP Baru
      </button>

      {needsAttention.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 13px", borderRadius: 12, marginBottom: 14, background: t.accBg, border: `1px solid ${t.acc}33` }}>
          <AlertCircle size={15} color={t.acc} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: t.hi }}>{needsAttention.length} SDP butuh tindakan Anda (Need Revision/Hold).</span>
        </div>
      )}

      <div style={{ position: "relative", marginBottom: 14 }}>
        <Search size={14} color={t.lo} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama SDP, SDP ID, atau branch…"
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px 10px 34px", borderRadius: 12, border: `1px solid ${t.line}`, background: t.inp, color: t.hi, fontSize: 13.5, fontFamily: FF, outline: "none" }} />
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: t.mid, display: "flex", alignItems: "center", gap: 8, padding: "20px 0" }}><Loader2 size={15} className="spin" /> Memuat…</div>
      ) : err ? (
        <div style={{ fontSize: 13, color: t.acc }}>{err}</div>
      ) : withProgress.length === 0 ? (
        <div style={{ padding: "40px 22px", textAlign: "center", color: t.mid, background: t.card, border: `1px solid ${t.line}`, borderRadius: 16 }}>
          <Inbox size={26} style={{ opacity: 0.5, marginBottom: 8 }} />
          <div style={{ fontSize: 13.5 }}>{q ? "Tidak ada yang cocok." : "Belum ada SDP yang Anda ajukan. Mulai dari tombol di atas."}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {withProgress.map(({ row: r, prog }) => (
            <button key={r.id} onClick={() => { setOpenRow(r); setScreen("detail"); }}
              style={{ textAlign: "left", display: "block", width: "100%", background: t.card, border: `1px solid ${prog.blocked ? `${t.acc}55` : t.line}`, borderRadius: 15, padding: 15, boxShadow: t.sm, cursor: "pointer", fontFamily: FF, color: t.hi }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sdp_name || "(Belum ada nama)"}</div>
                  <div style={{ fontSize: 11.5, fontFamily: "monospace", color: t.mid, marginTop: 2 }}>{r.sdp_id_new || "Draft"} {r.branch ? `· ${r.branch}` : ""}</div>
                </div>
                <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: 99, color: TONE_COL(t, prog.tone), background: TONE_BG(t, prog.tone) }}>{prog.headline}</span>
              </div>
              <div style={{ marginTop: 12 }}>
                <MiniStages t={t} stageIndex={prog.stageIndex} tone={prog.tone} />
              </div>
            </button>
          ))}
        </div>
      )}
      <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
