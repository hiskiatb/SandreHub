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
      from: "Omni Trace <onboarding@resend.dev>",
      to: email,
      subject: "Kode OTP Verifikasi",
      html: `
        <div style="font-family:Arial">
          <h2>OTP Verifikasi</h2>
          <p>Kode kamu:</p>
          <h1>${otp}</h1>
          <p>Kode berlaku 5 menit</p>
        </div>
      `,
    });

    console.log("[EMAIL SUCCESS]", result);
    return result;
  } catch (err) {
    console.error("[EMAIL ERROR]", err);
    throw err;
  }
}