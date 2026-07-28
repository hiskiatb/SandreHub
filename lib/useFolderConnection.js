"use client";
// Hook generik "Hubungkan Folder" untuk fitur yang butuh baca SATU file dari
// folder lokal secara berkala (Validasi Lokasi/Outlet Lat/Lng Master,
// Validity MSISDN, dst.) — beda dari lib/folderHandles.js (primitif murni)
// dan useGeoLayers di SumatraMap.jsx (khusus multi-layer peta). HANYA
// referensi folder yang "diingat" di IndexedDB perangkat ini — isi file
// SELALU dibaca ulang langsung dari disk tiap kali dibutuhkan, tidak pernah
// dikirim ke server mana pun (§0.2). Pemetaan kolom (kalau ada) tetap lewat
// mekanisme server terpisah yang sudah ada (mh_local_folder_links) — hook ini
// cuma menangani "dapat File dari mana", bukan isi/mapping-nya.
import { useState, useRef, useEffect, useCallback } from "react";
import {
  supportsFolderLink, saveFolderHandle, getFolderHandle, clearFolderHandle,
  setLastFile, ensurePermission, checkPermission, listMatchingFiles,
} from "./folderHandles";

/**
 * @param kind      string unik per fitur, mis. 'outlet_master', 'validity_msisdn'
 * @param extRegex  RegExp ekstensi file yang valid
 * @param onFile    (file: File|null) => void|Promise — dipanggil tiap kali ada
 *                  file baru siap dibaca (dari folder ATAU fallback input),
 *                  atau `null` saat folder diputuskan (reset state pemanggil).
 */
export function useFolderConnection(kind, extRegex, onFile) {
  const handleRef = useRef(null);
  const fileRef = useRef(null); // <input type=file> fallback (browser tanpa File System Access API)
  const onFileRef = useRef(onFile); onFileRef.current = onFile;
  const [folder, setFolder] = useState(null); // { name, needsPermission, files, activeFile } | null
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const scan = useCallback(async () => {
    if (!handleRef.current) return [];
    try {
      const files = await listMatchingFiles(handleRef.current, extRegex);
      setFolder((f) => (f ? { ...f, files, needsPermission: false } : f));
      return files;
    } catch (e) { setErr("Gagal membaca isi folder: " + (e.message || e)); return []; }
  }, [extRegex]);

  const loadEntry = useCallback(async (entry) => {
    setBusy(true); setErr("");
    try {
      const file = await entry.handle.getFile();
      await onFileRef.current?.(file);
      await setLastFile(kind, entry.name);
      setFolder((f) => (f ? { ...f, activeFile: entry.name } : f));
    } catch (e) { setErr("Gagal membaca berkas: " + (e.message || e)); }
    finally { setBusy(false); }
  }, [kind]);

  const connect = useCallback(async () => {
    if (!supportsFolderLink) return;
    setErr("");
    try {
      const dirHandle = await window.showDirectoryPicker();
      handleRef.current = dirHandle;
      await saveFolderHandle(kind, dirHandle, dirHandle.name);
      setFolder({ name: dirHandle.name, needsPermission: false, files: [], activeFile: null });
      const files = await listMatchingFiles(dirHandle, extRegex);
      setFolder((f) => (f ? { ...f, files } : f));
      if (files.length) await loadEntry(files[0]);
      else setErr("Tidak ada berkas yang cocok di folder ini.");
    } catch (e) { if (e?.name !== "AbortError") setErr("Gagal menghubungkan folder: " + (e.message || e)); }
  }, [extRegex, kind, loadEntry]);

  const reauthorize = useCallback(async () => {
    if (!handleRef.current) return;
    const ok = await ensurePermission(handleRef.current);
    if (!ok) { setErr("Izin folder ditolak — data tidak bisa dibaca sampai izin diberikan."); return; }
    setFolder((f) => (f ? { ...f, needsPermission: false } : f));
    const files = await scan();
    const rec = await getFolderHandle(kind);
    const preferred = files.find((f2) => f2.name === rec?.lastFile) || files[0];
    if (preferred) await loadEntry(preferred);
  }, [kind, scan, loadEntry]);

  // "Refresh" memuat ulang periode yang SEDANG AKTIF (bukan lompat ke file
  // terbaru) — supaya tidak diam-diam mengganti pilihan periode user.
  const refresh = useCallback(async () => {
    setErr("");
    const files = await scan();
    if (!files.length) return;
    setFolder((current) => {
      const same = files.find((f) => f.name === current?.activeFile);
      loadEntry(same || files[0]);
      return current;
    });
  }, [scan, loadEntry]);

  const disconnect = useCallback(async () => {
    await clearFolderHandle(kind);
    handleRef.current = null;
    setFolder(null);
    await onFileRef.current?.(null);
  }, [kind]);

  const pickFile = useCallback((entry) => loadEntry(entry), [loadEntry]);

  const onPickFallback = useCallback(async (ev) => {
    const file = ev.target.files?.[0];
    if (ev.target) ev.target.value = "";
    if (!file) return;
    setBusy(true); setErr("");
    try { await onFileRef.current?.(file); }
    catch (e) { setErr(e.message || "Gagal membaca berkas."); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => {
    (async () => {
      if (!supportsFolderLink) return;
      try {
        const rec = await getFolderHandle(kind);
        if (!rec?.handle) return;
        handleRef.current = rec.handle;
        const granted = await checkPermission(rec.handle);
        setFolder({ name: rec.folderName, needsPermission: !granted, files: [], activeFile: rec.lastFile });
        if (granted) {
          const files = await listMatchingFiles(rec.handle, extRegex);
          setFolder((f) => (f ? { ...f, files } : f));
          const preferred = files.find((f2) => f2.name === rec.lastFile) || files[0];
          if (preferred) await loadEntry(preferred);
        }
      } catch { /* noop */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  return { supportsFolderLink, folder, busy, err, fileRef, onPickFallback, connect, reauthorize, refresh, disconnect, pickFile };
}
