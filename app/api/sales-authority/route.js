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

async function requireSPM(req, supabaseAdmin) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: "Autentikasi diperlukan.", status: 401 };
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { error: "Token tidak valid.", status: 401 };
  const { data: prof } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
  if (!prof || prof.role !== "spm_sumatera") return { error: "Akses tidak diizinkan.", status: 403 };
  return { user };
}

// GET — list all with optional filters
// SEBELUMNYA endpoint ini tidak mengecek autentikasi sama sekali — siapapun
// yang tahu URL-nya bisa menarik seluruh sales_authority_codes (MC/cluster/
// branch/region + kode IM3/3ID). Sekarang wajib login (requireSPM sama
// seperti PATCH) — link yang bocor pun tidak bisa diakses tanpa token valid.
export async function GET(req) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: "Konfigurasi server belum lengkap." }, { status: 500 });

  const auth = await requireSPM(req, supabaseAdmin);
  if (auth.error) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

  try {
    const { searchParams } = new URL(req.url);
    const region = searchParams.get("region");
    const branch = searchParams.get("branch");
    const search = searchParams.get("search");
    const page   = parseInt(searchParams.get("page")  ?? "1", 10);
    const limit  = parseInt(searchParams.get("limit") ?? "100", 10);
    const offset = (page - 1) * limit;

    let q = supabaseAdmin
      .from("sales_authority_codes")
      .select("*", { count: "exact" })
      .order("region").order("branch").order("mc")
      .range(offset, offset + limit - 1);

    if (region) q = q.eq("region", region);
    if (branch) q = q.eq("branch", branch);
    if (search) q = q.or(`mc.ilike.%${search}%,cluster.ilike.%${search}%,branch.ilike.%${search}%,im3_code.ilike.%${search}%,id3_code.ilike.%${search}%`);

    const { data, error, count } = await q;
    if (error) throw error;
    return NextResponse.json({ success: true, data, count, page, limit });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// PATCH — update im3_code / id3_code / label / is_active for a row
export async function PATCH(req) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: "Konfigurasi server belum lengkap." }, { status: 500 });

  const auth = await requireSPM(req, supabaseAdmin);
  if (auth.error) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

  try {
    const { id, im3_code, id3_code, label, is_active } = await req.json();
    if (!id) return NextResponse.json({ success: false, message: "id diperlukan." }, { status: 400 });

    const patch = {};
    if (im3_code  !== undefined) patch.im3_code  = im3_code  ? im3_code.trim().toUpperCase()  : null;
    if (id3_code  !== undefined) patch.id3_code  = id3_code  ? id3_code.trim().toUpperCase()  : null;
    if (label     !== undefined) patch.label     = label     ? label.trim()                   : null;
    if (is_active !== undefined) patch.is_active = is_active;

    const { data, error } = await supabaseAdmin
      .from("sales_authority_codes").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
