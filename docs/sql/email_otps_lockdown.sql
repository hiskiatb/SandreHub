-- ============================================================================
-- email_otps — cabut akses tulis langsung dari client (anon/authenticated)
-- Project: kqxnoovrwaxsnpdynbgi
--
-- LATAR BELAKANG: sebelumnya browser men-generate OTP sendiri lalu insert
-- langsung ke tabel ini pakai anon key. Policy INSERT lama mengizinkan
-- {anon, authenticated} dengan with_check: true — artinya SIAPA PUN tanpa
-- login bisa insert baris {email, otp, verified:false} untuk EMAIL SIAPA
-- PUN dengan OTP PILIHANNYA SENDIRI, lalu langsung panggil
-- POST /api/verify-otp untuk membuat akun atas nama email itu — TANPA
-- pernah menerima/melihat email verifikasi apa pun (bypass total).
--
-- PERBAIKAN: OTP sekarang di-generate & di-insert HANYA dari server
-- (app/api/send-otp/route.js, pakai SUPABASE_SERVICE_ROLE_KEY yang bypass
-- RLS) — jadi policy INSERT untuk anon/authenticated ini sudah TIDAK
-- DIPAKAI LAGI oleh kode manapun dan aman dicabut. Policy SELECT/UPDATE
-- ("Enable select/update for system", role service_role) TIDAK diubah —
-- itu sudah benar dari awal.
--
-- CATATAN: MartaHub TIDAK memakai tabel ini sama sekali (pakai
-- supabase.auth.signInWithOtp/verifyOtp bawaan Supabase Auth) — migrasi
-- ini tidak berdampak ke MartaHub.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "Enable insert for anonymous users" ON public.email_otps;

-- (Tidak membuat policy INSERT pengganti untuk anon/authenticated dengan
-- sengaja — semua insert sekarang lewat service role di server, yang
-- otomatis bypass RLS dan tidak butuh policy apa pun.)

COMMIT;

-- ROLLBACK cepat (kembalikan policy lama) kalau perlu:
--   BEGIN;
--   CREATE POLICY "Enable insert for anonymous users" ON public.email_otps
--     FOR INSERT TO anon, authenticated WITH CHECK (true);
--   COMMIT;
-- ============================================================================
