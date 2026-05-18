import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;

export async function POST(req) {
  try {
    const { email, otp } = await req.json();

    if (!email || !otp) {
      return Response.json(
        { success: false, error: "Email dan OTP wajib diisi" },
        { status: 400 }
      );
    }

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY belum dikonfigurasi di environment");
    }

    console.log(`📤 [API] Mengirim OTP ke: ${email}`);

    const resend = new Resend(resendApiKey);

    // Split OTP digits for individual boxes
    const digits = String(otp).split("");

    const digitBox = (d) => `
      <td style="padding: 0 5px;">
        <div style="
          width: 44px;
          height: 52px;
          background: #ffffff;
          border: 2px solid #ED1C24;
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 26px;
          font-weight: 800;
          color: #ED1C24;
          letter-spacing: 0;
          line-height: 1;
          text-align: center;
          vertical-align: middle;
          font-family: 'SF Mono', 'Courier New', monospace;
        ">${d}</div>
      </td>
    `;

    const { data, error } = await resend.emails.send({
      from: "SandraHub <no-reply@spmsumatera.site>",
      to: email,
      subject: "Kode OTP Verifikasi Akun SandraHub",
      html: `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Kode OTP SandraHub</title>
</head>
<body style="margin:0;padding:0;background:#F0F0F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;">

  <!-- Preheader (hidden preview text) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    Kode OTP Anda: ${otp} — berlaku 10 menit. Jangan bagikan ke siapapun.
  </div>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F0F3;padding:40px 16px;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid rgba(0,0,0,0.08);box-shadow:0 8px 40px rgba(0,0,0,0.10);">

          <!-- Top stripe: Indosat 4-colour bar -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#ED1C24 0%,#FFCB05 33%,#32BCAD 66%,#C6168D 100%);font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1A0506 0%,#111113 100%);padding:28px 32px;text-align:center;">

              <!-- Logo row -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <!-- Icon box -->
                    <div style="
                      width:48px;height:48px;
                      background:linear-gradient(135deg,#ED1C24,#C6168D);
                      border-radius:12px;
                      display:inline-flex;align-items:center;justify-content:center;
                      margin-bottom:12px;
                    ">
                      <!-- Simple box icon (SVG) -->
                      <img src="https://spmsumatera.site/icon-box.png" width="24" height="24" alt="" style="display:block;" onerror="this.style.display='none'"/>
                    </div>
                    <div style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#F2F2F3;line-height:1;">
                      Sandra<span style="background:linear-gradient(90deg,#ED1C24,#C6168D);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Hub</span>
                    </div>
                    <div style="margin-top:6px;font-size:10px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;color:rgba(255,255,255,0.40);">
                      SPM SUMATERA
                    </div>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 28px;text-align:center;">

              <!-- Shield icon area -->
              <div style="
                width:56px;height:56px;
                background:rgba(237,28,36,0.08);
                border:1px solid rgba(237,28,36,0.20);
                border-radius:14px;
                display:inline-flex;align-items:center;justify-content:center;
                margin-bottom:20px;
              ">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6L12 2z" fill="#ED1C24" opacity="0.15"/>
                  <path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6L12 2z" stroke="#ED1C24" stroke-width="1.5" stroke-linejoin="round"/>
                  <polyline points="9 12 11 14 15 10" stroke="#ED1C24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>

              <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;letter-spacing:-0.03em;color:#111113;">
                Verifikasi Akun Anda
              </h1>
              <p style="margin:0 0 28px;font-size:14px;color:#5A5A68;line-height:1.65;max-width:400px;margin-left:auto;margin-right:auto;">
                Gunakan kode OTP di bawah untuk menyelesaikan pendaftaran akun <strong style="color:#111113;">SandraHub</strong>. Kode ini bersifat rahasia.
              </p>

              <!-- OTP digit boxes -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 28px;">
                <tr>
                  ${digits.map(d => digitBox(d)).join("")}
                </tr>
              </table>

              <!-- Expiry pill -->
              <div style="
                display:inline-block;
                padding:8px 18px;
                border-radius:99px;
                background:rgba(255,203,5,0.10);
                border:1px solid rgba(255,203,5,0.35);
                font-size:12.5px;
                font-weight:600;
                color:#8a6a00;
                margin-bottom:24px;
              ">
                ⏱ Berlaku selama <strong>10 menit</strong>
              </div>

              <!-- Warning -->
              <div style="
                background:#FFF5F5;
                border:1px solid rgba(237,28,36,0.18);
                border-left:3px solid #ED1C24;
                border-radius:10px;
                padding:12px 16px;
                text-align:left;
                font-size:12.5px;
                color:#5A5A68;
                line-height:1.6;
              ">
                <strong style="color:#111113;">⚠️ Jangan bagikan kode ini</strong> kepada siapapun, termasuk tim SandraHub.
                Jika Anda tidak merasa mendaftar, abaikan email ini.
              </div>

            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="height:1px;background:rgba(0,0,0,0.07);font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;text-align:center;background:#F8F8FA;">

              <!-- Brand dots -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 12px;">
                <tr>
                  <td><div style="width:8px;height:8px;border-radius:50%;background:#ED1C24;margin:0 3px;display:inline-block;"></div></td>
                  <td><div style="width:8px;height:8px;border-radius:50%;background:#FFCB05;margin:0 3px;display:inline-block;"></div></td>
                  <td><div style="width:8px;height:8px;border-radius:50%;background:#32BCAD;margin:0 3px;display:inline-block;"></div></td>
                  <td><div style="width:8px;height:8px;border-radius:50%;background:#C6168D;margin:0 3px;display:inline-block;"></div></td>
                </tr>
              </table>

              <div style="font-size:11.5px;font-weight:600;color:#4D4D4F;margin-bottom:4px;">
                © 2026 SandraHub · PT Indosat Ooredoo Hutchison
              </div>
              <div style="font-size:11px;color:#9A9AAA;">
                SPM Sumatera · spmsumatera.site
              </div>
              <div style="margin-top:10px;font-size:10.5px;color:#AEAEBC;">
                Email ini dikirim otomatis. Mohon tidak membalas email ini.
              </div>
            </td>
          </tr>

        </table>
        <!-- End card -->

      </td>
    </tr>
  </table>

</body>
</html>
      `,
    });

    if (error) {
      console.error("❌ [RESEND ERROR]", error);
      return Response.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    return Response.json({
      success: true,
      message: "OTP berhasil terkirim ke " + email,
      id: data?.id,
    });

  } catch (err) {
    console.error("[CRITICAL SEND ERROR]", err);
    return Response.json(
      { success: false, error: "Gagal mengirim email: " + err.message },
      { status: 500 }
    );
  }
}