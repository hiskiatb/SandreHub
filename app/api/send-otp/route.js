import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;

export async function POST(req) {
  try {
    const { email, otp } = await req.json();

    if (!email || !otp)
      return Response.json({ success: false, error: "Email dan OTP wajib diisi" }, { status: 400 });
    if (!resendApiKey)
      throw new Error("RESEND_API_KEY belum dikonfigurasi di environment");

    console.log(`📤 [API] Mengirim OTP ke: ${email}`);
    const resend = new Resend(resendApiKey);
    const digits = String(otp).split("");

    const cell = (digit) => `
      <td class="otp-td" align="center" valign="middle" width="60"
          style="width:60px;padding:0 5px;font-size:0;line-height:0;mso-line-height-rule:exactly;">
        <div class="otp-cell"
             style="width:60px;height:70px;line-height:70px;
                    background:#FFFFFF;border:2px solid #ED1C24;border-radius:14px;
                    box-sizing:border-box;
                    font-family:'SF Mono',ui-monospace,Menlo,Consolas,'Courier New',monospace;
                    font-size:30px;font-weight:800;color:#111113;
                    text-align:center;letter-spacing:0;
                    mso-line-height-rule:exactly;">${digit}</div>
      </td>`;

    const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="id">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="x-apple-disable-message-reformatting"/>
  <meta name="color-scheme" content="light dark"/>
  <meta name="supported-color-schemes" content="light dark"/>
  <title>Kode OTP SandraHub</title>
  <style type="text/css">
    body,table,td,p,a,h1,div{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;}
    img{border:0;line-height:100%;outline:none;text-decoration:none;display:block;}
    body{margin:0!important;padding:0!important;width:100%!important;}
    :root{color-scheme:light dark;supported-color-schemes:light dark;}

    @supports (-webkit-background-clip: text) {
      .wm-hub {
        background: linear-gradient(90deg, #ED1C24, #C6168D) !important;
        -webkit-background-clip: text !important;
        -webkit-text-fill-color: transparent !important;
      }
    }

    @media only screen and (max-width:600px){
      .container{width:100%!important;max-width:100%!important;}
      .px{padding-left:20px!important;padding-right:20px!important;}
      .otp-cell{width:44px!important;height:56px!important;line-height:56px!important;font-size:22px!important;border-radius:10px!important;}
      .otp-td{width:44px!important;padding:0 3px!important;}
      .wordmark{font-size:26px!important;}
      .h1{font-size:20px!important;}
    }

    @media (prefers-color-scheme:dark){
      .bg-page {background:#0D0D0E!important;}
      .card    {background:#1A1A1D!important;border-color:#2A2A2F!important;}
      .hdr     {background:#111113!important;}
      .body-bg {background:#1A1A1D!important;}
      .ftr-bg  {background:#111113!important;}
      .ink     {color:#F2F2F3!important;}
      .mute    {color:#8A8A96!important;}
      .mute2   {color:#5A5A68!important;}
      .divider {background:#2A2A2F!important;}
      .wm-sandra{color:#F2F2F3!important;}
      .wm-hub   {color:#FF6BC8!important;} 
      .otp-cell {background:#202024!important;color:#F2F2F3!important;border-color:#ED1C24!important;}
      .warn-box {background:rgba(255,255,255,0.03)!important;border-color:#2A2A2F!important;border-left-color:#ED1C24!important;}
      .warn-txt {color:#8A8A96!important;}
      .warn-strong{color:#F2F2F3!important;}
    }
  </style>
</head>

<body class="bg-page"
      style="margin:0;padding:0;background:#F5F5F6;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;
             color:#111113;">

  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#F5F5F6;opacity:0;">
    Kode OTP Anda: ${otp} — Jangan bagikan ke siapapun.
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
         class="bg-page" bgcolor="#F5F5F6" style="background:#F5F5F6;">
    <tr><td align="center" style="padding:48px 16px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0"
             width="560" class="container card"
             style="width:560px;max-width:560px;background:#FFFFFF;
                    border:1px solid #E2E2E6;border-radius:18px;overflow:hidden;">

        <tr>
          <td height="3" bgcolor="#ED1C24"
              style="height:3px;line-height:3px;font-size:0;mso-line-height-rule:exactly;
                     background:linear-gradient(90deg,#ED1C24 0%,#FFCB05 33%,#32BCAD 66%,#C6168D 100%);">&nbsp;</td>
        </tr>

        <tr>
          <td class="hdr px" align="center" bgcolor="#FFFFFF"
              style="background:#FFFFFF;padding:40px 32px 20px;">

            <div class="wordmark"
                 style="font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Arial,sans-serif;
                        font-size:32px;font-weight:800;letter-spacing:-0.04em;line-height:1;">
              <span class="wm-sandra" style="color:#1A1A1D;">Sandra</span><span class="wm-hub" style="color:#C6168D;">Hub</span>
            </div>
            <div class="mute2"
                 style="margin-top:8px;font-size:10px;font-weight:600;
                        letter-spacing:0.22em;color:#8A8A96;text-transform:uppercase;">
              SPM Sumatera
            </div>
          </td>
        </tr>

        <tr>
          <td class="body-bg px" align="center" bgcolor="#FFFFFF"
              style="background:#FFFFFF;padding:24px 32px 40px;">

            <h1 class="h1 ink"
                style="margin:0 0 10px;
                       font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Arial,sans-serif;
                       font-size:22px;font-weight:700;letter-spacing:-0.02em;
                       color:#1A1A1D;line-height:1.25;">
              Verifikasi Akun Anda
            </h1>
            <p class="mute"
               style="margin:0 0 28px;font-size:14px;line-height:1.65;
                      color:#5A5A68;max-width:440px;">
              Masukkan kode OTP di bawah untuk menyelesaikan pendaftaran akun
              <strong class="ink" style="color:#1A1A1D;font-weight:600;">SandraHub</strong>.
              Kode berlaku selama <strong style="font-weight:600;">10 menit</strong>.
            </p>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                   align="center" style="margin:0 auto 28px;">
              <tr>${digits.map(cell).join("")}</tr>
            </table>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td class="warn-box"
                    style="background:#F5F5F6;border:1px solid #E2E2E6;
                           border-left:3px solid #ED1C24;border-radius:12px;
                           padding:14px 16px;font-size:12.5px;line-height:1.6;
                           color:#5A5A68;text-align:left;">
                  <strong class="warn-strong ink" style="color:#1A1A1D;font-weight:600;">
                    Jangan bagikan kode ini
                  </strong>
                  <span class="warn-txt" style="color:#5A5A68;">
                    &nbsp;kepada siapapun, termasuk tim SandraHub.
                    Jika Anda tidak merasa mendaftar, abaikan email ini.
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td class="divider" height="1"
              style="height:1px;background:#E2E2E6;font-size:0;
                     line-height:0;mso-line-height-rule:exactly;">&nbsp;</td>
        </tr>

        <tr>
          <td class="ftr-bg" align="center"
              style="background:#F5F5F6;padding:20px 32px 24px;">
            <div class="mute" style="font-size:11.5px;font-weight:500;color:#5A5A68;line-height:1.5;">
              © 2026 SandraHub · SPM Sumatera
            </div>
            <div class="mute2" style="font-size:11px;color:#8A8A96;margin-top:3px;">
              spmsumatera.site
            </div>
            <div class="mute2" style="font-size:10.5px;color:#8A8A96;margin-top:12px;line-height:1.5;">
              Email ini dikirim secara otomatis. Mohon tidak membalas email ini.
            </div>
          </td>
        </tr>
      </table>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0"
             width="560" class="container" style="width:560px;max-width:560px;">
        <tr>
          <td align="center" style="padding:14px 16px 0;">
            <div class="mute2" style="font-size:10.5px;color:#8A8A96;line-height:1.5;">
              Tidak melihat tampilan dengan baik?
              Kode OTP Anda: <strong style="color:inherit;">${otp}</strong>
            </div>
          </td>
        </tr>
      </table>

    </td></tr>
  </table>
</body>
</html>`;

    const { data, error } = await resend.emails.send({
      from: "SandraHub <sandra@spmsumatera.site>",
      to: email,
      subject: "Kode OTP Verifikasi Akun SandraHub",
      html,
      text: `Verifikasi Akun SandraHub\n\nKode OTP Anda: ${otp}\n\nJangan bagikan kode ini kepada siapapun, termasuk tim SandraHub.\nKode berlaku selama 10 menit.\n\nJika Anda tidak merasa mendaftar, abaikan email ini.\n\n— SandraHub · SPM Sumatera\nspmsumatera.site`,
    });

    if (error) {
      console.error("❌ [RESEND ERROR]", error);
      return Response.json({ success: false, error: error.message }, { status: 400 });
    }

    return Response.json({ success: true, message: "OTP berhasil terkirim ke " + email, id: data?.id });
  } catch (err) {
    console.error("[CRITICAL SEND ERROR]", err);
    return Response.json({ success: false, error: "Gagal mengirim email: " + err.message }, { status: 500 });
  }
}