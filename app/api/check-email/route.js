import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// GET /api/check-email?email=xxx
// Returns: { exists: bool, role: string|null }
// Uses service role → bypasses RLS
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email")?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      console.error("check-email error:", error.message);
      return NextResponse.json({ error: "server error" }, { status: 500 });
    }

    return NextResponse.json({
      exists: !!data,
      role: data?.role ?? null,
    });
  } catch (e) {
    console.error("check-email threw:", e?.message);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
