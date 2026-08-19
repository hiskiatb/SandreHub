"use client";
/**
 * QrScanSheet - Scan QR kartu SIM lintas MSISDN. SATU sumber kebenaran,
 * dipakai dari Submit Laporan Actual - siap dipakai layar lain yg nanti
 * butuh scan serupa juga.
 *
 * KENAPA SEBELUMNYA "belum aktif": versi lama pakai `BarcodeDetector`, API
 * NATIVE browser yang HANYA didukung Chrome/Edge di Android - TIDAK ada
 * sama sekali di Safari/iOS maupun Firefox. Tombol scan otomatis
 * disembunyikan di perangkat yang tidak mendukungnya, jadi terasa seperti
 * fitur "belum aktif" padahal memang sengaja disembunyikan.
 *
 * Sekarang dipindah ke `jsQR` - decoder QR murni JavaScript (BUKAN API
 * browser, jalan di atas <canvas> biasa) yang bekerja di SEMUA browser
 * modern yang punya akses kamera, persis pola yang sudah terbukti jalan di
 * SandraHub/Promotor (scan QR kartu SIM utk claim penjualan - lihat
 * app/promotor/components.jsx > QRScannerSheet).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { QrCode, ScanLine, Keyboard, Check, X, Loader2, AlertTriangle } from "lucide-react";
import { FF, BRAND } from "./MobileShell";
import { isValidMsisdn, normalizeMsisdn, msisdnFromQrPayload } from "./msisdn";

/* Muat jsQR via CDN sekali saja (di-cache di window.jsQR) - sama persis dgn
   pola loadJsQR() di Promotor, supaya kalau CDN-nya lambat/gagal kita tidak
   nge-blok render sheet-nya, cuma otomatis jatuh ke input manual. */
function loadJsQR() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (window.jsQR) return resolve(window.jsQR);
    const existing = document.getElementById("mh-jsqr-cdn");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.jsQR));
      existing.addEventListener("error", () => reject(new Error("load fail")));
      return;
    }
    const s = document.createElement("script");
    s.id = "mh-jsqr-cdn";
    s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
    s.async = true;
    s.onload = () => resolve(window.jsQR);
    s.onerror = () => reject(new Error("load fail"));
    document.head.appendChild(s);
  });
}

/**
 * @param {{ onClose: () => void, onDetect: (msisdn: string, raw: string) => void, title?: string }} props
 */
export default function QrScanSheet({ onClose, onDetect, title = "Scan QR Kartu SIM" }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null); // buffer decode, tersembunyi
  const boxRef = useRef(null); // overlay kotak deteksi di atas video
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const lastRawRef = useRef("");

  const [scanning, setScanning] = useState(false);
  const [detected, setDetected] = useState(false);
  const [manual, setManual] = useState(false);
  const [numVal, setNumVal] = useState("");
  const [manualVal, setManualVal] = useState("");
  const [camErr, setCamErr] = useState("");
  const [localErr, setLocalErr] = useState("");
  const [tries, setTries] = useState(0);

  const stop = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Inisialisasi: muat jsQR → nyalakan kamera belakang → live tracking QR.
  // `tries` sengaja jadi dependency supaya tombol "coba scan lagi" bisa
  // memicu ulang seluruh proses tanpa harus unmount/mount sheet-nya.
  useEffect(() => {
    let alive = true;
    lastRawRef.current = "";
    setCamErr(""); setScanning(false); setDetected(false); setNumVal("");

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCamErr("Kamera tidak tersedia di perangkat/koneksi ini. Gunakan input manual.");
      setManual(true);
      return;
    }

    (async () => {
      let jsQR;
      try {
        jsQR = await loadJsQR();
      } catch {
        if (!alive) return;
        setCamErr("Gagal memuat pemindai QR. Gunakan input manual.");
        setManual(true);
        return;
      }
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
            let img;
            try { img = ctx.getImageData(0, 0, w, h); } catch { img = null; }
            const code = img ? jsQR(img.data, w, h, { inversionAttempts: "attemptBoth" }) : null;

            if (box) {
              if (box.width !== vw) { box.width = vw; box.height = vh; }
              const bx = box.getContext("2d");
              bx.clearRect(0, 0, vw, vh);
              if (code && code.location) {
                const fx = vw / w, fy = vh / h, L = code.location;
                const c = [L.topLeftCorner, L.topRightCorner, L.bottomRightCorner, L.bottomLeftCorner].map((p) => ({ x: p.x * fx, y: p.y * fy }));
                bx.lineWidth = Math.max(3, vw * 0.008); bx.lineCap = "round"; bx.lineJoin = "round";
                bx.strokeStyle = "#FFD400";
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
              // QR berganti (mis. scan kartu berikutnya) → perbarui nomor
              if (code.data !== lastRawRef.current) {
                lastRawRef.current = code.data;
                setLocalErr("");
                setNumVal(msisdnFromQrPayload(code.data) || "");
              }
            } else if (ts - lastSeen > 500) {
              setDetected(false);
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (!alive) return;
        setCamErr("Kamera tidak dapat diakses. Izinkan akses kamera atau gunakan input manual.");
        setManual(true);
      }
    })();

    return () => { alive = false; stop(); };
  }, [stop, tries]);

  const close = () => { stop(); onClose(); };
  const retryCam = () => { stop(); setManual(false); setCamErr(""); setLocalErr(""); setNumVal(""); setTries((n) => n + 1); };

  const scanNorm = normalizeMsisdn(numVal);
  const scanOk = isValidMsisdn(scanNorm);
  const manualNorm = normalizeMsisdn(manualVal);
  const manualOk = isValidMsisdn(manualNorm);

  const confirmScanned = () => {
    if (!scanOk) { setLocalErr('Nomor belum valid - wajib diawali "62".'); return; }
    stop();
    onDetect(scanNorm, lastRawRef.current);
  };
  const confirmManual = () => {
    if (!manualOk) { setLocalErr('Nomor belum valid - wajib diawali "62".'); return; }
    stop();
    onDetect(manualNorm, manualVal.trim());
  };

  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(10,10,12,0.92)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center", fontFamily: FF }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: "#17181C", borderRadius: "24px 24px 0 0", padding: "10px 18px calc(env(safe-area-inset-bottom,0px) + 20px)" }}>
        <div style={{ width: 38, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.18)", margin: "6px auto 14px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{title}</div>
          <button onClick={close} style={{ width: 30, height: 30, borderRadius: 10, border: "none", background: "rgba(255,255,255,0.08)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={16} />
          </button>
        </div>

        <canvas ref={canvasRef} style={{ display: "none" }} />

        {!manual && (
          <div style={{ position: "relative", width: "100%", aspectRatio: "1/1", borderRadius: 18, overflow: "hidden", background: "#000" }}>
            <video ref={videoRef} playsInline muted style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            <canvas ref={boxRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
            {!detected && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <div style={{ width: "64%", aspectRatio: "1/1", borderRadius: 20, border: "2.5px dashed rgba(255,255,255,0.7)" }} />
              </div>
            )}
            <div style={{ position: "absolute", bottom: 12, left: 0, right: 0, textAlign: "center", color: "#fff", fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
              {!scanning
                ? <><Loader2 size={14} style={{ animation: "mspin .85s linear infinite" }} /> Menyalakan kamera…</>
                : detected
                  ? <span style={{ color: "#4ADE80" }}>✓ QR terdeteksi</span>
                  : <><ScanLine size={14} /> Arahkan ke QR kartu SIM</>}
            </div>
          </div>
        )}

        {camErr && (
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 9, padding: "11px 13px", borderRadius: 12, background: "rgba(220,38,38,0.14)", border: "1px solid rgba(220,38,38,0.3)" }}>
            <AlertTriangle size={16} color="#F87171" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: "#FCA5A5", fontWeight: 600, lineHeight: 1.5 }}>{camErr}</div>
          </div>
        )}

        {manual ? (
          <form onSubmit={(e) => { e.preventDefault(); confirmManual(); }} style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>Nomor MSISDN</label>
              <input value={manualVal} onChange={(e) => setManualVal(e.target.value)} inputMode="tel" enterKeyHint="done" placeholder="Contoh: 628123456789"
                style={{ width: "100%", height: 50, borderRadius: 13, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "#fff", fontFamily: FF, fontSize: 15, fontWeight: 700, padding: "0 14px", outline: "none", marginTop: 6, boxSizing: "border-box" }} />
            </div>
            {localErr && <div style={{ fontSize: 12, fontWeight: 700, color: "#F87171", textAlign: "center" }}>{localErr}</div>}
            <button type="submit"
              style={{ height: 50, borderRadius: 13, border: "none", background: manualOk ? BRAND : "rgba(255,255,255,0.1)", color: manualOk ? "#fff" : "rgba(255,255,255,0.35)", fontFamily: FF, fontSize: 14.5, fontWeight: 800, cursor: "pointer" }}>
              Gunakan Nomor Ini
            </button>
            {!camErr && (
              <button type="button" onClick={retryCam}
                style={{ height: 44, borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "rgba(255,255,255,0.75)", fontFamily: FF, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}>
                <QrCode size={14} /> Coba scan kamera lagi
              </button>
            )}
          </form>
        ) : !camErr && (
          <form onSubmit={(e) => { e.preventDefault(); confirmScanned(); }} style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", gap: 6 }}>
                Nomor terdeteksi
                {numVal && (scanOk
                  ? <span style={{ color: "#4ADE80", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}><Check size={12} /> valid</span>
                  : <span style={{ color: "#FBBF24", fontWeight: 700 }}>· periksa lagi</span>)}
              </label>
              <input value={numVal} onChange={(e) => setNumVal(e.target.value)} inputMode="tel" enterKeyHint="done" placeholder="menunggu QR…"
                style={{ width: "100%", height: 50, borderRadius: 13, border: `1px solid ${numVal && !scanOk ? "rgba(248,113,113,0.4)" : "rgba(255,255,255,0.14)"}`, background: "rgba(255,255,255,0.06)", color: "#fff", fontFamily: FF, fontSize: 16, fontWeight: 700, padding: "0 14px", outline: "none", marginTop: 6, boxSizing: "border-box" }} />
            </div>
            {localErr && <div style={{ fontSize: 12, fontWeight: 700, color: "#F87171", textAlign: "center" }}>{localErr}</div>}
            <button type="submit"
              style={{ height: 50, borderRadius: 13, border: "none", background: scanOk ? BRAND : "rgba(255,255,255,0.1)", color: scanOk ? "#fff" : "rgba(255,255,255,0.35)", fontFamily: FF, fontSize: 14.5, fontWeight: 800, cursor: "pointer" }}>
              Gunakan Nomor Ini
            </button>
            <button type="button" onClick={() => setManual(true)}
              style={{ height: 44, borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "rgba(255,255,255,0.75)", fontFamily: FF, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}>
              <Keyboard size={14} /> Input manual
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
