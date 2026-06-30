import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// ─────────────────────────────────────────────────────────────────────────────
// Helper: find auth user by email — direct auth.users query (more reliable
// than listUsers which has pagination limits and can miss entries).
// ─────────────────────────────────────────────────────────────────────────────
async function findAuthUserByEmail(email) {
  try {
    // Primary: query auth schema directly with service role
    const { data, error } = await supabaseAdmin
      .schema("auth")
      .from("users")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (!error) return data; // { id, email } or null

    // Fallback: listUsers (slower, capped at 1000, but catches edge cases)
    console.warn("⚠️ auth schema query failed, falling back to listUsers:", error.message);
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({
      page: 1, perPage: 1000,
    });
    return list?.users?.find((u) => u.email === email) ?? null;
  } catch (e) {
    console.warn("⚠️ findAuthUserByEmail threw:", e?.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: create auth user — if "Database error creating new user" is returned,
// do an emergency orphan-cleanup and retry exactly once.
// This handles the race condition where the pre-check missed the orphan.
// ─────────────────────────────────────────────────────────────────────────────
async function createAuthUser(email, password, metadata) {
  const payload = {
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  };

  let { data, error } = await supabaseAdmin.auth.admin.createUser(payload);

  // If the error is the orphan-related DB constraint, clean up and retry once
  const isDbError =
    error?.message?.toLowerCase().includes("database error") ||
    error?.message?.toLowerCase().includes("creating new user");

  if (isDbError) {
    console.warn("⚠️ createUser database error — emergency orphan cleanup…");
    try {
      const orphan = await findAuthUserByEmail(email);
      if (orphan?.id) {
        await supabaseAdmin.auth.admin.deleteUser(orphan.id);
        console.log("🧹 Emergency orphan removed:", orphan.id);
        // Retry createUser once after cleanup
        ({ data, error } = await supabaseAdmin.auth.admin.createUser(payload));
      }
    } catch (retryErr) {
      console.error("❌ Emergency cleanup/retry failed:", retryErr?.message);
    }
  }

  return { data, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: translate any raw auth error to friendly Indonesian
// ─────────────────────────────────────────────────────────────────────────────
function friendlyAuthError(raw = "") {
  const r = (raw ?? "").toLowerCase();
  if (r.includes("database error") || r.includes("creating new user")) {
    return "Email ini sudah digunakan. Coba masuk, atau hubungi admin.";
  }
  if (
    r.includes("already registered") ||
    r.includes("already been registered") ||
    r.includes("user already exists")
  ) {
    return "Email sudah terdaftar. Silakan masuk.";
  }
  if (r.includes("password") && (r.includes("short") || r.includes("weak"))) {
    return "Kata sandi terlalu lemah. Gunakan minimal 8 karakter.";
  }
  if (r.includes("invalid email")) {
    return "Format email tidak valid.";
  }
  if (r.includes("network") || r.includes("fetch")) {
    return "Koneksi bermasalah. Coba lagi.";
  }
  // Show a sanitized version instead of the raw technical string
  return "Gagal membuat akun. Coba lagi atau hubungi admin.";
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/verify-otp
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    const body = await req.json();
    const {
      email, otp, password,
      full_name, username, role, partner_name,
      agency_code,
    } = body;

    const cleanEmail = email?.trim().toLowerCase();
    const cleanOtp   = String(otp ?? "").trim();

    // ── 1. Validate OTP ───────────────────────────────────────────────────
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
        { success: false, message: "Kode OTP tidak ditemukan. Coba daftar ulang." },
        { status: 400 }
      );
    }
    if (new Date(otpData.expires_at) < new Date()) {
      return NextResponse.json(
        { success: false, message: "Kode OTP sudah kedaluwarsa. Kirim ulang OTP." },
        { status: 400 }
      );
    }
    if (otpData.otp !== cleanOtp) {
      return NextResponse.json(
        { success: false, message: "Kode OTP salah. Periksa kembali." },
        { status: 400 }
      );
    }

    // ── 2. Pre-check: detect & remove orphan auth entry ───────────────────
    //
    // Scenario: a previous registration attempt inserted the email into
    // auth.users but never completed (no profiles row).  Without cleanup,
    // createUser will always return "Database error creating new user".
    //
    try {
      const existing = await findAuthUserByEmail(cleanEmail);

      if (existing) {
        // Check if a complete profile already exists
        const { data: existingProfile } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("id", existing.id)
          .maybeSingle();

        if (existingProfile) {
          return NextResponse.json(
            {
              success: false,
              message: "Email ini sudah terdaftar. Silakan gunakan halaman Masuk.",
            },
            { status: 400 }
          );
        }

        // Orphan: auth entry exists, no profile — safe to delete
        console.log("🧹 Pre-check: removing orphan auth user", existing.id);
        await supabaseAdmin.auth.admin.deleteUser(existing.id);
      }
    } catch (preErr) {
      // Non-fatal — createAuthUser's retry logic is a second safety net
      console.warn("⚠️ Pre-check error (non-fatal):", preErr?.message);
    }

    // ── 3. Create auth user (auto-retries on database error) ──────────────
    const { data: authData, error: authError } = await createAuthUser(
      cleanEmail,
      password,
      { full_name, username, role, partner_name }
    );

    if (authError) {
      console.error("❌ AUTH ERROR (after retry):", authError.message);
      return NextResponse.json(
        { success: false, message: friendlyAuthError(authError.message) },
        { status: 400 }
      );
    }

    // ── 3b. Agency: validasi kode & resolve agency_id (server-side) ─────────
    let mfAgencyId = null;
    if (role === "agency") {
      const { data: codeRow } = await supabaseAdmin
        .from("mf_agency_codes")
        .select("id, agency_id, active, used_by")
        .ilike("code", String(agency_code ?? "").trim())
        .maybeSingle();
      if (!codeRow || !codeRow.active) {
        // Rollback auth user — kode tidak valid / sudah dipakai
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
        return NextResponse.json(
          { success: false, message: "Kode agency tidak valid atau sudah dipakai." },
          { status: 400 }
        );
      }
      mfAgencyId = codeRow.agency_id;
    }

    // ── 4. Create profile ──────────────────────────────────────────────────
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id:           authData.user.id,
          email:        cleanEmail,
          full_name:    full_name   ?? null,
          username:     username    ?? null,
          role:         role        ?? null,
          partner_name: partner_name ?? null,
          mf_agency_id: mfAgencyId,
          updated_at:   new Date().toISOString(),
        },
        { onConflict: "id" }
      );

    if (profileError) {
      console.error("❌ PROFILE ERROR:", profileError.message);
      // Rollback the auth entry so the next registration attempt starts clean
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
      return NextResponse.json(
        {
          success: false,
          message: "Gagal menyimpan profil. Coba daftar ulang.",
        },
        { status: 500 }
      );
    }

    // ── 5. Mark OTP as used ────────────────────────────────────────────────
    await supabaseAdmin
      .from("email_otps")
      .update({ verified: true })
      .eq("id", otpData.id);

    // ── 5b. Agency: tandai kode terpakai & tautkan ke user ─────────────────
    if (role === "agency" && agency_code) {
      await supabaseAdmin
        .from("mf_agency_codes")
        .update({ active: false, used_by: authData.user.id, used_by_email: cleanEmail, used_at: new Date().toISOString() })
        .ilike("code", String(agency_code).trim());
    }

    return NextResponse.json({ success: true, message: "Registrasi berhasil!" });

  } catch (err) {
    console.error("❌ Critical error in verify-otp:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan internal. Coba lagi." },
      { status: 500 }
    );
  }
}
