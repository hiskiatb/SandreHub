/**
 * imageTools.js - kompresi foto & kolase, satu sumber dipakai bersama oleh
 * Activity (Submit Actual) dan POSM (Catat Instalasi), supaya perilakunya
 * identik di semua tempat foto diunggah ke Google Drive lewat MartaHub.
 *
 * DUA hal yang diminta secara eksplisit:
 *   1. Kolase foto - konsep dari app Flutter (`photo_collage_sheet.dart`,
 *      `_composeCollageWorker`) yang belum ada di web: beberapa foto
 *      digabung jadi SATU gambar grid (2/4/6/8/9 slot), bukan diunggah
 *      terpisah. Layout grid (baris×kolom) di sini SAMA PERSIS dgn
 *      `kCollageLayouts` Flutter.
 *   2. Kompresi WAJIB ≤1MB per foto SEBELUM diunggah (baik hasil kolase,
 *      foto tunggal dari galeri, MAUPUN foto langsung dari kamera web) -
 *      `compressToMaxBytes()` melakukan pencarian bertahap (turunkan
 *      kualitas JPEG dulu, kalau masih kebesaran baru turunkan resolusi)
 *      sampai benar-benar di bawah batas, BUKAN cuma kualitas tetap 0.82
 *      seperti sebelumnya (itu tidak menjamin ukuran akhir).
 */

const MAX_BYTES_DEFAULT = 1_000_000; // 1 MB - batas keras ke Google Drive

function loadImage(fileOrBlob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(fileOrBlob);
    img.onload = () => { resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Gagal membaca gambar")); };
    img.src = url;
    img._objectUrl = url;
  });
}

function fitDim(w, h, maxDim) {
  if (w <= maxDim && h <= maxDim) return { width: w, height: h };
  const scale = maxDim / Math.max(w, h);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Gagal memproses gambar"))), "image/jpeg", quality);
  });
}

/** Kompres satu foto (File/Blob apa pun - hasil kamera, galeri, atau
 * kolase) sampai BENAR-BENAR ≤ maxBytes. Strategi bertingkat: turunkan
 * kualitas dulu (murah, kualitas visual paling terjaga), baru kalau di
 * kualitas minimum masih kebesaran, turunkan resolusi lalu ulangi -
 * dijamin selalu mengembalikan hasil sekecil mungkin yg bisa dicapai. */
export async function compressToMaxBytes(fileOrBlob, opts = {}) {
  const { maxBytes = MAX_BYTES_DEFAULT, maxDim = 1600, startQuality = 0.85, minQuality = 0.35, dimFloor = 640 } = opts;
  const img = await loadImage(fileOrBlob);
  try {
    let dim = maxDim;
    let smallest = null;
    while (dim >= dimFloor) {
      const { width, height } = fitDim(img.naturalWidth || img.width, img.naturalHeight || img.height, dim);
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      for (let q = startQuality; q >= minQuality - 1e-9; q -= 0.1) {
        const blob = await canvasToBlob(canvas, Math.round(q * 100) / 100);
        if (!smallest || blob.size < smallest.size) smallest = blob;
        if (blob.size <= maxBytes) return blob;
      }
      dim = Math.round(dim * 0.8);
    }
    // Kasus ekstrem (foto asli sangat berat/rumit warnanya) - tetap kirim
    // hasil terkecil yang berhasil didapat, bukan gagal total.
    return smallest;
  } finally {
    if (img._objectUrl) URL.revokeObjectURL(img._objectUrl);
  }
}

// Layout kolase SAMA PERSIS dgn `kCollageLayouts` Flutter (rows, cols) -
// ini acuan orientasi LANDSCAPE. Slot 9 selalu 3x3 (simetris, tak perlu
// orientasi). Untuk slot lain, orientasi POTRAIT tinggal transpose
// rows<->cols (lihat `layoutForOrientation` di bawah).
export const COLLAGE_LAYOUTS = {
  2: { rows: 1, cols: 2 },
  4: { rows: 2, cols: 2 },
  6: { rows: 2, cols: 3 },
  8: { rows: 2, cols: 4 },
  9: { rows: 3, cols: 3 },
};

/** Slot 9 tidak punya opsi orientasi (grid 3x3 sudah simetris). Untuk slot
 * lain: "landscape" pakai layout dasar, "portrait" tinggal ditranspose -
 * PENTING: ini HANYA mengubah susunan grid (baris×kolom), bukan memutar
 * isi foto yang sudah ada di tiap slot (foto tetap pada orientasi/​crop
 * aslinya, cuma posisinya di grid yang menyesuaikan). */
export function layoutForOrientation(slotCount, orientation) {
  const base = COLLAGE_LAYOUTS[slotCount];
  if (!base) return null;
  if (slotCount === 9 || orientation !== "portrait") return base;
  return { rows: base.cols, cols: base.rows };
}

/** Gabung beberapa foto jadi SATU gambar kolase grid - padanan
 * `_composeCollageWorker` Flutter: tiap slot di-crop persegi (cover, bukan
 * distorsi), disusun rapi dgn gutter tipis di atas kanvas putih, lalu
 * hasil akhirnya WAJIB dikompres lagi lewat `compressToMaxBytes` supaya
 * satu file kolase (walau isinya banyak foto) tetap ≤1MB sebelum upload. */
export async function composeCollage(files, slotCount, opts = {}) {
  const { cell = 640, gutter = 6, orientation = "landscape" } = opts;
  const layout = opts.layout || layoutForOrientation(slotCount, orientation);
  if (!layout) throw new Error("Jumlah slot kolase tidak didukung");
  const { rows, cols } = layout;
  const canvas = document.createElement("canvas");
  canvas.width = cols * cell + (cols - 1) * gutter;
  canvas.height = rows * cell + (rows - 1) * gutter;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const images = await Promise.all(files.map((f) => (f ? loadImage(f) : null)));
  try {
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (!img) continue;
      const row = Math.floor(i / cols), col = i % cols;
      const x = col * (cell + gutter), y = row * (cell + gutter);
      // Crop-to-square (cover) - sisi terpendek jadi acuan, potong bagian
      // tengah, SAMA PERSIS `copyResizeCropSquare` di Flutter.
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      const side = Math.min(iw, ih);
      const sx = (iw - side) / 2, sy = (ih - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, x, y, cell, cell);
    }
  } finally {
    images.forEach((img) => { if (img?._objectUrl) URL.revokeObjectURL(img._objectUrl); });
  }

  const rawBlob = await canvasToBlob(canvas, 0.9);
  return compressToMaxBytes(rawBlob, opts.compress || {});
}

/** Foto langsung dari KAMERA utk slot kolase - auto crop-persegi INSTAN di
 * tengah (cover), TANPA UI manual, sesuai permintaan: "foto dgn kamera
 * langsung utk grid, maka dia akan square untuk fotonya". */
export async function autoSquareCrop(fileOrBlob, outSize = 900) {
  const img = await loadImage(fileOrBlob);
  try {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const side = Math.min(iw, ih);
    const sx = (iw - side) / 2, sy = (ih - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = outSize; canvas.height = outSize;
    canvas.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, outSize, outSize);
    return canvasToBlob(canvas, 0.92);
  } finally {
    if (img._objectUrl) URL.revokeObjectURL(img._objectUrl);
  }
}

/** Foto dari GALERI utk slot kolase - user posisikan sendiri (geser/zoom)
 * lewat `SquareCropSheet`, lalu di sini di-"bake" jadi kanvas persegi
 * final. `sx,sy,sw,sh` adalah kotak sumber (dlm px asli gambar) yg sudah
 * dihitung oleh SquareCropSheet dari posisi geser+zoom pengguna; `rotationDeg`
 * (0/90/180/270) diterapkan SETELAH crop persegi (aman - kotak tetap
 * persegi stlh diputar kelipatan 90°), utk fitur "rotate" di dalam editor. */
export async function bakeSquareCrop(fileOrBlob, { sx, sy, sw, sh, rotationDeg = 0, outSize = 900 } = {}) {
  const img = await loadImage(fileOrBlob);
  try {
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = outSize; cropCanvas.height = outSize;
    cropCanvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, outSize, outSize);

    if (!rotationDeg) return canvasToBlob(cropCanvas, 0.92);

    const rotCanvas = document.createElement("canvas");
    rotCanvas.width = outSize; rotCanvas.height = outSize;
    const rctx = rotCanvas.getContext("2d");
    rctx.translate(outSize / 2, outSize / 2);
    rctx.rotate((rotationDeg * Math.PI) / 180);
    rctx.drawImage(cropCanvas, -outSize / 2, -outSize / 2);
    return canvasToBlob(rotCanvas, 0.92);
  } finally {
    if (img._objectUrl) URL.revokeObjectURL(img._objectUrl);
  }
}
