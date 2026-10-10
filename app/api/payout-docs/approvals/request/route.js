// POST /api/payout-docs/approvals/request — SPM meminta approval (1 atau banyak slot) ke 1 email approver.
import {
  APPROVALS_TABLE, TTL_DAYS, ROW_COLS, getAdmin, requireApprovalAdmin, jsonError, normEmail, isEmail, normalizeItem,
  slotDocs, snapshotFiles, approvalEmail, approvalLink, sendEmail, docLabel, publicRow,
} from "../../../../../lib/payoutDocApprovalsServer";

export async function POST(req) {
  const admin = getAdmin();
  if (!admin) return jsonError("Server configuration is incomplete (Supabase service role).", 500);
  const auth = await requireApprovalAdmin(req, admin);
  if (auth.error) return jsonError(auth.error, auth.status);

  let body;
  try { body = await req.json(); } catch { return jsonError("Invalid request."); }
  const approver = normEmail(body?.approver_email);
  if (!isEmail(approver)) return jsonError("Please enter a valid approver email address.");
  const note = String(body?.note || "").trim().slice(0, 1000) || null;
  const items = (Array.isArray(body?.items) ? body.items : []).slice(0, 200).map(normalizeItem).filter(Boolean);
  if (!items.length) return jsonError("No valid documents were selected.");

  const requester = auth.profile.full_name || auth.email || "SPM";
  const results = [];
  for (const it of items) {
    const slot = { segment: it.segment, owner_key: it.owner_key, ref_id: it.ref_id, doc_type: it.doc_type };
    const label = `${it.ref_id} · ${docLabel(it.doc_type)}`;
    try {
      const docs = await slotDocs(admin, slot);
      if (!docs.length) { results.push({ ...slot, ok: false, error: `${label}: no files uploaded yet.` }); continue; }

      const { data: latest, error: lErr } = await admin.from(APPROVALS_TABLE).select("id, status")
        .match(slot).order("requested_at", { ascending: false }).limit(1).maybeSingle();
      if (lErr) throw lErr;
      if (latest?.status === "approved") {
        results.push({ ...slot, ok: false, error: `${label}: already approved. Revoke the approval first to request a new one.` });
        continue;
      }

      const now = new Date().toISOString();
      await admin.from(APPROVALS_TABLE)
        .update({ status: "cancelled", closed_by: auth.user.id, closed_email: auth.email, closed_at: now, close_reason: "Superseded by a new request" })
        .match(slot).eq("status", "pending");

      const files = await snapshotFiles(admin, docs);
      const { data: row, error } = await admin.from(APPROVALS_TABLE).insert({
        ...it, files, approver_email: approver, note,
        requested_by: auth.user.id, requested_email: auth.email, requested_at: now,
        expires_at: new Date(Date.now() + TTL_DAYS * 864e5).toISOString(),
      }).select(ROW_COLS).single();
      if (error) throw error;

      try {
        await sendEmail({ to: approver, ...approvalEmail({ row, link: approvalLink(req, row.id), requester }) });
        results.push({ ...slot, ok: true, id: row.id, row: publicRow(row) });
      } catch (e) {
        // request tetap tercatat; SPM bisa klik Remind untuk kirim ulang
        results.push({ ...slot, ok: true, id: row.id, row: publicRow(row), emailError: e.message });
      }
    } catch (e) {
      results.push({ ...slot, ok: false, error: `${label}: ${e.message || e}` });
    }
  }
  return Response.json({ results });
}
