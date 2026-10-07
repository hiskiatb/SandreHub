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
  // Form ini light mode saja, jangan ikut dark mode device sama sekali -
  // kalau tidak, native UI browser (keyboard, dropdown/select bawaan, dll)
  // ikut gelap pas device di-set dark mode, padahal konten form-nya sendiri
  // tetap terang -> muncul bagian hitam yg nabrak (lihat laporan user
  // "bagian hitam saat pemilihan outlet").
  colorScheme: "light",
  // Default Android Chrome (& sejumlah browser lain) itu "resizes-visual" -
  // begitu keyboard muncul, HANYA visualViewport yg menyusut, layout
  // viewport (jadi tinggi halaman kita) TETAP PENUH. Akibatnya browser
  // cuma men-scroll input yg difokus biar kelihatan di atas keyboard, TAPI
  // sisa halaman di bawahnya (yg sebenarnya ketutup keyboard) masih
  // "ada" secara layout - kalau timing resize `visualViewport` kita
  // (hook `vh` di isi/page.jsx) kepotong/telat, nongol spasi kosong warna
  // BG nganggur persis di atas keyboard (laporan user utk SEMUA field teks:
  // Nama Sender, Nama Outlet, Site ID, Social Media, dst). "resizes-content"
  // bikin browser BENERAN menyusutkan layout viewport (bukan cuma visual)
  // pas keyboard muncul, jadi container fixed kita otomatis pas tanpa
  // nunggu JS - lebih konsisten di semua field, bukan cuma 1-2 field.
  interactiveWidget: "resizes-content",
};

export default function AuditOutletLayout({ children }) {
  return children;
}
