"use client";
/**
 * SquareCropSheet - editor foto persegi utk slot kolase (sumber GALERI).
 * Geser (drag) & zoom (slider) utk memposisikan area persegi, plus tombol
 * "Putar" (rotate 90° bertahap) - lalu konfirmasi "Gunakan Foto Ini" atau
 * "Ambil Ulang" utk pilih foto lain. Foto dari KAMERA TIDAK lewat sini -
 * itu auto crop-persegi instan (`autoSquareCrop`, lihat imageTools.js).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { X, Check, RotateCw, RefreshCw, Loader2 } from "lucide-react";
import { FF } from "./MobileShell";
import { bakeSquareCrop } from "./imageTools";

const VIEWPORT = 300; // px, ukuran kotak editor
const MIN_SCALE = 1, MAX_SCALE = 3;

export default function SquareCropSheet({ file, onCancel, onConfirm }) {
  const [imgUrl] = useState(() => URL.createObjectURL(file));
  const [natural, setNatural] = useState(null); // {w,h}
  const [display, setDisplay] = useState(null); // {w,h} cover-fit @ scale=1
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [busy, setBusy] = useState(false);
  const dragRef = useRef(null); // {startX,startY,panX,panY,pointerId}

  useEffect(() => () => URL.revokeObjectURL(imgUrl), [imgUrl]);

  function onImgLoad(e) {
    const w = e.target.naturalWidth, h = e.target.naturalHeight;
    setNatural({ w, h });
    const aspect = w / h;
    setDisplay(aspect >= 1 ? { w: VIEWPORT * aspect, h: VIEWPORT } : { w: VIEWPORT, h: VIEWPORT / aspect });
  }

  const maxPan = useMemo(() => {
    if (!display) return { x: 0, y: 0 };
    const dw = display.w * scale, dh = display.h * scale;
    return { x: Math.max(0, (dw - VIEWPORT) / 2), y: Math.max(0, (dh - VIEWPORT) / 2) };
  }, [display, scale]);

  function clampPan(p) {
    return { x: Math.min(maxPan.x, Math.max(-maxPan.x, p.x)), y: Math.min(maxPan.y, Math.max(-maxPan.y, p.y)) };
  }

  function onPointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  }
  function onPointerMove(e) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX, dy = e.clientY - dragRef.current.startY;
    setPan(clampPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy }));
  }
  function onPointerUp() { dragRef.current = null; }

  function onScaleChange(v) {
    const next = Number(v);
    setScale(next);
    setPan((p) => clampPan(p)); // re-clamp langsung, hindari lompat saat zoom-out
  }

  async function confirm() {
    if (!natural || !display) return;
    setBusy(true);
    try {
      const totalK = (display.w / natural.w) * scale;
      const imgLeft = (VIEWPORT - display.w * scale) / 2 + pan.x;
      const imgTop = (VIEWPORT - display.h * scale) / 2 + pan.y;
      const sx = Math.max(0, -imgLeft / totalK);
      const sy = Math.max(0, -imgTop / totalK);
      const sw = Math.min(natural.w - sx, VIEWPORT / totalK);
      const sh = Math.min(natural.h - sy, VIEWPORT / totalK);
      const blob = await bakeSquareCrop(file, { sx, sy, sw, sh, rotationDeg: rotation });
      onConfirm(blob);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(13,17,23,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: FF, padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 360, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>Atur Posisi Foto</div>
        <button onClick={onCancel}
          style={{ width: 30, height: 30, borderRadius: 9, border: "none", background: "rgba(255,255,255,0.14)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <X size={14} />
        </button>
      </div>

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          width: VIEWPORT, height: VIEWPORT, borderRadius: 18, overflow: "hidden", position: "relative",
          background: "#111318", touchAction: "none", boxShadow: "0 10px 34px rgba(0,0,0,0.4)",
          transform: `rotate(${rotation}deg)`, transition: "transform .22s ease",
        }}
      >
        {display && (
          <img
            src={imgUrl}
            onLoad={onImgLoad}
            draggable={false}
            alt=""
            style={{
              position: "absolute", left: "50%", top: "50%", width: display.w, height: display.h,
              transform: `translate(-50%,-50%) translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              cursor: dragRef.current ? "grabbing" : "grab", userSelect: "none",
            }}
          />
        )}
        {!display && (
          <img src={imgUrl} onLoad={onImgLoad} alt="" style={{ opacity: 0, width: 1, height: 1 }} />
        )}
        {/* grid bantu 3x3 ala kamera, murni visual */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gridTemplateRows: "repeat(3,1fr)" }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} style={{ border: "0.5px solid rgba(255,255,255,0.22)" }} />
          ))}
        </div>
      </div>

      <div style={{ width: "100%", maxWidth: 360, marginTop: 18, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 700 }}>Zoom</span>
        <input type="range" min={MIN_SCALE} max={MAX_SCALE} step={0.01} value={scale}
          onChange={(e) => onScaleChange(e.target.value)}
          style={{ flex: 1, accentColor: "#EC008C" }} />
        <button onClick={() => setRotation((r) => (r + 90) % 360)}
          style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 10, border: "none", background: "rgba(255,255,255,0.14)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          title="Putar">
          <RotateCw size={15} />
        </button>
      </div>

      <div style={{ width: "100%", maxWidth: 360, marginTop: 18, display: "flex", gap: 10 }}>
        <button onClick={onCancel}
          style={{ flex: 1, height: 48, borderRadius: 13, border: "1px solid rgba(255,255,255,0.22)", background: "transparent", color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <RefreshCw size={14} /> Ambil Ulang
        </button>
        <button onClick={confirm} disabled={busy || !display}
          style={{ flex: 1, height: 48, borderRadius: 13, border: "none", background: "linear-gradient(135deg,#ED1C24,#EC008C)", color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: FF, cursor: busy ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {busy ? <Loader2 size={15} style={{ animation: "mspin .85s linear infinite" }} /> : <Check size={15} />}
          Gunakan Foto Ini
        </button>
      </div>
    </div>
  );
}
