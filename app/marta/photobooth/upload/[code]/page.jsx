"use client";
/**
 * /marta/photobooth/upload/[code] — halaman PUBLIK (tanpa login), dibuka
 * tamu lewat link/QR yang dibagikan panitia. Sangat responsive utk mobile:
 * pilih foto dari galeri (bisa multi), preview, upload ke sesi, lalu
 * tunjukkan tiket klaim (ID) tiap foto utk dipakai cetak di layar Viewer.
 */
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Camera, Check, ImagePlus, Loader2, Ticket, X } from "lucide-react";
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
  const [queue, setQueue] = useState([]); // { id, file, previewUrl, status, photoCode, error }

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
    const items = files.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file, previewUrl: URL.createObjectURL(file), status: "pending", photoCode: null, error: "",
    }));
    setQueue((q) => [...items, ...q]);
    items.forEach(uploadOne);
    e.target.value = ""; // supaya bisa pilih file yg sama lagi kalau perlu
  };

  const uploadOne = async (item) => {
    setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "uploading" } : x)));
    try {
      const { photoCode } = await uploadRpvPhoto(code, item.file);
      setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "done", photoCode } : x)));
    } catch (e) {
      setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "error", error: e.message || "Gagal unggah" } : x)));
    }
  };

  const removeItem = (id) => setQueue((q) => q.filter((x) => x.id !== id));

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

  const doneCount = queue.filter((x) => x.status === "done").length;

  return (
    <div style={{ minHeight: "100svh", background: "#F4F4F6", fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "20px 18px 14px", background: "#fff", borderBottom: "1px solid #E4E2EA", position: "sticky", top: 0, zIndex: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 38, height: 38, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", flexShrink: 0 }}>
            <Camera size={18} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#111116", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session?.title}</div>
            <div style={{ fontSize: 11.5, color: "#8A8A96" }}>Kode sesi: {code} · Unggah foto dari galeri kamu</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, padding: "18px 16px 100px", maxWidth: 520, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPick} style={{ display: "none" }} />

        <button onClick={() => fileRef.current?.click()}
          style={{ width: "100%", height: 120, borderRadius: 18, border: "2px dashed rgba(237,28,36,0.35)", background: "rgba(237,28,36,0.05)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", color: RED, fontFamily: FONT }}>
          <ImagePlus size={28} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>Pilih Foto dari Galeri</span>
          <span style={{ fontSize: 11.5, color: "#8A8A96" }}>Bisa pilih beberapa foto sekaligus</span>
        </button>

        {queue.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#5A5A68", marginBottom: 10 }}>{doneCount}/{queue.length} foto terunggah</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 10 }}>
              {queue.map((it) => (
                <div key={it.id} style={{ position: "relative", borderRadius: 12, overflow: "hidden", aspectRatio: "1/1", background: "#E4E2EA" }}>
                  <img src={it.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,0) 55%,rgba(0,0,0,0.6) 100%)", display: "flex", alignItems: "flex-end", padding: 7 }}>
                    {it.status === "uploading" && <Loader2 size={13} color="#fff" style={{ animation: "spin .8s linear infinite" }} />}
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
                    <span style={{ position: "absolute", top: 5, left: 5, width: 20, height: 20, borderRadius: 999, background: "#16A34A", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Check size={11} color="#fff" strokeWidth={3} />
                    </span>
                  )}
                </div>
              ))}
            </div>

            {doneCount > 0 && (
              <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 12, background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.25)", fontSize: 12.5, color: "#166534", lineHeight: 1.5 }}>
                Simpan/screenshot <b>ID foto</b> (angka di bawah tiap foto) — tunjukkan/ketik ID itu di layar Viewer utk mencetak fotomu.
              </div>
            )}
          </div>
        )}
      </div>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box}"}</style>
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
