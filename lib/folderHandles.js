"use client";
// Koneksi "folder lokal" (File System Access API) untuk Batas Wilayah & Titik
// Site — TIDAK ADA lagi tombol "upload". Yang disimpan HANYA referensi folder
// (FileSystemDirectoryHandle) di IndexedDB PERANGKAT INI — bukan isi file,
// bukan payload, bukan apa pun yang dikirim ke server. Parsing file tetap
// 100% di browser (lib/geoImport.js, lib/siteImport.js), sama seperti
// sebelumnya — modul ini murni menggantikan "pilih file tiap sesi" jadi
// "hubungkan folder sekali, izin di-refresh saat perlu".
//
// Catatan keamanan: `requestPermission()`/`showDirectoryPicker()` HARUS
// dipanggil langsung dari dalam user-gesture (klik) — browser menegakkan ini,
// tidak bisa diakali dari kode. Izin bisa "hilang" browser/OS kapan saja
// (mis. sesi baru) — saat itu terjadi, satu-satunya jalan adalah user klik
// "Berikan Izin Ulang" lagi; tidak ada cara silent untuk regain akses, jadi
// tidak ada risiko folder terus terbaca tanpa sepengetahuan user.

const DB = "martahub-folder-handles", STORE = "handles", VER = 1;

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "kind" });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx(mode, fn) {
  return openDB().then((db) => new Promise((res, rej) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  }));
}

/** True kalau browser mendukung File System Access API (Chrome/Edge). */
export const supportsFolderLink =
  typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

export const saveFolderHandle = (kind, handle, folderName, lastFile) =>
  tx("readwrite", (s) => s.put({ kind, handle, folderName, lastFile: lastFile || null, ts: Date.now() }));
export const getFolderHandle = (kind) => tx("readonly", (s) => s.get(kind));
export const clearFolderHandle = (kind) => tx("readwrite", (s) => s.delete(kind));
export const setLastFile = async (kind, fileName) => {
  const rec = await getFolderHandle(kind);
  if (rec) await tx("readwrite", (s) => s.put({ ...rec, lastFile: fileName }));
};

/** Cek/minta izin baca folder. HARUS dipanggil dari dalam user-gesture (klik). */
export async function ensurePermission(handle, mode = "read") {
  if (!handle) return false;
  const opts = { mode };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  return (await handle.requestPermission(opts)) === "granted";
}

/** Cek izin TANPA meminta (aman dipanggil di luar user-gesture, mis. saat load halaman). */
export async function checkPermission(handle, mode = "read") {
  if (!handle) return false;
  try { return (await handle.queryPermission({ mode })) === "granted"; }
  catch { return false; }
}

/** Daftar file dalam folder yang cocok pola ekstensi, terurut terbaru dulu (lastModified). */
export async function listMatchingFiles(dirHandle, extRegex) {
  const out = [];
  for await (const [name, entry] of dirHandle.entries()) {
    if (entry.kind === "file" && extRegex.test(name)) {
      let lastModified = 0;
      try { const f = await entry.getFile(); lastModified = f.lastModified; } catch { /* noop */ }
      out.push({ name, handle: entry, lastModified });
    }
  }
  out.sort((a, b) => b.lastModified - a.lastModified);
  return out;
}
