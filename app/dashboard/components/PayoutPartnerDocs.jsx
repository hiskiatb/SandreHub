"use client";
// Dokumen payout per PO (nanti per Invoice ID), Partner & Agency Prepaid — 4 slot:
//   1. Invoicing  2. BAST  3. Surat Pemberitahuan  4. Faktur Pajak
//  • finance_mpx  : upload/hapus untuk PO partner sendiri
//  • agency       : upload/hapus untuk PO agency sendiri (RLS siap; belum ada UI di portal agency)
//  • spm_sumatera : lihat semua PO, upload atas nama partner/agency, satu-satunya yang bisa merge & download
//  • IOH          : lihat & buka file saja
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import {
  DOC_TYPES, DOC_REF_LABEL, ACCEPT_ATTR, MAX_FILE_BYTES, statKey, ownerLabel, doneCount, fmtSize, fileKind,
  canViewAll, canViewPartner, canWritePartner, canMerge, canManageApprovals,
  fetchDocStats, listRefDocs, uploadSlot, deleteDocs, signedUrl,
  downloadMergedPdf, downloadMergedZip, downloadDoc, downloadDocsZip, refZipName, friendlyError, uploaderLabel,
  validateFile, partnerKey,
  APPROVAL_DOC_TYPES, APPROVAL_ENABLED, approvalKey, approvalStatus, fetchApprovals, approvalApi,
  isDraftRef, refDisplay, isPaymentRef, parsePaymentRef, fetchDraftDocs, isSpmSigned, spmSignedName,
} from "../../../lib/payoutPartnerDocs";
import { fetchLettersIndex, readJsonFile } from "../../../lib/payoutPartnerLetters";
// Bulk upload BAST & Surat bertanda tangan (komponen Partner Letters) — dimuat saat dibuka (hindari import melingkar)
const BulkSignedModal = dynamic(() => import("./PayoutPartnerLetters").then((m) => m.BulkSignedModal), { ssr: false });
import { readOwnerSig, writeOwnerSig, isOwnerSigned, ownerSignedName, stampOwnerSignature, fetchDocBytes, imageToDataUrl } from "../../../lib/payoutPartnerSign";

const TEAL = "#32BCAD", TEAL_D = "#27a093", MAGENTA = "#C6168D";
const MONO = "'SF Mono','Fira Code','DM Mono',monospace";
const N = DOC_TYPES.length;
const PAGE_SIZES = [25, 50, 100];

// ── util ───────────────────────────────────────────────────────────────────
const fmtDT = (iso) => iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtD  = (iso) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "";
const nColor = (n, t) => (n === N ? TEAL : n > 0 ? t.warn : t.bad);
const nInk   = (n, t) => (n === N ? (t.goodDark || TEAL_D) : n > 0 ? (t.warnDark || "#8a6a00") : t.bad);
const statusOf = (n) => (n === N ? "complete" : n > 0 ? "partial" : "none");
const errMsg = (e) => friendlyError(e);

// CSS sekali: animasi, skeleton, focus ring
let _cssDone = false;
function useDocsCss() {
  useEffect(() => {
    if (_cssDone || typeof document === "undefined") return;
    const el = document.createElement("style");
    el.id = "__ppd_css__";
    el.textContent = [
      "@keyframes ppd_in{from{transform:translateX(100%)}to{transform:translateX(0)}}",
      "@keyframes ppd_fade{from{opacity:0}to{opacity:1}}",
      "@keyframes ppd_shim{0%{background-position:-200px 0}100%{background-position:calc(200px + 100%) 0}}",
      "@keyframes ppd_bar{0%{left:-40%}100%{left:100%}}",
      "@keyframes ppd_toast{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}",
      ".ppd-f:focus-visible{outline:2px solid #32BCAD!important;outline-offset:2px;border-radius:8px}",
      ".ppd-row:focus-visible{outline:2px solid #32BCAD;outline-offset:-2px}",
      "@media (prefers-reduced-motion:reduce){.ppd-anim{animation:none!important}}",
      "@media (max-width:420px){.ppd-hide-xs{display:none}}",
      ".ppd-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}",
      ".ppd-gen-body{display:flex;flex:1;min-height:0}.ppd-gen-table{flex:1;min-width:0;overflow:auto}.ppd-gen-prev{width:46%;min-width:420px;max-width:640px;border-left:1px solid var(--ppd-line);display:flex;flex-direction:column;min-height:0;overflow:hidden}",
      "@media (max-width:1100px){.ppd-gen-body{flex-direction:column;overflow:auto}.ppd-gen-table{flex:none;max-height:42vh}.ppd-gen-prev{width:auto;min-width:0;max-width:none;border-left:0;border-top:1px solid var(--ppd-line);min-height:70vh}}",
      ".ppd-gen-row{cursor:pointer}.ppd-gen-row:hover td{filter:brightness(0.98)}",
      ".ppd-chip:hover{transform:translateY(-1px);box-shadow:0 2px 6px rgba(50,188,173,.35);border-style:solid!important;border-color:#32BCAD!important}",
      ".ppd-act:not(:disabled):hover{filter:brightness(1.06);box-shadow:0 2px 8px rgba(50,188,173,.35)}",
      ".ppd-act-o:not(:disabled):hover{border-color:#32BCAD!important;color:#27a093!important}",
    ].join("");
    document.head.appendChild(el);
    _cssDone = true;
  }, []);
}

// Toast imperatif (di atas drawer, tidak bergantung state komponen)
function toast(t, msg, type = "ok") {
  if (typeof document === "undefined") return;
  let host = document.getElementById("__ppd_toasts__");
  if (!host) {
    host = document.createElement("div");
    host.id = "__ppd_toasts__";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    Object.assign(host.style, { position: "fixed", bottom: "20px", right: "16px", zIndex: "10050", display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end", pointerEvents: "none", maxWidth: "calc(100vw - 32px)" });
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  const c = type === "err" ? { bg: t.badBg, bd: t.bad, ink: t.bad } : type === "info" ? { bg: t.infoBg, bd: t.info, ink: t.info } : { bg: t.goodBg, bd: TEAL, ink: t.goodDark || TEAL_D };
  Object.assign(el.style, {
    background: t.surf, backgroundImage: `linear-gradient(${c.bg},${c.bg})`, color: c.ink, border: `1px solid ${c.bd}`,
    borderRadius: "12px", padding: "11px 15px", fontSize: "12.5px", fontWeight: "600", boxShadow: t.shadow2,
    maxWidth: "360px", animation: "ppd_toast .2s ease-out", fontFamily: "inherit", lineHeight: "1.4",
  });
  el.textContent = (type === "err" ? "⚠ " : type === "info" ? "ℹ " : "✓ ") + msg;
  host.appendChild(el);
  setTimeout(() => { el.style.transition = "opacity .25s"; el.style.opacity = "0"; }, 3800);
  setTimeout(() => el.remove(), 4100);
}

// ── data ───────────────────────────────────────────────────────────────────
// Ringkasan dokumen semua PO (1 query untuk seluruh tab + kolom Raw Data)
export function usePartnerDocStats(profile) {
  const enabled = canViewAll(profile) || profile?.role === "finance_mpx" || profile?.role === "agency";
  const [state, setState] = useState({ byRef: {}, loaded: false, error: "" });
  // Approval hanya untuk admin SPM / admin internal Indosat — partner tidak pernah memuat data approval
  const apprAdmin = APPROVAL_ENABLED && canManageApprovals(profile);
  const [appr, setAppr] = useState({ available: apprAdmin, byKey: {} });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchDocStats()
      .then((byRef) => { if (alive) setState({ byRef, loaded: true, error: "" }); })
      .catch((e) => { if (alive) setState((s) => ({ ...s, loaded: true, error: errMsg(e) })); });
    // approval (BAST & Notification Letter); available=false kalau migration 20261008 belum jalan / fitur dimatikan
    if (apprAdmin) {
      fetchApprovals()
        .then((a) => { if (alive) setAppr(a); })
        .catch(() => { if (alive) setAppr({ available: false, byKey: {} }); });
    }
    return () => { alive = false; };
  }, [enabled, tick, apprAdmin]);
  const refresh = useCallback(() => setTick((x) => x + 1), []);
  return {
    enabled, ...state, refresh, profile, canMerge: canMerge(profile), canManageApprovals: canManageApprovals(profile),
    approvalsAvailable: appr.available, approvals: appr.byKey,
  };
}

// ── atom UI ────────────────────────────────────────────────────────────────
function Ring({ n, t, size = 26, label = true, total = N }) {
  const r = size / 2 - 3, c = 2 * Math.PI * r;
  const col = n >= total ? TEAL : n > 0 ? t.warn : t.bad;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }} aria-label={`${n} of ${total} documents`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={t.surf3} strokeWidth="3.5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth="3.5" strokeLinecap="round"
          strokeDasharray={`${(n / total) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      {label && <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: n >= total ? (t.goodDark || TEAL_D) : n > 0 ? (t.warnDark || "#8a6a00") : t.bad }}>{n}/{total}</span>}
    </span>
  );
}

// ── Approval UI helpers ────────────────────────────────────────────────────
const APPR = {
  pending:   { label: "Pending",  long: "Pending approval",  tone: "warn" },
  approved:  { label: "Approved", long: "Approved — locked", tone: "good" },
  rejected:  { label: "Rejected", long: "Rejected",          tone: "bad"  },
  cancelled: { label: "Cancelled", long: "Request cancelled", tone: "muted" },
  revoked:   { label: "Revoked",  long: "Approval revoked",  tone: "bad"  },
  expired:   { label: "Expired",  long: "Request expired",   tone: "muted" },
};
const apprColors = (tone, t) => tone === "good" ? [t.goodDark || TEAL_D, t.goodBg, t.goodBd]
  : tone === "warn" ? [t.warnDark || t.warn, t.warnBg, t.warnBd]
  : tone === "bad" ? [t.bad, t.badBg, t.badBd] : [t.muted, t.surf2, t.line2];

function ApprovalBadge({ status, t, long = false }) {
  const m = APPR[status];
  if (!m) return null;
  const [ink, bg, bd] = apprColors(m.tone, t);
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 6, color: ink, background: bg, border: `1px solid ${bd}`, whiteSpace: "nowrap" }}>
    {status === "approved" ? "🔒 " : ""}{long ? m.long : m.label}
  </span>;
}

const APPROVER_KEY = "ppd_approver_email";
const readApprover = () => { try { return localStorage.getItem(APPROVER_KEY) || ""; } catch { return ""; } };
const saveApprover = (v) => { try { localStorage.setItem(APPROVER_KEY, v); } catch { /* ignore */ } };

// Chip status per jenis dokumen. Dengan onClick → tombol yang membuka drawer di slot itu.
function DocChip({ dt, ty, t, onClick, canWrite, appr }) {
  const ok = ty?.n > 0;
  const am = APPR[appr];
  const tip0 = ok
    ? `${dt.label} · ${ty.n} file(s) · last updated ${fmtDT(ty.lastAt)} — click to view`
    : `${dt.label} · not uploaded${canWrite ? " — click to upload" : ""}`;
  const tip = am ? `${tip0} · Approval: ${am.long}` : tip0;
  const style = {
    display: "inline-flex", alignItems: "center", gap: 3, fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: "0.02em",
    padding: "3px 8px", borderRadius: 99, whiteSpace: "nowrap", transition: "transform .1s, box-shadow .15s, background .15s",
    background: ok ? TEAL : "transparent", color: ok ? "#fff" : t.muted,
    border: ok ? `1px solid ${TEAL}` : `1px dashed ${t.line2}`,
  };
  const dot = am ? apprColors(am.tone, t)[0] : null;
  const content = <><span aria-hidden="true">{ok ? "✓" : "+"}</span>{dt.short}{dot && <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 99, background: appr === "approved" ? "#fff" : dot, border: `1.5px solid ${dot}`, marginLeft: 2 }} />}</>;
  if (!onClick) return <span title={tip} aria-label={tip} style={style}>{content}</span>;
  return (
    <button type="button" className="ppd-f ppd-chip" title={tip} aria-label={tip} onClick={onClick}
      style={{ ...style, cursor: "pointer", font: "inherit", fontFamily: MONO, fontSize: 10, fontWeight: 700 }}>{content}</button>
  );
}

function Skel({ w = "100%", h = 12, r = 6, t, style }) {
  return <span className="ppd-anim" style={{ display: "block", width: w, height: h, borderRadius: r, background: `linear-gradient(90deg, ${t.surf3} 0px, ${t.surf2} 80px, ${t.surf3} 160px)`, backgroundSize: "200px 100%", animation: "ppd_shim 1.2s linear infinite", ...style }} />;
}

function IndeterminateBar({ t, pct }) {
  return (
    <div style={{ position: "relative", height: 4, borderRadius: 99, background: t.surf3, overflow: "hidden" }}>
      {pct == null
        ? <div className="ppd-anim" style={{ position: "absolute", top: 0, bottom: 0, width: "40%", borderRadius: 99, background: TEAL, animation: "ppd_bar 1.1s ease-in-out infinite" }} />
        : <div style={{ width: `${pct}%`, height: "100%", background: TEAL, borderRadius: 99, transition: "width .3s" }} />}
    </div>
  );
}

const btnStyle = (t, kind = "outline", disabled = false, sm = false) => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit", fontWeight: 600,
  fontSize: sm ? 11.5 : 12.5, padding: sm ? "5px 10px" : "8px 14px", borderRadius: 10, whiteSpace: "nowrap",
  cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, transition: "background .15s, border-color .15s",
  border: `1px solid ${kind === "primary" ? TEAL : kind === "danger" ? t.bad : kind === "ghost" ? "transparent" : t.line2}`,
  background: kind === "primary" ? TEAL : kind === "danger" ? t.badBg : kind === "ghost" ? "transparent" : t.surf,
  color: kind === "primary" ? "#fff" : kind === "danger" ? t.bad : t.ink,
});

const IcoDownload = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const IcoOpen = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>;
const IcoTrash = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
const IcoUp = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;

function UploaderBadge({ role, t }) {
  const l = uploaderLabel(role);
  if (!l) return null;
  const spm = l === "SPM";
  return (
    <span title={`Uploaded by ${l}`} style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", padding: "1px 6px", borderRadius: 5, textTransform: "uppercase",
      background: spm ? `${MAGENTA}18` : t.infoBg, color: spm ? MAGENTA : t.info, border: `1px solid ${spm ? `${MAGENTA}35` : t.infoBd}` }}>{l}</span>
  );
}

function FileIcon({ name, mime, t }) {
  const k = fileKind(name, mime);
  const pdf = k === "pdf";
  return (
    <span aria-hidden="true" style={{ width: 30, height: 34, borderRadius: 6, flexShrink: 0, display: "inline-flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 4, fontFamily: MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: "0.04em", background: pdf ? t.badBg : t.goodBg, color: pdf ? t.bad : (t.goodDark || TEAL_D), border: `1px solid ${pdf ? t.badBd : t.goodBd}` }}>
      {pdf ? "PDF" : "IMG"}
    </span>
  );
}

// ── Kolom "Dokumen" di Raw Data ────────────────────────────────────────────
export function DocsCell({ refId, partnerName, segment, title, amountText, docs, t }) {
  const [open, setOpen] = useState(false);
  useDocsCss();
  const dash = <span style={{ color: t.muted2, fontFamily: MONO, fontSize: 10.5 }} title={!refId ? `No ${DOC_REF_LABEL}` : undefined}>—</span>;
  if (!docs?.enabled || !refId || !partnerName || !canViewPartner(docs.profile, partnerName, segment)) return dash;
  const stat = docs.byRef[statKey(segment, partnerName, refId)];
  const n = doneCount(stat);
  const tip = DOC_TYPES.map((d) => `${stat?.types?.[d.key]?.n > 0 ? "✓" : "✗"} ${d.label}`).join("\n");
  return (
    <>
      <button className="ppd-f" onClick={(e) => { e.stopPropagation(); setOpen(true); }} title={`${DOC_REF_LABEL} ${refId}\n${tip}`}
        aria-label={`Documents for ${DOC_REF_LABEL} ${refId}: ${n} of ${N}`}
        style={{ border: `1px solid ${t.line}`, background: t.surf, cursor: "pointer", padding: "2px 8px 2px 3px", borderRadius: 99, display: "inline-flex" }}>
        {docs.loaded ? <Ring n={n} t={t} size={18} /> : <Skel w={42} h={14} t={t} />}
      </button>
      {open && <RefDocsDrawer refId={refId} partnerName={partnerName} segment={segment} title={title} amountText={amountText}
        docs={docs} onClose={() => setOpen(false)} t={t} />}
    </>
  );
}

// ── Drawer 4 slot per PO ───────────────────────────────────────────────────
export function RefDocsDrawer({ refId, partnerName, segment, title, amountText, docs, onClose, focusSlot = null, t }) {
  useDocsCss();
  // slot yang di-scroll/fokus (dari chip / tombol Upload / "Upload berikutnya"); n memicu ulang
  const [focus, setFocus] = useState({ key: focusSlot, n: 1 });
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [reload, setReload] = useState(0);
  const [uploading, setUploading] = useState(0);   // jumlah slot yang sedang upload
  const [merge, setMerge] = useState(null);        // { i, total } saat merge
  const [zipping, setZipping] = useState(null);    // { i, total } saat ZIP semua dokumen
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const canWrite = canWritePartner(docs?.profile, partnerName, segment);
  const isSPM = !!docs?.canMerge;
  const busy = uploading > 0 || !!merge || !!zipping;
  const docsRefresh = docs?.refresh;

  useEffect(() => {
    let alive = true;
    listRefDocs(refId, segment, partnerName)
      .then((d) => { if (alive) { setList(d); setLoading(false); setLoadErr(""); } })
      .catch((e) => { if (alive) { setLoadErr(errMsg(e)); setLoading(false); } });
    return () => { alive = false; };
  }, [refId, segment, partnerName, reload]);

  // focus awal, kunci scroll body, kembalikan focus saat tutup
  useEffect(() => {
    const prev = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { document.body.style.overflow = prevOverflow; if (prev && prev.focus) prev.focus(); };
  }, []);

  const tryClose = useCallback(() => {
    if (busy) { toast(t, "Please wait for the upload/merge to finish.", "info"); return; }
    onClose();
  }, [busy, onClose, t]);

  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); tryClose(); return; }
    if (e.key !== "Tab" || !panelRef.current) return;
    const f = panelRef.current.querySelectorAll('button:not([disabled]),[href],input:not([disabled]):not([type="file"]),select,[tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const changed = useCallback(() => { setReload((x) => x + 1); docsRefresh?.(); }, [docsRefresh]);
  // Draft hasil generate hanya punya slot BAST & Notification Letter
  // Draft GEN-* lama: hanya BAST/Surat. Payment ID (PAY-*) menggantikan PO → semua slot (invoice & faktur ikut)
  // Payment ID (PAY-*): 4 slot seperti PO. BAST & Surat dibuat SPM → partner hanya lihat/unduh
  // (+ "Sign as partner (owner)" pada BAST); Invoice & Faktur Pajak diunggah partner.
  // Draft lama (GEN-*): hanya BAST & Surat, read-only untuk partner.
  const SLOTS = isDraftRef(refId) ? DOC_TYPES.filter((d) => APPROVAL_DOC_TYPES.includes(d.key)) : DOC_TYPES;
  const spmOnly = (k) => !docs?.canMerge && (isDraftRef(refId) || (isPaymentRef(refId) && APPROVAL_DOC_TYPES.includes(k)));
  const slotWriteFor = (k) => canWrite && !spmOnly(k);
  const slotWrite = SLOTS.some((d) => slotWriteFor(d.key));
  const present = SLOTS.filter((d) => list.some((x) => x.doc_type === d.key)).length;
  const nextMissing = SLOTS.find((d) => !list.some((x) => x.doc_type === d.key) && (slotWriteFor(d.key) || !canWrite));
  const totalSize = list.reduce((s, d) => s + (Number(d.size_bytes) || 0), 0);

  const onMerge = async () => {
    setMerge({ i: 0, total: list.length });
    try {
      const r = await downloadMergedPdf({
        refId, partnerName, segment, title, amountText, docs: list,
        onProgress: ({ index, total }) => setMerge({ i: index + 1, total }),
      });
      if (r.skipped.length) toast(t, `PDF downloaded; ${r.skipped.length} file(s) were skipped (see cover page).`, "info");
      else toast(t, `PDF for ${refId} downloaded (${present}/${N} documents).`);
    } catch (e) { toast(t, `Merge failed: ${errMsg(e)}`, "err"); }
    setMerge(null);
  };

  const onZipAll = async () => {
    setZipping({ i: 0, total: list.length });
    try {
      const { failed } = await downloadDocsZip(list, refZipName(refId, partnerName, "documents"), {
        byType: true, onProgress: ({ index, total }) => setZipping({ i: index + 1, total }),
      });
      if (failed.length) toast(t, `ZIP downloaded; ${failed.length} file(s) failed: ${failed[0]}`, "err");
      else toast(t, `ZIP with ${list.length} file(s) downloaded.`);
    } catch (e) { toast(t, `Unable to create ZIP: ${errMsg(e)}`, "err"); }
    setZipping(null);
  };

  const roHint = docs?.profile?.role === "finance_mpx" || docs?.profile?.role === "agency"
    ? `This ${DOC_REF_LABEL} does not belong to your ${ownerLabel(segment).toLowerCase()}, so it is view-only.`
    : `View-only access: you can open and download files. Uploads and deletions are handled by the ${ownerLabel(segment).toLowerCase()} that owns this ${DOC_REF_LABEL}, or by SPM.`;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) tryClose(); }} onKeyDown={onKeyDown}
      className="ppd-anim" style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.42)", animation: "ppd_fade .15s ease-out" }}>
      <aside ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="ppd-title"
        className="ppd-anim"
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(560px, 100vw)", display: "flex", flexDirection: "column", background: t.bg || t.surf, color: t.ink, borderLeft: `1px solid ${t.line}`, boxShadow: "-12px 0 40px rgba(0,0,0,0.25)", animation: "ppd_in .22s cubic-bezier(.2,.8,.2,1)", textAlign: "left" }}>
        {/* header */}
        <div style={{ padding: "16px 18px 14px", borderBottom: `1px solid ${t.line}`, background: t.surf, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: MAGENTA, fontWeight: 700 }}>
              {ownerLabel(segment)} Documents · {isPaymentRef(refId) ? "Payment ID" : isDraftRef(refId) ? "Generated draft" : DOC_REF_LABEL}
            </div>
            <div id="ppd-title" style={{ fontSize: 19, fontWeight: 800, marginTop: 3, fontFamily: MONO, letterSpacing: "-0.01em", wordBreak: "break-all" }}>{isDraftRef(refId) ? refDisplay(refId) : refId}</div>
            <div style={{ fontSize: 12.5, color: t.ink2, marginTop: 4, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={partnerName}>{partnerName}</div>
            {title && <div style={{ fontSize: 11.5, color: t.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={title}>Project: {title}</div>}
            {amountText && <div style={{ fontFamily: MONO, fontSize: 12, color: t.ink, marginTop: 3, fontWeight: 700 }}>{amountText}</div>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <button ref={closeRef} className="ppd-f" onClick={tryClose} aria-label="Close panel (Esc)" title="Close (Esc)"
              style={{ ...btnStyle(t, "ghost", false, true), fontSize: 20, lineHeight: 1, padding: "2px 8px", color: t.muted }}>×</button>
            {loading ? <Skel w={56} h={22} t={t} /> : <Ring n={present} total={SLOTS.length} t={t} />}
          </div>
        </div>

        {/* progress per slot (klik = lompat ke slot) */}
        <div style={{ padding: "0 18px 12px", background: t.surf, borderBottom: `1px solid ${t.line}` }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${SLOTS.length},1fr)`, gap: 4 }}>
            {SLOTS.map((d) => {
              const ok = list.some((x) => x.doc_type === d.key);
              return (
                <button key={d.key} className="ppd-f" onClick={() => setFocus((f) => ({ key: d.key, n: f.n + 1 }))} title={`${d.label}: ${ok ? "uploaded" : "missing"}`}
                  style={{ all: "unset", cursor: "pointer", display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ height: 5, borderRadius: 99, background: loading ? t.surf3 : ok ? TEAL : t.surf3 }} />
                  <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: ok ? (t.goodDark || TEAL_D) : t.muted2, textAlign: "center" }}>{ok ? "✓ " : ""}{d.short}</span>
                </button>
              );
            })}
          </div>
          {!loading && slotWrite && nextMissing && (
            <button className="ppd-f" onClick={() => setFocus((f) => ({ key: nextMissing.key, n: f.n + 1 }))}
              style={{ ...btnStyle(t, "primary", false, true), marginTop: 10, width: "100%" }}>
              ⬆ Upload next: {nextMissing.label}
            </button>
          )}
          {!loading && present === SLOTS.length && <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 600, color: t.goodDark || TEAL_D, textAlign: "center" }}>✓ All {SLOTS.length} documents are complete</div>}
        </div>

        {!canWrite && (
          <div role="note" style={{ margin: "12px 18px 0", padding: "9px 12px", borderRadius: 10, fontSize: 12, color: t.info, background: t.infoBg, border: `1px solid ${t.infoBd}`, display: "flex", gap: 8, alignItems: "flex-start", lineHeight: 1.45 }}>
            <span aria-hidden="true" style={{ fontWeight: 800 }}>ℹ</span>{roHint}
          </div>
        )}
        {loadErr && <div role="alert" style={{ margin: "12px 18px 0", padding: "9px 12px", borderRadius: 10, fontSize: 12, color: t.bad, background: t.badBg, border: `1px solid ${t.badBd}` }}>Unable to load documents: {loadErr}</div>}

        {/* slots */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          {loading
            ? SLOTS.map((d) => (
              <div key={d.key} style={{ border: `1px solid ${t.line}`, borderRadius: 14, padding: 14, background: t.surf, display: "flex", flexDirection: "column", gap: 10 }}>
                <Skel w="45%" h={14} t={t} /><Skel h={54} r={10} t={t} />
              </div>))
            : SLOTS.map((dt, i) => (
              <SlotCard key={dt.key} no={i + 1} dt={dt} files={list.filter((d) => d.doc_type === dt.key)}
                canWrite={slotWriteFor(dt.key)} refId={refId} partnerName={partnerName} segment={segment} title={title} amountText={amountText}
                approval={docs?.approvals?.[approvalKey(segment, partnerName, refId, dt.key)]} approvalsAvailable={docs?.approvalsAvailable !== false}
                isSPM={!!docs?.canManageApprovals} onApprovalChanged={docsRefresh}
                ownerSign={dt.key === "bast" && canWrite && ["finance_mpx", "agency"].includes(docs?.profile?.role)}
                spmSignedUpload={!!docs?.canMerge && isPaymentRef(refId) && APPROVAL_DOC_TYPES.includes(dt.key)}
                onBusy={(d) => setUploading((x) => Math.max(0, x + d))} onChanged={changed} lockAll={!!merge}
                focusTick={focus.key === dt.key ? focus.n : 0} t={t} />
            ))}
        </div>

        {/* footer */}
        <div style={{ borderTop: `1px solid ${t.line}`, background: t.surf, padding: "12px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
          {zipping && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: 10.5, color: t.muted, marginBottom: 5 }}>Preparing ZIP {zipping.i}/{zipping.total} files…</div>
              <IndeterminateBar t={t} pct={zipping.total ? Math.round((zipping.i / zipping.total) * 100) : null} />
            </div>
          )}
          {merge && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: 10.5, color: t.muted, marginBottom: 5 }}>Merging {merge.i}/{merge.total} files…</div>
              <IndeterminateBar t={t} pct={merge.total ? Math.round((merge.i / merge.total) * 100) : null} />
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontFamily: MONO, fontSize: 11, color: t.muted, lineHeight: 1.5 }}>
              {amountText && <div style={{ color: t.ink, fontWeight: 700 }}>{amountText}</div>}
              <div>{list.length} file · {fmtSize(totalSize)}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {(canWrite || isSPM) && (
                <button className="ppd-f" style={btnStyle(t, "outline", busy || !list.length)} disabled={busy || !list.length} onClick={onZipAll}
                  title={!list.length ? "No files yet" : `Download all files for this ${DOC_REF_LABEL} (ZIP, grouped by document type)`}>
                  <IcoDownload /> Download all documents
                </button>
              )}
              {isSPM
                ? <button className="ppd-f" style={btnStyle(t, "primary", busy || !list.length)} disabled={busy || !list.length} onClick={onMerge}
                    title={!list.length ? "No files to merge yet" : `Merge ${present}/${N} documents into one PDF`}>
                    <IcoDownload /> Download merged PDF
                  </button>
                : <span style={{ fontSize: 11, color: t.muted, alignSelf: "center" }}>Merged PDFs are generated by SPM</span>}
            </div>
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function SlotCard({ no, dt, files, canWrite: canWriteOwner, refId, partnerName, segment, title, amountText, approval, approvalsAvailable, isSPM, onApprovalChanged, onBusy, onChanged, lockAll, focusTick = 0, ownerSign = false, spmSignedUpload = false, t }) {
  const apprSt = approvalStatus(approval);
  const approvedLock = apprSt === "approved";
  // Dokumen yang sudah approved terkunci: tidak bisa upload/ganti/hapus sampai SPM mencabut approval
  const canWrite = canWriteOwner && !approvedLock;
  const [queue, setQueue] = useState([]);        // [{ name, size, status: wait|up|ok|err|skip, error }]
  const [drag, setDrag] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [dl, setDl] = useState(null);             // id file / "all" yang sedang di-download
  const addRef = useRef(null);
  const repRef = useRef(null);
  const secRef = useRef(null);
  const pickBtnRef = useRef(null);
  const has = files.length > 0;

  // dibuka dari chip / "Upload berikutnya": scroll ke slot ini & fokus tombol Pilih file
  useEffect(() => {
    if (!focusTick || !secRef.current) return;
    secRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    (pickBtnRef.current || secRef.current).focus({ preventScroll: true });
    secRef.current.animate?.([{ boxShadow: `0 0 0 3px ${TEAL}` }, { boxShadow: "0 0 0 0 transparent" }], { duration: 1200 });
  }, [focusTick]);
  const uploading = queue.some((q) => q.status === "wait" || q.status === "up");
  const locked = uploading || lockAll || !!deleting;
  const lastAt = files.reduce((m, f) => (f.uploaded_at > m ? f.uploaded_at : m), "");

  const runUpload = async (fileList, replace) => {
    const all = Array.from(fileList || []);
    if (!all.length || locked) return;
    // validasi di browser dulu: tipe & ukuran
    const bad = all.map((f) => [f, validateFile(f)]).filter(([, m]) => m);
    bad.slice(0, 3).forEach(([f, m]) => toast(t, `${f.name}: ${m}`, "err"));
    if (bad.length > 3) toast(t, `…and ${bad.length - 3} more file(s) rejected.`, "err");
    const arr = all.filter((f) => !validateFile(f));
    if (!arr.length) return;
    if (replace && !window.confirm(`Replace ${files.length} existing ${dt.label} file(s) with ${arr.length} new file(s)?`)) return;
    setQueue(arr.map((f) => ({ name: f.name, size: f.size, status: "wait" })));
    onBusy(1);
    const setQ = (i, patch) => setQueue((q) => q.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    try {
      const { ok, errors, skipped } = await uploadSlot({
        files: arr, partnerName, refId, docType: dt.key, segment, replace,
        onProgress: ({ index, phase, error }) => setQ(index, { status: phase === "start" ? "up" : phase === "done" ? "ok" : phase === "skip" ? "skip" : "err", error }),
      });
      if (ok.length) toast(t, `${dt.label}: ${ok.length} file(s) uploaded${replace ? " (previous files replaced)" : ""}.`);
      if (skipped.length) toast(t, `${skipped.length} file(s) already exist in ${dt.label} and were skipped.`, "info");
      if (errors.length) toast(t, `${dt.label}: ${errors.length} file(s) failed — ${errors[0].file}: ${errors[0].message}`, "err");
      if (ok.length) onChanged();
      // sisakan yang gagal di antrean supaya terlihat; yang sukses hilang
      setTimeout(() => setQueue((q) => q.filter((x) => x.status === "err")), ok.length ? 1200 : 0);
    } catch (e) {
      toast(t, `Upload failed: ${errMsg(e)}`, "err");
      setQueue([]);
    }
    onBusy(-1);
  };

  const onPick = (replace) => (e) => { const f = e.target.files; runUpload(f, replace); e.target.value = ""; };
  const onDrop = (e) => { e.preventDefault(); setDrag(false); if (canWrite && !spmSignedUpload) runUpload(e.dataTransfer?.files, false); };
  const onDragOver = (e) => { if (!canWrite || spmSignedUpload || locked) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; if (!drag) setDrag(true); };

  const onOpen = async (d) => {
    // buka tab dulu (hindari popup blocker), lalu isi URL
    const w = window.open("", "_blank");
    try { const url = await signedUrl(d.storage_path); if (w) { w.opener = null; w.location.href = url; } else window.location.assign(url); }
    catch (e) { if (w) w.close(); toast(t, `Unable to open file: ${errMsg(e)}`, "err"); }
  };

  const onDownload = async (d) => {
    setDl(d.id);
    try { await downloadDoc(d); }
    catch (e) { toast(t, `Download failed: ${errMsg(e)}`, "err"); }
    setDl(null);
  };

  const onDownloadAll = async () => {
    if (files.length === 1) return onDownload(files[0]);
    setDl("all");
    try {
      const { failed } = await downloadDocsZip(files, refZipName(refId, partnerName, dt.label));
      if (failed.length) toast(t, `ZIP downloaded; ${failed.length} file(s) failed.`, "err");
      else toast(t, `${files.length} ${dt.label} file(s) downloaded (ZIP).`);
    } catch (e) { toast(t, `Download failed: ${errMsg(e)}`, "err"); }
    setDl(null);
  };

  const onDelete = async (d) => {
    if (confirmId !== d.id) { setConfirmId(d.id); setTimeout(() => setConfirmId((c) => (c === d.id ? null : c)), 3500); return; }
    setConfirmId(null); setDeleting(d.id);
    try { await deleteDocs([d]); toast(t, `${d.file_name} deleted.`); onChanged(); }
    catch (e) { toast(t, `Unable to delete: ${errMsg(e)}`, "err"); }
    setDeleting(null);
  };

  const zoneKey = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); addRef.current?.click(); } };

  // Partner: tanda tangan OWNER pada BAST → salinan baru "_signed-owner" (file asli tidak diubah)
  const [signing, setSigning] = useState(null);
  const onOwnerSign = async (d) => {
    const own = readOwnerSig();
    if (!own.sig) { toast(t, "Set up your owner signature first: “✍ Owner signature” at the top of this page.", "info"); return; }
    if (files.some((f) => f.file_name === ownerSignedName(d.file_name))
      && !window.confirm("A signed copy of this BAST already exists. Create another signed copy?")) return;
    setSigning(d.id); onBusy?.(1);
    try {
      let out;
      try { out = await stampOwnerSignature(await fetchDocBytes(d.storage_path), own); }
      catch (e) {
        if (/No partner signature area/.test(e.message || "")) { toast(t, "This BAST was uploaded already signed by SPM — no owner signature is needed here.", "info"); onBusy?.(-1); setSigning(null); return; }
        throw e;
      }
      const r = await uploadSlot({ files: [new File([out], ownerSignedName(d.file_name), { type: "application/pdf" })], partnerName, refId, docType: dt.key, segment, replace: false });
      if (r.errors.length) throw new Error(r.errors[0].message);
      toast(t, r.ok.length ? "Signed copy saved. The original BAST is kept." : "This signed copy already exists.", r.ok.length ? "ok" : "info");
      onChanged();
    } catch (e) { toast(t, `Unable to sign: ${errMsg(e)}`, "err"); }
    onBusy?.(-1); setSigning(null);
  };

  // SPM: upload BAST / Surat yang sudah ditandatangani (mis. setelah approval manual) → versi terbaru slot.
  // Selalu MENAMBAH file (file lama, termasuk yang approved & terkunci, tetap tersimpan sebagai arsip).
  const signedRef = useRef(null);
  const [spmUp, setSpmUp] = useState(false);
  const onSignedPick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (fileKind(f.name, f.type) !== "pdf") { toast(t, "Please upload the signed document as a PDF.", "err"); return; }
    const bad = validateFile(f);
    if (bad) { toast(t, bad, "err"); return; }
    setSpmUp(true); onBusy?.(1);
    try {
      const name = spmSignedName(dt.key, refId, partnerName);
      const r = await uploadSlot({ files: [new File([f], name, { type: "application/pdf" })], partnerName, refId, docType: dt.key, segment, replace: false });
      if (r.errors.length) throw new Error(r.errors[0].message);
      toast(t, `Signed ${dt.key === "bast" ? "BAST" : "Notification Letter"} uploaded — it is now the version used for merging and shown to the partner.`);
      onChanged();
    } catch (err) { toast(t, `Upload failed: ${errMsg(err)}`, "err"); }
    onBusy?.(-1); setSpmUp(false);
  };

  return (
    <section ref={secRef} tabIndex={-1} aria-label={`${no}. ${dt.label}`} onDragOver={onDragOver} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false); }} onDrop={onDrop}
      style={{ flexShrink: 0, border: `1.5px solid ${drag ? TEAL : has ? t.goodBd : t.line}`, borderRadius: 14, background: drag ? t.goodBg : t.surf, overflow: "hidden", transition: "border-color .15s, background .15s", boxShadow: t.shadow1 }}>
      {/* judul */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px" }}>
        <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 99, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 12, fontWeight: 800, background: has ? TEAL : t.surf3, color: has ? "#fff" : t.muted }}>{has ? "✓" : no}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{dt.label}</span>
            <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", padding: "1px 7px", borderRadius: 6,
              color: has ? (t.goodDark || TEAL_D) : t.bad, background: has ? t.goodBg : t.badBg, border: `1px solid ${has ? t.goodBd : t.badBd}` }}>{has ? "Uploaded" : "Missing"}</span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10.5, color: has ? (t.goodDark || TEAL_D) : t.muted2 }}>
            {has ? `${files.length} file(s) · last updated ${fmtDT(lastAt)}` : "Not uploaded yet"}
          </div>
          {apprSt && <div style={{ marginTop: 4 }}><ApprovalBadge status={apprSt} long t={t} /></div>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {spmSignedUpload && <>
            <input ref={signedRef} type="file" accept=".pdf,application/pdf" hidden onChange={onSignedPick} />
            <button className="ppd-f ppd-act" style={btnStyle(t, "primary", spmUp || !!lockAll, true)} disabled={spmUp || !!lockAll} onClick={() => signedRef.current?.click()}
              title="Upload the signed PDF (e.g. after manual approval). It becomes the latest version; older files are kept as an archive.">
              ⬆ {spmUp ? "Uploading…" : `Upload signed ${dt.key === "bast" ? "BAST" : "Letter"}`}
            </button>
          </>}
          {canWrite && !spmSignedUpload && (
            <button ref={pickBtnRef} className="ppd-f" style={btnStyle(t, "primary", locked, true)} disabled={locked} onClick={() => addRef.current?.click()}
              title={`Select ${dt.label} files (PDF/JPG/PNG, max ${MAX_FILE_BYTES / 1048576} MB)`}>
              ⬆ {has ? "Add files" : "Select files"}
            </button>
          )}
          {has && <>
            <button className="ppd-f" style={btnStyle(t, "outline", !!dl, true)} disabled={!!dl} onClick={onDownloadAll}
              title={files.length > 1 ? `Download ${files.length} ${dt.label} files as ZIP` : `Download ${files[0].file_name}`}>
              <IcoDownload />{dl === "all" ? "…" : files.length > 1 ? `Download all (${files.length})` : "Download"}
            </button>
            {canWrite && !spmSignedUpload && <button className="ppd-f" style={btnStyle(t, "outline", locked, true)} disabled={locked} onClick={() => repRef.current?.click()} title={`Remove all ${dt.label} files and replace them with new ones (e.g. the e-signed BAST)`}>Replace all</button>}
          </>}
        </div>
      </div>

      {APPROVAL_ENABLED && isSPM && APPROVAL_DOC_TYPES.includes(dt.key) && (
        <ApprovalPanel approval={approval} status={apprSt} available={approvalsAvailable} isSPM={isSPM} hasFiles={has}
          slot={{ segment, owner_name: partnerName, ref_id: refId, doc_type: dt.key, ref_title: title, amount_text: amountText }}
          docLabel={dt.label} onChanged={onApprovalChanged} t={t} />
      )}
      {approvedLock && canWriteOwner && (
        <div style={{ margin: "0 14px 10px", fontSize: 11.5, color: t.muted, fontFamily: MONO }}>🔒 Approved — locked. {isSPM ? "Revoke the approval to make changes." : "Contact SPM if a change is required."}</div>
      )}

      {/* file list */}
      {has && (
        <ul style={{ listStyle: "none", margin: 0, padding: "0 10px 6px" }}>
          {files.map((d) => (
            <li key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 6px", borderTop: `1px solid ${t.line}`, opacity: deleting === d.id ? 0.5 : 1 }}>
              <FileIcon name={d.file_name} mime={d.mime_type} t={t} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div title={d.file_name} style={{ fontSize: 12.5, fontWeight: 600, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.file_name}</div>
                <div style={{ fontFamily: MONO, fontSize: 10.5, color: t.muted2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <UploaderBadge role={d.uploaded_by_role} t={t} />
                  <span>{fmtDT(d.uploaded_at)} · {fmtSize(Number(d.size_bytes) || 0)}</span>
                </div>
              </div>
              <button className="ppd-f" style={btnStyle(t, "outline", false, true)} onClick={() => onOpen(d)} aria-label={`Open ${d.file_name}`} title="Open in a new tab"><IcoOpen /><span className="ppd-hide-xs">Open</span></button>
              <button className="ppd-f" style={btnStyle(t, "outline", dl === d.id, true)} disabled={dl === d.id} onClick={() => onDownload(d)} aria-label={`Download ${d.file_name}`} title="Download with the original file name"><IcoDownload /><span className="ppd-hide-xs">{dl === d.id ? "…" : "Download"}</span></button>
              {ownerSign && fileKind(d.file_name, d.mime_type) === "pdf" && !isOwnerSigned(d.file_name) && (
                <button className="ppd-f ppd-act" style={btnStyle(t, "primary", !!signing || locked, true)} disabled={!!signing || locked} onClick={() => onOwnerSign(d)}
                  title="Add your owner signature in the PIHAK KEDUA column. A signed copy is saved; the original is kept.">✍ {signing === d.id ? "Signing…" : "Sign as partner (owner)"}</button>
              )}
              {isSpmSigned(d.file_name) && <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", padding: "2px 6px", borderRadius: 6, color: MAGENTA, background: `${MAGENTA}12`, border: `1px solid ${MAGENTA}30`, whiteSpace: "nowrap" }}>Uploaded by SPM (signed)</span>}
              {isOwnerSigned(d.file_name) && <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", padding: "2px 6px", borderRadius: 6, color: t.goodDark || TEAL_D, background: t.goodBg, border: `1px solid ${t.goodBd}` }}>Owner-signed</span>}
              {canWrite && (
                <button className="ppd-f" style={btnStyle(t, confirmId === d.id ? "danger" : "ghost", locked, true)} disabled={locked}
                  onClick={() => onDelete(d)} aria-label={confirmId === d.id ? `Confirm deletion of ${d.file_name}` : `Delete ${d.file_name}`} title="Delete file">
                  <IcoTrash />{confirmId === d.id && <span>Confirm?</span>}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* antrean upload */}
      {queue.length > 0 && (
        <ul aria-live="polite" style={{ listStyle: "none", margin: 0, padding: "4px 16px 10px", display: "flex", flexDirection: "column", gap: 7 }}>
          {queue.map((q, i) => (
            <li key={i} style={{ fontSize: 11.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: t.ink2 }} title={q.name}>{q.name}</span>
                <span style={{ fontFamily: MONO, fontSize: 10.5, whiteSpace: "nowrap", color: q.status === "err" ? t.bad : q.status === "ok" ? (t.goodDark || TEAL_D) : t.muted }}>
                  {q.status === "wait" ? "queued" : q.status === "up" ? "uploading…" : q.status === "ok" ? "✓ done" : q.status === "skip" ? "already exists" : q.error || "failed"}
                </span>
              </div>
              {q.status === "up" ? <IndeterminateBar t={t} /> : <IndeterminateBar t={t} pct={q.status === "wait" ? 0 : 100} />}
            </li>
          ))}
        </ul>
      )}

      {/* drop zone */}
      {canWrite && !spmSignedUpload && (
        <div style={{ padding: has ? "0 14px 12px" : "0 14px 14px" }}>
          <input ref={addRef} type="file" accept={ACCEPT_ATTR} multiple hidden onChange={onPick(false)} />
          <input ref={repRef} type="file" accept={ACCEPT_ATTR} multiple hidden onChange={onPick(true)} />
          <div role="button" tabIndex={locked ? -1 : 0} className="ppd-f" aria-disabled={locked}
            aria-label={`Upload ${dt.label}: drag files here or press Enter to browse`}
            onClick={() => { if (!locked) addRef.current?.click(); }} onKeyDown={zoneKey}
            style={{ border: `1.5px dashed ${drag ? TEAL : t.line2}`, borderRadius: 12, padding: has ? "9px 12px" : "18px 12px", textAlign: "center", cursor: locked ? "not-allowed" : "pointer", color: drag ? (t.goodDark || TEAL_D) : t.muted, background: drag ? "transparent" : t.surf2, display: "flex", flexDirection: has ? "row" : "column", alignItems: "center", justifyContent: "center", gap: has ? 8 : 6, opacity: locked ? 0.6 : 1, transition: "all .15s" }}>
            <span style={{ color: TEAL, display: "inline-flex" }}><IcoUp /></span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: t.ink2 }}>{drag ? "Release to upload" : has ? "Add files — drag here or click" : "Drag files here or click to browse"}</span>
            <span style={{ fontFamily: MONO, fontSize: 10.5 }}>PDF · JPG · PNG — max {MAX_FILE_BYTES / 1048576} MB per file</span>
          </div>
        </div>
      )}
      {!canWrite && !has && <div style={{ padding: "0 14px 12px 50px", fontSize: 11.5, color: t.muted2 }}>Not yet uploaded by the {DOC_REF_LABEL} owner.</div>}
    </section>
  );
}

// ── Approval per slot (BAST & Notification Letter) ─────────────────────────
function ApprovalPanel({ approval, status, available, isSPM, hasFiles, slot, docLabel, onChanged, t }) {
  const [form, setForm] = useState(false);
  const [email, setEmail] = useState(readApprover);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [audit, setAudit] = useState(false);

  if (!available) {
    return isSPM
      ? <div style={{ margin: "0 14px 10px", fontSize: 11.5, color: t.muted, padding: "7px 10px", borderRadius: 9, background: t.surf2, border: `1px dashed ${t.line2}` }}>Approval tracking is not set up yet (run <span style={{ fontFamily: MONO }}>20261008_payout_doc_approvals.sql</span>).</div>
      : null;
  }
  if (!approval && !isSPM) return null;

  const call = async (label, action, body, okMsg) => {
    setBusy(label);
    try {
      const res = await approvalApi(action, body);
      const r0 = res.results?.[0];
      if (r0 && !r0.ok) throw new Error(r0.error);
      const emailErr = res.emailError || r0?.emailError;
      if (emailErr) toast(t, `Saved, but the email could not be sent: ${emailErr}. Use Remind to retry.`, "err");
      else toast(t, okMsg);
      onChanged?.();
      return true;
    } catch (e) { toast(t, errMsg(e), "err"); return false; }
    finally { setBusy(""); }
  };

  const send = async () => {
    const v = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { toast(t, "Please enter a valid approver email address.", "err"); return; }
    saveApprover(v);
    if (await call("send", "request", { approver_email: v, note, items: [slot] }, `Approval request for ${docLabel} sent to ${v}.`)) { setForm(false); setNote(""); }
  };
  const remind = () => call("remind", "remind", { id: approval.id }, `Reminder sent to ${approval.approver_email}.`);
  const cancel = () => { if (window.confirm("Cancel this approval request?")) call("cancel", "cancel", { id: approval.id }, "Approval request cancelled."); };
  const revoke = () => {
    const why = window.prompt("Reason for revoking this approval (required). The documents will be unlocked.");
    if (why && why.trim().length >= 3) call("revoke", "revoke", { id: approval.id, reason: why.trim() }, "Approval revoked — documents unlocked.");
    else if (why !== null) toast(t, "A reason of at least 3 characters is required.", "err");
  };

  const a = approval;
  const files = Array.isArray(a?.files) ? a.files : [];
  const canRequest = isSPM && status !== "pending" && status !== "approved";
  const line = (k, v) => v ? <div style={{ display: "flex", gap: 8 }}><span style={{ color: t.muted, minWidth: 92 }}>{k}</span><span style={{ color: t.ink2, fontWeight: 600, wordBreak: "break-word" }}>{v}</span></div> : null;

  return (
    <div style={{ margin: "0 14px 10px", padding: "9px 11px", borderRadius: 11, background: t.surf2, border: `1px solid ${t.line}`, fontSize: 11.5, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: t.muted, fontWeight: 700 }}>Approval</span>
        {status ? <ApprovalBadge status={status} t={t} /> : <span style={{ color: t.muted }}>Not requested</span>}
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
          {isSPM && status === "pending" && <>
            <button className="ppd-f" style={btnStyle(t, "outline", !!busy, true)} disabled={!!busy} onClick={remind}>{busy === "remind" ? "…" : "Remind"}</button>
            <button className="ppd-f" style={btnStyle(t, "ghost", !!busy, true)} disabled={!!busy} onClick={cancel}>{busy === "cancel" ? "…" : "Cancel"}</button>
          </>}
          {isSPM && status === "approved" && <button className="ppd-f" style={btnStyle(t, "danger", !!busy, true)} disabled={!!busy} onClick={revoke}>{busy === "revoke" ? "…" : "Revoke approval"}</button>}
          {canRequest && !form && (
            <button className="ppd-f ppd-act" style={btnStyle(t, "primary", !hasFiles || !!busy, true)} disabled={!hasFiles || !!busy} onClick={() => setForm(true)}
              title={hasFiles ? `Send ${docLabel} for approval by email` : "Upload at least one file first"}>
              ✉ {status ? "Request again" : "Request approval"}
            </button>
          )}
        </span>
      </div>

      {a && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {line("Approver", a.approver_email)}
          {line("Requested", `${a.requested_email || "SPM"} · ${fmtDT(a.requested_at)}${a.reminder_count ? ` · ${a.reminder_count} reminder(s)` : ""}`)}
          {status === "pending" && line("Respond by", fmtDT(a.expires_at))}
          {a.decided_at && line(a.status === "rejected" ? "Rejected" : "Approved", `${a.decided_email} · ${fmtDT(a.decided_at)}`)}
          {a.decision_note && line("Comment", a.decision_note)}
          {a.closed_at && line(a.status === "revoked" ? "Revoked" : "Cancelled", `${a.closed_email || "SPM"} · ${fmtDT(a.closed_at)}${a.close_reason ? ` — ${a.close_reason}` : ""}`)}
          {a.note && line("SPM note", a.note)}
          {files.length > 0 && (
            <div>
              <button className="ppd-f" onClick={() => setAudit((v) => !v)} style={{ all: "unset", cursor: "pointer", color: t.goodDark || TEAL_D, fontWeight: 600 }}>
                {audit ? "▾" : "▸"} Audit trail · {files.length} file(s) fingerprinted (SHA-256)
              </button>
              {audit && (
                <ul style={{ listStyle: "none", margin: "4px 0 0", padding: 0, fontFamily: MONO, fontSize: 10, color: t.muted }}>
                  {files.map((f) => <li key={f.doc_id} title={f.sha256} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.file_name} · {fmtSize(f.size || 0)} · {String(f.sha256 || "").slice(0, 16)}…</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {form && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 4, borderTop: `1px solid ${t.line}` }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ color: t.muted }}>Approver email (must have a SandraHub account)</span>
            <input className="ppd-f" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" autoFocus
              style={{ fontFamily: "inherit", fontSize: 12.5, padding: "7px 9px", borderRadius: 8, border: `1px solid ${t.line2}`, background: t.surf, color: t.ink }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ color: t.muted }}>Note to approver (optional)</span>
            <textarea className="ppd-f" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000}
              style={{ fontFamily: "inherit", fontSize: 12.5, padding: "7px 9px", borderRadius: 8, border: `1px solid ${t.line2}`, background: t.surf, color: t.ink, resize: "vertical" }} />
          </label>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button className="ppd-f" style={btnStyle(t, "ghost", !!busy, true)} disabled={!!busy} onClick={() => setForm(false)}>Cancel</button>
            <button className="ppd-f ppd-act" style={btnStyle(t, "primary", !!busy, true)} disabled={!!busy} onClick={send}>{busy === "send" ? "Sending…" : "Send request"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Menu ⋯ untuk aksi sekunder (portal: tidak terpotong oleh kontainer tabel yang scroll)
function RowMenu({ items, t, label = "More actions" }) {
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  useEffect(() => {
    if (!pos) return undefined;
    const close = (e) => { if (e.type === "keydown" ? e.key === "Escape" : !e.target.closest?.("[data-ppd-menu]")) setPos(null); };
    const closeNow = () => setPos(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", closeNow, true);
    window.addEventListener("resize", closeNow);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); window.removeEventListener("scroll", closeNow, true); window.removeEventListener("resize", closeNow); };
  }, [pos]);
  const open = () => { const r = btnRef.current.getBoundingClientRect(); setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) }); };
  const list = items.filter(Boolean);
  return (
    <>
      <button ref={btnRef} className="ppd-f" aria-haspopup="menu" aria-expanded={!!pos} aria-label={label} title={label} onClick={(e) => { e.stopPropagation(); if (pos) setPos(null); else open(); }}
        style={{ ...btnStyle(t, "ghost", false, true), padding: "4px 8px", fontSize: 15, lineHeight: 1, color: t.muted }}>⋯</button>
      {pos && typeof document !== "undefined" && createPortal(
        <div data-ppd-menu role="menu" style={{ position: "fixed", top: pos.top, right: pos.right, zIndex: 10020, minWidth: 210, background: t.surf, border: `1px solid ${t.line2}`, borderRadius: 12, boxShadow: t.shadow2 || "0 8px 24px rgba(0,0,0,.18)", padding: 5, animation: "ppd_fade .12s ease-out" }}>
          {list.map((it, i) => (
            <button key={i} role="menuitem" className="ppd-f" disabled={it.disabled} onClick={(e) => { e.stopPropagation(); setPos(null); it.onClick(); }}
              title={it.hint || undefined}
              style={{ all: "unset", boxSizing: "border-box", width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, fontSize: 12.5, cursor: it.disabled ? "not-allowed" : "pointer", color: it.disabled ? t.muted2 : it.danger ? t.bad : t.ink }}
              onMouseEnter={(e) => { if (!it.disabled) e.currentTarget.style.background = t.surf2; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              {it.label}
            </button>
          ))}
        </div>, document.body)}
    </>
  );
}

// ── Tab "Upload & Merge Dokumen" ───────────────────────────────────────────
// pos: [{ ref, partner, title, amount, amountText, records }] dari data Payout yang sedang difilter.
// segment: 'partner' | 'agency' (ikut toggle Partner/Agency Prepaid). noRefCount: baris tanpa PO.

// Payment ID (PAY-*) sebagai "baris" dokumen: dari file BAST/Surat yang disimpan Partner Letters.
// RLS membatasi partner ke Payment ID miliknya. withMeta (SPM/IOH): total dari metadata Partner Letters.
function usePaymentRows(segment, docs, { enabled = true, withMeta = false } = {}) {
  const [rows, setRows] = useState(null);
  const byRef = docs?.byRef;
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    (async () => {
      let list = [];
      try { list = await fetchDraftDocs(segment); } catch { list = []; }
      const m = new Map();
      list.filter((d) => isPaymentRef(d.ref_id)).forEach((d) => {
        const k = `${d.partner_key}|${d.ref_id}`;
        if (!m.has(k)) {
          const info = parsePaymentRef(d.ref_id);
          m.set(k, { ref: d.ref_id, partner: d.partner_name, title: `${info?.label || ""} · ${info?.type || ""}`, ym: info?.ym || "", ptype: info?.type || "", amount: 0, amountText: "—", records: 1, payment: true });
        }
      });
      const out = [...m.values()];
      if (withMeta && out.length) {
        try {
          const idx = await fetchLettersIndex(segment);
          const need = out.filter((r) => idx.get(r.ref)?.metaPath);
          for (let i = 0; i < need.length; i += 8) {
            await Promise.all(need.slice(i, i + 8).map(async (r) => {
              try { const meta = await readJsonFile(idx.get(r.ref).metaPath); if (meta?.total != null) { r.amount = meta.total; r.amountText = `Rp${Math.round(meta.total).toLocaleString("id-ID")}`; } } catch { /* tanpa total */ }
            }));
          }
        } catch { /* metadata opsional */ }
      }
      if (alive) setRows(out.sort((a, b) => b.ref.localeCompare(a.ref)));
    })();
    return () => { alive = false; };
  }, [segment, byRef, enabled, withMeta]);
  return rows;
}

export function PoDocsTab({ pos, allPos, segment, docs, noRefCount = 0, fmtAmount, onGoLetters, t }) {
  useDocsCss();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all"); // all | complete | partial | none
  const [sort, setSort] = useState({ col: "n", dir: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sel, setSel] = useState(() => new Set());
  const [openKey, setOpenKey] = useState(null);
  const [openSlot, setOpenSlot] = useState(null);  // slot yang difokuskan saat drawer dibuka
  const [bulkOpen, setBulkOpen] = useState(false); // modal Bulk Upload (SPM)
  const [signedOpen, setSignedOpen] = useState(false); // modal Bulk upload signed BAST & Surat (By Payment ID)
  const [sigOpen, setSigOpen] = useState(false);   // partner: modal tanda tangan owner
  const [openPay, setOpenPay] = useState(null);    // partner: Payment ID dari SPM yang dibuka
  const [reqOpen, setReqOpen] = useState(false);   // modal Request approval untuk PO terpilih (SPM)
  const [refMode, setRefMode] = useState("po");     // SPM: "po" (By PO) | "pay" (By Payment ID)
  // SPM: 2 langkah — "upload" (1 · Upload to PO / Invoice), "merge" (2 · Merge & Download).
  // Generate BAST & Surat ada di tab terpisah "Partner Letters" (PayoutPartnerLetters.jsx).
  const [step, setStep] = useState("upload");
  const [bulk, setBulk] = useState(null);       // { i, total, ref }
  const [rowBusy, setRowBusy] = useState(null); // key PO yang sedang di-merge
  const isSPM = !!docs?.canMerge;
  const role = docs?.profile?.role;
  const own = ownerLabel(segment);
  const isOwnerRole = role === "finance_mpx" || role === "agency";
  const payMode = isSPM && refMode === "pay";
  const payRows = usePaymentRows(segment, docs, { enabled: payMode || isOwnerRole, withMeta: payMode });
  const REF = payMode ? "Payment ID" : DOC_REF_LABEL;
  const setMode = (m) => { setRefMode(m); setSel(new Set()); setPage(1); setQ(""); };
  const openDrawer = (key, slot = null) => { setOpenSlot(slot); setOpenKey(key); };
  const curStep = isSPM ? step : "upload";
  const goStep = (k) => { setStep(k); setStatus(k === "merge" ? "complete" : "all"); setSel(new Set()); setPage(1); };
  const downloadAllFiles = async (r) => {
    try {
      const list = await listRefDocs(r.ref, segment, r.partner);
      if (!list.length) { toast(t, "No files yet.", "info"); return; }
      const { failed } = await downloadDocsZip(list, refZipName(r.ref, r.partner, "documents"), { byType: true });
      toast(t, failed.length ? `ZIP downloaded; ${failed.length} file(s) failed.` : `ZIP with ${list.length} file(s) downloaded.`, failed.length ? "err" : "ok");
    } catch (e) { toast(t, `Download failed: ${errMsg(e)}`, "err"); }
  };

  const rows = useMemo(() => ((payMode ? payRows : pos) || [])
    .filter((p) => canViewPartner(docs?.profile, p.partner, segment))
    .map((p) => {
      const key = statKey(segment, p.partner, p.ref);
      const stat = docs?.byRef?.[key];
      const n = doneCount(stat);
      const firstMissing = DOC_TYPES.find((d) => !(stat?.types?.[d.key]?.n > 0))?.key || null;
      return { ...p, key, stat, n, st: statusOf(n), lastAt: stat?.lastAt || "", firstMissing, canWrite: canWritePartner(docs?.profile, p.partner, segment) };
    }), [pos, payRows, payMode, docs, segment]);

  const kpi = useMemo(() => {
    const k = { all: rows.length, complete: 0, partial: 0, none: 0, amtComplete: 0, amtAll: 0 };
    rows.forEach((r) => { k[r.st]++; k.amtAll += r.amount || 0; if (r.st === "complete") k.amtComplete += r.amount || 0; });
    return k;
  }, [rows]);

  const ql = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    const f = rows.filter((r) => (status === "all" || r.st === status) && (!ql || `${r.ref} ${r.partner} ${r.title}`.toLowerCase().includes(ql)));
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (r) => (sort.col === "amount" ? r.amount || 0 : sort.col === "n" ? r.n : sort.col === "lastAt" ? r.lastAt : String(r[sort.col] || "").toLowerCase());
    return f.sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true });
      return c * dir || a.ref.localeCompare(b.ref, undefined, { numeric: true });
    });
  }, [rows, status, ql, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const curPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((curPage - 1) * pageSize, curPage * pageSize);
  const pageSelectable = pageRows.filter((r) => r.st === "complete");
  const selected = rows.filter((r) => sel.has(r.key) && r.st === "complete");
  const pageAllSel = pageSelectable.length > 0 && pageSelectable.every((r) => sel.has(r.key));
  const pageSomeSel = pageSelectable.some((r) => sel.has(r.key));
  const openRow = rows.find((r) => r.key === openKey);
  const pct = kpi.all ? Math.round((kpi.complete / kpi.all) * 100) : 0;
  const fmtAmt = fmtAmount || ((n) => (n || 0).toLocaleString("en-US"));

  const setFilter = (s) => { setStatus((cur) => (cur === s && s !== "all" ? "all" : s)); setPage(1); };
  const onSort = (col) => { setSort((s) => ({ col, dir: s.col === col && s.dir === "asc" ? "desc" : "asc" })); setPage(1); };
  const toggle = (key) => setSel((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const togglePage = () => setSel((s) => {
    const n = new Set(s);
    if (pageAllSel) pageSelectable.forEach((r) => n.delete(r.key)); else pageSelectable.forEach((r) => n.add(r.key));
    return n;
  });

  const mergeOne = async (r) => {
    setRowBusy(r.key);
    try {
      const res = await downloadMergedPdf({ refId: r.ref, partnerName: r.partner, segment, title: r.title, amountText: r.amountText });
      if (res.skipped.length) toast(t, `${r.ref}: PDF downloaded; ${res.skipped.length} file(s) skipped (see cover page).`, "info");
      else toast(t, `${r.ref}: PDF downloaded (${res.present}/${N}).`);
    } catch (e) { toast(t, `Merge failed for ${r.ref}: ${errMsg(e)}`, "err"); }
    setRowBusy(null);
  };

  const mergeSelected = async () => {
    if (!selected.length) return;
    setBulk({ i: 0, total: selected.length, ref: "" });
    try {
      const { failed } = await downloadMergedZip(
        selected.map((r) => ({ refId: r.ref, partnerName: r.partner, segment, title: r.title, amountText: r.amountText })),
        ({ index, total, ref }) => setBulk({ i: index, total, ref }),
      );
      if (failed.length) toast(t, `ZIP downloaded; ${failed.length} ${REF}(s) failed: ${failed[0]}`, "err");
      else { toast(t, `ZIP with ${selected.length} PDF(s) downloaded.`); setSel(new Set()); }
    } catch (e) { toast(t, `Unable to create ZIP: ${errMsg(e)}`, "err"); }
    setBulk(null);
  };

  const th = (extra) => ({ position: "sticky", top: 0, zIndex: 2, fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: t.muted, fontWeight: 500, background: t.surf2, padding: "10px 9px", borderBottom: `1.5px solid ${t.line2}`, whiteSpace: "nowrap", textAlign: "left", ...extra });
  const td = (extra) => ({ padding: "10px 9px", color: t.ink2, borderBottom: `1px solid ${t.line}`, verticalAlign: "middle", ...extra });
  const sortTh = (col, children, align = "left") => {
    const active = sort.col === col;
    return (
      <th key={col} style={th({ textAlign: align, color: active ? TEAL : t.muted, fontWeight: active ? 700 : 500 })} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
        <button className="ppd-f" onClick={() => onSort(col)} style={{ all: "unset", cursor: "pointer", display: "inline-flex", gap: 4, alignItems: "center" }}>
          {children}<span aria-hidden="true" style={{ opacity: active ? 1 : 0.3 }}>{active && sort.dir === "desc" ? "▼" : "▲"}</span>
        </button>
      </th>
    );
  };

  const kpiCard = ({ id, label, value, sub, color }) => {
    const active = status === id;
    return (
      <button key={id} className="ppd-f" onClick={() => setFilter(id)} aria-pressed={active}
        style={{ all: "unset", boxSizing: "border-box", cursor: "pointer", padding: "12px 14px", borderRadius: 14, background: active ? t.surf : t.surf2, border: `1.5px solid ${active ? color : t.line}`, boxShadow: active ? t.shadow1 : "none", display: "flex", flexDirection: "column", gap: 3, minWidth: 0, transition: "all .15s" }}>
        <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: t.muted, display: "flex", alignItems: "center", gap: 6 }}>
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 99, background: color }} />{label}
        </span>
        <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: t.ink, fontVariantNumeric: "tabular-nums" }}>{docs?.loaded ? value.toLocaleString("en-US") : "…"}</span>
        {sub && <span style={{ fontFamily: MONO, fontSize: 10, color: t.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>}
      </button>
    );
  };

  const hint = isOwnerRole ? null
    : !isSPM ? "View-only access: you can open and download files. Uploads are handled by partners/agencies; merging is handled by SPM."
    : segment === "agency" ? "Agencies do not have upload access yet — SPM can upload on their behalf." : null;

  const selectable = isSPM && curStep === "merge";
  const cols = (selectable ? 1 : 0) + 8;
  const STEPS = [
    ["upload", "1", `Upload to ${REF} / Invoice`, kpi.all, `Attach documents to each ${REF}: drag files into a row, or use Bulk Upload to match many files by name.`],
    ["merge", "2", "Merge & Download", kpi.complete, `Combine the 4 documents of complete ${REF}s into one PDF, individually or as a ZIP.`],
  ];
  const stepHelp = STEPS.find((x) => x[0] === curStep)?.[4];

  return (
    <div style={{ background: t.surf, border: `1px solid ${t.line}`, borderRadius: 18, boxShadow: t.shadow1, marginBottom: 14, position: "relative" }}>
      {/* header */}
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${t.line}`, background: t.surf2, borderRadius: "18px 18px 0 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 4, height: 18, borderRadius: 2, background: MAGENTA, display: "block" }} />
            <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.02em", color: t.ink }}>Document Upload &amp; Merge</span>
            <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "2px 8px", borderRadius: 99, background: `${MAGENTA}18`, color: MAGENTA, border: `1px solid ${MAGENTA}30` }}>{own} Prepaid</span>
          </div>
          <div style={{ marginTop: 4, marginLeft: 14, fontSize: 12, color: t.muted, maxWidth: 760, lineHeight: 1.45 }}>
            {isSPM ? stepHelp : isOwnerRole ? `Complete the ${N} supporting documents for each payment (Payment ID, or PO Number for earlier periods) so SPM can process your payout.` : `Documents per ${REF}: ${DOC_TYPES.map((d) => d.label).join(" · ")}`}
          </div>
        </div>
      </div>
      {isSPM && (
        <div role="tablist" aria-label="Workflow steps" style={{ display: "flex", gap: 0, padding: "0 20px", borderBottom: `1px solid ${t.line}`, background: t.surf2, overflowX: "auto" }}>
          {STEPS.map(([k, no, label, count]) => {
            const active = curStep === k;
            return (
              <button key={k} role="tab" aria-selected={active} className="ppd-f" onClick={() => goStep(k)}
                style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 14px 10px", borderBottom: `2.5px solid ${active ? MAGENTA : "transparent"}`, color: active ? t.ink : t.muted, fontSize: 13, fontWeight: active ? 700 : 600, whiteSpace: "nowrap" }}>
                <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 99, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 11, fontWeight: 800, background: active ? MAGENTA : t.surf3, color: active ? "#fff" : t.muted }}>{no}</span>
                {label}
                <span style={{ fontFamily: MONO, fontSize: 10, padding: "1px 7px", borderRadius: 99, background: active ? `${MAGENTA}18` : t.surf3, color: active ? MAGENTA : t.muted, border: `1px solid ${active ? `${MAGENTA}30` : t.line}` }}>{docs?.loaded ? count.toLocaleString("en-US") : "…"}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* KPI strip */}
      <div style={{ padding: "14px 20px 10px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        {kpiCard({ id: "all", label: `Total ${REF}`, value: kpi.all, sub: payMode ? `${own.toLowerCase()} · all periods` : `${own.toLowerCase()} · current filters`, color: t.muted })}
        {kpiCard({ id: "complete", label: `Complete ${N}/${N}`, value: kpi.complete, sub: fmtAmt(kpi.amtComplete), color: TEAL })}
        {kpiCard({ id: "partial", label: "Partial", value: kpi.partial, sub: `1–${N - 1} of ${N} documents`, color: t.warn })}
        {kpiCard({ id: "none", label: "Not uploaded", value: kpi.none, sub: "0 documents", color: t.bad })}
      </div>
      <div style={{ padding: "0 20px 14px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, height: 8, borderRadius: 99, background: t.surf3, overflow: "hidden", display: "flex" }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Complete ${REF}s`}>
          <div style={{ width: `${pct}%`, background: TEAL, transition: "width .4s" }} />
          <div style={{ width: `${kpi.all ? (kpi.partial / kpi.all) * 100 : 0}%`, background: t.warn, opacity: 0.75, transition: "width .4s" }} />
        </div>
        <span style={{ fontFamily: MONO, fontSize: 11, color: t.muted, whiteSpace: "nowrap" }}>
          <strong style={{ color: t.ink }}>{kpi.complete}</strong> of {kpi.all} complete · {pct}%
        </span>
      </div>

      {/* panduan 1-2-3 untuk partner / agency */}
      {isOwnerRole && (
        <ol aria-label="How it works" style={{ listStyle: "none", margin: "0 20px 12px", padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {[
            ["1", "Find your Payment ID", "Each payment from SPM has a Payment ID (e.g. PAY-202608-MPC-UMJ-01) under “My payments”. Earlier payments are listed by PO Number below."],
            ["2", `Complete the ${N} documents`, `Sign the BAST as owner, then upload your Invoice and Tax Invoice (Faktur Pajak). The Notification Letter comes from SPM. PDF, JPG or PNG — max ${MAX_FILE_BYTES / 1048576} MB per file.`],
            ["3", "Check the status", `A payment is complete at ${N}/${N}; SPM then processes it. You can download your files at any time.`],
          ].map(([no, head, body]) => (
            <li key={no} style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: 12, border: `1px solid ${t.line}`, background: t.surf2 }}>
              <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 99, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 11, fontWeight: 800, background: MAGENTA, color: "#fff" }}>{no}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: t.ink }}>{head}</span>
                <span style={{ display: "block", fontSize: 11.5, color: t.muted, lineHeight: 1.45, marginTop: 2 }}>{body}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {isOwnerRole && (
        <div style={{ margin: "0 20px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12, color: t.muted }}>
          <button className="ppd-f ppd-act-o" style={btnStyle(t, "outline", false, true)} onClick={() => setSigOpen(true)}>✍ Owner signature</button>
          <span>Upload your owner’s signature once, then use “Sign as partner (owner)” on a BAST.</span>
        </div>
      )}
      {isOwnerRole && <MyPayments rows={payRows} segment={segment} docs={docs} onOpen={(r, slot) => setOpenPay({ ...r, slot })} t={t} />}
      {isOwnerRole && <div style={{ margin: "4px 20px 8px", fontSize: 12.5, fontWeight: 700, color: t.ink }}>Earlier payments by {DOC_REF_LABEL}</div>}

      {/* hints */}
      {(hint || noRefCount > 0 || docs?.error) && (
        <div style={{ padding: "0 20px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          {docs?.error && <div role="alert" style={{ fontSize: 12, padding: "8px 12px", borderRadius: 10, color: t.bad, background: t.badBg, border: `1px solid ${t.badBd}` }}>Unable to load document status: {docs.error}</div>}
          {hint && <div style={{ fontSize: 12, padding: "8px 12px", borderRadius: 10, color: t.info, background: t.infoBg, border: `1px solid ${t.infoBd}` }}>ℹ {hint}</div>}
          {noRefCount > 0 && <div style={{ fontSize: 11.5, color: t.muted, fontFamily: MONO }}>{noRefCount.toLocaleString("en-US")} row(s) without a {REF} are not shown.</div>}
        </div>
      )}

      {/* toolbar */}
      <div style={{ padding: "10px 20px", borderTop: `1px solid ${t.line}`, borderBottom: `1px solid ${t.line}`, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: t.surf2 }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 380 }}>
          <span aria-hidden="true" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: t.muted, fontSize: 13 }}>⌕</span>
          <input className="ppd-f" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={`Search ${REF}, ${own.toLowerCase()}, project…`} aria-label="Search"
            style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 12.5, padding: "8px 30px 8px 28px", borderRadius: 10, border: `1px solid ${t.line2}`, background: t.surf, color: t.ink, outline: "none" }} />
          {q && <button className="ppd-f" onClick={() => { setQ(""); setPage(1); }} aria-label="Clear search" style={{ all: "unset", cursor: "pointer", position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: t.muted, fontSize: 15 }}>×</button>}
        </div>
        {isSPM && (
          <div role="group" aria-label="Documents by" style={{ display: "inline-flex", background: t.surf3, borderRadius: 10, padding: 3, gap: 2, border: `1px solid ${t.line}` }}>
            {[["po", `By ${DOC_REF_LABEL.replace(" Number", "")}`], ["pay", "By Payment ID"]].map(([k, l]) => (
              <button key={k} className="ppd-f" aria-pressed={refMode === k} onClick={() => setMode(k)}
                style={{ fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, padding: "5px 10px", borderRadius: 8, border: 0, cursor: "pointer", background: refMode === k ? MAGENTA : "transparent", color: refMode === k ? "#fff" : t.muted, whiteSpace: "nowrap" }}>{l}</button>
            ))}
          </div>
        )}
        <div role="group" aria-label="Filter status" style={{ display: "inline-flex", background: t.surf3, borderRadius: 10, padding: 3, gap: 2, border: `1px solid ${t.line}`, flexWrap: "wrap" }}>
          {[["all", "All"], ["complete", "Complete"], ["partial", "Partial"], ["none", "Not uploaded"]].map(([id, l]) => (
            <button key={id} className="ppd-f" aria-pressed={status === id} onClick={() => { setStatus(id); setPage(1); }}
              style={{ fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 8, border: 0, cursor: "pointer", background: status === id ? TEAL : "transparent", color: status === id ? "#fff" : t.muted, whiteSpace: "nowrap" }}>{l}</button>
          ))}
        </div>
        <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, color: t.muted, whiteSpace: "nowrap" }}>{filtered.length.toLocaleString("en-US")} {REF}s</span>
        {isSPM && curStep === "upload" && (payMode ? (
          <button className="ppd-f ppd-act" style={btnStyle(t, "primary", false, true)} onClick={() => setSignedOpen(true)}
            title="Upload approved / signed BAST & Notification Letters for many partners at once (PDFs or ZIP). Payment IDs can be created from the Excel.">
            ⬆ Bulk Upload
          </button>
        ) : (
          <span title={!docs?.loaded ? "Loading documents…" : !rows.length ? `No ${REF}s in the current Payout filters — change the filters above, or switch to “By Payment ID”.` : undefined} style={{ display: "inline-flex" }}>
            <button className="ppd-f ppd-act" style={btnStyle(t, "primary", !docs?.loaded || !rows.length, true)} disabled={!docs?.loaded || !rows.length} onClick={() => setBulkOpen(true)}
              title={`Upload many files at once — automatically matched to a ${REF} by file name`}>
              ⬆ Bulk Upload
            </button>
          </span>
        ))}
        {selectable && (
          <span title={selected.length ? undefined : bulk ? "Please wait — a download is in progress." : `Tick complete (${N}/${N}) ${REF}s in the table first.`} style={{ display: "inline-flex" }}>
            <button className="ppd-f ppd-act" style={btnStyle(t, "primary", !selected.length || !!bulk, true)} disabled={!selected.length || !!bulk} onClick={mergeSelected}
              title={selected.length ? `Download ${selected.length} merged PDF(s) as one ZIP` : `Select complete ${REF}s first`}>
              <IcoDownload /> Download merged ({selected.length})
            </button>
          </span>
        )}
      </div>

      <div style={{ padding: "7px 20px", borderBottom: `1px solid ${t.line}`, fontSize: 11, color: t.muted, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontWeight: 600 }}>Documents:</span>
        {DOC_TYPES.map((d) => <span key={d.key}><b style={{ fontFamily: MONO, color: t.ink2 }}>{d.short}</b> {d.label.replace(/\s*\(.*\)$/, "")}</span>)}
        <span style={{ marginLeft: "auto" }}><b style={{ color: TEAL_D }}>✓</b> uploaded · <b>+</b> missing{rows.some((r) => r.canWrite) ? " (click to upload)" : ""}</span>
      </div>

      {/* table */}
      <div style={{ overflow: "auto", maxHeight: "68vh" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12, minWidth: 1040 }}>
          <thead><tr>
            {selectable && (
              <th style={th({ width: 34, textAlign: "center" })}>
                <input type="checkbox" className="ppd-f" aria-label={`Select all complete ${REF}s on this page`} checked={pageAllSel} disabled={!pageSelectable.length || !!bulk}
                  ref={(el) => { if (el) el.indeterminate = !pageAllSel && pageSomeSel; }} onChange={togglePage} />
              </th>
            )}
            {sortTh("ref", REF)}
            {sortTh("partner", own)}
            {sortTh("title", "Project")}
            {sortTh("amount", "Amount", "right")}
            <th style={th()}>Documents</th>
            {sortTh("n", "Status")}
            {sortTh("lastAt", "Last updated")}
            <th style={th({ textAlign: "right", position: "sticky", right: 0, zIndex: 3, boxShadow: `-8px 0 10px -8px rgba(0,0,0,0.18)` })}>Actions</th>
          </tr></thead>
          <tbody>
            {!docs?.loaded || (payMode && payRows == null)
              ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: cols }).map((__, j) => <td key={j} style={td()}><Skel t={t} w={j === 4 ? 150 : "80%"} /></td>)}</tr>
              ))
              : pageRows.length === 0
                ? <tr><td colSpan={cols} style={{ padding: "40px 16px", textAlign: "center", color: t.muted }}>
                    <div style={{ fontSize: 26, marginBottom: 6 }} aria-hidden="true">🗂</div>
                    {payMode && !rows.length ? <>
                      <div style={{ fontWeight: 700, color: t.ink, fontSize: 13.5 }}>No Payment IDs yet. Create them from your Excel and upload the approved BAST &amp; Letters in one go.</div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>Payment IDs come from Partner Letters (all periods) — the Payout filters above do not hide them.</div>
                      <div style={{ display: "flex", gap: 10, justifyContent: "center", alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
                        <button className="ppd-f ppd-act" style={btnStyle(t, "primary")} onClick={() => setSignedOpen(true)}>⬆ Bulk upload signed BAST &amp; Letters</button>
                        {onGoLetters && <button className="ppd-f" style={{ all: "unset", cursor: "pointer", color: t.goodDark || TEAL_D, fontWeight: 600, fontSize: 12.5 }} onClick={onGoLetters}>or generate letters in Partner Letters</button>}
                      </div>
                    </> : <>
                      <div style={{ fontWeight: 700, color: t.ink, fontSize: 13.5 }}>{rows.length ? `No ${REF}s match your search` : isOwnerRole ? `No ${REF}s for your company in the selected period` : `No ${REF}s in the current data`}</div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>{rows.length ? `Adjust the search or status filter${status !== "all" ? ` (showing “${status === "none" ? "Not uploaded" : status[0].toUpperCase() + status.slice(1)}” only)` : ""}.` : isOwnerRole ? `Check the period and filters above. If a ${REF} is missing, please contact SPM.` : "Check the Payout filters above."}</div>
                    </>}
                    {(q || status !== "all") && <button className="ppd-f" style={{ ...btnStyle(t, "outline", false, true), marginTop: 10 }} onClick={() => { setQ(""); setStatus("all"); setPage(1); }}>Reset search &amp; filters</button>}
                  </td></tr>
                : pageRows.map((r, i) => {
                  const zebra = i % 2 === 1 ? t.rowStripe : "transparent";
                  const isSel = sel.has(r.key);
                  return (
                    <tr key={r.key} className="ppd-row" tabIndex={0} onClick={() => openDrawer(r.key)}
                      onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDrawer(r.key); } }}
                      aria-label={`${REF} ${r.ref}, ${r.partner}, ${r.n} of ${N} documents. Press Enter to open.`}
                      style={{ cursor: "pointer", background: isSel ? t.goodBg : zebra, transition: "background .1s" }}
                      onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = t.rowHover; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = isSel ? t.goodBg : zebra; }}>
                      {selectable && (
                        <td style={td({ textAlign: "center" })} onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" className="ppd-f" aria-label={`Select ${r.ref}`} checked={isSel} disabled={r.st !== "complete" || !!bulk}
                            title={r.st !== "complete" ? `Only complete (${N}/${N}) ${REF}s can be selected` : undefined} onChange={() => toggle(r.key)} />
                        </td>
                      )}
                      <td style={td({ fontFamily: MONO, fontWeight: 700, color: t.ink, whiteSpace: "nowrap" })}>
                        {r.ref}{r.records > 1 && <span title={`${r.records} data rows share this ${REF} (amounts combined)`} style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 600, color: t.muted, padding: "1px 5px", borderRadius: 6, background: t.surf3 }}>×{r.records}</span>}
                      </td>
                      <td style={td({ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 })} title={r.partner}>{r.partner}</td>
                      <td style={td({ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: t.muted })} title={r.title}>{r.title || "—"}</td>
                      <td style={td({ textAlign: "right", fontFamily: MONO, whiteSpace: "nowrap", color: t.ink })}>{r.amountText}</td>
                      <td style={td()} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "nowrap" }}>
                          {DOC_TYPES.map((d) => <DocChip key={d.key} dt={d} ty={r.stat?.types?.[d.key]} canWrite={r.canWrite} appr={approvalStatus(docs?.approvals?.[approvalKey(segment, r.partner, r.ref, d.key)])} onClick={() => openDrawer(r.key, d.key)} t={t} />)}
                        </div>
                      </td>
                      <td style={td()}>
                        <Ring n={r.n} t={t} />
                        <div style={{ fontSize: 10.5, marginTop: 2, whiteSpace: "nowrap", color: r.st === "complete" ? (t.goodDark || TEAL_D) : r.st === "partial" ? (t.warnDark || "#8a6a00") : t.muted }}>
                          {r.st === "complete" ? (isOwnerRole ? "Complete — with SPM" : "Complete") : r.st === "partial" ? `${N - r.n} missing` : "Not started"}
                        </div>
                      </td>
                      <td style={td({ fontFamily: MONO, fontSize: 11, color: r.lastAt ? t.ink2 : t.muted2, whiteSpace: "nowrap" })}>{r.lastAt ? fmtDT(r.lastAt) : <span style={{ fontFamily: "inherit", fontStyle: "italic" }}>{r.canWrite ? "No documents yet — click Upload" : "No documents yet"}</span>}</td>
                      <td style={td({ textAlign: "right", position: "sticky", right: 0, zIndex: 1, background: t.surf, boxShadow: `-8px 0 10px -8px rgba(0,0,0,0.18)` })} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                          {curStep === "merge" ? (
                            <button className="ppd-f ppd-act" style={btnStyle(t, "primary", !!rowBusy || !!bulk || !r.n, true)} disabled={!!rowBusy || !!bulk || !r.n}
                              onClick={() => mergeOne(r)} aria-label={`Download merged PDF for ${r.ref}`} title={!r.n ? "No documents to merge yet" : `Merge ${r.n}/${N} documents into one PDF`}>
                              <IcoDownload />{rowBusy === r.key ? "…" : "Merge"}
                            </button>
                          ) : r.canWrite && r.n < N ? (
                            <button className="ppd-f ppd-act" style={btnStyle(t, "primary", false, true)} onClick={() => openDrawer(r.key, r.firstMissing || DOC_TYPES[0].key)}
                              aria-label={`Upload documents for ${r.ref}`} title={r.firstMissing ? `Upload ${DOC_TYPES.find((d) => d.key === r.firstMissing)?.label}` : "Add or replace documents"}>
                              ⬆ Upload
                            </button>
                          ) : (
                            <button className="ppd-f ppd-act-o" style={btnStyle(t, "outline", false, true)} onClick={() => openDrawer(r.key)} aria-label={`View documents for ${r.ref}`}>
                              View ({r.n}/{N})
                            </button>
                          )}
                          <RowMenu t={t} label={`More actions for ${r.ref}`} items={[
                            { label: `View documents (${r.n}/${N})`, onClick: () => openDrawer(r.key) },
                            r.canWrite && { label: "⬆ Upload / replace documents", onClick: () => openDrawer(r.key, r.firstMissing || DOC_TYPES[0].key) },
                            isSPM && { label: "Merge into one PDF", onClick: () => mergeOne(r), disabled: !r.n || !!rowBusy, hint: !r.n ? "No documents yet" : undefined },
                            { label: "Download all files (ZIP)", onClick: () => downloadAllFiles(r), disabled: !r.n },
                          ]} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      {docs?.loaded && filtered.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 20px", borderTop: `1px solid ${t.line}`, background: t.surf2, flexWrap: "wrap", borderRadius: selected.length && isSPM ? 0 : "0 0 18px 18px" }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: t.muted, display: "inline-flex", alignItems: "center", gap: 8 }}>
            {(curPage - 1) * pageSize + 1}–{Math.min(curPage * pageSize, filtered.length)} of {filtered.length.toLocaleString("en-US")}
            <select className="ppd-f" aria-label="Rows per page" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              style={{ fontFamily: MONO, fontSize: 11, padding: "3px 6px", borderRadius: 7, border: `1px solid ${t.line2}`, background: t.surf, color: t.ink }}>
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / page</option>)}
            </select>
          </span>
          {totalPages > 1 && (
            <nav aria-label="Pagination" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <PageBtn label="‹ Prev" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)} t={t} />
              {(() => {
                let s = Math.max(1, curPage - 2); const e = Math.min(totalPages, s + 4); s = Math.max(1, e - 4);
                return Array.from({ length: e - s + 1 }, (_, k) => s + k).map((p) => <PageBtn key={p} label={String(p)} active={p === curPage} onClick={() => setPage(p)} t={t} />);
              })()}
              <PageBtn label="Next ›" disabled={curPage >= totalPages} onClick={() => setPage(curPage + 1)} t={t} />
            </nav>
          )}
        </div>
      )}

      {/* SPM bulk bar */}
      {selectable && (selected.length > 0 || bulk) && (
        <div role="region" aria-label={`Actions for selected ${REF}s`} style={{ position: "sticky", bottom: 0, zIndex: 3, borderTop: `1px solid ${t.line2}`, background: t.surf, borderRadius: "0 0 18px 18px", padding: "11px 20px", boxShadow: "0 -6px 18px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>
              <span style={{ fontFamily: MONO, color: TEAL_D }}>{bulk ? bulk.total : selected.length}</span> {REF}(s) selected
            </span>
            {bulk && <span style={{ fontFamily: MONO, fontSize: 11, color: t.muted }}>{bulk.i < bulk.total ? `Merging ${bulk.i + 1}/${bulk.total} · ${bulk.ref}` : "Creating ZIP…"}</span>}
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button className="ppd-f" style={btnStyle(t, "ghost", !!bulk, true)} disabled={!!bulk} onClick={() => setSel(new Set())}>Clear selection</button>
              {APPROVAL_ENABLED && docs?.canManageApprovals && docs?.approvalsAvailable !== false && (
                <button className="ppd-f ppd-act-o" style={btnStyle(t, "outline", !!bulk)} disabled={!!bulk} onClick={() => setReqOpen(true)}>✉ Request approval</button>
              )}
              <button className="ppd-f" style={btnStyle(t, "primary", !!bulk)} disabled={!!bulk} onClick={mergeSelected}><IcoDownload /> Download selected (merged)</button>
            </div>
          </div>
          {bulk && <IndeterminateBar t={t} pct={Math.round((bulk.i / Math.max(1, bulk.total)) * 100)} />}
        </div>
      )}

      {openRow && <RefDocsDrawer key={openRow.key} refId={openRow.ref} partnerName={openRow.partner} segment={segment} title={openRow.title} amountText={openRow.amountText}
        docs={docs} focusSlot={openSlot} onClose={() => setOpenKey(null)} t={t} />}
      {sigOpen && <OwnerSignatureModal onClose={() => setSigOpen(false)} t={t} />}
      {openPay && <RefDocsDrawer key={openPay.ref} refId={openPay.ref} partnerName={openPay.partner} segment={segment} title={openPay.title}
        docs={docs} focusSlot={openPay.slot || null} onClose={() => setOpenPay(null)} t={t} />}
      {signedOpen && <BulkSignedModal docs={docs} onClose={() => setSignedOpen(false)} t={t} />}
      {bulkOpen && <BulkUploadModal rows={rows} segment={segment} docs={docs} onClose={() => setBulkOpen(false)} t={t} />}
      {reqOpen && <BulkApprovalModal rows={selected} segment={segment} docs={docs} onClose={() => setReqOpen(false)} t={t} />}
    </div>
  );
}

function PageBtn({ label, active, disabled, onClick, t }) {
  return (
    <button className="ppd-f" onClick={onClick} disabled={disabled} aria-current={active ? "page" : undefined}
      style={{ fontFamily: MONO, fontSize: 11, fontWeight: active ? 700 : 500, padding: "5px 11px", borderRadius: 8, minWidth: 32, border: `1px solid ${active ? TEAL : t.line2}`, background: active ? TEAL : t.surf, color: active ? "#fff" : disabled ? t.muted2 : t.ink, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1 }}>
      {label}
    </button>
  );
}

// ── Bulk Upload (khusus SPM) ───────────────────────────────────────────────
// Banyak file sekaligus untuk 1 jenis dokumen; tiap file dicocokkan ke PO dari nama file / path folder.

// Pencocokan nama file → referensi dokumen (DOC_REF_COLUMN: sekarang PO Number, nanti Invoice ID).
// Nilai referensi diambil dari baris data yang sedang dimuat, jadi ganti DOC_REF_COLUMN = ganti matcher.
// Aturan: tidak peka huruf besar/kecil; pemisah (- _ / . spasi) diabaikan; minimal REF_MIN_LEN karakter
// alfanumerik supaya tidak salah tangkap; kalau ada beberapa yang cocok, referensi terpanjang menang.
const REF_MIN_LEN = 5;
const alnum = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const tokens = (s) => ` ${String(s || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()} `;

function matchFile(path, index) {
  const hayTok = tokens(path);   // "BAST_INV-2026/001.pdf" → " BAST INV 2026 001 PDF "
  const hayAl = alnum(path);     // → "BASTINV2026001PDF"
  // 1) referensi di nama file / folder — utuh per kata dulu, lalu tanpa pemisah; terpanjang menang
  let best = null;
  for (const r of index.byRefLen) {
    if (best && r.refAl.length < best.len) break;
    const hit = hayTok.includes(r.refTok) || hayAl.includes(r.refAl);
    if (!hit) continue;
    if (!best) best = { len: r.refAl.length, al: r.refAl, rows: [r.row] };
    else if (r.refAl === best.al) best.rows.push(r.row);
  }
  if (best) return best.rows.length === 1 ? { how: "po", key: best.rows[0].key, cands: [] } : { how: "partner", key: "", cands: best.rows.map((x) => x.key) };
  // 2) nama partner/agency di nama file → pilih referensi milik partner itu
  const p = index.partners.find((x) => x.al.length >= 4 && hayAl.includes(x.al));
  if (p) return { how: "partner", key: p.rows.length === 1 ? p.rows[0].key : "", cands: p.rows.map((x) => x.key) };
  return { how: "none", key: "", cands: [] };
}

// Folder yang di-drop: telusuri isinya (Chrome/Edge/Safari)
async function filesFromDrop(dt) {
  const items = Array.from(dt?.items || []);
  const entries = items.map((it) => it.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return Array.from(dt?.files || []).map((f) => ({ file: f, path: f.name }));
  const out = [];
  const walk = async (entry, prefix) => {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      out.push({ file, path: prefix + file.name });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const e of batch) await walk(e, `${prefix}${entry.name}/`);
      } while (batch.length);
    }
  };
  for (const e of entries) await walk(e, "");
  return out;
}

function BulkUploadModal({ rows, segment, docs, onClose, t }) {
  useDocsCss();
  const [docType, setDocType] = useState(DOC_TYPES[1].key); // default BAST (paling sering banyak file)
  const [items, setItems] = useState([]);                  // { id, file, path, err, key, how, cands, status, msg }
  const [phase, setPhase] = useState("pick");              // pick | review | uploading | done
  const [prog, setProg] = useState({ i: 0, total: 0 });
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);
  const dirRef = useRef(null);
  const closeRef = useRef(null);
  const busy = phase === "uploading";
  const REF_EXAMPLE = rows[0]?.ref || "1234567890";
  const dtLabel = DOC_TYPES.find((d) => d.key === docType)?.label;

  const byKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);
  const index = useMemo(() => {
    const byRefLen = rows.map((row) => ({ row, refTok: tokens(row.ref), refAl: alnum(row.ref) }))
      .filter((x) => x.refAl.length >= REF_MIN_LEN)
      .sort((a, b) => b.refAl.length - a.refAl.length);
    const pm = new Map();
    rows.forEach((row) => {
      const k = partnerKey(row.partner);
      if (!pm.has(k)) pm.set(k, { al: alnum(k), rows: [] });
      pm.get(k).rows.push(row);
    });
    const partners = [...pm.values()].sort((a, b) => b.al.length - a.al.length);
    return { byRefLen, partners };
  }, [rows]);

  useEffect(() => {
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const tryClose = () => { if (busy) { toast(t, "Please wait for the upload to finish.", "info"); return; } onClose(); };

  const addFiles = (list) => {
    const clean = list.filter(({ path }) => !/(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini|\._[^/]*)$/i.test(path));
    if (!clean.length) return;
    setItems((cur) => {
      const seen = new Set(cur.map((x) => `${x.path}|${x.file.size}`));
      const add = clean.filter(({ file, path }) => !seen.has(`${path}|${file.size}`)).map(({ file, path }, i) => ({
        id: `${Date.now()}_${cur.length + i}`, file, path, err: validateFile(file), status: "pending", msg: "", ...matchFile(path, index),
      }));
      return [...cur, ...add];
    });
    setPhase("review");
  };

  const onPick = (e) => { addFiles(Array.from(e.target.files || []).map((f) => ({ file: f, path: f.webkitRelativePath || f.name }))); e.target.value = ""; };
  const onDrop = async (e) => { e.preventDefault(); setDrag(false); if (busy) return; addFiles(await filesFromDrop(e.dataTransfer)); };

  const setKey = (id, key) => setItems((cur) => cur.map((x) => (x.id === id ? { ...x, key } : x)));
  const remove = (id) => setItems((cur) => cur.filter((x) => x.id !== id));

  const isLocked = (key) => { const r = byKey.get(key); return !!r && approvalStatus(docs?.approvals?.[approvalKey(segment, r.partner, r.ref, docType)]) === "approved"; };
  const ready = items.filter((x) => !x.err && x.key && byKey.has(x.key) && !isLocked(x.key));
  const counts = {
    ok: items.filter((x) => !x.err && x.key && x.how === "po").length,
    manual: items.filter((x) => !x.err && x.key && x.how !== "po").length,
    need: items.filter((x) => !x.err && !x.key).length,
    bad: items.filter((x) => x.err).length,
  };

  const start = async () => {
    const todo = ready;
    if (!todo.length) return;
    setPhase("uploading");
    setProg({ i: 0, total: todo.length });
    const mark = (id, patch) => setItems((cur) => cur.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    let okN = 0, errN = 0, skipN = 0;
    for (let i = 0; i < todo.length; i++) {
      const it = todo[i];
      const row = byKey.get(it.key);
      mark(it.id, { status: "up" });
      try {
        const { ok, errors, skipped } = await uploadSlot({ files: [it.file], partnerName: row.partner, refId: row.ref, docType, segment });
        if (ok.length) { okN++; mark(it.id, { status: "ok", msg: "uploaded" }); }
        else if (skipped.length) { skipN++; mark(it.id, { status: "skip", msg: "identical file already exists — skipped" }); }
        else { errN++; mark(it.id, { status: "err", msg: errors[0]?.message || "failed" }); }
      } catch (e) { errN++; mark(it.id, { status: "err", msg: errMsg(e) }); }
      setProg({ i: i + 1, total: todo.length });
    }
    setPhase("done");
    docs?.refresh?.();
    toast(t, `Bulk upload ${dtLabel}: ${okN} uploaded${skipN ? `, ${skipN} skipped` : ""}${errN ? `, ${errN} failed` : ""}.`, errN ? "err" : "ok");
  };

  const statusCell = (x) => {
    if (x.err) return <span style={{ color: t.bad }}>✕ {x.err}</span>;
    if (x.status === "up") return <span style={{ color: t.muted }}>uploading…</span>;
    if (x.status === "ok") return <span style={{ color: t.goodDark || TEAL_D, fontWeight: 700 }}>✓ uploaded</span>;
    if (x.status === "skip") return <span style={{ color: t.muted }}>↷ {x.msg}</span>;
    if (x.status === "err") return <span style={{ color: t.bad }}>✕ {x.msg}</span>;
    const row = byKey.get(x.key);
    const exists = row?.stat?.types?.[docType]?.n > 0;
    if (x.key && isLocked(x.key)) return <span style={{ color: t.muted, fontWeight: 600 }}>🔒 Approved — locked (skipped)</span>;
    if (!x.key) return <span style={{ color: t.warnDark || t.warn, fontWeight: 600 }}>{x.how === "partner" ? `Select ${DOC_REF_LABEL}` : `No match — select ${DOC_REF_LABEL}`}</span>;
    return (
      <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ color: t.goodDark || TEAL_D, fontWeight: 600 }}>{x.how === "po" ? "✓ Matched" : "✓ Selected"}</span>
        {exists && <span title={`This ${DOC_REF_LABEL} already has ${dtLabel}. New files will be ADDED (existing files are kept).`} style={{ fontFamily: MONO, fontSize: 9.5, padding: "1px 6px", borderRadius: 6, background: t.warnBg, color: t.warnDark || t.warn, border: `1px solid ${t.warnBd}` }}>has existing files</span>}
      </span>
    );
  };

  const th = { position: "sticky", top: 0, zIndex: 1, background: t.surf2, fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: t.muted, fontWeight: 500, padding: "8px 9px", borderBottom: `1.5px solid ${t.line2}`, textAlign: "left", whiteSpace: "nowrap" };
  const td = { padding: "7px 9px", borderBottom: `1px solid ${t.line}`, verticalAlign: "middle", fontSize: 12, color: t.ink2 };
  const optLabel = (r) => `${r.ref} — ${r.partner}`;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) tryClose(); }} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); tryClose(); } }}
      className="ppd-anim" style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12, animation: "ppd_fade .15s ease-out" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="ppd-bulk-title"
        onDragOver={(e) => { if (busy) return; e.preventDefault(); if (!drag) setDrag(true); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false); }} onDrop={onDrop}
        style={{ width: "min(1000px, 100%)", maxHeight: "92vh", display: "flex", flexDirection: "column", background: t.surf, color: t.ink, borderRadius: 18, border: `1.5px solid ${drag ? TEAL : t.line}`, boxShadow: t.shadow2, overflow: "hidden", textAlign: "left" }}>
        {/* header */}
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "flex-start", gap: 12, background: t.surf2 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: MAGENTA, fontWeight: 700 }}>SPM · Bulk Upload</div>
            <div id="ppd-bulk-title" style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>Upload multiple documents at once</div>
            <div style={{ fontSize: 12, color: t.muted, marginTop: 3, lineHeight: 1.45 }}>
              Files are matched to a {DOC_REF_LABEL} automatically using the <b>file or folder name</b> (e.g. <span style={{ fontFamily: MONO }}>BAST_{REF_EXAMPLE}.pdf</span> or folder <span style={{ fontFamily: MONO }}>{REF_EXAMPLE}/BAST.pdf</span>). If only the {ownerLabel(segment).toLowerCase()} name is recognised, simply select the {DOC_REF_LABEL}.
            </div>
          </div>
          <button ref={closeRef} className="ppd-f" onClick={tryClose} aria-label="Close (Esc)" style={{ ...btnStyle(t, "ghost", false, true), fontSize: 20, lineHeight: 1, padding: "2px 8px", color: t.muted }}>×</button>
        </div>

        {/* step 1: jenis dokumen + sumber file */}
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${t.line}`, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: t.muted, marginBottom: 5 }}>1 · Document type</div>
            <div role="radiogroup" aria-label="Document type" style={{ display: "inline-flex", background: t.surf3, borderRadius: 10, padding: 3, gap: 2, border: `1px solid ${t.line}`, flexWrap: "wrap" }}>
              {DOC_TYPES.map((d, i) => (
                <button key={d.key} role="radio" aria-checked={docType === d.key} className="ppd-f" disabled={busy || phase === "done"} onClick={() => setDocType(d.key)}
                  style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "6px 11px", borderRadius: 8, border: 0, cursor: busy ? "default" : "pointer", background: docType === d.key ? TEAL : "transparent", color: docType === d.key ? "#fff" : t.muted, whiteSpace: "nowrap" }}>
                  {i + 1}. {d.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: t.muted, marginBottom: 5 }}>Segment</div>
            <span title="Follows the Partner/Agency Prepaid toggle above. Switch the toggle to upload to the other segment." style={{ display: "inline-flex", padding: "7px 11px", borderRadius: 10, fontSize: 12, fontWeight: 700, background: `${MAGENTA}14`, color: MAGENTA, border: `1px solid ${MAGENTA}30` }}>
              {ownerLabel(segment)} Prepaid · {rows.length} {DOC_REF_LABEL}
            </span>
          </div>
          {phase !== "done" && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <input ref={fileRef} type="file" accept={ACCEPT_ATTR} multiple hidden onChange={onPick} />
              <input ref={(el) => { dirRef.current = el; if (el) { el.setAttribute("webkitdirectory", ""); el.setAttribute("directory", ""); } }} type="file" multiple hidden onChange={onPick} />
              <button className="ppd-f ppd-act" style={btnStyle(t, "primary", busy)} disabled={busy} onClick={() => fileRef.current?.click()}>⬆ Select files</button>
              <button className="ppd-f ppd-act-o" style={btnStyle(t, "outline", busy)} disabled={busy} onClick={() => dirRef.current?.click()}>📁 Select folder</button>
            </div>
          )}
        </div>

        {/* step 2: preview */}
        <div style={{ flex: 1, overflow: "auto", minHeight: 180 }}>
          {!items.length ? (
            <div role="button" tabIndex={0} className="ppd-f" onClick={() => fileRef.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
              style={{ margin: 18, border: `2px dashed ${drag ? TEAL : t.line2}`, borderRadius: 16, padding: "42px 16px", textAlign: "center", cursor: "pointer", background: drag ? t.goodBg : t.surf2, color: t.muted }}>
              <div style={{ color: TEAL, display: "inline-flex" }}><IcoUp /></div>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.ink, marginTop: 6 }}>{drag ? "Release to add" : `Drag ${dtLabel} files or a folder here`}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>or click to browse · PDF · JPG · PNG — max {MAX_FILE_BYTES / 1048576} MB per file</div>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 760 }}>
              <thead><tr>
                <th style={th}>File</th><th style={{ ...th, textAlign: "right" }}>Size</th><th style={th}>{DOC_REF_LABEL}</th><th style={th}>{ownerLabel(segment)}</th><th style={th}>Status</th><th style={th}><span className="ppd-sr">Remove</span></th>
              </tr></thead>
              <tbody>
                {items.map((x) => {
                  const row = byKey.get(x.key);
                  const candRows = x.cands.length ? x.cands.map((k) => byKey.get(k)).filter(Boolean) : rows;
                  const listId = `ppd-po-${x.id}`;
                  const editable = !x.err && (phase === "review");
                  return (
                    <tr key={x.id} style={{ background: x.status === "ok" ? t.goodBg : x.status === "err" || x.err ? t.badBg : "transparent" }}>
                      <td style={{ ...td, maxWidth: 260 }}>
                        <div title={x.path} style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                          <FileIcon name={x.file.name} mime={x.file.type} t={t} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.file.name}</div>
                            {x.path !== x.file.name && <div style={{ fontFamily: MONO, fontSize: 10, color: t.muted2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.path}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ ...td, textAlign: "right", fontFamily: MONO, whiteSpace: "nowrap" }}>{fmtSize(x.file.size)}</td>
                      <td style={{ ...td, minWidth: 200 }}>
                        {editable ? (
                          x.cands.length && x.cands.length <= 60 ? (
                            <select className="ppd-f" aria-label={`${DOC_REF_LABEL} for ${x.file.name}`} value={x.key} onChange={(e) => setKey(x.id, e.target.value)}
                              style={{ width: "100%", fontFamily: MONO, fontSize: 11.5, padding: "5px 6px", borderRadius: 8, border: `1px solid ${x.key ? t.line2 : t.warn}`, background: t.surf, color: t.ink }}>
                              <option value="">— select {DOC_REF_LABEL} —</option>
                              {candRows.map((r) => <option key={r.key} value={r.key}>{optLabel(r)}</option>)}
                            </select>
                          ) : (
                            <>
                              <input className="ppd-f" list={listId} aria-label={`Search ${DOC_REF_LABEL} for ${x.file.name}`} placeholder={`Search ${DOC_REF_LABEL}…`}
                                defaultValue={row ? optLabel(row) : ""}
                                onChange={(e) => { const m = candRows.find((r) => optLabel(r) === e.target.value || r.ref === e.target.value.trim()); setKey(x.id, m ? m.key : ""); }}
                                style={{ width: "100%", boxSizing: "border-box", fontFamily: MONO, fontSize: 11.5, padding: "5px 7px", borderRadius: 8, border: `1px solid ${x.key ? t.line2 : t.warn}`, background: t.surf, color: t.ink }} />
                              <datalist id={listId}>{candRows.slice(0, 3000).map((r) => <option key={r.key} value={optLabel(r)} />)}</datalist>
                            </>
                          )
                        ) : <span style={{ fontFamily: MONO, fontWeight: 700, color: t.ink }}>{row?.ref || "—"}</span>}
                      </td>
                      <td style={{ ...td, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row?.partner}>{row?.partner || "—"}</td>
                      <td style={{ ...td, minWidth: 160 }}>{statusCell(x)}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {phase === "review" && <button className="ppd-f" onClick={() => remove(x.id)} aria-label={`Remove ${x.file.name} from the list`} title="Remove from list" style={{ ...btnStyle(t, "ghost", false, true), color: t.muted }}>✕</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* step 3: footer */}
        <div style={{ borderTop: `1px solid ${t.line}`, background: t.surf2, padding: "12px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
          {(phase === "uploading" || phase === "done") && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: 10.5, color: t.muted, marginBottom: 5 }}>{phase === "done" ? "Completed" : "Uploading"} {prog.i}/{prog.total} files…</div>
              <IndeterminateBar t={t} pct={prog.total ? Math.round((prog.i / prog.total) * 100) : 0} />
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {items.length > 0 && phase !== "done" && (
              <span style={{ fontFamily: MONO, fontSize: 11, color: t.muted, display: "inline-flex", gap: 10, flexWrap: "wrap" }}>
                <span style={{ color: t.goodDark || TEAL_D }}>✓ {counts.ok} matched</span>
                {counts.manual > 0 && <span style={{ color: t.goodDark || TEAL_D }}>✓ {counts.manual} selected</span>}
                <span style={{ color: counts.need ? (t.warnDark || t.warn) : t.muted }}>● {counts.need} need a selection</span>
                <span style={{ color: counts.bad ? t.bad : t.muted }}>✕ {counts.bad} skipped</span>
              </span>
            )}
            {phase === "done" && (
              <span style={{ fontSize: 12.5, color: t.ink }}>
                <b style={{ color: t.goodDark || TEAL_D }}>{items.filter((x) => x.status === "ok").length} uploaded</b>
                {" · "}{items.filter((x) => x.status === "skip").length} skipped (already exist)
                {" · "}<b style={{ color: items.some((x) => x.status === "err") ? t.bad : t.muted }}>{items.filter((x) => x.status === "err").length} failed</b>
                {" · "}{items.filter((x) => x.status === "pending" || x.err).length} not uploaded
              </span>
            )}
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {phase === "review" && items.length > 0 && <button className="ppd-f" style={btnStyle(t, "ghost", false, true)} onClick={() => { setItems([]); setPhase("pick"); }}>Clear list</button>}
              {phase === "done"
                ? <button className="ppd-f ppd-act" style={btnStyle(t, "primary")} onClick={onClose}>Done</button>
                : <button className="ppd-f ppd-act" style={btnStyle(t, "primary", busy || !ready.length)} disabled={busy || !ready.length} onClick={start}
                    title={!ready.length ? `No files have a ${DOC_REF_LABEL} assigned yet` : `Upload to ${dtLabel} — existing files are kept`}>
                    ⬆ {busy ? `Uploading ${prog.i}/${prog.total}…` : `Upload ${ready.length} file(s) as ${dtLabel}`}
                  </button>}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Request approval untuk banyak PO sekaligus (SPM) ───────────────────────
function BulkApprovalModal({ rows, segment, docs, onClose, t }) {
  useDocsCss();
  const [types, setTypes] = useState({ bast: true, surat_pemberitahuan: true });
  const [email, setEmail] = useState(readApprover);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  // Hanya slot yang punya file dan belum pending/approved
  const items = [];
  rows.forEach((r) => APPROVAL_DOC_TYPES.forEach((dt) => {
    if (!types[dt] || !(r.stat?.types?.[dt]?.n > 0)) return;
    const st = approvalStatus(docs?.approvals?.[approvalKey(segment, r.partner, r.ref, dt)]);
    if (st === "pending" || st === "approved") return;
    items.push({ segment, owner_name: r.partner, ref_id: r.ref, doc_type: dt, ref_title: r.title, amount_text: r.amountText });
  }));

  const send = async () => {
    const v = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { toast(t, "Please enter a valid approver email address.", "err"); return; }
    saveApprover(v);
    setBusy(true);
    try {
      const { results } = await approvalApi("request", { approver_email: v, note, items });
      const ok = results.filter((x) => x.ok).length;
      const mailErr = results.filter((x) => x.emailError).length;
      setResult(results);
      toast(t, `${ok} approval request(s) sent to ${v}${mailErr ? ` (${mailErr} email(s) failed — use Remind)` : ""}.`, ok === results.length && !mailErr ? "ok" : "err");
      docs?.refresh?.();
    } catch (e) { toast(t, errMsg(e), "err"); }
    setBusy(false);
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }} onKeyDown={(e) => { if (e.key === "Escape" && !busy) onClose(); }}
      className="ppd-anim" style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12, animation: "ppd_fade .15s ease-out" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="ppd-req-title" style={{ width: "min(520px, 100%)", maxHeight: "90vh", overflow: "auto", background: t.surf, color: t.ink, borderRadius: 18, border: `1px solid ${t.line}`, boxShadow: t.shadow2, padding: "18px 20px", textAlign: "left", display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: MAGENTA, fontWeight: 700 }}>SPM · Approval</div>
          <div id="ppd-req-title" style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>Request approval for {rows.length} {DOC_REF_LABEL}(s)</div>
          <div style={{ fontSize: 12, color: t.muted, marginTop: 3 }}>The approver signs in to SandraHub to review and decide. Slots without files, or already pending/approved, are skipped.</div>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {APPROVAL_DOC_TYPES.map((dt) => (
            <label key={dt} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              <input type="checkbox" className="ppd-f" checked={!!types[dt]} disabled={busy} onChange={(e) => setTypes((x) => ({ ...x, [dt]: e.target.checked }))} />
              {DOC_TYPES.find((d) => d.key === dt)?.label}
            </label>
          ))}
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          <span style={{ color: t.muted }}>Approver email (must have a SandraHub account)</span>
          <input className="ppd-f" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" disabled={busy}
            style={{ fontFamily: "inherit", fontSize: 13, padding: "8px 10px", borderRadius: 9, border: `1px solid ${t.line2}`, background: t.surf2, color: t.ink }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          <span style={{ color: t.muted }}>Note to approver (optional)</span>
          <textarea className="ppd-f" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} disabled={busy}
            style={{ fontFamily: "inherit", fontSize: 13, padding: "8px 10px", borderRadius: 9, border: `1px solid ${t.line2}`, background: t.surf2, color: t.ink, resize: "vertical" }} />
        </label>
        {result && (
          <ul style={{ margin: 0, padding: "8px 10px", listStyle: "none", fontSize: 11.5, fontFamily: MONO, background: t.surf2, borderRadius: 9, maxHeight: 160, overflow: "auto" }}>
            {result.map((r, i) => <li key={i} style={{ color: r.ok ? (t.goodDark || TEAL_D) : t.bad }}>{r.ok ? "✓" : "✕"} {r.ref_id} · {DOC_TYPES.find((d) => d.key === r.doc_type)?.short} {r.ok ? (r.emailError ? "— saved, email failed" : "— sent") : `— ${r.error}`}</li>)}
          </ul>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          <span style={{ marginRight: "auto", fontFamily: MONO, fontSize: 11, color: t.muted }}>{items.length} document request(s)</span>
          <button className="ppd-f" style={btnStyle(t, "ghost", busy)} disabled={busy} onClick={onClose}>{result ? "Close" : "Cancel"}</button>
          {!result && <button className="ppd-f ppd-act" style={btnStyle(t, "primary", busy || !items.length)} disabled={busy || !items.length} onClick={send}>{busy ? "Sending…" : `Send ${items.length} request(s)`}</button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Partner: tanda tangan owner (disimpan di browser partner saja) ─────────
function OwnerSigPicker({ label, hint, value, onChange, maxW, maxH, t }) {
  const ref = useRef(null);
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try { onChange(await imageToDataUrl(f, maxW, maxH)); } catch (err) { toast(t, err.message || String(err), "err"); }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: t.ink2 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 150, height: 60, borderRadius: 8, border: `1px dashed ${t.line2}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "repeating-conic-gradient(#f3f3f6 0% 25%, #ffffff 0% 50%) 50% / 12px 12px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL lokal, bukan aset */}
          {value ? <img src={value} alt={`${label} preview`} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <span style={{ fontSize: 10.5, color: "#8A8A96" }}>No image</span>}
        </div>
        <input ref={ref} type="file" accept="image/png,image/jpeg" hidden onChange={pick} aria-label={`${label} file`} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <button className="ppd-f ppd-act-o" style={btnStyle(t, "outline", false, true)} onClick={() => ref.current?.click()}>{value ? "Replace" : "Upload"}</button>
          {value && <button className="ppd-f" style={{ ...btnStyle(t, "ghost", false, true), color: t.bad }} onClick={() => onChange("")}>Remove</button>}
        </div>
      </div>
      {hint && <div style={{ fontSize: 10.5, color: t.muted }}>{hint}</div>}
    </div>
  );
}

function OwnerSignatureModal({ onClose, t }) {
  const [v, setV] = useState(readOwnerSig);
  const set = (k, x) => setV((o) => { const n = { ...o, [k]: x }; if (!writeOwnerSig(n)) toast(t, "Could not save on this browser (storage full?).", "err"); return n; });
  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = prev; }; }, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="ppd-owner-sig-title" style={{ width: "min(560px, 100%)", background: t.surf, color: t.ink, borderRadius: 18, border: `1px solid ${t.line}`, boxShadow: t.shadow2, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${t.line}`, background: t.surf2, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: MAGENTA, fontWeight: 700 }}>Partner · e-signature</div>
            <div id="ppd-owner-sig-title" style={{ fontSize: 16.5, fontWeight: 800, marginTop: 2 }}>Owner signature</div>
          </div>
          <button className="ppd-f" onClick={onClose} aria-label="Close" style={{ ...btnStyle(t, "ghost", false, true), fontSize: 20, lineHeight: 1, padding: "2px 8px", color: t.muted }}>×</button>
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 12.5, color: t.muted, lineHeight: 1.5 }}>
            Upload your company owner’s signature. It is placed only in the <b>PIHAK KEDUA</b> (partner) column of the BAST, above the owner’s name — never in the Indosat signature area. Each signing saves a new signed copy; the original document is kept.
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <OwnerSigPicker t={t} label="Owner signature" hint="PNG/JPG ≤ 1 MB · transparent PNG recommended" value={v.sig || ""} onChange={(x) => set("sig", x)} maxW={600} maxH={240} />
            <OwnerSigPicker t={t} label="Company stamp (optional)" value={v.stamp || ""} onChange={(x) => set("stamp", x)} maxW={360} maxH={360} />
          </div>
          <div style={{ fontSize: 11, color: t.muted }}>🔒 Signature images stay on this browser.</div>
        </div>
        <div style={{ borderTop: `1px solid ${t.line}`, background: t.surf2, padding: "12px 18px", display: "flex", justifyContent: "flex-end" }}>
          <button className="ppd-f ppd-act" style={btnStyle(t, "primary")} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Partner: "My payments" — 1 kartu per Payment ID milik sendiri (4 slot: BAST & Surat dari SPM, Invoice & Faktur Pajak dari partner)
function MyPayments({ rows, segment, docs, onOpen, t }) {
  if (!rows) return <div style={{ margin: "0 20px 12px" }}><Skel t={t} h={70} r={12} /></div>;
  const cards = rows.filter((r) => canWritePartner(docs?.profile, r.partner, segment));
  return (
    <section aria-label="My payments" style={{ margin: "0 20px 12px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: t.ink }}>My payments (Payment ID)</span>
        <span style={{ fontFamily: MONO, fontSize: 10.5, color: t.muted }}>{cards.length} payment(s)</span>
      </div>
      {!cards.length ? (
        <div style={{ fontSize: 12, color: t.muted, padding: "12px 14px", borderRadius: 12, border: `1px dashed ${t.line2}`, background: t.surf2 }}>
          No payments from SPM yet. When SPM issues your BAST and Notification Letter, the payment appears here.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 10 }}>
          {cards.map((r) => {
            const stat = docs?.byRef?.[statKey(segment, r.partner, r.ref)];
            const n = doneCount(stat);
            const st = statusOf(n);
            const firstMissing = DOC_TYPES.find((d) => !(stat?.types?.[d.key]?.n > 0) && !APPROVAL_DOC_TYPES.includes(d.key))?.key
              || DOC_TYPES.find((d) => !(stat?.types?.[d.key]?.n > 0))?.key || "bast";
            return (
              <div key={r.ref} style={{ border: `1.5px solid ${st === "complete" ? t.goodBd : t.line}`, borderRadius: 14, padding: "12px 14px", background: st === "complete" ? t.goodBg : t.surf, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: 12.5, color: t.ink }}>{r.ref}</div>
                    <div style={{ fontSize: 11.5, color: t.muted }}>{r.title}</div>
                  </div>
                  <Ring n={n} t={t} />
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", fontSize: 10, lineHeight: 1.2 }}>
                  {DOC_TYPES.map((d) => <DocChip key={d.key} dt={d} ty={stat?.types?.[d.key]} canWrite={!APPROVAL_DOC_TYPES.includes(d.key)} onClick={() => onOpen(r, d.key)} t={t} />)}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: st === "complete" ? (t.goodDark || TEAL_D) : st === "partial" ? (t.warnDark || "#8a6a00") : t.muted }}>
                    {st === "complete" ? "Complete — with SPM" : st === "partial" ? `${N - n} missing` : "Not started"}
                  </span>
                  <button className={`ppd-f ${st === "complete" ? "ppd-act-o" : "ppd-act"}`} style={{ ...btnStyle(t, st === "complete" ? "outline" : "primary", false, true), marginLeft: "auto" }}
                    onClick={() => onOpen(r, st === "complete" ? null : firstMissing)}>{st === "complete" ? `View (${n}/${N})` : "⬆ Complete documents"}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// Dipakai tab Partner Letters (PayoutPartnerLetters.jsx) supaya tampilan konsisten
export { TEAL, TEAL_D, MAGENTA, MONO, fmtDT, errMsg, useDocsCss, toast, btnStyle, Skel, IndeterminateBar, RowMenu, IcoDownload, IcoOpen, IcoUp, ApprovalBadge };
