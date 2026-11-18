// lib/payoutPartnerDocs.js
// Dokumen payout per referensi (sekarang PO Number, nanti Invoice ID) untuk Payout Tracker,
// Partner Prepaid & Agency Prepaid.
// Storage: bucket privat "payout-partner-docs", metadata: tabel payout_partner_docs.
// SQL: supabase/migrations/20261007_payout_partner_docs.sql + 20261007b_payout_docs_per_po.sql
import supabase from './supabase';

// ── Referensi dokumen ──────────────────────────────────────────────────────
// Ganti ke Invoice ID: ubah HANYA 2 konstanta ini,
// mis. ["Invoice ID","invoice id","Invoice No"] dan "Invoice ID".
export const DOC_REF_COLUMN = ['PO Number', 'po number', 'PO #'];
export const DOC_REF_LABEL  = 'PO Number';

// 4 slot dokumen, urutan = urutan merge
export const DOC_TYPES = [
  // key = nilai di DB (jangan diubah); label = teks UI (English)
  { key: 'invoicing',           label: 'Invoice (INV)',               short: 'INV'  },
  { key: 'bast',                label: 'Handover Certificate (BAST)', short: 'BAST' },
  { key: 'surat_pemberitahuan', label: 'Notification Letter (SP)',    short: 'SP'   },
  { key: 'faktur_pajak',        label: 'Tax Invoice (Faktur Pajak)',  short: 'FP'   },
];

export const DOCS_BUCKET    = 'payout-partner-docs';
export const DOCS_TABLE     = 'payout_partner_docs';
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB (sama dengan file_size_limit bucket)
export const ACCEPT_ATTR    = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

const VIEW_ALL_ROLES = ['spm_sumatera', 'internal_ioh', 'ioh_north_sumatera', 'ioh_central_sumatera', 'ioh_south_sumatera'];

// HARUS identik dengan public.payout_partner_key() di migration.
// "PT. Maju Jaya" / "Maju Jaya, PT" / "PT MAJU  JAYA" → "MAJU_JAYA"
export function partnerKey(name) {
  return String(name || '')
    .trim().toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*(PT|CV|TBK)\.?$/, '')
    .replace(/^(PT|CV|TBK)\.?\s+/, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Normalisasi nilai referensi (PO dari Excel bisa angka atau teks)
export const refKey = (v) => String(v ?? '').trim();

// ── Draft hasil generate (belum ada PO/Invoice) ────────────────────────────
// Disimpan dengan ref_id sintetis per partner × tipe × periode, mis. "GEN-2026-08-MPC".
// Tidak pernah muncul sebagai baris PO (data PO berasal dari Payout data, bukan tabel dokumen).
export const DRAFT_REF_PREFIX = 'GEN-';
const ID_MONTHS_SHORT = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const draftRef = (ym, type) => `${DRAFT_REF_PREFIX}${ym}-${String(type || '').toUpperCase()}`;
export const isDraftRef = (ref) => String(ref || '').startsWith(DRAFT_REF_PREFIX);
export function parseDraftRef(ref) {
  const m = String(ref || '').match(/^GEN-(\d{4})-(\d{2})-([A-Z0-9]+)$/);
  if (!m) return null;
  return { ym: `${m[1]}-${m[2]}`, type: m[3], label: `${ID_MONTHS_SHORT[+m[2] - 1] || m[2]} ${m[1]}` };
}

// ── Payment ID (pengganti PO untuk dokumen hasil generate) ─────────────────
// Format: PAY-<YYYYMM>-<TYPE>-<KODE PARTNER>-<NN>, mis. PAY-202608-MPC-UMJ-01.
//  • KODE PARTNER = inisial nama partner (tanpa PT/CV); bentrok dalam 1 batch → huruf kata pertama ditambah (UMJ → ULMJ).
//  • NN = urutan pembayaran/revisi untuk partner + type + periode yang sama (01, 02, …).
export const PAYMENT_REF_PREFIX = 'PAY-';
const PAY_RE = /^PAY-(\d{4})(\d{2})-([A-Z0-9]+)-([A-Z0-9]+)-(\d{2})$/;
export const isPaymentRef = (ref) => PAY_RE.test(String(ref || ''));
export function parsePaymentRef(ref) {
  const m = String(ref || '').match(PAY_RE);
  if (!m) return null;
  return { ym: `${m[1]}-${m[2]}`, type: m[3], code: m[4], nn: +m[5], label: `${ID_MONTHS_SHORT[+m[2] - 1] || m[2]} ${m[1]}`, paymentId: m[0] };
}
export const paymentIdFor = (ym, type, code, nn = 1) => `PAY-${String(ym).replace('-', '')}-${String(type).toUpperCase()}-${code}-${String(nn).padStart(2, '0')}`;
export const isGeneratedRef = (ref) => isDraftRef(ref) || isPaymentRef(ref);
// Info periode/type dari referensi hasil generate (PAY-* baru atau GEN-* lama)
export const parseGeneratedRef = (ref) => parsePaymentRef(ref) || parseDraftRef(ref);

// Kode partner dasar: "ULTIMA MULTIMEDIA JAYA" → UMJ; extra=1 → ULMJ; 1 kata → 3 huruf pertama (+extra)
export function partnerCode(name, extra = 0) {
  const words = partnerKey(name).split('_').filter(Boolean);
  if (!words.length) return 'X';
  if (words.length === 1) return words[0].slice(0, 3 + extra);
  return words[0].slice(0, 1 + extra) + words.slice(1).map((w) => w[0]).join('');
}

// Kode unik untuk semua partner dalam 1 batch. Return { codes: Map(partnerKey → code), clashes: [{ partner, code, base }] }
export function assignPartnerCodes(names) {
  const keys = [...new Set((names || []).map((n) => partnerKey(n)).filter(Boolean))].sort();
  const used = new Map();
  const codes = new Map();
  const clashes = [];
  for (const key of keys) {
    const base = partnerCode(key);
    let code = base;
    for (let extra = 1; used.has(code) && extra < 20; extra++) code = partnerCode(key, extra);
    for (let n = 2; used.has(code); n++) code = `${base}${n}`;   // kata pertama habis → tambah angka
    if (code !== base) clashes.push({ partner: key, code, base, with: used.get(base) });
    used.set(code, key);
    codes.set(key, code);
  }
  return { codes, clashes };
}

// Payment ID untuk 1 partner (mis. pembayaran "upload only" tanpa generate):
// kode = inisial partner, dibedakan kalau Payment ID periode/type itu sudah milik partner LAIN;
// NN = nomor berikutnya yang belum dipakai partner ini. known: Map(Payment ID → partner_key).
export function nextPaymentId({ partner, ym, type, known = new Map() }) {
  const pk = partnerKey(partner);
  const ownerOf = (ref) => known.get(ref) || '';
  let code = partnerCode(partner);
  for (let extra = 1; extra < 20 && ownerOf(paymentIdFor(ym, type, code, 1)) && ownerOf(paymentIdFor(ym, type, code, 1)) !== pk; extra++) code = partnerCode(partner, extra);
  let nn = 1;
  while (nn < 99 && ownerOf(paymentIdFor(ym, type, code, nn))) nn++;
  return paymentIdFor(ym, type, code, nn);
}

// BAST / Surat bertanda tangan yang di-upload SPM (mis. hasil approval manual) → nama file bertanda "_signed-spm"
export const SIGNED_SPM_SUFFIX = '_signed-spm';
export const isSpmSigned = (name) => String(name || '').includes(SIGNED_SPM_SUFFIX);
export const spmSignedName = (docType, refId, partnerName) =>
  `${docType === 'bast' ? 'BAST' : 'LETTER'}_${refKey(refId)}_${String(partnerName || '').trim()}${SIGNED_SPM_SUFFIX}.pdf`;

// Teks referensi untuk UI/email: "PO Number 4810118133", "Payment ID PAY-202608-MPC-UMJ-01" atau "Draft — Agustus 2026 · MPC"
export const refDisplay = (ref) => {
  if (isPaymentRef(ref)) return `Payment ID ${ref}`;
  const d = parseDraftRef(ref);
  return d ? `Draft — ${d.label} · ${d.type}` : `${DOC_REF_LABEL} ${ref}`;
};

// Segment: 'partner' (Partner Prepaid) | 'agency' (Agency Prepaid)
const seg = (s) => (s === 'agency' ? 'agency' : 'partner');
export const ownerLabel = (segment) => (seg(segment) === 'agency' ? 'Agency' : 'Partner');

// Kunci ringkasan: segment + pemilik + ref. Pemilik ikut dikunci supaya file yang
// di-upload pemilik lain dengan nomor PO sama tidak "melengkapi" PO yang salah.
export const statKey = (segment, ownerName, ref) => `${seg(segment)}:${partnerKey(ownerName)}:${refKey(ref)}`;

// ── Hak akses (dicerminkan oleh RLS di SQL, kecuali merge = UI) ─────────────
export const canViewAll = (profile) => VIEW_ALL_ROLES.includes(profile?.role);
export const canMerge   = (profile) => profile?.role === 'spm_sumatera';
// Menu & aksi approval (request / remind / cancel / revoke, tab Partner Letters): hanya admin SPM dan
// admin internal Indosat (IOH Sumatera). Partner/agency tidak pernah melihat atau menjalankan approval.
// Peran regional IOH (north/central/south) tetap view-only. Diperiksa juga di server (requireApprovalAdmin).
export const APPROVAL_ADMIN_ROLES = ['spm_sumatera', 'internal_ioh'];
export const canManageApprovals = (profile) => APPROVAL_ADMIN_ROLES.includes(profile?.role);

// Pemilik dokumen milik user: finance_mpx → partner_name, agency → nama agency
function ownOwnerKey(profile, segment) {
  if (seg(segment) === 'partner' && profile?.role === 'finance_mpx') return partnerKey(profile.partner_name);
  if (seg(segment) === 'agency' && profile?.role === 'agency') return partnerKey(profile.agency_name || profile.agency?.name);
  return '';
}

export function canWritePartner(profile, name, segment = 'partner') {
  if (profile?.role === 'spm_sumatera') return true;
  const own = ownOwnerKey(profile, segment);
  return !!own && !!name && own === partnerKey(name);
}

export function canViewPartner(profile, name, segment = 'partner') {
  return canViewAll(profile) || canWritePartner(profile, name, segment);
}

export const fmtSize = (b) =>
  b < 1024 ? `${b} B`
  : b < 1048576 ? `${(b / 1024).toFixed(1)} KB`
  : `${(b / 1048576).toFixed(1)} MB`;

// Segmen path / nama file aman (spasi, unicode, simbol → _)
const safeSeg = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_{2,}/g, '_').replace(/^[_.]+|[_.]+$/g, '') || 'file';

const extOf = (n) => (String(n).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
const isPdfName = (name, mime) => mime === 'application/pdf' || extOf(name) === 'pdf';
const isImgName = (name, mime) => ['image/jpeg', 'image/png'].includes(mime) || ['jpg', 'jpeg', 'png'].includes(extOf(name));
export const fileKind = (name, mime) => (isPdfName(name, mime) ? 'pdf' : isImgName(name, mime) ? 'img' : 'other');

// Deteksi tipe dari isi file (bukan ekstensi): .jpg yang ternyata PNG tetap tergabung
function sniff(bytes) {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf'; // %PDF
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  // %PDF kadang didahului sampah/BOM: cari di 1 KB pertama
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  return head.includes('%PDF-') ? 'pdf' : null;
}

// ── Read ───────────────────────────────────────────────────────────────────

// Ringkasan per statKey: { types: { invoicing: { n, lastAt } … }, files, lastAt }
// 1 query (dipaging 1000 baris) untuk seluruh tab — tidak ada query per PO.
// RLS otomatis membatasi ke pemilik yang boleh dilihat.
export async function fetchDocStats() {
  const byRef = {};
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(DOCS_TABLE)
      .select('segment,partner_key,ref_id,doc_type,uploaded_at')
      .not('ref_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    (data || []).forEach((r) => {
      const k = `${seg(r.segment)}:${r.partner_key}:${r.ref_id}`;
      const s = byRef[k] || (byRef[k] = { types: {}, files: 0, lastAt: null });
      const ty = s.types[r.doc_type] || (s.types[r.doc_type] = { n: 0, lastAt: null });
      ty.n++;
      if (!ty.lastAt || r.uploaded_at > ty.lastAt) ty.lastAt = r.uploaded_at;
      s.files++;
      if (!s.lastAt || r.uploaded_at > s.lastAt) s.lastAt = r.uploaded_at;
    });
    if (!data || data.length < PAGE) break;
  }
  return byRef;
}

export const doneCount = (stat) => DOC_TYPES.filter((d) => stat?.types?.[d.key]?.n > 0).length;

export async function listRefDocs(refId, segment, ownerName) {
  const { data, error } = await supabase
    .from(DOCS_TABLE).select('*')
    .eq('segment', seg(segment))
    .eq('partner_key', partnerKey(ownerName))
    .eq('ref_id', refKey(refId))
    .order('uploaded_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Semua file hasil generate (ref_id PAY-* atau GEN-* lama) di 1 segment — untuk daftar "Generated"
export async function fetchDraftDocs(segment = 'partner') {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(DOCS_TABLE).select('*')
      .eq('segment', seg(segment)).or(`ref_id.like.${DRAFT_REF_PREFIX}%,ref_id.like.${PAYMENT_REF_PREFIX}%`)
      .order('uploaded_at', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function signedUrl(path, expiresSec = 600) {
  const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(path, expiresSec);
  if (error) throw error;
  return data.signedUrl;
}

// Pesan error yang bisa ditindaklanjuti (mis. tabel belum dibuat / cache skema belum di-reload)
export function friendlyError(e) {
  const msg = e?.message || String(e);
  if (/schema cache|payout_partner_docs.*(does not exist|not find)|relation .*payout_partner_docs/i.test(msg)) {
    return 'The document table is not available in Supabase yet. In the SQL Editor, run in order: '
      + '20261007_payout_partner_docs.sql → 20261007b_payout_docs_per_po.sql → 20261007c_payout_docs_uploader_role.sql, '
      + "then run `notify pgrst, 'reload schema';` and refresh the page.";
  }
  if (/column .*(segment|ref_id|doc_type)/i.test(msg)) {
    return "Per-reference columns are missing. Run 20261007b_payout_docs_per_po.sql, then `notify pgrst, 'reload schema';`.";
  }
  if (/row-level security|violates row-level|permission denied|not authorized|unauthorized/i.test(msg)) {
    return `Access denied: you can only modify documents for your own partner/agency's ${DOC_REF_LABEL}s.`;
  }
  return msg;
}

// Label pengunggah dari role (kolom uploaded_by_role, migration c)
export function uploaderLabel(role) {
  if (!role) return null;
  if (role === 'spm_sumatera') return 'SPM';
  if (role === 'finance_mpx') return 'Partner';
  if (role === 'agency') return 'Agency';
  if (VIEW_ALL_ROLES.includes(role)) return 'IOH';
  return role;
}

// Download 1 file dengan nama aslinya (signed URL + Content-Disposition: attachment)
export async function downloadDoc(d) {
  const { data, error } = await supabase.storage.from(DOCS_BUCKET)
    .createSignedUrl(d.storage_path, 300, { download: d.file_name || true });
  if (error) throw error;
  const a = document.createElement('a');
  a.href = data.signedUrl; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}

// Banyak file → 1 ZIP. byType=true → folder "1_Invoicing/", "2_BAST/", … (urutan slot)
export async function downloadDocsZip(docs, zipName, { byType = false, onProgress } = {}) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const used = new Set();
  const failed = [];
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];
    onProgress?.({ index: i, total: docs.length, file: d.file_name });
    try {
      const blob = await downloadBlob(d.storage_path);
      const ti = DOC_TYPES.findIndex((x) => x.key === d.doc_type);
      const dir = byType && ti >= 0 ? `${ti + 1}_${safeSeg(DOC_TYPES[ti].label)}/` : '';
      let name = `${dir}${d.file_name || 'file'}`;
      for (let n = 2; used.has(name); n++) name = `${dir}${String(d.file_name).replace(/(\.[^.]+)?$/, `_${n}$1`)}`;
      used.add(name);
      zip.file(name, blob);
    } catch (e) {
      failed.push(`${d.file_name}: ${e.message || e}`);
    }
  }
  saveBlob(await zip.generateAsync({ type: 'blob' }), zipName.endsWith('.zip') ? zipName : `${zipName}.zip`);
  return { failed };
}

export const refZipName = (refId, partnerName, suffix = '') =>
  `${safeSeg(refKey(refId))}_${safeSeg(partnerName).slice(0, 60) || 'partner'}${suffix ? `_${safeSeg(suffix)}` : ''}.zip`;

async function downloadBlob(path) {
  const { data, error } = await supabase.storage.from(DOCS_BUCKET).download(path);
  if (error) throw error;
  return data;
}

// ── Write ──────────────────────────────────────────────────────────────────

// Validasi di browser sebelum upload — pesan singkat (English)
export function validateFile(file) {
  if (fileKind(file.name, file.type) === 'other') return 'Unsupported format. Please use PDF, JPG or PNG.';
  if (file.size === 0) return 'File is empty (0 bytes). Please re-export and try again.';
  if (file.size > MAX_FILE_BYTES) return `File too large (${fmtSize(file.size)}). Maximum size is ${MAX_FILE_BYTES / 1048576} MB per file.`;
  return null;
}

// Upload 1+ file ke 1 slot.
//  replace=true → file lama di slot dihapus setelah minimal 1 upload sukses.
//  File dengan nama+ukuran sama yang sudah ada di slot dilewati (anti dobel).
//  onProgress({ index, phase: 'start'|'done'|'error'|'skip', error })
export async function uploadSlot({ files, partnerName, refId, docType, segment = 'partner', replace = false, onProgress }) {
  const key = partnerKey(partnerName);
  const ref = refKey(refId);
  if (!key) throw new Error(`${ownerLabel(segment)} name is missing`);
  if (!ref) throw new Error(`${DOC_REF_LABEL} is missing`);
  if (!DOC_TYPES.some((d) => d.key === docType)) throw new Error('Unknown document type');

  const existing = (await listRefDocs(ref, segment, partnerName)).filter((d) => d.doc_type === docType);
  const seen = new Set(replace ? [] : existing.map((d) => `${d.file_name}|${d.size_bytes}`));
  const list = Array.from(files || []);
  const ok = [];
  const errors = [];
  const skipped = [];
  for (let i = 0; i < list.length; i++) {
    const file = list[i];
    const sig = `${file.name}|${file.size}`;
    if (seen.has(sig)) { skipped.push(file.name); onProgress?.({ index: i, phase: 'skip' }); continue; }
    seen.add(sig);
    onProgress?.({ index: i, phase: 'start' });
    try {
      const bad = validateFile(file);
      if (bad) throw new Error(bad);
      const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const storagePath = [seg(segment), key, safeSeg(ref), docType, `${stamp}_${safeSeg(file.name)}`].join('/');
      const { error: upErr } = await supabase.storage.from(DOCS_BUCKET).upload(storagePath, file, {
        contentType: file.type || (fileKind(file.name) === 'pdf' ? 'application/pdf' : 'application/octet-stream'),
        upsert: false, cacheControl: '3600',
      });
      if (upErr) throw upErr;
      const { data, error: dbErr } = await supabase.from(DOCS_TABLE).insert({
        segment: seg(segment), partner_key: key, partner_name: partnerName, ref_id: ref, doc_type: docType,
        batch_id: stamp, rel_path: file.name, file_name: file.name, storage_path: storagePath,
        mime_type: file.type || null, size_bytes: file.size,
      }).select().single();
      if (dbErr) {
        await supabase.storage.from(DOCS_BUCKET).remove([storagePath]);
        throw dbErr;
      }
      ok.push(data);
      onProgress?.({ index: i, phase: 'done' });
    } catch (e) {
      const message = e.message || String(e);
      errors.push({ file: file.name, message });
      onProgress?.({ index: i, phase: 'error', error: message });
    }
  }
  if (replace && ok.length && existing.length) await deleteDocs(existing);
  return { ok, errors, skipped };
}

export async function deleteDocs(docs) {
  const arr = Array.isArray(docs) ? docs : [docs];
  if (!arr.length) return;
  // Hapus baris DB dulu: RLS (termasuk kunci approval) memblokir diam-diam → cek jumlah yang terhapus
  const { data: gone, error } = await supabase.from(DOCS_TABLE).delete().in('id', arr.map((d) => d.id)).select('id');
  if (error) throw error;
  if ((gone || []).length < arr.length) {
    throw new Error('This document is locked (approved) or you do not have permission to delete it.');
  }
  const { error: sErr } = await supabase.storage.from(DOCS_BUCKET).remove(arr.map((d) => d.storage_path));
  if (sErr) throw sErr;
}

// ── Approval (BAST & Notification Letter) ──────────────────────────────────
// Dimatikan: approval dilakukan manual (dokumen dibubuhi e-sign). Kode, route & SQL 20261008 tetap ada;
// ubah ke true untuk menampilkan lagi alur request/remind/cancel/revoke approval di UI.
export const APPROVAL_ENABLED = false;
// Tabel payout_doc_approvals (migration 20261008). Tulis via API server; baca via RLS.
export const APPROVAL_DOC_TYPES = ['bast', 'surat_pemberitahuan'];
export const approvalKey = (segment, ownerName, ref, docType) => `${statKey(segment, ownerName, ref)}:${docType}`;

// Status efektif: pending yang lewat batas waktu dianggap expired
export const approvalStatus = (a) => (!a ? null : a.status === 'pending' && new Date(a.expires_at) < new Date() ? 'expired' : a.status);

// Approval terbaru per slot. available=false kalau tabel belum dibuat (migration belum jalan).
export async function fetchApprovals() {
  const byKey = {};
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('payout_doc_approvals')
      .select('id,segment,owner_key,owner_name,ref_id,doc_type,files,approver_email,note,requested_email,requested_at,expires_at,status,decided_email,decided_at,decision_note,closed_email,closed_at,close_reason,reminder_count,last_reminded_at')
      .order('requested_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) {
      if (/schema cache|does not exist|relation/i.test(error.message || '')) return { available: false, byKey: {} };
      throw error;
    }
    (data || []).forEach((a) => {
      const k = `${seg(a.segment)}:${a.owner_key}:${a.ref_id}:${a.doc_type}`;
      if (!byKey[k]) byKey[k] = a; // sudah urut terbaru dulu
    });
    if (!data || data.length < PAGE) break;
  }
  return { available: true, byKey };
}

// Panggil route server approval dengan token sesi user
export async function approvalApi(action, body) {
  const { data: { session } = {} } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in to continue.');
  const res = await fetch(`/api/payout-docs/approvals/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(friendlyError(json.error || `Request failed (${res.status})`));
  return json;
}

// ── Merge (khusus SPM) ─────────────────────────────────────────────────────
// 1 PDF per ref: cover → Invoicing → BAST → Surat Pemberitahuan → Faktur Pajak.

export const mergedFileName = (refId, partnerName) =>
  `${safeSeg(refKey(refId))}_${safeSeg(partnerName).slice(0, 60) || 'partner'}.pdf`;

export async function buildMergedPdf({ refId, partnerName, segment = 'partner', title, amountText, docs, onProgress }) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const all = docs || await listRefDocs(refId, segment, partnerName);
  // Payment ID / draft: BAST & Surat bisa punya beberapa versi (asli, e-sign SPM, upload bertanda tangan SPM,
  // tanda tangan owner) → pakai 1 file: versi bertanda tangan terbaru kalau ada, selain itu yang terbaru.
  // PO: semua file tetap digabung.
  const generated = isGeneratedRef(refId);
  const pickOne = (files) => {
    const byNew = [...files].sort((a, b) => String(b.uploaded_at).localeCompare(String(a.uploaded_at)));
    // versi bertanda tangan terbaru (owner partner atau upload SPM), selain itu file terbaru
    return byNew.find((d) => /_signed-(owner|spm)/.test(String(d.file_name || ''))) || byNew[0];
  };
  const list = generated
    ? all.filter((d) => !['bast', 'surat_pemberitahuan'].includes(d.doc_type))
      .concat(['bast', 'surat_pemberitahuan'].map((k) => all.filter((d) => d.doc_type === k)).filter((f) => f.length).map(pickOne))
    : all;
  const refLabel = isPaymentRef(refId) ? 'Payment ID' : DOC_REF_LABEL;
  const out = await PDFDocument.create();
  out.setTitle(`${refLabel} ${refKey(refId)} - ${partnerName || ''}`);
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const A4 = [595.28, 841.89];
  const M = 24;
  const skipped = [];

  // Cover dulu (diisi setelah tahu jumlah halaman per jenis)
  const cover = out.addPage(A4);
  const pagesPerType = {};
  const total = list.length;
  let idx = 0;

  for (const dt of DOC_TYPES) {
    const files = list.filter((d) => d.doc_type === dt.key);
    pagesPerType[dt.key] = 0;
    for (const d of files) {
      onProgress?.({ index: idx++, total, file: d.file_name });
      try {
        const bytes = new Uint8Array(await (await downloadBlob(d.storage_path)).arrayBuffer());
        const kind = sniff(bytes);
        if (kind === 'pdf') {
          const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
          if (src.isEncrypted) { skipped.push(`${dt.label}: ${d.file_name} (password-protected)`); continue; }
          const pages = await out.copyPages(src, src.getPageIndices());
          pages.forEach((p) => out.addPage(p));
          pagesPerType[dt.key] += pages.length;
        } else if (kind === 'png' || kind === 'jpg') {
          const img = kind === 'png' ? await out.embedPng(bytes) : await out.embedJpg(bytes);
          const [pw, ph] = img.width > img.height ? [A4[1], A4[0]] : A4;
          const s = Math.min((pw - 2 * M) / img.width, (ph - 2 * M) / img.height, 1);
          const w = img.width * s, h = img.height * s;
          out.addPage([pw, ph]).drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
          pagesPerType[dt.key] += 1;
        } else {
          skipped.push(`${dt.label}: ${d.file_name} (unrecognised format)`);
        }
      } catch {
        skipped.push(`${dt.label}: ${d.file_name} (corrupted file)`);
      }
    }
  }

  // Helvetica = WinAnsi → buang karakter di luar Latin-1
  const clean = (s, max = 90) => String(s ?? '').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?').slice(0, max);
  const ink = rgb(0.1, 0.1, 0.12), muted = rgb(0.42, 0.42, 0.47);
  const teal = rgb(0.15, 0.6, 0.55), red = rgb(0.86, 0.1, 0.14), magenta = rgb(0.78, 0.09, 0.55);
  let y = A4[1] - 64;
  const line = (text, { size = 11, f = font, color = ink, x = 56 } = {}) => {
    cover.drawText(clean(text), { x, y, size, font: f, color });
    y -= size + 9;
  };
  cover.drawRectangle({ x: 0, y: A4[1] - 8, width: A4[0], height: 8, color: magenta });
  line('INVOICING DOCUMENT PACKAGE', { size: 10, f: bold, color: magenta });
  line(`${refLabel}: ${refKey(refId)}`, { size: 20, f: bold });
  y -= 6;
  const meta = [
    [ownerLabel(segment), partnerName || '-'],
    ...(title ? [['Project', title]] : []),
    ...(amountText ? [['Amount', amountText]] : []),
    ['Generated', new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })],
  ];
  meta.forEach(([k, v]) => {
    cover.drawText(clean(k), { x: 56, y, size: 10, font, color: muted });
    cover.drawText(clean(v, 70), { x: 140, y, size: 11, font, color: ink });
    y -= 20;
  });
  y -= 14;
  const present = DOC_TYPES.filter((dt) => pagesPerType[dt.key] > 0).length;
  line(`Document completeness  ${present}/${DOC_TYPES.length}`, { size: 12, f: bold });
  y -= 4;
  let page = 2;
  DOC_TYPES.forEach((dt, i) => {
    const n = pagesPerType[dt.key];
    const ok = n > 0;
    cover.drawRectangle({ x: 56, y: y - 7, width: A4[0] - 112, height: 24, color: ok ? rgb(0.92, 0.97, 0.96) : rgb(0.99, 0.93, 0.93) });
    cover.drawText(clean(`${i + 1}. ${dt.label}`), { x: 66, y, size: 11, font: bold, color: ink });
    cover.drawText(ok ? 'INCLUDED' : 'MISSING', { x: 310, y, size: 11, font: bold, color: ok ? teal : red });
    if (ok) cover.drawText(n === 1 ? `p. ${page}` : `pp. ${page}-${page + n - 1}`, { x: 420, y, size: 10, font, color: muted });
    page += n;
    y -= 30;
  });
  if (skipped.length) {
    y -= 8;
    line('Files that could not be merged (download them separately from Payout Tracker):', { size: 10, f: bold, color: red });
    skipped.slice(0, 15).forEach((s) => line(`- ${s}`, { size: 9 }));
    if (skipped.length > 15) line(`... and ${skipped.length - 15} more`, { size: 9, color: muted });
  }

  return { bytes: await out.save(), skipped, present, complete: present === DOC_TYPES.length };
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function downloadMergedPdf(opts) {
  const r = await buildMergedPdf(opts);
  saveBlob(new Blob([r.bytes], { type: 'application/pdf' }), mergedFileName(opts.refId, opts.partnerName));
  return r;
}

// items: [{ refId, partnerName, segment, title, amountText }] → 1 ZIP berisi PDF per ref
// onProgress({ index, total, ref })
export async function downloadMergedZip(items, onProgress) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const failed = [];
  const used = new Set();
  for (let i = 0; i < items.length; i++) {
    onProgress?.({ index: i, total: items.length, ref: items[i].refId });
    try {
      const r = await buildMergedPdf(items[i]);
      let name = mergedFileName(items[i].refId, items[i].partnerName);
      for (let n = 2; used.has(name); n++) name = name.replace(/(_\d+)?\.pdf$/, `_${n}.pdf`);
      used.add(name);
      zip.file(name, r.bytes);
    } catch (e) {
      failed.push(`${items[i].refId}: ${e.message || e}`);
    }
  }
  onProgress?.({ index: items.length, total: items.length, ref: '' });
  const stamp = new Date().toISOString().slice(0, 10);
  saveBlob(await zip.generateAsync({ type: 'blob' }), `Payout_Documents_${stamp}_${items.length - failed.length}.zip`);
  return { failed };
}
