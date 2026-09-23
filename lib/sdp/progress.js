/**
 * lib/sdp/progress.js — SDP Management (Baru)
 * Menyatukan 5 kolom status registrasi (circle_submit_status, hq_validation_status,
 * final_registration_status, system_account_status, id_validation_status) jadi
 * SATU progress 4-tahap untuk CSE/RSE — sesuai keputusan rebuild:
 *   Registrasi → Validasi HQ → System & ID → Registered
 * Rincian per kolom tetap ada di data (dipakai HQ/PIC/SPM di modul Archive),
 * fungsi ini hanya lapisan tampilan untuk pengalaman CSE yang baru.
 */

export const SDP_STAGES = [
  { key: "registrasi", label: "Registrasi" },
  { key: "hq", label: "Validasi HQ" },
  { key: "system", label: "System & ID" },
  { key: "registered", label: "Registered" },
];

/**
 * @returns {{ stageIndex:number, stageKey:string, tone:'ok'|'amber'|'acc'|'blue', headline:string, blocked:boolean, blockedNote:string|null }}
 *   stageIndex 0..3 = tahap yang SEDANG berjalan (bukan yang sudah selesai).
 *   Jika blocked=true, tahap tsb butuh tindakan CSE (Need Revision/Hold) — tone acc/amber.
 */
export function computeSdpProgress(row) {
  const circle = row?.circle_submit_status || "Draft";
  const hq = row?.hq_validation_status || "Not Reviewed";
  const finalS = row?.final_registration_status || "Draft";
  const sysA = row?.system_account_status || "Not Started";
  const idV = row?.id_validation_status || "Not Yet";

  // Registered — selesai penuh.
  if (finalS === "Registered") {
    return { stageIndex: 3, stageKey: "registered", tone: "ok", headline: "Registered", blocked: false, blockedNote: null };
  }
  // Hold di tahap manapun — butuh perhatian tapi bukan "salah", cukup ditahan.
  if (finalS === "Hold" || hq === "Hold") {
    return { stageIndex: hq === "Not Reviewed" ? 0 : 1, stageKey: "hq", tone: "amber", headline: "Ditahan (Hold)", blocked: true, blockedNote: row?.hq_revision_note || "Diminta HQ untuk ditahan sementara." };
  }
  // Need Revision — CSE harus memperbaiki data.
  if (hq === "Need Revision" || circle === "Need Revision" || finalS === "Need Revision") {
    return { stageIndex: 0, stageKey: "registrasi", tone: "acc", headline: "Perlu Perbaikan", blocked: true, blockedNote: row?.hq_revision_note || "HQ meminta perbaikan data." };
  }
  // Belum submit sama sekali.
  if (circle === "Draft") {
    return { stageIndex: 0, stageKey: "registrasi", tone: "blue", headline: "Draft", blocked: false, blockedNote: null };
  }
  // Sudah submit, menunggu HQ review.
  if (hq === "Not Reviewed") {
    return { stageIndex: 1, stageKey: "hq", tone: "amber", headline: "Menunggu Validasi HQ", blocked: false, blockedNote: null };
  }
  // HQ Validated — lanjut ke System creation & ID validation.
  if (hq === "Validated" && !(sysA === "Created" && idV === "Validated")) {
    return { stageIndex: 2, stageKey: "system", tone: "amber", headline: "Proses System & ID", blocked: false, blockedNote: null };
  }
  // Fallback aman.
  return { stageIndex: 1, stageKey: "hq", tone: "amber", headline: finalS, blocked: false, blockedNote: null };
}
