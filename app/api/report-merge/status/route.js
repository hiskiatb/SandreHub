// app/api/report-merge/status/route.js
import { NextResponse } from "next/server";
import { requireReportMergeAccess } from "../../../../lib/reportMerge/auth";

const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const SENDER_EMAIL = (process.env.SENDER_EMAIL || "").trim();
const SENDER_NAME = (process.env.SENDER_NAME || "Report Merge").trim();
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
const SETUP_OK = Boolean(RESEND_API_KEY && SENDER_EMAIL);

export async function GET(req) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });

  if (!SETUP_OK) {
    return NextResponse.json({
      ok: false,
      needsSetup: true,
      // SENDER_NAME/EMAIL bisa saja sudah terisi walau RESEND_API_KEY
      // belum — tetap dikirim di sini (lihat catatan di bawah soal kenapa
      // field ini penting untuk selalu dikirim, bukan cuma saat ok:true).
      sender: SENDER_EMAIL ? `${SENDER_NAME} <${SENDER_EMAIL}>` : "",
      error: "RESEND_API_KEY / SENDER_EMAIL belum diisi di environment.",
    });
  }

  // `sender` (nama & alamat pengirim dari environment) dikirim di SEMUA
  // jalur di bawah — termasuk kalau panggilan ke Resend gagal/timeout —
  // supaya field "Pengirim (Terkunci)" di web tetap bisa terisi dari
  // environment dan TIDAK nyangkut selamanya di placeholder "Memuat dari
  // server…" hanya gara-gara cek verifikasi domain ke Resend yang gagal
  // (mis. API key salah, atau server tidak bisa akses api.resend.com).
  const fromHeader = `${SENDER_NAME} <${SENDER_EMAIL}>`;

  try {
    const r = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });
    if (!r.ok) throw new Error(`Resend API menolak (HTTP ${r.status}) — cek RESEND_API_KEY.`);
    const domainsData = await r.json();
    const domainList = Array.isArray(domainsData.data) ? domainsData.data : [];
    const senderDomain = (SENDER_EMAIL.split("@")[1] || "").toLowerCase();
    const match = domainList.find((d) => (d.name || "").toLowerCase() === senderDomain);
    const domainVerified = Boolean(match && match.status === "verified");
    return NextResponse.json({
      ok: true,
      sender: fromHeader,
      domain: senderDomain,
      domainVerified,
      domainStatus: match ? match.status : "not_found",
      aiReady: Boolean(ANTHROPIC_API_KEY),
      supabaseReady: true,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, sender: fromHeader, error: String(e?.message || e) }, { status: 500 });
  }
}
