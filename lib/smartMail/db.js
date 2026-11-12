// lib/smartMail/db.js — SALINAN db.js Smart Mail Sumatera (koneksi Postgres langsung lewat SUPABASE_DB_URL).
import pkg from 'pg';

// ============================================================================
// KONEKSI DATABASE: semua data aplikasi disimpan di Supabase (Postgres).
// Isi SUPABASE_DB_URL dengan connection string Supabase (Transaction pooler, port 6543).
// db.execute({ sql, args }) -> { rows }, placeholder "?" otomatis diubah ke $1, $2, ...
// ============================================================================

const { Pool } = pkg;

const postgresUrl = process.env.SUPABASE_DB_URL;

export const DB_BELUM_DISETEL = 'Database belum dikonfigurasi: isi environment variable SUPABASE_DB_URL dengan connection string Supabase TraceHub (Transaction pooler), lalu redeploy.';
// [SandraHub] MODE LOKAL: saat `npm run dev` tanpa SUPABASE_DB_URL, data disimpan di database
// lokal (PGlite, folder .tmp_smart_mail_db) supaya Partner SDP & MDI bisa dicoba penuh di
// localhost. Tidak pernah aktif di Vercel/production (NODE_ENV=production).
export const MODE_LOKAL = !postgresUrl && process.env.NODE_ENV !== 'production';
export const dbSiap = Boolean(postgresUrl) || MODE_LOKAL;
if (!dbSiap) console.error(`❌ ${DB_BELUM_DISETEL}`);

export const pool = postgresUrl
    ? new Pool({ connectionString: postgresUrl, ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(postgresUrl) ? false : { rejectUnauthorized: false }, max: 3 })
    : null;

const toPostgresSql = (sql) => {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
};

async function dbLokal() {
    if (!globalThis.__smartMailPglite) {
        globalThis.__smartMailPglite = (async () => {
            const [{ PGlite }, fs, path] = await Promise.all([import('@electric-sql/pglite'), import('fs'), import('path')]);
            const lokasi = path.join(process.cwd(), '.tmp_smart_mail_db');
            const pg = new PGlite(lokasi);
            await pg.exec(fs.readFileSync(path.join(process.cwd(), 'docs', 'sql', 'smart_mail_schema.sql'), 'utf8'));
            console.log(`ℹ️ Smart Mail MODE LOKAL: database lokal di ${lokasi} (SUPABASE_DB_URL kosong).`);
            return pg;
        })();
    }
    return globalThis.__smartMailPglite;
}

export const db = {
    async execute(query) {
        if (!pool && MODE_LOKAL) {
            const pg = await dbLokal();
            const sql = typeof query === 'string' ? query : query.sql;
            const args = typeof query === 'string' ? [] : (query.args || []).map(a => typeof a === 'boolean' ? (a ? 1 : 0) : a);
            const result = await pg.query(toPostgresSql(sql), args);
            return { rows: result.rows || [], rowsAffected: result.affectedRows ?? (result.rows || []).length };
        }
        if (!pool) throw new Error(DB_BELUM_DISETEL);
        const sql = typeof query === 'string' ? query : query.sql;
        // Kolom flag disimpan sebagai INTEGER, jadi boolean dari client diubah ke 1/0
        const args = typeof query === 'string' ? [] : (query.args || []).map(a => typeof a === 'boolean' ? (a ? 1 : 0) : a);
        const result = await pool.query(toPostgresSql(sql), args);
        return { rows: result.rows || [], rowsAffected: result.rowCount };
    }
};
