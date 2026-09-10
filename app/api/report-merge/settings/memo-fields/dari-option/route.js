// app/api/report-merge/settings/memo-fields/dari-option/route.js
import { NextResponse } from "next/server";
import { requireReportMergeAccess } from "../../../../../../lib/reportMerge/auth";
import { addMemoFieldOption } from "../../../../../../lib/reportMerge/settings";

export async function POST(req) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const templateCode = String(body.templateCode || "").trim();
  const value = String(body.dari || "").trim();
  if (!templateCode) return NextResponse.json({ ok: false, error: "templateCode kosong." }, { status: 400 });
  if (!value) return NextResponse.json({ ok: false, error: "Isi dulu Dari-nya." }, { status: 400 });
  try {
    const saved = await addMemoFieldOption(auth.supabaseAdmin, templateCode, "dari", value);
    return NextResponse.json({ ok: true, templateCode, fields: saved });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
