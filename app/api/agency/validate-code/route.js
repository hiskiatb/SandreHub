import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// POST /api/agency/validate-code  { code }
// Validasi kode registrasi agency tanpa perlu login (service role).
export async function POST(req) {
  try {
    const { code } = await req.json();
    const clean = String(code ?? "").trim();
    if (!clean) {
      return NextResponse.json({ valid: false, message: "Kode kosong." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("mf_agency_codes")
      .select("id, active, used_at, agency:mf_agencies(name)")
      .ilike("code", clean)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ valid: false, message: "Gagal memeriksa kode." }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ valid: false, message: "Kode tidak ditemukan." });
    }
    if (!data.active || data.used_at) {
      return NextResponse.json({ valid: false, message: "Kode sudah dipakai atau dinonaktifkan." });
    }

    return NextResponse.json({ valid: true, agency_name: data.agency?.name || "Agency" });
  } catch (e) {
    return NextResponse.json({ valid: false, message: "Terjadi kesalahan." }, { status: 500 });
  }
}
