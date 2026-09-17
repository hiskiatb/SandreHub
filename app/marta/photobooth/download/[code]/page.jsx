"use client";
/**
 * /marta/photobooth/download/[code] — halaman PUBLIK, tujuan QR di layar
 * Viewer. Siapa pun yang scan bisa lihat & download foto-foto sesi ini,
 * satu-satu atau semuanya sekaligus (dizip di browser, pakai jszip yg sudah
 * ada di project ini).
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Camera, Download, ImageOff, Loader2, PackageCheck } from "lucide-react";
import { getRpvSession, listRpvPhotos } from "../../../../../lib/rpv";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24";
const MAGA = "#C6168D";

export default function RpvDownloadPage() {
  const params = useParams();
  const code = (params?.code || "").toString().toUpperCase();

  const [state, setState] = useState("loading");
  const [session, setSession] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [zipping, setZipping] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await getRpvSession(code);
        if (!s) { setState("notfound"); return; }
        setSession(s);
        setPhotos(await listRpvPhotos(code));
        setState("ready");
      } catch { setState("notfound"); }
    })();
  }, [code]);

  const downloadAll = async () => {
    setZipping(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      await Promise.all(photos.map(async (p) => {
        const res = await fetch(p.url);
        const blob = await res.blob();
        zip.file(`${code}-${p.photo_code}.jpg`, blob);
      }));
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `photobooth-${code}.zip`;
      a.click();
    } catch {
      alert("Gagal membuat file zip.");
    } finally { setZipping(false); }
  };

  if (state === "loading") return <Center><Loader2 size={26} color={RED} style={{ animation: "spin 1s linear infinite" }} /></Center>;
  if (state === "notfound") {
    return (
      <Center>
        <AlertTriangle size={30} color={RED} />
        <div style={{ marginTop: 12, fontSize: 15, fontWeight: 700, color: "#111116" }}>Sesi tidak ditemukan</div>
      </Center>
    );
  }

  return (
    <div style={{ minHeight: "100svh", background: "#F4F4F6", fontFamily: FONT }}>
      <div style={{ padding: "22px 18px", background: "#fff", borderBottom: "1px solid #E4E2EA", position: "sticky", top: 0, zIndex: 5 }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 38, height: 38, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff" }}>
              <Camera size={18} />
            </span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#111116" }}>{session?.title}</div>
              <div style={{ fontSize: 11.5, color: "#8A8A96" }}>{photos.length} foto tersedia · kode {code}</div>
            </div>
          </div>
          {photos.length > 0 && (
            <button onClick={downloadAll} disabled={zipping}
              style={{ display: "flex", alignItems: "center", gap: 7, height: 40, padding: "0 16px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontWeight: 700, fontSize: 13, cursor: zipping ? "not-allowed" : "pointer" }}>
              {zipping ? <Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> : <PackageCheck size={14} />} Download Semua (.zip)
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 18px 60px" }}>
        {photos.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#8A8A96" }}>
            <ImageOff size={30} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 13.5 }}>Belum ada foto di sesi ini.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
            {photos.map((p) => (
              <div key={p.photo_code} style={{ position: "relative", borderRadius: 14, overflow: "hidden", aspectRatio: "3/4", background: "#E4E2EA", boxShadow: "0 1px 3px rgba(13,17,23,0.06)" }}>
                <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <a href={p.url} download={`${code}-${p.photo_code}.jpg`}
                  style={{ position: "absolute", right: 8, bottom: 8, width: 34, height: 34, borderRadius: 999, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", textDecoration: "none" }}>
                  <Download size={15} />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}

function Center({ children }) {
  return (
    <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#F4F4F6", fontFamily: FONT }}>
      {children}
    </div>
  );
}
