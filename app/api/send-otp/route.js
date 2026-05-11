import { Resend } from "resend";

// Inisialisasi Resend di luar handler untuk efisiensi
const resendApiKey = process.env.RESEND_API_KEY;

export async function POST(req) {
  try {
    const { email, otp } = await req.json();

    // 1. Validasi Input
    if (!email || !otp) {
      return Response.json(
        { success: false, error: "Email dan OTP wajib diisi" },
        { status: 400 }
      );
    }

    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY belum dikonfigurasi di environment");
    }

    console.log(`📤 [API] Mengirim OTP ke: ${email} via SandraHub (spmsumatera.site)`);

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY belum dikonfigurasi");
    }

    const resend = new Resend(resendApiKey);

    // 2. Proses Pengiriman Email
    const { data, error } = await resend.emails.send({
      from: "SandraHub <no-reply@spmsumatera.site>",
      to: email,
      subject: "🔐 Kode OTP Verifikasi Akun - SandraHub",

      html: `
      <div style="
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif;
        background: #f5f9ff;
        padding: 40px 0;
      ">
        <div style="
          max-width: 560px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid rgba(0,0,0,0.06);
          box-shadow: 0 20px 50px rgba(10,132,255,0.08);
        ">

          <!-- HEADER -->
          <div style="
            background: linear-gradient(135deg, #0A84FF, #4DA3FF);
            padding: 28px;
            text-align: center;
            color: white;
          ">
            <div style="font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">
              SandraHub
            </div>
            <div style="font-size: 12px; opacity: 0.85; margin-top: 6px;">
              SPM Sumatera Secure Access System
            </div>
          </div>

          <!-- BODY -->
          <div style="padding: 36px 30px; text-align: center;">

            <h2 style="
              margin: 0;
              font-size: 20px;
              color: #111827;
              font-weight: 700;
            ">
              Verifikasi Akun Anda
            </h2>

            <p style="
              margin-top: 10px;
              font-size: 14px;
              color: #6B7280;
              line-height: 1.6;
            ">
              Gunakan kode OTP berikut untuk melanjutkan proses pendaftaran akun SandraHub.
            </p>

            <!-- OTP BOX -->
            <div style="
              margin: 28px 0;
              padding: 22px;
              border-radius: 14px;
              background: rgba(10,132,255,0.08);
              border: 1px solid rgba(10,132,255,0.25);
            ">
              <div style="
                font-size: 34px;
                font-weight: 800;
                letter-spacing: 8px;
                color: #0A84FF;
              ">
                ${otp}
              </div>
            </div>

            <p style="
              font-size: 12.5px;
              color: #9CA3AF;
              line-height: 1.5;
            ">
              OTP ini berlaku selama <strong style="color:#111827;">10 menit</strong>.<br/>
              Jika Anda tidak merasa meminta kode ini, Anda dapat mengabaikan email ini dengan aman.
            </p>

          </div>

          <!-- FOOTER -->
          <div style="
            padding: 18px;
            text-align: center;
            font-size: 11px;
            color: #9CA3AF;
            border-top: 1px solid rgba(0,0,0,0.05);
            background: #f9fbff;
          ">
            <div style="font-weight: 600; color: #6B7280;">
              © 2026 SandraHub
            </div>
            <div style="margin-top: 4px;">
              Powered by SPM Sumatera · spmsumatera.site
            </div>
          </div>

        </div>
      </div>
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