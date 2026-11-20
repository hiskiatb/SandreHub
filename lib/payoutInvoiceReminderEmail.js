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

export const MAX_REMINDER_ITEMS = 100;   // baris invoice per email
export const MAX_REMINDER_TO = 20;       // penerima per pemilik

// Normalisasi 1 baris invoice dari client (hanya teks, tidak dipercaya)
export function cleanInvoiceItem(x) {
  return {
    title: String(x?.title || "—").slice(0, 300),
    period: String(x?.period || "—").slice(0, 40),
    inv: String(x?.inv || "").slice(0, 80),
    invId: String(x?.invId || "").slice(0, 80),
    amt: Number(x?.amt) || 0,
  };
}

/**
 * @param {object} p
 * @param {"partner"|"agency"} p.segment
 * @param {string} p.owner      nama partner/agency seperti di data
 * @param {Array}  p.items      [{title, period, inv, invId, amt}]
 * @param {string} [p.note]     catatan tambahan dari admin
 * @param {string} [p.senderName]
 * @param {string} [p.link]     tautan SandraHub
 */
export function invoiceReminderEmail({ segment, owner, items = [], note = "", senderName = "", link = "" }) {
  const isAg = segment === "agency";
  const total = items.reduce((a, x) => a + (Number(x.amt) || 0), 0);
  const n = items.length;
  const subject = `Pengingat: ${n} invoice belum disubmit — ${owner}`;
  const rowsHtml = items.map((x, i) => `
      <tr style="background:${i % 2 ? "#f7f9fb" : "#ffffff"}">
        <td style="padding:8px 10px;border-bottom:1px solid #e6eaf0;color:#1f2937">${esc(x.title)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e6eaf0;color:#374151;white-space:nowrap">${esc(x.period)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e6eaf0;color:#374151;white-space:nowrap">${esc(x.invId || x.inv || "—")}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e6eaf0;color:#111827;text-align:right;white-space:nowrap">${esc(rp(x.amt))}</td>
      </tr>`).join("");
  const noteHtml = note ? `<div style="margin:16px 0 0;padding:12px 14px;border-left:3px solid #32BCAD;background:#f0fbfa;color:#1f2937;font-size:14px;line-height:1.55;white-space:pre-wrap">${esc(note)}</div>` : "";
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f3f5f8;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8;padding:28px 0"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e6eaf0">
      <tr><td style="padding:20px 24px;background:#0f2b46;color:#ffffff">
        <div style="font-size:12px;letter-spacing:.6px;text-transform:uppercase;opacity:.75">Payout Tracker · SPM Sumatera</div>
        <div style="font-size:19px;font-weight:700;margin-top:4px">Pengingat submission invoice</div>
      </td></tr>
      <tr><td style="padding:22px 24px;color:#1f2937;font-size:14px;line-height:1.6">
        <p style="margin:0 0 12px">Yth. Tim ${esc(owner)},</p>
        <p style="margin:0 0 12px">Berdasarkan data Payout Tracker, ada <strong>${n} tagihan</strong> ${isAg ? "agency" : "partner"} Anda dengan total <strong>${esc(rp(total))}</strong> yang <strong>invoice-nya belum disubmit</strong>. Mohon invoice untuk tagihan berikut segera disiapkan dan disubmit agar proses pembayaran bisa berjalan.</p>
        ${noteHtml}
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border:1px solid #e6eaf0;border-radius:8px;border-collapse:separate;overflow:hidden;font-size:13px">
          <tr style="background:#eef2f6">
            <th align="left" style="padding:8px 10px;color:#4b5563;font-weight:600">Project</th>
            <th align="left" style="padding:8px 10px;color:#4b5563;font-weight:600">Periode</th>
            <th align="left" style="padding:8px 10px;color:#4b5563;font-weight:600">ID Invoice</th>
            <th align="right" style="padding:8px 10px;color:#4b5563;font-weight:600">Amount</th>
          </tr>${rowsHtml}
          <tr style="background:#eef2f6">
            <td colspan="3" style="padding:8px 10px;font-weight:700;color:#111827">Total</td>
            <td style="padding:8px 10px;font-weight:700;color:#111827;text-align:right;white-space:nowrap">${esc(rp(total))}</td>
          </tr>
        </table>
        <p style="margin:16px 0 0">Jika invoice sudah disubmit, mohon abaikan email ini atau balas dengan nomor invoice-nya supaya data kami perbarui.</p>
        ${link ? `<p style="margin:16px 0 0"><a href="${esc(link)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#32BCAD;color:#ffffff;text-decoration:none;font-weight:700">Buka SandraHub</a></p>` : ""}
        <p style="margin:18px 0 0">Terima kasih,<br/>${esc(senderName || "SPM Sumatera")}<br/><span style="color:#6b7280">SPM Sumatera · SandraHub</span></p>
      </td></tr>
      <tr><td style="padding:12px 24px;background:#f7f9fb;color:#9ca3af;font-size:11.5px">Email ini dikirim dari Payout Tracker SandraHub.</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  const text = [
    `Yth. Tim ${owner},`, "",
    `Ada ${n} tagihan dengan total ${rp(total)} yang invoice-nya belum disubmit. Mohon segera disubmit:`,
    ...(note ? ["", note] : []), "",
    ...items.map((x) => `- ${x.title} | ${x.period} | ${x.invId || x.inv || "—"} | ${rp(x.amt)}`),
    "", `Total: ${rp(total)}`, "",
    "Jika invoice sudah disubmit, mohon abaikan email ini atau balas dengan nomor invoice-nya.",
    ...(link ? ["", link] : []), "",
    "Terima kasih,", senderName || "SPM Sumatera", "SPM Sumatera · SandraHub",
  ].join("\n");
  return { subject, html, text };
}
