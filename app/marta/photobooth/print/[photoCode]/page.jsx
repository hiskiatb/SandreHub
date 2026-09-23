"use client";
/**
 * /marta/photobooth/print/[photoCode] — halaman cetak khusus 1 foto, dibuka
 * dari kotak "masukkan ID" di layar Viewer (tab baru). Full-bleed image +
 * tombol Print (window.print) dan langsung auto-trigger print dialog begitu
 * gambar selesai dimuat, supaya operator tinggal pilih printer & OK.
 *
 * UPDATE (permintaan user - hasil print harus SAMA dgn yg dipakai operator
 * & tampil di TV Viewer): lembar cetak sekarang dirender lewat <PhotoFrame>
 * mode="print" (persis komponen & mode yg sama dipakai operator panel di
 * app/marta/photobooth/page.jsx), dgn crop/zoom/pan tersimpan milik foto ini
 * + TEMPLATE DEFAULT (is_default) yg lagi aktif - jadi bingkai/elemen custom
 * ikut tercetak, bukan cuma foto polos spt sebelumnya. @page disetel dinamis
 * mengikuti ukuran cetak (PRINT_SIZE) yg sama dgn operator.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Loader2, Printer } from "lucide-react";
import { getRpvPhotoByCode, listRpvFrameTemplates, listRpvCustomFonts } from "../../../../../lib/rpv";
import { PhotoFrame, PRINT_SIZE, TEMPLATE_GOOGLE_FONTS_HREF, customFontFaceCss, findDefaultFrameTemplate } from "../../_frame";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24";
const PRINT_RATIO = { w: PRINT_SIZE.w, h: PRINT_SIZE.h };

export default function RpvPrintPage() {
  const params = useParams();
  const photoCode = (params?.photoCode || "").toString();
  const [state, setState] = useState("loading");
  const [photo, setPhoto] = useState(null);
  const [frameTemplates, setFrameTemplates] = useState([]);
  const [customFonts, setCustomFonts] = useState([]);
  const defaultTemplate = useMemo(() => findDefaultFrameTemplate(frameTemplates), [frameTemplates]);

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

  useEffect(() => {
    Promise.resolve().then(async () => {
      try { setFrameTemplates(await listRpvFrameTemplates()); } catch { /* diamkan */ }
      try { setCustomFonts(await listRpvCustomFonts()); } catch { /* diamkan */ }
    });
  }, []);

  // Auto-print begitu foto & data template sudah siap dimuat.
  useEffect(() => {
    if (state !== "ready") return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [state, defaultTemplate]);

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
      <link rel="stylesheet" href={TEMPLATE_GOOGLE_FONTS_HREF} />
      {customFonts.length > 0 && <style>{customFontFaceCss(customFonts)}</style>}
      <div className="rpv-print-toolbar" style={{ width: "100%", padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", color: "#F0F0F2" }}>
        <span style={{ fontSize: 12.5, fontFamily: "monospace", letterSpacing: "0.06em" }}>ID {photo.queue_label || photo.photo_code}</span>
        <button onClick={() => window.print()}
          style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px", borderRadius: 10, border: "none", background: RED, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          <Printer size={15} /> Print
        </button>
      </div>
      <div className="rpv-print-area" style={{ flex: 1, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div className="rpv-print-frame-onscreen" style={{ maxWidth: "min(84vw, 420px)", maxHeight: "80svh", aspectRatio: `${PRINT_RATIO.w} / ${PRINT_RATIO.h}`, borderRadius: 8, overflow: "hidden", boxShadow: "0 18px 44px rgba(0,0,0,0.45)" }}>
          <PhotoFrame photo={photo} ratio={PRINT_RATIO} crop={photo.crop} mode="screen"
            frame={defaultTemplate ? "custom" : "none"} customBaseStyle={defaultTemplate?.baseStyle}
            customElements={defaultTemplate?.elements} customFonts={customFonts} queueLabel={photo.queue_label} />
        </div>
      </div>

      {/* Lembar cetak sungguhan (mode="print") - tersembunyi di layar,
          HANYA muncul saat window.print() lewat @media print di bawah -
          persis pola yg sama dgn operator panel (app/marta/photobooth/page.jsx). */}
      <div className="rpv-print-sheet-wrap">
        <PhotoFrame photo={photo} ratio={PRINT_RATIO} crop={photo.crop} mode="print"
          frame={defaultTemplate ? "custom" : "none"} customBaseStyle={defaultTemplate?.baseStyle}
          customElements={defaultTemplate?.elements} customFonts={customFonts} queueLabel={photo.queue_label} />
      </div>
      <style>{`@page { size: ${PRINT_RATIO.w}cm ${PRINT_RATIO.h}cm; margin: 0; }`}</style>
      <style>{`
        .rpv-print-sheet-wrap { display: none; }
        @media print {
          .rpv-print-toolbar, .rpv-print-frame-onscreen { display: none !important; }
          body, html { background: #fff !important; margin: 0; }
          .rpv-print-area { padding: 0 !important; }
          .rpv-print-sheet-wrap { display: block !important; }
        }
      `}</style>
    </div>
  );
}
