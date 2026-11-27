"use client";
// Payout Tracker: email pengingat "Invoice Not Submitted" ke partner/agency.
//  • Sumber email = sheet "Master Mapping" di Excel upload (readContactsSheet), disimpan saat Publish (saveContacts).
//  • Dikirim HANYA dari tampilan review (InvoiceReminderModal): preview tiap email dulu, baru kirim.
// Hanya admin SPM & admin internal Indosat (dicek juga di server: /api/payout-docs/invoice-reminders).

import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import supabase from "../../../lib/supabase";
import {
  invoiceReminderEmail, parseEmails, isEmail, invKey, cleanInvoiceItem, MAX_REMINDER_TO, MAX_REMINDER_ITEMS,
  DEFAULT_REMINDER_TEMPLATE, REMINDER_PLACEHOLDERS, REMINDER_TPL_MAX, cleanReminderTemplate, isDefaultReminderTemplate,
} from "../../../lib/payoutInvoiceReminderEmail";

const API = "/api/payout-docs/invoice-reminders";
export const CONTACTS_SHEET = "Master Mapping";

async function call(body) {
  const { data: { session } = {} } = await supabase.auth.getSession();
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

/* ── Sheet "Master Mapping" (email partner) ──────────────────────────────────────────────────
   Kolom (urutan bebas, baris judul boleh di 10 baris pertama):
     Tipe (Partner/Agency) · Nama Partner / Agency · Email To · Email CC · PIC
   "Email To"/"Email CC" boleh berisi beberapa alamat dipisah koma/titik koma.
   Tanpa kolom Tipe → baris berlaku untuk Partner dan Agency (dicocokkan lewat nama). */
const nk = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
export function readContactsSheet(XLSX, wb) {
  // Sheet "Master Mapping" (nama utama); cadangan: sheet bernama email/kontak/contact
  const name = wb.SheetNames.find((s) => nk(s) === "master mapping")
    || wb.SheetNames.find((s) => /^master mapping/.test(nk(s)))
    || wb.SheetNames.find((s) => /\b(email|e-mail|kontak|contact)\b/.test(nk(s)) && !/prepaid/.test(nk(s)));
  if (!name) return null;
  const arr = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" });
  const hi = arr.slice(0, 10).findIndex((r) => r.some((c) => /e-?mail/.test(nk(c))));
  if (hi < 0) return { sheet: name, rows: [], error: `Sheet "${name}" tidak punya kolom Email.` };
  const head = arr[hi].map(nk);
  const col = (re, not) => head.findIndex((h) => re.test(h) && !(not && not.test(h)));
  const cName = col(/partner|agency|nama|name|vendor|supplier/, /e-?mail|pic|tipe|type|jenis/);
  const cType = col(/^(tipe|type|jenis|segment|kategori)\b/);
  const cTo = head.map((h, i) => (/e-?mail/.test(h) && !/\bcc\b/.test(h) ? i : -1)).filter((i) => i >= 0);
  const cCc = head.map((h, i) => (/\bcc\b/.test(h) ? i : -1)).filter((i) => i >= 0);
  const cPic = col(/\bpic\b|contact person|nama kontak/);
  if (cName < 0) return { sheet: name, rows: [], error: `Sheet "${name}" tidak punya kolom nama Partner/Agency.` };
  const rows = [];
  arr.slice(hi + 1).forEach((r) => {
    const owner = String(r[cName] ?? "").trim();
    const to = parseEmails(cTo.map((i) => r[i]).join(","));
    const cc = parseEmails(cCc.map((i) => r[i]).join(",")).filter((e) => !to.includes(e));
    if (!owner || (!to.length && !cc.length)) return;
    const ty = cType >= 0 ? nk(r[cType]) : "";
    const segs = /agen/.test(ty) ? ["agency"] : /partner|mitra|mpx|mdi/.test(ty) ? ["partner"] : ["partner", "agency"];
    const pic = cPic >= 0 ? String(r[cPic] ?? "").trim() : "";
    segs.forEach((segment) => rows.push({ segment, owner, to, cc, pic }));
  });
  return { sheet: name, rows, owners: new Set(rows.map((r) => nk(r.owner))).size };
}

// Simpan kontak dari sheet (ganti semua kontak lama). Dipanggil saat Publish / upload file kontak saja.
export async function saveContacts(contacts, showToast) {
  if (!contacts || contacts.error) { if (contacts?.error) showToast?.(contacts.error, "error"); return false; }
  try {
    const r = await call({ action: "import", segments: ["partner", "agency"], contacts: contacts.rows });
    showToast?.(`Email partner tersimpan: ${contacts.owners} partner/agency`, "success");
    return r.ok;
  } catch (e) { showToast?.("Email partner belum tersimpan: " + e.message, "error"); return false; }
}

// Template sheet "Email Partner": semua nama dari data + email yang sudah tersimpan
async function downloadTemplate(names, info, isAg) {
  const XLSX = await import("xlsx");
  const data = names.map((n) => { const o = info?.owners?.[n]; return {
    "Tipe": isAg ? "Agency" : "Partner", "Nama Partner / Agency": n,
    "Email To": (o?.to || []).join(", "), "Email CC": (o?.cc || []).join(", "), "PIC": o?.pic || "" }; });
  const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ "Tipe": "", "Nama Partner / Agency": "", "Email To": "", "Email CC": "", "PIC": "" }]);
  ws["!cols"] = [10, 40, 40, 40, 24].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, CONTACTS_SHEET);
  XLSX.writeFile(wb, `email_${isAg ? "agency" : "partner"}_template.xlsx`);
}

const fmtWhen = (d) => new Date(d).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const rpWord = (n) => { const a = Math.abs(n); return a >= 1e9 ? `Rp ${(n / 1e9).toFixed(1)} M` : a >= 1e6 ? `Rp ${(n / 1e6).toFixed(1)} jt` : `Rp ${Math.round(n).toLocaleString("id-ID")}`; };

function Button({ t, primary, disabled, onClick, children, title, sm }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      style={{ fontFamily: "inherit", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1,
        padding: sm ? "4px 10px" : "8px 14px", fontSize: sm ? 12 : 13, fontWeight: 600, borderRadius: 9, whiteSpace: "nowrap",
        border: `1px solid ${primary ? "#32BCAD" : t.line2}`, background: primary ? "#32BCAD" : t.surf, color: primary ? "#fff" : t.ink }}>
      {children}
    </button>
  );
}

/** Tombol pembuka tampilan review (toolbar Outstanding). */
export function ReminderButton({ t, onClick, sm, children }) {
  return <Button t={t} sm={sm} onClick={(e) => { e.stopPropagation(); onClick(); }}>✉ {children}</Button>;
}

const Chip = ({ t, children, muted, onRemove, label }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 99, border: `1px solid ${t.line2}`, background: muted ? "transparent" : t.surf3, color: muted ? t.muted : t.ink2, fontSize: 12, maxWidth: "100%", wordBreak: "break-all" }}>
    {children}
    {onRemove && <button type="button" onClick={onRemove} aria-label={`Hapus ${label}`} title="Hapus"
      style={{ fontFamily: "inherit", border: 0, background: "none", cursor: "pointer", color: t.muted, padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>}
  </span>
);

const subscribeResize = (cb) => { window.addEventListener("resize", cb); return () => window.removeEventListener("resize", cb); };
const useNarrow = (px) => useSyncExternalStore(subscribeResize, () => window.innerWidth < px, () => false);

// Baris alamat (To / Cc): chip yang bisa dihapus + kolom "email tambahan" (Enter / koma / keluar kolom = tambah)
function AddrRow({ t, label, list, onRemove, onAdd, placeholder, max }) {
  const [txt, setTxt] = useState("");
  const [bad, setBad] = useState("");
  const commit = () => {
    const raw = txt.split(/[\s,;]+/).filter(Boolean);
    if (!raw.length) { setBad(""); return; }
    const ok = parseEmails(txt), wrong = raw.filter((r) => !isEmail(r));
    if (ok.length) onAdd(ok);
    setBad(wrong.length ? `Bukan alamat email: ${wrong.join(", ")}` : "");
    setTxt(wrong.join(", "));
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "58px minmax(0,1fr)", gap: 8, alignItems: "start", padding: "6px 0", borderBottom: `1px solid ${t.line}` }}>
      <span style={{ color: t.muted, fontSize: 12.5, paddingTop: 3 }}>{label}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", minWidth: 0 }}>
        {list.map((e) => <Chip key={e} t={t} label={e} onRemove={() => onRemove(e)}>{e}</Chip>)}
        <input value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={commit} aria-label={`${label}: email tambahan`}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); } }} placeholder={placeholder}
          style={{ flex: "1 1 190px", minWidth: 150, fontFamily: "inherit", fontSize: 12.5, padding: "4px 8px", borderRadius: 7, border: `1px dashed ${t.line2}`, background: "transparent", color: t.ink }} />
        {max && list.length > max && <div style={{ flexBasis: "100%", fontSize: 12, color: t.warnDark }}>Maksimal {max} penerima To, sisanya tidak ikut dikirim.</div>}
        {bad && <div style={{ flexBasis: "100%", fontSize: 12, color: t.badDark }}>{bad}</div>}
      </div>
    </div>
  );
}

const DEFAULT_FROM = "Sales & Distribution Sumatera <snd@spmsumatera.site>";

/* ── Template teks email (bisa diedit) ──────────────────────────────────────────────────────
   Disimpan di tabel payout_reminder_template (semua admin) + salinan di localStorage browser
   (cadangan bila tabel belum dibuat). Urutan muat: database → browser → teks awal. */
const TPL_LS = "payoutReminderTemplate.v1";
const lsGet = () => { try { const v = JSON.parse(window.localStorage.getItem(TPL_LS) || "null"); return v && typeof v === "object" ? cleanReminderTemplate(v) : null; } catch { return null; } };
const lsSet = (v) => { try { if (v) window.localStorage.setItem(TPL_LS, JSON.stringify(v)); else window.localStorage.removeItem(TPL_LS); } catch { /* browser tanpa storage */ } };
const sameTpl = (a, b) => { const x = cleanReminderTemplate(a), y = cleanReminderTemplate(b); return Object.keys(x).every((k) => x[k] === y[k]); };
const TPL_TEXT_FIELDS = [
  ["subject", "Subjek", 1, 300],
  ["opening", "Paragraf pembuka", 6, REMINDER_TPL_MAX],
  ["terms", "Ketentuan upload", 10, REMINDER_TPL_MAX],
  ["closing", "Penutup", 3, REMINDER_TPL_MAX],
];
const TPL_COLS = [["colTitle", "Kolom 1"], ["colPeriod", "Kolom 2"], ["colInv", "Kolom 3"], ["colAmount", "Kolom 4"]];

function TemplateEditor({ t, tpl, setTpl, saved, status, onSave, onReset, busy }) {
  const [open, setOpen] = useState(false);
  const input = { fontFamily: "inherit", fontSize: 12.5, padding: "6px 9px", borderRadius: 8, border: `1px solid ${t.line2}`, background: t.surf, color: t.ink, width: "100%", boxSizing: "border-box" };
  const set = (k) => (e) => setTpl((s) => ({ ...s, [k]: e.target.value }));
  const dirty = !sameTpl(tpl, saved);
  const custom = !isDefaultReminderTemplate(tpl);
  return (
    <div style={{ marginTop: 12, border: `1px solid ${open ? "#32BCAD" : t.line2}`, borderRadius: 11, overflow: "hidden" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit", textAlign: "left", cursor: "pointer", border: 0, padding: "9px 11px", background: open ? "#32BCAD12" : t.surf2, color: t.ink }}>
        <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>✎ Edit teks email</span>
        {dirty ? <span style={{ fontSize: 11.5, color: t.warnDark, fontWeight: 600 }}>belum disimpan</span> : custom ? <span style={{ fontSize: 11.5, color: t.muted }}>teks custom</span> : null}
        <span aria-hidden="true" style={{ color: t.muted }}>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div style={{ padding: "10px 11px 12px" }}>
          <div style={{ fontSize: 12, color: t.ink2, lineHeight: 1.55, padding: "7px 9px", borderRadius: 8, background: t.surf3, marginBottom: 10 }}>
            Diisi otomatis per penerima: {REMINDER_PLACEHOLDERS.map(([k, d], i) => <span key={k}>{i ? " · " : ""}<code style={{ fontWeight: 700 }}>{k}</code> {d}</span>)}.
            <div style={{ marginTop: 4 }}>Baris kosong = paragraf baru · <code>- </code> / <code>1. </code> = daftar · <code>**teks**</code> = tebal. Tabel invoice otomatis di bawah paragraf pembuka.</div>
          </div>
          {TPL_TEXT_FIELDS.map(([k, label, rows, max]) => (
            <label key={k} style={{ display: "block", marginBottom: 9 }}>
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: t.ink2, marginBottom: 3 }}>{label}</span>
              {rows === 1 ? <input value={tpl[k]} onChange={set(k)} maxLength={max} style={input} />
                : <textarea value={tpl[k]} onChange={set(k)} rows={rows} maxLength={max} style={{ ...input, resize: "vertical", lineHeight: 1.45 }} />}
            </label>
          ))}
          <div style={{ fontSize: 12.5, fontWeight: 600, color: t.ink2, marginBottom: 3 }}>Judul kolom tabel</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
            {TPL_COLS.map(([k, l]) => <input key={k} aria-label={`Judul ${l}`} value={tpl[k]} onChange={set(k)} maxLength={60} style={input} />)}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Button t={t} sm primary disabled={busy || !dirty} onClick={onSave}>{busy ? "Menyimpan…" : "Simpan sebagai template default"}</Button>
            <Button t={t} sm disabled={busy || (!custom && isDefaultReminderTemplate(saved))} onClick={onReset}>Kembalikan ke teks awal</Button>
          </div>
          {status && <div style={{ fontSize: 12, color: t.muted, marginTop: 7, lineHeight: 1.45 }}>{status}</div>}
        </div>
      )}
    </div>
  );
}

/**
 * Tampilan review: semua email dicek dulu sebelum dikirim (tombol kirim HANYA ada di sini).
 * Kiri: daftar partner terpilih (ikut dikirim / tidak). Kanan: email lengkap partner aktif
 * (From, To, Cc, Subjek, isi HTML) — dibuat dengan template, catatan & tautan yang sama dengan server.
 * @param items      baris ins.remind (Project Title ada, Invoice ID & Invoicing Date kosong): {name,title,period,inv,invId,amt}
 * @param owners     pemilik yang ditinjau ([] = semua pemilik di items)
 * @param allOwners  semua nama pemilik di data (untuk template sheet Email Partner)
 */
export function InvoiceReminderModal({ items, owners: initial, allOwners = [], isAg, t, onClose, showToast }) {
  const segment = isAg ? "agency" : "partner";
  const own = isAg ? "agency" : "partner";
  const [only] = useState(() => (initial?.length ? new Set(initial) : null));
  const list = useMemo(() => {
    const g = {};
    items.forEach((x) => { if (only && !only.has(x.name)) return; (g[x.name] ||= { name: x.name, items: [], amt: 0 }); g[x.name].items.push(x); g[x.name].amt += x.amt; });
    return Object.values(g).filter((x) => x.name && x.name !== "—").sort((a, b) => b.amt - a.amt);
  }, [items, only]);

  const [info, setInfo] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [sel, setSel] = useState(() => new Set(list.map((x) => x.name)));   // ikut dikirim
  const [rcpt, setRcpt] = useState({});           // pemilik → {to, cc} hasil edit (sekali kirim, tidak disimpan)
  const [note, setNote] = useState("");
  const [tpl, setTplRaw] = useState(() => ({ ...DEFAULT_REMINDER_TEMPLATE }));   // teks email (live di preview)
  const [savedTpl, setSavedTpl] = useState(() => ({ ...DEFAULT_REMINDER_TEMPLATE }));
  const [tplInfo, setTplInfo] = useState(null);   // {tableReady, updatedBy, updatedAt, local}
  const [tplBusy, setTplBusy] = useState(false);
  const [ai, setAi] = useState(0);                // indeks partner aktif di panel kanan
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const narrow = useNarrow(820);

  const ownersKey = allOwners.join("\u0001");   // dep stabil (array baru tiap render)
  useEffect(() => {
    let alive = true;
    const names = [...new Set([...list.map((x) => x.name), ...ownersKey.split("\u0001").filter(Boolean)])];
    call({ action: "recipients", segment, owners: names })
      .then((r) => { if (alive) setInfo(r); })
      .catch((e) => alive && setLoadErr(e.message));
    return () => { alive = false; };
  }, [list, ownersKey, segment]);

  // Template default: database → salinan browser → teks awal
  useEffect(() => {
    let alive = true;
    const local = lsGet();
    call({ action: "template", op: "get" })
      .then((r) => {
        if (!alive) return;
        const use = r.tableReady && r.template ? r.template : local;
        if (use) { setTplRaw({ ...use }); setSavedTpl({ ...use }); }
        setTplInfo({ tableReady: !!r.tableReady, updatedBy: r.updatedBy, updatedAt: r.updatedAt, local: !(r.tableReady && r.template) && !!local });
      })
      .catch(() => { if (!alive) return; if (local) { setTplRaw({ ...local }); setSavedTpl({ ...local }); } setTplInfo({ tableReady: false, local: !!local }); });
    return () => { alive = false; };
  }, []);
  const setTpl = (fn) => { setConfirm(false); setTplRaw(fn); };
  const tplClean = useMemo(() => cleanReminderTemplate(tpl), [tpl]);
  const saveTpl = async () => {
    const v = cleanReminderTemplate(tpl);
    setTplBusy(true); lsSet(v);
    try {
      const r = await call({ action: "template", op: "save", template: v });
      setSavedTpl(v);
      if (r.tableReady) { setTplInfo({ tableReady: true, updatedBy: info?.sender?.name || "", updatedAt: new Date().toISOString(), local: false }); showToast?.("Template email tersimpan untuk semua admin", "success"); }
      else { setTplInfo({ tableReady: false, local: true }); showToast?.(`Template disimpan di browser ini saja — tabel payout_reminder_template belum dibuat (SQL ${r.sql || "20261126_payout_reminder_template.sql"}).`, "error"); }
    } catch (e) { showToast?.("Template belum tersimpan: " + e.message, "error"); }
    setTplBusy(false);
  };
  const resetTpl = async () => {
    const d = { ...DEFAULT_REMINDER_TEMPLATE };
    setTpl(() => d); lsSet(null); setTplBusy(true);
    try {
      const r = await call({ action: "template", op: "reset" });
      setSavedTpl(d); setTplInfo({ tableReady: !!r.tableReady, local: false });
      showToast?.("Teks email kembali ke teks awal", "success");
    } catch (e) { showToast?.("Template default belum dihapus: " + e.message, "error"); }
    setTplBusy(false);
  };
  const tplStatus = !tplInfo ? "Memuat template…"
    : !tplInfo.tableReady ? `Tabel template belum dibuat di database (SQL 20261126_payout_reminder_template.sql). Perubahan tetap dipakai untuk kiriman ini${tplInfo.local ? "; template tersimpan di browser ini" : ""}.`
    : tplInfo.local ? "Memakai teks yang tersimpan di browser ini saja. Klik Simpan agar teks ini dipakai semua admin."
    : tplInfo.updatedAt ? `Template default terakhir disimpan ${fmtWhen(tplInfo.updatedAt)}${tplInfo.updatedBy ? ` oleh ${tplInfo.updatedBy}` : ""}. Berlaku untuk semua admin.`
    : "Memakai teks awal. Simpan agar teks baru dipakai semua admin.";

  useEffect(() => { const k = (e) => e.key === "Escape" && !sending && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose, sending]);

  const baseTo = (n) => info?.owners?.[n]?.to || [];
  const baseCc = (n) => info?.owners?.[n]?.cc || [];
  const toAll = (n) => rcpt[n]?.to ?? baseTo(n);
  const toOf = (n) => toAll(n).slice(0, MAX_REMINDER_TO);
  const ccOf = (n) => { const to = toOf(n); return (rcpt[n]?.cc ?? baseCc(n)).filter((e) => !to.includes(e)); };
  const edit = (n, k, fn) => setRcpt((s) => { const cur = { to: s[n]?.to ?? baseTo(n), cc: s[n]?.cc ?? baseCc(n) }; return { ...s, [n]: { ...cur, [k]: fn(cur[k]) } }; });
  const add = (n, k) => (arr) => edit(n, k, (l) => [...new Set([...l, ...arr])]);
  const del = (n, k) => (e) => edit(n, k, (l) => l.filter((x) => x !== e));

  const ready = list.filter((g) => sel.has(g.name) && toOf(g.name).length);
  const skipped = list.filter((g) => sel.has(g.name) && !toOf(g.name).length);
  const addrCount = new Set(ready.flatMap((g) => [...toOf(g.name), ...ccOf(g.name)])).size;
  const toggle = (name) => { setConfirm(false); setSel((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; }); };

  const send = async () => {
    if (!ready.length || sending) return;
    setSending(true);
    const skip = skipped.map((g) => g.name);
    try {
      const r = await call({ action: "send", segment, note, template: tplClean, items: ready.map((g) => ({
        owner: g.name, to: toOf(g.name), cc: ccOf(g.name),
        invoices: g.items.map((x) => ({ title: x.title, period: x.period, inv: x.inv, invId: x.invId, prog: x.prog, amt: x.amt })),
      })) });
      setResult({ ...r, skipped: skip });
      showToast?.(r.failed ? `${r.sent} terkirim, ${r.failed} gagal` : `Pengingat terkirim ke ${r.sent} ${own}`, r.failed ? "error" : "success");
    } catch (e) { showToast?.(e.message, "error"); setResult({ error: e.message }); }
    setSending(false);
    setConfirm(false);
  };

  // Email partner aktif — sama persis dengan yang dikirim server (item dibersihkan, catatan di-trim, pengirim & tautan dari server)
  const act = list[Math.min(ai, list.length - 1)] || null;
  const actOn = act && sel.has(act.name);
  const mail = act && invoiceReminderEmail({ segment, owner: act.name.trim().slice(0, 200), note: note.trim().slice(0, 2000),
    items: act.items.slice(0, MAX_REMINDER_ITEMS).map(cleanInvoiceItem), senderName: info?.sender?.name || "", link: info?.sender?.link || "", template: tplClean });
  const from = info?.sender?.from || DEFAULT_FROM;
  const missing = info?.contactsReady ? list.filter((g) => !baseTo(g.name).length).length : 0;

  const input = { fontFamily: "inherit", fontSize: 12.5, padding: "6px 9px", borderRadius: 8, border: `1px solid ${t.line2}`, background: t.surf, color: t.ink, width: "100%", boxSizing: "border-box" };
  const box = (bg, bd, c) => ({ padding: "8px 12px", borderRadius: 10, background: bg, border: `1px solid ${bd}`, color: c, fontSize: 12.5, marginBottom: 10, lineHeight: 1.5 });
  const badge = (ok) => ({ display: "inline-block", padding: "1px 8px", borderRadius: 99, fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap",
    background: ok ? (t.goodBg || t.surf3) : t.badBg, border: `1px solid ${ok ? (t.goodBd || t.line2) : t.badBd}`, color: ok ? t.goodDark : t.badDark });
  const meta = (k, v) => (
    <div style={{ display: "grid", gridTemplateColumns: "58px minmax(0,1fr)", gap: 8, padding: "6px 0", borderBottom: `1px solid ${t.line}`, fontSize: 12.5 }}>
      <span style={{ color: t.muted }}>{k}</span><span style={{ color: t.ink, wordBreak: "break-word" }}>{v}</span>
    </div>
  );

  return (
    <div onClick={() => !sending && onClose()} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,20,30,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: narrow ? 8 : 16 }}>
      <div role="dialog" aria-modal="true" aria-label="Tinjau email pengingat sebelum kirim" onClick={(e) => e.stopPropagation()}
        style={{ background: t.surf, border: `1px solid ${t.line2}`, borderRadius: 16, boxShadow: t.shadow3, width: "min(1180px, 100%)", height: narrow ? "94vh" : "90vh", display: "flex", flexDirection: "column", color: t.ink }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 300px", minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{result && !result.error ? "Hasil pengiriman" : "Tinjau email sebelum kirim"}</div>
            <div style={{ fontSize: 12.5, color: t.muted, marginTop: 2 }}>Satu email per {own}. Periksa penerima &amp; isi tiap email, lalu kirim dari bawah. Alamat diambil dari sheet &ldquo;{CONTACTS_SHEET}&rdquo;.</div>
          </div>
          <Button t={t} sm onClick={() => downloadTemplate([...new Set([...allOwners, ...list.map((g) => g.name)])].sort(), info, isAg)} title={`Excel sheet "${CONTACTS_SHEET}" berisi semua ${own} di data, siap diisi lalu ditambahkan ke file upload`}>Unduh template email</Button>
          <Button t={t} sm onClick={onClose} disabled={sending}>Tutup</Button>
        </div>

        {result && !result.error ? (
          <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{result.sent} terkirim{result.failed ? `, ${result.failed} gagal` : ""}{result.skipped?.length ? `, ${result.skipped.length} dilewati` : ""}</div>
            {result.results.map((r) => (
              <div key={r.owner} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${t.line}`, fontSize: 13, flexWrap: "wrap", alignItems: "baseline" }}>
                <span style={badge(r.ok)}>{r.ok ? "✓ Terkirim" : "✕ Gagal"}</span>
                <span style={{ fontWeight: 600, flex: "1 1 200px", minWidth: 0 }}>{r.owner}</span>
                <span style={{ color: r.ok ? t.muted : t.badDark, wordBreak: "break-all", flex: "2 1 260px" }}>{r.ok ? [...(r.to || []), ...(r.cc || []).map((e) => `cc ${e}`)].join(", ") : r.error}</span>
              </div>
            ))}
            {(result.skipped || []).map((n) => (
              <div key={n} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${t.line}`, fontSize: 13, flexWrap: "wrap", alignItems: "baseline" }}>
                <span style={{ ...badge(true), background: t.surf3, border: `1px solid ${t.line2}`, color: t.muted }}>Dilewati</span>
                <span style={{ fontWeight: 600, flex: "1 1 200px", minWidth: 0 }}>{n}</span>
                <span style={{ color: t.muted, flex: "2 1 260px" }}>Tidak ada email penerima.</span>
              </div>
            ))}
            {!result.logReady && <div style={{ fontSize: 12, color: t.muted, marginTop: 10 }}>Riwayat pengingat belum tersimpan karena tabelnya belum dibuat di database.</div>}
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: narrow ? "1fr" : "minmax(260px, 330px) minmax(0,1fr)", gridTemplateRows: narrow ? "minmax(0,38%) minmax(0,1fr)" : "minmax(0,1fr)" }}>
            {/* Kiri: daftar partner */}
            <div style={{ borderRight: narrow ? 0 : `1px solid ${t.line}`, borderBottom: narrow ? `1px solid ${t.line}` : 0, overflowY: "auto", padding: "12px 14px", minHeight: 0 }}>
              {loadErr && <div style={box(t.badBg, t.badBd, t.badDark)}>{loadErr}</div>}
              {info && !info.contactsReady && <div style={box(t.warnBg, t.warnBd, t.warnDark)}>Database email partner belum disiapkan (SQL belum dijalankan). Untuk sementara isi email di kolom To pada email-nya.</div>}
              {info?.contactsReady && missing > 0 && <div style={box(t.infoBg, t.infoBd, t.ink2)}>{missing} {own} belum punya email di sheet &ldquo;{CONTACTS_SHEET}&rdquo;. Isi email tambahan di kolom To, atau lengkapi sheet lalu upload ulang.</div>}
              <label style={{ display: "flex", gap: 7, alignItems: "center", cursor: "pointer", margin: "0 0 8px", fontSize: 12.5, color: t.ink2 }}>
                <input type="checkbox" checked={list.length > 0 && sel.size === list.length} onChange={(e) => { setConfirm(false); setSel(e.target.checked ? new Set(list.map((g) => g.name)) : new Set()); }} />
                Semua ikut dikirim ({list.length} {own})
              </label>
              {list.map((g, i) => {
                const on = sel.has(g.name), nTo = info ? toOf(g.name).length : null, isAct = act?.name === g.name;
                return (
                  <div key={g.name} onClick={() => setAi(i)} style={{ cursor: "pointer", border: `1.5px solid ${isAct ? "#32BCAD" : t.line}`, borderRadius: 11, padding: "8px 10px", marginBottom: 7, background: isAct ? "#32BCAD12" : on ? t.surf : t.surf2, opacity: on ? 1 : 0.65 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.name}>{g.name}</div>
                        <div style={{ fontSize: 12, color: t.muted, marginTop: 1 }}>{nTo == null ? "…" : `${nTo} To`} · {g.items.length} invoice · {rpWord(g.amt)}</div>
                      </div>
                      {info && <span style={badge(nTo > 0)}>{nTo > 0 ? "Siap" : "Tidak ada email"}</span>}
                    </div>
                    <label onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex", gap: 6, alignItems: "center", marginTop: 5, fontSize: 12, color: t.ink2, cursor: "pointer" }}>
                      <input type="checkbox" checked={on} onChange={() => toggle(g.name)} aria-label={`${g.name} ikut dikirim`} /> ikut dikirim
                    </label>
                  </div>
                );
              })}
              {list.length === 0 && <div style={{ fontSize: 12.5, color: t.muted }}>Tidak ada invoice yang belum disubmit.</div>}
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: t.ink2, marginBottom: 4 }}>Catatan tambahan (opsional, ikut di semua email)</div>
                <textarea value={note} onChange={(e) => { setNote(e.target.value); setConfirm(false); }} rows={3} maxLength={2000} style={{ ...input, resize: "vertical" }}
                  placeholder="Contoh: Mohon invoice disubmit paling lambat 28 November 2026." />
              </div>
              <TemplateEditor t={t} tpl={tpl} setTpl={setTpl} saved={savedTpl} status={tplStatus} onSave={saveTpl} onReset={resetTpl} busy={tplBusy} />
            </div>

            {/* Kanan: email lengkap partner aktif */}
            <div style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, overflowY: narrow ? "auto" : "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: `1px solid ${t.line}`, flexWrap: "wrap" }}>
                <Button t={t} sm disabled={ai <= 0} onClick={() => setAi((i) => Math.max(0, i - 1))}>‹ Sebelumnya</Button>
                <span style={{ fontSize: 13, fontWeight: 700, color: t.ink, fontVariantNumeric: "tabular-nums" }}>Email {list.length ? Math.min(ai, list.length - 1) + 1 : 0} dari {list.length}</span>
                <Button t={t} sm disabled={ai >= list.length - 1} onClick={() => setAi((i) => Math.min(list.length - 1, i + 1))}>Berikutnya ›</Button>
                <span style={{ flex: 1 }} />
                {act && (actOn ? <span style={badge(info ? toOf(act.name).length > 0 : true)}>{!info || toOf(act.name).length ? "Ikut dikirim" : "Dilewati: tidak ada email"}</span>
                  : <button type="button" onClick={() => toggle(act.name)} style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 99, cursor: "pointer", border: `1px solid ${t.line2}`, background: t.surf3, color: t.ink2 }}>Tidak ikut dikirim · sertakan</button>)}
              </div>
              {act && mail ? (
                <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, padding: "4px 16px 14px" }}>
                  {meta("From", from)}
                  {info ? <AddrRow key={`${act.name}|to`} t={t} label="To" list={toAll(act.name)} max={MAX_REMINDER_TO} onAdd={add(act.name, "to")} onRemove={del(act.name, "to")} placeholder="+ email tambahan (pisahkan koma)" />
                    : meta("To", "Memuat penerima…")}
                  {info && <AddrRow key={`${act.name}|cc`} t={t} label="Cc" list={ccOf(act.name)} onAdd={add(act.name, "cc")} onRemove={del(act.name, "cc")} placeholder="+ email Cc" />}
                  {meta("Subjek", <strong>{mail.subject}</strong>)}
                  <div style={{ flex: 1, minHeight: 360, marginTop: 10, border: `1px solid ${t.line}`, borderRadius: 10, overflow: "hidden", background: "#f3f5f8" }}>
                    <iframe title={`Isi email untuk ${act.name}`} srcDoc={mail.html} sandbox="" style={{ width: "100%", height: "100%", minHeight: 360, border: 0, display: "block", background: "#fff" }} />
                  </div>
                </div>
              ) : <div style={{ padding: 20, fontSize: 13, color: t.muted }}>Pilih {own} di kiri untuk melihat email-nya.</div>}
            </div>
          </div>
        )}

        {!(result && !result.error) && (
          <div style={{ padding: "12px 20px", borderTop: `1px solid ${t.line}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: confirm ? t.warnBg : "transparent" }}>
            {result?.error && <div style={{ ...box(t.badBg, t.badBd, t.badDark), margin: 0, flexBasis: "100%" }}>{result.error}</div>}
            {confirm ? (
              <>
                <span style={{ fontSize: 13, color: t.warnDark, flex: "1 1 260px", fontWeight: 600 }}>
                  Kirim {ready.length} email ke {addrCount} alamat sekarang? Email yang sudah terkirim tidak bisa ditarik kembali.
                </span>
                <Button t={t} onClick={() => setConfirm(false)} disabled={sending}>Kembali</Button>
                <Button t={t} primary onClick={send} disabled={sending}>{sending ? "Mengirim…" : `Ya, kirim ${ready.length} email`}</Button>
              </>
            ) : (
              <>
                <span style={{ fontSize: 12.5, color: t.ink2, flex: "1 1 220px" }}>
                  {!info || !tplInfo ? <span>{!info ? "Memuat penerima…" : "Memuat template email…"}</span> : <><strong style={{ color: t.ink }}>{ready.length} email siap dikirim</strong>{skipped.length ? ` · ${skipped.length} ${own} tanpa email dilewati` : ""}{list.length - sel.size > 0 ? ` · ${list.length - sel.size} tidak ikut` : ""}</>}
                </span>
                <Button t={t} onClick={onClose}>Batal</Button>
                <Button t={t} primary onClick={() => setConfirm(true)} disabled={!info || !tplInfo || !ready.length}>✉ Kirim {ready.length} email</Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Dashboard "Invoice Reminder" ───────────────────────────────────────────
   Visual status pengingat untuk semua tagihan Invoice Not Submitted:
   KPI · per Program (sudah / belum diingatkan) · tabel per partner (data + centang pilih)
   · panel "Kirim Pengingat" terpisah → tampilan review email → kirim. */
const DAY_MS = 864e5;
function Kpi({ label, value, sub, c, t }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: 14, border: `1px solid ${t.line}`, background: t.surf2, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: t.ink2 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: c }} />{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: t.ink, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

export function InvoiceReminderDashboard({ ins, isAg, w = 1200, t, showToast }) {
  const [now, setNow] = useState(() => Date.now());
  const own = isAg ? "agency" : "partner", Own = isAg ? "Agency" : "Partner";
  const segment = isAg ? "agency" : "partner";
  const items = useMemo(() => (ins.remind || []).filter((x) => x.name && x.name !== "—"), [ins]);
  const allOwners = useMemo(() => ins.owners.map((o) => o.name).filter((n) => n && n !== "—"), [ins]);
  const [infoRaw, setInfo] = useState(null);
  const [err, setErr] = useState("");
  const [reload, setReload] = useState(0);
  const [review, setReview] = useState(null);         // null | [nama pemilik] → tampilan review email
  const [pick, setPick] = useState(() => new Set());
  const [prog, setProg] = useState("");
  const [fil, setFil] = useState("all");               // all | never | done | noemail
  const ownersKey = [...new Set(items.map((x) => x.name))].join("\u0001");
  // Data penerima hanya dipakai bila cocok dengan permintaan terakhir (segment + pemilik) —
  // saat ganti Partner/Agency atau filter, tampil "memuat" dulu, bukan status lama / "tanpa email".
  const reqKey = `${segment}\u0002${ownersKey}`;
  const info = infoRaw?._k === reqKey ? infoRaw : null;
  const loading = !info && !err;

  useEffect(() => {
    let alive = true;
    call({ action: "recipients", segment, owners: ownersKey.split("\u0001").filter(Boolean) })
      .then((r) => { if (alive) { setInfo({ ...r, _k: `${segment}\u0002${ownersKey}` }); setErr(""); setNow(Date.now()); } })
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [ownersKey, segment, reload]);

  const remOf = (x) => info?.owners?.[x.name]?.inv?.[invKey(x)] || null;
  const progs = useMemo(() => [...new Set(items.map((x) => x.prog || "—"))].sort(), [items]);
  const scoped = prog ? items.filter((x) => (x.prog || "—") === prog) : items;

  // Per program
  const byProg = useMemo(() => {
    const m = {};
    scoped.forEach((x) => { const k = x.prog || "—"; const r = (m[k] ||= { k, n: 0, amt: 0, remN: 0, remAmt: 0 }); r.n++; r.amt += x.amt; if (remOf(x)) { r.remN++; r.remAmt += x.amt; } });
    return Object.values(m).sort((a, b) => b.amt - a.amt);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, info]);

  // Per partner
  const owners = useMemo(() => {
    const m = {};
    scoped.forEach((x) => {
      const o = (m[x.name] ||= { name: x.name, n: 0, amt: 0, remN: 0, progs: new Set(), oldest: null });
      o.n++; o.amt += x.amt; o.progs.add(x.prog || "—"); if (remOf(x)) o.remN++;
    });
    return Object.values(m).map((o) => {
      const c = info?.owners?.[o.name];
      const last = c?.last || null, emails = (c?.to || []).length;
      const age = last ? Math.floor((now - new Date(last.at).getTime()) / DAY_MS) : null;
      const st = !info ? "loading" : !emails ? "noemail" : !last ? "never" : age > 7 ? "stale" : "recent";
      return { ...o, progs: [...o.progs].sort(), last, emails, age, st };
    }).sort((a, b) => ({ loading: 0, never: 0, stale: 1, noemail: 2, recent: 3 }[a.st] - { loading: 0, never: 0, stale: 1, noemail: 2, recent: 3 }[b.st]) || b.amt - a.amt);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, info]);

  const shown = owners.filter((o) => fil === "all" || (fil === "never" && (o.st === "never")) || (fil === "done" && (o.st === "recent" || o.st === "stale")) || (fil === "noemail" && o.st === "noemail"));
  const tot = { n: scoped.length, amt: scoped.reduce((a, x) => a + x.amt, 0), remN: scoped.filter(remOf).length };
  tot.remAmt = scoped.filter(remOf).reduce((a, x) => a + x.amt, 0);
  const cnt = (s) => owners.filter((o) => o.st === s).length;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const phone = w < 640;
  const tone = { never: [t.badBg, t.badBd, t.badDark, "Belum diingatkan"], stale: [t.warnBg, t.warnBd, t.warnDark, "Diingatkan > 7 hari lalu"], recent: [t.goodBg || t.surf3, t.goodBd || t.line2, t.goodDark, "Sudah diingatkan"], noemail: [t.surf3, t.line2, t.muted, "Email belum ada"], loading: [t.surf3, t.line2, t.muted, "Memuat…"] };
  const togglePick = (n) => setPick((s) => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; });
  // Ringkasan pilihan (semua program milik pemilik terpilih = yang nanti ada di email)
  const picked = useMemo(() => {
    const m = {};
    items.forEach((x) => { if (!pick.has(x.name)) return; const r = (m[x.name] ||= { n: 0, amt: 0 }); r.n++; r.amt += x.amt; });
    const names = Object.keys(m);
    return { names, n: names.reduce((a, k) => a + m[k].n, 0), amt: names.reduce((a, k) => a + m[k].amt, 0),
      noEmail: info ? names.filter((k) => !(info.owners?.[k]?.to || []).length) : [] };
  }, [items, pick, info]);

  const th = { textAlign: "left", padding: "8px 8px", fontSize: 12, fontWeight: 600, color: t.muted, borderBottom: `1px solid ${t.line}`, whiteSpace: "nowrap" };
  const td = { padding: "8px 8px", fontSize: 12.5, color: t.ink2, borderBottom: `1px solid ${t.line}`, verticalAlign: "middle" };
  const fchip = (k, l, n) => (
    <button key={k} type="button" onClick={() => setFil(k)} aria-pressed={fil === k}
      style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, padding: "4px 11px", borderRadius: 99, cursor: "pointer", border: `1px solid ${fil === k ? "#32BCAD" : t.line2}`, background: fil === k ? "#32BCAD1f" : t.surf, color: fil === k ? t.ink : t.ink2 }}>{l} · {loading && k !== "all" ? "…" : n}</button>
  );

  return (
    <div style={{ padding: 18 }}>
      {err && <div style={{ padding: "8px 12px", borderRadius: 10, background: t.badBg, border: `1px solid ${t.badBd}`, color: t.badDark, fontSize: 12.5, marginBottom: 10 }}>{err}</div>}
      {info && !info.contactsReady && <div style={{ padding: "8px 12px", borderRadius: 10, background: t.warnBg, border: `1px solid ${t.warnBd}`, color: t.warnDark, fontSize: 12.5, marginBottom: 10 }}>Database email partner &amp; riwayat pengingat belum disiapkan (SQL belum dijalankan). Status &ldquo;sudah diingatkan&rdquo; baru tercatat setelah itu.</div>}

      <div style={{ display: "grid", gridTemplateColumns: w >= 900 ? "repeat(4,minmax(0,1fr))" : w >= 520 ? "repeat(2,minmax(0,1fr))" : "1fr", gap: 10, marginBottom: 14 }}>
        <Kpi t={t} label="Invoice belum disubmit" c={t.bad} value={tot.n} sub={`${rpWord(tot.amt)} · ${owners.length} ${own}`} />
        <Kpi t={t} label="Sudah diingatkan" c={t.good} value={loading ? "…" : `${pct(tot.remN, tot.n)}%`} sub={loading ? "memuat riwayat pengingat…" : `${tot.remN} invoice · ${rpWord(tot.remAmt)}`} />
        <Kpi t={t} label={`${Own} belum diingatkan`} c={t.warn} value={loading ? "…" : cnt("never") + cnt("stale")} sub={loading ? "memuat…" : `${cnt("never")} belum pernah · ${cnt("stale")} lebih dari 7 hari`} />
        <Kpi t={t} label={`${Own} tanpa email`} c={t.muted} value={loading ? "…" : cnt("noemail")} sub={`isi di sheet ${CONTACTS_SHEET}`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: w >= 1100 ? "minmax(0,5fr) minmax(0,7fr)" : "1fr", gap: 14, alignItems: "start" }}>
        {/* Per program */}
        <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: t.ink }}>Per program</div>
            {prog && <button type="button" onClick={() => setProg("")} style={{ fontFamily: "inherit", fontSize: 12, border: 0, background: "none", color: "#32BCAD", cursor: "pointer", padding: 0 }}>tampilkan semua</button>}
          </div>
          <div style={{ fontSize: 12, color: t.muted, marginBottom: 10, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: t.good }} />Sudah diingatkan</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: t.bad }} />Belum</span>
            <span>· klik program untuk memfilter</span>
          </div>
          {byProg.length === 0 ? <div style={{ fontSize: 12.5, color: t.muted, padding: "8px 0" }}>Tidak ada invoice yang belum disubmit.</div> : (() => {
            const max = Math.max(...byProg.map((r) => r.amt)) || 1;
            return byProg.map((r) => (
              <button key={r.k} type="button" onClick={() => setProg(prog === r.k ? "" : r.k)} aria-pressed={prog === r.k}
                title={`${r.k}: ${r.n} invoice, ${rpWord(r.amt)} · ${r.remN} sudah diingatkan (${rpWord(r.remAmt)})`}
                style={{ display: "block", width: "100%", textAlign: "left", fontFamily: "inherit", background: prog === r.k ? t.surf3 : "transparent", border: 0, borderRadius: 8, padding: "6px 6px", cursor: "pointer", color: t.ink }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}>
                  <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.k}</span>
                  <span style={{ color: t.ink2, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{rpWord(r.amt)} · {loading ? "…" : r.remN}/{r.n}</span>
                </div>
                <div style={{ display: "flex", height: 10, marginTop: 4, borderRadius: 99, background: t.surf3, overflow: "hidden" }}>
                  <div style={{ width: `${(r.remAmt / max) * 100}%`, background: t.good }} />
                  <div style={{ width: `${((r.amt - r.remAmt) / max) * 100}%`, background: loading ? t.line2 : t.bad, marginLeft: r.remAmt && r.amt - r.remAmt ? 2 : 0 }} />
                </div>
              </button>
            ));
          })()}
        </div>

        {/* Per partner */}
        <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, padding: 14, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: t.ink, marginRight: 4 }}>Per {own}{prog ? ` · ${prog}` : ""}</div>
            {fchip("all", "Semua", owners.length)}{fchip("never", "Belum pernah", cnt("never"))}{fchip("done", "Sudah", cnt("recent") + cnt("stale"))}{fchip("noemail", "Tanpa email", cnt("noemail"))}
          </div>
          {shown.length === 0 ? <div style={{ fontSize: 12.5, color: t.muted, padding: "8px 0" }}>Tidak ada {own} di filter ini.</div> : (
            <div style={{ overflowX: "auto", border: `1px solid ${t.line}`, borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={{ ...th, width: 28 }}><input type="checkbox" aria-label="Pilih semua" checked={shown.length > 0 && shown.every((o) => pick.has(o.name))} onChange={(e) => setPick((s) => { const x = new Set(s); shown.forEach((o) => (e.target.checked ? x.add(o.name) : x.delete(o.name))); return x; })} /></th>
                  <th style={th}>{Own}</th>
                  {!phone && <th style={th}>Program</th>}
                  <th style={{ ...th, textAlign: "right" }}>Invoice</th>
                  <th style={th}>Status pengingat</th>
                </tr></thead>
                <tbody>
                  {shown.map((o) => { const [bg, bd, c, l] = tone[o.st]; return (
                    <tr key={o.name}>
                      <td style={td}><input type="checkbox" checked={pick.has(o.name)} onChange={() => togglePick(o.name)} aria-label={`Pilih ${o.name}`} /></td>
                      <td style={{ ...td, color: t.ink, fontWeight: 600, maxWidth: 240 }}>{o.name}<div style={{ fontWeight: 400, fontSize: 12, color: t.muted }}>{!info ? "…" : o.emails ? `${o.emails} email` : "belum ada email"}</div></td>
                      {!phone && <td style={{ ...td, maxWidth: 220 }}>{o.progs.join(", ")}</td>}
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}><div style={{ color: t.ink, fontWeight: 600 }}>{rpWord(o.amt)}</div><div style={{ fontSize: 12, color: t.muted }}>{o.n} invoice{o.remN ? ` · ${o.remN} diingatkan` : ""}</div></td>
                      <td style={td}>
                        <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 99, background: bg, border: `1px solid ${bd}`, color: c, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{l}</span>
                        {o.last && <div style={{ fontSize: 12, color: t.muted, marginTop: 3 }}>{fmtWhen(o.last.at)} · {o.last.count}×</div>}
                      </td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Area kirim: terpisah dari KPI, grafik & tabel. Tombol kirim sendiri hanya ada di tampilan review. */}
      <section aria-label="Kirim pengingat" style={{ position: "sticky", bottom: 12, zIndex: 5, marginTop: 18, border: "1.5px solid #32BCAD", borderRadius: 14, background: t.surf, boxShadow: t.shadow3, padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: t.ink }}>✉ Kirim Pengingat</div>
            <div style={{ fontSize: 12.5, color: t.muted, marginTop: 2 }}>{pick.size ? `Email dicek dulu satu per satu sebelum dikirim.` : `Centang ${own} di tabel di atas, lalu lihat email-nya sebelum kirim.`}</div>
          </div>
          {[[`${Own} dipilih`, picked.names.length], ["Invoice", picked.n], ["Total", rpWord(picked.amt)]].map(([l, v]) => (
            <div key={l} style={{ minWidth: 86 }}>
              <div style={{ fontSize: 12, color: t.muted }}>{l}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: t.ink, fontVariantNumeric: "tabular-nums" }}>{v}</div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {pick.size > 0 ? <Button t={t} sm onClick={() => setPick(new Set())}>Kosongkan pilihan</Button>
              : <Button t={t} sm disabled={!shown.length} onClick={() => setPick(new Set(shown.map((o) => o.name)))}>Pilih semua yang tampil · {shown.length}</Button>}
            <Button t={t} primary disabled={!picked.names.length} onClick={() => setReview(picked.names)}>Lihat email sebelum kirim</Button>
          </div>
        </div>
        {picked.noEmail.length > 0 && (
          <div style={{ marginTop: 10, padding: "7px 11px", borderRadius: 9, background: t.warnBg, border: `1px solid ${t.warnBd}`, color: t.warnDark, fontSize: 12.5, lineHeight: 1.5 }}>
            {picked.noEmail.length} {own} terpilih belum punya email ({picked.noEmail.slice(0, 3).join(", ")}{picked.noEmail.length > 3 ? `, +${picked.noEmail.length - 3} lainnya` : ""}). Isi email-nya di tampilan review, atau akan dilewati.
          </div>
        )}
      </section>

      {review && <InvoiceReminderModal items={items} owners={review} allOwners={allOwners} isAg={isAg} t={t} showToast={showToast}
        onClose={() => { setReview(null); setPick(new Set()); setReload((n) => n + 1); }} />}
    </div>
  );
}
