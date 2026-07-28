/**
 * lib/sdp/hqExport.js
 * Adaptor export → format spreadsheet HQ (sheet 01_SDP_Registration).
 * ATURAN: hanya kolom yang diisi manusia yang diekspor; kolom formula
 * (Need SAP/Oracle, Final Status) & kolom milik HQ (HQ Validation, dsb)
 * DIBIARKAN KOSONG agar formula/proses HQ tidak tertimpa saat di-paste.
 *
 * Layout default ini = "profil format HQ" bawaan. Bila template HQ berubah,
 * profil bisa di-override dari tabel sdp_export_profile (Fase 4b / task #17).
 */

// Urutan & header MENGIKUTI sheet 01_SDP_Registration. field=null → kolom
// formula/HQ → selalu kosong.
export const HQ_LAYOUT_REGISTRATION = [
  { header: "SDP ID (New)", field: "sdp_id_new" },
  { header: "Pairing ID", field: "pairing_id" },
  { header: "Brand", field: "brand" },
  { header: "Submission Month", field: "submission_month", fmt: "month" },
  { header: "Submission Date", field: "submission_date" },
  { header: "Request Type", field: "request_type" },
  { header: "Registration Scope", field: "registration_scope" },
  { header: "Circle", field: "circle" },
  { header: "Region", field: "region" },
  { header: "Branch", field: "branch" },
  { header: "SDP Name", field: "sdp_name" },
  { header: "Partner / Company Name", field: "partner_company_name" },
  { header: "Customer Legal Name", field: "customer_legal_name" },
  { header: "Company Type", field: "company_type" },
  { header: "Status Company", field: "status_company" },
  { header: "KTP Number", field: "ktp_number" },
  { header: "NPWP Number", field: "npwp_number" },
  { header: "PIC Name Partner", field: "pic_name_partner" },
  { header: "PIC Phone Number", field: "pic_phone_number" },
  { header: "MSISDN MASTER TRX", field: "msisdn_master_trx" },
  { header: "PIC Email Partner", field: "pic_email_partner" },
  { header: "Email PIC IOH", field: "email_pic_ioh" },
  { header: "Kab/Kota", field: "kabupaten" },
  { header: "Kecamatan Coverage", field: "kecamatan_coverage" },
  { header: "Bill To Address", field: "bill_to_address" },
  { header: "Ship To Address", field: "ship_to_address" },
  { header: "Kode Pos", field: "kode_pos" },
  { header: "Need SAP Creation?", field: null },          // formula HQ
  { header: "Need Oracle Creation?", field: null },        // formula HQ
  { header: "Hybrid Type", field: "hybrid_type" },
  { header: "CSE Name", field: "cse_name" },
  { header: "CSE Partner ID", field: "cse_partner_id" },
  { header: "CSE Number", field: "cse_number" },
  { header: "Bank Name", field: "bank_name" },
  { header: "Bank Branch / KCP", field: "bank_branch_kcp" },
  { header: "Bank Account Number", field: "bank_account_number" },
  { header: "Bank Account Name", field: "bank_account_name" },
  { header: "Commitment Fee Status", field: "commitment_fee_status" },
  { header: "Main Document Folder Link", field: "main_document_folder_link" },
  { header: "Branding Update Required?", field: "branding_update_required" },
  { header: "Branding Status", field: "branding_status" },
  { header: "Circle Submit Status", field: null },         // status/auto
  { header: "HQ Validation Status", field: null },         // milik HQ
  { header: "Final Registration Status", field: null },    // formula HQ
  { header: "Remarks", field: "remarks" },
];

const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
// '2026-07' | 'Jul-2026' → 'Jul-2026'
export function fmtSubmissionMonth(v) {
  if (!v) return "";
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})/);
  if (m) return `${MON[(+m[2] || 1) - 1]}-${m[1]}`;
  return s;
}

const clean = (v) => String(v ?? "").replace(/[\t\r\n]+/g, " ").trim();

/** Nilai satu sel export untuk kolom layout tertentu. */
export function cellValue(row, col) {
  if (!col.field) return "";            // kolom formula/HQ → kosong
  let v = row[col.field];
  if (col.fmt === "month") v = fmtSubmissionMonth(v);
  return clean(v);
}

/** Matrix [ [header...], [rowVals...], ... ] siap jadi TSV/xlsx. */
export function buildMatrix(rows, layout = HQ_LAYOUT_REGISTRATION) {
  const head = layout.map((c) => c.header);
  const body = (rows || []).map((r) => layout.map((c) => cellValue(r, c)));
  return [head, ...body];
}

/** Blok TSV siap-paste ke spreadsheet HQ. */
export function buildTSV(rows, layout = HQ_LAYOUT_REGISTRATION) {
  return buildMatrix(rows, layout).map((r) => r.join("\t")).join("\n");
}
