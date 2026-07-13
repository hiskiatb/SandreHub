// ============================================================
// PTS Promotor — helper klien (geo, selfie watermark+compress, upload)
// ============================================================
"use client";

export const MONTHS_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
export const pad2 = (n) => String(n).padStart(2, "0");
export const ymNow = () => { const x = new Date(); return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}`; };
export const ymLabel = (ym) => { if (!ym) return "—"; const [y, m] = ym.split("-"); return `${MONTHS_ID[+m - 1]} ${y}`; };
export const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "";
export const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
export const fmtDateFull = (iso) => iso ? new Date(iso).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
export const durationOf = (a, b) => {
  if (!a || !b) return "";
  const ms = new Date(b).getTime() - new Date(a).getTime(); if (ms < 0) return "";
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return `${h}j ${pad2(m)}m`;
};

// Normalisasi nomor QR → format 62 (§6 spec)
export function normalizePhone(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("62")) { /* ok */ }
  else if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return { normalized: d, valid: /^62\d{8,13}$/.test(d), raw: String(raw ?? "") };
}

// Ambil posisi GPS
export function getPosition({ highAccuracy = true, timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("Perangkat tidak mendukung lokasi."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), accuracy: p.coords.accuracy ? Math.round(p.coords.accuracy) : null }),
      (err) => reject(err),
      { enableHighAccuracy: highAccuracy, timeout, maximumAge: 15000 }
    );
  });
}

// Cek status izin lokasi (jika Permissions API tersedia)
export async function checkGeoPermission() {
  try {
    if (!navigator.permissions?.query) return "unknown";
    const s = await navigator.permissions.query({ name: "geolocation" });
    return s.state; // granted | prompt | denied
  } catch { return "unknown"; }
}

// Gambar frame video → canvas, tempel watermark, kompres JPEG ≤ maxKB
export async function stampAndCompress(video, { lines = [], maxKB = 500, maxDim = 1080, mirror = true } = {}) {
  const vw = video.videoWidth || 720, vh = video.videoHeight || 960;
  const scale = Math.min(1, maxDim / Math.max(vw, vh));
  const w = Math.round(vw * scale), h = Math.round(vh * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  // mirror hanya untuk kamera depan agar natural
  ctx.save();
  if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, 0, 0, w, h); ctx.restore();

  // Watermark panel bawah — responsif (auto-fit lebar agar tidak terpotong)
  const pad = Math.round(w * 0.04);
  const maxW = w - pad * 2;
  let fs = Math.max(12, Math.round(w * 0.033));
  // ukur baris terlebar, kecilkan font bila melebihi lebar
  let widest = 0;
  lines.forEach((ln, i) => {
    ctx.font = `${i === 0 ? 700 : 500} ${i === 0 ? fs + 1 : fs}px "DM Sans", system-ui, sans-serif`;
    widest = Math.max(widest, ctx.measureText(String(ln)).width);
  });
  if (widest > maxW) fs = Math.max(9, Math.floor(fs * maxW / widest));
  const lh = Math.round(fs * 1.4);
  const panelH = lines.length * lh + pad * 1.2;
  const grad = ctx.createLinearGradient(0, h - panelH - 24, 0, h);
  grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(1, "rgba(0,0,0,0.8)");
  ctx.fillStyle = grad; ctx.fillRect(0, h - panelH - 24, w, panelH + 24);
  ctx.textBaseline = "alphabetic";
  let y = h - panelH + pad * 0.5;
  lines.forEach((ln, i) => {
    ctx.font = `${i === 0 ? 700 : 500} ${i === 0 ? fs + 1 : fs}px "DM Sans", system-ui, sans-serif`;
    ctx.fillStyle = i === 0 ? "#FFFFFF" : "rgba(255,255,255,0.92)";
    ctx.fillText(String(ln), pad, y + fs); y += lh;
  });

  // Kompres iteratif ke target
  let q = 0.85, blob = await canvasToBlob(canvas, q);
  while (blob && blob.size > maxKB * 1024 && q > 0.4) { q -= 0.1; blob = await canvasToBlob(canvas, q); }
  const dataUrl = canvas.toDataURL("image/jpeg", q);
  return { blob, dataUrl, size: blob?.size || 0 };
}
function canvasToBlob(canvas, q) {
  return new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", q));
}

// Upload ke bucket pts-photos (privat) → simpan PATH-nya (bukan URL publik)
export async function uploadSelfie(supabase, blob, { uid, kind }) {
  const path = `${uid || "anon"}/${kind}_${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("pts-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

// Buat signed URL sementara untuk menampilkan foto (hanya via app, sesuai otoritas)
export async function signedPhoto(supabase, pathOrUrl, expires = 3600) {
  if (!pathOrUrl) return null;
  let path = pathOrUrl;
  if (/^https?:\/\//.test(path)) {
    const m = path.match(/pts-photos\/(.+)$/);
    if (!m) return null; path = m[1];
  }
  const { data } = await supabase.storage.from("pts-photos").createSignedUrl(path, expires);
  return data?.signedUrl || null;
}
