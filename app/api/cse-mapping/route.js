import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// ── Auth helper — cuma spm_sumatera yang boleh kelola mapping CSE/RSE ──────
async function requireSPM(req) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: "Autentikasi diperlukan.", status: 401 };
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { error: "Token tidak valid.", status: 401 };
  const { data: prof } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
  if (!prof || prof.role !== "spm_sumatera") return { error: "Akses tidak diizinkan.", status: 403 };
  return { user };
}

// GET — list mapping (search + pagination)
export async function GET(req) {
  const auth = await requireSPM(req);
  if (auth.error) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");
    const page   = parseInt(searchParams.get("page")  ?? "1",  10);
    const limit  = parseInt(searchParams.get("limit") ?? "100", 10);
    const offset = (page - 1) * limit;

    let q = supabaseAdmin
      .from("pts_cse_mapping")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) q = q.or(`email.ilike.%${search}%,mc.ilike.%${search}%,full_name.ilike.%${search}%,branch.ilike.%${search}%`);

    const { data, error, count } = await q;
    if (error) throw error;
    return NextResponse.json({ success: true, data, count, page, limit });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// POST — tambah mapping baru
export async function POST(req) {
  const auth = await requireSPM(req);
  if (auth.error) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

  try {
    const { email, full_name, mc, region, branch } = await req.json();
    const cleanEmail = String(email ?? "").trim().toLowerCase();
    const cleanMc    = String(mc ?? "").trim().toUpperCase();

    if (!cleanEmail || !cleanMc) {
      return NextResponse.json({ success: false, message: "Email dan MC/Cluster wajib diisi." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return NextResponse.json({ success: false, message: "Format email tidak valid." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("pts_cse_mapping")
      .insert({
        email: cleanEmail,
        full_name: full_name?.trim() || null,
        mc: cleanMc,
        region: region?.trim() || null,
        branch: branch?.trim() || null,
        created_by: auth.user.id,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ success: false, message: `Email "${cleanEmail}" sudah dipetakan.` }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// PATCH — edit mapping (email/mc/full_name/region/branch/is_active)
export async function PATCH(req) {
  const auth = await requireSPM(req);
  if (auth.error) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

  try {
    const { id, email, full_name, mc, region, branch, is_active } = await req.json();
    if (!id) return NextResponse.json({ success: false, message: "id diperlukan." }, { status: 400 });

    const patch = { updated_at: new Date().toISOString() };
    if (email      !== undefined) patch.email      = String(email).trim().toLowerCase();
    if (full_name  !== undefined) patch.full_name   = full_name?.trim() || null;
    if (mc         !== undefined) patch.mc          = String(mc).trim().toUpperCase();
    if (region     !== undefined) patch.region      = region?.trim() || null;
    if (branch     !== undefined) patch.branch      = branch?.trim() || null;
    if (is_active  !== undefined) patch.is_active   = is_active;

    const { data, error } = await supabaseAdmin
      .from("pts_cse_mapping").update(patch).eq("id", id).select().single();
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ success: false, message: "Email sudah dipetakan ke baris lain." }, { status: 409 });
      }
      throw error;
    }
    // Kalau sudah pernah registrasi & role-nya cocok, ikut update profil
    // (cluster/region/branch) supaya konsisten dgn mapping terbaru.
    if (data?.is_registered && data?.registered_user_id) {
      await supabaseAdmin.from("profiles")
        .update({ cluster: data.mc, region: data.region, updated_at: new Date().toISOString() })
        .eq("id", data.registered_user_id)
        .eq("role", "cse_rse");
    }
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// DELETE — hapus mapping (hanya kalau belum diregister; kalau sudah, minta
// nonaktifkan lewat is_active supaya tidak memutus akun yang sudah jalan)
export async function DELETE(req) {
  const auth = await requireSPM(req);
  if (auth.error) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ success: false, message: "id diperlukan." }, { status: 400 });

    const { data: row } = await supabaseAdmin.from("pts_cse_mapping").select("is_registered").eq("id", id).maybeSingle();
    if (row?.is_registered) {
      return NextResponse.json(
        { success: false, message: "Mapping ini sudah dipakai untuk registrasi. Nonaktifkan saja (bukan hapus) supaya akun yang sudah ada tidak bermasalah." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.from("pts_cse_mapping").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
