// app/api/report-merge/settings/approvers/[id]/route.js
import { NextResponse } from "next/server";
import { requireReportMergeAccess } from "../../../../../../lib/reportMerge/auth";
import { deleteApprover } from "../../../../../../lib/reportMerge/settings";

export async function DELETE(req, { params }) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  const { id } = await params;
  try {
    const list = await deleteApprover(auth.supabaseAdmin, id);
    return NextResponse.json({ ok: true, approverList: list });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
