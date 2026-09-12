"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { X, Search, Download, Upload, RotateCcw, Wallet, FileCheck2, CardSim, Router as RouterIcon, TrendingUp, Banknote, Percent, RefreshCw, Loader2, Settings2, Image as ImageIcon, Undo2, AlertTriangle } from "lucide-react";
import ExcelJS from "exceljs";
import MartaShell, { T, FONT, brandLabel } from "../components/MartaShell";
import ExcelFilter from "../components/ExcelFilter";
import { ActivityDetailModal } from "../components/ActivityDetail";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";
import { getMartaScope, applyMartaScope } from "../../../lib/martaScope";

const CAT_LABEL = {
  directSelling: "Direct Selling", jointEvent: "Join Event", openBooth: "Open Booth",
  project: "Project", sponsorship: "Sponsorship", thematic: "Thematic",
};
const STATUS = {
  draft: ["Draft", T.mid, "#eef1f6"], submitted: ["Laporan Masuk", T.blue, T.blueBg],
  rejected: ["Ditolak", T.error, T.errorBg],
  completed: ["Selesai", T.success, T.successBg], inProgress: ["Berlangsung", T.warning, T.warningBg],
  plan_submitted: ["Plan Diajukan", T.blue, T.blueBg], revision_needed: ["Revisi Plan", T.warning, T.warningBg],
  pending_validation: ["Menunggu Validasi", T.blue, T.blueBg],
};

// Status "completed" (dulu "approved") sekarang eksklusif berarti laporan aktual sudah disubmit
// & tervalidasi otomatis (lihat trigger mh_validate_activity_actual) -> harus
// selalu tampil "Selesai". Sebelum laporan aktual masuk (actual_sp masih null)
// status masih berupa 'ready'/dll dan dipecah berdasarkan tanggal plan_date
// vs hari ini (murni tampilan, TIDAK mengubah kolom status di DB):
//   - belum sampai plan_date  -> "Menunggu Hari-H"
//   - hari ini persis plan_date -> "Hari-H / Berlangsung"
//   - sudah lewat plan_date tapi laporan aktual belum disubmit -> "Menunggu Laporan"
// Daftar kolom MANDATORY utk sebuah Plan (baik diisi manual lewat app maupun
// lewat Import Excel/Backdoor) - dipakai utk cek kelengkapan data backdoor,
// krn validasi minimal di RPC import (mh_import_plan_batch) TIDAK mengecek
// semuanya (mis. Target SP/FWA & BME/RGE tidak divalidasi di RPC spy row yg
// datanya sebagian kosong tetap kequarantine krn alasan lain, bkn ke-block
// total). Balikin daftar {key,label} kolom yg masih kosong utk row tsb.
// Nama BME/RGE utk ditampilkan - PRIORITAS: pemilik SUNGGUHAN (created_by,
// diisi RPC saat activity dibuat/diklaim oleh akun login asli) dulu. Kalau
// kosong DAN baris ini hasil Import Excel (Backdoor), tarik nama dari
// assignment User Management (mh_profiles role=bme_rge aktif, dicocokkan
// branch+brand activity ini) SEKALIPUN BME/RGE itu belum pernah login -
// supaya kolom tidak kosong padahal assignment-nya sudah ada. Ini MURNI
// tampilan (get()/export, TIDAK ditulis ke kolom bme_user_id yg terkunci
// foreign key ke auth.users) - begitu BME/RGE aslinya login & activity ini
// benar2 ke-assign ke akun asli (created_by terisi), baris ini otomatis
// pakai nama asli tsb (cabang pertama menang duluan).
function resolveCreatorName(r, meta) {
  const real = meta?.profileMap?.[r.created_by];
  if (real) return real;
  if (r?.plan_source !== "cms_import") return null;
  const branchName = meta?.branchMap?.[r.branch_id];
  if (!branchName) return null;
  const key = `${String(r.brand || "").toLowerCase()}|${branchName.toUpperCase()}`;
  return meta?.bmeAssignMap?.[key] || null;
}

function getIncompleteImportFields(r, meta) {
  const missing = [];
  if (!r.mc) missing.push({ key: "mc", label: "Micro Cluster" });
  const siteMeta = meta?.siteMetaMap?.[r.site_id];
  if (!siteMeta?.kabupaten) missing.push({ key: "kabupaten", label: "Kabupaten" });
  if (!siteMeta?.kecamatan) missing.push({ key: "kecamatan", label: "Kecamatan" });
  if (!resolveCreatorName(r, meta)) missing.push({ key: "creator", label: "BME/RGE" });
  if (!r.event_category) missing.push({ key: "eventCategory", label: "Event Category" });
  if (!r.poi_type) missing.push({ key: "poi", label: "POI" });
  if (!r.network_category) missing.push({ key: "network", label: "Network Category" });
  if (!r.area_potential) missing.push({ key: "areaPotential", label: "Area Potential" });
  if (!(Number(r.target_sp) > 0) && !(Number(r.target_fwa) > 0)) missing.push({ key: "target", label: "Target SP / Target FWA" });
  if (!(Number(r.cost_estimate) > 0)) missing.push({ key: "costEstimate", label: "Cost Estimate" });
  return missing;
}

function deriveStatusInfo(r, meta) {
  // Data hasil Import Excel (Backdoor) lolos validasi MINIMAL saat import
  // (lihat mh_import_plan_batch - cuma cek event_name/brand/plan_date/
  // network_category/area_potential/site_id), TAPI itu tidak berarti semua
  // kolom mandatory plan sudah terisi lengkap - kolom lain (target SP/FWA,
  // BME/RGE dari User Management, Kabupaten/Kecamatan dari mapping Site ID,
  // Micro Cluster) bisa saja masih kosong krn cell Excel-nya memang kosong
  // atau master data pendukungnya (assignment BME/RGE, mapping site) belum
  // lengkap. Cek SEMUA kolom mandatory itu di sini & tandai "Belum Lengkap"
  // kalau ada yg masih kosong - TIMPA status lifecycle lain, walau data itu
  // sendiri tadinya dianggap valid & lolos saat proses import.
  if (r?.plan_source === "cms_import" && meta) {
    if (getIncompleteImportFields(r, meta).length > 0) return ["Belum Lengkap", T.warning, T.warningBg];
  }
  // "revision_needed" digabung (dulu status terpisah "revision_actual") -
  // bedanya plan/actual sekarang ditandai kolom revision_target.
  if (r?.status === "revision_needed" && r?.revision_target === "actual") {
    return ["Laporan Actual Perlu Direvisi", T.warning, T.warningBg];
  }
  if (r?.status === "completed") {
    if (r?.actual_sp != null) return ["Selesai", T.success, T.successBg];
    const planDateStr = r.plan_date_start || r.plan_date;
    if (planDateStr) {
      const now = new Date();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const planDate = new Date(planDateStr.slice(0, 10)); planDate.setHours(0, 0, 0, 0);
      const diffDays = Math.round((today - planDate) / 86400000);
      if (diffDays < 0) return ["Menunggu Hari-H", T.blue, T.blueBg];
      if (diffDays === 0) {
        // Seharian/jam tidak lengkap -> tetap "Berlangsung" sampai
        // 00.00 (baru ganti besok, lewat cabang diffDays > 0 di bawah).
        // Kalau ada jam selesai spesifik, begitu SEKARANG lewat jam
        // selesai itu, langsung "Menunggu Laporan" - tanpa nunggu hari
        // berganti.
        const et = (r.end_time || "").slice(0, 5);
        if (r.is_all_day === false && et) {
          const eventEnd = new Date(`${planDateStr.slice(0, 10)}T${et}:00`);
          if (!Number.isNaN(eventEnd.getTime()) && now > eventEnd) return ["Menunggu Laporan", T.error, T.errorBg];
        }
        return ["Hari-H / Berlangsung", T.warning, T.warningBg];
      }
      return ["Menunggu Laporan", T.error, T.errorBg];
    }
  }
  return STATUS[r?.status] || [r?.status, T.mid, "#eef1f6"];
}

const fmtDate = (s) => {
  if (!s || s.length < 10) return "-";
  const [y, m, d] = s.slice(0, 10).split("-");
  const mo = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"][(+m || 1) - 1];
  return `${d} ${mo} ${y}`;
};
// Ubah string "date" dari Postgres (YYYY-MM-DD, tanpa jam/zona) jadi JS Date
// LOKAL murni (bukan lewat `new Date("YYYY-MM-DD")` yg oleh browser diparse
// sbg UTC tengah malam - kalau lokal timezone-nya di depan UTC (WIB=UTC+7)
// itu bisa bikin tanggal mundur 1 hari pas ditulis ke sel Excel). Dipakai
// khusus utk export xlsx supaya kolom Plan Date/Actual Date jadi sel Excel
// bertipe DATE asli (bisa di-sort/filter as date), bukan teks.
function dateOnlyToJsDate(s) {
  if (!s || String(s).length < 10) return null;
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
const fmtInt = (n) => (n == null ? "-" : Number(n).toLocaleString("id-ID"));
// Label seragam utk kolom bertipe "tag" (POI, Event Category, Network Category):
// SEMUA HURUF BESAR, underscore diganti spasi (bukan "urban_area" tapi "URBAN AREA").
const fmtTag = (s) => (s ? String(s).replace(/_/g, " ").toUpperCase() : "-");
const unsnake = (s) => (s ? String(s).split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : "-");

// Badge brand - SOLID & "pop", bukan teks warna transparan spt sebelumnya:
// IM3 = kuning solid + teks HITAM (kontras tinggi, sesuai identitas IM3),
// 3ID = magenta solid + teks putih. Dipakai di kolom Brand tabel & header
// modal detail supaya brand langsung kebaca sekilas dari jauh.
function BrandBadge({ brand }) {
  if (!brand) return <span style={{ color: T.lo }}>-</span>;
  const isTri = String(brand).toLowerCase() === "tri";
  const bg = isTri ? "#E6007E" : "#FFC700";
  const fg = isTri ? "#fff" : "#1A1300";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", fontSize: 10.5, fontWeight: 800,
      color: fg, background: bg, padding: "3px 9px", borderRadius: 7, letterSpacing: "0.02em",
    }}>
      {brandLabel(brand)}
    </span>
  );
}
const fmtRp = (n) => (n == null ? "-" : `Rp${Number(n).toLocaleString("id-ID")}`);
// Versi ringkas (K/Mn/Bn) - dipakai KHUSUS utk pasangan "Actual / Plan" di
// KpiSubRow yg sempit (kartu KPI minmax 172px) - fmtRp() penuh gampang
// kepanjangan begitu 2 angka Rupiah disandingkan dlm 1 baris ("Rp1.575.000
// / Rp1.410.000" pasti wrap/kepotong), jadi diringkas begitu >= ribuan.
const fmtRpCompact = (n) => {
  if (n == null) return "-";
  const v = Number(n) || 0;
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${sign}Rp${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}Bn`;
  if (abs >= 1_000_000) return `${sign}Rp${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}Mn`;
  if (abs >= 1_000) return `${sign}Rp${(abs / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${sign}Rp${abs}`;
};
const rebuySum = (a, b) => { const x = Number(a || 0) + Number(b || 0); return x || null; };
const pctVal = (actual, target) => (!target ? null : (Number(actual || 0) / Number(target)) * 100);
const pctLabel = (actual, target) => { const v = pctVal(actual, target); return v == null ? "-" : `${Math.round(v)}%`; };
const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const monthLabel = (dateStr) => {
  if (!dateStr || dateStr.length < 7) return "-";
  const [y, m] = dateStr.slice(0, 7).split("-");
  return `${MONTHS_ID[(+m || 1) - 1]} ${y}`;
};

// Bucket foto POSM/aktivitas - SAMA PERSIS dgn pola yg sudah dipakai
// app/martahub/approval/page.jsx (mdPhotoUrl) - bucket publik, jadi cukup
// getPublicUrl langsung tanpa proxy otentikasi spt di mobile.
const PHOTO_BUCKET = "mh-photos";
function photoUrl(path) {
  return supabaseMarta.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

const DETAIL_COLS = "id,event_name,event_category,event_categories,brand,mc,branch_id,site_id,plan_date,plan_date_start,plan_date_end,plan_dates_multi,is_all_day,start_time,end_time,poi_type,network_category,area_potential,address,latitude,longitude,status,target_sp,target_fwa,target_rebuy_sp,target_rebuy_fwa,target_rev_3m,cost_estimate,expected_outcome,actual_sp,actual_fwa,actual_rebuy_sp,actual_rebuy_fwa,actual_rev_3m,cost_actual,insight,checkin_valid,checkin_distance,checkin_at,approved_by_name,approved_by_email,approved_at,approval_notes,validation_status,validation_note,validated_at,override_status,override_by_name,override_at,override_note,created_at";

// Kolom list mh_activities untuk tabel Excel-style di bawah - lebih ringkas
// dari DETAIL_COLS (dipakai modal) tapi mencakup semua field yg diminta utk
// tabel Activity Plan (target/actual/ACV/cost ratio/insight/dokumentasi).
const LIST_COLS = "id,event_name,brand,mc,branch_id,event_categories,event_category,plan_date_start,plan_date,actual_date,site_id,actual_site_id,network_category,area_potential,poi_type,address,latitude,longitude,status,revision_target,target_sp,target_fwa,target_rebuy_sp,target_rebuy_fwa,target_rev_3m,cost_estimate,actual_sp,actual_fwa,actual_rebuy_sp,actual_rebuy_fwa,actual_rev_3m,cost_actual,insight,checkin_valid,created_by,bme_user_id,created_at,plan_source,import_batch_id";

export default function ActivityPlanPage() {
  return (
    <MartaShell active="activities" title="Activity Plan" subtitle="Rencana, submission, & monitoring aktivitas - satu tempat, dari plan sampai selesai.">
      {(ctx) => <Body email={ctx?.session?.user?.email} />}
    </MartaShell>
  );
}

function Body({ email }) {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [branchMap, setBranchMap] = useState({});
  // site_id -> { kabupaten, kecamatan } dari mh_sites - Kecamatan/Kabupaten
  // TIDAK PERNAH tersimpan di mh_activities (di SELURUH sistem ini, bukan
  // cuma data import), selalu di-lookup live via Site ID persis spt yg
  // sudah dipakai daftar activities mobile (app/martahub/m/activities/page.jsx).
  const [siteMetaMap, setSiteMetaMap] = useState({});
  const [profileMap, setProfileMap] = useState({});
  // Assignment BME/RGE SEKARANG (User Management) - key `${brand}|${BRANCH}`,
  // dipakai resolveCreatorName() sbg fallback tampilan utk baris Import
  // Excel yg belum ke-assign ke akun login asli. Lihat catatan di
  // resolveCreatorName().
  const [bmeAssignMap, setBmeAssignMap] = useState({});
  const [docCountMap, setDocCountMap] = useState({});
  const [docPhotoMap, setDocPhotoMap] = useState({}); // activity_id -> storage_path foto pertama (utk thumbnail export)
  const [docDriveMap, setDocDriveMap] = useState({}); // activity_id -> Google Drive file id foto pertama (mh_documents.external_ref, diisi Edge Function media-relay) - utk link "Buka di Drive" saat export .xlsx
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [scope, setScope] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [colFilters, setColFilters] = useState({});
  const [sortState, setSortState] = useState({ key: null, dir: "asc" });
  const [lbMap, setLbMap] = useState({}); // user_id -> { achievement_pct, productivity_pct }
  const [showKpiConfig, setShowKpiConfig] = useState(false);
  // ── Rollback Import (Backdoor) - lihat COLUMNS "sumber"/"uploadDate"/
  //    "uploadFile" & toolbar rollback di bawah tabel. batchMap: import_batch_id
  //    -> {filename, sheet_name, created_at} dari mh_plan_import_batches,
  //    dipakai utk kolom "Tanggal Upload"/"File Upload" & filternya.
  const [batchMap, setBatchMap] = useState({});
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [rollbackBusy, setRollbackBusy] = useState(false);
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);
  const [rollbackErr, setRollbackErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const sc = email ? await getMartaScope(email) : null;
      setScope(sc);
      let query = supabaseMarta
        .from("mh_activities")
        .select(LIST_COLS)
        .order("created_at", { ascending: false })
        .limit(1000);
      query = await applyMartaScope(query, sc);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const list = data || [];
      setRows(list);

      // site_id unik dari rows yg baru dimuat - dipakai batasi query mh_sites
      // (bisa 25rb+ baris, jangan tarik semuanya) ke site_id yg BENAR2
      // dipakai activity plan saat ini saja.
      const siteIds = [...new Set(list.map((r) => r.site_id).filter(Boolean))];

      const [{ data: branches }, { data: profiles }, { data: bmeAssignRows }, { data: lbRows }, { data: batches }, { data: sites }] = await Promise.all([
        supabaseMarta.from("mh_branches").select("id, name"),
        supabaseMarta.from("mh_profiles").select("id, full_name"),
        // Assignment BME/RGE aktif (User Management) - TERPISAH dari query
        // profiles di atas krn butuh brand/branch_name/valid_from, & dipakai
        // resolveCreatorName() sbg fallback nama utk baris Import Excel yg
        // belum ke-assign ke akun login asli (lihat catatan di fungsi itu).
        supabaseMarta.from("mh_profiles").select("full_name, brand, branch_name, valid_from")
          .eq("role", "bme_rge").eq("is_active", true).not("branch_name", "is", null),
        supabaseMarta.from("mh_leaderboard_summary").select("user_id, achievement_pct, productivity_pct"),
        supabaseMarta.rpc("mh_list_import_batches"),
        // CMS TIDAK punya sesi auth Supabase asli (lihat martaScope.js) jadi
        // auth.uid() selalu null di sini - query LANGSUNG ke mh_sites diam2
        // balik 0 baris krn policy mh_sites_read butuh auth.uid(). Pakai RPC
        // SECURITY DEFINER (mh_sites_lookup) supaya bypass RLS itu, sama pola
        // dgn RPC2 lain di CMS.
        siteIds.length ? supabaseMarta.rpc("mh_sites_lookup", { p_site_ids: siteIds }) : Promise.resolve({ data: [] }),
      ]);
      setBranchMap(Object.fromEntries((branches || []).map((b) => [b.id, b.name])));
      setProfileMap(Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name])));
      // Kalau satu branch+brand kebetulan py >1 assignment aktif, ambil yg
      // valid_from PALING BARU (konsisten dgn urutan RPC mh_import_plan_batch
      // sendiri: "order by p.valid_from desc nulls last limit 1").
      {
        const byKey = {};
        for (const p of bmeAssignRows || []) {
          const key = `${String(p.brand || "").toLowerCase()}|${String(p.branch_name || "").toUpperCase()}`;
          const prevDate = byKey[key]?.valid_from;
          if (!byKey[key] || (p.valid_from || "") > (prevDate || "")) byKey[key] = p;
        }
        setBmeAssignMap(Object.fromEntries(Object.entries(byKey).map(([k, p]) => [k, p.full_name])));
      }
      setLbMap(Object.fromEntries((lbRows || []).map((l) => [l.user_id, l])));
      setBatchMap(Object.fromEntries((batches || []).map((b) => [b.id, b])));
      // Satu site_id bisa punya BANYAK baris mh_sites (beda mc, dst - lihat
      // lib/martaPlanImport.js) - ambil yg kabupaten/kecamatan-nya TERISI
      // duluan drpd baris kosong, bukan asal ambil baris pertama.
      const siteMeta = {};
      for (const s of sites || []) {
        const kec = s.kecamatan_name || s.kecamatan || null;
        if (!siteMeta[s.site_id] || (!siteMeta[s.site_id].kecamatan && kec)) {
          siteMeta[s.site_id] = { kabupaten: s.kabupaten || null, kecamatan: kec };
        }
      }
      setSiteMetaMap(siteMeta);

      const ids = list.map((r) => r.id);
      if (ids.length) {
        const { data: docs } = await supabaseMarta.from("mh_documents").select("activity_id, file_type, storage_path, external_ref, created_at").in("activity_id", ids).eq("file_type", "photo").order("created_at");
        const counts = {};
        const firstPhoto = {};
        const firstDrive = {};
        (docs || []).forEach((d) => {
          counts[d.activity_id] = (counts[d.activity_id] || 0) + 1;
          if (!firstPhoto[d.activity_id]) firstPhoto[d.activity_id] = d.storage_path;
          // external_ref = Google Drive file id (diisi async oleh Edge Function
          // media-relay setelah foto berhasil di-mirror ke Drive) - bisa null
          // kalau mirror-nya gagal/belum jalan, makanya diambil per-baris (bukan
          // cuma dari foto pertama yg storage_path-nya kepakai utk thumbnail).
          if (!firstDrive[d.activity_id] && d.external_ref) firstDrive[d.activity_id] = d.external_ref;
        });
        setDocCountMap(counts);
        setDocPhotoMap(firstPhoto);
        setDocDriveMap(firstDrive);
      } else {
        setDocCountMap({});
        setDocPhotoMap({});
        setDocDriveMap({});
      }
    } catch (e) { setErr(e.message || "Gagal memuat"); }
    finally { setLoading(false); }
  }, [email]);
  useEffect(() => { load(); }, [load]);

  const cats = useCallback((r) => {
    const arr = Array.isArray(r.event_categories) && r.event_categories.length ? r.event_categories : (r.event_category ? [r.event_category] : []);
    if (!arr.length) return "-";
    return arr.map((c) => fmtTag(CAT_LABEL[c] || c)).join(", ");
  }, []);

  // ── Definisi kolom - SATU sumber utk header, filter (kolom berlabel
  //    filter:true dapat dropdown ExcelFilter Excel-style), sort, dan render
  //    sel. Urutan PERSIS sesuai daftar kolom yang diminta. ─────────────────
  // Hanya SPM Sumatera / Admin yg bisa rollback (sama dgn role yg diizinkan
  // Import Plan itu sendiri, lihat _mh_import_authorize di RPC) - checkbox
  // pilih & toolbar rollback disembunyikan sama sekali dari role lain.
  const canRollback = scope?.role === "spm_sumatera" || scope?.role === "admin";
  const COLUMNS = useMemo(() => [
    ...(canRollback ? [{ key: "pilih", label: "", width: 34 }] : []),
    { key: "no", label: "No.", width: 46 },
    { key: "sumber", label: "Sumber Data", width: 150, filter: true, get: (r) => (r.plan_source === "cms_import" ? "Import Excel (Backdoor)" : "Manual (CMS/Mobile)") },
    { key: "uploadDate", label: "Tgl Upload Backdoor", width: 140, filter: true,
      get: (r) => (r.plan_source === "cms_import" ? fmtDate(batchMap[r.import_batch_id]?.created_at || r.created_at) : "-"),
      sortVal: (r) => (r.plan_source === "cms_import" ? (batchMap[r.import_batch_id]?.created_at || r.created_at || "") : "") },
    { key: "status", label: "Status", width: 150, filter: true, get: (r) => deriveStatusInfo(r, { profileMap, siteMetaMap, bmeAssignMap, branchMap })[0], badgeStatus: true },
    { key: "month", label: "Month", width: 118, filter: true, get: (r) => monthLabel(r.plan_date_start || r.plan_date) },
    { key: "brand", label: "Brand", width: 66, filter: true, get: (r) => brandLabel(r.brand), badgeBrand: true },
    { key: "branch", label: "Branch", width: 140, filter: true, get: (r) => branchMap[r.branch_id] || "-" },
    { key: "brandBranch", label: "Brand Branch", width: 160, filter: true, get: (r) => `${brandLabel(r.brand)} - ${branchMap[r.branch_id] || "-"}` },
    { key: "mc", label: "Micro Cluster", width: 120, filter: true, get: (r) => r.mc || "-" },
    { key: "kabupaten", label: "Kabupaten", width: 150, filter: true, get: (r) => siteMetaMap[r.site_id]?.kabupaten || "-" },
    { key: "kecamatan", label: "Kecamatan", width: 150, filter: true, get: (r) => siteMetaMap[r.site_id]?.kecamatan || "-" },
    { key: "creator", label: "BME/RGE", width: 150, filter: true, get: (r) => resolveCreatorName(r, { profileMap, bmeAssignMap, branchMap }) || "-" },
    { key: "planDate", label: "Plan Date", width: 100, filter: true, get: (r) => fmtDate(r.plan_date_start || r.plan_date), sortVal: (r) => r.plan_date_start || r.plan_date || "", raw: (r) => dateOnlyToJsDate(r.plan_date_start || r.plan_date), date: true },
    { key: "actualDate", label: "Actual Date", width: 100, filter: true, get: (r) => fmtDate(r.actual_date), sortVal: (r) => r.actual_date || "", raw: (r) => dateOnlyToJsDate(r.actual_date), date: true },
    { key: "eventCategory", label: "Event Category", width: 160, filter: true, get: (r) => cats(r) },
    { key: "network", label: "Network Category", width: 130, filter: true, get: (r) => unsnake(r.network_category) },
    { key: "eventName", label: "Event Name", width: 230, filter: true, get: (r) => r.event_name || "-" },
    { key: "areaPotential", label: "Area Potential", width: 120, filter: true, get: (r) => unsnake(r.area_potential) },
    { key: "siteId", label: "Site Plan", width: 100, filter: true, get: (r) => r.site_id || "-" },
    { key: "actualSiteId", label: "Site Actual", width: 100, filter: true, get: (r) => r.actual_site_id || "-" },
    { key: "long", label: "Long", width: 90, filter: true, get: (r) => (r.longitude != null ? String(r.longitude) : "-"), raw: (r) => r.longitude, numeric: true },
    { key: "lat", label: "Lat", width: 90, filter: true, get: (r) => (r.latitude != null ? String(r.latitude) : "-"), raw: (r) => r.latitude, numeric: true },
    { key: "poi", label: "POI", width: 110, filter: true, get: (r) => unsnake(r.poi_type) },
    { key: "address", label: "Address", width: 240, filter: true, get: (r) => r.address || "-" },
    { key: "targetSp", label: "Target SP", width: 92, filter: true, get: (r) => fmtInt(r.target_sp), raw: (r) => r.target_sp, numeric: true },
    { key: "targetFwa", label: "Target FWA", width: 96, filter: true, get: (r) => fmtInt(r.target_fwa), raw: (r) => r.target_fwa, numeric: true },
    { key: "targetRebuy", label: "Target Rebuy", width: 110, filter: true, get: (r) => fmtRp(rebuySum(r.target_rebuy_sp, r.target_rebuy_fwa)), raw: (r) => rebuySum(r.target_rebuy_sp, r.target_rebuy_fwa), numeric: true },
    { key: "targetRev", label: "Est. Total Rev (3 Months)", width: 170, filter: true, get: (r) => fmtRp(r.target_rev_3m), raw: (r) => r.target_rev_3m, numeric: true },
    { key: "costEstimate", label: "Cost Estimate", width: 120, filter: true, get: (r) => fmtRp(r.cost_estimate), raw: (r) => r.cost_estimate, numeric: true },
    { key: "actualSp", label: "Actual SP", width: 92, filter: true, get: (r) => fmtInt(r.actual_sp), raw: (r) => r.actual_sp, numeric: true },
    { key: "actualFwa", label: "Actual FWA", width: 96, filter: true, get: (r) => fmtInt(r.actual_fwa), raw: (r) => r.actual_fwa, numeric: true },
    { key: "actualRebuy", label: "Actual Rebuy", width: 110, filter: true, get: (r) => fmtRp(rebuySum(r.actual_rebuy_sp, r.actual_rebuy_fwa)), raw: (r) => rebuySum(r.actual_rebuy_sp, r.actual_rebuy_fwa), numeric: true },
    { key: "actualRev", label: "Actual Total Rev (3 Months)", width: 170, filter: true, get: (r) => fmtRp(r.actual_rev_3m), raw: (r) => r.actual_rev_3m, numeric: true },
    { key: "costActual", label: "Cost Actual", width: 120, filter: true, get: (r) => fmtRp(r.cost_actual), raw: (r) => r.cost_actual, numeric: true },
    { key: "acvSp", label: "ACV SP", width: 84, filter: true, get: (r) => pctLabel(r.actual_sp, r.target_sp), raw: (r) => pctVal(r.actual_sp, r.target_sp), numeric: true, acv: true },
    { key: "acvFwa", label: "ACV FWA", width: 84, filter: true, get: (r) => pctLabel(r.actual_fwa, r.target_fwa), raw: (r) => pctVal(r.actual_fwa, r.target_fwa), numeric: true, acv: true },
    { key: "acvRebuy", label: "ACV Rebuy", width: 92, filter: true, get: (r) => pctLabel(rebuySum(r.actual_rebuy_sp, r.actual_rebuy_fwa), rebuySum(r.target_rebuy_sp, r.target_rebuy_fwa)), raw: (r) => pctVal(rebuySum(r.actual_rebuy_sp, r.actual_rebuy_fwa), rebuySum(r.target_rebuy_sp, r.target_rebuy_fwa)), numeric: true, acv: true },
    { key: "costRatio", label: "Cost Ratio", width: 92, filter: true, get: (r) => pctLabel(r.cost_actual, r.cost_estimate), raw: (r) => pctVal(r.cost_actual, r.cost_estimate), numeric: true, acv: true, invertGood: true },
    { key: "insight", label: "Insight (Optional)", width: 220, filter: true, get: (r) => r.insight || "-" },
    { key: "documentation", label: "Documentation", width: 120, filter: true, get: (r) => (docCountMap[r.id] ? `${docCountMap[r.id]} foto` : "-") },
    { key: "drive_link", label: "Link Google Drive", width: 140, get: (r) => (docDriveMap[r.id] ? "Buka di Drive" : "-") },
  ], [branchMap, profileMap, bmeAssignMap, docCountMap, cats, batchMap, canRollback, siteMetaMap]);

  const FILTER_COLS = useMemo(() => COLUMNS.filter((c) => c.filter), [COLUMNS]);

  const term = q.trim().toLowerCase();
  const searchFiltered = useMemo(() => {
    if (!term) return rows;
    return rows.filter((r) =>
      (r.event_name || "").toLowerCase().includes(term) ||
      (r.mc || "").toLowerCase().includes(term) ||
      (r.site_id || "").toLowerCase().includes(term) ||
      (r.address || "").toLowerCase().includes(term) ||
      (branchMap[r.branch_id] || "").toLowerCase().includes(term) ||
      (resolveCreatorName(r, { profileMap, bmeAssignMap, branchMap }) || "").toLowerCase().includes(term)
    );
  }, [rows, term, branchMap, profileMap, bmeAssignMap]);

  // ── Chained faceted filter options - utk tiap kolom filter, opsi dihitung
  //    dari data yg SUDAH terfilter oleh kolom filter LAIN (bukan dirinya
  //    sendiri) + pencarian teks. Persis prinsip yg dipakai ExcelFilter di
  //    SandraHub (PNL_ControlCenter): pilihan yg ditampilkan selalu relevan
  //    dgn kombinasi filter aktif saat ini, bukan daftar statis semua data. */
  const filterOptionsMap = useMemo(() => {
    const map = {};
    for (const col of FILTER_COLS) {
      let list = searchFiltered;
      for (const oc of FILTER_COLS) {
        if (oc.key === col.key) continue;
        const sel = colFilters[oc.key];
        if (sel && sel.length) list = list.filter((r) => sel.includes(oc.get(r)));
      }
      const uniq = [...new Set(list.map(col.get).filter((v) => v && v !== "-"))].sort((a, b) => String(a).localeCompare(String(b), "id"));
      map[col.key] = uniq.map((v) => ({ value: v, label: String(v) }));
    }
    return map;
  }, [FILTER_COLS, searchFiltered, colFilters]);

  const filteredRows = useMemo(() => {
    let list = searchFiltered;
    for (const col of FILTER_COLS) {
      const sel = colFilters[col.key];
      if (sel && sel.length) list = list.filter((r) => sel.includes(col.get(r)));
    }
    if (sortState.key) {
      const col = COLUMNS.find((c) => c.key === sortState.key);
      if (col) {
        const valFn = col.raw || col.sortVal || col.get;
        const dir = sortState.dir === "asc" ? 1 : -1;
        list = [...list].sort((a, b) => {
          const av = valFn(a), bv = valFn(b);
          if (typeof av === "number" || typeof bv === "number") return dir * ((av ?? -Infinity) - (bv ?? -Infinity));
          return dir * String(av ?? "").localeCompare(String(bv ?? ""), "id");
        });
      }
    }
    return list;
  }, [searchFiltered, colFilters, sortState, FILTER_COLS, COLUMNS]);

  // ── Ringkasan KPI + status quick-filter (menggantikan menu terpisah
  //    "Activity Monitoring" & "Activity Submission" - keduanya cuma
  //    potongan/tampilan lain dari tabel mh_activities yang sama ini, jadi
  //    disatukan langsung di sini: pantauan cepat DAN detail per baris ada
  //    di satu tempat). Dihitung dari filteredRows supaya ikut mengikuti
  //    filter/pencarian yang sedang aktif. ─────────────────────────────────
  const kpiStats = useMemo(() => {
    const total = filteredRows.length;

    // Achievement & Productivity - rata-rata dari mh_leaderboard_summary
    // (dihitung server-side dari bobot mh_settings.leaderboard_weights),
    // discope ke BME/RGE yang punya activity di filteredRows saat ini.
    const bmeIds = Array.from(new Set(filteredRows.map((r) => r.bme_user_id).filter(Boolean)));
    const lbEntries = bmeIds.map((id) => lbMap[id]).filter(Boolean);
    const avgAchievement = lbEntries.length
      ? lbEntries.reduce((s, e) => s + (Number(e.achievement_pct) || 0), 0) / lbEntries.length
      : null;
    const avgProductivity = lbEntries.length
      ? lbEntries.reduce((s, e) => s + (Number(e.productivity_pct) || 0), 0) / lbEntries.length
      : null;

    // "Pengajuan" = target yg diajukan BME saat plan; "Tervalidasi" = actual
    // yg sudah direalisasikan/tervalidasi saat laporan disubmit. Ditampilkan
    // sbg ANGKA TOTAL (bukan %) sesuai permintaan - lebih mudah dibaca cepat.
    const sumPair = (tKey, aKey) => {
      const withTarget = filteredRows.filter((r) => r[tKey]);
      const tgt = withTarget.reduce((s, r) => s + (r[tKey] ?? 0), 0);
      const act = withTarget.reduce((s, r) => s + (r[aKey] ?? 0), 0);
      return { tgt, act, n: withTarget.length };
    };
    const sp = sumPair("target_sp", "actual_sp");
    const fwa = sumPair("target_fwa", "actual_fwa");

    // Rebuy SP & FWA DIPISAH (bukan digabung jadi satu angka) - dulu
    // "actualRebuy" gabungan ini dipakai utk SUB-ROW "Rebuy SP" maupun
    // "Rebuy FWA" sekaligus, jadi keduanya salah nampilin angka gabungan yg
    // sama persis, bukan porsi masing-masing.
    const actualRebuySp = filteredRows.reduce((s, r) => s + (r.actual_rebuy_sp ?? 0), 0);
    const targetRebuySp = filteredRows.reduce((s, r) => s + (r.target_rebuy_sp ?? 0), 0);
    const actualRebuyFwa = filteredRows.reduce((s, r) => s + (r.actual_rebuy_fwa ?? 0), 0);
    const targetRebuyFwa = filteredRows.reduce((s, r) => s + (r.target_rebuy_fwa ?? 0), 0);
    const actualRebuy = actualRebuySp + actualRebuyFwa;
    const actualRev3m = filteredRows.reduce((s, r) => s + (r.actual_rev_3m ?? 0), 0);
    const targetRev3m = filteredRows.reduce((s, r) => s + (r.target_rev_3m ?? 0), 0);
    const totalCostActual = filteredRows.reduce((s, r) => s + (r.cost_actual ?? 0), 0);
    const totalCostEstimate = filteredRows.reduce((s, r) => s + (r.cost_estimate ?? 0), 0);

    const withBudget = filteredRows.filter((r) => r.cost_estimate);
    const budgetEst = withBudget.reduce((s, r) => s + (r.cost_estimate ?? 0), 0);
    const budgetAct = withBudget.reduce((s, r) => s + (r.cost_actual ?? 0), 0);
    const costRatioPct = budgetEst > 0 ? Math.round((budgetAct / budgetEst) * 100) : null;

    const actualSubmittedCount = filteredRows.filter((r) => r.actual_date).length;

    return {
      total,
      spTervalidasi: sp.act, spPengajuan: sp.tgt,
      fwaTervalidasi: fwa.act, fwaPengajuan: fwa.tgt,
      actualRebuy, actualRebuySp, targetRebuySp, actualRebuyFwa, targetRebuyFwa, actualRev3m, targetRev3m, totalCostActual, totalCostEstimate, budgetEst,
      costRatioPct, costOverBudget: budgetAct > budgetEst,
      actualSubmittedCount,
      avgAchievement, avgProductivity,
    };
  }, [filteredRows, lbMap]);

  const statusStatusCounts = useMemo(() => {
    const m = new Map();
    for (const r of rows) { const lbl = deriveStatusInfo(r, { profileMap, siteMetaMap, bmeAssignMap, branchMap })[0]; m.set(lbl, (m.get(lbl) || 0) + 1); }
    return m;
  }, [rows, profileMap, siteMetaMap, bmeAssignMap, branchMap]);
  const statusChips = useMemo(() => Array.from(statusStatusCounts.keys()), [statusStatusCounts]);
  const selectedStatuses = colFilters.status || [];
  const toggleStatusChip = (lbl) => {
    setColFilters((p) => {
      const cur = p.status || [];
      const next = cur.includes(lbl) ? cur.filter((v) => v !== lbl) : [...cur, lbl];
      const n = { ...p };
      if (next.length) n.status = next; else delete n.status;
      return n;
    });
  };

  const activeFilterCount = Object.values(colFilters).reduce((n, v) => n + (v?.length ? 1 : 0), 0);
  const hasAnyFilter = activeFilterCount > 0 || !!term;
  const clearAllFilters = () => { setColFilters({}); setQ(""); setSortState({ key: null, dir: "asc" }); };
  const [searchFocus, setSearchFocus] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);

  // ── Saran pencarian - dibangun dari nilai unik yg SUDAH ada di data
  //    (event, branch, MC, BME/RGE, site, alamat - field yg sama persis dgn
  //    yg dicocokkan searchFiltered di atas), difilter oleh ketikan saat
  //    ini, maks 8 item, tanpa duplikat. ─────────────────────────────────
  const searchSuggestions = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const pool = [];
    for (const r of rows) {
      if (r.event_name) pool.push({ label: r.event_name, kind: "Event" });
      const branch = branchMap[r.branch_id];
      if (branch) pool.push({ label: branch, kind: "Branch" });
      if (r.mc) pool.push({ label: r.mc, kind: "MC" });
      const creator = resolveCreatorName(r, { profileMap, bmeAssignMap, branchMap });
      if (creator) pool.push({ label: creator, kind: "BME/RGE" });
      if (r.site_id) pool.push({ label: r.site_id, kind: "Site" });
      if (r.address) pool.push({ label: r.address, kind: "Alamat" });
    }
    const seen = new Set();
    const out = [];
    for (const item of pool) {
      const key = `${item.kind}:${item.label}`;
      if (seen.has(key)) continue;
      if (!item.label.toLowerCase().includes(term)) continue;
      if (item.label.toLowerCase() === term) continue; // sudah persis diketik, tak perlu disarankan
      seen.add(key);
      out.push(item);
      if (out.length >= 8) break;
    }
    return out;
  }, [q, rows, branchMap, profileMap, bmeAssignMap]);

  // ── Export .xlsx - PERSIS mengikuti hasil filter yang sedang aktif
  //    (search + semua kolom filter + urutan sort), bukan seluruh data
  //    mentah. Kolom numerik/ACV diekspor sbg angka (bukan teks "Rp…"/"%")
  //    supaya bisa langsung dipakai rumus di Excel.
  //    Catatan (2026-09):
  //    - Long/Lat DULU dibulatkan 2 desimal spt kolom uang/ACV lain -> data
  //      GPS jadi keliru sampai ratusan meter. Sekarang diekspor APA ADANYA
  //      (presisi penuh), tidak lewat pembulatan generik.
  //    - Kolom Documentation DULU cuma teks "N foto". Sekarang foto PERTAMA
  //      tiap activity di-embed langsung sbg thumbnail di sel-nya (pakai
  //      ExcelJS, bukan lib `xlsx` yg tidak bisa taruh gambar di cell) -
  //      supaya kelihatan langsung tanpa buka link satu-satu.
  const exportXlsx = useCallback(async () => {
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();

      // ── Palet warna & number format export - SATU sumber dipakai sheet
      //    Summary & Activity Plan, biar konsisten & gampang diubah sekali
      //    tempat. Warna header ikut brand MartaHub (T.primary/T.blue di
      //    MartaShell.jsx), bukan asal pilih.
      const XLSX_HEADER_FILL = "FFED1C24"; // brand MartaHub (T.primary)
      const XLSX_HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      const XLSX_SUBHEADER_FILL = "FF1565C0"; // brand blue (T.blue) - header sub-tabel Summary
      const XLSX_SUBHEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" } };
      const XLSX_TOTAL_FILL = "FFE3E8F0"; // T.line - baris "Total Keseluruhan"
      const XLSX_ZEBRA_FILL = "FFF7F9FC"; // banding baris genap - sangat halus, tidak ganggu baca
      const XLSX_BORDER_COLOR = "FFD7DCE5";
      const XLSX_THIN_BORDER = {
        top: { style: "thin", color: { argb: XLSX_BORDER_COLOR } },
        left: { style: "thin", color: { argb: XLSX_BORDER_COLOR } },
        bottom: { style: "thin", color: { argb: XLSX_BORDER_COLOR } },
        right: { style: "thin", color: { argb: XLSX_BORDER_COLOR } },
      };
      // ACV (Actual/Target %) - hijau tercapai, kuning mendekati, merah jauh
      // dari target. costRatio dibalik (invertGood): makin RENDAH makin
      // bagus (cost aktual di bawah estimasi), jadi threshold-nya dibalik.
      const acvColor = (pct, invertGood) => {
        if (pct == null || Number.isNaN(pct)) return null;
        const good = invertGood ? pct <= 100 : pct >= 100;
        const warn = invertGood ? pct <= 120 : pct >= 80;
        if (good) return { fill: "FFE8F5E9", font: "FF2E7D32" }; // T.success/successBg
        if (warn) return { fill: "FFFFFDE7", font: "FF9A6B00" }; // T.warning/warningBg (font digelapkan dikit spy kebaca di atas fill terang)
        return { fill: "FFFFEBEE", font: "FFC62828" }; // T.error/errorBg
      };
      const RP_FMT = '"Rp"#,##0;[Red]-"Rp"#,##0';
      const INT_FMT = "#,##0";
      const GPS_FMT = "0.000000";
      const PCT_FMT = "0.0%";
      const DATE_FMT = "dd/mm/yyyy"; // format Short Date Excel standar - sel tetap angka/date asli, cuma tampilannya, jadi user masih bebas ganti format tanggalnya sendiri di Excel kapan saja
      // Kolom mana yg uang/integer/GPS - dicocokkan by key ke EXPORT_COLUMNS
      // (kolom ACV pakai flag c.acv yg sudah ada, tidak perlu didaftar di sini).
      const MONEY_KEYS = new Set(["targetRebuy", "targetRev", "costEstimate", "actualRebuy", "actualRev", "costActual"]);
      const INT_KEYS = new Set(["no", "targetSp", "targetFwa", "actualSp", "actualFwa"]);
      const GPS_KEYS = new Set(["long", "lat"]);

      // ── Sheet "Summary" - pivot ringkasan per Branch (spt referensi
      //    "Report & Plan NSA.xlsx"). Daftar Branch & Event Category-nya
      //    dihitung di JS dari data yg lagi di-export (uniqueBranches/
      //    uniqueCats di bawah), ditulis sbg teks tetap, tapi tiap ANGKA
      //    di tabelnya tetap RUMUS Excel biasa (COUNTIF/SUMIF/COUNTIFS/
      //    SUMIFS/SUM) yg reference ke seluruh kolom data - jadi kalau
      //    angka datanya diubah manual di Excel, sel ringkasan ikut
      //    ke-update. (Versi sebelumnya pakai rumus array dinamis Excel 365
      //    SORT/UNIQUE/TRANSPOSE + referensi spill "#" supaya daftar
      //    Branch/Category ikut "nambah otomatis" - tapi ExcelJS tidak
      //    menulis metadata dynamic-array yg wajib ada utk fungsi itu,
      //    jadi Excel selalu anggap file rusak & "Repair" dgn membuang
      //    semua formula. Diganti ke pendekatan klasik ini spy file selalu
      //    valid di semua versi Excel.)
      // Kolom acuan di sheet "Activity Plan" (urutan TETAP, lihat EXPORT_COLUMNS
      // di bawah): F=Brand, G=Branch, O=Event Category, Y=Target SP,
      // Z=Target FWA, AA=Target Rebuy, AB=Est. Total Rev (3 Months).
      const dataLastRow = filteredRows.length + 1; // +1 krn baris 1 = header
      const DATA = `'Activity Plan'!`;
      const rngBranch = `${DATA}$G$2:$G$${dataLastRow}`;
      const rngBrand = `${DATA}$F$2:$F$${dataLastRow}`;
      const rngCat = `${DATA}$O$2:$O$${dataLastRow}`;
      const rngSp = `${DATA}$Y$2:$Y$${dataLastRow}`;
      const rngFwa = `${DATA}$Z$2:$Z$${dataLastRow}`;
      const rngRebuy = `${DATA}$AA$2:$AA$${dataLastRow}`;
      const rngRev = `${DATA}$AB$2:$AB$${dataLastRow}`;
      const colLetter = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
      const escStr = (s) => String(s).replace(/"/g, '""');

      const brandVariants = [
        { label: "Semua Brand", crit: null },
        { label: "IM3", crit: "IM3" },
        { label: "3ID", crit: "3ID" },
      ];

      // Catatan (2026-09, perbaikan file corrupt/"Repair" saat dibuka Excel):
      // Versi sebelumnya pakai rumus array dinamis Excel 365 (SORT/UNIQUE/
      // TRANSPOSE) + referensi spill "A1#" supaya daftar Branch/Event
      // Category ikut "nambah otomatis" kalau data di sheet diedit manual.
      // MASALAHNYA: ExcelJS tidak menulis metadata "dynamic array formula"
      // (prefix _xlfn., flag array formula, dsb) yg wajib ada di file .xlsx
      // versi Excel 365 - jadi Excel selalu anggap formula itu rusak &
      // otomatis "Repair" dgn MEMBUANG seluruh <f> formula di sheet
      // (persis error yg dilaporkan). Diganti total ke pendekatan klasik:
      // daftar Branch & Event Category unik dihitung SEKALI di JS (persis
      // saat export ini), ditulis sbg TEKS tetap, lalu tiap sel angka tetap
      // RUMUS Excel biasa (COUNTIF/SUMIF/COUNTIFS/SUMIFS/SUM) yg reference
      // ke SELURUH kolom data di sheet "Activity Plan" - jadi kalau angka
      // di sana diubah manual, sel ringkasan ini tetap ikut ke-update
      // (hanya daftar Branch/Category-nya sendiri baru "ikut nambah" kalau
      // export ulang, bukan otomatis spill spt sebelumnya). Ini didukung
      // 100% oleh Excel versi berapa pun (termasuk Excel lama) & oleh
      // ExcelJS, jadi file tidak pernah "Repair" lagi.
      const uniqueBranches = Array.from(
        new Set(filteredRows.map((r) => branchMap[r.branch_id] || "-"))
      ).sort((a, b) => a.localeCompare(b));
      const uniqueCats = Array.from(new Set(filteredRows.map((r) => cats(r)))).sort((a, b) =>
        a.localeCompare(b)
      );

      if (filteredRows.length) {
        const wsSum = wb.addWorksheet("Summary");
        wsSum.getColumn(1).width = 22;
        for (let c = 2; c <= 22; c++) wsSum.getColumn(c).width = 15;
        let row = 1;
        const titleRow = (text) => {
          const r = wsSum.getRow(row++);
          const cell = r.getCell(1);
          cell.value = text;
          cell.font = { bold: true, size: 13, color: { argb: "FFED1C24" } };
          row++; // baris kosong pemisah
        };
        const headerCell = (r, col, label) => {
          const cell = r.getCell(col);
          cell.value = label;
          cell.font = XLSX_SUBHEADER_FONT;
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XLSX_SUBHEADER_FILL } };
          cell.border = XLSX_THIN_BORDER;
          cell.alignment = { vertical: "middle", horizontal: "center" };
        };
        const totalRowStyle = (r, colFrom, colTo) => {
          for (let c = colFrom; c <= colTo; c++) {
            const cell = r.getCell(c);
            cell.font = { bold: true };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XLSX_TOTAL_FILL } };
            cell.border = XLSX_THIN_BORDER;
          }
        };
        const bandRow = (r, colFrom, colTo, idx) => {
          if (idx % 2 !== 1) return; // baris genap (idx 0-based ganjil tampil) - selang-seling halus
          for (let c = colFrom; c <= colTo; c++) {
            const cell = r.getCell(c);
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XLSX_ZEBRA_FILL } };
          }
        };

        // ── Tabel A: Ringkasan per Branch (Count Activity, Target SP/FWA/
        //    Rebuy/Revenue) - 3 sub-tabel bertumpuk (Semua/IM3/3ID). Daftar
        //    Branch = uniqueBranches (dihitung di JS, lihat catatan di
        //    atas), tiap sel angka = COUNTIF/SUMIF(S) klasik. ──
        titleRow("Ringkasan per Branch");
        brandVariants.forEach((bv) => {
          const hdr = wsSum.getRow(row);
          headerCell(hdr, 1, "Branch");
          headerCell(hdr, 2, "Count Activity");
          headerCell(hdr, 3, "Sum Target SP");
          headerCell(hdr, 4, "Sum Target FWA");
          headerCell(hdr, 5, "Sum Target Rebuy");
          headerCell(hdr, 6, "Sum Est. Total Rev (3 Months)");
          const firstDataRow = row + 1;
          uniqueBranches.forEach((branchName, idx) => {
            const r2 = wsSum.getRow(firstDataRow + idx);
            r2.getCell(1).value = branchName;
            const critBranch = `"${escStr(branchName)}"`;
            if (bv.crit) {
              r2.getCell(2).value = { formula: `COUNTIFS(${rngBranch},${critBranch},${rngBrand},"${bv.crit}")` };
              r2.getCell(3).value = { formula: `SUMIFS(${rngSp},${rngBranch},${critBranch},${rngBrand},"${bv.crit}")` };
              r2.getCell(4).value = { formula: `SUMIFS(${rngFwa},${rngBranch},${critBranch},${rngBrand},"${bv.crit}")` };
              r2.getCell(5).value = { formula: `SUMIFS(${rngRebuy},${rngBranch},${critBranch},${rngBrand},"${bv.crit}")` };
              r2.getCell(6).value = { formula: `SUMIFS(${rngRev},${rngBranch},${critBranch},${rngBrand},"${bv.crit}")` };
            } else {
              r2.getCell(2).value = { formula: `COUNTIF(${rngBranch},${critBranch})` };
              r2.getCell(3).value = { formula: `SUMIF(${rngBranch},${critBranch},${rngSp})` };
              r2.getCell(4).value = { formula: `SUMIF(${rngBranch},${critBranch},${rngFwa})` };
              r2.getCell(5).value = { formula: `SUMIF(${rngBranch},${critBranch},${rngRebuy})` };
              r2.getCell(6).value = { formula: `SUMIF(${rngBranch},${critBranch},${rngRev})` };
            }
            r2.getCell(2).numFmt = INT_FMT;
            r2.getCell(3).numFmt = INT_FMT;
            r2.getCell(4).numFmt = INT_FMT;
            r2.getCell(5).numFmt = RP_FMT;
            r2.getCell(6).numFmt = RP_FMT;
            r2.getCell(1).border = XLSX_THIN_BORDER;
            for (let c = 2; c <= 6; c++) r2.getCell(c).border = XLSX_THIN_BORDER;
            bandRow(r2, 1, 6, idx);
          });
          const totalRowIdx = firstDataRow + uniqueBranches.length + 1;
          const totalR = wsSum.getRow(totalRowIdx);
          totalR.getCell(1).value = "Total Keseluruhan";
          for (let c = 2; c <= 6; c++) {
            totalR.getCell(c).value = uniqueBranches.length
              ? { formula: `SUM(${colLetter(c)}${firstDataRow}:${colLetter(c)}${firstDataRow + uniqueBranches.length - 1})` }
              : 0;
          }
          totalR.getCell(2).numFmt = INT_FMT;
          totalR.getCell(3).numFmt = INT_FMT;
          totalR.getCell(4).numFmt = INT_FMT;
          totalR.getCell(5).numFmt = RP_FMT;
          totalR.getCell(6).numFmt = RP_FMT;
          totalRowStyle(totalR, 1, 6);
          row = totalRowIdx + 2;
        });

        // ── Tabel B: Branch × Event Category (Count Activity) - 3
        //    sub-tabel bertumpuk (Semua/IM3/3ID). Branch (baris) & Event
        //    Category (kolom header) = uniqueBranches/uniqueCats (JS),
        //    sel = COUNTIFS klasik. Ukuran grid PERSIS jumlah unik riil -
        //    tidak perlu lagi kapasitas longgar/padding spt versi spill. ──
        titleRow("Ringkasan per Branch × Event Category (Count Activity)");
        brandVariants.forEach((bv) => {
          const hdr = wsSum.getRow(row);
          headerCell(hdr, 1, "Branch");
          const catAnchorCol = 2;
          uniqueCats.forEach((catName, j) => headerCell(hdr, catAnchorCol + j, catName));
          headerCell(hdr, catAnchorCol + uniqueCats.length, "Total");
          const firstDataRow = row + 1;
          uniqueBranches.forEach((branchName, i) => {
            const r2 = wsSum.getRow(firstDataRow + i);
            r2.getCell(1).value = branchName;
            r2.getCell(1).border = XLSX_THIN_BORDER;
            const critBranch = `"${escStr(branchName)}"`;
            uniqueCats.forEach((catName, j) => {
              const col = catAnchorCol + j;
              const critCat = `"${escStr(catName)}"`;
              const formula = bv.crit
                ? `COUNTIFS(${rngBranch},${critBranch},${rngCat},${critCat},${rngBrand},"${bv.crit}")`
                : `COUNTIFS(${rngBranch},${critBranch},${rngCat},${critCat})`;
              const cell = r2.getCell(col);
              cell.value = { formula };
              cell.numFmt = INT_FMT;
              cell.border = XLSX_THIN_BORDER;
              cell.alignment = { horizontal: "center" };
            });
            const totalCol = catAnchorCol + uniqueCats.length;
            const totalCell = r2.getCell(totalCol);
            totalCell.value = uniqueCats.length
              ? { formula: `SUM(${colLetter(catAnchorCol)}${firstDataRow + i}:${colLetter(catAnchorCol + uniqueCats.length - 1)}${firstDataRow + i})` }
              : 0;
            totalCell.font = { bold: true };
            totalCell.numFmt = INT_FMT;
            totalCell.border = XLSX_THIN_BORDER;
            totalCell.alignment = { horizontal: "center" };
            bandRow(r2, 1, totalCol, i);
          });
          const totalRowIdx = firstDataRow + uniqueBranches.length + 1;
          const totalR = wsSum.getRow(totalRowIdx);
          totalR.getCell(1).value = "Total Keseluruhan";
          for (let j = 0; j <= uniqueCats.length; j++) {
            const col = catAnchorCol + j;
            const cl = colLetter(col);
            const cell = totalR.getCell(col);
            cell.value = uniqueBranches.length
              ? { formula: `SUM(${cl}${firstDataRow}:${cl}${firstDataRow + uniqueBranches.length - 1})` }
              : 0;
            cell.numFmt = INT_FMT;
            cell.alignment = { horizontal: "center" };
          }
          totalRowStyle(totalR, 1, catAnchorCol + uniqueCats.length);
          row = totalRowIdx + 2;
        });
      }

      const ws = wb.addWorksheet("Activity Plan", { views: [{ state: "frozen", ySplit: 1 }] });

      // "pilih" (kolom checkbox rollback) TIDAK punya `get` - itu kolom
      // UI-only, tidak ada isinya utk di-export. Dulu ikut ke-map & crash
      // "c.get is not a function" pas ketemu kolom ini. Buang dari sini,
      // SATU sumber utk semua langkah export di bawah (header, isi baris,
      // posisi kolom foto/link, autoFilter) spy tidak ada yg lupa disingkron.
      const EXPORT_COLUMNS = COLUMNS.filter((c) => c.key !== "pilih");

      // numFmt per kolom - ditentukan sekali di sini per EXPORT_COLUMNS,
      // dipakai baik utk `ws.columns[].style` (kolom kosong/baris baru yg
      // ditambah user nanti di Excel ikut format ini) maupun tiap sel data
      // di bawah. Uang = Rp#,##0, integer polos = #,##0, GPS = 6 desimal,
      // ACV/percent = 0.0% (nilainya sendiri disimpan sbg PECAHAN 0-1, BUKAN
      // 0-100, krn itu cara Excel native menyimpan format percent).
      const colNumFmt = (c) => {
        if (c.date) return DATE_FMT;
        if (c.acv) return PCT_FMT;
        if (MONEY_KEYS.has(c.key)) return RP_FMT;
        if (GPS_KEYS.has(c.key)) return GPS_FMT;
        if (INT_KEYS.has(c.key)) return INT_FMT;
        return undefined;
      };

      ws.columns = EXPORT_COLUMNS.map((c) => ({
        header: c.label,
        width: Math.max(10, Math.round((c.width || 100) / 7)),
        style: colNumFmt(c) ? { numFmt: colNumFmt(c) } : undefined,
      }));
      ws.getRow(1).height = 22;
      ws.getRow(1).eachCell((cell) => {
        cell.font = XLSX_HEADER_FONT;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XLSX_HEADER_FILL } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = XLSX_THIN_BORDER;
      });

      const docCol = EXPORT_COLUMNS.findIndex((c) => c.key === "documentation") + 1; // 1-based utk ExcelJS
      const driveCol = EXPORT_COLUMNS.findIndex((c) => c.key === "drive_link") + 1;
      const THUMB_PX = 54;

      // Baris teks dulu (cepat, sinkron) - gambar ditempel belakangan per baris
      filteredRows.forEach((r, i) => {
        const rowValues = EXPORT_COLUMNS.map((c) => {
          if (c.key === "no") return i + 1;
          if (c.key === "documentation") return ""; // diisi gambar, bukan teks
          if (c.key === "drive_link") return ""; // diisi hyperlink di bawah, bukan teks polos
          if (c.key === "long" || c.key === "lat") {
            const v = c.raw(r);
            return v == null ? "" : v; // presisi penuh, TIDAK dibulatkan
          }
          if (c.date && c.raw) {
            const v = c.raw(r); // Date object asli - sel Excel jadi tipe DATE beneran, bukan teks
            return v || "";
          }
          if (c.acv && c.raw) {
            const v = c.raw(r); // pctVal() balikin 0-100 - dibagi 100 spy cocok dgn numFmt percent native Excel
            return v == null ? "" : Math.round(v * 100) / 10000;
          }
          if (c.numeric && c.raw) {
            const v = c.raw(r);
            return v == null ? "" : Math.round(v * 100) / 100;
          }
          const v = c.get(r);
          return v === "-" ? "" : v;
        });
        const row = ws.addRow(rowValues);
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.border = XLSX_THIN_BORDER;
          if (i % 2 === 1) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XLSX_ZEBRA_FILL } };
          }
        });
        // Sel ACV/Cost Ratio diwarnai per-baris sesuai capaian (hijau
        // tercapai / kuning mendekati / merah jauh) - fill zebra di atas
        // (kalau ada) ditimpa warna ini spy tetap jelas kebaca.
        EXPORT_COLUMNS.forEach((c, idx) => {
          if (!c.acv) return;
          const v = c.raw ? c.raw(r) : null; // 0-100, bukan pecahan - buat nentuin warna
          const color = acvColor(v, !!c.invertGood);
          if (!color) return;
          const cell = row.getCell(idx + 1);
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color.fill } };
          cell.font = { color: { argb: color.font }, bold: true };
        });
        // Link "Buka di Drive" - klik langsung buka foto di Google Drive
        // (mh_documents.external_ref, diisi Edge Function media-relay).
        // Kalau belum sempat ke-mirror (mis. kredensial Drive lagi
        // bermasalah), sel dibiarkan kosong, bukan link mati.
        if (driveCol > 0 && docDriveMap[r.id]) {
          row.getCell(driveCol).value = { text: "Buka di Drive", hyperlink: `https://drive.google.com/file/d/${docDriveMap[r.id]}/view` };
          row.getCell(driveCol).font = { color: { argb: "FF2563EB" }, underline: true };
        }
      });

      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: filteredRows.length + 1, column: EXPORT_COLUMNS.length } };

      // Ambil & tempel thumbnail foto pertama tiap activity yg punya dokumentasi.
      // Jalan paralel (Promise.allSettled) supaya 1 foto gagal load tidak
      // menggagalkan seluruh export.
      if (docCol > 0) {
        await Promise.allSettled(filteredRows.map(async (r, i) => {
          const path = docPhotoMap[r.id];
          if (!path) return;
          try {
            const url = photoUrl(path);
            const res = await fetch(url);
            if (!res.ok) return;
            const buffer = await res.arrayBuffer();
            const ext = (path.split(".").pop() || "jpeg").toLowerCase();
            const extension = ["png", "jpeg", "jpg", "gif"].includes(ext) ? (ext === "jpg" ? "jpeg" : ext) : "jpeg";
            const imageId = wb.addImage({ buffer, extension });
            const rowIdx = i + 1; // 0-based row index di bawah header (baris data ke-1 = index 1 di sheet)
            ws.getRow(rowIdx + 1).height = Math.max(ws.getRow(rowIdx + 1).height || 0, THUMB_PX * 0.78);
            ws.addImage(imageId, {
              tl: { col: docCol - 1 + 0.05, row: rowIdx + 0.05 },
              ext: { width: THUMB_PX, height: THUMB_PX },
              editAs: "oneCell",
            });
          } catch { /* lewati foto yg gagal diambil, baris lain tetap lanjut */ }
        }));
      }

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const stamp = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `MartaHub_Activity_Plan_${stamp}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert(e.message || "Gagal export .xlsx");
    } finally {
      setExporting(false);
    }
  }, [COLUMNS, filteredRows, docPhotoMap, docDriveMap, branchMap, cats]);

  const T_FILTER = { hi: T.hi, mid: T.mid, lo: T.lo, blue: T.primary, blueBg: T.primaryBg };

  return (
    <div>
      <style>{"@keyframes mh-spin { to { transform: rotate(360deg); } }"}</style>
      {!MARTA_CONFIGURED && (
        <div style={{ ...card, borderColor: T.warning, background: T.warningBg, color: "#7a5b00", marginBottom: 16 }}>
          Supabase MartaHub belum dikonfigurasi / project paused - data tampil kosong.
        </div>
      )}
      {err && <div style={{ ...card, borderColor: T.error, background: T.errorBg, color: T.error, marginBottom: 16 }}>{err}</div>}

      {showKpiConfig && <KpiConfigModal email={email} canEdit={scope?.role === "spm_sumatera"} onClose={() => setShowKpiConfig(false)} />}

      {/* KPI strip - pantauan cepat (dulu di menu "Activity Monitoring"
          terpisah), sekarang langsung di atas tabel Activity Plan supaya
          "pantau sekaligus lihat detail" bisa dalam satu layar. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(172px,1fr))", gap: 14, marginBottom: 18 }}>
        <Kpi label="Total Penjualan SP" value={<KpiRatio main={fmtInt(kpiStats.spTervalidasi)} suffix={` / ${fmtInt(kpiStats.spPengajuan)} Plan`} />}
          sub={<KpiSubRow icon={RefreshCw} label="Rebuy SP: Actual / Plan" value={`${fmtRpCompact(kpiStats.actualRebuySp)} / ${fmtRpCompact(kpiStats.targetRebuySp)}`} />}
          icon={CardSim} color={T.success} />
        <Kpi label="Total Penjualan FWA" value={<KpiRatio main={fmtInt(kpiStats.fwaTervalidasi)} suffix={` / ${fmtInt(kpiStats.fwaPengajuan)} Plan`} />}
          sub={<KpiSubRow icon={RefreshCw} label="Rebuy FWA: Actual / Plan" value={`${fmtRpCompact(kpiStats.actualRebuyFwa)} / ${fmtRpCompact(kpiStats.targetRebuyFwa)}`} />}
          icon={RouterIcon} color={T.success} />
        <Kpi label="Total Revenue (3 Months)" value={fmtRp(kpiStats.actualRev3m)}
          sub={<KpiSubRow label="Actual / Plan" value={`${fmtRpCompact(kpiStats.actualRev3m)} / ${fmtRpCompact(kpiStats.targetRev3m)}`} />}
          icon={Banknote} color={T.blue} />
        <Kpi label="Total Cost" value={fmtRp(kpiStats.totalCostActual)}
          sub={<KpiSubRow label="Actual / Plan" value={`${fmtRpCompact(kpiStats.totalCostActual)} / ${fmtRpCompact(kpiStats.totalCostEstimate)}`} />}
          icon={Wallet} color={T.warning} />
        <Kpi label="Laporan Actual" value={<KpiRatio main={String(kpiStats.actualSubmittedCount)} suffix={` / ${kpiStats.total} plan`} />}
          sub={<AchProdSubRow achievement={kpiStats.avgAchievement} productivity={kpiStats.avgProductivity}
            canConfig={scope?.role === "spm_sumatera"} onConfig={() => setShowKpiConfig(true)} />}
          icon={FileCheck2} color="#7C3AED" />
      </div>

      {/* Status quick-filter - chip ini & dropdown filter kolom "Status" di
          header tabel SALING TERHUBUNG (sama-sama nulis ke colFilters.status),
          jadi klik chip di sini otomatis kelihatan juga sebagai filter aktif
          di kolom Status, dan sebaliknya. Menggantikan chip serupa yang dulu
          cuma ada di halaman "Activity Monitoring" terpisah. */}
      {statusChips.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {statusChips.map((lbl) => {
            const on = selectedStatuses.includes(lbl);
            return (
              <button key={lbl} onClick={() => toggleStatusChip(lbl)} className="mh-btn"
                style={{ padding: "5px 13px", borderRadius: 100, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                  border: `1.5px solid ${on ? "transparent" : T.line}`,
                  background: on ? "linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)" : "#fff",
                  color: on ? "#fff" : T.mid }}>
                {lbl} <span style={{ opacity: 0.75 }}>· {statusStatusCounts.get(lbl) || 0}</span>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {/* Search - dibungkus div supaya bisa taruh ikon + tombol clear di
            dalam kotaknya sendiri, dgn ring fokus yg jelas (bukan <input>
            polos spt sebelumnya). */}
        <div style={{
          position: "relative", display: "flex", alignItems: "center", width: 360, maxWidth: "100%",
          background: "#fff", border: `1.5px solid ${searchFocus ? T.primary : T.line}`, borderRadius: 11,
          boxShadow: searchFocus ? `0 0 0 3px ${T.primaryBg}` : "0 1px 2px rgba(13,17,23,0.04)", transition: "border-color .15s, box-shadow .15s",
        }}>
          <Search size={15} color={searchFocus ? T.primary : T.lo} style={{ position: "absolute", left: 12, pointerEvents: "none" }} />
          <input
            value={q} onChange={(e) => { setQ(e.target.value); setShowSuggest(true); }}
            onFocus={() => { setSearchFocus(true); setShowSuggest(true); }}
            onBlur={() => { setSearchFocus(false); setTimeout(() => setShowSuggest(false), 120); }}
            onKeyDown={(e) => { if (e.key === "Escape") { setShowSuggest(false); e.currentTarget.blur(); } }}
            placeholder="Cari Activity Plan"
            style={{ width: "100%", padding: "9px 34px 9px 36px", border: "none", outline: "none", background: "transparent", fontSize: 13, color: T.hi, fontFamily: FONT, borderRadius: 11, boxSizing: "border-box" }}
          />
          {q && (
            <button onClick={() => { setQ(""); setShowSuggest(false); }} title="Bersihkan pencarian"
              style={{ position: "absolute", right: 8, width: 20, height: 20, borderRadius: "50%", border: "none", background: "#F0F4FA", color: T.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <X size={12} />
            </button>
          )}

          {showSuggest && searchSuggestions.length > 0 && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 30,
              background: "#fff", border: `1px solid ${T.line}`, borderRadius: 12,
              boxShadow: "0 12px 32px rgba(13,17,23,0.14)", overflow: "hidden",
            }}>
              {searchSuggestions.map((sug, i) => (
                <div key={`${sug.kind}-${sug.label}-${i}`}
                  onMouseDown={(e) => { e.preventDefault(); setQ(sug.label); setShowSuggest(false); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                    padding: "8px 12px", fontSize: 12.5, color: T.hi, cursor: "pointer",
                    borderTop: i > 0 ? `1px solid ${T.line}` : "none",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#F7F9FC"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sug.label}</span>
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: T.lo, background: "#F0F4FA", padding: "2px 7px", borderRadius: 999, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.03em" }}>{sug.kind}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={load} title="Muat ulang data"
          style={{ ...btn, opacity: 1, cursor: "pointer", color: T.mid, flexShrink: 0 }}>
          {loading ? <Loader2 size={13} style={{ animation: "mh-spin .8s linear infinite" }} /> : <RefreshCw size={13} />} Refresh
        </button>

        {scope && !scope.unscoped && scope.found && (
          <div style={{ fontSize: 11, fontWeight: 700, color: T.mid, background: "#F0F4FA", border: `1px solid ${T.line}`, borderRadius: 100, padding: "2px 10px" }}>
            Scope: {scope.region || "-"} · {brandLabel(scope.brand)}
          </div>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12.5, color: T.mid }}>
            <b style={{ color: T.hi }}>{filteredRows.length}</b> dari {rows.length} plan
            {activeFilterCount > 0 && <span style={{ marginLeft: 6, fontWeight: 700, color: T.primary }}>· {activeFilterCount} filter aktif</span>}
          </div>

          <button onClick={clearAllFilters} disabled={!hasAnyFilter} title="Hapus pencarian & semua filter kolom"
            style={{ ...btn, opacity: hasAnyFilter ? 1 : 0.4, cursor: hasAnyFilter ? "pointer" : "default", color: T.mid }}>
            <RotateCcw size={13} /> Clear All Filter
          </button>

          <button onClick={exportXlsx} disabled={filteredRows.length === 0} title="Export data sesuai filter yang sedang diterapkan"
            style={{ ...btn, opacity: filteredRows.length === 0 ? 0.5 : 1, cursor: filteredRows.length === 0 ? "default" : "pointer", background: "linear-gradient(135deg,#1E8E3E,#0F6B2C)", borderColor: "transparent", color: "#fff" }}>
            <Download size={13} /> {exporting ? "Menyiapkan file…" : "Export .xlsx"}
          </button>

          <button onClick={() => router.push("/martahub/activities/import")} title="Import banyak activity plan sekaligus dari file Excel"
            style={{ ...btn, background: "linear-gradient(90deg, #ED1C24 0%, #C6168D 100%)", borderColor: "transparent", color: "#fff" }}>
            <Upload size={13} /> Import Plan (Excel)
          </button>

          <button onClick={() => router.push("/martahub/master?section=sp_fwa_types")} title="Target Revenue (3 Bulan) saat Import Plan dihitung otomatis dari harga di sini (rata2 per brand) - sumber yg sama dgn wizard Buat Plan Baru di mobile"
            style={{ ...btn, color: T.mid }}>
            <Settings2 size={13} /> Harga SP/FWA (Kalkulasi Revenue)
          </button>
        </div>
      </div>

      {canRollback && selectedIds.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", marginBottom: 12, borderRadius: 12, background: "#FFF4F4", border: `1px solid ${T.error}` }}>
          <Undo2 size={15} color={T.error} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: T.hi }}>{selectedIds.size} data Import Excel (Backdoor) terpilih</span>
          <button onClick={() => setSelectedIds(new Set())} style={{ ...btn, padding: "5px 10px" }}>Batal Pilih</button>
          <button onClick={() => { setRollbackErr(""); setShowRollbackConfirm(true); }} disabled={rollbackBusy}
            style={{
              marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", flexShrink: 0,
              padding: "8px 16px", borderRadius: 9, border: "none", fontSize: 12.5, fontWeight: 700,
              background: T.error, color: "#fff", cursor: rollbackBusy ? "default" : "pointer", opacity: rollbackBusy ? 0.7 : 1,
            }}>
            <Undo2 size={13} /> Rollback {selectedIds.size} Data
          </button>
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", maxHeight: "72vh", overflowY: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
            <thead>
              <tr style={{ background: "#F7F9FC", color: T.mid, textAlign: "left" }}>
                {COLUMNS.map((col) => {
                  if (col.key === "pilih") {
                    const backdoorVisible = filteredRows.filter((r) => r.plan_source === "cms_import").map((r) => r.id);
                    const allSelected = backdoorVisible.length > 0 && backdoorVisible.every((id) => selectedIds.has(id));
                    return (
                      <th key="pilih" title={backdoorVisible.length ? "Pilih semua data Import Excel (Backdoor) yg sedang tampil" : "Tidak ada data backdoor pada filter saat ini"}
                        style={{ position: "sticky", top: 0, zIndex: 5, width: col.width, minWidth: col.width, padding: "9px 8px", background: "#F7F9FC", borderBottom: `1px solid ${T.line}`, borderRight: `1px solid ${T.line}`, textAlign: "center" }}>
                        <input type="checkbox" checked={allSelected} disabled={backdoorVisible.length === 0}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (allSelected) backdoorVisible.forEach((id) => next.delete(id));
                            else backdoorVisible.forEach((id) => next.add(id));
                            return next;
                          })}
                          style={{ cursor: backdoorVisible.length ? "pointer" : "default" }} />
                      </th>
                    );
                  }
                  const isSorted = sortState.key === col.key;
                  const filterConfig = col.filter ? {
                    options: filterOptionsMap[col.key] || [],
                    selected: colFilters[col.key] || [],
                    onApply: (vals) => setColFilters((p) => ({ ...p, [col.key]: vals })),
                    onClear: () => setColFilters((p) => { const n = { ...p }; delete n[col.key]; return n; }),
                    sortDir: isSorted ? sortState.dir : null,
                    onSort: (dir) => setSortState({ key: col.key, dir }),
                  } : null;
                  return (
                    <th key={col.key} style={{ position: "sticky", top: 0, zIndex: 5, width: col.width, minWidth: col.width, padding: "9px 10px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em", color: isSorted ? T.primary : T.mid, background: "#F7F9FC", borderBottom: `1px solid ${T.line}`, borderRight: `1px solid ${T.line}` }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: col.key === "brand" ? "center" : "space-between", gap: 6 }}>
                        <span onClick={() => !col.filter && col.key !== "no" && setSortState((s) => ({ key: col.key, dir: s.key === col.key && s.dir === "asc" ? "desc" : "asc" }))}
                          style={{ overflow: "hidden", textOverflow: "ellipsis", cursor: col.key === "no" ? "default" : "pointer" }} title={col.label}>
                          {col.label}{isSorted && !col.filter ? (sortState.dir === "asc" ? " ▲" : " ▼") : ""}
                        </span>
                        {filterConfig && <ExcelFilter {...filterConfig} t={T_FILTER} d={false} />}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={COLUMNS.length} style={{ padding: 26, textAlign: "center", color: T.lo }}>Memuat…</td></tr>}
              {!loading && filteredRows.length === 0 && <tr><td colSpan={COLUMNS.length} style={{ padding: 26, textAlign: "center", color: T.lo }}>Tidak ada activity plan untuk filter saat ini.</td></tr>}
              {!loading && filteredRows.map((r, i) => (
                <tr key={r.id} onClick={() => setDetailId(r.id)} style={{ borderTop: `1px solid ${T.line}`, cursor: "pointer" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#F7F9FC"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                  {COLUMNS.map((col) => {
                    if (col.key === "pilih") {
                      const isBackdoor = r.plan_source === "cms_import";
                      return (
                        <td key="pilih" onClick={(e) => e.stopPropagation()} style={{ padding: "8px 8px", borderRight: `1px solid ${T.line}`, textAlign: "center" }}>
                          <input type="checkbox" checked={selectedIds.has(r.id)} disabled={!isBackdoor}
                            title={isBackdoor ? "Pilih utk rollback" : "Data manual - tidak bisa di-rollback lewat fitur ini"}
                            onChange={() => setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                              return next;
                            })}
                            style={{ cursor: isBackdoor ? "pointer" : "default", opacity: isBackdoor ? 1 : 0.25 }} />
                        </td>
                      );
                    }
                    if (col.key === "no") return <td key="no" style={{ padding: "8px 10px", color: T.lo, borderRight: `1px solid ${T.line}` }}>{i + 1}</td>;
                    if (col.badgeStatus) {
                      const st = deriveStatusInfo(r, { profileMap, siteMetaMap, bmeAssignMap, branchMap });
                      const missingFields = st[0] === "Belum Lengkap" ? getIncompleteImportFields(r, { profileMap, siteMetaMap, bmeAssignMap, branchMap }) : [];
                      const badgeTitle = missingFields.length ? `Kolom belum terisi: ${missingFields.map((f) => f.label).join(", ")}` : undefined;
                      return <td key={col.key} style={{ padding: "8px 10px", borderRight: `1px solid ${T.line}` }}><span title={badgeTitle} style={{ fontSize: 10, fontWeight: 800, color: st[1], background: st[2], padding: "2px 8px", borderRadius: 999, cursor: badgeTitle ? "help" : "default" }}>{st[0]}</span></td>;
                    }
                    if (col.badgeBrand) {
                      return <td key={col.key} style={{ padding: "8px 10px", borderRight: `1px solid ${T.line}`, textAlign: "center" }}><div style={{ display: "flex", justifyContent: "center" }}><BrandBadge brand={r.brand} /></div></td>;
                    }
                    if (col.acv) {
                      const v = col.raw(r);
                      const good = v == null ? null : (col.invertGood ? v <= 100 : v >= 100);
                      return <td key={col.key} style={{ padding: "8px 10px", borderRight: `1px solid ${T.line}`, fontWeight: 700, color: good == null ? T.mid : good ? T.success : T.warning }}>{col.get(r)}</td>;
                    }
                    if (col.key === "eventName") return <td key={col.key} title={r.event_name} style={{ padding: "8px 10px", fontWeight: 700, color: T.hi, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", borderRight: `1px solid ${T.line}` }}>{col.get(r)}</td>;
                    if (col.key === "documentation") {
                      const n = docCountMap[r.id] || 0;
                      return (
                        <td key={col.key} style={{ padding: "8px 10px", borderRight: `1px solid ${T.line}` }}>
                          {n > 0 ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setDetailId(r.id); }}
                              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 999, border: `1px solid ${T.line}`, background: "rgba(37,99,235,0.08)", color: "#2563EB", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
                              title="Lihat foto dokumentasi"
                            >
                              <ImageIcon size={13} />
                              {n} foto
                            </button>
                          ) : (
                            <span style={{ color: T.mid }}>-</span>
                          )}
                        </td>
                      );
                    }
                    return <td key={col.key} style={{ padding: "8px 10px", color: T.mid, borderRight: `1px solid ${T.line}`, textAlign: col.numeric ? "right" : "left" }}>{col.get(r)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detailId && (
        <ActivityDetailModal id={detailId} onClose={() => setDetailId(null)} email={email}
          canDelete={scope?.role === "spm_sumatera"}
          onDeleted={(deletedId) => setRows((prev) => prev.filter((r) => r.id !== deletedId))} />
      )}

      {showRollbackConfirm && (
        <RollbackConfirmModal
          selectedRows={rows.filter((r) => selectedIds.has(r.id))}
          batchMap={batchMap}
          busy={rollbackBusy}
          err={rollbackErr}
          onClose={() => { if (!rollbackBusy) setShowRollbackConfirm(false); }}
          onConfirm={async () => {
            setRollbackBusy(true); setRollbackErr("");
            try {
              const ids = [...selectedIds];
              const { data, error } = await supabaseMarta.rpc("mh_rollback_import_activities", { p_activity_ids: ids, p_caller_email: email });
              if (error) throw error;
              setRows((prev) => prev.filter((r) => !selectedIds.has(r.id)));
              setSelectedIds(new Set());
              setShowRollbackConfirm(false);
            } catch (ex) {
              setRollbackErr(ex.message || "Gagal melakukan rollback");
            } finally {
              setRollbackBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}

// Modal konfirmasi Rollback Import (Backdoor) - menampilkan ringkasan data
// yg akan DIHAPUS PERMANEN (event name, branch, tgl plan, file asal upload)
// sebelum benar2 dieksekusi, krn rollback tidak bisa "undo" dari CMS (snapshot
// lengkapnya tetap tersimpan di mh_plan_import_rollback_log utk ditelusuri
// admin DB kalau perlu, tapi tidak ada tombol "restore" otomatis di UI).
function RollbackConfirmModal({ selectedRows, batchMap, busy, err, onClose, onConfirm }) {
  const byFile = useMemo(() => {
    const m = {};
    for (const r of selectedRows) {
      const key = batchMap[r.import_batch_id]?.filename || "(file tidak diketahui)";
      m[key] = (m[key] || 0) + 1;
    }
    return Object.entries(m);
  }, [selectedRows, batchMap]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,12,20,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", background: "#fff", borderRadius: 18, boxShadow: "0 24px 64px rgba(13,17,23,0.22)" }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "#FFF0F0", color: T.error, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <AlertTriangle size={17} />
          </div>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: T.hi, letterSpacing: "-0.01em" }}>Rollback {selectedRows.length} Data Import Excel</div>
            <div style={{ fontSize: 11.5, color: T.lo, marginTop: 3 }}>Data akan DIHAPUS PERMANEN dari Activity Plan. Tindakan ini tidak bisa dibatalkan dari halaman ini.</div>
          </div>
        </div>
        <div style={{ padding: "18px 22px" }}>
          {err && <div style={{ fontSize: 12, color: T.error, marginBottom: 12, background: T.errorBg, padding: "8px 10px", borderRadius: 8 }}>{err}</div>}
          <div style={{ fontSize: 11.5, fontWeight: 700, color: T.mid, marginBottom: 8 }}>Ringkasan per file yang diupload:</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            {byFile.map(([file, n]) => (
              <div key={file} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "7px 10px", background: "#F7F8FA", borderRadius: 8 }}>
                <span style={{ color: T.hi, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 340 }}>{file}</span>
                <span style={{ color: T.mid, fontWeight: 700 }}>{n} data</span>
              </div>
            ))}
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto", border: `1px solid ${T.line}`, borderRadius: 10 }}>
            {selectedRows.slice(0, 200).map((r) => (
              <div key={r.id} style={{ padding: "7px 10px", fontSize: 12, borderBottom: `1px solid ${T.line}`, display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: T.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.event_name || "-"}</span>
                <span style={{ color: T.lo, flexShrink: 0 }}>{r.site_id || "-"}</span>
              </div>
            ))}
            {selectedRows.length > 200 && <div style={{ padding: "7px 10px", fontSize: 11.5, color: T.lo, textAlign: "center" }}>+ {selectedRows.length - 200} data lainnya…</div>}
          </div>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={onClose} disabled={busy} style={btn}>Batal</button>
            <button onClick={onConfirm} disabled={busy} style={{
              padding: "9px 18px", borderRadius: 9, border: "none", fontSize: 12.5, fontWeight: 700,
              background: T.error, color: "#fff", cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1,
            }}>
              {busy ? "Menghapus…" : `Ya, Rollback ${selectedRows.length} Data`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Modal detail satu activity plan - dibuka dgn klik baris tabel. Padanan
 * desktop dari /martahub/m/activities/[id] (mobile) yang sudah lebih dulu
 * punya ini - ringkasan plan, target vs actual, site, foto dokumentasi,
 * daftar MSISDN, & riwayat pengajuan revisi, supaya admin/TMV/Head bisa
 * "tracking dengan mudah" tanpa perlu buka app Flutter/mobile-web terpisah. */
// Kartu ringkasan - dirancang "premium tapi minimalis": tanpa strip warna
// tebal/angka warna-warni yg ramai, aksen warna cuma di chip ikon (gradient
// halus + border tipis), angka utama SATU warna tinta gelap netral, shadow
// lembut berlapis (bukan garis tegas) + sedikit lift saat hover.
function KpiRatio({ main, suffix }) {
  return (
    <>
      {main}
      <span style={{ fontSize: 13, fontWeight: 600, color: T.lo, marginLeft: 4 }}>{suffix}</span>
    </>
  );
}

// Card gabungan Achievement + Productivity - dua nilai (rata2 achievement_pct
// & productivity_pct dari view mh_leaderboard_summary, discope ke BME yang
// muncul di filteredRows saat ini) plus tombol buka KpiConfigModal untuk
// atur bobot rumusnya (hanya SPM Sumatera yang boleh mengubah).
function AchProdSubRow({ achievement, productivity, canConfig, onConfig }) {
  const fmtPct = (v) => (v == null ? "-" : `${v.toFixed(0)}%`);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11, fontWeight: 500, color: T.lo }}>
      <span>
        %ACH = <span style={{ color: T.mid, fontWeight: 700 }}>{fmtPct(achievement)}</span>
        {"  |  "}
        %PROD = <span style={{ color: T.mid, fontWeight: 700 }}>{fmtPct(productivity)}</span>
      </span>
      <button
        onClick={onConfig}
        title={canConfig ? "Konfigurasi rumus perhitungan" : "Lihat rumus perhitungan"}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 6, flexShrink: 0,
          border: `1px solid ${T.line}`, background: "#fff", color: T.mid, cursor: "pointer",
        }}
      >
        <Settings2 size={11} />
      </button>
    </div>
  );
}

const KPI_CONFIG_FIELDS = [
  { group: "Komposisi Skor Akhir", keys: [
    { key: "w_achievement", label: "Achievement" },
    { key: "w_productivity", label: "Produktivitas" },
    { key: "w_geo", label: "Geo Compliance" },
  ] },
];
const KPI_CONFIG_DEFAULTS = { w_achievement: 0.6, w_productivity: 0.2, w_geo: 0.2 };

// Modal konfigurasi rumus Achievement & Productivity - baca/tulis langsung
// ke mh_settings.leaderboard_weights (key yang sama dipakai mh_leaderboard_summary
// & halaman Settings > Bobot Skor Leaderboard, supaya tidak ada 2 sumber rumus
// yang beda utk angka yang sama). Tiap metrik punya toggle on/off - off = bobot
// disimpan 0 (otomatis dikeluarkan dari rata2 tertimbang di view), tapi nilai
// bobot sebelumnya diingat di form supaya gampang dinyalakan lagi.
function KpiConfigModal({ email, canEdit, onClose }) {
  const [values, setValues] = useState(KPI_CONFIG_DEFAULTS);
  const [enabled, setEnabled] = useState(() => {
    const e = {};
    for (const g of KPI_CONFIG_FIELDS) for (const f of g.keys) e[f.key] = true;
    return e;
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setErr("");
      try {
        const { data, error } = await supabaseMarta.rpc("mh_get_settings");
        if (error) throw error;
        const w = { ...KPI_CONFIG_DEFAULTS, ...(data?.leaderboard_weights || {}) };
        if (!alive) return;
        setValues(w);
        const e = {};
        for (const g of KPI_CONFIG_FIELDS) for (const f of g.keys) e[f.key] = Number(w[f.key]) > 0;
        setEnabled(e);
      } catch (ex) { if (alive) setErr(ex.message || "Gagal memuat konfigurasi"); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  function setField(key, raw) { setValues((s) => ({ ...s, [key]: raw })); }
  function toggle(key) {
    setEnabled((s) => {
      const next = !s[key];
      if (!next) setValues((v) => ({ ...v, [key]: 0 }));
      else setValues((v) => ({ ...v, [key]: v[key] && Number(v[key]) > 0 ? v[key] : (KPI_CONFIG_DEFAULTS[key] ?? 0.2) }));
      return { ...s, [key]: next };
    });
  }

  async function save() {
    const cleaned = {};
    for (const g of KPI_CONFIG_FIELDS) for (const f of g.keys) {
      const n = enabled[f.key] ? Number(values[f.key]) : 0;
      if (Number.isNaN(n) || n < 0) { setErr(`Bobot ${f.label} harus angka >= 0`); return; }
      cleaned[f.key] = n;
    }
    setSaving(true); setErr(""); setSaved(false);
    try {
      const { error } = await supabaseMarta.rpc("mh_set_setting", { p_key: "leaderboard_weights", p_value: cleaned, p_caller_email: email });
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (ex) { setErr(ex.message || "Gagal menyimpan konfigurasi"); }
    finally { setSaving(false); }
  }

  const sumOf = (keys) => keys.reduce((acc, f) => acc + (enabled[f.key] ? (Number(values[f.key]) || 0) : 0), 0);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,12,20,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", background: "#fff", borderRadius: 18, boxShadow: "0 24px 64px rgba(13,17,23,0.22)" }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: T.hi, letterSpacing: "-0.01em" }}>Konfigurasi Achievement & Produktivitas</div>
            <div style={{ fontSize: 11.5, color: T.lo, marginTop: 3 }}>Rumus ini berlaku global - dipakai juga oleh Leaderboard.</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 9, border: "none", background: "#F1F2F5", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={15} />
          </button>
        </div>
        <div style={{ padding: "18px 22px" }}>
          {err && <div style={{ fontSize: 12, color: T.error, marginBottom: 12 }}>{err}</div>}
          {loading ? (
            <div style={{ color: T.lo, fontSize: 12.5 }}>Memuat…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {KPI_CONFIG_FIELDS.map((g) => (
                <div key={g.group}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: T.mid, marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
                    <span>{g.group}</span>
                    <span style={{ color: Math.abs(sumOf(g.keys) - 1) < 0.001 ? T.success : T.warning }}>Total: {sumOf(g.keys).toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {g.keys.map((f) => (
                      <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, width: 130, fontSize: 12, color: T.mid, cursor: canEdit ? "pointer" : "default" }}>
                          <input type="checkbox" checked={enabled[f.key]} disabled={!canEdit} onChange={() => toggle(f.key)} />
                          {f.label}
                        </label>
                        <input
                          type="number" step="0.05" min="0" max="1"
                          value={values[f.key]}
                          disabled={!canEdit || !enabled[f.key]}
                          onChange={(e) => setField(f.key, e.target.value)}
                          style={{
                            flex: 1, padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.line}`,
                            fontSize: 12.5, fontFamily: FONT, color: T.hi,
                            background: (canEdit && enabled[f.key]) ? "#fff" : "#F0F2F5",
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!canEdit && (
                <div style={{ fontSize: 11.5, color: T.lo, background: "#F7F8FA", padding: "10px 12px", borderRadius: 9 }}>
                  Hanya SPM Sumatera yang bisa mengubah rumus ini. Kamu bisa melihat konfigurasi saat ini di atas.
                </div>
              )}
              <div style={{ fontSize: 11.5, color: T.lo, lineHeight: 1.5, background: "#F7F8FA", padding: "10px 12px", borderRadius: 9 }}>
                <b>Achievement</b> = Total Actual Revenue ÷ Total Target Revenue × 100.<br/>
                <b>Produktivitas</b> = Total Actual Revenue ÷ Total Cost Actual × 100.<br/>
                <b>Geo Compliance</b> = % nomor MSISDN (SP/FWA) yang sudah divalidasi "Valid" terhadap site GA, dari menu Validasi MSISDN.<br/>
                Kedua rasio di atas tidak dibatasi (tidak di-cap 150%) - bobot di atas hanya menentukan komposisi Final Score.
              </div>
              {canEdit && (
                <div>
                  <button onClick={save} disabled={saving} style={{
                    padding: "9px 18px", borderRadius: 9, border: "none", fontSize: 12.5, fontWeight: 700,
                    background: saved ? T.success : T.primary, color: "#fff", cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1,
                  }}>
                    {saving ? "..." : saved ? "Tersimpan" : "Simpan Konfigurasi"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiSubRow({ icon: Icon, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11, fontWeight: 500, color: T.lo }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0, flexShrink: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {Icon && <Icon size={10.5} strokeWidth={2.2} />}
        {label}
      </span>
      {/* value dijaga TIDAK PERNAH wrap ke baris ke-2 - kalau sempit,
          teksnya sendiri sudah diringkas (fmtRpCompact K/Mn/Bn) di
          pemanggil, ellipsis di sini cuma jaring pengaman terakhir. */}
      <span style={{ color: T.mid, fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "60%" }}>{value}</span>
    </div>
  );
}

function Kpi({ label, value, sub, color, icon: Icon }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", background: "#fff", border: `1px solid ${T.line}`, borderRadius: 16,
        padding: "17px 18px", boxShadow: hover
          ? "0 2px 4px rgba(13,17,23,0.05), 0 12px 26px rgba(13,17,23,0.07)"
          : "0 1px 2px rgba(13,17,23,0.03), 0 6px 16px rgba(13,17,23,0.035)",
        transform: hover ? "translateY(-2px)" : "translateY(0)",
        transition: "transform .18s ease, box-shadow .18s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        {Icon && (
          <div style={{
            width: 34, height: 34, borderRadius: 11, flexShrink: 0,
            background: `linear-gradient(135deg, ${color}24, ${color}0a)`,
            border: `1px solid ${color}2b`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon size={16} color={color} strokeWidth={2.2} />
          </div>
        )}
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", color: T.lo, textTransform: "uppercase" }}>{label}</div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: T.hi, lineHeight: 1, letterSpacing: "-0.01em" }}>{value}</div>
      {sub && (
        <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px dashed ${T.line}`, display: "flex", flexDirection: "column", gap: 5 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

const card = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, fontSize: 13 };
const inp = { width: "100%", padding: "9px 12px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" };
const btn = { padding: "8px 13px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 };
