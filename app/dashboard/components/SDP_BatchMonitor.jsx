"use client";
/**
 * SDP_BatchMonitor.jsx — Fase 3
 * Dashboard kelengkapan registrasi SDP untuk PIC Region & SPM Sumatera.
 * - KPI + breakdown per cluster/CSE (berapa masuk, validated, sisa draft).
 * - Daftar submission + filter periode/status.
 * - "Tandai Validated" massal — HANYA untuk SPM Sumatera (sesuai RLS:
 *   UPDATE sdp_registration diizinkan bila submitted_by = auth.uid() ATAU
 *   role = spm_sumatera). PIC Region memantau (read-only) + mengingatkan CSE.
 *
 * Props: { supabase, theme = "dark", profile, onExit }
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Loader2, Check, AlertCircle, Users, CheckCircle2, FileText, Clock, Filter, XCircle, PauseCircle,
} from "lucide-react";
import { fmtSubmissionMonth } from "../../../lib/sdp";
import SDP_RegistrationDetail from "./SDP_RegistrationDetail";

const mk = (d) => ({
  card: d ? "#17171B" : "#FFFFFF", sub: d ? "#1D1D22" : "#F8F9FA", line: d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi: d ? "#F1F1F4" : "#0F1117", mid: d ? "#8A8A9C" : "#6B7280", lo: d ? "#4A4A5E" : "#A0A8B4", inp: d ? "#111114" : "#FFFFFF", head: d ? "#202028" : "#EEF1F5",
  teal: "#32BCAD", tealD: "#1A9E90", tealBg: d ? "rgba(50,188,173,.12)" : "rgba(26,158,144,.08)", tealBd: d ? "rgba(50,188,173,.3)" : "rgba(26,158,144,.2)",
  blue: "#0A84FF", blueBg: d ? "rgba(10,132,255,.1)" : "rgba(37,99,235,.07)",
  amber: "#FFB020", mag: "#C6168D", acc: "#ED1C24", accBg: d ? "rgba(237,28,36,.1)" : "rgba(237,28,36,.07)",
  ok: "#22C55E", okBg: d ? "rgba(34,197,94,.12)" : "rgba(22,163,74,.08)",
  sm: d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;


// Chevron kustom via background-image (bukan panah native browser) supaya
// jaraknya ke tepi kanan konsisten & tidak mepet di semua dropdown.
const chevronBg = (color, sizePx = 10, offsetPx = 12) => ({
  appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'%3E%3Cpath d='M1 1L5 5L9 1' stroke='${encodeURIComponent(color)}' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat", backgroundPosition: `right ${offsetPx}px center`, backgroundSize: `${sizePx}px`,
});
// HQ Validation Status (lib/sdp/lists.js) — verdict HQ per SOP, terpisah dari
// status submission Circle (circle_submit_status) & status akhir (final_registration_status).
const HQ_TONE = { "Not Reviewed": "amber", Validated: "ok", "Need Revision": "acc", Hold: "mag", Rejected: "acc" };

export default function SDP_BatchMonitor({ supabase, theme = "dark", profile, onExit }) {
  const d = theme === "dark";
  const t = mk(d);
  const role = profile?.role ?? "";
  // Peninjauan HQ (Validated/Need Revision/Hold) — sesuai RACI SOP "Validate
  // completeness: R = HQ", dan RLS UPDATE sdp_registration sudah mengizinkan
  // pic_region (region cocok) & spm_sumatera menulis baris di luar miliknya.
  const canReview = role === "pic_region" || role === "spm_sumatera";

  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [period, setPeriod] = useState("all");
  const [sel, setSel] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [detail, setDetail] = useState(null); // baris sdp_registration sedang dibuka
  const [note, setNote] = useState(""); // catatan revisi/hold untuk aksi massal

  const load = async () => {
    setLoading(true); setErr("");
    try {
      let q = supabase.from("sdp_registration")
        .select("id, sdp_id_new, sdp_name, brand, submission_month, circle_submit_status, hq_validation_status, final_registration_status, submitter_cluster, submitter_region, submitted_by_name, branch, region, created_at")
        .order("created_at", { ascending: false }).limit(5000);
      if (role === "pic_region" && profile?.region) q = q.eq("region", profile.region);
      else q = q.eq("circle", "Sumatera");
      const { data, error } = await q;
      if (error) throw error;
      setAll(data || []);
    } catch (e) { setErr(e.message || String(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [supabase, role, profile?.region]);

  const periods = useMemo(() => {
    const s = new Set(); all.forEach((r) => r.submission_month && s.add(r.submission_month));
    return [...s].sort().reverse();
  }, [all]);

  const rows = useMemo(() => all.filter((r) => period === "all" || r.submission_month === period), [all, period]);

  const kpi = useMemo(() => {
    const k = { total: rows.length, notReviewed: 0, validated: 0, revision: 0 };
    rows.forEach((r) => {
      const s = r.hq_validation_status || "Not Reviewed";
      if (s === "Not Reviewed") k.notReviewed++;
      else if (s === "Validated") k.validated++;
      else k.revision++; // Need Revision | Hold | Rejected
    });
    return k;
  }, [rows]);

  // Breakdown per cluster.
  const byCluster = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => {
      const key = r.submitter_cluster || r.branch || "—";
      if (!m.has(key)) m.set(key, { cluster: key, total: 0, validated: 0, notReviewed: 0, cse: new Set(), last: null });
      const g = m.get(key); g.total++;
      const s = r.hq_validation_status || "Not Reviewed";
      if (s === "Validated") g.validated++; else if (s === "Not Reviewed") g.notReviewed++;
      if (r.submitted_by_name) g.cse.add(r.submitted_by_name);
      if (!g.last || String(r.created_at) > String(g.last)) g.last = r.created_at;
    });
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [rows]);

  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // HQ meninjau baris yang sudah di-submit Circle dan belum diputuskan.
  const selectable = rows.filter((r) => (r.circle_submit_status || "Submitted") === "Submitted" && (r.hq_validation_status || "Not Reviewed") !== "Validated");
  const allSelected = selectable.length > 0 && selectable.every((r) => sel.has(r.id));
  const toggleAll = () => setSel(() => allSelected ? new Set() : new Set(selectable.map((r) => r.id)));

  // Satu aksi untuk 3 verdict HQ — Validated tidak butuh catatan, Need Revision
  // & Hold sebaiknya diisi supaya Circle tahu apa yang perlu diperbaiki.
  const review = async (verdict) => {
    if (!sel.size) return;
    setBusy(true); setMsg(null);
    try {
      const ids = [...sel];
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        hq_validation_status: verdict,
        hq_validated_at: new Date().toISOString(),
        hq_validated_by: user?.id || null,
        hq_revision_note: verdict === "Validated" ? null : (note.trim() || null),
      };
      if (verdict === "Validated") payload.final_registration_status = "On Progress";
      if (verdict === "Need Revision") { payload.circle_submit_status = "Need Revision"; payload.final_registration_status = "Need Revision"; }
      if (verdict === "Hold") payload.final_registration_status = "Hold";
      const { error } = await supabase.from("sdp_registration").update(payload).in("id", ids);
      if (error) throw error;
      setMsg({ type: "ok", text: `${ids.length} baris ditandai ${verdict}.` });
      setSel(new Set()); setNote("");
      await load();
    } catch (e) { setMsg({ type: "err", text: "Gagal update: " + (e.message || e) }); }
    finally { setBusy(false); }
  };

  const toneCol = (tone) => ({ ok: t.ok, blue: t.blue, amber: t.amber, acc: t.acc, mag: t.mag }[tone] || t.mid);

  if (detail) {
    return (
      <SDP_RegistrationDetail supabase={supabase} theme={theme} profile={profile} entry={detail}
        onBack={() => setDetail(null)}
        onChanged={() => load()} />
    );
  }

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <button onClick={onExit} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 14 }}>
        <ArrowLeft size={15} /> Kembali
      </button>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.4 }}>Monitor Kelengkapan SDP</div>
          <div style={{ fontSize: 12.5, color: t.mid, marginTop: 2 }}>
            {role === "pic_region" ? `Region ${profile?.region || "Anda"}` : "Seluruh Sumatera"} · pantau progres pengisian per cluster/CSE.
          </div>
        </div>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: t.mid }}>Periode
          <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ display: "block", marginTop: 4, padding: "8px 34px 8px 10px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.inp, color: t.hi, fontSize: 13, fontFamily: FF, cursor: "pointer", minWidth: 170, ...chevronBg(t.mid) }}>
            <option value="all">Semua periode</option>
            {periods.map((p) => <option key={p} value={p}>{fmtSubmissionMonth(p)}</option>)}
          </select>
        </label>
      </div>

      {/* KPI */}
      <div className="sdp-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi t={t} icon={<FileText size={18} />} tint={t.blue} label="Total Masuk" value={kpi.total} />
        <Kpi t={t} icon={<Clock size={18} />} tint={t.amber} label="Menunggu Review HQ" value={kpi.notReviewed} />
        <Kpi t={t} icon={<CheckCircle2 size={18} />} tint={t.ok} label="Validated" value={kpi.validated} />
        <Kpi t={t} icon={<XCircle size={18} />} tint={t.acc} label="Revisi / Hold" value={kpi.revision} />
      </div>

      {msg && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 13px", borderRadius: 10, marginBottom: 14, fontSize: 12.5, fontWeight: 600,
          background: msg.type === "ok" ? t.okBg : t.accBg, color: msg.type === "ok" ? t.ok : t.acc, border: `1px solid ${(msg.type === "ok" ? t.ok : t.acc)}44` }}>
          {msg.type === "ok" ? <Check size={14} /> : <AlertCircle size={14} />} {msg.text}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: t.mid, display: "flex", alignItems: "center", gap: 8 }}><Loader2 size={15} className="spin" /> Memuat…</div>
      ) : err ? (
        <div style={{ fontSize: 13, color: t.acc }}>{err}</div>
      ) : (
        <>
          {/* Breakdown per cluster */}
          <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, boxShadow: t.sm, overflow: "hidden", marginBottom: 18 }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.line}`, fontSize: 13.5, fontWeight: 800 }}>Progres per Cluster</div>
            {byCluster.length === 0 ? (
              <div style={{ padding: 28, textAlign: "center", color: t.mid, fontSize: 13 }}>Belum ada submission pada periode ini.</div>
            ) : byCluster.map((g) => {
              const pct = g.total ? Math.round((g.validated / g.total) * 100) : 0;
              return (
                <div key={g.cluster} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderTop: `1px solid ${t.line}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.hi }}>{g.cluster}</div>
                    <div style={{ fontSize: 11.5, color: t.mid }}>{g.cse.size} CSE · {g.validated}/{g.total} validated · {g.notReviewed} menunggu review</div>
                  </div>
                  <div style={{ width: 120, height: 7, borderRadius: 99, background: t.sub, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: t.ok }} />
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: t.ok, width: 40, textAlign: "right" }}>{pct}%</div>
                </div>
              );
            })}
          </div>

          {/* Daftar submission + approve */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}><Filter size={14} /> Submission ({rows.length})</div>
          </div>
          {canReview ? (
            <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, padding: 12, marginBottom: 12, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan revisi/hold (opsional untuk Validated, disarankan untuk Need Revision/Hold)…"
                style={{ flex: "1 1 260px", padding: "8px 11px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.inp, color: t.hi, fontSize: 12.5, fontFamily: FF, outline: "none" }} />
              <button onClick={() => review("Validated")} disabled={busy || !sel.size}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: "none", background: t.ok, color: "#fff", fontFamily: FF, fontSize: 12.5, fontWeight: 800, cursor: (busy || !sel.size) ? "default" : "pointer", opacity: (busy || !sel.size) ? 0.5 : 1 }}>
                {busy ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />} Validated ({sel.size})
              </button>
              <button onClick={() => review("Need Revision")} disabled={busy || !sel.size}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: "none", background: t.acc, color: "#fff", fontFamily: FF, fontSize: 12.5, fontWeight: 800, cursor: (busy || !sel.size) ? "default" : "pointer", opacity: (busy || !sel.size) ? 0.5 : 1 }}>
                <XCircle size={14} /> Need Revision
              </button>
              <button onClick={() => review("Hold")} disabled={busy || !sel.size}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.sub, color: t.hi, fontFamily: FF, fontSize: 12.5, fontWeight: 800, cursor: (busy || !sel.size) ? "default" : "pointer", opacity: (busy || !sel.size) ? 0.5 : 1 }}>
                <PauseCircle size={14} /> Hold
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 11.5, color: t.mid, marginBottom: 10 }}>Review HQ (Validated/Need Revision/Hold) dilakukan oleh PIC Region atau SPM Sumatera. Anda dapat memantau & mengingatkan CSE.</div>
          )}

          <div style={{ overflow: "auto", border: `1px solid ${t.line}`, borderRadius: 12, background: t.card, boxShadow: t.sm, maxHeight: "50vh" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 820, fontSize: 12.5 }}>
              <thead>
                <tr>
                  {canReview && <th style={thS(t, 36)}><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>}
                  {["SDP ID", "Nama SDP", "Cluster", "CSE", "Periode", "Circle Submit", "HQ Validation"].map((h) => <th key={h} style={thS(t)}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 300).map((r) => {
                  const submitS = r.circle_submit_status || "Submitted";
                  const hqS = r.hq_validation_status || "Not Reviewed";
                  const col = toneCol(HQ_TONE[hqS] || "blue");
                  const canPick = canReview && submitS === "Submitted" && hqS !== "Validated";
                  return (
                    <tr key={r.id} onClick={() => setDetail(r)}
                      onMouseEnter={(e) => { e.currentTarget.style.background = t.sub; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      style={{ cursor: "pointer" }}>
                      {canReview && <td style={tdS(t)} onClick={(e) => e.stopPropagation()}>{canPick ? <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} /> : null}</td>}
                      <td style={{ ...tdS(t), fontFamily: "monospace", color: t.mid, whiteSpace: "nowrap" }}>{r.sdp_id_new || "—"}</td>
                      <td style={{ ...tdS(t), fontWeight: 700, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sdp_name || "—"}</td>
                      <td style={{ ...tdS(t), color: t.mid, whiteSpace: "nowrap" }}>{r.submitter_cluster || r.branch || "—"}</td>
                      <td style={{ ...tdS(t), color: t.mid, whiteSpace: "nowrap" }}>{r.submitted_by_name || "—"}</td>
                      <td style={{ ...tdS(t), color: t.mid, whiteSpace: "nowrap" }}>{fmtSubmissionMonth(r.submission_month)}</td>
                      <td style={{ ...tdS(t), color: t.mid, whiteSpace: "nowrap" }}>{submitS}</td>
                      <td style={tdS(t)}><span style={{ display: "inline-flex", padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 800, color: col, background: `${col}1A`, border: `1px solid ${col}33` }}>{hqS}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > 300 && <div style={{ fontSize: 11.5, color: t.mid, marginTop: 8 }}>Menampilkan 300 dari {rows.length}.</div>}
        </>
      )}
      <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function Kpi({ t, icon, tint, label, value }) {
  return (
    <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 14, boxShadow: t.sm }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, background: `${tint}18`, color: tint, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 10, letterSpacing: -0.03, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: t.mid, marginTop: 1 }}>{label}</div>
    </div>
  );
}
const thS = (t, w) => ({ position: "sticky", top: 0, background: t.head, padding: "9px 12px", textAlign: "left", fontSize: 10.5, fontWeight: 800, color: t.mid, whiteSpace: "nowrap", borderBottom: `1px solid ${t.line}`, width: w });
const tdS = (t) => ({ padding: "9px 12px", borderBottom: `1px solid ${t.line}` });
