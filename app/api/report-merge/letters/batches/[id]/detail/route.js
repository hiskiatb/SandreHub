// app/api/report-merge/letters/batches/[id]/detail/route.js
import { NextResponse } from "next/server";
import { requireReportMergeAccess } from "../../../../../../lib/reportMerge/auth";
import { LETTER_STORAGE_BUCKET, parseEmailCell, pickRowField } from "../../../../../../lib/reportMerge/letters";

export async function GET(req, { params }) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  const { id } = await params;

  try {
    const { data: batch, error: e1 } = await auth.supabaseAdmin
      .from("rm_letter_batches")
      .select("*")
      .eq("id", id)
      .single();
    if (e1 || !batch) return NextResponse.json({ ok: false, error: "Batch tidak ditemukan." }, { status: 404 });

    const { data: items, error: e2 } = await auth.supabaseAdmin
      .from("rm_letter_batch_items")
      .select("*")
      .eq("batch_id", batch.id)
      .order("seq", { ascending: true });
    if (e2) throw new Error(e2.message);

    const out = [];
    for (const item of items || []) {
      const { data: signed } = await auth.supabaseAdmin.storage
        .from(LETTER_STORAGE_BUCKET)
        .createSignedUrl(item.storage_path, 3600);
      const row = item.row_data || {};
      out.push({
        id: item.id,
        seq: item.seq,
        rowId: item.row_id,
        filename: item.filename,
        previewUrl: signed ? signed.signedUrl : null,
        rowData: row,
        emailTo: parseEmailCell(pickRowField(row, ["EMAIL_TO", "EMAIL", "EMAIL_PARTNER"])),
        emailCc: parseEmailCell(pickRowField(row, ["EMAIL_CC", "CC"])),
        partnerName: pickRowField(row, ["PARTNER_NAME", "PT_NAME", "NAME", "NAMA"]),
        blastStatus: item.blast_status || "pending",
        blastError: item.blast_error || null,
        blastSentAt: item.blast_sent_at || null,
        blastTo: item.blast_to || null,
      });
    }
    // approval_token tidak ikut dikirim ke klien.
    const { approval_token, ...safeBatch } = batch;
    return NextResponse.json({ ok: true, batch: safeBatch, items: out });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
