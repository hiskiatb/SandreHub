// POST /api/payout-docs/approvals/remind — SPM kirim ulang email & perpanjang batas waktu 7 hari.
import {
  APPROVALS_TABLE, TTL_DAYS, ROW_COLS, getAdmin, requireApprovalAdmin, jsonError, expireIfNeeded,
  approvalEmail, approvalLink, sendEmail, publicRow,
} from "../../../../../lib/payoutDocApprovalsServer";

export async function POST(req) {
  const admin = getAdmin();
  if (!admin) return jsonError("Server configuration is incomplete (Supabase service role).", 500);
  const auth = await requireApprovalAdmin(req, admin);
  if (auth.error) return jsonError(auth.error, auth.status);
  const { id } = await req.json().catch(() => ({}));
  const { data: found, error } = await admin.from(APPROVALS_TABLE).select(ROW_COLS).eq("id", Number(id)).maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!found) return jsonError("Approval request not found.", 404);
  if (found.status !== "pending") return jsonError(`This request is ${found.status}; only pending requests can be reminded.`, 409);

  const { data: row, error: uErr } = await admin.from(APPROVALS_TABLE).update({
    expires_at: new Date(Date.now() + TTL_DAYS * 864e5).toISOString(),
    reminder_count: (found.reminder_count || 0) + 1,
    last_reminded_at: new Date().toISOString(),
  }).eq("id", found.id).eq("status", "pending").select(ROW_COLS).maybeSingle();
  if (uErr) return jsonError(uErr.message, 500);
  if (!row) return jsonError("This request has just been decided.", 409);
  await expireIfNeeded(admin, row);
  try {
    await sendEmail({ to: row.approver_email, ...approvalEmail({ row, link: approvalLink(req, row.id), requester: auth.profile.full_name || auth.email, reminder: true }) });
  } catch (e) { return Response.json({ row: publicRow(row), emailError: e.message }); }
  return Response.json({ row: publicRow(row) });
}
