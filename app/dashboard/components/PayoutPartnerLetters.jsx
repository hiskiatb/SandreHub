"use client";
// Partner Letters (khusus SPM) — terpisah dari alur PO (Document Upload & Merge).
//   1 Upload Excel (Source Data SMS) → 2 Review & Preview (e-sign + Payment ID) → 3 Save
//   History: semua pembayaran (Payment ID) yang pernah di-generate — cari, buka PDF, unduh ZIP.
//   ⚙ Settings: periode, tanggal, claim deadline, Letter No, penanda tangan + gambar tanda tangan/stempel.
// PDF disimpan di tabel/bucket dokumen dengan ref_id = Payment ID (PAY-*), tidak muncul di tab PO / Raw Data.
// Gambar tanda tangan HANYA disimpan di browser (localStorage) — tidak pernah di-upload terpisah.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  DOC_REF_LABEL, statKey, uploadSlot, downloadDocsZip, partnerKey, signedUrl, fetchDraftDocs,
  isPaymentRef, parsePaymentRef, paymentIdFor, assignPartnerCodes,
} from "../../../lib/payoutPartnerDocs";
import {
  parseTemplateWorkbook, parseSmsWorkbook, finalizeSms, detectWorkbookFormat, readTemplateCarryOver,
  buildTemplateWorkbook, buildSmsTemplateWorkbook, buildBastPdf, buildLetterPdf, loadLetterhead, mergePdfBytes,
  DEFAULT_SIGNATORIES, DEFAULT_RECIPIENT, bastFileName, letterFileName, rupiah, parsePeriod, toDateValue, hasEsign,
} from "../../../lib/payoutDocGenerator";
import { fetchLettersIndex, readJsonFile, savePaymentMeta } from "../../../lib/payoutPartnerLetters";
import {
  TEAL, TEAL_D, MAGENTA, MONO, fmtDT, errMsg, useDocsCss, toast, btnStyle, Skel, IndeterminateBar, RowMenu, IcoDownload, IcoOpen, IcoUp,
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

function saveBlobAs(bytes, name, type) {
  const url = URL.createObjectURL(bytes instanceof Blob ? bytes : new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Gambar tanda tangan/stempel → data URL kecil (PNG tetap PNG supaya transparan)
async function imageToDataUrl(file, maxW, maxH) {
  if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error("Please use a PNG or JPG image (transparent PNG recommended).");
  if (file.size > 1024 * 1024) throw new Error("The image is larger than 1 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Unable to read the image.")); i.src = url; });
    const k = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext("2d");
    if (file.type === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return file.type === "image/png" ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.9);
  } finally { URL.revokeObjectURL(url); }
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
      [...Object.keys(CFG_DEFAULTS), ...IMG_FIELDS, "applyEsign"].forEach((k) => {
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
          {textFields.map(([k, lab]) => (
            <label key={k} style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11.5, color: t.muted }}>
              {lab}
              <input className="ppd-f" value={cfg[k] || ""} onChange={(e) => setCfgField(k, e.target.value)} disabled={busy} style={S.inp} />
            </label>
          ))}
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
function LettersWizard({ cfg, meta, docs, index, known, onSaved, onOpenSettings, onFinish, t }) {
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
  const fileRef = useRef(null);
  const prevRef = useRef(null);
  const busy = phase === "saving" || zipping || tplBusy;
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
      const code = partnerCodes.codes.get(partnerKey(fin.partner)) || "X";
      const clash = partnerCodes.clashes.find((c) => c.partner === partnerKey(fin.partner));
      if (clash) warnings.push(`Partner code ${clash.base} is already used by ${clash.with?.replace(/_/g, " ")} in this file — this partner uses ${clash.code}.`);
      const exists = (ref) => (docs?.byRef?.[statKey(SEGMENT, fin.partner, ref)]?.files || 0) > 0 || !!index?.has(ref) || !!known?.has(ref);
      let pid = "", pidExists = false, pidNext = "";
      if (fin.paymentId) {
        pid = fin.paymentId;
        if (!isPaymentRef(pid)) errors.push(`PAYMENT_ID "${pid}" must follow PAY-YYYYMM-TYPE-CODE-NN.`);
        else if (exists(pid)) warnings.push(`${pid} already exists — its documents will be replaced.`);
      } else if (fin.per) {
        const first = paymentIdFor(fin.per.ym, fin.type, code, 1);
        pid = first;
        if (exists(first)) {
          pidExists = true;
          let nn = 2; while (exists(paymentIdFor(fin.per.ym, fin.type, code, nn)) && nn < 99) nn++;
          pidNext = paymentIdFor(fin.per.ym, fin.type, code, nn);
          if ((e.pidMode || "new") === "new") pid = pidNext;
        }
      }
      const replace = (!!fin.paymentId && isPaymentRef(fin.paymentId) && exists(fin.paymentId)) || (pidExists && e.pidMode === "replace");
      return {
        ...fin, id, errors, warnings, paymentId: pid, pidExists, pidNext, pidMode: e.pidMode || "new",
        pidFirst: fin.per && !fin.paymentId ? paymentIdFor(fin.per.ym, fin.type, code, 1) : "", replace,
        letter: fin.letter && { ...fin.letter, paymentId: pid }, bast: fin.bast && { ...fin.bast, paymentId: pid },
        include: !errors.length && !!pid && (e.include ?? true), res: e.res || null, letterNoEdit: e.letterNo ?? meta.letterNo,
      };
    });
    const count = new Map();
    list.forEach((x) => { if (x.paymentId) count.set(x.paymentId, (count.get(x.paymentId) || 0) + 1); });
    list.forEach((x) => { if (count.get(x.paymentId) > 1) { x.errors = [...x.errors, `Payment ID ${x.paymentId} is used by more than one row — fix PAYMENT_ID in the Excel.`]; x.include = false; } });
    return list;
  }, [upload, edits, meta, cfg.recipientMPC, cfg.recipientMP3, lastTpl, partnerCodes, docs?.byRef, index, known]);

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
    if (!esignActive && !window.confirm("No e-signature is applied (upload signature images in ⚙ Settings, or turn on “Apply e-signature”). Save the documents without a signature?")) return;
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
            esign: { bast: hasEsign(cfg, "bast"), letter: hasEsign(cfg, "letter") }, saved_at: new Date().toISOString(), source_file: upload?.name || "",
          });
        } catch (e) { res.meta = `error: ${errMsg(e)}`; }
        done.push({ pid: it.paymentId, partner: it.partner, type: it.type, total: it.letter.total, res });
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
    docs?.refresh?.();
    await onSaved?.();
    setSaved(done);
    if (done.length) { closePreview(); setPhase("saved"); } else setPhase("review");
    toast(t, `Saved ${done.length} payment(s) · ${ok} document(s)${fail ? `, ${fail} failed` : ""}.`, fail ? "err" : "ok");
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
  const reset = () => { setUpload(null); setPhase("review"); setSaved([]); closePreview(); };

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
          {esignActive
            ? <Chip color={t.goodDark || TEAL_D} bg={t.goodBg} bd={t.goodBd} title="Signature images from ⚙ Settings are applied">✍ E-signature on</Chip>
            : <button className="ppd-f" onClick={onOpenSettings} style={{ all: "unset", cursor: "pointer" }} title="Upload signature images in ⚙ Settings"><Chip color={t.warnDark || "#8a6a00"} bg={t.warnBg} bd={t.warnBd}>✍ No e-signature — set up</Chip></button>}
          <span style={{ fontFamily: MONO, fontSize: 10.5, color: t.muted }}>{parsePeriod(meta.period)?.label || "No period"} · {meta.docDate} · {meta.letterNo}</span>
        </span>
      </div>
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
                            <option value="replace">{`Replace existing ${x.pidFirst}`}</option>
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
          <div style={{ fontFamily: MONO, fontSize: 10.5, color: t.muted, marginBottom: 6 }}>Generating &amp; saving {prog.i}/{prog.total} document(s)…</div>
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
                {phase === "saving" ? `Saving ${prog.i}/${prog.total}…` : `⬆ Save ${ready.length} payment(s)`}
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
function LettersHistory({ index, indexErr, t }) {
  const S = styles(t);
  const [rowsRaw, setRowsRaw] = useState(null);
  const [err, setErr] = useState("");
  const [metas, setMetas] = useState({});        // pid → meta JSON
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState("all");
  const [sel, setSel] = useState(() => new Set());
  const [zipping, setZipping] = useState(false);

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
      return { ...g, meta, total: meta.total, period: meta.period || g.info?.label || "", type: meta.type || g.info?.type || "" };
    }).sort((a, b) => (b.info?.ym || "").localeCompare(a.info?.ym || "") || a.partner.localeCompare(b.partner) || a.type.localeCompare(b.type));
  }, [rowsRaw, metas]);

  const periods = useMemo(() => [...new Set(groups.map((g) => g.info?.ym).filter(Boolean))].sort().reverse(), [groups]);
  const qq = q.trim().toLowerCase();
  const shown = groups.filter((g) => (period === "all" || g.info?.ym === period) && (!qq || `${g.pid} ${g.partner}`.toLowerCase().includes(qq)));
  const selected = shown.filter((g) => sel.has(g.pid));
  const toggle = (k) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const openDoc = async (d) => { try { window.open(await signedUrl(d.storage_path), "_blank", "noopener"); } catch (e) { toast(t, `Unable to open: ${errMsg(e)}`, "err"); } };
  const docsOf = (g) => [["bast", "BAST"], ["surat_pemberitahuan", "LETTER"]].flatMap(([k, s]) => g.files[k][0] ? [{ ...g.files[k][0], file_name: `${s}_${g.pid}_${g.partner}.pdf`, _label: s === "BAST" ? "BAST" : "Letter" }] : []);
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
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="ppd-f ppd-act" style={btnStyle(t, "primary", !selected.length || zipping, true)} disabled={!selected.length || zipping} onClick={() => zipSelected(selected)}><IcoDownload /> {zipping ? "Preparing…" : `Download selected (${selected.length})`}</button>
        </div>
      </div>
      {(err || indexErr) && <div role="alert" style={{ margin: "10px 20px", fontSize: 12, padding: "8px 12px", borderRadius: 10, color: t.bad, background: t.badBg, border: `1px solid ${t.badBd}` }}>Unable to load history: {err || indexErr}</div>}
      <div style={{ overflow: "auto", maxHeight: "68vh" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 980 }}>
          <thead><tr>
            <th style={{ ...S.th, width: 34, textAlign: "center" }}><input type="checkbox" className="ppd-f" aria-label="Select all shown" checked={shown.length > 0 && shown.every((g) => sel.has(g.pid))} onChange={(e) => setSel(e.target.checked ? new Set(shown.map((g) => g.pid)) : new Set())} /></th>
            <th style={S.th}>Payment ID</th><th style={S.th}>Partner</th><th style={S.th}>Type</th><th style={S.th}>Period</th>
            <th style={{ ...S.th, textAlign: "right" }}>Total transfer</th><th style={S.th}>Documents</th><th style={S.th}>Saved</th><th style={{ ...S.th, textAlign: "right" }}><span className="ppd-sr">Actions</span></th>
          </tr></thead>
          <tbody>
            {rowsRaw == null
              ? Array.from({ length: 4 }).map((_, i) => <tr key={i}>{Array.from({ length: 9 }).map((__, j) => <td key={j} style={S.td}><Skel t={t} /></td>)}</tr>)
              : !shown.length
                ? <tr><td colSpan={9} style={{ padding: "36px 16px", textAlign: "center", color: t.muted }}>
                    <div style={{ fontWeight: 700, color: t.ink, fontSize: 13.5 }}>{groups.length ? "No payments match the search or period" : "No partner letters yet"}</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>{groups.length ? "Change the search or period filter." : "Use “New batch” to generate e-signed BAST & Notification Letters from the Excel."}</div>
                  </td></tr>
                : shown.map((g, i) => {
                  const signed = g.meta.esign && (g.meta.esign.bast || g.meta.esign.letter);
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
                      <td style={{ ...mid, fontFamily: MONO, fontSize: 11, whiteSpace: "nowrap" }}>{fmtDT(g.lastAt)}</td>
                      <td style={{ ...mid, textAlign: "right" }}><RowMenu t={t} label={`More actions for ${g.pid}`} items={[{ label: "Download PDFs (ZIP)", onClick: () => zipSelected([g]) }]} /></td>
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

// ── Tab utama ────────────────────────────────────────────────────────────────
export function PartnerLettersTab({ docs, t }) {
  useDocsCss();
  const [view, setView] = useState("new");          // new | history
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

  const [known, setKnown] = useState(null);      // Payment ID yang sudah punya dokumen (untuk NN berikutnya)
  const load = () => Promise.all([
    fetchLettersIndex(SEGMENT).then((m) => ({ m }), (e) => ({ m: new Map(), e })),
    fetchDraftDocs(SEGMENT).then((d) => new Set(d.map((x) => x.ref_id).filter(isPaymentRef)), () => new Set()),
  ]);
  const apply = ([{ m, e }, k]) => { setIndex(m); setIndexErr(e ? errMsg(e) : ""); setKnown(k); };
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
            <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "2px 8px", borderRadius: 99, background: `${MAGENTA}18`, color: MAGENTA, border: `1px solid ${MAGENTA}30` }}>SPM</span>
          </div>
          <div style={{ marginTop: 4, marginLeft: 14, fontSize: 12, color: t.muted, maxWidth: 780, lineHeight: 1.45 }}>
            Generate e-signed BAST &amp; Notification Letters from the Excel. Each payment has a unique Payment ID and is kept separate from the {DOC_REF_LABEL} documents.
          </div>
        </div>
        <button className="ppd-f ppd-act-o" style={btnStyle(t, showCfg ? "primary" : "outline", false, true)} onClick={() => setShowCfg((v) => !v)} aria-expanded={showCfg}>⚙ Settings</button>
      </div>
      {showCfg && <SettingsPanel cfg={cfg} setCfg={setCfg} setCfgField={setCfgField} meta={meta} setMetaField={setMetaField} busy={false} t={t} />}
      <div role="tablist" aria-label="Partner Letters" style={{ display: "flex", padding: "0 20px", borderBottom: `1px solid ${t.line}`, background: t.surf2, overflowX: "auto" }}>
        {[["new", "New batch", null], ["history", "History", index ? String(index.size) : "…"]].map(([k, label, count]) => {
          const active = view === k;
          return (
            <button key={k} role="tab" aria-selected={active} className="ppd-f" onClick={() => setView(k)}
              style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 14px 10px", borderBottom: `2.5px solid ${active ? MAGENTA : "transparent"}`, color: active ? t.ink : t.muted, fontSize: 13, fontWeight: active ? 700 : 600, whiteSpace: "nowrap" }}>
              {label}
              {count && <span style={{ fontFamily: MONO, fontSize: 10, padding: "1px 7px", borderRadius: 99, background: active ? `${MAGENTA}18` : t.surf3, color: active ? MAGENTA : t.muted, border: `1px solid ${active ? `${MAGENTA}30` : t.line}` }}>{count}</span>}
            </button>
          );
        })}
      </div>
      <div style={{ display: view === "new" ? "block" : "none" }}>
        <LettersWizard cfg={cfg} meta={meta} docs={docs} index={index} known={known} onSaved={reload}
          onOpenSettings={() => { setShowCfg(true); window.scrollTo({ top: 0, behavior: "smooth" }); }} onFinish={() => setView("history")} t={t} />
      </div>
      {view === "history" && <LettersHistory index={index} indexErr={indexErr} t={t} />}
    </div>
  );
}
