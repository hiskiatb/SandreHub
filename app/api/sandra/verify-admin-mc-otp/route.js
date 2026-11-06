import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Dibuat lazy (bukan di top-level module) - sama alasan dgn send-otp/verify-otp:
// supaya Next.js tidak crash saat build/"Collecting page data" kalau env belum
// ke-set di lingkungan build itu.
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sandra/verify-admin-mc-otp
//
// Endpoint OTP-only, dipakai khusus utk LOGIN "Admin MC" (District Admin,
// role finance_mpx) di /sandra/login-admin-mc - pola yang sama persis dgn
// /api/marta/verify-login-otp (lihat komentar di sana utk latar
// belakangnya). BUKAN pengganti /api/verify-otp (itu tetap dipakai utk alur
// REGISTRASI - membuat auth user + profile baru).
//
// Bedanya dgn verify-login-otp milik MartaHub: akun Admin MC belum tentu
// sudah punya baris di `profiles` saat login pertama kali (baris itu baru
// di-upsert oleh RPC mf_dse_admin_mc_login_apply() SETELAH sesi terbentuk,
// dipanggil dari client). Jadi validasi akses di sini dicek langsung ke
// mf_dse_admin_mc_mapping/_emails (sumber kebenarannya), bukan ke
// profiles.role.
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

    // ── 1. Validasi OTP - persis logika verify-otp/verify-login-otp ───────
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

    // ── 2. Pastikan email ini memang terdaftar & aktif sbg Admin MC ───────
    // (RPC SECURITY DEFINER, tidak bergantung auth.uid() - aman dipanggil
    // dari server dgn service role.)
    // UPDATE (permintaan user - "tambahkan untuk Admin Area"): endpoint ini
    // dipakai bareng oleh /sandra/login (jalur umum) utk Admin MC MAUPUN
    // Admin Area - OTP sudah valid di langkah 1, di sini cukup pastikan
    // emailnya terdaftar aktif di SALAH SATU dari dua mapping itu.
    const { data: mcLookup } = await supabaseAdmin.rpc("mf_dse_admin_mc_lookup", {
      p_email: cleanEmail,
    });
    let areaLookup = null;
    if (!mcLookup?.found) {
      const { data } = await supabaseAdmin.rpc("mf_dse_admin_area_lookup", { p_email: cleanEmail });
      areaLookup = data;
    }
    if (!mcLookup?.found && !areaLookup?.found) {
      return NextResponse.json(
        { success: false, error: "Email ini belum terdaftar sebagai Admin MC atau Admin Area." },
        { status: 403 }
      );
    }

    // ── 3. Buat sesi Supabase Auth yang sah lewat Admin API resmi ──────────
    // Dipanggil SEBELUM OTP ditandai terpakai, dan dgn retry singkat - supaya
    // hiccup sesaat di Supabase Auth (transient, pernah terjadi di produksi -
    // bukan masalah OTP-nya) langsung tertangani sendiri di percobaan
    // pertama user, tanpa perlu Kirim Ulang OTP. Kalau tetap gagal setelah
    // retry, OTP TIDAK ditandai terpakai (lihat di bawah) supaya user bisa
    // langsung coba masukkan kode yang sama lagi tanpa minta kode baru.
    const MAX_ATTEMPTS = 3;
    let linkData = null;
    let linkError = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const res = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: cleanEmail,
      });
      linkData = res.data;
      linkError = res.error;
      if (!linkError && linkData?.properties?.hashed_token) break;
      console.error(`❌ [GENERATE LINK ERROR] percobaan ${attempt}/${MAX_ATTEMPTS}`, linkError);
      if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 400 * attempt));
    }

    if (linkError || !linkData?.properties?.hashed_token) {
      return NextResponse.json(
        { success: false, error: "Gagal membuat sesi login. Coba lagi." },
        { status: 500 }
      );
    }

    // ── 4. Tandai OTP sudah dipakai (tidak bisa dipakai ulang) ─────────────
    // Baru dilakukan SETELAH sesi berhasil dibuat.
    await supabaseAdmin
      .from("email_otps")
      .update({ verified: true })
      .eq("id", otpData.id);

    return NextResponse.json({
      success: true,
      token_hash: linkData.properties.hashed_token,
    });
  } catch (err) {
    console.error("❌ Critical error in verify-admin-mc-otp:", err);
    return NextResponse.json(
      { success: false, error: "Terjadi kesalahan internal. Coba lagi." },
      { status: 500 }
    );
  }
}
