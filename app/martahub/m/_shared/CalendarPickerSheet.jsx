"use client";
/**
 * CalendarPickerSheet - picker Plan Date berbasis kalender bulanan, padanan
 * `activity_calendar_sheet.dart` (Flutter): grid kalender custom (bukan
 * library), titik status di tanggal yang sudah punya plan (RPC
 * `mh_activity_calendar_for_me`, scoping hierarki server-side sama persis
 * dgn Flutter, dipakai jg utk titik warna "sudah ada plan" di grid).
 *
 * TIDAK ADA LAGI mode Tunggal/Rentang/Beberapa yang harus dipilih manual -
 * pengguna TINGGAL TAP tanggal, seperti kalender kebanyakan (Google/Apple
 * Calendar). Logikanya otomatis lewat `groupContiguousDates()`
 * (_shared/planData.js): tanggal-tanggal yang BERDEKATAN otomatis
 * digambar & disimpan sebagai satu rentang menyambung, sedangkan tanggal
 * yang terpisah tetap jadi titik-titik individual. Tap tanggal yang sudah
 * terpilih untuk membatalkannya.
 *
 * Waktu SEKARANG WAJIB DIATUR PER TANGGAL, bukan satu waktu global utk semua
 * tanggal terpilih. Begitu >=1 tanggal dipilih, di bawah grid muncul daftar
 * compact - satu baris per tanggal terpilih, tiap baris cuma menunjukkan
 * ringkasan waktu & diketuk utk membuka POPUP kecil (bukan bottom sheet
 * berat spt sebelumnya) tempat mengatur Seharian/Mulai/Berakhir - gaya
 * "productivity app" yang umum (Google Calendar/Todoist): tap baris → popup
 * kecil di tengah layar → atur → tutup. Ini supaya kalau BME/RGE berbeda
 * punya beberapa activity plan di tanggal yang sama, sisi TMV yang melihat
 * kalender gabungan bisa mengurutkan activity² tsb berdasarkan jam mulainya
 * masing-masing - rapi & tidak ambigu. Lihat `planData.js`:
 * `syncTimesByDate()`, `allDateTimesValid()`, `planTimeFields()`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, ArrowRight, X, Check, Plus, Loader2, MapPin, CalendarDays, Clock, Info, AlertTriangle, CardSim, Router, Receipt } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import { FF, BRAND } from "./MobileShell";
import { lockPullToRefresh, unlockPullToRefresh } from "./pullToRefreshLock";
import BottomSheet from "./BottomSheet";
import { fmtDate, statusMeta, fmtInt, fmtRp, activityStage } from "./activityUi";
import { MetricTile, RebuyTile, RevenueCostBanner } from "./MetricTiles";
import { groupContiguousDates, syncTimesByDate, allDateTimesValid, DEFAULT_DATE_TIME } from "./planData";

// Kunci pull-to-refresh via reference count (bukan sekadar set/delete satu
// flag) - sheet "Pilih Plan Date" ITU SENDIRI mengunci, & popup atur waktu
// di dalamnya (TimeEditPopup) mengunci lagi begitu dibuka; kalau cuma
// set/delete polos, menutup popup (unmount lebih dulu drpd sheetnya) akan
// ikut MELEPAS kunci milik sheet induknya walau sheetnya masih terbuka.
// Dgn counter, kunci baru benar² lepas ("hitung mundur ke 0") setelah
// SEMUA pemakainya (sheet + popup) sudah unmount.
// lockPullToRefresh/unlockPullToRefresh dipindah ke pullToRefreshLock.js
// (modul tersendiri) supaya BottomSheet.jsx bisa pakai tanpa circular
// import - file ini sendiri skrg pakai BottomSheet.jsx utk popup2 di
// bawah. Re-export di sini spy import lama (file lain yg masih
// `from "./CalendarPickerSheet"`) tidak putus.
export { lockPullToRefresh, unlockPullToRefresh } from "./pullToRefreshLock";

const MONTH_NAMES_FULL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DOW = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const DOW_FULL = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
// MartaHub mobile mulai Agustus 2026 - kalender ini tidak perlu bisa mundur
// ke bulan sebelum itu (dipakai jg oleh page.jsx Home, disamakan di sana).
const LAUNCH_YEAR = 2026, LAUNCH_MONTH = 7;

// Prioritas warna titik saat 1 tanggal punya >1 aktivitas - status paling
// "butuh perhatian" menang, SAMA PERSIS dgn `_dotColor()` Flutter.
function dotColorForStatuses(statuses) {
  if (statuses.some((s) => s === "rejected" || s === "revision_needed" || s === "revision_actual")) return "#DC2626";
  if (statuses.some((s) => s === "plan_submitted" || s === "pending_validation")) return "#B45309";
  if (statuses.some((s) => s === "approved")) return "#15803D";
  return "#6B7280"; // draft / lainnya
}

function pad2(n) { return String(n).padStart(2, "0"); }
function toKey(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }

/** Ekspansi satu activity ke semua tanggal yang relevan (single/range/multi
 * plan date) - dipakai utk bucket per-hari di kalender (titik status). */
function activityDateKeys(a) {
  if (a.plan_dates_multi) return a.plan_dates_multi.split(",").filter(Boolean).map((s) => s.trim());
  if (a.plan_date_start && a.plan_date_end && a.plan_date_start !== a.plan_date_end) {
    const keys = [];
    let d = new Date(a.plan_date_start + "T00:00:00");
    const end = new Date(a.plan_date_end + "T00:00:00");
    while (d <= end) { keys.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
    return keys;
  }
  return a.plan_date ? [a.plan_date] : [];
}

function shortDateLabel(key) {
  const d = new Date(key + "T00:00:00");
  return `${DOW_FULL[d.getDay()].slice(0, 3)}, ${d.getDate()} ${MONTH_NAMES_FULL[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

/** Label tanggal LENGKAP (mis. "Kamis, 3 September 2026") - dipakai di
 * header popup konfirmasi & popup atur waktu, TIDAK lagi diringkas jadi 3
 * huruf spt shortDateLabel (yg masih dipakai di daftar ringkas bawah
 * kalender, area itu tetap butuh ringkas krn ruangnya sempit). */
function fullDateLabel(key) {
  const d = new Date(key + "T00:00:00");
  return `${DOW_FULL[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES_FULL[d.getMonth()]} ${d.getFullYear()}`;
}

/** Ringkasan waktu satu tanggal utk badge di baris compact - "Seharian",
 * "09.00–17.00", atau "Belum diatur" (invalid: start/end kosong atau
 * start>=end) supaya pengguna langsung tahu tanggal mana yg masih perlu
 * dibetulkan tanpa harus membuka popup satu-satu. */
function timeSummaryLabel(time) {
  if (!time) return { text: "Belum diatur", invalid: true };
  if (time.isAllDay) return { text: "Seharian", invalid: false };
  const st = time.startTime, et = time.endTime;
  if (!st || !et || st >= et) return { text: "Belum diatur", invalid: true };
  return { text: `${st.replace(":", ".")}–${et.replace(":", ".")}`, invalid: false };
}

/**
 * @param {{ initialDates: string[], initialTimesByDate?: Record<string,{isAllDay:boolean,startTime:string,endTime:string}>,
 *   onClose: () => void,
 *   onConfirm: (dates: string[], timesByDate: Record<string,{isAllDay:boolean,startTime:string,endTime:string}>) => void }} props
 */
export default function CalendarPickerSheet({ initialDates, initialTimesByDate, onClose, onConfirm }) {
  // Kunci pull-to-refresh SELAMA sheet "Pilih Plan Date" ini terbuka, bukan
  // cuma saat TimeEditPopup-nya (lihat flag yg sama di sana) - sheet ini
  // sendiri full-screen menutupi kalender/wizard di belakangnya, jadi tarik
  // ke bawah di mana pun di dalamnya (grid kalender, daftar tanggal, dst)
  // seharusnya tidak pernah memicu reload halaman induk. stopPropagation
  // di root onTouchStart sheet ini (lihat di bawah) sudah ada dari
  // sebelumnya, tapi flag global ini jadi lapis kedua yg pasti berlaku
  // apa pun kondisinya (sama seperti dipasang di TimeEditPopup).
  useEffect(() => {
    lockPullToRefresh();
    return unlockPullToRefresh;
  }, []);

  const today = new Date();
  const firstSelected = initialDates?.find(Boolean);
  const [viewYear, setViewYear] = useState(firstSelected ? Number(firstSelected.slice(0, 4)) : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(firstSelected ? Number(firstSelected.slice(5, 7)) - 1 : today.getMonth());
  const [picked, setPicked] = useState((initialDates || []).filter(Boolean));
  const [byDate, setByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  // Waktu PER TANGGAL - wajib terisi utk setiap tanggal terpilih, disinkron
  // otomatis tiap kali `picked` berubah (tanggal baru → default Seharian,
  // tanggal dibatalkan → dibuang dari peta).
  const [timesByDate, setTimesByDate] = useState(() => syncTimesByDate(picked, initialTimesByDate));
  useEffect(() => {
    setTimesByDate((prev) => syncTimesByDate(picked, prev));
  }, [picked]);

  // Tanggal yang popup atur-waktunya sedang terbuka (null = tertutup). Cuma
  // satu yg bisa terbuka sekaligus - ketuk baris tanggal lain di daftar akan
  // menutup yg lama & membuka yg baru.
  const [openDateKey, setOpenDateKey] = useState(null);
  // true kalau TimeEditPopup yg lagi kebuka ini utk tanggal yg BARU
  // pertama kali ditap (belum "confirmed" sbg pilihan final) - dipakai
  // buat tau apa nutup popup tanpa nge-klik "Gunakan Rentang Waktu Ini"
  // harus MEMBATALKAN tanggal itu (dikeluarkan lagi dari `picked`) atau
  // tidak. Re-edit waktu dari tanggal yg SUDAH terpilih (tap baris "Atur
  // Waktu") beda kasus - itu bukan pemilihan baru, jadi nutup popupnya
  // TIDAK boleh ikut membatalkan tanggal yg sudah confirmed sebelumnya.
  const [openDateKeyIsNew, setOpenDateKeyIsNew] = useState(false);
  // Tanggal yg BARU ditap & SUDAH punya plan lain (byDate[key].length>0) -
  // ditahan dulu di sini utk ditampilkan lewat DateConfirmPopup (daftar
  // plan yg sudah ada + tombol "Tambah Event"/"Batal") SEBELUM lanjut ke
  // TimeEditPopup, dipisah jadi 2 layar sendiri² spy tidak numpuk semua
  // info di satu popup (permintaan user: "pisahkan"). Tanggal yg TIDAK
  // (belum) punya plan lain langsung lompat ke TimeEditPopup spt biasa,
  // tanpa perlu layar konfirmasi ini.
  const [confirmDateKey, setConfirmDateKey] = useState(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  // Activity plan (SUDAH scoped sesuai role login DSF, misal BME cuma
  // lihat plan di bawah subtree timnya sendiri - lihat RPC server
  // `mh_activity_calendar_for_me` -> `_mh_activity_calendar_rows`, BUKAN
  // literally "semua plan di seluruh company") yg lagi ditampilkan
  // detailnya lewat popup - diklik dari daftar "N plan lain sudah ada di
  // tanggal ini" pada TimeEditPopup, supaya pengguna tahu PERSIS apa
  // isinya sebelum menambah plan baru di tanggal yang sama. Label di UI
  // sengaja TIDAK bilang "punya siapa pun" (bikin DSF kira ini plan
  // lintas branch/brand org lain) - sudah diperbaiki jadi "di tim/cakupan
  // Anda", krn datanya sendiri memang SUDAH dibatasi RLS/RPC per hierarki
  // role, cuma copy-nya yg dulu menyesatkan. Ditutup via tombol X atau
  // klik backdrop.
  const [detailAct, setDetailAct] = useState(null);

  // Muat aktivitas 6 minggu grid (termasuk ekor bulan sebelum/sesudah) supaya
  // titik status tetap akurat utk sel yg menampilkan tanggal bulan tetangga.
  const gridStart = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const startOffset = first.getDay();
    return new Date(viewYear, viewMonth, 1 - startOffset);
  }, [viewYear, viewMonth]);
  const gridEnd = useMemo(() => { const d = new Date(gridStart); d.setDate(d.getDate() + 41); return d; }, [gridStart]);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr("");
    (async () => {
      try {
        const { data, error } = await supabaseMarta.rpc("mh_activity_calendar_for_me", {
          p_period_start: gridStart.toISOString().slice(0, 10),
          p_period_end: gridEnd.toISOString().slice(0, 10),
        });
        if (error) throw error;
        const bucket = {};
        for (const a of data || []) {
          for (const key of activityDateKeys(a)) {
            (bucket[key] ||= []).push(a);
          }
        }
        if (alive) setByDate(bucket);
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat kalender");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridStart.getTime()]);

  const cells = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart); d.setDate(d.getDate() + i);
      arr.push({ y: d.getFullYear(), m: d.getMonth(), d: d.getDate(), inMonth: d.getMonth() === viewMonth, key: toKey(d.getFullYear(), d.getMonth(), d.getDate()) });
    }
    return arr;
  }, [gridStart, viewMonth]);

  const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate());
  const todayDow = today.getDay(); // 0=Min...6=Sab, cocok dgn urutan array DOW

  // MartaHub mobile mulai dipakai Agustus 2026 - jangan biarkan pengguna
  // mundur ke bulan sebelum itu (tidak ada plan yg mungkin ada di sana).
  const atLaunchMonth = viewYear === LAUNCH_YEAR && viewMonth === LAUNCH_MONTH;

  function changeMonth(delta) {
    let m = viewMonth + delta, y = viewYear;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    if (y < LAUNCH_YEAR || (y === LAUNCH_YEAR && m < LAUNCH_MONTH)) return;
    setViewMonth(m); setViewYear(y);
  }

  // Tap tanggal → toggle pilih/batal, SAMA seperti kalender kebanyakan. Tidak
  // ada mode apa pun - grup rentang terbentuk otomatis dari keterdekatan.
  // Tanggal BARU (bukan yang sedang dibatalkan) langsung membuka popup atur
  // waktu-nya sendiri - dulu user harus tap lagi baris tanggal itu di
  // daftar bawah utk buka popupnya, sekarang begitu ditap di kalender,
  // langsung lanjut ke pengaturan waktu tanpa langkah tambahan.
  function pickCell(key) {
    setPicked((prev) => {
      const exists = prev.includes(key);
      if (exists) return prev.filter((x) => x !== key);
      const hasOtherPlans = (byDate[key] || []).length > 0;
      if (hasOtherPlans) setConfirmDateKey(key); else { setOpenDateKey(key); setOpenDateKeyIsNew(true); }
      return [...prev, key].sort();
    });
  }

  // Dari DateConfirmPopup: "+ Tambah Event" → lanjut ke TimeEditPopup utk
  // tanggal yg sama; "Batal" → batalkan pemilihan tanggal itu sepenuhnya
  // (dikeluarkan lagi dari `picked`, bukan cuma menutup popupnya).
  function confirmAddEvent() {
    setOpenDateKey(confirmDateKey);
    setOpenDateKeyIsNew(true);
    setConfirmDateKey(null);
  }
  function cancelConfirm() {
    const key = confirmDateKey;
    setConfirmDateKey(null);
    if (key) setPicked((prev) => prev.filter((x) => x !== key));
  }

  // Set waktu utk SATU tanggal - tiap tanggal terpilih SELALU independen,
  // termasuk yang berdekatan/berurutan (daftar "Atur Waktu" di bawah tidak
  // digabung jadi satu rentang dgn waktu bersama).
  function patchTime(date, patch) {
    setTimesByDate((prev) => ({ ...prev, [date]: { ...(prev[date] || DEFAULT_DATE_TIME), ...patch } }));
  }

  // Nutup TimeEditPopup TANPA nge-klik "Gunakan Rentang Waktu Ini" (lewat X,
  // klik backdrop, ATAU drag-to-close) - kalau ini tanggal yg BARU ditap
  // (belum di-confirm sama sekali), batalkan pemilihannya (keluarkan dari
  // `picked`) spy user harus pilih tanggal itu lagi dari awal, BUKAN diam2
  // tetap ke-input dgn waktu default/asal-asalan. Re-edit tanggal yg sudah
  // confirmed sebelumnya TIDAK ikut kebatalin - cuma popup editornya yg
  // ketutup, tanggalnya tetap terpilih dgn waktu yg sudah ada.
  function dismissTimeEdit() {
    const key = openDateKey;
    const wasNew = openDateKeyIsNew;
    setOpenDateKey(null);
    setOpenDateKeyIsNew(false);
    if (wasNew && key) setPicked((prev) => prev.filter((x) => x !== key));
  }
  // Nge-klik "Gunakan Rentang Waktu Ini" - waktu SUDAH ke-apply live lewat
  // patchTime tiap onChange, jadi ini cuma menandai tanggal ini "confirmed"
  // (tidak lagi dianggap "baru"/belum final) & menutup popup - beda dgn
  // dismissTimeEdit, ini TIDAK membatalkan apa pun.
  function confirmTimeEdit() {
    setOpenDateKey(null);
    setOpenDateKeyIsNew(false);
  }

  // Grup tanggal terpilih yang berdekatan → dipakai utk gaya visual "pil
  // menyambung" di kalender & ringkasan atas.
  const groups = useMemo(() => groupContiguousDates(picked), [picked]);
  const pickedSet = useMemo(() => new Set(picked), [picked]);

  // Posisi tiap tanggal terpilih dalam grupnya (start/mid/end/solo) - dipakai
  // utk gaya "pil" kalender: ujung bulat, tengah menyambung datar.
  const cellRole = useMemo(() => {
    const roles = {};
    for (const g of groups) {
      if (g.length === 1) { roles[g[0]] = "solo"; continue; }
      g.forEach((key, i) => {
        roles[key] = i === 0 ? "start" : i === g.length - 1 ? "end" : "mid";
      });
    }
    return roles;
  }, [groups]);

  const summary = useMemo(() => {
    if (picked.length === 0) return null;
    if (groups.length === 1) {
      const g = groups[0];
      return g.length === 1 ? fmtDate(g[0]) : `${fmtDate(g[0])} – ${fmtDate(g[g.length - 1])} · ${g.length} hari`;
    }
    return `${groups.length} rentang · ${picked.length} hari terpilih`;
  }, [picked, groups]);

  const allValid = allDateTimesValid(picked, timesByDate);
  const sortedPicked = useMemo(() => [...picked].sort(), [picked]);

  return (
    <div
      // Sheet ini full-viewport (fixed inset:0) tapi tetap DIRENDER sbg
      // children di dalam container halaman yg jd tempat MobileShell
      // memasang listener pull-to-refresh - jadi gesture sentuh di mana pun
      // dlm sheet ini wajib berhenti di sini, tdk pernah bubble ke halaman
      // di belakangnya. Tanpa ini, menggeser dari titik mana pun (mis. dari
      // grid kalender) tetap bisa "kebaca" jd tarikan pull-to-refresh →
      // `window.location.reload()` → sheet & progress wizard hilang, terasa
      // spt "balik ke halaman Buat Plan" begitu saja.
      onTouchStart={(e) => e.stopPropagation()}
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "#F4F5F7", fontFamily: FF, display: "flex", flexDirection: "column" }}>
      {/* Header - kartu putih dgn bayangan tipis biar terasa "mengambang" di
          atas isi kalender, bukan cuma teks polos nempel di background
          abu-abu. */}
      <div style={{ flexShrink: 0, background: "linear-gradient(180deg,#FFFFFF,#FDFDFE)", borderRadius: "0 0 22px 22px", boxShadow: "0 8px 22px rgba(23,24,28,0.06)", position: "relative", zIndex: 1 }}>
        <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 14px) 18px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* Tombol tutup - kotak rounded (bukan bulat) supaya SECARA BENTUK
              beda dgn stepper bulan di bawah (bulat) - jadi tidak ada dua
              kontrol berbeda fungsi yg keliatan sama & bikin bingung mana
              "kembali/tutup" vs mana "ganti bulan". */}
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 11, background: "#F6F7F9", border: "1px solid #ECEDF0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68" }}>
            <X size={15} />
          </button>
          <div style={{ fontSize: 16.5, fontWeight: 800, color: "#17181C", letterSpacing: -0.3 }}>Pilih Plan Date</div>
          <div style={{ width: 34 }} />
        </div>
      </div>

      {/* Kalender - discroll kalau ruangnya sempit, supaya tidak ada yang
          terpotong (fix WebkitOverflowScrolling/overscrollBehavior tetap
          dipertahankan). */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", background: "#F4F5F7" }}>
      {/* Kartu kalender - month/year stepper SEKARANG dipindah jadi header
          DI DALAM kartu ini (dulu ada di luar, di dalam header putih
          bergradasi bareng tombol X) - konsep digabung dgn kartu kalender
          di menu Kalender (calendar/page.jsx): satu blok kartu putih utuh
          isinya stepper bulan + grid tanggal, mengambang di atas background
          abu2 halaman. Interaksi ketuk label bulan → buka
          MonthYearPickerSheet TETAP SAMA, cuma posisinya yang pindah. */}
      <div style={{ padding: "16px 16px 0", flexShrink: 0 }}>
        <div style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 18, padding: "12px 12px 14px", boxShadow: "0 4px 14px rgba(17,17,20,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "2px 0 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 2, background: "#F1F2F5", borderRadius: 999, padding: 4 }}>
            <button onClick={() => changeMonth(-1)} disabled={atLaunchMonth}
              style={{ width: 32, height: 32, borderRadius: "50%", background: "#FFFFFF", border: "none", boxShadow: atLaunchMonth ? "none" : "0 1px 4px rgba(23,24,28,0.10)", display: "flex", alignItems: "center", justifyContent: "center", cursor: atLaunchMonth ? "default" : "pointer", color: atLaunchMonth ? "#D8D9E0" : "#3A3A44" }}>
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>
            {/* Label bulan/tahun SEKARANG jadi tombol - diketuk masuk ke
                MonthYearPickerSheet (wheel scroll gaya time-picker), bukan
                cuma teks statis. Chevron-down kecil jadi affordance visual
                spy user tau ini bisa diketuk utk lompat cepat ke bulan/
                tahun manapun (drpd geser panah satu-satu terus). */}
            <button onClick={() => setMonthPickerOpen(true)}
              style={{ minWidth: 158, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, background: "none", border: "none", padding: "4px 6px", borderRadius: 8, cursor: "pointer" }}>
              <span style={{ textAlign: "center", fontSize: 16, fontWeight: 800, color: "#17181C", letterSpacing: -0.3 }}>
                {MONTH_NAMES_FULL[viewMonth]} <span style={{ color: "#A9A9B4", fontWeight: 700 }}>{viewYear}</span>
              </span>
              <ChevronDown size={14} strokeWidth={2.5} color="#A9A9B4" />
            </button>
            <button onClick={() => changeMonth(1)}
              style={{ width: 32, height: 32, borderRadius: "50%", background: "#FFFFFF", border: "none", boxShadow: "0 1px 4px rgba(23,24,28,0.10)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#3A3A44" }}>
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {DOW.map((d, i) => {
            // Konsep referensi: label hari UPPERCASE + letter-spacing lebar
            // (bukan "Min/Sen/..." apa adanya), dan kolom hari yg SAMA dgn
            // hari ini ditebalkan hitam - beda dr kolom lain yg abu2 - biar
            // langsung kelihatan "hari ini hari apa" sekilas dari header.
            const isTodayCol = i === todayDow;
            return (
              <div key={d} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: isTodayCol ? "#17181C" : "#B0B0BA", padding: "4px 0" }}>{d}</div>
            );
          })}
        </div>
        {/* Semua tanggal SEKARANG bulat penuh (circle) - konsep terbaru dari
            referensi user: bukan cuma tanggal yg "ada plan"/"dipilih" yg
            bulat, tp SEMUA tanggal (termasuk yg kosong) dikasih background
            circle abu2 lembut biar grid-nya terasa satu bahasa visual yg
            konsisten, bukan campuran kotak+bulat spt sebelumnya. Konsep pil
            menyambung utk rentang tanggal (start/mid/end) sengaja
            DIHILANGKAN krn referensinya tidak menunjukkan itu - tiap
            tanggal jadi lingkaran individual. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginTop: 4 }}>
          {cells.map((c) => {
            const acts = byDate[c.key] || [];
            const sel = pickedSet.has(c.key);
            const isToday = c.key === todayKey;
            const hasPlan = acts.length > 0;
            const bg = sel ? BRAND : hasPlan ? "#FCEFC7" : c.inMonth ? "#F1F2F5" : "#F8F8FA";
            return (
              <button key={c.key} onClick={() => pickCell(c.key)}
                style={{
                  position: "relative", aspectRatio: "1", borderRadius: "50%",
                  border: isToday && !sel ? "1.5px solid #ED1C24" : "1.5px solid transparent",
                  background: bg,
                  boxShadow: sel ? "0 4px 10px rgba(237,28,36,0.30)" : "none",
                  color: !c.inMonth ? "#C7C7D0" : sel ? "#fff" : hasPlan ? "#8A6D1D" : "#4A4A54",
                  fontFamily: FF, fontSize: 13, fontWeight: sel || hasPlan || isToday ? 800 : 600, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                {c.d}
              </button>
            );
          })}
        </div>
        </div>
        {picked.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FCEFC7", border: "1px solid #F0DFA0" }} />
            <span style={{ fontSize: 10, color: "#8A8A96", fontWeight: 600 }}>Sudah ada plan lain di tim/cakupan Anda pada tanggal itu - ketuk untuk lihat detail</span>
          </div>
        )}
      </div>
      </div>

      {/* Daftar waktu per tanggal - fixed-height, TIDAK LAGI bottom sheet
          draggable. Satu baris compact per tanggal terpilih (label + badge
          ringkasan waktu + chevron), diketuk utk membuka TimeEditPopup di
          tengah layar - gaya "productivity app" (Google Calendar/Todoist)
          drpd panel besar yg harus ditarik-tarik. */}
      <div style={{ flexShrink: 0, background: "#FFFFFF", borderRadius: "20px 20px 0 0", boxShadow: "0 -6px 24px rgba(23,24,28,0.08)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {picked.length === 0 ? (
          <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,#FFF1F1,#FDECEC)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CalendarDays size={19} color="#ED1C24" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C" }}>Belum ada tanggal dipilih</div>
              <div style={{ marginTop: 2, fontSize: 11, color: "#8A8A96", fontWeight: 600, lineHeight: 1.4 }}>Ketuk tanggal di kalender di atas utk mulai atur waktu</div>
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: "12px 20px 0", flexShrink: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>
                Atur Waktu · {picked.length} tanggal
              </div>
              {summary && picked.length > 1 && <div style={{ marginTop: 2, fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>{summary}</div>}
            </div>

            <div style={{ maxHeight: "26vh", overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", padding: "8px 20px 4px" }}>
              {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
                  <Loader2 size={18} color="#ED1C24" style={{ animation: "mspin .9s linear infinite" }} />
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {sortedPicked.map((d) => (
                    <DateSummaryRow key={d}
                      label={shortDateLabel(d)}
                      time={timesByDate[d] || DEFAULT_DATE_TIME}
                      otherCount={(byDate[d] || []).length}
                      onClick={() => { setOpenDateKey(d); setOpenDateKeyIsNew(false); }}
                    />
                  ))}
                </div>
              )}
              {err && <div style={{ marginTop: 8, fontSize: 11.5, color: "#C62828", fontWeight: 600 }}>{err}</div>}
            </div>
          </>
        )}

        <div style={{ padding: "10px 20px calc(env(safe-area-inset-bottom,0px) + 16px)", flexShrink: 0, borderTop: "1px solid #F0F0F3" }}>
          <button onClick={() => onConfirm(picked, timesByDate)} disabled={picked.length === 0 || !allValid}
            style={{
              width: "100%", height: 48, borderRadius: 13, border: "none", fontFamily: FF, fontSize: 13.5, fontWeight: 800, color: "#fff",
              cursor: (picked.length === 0 || !allValid) ? "default" : "pointer",
              background: (picked.length === 0 || !allValid) ? "#D8D9E0" : BRAND,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
            <Check size={16} /> {picked.length > 1 ? "Gunakan Semua Tanggal & Waktu" : "Gunakan Tanggal & Waktu Ini"}
          </button>
        </div>
      </div>

      {confirmDateKey && (
        <DateConfirmPopup
          dateKey={confirmDateKey}
          label={fullDateLabel(confirmDateKey)}
          otherActs={byDate[confirmDateKey] || []}
          onOpenDetail={setDetailAct}
          onAddEvent={confirmAddEvent}
          onCancel={cancelConfirm}
        />
      )}

      {openDateKey && (
        <TimeEditPopup
          label={fullDateLabel(openDateKey)}
          time={timesByDate[openDateKey] || DEFAULT_DATE_TIME}
          onToggleAllDay={(v) => patchTime(openDateKey, { isAllDay: v })}
          onChangeStart={(v) => patchTime(openDateKey, { startTime: v })}
          onChangeEnd={(v) => patchTime(openDateKey, { endTime: v })}
          onClose={dismissTimeEdit}
          onConfirm={confirmTimeEdit}
        />
      )}

      {detailAct && <ActivityDetailPopup activity={detailAct} onClose={() => setDetailAct(null)} />}

      {monthPickerOpen && (
        <MonthYearPickerSheet
          initialMonth={viewMonth}
          initialYear={viewYear}
          minYear={LAUNCH_YEAR}
          minMonth={LAUNCH_MONTH}
          onConfirm={(y, m) => { setViewYear(y); setViewMonth(m); }}
          onClose={() => setMonthPickerOpen(false)}
        />
      )}
    </div>
  );
}

// ═══════════════════ Popup detail activity plan yg sudah ada ═══════════════

/** Ditampilkan saat baris "N plan lain sudah ada di tanggal ini" diketuk -
 * ringkasan cepat activity yg sudah ada di tanggal itu, TANPA pindah halaman
 * (masih di dalam alur pilih tanggal). Bisa ditutup lewat tombol X ATAU
 * ketuk area gelap di belakangnya (backdrop), gaya popup pada umumnya. */
// Popup ini pakai bahasa visual & KOMPONEN YANG SAMA PERSIS dgn kartu di
// halaman Aktivitas/Detail Aktivitas (MetricTiles.jsx - satu sumber
// kebenaran utk grid Target/Actual SP·FWA·Rebuy·Cost + banner Estimasi
// Revenue/Cost Ratio).
function ActivityDetailPopup({ activity: a, onClose }) {
  const stage = activityStage(a);
  const hasActual = a.actual_sp != null;
  const brandKey = (a.brand || "").toLowerCase();
  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 96, background: "rgba(23,24,28,0.42)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 380, maxHeight: "calc(100dvh - 48px)", overflowY: "auto", background: "#FFFFFF", borderRadius: 20, padding: 18, fontFamily: FF, boxShadow: "0 12px 40px rgba(23,24,28,0.24)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#17181C", lineHeight: 1.3 }}>{a.event_name || "Activity tanpa nama"}</div>
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {a.brand && (
                <span style={{
                  flexShrink: 0, fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, whiteSpace: "nowrap",
                  background: OTHER_ACT_BRAND_COLOR[brandKey] || "#8A8A96",
                  color: brandKey === "tri" ? "#FFFFFF" : "#17181C",
                }}>
                  {brandKey === "tri" ? "3ID" : "IM3"}
                </span>
              )}
              <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 999, color: stage.color, background: stage.bg, whiteSpace: "nowrap" }}>
                {stage.label}
              </span>
            </div>
          </div>
          <button onClick={onClose}
            style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 9, background: "#F6F7F9", border: "1px solid #ECEDF0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68" }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
            <MapPin size={12} color="#B0B0BA" style={{ flexShrink: 0, marginTop: 1.5 }} />
            <span style={{ fontSize: 11.5, color: "#5A5A68", fontWeight: 600, lineHeight: 1.4 }}>
              {a.address || a.site_id || "Lokasi belum diisi"}{a.mc ? ` · ${a.mc}` : ""}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={12} color="#B0B0BA" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: "#5A5A68", fontWeight: 700 }}>{fmtDate(a.plan_date)} · {otherActTimeLabel(a, a.plan_date)}</span>
          </div>
        </div>

        {/* Grid Target/Actual SP·FWA·Rebuy·Cost + banner Estimasi Revenue -
            komponen yg SAMA dipakai di kartu daftar Aktivitas & halaman
            Detail Aktivitas (lihat MetricTiles.jsx), bukan salinan gaya
            sendiri lagi. */}
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <MetricTile icon={CardSim} accent="#DB2777" label="SP" target={fmtInt(a.target_sp)} actual={hasActual ? fmtInt(a.actual_sp) : "-"} />
          <MetricTile icon={Router} accent="#2563EB" label="FWA" target={fmtInt(a.target_fwa)} actual={hasActual ? fmtInt(a.actual_fwa) : "-"} />
          <div style={{ gridColumn: "1 / -1" }}>
            <RebuyTile
              spTarget={fmtRp(a.target_rebuy_pulsa)} spActual={hasActual ? fmtRp(a.actual_rebuy_pulsa) : "-"}
              fwaTarget={fmtRp(a.target_rebuy_data)} fwaActual={hasActual ? fmtRp(a.actual_rebuy_data) : "-"}
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <MetricTile icon={Receipt} accent="#7C3AED" label="Cost" target={fmtRp(a.cost_estimate)} actual={hasActual ? fmtRp(a.cost_actual ?? a.cost_estimate) : "-"} />
          </div>
        </div>
        <RevenueCostBanner
          revenueLabel={a.actual_rev_3m != null ? "Total Revenue Actual" : "Estimasi Total Revenue"}
          revenueValue={a.actual_rev_3m != null ? fmtRp(a.actual_rev_3m) : (a.target_rev_3m > 0 ? fmtRp(a.target_rev_3m) : "-")}
          costRatioValue={a.actual_rev_3m != null
            ? (a.actual_rev_3m > 0
                ? `${((Number(a.cost_actual ?? a.cost_estimate) || 0) / a.actual_rev_3m * 100).toFixed(1)}%`
                : (Number(a.cost_actual ?? a.cost_estimate) > 0 ? "-" : "0.0%"))
            : (a.target_rev_3m > 0 ? `${((Number(a.cost_estimate) || 0) / a.target_rev_3m * 100).toFixed(1)}%` : "-")}
        />

        <button onClick={onClose}
          style={{ marginTop: 14, width: "100%", height: 42, borderRadius: 11, border: "none", background: "#F0F0F3", color: "#3A3A44", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
          Tutup
        </button>
      </div>
    </div>
  );
}

// ═══════════════════ Waktu per tanggal - daftar compact + popup ═══════════

/** Waktu activity LAIN ini di TANGGAL YANG SAMA yg sedang dilihat (bukan
 * cuma waktu global activity itu) - activity multi-tanggal bisa punya jam
 * berbeda per tanggal lewat `plan_date_times` (JSON per tanggal), jadi
 * dicek dulu di situ sebelum fallback ke is_all_day/start_time/end_time
 * tingkat activity (utk activity single-date/lama). */
function otherActTimeLabel(a, dateKey) {
  let perDate = null;
  if (dateKey && a.plan_date_times) {
    try {
      const map = typeof a.plan_date_times === "string" ? JSON.parse(a.plan_date_times) : a.plan_date_times;
      perDate = map?.[dateKey] || null;
    } catch { /* biarkan null, fallback di bawah */ }
  }
  const isAllDay = perDate ? !!perDate.is_all_day : a.is_all_day !== false;
  if (isAllDay) return "Seharian";
  const st = (perDate?.start_time || a.start_time || "").slice(0, 5);
  const et = (perDate?.end_time || a.end_time || "").slice(0, 5);
  if (!st || !et) return "Seharian";
  return `${st.replace(":", ".")} - ${et.replace(":", ".")}`;
}

// Kartu ini SAMA PERSIS bahasa visualnya dgn kartu aktivitas di
// Beranda/daftar Aktivitas (ActivityRow - m/page.jsx & ActivityCard -
// activities/page.jsx): putih, badge Brand solid, subtitle MC, pill status
// (activityStage - sama sumber label dgn di mana pun activity ditampilkan),
// baris waktu ber-ikon jam, chevron di pojok - konsisten dgn "bahasa"
// activity card di seluruh app.
const OTHER_ACT_BRAND_COLOR = { im3: "#F5CD46", tri: "#E23B86" };
function OtherActRow({ act: a, dateKey, onOpenDetail }) {
  const stage = activityStage(a);
  const location = a.address || "Lokasi belum diisi";
  const timeLabel = otherActTimeLabel(a, dateKey);
  const brandKey = (a.brand || "").toLowerCase();
  return (
    <button onClick={() => onOpenDetail(a)}
      style={{ position: "relative", textAlign: "left", width: "100%", background: "#FFFFFF", border: "1px solid #EDEDF1", borderRadius: 14, padding: "11px 34px 11px 12px", cursor: "pointer", fontFamily: FF, boxShadow: "0 1px 4px rgba(23,24,28,0.04)" }}>
      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#B0B0BA" }}>
        <ChevronRight size={14} />
      </span>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {a.event_name || "Activity tanpa nama"}
          </div>
          {(a.brand || a.mc) && (
            <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              {a.brand && (
                <span style={{
                  flexShrink: 0, fontSize: 8.5, fontWeight: 800, padding: "2px 6px", borderRadius: 999, whiteSpace: "nowrap",
                  background: OTHER_ACT_BRAND_COLOR[brandKey] || "#8A8A96",
                  color: brandKey === "tri" ? "#FFFFFF" : "#17181C",
                }}>
                  {brandKey === "tri" ? "3ID" : "IM3"}
                </span>
              )}
              {a.mc && <span style={{ fontSize: 10.5, color: "#8A8A96", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{a.mc}</span>}
            </div>
          )}
        </div>
        <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 999, color: stage.color, background: stage.bg, whiteSpace: "nowrap" }}>
          {stage.label}
        </span>
      </div>

      <div style={{ marginTop: 6, display: "flex", alignItems: "flex-start", gap: 5 }}>
        <MapPin size={11} color="#B0B0BA" style={{ flexShrink: 0, marginTop: 1.5 }} />
        <span style={{ fontSize: 10.5, color: "#5A5A68", fontWeight: 600, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{location}</span>
      </div>
      <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}>
        <Clock size={11} color="#B0B0BA" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 10.5, color: "#5A5A68", fontWeight: 700 }}>{timeLabel}</span>
      </div>
    </button>
  );
}

/** Satu baris compact di daftar "Atur Waktu": label tanggal + badge
 * ringkasan waktu ("Seharian"/"09.00–17.00"/"Belum diatur" - merah kalau
 * invalid) + indikator kecil kalau ada plan lain di tanggal itu + chevron.
 * SELURUH baris adalah tombol yg membuka TimeEditPopup - detail penuh (jam,
 * toggle Seharian, daftar plan lain) dipindah ke dalam popup, bukan lagi
 * kartu inline besar spt sebelumnya. */
function DateSummaryRow({ label, time, otherCount, onClick }) {
  const { text, invalid } = timeSummaryLabel(time);
  return (
    <button onClick={onClick}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", textAlign: "left", background: "#FBFBFC", border: `1.5px solid ${invalid ? "#F3C6C6" : "#ECEDF0"}`, borderRadius: 13, padding: "10px 12px", cursor: "pointer", fontFamily: FF }}>
      <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
        {otherCount > 0 && (
          <span title={`${otherCount} plan lain sudah ada`} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 2, fontSize: 9.5, fontWeight: 800, color: "#B45309", background: "rgba(180,83,9,0.10)", borderRadius: 999, padding: "2px 6px" }}>
            <Info size={9} /> {otherCount}
          </span>
        )}
      </div>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          fontSize: 11, fontWeight: 800, fontVariantNumeric: "tabular-nums", padding: "5px 10px", borderRadius: 999,
          color: invalid ? "#DC2626" : "#17181C", background: invalid ? "rgba(220,38,38,0.10)" : "#EDEEF1",
        }}>
          {text}
        </span>
        <ChevronRight size={14} color="#B0B0BA" />
      </div>
    </button>
  );
}

function ToggleSwitch({ checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)}
      style={{ width: 42, height: 25, borderRadius: 999, border: "none", background: checked ? BRAND : "#D8D9E0", position: "relative", cursor: "pointer", padding: 0, flexShrink: 0, transition: "background .15s" }}>
      <span style={{ position: "absolute", top: 2, left: checked ? 19 : 2, width: 21, height: 21, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(17,17,20,0.28)", transition: "left .15s" }} />
    </button>
  );
}

const WHEEL_ITEM_H = 40;
const WHEEL_PAD = 2; // baris kosong atas/bawah supaya item pertama/terakhir bisa nyampai tengah
const WHEEL_HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const WHEEL_MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

/** Satu kolom roda pemutar (jam ATAU menit), padanan visual UIDatePicker
 * iOS - scroll-snap per baris + getar tipis tiap baris terlewati + fade
 * halus di tepi atas/bawah, sama seperti sebelumnya. Dibawa kembali karena
 * user secara eksplisit minta tetap pakai scroll wheel gaya Apple, bukan
 * input jam native <input type="time"> (yg sempat dipakai sebentar tapi
 * dianggap kurang sesuai "standar Apple" yg diminta). */
function WheelColumn({ values, selected, onChange, width = 64 }) {
  const ref = useRef(null);
  const settleRef = useRef(null);
  const didInit = useRef(false);
  const lastTickIdx = useRef(values.indexOf(selected));
  // Indeks yg SECARA VISUAL lagi di tengah (dihitung LANGSUNG dari posisi
  // scroll tiap event onScroll) - dulu bold/besar cuma mengikuti prop
  // `selected`, yg BARU ter-update setelah scroll benar² berhenti (via
  // commit onChange 110ms setelah gerakan terakhir). Efeknya selagi masih
  // menggulir/menyeret, baris yg SEDANG lewat di tengah kelihatan tetap
  // kecil/pudar (krn `selected` lama belum berubah) - baru jadi bold
  // begitu benar² berhenti, kelihatan spt "telat". Sekarang bold/besar
  // mengikuti posisi scroll SECARA LANGSUNG (live), independen dari kapan
  // commit-nya terjadi - jadi bold-nya PAS mengikuti baris yg sedang di
  // tengah setiap saat, persis rasanya wheel asli iOS.
  const [liveIdx, setLiveIdx] = useState(() => Math.max(0, values.indexOf(selected)));

  useEffect(() => {
    if (didInit.current || !ref.current) return;
    const idx = values.indexOf(selected);
    if (idx >= 0) { ref.current.scrollTop = idx * WHEEL_ITEM_H; setLiveIdx(idx); }
    didInit.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function snapTo(idx) {
    const clamped = Math.max(0, Math.min(values.length - 1, idx));
    ref.current?.scrollTo({ top: clamped * WHEEL_ITEM_H, behavior: "smooth" });
    setLiveIdx(clamped);
    onChange(values[clamped]);
  }

  function handleScroll() {
    if (!ref.current) return;
    const liveIdxNow = Math.round(ref.current.scrollTop / WHEEL_ITEM_H);
    setLiveIdx(liveIdxNow);
    if (liveIdxNow !== lastTickIdx.current) {
      lastTickIdx.current = liveIdxNow;
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(3);
    }
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      if (!ref.current) return;
      snapTo(Math.round(ref.current.scrollTop / WHEEL_ITEM_H));
    }, 110);
  }

  return (
    <div ref={ref} onScroll={handleScroll} className="mh-wheel-col"
      style={{
        height: WHEEL_ITEM_H * (WHEEL_PAD * 2 + 1), width, overflowY: "scroll", scrollSnapType: "y mandatory",
        WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", scrollbarWidth: "none",
        WebkitMaskImage: "linear-gradient(180deg, transparent 0%, #000 28%, #000 72%, transparent 100%)",
        maskImage: "linear-gradient(180deg, transparent 0%, #000 28%, #000 72%, transparent 100%)",
        userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", WebkitTapHighlightColor: "transparent",
      }}>
      <style>{`.mh-wheel-col::-webkit-scrollbar{display:none;width:0;height:0}`}</style>
      <div style={{ height: WHEEL_ITEM_H * WHEEL_PAD }} />
      {values.map((v, i) => {
        const isSel = i === liveIdx;
        return (
          <div key={v} onClick={() => snapTo(i)}
            style={{
              height: WHEEL_ITEM_H, scrollSnapAlign: "center", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: isSel ? 23 : 17, fontWeight: isSel ? 800 : 500, color: isSel ? "#17181C" : "#C4C4CE",
              fontVariantNumeric: "tabular-nums", cursor: "pointer", transition: "color .12s, font-size .12s",
            }}>
            {v}
          </div>
        );
      })}
      <div style={{ height: WHEEL_ITEM_H * WHEEL_PAD }} />
    </div>
  );
}

/** Blok roda jam:menit utk SATU field (Mulai atau Berakhir) - langsung
 * tampil siap digulir begitu popup dibuka, TANPA perlu tap tambahan utk
 * "membuka" wheel-nya dulu (user secara eksplisit tidak mau ada langkah
 * tambahan). Mulai & Berakhir ditampilkan berdampingan sekaligus. */
function WheelTimeBlock({ label, isStart, value, onChange, danger }) {
  const [h, m] = value.split(":");
  const headerBg = danger ? "#DC2626" : isStart ? BRAND : "#22232A";
  return (
    <div style={{ flex: 1, minWidth: 0, borderRadius: 14, background: "#FFFFFF", border: `1.5px solid ${danger ? "#F3C6C6" : "#ECEDF0"}`, boxShadow: "0 4px 16px rgba(23,24,28,0.06)", overflow: "hidden" }}>
      {/* Label "MULAI"/"BERAKHIR" dulu pill mengambang TERPISAH di atas
          kotak - kelihatan seperti dua elemen lepas, bukan satu kesatuan.
          Sekarang jadi HEADER milik kotaknya sendiri (nempel rata atas,
          full-width, warna solid) - jelas menyatu sbg satu kartu utuh per
          field, gaya kartu premium (mis. header berwarna di kartu iOS
          Wallet/booking app). */}
      <div style={{
        padding: "8px 0", textAlign: "center", background: isStart
          ? "linear-gradient(135deg,#ED1C24,#EC008C)" : "linear-gradient(135deg,#3A3A44,#22232A)",
      }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: "#FFFFFF" }}>{label}</span>
      </div>
      {/* Baris yg sedang dipilih TIDAK lagi diberi kotak highlight terpisah
          (user minta dihapus) - cukup ukuran+bobot font & warna merah brand
          pada angkanya sendiri (lihat WheelColumn) sbg penanda, tampilan
          jadi lebih bersih/rapi tanpa dua lapis penekanan sekaligus. */}
      <div style={{ padding: "8px 4px 10px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <WheelColumn values={WHEEL_HOURS} selected={h} onChange={(nh) => onChange(`${nh}:${m}`)} width={50} />
        <span style={{ fontSize: 20, fontWeight: 800, color: "#17181C", padding: "0 2px" }}>.</span>
        <WheelColumn values={WHEEL_MINUTES} selected={m} onChange={(nm) => onChange(`${h}:${nm}`)} width={50} />
      </div>
    </div>
  );
}

/** Sheet pemilih Bulan+Tahun cepat - diketuk dari label "September 2026" di
 * header kalender. Pakai WheelColumn yg SAMA persis dgn wheel jam/menit
 * (WheelTimeBlock) spy bahasa interaksinya konsisten satu app: scroll-snap,
 * getar tipis per baris, fade tepi atas/bawah, baris tengah membesar/bold.
 * Beda dr wheel jam: kolom bulan lebih lebar (nama bulan penuh) & kolom
 * tahun dibatasi dari LAUNCH_YEAR/LAUNCH_MONTH (sama spt batas tombol
 * panah prev/next yg sudah ada) - kalau kombinasi hasil scroll jatuh
 * sebelum batas launch, di-clamp otomatis pas tombol "Pilih" ditekan. */
export function MonthYearPickerSheet({ initialMonth, initialYear, minYear, minMonth, onConfirm, onClose }) {
  const sheetRef = useRef(null);
  const [draftMonth, setDraftMonth] = useState(initialMonth);
  const [draftYear, setDraftYear] = useState(initialYear);

  const yearValues = useMemo(() => {
    const end = Math.max(minYear + 6, initialYear + 4);
    return Array.from({ length: end - minYear + 1 }, (_, i) => String(minYear + i));
  }, [minYear, initialYear]);

  function commit() {
    let y = draftYear, m = draftMonth;
    if (y === minYear && m < minMonth) m = minMonth; // clamp - sama spt batas tombol panah bulan
    sheetRef.current?.close(() => onConfirm(y, m));
  }

  return (
    <BottomSheet ref={sheetRef} onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#17181C", letterSpacing: -0.2 }}>Pilih Bulan & Tahun</div>
        <button onClick={() => sheetRef.current?.close(onClose)}
          style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: "#F1F2F5", color: "#5A5A68", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
          <X size={15} strokeWidth={2.5} />
        </button>
      </div>
      <div style={{ marginTop: 14, marginBottom: 4, height: 1, background: "linear-gradient(90deg, transparent, #E4E5EA 12%, #E4E5EA 88%, transparent)" }} />

      <div style={{ position: "relative", marginTop: 6, borderRadius: 14, background: "#FAFAFB", border: "1.5px solid #ECEDF0", overflow: "hidden" }}>
        {/* Pita highlight tengah - nunjukin baris mana yg "aktif kepilih"
            di KEDUA kolom sekaligus (bulan & tahun), spy jelas ini 1 hasil
            gabungan, bukan dua wheel lepas. */}
        <div style={{ position: "absolute", left: 8, right: 8, top: "50%", transform: "translateY(-50%)", height: WHEEL_ITEM_H, borderRadius: 10, background: "linear-gradient(135deg,rgba(237,28,36,0.07),rgba(236,0,140,0.07))", pointerEvents: "none" }} />
        <div style={{ position: "relative", padding: "10px 4px", display: "flex", justifyContent: "center", alignItems: "center" }}>
          <WheelColumn values={MONTH_NAMES_FULL} selected={MONTH_NAMES_FULL[draftMonth]} onChange={(v) => setDraftMonth(MONTH_NAMES_FULL.indexOf(v))} width={148} />
          <WheelColumn values={yearValues} selected={String(draftYear)} onChange={(v) => setDraftYear(Number(v))} width={84} />
        </div>
      </div>

      <button onClick={commit}
        style={{ marginTop: 16, width: "100%", height: 50, borderRadius: 12, border: "none", background: BRAND, color: "#fff", fontFamily: FF, fontSize: 14.5, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        Pilih Bulan Ini <ArrowRight size={15} strokeWidth={2.5} />
      </button>
    </BottomSheet>
  );
}

/** Popup kecil di tengah layar (BUKAN bottom sheet, tidak bisa ditarik) utk
 * atur waktu SATU tanggal - gaya "productivity app" pada umumnya (Google
 * Calendar/Todoist/Apple Calendar mobile web): tap baris tanggal → popup ini
 * muncul → atur Seharian/Mulai/Berakhir dgn input jam native → tutup.
 * Perubahan berlaku LIVE lewat onChange (patchTime di parent), jadi tombol
 * "Selesai" cuma menutup popup, bukan "menyimpan" secara terpisah. */
function TimeEditPopup({ label, time, onToggleAllDay, onChangeStart, onChangeEnd, onClose, onConfirm }) {
  const invalid = !time.isAllDay && (!time.startTime || !time.endTime || time.startTime >= time.endTime);
  // Dibangun di atas BottomSheet (_shared/BottomSheet.jsx) - primitif yg
  // sama dipakai semua sheet "muncul dari bawah" di app ini, jadi animasi
  // masuk/keluar/drag-nya konsisten, bukan diduplikasi manual di sini lagi
  // (implementasi drag manual sebelumnya di komponen ini sudah dipindah
  // jadi bagian dari BottomSheet, dipakai lewat ref).
  const sheetRef = useRef(null);

  return (
    <BottomSheet ref={sheetRef} onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#17181C", letterSpacing: -0.2 }}>{label}</div>
        <button onClick={() => sheetRef.current?.close(onClose)}
          style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 9, background: "#F6F7F9", border: "1px solid #ECEDF0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68" }}>
          <X size={15} />
        </button>
      </div>
      {/* Divider tegas di bawah judul tanggal - dulu judul langsung
          nempel ke konten berikutnya tanpa pemisah jelas, sekarang ada
          garis tipis penuh lebar yg jadi batas jelas "header vs isi". */}
      <div style={{ marginTop: 14, marginBottom: 14, height: 1, background: "linear-gradient(90deg, transparent, #E4E5EA 12%, #E4E5EA 88%, transparent)" }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 14.5, fontWeight: 700, color: "#3A3A44" }}>Seharian</span>
        <ToggleSwitch checked={time.isAllDay} onChange={onToggleAllDay} />
      </div>

      {!time.isAllDay && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
            <Clock size={12} color="#B0B0BA" />
            <span style={{ fontSize: 11.5, fontWeight: 800, color: "#B0B0BA", textTransform: "uppercase", letterSpacing: 0.3 }}>Jam Kegiatan</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <WheelTimeBlock label="Waktu Mulai" isStart value={time.startTime} onChange={onChangeStart} />
            <WheelTimeBlock label="Waktu Berakhir" value={time.endTime} onChange={onChangeEnd} danger={invalid} />
          </div>
          {invalid && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#DC2626", fontWeight: 700 }}>
              <AlertTriangle size={11} /> Jam mulai harus lebih awal dari jam selesai
            </div>
          )}
        </div>
      )}

      {/* Ditutup lewat animasi BottomSheet yg sama (slide-down), BARU
          onConfirm dipanggil setelah animasinya selesai - bukan onDismiss
          (jadi TIDAK dianggap "batal", tanggal baru tetap tersimpan). */}
      <button onClick={() => sheetRef.current?.close(onConfirm)}
        style={{ marginTop: 14, width: "100%", height: 50, borderRadius: 12, border: "none", background: BRAND, color: "#fff", fontFamily: FF, fontSize: 14.5, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        Gunakan Rentang Waktu Ini <ArrowRight size={15} strokeWidth={2.5} />
      </button>
    </BottomSheet>
  );
}

/** Popup KONFIRMASI terpisah - muncul PERSIS saat tanggal baru yg ditap
 * ternyata SUDAH punya plan lain (byDate[key].length>0), SEBELUM masuk ke
 * TimeEditPopup. Dulu daftar "N Plan Lain Sudah Ada" ini nempel jadi satu
 * bagian di dalam TimeEditPopup (numpuk sama toggle Seharian & wheel jam) -
 * sekarang dipisah jadi layar tersendiri: cuma daftar plan yg sudah ada
 * (ringkas: nama event + jam saja, tap utk lihat detail lengkap lewat
 * ActivityDetailPopup yg sama spt sebelumnya) + 2 aksi jelas di bawah -
 * "+ Tambah Event" (lanjut ke TimeEditPopup) atau "Batal" (batalkan
 * tanggal ini, tidak jadi ditambah). Tutup lewat X/backdrop = sama dgn
 * "Batal" (konsisten, bukan diam2 tetap menandai tanggal ini terpilih). */
function DateConfirmPopup({ dateKey, label, otherActs, onOpenDetail, onAddEvent, onCancel }) {
  // Sama spt TimeEditPopup - dibangun di atas BottomSheet supaya animasi
  // masuk/keluar/drag-nya konsisten satu sumber kebenaran.
  const sheetRef = useRef(null);

  return (
    <BottomSheet ref={sheetRef} onClose={onCancel}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#17181C", letterSpacing: -0.2 }}>{label}</div>
        <button onClick={() => sheetRef.current?.close(onCancel)}
          style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 9, background: "#F6F7F9", border: "1px solid #ECEDF0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68" }}>
          <X size={15} />
        </button>
      </div>
      <div style={{ marginTop: 14, marginBottom: 14, height: 1, background: "linear-gradient(90deg, transparent, #E4E5EA 12%, #E4E5EA 88%, transparent)" }} />

      <div style={{ padding: "9px 10px", borderRadius: 11, background: "rgba(180,83,9,0.05)", border: "1px solid rgba(180,83,9,0.16)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 7 }}>
          <Info size={11.5} color="#B45309" />
          <span style={{ fontSize: 11.5, fontWeight: 800, color: "#B45309", textTransform: "uppercase", letterSpacing: 0.3 }}>
            {otherActs.length} Plan Lain Sudah Ada
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {otherActs.map((a) => (
            <OtherActRow key={a.id} act={a} dateKey={dateKey} onOpenDetail={onOpenDetail} />
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, fontSize: 12.5, color: "#6B6B76", fontWeight: 600, lineHeight: 1.5 }}>
        Tetap mau tambah event baru di tanggal ini juga?
      </div>

      {/* "Tambah Event" & "Batal" sama2 lewat animasi keluar BottomSheet yg
          sama (slide-down) - bedanya cuma callback yg dipanggil SETELAH
          animasi selesai (onAddEvent lanjut ke TimeEditPopup, onCancel
          batalin tanggalnya). */}
      <button onClick={() => sheetRef.current?.close(onAddEvent)}
        style={{ marginTop: 12, width: "100%", height: 50, borderRadius: 12, border: "none", background: BRAND, color: "#fff", fontFamily: FF, fontSize: 14.5, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Plus size={16} strokeWidth={3} /> Tambah Event
      </button>
      <button onClick={() => sheetRef.current?.close(onCancel)}
        style={{ marginTop: 10, width: "100%", height: 46, borderRadius: 12, border: "1px solid #ECEDF0", background: "#F6F7F9", color: "#5A5A68", fontFamily: FF, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
        Batal
      </button>
    </BottomSheet>
  );
}
