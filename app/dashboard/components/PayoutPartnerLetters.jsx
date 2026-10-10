"use client";
// Partner Letters (khusus SPM) — terpisah dari alur PO (Document Upload & Merge).
//   1 Upload Excel (Source Data SMS) → 2 Review & Preview (e-sign + Payment ID) → 3 Save
//   Cara tanda tangan per batch: "Apply e-signature" (gambar dari Settings) atau "Request approval"
//   (approval berbasis login yang sudah ada — payout_doc_approvals; khusus Payment ID, tab PO tetap tanpa approval).
//   Approver = email penanda tangan di Settings (BAST → pihak pertama, Surat → penanda tangan surat), bukan email partner.
//   History: semua pembayaran (Payment ID) yang pernah di-generate — cari, buka PDF, unduh ZIP.
//   ⚙ Settings: periode, tanggal, claim deadline, Letter No, penanda tangan + gambar tanda tangan/stempel.
//   Akses: SPM (semua) dan admin internal Indosat / internal_ioh (History + approval saja, tanpa generate).
// PDF disimpan di tabel/bucket dokumen dengan ref_id = Payment ID (PAY-*), tidak muncul di tab PO / Raw Data.
// Gambar tanda tangan HANYA disimpan di browser (localStorage) — tidak pernah di-upload terpisah.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DOC_REF_LABEL, DOC_TYPES, statKey, uploadSlot, downloadDocsZip, partnerKey, signedUrl, fetchDraftDocs,
  isPaymentRef, parsePaymentRef, paymentIdFor, assignPartnerCodes, partnerCode, nextPaymentId, spmSignedName, validateFile, fileKind, MAX_FILE_BYTES,
  approvalApi, fetchApprovals, approvalStatus, approvalKey,
} from "../../../lib/payoutPartnerDocs";
import {
  parseTemplateWorkbook, parseSmsWorkbook, finalizeSms, detectWorkbookFormat, readTemplateCarryOver,
  buildTemplateWorkbook, buildSmsTemplateWorkbook, buildBastPdf, buildLetterPdf, loadLetterhead, mergePdfBytes,
  DEFAULT_SIGNATORIES, DEFAULT_RECIPIENT, bastFileName, letterFileName, rupiah, parsePeriod, toDateValue, hasEsign,
} from "../../../lib/payoutDocGenerator";
import { fetchLettersIndex, readJsonFile, savePaymentMeta } from "../../../lib/payoutPartnerLetters";
import { imageToDataUrl } from "../../../lib/payoutPartnerSign";
import {
  TEAL, TEAL_D, MAGENTA, MONO, fmtDT, errMsg, useDocsCss, toast, btnStyle, Skel, IndeterminateBar, RowMenu, IcoDownload, IcoOpen, IcoUp, ApprovalBadge,
} from "./PayoutPartnerDocs";

const SEGMENT = "partner";
const GEN_CFG_KEY = "ppd_gen_signatories";
const GEN_META_KEY = "payoutDocGen:meta";
const LAST_TPL_KEY = "payoutDocGen:lastTemplate";
const readJson = (k, fb) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? fb; } catch { return fb; } };
const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const CFG_DEFAULTS = { ...DEFAULT_SIGNATORIES, recipientMPC: DEFAULT_RECIPIENT.MPC, recipientMP3: DEFAULT_RECIPIENT.MP3 };
const IMG_FIELDS = ["p1Sig", "p1Stamp", "letterSig", "letterStamp"];
const readGenCfg = () => ({ ...CFG_DEFAULTS, ...readJson(GEN_CFG_KEY, {}) });
const readLastTpl = () => readJson(LAST_TPL_KEY, null);
const isoDay = (d) => d.toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = toDateValue(iso); if (!d) return ""; d.setUTCDate(d.getUTCDate() + n); return isoDay(d); };
const letterNoForYear = (no, iso) => { const y = (iso || "").slice(0, 4); return y && /\/\d{4}$/.test(no) ? no.replace(/\/\d{4}$/, `/${y}`) : no; };
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const IMG_KEYS = [["p1Sig", "p1Stamp", "BAST — First party (Pihak Pertama)", "p1Name"], ["letterSig", "letterStamp", "Notification Letter signatory", "letterSignerName"]];
const IMG_DATA_RE = /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/;
const EMAIL_OK = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim());
const APPR_TYPES = [["bast", "p1Email", "BAST"], ["surat_pemberitahuan", "letterSignerEmail", "Notification Letter"]];
const approverOf = (cfg, docType) => String((docType === "bast" ? cfg.p1Email : cfg.letterSignerEmail) || "").trim();
const APPR_MISSING = "Approval tracking is not set up yet. Run supabase/migrations/20261008_payout_doc_approvals.sql in the Supabase SQL Editor, then reload.";
// Status gabungan BAST + Surat untuk 1 Payment ID
function apprSummary(approvals, partner, pid) {
  const st = {};
  APPR_TYPES.forEach(([dt]) => { const a = approvals?.byKey?.[approvalKey(SEGMENT, partner, pid, dt)]; st[dt] = { a, s: approvalStatus(a) }; });
  const vals = APPR_TYPES.map(([dt]) => st[dt].s);
  const overall = vals.every((v) => v === "approved") ? "approved" : vals.some((v) => v === "rejected") ? "rejected"
    : vals.some((v) => v === "pending") ? "pending" : vals.some(Boolean) ? (vals.find((v) => v && v !== "approved") || "approved") : null;
  return { st, overall };
}
// Minta approval untuk beberapa Payment ID sekaligus (dikelompokkan per email approver)
async function requestApprovals(cfg, list, approvals) {
  const groups = new Map();
  let skipped = 0;
  for (const r of list) {
    for (const [dt] of APPR_TYPES) {
      const email = approverOf(cfg, dt);
      const s = approvalStatus(approvals?.byKey?.[approvalKey(SEGMENT, r.partner, r.pid, dt)]);
      if (!EMAIL_OK(email) || s === "pending" || s === "approved") { skipped++; continue; }
      if (!groups.has(email)) groups.set(email, []);
      groups.get(email).push({ segment: SEGMENT, owner_name: r.partner, ref_id: r.pid, doc_type: dt, ref_title: `Payment ID ${r.pid} · ${r.partner} · ${r.type || ""} ${r.period || ""}`.trim(), amount_text: r.total != null ? rupiah(r.total) : null });
    }
  }
  let ok = 0, fail = 0;
  const reasons = [];
  for (const [email, items] of groups) {
    try {
      const { results = [] } = await approvalApi("request", { approver_email: email, note: "Partner Letters — please review the BAST / Notification Letter.", items });
      results.forEach((x) => { if (x?.ok) { ok++; if (x.emailError) reasons.push(`email: ${x.emailError}`); } else { fail++; reasons.push(x?.error || "no response"); } });
    } catch (e) { fail += items.length; reasons.push(errMsg(e)); }
  }
  return { ok, fail, skipped, reasons: [...new Set(reasons)] };
}

function saveBlobAs(bytes, name, type) {
  const url = URL.createObjectURL(bytes instanceof Blob ? bytes : new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}


// Viewer PDF: render semua halaman ke canvas (pdfjs-dist)
let _pdfjs = null;
async function loadPdfjs() {
  if (_pdfjs) return _pdfjs;
  const m = await import("pdfjs-dist");
  const pdfjs = m.GlobalWorkerOptions ? m : m.default;
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  _pdfjs = pdfjs;
  return pdfjs;
}
function PdfPages({ bytes, url }) {
  const boxRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !bytes || !width) return undefined;
    let cancelled = false;
    let task = null;
    (async () => {
      const pdfjs = await loadPdfjs();
      task = pdfjs.getDocument({ data: bytes.slice() });
      const doc = await task.promise;
      const frag = document.createDocumentFragment();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = Math.max(200, width - 28);
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: (cssW / base.width) * dpr });
        const c = document.createElement("canvas");
        c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
        Object.assign(c.style, { width: `${cssW}px`, height: `${Math.floor(vp.height / dpr)}px`, display: "block", margin: "14px auto", background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,0.22)", borderRadius: "2px" });
        c.setAttribute("role", "img");
        c.setAttribute("aria-label", `Page ${i} of ${doc.numPages}`);
        await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        frag.appendChild(c);
      }
      if (!cancelled) el.replaceChildren(frag);
      doc.destroy();
    })().catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; task?.destroy?.(); };
  }, [bytes, width]);
  if (failed && url) return <iframe title="Document preview" src={`${url}#view=FitH`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} />;
  return <div ref={boxRef} style={{ position: "absolute", inset: 0, overflow: "auto" }} />;
}

const styles = (t) => ({
  th: { position: "sticky", top: 0, zIndex: 1, background: t.surf2, fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: t.muted, fontWeight: 500, padding: "9px 9px", borderBottom: `1.5px solid ${t.line2}`, textAlign: "left", whiteSpace: "nowrap" },
  td: { padding: "8px 9px", borderBottom: `1px solid ${t.line}`, verticalAlign: "top", fontSize: 12, color: t.ink2 },
  inp: { fontFamily: "inherit", fontSize: 12.5, padding: "6px 9px", borderRadius: 8, border: `1px solid ${t.line2}`, background: t.surf, color: t.ink, width: "100%", boxSizing: "border-box" },
  lbl: { fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: t.muted, marginBottom: 6 },
  card: { border: `1px solid ${t.line}`, borderRadius: 14, padding: "12px 14px", background: t.surf },
  link: { all: "unset", cursor: "pointer", color: t.goodDark || TEAL_D, fontWeight: 600 },
});
const Chip = ({ children, color, bg, bd, title }) => (
  <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 6, color, background: bg, border: `1px solid ${bd}`, whiteSpace: "nowrap" }}>{children}</span>
);

// ── Settings ─────────────────────────────────────────────────────────────────
function ImageSlot({ label, hint, value, onChange, maxW, maxH, disabled, t }) {
  const ref = useRef(null);
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try { onChange(await imageToDataUrl(f, maxW, maxH)); }
    catch (err) { toast(t, err.message || String(err), "err"); }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ fontSize: 11.5, color: t.muted }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 132, height: 54, borderRadius: 8, border: `1px dashed ${t.line2}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
          background: "repeating-conic-gradient(#f3f3f6 0% 25%, #ffffff 0% 50%) 50% / 12px 12px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL lokal, bukan aset */}
          {value ? <img src={value} alt={`${label} preview`} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            : <span style={{ fontSize: 10.5, color: "#8A8A96" }}>No image</span>}
        </div>
        <input ref={ref} type="file" accept="image/png,image/jpeg" hidden onChange={pick} aria-label={`${label} file`} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <button className="ppd-f ppd-act-o" style={btnStyle(t, "outline", disabled, true)} disabled={disabled} onClick={() => ref.current?.click()}>{value ? "Replace" : "Upload"}</button>
          {value && <button className="ppd-f" style={{ ...btnStyle(t, "ghost", disabled, true), color: t.bad }} disabled={disabled} onClick={() => onChange("")}>Remove</button>}
        </div>
      </div>
      {hint && <div style={{ fontSize: 10.5, color: t.muted2 || t.muted }}>{hint}</div>}
    </div>
  );
}

function SettingsPanel({ cfg, setCfgField, setCfg, meta, setMetaField, busy, t }) {
  const S = styles(t);
  const importRef = useRef(null);
  const exportCfg = () => {
    saveBlobAs(new Blob([JSON.stringify({ app: "sandrahub-partner-letters", version: 1, exportedAt: new Date().toISOString(), settings: cfg }, null, 1)], { type: "application/json" }),
      `Partner Letters signatories ${isoDay(new Date())}.json`, "application/json");
  };
  const importCfg = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      if (f.size > 3 * 1024 * 1024) throw new Error("The settings file is too large.");
      const j = JSON.parse(await f.text());
      if (j?.app !== "sandrahub-partner-letters" || typeof j.settings !== "object" || !j.settings) throw new Error("This is not a Partner Letters settings file.");
      const next = { ...CFG_DEFAULTS };
      [...Object.keys(CFG_DEFAULTS), "p1Email", "letterSignerEmail", ...IMG_FIELDS, "applyEsign"].forEach((k) => {
        const v = j.settings[k];
        if (k === "applyEsign") { if (typeof v === "boolean") next[k] = v; return; }
        if (IMG_FIELDS.includes(k)) { if (typeof v === "string" && (v === "" || (IMG_DATA_RE.test(v) && v.length < 1.5e6))) next[k] = v; return; }
        if (typeof v === "string") next[k] = v.slice(0, 300);
      });
      setCfg(next);
      toast(t, "Signatory settings imported.");
    } catch (err) { toast(t, `Import failed: ${err.message || err}`, "err"); }
  };
  const anyImg = IMG_KEYS.some(([s]) => cfg[s]);
  const textFields = [
    ["p1Name", "First party — name"], ["p1Title", "First party — title"], ["p1Company", "First party — company"],
    ["letterSignerName", "Letter signatory — name"], ["letterSignerTitle", "Letter signatory — title"], ["letterSignerUnit", "Letter signatory — unit"],
    ["city", "City (letter date line)"], ["recipientMPC", "Recipient title — MPC"], ["recipientMP3", "Recipient title — MP3"],
    ["p1Email", "Approver email — BAST (first party)", "email"], ["letterSignerEmail", "Approver email — Notification Letter", "email"],
  ];
  return (
    <div style={{ padding: "14px 20px 16px", borderBottom: `1px solid ${t.line}`, background: t.surf2, display: "flex", flexDirection: "column", gap: 16 }}>
      <section>
        <div style={S.lbl}>Document details</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, alignItems: "end" }}>
          <label><div style={{ fontSize: 11.5, color: t.muted, marginBottom: 3 }}>Period</div><input className="ppd-f" type="month" value={meta.period} onChange={(e) => setMetaField("period", e.target.value)} disabled={busy} style={S.inp} /></label>
          <label><div style={{ fontSize: 11.5, color: t.muted, marginBottom: 3 }}>Document date</div><input className="ppd-f" type="date" value={meta.docDate} onChange={(e) => setMetaField("docDate", e.target.value)} disabled={busy} style={S.inp} /></label>
          <label><div style={{ fontSize: 11.5, color: t.muted, marginBottom: 3 }}>Claim deadline</div><input className="ppd-f" type="date" value={meta.deadline} onChange={(e) => setMetaField("deadline", e.target.value)} disabled={busy} style={S.inp} /></label>
          <label style={{ gridColumn: "span 2" }}><div style={{ fontSize: 11.5, color: t.muted, marginBottom: 3 }}>Letter No (default for all partners)</div><input className="ppd-f" value={meta.letterNo} onChange={(e) => setMetaField("letterNo", e.target.value)} disabled={busy} style={{ ...S.inp, fontFamily: MONO }} /></label>
        </div>
      </section>

      <section>
        <div style={S.lbl}>Signatories</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {textFields.map(([k, lab, kind]) => {
            const bad = kind === "email" && cfg[k] && !EMAIL_OK(cfg[k]);
            return (
              <label key={k} style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11.5, color: t.muted }}>
                {lab}
                <input className="ppd-f" type={kind === "email" ? "email" : "text"} value={cfg[k] || ""} onChange={(e) => setCfgField(k, e.target.value)} disabled={busy}
                  placeholder={kind === "email" ? "name@ioh.co.id (SandraHub account)" : undefined} aria-invalid={bad || undefined} style={{ ...S.inp, borderColor: bad ? t.bad : t.line2 }} />
              </label>
            );
          })}
        </div>
      </section>

      <section>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
          <div style={{ ...S.lbl, marginBottom: 0 }}>E-signature</div>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: anyImg ? t.ink : t.muted }}>
            <input type="checkbox" className="ppd-f" checked={anyImg && cfg.applyEsign !== false} disabled={!anyImg || busy} onChange={(e) => setCfgField("applyEsign", e.target.checked)} />
            Apply e-signature
          </label>
          <span style={{ fontSize: 11, color: t.muted }}>🔒 Signature images stay on this browser.</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 12 }}>
          {IMG_KEYS.map(([sig, stamp, title, nameKey]) => (
            <div key={sig} style={{ ...S.card, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{title} <span style={{ fontWeight: 400, color: t.muted }}>· {cfg[nameKey] || "—"}</span></div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <ImageSlot t={t} label="Signature" hint="PNG/JPG ≤ 1 MB · transparent PNG recommended" value={cfg[sig] || ""} onChange={(v) => setCfgField(sig, v)} maxW={600} maxH={240} disabled={busy} />
                <ImageSlot t={t} label="Company stamp (optional)" value={cfg[stamp] || ""} onChange={(v) => setCfgField(stamp, v)} maxW={360} maxH={360} disabled={busy} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: t.muted, marginTop: 6 }}>Placed above the IOH signer’s name on the BAST (first party) and the Notification Letter. The partner’s signature column stays blank.</div>
      </section>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 11.5, color: t.muted }}>
        <span>Saved on this browser only.</span>
        <button className="ppd-f ppd-act-o" style={btnStyle(t, "outline", false, true)} onClick={exportCfg}><IcoDownload /> Export signatory settings</button>
        <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={importCfg} />
        <button className="ppd-f ppd-act-o" style={btnStyle(t, "outline", busy, true)} disabled={busy} onClick={() => importRef.current?.click()}>Import signatory settings</button>
        <button className="ppd-f" style={S.link} disabled={busy} onClick={() => { if (window.confirm("Reset signatories and remove the signature images on this browser?")) setCfg({ ...CFG_DEFAULTS }); }}>Reset to defaults</button>
      </div>
    </div>
  );
}

// ── Wizard: Upload → Review & Preview → Save ─────────────────────────────────
function LettersWizard({ cfg: cfgRaw, meta, docs, index, known, approvals, onSaved, onOpenSettings, onFinish, t }) {
  const S = styles(t);
  const [prevFile, setPrevFile] = useState(null);
  const [tplBusy, setTplBusy] = useState(false);
  const [upload, setUpload] = useState(null);       // { name, format, base, notices }
  const [edits, setEdits] = useState({});           // id → { include, letterNo, pidMode, res }
  const [parsing, setParsing] = useState(false);
  const [phase, setPhase] = useState("review");     // review | saving | saved
  const [prog, setProg] = useState({ i: 0, total: 0 });
  const [zipping, setZipping] = useState(false);
  const [saved, setSaved] = useState([]);
  const [lastTpl, setLastTpl] = useState(readLastTpl);
  const [signMode, setSignMode] = useState("esign");  // esign | approval (per batch)
  const [apprRes, setApprRes] = useState(null);
  const fileRef = useRef(null);
  const prevRef = useRef(null);
  const busy = phase === "saving" || zipping || tplBusy;
  // Mode approval: PDF disimpan tanpa gambar tanda tangan; e-sign bisa dibubuhkan dari History setelah approved
  const cfg = useMemo(() => (signMode === "approval" ? { ...cfgRaw, applyEsign: false } : cfgRaw), [cfgRaw, signMode]);
  const apprAvailable = approvals?.available !== false;
  const apprEmailsOk = APPR_TYPES.every(([dt]) => EMAIL_OK(approverOf(cfgRaw, dt)));
  const step = !upload ? 1 : phase === "saved" ? 3 : 2;
  const setEdit = (id, patch) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
  const esignActive = hasEsign(cfg, "bast") || hasEsign(cfg, "letter");

  const partnerCodes = useMemo(() => assignPartnerCodes((upload?.base || []).map((b) => b.partner)), [upload]);
  const items = useMemo(() => {
    if (!upload) return [];
    const per = parsePeriod(meta.period);
    const fallbackSigner = {};
    (lastTpl?.partners || []).forEach((p) => { fallbackSigner[`${p.type}|${String(p.partner).toUpperCase()}`] = { name: p.signerName, title: p.signerTitle }; });
    const list = upload.base.map((b, id) => {
      const e = edits[id] || {};
      const fin = upload.format === "sms"
        ? finalizeSms(b, { per, docDate: toDateValue(meta.docDate), deadline: toDateValue(meta.deadline), letterNo: e.letterNo ?? meta.letterNo, recipientTitle: { MPC: cfg.recipientMPC, MP3: cfg.recipientMP3 }, fallbackSigner })
        : b;
      const errors = [...fin.errors];
      const warnings = [...(fin.warnings || [])];
      const pk = partnerKey(fin.partner);
      let code = partnerCodes.codes.get(pk) || "X";
      const clash = partnerCodes.clashes.find((c) => c.partner === pk);
      if (clash) warnings.push(`Partner code ${clash.base} is already used by ${clash.with?.replace(/_/g, " ")} in this file — this partner uses ${clash.code}.`);
      // Payment ID yang sudah dipakai partner LAIN (batch sebelumnya) → kode partner ini dibedakan
      const ownerOf = (ref) => known?.get(ref) || "";
      const takenByOther = (ref) => !!ownerOf(ref) && ownerOf(ref) !== pk;
      if (fin.per && !fin.paymentId && takenByOther(paymentIdFor(fin.per.ym, fin.type, code, 1))) {
        const batchCodes = new Set(partnerCodes.codes.values());
        const base = code;
        for (let extra = 1; extra < 20; extra++) {
          const c = partnerCode(fin.partner, extra);
          if (c !== base && !batchCodes.has(c) && !takenByOther(paymentIdFor(fin.per.ym, fin.type, c, 1))) { code = c; break; }
        }
        warnings.push(`Code ${base} is already used by ${ownerOf(paymentIdFor(fin.per.ym, fin.type, base, 1)).replace(/_/g, " ")} for this period — this partner uses ${code}.`);
      }
      const exists = (ref) => (docs?.byRef?.[statKey(SEGMENT, fin.partner, ref)]?.files || 0) > 0 || ownerOf(ref) === pk || (!known && !!index?.has(ref));
      const approvedRef = (ref) => ["bast", "surat_pemberitahuan"].some((dt) => approvalStatus(approvals?.byKey?.[approvalKey(SEGMENT, fin.partner, ref, dt)]) === "approved");
      let pid = "", pidExists = false, pidNext = "", pidLocked = false;
      if (fin.paymentId) {
        pid = fin.paymentId;
        if (!isPaymentRef(pid)) errors.push(`PAYMENT_ID "${pid}" must follow PAY-YYYYMM-TYPE-CODE-NN.`);
        else if (takenByOther(pid)) errors.push(`PAYMENT_ID ${pid} already belongs to ${ownerOf(pid).replace(/_/g, " ")}.`);
        else if (approvedRef(pid)) errors.push(`${pid} is already approved and locked — use a new PAYMENT_ID (e.g. the next number).`);
        else if (exists(pid)) warnings.push(`${pid} already exists — its documents will be replaced.`);
      } else if (fin.per) {
        const first = paymentIdFor(fin.per.ym, fin.type, code, 1);
        pid = first;
        if (exists(first)) {
          pidExists = true;
          let nn = 2; while (exists(paymentIdFor(fin.per.ym, fin.type, code, nn)) && nn < 99) nn++;
          pidNext = paymentIdFor(fin.per.ym, fin.type, code, nn);
          pidLocked = approvedRef(first);
          if ((e.pidMode || "new") === "new" || pidLocked) pid = pidNext;
        }
      }
      const replace = (!!fin.paymentId && isPaymentRef(fin.paymentId) && exists(fin.paymentId)) || (pidExists && !pidLocked && e.pidMode === "replace");
      return {
        ...fin, id, errors, warnings, paymentId: pid, pidExists, pidNext, pidLocked, pidMode: pidLocked ? "new" : e.pidMode || "new",
        pidFirst: fin.per && !fin.paymentId ? paymentIdFor(fin.per.ym, fin.type, code, 1) : "", replace,
        letter: fin.letter && { ...fin.letter, paymentId: pid }, bast: fin.bast && { ...fin.bast, paymentId: pid },
        include: !errors.length && !!pid && (e.include ?? true), res: e.res || null, letterNoEdit: e.letterNo ?? meta.letterNo,
      };
    });
    const count = new Map();
    list.forEach((x) => { if (x.paymentId) count.set(x.paymentId, (count.get(x.paymentId) || 0) + 1); });
    list.forEach((x) => { if (count.get(x.paymentId) > 1) { x.errors = [...x.errors, `Payment ID ${x.paymentId} is used by more than one row — fix PAYMENT_ID in the Excel.`]; x.include = false; } });
    return list;
  }, [upload, edits, meta, cfg.recipientMPC, cfg.recipientMP3, lastTpl, partnerCodes, docs?.byRef, index, known, approvals]);

  // ── Template ──
  const downloadBlank = async () => { setTplBusy(true); try { saveBlobAs(await buildSmsTemplateWorkbook({}), "Source Data SMS template (blank).xlsx", XLSX_MIME); } catch (e) { toast(t, `Template failed: ${errMsg(e)}`, "err"); } setTplBusy(false); };
  const downloadLegacy = async () => { setTplBusy(true); try { saveBlobAs(await buildTemplateWorkbook({}), "MPX Document Template (legacy, blank).xlsx", XLSX_MIME); } catch (e) { toast(t, `Template failed: ${errMsg(e)}`, "err"); } setTplBusy(false); };
  const downloadPrefilled = async () => {
    const per = parsePeriod(meta.period);
    if (!per) { toast(t, "Please choose a valid period.", "err"); return; }
    setTplBusy(true);
    try {
      const carry = prevFile ? await readTemplateCarryOver(new Uint8Array(await prevFile.arrayBuffer())) : (lastTpl || { partners: [], branches: [] });
      const out = [];
      carry.partners.forEach((p) => {
        const brs = carry.branches.filter((b) => b.type === p.type && partnerKey(b.partner) === partnerKey(p.partner));
        (brs.length ? brs : [{ branch: "" }]).forEach((b) => out.push({ brand: p.brand, type: p.type, partner: p.partner, branch: b.branch, emailTo: p.emailTo || "", emailCc: p.emailCc || "", owner: p.signerName || "", jabatan: p.signerTitle || "" }));
      });
      saveBlobAs(await buildSmsTemplateWorkbook({ rows: out, periodLabel: per.label }), `Source Data SMS ${per.ym}.xlsx`, XLSX_MIME);
      toast(t, `Template for ${per.label} downloaded: ${out.length} row(s). Fill the yellow cells.`);
    } catch (e) { toast(t, `Template failed: ${errMsg(e)}`, "err"); }
    setTplBusy(false);
  };

  // ── Upload ──
  const onPick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!/\.xlsx?$/i.test(f.name)) { toast(t, "Please select an Excel file (.xlsx).", "err"); return; }
    setParsing(true);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const format = await detectWorkbookFormat(bytes);
      if (format === "unknown") throw new Error("Unrecognised workbook. Use the Source Data SMS format (sheets BAST and LETTER) or the MPX Document Template.");
      let base, notices = [];
      if (format === "sms") ({ pairs: base, notices } = await parseSmsWorkbook(bytes));
      else base = await parseTemplateWorkbook(bytes);
      if (!base.length) throw new Error("No partner rows were found in this workbook.");
      setUpload({ name: f.name, format, base, notices });
      setEdits({}); setPhase("review"); setSaved([]);
      notices.slice(0, 3).forEach((n) => toast(t, n, "info"));
    } catch (err) { toast(t, errMsg(err), "err"); }
    setParsing(false);
  };

  // ── Preview ──
  const [pv, setPv] = useState({ id: null, tab: "bast", all: false });
  const [pvState, setPvState] = useState({ url: "", bytes: null, busy: false, err: "" });
  const urlRef = useRef("");
  const previewable = items.filter((x) => x.letter && x.bast);
  const pvIdx = previewable.findIndex((x) => x.id === pv.id);
  const cur = pvIdx >= 0 ? previewable[pvIdx] : null;
  const open = step === 2 && (pv.all || !!cur);
  const pvSig = useMemo(() => {
    if (!open) return "";
    if (pv.all) return JSON.stringify({ all: previewable.filter((x) => !x.errors.length).map((x) => [x.letter, x.bast]), cfg });
    return JSON.stringify({ tab: pv.tab, doc: pv.tab === "bast" ? cur.bast : cur.letter, cfg });
  }, [open, pv.all, pv.tab, cur, previewable, cfg]);
  useEffect(() => {
    if (!pvSig) return undefined;
    let alive = true;
    const timer = setTimeout(async () => {
      if (!alive) return;
      setPvState((s) => ({ ...s, busy: true, err: "" }));
      try {
        const lh = await loadLetterhead();
        let bytes;
        if (pv.all) {
          const parts = [];
          for (const x of previewable.filter((y) => !y.errors.length)) { parts.push(await buildBastPdf(x.bast, cfg, lh)); parts.push(await buildLetterPdf(x.letter, cfg, lh)); }
          if (!parts.length) throw new Error("No valid rows to preview.");
          bytes = await mergePdfBytes(parts);
        } else bytes = pv.tab === "bast" ? await buildBastPdf(cur.bast, cfg, lh) : await buildLetterPdf(cur.letter, cfg, lh);
        if (!alive) return;
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setPvState({ url, bytes, busy: false, err: "" });
      } catch (e) { if (alive) setPvState((s) => ({ ...s, busy: false, err: errMsg(e) })); }
    }, 350);
    return () => { alive = false; clearTimeout(timer); };
  }, [pvSig]); // eslint-disable-line react-hooks/exhaustive-deps -- pvSig mewakili semua input render
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  const openPreview = (id, tab) => setPv((p) => ({ id, tab: tab || p.tab, all: false }));
  const closePreview = () => setPv((p) => ({ ...p, id: null, all: false }));
  const stepPv = (d) => { if (!previewable.length) return; const n = (pvIdx + d + previewable.length) % previewable.length; setPv((p) => ({ ...p, id: previewable[n].id, all: false })); };
  const pvFileName = pv.all ? `BAST_and_Letters_preview_${meta.period}.pdf` : cur ? (pv.tab === "bast" ? bastFileName(cur) : letterFileName(cur)) : "preview.pdf";

  const valid = items.filter((x) => !x.errors.length);
  const ready = valid.filter((x) => x.include && x.paymentId);

  // ── Simpan PDF bertanda tangan + metadata pembayaran ──
  const saveAll = async () => {
    if (!ready.length) return;
    if (signMode === "approval") {
      if (!apprAvailable) { toast(t, APPR_MISSING, "err"); return; }
      if (!apprEmailsOk) { toast(t, "Add both approver emails in ⚙ Settings first (BAST and Notification Letter).", "err"); onOpenSettings(); return; }
    } else if (!esignActive && !window.confirm("No e-signature is applied (upload signature images in ⚙ Settings, or turn on “Apply e-signature”). Save the documents without a signature?")) return;
    setPhase("saving");
    const total = ready.length * 2;
    setProg({ i: 0, total });
    let i = 0, ok = 0, fail = 0;
    const done = [];
    let lh;
    try { lh = await loadLetterhead(); } catch (e) { toast(t, errMsg(e), "err"); setPhase("review"); return; }
    for (const it of ready) {
      const res = {};
      for (const [kind, docType, build, name] of [
        ["bast", "bast", () => buildBastPdf(it.bast, cfg, lh), bastFileName(it)],
        ["letter", "surat_pemberitahuan", () => buildLetterPdf(it.letter, cfg, lh), letterFileName(it)],
      ]) {
        try {
          const file = new File([await build()], name, { type: "application/pdf" });
          const r = await uploadSlot({ files: [file], partnerName: it.partner, refId: it.paymentId, docType, segment: SEGMENT, replace: !!it.replace });
          if (r.ok.length || r.skipped.length) { res[kind] = r.ok.length ? "ok" : "same"; ok++; }
          else { res[kind] = `error: ${r.errors[0]?.message || "failed"}`; fail++; }
        } catch (e) { res[kind] = `error: ${errMsg(e)}`; fail++; }
        setProg({ i: ++i, total });
      }
      if (!/^error/.test(res.bast || "") && !/^error/.test(res.letter || "")) {
        try {
          await savePaymentMeta(SEGMENT, {
            payment_id: it.paymentId, partner: it.partner, type: it.type, period: it.per?.label || "", period_ym: it.per?.ym || "",
            total: it.letter.total, dpp: it.letter.dpp, ppn: it.letter.ppn, pph: it.letter.pph, claim_deadline: it.letter.deadline || "",
            letter_no: it.letter.letterNo, email_to: it.emailsTo || [], email_cc: it.emailsCc || [], branches: it.bast.branches.map((b) => b.name),
            esign: { bast: hasEsign(cfg, "bast"), letter: hasEsign(cfg, "letter") }, sign_mode: signMode,
            saved_at: new Date().toISOString(), source_file: upload?.name || "",
            doc: { bast: it.bast, letter: it.letter },   // untuk membubuhkan e-sign setelah approved
          });
        } catch (e) { res.meta = `error: ${errMsg(e)}`; }
        done.push({ pid: it.paymentId, partner: it.partner, type: it.type, period: it.per?.label || "", total: it.letter.total, res });
      }
      setEdit(it.id, { res });
    }
    if (ok) {
      writeJson(LAST_TPL_KEY, {
        savedAt: new Date().toISOString(),
        partners: valid.map((x) => ({ type: x.type, partner: x.partner, brand: x.brand || "", signerName: x.bast.signerName, signerTitle: x.bast.signerTitle, emailTo: (x.emailsTo || []).join("; "), emailCc: (x.emailsCc || []).join("; ") })),
        branches: valid.flatMap((x) => x.bast.branches.map((b) => ({ type: x.type, partner: x.partner, branch: b.name }))),
      });
      setLastTpl(readLastTpl());
    }
    let ar = null;
    if (signMode === "approval" && done.length) {
      setProg((p) => ({ ...p, label: "Requesting approval…" }));
      ar = await requestApprovals(cfgRaw, done, approvals);
      setApprRes(ar);
    } else setApprRes(null);
    docs?.refresh?.();
    await onSaved?.();
    setSaved(done);
    if (done.length) { closePreview(); setPhase("saved"); } else setPhase("review");
    toast(t, `Saved ${done.length} payment(s) · ${ok} document(s)${fail ? `, ${fail} failed` : ""}${ar ? ` · approval requested ${ar.ok}${ar.fail ? `, failed ${ar.fail} (${ar.reasons[0]})` : ""}` : ""}.`, fail || ar?.fail ? "err" : "ok");
  };

  const downloadZip = async () => {
    setZipping(true);
    try {
      const [{ default: JSZip }, lh] = await Promise.all([import("jszip"), loadLetterhead()]);
      const zip = new JSZip();
      for (const it of valid) {
        zip.file(`${it.type}/${bastFileName(it)}`, await buildBastPdf(it.bast, cfg, lh));
        zip.file(`${it.type}/${letterFileName(it)}`, await buildLetterPdf(it.letter, cfg, lh));
      }
      saveBlobAs(await zip.generateAsync({ type: "uint8array" }), `BAST_and_Letters_${valid[0]?.per?.ym || "MPX"}.zip`, "application/zip");
      toast(t, `ZIP with ${valid.length * 2} document(s) downloaded.`);
    } catch (e) { toast(t, `ZIP failed: ${errMsg(e)}`, "err"); }
    setZipping(false);
  };

  const num = { ...S.td, textAlign: "right", fontFamily: MONO, whiteSpace: "nowrap" };
  const resLabel = (v) => v === "ok" ? "✓ saved" : v === "same" ? "already saved" : v ? `✕ ${v.replace(/^error: /, "")}` : "";
  const errCount = items.filter((x) => x.errors.length).length;
  const isSms = upload?.format === "sms";
  const reset = () => { setUpload(null); setPhase("review"); setSaved([]); setApprRes(null); closePreview(); };

  return (
    <div style={{ "--ppd-line": t.line }}>
      <div style={{ padding: "10px 20px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <ol aria-label="Steps" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {[[1, "Upload Excel"], [2, "Review & Preview"], [3, "Save"]].map(([n, l], k) => {
            const done = step > n, active = step === n;
            return (
              <li key={n} aria-current={active ? "step" : undefined} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {k > 0 && <span aria-hidden="true" style={{ width: 22, height: 1.5, background: done || active ? TEAL : t.line2 }} />}
                <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 99, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 11, fontWeight: 800, background: active ? TEAL : done ? t.goodBg : t.surf3, color: active ? "#fff" : done ? (t.goodDark || TEAL_D) : t.muted, border: done ? `1px solid ${t.goodBd}` : "none" }}>{done ? "✓" : n}</span>
                <span style={{ fontSize: 12.5, fontWeight: active ? 700 : 600, color: active ? t.ink : t.muted, whiteSpace: "nowrap" }}>{l}</span>
              </li>
            );
          })}
        </ol>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, color: t.muted }}>Signing</span>
          <span role="radiogroup" aria-label="Signing method" style={{ display: "inline-flex", background: t.surf3, borderRadius: 9, padding: 2, gap: 2, border: `1px solid ${t.line}` }}>
            {[["esign", "✍ Apply e-signature"], ["approval", "✉ Request approval"]].map(([k, l]) => (
              <button key={k} role="radio" aria-checked={signMode === k} className="ppd-f" disabled={busy || phase === "saved"} onClick={() => setSignMode(k)}
                style={{ fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 7, border: 0, cursor: "pointer", background: signMode === k ? TEAL : "transparent", color: signMode === k ? "#fff" : t.muted, whiteSpace: "nowrap" }}>{l}</button>
            ))}
          </span>
          {signMode === "esign" ? (esignActive
            ? <Chip color={t.goodDark || TEAL_D} bg={t.goodBg} bd={t.goodBd} title="Signature images from ⚙ Settings are applied">E-signature on</Chip>
            : <button className="ppd-f" onClick={onOpenSettings} style={{ all: "unset", cursor: "pointer" }} title="Upload signature images in ⚙ Settings"><Chip color={t.warnDark || "#8a6a00"} bg={t.warnBg} bd={t.warnBd}>No signature image — set up</Chip></button>)
            : !apprAvailable ? <Chip color={t.bad} bg={t.badBg} bd={t.badBd} title={APPR_MISSING}>Approval not set up</Chip>
            : apprEmailsOk ? <Chip color={t.goodDark || TEAL_D} bg={t.goodBg} bd={t.goodBd} title={`BAST → ${approverOf(cfgRaw, "bast")} · Letter → ${approverOf(cfgRaw, "surat_pemberitahuan")}`}>Approvers set</Chip>
            : <button className="ppd-f" onClick={onOpenSettings} style={{ all: "unset", cursor: "pointer" }}><Chip color={t.warnDark || "#8a6a00"} bg={t.warnBg} bd={t.warnBd}>Add approver emails</Chip></button>}
          <span style={{ fontFamily: MONO, fontSize: 10.5, color: t.muted }}>{parsePeriod(meta.period)?.label || "No period"} · {meta.docDate} · {meta.letterNo}</span>
        </span>
      </div>
      {signMode === "approval" && step === 2 && (
        <div role="note" style={{ margin: "10px 20px 0", fontSize: 12, padding: "8px 12px", borderRadius: 10, lineHeight: 1.5,
          color: apprAvailable ? t.ink2 : t.bad, background: apprAvailable ? t.infoBg : t.badBg, border: `1px solid ${apprAvailable ? t.infoBd : t.badBd}` }}>
          {apprAvailable
            ? <>Documents are saved <b>without</b> a signature image, then sent for approval: BAST → <b>{approverOf(cfgRaw, "bast") || "—"}</b>, Notification Letter → <b>{approverOf(cfgRaw, "surat_pemberitahuan") || "—"}</b>. Approvers sign in to SandraHub to approve. Once approved, you can stamp the e-signature from History.</>
            : APPR_MISSING}
        </div>
      )}
      <input ref={prevRef} type="file" accept=".xlsx" hidden onChange={(e) => { setPrevFile(e.target.files?.[0] || null); e.target.value = ""; }} />
      <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={onPick} />

      {step === 1 && (
        <div style={{ padding: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          <div role="button" tabIndex={0} className="ppd-f" onClick={() => !parsing && fileRef.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
            style={{ border: `2px dashed ${t.line2}`, borderRadius: 16, padding: "40px 18px", textAlign: "center", background: t.surf2, color: t.muted, fontSize: 12.5, lineHeight: 1.6, cursor: parsing ? "progress" : "pointer" }}>
            <div style={{ color: TEAL, display: "inline-flex" }}><IcoUp /></div>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.ink, marginTop: 4 }}>{parsing ? "Reading workbook…" : "Upload the Excel file"}</div>
            Source Data SMS workbook (sheets BAST and LETTER, one row per branch).<br />One BAST and one Notification Letter per partner and type; each gets a unique Payment ID.
            <div style={{ marginTop: 12 }}><span className="ppd-act" style={{ ...btnStyle(t, "primary", parsing), display: "inline-flex" }}>⬆ {parsing ? "Reading…" : "Choose Excel file"}</span></div>
          </div>
          <div style={{ ...S.card, borderRadius: 16, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>Need a template?</div>
            <div style={{ fontSize: 12, color: t.muted, lineHeight: 1.5 }}>The pre-filled template lists partners, branches, emails and signatories for <b>{parsePeriod(meta.period)?.label || "the selected period"}</b> — you only fill SLA, TDS and Sales Margin (yellow cells). The optional <code style={{ fontFamily: MONO }}>PAYMENT_ID</code> column overrides the automatic ID.</div>
            <div style={{ fontSize: 12, color: t.muted }}>
              Based on: <button className="ppd-f" style={S.link} onClick={() => prevRef.current?.click()}>
                {prevFile ? prevFile.name : lastTpl ? `last generation (${new Date(lastTpl.savedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })})` : "choose last month’s file"}
              </button>
              {prevFile && <button className="ppd-f" style={{ all: "unset", cursor: "pointer", color: t.muted, marginLeft: 6 }} onClick={() => setPrevFile(null)} aria-label="Remove previous file">✕</button>}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button className="ppd-f ppd-act-o" style={btnStyle(t, "outline", busy, true)} disabled={busy} onClick={downloadPrefilled}><IcoDownload /> {tplBusy ? "Preparing…" : "Download pre-filled template"}</button>
              <RowMenu t={t} label="Other templates" items={[{ label: "Blank template (Source Data SMS)", onClick: downloadBlank }, { label: "Legacy template (MPX Document Template)", onClick: downloadLegacy }]} />
            </div>
            <div style={{ fontSize: 11, color: t.muted }}>Change the period, dates and signatures in ⚙ Settings.</div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="ppd-gen-body" style={{ height: open ? "80vh" : undefined, maxHeight: open ? undefined : "66vh" }}>
          <div className="ppd-gen-table">
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 1180 }}>
              <thead><tr>
                <th style={{ ...S.th, width: 30 }}><span className="ppd-sr">Include</span></th>
                <th style={S.th}>Payment ID</th><th style={S.th}>Partner</th><th style={S.th}>Type</th>
                <th style={{ ...S.th, textAlign: "right" }}>DPP</th><th style={{ ...S.th, textAlign: "right" }}>PPN</th><th style={{ ...S.th, textAlign: "right" }}>PPh 23</th><th style={{ ...S.th, textAlign: "right" }}>Total transfer</th>
                {isSms && <th style={S.th}>Letter No · signatory · email</th>}
                <th style={S.th}>Status</th><th style={S.th}>Preview</th>
              </tr></thead>
              <tbody>
                {items.map((x) => {
                  const bad = x.errors.length > 0;
                  const sel = pv.id === x.id && !pv.all;
                  return (
                    <tr key={x.id} className="ppd-gen-row" onClick={() => { if (x.letter && x.bast) openPreview(x.id); }}
                      style={{ background: sel ? t.rowHover : bad ? t.badBg : x.warnings.length ? t.warnBg : "transparent", opacity: bad || x.include ? 1 : 0.6, boxShadow: sel ? `inset 3px 0 0 ${TEAL}` : "none" }}>
                      <td style={{ ...S.td, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="ppd-f" aria-label={`Include ${x.partner} ${x.type}`} checked={x.include} disabled={bad || busy || !x.paymentId} onChange={(e) => setEdit(x.id, { include: e.target.checked })} />
                      </td>
                      <td style={{ ...S.td, minWidth: 190 }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ fontFamily: MONO, fontWeight: 700, color: t.ink, fontSize: 11.5, whiteSpace: "nowrap" }}>{x.paymentId || "Choose a period"}</div>
                        {x.pidExists && (
                          <select className="ppd-f" aria-label={`Existing payment for ${x.partner} ${x.type}`} value={x.pidMode} disabled={bad || busy} onChange={(e) => setEdit(x.id, { pidMode: e.target.value })}
                            style={{ ...S.inp, marginTop: 4, fontFamily: MONO, fontSize: 10.5, padding: "3px 5px", borderColor: t.warn }}>
                            <option value="new">{`Exists — create as ${x.pidNext}`}</option>
                            <option value="replace" disabled={x.pidLocked}>{x.pidLocked ? `${x.pidFirst} is approved — locked` : `Replace existing ${x.pidFirst}`}</option>
                          </select>
                        )}
                      </td>
                      <td style={{ ...S.td, fontWeight: 600, color: t.ink, maxWidth: 210 }}>{x.partner || "—"}<div style={{ fontSize: 10.5, color: t.muted, fontWeight: 400 }}>{x.bast?.branches?.map((b) => b.name).join(", ")}</div></td>
                      <td style={S.td}>{x.type && <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, padding: "1px 6px", borderRadius: 6, background: t.surf3 }}>{x.type}</span>}</td>
                      <td style={num}>{x.letter ? rupiah(x.letter.dpp) : "—"}</td>
                      <td style={num}>{x.letter ? rupiah(x.letter.ppn) : "—"}</td>
                      <td style={num}>{x.letter ? rupiah(-x.letter.pph) : "—"}</td>
                      <td style={{ ...num, fontWeight: 700, color: t.ink }}>{x.letter ? rupiah(x.letter.total) : "—"}</td>
                      {isSms && (
                        <td style={{ ...S.td, minWidth: 220, fontSize: 11 }} onClick={(e) => e.stopPropagation()}>
                          <input className="ppd-f" value={x.letterNoEdit} onChange={(e) => setEdit(x.id, { letterNo: e.target.value })} disabled={busy} aria-label={`Letter No for ${x.partner} ${x.type}`} style={{ ...S.inp, fontFamily: MONO, fontSize: 11, padding: "4px 6px" }} />
                          <div style={{ marginTop: 3 }}>{x.bast?.signerName || <span style={{ color: t.bad }}>no OWNER</span>}{x.bast?.signerTitle ? ` · ${x.bast.signerTitle}` : ""}</div>
                          {x.emailsTo?.length > 0 && <div title={x.emailsTo.join("; ")} style={{ color: t.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 230 }}>To: {x.emailsTo.join("; ")}</div>}
                        </td>
                      )}
                      <td style={{ ...S.td, fontSize: 11, minWidth: 200 }}>
                        {x.errors.map((m, i) => <div key={`e${i}`} style={{ color: t.bad, fontWeight: 600 }}>✕ {m}</div>)}
                        {x.warnings.map((m, i) => <div key={`w${i}`} style={{ color: t.warnDark || t.warn, fontWeight: 600 }}>⚠ {m}</div>)}
                        {!bad && (x.res
                          ? <><div>BAST: {resLabel(x.res.bast)}</div><div>Letter: {resLabel(x.res.letter)}</div>{x.res.meta && <div style={{ color: t.bad }}>Details: {x.res.meta.replace(/^error: /, "")}</div>}</>
                          : <span style={{ color: t.muted }}>{x.replace ? "Will replace existing documents" : "Ready"}</span>)}
                      </td>
                      <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                        {!bad && <>
                          <button className="ppd-f ppd-act-o" style={{ ...btnStyle(t, "outline", false, true), marginRight: 4 }} onClick={(e) => { e.stopPropagation(); openPreview(x.id, "bast"); }}>BAST</button>
                          <button className="ppd-f ppd-act-o" style={btnStyle(t, "outline", false, true)} onClick={(e) => { e.stopPropagation(); openPreview(x.id, "letter"); }}>Letter</button>
                        </>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {open && (
            <aside className="ppd-gen-prev" aria-label="Document preview" style={{ background: t.surf }}>
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${t.line}`, display: "flex", flexDirection: "column", gap: 8, background: t.surf2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: MAGENTA, fontWeight: 700 }}>Preview</span>
                  {!pv.all && (
                    <div role="tablist" aria-label="Document" style={{ display: "inline-flex", background: t.surf3, borderRadius: 9, padding: 2, gap: 2, border: `1px solid ${t.line}` }}>
                      {[["bast", "BAST"], ["letter", "Notification Letter"]].map(([k, l]) => (
                        <button key={k} role="tab" aria-selected={pv.tab === k} className="ppd-f" onClick={() => setPv((p) => ({ ...p, tab: k }))}
                          style={{ fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 7, border: 0, cursor: "pointer", background: pv.tab === k ? TEAL : "transparent", color: pv.tab === k ? "#fff" : t.muted }}>{l}</button>
                      ))}
                    </div>
                  )}
                  <button className="ppd-f" onClick={closePreview} aria-label="Close preview" style={{ ...btnStyle(t, "ghost", false, true), marginLeft: "auto", fontSize: 18, lineHeight: 1, padding: "1px 7px", color: t.muted }}>×</button>
                </div>
                {pv.all ? (
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>All documents · {previewable.filter((x) => !x.errors.length).length} payment(s) <span style={{ fontWeight: 400, color: t.muted }}>— check only, nothing is saved</span></div>
                ) : cur && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button className="ppd-f" style={btnStyle(t, "outline", previewable.length < 2, true)} disabled={previewable.length < 2} onClick={() => stepPv(-1)} aria-label="Previous partner">‹ Prev</button>
                    <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={cur.partner}>{cur.partner} · {cur.type}</div>
                      <div style={{ fontFamily: MONO, fontSize: 10.5, color: t.muted }}>{cur.paymentId} · {pvIdx + 1}/{previewable.length} · {rupiah(cur.letter.total)}</div>
                    </div>
                    <button className="ppd-f" style={btnStyle(t, "outline", previewable.length < 2, true)} disabled={previewable.length < 2} onClick={() => stepPv(1)} aria-label="Next partner">Next ›</button>
                  </div>
                )}
              </div>
              <div style={{ flex: 1, position: "relative", background: t.surf3, minHeight: 240 }}>
                {pvState.bytes && <PdfPages bytes={pvState.bytes} url={pvState.url} />}
                {(pvState.busy || (!pvState.url && !pvState.err)) && (
                  <div aria-live="polite" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: pvState.url ? "rgba(0,0,0,0.12)" : "transparent" }}>
                    <span style={{ fontFamily: MONO, fontSize: 11.5, padding: "6px 12px", borderRadius: 99, background: t.surf, color: t.muted, boxShadow: t.shadow1 }}>Rendering preview…</span>
                  </div>
                )}
                {pvState.err && <div role="alert" style={{ position: "absolute", inset: 16, color: t.bad, fontSize: 12.5 }}>Preview failed: {pvState.err}</div>}
              </div>
              <div style={{ padding: "10px 14px", borderTop: `1px solid ${t.line}`, display: "flex", gap: 8, flexWrap: "wrap", background: t.surf2 }}>
                <button className="ppd-f ppd-act-o" style={btnStyle(t, "outline", !pvState.bytes || pvState.busy, true)} disabled={!pvState.bytes || pvState.busy} onClick={() => saveBlobAs(pvState.bytes, pvFileName, "application/pdf")}><IcoDownload /> Download this PDF</button>
                <button className="ppd-f ppd-act-o" style={btnStyle(t, "outline", !pvState.url || pvState.busy, true)} disabled={!pvState.url || pvState.busy} onClick={() => window.open(pvState.url, "_blank", "noopener")}><IcoOpen /> Open in new tab</button>
              </div>
            </aside>
          )}
        </div>
      )}

      {step === 3 && (
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            {[["Payments saved", saved.length, `${saved.length * 2} PDF(s)${esignActive ? " · e-signed" : ""}`], ["Total transfer", null, rupiah(saved.reduce((a, r) => a + (r.total || 0), 0))], ["Period", null, parsePeriod(meta.period)?.label || "—"]].map(([l, v, sub]) => (
              <div key={l} style={{ ...S.card, background: t.surf2 }}>
                <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: t.muted }}>{l}</div>
                <div style={{ fontSize: v == null ? 15 : 22, fontWeight: 800, marginTop: 3, fontFamily: v == null ? MONO : "inherit" }}>{v == null ? sub : v}</div>
                {v != null && <div style={{ fontFamily: MONO, fontSize: 10, color: t.muted }}>{sub}</div>}
              </div>
            ))}
          </div>
          {apprRes && (
            <div role="status" style={{ fontSize: 12.5, padding: "9px 12px", borderRadius: 10, color: apprRes.fail ? t.bad : t.ink2, background: apprRes.fail ? t.badBg : t.infoBg, border: `1px solid ${apprRes.fail ? t.badBd : t.infoBd}` }}>
              Approval requested for {apprRes.ok} document(s){apprRes.skipped ? `, skipped ${apprRes.skipped}` : ""}{apprRes.fail ? `, failed ${apprRes.fail}: ${apprRes.reasons[0]} — retry from History` : ""}. Track the status in History.
            </div>
          )}
          <div style={{ ...S.card, padding: 0, overflow: "auto", maxHeight: "48vh" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead><tr><th style={S.th}>Payment ID</th><th style={S.th}>Partner</th><th style={S.th}>Type</th><th style={{ ...S.th, textAlign: "right" }}>Total transfer</th><th style={S.th}>Result</th></tr></thead>
              <tbody>
                {saved.map((r) => (
                  <tr key={r.pid}>
                    <td style={{ ...S.td, fontFamily: MONO, fontWeight: 700, color: t.ink }}>{r.pid}</td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{r.partner}</td>
                    <td style={S.td}>{r.type}</td>
                    <td style={{ ...S.td, textAlign: "right", fontFamily: MONO }}>{rupiah(r.total)}</td>
                    <td style={{ ...S.td, fontSize: 11 }}>BAST {resLabel(r.res.bast)} · Letter {resLabel(r.res.letter)}{r.res.meta ? <span style={{ color: t.bad }}> · details not saved</span> : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {phase === "saving" && (
        <div style={{ padding: "10px 20px", borderTop: `1px solid ${t.line}` }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, color: t.muted, marginBottom: 6 }}>{prog.label || `Generating & saving ${prog.i}/${prog.total} document(s)…`}</div>
          <IndeterminateBar t={t} pct={prog.total ? Math.round((prog.i / prog.total) * 100) : 0} />
        </div>
      )}

      {step > 1 && (
        <div style={{ borderTop: `1px solid ${t.line}`, background: t.surf2, padding: "12px 20px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderRadius: "0 0 18px 18px" }}>
          {step === 2 && <span style={{ fontFamily: MONO, fontSize: 11, color: t.muted }}>{upload?.name} · {ready.length} of {items.length} ready{items.some((x) => x.warnings.length) ? ` · ${items.filter((x) => x.warnings.length).length} with warnings` : ""}{errCount ? ` · ${errCount} invalid (blocked)` : ""}</span>}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {step === 2 && <>
              <RowMenu t={t} label="More" items={[
                { label: "Upload another file", onClick: () => fileRef.current?.click(), disabled: busy },
                { label: "Start over", onClick: reset, disabled: busy },
              ]} />
              <button className="ppd-f ppd-act-o" style={btnStyle(t, "outline", busy || !valid.length)} disabled={busy || !valid.length} onClick={downloadZip}><IcoDownload /> {zipping ? "Preparing ZIP…" : "Download all as ZIP"}</button>
              <button className="ppd-f ppd-act-o" style={btnStyle(t, "outline", busy || !valid.length)} disabled={busy || !valid.length} onClick={() => setPv((p) => ({ ...p, all: true }))}>👁 Preview all</button>
              <button className="ppd-f ppd-act" style={btnStyle(t, "primary", busy || !ready.length)} disabled={busy || !ready.length} onClick={saveAll}
                title="Generate the e-signed PDFs and save them under their Payment IDs">
                {phase === "saving" ? (prog.label || `Saving ${prog.i}/${prog.total}…`) : signMode === "approval" ? `⬆ Save ${ready.length} & request approval` : `⬆ Save ${ready.length} payment(s)`}
              </button>
            </>}
            {step === 3 && <>
              <button className="ppd-f" style={btnStyle(t, "ghost")} onClick={reset}>New batch</button>
              <button className="ppd-f ppd-act" style={btnStyle(t, "primary")} onClick={onFinish}>View History →</button>
            </>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── History ──────────────────────────────────────────────────────────────────
function LettersHistory({ cfg, index, indexErr, approvals, reload, canWrite = true, docs, t }) {
  const S = styles(t);
  const [rowsRaw, setRowsRaw] = useState(null);
  const [err, setErr] = useState("");
  const [metas, setMetas] = useState({});        // pid → meta JSON
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState("all");
  const [sel, setSel] = useState(() => new Set());
  const [zipping, setZipping] = useState(false);
  const [working, setWorking] = useState("");      // label proses (request / stamp)
  const [apprFilter, setApprFilter] = useState("all");
  const apprAvailable = approvals?.available !== false;
  // SPM: upload BAST / Surat bertanda tangan untuk Payment ID yang sudah ada (file lama tetap sebagai arsip)
  const signedInRef = useRef(null);
  const [upTarget, setUpTarget] = useState(null);   // { g, docType }
  const askSigned = (g, docType) => { setUpTarget({ g, docType }); setTimeout(() => signedInRef.current?.click(), 0); };
  const onSignedFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const tg = upTarget;
    if (!file || !tg) return;
    if (fileKind(file.name, file.type) !== "pdf") { toast(t, "Please upload the signed document as a PDF.", "err"); return; }
    const bad = validateFile(file);
    if (bad) { toast(t, bad, "err"); return; }
    setWorking(`Uploading signed ${tg.docType === "bast" ? "BAST" : "Letter"}…`);
    try {
      const r = await uploadSlot({ files: [new File([file], spmSignedName(tg.docType, tg.g.pid, tg.g.partner), { type: "application/pdf" })], partnerName: tg.g.partner, refId: tg.g.pid, docType: tg.docType, segment: SEGMENT, replace: false });
      if (r.errors.length) throw new Error(r.errors[0].message);
      toast(t, `Signed ${tg.docType === "bast" ? "BAST" : "Notification Letter"} uploaded for ${tg.g.pid}. It is now the latest version.`);
      await reload();
    } catch (err) { toast(t, `Upload failed: ${errMsg(err)}`, "err"); }
    setWorking(""); setUpTarget(null);
  };

  useEffect(() => {
    let alive = true;
    fetchDraftDocs(SEGMENT)
      .then((d) => { if (alive) { setRowsRaw(d.filter((x) => isPaymentRef(x.ref_id))); setErr(""); } })
      .catch((e) => { if (alive) { setRowsRaw([]); setErr(errMsg(e)); } });
    return () => { alive = false; };
  }, [index]);

  // metadata pembayaran (total, e-sign) — dimuat per path yang belum ada
  useEffect(() => {
    if (!index) return undefined;
    let alive = true;
    const todo = [...index.entries()].filter(([pid, e]) => metas[pid]?._path !== e.metaPath);
    if (!todo.length) return undefined;
    (async () => {
      const got = {};
      for (let i = 0; i < todo.length; i += 8) {
        await Promise.all(todo.slice(i, i + 8).map(async ([pid, e]) => { try { got[pid] = { ...(await readJsonFile(e.metaPath)), _path: e.metaPath }; } catch { got[pid] = { _path: e.metaPath, _err: true }; } }));
      }
      if (alive) setMetas((m) => ({ ...m, ...got }));
    })();
    return () => { alive = false; };
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps -- metas hanya dibaca untuk melewati yang sudah dimuat

  const groups = useMemo(() => {
    const m = new Map();
    (rowsRaw || []).forEach((d) => {
      const k = d.ref_id;
      if (!m.has(k)) m.set(k, { pid: k, partner: d.partner_name, info: parsePaymentRef(k), files: { bast: [], surat_pemberitahuan: [] }, lastAt: "" });
      const g = m.get(k);
      if (g.files[d.doc_type]) g.files[d.doc_type].push(d);
      if (d.uploaded_at > g.lastAt) g.lastAt = d.uploaded_at;
    });
    return [...m.values()].map((g) => {
      const meta = metas[g.pid] || {};
      ["bast", "surat_pemberitahuan"].forEach((k) => g.files[k].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)));
      const ap = apprSummary(approvals, g.partner, g.pid);
      return { ...g, meta, total: meta.total, period: meta.period || g.info?.label || "", type: meta.type || g.info?.type || "", ap };
    }).sort((a, b) => (b.info?.ym || "").localeCompare(a.info?.ym || "") || a.partner.localeCompare(b.partner) || a.type.localeCompare(b.type));
  }, [rowsRaw, metas, approvals]);

  const periods = useMemo(() => [...new Set(groups.map((g) => g.info?.ym).filter(Boolean))].sort().reverse(), [groups]);
  const qq = q.trim().toLowerCase();
  const shown = groups.filter((g) => (period === "all" || g.info?.ym === period) && (!qq || `${g.pid} ${g.partner}`.toLowerCase().includes(qq))
    && (apprFilter === "all" || (apprFilter === "none" ? !g.ap.overall : g.ap.overall === apprFilter)));
  const selected = shown.filter((g) => sel.has(g.pid));
  const toggle = (k) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const openDoc = async (d) => { try { window.open(await signedUrl(d.storage_path), "_blank", "noopener"); } catch (e) { toast(t, `Unable to open: ${errMsg(e)}`, "err"); } };
  // file terbaru per jenis; versi bertanda tangan (upload SPM / owner partner) didahulukan
  const latestOf = (list) => list.find((d) => /_signed-(owner|spm)/.test(d.file_name || "")) || list[0];
  const docsOf = (g) => [["bast", "BAST"], ["surat_pemberitahuan", "LETTER"]].flatMap(([k, s]) => g.files[k][0] ? [{ ...latestOf(g.files[k]), file_name: `${s}_${g.pid}_${g.partner}.pdf`, _label: s === "BAST" ? "BAST" : "Letter" }] : []);
  const zipSelected = async (list) => {
    const files = list.flatMap(docsOf);
    if (!files.length) return;
    setZipping(true);
    try {
      const { failed } = await downloadDocsZip(files, `Partner_Letters_${period === "all" ? "selected" : period}.zip`);
      toast(t, failed.length ? `ZIP downloaded; ${failed.length} file(s) failed.` : `ZIP with ${files.length} PDF(s) downloaded.`, failed.length ? "err" : "ok");
    } catch (e) { toast(t, `ZIP failed: ${errMsg(e)}`, "err"); }
    setZipping(false);
  };
  const sumTotal = shown.reduce((a, g) => a + (g.total || 0), 0);
  const asRow = (g) => ({ pid: g.pid, partner: g.partner, type: g.type, period: g.period, total: g.total });
  const canRequest = (g) => !["pending", "approved"].includes(g.ap.overall);
  const canStamp = (g) => canWrite && g.ap.overall === "approved" && !!g.meta.doc && !(g.meta.esign?.bast && g.meta.esign?.letter);
  const doRequest = async (list) => {
    if (!apprAvailable) { toast(t, APPR_MISSING, "err"); return; }
    if (!APPR_TYPES.every(([dt]) => EMAIL_OK(approverOf(cfg, dt)))) { toast(t, "Add both approver emails in ⚙ Settings first (BAST and Notification Letter).", "err"); return; }
    const todo = list.filter(canRequest);
    if (!todo.length) { toast(t, "The selected payments are already pending or approved.", "info"); return; }
    if (!window.confirm(`Request approval for ${todo.length} payment(s)?\n\nBAST → ${approverOf(cfg, "bast")}\nNotification Letter → ${approverOf(cfg, "surat_pemberitahuan")}`)) return;
    setWorking("Requesting approval…");
    const r = await requestApprovals(cfg, todo.map(asRow), approvals);
    setWorking("");
    await reload();
    toast(t, `Approval requested for ${r.ok} document(s)${r.skipped ? `, skipped ${r.skipped}` : ""}${r.fail ? `, failed ${r.fail}: ${r.reasons[0]}` : ""}.`, r.fail ? "err" : "ok");
  };
  const apprAction = async (action, g) => {
    const ids = APPR_TYPES.map(([dt]) => g.ap.st[dt]).filter((x) => x.s === "pending" && x.a?.id).map((x) => x.a.id);
    if (!ids.length) return;
    if (action === "cancel" && !window.confirm(`Cancel the pending approval request(s) for ${g.pid}?`)) return;
    setWorking(action === "remind" ? "Sending reminder…" : "Cancelling…");
    let fail = "";
    for (const id of ids) { try { await approvalApi(action, action === "cancel" ? { id, reason: "Cancelled from Partner Letters" } : { id }); } catch (e) { fail = errMsg(e); } }
    setWorking("");
    await reload();
    toast(t, fail ? `Failed: ${fail}` : action === "remind" ? "Reminder sent to the approver(s)." : "Approval request cancelled.", fail ? "err" : "ok");
  };
  // Setelah approved: bubuhkan gambar tanda tangan (dokumen yang di-approve tetap tersimpan sebagai arsip; versi bertanda tangan ditambahkan)
  const doStamp = async (list) => {
    const todo = list.filter(canStamp);
    if (!todo.length) { toast(t, "Nothing to sign: choose fully approved payments that are not signed yet.", "info"); return; }
    if (!hasEsign(cfg, "bast") && !hasEsign(cfg, "letter")) { toast(t, "Upload the signature images in ⚙ Settings first.", "err"); return; }
    if (!window.confirm(`Stamp the e-signature on ${todo.length} approved payment(s)? A signed copy is added; the approved original is kept.`)) return;
    setWorking("Stamping e-signature…");
    let ok = 0, fail = 0;
    try {
      const lh = await loadLetterhead();
      for (const g of todo) {
        try {
          const { bast, letter } = g.meta.doc;
          for (const [docType, build, name] of [["bast", () => buildBastPdf(bast, cfg, lh), bastFileName(bast)], ["surat_pemberitahuan", () => buildLetterPdf(letter, cfg, lh), letterFileName(letter)]]) {
            const r = await uploadSlot({ files: [new File([await build()], name, { type: "application/pdf" })], partnerName: g.partner, refId: g.pid, docType, segment: SEGMENT, replace: false });
            if (r.errors.length) throw new Error(r.errors[0]?.message || "upload failed");
          }
          const { _path, _err, ...rest } = g.meta;
          await savePaymentMeta(SEGMENT, { ...rest, esign: { bast: hasEsign(cfg, "bast"), letter: hasEsign(cfg, "letter") }, signed_after_approval_at: new Date().toISOString() });
          ok++;
        } catch { fail++; }
      }
    } catch (e) { toast(t, errMsg(e), "err"); }
    setWorking("");
    await reload();
    toast(t, `E-signature stamped on ${ok} payment(s)${fail ? `, failed ${fail}` : ""}.`, fail ? "err" : "ok");
  };
  const apprCell = (g) => {
    if (!g.ap.overall) return <span style={{ color: t.muted2 || t.muted, fontSize: 11 }}>{g.meta.sign_mode === "approval" ? "Not requested" : "—"}</span>;
    const title = APPR_TYPES.map(([dt, , l]) => `${l}: ${g.ap.st[dt].s || "not requested"}${g.ap.st[dt].a?.approver_email ? ` (${g.ap.st[dt].a.approver_email})` : ""}`).join("\n");
    const mixed = APPR_TYPES.some(([dt]) => g.ap.st[dt].s !== g.ap.overall);
    return (
      <span title={title} style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
        <ApprovalBadge status={g.ap.overall} t={t} />
        {mixed && <span style={{ fontSize: 10, color: t.muted }}>{APPR_TYPES.map(([dt, , l]) => `${l === "BAST" ? "BAST" : "Letter"} ${g.ap.st[dt].s || "—"}`).join(" · ")}</span>}
      </span>
    );
  };

  return (
    <div>
      <div style={{ padding: "12px 20px", borderBottom: `1px solid ${t.line}`, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", background: t.surf2 }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 340 }}>
          <span aria-hidden="true" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: t.muted, fontSize: 13 }}>⌕</span>
          <input className="ppd-f" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Payment ID or partner…" aria-label="Search Payment ID or partner"
            style={{ ...S.inp, padding: "7px 10px 7px 28px", borderRadius: 10 }} />
        </div>
        <select className="ppd-f" aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ ...S.inp, width: "auto", borderRadius: 9 }}>
          <option value="all">All periods</option>
          {periods.map((p) => <option key={p} value={p}>{parsePeriod(p)?.label || p}</option>)}
        </select>
        <select className="ppd-f" aria-label="Approval status" value={apprFilter} onChange={(e) => setApprFilter(e.target.value)} style={{ ...S.inp, width: "auto", borderRadius: 9 }}>
          <option value="all">All approval states</option><option value="none">Not requested</option>
          <option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
        </select>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {working && <span style={{ fontFamily: MONO, fontSize: 11, color: t.muted }}>{working}</span>}
          <button className="ppd-f ppd-act-o" style={btnStyle(t, "outline", !selected.length || !!working || !apprAvailable, true)} disabled={!selected.length || !!working || !apprAvailable} onClick={() => doRequest(selected)}
            title={apprAvailable ? "Send the selected BAST & Letters to the approvers in ⚙ Settings" : APPR_MISSING}>✉ Request approval ({selected.filter(canRequest).length})</button>
          {selected.some(canStamp) && <button className="ppd-f ppd-act-o" style={btnStyle(t, "outline", !!working, true)} disabled={!!working} onClick={() => doStamp(selected)}>✍ Stamp e-signature ({selected.filter(canStamp).length})</button>}
          <button className="ppd-f ppd-act" style={btnStyle(t, "primary", !selected.length || zipping, true)} disabled={!selected.length || zipping} onClick={() => zipSelected(selected)}><IcoDownload /> {zipping ? "Preparing…" : `Download selected (${selected.length})`}</button>
        </div>
      </div>
      <input ref={signedInRef} type="file" accept=".pdf,application/pdf" hidden onChange={onSignedFile} />
      {!apprAvailable && <div role="note" style={{ margin: "10px 20px 0", fontSize: 12, padding: "8px 12px", borderRadius: 10, color: t.warnDark || "#8a6a00", background: t.warnBg, border: `1px solid ${t.warnBd}` }}>{APPR_MISSING}</div>}
      {(err || indexErr) && <div role="alert" style={{ margin: "10px 20px", fontSize: 12, padding: "8px 12px", borderRadius: 10, color: t.bad, background: t.badBg, border: `1px solid ${t.badBd}` }}>Unable to load history: {err || indexErr}</div>}
      <div style={{ overflow: "auto", maxHeight: "68vh" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 980 }}>
          <thead><tr>
            <th style={{ ...S.th, width: 34, textAlign: "center" }}><input type="checkbox" className="ppd-f" aria-label="Select all shown" checked={shown.length > 0 && shown.every((g) => sel.has(g.pid))} onChange={(e) => setSel(e.target.checked ? new Set(shown.map((g) => g.pid)) : new Set())} /></th>
            <th style={S.th}>Payment ID</th><th style={S.th}>Partner</th><th style={S.th}>Type</th><th style={S.th}>Period</th>
            <th style={{ ...S.th, textAlign: "right" }}>Total transfer</th><th style={S.th}>Documents</th><th style={S.th} title="Invoice, BAST, Notification Letter and Faktur Pajak uploaded for this Payment ID">Partner docs</th><th style={S.th}>Approval</th><th style={S.th}>Saved</th><th style={{ ...S.th, textAlign: "right" }}><span className="ppd-sr">Actions</span></th>
          </tr></thead>
          <tbody>
            {rowsRaw == null
              ? Array.from({ length: 4 }).map((_, i) => <tr key={i}>{Array.from({ length: 11 }).map((__, j) => <td key={j} style={S.td}><Skel t={t} /></td>)}</tr>)
              : !shown.length
                ? <tr><td colSpan={11} style={{ padding: "36px 16px", textAlign: "center", color: t.muted }}>
                    <div style={{ fontWeight: 700, color: t.ink, fontSize: 13.5 }}>{groups.length ? "No payments match the search or filters" : "No partner letters yet"}</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>{groups.length ? "Change the search, period or approval filter." : "Use “New batch” to generate e-signed BAST & Notification Letters from the Excel."}</div>
                  </td></tr>
                : shown.map((g, i) => {
                  const signed = (g.meta.esign && (g.meta.esign.bast || g.meta.esign.letter)) || [...g.files.bast, ...g.files.surat_pemberitahuan].some((d) => /_signed-spm/.test(d.file_name || ""));
                  const mid = { ...S.td, verticalAlign: "middle" };
                  return (
                    <tr key={g.pid} style={{ background: sel.has(g.pid) ? t.goodBg : i % 2 ? t.rowStripe : "transparent" }}>
                      <td style={{ ...mid, textAlign: "center" }}><input type="checkbox" className="ppd-f" aria-label={`Select ${g.pid}`} checked={sel.has(g.pid)} onChange={() => toggle(g.pid)} /></td>
                      <td style={{ ...mid, fontFamily: MONO, fontWeight: 700, color: t.ink, whiteSpace: "nowrap" }}>{g.pid}</td>
                      <td style={{ ...mid, fontWeight: 600, color: t.ink }}>{g.partner}</td>
                      <td style={mid}><span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, padding: "1px 6px", borderRadius: 6, background: t.surf3 }}>{g.type}</span></td>
                      <td style={{ ...mid, whiteSpace: "nowrap" }}>{g.period}</td>
                      <td style={{ ...mid, textAlign: "right", fontFamily: MONO, fontWeight: 700, whiteSpace: "nowrap" }}>{g.total != null ? rupiah(g.total) : <span style={{ color: t.muted2 || t.muted }}>—</span>}</td>
                      <td style={{ ...mid, whiteSpace: "nowrap" }}>
                        {docsOf(g).map((d) => <button key={d.id} className="ppd-f ppd-act-o" style={{ ...btnStyle(t, "outline", false, true), marginRight: 4 }} onClick={() => openDoc(d)} title={`Open ${d.file_name}`}><IcoOpen /> {d._label}</button>)}
                        {signed ? <Chip color={t.goodDark || TEAL_D} bg={t.goodBg} bd={t.goodBd}>✍ Signed</Chip> : g.meta.esign ? <Chip color={t.muted} bg={t.surf2} bd={t.line2}>Unsigned</Chip> : null}
                      </td>
                      <td style={{ ...mid, whiteSpace: "nowrap" }}>{(() => {
                        const stat = docs?.byRef?.[statKey(SEGMENT, g.partner, g.pid)];
                        const n = DOC_TYPES.filter((d) => stat?.types?.[d.key]?.n > 0).length;
                        const miss = DOC_TYPES.filter((d) => !(stat?.types?.[d.key]?.n > 0)).map((d) => d.short);
                        return <span title={miss.length ? `Missing: ${miss.join(", ")}` : "All 4 documents uploaded"} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: n === DOC_TYPES.length ? (t.goodDark || TEAL_D) : n ? (t.warnDark || "#8a6a00") : t.muted }}>
                          {n}/{DOC_TYPES.length}{miss.length ? <span style={{ fontWeight: 400, color: t.muted }}> · {miss.join(" ")}</span> : " ✓"}
                        </span>;
                      })()}</td>
                      <td style={mid}>{apprCell(g)}</td>
                      <td style={{ ...mid, fontFamily: MONO, fontSize: 11, whiteSpace: "nowrap" }}>{fmtDT(g.lastAt)}</td>
                      <td style={{ ...mid, textAlign: "right" }}><RowMenu t={t} label={`More actions for ${g.pid}`} items={[
                        { label: "Download PDFs (ZIP)", onClick: () => zipSelected([g]) },
                        ...(apprAvailable && canRequest(g) ? [{ label: g.ap.overall ? "Request approval again" : "Request approval", onClick: () => doRequest([g]), disabled: !!working }] : []),
                        ...(g.ap.overall === "pending" ? [{ label: "Remind approver", onClick: () => apprAction("remind", g), disabled: !!working }, { label: "Cancel request", onClick: () => apprAction("cancel", g), disabled: !!working }] : []),
                        ...(canStamp(g) ? [{ label: "Stamp e-signature", onClick: () => doStamp([g]), disabled: !!working }] : []),
                        ...(canWrite ? [{ label: "⬆ Upload signed BAST (PDF)", onClick: () => askSigned(g, "bast"), disabled: !!working }, { label: "⬆ Upload signed Letter (PDF)", onClick: () => askSigned(g, "surat_pemberitahuan"), disabled: !!working }] : []),
                      ]} /></td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "10px 20px", borderTop: `1px solid ${t.line}`, fontFamily: MONO, fontSize: 11, color: t.muted, background: t.surf2, borderRadius: "0 0 18px 18px" }}>
        {shown.length} payment(s) · total {rupiah(sumTotal)}
      </div>
    </div>
  );
}

// ── Bulk upload BAST & Surat yang sudah approved / ditandatangani (SPM) ──────
// Cocokkan tiap PDF ke Payment ID: (a) Payment ID di nama file → (b) "Ref: PAY-…" di teks PDF →
// (c) nama partner + MPC/MP3 (nama file / teks PDF) di antara pembayaran periode terpilih.
// Jenis dokumen dari nama file (BAST / SURAT / LETTER / SP) atau teks ("BERITA ACARA SERAH TERIMA" vs "Surat Pemberitahuan").
// Payment ID yang belum ada bisa dibuat dari Excel Source Data SMS (tanpa generate PDF).
const PAY_IN_TEXT = /PAY-\d{6}-[A-Z0-9]+-[A-Z0-9]+-\d{2}/;
const alnumUp = (x) => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
async function pdfText(bytes, maxPages = 3) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  try {
    let out = "";
    for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
      const tc = await (await doc.getPage(i)).getTextContent();
      out += tc.items.map((it) => it.str).join(" ") + "\n";
    }
    return out;
  } finally { doc.destroy(); }
}
const kindFrom = (name, text) => {
  const n = String(name).toUpperCase();
  if (/BAST|BERITA[ _-]?ACARA/.test(n)) return "bast";
  if (/SURAT|LETTER|PEMBERITAHUAN|(^|[^A-Z])SP([^A-Z]|$)/.test(n)) return "surat_pemberitahuan";
  const tx = String(text || "").toUpperCase();
  if (tx.includes("BERITA ACARA SERAH TERIMA")) return "bast";
  if (/SURAT PEMBERITAHUAN|KETENTUAN KLAIM|KEPADA YTH/.test(tx)) return "surat_pemberitahuan";
  return "";
};
const typeFrom = (s) => { const m = String(s || "").toUpperCase().match(/(^|[^A-Z0-9])(MPC|MP3)([^A-Z0-9]|$)/); return m ? m[2] : ""; };
// Nama file manual, mis. "BAST ULTIMA MULTIMEDIA JAYA, PT MPC.pdf", "Surat Pemberitahuan GLOBAL BIMA UTAMA PT_MPC.pdf"
// → { kind, partner, type }. Toleran: huruf besar/kecil, koma opsional, "PT" + spasi/"_", spasi berlebih.
export function parseSignedFileName(name) {
  const base = String(name || "").replace(/^.*[\\/]/, "").replace(/\.pdf$/i, "").replace(/\s+/g, " ").trim();
  const m = base.match(/^(BAST|BERITA ACARA(?: SERAH TERIMA)?|SURAT PEMBERITAHUAN(?: DF)?|SURAT|LETTER|SP)[\s_-]+(.+?)[\s_-]*(MPC|MP3)\s*$/i);
  if (!m) return null;
  const kind = /^(BAST|BERITA)/i.test(m[1]) ? "bast" : "surat_pemberitahuan";
  const partner = m[2].replace(/[\s,._-]+$/g, "").replace(/[\s,_]+(PT|CV|TBK)\.?$/i, "").trim();
  return { kind, partner, type: m[3].toUpperCase() };
}
// Kemiripan nama (fallback fuzzy): Dice coefficient atas bigram huruf
const similarity = (a, b) => {
  const bg = (x) => { const s2 = alnumUp(x); const out = new Map(); for (let i = 0; i < s2.length - 1; i++) { const k = s2.slice(i, i + 2); out.set(k, (out.get(k) || 0) + 1); } return out; };
  const A = bg(a), B = bg(b);
  let inter = 0, na = 0, nb = 0;
  A.forEach((v, k) => { na += v; inter += Math.min(v, B.get(k) || 0); });
  B.forEach((v) => { nb += v; });
  return na + nb ? (2 * inter) / (na + nb) : 0;
};
const slug = (x) => String(x || "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function BulkSignedUpload({ meta, known, index, onSaved, onDone, doneLabel = "View History →", partnerNames = [], t }) {
  const S = styles(t);
  const [period, setPeriod] = useState(meta.period);
  const [existing, setExisting] = useState(null);   // [{ pid, partner, type, ym, total }]
  const [excel, setExcel] = useState(null);         // { name, rows: [{ pid, partner, type, ym, total, isNew }] }
  // Payment ID baru dari nama file (partner + MPC/MP3) — belum tersimpan sampai "Upload N files"
  const [proposals, setProposals] = useState(() => new Map());   // `${partnerKey}|${type}` → { pid, partner, type, ym, total: null, isNew, fromName }
  const [items, setItems] = useState([]);           // { id, file, kind, pid, how, cands, include, res, msg }
  const [reading, setReading] = useState("");
  const [phase, setPhase] = useState("pick");       // pick | review | uploading | done
  const [prog, setProg] = useState({ i: 0, total: 0 });
  const fileRef = useRef(null);
  const xlsRef = useRef(null);
  const per = parsePeriod(period);

  // Pembayaran yang sudah ada (semua periode) — partner & type dari Payment ID
  useEffect(() => {
    let alive = true;
    fetchDraftDocs(SEGMENT).then((d) => {
      const m = new Map();
      d.filter((x) => isPaymentRef(x.ref_id)).forEach((x) => {
        if (m.has(x.ref_id)) return;
        const info = parsePaymentRef(x.ref_id);
        m.set(x.ref_id, { pid: x.ref_id, partner: x.partner_name, type: info.type, ym: info.ym, total: null });
      });
      if (alive) setExisting([...m.values()]);
    }).catch(() => { if (alive) setExisting([]); });
    return () => { alive = false; };
  }, [index]);

  // Kandidat periode terpilih = pembayaran yang ada + dari Excel (yang baru)
  const pool = useMemo(() => {
    const out = (existing || []).filter((x) => !per || x.ym === per.ym);
    (excel?.rows || []).filter((r) => r.isNew).forEach((r) => out.push(r));
    return out;
  }, [existing, excel, per]);
  const poolById = useMemo(() => new Map([...(existing || []), ...(excel?.rows || []), ...proposals.values()].map((x) => [x.pid, x])), [existing, excel, proposals]);
  // Daftar partner aplikasi (Payout data + pembayaran yang ada + Excel): partnerKey → nama resmi
  const directory = useMemo(() => {
    const m = new Map();
    [...partnerNames, ...(existing || []).map((x) => x.partner), ...(excel?.rows || []).map((x) => x.partner)].forEach((n) => { const k = partnerKey(n); if (k && !m.has(k)) m.set(k, n); });
    return m;
  }, [partnerNames, existing, excel]);
  const dirNames = useMemo(() => [...directory.values()].sort(), [directory]);
  // Payment ID usulan untuk partner + type (dipakai bersama BAST & Surat); props = Map kerja (bisa lokal saat membaca banyak file)
  const propose = (props, partnerName, type) => {
    const pk = partnerKey(partnerName);
    const key = `${pk}|${type}`;
    if (props.has(key)) return props.get(key);
    const own = new Map(known || []);
    [...(excel?.rows || []), ...props.values()].forEach((x) => own.set(x.pid, partnerKey(x.partner)));
    const pid = nextPaymentId({ partner: partnerName, ym: per.ym, type, known: own });
    const row = { pid, partner: partnerName, type, ym: per.ym, total: null, isNew: true, fromName: true };
    props.set(key, row);
    return row;
  };

  const loadExcel = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!per) { toast(t, "Choose the period first.", "err"); return; }
    setReading("Reading Excel…");
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      if ((await detectWorkbookFormat(bytes)) !== "sms") throw new Error("Use the Source Data SMS workbook (sheets BAST and LETTER).");
      const { pairs } = await parseSmsWorkbook(bytes);
      const codes = assignPartnerCodes(pairs.map((p) => p.partner));
      const own = new Map(known || []);
      const rows = pairs.map((p) => {
        const fin = finalizeSms(p, { per, docDate: null, deadline: null, letterNo: "-", recipientTitle: {}, fallbackSigner: {} });
        const pk = partnerKey(p.partner);
        // sudah ada pembayaran partner+type+periode ini → pakai Payment ID terbaru (versi approved dari surat yang di-generate)
        const ex = (existing || []).filter((x) => x.ym === per.ym && x.type === p.type && partnerKey(x.partner) === pk).sort((a, b) => b.pid.localeCompare(a.pid))[0];
        if (ex) return { ...ex, total: fin.letter.total, isNew: false };
        let pid = p.paymentId && isPaymentRef(p.paymentId) ? p.paymentId : "";
        if (!pid) {
          const code = codes.codes.get(pk) || partnerCode(p.partner);
          pid = paymentIdFor(per.ym, p.type, code, 1);
          if (own.get(pid) && own.get(pid) !== pk) pid = nextPaymentId({ partner: p.partner, ym: per.ym, type: p.type, known: own });
        }
        own.set(pid, pk);
        return { pid, partner: p.partner, type: p.type, ym: per.ym, total: fin.letter.total, isNew: true, emailsTo: p.emailsTo, emailsCc: p.emailsCc };
      });
      setExcel({ name: f.name, rows });
      // Excel menang: baris yang tadinya memakai Payment ID usulan dari nama file dipindah ke Payment ID Excel
      const byKey = new Map(rows.map((r) => [`${partnerKey(r.partner)}|${r.type}`, r]));
      const remap = new Map();
      proposals.forEach((pr, k) => { if (byKey.has(k)) remap.set(pr.pid, byKey.get(k).pid); });
      if (remap.size) {
        setItems((cur) => cur.map((x) => (remap.has(x.pid) ? { ...x, pid: remap.get(x.pid), how: "Excel (partner + type)" } : x)));
        setProposals((cur) => { const n = new Map(cur); [...n.keys()].forEach((k) => { if (byKey.has(k)) n.delete(k); }); return n; });
      }
      toast(t, `${rows.length} payment(s) from ${f.name}: ${rows.filter((r) => r.isNew).length} new, ${rows.filter((r) => !r.isNew).length} already exist.`);
    } catch (err) { toast(t, errMsg(err), "err"); }
    setReading("");
  };

  const match = (name, text) => {
    const nameUp = String(name).toUpperCase();
    const byName = nameUp.match(PAY_IN_TEXT)?.[0];
    if (byName) return poolById.has(byName) ? { pid: byName, how: "file name" } : { pid: "", how: "unknown Payment ID", cands: [], note: byName };
    const byText = String(text || "").toUpperCase().match(PAY_IN_TEXT)?.[0];
    if (byText && poolById.has(byText)) return { pid: byText, how: "Ref in PDF" };
    // (c) pola nama file manual: partner + type harus sama persis (setelah normalisasi) dengan data pembayaran
    const parsed = parseSignedFileName(name);
    if (parsed) {
      const pk = partnerKey(parsed.partner);
      const exact = pool.filter((x) => partnerKey(x.partner) === pk && x.type === parsed.type);
      if (exact.length === 1) return { pid: exact[0].pid, how: "file name (partner + type)", kind: parsed.kind };
      if (exact.length > 1) return { pid: "", how: "ambiguous", cands: exact.map((x) => x.pid), kind: parsed.kind };
    }
    const hay = alnumUp(name) + " " + alnumUp(text);
    const type = parsed?.type || typeFrom(name) || typeFrom(text);
    const hits = pool.filter((x) => { const k = alnumUp(partnerKey(x.partner)); return k.length >= 4 && hay.includes(k); });
    const best = hits.length ? Math.max(...hits.map((x) => alnumUp(partnerKey(x.partner)).length)) : 0;
    const top = hits.filter((x) => alnumUp(partnerKey(x.partner)).length === best && (!type || x.type === type));
    if (top.length === 1) return { pid: top[0].pid, how: type ? "partner + type" : "partner" };
    if (top.length > 1) return { pid: "", how: "ambiguous", cands: top.map((x) => x.pid) };
    // (e) fuzzy: nama partner paling mirip (type sama) — perlu konfirmasi manual
    if (parsed) {
      const scored = pool.filter((x) => x.type === parsed.type).map((x) => ({ x, sc: similarity(partnerKey(parsed.partner), partnerKey(x.partner)) })).sort((a, b) => b.sc - a.sc);
      if (scored[0] && scored[0].sc >= 0.75) return { pid: scored[0].x.pid, how: `fuzzy ${Math.round(scored[0].sc * 100)}% — please check`, cands: scored.slice(0, 3).map((y) => y.x.pid), fuzzy: true, kind: parsed.kind };
    }
    return { pid: "", how: "unmatched", cands: [] };
  };

  const addFiles = async (list) => {
    const pdfs = [];
    for (const f of list) {
      if (/\.zip$/i.test(f.name)) {
        const { default: JSZip } = await import("jszip");
        const zip = await JSZip.loadAsync(await f.arrayBuffer());
        for (const entry of Object.values(zip.files)) {
          if (entry.dir || !/\.pdf$/i.test(entry.name) || /(^|\/)(__MACOSX|\._)/.test(entry.name)) continue;
          pdfs.push(new File([await entry.async("uint8array")], entry.name.split("/").pop(), { type: "application/pdf" }));
        }
      } else if (fileKind(f.name, f.type) === "pdf") pdfs.push(f);
    }
    if (!pdfs.length) { toast(t, "No PDF files found.", "err"); return; }
    const out = [];
    const props = new Map(proposals);
    for (let i = 0; i < pdfs.length; i++) {
      const f = pdfs[i];
      setReading(`Reading ${i + 1}/${pdfs.length}: ${f.name}`);
      const bad = validateFile(f);
      let text = "";
      if (!bad) { try { text = await pdfText(new Uint8Array(await f.arrayBuffer())); } catch { text = ""; } }
      let m = bad ? { pid: "", how: "invalid", cands: [] } : match(f.name, text);
      const parsed = !bad && parseSignedFileName(f.name);
      let unknown = "";
      // Belum ada Payment ID untuk partner + type ini → usulkan Payment ID baru dari nama file (tanpa Excel)
      if (parsed && per && (!m.pid || m.fuzzy) && m.how !== "ambiguous") {
        const canon = directory.get(partnerKey(parsed.partner));
        if (canon) { const row = propose(props, canon, parsed.type); m = { pid: row.pid, how: "new from file name", kind: parsed.kind }; }
        else { unknown = parsed.partner; m = { ...m, pid: m.fuzzy ? m.pid : "", how: m.fuzzy ? m.how : "unknown partner" }; }
      }
      out.push({ id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`, file: f, kind: m.kind || (parsed && parsed.kind) || kindFrom(f.name, text), pid: m.pid, how: m.how, cands: m.cands || [], fuzzy: !!m.fuzzy, note: m.note || bad || "", include: !bad && !!m.pid && !m.fuzzy, res: null, unknown, ptype: parsed ? parsed.type : "" });
    }
    setProposals(props);
    setReading("");
    setItems((cur) => [...cur, ...out]);
    setPhase("review");
  };

  const rows = useMemo(() => {
    const cnt = new Map();
    items.forEach((x) => { if (x.include && x.pid && x.kind) cnt.set(`${x.pid}|${x.kind}`, (cnt.get(`${x.pid}|${x.kind}`) || 0) + 1); });
    return items.map((x) => {
      const dup = x.include && x.pid && x.kind && cnt.get(`${x.pid}|${x.kind}`) > 1;
      const isNewPid = !!poolById.get(x.pid)?.fromName;
      const st = x.res === "ok" ? "Uploaded" : x.res ? "Failed" : !x.pid ? (x.unknown ? "Unknown partner" : x.how === "ambiguous" ? "Ambiguous" : "Unmatched") : x.fuzzy && !x.include ? "Ambiguous" : !x.kind ? "Choose kind" : dup ? "Duplicate" : isNewPid ? "New Payment ID" : "Matched";
      return { ...x, dup, st };
    });
  }, [items, poolById]);
  const ready = rows.filter((x) => x.include && x.pid && x.kind && !x.dup && x.res !== "ok");
  const setItem = (id, patch) => setItems((cur) => cur.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const matchRate = items.length ? Math.round((items.filter((x) => x.pid && !x.fuzzy && x.how !== "manual" && x.how !== "partner chosen").length / items.length) * 100) : 0;
  // Partner tidak dikenal: SPM memilih partner resmi → Payment ID baru diusulkan untuk partner + type itu
  const pickPartner = (x, name) => {
    if (!name) return;
    const type = x.ptype || typeFrom(x.file.name);
    if (!type) { toast(t, "The type (MPC / MP3) is missing in the file name — choose a Payment ID instead.", "err"); return; }
    const props = new Map(proposals);
    const row = propose(props, name, type);
    setProposals(props);
    setItem(x.id, { pid: row.pid, how: "partner chosen", unknown: "", include: true });
  };
  // Salinan rapi untuk SPM: 1 folder per Payment ID, nama file sesuai Payment ID (file asli tidak diubah)
  const organizedZip = async () => {
    const list = rows.filter((x) => x.pid && x.kind && !x.dup && (x.include || x.res === "ok"));
    if (!list.length) { toast(t, "No matched files yet.", "info"); return; }
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    list.forEach((x) => {
      const pay = poolById.get(x.pid);
      zip.file(`${x.pid}/${x.kind === "bast" ? "BAST" : "SURAT"}_${x.pid}_${slug(partnerKey(pay?.partner || ""))}_${pay?.type || ""}.pdf`, x.file);
    });
    saveBlobAs(await zip.generateAsync({ type: "blob" }), `Signed_BAST_Letters_${per?.ym || "period"}_by_Payment_ID.zip`, "application/zip");
    toast(t, `ZIP with ${list.length} file(s) in ${new Set(list.map((x) => x.pid)).size} Payment ID folder(s) downloaded.`);
  };

  const upload = async (list) => {
    if (!list.length) return;
    if (!window.confirm(`Upload ${list.length} signed file(s)? Each becomes the current BAST / Notification Letter of its Payment ID; existing files are kept as an archive.`)) return;
    setPhase("uploading");
    setProg({ i: 0, total: list.length });
    // Payment ID baru dari Excel: simpan metadata dulu (sekali per Payment ID)
    const newPids = [...new Set(list.map((x) => x.pid))].map((pid) => poolById.get(pid)).filter((r) => r?.isNew && !known?.has(r.pid) && !index?.has(r.pid));
    for (const r of newPids) {
      try {
        await savePaymentMeta(SEGMENT, {
          payment_id: r.pid, partner: r.partner, type: r.type, period: parsePeriod(r.ym)?.label || "", period_ym: r.ym, total: r.total,
          email_to: r.emailsTo || [], email_cc: r.emailsCc || [], sign_mode: "upload", source: r.fromName ? "bulk-upload (file names)" : "bulk-upload (Excel)", esign: { bast: true, letter: true },
          saved_at: new Date().toISOString(), source_file: excel?.name || "",
        });
      } catch { /* metadata opsional — file tetap di-upload */ }
    }
    let ok = 0, fail = 0;
    for (let i = 0; i < list.length; i++) {
      const x = list[i];
      const pay = poolById.get(x.pid);
      try {
        const r = await uploadSlot({ files: [new File([x.file], spmSignedName(x.kind, x.pid, pay.partner), { type: "application/pdf" })], partnerName: pay.partner, refId: x.pid, docType: x.kind, segment: SEGMENT, replace: false });
        if (r.errors.length) throw new Error(r.errors[0].message);
        setItem(x.id, { res: "ok", msg: "" }); ok++;
      } catch (e) { setItem(x.id, { res: "err", msg: errMsg(e) }); fail++; }
      setProg({ i: i + 1, total: list.length });
    }
    setPhase("done");
    await onSaved?.();
    toast(t, `Uploaded ${ok} file(s)${fail ? `, failed ${fail}` : ""}.`, fail ? "err" : "ok");
  };

  const allPids = useMemo(() => [...poolById.values()].filter((x) => !per || x.ym === per.ym).sort((a, b) => a.partner.localeCompare(b.partner) || a.type.localeCompare(b.type)), [poolById, per]);
  const stColor = (st) => st === "Matched" || st === "Uploaded" || st === "New Payment ID" ? (t.goodDark || TEAL_D) : st === "Failed" || st === "Unmatched" || st === "Unknown partner" ? t.bad : t.warnDark || "#8a6a00";
  const busy = phase === "uploading" || !!reading;
  const failed = rows.filter((x) => x.res === "err");

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 12.5, color: t.muted, lineHeight: 1.5, maxWidth: 900 }}>
        Upload the approved / signed BAST and Notification Letters for many partners at once (PDFs or a ZIP). Each file is matched to its Payment ID by file name, by the “Ref: PAY-…” footer, or by partner name + MPC/MP3. If a partner + type has no Payment ID yet, a new one is proposed from the file name (no Excel needed). Nothing is saved until you press <b>Upload</b>. Partners then only add their Invoice and Faktur Pajak.
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11.5, color: t.muted }}>
          Period
          <input className="ppd-f" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} disabled={busy || items.length > 0} style={{ ...S.inp, width: 180 }} />
        </label>
        <input ref={xlsRef} type="file" accept=".xlsx" hidden onChange={loadExcel} />
        <button className="ppd-f ppd-act-o" style={btnStyle(t, "outline", busy)} disabled={busy} onClick={() => xlsRef.current?.click()}
          title="Optional: create the Payment IDs (and totals) for this period from the Source Data SMS Excel, without generating PDFs">
          {excel ? `✓ ${excel.rows.length} payments from Excel` : "Create Payment IDs from Excel (optional)"}
        </button>
        <span style={{ fontSize: 11.5, color: t.muted }}>{existing == null ? "Loading payments…" : `${pool.length} payment(s) available for ${per?.label || "this period"}${proposals.size ? ` · ${proposals.size} new from file names` : ""}`}</span>
        <input ref={fileRef} type="file" accept=".pdf,.zip,application/pdf,application/zip" multiple hidden onChange={(e) => { const l = Array.from(e.target.files || []); e.target.value = ""; addFiles(l); }} />
        <span title={!per ? "Choose the period first." : existing == null || known == null ? "Loading existing payments…" : undefined} style={{ marginLeft: "auto", display: "inline-flex" }}>
          <button className="ppd-f ppd-act" style={btnStyle(t, "primary", busy || !per || existing == null || known == null)} disabled={busy || !per || existing == null || known == null} onClick={() => fileRef.current?.click()}>⬆ Add PDFs or ZIP</button>
        </span>
      </div>
      {reading && <div aria-live="polite" style={{ fontFamily: MONO, fontSize: 11, color: t.muted }}>{reading}</div>}

      {!items.length ? (
        <div role="button" tabIndex={0} className="ppd-f" onClick={() => !busy && per && existing != null && known != null && fileRef.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" && existing != null && known != null) fileRef.current?.click(); }}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (!busy && per && existing != null && known != null) addFiles(Array.from(e.dataTransfer?.files || [])); }}
          style={{ border: `2px dashed ${t.line2}`, borderRadius: 16, padding: "36px 16px", textAlign: "center", background: t.surf2, color: t.muted, fontSize: 12.5, cursor: "pointer" }}>
          <div style={{ color: TEAL, display: "inline-flex" }}><IcoUp /></div>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.ink, marginTop: 4 }}>Drop the signed BAST and Letter PDFs (or a ZIP) here</div>
          PDF only, max {MAX_FILE_BYTES / 1048576} MB per file.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: t.muted }}>
            <span><b style={{ color: t.ink }}>{rows.length}</b> file(s)</span>
            {["Matched", "New Payment ID", "Ambiguous", "Unknown partner", "Unmatched", "Duplicate", "Choose kind", "Uploaded", "Failed"].map((k) => { const n = rows.filter((x) => x.st === k).length; return n ? <span key={k} style={{ color: stColor(k), fontWeight: 600 }}>{k}: {n}</span> : null; })}
            <span>Auto-match rate: <b style={{ color: t.ink }}>{matchRate}%</b></span>
          </div>
          <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, overflow: "auto", maxHeight: "56vh" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 980 }}>
              <thead><tr>
                <th style={{ ...S.th, width: 30 }}><span className="ppd-sr">Include</span></th>
                <th style={S.th}>File</th><th style={S.th}>Kind</th><th style={S.th}>Payment ID · partner</th><th style={S.th}>Matched by</th><th style={S.th}>Status</th>
              </tr></thead>
              <tbody>
                {rows.map((x) => {
                  const pay = poolById.get(x.pid);
                  const opts = x.cands.length ? allPids.filter((p) => x.cands.includes(p.pid)).concat(allPids.filter((p) => !x.cands.includes(p.pid))) : allPids;
                  return (
                    <tr key={x.id} style={{ background: x.res === "ok" ? t.goodBg : x.res === "err" || x.st === "Unmatched" || x.st === "Unknown partner" ? t.badBg : x.st !== "Matched" && x.st !== "New Payment ID" ? t.warnBg : "transparent" }}>
                      <td style={{ ...S.td, textAlign: "center" }}><input type="checkbox" className="ppd-f" aria-label={`Include ${x.file.name}`} checked={x.include} disabled={busy || x.res === "ok" || !x.pid} onChange={(e) => setItem(x.id, { include: e.target.checked })} /></td>
                      <td style={{ ...S.td, maxWidth: 260 }}><div title={x.file.name} style={{ fontWeight: 600, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.file.name}</div><div style={{ fontFamily: MONO, fontSize: 10, color: t.muted }}>{fmtSizeLocal(x.file.size)}</div></td>
                      <td style={S.td}>
                        <select className="ppd-f" value={x.kind} disabled={busy || x.res === "ok"} onChange={(e) => setItem(x.id, { kind: e.target.value })} style={{ ...S.inp, width: 130, fontSize: 11.5, padding: "4px 6px", borderColor: x.kind ? t.line2 : t.warn }}>
                          <option value="">— kind —</option><option value="bast">BAST</option><option value="surat_pemberitahuan">Notification Letter</option>
                        </select>
                      </td>
                      <td style={{ ...S.td, minWidth: 300 }}>
                        <select className="ppd-f" value={x.pid} disabled={busy || x.res === "ok"} onChange={(e) => setItem(x.id, { pid: e.target.value, how: e.target.value ? "manual" : "unmatched", include: !!e.target.value })}
                          style={{ ...S.inp, fontFamily: MONO, fontSize: 11, padding: "4px 6px", borderColor: x.pid ? t.line2 : t.warn }}>
                          <option value="">— choose Payment ID —</option>
                          {opts.map((p) => <option key={p.pid} value={p.pid}>{p.pid} · {p.partner}{p.isNew ? " (new)" : ""}</option>)}
                        </select>
                        {pay && <div style={{ fontSize: 10.5, color: t.muted, marginTop: 2 }}>{pay.partner} · {pay.type} · {pay.total != null ? rupiah(pay.total) : "total —"}{pay.isNew && !known?.has(pay.pid) ? (pay.fromName ? " · new Payment ID (from file name)" : " · new from Excel") : ""}</div>}
                        {x.unknown && !x.pid && (
                          <div style={{ marginTop: 4 }}>
                            <div style={{ fontSize: 10.5, color: t.bad, marginBottom: 2 }}>“{x.unknown}” is not in the partner list — choose the partner:</div>
                            <select className="ppd-f" value="" disabled={busy} onChange={(e) => pickPartner(x, e.target.value)} style={{ ...S.inp, fontSize: 11, padding: "4px 6px", borderColor: t.warn }}>
                              <option value="">— choose partner —</option>
                              {dirNames.map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </div>
                        )}
                      </td>
                      <td style={{ ...S.td, fontSize: 11, color: t.muted }}>{x.how}{x.note ? <div style={{ color: t.bad }}>{x.note}</div> : null}</td>
                      <td style={{ ...S.td, fontSize: 11.5, fontWeight: 700, color: stColor(x.st) }}>{x.st}{x.msg ? <div style={{ fontWeight: 400 }}>{x.msg}</div> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {phase === "uploading" && <IndeterminateBar t={t} pct={Math.round((prog.i / Math.max(1, prog.total)) * 100)} />}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {phase === "uploading" && <span style={{ fontFamily: MONO, fontSize: 11, color: t.muted }}>Uploading {prog.i}/{prog.total}…</span>}
            {phase === "done" && <span style={{ fontSize: 12.5, color: t.ink2 }}>Done: {rows.filter((x) => x.res === "ok").length} uploaded{failed.length ? `, ${failed.length} failed` : ""}.</span>}
            <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
              <button className="ppd-f" style={btnStyle(t, "ghost", busy)} disabled={busy} onClick={() => { setItems([]); setProposals(new Map()); setPhase("pick"); }}>Clear</button>
              <button className="ppd-f ppd-act-o" style={btnStyle(t, "outline", busy)} disabled={busy} onClick={organizedZip}
                title="Download a renamed copy: one folder per Payment ID (nothing is uploaded)"><IcoDownload /> Download organized ZIP</button>
              {failed.length > 0 && phase !== "uploading" && <button className="ppd-f ppd-act-o" style={btnStyle(t, "outline")} onClick={() => upload(failed.map((x) => ({ ...x, res: null })))}>↻ Retry failed ({failed.length})</button>}
              {phase === "done" && <button className="ppd-f ppd-act-o" style={btnStyle(t, "outline")} onClick={onDone}>{doneLabel}</button>}
              <button className="ppd-f ppd-act" style={btnStyle(t, "primary", busy || !ready.length)} disabled={busy || !ready.length} onClick={() => upload(ready)}>⬆ Upload {ready.length} file(s)</button>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
const fmtSizeLocal = (b) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

function Modal({ title, kicker, onClose, children, width = 760, t, labelId }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose?.(); } }}
      className="ppd-anim" style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12, animation: "ppd_fade .15s ease-out" }}>
      <div role="dialog" aria-modal="true" aria-labelledby={labelId}
        style={{ width: `min(${width}px, 100%)`, maxHeight: "92vh", display: "flex", flexDirection: "column", background: t.surf, color: t.ink, borderRadius: 18, border: `1px solid ${t.line}`, boxShadow: t.shadow2, overflow: "hidden", textAlign: "left" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "flex-start", gap: 12, background: t.surf2 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {kicker && <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: MAGENTA, fontWeight: 700 }}>{kicker}</div>}
            <div id={labelId} style={{ fontSize: 16.5, fontWeight: 800, marginTop: 2 }}>{title}</div>
          </div>
          {onClose && <button className="ppd-f" onClick={onClose} aria-label="Close (Esc)" style={{ ...btnStyle(t, "ghost", false, true), fontSize: 20, lineHeight: 1, padding: "2px 8px", color: t.muted }}>×</button>}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 18 }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// Dipakai juga dari Document Upload & Merge (By Payment ID → Bulk Upload): komponen yang sama dalam modal
export function BulkSignedModal({ docs, partnerNames = [], onClose, t }) {
  useDocsCss();
  const [known, setKnown] = useState(null);
  const [index, setIndex] = useState(null);
  const meta = useMemo(() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return { period: d.toISOString().slice(0, 7) }; }, []);
  const load = () => Promise.all([
    fetchLettersIndex(SEGMENT).catch(() => new Map()),
    fetchDraftDocs(SEGMENT).then((d) => new Map(d.filter((x) => isPaymentRef(x.ref_id)).map((x) => [x.ref_id, x.partner_key])), () => new Map()),
  ]);
  useEffect(() => {
    let alive = true;
    load().then(([i, k]) => { if (alive) { setIndex(i); setKnown(k); } });
    return () => { alive = false; };
  }, []); // muat sekali saat modal dibuka
  const reload = async () => { const [i, k] = await load(); setIndex(i); setKnown(k); docs?.refresh?.(); };
  return (
    <Modal t={t} labelId="ppl-bulk-title" kicker="SPM · Bulk upload" title="Bulk upload signed BAST & Notification Letters" onClose={onClose} width={1240}>
      <div style={{ margin: -18 }}>
        <BulkSignedUpload meta={meta} known={known} index={index} onSaved={reload} onDone={onClose} doneLabel="Done — view Payment IDs" partnerNames={partnerNames} t={t} />
      </div>
    </Modal>
  );
}

// ── Pembayaran "upload only": SPM meng-upload BAST & Surat yang sudah ditandatangani (tanpa generate) ──
function UploadOnlyPayment({ meta, partnerNames = [], known, onSaved, onDone, t }) {
  const S = styles(t);
  const [f, setF] = useState(() => ({ partner: "", type: "MPC", period: meta.period, total: "", pid: "" }));
  const [bast, setBast] = useState(null);
  const [letter, setLetter] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);   // { pid, partner }
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const per = parsePeriod(f.period);
  const pk = partnerKey(f.partner);
  const manual = f.pid.trim().toUpperCase();
  const autoPid = f.partner.trim() && per ? nextPaymentId({ partner: f.partner, ym: per.ym, type: f.type, known: known || new Map() }) : "";
  const pid = manual || autoPid;
  const owner = known?.get(pid) || "";
  const errs = [];
  if (known == null) errs.push("Loading existing payments…");
  if (!f.partner.trim()) errs.push("Choose the partner.");
  if (!per) errs.push("Choose the period.");
  if (manual && !isPaymentRef(manual)) errs.push("PAYMENT_ID must follow PAY-YYYYMM-TYPE-CODE-NN.");
  if (pid && owner && owner !== pk) errs.push(`${pid} already belongs to ${owner.replace(/_/g, " ")}.`);
  if (f.total && !(Number(String(f.total).replace(/[^0-9.]/g, "")) > 0)) errs.push("Total must be a number.");
  if (!bast || !letter) errs.push("Attach both the signed BAST and the signed Notification Letter (PDF).");
  const pickPdf = (setter) => (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (fileKind(file.name, file.type) !== "pdf") { toast(t, "Please choose a PDF file.", "err"); return; }
    const bad = validateFile(file);
    if (bad) { toast(t, bad, "err"); return; }
    setter(file);
  };
  const save = async () => {
    if (errs.length) { toast(t, errs[0], "err"); return; }
    if (owner === pk && !window.confirm(`${pid} already exists for this partner. Add the signed BAST and Letter as the latest versions?`)) return;
    setBusy(true);
    try {
      for (const [docType, file] of [["bast", bast], ["surat_pemberitahuan", letter]]) {
        const r = await uploadSlot({ files: [new File([file], spmSignedName(docType, pid, f.partner.trim()), { type: "application/pdf" })], partnerName: f.partner.trim(), refId: pid, docType, segment: SEGMENT, replace: false });
        if (r.errors.length) throw new Error(r.errors[0].message);
      }
      const total = f.total ? Number(String(f.total).replace(/[^0-9.]/g, "")) : null;
      await savePaymentMeta(SEGMENT, {
        payment_id: pid, partner: f.partner.trim(), type: f.type, period: per.label, period_ym: per.ym, total,
        sign_mode: "upload", source: "upload-only", esign: { bast: true, letter: true }, saved_at: new Date().toISOString(),
        source_file: `${bast.name} + ${letter.name}`,
      });
      await onSaved?.();
      setDone({ pid, partner: f.partner.trim() });
      toast(t, `${pid} saved — the partner can now see it under “My payments”.`);
    } catch (e) { toast(t, `Save failed: ${errMsg(e)}`, "err"); }
    setBusy(false);
  };
  const reset = () => { setF((x) => ({ ...x, partner: "", total: "", pid: "" })); setBast(null); setLetter(null); setDone(null); };
  const fileBox = (label, file, setter, id) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: t.muted }}>
      {label}
      <span style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, border: `1.5px dashed ${file ? t.goodBd : t.line2}`, background: file ? t.goodBg : t.surf2 }}>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: file ? t.ink : t.muted, fontWeight: file ? 600 : 400 }}>{file ? file.name : `PDF, max ${MAX_FILE_BYTES / 1048576} MB`}</span>
        <input id={id} type="file" accept=".pdf,application/pdf" hidden onChange={pickPdf(setter)} disabled={busy} />
        <button type="button" className="ppd-f ppd-act-o" style={btnStyle(t, "outline", busy, true)} disabled={busy} onClick={() => document.getElementById(id)?.click()}>{file ? "Replace" : "Choose PDF"}</button>
      </span>
    </label>
  );
  if (done) return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <div role="status" style={{ fontSize: 13, padding: "10px 14px", borderRadius: 12, color: t.ink2, background: t.goodBg, border: `1px solid ${t.goodBd}` }}>
        ✓ <b style={{ fontFamily: MONO }}>{done.pid}</b> saved for <b>{done.partner}</b>. The partner sees it under “My payments” and uploads the Invoice and Faktur Pajak.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="ppd-f" style={btnStyle(t, "ghost")} onClick={reset}>Add another</button>
        <button className="ppd-f ppd-act" style={btnStyle(t, "primary")} onClick={onDone}>View History →</button>
      </div>
    </div>
  );
  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 12.5, color: t.muted, lineHeight: 1.5, maxWidth: 820 }}>
        Use this when the BAST and Notification Letter were already signed or approved outside SandraHub. Upload the signed PDFs; a Payment ID is created with the same rules as generated letters.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, alignItems: "end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11.5, color: t.muted, gridColumn: "span 2" }}>
          Partner
          <input className="ppd-f" list="ppl-partners" value={f.partner} onChange={(e) => set("partner", e.target.value)} disabled={busy} placeholder="e.g. ULTIMA MULTIMEDIA JAYA, PT" style={S.inp} />
          <datalist id="ppl-partners">{partnerNames.map((n) => <option key={n} value={n} />)}</datalist>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11.5, color: t.muted }}>
          Type
          <select className="ppd-f" value={f.type} onChange={(e) => set("type", e.target.value)} disabled={busy} style={S.inp}><option>MPC</option><option>MP3</option></select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11.5, color: t.muted }}>
          Period
          <input className="ppd-f" type="month" value={f.period} onChange={(e) => set("period", e.target.value)} disabled={busy} style={S.inp} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11.5, color: t.muted }}>
          Total transfer (optional)
          <input className="ppd-f" inputMode="numeric" value={f.total} onChange={(e) => set("total", e.target.value)} disabled={busy} placeholder="645944472" style={{ ...S.inp, fontFamily: MONO }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11.5, color: t.muted }}>
          PAYMENT_ID (optional)
          <input className="ppd-f" value={f.pid} onChange={(e) => set("pid", e.target.value)} disabled={busy} placeholder={autoPid || "automatic"} style={{ ...S.inp, fontFamily: MONO }} />
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 10 }}>
        {fileBox("Signed BAST", bast, setBast, "ppl-up-bast")}
        {fileBox("Signed Notification Letter", letter, setLetter, "ppl-up-letter")}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderTop: `1px solid ${t.line}`, paddingTop: 12 }}>
        <span style={{ fontSize: 12, color: t.muted }}>Payment ID: <b style={{ fontFamily: MONO, color: t.ink }}>{pid || "—"}</b>{owner === pk && pid ? " (exists — files are added as latest versions)" : ""}</span>
        {errs.length > 0 && <span style={{ fontSize: 11.5, color: t.warnDark || "#8a6a00" }}>{errs[0]}</span>}
        <button className="ppd-f ppd-act" style={{ ...btnStyle(t, "primary", busy || errs.length > 0), marginLeft: "auto" }} disabled={busy || errs.length > 0} onClick={save}>
          ⬆ {busy ? "Saving…" : "Save payment"}
        </button>
      </div>
    </div>
  );
}

// ── Tab utama ────────────────────────────────────────────────────────────────
export function PartnerLettersTab({ docs, partnerNames = [], t }) {
  useDocsCss();
  const canGenerate = !!docs?.canMerge;            // SPM; admin internal Indosat hanya History + approval
  const [view, setView] = useState(canGenerate ? "new" : "history");          // new | history
  const [showCfg, setShowCfg] = useState(false);
  const [cfg, setCfgState] = useState(readGenCfg);
  const [meta, setMeta] = useState(() => {
    const saved = readJson(GEN_META_KEY, {});
    const today = isoDay(new Date());
    const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
    return { period: d.toISOString().slice(0, 7), docDate: today, deadline: addDays(today, 6), letterNo: letterNoForYear(saved.letterNo || `7340/P00-PHC0/EOM/${today.slice(0, 4)}`, today) };
  });
  const [index, setIndex] = useState(null);
  const [indexErr, setIndexErr] = useState("");

  const [known, setKnown] = useState(null);      // Map(Payment ID → partner_key) yang sudah punya dokumen (untuk NN & kode unik)
  const [approvals, setApprovals] = useState(null); // { available, byKey } — tabel approval mungkin belum dibuat
  const load = () => Promise.all([
    fetchLettersIndex(SEGMENT).then((m) => ({ m }), (e) => ({ m: new Map(), e })),
    fetchDraftDocs(SEGMENT).then((d) => new Map(d.filter((x) => isPaymentRef(x.ref_id)).map((x) => [x.ref_id, x.partner_key])), () => null),
    fetchApprovals().catch(() => ({ available: false, byKey: {} })),
  ]);
  const apply = ([{ m, e }, k, a]) => { setIndex(m); setIndexErr(e ? errMsg(e) : ""); setKnown(k); setApprovals(a); };
  const reload = async () => apply(await load());
  useEffect(() => {
    let alive = true;
    load().then((r) => { if (alive) apply(r); });
    return () => { alive = false; };
  }, []); // muat sekali saat tab dibuka

  const persist = (n) => { if (!writeJson(GEN_CFG_KEY, n)) toast(t, "Settings could not be saved in this browser (storage full?).", "err"); };
  const setCfg = (n) => { setCfgState(n); persist(n); };
  const setCfgField = (k, v) => setCfgState((c) => { const n = { ...c, [k]: v }; persist(n); return n; });
  const setMetaField = (k, v) => setMeta((m) => {
    const n = { ...m, [k]: v };
    if (k === "docDate") { n.deadline = addDays(v, 6) || m.deadline; n.letterNo = letterNoForYear(m.letterNo, v); }
    if (k === "letterNo") writeJson(GEN_META_KEY, { letterNo: v });
    return n;
  });

  return (
    <div style={{ background: t.surf, border: `1px solid ${t.line}`, borderRadius: 18, boxShadow: t.shadow1, marginBottom: 14, position: "relative" }}>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${t.line}`, background: t.surf2, borderRadius: "18px 18px 0 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 4, height: 18, borderRadius: 2, background: MAGENTA, display: "block" }} />
            <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.02em", color: t.ink }}>Partner Letters</span>
            <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "2px 8px", borderRadius: 99, background: `${MAGENTA}18`, color: MAGENTA, border: `1px solid ${MAGENTA}30` }}>{canGenerate ? "SPM" : "IOH admin"}</span>
          </div>
          <div style={{ marginTop: 4, marginLeft: 14, fontSize: 12, color: t.muted, maxWidth: 780, lineHeight: 1.45 }}>
            {canGenerate
              ? <>Generate BAST &amp; Notification Letters from the Excel, then e-sign them or request approval. Each payment has a unique Payment ID and is kept separate from the {DOC_REF_LABEL} documents.</>
              : <>Review the BAST &amp; Notification Letters generated by SPM and manage their approval (request, remind, cancel). Generating documents is done by SPM.</>}
          </div>
        </div>
        <button className="ppd-f ppd-act-o" style={btnStyle(t, showCfg ? "primary" : "outline", false, true)} onClick={() => setShowCfg((v) => !v)} aria-expanded={showCfg}>⚙ Settings</button>
      </div>
      {showCfg && <SettingsPanel cfg={cfg} setCfg={setCfg} setCfgField={setCfgField} meta={meta} setMetaField={setMetaField} busy={false} t={t} />}
      <div role="tablist" aria-label="Partner Letters" style={{ display: "flex", padding: "0 20px", borderBottom: `1px solid ${t.line}`, background: t.surf2, overflowX: "auto" }}>
        {[...(canGenerate ? [["new", "New batch", null], ["bulk", "Bulk upload signed", null], ["upload", "Single payment (upload only)", null]] : []), ["history", "History", index ? String(index.size) : "…"]].map(([k, label, count]) => {
          const active = view === k;
          return (
            <button key={k} role="tab" aria-selected={active} className="ppd-f" onClick={() => { setView(k); if (k === "history") reload(); }}
              style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 14px 10px", borderBottom: `2.5px solid ${active ? MAGENTA : "transparent"}`, color: active ? t.ink : t.muted, fontSize: 13, fontWeight: active ? 700 : 600, whiteSpace: "nowrap" }}>
              {label}
              {count && <span style={{ fontFamily: MONO, fontSize: 10, padding: "1px 7px", borderRadius: 99, background: active ? `${MAGENTA}18` : t.surf3, color: active ? MAGENTA : t.muted, border: `1px solid ${active ? `${MAGENTA}30` : t.line}` }}>{count}</span>}
            </button>
          );
        })}
      </div>
      {canGenerate && <div style={{ display: view === "new" ? "block" : "none" }}>
        <LettersWizard cfg={cfg} meta={meta} docs={docs} index={index} known={known} approvals={approvals} onSaved={reload}
          onOpenSettings={() => { setShowCfg(true); window.scrollTo({ top: 0, behavior: "smooth" }); }} onFinish={() => setView("history")} t={t} />
      </div>}
      {canGenerate && view === "bulk" && <BulkSignedUpload meta={meta} known={known} index={index} partnerNames={partnerNames} onSaved={reload} onDone={() => { setView("history"); reload(); }} t={t} />}
      {canGenerate && view === "upload" && <UploadOnlyPayment meta={meta} partnerNames={partnerNames} known={known} onSaved={reload} onDone={() => { setView("history"); reload(); }} t={t} />}
      {view === "history" && <LettersHistory cfg={cfg} index={index} indexErr={indexErr} approvals={approvals} reload={reload} canWrite={canGenerate} docs={docs} t={t} />}
    </div>
  );
}
