// lib/payoutDocApprovalsServer.js
// SERVER ONLY — dipakai oleh app/api/payout-docs/approvals/*. Jangan di-import dari komponen client.
// Approval berbasis login untuk BAST & Surat Pemberitahuan (Notification Letter) di Payout Tracker.
// Sengaja TIDAK memakai lib/resend.js (modul itu log API key & throw saat import).
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  DOC_TYPES, DOC_REF_LABEL, DOCS_BUCKET, DOCS_TABLE, partnerKey, refKey, canViewPartner,
} from "./payoutPartnerDocs";

export const APPROVALS_TABLE = "payout_doc_approvals";
export const APPROVAL_DOC_TYPES = ["bast", "surat_pemberitahuan"];
export const TTL_DAYS = 7;

const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/;
export const normEmail = (s) => String(s || "").trim().toLowerCase();
export const isEmail = (s) => normEmail(s).length <= 254 && EMAIL_RE.test(normEmail(s));
export const docLabel = (key) => DOC_TYPES.find((d) => d.key === key)?.label || key;
export const jsonError = (message, status = 400) => Response.json({ error: message }, { status });

// Lazy: jangan createClient di top-level (build tanpa env akan crash)
export function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// ── Auth ───────────────────────────────────────────────────────────────────
export async function requireUser(req, admin) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: "Please sign in to continue.", status: 401 };
  const { data: { user } = {}, error } = await admin.auth.getUser(token);
  if (error || !user) return { error: "Your session has expired. Please sign in again.", status: 401 };
  const { data: profile } = await admin.from("profiles").select("role, partner_name, full_name, email").eq("id", user.id).maybeSingle();
  return { user, profile: profile || {}, email: normEmail(user.email) };
}

export async function requireSpm(req, admin) {
  const a = await requireUser(req, admin);
  if (a.error) return a;
  if (a.profile.role !== "spm_sumatera") return { error: "Only SPM can manage approval requests.", status: 403 };
  return a;
}

// ── Data ───────────────────────────────────────────────────────────────────
export async function slotDocs(admin, { segment, owner_key, ref_id, doc_type }) {
  const { data, error } = await admin.from(DOCS_TABLE)
    .select("id, file_name, size_bytes, storage_path, uploaded_at")
    .eq("segment", segment === "agency" ? "agency" : "partner")
    .eq("partner_key", owner_key).eq("ref_id", ref_id).eq("doc_type", doc_type)
    .order("uploaded_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function sha256Of(admin, storagePath) {
  const { data, error } = await admin.storage.from(DOCS_BUCKET).download(storagePath);
  if (error) throw new Error(`Unable to read ${storagePath}: ${error.message}`);
  return crypto.createHash("sha256").update(Buffer.from(await data.arrayBuffer())).digest("hex");
}

// Snapshot audit saat request: metadata + SHA-256 tiap file di slot
export async function snapshotFiles(admin, docs) {
  const out = [];
  for (const d of docs) {
    out.push({ doc_id: d.id, file_name: d.file_name, size: Number(d.size_bytes) || 0, storage_path: d.storage_path, sha256: await sha256Of(admin, d.storage_path) });
  }
  return out;
}

// Bandingkan snapshot vs isi slot sekarang (file hilang, bertambah, atau isinya berubah)
export async function verifySnapshot(admin, row) {
  const current = await slotDocs(admin, row);
  const snap = Array.isArray(row.files) ? row.files : [];
  if (current.length !== snap.length) return false;
  for (const f of snap) {
    const cur = current.find((c) => c.id === f.doc_id);
    if (!cur || cur.storage_path !== f.storage_path) return false;
    if ((await sha256Of(admin, f.storage_path)) !== f.sha256) return false;
  }
  return true;
}

export async function signFiles(admin, files, secs = 3600) {
  return Promise.all((files || []).map(async (f) => {
    const { data } = await admin.storage.from(DOCS_BUCKET).createSignedUrl(f.storage_path, secs);
    const { data: dl } = await admin.storage.from(DOCS_BUCKET).createSignedUrl(f.storage_path, secs, { download: f.file_name || true });
    return { doc_id: f.doc_id, file_name: f.file_name, size: f.size, sha256: f.sha256, url: data?.signedUrl || null, download_url: dl?.signedUrl || null };
  }));
}

// Normalisasi 1 item request dari client
export function normalizeItem(it) {
  const segment = it?.segment === "agency" ? "agency" : "partner";
  const owner_name = String(it?.owner_name || "").trim().slice(0, 200);
  const owner_key = partnerKey(owner_name);
  const ref_id = refKey(it?.ref_id).slice(0, 120);
  const doc_type = String(it?.doc_type || "");
  if (!owner_key || !ref_id || !APPROVAL_DOC_TYPES.includes(doc_type)) return null;
  return {
    segment, owner_key, owner_name, ref_id, doc_type,
    ref_title: String(it?.ref_title || "").slice(0, 300) || null,
    amount_text: String(it?.amount_text || "").slice(0, 60) || null,
  };
}

// Pending yang sudah lewat expires_at → 'expired' (lazy)
export async function expireIfNeeded(admin, row) {
  if (row?.status === "pending" && new Date(row.expires_at) < new Date()) {
    const { data } = await admin.from(APPROVALS_TABLE).update({ status: "expired" }).eq("id", row.id).eq("status", "pending").select().maybeSingle();
    return data || { ...row, status: "expired" };
  }
  return row;
}

// Siapa yang boleh melihat 1 approval: approver yang ditunjuk, atau user yang boleh melihat pemiliknya
export function canSeeApproval(auth, row) {
  if (!row) return false;
  if (auth.email && auth.email === normEmail(row.approver_email)) return true;
  return canViewPartner(auth.profile, row.owner_name || row.owner_key, row.segment);
}

export function appUrl(req) {
  const env = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  if (env) return env;
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  return host ? `${proto}://${host}` : "";
}

// ── Email ──────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtSize = (b) => (b < 1048576 ? `${Math.max(1, Math.round((b || 0) / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
export const fmtDate = (d) => new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) + " WIB";

export function approvalEmail({ row, link, requester, reminder = false }) {
  const label = docLabel(row.doc_type);
  const owner = row.owner_name || row.owner_key;
  const subject = `${reminder ? "Reminder: " : ""}Approval required — ${label} · ${DOC_REF_LABEL} ${row.ref_id} · ${owner}`;
  const meta = [
    [DOC_REF_LABEL, row.ref_id],
    [row.segment === "agency" ? "Agency" : "Partner", owner],
    ...(row.ref_title ? [["Project", row.ref_title]] : []),
    ...(row.amount_text ? [["Amount", row.amount_text]] : []),
    ["Document", label],
    ["Requested by", requester],
    ["Respond by", fmtDate(row.expires_at)],
  ];
  const files = Array.isArray(row.files) ? row.files : [];
  const fileRows = files.map((f) => `<tr><td style="padding:6px 0;border-top:1px solid #eee;font-weight:600">${esc(f.file_name)}</td><td style="padding:6px 0;border-top:1px solid #eee;text-align:right;color:#888;font-size:12px">${fmtSize(f.size)}</td></tr>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f2f2f6;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e5ea">
<tr><td style="height:6px;background:#C6168D"></td></tr>
<tr><td style="padding:24px 28px 8px">
  <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#C6168D;font-weight:700">SandraHub · Payout Tracker</div>
  <h1 style="font-size:20px;margin:8px 0 4px">${reminder ? "Reminder: your approval is still required" : "Your approval is required"}</h1>
  <p style="margin:0;color:#555;font-size:14px;line-height:1.5">Please review the <b>${esc(label)}</b> for ${esc(DOC_REF_LABEL)} <b>${esc(row.ref_id)}</b> and approve or reject it in SandraHub.</p>
</td></tr>
<tr><td style="padding:12px 28px">
  <table role="presentation" width="100%" style="font-size:14px">${meta.map(([k, v]) => `<tr><td style="padding:4px 0;color:#888;width:140px">${esc(k)}</td><td style="padding:4px 0;font-weight:600">${esc(v)}</td></tr>`).join("")}</table>
</td></tr>
${row.note ? `<tr><td style="padding:4px 28px 8px"><div style="background:#f7f7fa;border-left:3px solid #32BCAD;padding:10px 12px;font-size:13px;color:#333"><b>Note from SPM:</b> ${esc(row.note)}</div></td></tr>` : ""}
<tr><td style="padding:8px 28px"><div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Documents (${files.length})</div>
  <table role="presentation" width="100%" style="font-size:14px">${fileRows || '<tr><td style="color:#888">No files</td></tr>'}</table>
</td></tr>
<tr><td align="center" style="padding:20px 28px 8px">
  <a href="${esc(link)}" style="display:inline-block;background:#32BCAD;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:10px">Review &amp; Decide in SandraHub</a>
</td></tr>
<tr><td style="padding:8px 28px 24px;font-size:12px;color:#888;line-height:1.55">
  Sign in to SandraHub with <b>${esc(row.approver_email)}</b> to view the documents and record your decision. Opening this email or link does not approve anything.
  If you do not have a SandraHub account, please contact SPM to request access.<br>
  Link: <span style="color:#1d8078;word-break:break-all">${esc(link)}</span>
</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${reminder ? "Reminder: " : ""}Your approval is required for ${label}.\n\n${meta.map(([k, v]) => `${k}: ${v}`).join("\n")}\n${row.note ? `\nNote from SPM: ${row.note}\n` : ""}\nDocuments:\n${files.map((f) => `- ${f.file_name}`).join("\n") || "- none"}\n\nReview & decide in SandraHub (sign in with ${row.approver_email}): ${link}\nNo SandraHub account? Please contact SPM to request access.`;
  return { subject, html, text };
}

export async function sendEmail({ to, subject, html, text }) {
  if (!process.env.RESEND_API_KEY || !process.env.SENDER_EMAIL) throw new Error("Email service is not configured (RESEND_API_KEY / SENDER_EMAIL).");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({ from: process.env.SENDER_EMAIL, to: [to], subject, html, text });
  if (error) throw new Error(error.message || "The email could not be sent.");
  return data?.id || null;
}

export const approvalLink = (req, id) => `${appUrl(req)}/payout-approval/${id}`;

// Kolom yang dikirim ke browser
export const ROW_COLS = "id, segment, owner_key, owner_name, ref_id, doc_type, files, ref_title, amount_text, approver_email, note, requested_by, requested_email, requested_at, expires_at, status, decided_by, decided_email, decided_at, decision_note, closed_by, closed_email, closed_at, close_reason, reminder_count, last_reminded_at";

// Buang storage_path dari files sebelum dikirim ke browser
export const publicRow = (row) => row && ({ ...row, files: (row.files || []).map(({ storage_path: _p, ...f }) => f) });
