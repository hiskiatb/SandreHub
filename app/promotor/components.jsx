"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, X, RotateCcw, Check, Keyboard, Loader2, ScanLine, AlertTriangle, RefreshCw } from "lucide-react";
import { stampAndCompress, normalizePhone } from "./ptsClient";

// Ambil kandidat nomor HP Indonesia dari isi QR (isi QR sering menyambung
// nomor + ICCID tanpa pemisah, jadi panjang dibatasi ke format 08 + 10 digit).
function extractPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  // 0-form: 0 8 + 8..10 digit → total 11..12 ; 62-form: 62 8 + 8..10 → 11..13
  const m = digits.match(/(?:62|0)8\d{8,10}/);
  return normalizePhone(m ? m[0] : digits);
}

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;

/* ── Bottom sheet frame ──────────────────────────────────────── */
function Sheet({ title, onClose, children, accent = "#ED1C24" }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(17,18,22,0.4)", backdropFilter: "blur(6px)", display: "flex", flexDirection: "column", justifyContent: "flex-end", fontFamily: FF }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#FFFFFF", borderRadius: "26px 26px 0 0", overflow: "hidden", boxShadow: "0 -18px 50px rgba(23,24,28,0.18)", maxHeight: "94svh", display: "flex", flexDirection: "column", animation: "sheetup .28s cubic-bezier(.22,1,.36,1)", maxWidth: 560, margin: "0 auto", width: "100%" }}>
        <div style={{ width: 38, height: 4, borderRadius: 99, background: "#E4E5EA", margin: "10px auto 4px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 18px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em", color: "#17181C" }}>
            <span style={{ width: 8, height: 8, borderRadius: 3, background: accent }} />{title}
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: "#F3F4F6", color: "#61616C", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={18} /></button>
        </div>
        {children}
      </div>
      <style>{`@keyframes sheetup{from{transform:translateY(100%)}to{transform:none}}@keyframes pspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ── Panduan saat akses diblokir (kamera/lokasi) ─────────────── */
export function AccessHelp({ kind = "kamera", onRetry }) {
  const label = kind === "lokasi" ? "Lokasi" : "Kamera";
  return (
    <div style={{ borderRadius: 16, border: "1px solid #F0DCA8", background: "#FDF6E3", padding: "15px 16px", fontFamily: FF }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, fontWeight: 800, color: "#B7791F", marginBottom: 9 }}>
        <AlertTriangle size={17} /> Akses {label.toLowerCase()} diblokir
      </div>
      <div style={{ fontSize: 12.5, color: "#61616C", lineHeight: 1.7 }}>
        Sebelumnya izin {label.toLowerCase()} ditolak. Untuk mengaktifkan lagi:
        <div style={{ marginTop: 7, display: "flex", flexDirection: "column", gap: 4 }}>
          <span>1. Ketuk ikon <b style={{ color: "#17181C" }}>🔒 / ⓘ</b> di bilah alamat browser.</span>
          <span>2. Buka <b style={{ color: "#17181C" }}>Izin situs</b> → <b style={{ color: "#17181C" }}>{label}</b>.</span>
          <span>3. Ubah ke <b style={{ color: "#17181C" }}>Izinkan</b>.</span>
          <span>4. Ketuk <b style={{ color: "#17181C" }}>Muat ulang halaman</b> di bawah.</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 9, marginTop: 13 }}>
        <button onClick={onRetry} style={{ flex: 1, height: 46, borderRadius: 12, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#17181C", fontFamily: FF, fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer" }}><RotateCcw size={15} /> Coba lagi</button>
        <button onClick={() => window.location.reload()} style={{ flex: 1.2, height: 46, borderRadius: 12, border: "none", background: "#ED1C24", color: "#fff", fontFamily: FF, fontSize: 13.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer" }}><RefreshCw size={15} /> Muat ulang halaman</button>
      </div>
    </div>
  );
}

/* ── Selfie capture (kamera depan, watermark, kompres ≤500KB) ── */
export function CameraSheet({ title = "Ambil Selfie", stampLines, onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const [shot, setShot] = useState(null);   // {dataUrl, blob, size}
  const [busy, setBusy] = useState(false);
  const [tries, setTries] = useState(0);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let alive = true;
    setErr(""); setReady(false);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErr("Kamera perlu koneksi HTTPS."); return;
    }
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 1280 } }, audio: false });
        if (!alive) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play().catch(() => {}); }
        setReady(true);
      } catch (e) {
        setErr("Tidak bisa mengakses kamera. Izin mungkin diblokir.");
      }
    })();
    return () => { alive = false; stop(); };
  }, [stop, tries]);

  const retry = () => { setErr(""); setTries((n) => n + 1); };

  const capture = async () => {
    if (!videoRef.current) return;
    setBusy(true);
    try {
      const lines = typeof stampLines === "function" ? stampLines(new Date()) : (stampLines || []);
      const res = await stampAndCompress(videoRef.current, { lines, maxKB: 500 });
      setShot(res);
    } finally { setBusy(false); }
  };

  const use = () => { stop(); onCapture(shot); };
  const close = () => { stop(); onClose(); };

  return (
    <Sheet title={title} onClose={close}>
      <div style={{ padding: "0 18px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ position: "relative", width: "100%", aspectRatio: "3/4", borderRadius: 18, overflow: "hidden", background: "#000", border: "1px solid #26262B" }}>
          {!shot ? (
            <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
          ) : (
            <img src={shot.dataUrl} alt="selfie" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
          {!ready && !err && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#9A9AA6", fontSize: 13, gap: 8 }}>
              <Loader2 size={18} style={{ animation: "pspin 1s linear infinite" }} /> Menyalakan kamera…
            </div>
          )}
          {err && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: 8, alignItems: "center", justifyContent: "center", color: "#F87171", fontSize: 13, textAlign: "center", padding: 24 }}>
              <AlertTriangle size={26} /> {err}
            </div>
          )}
          {shot && (
            <div style={{ position: "absolute", top: 10, right: 10, padding: "4px 9px", borderRadius: 8, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 11, fontWeight: 600 }}>{Math.round(shot.size / 1024)} KB</div>
          )}
        </div>

        {err ? (
          <AccessHelp kind="kamera" onRetry={retry} />
        ) : !shot ? (
          <button onClick={capture} disabled={!ready || busy}
            style={{ height: 56, borderRadius: 15, border: "none", cursor: ready ? "pointer" : "default", background: "#ED1C24", color: "#fff", fontFamily: FF, fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, opacity: ready ? 1 : 0.55 }}>
            {busy ? <Loader2 size={20} style={{ animation: "pspin 1s linear infinite" }} /> : <Camera size={20} />} Ambil Foto
          </button>
        ) : (
          <div style={{ display: "flex", gap: 11 }}>
            <button onClick={() => setShot(null)} style={{ flex: 1, height: 54, borderRadius: 14, border: "1px solid #E4E5EA", background: "#F3F4F6", color: "#17181C", fontFamily: FF, fontSize: 14.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}><RotateCcw size={17} /> Ulangi</button>
            <button onClick={use} style={{ flex: 1.4, height: 54, borderRadius: 14, border: "none", background: "#30D158", color: "#04210F", fontFamily: FF, fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}><Check size={18} /> Gunakan Foto</button>
          </div>
        )}
        {!err && <p style={{ fontSize: 11.5, color: "#7A7A88", textAlign: "center", lineHeight: 1.5 }}>Foto akan diberi stempel waktu &amp; lokasi otomatis.</p>}
      </div>
    </Sheet>
  );
}

/* Muat jsQR (decoder murni JS, jalan di semua browser) via script CDN */
function loadJsQR() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (window.jsQR) return resolve(window.jsQR);
    const existing = document.getElementById("jsqr-cdn");
    if (existing) { existing.addEventListener("load", () => resolve(window.jsQR)); existing.addEventListener("error", () => reject(new Error("load fail"))); return; }
    const s = document.createElement("script");
    s.id = "jsqr-cdn";
    s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
    s.async = true;
    s.onload = () => resolve(window.jsQR);
    s.onerror = () => reject(new Error("load fail"));
    document.head.appendChild(s);
  });
}

/* ── QR scanner (kamera belakang, jsQR + input manual) ── */
export function QRScannerSheet({ onDetect, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const doneRef = useRef(false);
  const onDetectRef = useRef(onDetect);
  useEffect(() => { onDetectRef.current = onDetect; }, [onDetect]);

  const boxRef = useRef(null);
  const [err, setErr] = useState("");
  const [manual, setManual] = useState(false);
  const [manualVal, setManualVal] = useState("");
  const [scanning, setScanning] = useState(false);
  const [tries, setTries] = useState(0);
  const [detected, setDetected] = useState(false);
  const [numVal, setNumVal] = useState("");
  const editedRef = useRef(false);
  const lastRawRef = useRef("");

  const stop = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const finish = useCallback((val) => {
    if (doneRef.current) return;
    doneRef.current = true;
    stop();
    onDetectRef.current?.(val);
  }, [stop]);

  // Inisialisasi: muat jsQR → nyalakan kamera → live tracking kotak QR
  useEffect(() => {
    let alive = true;
    doneRef.current = false;
    lastRawRef.current = "";
    setErr(""); setScanning(false); setDetected(false);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErr("Kamera perlu koneksi HTTPS. Gunakan input manual."); setManual(true); return;
    }

    (async () => {
      let jsQR;
      try { jsQR = await loadJsQR(); }
      catch { setErr("Gagal memuat pemindai. Gunakan input manual."); setManual(true); return; }
      if (!alive) return;
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!alive) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        const v = videoRef.current;
        if (v) { v.setAttribute("playsinline", "true"); v.srcObject = s; await v.play().catch(() => {}); }
        setScanning(true);

        const canvas = canvasRef.current || document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        let last = 0, lastSeen = 0;

        const tick = (ts) => {
          if (!alive) return;
          const vid = videoRef.current, box = boxRef.current;
          if (vid && vid.readyState >= 2 && vid.videoWidth > 0 && ts - last > 80) {
            last = ts;
            const vw = vid.videoWidth, vh = vid.videoHeight;
            const scale = Math.min(1, 560 / Math.max(vw, vh));
            const w = Math.round(vw * scale), h = Math.round(vh * scale);
            canvas.width = w; canvas.height = h;
            ctx.drawImage(vid, 0, 0, w, h);
            let img; try { img = ctx.getImageData(0, 0, w, h); } catch { img = null; }
            const code = img ? jsQR(img.data, w, h, { inversionAttempts: "attemptBoth" }) : null;
            if (box) {
              if (box.width !== vw) { box.width = vw; box.height = vh; }
              const bx = box.getContext("2d");
              bx.clearRect(0, 0, vw, vh);
              if (code && code.location) {
                const fx = vw / w, fy = vh / h, L = code.location;
                const c = [L.topLeftCorner, L.topRightCorner, L.bottomRightCorner, L.bottomLeftCorner].map((p) => ({ x: p.x * fx, y: p.y * fy }));
                bx.lineWidth = Math.max(3, vw * 0.008); bx.lineCap = "round"; bx.lineJoin = "round";
                bx.strokeStyle = "#FFD400"; // sudut bracket kuning, tipis
                const frac = 0.3;
                for (let i = 0; i < 4; i++) {
                  const p = c[i], a = c[(i + 3) % 4], b = c[(i + 1) % 4];
                  const pa = { x: p.x + (a.x - p.x) * frac, y: p.y + (a.y - p.y) * frac };
                  const pb = { x: p.x + (b.x - p.x) * frac, y: p.y + (b.y - p.y) * frac };
                  bx.beginPath(); bx.moveTo(pa.x, pa.y); bx.lineTo(p.x, p.y); bx.lineTo(pb.x, pb.y); bx.stroke();
                }
              }
            }
            if (code && code.data && String(code.data).trim()) {
              lastSeen = ts; setDetected(true);
              // QR berganti (scan QR berikutnya) → perbarui nomor ke QR terakhir
              if (code.data !== lastRawRef.current) {
                lastRawRef.current = code.data;
                editedRef.current = false;
                setNumVal(extractPhone(code.data).normalized);
              }
            } else if (ts - lastSeen > 500) {
              setDetected(false);
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        setErr("Kamera tidak dapat diakses. Izinkan akses kamera atau gunakan input manual."); setManual(true);
      }
    })();
    return () => { alive = false; stop(); };
  }, [stop, tries]);

  const close = () => { stop(); onClose(); };
  const submitManual = () => { const v = manualVal.trim(); if (v) finish(v); };
  const retryCam = () => { stop(); setManual(false); setErr(""); editedRef.current = false; setNumVal(""); setTries((n) => n + 1); };
  const numCheck = normalizePhone(numVal);
  const proceed = () => { if (numCheck.valid) finish(numCheck.normalized); };

  return (
    <Sheet title="Scan QR Kartu SIM" onClose={close}>
      <div style={{ padding: "0 18px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        <canvas ref={canvasRef} style={{ display: "none" }} />
        {!manual && (
          <div style={{ position: "relative", width: "100%", aspectRatio: "1/1", borderRadius: 18, overflow: "hidden", background: "#0B0B0C" }}>
            <video ref={videoRef} playsInline muted style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            <canvas ref={boxRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
            {!detected && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <div style={{ width: "64%", aspectRatio: "1/1", borderRadius: 20, border: "2.5px dashed rgba(255,255,255,0.7)" }} />
              </div>
            )}
            <div style={{ position: "absolute", bottom: 12, left: 0, right: 0, textAlign: "center", color: "#fff", fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
              {!scanning
                ? <><Loader2 size={15} style={{ animation: "pspin 1s linear infinite" }} /> Menyalakan kamera…</>
                : detected
                  ? <span style={{ color: "#4ADE80" }}>✓ QR terdeteksi</span>
                  : <><ScanLine size={15} /> Arahkan ke QR kartu SIM</>}
            </div>
          </div>
        )}

        {err && <AccessHelp kind="kamera" onRetry={retryCam} />}

        {manual ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: "#61616C" }}>Masukkan nomor dari QR / kartu SIM</label>
            <input value={manualVal} onChange={(e) => setManualVal(e.target.value)} inputMode="numeric" placeholder="mis. 082617837181 atau 62826…"
              style={{ height: 52, borderRadius: 13, border: "1px solid #E4E5EA", background: "#F6F7F9", color: "#17181C", fontFamily: FF, fontSize: 16, padding: "0 15px", outline: "none" }} />
            <button onClick={submitManual} disabled={!manualVal.trim()} style={{ height: 52, borderRadius: 13, border: "none", background: "#ED1C24", color: "#fff", fontFamily: FF, fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: manualVal.trim() ? 1 : 0.5 }}>Lanjut</button>
          </div>
        ) : !err && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Nomor terdeteksi (bisa dikoreksi) */}
            <label style={{ fontSize: 12, fontWeight: 700, color: "#61616C", display: "flex", alignItems: "center", gap: 6 }}>
              Nomor terdeteksi
              {numVal && (numCheck.valid
                ? <span style={{ color: "#1A9E5A", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}><Check size={13} /> valid</span>
                : <span style={{ color: "#B7791F", fontWeight: 700 }}>· periksa lagi</span>)}
            </label>
            <input value={numVal} onChange={(e) => { editedRef.current = true; setNumVal(e.target.value); }} inputMode="numeric" placeholder="menunggu QR…"
              style={{ height: 52, borderRadius: 13, border: `1px solid ${numVal && !numCheck.valid ? "#F0C2C2" : "#E4E5EA"}`, background: "#F6F7F9", color: "#17181C", fontFamily: FF, fontSize: 17, fontWeight: 700, letterSpacing: "0.01em", padding: "0 15px", outline: "none" }} />
            <button onClick={proceed} disabled={!numCheck.valid}
              style={{ height: 52, borderRadius: 13, border: "none", background: numCheck.valid ? "#ED1C24" : "#E4E5EA", color: numCheck.valid ? "#fff" : "#A2A2AD", fontFamily: FF, fontSize: 15.5, fontWeight: 700, cursor: numCheck.valid ? "pointer" : "default", transition: "background .15s" }}>
              Lanjut
            </button>
            <button onClick={() => setManual(true)} style={{ height: 44, borderRadius: 12, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#61616C", fontFamily: FF, fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}><Keyboard size={15} /> Input manual</button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
