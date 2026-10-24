"use client";
/**
 * /marta/photobooth/go/[code] — link langsung QR/Link Upload dari panel
 * operator sudah membawa kode sesi, jadi tamu tidak perlu lewat pemilihan
 * di /marta/photobooth/go lagi. Redirect tipis ke halaman upload asli yg
 * sudah punya UX unggah lengkap (progress per-foto, layar sukses) -
 * dipertahankan satu implementasi, bukan digandakan, supaya tidak ada 2
 * salinan yg bisa diam-diam beda.
 *
 * UPDATE (fitur "Frame Langsung" - tamu pilih frame & jepret/upload foto
 * TANPA lewat prompt AI/Gemini): sesi sekarang punya `mode` ('ai_prompt'
 * default / 'direct_frame', diatur operator lewat panel - lihat
 * setRpvSessionMode di lib/rpv.js). Redirect di sini baca mode itu DULU
 * sebelum menentukan tujuan - 'ai_prompt' tetap ke /upload/[code]/prompt
 * (alur lama, tidak berubah), 'direct_frame' ke /upload/[code] (alur
 * kamera/galeri langsung + pilih frame) - jadi operator cukup atur mode
 * sesi sekali, QR/link yang dibagikan otomatis ke halaman yang benar.
 */
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getRpvSession } from "../../../../../lib/rpv";

export default function RpvGoWithCode() {
  const params = useParams();
  const router = useRouter();
  const code = (params?.code || "").toString().toUpperCase();

  useEffect(() => {
    if (!code) return;
    (async () => {
      let mode = "ai_prompt";
      try {
        const s = await getRpvSession(code);
        if (s?.mode === "direct_frame") mode = "direct_frame";
      } catch { /* gagal baca mode - fallback ke alur AI (perilaku lama) di bawah */ }
      const dest = mode === "direct_frame" ? `/marta/photobooth/upload/${code}` : `/marta/photobooth/upload/${code}/prompt`;
      router.replace(dest);
    })();
  }, [code, router]);

  return (
    <div style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F4F6" }}>
      <Loader2 size={24} color="#ED1C24" style={{ animation: "spin 1s linear infinite" }} />
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}
