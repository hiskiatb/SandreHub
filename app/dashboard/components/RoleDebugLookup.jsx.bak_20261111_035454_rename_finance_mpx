"use client";
// Fitur pencarian role per email untuk debug (permintaan user - "coba
// buatkan fitur untuk pencarian role dengan memasukkan email nya ini
// akan menampilkan informasi yang sangat detail, yang dapat digunakan
// untuk debug issue tertentu"). Ditaruh di sub menu User Management,
// SELALU tampil (bukan tergantung umRole) - sama posisinya dengan
// RoleAccessMatrix & CombinedEmailExport.
//
// Mengumpulkan semua sumber yg sebelumnya cuma bisa dicek lewat SQL
// manual saat debugging kasus nyata di percakapan ini (akun dual-role
// adminpadang, kasus 19 akun finance_mpx tanpa mapping, dst):
//   - profiles            -> role utama, partner_name, region, dll
//   - profile_extra_roles -> role tambahan (multi-role)
//   - mf_dse_admin_mc_emails    + mf_dse_admin_mc_mapping   -> mapping MC asli
//   - mf_dse_admin_area_emails + mf_dse_admin_area_mapping  -> mapping Area asli
//   - partner_branches    -> branch yg terhubung ke partner_name akun ini
//   - access_codes        -> kode akses (tipe/status) milik partner ini
// lalu dirangkum jadi akses gabungan (pakai ROLE_TAB_ACCESS/mergeAccess
// yg SAMA dgn RoleAccessMatrix, diimpor supaya selalu konsisten) +
// beberapa "red flag" otomatis (misal: role admin_mc tapi tidak ada
// mapping MC aktif sama sekali - pola yg sama dgn 19 akun yg pernah
// salah termigrasi).
import { useState } from "react";
import { Search, Loader2, ShieldAlert, ShieldCheck, Pencil, Eye, Minus, AlertTriangle, User } from "lucide-react";
import supabase from "../../../lib/supabase";
import { ROLE_LABELS, TABS, mergeAccess } from "./RoleAccessMatrix";

const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

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

function Row({ k, v, t, mono }) {
  if (v === null || v === undefined || v === "") return null;
  return (
    <div style={{ display: "flex", gap: 10, padding: "4px 0", fontSize: 12.5 }}>
      <div style={{ width: 150, flexShrink: 0, color: t.mid }}>{k}</div>
      <div style={{ color: t.hi, fontWeight: 600, fontFamily: mono ? "monospace" : "inherit", wordBreak: "break-all" }}>{String(v)}</div>
    </div>
  );
}

function Section({ title, children, t, empty }) {
  return (
    <div style={{ border: `1px solid ${t.line}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 8 }}>{title}</div>
      {empty ? <div style={{ fontSize: 12, color: t.lo }}>{empty}</div> : children}
    </div>
  );
}

export default function RoleDebugLookup({ theme }) {
  const d = theme === "dark";
  const t = {
    card: d ? "#15191E" : "#fff", line: d ? "#262B33" : "#E7EAEE", hi: d ? "#F2F4F7" : "#101521",
    mid: d ? "#9AA2AE" : "#5B6472", lo: d ? "#6B7380" : "#8A93A1", headBg: d ? "#1B2027" : "#F7F8FA",
    shadowSm: d ? "none" : "0 1px 2px rgba(16,21,33,.04)", inputBg: d ? "#1B2027" : "#fff", inputBd: d ? "#2A3039" : "#DADFE6",
    warnBg: d ? "rgba(251,191,36,.08)" : "rgba(180,83,9,.06)", warnBd: d ? "rgba(251,191,36,.3)" : "rgba(180,83,9,.25)", warnFg: d ? "#FBBF24" : "#B45309",
  };

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null); // null = belum cari

  async function runSearch() {
    const q = email.trim().toLowerCase();
    if (!q) return;
    setLoading(true);
    setErr("");
    setResult(null);
    try {
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("id, email, full_name, username, role, partner_name, mpc_mp3, access_code, region, cluster, sdp_id, bsm_brand, bsm_branch, mf_agency_id, created_at, updated_at")
        .ilike("email", q)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!profile) {
        setResult({ notFound: true, email: q });
        setLoading(false);
        return;
      }

      const [extraRolesRes, mcEmailRes, areaEmailRes, partnerBranchRes, accessCodeRes] = await Promise.all([
        supabase.from("profile_extra_roles").select("role, created_at").eq("profile_id", profile.id),
        supabase.from("mf_dse_admin_mc_emails").select("email, label, active, mapping_id, mf_dse_admin_mc_mapping(mc, full_name, region, branch, circle, active)").ilike("email", q),
        supabase.from("mf_dse_admin_area_emails").select("email, label, active, mapping_id, mf_dse_admin_area_mapping(branch, full_name, region, circle, active)").ilike("email", q),
        profile.partner_name
          ? supabase.from("partner_branches").select("branch_name, mpc_mp3, region").eq("partner_name", profile.partner_name)
          : Promise.resolve({ data: [] }),
        profile.partner_name
          ? supabase.from("access_codes").select("code, type, is_active, partner_name").eq("partner_name", profile.partner_name)
          : Promise.resolve({ data: [] }),
      ]);

      const extraRoles = (extraRolesRes.data || []).map((r) => r.role);
      const allRoles = Array.from(new Set([profile.role, ...extraRoles].filter(Boolean)));
      const access = mergeAccess(allRoles);

      const mcMappings = (mcEmailRes.data || []).map((r) => ({ active: r.active, label: r.label, mapping: r.mf_dse_admin_mc_mapping }));
      const areaMappings = (areaEmailRes.data || []).map((r) => ({ active: r.active, label: r.label, mapping: r.mf_dse_admin_area_mapping }));
      const hasActiveMcMapping = mcMappings.some((m) => m.active && m.mapping?.active);
      const hasActiveAreaMapping = areaMappings.some((m) => m.active && m.mapping?.active);

      // Red flags otomatis - pola yg sama dgn temuan user sebelumnya
      // (akun berstatus admin_mc/admin_area tapi tanpa mapping asli).
      const flags = [];
      if ((profile.role === "admin_mc" || extraRoles.includes("admin_mc")) && !hasActiveMcMapping) {
        flags.push("Role admin_mc terdaftar, tetapi TIDAK ditemukan mapping MC aktif (mf_dse_admin_mc_emails/mapping) untuk email ini — kemungkinan salah migrasi atau akun partner-scope (mirip 19 akun finance_mpx yang pernah ditemukan).");
      }
      if ((profile.role === "admin_area" || extraRoles.includes("admin_area")) && !hasActiveAreaMapping) {
        flags.push("Role admin_area terdaftar, tetapi TIDAK ditemukan mapping Area aktif (mf_dse_admin_area_emails/mapping) untuk email ini.");
      }
      if (profile.role === "finance_mpx" && (hasActiveMcMapping || hasActiveAreaMapping)) {
        flags.push("Role masih finance_mpx tetapi ternyata PUNYA mapping MC/Area aktif — kandidat untuk dimigrasikan ke admin_mc/admin_area (perlu dicek manual).");
      }
      if (extraRoles.length === 0 && profile.role && !["spm_sumatera", "internal_ioh"].includes(profile.role) && (mcMappings.length > 1 || areaMappings.length > 1)) {
        flags.push("Email ini terdaftar di lebih dari satu baris mapping — periksa apakah seharusnya punya role tambahan di profile_extra_roles.");
      }

      setResult({
        profile, extraRoles, allRoles, access,
        mcMappings, areaMappings,
        partnerBranches: partnerBranchRes.data || [],
        accessCodes: accessCodeRes.data || [],
        flags,
      });
    } catch (e) {
      setErr(e.message || "Gagal mencari data.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ fontFamily: FONT, marginBottom: 26 }}>
      <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", gap: 10 }}>
          <Search size={17} color={t.mid} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.hi }}>Pencarian Role per Email (Debug)</div>
            <div style={{ fontSize: 11.5, color: t.mid, marginTop: 1 }}>Masukkan email untuk melihat detail role, mapping, dan akses gabungan — untuk menelusuri masalah akses seorang user.</div>
          </div>
        </div>

        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.line}`, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
            placeholder="contoh: adminpadang@ultimamultimedia.id"
            style={{ flex: 1, minWidth: 260, height: 38, padding: "0 14px", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13, fontFamily: "inherit" }}
          />
          <button
            onClick={runSearch}
            disabled={loading || !email.trim()}
            style={{ height: 38, padding: "0 18px", borderRadius: 9, border: "none", background: "#2563EB", color: "#fff", fontSize: 13, fontWeight: 700, cursor: loading ? "default" : "pointer", display: "flex", alignItems: "center", gap: 7, opacity: loading || !email.trim() ? 0.6 : 1 }}
          >
            {loading ? <Loader2 size={14} className="spin" /> : <Search size={14} />} Cari
          </button>
        </div>

        {err && (
          <div style={{ padding: "14px 20px", color: "#B91C1C", fontSize: 12.5, display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldAlert size={15} /> {err}
          </div>
        )}

        {result?.notFound && (
          <div style={{ padding: "20px", textAlign: "center", color: t.mid, fontSize: 13 }}>
            Tidak ditemukan akun dengan email <b>{result.email}</b> di tabel profiles.
          </div>
        )}

        {result && !result.notFound && (
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Red flags */}
            {result.flags.length > 0 && (
              <div style={{ border: `1px solid ${t.warnBd}`, background: t.warnBg, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6, color: t.warnFg, fontWeight: 700, fontSize: 12.5 }}>
                  <AlertTriangle size={14} /> Potensi Masalah Terdeteksi
                </div>
                {result.flags.map((f, i) => (
                  <div key={i} style={{ fontSize: 12, color: t.warnFg, marginTop: 4 }}>• {f}</div>
                ))}
              </div>
            )}

            {/* Identitas */}
            <Section title="Identitas Akun" t={t}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <User size={14} color={t.mid} />
                <span style={{ fontSize: 13.5, fontWeight: 700, color: t.hi }}>{result.profile.full_name || "(tanpa nama)"}</span>
              </div>
              <Row k="Email" v={result.profile.email} t={t} mono />
              <Row k="User ID" v={result.profile.id} t={t} mono />
              <Row k="Username" v={result.profile.username} t={t} />
              <Row k="Partner Name" v={result.profile.partner_name} t={t} />
              <Row k="MPC/MP3" v={result.profile.mpc_mp3} t={t} />
              <Row k="Access Code" v={result.profile.access_code} t={t} mono />
              <Row k="Region" v={result.profile.region} t={t} />
              <Row k="Cluster" v={result.profile.cluster} t={t} />
              <Row k="SDP ID" v={result.profile.sdp_id} t={t} />
              <Row k="BSM Brand" v={result.profile.bsm_brand} t={t} />
              <Row k="BSM Branch" v={result.profile.bsm_branch} t={t} />
              <Row k="Dibuat" v={result.profile.created_at ? new Date(result.profile.created_at).toLocaleString("id-ID") : null} t={t} />
              <Row k="Diperbarui" v={result.profile.updated_at ? new Date(result.profile.updated_at).toLocaleString("id-ID") : null} t={t} />
            </Section>

            {/* Role & akses gabungan */}
            <Section title="Role & Akses Gabungan" t={t}>
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: t.mid }}>Role utama: </span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: t.hi }}>{ROLE_LABELS[result.profile.role] || result.profile.role || "(tidak ada)"}</span>
              </div>
              {result.extraRoles.length > 0 ? (
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: t.mid }}>Role tambahan: </span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: t.hi }}>{result.extraRoles.map((r) => ROLE_LABELS[r] || r).join(", ")}</span>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: t.lo, marginBottom: 8 }}>Tidak ada role tambahan (bukan akun multi-role).</div>
              )}
              <div style={{ fontSize: 11.5, color: t.mid, marginBottom: 6 }}>Akses nyata di modul DSE Prod. &amp; AR (hasil gabungan semua role di atas):</div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                {TABS.map((tab) => (
                  <span key={tab.k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11.5, color: t.lo }}>{tab.label}:</span>
                    <AccessBadge level={result.access[tab.k]} d={d} />
                  </span>
                ))}
              </div>
            </Section>

            {/* Mapping Admin MC */}
            <Section title="Mapping Admin MC (mf_dse_admin_mc_emails)" t={t} empty={result.mcMappings.length === 0 ? "Tidak terdaftar di roster Admin MC manapun." : null}>
              {result.mcMappings.map((m, i) => (
                <div key={i} style={{ fontSize: 12.5, padding: "4px 0", color: t.hi }}>
                  {m.active ? <ShieldCheck size={12} color="#059669" style={{ display: "inline", marginRight: 5 }} /> : <Minus size={12} color={t.lo} style={{ display: "inline", marginRight: 5 }} />}
                  MC <b>{m.mapping?.mc || "?"}</b> — {m.mapping?.full_name || "(tanpa nama)"} · Region {m.mapping?.region || "-"} · Branch {m.mapping?.branch || "-"} · Circle {m.mapping?.circle || "-"}
                  {" "}<span style={{ color: t.mid }}>[{m.active ? "email aktif" : "email nonaktif"}, mapping {m.mapping?.active ? "aktif" : "nonaktif"}]</span>
                </div>
              ))}
            </Section>

            {/* Mapping Admin Area */}
            <Section title="Mapping Admin Area (mf_dse_admin_area_emails)" t={t} empty={result.areaMappings.length === 0 ? "Tidak terdaftar di roster Admin Area manapun." : null}>
              {result.areaMappings.map((m, i) => (
                <div key={i} style={{ fontSize: 12.5, padding: "4px 0", color: t.hi }}>
                  {m.active ? <ShieldCheck size={12} color="#059669" style={{ display: "inline", marginRight: 5 }} /> : <Minus size={12} color={t.lo} style={{ display: "inline", marginRight: 5 }} />}
                  Branch <b>{m.mapping?.branch || "?"}</b> — {m.mapping?.full_name || "(tanpa nama)"} · Region {m.mapping?.region || "-"} · Circle {m.mapping?.circle || "-"}
                  {" "}<span style={{ color: t.mid }}>[{m.active ? "email aktif" : "email nonaktif"}, mapping {m.mapping?.active ? "aktif" : "nonaktif"}]</span>
                </div>
              ))}
            </Section>

            {/* Partner branches */}
            {result.profile.partner_name && (
              <Section title={`Branch Terhubung ke Partner "${result.profile.partner_name}"`} t={t} empty={result.partnerBranches.length === 0 ? "Tidak ada data branch untuk partner ini." : null}>
                {result.partnerBranches.map((b, i) => (
                  <div key={i} style={{ fontSize: 12.5, padding: "4px 0", color: t.hi }}>{b.branch_name} <span style={{ color: t.mid }}>— MPC/MP3 {b.mpc_mp3 || "-"} · Region {b.region || "-"}</span></div>
                ))}
              </Section>
            )}

            {/* Access codes */}
            {result.profile.partner_name && (
              <Section title={`Kode Akses Milik Partner "${result.profile.partner_name}"`} t={t} empty={result.accessCodes.length === 0 ? "Tidak ada kode akses terdaftar untuk partner ini." : null}>
                {result.accessCodes.map((c, i) => (
                  <div key={i} style={{ fontSize: 12.5, padding: "4px 0", color: t.hi, fontFamily: "monospace" }}>
                    {c.code} <span style={{ color: t.mid, fontFamily: "inherit" }}>— tipe {c.type} · {c.is_active ? "aktif" : "nonaktif"}</span>
                  </div>
                ))}
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
