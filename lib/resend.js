import { Resend } from "resend";

// ================= DEBUG SUPER DETAIL =================
console.log("===== RESEND ENV DEBUG =====");
console.log("1. Node env:", process.env.NODE_ENV);
console.log("2. All env keys contain RESEND?:", Object.keys(process.env).filter(k => k.includes("RESEND")));
console.log("3. RESEND_API_KEY raw:", process.env.RESEND_API_KEY);
console.log("4. length:", process.env.RESEND_API_KEY?.length);
console.log("============================");

// ================= VALIDATION =================
const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  throw new Error(`
❌ RESEND_API_KEY NOT FOUND

CHECKLIST:
- .env.local ada di root project?
- nama file benar: .env.local (bukan .env.local.txt)
- sudah restart NEXT server?
- jangan import file ini di client component
- pastikan tidak pakai Turbopack cache lama
`);
}

// ================= RESEND INIT =================
const resend = new Resend(apiKey);

// ================= EMAIL FUNCTION =================
export async function sendOTPEmail(email, otp) {
  try {
    console.log("[EMAIL] Sending OTP to:", email);

    const result = await resend.emails.send({
      from: "SandraHub <no-reply@sandrahub.io>",
      to: email,
      subject: "Kode OTP Verifikasi Akun SandraHub",
      html: `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>OTP Verification</title>
  </head>

  <body style="margin:0; padding:0; background:#0b0f17; font-family:Arial, sans-serif;">
    
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f17; padding:40px 0;">
      <tr>
        <td align="center">

          <!-- CARD -->
          <table width="100%" style="max-width:520px; background:#111827; border-radius:16px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.5);">

            <!-- HEADER -->
            <tr>
              <td style="padding:28px 32px; text-align:center; background:linear-gradient(135deg,#0A84FF,#1E40AF);">
                <div style="font-size:20px; font-weight:700; color:#fff; letter-spacing:0.5px;">
                  SandraHub
                </div>
                <div style="font-size:12px; color:rgba(255,255,255,0.85); margin-top:4px;">
                  by SPM Sumatera
                </div>
              </td>
            </tr>

            <!-- BODY -->
            <tr>
              <td style="padding:32px; color:#E5E7EB;">

                <h2 style="margin:0 0 12px; font-size:20px; color:#ffffff;">
                  Verifikasi Email Kamu
                </h2>

                <p style="margin:0 0 20px; font-size:14px; color:#A1A1AA; line-height:1.6;">
                  Gunakan kode OTP di bawah ini untuk menyelesaikan proses verifikasi akun SandraHub kamu.
                </p>

                <!-- OTP BOX -->
                <div style="
                  margin:24px 0;
                  padding:18px;
                  background:#0f172a;
                  border:1px solid rgba(255,255,255,0.08);
                  border-radius:12px;
                  text-align:center;
                ">
                  <div style="font-size:12px; color:#9CA3AF; margin-bottom:8px;">
                    Kode OTP kamu
                  </div>

                  <div style="
                    font-size:32px;
                    letter-spacing:8px;
                    font-weight:700;
                    color:#0A84FF;
                  ">
                    ${otp}
                  </div>
                </div>

                <p style="margin:0 0 10px; font-size:13px; color:#9CA3AF;">
                  ⏱ Kode ini berlaku selama <b style="color:#E5E7EB;">5 menit</b>
                </p>

                <p style="margin:0; font-size:12px; color:#6B7280; line-height:1.6;">
                  Jika kamu tidak meminta kode ini, kamu bisa mengabaikan email ini.
                </p>

              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td style="padding:18px 32px; text-align:center; background:#0b1220; border-top:1px solid rgba(255,255,255,0.06);">
                <p style="margin:0; font-size:11px; color:#6B7280;">
                  © ${new Date().getFullYear()} SandraHub · SPM Sumatera
                </p>
              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>

  </body>
</html>
      `,
    });

    console.log("[EMAIL SUCCESS]", result);
    return result;
  } catch (err) {
    console.error("[EMAIL ERROR]", err);
    throw err;
  }
}