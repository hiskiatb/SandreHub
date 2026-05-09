export async function sendOTPEmail(email, otp) {
  const res = await fetch("/api/send-otp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, otp }),
  });

  const text = await res.text();

  try {
    return JSON.parse(text);
  } catch (err) {
    console.error("[SEND OTP RESPONSE NOT JSON]", text);
    throw new Error("Server tidak mengembalikan JSON valid");
  }
}