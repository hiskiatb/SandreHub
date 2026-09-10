// app/api/report-merge/archive/batches/[id]/recipients/route.js
import { NextResponse } from "next/server";
import { requireReportMergeAccess } from "../../../../../../../lib/reportMerge/auth";

export async function POST(req, { params }) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const { error } = await auth.supabaseAdmin.from("rm_sent_batch_recipients").insert({
      batch_id: id,
      recipient_name: body.name || "",
      recipient_emails: body.emails || "",
      recipient_ccs: body.ccs || "",
      subject: body.subject || "",
      intro_text: body.intro || "",
      closing_text: body.closing || "",
      table_cols: body.tableCols || [],
      table_rows: body.tableRows || [],
      status: body.status || "ok",
      error_message: body.errorMessage || null,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
