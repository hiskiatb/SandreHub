// app/api/report-merge/settings/route.js
import { NextResponse } from "next/server";
import { requireReportMergeAccess } from "../../../../lib/reportMerge/auth";
import { getEffectiveApproverEmail, getSetting, getAllMemoFieldMemory } from "../../../../lib/reportMerge/settings";

const SIGNATURE_STORAGE_BUCKET = "rm-signatures";

export async function GET(req) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  try {
    const approverEmail = await getEffectiveApproverEmail(auth.supabaseAdmin);
    const signaturePath = await getSetting(auth.supabaseAdmin, "signature_path");
    let signatureUrl = null;
    if (signaturePath) {
      const { data: signed } = await auth.supabaseAdmin.storage
        .from(SIGNATURE_STORAGE_BUCKET)
        .createSignedUrl(signaturePath, 3600);
      signatureUrl = signed ? signed.signedUrl : null;
    }
    let letterSigners = { kota: "", signers: [] };
    try {
      const raw = await getSetting(auth.supabaseAdmin, "letter_signers");
      if (raw) letterSigners = JSON.parse(raw);
    } catch (e) { /* biarin default kosong kalau isinya rusak */ }
    const memoFields = await getAllMemoFieldMemory(auth.supabaseAdmin);
    return NextResponse.json({ ok: true, approverEmail, hasSignature: Boolean(signaturePath), signatureUrl, letterSigners, memoFields });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
