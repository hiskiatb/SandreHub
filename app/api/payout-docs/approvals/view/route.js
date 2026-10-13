// POST /api/payout-docs/approvals/view — detail 1 request untuk halaman /payout-approval/[id] (wajib login).
import {
  APPROVALS_TABLE, ROW_COLS, getAdmin, requireUser, jsonError, expireIfNeeded, canSeeApproval, signFiles, normEmail, publicRow,
} from "../../../../../lib/payoutDocApprovalsServer";

export async function POST(req) {
  const admin = getAdmin();
  if (!admin) return jsonError("Server configuration is incomplete (Supabase service role).", 500);
  const auth = await requireUser(req, admin);
  if (auth.error) return jsonError(auth.error, auth.status);
  const { id } = await req.json().catch(() => ({}));
  const { data: found, error } = await admin.from(APPROVALS_TABLE).select(ROW_COLS).eq("id", Number(id)).maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!found || !canSeeApproval(auth, found)) return jsonError("This request is assigned to another approver.", 403);
  const row = await expireIfNeeded(admin, found);
  const isApprover = auth.email === normEmail(row.approver_email);
  const files = await signFiles(admin, row.files);
  return Response.json({
    row: publicRow(row), files, isApprover,
    canDecide: isApprover && row.status === "pending",
    viewerEmail: auth.email,
  });
}
