import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// GET /api/check-username?username=xxx
// Returns: { exists: bool }
// Uses service role → bypasses RLS
export async function GET(req) {
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
