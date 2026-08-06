// Util MSISDN - SAMA PERSIS dgn activity_provider.dart (Flutter) supaya
// aturan format/validasi satu sumber kebenaran lintas platform.
const MSISDN_RE = /^62[0-9]{8,13}$/;

export function isValidMsisdn(s) { return MSISDN_RE.test((s || "").trim()); }

// Kartu perdana fisik (scan QR/barcode) sering mencantumkan format lokal
// '08xxxxxxxxx' - dinormalisasi ke '62xxxxxxxxx' baik dari scan MAUPUN ketik
// manual, supaya tidak ada jalan buntu yang sama di kedua jalur.
export function normalizeMsisdn(raw) {
  const s = (raw || "").trim();
  if (s.startsWith("0")) return `62${s.substring(1)}`;
  return s;
}
