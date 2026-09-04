// Pemetaan status → label/warna, DISAMAKAN dengan app Flutter
// (lib/core/constants/app_colors.dart + activity_list_screen.dart) supaya
// bahasa visual status konsisten lintas platform selama migrasi berjalan.

export const STATUS_META = {
  draft:               { label: "Draft",                    color: "#6B7280", bg: "rgba(107,114,128,0.10)" },
  // Plan TIDAK PERLU approval TMV/Head lagi - "plan_submitted" itu sendiri
  // sudah status final/siap dieksekusi begitu tanggal event tiba (masih
  // bisa diedit sebelum itu - lihat earliestPlanDate() di halaman detail).
  // TMV/Head cuma bisa menandai plan "Perlu Revisi" (wajib kasih komentar)
  // lewat Approval Center kalau memang ada yg keliru - BUKAN gate wajib
  // dilewati spt approval dulu.
  plan_submitted:       { label: "Plan Diajukan",              color: "#2563EB", bg: "rgba(37,99,235,0.10)" },
  revision_needed:      { label: "Revisi Plan",               color: "#B45309", bg: "rgba(180,83,9,0.10)" },
  // 'approved' SEKARANG cuma dipakai di satu titik siklus hidup: laporan
  // actual lolos validasi otomatis (checkin_valid via trigger server) - jadi
  // artinya "Selesai", BUKAN "plan disetujui" (gate itu sudah dihapus).
  approved:              { label: "Selesai",                   color: "#15803D", bg: "rgba(21,128,61,0.10)" },
  pending_validation:    { label: "Menunggu Validasi",         color: "#2563EB", bg: "rgba(37,99,235,0.10)" },
  revision_actual:       { label: "Revisi Report",             color: "#B45309", bg: "rgba(180,83,9,0.10)" },
  in_progress:           { label: "Berjalan",                  color: "#7C3AED", bg: "rgba(124,58,237,0.10)" },
};

export function statusMeta(status) {
  return STATUS_META[status] || { label: status || "-", color: "#6B7280", bg: "rgba(107,114,128,0.10)" };
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];

export function fmtDate(s) {
  if (!s || s.length < 10) return "-";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d} ${MONTHS[(+m || 1) - 1]} ${y}`;
}

export function fmtInt(n) {
  if (n == null) return "0";
  return Number(n).toLocaleString("id-ID");
}

export function fmtRp(n) {
  if (n == null) return "Rp 0";
  return `Rp ${Number(n).toLocaleString("id-ID")}`;
}

// Label jam ringkas utk kartu daftar Aktivitas - "Seharian" kalau is_all_day
// (atau jam tidak lengkap), atau rentang "HH.MM - HH.MM" kalau ada. Kalau
// plan multi-tanggal punya jam berbeda per tanggal (plan_date_times), pakai
// jam di TANGGAL PALING AWAL (earliestPlanDate) sbg representasi kartu -
// sama logikanya dgn otherActTimeLabel di CalendarPickerSheet, cuma versi
// tanpa dateKey eksplisit (kartu daftar cuma nampilin satu baris ringkas).
export function fmtTimeLabel(a) {
  let perDate = null;
  const dateKey = earliestPlanDate(a);
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

// Tanggal event PALING AWAL dari plan ini (single/rentang/multi) dlm bentuk
// string "YYYY-MM-DD" siap dibandingkan string biasa dgn hari ini. SATU
// sumber kebenaran dipakai baik oleh halaman detail (aksi Check In/Isi
// Laporan vs Edit Plan) maupun kartu daftar (label hitung-mundur di bawah).
export function earliestPlanDate(a) {
  if (a.plan_dates_multi) {
    const parts = a.plan_dates_multi.split(",").filter(Boolean).sort();
    if (parts[0]) return parts[0];
  }
  return a.plan_date_start || a.plan_date || null;
}

// Plan yg statusnya "siap dieksekusi" (plan_submitted/approved) TIDAK PERLU
// approval lagi - jadi status pill "Plan Diajukan"/"Disetujui" kurang
// berguna dibanding info yg lebih actionable: berapa hari lagi event-nya.
// Dipakai gantiin status pill KHUSUS utk status "siap" ini; status lain
// (draft/revisi/dst.) tetap pakai statusMeta() biasa krn label itu justru
// yg paling relevan di fase itu.
// Cuma plan_submitted yg berarti "siap, belum ada actual" - 'approved'
// sekarang eksklusif berarti "actual sudah selesai & valid" (lihat catatan
// di STATUS_META), jadi TIDAK dianggap lagi "siap mengisi laporan".
export const READY_STATUSES = new Set(["plan_submitted"]);

export function eventCountdownLabel(a) {
  const eventDate = earliestPlanDate(a);
  if (!eventDate) return { label: "Tanggal belum diisi", color: "#6B7280", bg: "rgba(107,114,128,0.10)" };
  const today = new Date().toISOString().slice(0, 10);
  const diffDays = Math.round((new Date(eventDate + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
  if (diffDays < 0) return { label: "Sudah Lewat", color: "#6B7280", bg: "rgba(107,114,128,0.10)" };
  if (diffDays === 0) return { label: "Hari Ini", color: "#DC2626", bg: "rgba(220,38,38,0.10)" };
  if (diffDays === 1) return { label: "Besok", color: "#B45309", bg: "rgba(180,83,9,0.10)" };
  if (diffDays <= 7) return { label: `H-${diffDays}`, color: "#B45309", bg: "rgba(180,83,9,0.10)" };
  return { label: `H-${diffDays}`, color: "#2563EB", bg: "rgba(37,99,235,0.10)" };
}

// Draft dianggap "belum lengkap" kalau salah satu field wajib wizard belum
// terisi - SATU sumber kebenaran dipakai baik oleh halaman detail (redirect
// otomatis ke wizard) maupun kartu daftar Aktivitas & banner Beranda (badge
// "Belum Lengkap"/hitungan draft belum selesai), supaya definisi "lengkap"
// tidak diam-diam berbeda antar layar.
export function isDraftIncomplete(a) {
  const categories = Array.isArray(a.event_categories) && a.event_categories.length ? a.event_categories : (a.event_category ? a.event_category.split(",").filter(Boolean) : []);
  const hasDate = !!(a.plan_date || a.plan_date_start || a.plan_dates_multi);
  return !(categories.length > 0 && !!(a.event_name || "").trim() && hasDate && !!a.mc && !!a.site_id && !!a.poi_type);
}

// SATU status yg diakui utk seluruh siklus hidup activity plan - dipakai
// jadi SATU-SATUNYA pill status di kartu (list Aktivitas & Beranda),
// menggantikan dua pill terpisah yg sebelumnya bisa kelihatan "kontradiksi"
// (mis. kanan-atas "Plan Diajukan" dari status DB mentah, VS pill lain di
// bawah "Berjalan" hasil hitungan tanggal - user bingung mana yg benar).
// Sekarang cuma SATU fungsi ini yg berhak menentukan label status yg
// ditampilkan, jadi tidak ada lagi dua sumber kebenaran berbeda.
//
// Tahapannya: Draft → Revisi Plan (kalau ditandai perlu revisi) → begitu
// status DB plan_submitted, labelnya JADI DINAMIS ikut tanggal event
// (Terjadwal → Berjalan → Laporan Terlambat kalau actual belum diisi) →
// Revisi Report (kalau laporan actual ditandai perlu revisi) → Selesai.
export function activityStage(a) {
  if (a.status === "draft") return STATUS_META.draft;
  if (a.status === "revision_needed") return STATUS_META.revision_needed;
  if (a.status === "revision_actual") return STATUS_META.revision_actual;
  const hasActual = a.actual_sp != null;
  if (hasActual || a.status === "approved") return { label: "Selesai", color: "#15803D", bg: "rgba(21,128,61,0.10)" };
  if (READY_STATUSES.has(a.status)) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const eventDateStr = earliestPlanDate(a);
    if (eventDateStr && eventDateStr < todayStr) return { label: "Laporan Terlambat", color: "#DC2626", bg: "rgba(220,38,38,0.10)" };
    if (eventDateStr === todayStr) return { label: "Berjalan", color: "#7C3AED", bg: "rgba(124,58,237,0.10)" };
    return { label: "Terjadwal", color: "#2563EB", bg: "rgba(37,99,235,0.10)" };
  }
  return statusMeta(a.status);
}
