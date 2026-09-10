// lib/reportMerge/letters.js
// Helper bersama untuk fitur "Buat Surat" (generate PDF, approval, blast) —
// port mekanis dari server.js standalone, diadaptasi supaya menerima
// `supabaseAdmin` (dari requireReportMergeAccess) alih-alih client
// module-level, dan memakai tabel/bucket ber-prefix rm_ / rm-.
import { PDFDocument as PdfLibDocument } from "pdf-lib";
import { getSetting } from "./settings";

export const LETTER_STORAGE_BUCKET = "rm-letter-pdfs";
export const SIGNATURE_STORAGE_BUCKET = "rm-signatures";

/** Ambil alamat email dari satu baris Excel — satu sel boleh berisi lebih
 * dari satu alamat, dipisah ";" atau ",". */
export function parseEmailCell(value) {
  return String(value == null ? "" : value)
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Cari nilai kolom pada row_data secara case-insensitive. */
export function pickRowField(row, names) {
  if (!row) return "";
  const lookup = {};
  Object.keys(row).forEach((k) => { lookup[String(k).trim().toLowerCase()] = row[k]; });
  for (const name of names) {
    const v = lookup[name.toLowerCase()];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/** Ambil file tanda tangan aktif sebagai Buffer PNG. null kalau belum ada. */
export async function getActiveSignatureBuffer(supabaseAdmin) {
  const signaturePath = await getSetting(supabaseAdmin, "signature_path");
  if (!signaturePath) return null;
  const { data, error } = await supabaseAdmin.storage.from(SIGNATURE_STORAGE_BUCKET).download(signaturePath);
  if (error || !data) return null;
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/** Tempel tanda tangan aktif ke SEMUA PDF dalam 1 batch (dipanggil sekali,
 * otomatis, begitu batch di-approve). */
export async function applySignatureToBatch(supabaseAdmin, batchId) {
  const signatureBuffer = await getActiveSignatureBuffer(supabaseAdmin);
  if (!signatureBuffer) {
    return {
      applied: false,
      stampedCount: 0,
      total: 0,
      reason: 'Tanda tangan belum diatur di panel "Pengaturan Approver & TTD" — batch tetap approved, tapi PDF belum ditempel TTD.',
    };
  }

  const { data: items, error: itemsErr } = await supabaseAdmin
    .from("rm_letter_batch_items")
    .select("*")
    .eq("batch_id", batchId)
    .order("seq", { ascending: true });
  if (itemsErr) throw new Error(itemsErr.message);

  let stampedCount = 0;
  const errors = [];

  for (const item of items) {
    try {
      if (!item.signature_anchor) {
        errors.push(`${item.filename}: posisi TTD tidak tersimpan (surat lama, generate ulang batch-nya).`);
        continue;
      }
      const { data: pdfBlob, error: dlErr } = await supabaseAdmin.storage
        .from(LETTER_STORAGE_BUCKET)
        .download(item.storage_path);
      if (dlErr || !pdfBlob) {
        errors.push(`${item.filename}: gagal ambil PDF asli (${dlErr ? dlErr.message : "kosong"}).`);
        continue;
      }
      const pdfBytes = Buffer.from(await pdfBlob.arrayBuffer());

      const pdfDoc = await PdfLibDocument.load(pdfBytes);
      const pngImage = await pdfDoc.embedPng(signatureBuffer);
      const anchor = item.signature_anchor;
      const pageIndex = Number.isInteger(anchor.pageIndex) ? anchor.pageIndex : 0;
      const page = pdfDoc.getPage(Math.min(pageIndex, pdfDoc.getPageCount() - 1));

      const targetWidth = Math.min(Number(anchor.width) || 180, 180);
      const scale = targetWidth / pngImage.width;
      const drawWidth = pngImage.width * scale;
      const drawHeight = pngImage.height * scale;
      const xPdf = Number(anchor.x) || 0;
      const yPdf = page.getHeight() - (Number(anchor.y) || 0) - drawHeight;

      page.drawImage(pngImage, { x: xPdf, y: yPdf, width: drawWidth, height: drawHeight });

      const stampedBytes = await pdfDoc.save();
      const { error: upErr } = await supabaseAdmin.storage
        .from(LETTER_STORAGE_BUCKET)
        .upload(item.storage_path, Buffer.from(stampedBytes), { contentType: "application/pdf", upsert: true });
      if (upErr) {
        errors.push(`${item.filename}: gagal simpan PDF ber-TTD (${upErr.message}).`);
        continue;
      }
      stampedCount += 1;
    } catch (e) {
      errors.push(`${item.filename}: ${e.message}`);
    }
  }

  return { applied: stampedCount > 0, stampedCount, total: items.length, errors };
}

/** Approve/reject 1 batch surat lewat approval_token (dipakai dari halaman
 * approval yang diakses approver TANPA login SandraHub — lihat catatan di
 * app/api/report-merge/letters/batches/[id]/route.js). Dipakai bersama
 * oleh route approve dan reject supaya logikanya tidak diduplikasi. */
export async function resolveLetterBatchDecision(supabaseAdmin, batchId, token, nextStatus, timestampField) {
  const { data: batch, error: e1 } = await supabaseAdmin
    .from("rm_letter_batches")
    .select("*")
    .eq("id", batchId)
    .single();
  if (e1 || !batch) return { status: 404, body: { ok: false, error: "Batch tidak ditemukan." } };
  if (!token || token !== batch.approval_token) {
    return { status: 403, body: { ok: false, error: "Link tidak valid atau sudah kadaluarsa." } };
  }
  if (batch.status !== "pending_approval") {
    const existingTs = batch.status === "approved" ? batch.approved_at : batch.rejected_at;
    return { status: 200, body: { ok: true, alreadyDecided: true, status: batch.status, timestamp: existingTs } };
  }
  const fields = { status: nextStatus };
  fields[timestampField] = new Date().toISOString();
  const { error: e2 } = await supabaseAdmin.from("rm_letter_batches").update(fields).eq("id", batch.id);
  if (e2) return { status: 500, body: { ok: false, error: e2.message } };

  let signature = null;
  if (nextStatus === "approved") {
    try {
      signature = await applySignatureToBatch(supabaseAdmin, batch.id);
      await supabaseAdmin.from("rm_letter_batches").update({ signature_applied: Boolean(signature.applied) }).eq("id", batch.id);
    } catch (e) {
      signature = { applied: false, stampedCount: 0, total: 0, reason: "Gagal tempel tanda tangan: " + String(e?.message || e) };
    }
  }

  return { status: 200, body: { ok: true, status: nextStatus, timestamp: fields[timestampField], signature } };
}

/** Hitung ulang ringkasan blast di level batch dari status tiap suratnya. */
export async function refreshBatchBlastSummary(supabaseAdmin, batchId) {
  const { data: items } = await supabaseAdmin
    .from("rm_letter_batch_items")
    .select("blast_status")
    .eq("batch_id", batchId);
  const list = items || [];
  const sent = list.filter((i) => i.blast_status === "sent").length;
  const failed = list.filter((i) => i.blast_status === "failed").length;
  const status = sent === 0 ? "not_sent" : (sent >= list.length ? "sent" : "partial");

  const fields = {
    blast_status: status,
    blast_success_count: sent,
    blast_fail_count: failed,
  };
  if (sent > 0) fields.blast_finished_at = new Date().toISOString();

  const { data: batch } = await supabaseAdmin.from("rm_letter_batches").select("blast_started_at").eq("id", batchId).single();
  if (batch && !batch.blast_started_at) fields.blast_started_at = new Date().toISOString();

  await supabaseAdmin.from("rm_letter_batches").update(fields).eq("id", batchId);
  return { status, sent, failed, total: list.length };
}
