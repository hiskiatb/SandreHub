// app/api/report-merge/templates/route.js
import { NextResponse } from "next/server";
import { requireReportMergeAccess } from "../../../../lib/reportMerge/auth";

export async function GET(req) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  try {
    const { data, error } = await auth.supabaseAdmin
      .from("rm_narrative_templates")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, templates: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ ok: false, error: "Nama template wajib diisi." }, { status: 400 });
  try {
    const { data, error } = await auth.supabaseAdmin
      .from("rm_narrative_templates")
      .insert({
        name,
        mapping: body.mapping || {},
        sender: body.sender || {},
        narrative: body.narrative || {},
        table_cols: body.tableCols || [],
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, template: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
