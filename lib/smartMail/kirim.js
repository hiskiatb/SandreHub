// lib/smartMail/kirim.js
// Tambahan SandraHub (bukan dari kode asli): kirim email lewat Resend dengan
// JEDA antar email + coba ulang otomatis kalau kena batas Resend
// ("Too many requests. You can only make N requests per second").
//
// - Jeda minimal antar pengiriman: SMART_MAIL_JEDA_MS (default 1000 ms = 1 detik).
// - Kalau Resend menjawab 429 / rate limit: tunggu 2, 4, 8, lalu 16 detik dan coba lagi
//   (maks 4 kali), baru dianggap gagal.
// Hasilnya sama persis dengan resend.emails.send(): { data, error }.

const JEDA_MS = Math.max(0, Number(process.env.SMART_MAIL_JEDA_MS) || 1000);
const BACKOFF_MS = [2000, 4000, 8000, 16000];

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
let terakhirKirim = 0;

const kenaBatas = (err) => {
  if (!err) return false;
  const kode = err.statusCode || err.status;
  const teks = `${err.name || ""} ${err.message || ""}`.toLowerCase();
  return kode === 429 || teks.includes("rate_limit") || teks.includes("too many requests");
};

async function tungguGiliran() {
  const tunggu = terakhirKirim + JEDA_MS - Date.now();
  if (tunggu > 0) await tidur(tunggu);
  terakhirKirim = Date.now();
}

export async function kirimEmail(resend, payload) {
  for (let percobaan = 0; ; percobaan++) {
    await tungguGiliran();
    let hasil;
    try {
      hasil = await resend.emails.send(payload);
    } catch (e) {
      if (kenaBatas(e) && percobaan < BACKOFF_MS.length) { await tidur(BACKOFF_MS[percobaan]); continue; }
      throw e;
    }
    if (hasil && kenaBatas(hasil.error) && percobaan < BACKOFF_MS.length) { await tidur(BACKOFF_MS[percobaan]); continue; }
    return hasil;
  }
}

export const SMART_MAIL_JEDA_MS = JEDA_MS;
