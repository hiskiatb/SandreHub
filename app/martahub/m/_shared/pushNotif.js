// Helper Web Push (aktifkan/nonaktifkan notifikasi push) utk MartaHub
// mobile-web. Dipakai dari halaman Notifikasi (banner) & Profil (toggle
// iOS-style) - HARUS dipicu lewat user gesture (klik/tap), browser menolak
// Notification.requestPermission() kalau dipanggil otomatis tanpa interaksi
// user secara langsung.
import supabaseMarta from "../../../../lib/supabaseMarta";

// Public key VAPID - AMAN utk ditaruh di client (bukan rahasia), pasangan
// private key-nya cuma ada di edge function mh-send-push (server), tidak
// pernah dikirim ke browser.
export const VAPID_PUBLIC_KEY =
  "BNVunwQTwICSr5YPtcoKMe3lSzCcmlRBB09dZXbYslmyFoQHFN0IJUwnnfnkJ9m9gJQzj_DjXaVrOuKt4jr1S9Y";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window.PushManager !== "undefined" &&
    typeof window.Notification !== "undefined"
  );
}

export function pushPermission() {
  if (typeof window === "undefined" || typeof window.Notification === "undefined") return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}

/** Ambil registrasi SW aktif yg mengontrol halaman ini SAAT INI - dipakai
 * bareng2 oleh semua fungsi di bawah spy konsisten (BUKAN campur
 * getRegistration() vs ready spt sebelumnya, supaya tidak ada celah
 * "registrasi belum aktif" yg bikin toggle salah baca status). Kalau SW
 * belum terkontrol (baru pertama kali buka / reload paksa), tunggu event
 * controllerchange sekali sblm fallback ke .ready, spy tidak nyangkut
 * nunggu selamanya di device lambat. */
async function getReadyRegistration(timeoutMs = 4000) {
  if (!pushSupported()) return null;
  try {
    const readyPromise = navigator.serviceWorker.ready;
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
    const reg = await Promise.race([readyPromise, timeoutPromise]);
    return reg || null;
  } catch {
    return null;
  }
}

/** Cek apakah device ini SUDAH subscribe push (baca LANGSUNG dari browser,
 * bukan dari state lokal - jadi selalu akurat walau izin dicabut manual
 * dari luar app). */
export async function isPushSubscribed() {
  if (!pushSupported()) return false;
  if (pushPermission() !== "granted") return false;
  try {
    const reg = await getReadyRegistration();
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

/** Status gabungan siap-pakai utk UI (toggle/menu): "unsupported" |
 * "denied" | "on" | "off". Satu-satunya sumber kebenaran dipakai bareng di
 * halaman Notifikasi & Profil supaya kedua tempat selalu konsisten. */
export async function getPushStatus() {
  if (!pushSupported()) return "unsupported";
  const perm = pushPermission();
  if (perm === "denied") return "denied";
  const subscribed = await isPushSubscribed();
  return subscribed ? "on" : "off";
}

/** Minta izin notifikasi + subscribe push + simpan subscription ke server.
 * Return { ok: boolean, reason?: string }. Aman dipanggil berkali-kali
 * (idempotent) - kalau sudah ada subscription aktif, dipakai ulang, TIDAK
 * bikin duplikat (endpoint UNIQUE di server + upsert). */
export async function enablePushNotifications() {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: permission };

    const reg = await getReadyRegistration(8000);
    if (!reg) return { ok: false, reason: "sw_not_ready" };

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: "invalid_subscription" };
    }

    const { error } = await supabaseMarta.rpc("mh_save_push_subscription", {
      p_endpoint: json.endpoint,
      p_p256dh: json.keys.p256dh,
      p_auth: json.keys.auth,
      p_user_agent: navigator.userAgent,
    });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || "error" };
  }
}

/** Nonaktifkan push di device ini - unsubscribe di BROWSER dulu (baru
 * benar2 berhenti terima push walau baris server gagal dihapus krn offline
 * dll), baru hapus baris server best-effort. */
export async function disablePushNotifications() {
  if (!pushSupported()) return { ok: true };
  try {
    const reg = await getReadyRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      const endpoint = sub.endpoint;
      const unsubscribed = await sub.unsubscribe().catch(() => false);
      if (unsubscribed) {
        await supabaseMarta.rpc("mh_delete_push_subscription", { p_endpoint: endpoint }).catch(() => {});
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || "error" };
  }
}

/** Kirim SATU notifikasi tes ke device ini - dipanggil sekali tepat
 * setelah notifikasi berhasil diaktifkan, spy user langsung dapat bukti
 * nyata fiturnya jalan (bukan cuma toggle-nya berubah warna). Best-effort:
 * kegagalan di sini TIDAK membatalkan status "aktif" krn subscription-nya
 * sendiri sudah tersimpan valid di server. */
export async function sendTestPush() {
  try {
    const { error } = await supabaseMarta.rpc("mh_send_test_push");
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || "error" };
  }
}
