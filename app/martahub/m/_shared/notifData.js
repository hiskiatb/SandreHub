// Helper data-access utk Notifikasi (web mobile) - SATU SUMBER dgn Flutter:
// baris diisi server-side (inline insert) oleh RPC mh_web_decide_activity /
// mh_dsf_request_msisdn_transfer / mh_msisdn_transfer_decide. Web/mobile
// HANYA baca & tandai terbaca - tidak pernah insert langsung.
import supabaseMarta from "../../../../lib/supabaseMarta";

export const NOTIF_TYPE_META = {
  activity_approved: { label: "Plan Disetujui", color: "#15803D", bg: "rgba(21,128,61,0.10)" },
  activity_rejected: { label: "Plan Ditolak", color: "#DC2626", bg: "rgba(220,38,38,0.10)" },
  msisdn_transfer_requested: { label: "Permintaan Transfer", color: "#B45309", bg: "rgba(180,83,9,0.10)" },
  msisdn_transfer_approved: { label: "Transfer Disetujui", color: "#15803D", bg: "rgba(21,128,61,0.10)" },
  msisdn_transfer_rejected: { label: "Transfer Ditolak", color: "#DC2626", bg: "rgba(220,38,38,0.10)" },
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
 * Terjemahkan ke padanan /martahub/m/** sebelum dipakai router.push(). */
export function translateNotifRoute(route) {
  if (!route) return null;
  if (route === "/msisdn-transfers") return "/martahub/m/transfers";
  const actMatch = route.match(/^\/activities\/([0-9a-f-]{36})$/i);
  if (actMatch) return `/martahub/m/activities/${actMatch[1]}`;
  return null; // route dikenal tapi tidak ada padanan web - jangan navigasi ke path Flutter
}
