"use client";
/**
 * app/marta/photobooth/_frame.jsx — SATU SUMBER KEBENARAN utk render
 * "PhotoFrame" (foto + crop zoom/pan/rotate/flip + bingkai/template custom)
 * dan semua helper terkait template (font, elemen custom, dsb).
 *
 * SEBELUMNYA kode ini didefinisikan ganda: sekali di panel operator
 * (app/marta/photobooth/page.jsx) - tempat operator mengedit template &
 * menyesuaikan crop - dan TIDAK SAMA SEKALI dipakai di layar TV Viewer
 * (app/marta/photobooth/viewer/[code]/page.jsx), yg cuma menampilkan
 * `<img src={photo.url}>` mentah tanpa crop maupun bingkai/template.
 * Akibatnya: penyesuaian zoom/crop operator TIDAK pernah muncul di TV, dan
 * bingkai/template custom yg dibuat operator juga tidak pernah dipakai di
 * TV - persis 2 masalah yg diminta diperbaiki ("saat dicetak dia tidak
 * kesimpan" + "pada viewer tv juga gunakan template default").
 *
 * Modul ini DIEKSTRAK supaya kedua halaman (panel operator & TV Viewer)
 * memakai fungsi PERSIS SAMA utk merender foto+crop+template - dijamin
 * WYSIWYG, tidak ada celah drift antara apa yg operator atur & apa yg
 * tampil di TV/hasil cetak, karena keduanya literal memanggil komponen yg
 * sama, bukan reimplementasi terpisah yg gampang tidak sinkron.
 */
import { ImageOff } from "lucide-react";

export const FONT = `"Google Sans","DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
export const MAGA = "#C6168D";
const MUTED = "#8A8D91";

// Ukuran cetak DIKUNCI - dipakai baik utk lembar cetak sungguhan
// (window.print) MAUPUN sbg rasio aspek foto di preview operator & TV
// Viewer, supaya framing yg operator lihat & atur (crop/zoom/template)
// BENAR2 sama dgn hasil cetak fisik, bukan cuma "mirip".
// UPDATE (permintaan user - ganti dari 2R ke 4R): 4R standar = 4 x 6 inch
// = 1200 x 1800 px @300dpi (rasio 2:3, sama dgn 0.667 yg dipakai 2R versi
// 6x9cm sebelumnya - kebetulan rasionya identik, cuma ukuran fisiknya yg
// membesar). 4in = 10.16cm, 6in = 15.24cm.
export const PRINT_SIZE = { label: "4R", w: 10.16, h: 15.24 };

// Crop/zoom/pan/rotate/flip default sebuah foto sblm operator menyesuaikan
// & menyimpannya (lihat saveRpvPhotoCrop di lib/rpv.js - disimpan PER FOTO
// di kolom rpv_photos.crop_json, bukan cuma state React lokal, supaya tidak
// hilang saat pindah foto/reload/dibuka di TV Viewer).
export const DEFAULT_CROP = { zoom: 1, panX: 0, panY: 0, rotate: 0, flipX: false, flipY: false };
// Rotasi yg biasa dibutuhkan case cetak (foto kepotret miring/landscape ke
// potret dst) - dibatasi ke kelipatan 90° saja (bkn rotasi bebas) supaya
// hasil cetak TETAP presisi ngepas bingkai ukuran cetak, tapi operator
// tetap bisa lihat derajat persisnya di label tombol.
export const ROTATE_STEP = 90;

// Pilihan font utk kotak teks template custom - dimuat lewat Google Fonts
// (lihat <link> TEMPLATE_GOOGLE_FONTS_HREF, dirender di root kedua halaman)
// supaya benar2 tampil sesuai nama font-nya baik di layar (operator/TV)
// MAUPUN saat dicetak (window.print ikut memakai stylesheet yg sama).
export const TEMPLATE_FONTS = [
  { key: "dm-sans", label: "DM Sans", css: `"DM Sans", sans-serif` },
  { key: "poppins", label: "Poppins", css: `"Poppins", sans-serif` },
  { key: "playfair", label: "Playfair Display", css: `"Playfair Display", serif` },
  { key: "oswald", label: "Oswald", css: `"Oswald", sans-serif` },
  { key: "caveat", label: "Caveat", css: `"Caveat", cursive` },
  { key: "roboto-mono", label: "Roboto Mono", css: `"Roboto Mono", monospace` },
];
export const TEMPLATE_FONT_MAP = Object.fromEntries(TEMPLATE_FONTS.map((f) => [f.key, f]));
export const TEMPLATE_GOOGLE_FONTS_HREF = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700&family=Poppins:wght@400;700&family=Playfair+Display:wght@400;700&family=Oswald:wght@400;700&family=Caveat:wght@400;700&family=Roboto+Mono:wght@400;700&display=swap";

/** fontKey elemen teks bisa berupa key bawaan ("dm-sans" dkk, lihat
 * TEMPLATE_FONT_MAP) ATAU "custom:<id>" utk font upload sendiri operator
 * (lihat rpv_custom_fonts) - resolver ini yg nentuin nama CSS font-family
 * final dipakai <span> teks di PhotoFrame, cocok dgn @font-face yg
 * diinject dari daftar customFonts (lihat customFontFaceCss di bawah). */
export function resolveTemplateFontCss(fontKey, customFonts) {
  if (fontKey && fontKey.startsWith("custom:")) {
    const id = fontKey.slice(7);
    const found = (customFonts || []).find((f) => f.id === id);
    return found ? `"rpv-cf-${id}", sans-serif` : FONT;
  }
  return TEMPLATE_FONT_MAP[fontKey]?.css || FONT;
}
/** @font-face utk semua font custom tersimpan - dibuat sekali dari daftar
 * `customFonts`, format ditebak dari ekstensi file yg diupload. Dipakai
 * baik di panel operator maupun TV Viewer (keduanya render <style> ini di
 * root halaman) supaya font custom tampil identik di kedua tempat. */
export function customFontFaceCss(customFonts) {
  return (customFonts || []).map((f) => {
    const ext = (f.storagePath || "").split(".").pop()?.toLowerCase();
    const fmt = ext === "otf" ? "opentype" : ext === "woff" ? "woff" : ext === "woff2" ? "woff2" : "truetype";
    return `@font-face { font-family: "rpv-cf-${f.id}"; src: url("${f.url}") format("${fmt}"); font-display: swap; }`;
  }).join("\n");
}

/** Elemen kosong baru utk template custom - posisi/ukuran dlm PERSEN thd
 * bingkai (bukan px/cm) supaya resolution-independent: posisi identik baik
 * dipreview di layar (ukuran px berubah2 sesuai lebar panel) MAUPUN dicetak
 * fisik (ukuran cm tetap) MAUPUN dimuat ulang dari template tersimpan -
 * TIDAK ADA transformasi/normalisasi apa pun saat simpan/muat, jadi elemen
 * dijamin TIDAK bergeser sedikit pun dari posisi yg diatur operator. */
export function newTemplateTextElement() {
  return {
    id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: "text", xPct: 14, yPct: 40, wPct: 72, hPct: 20,
    text: "Teks Baru", fontKey: "dm-sans", fontSizePct: 7, bold: false, color: "#FFFFFF", align: "center",
  };
}
export function newTemplateImageElement(url) {
  return {
    id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: "image", xPct: 30, yPct: 30, wPct: 40, hPct: 40, url,
  };
}
/** Elemen "Bingkai (PNG Lubang)" - permintaan user: upload template siap
 * pakai yg SUDAH ada bagian bolong/transparan utk fotonya (dibuat di app
 * desain lain), lalu dipasang di FlashPrint tinggal pakai, bukan nyusun
 * dari nol pakai kotak gambar kecil yg harus digeser/diresize manual dulu.
 * Beda dari newTemplateImageElement (default 40x40% di tengah, ukuran
 * dekorasi kecil) - elemen ini langsung dipasang PENUH 0/0/100/100% (nutup
 * seluruh bingkai persis di atas foto), jadi bagian PNG yg transparan
 * (lubangnya) otomatis "menampakkan" foto di baliknya tanpa operator perlu
 * atur posisi/ukuran sama sekali - upload langsung jadi. Tetap elemen tipe
 * "image" biasa (bisa digeser/diresize lagi kalau perlu), cuma beda titik
 * awal. */
export function newTemplateFrameOverlayElement(url) {
  return {
    id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: "image", xPct: 0, yPct: 0, wPct: 100, hPct: 100, url,
  };
}
export function newTemplateShapeElement() {
  return {
    id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    // radiusPct: 0-50, dipasang LANGSUNG sbg CSS `border-radius: X%` pada
    // kotak elemen itu sendiri - border-radius persen di CSS otomatis
    // relatif thd ukuran box-nya sendiri, jadi resolution-independent tanpa
    // perlu hitungan px/cm terpisah spt fontSizePct (sama persis di preview
    // layar MAUPUN cetak fisik). 50% = pill/elips penuh.
    type: "shape", xPct: 30, yPct: 30, wPct: 40, hPct: 20, color: "#C6168D", radiusPct: 12,
  };
}
export const clampPct = (v, min, max) => Math.round(Math.max(min, Math.min(max, v)) * 100) / 100;

/** Satu foto + crop (zoom/pan) + bingkai, dipakai UTUH baik di preview layar
 * (mode="screen", ukuran px tetap) MAUPUN di lembar cetak sungguhan (mode=
 * "print", ukuran FISIK dlm cm) MAUPUN di TV Viewer (mode="screen", tanpa
 * prop interaktif) - crop pakai transform scale+translate(%) yg resolution-
 * independent, jadi hasil preview/TV/cetak DIJAMIN identik. */
export function PhotoFrame({ photo, ratio, crop, frame, mode, queueLabel, sessionTitle, imgRef, onPointerDown, customElements, customBaseStyle, customFonts, onElementPointerDown, selectedElId, wrapperRef }) {
  const isPolaroid = frame === "white";
  const isCustom = frame === "custom";
  // "Custom" bisa pakai bentuk dasar "polaroid" (foto diberi margin putih +
  // strip putih bawah, spt "Polaroid Putih") supaya operator bisa taruh
  // elemen (teks/gambar) di area putihnya juga - atau "none" (foto penuh).
  const isPolaroidShape = isPolaroid || (isCustom && customBaseStyle === "polaroid");
  const sizeStyle = mode === "print"
    ? { width: `${ratio.w}cm`, height: `${ratio.h}cm` }
    : { width: "100%", aspectRatio: `${ratio.w} / ${ratio.h}` };
  const photoAreaStyle = isPolaroidShape
    ? { position: "absolute", left: "4%", right: "4%", top: "4%", bottom: "16%" }
    : { position: "absolute", inset: 0 };
  const interactive = typeof onElementPointerDown === "function";
  const c = crop || DEFAULT_CROP;
  // Token dinamis dlm kotak teks custom - "{Nama Event}"/"{Photo ID}" diganti
  // isi sungguhan sesi/foto aktif, SAAT RENDER SAJA (bukan disimpan sbg teks
  // statis) - jadi 1 template bisa dipakai berulang, teksnya otomatis ikut
  // sesi manapun yg lagi aktif. Fallback tampil kalau belum ada sesi/foto
  // (spt di editor) supaya operator tetap lihat di mana token itu muncul.
  const resolveTemplateText = (text) => String(text || "")
    .replaceAll("{Nama Event}", sessionTitle || "Nama Event")
    .replaceAll("{Photo ID}", queueLabel || "00000");
  return (
    <div ref={wrapperRef} style={{
      ...sizeStyle, position: "relative", overflow: "hidden", backgroundColor: isPolaroidShape ? "#fff" : "#000",
      borderRadius: mode === "print" ? 0 : 10,
      // containerType:"size" - dasar unit `cqh` dipakai ukuran font elemen
      // teks custom di bawah, supaya font-size SELALU proporsional thd
      // TINGGI bingkai sungguhan (bukan thd font induk spt unit % biasa),
      // baik saat preview layar (lebar berubah2) maupun saat dicetak.
      containerType: "size",
    }}>
      <div style={{ ...photoAreaStyle, overflow: "hidden", background: "#000" }}>
        {photo ? (
          <img ref={imgRef} src={photo.url} alt="" draggable={false}
            onPointerDown={mode === "screen" ? onPointerDown : undefined}
            style={{
              width: "100%", height: "100%", objectFit: "cover", display: "block",
              cursor: mode === "screen" && onPointerDown ? "grab" : "default", touchAction: "none",
              // Urutan transform: rotate+flip DULU (posisi/orientasi dasar
              // foto), baru scale+translate (zoom/pan operator) - supaya
              // drag-geser & zoom tetap terasa wajar walau foto sudah
              // diputar/dibalik.
              transform: `scale(${c.zoom}) translate(${c.panX}%, ${c.panY}%) rotate(${c.rotate}deg) scaleX(${c.flipX ? -1 : 1}) scaleY(${c.flipY ? -1 : 1})`,
              transformOrigin: "center center",
            }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: MUTED }}>
            <ImageOff size={mode === "print" ? 24 : 22} />
          </div>
        )}
      </div>
      {isPolaroid && (
        <div style={{ position: "absolute", left: "4%", right: "4%", bottom: "4%", height: "10%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
          <span style={{ fontSize: mode === "print" ? "0.32cm" : 10.5, fontWeight: 800, color: "#17181C" }}>{sessionTitle || "FlashPrint"}</span>
          <span style={{ fontSize: mode === "print" ? "0.26cm" : 9, color: "#8A8A96", fontFamily: "monospace", letterSpacing: "0.06em" }}>{queueLabel}</span>
        </div>
      )}
      {/* Bingkai "Custom" - render PERSIS elemen tersimpan (posisi/ukuran %
          apa adanya, TANPA normalisasi) - dipakai IDENTIK di preview layar,
          lembar cetak sungguhan, TV Viewer, MAUPUN di dalam editor template
          (lewat prop interaktif opsional di bawah), supaya WYSIWYG & tidak
          ada celah drift antar tampilan. */}
      {isCustom && (customElements || []).map((el) => {
        const isSelected = interactive && el.id === selectedElId;
        const justify = el.align === "left" ? "flex-start" : el.align === "right" ? "flex-end" : "center";
        return (
          <div key={el.id}
            onPointerDown={interactive ? (e) => onElementPointerDown(e, el, "move") : undefined}
            style={{
              position: "absolute", left: `${el.xPct}%`, top: `${el.yPct}%`, width: `${el.wPct}%`, height: `${el.hPct}%`,
              display: "flex", alignItems: "center", justifyContent: el.type === "text" ? justify : "center",
              overflow: "visible", cursor: interactive ? "move" : "default",
              outline: isSelected ? `1.5px dashed ${MAGA}` : "none", outlineOffset: 2,
            }}>
            {el.type === "image" ? (
              <img src={el.url} alt="" draggable={false}
                style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", userSelect: "none" }} />
            ) : el.type === "shape" ? (
              <div style={{
                width: "100%", height: "100%", pointerEvents: "none",
                background: el.color || "#C6168D", borderRadius: `${el.radiusPct ?? 0}%`,
              }} />
            ) : (
              <span style={{
                width: "100%", pointerEvents: "none", userSelect: "none",
                fontFamily: resolveTemplateFontCss(el.fontKey, customFonts),
                fontWeight: el.bold ? 800 : 400,
                fontSize: mode === "print" ? `${(el.fontSizePct / 100) * ratio.h}cm` : `${el.fontSizePct}cqh`,
                color: el.color || "#fff", textAlign: el.align || "center",
                whiteSpace: "pre-wrap", overflowWrap: "break-word", lineHeight: 1.15,
              }}>{resolveTemplateText(el.text)}</span>
            )}
            {interactive && isSelected && (
              <div onPointerDown={(e) => onElementPointerDown(e, el, "resize")}
                style={{
                  position: "absolute", right: -7, bottom: -7, width: 16, height: 16, borderRadius: 5,
                  background: MAGA, border: "2px solid #fff", cursor: "nwse-resize", pointerEvents: "auto",
                }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Cari template DEFAULT dalam daftar templates hasil listRpvFrameTemplates
 * (isDefault true, lihat rpv_frame_templates.is_default) - dipakai TV
 * Viewer utk otomatis menerapkan bingkai/template tanpa operator perlu
 * pilih apa2 di layar TV (tidak ada UI di TV, murni auto). */
export function findDefaultFrameTemplate(templates) {
  return (templates || []).find((tpl) => tpl.isDefault) || null;
}

// ── Rasterisasi PhotoFrame ke file gambar (canvas, BUKAN html2canvas) ──────
// Dipakai halaman share tamu (/marta/photobooth/p/[photoCode]) utk tombol
// Share/Download - permintaan user: "hasil foto yg didownload jangan
// stretch, & JANGAN ADA PENGKOMPRESAN SAMA SEKALI". html2canvas (dipakai
// sebelumnya) menangkap <div> HASIL RENDER DI LAYAR (ukuran kecil, kena
// bug distorsi aspect-ratio CSS) - jadi diganti gambar ulang manual di
// <canvas> langsung dari FOTO ASLI beresolusi penuh (bukan capture DOM),
// dgn urutan transform crop (scale->translate%->rotate->flipX->flipY)
// PERSIS sama dgn `transform` CSS di PhotoFrame di atas, & ukuran kanvas
// dipilih supaya TIDAK PERNAH upscale/downscale foto asli saat zoom=1
// (lihat computeCoverCanvasSize) - baru diexport PNG (lossless, tanpa
// kompresi kualitas apa pun).
function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Gagal memuat gambar: ${src}`));
    img.src = src;
  });
}

// Kanvas dipilih SAMA BESAR dgn area yg benar2 dibutuhkan cover-fit rasio
// target DARI resolusi asli foto (bukan dipaksa ukuran tetap) - supaya
// scaleCover dasarnya selalu <=1 (tidak upscale) & sedekat mungkin 1 (tidak
// downscale melebihi yg perlu) saat crop default (zoom=1).
function computeCoverCanvasSize(iw, ih, ratioW, ratioH) {
  let W, H;
  if (iw / ih > ratioW / ratioH) { H = ih; W = Math.round(ih * (ratioW / ratioH)); }
  else { W = iw; H = Math.round(iw * (ratioH / ratioW)); }
  return { W: Math.max(2, W), H: Math.max(2, H) };
}

function wrapCanvasText(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(test).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Render 1 foto + crop + template custom ke <canvas>, lalu resolve jadi
 * Blob PNG (lossless) - dipakai Share/Download di halaman tamu supaya file
 * yg dibagikan/diunduh SELALU beresolusi penuh & framing-nya identik dgn
 * <PhotoFrame> di layar, TANPA capture DOM & TANPA kompresi kualitas. */
export async function renderPhotoFrameToBlob({ photo, ratio, crop, frame, queueLabel, sessionTitle, customElements, customBaseStyle, customFonts }) {
  if (!photo?.url) return null;
  const img = await loadImageEl(photo.url);
  const isCustom = frame === "custom";
  const isPolaroidShape = frame === "white" || (isCustom && customBaseStyle === "polaroid");
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const { W, H } = computeCoverCanvasSize(iw, ih, ratio.w, ratio.h);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.fillStyle = isPolaroidShape ? "#ffffff" : "#000000";
  ctx.fillRect(0, 0, W, H);

  const area = isPolaroidShape
    ? { x: W * 0.04, y: H * 0.04, w: W * 0.92, h: H * 0.80 }
    : { x: 0, y: 0, w: W, h: H };

  const c = crop || DEFAULT_CROP;
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.w, area.h);
  ctx.clip();
  ctx.fillStyle = "#000000";
  ctx.fillRect(area.x, area.y, area.w, area.h);

  // object-fit:cover dasar (SEBELUM transform crop tambahan) - persis behavior
  // <img style="object-fit:cover"> di PhotoFrame.
  const scaleCover = Math.max(area.w / iw, area.h / ih);
  const drawW = iw * scaleCover;
  const drawH = ih * scaleCover;

  // Urutan SAMA PERSIS dgn CSS `transform: scale() translate(%) rotate() scaleX() scaleY()`
  // di PhotoFrame - fungsi ctx dipanggil urutan yg SAMA (semantik canvas &
  // CSS transform-list identik: yg dipanggil/ditulis PERTAMA diterapkan
  // PALING AKHIR ke titik gambar).
  ctx.translate(area.x + area.w / 2, area.y + area.h / 2);
  ctx.scale(c.zoom, c.zoom);
  ctx.translate((c.panX / 100) * area.w, (c.panY / 100) * area.h);
  ctx.rotate((c.rotate * Math.PI) / 180);
  ctx.scale(c.flipX ? -1 : 1, 1);
  ctx.scale(1, c.flipY ? -1 : 1);
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();

  if (frame === "white") {
    ctx.fillStyle = "#17181C";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 ${Math.round(H * 0.022)}px ${FONT}`;
    ctx.fillText(sessionTitle || "FlashPrint", W / 2, H * 0.9);
    ctx.fillStyle = "#8A8A96";
    ctx.font = `400 ${Math.round(H * 0.017)}px monospace`;
    ctx.fillText(queueLabel || "", W / 2, H * 0.945);
  }

  if (isCustom && Array.isArray(customElements) && customElements.length > 0) {
    const fontFamilies = new Set();
    customElements.forEach((el) => { if (el.type === "text") fontFamilies.add(resolveTemplateFontCss(el.fontKey, customFonts)); });
    await Promise.all([...fontFamilies].map((f) => (typeof document !== "undefined" ? document.fonts.load(`800 100px ${f}`).catch(() => {}) : null)));
    try { if (typeof document !== "undefined") await document.fonts.ready; } catch { /* diamkan */ }

    for (const el of customElements) {
      const bx = W * (el.xPct / 100);
      const by = H * (el.yPct / 100);
      const bw = W * (el.wPct / 100);
      const bh = H * (el.hPct / 100);
      if (el.type === "image" && el.url) {
        try {
          const elImg = await loadImageEl(el.url);
          const eiw = elImg.naturalWidth || elImg.width;
          const eih = elImg.naturalHeight || elImg.height;
          const contain = Math.min(bw / eiw, bh / eih);
          const dw = eiw * contain;
          const dh = eih * contain;
          ctx.drawImage(elImg, bx + (bw - dw) / 2, by + (bh - dh) / 2, dw, dh);
        } catch { /* elemen gambar gagal dimuat (mis. CORS) - lewati, jangan gagalkan semua render */ }
      } else if (el.type === "shape") {
        const radiusPct = el.radiusPct ?? 0;
        const rx = Math.min(bw / 2, (bw * radiusPct) / 100);
        const ry = Math.min(bh / 2, (bh * radiusPct) / 100);
        ctx.fillStyle = el.color || "#C6168D";
        ctx.beginPath();
        ctx.moveTo(bx + rx, by);
        ctx.lineTo(bx + bw - rx, by);
        ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + ry);
        ctx.lineTo(bx + bw, by + bh - ry);
        ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - rx, by + bh);
        ctx.lineTo(bx + rx, by + bh);
        ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - ry);
        ctx.lineTo(bx, by + ry);
        ctx.quadraticCurveTo(bx, by, bx + rx, by);
        ctx.closePath();
        ctx.fill();
      } else {
        const text = String(el.text || "")
          .replaceAll("{Nama Event}", sessionTitle || "Nama Event")
          .replaceAll("{Photo ID}", queueLabel || "00000");
        const fontFamily = resolveTemplateFontCss(el.fontKey, customFonts);
        const fontSizePx = Math.max(6, (el.fontSizePct / 100) * H);
        ctx.font = `${el.bold ? 800 : 400} ${fontSizePx}px ${fontFamily}`;
        ctx.fillStyle = el.color || "#ffffff";
        ctx.textBaseline = "middle";
        const align = el.align || "center";
        ctx.textAlign = align === "left" ? "left" : align === "right" ? "right" : "center";
        const lineHeight = fontSizePx * 1.15;
        let lines = [];
        text.split("\n").forEach((para) => { lines = lines.concat(wrapCanvasText(ctx, para, bw)); });
        const totalH = lines.length * lineHeight;
        const startY = by + bh / 2 - totalH / 2 + lineHeight / 2;
        const tx = align === "left" ? bx : align === "right" ? bx + bw : bx + bw / 2;
        lines.forEach((line, i) => ctx.fillText(line, tx, startY + i * lineHeight));
      }
    }
  }

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}
