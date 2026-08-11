"use client";
/**
 * PhotoCollageSheet - kolase foto, dikembalikan dari app Flutter
 * (`photo_collage_sheet.dart`) yang sempat hilang saat migrasi ke web.
 * Pengguna pilih jumlah slot (2/4/6/8/9, SAMA PERSIS `kCollageLayouts`),
 * pilih orientasi (potrait/landscape - kecuali slot 9 yg sudah simetris),
 * isi tiap slot dari kamera/galeri, lalu digabung jadi SATU foto grid
 * lewat `composeCollage()` (imageTools.js) - hasil akhirnya otomatis
 * dikompres ≤1MB sebelum dikembalikan ke pemanggil.
 *
 * Sumber foto per slot:
 *  - KAMERA -> auto crop-persegi INSTAN (tanpa UI manual), sesuai
 *    permintaan "foto dgn kamera langsung utk grid, maka dia akan square".
 *  - GALERI -> buka `SquareCropSheet` (geser+zoom+putar) supaya pengguna
 *    bisa memposisikan sendiri area persegi sebelum dipakai, dgn tombol
 *    "Gunakan Foto Ini" / "Ambil Ulang".
 *
 * Mengganti orientasi TIDAK pernah memutar/mengubah isi foto yg sudah
 * ada di slot - hanya susunan grid (baris x kolom) yang menyesuaikan.
 *
 * Dipakai bersama oleh Activity (Submit Actual) dan POSM (Catat
 * Instalasi) - satu komponen, bukan diduplikasi, supaya UI & perilakunya
 * konsisten di kedua tempat.
 */
import { useRef, useState } from "react";
import { X, ImagePlus, Check, Loader2, Grid2x2, Grid3x3, LayoutGrid, Rows3, Camera, Images, RectangleHorizontal, RectangleVertical } from "lucide-react";
import { FF, BRAND } from "./MobileShell";
import { layoutForOrientation, composeCollage, autoSquareCrop } from "./imageTools";
import SquareCropSheet from "./SquareCropSheet";

const SLOT_OPTIONS = [
  { n: 2, icon: Rows3 },
  { n: 4, icon: Grid2x2 },
  { n: 6, icon: LayoutGrid },
  { n: 8, icon: LayoutGrid },
  { n: 9, icon: Grid3x3 },
];

/**
 * @param {{ onClose: () => void, onDone: (blob: Blob, previewUrl: string) => void }} props
 */
export default function PhotoCollageSheet({ onClose, onDone }) {
  const [slotCount, setSlotCount] = useState(4);
  const [orientation, setOrientation] = useState("landscape"); // "landscape" | "portrait"
  const [slots, setSlots] = useState(() => Array(4).fill(null)); // {file, previewUrl}
  const [composing, setComposing] = useState(false);
  const [err, setErr] = useState("");
  const [activeSlot, setActiveSlot] = useState(null); // idx dari slot yg lagi diisi
  const [cropFile, setCropFile] = useState(null); // File hasil pilih galeri, nunggu di-crop
  const [pickerFor, setPickerFor] = useState(null); // idx slot yg lagi tanya sumber foto (kamera/galeri)

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const layout = layoutForOrientation(slotCount, orientation);
  const filledCount = slots.filter(Boolean).length;
  const showOrientation = slotCount !== 9;

  function changeSlotCount(n) {
    setSlotCount(n);
    setSlots((prev) => {
      const next = Array(n).fill(null);
      for (let i = 0; i < Math.min(prev.length, n); i++) next[i] = prev[i];
      return next;
    });
  }

  function fillSlot(idx, blob) {
    if (!blob) return;
    setSlots((prev) => {
      const next = [...prev];
      if (next[idx]?.previewUrl) URL.revokeObjectURL(next[idx].previewUrl);
      next[idx] = { file: blob, previewUrl: URL.createObjectURL(blob) };
      return next;
    });
  }

  function clearSlot(idx) {
    setSlots((prev) => {
      const next = [...prev];
      if (next[idx]?.previewUrl) URL.revokeObjectURL(next[idx].previewUrl);
      next[idx] = null;
      return next;
    });
  }

  function openCamera(idx) { setActiveSlot(idx); cameraInputRef.current?.click(); }
  function openGallery(idx) { setActiveSlot(idx); galleryInputRef.current?.click(); }

  async function onCameraPicked(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type?.startsWith("image/") || activeSlot == null) return;
    const idx = activeSlot;
    try {
      const blob = await autoSquareCrop(file); // langsung persegi, tanpa UI manual
      fillSlot(idx, blob);
    } catch { setErr("Gagal memproses foto kamera"); }
  }

  function onGalleryPicked(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type?.startsWith("image/")) return;
    setCropFile(file); // buka SquareCropSheet, activeSlot sudah ke-set dari openGallery()
  }

  return (
    <div onClick={() => !composing && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(13,17,23,0.5)", display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxHeight: "90vh", overflowY: "auto", background: "#FFFFFF", borderRadius: "22px 22px 0 0",
          padding: "18px 20px calc(env(safe-area-inset-bottom,0px) + 20px)", fontFamily: FF, boxShadow: "0 -12px 34px rgba(0,0,0,0.16)",
        }}>
        <div style={{ width: 38, height: 4, borderRadius: 99, background: "#E4E5EA", margin: "0 auto 16px" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#17181C", letterSpacing: "-0.02em" }}>Buat Kolase Foto</div>
            <div style={{ marginTop: 2, fontSize: 11.5, color: "#8A8A96", fontWeight: 600 }}>Gabung beberapa foto jadi satu dokumentasi rapi</div>
          </div>
          <button onClick={onClose} disabled={composing}
            style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 10, border: "none", background: "#F6F7F9", color: "#5A5A68", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={15} />
          </button>
        </div>

        {/* Pilih jumlah slot - chip dgn ikon grid, gaya premium */}
        <div style={{ display: "flex", gap: 7, marginTop: 16, overflowX: "auto", paddingBottom: 2 }}>
          {SLOT_OPTIONS.map((o) => {
            const active = slotCount === o.n;
            const Icon = o.icon;
            return (
              <button key={o.n} onClick={() => changeSlotCount(o.n)}
                style={{
                  flexShrink: 0, display: "flex", alignItems: "center", gap: 6, height: 38, padding: "0 14px", borderRadius: 999,
                  background: active ? "linear-gradient(135deg,#ED1C24,#EC008C)" : "#F6F7F9",
                  border: `1px solid ${active ? "transparent" : "#ECEDF0"}`,
                  color: active ? "#fff" : "#5A5A68", fontSize: 12.5, fontWeight: 800, fontFamily: FF, cursor: "pointer",
                  boxShadow: active ? "0 4px 12px rgba(237,28,36,0.24)" : "none",
                }}>
                <Icon size={13} /> {o.n}
              </button>
            );
          })}
        </div>

        {/* Orientasi grid - disembunyikan utk slot 9 (3x3 sudah simetris).
            Mengubah ini TIDAK memutar isi foto yg sudah ada di slot, cuma
            susunan baris/kolom grid-nya saja. */}
        {showOrientation && (
          <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
            {[
              { key: "landscape", label: "Landscape", icon: RectangleHorizontal },
              { key: "portrait", label: "Potrait", icon: RectangleVertical },
            ].map((o) => {
              const active = orientation === o.key;
              const Icon = o.icon;
              return (
                <button key={o.key} onClick={() => setOrientation(o.key)}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 34, borderRadius: 10,
                    background: active ? "#17181C" : "#F6F7F9", border: `1px solid ${active ? "transparent" : "#ECEDF0"}`,
                    color: active ? "#fff" : "#5A5A68", fontSize: 12, fontWeight: 800, fontFamily: FF, cursor: "pointer",
                  }}>
                  <Icon size={13} /> {o.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Grid preview kolase - proporsinya langsung mengikuti layout
            baris×kolom yang dipilih, jadi pengguna lihat persis bentuk
            akhirnya SEBELUM menekan "Buat Kolase". */}
        <div style={{
          marginTop: 16, display: "grid", gap: 6,
          gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
          gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
          aspectRatio: `${layout.cols} / ${layout.rows}`,
          borderRadius: 16, overflow: "hidden", background: "#F0F0F3", padding: 6, border: "1px solid #ECEDF0",
        }}>
          {slots.map((s, i) => (
            <CollageSlot key={i} slot={s} onPick={() => setPickerFor(i)} onClear={() => clearSlot(i)} />
          ))}
        </div>

        <div style={{ marginTop: 10, fontSize: 11, color: "#B0B0BA", fontWeight: 600, textAlign: "center" }}>
          {filledCount}/{slotCount} slot terisi · ketuk kamera/galeri di slot kosong
        </div>

        {err && <div style={{ marginTop: 10, fontSize: 12, color: "#C62828", fontWeight: 600, textAlign: "center" }}>{err}</div>}

        <button onClick={async () => {
          if (filledCount < 2) { setErr("Isi minimal 2 slot dulu."); return; }
          setComposing(true); setErr("");
          try {
            const files = slots.map((s) => s?.file || null);
            const blob = await composeCollage(files, slotCount, { orientation });
            const previewUrl = URL.createObjectURL(blob);
            onDone(blob, previewUrl);
          } catch (e) {
            setErr(e.message || "Gagal membuat kolase");
          } finally {
            setComposing(false);
          }
        }} disabled={composing || filledCount < 2}
          style={{
            width: "100%", height: 50, marginTop: 16, borderRadius: 14, border: "none",
            background: (composing || filledCount < 2) ? "#D8D9E0" : "linear-gradient(135deg,#ED1C24,#EC008C)",
            color: "#fff", fontSize: 14, fontWeight: 800, fontFamily: FF,
            cursor: (composing || filledCount < 2) ? "default" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: (composing || filledCount < 2) ? "none" : "0 6px 16px rgba(237,28,36,0.22)",
          }}>
          {composing ? <Loader2 size={16} style={{ animation: "mspin .85s linear infinite" }} /> : <Check size={16} />}
          {composing ? "Menyusun kolase…" : "Buat Kolase"}
        </button>
      </div>

      {/* Input tersembunyi bersama utk semua slot - dibedakan via `capture`.
          Dipusatkan di sini (bukan per-slot) supaya "Ambil Ulang" tinggal
          memicu ulang input yg sama utk slot yg sama (`activeSlot`). */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={onCameraPicked} onClick={(e) => e.stopPropagation()} />
      <input ref={galleryInputRef} type="file" accept="image/*" hidden onChange={onGalleryPicked} onClick={(e) => e.stopPropagation()} />

      {cropFile && activeSlot != null && (
        <SquareCropSheet
          file={cropFile}
          onCancel={() => { setCropFile(null); galleryInputRef.current?.click(); }}
          onConfirm={(blob) => { fillSlot(activeSlot, blob); setCropFile(null); }}
        />
      )}

      {pickerFor != null && (
        <SourcePicker
          onClose={() => setPickerFor(null)}
          onCamera={() => { const idx = pickerFor; setPickerFor(null); openCamera(idx); }}
          onGallery={() => { const idx = pickerFor; setPickerFor(null); openGallery(idx); }}
        />
      )}
    </div>
  );
}

function CollageSlot({ slot, onPick, onClear }) {
  if (slot) {
    return (
      <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", background: "#E4E5EA" }}>
        <img src={slot.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <button onClick={onClear}
          style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <X size={11} color="#fff" />
        </button>
      </div>
    );
  }
  return (
    <button onClick={onPick}
      style={{
        position: "relative", borderRadius: 10, background: "#FFFFFF", border: "1.5px dashed #D8D9E0",
        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#B0B0BA", padding: 0,
      }}>
      <ImagePlus size={16} />
    </button>
  );
}

/** Muncul SETELAH slot kosong diketuk - baru di sini pengguna memilih
 * sumber foto (Kamera atau Galeri), bukan dipisah dari awal di tiap slot. */
function SourcePicker({ onCamera, onGallery, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 550, background: "rgba(13,17,23,0.4)", display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#FFFFFF", borderRadius: "20px 20px 0 0", padding: "10px 20px calc(env(safe-area-inset-bottom,0px) + 20px)", fontFamily: FF }}>
        <div style={{ width: 36, height: 4, borderRadius: 99, background: "#E4E5EA", margin: "0 auto 14px" }} />
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "#17181C", textAlign: "center", marginBottom: 12 }}>Pilih Sumber Foto</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCamera}
            style={{ flex: 1, height: 72, borderRadius: 14, border: "1.5px solid #ECEDF0", background: "#F6F7F9", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", color: "#17181C", fontFamily: FF }}>
            <Camera size={19} />
            <span style={{ fontSize: 12, fontWeight: 800 }}>Kamera</span>
          </button>
          <button onClick={onGallery}
            style={{ flex: 1, height: 72, borderRadius: 14, border: "1.5px solid #ECEDF0", background: "#F6F7F9", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", color: "#17181C", fontFamily: FF }}>
            <Images size={19} />
            <span style={{ fontSize: 12, fontWeight: 800 }}>Galeri</span>
          </button>
        </div>
      </div>
    </div>
  );
}
