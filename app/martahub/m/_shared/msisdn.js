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

// Ekstraksi & konversi nomor dari payload QR kartu SIM ke format wajib-62 di
// atas. QR fisik kartu SIM biasanya berisi "08xxxxxxxxxx" (kadang diikuti
// "|<info lain>" spt IMEI, yg diabaikan sepenuhnya) - BUKAN "62xxx" - jadi
// hasil scan mentah tidak akan pernah lolos isValidMsisdn() tanpa dikonversi
// dulu. Konversi ini KHUSUS utk hasil scan kamera; input manual tetap wajib
// diketik "62..." sendiri oleh DSF (perilaku itu sengaja tidak diubah).
export function msisdnFromQrPayload(raw) {
  const str = String(raw ?? "");
  const phonePart = str.includes("|") ? str.slice(0, str.indexOf("|")) : str;
  const digits = phonePart.replace(/\D/g, "");
  const m = digits.match(/(?:62|0)8\d{8,10}/);
  if (!m) return null;
  let d = m[0];
  if (d.startsWith("0")) d = "62" + d.slice(1);
  return normalizeMsisdn(d);
}
