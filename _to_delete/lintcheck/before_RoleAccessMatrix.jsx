"use client";
// Panel informasi hak akses per role (permintaan user - "coba pada user
// management ada informasi untuk menampilkan hak akses menu untuk setiap
// role ini nilai yang benar benar bisa dilakukan oleh setiap role, dan
// jika misal dia terdaftar di dua role hanya edit dan bisa edit maka dia
// akan bisa edit"). Dua bagian:
// 1) Matrix referensi STATIS: role x tab (DSE/DSO/HoA/Control Center),
//    nilainya diambil LANGSUNG dari ground-truth kode di DSE_ProdAR.jsx
//    (getCategoryOptionsForRole + flag dseEditLocked) - BUKAN tebakan,
//    jadi kalau logic itu berubah di masa depan, matrix ini harus
//    disinkronkan juga (lihat ROLE_TAB_ACCESS di bawah, tiap baris ada
//    komentar sitasinya).
// 2) Daftar akun yang terdaftar di LEBIH dari 1 role (profile_extra_roles)
//    beserta akses GABUNGAN (tertinggi) yg benar2 mereka dapatkan - supaya
//    SPM bisa audit langsung tanpa harus buka SQL.
import { useEffect, useState } from "react";
import { ShieldCheck, Pencil, Eye, Minus, Loader2, Users } from "lucide-react";
import supabase from "../../../lib/supabase";

const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

// Katalog label role (selaras dgn ROLE_CATALOG di MenuAccessManager.jsx &
// ROLE_BADGE di page.jsx - label tampilan boleh disamakan di sana juga).
export const ROLE_LABELS = {
  spm_sumatera:   "SPM Sumatera",
  internal_ioh:   "IOH Sumatera",
  ioh_north_sumatera:   "IOH North Sumatera",
  ioh_central_sumatera: "IOH Central Sumatera",
  ioh_south_sumatera:   "IOH South Sumatera",
  admin_mc:       "Admin MC (District Admin)",
  finance_mpx:    "Finance MPX (akses P&L per-partner - 19 akun, belum didefinisikan penuh)",
  admin_area:     "Admin Area",
  marketing_sumatera_program: "Marketing Sumatera Program",
  martahub_super_user:        "Martahub Super User",
  agency:            "Agency",
  cse_rse:           "CSE / RSE",
  bsm:               "BSM",
  pic_region:        "PIC Region",
  salesforce_mgmt_sumatera: "Salesforce Mgmt Sumatera",
  region_sfm_north:   "Region SFM North",
  region_sfm_central: "Region SFM Central",
  region_sfm_south:   "Region SFM South",
};

// Tab di dalam modul "DSE Prod. & AR" (CATEGORY_OPTIONS di DSE_ProdAR.jsx).
export const TABS = [
  { k: "dse", label: "DSE Prod. & AR" },
  { k: "dso", label: "DSO/DSP AR" },
  { k: "hoa", label: "HoA AR" },
  { k: "control-center", label: "Control Center" },
];

// GROUND TRUTH (disalin persis dari getCategoryOptionsForRole() &
// dseEditLocked di DSE_ProdAR.jsx, DIVERIFIKASI ULANG via gate render di
// page.jsx per 2026-11-10 - PENTING: modul "DSE Prod. & AR" (<DSE_ProdAR
// .../> cuma dipanggil SATU kali, digerbang KETAT oleh
// `(isSPM || isMPX || isAdminArea)`) - jadi HANYA 3 role di bawah ini yg
// BENAR2 bisa membuka modul ini. Role lain (internal_ioh, ioh_north/
// central/south_sumatera, marketing_sumatera_program, martahub_super_user,
// dst) walau RLS database-nya cukup luas (dipakai utk modul LAIN seperti
// PNL Report), TIDAK PERNAH bisa reach modul ini sama sekali - jadi TIDAK
// dimasukkan ke matrix (dulu salah dimasukkan, menyesatkan - sudah
// diperbaiki setelah audit ulang).
export const ROLE_TAB_ACCESS = {
  spm_sumatera:         { dse: "edit", dso: "edit", hoa: "edit", "control-center": "edit" },
  admin_mc:             { dse: "edit", dso: "edit", hoa: "none", "control-center": "none" },
  admin_area:           { dse: "view", dso: "edit", hoa: "edit", "control-center": "none" },
  // CATATAN (temuan user - "ada alamat email yang sebelumnya terdaftar
  // sbg finance_mpx namun tidak terdaftar di mapping admin_mc maupun
  // admin_area"): per audit 2026-11-10, 19 akun TIDAK punya mapping MC
  // atau Area sama sekali - mereka didaftarkan lewat jalur BERBEDA
  // (register.jsx "Finance MPX", akses P&L berbasis partner_name, BUKAN
  // roster per-MC) - jadi "finance_mpx" TIDAK dikosongkan total, sengaja
  // dipertahankan sbg role tersendiri utk 19 akun ini, menunggu fitur
  // "Finance MPX" didefinisikan scope aksesnya. Sementara ini (dual-
  // support di RLS/kode) akses efektifnya SAMA dgn admin_mc.
  finance_mpx:          { dse: "edit", dso: "edit", hoa: "none", "control-center": "none" },
};

// Role LAIN yg ADA di sistem (akun aktif di tabel profiles atau dikenal di
// kode) tapi TIDAK PERNAH bisa akses modul DSE Prod & AR sama sekali -
// ditampilkan terpisah sbg info, bukan baris matrix (krn semua kolomnya
// "Tidak Ada", akan terkesan matrix tapi sebenarnya cuma 1 nilai).
export const OTHER_ROLES_NO_ACCESS = [
  "internal_ioh", "ioh_north_sumatera", "ioh_central_sumatera", "ioh_south_sumatera",
  "marketing_sumatera_program", "martahub_super_user", "agency", "cse_rse", "bsm",
  "pic_region", "salesforce_mgmt_sumatera", "region_sfm_north", "region_sfm_central", "region_sfm_south",
];
export const LEVEL_RANK = { none: 0, view: 1, edit: 2 };

export function mergeAccess(roles) {
  const out = {};
  TABS.forEach((t) => { out[t.k] = "none"; });
  (roles || []).forEach((r) => {
    const a = ROLE_TAB_ACCESS[r];
    if (!a) return;
    TABS.forEach((t) => {
      if (LEVEL_RANK[a[t.k] || "none"] > LEVEL_RANK[out[t.k]]) out[t.k] = a[t.k] || "none";
    });
  });
  return out;
}

function AccessBadge({ level, d }) {
  const map = {
    edit: { icon: Pencil, label: "Bisa Edit", color: d ? "#34D399" : "#059669", bg: d ? "rgba(52,211,153,.12)" : "rgba(5,150,105,.08)" },
    view: { icon: Eye,    label: "Lihat Saja", color: d ? "#FBBF24" : "#B45309", bg: d ? "rgba(251,191,36,.12)" : "rgba(180,83,9,.08)" },
    none: { icon: Minus,  label: "Tidak Ada",  color: d ? "#6B7280" : "#9CA3AF", bg: "transparent" },
  };
  const cfg = map[level] || map.none;
  const Icon = cfg.icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 7, background: cfg.bg, color: cfg.color, fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap" }}>
      <Icon size={11} />{cfg.label}
    </span>
  );
}

export default function RoleAccessMatrix({ theme }) {
  const d = theme === "dark";
  const t = {
    card: d ? "#15191E" : "#fff", line: d ? "#262B33" : "#E7EAEE", hi: d ? "#F2F4F7" : "#101521",
    mid: d ? "#9AA2AE" : "#5B6472", lo: d ? "#6B7380" : "#8A93A1", headBg: d ? "#1B2027" : "#F7F8FA",
    shadowSm: d ? "none" : "0 1px 2px rgba(16,21,33,.04)",
  };

  const [multiRoleUsers, setMultiRoleUsers] = useState(null); // null = loading

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Ambil semua baris profile_extra_roles + profil utamanya, lalu
      // kelompokkan per profile_id supaya tiap akun tampil SATU baris
      // dgn daftar SEMUA role-nya (utama + tambahan).
      const { data: extra, error } = await supabase
        .from("profile_extra_roles")
        .select("profile_id, role, profiles!profile_extra_roles_profile_id_fkey(email, role, full_name)");
      if (cancelled) return;
      if (error) { console.error("[RoleAccessMatrix] gagal load profile_extra_roles:", error.message); setMultiRoleUsers([]); return; }
      const byProfile = new Map();
      (extra || []).forEach((row) => {
        const email = row.profiles?.email || "(tanpa email)";
        const primaryRole = row.profiles?.role;
        if (!byProfile.has(row.profile_id)) {
          byProfile.set(row.profile_id, { profile_id: row.profile_id, email, full_name: row.profiles?.full_name || "", roles: new Set(primaryRole ? [primaryRole] : []) });
        }
        byProfile.get(row.profile_id).roles.add(row.role);
      });
      const list = Array.from(byProfile.values()).map((u) => ({ ...u, roles: Array.from(u.roles) })).sort((a, b) => a.email.localeCompare(b.email));
      setMultiRoleUsers(list);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ fontFamily: FONT, marginBottom: 26 }}>
      <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", gap: 10 }}>
          <ShieldCheck size={17} color={t.mid} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.hi }}>Hak Akses Menu per Role</div>
            <div style={{ fontSize: 11.5, color: t.mid, marginTop: 1 }}>Nilai sebenarnya yang berlaku di sistem untuk modul DSE Prod. &amp; AR — bukan perkiraan.</div>
          </div>
        </div>

        {/* Matrix referensi statis */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: t.headBg }}>
                <th style={{ textAlign: "left", padding: "9px 16px", color: t.mid, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3, borderBottom: `1px solid ${t.line}` }}>Role</th>
                {TABS.map((tab) => (
                  <th key={tab.k} style={{ textAlign: "left", padding: "9px 14px", color: t.mid, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3, borderBottom: `1px solid ${t.line}`, whiteSpace: "nowrap" }}>{tab.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.keys(ROLE_TAB_ACCESS).map((role) => (
                <tr key={role} style={{ borderBottom: `1px solid ${t.line}` }}>
                  <td style={{ padding: "9px 16px", color: t.hi, fontWeight: 600 }}>{ROLE_LABELS[role] || role}</td>
                  {TABS.map((tab) => (
                    <td key={tab.k} style={{ padding: "9px 14px" }}>
                      <AccessBadge level={ROLE_TAB_ACCESS[role][tab.k]} d={d} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Catatan role lain yg TIDAK bisa akses modul ini sama sekali -
            lihat komentar OTHER_ROLES_NO_ACCESS di atas utk sitasi gate-nya. */}
        <div style={{ padding: "10px 20px", borderTop: `1px solid ${t.line}`, fontSize: 11.5, color: t.lo, lineHeight: 1.5 }}>
          Role lain yang ada di sistem — {OTHER_ROLES_NO_ACCESS.map((r) => ROLE_LABELS[r] || r).join(", ")} — <b>tidak bisa membuka modul DSE Prod.&nbsp;&amp;&nbsp;AR sama sekali</b> (ditolak di gerbang navigasi, terlepas dari hak akses tabel di database).
        </div>

        {/* Akun multi-role + akses gabungannya */}
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${t.line}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Users size={15} color={t.mid} />
            <div style={{ fontSize: 12.5, fontWeight: 700, color: t.hi }}>Akun Terdaftar di Lebih dari 1 Role</div>
          </div>
          {multiRoleUsers === null ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: t.mid, fontSize: 12, padding: "10px 0" }}><Loader2 size={14} className="spin" /> Memuat...</div>
          ) : multiRoleUsers.length === 0 ? (
            <div style={{ color: t.mid, fontSize: 12, padding: "6px 0" }}>Belum ada akun dengan role tambahan.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {multiRoleUsers.map((u) => {
                const access = mergeAccess(u.roles);
                return (
                  <div key={u.profile_id} style={{ border: `1px solid ${t.line}`, borderRadius: 10, padding: "10px 14px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                    <div style={{ minWidth: 200 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: t.hi }}>{u.email}</div>
                      <div style={{ fontSize: 11, color: t.mid, marginTop: 2 }}>{u.roles.map((r) => ROLE_LABELS[r] || r).join(" + ")}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {TABS.filter((tab) => access[tab.k] !== "none").map((tab) => (
                        <span key={tab.k} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ fontSize: 11, color: t.lo }}>{tab.label}:</span>
                          <AccessBadge level={access[tab.k]} d={d} />
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
