/**
 * lib/sdp/prefill.js
 * Auto-fill dari master internal (Fase 2) — mengurangi pengetikan ulang.
 * sdp_master hanya punya kolom geografi + nama (tidak ada detail partner),
 * jadi prefill terbatas pada field yang tersedia. Sisanya tetap diisi manual
 * (lihat catatan cakupan di spec §7 F2).
 */

/** Request type yang membuat SDP baru → ID di-generate. Selain itu pakai ID existing. */
export function isNewCreation(requestType) {
  const r = String(requestType || "").trim().toLowerCase();
  return r === "" || r === "new" || r === "hybrid pairing";
}

/** Petakan satu baris sdp_master → field registrasi yang bisa diisi otomatis. */
export function masterToPrefill(m) {
  if (!m) return {};
  const out = {};
  if (m.sdp_name) out.sdp_name = m.sdp_name;
  if (m.pt_name) out.partner_company_name = m.pt_name;
  if (m.region) out.region = m.region;
  if (m.branch) out.branch = m.branch;
  return out;
}

/** Dedupe daftar sdp_master (satu baris per sdp_id, ambil periode terbaru). */
export function dedupeSdps(rows) {
  const seen = new Set();
  return (rows || []).filter((s) => {
    if (!s?.sdp_id || seen.has(s.sdp_id)) return false;
    seen.add(s.sdp_id);
    return true;
  });
}
