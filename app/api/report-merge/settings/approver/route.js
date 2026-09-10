// app/api/report-merge/settings/approver/route.js
import { NextResponse } from "next/server";
import { requireReportMergeAccess } from "../../../../../lib/reportMerge/auth";
import { setSetting } from "../../../../../lib/reportMerge/settings";

export async function POST(req) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Alamat email tidak valid." }, { status: 400 });
  }
  try {
    await setSetting(auth.supabaseAdmin, "approver_email", email);
    return NextResponse.json({ ok: true, approverEmail: email });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
