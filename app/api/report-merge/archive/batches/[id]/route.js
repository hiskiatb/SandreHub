// app/api/report-merge/archive/batches/[id]/route.js
import { NextResponse } from "next/server";
import { requireReportMergeAccess } from "../../../../../../lib/reportMerge/auth";

export async function GET(req, { params }) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  const { id } = await params;
  try {
    const { data: batch, error: e1 } = await auth.supabaseAdmin
      .from("rm_sent_batches")
      .select("*")
      .eq("id", id)
      .single();
    if (e1) throw new Error(e1.message);
    const { data: recipients, error: e2 } = await auth.supabaseAdmin
      .from("rm_sent_batch_recipients")
      .select("*")
      .eq("batch_id", id)
      .order("sent_at", { ascending: true });
    if (e2) throw new Error(e2.message);
    return NextResponse.json({ ok: true, batch, recipients });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const fields = {};
  if (typeof body.successCount === "number") fields.success_count = body.successCount;
  if (typeof body.failCount === "number") fields.fail_count = body.failCount;
  if (typeof body.totalRecipients === "number") fields.total_recipients = body.totalRecipients;
  if (typeof body.status === "string") fields.status = body.status;
  if (typeof body.finishedAt === "string") fields.finished_at = body.finishedAt;
  try {
    const { error } = await auth.supabaseAdmin.from("rm_sent_batches").update(fields).eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
