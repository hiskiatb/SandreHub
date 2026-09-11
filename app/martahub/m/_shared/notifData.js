// Helper data-access utk Notifikasi (web mobile) - SATU SUMBER dgn Flutter:
// baris diisi server-side (inline insert) oleh RPC mh_web_decide_activity /
// mh_dsf_request_msisdn_transfer / mh_msisdn_transfer_decide. Web/mobile
// HANYA baca & tandai terbaca - tidak pernah insert langsung.
import supabaseMarta from "../../../../lib/supabaseMarta";

export const NOTIF_TYPE_META = {
  activity_approved: { label: "Plan Disetujui", color: "#15803D", bg: "rgba(21,128,61,0.10)" },
  activity_rejected: { label: "Plan Ditolak", color: "#DC2626", bg: "rgba(220,38,38,0.10)" },
  // Plan TIDAK PERLU approval lagi utk bisa dieksekusi - satu-satunya alasan
  // atasan "memutuskan" plan sekarang adalah kalau dia merasa plan-nya perlu
  // dikoreksi, jadi jenis notifikasi ini dipakai dari mh_web_decide_plan()
  // (decision='revision_needed') menggantikan alur approval lama.
  activity_plan_revision_needed: { label: "Plan Perlu Direvisi", color: "#B45309", bg: "rgba(180,83,9,0.10)" },
  msisdn_transfer_requested: { label: "Permintaan Transfer", color: "#B45309", bg: "rgba(180,83,9,0.10)" },
  msisdn_transfer_approved: { label: "Transfer Disetujui", color: "#15803D", bg: "rgba(21,128,61,0.10)" },
  msisdn_transfer_rejected: { label: "Transfer Ditolak", color: "#DC2626", bg: "rgba(220,38,38,0.10)" },
  // Keputusan Laporan Actual (mh_activity_manual_override) - BARU
  // ditambahkan, sebelumnya RPC ini tidak pernah insert notifikasi sama
  // sekali jadi DSF/BME tidak pernah tahu laporan actual mereka sudah
  // diputuskan (lihat migration add_actual_report_decision_notifications).
  activity_actual_approved: { label: "Laporan Actual Disetujui", color: "#15803D", bg: "rgba(21,128,61,0.10)" },
  activity_actual_revision_needed: { label: "Laporan Actual Perlu Direvisi", color: "#B45309", bg: "rgba(180,83,9,0.10)" },
  // Notifikasi submit (utk TMV, scope sesuai scope laporan yg bisa dia
  // lihat) - diisi server-side dari trigger _mh_notify_activity_submit
  // pada mh_activities (migration add_push_notifications_infra).
  activity_plan_submitted: { label: "Plan Baru Disubmit", color: "#2563EB", bg: "rgba(37,99,235,0.10)" },
  activity_actual_submitted: { label: "Laporan Actual Baru", color: "#2563EB", bg: "rgba(37,99,235,0.10)" },
  // Reminder utk BME/RGE (07.00/12.00/18.00 WIB) - diisi server-side dari
  // mh_run_actual_reminder() (pg_cron).
  activity_actual_reminder: { label: "Laporan Actual Belum Diisi", color: "#B45309", bg: "rgba(180,83,9,0.10)" },
};

export function notifTypeMeta(type) {
  return NOTIF_TYPE_META[type] || { label: "Notifikasi", color: "#6B7280", bg: "rgba(107,114,128,0.10)" };
}

export async function fetchNotifications(limit = 30) {
  const { data, error } = await supabaseMarta.rpc("mh_notifications_list", { p_limit: limit });
  if (error) throw error;
  return data || [];
}

export async function fetchUnreadCount() {
  const { data, error } = await supabaseMarta.rpc("mh_notifications_unread_count");
  if (error) throw error;
  return data || 0;
}

export async function markNotificationRead(id) {
  const { error } = await supabaseMarta.rpc("mh_notifications_mark_read", { p_id: id });
  if (error) throw error;
}

export async function markAllNotificationsRead() {
  const { error } = await supabaseMarta.rpc("mh_notifications_mark_all_read");
  if (error) throw error;
}

/** `route` yg disimpan di baris notifikasi adalah path GoRouter Flutter
 * (mis. "/msisdn-transfers", "/activities/<uuid>") - BUKAN path web ini.
 * Terjemahkan ke padanan /martahub/m/** sebelum dipakai router.push().
 *
 * `type` (OPSIONAL) - utk notifikasi "Plan Perlu Direvisi", diarahkan
 * LANGSUNG ke wizard edit plan (bukan cuma halaman detail read-only) supaya
 * pemilik plan bisa langsung mengoreksi tanpa langkah ekstra - sesuai
 * permintaan "pastikan bisa langsung diarahkan ke activity plan yang harus
 * direvisi". Jenis notifikasi lain ttp ke halaman detail biasa. */
export function translateNotifRoute(route, type) {
  if (!route) return null;
  if (route === "/msisdn-transfers") return "/martahub/m/transfers";
  const actMatch = route.match(/^\/activities\/([0-9a-f-]{36})$/i);
  if (actMatch) {
    if (type === "activity_plan_revision_needed") return `/martahub/m/activities/new?edit=${actMatch[1]}`;
    // Laporan Actual yg diminta revisi - langsung ke wizard Isi Laporan
    // (bukan cuma halaman detail read-only), sama alasannya dgn plan yg
    // diarahkan langsung ke wizard edit di atas.
    if (type === "activity_actual_revision_needed") return `/martahub/m/activities/${actMatch[1]}/submit`;
    // Reminder laporan actual - langsung ke wizard Isi Laporan (tujuan
    // reminder ini MEMANG supaya langsung diisi, bukan cuma dilihat).
    if (type === "activity_actual_reminder") return `/martahub/m/activities/${actMatch[1]}/submit`;
    return `/martahub/m/activities/${actMatch[1]}`;
  }
  return null; // route dikenal tapi tidak ada padanan web - jangan navigasi ke path Flutter
}
