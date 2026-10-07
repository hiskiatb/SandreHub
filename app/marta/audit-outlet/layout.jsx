export const metadata = {
  title: "Pendataan Outlet",
  description: "Pendataan outlet & foto etalase/tampak depan - North Sumatra Retail Competition (MartaHub).",
  manifest: "/marta/audit-outlet/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    // "black-translucent" - sama pola dgn app/martahub/m/layout.jsx, biar
    // status bar iOS transparan & gradient Header nutup sampai belakang
    // notch (dipadukan padding env(safe-area-inset-top) di Header).
    statusBarStyle: "black-translucent",
    title: "Pendataan Outlet",
  },
  icons: {
    icon: [{ url: "/marta/audit-outlet/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/marta/audit-outlet/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // userScalable:false + maximumScale:1 - matikan auto-zoom browser saat
  // user tap kolom form (selain itu semua input juga sudah font-size>=16px,
  // karena iOS Safari auto-zoom kalau salah satu dari dua ini tidak dipenuhi).
  userScalable: false,
  // "cover" wajib supaya env(safe-area-inset-top) keisi nilai asli notch/
  // status bar, dipadukan padding-top aman di Header (lihat isi/page.jsx)
  // supaya gradient background ikut nutup sampai belakang notch/status bar
  // - sebelumnya area itu tetap putih polos karena viewport-fit:cover belum
  // pernah dideklarasikan utk route /marta/audit-outlet/**.
  viewportFit: "cover",
  themeColor: "#EC0B6F",
};

export default function AuditOutletLayout({ children }) {
  return children;
}
