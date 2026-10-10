// app/api/report-merge/settings/narrative-templates/route.js
import { NextResponse } from "next/server";
import { requireReportMergeAccess } from "../../../../../lib/reportMerge/auth";
import { saveNarrativeTemplate } from "../../../../../lib/reportMerge/settings";

export async function POST(req) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ ok: false, error: "Nama template belum diisi." }, { status: 400 });
  try {
    const saved = await saveNarrativeTemplate(auth.supabaseAdmin, body.id, name, body.introText, body.closingText);
    return NextResponse.json({ ok: true, template: saved });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
