import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function requireSPM(req) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: "Autentikasi diperlukan.", status: 401 };
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { error: "Token tidak valid.", status: 401 };
  const { data: prof } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
  if (!prof || prof.role !== "spm_sumatera") return { error: "Akses tidak diizinkan.", status: 403 };
  return { user };
}

// GET — list all with optional filters
export async function GET(req) {
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
  const auth = await requireSPM(req);
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
