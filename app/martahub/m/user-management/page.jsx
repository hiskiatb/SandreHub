"use client";
/**
 * /martahub/m/user-management - Halaman User Management, menggantikan tab
 * "User Management" lama di /martahub/m/management (yang sebelumnya cuma
 * spm_sumatera). Dibuka utk 7 role yang benar-benar punya "bawahan" utk
 * dikelola: spm_sumatera, admin, head, tmv, bme, rge, tl_dsf.
 *
 * Dua tampilan berbeda tergantung posisi role di hirarki:
 *   1. spm_sumatera/admin/head/tmv → TABEL ORGANISASI 4 LEVEL, LANGSUNG
 *      TERBUKA PENUH (tanpa accordion/tap-untuk-buka sheet):
 *        Circle Sumatera → Region (North/Central/South Sumatera) → Cabang
 *        → kombo cabang×brand (BME/RGE).
 *      Circle & tiap Region SENDIRI juga punya 3 slot posisi tetap: Head
 *      TMV, TMV IM3, TMV 3ID (bukan orang cabang - lihat fetchOrgHierarchy
 *      di planData.js). spm_sumatera/admin lihat pohon PENUH (4 level);
 *      head/tmv cuma lihat SATU region miliknya sendiri (RPC juga menolak
 *      kalau dipaksa lintas region/brand, jadi UI mengikuti batasan yg sama).
 *      Tiap posisi/kombo dirender sbg baris SIAP-ISI langsung di halaman
 *      (email + nama + tombol simpan/hapus di tempat, gaya "tabel yang
 *      tinggal diisi") - TIDAK ada lagi bottom-sheet perantara utk sekadar
 *      melihat atau menambah orang. Search box di atas + pill navigasi cepat
 *      (Circle/North/Central/South) tetap ada utk lompat langsung ke bagian
 *      yang dicari tanpa scroll manual di halaman yang sekarang jauh lebih
 *      panjang (krn semuanya sengaja ditampilkan sekaligus, bukan disembunyikan).
 *      spm_sumatera TIDAK PERNAH muncul di sini sama sekali - identitasnya
 *      berasal dari pendaftaran SandraHub (lihat mh_super_admins di project
 *      MartaHub), bukan baris mh_assignments yang bisa diedit/dihapus dari
 *      User Management (lihat filter defensif di fetchOrgHierarchy).
 *   2. bme/rge/tl_dsf → daftar TIM SENDIRI saja (supervisor_assignment_id =
 *      assignment_id mereka) - tidak ada konsep wilayah utk mereka, cuma
 *      "+ Tambah Anggota" yang inherit region/brand/branch dari RPC.
 *
 * Ada PERIODE (bulan) - dipakai melihat siapa yang menjabat pada bulan itu
 * (valid_from/valid_to di mh_assignments), bukan cuma status aktif saat ini.
 *
 * "Hapus" assignment TIDAK lagi hard-delete di DB (lihat migrasi
 * mh_delete_assignment_soft_revoke) - baris cuma di-revoke (status='revoked'
 * + valid_to ditutup), jadi selalu berhasil walau assignment itu sudah
 * pernah dipakai mencatat instalasi/laporan (FK aman, riwayat tidak hilang).
 * Data yang SUDAH terisi (email ter-attach ke suatu posisi/cabang) TIDAK
 * PERNAH otomatis hilang hanya krn re-render tabel ini - satu-satunya jalan
 * suatu baris hilang dari tampilan adalah admin menekan tombol Hapus secara
 * eksplisit (dgn konfirmasi), bukan efek samping dari memuat ulang data.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Search, Loader2, X, Check, Save, Plus,
  Building2, Users, MapPin, Crown, UserX, UserPlus,
  History, LogIn, LogOut, UserCog, Pencil,
} from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../_shared/MobileShell";
import { ADDABLE_ROLES_FOR, EXECUTOR_ROLES, fetchOrgHierarchy, REGIONS, BRAND_DISPLAY } from "../_shared/planData";

const ROLE_LABEL = { spm_sumatera: "SPM Sumatera", head: "Head TMV", tmv: "Brand TMV", bme_rge: "BME/RGE", tl_dsf: "TL DSF", dsf: "DSF", md: "MD", dse: "DSE", gse: "GSE", ae: "AE", promotor: "Promotor", cse_rse: "CSE/RSE", bsm: "BSM", admin: "Admin" };
const ROLE_COLOR = {
  spm_sumatera: "#7C3AED", head: "#0F6E56", tmv: "#0F6E56", admin: "#7C3AED",
  bme_rge: "#ED1C24", tl_dsf: "#B45309", dsf: "#B45309",
  md: "#185FA5", dse: "#185FA5", gse: "#185FA5", ae: "#185FA5", promotor: "#185FA5", cse_rse: "#185FA5", bsm: "#185FA5",
};
const BRAND_COLOR = { im3: "#EAB308", tri: "#D946EF" }; // im3 = kuning terang, 3ID = magenta terang - sengaja dibuat pop/kontras spy dua brand ini tidak ketuker

// Format "terakhir aktif" (last_login_at) relatif - sama pola dgn desktop
// (app/martahub/assignments/page.jsx). null = belum pernah login sama sekali.
function formatLastActive(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "Baru saja";
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} hari lalu`;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

const ACTION_META = {
  login: { label: "Login", color: "#0F6E56", bg: "rgba(15,110,86,0.1)" },
  logout: { label: "Logout", color: "#5A5A68", bg: "#F0F0F3" },
  assign_create: { label: "Tambah Assignment", color: "#185FA5", bg: "rgba(24,95,165,0.1)" },
  assign_update: { label: "Ubah Assignment", color: "#B45309", bg: "rgba(180,83,9,0.1)" },
  assign_delete: { label: "Hapus Assignment", color: "#C62828", bg: "#FDECEC" },
  name_change: { label: "Ganti Nama", color: "#7C3AED", bg: "rgba(124,58,237,0.1)" },
};

/** Log Aktivitas (mobile) - versi ringkas dari ActivityLogView desktop,
 * scoping-nya SAMA PERSIS krn keduanya manggil RPC mh_list_audit_log yg
 * sama (SPM Sumatera/Admin lihat semua; Head/TMV lihat region/brand
 * sendiri; BME/RGE/TL DSF cuma lihat diri sendiri + tim langsung). */
function ActivityLogView({ callerEmail }) {
  const [logs, setLogs] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const { data, error } = await supabaseMarta.rpc("mh_list_audit_log", { p_limit: 300, p_caller_email: callerEmail || null });
      if (error) throw error;
      setLogs(data || []);
    } catch (e) { setErr(e.message || "Gagal memuat log aktivitas"); }
  }, [callerEmail]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    let list = logs || [];
    if (t) {
      list = list.filter((l) =>
        (l.actor_full_name || "").toLowerCase().includes(t) || (l.actor_email || "").toLowerCase().includes(t) ||
        (l.target_full_name || "").toLowerCase().includes(t) || (l.target_email || "").toLowerCase().includes(t) ||
        (l.detail || "").toLowerCase().includes(t)
      );
    }
    return list;
  }, [logs, q]);

  return (
    <div>
      <SearchBox value={q} onChange={setQ} placeholder="Cari nama, email, atau detail…" />
      {err && <Notice color="#C62828" bg="#FDECEC">{err}</Notice>}

      {logs === null ? (
        <ShellSpinner />
      ) : filtered.length === 0 ? (
        <EmptyState text="Belum ada aktivitas tercatat" />
      ) : (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
          {filtered.map((l) => {
            const meta = ACTION_META[l.action] || { label: l.action, color: "#5A5A68", bg: "#F0F0F3" };
            const Icon = l.action === "login" ? LogIn : l.action === "logout" ? LogOut : l.action === "assign_delete" ? UserX : l.action === "name_change" ? Pencil : UserCog;
            const isSelfAction = ["login", "logout", "name_change"].includes(l.action);
            return (
              <div key={l.id} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 11px", borderRadius: 13, border: "1px solid #E9EAEE", background: "#FFFFFF" }}>
                <div style={{ width: 28, height: 28, borderRadius: 9, background: meta.bg, color: meta.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={13} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.2, padding: "1px 6px", borderRadius: 999, color: meta.color, background: meta.bg }}>{meta.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#17181C" }}>{l.actor_full_name || l.actor_email}</span>
                    {!isSelfAction && l.target_email && (l.target_email !== l.actor_email) && (
                      <>
                        <span style={{ color: "#B0B0BA", fontSize: 10.5 }}>→</span>
                        <span style={{ fontSize: 12, color: "#5A5A68", fontWeight: 600 }}>{l.target_full_name || l.target_email}</span>
                      </>
                    )}
                  </div>
                  {l.detail && <div style={{ marginTop: 2, fontSize: 11.5, color: "#5A5A68" }}>{l.detail}</div>}
                  <div style={{ marginTop: 2, fontSize: 10, color: "#B0B0BA" }}>
                    {new Date(l.created_at).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {l.branch_name ? ` · ${l.branch_name}` : l.region ? ` · ${l.region}` : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Halaman ini khusus role yang punya "bawahan" utk dikelola - dsf/md/dst di
// bawah tl_dsf tidak dapat akses krn mereka bukan atasan siapa pun & juga
// tidak punya kapabilitas tambah (lihat ADDABLE_ROLES_FOR).
const ALLOWED_ROLES = ["spm_sumatera", "admin", "head", "tmv", "bme_rge", "tl_dsf"];
const GRID_ROLES = ["spm_sumatera", "admin", "head", "tmv"];

const initials = (name, email) => {
  const s = (name || email || "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : s.slice(0, 2).toUpperCase();
};

// "Head Trade Marketing & Visibility <scope>" / "Trade Marketing &
// Visibility IM3/3ID <scope>" - dipakai baik utk Circle ("Sumatera") maupun
// tiap Region ("North Sumatera" dst), cuma kata terakhir yang berganti.
function slotTitles(scopeLabel) {
  return {
    head: `Head Trade Marketing & Visibility ${scopeLabel}`,
    tmvIm3: `Trade Marketing & Visibility IM3 ${scopeLabel}`,
    tmvTri: `Trade Marketing & Visibility 3ID ${scopeLabel}`,
  };
}

export default function UserManagementPage() {
  const router = useRouter();
  const { loading: sessionLoading, email, scope } = useMartaSession();
  const [activeTab, setActiveTab] = useState("org"); // "org" | "log"

  const isAllowed = !!(scope?.found && ALLOWED_ROLES.includes(scope.role));

  if (sessionLoading) return <MobileShell active="home"><ShellSpinner /></MobileShell>;

  if (!isAllowed) {
    return (
      <MobileShell active="home">
        <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px", fontFamily: FF }}>
          <button onClick={() => router.push("/martahub/m")}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
            <ArrowLeft size={16} /> Beranda
          </button>
          <div style={{ marginTop: 60, textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#3A3A44" }}>Anda tidak punya akses ke halaman ini</div>
            <div style={{ marginTop: 6, fontSize: 12.5, color: "#8A8A96" }}>Role Anda ({ROLE_LABEL[scope?.role] || scope?.role || "-"}) tidak mengelola tim di Kelola User.</div>
          </div>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell active="home">
      <div style={{
        position: "sticky", top: 0, zIndex: 20, maxWidth: 480, margin: "0 auto",
        padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 14px",
        background: "rgba(244,245,247,0.86)", backdropFilter: "blur(18px) saturate(1.5)", WebkitBackdropFilter: "blur(18px) saturate(1.5)",
        borderBottom: "1px solid rgba(23,24,28,0.06)", boxShadow: "0 6px 20px rgba(23,24,28,0.05)",
      }}>
        <button onClick={() => router.push("/martahub/m")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
          <ArrowLeft size={16} /> Beranda
        </button>
        <div style={{ marginTop: 12, fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Kelola User</div>
        <div style={{ marginTop: 3, fontSize: 12.5, color: "#8A8A96" }}>Kelola siapa saja yang menjabat di tim Anda - mapping aktif saat ini</div>

        <div style={{ marginTop: 14, display: "flex", gap: 6 }}>
          <button onClick={() => setActiveTab("org")} type="button"
            style={{ flex: 1, padding: "9px 10px", borderRadius: 10, fontSize: 12.5, fontWeight: 800, fontFamily: FF, cursor: "pointer",
              border: `1.5px solid ${activeTab === "org" ? "#ED1C24" : "#E4E5EA"}`, background: activeTab === "org" ? "rgba(237,28,36,0.06)" : "#fff", color: activeTab === "org" ? "#ED1C24" : "#5A5A68" }}>
            Organisasi
          </button>
          <button onClick={() => setActiveTab("log")} type="button"
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 10px", borderRadius: 10, fontSize: 12.5, fontWeight: 800, fontFamily: FF, cursor: "pointer",
              border: `1.5px solid ${activeTab === "log" ? "#ED1C24" : "#E4E5EA"}`, background: activeTab === "log" ? "rgba(237,28,36,0.06)" : "#fff", color: activeTab === "log" ? "#ED1C24" : "#5A5A68" }}>
            <History size={13} /> Log Aktivitas
          </button>
        </div>
      </div>

      <div style={{ padding: "16px 20px 40px" }}>
        {activeTab === "log" ? (
          <ActivityLogView callerEmail={email} />
        ) : GRID_ROLES.includes(scope.role) ? (
          <OrgHierarchyView scope={scope} email={email} />
        ) : (
          <TeamView scope={scope} email={email} />
        )}
      </div>
    </MobileShell>
  );
}

// ═══════════════════════ Tabel organisasi 4 level (spm_sumatera/admin/head/tmv) ═══

function OrgHierarchyView({ scope, email }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [removeTarget, setRemoveTarget] = useState(null); // person row
  const [removing, setRemoving] = useState(false);
  const [removeErr, setRemoveErr] = useState("");

  const circleRef = useRef(null);
  const regionRefs = useRef({});

  const load = useCallback(async () => {
    setErr("");
    try {
      const d = await fetchOrgHierarchy(scope, null);
      setData(d);
    } catch (e) { setErr(e.message || "Gagal memuat data"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.role, scope.region, scope.brand]);

  useEffect(() => { load(); }, [load]);

  // Satu jalur simpan dipakai SEMUA baris siap-isi di tabel (slot Circle/
  // Region maupun kombo cabang×brand) - konteksnya (region/brand/branch)
  // sudah ditentukan oleh baris yang memanggil, jadi caller cukup kirim
  // email+nama. RPC sama persis dgn sebelumnya (mh_assign_user); baris lain
  // yang SUDAH terisi tidak tersentuh sama sekali oleh panggilan ini.
  const saveAssignment = useCallback(async ({ targetEmail, fullName, role, region, brand, branchSlug, branchName, dsfOrgId }) => {
    const { data: { user } } = await supabaseMarta.auth.getUser();
    const { error } = await supabaseMarta.rpc("mh_assign_user", {
      p_email: targetEmail, p_role: role, p_region: region ?? null, p_brand: brand ?? null,
      p_branch_id: branchSlug ?? null, p_branch_name: branchName ?? null, p_full_name: fullName,
      p_dsf_org_id: dsfOrgId ?? null,
      p_caller_email: user?.email || email || null,
    });
    if (error) throw error;
    await load();
  }, [email, load]);

  async function confirmRemove() {
    if (!removeTarget) return;
    if (removeTarget.email && email && removeTarget.email.toLowerCase() === email.toLowerCase()) {
      setRemoveErr("Anda tidak bisa menghapus akun/assignment milik Anda sendiri.");
      return;
    }
    setRemoving(true); setRemoveErr("");
    try {
      const { data: { user } } = await supabaseMarta.auth.getUser();
      const { error } = await supabaseMarta.rpc("mh_delete_assignment", { p_id: removeTarget.id, p_caller_email: user?.email || email || null });
      if (error) throw error;
      setRemoveTarget(null);
      await load();
    } catch (e) { setRemoveErr(e.message || "Gagal menghapus"); }
    finally { setRemoving(false); }
  }

  // Indeks datar SEMUA orang (Circle + Region + slot TMV/Head + cabang),
  // dipakai search - supaya siapa pun bisa ditemukan tanpa perlu tahu dulu
  // dia ada di level/cabang mana. Tiap entri bawa label konteks lengkap
  // (mis. "Region North Sumatera · Head TMV" atau "MEDAN · IM3 · BME")
  // supaya hasil pencarian tetap informatif walau daftarnya diratakan.
  const searchIndex = useMemo(() => {
    if (!data) return [];
    const idx = [];
    const pushSlot = (scopeLabel, people) => {
      for (const p of people) idx.push({ person: p, context: `${scopeLabel} · ${ROLE_LABEL[p.role] || p.role}` });
    };
    const pushBranchGroups = (groups) => {
      for (const g of groups) for (const p of g.people) {
        idx.push({ person: p, context: `${g.branchName} · ${BRAND_DISPLAY[g.brand] || g.brand.toUpperCase()} · ${ROLE_LABEL[p.role] || p.role}` });
      }
    };
    if (data.scoped) {
      // Brand TMV (role='tmv') tidak boleh menemukan orang di slot brand
      // LAIN lewat search juga - konsisten dgn slot yg disembunyikan di
      // RegionPanel (lihat isBrandScopedTmv di sana).
      const isBrandScopedTmv = scope.role === "tmv" && scope.brand;
      const tmvSlotPeople = isBrandScopedTmv
        ? (scope.brand.toLowerCase() === "im3" ? data.region.tmvIm3 : data.region.tmvTri)
        : [...data.region.tmvIm3, ...data.region.tmvTri];
      pushSlot(`Region ${data.region.label}`, [...data.region.head, ...tmvSlotPeople]);
      pushBranchGroups(data.region.branches);
    } else {
      pushSlot("Circle Sumatera", [...data.circle.head, ...data.circle.tmvIm3, ...data.circle.tmvTri]);
      for (const r of data.regions) {
        pushSlot(`Region ${r.label}`, [...r.head, ...r.tmvIm3, ...r.tmvTri]);
        pushBranchGroups(r.branches);
      }
    }
    return idx;
  }, [data, scope.role, scope.brand]);

  const searchResults = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return null;
    return searchIndex.filter((e) =>
      (e.person.full_name || "").toLowerCase().includes(t) ||
      (e.person.email || "").toLowerCase().includes(t) ||
      e.context.toLowerCase().includes(t)
    );
  }, [searchIndex, q]);

  if (data === null && !err) return <ShellSpinner />;

  const addableRoles = ADDABLE_ROLES_FOR[scope.role] || [];

  function scrollToNode(node) {
    node?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div>
      {err && <Notice color="#C62828" bg="#FDECEC">{err}</Notice>}
      <SearchBox value={q} onChange={setQ} placeholder="Cari nama, email, Branch, atau posisi…" />

      {/* Navigasi cepat - halaman ini sengaja menampilkan SEMUA level
          sekaligus (tanpa accordion), jadi bisa jadi panjang. Pill ini
          cuma lompat scroll ke bagian yang dicari, TIDAK menyembunyikan
          apa pun - beda dari collapse/tap-untuk-buka yang sebelumnya
          dipakai. Cuma relevan utk spm_sumatera/admin (4 menu penuh);
          head/tmv sudah langsung di satu region, tidak perlu navigasi ini. */}
      {!searchResults && !data.scoped && (
        <div style={{ marginTop: 10, display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          <JumpPill label="Circle" onClick={() => scrollToNode(circleRef.current)} />
          {REGIONS.map((r) => (
            <JumpPill key={r.key} label={r.label.replace(" Sumatera", "")} onClick={() => scrollToNode(regionRefs.current[r.key])} />
          ))}
        </div>
      )}

      {searchResults ? (
        searchResults.length === 0 ? (
          <EmptyState text="Tidak ada hasil" />
        ) : (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#8A8A96" }}>{searchResults.length} hasil ditemukan</div>
            {searchResults.map((e) => (
              <SearchResultRow key={e.person.id} entry={e} onRemove={() => setRemoveTarget(e.person)} currentEmail={email} />
            ))}
          </div>
        )
      ) : data.scoped ? (
        <div style={{ marginTop: 14 }}>
          <RegionPanel region={data.region} addableRoles={addableRoles} onSaveAssignment={saveAssignment} onRemove={setRemoveTarget} currentEmail={email} viewerScope={scope} />
        </div>
      ) : (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <CircleSection circleRef={circleRef} circle={data.circle} addableRoles={addableRoles} onSaveAssignment={saveAssignment} onRemove={setRemoveTarget} currentEmail={email} />
          {REGIONS.map((r) => {
            const region = data.regions.find((x) => x.key === r.key);
            return (
              <RegionSection key={r.key} regionRef={(el) => { regionRefs.current[r.key] = el; }}
                region={region} addableRoles={addableRoles} onSaveAssignment={saveAssignment} onRemove={setRemoveTarget} currentEmail={email} viewerScope={scope} />
            );
          })}
        </div>
      )}

      {removeTarget && (
        <RemoveConfirmSheet
          person={removeTarget} loading={removing} err={removeErr}
          onCancel={() => { setRemoveTarget(null); setRemoveErr(""); }}
          onConfirm={confirmRemove}
        />
      )}
    </div>
  );
}

function JumpPill({ label, onClick }) {
  return (
    <button onClick={onClick} style={{ flexShrink: 0, padding: "7px 13px", borderRadius: 999, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#3A3A44", fontSize: 11.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", whiteSpace: "nowrap" }}>
      {label}
    </button>
  );
}

/** Circle Sumatera - level PALING ATAS, tampil beda (aksen ungu + ikon
 * mahkota) supaya langsung kelihatan ini "puncak" hirarki, bukan sekadar
 * region ke-4. SELALU terbuka penuh (bukan accordion) - 3 slot posisinya
 * langsung berupa baris siap-isi (InlineRoleRow), tanpa perlu tap apa pun
 * utk sekadar melihat atau menambah. */
function CircleSection({ circleRef, circle, addableRoles, onSaveAssignment, onRemove, currentEmail }) {
  const titles = slotTitles("Sumatera");
  const filled = [circle.head, circle.tmvIm3, circle.tmvTri].filter((l) => l.length > 0).length;

  return (
    <div ref={circleRef} style={{ background: "#FFFFFF", border: "1.5px solid #E7D9F7", borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 14px rgba(124,58,237,0.07)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "14px 15px", background: "linear-gradient(135deg,#F5F0FE,#FBF8FF)" }}>
        <div style={{ width: 36, height: 36, borderRadius: 11, background: "linear-gradient(150deg,#7C3AED,#A78BFA)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 3px 8px rgba(124,58,237,0.3)" }}>
          <Crown size={17} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#17181C" }}>Circle Sumatera</div>
          <div style={{ marginTop: 1, fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>{filled}/3 posisi terisi</div>
        </div>
      </div>
      <div style={{ padding: "10px 14px 14px" }}>
        <InlineRoleRow title={titles.head} role="head" people={circle.head} canAdd={addableRoles.includes("head") && circle.head.length === 0} single
          context={{ region: null, brand: null, branchSlug: null, branchName: null }}
          onSaveAssignment={onSaveAssignment} onRemove={onRemove} currentEmail={currentEmail} />
        <InlineRoleRow title={titles.tmvIm3} role="tmv" people={circle.tmvIm3} canAdd={addableRoles.includes("tmv") && circle.tmvIm3.length === 0} single
          context={{ region: null, brand: "im3", branchSlug: null, branchName: null }}
          onSaveAssignment={onSaveAssignment} onRemove={onRemove} currentEmail={currentEmail} />
        <InlineRoleRow title={titles.tmvTri} role="tmv" people={circle.tmvTri} canAdd={addableRoles.includes("tmv") && circle.tmvTri.length === 0} single
          context={{ region: null, brand: "tri", branchSlug: null, branchName: null }}
          onSaveAssignment={onSaveAssignment} onRemove={onRemove} currentEmail={currentEmail} />
      </div>
    </div>
  );
}

/** Satu Region, dipakai dari pohon penuh (spm_sumatera/admin) - SELALU
 * terbuka penuh (header info + RegionPanel langsung di bawahnya), tidak
 * ada tap-untuk-buka lagi. */
function RegionSection({ regionRef, region, addableRoles, onSaveAssignment, onRemove, currentEmail, viewerScope }) {
  if (!region) return null;
  const filled = [region.head, region.tmvIm3, region.tmvTri].filter((l) => l.length > 0).length;
  const branchCount = new Set(region.branches.map((g) => g.branchId)).size;

  return (
    <div ref={regionRef} style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 18, overflow: "hidden", boxShadow: "0 2px 8px rgba(17,17,20,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 15px" }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(15,110,86,0.09)", color: "#0F6E56", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <MapPin size={15} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "#17181C" }}>Region {region.label}</div>
          <div style={{ marginTop: 1, fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>{filled}/3 posisi TMV · {branchCount} Branch</div>
        </div>
      </div>
      <div style={{ padding: "0 14px 14px" }}>
        <RegionPanel region={region} addableRoles={addableRoles} onSaveAssignment={onSaveAssignment} onRemove={onRemove} currentEmail={currentEmail} viewerScope={viewerScope} />
      </div>
    </div>
  );
}

/** Isi satu region: 3 slot TMV langsung siap-isi + SEMUA cabang di region
 * itu langsung terdaftar di bawahnya (dikelompokkan per cabang, brand
 * IM3/3ID jadi sub-baris) - dipakai baik di dalam RegionSection (pohon
 * penuh) MAUPUN langsung sbg tampilan utama utk head/tmv (satu region). */
function RegionPanel({ region, addableRoles, onSaveAssignment, onRemove, currentEmail, viewerScope }) {
  const titles = slotTitles(region.label);

  // Gabungkan kombo cabang×brand (dari fetchOrgHierarchy, 1 entri per
  // brand) jadi satu blok per cabang - supaya IM3 & 3ID cabang yang sama
  // tampil bersebelahan, bukan sbg dua kartu terpisah yang jauh.
  const branchGroups = useMemo(() => {
    const byBranch = new Map();
    for (const g of region.branches) {
      if (!byBranch.has(g.branchId)) byBranch.set(g.branchId, { branchId: g.branchId, branchName: g.branchName, combos: [] });
      byBranch.get(g.branchId).combos.push(g);
    }
    return Array.from(byBranch.values());
  }, [region.branches]);

  // Brand TMV (role='tmv') cuma boleh MELIHAT & mengelola brand-nya sendiri
  // di region ini - slot TMV brand LAIN (mis. TMV IM3 melihat baris TMV 3ID)
  // disembunyikan total, bukan cuma dikunci dari "tambah". Head TMV & admin/
  // spm_sumatera tetap melihat kedua slot brand (mereka membawahi keduanya).
  const isBrandScopedTmv = viewerScope?.role === "tmv" && viewerScope?.brand;
  const showIm3Slot = !isBrandScopedTmv || viewerScope.brand.toLowerCase() === "im3";
  const showTriSlot = !isBrandScopedTmv || viewerScope.brand.toLowerCase() === "tri";

  return (
    <div>
      <InlineRoleRow title={titles.head} role="head" people={region.head} canAdd={addableRoles.includes("head") && region.head.length === 0} single
        context={{ region: region.key, brand: null, branchSlug: null, branchName: null }}
        onSaveAssignment={onSaveAssignment} onRemove={onRemove} currentEmail={currentEmail} />
      {showIm3Slot && (
        <InlineRoleRow title={titles.tmvIm3} role="tmv" people={region.tmvIm3} canAdd={addableRoles.includes("tmv") && region.tmvIm3.length === 0} single
          context={{ region: region.key, brand: "im3", branchSlug: null, branchName: null }}
          onSaveAssignment={onSaveAssignment} onRemove={onRemove} currentEmail={currentEmail} />
      )}
      {showTriSlot && (
        <InlineRoleRow title={titles.tmvTri} role="tmv" people={region.tmvTri} canAdd={addableRoles.includes("tmv") && region.tmvTri.length === 0} single
          context={{ region: region.key, brand: "tri", branchSlug: null, branchName: null }}
          onSaveAssignment={onSaveAssignment} onRemove={onRemove} currentEmail={currentEmail} />
      )}

      <div style={{ marginTop: 14, fontSize: 11, fontWeight: 800, color: "#5A5A68", textTransform: "uppercase", letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 6 }}>
        <Building2 size={12} /> BRANCH ({branchGroups.length})
      </div>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        {branchGroups.map((b) => (
          <BranchBlock key={b.branchId} branchName={b.branchName} combos={b.combos} addableRoles={addableRoles}
            onSaveAssignment={onSaveAssignment} onRemove={onRemove} currentEmail={currentEmail} />
        ))}
      </div>
    </div>
  );
}

/** Satu blok cabang - IM3 & 3ID digabung di kartu yang sama, tiap brand
 * langsung menampilkan baris BME & RGE siap-isi. Role LAIN yang kebetulan
 * sudah ter-assign ke kombo ini (data lama) tetap ditampilkan (jangan
 * pernah disembunyikan/hilang), tapi TANPA form tambah baru - role inti
 * yang sengaja dikelola dari tabel ini cuma BME/RGE. */
function BranchBlock({ branchName, combos, addableRoles, onSaveAssignment, onRemove, currentEmail }) {
  return (
    <div style={{ background: "#FBFBFC", border: "1px solid #ECEDF0", borderRadius: 14, padding: "11px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Building2 size={13} color="#5A5A68" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{branchName}</span>
      </div>
      {combos.map((combo) => {
        const brandColor = BRAND_COLOR[combo.brand] || "#8A8A96";
        // BME & RGE SENGAJA digabung jadi satu daftar "BME / RGE" - secara
        // konsep itu jabatan yang sama, yang membedakan cuma brand & cabang
        // (sudah dipisah lewat kartu combo ini sendiri), bukan role di DB -
        // dan cuma SATU slot per cabang×brand (spt Head TMV/Brand TMV).
        const bmeRge = combo.byRole?.get("bme_rge") || [];
        // Semua "executor" di bawah BME/RGE (MD, DSF, TL DSF, DSE, GSE, AE,
        // Promotor, CSE/RSE, BSM) - yg SUDAH terisi ditampilkan sbg daftar
        // per role, penambahan orang baru (role apa pun yg diizinkan utk
        // caller ini, boleh dobel) lewat satu tombol gabungan di bawah.
        const executorRows = EXECUTOR_ROLES.map((r) => [r, combo.byRole?.get(r) || []]).filter(([, list]) => list.length > 0);
        const ctx = { region: combo.region, brand: combo.brand, branchSlug: combo.branchSlug, branchName: combo.branchName };
        const canAddBmeRge = addableRoles.includes("bme_rge") && bmeRge.length === 0;
        const executorOptions = EXECUTOR_ROLES.filter((r) => addableRoles.includes(r));
        return (
          <div key={combo.brand} style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed #E9EAEE" }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.2, padding: "2px 7px", borderRadius: 999, color: brandColor, background: `${brandColor}17` }}>
              {BRAND_DISPLAY[combo.brand] || combo.brand.toUpperCase()}
            </span>
            {/* BME & RGE sekarang SATU role tunggal "bme_rge" di database
                (bukan lagi digabung tampilan dari 2 role terpisah) - hanya
                SATU slot per cabang×brand. */}
            <InlineRoleRow title="BME / RGE" role="bme_rge" single
              people={bmeRge} canAdd={canAddBmeRge}
              context={ctx} onSaveAssignment={onSaveAssignment} onRemove={onRemove} compact currentEmail={currentEmail} />
            {executorRows.map(([r, list]) => (
              <InlineRoleRow key={r} title={`${ROLE_LABEL[r] || r} (di bawah BME/RGE)`} role={r} people={list} canAdd={false}
                context={ctx} onSaveAssignment={onSaveAssignment} onRemove={onRemove} compact currentEmail={currentEmail} nested />
            ))}
            {executorOptions.length > 0 && (
              <AddExecutorButton ctx={ctx} executorOptions={executorOptions} onSaveAssignment={onSaveAssignment} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Tombol "+ Tambahkan Executor" (mobile) - satu pintu masuk utk menambah
 * SIAPA PUN di bawah BME/RGE (MD, DSF, atau role cabang lain), opsi role yg
 * ditawarkan sudah disaring sesuai ADDABLE_ROLES_FOR caller. Membuka bottom
 * sheet: pilih role dulu (grid pill), baru isi email/nama (+ORG ID kalau
 * DSF). Menggantikan baris tambah terpisah per-role yg lama. */
function AddExecutorButton({ ctx, executorOptions, onSaveAssignment }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} type="button"
        style={{
          marginTop: 8, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          padding: "9px 12px", borderRadius: 11, border: "1.5px dashed rgba(237,28,36,0.4)", background: "rgba(237,28,36,0.05)",
          color: "#ED1C24", fontSize: 11.5, fontWeight: 800, fontFamily: FF, cursor: "pointer",
        }}>
        <UserPlus size={13} /> Tambahkan Executor
      </button>
      {open && (
        <ExecutorPickerSheet ctx={ctx} executorOptions={executorOptions}
          onClose={() => setOpen(false)}
          onSave={(fields) => onSaveAssignment({ ...fields, ...ctx })} />
      )}
    </>
  );
}

/** Bottom sheet pilih-role + isi data utk AddExecutorButton (mobile). */
function ExecutorPickerSheet({ ctx, executorOptions, onClose, onSave }) {
  const [role, setRole] = useState(null);
  const [emailInput, setEmailInput] = useState("");
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const needsOrgId = role === "dsf";
  const ready = !!(role && emailInput.trim() && name.trim() && (!needsOrgId || orgId.trim()));

  async function submit() {
    if (!ready || saving) return;
    setSaving(true); setErr("");
    try {
      await onSave({ targetEmail: emailInput.trim(), fullName: name.trim(), role, dsfOrgId: needsOrgId ? orgId.trim() : undefined });
      onClose();
    } catch (e) { setErr(e.message || "Gagal menyimpan"); setSaving(false); }
  }

  return (
    <div onClick={saving ? undefined : onClose} style={{ position: "fixed", inset: 0, background: "rgba(13,17,23,0.5)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: "#FFFFFF", borderRadius: "20px 20px 0 0", padding: "20px 20px calc(env(safe-area-inset-bottom,0px) + 20px)", fontFamily: FF, boxShadow: "0 -10px 30px rgba(0,0,0,0.14)", maxHeight: "88svh", overflowY: "auto" }}>
        <div style={{ width: 36, height: 4, borderRadius: 99, background: "#E4E5EA", margin: "0 auto 14px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: BRAND, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <UserPlus size={16} color="#fff" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: "#17181C" }}>Tambahkan Executor</div>
            <div style={{ fontSize: 11, color: "#8A8A96", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ctx.branchName} · {BRAND_DISPLAY[ctx.brand] || ctx.brand} · di bawah BME/RGE</div>
          </div>
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, color: "#5A5A68", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>1. Pilih Role</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 7, marginBottom: 16 }}>
          {executorOptions.map((r) => {
            const active = role === r;
            const rColor = ROLE_COLOR[r] || "#ED1C24";
            return (
              <button key={r} type="button" onClick={() => setRole(r)}
                style={{
                  padding: "9px 8px", borderRadius: 10, fontSize: 11.5, fontWeight: 800, fontFamily: FF, cursor: "pointer", textAlign: "center",
                  border: `1.5px solid ${active ? rColor : "#ECEDF0"}`, background: active ? `${rColor}17` : "#fff", color: active ? rColor : "#5A5A68",
                }}>
                {ROLE_LABEL[r] || r}
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, color: "#5A5A68", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>2. Data Orang</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="Email" style={miniInputStyle} />
          <input value={name} onChange={(e) => setName(e.target.value.toUpperCase())} placeholder="NAMA LENGKAP" style={{ ...miniInputStyle, textTransform: "uppercase" }} />
          {needsOrgId && <input value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="ORG ID" style={miniInputStyle} />}
        </div>
        {err && <div style={{ marginTop: 10, fontSize: 12, color: "#C62828" }}>{err}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onClose} disabled={saving}
            style={{ flex: 1, height: 46, borderRadius: 12, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 13, fontWeight: 700, fontFamily: FF, cursor: saving ? "default" : "pointer" }}>
            Batal
          </button>
          <button onClick={submit} disabled={saving || !ready} title={!role ? "Pilih role dulu" : !ready ? "Isi email & nama dulu" : "Simpan"}
            style={{ flex: 1, height: 46, borderRadius: 12, border: "none", background: ready ? BRAND : "#DCDDE3", color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: FF, cursor: saving || !ready ? "default" : "pointer", opacity: saving ? 0.75 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {saving ? <Loader2 size={14} style={{ animation: "mspin .85s linear infinite" }} /> : <Save size={14} />} Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

/** Baris "siap-isi" satu posisi/role - INTI dari tabel ini. Orang yang
 * SUDAH terisi ditampilkan langsung (nama+email+Hapus), lalu di bawahnya
 * SELALU ada satu baris kosong (email+nama+simpan) kalau caller boleh
 * mengisi role ini - tanpa perlu tap apa pun utk memunculkannya. Data yang
 * sudah ada TIDAK PERNAH hilang dari render ini kecuali admin menekan
 * Hapus (dgn konfirmasi terpisah, lihat RemoveConfirmSheet). */
function InlineRoleRow({ title, role, mixedRoles, people, canAdd, context, onSaveAssignment, onRemove, compact, currentEmail, nested, needsOrgId, single }) {
  // mixedRoles: sisa prop lama dari saat BME/RGE masih 2 role terpisah -
  // sekarang role="bme_rge" tunggal, prop ini sudah tidak dipakai lagi
  // di sini tapi dibiarkan ada di signature komponen (tidak bahaya, cuma
  // tidak pernah true).
  return (
    <div style={{ marginTop: compact ? 6 : 8, ...(nested ? { marginLeft: 14, paddingLeft: 10, borderLeft: "2px solid #ECEDF0" } : {}) }}>
      <div style={{ fontSize: compact ? 10 : 10.5, fontWeight: 700, color: "#8A8A96", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
        {title}
        {single && people.length > 0 && (
          <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.2, padding: "1px 6px", borderRadius: 999, color: "#0F6E56", background: "rgba(15,110,86,0.1)", textTransform: "none" }}>Slot terisi</span>
        )}
      </div>
      {people.length === 0 && !canAdd && (
        <div style={{ fontSize: 12, color: "#B0B0BA", fontStyle: "italic", padding: "4px 2px" }}>Belum ada</div>
      )}
      {people.map((p) => {
        const isSelf = !!(currentEmail && p.email && p.email.toLowerCase() === currentEmail.toLowerCase());
        const pColor = ROLE_COLOR[p.role] || ROLE_COLOR[role] || "#8A8A96";
        return (
        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 9, background: "#F6F7F9", borderRadius: 11, padding: "8px 10px", marginBottom: 5 }}>
          <Avatar text={initials(p.full_name, p.email)} color={pColor} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
              {p.full_name || "-"}
              {mixedRoles && (
                <span style={{ flexShrink: 0, fontSize: 8.5, fontWeight: 800, letterSpacing: 0.2, padding: "1px 6px", borderRadius: 999, color: pColor, background: `${pColor}17` }}>{ROLE_LABEL[p.role] || p.role}</span>
              )}
              {isSelf && <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 800, letterSpacing: 0.2, padding: "1px 6px", borderRadius: 999, color: "#0F6E56", background: "rgba(15,110,86,0.1)" }}>Anda</span>}
            </div>
            <div style={{ fontSize: 10.5, color: "#8A8A96", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.email}</div>
            <div style={{ marginTop: 1, fontSize: 9.5, fontWeight: 600, color: p.last_login_at ? "#B0B0BA" : "#B45309" }}>
              {p.last_login_at ? `Terakhir aktif: ${formatLastActive(p.last_login_at)}` : "Belum pernah login"}
            </div>
          </div>
          {!onRemove ? null : isSelf ? (
            <div title="Anda tidak bisa menghapus akun sendiri" style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 8, border: "1px solid #ECEDF0", background: "#F6F7F9", color: "#C7C7CF", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <UserX size={12} />
            </div>
          ) : (
            <button onClick={() => onRemove(p)} style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 8, border: "1px solid #F5C2C2", background: "#FDECEC", color: "#C62828", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <UserX size={12} />
            </button>
          )}
        </div>
        );
      })}
      {canAdd && (
        <InlineAddRow needsOrgId={needsOrgId}
          onSave={(targetEmail, fullName, orgId) => onSaveAssignment({ targetEmail, fullName, role, dsfOrgId: orgId, ...context })} />
      )}
    </div>
  );
}

/** Baris kosong Email + Nama + tombol Simpan - selalu tampil di bawah
 * InlineRoleRow (kalau caller boleh mengisi role itu), gaya "tabel yang
 * tinggal diisi" tanpa form/sheet terpisah. */
function InlineAddRow({ onSave, needsOrgId }) {
  const [emailInput, setEmailInput] = useState("");
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const ready = !!(emailInput.trim() && name.trim() && (!needsOrgId || orgId.trim()));

  async function submit() {
    if (!ready || saving) return;
    setSaving(true); setErr("");
    try {
      await onSave(emailInput.trim(), name.trim(), needsOrgId ? orgId.trim() : undefined);
      setEmailInput(""); setName(""); setOrgId("");
    } catch (e) { setErr(e.message || "Gagal menyimpan"); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="Email"
          onKeyDown={(e) => e.key === "Enter" && submit()} style={{ ...miniInputStyle, flex: "1 1 140px" }} />
        <input value={name} onChange={(e) => setName(e.target.value.toUpperCase())} placeholder="NAMA LENGKAP"
          onKeyDown={(e) => e.key === "Enter" && submit()} style={{ ...miniInputStyle, flex: "1 1 120px", textTransform: "uppercase" }} />
        {needsOrgId && (
          <input value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="ORG ID"
            onKeyDown={(e) => e.key === "Enter" && submit()} style={{ ...miniInputStyle, flex: "1 1 90px" }} />
        )}
        <button onClick={submit} disabled={saving || !ready} title={!ready ? "Isi email & nama dulu" : "Simpan"}
          style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, border: "none", background: ready ? BRAND : "#DCDDE3", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: saving || !ready ? "default" : "pointer", opacity: saving ? 0.75 : 1, transition: "background .15s" }}>
          {saving ? <Loader2 size={13} style={{ animation: "mspin .85s linear infinite" }} /> : <Save size={14} />}
        </button>
      </div>
      {err && <div style={{ marginTop: 4, fontSize: 10.5, color: "#C62828" }}>{err}</div>}
    </div>
  );
}

/** Baris hasil pencarian - orang + konteks lengkap (cabang/region + brand +
 * role) + tombol Hapus langsung - search dirancang utk "cepat ketemu &
 * selesai" pada tabel yang sekarang jauh lebih panjang. */
function SearchResultRow({ entry, onRemove, currentEmail }) {
  const { person: p, context } = entry;
  const isSelf = !!(currentEmail && p.email && p.email.toLowerCase() === currentEmail.toLowerCase());
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 14, padding: "11px 12px" }}>
      <Avatar text={initials(p.full_name, p.email)} color={ROLE_COLOR[p.role] || "#8A8A96"} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
          {p.full_name || p.email}
          {isSelf && <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 800, letterSpacing: 0.2, padding: "1px 6px", borderRadius: 999, color: "#0F6E56", background: "rgba(15,110,86,0.1)" }}>Anda</span>}
        </div>
        <div style={{ marginTop: 1, fontSize: 10.5, color: "#8A8A96", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{context}</div>
      </div>
      {isSelf ? (
        <div title="Anda tidak bisa menghapus akun sendiri" style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 9, border: "1px solid #ECEDF0", background: "#F6F7F9", color: "#C7C7CF" }}>
          <UserX size={13} />
        </div>
      ) : (
        <button onClick={onRemove} style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 9, border: "1px solid #F5C2C2", background: "#FDECEC", color: "#C62828", cursor: "pointer" }}>
          <UserX size={13} />
        </button>
      )}
    </div>
  );
}

/** Konfirmasi Hapus (revoke) - dipanggil dari baris siap-isi (InlineRoleRow)
 * & hasil pencarian. Bahasa dialognya sengaja jelas soal APA yang sebenarnya
 * terjadi (assignment diakhiri hari ini, BUKAN dihapus permanen dari
 * database - lihat migrasi mh_delete_assignment_soft_revoke) supaya tidak
 * ada kesan data hilang, sekaligus jelas kalau akses login-nya dicabut. */
function RemoveConfirmSheet({ person, loading, err, onCancel, onConfirm }) {
  return (
    <div onClick={loading ? undefined : onCancel} style={{ position: "fixed", inset: 0, background: "rgba(13,17,23,0.5)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: "#FFFFFF", borderRadius: "20px 20px 0 0", padding: "20px 20px calc(env(safe-area-inset-bottom,0px) + 20px)", fontFamily: FF, boxShadow: "0 -10px 30px rgba(0,0,0,0.14)" }}>
        <div style={{ width: 36, height: 4, borderRadius: 99, background: "#E4E5EA", margin: "0 auto 16px" }} />
        <div style={{ width: 48, height: 48, borderRadius: 14, background: "#FDECEC", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
          <UserX size={21} color="#C62828" />
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#17181C", textAlign: "center" }}>Hapus {person.full_name || person.email}?</div>
        <div style={{ marginTop: 6, fontSize: 12.5, color: "#8A8A96", textAlign: "center", lineHeight: 1.55 }}>
          Assignment ini akan diakhiri hari ini dan akses login {person.full_name ? "orang ini" : person.email} langsung dicabut. Jika ada pengganti, cukup assign email baru ke posisi/Branch yang sama - riwayat sebelumnya tetap aman.
        </div>
        {err && <div style={{ marginTop: 10, fontSize: 12, color: "#C62828", textAlign: "center", fontWeight: 600 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onCancel} disabled={loading}
            style={{ flex: 1, height: 46, borderRadius: 12, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 13, fontWeight: 700, fontFamily: FF, cursor: loading ? "default" : "pointer" }}>
            Batal
          </button>
          <button onClick={onConfirm} disabled={loading}
            style={{ flex: 1, height: 46, borderRadius: 12, border: "none", background: "#ED1C24", color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: FF, cursor: loading ? "default" : "pointer", opacity: loading ? 0.75 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {loading ? <Loader2 size={14} style={{ animation: "mspin .85s linear infinite" }} /> : <UserX size={14} />} Hapus
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════ Tampilan tim sendiri (bme/rge/tl_dsf) ══════════

/** BME/RGE/TL DSF tidak mengelola wilayah - cuma tim langsung mereka
 * sendiri (supervisor_assignment_id = assignment_id mereka). Ambil
 * assignment_id sendiri dari mh_profiles (via email), lalu filter hasil
 * mh_list_assignments (sudah difilter periode) berdasarkan itu. */
function TeamView({ scope, email }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setErr("");
    try {
      const { data: profile, error: pErr } = await supabaseMarta.from("mh_profiles").select("id").eq("email", email.toLowerCase()).maybeSingle();
      if (pErr) throw pErr;
      const myAssignmentId = profile?.id;
      const { data, error } = await supabaseMarta.rpc("mh_list_assignments", { p_period: null });
      if (error) throw error;
      setRows((data || []).filter((r) => myAssignmentId && r.supervisor_assignment_id === myAssignmentId));
    } catch (e) { setErr(e.message || "Gagal memuat tim"); }
  }, [email]);

  useEffect(() => { load(); }, [load]);

  const addableRoles = ADDABLE_ROLES_FOR[scope.role] || [];
  const filtered = (rows || []).filter((r) => {
    if (!q.trim()) return true;
    const t = q.toLowerCase();
    return (r.full_name || "").toLowerCase().includes(t) || (ROLE_LABEL[r.role] || r.role || "").toLowerCase().includes(t);
  });

  if (rows === null && !err) return <ShellSpinner />;

  return (
    <div>
      {err && <Notice color="#C62828" bg="#FDECEC">{err}</Notice>}
      <SearchBox value={q} onChange={setQ} placeholder="Cari nama atau role…" />

      <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6 }}>
        <Users size={13} color="#8A8A96" />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "#5A5A68" }}>Tim Anda ({filtered.length})</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState text="Belum ada anggota tim" />
      ) : (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 11, background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 14, padding: "11px 12px" }}>
              <Avatar text={initials(r.full_name, r.email)} color={ROLE_COLOR[r.role] || "#8A8A96"} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.full_name || r.email}</div>
                  <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 800, letterSpacing: 0.2, padding: "2px 6px", borderRadius: 5, color: ROLE_COLOR[r.role] || "#8A8A96", background: `${ROLE_COLOR[r.role] || "#8A8A96"}17` }}>
                    {ROLE_LABEL[r.role] || r.role}
                  </span>
                </div>
                {r.dsf_org_id && <div style={{ marginTop: 2, fontSize: 10.5, color: "#8A8A96" }}>ORG ID: {r.dsf_org_id}</div>}
                <div style={{ marginTop: 2, fontSize: 10, fontWeight: 600, color: r.last_login_at ? "#B0B0BA" : "#B45309" }}>
                  {r.last_login_at ? `Terakhir aktif: ${formatLastActive(r.last_login_at)}` : "Belum pernah login"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {addableRoles.length > 0 && (
        <button onClick={() => setShowAdd(true)}
          style={{ marginTop: 16, width: "100%", height: 46, borderRadius: 12, border: "none", background: BRAND, color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Plus size={14} /> Tambah Anggota
        </button>
      )}

      {showAdd && (
        <AddTeamMemberForm scope={scope} addableRoles={addableRoles}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); }} />
      )}
    </div>
  );
}

/** Form "+ Tambah Anggota" utk bme/rge (mh_bme_assign_member) & tl_dsf
 * (mh_tl_dsf_assign_dsf) - TIDAK ada field branch/brand/region (semua
 * di-inherit dari assignment caller sendiri, server-side). Utk bme/rge yang
 * pilih role "dsf", ORG ID wajib diisi (sama dgn validasi di RPC). */
function AddTeamMemberForm({ scope, addableRoles, onClose, onSaved }) {
  const [emailInput, setEmailInput] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState(addableRoles[0] || "");
  const [orgId, setOrgId] = useState("");
  const [mc, setMc] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const isTlDsf = scope.role === "tl_dsf";
  const needsOrgId = isTlDsf || role === "dsf";

  async function save() {
    if (!emailInput.trim() || !fullName.trim() || (!isTlDsf && !role)) { setErr("Email dan nama wajib diisi."); return; }
    if (needsOrgId && !orgId.trim()) { setErr("ORG ID wajib diisi utk role DSF."); return; }
    setSaving(true); setErr("");
    try {
      if (isTlDsf) {
        const { error } = await supabaseMarta.rpc("mh_tl_dsf_assign_dsf", {
          p_email: emailInput.trim(), p_full_name: fullName.trim(), p_dsf_org_id: orgId.trim(),
        });
        if (error) throw error;
      } else {
        const { error } = await supabaseMarta.rpc("mh_bme_assign_member", {
          p_email: emailInput.trim(), p_full_name: fullName.trim(), p_role: role,
          p_mc: mc.trim() || null, p_dsf_org_id: role === "dsf" ? orgId.trim() : null,
        });
        if (error) throw error;
      }
      onSaved();
    } catch (e) { setErr(e.message || "Gagal menambah"); }
    finally { setSaving(false); }
  }

  return (
    <div onClick={() => !saving && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(13,17,23,0.45)", zIndex: 450, display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: "20px 20px calc(env(safe-area-inset-bottom,0px) + 20px)", width: "100%", fontFamily: FF, maxHeight: "82vh", overflowY: "auto", boxShadow: "0 -10px 30px rgba(0,0,0,0.12)" }}>
        <div style={{ width: 36, height: 4, borderRadius: 99, background: "#E4E5EA", margin: "0 auto 16px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#17181C" }}>Tambah Anggota Tim</div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 9, border: "none", background: "#F6F7F9", color: "#5A5A68", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={14} /></button>
        </div>

        {!isTlDsf && (
          <EditField label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value)} style={fieldInputStyle}>
              {addableRoles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
            </select>
          </EditField>
        )}
        {isTlDsf && <EditField label="Role"><div style={{ ...fieldInputStyle, display: "flex", alignItems: "center", color: "#8A8A96" }}>DSF (satu-satunya role yang bisa ditambah TL DSF)</div></EditField>}

        <EditField label="Email"><input value={emailInput} onChange={(e) => setEmailInput(e.target.value)} style={fieldInputStyle} placeholder="nama@indosatooredoo.com" /></EditField>
        <EditField label="Nama Lengkap"><input value={fullName} onChange={(e) => setFullName(e.target.value.toUpperCase())} style={{ ...fieldInputStyle, textTransform: "uppercase" }} /></EditField>
        {needsOrgId && <EditField label="ORG ID DSF"><input value={orgId} onChange={(e) => setOrgId(e.target.value)} style={fieldInputStyle} placeholder="wajib utk DSF" /></EditField>}
        {!isTlDsf && <EditField label="Micro Cluster (opsional)"><input value={mc} onChange={(e) => setMc(e.target.value)} style={fieldInputStyle} /></EditField>}

        {err && <div style={{ marginTop: 10, fontSize: 12, color: "#C62828" }}>{err}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onClose} disabled={saving}
            style={{ flex: 1, height: 46, borderRadius: 12, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 13, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
            Batal
          </button>
          <button onClick={save} disabled={saving}
            style={{ flex: 1, height: 46, borderRadius: 12, border: "none", background: BRAND, color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: FF, cursor: "pointer", opacity: saving ? 0.75 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {saving ? <Loader2 size={14} style={{ animation: "mspin .85s linear infinite" }} /> : <Check size={14} />} Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════ Shared bits ═══════════════════════════════

function Avatar({ text, color }) {
  return (
    <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color, background: `${color}17` }}>
      {text}
    </div>
  );
}

function EditField({ label, children }) {
  return (
    <div style={{ marginTop: 12 }}>
      <label style={{ display: "block", marginBottom: 6, fontSize: 10.5, fontWeight: 700, color: "#8A8A96", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</label>
      {children}
    </div>
  );
}

const fieldInputStyle = { width: "100%", height: 44, padding: "0 12px", borderRadius: 11, border: "1.5px solid #ECEDF0", background: "#F6F7F9", fontSize: 13, fontFamily: FF, outline: "none", boxSizing: "border-box" };

// Border putus-putus SENGAJA dipakai (bukan solid spt fieldInputStyle) -
// menandakan visual "slot kosong siap diisi" pada baris InlineAddRow,
// beda dari field form biasa.
const miniInputStyle = { minWidth: 0, height: 36, padding: "0 10px", borderRadius: 10, border: "1.5px dashed #DCDDE3", background: "#FBFBFC", fontSize: 12, fontFamily: FF, outline: "none", boxSizing: "border-box" };

function SearchBox({ value, onChange, placeholder }) {
  return (
    <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 12px", borderRadius: 12, background: "#FFFFFF", border: "1px solid #E4E5EA" }}>
      <Search size={13} color="#9A9AA6" style={{ flexShrink: 0 }} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", fontSize: 12.5, fontFamily: FF, color: "#17181C" }} />
      {value && (
        <button onClick={() => onChange("")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 0 }}>
          <X size={13} color="#B0B0BA" />
        </button>
      )}
    </div>
  );
}

function Notice({ color, bg, children }) {
  return <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: bg, color, fontSize: 12, fontWeight: 600 }}>{children}</div>;
}

function EmptyState({ text }) {
  return (
    <div style={{ marginTop: 12, textAlign: "center", padding: "32px 20px", background: "#FFFFFF", border: "1px dashed #D8D9E0", borderRadius: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#3A3A44" }}>{text}</div>
    </div>
  );
}
