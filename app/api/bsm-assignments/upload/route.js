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
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  const ADMIN_ROLES = ["spm_sumatera", "finance_mpx", "internal_ioh"];
  if (!prof || !ADMIN_ROLES.includes(prof.role)) {
    return { error: "Akses tidak diizinkan.", status: 403 };
  }
  return { user, role: prof.role, fullName: prof.full_name ?? null };
}

// ── Code generator ────────────────────────────────────────────────────────────
function generateBSMCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rand  = Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
  return `BSM-${rand}`;
}

// ── POST — bulk CSV upload (semicolon-delimited) ──────────────────────────────
// Expected CSV header (case-insensitive):  BU_TYPE;AREA;BRANCH;LABEL
//   BU_TYPE  : IM3 | 3ID | HYBRID
//   AREA     : region / area name
//   BRANCH   : branch name
//   LABEL    : optional label / description
//
// Behaviour:
//   • Existing (bu_type, branch, role=bsm) → update area + label only; authority_code UNCHANGED
//   • New combination → auto-generate authority_code and insert
export async function POST(req) {
  const auth = await requireAdmin(req);
  if (auth.error) {
    return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const { csv } = body;

    if (!csv || typeof csv !== "string") {
      return NextResponse.json({ success: false, message: "csv diperlukan." }, { status: 400 });
    }

    // ── Parse CSV ─────────────────────────────────────────────────────────────
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) {
      return NextResponse.json(
        { success: false, message: "CSV kosong atau tidak valid." },
        { status: 400 }
      );
    }

    const rawHeader = lines[0].split(";").map(h => h.trim().toUpperCase());
    const REQUIRED  = ["BU_TYPE", "AREA", "BRANCH"];
    const missing   = REQUIRED.filter(c => !rawHeader.includes(c));
    if (missing.length) {
      return NextResponse.json(
        { success: false, message: `Kolom tidak ditemukan di CSV: ${missing.join(", ")}. Header yang diharapkan: BU_TYPE;AREA;BRANCH;LABEL` },
        { status: 400 }
      );
    }

    const idx = {};
    [...REQUIRED, "LABEL"].forEach(c => {
      const i = rawHeader.indexOf(c);
      if (i !== -1) idx[c] = i;
    });

    const VALID_BU = ["IM3", "3ID", "HYBRID"];
    const parsed   = [];
    const errors   = [];

    lines.slice(1).forEach((line, i) => {
      if (!line.trim()) return;
      const cols   = line.split(";");
      const bu     = (cols[idx.BU_TYPE] ?? "").trim().toUpperCase();
      const area   = (cols[idx.AREA]    ?? "").trim().toUpperCase();
      const branch = (cols[idx.BRANCH]  ?? "").trim().toUpperCase();
      const label  = idx.LABEL !== undefined ? (cols[idx.LABEL] ?? "").trim() || null : null;

      if (!VALID_BU.includes(bu)) {
        errors.push(`Baris ${i + 2}: BU_TYPE "${bu}" tidak valid. Gunakan IM3, 3ID, atau HYBRID.`);
        return;
      }
      if (!area || !branch) {
        errors.push(`Baris ${i + 2}: AREA dan BRANCH wajib diisi.`);
        return;
      }
      parsed.push({ bu_type: bu, area, branch, label });
    });

    if (parsed.length === 0) {
      return NextResponse.json(
        { success: false, message: "Tidak ada baris valid.", errors },
        { status: 400 }
      );
    }

    // ── Load all existing BSM assignments once ────────────────────────────────
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("sdp_assignments")
      .select("id, bu_type, branch, authority_code")
      .eq("role", "bsm");

    if (fetchErr) throw fetchErr;

    // Build lookup: "BU_TYPE::BRANCH" → row
    const existingMap = {};
    for (const row of (existing ?? [])) {
      existingMap[`${row.bu_type}::${row.branch}`] = row;
    }

    // Build set of taken authority_codes (for uniqueness check on new rows)
    const takenCodes = new Set((existing ?? []).map(r => r.authority_code));

    const toInsert = [];
    const toUpdate = [];

    for (const row of parsed) {
      const key    = `${row.bu_type}::${row.branch}`;
      const exists = existingMap[key];

      if (exists) {
        // ── Existing row: update area + label only ──────────────────────────
        toUpdate.push({ id: exists.id, area: row.area, label: row.label });
      } else {
        // ── New row: generate unique authority_code ─────────────────────────
        let code;
        const pendingCodes = new Set(toInsert.map(r => r.authority_code));
        do { code = generateBSMCode(); }
        while (takenCodes.has(code) || pendingCodes.has(code));

        toInsert.push({
          role:            "bsm",
          bu_type:         row.bu_type,
          area:            row.area,
          branch:          row.branch,
          label:           row.label,
          authority_code:  code,
          is_active:       true,
          is_registered:   false,
          created_by_name: auth.fullName,
          created_by_role: "system_upload",
        });
      }
    }

    // ── Batch insert ──────────────────────────────────────────────────────────
    let inserted = 0;
    const CHUNK = 50;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin.from("sdp_assignments").insert(chunk);
      if (error) throw error;
      inserted += chunk.length;
    }

    // ── Batch update (no authority_code touch) ────────────────────────────────
    let updated = 0, updateFailed = 0;
    for (const upd of toUpdate) {
      const { error } = await supabaseAdmin
        .from("sdp_assignments")
        .update({ area: upd.area, label: upd.label })
        .eq("id", upd.id);
      if (error) { console.warn("⚠️ update failed:", error.message); updateFailed++; }
      else updated++;
    }

    const summary = [
      inserted > 0 && `${inserted} kode baru ditambahkan`,
      updated  > 0 && `${updated} diperbarui (kode otoritas tidak berubah)`,
      errors.length > 0 && `${errors.length} baris dilewati`,
    ].filter(Boolean).join(", ");

    return NextResponse.json({
      success:      true,
      inserted,
      updated,
      updateFailed,
      errors,
      message:      summary || "Selesai tanpa perubahan.",
    });

  } catch (err) {
    console.error("❌ bsm-assignments upload error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
