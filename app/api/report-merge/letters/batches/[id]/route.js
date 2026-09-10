// app/api/report-merge/letters/batches/[id]/route.js
//
// CATATAN KEAMANAN: endpoint ini SENGAJA tidak memakai
// requireReportMergeAccess() — ini dipanggil dari halaman approval
// (mirip approve.html di paket standalone, akan diporting di Tahap 3)
// yang dibuka approver lewat link di email, TANPA login ke SandraHub.
// Satu-satunya kredensial adalah approval_token acak (24 byte) yang
// dikirim di link itu — persis seperti perilaku aslinya sebelum
// diporting. Kalau approver_email yang diisi di pengaturan bukan orang
// yang berhak, itu masalah pengaturan approver, bukan endpoint ini.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { LETTER_STORAGE_BUCKET } from "../../../../../../lib/reportMerge/letters";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(req, { params }) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Konfigurasi server belum lengkap." }, { status: 500 });
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const token = String(searchParams.get("token") || "");

  try {
    const { data: batch, error: e1 } = await supabaseAdmin
      .from("rm_letter_batches")
      .select("*")
      .eq("id", id)
      .single();
    if (e1 || !batch) return NextResponse.json({ ok: false, error: "Batch tidak ditemukan." }, { status: 404 });
    if (!token || token !== batch.approval_token) {
      return NextResponse.json({ ok: false, error: "Link tidak valid atau sudah kadaluarsa." }, { status: 403 });
    }

    const { data: items, error: e2 } = await supabaseAdmin
      .from("rm_letter_batch_items")
      .select("*")
      .eq("batch_id", batch.id)
      .order("seq", { ascending: true });
    if (e2) throw new Error(e2.message);

    const itemsWithUrl = [];
    for (const item of items) {
      const { data: signed } = await supabaseAdmin.storage
        .from(LETTER_STORAGE_BUCKET)
        .createSignedUrl(item.storage_path, 3600);
      itemsWithUrl.push({
        seq: item.seq,
        rowId: item.row_id,
        filename: item.filename,
        previewUrl: signed ? signed.signedUrl : null,
      });
    }

    return NextResponse.json({ ok: true, batch, items: itemsWithUrl });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
