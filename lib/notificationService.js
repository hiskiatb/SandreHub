/**
 * notificationService.js — taruh di app/lib/notificationService.js
 *
 * Dipanggil dari FormPendapatan dan FormPengeluaran setelah upsert berhasil.
 *
 * Contoh penggunaan:
 *   import { pushNotification } from "../../../lib/notificationService";
 *   await pushNotification(supabase, {
 *     type: "form_draft",           // "form_draft" | "form_final" | "finalized"
 *     form: "pendapatan",           // "pendapatan" | "pengeluaran" | null
 *     partner_name: ctx.mpxName,
 *     branch: ctx.branch,
 *     mpc_mp3: ctx.mpxType,
 *     month: ctx.month,
 *     year: ctx.year,
 *     validation_notes: notes,
 *     triggered_by: user.id,
 *     triggered_name: profile?.full_name ?? "",
 *   });
 */
export async function pushNotification(supabase, payload) {
  try {
    const { error } = await supabase.from("pnl_notifications").insert({
      type:             payload.type,
      form:             payload.form ?? null,
      partner_name:     payload.partner_name,
      branch:           payload.branch,
      mpc_mp3:          payload.mpc_mp3,
      month:            payload.month,
      year:             String(payload.year),
      validation_notes: payload.validation_notes ?? null,
      triggered_by:     payload.triggered_by ?? null,
      triggered_name:   payload.triggered_name ?? null,
      read_by:          [],
    });
    if (error) console.warn("[notif] insert error:", error.message);
  } catch (e) {
    console.warn("[notif] pushNotification failed:", e.message);
  }
}