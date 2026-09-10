// app/api/report-merge/accounts/route.js
import { NextResponse } from "next/server";
import { requireReportMergeAccess } from "../../../../lib/reportMerge/auth";

export async function GET(req) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  // Selalu kirim dari 1 alamat pengirim bersama — tidak ada pemilihan akun.
  return NextResponse.json({ ok: true, accounts: [] });
}
