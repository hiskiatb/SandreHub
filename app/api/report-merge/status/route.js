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
      error: "RESEND_API_KEY / SENDER_EMAIL belum diisi di environment.",
    });
  }

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
      sender: `${SENDER_NAME} <${SENDER_EMAIL}>`,
      domain: senderDomain,
      domainVerified,
      domainStatus: match ? match.status : "not_found",
      aiReady: Boolean(ANTHROPIC_API_KEY),
      supabaseReady: true,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
