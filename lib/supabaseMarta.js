import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_MARTA_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_MARTA_SUPABASE_ANON_KEY;

/** True bila kredensial Supabase MartaHub sudah diset di environment. */
export const MARTA_CONFIGURED = Boolean(url && key);

const g = globalThis;

// MartaHub masih dalam pengembangan. Bila env Supabase-nya belum diset (mis. di
// build Vercel), JANGAN throw saat modul di-import — itu akan menggagalkan
// build/prerender Next.js. Sebagai gantinya pakai stub aman yang membuat semua
// pemanggilan auth/query berperilaku seperti "belum login / belum aktif",
// sehingga halaman MartaHub tetap bisa dirender tanpa error.
function makeStub() {
  const devError = { message: "MartaHub masih dalam pengembangan." };

  // Query builder yang sekaligus chainable dan awaitable.
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

export const supabaseMarta =
  g.__supabaseMarta ||
  (MARTA_CONFIGURED
    ? createClient(url, key, {
        auth: {
          persistSession:     true,
          autoRefreshToken:   true,
          detectSessionInUrl: true,
          storageKey:         "marta-auth-token", // terpisah dari SandraHub session
        },
      })
    : makeStub());

if (process.env.NODE_ENV !== "production") {
  g.__supabaseMarta = supabaseMarta;
}

export default supabaseMarta;
