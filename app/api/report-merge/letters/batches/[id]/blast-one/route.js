// app/api/report-merge/letters/batches/[id]/blast-one/route.js
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireReportMergeAccess } from "../../../../../../../lib/reportMerge/auth";
import { LETTER_STORAGE_BUCKET, parseEmailCell, refreshBatchBlastSummary } from "../../../../../../../lib/reportMerge/letters";

const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const SENDER_EMAIL = (process.env.SENDER_EMAIL || "").trim();
const SENDER_NAME = (process.env.SENDER_NAME || "Report Merge").trim();
const SETUP_OK = Boolean(RESEND_API_KEY && SENDER_EMAIL);
const resend = SETUP_OK ? new Resend(RESEND_API_KEY) : null;
const fromHeader = `${SENDER_NAME} <${SENDER_EMAIL}>`;

export async function POST(req, { params }) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  if (!SETUP_OK) return NextResponse.json({ ok: false, error: "Setup Resend belum lengkap (RESEND_API_KEY / SENDER_EMAIL)." }, { status: 400 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const toList = parseEmailCell(body.to);
  const ccList = parseEmailCell(body.cc);
  const seqs = Array.isArray(body.seqs) ? body.seqs.map(Number).filter(Number.isFinite) : [];
  const subject = String(body.subject || "").trim();
  const html = String(body.html || "");

  if (!toList.length) return NextResponse.json({ ok: false, error: "Alamat tujuan kosong." }, { status: 400 });
  if (!seqs.length) return NextResponse.json({ ok: false, error: "Tidak ada surat yang dilampirkan." }, { status: 400 });
  if (!subject) return NextResponse.json({ ok: false, error: "Subjek email kosong." }, { status: 400 });

  try {
    const { data: batch, error: e1 } = await auth.supabaseAdmin
      .from("rm_letter_batches")
      .select("*")
      .eq("id", id)
      .single();
    if (e1 || !batch) return NextResponse.json({ ok: false, error: "Batch tidak ditemukan." }, { status: 404 });

    // Pagar 1: surat cuma boleh keluar setelah approver menyetujui.
    if (batch.status !== "approved") {
      return NextResponse.json({
        ok: false,
        error: `Batch ini belum disetujui approver (status: ${batch.status}) — surat baru boleh dikirim setelah approved.`,
      }, { status: 400 });
    }

    // Pagar 2: jenis surat "approval_saja" tidak boleh dikirim ke mitra.
    if (batch.alur !== "approval_lalu_blast") {
      return NextResponse.json({
        ok: false,
        error: 'Jenis surat ini alurnya "approval_saja" — selesai setelah disetujui approver dan tidak dikirim ke penerima. Kalau memang mau dikirim, ubah kolom ALUR di sheet TEMPLATE_SURAT jadi approval_lalu_blast, lalu generate ulang batch-nya.',
      }, { status: 400 });
    }

    const { data: items, error: e2 } = await auth.supabaseAdmin
      .from("rm_letter_batch_items")
      .select("*")
      .eq("batch_id", batch.id)
      .in("seq", seqs);
    if (e2) throw new Error(e2.message);
    if (!items || !items.length) return NextResponse.json({ ok: false, error: "Surat yang diminta tidak ditemukan di batch ini." }, { status: 404 });

    const attachments = [];
    for (const item of items) {
      const { data: blob, error: dlErr } = await auth.supabaseAdmin.storage
        .from(LETTER_STORAGE_BUCKET)
        .download(item.storage_path);
      if (dlErr || !blob) throw new Error(`Gagal ambil PDF "${item.filename}": ${dlErr ? dlErr.message : "file kosong"}`);
      const buf = Buffer.from(await blob.arrayBuffer());
      attachments.push({ filename: item.filename, content: buf.toString("base64") });
    }

    const fullHtml =
      `<html><head><meta charset="utf-8"></head>` +
      `<body style="font-family:Arial,Helvetica,sans-serif;font-size:13.5px;color:#4D4D4F;">` +
      `${html}</body></html>`;

    const sentAt = new Date().toISOString();
    const itemIds = items.map((it) => it.id);

    try {
      const result = await resend.emails.send({
        from: fromHeader,
        to: toList,
        cc: ccList.length ? ccList : undefined,
        subject,
        html: fullHtml,
        attachments,
      });
      if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));
    } catch (sendErr) {
      await auth.supabaseAdmin.from("rm_letter_batch_items")
        .update({ blast_status: "failed", blast_error: String(sendErr?.message || sendErr), blast_to: toList.join("; "), blast_cc: ccList.join("; ") })
        .in("id", itemIds);
      await refreshBatchBlastSummary(auth.supabaseAdmin, batch.id);
      return NextResponse.json({ ok: false, error: String(sendErr?.message || sendErr) }, { status: 500 });
    }

    await auth.supabaseAdmin.from("rm_letter_batch_items")
      .update({
        blast_status: "sent",
        blast_error: null,
        blast_sent_at: sentAt,
        blast_to: toList.join("; "),
        blast_cc: ccList.join("; "),
      })
      .in("id", itemIds);

    if (body.narrative) {
      await auth.supabaseAdmin.from("rm_letter_batches").update({ blast_narrative: body.narrative }).eq("id", batch.id);
    }
    const summary = await refreshBatchBlastSummary(auth.supabaseAdmin, batch.id);

    return NextResponse.json({ ok: true, sentAt, attachmentCount: attachments.length, summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
