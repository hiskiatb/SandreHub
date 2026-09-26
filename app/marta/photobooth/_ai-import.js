"use client";
/**
 * Konversi file Adobe Illustrator (.ai) jadi PNG di browser, supaya bisa
 * dipakai sebagai elemen "Gambar" / "Bingkai (PNG Lubang)" di Template
 * Editor persis seperti upload PNG/JPG biasa (permintaan user: upload
 * template pakai file .ai langsung, tanpa harus export manual ke PNG dulu).
 *
 * Cara kerjanya: file .ai modern SECARA DEFAULT disimpan Illustrator dengan
 * opsi "Create PDF Compatible File" aktif - artinya file .ai itu SENDIRI
 * adalah dokumen PDF 1-halaman yang valid (Illustrator cuma menambahkan
 * data vektor privatnya sbg stream tambahan di dalamnya). Jadi file .ai bisa
 * dibuka & dirender langsung pakai pdf.js (rendering PDF standar), TANPA
 * perlu layanan konversi server terpisah (mis. Ghostscript/ImageMagick) yg
 * belum ada di infrastruktur ini. Kalau operator MEMATIKAN opsi itu saat
 * export dari Illustrator, file .ai TIDAK akan bisa dibaca - pdf.js akan
 * gagal parse dan kita tampilkan pesan yg menjelaskan cara memperbaikinya.
 */

let pdfjsPromise = null;
async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/** True kalau `file` kemungkinan besar file Adobe Illustrator (.ai). */
export function isAiFile(file) {
  const name = (file?.name || "").toLowerCase();
  return name.endsWith(".ai") || file?.type === "application/postscript" || file?.type === "application/illustrator";
}

/**
 * Rasterize file .ai (atau .pdf) jadi File PNG resolusi tinggi, siap dipakai
 * di tempat yg tadinya cuma menerima gambar (image/*). `scale` menentukan
 * ketajaman hasil - 3x cukup tajam utk dicetak 4R (lihat PRINT_SIZE) tanpa
 * file jadi raksasa.
 */
export async function rasterizeAiToPngFile(file, { scale = 3 } = {}) {
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: buf }).promise;
  } catch {
    throw new Error(
      'File .ai ini tidak bisa dibaca. Pastikan disimpan dari Illustrator dengan opsi "Create PDF Compatible File" AKTIF (aktif secara default), lalu upload ulang. Alternatif lain: export dulu jadi PNG dari Illustrator.'
    );
  }
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Gagal mengonversi file .ai ke PNG.");
  const baseName = (file.name || "template").replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.png`, { type: "image/png" });
}
