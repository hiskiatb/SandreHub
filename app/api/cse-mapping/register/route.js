import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// POST /api/cse-mapping/register  { step: "check" | "verify", email, otp?, password?, full_name? }
// Alur khusus CSE/RSE: SPM Sumatera assign email+MC dulu di menu Mapping
// CSE/RSE, baru orangnya bisa masuk sini — cukup email (tanpa pilih role/
// kode otoritas manual seperti form registrasi umum). Step "check" memvalidasi
// email sudah dipetakan & belum dipakai lalu kirim OTP; step "verify"
// memvalidasi OTP, membuat akun+password, dan mengunci mapping ke akun itu.
export async function POST(req) {
  try {
    const body = await req.json();
    const step = body?.step;
    const cleanEmail = String(body?.email ?? "").trim().toLowerCase();
    if (!cleanEmail) return NextResponse.json({ success: false, message: "Email wajib diisi." }, { status: 400 });

    const { data: mapping } = await supabaseAdmin
      .from("pts_cse_mapping")
      .select("*")
      .ilike("email", cleanEmail)
      .maybeSingle();

    if (!mapping || !mapping.is_active) {
      return NextResponse.json(
        { success: false, message: "Email ini belum dipetakan oleh SPM Sumatera. Hubungi SPM Sumatera untuk didaftarkan sebagai CSE/RSE terlebih dahulu." },
        { status: 404 }
      );
    }
    if (mapping.is_registered) {
      return NextResponse.json(
        { success: false, message: "Email ini sudah pernah dipakai untuk mendaftar. Silakan langsung masuk (login)." },
        { status: 409 }
      );
    }

    // ── Step 1: hanya cek kelayakan email — pengiriman OTP dilakukan oleh
    // client lewat /api/send-otp (sama seperti alur registrasi umum), supaya
    // tidak duplikasi logic template email di sini.
    if (step === "check") {
      return NextResponse.json({ success: true, eligible: true });
    }

    // ── Step 2: verifikasi OTP + buat akun ──────────────────────────────────
    if (step === "verify") {
      const otp = String(body?.otp ?? "").trim();
      const password = String(body?.password ?? "");
      const fullName = String(body?.full_name ?? "").trim();

      if (!otp || !password || !fullName) {
        return NextResponse.json({ success: false, message: "Nama, OTP, dan kata sandi wajib diisi." }, { status: 400 });
      }
      if (password.length < 8) {
        return NextResponse.json({ success: false, message: "Kata sandi minimal 8 karakter." }, { status: 400 });
      }

      const { data: otpData, error: otpError } = await supabaseAdmin
        .from("email_otps")
        .select("*")
        .eq("email", cleanEmail)
        .eq("verified", false)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (otpError || !otpData) {
        return NextResponse.json({ success: false, message: "Kode OTP tidak ditemukan. Kirim ulang OTP." }, { status: 400 });
      }
      if (new Date(otpData.expires_at) < new Date()) {
        return NextResponse.json({ success: false, message: "Kode OTP sudah kedaluwarsa. Kirim ulang OTP." }, { status: 400 });
      }
      if (otpData.otp !== otp) {
        return NextResponse.json({ success: false, message: "Kode OTP salah. Periksa kembali." }, { status: 400 });
      }

      // Re-check status (hindari race condition dua tab / double submit)
      const { data: freshMapping } = await supabaseAdmin
        .from("pts_cse_mapping").select("is_registered").ilike("email", cleanEmail).maybeSingle();
      if (freshMapping?.is_registered) {
        return NextResponse.json({ success: false, message: "Email ini sudah terdaftar. Silakan masuk." }, { status: 409 });
      }

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role: "cse_rse" },
      });
      if (authError) {
        const msg = (authError.message || "").toLowerCase().includes("already")
          ? "Email sudah terdaftar. Silakan masuk."
          : "Gagal membuat akun. Coba lagi atau hubungi admin.";
        return NextResponse.json({ success: false, message: msg }, { status: 400 });
      }

      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: authData.user.id,
        email: cleanEmail,
        full_name: fullName,
        role: "cse_rse",
        cluster: mapping.mc,
        region: mapping.region,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
        return NextResponse.json({ success: false, message: "Gagal menyimpan profil. Coba lagi." }, { status: 500 });
      }

      await supabaseAdmin.from("email_otps").update({ verified: true }).eq("id", otpData.id);
      await supabaseAdmin.from("pts_cse_mapping").update({
        is_registered: true,
        registered_user_id: authData.user.id,
        registered_at: new Date().toISOString(),
      }).eq("id", mapping.id);

      return NextResponse.json({ success: true, message: "Akun CSE/RSE berhasil diaktifkan." });
    }

    return NextResponse.json({ success: false, message: "Step tidak dikenali." }, { status: 400 });
  } catch (err) {
    console.error("❌ cse-mapping/register error:", err);
    return NextResponse.json({ success: false, message: "Terjadi kesalahan internal. Coba lagi." }, { status: 500 });
  }
}
