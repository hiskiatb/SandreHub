"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AlertTriangle, Plus, Check, Copy, Lock, Save, UserX, Building2, MapPin, Crown, Loader2, Pencil, UserPlus, History, LogIn, LogOut, UserCog, Search, ChevronLeft, ChevronRight, ImageDown } from "lucide-react";
import MartaShell, { T, FONT } from "../components/MartaShell";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";
import { getMartaScope } from "../../../lib/martaScope";
import { useLivePresenceRows } from "../../../lib/martaPresence";
import { BranchesBody } from "../branches/BranchesBody";
import { supabase } from "../../../lib/supabase";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Label field Cluster/MC berbeda per brand - konvensi yg sudah ada di spec
// (IM3 disebut "MC", 3ID disebut "Cluster"), keduanya sama-sama kolom
// mh_assignments.mc/mh_sites.mc. MIRROR mobile assignments_provider.dart.
const mcLabelForBrand = (brand) => (brand === "tri" ? "Cluster" : "MC");

// ✅ "Head" → "Head TMV" dan "TMV" → "Brand TMV" adalah relabel tampilan saja
// (MARTAHUB_ACTIVITY_USER_SPEC.md §4.5) - nilai role di database (head/tmv)
// TIDAK berubah. Role tl_dsf/dsf/md/spm_sumatera baru (§4.2/§4.5).
// ✅ dse/gse/ae/promotor/cse_rse ditambahkan (§ POSMAT semua level) - role
// baru khusus pencatat POSMAT, branch-scoped spt bme/rge, TANPA atasan.
// ✅ "bsm" SEKARANG setara DMO penuh (bukan lagi role POSMAT executor) -
// bisa buat plan & lihat aktivitas DMO lain sendiri di branch×brand yg
// sama (lihat migrasi add_bsm_role_as_bme_rge_peer di project MartaHub).
// `mh_profiles.role`/`mh_assignments.role` TIDAK LAGI dibatasi enum CHECK di
// database (cuma validasi format) - role baru ke depannya CUKUP ditambah di
// sini, TANPA migrasi DB.
const ROLES = [
  ["spm_sumatera", "SPM Sumatera (Superadmin Nasional)"],
  ["head", "Head TMV (per Region)"],
  ["head_of_regional_operation", "Head of Regional Operation (per Region)"],
  ["visibility_region_lead", "Visibility Region Lead (per Region)"],
  ["gtm_region_lead", "GTM Region Lead (per Region)"],
  ["tmv", "Brand TMV (Region × Brand)"],
  ["bme_rge", "DMO (Branch)"],
  ["tl_dsf", "TL DSF (Team Leader DSF)"],
  ["dsf", "DSF (Field Sales)"],
  ["md", "MD (Material Distributor)"],
  ["dse", "DSE"],
  ["gse", "GSE"],
  ["ae", "AE"],
  ["promotor", "Promotor"],
  ["cse_rse", "CSE/RSE"],
  ["bsm", "HEAD OF AREA"],
];
const REGIONS = [["NORTH SUMATERA", "NORTH SUMATERA"], ["CENTRAL SUMATERA", "CENTRAL SUMATERA"], ["SOUTH SUMATERA", "SOUTH SUMATERA"]];
const BRANDS = [["im3", "IM3"], ["tri", "3ID (TRI)"]];
const ROLE_LABEL = Object.fromEntries(ROLES);
// Label role tabel "profiles" (akun LOGIN CMS DESKTOP project TraceHub -
// SandraHub/spm_sumatera bridge, BEDA sistem dari ROLE_LABEL di atas yg
// utk mh_profiles/mh_assignments) - dipakai utk pesan error "email sudah
// terdaftar sbg role apa" di ProgramAccountSlotRow.
const PROFILE_ROLE_LABEL = {
  spm_sumatera: "SPM Sumatera",
  marketing_sumatera_program: "Marketing Sumatera (Program)",
  cse_rse: "CSE/RSE",
  bsm: "BSM",
};
const REGION_LABEL = Object.fromEntries(REGIONS);
// spm_sumatera TIDAK BOLEH dikelola (tambah/edit/hapus) dari User Management
// - identitasnya berasal dari pendaftaran SandraHub (tabel profiles di
// project TraceHub, lihat lib/martaAccess.js), dan DB sekarang menolak keras
// mh_delete_assignment utk baris ini (migrasi mh_super_admins_from_sandrahub
// di project MartaHub). ROLES (di atas) tetap dipertahankan utuh utk lookup
// label (ROLE_LABEL dipakai di banyak tempat termasuk baris spm_sumatera
// lama yg mungkin masih ada di data), tapi dropdown Tambah/Edit & daftar yg
// ditampilkan HARUS pakai daftar/role terfilter di bawah ini.
const SELECTABLE_ROLES = ROLES.filter(([v]) => v !== "spm_sumatera");
const isProtectedRole = (role) => role === "spm_sumatera";

// Role yang atasannya diisi lewat `supervisor_assignment_id` (§4.2/§4.5a),
// bukan lewat region/brand/branch manual - nilai = role atasan yang valid.
// bme/rge sekarang boleh langsung di bawah "head" (Head TMV, region-only,
// SEMUA brand) juga - bukan cuma "tmv" (Brand TMV) spt sebelumnya. Ini
// dipakai DUA arah: dropdown "Atasan Langsung" di form bme/rge sendiri,
// DAN picker multi-select "DMO di bawah ini" di form tmv/head (lihat
// `SubordinatePicker`) - satu sumber kebenaran utk role atasan yg valid.
const SUPERVISOR_ROLES_FOR = {
  bme_rge: ["tmv", "head"],
  tl_dsf: ["bme_rge"], md: ["bme_rge"],
  dsf: ["tl_dsf"],
};
// Role yang BISA jadi "atasan langsung" bme/rge lewat picker multi-select
// (bukan cuma tmv brand-scoped, head region-scoped juga boleh).
const isSupervisorCapableRole = (role) => role === "tmv" || role === "head" || role === "head_of_regional_operation";
const isHierarchyRole = (role) => Object.prototype.hasOwnProperty.call(SUPERVISOR_ROLES_FOR, role);

const badge = (txt, c, bg) => <span style={{ fontSize: 10.5, fontWeight: 800, color: c, background: bg, border: `1px solid ${c}33`, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>{txt}</span>;

// Format "terakhir aktif" (last_login_at) relatif spy gampang dibaca sekilas
// - "Baru saja" utk beberapa detik terakhir, naik ke menit/jam/hari, jatuh ke
// tanggal biasa kalau sudah lebih dari seminggu. null/undefined = belum
// pernah login sama sekali (akun baru yg belum pernah masuk MartaHub).
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

// Status login/presence - versi CMS, SAMA PERSIS logikanya dgn
// app/martahub/m/user-management/page.jsx (mobile) supaya kedua permukaan
// menampilkan status yg identik utk orang yg sama (sumbernya SATU tabel
// mh_presence, keyed by email, diisi lewat heartbeat MartaShell/MobileShell).
const ACTIVE_WINDOW_MS = 3 * 60 * 1000;
function loginStatus(p) {
  const seenTs = p.last_seen_at ? new Date(p.last_seen_at).getTime() : NaN;
  const loginTs = p.last_login_at ? new Date(p.last_login_at).getTime() : NaN;
  const bestTs = !Number.isNaN(seenTs) ? seenTs : (!Number.isNaN(loginTs) ? loginTs : null);
  const active = !Number.isNaN(seenTs) && (Date.now() - seenTs) < ACTIVE_WINDOW_MS;
  if (active) return { active: true, label: "Aktif sekarang", color: T.success };
  if (bestTs) return { active: false, label: `Terakhir aktif: ${formatLastActive(bestTs)}`, color: T.lo };
  return { active: false, label: "Belum pernah login", color: "#B45309" };
}
function mergePresence(people, presenceRows) {
  const map = new Map((presenceRows || []).map((r) => [(r.email || "").toLowerCase(), r.last_seen_at]));
  for (const p of people || []) {
    const seen = map.get((p.email || "").toLowerCase());
    if (seen) p.last_seen_at = seen;
  }
}
function LoginStatusBadge({ person, style }) {
  const st = loginStatus(person);
  return (
    <div style={{ marginTop: 1, fontSize: 9.5, fontWeight: 700, color: st.color, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", ...style }}>
      {st.active && <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.success, flexShrink: 0, boxShadow: `0 0 0 3px ${T.success}26` }} />}
      {st.label}
    </div>
  );
}

// Label + warna per jenis aksi di Log Aktivitas - dipakai desktop & (via
// pola yg sama) mobile.
const ACTION_META = {
  login: { label: "Login", color: "#0F6E56", bg: "rgba(15,110,86,0.1)" },
  logout: { label: "Logout", color: "#5A5A68", bg: "#F0F0F3" },
  assign_create: { label: "Tambah Assignment", color: "#185FA5", bg: "rgba(24,95,165,0.1)" },
  assign_update: { label: "Ubah Assignment", color: "#B45309", bg: "rgba(180,83,9,0.1)" },
  assign_delete: { label: "Hapus Assignment", color: "#C62828", bg: "#FDECEC" },
  name_change: { label: "Ganti Nama", color: "#7C3AED", bg: "rgba(124,58,237,0.1)" },
};

// Brand pop utk tampilan Kartu (org-hierarchy, spt mobile) - kuning IM3 &
// magenta 3ID sengaja lebih terang/kontras drpd T.im3/T.tri (dipakai badge
// tabel lama) supaya dua brand ini tidak ketuker sekilas pandang.
const BRAND_COLOR_POP = { im3: "#EAB308", tri: "#D946EF" };
// Warna per role DMO/MD/DSF/TL DSF - dipakai avatar & badge kecil di
// kartu, konsisten dgn palet mobile (app/martahub/m/user-management).
const ROLE_COLOR_CARD = { bme_rge: "#ED1C24", md: "#185FA5", dsf: "#B45309", tl_dsf: "#B45309" };
const toBranchSlug = (name) => (name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "");

// Periode (bulan) yang dilihat di tabel/hierarki assignment & cabang - SAMA
// PERSIS pola & tujuan dgn app/martahub/m/user-management (mobile): bulan
// berjalan dikirim sbg p_period=null (identik dgn perilaku sebelum selector
// ini ada), bulan lain mengirim tanggal 1 bulan tsb. Menjelajah bulan apa
// pun TIDAK pernah mengunci tombol Tambah/Edit/Hapus - RPC-nya selalu
// berlaku "mulai sekarang" dan aman krn soft-revoke, jadi selector ini
// murni utk MELIHAT riwayat/rencana, bukan pembatasan akses.
function isSameMonth(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }
function monthLabel(d) { return d.toLocaleDateString("id-ID", { month: "long", year: "numeric" }); }
function periodToISO(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; }
// Role lain (selain DMO/MD/DSF) yang bisa langsung ditambah di bawah
// DMO lewat kartu cabang - SEMUA role branch-scoped yg ada di ROLES,
// bukan cuma MD/DSF. Ditampilkan lewat toggle "+ Role lain" spy default
// tidak penuh, tapi begitu dibuka SEMUA jenis role bisa diisi > 1 orang.
// "bsm" DIKELUARKAN - sekarang setara DMO penuh (ditampilkan sbg
// SlotRow sendiri sejajar DMO di bawah), bukan lagi bawahannya.
const BRANCH_SUBROLES = ROLES.map(([v]) => v).filter((v) => !["spm_sumatera", "head", "tmv", "bme_rge", "bsm", "md", "dsf"].includes(v));
// Semua role "executor" di bawah DMO (MD, DSF, + role cabang lain) -
// digabung jadi satu daftar pilihan utk tombol "+ Tambahkan Executor".
const EXECUTOR_ROLES = ["md", "dsf", ...BRANCH_SUBROLES];

// Kelola Cabang (dulu nav terpisah /martahub/branches) DISATUKAN ke sini
// sbg tab kedua - satu halaman "User & Branch Management" shg admin tidak
// perlu loncat menu buat dua hal yg sama-sama bagian dari strukturisasi
// Oktober (akun per cabang x 2 brand). Route /martahub/branches sendiri
// TETAP ada (deep link lama masih jalan), cuma sudah tidak muncul di nav.
export default function AssignmentsPage() {
  const [tab, setTab] = useState("users"); // "users" | "branches"
  // Satu periode (bulan) dipakai BERSAMA oleh tab Assignment & Cabang -
  // pindah tab TIDAK mereset bulan yang sedang dilihat, supaya "struktur
  // cabang di bulan X" & "siapa menjabat di bulan X" selalu konsisten.
  const [period, setPeriod] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const isCurrentPeriod = isSameMonth(period, new Date());
  return (
    <MartaShell active="assignments" title="User Management" subtitle="Kelola siapa menjabat di mana, dan master data cabang - satu tempat, satu periode yang sama.">
      {(ctx) => (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setTab("users")} style={{ padding: "9px 16px", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: FONT,
                border: `1.5px solid ${tab === "users" ? T.primary : T.line}`, background: tab === "users" ? T.primaryBg : "#fff", color: tab === "users" ? T.primary : T.mid }}>
                Assignment (User)
              </button>
              <button onClick={() => setTab("branches")} style={{ padding: "9px 16px", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: FONT,
                border: `1.5px solid ${tab === "branches" ? T.primary : T.line}`, background: tab === "branches" ? T.primaryBg : "#fff", color: tab === "branches" ? T.primary : T.mid }}>
                Cabang
              </button>
            </div>
            {/* Selector periode (bulan) - dipakai BERSAMA kedua tab (lihat
                catatan isSameMonth/periodToISO). Menjelajah bulan apa pun
                TIDAK pernah mengunci Tambah/Edit/Hapus - murni utk melihat
                riwayat/rencana dgn aman. */}
            <div style={{ display: "flex", alignItems: "center", gap: 2, border: `1px solid ${T.line}`, borderRadius: 9, padding: "2px 4px", background: "#fff" }}>
              <button onClick={() => setPeriod((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} title="Bulan sebelumnya"
                style={{ width: 26, height: 26, borderRadius: 7, border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: T.mid }}>
                <ChevronLeft size={14} />
              </button>
              <div style={{ minWidth: 112, textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: T.hi }}>{monthLabel(period)}</div>
                <div style={{ fontSize: 9.5, color: T.lo }}>{isCurrentPeriod ? "Bulan berjalan" : "Mengikuti susunan terakhir"}</div>
              </div>
              <button onClick={() => setPeriod((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} title="Bulan berikutnya"
                style={{ width: 26, height: 26, borderRadius: 7, border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: T.mid }}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          {tab === "users" ? (
            <Body canManage={ctx?.canManage} callerEmail={ctx?.session?.user?.email} session={ctx?.session} period={period} />
          ) : (
            <BranchesBody canManage={ctx?.canManage} period={period} />
          )}
        </div>
      )}
    </MartaShell>
  );
}



function Body({ canManage, callerEmail, session, period }) {
  const [viewMode, setViewMode] = useState("cards"); // "cards" | "table" | "tree"
  const periodParam = isSameMonth(period, new Date()) ? null : periodToISO(period);
  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]); // mh_branches - dipakai grid Kartu (org-hierarchy)
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  // Scope caller (Head/Brand TMV) - membatasi Region/Brand yg boleh dipilih
  // saat Tambah/Edit assignment (§ region-brand-branch-cluster tl_dsf/dsf/md).
  const [scope, setScope] = useState(null);
  useEffect(() => {
    let on = true;
    getMartaScope(callerEmail).then((s) => { if (on) setScope(s); });
    return () => { on = false; };
  }, [callerEmail]);

  // spm_sumatera disaring dari SEMUA yang dirender/dikelola di halaman ini
  // (tabel, hierarki, dropdown Tambah/Edit) - lihat catatan isProtectedRole.
  const visibleRows = useMemo(() => rows.filter((r) => !isProtectedRole(r.role)), [rows]);

  function copyEmail(u) {
    navigator.clipboard?.writeText(u.email);
    setCopiedId(u.id);
    setTimeout(() => setCopiedId((c) => (c === u.id ? null : c)), 1600);
  }

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [a, p] = await Promise.all([
        supabaseMarta.rpc("mh_list_assignments", { p_period: periodParam }),
        supabaseMarta.from("mh_profiles").select("id, email, full_name, status").eq("status", "pending"),
      ]);
      if (a.error) throw new Error(a.error.message);
      const freshRows = a.data || [];
      setRows(freshRows);
      setPending(p.data || []);
      return freshRows; // dikembalikan supaya caller (mis. addAssignments) bisa langsung pakai data segar tanpa menunggu state re-render
    } catch (e) { setErr(e.message || "Gagal memuat"); return []; }
    finally { setLoading(false); }
  }, [periodParam]);
  useEffect(() => { load(); }, [load]);

  // Presence realtime bersama (lib/martaPresence.js) - status "Aktif
  // sekarang" ter-update sendiri tiap ada heartbeat baru dari siapa pun,
  // TANPA perlu refresh halaman ini (sebelumnya cuma snapshot sekali saat
  // load). mergePresence memutasi baris `rows` LANGSUNG - dipanggil ulang
  // tiap render dgn data presence terbaru, aman krn idempoten & tidak
  // memicu setState (re-render sudah dipicu oleh presenceRows berubah).
  const presenceRows = useLivePresenceRows();
  if (rows.length) mergePresence(rows, presenceRows);
  useEffect(() => {
    let on = true;
    supabaseMarta.rpc("mh_list_branches", { p_period: periodParam }).then(({ data }) => { if (on) setBranches(data || []); });
    return () => { on = false; };
  }, [periodParam]);

  // Susun ulang `visibleRows` (SUDAH difilter spm_sumatera) jadi struktur
  // Circle Sumatera → 3 Region → cabang×brand - SAMA PERSIS logika
  // fetchOrgHierarchy (app/martahub/m/_shared/planData.js) dipakai mobile,
  // cuma di sini dibangun dari `rows` yg SUDAH ter-load (bukan RPC terpisah)
  // spy satu sumber data dgn tabel/hierarki di halaman yg sama.
  const orgTree = useMemo(() => {
    const people = visibleRows;
    function roleSlot(role, region, brand) {
      return people.filter((p) => p.role === role && !p.branch_id
        && (region === null ? !p.region : p.region === region)
        && (brand === null ? !p.brand : (p.brand || "").toLowerCase() === brand));
    }
    // Dedup per email utk role region-level (brand-agnostic) - dipakai utk
    // tmv & 3 tier baru (head_of_regional_operation, visibility_region_lead,
    // gtm_region_lead) spy data lama yg msh brand-spesifik tidak tampil dobel.
    function regionRoleDeduped(role, region) {
      const all = people.filter((p) => p.role === role && !p.branch_id
        && (region === null ? !p.region : p.region === region));
      const byEmail = new Map();
      for (const p of all) {
        const k = (p.email || p.id || "").toLowerCase();
        if (!byEmail.has(k)) byEmail.set(k, p);
      }
      return Array.from(byEmail.values());
    }
    function roleTriplet(region) {
      return {
        head: roleSlot("head", region, null),
        // Tier baru di antara Head of Region & Visibility/GTM Region Lead -
        // otoritas sama dgn "head" (region-locked saat assign, full-scope
        // saat lihat data - lihat mh_home_scope/mh_assign_user).
        headOfRegionalOperation: regionRoleDeduped("head_of_regional_operation", region),
        visibilityRegionLead: regionRoleDeduped("visibility_region_lead", region),
        gtmRegionLead: regionRoleDeduped("gtm_region_lead", region),
        tmv: regionRoleDeduped("tmv", region),
      };
    }
    function branchGroups(branchesInRegion) {
      const groups = [];
      for (const b of branchesInRegion) {
        const slug = toBranchSlug(b.name);
        for (const brand of ["im3", "tri"]) {
          // Head of Area (bsm) & DMO (bme_rge) kini SATU slot per cabang,
          // dipakai lintas brand (brand=null) - baris brand=null utk kedua
          // role ini ikut tampil di combo IM3 MAUPUN 3ID (data lama yg msh
          // brand-spesifik tetap kebaca spt biasa, tidak hilang).
          const combo = people.filter((p) => (p.branch_id === slug || p.branch_id === b.id)
            && ((p.brand || "").toLowerCase() === brand || (!p.brand && (p.role === "bsm" || p.role === "bme_rge"))));
          const byRole = new Map();
          for (const p of combo) { if (!byRole.has(p.role)) byRole.set(p.role, []); byRole.get(p.role).push(p); }
          groups.push({ branchId: b.id, branchSlug: slug, branchName: b.name, region: b.region, brand, byRole });
        }
      }
      return groups;
    }
    return {
      circle: roleTriplet(null),
      regions: REGIONS.map(([key, label]) => ({
        key, label,
        ...roleTriplet(key),
        branches: branchGroups(branches.filter((b) => b.region === key)),
      })),
    };
  }, [visibleRows, branches]);

  // Simpan satu assignment langsung dari kartu "siap-isi" (spt mobile) -
  // membungkus addAssignments yg sudah ada supaya banner info/error &
  // refresh data konsisten dgn jalur Tambah/Edit lama.
  async function quickAssign({ targetEmail, fullName, role, region, brand, branchSlug, branchName, dsfOrgId }) {
    await addAssignments([{ email: targetEmail, fullName, role, region, brand, branchId: branchSlug, branchName, dsfOrgId }]);
  }

  // Varian quickAssign KHUSUS DMO (role bme_rge) - isi SATU email yg sama
  // sekaligus utk kedua brand (IM3 & 3ID) di cabang yg sama, supaya tidak
  // perlu input manual dua kali. Dikirim sbg 2 item ke addAssignments
  // (masing2 brand jadi baris mh_assignments sendiri - arsitektur multi-slot
  // per (email,role,brand,branch) sudah mendukung email yg sama di 2 brand).
  async function quickAssignBoth({ targetEmail, fullName, role, region, branchSlug, branchName, dsfOrgId }) {
    await addAssignments([
      { email: targetEmail, fullName, role, region, brand: "im3", branchId: branchSlug, branchName, dsfOrgId },
      { email: targetEmail, fullName, role, region, brand: "tri", branchId: branchSlug, branchName, dsfOrgId },
    ]);
  }

  // Sama spt mobile - pengguna tidak boleh menghapus assignment/akun
  // miliknya sendiri (RPC mh_delete_assignment sudah menolak ini di server,
  // ini lapis UX supaya tidak perlu gagal dulu baru tahu). Dipakai kartu
  // MAUPUN baris tabel.
  function requestRemove(row) {
    if (row.email && callerEmail && row.email.toLowerCase() === callerEmail.toLowerCase()) return;
    setConfirmState({
      title: "Hapus assignment?",
      message: `Akses ${row.email} untuk scope ini dihapus permanen & user tak bisa masuk lagi. Jika ada pengganti, cukup assign email baru ke branch/brand yang sama - data sebelumnya tetap dapat diakses karena terikat ke branch, bukan orang.`,
      confirmLabel: "Hapus",
      onConfirm: () => removeAssignment(row.id),
    });
  }

  // Edit email/nama dari kartu (spt "siap-isi" tapi utk baris yg SUDAH ada
  // orangnya) - lewat mh_update_assignment yg sama dipakai EditModal tabel,
  // SEMUA field lain (role/region/brand/branch_id/supervisor/dsf_org_id/mc)
  // dikirim balik PERSIS spt semula (lihat cardEditSave di bawah) supaya
  // ganti email/nama TIDAK PERNAH memindah atau menghapus data cabang/role -
  // data memang terikat ke baris assignment (branch×role), bukan ke akun
  // emailnya, jadi ganti email di sini murni relabel "siapa" yg pegang baris
  // yg sama, bukan bikin baris baru.
  const [cardEditRow, setCardEditRow] = useState(null);
  // TIDAK memakai `updateAssignment` di atas krn fungsi itu menelan error-nya
  // sendiri (cuma menaruh di banner halaman, tidak melempar) - CardEditModal
  // perlu error itu DILEMPAR supaya modal-nya sendiri yg menampilkan &
  // TETAP TERBUKA saat gagal, alih-alih diam-diam tertutup spt sukses.
  async function cardEditSave(row, { email, fullName }) {
    const { error } = await supabaseMarta.rpc("mh_update_assignment", {
      p_id: row.id,
      p_role: row.role, p_region: row.region || null, p_brand: row.brand || null,
      p_branch_id: row.branch_id || null, p_branch_name: row.branch_name || null,
      p_full_name: fullName, p_email: email,
      p_supervisor_assignment_id: row.supervisor_assignment_id || null,
      p_dsf_org_id: row.dsf_org_id || null,
      p_caller_email: callerEmail || null, p_mc: row.mc || null,
    });
    if (error) throw new Error(friendlyAssignError(error.message));
    setInfo("Assignment diperbarui.");
    await load();
  }

  // Set/lepas atasan utk sekumpulan bme/rge sekaligus - dipakai saat picker
  // multi-select "DMO di bawah ini" di form tmv/head disimpan. Tiap baris
  // ditulis ulang lewat mh_update_assignment dgn SEMUA field aslinya utuh,
  // cuma p_supervisor_assignment_id yg berubah (jadi id tmv/head ini utk yg
  // baru dicentang, null utk yg baru dilepas).
  async function linkSubordinates(newSupervisorId, addedIds = [], removedIds = [], fromRows) {
    const byId = new Map((fromRows || rows).map((r) => [r.id, r]));
    const jobs = [];
    const writeJob = (r, supervisorAssignmentId) => supabaseMarta.rpc("mh_update_assignment", {
      p_id: r.id, p_role: r.role, p_region: r.region || null, p_brand: r.brand || null,
      p_branch_id: r.branch_id || null, p_branch_name: r.branch_name || null, p_full_name: r.full_name || null,
      p_supervisor_assignment_id: supervisorAssignmentId, p_dsf_org_id: r.dsf_org_id || null,
      p_caller_email: callerEmail || null, p_mc: r.mc || null, p_email: r.email || null,
    });
    for (const id of addedIds) { const r = byId.get(id); if (r) jobs.push(writeJob(r, newSupervisorId)); }
    for (const id of removedIds) { const r = byId.get(id); if (r) jobs.push(writeJob(r, null)); }
    if (jobs.length === 0) return;
    const results = await Promise.all(jobs);
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
  }

  // Simpan satu / banyak assignment sekaligus (DMO bisa pilih banyak branch×brand).
  // `subordinateIds` (opsional) - dipakai KHUSUS saat role tmv/head: daftar
  // id bme/rge yg langsung ditautkan sbg bawahan begitu assignment tmv/head
  // ini selesai dibuat (baru dapat id-nya SETELAH insert, makanya di-link
  // belakangan, bukan bareng payload insert).
  async function addAssignments(items, subordinateIds) {
    setErr(""); setInfo("");
    try {
      let ok = 0;
      let lastForm = null;
      for (const form of items) {
        const email = form.email.trim().toLowerCase();
        // Coverage urban/rural ditiadakan - BME & RGE fungsional identik (label saja).
        // Tulis lewat RPC SECURITY DEFINER: menghindari RLS (web pakai anon bridge).
        const { error } = await supabaseMarta.rpc("mh_assign_user", {
          p_email: email,
          p_role: form.role,
          p_region: form.region || null,
          p_brand: form.brand || null,
          p_branch_id: form.branchId || null,
          p_branch_name: form.branchName || null,
          p_coverage: null,
          p_note: null,
          p_full_name: form.fullName || null,
          p_supervisor_assignment_id: form.supervisorAssignmentId || null,
          p_dsf_org_id: form.dsfOrgId || null,
          p_caller_email: callerEmail || null,
          p_mc: form.mc || null,
        });
        if (error) throw new Error(friendlyAssignError(error.message));
        ok += 1;
        lastForm = { ...form, email };
      }
      setShowAdd(false);
      const freshRows = await load();

      if (subordinateIds?.length && lastForm && isSupervisorCapableRole(lastForm.role)) {
        const created = freshRows.find((r) => r.role === lastForm.role && r.email === lastForm.email
          && String(r.region || "") === String(lastForm.region || "") && String(r.brand || "") === String(lastForm.brand || ""));
        if (created) {
          await linkSubordinates(created.id, subordinateIds, [], freshRows);
          await load();
        }
      }
      setInfo(ok === 1 ? "1 assignment tersimpan." : `${ok} assignment tersimpan.`);
    } catch (e) { setErr(e.message); }
  }

  // `subChanges` (opsional) - { added, removed } id bme/rge, dipakai KHUSUS
  // saat mengedit assignment role tmv/head lewat picker "DMO di bawah
  // ini" (lihat SubordinatePicker) - ditautkan/dilepas SETELAH update baris
  // tmv/head-nya sendiri berhasil.
  async function updateAssignment(id, form, subChanges) {
    setErr(""); setInfo("");
    try {
      const { error } = await supabaseMarta.rpc("mh_update_assignment", {
        p_id: id,
        p_role: form.role,
        p_region: form.region || null,
        p_brand: form.brand || null,
        p_branch_id: form.branchId || null,
        p_branch_name: form.branchName || null,
        p_full_name: form.fullName || null,
        p_supervisor_assignment_id: form.supervisorAssignmentId || null,
        p_dsf_org_id: form.dsfOrgId || null,
        p_caller_email: callerEmail || null,
        p_mc: form.mc || null,
        p_email: form.email || null,
      });
      if (error) throw new Error(friendlyAssignError(error.message));

      if (subChanges && (subChanges.added?.length || subChanges.removed?.length)) {
        await linkSubordinates(id, subChanges.added, subChanges.removed);
      }

      setInfo("Assignment diperbarui.");
      setEditRow(null);
      await load();
    } catch (e) { setErr(e.message); }
  }

  async function removeAssignment(id) {
    try {
      const { error } = await supabaseMarta.rpc("mh_delete_assignment", { p_id: id, p_caller_email: callerEmail || null });
      if (error) throw new Error(error.message);
      await load();
    } catch (e) { setErr(e.message); }
  }

  async function dismiss(id) {
    try {
      const { error } = await supabaseMarta.rpc("mh_dismiss_pending", { p_id: id, p_caller_email: callerEmail || null });
      if (error) throw new Error(error.message);
      await load();
    } catch (e) { setErr(e.message); }
  }

  return (
    <div>
      {!MARTA_CONFIGURED && (
        <div style={{ ...card, borderColor: T.warning, background: T.warningBg, color: "#7a5b00", marginBottom: 16 }}>
          Supabase MartaHub belum dikonfigurasi / project paused - data tampil kosong. Set env & restore project untuk data live.
        </div>
      )}
      {err && <div style={{ ...card, borderColor: T.error, background: T.errorBg, color: T.error, marginBottom: 16 }}>{err}</div>}
      {info && <div style={{ ...card, borderColor: T.success, background: T.successBg, color: T.success, marginBottom: 16 }}>{info}</div>}

      {/* Pending users */}
      {pending.length > 0 && (
        <div style={{ ...card, marginBottom: 18, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, fontWeight: 800, fontSize: 13.5, background: T.warningBg, color: "#7a5b00" }}>
            Menunggu di-assign ({pending.length})
          </div>
          {pending.map((u, i) => (
            <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderTop: i ? `1px solid ${T.line}` : "none" }}>
              <span style={{ fontWeight: 700 }}>{u.email}</span>
              <span style={{ color: T.mid, fontSize: 12.5 }}>{u.full_name}</span>
              <button onClick={() => copyEmail(u)} style={{ ...btn, marginLeft: "auto", ...(copiedId === u.id ? { color: T.success, border: `1px solid ${T.success}66` } : {}) }}>
                {copiedId === u.id ? <><Check size={14} /> Disalin</> : <><Copy size={14} /> Salin email</>}
              </button>
              {canManage && <button onClick={() => setConfirmState({ title: "Hapus dari antrian?", message: `Email ${u.email} akan dikeluarkan dari daftar menunggu. Jika user login lagi, ia bisa muncul kembali.`, confirmLabel: "Hapus", onConfirm: () => dismiss(u.id) })} style={{ ...btn, color: T.error, border: `1px solid ${T.error}44` }}>Hapus</button>}
            </div>
          ))}
        </div>
      )}

      {/* Super User (SPM Sumatera) - sumber datanya TERPISAH dari
          mh_profiles/mh_assignments (tabel mh_super_admins), makanya diberi
          kartu & RPC sendiri (mh_list/add/remove_super_admin), BUKAN bagian
          dari isProtectedRole/visibleRows di atas. Hanya spm_sumatera/admin
          (scope.unscoped) yg boleh lihat & kelola - Head/Brand TMV TIDAK
          PERNAH melihat kartu ini walau canManage true utk mereka. */}
      {scope?.unscoped && <SuperAdminCard callerEmail={callerEmail} />}

      {/* Assignments table / hierarki - spm_sumatera SENGAJA disaring dari
          apa pun yg ditampilkan/dikelola di sini (lihat isProtectedRole di
          atas) - identitasnya berasal dari pendaftaran SandraHub, bukan baris
          mh_assignments yg bisa diedit/dihapus lewat User Management. */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Daftar Assignment <span style={{ color: T.mid, fontWeight: 500 }}>· {visibleRows.length}</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", border: `1px solid ${T.line}`, borderRadius: 9, overflow: "hidden" }}>
              <button onClick={() => setViewMode("cards")} style={{ ...btn, border: "none", borderRadius: 0, background: viewMode === "cards" ? T.hover || "#F0F2F5" : "#fff", fontWeight: viewMode === "cards" ? 800 : 600 }}>Kartu</button>
              <button onClick={() => setViewMode("table")} style={{ ...btn, border: "none", borderRadius: 0, background: viewMode === "table" ? T.hover || "#F0F2F5" : "#fff", fontWeight: viewMode === "table" ? 800 : 600 }}>Tabel</button>
              <button onClick={() => setViewMode("tree")} style={{ ...btn, border: "none", borderRadius: 0, background: viewMode === "tree" ? T.hover || "#F0F2F5" : "#fff", fontWeight: viewMode === "tree" ? 800 : 600 }}>Hierarki</button>
              <button onClick={() => setViewMode("log")} style={{ ...btn, border: "none", borderRadius: 0, background: viewMode === "log" ? T.hover || "#F0F2F5" : "#fff", fontWeight: viewMode === "log" ? 800 : 600, display: "flex", alignItems: "center", gap: 5 }}><History size={13} /> Log Aktivitas</button>
            </div>
            {canManage && <button onClick={() => setShowAdd(true)} style={pbtn}>Tambah <Plus size={15} /></button>}
          </div>
        </div>

        {viewMode === "cards" ? (
          <CardsView orgTree={orgTree} canManage={canManage} callerEmail={callerEmail} session={session} onAdd={quickAssign} onAddBoth={quickAssignBoth} onRemove={requestRemove} onEdit={setCardEditRow} loading={loading} />
        ) : viewMode === "log" ? (
          <ActivityLogView callerEmail={callerEmail} />
        ) : viewMode === "tree" ? (
          <div style={{ padding: 16 }}>
            {loading ? (
              <div style={{ padding: 26, textAlign: "center", color: T.lo }}>Memuat…</div>
            ) : (
              <HierarchyTree rows={visibleRows} />
            )}
          </div>
        ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
            <thead><tr style={{ background: "#F7F9FC", color: T.mid, textAlign: "left" }}>
              {["Email", "Role", "Atasan", "Region", "Brand", "Branch", "Status", "Terakhir Aktif", ""].map((h) => <th key={h} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={9} style={{ padding: 26, textAlign: "center", color: T.lo }}>Memuat…</td></tr>}
              {!loading && visibleRows.length === 0 && <tr><td colSpan={9} style={{ padding: 26, textAlign: "center", color: T.lo }}>Belum ada assignment.</td></tr>}
              {!loading && visibleRows.map((r) => {
                const sup = r.supervisor_assignment_id ? rows.find((x) => x.id === r.supervisor_assignment_id) : null;
                return (
                <tr key={r.id} style={{ borderTop: `1px solid ${T.line}` }}>
                  <td style={{ padding: "10px 14px", fontWeight: 700 }}>
                    {r.email}{r.full_name && <span style={{ color: T.mid, fontWeight: 500, marginLeft: 8, fontSize: 12 }}>{r.full_name}</span>}
                    {r.dsf_org_id && <span style={{ color: T.lo, fontWeight: 500, marginLeft: 8, fontSize: 11 }}>ID: {r.dsf_org_id}</span>}
                  </td>
                  <td style={{ padding: "10px 14px", color: T.hi, fontWeight: 600 }}>{ROLE_LABEL[r.role] || r.role}</td>
                  <td style={{ padding: "10px 14px", color: T.mid, fontSize: 12 }}>{sup ? (sup.full_name || sup.email) : "-"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>{REGION_LABEL[r.region] || r.region || "-"}</td>
                  <td style={{ padding: "10px 14px" }}>{r.brand ? badge(r.brand === "tri" ? "3ID" : "IM3", r.brand === "tri" ? T.tri : T.im3, "#fff0f4") : "-"}</td>
                  <td style={{ padding: "10px 14px", color: T.mid }}>
                    {r.branch_name || r.branch_id || "-"}
                    {r.mc && <span style={{ color: T.lo, fontSize: 11.5, marginLeft: 6 }}>· {r.mc}</span>}
                  </td>
                  <td style={{ padding: "10px 14px" }}>{r.logged_in ? badge("Aktif", T.success, T.successBg) : badge("Menunggu login", "#8a5b00", T.warningBg)}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12 }}>
                    <LoginStatusBadge person={r} style={{ fontSize: 12, fontWeight: 600 }} />
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {canManage && <button onClick={() => setEditRow(r)} style={{ ...btn, marginRight: 6 }}>Edit</button>}
                    {canManage && (
                      String(r.email || "").toLowerCase() === String(callerEmail || "").toLowerCase() ? (
                        <span title="Anda tidak bisa menghapus akun sendiri" style={{ ...btn, color: T.lo, cursor: "default", opacity: 0.6 }}>Hapus</span>
                      ) : (
                        <button onClick={() => requestRemove(r)} style={{ ...btn, color: T.error, border: `1px solid ${T.error}44` }}>Hapus</button>
                      )
                    )}
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {showAdd && <AddModal onClose={() => setShowAdd(false)} onSave={addAssignments} existing={visibleRows} scope={scope} />}
      {editRow && <EditModal row={editRow} onClose={() => setEditRow(null)} onSave={updateAssignment} existing={visibleRows} scope={scope} />}
      {confirmState && <ConfirmModal {...confirmState} onClose={() => setConfirmState(null)} />}
      {cardEditRow && (
        <CardEditModal row={cardEditRow} callerEmail={callerEmail}
          onClose={() => setCardEditRow(null)}
          onSaved={() => setCardEditRow(null)}
          onSave={(fields) => cardEditSave(cardEditRow, fields)}
          onDelete={() => { setCardEditRow(null); requestRemove(cardEditRow); }} />
      )}
    </div>
  );
}

// Tampilan pohon hierarki (§4.2/§4.5a): SPM Sumatera → Head TMV (per region)
// → Brand TMV (region × brand) → DMO → TL DSF/MD → DSF. Head↔Brand TMV
// dicocokkan lewat kesamaan `region` (bukan supervisor_assignment_id - lihat
// §4.5a); level di bawahnya lewat `supervisor_assignment_id`.
function HierarchyTree({ rows }) {
  const spm = rows.filter((r) => r.role === "spm_sumatera");
  const heads = rows.filter((r) => r.role === "head");
  const childrenOf = (id) => rows.filter((r) => r.supervisor_assignment_id === id);
  const tmvOfRegion = (region) => rows.filter((r) => r.role === "tmv" && r.region === region);

  const linkedIds = new Set();
  const NodeLine = ({ r, depth, roleColor }) => {
    linkedIds.add(r.id);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", paddingLeft: depth * 22 }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: roleColor || T.mid, flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: 12.5, color: T.hi }}>{r.full_name || r.email}</span>
        <span style={{ fontSize: 10.5, color: T.mid }}>{ROLE_LABEL[r.role] || r.role}</span>
        {r.brand && badge(r.brand === "tri" ? "3ID" : "IM3", r.brand === "tri" ? T.tri : T.im3, "#fff0f4")}
        {r.branch_name && <span style={{ fontSize: 11, color: T.lo }}>{r.branch_name}</span>}
        {r.mc && <span style={{ fontSize: 11, color: T.lo }}>· {r.mc}</span>}
        {r.dsf_org_id && <span style={{ fontSize: 11, color: T.lo }}>ID: {r.dsf_org_id}</span>}
        {!r.logged_in && badge("Menunggu login", "#8a5b00", T.warningBg)}
      </div>
    );
  };

  const renderBmeSubtree = (bme, depth) => (
    <div key={bme.id}>
      <NodeLine r={bme} depth={depth} roleColor={T.primary} />
      {childrenOf(bme.id).map((c) => (
        <div key={c.id}>
          <NodeLine r={c} depth={depth + 1} roleColor={c.role === "md" ? T.blue : T.tri} />
          {c.role === "tl_dsf" && childrenOf(c.id).map((dsf) => <NodeLine key={dsf.id} r={dsf} depth={depth + 2} roleColor={T.mid} />)}
        </div>
      ))}
    </div>
  );

  const renderTmvSubtree = (tmv, depth) => (
    <div key={tmv.id}>
      <NodeLine r={tmv} depth={depth} roleColor={T.im3} />
      {childrenOf(tmv.id).filter((r) => r.role === "bme_rge").map((bme) => renderBmeSubtree(bme, depth + 1))}
    </div>
  );

  return (
    <div style={{ fontFamily: FONT }}>
      {spm.map((s) => <NodeLine key={s.id} r={s} depth={0} roleColor={T.error} />)}
      {heads.map((h) => (
        <div key={h.id}>
          <NodeLine r={h} depth={spm.length ? 1 : 0} roleColor={T.primaryD} />
          {tmvOfRegion(h.region).map((tmv) => renderTmvSubtree(tmv, (spm.length ? 1 : 0) + 1))}
          {/* bme/rge yg atasannya LANGSUNG Head TMV ini (bukan lewat Brand
              TMV) - baru dimungkinkan sejak Head TMV bisa punya bawahan
              bme/rge sendiri lintas-brand di region-nya. */}
          {childrenOf(h.id).filter((r) => r.role === "bme_rge").map((bme) => renderBmeSubtree(bme, (spm.length ? 1 : 0) + 1))}
        </div>
      ))}
      {(() => {
        // Brand TMV yang region-nya tidak cocok dengan Head TMV manapun +
        // baris lain yang belum sempat ter-render di atas → tampilkan rata
        // kiri supaya tidak "hilang" dari tampilan, sambil menandai belum
        // terhubung penuh ke hierarki.
        const dangling = rows.filter((r) => !linkedIds.has(r.id) && r.role !== "spm_sumatera" && r.role !== "head");
        if (dangling.length === 0) return null;
        return (
          <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px dashed ${T.line}` }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.warning, textTransform: "uppercase", marginBottom: 4 }}>Belum terhubung penuh ke hierarki</div>
            {dangling.map((r) => <NodeLine key={r.id} r={r} depth={0} roleColor={T.warning} />)}
          </div>
        );
      })()}
      {rows.length === 0 && <div style={{ padding: 14, textAlign: "center", color: T.lo }}>Belum ada assignment.</div>}
    </div>
  );
}

/** Super User (SPM Sumatera) - akses penuh semua region & brand. Sumber
 * datanya TERPISAH dari mh_profiles/mh_assignments (tabel mh_super_admins),
 * sebelumnya cuma bisa diisi lewat migrasi manual satu-kali dari SandraHub
 * (mh_super_admins_from_sandrahub) - sekarang bisa ditambah/dihapus
 * langsung dari sini lewat RPC mh_list/add/remove_super_admin (otorisasi
 * SAMA POLA dgn mh_assign_user: hanya spm_sumatera/admin, minimal 1 akun
 * harus selalu ada, tidak bisa hapus akun sendiri - ditegakkan di RPC).
 * Versi desktop dari SuperAdminSection di app/martahub/m/user-management. */
function SuperAdminCard({ callerEmail }) {
  const [admins, setAdmins] = useState(null);
  const [err, setErr] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const { data, error } = await supabaseMarta.rpc("mh_list_super_admins");
      if (error) throw error;
      setAdmins(data || []);
    } catch (e) { setErr(e.message || "Gagal memuat Super User"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Presence realtime bersama - lihat catatan di Body/load() di atas.
  const presenceRows = useLivePresenceRows();
  if (admins) mergePresence(admins, presenceRows);

  async function handleAdd() {
    if (!emailInput.trim() || !nameInput.trim() || saving) return;
    setSaving(true); setErr("");
    try {
      const { error } = await supabaseMarta.rpc("mh_add_super_admin", {
        p_email: emailInput.trim(), p_full_name: nameInput.trim(), p_caller_email: callerEmail || null,
      });
      if (error) throw error;
      setEmailInput(""); setNameInput("");
      await load();
    } catch (e) { setErr(e.message || "Gagal menambah Super User"); }
    finally { setSaving(false); }
  }

  async function handleRemove(email) {
    setErr("");
    try {
      const { error } = await supabaseMarta.rpc("mh_remove_super_admin", { p_email: email, p_caller_email: callerEmail || null });
      if (error) throw error;
      setConfirmTarget(null);
      await load();
    } catch (e) { setErr(e.message || "Gagal menghapus Super User"); }
  }

  return (
    <div style={{ ...card, marginBottom: 18, padding: 0, overflow: "hidden", borderColor: "#F0D48A" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, background: "linear-gradient(90deg,#FFF8E8,#FFFFFF)", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(150deg,#D97706,#F59E0B)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 3px 8px rgba(217,119,6,0.3)" }}>
          <Crown size={15} color="#fff" />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Super User (SPM Sumatera) <span style={{ color: T.mid, fontWeight: 500 }}>· {admins ? admins.length : "…"}</span></div>
          <div style={{ fontSize: 11.5, color: T.mid }}>Akses penuh semua region & brand - minimal 1 akun harus selalu ada</div>
        </div>
      </div>
      <div style={{ padding: "12px 16px" }}>
        {err && <div style={{ ...card, borderColor: T.error, background: T.errorBg, color: T.error, marginBottom: 10, padding: 10 }}>{err}</div>}
        {(admins || []).map((a) => {
          const isSelf = !!(callerEmail && a.email && a.email.toLowerCase() === callerEmail.toLowerCase());
          return (
            <div key={a.email} style={{ display: "flex", alignItems: "center", gap: 10, background: "#FBFBFC", border: `1px solid ${T.line}`, borderRadius: 10, padding: "8px 12px", marginBottom: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
                  {a.full_name || "-"}
                  {isSelf && <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 999, color: T.success, background: T.successBg }}>Anda</span>}
                </div>
                <div style={{ fontSize: 11, color: T.mid }}>{a.email}</div>
                <LoginStatusBadge person={a} />
              </div>
              {isSelf ? (
                <div title="Anda tidak bisa menghapus akun sendiri" style={{ ...btn, color: T.lo, cursor: "default" }}><UserX size={13} /></div>
              ) : (
                <button onClick={() => setConfirmTarget(a)} style={{ ...btn, color: T.error, border: `1px solid ${T.error}44` }}><UserX size={13} /> Hapus</button>
              )}
            </div>
          );
        })}
        {admins && admins.length === 0 && <div style={{ fontSize: 12.5, color: T.lo, padding: "6px 0" }}>Belum ada Super User.</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <input value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="Email" style={{ ...inp, flex: "1 1 200px" }} />
          <input value={nameInput} onChange={(e) => setNameInput(e.target.value.toUpperCase())} placeholder="NAMA LENGKAP" style={{ ...inp, flex: "1 1 180px", textTransform: "uppercase" }} />
          <button onClick={handleAdd} disabled={saving || !emailInput.trim() || !nameInput.trim()} style={{ ...pbtn, opacity: saving || !emailInput.trim() || !nameInput.trim() ? 0.5 : 1 }}>
            {saving ? <Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> : <UserPlus size={14} />} Tambah
          </button>
        </div>
      </div>

      {confirmTarget && (
        <ConfirmModal title={`Hapus ${confirmTarget.full_name || confirmTarget.email}?`}
          message="Akun ini akan dihapus dari daftar Super User (SPM Sumatera) - akses login lewat SandraHub tidak dicabut, tapi hak akses penuh MartaHub-nya berakhir. Tidak bisa dilakukan kalau ini Super User terakhir."
          confirmLabel="Hapus" onConfirm={() => handleRemove(confirmTarget.email)} onClose={() => setConfirmTarget(null)} />
      )}
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel = "Hapus", danger = true, onConfirm, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: FONT }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 400, background: "#fff", borderRadius: 16, border: `1px solid ${T.line}`, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: danger ? T.errorBg : T.primaryBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <AlertTriangle size={18} color={danger ? T.error : T.primary} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.hi }}>{title}</div>
          </div>
          <div style={{ fontSize: 13.5, color: T.mid, lineHeight: 1.55 }}>{message}</div>
        </div>
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${T.line}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={btn}>Batal</button>
          <button onClick={() => { onConfirm(); onClose(); }} style={{ ...btn, background: danger ? T.error : T.primary, color: "#fff", border: `1px solid ${danger ? T.error : T.primary}` }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/** Edit email/nama satu baris assignment dari kartu - dipanggil dari
 * pensil di SlotRow. SENGAJA hanya mengganti email/full_name lewat
 * mh_update_assignment (baris `updateAssignment` yg sudah ada, dipanggil
 * lewat cardEditSave di Body) sambil mengirim balik role/region/brand/
 * branch_id/branch_name/supervisor/dsf_org_id/mc PERSIS spt semula - data
 * (cabang, role, riwayat) memang menempel ke BARIS assignment itu sendiri,
 * bukan ke akun emailnya, jadi ganti email di sini TIDAK PERNAH memindah,
 * menduplikasi, atau menghapus data - cuma relabel "siapa" yg pegang baris
 * yg sama. Tombol Hapus di dalam modal ini memakai jalur sama (requestRemove)
 * spt kartu, termasuk larangan hapus akun sendiri.
 */
function CardEditModal({ row, callerEmail, onClose, onSave, onSaved, onDelete }) {
  const [email, setEmail] = useState(row.email || "");
  const [fullName, setFullName] = useState(row.full_name || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const isSelf = !!(callerEmail && row.email && row.email.toLowerCase() === callerEmail.toLowerCase());

  async function submit() {
    if (!email.trim() || !fullName.trim()) { setErr("Email & nama wajib diisi."); return; }
    setSaving(true); setErr("");
    try {
      await onSave({ email: email.trim().toLowerCase(), fullName: fullName.trim() });
      onSaved();
    } catch (e) { setErr(e.message || "Gagal menyimpan"); setSaving(false); }
  }

  return (
    <div onClick={saving ? undefined : onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: FONT }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, background: "#fff", borderRadius: 16, border: `1px solid ${T.line}`, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ padding: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.hi, marginBottom: 4 }}>Edit Assignment</div>
          <div style={{ fontSize: 12, color: T.mid, marginBottom: 16 }}>
            {ROLE_LABEL[row.role] || row.role} · {REGION_LABEL[row.region] || row.region || "-"}{row.branch_name ? ` · ${row.branch_name}` : ""}{row.brand ? ` · ${row.brand === "tri" ? "3ID" : "IM3"}` : ""}
            <br />Ganti email/nama tidak akan memindah atau menghapus data - tetap baris/role/cabang yang sama.
          </div>
          <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} style={inp} disabled={saving} /></Field>
          <div style={{ marginTop: 12 }} />
          <Field label="Nama Lengkap"><input value={fullName} onChange={(e) => setFullName(e.target.value.toUpperCase())} style={{ ...inp, textTransform: "uppercase" }} disabled={saving} /></Field>
          {err && <div style={{ marginTop: 10, fontSize: 12, color: T.error }}>{err}</div>}
        </div>
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          {isSelf ? (
            <span title="Anda tidak bisa menghapus akun sendiri" style={{ ...btn, color: T.lo, cursor: "default", opacity: 0.6 }}>Hapus</span>
          ) : (
            <button onClick={onDelete} disabled={saving} style={{ ...btn, color: T.error, border: `1px solid ${T.error}44` }}>Hapus</button>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} disabled={saving} style={btn}>Batal</button>
            <button onClick={submit} disabled={saving} style={pbtn}>{saving ? "Menyimpan…" : "Simpan"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Log Aktivitas - audit trail: siapa melakukan apa, kapan, ke siapa/posisi
 * apa. Scoping-nya PERSIS ditegakkan di server (mh_list_audit_log): SPM
 * Sumatera/Admin lihat SEMUA aktivitas; Head/Brand TMV cuma lihat aktivitas
 * di region (+brand utk TMV) miliknya; DMO/TL DSF cuma lihat aktivitas
 * diri sendiri + tim langsung mereka - jadi caller di sini TIDAK PERNAH
 * melihat lebih dari yg diizinkan, apa pun filter di UI. */
function ActivityLogView({ callerEmail }) {
  const [logs, setLogs] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

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
    let list = logs || [];
    if (actionFilter !== "all") list = list.filter((l) => l.action === actionFilter);
    const t = q.trim().toLowerCase();
    if (t) {
      list = list.filter((l) =>
        (l.actor_full_name || "").toLowerCase().includes(t) || (l.actor_email || "").toLowerCase().includes(t) ||
        (l.target_full_name || "").toLowerCase().includes(t) || (l.target_email || "").toLowerCase().includes(t) ||
        (l.detail || "").toLowerCase().includes(t)
      );
    }
    return list;
  }, [logs, actionFilter, q]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={14} color={T.lo} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, email, atau detail…"
            style={{ ...inp, paddingLeft: 32 }} />
        </div>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={{ ...selectStyle, flex: "0 1 200px" }}>
          <option value="all">Semua aksi</option>
          {Object.entries(ACTION_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
        </select>
      </div>

      {err && <div style={{ padding: "10px 14px", borderRadius: 10, background: T.errorBg, color: T.error, fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>{err}</div>}

      {logs === null ? (
        <div style={{ padding: 26, textAlign: "center", color: T.lo }}>Memuat…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 26, textAlign: "center", color: T.lo }}>Belum ada aktivitas tercatat.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {filtered.map((l) => {
            const meta = ACTION_META[l.action] || { label: l.action, color: T.mid, bg: T.hover || "#F0F0F3" };
            const Icon = l.action === "login" ? LogIn : l.action === "logout" ? LogOut : l.action === "assign_delete" ? UserX : l.action === "name_change" ? Pencil : UserCog;
            const isSelfAction = ["login", "logout", "name_change"].includes(l.action);
            return (
              <div key={l.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 12, border: `1px solid ${T.line}`, background: "#fff" }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: meta.bg, color: meta.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={14} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.2, padding: "1px 7px", borderRadius: 999, color: meta.color, background: meta.bg }}>{meta.label}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: T.hi }}>{l.actor_full_name || l.actor_email}</span>
                    {!isSelfAction && l.target_email && (l.target_email !== l.actor_email) && (
                      <>
                        <span style={{ color: T.lo, fontSize: 11 }}>→</span>
                        <span style={{ fontSize: 12.5, color: T.mid, fontWeight: 600 }}>{l.target_full_name || l.target_email}</span>
                      </>
                    )}
                  </div>
                  {l.detail && <div style={{ marginTop: 3, fontSize: 12, color: T.mid }}>{l.detail}</div>}
                  <div style={{ marginTop: 3, fontSize: 10.5, color: T.lo, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span>{new Date(l.created_at).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    {l.region && <span>· {titleCaseRegion(l.region)}</span>}
                    {l.brand && <span>· {l.brand === "tri" ? "3ID" : "IM3"}</span>}
                    {l.branch_name && <span>· {l.branch_name}</span>}
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

const BRAND_LABEL = { im3: "IM3", tri: "3ID" };

function AddModal({ onClose, onSave, existing, scope }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("bme_rge");
  const [region, setRegion] = useState("NORTH SUMATERA");
  const [brand, setBrand] = useState("im3");         // untuk role TM & Visibility
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(new Set()); // "brand:branch_id"
  const [branchRows, setBranchRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [supervisorId, setSupervisorId] = useState("");
  const [dsfOrgId, setDsfOrgId] = useState("");
  // Bawahan bme/rge yg dipilih SEKALIGUS (multi) saat bikin tmv/head baru -
  // ditautkan (set supervisor_assignment_id) SETELAH assignment ini
  // tersimpan & dapat id (lihat addAssignments di Body).
  const [subSelected, setSubSelected] = useState(new Set());
  // Branch × Cluster/MC tunggal - khusus tl_dsf/dsf/md (beda dari bme/rge yg
  // pakai multi-select `selected` di atas, krn 1 org role ini = 1 branch).
  const [branchId, setBranchId] = useState("");
  const [branchName, setBranchName] = useState("");
  const [mc, setMc] = useState("");
  const [mcOptions, setMcOptions] = useState([]);
  // Mirror UserAssignment.isBranchRole (mobile assignments_provider.dart) -
  // 6 role POSMAT baru diperlakukan sama persis spt bme/rge.
  const isBranchRole = ["bme_rge", "dse", "gse", "ae", "promotor", "cse_rse", "bsm"].includes(role);
  const isTmv = role === "tmv";
  const isDsf = role === "dsf";
  // tl_dsf/md/dsf SEKARANG py region/brand/branch sendiri (opsional) - dipilih
  // di sini scope-constrained ke caller (lockedRegion/lockedBrand di bawah),
  // beda dgn kalau dibuat via "Kelola Tim" BME/TL DSF sendiri yg otomatis ikut.
  const isPureHierarchyRole = role === "tl_dsf" || role === "md" || role === "dsf";
  const needsSupervisor = isHierarchyRole(role);

  // Scope caller (Head TMV → region sendiri, Brand TMV → region+brand sendiri
  // persis) - SPM Sumatera/admin unscoped (null = bebas).
  const lockedRegion = scope && (scope.role === "head" || scope.role === "tmv") ? scope.region : null;
  const lockedBrand = scope && scope.role === "tmv" ? scope.brand : null;
  useEffect(() => {
    if (lockedRegion) setRegion(lockedRegion);
    if (lockedBrand) setBrand(lockedBrand);
  }, [lockedRegion, lockedBrand]);

  // Daftar Cluster/MC unik untuk branch+brand terpilih (mh_sites), khusus
  // tl_dsf/dsf/md - MIRROR pola mcListForBranchProvider mobile.
  useEffect(() => {
    let on = true;
    if (!branchId || !brand) { setMcOptions([]); return; }
    supabaseMarta.from("mh_sites").select("mc").eq("branch_id", branchId).eq("brand", brand).eq("active", true)
      .then(({ data }) => {
        if (!on) return;
        const set = new Set();
        for (const r of data || []) { const m = (r.mc || "").trim(); if (m) set.add(m); }
        setMcOptions([...set].sort());
      });
    return () => { on = false; };
  }, [branchId, brand]);

  const supervisorOptions = useMemo(() => {
    const wanted = SUPERVISOR_ROLES_FOR[role];
    if (!wanted) return [];
    let list = (existing || []).filter((r) => wanted.includes(r.role));
    // tl_dsf/md/dsf - atasan HARUS di region+brand yg sama dgn role ini
    // (branch role ini nanti otomatis ikut branch si atasan, bukan dipilih
    // manual lagi - lihat pickSupervisor).
    if (isPureHierarchyRole) list = list.filter((r) => r.region === region && r.brand === brand);
    return list.sort((a, b) => String(a.full_name || a.email).localeCompare(String(b.full_name || b.email)));
  }, [existing, role, isPureHierarchyRole, region, brand]);

  // Pilih atasan → branch WAJIB ikut branch si atasan (RGE/BME/TL DSF yg
  // dipilih), bukan dipilih terpisah lagi - "wajib dipilih, menyesuaikan ke
  // branch yang [atasan] pilih".
  const pickSupervisor = (id) => {
    setSupervisorId(id);
    const sup = supervisorOptions.find((s) => s.id === id);
    setBranchId(sup?.branch_id || "");
    setBranchName(sup?.branch_name || "");
    setMc("");
  };

  // Kandidat bme/rge yg BOLEH jadi bawahan tmv/head ini - "pastikan yang di
  // under dia": Head TMV (region-only) → semua bme/rge di REGION yg sama
  // (brand bebas). Brand TMV → bme/rge region SAMA & brand SAMA persis.
  const subCandidates = useMemo(() => {
    if (!isSupervisorCapableRole(role)) return [];
    return (existing || []).filter((r) => r.role === "bme_rge" && r.region === region && (role === "head" || r.brand === brand))
      .sort((a, b) => String(a.full_name || a.email).localeCompare(String(b.full_name || b.email)));
  }, [existing, role, region, brand]);
  const toggleSub = (id) => setSubSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Semua kombinasi branch × brand dari Master Data (mh_sites aktif).
  useEffect(() => {
    let on = true; setLoading(true);
    supabaseMarta.rpc("mh_branch_brand_list")
      .then(({ data }) => { if (on) setBranchRows(data || []); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, []);

  // Kelompokkan per branch → { branch_id, branch, region, brands:{im3,tri} }
  const branches = useMemo(() => {
    const m = new Map();
    for (const r of branchRows) {
      if (!r.branch_id || !r.brand) continue;
      if (!m.has(r.branch_id)) m.set(r.branch_id, { branch_id: r.branch_id, branch: r.branch || r.branch_id, region: r.region, brands: {} });
      m.get(r.branch_id).brands[r.brand] = true;
    }
    let arr = [...m.values()].sort((a, b) => String(a.branch).localeCompare(String(b.branch)));
    const t = q.trim().toLowerCase();
    if (t) arr = arr.filter((b) => String(b.branch).toLowerCase().includes(t));
    return arr;
  }, [branchRows, q]);

  // Kombinasi yang SUDAH aktif untuk email ini → dikunci (cegah duplikat).
  const emailKey = email.trim().toLowerCase();
  const assignedSet = useMemo(() => {
    const s = new Set();
    if (!emailKey) return s;
    for (const a of existing || []) {
      if (String(a.email || "").toLowerCase() !== emailKey) continue;
      if (a.branch_id && a.brand) s.add(`${a.brand}:${a.branch_id}`);
    }
    return s;
  }, [existing, emailKey]);

  const toggle = (key) => setSelected((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const canSave = name.trim() && emailKey
    && (isBranchRole ? selected.size > 0 : true)
    && (needsSupervisor ? !!supervisorId : true)
    && (isPureHierarchyRole ? !!branchId : true)
    && (isDsf ? dsfOrgId.trim() : true);

  const save = () => {
    if (!canSave) return;
    if (isPureHierarchyRole) {
      // tl_dsf / md / dsf - region/brand scope-constrained ke caller, branch
      // & cluster/MC opsional, atasan wajib.
      onSave([{
        email: emailKey, fullName: name.trim().toUpperCase(), role,
        region: region || null, brand: brand || null,
        branchId: branchId || null, branchName: branchName || null, mc: mc || null,
        supervisorAssignmentId: supervisorId, dsfOrgId: isDsf ? dsfOrgId.trim() : null,
      }]);
    } else if (isBranchRole) {
      const items = [];
      for (const key of selected) {
        if (assignedSet.has(key)) continue;
        const [b, branch_id] = key.split(":");
        const br = branches.find((x) => x.branch_id === branch_id);
        items.push({
          email: emailKey, fullName: name.trim().toUpperCase(), role, region, brand: b,
          branchId: branch_id, branchName: br?.branch || "",
          supervisorAssignmentId: needsSupervisor ? supervisorId : null, dsfOrgId: null,
        });
      }
      if (items.length) onSave(items);
    } else {
      onSave([{
        email: emailKey, fullName: name.trim().toUpperCase(), role, region: role === "spm_sumatera" ? null : region,
        brand: isTmv ? brand : null, branchId: null, branchName: null,
        supervisorAssignmentId: null, dsfOrgId: null,
      }], isSupervisorCapableRole(role) ? [...subSelected] : undefined);
    }
  };

  const Chip = ({ branchId, br }) => {
    const key = `${br}:${branchId}`;
    const isAssigned = assignedSet.has(key);
    const isSel = selected.has(key);
    const base = { padding: "4px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 800, cursor: isAssigned ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontFamily: FONT };
    const style = isAssigned
      ? { ...base, background: T.successBg, color: T.success, border: `1px solid ${T.success}55`, cursor: "not-allowed" }
      : isSel
        ? { ...base, background: GRAD, color: "#fff", border: "1px solid transparent" }
        : { ...base, background: "#fff", color: T.mid, border: `1px solid ${T.line}` };
    return (
      <button type="button" disabled={isAssigned} onClick={() => toggle(key)} style={style} title={isAssigned ? "Sudah ter-assign untuk email ini" : ""}>
        {isAssigned && <Check size={11} />}
        {isSel && <Check size={11} />}
        {BRAND_LABEL[br] || br}
      </button>
    );
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: FONT }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, maxHeight: "90vh", background: "#fff", borderRadius: 16, border: `1px solid ${T.line}`, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.line}`, fontWeight: 800 }}>Tambah Assignment</div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}><Field label="Nama *"><input value={name} onChange={(e) => setName(e.target.value.toUpperCase())} placeholder="NAMA LENGKAP" style={{ ...inp, textTransform: "uppercase" }} /></Field></div>
            <div style={{ flex: 1 }}><Field label="Email *"><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@ioh.co.id" style={inp} /></Field></div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Field label="Role">
                <select value={role} onChange={(e) => { setRole(e.target.value); setSelected(new Set()); setSupervisorId(""); setDsfOrgId(""); setBranchId(""); setBranchName(""); setMc(""); setSubSelected(new Set()); }} style={selectStyle}>
                  {SELECTABLE_ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
            </div>
            {role !== "spm_sumatera" && (
              <div style={{ flex: 1 }}>
                <Field label="Region">
                  {lockedRegion ? (
                    <div style={{ ...inp, background: T.sub || "#F7F9FC", color: T.mid, cursor: "not-allowed", display: "flex", alignItems: "center", gap: 6 }}>
                      {REGION_LABEL[region] || region} <Lock size={12} />
                    </div>
                  ) : (
                    <select value={region} onChange={(e) => setRegion(e.target.value)} style={selectStyle}>{REGIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  )}
                </Field>
              </div>
            )}
          </div>
          {(isTmv || isPureHierarchyRole) && (
            <Field label="Brand">
              {lockedBrand ? (
                <div style={{ ...inp, background: T.sub || "#F7F9FC", color: T.mid, cursor: "not-allowed", display: "flex", alignItems: "center", gap: 6 }}>
                  {BRAND_LABEL[brand] || brand} <Lock size={12} />
                </div>
              ) : (
                <select value={brand} onChange={(e) => { setBrand(e.target.value); if (isPureHierarchyRole) { setBranchId(""); setBranchName(""); setMc(""); } }} style={selectStyle}>{BRANDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              )}
            </Field>
          )}

          {needsSupervisor && (
            <Field label={`Atasan Langsung ${SUPERVISOR_ROLES_FOR[role].map((r) => ROLE_LABEL[r]).join(" / ")} *`}>
              <select value={supervisorId} onChange={(e) => pickSupervisor(e.target.value)} style={selectStyle}>
                <option value="">- pilih atasan -</option>
                {supervisorOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name || s.email} ({ROLE_LABEL[s.role] || s.role}{s.branch_name ? ` · ${s.branch_name}` : ""})</option>
                ))}
              </select>
              {supervisorOptions.length === 0 && (
                <div style={{ fontSize: 11, color: T.warning, marginTop: 4 }}>Belum ada assignment {SUPERVISOR_ROLES_FOR[role].map((r) => ROLE_LABEL[r]).join("/")} yang cocok region/brand-nya - buat itu dulu.</div>
              )}
            </Field>
          )}

          {/* Branch WAJIB tapi tidak dipilih manual lagi - otomatis
              menyesuaikan branch milik atasan yg dipilih di atas. */}
          {isPureHierarchyRole && (
            <>
              <Field label="Branch * (ikut atasan)">
                {branchId ? (
                  <div style={{ ...inp, background: T.sub || "#F7F9FC", color: T.mid, cursor: "not-allowed", display: "flex", alignItems: "center", gap: 6 }}>
                    {branchName || branchId} <Lock size={12} />
                  </div>
                ) : (
                  <div style={{ fontSize: 11.5, color: T.warning }}>Pilih atasan dulu - branch otomatis mengikuti.</div>
                )}
              </Field>
              {branchId && mcOptions.length > 0 && (
                <Field label={`${mcLabelForBrand(brand)} (opsional)`}>
                  <select value={mc} onChange={(e) => setMc(e.target.value)} style={selectStyle}>
                    <option value="">- pilih {mcLabelForBrand(brand)} -</option>
                    {mcOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
              )}
            </>
          )}
          {isSupervisorCapableRole(role) && (
            <SubordinatePicker candidates={subCandidates} selected={subSelected} onToggle={toggleSub} region={region} brandLabel={role === "tmv" ? (BRAND_LABEL[brand] || brand) : null} />
          )}
          {isDsf && (
            <Field label="ID DSF * (dipakai sebagai org_id di Validity MSISDN)">
              <input value={dsfOrgId} onChange={(e) => setDsfOrgId(e.target.value)} placeholder="mis. DSF-00123" style={inp} />
            </Field>
          )}

          {isBranchRole && (
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: T.mid, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Pilih Branch × Brand</div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari branch…" style={{ ...inp, marginBottom: 8 }} />
              <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, maxHeight: 300, overflowY: "auto" }}>
                {loading && <div style={{ padding: 14, fontSize: 12.5, color: T.lo }}>Memuat branch…</div>}
                {!loading && branches.length === 0 && (
                  <div style={{ padding: 14, fontSize: 12, color: "#7a5b00" }}>Belum ada data branch. Import List Site dulu di menu <b>Master Data</b>.</div>
                )}
                {!loading && branches.map((b, i) => (
                  <div key={b.branch_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderTop: i ? `1px solid ${T.line}` : "none" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.branch}</div>
                      {b.region && <div style={{ fontSize: 11, color: T.lo }}>{REGION_LABEL[b.region] || b.region}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {b.brands.im3 && <Chip branchId={b.branch_id} br="im3" />}
                      {b.brands.tri && <Chip branchId={b.branch_id} br="tri" />}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: T.lo, marginTop: 6 }}>
                <span style={{ color: T.success, fontWeight: 700 }}>✓ Hijau</span> = sudah ter-assign untuk email ini (tak bisa dipilih lagi). Satu email boleh memegang beberapa branch/brand.
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "12px 18px", borderTop: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 12, color: T.mid, fontWeight: 700 }}>{isBranchRole && selected.size > 0 ? `${selected.size} dipilih` : ""}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={btn}>Batal</button>
            <button onClick={save} disabled={!canSave} style={{ ...pbtn, opacity: canSave ? 1 : 0.5, cursor: canSave ? "pointer" : "not-allowed" }}>
              Simpan{isBranchRole && selected.size > 0 ? ` (${selected.size})` : ""} <Check size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Edit satu assignment. Terjemahkan error mentah dari Postgres jadi pesan
// yg dimengerti user - KHUSUS pelanggaran unique per-slot di mh_profile_slots
// ("mh_profile_slots_dup_uidx": email+role+brand+branch yg PERSIS SAMA sudah
// ada & masih aktif). Satu email SEKARANG boleh punya banyak assignment
// (branch/brand berbeda) - ini cuma menolak kombinasi yg benar2 kembar.
// Fallback ke pesan aslinya kalau bukan kasus ini.
function friendlyAssignError(message) {
  const m = String(message || "");
  if (m.includes("mh_profile_slots_dup_uidx") || /duplicate key value violates unique constraint/i.test(m)) {
    return "Assignment ini (role + brand + branch yang sama persis) sudah ada untuk email ini. Cari & edit assignment yang sudah ada, atau ubah salah satu dari role/brand/branch-nya.";
  }
  return m;
}

function EditModal({ row, onClose, onSave, existing, scope }) {
  const [name, setName] = useState(row.full_name || "");
  const [email, setEmail] = useState(row.email || "");
  const [role, setRole] = useState(row.role || "bme_rge");
  const [region, setRegion] = useState(row.region || "NORTH SUMATERA");
  const [brand, setBrand] = useState(row.brand || "im3");
  const [branchId, setBranchId] = useState(row.branch_id || "");
  const [branchName, setBranchName] = useState(row.branch_name || "");
  const [mc, setMc] = useState(row.mc || "");
  const [mcOptions, setMcOptions] = useState([]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [supervisorId, setSupervisorId] = useState(row.supervisor_assignment_id || "");
  const [dsfOrgId, setDsfOrgId] = useState(row.dsf_org_id || "");
  // Bawahan bme/rge yg SUDAH tertaut ke assignment ini (supervisor_assignment_id
  // === row.id) - jadi centang awal picker, bukan mulai kosong.
  const [subSelected, setSubSelected] = useState(() => new Set(
    (existing || []).filter((r) => r.role === "bme_rge" && r.supervisor_assignment_id === row.id).map((r) => r.id)
  ));
  // Mirror UserAssignment.isBranchRole (mobile assignments_provider.dart) -
  // 6 role POSMAT baru diperlakukan sama persis spt bme/rge.
  const isBranchRole = ["bme_rge", "dse", "gse", "ae", "promotor", "cse_rse", "bsm"].includes(role);
  const isTmv = role === "tmv";
  const isDsf = role === "dsf";
  // tl_dsf/md/dsf SEKARANG py region/brand/branch sendiri (opsional) - lihat
  // catatan sama di AddModal.
  const isPureHierarchyRole = role === "tl_dsf" || role === "md" || role === "dsf";
  const hasBranchField = isBranchRole || isPureHierarchyRole;
  const needsSupervisor = isHierarchyRole(role);
  const supervisorOptions = useMemo(() => {
    const wanted = SUPERVISOR_ROLES_FOR[role];
    if (!wanted) return [];
    let list = (existing || []).filter((r) => wanted.includes(r.role) && r.id !== row.id);
    // tl_dsf/md/dsf - atasan HARUS di region+brand yg sama; branch role ini
    // otomatis ikut branch si atasan (lihat pickSupervisor).
    if (isPureHierarchyRole) list = list.filter((r) => r.region === region && r.brand === brand);
    return list.sort((a, b) => String(a.full_name || a.email).localeCompare(String(b.full_name || b.email)));
  }, [existing, role, row.id, isPureHierarchyRole, region, brand]);

  // Pilih atasan → branch role ini WAJIB ikut branch si atasan, bukan
  // dipilih manual lagi - sama persis AddModal.
  const pickSupervisor = (id) => {
    setSupervisorId(id);
    if (!isPureHierarchyRole) return;
    const sup = supervisorOptions.find((s) => s.id === id);
    setBranchId(sup?.branch_id || "");
    setBranchName(sup?.branch_name || "");
    setMc("");
  };

  // Kandidat bme/rge yg boleh jadi bawahan - sama aturannya dgn AddModal:
  // Head TMV → region sama (brand bebas), Brand TMV → region+brand sama persis.
  const subCandidates = useMemo(() => {
    if (!isSupervisorCapableRole(role)) return [];
    return (existing || []).filter((r) => r.role === "bme_rge" && r.id !== row.id && r.region === region && (role === "head" || r.brand === brand))
      .sort((a, b) => String(a.full_name || a.email).localeCompare(String(b.full_name || b.email)));
  }, [existing, role, region, brand, row.id]);
  const toggleSub = (id) => setSubSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Scope caller (Head/Brand TMV) - sama persis AddModal.
  const lockedRegion = scope && (scope.role === "head" || scope.role === "tmv") ? scope.region : null;
  const lockedBrand = scope && scope.role === "tmv" ? scope.brand : null;

  useEffect(() => {
    let on = true; setLoading(true);
    supabaseMarta.rpc("mh_branch_brand_list")
      .then(({ data }) => { if (on) setData(data || []); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, []);

  // Branch unik yang punya brand terpilih.
  const branches = useMemo(() => {
    const seen = new Set(); const arr = [];
    for (const r of data) {
      if (r.brand !== brand || !r.branch_id || seen.has(r.branch_id)) continue;
      seen.add(r.branch_id); arr.push(r);
    }
    arr.sort((a, b) => String(a.branch).localeCompare(String(b.branch)));
    return arr;
  }, [data, brand]);

  // Daftar Cluster/MC unik untuk branch+brand terpilih - sama persis AddModal.
  useEffect(() => {
    let on = true;
    if (!branchId || !brand) { setMcOptions([]); return; }
    supabaseMarta.from("mh_sites").select("mc").eq("branch_id", branchId).eq("brand", brand).eq("active", true)
      .then(({ data }) => {
        if (!on) return;
        const set = new Set();
        for (const r of data || []) { const m = (r.mc || "").trim(); if (m) set.add(m); }
        setMcOptions([...set].sort());
      });
    return () => { on = false; };
  }, [branchId, brand]);

  const pickBranch = (id) => {
    const b = branches.find((x) => x.branch_id === id);
    setBranchId(id); setBranchName(b?.branch || ""); setMc("");
    if (b?.region && !lockedRegion) setRegion(b.region);
  };

  // Ganti email diperbolehkan (§ handover/rotasi user) - data histori
  // (aktivitas, submission, dsb) TERIKAT ke assignment_id/branch, BUKAN
  // email, jadi begitu email diganti di sini, user baru langsung mewarisi
  // seluruh akses & data lama tanpa kehilangan apa pun.
  const emailKey = email.trim().toLowerCase();
  const emailChanged = emailKey !== String(row.email || "").trim().toLowerCase();
  // Cegah duplikat: SEKARANG satu email BOLEH punya banyak assignment
  // (branch/brand berbeda) - mh_profiles.email UNIQUE sudah dihapus, diganti
  // constraint per-slot (email+role+brand+branch YANG PERSIS SAMA saja yg
  // tidak boleh dobel, lihat mh_profile_slots_dup_uidx). Jadi precheck ini
  // sekarang ikut bandingkan role+brand+branch, bukan cuma email polos -
  // kasus di luar `existing` (visibleRows) tetap ditangkap & diterjemahkan
  // lewat friendlyAssignError() saat RPC-nya gagal.
  const emailTaken = useMemo(() => {
    if (!emailKey) return false;
    return (existing || []).some((r) => r.id !== row.id
      && String(r.email || "").toLowerCase() === emailKey
      && (r.role || "") === role
      && String(r.brand || "").toLowerCase() === String(brand || "").toLowerCase()
      && String(r.branch_id || "") === String(branchId || ""));
  }, [existing, row.id, emailKey, role, brand, branchId]);

  const canSave = name.trim() && emailKey && !emailTaken && (!isBranchRole || branchId)
    && (needsSupervisor ? !!supervisorId : true)
    && (isPureHierarchyRole ? !!branchId : true)
    && (isDsf ? dsfOrgId.trim() : true);
  const save = () => {
    if (!canSave) return;
    let subChanges;
    if (isSupervisorCapableRole(role)) {
      const prevLinked = new Set((existing || []).filter((r) => r.role === "bme_rge" && r.supervisor_assignment_id === row.id).map((r) => r.id));
      subChanges = {
        added: [...subSelected].filter((id) => !prevLinked.has(id)),
        removed: [...prevLinked].filter((id) => !subSelected.has(id)),
      };
    }
    onSave(row.id, {
      email: emailKey,
      role, region: role === "spm_sumatera" ? null : region,
      fullName: name.trim().toUpperCase(),
      brand: (isTmv || hasBranchField) ? brand : null,
      branchId: hasBranchField ? (branchId || null) : null,
      branchName: hasBranchField ? (branchName || null) : null,
      mc: mc || null,
      supervisorAssignmentId: needsSupervisor ? supervisorId : null,
      dsfOrgId: isDsf ? dsfOrgId.trim() : null,
    }, subChanges);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: FONT }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, background: "#fff", borderRadius: 16, border: `1px solid ${T.line}`, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.line}`, fontWeight: 800 }}>Edit Assignment</div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Nama *"><input value={name} onChange={(e) => setName(e.target.value.toUpperCase())} placeholder="NAMA LENGKAP" style={{ ...inp, textTransform: "uppercase" }} /></Field>
          <Field label="Email * (bisa diganti saat handover)">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@ioh.co.id" style={{ ...inp, ...(emailTaken ? { borderColor: T.error } : {}) }} />
            {emailChanged && !emailTaken && (
              <div style={{ fontSize: 11, color: T.mid, marginTop: 4 }}>
                Slot role/branch ini akan berpindah ke <b>{emailKey}</b>. Data & histori lama tetap terikat ke assignment ini (bukan ke email), jadi tetap dapat diakses penuh oleh user baru.
              </div>
            )}
            {emailTaken && (
              <div style={{ fontSize: 11, color: T.error, marginTop: 4 }}>Email ini sudah punya assignment identik (role/branch/brand sama) - pakai email lain.</div>
            )}
          </Field>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}><Field label="Role"><select value={role} onChange={(e) => { setRole(e.target.value); }} style={selectStyle}>{SELECTABLE_ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field></div>
            {role !== "spm_sumatera" && (
              <div style={{ flex: 1 }}>
                <Field label="Region">
                  {lockedRegion ? (
                    <div style={{ ...inp, background: T.sub || "#F7F9FC", color: T.mid, cursor: "not-allowed", display: "flex", alignItems: "center", gap: 6 }}>
                      {REGION_LABEL[region] || region} <Lock size={12} />
                    </div>
                  ) : (
                    <select value={region} onChange={(e) => setRegion(e.target.value)} style={selectStyle}>{REGIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  )}
                </Field>
              </div>
            )}
          </div>
          {(isTmv || hasBranchField) && (
            <Field label="Brand">
              {lockedBrand ? (
                <div style={{ ...inp, background: T.sub || "#F7F9FC", color: T.mid, cursor: "not-allowed", display: "flex", alignItems: "center", gap: 6 }}>
                  {BRAND_LABEL[brand] || brand} <Lock size={12} />
                </div>
              ) : (
                <select value={brand} onChange={(e) => { setBrand(e.target.value); if (hasBranchField) { setBranchId(""); setBranchName(""); setMc(""); } }} style={selectStyle}>{BRANDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              )}
            </Field>
          )}
          {/* bme/rge/dst (isBranchRole, TANPA konsep atasan) - branch tetap
              dipilih manual spt sebelumnya. */}
          {isBranchRole && (
            <Field label="Branch">
              <select value={branchId} onChange={(e) => pickBranch(e.target.value)} style={selectStyle} disabled={loading}>
                <option value="">{loading ? "Memuat branch…" : "- pilih branch -"}</option>
                {branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch}</option>)}
              </select>
            </Field>
          )}

          {/* tl_dsf/md/dsf - pilih atasan DULU, branch WAJIB tapi otomatis
              ikut branch si atasan (bukan dipilih manual lagi). */}
          {needsSupervisor && (
            <Field label={`Atasan Langsung ${SUPERVISOR_ROLES_FOR[role].map((r) => ROLE_LABEL[r]).join(" / ")} *`}>
              <select value={supervisorId} onChange={(e) => pickSupervisor(e.target.value)} style={selectStyle}>
                <option value="">- pilih atasan -</option>
                {supervisorOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name || s.email} ({ROLE_LABEL[s.role] || s.role}{s.branch_name ? ` · ${s.branch_name}` : ""})</option>
                ))}
              </select>
              {supervisorOptions.length === 0 && (
                <div style={{ fontSize: 11, color: T.warning, marginTop: 4 }}>Belum ada assignment {SUPERVISOR_ROLES_FOR[role].map((r) => ROLE_LABEL[r]).join("/")} yang cocok region/brand-nya - buat itu dulu.</div>
              )}
            </Field>
          )}
          {isPureHierarchyRole && (
            <Field label="Branch * (ikut atasan)">
              {branchId ? (
                <div style={{ ...inp, background: T.sub || "#F7F9FC", color: T.mid, cursor: "not-allowed", display: "flex", alignItems: "center", gap: 6 }}>
                  {branchName || branchId} <Lock size={12} />
                </div>
              ) : (
                <div style={{ fontSize: 11.5, color: T.warning }}>Pilih atasan dulu - branch otomatis mengikuti.</div>
              )}
            </Field>
          )}
          {hasBranchField && branchId && mcOptions.length > 0 && (
            <Field label={`${mcLabelForBrand(brand)} (opsional)`}>
              <select value={mc} onChange={(e) => setMc(e.target.value)} style={selectStyle}>
                <option value="">- pilih {mcLabelForBrand(brand)} -</option>
                {mcOptions.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          )}
          {isSupervisorCapableRole(role) && (
            <SubordinatePicker candidates={subCandidates} selected={subSelected} onToggle={toggleSub} region={region} brandLabel={role === "tmv" ? (BRAND_LABEL[brand] || brand) : null} />
          )}
          {isDsf && (
            <Field label="ID DSF * (dipakai sebagai org_id di Validity MSISDN)">
              <input value={dsfOrgId} onChange={(e) => setDsfOrgId(e.target.value)} placeholder="mis. DSF-00123" style={inp} />
            </Field>
          )}
        </div>
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${T.line}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={btn}>Batal</button>
          <button onClick={save} disabled={!canSave} style={{ ...pbtn, opacity: canSave ? 1 : 0.5, cursor: canSave ? "pointer" : "not-allowed" }}>Simpan <Check size={15} /></button>
        </div>
      </div>
    </div>
  );
}

/** Multi-select bme/rge utk jadi bawahan langsung role tmv/head - dipakai
 * bareng di AddModal & EditModal. Kandidat sudah difilter caller sesuai
 * scope (Head TMV: region sama; Brand TMV: region+brand sama persis). */
function SubordinatePicker({ candidates, selected, onToggle, region, brandLabel }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: T.mid, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
        DMO di Bawah Ini · {REGION_LABEL[region] || region}{brandLabel ? ` · ${brandLabel}` : " · semua brand"}
      </div>
      <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, maxHeight: 240, overflowY: "auto" }}>
        {candidates.length === 0 && (
          <div style={{ padding: 14, fontSize: 12, color: T.lo }}>Belum ada DMO di region{brandLabel ? " & brand" : ""} ini.</div>
        )}
        {candidates.map((c, i) => {
          const isSel = selected.has(c.id);
          return (
            <button key={c.id} type="button" onClick={() => onToggle(c.id)}
              style={{
                width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                borderTop: i ? `1px solid ${T.line}` : "none", borderLeft: "none", borderRight: "none", borderBottom: "none",
                background: isSel ? (T.hover || "#F6F3FE") : "#fff", cursor: "pointer", fontFamily: FONT,
              }}>
              <div style={{
                flexShrink: 0, width: 18, height: 18, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center",
                background: isSel ? GRAD : "#fff", border: isSel ? "1px solid transparent" : `1.5px solid ${T.line}`,
              }}>
                {isSel && <Check size={12} color="#fff" />}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: T.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.full_name || c.email}</div>
                <div style={{ fontSize: 11, color: T.lo }}>{ROLE_LABEL[c.role] || c.role}{c.branch_name ? ` · ${c.branch_name}` : ""} · {BRAND_LABEL[c.brand] || c.brand}</div>
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: T.lo, marginTop: 6 }}>{selected.size} dipilih</div>
    </div>
  );
}

function Field({ label, children }) {
  return <label style={{ display: "block" }}><div style={{ fontSize: 11.5, fontWeight: 700, color: T.mid, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>{children}</label>;
}

const card = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, fontSize: 13 };
const btn = { padding: "8px 13px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap", lineHeight: 1 };
const GRAD = "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)";
const pbtn = { ...btn, background: GRAD, color: "#fff", border: "none", padding: "9px 16px" };
const inp = { width: "100%", padding: "9px 11px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" };
const CHEV = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>";
const selectStyle = { ...inp, appearance: "none", WebkitAppearance: "none", MozAppearance: "none", cursor: "pointer", backgroundImage: `url("${CHEV}")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 11px center", backgroundSize: "13px", paddingRight: 32 };

// ═══════════════════════ Tampilan Kartu (org-hierarchy, spt mobile) ═══════
// Circle Sumatera → 3 Region → cabang×brand, DMO digabung jadi satu
// daftar (bukan role yg beda, cuma brand/cabang yg membedakan), MD & DSF
// ditampilkan bertingkat langsung di bawahnya - SATU SUMBER visual dgn
// app/martahub/m/user-management/page.jsx (mobile), cuma disusun ulang jadi
// grid responsif (auto-fit) utk layar lebar alih-alih ditumpuk vertikal.
function CardsView({ orgTree, canManage, callerEmail, session, onAdd, onAddBoth, onRemove, onEdit, loading }) {
  // Pilih SATU region dulu sebelum kartunya ditampilkan - menampilkan
  // ketiga region sekaligus (spt semula) bikin halaman terlalu penuh/
  // berantakan krn tiap region sudah berisi banyak cabang×brand. null =
  // belum pilih apa pun -> tampilkan pilihan region saja dulu.
  const [activeRegion, setActiveRegion] = useState(null);
  if (loading || !orgTree) return <div style={{ padding: 26, textAlign: "center", color: T.lo }}>Memuat…</div>;
  const selected = activeRegion ? orgTree.regions.find((r) => r.key === activeRegion) : null;
  return (
    <div style={{ padding: 16 }}>
      <CircleCard circle={orgTree.circle} canManage={canManage} callerEmail={callerEmail} session={session} onAdd={onAdd} onRemove={onRemove} onEdit={onEdit} />

      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: T.mid, textTransform: "uppercase", letterSpacing: "0.04em", marginRight: 2 }}>Region</span>
        {orgTree.regions.map((region) => (
          <button key={region.key} onClick={() => setActiveRegion(region.key)}
            style={{
              padding: "7px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 800, fontFamily: FONT, cursor: "pointer",
              border: `1.5px solid ${activeRegion === region.key ? T.primary : T.line}`,
              background: activeRegion === region.key ? T.primaryBg : "#fff",
              color: activeRegion === region.key ? T.primary : T.mid,
            }}>
            {titleCaseRegion(region.label)}
          </button>
        ))}
      </div>

      {selected ? (
        <div style={{ marginTop: 14 }}>
          <RegionCard region={selected} canManage={canManage} callerEmail={callerEmail} onAdd={onAdd} onAddBoth={onAddBoth} onRemove={onRemove} onEdit={onEdit} />
        </div>
      ) : (
        <div style={{ marginTop: 14, padding: "34px 20px", textAlign: "center", color: T.lo, background: "#fff", border: `1px dashed ${T.line}`, borderRadius: 16, fontSize: 13 }}>
          Pilih salah satu region di atas untuk melihat & mengelola Head TMV, Brand TMV, dan cabangnya.
        </div>
      )}
    </div>
  );
}

function CircleCard({ circle, canManage, callerEmail, session, onAdd, onRemove, onEdit }) {
  return (
    <div style={{ background: "#FFFFFF", border: "1.5px solid #E7D9F7", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 14px rgba(124,58,237,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: "linear-gradient(135deg,#F5F0FE,#FBF8FF)" }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: "linear-gradient(150deg,#7C3AED,#A78BFA)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 3px 8px rgba(124,58,237,0.3)" }}>
          <Crown size={18} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: T.hi }}>Circle Sumatera</div>
          <div style={{ marginTop: 1, fontSize: 11.5, color: T.mid, fontWeight: 600 }}>Slot Head TMV & Brand TMV se-Sumatera</div>
        </div>
      </div>
      <div style={{ padding: "12px 18px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "4px 22px" }}>
        <SlotRow title="Head Trade Marketing & Visibility Sumatera" role="head" people={circle.head} canAdd={canManage}
          context={{ region: null, brand: null, branchSlug: null, branchName: null }} onAdd={onAdd} onRemove={onRemove} onEdit={onEdit} callerEmail={callerEmail} />
        <SlotRow title="Trade Marketing & Visibility Sumatera" role="tmv" people={circle.tmv} canAdd={canManage}
          context={{ region: null, brand: null, branchSlug: null, branchName: null }} onAdd={onAdd} onRemove={onRemove} onEdit={onEdit} callerEmail={callerEmail} />
        {/* Marketing Sumatera (Program) - SATU konsep visual dgn 2 slot di
            atas (judul uppercase + daftar orang + QuickAddRow email/nama),
            TAPI backend-nya BEDA TOTAL: bukan mh_profiles/mh_assignments
            (role=head/tmv di atas), melainkan tabel "profiles" project
            TraceHub (akun LOGIN CMS DESKTOP, role marketing_sumatera_program
            - lihat lib/martaAccess.js) lewat /api/marta/program-account.
            Makanya dikasih komponen sendiri (ProgramAccountSlotRow), bukan
            reuse onAdd/onRemove generik SlotRow yg terikat mh_assignments. */}
        <ProgramAccountSlotRow session={session} canManage={canManage} callerEmail={callerEmail} />
      </div>
    </div>
  );
}

// Lihat komentar di pemanggilnya (CircleCard) soal kenapa slot ini TIDAK
// memakai onAdd/onRemove generik SlotRow - akun di sini akun LOGIN CMS
// DESKTOP (tabel "profiles" project TraceHub), bukan mh_assignments. Login
// akun ini PASSWORDLESS (kode OTP email di /marta/login, lihat
// MARTA_OTP_LOGIN_ROLES) jadi tidak ada presence/last_login_at yg
// bisa ditampilkan LoginStatusBadge - sengaja dilewati drpd menampilkan
// "Belum pernah login" yg menyesatkan utk akun yg sebenarnya aktif.
function ProgramAccountSlotRow({ session, canManage, callerEmail }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Tanpa service-role key sama sekali - admin (spm_sumatera) BOLEH baca
  // SEMUA baris "profiles" langsung (lihat policy RLS "profiles_select_admin"),
  // jadi query biasa pakai sesi login admin yg sedang aktif.
  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      // RPC (SECURITY DEFINER, verifikasi via auth.uid() LANGSUNG ke tabel
      // profiles) - bukan select+RLS biasa, krn RLS "profiles_select_admin"
      // bergantung klaim JWT custom (auth.jwt()->>'role') yg BISA kosong
      // kalau Auth Hook-nya belum ter-wire di project atau token admin
      // belum refresh sejak role di-set - akibatnya select diam2 kosong
      // tanpa error. Lihat migrasi marta_program_account_rpcs_v2.
      const { data, error } = await supabase.rpc("marta_admin_list_program_accounts");
      if (error) throw error;
      setAccounts(data || []);
    } catch (e) {
      setErr(e.message || "Gagal memuat akun.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Buat akun baru TANPA service-role key - 2 langkah:
  // 1) auth.users dibuat lewat signUp() client-side biasa (anon key), via
  //    client SEMENTARA/terisolasi (persistSession:false) supaya TIDAK
  //    menimpa sesi admin yang sedang login di tab ini. Password acak
  //    sekali-pakai (tidak pernah dipakai - login akun ini selalu lewat kode
  //    OTP, lihat /marta/login).
  // 2) baris "profiles"-nya (role=marketing_sumatera_program) diisi lewat
  //    RPC marta_admin_create_program_profile (SECURITY DEFINER, verifikasi
  //    caller sendiri hrs spm_sumatera) - RLS "profiles" cuma izinkan INSERT
  //    utk baris milik sendiri, jadi admin tidak bisa insert langsung utk
  //    user lain tanpa RPC ini.
  const handleAdd = async ({ targetEmail, fullName }) => {
    const email = targetEmail.trim().toLowerCase();

    // Cek dulu apakah email ini SUDAH punya akun "profiles" (login CMS)
    // dgn role APAPUN - admin boleh baca semua baris (lihat komentar load()
    // di atas), jadi bisa kasih pesan spesifik ("sudah terdaftar sbg role
    // X") drpd pesan generik "Email sudah terdaftar" yg tidak menjelaskan
    // kenapa/sbg apa - itu yg bikin user bingung waktu emailnya sendiri
    // (akun admin spm_sumatera dia sendiri) ditolak tanpa penjelasan.
    // RPC, bukan select+RLS biasa - lihat komentar load() di atas soal
    // kenapa select langsung tidak bisa diandalkan utk cek ini.
    const { data: existingRole, error: lookupError } = await supabase.rpc("marta_admin_profile_role_by_email", { p_email: email });
    if (lookupError) throw new Error(lookupError.message || "Gagal memeriksa email.");
    if (existingRole) {
      const label = PROFILE_ROLE_LABEL[existingRole] || existingRole || "role lain";
      throw new Error(
        existingRole === "marketing_sumatera_program"
          ? "Email ini sudah terdaftar sebagai akun Marketing Sumatera (Program)."
          : `Email ini sudah terdaftar sebagai akun ${label} - tidak bisa dipakai lagi untuk Marketing Sumatera (Program). Gunakan email lain.`
      );
    }

    const throwawayPassword = `Mkt${Math.random().toString(36).slice(2)}${Date.now().toString(36)}!`;
    const tempClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );
    const { data: signUpData, error: signUpError } = await tempClient.auth.signUp({
      email, password: throwawayPassword, options: { data: { full_name: fullName, role: "marketing_sumatera_program" } },
    });
    if (signUpError) {
      // Auth user bisa saja sudah ada TANPA baris "profiles" (mis. akun lama
      // yg belum pernah dikasih role) - query di atas tidak menangkap kasus
      // ini, jadi pesan generiknya tetap disiapkan sbg fallback terakhir.
      throw new Error((signUpError.message || "").toLowerCase().includes("already") || (signUpError.message || "").toLowerCase().includes("registered")
        ? "Email ini sudah terdaftar di sistem (akun login sudah ada), tapi belum ada role CMS - hubungi developer untuk cek manual."
        : (signUpError.message || "Gagal membuat akun."));
    }
    const { error: rpcError } = await supabase.rpc("marta_admin_create_program_profile", {
      p_user_id: signUpData.user.id, p_email: email, p_full_name: fullName,
    });
    if (rpcError) throw new Error(rpcError.message || "Gagal menyimpan profil akun.");
    await load();
  };

  // "Hapus" BENERAN - baris "profiles" DAN auth.users dihapus sekaligus
  // (RPC marta_admin_delete_program_account, SECURITY DEFINER bisa langsung
  // DELETE ke auth.users TANPA Admin API/service-role) - supaya emailnya
  // benar2 bebas dipakai daftar ulang dari nol, bukan cuma "role dikosongkan"
  // yg bikin signUp() berikutnya gagal "already registered".
  const handleRemove = async (acc) => {
    if (!confirm(`Hapus akun "${acc.full_name || acc.email}"? Akun ini akan dihapus SEPENUHNYA (bukan cuma dicabut aksesnya) - email ini bisa langsung didaftarkan ulang kalau perlu.`)) return;
    try {
      // RPC marta_admin_delete_program_account - hapus BENERAN (baris
      // "profiles" DAN auth.users-nya, bukan cuma mengosongkan role) supaya
      // email yg sama bisa didaftarkan ulang dari nol tanpa bentrok
      // "already registered" - lihat migrasi marta_program_account_true_delete.
      const { error } = await supabase.rpc("marta_admin_delete_program_account", { p_user_id: acc.id });
      if (error) throw error;
      await load();
    } catch (e) {
      alert(e.message || "Gagal menghapus akun.");
    }
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: T.mid, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 2 }}>
        Marketing Sumatera (Program)
      </div>
      {loading ? (
        <div style={{ fontSize: 11.5, color: T.lo, padding: "2px 2px" }}>Memuat…</div>
      ) : err ? (
        <div style={{ fontSize: 11, color: T.error, background: T.errorBg, border: `1px solid ${T.error}33`, borderRadius: 9, padding: "6px 9px", marginBottom: 5, lineHeight: 1.4 }}>{err}</div>
      ) : accounts.length === 0 && !canManage ? (
        <div style={{ fontSize: 11.5, color: T.lo, fontStyle: "italic", padding: "2px 2px" }}>Belum ada</div>
      ) : (
        accounts.map((acc) => {
          const isSelf = !!(callerEmail && acc.email && acc.email.toLowerCase() === callerEmail.toLowerCase());
          return (
            <div key={acc.id} style={{ display: "flex", alignItems: "center", gap: 8, background: T.hover || "#F6F7F9", borderRadius: 10, padding: "5px 9px", marginBottom: 3 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 800, color: T.primary, background: `${T.primary}17` }}>
                {(acc.full_name || acc.email || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: T.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                  {acc.full_name || "-"}
                  {isSelf && <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 999, color: T.success, background: T.successBg }}>Anda</span>}
                </div>
                <div style={{ fontSize: 10.5, color: T.mid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acc.email}</div>
              </div>
              {canManage && !isSelf && (
                <button onClick={() => handleRemove(acc)} title="Hapus" style={{ flexShrink: 0, width: 25, height: 25, borderRadius: 8, border: `1px solid ${T.error}44`, background: T.errorBg, color: T.error, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <UserX size={12} />
                </button>
              )}
            </div>
          );
        })
      )}
      {canManage && !err && (
        <QuickAddRow onSave={(targetEmail, fullName) => handleAdd({ targetEmail, fullName })} />
      )}
    </div>
  );
}

const titleCaseRegion = (s) => (s || "").toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

function RegionCard({ region, canManage, callerEmail, onAdd, onAddBoth, onRemove, onEdit }) {
  // Gabungkan kombo cabang×brand jadi satu blok per cabang (IM3 & 3ID
  // bersebelahan), sama spt mobile.
  const branchGroups = useMemo(() => {
    const byBranch = new Map();
    for (const g of region.branches) {
      if (!byBranch.has(g.branchId)) byBranch.set(g.branchId, { branchId: g.branchId, branchName: g.branchName, combos: [] });
      byBranch.get(g.branchId).combos.push(g);
    }
    return Array.from(byBranch.values());
  }, [region.branches]);

  const orgChartRef = useRef(null);
  const [exportingPng, setExportingPng] = useState(false);
  // Export struktur organisasi (seluruh org chart region ini) jadi PNG
  // resolusi tinggi (scale 3 ~ setara @3x) - sama pola spt export poster di
  // activity-dashboard/m/report (html2canvas, import dinamis).
  // Percobaan pertama (onclone saja) masih banyak terpotong - 2 akar
  // masalah: (1) baris cabang discroll horizontal (overflowX:auto) dgn
  // lebar CSS tetap, meng-clip anak yg melebihi lebar itu di screenshot
  // TERLEPAS dari windowWidth yg kita set - diubah LANGSUNG di DOM asli
  // (bukan lewat onclone yg ternyata timing-nya tidak selalu kepakai utk
  // ukur width/height awal html2canvas), baru diukur ulang scrollWidth
  // SETELAH dilebarkan, baru dikembalikan di finally; (2) nama/teks
  // kepotong separuh krn html2canvas mulai nge-render SEBELUM web font
  // selesai load (font metrics fallback beda tinggi dr font asli) - fix
  // dgn await document.fonts.ready sebelum capture.
  const handleExportPng = useCallback(async () => {
    const el = orgChartRef.current;
    if (!el) return;
    setExportingPng(true);
    const scrollers = Array.from(el.querySelectorAll("[data-mh-scrollx]"));
    const scrollRestoreFns = scrollers.map((n) => {
      const prevOverflow = n.style.overflow;
      const prevWidth = n.style.width;
      n.style.overflow = "visible";
      n.style.width = "max-content";
      return () => { n.style.overflow = prevOverflow; n.style.width = prevWidth; };
    });
    // Nama/email di layar sengaja 1-baris + ellipsis (ada title tooltip utk
    // lihat lengkapnya) - tapi PNG statis tidak punya tooltip, jadi malah
    // kelihatan "terpotong". Khusus saat export, lepas nowrap/ellipsis spy
    // teks wrap penuh & utuh, kasih sedikit line-height ekstra biar lega.
    const textNodes = Array.from(el.querySelectorAll("[data-mh-exporttext]"));
    const textRestoreFns = textNodes.map((n) => {
      const prev = { whiteSpace: n.style.whiteSpace, overflow: n.style.overflow, textOverflow: n.style.textOverflow, wordBreak: n.style.wordBreak, lineHeight: n.style.lineHeight };
      n.style.whiteSpace = "normal";
      n.style.overflow = "visible";
      n.style.textOverflow = "clip";
      n.style.wordBreak = "break-word";
      n.style.lineHeight = "1.45";
      return () => { n.style.whiteSpace = prev.whiteSpace; n.style.overflow = prev.overflow; n.style.textOverflow = prev.textOverflow; n.style.wordBreak = prev.wordBreak; n.style.lineHeight = prev.lineHeight; };
    });
    const restoreFns = [...scrollRestoreFns, ...textRestoreFns];
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      // Satu frame tambahan spy reflow dari pelebaran di atas sudah settle
      // sebelum html2canvas mulai mengukur/merender.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const fullWidth = el.scrollWidth;
      const fullHeight = el.scrollHeight;
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(el, {
        scale: 3, backgroundColor: "#FFFFFF", useCORS: true, logging: false,
        width: fullWidth, height: fullHeight,
        windowWidth: fullWidth, windowHeight: fullHeight,
        scrollX: -window.scrollX, scrollY: -window.scrollY,
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `struktur-organisasi-${(region.label || "region").toLowerCase().replace(/\s+/g, "-")}.png`;
      a.click();
    } catch (e) {
      alert("Gagal export PNG: " + (e?.message || String(e)));
    } finally {
      restoreFns.forEach((fn) => fn());
      setExportingPng(false);
    }
  }, [region.label]);

  return (
    <div style={{ background: "#FFFFFF", border: `1px solid ${T.line}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 8px rgba(17,17,20,0.05)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 16px", borderBottom: `1px solid ${T.line}` }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(15,110,86,0.09)", color: "#0F6E56", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <MapPin size={15} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, color: T.hi, flex: 1 }}>Region {titleCaseRegion(region.label)}</div>
        <button onClick={handleExportPng} disabled={exportingPng} type="button" title="Export struktur organisasi sebagai PNG resolusi tinggi" style={{
          display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 8, fontSize: 11, fontWeight: 800, fontFamily: FONT,
          border: `1px solid ${T.line}`, background: "#fff", color: T.mid, cursor: exportingPng ? "default" : "pointer", opacity: exportingPng ? 0.6 : 1, flexShrink: 0,
        }}>
          {exportingPng ? <Loader2 size={13} style={{ animation: "spin .8s linear infinite" }} /> : <ImageDown size={13} />}
          {exportingPng ? "Mengekspor…" : "Export PNG"}
        </button>
      </div>
      <div style={{ padding: "10px 14px 12px" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: T.mid, textTransform: "uppercase", letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 6 }}>
          <Building2 size={12} /> STRUKTUR ORGANISASI ({branchGroups.length})
        </div>

        <div ref={orgChartRef} style={{ background: "#FFFFFF" }}>
          <OrgChart region={region} branchGroups={branchGroups} canAdd={canManage}
            onAdd={onAdd} onRemove={onRemove} onEdit={onEdit} callerEmail={callerEmail} />
        </div>
      </div>
    </div>
  );
}

/** Visual org-chart (Head of Region -> Head of Area per cabang -> DMO per
 * cabang) - mengganti grid kartu cabang lama, meniru referensi gambar
 * "Area Operation Structure" yg dikirim user: satu kotak gelap di atas,
 * sebaris kotak "HEAD OF AREA" per cabang, masing2 terhubung garis turun ke
 * kotak "DMO" di bawahnya. Role & data SAMA PERSIS (head=region.head,
 * bsm=Head of Area, bme_rge=DMO per cabang×brand) - ini murni presentasi. */
// Gabungkan orang yg sama (per email) dari beberapa kombo brand jadi satu
// daftar - DIPAKAI utk Head of Area (bsm) & DMO (bme_rge) yg skrg SATU slot
// per cabang lintas brand (tidak dipisah IM3/3ID lagi). Data lama yg msh
// brand-spesifik (2 baris, sama/beda orang) ikut digabung di sini supaya
// chart tetap tampil rapi SATU kotak, bukan dobel.
function mergePeopleAcrossCombos(combos, role) {
  const byEmail = new Map();
  for (const c of combos) {
    for (const p of (c.byRole?.get(role) || [])) {
      const key = (p.email || p.id || "").toLowerCase();
      if (!byEmail.has(key)) byEmail.set(key, p);
    }
  }
  return Array.from(byEmail.values());
}

function OrgChart({ region, branchGroups, canAdd, onAdd, onRemove, onEdit, callerEmail }) {
  const lineColor = "#DADFE6";
  const dmoLineColor = "#0F6E56";
  // Celah antara garis horizontal & kotak HARUS sama persis dgn tinggi
  // Stem di bawahnya - kalau tidak, ada jarak "mati" tanpa garis sama
  // sekali (persis bug yg bikin tampilannya kelihatan terputus sebelumnya).
  const gapToRow = 16;
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <ChartNode kind="head" headerLabel={`Head of Region ${titleCaseRegion(region.label)}`} people={region.head} role="head"
          context={{ region: region.key, brand: null, branchSlug: null, branchName: null }}
          canAdd={canAdd} onAdd={onAdd} onRemove={onRemove} onEdit={onEdit} callerEmail={callerEmail} />
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}><Stem color={lineColor} height={gapToRow} /></div>
      {/* Head of Regional Operation - tier baru di bawah Head of Region,
          otoritas sama (region-scoped, lintas brand), satu kotak di tengah
          persis spt Head of Region. */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <ChartNode kind="regional_ops" headerLabel="Head of Regional Operation" people={region.headOfRegionalOperation} role="head_of_regional_operation"
          context={{ region: region.key, brand: null, branchSlug: null, branchName: null }}
          canAdd={canAdd} onAdd={onAdd} onRemove={onRemove} onEdit={onEdit} callerEmail={callerEmail} />
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}><Stem color={lineColor} height={gapToRow} /></div>
      {/* Visibility Region Lead & GTM Region Lead - tier baru di atas
          DMO/DMP, dua kotak bersebelahan di bawah Head of Regional
          Operation. Garis penghubung per-kolom (sama teknik spt baris
          cabang di bawah) biar tidak ada "ekor" nongol di kiri/kanan. */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ display: "flex", gap: "clamp(10px, 1.6vw, 20px)" }}>
          {[
            { key: "visibility", label: "Visibility Region Lead", role: "visibility_region_lead", people: region.visibilityRegionLead },
            { key: "gtm", label: "GTM Region Lead", role: "gtm_region_lead", people: region.gtmRegionLead },
          ].map((lead, idx, arr) => {
            const isFirst = idx === 0;
            const isLast = idx === arr.length - 1;
            const halfGap = "calc(clamp(10px, 1.6vw, 20px) / 2)";
            const connectorLeft = isFirst ? "50%" : `calc(-1 * ${halfGap})`;
            const connectorRight = isLast ? "50%" : `calc(-1 * ${halfGap})`;
            return (
              <div key={lead.key} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ position: "absolute", top: 0, left: connectorLeft, right: connectorRight, height: 2, background: lineColor }} />
                <Stem color={lineColor} height={gapToRow} />
                <ChartNode kind="region_lead" headerLabel={lead.label} people={lead.people} role={lead.role}
                  context={{ region: region.key, brand: null, branchSlug: null, branchName: null }}
                  canAdd={canAdd} onAdd={onAdd} onRemove={onRemove} onEdit={onEdit} callerEmail={callerEmail} />
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}><Stem color={lineColor} height={gapToRow} /></div>
      {/* Baris cabang - scroll horizontal (pola umum utk data sepadat ini,
          lebih rapi drpd memaksa wrap yg bikin garis konektor berantakan).
          PENTING: garis horizontal (borderTop) dipasang pada div yg SAMA
          dgn yg discroll dan lebarnya width:"max-content" (ngepas isi, BUKAN
          100% viewport) - jadi garisnya PERSIS mentok di kartu
          pertama/terakhir, ikut scroll bareng, tidak pernah "nongol" lewat
          di kiri/kanan walau sudah discroll mentok. */}
      <div data-mh-scrollx style={{ overflowX: "auto", scrollbarWidth: "thin", paddingBottom: 4 }}>
        <div style={{
          display: "flex", width: "max-content", minWidth: "100%", boxSizing: "border-box",
          gap: "clamp(10px, 1.6vw, 20px)",
        }}>
          {branchGroups.map((b, idx) => {
            const headArea = mergePeopleAcrossCombos(b.combos, "bsm");
            const dmo = mergePeopleAcrossCombos(b.combos, "bme_rge");
            // Slot baru (+ Tambah) SELALU dibuat brand=null - satu DMO /
            // Head of Area berlaku lintas IM3 & 3ID, tidak perlu isi 2x lagi.
            const ctx = { region: region.key, brand: null, branchSlug: b.combos[0]?.branchSlug, branchName: b.branchName };
            const isFirst = idx === 0;
            const isLast = idx === branchGroups.length - 1;
            // Garis horizontal per-kolom, bukan satu garis lebar penuh di
            // parent - itu yg bikin ada "ekor" garis nongol di kiri kartu
            // pertama / kanan kartu terakhir (garis parent selebar row,
            // sementara stem vertikal cuma di tengah kartu). Di sini garis
            // dibatasi persis: mulai dr tengah kartu pertama, berakhir di
            // tengah kartu terakhir, nyambung mulus lewat gap di antaranya.
            const halfGap = "calc(clamp(10px, 1.6vw, 20px) / 2)";
            const connectorLeft = isFirst ? "50%" : `calc(-1 * ${halfGap})`;
            const connectorRight = isLast ? "50%" : `calc(-1 * ${halfGap})`;
            return (
              <div key={b.branchId} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <div style={{ position: "absolute", top: 0, left: connectorLeft, right: connectorRight, height: 2, background: lineColor }} />
                <Stem color={lineColor} height={gapToRow} />
                <ChartNode kind="area" headerLabel="Head of Area" subLabel={b.branchName} people={headArea} role="bsm"
                  context={ctx} canAdd={canAdd} onAdd={onAdd} onRemove={onRemove} onEdit={onEdit} callerEmail={callerEmail} />
                <Stem color={dmoLineColor} height={gapToRow} />
                <ChartNode kind="dmo" headerLabel="DMO · District Marketing Operation" people={dmo} role="bme_rge"
                  context={ctx} canAdd={canAdd} onAdd={onAdd} onRemove={onRemove} onEdit={onEdit} callerEmail={callerEmail} />
              </div>
            );
          })}
        </div>
        <div style={{ textAlign: "center", fontSize: 10, color: T.lo, marginTop: 6 }}>← geser utk lihat semua {branchGroups.length} cabang →</div>
      </div>
    </div>
  );
}

const Stem = ({ color, height }) => <div style={{ width: 2, height, background: color, flexShrink: 0 }} />;

const CHART_THEME = {
  head: { bg: "linear-gradient(160deg,#1C2638,#283349)", color: "#fff", labelColor: "#A9B6CC", width: "clamp(260px, 26vw, 340px)", shadow: "0 4px 14px rgba(20,26,40,0.25)" },
  regional_ops: { bg: "linear-gradient(160deg,#1E3A5F,#15283F)", color: "#fff", labelColor: "#AFC6E6", width: "clamp(238px, 19vw, 272px)", shadow: "0 3px 10px rgba(21,40,63,0.22)" },
  region_lead: { bg: "linear-gradient(160deg,#6B3FA0,#4A2B73)", color: "#fff", labelColor: "#E3D4F5", width: "clamp(220px, 17vw, 250px)", shadow: "0 3px 10px rgba(74,43,115,0.2)" },
  area: { bg: "linear-gradient(160deg,#10785F,#0B5745)", color: "#fff", labelColor: "#CFEFE4", width: "clamp(238px, 19vw, 272px)", shadow: "0 3px 10px rgba(15,110,86,0.2)" },
  dmo: { bg: "#F5F6F8", color: T.hi, labelColor: "#0F6E56", width: "clamp(238px, 19vw, 272px)", border: `1px solid ${T.line}`, shadow: "none" },
};

/** Satu baris orang di dalam ChartNode - avatar inisial + nama/status di
 * kiri, tombol edit/hapus di kanan (sebaris, bukan ditumpuk di bawah nama)
 * supaya node yg isinya >1 orang (mis. data lama blom di-cleanup) tetap
 * ringkas & rapi, bukan makin tinggi menumpuk tak beraturan. */
function ChartPersonRow({ person, kind, onEdit, onRemove, isSelf }) {
  const dark = kind !== "dmo";
  const initials = (person.full_name || person.email || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  // Head of Region butuh sedikit lebih "lega" (kotaknya jg lebih lebar)
  // drpd Head of Area/DMO - skala avatar, font & tombol ikon ikut kind
  // spy tetap proporsional & rapi di kedua ukuran kotak.
  const big = kind === "head";
  const avatarSize = big ? 34 : 26;
  const btnSize = big ? 26 : 21;
  const iconSize = big ? 12 : 10;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: big ? 10 : 7, textAlign: "left" }}>
      <div style={{
        width: avatarSize, height: avatarSize, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        // lineHeight:1 WAJIB - tanpa ini browser kasih "line box" lebih
        // tinggi drpd glyph-nya sendiri (warisan line-height font/body),
        // jadi walau div-nya sudah flex-center, inisial kelihatan nongkrong
        // sedikit di atas pusat lingkaran, bukan benar2 center.
        fontSize: big ? 12 : 9.5, fontWeight: 800, lineHeight: 1, background: dark ? "rgba(255,255,255,0.14)" : "rgba(15,110,86,0.12)", color: dark ? "#fff" : "#0F6E56",
      }}>{initials}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* data-mh-exporttext: ditandai krn di layar sengaja 1-baris +
            ellipsis (ada title tooltip), tapi saat export PNG tooltip
            tidak kebaca sama sekali - jadi kelihatan "terpotong". Saat
            export, atribut ini dipakai utk sementara melepas nowrap/ellipsis
            jadi teks boleh wrap penuh & utuh (lihat handleExportPng). */}
        <div data-mh-exporttext title={person.full_name || person.email} style={{
          fontSize: big ? 14.5 : 11, fontWeight: 800, lineHeight: 1.3,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{person.full_name || person.email}</div>
        {!!person.email && (
          <div data-mh-exporttext title={person.email} style={{
            fontSize: big ? 11.5 : 9.5, fontWeight: 600, marginTop: 2, lineHeight: 1.4,
            color: dark ? "rgba(255,255,255,0.58)" : T.mid, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{person.email}</div>
        )}
        <LoginStatusBadge person={person} style={{ marginTop: 3, color: kind === "dmo" ? undefined : "currentColor", opacity: kind === "dmo" ? 1 : 0.75 }} />
      </div>
      <div style={{ flexShrink: 0, display: "flex", gap: big ? 6 : 4 }}>
        <button onClick={() => onEdit(person)} title="Edit email/nama" style={{
          width: btnSize, height: btnSize, borderRadius: big ? 9 : 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          background: dark ? "rgba(255,255,255,0.14)" : "#fff", color: dark ? "#fff" : T.mid, border: dark ? "none" : `1px solid ${T.line}`,
        }}><Pencil size={iconSize} /></button>
        {!isSelf && (
          <button onClick={() => onRemove(person)} title="Hapus" style={{
            width: btnSize, height: btnSize, borderRadius: big ? 9 : 6, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            background: dark ? "rgba(255,255,255,0.14)" : T.errorBg, color: dark ? "#fff" : T.error,
          }}><UserX size={iconSize} /></button>
        )}
      </div>
    </div>
  );
}

function ChartNode({ kind, headerLabel, subLabel, people, role, context, canAdd, onAdd, onRemove, onEdit, callerEmail }) {
  const theme = CHART_THEME[kind];
  const [adding, setAdding] = useState(false);
  const hasPeople = people.length > 0;
  return (
    <div style={{
      width: theme.width, background: theme.bg, color: theme.color, borderRadius: 12,
      padding: "14px 14px", textAlign: "center", border: theme.border, boxShadow: theme.shadow, boxSizing: "border-box",
    }}>
      {subLabel && (
        <div style={{ fontSize: 11.5, fontWeight: 800, color: theme.color, marginBottom: 5, wordBreak: "break-word" }}>{subLabel}</div>
      )}
      <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.3, color: theme.labelColor, textTransform: "uppercase", marginBottom: hasPeople ? 9 : 2, textAlign: subLabel ? "left" : "center" }}>{headerLabel}</div>
      {hasPeople && (
        <div style={{ display: "flex", flexDirection: "column", gap: kind === "head" ? 16 : 10 }}>
          {people.map((person, i) => {
            const isSelf = !!(callerEmail && person.email && person.email.toLowerCase() === callerEmail.toLowerCase());
            return (
              <div key={person.id || person.email} style={i > 0 ? { paddingTop: kind === "head" ? 16 : 10, borderTop: `1px solid ${kind === "dmo" ? T.line : "rgba(255,255,255,0.14)"}` } : undefined}>
                <ChartPersonRow person={person} kind={kind} onEdit={onEdit} onRemove={onRemove} isSelf={isSelf} />
              </div>
            );
          })}
        </div>
      )}
      {!hasPeople && !canAdd && (
        <div style={{ fontSize: 10.5, opacity: 0.65, fontStyle: "italic" }}>Belum ada</div>
      )}
      {canAdd && (
        adding ? (
          <div style={{ marginTop: hasPeople ? (kind === "head" ? 12 : 8) : 0, paddingTop: hasPeople ? (kind === "head" ? 12 : 8) : 0, borderTop: hasPeople ? `1px solid ${kind === "dmo" ? T.line : "rgba(255,255,255,0.14)"}` : "none" }}>
            <ChartQuickAdd dark={kind !== "dmo"}
              onCancel={() => setAdding(false)}
              onSave={async (email, name) => { await onAdd({ targetEmail: email, fullName: name, role, ...context }); setAdding(false); }} />
          </div>
        ) : (
          <button onClick={() => setAdding(true)} type="button" style={{
            width: "100%", marginTop: hasPeople ? (kind === "head" ? 12 : 8) : 0,
            padding: "6px 6px", borderRadius: 7, fontSize: 10.5, fontWeight: 800, fontFamily: FONT, cursor: "pointer",
            border: kind === "dmo" ? `1.5px dashed ${T.primary}66` : "1.5px dashed rgba(255,255,255,0.4)",
            background: kind === "dmo" ? T.primaryBg : "rgba(255,255,255,0.08)",
            color: kind === "dmo" ? T.primary : "#fff",
          }}>+ Tambah</button>
        )
      )}
    </div>
  );
}

/** Form mini (email + nama) dipakai ChartNode saat slot kosong diklik "+
 * Tambah" - versi ringkas dari QuickAddRow, dgn varian warna gelap/terang
 * (`dark`) supaya tetap kebaca di atas kotak Head/Head of Area yg gelap. */
function ChartQuickAdd({ onSave, onCancel, dark }) {
  const [emailInput, setEmailInput] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const ready = !!(emailInput.trim() && name.trim());

  async function submit() {
    if (!ready || saving) return;
    setSaving(true); setErr("");
    try { await onSave(emailInput.trim(), name.trim()); }
    catch (e) { setErr(e.message || "Gagal"); setSaving(false); }
  }

  const fieldStyle = {
    width: "100%", height: 26, padding: "0 7px", borderRadius: 6, fontSize: 10.5, fontFamily: FONT, outline: "none", boxSizing: "border-box",
    border: dark ? "1px solid rgba(255,255,255,0.3)" : `1px solid ${T.line}`,
    background: dark ? "rgba(255,255,255,0.1)" : "#fff",
    color: dark ? "#fff" : T.hi,
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, textAlign: "left" }}>
      <input value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="Email" type="email" style={fieldStyle} autoFocus />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama" style={fieldStyle} />
      {err && <div style={{ fontSize: 9.5, color: dark ? "#FFB4B4" : T.error, fontWeight: 700 }}>{err}</div>}
      <div style={{ display: "flex", gap: 4 }}>
        <button onClick={submit} disabled={!ready || saving} type="button" style={{
          flex: 1, padding: "4px 6px", borderRadius: 6, border: "none", fontSize: 10, fontWeight: 800, fontFamily: FONT, cursor: "pointer",
          background: dark ? "#fff" : T.primary, color: dark ? "#1C2638" : "#fff", opacity: !ready || saving ? 0.6 : 1,
        }}>{saving ? "…" : "Simpan"}</button>
        <button onClick={onCancel} type="button" disabled={saving} style={{
          padding: "4px 6px", borderRadius: 6, fontSize: 10, fontWeight: 700, fontFamily: FONT, cursor: "pointer",
          border: dark ? "1px solid rgba(255,255,255,0.3)" : `1px solid ${T.line}`, background: "transparent", color: dark ? "#fff" : T.mid,
        }}>Batal</button>
      </div>
    </div>
  );
}

function BranchCard({ branchName, combos, canAdd, onAdd, onAddBoth, onRemove, onEdit, callerEmail }) {
  // DMO (bme_rge) msh kosong di KEDUA brand -> tawarkan opsi isi email yg
  // sama sekaligus utk IM3 & 3ID, drpd isi manual 2x di tiap SlotRow brand.
  const dmoEmptyIm3 = (combos.find((c) => c.brand === "im3")?.byRole?.get("bme_rge") || []).length === 0;
  const dmoEmptyTri = (combos.find((c) => c.brand === "tri")?.byRole?.get("bme_rge") || []).length === 0;
  const baseCombo = combos[0];
  const bothCtx = baseCombo ? { region: baseCombo.region, branchSlug: baseCombo.branchSlug, branchName: baseCombo.branchName } : null;
  return (
    <div style={{ background: "#FBFBFC", border: `1px solid ${T.line}`, borderRadius: 13, padding: "8px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Building2 size={13} color={T.mid} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, fontWeight: 800, color: T.hi }}>{branchName}</span>
      </div>
      {canAdd && dmoEmptyIm3 && dmoEmptyTri && bothCtx && onAddBoth && (
        <SameEmailBothBrandsButton ctx={bothCtx} onAddBoth={onAddBoth} />
      )}
      {combos.map((combo) => {
        const brandColor = BRAND_COLOR_POP[combo.brand] || T.mid;
        const bmeRge = combo.byRole?.get("bme_rge") || [];
        // BSM - setara DMO penuh (lihat migrasi add_bsm_role_as_bme_rge_peer),
        // ditampilkan sbg SlotRow sejajar, bukan masuk daftar executor.
        const bsm = combo.byRole?.get("bsm") || [];
        // Semua "executor" di bawah DMO (MD, DSF, TL DSF, DSE, GSE, AE,
        // Promotor, CSE/RSE) - ditampilkan sbg daftar per role yg SUDAH
        // terisi, penambahan orang baru (role apa pun, boleh dobel) lewat
        // satu tombol "+ Tambahkan Executor" di bawah, bukan lagi baris
        // tambah terpisah per role.
        const executorRows = EXECUTOR_ROLES.map((r) => [r, combo.byRole?.get(r) || []]).filter(([, list]) => list.length > 0);
        const ctx = { region: combo.region, brand: combo.brand, branchSlug: combo.branchSlug, branchName: combo.branchName };
        return (
          <div key={combo.brand} style={{ marginTop: 6, paddingTop: 6, borderTop: `1px dashed ${T.line}` }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.2, padding: "2px 7px", borderRadius: 999, color: brandColor, background: `${brandColor}17` }}>
              {combo.brand === "tri" ? "3ID" : "IM3"}
            </span>
            {/* DMO - hanya 1 slot per cabang×brand */}
            <SlotRow title="BME / RGE" role="bme_rge" people={bmeRge} canAdd={canAdd && bmeRge.length === 0} single
              context={ctx} onAdd={onAdd} onRemove={onRemove} onEdit={onEdit} callerEmail={callerEmail} compact />
            {/* BSM - hanya 1 slot per cabang×brand, sama pola DMO */}
            <SlotRow title="HEAD OF AREA" role="bsm" people={bsm} canAdd={canAdd && bsm.length === 0} single
              context={ctx} onAdd={onAdd} onRemove={onRemove} onEdit={onEdit} callerEmail={callerEmail} compact />
            {executorRows.map(([r, list]) => (
              <SlotRow key={r} title={`${ROLE_LABEL[r] || r} (di bawah DMO)`} role={r} people={list} canAdd={false}
                context={ctx} onAdd={onAdd} onRemove={onRemove} onEdit={onEdit} callerEmail={callerEmail} compact nested />
            ))}
            {canAdd && <AddExecutorButton ctx={ctx} onAdd={onAdd} />}
          </div>
        );
      })}
    </div>
  );
}

/** Opsi "Gunakan email yang sama untuk IM3 & 3ID" - khusus role DMO
 * (bme_rge), ditampilkan di atas kedua SlotRow brand selama slot DMO IM3
 * maupun 3ID masih kosong. Isi satu email+nama sekali, onAddBoth akan
 * menyimpan 2 baris assignment (brand im3 & tri) sekaligus - email yg sama
 * dipakai lintas brand sudah didukung penuh oleh arsitektur multi-slot
 * (mh_assign_user keyed on email+role+brand+branch), jadi ini murni
 * mempercepat input, bukan fitur baru di level data. */
function SameEmailBothBrandsButton({ ctx, onAddBoth }) {
  const [open, setOpen] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const ready = !!(emailInput.trim() && name.trim());

  async function submit() {
    if (!ready || saving) return;
    setSaving(true); setErr("");
    try {
      await onAddBoth({ targetEmail: emailInput.trim(), fullName: name.trim(), role: "bme_rge", ...ctx });
      setEmailInput(""); setName(""); setOpen(false);
    } catch (e) { setErr(e.message || "Gagal menyimpan"); }
    finally { setSaving(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} type="button"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%",
          padding: "6px 10px", marginBottom: 2, borderRadius: 9, border: `1.5px dashed ${T.primary}66`, background: T.primaryBg,
          color: T.primary, fontSize: 11, fontWeight: 800, fontFamily: FONT, cursor: "pointer",
        }}>
        <UserPlus size={12} /> Email sama untuk IM3 & 3ID
      </button>
    );
  }

  const miniInput = { minWidth: 0, height: 32, padding: "0 10px", borderRadius: 8, border: `1.5px dashed ${T.line}`, background: "#fff", fontSize: 12, fontFamily: FONT, outline: "none", boxSizing: "border-box", width: "100%" };
  return (
    <div style={{ background: "#fff", border: `1.5px dashed ${T.primary}66`, borderRadius: 10, padding: 8, marginBottom: 4 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: T.primary, marginBottom: 6 }}>DMO - sama utk IM3 & 3ID</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <input value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="Email" type="email" style={miniInput} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama lengkap" style={miniInput} />
      </div>
      {err && <div style={{ marginTop: 6, fontSize: 11, color: T.error, fontWeight: 600 }}>{err}</div>}
      <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
        <button onClick={submit} disabled={!ready || saving} type="button"
          style={{ ...pbtn, flex: 1, padding: "7px 10px", fontSize: 11.5, opacity: !ready || saving ? 0.5 : 1 }}>
          {saving ? "Menyimpan…" : "Simpan utk 2 Brand"}
        </button>
        <button onClick={() => { setOpen(false); setErr(""); }} type="button" disabled={saving}
          style={{ ...btn, padding: "7px 10px", fontSize: 11.5 }}>Batal</button>
      </div>
    </div>
  );
}

/** Tombol "+ Tambahkan Executor" - satu pintu masuk utk menambah SIAPA PUN
 * di bawah DMO (MD, DSF, TL DSF, DSE, GSE, AE, Promotor, CSE/RSE, BSM).
 * Klik -> modal: pilih role dulu (grid pill), baru isi email/nama (+ORG ID
 * kalau DSF). Menggantikan baris tambah terpisah per-role + toggle "role
 * lain" yg lama, supaya kartu cabang tetap ringkas & rapi. */
function AddExecutorButton({ ctx, onAdd }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} type="button"
        style={{
          marginTop: 7, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          padding: "7px 12px", borderRadius: 10, border: `1.5px dashed ${T.primary}66`, background: T.primaryBg,
          color: T.primary, fontSize: 11.5, fontWeight: 800, fontFamily: FONT, cursor: "pointer", transition: "background .15s, border-color .15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = T.primary; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = T.primaryBg; e.currentTarget.style.borderColor = `${T.primary}66`; }}>
        <UserPlus size={13} /> Tambahkan Executor
      </button>
      {open && <ExecutorPickerModal ctx={ctx} onAdd={onAdd} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Modal pilih-role + isi data utk AddExecutorButton. Role dipilih lewat
 * grid pill (bukan <select> polos) supaya jelas kelihatan semua opsi
 * sekaligus, dgn label singkat & warna aksen per role. */
function ExecutorPickerModal({ ctx, onAdd, onClose }) {
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
      await onAdd({ targetEmail: emailInput.trim(), fullName: name.trim(), role, dsfOrgId: needsOrgId ? orgId.trim() : undefined, ...ctx });
      onClose();
    } catch (e) { setErr(e.message || "Gagal menyimpan"); setSaving(false); }
  }

  return (
    <div onClick={saving ? undefined : onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: FONT }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, background: "#fff", borderRadius: 16, border: `1px solid ${T.line}`, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ padding: "16px 20px", background: "linear-gradient(135deg,#FFF5F5,#FDF2F8)", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: GRAD, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <UserPlus size={15} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: T.hi }}>Tambahkan Executor</div>
            <div style={{ fontSize: 11, color: T.mid, fontWeight: 600 }}>{ctx.branchName} · {ctx.brand === "tri" ? "3ID" : "IM3"} · di bawah DMO</div>
          </div>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: T.mid, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>1. Pilih Role</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 7, marginBottom: 18 }}>
            {EXECUTOR_ROLES.map((r) => {
              const active = role === r;
              const rColor = ROLE_COLOR_CARD[r] || T.primary;
              return (
                <button key={r} type="button" onClick={() => setRole(r)}
                  style={{
                    padding: "9px 8px", borderRadius: 10, fontSize: 11.5, fontWeight: 800, fontFamily: FONT, cursor: "pointer", textAlign: "center",
                    border: `1.5px solid ${active ? rColor : T.line}`, background: active ? `${rColor}17` : "#fff", color: active ? rColor : T.mid,
                    transition: "background .15s, border-color .15s",
                  }}>
                  {ROLE_LABEL[r] || r}
                </button>
              );
            })}
          </div>

          <div style={{ fontSize: 11, fontWeight: 800, color: T.mid, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>2. Data Orang</div>
          <Field label="Email"><input value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="nama@ioh.co.id" style={inp} disabled={saving} /></Field>
          <div style={{ marginTop: 12 }} />
          <Field label="Nama Lengkap"><input value={name} onChange={(e) => setName(e.target.value.toUpperCase())} placeholder="NAMA LENGKAP" style={{ ...inp, textTransform: "uppercase" }} disabled={saving} /></Field>
          {needsOrgId && (
            <>
              <div style={{ marginTop: 12 }} />
              <Field label="ORG ID"><input value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="ORG ID" style={inp} disabled={saving} /></Field>
            </>
          )}
          {err && <div style={{ marginTop: 12, fontSize: 12, color: T.error }}>{err}</div>}
        </div>

        <div style={{ padding: "12px 18px", borderTop: `1px solid ${T.line}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} disabled={saving} style={btn}>Batal</button>
          <button onClick={submit} disabled={saving || !ready} title={!role ? "Pilih role dulu" : !ready ? "Isi email & nama dulu" : "Simpan"}
            style={{ ...pbtn, opacity: saving || !ready ? 0.55 : 1, cursor: saving || !ready ? "default" : "pointer" }}>
            {saving ? <Loader2 size={13} style={{ animation: "cardspin .85s linear infinite" }} /> : <Save size={13} />} Simpan
          </button>
        </div>
        <style>{`@keyframes cardspin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

/** Baris "siap-isi" satu posisi/role - inti kartu, port dari
 * InlineRoleRow (mobile) ke palet desktop (T/FONT). */
function SlotRow({ title, role, mixedRoles, people, canAdd, context, onAdd, onRemove, onEdit, callerEmail, compact, nested, needsOrgId, accent, single }) {
  return (
    <div style={{ marginTop: compact ? 3 : 8, ...(nested ? { marginLeft: 14, paddingLeft: 10, borderLeft: `2px solid ${T.line}` } : {}) }}>
      <div style={{ fontSize: compact ? 10 : 10.5, fontWeight: 700, color: accent || T.mid, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
        {title}
        {single && people.length > 0 && (
          <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.2, padding: "1px 6px", borderRadius: 999, color: T.success, background: T.successBg, textTransform: "none" }}>Slot terisi</span>
        )}
      </div>
      {people.length === 0 && !canAdd && (
        <div style={{ fontSize: 11.5, color: T.lo, fontStyle: "italic", padding: "2px 2px" }}>Belum ada</div>
      )}
      {people.map((p) => {
        const isSelf = !!(callerEmail && p.email && p.email.toLowerCase() === callerEmail.toLowerCase());
        const pColor = ROLE_COLOR_CARD[p.role] || accent || T.mid;
        return (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, background: T.hover || "#F6F7F9", borderRadius: 10, padding: "5px 9px", marginBottom: 3 }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 800, color: pColor, background: `${pColor}17` }}>
              {(p.full_name || p.email || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                {p.full_name || "-"}
                {mixedRoles && <span style={{ flexShrink: 0, fontSize: 8.5, fontWeight: 800, padding: "1px 6px", borderRadius: 999, color: pColor, background: `${pColor}17` }}>{ROLE_LABEL[p.role] || p.role}</span>}
                {isSelf && <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 999, color: T.success, background: T.successBg }}>Anda</span>}
              </div>
              <div style={{ fontSize: 10.5, color: T.mid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.email}</div>
              <LoginStatusBadge person={p} />
            </div>
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5 }}>
              {onEdit && (
                <button onClick={() => onEdit(p)} title="Edit email/nama" style={{ width: 25, height: 25, borderRadius: 8, border: `1px solid ${T.line}`, background: "#fff", color: T.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <Pencil size={11} />
                </button>
              )}
              {isSelf ? (
                <div title="Anda tidak bisa menghapus akun sendiri" style={{ width: 25, height: 25, borderRadius: 8, border: `1px solid ${T.line}`, background: "#fff", color: "#C7C7CF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <UserX size={12} />
                </div>
              ) : (
                <button onClick={() => onRemove(p)} title="Hapus" style={{ width: 25, height: 25, borderRadius: 8, border: `1px solid ${T.error}44`, background: T.errorBg, color: T.error, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <UserX size={12} />
                </button>
              )}
            </div>
          </div>
        );
      })}
      {canAdd && (
        <QuickAddRow needsOrgId={needsOrgId}
          onSave={(targetEmail, fullName, orgId) => onAdd({ targetEmail, fullName, role, dsfOrgId: orgId, ...context })} />
      )}
    </div>
  );
}

/** Baris Email + Nama (+ ORG ID utk DSF) + tombol Simpan - ikon Save,
 * disabled sampai wajib-isi terpenuhi. Port dari InlineAddRow (mobile). */
function QuickAddRow({ onSave, needsOrgId }) {
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

  const miniInput = { minWidth: 0, height: 34, padding: "0 10px", borderRadius: 9, border: `1.5px dashed ${T.line}`, background: "#FBFBFC", fontSize: 12, fontFamily: FONT, outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="Email"
          onKeyDown={(e) => e.key === "Enter" && submit()} style={{ ...miniInput, flex: "1 1 150px" }} />
        <input value={name} onChange={(e) => setName(e.target.value.toUpperCase())} placeholder="NAMA LENGKAP"
          onKeyDown={(e) => e.key === "Enter" && submit()} style={{ ...miniInput, flex: "1 1 130px", textTransform: "uppercase" }} />
        {needsOrgId && (
          <input value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="ORG ID"
            onKeyDown={(e) => e.key === "Enter" && submit()} style={{ ...miniInput, flex: "1 1 90px" }} />
        )}
        <button onClick={submit} disabled={saving || !ready} title={!ready ? "Isi email & nama dulu" : "Simpan"}
          style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 9, border: "none", background: ready ? GRAD : "#DCDDE3", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: saving || !ready ? "default" : "pointer", opacity: saving ? 0.75 : 1, transition: "background .15s" }}>
          {saving ? <Loader2 size={13} style={{ animation: "cardspin .85s linear infinite" }} /> : <Save size={13} />}
        </button>
      </div>
      {err && <div style={{ marginTop: 4, fontSize: 10.5, color: T.error }}>{err}</div>}
      <style>{`@keyframes cardspin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
