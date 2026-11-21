// POST /api/payout-docs/invoice-reminders
// Pengingat "Invoice Not Submitted" ke partner/agency (Payout Tracker).
// Hanya admin SPM & admin internal Indosat (APPROVAL_ADMIN_ROLES), dicek di sini (server).
//
// Sumber email = sheet "Master Mapping" di Excel yang di-upload admin (lihat readContactsSheet di
// PayoutTracker.jsx). Saat Publish, isinya disimpan ke tabel payout_partner_contacts (action "import").
//
// body.action:
//   "import"     { segments:["partner","agency"], contacts:[{segment, owner, to:[], cc:[], pic}] }
//                → ganti seluruh kontak untuk segment yang ada di file
//   "recipients" { segment, owners:[nama] } → kontak + pengingat terakhir per pemilik
//   "send"       { segment, note, items:[{owner, to:[], cc:[], invoices:[...]}] } → 1 email per pemilik
//
// Tabel: supabase/migrations/20261120_payout_invoice_reminders.sql
// Sengaja TIDAK memakai lib/resend.js (modul itu log API key & throw saat import).
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { partnerKey, APPROVAL_ADMIN_ROLES } from "../../../../lib/payoutPartnerDocs";
import {
  invoiceReminderEmail, cleanInvoiceItem, invKey, isEmail, normEmail, MAX_REMINDER_ITEMS, MAX_REMINDER_TO,
} from "../../../../lib/payoutInvoiceReminderEmail";

const CONTACTS_TABLE = "payout_partner_contacts";
const LOG_TABLE = "payout_invoice_reminders";
const MAX_OWNERS = 60;
const MAX_CONTACTS = 2000;
const SQL_HINT = "Tabel email partner belum dibuat di database (SQL 20261120_payout_invoice_reminders.sql).";

const jsonError = (message, status = 400) => Response.json({ error: message }, { status });
const seg = (s) => (s === "agency" ? "agency" : "partner");
const missingTable = (e) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message || ""));
const emails = (arr) => [...new Set((Array.isArray(arr) ? arr : []).map(normEmail).filter(isEmail))].slice(0, MAX_REMINDER_TO);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Service role bila ada (Vercel); bila tidak ada (localhost) pakai token user → tunduk ke RLS.
function clients(token) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon) return null;
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const asUser = createClient(url, anon, { ...opts, global: { headers: { Authorization: `Bearer ${token}` } } });
  return { asUser, db: svc ? createClient(url, svc, opts) : asUser };
}

async function requireReminderAdmin(req) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: "Please sign in to continue.", status: 401 };
  const c = clients(token);
  if (!c) return { error: "Server configuration is incomplete (Supabase).", status: 500 };
  const { data: { user } = {}, error } = await c.asUser.auth.getUser(token);
  if (error || !user) return { error: "Your session has expired. Please sign in again.", status: 401 };
  const { data: profile } = await c.db.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
  if (!APPROVAL_ADMIN_ROLES.includes(profile?.role)) return { error: "Hanya admin SPM atau admin internal Indosat yang bisa mengelola pengingat invoice.", status: 403 };
  return { db: c.db, user, profile, email: normEmail(user.email) };
}

function appUrl(req) {
  const env = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  if (env) return env;
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  return host ? `${proto}://${host}` : "";
}

// Ganti seluruh kontak untuk segment yang ada di file (baris lama dihapus setelah insert berhasil)
async function importContacts(auth, body) {
  const segments = [...new Set((body.segments || []).map(seg))];
  if (!segments.length) return jsonError("Tidak ada segment.");
  const byKey = new Map();
  (Array.isArray(body.contacts) ? body.contacts : []).slice(0, MAX_CONTACTS).forEach((c) => {
    const segment = seg(c?.segment), owner = String(c?.owner || "").trim().slice(0, 200), key = partnerKey(owner);
    if (!key || !segments.includes(segment)) return;
    const k = `${segment}:${key}`, prev = byKey.get(k);
    const to = emails([...(prev?.emails_to || []), ...(c.to || [])]);
    const cc = emails([...(prev?.emails_cc || []), ...(c.cc || [])]).filter((e) => !to.includes(e));
    if (!to.length && !cc.length) return;
    byKey.set(k, { segment, owner_key: key, owner_name: owner, emails_to: to, emails_cc: cc, pic: String(c?.pic || prev?.pic || "").slice(0, 200) || null,
      updated_by: auth.user.id, updated_email: auth.email, updated_at: new Date().toISOString() });
  });
  const rows = [...byKey.values()];
  const stamp = new Date().toISOString();
  if (rows.length) {
    const { error } = await auth.db.from(CONTACTS_TABLE).upsert(rows.map((r) => ({ ...r, updated_at: stamp })), { onConflict: "segment,owner_key" });
    if (error) return missingTable(error) ? jsonError(SQL_HINT, 409) : jsonError(error.message, 500);
  }
  // Pemilik yang tidak ada lagi di sheet → hapus
  const { error: dErr } = await auth.db.from(CONTACTS_TABLE).delete().in("segment", segments).lt("updated_at", stamp);
  if (dErr) return missingTable(dErr) ? jsonError(SQL_HINT, 409) : jsonError(dErr.message, 500);
  return Response.json({ ok: true, saved: rows.length });
}

async function recipients(auth, body) {
  const segment = seg(body.segment);
  const owners = [...new Set((body.owners || []).map((o) => String(o || "").trim()).filter(Boolean))].slice(0, 500);
  const keys = [...new Set(owners.map(partnerKey).filter(Boolean))];
  const ck = await auth.db.from(CONTACTS_TABLE).select("owner_key, emails_to, emails_cc, pic, updated_at").eq("segment", segment).in("owner_key", keys);
  if (ck.error) return missingTable(ck.error) ? Response.json({ owners: {}, contactsReady: false, logReady: false }) : jsonError(ck.error.message, 500);
  const contacts = Object.fromEntries((ck.data || []).map((r) => [r.owner_key, r]));

  let logReady = true;
  const last = {};
  const inv = {};   // owner_key → { invKey → { at, count } } : tagihan mana yang sudah pernah diingatkan
  const lg = await auth.db.from(LOG_TABLE).select("owner_key, sent_at, sent_by_name, invoices").eq("segment", segment).eq("status", "sent").in("owner_key", keys).order("sent_at", { ascending: false }).limit(3000);
  if (lg.error) logReady = false;
  else (lg.data || []).forEach((r) => {
    const l = (last[r.owner_key] ||= { count: 0, at: r.sent_at, by: r.sent_by_name || "" }); l.count++;
    const m = (inv[r.owner_key] ||= {});
    (Array.isArray(r.invoices) ? r.invoices : []).forEach((x) => { const k = invKey(x); const e = (m[k] ||= { count: 0, at: r.sent_at }); e.count++; });
  });

  const out = {};
  owners.forEach((o) => {
    const k = partnerKey(o), c = contacts[k];
    out[o] = { key: k, to: c?.emails_to || [], cc: c?.emails_cc || [], pic: c?.pic || "", last: last[k] || null, inv: inv[k] || {} };
  });
  return Response.json({ owners: out, contactsReady: true, logReady });
}

// Pengirim: sama dengan Report Merge / Smart Mail (env SENDER_EMAIL + SENDER_NAME, default
// snd@spmsumatera.site). SENDER_EMAIL boleh berupa alamat saja atau "Nama <alamat>".
const DEFAULT_SENDER_EMAIL = "snd@spmsumatera.site";
const DEFAULT_SENDER_NAME = "Sales & Distribution Sumatera";
function senderFrom() {
  const email = (process.env.SENDER_EMAIL || DEFAULT_SENDER_EMAIL).trim();
  if (email.includes("<")) return email;
  return `${(process.env.SENDER_NAME || DEFAULT_SENDER_NAME).trim()} <${email}>`;
}

async function send(auth, body, req) {
  if (!process.env.RESEND_API_KEY) return jsonError("Email service is not configured (RESEND_API_KEY).", 500);
  const segment = seg(body.segment);
  const note = String(body.note || "").trim().slice(0, 2000);
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, MAX_OWNERS);
  if (!items.length) return jsonError("Pilih minimal satu partner/agency.");
  const from = senderFrom();
  const resend = new Resend(process.env.RESEND_API_KEY);
  const senderName = auth.profile.full_name || "";
  const base = appUrl(req);
  const link = base ? `${base}/dashboard` : "";
  const results = [];
  let logReady = true;

  for (const it of items) {
    const owner = String(it?.owner || "").trim().slice(0, 200);
    const key = partnerKey(owner);
    const to = emails(it?.to);
    const cc = emails(it?.cc).filter((e) => !to.includes(e));
    const invoices = (Array.isArray(it?.invoices) ? it.invoices : []).slice(0, MAX_REMINDER_ITEMS).map(cleanInvoiceItem);
    if (!key || !to.length || !invoices.length) {
      results.push({ owner, ok: false, error: !to.length ? "Tidak ada email penerima." : "Tidak ada invoice." });
      continue;
    }
    const mail = invoiceReminderEmail({ segment, owner, items: invoices, note, senderName, link });
    let ok = true, error = null, id = null;
    try {
      const r = await resend.emails.send({
        from, to, ...(cc.length ? { cc } : {}), subject: mail.subject, html: mail.html, text: mail.text,
        ...(isEmail(auth.email) ? { replyTo: auth.email } : {}),
      });
      if (r?.error) { ok = false; error = r.error.message || "Email gagal dikirim."; } else id = r?.data?.id || null;
    } catch (e) { ok = false; error = e.message || "Email gagal dikirim."; }
    results.push({ owner, ok, error, to, cc });
    if (logReady) {
      const { error: lErr } = await auth.db.from(LOG_TABLE).insert({
        segment, owner_key: key, owner_name: owner, recipients: [...to, ...cc], invoices, note: note || null,
        invoice_count: invoices.length, total_amount: invoices.reduce((a, x) => a + x.amt, 0),
        status: ok ? "sent" : "failed", error, resend_id: id,
        sent_by: auth.user.id, sent_email: auth.email, sent_by_name: senderName || null,
      });
      if (lErr) logReady = false;
    }
    await sleep(600); // batas Resend ±2 email/detik
  }
  const sent = results.filter((r) => r.ok).length;
  return Response.json({ results, sent, failed: results.length - sent, logReady });
}

export async function POST(req) {
  const auth = await requireReminderAdmin(req);
  if (auth.error) return jsonError(auth.error, auth.status);
  const body = await req.json().catch(() => ({}));
  if (body.action === "import") return importContacts(auth, body);
  if (body.action === "recipients") return recipients(auth, body);
  if (body.action === "send") return send(auth, body, req);
  return jsonError("Unknown action.");
}
