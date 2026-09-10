// app/api/report-merge/settings/signature/route.js
import { NextResponse } from "next/server";
import { requireReportMergeAccess } from "../../../../../lib/reportMerge/auth";
import { setSetting } from "../../../../../lib/reportMerge/settings";

const SIGNATURE_STORAGE_BUCKET = "rm-signatures";
const SIGNATURE_FILE_PATH = "active-signature.png";

export async function POST(req) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const imageBase64 = String(body.imageBase64 || "");
  if (!imageBase64) return NextResponse.json({ ok: false, error: "Belum ada gambar tanda tangan yang dikirim." }, { status: 400 });
  try {
    const buffer = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");
    if (!buffer.length) throw new Error("File kosong / gagal dibaca.");
    const { error: upErr } = await auth.supabaseAdmin.storage
      .from(SIGNATURE_STORAGE_BUCKET)
      .upload(SIGNATURE_FILE_PATH, buffer, { contentType: "image/png", upsert: true });
    if (upErr) throw new Error(upErr.message);
    await setSetting(auth.supabaseAdmin, "signature_path", SIGNATURE_FILE_PATH);
    const { data: signed } = await auth.supabaseAdmin.storage
      .from(SIGNATURE_STORAGE_BUCKET)
      .createSignedUrl(SIGNATURE_FILE_PATH, 3600);
    return NextResponse.json({ ok: true, signatureUrl: signed ? signed.signedUrl : null });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export async function DELETE(req) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  try {
    await auth.supabaseAdmin.storage.from(SIGNATURE_STORAGE_BUCKET).remove([SIGNATURE_FILE_PATH]);
    await setSetting(auth.supabaseAdmin, "signature_path", null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
