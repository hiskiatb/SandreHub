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
export const dbSiap = Boolean(postgresUrl);
if (!dbSiap) console.error(`❌ ${DB_BELUM_DISETEL}`);

export const pool = dbSiap
    ? new Pool({ connectionString: postgresUrl, ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(postgresUrl) ? false : { rejectUnauthorized: false }, max: 3 })
    : null;

const toPostgresSql = (sql) => {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
};

export const db = {
    async execute(query) {
        if (!pool) throw new Error(DB_BELUM_DISETEL);
        const sql = typeof query === 'string' ? query : query.sql;
        // Kolom flag disimpan sebagai INTEGER, jadi boolean dari client diubah ke 1/0
        const args = typeof query === 'string' ? [] : (query.args || []).map(a => typeof a === 'boolean' ? (a ? 1 : 0) : a);
        const result = await pool.query(toPostgresSql(sql), args);
        return { rows: result.rows || [], rowsAffected: result.rowCount };
    }
};
