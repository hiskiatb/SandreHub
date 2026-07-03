"use client";
import { useState, useEffect, useCallback } from "react";
import MartaShell, { T, FONT } from "../components/MartaShell";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";

const fmtDate = (s) => {
  if (!s || s.length < 10) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  const mo = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"][(+m || 1) - 1];
  return `${d} ${mo} ${y}`;
};

export default function ApprovalPage() {
  return (
    <MartaShell active="approval" title="Approval Center" subtitle="Tinjau & setujui rencana kegiatan yang diajukan.">
      {(ctx) => <Body canManage={ctx?.canManage} />}
    </MartaShell>
  );
}

function Body({ canManage }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const { data, error } = await supabaseMarta
        .from("mh_activities")
        .select("id, event_name, brand, mc, site_id, plan_date_start, plan_date, event_categories, status")
        .eq("status", "submitted")
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      setRows(data || []);
    } catch (e) { setErr(e.message || "Gagal memuat"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function decide(id, approve) {
    setBusy(id); setErr("");
    try {
      const { error } = await supabaseMarta.from("mh_activities").update({ status: approve ? "approved" : "rejected" }).eq("id", id);
      if (error) throw new Error(error.message);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(""); }
  }

  return (
    <div>
      {!MARTA_CONFIGURED && <div style={{ ...card, borderColor: T.warning, background: T.warningBg, color: "#7a5b00", marginBottom: 16 }}>Supabase MartaHub belum dikonfigurasi / project paused.</div>}
      {err && <div style={{ ...card, borderColor: T.error, background: T.errorBg, color: T.error, marginBottom: 16 }}>{err}</div>}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, fontWeight: 800, fontSize: 14 }}>Menunggu persetujuan <span style={{ color: T.mid, fontWeight: 500 }}>· {rows.length}</span></div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
            <thead><tr style={{ background: "#F7F9FC", color: T.mid, textAlign: "left" }}>
              {["Event", "Brand", "MC", "Site", "Tanggal", ""].map((h) => <th key={h} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6} style={{ padding: 26, textAlign: "center", color: T.lo }}>Memuat…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={6} style={{ padding: 26, textAlign: "center", color: T.lo }}>Tidak ada yang perlu disetujui 🎉</td></tr>}
              {!loading && rows.map((r) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${T.line}` }}>
                  <td style={{ padding: "10px 14px", fontWeight: 700 }}>{r.event_name || "—"}</td>
                  <td style={{ padding: "10px 14px" }}>{r.brand ? <span style={{ fontSize: 10.5, fontWeight: 800, color: r.brand === "tri" ? T.tri : T.im3 }}>{r.brand === "tri" ? "3ID" : "IM3"}</span> : "—"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{r.mc || "—"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{r.site_id || "—"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{fmtDate(r.plan_date_start || r.plan_date)}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    {canManage && (
                      <span style={{ display: "inline-flex", gap: 8 }}>
                        <button disabled={busy === r.id} onClick={() => decide(r.id, true)} style={{ ...btn, background: T.success, color: "#fff", borderColor: T.success }}>Setujui</button>
                        <button disabled={busy === r.id} onClick={() => decide(r.id, false)} style={{ ...btn, color: T.error, borderColor: `${T.error}44` }}>Tolak</button>
                      </span>
                    )}
                  </td>
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
const btn = { padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT };
