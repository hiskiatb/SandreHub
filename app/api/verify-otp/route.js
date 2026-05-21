import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// PENTING: Gunakan SUPABASE_SERVICE_ROLE_KEY agar bisa buat user auth secara paksa
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export async function POST(req) {
  try {
    const body = await req.json();
    const { 
      email, otp, password, full_name, 
      username, role, partner_name, access_code 
    } = body;
    
    const cleanEmail = email?.trim().toLowerCase();
    const cleanOtp = String(otp).trim();

    // 1. AMBIL OTP TERAKHIR (Flag Terbesar berdasarkan ID)
    const { data: otpData, error: otpError } = await supabaseAdmin
      .from("email_otps")
      .select("*")
      .eq("email", cleanEmail)
      .eq("verified", false)
      .order("id", { ascending: false }) // Flag Terbesar (ID terbaru)
      .limit(1)
      .maybeSingle();

    // VALIDASI AWAL: Jika OTP tidak ada atau salah
    if (otpError || !otpData) {
      return NextResponse.json({ success: false, message: "Kode OTP tidak ditemukan" }, { status: 400 });
    }

    if (new Date(otpData.expires_at) < new Date()) {
      return NextResponse.json({ success: false, message: "Kode OTP sudah kedaluwarsa" }, { status: 400 });
    }

    if (otpData.otp !== cleanOtp) {
      return NextResponse.json({ success: false, message: "Kode OTP salah" }, { status: 400 });
    }

    // --- SAMPAI DI SINI, OTP DIPASTIKAN VALID ---
    // Sekarang baru kita lakukan "Push" ke sistem Auth dan Profiles

    // 2. BUAT USER DI SUPABASE AUTH
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: password,
      email_confirm: true,
      user_metadata: { full_name, username, role, partner_name }
    });

if (authError) {
  console.error("❌ AUTH ERROR:", authError);

  return NextResponse.json({
    success: false,
    message: authError.message
  }, { status: 400 });
}

const { error: profileError } = await supabaseAdmin
  .from("profiles")
  .upsert({
    id: authData.user.id,
    email: cleanEmail,
    full_name: full_name,
    username: username,
    role: role,
    partner_name: partner_name || null,
    access_code: access_code || null,
    updated_at: new Date().toISOString()
  }, { 
    onConflict: 'id' // Ini kuncinya! Mencegah error duplicate pkey
  });

if (profileError) {
  // Tambahkan log ini untuk melihat detail error dari Supabase
  console.error("❌ DETAIL ERROR SUPABASE:", profileError); 
  
  await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  return NextResponse.json({ 
    success: false, 
    message: `Gagal sinkron profil: ${profileError.message}` // Tampilkan pesan asli
  }, { status: 500 });
}

    // 4. TANDAI OTP SUDAH TERPAKAI
    await supabaseAdmin.from("email_otps").update({ verified: true }).eq("id", otpData.id);

    return NextResponse.json({ success: true, message: "Registrasi Berhasil!" });

  } catch (err) {
    console.error("Critical Error:", err);
    return NextResponse.json({ success: false, message: "Terjadi kesalahan internal." }, { status: 500 });
  }
}