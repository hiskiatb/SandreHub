// app/api/report-merge/send/route.js
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireReportMergeAccess } from "../../../../lib/reportMerge/auth";

const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const SENDER_EMAIL = (process.env.SENDER_EMAIL || "").trim();
const SENDER_NAME = (process.env.SENDER_NAME || "Report Merge").trim();
const TEST_RECIPIENT_EMAIL = (process.env.TEST_RECIPIENT_EMAIL || "").trim();
const SETUP_OK = Boolean(RESEND_API_KEY && SENDER_EMAIL);
const resend = SETUP_OK ? new Resend(RESEND_API_KEY) : null;
const fromHeader = `${SENDER_NAME} <${SENDER_EMAIL}>`;

export async function POST(req) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });

  if (!SETUP_OK) {
    return NextResponse.json({ ok: false, error: "Setup Resend belum lengkap (RESEND_API_KEY / SENDER_EMAIL)." }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const to = (body.to || "").trim();
  const cc = (body.cc || "").trim();
  const subject = body.subject || "";
  const html = body.html || "";
  const mode = body.mode || "draft"; // 'draft' = kirim uji coba ke TEST_RECIPIENT_EMAIL saja; 'send' = kirim sungguhan

  if (!to) {
    return NextResponse.json({ ok: false, error: "Alamat To kosong." }, { status: 400 });
  }

  const toList = to.split(";").map((s) => s.trim()).filter(Boolean);
  const ccList = cc.split(";").map((s) => s.trim()).filter(Boolean);

  const fullHtml =
    `<html><head><meta charset="utf-8"></head>` +
    `<body style="font-family:Arial,Helvetica,sans-serif;font-size:13.5px;color:#4D4D4F;">` +
    `${html}</body></html>`;

  let finalTo = toList;
  let finalCc = ccList;
  let finalSubject = subject;

  if (mode !== "send") {
    if (!TEST_RECIPIENT_EMAIL) {
      return NextResponse.json({
        ok: false,
        error: "TEST_RECIPIENT_EMAIL belum diisi di environment — wajib diisi supaya mode Draft/Uji coba aman dipakai.",
      }, { status: 400 });
    }
    finalTo = [TEST_RECIPIENT_EMAIL];
    finalCc = [];
    finalSubject = `[UJI COBA] ${subject}`;
  }

  try {
    const result = await resend.emails.send({
      from: fromHeader,
      to: finalTo,
      cc: finalCc.length ? finalCc : undefined,
      subject: finalSubject,
      html: fullHtml,
    });

    if (result.error) {
      throw new Error(result.error.message || JSON.stringify(result.error));
    }

    return NextResponse.json({ ok: true, mode });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
