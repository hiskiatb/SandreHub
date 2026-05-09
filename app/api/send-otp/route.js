import { Resend } from "resend";

// Inisialisasi Resend di luar handler untuk efisiensi
const resend = new Resend(process.env.RESEND_API_KEY);

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

    console.log(`📤 [API] Mengirim OTP ke: ${email} menggunakan domain spmsumatera.site`);

    // 2. Proses Pengiriman Email
    const { data, error } = await resend.emails.send({
      // Menggunakan domain kustom yang sudah Anda verifikasi
      from: "Omni Trace <no-reply@spmsumatera.site>",
      to: email,
      subject: "🔑 Kode OTP Verifikasi Akun - Omni Trace",
      html: `
        <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="background-color: #000; color: #fff; padding: 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px; letter-spacing: 2px;">OMNI TRACE</h1>
            <p style="margin: 10px 0 0; opacity: 0.8; font-size: 14px;">Secure Access System</p>
          </div>
          
          <div style="padding: 40px; color: #333;">
            <h2 style="margin-top: 0; color: #000; text-align: center;">Verifikasi Akun Anda</h2>
            <p style="text-align: center; color: #666; font-size: 16px;">
              Gunakan kode di bawah ini untuk melanjutkan proses pendaftaran.
            </p>
            
            <div style="background-color: #f8f9fa; border: 2px dashed #ddd; padding: 30px; text-align: center; border-radius: 12px; margin: 30px 0;">
              <span style="font-size: 42px; font-weight: 800; letter-spacing: 10px; color: #000;">${otp}</span>
            </div>
            
            <p style="font-size: 13px; color: #999; text-align: center; line-height: 1.5;">
              Kode ini berlaku selama <strong>10 menit</strong>.<br>
              Jika Anda tidak meminta kode ini, silakan abaikan email ini dengan aman.
            </p>
          </div>
          
          <div style="background-color: #fafafa; padding: 20px; text-align: center; border-top: 1px solid #eee; font-size: 12px; color: #aaa;">
            <p style="margin: 0;">© 2026 Omni Trace Development Team</p>
            <p style="margin: 5px 0 0;">Sent via spmsumatera.site</p>
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