"use client";
/**
 * /marta/photobooth/print/[photoCode] — halaman cetak khusus 1 foto, dibuka
 * dari kotak "masukkan ID" di layar Viewer (tab baru). Full-bleed image +
 * tombol Print (window.print) dan langsung auto-trigger print dialog begitu
 * gambar selesai dimuat, supaya operator tinggal pilih printer & OK.
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Loader2, Printer } from "lucide-react";
import { getRpvPhotoByCode } from "../../../../../lib/rpv";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24";

export default function RpvPrintPage() {
  const params = useParams();
  const photoCode = (params?.photoCode || "").toString();
  const [state, setState] = useState("loading");
  const [photo, setPhoto] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await getRpvPhotoByCode(photoCode);
        if (!p) { setState("notfound"); return; }
        setPhoto(p);
        setState("ready");
      } catch { setState("notfound"); }
    })();
  }, [photoCode]);

  if (state === "loading") {
    return (
      <div style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
        <Loader2 size={26} color={RED} style={{ animation: "spin 1s linear infinite" }} />
        <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
      </div>
    );
  }
  if (state === "notfound") {
    return (
      <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: FONT, gap: 10 }}>
        <AlertTriangle size={28} color={RED} />
        <div style={{ fontSize: 14, fontWeight: 700 }}>ID foto tidak ditemukan.</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100svh", background: "#111116", fontFamily: FONT, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div className="rpv-print-toolbar" style={{ width: "100%", padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", color: "#F0F0F2" }}>
        <span style={{ fontSize: 12.5, fontFamily: "monospace", letterSpacing: "0.06em" }}>ID {photo.photo_code}</span>
        <button onClick={() => window.print()}
          style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px", borderRadius: 10, border: "none", background: RED, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          <Printer size={15} /> Print
        </button>
      </div>
      <div className="rpv-print-area" style={{ flex: 1, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <img src={photo.url} alt="" onLoad={() => setTimeout(() => window.print(), 300)}
          style={{ maxWidth: "100%", maxHeight: "80svh", borderRadius: 8, objectFit: "contain" }} />
      </div>
      <style>{`
        @media print {
          .rpv-print-toolbar { display: none !important; }
          body, html { background: #fff !important; margin: 0; }
          .rpv-print-area { padding: 0 !important; }
          .rpv-print-area img { max-height: none !important; width: 100% !important; height: auto !important; border-radius: 0 !important; }
        }
      `}</style>
    </div>
  );
}
