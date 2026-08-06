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

// ── POST — bulk CSV upload (semicolon-delimited) ──────────────────────────────
// Expected CSV header: CIRCLE;REGION;AREA;BRANCH;MC;CLUSTER
// Micro Cluster (acuan manpower hybrid IM3+3ID) di-AUTO-GENERATE dari kolom
// MC apa adanya — tidak ada kolom CSV terpisah utk ini.
// `period` (body param, format "YYYY-MM") menentukan upload ini berlaku utk
// bulan mana — default bulan berjalan. Baris utk periode tsb SELALU
// tersimpan sebagai baris baru (tidak menimpa bulan lain), mengikuti pola
// per-periode pts_assignment — bulan yang belum di-upload otomatis
// carry-forward ke upload terakhir lewat RPC mc_cluster_effective.
// Mode: "replace" (hapus SEMUA baris periode ini, ganti dgn CSV baru) |
// "upsert" (insert/update by mc+period, tidak menyentuh periode lain).
export async function POST(req) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: "Konfigurasi server belum lengkap." }, { status: 500 });

  const auth = await requireAdmin(req, supabaseAdmin);
  if (auth.error) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const { csv, mode = "upsert", period } = body;
    const targetPeriod = (period || currentPeriod()).trim();

    if (!csv || typeof csv !== "string") {
      return NextResponse.json({ success: false, message: "csv diperlukan." }, { status: 400 });
    }

    // Parse CSV
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) {
      return NextResponse.json({ success: false, message: "CSV kosong atau tidak valid." }, { status: 400 });
    }

    const header = lines[0].split(";").map(h => h.trim().toUpperCase());
    const requiredCols = ["CIRCLE", "REGION", "AREA", "BRANCH", "MC", "CLUSTER"];
    const missing = requiredCols.filter(c => !header.includes(c));
    if (missing.length) {
      return NextResponse.json(
        { success: false, message: `Kolom tidak ditemukan di CSV: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const idx = {};
    requiredCols.forEach(c => { idx[c] = header.indexOf(c); });

    const rows = [];
    const errors = [];

    lines.slice(1).forEach((line, i) => {
      if (!line.trim()) return;
      const cols = line.split(";");
      const mcClean = cols[idx.MC]?.trim().toUpperCase() || "";
      const row = {
        circle:  cols[idx.CIRCLE]?.trim().toUpperCase()  || "",
        region:  cols[idx.REGION]?.trim().toUpperCase()  || "",
        area:    cols[idx.AREA]?.trim().toUpperCase()    || "",
        branch:  cols[idx.BRANCH]?.trim().toUpperCase()  || "",
        mc:      mcClean,
        cluster: cols[idx.CLUSTER]?.trim().toUpperCase() || "",
        // Micro Cluster: auto-generate, ikut format MC (IM3) apa adanya —
        // tidak lagi kolom CSV terpisah.
        micro_cluster: mcClean || null,
        period: targetPeriod,
        is_active: true,
      };
      const empty = requiredCols.filter(c => !row[c.toLowerCase()]);
      if (empty.length) {
        errors.push(`Baris ${i + 2}: kolom ${empty.join(", ")} kosong.`);
        return;
      }
      rows.push(row);
    });

    if (rows.length === 0) {
      return NextResponse.json({ success: false, message: "Tidak ada baris valid.", errors }, { status: 400 });
    }

    let inserted = 0;

    if (mode === "replace") {
      // Hapus HANYA baris periode ini — bulan lain tidak tersentuh.
      const { error: delErr } = await supabaseAdmin
        .from("mc_cluster_mapping")
        .delete()
        .eq("period", targetPeriod);
      if (delErr) throw delErr;

      const CHUNK = 100;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error } = await supabaseAdmin.from("mc_cluster_mapping").insert(chunk);
        if (error) throw error;
        inserted += chunk.length;
      }
    } else {
      const CHUNK = 100;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error } = await supabaseAdmin
          .from("mc_cluster_mapping")
          .upsert(chunk, { onConflict: "mc,period", ignoreDuplicates: false });
        if (error) throw error;
        inserted += chunk.length;
      }
    }

    // ── Sync sales_authority_codes ────────────────────────────────────────────
    // Insert NEW mc entries only — never overwrite existing im3_code / id3_code.
    // ignoreDuplicates: true means existing rows (by mc unique key) are skipped.
    const salesRows = rows.map(r => ({
      mc:      r.mc,
      cluster: r.cluster,
      branch:  r.branch,
      region:  r.region,
      is_active: true,
    }));
    const CHUNK2 = 100;
    for (let i = 0; i < salesRows.length; i += CHUNK2) {
      const chunk = salesRows.slice(i, i + CHUNK2);
      await supabaseAdmin
        .from("sales_authority_codes")
        .upsert(chunk, { onConflict: "mc", ignoreDuplicates: true });
      // ignoreDuplicates: true → only insert new rows, never update existing
    }

    return NextResponse.json({
      success: true,
      inserted,
      errors,
      message: `${inserted} baris berhasil diproses${errors.length ? `, ${errors.length} baris dilewati` : ""}.`,
    });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
