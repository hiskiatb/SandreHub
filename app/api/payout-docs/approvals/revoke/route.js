// POST /api/payout-docs/approvals/revoke — SPM mencabut approval (membuka kunci dokumen). Alasan wajib.
import { APPROVALS_TABLE, ROW_COLS, getAdmin, requireApprovalAdmin, jsonError, publicRow } from "../../../../../lib/payoutDocApprovalsServer";

export async function POST(req) {
  const admin = getAdmin();
  if (!admin) return jsonError("Server configuration is incomplete (Supabase service role).", 500);
  const auth = await requireApprovalAdmin(req, admin);
  if (auth.error) return jsonError(auth.error, auth.status);
  const { id, reason } = await req.json().catch(() => ({}));
  const why = String(reason || "").trim().slice(0, 500);
  if (why.length < 3) return jsonError("Please provide a reason for revoking this approval.");
  const { data: row, error } = await admin.from(APPROVALS_TABLE).update({
    status: "revoked", closed_by: auth.user.id, closed_email: auth.email, closed_at: new Date().toISOString(), close_reason: why,
  }).eq("id", Number(id)).eq("status", "approved").select(ROW_COLS).maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!row) return jsonError("Only approved requests can be revoked.", 409);
  return Response.json({ row: publicRow(row) });
}
