"use client";
// Dokumen payout per PO (nanti per Invoice ID), Partner & Agency Prepaid — 4 slot:
//   1. Invoicing  2. BAST  3. Surat Pemberitahuan  4. Faktur Pajak
//  • finance_mpx  : upload/hapus untuk PO partner sendiri
//  • agency       : upload/hapus untuk PO agency sendiri (RLS siap; belum ada UI di portal agency)
//  • spm_sumatera : lihat semua PO, upload atas nama partner/agency, satu-satunya yang bisa merge & download
//  • IOH          : lihat & buka file saja
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DOC_TYPES, DOC_REF_LABEL, ACCEPT_ATTR, MAX_FILE_BYTES, statKey, ownerLabel, doneCount, fmtSize, fileKind,
  canViewAll, canViewPartner, canWritePartner, canMerge,
  fetchDocStats, listRefDocs, uploadSlot, deleteDocs, signedUrl,
  downloadMergedPdf, downloadMergedZip, downloadDoc, downloadDocsZip, refZipName, friendlyError, uploaderLabel,
  validateFile, partnerKey,
} from "../../../lib/payoutPartnerDocs";

const TEAL = "#32BCAD", TEAL_D = "#27a093", MAGENTA = "#C6168D";
const MONO = "'SF Mono','Fira Code','DM Mono',monospace";
const N = DOC_TYPES.length;
const PAGE_SIZES = [25, 50, 100];

// ── util ───────────────────────────────────────────────────────────────────
const fmtDT = (iso) => iso ? new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtD  = (iso) => iso ? new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }) : "";
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
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchDocStats()
      .then((byRef) => { if (alive) setState({ byRef, loaded: true, error: "" }); })
      .catch((e) => { if (alive) setState((s) => ({ ...s, loaded: true, error: errMsg(e) })); });
    return () => { alive = false; };
  }, [enabled, tick]);
  const refresh = useCallback(() => setTick((x) => x + 1), []);
  return { enabled, ...state, refresh, profile, canMerge: canMerge(profile) };
}

// ── atom UI ────────────────────────────────────────────────────────────────
function Ring({ n, t, size = 26, label = true }) {
  const r = size / 2 - 3, c = 2 * Math.PI * r, col = nColor(n, t);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }} aria-label={`${n} dari ${N} dokumen`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={t.surf3} strokeWidth="3.5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth="3.5" strokeLinecap="round"
          strokeDasharray={`${(n / N) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      {label && <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: nInk(n, t) }}>{n}/{N}</span>}
    </span>
  );
}

// Chip status per jenis dokumen. Dengan onClick → tombol yang membuka drawer di slot itu.
function DocChip({ dt, ty, t, onClick, canWrite }) {
  const ok = ty?.n > 0;
  const tip = ok
    ? `${dt.label} · ${ty.n} file · terakhir ${fmtDT(ty.lastAt)} — klik untuk lihat`
    : `${dt.label} · belum diupload${canWrite ? " — klik untuk upload" : ""}`;
  const style = {
    display: "inline-flex", alignItems: "center", gap: 3, fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: "0.02em",
    padding: "3px 8px", borderRadius: 99, whiteSpace: "nowrap", transition: "transform .1s, box-shadow .15s, background .15s",
    background: ok ? TEAL : "transparent", color: ok ? "#fff" : t.muted,
    border: ok ? `1px solid ${TEAL}` : `1px dashed ${t.line2}`,
  };
  const content = <><span aria-hidden="true">{ok ? "✓" : "+"}</span>{dt.short}</>;
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
    <span title={`Diupload oleh ${l}`} style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", padding: "1px 6px", borderRadius: 5, textTransform: "uppercase",
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
  const dash = <span style={{ color: t.muted2, fontFamily: MONO, fontSize: 10.5 }} title={!refId ? `Tanpa ${DOC_REF_LABEL}` : undefined}>—</span>;
  if (!docs?.enabled || !refId || !partnerName || !canViewPartner(docs.profile, partnerName, segment)) return dash;
  const stat = docs.byRef[statKey(segment, partnerName, refId)];
  const n = doneCount(stat);
  const tip = DOC_TYPES.map((d) => `${stat?.types?.[d.key]?.n > 0 ? "✓" : "✗"} ${d.label}`).join("\n");
  return (
    <>
      <button className="ppd-f" onClick={(e) => { e.stopPropagation(); setOpen(true); }} title={`${DOC_REF_LABEL} ${refId}\n${tip}`}
        aria-label={`Dokumen ${DOC_REF_LABEL} ${refId}: ${n} dari ${N}`}
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
    if (busy) { toast(t, "Tunggu proses upload/merge selesai dulu.", "info"); return; }
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
  const present = DOC_TYPES.filter((d) => list.some((x) => x.doc_type === d.key)).length;
  const nextMissing = DOC_TYPES.find((d) => !list.some((x) => x.doc_type === d.key));
  const totalSize = list.reduce((s, d) => s + (Number(d.size_bytes) || 0), 0);

  const onMerge = async () => {
    setMerge({ i: 0, total: list.length });
    try {
      const r = await downloadMergedPdf({
        refId, partnerName, segment, title, amountText, docs: list,
        onProgress: ({ index, total }) => setMerge({ i: index + 1, total }),
      });
      if (r.skipped.length) toast(t, `PDF terunduh, tapi ${r.skipped.length} file dilewati (lihat halaman cover).`, "info");
      else toast(t, `PDF ${refId} terunduh (${present}/${N} dokumen).`);
    } catch (e) { toast(t, `Merge gagal: ${errMsg(e)}`, "err"); }
    setMerge(null);
  };

  const onZipAll = async () => {
    setZipping({ i: 0, total: list.length });
    try {
      const { failed } = await downloadDocsZip(list, refZipName(refId, partnerName, "dokumen"), {
        byType: true, onProgress: ({ index, total }) => setZipping({ i: index + 1, total }),
      });
      if (failed.length) toast(t, `ZIP terunduh, ${failed.length} file gagal: ${failed[0]}`, "err");
      else toast(t, `ZIP ${list.length} file terunduh.`);
    } catch (e) { toast(t, `Gagal membuat ZIP: ${errMsg(e)}`, "err"); }
    setZipping(null);
  };

  const roHint = docs?.profile?.role === "finance_mpx" || docs?.profile?.role === "agency"
    ? `${DOC_REF_LABEL} ini bukan milik ${ownerLabel(segment).toLowerCase()} kamu, jadi hanya bisa dilihat.`
    : `Mode lihat saja: kamu bisa membuka & download file. Upload & hapus dilakukan oleh ${ownerLabel(segment).toLowerCase()} pemilik ${DOC_REF_LABEL} atau SPM.`;

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
              Dokumen {ownerLabel(segment)} · {DOC_REF_LABEL}
            </div>
            <div id="ppd-title" style={{ fontSize: 19, fontWeight: 800, marginTop: 3, fontFamily: MONO, letterSpacing: "-0.01em", wordBreak: "break-all" }}>{refId}</div>
            <div style={{ fontSize: 12.5, color: t.ink2, marginTop: 4, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={partnerName}>{partnerName}</div>
            {title && <div style={{ fontSize: 11.5, color: t.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={title}>Project: {title}</div>}
            {amountText && <div style={{ fontFamily: MONO, fontSize: 12, color: t.ink, marginTop: 3, fontWeight: 700 }}>{amountText}</div>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <button ref={closeRef} className="ppd-f" onClick={tryClose} aria-label="Tutup panel (Esc)" title="Tutup (Esc)"
              style={{ ...btnStyle(t, "ghost", false, true), fontSize: 20, lineHeight: 1, padding: "2px 8px", color: t.muted }}>×</button>
            {loading ? <Skel w={56} h={22} t={t} /> : <Ring n={present} t={t} />}
          </div>
        </div>

        {/* progress per slot (klik = lompat ke slot) */}
        <div style={{ padding: "0 18px 12px", background: t.surf, borderBottom: `1px solid ${t.line}` }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${N},1fr)`, gap: 4 }}>
            {DOC_TYPES.map((d) => {
              const ok = list.some((x) => x.doc_type === d.key);
              return (
                <button key={d.key} className="ppd-f" onClick={() => setFocus((f) => ({ key: d.key, n: f.n + 1 }))} title={`${d.label}: ${ok ? "sudah ada" : "belum"}`}
                  style={{ all: "unset", cursor: "pointer", display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ height: 5, borderRadius: 99, background: loading ? t.surf3 : ok ? TEAL : t.surf3 }} />
                  <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: ok ? (t.goodDark || TEAL_D) : t.muted2, textAlign: "center" }}>{ok ? "✓ " : ""}{d.short}</span>
                </button>
              );
            })}
          </div>
          {!loading && canWrite && nextMissing && (
            <button className="ppd-f" onClick={() => setFocus((f) => ({ key: nextMissing.key, n: f.n + 1 }))}
              style={{ ...btnStyle(t, "primary", false, true), marginTop: 10, width: "100%" }}>
              ⬆ Upload berikutnya: {nextMissing.label}
            </button>
          )}
          {!loading && present === N && <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 600, color: t.goodDark || TEAL_D, textAlign: "center" }}>✓ Semua {N} dokumen sudah lengkap</div>}
        </div>

        {!canWrite && (
          <div role="note" style={{ margin: "12px 18px 0", padding: "9px 12px", borderRadius: 10, fontSize: 12, color: t.info, background: t.infoBg, border: `1px solid ${t.infoBd}`, display: "flex", gap: 8, alignItems: "flex-start", lineHeight: 1.45 }}>
            <span aria-hidden="true" style={{ fontWeight: 800 }}>ℹ</span>{roHint}
          </div>
        )}
        {loadErr && <div role="alert" style={{ margin: "12px 18px 0", padding: "9px 12px", borderRadius: 10, fontSize: 12, color: t.bad, background: t.badBg, border: `1px solid ${t.badBd}` }}>Gagal memuat dokumen: {loadErr}</div>}

        {/* slots */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          {loading
            ? DOC_TYPES.map((d) => (
              <div key={d.key} style={{ border: `1px solid ${t.line}`, borderRadius: 14, padding: 14, background: t.surf, display: "flex", flexDirection: "column", gap: 10 }}>
                <Skel w="45%" h={14} t={t} /><Skel h={54} r={10} t={t} />
              </div>))
            : DOC_TYPES.map((dt, i) => (
              <SlotCard key={dt.key} no={i + 1} dt={dt} files={list.filter((d) => d.doc_type === dt.key)}
                canWrite={canWrite} refId={refId} partnerName={partnerName} segment={segment}
                onBusy={(d) => setUploading((x) => Math.max(0, x + d))} onChanged={changed} lockAll={!!merge}
                focusTick={focus.key === dt.key ? focus.n : 0} t={t} />
            ))}
        </div>

        {/* footer */}
        <div style={{ borderTop: `1px solid ${t.line}`, background: t.surf, padding: "12px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
          {zipping && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: 10.5, color: t.muted, marginBottom: 5 }}>Menyiapkan ZIP {zipping.i}/{zipping.total} file…</div>
              <IndeterminateBar t={t} pct={zipping.total ? Math.round((zipping.i / zipping.total) * 100) : null} />
            </div>
          )}
          {merge && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: 10.5, color: t.muted, marginBottom: 5 }}>Menggabungkan {merge.i}/{merge.total} file…</div>
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
                  title={!list.length ? "Belum ada file" : `Download semua file ${DOC_REF_LABEL} ini (ZIP, dikelompokkan per jenis dokumen)`}>
                  <IcoDownload /> Download semua dokumen {DOC_REF_LABEL} ini
                </button>
              )}
              {isSPM
                ? <button className="ppd-f" style={btnStyle(t, "primary", busy || !list.length)} disabled={busy || !list.length} onClick={onMerge}
                    title={!list.length ? "Belum ada file untuk digabung" : `Gabung ${present}/${N} dokumen jadi 1 PDF`}>
                    <IcoDownload /> Download merge
                  </button>
                : <span style={{ fontSize: 11, color: t.muted, alignSelf: "center" }}>PDF gabungan (merge) dibuat oleh SPM</span>}
            </div>
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function SlotCard({ no, dt, files, canWrite, refId, partnerName, segment, onBusy, onChanged, lockAll, focusTick = 0, t }) {
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
    if (bad.length > 3) toast(t, `… dan ${bad.length - 3} file lain ditolak.`, "err");
    const arr = all.filter((f) => !validateFile(f));
    if (!arr.length) return;
    if (replace && !window.confirm(`Ganti ${files.length} file ${dt.label} dengan ${arr.length} file baru?`)) return;
    setQueue(arr.map((f) => ({ name: f.name, size: f.size, status: "wait" })));
    onBusy(1);
    const setQ = (i, patch) => setQueue((q) => q.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    try {
      const { ok, errors, skipped } = await uploadSlot({
        files: arr, partnerName, refId, docType: dt.key, segment, replace,
        onProgress: ({ index, phase, error }) => setQ(index, { status: phase === "start" ? "up" : phase === "done" ? "ok" : phase === "skip" ? "skip" : "err", error }),
      });
      if (ok.length) toast(t, `${dt.label}: ${ok.length} file terupload${replace ? " (menggantikan file lama)" : ""}.`);
      if (skipped.length) toast(t, `${skipped.length} file sudah ada di ${dt.label}, dilewati.`, "info");
      if (errors.length) toast(t, `${dt.label}: ${errors.length} file gagal — ${errors[0].file}: ${errors[0].message}`, "err");
      if (ok.length) onChanged();
      // sisakan yang gagal di antrean supaya terlihat; yang sukses hilang
      setTimeout(() => setQueue((q) => q.filter((x) => x.status === "err")), ok.length ? 1200 : 0);
    } catch (e) {
      toast(t, `Upload gagal: ${errMsg(e)}`, "err");
      setQueue([]);
    }
    onBusy(-1);
  };

  const onPick = (replace) => (e) => { const f = e.target.files; runUpload(f, replace); e.target.value = ""; };
  const onDrop = (e) => { e.preventDefault(); setDrag(false); if (canWrite) runUpload(e.dataTransfer?.files, false); };
  const onDragOver = (e) => { if (!canWrite || locked) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; if (!drag) setDrag(true); };

  const onOpen = async (d) => {
    // buka tab dulu (hindari popup blocker), lalu isi URL
    const w = window.open("", "_blank");
    try { const url = await signedUrl(d.storage_path); if (w) { w.opener = null; w.location.href = url; } else window.location.assign(url); }
    catch (e) { if (w) w.close(); toast(t, `Gagal membuka file: ${errMsg(e)}`, "err"); }
  };

  const onDownload = async (d) => {
    setDl(d.id);
    try { await downloadDoc(d); }
    catch (e) { toast(t, `Gagal download: ${errMsg(e)}`, "err"); }
    setDl(null);
  };

  const onDownloadAll = async () => {
    if (files.length === 1) return onDownload(files[0]);
    setDl("all");
    try {
      const { failed } = await downloadDocsZip(files, refZipName(refId, partnerName, dt.label));
      if (failed.length) toast(t, `ZIP terunduh, ${failed.length} file gagal.`, "err");
      else toast(t, `${files.length} file ${dt.label} terunduh (ZIP).`);
    } catch (e) { toast(t, `Gagal download: ${errMsg(e)}`, "err"); }
    setDl(null);
  };

  const onDelete = async (d) => {
    if (confirmId !== d.id) { setConfirmId(d.id); setTimeout(() => setConfirmId((c) => (c === d.id ? null : c)), 3500); return; }
    setConfirmId(null); setDeleting(d.id);
    try { await deleteDocs([d]); toast(t, `${d.file_name} dihapus.`); onChanged(); }
    catch (e) { toast(t, `Gagal menghapus: ${errMsg(e)}`, "err"); }
    setDeleting(null);
  };

  const zoneKey = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); addRef.current?.click(); } };

  return (
    <section ref={secRef} tabIndex={-1} aria-label={`${no}. ${dt.label}`} onDragOver={onDragOver} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false); }} onDrop={onDrop}
      style={{ border: `1.5px solid ${drag ? TEAL : has ? t.goodBd : t.line}`, borderRadius: 14, background: drag ? t.goodBg : t.surf, overflow: "hidden", transition: "border-color .15s, background .15s", boxShadow: t.shadow1 }}>
      {/* judul */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px" }}>
        <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 99, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 12, fontWeight: 800, background: has ? TEAL : t.surf3, color: has ? "#fff" : t.muted }}>{has ? "✓" : no}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{dt.label}</div>
          <div style={{ fontFamily: MONO, fontSize: 10.5, color: has ? (t.goodDark || TEAL_D) : t.muted2 }}>
            {has ? `${files.length} file · terakhir ${fmtDT(lastAt)}` : "Belum ada file"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {canWrite && (
            <button ref={pickBtnRef} className="ppd-f" style={btnStyle(t, "primary", locked, true)} disabled={locked} onClick={() => addRef.current?.click()}
              title={`Pilih file ${dt.label} (PDF/JPG/PNG, maks ${MAX_FILE_BYTES / 1048576} MB)`}>
              ⬆ {has ? "Tambah file" : "Pilih file"}
            </button>
          )}
          {has && <>
            <button className="ppd-f" style={btnStyle(t, "outline", !!dl, true)} disabled={!!dl} onClick={onDownloadAll}
              title={files.length > 1 ? `Download ${files.length} file ${dt.label} sebagai ZIP` : `Download ${files[0].file_name}`}>
              <IcoDownload />{dl === "all" ? "…" : files.length > 1 ? `Download semua (${files.length})` : "Download"}
            </button>
            {canWrite && <button className="ppd-f" style={btnStyle(t, "outline", locked, true)} disabled={locked} onClick={() => repRef.current?.click()} title={`Hapus semua file ${dt.label} dan ganti dengan yang baru (mis. BAST yang sudah di-esign)`}>Ganti semua</button>}
          </>}
        </div>
      </div>

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
              <button className="ppd-f" style={btnStyle(t, "outline", false, true)} onClick={() => onOpen(d)} aria-label={`Buka ${d.file_name}`} title="Buka di tab baru"><IcoOpen /><span className="ppd-hide-xs">Buka</span></button>
              <button className="ppd-f" style={btnStyle(t, "outline", dl === d.id, true)} disabled={dl === d.id} onClick={() => onDownload(d)} aria-label={`Download ${d.file_name}`} title="Download dengan nama file asli"><IcoDownload /><span className="ppd-hide-xs">{dl === d.id ? "…" : "Download"}</span></button>
              {canWrite && (
                <button className="ppd-f" style={btnStyle(t, confirmId === d.id ? "danger" : "ghost", locked, true)} disabled={locked}
                  onClick={() => onDelete(d)} aria-label={confirmId === d.id ? `Konfirmasi hapus ${d.file_name}` : `Hapus ${d.file_name}`} title="Hapus file">
                  <IcoTrash />{confirmId === d.id && <span>Yakin?</span>}
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
                  {q.status === "wait" ? "menunggu" : q.status === "up" ? "mengupload…" : q.status === "ok" ? "✓ selesai" : q.status === "skip" ? "sudah ada" : q.error || "gagal"}
                </span>
              </div>
              {q.status === "up" ? <IndeterminateBar t={t} /> : <IndeterminateBar t={t} pct={q.status === "wait" ? 0 : 100} />}
            </li>
          ))}
        </ul>
      )}

      {/* drop zone */}
      {canWrite && (
        <div style={{ padding: has ? "0 14px 12px" : "0 14px 14px" }}>
          <input ref={addRef} type="file" accept={ACCEPT_ATTR} multiple hidden onChange={onPick(false)} />
          <input ref={repRef} type="file" accept={ACCEPT_ATTR} multiple hidden onChange={onPick(true)} />
          <div role="button" tabIndex={locked ? -1 : 0} className="ppd-f" aria-disabled={locked}
            aria-label={`Upload ${dt.label}: seret file ke sini atau tekan Enter untuk memilih`}
            onClick={() => { if (!locked) addRef.current?.click(); }} onKeyDown={zoneKey}
            style={{ border: `1.5px dashed ${drag ? TEAL : t.line2}`, borderRadius: 12, padding: has ? "9px 12px" : "18px 12px", textAlign: "center", cursor: locked ? "not-allowed" : "pointer", color: drag ? (t.goodDark || TEAL_D) : t.muted, background: drag ? "transparent" : t.surf2, display: "flex", flexDirection: has ? "row" : "column", alignItems: "center", justifyContent: "center", gap: has ? 8 : 6, opacity: locked ? 0.6 : 1, transition: "all .15s" }}>
            <span style={{ color: TEAL, display: "inline-flex" }}><IcoUp /></span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: t.ink2 }}>{drag ? "Lepaskan untuk upload" : has ? "Tambah file — seret ke sini atau klik" : "Seret file ke sini atau klik untuk pilih"}</span>
            <span style={{ fontFamily: MONO, fontSize: 10.5 }}>PDF · JPG · PNG — maks {MAX_FILE_BYTES / 1048576} MB per file</span>
          </div>
        </div>
      )}
      {!canWrite && !has && <div style={{ padding: "0 14px 12px 50px", fontSize: 11.5, color: t.muted2 }}>Belum diupload oleh pemilik {DOC_REF_LABEL}.</div>}
    </section>
  );
}

// ── Tab "Upload & Merge Dokumen" ───────────────────────────────────────────
// pos: [{ ref, partner, title, amount, amountText, records }] dari data Payout yang sedang difilter.
// segment: 'partner' | 'agency' (ikut toggle Partner/Agency Prepaid). noRefCount: baris tanpa PO.
export function PoDocsTab({ pos, segment, docs, noRefCount = 0, fmtAmount, t }) {
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
  const [bulk, setBulk] = useState(null);       // { i, total, ref }
  const [rowBusy, setRowBusy] = useState(null); // key PO yang sedang di-merge
  const isSPM = !!docs?.canMerge;
  const role = docs?.profile?.role;
  const own = ownerLabel(segment);
  const openDrawer = (key, slot = null) => { setOpenSlot(slot); setOpenKey(key); };

  const rows = useMemo(() => (pos || [])
    .filter((p) => canViewPartner(docs?.profile, p.partner, segment))
    .map((p) => {
      const key = statKey(segment, p.partner, p.ref);
      const stat = docs?.byRef?.[key];
      const n = doneCount(stat);
      const firstMissing = DOC_TYPES.find((d) => !(stat?.types?.[d.key]?.n > 0))?.key || null;
      return { ...p, key, stat, n, st: statusOf(n), lastAt: stat?.lastAt || "", firstMissing, canWrite: canWritePartner(docs?.profile, p.partner, segment) };
    }), [pos, docs, segment]);

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
  const fmtAmt = fmtAmount || ((n) => (n || 0).toLocaleString("id-ID"));

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
      if (res.skipped.length) toast(t, `${r.ref}: PDF terunduh, ${res.skipped.length} file dilewati (lihat cover).`, "info");
      else toast(t, `${r.ref}: PDF terunduh (${res.present}/${N}).`);
    } catch (e) { toast(t, `Merge ${r.ref} gagal: ${errMsg(e)}`, "err"); }
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
      if (failed.length) toast(t, `ZIP terunduh, ${failed.length} ${DOC_REF_LABEL} gagal: ${failed[0]}`, "err");
      else { toast(t, `ZIP berisi ${selected.length} PDF terunduh.`); setSel(new Set()); }
    } catch (e) { toast(t, `Gagal membuat ZIP: ${errMsg(e)}`, "err"); }
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
        <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: t.ink, fontVariantNumeric: "tabular-nums" }}>{docs?.loaded ? value.toLocaleString("id-ID") : "…"}</span>
        {sub && <span style={{ fontFamily: MONO, fontSize: 10, color: t.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>}
      </button>
    );
  };

  const hint = role === "finance_mpx" || role === "agency"
    ? `Upload ${N} dokumen untuk setiap ${DOC_REF_LABEL}. Klik baris untuk download file (mis. draft BAST dari SPM untuk di-esign), lalu upload ulang versi yang sudah ditandatangani. PDF gabungan dibuat oleh SPM.`
    : !isSPM ? "Mode lihat saja: kamu bisa membuka & download file. Upload oleh partner/agency, merge oleh SPM."
    : segment === "agency" ? "Agency belum punya akses upload sendiri — SPM bisa upload atas nama agency." : null;

  const cols = (isSPM ? 1 : 0) + 8;

  return (
    <div style={{ background: t.surf, border: `1px solid ${t.line}`, borderRadius: 18, boxShadow: t.shadow1, marginBottom: 14, position: "relative" }}>
      {/* header */}
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${t.line}`, background: t.surf2, borderRadius: "18px 18px 0 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 4, height: 18, borderRadius: 2, background: MAGENTA, display: "block" }} />
            <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.02em", color: t.ink }}>Upload &amp; Merge Dokumen</span>
            <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "2px 8px", borderRadius: 99, background: `${MAGENTA}18`, color: MAGENTA, border: `1px solid ${MAGENTA}30` }}>{own} Prepaid</span>
          </div>
          <div style={{ marginTop: 4, marginLeft: 14, fontFamily: MONO, fontSize: 10.5, color: t.muted }}>
            Per {DOC_REF_LABEL} · {DOC_TYPES.map((d, i) => `${i + 1}. ${d.label}`).join("  →  ")}
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ padding: "14px 20px 10px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        {kpiCard({ id: "all", label: `Total ${DOC_REF_LABEL}`, value: kpi.all, sub: `${own.toLowerCase()} · filter aktif`, color: t.muted })}
        {kpiCard({ id: "complete", label: `Lengkap ${N}/${N}`, value: kpi.complete, sub: fmtAmt(kpi.amtComplete), color: TEAL })}
        {kpiCard({ id: "partial", label: "Sebagian", value: kpi.partial, sub: `1–${N - 1} dari ${N} dokumen`, color: t.warn })}
        {kpiCard({ id: "none", label: "Belum upload", value: kpi.none, sub: "0 dokumen", color: t.bad })}
      </div>
      <div style={{ padding: "0 20px 14px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, height: 8, borderRadius: 99, background: t.surf3, overflow: "hidden", display: "flex" }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${DOC_REF_LABEL} lengkap`}>
          <div style={{ width: `${pct}%`, background: TEAL, transition: "width .4s" }} />
          <div style={{ width: `${kpi.all ? (kpi.partial / kpi.all) * 100 : 0}%`, background: t.warn, opacity: 0.75, transition: "width .4s" }} />
        </div>
        <span style={{ fontFamily: MONO, fontSize: 11, color: t.muted, whiteSpace: "nowrap" }}>
          <strong style={{ color: t.ink }}>{kpi.complete}</strong> dari {kpi.all} lengkap · {pct}%
        </span>
      </div>

      {/* hints */}
      {(hint || noRefCount > 0 || docs?.error) && (
        <div style={{ padding: "0 20px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          {docs?.error && <div role="alert" style={{ fontSize: 12, padding: "8px 12px", borderRadius: 10, color: t.bad, background: t.badBg, border: `1px solid ${t.badBd}` }}>Gagal memuat status dokumen: {docs.error}</div>}
          {hint && <div style={{ fontSize: 12, padding: "8px 12px", borderRadius: 10, color: t.info, background: t.infoBg, border: `1px solid ${t.infoBd}` }}>ℹ {hint}</div>}
          {noRefCount > 0 && <div style={{ fontSize: 11.5, color: t.muted, fontFamily: MONO }}>{noRefCount.toLocaleString("id-ID")} baris tanpa {DOC_REF_LABEL} tidak ditampilkan.</div>}
        </div>
      )}

      {/* toolbar */}
      <div style={{ padding: "10px 20px", borderTop: `1px solid ${t.line}`, borderBottom: `1px solid ${t.line}`, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: t.surf2 }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 380 }}>
          <span aria-hidden="true" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: t.muted, fontSize: 13 }}>⌕</span>
          <input className="ppd-f" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={`Cari ${DOC_REF_LABEL}, ${own.toLowerCase()}, project…`} aria-label="Cari"
            style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 12.5, padding: "8px 30px 8px 28px", borderRadius: 10, border: `1px solid ${t.line2}`, background: t.surf, color: t.ink, outline: "none" }} />
          {q && <button className="ppd-f" onClick={() => { setQ(""); setPage(1); }} aria-label="Hapus pencarian" style={{ all: "unset", cursor: "pointer", position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: t.muted, fontSize: 15 }}>×</button>}
        </div>
        <div role="group" aria-label="Filter status" style={{ display: "inline-flex", background: t.surf3, borderRadius: 10, padding: 3, gap: 2, border: `1px solid ${t.line}`, flexWrap: "wrap" }}>
          {[["all", "Semua"], ["complete", "Lengkap"], ["partial", "Belum lengkap"], ["none", "Belum upload"]].map(([id, l]) => (
            <button key={id} className="ppd-f" aria-pressed={status === id} onClick={() => { setStatus(id); setPage(1); }}
              style={{ fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 8, border: 0, cursor: "pointer", background: status === id ? TEAL : "transparent", color: status === id ? "#fff" : t.muted, whiteSpace: "nowrap" }}>{l}</button>
          ))}
        </div>
        <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, color: t.muted, whiteSpace: "nowrap" }}>{filtered.length.toLocaleString("id-ID")} {DOC_REF_LABEL}</span>
        {isSPM && (
          <button className="ppd-f ppd-act" style={btnStyle(t, "primary", !docs?.loaded || !rows.length, true)} disabled={!docs?.loaded || !rows.length} onClick={() => setBulkOpen(true)}
            title={`Upload banyak file sekaligus — dicocokkan otomatis ke ${DOC_REF_LABEL} dari nama file`}>
            ⬆ Bulk Upload
          </button>
        )}
      </div>

      {/* table */}
      <div style={{ overflow: "auto", maxHeight: "68vh" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12, minWidth: 1040 }}>
          <thead><tr>
            {isSPM && (
              <th style={th({ width: 34, textAlign: "center" })}>
                <input type="checkbox" className="ppd-f" aria-label={`Pilih semua ${DOC_REF_LABEL} lengkap di halaman ini`} checked={pageAllSel} disabled={!pageSelectable.length || !!bulk}
                  ref={(el) => { if (el) el.indeterminate = !pageAllSel && pageSomeSel; }} onChange={togglePage} />
              </th>
            )}
            {sortTh("ref", DOC_REF_LABEL)}
            {sortTh("partner", own)}
            {sortTh("title", "Project")}
            {sortTh("amount", "Amount", "right")}
            <th style={th()}>Dokumen</th>
            {sortTh("n", "Status")}
            {sortTh("lastAt", "Update terakhir")}
            <th style={th({ textAlign: "right", position: "sticky", right: 0, zIndex: 3, boxShadow: `-8px 0 10px -8px rgba(0,0,0,0.18)` })}>Aksi</th>
          </tr></thead>
          <tbody>
            {!docs?.loaded
              ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: cols }).map((__, j) => <td key={j} style={td()}><Skel t={t} w={j === 4 ? 150 : "80%"} /></td>)}</tr>
              ))
              : pageRows.length === 0
                ? <tr><td colSpan={cols} style={{ padding: "40px 16px", textAlign: "center", color: t.muted }}>
                    <div style={{ fontSize: 26, marginBottom: 6 }} aria-hidden="true">🗂</div>
                    <div style={{ fontWeight: 700, color: t.ink, fontSize: 13.5 }}>{rows.length ? `Tidak ada ${DOC_REF_LABEL} yang cocok` : `Belum ada ${DOC_REF_LABEL} di data ini`}</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>{rows.length ? "Ubah pencarian atau filter status." : "Cek filter Payout di atas."}</div>
                    {(q || status !== "all") && <button className="ppd-f" style={{ ...btnStyle(t, "outline", false, true), marginTop: 10 }} onClick={() => { setQ(""); setStatus("all"); setPage(1); }}>Reset pencarian &amp; filter</button>}
                  </td></tr>
                : pageRows.map((r, i) => {
                  const zebra = i % 2 === 1 ? t.rowStripe : "transparent";
                  const isSel = sel.has(r.key);
                  return (
                    <tr key={r.key} className="ppd-row" tabIndex={0} onClick={() => openDrawer(r.key)}
                      onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDrawer(r.key); } }}
                      aria-label={`${DOC_REF_LABEL} ${r.ref}, ${r.partner}, ${r.n} dari ${N} dokumen. Enter untuk buka.`}
                      style={{ cursor: "pointer", background: isSel ? t.goodBg : zebra, transition: "background .1s" }}
                      onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = t.rowHover; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = isSel ? t.goodBg : zebra; }}>
                      {isSPM && (
                        <td style={td({ textAlign: "center" })} onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" className="ppd-f" aria-label={`Pilih ${r.ref}`} checked={isSel} disabled={r.st !== "complete" || !!bulk}
                            title={r.st !== "complete" ? `Hanya ${DOC_REF_LABEL} lengkap ${N}/${N} yang bisa dipilih` : undefined} onChange={() => toggle(r.key)} />
                        </td>
                      )}
                      <td style={td({ fontFamily: MONO, fontWeight: 700, color: t.ink, whiteSpace: "nowrap" })}>
                        {r.ref}{r.records > 1 && <span title={`${r.records} baris data dengan ${DOC_REF_LABEL} ini (amount dijumlah)`} style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 600, color: t.muted, padding: "1px 5px", borderRadius: 6, background: t.surf3 }}>×{r.records}</span>}
                      </td>
                      <td style={td({ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 })} title={r.partner}>{r.partner}</td>
                      <td style={td({ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: t.muted })} title={r.title}>{r.title || "—"}</td>
                      <td style={td({ textAlign: "right", fontFamily: MONO, whiteSpace: "nowrap", color: t.ink })}>{r.amountText}</td>
                      <td style={td()} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "nowrap" }}>
                          {DOC_TYPES.map((d) => <DocChip key={d.key} dt={d} ty={r.stat?.types?.[d.key]} canWrite={r.canWrite} onClick={() => openDrawer(r.key, d.key)} t={t} />)}
                        </div>
                      </td>
                      <td style={td()}><Ring n={r.n} t={t} /></td>
                      <td style={td({ fontFamily: MONO, fontSize: 11, color: r.lastAt ? t.ink2 : t.muted2, whiteSpace: "nowrap" })}>{r.lastAt ? fmtDT(r.lastAt) : <span style={{ fontFamily: "inherit", fontStyle: "italic" }}>{r.canWrite ? "Belum ada dokumen — klik Upload" : "Belum ada dokumen"}</span>}</td>
                      <td style={td({ textAlign: "right", position: "sticky", right: 0, zIndex: 1, background: t.surf, boxShadow: `-8px 0 10px -8px rgba(0,0,0,0.18)` })} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          {r.canWrite && (
                            <button className="ppd-f ppd-act" style={btnStyle(t, "primary", false, true)} onClick={() => openDrawer(r.key, r.firstMissing || DOC_TYPES[0].key)}
                              aria-label={`Upload dokumen ${r.ref}`} title={r.firstMissing ? `Upload ${DOC_TYPES.find((d) => d.key === r.firstMissing)?.label}` : "Tambah / ganti dokumen"}>
                              ⬆ Upload
                            </button>
                          )}
                          {(r.n > 0 || !r.canWrite) && (
                            <button className="ppd-f ppd-act-o" style={btnStyle(t, "outline", false, true)} onClick={() => openDrawer(r.key)} aria-label={`Lihat dokumen ${r.ref}`}>
                              Lihat ({r.n}/{N})
                            </button>
                          )}
                          {isSPM && (
                            <button className="ppd-f ppd-act-o" style={btnStyle(t, "outline", !!rowBusy || !!bulk || !r.n, true)} disabled={!!rowBusy || !!bulk || !r.n}
                              onClick={() => mergeOne(r)} aria-label={`Download merge ${r.ref}`} title={!r.n ? "Belum ada dokumen untuk di-merge" : `Gabung ${r.n}/${N} dokumen jadi 1 PDF`}>
                              <IcoDownload />{rowBusy === r.key ? "…" : "Merge"}
                            </button>
                          )}
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
            {(curPage - 1) * pageSize + 1}–{Math.min(curPage * pageSize, filtered.length)} dari {filtered.length.toLocaleString("id-ID")}
            <select className="ppd-f" aria-label="Baris per halaman" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              style={{ fontFamily: MONO, fontSize: 11, padding: "3px 6px", borderRadius: 7, border: `1px solid ${t.line2}`, background: t.surf, color: t.ink }}>
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / hal</option>)}
            </select>
          </span>
          {totalPages > 1 && (
            <nav aria-label="Halaman" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
      {isSPM && (selected.length > 0 || bulk) && (
        <div role="region" aria-label={`Aksi ${DOC_REF_LABEL} terpilih`} style={{ position: "sticky", bottom: 0, zIndex: 3, borderTop: `1px solid ${t.line2}`, background: t.surf, borderRadius: "0 0 18px 18px", padding: "11px 20px", boxShadow: "0 -6px 18px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>
              <span style={{ fontFamily: MONO, color: TEAL_D }}>{bulk ? bulk.total : selected.length}</span> {DOC_REF_LABEL} dipilih
            </span>
            {bulk && <span style={{ fontFamily: MONO, fontSize: 11, color: t.muted }}>{bulk.i < bulk.total ? `Menggabungkan ${bulk.i + 1}/${bulk.total} · ${bulk.ref}` : "Membuat ZIP…"}</span>}
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button className="ppd-f" style={btnStyle(t, "ghost", !!bulk, true)} disabled={!!bulk} onClick={() => setSel(new Set())}>Batal pilih</button>
              <button className="ppd-f" style={btnStyle(t, "primary", !!bulk)} disabled={!!bulk} onClick={mergeSelected}><IcoDownload /> Download merge terpilih</button>
            </div>
          </div>
          {bulk && <IndeterminateBar t={t} pct={Math.round((bulk.i / Math.max(1, bulk.total)) * 100)} />}
        </div>
      )}

      {openRow && <RefDocsDrawer key={openRow.key} refId={openRow.ref} partnerName={openRow.partner} segment={segment} title={openRow.title} amountText={openRow.amountText}
        docs={docs} focusSlot={openSlot} onClose={() => setOpenKey(null)} t={t} />}
      {bulkOpen && <BulkUploadModal rows={rows} segment={segment} docs={docs} onClose={() => setBulkOpen(false)} t={t} />}
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

  const tryClose = () => { if (busy) { toast(t, "Tunggu upload selesai dulu.", "info"); return; } onClose(); };

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

  const ready = items.filter((x) => !x.err && x.key && byKey.has(x.key));
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
        if (ok.length) { okN++; mark(it.id, { status: "ok", msg: "berhasil" }); }
        else if (skipped.length) { skipN++; mark(it.id, { status: "skip", msg: "sudah ada file yang sama — dilewati" }); }
        else { errN++; mark(it.id, { status: "err", msg: errors[0]?.message || "gagal" }); }
      } catch (e) { errN++; mark(it.id, { status: "err", msg: errMsg(e) }); }
      setProg({ i: i + 1, total: todo.length });
    }
    setPhase("done");
    docs?.refresh?.();
    toast(t, `Bulk upload ${dtLabel}: ${okN} berhasil${skipN ? `, ${skipN} dilewati` : ""}${errN ? `, ${errN} gagal` : ""}.`, errN ? "err" : "ok");
  };

  const statusCell = (x) => {
    if (x.err) return <span style={{ color: t.bad }}>✕ {x.err}</span>;
    if (x.status === "up") return <span style={{ color: t.muted }}>mengupload…</span>;
    if (x.status === "ok") return <span style={{ color: t.goodDark || TEAL_D, fontWeight: 700 }}>✓ berhasil</span>;
    if (x.status === "skip") return <span style={{ color: t.muted }}>↷ {x.msg}</span>;
    if (x.status === "err") return <span style={{ color: t.bad }}>✕ {x.msg}</span>;
    const row = byKey.get(x.key);
    const exists = row?.stat?.types?.[docType]?.n > 0;
    if (!x.key) return <span style={{ color: t.warnDark || t.warn, fontWeight: 600 }}>{x.how === "partner" ? `Pilih ${DOC_REF_LABEL}` : `Tidak cocok — pilih ${DOC_REF_LABEL}`}</span>;
    return (
      <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ color: t.goodDark || TEAL_D, fontWeight: 600 }}>{x.how === "po" ? "✓ Cocok" : "✓ Dipilih"}</span>
        {exists && <span title={`${DOC_REF_LABEL} ini sudah punya ${dtLabel}. File baru akan DITAMBAHKAN (tidak menghapus yang lama).`} style={{ fontFamily: MONO, fontSize: 9.5, padding: "1px 6px", borderRadius: 6, background: t.warnBg, color: t.warnDark || t.warn, border: `1px solid ${t.warnBd}` }}>sudah ada file</span>}
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
            <div id="ppd-bulk-title" style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>Upload banyak dokumen sekaligus</div>
            <div style={{ fontSize: 12, color: t.muted, marginTop: 3, lineHeight: 1.45 }}>
              File dicocokkan otomatis ke {DOC_REF_LABEL} dari <b>nama file atau nama folder</b> (mis. <span style={{ fontFamily: MONO }}>BAST_{REF_EXAMPLE}.pdf</span> atau folder <span style={{ fontFamily: MONO }}>{REF_EXAMPLE}/BAST.pdf</span>). Kalau hanya nama {ownerLabel(segment).toLowerCase()} yang terbaca, kamu tinggal pilih PO-nya.
            </div>
          </div>
          <button ref={closeRef} className="ppd-f" onClick={tryClose} aria-label="Tutup (Esc)" style={{ ...btnStyle(t, "ghost", false, true), fontSize: 20, lineHeight: 1, padding: "2px 8px", color: t.muted }}>×</button>
        </div>

        {/* step 1: jenis dokumen + sumber file */}
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${t.line}`, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: t.muted, marginBottom: 5 }}>1 · Jenis dokumen</div>
            <div role="radiogroup" aria-label="Jenis dokumen" style={{ display: "inline-flex", background: t.surf3, borderRadius: 10, padding: 3, gap: 2, border: `1px solid ${t.line}`, flexWrap: "wrap" }}>
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
            <span title="Ikuti toggle Partner/Agency Prepaid di atas. Ganti toggle untuk upload ke segment lain." style={{ display: "inline-flex", padding: "7px 11px", borderRadius: 10, fontSize: 12, fontWeight: 700, background: `${MAGENTA}14`, color: MAGENTA, border: `1px solid ${MAGENTA}30` }}>
              {ownerLabel(segment)} Prepaid · {rows.length} {DOC_REF_LABEL}
            </span>
          </div>
          {phase !== "done" && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <input ref={fileRef} type="file" accept={ACCEPT_ATTR} multiple hidden onChange={onPick} />
              <input ref={(el) => { dirRef.current = el; if (el) { el.setAttribute("webkitdirectory", ""); el.setAttribute("directory", ""); } }} type="file" multiple hidden onChange={onPick} />
              <button className="ppd-f ppd-act" style={btnStyle(t, "primary", busy)} disabled={busy} onClick={() => fileRef.current?.click()}>⬆ Pilih file</button>
              <button className="ppd-f ppd-act-o" style={btnStyle(t, "outline", busy)} disabled={busy} onClick={() => dirRef.current?.click()}>📁 Pilih folder</button>
            </div>
          )}
        </div>

        {/* step 2: preview */}
        <div style={{ flex: 1, overflow: "auto", minHeight: 180 }}>
          {!items.length ? (
            <div role="button" tabIndex={0} className="ppd-f" onClick={() => fileRef.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
              style={{ margin: 18, border: `2px dashed ${drag ? TEAL : t.line2}`, borderRadius: 16, padding: "42px 16px", textAlign: "center", cursor: "pointer", background: drag ? t.goodBg : t.surf2, color: t.muted }}>
              <div style={{ color: TEAL, display: "inline-flex" }}><IcoUp /></div>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.ink, marginTop: 6 }}>{drag ? "Lepaskan untuk menambahkan" : `Seret banyak file ${dtLabel} atau 1 folder ke sini`}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>atau klik untuk pilih · PDF · JPG · PNG — maks {MAX_FILE_BYTES / 1048576} MB per file</div>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 760 }}>
              <thead><tr>
                <th style={th}>File</th><th style={{ ...th, textAlign: "right" }}>Ukuran</th><th style={th}>{DOC_REF_LABEL}</th><th style={th}>{ownerLabel(segment)}</th><th style={th}>Status</th><th style={th}><span className="ppd-sr">Hapus</span></th>
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
                            <select className="ppd-f" aria-label={`${DOC_REF_LABEL} untuk ${x.file.name}`} value={x.key} onChange={(e) => setKey(x.id, e.target.value)}
                              style={{ width: "100%", fontFamily: MONO, fontSize: 11.5, padding: "5px 6px", borderRadius: 8, border: `1px solid ${x.key ? t.line2 : t.warn}`, background: t.surf, color: t.ink }}>
                              <option value="">— pilih {DOC_REF_LABEL} —</option>
                              {candRows.map((r) => <option key={r.key} value={r.key}>{optLabel(r)}</option>)}
                            </select>
                          ) : (
                            <>
                              <input className="ppd-f" list={listId} aria-label={`Cari ${DOC_REF_LABEL} untuk ${x.file.name}`} placeholder={`Cari ${DOC_REF_LABEL}…`}
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
                        {phase === "review" && <button className="ppd-f" onClick={() => remove(x.id)} aria-label={`Hapus ${x.file.name} dari daftar`} title="Keluarkan dari daftar" style={{ ...btnStyle(t, "ghost", false, true), color: t.muted }}>✕</button>}
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
              <div style={{ fontFamily: MONO, fontSize: 10.5, color: t.muted, marginBottom: 5 }}>{phase === "done" ? "Selesai" : "Mengupload"} {prog.i}/{prog.total} file…</div>
              <IndeterminateBar t={t} pct={prog.total ? Math.round((prog.i / prog.total) * 100) : 0} />
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {items.length > 0 && phase !== "done" && (
              <span style={{ fontFamily: MONO, fontSize: 11, color: t.muted, display: "inline-flex", gap: 10, flexWrap: "wrap" }}>
                <span style={{ color: t.goodDark || TEAL_D }}>✓ {counts.ok} cocok</span>
                {counts.manual > 0 && <span style={{ color: t.goodDark || TEAL_D }}>✓ {counts.manual} dipilih</span>}
                <span style={{ color: counts.need ? (t.warnDark || t.warn) : t.muted }}>● {counts.need} perlu dipilih</span>
                <span style={{ color: counts.bad ? t.bad : t.muted }}>✕ {counts.bad} dilewati</span>
              </span>
            )}
            {phase === "done" && (
              <span style={{ fontSize: 12.5, color: t.ink }}>
                <b style={{ color: t.goodDark || TEAL_D }}>{items.filter((x) => x.status === "ok").length} berhasil</b>
                {" · "}{items.filter((x) => x.status === "skip").length} dilewati (sudah ada)
                {" · "}<b style={{ color: items.some((x) => x.status === "err") ? t.bad : t.muted }}>{items.filter((x) => x.status === "err").length} gagal</b>
                {" · "}{items.filter((x) => x.status === "pending" || x.err).length} tidak diupload
              </span>
            )}
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {phase === "review" && items.length > 0 && <button className="ppd-f" style={btnStyle(t, "ghost", false, true)} onClick={() => { setItems([]); setPhase("pick"); }}>Kosongkan</button>}
              {phase === "done"
                ? <button className="ppd-f ppd-act" style={btnStyle(t, "primary")} onClick={onClose}>Selesai</button>
                : <button className="ppd-f ppd-act" style={btnStyle(t, "primary", busy || !ready.length)} disabled={busy || !ready.length} onClick={start}
                    title={!ready.length ? `Belum ada file yang punya ${DOC_REF_LABEL}` : `Upload ke slot ${dtLabel} — file lama tidak dihapus`}>
                    ⬆ {busy ? `Mengupload ${prog.i}/${prog.total}…` : `Upload ${ready.length} file sebagai ${dtLabel}`}
                  </button>}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
