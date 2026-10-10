import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { createHmac, randomInt, timingSafeEqual } from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/marta/forgot-password
//
// Lupa kata sandi MartaHub CMS - KHUSUS role "spm_sumatera" (role lain,
// mis. marketing_sumatera_program, login passwordless via OTP & tidak punya
// kata sandi, jadi TIDAK boleh lewat sini). Dua aksi dalam satu endpoint:
//
//   { action: "send",  email }                  → kirim kode 6 digit ke email
//   { action: "reset", email, otp, password }   → cek kode, ganti kata sandi
//
// Kata sandi diganti di level akun Supabase Auth (auth.admin.updateUserById),
// jadi OTOMATIS berlaku juga utk login SandraHub - keduanya memakai akun &
// project Supabase yang sama (signInWithPassword).
//
// Keamanan:
//  - Role dicek di SERVER (service role), bukan di client.
//  - "send" selalu balas sukses generik (tidak membocorkan email terdaftar atau
//    tidak) & tidak mengirim apa pun utk email non-spm_sumatera.
//  - Kode disimpan sbg HMAC (bukan plaintext) di tabel khusus
//    marta_password_resets (bukan email_otps), berlaku 10 menit, maksimal 5
//    kali salah, sekali pakai, dan jeda 60 detik antar permintaan kirim.
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_ROLE = "spm_sumatera";
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_GAP_MS = 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const json = (body, status = 200) => NextResponse.json(body, { status });

function hashCode(email, code) {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY || "")
    .update(`${email}:${code}`)
    .digest("hex");
}

function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a), "hex");
  const bb = Buffer.from(String(b), "hex");
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}

// Cari profil spm_sumatera dgn email ini. ilike (tanpa wildcard - karakter
// % _ \ di-escape) supaya tetap cocok walau profil tersimpan beda huruf besar.
async function findAllowedProfile(admin, email) {
  const escaped = email.replace(/[\\%_]/g, (m) => "\\" + m);
  const { data } = await admin.from("profiles").select("id, role, full_name").ilike("email", escaped).limit(1).maybeSingle();
  if (!data || data.role !== ALLOWED_ROLE) return null;
  return data;
}

function emailHtml(code, name) {
  const digits = String(code).split("");
  const cell = (d) =>
    `<td align="center" style="padding:0 4px;"><div style="width:46px;height:56px;line-height:56px;background:#FFFFFF;border:2px solid #ED1C24;border-radius:12px;font-family:'SF Mono',ui-monospace,Menlo,Consolas,monospace;font-size:26px;font-weight:800;color:#111113;text-align:center;">${d}</div></td>`;
  const hello = name ? `Halo <strong>${String(name).replace(/[<>&"]/g, "")}</strong>,` : "Halo,";
  return `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Reset Kata Sandi MartaHub</title></head>
<body style="margin:0;padding:0;background:#F5F5F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#111113;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Kode reset kata sandi Anda: ${code} - jangan bagikan ke siapa pun.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F5F6;"><tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px;background:#FFFFFF;border:1px solid #E2E2E6;border-radius:18px;overflow:hidden;">
<tr><td height="3" style="height:3px;line-height:3px;font-size:0;background:linear-gradient(90deg,#ED1C24,#C6168D);">&nbsp;</td></tr>
<tr><td align="center" style="padding:34px 28px 8px;">
<div style="font-size:30px;font-weight:800;letter-spacing:-0.04em;line-height:1;"><span style="color:#1A1A1D;">Marta</span><span style="color:#C6168D;">Hub</span></div>
<div style="margin-top:8px;font-size:10px;font-weight:600;letter-spacing:0.22em;color:#8A8A96;text-transform:uppercase;">Marketing Sumatera</div>
</td></tr>
<tr><td align="center" style="padding:20px 28px 34px;">
<h1 style="margin:0 0 10px;font-size:21px;font-weight:700;letter-spacing:-0.02em;color:#1A1A1D;">Reset Kata Sandi</h1>
<p style="margin:0 0 24px;font-size:14px;line-height:1.65;color:#5A5A68;">${hello} masukkan kode di bawah pada halaman login untuk mengatur ulang kata sandi Anda. Kode berlaku <strong>10 menit</strong>. Kata sandi baru juga berlaku untuk login SandraHub.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 24px;"><tr>${digits.map(cell).join("")}</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#F5F5F6;border:1px solid #E2E2E6;border-left:3px solid #ED1C24;border-radius:12px;padding:13px 15px;font-size:12.5px;line-height:1.6;color:#5A5A68;text-align:left;"><strong style="color:#1A1A1D;">Jangan bagikan kode ini</strong> kepada siapa pun. Jika Anda tidak meminta reset kata sandi, abaikan email ini - kata sandi Anda tidak akan berubah.</td></tr></table>
</td></tr>
<tr><td align="center" style="background:#F5F5F6;padding:18px 28px 22px;border-top:1px solid #E2E2E6;"><div style="font-size:11.5px;color:#5A5A68;">© 2026 MartaHub · SPM Sumatera</div><div style="font-size:10.5px;color:#8A8A96;margin-top:8px;">Email ini dikirim otomatis. Mohon tidak membalas.</div></td></tr>
</table></td></tr></table></body></html>`;
}

async function handleSend(admin, email) {
  const generic = json({ success: true });
  if (!EMAIL_RE.test(email)) return json({ success: false, error: "Masukkan email yang valid." }, 400);

  const profile = await findAllowedProfile(admin, email);
  if (!profile) return generic; // bukan spm_sumatera / tidak terdaftar - diam saja

  // Jeda antar permintaan kirim (anti-spam email).
  const since = new Date(Date.now() - RESEND_GAP_MS).toISOString();
  const { data: recent } = await admin
    .from("marta_password_resets").select("id").eq("email", email).gt("created_at", since).limit(1);
  if (recent && recent.length) return generic;

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return json({ success: false, error: "Konfigurasi server belum lengkap." }, 500);

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await admin.from("marta_password_resets").delete().eq("email", email); // hanya 1 kode aktif per email
  const { data: row, error: insErr } = await admin
    .from("marta_password_resets")
    .insert({ email, code_hash: hashCode(email, code), expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString() })
    .select("id").single();
  if (insErr || !row) {
    console.error("❌ [FORGOT-PASSWORD INSERT ERROR]", insErr);
    return json({ success: false, error: "Gagal menyiapkan kode. Coba lagi." }, 500);
  }

  const resend = new Resend(resendApiKey);
  const { error: mailErr } = await resend.emails.send({
    from: "MartaHub <sandra@spmsumatera.site>",
    to: email,
    subject: "Kode Reset Kata Sandi MartaHub",
    html: emailHtml(code, profile.full_name),
    text: `Reset Kata Sandi MartaHub\n\nKode Anda: ${code}\n\nBerlaku 10 menit. Jangan bagikan kode ini kepada siapa pun.\nKata sandi baru juga berlaku untuk login SandraHub.\nJika Anda tidak meminta reset, abaikan email ini.\n\n— MartaHub · SPM Sumatera`,
  });
  if (mailErr) {
    console.error("❌ [FORGOT-PASSWORD RESEND ERROR]", mailErr);
    await admin.from("marta_password_resets").delete().eq("id", row.id); // jangan tinggalkan kode yg tak pernah sampai
    return json({ success: false, error: "Gagal mengirim email. Coba lagi." }, 500);
  }
  return generic;
}

async function handleReset(admin, email, otp, password) {
  const badCode = (msg = "Kode salah atau sudah kedaluwarsa. Kirim ulang kode.") => json({ success: false, error: msg }, 400);

  if (!EMAIL_RE.test(email)) return json({ success: false, error: "Masukkan email yang valid." }, 400);
  if (!/^\d{6}$/.test(otp)) return json({ success: false, error: "Kode harus 6 digit angka." }, 400);
  if (typeof password !== "string" || password.length < 8)
    return json({ success: false, error: "Kata sandi minimal 8 karakter." }, 400);
  if (password.length > 72) return json({ success: false, error: "Kata sandi maksimal 72 karakter." }, 400);

  const profile = await findAllowedProfile(admin, email);
  if (!profile) return badCode();

  const { data: row } = await admin
    .from("marta_password_resets").select("*")
    .eq("email", email).eq("used", false)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!row) return badCode();

  if (new Date(row.expires_at) < new Date() || row.attempts >= MAX_ATTEMPTS) {
    await admin.from("marta_password_resets").update({ used: true }).eq("id", row.id);
    return badCode(row.attempts >= MAX_ATTEMPTS ? "Terlalu banyak percobaan. Kirim ulang kode." : undefined);
  }

  if (!safeEqualHex(row.code_hash, hashCode(email, otp))) {
    const attempts = row.attempts + 1;
    await admin.from("marta_password_resets").update({ attempts, used: attempts >= MAX_ATTEMPTS }).eq("id", row.id);
    const left = MAX_ATTEMPTS - attempts;
    return badCode(left > 0 ? `Kode salah. Sisa percobaan: ${left}.` : "Terlalu banyak percobaan. Kirim ulang kode.");
  }

  // Klaim kode secara atomik (cegah dipakai 2x dari request paralel).
  const { data: claimed } = await admin
    .from("marta_password_resets").update({ used: true }).eq("id", row.id).eq("used", false).select("id");
  if (!claimed || !claimed.length) return badCode();

  const { error: updErr } = await admin.auth.admin.updateUserById(profile.id, { password });
  if (updErr) {
    await admin.from("marta_password_resets").update({ used: false }).eq("id", row.id); // beri kesempatan coba lagi
    const m = String(updErr.message || "").toLowerCase();
    if (m.includes("different from the old")) return json({ success: false, error: "Kata sandi baru harus berbeda dari yang lama." }, 400);
    if (m.includes("weak") || m.includes("password")) return json({ success: false, error: "Kata sandi terlalu lemah. Gunakan kombinasi yang lebih kuat." }, 400);
    console.error("❌ [FORGOT-PASSWORD UPDATE ERROR]", updErr);
    return json({ success: false, error: "Gagal mengubah kata sandi. Coba lagi." }, 500);
  }

  await admin.from("marta_password_resets").delete().eq("email", email);
  return json({ success: true });
}

export async function POST(req) {
  const admin = getSupabaseAdmin();
  if (!admin) return json({ success: false, error: "Konfigurasi server belum lengkap." }, 500);
  try {
    const body = await req.json();
    const action = body?.action;
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (action === "send") return await handleSend(admin, email);
    if (action === "reset") return await handleReset(admin, email, String(body?.otp ?? "").trim(), body?.password);
    return json({ success: false, error: "Permintaan tidak valid." }, 400);
  } catch (err) {
    console.error("❌ Critical error in forgot-password:", err);
    return json({ success: false, error: "Terjadi kesalahan internal. Coba lagi." }, 500);
  }
}
