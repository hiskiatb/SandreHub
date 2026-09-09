// lib/sdp/driveRelay.js
// Upload dokumen SDP (bucket privat `sdp-docs`, path documents/<sdp_id>/…),
// lalu relay otomatis ke Google Drive lewat edge function di project
// MartaHub (pemltwhyidrajbyzynks) — REUSE kredensial service account yang
// sama, tidak ada secret baru di project TraceHub. Struktur di Drive:
// <root>/SDP/<sdp_id>/<nama file>.
//
// Alur per file: upload ke Storage → insert baris sdp_documents (status
// 'uploaded') → buat signed URL sementara → panggil edge function → update
// status jadi 'synced' (+ drive_file_id) atau 'failed' (+ error_note).
// Kalau relay gagal, file TETAP aman di Storage — tidak pernah hilang,
// tinggal retry.

const BUCKET = "sdp-docs";
const RELAY_URL = "https://pemltwhyidrajbyzynks.supabase.co/functions/v1/sdp-doc-drive-upload";
const RELAY_ANON_KEY = process.env.NEXT_PUBLIC_MARTA_SUPABASE_ANON_KEY;

async function relayToDrive({ sdp_id, file_name, mime_type, signed_url }) {
  const res = await fetch(RELAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(RELAY_ANON_KEY ? { apikey: RELAY_ANON_KEY, Authorization: `Bearer ${RELAY_ANON_KEY}` } : {}),
    },
    body: JSON.stringify({ sdp_id, file_name, mime_type, signed_url }),
  });
  if (!res.ok) throw new Error(`relay HTTP ${res.status}`);
  return res.json(); // { ok, drive_file_id?, drive_folder_path?, reason? }
}

/** Upload 1 file dokumen untuk sdp_id tertentu + relay ke Drive. */
export async function uploadSdpDocument({ supabase, sdpId, file, uploaderId, uploaderName }) {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `documents/${sdpId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safe}`;

  const { error: upErr } = await supabase.storage.from(BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) throw upErr;

  const { data: row, error: insErr } = await supabase.from("sdp_documents")
    .insert({
      sdp_id: sdpId, file_name: file.name, storage_path: path,
      status: "uploaded", uploaded_by: uploaderId || null, uploaded_by_name: uploaderName || null,
    })
    .select().single();
  if (insErr) throw insErr;

  try {
    const { data: signedData, error: signErr } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
    if (signErr || !signedData?.signedUrl) throw signErr || new Error("Gagal membuat signed URL.");

    await supabase.from("sdp_documents").update({ status: "relaying" }).eq("id", row.id);

    const relayRes = await relayToDrive({
      sdp_id: sdpId, file_name: file.name, mime_type: file.type, signed_url: signedData.signedUrl,
    });

    if (relayRes.ok) {
      await supabase.from("sdp_documents").update({
        status: "synced", drive_file_id: relayRes.drive_file_id,
        drive_folder_id: relayRes.drive_folder_id || null,
        drive_folder_path: relayRes.drive_folder_path || `SDP/${sdpId}`,
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
    } else {
      await supabase.from("sdp_documents").update({
        status: "failed", error_note: relayRes.reason || "Gagal tidak diketahui.",
      }).eq("id", row.id);
    }
  } catch (e) {
    await supabase.from("sdp_documents").update({
      status: "failed", error_note: String(e?.message || e),
    }).eq("id", row.id);
  }

  const { data: fresh } = await supabase.from("sdp_documents").select("*").eq("id", row.id).single();
  return fresh || row;
}

export async function listSdpDocuments({ supabase, sdpId }) {
  const { data, error } = await supabase.from("sdp_documents")
    .select("*").eq("sdp_id", sdpId).order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Retry relay untuk dokumen yang statusnya 'failed'. */
export async function retrySdpDocumentRelay({ supabase, doc }) {
  await supabase.from("sdp_documents").update({ status: "relaying", error_note: null }).eq("id", doc.id);
  try {
    const { data: signedData, error: signErr } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, 600);
    if (signErr || !signedData?.signedUrl) throw signErr || new Error("Gagal membuat signed URL.");
    const relayRes = await relayToDrive({
      sdp_id: doc.sdp_id, file_name: doc.file_name, mime_type: null, signed_url: signedData.signedUrl,
    });
    if (relayRes.ok) {
      await supabase.from("sdp_documents").update({
        status: "synced", drive_file_id: relayRes.drive_file_id,
        drive_folder_id: relayRes.drive_folder_id || null,
        drive_folder_path: relayRes.drive_folder_path || `SDP/${doc.sdp_id}`,
        updated_at: new Date().toISOString(),
      }).eq("id", doc.id);
    } else {
      await supabase.from("sdp_documents").update({ status: "failed", error_note: relayRes.reason || "Gagal tidak diketahui." }).eq("id", doc.id);
    }
  } catch (e) {
    await supabase.from("sdp_documents").update({ status: "failed", error_note: String(e?.message || e) }).eq("id", doc.id);
  }
}

export async function openSdpDocument({ supabase, storagePath }) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  if (!error && data?.signedUrl) window.open(data.signedUrl, "_blank");
}

/** Link folder Drive publik-internal (butuh login akun yg sama dgn service account share). */
export function sdpDriveFolderUrl(folderId) {
  return folderId ? `https://drive.google.com/drive/folders/${folderId}` : null;
}

export function sdpDriveFileUrl(fileId) {
  return fileId ? `https://drive.google.com/file/d/${fileId}/view` : null;
}
