"use client";
/**
 * /marta/photobooth/scan/[code] — halaman SCANNER dr HP, dibuka operator yg
 * bertugas mindai QR Photo ID tamu. Menggantikan scanner desktop lama yg ada
 * di panel operator (`app/marta/photobooth/page.jsx`) - SEKARANG scan
 * SELALU dr HP, supaya bisa ada beberapa operator+HP sekaligus aktif per
 * sesi ("mungkin ada beberapa operator beberapa mobile sekaligus").
 *
 * Alur: (1) tunggu daftar operator yg online (lewat presence realtime,
 * `subscribeRpvOperatorPairing` di lib/rpv.js) -> (2) HP ini WAJIB pilih dulu
 * mau pairing ke operator device mana ("Operator 1/2/dst") SEBELUM scan ->
 * (3) baru buka kamera & scan QR - begitu ketemu, hasilnya di-push HANYA ke
 * operator yg dipilih (broadcast bertarget, operator lain tidak terganggu).
 * Bisa scan berkali-kali (bukan sekali pakai) & bisa ganti operator kapan
 * saja lewat tombol di header.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Check, Loader2, QrCode, Radio, ScanLine, Users } from "lucide-react";
import { getRpvSession, subscribeRpvOperatorPairing } from "../../../../../lib/rpv";
import { PhotoboothPwaHead, usePhotoboothServiceWorker } from "../../_pwa";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24";
const MAGA = "#C6168D";
const VIO = "#7C3AED";
// Tema GELAP (senada dgn /marta/photobooth/go & /marta/photobooth/scan) -
// sebelumnya halaman ini kepeleset pakai palet TERANG bawaan
// upload/[code]/page.jsx, jadi kelihatan "tiba2 putih" nyelip di antara
// halaman2 lain yg semuanya gelap+ambient ("tetap pertahankan desain
// darkmode dengan ambience").
const BG = "#0A0A0B";
const CARD = "#1A1B1D";
const CARD_HI = "#212226";
const INK = "#F1F1F3";
const LINE = "rgba(255,255,255,0.09)";
const SUB = "#84848C";

const SCANNER_ID_KEY = "rpv-scanner-id";

function loadJsQR() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (window.jsQR) return resolve(window.jsQR);
    const existing = document.getElementById("rpv-jsqr-cdn");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.jsQR));
      existing.addEventListener("error", () => reject(new Error("load fail")));
      return;
    }
    const scr = document.createElement("script");
    scr.id = "rpv-jsqr-cdn";
    scr.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
    scr.async = true;
    scr.onload = () => resolve(window.jsQR);
    scr.onerror = () => reject(new Error("load fail"));
    document.head.appendChild(scr);
  });
}

export default function RpvScanPage() {
  const params = useParams();
  const code = (params?.code || "").toString().toUpperCase();
  usePhotoboothServiceWorker("scanner");

  const [state, setState] = useState("loading"); // loading | ready | notfound
  const [session, setSession] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await getRpvSession(code);
        if (!s || !s.is_active) { setState("notfound"); return; }
        setSession(s);
        setState("ready");
      } catch { setState("notfound"); }
    })();
  }, [code]);

  // ── Identitas HP scanner ini (persist per-device, sama pola dgn operator) ─
  const [scannerId, setScannerId] = useState("");
  const joinedAtRef = useRef(0);
  useEffect(() => {
    (async () => {
      let id = "";
      try {
        id = localStorage.getItem(SCANNER_ID_KEY) || "";
        if (!id) {
          id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `sc-${Math.random().toString(36).slice(2)}`;
          localStorage.setItem(SCANNER_ID_KEY, id);
        }
      } catch { id = `sc-${Math.random().toString(36).slice(2)}`; }
      joinedAtRef.current = Date.now();
      setScannerId(id);
    })();
  }, []);

  // ── Join channel pairing (presence role "scanner" - tdk ikut dihitung sbg
  // operator oleh subscribeRpvOperatorPairing krn filter role==="operator") ─
  const [operators, setOperators] = useState([]);
  const pairingRef = useRef(null);
  useEffect(() => {
    if (!code || state !== "ready" || !scannerId) {
      Promise.resolve().then(() => setOperators([]));
      return;
    }
    const pairing = subscribeRpvOperatorPairing(
      code,
      { id: scannerId, role: "scanner", joinedAt: joinedAtRef.current },
      { onOperatorsChange: setOperators }
    );
    pairingRef.current = pairing;
    return () => { pairing.unsubscribe(); pairingRef.current = null; };
  }, [code, state, scannerId]);

  const [pairedId, setPairedId] = useState("");
  const pairedIndex = operators.findIndex((o) => o.id === pairedId);
  const pairedStillOnline = pairedIndex >= 0;
  const pairedLabel = pairedStillOnline ? `Operator ${pairedIndex + 1}` : "";

  const [lastSent, setLastSent] = useState(null); // { digits, at }
  const onDetect = useCallback((digits) => {
    pairingRef.current?.broadcastSelectPhoto(pairedId, digits);
    setLastSent({ digits, at: Date.now() });
  }, [pairedId]);

  if (state === "loading") {
    return <Center><Loader2 size={26} color={RED} style={{ animation: "spin 1s linear infinite" }} /></Center>;
  }
  if (state === "notfound") {
    return (
      <Center>
        <AlertTriangle size={30} color={RED} />
        <div style={{ marginTop: 12, fontSize: 15, fontWeight: 700, color: INK }}>Sesi tidak ditemukan</div>
        <div style={{ marginTop: 4, fontSize: 13, color: SUB, textAlign: "center", maxWidth: 280 }}>Link ini sudah tidak berlaku atau sesi belum aktif.</div>
      </Center>
    );
  }

  if (!pairedStillOnline) {
    return (
      <>
        <PhotoboothPwaHead variant="scanner" />
        <OperatorPicker
          sessionTitle={session?.title}
          operators={operators}
          onPick={(id) => setPairedId(id)}
          wasPaired={!!pairedId}
        />
      </>
    );
  }

  return (
    <>
      <PhotoboothPwaHead variant="scanner" />
      <ScannerView
        sessionTitle={session?.title}
        pairedLabel={pairedLabel}
        lastSent={lastSent}
        onChangeOperator={() => setPairedId("")}
        onDetect={onDetect}
      />
    </>
  );
}

function Center({ children }) {
  return (
    <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: BG, fontFamily: FONT, padding: 20, position: "relative", zIndex: 2, boxSizing: "border-box", colorScheme: "dark" }}>
      {children}
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}

/** Layar pilih operator - WAJIB sebelum scan, supaya HP tau mau push QR
 * hasil scan kemana ("dia akan pilih dulu device operator mana yang akan
 * di pairing"). Tema gelap + ambient senada dgn /marta/photobooth/scan &
 * /go - baris pertama SEKARANG nama sesi (bukan "Pilih Operator" di baris
 * 1 dgn subtitle nyambung pakai "·" yg bikin tidak proporsional), baru
 * "Pilih Operator" & keterangan menyusul di baris2 terpisah di bawahnya. */
function OperatorPicker({ sessionTitle, operators, onPick, wasPaired }) {
  return (
    <div style={{ minHeight: "100svh", background: BG, fontFamily: FONT, display: "flex", flexDirection: "column", padding: "max(20px,env(safe-area-inset-top)) 18px 24px", boxSizing: "border-box", position: "relative", colorScheme: "dark" }}>
      <div className="rpv-sc-ambient" aria-hidden="true">
        <div className="rpv-sc-ambient-blob rpv-sc-ambient-blob--a" />
        <div className="rpv-sc-ambient-blob rpv-sc-ambient-blob--b" />
        <div className="rpv-sc-ambient-dots" />
      </div>

      <div style={{ position: "relative", zIndex: 1, textAlign: "center", marginTop: 8, marginBottom: 22 }}>
        <div style={{ width: 46, height: 46, borderRadius: 14, background: `linear-gradient(135deg,${VIO},${MAGA})`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <QrCode size={22} color="#fff" />
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: INK, letterSpacing: "-0.01em" }}>{sessionTitle || "Sesi"}</div>
        <div style={{ fontSize: 12.5, color: MAGA, fontWeight: 700, marginTop: 6 }}>Pilih Operator</div>
        <div style={{ fontSize: 12, color: SUB, marginTop: 4, lineHeight: 1.5 }}>Pilih device operator yang mau<br />dipasangkan ke HP ini</div>
      </div>

      {wasPaired && (
        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 8, padding: "10px 13px", borderRadius: 12, background: "rgba(237,28,36,0.12)", border: "1px solid rgba(237,28,36,0.28)", marginBottom: 14 }}>
          <AlertTriangle size={15} color={RED} style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 12, color: "#FCA5A5", fontWeight: 600 }}>Operator yang dipilih sudah tidak online. Pilih ulang.</div>
        </div>
      )}

      {operators.length === 0 ? (
        <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: SUB, textAlign: "center" }}>
          <Loader2 size={22} style={{ animation: "spin 1s linear infinite" }} />
          <div style={{ fontSize: 13, fontWeight: 600, maxWidth: 260 }}>Menunggu panel operator dibuka…<br />Buka panel di laptop/komputer operator dulu.</div>
        </div>
      ) : (
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          {operators.map((o, i) => (
            <button key={o.id} onClick={() => onPick(o.id)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 16px", borderRadius: 16, border: `1px solid ${LINE}`, background: `linear-gradient(180deg, ${CARD_HI} 0%, ${CARD} 100%)`, cursor: "pointer", textAlign: "left" }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: `linear-gradient(135deg,${VIO},${MAGA})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Radio size={18} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: INK }}>Operator {i + 1}</div>
                <div style={{ fontSize: 11.5, color: SUB, marginTop: 1 }}>Online sekarang</div>
              </div>
              <div style={{ width: 9, height: 9, borderRadius: 99, background: "#22C55E", flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes rpv-sc-ambient-drift-a {
          0%, 100% { transform: translate(-14%, 10%) scale(1); }
          50%       { transform: translate(12%, -8%) scale(1.28); }
        }
        @keyframes rpv-sc-ambient-drift-b {
          0%, 100% { transform: translate(16%, 8%) scale(1.15); }
          50%       { transform: translate(-12%, -10%) scale(0.88); }
        }
        @keyframes rpv-sc-ambient-pulse {
          0%, 100% { opacity: 0.62; }
          50%       { opacity: 0.92; }
        }
        .rpv-sc-ambient {
          position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden;
          -webkit-mask-image: linear-gradient(180deg, transparent 0%, transparent 42%, rgba(0,0,0,0.9) 68%, rgba(0,0,0,0.65) 100%);
          mask-image: linear-gradient(180deg, transparent 0%, transparent 42%, rgba(0,0,0,0.9) 68%, rgba(0,0,0,0.65) 100%);
        }
        .rpv-sc-ambient-blob {
          position: absolute; border-radius: 50%; filter: blur(min(48px, 8vw));
          width: min(70vw, 560px); aspect-ratio: 1;
        }
        .rpv-sc-ambient-blob--a {
          left: 4%; bottom: -18%; background: radial-gradient(circle, ${MAGA}52 0%, transparent 68%);
          animation: rpv-sc-ambient-drift-a 11s ease-in-out infinite, rpv-sc-ambient-pulse 6s ease-in-out infinite;
        }
        .rpv-sc-ambient-blob--b {
          right: 0%; bottom: -22%; width: min(62vw, 500px); background: radial-gradient(circle, ${VIO}46 0%, transparent 68%);
          animation: rpv-sc-ambient-drift-b 13s ease-in-out infinite, rpv-sc-ambient-pulse 7.5s ease-in-out infinite 1.3s;
        }
        .rpv-sc-ambient-dots {
          position: absolute; inset: 0;
          background-image: radial-gradient(${MAGA}80 1px, transparent 1.6px);
          background-size: 22px 22px;
          animation: rpv-sc-ambient-pulse 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

/** Kamera live full-screen + overlay deteksi QR, mode "terus jalan" (bisa
 * scan berkali-kali, bukan sekali lalu tutup) - tiap sukses langsung
 * broadcast ke operator yg dipasangkan. */
function ScannerView({ sessionTitle, pairedLabel, lastSent, onChangeOperator, onDetect }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const boxRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const lastFireRef = useRef(0);

  const [scanning, setScanning] = useState(false);
  const [detected, setDetected] = useState(false);
  const [manual, setManual] = useState(false);
  const [manualVal, setManualVal] = useState("");
  const [camErr, setCamErr] = useState("");

  const stop = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);

  const onDetectRef = useRef(onDetect);
  useEffect(() => { onDetectRef.current = onDetect; });

  useEffect(() => {
    let alive = true;

    (async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setCamErr("Kamera tidak tersedia di perangkat ini. Gunakan input manual.");
        setManual(true);
        return;
      }
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
        const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!alive) { st.getTracks().forEach((tr) => tr.stop()); return; }
        streamRef.current = st;
        const v = videoRef.current;
        if (v) { v.setAttribute("playsinline", "true"); v.srcObject = st; await v.play().catch(() => {}); }
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
            const qcode = img ? jsQR(img.data, w, h, { inversionAttempts: "attemptBoth" }) : null;

            if (box) {
              if (box.width !== vw) { box.width = vw; box.height = vh; }
              const bx = box.getContext("2d");
              bx.clearRect(0, 0, vw, vh);
              if (qcode && qcode.location) {
                const fx = vw / w, fy = vh / h, L = qcode.location;
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

            if (qcode && qcode.data) {
              const digits = String(qcode.data).trim().replace(/\D/g, "");
              if (digits.length === 5) {
                lastSeen = ts; setDetected(true);
                // Mode terus-jalan: boleh scan berkali2, tapi kasih jeda 1.4s
                // antar tembakan biar tdk nge-spam broadcast QR yg sama.
                if (ts - lastFireRef.current > 1400) {
                  lastFireRef.current = ts;
                  onDetectRef.current(digits);
                }
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
  }, [stop]);

  const manualDigits = manualVal.trim().replace(/\D/g, "");
  const manualOk = manualDigits.length === 5;
  const confirmManual = () => {
    if (!manualOk) return;
    onDetect(manualDigits);
    setManualVal("");
  };

  // justSent sbg STATE tersendiri (bukan dihitung langsung dr Date.now() pas
  // render, itu impure) - dipasang true begitu lastSent berubah, otomatis
  // balik false lewat timer stlh 2.2s.
  const [justSent, setJustSent] = useState(false);
  useEffect(() => {
    if (!lastSent) return;
    let t;
    Promise.resolve().then(() => {
      setJustSent(true);
      t = setTimeout(() => setJustSent(false), 2200);
    });
    return () => clearTimeout(t);
  }, [lastSent]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0A0A0C", fontFamily: FONT, display: "flex", flexDirection: "column", zIndex: 10 }}>
      <div style={{ padding: "max(14px,env(safe-area-inset-top)) 16px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sessionTitle || "Sesi"}</div>
        </div>
        <button onClick={onChangeOperator}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 99, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)", color: "#fff", fontFamily: FONT, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          <Users size={13} /> {pairedLabel}
        </button>
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} />

      {!manual && (
        <div style={{ position: "relative", flex: 1, margin: "0 16px", borderRadius: 20, overflow: "hidden", background: "#000" }}>
          <video ref={videoRef} playsInline muted style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <canvas ref={boxRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
          {!detected && !justSent && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <div style={{ width: "70%", aspectRatio: "1/1", borderRadius: 22, border: "2.5px dashed rgba(255,255,255,0.7)" }} />
            </div>
          )}
          {justSent && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: "rgba(6,20,12,0.55)" }}>
              <div style={{ width: 60, height: 60, borderRadius: 99, background: "#22C55E", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Check size={30} color="#fff" strokeWidth={3} />
              </div>
              <div style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>Terkirim ke {pairedLabel}</div>
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "monospace" }}>ID {lastSent.digits}</div>
            </div>
          )}
          <div style={{ position: "absolute", bottom: 14, left: 0, right: 0, textAlign: "center", color: "#fff", fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
            {!scanning
              ? <><Loader2 size={14} style={{ animation: "spin .85s linear infinite" }} /> Menyalakan kamera…</>
              : justSent
                ? null
                : <><ScanLine size={14} /> Arahkan ke QR di layar tamu</>}
          </div>
        </div>
      )}

      <div style={{ padding: "14px 16px max(16px,env(safe-area-inset-bottom))" }}>
        {camErr && (
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 9, padding: "11px 13px", borderRadius: 12, background: "rgba(220,38,38,0.16)", border: "1px solid rgba(220,38,38,0.3)" }}>
            <AlertTriangle size={16} color="#F87171" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: "#FCA5A5", fontWeight: 600, lineHeight: 1.5 }}>{camErr}</div>
          </div>
        )}

        {manual ? (
          <form onSubmit={(e) => { e.preventDefault(); confirmManual(); }} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>Photo ID (5 digit)</label>
              <input value={manualVal} onChange={(e) => setManualVal(e.target.value)} inputMode="numeric" enterKeyHint="done" placeholder="00042" autoFocus
                style={{ width: "100%", height: 50, borderRadius: 13, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.06)", color: "#fff", fontFamily: "monospace", fontSize: 18, fontWeight: 800, letterSpacing: "0.1em", padding: "0 14px", outline: "none", marginTop: 6, boxSizing: "border-box" }} />
            </div>
            <button type="submit" disabled={!manualOk}
              style={{ height: 50, borderRadius: 13, border: "none", background: manualOk ? `linear-gradient(135deg,${VIO},${MAGA})` : "rgba(255,255,255,0.1)", color: manualOk ? "#fff" : "rgba(255,255,255,0.35)", fontFamily: FONT, fontSize: 14.5, fontWeight: 800, cursor: manualOk ? "pointer" : "not-allowed" }}>
              Kirim ke {pairedLabel}
            </button>
            {!camErr && (
              <button type="button" onClick={() => setManual(false)}
                style={{ height: 44, borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "rgba(255,255,255,0.7)", fontFamily: FONT, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}>
                <QrCode size={14} /> Coba scan kamera lagi
              </button>
            )}
          </form>
        ) : !camErr && (
          <button onClick={() => setManual(true)}
            style={{ height: 44, width: "100%", borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "rgba(255,255,255,0.7)", fontFamily: FONT, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}>
            Ketik Photo ID manual
          </button>
        )}
      </div>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}
