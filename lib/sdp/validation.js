/**
 * lib/sdp/validation.js
 * Util validasi field SDP + formula auto (Need SAP/Oracle) + validator baris
 * registrasi. Dipakai bersama form mobile & paste grid untuk validasi inline.
 */
import { SDP_LISTS } from "./lists";
import { isHybridScope, circleCode, toYYMM } from "./idFormat";

// ── Validator primitif ────────────────────────────────────────────────────────
export const isBlank   = (v) => v == null || String(v).trim() === "";
export const digits    = (v) => String(v ?? "").replace(/\D/g, "");
export const isKTP     = (v) => /^\d{16}$/.test(digits(v));                 // NIK 16 digit
export const isNPWP    = (v) => [15, 16].includes(digits(v).length);        // NPWP 15/16 digit
export const isEmail   = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
export const isPhoneID = (v) => { const d = digits(v); return /^(0|62)/.test(d) && d.length >= 9 && d.length <= 15; };
export const inList    = (v, key) => (SDP_LISTS[key] || []).includes(String(v || "").trim());
export const isUrl     = (v) => /^https?:\/\/\S+\.\S+/.test(String(v || "").trim());       // link http(s) valid

// ── Formula auto (mirror §10) ──────────────────────────────────────────────────
export function needSap(scope)    { const s = String(scope || ""); return /IM3/i.test(s) ? "Ya" : "Tidak"; }
export function needOracle(scope) { const s = String(scope || ""); return /3ID/i.test(s) ? "Ya" : "Tidak"; }

// ── Aturan wajib untuk registrasi (per baris) ──────────────────────────────────
// Field kunci minimal agar ID bisa di-generate & data bermakna.
const REQUIRED = ["brand", "registration_scope", "circle", "region", "branch", "sdp_name", "partner_company_name"];

/**
 * Validasi satu baris registrasi.
 * @returns {{ valid: boolean, errors: Record<string,string> }}
 * errors dikunci per field key (cocok dengan REG_FIELDS.k).
 */
export function validateRegistrationRow(row = {}) {
  const e = {};

  // Wajib
  for (const k of REQUIRED) if (isBlank(row[k])) e[k] = "Wajib diisi.";

  // Circle harus dikenal (untuk kode ID)
  if (!isBlank(row.circle) && !circleCode(row.circle)) e.circle = "Circle tidak dikenal (untuk kode SDP ID).";

  // Bulan siklus → butuh format terbaca
  const cyc = row.cycle_month || row.submission_month;
  if (isBlank(cyc)) e.cycle_month = "Bulan siklus wajib (sumber YYMM ID).";
  else if (!toYYMM(cyc)) e.cycle_month = "Format bulan tidak dikenali (pakai mis. 'Jul-2026').";

  // Enum
  if (!isBlank(row.request_type)       && !inList(row.request_type, "request_type"))             e.request_type = "Pilihan tidak valid.";
  if (!isBlank(row.registration_scope) && !inList(row.registration_scope, "registration_scope")) e.registration_scope = "Pilihan tidak valid.";
  if (!isBlank(row.company_type)       && !inList(row.company_type, "company_type"))              e.company_type = "Pilihan tidak valid.";
  if (!isBlank(row.status_company)     && !inList(row.status_company, "status_company"))          e.status_company = "Pilihan tidak valid.";
  if (!isBlank(row.commitment_fee_status) && !inList(row.commitment_fee_status, "commitment_fee_status")) e.commitment_fee_status = "Pilihan tidak valid.";

  // Format identitas & kontak (jika diisi)
  if (!isBlank(row.ktp_number)       && !isKTP(row.ktp_number))         e.ktp_number = "KTP/NIK harus 16 digit.";
  if (!isBlank(row.npwp_number)      && !isNPWP(row.npwp_number))       e.npwp_number = "NPWP harus 15/16 digit.";
  if (!isBlank(row.pic_email_partner)&& !isEmail(row.pic_email_partner))e.pic_email_partner = "Email tidak valid.";
  if (!isBlank(row.email_pic_ioh)    && !isEmail(row.email_pic_ioh))    e.email_pic_ioh = "Email tidak valid.";
  if (!isBlank(row.pic_phone_number) && !isPhoneID(row.pic_phone_number)) e.pic_phone_number = "Nomor telepon tidak valid (08.. / 62..).";

  // Link dokumen: harus berupa URL (tempel link folder OneDrive yang disediakan)
  if (!isBlank(row.main_document_folder_link) && !isUrl(row.main_document_folder_link)) e.main_document_folder_link = "Tempel link folder OneDrive yang valid (mis. https://...).";

  // Kondisional Hybrid
  if (isHybridScope(row.registration_scope)) {
    if (isBlank(row.pairing_id))  e.pairing_id  = "Wajib untuk Hybrid/Pairing.";
    if (isBlank(row.hybrid_type)) e.hybrid_type = "Wajib untuk Hybrid.";
  }

  return { valid: Object.keys(e).length === 0, errors: e };
}

/**
 * Isi otomatis field turunan (formula) pada baris - dipanggil sebelum simpan.
 * Tidak menimpa nilai yang sudah diisi manual, kecuali need_sap/need_oracle.
 */
export function applyDerived(row = {}) {
  const out = { ...row };
  out.need_sap_creation    = needSap(row.registration_scope);
  out.need_oracle_creation = needOracle(row.registration_scope);
  return out;
}
