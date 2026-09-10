// app/api/report-merge/letters/batches/route.js
import { NextResponse } from "next/server";
import { Resend } from "resend";
import crypto from "crypto";
import { requireReportMergeAccess } from "../../../../../lib/reportMerge/auth";
import { getEffectiveApproverEmail, withLetterSignerDefaults } from "../../../../../lib/reportMerge/settings";
import {
  STYLE_PRESETS, isAggregateLetter, generateMemoPdf, generateLetterPdf,
  computeDetailTotal, formatRupiah,
} from "../../../../../lib/reportMerge/letterEngine";
import { LETTER_STORAGE_BUCKET } from "../../../../../lib/reportMerge/letters";

const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const SENDER_EMAIL = (process.env.SENDER_EMAIL || "").trim();
const SENDER_NAME = (process.env.SENDER_NAME || "Report Merge").trim();
const SETUP_OK = Boolean(RESEND_API_KEY && SENDER_EMAIL);
const resend = SETUP_OK ? new Resend(RESEND_API_KEY) : null;
const fromHeader = `${SENDER_NAME} <${SENDER_EMAIL}>`;
// Base URL halaman approval "Buat Surat" — halaman ini (mirip approve.html
// di paket standalone) diporting di Tahap 3 (UI). Sebelum itu ada, link di
// email approval belum bisa dibuka — hanya batch/PDF-nya yang sudah aman
// tersimpan.
const APP_BASE_URL = (process.env.REPORT_MERGE_APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");

export async function POST(req) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });

  const approverEmail = await getEffectiveApproverEmail(auth.supabaseAdmin);
  if (!approverEmail) {
    return NextResponse.json({ ok: false, error: 'Approver email belum diatur — isi di panel "Pengaturan Approver & TTD" dulu.' }, { status: 400 });
  }
  if (!SETUP_OK) {
    return NextResponse.json({ ok: false, error: "Setup Resend belum lengkap (RESEND_API_KEY / SENDER_EMAIL)." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  let templateConfig = body.templateConfig || {};
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const batchMeta = body.batchMeta || {};
  const templateCode = String(templateConfig.TEMPLATE_CODE || "").trim();

  if (!templateCode) return NextResponse.json({ ok: false, error: "templateConfig.TEMPLATE_CODE kosong." }, { status: 400 });
  if (!STYLE_PRESETS[templateCode]) {
    return NextResponse.json({
      ok: false,
      error: `Template "${templateCode}" belum didukung mesin surat (baru: ${Object.keys(STYLE_PRESETS).join(", ")}).`,
    }, { status: 400 });
  }
  if (!rows.length) return NextResponse.json({ ok: false, error: "Belum ada baris data yang dipilih." }, { status: 400 });

  templateConfig = await withLetterSignerDefaults(auth.supabaseAdmin, templateConfig);

  try {
    // 1) generate semua PDF dulu (di memory) sebelum nyimpen apa pun.
    const generated = [];
    if (isAggregateLetter(templateCode)) {
      const { buffer, signatureAnchor } = await generateMemoPdf(templateConfig, rows, batchMeta);
      const periodePart = String(batchMeta.periode || "").replace(/[^a-z0-9_-]+/gi, "_");
      const filename = `${templateCode}${periodePart ? "_" + periodePart : ""}.pdf`;
      generated.push({
        row: { __memo: true, jumlah_baris: rows.length, rows },
        buffer, filename, seq: 1, signatureAnchor,
      });
    } else {
      for (let i = 0; i < rows.length; i++) {
        const { buffer, signatureAnchor } = await generateLetterPdf(templateConfig, rows[i], batchMeta, i + 1);
        const safeName = String(rows[i].ID || `surat-${i + 1}`).replace(/[^a-z0-9_-]+/gi, "_");
        const partnerPart = String(rows[i].PARTNER_NAME || rows[i].PT_NAME || "").replace(/[^a-z0-9_-]+/gi, "_");
        const filename = `Surat_${templateCode}_${safeName}${partnerPart ? "_" + partnerPart : ""}.pdf`;
        generated.push({ row: rows[i], buffer, filename, seq: i + 1, signatureAnchor });
      }
    }

    const detailTotals = isAggregateLetter(templateCode)
      ? rows.map((r) => computeDetailTotal(templateConfig, r))
      : generated.map((item) => computeDetailTotal(templateConfig, item.row));
    const hasNominal = detailTotals.some((t) => typeof t === "number" && !isNaN(t));
    const totalNominal = detailTotals.reduce((acc, t) => acc + (typeof t === "number" && !isNaN(t) ? t : 0), 0);

    // 2) catat batch (status pending_approval) + upload tiap PDF ke Storage
    const approvalToken = crypto.randomBytes(24).toString("hex");
    const alur = String(templateConfig.ALUR || "").trim().toLowerCase() === "approval_lalu_blast"
      ? "approval_lalu_blast"
      : "approval_saja";
    const { data: batchRow, error: batchErr } = await auth.supabaseAdmin
      .from("rm_letter_batches")
      .insert({
        template_code: templateCode,
        letter_name: templateConfig.LETTER_NAME || null,
        alur,
        periode: batchMeta.periode || "",
        source_sheet: templateConfig.SOURCE_SHEET || null,
        total_items: generated.length,
        total_nominal: hasNominal ? totalNominal : null,
        status: "pending_approval",
        approval_token: approvalToken,
        approver_email: approverEmail,
      })
      .select()
      .single();
    if (batchErr) throw new Error("Gagal simpan batch: " + batchErr.message);

    const batchId = batchRow.id;
    for (const item of generated) {
      const storagePath = `${batchId}/${item.filename}`;
      const { error: upErr } = await auth.supabaseAdmin.storage
        .from(LETTER_STORAGE_BUCKET)
        .upload(storagePath, item.buffer, { contentType: "application/pdf", upsert: true });
      if (upErr) throw new Error(`Gagal upload "${item.filename}": ${upErr.message}`);

      const { error: itemErr } = await auth.supabaseAdmin.from("rm_letter_batch_items").insert({
        batch_id: batchId,
        seq: item.seq,
        row_id: item.row.ID != null ? String(item.row.ID) : null,
        row_data: item.row,
        filename: item.filename,
        storage_path: storagePath,
        signature_anchor: item.signatureAnchor || null,
      });
      if (itemErr) throw new Error("Gagal simpan detail surat: " + itemErr.message);
    }

    // 3) kirim email request approval ke approverEmail.
    const approveUrl = `${APP_BASE_URL}/report-merge/approve?batch=${batchId}&token=${approvalToken}`;
    const letterLabel = templateConfig.LETTER_NAME || templateCode;

    const tanggalDiajukan = new Date((batchRow && batchRow.created_at) || Date.now()).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" });
    const introPeriode = batchMeta.periode ? ` periode <b>${batchMeta.periode}</b>` : "";
    const introNominal = hasNominal ? ` dengan total nominal <b style="color:#EC008C;">${formatRupiah(totalNominal)}</b>` : "";
    const detailPeriodeRow = batchMeta.periode ? `Periode : <b>${batchMeta.periode}</b><br>` : "";
    const detailNominalRow = hasNominal ? `Total nominal : <b style="color:#EC008C;">${formatRupiah(totalNominal)}</b><br>` : "";

    const emailHtml = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;">
        <tr>
          <td style="padding:30px 32px 6px;text-align:center;">
            <div style="font-size:13px;font-weight:700;letter-spacing:.05em;color:#ED1C24;text-transform:uppercase;">${SENDER_NAME}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 32px 0;">
            <p style="margin:0 0 14px;font-size:14px;color:#4D4D4F;line-height:1.6;">Yth. Bapak/Ibu Approver,</p>
            <p style="margin:0 0 20px;font-size:14px;color:#4D4D4F;line-height:1.6;">Mohon approval untuk <b>${generated.length} surat "${letterLabel}"</b>${introPeriode}${introNominal}.</p>
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#4D4D4F;">Detail:</p>
            <p style="margin:0 0 24px;font-size:14px;color:#4D4D4F;line-height:2;">
              Jenis surat : <b>${letterLabel}</b><br>
              ${detailPeriodeRow}Jumlah surat : <b>${generated.length}</b><br>
              ${detailNominalRow}Tanggal diajukan : <b>${tanggalDiajukan}</b>
            </p>
            <p style="margin:0 0 22px;font-size:14px;color:#4D4D4F;line-height:1.6;">Mohon untuk dapat melanjutkan proses review &amp; approval melalui tombol di bawah ini.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 26px;">
              <tr>
                <td style="background:#ED1C24;border-radius:8px;">
                  <a href="${approveUrl}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Buka Halaman Approval →</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 4px;font-size:13px;color:#4D4D4F;line-height:1.6;">Demikian kami sampaikan, terima kasih atas perhatian dan kerjasamanya.</p>
            <p style="margin:20px 0 0;font-size:13px;color:#4D4D4F;line-height:1.5;">Terima kasih,<br><b>${SENDER_NAME}</b></p>
          </td>
        </tr>
        <tr>
          <td style="padding:22px 32px 20px;">
            <p style="margin:0;font-size:11px;color:#98A2B3;line-height:1.6;">Kalau tombolnya tidak muncul, buka link ini: <a href="${approveUrl}" style="color:#ED1C24;">${approveUrl}</a><br>Email ini dikirim otomatis oleh sistem, mohon tidak membalas.</p>
          </td>
        </tr>
        <tr>
          <td style="height:6px;background:#ED1C24;line-height:0;font-size:0;">&nbsp;</td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

    let emailSent = false;
    let emailError = null;
    try {
      const result = await resend.emails.send({
        from: fromHeader,
        to: [approverEmail],
        subject: `[Approval] ${letterLabel}${batchMeta.periode ? " — " + batchMeta.periode : ""} (${generated.length} surat)`,
        html: emailHtml,
      });
      if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));
      emailSent = true;
    } catch (e) {
      emailError = String(e?.message || e);
    }

    return NextResponse.json({ ok: true, batchId, total: generated.length, emailSent, emailError, approveUrl });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

/** Daftar batch surat buat pintu masuk tahap blast — approval_token tidak
 * ikut dikirim, itu cuma buat link approver. */
export async function GET(req) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  try {
    const { data, error } = await auth.supabaseAdmin
      .from("rm_letter_batches")
      .select("id, template_code, letter_name, alur, periode, source_sheet, total_items, status, signature_applied, total_nominal, created_at, approved_at, rejected_at, blast_status, blast_success_count, blast_fail_count, blast_finished_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, batches: data || [] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
