import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Dibuat lazy (bukan di top-level module) supaya Next.js tidak mengevaluasi
// createClient() saat build/"Collecting page data" — kalau env belum ke-set
// di lingkungan build itu akan langsung crash ("supabaseUrl is required").
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// GET /api/check-username?username=xxx
// Returns: { exists: bool }
// Uses service role → bypasses RLS
export async function GET(req) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: "Konfigurasi server belum lengkap." }, { status: 500 });

  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username")?.trim().toLowerCase();

    if (!username) {
      return NextResponse.json({ error: "username required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (error) {
      console.error("check-username error:", error.message);
      return NextResponse.json({ error: "server error" }, { status: 500 });
    }

    return NextResponse.json({ exists: !!data });
  } catch (e) {
    console.error("check-username threw:", e?.message);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
