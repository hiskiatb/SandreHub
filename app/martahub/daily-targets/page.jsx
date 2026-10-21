"use client";
/**
 * /martahub/daily-targets - "Target Harian" (CMS desktop). Breakdown target
 * bulanan per Branch x MC x Kegiatan jadi target HARIAN, mengikuti format
 * kerja tim (Branch | MC | Kegiatan | TGT Bulan | Tgl 1..n | TGT MTD
 * otomatis). Terpisah total dari "Target Aktivitas" (mh_activity_target, di
 * Master Data) - itu target bulanan SP/FWA/Revenue resmi utk Achievement %
 * Dashboard, TIDAK diubah/disentuh oleh fitur ini.
 *
 * Model data:
 *  - mh_daily_target_categories: daftar "Kegiatan" (Event Besar, VA Kecamatan,
 *    dst) - bisa dikelola (tambah/edit/nonaktifkan) dari sini.
 *  - Branch x MC: TIDAK dikelola manual di sini - diambil LANGSUNG dari
 *    Master Data Site (mh_sites_monthly, fallback mh_sites aktif kalau bulan
 *    itu belum pernah diupload) via RPC mh_daily_target_mc_list(p_month),
 *    supaya breakdown MC per branch selalu sesuai data resmi utk bulan yg
 *    dipilih (tidak ada input manual MC yang bisa out-of-sync).
 *  - mh_daily_targets: satu baris per (branch_id, MC, Kegiatan, Bulan) -
 *    target_month + kolom `daily` (jsonb, {"1": 11, "2": 11, ...}) + TGT MTD
 *    dihitung client side (jumlah semua nilai harian yg terisi).
 *
 * Auto-breakdown: begitu TGT Bulan diisi/diubah, sisa hari BELUM TERLEWAT
 * (hari ini s/d akhir bulan) otomatis dibagi rata; hari yg SUDAH TERLEWAT di
 * bulan berjalan dan nilai yg sudah diisi manual TIDAK pernah ditimpa oleh
 * auto-split (jangan rusak yg sudah ada - hari yg lewat tetap diam).
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, X, Loader2, Download, Upload, CardSim, Router, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";
import MartaShell, { T } from "../components/MartaShell";
import ExcelFilter from "../components/ExcelFilter";
import supabaseMarta from "../../../lib/supabaseMarta";

// Label kolom "Bulan" & nama file berbeda antara mode Target/Actual, tapi
// bentuk tabel (Branch|MC|Kegiatan|<Bulan>|1..31|MTD) SAMA PERSIS - termasuk
// sama dgn format file DATA_MANUAL_TRACKER yg dipakai tim (sheet "DATA TGT"
// & "DATA MANUAL ACV") - supaya Export dari sini bisa diisi ulang manual di
// Excel lalu di-Import balik, atau file tracker lama user bisa diimport
// langsung ke sini tanpa perlu diubah formatnya dulu.
const MODES = {
  target: { label: "Target", bulanLabel: "TGT Bulan", mtdLabel: "TGT MTD", valueField: "target_month", listRpc: "mh_daily_targets_list", upsertRpc: "mh_daily_targets_upsert_batch" },
  actual: { label: "Actual", bulanLabel: "ACV Bulan", mtdLabel: "ACV MTD", valueField: "actual_month", listRpc: "mh_daily_actuals_list", upsertRpc: "mh_daily_actuals_upsert_batch" },
};

const DAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
// Palet utk ExcelFilter (minta key t.hi/t.mid/t.lo/t.blue/t.blueBg) - dipetakan
// dari T MartaHub (t.blue -> T.primary/merah brand, bukan biru generik),
// persis pola yg sama dipakai di Activity Plan/POSMAT/MSISDN Validation.
const T_FILTER = { hi: T.hi, mid: T.mid, lo: T.lo, blue: T.primary, blueBg: T.primaryBg };
// Daftar region SAMA PERSIS dgn REGIONS di app/martahub/branches/BranchesBody.jsx
// (sumber: Master Data Site via RPC mh_daily_target_mc_list) - dipakai opsi checklist filter Region.
const REGIONS = ["NORTH SUMATERA", "CENTRAL SUMATERA", "SOUTH SUMATERA"];

function currentYYYYMM() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function daysInMonth(month) {
  const y = +month.slice(0, 4), m = +month.slice(4, 6);
  return new Date(y, m, 0).getDate();
}
function monthLabel(month) {
  const y = +month.slice(0, 4), m = +month.slice(4, 6);
  return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}
function isTodayOrFuture(month, day) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = new Date(+month.slice(0, 4), +month.slice(4, 6) - 1, day);
  return d.getTime() >= now.getTime();
}
// TGT MTD = "target SAMPAI DENGAN hari ini", BUKAN total sebulan penuh (itu
// TGT Bulan) - jumlah hari yg dihitung tergantung posisi `month` relatif ke
// hari ini: bulan yg SUDAH LEWAT penuh -> semua harinya ikut dihitung;
// bulan yg BELUM MULAI -> 0 hari (belum ada yg lewat); bulan BERJALAN -> s/d
// tanggal hari ini saja.
// Nama Branch dari Master Data Site SEMUA HURUF BESAR (sumber data memang
// begitu) - biar tampilan lebih enak dibaca (tidak teriak kapital semua),
// ditampilkan Title Case di UI/export, TAPI data mentahnya (branch.name)
// TETAP uppercase apa adanya - cuma dipakai pas RENDER, tidak dipakai utk
// matching/lookup (siteKey dll tetap pakai uppercase asli).
function titleCase(str) {
  return String(str || "").toLowerCase().replace(/(^|[\s/.'-])([a-z])/g, (m, sep, c) => sep + c.toUpperCase());
}

function daysUpToToday(month) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const y = +month.slice(0, 4), m = +month.slice(4, 6);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  if (last.getTime() < now.getTime()) return last.getDate();
  if (first.getTime() > now.getTime()) return 0;
  return now.getDate();
}
function dowOf(month, day) {
  return new Date(+month.slice(0, 4), +month.slice(4, 6) - 1, day).getDay();
}
// Label tanggal singkat utk subtitle tombol DAILY ACH. (mis. "21 Okt").
function dayLabel(month, day) {
  return new Date(+month.slice(0, 4), +month.slice(4, 6) - 1, day).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export default function DailyTargetsPage() {
  return (
    <MartaShell active="daily-targets" title="Report DTU" subtitle="Breakdown target & actual harian per Branch x MC x Kegiatan, termasuk rincian nomor MSISDN.">
      {(ctx) => <Body email={ctx?.session?.user?.email} canManage={ctx?.canManage} />}
    </MartaShell>
  );
}

function Body({ email, canManage }) {
  const [mode, setMode] = useState("target"); // "target" | "actual" - sama grid, RPC & label beda (lihat MODES)
  const M = MODES[mode];
  // [{branch_id,branch_name,mc,region}] - LANGSUNG dari Master Data Site
  // (RPC mh_daily_target_mc_list, yg di-backing tabel mh_sites_monthly /
  // mh_sites) - `region` ditarik dari kolom region di Master Data Site itu
  // sendiri (bukan dr tabel mh_branches terpisah spt percobaan awal), jadi
  // SELALU konsisten dgn branch/MC yg sedang ditampilkan utk bulan ini;
  // tidak perlu fetch/join terpisah lagi.
  const [mcRows, setMcRows] = useState([]);
  const [cats, setCats] = useState([]); // [{id,name,sort_order,active}]
  const [month, setMonth] = useState(currentYYYYMM());
  // Dataset TARGET & ACTUAL SEKARANG SELALU di-fetch BERDUA (bukan cuma
  // dataset mode yg lagi aktif di toggle Target/Actual) - dibutuhkan supaya
  // kartu ringkasan ACH. bisa bandingin PENCAPAIAN BENERAN (data Actual) vs
  // TARGET BENERAN (data Target), independen dari toggle mode yg cuma
  // ngatur grid mana yg lagi diedit di bawah (lihat kegiatanStats).
  const [existingTarget, setExistingTarget] = useState([]);
  const [existingActual, setExistingActual] = useState([]);
  const existing = mode === "target" ? existingTarget : existingActual; // rows utk GRID yg lagi diedit (ikut toggle mode)
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [rows, setRows] = useState({});
  // Dirty tracking - true kalau ada perubahan di `rows` yg BELUM disimpan
  // (diset true tiap setDay, direset false tiap prefill ulang dari server
  // ATAU abis save sukses). Dipakai utk disable tombol Simpan pas tidak ada
  // perubahan, & utk munculin konfirmasi pas pindah tab Target/Actual tanpa
  // nyimpen dulu.
  const [dirty, setDirty] = useState(false);
  const [pendingMode, setPendingMode] = useState(null); // key(branchId|mc|catId) -> { [valueField], daily:{day:val} }
  const [openBranch, setOpenBranch] = useState({}); // branchId -> bool; DEFAULT TERBUKA (lihat isOpen di bawah - absennya key dianggap true) - collapse per-branch tetap bisa, cuma lewat klik baris branch-nya sendiri, bukan tombol global lagi.
  const [catModal, setCatModal] = useState(null); // null | {} | {...cat}
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  // Modal preview+pemetaan kolom Import (spt Import Data Site) - diisi
  // handleImportFile() stlh baca file, null kalau modal lagi ditutup.
  const [importModal, setImportModal] = useState(null);
  const fileRef = useRef(null);
  const [msisdnModal, setMsisdnModal] = useState(null); // null | {branchId,branchName,mc,catId,catName,date,loading,rows}
  // Tinggi grid DIUKUR, bukan ditebak via calc(100vh - Npx) - angka tebakan
  // gampang basi begitu toolbar di atasnya berubah tinggi (nambah baris
  // filter, banner error/sukses muncul, dst), bikin batas tinggi jadi terlalu
  // longgar - grid-nya sendiri jadi TIDAK PERNAH scroll internal (karena
  // selalu muat di bawah batas yg kelonggaran itu), dan begitu itu terjadi,
  // justru HALAMAN yg scroll (bukan grid-nya) - akibatnya header yg sticky
  // (relatif ke scrollport grid) ikut terbawa scroll halaman & "hilang".
  // Diukur ulang tiap resize window & tiap kali konten di ATAS grid
  // berpotensi berubah tinggi (ganti mode/bulan, banner muncul/hilang, dst).
  const gridWrapRef = useRef(null);
  const [gridMaxH, setGridMaxH] = useState(480);
  // Filter Branch/MC/Kegiatan skrg pakai ExcelFilter (lihat th-nya) yg urus
  // open-state sendiri. Filter TANGGAL masih custom (lihat DayFilterPopover
  // di bawah file) krn triggernya seluruh header tgl (bukan tombol kecil) -
  // dayFilterOpen = nomor hari yg lagi dibuka popovernya (atau null),
  // dayFilterAnchor = getBoundingClientRect() th yg diklik, dipakai sbg
  // posisi AWAL popover (habis itu bisa digeser bebas - lihat drag di
  // DayFilterPopover).
  const [dayFilterOpen, setDayFilterOpen] = useState(null);
  const [dayFilterAnchor, setDayFilterAnchor] = useState(null);
  // Hover "crosshair" (highlight header tanggal + baris Kegiatan/Branch/MC
  // begitu kursor di atas satu sel) SENGAJA TIDAK pakai React state lagi -
  // versi pertama pakai useState(hoverDay/hoverRowKey/hoverMcKey) di komponen
  // Body ini, yg berarti SETIAP gerak mouse re-render ULANG SELURUH Body
  // (ribuan sel/input di semua branch yg default terbuka) - itu penyebab
  // lag/delay yg dirasa. Fix: tulis highlight langsung ke DOM lewat satu
  // <style> tag yg diisi manual (textContent) + satu data-attribute di
  // wrapper grid, SAMA SEKALI tanpa setState - browser cuma perlu hitung
  // ulang CSS (murah), React tidak ikut re-render apa pun. Lihat
  // `handleGridHover`/`handleGridLeave` + `data-day`/`data-row`/`data-mc` di
  // sel-sel tabel, dan `DAY_HOVER_CSS` (rule statis utk highlight kolom
  // tanggal, mengikuti header) di bawah file ini.
  const hoverStyleRef = useRef(null);
  const handleGridHover = useCallback((e) => {
    const dayEl = e.target.closest("[data-day]");
    const rowEl = e.target.closest("[data-row]");
    const mcEl = e.target.closest("[data-mc]");
    const day = dayEl?.dataset.day || "";
    const rk = rowEl?.dataset.row || "";
    const mk = mcEl?.dataset.mc || "";
    if (gridWrapRef.current && gridWrapRef.current.dataset.hoverDay !== day) gridWrapRef.current.dataset.hoverDay = day;
    if (hoverStyleRef.current) {
      const esc = (v) => v.replace(/"/g, "");
      let css = "";
      if (mk) css += `.mh-dtu-grid [data-mc="${esc(mk)}"]{background:${T.primaryBg} !important}`;
      if (rk) css += `.mh-dtu-grid [data-row="${esc(rk)}"]{background:${T.primaryBg} !important}`;
      if (rk && day) css += `.mh-dtu-grid [data-row="${esc(rk)}"][data-day="${esc(day)}"]{background:rgba(237,28,36,0.18) !important}`;
      hoverStyleRef.current.textContent = css;
    }
  }, []);
  const handleGridLeave = useCallback(() => {
    if (gridWrapRef.current) gridWrapRef.current.dataset.hoverDay = "";
    if (hoverStyleRef.current) hoverStyleRef.current.textContent = "";
  }, []);
  useEffect(() => {
    function recalc() {
      const el = gridWrapRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setGridMaxH(Math.max(260, window.innerHeight - top - 20));
    }
    recalc();
    window.addEventListener("resize", recalc);
    const id = setTimeout(recalc, 50); // sekali lagi setelah layout benar2 settle (mis. font/scrollbar)
    return () => { window.removeEventListener("resize", recalc); clearTimeout(id); };
  }, [loading, err, ok, importSummary, mode]);
  const [showInactiveCats, setShowInactiveCats] = useState(false); // kegiatan nonaktif disembunyikan default - declutter toolbar, tinggal diexpand kalau perlu
  // Filter per kolom (Branch/MC/Kegiatan) - multi-select checklist (spt
  // AutoFilter Excel/Google Sheets): Set KOSONG = semua ditampilkan (belum
  // difilter); Set BERISI = cuma baris yg value-nya ADA di dalam Set itu yg
  // ditampilkan. Dipilih lewat popover ColumnChecklistFilter (search + pilih
  // semua + centang satu-satu + Reset/Terapkan), dibuka dari tombol corong
  // di header - lihat HeaderFilterCell.
  // Region DEFAULT difilter ke "NORTH SUMATERA" per permintaan (bukan
  // kosong/semua spt kolom lain) - user kerjanya di region ini, jadi
  // halaman langsung kebuka ke scope yg relevan tanpa perlu filter manual
  // tiap buka halaman. Tetap bisa diganti/dikosongkan lewat ExcelFilter-nya
  // spt kolom lain (lihat th Region).
  const [filterRegions, setFilterRegions] = useState(() => new Set(["NORTH SUMATERA"]));
  const [filterBranches, setFilterBranches] = useState(() => new Set());
  const [filterMcs, setFilterMcs] = useState(() => new Set());
  const [filterCats, setFilterCats] = useState(() => new Set());
  // TGT Bulan SKRG DIHITUNG OTOMATIS (jumlah seluruh TGT harian sebulan -
  // lihat bulanOf di bawah), bukan input manual lagi - tapi tetap bisa
  // difilter spt kolom lain (checklist nilai hasil hitungan), makanya tetap
  // butuh Set filter-nya sendiri sama persis spt filterBranches/dst.
  const [filterBulan, setFilterBulan] = useState(() => new Set());
  // Filter per TANGGAL (kolom harian) - sama2 checklist multi-select spt
  // Branch/MC/Kegiatan, tapi dipicu klik di HEADER tanggalnya sendiri
  // (bukan tombol corong - tanggal terlalu sempit utk ikon tambahan).
  // key = nomor hari (string), value = Set nilai yg dipilih (angka sbg
  // string, atau "(Kosong)" utk sel yg belum diisi).
  const [dayFilters, setDayFilters] = useState(() => ({}));

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      // Target & Actual DIAMBIL BERDUA skrg (bukan cuma salah satu sesuai
      // mode) - lihat komentar di deklarasi existingTarget/existingActual.
      const [mc, cc, dt, da] = await Promise.all([
        supabaseMarta.rpc("mh_daily_target_mc_list", { p_month: month }),
        supabaseMarta.rpc("mh_daily_target_categories_list"),
        supabaseMarta.rpc(MODES.target.listRpc, { p_month: month }),
        supabaseMarta.rpc(MODES.actual.listRpc, { p_month: month }),
      ]);
      if (mc.error) throw new Error(mc.error.message);
      setMcRows(mc.data || []);
      setCats((cc.data || []));
      setExistingTarget(dt.data || []);
      setExistingActual(da.data || []);
    } catch (e) { setErr(e.message || "Gagal memuat data"); }
    finally { setLoading(false); }
  }, [month]);
  useEffect(() => { load(); }, [load]);
  // Ganti mode -> reset pesan sukses/import lama (bukan utk mode sebelumnya)
  useEffect(() => { setOk(""); setErr(""); setImportSummary(null); }, [mode]);

  const activeCats = useMemo(() => cats.filter((c) => c.active !== false), [cats]);

  // Branch & MC SELALU mengikuti Master Data Site utk bulan yg dipilih
  // (mh_daily_target_mc_list) - tidak ada input manual di sini.
  const branches = useMemo(() => {
    const m = new Map();
    for (const r of mcRows) if (!m.has(r.branch_id)) m.set(r.branch_id, { id: r.branch_id, name: r.branch_name, region: r.region || "-" });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [mcRows]);
  const mcsByBranch = useMemo(() => {
    const m = new Map();
    for (const r of mcRows) { if (!m.has(r.branch_id)) m.set(r.branch_id, []); m.get(r.branch_id).push(r.mc); }
    return m;
  }, [mcRows]);
  // Daftar nama MC unik (lintas branch) utk opsi checklist filter kolom MC.
  const allMcNames = useMemo(() => [...new Set(mcRows.map((r) => r.mc))].sort(), [mcRows]);
  // Opsi checklist utk filter per-tanggal: nilai unik yg BENERAN ada di
  // data (rows) utk tanggal itu + "(Kosong)" kalau ada sel yg masih blank -
  // dihitung dari `rows` (state gabungan data tersimpan + draft input), jadi
  // selalu reflect apa yg beneran kelihatan di grid.
  const dayOptions = useCallback((d) => {
    const key = String(d);
    const vals = new Set();
    let hasEmpty = false;
    for (const rk in rows) {
      const v = rows[rk]?.daily?.[key];
      if (v === undefined || v === null || v === "") hasEmpty = true;
      else vals.add(String(v));
    }
    const opts = [...vals].sort((a, b) => Number(a) - Number(b)).map((v) => ({ value: v, label: v }));
    if (hasEmpty) opts.unshift({ value: "(Kosong)", label: "(Kosong)" });
    return opts;
  }, [rows]);
  // Jumlah SEMUA TGT harian dlm satu row (dipakai TGT Bulan - "sepanjang
  // bulan") - helper murni angka, dipakai bulanOf() & opsi filter di bawah.
  function sumDaily(daily) {
    const keys = Object.keys(daily || {}).filter((k) => daily[k] !== "" && daily[k] != null);
    return { sum: keys.reduce((s, k) => s + (Number(daily[k]) || 0), 0), hasAny: keys.length > 0 };
  }
  // Opsi checklist utk filter TGT Bulan: nilai unik hasil JUMLAH seluruh
  // TGT harian tiap row yg lagi ada di `rows` + "(Kosong)" kalau ada row
  // yg belum ada isian harian sama sekali.
  const bulanOptions = useMemo(() => {
    const vals = new Set();
    let hasEmpty = false;
    for (const rk in rows) {
      const { sum, hasAny } = sumDaily(rows[rk]?.daily);
      if (!hasAny) hasEmpty = true; else vals.add(String(sum));
    }
    const opts = [...vals].sort((a, b) => Number(a) - Number(b)).map((v) => ({ value: v, label: v }));
    if (hasEmpty) opts.unshift({ value: "(Kosong)", label: "(Kosong)" });
    return opts;
  }, [rows]);
  // Cek satu row (object { [valueField]:.., daily:{...} }) lolos semua
  // filter tanggal + filter TGT Bulan yg lagi aktif atau tidak.
  function rowPassesDayFilters(r) {
    for (const dStr in dayFilters) {
      const set = dayFilters[dStr];
      if (!set || set.size === 0) continue;
      const v = r?.daily?.[dStr];
      const vk = v === undefined || v === null || v === "" ? "(Kosong)" : String(v);
      if (!set.has(vk)) return false;
    }
    if (filterBulan.size > 0) {
      const { sum, hasAny } = sumDaily(r?.daily);
      const vk = hasAny ? String(sum) : "(Kosong)";
      if (!filterBulan.has(vk)) return false;
    }
    return true;
  }

  // Prefill rows dari data tersimpan tiap ganti bulan/mode.
  useEffect(() => {
    const next = {};
    for (const r of existing) {
      next[`${r.branch_id}|${r.mc}|${r.category_id}`] = {
        [M.valueField]: r[M.valueField] ?? "",
        daily: { ...(r.daily || {}) },
      };
    }
    setRows(next);
    setDirty(false);
  }, [existing, M.valueField]);

  async function openMsisdnModal(branch, mc, cat, dateStr) {
    setMsisdnModal({ branchId: branch.id, branchName: branch.name, mc, catId: cat.id, catName: cat.name, date: dateStr, loading: true, rows: [] });
    try {
      const { data, error } = await supabaseMarta.rpc("mh_dtu_actual_msisdn_list", {
        p_branch_id: branch.id, p_mc: mc, p_category_id: cat.id, p_date: dateStr,
      });
      if (error) throw new Error(error.message);
      setMsisdnModal((p) => (p ? { ...p, loading: false, rows: data || [] } : p));
    } catch (e) {
      setMsisdnModal((p) => (p ? { ...p, loading: false, rows: [], err: e.message || "Gagal memuat MSISDN" } : p));
    }
  }

  function rowKey(branchId, mc, catId) { return `${branchId}|${mc}|${catId}`; }
  function getRow(branchId, mc, catId) { return rows[rowKey(branchId, mc, catId)] || { [M.valueField]: "", daily: {} }; }

  // setTargetMonth() (dulu dipanggil dr input TGT Bulan - user isi total,
  // auto-split ke sisa hari) SUDAH DIHAPUS: alur dibalik per permintaan -
  // TGT Bulan sekarang MURNI hasil hitung (bulanOf, lihat di bawah), isinya
  // selalu lewat kolom harian satu2 (setDay), bukan input total lagi.

  function setDay(branchId, mc, catId, day, value) {
    setRows((prev) => {
      const key = rowKey(branchId, mc, catId);
      const cur = prev[key] || { [M.valueField]: "", daily: {} };
      return { ...prev, [key]: { ...cur, daily: { ...cur.daily, [String(day)]: value === "" ? "" : Number(value) } } };
    });
    setDirty(true);
  }

  // TGT MTD = jumlah TGT harian dari tgl 1 s/d HARI INI saja (lihat
  // daysUpToToday) - BUKAN seluruh bulan (itu TGT Bulan/bulanOf di bawah).
  function mtdOf(branchId, mc, catId) {
    const r = getRow(branchId, mc, catId);
    const limit = daysUpToToday(month);
    let s = 0;
    for (let d = 1; d <= limit; d++) { const v = r.daily?.[String(d)]; if (v !== "" && v != null) s += Number(v) || 0; }
    return s;
  }
  // TGT Bulan = jumlah SELURUH TGT harian sepanjang bulan (semua tanggal) -
  // DIHITUNG OTOMATIS dari input harian, TIDAK diisi manual lagi (dulu
  // sebaliknya: TGT Bulan diisi manual lalu di-auto-split ke harian lewat
  // setTargetMonth() - fungsi itu sudah tidak dipakai lagi, alur dibalik).
  function bulanOf(branchId, mc, catId) {
    const r = getRow(branchId, mc, catId);
    return sumDaily(r.daily).sum;
  }
  // ACH. HARI INI = nilai TGT harian PAS tanggal hari ini saja (1 hari),
  // beda dgn ACH. MTD (mtdOf, kumulatif tgl 1 s/d hari ini) - dipakai kartu
  // ringkasan Kegiatan, dipilih lewat toggle `achMode` (lihat di bawah).
  // Kalau bulan yg lagi dibuka bukan bulan berjalan, "hari ini" tidak ada
  // di bulan itu -> 0.
  function todayOf(branchId, mc, catId) {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const y = +month.slice(0, 4), m = +month.slice(4, 6);
    if (now.getFullYear() !== y || now.getMonth() + 1 !== m) return 0;
    const r = getRow(branchId, mc, catId);
    const v = r.daily?.[String(now.getDate())];
    return v !== "" && v != null ? Number(v) || 0 : 0;
  }

  // --- Helper KHUSUS kartu ringkasan ACH. (BUKAN grid yg diedit) ---
  // Versi todayOf/mtdOf/bulanOf di atas selalu baca dari `rows` (dataset
  // mode yg LAGI DIEDIT). Kartu ACH. butuh bandingin data TARGET asli vs
  // data ACTUAL asli SEKALIGUS, independen dr toggle mode - makanya pakai
  // existingTarget/existingActual (selalu di-fetch berdua, lihat load())
  // lewat Map di bawah, bukan `rows`.
  const targetRowMap = useMemo(() => {
    const m = new Map();
    for (const r of existingTarget) m.set(rowKey(r.branch_id, r.mc, r.category_id), r);
    return m;
  }, [existingTarget]);
  const actualRowMap = useMemo(() => {
    const m = new Map();
    for (const r of existingActual) m.set(rowKey(r.branch_id, r.mc, r.category_id), r);
    return m;
  }, [existingActual]);
  function bulanOfMap(map, branchId, mc, catId) {
    const r = map.get(rowKey(branchId, mc, catId));
    return sumDaily(r?.daily).sum;
  }
  function mtdOfMap(map, branchId, mc, catId) {
    const r = map.get(rowKey(branchId, mc, catId));
    const limit = daysUpToToday(month);
    let s = 0;
    for (let d = 1; d <= limit; d++) { const v = r?.daily?.[String(d)]; if (v !== "" && v != null) s += Number(v) || 0; }
    return s;
  }
  function todayOfMap(map, branchId, mc, catId) {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const y = +month.slice(0, 4), m2 = +month.slice(4, 6);
    if (now.getFullYear() !== y || now.getMonth() + 1 !== m2) return 0;
    const r = map.get(rowKey(branchId, mc, catId));
    const v = r?.daily?.[String(now.getDate())];
    return v !== "" && v != null ? Number(v) || 0 : 0;
  }
  // Versi generik todayOfMap - ambil nilai utk TANGGAL BERAPA PUN (dipakai
  // DAILY ACH. yg skrg bisa pilih tanggal lain, tidak cuma "hari ini" lagi).
  function dayOfMap(map, branchId, mc, catId, day) {
    const r = map.get(rowKey(branchId, mc, catId));
    const v = r?.daily?.[String(day)];
    return v !== "" && v != null ? Number(v) || 0 : 0;
  }

  async function saveAll() {
    setSaving(true); setErr(""); setOk("");
    try {
      const payload = [];
      for (const branch of branches) {
        const list = mcsByBranch.get(branch.id) || [];
        for (const mc of list) {
          for (const cat of activeCats) {
            const key = rowKey(branch.id, mc, cat.id);
            const r = rows[key];
            if (!r || Object.keys(r.daily || {}).length === 0) continue;
            const cleanDaily = {};
            for (const [d, v] of Object.entries(r.daily || {})) if (v !== "" && v != null) cleanDaily[d] = Number(v);
            // TGT Bulan DIKIRIM = hasil hitungan bulanOf() (jumlah seluruh TGT
            // harian), BUKAN r[M.valueField] lagi - sudah tidak diisi manual.
            payload.push({
              branch_id: branch.id, branch_name: branch.name, mc,
              category_id: cat.id, category_name: cat.name,
              month, [M.valueField]: bulanOf(branch.id, mc, cat.id),
              daily: cleanDaily, note: null,
            });
          }
        }
      }
      if (!payload.length) { setOk("Tidak ada perubahan untuk disimpan."); setSaving(false); return true; }
      const { error } = await supabaseMarta.rpc(M.upsertRpc, { p_rows: payload, p_caller_email: email });
      if (error) throw new Error(error.message);
      setOk(`Tersimpan ${payload.length} baris untuk ${monthLabel(month)}.`);
      setDirty(false);
      await load();
      return true;
    } catch (e) { setErr(e.message || "Gagal menyimpan target harian"); return false; }
    finally { setSaving(false); }
  }

  // Ganti tab Target/Actual - kalau ada perubahan BELUM disimpan (dirty),
  // jangan langsung pindah: tahan dulu di `pendingMode`, munculin modal
  // konfirmasi (Simpan / Buang Perubahan / Batal). Kalau tidak dirty,
  // pindah langsung spt biasa.
  function requestModeSwitch(key) {
    if (key === mode) return;
    if (dirty) { setPendingMode(key); return; }
    setMode(key);
  }
  async function confirmSaveAndSwitchMode() {
    const ok2 = await saveAll();
    if (ok2 && pendingMode) { setMode(pendingMode); setPendingMode(null); }
  }
  function confirmDiscardAndSwitchMode() {
    if (pendingMode) { setMode(pendingMode); setPendingMode(null); }
  }

  // Export - bikin file Excel dgn format SAMA PERSIS spt file tracker tim
  // (Branch | MC | Kegiatan | <Bulan> | Tgl 1..n | <MTD>), dari data yg
  // sedang tampil (branch x MC dari Master Data Site bulan ini, x Kegiatan
  // aktif). Baris/kolom kosong tetap diexport (nilai 0/blank) biar file bisa
  // dipakai sbg "lembar kerja" lalu diisi manual & di-import balik.
  function exportExcel() {
    // Export SEKARANG ikut semua filter yg sedang aktif (region di atas +
    // filter per-kolom di tabel: Branch/MC/Kegiatan/tanggal/TGT Bulan) -
    // kalau lagi di scope NORTH SUMATERA, file yg didownload cuma berisi
    // data NORTH SUMATERA, dst. Pakai helper `exportScopeCats` yg sama
    // persis logikanya dgn filter tbody di render grid.
    const catsToShow = filterCats.size === 0 ? activeCats : activeCats.filter((c) => filterCats.has(c.id));
    const hasDayFilter = Object.keys(dayFilters).length > 0 || filterBulan.size > 0;
    const header = ["MC#", "Branch", "MC", "Kegiatan", M.bulanLabel, ...days.map(String), "", M.mtdLabel];
    const aoa = [header];
    let no = 0;
    for (const branch of branches
      .filter((b) => filterRegions.size === 0 || filterRegions.has(b.region))
      .filter((b) => filterBranches.size === 0 || filterBranches.has(b.id))) {
      const list = (mcsByBranch.get(branch.id) || []).filter((mc) => filterMcs.size === 0 || filterMcs.has(mc));
      for (const mc of list) {
        for (const cat of catsToShow) {
          const r = getRow(branch.id, mc, cat.id);
          if (hasDayFilter && !rowPassesDayFilters(r)) continue;
          no++;
          const mtd = mtdOf(branch.id, mc, cat.id);
          const bulanTotal = bulanOf(branch.id, mc, cat.id);
          const row = [no, branch.name, mc, cat.name, bulanTotal || ""];
          for (const d of days) { const v = r.daily?.[String(d)]; row.push(v === "" || v == null ? "" : Number(v)); }
          row.push(""); row.push(mtd || "");
          aoa.push(row);
        }
      }
    }
    if (aoa.length === 1) { setErr("Tidak ada data yang cocok dengan filter aktif untuk diexport."); return; }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 6 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 10 }, ...days.map(() => ({ wch: 6 })), { wch: 2 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, mode === "target" ? "DATA TGT" : "DATA MANUAL ACV");
    XLSX.writeFile(wb, `martahub_${mode}_harian_${month}.xlsx`);
  }

  // Import - baca file Excel dgn format sama (sheet pertama dipakai, kolom
  // dicari berdasar HEADER, bukan posisi tetap, supaya file "DATA TGT" /
  // "DATA MANUAL ACV" dari tracker Excel asli tim ATAUPUN file hasil Export
  // di atas, keduanya bisa langsung diimport tanpa modifikasi). Branch+MC
  // dicocokkan ke Master Data Site bulan ini (TIDAK bikin MC baru - baris yg
  // branch/MC-nya tidak ketemu dilaporkan sbg "tidak cocok", dilewati).
  // Kegiatan dicocokkan ke nama kategori (dibuat otomatis kalau belum ada &
  // caller boleh kelola kategori). Upload ini MENIMPA (upsert) baris yg
  // branch+MC+kegiatan+bulannya sama - bukan menambah baris baru.
  // Cari kolom yg namanya cocok dgn salah satu `needles` (case-insensitive,
  // substring) - dipakai utk NEBAK pemetaan kolom default (Branch/MC/
  // Kegiatan), sama prinsipnya spt guessMapping() di fitur Import Data Site
  // (master/page.jsx) - cuma disederhanakan khusus utk 3 kolom wajib di sini.
  function guessCol(headerRow, needles) {
    const idx = headerRow.findIndex((v) => needles.some((n) => String(v || "").trim().toLowerCase().includes(n)));
    return idx >= 0 ? idx : "";
  }

  // STEP 1: baca file & tebak baris header + pemetaan kolom secara OTOMATIS,
  // lalu BUKA MODAL PREVIEW+PEMETAAN (sama polanya spt Import Data Site di
  // master/page.jsx) - BUKAN langsung import spt dulu. User lihat preview,
  // pilih baris header (kalau tebakan salah/file formatnya beda), & petakan
  // ulang kolom Branch/MC/Kegiatan manual kalau nama kolomnya tidak persis
  // "Branch"/"MC"/"Kegiatan". Kolom tanggal (1..31) TETAP auto-detect dari
  // baris header yg dipilih (angka 1-31) - tidak perlu dipetakan manual.
  async function handleImportFile(file) {
    if (!canManage || !file) return;
    setErr(""); setOk(""); setImportSummary(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      if (!wb.SheetNames?.length) throw new Error("Berkas tidak punya sheet yg bisa dibaca.");
      // Pilih sheet PERTAMA yg isinya tidak kosong sbg tebakan awal (dulu
      // SELALU sheet pertama tanpa mikir - skrg user bisa ganti sendiri di
      // modal lewat dropdown "Pilih Sheet" kalau tebakan ini salah, krn file
      // tracker tim kadang sheet datanya bukan yg pertama).
      let initialSheet = wb.SheetNames[0];
      for (const name of wb.SheetNames) {
        const g = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" });
        if (g.length > 0) { initialSheet = name; break; }
      }
      setImportModal(buildImportModalState(wb, initialSheet, file.name));
    } catch (e) { setErr(e.message || "Gagal membaca berkas."); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  }

  // Bangun ulang state modal (grid + tebakan header/kolom) utk sheet yg
  // DIPILIH - dipanggil pas file pertama dibaca, ATAUPUN pas user GANTI
  // sheet lewat dropdown di modal (tiap sheet bisa beda struktur kolom, jadi
  // tebakan header & pemetaan kolom HARUS dihitung ulang dari nol).
  function buildImportModalState(wb, sheetName, fileName) {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
    let guessIdx = 0;
    for (let i = 0; i < Math.min(grid.length, 10); i++) {
      const row = grid[i].map((v) => String(v || "").trim().toLowerCase());
      if (row.indexOf("branch") >= 0 && row.indexOf("mc") >= 0 && row.indexOf("kegiatan") >= 0) { guessIdx = i; break; }
    }
    const headerRow = grid[guessIdx] || [];
    return {
      fileName,
      wb,
      sheetName,
      grid,
      headerIdx: guessIdx,
      colBranch: guessCol(headerRow, ["branch"]),
      colMc: guessCol(headerRow, ["mc"]),
      colKegiatan: guessCol(headerRow, ["kegiatan"]),
    };
  }

  // STEP 2: dipanggil dr tombol "Import" di modal pemetaan - jalanin
  // matching+upsert pakai kolom yg SUDAH DIKONFIRMASI (otomatis atau hasil
  // koreksi manual user), BUKAN lagi deteksi otomatis langsung spt sebelumnya.
  async function runMappedImport() {
    if (!importModal) return;
    const { grid, headerIdx, colBranch, colMc, colKegiatan } = importModal;
    if (colBranch === "" || colMc === "" || colKegiatan === "") {
      setErr("Petakan dulu kolom Branch, MC, dan Kegiatan sebelum import.");
      return;
    }
    setImporting(true); setErr(""); setOk(""); setImportSummary(null);
    try {
      const headerRow = (grid[headerIdx] || []).map((v) => String(v || "").trim().toLowerCase());
      // Kolom tanggal (1..31) auto-detect dari baris header yg DIPILIH user
      // di modal - bukan kolom yg bisa dipetakan manual (jumlahnya variatif
      // per file, lebih aman dideteksi otomatis dr nama kolom angka 1-31).
      const colDays = {};
      headerRow.forEach((v, ci) => { if (/^\d+$/.test(v) && +v >= 1 && +v <= 31) colDays[+v] = ci; });

      const siteKey = (b, m) => `${String(b).trim().toUpperCase()}|${String(m).trim().toUpperCase()}`;
      const siteMap = new Map(mcRows.map((r) => [siteKey(r.branch_name, r.mc), r]));
      const catMap = new Map(cats.map((c) => [String(c.name).trim().toLowerCase(), c]));

      // Import ikut filter aktif (region/branch/mc/kegiatan) - kalau scope
      // lagi NORTH SUMATERA, baris file yg branch/MC/kegiatan-nya di luar
      // scope itu dilewati (dihitung outOfFilter), SAMA spt export.
      const catsToShowImport = filterCats.size === 0 ? activeCats : activeCats.filter((c) => filterCats.has(c.id));
      const catIdsToShow = new Set(catsToShowImport.map((c) => c.id));
      const payload = [];
      let noMatch = 0, noCat = 0, outOfFilter = 0;
      for (let i = headerIdx + 1; i < grid.length; i++) {
        const row = grid[i];
        const branchTxt = row[colBranch], mcTxt = row[colMc], kegTxt = row[colKegiatan];
        if (!branchTxt || !mcTxt || !kegTxt) continue;
        const site = siteMap.get(siteKey(branchTxt, mcTxt));
        if (!site) { noMatch++; continue; }
        const cat = catMap.get(String(kegTxt).trim().toLowerCase());
        if (!cat) { noCat++; continue; }
        if (
          (filterRegions.size > 0 && !filterRegions.has(site.region)) ||
          (filterBranches.size > 0 && !filterBranches.has(site.branch_id)) ||
          (filterMcs.size > 0 && !filterMcs.has(site.mc)) ||
          (filterCats.size > 0 && !catIdsToShow.has(cat.id))
        ) { outOfFilter++; continue; }
        const daily = {};
        for (const [d, ci] of Object.entries(colDays)) {
          const v = row[ci];
          if (v !== "" && v != null && !Number.isNaN(Number(v))) daily[d] = Number(v);
        }
        // PENTING (lookup/matching): yg dipakai utk COCOKIN baris ke data
        // yg ada HANYA kolom Branch + MC + Kegiatan yg DIPETAKAN di modal
        // (+ bulan yg lagi dibuka di halaman) - lihat siteMap/catMap di
        // atas. Kolom "Bulan" (TGT Bulan/ACV Bulan) & TGT MTD TIDAK PERNAH
        // ikut dipetakan/dibaca sama sekali di sini - cuma kolom tanggal
        // 1..31 yg dibaca ke `daily`. TGT Bulan yg disimpan SELALU hasil
        // hitung ulang dr `daily` (dailySum di bawah), BUKAN dibaca dr file -
        // konsisten dgn alur Simpan & tampilan TGT Bulan di grid (selalu
        // auto, tidak pernah manual/dari file).
        const dailySum = Object.values(daily).reduce((sum, v) => sum + (Number(v) || 0), 0);
        payload.push({
          branch_id: site.branch_id, branch_name: site.branch_name, mc: site.mc,
          category_id: cat.id, category_name: cat.name, month,
          [M.valueField]: dailySum,
          daily, note: null,
        });
      }
      if (!payload.length) throw new Error("Tidak ada baris valid utk diimport (cek pemetaan kolom & filter yang sedang aktif).");
      const { error } = await supabaseMarta.rpc(M.upsertRpc, { p_rows: payload, p_caller_email: email });
      if (error) throw new Error(error.message);
      setImportSummary({ imported: payload.length, noMatch, noCat, outOfFilter });
      setOk(`Import selesai: ${payload.length} baris tersimpan untuk ${monthLabel(month)}.`);
      setImportModal(null);
      await load();
    } catch (e) { setErr(e.message || "Gagal import file"); }
    finally { setImporting(false); }
  }

  const nd = daysInMonth(month);
  const days = useMemo(() => Array.from({ length: nd }, (_, i) => i + 1), [nd]);
  const monthInputVal = `${month.slice(0, 4)}-${month.slice(4, 6)}`;

  const inactiveCats = useMemo(() => cats.filter((c) => c.active === false), [cats]);
  // Scope utk kartu ringkasan (Total Branch/MC + kartu Kegiatan) - ikut
  // filter REGION (scope selector utama halaman, defaultnya NORTH SUMATERA)
  // DAN SEKARANG JUGA ikut filter ad-hoc tabel (Branch/MC/Kegiatan/tanggal/
  // TGT Bulan) - DIUBAH per permintaan user, dulu kartu sengaja TIDAK ikut
  // filter tabel (biar selalu nunjukin scope "penuh"), tapi user mau kartu
  // ringkasan beneran cerminan dari apa yg lagi difilter di tabel di bawah.
  const scopedBranches = useMemo(() => {
    let list = filterRegions.size === 0 ? branches : branches.filter((b) => filterRegions.has(b.region));
    if (filterBranches.size > 0) list = list.filter((b) => filterBranches.has(b.id));
    return list;
  }, [branches, filterRegions, filterBranches]);
  const totalMc = useMemo(
    () => scopedBranches.reduce((n, b) => {
      const list = mcsByBranch.get(b.id) || [];
      const filtered = filterMcs.size === 0 ? list : list.filter((mc) => filterMcs.has(mc));
      return n + filtered.length;
    }, 0),
    [scopedBranches, mcsByBranch, filterMcs]
  );
  // Toggle "Pencapaian" kartu ringkasan Kegiatan: "mtd" (default, kumulatif
  // tgl 1 s/d hari ini) atau "today" (cuma tanggal hari ini saja) - lihat
  // togglenya di atas baris kartu Kegiatan.
  const [achMode, setAchMode] = useState("mtd");
  // Tanggal yg dipakai DAILY ACH. (dulu selalu "hari ini" literal) - skrg
  // bisa dipilih bebas lewat popover (opsi "Hari Ini" atau "Pilih Tanggal").
  // Default = tanggal hari ini (diclamp ke jumlah hari bulan yg lagi
  // ditampilkan, biar tidak nembus kalau bulan yg dibuka lebih pendek).
  const [achDay, setAchDay] = useState(() => new Date().getDate());
  // Basis TARGET khusus utk ACH. MTD - "full" (default, target sebulan
  // penuh, spt semula) atau "mtd" (target kumulatif s/d tanggal yg sama
  // dgn pencapaian MTD - perbandingan apple-to-apple per periode berjalan).
  // Tidak berlaku utk DAILY ACH. (itu sudah pasti target HARI ITU SAJA).
  const [mtdTargetBasis, setMtdTargetBasis] = useState("full");
  useEffect(() => { setAchDay((d) => Math.min(d, daysInMonth(month))); }, [month]);
  // Kartu ringkasan per-Kegiatan (gantiin kartu "Kegiatan Aktif" yg cuma
  // nunjukin COUNT kategori - skrg tiap kategori dpt kartu sendiri yg
  // bandingin TARGET (bulanOf - jumlah TGT harian sebulan) vs PENCAPAIAN
  // (mtdOf ATAU todayOf, tergantung `achMode` - lihat toggle-nya). SEKARANG
  // IKUT SEMUA FILTER TABEL yg aktif (Branch/MC/Kegiatan/tanggal/TGT Bulan),
  // bukan cuma Region - scopedBranches sudah ikut Branch, di sini tambahan
  // filter MC + Kegiatan (kartu per-kegiatan cuma muncul utk kegiatan yg
  // lolos filterCats) + filter tanggal/TGT Bulan per baris (rowPassesDayFilters,
  // SAMA fungsi yg dipakai nge-filter baris tabel di bawah).
  const kegiatanStats = useMemo(() => {
    const hasDayFilter = Object.keys(dayFilters).length > 0 || filterBulan.size > 0;
    const catsToUse = filterCats.size === 0 ? activeCats : activeCats.filter((c) => filterCats.has(c.id));
    return catsToUse.map((cat) => {
      let target = 0, tercapai = 0;
      for (const branch of scopedBranches) {
        for (const mc of mcsByBranch.get(branch.id) || []) {
          if (filterMcs.size > 0 && !filterMcs.has(mc)) continue;
          if (hasDayFilter && !rowPassesDayFilters(getRow(branch.id, mc, cat.id))) continue;
          // Kartu ACH. bandingin data TARGET asli vs data ACTUAL asli
          // SEKALIGUS (lewat targetRowMap/actualRowMap, selalu ke-fetch
          // berdua - lihat load()), BUKAN `rows` (yg cuma dataset mode yg
          // lagi diedit di grid) - KECUALI filter tanggal/TGT Bulan di atas,
          // yg SENGAJA tetap dicek lewat `rows` (data mode yg lagi dibuka di
          // grid) krn itu jg basis filter kolom tanggal/TGT Bulan di tabel.
          target += achMode === "today"
            ? dayOfMap(targetRowMap, branch.id, mc, cat.id, achDay)
            : (mtdTargetBasis === "mtd" ? mtdOfMap(targetRowMap, branch.id, mc, cat.id) : bulanOfMap(targetRowMap, branch.id, mc, cat.id));
          tercapai += achMode === "today" ? dayOfMap(actualRowMap, branch.id, mc, cat.id, achDay) : mtdOfMap(actualRowMap, branch.id, mc, cat.id);
        }
      }
      const pct = target > 0 ? Math.round((tercapai / target) * 100) : 0;
      return { cat, target, tercapai, pct };
    });
  }, [activeCats, scopedBranches, mcsByBranch, targetRowMap, actualRowMap, month, achMode, achDay, mtdTargetBasis, filterMcs, filterCats, dayFilters, filterBulan, rows]);
  // Grand total "ACH. Total Aktivasi" - gabungan SEMUA kegiatan jadi satu
  // ratio (total tercapai / total target seluruh kegiatan), konsepnya SAMA
  // persis spt kartu per-kegiatan di atas, cuma dijumlah semuanya. Gantiin
  // kartu "Total Branch" yg lama (info Branch/MC dipindah ke sebelah toggle
  // ACH. Hari Ini/MTD di bawah, bukan dihapus).
  const kegiatanGrandTotal = useMemo(() => {
    let target = 0, tercapai = 0;
    for (const s of kegiatanStats) { target += s.target; tercapai += s.tercapai; }
    const pct = target > 0 ? Math.round((tercapai / target) * 100) : 0;
    return { target, tercapai, pct };
  }, [kegiatanStats]);
  // Filter "ad-hoc" tabel (BUKAN scope Region di atas) - Branch/MC/Kegiatan/
  // tanggal/TGT Bulan per kolom. Kalau ada salah satu yg aktif, munculkan
  // tombol "Clear Filter" biar user bisa reset semuanya sekali klik tanpa
  // harus buka tiap kolom satu-satu.
  const tableFilterActive = filterBranches.size > 0 || filterMcs.size > 0 || filterCats.size > 0 || Object.keys(dayFilters).length > 0 || filterBulan.size > 0;
  function clearTableFilters() {
    setFilterBranches(new Set()); setFilterMcs(new Set()); setFilterCats(new Set());
    setDayFilters({}); setFilterBulan(new Set());
  }
  // DISEMBUNYIKAN sementara per permintaan user (bukan dihapus) - baris chip
  // "Kegiatan" di bawah toolbar. Tinggal balik ke true kalau mau dimunculkan
  // ulang; kategori di grid tetap tidak berubah, hanya chip filternya yg hilang.
  const SHOW_KEGIATAN_FILTER = false;

  return (
    <div style={{ maxWidth: "100%", width: "100%" }}>
      {!canManage && <div style={note}>Mode lihat saja - hanya Head TMV / Brand TMV / SPM Sumatera / Admin yang bisa mengubah target harian.</div>}

      {/* Ringkasan scope spt strip KPI di Activity Plan (kartu putih bulat,
          ikon berwarna di kiri-atas, angka besar) - gantiin teks ringkasan
          polos yg dulu nebeng di baris Bulan/toolbar, supaya halaman ini
          "kebaca" sekilas tanpa perlu scroll ke tabel dulu. */}
      {!loading && (
        <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", flexWrap: "wrap", gap: 14, marginBottom: 8 }}>
          {/* Filter Region KHUSUS di atas-kiri strip kartu ringkasan - defaultnya
              "NORTH SUMATERA" (lihat filterRegions di atas, same state dgn
              ExcelFilter kolom Region di tabel - satu sumber state, ubah dr
              sini atau dr tabel sama2 kepakai). Single-select (klik chip lain
              langsung GANTI, bukan nambah) krn ini scope selector utama
              halaman, beda dgn filter checklist kolom tabel yg multi-select. */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#fff", border: `1px solid ${T.line}`, boxShadow: "0 1px 2px rgba(13,17,23,0.04)", padding: 4, borderRadius: 10, width: "fit-content", height: 44, boxSizing: "border-box" }}>
            {/* "ALL SUMATERA" ditambahkan di depan - klik ini KOSONGKAN
                filterRegions (Set kosong = tanpa filter = tampilkan semua
                region sekaligus), beda dgn 3 region lain yg masing2 SET ke
                satu region tunggal. Tinggi tombol SKRG height:"100%" (bukan
                andelin padding) biar SAMA TINGGI persis dgn card2 lain di
                baris yg sama (Branch/MC, DAILY ACH/MTD, Bulan). */}
            <button onClick={() => setFilterRegions(new Set())} style={{
              padding: "0 12px", height: "100%", borderRadius: 8, border: "none", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
              background: filterRegions.size === 0 ? "#fff" : "transparent", color: filterRegions.size === 0 ? T.primary : T.mid,
              boxShadow: filterRegions.size === 0 ? "0 1px 3px rgba(13,17,23,0.1)" : "none", transition: "all .15s",
            }}>
              ALL SUMATERA
            </button>
            {REGIONS.map((r) => {
              const active = filterRegions.size === 1 && filterRegions.has(r);
              return (
                <button key={r} onClick={() => setFilterRegions(new Set([r]))} style={{
                  padding: "0 12px", height: "100%", borderRadius: 8, border: "none", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                  background: active ? "#fff" : "transparent", color: active ? T.primary : T.mid,
                  boxShadow: active ? "0 1px 3px rgba(13,17,23,0.1)" : "none", transition: "all .15s",
                }}>
                  {r}
                </button>
              );
            })}
          </div>

          {/* Toggle Pencapaian: ACH. HARI INI (cuma tanggal hari ini) vs
              ACH. MTD (kumulatif tgl 1 s/d hari ini, default) - ganti basis
              angka "tercapai" di semua kartu Kegiatan di bawah sekaligus. */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginLeft: "auto" }}>
            {/* Total Branch / Total MC - DIPINDAH ke sini (dulu kartu
                tersendiri) persis di samping toggle ACH. Hari Ini/MTD spt
                diminta. Dibuat jadi 2 chip kecil (bukan teks polos nempel)
                biar rapi & "kebaca" sejajar sama pill toggle di sebelahnya,
                dipisah garis vertikal tipis dari toggle grup. */}
            <div style={{ display: "flex", gap: 6, alignItems: "center", height: 44 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 10px", height: "100%", boxSizing: "border-box", borderRadius: 8, background: T.appBg }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: T.hi }}>{scopedBranches.length}</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: T.lo }}>Branch</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 10px", height: "100%", boxSizing: "border-box", borderRadius: 8, background: T.appBg }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: T.hi }}>{totalMc}</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: T.lo }}>MC</span>
              </div>
            </div>
            <div style={{ width: 1, height: 28, background: T.line }} />
            {/* DAILY ACH. klik langsung = "hari ini". Date picker KHUSUS
                SKRG PINDAH ke DALAM card ini (bukan lagi di luar sebelah
                kiri) & CUMA MUNCUL pas DAILY ACH yg aktif - expand/collapse
                dgn animasi (maxWidth+opacity transition) pas achMode
                gonta-ganti. ACH. MTD skrg juga ada subtitle "s.d. <tgl>"
                (kumulatifnya dihitung s/d tanggal berapa), biar simetris
                sama subtitle tanggal di DAILY ACH. */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#fff", border: `1px solid ${T.line}`, boxShadow: "0 1px 2px rgba(13,17,23,0.04)", padding: 4, borderRadius: 10, width: "fit-content", height: 44, boxSizing: "border-box" }}>
              <button onClick={() => { setAchMode("today"); setAchDay((d) => Math.min(d || new Date().getDate(), daysInMonth(month))); }} style={{
                padding: "0 12px", height: "100%", boxSizing: "border-box", borderRadius: 8, border: "none", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                background: achMode === "today" ? T.primaryBg : "transparent", color: achMode === "today" ? T.primary : T.mid,
                transition: "all .15s",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1.3,
              }}>
                <span>DAILY ACH.</span>
                <span style={{ fontSize: 9, fontWeight: 600, color: achMode === "today" ? T.primary : T.lo, opacity: 0.85 }}>
                  {dayLabel(month, achDay)}
                </span>
              </button>
              <div style={{
                maxWidth: achMode === "today" ? 128 : 0,
                opacity: achMode === "today" ? 1 : 0,
                overflow: "hidden",
                height: "100%",
                display: "flex", alignItems: "center",
                transition: "max-width .25s ease, opacity .2s ease, margin .25s ease",
                marginRight: achMode === "today" ? 2 : 0,
              }}>
                <input
                  type="date"
                  value={`${month.slice(0, 4)}-${month.slice(4, 6)}-${String(achDay).padStart(2, "0")}`}
                  min={`${month.slice(0, 4)}-${month.slice(4, 6)}-01`}
                  max={`${month.slice(0, 4)}-${month.slice(4, 6)}-${String(daysInMonth(month)).padStart(2, "0")}`}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    setAchMode("today");
                    setAchDay(+v.slice(8, 10));
                  }}
                  style={{ width: 128, height: 36, padding: "0 8px", fontSize: 11.5, color: T.hi, background: T.appBg, border: "none", borderRadius: 8, outline: "none", cursor: "pointer", boxSizing: "border-box" }}
                />
              </div>
              <button onClick={() => setAchMode("mtd")} style={{
                padding: "0 12px", height: "100%", boxSizing: "border-box", borderRadius: 8, border: "none", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                background: achMode === "mtd" ? T.primaryBg : "transparent", color: achMode === "mtd" ? T.primary : T.mid,
                transition: "all .15s",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1.3,
              }}>
                <span>ACH. MTD</span>
                <span style={{ fontSize: 9, fontWeight: 600, color: achMode === "mtd" ? T.primary : T.lo, opacity: 0.85 }}>
                  {daysUpToToday(month) > 0 ? `s.d. ${dayLabel(month, daysUpToToday(month))}` : "belum mulai"}
                </span>
              </button>
              {/* Khusus ACH. MTD - basis TARGET pembandingnya bisa dipilih:
                  "Target MTD" (target kumulatif s/d tanggal yg sama, apple-
                  to-apple dgn pencapaian MTD) atau "Target Full Month"
                  (target sebulan penuh, default/perilaku lama). Muncul SAMA
                  persis pola animasinya spt date picker DAILY ACH - expand/
                  collapse pas achMode === "mtd" doang. */}
              <div style={{
                maxWidth: achMode === "mtd" ? 176 : 0,
                opacity: achMode === "mtd" ? 1 : 0,
                overflow: "hidden",
                height: "100%",
                display: "flex", alignItems: "center",
                transition: "max-width .25s ease, opacity .2s ease, margin .25s ease",
                marginLeft: achMode === "mtd" ? 2 : 0,
              }}>
                <div style={{ display: "flex", gap: 2, background: T.appBg, padding: 3, borderRadius: 7, whiteSpace: "nowrap", height: 36, boxSizing: "border-box", alignItems: "center" }}>
                  {[{ key: "mtd", label: "Target MTD" }, { key: "full", label: "Target Full Month" }].map((opt) => (
                    <button key={opt.key} onClick={() => setMtdTargetBasis(opt.key)} style={{
                      padding: "0 8px", height: "100%", boxSizing: "border-box", borderRadius: 6, border: "none", fontSize: 9.5, fontWeight: 700, cursor: "pointer",
                      background: mtdTargetBasis === opt.key ? "#fff" : "transparent", color: mtdTargetBasis === opt.key ? T.primary : T.lo,
                      boxShadow: mtdTargetBasis === opt.key ? "0 1px 2px rgba(13,17,23,0.08)" : "none", transition: "all .15s",
                    }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* Selector periode Bulan - DIPINDAH ke sini (dulu di toolbar
                bawah bareng Export/Import) persis di samping tombol ACH.
                MTD spt diminta. */}
            {/* Selector Bulan - dirapikan biar KONSISTEN sama card2 lain di
                baris ini (border + shadow tipis spt DAILY ACH/MTD & Region,
                bukan cuma input polos nempel tanpa "wadah" yg jelas). */}
            <input
              type="month"
              value={monthInputVal}
              onChange={(e) => setMonth(e.target.value.replace("-", ""))}
              style={{
                width: 160, height: 44, padding: "0 14px", boxSizing: "border-box",
                border: `1px solid ${T.line}`, boxShadow: "0 1px 2px rgba(13,17,23,0.04)",
                borderRadius: 10, background: "#fff", color: T.hi, fontSize: 12.5, fontWeight: 600,
                outline: "none", cursor: "pointer",
              }}
            />
          </div>
        </div>
      )}

      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(172px,1fr))", gap: 14, marginBottom: 14 }}>
          {/* Tanpa ikon lagi (semua kartu Kegiatan dulu pakai ikon checklist yg
              SAMA, jadi cuma berulang & tidak nambah info - label teks +
              angka besar sudah cukup jelas tanpa ikon). */}
          {/* Branch & Total MC DIGABUNG jadi SATU kartu (dulu 2 kartu terpisah -
              kesannya "kosong"/timpang dibanding kartu Kegiatan yg lebih
              berisi (ratio+progress bar)). Polanya SAMA PERSIS dgn kartu
              Kegiatan: angka utama di atas, dashed-divider, baris kedua di
              bawahnya - jadi tingginya & "bobot" visualnya proporsional
              dgn kartu2 lain di baris yg sama. */}
          {/* "Total Branch" kartu lama DIGANTI jadi "ACH. Total Aktivasi" -
              gabungan SEMUA kegiatan jadi satu ratio+persen, konsepnya SAMA
              persis spt kartu per-kegiatan di bawah (cuma breakdown Branch/MC
              dipindah jadi teks di sebelah toggle ACH. Hari Ini/MTD). */}
          <SummaryCard label="ACH. Total Aktivasi" color={T.primary}
            value={<KegiatanRatio tercapai={kegiatanGrandTotal.tercapai} target={kegiatanGrandTotal.target} />}
            sub={<KegiatanProgress pct={kegiatanGrandTotal.pct} color={T.primary} />}
          />
          {/* Kartu "Kegiatan Aktif" (cuma angka COUNT) DIHAPUS, diganti satu
              kartu PER JENIS KEGIATAN - masing2 bandingin TARGET (TGT Bulan,
              dijumlah seluruh branch/MC) lawan PENCAPAIAN (TGT MTD, lihat
              kegiatanStats di atas) + bar progress persen. */}
          {kegiatanStats.map(({ cat, target, tercapai, pct }) => (
            <SummaryCard key={cat.id} label={`ACH. ${cat.name}`} color={T.success}
              value={<KegiatanRatio tercapai={tercapai} target={target} />}
              sub={<KegiatanProgress pct={pct} color={T.success} />}
            />
          ))}
        </div>
      )}

      {/* Toolbar: satu baris rapi - segmented mode di kiri, Bulan + aksi
          export/import digabung jadi SATU klaster di kanan (dulu Bulan ada
          di baris terpisah di bawah - dipindah ke sini spt diminta, biar
          kartu ringkasan di atas jadi fokus utama & toolbar tetap ringkas). */}
      {/* Card toolbar DIBUAT LEBIH PENDEK (padding dikecilin, tombol mode
          Target/Actual jg dirapetin) - dulu kebanyakan padding vertikal jd
          kelihatan "terlalu tinggi" dibanding baris2 lain yg sudah rapi. */}
      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: "8px 10px", marginBottom: 14, boxShadow: "0 1px 2px rgba(13,17,23,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4, background: T.appBg, padding: 3, borderRadius: 9, width: "fit-content" }}>
            {Object.entries(MODES).map(([key, m]) => (
              <button key={key} onClick={() => requestModeSwitch(key)} style={{
                padding: "6px 14px", borderRadius: 7, border: "none", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                background: mode === key ? "#fff" : "transparent", color: mode === key ? T.primary : T.mid,
                boxShadow: mode === key ? "0 1px 3px rgba(13,17,23,0.1)" : "none", transition: "all .15s",
                textTransform: "uppercase", letterSpacing: 0.3,
              }}>
                {m.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* Tombol Refresh - muat ulang data bulan/mode ini dari server
                (reuse `load()` yg sama dipakai saat ganti bulan/mode), taruh
                SEBELAH KIRI Bulan spt diminta. */}
            <button onClick={load} disabled={loading} title="Muat ulang data" style={sbtn}>
              {loading ? <Loader2 size={13} className="mh-spin" /> : <RefreshCw size={13} />} Refresh
            </button>
            {/* Tombol "Clear Filter" - cuma muncul kalau ada filter AD-HOC
                tabel yg aktif (Branch/MC/Kegiatan/tanggal/TGT Bulan - BUKAN
                filter Region di atas, itu scope selector utama & punya
                tombol "ALL SUMATERA"-nya sendiri). Satu klik reset semua
                filter kolom itu sekaligus. */}
            {tableFilterActive && (
              <button onClick={clearTableFilters} title="Hapus semua filter tabel" style={{ ...sbtn, color: T.error, borderColor: T.error }}>
                <X size={13} /> Clear Filter
              </button>
            )}
            {/* Label tombol Export/Import SKRG ikut mode aktif ("Export
                Target"/"Import Target" vs "Export Actual"/"Import Actual") -
                biar jelas file yg didownload/diupload itu data yg MANA
                (lihat exportExcel/handleImportFile - keduanya SUDAH pakai
                `rows`/`M` yg terikat ke `mode` aktif, jadi labelnya cuma
                nyamain teks sama apa yg beneran kejadian, bukan ubah logika). */}
            <button onClick={exportExcel} style={sbtn}><Download size={13} /> Export {M.label}</button>
            {canManage && (
              <>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }} />
                <button onClick={() => fileRef.current?.click()} disabled={importing} style={sbtn}>
                  {importing ? <Loader2 size={13} className="mh-spin" /> : <Upload size={13} />} Import {M.label}
                </button>
                {/* Simpan DIPINDAH ke sini (dulu sticky di bawah halaman) -
                    persis di kanan tombol Import Excel spt diminta. SKRG
                    DISABLE kalau tidak ada perubahan (!dirty) - tidak ada
                    gunanya nge-hit RPC kalau tidak ada yg berubah. */}
                <button onClick={saveAll} disabled={saving || loading || !dirty} style={{ ...pbtn, opacity: !dirty && !saving ? 0.5 : 1, cursor: !dirty && !saving ? "not-allowed" : "pointer" }}>
                  {saving ? "Menyimpan…" : `Simpan ${M.label} Harian`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {err && <div style={{ ...note, marginBottom: 10, background: T.errorBg, borderColor: T.error, color: T.error }}>{err}</div>}
      {ok && <div style={{ ...note, marginBottom: 10, background: T.successBg, borderColor: T.success, color: "#155724" }}>{ok}</div>}
      {importSummary && (importSummary.noMatch > 0 || importSummary.noCat > 0 || importSummary.outOfFilter > 0) && (
        <div style={{ ...note, marginBottom: 10 }}>
          {importSummary.noMatch > 0 && <>{importSummary.noMatch} baris dilewati - Branch/MC tidak cocok dgn Master Data Site bulan ini. </>}
          {importSummary.noCat > 0 && <>{importSummary.noCat} baris dilewati - nama Kegiatan tidak ditemukan di daftar kategori. </>}
          {importSummary.outOfFilter > 0 && <>{importSummary.outOfFilter} baris dilewati - di luar filter yang sedang aktif.</>}
        </div>
      )}

      {/* Kelola Kegiatan - hanya kategori AKTIF yg tampil default (ini yg
          relevan dgn grid di bawah); yg nonaktif disembunyikan di balik satu
          toggle kecil supaya tidak mengotori toolbar (sebelumnya semua
          kategori - termasuk "(nonaktif)" - selalu nyebar bersamaan).
          DISEMBUNYIKAN sementara per permintaan user (bukan dihapus) - tinggal
          ganti SHOW_KEGIATAN_FILTER ke true lagi kalau mau dimunculkan ulang. */}
      {SHOW_KEGIATAN_FILTER && cats.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: T.lo, textTransform: "uppercase", letterSpacing: 0.3, marginRight: 2 }}>Kegiatan</span>
          {activeCats.map((c) => (
            <span key={c.id} onClick={() => canManage && setCatModal(c)} style={{ ...pill, cursor: canManage ? "pointer" : "default" }}>
              {c.name}
            </span>
          ))}
          {canManage && (
            <span onClick={() => setCatModal({})} style={{ ...pill, background: T.primaryBg, color: T.primary, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3 }}>
              <Plus size={11} /> Kegiatan
            </span>
          )}
          {inactiveCats.length > 0 && (
            <span onClick={() => setShowInactiveCats((v) => !v)} style={{ ...pill, background: "transparent", border: `1px dashed ${T.line}`, color: T.lo, cursor: "pointer" }}>
              {showInactiveCats ? "Sembunyikan" : `+${inactiveCats.length} nonaktif`}
            </span>
          )}
          {showInactiveCats && inactiveCats.map((c) => (
            <span key={c.id} onClick={() => canManage && setCatModal(c)} style={{ ...pill, opacity: 0.5, cursor: canManage ? "pointer" : "default" }}>
              {c.name}
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 30, textAlign: "center", color: T.lo }}><Loader2 size={16} className="mh-spin" /> Memuat…</div>
      ) : (
        <div ref={gridWrapRef} className="mh-dtu-grid" onMouseOver={handleGridHover} onMouseLeave={handleGridLeave}
          style={{ overflow: "auto", maxHeight: gridMaxH, border: `1px solid ${T.line}`, borderRadius: 14, marginBottom: 14, boxShadow: "0 1px 2px rgba(13,17,23,0.04)" }}>
          <style>{DAY_HOVER_CSS}</style>
          <style ref={hoverStyleRef} />
          {/* border-collapse:"collapse" + position:"sticky" di thead/kolom beku
              adalah kombinasi yg dikenal RUSAK di Chrome/WebKit - cell sticky
              bisa kepaint DI BAWAH baris yg discroll lewat (headernya jadi
              "ketutup"/kedip pas scroll). Fix standarnya: border-collapse
              "separate" + border-spacing 0 (border per-sel yg sudah ada di
              style `td`/`th`/`tr` tetap kepakai, cuma rendering-nya lewat
              jalur yg tidak konflik dgn sticky). */}
          <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 11.5, tableLayout: "fixed" }}>
            {/* table-layout:"fixed" bikin lebar SETIAP kolom PERSIS ikut
                <col> di bawah (tidak melar ikut konten terpanjang spt mode
                auto) - inilah yg bikin offset `left` kolom beku di LEFT/
                COL_W selalu sinkron walau discroll jauh ke kanan. */}
            <colgroup>
              <col style={{ width: COL_W.region }} />
              <col style={{ width: COL_W.branch }} />
              <col style={{ width: COL_W.mc }} />
              <col style={{ width: COL_W.keg }} />
              <col style={{ width: COL_W.bulan }} />
              {days.map((d) => <col key={d} style={{ width: COL_W.day }} />)}
              <col style={{ width: COL_W.mtd }} />
            </colgroup>
            <thead>
              <tr style={{ background: "#0D1420" }}>
                {/* Branch/MC/Kegiatan skrg pakai ExcelFilter yg SAMA PERSIS dgn
                    yg dipakai Activity Plan/POSMAT/MSISDN Validation
                    (components/ExcelFilter.jsx) - bukan popover custom lagi.
                    Alasannya 2: (1) ExcelFilter di-portal ke document.body
                    dgn zIndex 2147483647, jadi SELALU paling depan, tidak
                    pernah ketiban kolom beku lain (beda dgn popover lama yg
                    jadi anak <th> sticky - z-index-nya ikut terbatas di
                    dalam stacking context th itu sendiri jadi bisa ketiban
                    kolom beku lain yg z-index local-nya lebih tinggi); (2)
                    jendelanya BISA DIGESER (drag dari title bar "Filter") &
                    diresize - persis yg diminta. */}
                {/* Region = kolom beku PALING KIRI (sebelum Branch), default
                    filternya "NORTH SUMATERA" (lihat filterRegions di atas) -
                    opsinya REGIONS tetap (3 region baku), bukan diturunkan
                    dari data spt kolom lain, krn region adalah klasifikasi
                    baku (kolom region di Master Data Site), bukan nilai bebas. */}
                <th style={{ ...th, color: "#fff", minWidth: COL_W.region, position: "sticky", left: 0, zIndex: 8, background: "#0D1420", borderTopLeftRadius: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <span>Region</span>
                    {/* Badge "aktif"/centang DISEMBUNYIKAN (selected dikosongkan)
                        begitu scope tinggal SATU region - saat itu seluruh
                        baris yg tampil MEMANG sudah satu region itu saja,
                        jadi menunjukkan tombol ini "aktif difilter" terasa
                        redundan/membingungkan (padahal sumbernya bisa dari
                        toggle ALL/NORTH/CENTRAL/SOUTH di atas kartu ringkasan
                        ATAU dari kolom ini sendiri - sama saja, begitu cuma 1
                        region tersisa, tidak ada lagi yg bisa dipersempit).
                        Begitu scope "ALL SUMATERA" (0 region) atau user pilih
                        >1 region via kolom ini, badge balik normal krn
                        narrowing lewat kolom ini jadi relevan lagi. */}
                    <ExcelFilter
                      options={REGIONS.map((r) => ({ value: r, label: r }))}
                      selected={filterRegions.size === 1 ? [] : [...filterRegions]}
                      onApply={(vals) => setFilterRegions(new Set(vals))}
                      onClear={() => setFilterRegions(new Set())}
                      sortDir={null} onSort={() => {}} t={T_FILTER} d={false}
                    />
                  </div>
                </th>
                <th style={{ ...th, color: "#fff", minWidth: COL_W.branch, position: "sticky", left: LEFT.branch, zIndex: 8, background: "#0D1420" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <span>Branch</span>
                    <ExcelFilter
                      options={branches.map((b) => ({ value: b.id, label: b.name }))}
                      selected={[...filterBranches]}
                      onApply={(vals) => setFilterBranches(new Set(vals))}
                      onClear={() => setFilterBranches(new Set())}
                      sortDir={null} onSort={() => {}} t={T_FILTER} d={false}
                    />
                  </div>
                </th>
                <th style={{ ...th, color: "#fff", minWidth: COL_W.mc, position: "sticky", left: LEFT.mc, zIndex: 8, background: "#0D1420" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <span>MC</span>
                    <ExcelFilter
                      options={allMcNames.map((mc) => ({ value: mc, label: mc }))}
                      selected={[...filterMcs]}
                      onApply={(vals) => setFilterMcs(new Set(vals))}
                      onClear={() => setFilterMcs(new Set())}
                      sortDir={null} onSort={() => {}} t={T_FILTER} d={false}
                    />
                  </div>
                </th>
                <th style={{ ...th, color: "#fff", minWidth: COL_W.keg, position: "sticky", left: LEFT.keg, zIndex: 8, background: "#0D1420" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <span>Kegiatan</span>
                    <ExcelFilter
                      options={activeCats.map((c) => ({ value: c.id, label: c.name }))}
                      selected={[...filterCats]}
                      onApply={(vals) => setFilterCats(new Set(vals))}
                      onClear={() => setFilterCats(new Set())}
                      sortDir={null} onSort={() => {}} t={T_FILTER} d={false}
                    />
                  </div>
                </th>
                <th style={{ ...th, color: "#fff", minWidth: COL_W.bulan, position: "sticky", left: LEFT.bulan, zIndex: 8, background: "#0D1420", boxShadow: "2px 0 4px rgba(0,0,0,0.12)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <span>{M.bulanLabel}</span>
                    <ExcelFilter
                      options={bulanOptions}
                      selected={[...filterBulan]}
                      onApply={(vals) => setFilterBulan(new Set(vals))}
                      onClear={() => setFilterBulan(new Set())}
                      sortDir={null} onSort={() => {}} t={T_FILTER} d={false}
                    />
                  </div>
                </th>
                {/* Tidak ada ikon corong di tanggal (kolomnya terlalu sempit) -
                    seluruh header tanggal itu sendiri yg jadi tombol pembuka
                    popover filter (klik di manapun di header tgl). Popover-
                    nya sendiri BUKAN anak <th> lagi spt sebelumnya (itu yg
                    bikin dia ketiban kolom beku lain & tidak bisa digeser) -
                    skrg di-portal ke document.body via DayFilterPopover
                    (lihat komponennya di bawah file, pola sama persis dgn
                    ExcelFilter: fixed position dihitung dari getBoundingClientRect
                    th yg diklik, zIndex 2147483647 jadi selalu paling depan,
                    & bisa digeser dari title bar "Filter"). `th`-nya sendiri
                    TETAP position:"sticky" (dari ...th) - JANGAN ditimpa jadi
                    "relative" lagi (bug lama bikin header tanggal ikut
                    kescroll). `background` tetap eksplisit (th tanpa
                    background sendiri transparan saat sticky, nunjukin
                    body yg discroll di baliknya - itu bug header "pudar"
                    sebelumnya). */}
                {days.map((d) => {
                  const dow = dowOf(month, d);
                  const dActive = (dayFilters[d]?.size || 0) > 0;
                  return (
                    <th key={d} data-day={d}
                      onClick={(e) => { e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); setDayFilterOpen((v) => (v === d ? null : d)); setDayFilterAnchor(rect); }}
                      style={{ ...th, color: dow === 0 ? "#ff8a8a" : "#fff", textAlign: "center", cursor: "pointer", background: "#0D1420" }}>
                      {d}<div style={{ fontSize: 9, fontWeight: 500, opacity: 0.8 }}>{DAY_SHORT[dow]}</div>
                      {dActive && <span style={{ position: "absolute", top: 3, right: 3, width: 6, height: 6, borderRadius: 3, background: "#ED1C24" }} />}
                    </th>
                  );
                })}
                {/* TGT MTD juga dibekukan (sticky right:0) spt kolom beku di kiri -
                    biar ttp kelihatan sejauh apa pun tabel digulir ke kanan. */}
                <th style={{ ...th, color: "#fff", background: "#1A2332", borderTopRightRadius: 14, position: "sticky", right: 0, zIndex: 8, boxShadow: "-2px 0 4px rgba(0,0,0,0.12)" }}>{M.mtdLabel}</th>
              </tr>
            </thead>
            <tbody>
              {branches
                .filter((b) => filterRegions.size === 0 || filterRegions.has(b.region))
                .filter((b) => filterBranches.size === 0 || filterBranches.has(b.id))
                .map((branch) => {
                // "hasDayFilter" skrg mencakup filter tanggal MAUPUN filter TGT
                // Bulan (filterBulan) - keduanya sama2 dicek per-ROW lewat
                // rowPassesDayFilters, jadi digabung jadi satu gate di sini.
                const hasDayFilter = Object.keys(dayFilters).length > 0 || filterBulan.size > 0;
                const catsToShow = filterCats.size === 0 ? activeCats : activeCats.filter((c) => filterCats.has(c.id));
                // Filter tanggal/TGT Bulan bekerja di level ROW (kombinasi
                // mc+kegiatan), jadi tiap MC bisa punya daftar kegiatan yg
                // "lolos" berbeda-beda - makanya dihitung per-MC (catsForMc)
                // di bawah, bukan sekali per-branch spt catsToShow.
                const list = (mcsByBranch.get(branch.id) || [])
                  .filter((mc) => filterMcs.size === 0 || filterMcs.has(mc))
                  .filter((mc) => !hasDayFilter || catsToShow.some((cat) => rowPassesDayFilters(getRow(branch.id, mc, cat.id))));
                const filterActive = filterRegions.size > 0 || filterBranches.size > 0 || filterMcs.size > 0 || filterCats.size > 0 || hasDayFilter;
                // Kalau lagi difilter & branch ini tidak punya baris yg cocok
                // SAMA SEKALI, jangan render apa pun utk branch ini (dulu
                // tetap muncul pesan "Tidak ada MC..." per-branch, yg kalau
                // banyak branch kosong jadi banjir pesan identik berulang
                // tanpa nama branch - lihat komentar BranchGroup soal header
                // branch yg sudah dihapus). Tanpa filter, branch kosong
                // (beneran tidak ada MC di Master Data Site) tetap ditampilkan
                // dgn pesannya spt biasa.
                if (filterActive && list.length === 0) return null;
                const isOpen = filterActive ? true : openBranch[branch.id] !== false; // DEFAULT TERBUKA - kolaps per-branch tetap bisa (klik header branch), cuma lewat aksi eksplisit, bukan default lagi. Beratnya 34 branch x MC x kegiatan dibuka sekaligus ditangani LazyBranchRows di bawah (mount isi baris cuma pas branch itu beneran kelihatan di scroll), bukan dgn nyembunyiin default.
                return (
                  <BranchGroup key={branch.id} branch={branch} list={list} isOpen={isOpen}
                    onToggle={() => setOpenBranch((p) => ({ ...p, [branch.id]: !isOpen }))}>
                    {isOpen && list.length === 0 && (
                      <tr><td colSpan={5 + days.length + 1} style={{ padding: "10px 14px", color: T.lo, fontStyle: "italic", background: "#fff" }}>
                        Tidak ada MC untuk branch ini di Master Data Site bulan {monthLabel(month)}.
                      </td></tr>
                    )}
                    {isOpen && list.length > 0 && (
                    <LazyBranchRows rootRef={gridWrapRef} rowCount={list.length * catsToShow.length} colSpan={5 + days.length + 1}>
                    {list.map((mc, mi) => {
                      const catsForMc = hasDayFilter ? catsToShow.filter((cat) => rowPassesDayFilters(getRow(branch.id, mc, cat.id))) : catsToShow;
                      return catsForMc.map((cat, ci) => {
                        const r = getRow(branch.id, mc, cat.id);
                        const mtd = mtdOf(branch.id, mc, cat.id);
                        const bulanTotal = bulanOf(branch.id, mc, cat.id);
                        const mcZebra = mi % 2 === 1 ? "#FAFBFD" : "#fff";
                        const mcZebraDeep = mi % 2 === 1 ? "#F3F5F9" : "#FAFBFD";
                        const rk = `${branch.id}|${mc}|${cat.id}`;
                        const mk = `${branch.id}|${mc}`;
                        return (
                          <tr key={`${mc}|${cat.id}`} style={{ background: mcZebra, borderTop: ci === 0 ? `2px solid ${T.line}` : `1px solid ${T.line}60` }}>
                            {ci === 0 && <td rowSpan={catsForMc.length} data-mc={mk} title={branch.region} style={{ ...tdClip, color: T.mid, fontWeight: 600, verticalAlign: "top", background: mcZebraDeep, position: "sticky", left: 0, zIndex: 2 }}>{branch.region}</td>}
                            {ci === 0 && <td rowSpan={catsForMc.length} data-mc={mk} title={branch.name} style={{ ...tdClip, fontWeight: 700, verticalAlign: "top", background: mcZebraDeep, position: "sticky", left: LEFT.branch, zIndex: 2, textTransform: "uppercase" }}>{branch.name}</td>}
                            {ci === 0 && (
                              <td rowSpan={catsForMc.length} data-mc={mk} title={mc} style={{ ...tdClip, fontWeight: 700, verticalAlign: "top", background: mcZebraDeep, position: "sticky", left: LEFT.mc, zIndex: 2 }}>
                                {mc}
                              </td>
                            )}
                            <td data-row={rk} title={cat.name} style={{ ...tdClip, color: T.mid, background: mcZebra, position: "sticky", left: LEFT.keg, zIndex: 2 }}>{cat.name}</td>
                            {/* TGT Bulan BUKAN input lagi - murni angka hasil
                                JUMLAH seluruh TGT harian di row ini (bulanOf),
                                mengikuti perubahan alur: isi per-hari dulu,
                                TGT Bulan otomatis mengikuti totalnya. */}
                            <td data-row={rk} style={{ ...td, padding: "3px 4px", textAlign: "center", background: mcZebra, position: "sticky", left: LEFT.bulan, zIndex: 2, boxShadow: "2px 0 4px rgba(13,17,23,0.06)", fontWeight: 800, color: T.hi }}>
                              {bulanTotal || "-"}
                            </td>
                            {days.map((d) => {
                              const dow = dowOf(month, d);
                              const past = !isTodayOrFuture(month, d);
                              return (
                                <td key={d} data-row={rk} data-day={d} style={{ ...td, padding: "3px 2px", textAlign: "center", background: dow === 0 ? "#FFF3F3" : past ? "rgba(13,17,23,0.025)" : undefined }}>
                                  <input disabled={!canManage} type="number" value={r.daily?.[String(d)] ?? ""} onChange={(e) => setDay(branch.id, mc, cat.id, d, e.target.value)}
                                    style={{ ...cellInp, width: 36, maxWidth: "100%", color: dow === 0 ? "#c0392b" : T.hi }} placeholder="-" />
                                </td>
                              );
                            })}
                            {/* TGT MTD DIBEKUKAN jg (sticky right:0) spt kolom
                                beku di kiri, supaya tetap kelihatan walau
                                table digulir jauh ke kanan - sama alasannya
                                dgn Branch/MC/Kegiatan/TGT Bulan di kiri. */}
                            <td data-row={rk} style={{ ...td, fontWeight: 800, textAlign: "center", background: "#F7F9FC", color: T.primary, position: "sticky", right: 0, zIndex: 2, boxShadow: "-2px 0 4px rgba(13,17,23,0.06)" }}>{mtd || "-"}</td>
                          </tr>
                        );
                      });
                    })}
                    </LazyBranchRows>
                    )}
                  </BranchGroup>
                );
              })}
              {!branches.length && <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: T.lo }}>Tidak ada branch di Master Data Site untuk bulan ini.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {dayFilterOpen != null && (
        <DayFilterPopover
          anchorRect={dayFilterAnchor}
          onClose={() => setDayFilterOpen(null)}
          options={dayOptions(dayFilterOpen)}
          selected={dayFilters[dayFilterOpen] || new Set()}
          onApply={(set) => { setDayFilters((p) => ({ ...p, [dayFilterOpen]: set })); setDayFilterOpen(null); }}
          onReset={() => { setDayFilters((p) => { const n = { ...p }; delete n[dayFilterOpen]; return n; }); setDayFilterOpen(null); }}
        />
      )}

      {/* Tombol Simpan sticky-di-bawah yg dulu di sini SUDAH DIPINDAH ke
          toolbar atas (sebelah kanan Import Excel) per permintaan - lihat
          toolbar di atas. */}

      {/* Konfirmasi pindah tab Target/Actual pas ada perubahan BELUM
          disimpan (dirty) - muncul SEBELUM beneran pindah mode, user pilih
          Simpan dulu (lalu pindah) atau Buang Perubahan (pindah langsung,
          edit yg belum disimpan hilang) atau Batal (tetap di tab semula). */}
      {/* Modal preview+pemetaan kolom Import - sama pola dgn fitur Import
          Data Site (master/page.jsx): user lihat preview mentah, pilih baris
          header, lalu petakan kolom Branch/MC/Kegiatan (tebakan otomatis
          sudah keisi default, tinggal dikoreksi kalau meleset). Kolom
          tanggal (1-31) tetap auto-detect, tidak perlu dipetakan manual. */}
      {importModal && (
        <ImportMappingModal
          modal={importModal}
          onChange={setImportModal}
          onSheetChange={(name) => setImportModal(buildImportModalState(importModal.wb, name, importModal.fileName))}
          onCancel={() => { setImportModal(null); setErr(""); }}
          onConfirm={runMappedImport}
          importing={importing}
          modeLabel={M.label}
          month={month}
        />
      )}

      {pendingMode && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(13,17,23,0.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setPendingMode(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 20, width: 360, maxWidth: "100%", boxShadow: "0 20px 48px rgba(13,17,23,0.25)" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.hi, marginBottom: 6 }}>Ada perubahan belum disimpan</div>
            <div style={{ fontSize: 12.5, color: T.mid, lineHeight: 1.5, marginBottom: 16 }}>
              Kamu mengedit data {M.label} Harian tapi belum menekan Simpan. Simpan dulu sebelum pindah ke tab {MODES[pendingMode].label}, atau buang perubahannya?
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setPendingMode(null)} disabled={saving} style={sbtn}>Batal</button>
              <button onClick={confirmDiscardAndSwitchMode} disabled={saving} style={{ ...sbtn, color: T.error, borderColor: T.error }}>Buang Perubahan</button>
              <button onClick={confirmSaveAndSwitchMode} disabled={saving} style={pbtn}>
                {saving ? "Menyimpan…" : "Simpan & Pindah"}
              </button>
            </div>
          </div>
        </div>
      )}

      {catModal && <CategoryModal cat={catModal} email={email} onClose={() => setCatModal(null)} onSaved={() => { setCatModal(null); load(); }} />}

      {msisdnModal && (
        <Modal title={`Raw MSISDN - ${msisdnModal.mc} / ${msisdnModal.catName} / ${msisdnModal.date}`} onClose={() => setMsisdnModal(null)}>
          <div style={{ fontSize: 11.5, color: T.lo, marginBottom: 10 }}>{msisdnModal.branchName}</div>
          {msisdnModal.loading ? (
            <div style={{ padding: 20, textAlign: "center", color: T.lo }}><Loader2 size={16} className="mh-spin" /> Memuat…</div>
          ) : msisdnModal.err ? (
            <div style={{ ...note, background: T.errorBg, borderColor: T.error, color: T.error }}>{msisdnModal.err}</div>
          ) : msisdnModal.rows.length === 0 ? (
            <div style={{ padding: "14px 0", textAlign: "center", color: T.lo, fontSize: 12.5 }}>Belum ada MSISDN tercatat utk tanggal ini.</div>
          ) : (
            <div style={{ maxHeight: "50vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {msisdnModal.rows.map((m, i) => {
                const Icon = m.sp_fwa === "fwa" ? Router : CardSim;
                const color = m.sp_fwa === "fwa" ? "#C6168D" : "#ED1C24";
                return (
                  <div key={`${m.msisdn}-${i}`} style={{ display: "flex", alignItems: "center", gap: 9, border: `1px solid ${T.line}`, borderRadius: 10, padding: "8px 10px" }}>
                    <Icon size={14} color={color} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: T.hi }}>{m.msisdn}</div>
                      <div style={{ fontSize: 10.5, color: T.lo, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.name || "-"}{m.role ? ` · ${m.role}` : ""}{m.email ? ` · ${m.email}` : ""}
                        {m.source === "public" ? " · link publik" : ""}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: T.lo, flexShrink: 0 }}>
                      {m.at ? new Date(m.at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// Satu branch yg dibuka bisa punya puluhan baris (MC x Kegiatan) - dgn SEMUA
// branch default terbuka (34 branch x ~6 MC x ~7 kegiatan bisa >1000 baris x
// banyak <input> per baris), me-mount SEMUANYA sekaligus ke DOM bakal berat
// (banyak input terkontrol react re-render tiap ketik, browser jadi lag).
// Fix-nya BUKAN balik ke default tertutup (itu yg mau dihindari user), tapi
// "virtualisasi" sederhana tanpa dependency baru: baris sungguhan SATU
// BRANCH baru di-mount begitu areanya beneran mendekati viewport (via
// IntersectionObserver thdp scrollport grid itu sendiri, bukan window - tabel
// discroll di dalam div-nya sendiri, bukan halaman). Sebelum itu, taruh SATU
// <tr> placeholder setinggi estimasi baris aslinya (supaya tinggi scrollbar
// tetap akurat, tidak "loncat" pas baris sungguhan muncul). Sekali sebuah
// branch pernah kelihatan, biarkan TETAP ter-mount (tidak di-unmount lagi
// pas discroll lewat) - menukar sedikit memori dgn menghindari flicker/
// remount berulang kalau user scroll bolak-balik.
const EST_ROW_H = 37; // px - cocok dgn padding td (6px10px) + input ~26px + border baris
function LazyBranchRows({ rootRef, rowCount, colSpan, children }) {
  const [inView, setInView] = useState(false);
  const sentinelRef = useRef(null);

  useEffect(() => {
    if (inView) return;
    const el = sentinelRef.current;
    const root = rootRef?.current;
    if (!el || !root) { setInView(true); return; } // fallback aman - drpd baris nyangkut kosong kalau root/sentinel belum siap
    const io = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) { setInView(true); io.disconnect(); } },
      { root, rootMargin: "800px 0px 800px 0px", threshold: 0 } // 800px buffer atas/bawah - baris sudah siap SEBELUM kelihatan, jadi tidak sempat keliatan placeholder kosong pas scroll wajar
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootRef]);

  if (!inView) {
    return (
      <tr>
        <td ref={sentinelRef} colSpan={colSpan} style={{ height: Math.max(1, rowCount) * EST_ROW_H, padding: 0, border: "none" }} />
      </tr>
    );
  }
  return <>{children}</>;
}

// Header kolom dgn tombol filter corong (ikon Filter dari lucide) - label +
// corong sejajar, corong jadi highlight merah begitu filter kolom itu lagi
// aktif. Klik corong buka popover kecil TEPAT di bawah header cell-nya
// (position:absolute thdp th yg sudah position:sticky - otomatis jadi
// positioning context yg benar utk anak absolute-nya). Backdrop transparan
// penuh layar dipasang di belakang popover utk nutup popover begitu klik di
// luar, TANPA perlu event-listener window manual (lebih simpel & auto-
// bersih saat unmount).
// Popover isi filter kolom - checklist multi-select spt AutoFilter Excel/
// Google Sheets: search box, "Pilih Semua" (relatif thd hasil search yg
// sedang tampil), daftar checkbox scrollable, lalu Reset/Terapkan. Draft
// pilihan disimpan di state lokal (`draft`) dan baru di-commit ke parent
// pas "Terapkan" diklik - jadi batal/tutup popover tanpa apply tidak
// mengubah filter yg sedang aktif. Komponen ini remount setiap popover
// dibuka (lihat `key` di pemanggil HeaderFilterCell/th tanggal), jadi
// `draft` otomatis ke-reset ke `selected` yg lagi aktif setiap dibuka.
function ColumnChecklistFilter({ options, selected, onApply, onReset }) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(() => new Set(selected));
  const filtered = options.filter((o) => o.label.toLowerCase().includes(search.trim().toLowerCase()));
  const allFilteredSelected = filtered.length > 0 && filtered.every((o) => draft.has(o.value));
  function toggleAll() {
    setDraft((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((o) => next.delete(o.value));
      else filtered.forEach((o) => next.add(o.value));
      return next;
    });
  }
  function toggleOne(v) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  }
  // Popover ini dirender SEBAGAI ANAK dari <th> (background gelap, teks
  // UPPERCASE + letter-spacing lebar dari style `th` dasar) - kalau tidak
  // di-reset eksplisit di sini, semua teks/ikon di DALAM popover (yg
  // seharusnya kartu putih biasa) ikut KEWARISAN jadi kapital besar &
  // berjarak (persis bug di screenshot: "PILIH SEMUA", "EVENT BESAR" dst
  // jadi kapital tebal raksasa). `checkboxSty` juga dikecilkan eksplisit -
  // checkbox native ukuran default browser kelihatan kebesaran di popover
  // sekecil ini.
  const resetTypography = { textTransform: "none", letterSpacing: "normal" };
  const checkboxSty = { width: 14, height: 14, flexShrink: 0, accentColor: T.primary, cursor: "pointer", margin: 0 };
  return (
    <div style={{ width: 224, ...resetTypography }}>
      <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari…"
        style={{ ...popoverInput, ...resetTypography, fontWeight: 500, marginBottom: 6 }} />
      <label style={{
        display: "flex", alignItems: "center", gap: 7, padding: "5px 3px 7px", fontSize: 12, fontWeight: 700,
        color: T.hi, cursor: "pointer", borderBottom: `1px solid ${T.line}`, marginBottom: 4, ...resetTypography,
      }}>
        <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} style={checkboxSty} />
        Pilih Semua
      </label>
      <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1, marginBottom: 8 }}>
        {filtered.length === 0 && <div style={{ fontSize: 11.5, color: T.lo, padding: "6px 3px", ...resetTypography }}>Tidak ada hasil.</div>}
        {filtered.map((o) => (
          <label key={o.value} style={{
            display: "flex", alignItems: "center", gap: 7, padding: "4px 3px", borderRadius: 6, fontSize: 12,
            fontWeight: 500, color: T.mid, cursor: "pointer", ...resetTypography,
          }}>
            <input type="checkbox" checked={draft.has(o.value)} onChange={() => toggleOne(o.value)} style={checkboxSty} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" onClick={onReset} style={{ ...popoverBtnGhost, ...resetTypography }}>Reset</button>
        <button type="button" onClick={() => onApply(draft)} style={{ ...popoverBtnPrimary, ...resetTypography }}>Terapkan</button>
      </div>
    </div>
  );
}

// Modal preview+pemetaan kolom Import, pola SAMA dgn fitur Import Data Site
// (master/page.jsx UploadStep): tampilkan beberapa baris pertama file MENTAH
// apa adanya, user klik baris mana yg jadi HEADER (krn beberapa file tracker
// tim punya baris judul di atas header asli), lalu petakan kolom Branch/MC/
// Kegiatan via dropdown (sudah ditebak otomatis dr nama kolom, tinggal
// dikoreksi kalau meleset). Kolom tanggal (1-31) TIDAK dipetakan manual -
// selalu auto-detect dari baris header yg dipilih, konsisten dgn penjelasan
// "TGT MTD & TGT Bulan tidak ikut dipetakan/dilookup" yg sudah dikonfirmasi
// sebelumnya.
function ImportMappingModal({ modal, onChange, onSheetChange, onCancel, onConfirm, importing, modeLabel, month }) {
  const { fileName, wb, sheetName, grid, headerIdx, colBranch, colMc, colKegiatan } = modal;
  const previewRows = grid.slice(0, 10);
  const colCount = previewRows.reduce((m, r) => Math.max(m, (r || []).length), 0);
  const headerRow = grid[headerIdx] || [];
  // Daftar LENGKAP nomor tanggal yg kedetek dari baris header (bukan cuma
  // jumlahnya) - dipakai tombol "Cek Kolom Tanggal" biar user bisa VERIFIKASI
  // satu-satu, bukan cuma percaya angka "31 kolom ditemukan" doang. Dicocokkan
  // jg ke jumlah hari BENERAN di bulan yg lagi dibuka (daysInMonth(month)) -
  // kalau ada tanggal terdeteksi TAPI tidak valid utk bulan itu (misal
  // kolom "31" sedangkan bulan cuma 30 hari), atau ada tanggal bulan itu yg
  // TIDAK ketemu kolomnya, keduanya ditandai sbg peringatan.
  const daysInThisMonth = daysInMonth(month);
  const dayColsList = headerRow
    .map((v, ci) => ({ day: +String(v || "").trim(), ci }))
    .filter((d) => /^\d+$/.test(String(d.day)) && d.day >= 1 && d.day <= 31)
    .sort((a, b) => a.day - b.day);
  const dayColsFound = dayColsList.length;
  const invalidDays = dayColsList.filter((d) => d.day > daysInThisMonth).map((d) => d.day);
  const missingDays = Array.from({ length: daysInThisMonth }, (_, i) => i + 1).filter((d) => !dayColsList.some((x) => x.day === d));
  const [showDayCols, setShowDayCols] = useState(false);
  const canImport = colBranch !== "" && colMc !== "" && colKegiatan !== "";

  const fieldSelect = (label, key, required = true) => {
    const val = modal[key];
    return (
      <label style={{ display: "block" }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: T.hi, marginBottom: 5, display: "flex", alignItems: "center", gap: 6 }}>
          {label}{required && <span style={{ color: T.error }}>*</span>}
          {val !== "" && val != null && <span style={{ fontSize: 10, fontWeight: 700, color: T.success }}>✓</span>}
        </div>
        <select
          value={val === "" || val == null ? "" : val}
          onChange={(e) => onChange({ ...modal, [key]: e.target.value === "" ? "" : Number(e.target.value) })}
          style={{ ...inp, borderColor: required && (val === "" || val == null) ? T.error : T.line }}
        >
          <option value="">- pilih kolom -</option>
          {headerRow.map((c, ci) => (
            <option key={ci} value={ci}>{String(c || `(Kolom ${ci + 1})`)}</option>
          ))}
        </select>
      </label>
    );
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(13,17,23,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 20, width: 760, maxWidth: "100%", maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 56px rgba(13,17,23,0.28)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: T.hi }}>Import {modeLabel} Harian - Preview &amp; Petakan Kolom</div>
          <button onClick={onCancel} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4, color: T.lo }}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 12, color: T.mid, marginBottom: 14 }}>{fileName}</div>

        {/* Pilih Sheet - dulu SELALU pakai sheet pertama tanpa pilihan,
            skrg bisa diganti (file tracker tim kadang datanya bukan di
            sheet pertama). Ganti sheet BANGUN ULANG tebakan header+kolom
            dari nol (struktur tiap sheet bisa beda). */}
        {wb?.SheetNames?.length > 1 && (
          <label style={{ display: "block", marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: T.mid, textTransform: "uppercase", marginBottom: 5 }}>Pilih Sheet</div>
            <select value={sheetName} onChange={(e) => onSheetChange(e.target.value)} style={{ ...inp, maxWidth: 280 }}>
              {wb.SheetNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        )}

        <div style={{ fontSize: 11.5, fontWeight: 800, color: T.mid, textTransform: "uppercase", marginBottom: 5 }}>Preview &amp; Baris Header</div>
        <div style={{ fontSize: 12, color: T.mid, marginBottom: 8 }}>Klik baris yang menjadi <b>header</b> (baris yg berisi nama kolom spt Branch/MC/Kegiatan/tanggal). Baris di atasnya diabaikan.</div>
        <div style={{ overflow: "auto", maxHeight: 220, border: `1px solid ${T.line}`, borderRadius: 10, marginBottom: 16 }}>
          <table style={{ borderCollapse: "collapse", fontSize: 11.5, whiteSpace: "nowrap" }}>
            <tbody>
              {previewRows.map((row, ri) => {
                const isHeader = ri === headerIdx;
                const skipped = ri < headerIdx;
                return (
                  <tr key={ri} onClick={() => onChange({ ...modal, headerIdx: ri, colBranch: "", colMc: "", colKegiatan: "" })}
                    style={{ cursor: "pointer", background: isHeader ? "#FFF0F0" : skipped ? T.appBg : "#fff", opacity: skipped ? 0.55 : 1, borderTop: ri ? `1px solid ${T.line}` : "none" }}>
                    <td style={{ position: "sticky", left: 0, background: "inherit", padding: "6px 10px", fontWeight: 800, fontSize: 10.5, color: isHeader ? T.primary : T.lo, borderRight: `1px solid ${T.line}`, textAlign: "center", minWidth: 56 }}>
                      {isHeader ? "HEADER" : ri + 1}
                    </td>
                    {Array.from({ length: colCount }, (_, ci) => (
                      <td key={ci} style={{ padding: "6px 10px", color: T.hi, borderRight: ci < colCount - 1 ? `1px solid ${T.line}` : "none" }}>
                        {String((row || [])[ci] ?? "")}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 11.5, fontWeight: 800, color: T.mid, textTransform: "uppercase", marginBottom: 8 }}>Petakan Kolom Wajib</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 14 }}>
          {fieldSelect("Kolom Branch", "colBranch")}
          {fieldSelect("Kolom MC", "colMc")}
          {fieldSelect("Kolom Kegiatan", "colKegiatan")}
        </div>

        <div style={{ ...note, marginBottom: 16, fontSize: 12, background: (invalidDays.length || missingDays.length) ? "#FFF0F0" : note.background, borderColor: (invalidDays.length || missingDays.length) ? "#F6D9D9" : note.border }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              Kolom tanggal (1-31) terdeteksi otomatis dari baris header yg dipilih -
              {dayColsFound > 0 ? ` ${dayColsFound} kolom tanggal ditemukan.` : " belum ada kolom tanggal ditemukan di baris header ini, coba pilih baris lain."}
              {" "}Kolom "Bulan"/TGT MTD (kalau ada di file) TIDAK dipakai/diimport - TGT Bulan selalu dihitung ulang otomatis dari kolom tanggal.
              {(invalidDays.length > 0 || missingDays.length > 0) && (
                <div style={{ marginTop: 6, fontWeight: 700, color: T.error }}>
                  {invalidDays.length > 0 && <>Tanggal {invalidDays.join(", ")} tidak valid utk bulan ini (cuma {daysInThisMonth} hari). </>}
                  {missingDays.length > 0 && <>Tanggal {missingDays.join(", ")} di bulan ini TIDAK ketemu kolomnya di file.</>}
                </div>
              )}
            </div>
            {/* Tombol "Cek Kolom Tanggal" - buka daftar LENGKAP tiap tanggal
                yg kedetek (bukan cuma angka jumlahnya), biar user bisa
                verifikasi satu-satu sebelum Import, bukan cuma percaya. */}
            {dayColsFound > 0 && (
              <button type="button" onClick={() => setShowDayCols((v) => !v)} style={{ ...sbtn, padding: "6px 10px", fontSize: 11.5, flexShrink: 0 }}>
                {showDayCols ? "Sembunyikan" : "Cek Kolom Tanggal"}
              </button>
            )}
          </div>
          {showDayCols && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.line}`, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {dayColsList.map(({ day, ci }) => {
                const invalid = day > daysInThisMonth;
                return (
                  <span key={ci} title={`Kolom ke-${ci + 1} di file`} style={{
                    fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 7,
                    background: invalid ? "#FFE3E3" : "#fff", color: invalid ? T.error : T.hi,
                    border: `1px solid ${invalid ? "#F3B9B9" : T.line}`,
                  }}>
                    {day}
                  </span>
                );
              })}
              {missingDays.map((day) => (
                <span key={`missing-${day}`} title="Tanggal ini tidak ketemu kolomnya di file" style={{
                  fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 7,
                  background: "#F5F6F8", color: T.lo, border: `1px dashed ${T.line}`,
                }}>
                  {day} (kosong)
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onCancel} disabled={importing} style={sbtn}>Batal</button>
          <button onClick={onConfirm} disabled={importing || !canImport} style={{ ...pbtn, opacity: importing || !canImport ? 0.5 : 1, cursor: importing || !canImport ? "not-allowed" : "pointer" }}>
            {importing ? "Mengimpor…" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}

// "sub" kartu Branch - baris kedua "Total MC: 183" di bawah dashed-divider,
// biar kartu Branch+MC "sebobot" visualnya dgn kartu Kegiatan yg jg selalu
// punya baris kedua (progress bar). Dibuat generik (label+value) bukan
// hardcode "Total MC" krn pola dashed-divider+baris kedua ini reusable.
function ScopeSubRow({ label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: T.lo }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 800, color: T.hi }}>{value}</span>
    </div>
  );
}

// "value" kartu per-Kegiatan: angka PENCAPAIAN besar + "/ Target" kecil di
// sampingnya - pola rasio yg sama dipakai KPI Activity Plan ("X / Y Plan").
function KegiatanRatio({ tercapai, target }) {
  return (
    <span>
      {tercapai.toLocaleString("id-ID")}
      <span style={{ fontSize: 13, fontWeight: 600, color: T.lo }}> / {target.toLocaleString("id-ID")}</span>
    </span>
  );
}
// "sub" kartu per-Kegiatan: bar progress tipis + label persen - representasi
// visual cepat dr Pencapaian/Target tanpa perlu buka tabel.
function KegiatanProgress({ pct, color }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div>
      <div style={{ height: 5, borderRadius: 3, background: T.appBg, overflow: "hidden", marginBottom: 5 }}>
        <div style={{ height: "100%", width: `${clamped}%`, borderRadius: 3, background: color, transition: "width .25s" }} />
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.mid }}>{pct}% tercapai</div>
    </div>
  );
}

// Kartu ringkasan scope (Branch/MC/per-Kegiatan) - gaya SAMA PERSIS spt
// strip KPI di halaman Activity Plan (ikon berwarna kotak rounded di
// kiri-atas, label kapital kecil, angka besar bold) supaya konsisten se-app.
// Tanpa ikon (dihapus per permintaan - dulu semua kartu Kegiatan pakai
// ikon checklist yg SAMA persis, jadi cuma berulang tanpa nambah info).
// "Mewah tanpa glow" didapat dari: (1) aksen garis tipis BERWARNA di TEPI
// ATAS kartu (bukan shadow/glow berwarna - cuma border-top solid, jadi
// identitas warna per-kartu tetap kerasa tanpa bikin blur/halo warna di
// sekitar kartu), (2) shadow kartu tetap NETRAL abu2 (bukan `${color}..`),
// (3) sedikit hover-lift (translateY halus + shadow menebal dikit) biar ada
// "life"/interaktivitas tanpa warna tambahan - transisi murni netral.
// Garis aksen warna di tepi atas DIHAPUS (kurang disukai) - digantikan
// aksen yg lebih halus: tint gradient SANGAT tipis dr warna kartu (4% opacity
// di pojok kiri-atas, memudar ke putih) + titik kecil warna di depan label,
// jadi identitas warna per-kartu tetap kerasa tanpa jadi garis keras/glow.
function SummaryCard({ label, value, color, sub }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", borderRadius: 16, overflow: "hidden",
        background: color ? `linear-gradient(145deg, ${color}0d 0%, #fff 55%)` : "#fff",
        border: `1px solid ${T.line}`,
        padding: "19px 18px 18px",
        boxShadow: hover
          ? "0 2px 4px rgba(13,17,23,0.05), 0 14px 28px rgba(13,17,23,0.075)"
          : "0 1px 2px rgba(13,17,23,0.03), 0 6px 16px rgba(13,17,23,0.035)",
        transform: hover ? "translateY(-2px)" : "translateY(0)",
        transition: "transform .18s ease, box-shadow .18s ease, background .18s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 11 }}>
        {color && <span style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />}
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", color: T.lo, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={label}>{label}</div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: T.hi, lineHeight: 1, letterSpacing: "-0.01em" }}>{value}</div>
      {/* `sub` opsional - dipakai kartu per-Kegiatan utk nunjukin progress bar
          Target vs Pencapaian (lihat pemanggil di bawah), gaya dashed-top
          border SAMA PERSIS spt sub-row di kartu KPI Activity Plan. */}
      {sub && (
        <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px dashed ${T.line}` }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// Popover filter TANGGAL - dipakai krn kolom tanggal sempit & tidak punya
// tombol corong sendiri (lihat komentar di th-nya); triggernya adalah
// seluruh header tgl yg diklik. Sama spt ExcelFilter (dipakai Branch/MC/
// Kegiatan di atas), popover ini di-portal LANGSUNG ke document.body dgn
// position:"fixed" + zIndex 2147483647 (nilai max 32-bit signed int, dipakai
// jg oleh ExcelFilter) - jadi TIDAK PERNAH jadi anak <th> sticky lagi
// (itu penyebab dia bisa ketiban kolom beku lain yg zIndex local-nya lebih
// tinggi), dan posisinya LEPAS dari posisi scroll tabel - bisa digeser
// bebas lewat title bar "Filter" (drag, sama persis teknik di ExcelFilter),
// tidak akan "kebawa" acak2an pas tabel discroll krn dia bukan descendant
// dari wrapper tabel yg overflow:auto itu sama sekali.
function DayFilterPopover({ anchorRect, onClose, options, selected, onApply, onReset }) {
  const [pos, setPos] = useState(() => {
    const w = 224 + 16; // lebar kartu + padding
    let x = (anchorRect?.left ?? 0) - 40;
    let y = (anchorRect?.bottom ?? 0) + 6;
    if (typeof window !== "undefined") {
      if (x + w > window.innerWidth) x = window.innerWidth - w - 12;
      if (x < 8) x = 8;
      if (y + 420 > window.innerHeight) y = Math.max(8, (anchorRect?.top ?? y) - 420 - 6);
    }
    return { x, y };
  });
  const dragRef = useRef(null);

  function onDragStart(e) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);
  }
  function onDragMove(e) {
    const d = dragRef.current;
    if (!d) return;
    setPos({ x: d.origX + (e.clientX - d.startX), y: d.origY + (e.clientY - d.startY) });
  }
  function onDragEnd() {
    dragRef.current = null;
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);
  }
  useEffect(() => () => { window.removeEventListener("mousemove", onDragMove); window.removeEventListener("mouseup", onDragEnd); }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 2147483646 }} />
      <div onClick={(e) => e.stopPropagation()} style={{
        position: "fixed", top: pos.y, left: pos.x, zIndex: 2147483647, width: 224,
        background: "#fff", border: "1px solid #E3E8F0", borderRadius: 10,
        boxShadow: "0 25px 50px -12px rgba(0,0,0,0.35)", overflow: "hidden",
      }}>
        <div onMouseDown={onDragStart} style={{
          padding: "7px 10px", display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "grab", background: "#F7F9FC", borderBottom: `1px solid ${T.line}`,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: T.lo, letterSpacing: 0.3 }}>FILTER</span>
          <button type="button" onClick={onClose} style={{ width: 16, height: 16, borderRadius: 8, border: "none", background: "#FF5F57", cursor: "pointer" }} />
        </div>
        <div style={{ padding: 8 }}>
          <ColumnChecklistFilter options={options} selected={selected} onApply={onApply} onReset={onReset} />
        </div>
      </div>
    </>,
    document.body
  );
}

// Baris header "BANDA ACEH (6 MC)" yg dulu di sini (sekaligus tombol
// collapse per-branch) DIHAPUS per permintaan user - branch SUDAH default
// selalu terbuka (lihat isOpen di Body) dan nama branch-nya sendiri sudah
// kelihatan jelas lewat kolom "Branch" (sel rowSpan pertama tiap grup MC) -
// baris pemisah abu-abu ini jadi dianggap berlebihan/mengganggu alur tabel.
function BranchGroup({ children }) {
  return <>{children}</>;
}

function CategoryModal({ cat, email, onClose, onSaved }) {
  const isNew = !cat.id;
  const [name, setName] = useState(cat.name || "");
  const [active, setActive] = useState(cat.active !== false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!name.trim()) { setErr("Nama kegiatan wajib diisi"); return; }
    setSaving(true); setErr("");
    try {
      const { error } = await supabaseMarta.rpc("mh_daily_target_categories_upsert", {
        p_id: cat.id || null, p_name: name.trim(), p_sort_order: cat.sort_order ?? 0, p_active: active, p_caller_email: email,
      });
      if (error) throw new Error(error.message);
      onSaved();
    } catch (e) { setErr(e.message || "Gagal menyimpan"); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!confirm(`Hapus kegiatan "${cat.name}"? Semua target harian untuk kegiatan ini juga akan terhapus.`)) return;
    setSaving(true); setErr("");
    try {
      const { error } = await supabaseMarta.rpc("mh_daily_target_categories_delete", { p_id: cat.id, p_caller_email: email });
      if (error) throw new Error(error.message);
      onSaved();
    } catch (e) { setErr(e.message || "Gagal menghapus"); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={isNew ? "Tambah Kegiatan" : "Edit Kegiatan"} onClose={onClose}>
      {err && <div style={{ ...note, marginBottom: 10, background: T.errorBg, borderColor: T.error, color: T.error }}>{err}</div>}
      <label style={{ display: "block", marginBottom: 10 }}>
        <div style={lbl}>Nama Kegiatan</div>
        <input value={name} onChange={(e) => setName(e.target.value)} style={inp} placeholder="mis. Event Besar" />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontSize: 12.5 }}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Aktif (muncul di grid Target Harian)
      </label>
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
        {!isNew ? <button onClick={remove} disabled={saving} style={{ ...sbtn, color: T.error, borderColor: T.error }}><Trash2 size={12} /> Hapus</button> : <span />}
        <button onClick={save} disabled={saving} style={pbtn}>{saving ? "Menyimpan…" : "Simpan"}</button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(13,17,23,.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "4vh 20px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 22, width: 420, maxWidth: "94vw" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", marginLeft: "auto", color: T.mid }}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const lbl = { fontSize: 11, fontWeight: 700, color: T.hi, marginBottom: 4 };
const note = { background: "#FFFDE7", border: `1px solid #F0E3B0`, color: "#7a5b00", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, lineHeight: 1.5, marginBottom: 14 };
const inp = { padding: "8px 11px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 13, outline: "none", boxSizing: "border-box", width: "100%" };
const cellInp = { width: 42, padding: "5px 3px", borderRadius: 6, border: `1px solid ${T.line}`, background: "#fff", fontSize: 11, outline: "none", boxSizing: "border-box", textAlign: "center" };
// `overflow:"hidden"` DITAMBAHKAN di sini (dulu tidak ada) - tanpa ini,
// konten th yg "mepet" (label + tombol ExcelFilter) di kolom sempit bisa
// melebar keluar dari batas kolomnya sendiri & numpuk/ketutup kolom beku
// SEBELAHNYA begitu discroll horizontal (persis laporan bug "tombol filter
// ketutup saat scroll ke kanan") - overflow:hidden jadi jaring pengaman
// terakhir, memastikan th TIDAK PERNAH bisa melebihi lebar kolom yg sudah
// ditentukan <colgroup> (COL_W), brp pun sempitnya.
const th = { padding: "8px 10px", textAlign: "left", fontWeight: 700, fontSize: 10.5, position: "sticky", top: 0, textTransform: "uppercase", letterSpacing: 0.3, zIndex: 5, transition: "background .08s", overflow: "hidden" };
// Highlight kolom tanggal (hover crosshair) - rule STATIS (1..31, dibuat
// sekali di luar komponen, tidak pernah berubah) yg nyalakan background sel
// `[data-day="D"]` begitu wrapper grid py attribute `data-hover-day="D"`.
// Dipasang lewat <style> biasa (bukan state React) - lihat `handleGridHover`
// di komponen Body: cuma nulis SATU attribute ke DOM per gerak mouse, nol
// re-render. Baris Kegiatan/Branch/MC (`data-row`/`data-mc`) di-highlight
// lewat <style ref={hoverStyleRef}> yg ISINYA ditulis ulang tiap hover -
// sengaja dinamis (bukan statis spt ini) krn jumlah kombinasi branch x MC x
// kegiatan terlalu banyak utk dibuat rule-nya di muka.
const DAY_HOVER_CSS = Array.from({ length: 31 }, (_, i) => i + 1)
  .map((d) => `.mh-dtu-grid[data-hover-day="${d}"] th[data-day="${d}"]{background:#ED1C24 !important;color:#fff !important}.mh-dtu-grid[data-hover-day="${d}"] td[data-day="${d}"]{background:rgba(237,28,36,0.08) !important}`)
  .join("");
// Lebar 4 kolom "beku" (Branch/MC/Kegiatan/TGT Bulan) + kolom tanggal/MTD -
// dipakai BERBARENGAN utk dua hal yg HARUS selalu sinkron: (1) offset `left`
// tiap kolom beku (freeze-pane) dan (2) lebar kolom SUNGGUHAN lewat
// <colgroup> + table-layout:"fixed" (lihat dibawah). Sebelumnya cuma dipakai
// sbg `minWidth` di sel header/body dgn table-layout AUTO (default) - lebar
// kolom asli jadi ikut melar sesuai konten TERPANJANG (mis. "DTU DSO/DSP
// HOA" di kolom Kegiatan lebih lebar dari minWidth 150 yg diasumsikan), tapi
// offset `left` tetap pakai angka minWidth yg lama - begitu discroll
// horizontal, kolom beku (posisinya dihitung dari offset lama) jadi TIDAK
// NYAMBUNG lagi sama kolom asli yg sudah melar, keliatan "nutupin"/numpuk di
// atas data tabel. Fix: table-layout:"fixed" + <colgroup> bikin lebar kolom
// SELALU PERSIS sesuai angka di sini (konten yg kepanjangan dipotong pakai
// ellipsis, bukan melebarkan kolom) - jadi offset `left` di bawah ini
// dijamin selalu sinkron, discroll kemanapun.
// Branch/MC/Kegiatan dipersempit (dulu 150/130/180) per permintaan - teks
// panjang ttp aman krn tdClip (ellipsis + title tooltip) sudah dipakai di
// ketiga kolom ini, jadi nama yg kepotong tetap bisa dibaca penuh via hover.
// Lebar MC/Kegiatan dinaikkan sedikit dari percobaan compact sebelumnya
// (96/132 -> 108/150) - di lebar 96px, kolom MC CUMA cukup pas2an utk
// label "MC" + tombol filter ExcelFilter (24px) + padding, nyaris tanpa
// ruang gerak - kemungkinan itu biang kerok konten melebar keluar batas
// kolom & numpuk kolom beku sebelah pas discroll (lihat komentar `th` di
// atas). Masih jauh lebih compact dr lebar awal (150/130/180).
// Region jadi kolom beku PALING KIRI (sebelum Branch) - COL_W.region
// ditambahkan di depan, semua offset LEFT lain ikut geser +COL_W.region.
const COL_W = { region: 96, branch: 112, mc: 108, keg: 150, bulan: 80, day: 40, mtd: 80 };
const LEFT = {
  branch: COL_W.region,
  mc: COL_W.region + COL_W.branch,
  keg: COL_W.region + COL_W.branch + COL_W.mc,
  bulan: COL_W.region + COL_W.branch + COL_W.mc + COL_W.keg,
};
const td = { padding: "6px 10px", fontSize: 11.5, transition: "background .08s" };
// table-layout:"fixed" bikin lebar kolom TIDAK melar ikut konten terpanjang
// lagi (lihat catatan panjang di COL_W) - konsekuensinya, teks yg kepanjangan
// utk lebar kolomnya (mis. "DTU DSO/DSP HOA" kalau branch/MC-nya pendek) kini
// harus dipotong rapi (ellipsis) drpd membesarkan kolom begitu saja.
const tdClip = { ...td, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" };
const popoverSelect = { width: "100%", padding: "7px 8px", borderRadius: 8, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 12, fontWeight: 600, outline: "none", boxSizing: "border-box", textTransform: "none" };
const popoverInput = { ...popoverSelect, fontWeight: 500 };
const popoverBtnGhost = { flex: 1, padding: "7px 8px", borderRadius: 8, border: `1px solid ${T.line}`, background: "#fff", color: T.mid, fontSize: 12, fontWeight: 700, cursor: "pointer" };
const popoverBtnPrimary = { flex: 1, padding: "7px 8px", borderRadius: 8, border: "none", background: T.primary, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" };
const pill = { display: "inline-block", padding: "4px 10px", borderRadius: 999, background: "#F1F2F5", color: T.hi, fontSize: 11, fontWeight: 600 };
const btnBase = { display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${T.line}`, borderRadius: 9, padding: "7px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer", background: "#fff", color: T.hi };
const sbtn = { ...btnBase };
const pbtn = { ...btnBase, background: "linear-gradient(135deg,#E30613,#B9050F)", color: "#fff", border: "none", padding: "9px 16px" };
