/**
 * lib/sdp/lists.js
 * Enum/daftar pilihan SDP — sumber: sheet `04_Lists` template HQ.
 * Dipakai bersama oleh form mobile (SDP_QuickForm) & paste grid (SDP_BulkGrid)
 * agar dropdown & validasi konsisten dengan HQ. Nilai sudah di-trim.
 */

export const SDP_LISTS = {
  request_type:          ["New", "Update", "Terminate", "Remapping", "Hybrid Pairing"],
  registration_scope:    ["IM3 only", "3ID only", "Hybrid IM3+3ID", "Hybrid IM3 Single", "Hybrid 3ID Single"],
  company_type:          ["Individual", "PT", "CV", "Other Business Entity"],
  status_company:        ["New", "Existing"],
  submission_status:     ["Draft", "Submitted", "Need Revision", "Validated", "Registered", "Hold", "Rejected"],
  doc_status:            ["Complete", "Missing", "N/A"],
  commitment_fee_status: ["Not Yet", "Paid", "Not Required", "Need Confirmation"],
  pnl_status:            ["Completed", "Not Yet", "Need Revision", "N/A"],
  evaluation_status:     ["Completed", "Not Yet", "Need Revision", "N/A"],
  evaluation_result:     ["Healthy", "Watchlist", "Critical", "Need Data Validation", "N/A"],
  status_hybrid:         ["Partner Only", "Hybrid Full", "DSE Still Not Hybrid", "BSM Still Not Hybrid", "HOS/HOR Still Not Hybrid"],
  hybrid_type:           ["Not Hybrid", "Hybrid Full", "Hybrid Single IM3", "Hybrid Single 3ID"],
  yes_no:                ["Yes", "No"],
  branding_status:       ["Aligned", "Need Update", "Mismatch", "Pending Decision", "N/A"],
  hq_validation_status:  ["Not Reviewed", "Validated", "Need Revision", "Hold", "Rejected"],
  system_account_status: ["Not Started", "Requested", "Created", "Need Revision", "Hold", "N/A"],
  id_validation_status:  ["Not Yet", "Validated", "Mismatch", "Need Revision"],
  final_registration_status: ["Draft", "On Progress", "Need Revision", "Hold", "Registered", "Rejected"],
  po_status:             ["Not Yet", "Created", "N/A"],
  payment_status:        ["Not Yet", "Paid", "N/A"],
  circle:                ["Sumatera", "Jakarta Raya", "Java", "Kalisumapa", "National"],
  brand:                 ["IM3", "3ID"],
  termination_reason:    ["Partner Resign", "Hybrid", "Partner Fired"],
  return_kecamatan:      ["Back to MPx", "Move to Other SDP", "Empty", "Re-Mapped"],
};

// Status internal batch/baris di web (bukan kolom HQ).
export const ROW_STATUS = ["draft", "submitted", "validated", "rejected"];

// Role yang termasuk fitur Form SDP (Tahap 1: Sumatera).
export const SDP_FORM_ROLES = ["cse_rse", "bsm", "pic_region", "spm_sumatera"];
export const SDP_EXPORT_ROLES = ["pic_region", "spm_sumatera"];

export default SDP_LISTS;
