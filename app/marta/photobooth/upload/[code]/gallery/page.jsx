"use client";
/**
 * /marta/photobooth/upload/[code]/gallery — GALERI FOTO KAMERA sesi ini,
 * khusus foto ASLI hasil kamera/upload tamu, dipakai buat (1) drag foto
 * keluar (mis. ke tab Gemini di HP/laptop) & (2) download/lihat foto satu2.
 * Upload BALIK hasil edit Gemini SENGAJA dipisah ke halaman tersendiri
 * (/marta/photobooth/upload/[code]/gemini, tema ungu) supaya menunya jelas
 * beda - "pisahkan dengan jelas mana menu foto kamera, mana menu upload
 * hasil gemini" - sebelumnya dua-duanya campur di 1 halaman ini. Foto
 * native `<img>` sudah draggable secara default di browser (drag keluar
 * ke app lain/tab lain bekerja tanpa library tambahan) - ditambah tombol
 * "Download" & "Buka di Tab Baru" per foto utk device yg drag-nya tidak
 * semulus itu (mis. sebagian HP).
 */
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Download, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { getRpvSession, listRpvPhotos, subscribeRpvPhotos, rpvPublicUrl } from "../../../../../../lib/rpv";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24";
const MAGA = "#C6168D";

export default function RpvGalleryPage() {
  const params = useParams();
  const code = (params?.code || "").toString().toUpperCase();
  const unsubRef = useRef(null);

  const [state, setState] = useState("loading");
  const [session, setSession] = useState(null);
  const [photos, setPhotos] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const s = await getRpvSession(code);
        if (!s || !s.is_active) { setState("notfound"); return; }
        setSession(s);
        setPhotos(await listRpvPhotos(code));
        setState("ready");
        unsubRef.current = subscribeRpvPhotos(s.id, (row) => {
          const photoCode = row.photo_code ?? row.code;
          setPhotos((prev) => (prev.some((p) => p.photo_code === photoCode) ? prev : [{ photo_code: photoCode, storage_path: row.storage_path, uploaded_at: row.uploaded_at, is_ai_result: row.is_ai_result, url: rpvPublicUrl(row.storage_path) }, ...prev]));
        }, { sessionCode: code });
      } catch { setState("notfound"); }
    })();
    return () => unsubRef.current?.();
  }, [code]);

  if (state === "loading") return <Center><Loader2 size={26} color={RED} style={{ animation: "spin 1s linear infinite" }} /></Center>;
  if (state === "notfound") return <Center><AlertTriangle size={28} color={RED} /><div style={{ marginTop: 10, fontWeight: 700 }}>Sesi tidak ditemukan</div></Center>;

  return (
    <div style={{ minHeight: "100svh", background: "#F4F4F6", fontFamily: FONT }}>
      <div style={{ padding: "18px 16px 12px", background: "#fff", borderBottom: "1px solid #E4E2EA", position: "sticky", top: 0, zIndex: 5 }}>
        <Link href={`/marta/photobooth/upload/${code}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#8A8A96", fontWeight: 700, textDecoration: "none" }}>
          <ArrowLeft size={14} /> Kembali unggah
        </Link>
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#111116" }}>{session?.title}</div>
            <div style={{ fontSize: 11.5, color: "#8A8A96", marginTop: 1 }}>{photos.length} foto kamera · tahan &amp; seret foto keluar utk dipakai di Gemini</div>
          </div>
          {/* Link ke halaman upload-balik hasil Gemini - SENGAJA jadi
              tombol terpisah & bertema beda (ungu vs merah galeri ini) spy
              jelas ini menu LAIN, bukan bagian dari galeri foto kamera. */}
          <Link href={`/marta/photobooth/upload/${code}/gemini`}
            style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, height: 34, padding: "0 12px", borderRadius: 10, background: `linear-gradient(135deg,#7C3AED,${MAGA})`, color: "#fff", fontSize: 11.5, fontWeight: 800, textDecoration: "none" }}>
            <Sparkles size={13} /> Hasil Gemini
          </Link>
        </div>
      </div>

      <div style={{ padding: "10px 16px 60px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
        {photos.map((p) => (
          <div key={p.photo_code} style={{ position: "relative", borderRadius: 12, overflow: "hidden", aspectRatio: "1/1", background: "#E4E2EA" }}>
            <img src={p.url} alt="" draggable style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            {p.is_ai_result && (
              <div style={{ position: "absolute", top: 5, left: 5, display: "flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 800, color: "#fff", background: `linear-gradient(135deg,${RED},${MAGA})`, borderRadius: 999, padding: "2.5px 7px" }}>
                <Sparkles size={9} /> AI
              </div>
            )}
            <div style={{ position: "absolute", bottom: 5, right: 5, display: "flex", gap: 4 }}>
              <a href={p.url} download target="_blank" rel="noreferrer" title="Download"
                style={{ width: 24, height: 24, borderRadius: 999, background: "rgba(0,0,0,0.55)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Download size={12} />
              </a>
              <a href={p.url} target="_blank" rel="noreferrer" title="Buka di tab baru"
                style={{ width: 24, height: 24, borderRadius: 999, background: "rgba(0,0,0,0.55)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        ))}
      </div>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}

function Center({ children }) {
  return <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#F4F4F6", fontFamily: FONT }}>{children}<style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style></div>;
}
