// app/api/report-merge/settings/approvers/route.js
import { NextResponse } from "next/server";
import { requireReportMergeAccess } from "../../../../../lib/reportMerge/auth";
import { saveApprover } from "../../../../../lib/reportMerge/settings";

export async function POST(req) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  try {
    const { entry, list } = await saveApprover(auth.supabaseAdmin, body.id, body.name, body.email);
    return NextResponse.json({ ok: true, approver: entry, approverList: list });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}
