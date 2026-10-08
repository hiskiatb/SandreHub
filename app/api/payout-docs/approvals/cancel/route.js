// POST /api/payout-docs/approvals/cancel — SPM membatalkan request yang masih pending.
import { APPROVALS_TABLE, ROW_COLS, getAdmin, requireSpm, jsonError, publicRow } from "../../../../../lib/payoutDocApprovalsServer";

export async function POST(req) {
  const admin = getAdmin();
  if (!admin) return jsonError("Server configuration is incomplete (Supabase service role).", 500);
  const auth = await requireSpm(req, admin);
  if (auth.error) return jsonError(auth.error, auth.status);
  const { id, reason } = await req.json().catch(() => ({}));
  const { data: row, error } = await admin.from(APPROVALS_TABLE).update({
    status: "cancelled", closed_by: auth.user.id, closed_email: auth.email, closed_at: new Date().toISOString(),
    close_reason: String(reason || "").trim().slice(0, 500) || "Cancelled by SPM",
  }).eq("id", Number(id)).eq("status", "pending").select(ROW_COLS).maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!row) return jsonError("Only pending requests can be cancelled.", 409);
  return Response.json({ row: publicRow(row) });
}
