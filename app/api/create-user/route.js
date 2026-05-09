import { createClient } from "@supabase/supabase-js";

export async function POST(req) {
  const { email, password, role } = await req.json();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY // server only
  );

  // 1. Create user di Auth
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  // 2. Insert ke profiles
  await supabase.from("profiles").insert({
    id: data.user.id,
    email,
    role,
  });

  return Response.json({ success: true });
}