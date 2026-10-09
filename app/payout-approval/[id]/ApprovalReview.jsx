"use client";
// Review & keputusan approval (BAST / Notification Letter). Tidak ada aksi otomatis saat halaman dibuka.
import React, { useEffect, useState } from "react";
import supabase from "../../../lib/supabase";
import { DOC_TYPES, fmtSize, approvalApi, refDisplay } from "../../../lib/payoutPartnerDocs";

const TEAL = "#32BCAD", MAGENTA = "#C6168D";
const MONO = "'SF Mono','Fira Code','DM Mono',monospace";
const CSS = `
:root{--bg:#F0F0F3;--surf:#fff;--surf2:#F2F2F6;--ink:#111113;--ink2:#2A2A30;--muted:#52525B;--line:rgba(0,0,0,.09);--bad:#ED1C24;--badBg:rgba(237,28,36,.08);--good:#1d8078;--goodBg:rgba(50,188,173,.12);--warn:#8a6a00;--warnBg:rgba(255,203,5,.14)}
@media (prefers-color-scheme:dark){:root{--bg:#0D0D0E;--surf:#13161F;--surf2:#1A1D28;--ink:#F1F5F9;--ink2:#CBD5E1;--muted:#94A3B8;--line:#242937;--bad:#FF5A5F;--badBg:rgba(255,90,95,.13);--good:#7ee8e0;--goodBg:rgba(50,188,173,.14);--warn:#ffe066;--warnBg:rgba(255,203,5,.13)}}
body{background:var(--bg)}
.pa-btn:focus-visible,.pa-in:focus-visible{outline:2px solid ${TEAL};outline-offset:2px}
`;
const label = (k) => DOC_TYPES.find((d) => d.key === k)?.label || k;
const fmt = (d) => (d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const STATUS = {
  pending: ["Pending approval", "var(--warn)", "var(--warnBg)"], approved: ["Approved", "var(--good)", "var(--goodBg)"],
  rejected: ["Rejected", "var(--bad)", "var(--badBg)"], cancelled: ["Cancelled", "var(--muted)", "var(--surf2)"],
  revoked: ["Approval revoked", "var(--bad)", "var(--badBg)"], expired: ["Expired", "var(--muted)", "var(--surf2)"],
};

function Card({ children }) {
  return <div style={{ background: "var(--surf)", border: "1px solid var(--line)", borderRadius: 18, padding: "22px 24px", boxShadow: "0 4px 16px rgba(0,0,0,.06)" }}>{children}</div>;
}

export default function ApprovalReview({ id }) {
  const [state, setState] = useState({ phase: "loading" }); // loading | login | error | ready
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data: { session } = {} }) => {
      if (!alive) return;
      if (!session) { setState({ phase: "login" }); return; }
      try {
        const res = await approvalApi("view", { id });
        if (alive) setState({ phase: "ready", ...res, email: session.user?.email });
      } catch (e) { if (alive) setState({ phase: "error", error: e.message, email: session.user?.email }); }
    });
    return () => { alive = false; };
  }, [id]);

  const decide = async (decision) => {
    if (decision === "rejected" && reason.trim().length < 3) { setMsg({ ok: false, text: "Please enter a reason for rejecting this request." }); return; }
    if (!window.confirm(decision === "approved" ? "Approve these documents? This decision will be recorded." : "Reject these documents? This decision will be recorded.")) return;
    setBusy(decision); setMsg(null);
    try {
      const { row } = await approvalApi("decide", { id, decision, note: reason.trim() });
      setState((s) => ({ ...s, row, canDecide: false }));
      setMsg({ ok: true, text: decision === "approved" ? "Thank you — the documents have been approved." : "Thank you — the documents have been rejected and SPM can see your reason." });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    setBusy("");
  };

  const loginHref = `/sandra/login?redirect=${encodeURIComponent(`/payout-approval/${id}`)}`;
  const btn = (bg, fg, disabled) => ({ fontFamily: "inherit", fontSize: 14, fontWeight: 700, padding: "11px 20px", borderRadius: 11, border: `1px solid ${bg}`, background: bg, color: fg, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .55 : 1 });

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif", padding: "32px 16px" }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: MAGENTA, fontWeight: 700 }}>SandraHub · Payout Tracker</div>
        <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-.02em" }}>Document Approval</h1>

        {state.phase === "loading" && <Card><div style={{ color: "var(--muted)" }}>Loading request…</div></Card>}

        {state.phase === "login" && (
          <Card>
            <h2 style={{ margin: "0 0 6px", fontSize: 17 }}>Sign in required</h2>
            <p style={{ margin: "0 0 14px", color: "var(--muted)", lineHeight: 1.55, fontSize: 14 }}>
              Please sign in to SandraHub with the email address this request was sent to. After signing in, open the link from the email again to review the documents.
              If you do not have a SandraHub account, please contact SPM to request access.
            </p>
            <a className="pa-btn" href={loginHref} style={{ ...btn(TEAL, "#fff"), display: "inline-block", textDecoration: "none" }}>Sign in to SandraHub</a>
          </Card>
        )}

        {state.phase === "error" && (
          <Card>
            <h2 style={{ margin: "0 0 6px", fontSize: 17 }}>Unable to open this request</h2>
            <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.55, fontSize: 14 }}>{state.error}</p>
            {state.email && <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 13 }}>Signed in as <b>{state.email}</b>. If this request was sent to a different address, sign out and sign in with that account.</p>}
          </Card>
        )}

        {state.phase === "ready" && (() => {
          const r = state.row;
          const [sl, sc, sb] = STATUS[r.status] || [r.status, "var(--muted)", "var(--surf2)"];
          return (
            <>
              <Card>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".1em" }}>{label(r.doc_type)}</div>
                    <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, marginTop: 4 }}>{refDisplay(r.ref_id)}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink2)", marginTop: 4 }}>{r.owner_name || r.owner_key}</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 99, color: sc, background: sb, border: `1px solid ${sc}` }}>{sl}</span>
                </div>
                <table style={{ marginTop: 14, fontSize: 13.5, borderCollapse: "collapse", width: "100%" }}>
                  <tbody>
                    {[
                      ["Project", r.ref_title], ["Amount", r.amount_text], ["Approver", r.approver_email],
                      ["Requested by", `${r.requested_email || "SPM"} · ${fmt(r.requested_at)}`], ["Respond by", fmt(r.expires_at)],
                      ...(r.decided_at ? [["Decision", `${r.status === "approved" ? "Approved" : "Rejected"} by ${r.decided_email} · ${fmt(r.decided_at)}`]] : []),
                      ...(r.decision_note ? [["Comment", r.decision_note]] : []),
                    ].filter(([, v]) => v).map(([k, v]) => (
                      <tr key={k}><td style={{ padding: "4px 0", color: "var(--muted)", width: 130, verticalAlign: "top" }}>{k}</td><td style={{ padding: "4px 0", fontWeight: 600 }}>{v}</td></tr>
                    ))}
                  </tbody>
                </table>
                {r.note && <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--surf2)", borderLeft: `3px solid ${TEAL}`, borderRadius: 8, fontSize: 13.5 }}><b>Note from SPM:</b> {r.note}</div>}
              </Card>

              <Card>
                <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>Documents ({state.files.length})</div>
                {state.files.map((f) => (
                  <div key={f.doc_id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 0", borderTop: "1px solid var(--line)", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, wordBreak: "break-word" }}>{f.file_name}</div>
                      <div style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--muted)" }} title={`SHA-256 ${f.sha256}`}>{fmtSize(f.size || 0)} · SHA-256 {String(f.sha256).slice(0, 12)}…</div>
                    </div>
                    {f.url && <a className="pa-btn" href={f.url} target="_blank" rel="noopener noreferrer" style={{ ...btn("var(--surf2)", "var(--ink)"), padding: "7px 13px", fontSize: 13, textDecoration: "none", border: "1px solid var(--line)" }}>Open</a>}
                    {f.download_url && <a className="pa-btn" href={f.download_url} style={{ ...btn("var(--surf2)", "var(--ink)"), padding: "7px 13px", fontSize: 13, textDecoration: "none", border: "1px solid var(--line)" }}>Download</a>}
                  </div>
                ))}
              </Card>

              {msg && <div role="status" style={{ padding: "12px 14px", borderRadius: 12, fontSize: 14, fontWeight: 600, color: msg.ok ? "var(--good)" : "var(--bad)", background: msg.ok ? "var(--goodBg)" : "var(--badBg)" }}>{msg.text}</div>}

              {state.canDecide ? (
                <Card>
                  <h2 style={{ margin: "0 0 6px", fontSize: 16 }}>Your decision</h2>
                  <p style={{ margin: "0 0 10px", color: "var(--muted)", fontSize: 13.5 }}>Please review every document before deciding. A comment is required when rejecting.</p>
                  <textarea className="pa-in" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} placeholder="Comment (required for rejection)"
                    style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 14, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--surf2)", color: "var(--ink)", resize: "vertical" }} />
                  <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                    <button className="pa-btn" style={btn(TEAL, "#fff", !!busy)} disabled={!!busy} onClick={() => decide("approved")}>{busy === "approved" ? "Approving…" : "Approve"}</button>
                    <button className="pa-btn" style={btn("var(--badBg)", "var(--bad)", !!busy)} disabled={!!busy} onClick={() => decide("rejected")}>{busy === "rejected" ? "Rejecting…" : "Reject"}</button>
                  </div>
                </Card>
              ) : (
                !msg && r.status === "pending" && !state.isApprover && (
                  <Card><p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>This request is assigned to another approver ({r.approver_email}). You are signed in as {state.viewerEmail}.</p></Card>
                )
              )}
            </>
          );
        })()}
      </div>
    </main>
  );
}
