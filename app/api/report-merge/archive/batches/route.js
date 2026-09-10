// app/api/report-merge/archive/batches/route.js
import { NextResponse } from "next/server";
import { requireReportMergeAccess } from "../../../../../lib/reportMerge/auth";

export async function POST(req) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  try {
    const { data, error } = await auth.supabaseAdmin
      .from("rm_sent_batches")
      .insert({
        judul: body.judul || "",
        periode: body.periode || "",
        subject_template: body.subjectTemplate || "",
        total_recipients: body.totalRecipients || 0,
        success_count: body.successCount || 0,
        fail_count: body.failCount || 0,
        status: body.status || "completed",
        started_at: body.startedAt || new Date().toISOString(),
        finished_at: body.finishedAt || new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, batch: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export async function GET(req) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  try {
    const { data, error } = await auth.supabaseAdmin
      .from("rm_sent_batches")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, batches: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
