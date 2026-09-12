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
  // Digabung dgn 'revision_actual' (dulu status terpisah) jadi SATU status
  // "revision_needed" - bedanya plan/actual sekarang ditandai kolom
  // revision_target ('plan'/'actual'), dijelaskan lewat validation_note.
  revision_needed:      { label: "Revisi",                    color: "#B45309", bg: "rgba(180,83,9,0.10)" },
  // 'completed' (dulu bernama 'approved' - diganti krn TIDAK lagi berarti
  // "disetujui atasan", gate approval plan sudah dihapus total) cuma
  // dipakai di satu titik siklus hidup: laporan actual lolos validasi
  // kelengkapan OTOMATIS oleh trigger server, bukan keputusan manual.
  completed:             { label: "Selesai",                   color: "#15803D", bg: "rgba(21,128,61,0.10)" },
  pending_validation:    { label: "Menunggu Validasi",         color: "#2563EB", bg: "rgba(37,99,235,0.10)" },
  in_progress:           { label: "Berjalan",                  color: "#7C3AED", bg: "rgba(124,58,237,0.10)" },
};

export function statusMeta(status) {
  return STATUS_META[status] || { label: status || "-", color: "#6B7280", bg: "rgba(107,114,128,0.10)" };
}

// Label kontekstual utk status "revision_needed" - plan/actual dibedakan
// dari kolom revision_target, bukan lagi dua status terpisah. Default ke
// "Revisi Plan" kalau revision_target belum keisi (baris lama sblm kolom
// ini ada, atau memang sedang tahap plan).
export function revisionKindLabel(a) {
  return a?.revision_target === "actual" ? "Revisi Report" : "Revisi Plan";
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

// Ambil info jam utk SATU tanggal spesifik dari plan ini (fallback ke jam
// tunggal a.start_time/a.end_time kalau plan_date_times belum/tidak ada
// utk tanggal itu) - SATU sumber kebenaran dipakai baik oleh fmtTimeLabel
// (tampilan kartu) maupun activityStage (nentuin kapan persis "Berjalan"
// berubah jadi "Menunggu Laporan").
export function perDateTimeInfo(a, dateKey) {
  let perDate = null;
  if (dateKey && a.plan_date_times) {
    try {
      const map = typeof a.plan_date_times === "string" ? JSON.parse(a.plan_date_times) : a.plan_date_times;
      perDate = map?.[dateKey] || null;
    } catch { /* biarkan null, fallback di bawah */ }
  }
  const isAllDay = perDate ? !!perDate.is_all_day : a.is_all_day !== false;
  const startTime = (perDate?.start_time || a.start_time || "").slice(0, 5);
  const endTime = (perDate?.end_time || a.end_time || "").slice(0, 5);
  return { isAllDay, startTime, endTime };
}

// Label jam ringkas utk kartu daftar Aktivitas - "Seharian" kalau is_all_day
// (atau jam tidak lengkap), atau rentang "HH.MM - HH.MM" kalau ada. Kalau
// plan multi-tanggal punya jam berbeda per tanggal (plan_date_times), pakai
// jam di TANGGAL PALING AWAL (earliestPlanDate) sbg representasi kartu -
// sama logikanya dgn otherActTimeLabel di CalendarPickerSheet, cuma versi
// tanpa dateKey eksplisit (kartu daftar cuma nampilin satu baris ringkas).
export function fmtTimeLabel(a) {
  const dateKey = earliestPlanDate(a);
  const { isAllDay, startTime: st, endTime: et } = perDateTimeInfo(a, dateKey);
  if (isAllDay) return "Seharian";
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

// Kunci "YYYY-MM" dari tanggal plan PALING AWAL punya aktivitas ini -
// dipakai utk kelompokkan/filter daftar aktivitas per bulan (mis. tab/chip
// pilih bulan di halaman daftar). Sengaja pakai earliestPlanDate (bukan
// created_at) krn yg relevan bagi DSF adalah BULAN EVENT-nya terjadi, bukan
// kapan plan-nya dibuat di sistem.
export function planMonthKey(a) {
  const d = earliestPlanDate(a);
  return d ? d.slice(0, 7) : null; // "YYYY-MM-DD" -> "YYYY-MM"
}

// Label ringkas relatif dari timestamp `updated_at` (ISO string) - dipakai
// di kartu daftar aktivitas spy DSF langsung tahu kapan terakhir kartu ini
// diubah TANPA perlu buka detailnya. Ambang dipilih supaya tetap "ringkas"
// (bukan jam presisi) tapi masih informatif: <1 menit "Baru saja", <60
// menit "N menit lalu", <24 jam "N jam lalu", kemarin "Kemarin",
// <7 hari "N hari lalu", lebih lama "3 Sep" (atau "3 Sep 2025" kalau beda
// tahun dari sekarang).
export function updatedAgoLabel(iso) {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Baru saja";
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam lalu`;
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDay = Math.round((startOfDay(now) - startOfDay(then)) / 86400000);
  if (diffDay === 1) return "Kemarin";
  if (diffDay < 7) return `${diffDay} hari lalu`;
  const sameYear = then.getFullYear() === now.getFullYear();
  return `${then.getDate()} ${MONTHS[then.getMonth()]}${sameYear ? "" : " " + then.getFullYear()}`;
}

// Tanggal event PALING AKHIR dari plan ini (rentang/multi bisa berisi
// beberapa hari) - dipakai utk memastikan Laporan Actual baru boleh
// dikirim setelah SELURUH hari plan ini terlewati (bukan cuma hari
// pertamanya), krn actual yg dikirim mewakili keseluruhan plan, bukan
// cuma satu hari. Selama masih ada hari yang belum berjalan, data actual
// yang sudah diisi tetap aman tersimpan lewat "Simpan Draft" saja.
export function latestPlanDate(a) {
  if (a.plan_dates_multi) {
    const parts = a.plan_dates_multi.split(",").filter(Boolean).sort();
    if (parts.length) return parts[parts.length - 1];
  }
  return a.plan_date_end || a.plan_date_start || a.plan_date || null;
}

// Plan yg statusnya "siap dieksekusi" (plan_submitted/completed) TIDAK PERLU
// approval lagi - jadi status pill "Plan Diajukan"/"Disetujui" kurang
// berguna dibanding info yg lebih actionable: berapa hari lagi event-nya.
// Dipakai gantiin status pill KHUSUS utk status "siap" ini; status lain
// (draft/revisi/dst.) tetap pakai statusMeta() biasa krn label itu justru
// yg paling relevan di fase itu.
// Cuma plan_submitted yg berarti "siap, belum ada actual" - 'completed'
// sekarang eksklusif berarti "actual sudah selesai & valid" (lihat catatan
// di STATUS_META), jadi TIDAK dianggap lagi "siap mengisi laporan".
export const READY_STATUSES = new Set(["plan_submitted"]);

// Kolom PLAN wajib - SATU sumber kebenaran dipakai jg oleh isDraftIncomplete()
// di atas (definisi sama, cuma dipisah krn dipakai di konteks beda: draft
// blm lengkap vs plan yg statusnya sudah lanjut tapi ternyata masih bolong,
// mis. hasil Import Excel/Backdoor "slot kosong").
export function missingPlanFields(a) {
  const categories = Array.isArray(a.event_categories) && a.event_categories.length ? a.event_categories : (a.event_category ? a.event_category.split(",").filter(Boolean) : []);
  const hasDate = !!(a.plan_date || a.plan_date_start || a.plan_dates_multi);
  const missing = [];
  if (!(a.event_name || "").trim()) missing.push("Nama Event");
  if (!categories.length) missing.push("Kategori Event");
  if (!hasDate) missing.push("Tanggal Plan");
  if (!a.mc) missing.push("MC");
  if (!a.site_id) missing.push("Site");
  if (!a.poi_type) missing.push("Tipe POI");
  return missing;
}

// Kolom ACTUAL wajib - SAMA PERSIS dgn yg sudah divalidasi wajib di form
// Isi Laporan Actual (submit/page.jsx) DAN di trigger server
// mh_validate_activity_actual() (DB) - tiga tempat ini SENGAJA disamakan
// supaya "Selesai" berarti sama di mana pun ditampilkan (kartu, filter
// Status, ringkasan Beranda), bukan tiga definisi longgar yg beda-beda.
export function missingActualFields(a) {
  const missing = [];
  if (a.actual_sp == null) missing.push("Actual SP");
  if (a.actual_fwa == null) missing.push("Actual FWA");
  if (a.cost_actual == null) missing.push("Cost Actual");
  if (!(a.insight || "").trim()) missing.push("Insight");
  return missing;
}

// Aktivitas dianggap BENAR-BENAR "Selesai" hanya kalau TIDAK ADA kolom plan
// maupun actual yang masih kosong - dipakai sbg gate tambahan di atas
// status DB mentah (status==='completed' TIDAK CUKUP sendirian, krn data
// lama/import bisa saja ke-tandai completed sebelum field2 ini lengkap).
export function isActivityFullyComplete(a) {
  return missingPlanFields(a).length === 0 && missingActualFields(a).length === 0;
}

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
// (Terjadwal → Berjalan → Menunggu Laporan begitu jam selesai event lewat,
// atau begitu tanggalnya berganti kalau event seharian/tanpa jam) →
// Revisi Report (kalau laporan actual ditandai perlu revisi) → Selesai.
export function activityStage(a) {
  if (a.status === "draft") return STATUS_META.draft;
  if (a.status === "revision_needed") return { label: revisionKindLabel(a), color: STATUS_META.revision_needed.color, bg: STATUS_META.revision_needed.bg };
  const hasActual = a.actual_sp != null;
  if (hasActual || a.status === "completed") {
    // "Selesai" (hijau) HANYA kalau semua kolom plan & actual benar2
    // lengkap - kalau tidak, tandai jelas mana yg kurang (bukan diam2
    // tetap dianggap Selesai, dan bukan cuma "Perlu Dilengkapi" polos yg
    // bikin bingung arahnya ke plan atau actual) supaya gap antara jumlah
    // "Selesai" di kartu vs di filter Status tidak lagi membingungkan.
    if (isActivityFullyComplete(a)) return { label: "Selesai", color: "#15803D", bg: "rgba(21,128,61,0.10)" };
    const planMissing = missingPlanFields(a).length > 0;
    const actualMissing = missingActualFields(a).length > 0;
    // Label dipersingkat (bukan "... Perlu Dilengkapi" yg kepanjangan di
    // pill kartu) - "Kurang" cukup jelas & tetap membedakan arahnya ke
    // Plan atau Actual, sama istilahnya dgn opsi filter Status di daftar
    // Aktivitas (lihat filterOptionGroups di activities/page.jsx) supaya
    // TMV/BME melihat kata yg SAMA PERSIS di kartu maupun di filter.
    const label = planMissing && actualMissing
      ? "Plan & Actual Kurang"
      : planMissing
        ? "Plan Kurang"
        : "Actual Kurang";
    return { label, color: "#B45309", bg: "rgba(180,83,9,0.10)" };
  }
  if (READY_STATUSES.has(a.status)) {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const eventDateStr = earliestPlanDate(a);
    if (eventDateStr && eventDateStr < todayStr) return { label: "Menunggu Laporan", color: "#DC2626", bg: "rgba(220,38,38,0.10)" };
    if (eventDateStr === todayStr) {
      // Seharian (atau jam tidak lengkap) -> tetap "Berjalan" sampai pukul
      // 00.00 (baru berubah besok, ditangani cabang di atas). Kalau event
      // punya jam selesai spesifik, begitu jam SEKARANG lewat jam selesai
      // itu, LANGSUNG "Menunggu Laporan" - tidak perlu nunggu gonta hari.
      const { isAllDay, endTime } = perDateTimeInfo(a, eventDateStr);
      if (!isAllDay && endTime) {
        const eventEnd = new Date(`${eventDateStr}T${endTime}:00`);
        if (!Number.isNaN(eventEnd.getTime()) && now > eventEnd) {
          return { label: "Menunggu Laporan", color: "#DC2626", bg: "rgba(220,38,38,0.10)" };
        }
      }
      return { label: "Berjalan", color: "#7C3AED", bg: "rgba(124,58,237,0.10)" };
    }
    return { label: "Terjadwal", color: "#2563EB", bg: "rgba(37,99,235,0.10)" };
  }
  return statusMeta(a.status);
}
