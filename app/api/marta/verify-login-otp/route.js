import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Dibuat lazy (bukan di top-level module) — sama alasan dgn send-otp/verify-otp:
// supaya Next.js tidak crash saat build/"Collecting page data" kalau env belum
// ke-set di lingkungan build itu.
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/marta/verify-login-otp
//
// Endpoint OTP-only, dipakai khusus utk LOGIN role "marketing_sumatera_program"
// (passwordless). BUKAN pengganti /api/verify-otp (itu tetap dipakai utk alur
// REGISTRASI — membuat auth user + profile baru). Endpoint ini sengaja "tipis":
// cuma mengecek baris email_otps (sama persis logikanya dgn langkah 1
// verify-otp), lalu tandai verified=true. Tidak membuat/mengubah apa pun di
// auth.users atau profiles.
//
// Setelah OTP terbukti valid, endpoint ini JUGA memastikan email tsb memang
// akun dgn role marketing_sumatera_program yang sudah ada di profiles (akun
// OTP ini tidak pernah dibuatkan password asli saat registrasi, jadi tidak
// bisa signInWithPassword) — lalu membuat sesi Supabase Auth yang SAH lewat
// Admin API resmi (`auth.admin.generateLink`, type "magiclink"). Link itu
// sendiri tidak dikirim/dipakai sbg email; yang diambil hanya
// `hashed_token`-nya, dikirim balik ke client, lalu client memanggil
// `supabase.auth.verifyOtp({ email, token: hashed_token, type: "magiclink" })`
// utk menukarnya jadi sesi asli di browser. Ini jalur RESMI yang didukung
// Supabase utk "saya sudah verifikasi user lewat jalur saya sendiri, sekarang
// buatkan sesi" — bukan workaround ad-hoc.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin)
    return NextResponse.json({ success: false, error: "Konfigurasi server belum lengkap." }, { status: 500 });

  try {
    const { email, otp } = await req.json();
    const cleanEmail = String(email ?? "").trim().toLowerCase();
    const cleanOtp = String(otp ?? "").trim();

    if (!cleanEmail || !cleanOtp)
      return NextResponse.json({ success: false, error: "Email dan kode OTP wajib diisi." }, { status: 400 });

    // ── 1. Validasi OTP — persis logika verify-otp langkah 1 ──────────────
    const { data: otpData, error: otpError } = await supabaseAdmin
      .from("email_otps")
      .select("*")
      .eq("email", cleanEmail)
      .eq("verified", false)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpError || !otpData) {
      return NextResponse.json(
        { success: false, error: "Kode OTP tidak ditemukan. Kirim ulang OTP." },
        { status: 400 }
      );
    }
    if (new Date(otpData.expires_at) < new Date()) {
      return NextResponse.json(
        { success: false, error: "Kode OTP sudah kedaluwarsa. Kirim ulang OTP." },
        { status: 400 }
      );
    }
    if (otpData.otp !== cleanOtp) {
      return NextResponse.json(
        { success: false, error: "Kode OTP salah. Periksa kembali." },
        { status: 400 }
      );
    }

    // ── 2. Pastikan akun ada & role-nya memang marketing_sumatera_program ──
    const { data: authUser, error: findErr } = await supabaseAdmin
      .schema("auth")
      .from("users")
      .select("id, email")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (findErr || !authUser) {
      return NextResponse.json(
        { success: false, error: "Akun tidak ditemukan." },
        { status: 400 }
      );
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", authUser.id)
      .maybeSingle();

    if (!profile || profile.role !== "marketing_sumatera_program") {
      return NextResponse.json(
        { success: false, error: "Akun ini tidak memiliki akses ke MartaHub." },
        { status: 403 }
      );
    }

    // ── 3. Tandai OTP sudah dipakai (tidak bisa dipakai ulang) ─────────────
    await supabaseAdmin
      .from("email_otps")
      .update({ verified: true })
      .eq("id", otpData.id);

    // ── 4. Buat sesi Supabase Auth yang sah lewat Admin API resmi ──────────
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: cleanEmail,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error("❌ [GENERATE LINK ERROR]", linkError);
      return NextResponse.json(
        { success: false, error: "Gagal membuat sesi login. Coba lagi." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      token_hash: linkData.properties.hashed_token,
    });
  } catch (err) {
    console.error("❌ Critical error in verify-login-otp:", err);
    return NextResponse.json(
      { success: false, error: "Terjadi kesalahan internal. Coba lagi." },
      { status: 500 }
    );
  }
}
