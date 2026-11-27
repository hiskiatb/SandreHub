// lib/payoutInvoiceReminderEmail.js
// Template email "Pengingat: invoice belum disubmit" (Payout Tracker).
// Dipakai di server (kirim) dan di browser (preview), jadi TIDAK boleh import modul server.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rp = (n) => "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");

const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/;
export const normEmail = (s) => String(s || "").trim().toLowerCase();
export const isEmail = (s) => normEmail(s).length <= 254 && EMAIL_RE.test(normEmail(s));
// "a@x.com; b@y.com, c@z.com" → ["a@x.com","b@y.com","c@z.com"] (unik, valid saja)
export const parseEmails = (s) => [...new Set(String(s || "").split(/[\s,;]+/).map(normEmail).filter(isEmail))];

// Kunci 1 tagihan untuk mencocokkan riwayat pengingat: ID Invoice → No Invoice → Project|Periode
export const invKey = (x) => String(x?.invId || x?.inv || `${x?.title || ""}|${x?.period || ""}`).trim().toUpperCase();

export const MAX_REMINDER_ITEMS = 100;   // baris invoice per email
export const MAX_REMINDER_TO = 20;       // penerima per pemilik

// Nominal: angka > 0 = diketahui; selain itu null (tampil "—", tidak dijumlahkan)
const amtOf = (v) => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) && n > 0 ? n : null; };
const rpOr = (n) => (n == null ? "—" : rp(n));

// Normalisasi 1 baris invoice dari client (hanya teks, tidak dipercaya)
export function cleanInvoiceItem(x) {
  return {
    title: String(x?.title || "—").slice(0, 300),
    period: String(x?.period || "—").slice(0, 40),
    inv: String(x?.inv || "").slice(0, 80),
    prog: String(x?.prog || "").slice(0, 80),
    invId: String(x?.invId || "").slice(0, 80),
    amt: amtOf(x?.amt),
  };
}

/* ── Template teks email (bisa diedit admin) ─────────────────────────────────────────────
   Aturan format (sengaja kecil & aman — semua teks di-escape dulu):
     • baris kosong = paragraf baru
     • baris diawali "- " = daftar bullet, "1. " (angka + titik) = daftar bernomor
     • **teks** = tebal
     • {nama} {jumlah} {total} diisi otomatis per penerima
     • [[ ... ]] = bagian opsional, hilang bila {total} di dalamnya tidak diketahui */
export const REMINDER_TPL_MAX = 5000;           // karakter per kolom
export const REMINDER_PLACEHOLDERS = [
  ["{nama}", "nama partner/agency"],
  ["{jumlah}", "jumlah invoice"],
  ["{total}", "total nominal"],
  ["[[ … ]]", "bagian yang hilang bila total tidak diketahui"],
];
export const DEFAULT_REMINDER_TEMPLATE = Object.freeze({
  subject: "Pengingat: {jumlah} invoice belum disubmit — {nama}",
  opening: [
    "Yth. {nama},",
    "",
    "Berdasarkan data Payout Tracker, ada **{jumlah} tagihan** {nama}[[ dengan total **{total}**]] yang **invoice-nya belum disubmit**. Mohon invoice untuk tagihan berikut segera disiapkan dan diupload melalui Link OneDrive yang sebelumnya telah diberikan agar proses pembayaran dapat dilakukan. Jika invoice sudah disubmit, mohon abaikan email ini atau balas dengan nomor invoice-nya supaya data kami perbarui.",
  ].join("\n"),
  terms: [
    "Upload invoice dengan ketentuan berikut:",
    "**📄 Dokumen yang di-upload** (gabungkan jadi 1 PDF, dengan urutan berikut):",
    "Attachment 1",
    "1. Invoice",
    "Attachment 2",
    "1. Invoice",
    "2. Faktur Pajak",
    "3. BAST",
    "4. Surat Pemberitahuan",
    "",
    "**📁 Cara upload:**",
    "- Simpan di folder sesuai Project Title.",
    "- Beri nama file sama dengan Project Title. Contoh: SEPTEMBER2026_SUMATERA_DISTRIBUTION FEE_XXX_MPC_26100XX.pdf",
    "- Pastikan dokumen terbaca jelas dan sudah ditandatangani lengkap.",
  ].join("\n"),
  closing: "Terima kasih,\n\nSales & Distribution — Indosat Circle Sumatera",
  colTitle: "Project Title",
  colPeriod: "Periode",
  colInv: "ID Invoice",
  colAmount: "Amount",
});
export const REMINDER_TPL_FIELDS = Object.keys(DEFAULT_REMINDER_TEMPLATE);
const TPL_LIMIT = { subject: 300, colTitle: 60, colPeriod: 60, colInv: 60, colAmount: 60 };

// Normalisasi template dari client/DB (tidak dipercaya). Kolom bukan string → teks awal;
// subjek & label kolom kosong → teks awal; paragraf boleh dikosongkan.
export function cleanReminderTemplate(t) {
  const out = {};
  REMINDER_TPL_FIELDS.forEach((k) => {
    const raw = t && typeof t === "object" ? t[k] : undefined;
    let v = typeof raw === "string" ? raw.replace(/\r\n?/g, "\n").replace(/\u0000/g, "") : DEFAULT_REMINDER_TEMPLATE[k];
    v = v.slice(0, TPL_LIMIT[k] || REMINDER_TPL_MAX);
    if (TPL_LIMIT[k]) v = v.replace(/\s+/g, " ").trim();
    out[k] = TPL_LIMIT[k] && !v ? DEFAULT_REMINDER_TEMPLATE[k] : v;
  });
  return out;
}
export const isDefaultReminderTemplate = (t) => { const c = cleanReminderTemplate(t); return REMINDER_TPL_FIELDS.every((k) => c[k] === DEFAULT_REMINDER_TEMPLATE[k]); };

// [[...]] opsional: hilang bila berisi {total} padahal total tidak diketahui
const optional = (s, vars) => s.replace(/\[\[([\s\S]*?)\]\]/g, (_, inner) => (vars.total == null && /\{total\}/i.test(inner) ? "" : inner));
const fillText = (s, vars) => optional(s, vars).replace(/\{(nama|jumlah|total)\}/gi, (_, k) => { const v = vars[k.toLowerCase()]; return v == null ? "—" : String(v); });
// 1 baris → HTML aman: escape, **tebal**, lalu placeholder (nilainya di-escape juga; disisipkan setelah format)
function lineHtml(s, vars) {
  return esc(optional(s, vars))
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\{(nama|jumlah|total)\}/gi, (_, k) => { const v = vars[k.toLowerCase()]; return esc(v == null ? "—" : v); });
}
const lineText = (s, vars) => fillText(s, vars).replace(/\*\*(.+?)\*\*/g, "$1");

const LIST_RE = /^\s*(?:(-|\*|•)|(\d{1,3})[.)])\s+(.*)$/;
// Teks multi-baris → HTML: paragraf (baris kosong), daftar (- / 1.), tebal (**)
function blocksHtml(src, vars) {
  const out = [];
  let list = null, gap = false;
  const close = () => { if (list) { out.push(`<${list.tag} style="margin:4px 0 4px;padding-left:22px">${list.items.join("")}</${list.tag}>`); list = null; } };
  String(src || "").split("\n").forEach((ln) => {
    if (!ln.trim()) { close(); gap = out.length > 0; return; }
    const m = ln.match(LIST_RE);
    if (m) {
      const tag = m[1] ? "ul" : "ol";
      if (list && (list.tag !== tag || gap)) close();
      if (!list) { list = { tag, items: [] }; if (gap) out.push('<div style="height:8px;line-height:8px">&nbsp;</div>'); }
      list.items.push(`<li>${lineHtml(m[3], vars)}</li>`);
    } else {
      close();
      out.push(`<p style="margin:${out.length ? (gap ? "12px" : "4px") : "0"} 0 0">${lineHtml(ln.trim(), vars)}</p>`);
    }
    gap = false;
  });
  close();
  return out.join("\n        ");
}
const blocksText = (src, vars) => String(src || "").split("\n").map((ln) => (ln.trim() ? lineText(ln.replace(/\s+$/, ""), vars) : "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();

/**
 * @param {object} p
 * @param {"partner"|"agency"} p.segment
 * @param {string} p.owner      nama partner/agency seperti di data
 * @param {Array}  p.items      [{title, period, inv, invId, amt}] — amt null = nominal belum diketahui
 * @param {string} [p.note]     catatan tambahan dari admin
 * @param {object} [p.template] teks email hasil edit (lihat DEFAULT_REMINDER_TEMPLATE); kosong = teks awal
 */
export function invoiceReminderEmail({ owner, items = [], note = "", template }) {
  const T = cleanReminderTemplate(template);
  const known = items.map((x) => amtOf(x.amt)).filter((v) => v != null);
  const total = known.length ? known.reduce((a, v) => a + v, 0) : null;
  const n = items.length;
  const vars = { nama: owner, jumlah: n, total: total == null ? null : rp(total) };
  const subject = lineText(T.subject, vars).replace(/\s+/g, " ").trim().slice(0, 300) || `Pengingat: ${n} invoice belum disubmit — ${owner}`;
  const ref = (x) => x.invId || x.inv || "—";
  const td = "padding:8px 10px;border-bottom:1px solid #D3ECE8";
  const th = "padding:9px 10px;color:#ffffff;font-weight:700;background:#1A9E90";
  const rowsHtml = items.map((x, i) => `
      <tr style="background:${i % 2 ? "#F0FAF8" : "#ffffff"}" bgcolor="${i % 2 ? "#F0FAF8" : "#ffffff"}">
        <td style="${td};color:#1f2937">${esc(x.title)}</td>
        <td style="${td};color:#374151;white-space:nowrap">${esc(x.period)}</td>
        <td style="${td};color:#374151;white-space:nowrap">${esc(ref(x))}</td>
        <td style="${td};color:#111827;text-align:right;white-space:nowrap">${esc(rpOr(amtOf(x.amt)))}</td>
      </tr>`).join("");
  const totalRow = total == null ? "" : `
          <tr style="background:#E0F4F1">
            <td colspan="3" bgcolor="#E0F4F1" style="padding:8px 10px;font-weight:700;color:#0F6B61;border-top:2px solid #1A9E90">Total</td>
            <td bgcolor="#E0F4F1" style="padding:8px 10px;font-weight:700;color:#0F6B61;text-align:right;white-space:nowrap;border-top:2px solid #1A9E90">${esc(rp(total))}</td>
          </tr>`;
  const noteHtml = note ? `<div style="margin:16px 0 0;padding:12px 14px;border-left:3px solid #32BCAD;background:#f0fbfa;color:#1f2937;font-size:14px;line-height:1.55;white-space:pre-wrap">${esc(note)}</div>` : "";
  const section = (src, top) => (String(src || "").trim() ? `<div style="margin:${top} 0 0">
        ${blocksHtml(src, vars)}
        </div>` : "");
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f3f5f8;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8;padding:28px 0"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e6eaf0">
      <tr><td style="padding:22px 24px;color:#1f2937;font-size:14px;line-height:1.6">
        ${section(T.opening, "0")}
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border:1px solid #BFE3DE;border-top:3px solid #C6168D;border-radius:8px;border-collapse:separate;overflow:hidden;font-size:13px">
          <tr style="background:#1A9E90" bgcolor="#1A9E90">
            <th align="left" bgcolor="#1A9E90" style="${th}">${esc(T.colTitle)}</th>
            <th align="left" bgcolor="#1A9E90" style="${th}">${esc(T.colPeriod)}</th>
            <th align="left" bgcolor="#1A9E90" style="${th}">${esc(T.colInv)}</th>
            <th align="right" bgcolor="#1A9E90" style="${th}">${esc(T.colAmount)}</th>
          </tr>${rowsHtml}${totalRow}
        </table>
        ${noteHtml}
        ${section(T.terms, "16px")}
        ${section(T.closing, "18px")}
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  const opening = blocksText(T.opening, vars), terms = blocksText(T.terms, vars), closing = blocksText(T.closing, vars);
  const text = [
    ...(opening ? [opening, ""] : []),
    `${T.colTitle} | ${T.colPeriod} | ${T.colInv} | ${T.colAmount}`,
    ...items.map((x) => `- ${x.title} | ${x.period} | ${ref(x)} | ${rpOr(amtOf(x.amt))}`),
    ...(total == null ? [] : [`Total: ${rp(total)}`]),
    ...(note ? ["", note] : []),
    ...(terms ? ["", terms] : []),
    ...(closing ? ["", closing] : []),
  ].join("\n");
  return { subject, html, text };
}
