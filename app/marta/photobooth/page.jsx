"use client";
/**
 * /marta/photobooth — panel utk fitur "Realtime Photo Viewer": bikin sesi
 * baru + daftar sesi yg sudah ada, tiap sesi punya link Upload (dibagikan ke
 * tamu/promotor lewat QR) dan link Viewer (layar besar di lokasi acara).
 * Diakses langsung dari kartu di /marta/login TANPA perlu login SandraHub
 * dulu (lihat catatan di useEffect di bawah) — konsisten dgn posisinya yg
 * ditaruh sejajar kartu "Login MartaHub Mobile" di halaman itu.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Camera, Loader2, Monitor, Plus, Upload, ArrowLeft } from "lucide-react";
import { createRpvSession } from "../../../lib/rpv";
import { supabaseMarta } from "../../../lib/supabaseMarta";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const RED = "#ED1C24";
const MAGA = "#C6168D";
const t = {
  bg: "#F4F4F6", card: "#FFFFFF", line: "#E4E2EA", hi: "#111116", mid: "#5A5A68", lo: "#8A8A96",
  fieldBg: "rgba(0,0,0,0.025)",
};

function siteOrigin() {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

export default function PhotoboothPanel() {
  const router = useRouter();
  const [ready] = useState(true);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [copied, setCopied] = useState("");

  // Panel ini cuma memanggil rpv_create_session (RPC) — untuk "daftar sesi
  // sebelumnya" kita simpan ringan di localStorage per-browser (bukan lewat
  // query tabel langsung, karena tabel rpv_sessions sengaja tidak dibuka ke
  // client — lihat marta_hub/rpv_schema.sql). Jadi daftar ini best-effort,
  // per perangkat yang dipakai membuat sesi.
  const loadRecent = () => {
    try {
      const raw = localStorage.getItem("rpv-sessions");
      setSessions(raw ? JSON.parse(raw) : []);
    } catch { setSessions([]); }
  };

  // Panel ini SENGAJA tidak dikunci login SandraHub — ditaruh sebagai akses
  // cepat di halaman /marta/login (sebelum masuk akun) supaya panitia bisa
  // langsung bikin sesi photobooth tanpa harus login dulu. Data yg dibuat
  // cuma kode sesi + foto acara, bukan data sensitif SPM.
  useEffect(() => {
    loadRecent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveRecent = (list) => {
    setSessions(list);
    try { localStorage.setItem("rpv-sessions", JSON.stringify(list)); } catch {}
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const s = await createRpvSession(title);
      if (!s) throw new Error("Gagal membuat sesi.");
      const next = [{ code: s.code, title: s.title, created_at: new Date().toISOString() }, ...sessions].slice(0, 20);
      saveRecent(next);
      setTitle("");
    } catch (e) {
      alert(e.message || "Gagal membuat sesi photobooth.");
    } finally { setCreating(false); }
  };

  const copy = (text, key) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1400);
  };

  if (!ready) {
    return (
      <div style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center", background: t.bg }}>
        <Loader2 size={26} color={RED} style={{ animation: "spin 1s linear infinite" }} />
        <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100svh", background: t.bg, fontFamily: FONT, padding: "28px 20px 60px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <button onClick={() => router.push("/martahub")} style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${t.line}`, borderRadius: 10, padding: "8px 14px", cursor: "pointer", color: t.mid, fontSize: 13, fontWeight: 600, fontFamily: FONT, marginBottom: 20 }}>
          <ArrowLeft size={14} /> Kembali ke MartaHub
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
          <span style={{ width: 46, height: 46, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", boxShadow: "0 4px 14px rgba(237,28,36,0.28)" }}>
            <Camera size={22} />
          </span>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: t.hi, letterSpacing: "-0.02em" }}>Realtime Photo Viewer</div>
            <div style={{ fontSize: 12.5, color: t.mid, marginTop: 2 }}>Photobooth dgn upload dari galeri, layar viewer realtime, QR download &amp; cetak by ID</div>
          </div>
        </div>

        {/* Bikin sesi baru */}
        <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, padding: 20, marginBottom: 22, boxShadow: "0 1px 3px rgba(13,17,23,0.05)" }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: t.hi, marginBottom: 10 }}>Buat Sesi Baru</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nama acara (mis. Gathering Promotor Medan)"
              onKeyDown={(e) => e.key === "Enter" && !creating && handleCreate()}
              style={{ flex: "1 1 260px", height: 44, padding: "0 14px", borderRadius: 10, border: `1.5px solid ${t.line}`, background: t.fieldBg, fontSize: 13.5, fontFamily: FONT, color: t.hi, outline: "none" }} />
            <button onClick={handleCreate} disabled={creating}
              style={{ height: 44, padding: "0 18px", borderRadius: 10, border: "none", background: creating ? `${RED}66` : `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontWeight: 700, fontSize: 13.5, display: "flex", alignItems: "center", gap: 7, cursor: creating ? "not-allowed" : "pointer", fontFamily: FONT }}>
              {creating ? <Loader2 size={15} style={{ animation: "spin .8s linear infinite" }} /> : <Plus size={15} />} Buat Sesi
            </button>
          </div>
        </div>

        {/* Daftar sesi (di perangkat ini) */}
        <div style={{ fontSize: 12.5, fontWeight: 700, color: t.mid, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Sesi dibuat di perangkat ini
        </div>
        {sessions.length === 0 && (
          <div style={{ padding: "30px 0", textAlign: "center", color: t.lo, fontSize: 13 }}>Belum ada sesi. Buat satu di atas untuk mulai.</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sessions.map((s) => (
            <motion.div key={s.code} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: "14px 16px", boxShadow: "0 1px 2px rgba(13,17,23,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.hi }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: t.lo, marginTop: 2, fontFamily: "monospace", letterSpacing: "0.06em" }}>KODE SESI: {s.code}</div>
                </div>
                {/* FIX: fitur ini disederhanakan jadi CUMA 2 menu inti -
                    Viewer & Upload (halaman Download terpisah dibuang -
                    download per-foto sekarang lewat halaman detail yg
                    dibuka dari QR di tiap foto pada layar Viewer, jadi
                    halaman download-semua terpisah sudah tidak perlu). */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => copy(`${siteOrigin()}/marta/photobooth/upload/${s.code}`, `u-${s.code}`)}
                    style={btnGhost}><Upload size={13} /> {copied === `u-${s.code}` ? "Tersalin!" : "Link Upload"}</button>
                  <button onClick={() => window.open(`/marta/photobooth/viewer/${s.code}`, "_blank")}
                    style={btnGhost}><Monitor size={13} /> Buka Viewer</button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
      <style>{"button{transition:opacity .14s} button:hover:not(:disabled){opacity:.85}"}</style>
    </div>
  );
}

const btnGhost = {
  display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 9,
  border: "1px solid #E4E2EA", background: "#fff", color: "#5A5A68", fontSize: 12, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit",
};
