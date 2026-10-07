export const metadata = {
  title: "Pendataan Outlet",
  description: "Pendataan outlet & foto etalase/tampak depan - North Sumatra Retail Competition (MartaHub).",
  manifest: "/marta/audit-outlet/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    // "black" (OPAQUE, bukan "black-translucent") - sebelumnya translucent
    // bikin status bar nunjukin gradient Header di belakangnya, TAPI iOS
    // nambahin scrim/overlay legibility yg warnanya IKUT ADAPT ke light/
    // dark mode device (gelap pas device dark mode, pucat/putih pas device
    // light mode) - user gak mau warnanya ikut2an berubah begitu. "black"
    // = status bar SELALU solid hitam polos, konsisten di light/dark mode
    // apapun, gak nyambung ke konten di belakangnya sama sekali (viewport
    // konten otomatis dimulai di bawah status bar, bukan di belakangnya).
    statusBarStyle: "black",
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
