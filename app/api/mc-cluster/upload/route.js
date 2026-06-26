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

// ── POST — bulk CSV upload (semicolon-delimited) ──────────────────────────────
// Expected CSV header: CIRCLE;REGION;AREA;BRANCH;MC;CLUSTER
// Mode: "replace" (truncate + insert all) | "upsert" (insert or update by mc key)
export async function POST(req) {
  const auth = await requireAdmin(req);
  if (auth.error) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const { csv, mode = "upsert" } = body;

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
      const row = {
        circle:  cols[idx.CIRCLE]?.trim().toUpperCase()  || "",
        region:  cols[idx.REGION]?.trim().toUpperCase()  || "",
        area:    cols[idx.AREA]?.trim().toUpperCase()    || "",
        branch:  cols[idx.BRANCH]?.trim().toUpperCase()  || "",
        mc:      cols[idx.MC]?.trim().toUpperCase()      || "",
        cluster: cols[idx.CLUSTER]?.trim().toUpperCase() || "",
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
      const { error: delErr } = await supabaseAdmin
        .from("mc_cluster_mapping")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
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
          .upsert(chunk, { onConflict: "mc", ignoreDuplicates: false });
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
