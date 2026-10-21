/**
 * Layout utk SEMUA halaman publik /martahub/public/** (mis. link share DTU
 * tanpa login). Tujuannya CUMA satu: set viewport yg sama dgn app ber-login
 * (app/martahub/m/layout.jsx) supaya tap di field input/select TIDAK bikin
 * laman auto-zoom di iOS/Android (browser mobile otomatis zoom in kalau
 * halaman tidak declare maximumScale/userScalable, atau kalau font-size
 * input < 16px dan browser override viewport-nya sendiri).
 */
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function MartaHubPublicLayout({ children }) {
  return children;
}
