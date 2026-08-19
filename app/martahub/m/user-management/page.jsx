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
  ArrowLeft, ChevronLeft, ChevronRight, Search, Loader2, X, Check, Plus,
  Building2, Users, MapPin, Crown, UserX,
} from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../_shared/MobileShell";
import { ADDABLE_ROLES_FOR, fetchOrgHierarchy, REGIONS, BRAND_DISPLAY } from "../_shared/planData";

const ROLE_LABEL = { spm_sumatera: "SPM Sumatera", head: "Head TMV", tmv: "Brand TMV", bme: "BME", rge: "RGE", tl_dsf: "TL DSF", dsf: "DSF", md: "MD", dse: "DSE", gse: "GSE", ae: "AE", promotor: "Promotor", cse_rse: "CSE/RSE", bsm: "BSM", admin: "Admin" };
const ROLE_COLOR = {
  spm_sumatera: "#7C3AED", head: "#0F6E56", tmv: "#0F6E56", admin: "#7C3AED",
  bme: "#ED1C24", rge: "#EC008C", tl_dsf: "#B45309", dsf: "#B45309",
  md: "#185FA5", dse: "#185FA5", gse: "#185FA5", ae: "#185FA5", promotor: "#185FA5", cse_rse: "#185FA5", bsm: "#185FA5",
};
const BRAND_COLOR = { im3: "#E53935", tri: "#E23B86" };
const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

// Halaman ini khusus role yang punya "bawahan" utk dikelola - dsf/md/dst di
// bawah tl_dsf tidak dapat akses krn mereka bukan atasan siapa pun & juga
// tidak punya kapabilitas tambah (lihat ADDABLE_ROLES_FOR).
const ALLOWED_ROLES = ["spm_sumatera", "admin", "head", "tmv", "bme", "rge", "tl_dsf"];
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
  const [monthDate, setMonthDate] = useState(() => { const d = new Date(); d.setDate(1); return d; });

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
            <div style={{ marginTop: 6, fontSize: 12.5, color: "#8A8A96" }}>Role Anda ({ROLE_LABEL[scope?.role] || scope?.role || "-"}) tidak mengelola tim di User Management.</div>
          </div>
        </div>
      </MobileShell>
    );
  }

  const periodKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}-01`;

  function shiftMonth(delta) {
    const d = new Date(monthDate);
    d.setMonth(d.getMonth() + delta);
    setMonthDate(d);
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
        <div style={{ marginTop: 12, fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>User Management</div>
        <div style={{ marginTop: 3, fontSize: 12.5, color: "#8A8A96" }}>Kelola siapa saja yang menjabat di tim Anda</div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 14 }}>
          <button onClick={() => shiftMonth(-1)}
            style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <ChevronLeft size={14} />
          </button>
          <div style={{ minWidth: 140, textAlign: "center", fontSize: 13, fontWeight: 800, color: "#17181C" }}>
            {MONTH_NAMES[monthDate.getMonth()]} {monthDate.getFullYear()}
          </div>
          <button onClick={() => shiftMonth(1)}
            style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div style={{ padding: "16px 20px 40px" }}>
        {GRID_ROLES.includes(scope.role)
          ? <OrgHierarchyView scope={scope} email={email} period={periodKey} />
          : <TeamView scope={scope} email={email} period={periodKey} />}
      </div>
    </MobileShell>
  );
}

// ═══════════════════════ Tabel organisasi 4 level (spm_sumatera/admin/head/tmv) ═══

function OrgHierarchyView({ scope, email, period }) {
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
      const d = await fetchOrgHierarchy(scope, period);
      setData(d);
    } catch (e) { setErr(e.message || "Gagal memuat data"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.role, scope.region, scope.brand, period]);

  useEffect(() => { load(); }, [load]);

  // Satu jalur simpan dipakai SEMUA baris siap-isi di tabel (slot Circle/
  // Region maupun kombo cabang×brand) - konteksnya (region/brand/branch)
  // sudah ditentukan oleh baris yang memanggil, jadi caller cukup kirim
  // email+nama. RPC sama persis dgn sebelumnya (mh_assign_user); baris lain
  // yang SUDAH terisi tidak tersentuh sama sekali oleh panggilan ini.
  const saveAssignment = useCallback(async ({ targetEmail, fullName, role, region, brand, branchSlug, branchName }) => {
    const { data: { user } } = await supabaseMarta.auth.getUser();
    const { error } = await supabaseMarta.rpc("mh_assign_user", {
      p_email: targetEmail, p_role: role, p_region: region ?? null, p_brand: brand ?? null,
      p_branch_id: branchSlug ?? null, p_branch_name: branchName ?? null, p_full_name: fullName,
      p_caller_email: user?.email || email || null,
    });
    if (error) throw error;
    await load();
  }, [email, load]);

  async function confirmRemove() {
    if (!removeTarget) return;
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
      pushSlot(`Region ${data.region.label}`, [...data.region.head, ...data.region.tmvIm3, ...data.region.tmvTri]);
      pushBranchGroups(data.region.branches);
    } else {
      pushSlot("Circle Sumatera", [...data.circle.head, ...data.circle.tmvIm3, ...data.circle.tmvTri]);
      for (const r of data.regions) {
        pushSlot(`Region ${r.label}`, [...r.head, ...r.tmvIm3, ...r.tmvTri]);
        pushBranchGroups(r.branches);
      }
    }
    return idx;
  }, [data]);

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
      <SearchBox value={q} onChange={setQ} placeholder="Cari nama, email, cabang, atau posisi…" />

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
              <SearchResultRow key={e.person.id} entry={e} onRemove={() => setRemoveTarget(e.person)} />
            ))}
          </div>
        )
      ) : data.scoped ? (
        <div style={{ marginTop: 14 }}>
          <RegionPanel region={data.region} addableRoles={addableRoles} onSaveAssignment={saveAssignment} onRemove={setRemoveTarget} />
        </div>
      ) : (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <CircleSection circleRef={circleRef} circle={data.circle} addableRoles={addableRoles} onSaveAssignment={saveAssignment} onRemove={setRemoveTarget} />
          {REGIONS.map((r) => {
            const region = data.regions.find((x) => x.key === r.key);
            return (
              <RegionSection key={r.key} regionRef={(el) => { regionRefs.current[r.key] = el; }}
                region={region} addableRoles={addableRoles} onSaveAssignment={saveAssignment} onRemove={setRemoveTarget} />
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
function CircleSection({ circleRef, circle, addableRoles, onSaveAssignment, onRemove }) {
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
        <InlineRoleRow title={titles.head} role="head" people={circle.head} canAdd={addableRoles.includes("head")}
          context={{ region: null, brand: null, branchSlug: null, branchName: null }}
          onSaveAssignment={onSaveAssignment} onRemove={onRemove} />
        <InlineRoleRow title={titles.tmvIm3} role="tmv" people={circle.tmvIm3} canAdd={addableRoles.includes("tmv")}
          context={{ region: null, brand: "im3", branchSlug: null, branchName: null }}
          onSaveAssignment={onSaveAssignment} onRemove={onRemove} />
        <InlineRoleRow title={titles.tmvTri} role="tmv" people={circle.tmvTri} canAdd={addableRoles.includes("tmv")}
          context={{ region: null, brand: "tri", branchSlug: null, branchName: null }}
          onSaveAssignment={onSaveAssignment} onRemove={onRemove} />
      </div>
    </div>
  );
}

/** Satu Region, dipakai dari pohon penuh (spm_sumatera/admin) - SELALU
 * terbuka penuh (header info + RegionPanel langsung di bawahnya), tidak
 * ada tap-untuk-buka lagi. */
function RegionSection({ regionRef, region, addableRoles, onSaveAssignment, onRemove }) {
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
          <div style={{ marginTop: 1, fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>{filled}/3 posisi TMV · {branchCount} cabang</div>
        </div>
      </div>
      <div style={{ padding: "0 14px 14px" }}>
        <RegionPanel region={region} addableRoles={addableRoles} onSaveAssignment={onSaveAssignment} onRemove={onRemove} />
      </div>
    </div>
  );
}

/** Isi satu region: 3 slot TMV langsung siap-isi + SEMUA cabang di region
 * itu langsung terdaftar di bawahnya (dikelompokkan per cabang, brand
 * IM3/3ID jadi sub-baris) - dipakai baik di dalam RegionSection (pohon
 * penuh) MAUPUN langsung sbg tampilan utama utk head/tmv (satu region). */
function RegionPanel({ region, addableRoles, onSaveAssignment, onRemove }) {
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

  return (
    <div>
      <InlineRoleRow title={titles.head} role="head" people={region.head} canAdd={addableRoles.includes("head")}
        context={{ region: region.key, brand: null, branchSlug: null, branchName: null }}
        onSaveAssignment={onSaveAssignment} onRemove={onRemove} />
      <InlineRoleRow title={titles.tmvIm3} role="tmv" people={region.tmvIm3} canAdd={addableRoles.includes("tmv")}
        context={{ region: region.key, brand: "im3", branchSlug: null, branchName: null }}
        onSaveAssignment={onSaveAssignment} onRemove={onRemove} />
      <InlineRoleRow title={titles.tmvTri} role="tmv" people={region.tmvTri} canAdd={addableRoles.includes("tmv")}
        context={{ region: region.key, brand: "tri", branchSlug: null, branchName: null }}
        onSaveAssignment={onSaveAssignment} onRemove={onRemove} />

      <div style={{ marginTop: 14, fontSize: 11, fontWeight: 800, color: "#5A5A68", textTransform: "uppercase", letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 6 }}>
        <Building2 size={12} /> Cabang ({branchGroups.length})
      </div>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        {branchGroups.map((b) => (
          <BranchBlock key={b.branchId} branchName={b.branchName} combos={b.combos} addableRoles={addableRoles}
            onSaveAssignment={onSaveAssignment} onRemove={onRemove} />
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
function BranchBlock({ branchName, combos, addableRoles, onSaveAssignment, onRemove }) {
  return (
    <div style={{ background: "#FBFBFC", border: "1px solid #ECEDF0", borderRadius: 14, padding: "11px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Building2 size={13} color="#5A5A68" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{branchName}</span>
      </div>
      {combos.map((combo) => {
        const brandColor = BRAND_COLOR[combo.brand] || "#8A8A96";
        const otherRoles = Array.from(combo.byRole?.entries() || []).filter(([r]) => r !== "bme" && r !== "rge");
        const ctx = { region: combo.region, brand: combo.brand, branchSlug: combo.branchSlug, branchName: combo.branchName };
        return (
          <div key={combo.brand} style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed #E9EAEE" }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.2, padding: "2px 7px", borderRadius: 999, color: brandColor, background: `${brandColor}17` }}>
              {BRAND_DISPLAY[combo.brand] || combo.brand.toUpperCase()}
            </span>
            <InlineRoleRow title="BME" role="bme" people={combo.byRole?.get("bme") || []} canAdd={addableRoles.includes("bme")}
              context={ctx} onSaveAssignment={onSaveAssignment} onRemove={onRemove} compact />
            <InlineRoleRow title="RGE" role="rge" people={combo.byRole?.get("rge") || []} canAdd={addableRoles.includes("rge")}
              context={ctx} onSaveAssignment={onSaveAssignment} onRemove={onRemove} compact />
            {otherRoles.map(([r, list]) => (
              <InlineRoleRow key={r} title={ROLE_LABEL[r] || r} role={r} people={list} canAdd={false}
                context={ctx} onSaveAssignment={onSaveAssignment} onRemove={onRemove} compact />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Baris "siap-isi" satu posisi/role - INTI dari tabel ini. Orang yang
 * SUDAH terisi ditampilkan langsung (nama+email+Hapus), lalu di bawahnya
 * SELALU ada satu baris kosong (email+nama+simpan) kalau caller boleh
 * mengisi role ini - tanpa perlu tap apa pun utk memunculkannya. Data yang
 * sudah ada TIDAK PERNAH hilang dari render ini kecuali admin menekan
 * Hapus (dgn konfirmasi terpisah, lihat RemoveConfirmSheet). */
function InlineRoleRow({ title, role, people, canAdd, context, onSaveAssignment, onRemove, compact }) {
  return (
    <div style={{ marginTop: compact ? 6 : 8 }}>
      <div style={{ fontSize: compact ? 10 : 10.5, fontWeight: 700, color: "#8A8A96", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 4 }}>{title}</div>
      {people.length === 0 && !canAdd && (
        <div style={{ fontSize: 12, color: "#B0B0BA", fontStyle: "italic", padding: "4px 2px" }}>Belum ada</div>
      )}
      {people.map((p) => (
        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 9, background: "#F6F7F9", borderRadius: 11, padding: "8px 10px", marginBottom: 5 }}>
          <Avatar text={initials(p.full_name, p.email)} color={ROLE_COLOR[role] || "#8A8A96"} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.full_name || "-"}</div>
            <div style={{ fontSize: 10.5, color: "#8A8A96", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.email}</div>
          </div>
          <button onClick={() => onRemove(p)} style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 8, border: "1px solid #F5C2C2", background: "#FDECEC", color: "#C62828", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <UserX size={12} />
          </button>
        </div>
      ))}
      {canAdd && (
        <InlineAddRow onSave={(targetEmail, fullName) => onSaveAssignment({ targetEmail, fullName, role, ...context })} />
      )}
    </div>
  );
}

/** Baris kosong Email + Nama + tombol Simpan - selalu tampil di bawah
 * InlineRoleRow (kalau caller boleh mengisi role itu), gaya "tabel yang
 * tinggal diisi" tanpa form/sheet terpisah. */
function InlineAddRow({ onSave }) {
  const [emailInput, setEmailInput] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!emailInput.trim() || !name.trim()) { setErr("Isi email & nama"); return; }
    setSaving(true); setErr("");
    try {
      await onSave(emailInput.trim(), name.trim());
      setEmailInput(""); setName("");
    } catch (e) { setErr(e.message || "Gagal menyimpan"); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="Email"
          onKeyDown={(e) => e.key === "Enter" && submit()} style={{ ...miniInputStyle, flex: "1 1 140px" }} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama lengkap"
          onKeyDown={(e) => e.key === "Enter" && submit()} style={{ ...miniInputStyle, flex: "1 1 120px" }} />
        <button onClick={submit} disabled={saving}
          style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, border: "none", background: BRAND, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: saving ? 0.75 : 1 }}>
          {saving ? <Loader2 size={13} style={{ animation: "mspin .85s linear infinite" }} /> : <Check size={14} />}
        </button>
      </div>
      {err && <div style={{ marginTop: 4, fontSize: 10.5, color: "#C62828" }}>{err}</div>}
    </div>
  );
}

/** Baris hasil pencarian - orang + konteks lengkap (cabang/region + brand +
 * role) + tombol Hapus langsung - search dirancang utk "cepat ketemu &
 * selesai" pada tabel yang sekarang jauh lebih panjang. */
function SearchResultRow({ entry, onRemove }) {
  const { person: p, context } = entry;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 14, padding: "11px 12px" }}>
      <Avatar text={initials(p.full_name, p.email)} color={ROLE_COLOR[p.role] || "#8A8A96"} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.full_name || p.email}</div>
        <div style={{ marginTop: 1, fontSize: 10.5, color: "#8A8A96", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{context}</div>
      </div>
      <button onClick={onRemove} style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 9, border: "1px solid #F5C2C2", background: "#FDECEC", color: "#C62828", cursor: "pointer" }}>
        <UserX size={13} />
      </button>
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
          Assignment ini akan diakhiri hari ini dan akses login {person.full_name ? "orang ini" : person.email} langsung dicabut. Jika ada pengganti, cukup assign email baru ke posisi/cabang yang sama - riwayat sebelumnya tetap aman.
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
function TeamView({ scope, email, period }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setErr("");
    try {
      const { data: profile, error: pErr } = await supabaseMarta.from("mh_profiles").select("assignment_id").eq("email", email.toLowerCase()).maybeSingle();
      if (pErr) throw pErr;
      const myAssignmentId = profile?.assignment_id;
      const { data, error } = await supabaseMarta.rpc("mh_list_assignments", { p_period: period || null });
      if (error) throw error;
      setRows((data || []).filter((r) => myAssignmentId && r.supervisor_assignment_id === myAssignmentId));
    } catch (e) { setErr(e.message || "Gagal memuat tim"); }
  }, [email, period]);

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
        <EditField label="Nama Lengkap"><input value={fullName} onChange={(e) => setFullName(e.target.value)} style={fieldInputStyle} /></EditField>
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
