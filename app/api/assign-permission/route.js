import { createClient } from "@supabase/supabase-js";

export async function POST(req) {
  const { user_id, table_id, can_view, can_edit } = await req.json();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { error } = await supabase.from("permissions").upsert({
    user_id,
    table_id,
    can_view,
    can_edit,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  return Response.json({ success: true });
}