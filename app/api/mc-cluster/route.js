import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// ── Auth helper ───────────────────────────────────────────────────────────────
async function requireAdmin(req) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: "Autentikasi diperlukan.", status: 401 };

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { error: "Token tidak valid.", status: 401 };

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const ADMIN_ROLES = ["spm_sumatera", "finance_mpx", "internal_ioh"];
  if (!prof || !ADMIN_ROLES.includes(prof.role)) {
    return { error: "Akses tidak diizinkan.", status: 403 };
  }
  return { user, role: prof.role };
}

// ── GET — list all mappings ───────────────────────────────────────────────────
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const region = searchParams.get("region");
    const branch = searchParams.get("branch");
    const search = searchParams.get("search");
    const page   = parseInt(searchParams.get("page")  ?? "1",  10);
    const limit  = parseInt(searchParams.get("limit") ?? "50", 10);
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from("mc_cluster_mapping")
      .select("*", { count: "exact" })
      .order("region")
      .order("branch")
      .order("mc")
      .range(offset, offset + limit - 1);

    if (region) query = query.eq("region", region);
    if (branch) query = query.eq("branch", branch);
    if (search) {
      query = query.or(
        `mc.ilike.%${search}%,cluster.ilike.%${search}%,branch.ilike.%${search}%,region.ilike.%${search}%`
      );
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, data, count, page, limit });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// ── POST — add single row ─────────────────────────────────────────────────────
export async function POST(req) {
  const auth = await requireAdmin(req);
  if (auth.error) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const { circle, region, area, branch, mc, cluster } = body;

    if (!circle || !region || !area || !branch || !mc || !cluster) {
      return NextResponse.json(
        { success: false, message: "Semua kolom wajib diisi: circle, region, area, branch, mc, cluster." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("mc_cluster_mapping")
      .insert({
        circle:  circle.trim().toUpperCase(),
        region:  region.trim().toUpperCase(),
        area:    area.trim().toUpperCase(),
        branch:  branch.trim().toUpperCase(),
        mc:      mc.trim().toUpperCase(),
        cluster: cluster.trim().toUpperCase(),
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { success: false, message: `MC "${mc}" sudah terdaftar.` },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// ── DELETE — remove a row by id ───────────────────────────────────────────────
export async function DELETE(req) {
  const auth = await requireAdmin(req);
  if (auth.error) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ success: false, message: "id diperlukan." }, { status: 400 });

    const { error } = await supabaseAdmin
      .from("mc_cluster_mapping")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
