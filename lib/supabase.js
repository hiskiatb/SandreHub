import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Validasi Environment Variables agar tidak bingung saat build
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Error: NEXT_PUBLIC_SUPABASE_URL atau NEXT_PUBLIC_SUPABASE_ANON_KEY tidak ditemukan di .env.local"
  );
}

/**
 * Singleton Pattern:
 * Di Next.js (terutama saat development), hot reloading bisa membuat 
 * banyak instance client. Kita simpan di 'globalThis' agar tetap satu instance.
 */
const globalForSupabase = globalThis;

export const supabase =
  globalForSupabase.supabase ||
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,      // Sesi tetap ada meski browser di-refresh
      autoRefreshToken: true,    // Refresh token otomatis agar tidak log out sendiri
      detectSessionInUrl: true,  // Penting untuk fitur reset password/magic link
    },
  });

// Simpan ke global jika bukan di production
if (process.env.NODE_ENV !== "production") {
  globalForSupabase.supabase = supabase;
}

export default supabase;