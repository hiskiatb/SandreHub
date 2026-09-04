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
 * tanggal terpilih. Begitu >1 tanggal dipilih, di bawah grid langsung
 * muncul daftar (list ke bawah) - satu baris per tanggal terpilih, masing-
 * masing wajib diisi (Seharian, atau rentang jam via roda pemutar gaya
 * iOS). Ini supaya kalau BME/RGE berbeda punya beberapa activity plan di
 * tanggal yang sama, sisi TMV yang melihat kalender gabungan bisa
 * mengurutkan activity² tsb berdasarkan jam mulainya masing-masing -
 * rapi & tidak ambigu. Lihat `planData.js`: `syncTimesByDate()`,
 * `allDateTimesValid()`, `planTimeFields()`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, X, Check, Loader2, MapPin, CalendarDays, Clock, Info } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import { FF, BRAND } from "./MobileShell";
import { fmtDate, statusMeta, fmtInt } from "./activityUi";
import { groupContiguousDates, syncTimesByDate, allDateTimesValid, DEFAULT_DATE_TIME } from "./planData";

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

/**
 * @param {{ initialDates: string[], initialTimesByDate?: Record<string,{isAllDay:boolean,startTime:string,endTime:string}>,
 *   onClose: () => void,
 *   onConfirm: (dates: string[], timesByDate: Record<string,{isAllDay:boolean,startTime:string,endTime:string}>) => void }} props
 */
export default function CalendarPickerSheet({ initialDates, initialTimesByDate, onClose, onConfirm }) {
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
    if (picked.length === 0) setSheetSnap("collapsed");
  }, [picked]);
  // Baris tanggal mana + field jam mana (mulai/selesai) yg sedang membuka
  // roda pemutar - hanya satu yg terbuka sekaligus, gaya iOS date picker.
  const [editing, setEditing] = useState(null); // { date, field: 'start'|'end' } | null

  // Activity plan (punya siapa pun) yg lagi ditampilkan detailnya lewat popup
  // - diklik dari daftar "N plan lain sudah ada di tanggal ini" pada
  // DateTimeRow, supaya pengguna tahu PERSIS apa isinya sebelum menambah
  // plan baru di tanggal yang sama. Ditutup via tombol X atau klik backdrop.
  const [detailAct, setDetailAct] = useState(null);

  // Panel "Atur Waktu" adalah bottom sheet ala native (mis. Apple Maps /
  // Gojek) dgn 3 titik berhenti (snap point): collapsed (intip ringkasan),
  // half (setengah layar - cukup lega utk atur waktu sambil kalender masih
  // kelihatan), full (hampir penuh layar - paling lega, kalender tergulung
  // ke atas). Drag mengikuti jari 1:1 secara live, begitu dilepas otomatis
  // meloncat (snap) ke titik TERDEKAT dari posisi jari saat itu - bukan cuma
  // dua pilihan kaku - jadi terasa seperti sheet asli, bisa ditarik penuh
  // ataupun sedikit demi sedikit.
  const SNAP = { collapsed: 22, half: 55, full: 92 }; // vh
  const [sheetSnap, setSheetSnap] = useState("collapsed");
  const [dragPx, setDragPx] = useState(0); // offset drag berjalan (live), px
  const dragState = useRef({ dragging: false, startY: 0, lastPx: 0 });

  // Header (tombol X + judul + nav bulan) tingginya IKUT BERUBAH per
  // perangkat (safe-area-inset-top beda2), jadi tidak bisa diasumsikan
  // angka tetap. Diukur nyata lewat ResizeObserver, dipakai sbg batas atas
  // (maxHeight) panel "Atur Waktu" di bawah - TANPA batas ini, snap "full"
  // (92vh) + tinggi header bisa MELEBIHI tinggi layar (100dvh), dan krn
  // panel itu flexShrink:0, kelebihannya bukan bikin panel menyusut tapi
  // malah kepotong mentah di bawah layar (tombol "Gunakan Tanggal & Waktu
  // Ini" ikut hilang kepotong - itu keluhan "terpotong").
  const headerRef = useRef(null);
  const [headerH, setHeaderH] = useState(150);
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect?.height;
      if (h) setHeaderH(Math.ceil(h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function handleDragStart(e) {
    // stopPropagation SEJAK touchstart - tanpa ini gesture geser handle di
    // sini ikut "kebaca" jg oleh usePullToRefresh (MobileShell.jsx) yg
    // listen di container HALAMAN DI BELAKANG sheet ini (sheet dirender sbg
    // children di dalamnya) → menggeser handle ke bawah ikut mentrigger
    // pull-to-refresh, yg pas ambang tarikannya terpenuhi langsung
    // `window.location.reload()` - itulah yg kelihatan spt "error balik ke
    // halaman sebelumnya" (state wizard hilang krn full reload).
    e.stopPropagation();
    // Belum ada tanggal terpilih → tidak ada apa pun utk ditampilkan di
    // panel "Atur Waktu", jadi jangan biarkan bisa ditarik naik (dulu ini
    // yg bikin "ngebug": panel bisa ditarik ke half/full padahal isinya
    // cuma placeholder kosong, jadi area putih besar kosong menutupi
    // kalender di atasnya percuma).
    if (picked.length === 0) return;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragState.current = { dragging: true, startY: clientY, lastPx: 0 };
    window.addEventListener("mousemove", handleDragMove);
    window.addEventListener("mouseup", handleDragEnd);
    window.addEventListener("touchmove", handleDragMove, { passive: false });
    window.addEventListener("touchend", handleDragEnd);
  }
  function handleDragMove(e) {
    e.stopPropagation();
    if (!dragState.current.dragging) return;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const px = clientY - dragState.current.startY;
    dragState.current.lastPx = px;
    setDragPx(px);
    if (e.cancelable) e.preventDefault();
  }
  function handleDragEnd(e) {
    e?.stopPropagation?.();
    dragState.current.dragging = false;
    window.removeEventListener("mousemove", handleDragMove);
    window.removeEventListener("mouseup", handleDragEnd);
    window.removeEventListener("touchmove", handleDragMove);
    window.removeEventListener("touchend", handleDragEnd);
    // Posisi akhir jari (dalam vh, dikurangi dari titik berangkat) dicocokkan
    // ke snap point TERDEKAT - jadi menarik dikit → ke tetangga terdekat,
    // menarik jauh sekaligus → bisa langsung loncat ke full (atau sebaliknya
    // ke collapsed), persis rasanya bottom sheet native.
    const currentVh = SNAP[sheetSnap] - (dragState.current.lastPx / window.innerHeight) * 100;
    let nearest = "collapsed", best = Infinity;
    for (const [name, vh] of Object.entries(SNAP)) {
      const dist = Math.abs(vh - currentVh);
      if (dist < best) { best = dist; nearest = name; }
    }
    setSheetSnap(nearest);
    setDragPx(0);
  }

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
  function pickCell(key) {
    setPicked((prev) => {
      const exists = prev.includes(key);
      // Nambah tanggal baru → otomatis naikkan panel ke setengah layar (kalau
      // masih collapsed) supaya area atur waktu langsung terlihat luas tanpa
      // perlu digeser manual. Kalau pengguna sudah menariknya ke full sendiri,
      // biarkan tetap full - jangan turunkan tanpa diminta.
      if (!exists) setSheetSnap((s) => (s === "collapsed" ? "half" : s));
      return exists ? prev.filter((x) => x !== key) : [...prev, key].sort();
    });
  }

  // Set waktu utk SATU tanggal - tiap tanggal terpilih SELALU independen,
  // termasuk yang berdekatan/berurutan (lihat catatan di daftar "Atur Waktu"
  // di bawah: tidak lagi digabung jadi satu rentang dgn waktu bersama).
  function patchTime(date, patch) {
    setTimesByDate((prev) => ({ ...prev, [date]: { ...(prev[date] || DEFAULT_DATE_TIME), ...patch } }));
  }

  // Grup tanggal terpilih yang berdekatan → dipakai utk gaya visual "pil
  // menyambung" di kalender, ringkasan atas, DAN daftar "Atur Waktu": begitu
  // ≥2 tanggal berdekatan, otomatis digabung jadi SATU baris rentang
  // ("12 - 13 Agu 2026") dgn satu pengaturan waktu yang berlaku utk seluruh
  // rentang - bukan lagi satu baris per tanggal individual.
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

  // Tinggi panel "Atur Waktu" mengikuti snap point saat ini, diikuti live
  // selagi jari masih menyentuh (dragPx!=0, tanpa transisi biar responsif),
  // begitu dilepas baru animasi mulus ke titik yang dipilih handleDragEnd.
  const panelHeight = dragPx !== 0 ? `calc(${SNAP[sheetSnap]}vh - ${dragPx}px)` : `${SNAP[sheetSnap]}vh`;

  return (
    <div
      // Sheet ini full-viewport (fixed inset:0) tapi tetap DIRENDER sbg
      // children di dalam container halaman yg jd tempat MobileShell
      // memasang listener pull-to-refresh (lihat catatan panjang di
      // handleDragStart di atas) - jadi SEMUA gesture sentuh di mana pun
      // dlm sheet ini (bukan cuma di handle "Atur Waktu") wajib berhenti di
      // sini, tdk pernah bubble ke halaman di belakangnya. Tanpa ini, mulai
      // menggeser dari titik mana pun selain handle (mis. dari judul panel,
      // atau grid kalender) tetap bisa "kebaca" jd tarikan pull-to-refresh
      // → `window.location.reload()` → sheet & progress wizard hilang,
      // terasa spt "balik ke halaman Buat Plan" begitu saja.
      // stopPropagation cukup di touchstart saja - itu satu-satunya event
      // yg dipakai MobileShell (usePullToRefresh) utk memutuskan mulai
      // "aktif" menarik-refresh atau tidak (lihat onTouchStart di sana:
      // begitu tdk pernah nyampai ke listernya, `active` di situ tetap
      // false selamanya utk sesi sentuh ini, jd touchmove/touchend di sana
      // otomatis no-op walau sempat kebaca). SENGAJA TIDAK stopPropagation
      // di touchmove/touchend di sini - drag "Atur Waktu" panel (di bawah)
      // pakai `window.addEventListener` utk mengikuti drag, & window ada
      // LEBIH TINGGI drpd div ini di jalur bubble; kalau touchmove/touchend
      // di-stop di sini, event itu justru tdk akan pernah nyampai ke
      // `window` sama sekali - itu yg kmrn bikin drag jd tidak bisa
      // diturunkan sama sekali.
      onTouchStart={(e) => e.stopPropagation()}
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "#F4F5F7", fontFamily: FF, display: "flex", flexDirection: "column" }}>
      {/* Header SENGAJA dipisah dari area yang bisa tergulung di bawahnya -
          supaya tetap selalu terlihat & bisa diklik walau panel "Atur Waktu"
          sedang ditarik full (menutupi hampir semua layar). Kartu putih
          dgn bayangan tipis biar terasa "mengambang" di atas isi kalender,
          bukan cuma teks polos nempel di background abu-abu. */}
      <div ref={headerRef} style={{ flexShrink: 0, background: "#FFFFFF", borderRadius: "0 0 20px 20px", boxShadow: "0 6px 18px rgba(23,24,28,0.05)", position: "relative", zIndex: 1 }}>
        <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 14px) 18px 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 11, background: "#F6F7F9", border: "1px solid #ECEDF0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68" }}>
            <X size={15} />
          </button>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#17181C", letterSpacing: -0.2 }}>Pilih Plan Date</div>
          <div style={{ width: 34 }} />
        </div>

        {/* Month nav - dibuat lebih tegas: nama bulan lebih besar & jadi
            fokus utama, tombol prev/next bulat solid gaya "pill" spy lebih
            enak disentuh & terasa lebih premium drpd kotak border tipis. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px 14px" }}>
          <button onClick={() => changeMonth(-1)} disabled={atLaunchMonth}
            style={{ width: 36, height: 36, borderRadius: "50%", background: atLaunchMonth ? "#F6F7F9" : "#17181C", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: atLaunchMonth ? "default" : "pointer", color: atLaunchMonth ? "#D8D9E0" : "#fff" }}>
            <ChevronLeft size={17} />
          </button>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#17181C", letterSpacing: -0.3 }}>{MONTH_NAMES_FULL[viewMonth]} <span style={{ color: "#B0B0BA", fontWeight: 700 }}>{viewYear}</span></div>
          <button onClick={() => changeMonth(1)}
            style={{ width: 36, height: 36, borderRadius: "50%", background: "#17181C", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}>
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      {/* Kalender - discroll kalau ruangnya diperas panel bawah yang sedang
          ditarik lebih besar, supaya tidak ada yang terpotong. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      <div style={{ padding: "0 18px", flexShrink: 0 }}>
      </div>

      {/* Grid */}
      <div style={{ padding: "16px 14px 0", flexShrink: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
          {DOW.map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 800, color: "#B0B0BA", padding: "4px 0" }}>{d}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginTop: 2 }}>
          {cells.map((c) => {
            const acts = byDate[c.key] || [];
            const sel = pickedSet.has(c.key);
            const role = cellRole[c.key];
            const isToday = c.key === todayKey;
            // Pil menyambung: ujung awal/akhir bulat, tengah datar - kesan
            // "rentang" yang jelas walau tidak ada mode Rentang eksplisit.
            const radius = role === "mid" ? "0" : role === "start" ? "12px 4px 4px 12px" : role === "end" ? "4px 12px 12px 4px" : "12px";
            return (
              <button key={c.key} onClick={() => pickCell(c.key)}
                style={{
                  position: "relative", aspectRatio: "1", borderRadius: radius,
                  border: isToday && !sel ? "1.5px solid #ED1C24" : "1.5px solid transparent",
                  // Semua sel terpilih (solo/start/mid/end) pakai warna solid yg
                  // SAMA - dulu sel "mid" dikasih background merah muda pudar
                  // dgn teks putih di atasnya (nyaris tak terbaca, & terasa
                  // beda status drpd tanggal terpilih lainnya). Sekarang
                  // rentang tersambung tetap terlihat jelas sbg SATU pil utuh
                  // yg semuanya "tanggal terpilih", hanya bentuk sudutnya yg
                  // beda (bulat di ujung, datar di tengah) - bukan warnanya.
                  background: sel ? BRAND : "transparent",
                  color: !c.inMonth ? "#D0D0D8" : sel ? "#fff" : "#17181C",
                  fontFamily: FF, fontSize: 13, fontWeight: sel ? 800 : 600, cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                }}>
                <span>{c.d}</span>
                {acts.length > 0 && (
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: sel ? "#fff" : dotColorForStatuses(acts.map((a) => a.status)) }} />
                )}
              </button>
            );
          })}
        </div>
        {picked.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#B45309" }} />
            <span style={{ fontSize: 10, color: "#8A8A96", fontWeight: 600 }}>Titik = sudah ada plan lain (punya siapa pun) di tanggal itu</span>
          </div>
        )}
      </div>
      </div>

      {/* Daftar waktu per tanggal - MUNCUL LANGSUNG begitu tanggal dipilih,
          SATU PER SATU (satu baris wajib per tanggal terpilih, TERMASUK
          tanggal yang berdekatan/berurutan - tidak digabung jadi satu
          rentang dgn waktu bersama, supaya tiap tanggal benar² independen).
          Inilah yang dipakai sisi TMV nanti utk mengurutkan activity yang
          jatuh di tanggal sama dari beberapa BME/RGE berbeda. Panel ini bottom sheet
          3 tingkat (collapsed/half/full) - tarik handle-nya bebas ke arah
          mana pun & sejauh apa pun, nanti otomatis meloncat ke tingkat
          terdekat saat dilepas; sekali ketuk pada handle = naik/turun satu
          tingkat, cepat & tidak perlu presisi menggeser. */}
      <div style={{ height: panelHeight, maxHeight: `calc(100dvh - ${headerH}px)`, flexShrink: 0, background: "#FFFFFF", borderRadius: "20px 20px 0 0", boxShadow: "0 -6px 24px rgba(23,24,28,0.08)", display: "flex", flexDirection: "column", overflow: "hidden", transition: dragPx === 0 ? "height .28s cubic-bezier(.4,0,.2,1)" : "none" }}>
        <div
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          onClick={() => picked.length > 0 && setSheetSnap((s) => (s === "collapsed" ? "half" : s === "half" ? "full" : "collapsed"))}
          style={{ flexShrink: 0, padding: "10px 0 6px", cursor: picked.length === 0 ? "default" : "grab", touchAction: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <div style={{ width: 40, height: 4, borderRadius: 3, background: "#D8D9E0" }} />
        </div>

        {picked.length === 0 ? (
          // Belum ada tanggal dipilih - state ini SELALU collapsed (drag &
          // ekspansi dimatikan di handleDragStart/handle-tap saat
          // picked.length===0), jadi didesain sbg SATU baris rapi yg
          // mengisi tinggi panel collapsed dgn nyaman drpd judul kecil di
          // pojok kiri atas + sisa ruang kosong menganggur di bawahnya.
          <div style={{ flex: 1, padding: "6px 20px 4px", display: "flex", alignItems: "center", gap: 12 }}>
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
            <div style={{ padding: "2px 20px 0", flexShrink: 0, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>
                  Atur Waktu · {picked.length} tanggal
                </div>
                {summary && <div style={{ marginTop: 2, fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>{summary}</div>}
                {sheetSnap === "collapsed" && (
                  <div style={{ marginTop: 4, fontSize: 10.5, color: "#B0B0BA", fontWeight: 600 }}>Tarik ke atas utk atur waktu tiap tanggal</div>
                )}
              </div>
              <button onClick={() => setSheetSnap((s) => (s === "full" ? "collapsed" : "full"))}
                style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 8, background: "#F6F7F9", border: "1px solid #ECEDF0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#8A8A96" }}>
                {sheetSnap === "full" ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
            </div>

        {sheetSnap !== "collapsed" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 20px 12px" }}>
            {loading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
                <Loader2 size={18} color="#ED1C24" style={{ animation: "mspin .9s linear infinite" }} />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[...picked].sort().map((d) => (
                  <DateTimeRow key={d}
                    label={shortDateLabel(d)}
                    dateKey={d}
                    time={timesByDate[d] || DEFAULT_DATE_TIME}
                    otherActs={byDate[d] || []}
                    onOpenDetail={setDetailAct}
                    editingField={editing?.date === d ? editing.field : null}
                    onToggleAllDay={(v) => { patchTime(d, { isAllDay: v }); setEditing(null); }}
                    onOpenField={(field) => setEditing((prev) => (prev?.date === d && prev.field === field) ? null : { date: d, field })}
                    onChangeStart={(v) => patchTime(d, { startTime: v })}
                    onChangeEnd={(v) => patchTime(d, { endTime: v })}
                  />
                ))}
              </div>
            )}
            {err && <div style={{ marginTop: 10, fontSize: 11.5, color: "#C62828", fontWeight: 600 }}>{err}</div>}
          </div>
        )}
        {sheetSnap === "collapsed" && <div style={{ flex: 1 }} />}
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

      {detailAct && <ActivityDetailPopup activity={detailAct} onClose={() => setDetailAct(null)} />}
    </div>
  );
}

// ═══════════════════ Popup detail activity plan yg sudah ada ═══════════════

/** Ditampilkan saat baris "N plan lain sudah ada di tanggal ini" diketuk -
 * ringkasan cepat activity yg sudah ada di tanggal itu, TANPA pindah halaman
 * (masih di dalam alur pilih tanggal). Bisa ditutup lewat tombol X ATAU
 * ketuk area gelap di belakangnya (backdrop), gaya popup pada umumnya. */
function ActivityDetailPopup({ activity: a, onClose }) {
  const meta = statusMeta(a.status);
  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 96, background: "rgba(23,24,28,0.42)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 360, background: "#FFFFFF", borderRadius: 18, padding: 18, fontFamily: FF, boxShadow: "0 12px 40px rgba(23,24,28,0.24)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#17181C" }}>{a.event_name || "Activity tanpa nama"}</div>
            <span style={{ display: "inline-block", marginTop: 6, fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999, color: meta.color, background: meta.bg }}>
              {meta.label}
            </span>
          </div>
          <button onClick={onClose}
            style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 9, background: "#F6F7F9", border: "1px solid #ECEDF0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68" }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
            <MapPin size={13} color="#8A8A96" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12, color: "#5A5A68", fontWeight: 600, lineHeight: 1.4 }}>
              {a.address || a.site_id || "Lokasi belum diisi"}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#5A5A68", fontWeight: 600 }}>
            {a.mc || "-"} {a.site_id ? `· ${a.site_id}` : ""} · Target {fmtInt(a.target_sp)}/{fmtInt(a.target_fwa)} SP/FWA
          </div>
        </div>

        <button onClick={onClose}
          style={{ marginTop: 16, width: "100%", height: 42, borderRadius: 11, border: "none", background: "#F0F0F3", color: "#3A3A44", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
          Tutup
        </button>
      </div>
    </div>
  );
}

// ═══════════════════ Waktu per tanggal - satu baris compact ═══════════════

/** Satu baris = SATU TANGGAL (selalu individual, walau berdekatan/berurutan
 * dgn tanggal lain yang juga terpilih - tidak pernah digabung jadi satu
 * rentang bersama): label, toggle Seharian, dan (kalau bukan seharian) pil
 * Mulai/Berakhir yang membuka roda pemutar jam gaya iOS PERSIS di bawah
 * baris itu sendiri saat diketuk. Wajib diisi - defaultnya Seharian supaya
 * tetap valid tanpa harus disentuh, tapi begitu pengguna pilih Rentang Jam,
 * start<end jadi syarat. `otherActs` = activity plan (punya siapa pun) yg
 * sudah ada di tanggal ini - disebutkan satu-satu (event_name + status),
 * bukan cuma angka, dan bisa diketuk utk lihat detailnya lewat popup
 * (`onOpenDetail`). */
/** Satu baris activity lain yg sudah ada di tanggal itu - TIDAK LANGSUNG
 * buka popup detail lengkap saat diketuk (dulu begitu, kurang jelas ada
 * info apa sebelum membukanya). Sekarang diketuk = expand/collapse dropdown
 * INLINE kecil dulu (lokasi + MC + target) - cukup utk gambaran cepat;
 * kalau masih mau lihat detail penuh, ada tombol "Lihat detail lengkap"
 * di dalam dropdown-nya yg baru membuka `ActivityDetailPopup`. */
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

function OtherActRow({ act: a, dateKey, onOpenDetail }) {
  const [open, setOpen] = useState(false);
  const meta = statusMeta(a.status);
  const location = a.address || "Lokasi belum diisi";
  const timeLabel = otherActTimeLabel(a, dateKey);
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(180,83,9,0.14)", borderRadius: 9, overflow: "hidden" }}>
      <button onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 7, width: "100%", textAlign: "left", cursor: "pointer",
          background: "none", border: "none", padding: "6px 6px 6px 9px", fontFamily: FF,
        }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#8A5A0F", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {a.event_name || "Activity tanpa nama"}
        </span>
        <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 999, color: meta.color, background: meta.bg, whiteSpace: "nowrap" }}>
          {meta.label}
        </span>
        <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#B8860B" }}>
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>

      {/* Lokasi & JAM di tanggal ini SELALU langsung terlihat (bukan cuma
          muncul setelah dropdown dibuka) - dua info itu yg paling sering
          dicari duluan (di mana & jam berapa) sebelum memutuskan mau buka
          detail lengkapnya atau tidak. Info site ID SENGAJA tidak
          ditampilkan di sini - kurang berguna dibanding alamat & jam. */}
      <div style={{ padding: "0 9px 7px 9px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
          <MapPin size={11} color="#B8860B" style={{ flexShrink: 0, marginTop: 1.5, opacity: 0.75 }} />
          <span style={{ fontSize: 10.5, color: "#8A5A0F", fontWeight: 600, lineHeight: 1.35, opacity: 0.85 }}>{location}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Clock size={11} color="#B8860B" style={{ flexShrink: 0, opacity: 0.75 }} />
          <span style={{ fontSize: 10.5, color: "#8A5A0F", fontWeight: 700, opacity: 0.85 }}>{timeLabel}</span>
        </div>
      </div>

      {open && (
        <div style={{ padding: "0 9px 9px", borderTop: "1px dashed rgba(180,83,9,0.2)", marginTop: -1 }}>
          <div style={{ paddingTop: 8, fontSize: 10.5, color: "#8A5A0F", fontWeight: 600, lineHeight: 1.5 }}>
            {a.mc || "MC belum diisi"} · Target {fmtInt(a.target_sp)}/{fmtInt(a.target_fwa)} SP/FWA
          </div>
          <button onClick={() => onOpenDetail(a)}
            style={{ marginTop: 8, width: "100%", height: 32, borderRadius: 8, border: "1px solid rgba(180,83,9,0.25)", background: "rgba(180,83,9,0.08)", color: "#8A5A0F", fontSize: 11, fontWeight: 800, fontFamily: FF, cursor: "pointer" }}>
            Lihat Detail Lengkap
          </button>
        </div>
      )}
    </div>
  );
}

function DateTimeRow({ label, dateKey, time, otherActs, onOpenDetail, editingField, onToggleAllDay, onOpenField, onChangeStart, onChangeEnd }) {
  const invalid = !time.isAllDay && (!time.startTime || !time.endTime || time.startTime >= time.endTime);
  return (
    <div style={{ border: `1.5px solid ${invalid ? "#F3C6C6" : "#ECEDF0"}`, borderRadius: 14, overflow: "hidden", background: "#FBFBFC" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 13px" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>{label}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "#8A8A96" }}>Seharian</span>
          <ToggleSwitch checked={time.isAllDay} onChange={onToggleAllDay} />
        </div>
      </div>

      {/* Dipisah jadi SECTION SENDIRI yg jelas berlabel (ikon + judul +
          garis pemisah dari bagian atur waktu) - dulu daftar plan lain ini
          nempel langsung di bawah toggle "Seharian" tanpa label apa pun,
          jadi ambigu spt bagian dari kontrol waktu itu sendiri. Sekarang
          jelas: "sudah ada plan LAIN di tanggal ini (bukan yg lagi dibuat)",
          & ttp bisa diketuk per baris utk lihat detail sebelum menambah
          plan baru di tanggal yg sama. */}
      {otherActs && otherActs.length > 0 && (
        <div style={{ margin: "0 13px 10px", padding: "9px 10px", borderRadius: 11, background: "rgba(180,83,9,0.05)", border: "1px solid rgba(180,83,9,0.16)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 7 }}>
            <Info size={11.5} color="#B45309" />
            <span style={{ fontSize: 10, fontWeight: 800, color: "#B45309", textTransform: "uppercase", letterSpacing: 0.3 }}>
              {otherActs.length} Plan Lain Sudah Ada
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {otherActs.map((a) => (
              <OtherActRow key={a.id} act={a} dateKey={dateKey} onOpenDetail={onOpenDetail} />
            ))}
          </div>
        </div>
      )}

      {!time.isAllDay && (
        <div style={{ padding: "0 13px 12px", ...(otherActs && otherActs.length > 0 ? { borderTop: "1px solid #F0F0F3", paddingTop: 12 } : {}) }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
            <Clock size={11.5} color="#B0B0BA" />
            <span style={{ fontSize: 9.5, fontWeight: 800, color: "#B0B0BA", textTransform: "uppercase", letterSpacing: 0.3 }}>Jam Kegiatan</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
            <button onClick={() => onOpenField("start")} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, color: "#B0B0BA", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 }}>Mulai</div>
              <TimePill text={time.startTime.replace(":", ".")} active={editingField === "start"} />
            </button>
            {/* Simbol penghubung - disejajarkan ke tengah tinggi pil jam
                (bukan tengah seluruh kolom termasuk label) lewat
                alignItems:"flex-end" di baris + marginBottom setengah tinggi
                pil, supaya selalu pas walau ukuran font berubah. */}
            <div style={{ width: 10, height: 1.5, borderRadius: 1, background: "#D8D9E0", marginBottom: 13, flexShrink: 0 }} />
            <button onClick={() => onOpenField("end")} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, color: "#B0B0BA", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 }}>Berakhir</div>
              <TimePill text={time.endTime.replace(":", ".")} active={editingField === "end"} danger={invalid} />
            </button>
          </div>
          {editingField === "start" && <WheelPicker value={time.startTime} onChange={onChangeStart} />}
          {editingField === "end" && <WheelPicker value={time.endTime} onChange={onChangeEnd} />}
          {invalid && <div style={{ marginTop: 6, fontSize: 10, color: "#DC2626", fontWeight: 700 }}>Jam mulai harus lebih awal dari jam selesai</div>}
        </div>
      )}
    </div>
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

function TimePill({ text, active, danger }) {
  return (
    <span style={{
      display: "inline-block", fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums",
      color: danger ? "#DC2626" : active ? "#fff" : "#17181C",
      background: danger ? "rgba(220,38,38,0.10)" : active ? BRAND : "#EDEEF1",
      borderRadius: 999, padding: "6px 13px",
    }}>
      {text}
    </span>
  );
}

const WHEEL_ITEM_H = 36;
const WHEEL_PAD = 2; // baris kosong atas/bawah supaya item pertama/terakhir bisa nyampai tengah

function WheelColumn({ values, selected, onChange }) {
  const ref = useRef(null);
  const settleRef = useRef(null);
  const didInit = useRef(false);
  // Indeks terakhir yg sudah "digetarkan" - supaya getar cuma nyala SEKALI
  // per baris yg dilewati (bukan tiap event scroll, yg bisa berkali-kali
  // per baris), persis rasanya roda jam/menit di Jam/Alarm iPhone.
  const lastTickIdx = useRef(values.indexOf(selected));

  useEffect(() => {
    if (didInit.current || !ref.current) return;
    const idx = values.indexOf(selected);
    if (idx >= 0) ref.current.scrollTop = idx * WHEEL_ITEM_H;
    didInit.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function snapTo(idx) {
    const clamped = Math.max(0, Math.min(values.length - 1, idx));
    ref.current?.scrollTo({ top: clamped * WHEEL_ITEM_H, behavior: "smooth" });
    onChange(values[clamped]);
  }

  function handleScroll() {
    if (!ref.current) return;
    // Getar tipis (3ms) SETIAP baris terlewati selagi menggulir - inilah
    // "tick" halus yg dirasakan, bukan cuma sekali di akhir. Catatan: Web
    // Vibration API hanya jalan di Android/Chrome, otomatis no-op di
    // Safari iOS (keterbatasan platform, bukan bug).
    const liveIdx = Math.round(ref.current.scrollTop / WHEEL_ITEM_H);
    if (liveIdx !== lastTickIdx.current) {
      lastTickIdx.current = liveIdx;
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
      style={{ height: WHEEL_ITEM_H * (WHEEL_PAD * 2 + 1), width: 58, overflowY: "scroll", scrollSnapType: "y mandatory", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
      <style>{`.mh-wheel-col::-webkit-scrollbar{display:none;width:0;height:0}`}</style>
      <div style={{ height: WHEEL_ITEM_H * WHEEL_PAD }} />
      {values.map((v, i) => {
        const isSel = v === selected;
        return (
          <div key={v} onClick={() => snapTo(i)}
            style={{
              height: WHEEL_ITEM_H, scrollSnapAlign: "center", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: isSel ? 18 : 14.5, fontWeight: isSel ? 800 : 500, color: isSel ? "#17181C" : "#B0B0BA",
              fontVariantNumeric: "tabular-nums", cursor: "pointer", transition: "color .1s, font-size .1s",
            }}>
            {v}
          </div>
        );
      })}
      <div style={{ height: WHEEL_ITEM_H * WHEEL_PAD }} />
    </div>
  );
}

const WHEEL_HOURS = Array.from({ length: 24 }, (_, i) => pad2(i));
const WHEEL_MINUTES = Array.from({ length: 60 }, (_, i) => pad2(i));

/** Roda pemutar jam:menit, padanan visual UIDatePicker iOS - bar abu-abu di
 * tengah menandai baris yg aktif dipilih, kedua kolom scroll independen. */
function WheelPicker({ value, onChange }) {
  const [h, m] = value.split(":");
  const centerTop = WHEEL_ITEM_H * WHEEL_PAD;
  return (
    <div style={{ position: "relative", marginTop: 10, padding: "4px 0 2px" }}>
      <div style={{ position: "absolute", top: 4 + centerTop, left: 6, right: 6, height: WHEEL_ITEM_H, borderRadius: 9, background: "#EDEEF1", zIndex: 0, pointerEvents: "none" }} />
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 2, position: "relative", zIndex: 1 }}>
        <WheelColumn values={WHEEL_HOURS} selected={h} onChange={(nh) => onChange(`${nh}:${m}`)} />
        <span style={{ fontSize: 16, fontWeight: 800, color: "#17181C", padding: "0 2px" }}>.</span>
        <WheelColumn values={WHEEL_MINUTES} selected={m} onChange={(nm) => onChange(`${h}:${nm}`)} />
      </div>
    </div>
  );
}
