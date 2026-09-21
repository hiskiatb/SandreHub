"use client";
/**
 * SDP_Evaluation.jsx — Fase 2
 * Modul "SDP Evaluation & PnL" sesuai SDP Operation SOP §5.
 * - PIC Region / SPM Sumatera mengevaluasi SDP yang sudah Registered per periode.
 * - Checklist SOP (performance data, KPI, business feasibility) → hasil
 *   (Healthy/Watchlist/Critical/Need Data Validation).
 * - Link PnL manual (dipilih dari daftar pnl_reports, tidak auto-join — lihat
 *   docs/sql/sdp_fase2_evaluation.sql) sebagai referensi kelayakan bisnis.
 * - Jika Critical → wajib action plan/owner/deadline, dan bisa ajukan waiver
 *   (approve hingga level HOC) supaya SDP tetap jalan sambil diperbaiki.
 *
 * Props: { supabase, theme = "dark", profile, onExit }
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Loader2, Check, AlertCircle, TrendingUp, TrendingDown, HelpCircle,
  ShieldAlert, Save, X, ChevronRight,
} from "lucide-react";
import { fmtSubmissionMonth } from "../../../lib/sdp";

const mk = (d) => ({
  card: d ? "#17171B" : "#FFFFFF", sub: d ? "#1D1D22" : "#F8F9FA", line: d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi: d ? "#F1F1F4" : "#0F1117", mid: d ? "#8A8A9C" : "#6B7280", lo: d ? "#4A4A5E" : "#A0A8B4", inp: d ? "#111114" : "#FFFFFF", head: d ? "#202028" : "#EEF1F5",
  teal: "#32BCAD", tealD: "#1A9E90", tealBg: d ? "rgba(50,188,173,.12)" : "rgba(26,158,144,.08)", tealBd: d ? "rgba(50,188,173,.3)" : "rgba(26,158,144,.2)",
  blue: "#0A84FF", blueBg: d ? "rgba(10,132,255,.1)" : "rgba(37,99,235,.07)",
  amber: "#FFB020", amberBg: d ? "rgba(255,176,32,.12)" : "rgba(255,176,32,.08)",
  acc: "#ED1C24", accBg: d ? "rgba(237,28,36,.1)" : "rgba(237,28,36,.07)",
  ok: "#22C55E", okBg: d ? "rgba(34,197,94,.12)" : "rgba(22,163,74,.08)",
  sm: d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

const chevronBg = (color, sizePx = 10, offsetPx = 12) => ({
  appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'%3E%3Cpath d='M1 1L5 5L9 1' stroke='${encodeURIComponent(color)}' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat", backgroundPosition: `right ${offsetPx}px center`, backgroundSize: `${sizePx}px`,
});

const RESULT_TONE = { Healthy: "ok", Watchlist: "amber", Critical: "acc", "Need Data Validation": "blue" };
const RESULT_ICON = { Healthy: TrendingUp, Watchlist: HelpCircle, Critical: TrendingDown, "Need Data Validation": AlertCircle };
const RESULT_OPTS = ["Healthy", "Watchlist", "Critical", "Need Data Validation"];

function thisMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function SDP_Evaluation({ supabase, theme = "dark", profile, onExit }) {
  const d = theme === "dark";
  const t = mk(d);
  const role = profile?.role ?? "";
  const canEdit = role === "pic_region" || role === "spm_sumatera";

  const [period, setPeriod] = useState(thisMonth());
  const [sdps, setSdps] = useState([]);       // SDP Registered berdasarkan scope
  const [evals, setEvals] = useState([]);     // sdp_evaluation baris periode ini
  const [pnlOpts, setPnlOpts] = useState([]); // pnl_reports untuk dropdown link manual
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState(null);
  const [openRow, setOpenRow] = useState(null); // sdp_id sedang dibuka untuk diisi
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true); setErr("");
    try {
      let q = supabase.from("sdp_registration")
        .select("sdp_id_new, sdp_name, brand, region, branch, submitter_cluster, final_registration_status")
        .eq("final_registration_status", "Registered").order("sdp_name", { ascending: true }).limit(3000);
      if (role === "pic_region" && profile?.region) q = q.eq("region", profile.region);
      const [{ data: sdpData, error: sdpErr }, { data: evalData, error: evalErr }, { data: pnlData }] = await Promise.all([
        q,
        supabase.from("sdp_evaluation").select("*").eq("period", period).limit(3000),
        supabase.from("pnl_reports").select("id, partner_name, branch, month, year").order("year", { ascending: false }).limit(2000),
      ]);
      if (sdpErr) throw sdpErr;
      if (evalErr) throw evalErr;
      setSdps(sdpData || []);
      setEvals(evalData || []);
      setPnlOpts(pnlData || []);
    } catch (e) { setErr(e.message || String(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [supabase, role, profile?.region, period]);

  const evalBySdp = useMemo(() => {
    const m = new Map(); evals.forEach((e) => m.set(e.sdp_id, e)); return m;
  }, [evals]);

  const kpi = useMemo(() => {
    const k = { total: sdps.length, healthy: 0, watchlist: 0, critical: 0, needData: 0, notEvaluated: 0 };
    sdps.forEach((s) => {
      const e = evalBySdp.get(s.sdp_id_new);
      const r = e?.evaluation_result;
      if (r === "Healthy") k.healthy++;
      else if (r === "Watchlist") k.watchlist++;
      else if (r === "Critical") k.critical++;
      else if (r === "Need Data Validation") k.needData++;
      else k.notEvaluated++;
    });
    return k;
  }, [sdps, evalBySdp]);

  const toneCol = (tone) => ({ ok: t.ok, blue: t.blue, amber: t.amber, acc: t.acc }[tone] || t.mid);

  const openEditor = (sdpId) => {
    const existing = evalBySdp.get(sdpId);
    const sdp = sdps.find((s) => s.sdp_id_new === sdpId);
    setForm(existing ? { ...existing } : {
      sdp_id: sdpId, period, region: sdp?.region || null, branch: sdp?.branch || null,
      pnl_report_id: null, performance_data_available: false, kpi_relevant_checked: false,
      business_feasibility_reviewed: false, evaluation_status: "In Progress", evaluation_result: null,
      action_plan: "", action_owner: "", action_deadline: "", waiver_required: false, waiver_status: null,
      waiver_note: "", notes: "",
    });
    setOpenRow(sdpId);
  };

  const save = async () => {
    if (!form) return;
    setSaving(true); setMsg(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        ...form,
        evaluation_status: form.evaluation_result ? "Completed" : "In Progress",
        action_deadline: form.action_deadline || null,
        evaluated_by: user?.id || null,
        evaluated_by_name: profile?.full_name || profile?.name || null,
      };
      if (payload.evaluation_result !== "Critical") { payload.waiver_required = false; }
      if (!payload.waiver_required) payload.waiver_status = payload.waiver_required ? payload.waiver_status : "Not Required";
      const { error } = await supabase.from("sdp_evaluation").upsert(payload, { onConflict: "sdp_id,period" });
      if (error) throw error;
      setMsg({ type: "ok", text: "Evaluasi tersimpan." });
      setOpenRow(null); setForm(null);
      await load();
    } catch (e) { setMsg({ type: "err", text: "Gagal simpan: " + (e.message || e) }); }
    finally { setSaving(false); }
  };

  const pnlForRow = (sdp) => pnlOpts.filter((p) => !sdp?.branch || p.branch === sdp.branch);

  if (openRow) {
    const sdp = sdps.find((s) => s.sdp_id_new === openRow);
    const relevantPnl = pnlForRow(sdp);
    return (
      <div style={{ fontFamily: FF, color: t.hi }}>
        <button onClick={() => { setOpenRow(null); setForm(null); }} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 14 }}>
          <ArrowLeft size={15} /> Kembali ke daftar evaluasi
        </button>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{sdp?.sdp_name || openRow}</div>
          <div style={{ fontSize: 12.5, color: t.mid, marginTop: 2, fontFamily: "monospace" }}>{openRow} · {sdp?.branch} · {fmtSubmissionMonth(period)}</div>
        </div>

        <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 18, boxShadow: t.sm, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>Checklist SOP §5</div>
          {[
            ["performance_data_available", "Performance data tersedia"],
            ["kpi_relevant_checked", "KPI relevan sudah dicek"],
            ["business_feasibility_reviewed", "Business feasibility (PnL) sudah ditinjau"],
          ].map(([key, label]) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", fontSize: 13, cursor: canEdit ? "pointer" : "default" }}>
              <input type="checkbox" disabled={!canEdit} checked={!!form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))} />
              {label}
            </label>
          ))}

          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 11.5, fontWeight: 700, color: t.mid }}>Link PnL (opsional, referensi manual)
              <select disabled={!canEdit} value={form.pnl_report_id || ""} onChange={(e) => setForm((f) => ({ ...f, pnl_report_id: e.target.value || null }))}
                style={{ display: "block", marginTop: 4, width: "100%", padding: "9px 34px 9px 10px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.inp, color: t.hi, fontSize: 13, fontFamily: FF, cursor: canEdit ? "pointer" : "default", ...chevronBg(t.mid) }}>
                <option value="">— tidak dipilih —</option>
                {relevantPnl.map((p) => <option key={p.id} value={p.id}>{p.partner_name} · {p.branch} · {p.month}/{p.year}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 18, boxShadow: t.sm, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>Hasil Evaluasi</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            {RESULT_OPTS.map((r) => {
              const Icon = RESULT_ICON[r]; const col = toneCol(RESULT_TONE[r]); const active = form.evaluation_result === r;
              return (
                <button key={r} disabled={!canEdit} onClick={() => setForm((f) => ({ ...f, evaluation_result: r, waiver_required: r === "Critical" ? f.waiver_required : false }))}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "12px 8px", borderRadius: 11, cursor: canEdit ? "pointer" : "default",
                    border: `1.5px solid ${active ? col : t.line}`, background: active ? `${col}18` : t.sub, color: active ? col : t.mid }}>
                  <Icon size={17} /> <span style={{ fontSize: 11, fontWeight: 800, textAlign: "center" }}>{r}</span>
                </button>
              );
            })}
          </div>
        </div>

        {form.evaluation_result === "Critical" && (
          <div style={{ background: t.accBg, border: `1px solid ${t.acc}44`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12, color: t.acc, display: "flex", alignItems: "center", gap: 6 }}><ShieldAlert size={15} /> Critical — Action Plan & Waiver</div>
            <Field t={t} label="Action Plan" value={form.action_plan} disabled={!canEdit} onChange={(v) => setForm((f) => ({ ...f, action_plan: v }))} textarea />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <Field t={t} label="Owner" value={form.action_owner} disabled={!canEdit} onChange={(v) => setForm((f) => ({ ...f, action_owner: v }))} />
              <Field t={t} label="Deadline" type="date" value={form.action_deadline} disabled={!canEdit} onChange={(v) => setForm((f) => ({ ...f, action_deadline: v }))} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 0 2px", fontSize: 13, cursor: canEdit ? "pointer" : "default" }}>
              <input type="checkbox" disabled={!canEdit} checked={!!form.waiver_required} onChange={(e) => setForm((f) => ({ ...f, waiver_required: e.target.checked, waiver_status: e.target.checked ? "Pending" : "Not Required" }))} />
              Ajukan waiver agar SDP tetap jalan (approval hingga level HOC)
            </label>
            {form.waiver_required && (
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: t.mid }}>Status Waiver
                  <select disabled={!canEdit} value={form.waiver_status || "Pending"} onChange={(e) => setForm((f) => ({ ...f, waiver_status: e.target.value }))}
                    style={{ display: "block", marginTop: 4, padding: "9px 34px 9px 10px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.inp, color: t.hi, fontSize: 13, fontFamily: FF, cursor: canEdit ? "pointer" : "default", ...chevronBg(t.mid) }}>
                    {["Pending", "Approved", "Rejected"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <Field t={t} label="Catatan Waiver (disetujui oleh / alasan)" value={form.waiver_note} disabled={!canEdit} onChange={(v) => setForm((f) => ({ ...f, waiver_note: v }))} textarea />
              </div>
            )}
          </div>
        )}

        <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 18, boxShadow: t.sm, marginBottom: 14 }}>
          <Field t={t} label="Catatan Umum" value={form.notes} disabled={!canEdit} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} textarea />
        </div>

        {msg && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 13px", borderRadius: 10, marginBottom: 14, fontSize: 12.5, fontWeight: 600,
            background: msg.type === "ok" ? t.okBg : t.accBg, color: msg.type === "ok" ? t.ok : t.acc, border: `1px solid ${(msg.type === "ok" ? t.ok : t.acc)}44` }}>
            {msg.type === "ok" ? <Check size={14} /> : <AlertCircle size={14} />} {msg.text}
          </div>
        )}

        {canEdit && (
          <button onClick={save} disabled={saving} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "11px 20px", borderRadius: 10, border: "none", background: t.teal, color: "#06231F", fontFamily: FF, fontSize: 13.5, fontWeight: 800, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />} Simpan Evaluasi
          </button>
        )}
        <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <button onClick={onExit} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 14 }}>
        <ArrowLeft size={15} /> Kembali
      </button>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.4 }}>SDP Evaluation & PnL</div>
          <div style={{ fontSize: 12.5, color: t.mid, marginTop: 2 }}>
            {role === "pic_region" ? `Region ${profile?.region || "Anda"}` : "Seluruh Sumatera"} · evaluasi kelayakan bisnis SDP yang sudah Registered.
          </div>
        </div>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: t.mid }}>Periode evaluasi
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)}
            style={{ display: "block", marginTop: 4, padding: "8px 10px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.inp, color: t.hi, fontSize: 13, fontFamily: FF }} />
        </label>
      </div>

      <div className="sdp-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi t={t} tint={t.mid} label="Total SDP" value={kpi.total} />
        <Kpi t={t} tint={t.ok} label="Healthy" value={kpi.healthy} />
        <Kpi t={t} tint={t.amber} label="Watchlist" value={kpi.watchlist} />
        <Kpi t={t} tint={t.acc} label="Critical" value={kpi.critical} />
        <Kpi t={t} tint={t.blue} label="Belum Dievaluasi" value={kpi.notEvaluated} />
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
      ) : sdps.length === 0 ? (
        <div style={{ padding: 28, textAlign: "center", color: t.mid, fontSize: 13, background: t.card, border: `1px solid ${t.line}`, borderRadius: 14 }}>
          Belum ada SDP berstatus Registered pada scope Anda.
        </div>
      ) : (
        <div style={{ overflow: "auto", border: `1px solid ${t.line}`, borderRadius: 12, background: t.card, boxShadow: t.sm, maxHeight: "60vh" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760, fontSize: 12.5 }}>
            <thead>
              <tr>{["SDP ID", "Nama SDP", "Branch", "Hasil Evaluasi", ""].map((h) => <th key={h} style={thS(t)}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {sdps.map((s) => {
                const e = evalBySdp.get(s.sdp_id_new);
                const r = e?.evaluation_result;
                const col = r ? toneCol(RESULT_TONE[r]) : t.lo;
                return (
                  <tr key={s.sdp_id_new} onClick={() => openEditor(s.sdp_id_new)}
                    onMouseEnter={(ev) => { ev.currentTarget.style.background = t.sub; }}
                    onMouseLeave={(ev) => { ev.currentTarget.style.background = "transparent"; }}
                    style={{ cursor: "pointer" }}>
                    <td style={{ ...tdS(t), fontFamily: "monospace", color: t.mid, whiteSpace: "nowrap" }}>{s.sdp_id_new}</td>
                    <td style={{ ...tdS(t), fontWeight: 700, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.sdp_name}</td>
                    <td style={{ ...tdS(t), color: t.mid, whiteSpace: "nowrap" }}>{s.branch || "—"}</td>
                    <td style={tdS(t)}>
                      <span style={{ display: "inline-flex", padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 800, color: col, background: `${col}1A`, border: `1px solid ${col}33` }}>
                        {r || "Belum dievaluasi"}
                      </span>
                    </td>
                    <td style={tdS(t)}><ChevronRight size={14} color={t.lo} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function Kpi({ t, tint, label, value }) {
  return (
    <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 14, boxShadow: t.sm }}>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.03, fontVariantNumeric: "tabular-nums", color: tint }}>{value}</div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: t.mid, marginTop: 2 }}>{label}</div>
    </div>
  );
}
function Field({ t, label, value, onChange, disabled, textarea, type = "text" }) {
  const common = { value: value || "", disabled, onChange: (e) => onChange(e.target.value),
    style: { display: "block", marginTop: 4, width: "100%", padding: "9px 11px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.inp, color: t.hi, fontSize: 13, fontFamily: FF, outline: "none", boxSizing: "border-box" } };
  return (
    <label style={{ fontSize: 11.5, fontWeight: 700, color: t.mid, display: "block" }}>
      {label}
      {textarea ? <textarea rows={3} {...common} style={{ ...common.style, resize: "vertical" }} /> : <input type={type} {...common} />}
    </label>
  );
}
const thS = (t, w) => ({ position: "sticky", top: 0, background: t.head, padding: "9px 12px", textAlign: "left", fontSize: 10.5, fontWeight: 800, color: t.mid, whiteSpace: "nowrap", borderBottom: `1px solid ${t.line}`, width: w });
const tdS = (t) => ({ padding: "9px 12px", borderBottom: `1px solid ${t.line}` });
