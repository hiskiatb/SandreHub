"use client";
/**
 * /marta/photobooth/go/[code] — link langsung QR/Link Upload dari panel
 * operator sudah membawa kode sesi, jadi tamu tidak perlu lewat pemilihan
 * di /marta/photobooth/go lagi. Redirect tipis ke halaman upload asli
 * (/marta/photobooth/upload/[code]) yg sudah punya UX unggah lengkap
 * (progress per-foto, layar sukses) - dipertahankan satu implementasi,
 * bukan digandakan, supaya tidak ada 2 salinan yg bisa diam-diam beda.
 */
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function RpvGoWithCode() {
  const params = useParams();
  const router = useRouter();
  const code = (params?.code || "").toString().toUpperCase();

  useEffect(() => {
    if (code) router.replace(`/marta/photobooth/upload/${code}`);
  }, [code, router]);

  return (
    <div style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F4F6" }}>
      <Loader2 size={24} color="#ED1C24" style={{ animation: "spin 1s linear infinite" }} />
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}
