// app/api/report-merge/settings/narrative-templates/[id]/route.js
import { NextResponse } from "next/server";
import { requireReportMergeAccess } from "../../../../../../lib/reportMerge/auth";
import { deleteNarrativeTemplate } from "../../../../../../lib/reportMerge/settings";

export async function DELETE(req, { params }) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  const { id } = await params;
  try {
    await deleteNarrativeTemplate(auth.supabaseAdmin, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
