import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True bila kredensial Supabase (SandraHub) sudah diset di environment. */
export const SUPABASE_CONFIGURED = Boolean(supabaseUrl && supabaseAnonKey);

if (!SUPABASE_CONFIGURED) {
  // JANGAN throw di sini - module ini diimpor luas (termasuk halaman yang
  // di-prerender saat build, mis. /agency), jadi throw di top-level akan
  // menggagalkan SELURUH build Next.js kalau env belum ke-set di lingkungan
  // build itu. Log peringatan saja; stub di bawah membuat semua pemanggilan
  // auth/query berperilaku aman ("belum login") tanpa crash.
  console.warn(
    "[lib/supabase] NEXT_PUBLIC_SUPABASE_URL atau NEXT_PUBLIC_SUPABASE_ANON_KEY tidak ditemukan - cek Environment Variables di Vercel Project Settings."
  );
}

function makeStub() {
  const devError = { message: "Supabase belum dikonfigurasi (env NEXT_PUBLIC_SUPABASE_URL/ANON_KEY kosong)." };
  const makeBuilder = () => {
    const result = { data: null, error: devError, count: null, status: 200, statusText: "OK" };
    const p = new Proxy(function () {}, {
      apply: () => p,
      get: (_t, prop) => {
        if (prop === "then")    return (res, rej) => Promise.resolve(result).then(res, rej);
        if (prop === "catch")   return (rej) => Promise.resolve(result).catch(rej);
        if (prop === "finally") return (f) => Promise.resolve(result).finally(f);
        return () => p;
      },
    });
    return p;
  };
  return {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      getUser:    () => Promise.resolve({ data: { user: null }, error: null }),
      signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error: devError }),
      signUp:     () => Promise.resolve({ data: { user: null, session: null }, error: devError }),
      signOut:    () => Promise.resolve({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from:    () => makeBuilder(),
    rpc:     () => makeBuilder(),
    channel: () => {
      const ch = { on: () => ch, subscribe: () => ch, unsubscribe: () => {} };
      return ch;
    },
    removeChannel: () => {},
    storage: { from: () => makeBuilder() },
  };
}

/**
 * Singleton Pattern:
 * Di Next.js (terutama saat development), hot reloading bisa membuat
 * banyak instance client. Kita simpan di 'globalThis' agar tetap satu instance.
 */
const globalForSupabase = globalThis;

export const supabase =
  globalForSupabase.supabase ||
  (SUPABASE_CONFIGURED
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,      // Sesi tetap ada meski browser di-refresh
          autoRefreshToken: true,    // Refresh token otomatis agar tidak log out sendiri
          detectSessionInUrl: true,  // Penting untuk fitur reset password/magic link
        },
      })
    : makeStub());

// Simpan ke global jika bukan di production
if (process.env.NODE_ENV !== "production") {
  globalForSupabase.supabase = supabase;
}

export default supabase;