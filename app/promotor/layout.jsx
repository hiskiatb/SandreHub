export const metadata = {
  title: "PTS",
  description: "Promotor Tracking System — SandraHub",
  manifest: "/promotor/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    // "black-translucent" bikin status bar iOS transparan & konten boleh
    // gambar sampai balik layar (dipadukan padding safe-area di tiap
    // screen) — supaya notch/status bar terisi warna app, bukan hitam.
    statusBarStyle: "black-translucent",
    title: "PTS",
  },
  icons: {
    icon: [{ url: "/promotor/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/promotor/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // "cover" = wajib supaya env(safe-area-inset-*) terisi nilai asli notch/
  // status bar/gesture-bar perangkat (default browser tidak set ini, jadi
  // semua padding safe-area di app selama ini efektif 0 pada banyak HP).
  // Dipadukan dengan background full-bleed + padding aman per-screen supaya
  // notch/status bar terisi warna app (bukan hitam) tapi konten tidak
  // pernah ketutupan.
  viewportFit: "cover",
  themeColor: "#F4F5F7",
};

export default function PromotorLayout({ children }) {
  return (
    <>
      {/* App Promotor cuma didesain untuk tema terang — tapi <body> global
          (globals.css) ikut `prefers-color-scheme: dark` DAN `data-theme`
          dari localStorage dashboard (bisa "dark" kalau admin pernah pakai
          dashboard dalam mode gelap di HP/browser yang sama). Kalau device
          promotor sedang dark mode, --background jadi hampir hitam
          (#0A0A0B) — begitu overscroll/rubber-band atau ada celah render di
          bawah konten (mis. halaman pendek), warna hitam itu yang terlihat,
          kesannya app "tidak fullscreen". Paksa background terang + matikan
          overscroll bounce SELAMA di /promotor, apapun tema device/dashboard.
          Style ini otomatis lepas begitu keluar dari /promotor. */}
      <style>{`
        html, body {
          background: #F4F5F7 !important;
          overscroll-behavior-y: none;
        }
      `}</style>
      {children}
    </>
  );
}
