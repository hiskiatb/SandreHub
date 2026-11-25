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

/**
 * @param {object} p
 * @param {"partner"|"agency"} p.segment
 * @param {string} p.owner      nama partner/agency seperti di data
 * @param {Array}  p.items      [{title, period, inv, invId, amt}] — amt null = nominal belum diketahui
 * @param {string} [p.note]     catatan tambahan dari admin
 */
export function invoiceReminderEmail({ owner, items = [], note = "" }) {
  const known = items.map((x) => amtOf(x.amt)).filter((v) => v != null);
  const total = known.length ? known.reduce((a, v) => a + v, 0) : null;
  const n = items.length;
  const subject = `Pengingat: ${n} invoice belum disubmit — ${owner}`;
  const ref = (x) => x.invId || x.inv || "—";
  const td = "padding:8px 10px;border-bottom:1px solid #e6eaf0";
  const rowsHtml = items.map((x, i) => `
      <tr style="background:${i % 2 ? "#f7f9fb" : "#ffffff"}">
        <td style="${td};color:#1f2937">${esc(x.title)}</td>
        <td style="${td};color:#374151;white-space:nowrap">${esc(x.period)}</td>
        <td style="${td};color:#374151;white-space:nowrap">${esc(ref(x))}</td>
        <td style="${td};color:#111827;text-align:right;white-space:nowrap">${esc(rpOr(amtOf(x.amt)))}</td>
      </tr>`).join("");
  const totalRow = total == null ? "" : `
          <tr style="background:#eef2f6">
            <td colspan="3" style="padding:8px 10px;font-weight:700;color:#111827">Total</td>
            <td style="padding:8px 10px;font-weight:700;color:#111827;text-align:right;white-space:nowrap">${esc(rp(total))}</td>
          </tr>`;
  const totalPhrase = total == null ? "" : ` dengan total <strong>${esc(rp(total))}</strong>`;
  const noteHtml = note ? `<div style="margin:16px 0 0;padding:12px 14px;border-left:3px solid #32BCAD;background:#f0fbfa;color:#1f2937;font-size:14px;line-height:1.55;white-space:pre-wrap">${esc(note)}</div>` : "";
  const ol = "margin:4px 0 8px;padding-left:22px";
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f3f5f8;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8;padding:28px 0"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e6eaf0">
      <tr><td style="padding:22px 24px;color:#1f2937;font-size:14px;line-height:1.6">
        <p style="margin:0 0 12px">Yth. ${esc(owner)},</p>
        <p style="margin:0 0 12px">Berdasarkan data Payout Tracker, ada <strong>${n} tagihan</strong> ${esc(owner)}${totalPhrase} yang <strong>invoice-nya belum disubmit</strong>. Mohon invoice untuk tagihan berikut segera disiapkan dan diupload melalui Link OneDrive yang sebelumnya telah diberikan agar proses pembayaran dapat dilakukan.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;border:1px solid #e6eaf0;border-radius:8px;border-collapse:separate;overflow:hidden;font-size:13px">
          <tr style="background:#eef2f6">
            <th align="left" style="padding:8px 10px;color:#4b5563;font-weight:600">Project</th>
            <th align="left" style="padding:8px 10px;color:#4b5563;font-weight:600">Periode</th>
            <th align="left" style="padding:8px 10px;color:#4b5563;font-weight:600">ID Invoice</th>
            <th align="right" style="padding:8px 10px;color:#4b5563;font-weight:600">Amount</th>
          </tr>${rowsHtml}${totalRow}
        </table>
        ${noteHtml}
        <p style="margin:16px 0 0">Jika invoice sudah disubmit, mohon abaikan email ini atau balas dengan nomor invoice-nya supaya data kami perbarui.</p>
        <p style="margin:16px 0 6px">Upload invoice dengan ketentuan berikut:</p>
        <p style="margin:10px 0 4px"><strong>📄 Dokumen yang di-upload</strong> (gabungkan jadi 1 PDF, dengan urutan berikut):</p>
        <p style="margin:6px 0 0">Attachment 1</p>
        <ol style="${ol}"><li>Invoice</li></ol>
        <p style="margin:6px 0 0">Attachment 2</p>
        <ol style="${ol}"><li>Invoice</li><li>Faktur Pajak</li><li>BAST</li><li>Surat Pemberitahuan</li></ol>
        <p style="margin:12px 0 4px"><strong>📁 Cara upload:</strong></p>
        <ul style="${ol}">
          <li>Simpan di folder sesuai Project Title.</li>
          <li>Beri nama file sama dengan Project Title. Contoh: SEPTEMBER2026_SUMATERA_DISTRIBUTION FEE_XXX_MPC_26100XX.pdf</li>
          <li>Pastikan dokumen terbaca jelas dan sudah ditandatangani lengkap.</li>
        </ul>
        <p style="margin:18px 0 0">Terima kasih,</p>
        <p style="margin:12px 0 0">Sales &amp; Distribution — Indosat Circle Sumatera</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  const text = [
    `Yth. ${owner},`, "",
    `Berdasarkan data Payout Tracker, ada ${n} tagihan ${owner}${total == null ? "" : ` dengan total ${rp(total)}`} yang invoice-nya belum disubmit. Mohon invoice untuk tagihan berikut segera disiapkan dan diupload melalui Link OneDrive yang sebelumnya telah diberikan agar proses pembayaran dapat dilakukan.`, "",
    "Project | Periode | ID Invoice | Amount",
    ...items.map((x) => `- ${x.title} | ${x.period} | ${ref(x)} | ${rpOr(amtOf(x.amt))}`),
    ...(total == null ? [] : [`Total: ${rp(total)}`]),
    ...(note ? ["", note] : []), "",
    "Jika invoice sudah disubmit, mohon abaikan email ini atau balas dengan nomor invoice-nya supaya data kami perbarui.", "",
    "Upload invoice dengan ketentuan berikut:",
    "📄 Dokumen yang di-upload (gabungkan jadi 1 PDF, dengan urutan berikut):",
    "Attachment 1", "1. Invoice",
    "Attachment 2", "1. Invoice", "2. Faktur Pajak", "3. BAST", "4. Surat Pemberitahuan", "",
    "📁 Cara upload:",
    "- Simpan di folder sesuai Project Title.",
    "- Beri nama file sama dengan Project Title. Contoh: SEPTEMBER2026_SUMATERA_DISTRIBUTION FEE_XXX_MPC_26100XX.pdf",
    "- Pastikan dokumen terbaca jelas dan sudah ditandatangani lengkap.", "",
    "Terima kasih,", "",
    "Sales & Distribution — Indosat Circle Sumatera",
  ].join("\n");
  return { subject, html, text };
}
