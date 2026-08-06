// Pemetaan status → label/warna, DISAMAKAN dengan app Flutter
// (lib/core/constants/app_colors.dart + activity_list_screen.dart) supaya
// bahasa visual status konsisten lintas platform selama migrasi berjalan.

export const STATUS_META = {
  draft:               { label: "Draft",                    color: "#6B7280", bg: "rgba(107,114,128,0.10)" },
  plan_submitted:       { label: "Menunggu Approval Plan",    color: "#B45309", bg: "rgba(180,83,9,0.10)" },
  revision_needed:      { label: "Revisi Plan",               color: "#B45309", bg: "rgba(180,83,9,0.10)" },
  approved:              { label: "Disetujui",                 color: "#15803D", bg: "rgba(21,128,61,0.10)" },
  submitted:             { label: "Menunggu Approval Report",  color: "#2563EB", bg: "rgba(37,99,235,0.10)" },
  pending_validation:    { label: "Menunggu Validasi",         color: "#2563EB", bg: "rgba(37,99,235,0.10)" },
  revision_actual:       { label: "Revisi Report",             color: "#B45309", bg: "rgba(180,83,9,0.10)" },
  rejected:              { label: "Ditolak",                   color: "#DC2626", bg: "rgba(220,38,38,0.10)" },
  in_progress:           { label: "Berjalan",                  color: "#2563EB", bg: "rgba(37,99,235,0.10)" },
  done:                  { label: "Selesai",                   color: "#15803D", bg: "rgba(21,128,61,0.10)" },
};

export function statusMeta(status) {
  return STATUS_META[status] || { label: status || "—", color: "#6B7280", bg: "rgba(107,114,128,0.10)" };
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];

export function fmtDate(s) {
  if (!s || s.length < 10) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d} ${MONTHS[(+m || 1) - 1]} ${y}`;
}

export function fmtInt(n) {
  if (n == null) return "0";
  return Number(n).toLocaleString("id-ID");
}

export function fmtRp(n) {
  if (n == null) return "Rp 0";
  return `Rp ${Number(n).toLocaleString("id-ID")}`;
}
