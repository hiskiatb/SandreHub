// app/api/report-merge/letters/batches/[id]/approve/route.js
// Token-gated seperti [id]/route.js — lihat catatan keamanan di sana.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveLetterBatchDecision } from "../../../../../../../lib/reportMerge/letters";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(req, { params }) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Konfigurasi server belum lengkap." }, { status: 500 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { searchParams } = new URL(req.url);
  const token = String(body.token || searchParams.get("token") || "");

  try {
    const { status, body: outBody } = await resolveLetterBatchDecision(supabaseAdmin, id, token, "approved", "approved_at");
    return NextResponse.json(outBody, { status });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
