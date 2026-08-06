/**
 * lib/sdp/idFormat.js
 * Standardisasi SDP ID (§10A spec) - sisi client.
 * Format: [Identifier][PartnerCode][YYMM][CircleCode][RunningSeq2]
 *   Identifier : SDP (Mitra IM3) / KSK (3Kiosk/3ID)         ← brand
 *   PartnerCode: per baris (brand + status hybrid) → 2/3/4/5 ← brand + scope
 *   YYMM       : bulan siklus/live target                    ← cycle_month
 *   CircleCode : 1 Sumatera · 2 Jakarta Raya · 3 Kalisumapa · 4 Java
 *   RunningSeq : 2 digit (di-generate server via RPC generate_sdp_id)
 *
 * ID FINAL dibuat di server (RPC transaksional) agar sequence anti-balapan.
 * Modul ini untuk PREVIEW & VALIDASI bentuk saja.
 */

export const CIRCLE_CODE = {
  "sumatera": "1",
  "jakarta raya": "2",
  "kalisumapa": "3",
  "java": "4",
};

export const IDENTIFIER = { IM3: "SDP", "3ID": "KSK" };

// Bentuk ID standar (8 digit setelah prefix). Legacy tidak mengikuti pola ini.
export const SDP_ID_REGEX = /^(SDP|KSK)[1-5]\d{4}[1-4]\d{2}$/;

export function isHybridScope(scope) {
  return String(scope || "").trim().toLowerCase().startsWith("hybrid");
}

/** Partner code per baris: hybrid → IM3=4/3ID=5; single → IM3=2/3ID=3. */
export function partnerCode(brand, scope) {
  const isIM3 = String(brand || "").toUpperCase() === "IM3";
  if (isHybridScope(scope)) return isIM3 ? "4" : "5";
  return isIM3 ? "2" : "3";
}

export function identifier(brand) {
  return String(brand || "").toUpperCase() === "IM3" ? "SDP" : "KSK";
}

export function circleCode(circle) {
  return CIRCLE_CODE[String(circle || "").trim().toLowerCase()] || null;
}

/** 'Jul-2026' | '2026-07' | Date → 'YYMM'. Return null jika tak terbaca. */
export function toYYMM(cycleMonth) {
  if (!cycleMonth) return null;
  if (cycleMonth instanceof Date) {
    return String(cycleMonth.getFullYear()).slice(2) + String(cycleMonth.getMonth() + 1).padStart(2, "0");
  }
  const s = String(cycleMonth).trim();
  let m = s.match(/^(\d{4})-(\d{2})/);            // 2026-07
  if (m) return m[1].slice(2) + m[2];
  const MON = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
  m = s.match(/^([A-Za-z]{3})[a-z]*[-\s](\d{4})$/); // Jul-2026 / July 2026
  if (m && MON[m[1].toLowerCase()]) return m[2].slice(2) + MON[m[1].toLowerCase()];
  return null;
}

/**
 * Preview SDP ID (tanpa running sequence final dari server).
 * seq opsional; jika kosong → placeholder 'NN'.
 * Return null jika data belum cukup (brand/circle/cycle).
 */
export function previewSdpId({ brand, registration_scope, circle, cycle_month, seq } = {}) {
  const ident = identifier(brand);
  const pc = partnerCode(brand, registration_scope);
  const cc = circleCode(circle);
  const yymm = toYYMM(cycle_month);
  if (!brand || !cc || !yymm) return null;
  const s = seq != null ? String(seq).padStart(2, "0") : "NN";
  return `${ident}${pc}${yymm}${cc}${s}`;
}

export function isValidSdpId(id) {
  return SDP_ID_REGEX.test(String(id || "").trim());
}

/** Argumen untuk RPC generate_sdp_id (server). */
export function generateArgs(row) {
  return {
    p_brand: row.brand,
    p_scope: row.registration_scope,
    p_circle: row.circle,
    p_cycle_month: row.cycle_month || row.submission_month,
    // p_seq dikirim hanya untuk pasangan hybrid (memakai seq yang sama).
  };
}
