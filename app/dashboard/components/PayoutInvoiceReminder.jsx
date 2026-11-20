"use client";
// Payout Tracker: email pengingat "Invoice Not Submitted" ke partner/agency.
//  • Sumber email = sheet "Master Mapping" di Excel upload (readContactsSheet), disimpan saat Publish (saveContacts).
//  • Dikirim dari Dashboard → Outstanding (InvoiceReminderModal).
// Hanya admin SPM & admin internal Indosat (dicek juga di server: /api/payout-docs/invoice-reminders).

import React, { useEffect, useMemo, useState } from "react";
import supabase from "../../../lib/supabase";
import { invoiceReminderEmail, parseEmails, invKey, MAX_REMINDER_TO } from "../../../lib/payoutInvoiceReminderEmail";

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

/** Tombol pembuka modal (toolbar Outstanding & baris grup). */
export function ReminderButton({ t, onClick, sm, children }) {
  return <Button t={t} sm={sm} onClick={(e) => { e.stopPropagation(); onClick(); }}>✉ {children}</Button>;
}

const Chip = ({ t, children, muted }) => (
  <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 99, border: `1px solid ${t.line2}`, background: muted ? "transparent" : t.surf3, color: muted ? t.muted : t.ink2, fontSize: 12 }}>{children}</span>
);

/**
 * @param items      baris Outstanding berstatus Invoice Not Submitted: {name,title,period,inv,invId,amt}
 * @param owners     pemilik yang dipilih saat dibuka ([] = semua)
 * @param allOwners  semua nama pemilik di data (untuk template sheet Email Partner)
 */
export function InvoiceReminderModal({ items, owners: initial, allOwners = [], isAg, t, onClose, showToast }) {
  const segment = isAg ? "agency" : "partner";
  const own = isAg ? "agency" : "partner";
  const groups = useMemo(() => {
    const g = {};
    items.forEach((x) => { (g[x.name] ||= { name: x.name, items: [], amt: 0 }); g[x.name].items.push(x); g[x.name].amt += x.amt; });
    return Object.values(g).filter((x) => x.name && x.name !== "—").sort((a, b) => b.amt - a.amt);
  }, [items]);

  const [info, setInfo] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [sel, setSel] = useState(() => new Set(initial?.length ? initial : groups.map((x) => x.name)));
  const [extra, setExtra] = useState({});          // pemilik → email tambahan (sekali kirim, tidak disimpan)
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const ownersKey = allOwners.join("\u0001");   // dep stabil (array baru tiap render)
  useEffect(() => {
    let alive = true;
    const names = [...new Set([...groups.map((x) => x.name), ...ownersKey.split("\u0001").filter(Boolean)])];
    call({ action: "recipients", segment, owners: names })
      .then((r) => { if (alive) setInfo(r); })
      .catch((e) => alive && setLoadErr(e.message));
    return () => { alive = false; };
  }, [groups, ownersKey, segment]);

  useEffect(() => { const k = (e) => e.key === "Escape" && !sending && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose, sending]);

  const toOf = (name) => [...new Set([...(info?.owners?.[name]?.to || []), ...parseEmails(extra[name])])].slice(0, MAX_REMINDER_TO);
  const ccOf = (name) => (info?.owners?.[name]?.cc || []).filter((e) => !toOf(name).includes(e));
  const chosen = groups.filter((g) => sel.has(g.name));
  const ready = chosen.filter((g) => toOf(g.name).length);
  const noTo = chosen.filter((g) => !toOf(g.name).length);
  const toggle = (name) => setSel((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });

  const send = async () => {
    if (!ready.length || sending) return;
    setSending(true);
    try {
      const r = await call({ action: "send", segment, note, items: ready.map((g) => ({
        owner: g.name, to: toOf(g.name), cc: ccOf(g.name),
        invoices: g.items.map((x) => ({ title: x.title, period: x.period, inv: x.inv, invId: x.invId, prog: x.prog, amt: x.amt })),
      })) });
      setResult(r);
      showToast?.(r.failed ? `${r.sent} terkirim, ${r.failed} gagal` : `Pengingat terkirim ke ${r.sent} ${own}`, r.failed ? "error" : "success");
    } catch (e) { showToast?.(e.message, "error"); setResult({ error: e.message }); }
    setSending(false);
  };

  const pv = preview && groups.find((g) => g.name === preview);
  const pvMail = pv && invoiceReminderEmail({ segment, owner: pv.name, items: pv.items, note, senderName: "", link: "" });
  const input = { fontFamily: "inherit", fontSize: 12.5, padding: "6px 9px", borderRadius: 8, border: `1px solid ${t.line2}`, background: t.surf, color: t.ink, width: "100%", boxSizing: "border-box" };
  const box = (bg, bd, c) => ({ padding: "8px 12px", borderRadius: 10, background: bg, border: `1px solid ${bd}`, color: c, fontSize: 12.5, marginBottom: 10, lineHeight: 1.5 });
  const missing = info?.contactsReady ? groups.filter((g) => !(info.owners?.[g.name]?.to || []).length).length : 0;

  return (
    <div onClick={() => !sending && onClose()} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,20,30,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label="Kirim pengingat invoice" onClick={(e) => e.stopPropagation()}
        style={{ background: t.surf, border: `1px solid ${t.line2}`, borderRadius: 16, boxShadow: t.shadow3, width: "min(860px, 100%)", maxHeight: "88vh", display: "flex", flexDirection: "column", color: t.ink }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 300px", minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Kirim pengingat invoice belum disubmit</div>
            <div style={{ fontSize: 12.5, color: t.muted, marginTop: 2 }}>Satu email per {own}, berisi daftar invoice yang belum disubmit. Alamat diambil dari sheet &ldquo;{CONTACTS_SHEET}&rdquo; di file upload.</div>
          </div>
          <Button t={t} sm onClick={() => downloadTemplate([...new Set([...allOwners, ...groups.map((g) => g.name)])].sort(), info, isAg)} title={`Excel sheet "${CONTACTS_SHEET}" berisi semua ${own} di data, siap diisi lalu ditambahkan ke file upload`}>Unduh template email</Button>
          <Button t={t} sm onClick={onClose} disabled={sending}>Tutup</Button>
        </div>

        {result && !result.error ? (
          <div style={{ padding: 20, overflowY: "auto" }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{result.sent} terkirim{result.failed ? `, ${result.failed} gagal` : ""}</div>
            {result.results.map((r) => (
              <div key={r.owner} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: `1px solid ${t.line}`, fontSize: 13, flexWrap: "wrap" }}>
                <span style={{ color: r.ok ? t.goodDark : t.badDark, fontWeight: 700 }}>{r.ok ? "✓" : "✕"}</span>
                <span style={{ fontWeight: 600, flex: "1 1 200px", minWidth: 0 }}>{r.owner}</span>
                <span style={{ color: r.ok ? t.muted : t.badDark, wordBreak: "break-all" }}>{r.ok ? [...(r.to || []), ...(r.cc || []).map((e) => `cc ${e}`)].join(", ") : r.error}</span>
              </div>
            ))}
            {!result.logReady && <div style={{ fontSize: 12, color: t.muted, marginTop: 10 }}>Riwayat pengingat belum tersimpan karena tabelnya belum dibuat di database.</div>}
          </div>
        ) : (
          <div style={{ padding: "14px 20px", overflowY: "auto", flex: 1 }}>
            {loadErr && <div style={box(t.badBg, t.badBd, t.badDark)}>{loadErr}</div>}
            {info && !info.contactsReady && <div style={box(t.warnBg, t.warnBd, t.warnDark)}>Database email partner belum disiapkan (SQL belum dijalankan). Untuk sementara isi email manual di kolom &ldquo;Email tambahan&rdquo;.</div>}
            {info?.contactsReady && missing > 0 && <div style={box(t.infoBg, t.infoBd, t.ink2)}>{missing} {own} belum punya email. Tambahkan di sheet &ldquo;{CONTACTS_SHEET}&rdquo; (pakai tombol Unduh template email), lalu upload ulang di menu Upload &amp; Publish. Bisa juga isi email tambahan di bawah untuk kiriman kali ini.</div>}
            {!info && !loadErr && <div style={{ fontSize: 13, color: t.muted, padding: "10px 0" }}>Memuat penerima…</div>}

            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer", margin: "4px 0 8px", fontSize: 12.5, color: t.ink2 }}>
              <input type="checkbox" checked={sel.size === groups.length} onChange={(e) => setSel(e.target.checked ? new Set(groups.map((g) => g.name)) : new Set())} />
              Pilih semua ({groups.length} {own})
            </label>

            {groups.map((g) => {
              const o = info?.owners?.[g.name], on = sel.has(g.name), to = toOf(g.name), cc = ccOf(g.name);
              return (
                <div key={g.name} style={{ border: `1px solid ${on ? t.line2 : t.line}`, borderRadius: 12, padding: "10px 12px", marginBottom: 8, background: on ? t.surf : t.surf2, opacity: on ? 1 : 0.7 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <input type="checkbox" checked={on} onChange={() => toggle(g.name)} aria-label={`Pilih ${g.name}`} />
                    <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{g.name}{o?.pic ? <span style={{ fontWeight: 500, color: t.muted }}> · PIC {o.pic}</span> : null}</div>
                      <div style={{ fontSize: 12, color: t.muted }}>{g.items.length} invoice · {rpWord(g.amt)}{o?.last ? ` · terakhir diingatkan ${fmtWhen(o.last.at)}${o.last.by ? ` oleh ${o.last.by}` : ""} (${o.last.count}×)` : info?.logReady ? " · belum pernah diingatkan" : ""}</div>
                    </div>
                    <Button t={t} sm onClick={() => setPreview(preview === g.name ? null : g.name)}>{preview === g.name ? "Tutup preview" : "Preview"}</Button>
                  </div>
                  {on && (
                    <div style={{ marginTop: 8, paddingLeft: 26, display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 12 }}>
                        <span style={{ color: t.muted, minWidth: 22 }}>To</span>
                        {!info ? <span style={{ color: t.muted }}>…</span> : (o?.to || []).length ? o.to.map((e) => <Chip key={e} t={t}>{e}</Chip>) : <Chip t={t} muted>belum ada di sheet {CONTACTS_SHEET}</Chip>}
                        {cc.length > 0 && <><span style={{ color: t.muted, marginLeft: 6 }}>Cc</span>{cc.map((e) => <Chip key={e} t={t}>{e}</Chip>)}</>}
                      </div>
                      <input style={input} value={extra[g.name] || ""} onChange={(e) => setExtra((s) => ({ ...s, [g.name]: e.target.value }))}
                        placeholder="Email tambahan untuk kiriman ini (pisahkan dengan koma)" aria-label={`Email tambahan ${g.name}`} />
                      {!to.length && info && <div style={{ fontSize: 12, color: t.badDark }}>Belum ada penerima, {own} ini akan dilewati.</div>}
                    </div>
                  )}
                  {preview === g.name && pvMail && (
                    <div style={{ marginTop: 10, border: `1px solid ${t.line}`, borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ padding: "6px 10px", fontSize: 12, background: t.surf2, color: t.ink2, wordBreak: "break-all" }}><strong>Subjek:</strong> {pvMail.subject} · <strong>To:</strong> {to.join(", ") || "—"}{cc.length ? <> · <strong>Cc:</strong> {cc.join(", ")}</> : null}</div>
                      <iframe title={`Preview ${g.name}`} srcDoc={pvMail.html} sandbox="" style={{ width: "100%", height: 420, border: 0, background: "#fff" }} />
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: t.ink2, marginBottom: 4 }}>Catatan tambahan (opsional, ikut di semua email)</div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} style={{ ...input, resize: "vertical" }}
                placeholder="Contoh: Mohon invoice disubmit paling lambat 28 November 2026." />
            </div>
            {result?.error && <div style={{ ...box(t.badBg, t.badBd, t.badDark), marginTop: 10 }}>{result.error}</div>}
          </div>
        )}

        {!(result && !result.error) && (
          <div style={{ padding: "12px 20px", borderTop: `1px solid ${t.line}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, color: t.ink2, flex: "1 1 200px" }}>
              {ready.length} email siap dikirim{noTo.length ? ` · ${noTo.length} ${own} tanpa email dilewati` : ""}
            </span>
            <Button t={t} onClick={onClose} disabled={sending}>Batal</Button>
            <Button t={t} primary onClick={send} disabled={!info || !ready.length || sending}>{sending ? "Mengirim…" : `Kirim ${ready.length} pengingat`}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Dashboard "Invoice Reminder" ───────────────────────────────────────────
   Visual status pengingat untuk semua tagihan Invoice Not Submitted:
   KPI · per Program (sudah / belum diingatkan) · tabel per partner (bulk & per partner). */
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
  const items = useMemo(() => ins.open.filter((x) => x.ns && x.name && x.name !== "—"), [ins]);
  const allOwners = useMemo(() => ins.owners.map((o) => o.name).filter((n) => n && n !== "—"), [ins]);
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState("");
  const [reload, setReload] = useState(0);
  const [modal, setModal] = useState(null);           // null | [nama pemilik]
  const [pick, setPick] = useState(() => new Set());
  const [prog, setProg] = useState("");
  const [fil, setFil] = useState("all");               // all | never | done | noemail
  const ownersKey = [...new Set(items.map((x) => x.name))].join("\u0001");

  useEffect(() => {
    let alive = true;
    call({ action: "recipients", segment, owners: ownersKey.split("\u0001").filter(Boolean) })
      .then((r) => { if (alive) { setInfo(r); setErr(""); setNow(Date.now()); } })
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
      const st = !emails ? "noemail" : !last ? "never" : age > 7 ? "stale" : "recent";
      return { ...o, progs: [...o.progs].sort(), last, emails, age, st };
    }).sort((a, b) => ({ never: 0, stale: 1, noemail: 2, recent: 3 }[a.st] - { never: 0, stale: 1, noemail: 2, recent: 3 }[b.st]) || b.amt - a.amt);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, info]);

  const shown = owners.filter((o) => fil === "all" || (fil === "never" && (o.st === "never")) || (fil === "done" && (o.st === "recent" || o.st === "stale")) || (fil === "noemail" && o.st === "noemail"));
  const tot = { n: scoped.length, amt: scoped.reduce((a, x) => a + x.amt, 0), remN: scoped.filter(remOf).length };
  tot.remAmt = scoped.filter(remOf).reduce((a, x) => a + x.amt, 0);
  const cnt = (s) => owners.filter((o) => o.st === s).length;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const phone = w < 640;
  const tone = { never: [t.badBg, t.badBd, t.badDark, "Belum diingatkan"], stale: [t.warnBg, t.warnBd, t.warnDark, "Diingatkan > 7 hari lalu"], recent: [t.goodBg || t.surf3, t.goodBd || t.line2, t.goodDark, "Sudah diingatkan"], noemail: [t.surf3, t.line2, t.muted, "Email belum ada"] };
  const togglePick = (n) => setPick((s) => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; });
  const sendable = shown.filter((o) => o.emails);
  const openFor = (names) => setModal(names);

  const th = { textAlign: "left", padding: "8px 8px", fontSize: 12, fontWeight: 600, color: t.muted, borderBottom: `1px solid ${t.line}`, whiteSpace: "nowrap" };
  const td = { padding: "8px 8px", fontSize: 12.5, color: t.ink2, borderBottom: `1px solid ${t.line}`, verticalAlign: "middle" };
  const fchip = (k, l, n) => (
    <button key={k} type="button" onClick={() => setFil(k)} aria-pressed={fil === k}
      style={{ fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, padding: "4px 11px", borderRadius: 99, cursor: "pointer", border: `1px solid ${fil === k ? "#32BCAD" : t.line2}`, background: fil === k ? "#32BCAD1f" : t.surf, color: fil === k ? t.ink : t.ink2 }}>{l} · {n}</button>
  );

  return (
    <div style={{ padding: 18 }}>
      {err && <div style={{ padding: "8px 12px", borderRadius: 10, background: t.badBg, border: `1px solid ${t.badBd}`, color: t.badDark, fontSize: 12.5, marginBottom: 10 }}>{err}</div>}
      {info && !info.contactsReady && <div style={{ padding: "8px 12px", borderRadius: 10, background: t.warnBg, border: `1px solid ${t.warnBd}`, color: t.warnDark, fontSize: 12.5, marginBottom: 10 }}>Database email partner &amp; riwayat pengingat belum disiapkan (SQL belum dijalankan). Status &ldquo;sudah diingatkan&rdquo; baru tercatat setelah itu.</div>}

      <div style={{ display: "grid", gridTemplateColumns: w >= 900 ? "repeat(4,minmax(0,1fr))" : w >= 520 ? "repeat(2,minmax(0,1fr))" : "1fr", gap: 10, marginBottom: 14 }}>
        <Kpi t={t} label="Invoice belum disubmit" c={t.bad} value={tot.n} sub={`${rpWord(tot.amt)} · ${owners.length} ${own}`} />
        <Kpi t={t} label="Sudah diingatkan" c={t.good} value={`${pct(tot.remN, tot.n)}%`} sub={`${tot.remN} invoice · ${rpWord(tot.remAmt)}`} />
        <Kpi t={t} label={`${Own} belum diingatkan`} c={t.warn} value={cnt("never") + cnt("stale")} sub={`${cnt("never")} belum pernah · ${cnt("stale")} lebih dari 7 hari`} />
        <Kpi t={t} label={`${Own} tanpa email`} c={t.muted} value={cnt("noemail")} sub={`isi di sheet ${CONTACTS_SHEET}`} />
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
                  <span style={{ color: t.ink2, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{rpWord(r.amt)} · {r.remN}/{r.n}</span>
                </div>
                <div style={{ display: "flex", height: 10, marginTop: 4, borderRadius: 99, background: t.surf3, overflow: "hidden" }}>
                  <div style={{ width: `${(r.remAmt / max) * 100}%`, background: t.good }} />
                  <div style={{ width: `${((r.amt - r.remAmt) / max) * 100}%`, background: t.bad, marginLeft: r.remAmt && r.amt - r.remAmt ? 2 : 0 }} />
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <Button t={t} sm primary disabled={!pick.size} onClick={() => openFor([...pick])}>✉ Ingatkan terpilih · {pick.size}</Button>
            <Button t={t} sm disabled={!sendable.length} onClick={() => openFor(sendable.map((o) => o.name))}>✉ Ingatkan semua yang tampil · {sendable.length}</Button>
            {pick.size > 0 && <Button t={t} sm onClick={() => setPick(new Set())}>Batal pilih</Button>}
          </div>
          {shown.length === 0 ? <div style={{ fontSize: 12.5, color: t.muted, padding: "8px 0" }}>Tidak ada {own} di filter ini.</div> : (
            <div style={{ overflowX: "auto", border: `1px solid ${t.line}`, borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={{ ...th, width: 28 }}><input type="checkbox" aria-label="Pilih semua" checked={sendable.length > 0 && sendable.every((o) => pick.has(o.name))} onChange={(e) => setPick(e.target.checked ? new Set(sendable.map((o) => o.name)) : new Set())} /></th>
                  <th style={th}>{Own}</th>
                  {!phone && <th style={th}>Program</th>}
                  <th style={{ ...th, textAlign: "right" }}>Invoice</th>
                  <th style={th}>Status pengingat</th>
                  <th style={th} />
                </tr></thead>
                <tbody>
                  {shown.map((o) => { const [bg, bd, c, l] = tone[o.st]; return (
                    <tr key={o.name}>
                      <td style={td}><input type="checkbox" disabled={!o.emails} checked={pick.has(o.name)} onChange={() => togglePick(o.name)} aria-label={`Pilih ${o.name}`} /></td>
                      <td style={{ ...td, color: t.ink, fontWeight: 600, maxWidth: 240 }}>{o.name}<div style={{ fontWeight: 400, fontSize: 12, color: t.muted }}>{o.emails ? `${o.emails} email` : "belum ada email"}</div></td>
                      {!phone && <td style={{ ...td, maxWidth: 220 }}>{o.progs.join(", ")}</td>}
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}><div style={{ color: t.ink, fontWeight: 600 }}>{rpWord(o.amt)}</div><div style={{ fontSize: 12, color: t.muted }}>{o.n} invoice{o.remN ? ` · ${o.remN} diingatkan` : ""}</div></td>
                      <td style={td}>
                        <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 99, background: bg, border: `1px solid ${bd}`, color: c, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{l}</span>
                        {o.last && <div style={{ fontSize: 12, color: t.muted, marginTop: 3 }}>{fmtWhen(o.last.at)} · {o.last.count}×</div>}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}><Button t={t} sm disabled={!o.emails} title={o.emails ? undefined : `Tambahkan email di sheet ${CONTACTS_SHEET}`} onClick={() => openFor([o.name])}>✉ Ingatkan</Button></td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {modal && <InvoiceReminderModal items={items} owners={modal} allOwners={allOwners} isAg={isAg} t={t} showToast={showToast}
        onClose={() => { setModal(null); setPick(new Set()); setReload((n) => n + 1); }} />}
    </div>
  );
}
