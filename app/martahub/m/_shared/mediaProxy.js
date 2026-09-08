// Helper utk menampilkan foto lewat proxy Edge Function `media-view` -
// browser TIDAK PERNAH memanggil Google Drive langsung / melihat link-nya.
// Function itu yang mengambil bytes dari Drive (kalau sudah dimirror) atau
// dari Supabase Storage (fallback, foto lama/belum sempat dimirror) lalu
// mengalirkannya balik. Karena butuh header Authorization, tidak bisa
// dipakai langsung sbg <img src>, jadi kita fetch manual lalu ubah jadi
// object URL blob.
//
// ✅ Fallback `callerEmail` (§ investigasi "CMS tidak muncul apa apa"): CMS
// desktop TIDAK PERNAH punya sesi Supabase asli terhadap project MartaHub
// (lihat catatan di lib/martaScope.js - akses CMS digerbangi lewat sesi
// SandraHub + pencocokan email, bukan login langsung ke project MartaHub
// spt mobile). Jadi `supabaseMarta.auth.getSession()` di CMS SELALU null,
// dan sebelumnya itu bikin fetch ini langsung throw "Belum login" tanpa
// pernah mencoba apa pun lagi - padahal fotonya sendiri ADA (tersimpan di
// Supabase Storage, `mh_documents.storage_path`), cuma proxy-nya menolak
// menyajikan krn tidak melihat token. Sekarang kalau tidak ada sesi
// Supabase asli, dikirim `email` (dari sesi SandraHub yg sudah divalidasi
// halaman CMS lewat guardMarta) sbg query param - edge function `media-view`
// yang memverifikasi email itu ke mh_profiles/mh_super_admins (server-side,
// SECURITY DEFINER), BUKAN dipercaya begitu saja dari client.
import supabaseMarta from "../../../../lib/supabaseMarta";

const FUNCTIONS_BASE = (process.env.NEXT_PUBLIC_MARTA_SUPABASE_URL || "").replace(/\/$/, "") + "/functions/v1/media-view";

/** kind: "document" (mh_documents, Submit Actual Report) | "install_photo"
 * (mh_md_installation_photos, POSM). id: primary key baris foto tsb.
 * callerEmail: opsional - fallback identitas utk caller TANPA sesi Supabase
 * MartaHub asli (mis. CMS desktop, lihat catatan di atas). Mobile (yg
 * selalu punya sesi asli) tidak perlu mengirim ini sama sekali. */
export async function fetchAuthedPhotoBlobUrl(kind, id, callerEmail) {
  const { data: sessionData } = await supabaseMarta.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token && !callerEmail) throw new Error("Belum login");

  const params = new URLSearchParams({ kind, id });
  if (!token && callerEmail) params.set("email", callerEmail);

  const res = await fetch(`${FUNCTIONS_BASE}?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Gagal memuat foto (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
