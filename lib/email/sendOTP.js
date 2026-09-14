// SECURITY: hanya kirim {email} — OTP di-generate & disimpan DI SERVER
// (app/api/send-otp/route.js, pakai service role), bukan lagi di sini.
// Jangan kembalikan ke pola lama (generate di client lalu kirim otp-nya
// lewat body) — itu penyebab celah bypass verifikasi email (lihat catatan
// keamanan di route.js).
export async function sendOTPEmail(email) {
  const res = await fetch("/api/send-otp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });

  const text = await res.text();

  try {
    return JSON.parse(text);
  } catch (err) {
    console.error("[SEND OTP RESPONSE NOT JSON]", text);
    throw new Error("Server tidak mengembalikan JSON valid");
  }
}