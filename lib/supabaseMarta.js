import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_MARTA_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_MARTA_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "NEXT_PUBLIC_MARTA_SUPABASE_URL atau NEXT_PUBLIC_MARTA_SUPABASE_ANON_KEY tidak ditemukan di .env.local"
  );
}

const g = globalThis;

export const supabaseMarta =
  g.__supabaseMarta ||
  createClient(url, key, {
    auth: {
      persistSession:     true,
      autoRefreshToken:   true,
      detectSessionInUrl: true,
      storageKey:         "marta-auth-token", // terpisah dari SandraHub session
    },
  });

if (process.env.NODE_ENV !== "production") {
  g.__supabaseMarta = supabaseMarta;
}

export default supabaseMarta;
