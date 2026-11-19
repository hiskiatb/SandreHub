// lib/reportMerge/emailAttachment.js
// Validasi lampiran Excel dari halaman Blast Email Report sebelum diteruskan
// ke Resend. Hasil: { attachments } kalau aman dikirim (bisa kosong kalau
// memang tidak ada lampiran), atau { error } kalau lampirannya rusak, supaya
// email tidak diam-diam terkirim tanpa lampiran.
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export function parseEmailAttachment(attachment) {
  if (attachment === undefined || attachment === null) return { attachments: [] };

  const content = typeof attachment.content === "string" ? attachment.content.trim() : "";
  const filename = String(attachment.filename || "").replace(/[\\/:*?"<>|\r\n]/g, "-").trim();

  if (!/\.xlsx$/i.test(filename)) return { error: "Lampiran harus berupa file .xlsx." };
  if (!content || content.length % 4 !== 0 || !BASE64_RE.test(content)) {
    return { error: "Isi lampiran Excel tidak valid." };
  }
  return { attachments: [{ filename, content }] };
}
