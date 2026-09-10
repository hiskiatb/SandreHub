// app/api/report-merge/letters/templates-supported/route.js
import { NextResponse } from "next/server";
import { requireReportMergeAccess } from "../../../../../lib/reportMerge/auth";
import { LETTER_TYPE_NAMES, isAggregateLetter, LETTER_DEFAULTS } from "../../../../../lib/reportMerge/letterEngine";

export async function GET(req) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });

  // LETTER_DEFAULTS persis berisi jenis surat yang resmi didukung sekarang
  // (STYLE_PRESETS masih menyimpan preset lama yang sengaja tidak
  // ditawarkan lagi — lihat catatan di server.js asli).
  const codes = Object.keys(LETTER_DEFAULTS);
  return NextResponse.json({
    ok: true,
    codes,
    types: codes.map((c) => ({
      code: c,
      name: LETTER_TYPE_NAMES[c] || c,
      aggregate: isAggregateLetter(c),
      defaults: LETTER_DEFAULTS[c] || null,
    })),
  });
}
