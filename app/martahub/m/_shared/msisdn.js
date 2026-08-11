// Util MSISDN - SAMA PERSIS dgn activity_provider.dart (Flutter) supaya
// aturan format/validasi satu sumber kebenaran lintas platform.
//
// WAJIB diawali "62" saja - TIDAK ada lagi auto-convert dari "0xxx" spt
// sebelumnya, supaya format yg tersimpan konsisten & sesuai standar
// internasional (permintaan eksplisit: "wajib diawali 62 aja").
const MSISDN_RE = /^62[0-9]{8,13}$/;

export function isValidMsisdn(s) { return MSISDN_RE.test((s || "").trim()); }

export function normalizeMsisdn(raw) {
  return (raw || "").trim().replace(/[\s-]/g, "");
}
