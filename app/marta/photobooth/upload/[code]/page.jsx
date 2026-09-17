"use client";
/**
 * /marta/photobooth/upload/[code] — halaman PUBLIK (tanpa login), dibuka
 * tamu lewat link/QR yang dibagikan panitia. Didesain ulang total ("ui
 * sangat bagus dan mewah", "upload dibuat sangat mudah dan ada progress
 * uploadnya", permintaan user) - tiap file kini punya progress bar
 * individual (pakai onProgress dari uploadRpvPhoto di lib/rpv.js, bukan
 * cuma status pending/uploading/done polos spt sebelumnya), dan begitu
 * SEMUA foto di antrean selesai terunggah, muncul layar sukses full-screen
 * dgn animasi confetti + ring "sonar" + checkmark digambar + nada sukses
 * singkat - PERSIS gaya/animasi yg dipakai di layar sukses submit laporan
 * Plan/Actual MartaHub mobile (app/martahub/m/activities/[id]/submit/
 * page.jsx, komponen SubmitSuccessScreen), supaya konsisten & terasa
 * "premium" sesuai diminta, bukan generate ulang gaya baru dari nol.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Camera, ImagePlus, Loader2, Ticket, X } from "lucide-react";
import { getRpvSession, uploadRpvPhoto } from "../../../../../lib/rpv";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24";
const MAGA = "#C6168D";

export default function RpvUploadPage() {
  const params = useParams();
  const code = (params?.code || "").toString().toUpperCase();
  const fileRef = useRef(null);

  const [state, setState] = useState("loading"); // loading | ready | notfound
  const [session, setSession] = useState(null);
  const [queue, setQueue] = useState([]); // { id, file, previewUrl, status, progress, photoCode, error }
  const [showSuccess, setShowSuccess] = useState(false);
  const celebratedRef = useRef(false); // biar animasi sukses cuma sekali per "gelombang" upload, tidak berulang tiap render

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

  const onPick = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    celebratedRef.current = false; // batch baru -> boleh rayakan lagi kalau semua sukses
    const items = files.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file, previewUrl: URL.createObjectURL(file), status: "pending", progress: 0, photoCode: null, error: "",
    }));
    setQueue((q) => [...items, ...q]);
    items.forEach(uploadOne);
    e.target.value = ""; // supaya bisa pilih file yg sama lagi kalau perlu
  };

  const uploadOne = async (item) => {
    setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "uploading", progress: 0.02 } : x)));
    try {
      const { photoCode } = await uploadRpvPhoto(code, item.file, (p) => {
        setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, progress: p } : x)));
      });
      setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "done", progress: 1, photoCode } : x)));
    } catch (e) {
      setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "error", error: e.message || "Gagal unggah" } : x)));
    }
  };

  const removeItem = (id) => setQueue((q) => q.filter((x) => x.id !== id));

  const doneCount = queue.filter((x) => x.status === "done").length;
  const errorCount = queue.filter((x) => x.status === "error").length;
  const activeCount = queue.filter((x) => x.status === "pending" || x.status === "uploading").length;
  // Progress keseluruhan (0-1) - dipakai bar ringkasan di atas grid, rata2
  // dari progress tiap file (file "done" dihitung penuh 1, "error" juga
  // dianggap selesai/tidak diproses lagi spy bar tidak nyangkut).
  const overallProgress = useMemo(() => {
    if (!queue.length) return 0;
    const sum = queue.reduce((s, x) => s + (x.status === "done" || x.status === "error" ? 1 : x.progress || 0), 0);
    return sum / queue.length;
  }, [queue]);

  // Begitu SEMUA item di antrean sudah tuntas (done/error) DAN minimal 1
  // sukses DAN tidak ada lagi yg masih aktif -> tampilkan layar sukses
  // sekali (celebratedRef mencegah re-trigger tiap re-render/tiap file
  // baru yg kebetulan juga langsung "done" krn cache dsb).
  useEffect(() => {
    if (!queue.length || activeCount > 0 || celebratedRef.current) return;
    if (doneCount > 0) {
      celebratedRef.current = true;
      setShowSuccess(true);
    }
  }, [queue.length, activeCount, doneCount]);

  if (state === "loading") {
    return <Center><Loader2 size={26} color={RED} style={{ animation: "spin 1s linear infinite" }} /></Center>;
  }
  if (state === "notfound") {
    return (
      <Center>
        <AlertTriangle size={30} color={RED} />
        <div style={{ marginTop: 12, fontSize: 15, fontWeight: 700, color: "#111116" }}>Sesi tidak ditemukan</div>
        <div style={{ marginTop: 4, fontSize: 13, color: "#8A8A96", textAlign: "center", maxWidth: 280 }}>Link ini sudah tidak berlaku atau sesi photobooth belum aktif.</div>
      </Center>
    );
  }

  if (showSuccess) {
    return (
      <UploadSuccessScreen
        doneCount={doneCount}
        errorCount={errorCount}
        onDone={() => setShowSuccess(false)}
        onUploadMore={() => { setShowSuccess(false); fileRef.current?.click(); }}
      />
    );
  }

  return (
    <div style={{ minHeight: "100svh", background: "linear-gradient(180deg,#F7F5FA 0%,#F4F4F6 220px)", fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "22px 18px 16px", background: "#fff", borderBottom: "1px solid #E4E2EA", position: "sticky", top: 0, zIndex: 5, boxShadow: "0 2px 10px rgba(17,17,22,0.03)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 42, height: 42, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", flexShrink: 0, boxShadow: "0 6px 16px rgba(237,28,36,0.28)" }}>
            <Camera size={19} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#111116", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>{session?.title}</div>
            <div style={{ fontSize: 11.5, color: "#8A8A96", marginTop: 1 }}>Kode sesi <b style={{ color: "#5A5A68", fontFamily: "monospace", letterSpacing: "0.05em" }}>{code}</b> · Unggah foto dari galeri kamu</div>
          </div>
        </div>
        {/* Bar progress ringkasan - cuma muncul kalau ada yg masih diproses,
            biar header tetap ringkas saat idle. */}
        {activeCount > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10.5, fontWeight: 700, color: "#8A8A96", marginBottom: 5 }}>
              <span>Mengunggah {doneCount + errorCount}/{queue.length}…</span>
              <span style={{ color: RED }}>{Math.round(overallProgress * 100)}%</span>
            </div>
            <div style={{ width: "100%", height: 6, borderRadius: 99, background: "#EFEDF3", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 99, width: `${overallProgress * 100}%`, background: `linear-gradient(90deg,${RED},${MAGA})`, transition: "width .25s ease" }} />
            </div>
          </div>
        )}
      </div>

      <div style={{ flex: 1, padding: "20px 16px 100px", maxWidth: 520, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPick} style={{ display: "none" }} />

        <button onClick={() => fileRef.current?.click()}
          style={{
            width: "100%", height: 152, borderRadius: 22, border: "none", cursor: "pointer", fontFamily: FONT,
            background: `linear-gradient(155deg, rgba(237,28,36,0.08), rgba(198,22,141,0.06))`,
            boxShadow: "inset 0 0 0 2px rgba(237,28,36,0.18)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
          }}>
          <div style={{
            width: 54, height: 54, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
            background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", boxShadow: "0 10px 26px rgba(237,28,36,0.32)",
          }}>
            <ImagePlus size={24} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#17181C" }}>Pilih Foto dari Galeri</span>
          <span style={{ fontSize: 11.5, color: "#8A8A96", fontWeight: 600 }}>Bisa pilih beberapa foto sekaligus</span>
        </button>

        {queue.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#5A5A68", marginBottom: 10 }}>{doneCount}/{queue.length} foto terunggah</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 10 }}>
              {queue.map((it) => (
                <div key={it.id} style={{ position: "relative", borderRadius: 14, overflow: "hidden", aspectRatio: "1/1", background: "#E4E2EA", boxShadow: "0 2px 8px rgba(17,17,22,0.06)" }}>
                  <img src={it.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  {/* Progress ring melingkar di TENGAH foto saat uploading -
                      jauh lebih jelas & "premium" drpd cuma spinner kecil di
                      pojok spt versi sebelumnya. */}
                  {it.status === "uploading" && (
                    <div style={{ position: "absolute", inset: 0, background: "rgba(17,17,22,0.32)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <CircularProgress value={it.progress || 0} />
                    </div>
                  )}
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,0) 55%,rgba(0,0,0,0.62) 100%)", display: "flex", alignItems: "flex-end", padding: 7, pointerEvents: "none" }}>
                    {it.status === "done" && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#fff", fontSize: 11, fontWeight: 700 }}>
                        <Ticket size={12} /> {it.photoCode}
                      </span>
                    )}
                    {it.status === "error" && <span style={{ color: "#FCA5A5", fontSize: 10.5, fontWeight: 700 }}>Gagal</span>}
                  </div>
                  {it.status !== "uploading" && (
                    <button onClick={() => removeItem(it.id)} style={{ position: "absolute", top: 5, right: 5, width: 20, height: 20, borderRadius: 999, border: "none", background: "rgba(0,0,0,0.55)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <X size={11} />
                    </button>
                  )}
                  {it.status === "done" && (
                    <span style={{ position: "absolute", top: 5, left: 5, width: 20, height: 20, borderRadius: 999, background: "#16A34A", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(22,163,74,0.4)" }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box}"}</style>
    </div>
  );
}

/** Ring progress melingkar kecil (SVG, tanpa library) - dipakai di tengah
 * tiap thumbnail foto yg lagi diunggah, jauh lebih jelas drpd spinner
 * generik krn menunjukkan PERSENTASE riil (dari onProgress uploadRpvPhoto),
 * bukan cuma "lagi proses". */
function CircularProgress({ value }) {
  const pct = Math.max(0, Math.min(1, value));
  const r = 15, c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: 38, height: 38 }}>
      <svg width="38" height="38" viewBox="0 0 38 38" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="19" cy="19" r={r} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="3.5" />
        <circle cx="19" cy="19" r={r} fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset .2s ease" }} />
      </svg>
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff" }}>
        {Math.round(pct * 100)}
      </span>
    </div>
  );
}

/** Layar sukses full-screen begitu antrean upload tuntas - animasi & nada
 * PERSIS gaya SubmitSuccessScreen di app/martahub/m/activities/[id]/submit/
 * page.jsx (ring sonar 2 lapis, confetti 14 partikel meletup & jatuh,
 * lingkaran+centang digambar via stroke-dashoffset, nada sukses disintesis
 * Web Audio) - dipertahankan identik sesuai diminta ("gunakan animasi
 * berhasil saat upload plan actual di martahub"), cuma teks & aksi
 * tombolnya disesuaikan konteks Photobooth. */
function UploadSuccessScreen({ doneCount, errorCount, onDone, onUploadMore }) {
  const confetti = useMemo(() => {
    const colors = ["#ED1C24", "#F59E0B", "#15803D", "#2563EB", "#EC008C", "#7C3AED"];
    return Array.from({ length: 14 }, (_, i) => {
      const angle = (360 / 14) * i + (Math.random() * 22 - 11);
      const dist = 58 + Math.random() * 34;
      const rad = (angle * Math.PI) / 180;
      return {
        id: i,
        tx: Math.round(Math.cos(rad) * dist),
        ty: Math.round(Math.sin(rad) * dist),
        rot: Math.round(Math.random() * 360),
        delay: (Math.random() * 0.1).toFixed(2),
        size: 5 + Math.round(Math.random() * 3),
        color: colors[i % colors.length],
        round: i % 2 === 0,
      };
    });
  }, []);

  useEffect(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      [[880, now, 0.11], [1318.5, now + 0.1, 0.22]].forEach(([freq, start, dur]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.22, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + dur + 0.02);
      });
      const closeTimer = setTimeout(() => ctx.close().catch(() => {}), 700);
      return () => clearTimeout(closeTimer);
    } catch { /* best-effort - polesan, jangan sampai mengganggu alur */ }
  }, []);

  return (
    <div style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#F4F4F6", fontFamily: FONT, overflow: "hidden" }}>
      <div style={{ textAlign: "center", maxWidth: 340, width: "100%" }}>
        <div style={{ position: "relative", width: 108, height: 108, margin: "0 auto" }}>
          <div className="mh-success-ring" style={{ animationDelay: "0.05s" }} />
          <div className="mh-success-ring" style={{ animationDelay: "0.35s" }} />
          {confetti.map((c) => (
            <span key={c.id} className="mh-confetti"
              style={{
                "--tx": `${c.tx}px`, "--ty": `${c.ty}px`, "--rot": `${c.rot}deg`,
                animationDelay: `${c.delay}s`, width: c.size, height: c.size,
                background: c.color, borderRadius: c.round ? "50%" : "2px",
              }} />
          ))}
          <div className="mh-success-pop" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "linear-gradient(155deg, rgba(21,128,61,0.14), rgba(21,128,61,0.06))", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(21,128,61,0.18)" }}>
            <svg width="52" height="52" viewBox="0 0 52 52">
              <circle className="mh-success-circle" cx="26" cy="26" r="23" fill="none" stroke="#15803D" strokeWidth="2.5" strokeLinecap="round" />
              <path className="mh-success-tick" d="M15 27l7.5 7.5L37.5 18" fill="none" stroke="#15803D" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        <div className="mh-success-text" style={{ marginTop: 22, fontSize: 19, fontWeight: 800, color: "#17181C" }}>
          {doneCount > 1 ? `${doneCount} Foto Berhasil Diunggah!` : "Foto Berhasil Diunggah!"}
        </div>
        <div className="mh-success-text" style={{ marginTop: 8, fontSize: 13, color: "#6B6B76", lineHeight: 1.6, animationDelay: "0.08s" }}>
          Fotomu sudah tampil di layar Viewer - cari ID di bawah fotomu kalau mau cetak.
        </div>
        {errorCount > 0 && (
          <div style={{ marginTop: 14, display: "flex", alignItems: "flex-start", gap: 7, padding: "10px 12px", borderRadius: 11, background: "rgba(180,83,9,0.08)", textAlign: "left" }}>
            <AlertTriangle size={14} color="#B45309" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "#8A6D00", lineHeight: 1.45 }}>
              {errorCount} foto gagal diunggah - coba pilih ulang foto itu.
            </span>
          </div>
        )}
        <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={onUploadMore}
            style={{ width: "100%", height: 48, borderRadius: 12, border: "none", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontSize: 14, fontWeight: 800, fontFamily: FONT, cursor: "pointer" }}>
            Unggah Foto Lagi
          </button>
          <button onClick={onDone}
            style={{ width: "100%", height: 48, borderRadius: 12, border: "1.5px solid #E4E2EA", background: "#fff", color: "#5A5A68", fontSize: 14, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
            Selesai
          </button>
        </div>
      </div>
      <style>{`
        @keyframes mh-success-pop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }
        @keyframes mh-success-circle { from { stroke-dasharray: 145; stroke-dashoffset: 145; } to { stroke-dasharray: 145; stroke-dashoffset: 0; } }
        @keyframes mh-success-tick { from { stroke-dasharray: 34; stroke-dashoffset: 34; } to { stroke-dasharray: 34; stroke-dashoffset: 0; } }
        @keyframes mh-success-sonar { 0% { transform: scale(0.7); opacity: 0.55; } 100% { transform: scale(1.9); opacity: 0; } }
        @keyframes mh-confetti-burst { 0% { transform: translate(-50%,-50%) translate(0,0) rotate(0deg); opacity: 1; } 65% { opacity: 1; } 100% { transform: translate(-50%,-50%) translate(var(--tx), calc(var(--ty) + 30px)) rotate(var(--rot)); opacity: 0; } }
        @keyframes mh-success-text-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .mh-success-pop { animation: mh-success-pop 0.42s cubic-bezier(.34,1.56,.64,1) both; }
        .mh-success-circle { animation: mh-success-circle 0.55s 0.05s cubic-bezier(.65,0,.35,1) both; }
        .mh-success-tick { animation: mh-success-tick 0.35s 0.5s cubic-bezier(.65,0,.35,1) both; }
        .mh-success-ring { position: absolute; inset: 0; border-radius: 50%; border: 2px solid #15803D; animation: mh-success-sonar 1.3s cubic-bezier(0,.6,.4,1) both; }
        .mh-confetti { position: absolute; left: 50%; top: 50%; display: block; animation: mh-confetti-burst 0.85s 0.28s cubic-bezier(.25,.8,.4,1) both; }
        .mh-success-text { animation: mh-success-text-in 0.4s 0.5s ease both; }
      `}</style>
    </div>
  );
}

function Center({ children }) {
  return (
    <div style={{ minHeight: "100svh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#F4F4F6", fontFamily: FONT, padding: 20 }}>
      {children}
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}
