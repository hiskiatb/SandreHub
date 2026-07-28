"use client";
/**
 * SDP_Approval.jsx — Antrean approval TERPADU untuk semua aksi CSE/RSE.
 *
 * Mencakup 4 jenis submission:
 *   • Registrasi  (sdp_registration)   • Terminate  (sdp_termination)
 *   • Rebordering (sdp_rebordering)     • Edit Data  (sdp_edit_requests)
 *
 * Alur status: submitted (CSE) → approved (BSM) → validated (SPM) | rejected(+alasan)
 * (Edit Data memakai RPC sdp_approve_edit / sdp_reject_edit yang menerapkan
 *  perubahan ke sdp_monthly_data; status PENDING/APPROVED/REJECTED dipetakan.)
 *
 * Dua mode (otomatis dari role):
 *   • Approver (bsm / spm_sumatera / pic_region): antrean "Menunggu approval"
 *     dengan Setujui / Tolak, ter-scope (BSM: branch × brand; PIC: region;
 *     SPM: seluruh Sumatera). Plus daftar yang sudah diproses.
 *   • Pemilik (cse_rse): daftar submission SENDIRI (semua jenis) + status-nya.
 *
 * Catatan RLS: approve/tolak Registrasi/Terminate/Rebordering = UPDATE baris
 * milik orang lain → butuh policy (lihat docs/sql/sdp_approval_rls.sql). Edit
 * Data lewat RPC (izin ditangani fungsi).
 *
 * Props: { supabase, theme = "dark", profile, onExit }
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, X, Loader2, RefreshCw, ShieldCheck, Clock, AlertCircle, Inbox } from "lucide-react";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const mk = (d) => ({
  card: d ? "#161618" : "#FFFFFF", sub: d ? "#1C1C20" : "#F6F7F9", line: d ? "#2A2A2F" : "#E4E7EC",
  hi: d ? "#F1F1F4" : "#17181C", mid: d ? "#8A8A96" : "#5B5B66", lo: d ? "#5A5A68" : "#98A2B3",
  green: d ? "#30D158" : "#1A9E5A", amber: d ? "#FFB020" : "#B7791F", blue: d ? "#0A84FF" : "#2563EB",
  red: "#E5484D", teal: "#1A9E90",
  sm: d ? "0 1px 3px rgba(0,0,0,.5)" : "0 1px 3px rgba(23,24,28,.06)",
  md: d ? "0 10px 26px rgba(0,0,0,.5)" : "0 10px 26px rgba(23,24,28,.08)",
});

const STAGE = {
  draft:     { label: "Draft",         tone: "lo" },
  submitted: { label: "Menunggu BSM",  tone: "amber" },
  approved:  { label: "Disetujui BSM", tone: "blue" },
  validated: { label: "Tervalidasi",   tone: "green" },
  rejected:  { label: "Ditolak",       tone: "red" },
};
const KIND = {
  registration: { label: "Registrasi",  col: "#1A9E90" },
  termination:  { label: "Terminate",   col: "#E5484D" },
  rebordering:  { label: "Rebordering", col: "#2563EB" },
  edit:         { label: "Edit Data",   col: "#B7791F" },
};
const APPROVER = ["bsm", "spm_sumatera", "pic_region"];
const brandOfCluster = (c) => String(c || "").toUpperCase().startsWith("CS") ? "3ID" : "IM3";
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const editStatus = (raw) => ({ PENDING: "submitted", APPROVED: "approved", REJECTED: "rejected" }[raw] || "submitted");

// Normalisasi tiap baris sumber → item seragam.
function toItem(kind, r) {
  const base = { kind, key: `${kind}:${r.id}`, id: r.id, createdAt: r.created_at };
  if (kind === "registration") return { ...base, code: r.sdp_id_new, name: r.sdp_name || r.partner_company_name || "SDP", sub: `${r.request_type || "Registrasi"} · ${r.partner_company_name || "—"}`, brand: r.submitter_brand || r.brand, branch: r.submitter_branch, region: r.submitter_region, submitter: r.cse_name || r.submitted_by_name, status: r.status || "submitted", remarks: r.remarks, table: "sdp_registration" };
  if (kind === "termination") return { ...base, code: r.sdp_code, name: r.sdp_name || "SDP", sub: "Terminasi SDP", brand: r.submitter_brand, branch: r.submitter_branch, region: r.submitter_region, submitter: r.submitted_by_name, status: r.status || "submitted", remarks: r.remarks, table: "sdp_termination" };
  if (kind === "rebordering") return { ...base, code: r.existing_sdp_id, name: r.existing_sdp_name || "SDP", sub: `Rebordering${r.rebordering_action ? ` · ${r.rebordering_action}` : ""}`, brand: r.submitter_brand, branch: r.submitter_branch, region: r.submitter_region, submitter: r.submitted_by_name, status: r.status || "submitted", remarks: r.remarks, table: "sdp_rebordering" };
  const n = r.field_changes ? (Array.isArray(r.field_changes) ? r.field_changes.length : Object.keys(r.field_changes || {}).length) : 0;
  return { ...base, requestId: r.id, code: r.sdp_id, name: r.sdp_id, sub: `Edit data${n ? ` · ${n} kolom` : ""}${r.cse_note ? ` · ${r.cse_note}` : ""}`, brand: null, branch: null, region: null, submitter: r.requested_by_name, status: editStatus(r.status), remarks: r.bsm_note, table: null };
}

export default function SDP_Approval({ supabase, theme = "dark", profile, onExit }) {
  const d = theme === "dark"; const t = mk(d);
  const role = profile?.role || "";
  const isApprover = APPROVER.includes(role);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [items, setItems] = useState([]);
  const [busyKey, setBusyKey] = useState(null);
  const [rejectKey, setRejectKey] = useState(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState(null);

  const toneCol = (tone) => ({ green: t.green, amber: t.amber, blue: t.blue, red: t.red, lo: t.lo }[tone] || t.mid);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id;

      // Scope sdp_id untuk edit-request (edit tak punya kolom branch/brand).
      let scopedIds = null;
      if (isApprover && role !== "spm_sumatera") {
        let mq = supabase.from("sdp_master").select("sdp_id, cluster").limit(20000);
        if (role === "bsm" && profile?.bsm_branch) mq = mq.eq("branch", profile.bsm_branch);
        else if (role === "pic_region" && profile?.region) mq = mq.eq("region", profile.region);
        const { data: mrows } = await mq;
        let f = mrows || [];
        if (role === "bsm" && profile?.bsm_brand) f = f.filter((r) => brandOfCluster(r.cluster) === profile.bsm_brand);
        scopedIds = [...new Set(f.map((r) => r.sdp_id))];
      }

      // Scope helper untuk 3 tabel submission (punya kolom submitter_*).
      const scoped = (q) => {
        if (!isApprover) return q.eq("submitted_by", uid || "__none__");
        if (role === "bsm") { if (profile?.bsm_branch) q = q.eq("submitter_branch", profile.bsm_branch); if (profile?.bsm_brand) q = q.eq("submitter_brand", profile.bsm_brand); return q; }
        if (role === "pic_region" && profile?.region) return q.eq("submitter_region", profile.region);
        return q; // spm: semua
      };

      const regQ = scoped(supabase.from("sdp_registration").select("id, sdp_id_new, sdp_name, partner_company_name, brand, request_type, submitter_branch, submitter_brand, submitter_region, submitted_by_name, cse_name, status, remarks, created_at")).order("created_at", { ascending: false }).limit(400);
      const termQ = scoped(supabase.from("sdp_termination").select("id, sdp_code, sdp_name, submitter_branch, submitter_brand, submitter_region, submitted_by_name, status, remarks, created_at")).order("created_at", { ascending: false }).limit(400);
      const rebQ = scoped(supabase.from("sdp_rebordering").select("id, existing_sdp_id, existing_sdp_name, rebordering_action, submitter_branch, submitter_brand, submitter_region, submitted_by_name, status, remarks, created_at")).order("created_at", { ascending: false }).limit(400);

      let editQ = supabase.from("sdp_edit_requests").select("id, sdp_id, status, cse_note, bsm_note, field_changes, requested_by_name, created_at").order("created_at", { ascending: false }).limit(400);
      if (!isApprover) editQ = editQ.eq("requested_by", uid || "__none__");
      else if (scopedIds) editQ = editQ.in("sdp_id", scopedIds.length ? scopedIds : ["__none__"]);

      const [reg, term, reb, edit] = await Promise.all([regQ, termQ, rebQ, editQ]);
      const firstErr = reg.error || term.error || reb.error || edit.error;
      if (firstErr) throw firstErr;

      const all = [
        ...(reg.data || []).map((r) => toItem("registration", r)),
        ...(term.data || []).map((r) => toItem("termination", r)),
        ...(reb.data || []).map((r) => toItem("rebordering", r)),
        ...(edit.data || []).map((r) => toItem("edit", r)),
      ].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      setItems(all);
    } catch (e) { setErr(e?.message || String(e)); setItems([]); }
    finally { setLoading(false); }
  }, [supabase, role, isApprover, profile?.bsm_branch, profile?.bsm_brand, profile?.region]);
  useEffect(() => { load(); }, [load]);

  const act = async (it, next, why) => {
    setBusyKey(it.key); setMsg(null);
    try {
      if (it.kind === "edit") {
        const fn = next === "approved" ? "sdp_approve_edit" : "sdp_reject_edit";
        const { error } = await supabase.rpc(fn, { p_request_id: it.requestId, p_note: why || null });
        if (error) throw error;
      } else {
        const upd = { status: next }; if (why != null) upd.remarks = why;
        const { error } = await supabase.from(it.table).update(upd).eq("id", it.id);
        if (error) throw error;
      }
      setRejectKey(null); setReason("");
      setMsg({ type: "ok", text: `${next === "approved" ? "Disetujui" : "Ditolak"}: ${KIND[it.kind].label} — ${it.code || it.name}.` });
      await load();
    } catch (e) {
      const m = String(e?.message || e);
      setMsg({ type: "err", text: "Gagal: " + m + (/policy|permission|row-level/i.test(m) ? " — policy RLS mungkin belum mengizinkan approve (lihat docs/sql/sdp_approval_rls.sql)." : "") });
      setBusyKey(null);
    }
  };

  const pending = useMemo(() => items.filter((r) => r.status === "submitted"), [items]);
  const processed = useMemo(() => items.filter((r) => r.status !== "submitted"), [items]);
  // Untuk CSE: branch & brand atasan (BSM) tempat approval diteruskan.
  const cseScope = useMemo(() => {
    if (isApprover) return null;
    const branches = [...new Set(items.map((i) => i.branch).filter(Boolean))].sort();
    const brands = [...new Set(items.map((i) => i.brand).filter(Boolean))].sort();
    return (branches.length || brands.length) ? { branches, brands } : null;
  }, [items, isApprover]);

  const Badge = ({ status }) => {
    const s = STAGE[status] || STAGE.submitted; const c = toneCol(s.tone);
    return <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 800, color: c, background: `${c}1A`, border: `1px solid ${c}33`, whiteSpace: "nowrap" }}>{s.label}</span>;
  };
  const KindTag = ({ kind }) => {
    const k = KIND[kind]; return <span style={{ fontSize: 10.5, fontWeight: 800, color: k.col, background: `${k.col}18`, border: `1px solid ${k.col}33`, borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: 0.3 }}>{k.label}</span>;
  };

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <button onClick={onExit} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 14 }}>
        <ArrowLeft size={15} /> Kembali
      </button>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.4, display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldCheck size={19} color={t.mid} /> {isApprover ? "Approval SDP" : "Status Approval"}
          </div>
          <div style={{ fontSize: 12.5, color: t.mid, marginTop: 3 }}>
            {isApprover
              ? <>Setujui / tolak semua submission CSE — Registrasi, Terminate, Rebordering & Edit Data{role === "bsm" ? ` (branch ${profile?.bsm_branch || "Anda"} · ${profile?.bsm_brand || ""})` : role === "pic_region" ? ` (region ${profile?.region || "Anda"})` : ""}.</>
              : <>Pantau status persetujuan semua submission Anda (registrasi, terminate, rebordering, edit data).{cseScope ? <> Diteruskan ke <b>BSM {cseScope.branches.join(", ") || "—"}</b> · <b>{cseScope.brands.join("/") || "—"}</b>.</> : ""}</>}
          </div>
        </div>
        <button onClick={load} title="Muat ulang" style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${t.line}`, background: t.card, color: t.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><RefreshCw size={15} /></button>
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", padding: "9px 12px", borderRadius: 10, background: t.sub, border: `1px solid ${t.line}`, marginBottom: 16, fontSize: 12, color: t.mid }}>
        <Badge status="submitted" /><span style={{ opacity: .6 }}>→</span>
        <Badge status="approved" /><span style={{ opacity: .6 }}>→</span>
        <Badge status="validated" />
        <span style={{ opacity: .6, marginLeft: 4 }}>· jika perlu:</span><Badge status="rejected" />
      </div>

      {msg && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 600,
          background: msg.type === "ok" ? `${t.green}18` : `${t.red}14`, color: msg.type === "ok" ? t.green : t.red, border: `1px solid ${(msg.type === "ok" ? t.green : t.red)}44` }}>
          {msg.type === "ok" ? <Check size={15} /> : <AlertCircle size={15} />} {msg.text}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 48, textAlign: "center", color: t.mid }}><Loader2 size={22} className="sdpspin" /><div style={{ marginTop: 8, fontSize: 13 }}>Memuat…</div><style>{`.sdpspin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style></div>
      ) : err ? (
        <div style={{ padding: "28px 20px", textAlign: "center", background: t.card, borderRadius: 14, border: `1px solid ${t.line}`, color: t.mid, fontSize: 13 }}>Gagal memuat: {err}</div>
      ) : (
        <>
          {isApprover && (
            <Section t={t} icon={<Clock size={14} color={t.amber} />} title={`Menunggu approval (${pending.length})`}>
              {pending.length === 0
                ? <Empty t={t} text="Tidak ada submission yang menunggu." />
                : pending.map((it) => (
                  <div key={it.key} style={{ padding: "12px 0", borderTop: `1px solid ${t.line}` }}>
                    <RowInfo t={t} it={it} Badge={Badge} KindTag={KindTag} showSubmitter />
                    {rejectKey === it.key ? (
                      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Alasan penolakan (wajib)…"
                          style={{ flex: 1, minWidth: 220, boxSizing: "border-box", padding: "8px 10px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.sub, color: t.hi, fontSize: 13, fontFamily: FF, resize: "vertical" }} />
                        <button disabled={!reason.trim() || busyKey === it.key} onClick={() => act(it, "rejected", reason.trim())}
                          style={{ padding: "9px 14px", borderRadius: 9, border: "none", cursor: reason.trim() ? "pointer" : "default", background: t.red, color: "#fff", fontFamily: FF, fontSize: 13, fontWeight: 700, opacity: reason.trim() ? 1 : .5 }}>Kirim penolakan</button>
                        <button onClick={() => { setRejectKey(null); setReason(""); }} style={{ padding: "9px 12px", borderRadius: 9, border: `1px solid ${t.line}`, cursor: "pointer", background: t.card, color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 700 }}>Batal</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button disabled={busyKey === it.key} onClick={() => act(it, "approved", null)}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: "none", cursor: "pointer", background: t.green, color: "#fff", fontFamily: FF, fontSize: 13, fontWeight: 700 }}>
                          {busyKey === it.key ? <Loader2 size={14} className="sdpspin" /> : <Check size={14} />} Setujui
                        </button>
                        <button disabled={busyKey === it.key} onClick={() => { setRejectKey(it.key); setReason(""); }}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: `1px solid ${t.red}55`, cursor: "pointer", background: "transparent", color: t.red, fontFamily: FF, fontSize: 13, fontWeight: 700 }}>
                          <X size={14} /> Tolak
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </Section>
          )}

          <Section t={t} icon={<Inbox size={14} color={t.mid} />} title={isApprover ? `Sudah diproses (${processed.length})` : `Submission Anda (${items.length})`}>
            {(isApprover ? processed : items).length === 0
              ? <Empty t={t} text={isApprover ? "Belum ada yang diproses." : "Anda belum mengirim submission apa pun."} />
              : (isApprover ? processed : items).map((it) => (
                <div key={it.key} style={{ padding: "12px 0", borderTop: `1px solid ${t.line}` }}>
                  <RowInfo t={t} it={it} Badge={Badge} KindTag={KindTag} showSubmitter={isApprover} />
                  {it.status === "rejected" && it.remarks && (
                    <div style={{ marginTop: 8, padding: "8px 11px", borderRadius: 9, background: `${t.red}12`, border: `1px solid ${t.red}30`, fontSize: 12.5, color: t.hi }}>
                      <b style={{ color: t.red }}>Alasan ditolak:</b> {it.remarks}
                    </div>
                  )}
                </div>
              ))}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ t, icon, title, children }) {
  return (
    <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, boxShadow: t.sm, padding: "6px 16px 14px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: t.mid, padding: "14px 0 4px" }}>{icon} {title}</div>
      {children}
    </div>
  );
}
function Empty({ t, text }) { return <div style={{ fontSize: 13, color: t.mid, padding: "16px 0 8px" }}>{text}</div>; }

function RowInfo({ t, it, Badge, KindTag, showSubmitter }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <KindTag kind={it.kind} />
          {it.code && <span style={{ fontFamily: "monospace", fontSize: 12.5, color: t.mid }}>{it.code}</span>}
          <span style={{ fontSize: 14, fontWeight: 800, color: t.hi }}>{it.name}</span>
          {it.brand && <span style={{ fontSize: 11, fontWeight: 700, color: t.mid, background: t.sub, borderRadius: 6, padding: "2px 7px" }}>{it.brand}</span>}
        </div>
        <div style={{ fontSize: 12, color: t.mid, marginTop: 3 }}>
          {it.sub}
          {showSubmitter && it.submitter ? ` · oleh ${it.submitter}` : ""}
          {it.branch ? ` · ${it.branch}` : ""} · {fmtDate(it.createdAt)}
        </div>
      </div>
      <Badge status={it.status} />
    </div>
  );
}
