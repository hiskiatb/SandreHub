export const metadata = {
  title: "MartaHub",
  description: "Plan, check-in & laporan aktivitas marketing lapangan BME/RGE Sumatera — MartaHub.",
  manifest: "/martahub/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    // "black-translucent" bikin status bar iOS transparan & konten boleh
    // gambar sampai balik layar (dipadukan padding safe-area di tiap
    // screen) — supaya notch/status bar terisi warna app, bukan hitam.
    statusBarStyle: "black-translucent",
    title: "MartaHub",
  },
  icons: {
    icon: [{ url: "/martahub/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/martahub/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // "cover" = wajib supaya env(safe-area-inset-*) terisi nilai asli notch/
  // status bar/gesture-bar perangkat — dipadukan background full-bleed +
  // padding aman per-screen (lihat MobileShell.jsx & tiap halaman) supaya
  // notch/status bar terisi warna app, konten tidak pernah ketutupan.
  viewportFit: "cover",
  themeColor: "#F4F5F7",
};

// Layout ini HANYA membungkus /martahub/m/** (login, verify, home, activities,
// dst) — TIDAK /martahub/** lain (dashboard admin/TMV web biasa), karena
// segmen `m` ini folder terpisah di App Router (app/martahub/m/layout.jsx),
// bukan app/martahub/layout.jsx.
export default function MartaMobileLayout({ children }) {
  return (
    <>
      {/* Paksa background terang + matikan overscroll bounce SELAMA di
          /martahub/m, apapun tema device/dashboard (sama alasan dgn
          app/promotor/layout.jsx) — lepas otomatis begitu keluar. */}
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
