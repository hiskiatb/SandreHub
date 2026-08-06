// Helper utk menampilkan foto lewat proxy Edge Function `media-view` —
// browser TIDAK PERNAH memanggil Google Drive langsung / melihat link-nya.
// Function itu yang mengambil bytes dari Drive (kalau sudah dimirror) atau
// dari Supabase Storage (fallback, foto lama/belum sempat dimirror) lalu
// mengalirkannya balik. Karena butuh header Authorization, tidak bisa
// dipakai langsung sbg <img src>, jadi kita fetch manual lalu ubah jadi
// object URL blob.
import supabaseMarta from "../../../../lib/supabaseMarta";

const FUNCTIONS_BASE = (process.env.NEXT_PUBLIC_MARTA_SUPABASE_URL || "").replace(/\/$/, "") + "/functions/v1/media-view";

/** kind: "document" (mh_documents, Submit Actual Report) | "install_photo"
 * (mh_md_installation_photos, POSM). id: primary key baris foto tsb. */
export async function fetchAuthedPhotoBlobUrl(kind, id) {
  const { data: sessionData } = await supabaseMarta.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Belum login");

  const res = await fetch(`${FUNCTIONS_BASE}?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gagal memuat foto (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
