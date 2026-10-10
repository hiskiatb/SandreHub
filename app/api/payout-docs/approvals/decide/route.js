// POST /api/payout-docs/approvals/decide — approver (login, email cocok) menyetujui / menolak.
// Server menghitung ulang SHA-256 semua file; kalau berubah sejak request → ditolak.
import {
  APPROVALS_TABLE, ROW_COLS, getAdmin, requireUser, jsonError, expireIfNeeded, normEmail, verifySnapshot, publicRow,
} from "../../../../../lib/payoutDocApprovalsServer";

export async function POST(req) {
  const admin = getAdmin();
  if (!admin) return jsonError("Server configuration is incomplete (Supabase service role).", 500);
  const auth = await requireUser(req, admin);
  if (auth.error) return jsonError(auth.error, auth.status);
  const { id, decision, note } = await req.json().catch(() => ({}));
  if (!["approved", "rejected"].includes(decision)) return jsonError("Invalid decision.");
  const reason = String(note || "").trim().slice(0, 1000);
  if (decision === "rejected" && reason.length < 3) return jsonError("Please provide a reason for rejecting this request.");

  const { data: found, error } = await admin.from(APPROVALS_TABLE).select(ROW_COLS).eq("id", Number(id)).maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!found || auth.email !== normEmail(found.approver_email)) return jsonError("This request is assigned to another approver.", 403);
  const row = await expireIfNeeded(admin, found);
  if (row.status === "expired") return jsonError("This request has expired. Please ask SPM to send a reminder.", 409);
  if (row.status !== "pending") return jsonError(`This request has already been ${row.status}.`, 409);

  let unchanged = false;
  try { unchanged = await verifySnapshot(admin, row); } catch { unchanged = false; }
  if (!unchanged) return jsonError("The documents have changed since this request was sent. Please ask SPM to resend the request.", 409);

  const { data: saved, error: uErr } = await admin.from(APPROVALS_TABLE).update({
    status: decision, decided_by: auth.user.id, decided_email: auth.email,
    decided_at: new Date().toISOString(), decision_note: reason || null,
  }).eq("id", row.id).eq("status", "pending").select(ROW_COLS).maybeSingle();
  if (uErr) return jsonError(uErr.message, 500);
  if (!saved) return jsonError("This request has already been decided.", 409);
  return Response.json({ row: publicRow(saved) });
}
