import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const url = "https://pemltwhyidrajbyzynks.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlbWx0d2h5aWRyYWpieXp5bmtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NDE4NTIsImV4cCI6MjA5NjQxNzg1Mn0.Q9u8ScWEwtd8BbnXpqTREw_jSHhgiBz8QEI7I9Nna6w";
const supabase = createClient(url, key);

const FONT_BUCKET = "rpv-fonts";

const files = [
  { path: "./IndosatRegular-Regular.ttf", name: "Indosat Regular" },
  { path: "./IndosatMedium-Medium_1.ttf", name: "Indosat Medium" },
  { path: "./IndosatBold-Bold.ttf", name: "Indosat Bold" },
];

for (const f of files) {
  const id = crypto.randomUUID();
  const storagePath = `${id}.ttf`;
  const bytes = fs.readFileSync(f.path);
  const { error: upErr } = await supabase.storage.from(FONT_BUCKET).upload(storagePath, bytes, {
    upsert: false,
    contentType: "font/ttf",
  });
  if (upErr) {
    console.error("UPLOAD FAIL", f.name, upErr.message);
    continue;
  }
  const { data, error } = await supabase.rpc("rpv_save_custom_font", { p_name: f.name, p_storage_path: storagePath });
  if (error) {
    console.error("RPC FAIL", f.name, error.message);
    continue;
  }
  console.log("OK", f.name, JSON.stringify(data));
}
