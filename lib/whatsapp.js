/**
 * Helper kecil untuk fitur "Hubungi Call Center via WhatsApp" - dipakai di
 * app promotor (login & halaman utama) dan di panel pengaturan SPM
 * Sumatera (dashboard). Nomor & template pesan disimpan di tabel
 * `pts_call_center_setting` (satu baris/singleton), diatur lewat dashboard.
 */
import supabase from "./supabase";

/** Bersihkan nomor jadi format internasional tanpa simbol, dimulai 62. */
export function normalizeWaNumber(raw) {
  if (!raw) return "";
  let digits = String(raw).replace(/[^\d]/g, "");
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  else if (digits.startsWith("+")) digits = digits.slice(1);
  return digits;
}

/** Bangun link wa.me siap-klik dari nomor + pesan pembuka. */
export function buildWaLink(number, message) {
  const n = normalizeWaNumber(number);
  if (!n) return null;
  const q = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${n}${q}`;
}

/** Ambil pengaturan call center (singleton row) - null jika belum diatur/gagal. */
export async function fetchCallCenterSetting() {
  try {
    const { data } = await supabase.from("pts_call_center_setting").select("*").limit(1).maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}
