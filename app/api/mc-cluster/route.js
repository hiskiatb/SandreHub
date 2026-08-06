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

// ── Auth helper ───────────────────────────────────────────────────────────────
async function requireAdmin(req, supabaseAdmin) {
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

const currentPeriod = () => new Date().toISOString().slice(0, 7); // "YYYY-MM"

// ── GET — list mapping utk periode tertentu (carry-forward otomatis) ─────────
// Pakai RPC mc_cluster_effective(p_period): kalau bulan yang diminta belum
// pernah di-upload, otomatis pakai upload TERAKHIR yang tersedia (mirip
// pts_effective_assignment di Promotor Tracking System). Filter region/
// branch/search & paginasi dilakukan di sisi server (bukan Postgres) karena
// hasil RPC tidak bisa langsung di-chain .eq()/.range() seperti tabel biasa.
// SEBELUMNYA endpoint ini tidak mengecek autentikasi sama sekali — siapapun
// yang tahu URL-nya (bahkan tanpa login) bisa menarik seluruh data MC/
// Cluster/Region/Branch/Area. Sekarang WAJIB requireAdmin() sama seperti
// POST/DELETE/upload — kalau linknya bocor pun tidak bisa diakses tanpa
// token admin yang valid. (RLS tabel mc_cluster_mapping juga sudah dikunci
// terpisah ke role admin yang sama, jadi tidak ada jalur baca langsung lain.)
export async function GET(req) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: "Konfigurasi server belum lengkap." }, { status: 500 });

  const auth = await requireAdmin(req, supabaseAdmin);
  if (auth.error) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

  try {
    const { searchParams } = new URL(req.url);
    const region = searchParams.get("region");
    const branch = searchParams.get("branch");
    const search = searchParams.get("search");
    const period = searchParams.get("period") || currentPeriod();
    const page   = parseInt(searchParams.get("page")  ?? "1",  10);
    const limit  = parseInt(searchParams.get("limit") ?? "50", 10);
    const offset = (page - 1) * limit;

    const { data: allRows, error } = await supabaseAdmin.rpc("mc_cluster_effective", { p_period: period });
    if (error) throw error;

    let rows = allRows || [];
    if (region) rows = rows.filter((r) => r.region === region);
    if (branch) rows = rows.filter((r) => r.branch === branch);
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter((r) => [r.mc, r.cluster, r.micro_cluster, r.branch, r.region].some((v) => (v || "").toLowerCase().includes(s)));
    }
    rows = [...rows].sort((a, b) =>
      (a.region || "").localeCompare(b.region || "") ||
      (a.branch || "").localeCompare(b.branch || "") ||
      (a.mc || "").localeCompare(b.mc || "")
    );

    const count = rows.length;
    const paged = rows.slice(offset, offset + limit);
    const sourcePeriod = allRows?.[0]?.source_period ?? period;
    const isCarriedForward = allRows?.[0]?.is_carried_forward ?? false;

    return NextResponse.json({
      success: true, data: paged, count, page, limit,
      period, source_period: sourcePeriod, is_carried_forward: isCarriedForward,
    });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// ── POST — add single row ─────────────────────────────────────────────────────
export async function POST(req) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: "Konfigurasi server belum lengkap." }, { status: 500 });

  const auth = await requireAdmin(req, supabaseAdmin);
  if (auth.error) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const { circle, region, area, branch, mc, cluster, period } = body;

    if (!circle || !region || !area || !branch || !mc || !cluster) {
      return NextResponse.json(
        { success: false, message: "Semua kolom wajib diisi: circle, region, area, branch, mc, cluster." },
        { status: 400 }
      );
    }

    const mcClean = mc.trim().toUpperCase();

    const { data, error } = await supabaseAdmin
      .from("mc_cluster_mapping")
      .insert({
        circle:  circle.trim().toUpperCase(),
        region:  region.trim().toUpperCase(),
        area:    area.trim().toUpperCase(),
        branch:  branch.trim().toUpperCase(),
        mc:      mcClean,
        cluster: cluster.trim().toUpperCase(),
        // Micro Cluster: acuan gabungan utk manpower hybrid (pegang IM3 &
        // 3ID) — auto-generate, ikut format MC (IM3) apa adanya, tidak lagi
        // input manual/format CS terpisah.
        micro_cluster: mcClean,
        // Baris ini berlaku utk periode (bulan) tertentu — default bulan
        // berjalan kalau tidak dikirim eksplisit dari UI.
        period: (period || currentPeriod()).trim(),
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { success: false, message: `MC "${mc}" sudah terdaftar untuk periode ini.` },
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
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: "Konfigurasi server belum lengkap." }, { status: 500 });

  const auth = await requireAdmin(req, supabaseAdmin);
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
