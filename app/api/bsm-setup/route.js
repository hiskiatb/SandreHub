import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// ── GET — look up an authority code without registering it ────────────────────
// Used by Flutter to auto-detect brand / region / branch from a single code.
// Returns: { success, data: { bu_type, brand, area, branch, authority_code } }
export async function GET(req) {
  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return NextResponse.json({ success: false, message: "Autentikasi diperlukan." }, { status: 401 });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return NextResponse.json({ success: false, message: "Token tidak valid." }, { status: 401 });

    const code = new URL(req.url).searchParams.get("code")?.trim().toUpperCase();
    if (!code) return NextResponse.json({ success: false, message: "Parameter code wajib diisi." }, { status: 400 });

    const { data: rows, error } = await supabaseAdmin
      .from("sdp_assignments")
      .select("id, bu_type, area, branch, authority_code")
      .eq("authority_code", code)
      .eq("role", "bsm")
      .eq("is_active", true)
      .eq("is_registered", false)
      .limit(5);

    if (error) {
      console.error("❌ bsm-setup GET lookup error:", error.message);
      return NextResponse.json({ success: false, message: "Gagal memvalidasi kode." }, { status: 500 });
    }
    if (!rows || rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: "Kode otoritas tidak ditemukan atau sudah digunakan oleh BSM lain.",
      }, { status: 404 });
    }

    const r = rows[0];
    const brand = r.bu_type === "MITRA IM3" ? "IM3" : r.bu_type === "3KIOSK" ? "3ID" : r.bu_type;

    return NextResponse.json({
      success: true,
      data: {
        bu_type:        r.bu_type,
        brand,
        area:           r.area   ?? "",
        branch:         r.branch ?? "",
        authority_code: r.authority_code,
      },
    });
  } catch (err) {
    console.error("❌ bsm-setup GET error:", err);
    return NextResponse.json({ success: false, message: "Terjadi kesalahan internal." }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    // ── 1. Authenticate via JWT ───────────────────────────────────────────
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return NextResponse.json(
        { success: false, message: "Autentikasi diperlukan." },
        { status: 401 }
      );
    }

    const {
      data: { user },
      error: authErr,
    } = await supabaseAdmin.auth.getUser(token);

    if (authErr || !user) {
      return NextResponse.json(
        { success: false, message: "Token tidak valid. Silakan masuk kembali." },
        { status: 401 }
      );
    }

    // ── 2. Parse body ─────────────────────────────────────────────────────
    // Flutter sends: { bu_type, bsm_branch, authority_code }
    const body = await req.json();
    const { bu_type, bsm_branch, authority_code } = body;

    const cleanBuType  = bu_type?.trim();
    const cleanBranch  = bsm_branch?.trim();
    const cleanCode    = authority_code?.trim().toUpperCase();

    if (!cleanBuType || !cleanBranch || !cleanCode) {
      return NextResponse.json(
        { success: false, message: "Brand, cabang, dan kode otoritas wajib diisi." },
        { status: 400 }
      );
    }

    // ── 3. Lookup matching unregistered assignment ────────────────────────
    const { data: assignments, error: lookupErr } = await supabaseAdmin
      .from("sdp_assignments")
      .select("id, is_registered")
      .eq("authority_code", cleanCode)
      .eq("role", "bsm")
      .eq("bu_type", cleanBuType)        // ← was incorrectly "brand"
      .eq("branch", cleanBranch)
      .eq("is_active", true)
      .limit(1);

    if (lookupErr) {
      console.error("❌ sdp_assignments lookup error:", lookupErr.message);
      return NextResponse.json(
        { success: false, message: "Gagal memvalidasi kode otoritas." },
        { status: 500 }
      );
    }

    if (!assignments || assignments.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Kode otoritas tidak ditemukan untuk brand dan cabang yang dipilih. Periksa kembali.",
        },
        { status: 400 }
      );
    }

    const assignment = assignments[0];

    if (assignment.is_registered) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Kode otoritas ini sudah digunakan. Hubungi koordinator untuk mendapatkan kode baru.",
        },
        { status: 400 }
      );
    }

    // ── 4. Check whether this is the BSM's first code ─────────────────────
    const { data: profileRow, error: profileReadErr } = await supabaseAdmin
      .from("profiles")
      .select("access_code")
      .eq("id", user.id)
      .single();

    if (profileReadErr) {
      console.error("❌ profiles read error:", profileReadErr.message);
      return NextResponse.json(
        { success: false, message: "Gagal membaca profil." },
        { status: 500 }
      );
    }

    const isFirstCode = !profileRow?.access_code;

    // ── 5. Update profiles — only on first setup ──────────────────────────
    if (isFirstCode) {
      const { error: profileErr } = await supabaseAdmin
        .from("profiles")
        .update({
          access_code: cleanCode,
          updated_at:  new Date().toISOString(),
        })
        .eq("id", user.id);

      if (profileErr) {
        console.error("❌ profiles update error:", profileErr.message);
        return NextResponse.json(
          { success: false, message: `Gagal memperbarui profil: ${profileErr.message}` },
          { status: 500 }
        );
      }
    }

    // ── 6. Mark assignment as registered ─────────────────────────────────
    const { error: assignErr } = await supabaseAdmin
      .from("sdp_assignments")
      .update({
        user_id:       user.id,
        user_email:    user.email,
        user_name:     user.user_metadata?.full_name ?? null,
        is_registered: true,
        registered_at: new Date().toISOString(),
      })
      .eq("id", assignment.id);

    if (assignErr) {
      // Non-fatal: profile already updated, log and continue
      console.warn("⚠️ sdp_assignments update warning:", assignErr.message);
    }

    return NextResponse.json({
      success: true,
      message: isFirstCode
        ? "Kode otoritas BSM berhasil diaktifkan."
        : "Kode otoritas tambahan berhasil didaftarkan.",
    });

  } catch (err) {
    console.error("❌ bsm-setup critical error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan internal. Coba lagi." },
      { status: 500 }
    );
  }
}
