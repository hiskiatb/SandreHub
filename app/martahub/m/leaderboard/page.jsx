"use client";
/**
 * /martahub/m/leaderboard - Peringkat DMO (web mobile).
 * Baca dari RPC `mh_leaderboard_for_me(p_month)` (SECURITY DEFINER), BUKAN
 * lagi langsung dari view `mh_leaderboard_summary` - view lama dulu
 * dikembalikan MENTAH ke client tanpa scoping DB sama sekali (500 baris
 * detail lengkap se-Sumatera selalu ikut terkirim, cuma DISEMBUNYIKAN di
 * UI lewat filter JS - siapa pun yang buka Network tab browser tetap bisa
 * lihat detail semua orang). RPC baru ini:
 *   1. Baris DETAIL yang dikembalikan dibatasi sesuai scope role (bme_rge
 *      cuma peer 1 branch+brand sendiri, tmv 1 region+brand, head 1 region
 *      atau semua kalau region kosong "Circle Sumatera", admin/spm_sumatera
 *      semua) - jadi detail orang di luar cakupan BENAR-BENAR tidak pernah
 *      terkirim ke client sama sekali, bukan cuma disembunyikan.
 *   2. TAPI rank/total peserta tetap dihitung dari SELURUH populasi BME
 *      Sumatera bulan itu - baris milik SENDIRI (is_me) selalu ikut
 *      dikirim apa pun scope-nya, jadi user tetap tahu persis rank-nya
 *      walau tidak bisa lihat detail baris org lain di luar cakupannya.
 *
 * Design catatan (permintaan user, jgn diringkas balik jadi 1 skor gabungan):
 * - TIDAK ADA skor gabungan/blended (final_score versi lama BUG: rasio
 *   revenue/cost tanpa batas atas bisa meledak ratusan ribu persen kalau ada
 *   1 activity dgn cost_actual kecil/salah input, otomatis nyangkut rank #1
 *   padahal bukan performa terbaik).
 * - Ranking MULTI-METRIK, user pilih sendiri mode-nya lewat chip: Revenue
 *   Actual, Revenue Plan, Jumlah Plan, Actual SP, Actual FWA, Actual Rebuy.
 * - Filter Bulan (dulu selalu bulan berjalan, sekarang bisa pilih bulan
 *   lain - sama pola dgn MonthSelect di Beranda/Kalender).
 * - Setiap baris juga menampilkan Branch & Brand orangnya, bukan cuma nama,
 *   supaya jelas asal/scope tiap peserta leaderboard.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trophy, Crown, Medal, TrendingUp, MapPin, Users, ChevronDown, CalendarDays } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../_shared/MobileShell";
import BottomSheet from "../_shared/BottomSheet";
import { X } from "lucide-react";

// Singkatan region - SAMA PERSIS dgn REGION_ABBR di Beranda (app/martahub/m/page.jsx)
// supaya konsisten se-app, bukan nilai baru yg beda sumber.
const REGION_ABBR = { "NORTH SUMATERA": "NSA", "CENTRAL SUMATERA": "CSA", "SOUTH SUMATERA": "SSA" };
import { fmtInt, fmtRp } from "../_shared/activityUi";
import { BRAND_DISPLAY, REGIONS } from "../_shared/planData"; // BRAND_DISPLAY dipakai di LeaderRow (badge brand per aktivitas); REGIONS utk filter Region akun "Circle" (head/tmv region kosong, atau unscoped)

// Kunci localStorage utk mengingat pilihan filter Region di Leaderboard
// antar sesi (device ini saja) - SAMA pola dgn FILTERS_STORAGE_KEY di
// Beranda (app/martahub/m/page.jsx), tapi key terpisah krn konteksnya beda
// (leaderboard tidak ikut nyimpan branchFilter/brandFilter krn branchPick
// di sini sudah state lokal biasa, cukup regionFilter saja yg perlu
// bertahan antar sesi).
const LB_FILTERS_STORAGE_KEY = "mh_leaderboard_filters_v1";
function loadSavedLbFilters() {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(window.localStorage.getItem(LB_FILTERS_STORAGE_KEY) || "{}") || {}; }
  catch { return {}; }
}
function saveLbFilters(f) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(LB_FILTERS_STORAGE_KEY, JSON.stringify(f)); } catch { /* best-effort */ }
}

// Sama persis dgn LAUNCH_YEAR/MONTH di Beranda (app/martahub/m/page.jsx) &
// CalendarPickerSheet - MartaHub mobile mulai Agustus 2026, jadi pemilihan
// bulan tidak perlu bisa mundur ke sebelum itu.
const LAUNCH_YEAR = 2026, LAUNCH_MONTH = 7;
const MONTHS_FULL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function monthOptions() {
  const now = new Date();
  const launch = new Date(LAUNCH_YEAR, LAUNCH_MONTH, 1);
  const cursor = now < launch ? launch : now;
  const span = (cursor.getFullYear() - LAUNCH_YEAR) * 12 + (cursor.getMonth() - LAUNCH_MONTH);
  const opts = [];
  for (let i = 0; i <= span; i++) {
    const d = new Date(LAUNCH_YEAR, LAUNCH_MONTH + span - i, 1);
    opts.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}` });
  }
  return opts;
}

const DAY_ABBR = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

// Daftar tanggal 1..akhir bulan dari monthKey ("YYYY-MM") - dipakai utk chip
// pemilih tanggal di leaderboard (mempersempit dari "seluruh bulan" ke
// SATU hari tertentu saja). Tanggal di masa depan (belum terjadi) tetap
// ditampilkan tapi ditandai disabled - datanya pasti masih kosong.
function daysInMonthOptions(monthKey) {
  if (!monthKey) return [];
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const opts = [];
  for (let d = 1; d <= last; d++) {
    const dt = new Date(y, m - 1, d);
    opts.push({
      key: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      day: d,
      weekday: DAY_ABBR[dt.getDay()],
      future: dt.getTime() > today.getTime(),
      isToday: dt.getTime() === today.getTime(),
    });
  }
  return opts;
}

const COLS =
  "id,user_id,user_name,branch_id,branch_name,region,brand,total_activities," +
  "target_rev_3m,actual_rev_3m,target_sp,actual_sp,target_fwa,actual_fwa," +
  "target_rebuy_total,actual_rebuy_total,ach_revenue_pct,ach_sp_pct,ach_fwa_pct,geo_compliance," +
  "rank_actual_rev,rank_target_rev,rank_total_activities,rank_actual_sp,rank_actual_fwa,rank_actual_rebuy," +
  "total_participants,in_scope,is_me,has_legacy,legacy_activities,legacy_actual_rev,legacy_contributors";

// Mode ranking - tiap mode bawa `field` (angka yg ditampilkan) & `rankField`
// (kolom rank_* dari RPC, dihitung server dari SELURUH populasi - lihat
// catatan di atas) supaya badge rank di kartu "Peringkat Anda" & tiap baris
// SELALU akurat, bukan cuma dihitung ulang dari baris yg kebetulan terlihat.
const MODES = [
  { key: "actual_rev", label: "Revenue Actual", field: "actual_rev_3m", rankField: "rank_actual_rev", fmt: fmtRp, desc: "Total realisasi revenue bulan ini (Actual)" },
  { key: "plan_rev", label: "Revenue Plan", field: "target_rev_3m", rankField: "rank_target_rev", fmt: fmtRp, desc: "Total target revenue di Plan yang disetujui (Plan)" },
  { key: "jumlah_plan", label: "Jumlah Plan", field: "total_activities", rankField: "rank_total_activities", fmt: (v) => `${fmtInt(v)} plan`, desc: "Jumlah Plan/Activity bulan ini" },
  { key: "actual_sp", label: "Actual SP", field: "actual_sp", rankField: "rank_actual_sp", fmt: (v) => `${fmtInt(v)} SP`, desc: "Total realisasi penjualan SP bulan ini (Actual)" },
  { key: "actual_fwa", label: "Actual FWA", field: "actual_fwa", rankField: "rank_actual_fwa", fmt: (v) => `${fmtInt(v)} FWA`, desc: "Total realisasi penjualan FWA bulan ini (Actual)" },
  { key: "actual_rebuy", label: "Actual Rebuy", field: "actual_rebuy_total", rankField: "rank_actual_rebuy", fmt: fmtRp, desc: "Total realisasi rebuy SP+FWA bulan ini (Actual)" },
];

export default function LeaderboardPage() {
  const router = useRouter();
  const { loading: sessionLoading, userId, scope } = useMartaSession();
  const months = useMemo(() => monthOptions(), []);
  const [monthKey, setMonthKey] = useState(() => months[0]?.key || "");
  const dayOptions = useMemo(() => daysInMonthOptions(monthKey), [monthKey]);
  const [dateKey, setDateKey] = useState(""); // "" = seluruh bulan, else "YYYY-MM-DD"
  const onMonthChange = (k) => { setMonthKey(k); setDateKey(""); }; // ganti bulan -> reset ke seluruh bulan
  const [rows, setRows] = useState(null);
  const [loadingRows, setLoadingRows] = useState(true);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState(MODES[0]);

  // Pilihan Branch & Brand - dropdown beneran (bukan toggle "branch saya"/
  // "region saya"/"semua"), supaya role yang scope-nya SATU REGION (bukan
  // satu branch tetap) - head, tmv, atau admin/spm_sumatera yang unscoped -
  // tetap bisa mempersempit ke branch/brand TERTENTU dalam cakupannya.
  const [branchList, setBranchList] = useState([]); // {id,name,region}[] - dari mh_branches, difilter cakupan role di bawah
  const [branchPick, setBranchPick] = useState(""); // "" = semua branch dlm cakupan

  // Filter Region - HANYA relevan utk akun "Circle" (head/tmv dgn
  // scope.region KOSONG, mencakup ketiga region sekaligus - mis. "TMV
  // Sumatera") atau unscoped (admin/spm_sumatera) - SAMA PERSIS pola
  // canBrowseRegions di Beranda (app/martahub/m/page.jsx). Akun yg
  // terkunci ke SATU region (scope.region terisi, bukan Circle) tetap
  // lihat badge region sendiri yg non-interaktif spt sebelumnya (lihat
  // render di bawah) - cuma akun Circle/unscoped yg dapat dropdown ini.
  const canBrowseRegions = !!(scope?.unscoped || ((scope?.role === "head" || scope?.role === "tmv") && !scope?.region));
  // Default "" (belum disentuh) - diperlakukan SAMA dgn "ALL" (semua
  // region, tanpa filter) persis spt permintaan user: "secara default
  // filter yang terpilih Semua Region". Dipulihkan dari localStorage
  // device ini supaya pilihan terakhir "nempel" antar sesi (permintaan
  // user: "filter yang digunakan terakhir tersimpan dengan baik").
  const [regionFilter, setRegionFilter] = useState(() => loadSavedLbFilters().regionFilter || "");
  useEffect(() => { saveLbFilters({ regionFilter }); }, [regionFilter]);
  // Region efektif yg BENAR-BENAR dipakai menyaring data - "" (default,
  // belum disentuh) ATAU "ALL" (sengaja dipilih "Semua Region") DUA-DUANYA
  // berarti TIDAK ADA filter region tambahan (RPC tetap membatasi ke
  // cakupan role spt biasa, cuma tidak dipersempit lagi oleh dropdown ini).
  const effectiveRegionFilter = canBrowseRegions && regionFilter && regionFilter !== "ALL" ? regionFilter : "";
  const regionOptions = canBrowseRegions
    ? [{ value: "ALL", label: "Semua Region" }, ...REGIONS.map((r) => ({ value: r.key, label: REGION_ABBR[r.key] || r.label }))]
    : [];

  // Baris leaderboard yg sedang dibuka detail legacy-nya (klik baris) -
  // null = popup tertutup. Lihat LegacyContributorsSheet di bawah: popup
  // ini SATU-SATUNYA tempat kontributor lama (org yg pernah log activity
  // di branch ini sebelum struktur baru 5 Okt 2026, tapi sekarang bukan
  // DMO resmi branch itu lagi) ditampilkan - tidak lagi dicampur ke nama
  // utama via suffix " dkk" spt sebelumnya (permintaan user: tampilan
  // pertama HARUS pakai struktur baru/DMO resmi saja, riwayat lama cuma
  // muncul kalau user sengaja klik utk lihat).
  const [legacyRow, setLegacyRow] = useState(null);

  useEffect(() => {
    if (sessionLoading || !monthKey) return;
    let alive = true;
    setLoadingRows(true); setErr("");
    (async () => {
      try {
        const [{ data, error }, { data: branches, error: be }] = await Promise.all([
          supabaseMarta.rpc("mh_leaderboard_for_me", { p_month: monthKey, p_date: dateKey || null }).select(COLS),
          supabaseMarta.from("mh_branches").select("id,name,region").eq("active", true), // cuma branch AKTIF - RPC leaderboard sudah tidak pernah ngirim branch legacy lagi (lihat catatan besar di mh_leaderboard_for_me), jadi dropdown filter di sini jangan nawarin opsi yg pasti kosong hasilnya
        ]);
        if (error) throw error;
        if (be) throw be;
        if (alive) { setRows(data || []); setBranchList(branches || []); }
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat leaderboard");
      } finally {
        if (alive) setLoadingRows(false);
      }
    })();
    return () => { alive = false; };
  }, [sessionLoading, monthKey, dateKey]);

  // Daftar branch yang BOLEH dipilih role ini - bme_rge/tm (punya SATU
  // branch tetap, scope.branchName terisi) cuma lihat branch-nya sendiri
  // (dropdown tidak relevan utk mereka, disembunyikan); head/tmv dibatasi
  // ke branch-branch DALAM region mereka; admin/spm_sumatera (unscoped)
  // lihat semua branch.
  const allowedBranches = useMemo(() => {
    // BUG YG DIPERBAIKI (sama kelasnya dgn Beranda/app/martahub/m/page.jsx):
    // scope.region KOSONG pada role head/tmv berarti akun "Circle" (mis.
    // "TMV Sumatera" - sengaja TIDAK dipatok ke satu region, mencakup
    // ketiganya) - dulu kondisi di bawah (`if (scope?.region)`) salah
    // menganggap region kosong = "tidak ada branch yg boleh dipilih sama
    // sekali" (return []), padahal harusnya SAMA leluasanya dgn unscoped.
    // Sekarang: unscoped ATAU region kosong pada head/tmv = semua branch;
    // scope.region terisi = tetap dibatasi ke branch dalam region itu saja.
    let list;
    if (scope?.unscoped || (!scope?.region && (scope?.role === "head" || scope?.role === "tmv"))) {
      list = branchList.slice();
    } else if (scope?.region) {
      list = branchList.filter((b) => b.region === scope.region);
    } else {
      list = [];
    }
    // Filter Region dari dropdown (effectiveRegionFilter) mempersempit
    // LEBIH LANJUT - cuma berlaku utk akun yg memang "Circle"/unscoped
    // (canBrowseRegions), tidak pernah menambah akses baru di luar scope.
    if (effectiveRegionFilter) list = list.filter((b) => b.region === effectiveRegionFilter);
    return list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [branchList, scope, effectiveRegionFilter]);

  // "Peringkat Anda" - SELALU dari baris is_me (RPC selalu mengirim baris
  // sendiri apa pun scope-nya, terlepas dari filter branch/brand/mode yang
  // sedang dipilih) - supaya rank tetap kelihatan walau daftar detail di
  // bawahnya sedang difilter/dipersempit habis-habisan.
  const myRow = useMemo(() => (rows || []).find((r) => r.is_me), [rows]);

  // Daftar detail yg BENAR-BENAR ditampilkan - RPC sudah membatasi baris
  // apa saja yg dikirim sesuai scope (in_scope/is_me), jadi di sini cuma
  // filter dropdown branch/brand TAMBAHAN (mempersempit lebih lanjut dalam
  // cakupan yg memang sudah dikirim server) + urutkan berdasarkan rank
  // GLOBAL (r[mode.rankField]) - BUKAN index lokal - supaya urutan tampil
  // konsisten dgn badge rank yg ditulis di tiap baris.
  // Brand TIDAK LAGI relevan sbg filter di sini - grain leaderboard sekarang
  // PER BRANCH (bukan per DMO/brand lagi, lihat catatan besar di RPC
  // `mh_leaderboard_for_me`), satu baris branch bisa mewakili DMO IM3 & 3ID
  // sekaligus, jadi kolom `brand` dari RPC SELALU null & filter brand lama
  // (scope.brand/brandPick) dihapus - sebelumnya ini DIAM2 bikin daftar
  // kosong total utk akun yg scope.brand-nya masih terisi (field brand di
  // profil masih ada, RPC sudah tidak pernah ngirim nilainya lagi).
  const filtered = useMemo(() => {
    let list = rows || [];
    if (scope?.region && !scope?.unscoped) list = list.filter((r) => r.region === scope.region);
    // Filter Region dari dropdown - cuma aktif kalau akun ini Circle/
    // unscoped (effectiveRegionFilter sudah "" kalau bukan, lihat
    // canBrowseRegions di atas), jadi tidak pernah bocor ke luar cakupan
    // role yang sebenarnya (RPC server tetap sumber kebenaran utama).
    if (effectiveRegionFilter) list = list.filter((r) => r.region === effectiveRegionFilter);
    if (branchPick) list = list.filter((r) => r.branch_id === branchPick);
    return list.slice().sort((a, b) => (a[mode.rankField] || 9999) - (b[mode.rankField] || 9999));
  }, [rows, scope, branchPick, mode, effectiveRegionFilter]);

  if (sessionLoading || rows === null) {
    return (
      <MobileShell active="leaderboard">
        <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px" }}><BackBar router={router} /></div>
        <ShellSpinner />
      </MobileShell>
    );
  }

  return (
    <MobileShell active="leaderboard">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 0", fontFamily: FF }}>
        <BackBar router={router} />
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <Trophy size={19} color="#ED1C24" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Leaderboard</div>
          </div>
          <MonthPicker value={monthKey} onChange={onMonthChange} options={months} />
        </div>
        <div style={{ marginTop: 3, fontSize: 12.5, color: "#8A8A96", fontWeight: 500 }}>
          {mode.desc}{dateKey ? ` · khusus tanggal terpilih` : ""}
        </div>

        {/* Pemilih tanggal - default "Semua Tanggal" (agregat sebulan penuh,
            perilaku lama). Geser chip ke tanggal tertentu -> leaderboard
            dihitung ULANG server-side (RPC p_date) cuma dari data hari itu
            saja. Direset otomatis tiap ganti bulan (lihat onMonthChange). */}
        <div className="mh-hide-scrollbar" style={{ display: "flex", gap: 6, marginTop: 12, overflowX: "auto", paddingBottom: 2, WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}>
          <button onClick={() => setDateKey("")}
            style={{
              flexShrink: 0, display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 12,
              background: !dateKey ? "#17181C" : "#FFFFFF", border: `1px solid ${!dateKey ? "#17181C" : "#E9EAEE"}`,
              color: !dateKey ? "#FFFFFF" : "#5A5A68", fontSize: 11.5, fontWeight: 800, fontFamily: FF, cursor: "pointer", whiteSpace: "nowrap",
            }}>
            <CalendarDays size={12} /> Semua Tanggal
          </button>
          {dayOptions.map((d) => {
            const active = dateKey === d.key;
            return (
              <button key={d.key} onClick={() => !d.future && setDateKey(active ? "" : d.key)} disabled={d.future}
                style={{
                  flexShrink: 0, width: 40, padding: "6px 0 7px", borderRadius: 12, textAlign: "center",
                  background: active ? "#ED1C24" : "#FFFFFF",
                  border: `1px solid ${active ? "#ED1C24" : d.isToday ? "#ED1C24" : "#E9EAEE"}`,
                  color: d.future ? "#C7C8D1" : active ? "#FFFFFF" : "#17181C",
                  cursor: d.future ? "default" : "pointer", fontFamily: FF,
                  opacity: d.future ? 0.55 : 1,
                }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.2, color: active ? "rgba(255,255,255,0.85)" : d.isToday ? "#ED1C24" : "#B0B0BA" }}>{d.weekday}</div>
                <div style={{ fontSize: 13, fontWeight: 800, marginTop: 1 }}>{d.day}</div>
              </button>
            );
          })}
        </div>

        {/* Mode ranking - scrollable horizontal, biar 6 opsi ga bikin sempit */}
        {/* Scrollbar mode-chip DISEMBUNYIKAN (className mh-hide-scrollbar,
            lihat <style jsx global> di bawah) - scroll horizontal tetap jalan,
            cuma bar abu2 di bawahnya yg dihilangkan (mengganggu visual). */}
        <div className="mh-hide-scrollbar" style={{ display: "flex", gap: 7, marginTop: 14, overflowX: "auto", paddingBottom: 2, WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {MODES.map((m) => {
            const active = mode.key === m.key;
            return (
              <button key={m.key} onClick={() => setMode(m)}
                style={{
                  flexShrink: 0, padding: "8px 13px", borderRadius: 999,
                  background: active ? "#ED1C24" : "#FFFFFF", border: `1px solid ${active ? "#ED1C24" : "#E9EAEE"}`,
                  color: active ? "#FFFFFF" : "#5A5A68", fontSize: 12, fontWeight: 700, fontFamily: FF, cursor: "pointer", whiteSpace: "nowrap",
                  transition: "background .15s, border-color .15s, color .15s",
                }}>
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Cakupan: SEMUA role (termasuk bme_rge/bsm yg branch-nya sendiri
            tetap/terkunci) sekarang lihat ranking SATU REGION, bukan cuma
            branch sendiri - jadi badge Region + dropdown Branch ("Semua
            Branch" = seluruh region, atau persempit ke 1 branch tertentu
            termasuk branch sendiri) SELALU ditampilkan dgn pola yg SAMA,
            tidak lagi dibedakan jadi "badge statis" (branch-locked) vs
            "dropdown" (region-scope) spt sebelumnya - RPC tetap yg
            menentukan batas sebenarnya (region caller), dropdown ini cuma
            mempersempit DALAM region itu, tidak pernah bisa "bocor" ke
            region lain. */}
        <div className="mh-hide-scrollbar" style={{ display: "flex", gap: 7, marginTop: 10, overflowX: "auto", paddingBottom: 2, WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {/* Akun terkunci SATU region (bukan Circle) - badge statis spt
              sebelumnya, tidak interaktif krn memang cuma 1 pilihan. */}
          {scope?.region && !scope?.unscoped && (
            <div style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 11px", borderRadius: 999, background: "#F5F5F7", border: "1px solid #E9EAEE", whiteSpace: "nowrap" }}>
              <MapPin size={12} color="#5A5A68" />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "#5A5A68", fontFamily: FF }}>{REGION_ABBR[scope.region] || scope.region}</span>
            </div>
          )}
          {/* Akun Circle (head/tmv region kosong, mis. "TMV Sumatera") atau
              unscoped (admin/spm_sumatera) - dropdown Region beneran,
              default "Semua Region", tersimpan ke localStorage tiap
              berubah (lihat saveLbFilters di atas) supaya pilihan terakhir
              tetap nempel kalau DMO buka lagi nanti. */}
          {canBrowseRegions && (
            <div style={{ flexShrink: 0 }}>
              <SelectPill
                value={regionFilter}
                onChange={(v) => { setRegionFilter(v); setBranchPick(""); }}
                active={!!effectiveRegionFilter}
              >
                {regionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </SelectPill>
            </div>
          )}
          {allowedBranches.length > 0 && (
            <div style={{ flexShrink: 0 }}>
              <SelectPill value={branchPick} onChange={setBranchPick} active={!!branchPick}>
                <option value="">Semua Branch</option>
                {allowedBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </SelectPill>
            </div>
          )}
        </div>
      </div>

      {myRow && (
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{ borderRadius: 18, background: BRAND, padding: "16px 18px", color: "#fff", boxShadow: "0 6px 16px rgba(237,28,36,0.18)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.85, textTransform: "uppercase", letterSpacing: 0.3 }}>Peringkat Anda</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 3 }}>
                  <div style={{ fontSize: 26, fontWeight: 800 }}>#{fmtInt(myRow[mode.rankField])}</div>
                  {myRow.total_participants > 0 && (
                    <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>dari {fmtInt(myRow.total_participants)} DMO</div>
                  )}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.85, textTransform: "uppercase", letterSpacing: 0.3 }}>{mode.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, marginTop: 3 }}>{mode.fmt(myRow[mode.field])}</div>
              </div>
            </div>
            {!myRow.in_scope && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, opacity: 0.85 }}>
                <Users size={12} /> Rank dihitung dari seluruh Sumatera - detail peserta lain di luar cakupan Anda tidak ditampilkan.
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ padding: "16px 20px 40px" }}>
        {err && <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#8A8A96", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Dalam cakupan Anda
          </div>
          {loadingRows && <div style={{ width: 12, height: 12, border: "1.5px solid #E9EAEE", borderTopColor: "#ED1C24", borderRadius: "50%", animation: "lbspin 0.8s linear infinite" }} />}
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", background: "#FFFFFF", border: "1px dashed #D8D9E0", borderRadius: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#3A3A44" }}>Belum ada data</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#8A8A96" }}>Leaderboard akan muncul setelah ada Plan tervalidasi bulan ini.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((r, i) => <LeaderRow key={r.id} r={r} mode={mode} isMe={r.user_id === userId} onOpenLegacy={() => setLegacyRow(r)} displayRank={i + 1} />)}
          </div>
        )}
      </div>

      {legacyRow && <LegacyContributorsSheet row={legacyRow} onClose={() => setLegacyRow(null)} />}

      <style jsx global>{`
        .mh-hide-scrollbar::-webkit-scrollbar { display: none; height: 0; }
        @keyframes lbspin { to { transform: rotate(360deg); } }
      `}</style>
    </MobileShell>
  );
}

function BackBar({ router }) {
  return (
    <button onClick={() => router.push("/martahub/m")}
      style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
      <ArrowLeft size={16} /> Beranda
    </button>
  );
}

// Dropdown pill light-theme - dipakai utk Branch/Brand (bekas <select>
// inline yg sekarang dirapikan jadi komponen kecil bersama, konsisten sama
// gaya chevron/warna yg dipakai MonthPicker di bawah).
function SelectPill({ value, onChange, active, children }) {
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "7px 26px 7px 12px", borderRadius: 999, background: active ? "#17181C" : "#F5F5F7",
          border: `1px solid ${active ? "#17181C" : "#E9EAEE"}`, color: active ? "#FFFFFF" : "#5A5A68",
          fontSize: 11.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", appearance: "none", WebkitAppearance: "none",
        }}>
        {children}
      </select>
      <ChevronDown size={12} style={{ position: "absolute", right: 9, pointerEvents: "none", color: active ? "rgba(255,255,255,0.8)" : "#8A8A96" }} />
    </div>
  );
}

// Pemilih bulan - versi light (halaman leaderboard bg putih), pola SAMA
// dgn MonthSelect dark di Beranda (app/martahub/m/page.jsx).
function MonthPicker({ value, onChange, options }) {
  const selected = options.find((o) => o.key === value);
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
      <div style={{ display: "inline-flex", alignItems: "center", minHeight: 32, padding: "7px 26px 7px 12px", borderRadius: 999, background: "#F5F5F7", border: "1px solid #E9EAEE" }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "#17181C", whiteSpace: "nowrap" }}>{selected?.label || "Bulan"}</span>
      </div>
      <ChevronDown size={12} style={{ position: "absolute", right: 9, pointerEvents: "none", color: "#8A8A96" }} />
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Bulan"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, border: "none", cursor: "pointer", fontFamily: FF, fontSize: 16 }}>
        {options.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
      </select>
    </div>
  );
}

function rankVisual(rank) {
  if (rank === 1) return { icon: <Crown size={16} color="#B45309" />, bg: "rgba(180,83,9,0.08)" };
  if (rank === 2) return { icon: <Medal size={16} color="#6B7280" />, bg: "rgba(107,114,128,0.08)" };
  if (rank === 3) return { icon: <Medal size={16} color="#B45309" />, bg: "rgba(180,83,9,0.06)" };
  return { icon: null, bg: null };
}

function LeaderRow({ r, mode, isMe, onOpenLegacy, displayRank }) {
  // Badge rank pakai POSISI LOKAL di daftar yg SEDANG ditampilkan
  // (displayRank = index+1 setelah filter Region/Branch & sort), BUKAN
  // r[mode.rankField] (rank GLOBAL se-Sumatera dari RPC) - dulu pakai
  // rank global, jadi begitu daftar dipersempit lewat filter, angkanya
  // bisa "loncat" (mis. 1, 3, 4, 8, 12...) krn orang2 di antaranya ada
  // di luar filter. Sekarang SELALU rapi berurutan 1,2,3,4,5... dan ikon
  // mahkota/medali SELALU cuma utk 3 TERATAS DALAM TAMPILAN SAAT INI
  // (konsisten dgn permintaan user), bukan tergantung rank global mereka.
  const rv = rankVisual(displayRank);
  return (
    <button onClick={r.has_legacy ? onOpenLegacy : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 12, background: isMe ? "#FFF5F6" : "#FFFFFF", width: "100%",
        border: `1px solid ${isMe ? "#F7C6C9" : "#E9EAEE"}`, borderRadius: 14, padding: "11px 13px", fontFamily: FF,
        textAlign: "left", cursor: r.has_legacy ? "pointer" : "default",
      }}>
      <div style={{ flexShrink: 0, width: 30, height: 30, borderRadius: "50%", background: rv.bg || "#F0F0F3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#5A5A68" }}>
        {rv.icon || fmtInt(displayRank)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.user_name || "-"} {isMe && <span style={{ color: "#ED1C24" }}>(Anda)</span>}
        </div>
        <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "#8A8A96", fontWeight: 600, overflow: "hidden" }}>
          <MapPin size={10} style={{ flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.branch_name || "-"}
            {r.brand && <> · <span style={{ color: "#5A5A68", fontWeight: 800 }}>{BRAND_DISPLAY[r.brand] || String(r.brand).toUpperCase()}</span></>}
            {" "}· {fmtInt(r.total_activities)} plan
          </span>
        </div>
      </div>
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 13.5, fontWeight: 800, color: "#17181C" }}>
          <TrendingUp size={12} color="#15803D" /> {mode.fmt(r[mode.field])}
        </div>
        <div style={{ fontSize: 9.5, color: "#B0B0BA", fontWeight: 600 }}>{mode.label}</div>
      </div>
    </button>
  );
}

// Popup detail kontributor lama - dibuka dgn klik baris yg `has_legacy`
// true. Isinya daftar orang yg log activity di branch ini bulan yg dipilih
// TAPI secara struktur (mh_profiles) bukan DMO resmi branch itu lagi
// (biasanya krn restrukturisasi 5 Okt 2026) - angka utama baris
// (total_activities/revenue dkk) SUDAH menjumlahkan SEMUA kontributor
// (current + legacy digabung, permintaan user: "di tampilan awal gunakan
// total dari semua kontributor") - popup ini cuma RINCIAN siapa
// menyumbang berapa dari total itu, bukan angka yg dikecualikan.
function LegacyContributorsSheet({ row, onClose }) {
  const contributors = row.legacy_contributors || [];
  return (
    <BottomSheet onClose={onClose} zIndex={200} borderRadius="24px 24px 0 0">
      <div style={{ padding: "4px 20px 28px", fontFamily: FF }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#17181C" }}>Riwayat Kontributor Lama</div>
          <button onClick={onClose} style={{ background: "#F5F5F7", border: "none", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={14} color="#5A5A68" />
          </button>
        </div>
        <div style={{ marginTop: 4, fontSize: 11.5, color: "#8A8A96", fontWeight: 500 }}>
          {row.branch_name} · DMO resmi saat ini: <span style={{ color: "#17181C", fontWeight: 700 }}>{row.user_name || "-"}</span>
        </div>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {contributors.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 12, background: "#F7F7F9", border: "1px solid #ECECF0" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C" }}>{c.name}</div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#17181C" }}>{fmtInt(c.activities)} plan</div>
                {c.actual_rev > 0 && <div style={{ fontSize: 10, color: "#8A8A96", fontWeight: 600 }}>{fmtRp(c.actual_rev)}</div>}
              </div>
            </div>
          ))}
          {contributors.length === 0 && (
            <div style={{ fontSize: 11.5, color: "#8A8A96", textAlign: "center", padding: "12px 0" }}>Tidak ada detail kontributor.</div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
