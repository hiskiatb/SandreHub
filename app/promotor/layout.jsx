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
  return children;
}
