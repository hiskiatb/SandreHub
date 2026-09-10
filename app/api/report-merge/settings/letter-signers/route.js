// app/api/report-merge/settings/letter-signers/route.js
import { NextResponse } from "next/server";
import { requireReportMergeAccess } from "../../../../../lib/reportMerge/auth";
import { setSetting } from "../../../../../lib/reportMerge/settings";

export async function POST(req) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const kota = String(body.kota || "").trim();
  const signers = (Array.isArray(body.signers) ? body.signers : []).slice(0, 4).map((sg) => ({
    name: String((sg && sg.name) || "").trim(),
    title: String((sg && sg.title) || "").trim(),
    nik: String((sg && sg.nik) || "").trim(),
    role: String((sg && sg.role) || "").trim(),
  })).filter((sg) => sg.name || sg.title);
  try {
    await setSetting(auth.supabaseAdmin, "letter_signers", JSON.stringify({ kota, signers }));
    return NextResponse.json({ ok: true, letterSigners: { kota, signers } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
