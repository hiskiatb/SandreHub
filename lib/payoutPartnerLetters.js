// lib/payoutPartnerLetters.js
// Partner Letters (SPM): BAST & Surat Pemberitahuan hasil generate per Payment ID.
// Terpisah dari alur PO: PDF disimpan di tabel/bucket dokumen yang sama dengan ref_id = Payment ID (PAY-*),
// tidak pernah muncul sebagai baris PO. Metadata pembayaran = file JSON di <segment>/_letters/
// (bukan baris dokumen), satu folder datar supaya cukup 1x list untuk History.
import supabase from './supabase';
import { DOCS_BUCKET, isPaymentRef } from './payoutPartnerDocs';

export const LETTERS_OWNER = '_letters';                 // "owner" path: SPM bisa tulis, partner tidak bisa baca
export const lettersDir = (segment = 'partner') => `${segment === 'agency' ? 'agency' : 'partner'}/${LETTERS_OWNER}`;

// <PAY>__payment__<stamp>.json → metadata pembayaran (total, email, periode, e-sign) — ditulis saat simpan
export const paymentMetaPath = (segment, pid) => `${lettersDir(segment)}/${pid}__payment__${Date.now()}.json`;
const NAME_RE = /^(PAY-[A-Z0-9-]+?)__payment__(\d+)\.json$/;
export const parseLetterFile = (name) => {
  const m = NAME_RE.exec(String(name || ''));
  if (!m || !isPaymentRef(m[1])) return null;
  return { pid: m[1], at: new Date(Number(m[2])).toISOString() };
};

// Map(pid → { metaPath, metaAt }) — metadata terbaru per Payment ID
export async function fetchLettersIndex(segment = 'partner') {
  const out = new Map();
  const dir = lettersDir(segment);
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(DOCS_BUCKET).list(dir, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    (data || []).forEach((f) => {
      const p = parseLetterFile(f.name);
      if (!p) return;
      const e = out.get(p.pid);
      if (!e || p.at >= e.metaAt) out.set(p.pid, { metaPath: `${dir}/${f.name}`, metaAt: p.at });
    });
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function readJsonFile(path) {
  const { data, error } = await supabase.storage.from(DOCS_BUCKET).download(path);
  if (error) throw error;
  return JSON.parse(await data.text());
}

export async function savePaymentMeta(segment, meta) {
  const path = paymentMetaPath(segment, meta.payment_id);
  const blob = new Blob([JSON.stringify(meta, null, 1)], { type: 'application/json' });
  const { error } = await supabase.storage.from(DOCS_BUCKET).upload(path, blob, { contentType: 'application/json', upsert: false });
  if (error) throw error;
  return path;
}
