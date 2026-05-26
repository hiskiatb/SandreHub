// lib/pnlAttachments.js
import supabase from './supabase';

export const ATTACH_BUCKET   = 'pnl-attachments';
export const MAX_FILE_BYTES  = 20 * 1024 * 1024;          // 20 MB
export const ACCEPTED_MIME   = ['application/pdf'];
export const ACCEPTED_EXT    = '.pdf';

// Sanitize partner/branch/etc untuk dipakai sebagai path
const slug = (s) => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';

export const isPdf = (file) =>
  file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name));

export const fmtSize = (b) =>
  b < 1024 ? `${b} B`
  : b < 1048576 ? `${(b / 1024).toFixed(1)} KB`
  : `${(b / 1048576).toFixed(1)} MB`;

// Build path: partner/branch/year/month/kategori/timestamp_name.pdf
export function buildPath({ partner, branch, year, month, category, fileName }) {
  const ts   = Date.now();
  const rand = Math.random().toString(36).slice(2, 7);
  const safe = slug(fileName.replace(/\.pdf$/i, '')) + '.pdf';
  return [
    slug(partner), slug(branch), slug(year), slug(month),
    category, `${ts}_${rand}_${safe}`,
  ].join('/');
}

// Validasi sebelum upload
export function validatePdf(file) {
  if (!file)                       return 'File tidak ditemukan';
  if (!isPdf(file))                return `Hanya file PDF yang diizinkan (file: ${file.name})`;
  if (file.size > MAX_FILE_BYTES)  return `Ukuran ${file.name} melebihi 20 MB`;
  if (file.size === 0)             return `${file.name} kosong (0 byte)`;
  return null;
}

// Upload 1 file → metadata
export async function uploadOne({ file, partner, branch, year, month, category }) {
  const err = validatePdf(file);
  if (err) throw new Error(err);

  const path = buildPath({ partner, branch, year, month, category, fileName: file.name });
  const { error } = await supabase.storage
    .from(ATTACH_BUCKET)
    .upload(path, file, {
      contentType: 'application/pdf',
      upsert: false,
      cacheControl: '3600',
    });
  if (error) throw error;

  return {
    path,
    name:        file.name,
    size:        file.size,
    uploaded_at: new Date().toISOString(),
  };
}

// Upload banyak file
export async function uploadMany({ files, partner, branch, year, month, category, onProgress }) {
  const ok = [];
  const errors = [];
  for (let i = 0; i < files.length; i++) {
    try {
      const meta = await uploadOne({ file: files[i], partner, branch, year, month, category });
      ok.push(meta);
      onProgress?.({ index: i, total: files.length, file: files[i].name, ok: true });
    } catch (e) {
      errors.push({ file: files[i].name, message: e.message });
      onProgress?.({ index: i, total: files.length, file: files[i].name, ok: false, error: e.message });
    }
  }
  return { ok, errors };
}

// Hapus 1 file
export async function removeOne(path) {
  if (!path) return;
  const { error } = await supabase.storage.from(ATTACH_BUCKET).remove([path]);
  if (error) throw error;
}

// Signed URL untuk download/preview (private bucket)
export async function signedUrl(path, expiresSec = 3600) {
  const { data, error } = await supabase.storage
    .from(ATTACH_BUCKET).createSignedUrl(path, expiresSec);
  if (error) throw error;
  return data.signedUrl;
}

// Download PDF sebagai ArrayBuffer (untuk merge oleh MPX Summary)
export async function downloadAsArrayBuffer(path) {
  const { data, error } = await supabase.storage.from(ATTACH_BUCKET).download(path);
  if (error) throw error;
  return await data.arrayBuffer();
}