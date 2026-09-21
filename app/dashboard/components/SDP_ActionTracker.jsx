"use client";
/**
 * SDP_ActionTracker.jsx — Fase 2 (Reporting §7, bagian "action tracker")
 * Pelengkap SDP_Summary (rollup siklus) & SDP_BatchMonitor (kelengkapan
 * registrasi): daftar item yang BUTUH TINDAK LANJUT lintas modul, dengan
 * penanda overdue —
 *   • Registrasi macet: hq_validation_status Need Revision/Hold, atau
 *     final_registration_status Need Revision/Hold/On Progress terlalu lama.
 *   • Evaluasi Critical: sdp_evaluation dengan action_plan/deadline yang
 *     belum selesai (evaluation_result = Critical).
 * Read-only untuk semua yang bisa akses (PIC Region/SPM); tidak ada tulis di
 * sini — perbaikan dilakukan lewat modul terkait (klik baris → info saja).
 *
 * Props: { supabase, theme = "dark", profile, onExit }
 */
import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, AlertCircle, Clock, ShieldAlert, FileWarning, CalendarClock } from "lucide-react";
import { fmtSubmissionMonth } from "../../../lib/sdp";

const mk = (d) => ({
  card: d ? "#17171B" : "#FFFFFF", sub: d ? "#1D1D22" : "#F8F9FA", line: d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi: d ? "#F1F1F4" : "#0F1117", mid: d ? "#8A8A9C" : "#6B7280", lo: d ? "#4A4A5E" : "#A0A8B4", head: d ? "#202028" : "#EEF1F5",
  amber: "#FFB020", acc: "#ED1C24", accBg: d ? "rgba(237,28,36,.1)" : "rgba(237,28,36,.07)",
  ok: "#22C55E", sm: d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const ms = new Date(dateStr).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.round(ms / 86400000);
}

export default function SDP_ActionTracker({ supabase, theme = "dark", profile, onExit }) {
  const d = theme === "dark";
  const t = mk(d);
  const role = profile?.role ?? "";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [stuckRegs, setStuckRegs] = useState([]);
  const [criticalEvals, setCriticalEvals] = useState([]);

  useEffect(() => {
    let on = true;
    (async () => {
      setLoading(true); setErr("");
      try {
        let regQ = supabase.from("sdp_registration")
          .select("sdp_id_new, sdp_name, region, branch, submission_month, hq_validation_status, final_registration_status, hq_revision_note, hq_validated_at")
          .in("hq_validation_status", ["Need Revision", "Hold"])
          .order("hq_validated_at", { ascending: true }).limit(1000);
        let evalQ = supabase.from("sdp_evaluation")
          .select("sdp_id, period, region, branch, evaluation_result, action_plan, action_owner, action_deadline, waiver_required, waiver_status")
          .eq("evaluation_result", "Critical")
          .order("action_deadline", { ascending: true }).limit(1000);
        if (role === "pic_region" && profile?.region) {
          regQ = regQ.eq("region", profile.region);
          evalQ = evalQ.eq("region", profile.region);
        }
        const [{ data: regs, error: e1 }, { data: evs, error: e2 }] = await Promise.all([regQ, evalQ]);
        if (e1) throw e1; if (e2) throw e2;
        if (!on) return;
        setStuckRegs(regs || []);
        setCriticalEvals(evs || []);
      } catch (e) { if (on) setErr(e.message || String(e)); }
      finally { if (on) setLoading(false); }
    })();
    return () => { on = false; };
  }, [supabase, role, profile?.region]);

  const overdueCount = useMemo(() => criticalEvals.filter((e) => e.action_deadline && daysUntil(e.action_deadline) < 0).length, [criticalEvals]);

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <button onClick={onExit} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 14 }}>
        <ArrowLeft size={15} /> Kembali
      </button>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.4 }}>Action Tracker</div>
        <div style={{ fontSize: 12.5, color: t.mid, marginTop: 2 }}>
          {role === "pic_region" ? `Region ${profile?.region || "Anda"}` : "Seluruh Sumatera"} · item yang butuh tindak lanjut minggu ini — registrasi macet & evaluasi Critical.
        </div>
      </div>

      <div className="sdp-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi t={t} icon={<FileWarning size={17} />} tint={t.amber} label="Registrasi Need Revision/Hold" value={stuckRegs.length} />
        <Kpi t={t} icon={<ShieldAlert size={17} />} tint={t.acc} label="Evaluasi Critical" value={criticalEvals.length} />
        <Kpi t={t} icon={<CalendarClock size={17} />} tint={t.acc} label="Action Plan Overdue" value={overdueCount} />
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: t.mid, display: "flex", alignItems: "center", gap: 8 }}><Loader2 size={15} className="spin" /> Memuat…</div>
      ) : err ? (
        <div style={{ fontSize: 13, color: t.acc }}>{err}</div>
      ) : (
        <>
          <Section t={t} icon={<FileWarning size={15} />} title={`Registrasi Perlu Tindak Lanjut (${stuckRegs.length})`}>
            {stuckRegs.length === 0 ? <Empty t={t} text="Tidak ada registrasi yang tertahan." /> : (
              <Table t={t} head={["SDP ID", "Nama SDP", "Periode", "HQ Status", "Catatan HQ"]}>
                {stuckRegs.map((r) => (
                  <tr key={r.sdp_id_new}>
                    <td style={{ ...tdS(t), fontFamily: "monospace", whiteSpace: "nowrap" }}>{r.sdp_id_new}</td>
                    <td style={{ ...tdS(t), fontWeight: 700, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sdp_name}</td>
                    <td style={{ ...tdS(t), color: t.mid, whiteSpace: "nowrap" }}>{fmtSubmissionMonth(r.submission_month)}</td>
                    <td style={tdS(t)}><Badge t={t} tone={r.hq_validation_status === "Hold" ? t.mid : t.acc} text={r.hq_validation_status} /></td>
                    <td style={{ ...tdS(t), color: t.mid, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.hq_revision_note || "—"}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>

          <Section t={t} icon={<ShieldAlert size={15} />} title={`Evaluasi Critical & Action Plan (${criticalEvals.length})`}>
            {criticalEvals.length === 0 ? <Empty t={t} text="Tidak ada SDP berstatus Critical." /> : (
              <Table t={t} head={["SDP ID", "Periode", "Action Plan", "Owner", "Deadline", "Waiver"]}>
                {criticalEvals.map((e, i) => {
                  const dl = daysUntil(e.action_deadline);
                  const overdue = dl !== null && dl < 0;
                  return (
                    <tr key={`${e.sdp_id}-${e.period}-${i}`}>
                      <td style={{ ...tdS(t), fontFamily: "monospace", whiteSpace: "nowrap" }}>{e.sdp_id}</td>
                      <td style={{ ...tdS(t), color: t.mid, whiteSpace: "nowrap" }}>{fmtSubmissionMonth(e.period)}</td>
                      <td style={{ ...tdS(t), maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.action_plan || "—"}</td>
                      <td style={{ ...tdS(t), color: t.mid, whiteSpace: "nowrap" }}>{e.action_owner || "—"}</td>
                      <td style={tdS(t)}>
                        {e.action_deadline ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700, color: overdue ? t.acc : t.hi }}>
                            {overdue && <AlertCircle size={12} />} {e.action_deadline} {overdue ? `(telat ${Math.abs(dl)}h)` : dl != null ? `(${dl}h lagi)` : ""}
                          </span>
                        ) : "—"}
                      </td>
                      <td style={tdS(t)}>{e.waiver_required ? <Badge t={t} tone={e.waiver_status === "Approved" ? t.ok : t.amber} text={e.waiver_status || "Pending"} /> : <span style={{ color: t.lo }}>—</span>}</td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Section>
        </>
      )}
      <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function Kpi({ t, icon, tint, label, value }) {
  return (
    <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 14, boxShadow: t.sm }}>
      <span style={{ width: 32, height: 32, borderRadius: 9, background: `${tint}18`, color: tint, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8, letterSpacing: -0.03, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: t.mid, marginTop: 1 }}>{label}</div>
    </div>
  );
}
function Section({ t, icon, title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 800, marginBottom: 8, color: t.hi }}>{icon} {title}</div>
      {children}
    </div>
  );
}
function Empty({ t, text }) {
  return <div style={{ padding: 22, textAlign: "center", color: t.mid, fontSize: 12.5, background: t.card, border: `1px solid ${t.line}`, borderRadius: 12 }}>{text}</div>;
}
function Table({ t, head, children }) {
  return (
    <div style={{ overflow: "auto", border: `1px solid ${t.line}`, borderRadius: 12, background: t.card, boxShadow: t.sm, maxHeight: "40vh" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 700, fontSize: 12.5 }}>
        <thead><tr>{head.map((h) => <th key={h} style={thS(t)}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Badge({ t, tone, text }) {
  return <span style={{ display: "inline-flex", padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 800, color: tone, background: `${tone}1A`, border: `1px solid ${tone}33` }}>{text}</span>;
}
const thS = (t) => ({ position: "sticky", top: 0, background: t.head, padding: "9px 12px", textAlign: "left", fontSize: 10.5, fontWeight: 800, color: t.mid, whiteSpace: "nowrap", borderBottom: `1px solid ${t.line}` });
const tdS = (t) => ({ padding: "9px 12px", borderBottom: `1px solid ${t.line}` });
