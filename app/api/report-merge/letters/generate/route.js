// app/api/report-merge/letters/generate/route.js
import { NextResponse } from "next/server";
import { requireReportMergeAccess } from "../../../../../lib/reportMerge/auth";
import { withLetterSignerDefaults } from "../../../../../lib/reportMerge/settings";
import { STYLE_PRESETS, isAggregateLetter, generateMemoPdf, generateLetterPdf } from "../../../../../lib/reportMerge/letterEngine";

export async function POST(req) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  let templateConfig = body.templateConfig || {};
  const row = body.row || {};
  const rows = Array.isArray(body.rows) ? body.rows : null;
  const batchMeta = body.batchMeta || {};
  const seq = Number(body.seq) || 1;

  const templateCode = String(templateConfig.TEMPLATE_CODE || "").trim();
  if (!templateCode) {
    return NextResponse.json({ ok: false, error: "templateConfig.TEMPLATE_CODE kosong." }, { status: 400 });
  }
  if (!STYLE_PRESETS[templateCode]) {
    return NextResponse.json({
      ok: false,
      error: `Template "${templateCode}" belum didukung mesin surat (baru: ${Object.keys(STYLE_PRESETS).join(", ")}).`,
    }, { status: 400 });
  }
  if (isAggregateLetter(templateCode) && (!rows || !rows.length)) {
    return NextResponse.json({ ok: false, error: 'Jenis surat ini satu dokumennya merangkum banyak baris — kirim "rows" (array), bukan "row".' }, { status: 400 });
  }

  try {
    templateConfig = await withLetterSignerDefaults(auth.supabaseAdmin, templateConfig);
    const { buffer } = isAggregateLetter(templateCode)
      ? await generateMemoPdf(templateConfig, rows, batchMeta)
      : await generateLetterPdf(templateConfig, row, batchMeta, seq);
    const safeName = String(row.ID || `surat-${seq}`).replace(/[^a-z0-9_-]+/gi, "_");
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeName}.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
